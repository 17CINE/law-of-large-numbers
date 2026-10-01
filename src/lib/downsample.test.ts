import { describe, expect, test } from "vitest";

import { downsampleLog, logTicks } from "./downsample";

const range = (length: number): number[] => Array.from({ length }, (_, i) => i);

describe("downsampleLog", () => {
  test("returns everything when there is nothing to trim", () => {
    expect(downsampleLog(range(10), 10)).toEqual(range(10));
    expect(downsampleLog([], 5)).toEqual([]);
    expect(downsampleLog([7], 5)).toEqual([7]);
  });

  test("never exceeds the limit", () => {
    for (const limit of [2, 3, 10, 100]) {
      expect(downsampleLog(range(5_000), limit).length).toBeLessThanOrEqual(
        limit,
      );
    }
  });

  test("always keeps the first and last entries", () => {
    const points = range(5_000);
    const kept = downsampleLog(points, 50);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(4_999);
  });

  test("keeps entries in ascending order and without duplicates", () => {
    const kept = downsampleLog(range(5_000), 200);
    for (let i = 1; i < kept.length; i += 1) {
      expect(kept[i]).toBeGreaterThan(kept[i - 1] ?? 0);
    }
    expect(new Set(kept).size).toBe(kept.length);
  });

  test("does not hang on a degenerate limit", () => {
    // maxPoints = 1 cannot keep both ends; it must clamp rather than loop.
    expect(downsampleLog(range(100), 1).length).toBeLessThanOrEqual(2);
    expect(downsampleLog(range(100), 0).length).toBeLessThanOrEqual(2);
  });

  test("spreads points logarithmically rather than uniformly", () => {
    const kept = downsampleLog(range(10_000), 100);
    const early = kept.filter((i) => i < 1_000).length / kept.length;
    const late = kept.filter((i) => i > 9_000).length / kept.length;
    // Early indices must be denser than late ones, or the funnel's left edge
    // loses its shape. A uniform sample would put ~10% in each decile.
    expect(early).toBeGreaterThan(0.3);
    expect(late).toBeLessThan(0.1);
  });
});

describe("logTicks", () => {
  test("uses whole decades for a short domain", () => {
    expect(logTicks(1, 100)).toEqual([1, 10, 100]);
  });

  test("uses the 1/2/5 ladder once the domain spans more than two decades", () => {
    expect(logTicks(1, 1_000)).toEqual([
      1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000,
    ]);
  });

  test("falls back to whole decades rather than stranding half the ladder", () => {
    expect(logTicks(1, 10_000)).toEqual([1, 10, 100, 1_000, 10_000]);
  });

  test("never leaves the requested bounds", () => {
    for (const [min, max] of [
      [1, 50],
      [3, 977],
      [1, 50_000_000],
    ] as const) {
      for (const tick of logTicks(min, max)) {
        expect(tick).toBeGreaterThanOrEqual(min);
        expect(tick).toBeLessThanOrEqual(max);
      }
    }
  });

  test("respects the tick budget", () => {
    expect(logTicks(1, 10 ** 12, 6).length).toBeLessThanOrEqual(6);
  });

  test("keeps the top of the domain on the axis", () => {
    expect(logTicks(1, 50_000_000).at(-1)).toBe(50_000_000);
  });
});
