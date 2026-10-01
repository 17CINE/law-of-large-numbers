import { describe, expect, test } from "vitest";

import {
  buildCheckpoints,
  CHECKPOINT_LEAD,
  effectiveTrials,
  FLIP_BUDGET_PER_ALGORITHM,
  ITERATION_PRESETS,
  MAX_FLIPS,
  MAX_TRIALS,
  MIN_FLIPS,
  MIN_TRIALS,
  sanitizeIterations,
  totalFlipsPerAlgorithm,
} from "./checkpoints";

describe("buildCheckpoints", () => {
  test("starts at 1 and ends exactly at iterations", () => {
    const points = buildCheckpoints(100);
    expect(points[0]).toBe(1);
    expect(points.at(-1)).toBe(100);
  });

  test("is strictly increasing with no duplicates", () => {
    const points = buildCheckpoints(1000);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]).toBeGreaterThan(points[i - 1] ?? 0);
    }
    expect(new Set(points).size).toBe(points.length);
  });

  test("covers three points per decade by design", () => {
    // 1, 2, 5, 10, 20, 50, 100 …
    expect(buildCheckpoints(1_000)).toEqual([
      1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000,
    ]);
    expect(CHECKPOINT_LEAD).toEqual([1, 2, 5]);
  });

  test("caps the number of points so huge runs stay renderable", () => {
    expect(buildCheckpoints(MAX_FLIPS).length).toBeLessThan(60);
  });

  test("degrades gracefully at the extremes", () => {
    expect(buildCheckpoints(MIN_FLIPS)).toEqual([1]);
    expect(buildCheckpoints(0)).toEqual([1]);
    expect(buildCheckpoints(-5)).toEqual([1]);
    expect(buildCheckpoints(Number.NaN)).toEqual([1]);
    expect(buildCheckpoints(Number.POSITIVE_INFINITY)).toEqual([1]);
  });
});

describe("sanitizeIterations", () => {
  test("clamps into range", () => {
    expect(sanitizeIterations(10)).toBe(10);
    expect(sanitizeIterations(0)).toBe(MIN_FLIPS);
    expect(sanitizeIterations(-1)).toBe(MIN_FLIPS);
    expect(sanitizeIterations(10 ** 12)).toBe(MAX_FLIPS);
    expect(sanitizeIterations(Number.NaN)).toBe(MIN_FLIPS);
  });
});

describe("ITERATION_PRESETS", () => {
  test("are all inside the legal range and ascending", () => {
    for (const preset of ITERATION_PRESETS) {
      expect(preset).toBeGreaterThanOrEqual(MIN_FLIPS);
      expect(preset).toBeLessThanOrEqual(MAX_FLIPS);
    }
    for (let i = 1; i < ITERATION_PRESETS.length; i += 1) {
      expect(ITERATION_PRESETS[i]).toBeGreaterThan(
        ITERATION_PRESETS[i - 1] ?? 0,
      );
    }
  });
});

describe("effectiveTrials", () => {
  test("passes through when the budget allows", () => {
    expect(effectiveTrials(1_000, 100)).toBe(100);
  });

  test("never trades away the main run itself", () => {
    // 100M flips of budget buys 2 trials at n = 50M, and 1 at the ceiling.
    expect(effectiveTrials(MAX_FLIPS, 100)).toBe(
      Math.floor(FLIP_BUDGET_PER_ALGORITHM / MAX_FLIPS),
    );
    expect(effectiveTrials(MAX_FLIPS, 1)).toBe(MIN_TRIALS);
    expect(effectiveTrials(1, MAX_TRIALS)).toBe(MAX_TRIALS);
  });

  test("caps at the per-algorithm flip budget", () => {
    const trials = effectiveTrials(10_000_000, 1_000);
    expect(trials).toBe(
      Math.max(MIN_TRIALS, Math.floor(FLIP_BUDGET_PER_ALGORITHM / 10_000_000)),
    );
    expect(totalFlipsPerAlgorithm(10_000_000, trials)).toBeLessThanOrEqual(
      FLIP_BUDGET_PER_ALGORITHM,
    );
  });

  test("never returns less than the main run", () => {
    for (const iterations of [1, 1_000, 1_000_000, 50_000_000]) {
      for (const trials of [0, 1, 2, 1_000, MAX_TRIALS]) {
        expect(effectiveTrials(iterations, trials)).toBeGreaterThanOrEqual(
          MIN_TRIALS,
        );
      }
    }
  });
});

describe("totalFlipsPerAlgorithm", () => {
  test("counts the main run plus each extra trial", () => {
    expect(totalFlipsPerAlgorithm(100, 1)).toBe(100);
    expect(totalFlipsPerAlgorithm(100, 5)).toBe(500);
    expect(totalFlipsPerAlgorithm(100, 0)).toBe(100);
  });
});
