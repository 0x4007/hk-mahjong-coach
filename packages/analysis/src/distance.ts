import {
  TILE_DEFINITIONS,
  getTileDefinition,
  sortTileTypes,
  tileTypeFromInstanceId,
  type StandardTileTypeId,
  type TileInstanceId,
  type TileTypeId,
} from "@hk-mahjong/core/public";
import type { DistanceOptions, DistanceToReady } from "./types.js";

export const STANDARD_TILE_TYPES: readonly StandardTileTypeId[] = Object.freeze(
  TILE_DEFINITIONS.filter(
    (definition): definition is typeof definition & { id: StandardTileTypeId } => !definition.bonus,
  ).map(({ id }) => id),
);

const TYPE_INDEX = new Map(STANDARD_TILE_TYPES.map((typeId, index) => [typeId, index]));
const ORPHAN_TYPES = new Set<StandardTileTypeId>(
  STANDARD_TILE_TYPES.filter((typeId) => {
    const definition = getTileDefinition(typeId);
    return definition.honor || definition.terminal;
  }),
);

const countTypes = (tileTypes: readonly TileTypeId[]): number[] => {
  const counts = Array.from({ length: STANDARD_TILE_TYPES.length }, () => 0);
  for (const typeId of tileTypes) {
    const definition = getTileDefinition(typeId);
    if (definition.bonus) {
      throw new TypeError("Distance calculation cannot include bonus tiles");
    }
    const index = TYPE_INDEX.get(typeId as StandardTileTypeId);
    if (index === undefined) {
      throw new RangeError(`Unknown standard tile type ${typeId}`);
    }
    counts[index] = counts[index]! + 1;
    if (counts[index] > 4) {
      throw new RangeError(`Distance calculation cannot include five copies of ${typeId}`);
    }
  }
  return counts;
};

const nextNonzero = (counts: readonly number[], from: number): number => {
  for (let index = from; index < counts.length; index += 1) {
    if (counts[index]! > 0) {
      return index;
    }
  }
  return counts.length;
};

const isSequenceStart = (index: number): boolean => {
  const definition = getTileDefinition(STANDARD_TILE_TYPES[index]!);
  return definition.rank !== undefined && definition.rank <= 7;
};

const isSameSuitOffset = (leftIndex: number, rightIndex: number, offset: number): boolean => {
  const left = getTileDefinition(STANDARD_TILE_TYPES[leftIndex]!);
  const right = getTileDefinition(STANDARD_TILE_TYPES[rightIndex]!);
  return (
    left.rank !== undefined &&
    right.rank !== undefined &&
    left.category === right.category &&
    right.rank === left.rank + offset
  );
};

const STANDARD_MEMO_LIMIT = 8_192;
const standardMemo = new Map<string, number>();

const assertDistanceShape = (tileCount: number, declaredMeldCount: number): void => {
  if (!Number.isSafeInteger(declaredMeldCount) || declaredMeldCount < 0 || declaredMeldCount > 4) {
    throw new RangeError("Declared meld count must be an integer from zero through four");
  }
  const afterDiscardCount = 13 - declaredMeldCount * 3;
  const beforeDiscardCount = afterDiscardCount + 1;
  if (tileCount !== afterDiscardCount && tileCount !== beforeDiscardCount) {
    throw new RangeError(
      `Distance calculation expected ${String(afterDiscardCount)} or ${String(beforeDiscardCount)} concealed tiles with ${String(declaredMeldCount)} declared melds; received ${String(tileCount)}`,
    );
  }
};

const standardRawDistance = (
  sourceCounts: readonly number[],
  declaredMeldCount: number,
): number => {
  const topLevelKey = `${sourceCounts.join("")}|${String(declaredMeldCount)}`;
  const cached = standardMemo.get(topLevelKey);
  if (cached !== undefined) {
    return cached;
  }

  const counts = [...sourceCounts];
  const memo = new Map<string, number>();
  const search = (
    startIndex: number,
    concealedMelds: number,
    pairUsed: 0 | 1,
    incompleteGroups: number,
  ): number => {
    const index = nextNonzero(counts, startIndex);
    const key = `${counts.join("")}|${String(index)}|${String(concealedMelds)}|${String(pairUsed)}|${String(incompleteGroups)}`;
    const known = memo.get(key);
    if (known !== undefined) {
      return known;
    }

    const totalMelds = declaredMeldCount + concealedMelds;
    const usableIncomplete = Math.min(incompleteGroups, Math.max(0, 4 - totalMelds));
    let best = 8 - totalMelds * 2 - usableIncomplete - pairUsed;
    if (index >= counts.length) {
      memo.set(key, best);
      return best;
    }

    if (totalMelds < 4 && counts[index]! >= 3) {
      counts[index] = counts[index]! - 3;
      best = Math.min(best, search(index, concealedMelds + 1, pairUsed, incompleteGroups));
      counts[index] = counts[index] + 3;
    }
    if (
      totalMelds < 4 &&
      isSequenceStart(index) &&
      counts[index + 1]! > 0 &&
      counts[index + 2]! > 0 &&
      isSameSuitOffset(index, index + 1, 1) &&
      isSameSuitOffset(index, index + 2, 2)
    ) {
      counts[index] = counts[index]! - 1;
      counts[index + 1] = counts[index + 1]! - 1;
      counts[index + 2] = counts[index + 2]! - 1;
      best = Math.min(best, search(index, concealedMelds + 1, pairUsed, incompleteGroups));
      counts[index] = counts[index] + 1;
      counts[index + 1] = counts[index + 1]! + 1;
      counts[index + 2] = counts[index + 2]! + 1;
    }
    if (counts[index]! >= 2) {
      counts[index] = counts[index]! - 2;
      if (pairUsed === 0) {
        best = Math.min(best, search(index, concealedMelds, 1, incompleteGroups));
      }
      if (incompleteGroups < 4) {
        best = Math.min(best, search(index, concealedMelds, pairUsed, incompleteGroups + 1));
      }
      counts[index] = counts[index] + 2;
    }
    if (incompleteGroups < 4 && counts[index + 1]! > 0 && isSameSuitOffset(index, index + 1, 1)) {
      counts[index] = counts[index]! - 1;
      counts[index + 1] = counts[index + 1]! - 1;
      best = Math.min(best, search(index, concealedMelds, pairUsed, incompleteGroups + 1));
      counts[index] = counts[index] + 1;
      counts[index + 1] = counts[index + 1]! + 1;
    }
    if (incompleteGroups < 4 && counts[index + 2]! > 0 && isSameSuitOffset(index, index + 2, 2)) {
      counts[index] = counts[index]! - 1;
      counts[index + 2] = counts[index + 2]! - 1;
      best = Math.min(best, search(index, concealedMelds, pairUsed, incompleteGroups + 1));
      counts[index] = counts[index] + 1;
      counts[index + 2] = counts[index + 2]! + 1;
    }

    counts[index] = counts[index]! - 1;
    best = Math.min(best, search(index, concealedMelds, pairUsed, incompleteGroups));
    counts[index] = counts[index] + 1;
    memo.set(key, best);
    return best;
  };

  const result = search(0, 0, 0, 0);
  if (standardMemo.size >= STANDARD_MEMO_LIMIT) {
    standardMemo.clear();
  }
  standardMemo.set(topLevelKey, result);
  return result;
};

