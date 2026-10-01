import { type BitOrder, bitIndexFor, bitOf, imul32, type RNG } from "./types";

/**
 * RANDU — IBM's 1965 generator, x = 65539·x mod 2^31.
 *
 * It is here to be caught. 65539 = 2^16 + 3 means every output is (almost)
 * congruent to 3·x modulo 2^16, so consecutive draws lie on parallel planes of a
 * 3-dimensional lattice. That is why RANDU produces visibly parallel streaks
 * instead of random noise, and why the Kolmogorov strong law misbehaves badly
 * for it.
 *
 * The failure shows up where the multiplier leaks. 65539 = 2^16 + 3, so every
 * output is congruent to 3·x modulo 2^16 and consecutive draws lie on parallel
 * planes of a 3-dimensional lattice. That is why RANDU's coin is not quite
 * memoryless: successive outputs share structure.
 *
 * Where that bites depends entirely on which bit you turn into a coin, and the
 * honest answer is unpleasant for a demo. Take the *top* bit (bit 30) and it is
 * essentially a fair coin: the running proportion converges to 0.5, lag-1
 * agreement sits near 0.5, and the χ² test does not reject it. RANDU is a
 * failure of serial correlation, not of the marginal distribution, so a
 * majority-vote chart alone will not expose it. Take the *low* bit and the bias
 * is total — the multiplier is odd, so bit 0 is always 1 and the "coin" comes
 * up heads forever.
 *
 * That is exactly why this app ships `lcg-broken` alongside RANDU: a generator
 * that fails the law of large numbers visibly, in the first chart, on screen.
 */
export class RanduRNG implements RNG {
  readonly id = "randu" as const;
  readonly name = "RANDU (weak LCG)";
  readonly seedable = true;

  private readonly bitIndex: number;
  private state = 1;

  constructor(seed = 0x0000_0001, order: BitOrder = "high") {
    this.bitIndex = bitIndexFor(order, 31);
    this.reseed(seed);
  }

  reseed(seed: number): void {
    // RANDU lives in [0, 2^31). Odd seeds are the ones people actually used.
    const masked = (seed | 0) & 0x7fff_ffff;
    this.state = masked === 0 ? 1 : masked;
  }

  private nextUint32(): number {
    this.state = imul32(this.state, 65539) & 0x7fff_ffff;
    return this.state >>> 0;
  }

  nextBit(): 0 | 1 {
    return bitOf(this.nextUint32(), this.bitIndex);
  }
}

export function createRandu(seed: number, order: BitOrder): RNG {
  return new RanduRNG(seed, order);
}
