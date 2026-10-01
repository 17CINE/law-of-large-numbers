import { describe, expect, test } from "vitest";

import { MAX_FLIPS, MIN_FLIPS } from "@/lib/checkpoints";
import { RNG_IDS } from "@/lib/rng";
import type { RngId } from "@/lib/rng/types";
import type { AlgorithmResult, WorkerMessage } from "@/lib/types";
import {
  checkpointsForRun,
  DEFAULT_SEED,
  estimateFlips,
  initialState,
  type SimulationAction,
  type SimulationState,
  simulationReducer,
  trialsForRun,
} from "./simulation-store";

const reduce = (
  state: SimulationState,
  ...actions: SimulationAction[]
): SimulationState => actions.reduce(simulationReducer, state);

const message = (msg: WorkerMessage): SimulationAction => ({
  type: "worker/message",
  message: msg,
});

/** A finished result with only the fields the reducer reads. */
function fakeResult(rngId: RngId): AlgorithmResult {
  return {
    series: {
      rngId,
      points: [
        { n: 1, heads: 1 },
        { n: 2, heads: 1 },
      ],
      totalHeads: 1,
      decileHeads: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      chiSquare: { statistic: 0.4, pValue: 0.99, degreesOfFreedom: 9 },
      runtimeMs: 12,
      longestRun: 1,
      maxAbsZ: 0.2,
    },
    histogram: {
      rngId,
      edges: [0, 1, 2, 3],
      counts: [1, 1, 0],
      trials: 2,
      mean: 0.5,
      stdDev: Math.SQRT1_2,
      runtimeMs: 3,
    },
    z: 0.2,
    proportion: 0.5,
    chiSquare: { statistic: 0.4, pValue: 0.99, degreesOfFreedom: 9 },
  };
}

describe("selection", () => {
  test("keeps registry order so chart colours never shuffle", () => {
    const next = reduce(initialState, { type: "setRngSelection", ids: [] });
    const withAll = reduce(next, {
      type: "setRngSelection",
      ids: [...RNG_IDS].reverse(),
    });
    expect(withAll.selectedRngIds).toEqual([...RNG_IDS]);
  });

  test("toggling keeps the focus valid", () => {
    const focused = reduce(initialState, { type: "setFocusRng", id: "randu" });
    const deselected = reduce(focused, { type: "toggleRng", id: "randu" });
    expect(deselected.focusRngId).not.toBe("randu");
    expect(deselected.selectedRngIds).toContain(deselected.focusRngId);
  });

  test("an empty selection still resolves a focus", () => {
    const empty = reduce(initialState, {
      type: "setRngSelection",
      ids: [],
    });
    expect(empty.focusRngId).toBe("mulberry32");
  });
});