const sevenPairsRawDistance = (counts: readonly number[], quadAsTwoPairs: boolean): number => {
  let choices = new Map<number, number>([[0, 0]]);
  for (const count of counts) {
    const next = new Map<number, number>();
    const maximumUnits = quadAsTwoPairs ? 2 : 1;
    for (const [used, overlap] of choices) {
      for (let units = 0; units <= maximumUnits && used + units <= 7; units += 1) {
        const candidate = overlap + Math.min(count, units * 2);
        next.set(used + units, Math.max(next.get(used + units) ?? -1, candidate));
      }
    }
    choices = next;
  }
  const overlap = choices.get(7) ?? 0;
  return 13 - overlap;
};

const thirteenOrphansRawDistance = (counts: readonly number[]): number => {
  let singles = 0;
  let hasPair = false;
  for (let index = 0; index < counts.length; index += 1) {
    const typeId = STANDARD_TILE_TYPES[index]!;
    if (!ORPHAN_TYPES.has(typeId)) {
      continue;
    }
    if (counts[index]! > 0) {
      singles += 1;
    }
    if (counts[index]! > 1) {
      hasPair = true;
    }
  }
  return 13 - singles - (hasPair ? 1 : 0);
};

export interface RawDistanceProfile {
  standard: number;
  sevenPairs: number | null;
  thirteenOrphans: number | null;
  minimum: number;
}

export const rawDistanceToReady = (
  tileTypes: readonly TileTypeId[],
  declaredMeldCount: number,
  options: DistanceOptions,
): RawDistanceProfile => {
  assertDistanceShape(tileTypes.length, declaredMeldCount);
  const counts = countTypes(tileTypes);
  const standard = standardRawDistance(counts, declaredMeldCount);
  const sevenPairs =
    options.allowSevenPairs && declaredMeldCount === 0
      ? sevenPairsRawDistance(counts, options.sevenPairsAllowsQuadAsTwoPairs)
      : null;
  const thirteenOrphans =
    options.allowThirteenOrphans && declaredMeldCount === 0
      ? thirteenOrphansRawDistance(counts)
      : null;
  return {
    standard,
    sevenPairs,
    thirteenOrphans,
    minimum: Math.min(
      standard,
      ...(sevenPairs === null ? [] : [sevenPairs]),
      ...(thirteenOrphans === null ? [] : [thirteenOrphans]),
    ),
  };
};

export const distanceToReady = (
  tileTypes: readonly TileTypeId[],
  declaredMeldCount: number,
  options: DistanceOptions,
): DistanceToReady => {
  const raw = rawDistanceToReady(tileTypes, declaredMeldCount, options);
  const minimum = Math.max(0, raw.minimum);
  const bestForms: DistanceToReady["bestForms"] = [
    ...(raw.standard === raw.minimum ? (["standard"] as const) : []),
    ...(raw.sevenPairs === raw.minimum ? (["seven_pairs"] as const) : []),
    ...(raw.thirteenOrphans === raw.minimum ? (["thirteen_orphans"] as const) : []),
  ];
  return {
    standard: Math.max(0, raw.standard),
    sevenPairs: raw.sevenPairs === null ? null : Math.max(0, raw.sevenPairs),
    thirteenOrphans: raw.thirteenOrphans === null ? null : Math.max(0, raw.thirteenOrphans),
    minimum,
    bestForms,
  };
};

export const distanceForPhysicalTiles = (
  tileIds: readonly TileInstanceId[],
  declaredMeldCount: number,
  options: DistanceOptions,
): DistanceToReady =>
  distanceToReady(sortTileTypes(tileIds.map(tileTypeFromInstanceId)), declaredMeldCount, options);
