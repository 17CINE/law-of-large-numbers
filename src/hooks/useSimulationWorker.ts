"use client";

import { useCallback, useEffect, useRef } from "react";

import type { MainThreadMessage, WorkerMessage } from "@/lib/types";
import {
  checkpointsForRun,
  type SimulationAction,
  type SimulationState,
  trialsForRun,
} from "@/store/simulation-store";

/**
 * Owns the simulation worker for the lifetime of the page.
 *
 * The worker is created lazily on mount (client only) and reused for every run
 * — creating one per run would mean re-downloading the bundler's worker chunk
 * and losing the JIT's warm-up, which is exactly what the runtime column
 * measures.
 */
export function useSimulationWorker(
  state: SimulationState,
  dispatch: React.Dispatch<SimulationAction>,
): { run: () => void; cancel: () => void; busy: boolean } {
  const workerRef = useRef<Worker | null>(null);
  const busy = state.status === "running";

  useEffect(() => {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return;
    }
    const worker = new Worker(
      new URL("../workers/simulate.worker.ts", import.meta.url),
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      dispatch({ type: "worker/message", message: event.data });
    };
    worker.onerror = (event: ErrorEvent) => {
      dispatch({
        type: "worker/crashed",
        message: event.message || "The simulation worker crashed.",
      });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [dispatch]);

  const send = useCallback((message: MainThreadMessage) => {
    workerRef.current?.postMessage(message);
  }, []);

  const run = useCallback(() => {
    if (workerRef.current === null || state.selectedRngIds.length === 0) {
      return;
    }
    const { trials, cappedFrom } = trialsForRun(state);
    if (cappedFrom !== null) {
      // Surface the automatic downgrade; silently running fewer experiments
      // would make the histogram disagree with the control the user set.
      console.info(
        `[simulation] ${cappedFrom} trials requested, running ${trials} to stay inside the flip budget.`,
      );
    }
    dispatch({ type: "start" });
    // `dispatch` bumps `runId`; the worker echoes it so stale replies are
    // dropped by the reducer.
    send({
      type: "run",
      runId: state.runId + 1,
      rngIds: state.selectedRngIds,
      iterations: state.iterations,
      seed: state.seed,
      trials,
      bitOrder: state.bitOrder,
      checkpoints: checkpointsForRun(state),
    });
  }, [dispatch, send, state]);

  const cancel = useCallback(() => {
    send({ type: "cancel", runId: state.runId });
  }, [send, state.runId]);

  return { run, cancel, busy };
}
