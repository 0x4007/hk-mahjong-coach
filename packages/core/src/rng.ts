export const RNG_VERSION = "xoshiro128ss-v1" as const;

export interface RandomSource {
  readonly seed: string;
  readonly version: typeof RNG_VERSION;
  nextUint32(): number;
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
}

const hashSeed = (seed: string): [number, number, number, number] => {
  let first = 1_779_033_703;
  let second = 3_144_134_277;
  let third = 1_013_904_242;
  let fourth = 2_773_480_762;

  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    first = second ^ Math.imul(first ^ code, 597_399_067);
    second = third ^ Math.imul(second ^ code, 2_869_860_233);
    third = fourth ^ Math.imul(third ^ code, 951_274_213);
    fourth = first ^ Math.imul(fourth ^ code, 2_716_044_179);
  }

  first = Math.imul(third ^ (first >>> 18), 597_399_067);
  second = Math.imul(fourth ^ (second >>> 22), 2_869_860_233);
  third = Math.imul(first ^ (third >>> 17), 951_274_213);
  fourth = Math.imul(second ^ (fourth >>> 19), 2_716_044_179);

  const result: [number, number, number, number] = [
    (first ^ second ^ third ^ fourth) >>> 0,
    (second ^ first) >>> 0,
    (third ^ first) >>> 0,
    (fourth ^ first) >>> 0,
  ];

  /* v8 ignore next -- defensive guard for the astronomically unlikely all-zero seed hash */
  if (result.every((value) => value === 0)) {
    result[0] = 1;
  }

  return result;
};

const rotateLeft = (value: number, amount: number): number =>
  ((value << amount) | (value >>> (32 - amount))) >>> 0;

/** Creates an isolated deterministic random source. The seed is persisted verbatim. */
export const createSeededRandom = (seed: string): RandomSource => {
  if (seed.length === 0) {
    throw new TypeError("Seed must not be empty");
  }

  let [first, second, third, fourth] = hashSeed(seed);

  const nextUint32 = (): number => {
    const result = Math.imul(rotateLeft(Math.imul(second, 5) >>> 0, 7), 9) >>> 0;
    const temporary = (second << 9) >>> 0;

    third ^= first;
    fourth ^= second;
    second ^= third;
    first ^= fourth;
    third ^= temporary;
    fourth = rotateLeft(fourth, 11);

    return result;
  };

  return {
    seed,
    version: RNG_VERSION,
    nextUint32,
    nextFloat: () => nextUint32() / 0x1_0000_0000,
    nextInt: (maxExclusive: number): number => {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0xffff_ffff) {
        throw new RangeError("maxExclusive must be an integer from 1 through 4294967295");
      }

      const acceptanceLimit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
      let value = nextUint32();
      while (value >= acceptanceLimit) {
        value = nextUint32();
      }
      return value % maxExclusive;
    },
  };
};

/** Fisher–Yates shuffle that leaves the input unchanged. */
export const shuffle = <Value>(
  values: readonly Value[],
  random: RandomSource,
): readonly Value[] => {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = random.nextInt(index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[otherIndex] as Value;
    shuffled[otherIndex] = current as Value;
  }
  return shuffled;
};

/** Length-prefixes seed components so derivation cannot collide at separator boundaries. */
export const deriveSeed = (baseSeed: string, ...parts: readonly string[]): string =>
  [baseSeed, ...parts].map((part) => `${String(part.length)}:${part}`).join("|");
