import { type BitOrder, bitIndexFor, bitOf, type RNG } from "./types";

/** Minimal shape of the Web Crypto API that this generator needs. */
export interface RandomSource {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

const BUFFER_WORDS = 8192;

/**
 * `crypto.getRandomValues` — a real CSPRNG (ChaCha20-based in browsers).
 * It cannot be seeded, by design.
 *
 * Calling `getRandomValues` once per coin flip would dominate the runtime of
 * the whole simulation, so words are drawn in 32 KB batches and consumed one at
 * a time. That is still cryptographically fine: the buffer is filled by the
 * CSPRNG itself, we only read it back.
 */
export class CryptoRandomRNG implements RNG {
  readonly id = "crypto-random" as const;
  readonly name = "crypto.getRandomValues (CSPRNG)";
  readonly seedable = false;

  private readonly bitIndex: number;
  private readonly source: RandomSource;
  private buffer: Uint32Array;
  private index: number;

  constructor(order: BitOrder = "high", source?: RandomSource) {
    this.bitIndex = bitIndexFor(order, 32);
    const resolved = source ?? (globalThis.crypto as RandomSource | undefined);
    if (!resolved || typeof resolved.getRandomValues !== "function") {
      throw new Error("Web Crypto getRandomValues is not available here.");
    }
    this.source = resolved;
    this.buffer = new Uint32Array(BUFFER_WORDS);
    this.index = BUFFER_WORDS;
  }

  nextBit(): 0 | 1 {
    if (this.index >= this.buffer.length) {
      this.source.getRandomValues(this.buffer);
      this.index = 0;
    }
    const word = this.buffer[this.index] ?? 0;
    this.index += 1;
    return bitOf(word, this.bitIndex);
  }
}

export function createCryptoRandom(order: BitOrder): RNG {
  return new CryptoRandomRNG(order);
}
