import { describe, expect, test } from "vitest";

import { Pcg32RNG } from "./pcg32";
import { normalizeSeed } from "./types";
import { Xoshiro128StarStarRNG } from "./xoshiro128";

/**
 * The 32-bit implementations above assemble 64-bit arithmetic by hand. These
 * tests check them against a BigInt transcription of the reference algorithms,
 * bit for bit, so a transcription slip cannot hide.
 */

const MASK64 = (1n << 64n) - 1n;
const MULTIPLIER = 6364136223846793005n;
const INCREMENT = 1442695040888963407n;

function referencePcg32(seed: number, count: number): number[] {
  let state = 0n;
  const step = () => {
    state = (state * MULTIPLIER + INCREMENT) & MASK64;
  };
  step();
  // The seeding sequence the class uses: add (seed << 1) | 1, then step.
  state = (state + ((BigInt(normalizeSeed(seed)) << 1n) | 1n)) & MASK64;
  step();

  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const old = state;
    step();
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffff_ffffn);
    const rot = Number(old >> 59n);
    out.push(((xorshifted >>> rot) | (xorshifted << (32 - rot))) >>> 0);
  }
  return out;
}

function referenceXoshiro128ss(seed: number, count: number): number[] {
  const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
  // Same SplitMix32 expansion the class performs internally.
  let z = normalizeSeed(seed);
  const next = () => {
    z = (z + 0x9e3779b9) | 0;
    let x = z;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
    return (x ^ (x >>> 15)) >>> 0;
  };
  let [s0, s1, s2, s3] = [next(), next(), next(), next()];

  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    out.push(result);
  }
  return out;
}

describe("PCG32 matches its 64-bit BigInt reference", () => {
  test("the hand-rolled 64-bit LCG step is exact on 20,000 pseudo-random states", () => {
    const rng = new Pcg32RNG(1, "high");
    const raw = rng as unknown as {
      stateHi: number;
      stateLo: number;
      step(): void;
    };
    for (let k = 0; k < 20_000; k += 1) {
      raw.stateHi = (k * 2_654_435_761 + 12_345) >>> 0;
      raw.stateLo = (k * 40_503 * 7_919) >>> 0;
      const before = (BigInt(raw.stateHi >>> 0) << 32n) | BigInt(raw.stateLo);
      const expected = (before * MULTIPLIER + INCREMENT) & MASK64;
      raw.step();
      const after = (BigInt(raw.stateHi >>> 0) << 32n) | BigInt(raw.stateLo);
      expect(after).toBe(expected);
    }
  });

  test("20,000 consecutive outputs are identical", () => {
    const rng = new Pcg32RNG(0x2545f491, "high");
    const reference = referencePcg32(0x2545f491, 20_000);

    // The class exposes only nextBit(); reach the raw words through a subclass.
    const raw = rng as unknown as { nextUint32(): number };
    for (let i = 0; i < reference.length; i += 1) {
      expect(raw.nextUint32()).toBe(reference[i]);
    }
  });

  test("high bit of the reference stream is a fair coin", () => {
    const reference = referencePcg32(99, 100_000);
    const ones = reference.reduce((sum, word) => sum + (word >>> 31), 0);
    expect(Math.abs(ones / reference.length - 0.5)).toBeLessThan(0.01);
  });
});

describe("xoshiro128** matches the reference recurrence", () => {
  test("20,000 consecutive outputs are identical", () => {
    const rng = new Xoshiro128StarStarRNG(0x1a2b3c4d, "high");
    const reference = referenceXoshiro128ss(0x1a2b3c4d, 20_000);
    const raw = rng as unknown as { nextUint32(): number };
    for (let i = 0; i < reference.length; i += 1) {
      expect(raw.nextUint32()).toBe(reference[i]);
    }
  });

  test("a zero seed is scrubbed instead of leaving a dead state", () => {
    const rng = new Xoshiro128StarStarRNG(0, "high");
    const bits = Array.from({ length: 32 }, () => rng.nextBit());
    expect(bits.some((bit) => bit === 1)).toBe(true);
  });
});
