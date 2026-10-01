import { type BitOrder, bitIndexFor, bitOf, type RNG } from "./types";

/**
 * V8's `Math.random()` is xorshift128+ on a 64-bit state (a 128-bit
 * xorshift128+ variant), which is statistically fine but not seedable from the
 * outside. We only use the top bit of the 53-bit double's mantissa scale.
 */
export class MathRandomRNG implements RNG {
  readonly id = "math-random" as const;
  readonly name = "Math.random (V8 xorshift128+)";
  readonly seedable = false;

  private readonly bitIndex: number;

  constructor(order: BitOrder = "high") {
    this.bitIndex = bitIndexFor(order, 32);
  }

  nextBit(): 0 | 1 {
    // Math.random() returns [0, 1); scale to the full 32-bit range and take the
    // requested bit of that word.
    const word = (Math.random() * 0x1_0000_0000) >>> 0;
    return bitOf(word, this.bitIndex);
  }
}

export function createMathRandom(order: BitOrder): RNG {
  return new MathRandomRNG(order);
}