describe("numeric inputs", () => {
  test("strips non-digits and reports out-of-range values", () => {
    const digits = reduce(initialState, {
      type: "setIterationsText",
      value: "1,0a0 000",
    });
    expect(digits.iterationsText).toBe("100000");
    expect(digits.iterationsError).toBeNull();

    const zero = reduce(initialState, {
      type: "setIterationsText",
      value: "0",
    });
    expect(zero.iterationsError).toBe("Must be at least 1 flip.");

    const huge = reduce(initialState, {
      type: "setIterationsText",
      value: String(MAX_FLIPS + 1),
    });
    expect(huge.iterationsError).not.toBeNull();
  });

  test("an empty field keeps the last good value and shows no error yet", () => {
    const cleared = reduce(initialState, {
      type: "setIterationsText",
      value: "",
    });
    expect(cleared.iterationsText).toBe("");
    expect(cleared.iterationsError).toBeNull();
    expect(cleared.iterations).toBe(initialState.iterations);
  });

  test("committing clamps and normalises the text", () => {
    const typed = reduce(
      initialState,
      { type: "setIterationsText", value: String(MAX_FLIPS + 500) },
      { type: "commitIterations" },
    );
    expect(typed.iterations).toBe(MAX_FLIPS);
    expect(typed.iterationsText).toBe(String(MAX_FLIPS));
    expect(typed.iterationsError).toBeNull();
  });

  test("committing an empty field restores the previous value", () => {
    const recovered = reduce(
      initialState,
      { type: "setIterationsText", value: "" },
      { type: "commitIterations" },
    );
    expect(recovered.iterationsText).toBe(String(initialState.iterations));
    expect(recovered.iterationsError).toBeNull();
  });

  test("iterations never drop below one flip", () => {
    expect(
      reduce(initialState, { type: "setIterationsText", value: "0" })
        .iterations,
    ).toBe(0);
    const committed = reduce(
      initialState,
      { type: "setIterationsText", value: "0" },
      { type: "commitIterations" },
    );
    expect(committed.iterations).toBe(MIN_FLIPS);
  });

  test("the seed is a uint32", () => {
    const negative = reduce(initialState, { type: "setSeed", value: -1 });
    expect(negative.seed).toBe(0xffff_ffff);
    expect(reduce(initialState, { type: "setSeed", value: 1.9 }).seed).toBe(1);
    expect(
      reduce(initialState, { type: "setSeed", value: Number.NaN }).seed,
    ).toBe(DEFAULT_SEED);
  });

  test("randomizeSeed changes the seed", () => {
    const randomized = reduce(initialState, { type: "randomizeSeed" });
    expect(Number.isInteger(randomized.seed)).toBe(true);
    expect(randomized.seed).toBeGreaterThanOrEqual(0);
  });

  test("trials clamp on commit", () => {
    const clamped = reduce(
      initialState,
      { type: "setTrialsText", value: "99999" },
      { type: "commitTrials" },
    );
    expect(clamped.trials).toBe(10_000);
    expect(clamped.trialsText).toBe("10000");
  });
});

