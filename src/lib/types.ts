import type { BitOrder, RngId } from "./rng/types";
import type { ChiSquareResult } from "./stats";

export type SimulationMode = "coin" | "die";

/** One recorded sample: the running tally at a checkpoint value of n. */
export interface Checkpoint {
  /** Number of flips performed so far. */
  n: number;
  /** Running number of heads. */
  heads: number;
}

/** Everything the charts need for one algorithm's main run. */
export interface RunSeries {
  rngId: RngId;
  /** Log-spaced checkpoints, ascending. */
  points: Checkpoint[];
  totalHeads: number;
  /** Decile heads counts, for the goodness-of-fit test. */
  decileHeads: number[];
  /** Goodness-of-fit of the 10 decile counts, df = 9. */
  chiSquare: ChiSquareResult;
  /** Wall-clock time of the main run, milliseconds. */
  runtimeMs: number;
  /** Longest run of identical consecutive bits — a serial-correlation smell test. */
  longestRun: number;
  /** Largest |z| observed at any checkpoint. */
  maxAbsZ: number;
}

/** Histogram of heads counts from the `trials` independent experiments. */
export interface TrialHistogram {
  rngId: RngId;
  /** Bin edges, strictly ascending, length = bins + 1. */
  edges: number[];
  /** Counts per bin, length = bins. */
  counts: number[];
  trials: number;
  mean: number;
  /** Sample standard deviation of the heads counts. */
  stdDev: number;
  /** Total flips used by the trial experiments. */
  runtimeMs: number;
}

export interface AlgorithmResult {
  mode: SimulationMode;
  series: RunSeries;
  histogram: TrialHistogram;
  z: number;
  proportion: number;
  chiSquare: ChiSquareResult;
  die?: DieSummary;
}

export interface DieSummary {
  counts: number[];
  total: number;
  chiSquare: ChiSquareResult;
  runtimeMs: number;
}

export interface SimulationRequest {
  type: "run";
  /** Monotonic id so stale worker replies can be discarded. */
  runId: number;
  rngIds: RngId[];
  iterations: number;
  seed: number;
  trials: number;
  bitOrder: BitOrder;
  checkpoints: number[];
  mode: SimulationMode;
}

export interface SimulationCancel {
  type: "cancel";
  runId: number;
}

export type MainThreadMessage = SimulationRequest | SimulationCancel;

/** Progress for the run currently in flight. */
export interface ProgressMessage {
  type: "progress";
  runId: number;
  /** 0…1 across the whole job (all algorithms × all experiments). */
  fraction: number;
  algorithm: RngId;
  /** Name of the phase, for the progress caption. */
  phase: "main" | "trials";
  /** Trials finished so far, in the trials phase. */
  trialsDone?: number;
}

/** Partial checkpoint data, so the charts fill in while the run continues. */
export interface PartialMessage {
  type: "partial";
  runId: number;
  rngId: RngId;
  phase: "main" | "trials";
  points: Checkpoint[];
}

/** One algorithm finished. Streamed as each completes so the UI fills in. */
export interface ResultMessage {
  type: "result";
  runId: number;
  result: AlgorithmResult;
}

export interface DoneMessage {
  type: "done";
  runId: number;
  totalRuntimeMs: number;
}

export interface ErrorMessage {
  type: "error";
  runId: number;
  message: string;
  /** Set when the run stopped because the user pressed Cancel. */
  cancelled?: boolean;
}

export type WorkerMessage =
  | ProgressMessage
  | PartialMessage
  | ResultMessage
  | DoneMessage
  | ErrorMessage;
