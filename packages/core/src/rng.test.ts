import { describe, expect, it } from "vitest";
import { createSeededRandom, deriveSeed, RNG_VERSION, shuffle } from "./rng.js";

describe("deterministic random source", () => {
  it("repeats the same sequence for the same seed", () => {
    const first = createSeededRandom("demo-001");
    const second = createSeededRandom("demo-001");
    const sequence = [
      first.nextUint32(),
      first.nextUint32(),
      first.nextUint32(),
      first.nextUint32(),
      first.nextUint32(),
      first.nextUint32(),
      first.nextUint32(),
      first.nextUint32(),
    ];

    expect(sequence).toEqual([
      3_719_380_348, 971_800_894, 3_501_350_384, 1_922_268_624, 4_231_331_101, 1_688_146_719,
      2_066_542_031, 3_312_946_086,
    ]);
    expect(sequence).toEqual([
      second.nextUint32(),
      second.nextUint32(),
      second.nextUint32(),
      second.nextUint32(),
      second.nextUint32(),
      second.nextUint32(),
      second.nextUint32(),
      second.nextUint32(),
    ]);
    expect(first.version).toBe(RNG_VERSION);
    expect(first.nextFloat()).toBeGreaterThanOrEqual(0);
    expect(first.nextFloat()).toBeLessThan(1);
    expect(createSeededRandom("different").nextUint32()).not.toBe(sequence[0]);
  });

  it("shuffles without mutating the source", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const first = shuffle(source, createSeededRandom("wall-seed"));
    const second = shuffle(source, createSeededRandom("wall-seed"));

    expect(first).toEqual(second);
    expect(first).not.toEqual(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffle([], createSeededRandom("empty"))).toEqual([]);
    expect(shuffle(["only"], createSeededRandom("one"))).toEqual(["only"]);
  });

  it("validates integer bounds and derives collision-resistant component strings", () => {
    const random = createSeededRandom("bounds");
    expect(() => createSeededRandom("")).toThrow(/must not be empty/u);
    expect(() => random.nextInt(0)).toThrow(RangeError);
    expect(() => random.nextInt(1.5)).toThrow(RangeError);
    expect(() => random.nextInt(0x1_0000_0000)).toThrow(RangeError);
    expect(deriveSeed("a|b", "c")).not.toBe(deriveSeed("a", "b|c"));
    expect(Array.from({ length: 1000 }, () => random.nextInt(7)).every((value) => value < 7)).toBe(
      true,
    );
    expect(
      Array.from({ length: 20 }, () => random.nextInt(0x8000_0001)).every(
        (value) => value < 0x8000_0001,
      ),
    ).toBe(true);
  });
});
