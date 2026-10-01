import { createBrokenLcg } from "./brokenlcg";
import { createCryptoRandom } from "./crypto-random";
import { createMathRandom } from "./math-random";
import { createMulberry32 } from "./mulberry32";
import { createPcg32 } from "./pcg32";
import { createRandu } from "./randu";
import type { BitOrder, RNG, RngDescriptor, RngId } from "./types";
import { createXoshiro128 } from "./xoshiro128";

/**
 * Static metadata for the UI. The order here is the order they appear in the
 * control panel.
 */
export const RNG_DESCRIPTORS: readonly RngDescriptor[] = [
  {
    id: "math-random",
    name: "Math.random (V8 xorshift128+)",
    shortName: "Math.random",
    seedable: false,
    weak: false,
    defaultSeed: 0,
    description:
      "Whatever your engine ships. Fast, good enough for games, not seedable.",
  },
  {
    id: "crypto-random",
    name: "crypto.getRandomValues (CSPRNG)",
    shortName: "crypto",
    seedable: false,
    weak: false,
    defaultSeed: 0,
    description: "A real cryptographically secure generator. Not seedable.",
  },
  {
    id: "mulberry32",
    name: "Mulberry32",
    shortName: "Mulberry32",
    seedable: true,
    weak: false,
    defaultSeed: 0x2f6e2b1,
    description: "Tiny 32-bit PRNG, excellent quality, fully reproducible.",
  },
  {
    id: "xoshiro128",
    name: "xoshiro128**",
    shortName: "xoshiro128**",
    seedable: true,
    weak: false,
    defaultSeed: 0x1a2b3c4d,
    description: "Modern workhorse, period 2^128−1, passes BigCrush.",
  },
  {
    id: "pcg32",
    name: "PCG32",
    shortName: "PCG32",
    seedable: true,
    weak: false,
    defaultSeed: 0x2545f491,
    description: "64-bit LCG state plus an XSH-RR output permutation.",
  },
  {
    id: "randu",
    name: "RANDU (weak LCG)",
    shortName: "RANDU",
    seedable: true,
    weak: true,
    defaultSeed: 0x0000_0001,
    description:
      "x = 65539x mod 2^31, IBM 1965. Its top bit passes every test here — the damage is structural.",
  },
  {
    id: "lcg-broken",
    name: "Broken LCG (a=2, c=1)",
    shortName: "Broken LCG",
    seedable: true,
    weak: true,
    defaultSeed: 0x0000_0001,
    description:
      "Power-of-two multiplier: converges to a fixed point and flips heads forever. The law fails outright.",
  },
] as const;

const DESCRIPTOR_BY_ID: ReadonlyMap<RngId, RngDescriptor> = new Map(
  RNG_DESCRIPTORS.map((d) => [d.id, d]),
);

export const RNG_IDS: readonly RngId[] = RNG_DESCRIPTORS.map((d) => d.id);

export function getDescriptor(id: RngId): RngDescriptor {
  const descriptor = DESCRIPTOR_BY_ID.get(id);
  if (!descriptor) {
    throw new Error(`Unknown RNG id: ${id}`);
  }
  return descriptor;
}

export function isSeedable(id: RngId): boolean {
  return getDescriptor(id).seedable;
}

/**
 * Type guard for values that came from outside the type system — tooltip
 * series names, for instance, which are `unknown` to us even though they are
 * usually an `RngId`.
 */
export function isRngId(value: string): value is RngId {
  return DESCRIPTOR_BY_ID.has(value as RngId);
}

/**
 * Builds a fresh generator. Seedable generators get `seed`; the rest ignore it
 * entirely (their interface simply has no `reseed`).
 */
export function createRng(
  id: RngId,
  seed: number,
  order: BitOrder = "high",
): RNG {
  switch (id) {
    case "math-random":
      return createMathRandom(order);
    case "crypto-random":
      return createCryptoRandom(order);
    case "mulberry32":
      return createMulberry32(seed, order);
    case "xoshiro128":
      return createXoshiro128(seed, order);
    case "pcg32":
      return createPcg32(seed, order);
    case "randu":
      return createRandu(seed, order);
    case "lcg-broken":
      return createBrokenLcg(seed, order);
  }
}

export * from "./types";
