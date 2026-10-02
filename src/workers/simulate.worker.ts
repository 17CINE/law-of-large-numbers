import { createRng } from "../lib/rng";
import type { RngId } from "../lib/rng/types";
import { chiSquareSurvival, chiSquareUniform, zScore } from "../lib/stats";
import type {
  AlgorithmResult,
  Checkpoint,
  DieSummary,
  MainThreadMessage,
  ResultMessage,
  RunSeries,
  SimulationRequest,
  TrialHistogram,
  WorkerMessage,
} from "../lib/types";

/**
 * Simulation worker. Every coin flip happens here so the main thread stays
 * responsive at 50 million flips × 6 generators.
 *
 * Memory discipline: no flip is ever stored. An experiment keeps one integer
 * counter, ten decile counters and ~67 checkpoint snapshots.
 */

/**
 * Structural view of `self` inside a dedicated worker. Declared locally because
 * mixing the `webworker` TypeScript lib into a DOM project produces duplicate
 * global declarations.
 */
interface WorkerScope {
  postMessage(message: WorkerMessage): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<MainThreadMessage>) => void,
  ): void;
}

const ctx = self as unknown as WorkerScope;

/**
 * Yields to the worker's event loop so queued `cancel` messages can be
 * delivered.
 *
 * Without this the worker is deaf while it computes: `executeRun` is a tight
 * synchronous loop, and a dedicated worker runs single-threaded, so the
 * `message` listener cannot execute until the run finishes. Cancelling would
 * then only ever take effect after the very thing it was meant to interrupt.
 *
 * `MessageChannel` is used rather than `setTimeout` because timer clamping
 * (≥4ms after a few nested timeouts) would add up to hundreds of milliseconds
 * of dead time per run; a channel callback is a plain macrotask with no floor.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

const DECILES = 10;
const HISTOGRAM_BINS = 40;
/** Flip count between cancellation checks. */
const CHECK_EVERY = 65_536;
/** Quantisation of `progress` messages: ~100 per main experiment. */
const PROGRESS_STEPS = 100;
/** Roughly this many partial chart snapshots per main experiment. */
const PARTIAL_EVERY = 8;

class Cancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "Cancelled";
  }
}

let cancelledRunId: number | null = null;

function post(message: WorkerMessage): void {
  ctx.postMessage(message);
}

function assertLive(runId: number): void {
  if (cancelledRunId === runId) {
    throw new Cancelled();
  }
}

interface HistogramBins {
  lo: number;
  width: number;
  edges: number[];
  counts: number[];
}

/**
 * Bins span mean ± 4σ of Binomial(n, ½), so the interesting part of the
 * distribution always fills the chart instead of hugging one edge.
 */
function makeBins(iterations: number): HistogramBins {
  const mu = iterations / 2;
  const sigma = Math.sqrt(iterations) / 2;
  const lo = Math.max(0, Math.floor(mu - 4 * sigma));
  const hi = Math.min(iterations, Math.ceil(mu + 4 * sigma));
  const width = Math.max(1, (hi - lo) / HISTOGRAM_BINS);
  const edges: number[] = new Array<number>(HISTOGRAM_BINS + 1);
  for (let i = 0; i <= HISTOGRAM_BINS; i += 1) {
    edges[i] = lo + width * i;
  }
  return {
    lo,
    width,
    edges,
    counts: new Array<number>(HISTOGRAM_BINS).fill(0),
  };
}

function addToBins(bins: HistogramBins, heads: number): void {
  let index = Math.floor((heads - bins.lo) / bins.width);
  if (index < 0) {
    index = 0;
  }
  if (index >= bins.counts.length) {
    index = bins.counts.length - 1;
  }
  bins.counts[index] = (bins.counts[index] ?? 0) + 1;
}

interface MainCallbacks {
  /** Throttled progress: `done` flips out of `iterations`. */
  onProgress(done: number): void;
  /** Periodic snapshot of the checkpoints recorded so far. */
  onPartial(points: Checkpoint[]): void;
}

