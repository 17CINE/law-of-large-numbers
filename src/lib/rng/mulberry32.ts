import { type BitOrder, bitIndexFor, bitOf, imul32, type RNG } from "./types";

/**
 * Mulberry32 — a 32-bit state, 32-bit output PRNG popularised by Tommy Ettinger's
 * `prng` package. Fast, passes basic statistical batteries, small state, and
 * fully reproducible from a seed.
 */
export class Mulberry32RNG implements RNG {
  readonly id = "mulberry32" as const;
  readonly name = "Mulberry32";
  readonly seedable = true;

  private readonly bitIndex: number;
  private state: number;

  constructor(seed = 0x2f6e2b1, order: BitOrder = "high") {
    this.bitIndex = bitIndexFor(order, 32);
    this.state = seed >>> 0;
  }

  reseed(seed: number): void {
    this.state = seed >>> 0;
  }

  nextBit(): 0 | 1 {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = imul32(t ^ (t >>> 15), t | 1);
    t ^= t + imul32(t ^ (t >>> 7), t | 61);
    const word = (t ^ (t >>> 14)) >>> 0;
    return bitOf(word, this.bitIndex);
  }
}

export function createMulberry32(seed: number, order: BitOrder): RNG {
  return new Mulberry32RNG(seed, order);
}
