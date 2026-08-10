import { describe, expect, it } from "vitest";
import { FpsRng } from "./rng.js";

describe("FPS RNG", () => {
  it("locks the xoshiro128** multiply-rotate-multiply vector", () => {
    const rng = new FpsRng("rng-vector");
    expect([
      rng.nextUint32(),
      rng.nextUint32(),
      rng.nextUint32(),
      rng.nextUint32(),
      rng.nextUint32(),
    ]).toEqual([1_075_693_298, 274_465_725, 715_442_910, 4_276_232_091, 2_408_057_654]);
  });

  it("rejects invalid integer bounds", () => {
    const rng = new FpsRng("bounds");
    expect(() => rng.nextInt(0)).toThrow("fps_rng_invalid_bound");
    expect(() => rng.nextInt(Number.POSITIVE_INFINITY)).toThrow("fps_rng_invalid_bound");
    expect(rng.nextInt(3)).toBeGreaterThanOrEqual(0);
  });
});