/**
 * One long run of `iterations` flips, sampled at the supplied log-spaced
 * checkpoints.
 *
 * Side products, all O(1) memory: decile head-counts for the goodness-of-fit
 * test, the longest streak of identical bits (the quickest way to see that a
 * generator's outputs are correlated rather than independent) and the largest
 * |z| seen at any checkpoint.
 */
async function runMainExperiment(
  rng: { nextBit(): 0 | 1; id: RngId },
  request: SimulationRequest,
  callbacks: MainCallbacks,
): Promise<RunSeries> {
  const { checkpoints, iterations, runId } = request;
  const started = performance.now();

  const decileHeads = new Int32Array(DECILES);
  const points: Checkpoint[] = [];

  let heads = 0;
  let checkpointIndex = 0;
  let nextCheckpoint = checkpoints[0] ?? iterations;
  let lastStep = 0;
  let emissions = 0;
  let maxAbsZ = 0;

  let currentBit = -1;
  let runLength = 0;
  let longestRun = 0;

  const emit = (done: number, force: boolean): void => {
    const step = Math.floor((done * PROGRESS_STEPS) / iterations);
    if (!force && step <= lastStep) {
      return;
    }
    lastStep = step;
    emissions += 1;
    callbacks.onProgress(done);
    if (emissions % PARTIAL_EVERY === 0 || force) {
      callbacks.onPartial(points);
    }
  };

  for (let i = 1; i <= iterations; i += 1) {
    const bit = rng.nextBit();
    heads += bit;

    if (bit === currentBit) {
      runLength += 1;
    } else {
      currentBit = bit;
      runLength = 1;
    }
    if (runLength > longestRun) {
      longestRun = runLength;
    }

    // Which decile of the run are we in? Derived from i so it costs no memory.
    const decile = Math.min(
      DECILES - 1,
      Math.floor((i * DECILES) / iterations),
    );
    decileHeads[decile] = (decileHeads[decile] ?? 0) + bit;

    if (i === nextCheckpoint) {
      points.push({ n: i, heads });
      const absZ = Math.abs(zScore(heads, i));
      if (absZ > maxAbsZ) {
        maxAbsZ = absZ;
      }
      checkpointIndex += 1;
      nextCheckpoint = checkpoints[checkpointIndex] ?? iterations + 1;
    }

    if (i % CHECK_EVERY === 0) {
      assertLive(runId);
      emit(i, false);
      await yieldToEventLoop();
    }
  }

  emit(iterations, true);

  const expectedPerDecile = iterations / DECILES / 2;
  let statistic = 0;
  const observed: number[] = new Array<number>(DECILES);
  for (let d = 0; d < DECILES; d += 1) {
    const count = decileHeads[d] ?? 0;
    observed[d] = count;
    const diff = count - expectedPerDecile;
    statistic += (diff * diff) / expectedPerDecile;
  }

  return {
    rngId: rng.id,
    points,
    totalHeads: heads,
    decileHeads: observed,
    chiSquare: {
      statistic,
      degreesOfFreedom: DECILES - 1,
      pValue: chiSquareSurvival(statistic, DECILES - 1),
    },
    runtimeMs: performance.now() - started,
    longestRun,
    maxAbsZ,
  };
}

/**
 * `trials` independent experiments of `iterations` flips each, used only to
 * fill the distribution histogram. Trial 0 is the main run, whose head count is
 * passed in, so the histogram and the stats table can never disagree.
 *
 * Seedable generators get a derived seed per trial so the experiments are
 * independent yet fully reproducible from the one seed in the UI.
 */
