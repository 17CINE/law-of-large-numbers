"use client";

import {
  buildCheckpoints,
  effectiveTrials,
  sanitizeIterations,
} from "@/lib/checkpoints";
import { getDescriptor, RNG_DESCRIPTORS } from "@/lib/rng";
import type { BitOrder, RngId } from "@/lib/rng/types";
import type { AlgorithmResult, Checkpoint, WorkerMessage } from "@/lib/types";

/**
 * The single source of truth for the app: one `useReducer`.
 *
 * Nothing in here knows about the worker; the worker hook in
 * `src/hooks/useSimulationWorker.ts` turns `postMessage` traffic into the
 * `worker/*` actions below.
 */

export type RunStatus = "idle" | "running" | "done" | "error";

export interface SimulationState {
  // ---- configuration ----
  selectedRngIds: RngId[];
  /** Validated iteration count. */
  iterations: number;
  /** Raw text of the custom iteration field, so partial input is allowed. */
  iterationsText: string;
  iterationsError: string | null;
  seed: number;
  trials: number;
  /** Raw text of the trials field, so partial input is allowed. */
  trialsText: string;
  trialsError: string | null;
  bitOrder: BitOrder;
  /** Which algorithm the distribution chart is showing. */
  focusRngId: RngId;

  // ---- run state ----
  status: RunStatus;
  runId: number;
  progress: number;
  progressLabel: string;
  /** Finished runs, keyed by algorithm. */
  results: Partial<Record<RngId, AlgorithmResult>>;
  /** In-flight checkpoint data, keyed by algorithm. */
  partialPoints: Partial<Record<RngId, Checkpoint[]>>;
  totalRuntimeMs: number;
  error: string | null;
}

export const DEFAULT_SEED = 0x5eed_1234;

export const initialState: SimulationState = {
  selectedRngIds: ["math-random", "mulberry32", "randu"],
  iterations: 100_000,
  iterationsText: "100000",
  iterationsError: null,
  seed: DEFAULT_SEED,
  trials: 200,
  trialsText: "200",
  trialsError: null,
  bitOrder: "high",
  focusRngId: "mulberry32",
  status: "idle",
  runId: 0,
  progress: 0,
  progressLabel: "Idle",
  results: {},
  partialPoints: {},
  totalRuntimeMs: 0,
  error: null,
};

export type SimulationAction =
  | { type: "toggleRng"; id: RngId }
  | { type: "setRngSelection"; ids: RngId[] }
  | { type: "setIterationsPreset"; value: number }
  | { type: "setIterationsText"; value: string }
  | { type: "commitIterations" }
  | { type: "setSeed"; value: number }
  | { type: "randomizeSeed" }
  | { type: "setTrialsText"; value: string }
  | { type: "commitTrials" }
  | { type: "setBitOrder"; value: BitOrder }
  | { type: "setFocusRng"; id: RngId }
  | { type: "start" }
  | { type: "reset" }
  | { type: "worker/message"; message: WorkerMessage }
  | { type: "worker/crashed"; message: string };

/** Keeps `focusRngId` pointing at something that is actually on screen. */
function resolveFocus(selected: readonly RngId[], current: RngId): RngId {
  return selected.includes(current) ? current : (selected[0] ?? "mulberry32");
}

