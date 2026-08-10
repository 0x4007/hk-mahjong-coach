import { canonicalJsonHash } from "@hk-mahjong/core";
import { FPS_RNG_VERSION } from "./types.js";

const rotl = (value: number, shift: number): number =>
  ((value << shift) | (value >>> (32 - shift))) >>> 0;

/** Deterministic xoshiro128** stream used for all randomized FPS decisions. */
export class FpsRng {
  public readonly version = FPS_RNG_VERSION;
  private state0: number;
  private state1: number;
  private state2: number;
  private state3: number;

  public constructor(seed: string, namespace = "match") {
    const digest = canonicalJsonHash({ seed, namespace, version: FPS_RNG_VERSION });
    this.state0 = Number.parseInt(digest.slice(0, 8), 16) >>> 0;
    this.state1 = Number.parseInt(digest.slice(8, 16), 16) >>> 0;
    this.state2 = Number.parseInt(digest.slice(16, 24), 16) >>> 0;
    this.state3 = Number.parseInt(digest.slice(24, 32), 16) >>> 0;
    if ((this.state0 | this.state1 | this.state2 | this.state3) === 0) this.state0 = 1;
  }

  public nextUint32(): number {
    const result = rotl(Math.imul(this.state1, 5), 7);
    const output = Math.imul(result, 9) >>> 0;
    const t = (this.state1 << 9) >>> 0;
    this.state2 ^= this.state0;
    this.state3 ^= this.state1;
    this.state1 ^= this.state2;
    this.state0 ^= this.state3;
    this.state2 ^= t;
    this.state3 = ((this.state3 << 11) | (this.state3 >>> 21)) >>> 0;
    return output;
  }

  public nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("fps_rng_invalid_bound");
    }
    return Math.floor((this.nextUint32() / 0x1_0000_0000) * maxExclusive);
  }
}
