import { type BitOrder, bitIndexFor, bitOf, type RNG } from "./types";

/**
 * The textbook catastrophic LCG: x_{n+1} = 2·x_n + 1 (mod 2^31).
 *
 * The multiplier is a power of two, so it shifts the state instead of mixing
 * it. Whatever the seed, the state climbs by one bit position per iteration
 * until it reaches the fixed point 2^31 − 1, where 2x + 1 ≡ x and the sequence
 * stops changing forever. This generator emits at most 31 different outputs and
 * then an infinite stream of heads.
 *
 * It is here as the opposite of RANDU. RANDU's top bit passes every statistical
 * test here — its defect is invisible in the marginal distribution. This one
 * makes the law of large numbers fail outright: the running proportion climbs
 * to 1 and stays there, because the limit of the sequence is not 0.5.
 */
export class BrokenLcgRNG implements RNG {
  readonly id = "lcg-broken" as const;
  readonly name = "Broken LCG (a=2, c=1)";
  readonly seedable = true;

  private readonly bitIndex: number;
  private state = 1;

  constructor(seed = 0x0000_0001, order: BitOrder = "high") {
    this.bitIndex = bitIndexFor(order, 31);
    this.reseed(seed);
  }

  reseed(seed: number): void {
    const masked = (seed | 0) & 0x7fff_ffff;
    this.state = masked === 0 ? 1 : masked;
  }

  private nextUint32(): number {
    // (2x + 1) mod 2^31, computed without overflowing.
    this.state = (((this.state << 1) | 1) & 0x7fff_ffff) >>> 0;
    return this.state;
  }

  nextBit(): 0 | 1 {
    return bitOf(this.nextUint32(), this.bitIndex);
  }
}

export function createBrokenLcg(seed: number, order: BitOrder): RNG {
  return new BrokenLcgRNG(seed, order);
}