async function runTrials(
  createTrial: (seed: number) => { nextBit(): 0 | 1 },
  rngId: RngId,
  mainHeads: number,
  request: SimulationRequest,
  onProgress: (done: number) => void,
): Promise<TrialHistogram> {
  const { iterations, trials, runId, seed } = request;
  const started = performance.now();
  const bins = makeBins(iterations);

  let sum = 0;
  let sumSquares = 0;

  const absorb = (heads: number): void => {
    addToBins(bins, heads);
    sum += heads;
    sumSquares += heads * heads;
  };

  absorb(mainHeads);

  const progressEvery = Math.max(1, Math.floor(trials / PROGRESS_STEPS));
  for (let trial = 1; trial < trials; trial += 1) {
    assertLive(runId);
    const rng = createTrial(seed + trial * 0x9e37_79b9);
    let heads = 0;
    for (let i = 0; i < iterations; i += 1) {
      heads += rng.nextBit();
      if (i % CHECK_EVERY === 0) {
        assertLive(runId);
        await yieldToEventLoop();
      }
    }
    absorb(heads);
    if (trial % progressEvery === 0 || trial === trials - 1) {
      onProgress(trial + 1);
    }
  }

  const mean = sum / trials;
  const variance = trials > 1 ? sumSquares / trials - mean * mean : 0;

  return {
    rngId,
    edges: bins.edges,
    counts: bins.counts,
    trials,
    mean,
    stdDev:
      trials > 1 ? Math.sqrt(Math.max(0, variance)) : Math.sqrt(iterations) / 2,
    runtimeMs: performance.now() - started,
  };
}

function nextDie(rng: { nextBit(): 0 | 1 }): number {
  let value = 6;
  while (value >= 6) {
    value = (rng.nextBit() << 2) | (rng.nextBit() << 1) | rng.nextBit();
  }
  return value + 1;
}

async function runDieExperiment(
  rng: { nextBit(): 0 | 1; id: RngId },
  request: SimulationRequest,
  callbacks: MainCallbacks,
): Promise<{ points: Checkpoint[]; summary: DieSummary }> {
  const started = performance.now();
  const counts = new Int32Array(6);
  const points: Checkpoint[] = [];
  let checkpointIndex = 0;
  let nextCheckpoint = request.checkpoints[0] ?? request.iterations;
  let lastStep = 0;
  let emissions = 0;

  const emit = (done: number, force: boolean): void => {
    const step = Math.floor((done * PROGRESS_STEPS) / request.iterations);
    if (!force && step <= lastStep) return;
    lastStep = step;
    emissions += 1;
    callbacks.onProgress(done);
    if (emissions % PARTIAL_EVERY === 0 || force) callbacks.onPartial(points);
  };

  for (let i = 1; i <= request.iterations; i += 1) {
    const face = nextDie(rng) - 1;
    counts[face] = (counts[face] ?? 0) + 1;
    if (i === nextCheckpoint) {
      points.push({ n: i, heads: counts[0] ?? 0 });
      checkpointIndex += 1;
      nextCheckpoint =
        request.checkpoints[checkpointIndex] ?? request.iterations + 1;
    }
    if (i % CHECK_EVERY === 0) {
      assertLive(request.runId);
      emit(i, false);
      await yieldToEventLoop();
    }
  }
  emit(request.iterations, true);
  const values = [...counts];
  return {
    points,
    summary: {
      counts: values,
      total: request.iterations,
      chiSquare: chiSquareUniform(values),
      runtimeMs: performance.now() - started,
    },
  };
}

async function runDieTrials(
  createTrial: (seed: number) => { nextBit(): 0 | 1 },
  request: SimulationRequest,
  onProgress: (done: number) => void,
): Promise<number[][]> {
  const results: number[][] = [];
  const progressEvery = Math.max(
    1,
    Math.floor(request.trials / PROGRESS_STEPS),
  );
  for (let trial = 0; trial < request.trials; trial += 1) {
    assertLive(request.runId);
    const rng = createTrial(request.seed + trial * 0x9e37_79b9);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < request.iterations; i += 1) {
      const face = nextDie(rng) - 1;
      counts[face] = (counts[face] ?? 0) + 1;
      if (i % CHECK_EVERY === 0) {
        assertLive(request.runId);
        await yieldToEventLoop();
      }
    }
    results.push(counts);
    if ((trial + 1) % progressEvery === 0 || trial === request.trials - 1)
      onProgress(trial + 1);
  }
  return results;
}

