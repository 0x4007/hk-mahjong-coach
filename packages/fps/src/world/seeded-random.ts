import { canonicalJsonHash } from "@hk-mahjong/core";

export interface SeededRandomService {
  readonly seed: string;
  readonly generatorVersion: number;
  randomFloat(namespace: string, globalX: number, globalZ: number, index?: number): number;
  randomInt(
    namespace: string,
    globalX: number,
    globalZ: number,
    maxExclusive: number,
    index?: number,
  ): number;
  randomBoolean(namespace: string, globalX: number, globalZ: number, index?: number): boolean;
}

const validateCoordinate = (value: number, name: string): void => {
  if (!Number.isFinite(value)) throw new Error(`world_random_invalid_${name}`);
};

const digestFloat = (
  seed: string,
  generatorVersion: number,
  namespace: string,
  globalX: number,
  globalZ: number,
  index: number,
): number => {
  if (namespace.trim().length === 0) throw new Error("world_random_invalid_namespace");
  validateCoordinate(globalX, "x");
  validateCoordinate(globalZ, "z");
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("world_random_invalid_index");
  const digest = canonicalJsonHash({
    seed,
    generatorVersion,
    namespace,
    globalX,
    globalZ,
    index,
  });
  return Number.parseInt(digest.slice(0, 8), 16) / 0x1_0000_0000;
};

export const createSeededRandom = (seed: string, generatorVersion: number): SeededRandomService => {
  if (seed.trim().length === 0) throw new Error("world_random_invalid_seed");
  if (!Number.isSafeInteger(generatorVersion) || generatorVersion < 1) {
    throw new Error("world_random_invalid_generator_version");
  }
  return {
    seed,
    generatorVersion,
    randomFloat: (namespace, globalX, globalZ, index = 0) =>
      digestFloat(seed, generatorVersion, namespace, globalX, globalZ, index),
    randomInt: (namespace, globalX, globalZ, maxExclusive, index = 0) => {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error("world_random_invalid_bound");
      }
      return Math.floor(
        digestFloat(seed, generatorVersion, namespace, globalX, globalZ, index) * maxExclusive,
      );
    },
    randomBoolean: (namespace, globalX, globalZ, index = 0) =>
      digestFloat(seed, generatorVersion, namespace, globalX, globalZ, index) >= 0.5,
  };
};

export const randomFloat = (
  seed: string,
  generatorVersion: number,
  namespace: string,
  globalX: number,
  globalZ: number,
  index = 0,
): number => createSeededRandom(seed, generatorVersion).randomFloat(namespace, globalX, globalZ, index);
