/**
 * Checkpoint generation.
 *
 * We never store every flip. During a run we keep a single running `heads`
 * counter and snapshot it at a handful of log-spaced values of n: 1, 2, 5, 10,
 * 20, 50, 100, … Each decade contributes three points (×1, ×2, ×5), so
 * n = 10,000,000 needs only ~67 samples instead of ten million.
 *
 * Log spacing is what makes the convergence chart readable: it is also the
 * spacing on which the deviation curve is a straight line, because σ = 0.5/√n
 * is a power law.
 */

export const CHECKPOINT_LEAD = [1, 2, 5] as const;

/** Hard ceiling on n, validated in the UI and again here. */
export const MAX_FLIPS = 50_000_000;
export const MIN_FLIPS = 1;

/** Clamps and validates a user-typed iteration count. */
export function sanitizeIterations(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_FLIPS;
  }
  return Math.max(MIN_FLIPS, Math.min(MAX_FLIPS, Math.floor(value)));
}

/**
 * Returns ascending, de-duplicated checkpoint values in (0, n], always ending
 * with n itself so the last point of every chart is the final tally.
 */
export function buildCheckpoints(n: number): number[] {
  const total = sanitizeIterations(n);
  const points: number[] = [];
  let magnitude = 0; // 10^magnitude
  while (10 ** magnitude <= total) {
    const decade = 10 ** magnitude;
    for (const lead of CHECKPOINT_LEAD) {
      const candidate = decade * lead;
      if (candidate <= total) {
        points.push(candidate);
      }
    }
    magnitude += 1;
    if (magnitude > 12) {
      break; // paranoia: total is clamped above, so unreachable
    }
  }
  if (points[points.length - 1] !== total) {
    points.push(total);
  }
  return points;
}

/**
 * A cheap lookup so the hot loop can test "have we reached the next
 * checkpoint?" with one integer comparison instead of an array search.
 */
export function makeCheckpointCursor(checkpoints: readonly number[]) {
  let index = 0;
  return {
    get index(): number {
      return index;
    },
    get next(): number {
      return checkpoints[index] ?? Number.MAX_SAFE_INTEGER;
    },
    advance(): void {
      index += 1;
    },
    get done(): boolean {
      return index >= checkpoints.length;
    },
  };
}

export const ITERATION_PRESETS = [
  100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000,
] as const;

export const MIN_TRIALS = 1;
export const MAX_TRIALS = 10_000;

/**
 * Total flips of one experiment per algorithm. The convergence/deviation
 * charts use one long run of `n`; the distribution chart needs `trials`
 * independent runs of `n` more.
 */
export function totalFlipsPerAlgorithm(n: number, trials: number): number {
  return n * (1 + Math.max(0, trials - 1));
}

/**
 * Cap on total flips per algorithm. Beyond this the browser tab stops being
 * fun: 100M flips already takes seconds, 100 billion takes a coffee break.
 */
export const FLIP_BUDGET_PER_ALGORITHM = 100_000_000;

/**
 * Returns the trial count that actually fits the budget, never above `trials`.
 * The UI shows the adjustment so the user is not silently downgraded.
 */
export function effectiveTrials(n: number, trials: number): number {
  const wanted = Math.max(MIN_TRIALS, Math.min(MAX_TRIALS, Math.floor(trials)));
  const affordable = Math.floor(FLIP_BUDGET_PER_ALGORITHM / Math.max(1, n));
  return Math.max(MIN_TRIALS, Math.min(wanted, affordable));
}
