/**
 * The one interface every generator implements.
 *
 * `nextBit` deliberately returns the *high-order* bit of a 32-bit word
 * (`(word >>> 31) & 1`). The low-order bits of weak generators (LCGs such as
 * RANDU) have very short periods, so a fair coin built from bit 0 would show a
 * bias that is an artefact of the generator, not of the coin.
 */
export interface RNG {
  /** Stable id used in worker messages and React keys. */
  readonly id: RngId;
  /** Human readable label shown in the UI. */
  readonly name: string;
  /** True when the generator exposes `reseed`. */
  readonly seedable: boolean;
  /** Draws one fair bit. */
  nextBit(): 0 | 1;
  /** Restarts the stream from `seed` (only called when `seedable`). */
  reseed?(seed: number): void;
}

export type RngId =
  | "math-random"
  | "crypto-random"
  | "mulberry32"
  | "xoshiro128"
  | "pcg32"
  | "randu"
  | "lcg-broken";

/** Which bit of the 32-bit output is used as the coin flip. */
export type BitOrder = "high" | "low";

export interface RngDescriptor {
  readonly id: RngId;
  readonly name: string;
  readonly shortName: string;
  readonly seedable: boolean;
  /** One-line plain-English description for the UI. */
  readonly description: string;
  /** True for the intentionally weak generator. */
  readonly weak: boolean;
  /** Default seed used when the user has not picked one. */
  readonly defaultSeed: number;
}

/**
 * Which bit of the generator's own output width is used as the coin flip.
 *
 * "High" means the most significant bit, which is the *least* biased bit of any
 * generator — the low-order bits of weak LCGs are where the pathologies live.
 * `outputBits` is 32 for every generator except RANDU, whose modulus is 2^31,
 * so its most significant bit is bit 30.
 */
export function bitIndexFor(order: BitOrder, outputBits = 32): number {
  return order === "high" ? outputBits - 1 : 0;
}

/** Extracts one bit of a raw output word. */
export function bitOf(word: number, bitIndex: number): 0 | 1 {
  return ((word >>> bitIndex) & 1) as 0 | 1;
}

/**
 * `Math.imul` gives exact 32-bit signed multiply semantics, which every
 * generator below relies on. Kept as a named helper so the intent is obvious
 * at each call site.
 */
export function imul32(a: number, b: number): number {
  return Math.imul(a, b) | 0;
}

/** leftRotate32 */
export function rotl32(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** rightRotate32 */
export function rotr32(x: number, k: number): number {
  return (x >>> k) | (x << (32 - k));
}

/** SplitMix32, used to expand a single 32-bit seed into a full state. */
export function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = imul32(z ^ (z >>> 16), 0x21f0aaad);
    z = imul32(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** Turns a user-supplied seed into a well-mixed non-zero 32-bit value. */
export function normalizeSeed(seed: number): number {
  const mixed = splitmix32(seed | 0)();
  // A zero state makes xoshiro128** / PCG32 degenerate, so force it non-zero.
  return mixed === 0 ? 0x9e3779b9 : mixed;
}
