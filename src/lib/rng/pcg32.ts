import {
  type BitOrder,
  bitIndexFor,
  bitOf,
  normalizeSeed,
  type RNG,
} from "./types";

/**
 * PCG32 (O'Neill, pcg-random.org). A 64-bit LCG state with an XSH-RR output
 * permutation. Far better statistics than a bare LCG at the same speed class.
 *
 * JavaScript has no 64-bit integers, so the state lives as two unsigned 32-bit
 * words and every wide operation is assembled from 16-bit limbs. Each partial
 * product is at most 2^32 and each limb sum stays below 2^53, so all of it is
 * exact in double precision. `reference.test.ts` checks every output word
 * against a BigInt transcription of the reference C.
 */
const PCG_MULTIPLIER = 6364136223846793005n;
const PCG_INCREMENT = 1442695040888963407n;

/** Split a 64-bit BigInt constant into 32-bit halves (computed once, at module load). */
const MULT_HI = Number(PCG_MULTIPLIER >> 32n) >>> 0;
const MULT_LO = Number(PCG_MULTIPLIER & 0xffff_ffffn) >>> 0;
const INC_HI = Number(PCG_INCREMENT >> 32n) >>> 0;
const INC_LO = Number(PCG_INCREMENT & 0xffff_ffffn) >>> 0;

const TWO_16 = 0x1_0000;
const TWO_32 = 0x1_0000_0000;

export class Pcg32RNG implements RNG {
  readonly id = "pcg32" as const;
  readonly name = "PCG32";
  readonly seedable = true;

  private readonly bitIndex: number;
  /** 64-bit state, unsigned 32-bit halves. */
  private stateHi = 0;
  private stateLo = 0;

  constructor(seed = 0x2545f491, order: BitOrder = "high") {
    this.bitIndex = bitIndexFor(order);
    this.reseed(seed);
  }

  reseed(seed: number): void {
    // Canonical pcg32_srandom_r: state = 0; step(); state += (seed << 1) | 1; step();
    this.stateHi = 0;
    this.stateLo = 0;
    this.step();
    // (seed << 1) | 1 is a 33-bit quantity in the reference, so split it into a
    // low and a high word rather than truncating.
    const value = normalizeSeed(seed) * 2 + 1;
    const addLow = value % TWO_32;
    const addHigh = Math.floor(value / TWO_32);
    const sumLo = this.stateLo + addLow;
    const carry = sumLo >= TWO_32 ? 1 : 0;
    this.stateLo = sumLo % TWO_32;
    this.stateHi = (this.stateHi + addHigh + carry) % TWO_32;
    this.step();
  }

  /** state = state * 6364136223846793005 + 1442695040888963407 (mod 2^64). */
  private step(): void {
    const lo = this.stateLo;
    const hi = this.stateHi;
    const a0 = lo & 0xffff;
    const a1 = lo >>> 16;
    const a2 = hi & 0xffff;
    const a3 = hi >>> 16;
    const b0 = MULT_LO & 0xffff;
    const b1 = MULT_LO >>> 16;
    const b2 = MULT_HI & 0xffff;
    const b3 = MULT_HI >>> 16;

    // Schoolbook multiplication in base 2^16. Only the four low digits matter,
    // so the final carry out of digit 3 is discarded. Every `t` is below 2^34,
    // which is exact in a double.
    let t = a0 * b0;
    const d0 = t % TWO_16;
    let carry = Math.floor(t / TWO_16);

    t = a0 * b1 + a1 * b0 + carry;
    const d1 = t % TWO_16;
    carry = Math.floor(t / TWO_16);

    t = a0 * b2 + a1 * b1 + a2 * b0 + carry;
    const d2 = t % TWO_16;
    carry = Math.floor(t / TWO_16);

    t = a0 * b3 + a1 * b2 + a2 * b1 + a3 * b0 + carry;
    const d3 = t % TWO_16;

    const word0 = d0 + d1 * TWO_16;
    const word1 = d2 + d3 * TWO_16;

    // Add the increment, propagating the carry from the low word only.
    const sum0 = word0 + INC_LO;
    const sum1 = word1 + INC_HI + (sum0 >= TWO_32 ? 1 : 0);
    this.stateLo = sum0 % TWO_32;
    this.stateHi = sum1 % TWO_32;
  }

  /**
   * XSH-RR output permutation applied to the pre-advance state:
   *
   *   xorshifted = (uint32_t)(((old >> 18) ^ old) >> 27);
   *   rot        = (uint32_t)(old >> 59);
   *   return rotr32(xorshifted, rot);
   */
  private nextUint32(): number {
    const hi = this.stateHi;
    const lo = this.stateLo;
    // 64-bit (old >> 18) ^ old, kept as two 32-bit halves.
    const tHi = (hi >>> 18) ^ hi;
    const tLo = (((hi << 14) | (lo >>> 18)) >>> 0) ^ lo;
    // Bits 27..58 of that value.
    const xorshifted = ((tHi << 5) | (tLo >>> 27)) >>> 0;
    const rot = hi >>> 27;
    this.step();
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  }

  nextBit(): 0 | 1 {
    return bitOf(this.nextUint32(), this.bitIndex);
  }
}

export function createPcg32(seed: number, order: BitOrder): RNG {
  return new Pcg32RNG(seed, order);
}
