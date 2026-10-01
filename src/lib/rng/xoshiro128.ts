import {
  type BitOrder,
  bitIndexFor,
  bitOf,
  imul32,
  normalizeSeed,
  type RNG,
  rotl32,
} from "./types";

/**
 * xoshiro128** 1.0 (Blackman & Vigna).
 *
 * Period 2^128 - 1, passes BigCrush, and is the generator of choice when you
 * want statistical quality with a tiny (128-bit) state. Note that state is
 * zero-initialised, so a zero seed must be scrubbed — `normalizeSeed` does it.
 */
export class Xoshiro128StarStarRNG implements RNG {
  readonly id = "xoshiro128" as const;
  readonly name = "xoshiro128**";
  readonly seedable = true;

  private readonly bitIndex: number;
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed = 0x1a2b3c4d, order: BitOrder = "high") {
    this.bitIndex = bitIndexFor(order, 32);
    this.reseed(seed);
  }

  reseed(seed: number): void {
    // Expand one 32-bit user seed into four 32-bit words with SplitMix32,
    // which keeps small/sequential seeds from producing correlated states.
    let z = normalizeSeed(seed);
    const next = () => {
      z = (z + 0x9e3779b9) | 0;
      let x = z;
      x = imul32(x ^ (x >>> 16), 0x21f0aaad);
      x = imul32(x ^ (x >>> 15), 0x735a2d97);
      return (x ^ (x >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      this.s0 = 0x9e3779b9;
      this.s1 = 0x243f6a88;
      this.s2 = 0xb7e15162;
      this.s3 = 0x85ebca6b;
    }
  }

  private nextUint32(): number {
    const result = imul32(rotl32(imul32(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl32(this.s3, 11);
    return result;
  }

  nextBit(): 0 | 1 {
    return bitOf(this.nextUint32(), this.bitIndex);
  }
}

export function createXoshiro128(seed: number, order: BitOrder): RNG {
  return new Xoshiro128StarStarRNG(seed, order);
}
