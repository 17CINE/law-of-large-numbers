import { describe, expect, test } from "vitest";

import { createRng, isSeedable, RNG_DESCRIPTORS } from "./index";
import {
  type BitOrder,
  bitIndexFor,
  bitOf,
  normalizeSeed,
  type RngId,
} from "./types";

const N = 2_000_000;

interface StreamStats {
  /** Proportion of ones. */
  p: number;
  /** Longest streak of identical consecutive bits. */
  longestRun: number;
  /** Fraction of consecutive pairs that agree; 0.5 means memoryless. */
  lag1Agreement: number;
}

function measure(id: RngId, order: BitOrder, seed = 1): StreamStats {
  const rng = createRng(id, seed, order);
  let ones = 0;
  let longestRun = 0;
  let currentRun = 0;
  let previousBit = -1;
  let agreements = 0;
  for (let i = 0; i < N; i += 1) {
    const bit = rng.nextBit();
    ones += bit;
    if (i > 0) {
      agreements += bit === previousBit ? 1 : 0;
      currentRun = bit === previousBit ? currentRun + 1 : 1;
      if (currentRun > longestRun) {
        longestRun = currentRun;
      }
    } else {
      currentRun = 1;
      longestRun = 1;
    }
    previousBit = bit;
  }
  return { p: ones / N, longestRun, lag1Agreement: agreements / (N - 1) };
}

describe("registry", () => {
  test("every generator is constructible and self-describing", () => {
    for (const descriptor of RNG_DESCRIPTORS) {
      const rng = createRng(descriptor.id, 42, "high");
      expect(rng.id).toBe(descriptor.id);
      expect(rng.name).toBe(descriptor.name);
      expect(rng.seedable).toBe(descriptor.seedable);
      expect(isSeedable(descriptor.id)).toBe(descriptor.seedable);
      expect(descriptor.shortName.length).toBeGreaterThan(0);
    }
  });

  test("Math.random and crypto cannot be seeded, so they expose no reseed", () => {
    for (const id of ["math-random", "crypto-random"] as const) {
      const rng = createRng(id, 42, "high");
      expect(rng.seedable).toBe(false);
      expect(rng.reseed).toBeUndefined();
    }
  });

  test("seedable generators reproduce a stream exactly from the same seed", () => {
    for (const descriptor of RNG_DESCRIPTORS) {
      if (!descriptor.seedable) {
        continue;
      }
      const a = createRng(descriptor.id, 0x1234, "high");
      const b = createRng(descriptor.id, 0x1234, "high");
      for (let i = 0; i < 5_000; i += 1) {
        expect(a.nextBit()).toBe(b.nextBit());
      }
    }
  });

  test("different seeds give different streams", () => {
    for (const descriptor of RNG_DESCRIPTORS) {
      // The deliberately weak generators are excluded on purpose: Broken LCG
      // walks every seed to the same fixed point, which is its whole point.
      if (!descriptor.seedable || descriptor.weak) {
        continue;
      }
      const a = createRng(descriptor.id, 1, "high");
      const b = createRng(descriptor.id, 2, "high");
      let differences = 0;
      for (let i = 0; i < 10_000; i += 1) {
        differences += a.nextBit() === b.nextBit() ? 0 : 1;
      }
      expect(differences).toBeGreaterThan(3_000);
    }
  });

  test("reseed restarts the stream", () => {
    const rng = createRng("xoshiro128", 99, "high");
    const first = Array.from({ length: 100 }, () => rng.nextBit());
    for (let i = 0; i < 1_000; i += 1) {
      rng.nextBit();
    }
    rng.reseed?.(99);
    const again = Array.from({ length: 100 }, () => rng.nextBit());
    expect(again).toEqual(first);
  });
});

describe("bit selection helpers", () => {
  test("normalizeSeed never returns zero", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect(normalizeSeed(seed)).not.toBe(0);
    }
  });

  test("bitIndexFor accounts for the generator's output width", () => {
    expect(bitIndexFor("high")).toBe(31);
    expect(bitIndexFor("low")).toBe(0);
    expect(bitIndexFor("high", 31)).toBe(30);
  });

  test("bitOf extracts the requested bit", () => {
    expect(bitOf(0x8000_0000, 31)).toBe(1);
    expect(bitOf(0x7fff_ffff, 31)).toBe(0);
    expect(bitOf(1, 0)).toBe(1);
    expect(bitOf(2, 0)).toBe(0);
    expect(bitOf(1 << 30, 30)).toBe(1);
  });
});

describe("every well-behaved generator produces a fair coin", () => {
  for (const descriptor of RNG_DESCRIPTORS) {
    if (descriptor.weak) {
      continue;
    }
    test(`${descriptor.shortName}: |p − 0.5| < 0.005 over ${N.toLocaleString("en-US")} flips`, () => {
      const stats = measure(descriptor.id, "high", 7);
      expect(Math.abs(stats.p - 0.5)).toBeLessThan(0.005);
      expect(stats.lag1Agreement).toBeGreaterThan(0.47);
      expect(stats.lag1Agreement).toBeLessThan(0.53);
      // A fair coin's longest run in 2M flips is around 21; allow a wide margin.
      expect(stats.longestRun).toBeLessThan(30);
    });
  }
});

describe("RANDU: structurally broken, yet its top bit looks fine", () => {
  test("top bit is indistinguishable from a fair coin", () => {
    const stats = measure("randu", "high", 1);
    expect(Math.abs(stats.p - 0.5)).toBeLessThan(0.005);
    expect(stats.lag1Agreement).toBeGreaterThan(0.45);
    expect(stats.lag1Agreement).toBeLessThan(0.55);
  });

  test("lowest bit is catastrophically biased — this is the RANDU defect", () => {
    // 65539 is odd and the state stays odd, so bit 0 is always 1.
    const stats = measure("randu", "low", 1);
    expect(stats.p).toBe(1);
  });
});

describe("Broken LCG: the law of large numbers fails outright", () => {
  test("top bit becomes permanently 1 after at most 31 warm-up flips", () => {
    const rng = createRng("lcg-broken", 1, "high");
    let firstHead = -1;
    for (let i = 0; i < 64; i += 1) {
      if (rng.nextBit() === 1) {
        firstHead = i;
        break;
      }
    }
    // Every flip from here on is a head: the generator is stuck at its fixed point.
    for (let i = 0; i < 10_000; i += 1) {
      expect(rng.nextBit()).toBe(1);
    }
    expect(firstHead).toBeGreaterThanOrEqual(0);
    expect(firstHead).toBeLessThanOrEqual(31);
  });

  test("proportion saturates at 1 instead of 0.5", () => {
    const stats = measure("lcg-broken", "high", 1);
    expect(stats.p).toBeGreaterThan(0.999);
  });
});