async function executeRun(request: SimulationRequest): Promise<void> {
  const startedAll = performance.now();
  const algorithms = request.rngIds;
  const totalPhases = algorithms.length * 2;
  let phasesDone = 0;

  for (const rngId of algorithms) {
    const base = phasesDone / totalPhases;
    const width = 1 / totalPhases;

    if (request.mode === "die") {
      const die = await runDieExperiment(
        createRng(rngId, request.seed, "high"),
        request,
        {
          onProgress: (done) =>
            post({
              type: "progress",
              runId: request.runId,
              fraction: base + (width * done) / request.iterations,
              algorithm: rngId,
              phase: "main",
            }),
          onPartial: (points) =>
            post({
              type: "partial",
              runId: request.runId,
              rngId,
              phase: "main",
              points,
            }),
        },
      );
      const trialCounts = await runDieTrials(
        (trialSeed) => createRng(rngId, trialSeed, "high"),
        request,
        (done) =>
          post({
            type: "progress",
            runId: request.runId,
            fraction: base + width + (width * done) / request.trials,
            algorithm: rngId,
            phase: "trials",
            trialsDone: done,
          }),
      );
      const combinedCounts = trialCounts.reduce(
        (sum, counts) =>
          sum.map((value, index) => value + (counts[index] ?? 0)),
        new Array<number>(6).fill(0),
      );
      const result: AlgorithmResult = {
        mode: "die",
        series: {
          rngId,
          points: die.points,
          totalHeads: die.summary.counts[0] ?? 0,
          decileHeads: [],
          chiSquare: die.summary.chiSquare,
          runtimeMs: die.summary.runtimeMs,
          longestRun: 0,
          maxAbsZ: 0,
        },
        histogram: {
          rngId,
          edges: [],
          counts: [],
          trials: request.trials,
          mean: 0,
          stdDev: 0,
          runtimeMs: 0,
        },
        z: 0,
        proportion: (die.summary.counts[0] ?? 0) / request.iterations,
        chiSquare: die.summary.chiSquare,
        die: {
          ...die.summary,
          counts: combinedCounts,
          total: request.iterations * request.trials,
          chiSquare: chiSquareUniform(combinedCounts),
        },
      };
      post({ type: "result", runId: request.runId, result });
      phasesDone += 2;
      continue;
    }

    const series = await runMainExperiment(
      createRng(rngId, request.seed, request.bitOrder),
      request,
      {
        onProgress: (done) => {
          post({
            type: "progress",
            runId: request.runId,
            fraction: base + (width * done) / request.iterations,
            algorithm: rngId,
            phase: "main",
          });
        },
        onPartial: (points) => {
          post({
            type: "partial",
            runId: request.runId,
            rngId,
            phase: "main",
            points,
          });
        },
      },
    );

    const histogram = await runTrials(
      (trialSeed) => createRng(rngId, trialSeed, request.bitOrder),
      rngId,
      series.totalHeads,
      request,
      (done) => {
        post({
          type: "progress",
          runId: request.runId,
          fraction: base + width + (width * done) / request.trials,
          algorithm: rngId,
          phase: "trials",
          trialsDone: done,
        });
      },
    );

    const result: AlgorithmResult = {
      mode: "coin",
      series,
      histogram,
      z: zScore(series.totalHeads, request.iterations),
      proportion:
        request.iterations === 0 ? 0 : series.totalHeads / request.iterations,
      chiSquare: series.chiSquare,
    };
    post({
      type: "result",
      runId: request.runId,
      result,
    } satisfies ResultMessage);

    phasesDone += 2;
  }

  post({
    type: "done",
    runId: request.runId,
    totalRuntimeMs: performance.now() - startedAll,
  });
}

ctx.addEventListener("message", (event: MessageEvent<MainThreadMessage>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelledRunId = message.runId;
    return;
  }
  if (message.type !== "run") {
    return;
  }
  cancelledRunId = null;
  void (async () => {
    try {
      await executeRun(message);
    } catch (error) {
      if (error instanceof Cancelled) {
        post({
          type: "error",
          runId: message.runId,
          message: "Run cancelled.",
          cancelled: true,
        });
        return;
      }
      post({
        type: "error",
        runId: message.runId,
        message: error instanceof Error ? error.message : "Simulation failed.",
      });
    }
  })();
});