export function simulationReducer(
  state: SimulationState,
  action: SimulationAction,
): SimulationState {
  switch (action.type) {
    case "toggleRng": {
      const selected = state.selectedRngIds.includes(action.id)
        ? state.selectedRngIds.filter((id) => id !== action.id)
        : [...state.selectedRngIds, action.id];
      // Keep the canonical registry order so colours never shuffle around.
      const ordered = RNG_DESCRIPTORS.map((d) => d.id).filter((id) =>
        selected.includes(id),
      );
      return {
        ...state,
        selectedRngIds: ordered,
        focusRngId: resolveFocus(ordered, state.focusRngId),
      };
    }

    case "setRngSelection": {
      const ordered = RNG_DESCRIPTORS.map((d) => d.id).filter((id) =>
        action.ids.includes(id),
      );
      return {
        ...state,
        selectedRngIds: ordered,
        focusRngId: resolveFocus(ordered, state.focusRngId),
      };
    }

    case "setIterationsPreset": {
      return {
        ...state,
        iterations: action.value,
        iterationsText: String(action.value),
        iterationsError: null,
      };
    }

    case "setIterationsText": {
      const digits = action.value.replace(/[^\d]/g, "");
      const parsed = digits === "" ? Number.NaN : Number.parseInt(digits, 10);
      const error =
        parsed === undefined || Number.isNaN(parsed)
          ? null
          : parsed < 1
            ? "Must be at least 1 flip."
            : parsed > 50_000_000
              ? "The ceiling is 50,000,000 flips."
              : null;
      return {
        ...state,
        iterationsText: digits,
        iterationsError: error,
        iterations: Number.isNaN(parsed) ? state.iterations : parsed,
      };
    }

    case "commitIterations": {
      const parsed = Number.parseInt(state.iterationsText, 10);
      if (Number.isNaN(parsed)) {
        // Put the last good value back rather than complaining about an empty
        // box: the field now shows something valid, so there is no error to
        // report.
        return {
          ...state,
          iterationsText: String(state.iterations),
          iterationsError: null,
        };
      }
      return {
        ...state,
        iterations: sanitizeIterations(parsed),
        iterationsText: String(sanitizeIterations(parsed)),
        iterationsError: null,
      };
    }

    case "setSeed": {
      const value = Number.isFinite(action.value)
        ? Math.trunc(action.value) >>> 0
        : state.seed;
      return { ...state, seed: value };
    }

    case "randomizeSeed": {
      const random = new Uint32Array(1);
      globalThis.crypto?.getRandomValues(random);
      return { ...state, seed: random[0] ?? state.seed };
    }

    case "setTrialsText": {
      const digits = action.value.replace(/[^\d]/g, "");
      const parsed = digits === "" ? Number.NaN : Number.parseInt(digits, 10);
      const error = Number.isNaN(parsed)
        ? null
        : parsed < 1
          ? "At least 1 trial."
          : parsed > 10_000
            ? "The ceiling is 10,000 trials."
            : null;
      return {
        ...state,
        trialsText: digits,
        trialsError: error,
        trials: Number.isNaN(parsed) ? state.trials : parsed,
      };
    }

    case "commitTrials": {
      const parsed = Number.parseInt(state.trialsText, 10);
      if (Number.isNaN(parsed)) {
        return { ...state, trialsError: "Enter a whole number of trials." };
      }
      const clamped = Math.max(1, Math.min(10_000, parsed));
      return {
        ...state,
        trials: clamped,
        trialsText: String(clamped),
        trialsError: null,
      };
    }

    case "setBitOrder":
      return { ...state, bitOrder: action.value };

    case "setFocusRng":
      return { ...state, focusRngId: action.id };

    case "start":
      return {
        ...state,
        status: "running",
        runId: state.runId + 1,
        progress: 0,
        progressLabel: "Starting…",
        results: {},
        partialPoints: {},
        totalRuntimeMs: 0,
        error: null,
      };

    case "reset":
      return {
        ...initialState,
        // Configuration is a user preference, not run output: keep it. The raw
        // text fields must travel with their parsed values or the inputs snap
        // back to the defaults while the state disagrees with what is typed.
        selectedRngIds: state.selectedRngIds,
        iterations: state.iterations,
        iterationsText: state.iterationsText,
        iterationsError: null,
        seed: state.seed,
        trials: state.trials,
        trialsText: state.trialsText,
        trialsError: null,
        bitOrder: state.bitOrder,
        focusRngId: state.focusRngId,
      };

    case "worker/message":
      return applyWorkerMessage(state, action.message);

    case "worker/crashed":
      return {
        ...state,
        status: "error",
        progressLabel: "Stopped",
        error: action.message,
      };
  }
}

function applyWorkerMessage(
  state: SimulationState,
  message: WorkerMessage,
): SimulationState {
  // Ignore anything belonging to a superseded run.
  if (message.runId !== state.runId) {
    return state;
  }

  switch (message.type) {
    case "progress": {
      const name = getDescriptor(message.algorithm).shortName;
      return {
        ...state,
        progress: Math.min(1, message.fraction),
        progressLabel:
          message.phase === "main"
            ? `Flipping coins with ${name}…`
            : `${name}: trial ${message.trialsDone ?? 0} of the histogram runs…`,
      };
    }

    case "partial": {
      if (state.results[message.rngId]) {
        return state; // a finished result supersedes its own partials
      }
      return {
        ...state,
        partialPoints: {
          ...state.partialPoints,
          [message.rngId]: message.points,
        },
      };
    }

    case "result": {
      const partialPoints = { ...state.partialPoints };
      delete partialPoints[message.result.series.rngId];
      return {
        ...state,
        results: {
          ...state.results,
          [message.result.series.rngId]: message.result,
        },
        partialPoints,
      };
    }

    case "done":
      return {
        ...state,
        status: "done",
        progress: 1,
        progressLabel: "Done",
        totalRuntimeMs: message.totalRuntimeMs,
      };

    case "error":
      // Cancelling is a normal outcome, not a failure: the UI returns to a
      // re-runnable state and keeps whatever partial results were streamed, so
      // an interrupted long run is not thrown away.
      return message.cancelled === true
        ? {
            ...state,
            status: "idle",
            progressLabel: "Cancelled",
            error: null,
          }
        : {
            ...state,
            status: "error",
            progressLabel: "Stopped",
            error: message.message,
          };
  }
}

// ---------------------------------------------------------------------------
// Derived helpers used by both the UI and the worker hook
// ---------------------------------------------------------------------------

/** Trials that actually fit the flip budget, plus a note when it differs. */
export function trialsForRun(state: SimulationState): {
  trials: number;
  cappedFrom: number | null;
} {
  const effective = effectiveTrials(state.iterations, state.trials);
  return {
    trials: effective,
    cappedFrom: effective < state.trials ? state.trials : null,
  };
}

export function checkpointsForRun(state: SimulationState): number[] {
  return buildCheckpoints(state.iterations);
}

export function estimateFlips(state: SimulationState): number {
  const { trials } = trialsForRun(state);
  return state.iterations * trials * state.selectedRngIds.length;
}

/** True when at least one selected generator accepts a seed. */
export function seedApplies(state: SimulationState): boolean {
  return state.selectedRngIds.some((id) => getDescriptor(id).seedable);
}