describe("run lifecycle", () => {
  test("start bumps the run id and clears previous output", () => {
    const dirty = reduce(
      initialState,
      { type: "start" },
      message({
        type: "result",
        runId: 1,
        result: fakeResult("mulberry32"),
      }),
    );
    const restarted = reduce(dirty, { type: "start" });
    expect(restarted.runId).toBe(2);
    expect(restarted.results).toEqual({});
    expect(restarted.partialPoints).toEqual({});
    expect(restarted.progress).toBe(0);
    expect(restarted.error).toBeNull();
  });

  test("messages from a superseded run are ignored", () => {
    const running = reduce(initialState, { type: "start" }); // runId 1
    const stale = reduce(
      running,
      message({
        type: "result",
        runId: 0,
        result: fakeResult("randu"),
      }),
      message({ type: "done", runId: 0, totalRuntimeMs: 999 }),
    );
    expect(stale).toBe(running);
    expect(stale.status).toBe("running");
  });

  test("progress is clamped and named after the algorithm", () => {
    const running = reduce(initialState, { type: "start" });
    const progressed = reduce(
      running,
      message({
        type: "progress",
        runId: 1,
        algorithm: "randu",
        phase: "main",
        fraction: 1.4,
      }),
    );
    expect(progressed.progress).toBe(1);
    expect(progressed.progressLabel).toContain("RANDU");
  });

  test("a result replaces that algorithm's partial points", () => {
    const running = reduce(
      initialState,
      { type: "start" },
      message({
        type: "partial",
        runId: 1,
        rngId: "mulberry32",
        phase: "main",
        points: [{ n: 1, heads: 1 }],
      }),
      message({
        type: "result",
        runId: 1,
        result: fakeResult("mulberry32"),
      }),
    );
    expect(running.partialPoints.mulberry32).toBeUndefined();
    expect(running.results.mulberry32).toBeDefined();
  });

  test("a finished result is not overwritten by late partials", () => {
    const withResult = reduce(
      initialState,
      { type: "start" },
      message({
        type: "result",
        runId: 1,
        result: fakeResult("mulberry32"),
      }),
      message({
        type: "partial",
        runId: 1,
        rngId: "mulberry32",
        phase: "main",
        points: [{ n: 1, heads: 0 }],
      }),
    );
    expect(withResult.partialPoints.mulberry32).toBeUndefined();
  });

  test("done finalises the run, error surfaces the message", () => {
    const done = reduce(
      initialState,
      { type: "start" },
      message({ type: "done", runId: 1, totalRuntimeMs: 1234 }),
    );
    expect(done.status).toBe("done");
    expect(done.progress).toBe(1);
    expect(done.totalRuntimeMs).toBe(1234);

    const failed = reduce(
      initialState,
      { type: "start" },
      message({ type: "error", runId: 1, message: "boom" }),
    );
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("boom");

    const crashed = reduce(
      initialState,
      { type: "start" },
      { type: "worker/crashed", message: "worker died" },
    );
    expect(crashed.status).toBe("error");
    expect(crashed.error).toBe("worker died");
  });

  test("a cancelled run returns to idle and keeps the partial results", () => {
    const running = reduce(
      initialState,
      { type: "start" },
      message({
        type: "partial",
        runId: 1,
        rngId: "mulberry32",
        phase: "main",
        points: [
          { n: 1, heads: 1 },
          { n: 10, heads: 6 },
        ],
      }),
    );
    // Cancel does not start a new run: it answers the run already in flight.
    const cancelled = reduce(
      running,
      message({
        type: "error",
        runId: 1,
        message: "Run cancelled.",
        cancelled: true,
      }),
    );

    expect(cancelled.status).toBe("idle");
    expect(cancelled.progressLabel).toBe("Cancelled");
    // Cancelling is not a failure: nothing is shown as an error, and the
    // checkpoint stream that was already delivered stays on the charts.
    expect(cancelled.error).toBeNull();
    expect(cancelled.partialPoints.mulberry32).toHaveLength(2);
  });

  test("reset clears results but keeps the configuration", () => {
    const configured = reduce(
      initialState,
      { type: "setTrialsText", value: "500" },
      { type: "commitTrials" },
      { type: "setBitOrder", value: "low" },
      { type: "setSeed", value: 42 },
      { type: "start" },
      message({ type: "done", runId: 1, totalRuntimeMs: 10 }),
    );
    const reset = reduce(configured, { type: "reset" });
    expect(reset.results).toEqual({});
    expect(reset.status).toBe("idle");
    expect(reset.progress).toBe(0);
    expect(reset.trials).toBe(500);
    expect(reset.trialsText).toBe("500");
    expect(reset.bitOrder).toBe("low");
    expect(reset.seed).toBe(42);
  });
});

describe("derived helpers", () => {
  test("checkpoints end at the iteration count", () => {
    const points = checkpointsForRun(initialState);
    expect(points.at(-1)).toBe(initialState.iterations);
  });

  test("the trial budget caps and reports the original request", () => {
    // 100k flips x 10,000 trials is 1e9 flips per algorithm: 10x the budget.
    const greedy = reduce(
      initialState,
      { type: "setTrialsText", value: "10000" },
      { type: "commitTrials" },
    );
    const { trials, cappedFrom } = trialsForRun(greedy);
    expect(cappedFrom).toBe(10_000);
    expect(trials).toBe(1_000);
    expect(trials * greedy.iterations).toBeLessThanOrEqual(100_000_000);
  });

  test("a request inside the budget is not reported as capped", () => {
    const { trials, cappedFrom } = trialsForRun(initialState);
    expect(cappedFrom).toBeNull();
    expect(trials).toBe(initialState.trials);
  });

  test("the flip estimate covers every algorithm", () => {
    const estimate = estimateFlips(initialState);
    expect(estimate).toBe(
      initialState.iterations *
        trialsForRun(initialState).trials *
        initialState.selectedRngIds.length,
    );
  });
});
