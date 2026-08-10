import {
  canonicalJson,
  getTileDefinition,
  sortTileTypes,
  tileTypeFromInstanceId,
  type ConcealedScoringGroup,
  type Meld,
  type StandardTileTypeId,
  type TileInstanceId,
  type WinningDecomposition as CoreWinningDecomposition,
  type WinningForm as CoreWinningForm,
} from "@hk-mahjong/core";

export type WinningForm = CoreWinningForm;
export type ConcealedGroup = ConcealedScoringGroup;
export type WinningDecomposition = CoreWinningDecomposition;

export interface WinningSolveOptions {
  allowSevenPairs: boolean;
  sevenPairsAllowsQuadAsTwoPairs: boolean;
  allowThirteenOrphans: boolean;
  thirteenOrphansRequireThirteenSidedWait: boolean;
  allowNineGates: boolean;
  nineGatesDeclaredKongsAllowed: boolean;
}

export interface WinningSolveInput {
  concealedTileIds: readonly TileInstanceId[];
  melds: readonly Meld[];
  winningTileId: TileInstanceId;
  options: WinningSolveOptions;
}

const standardType = (tileId: TileInstanceId): StandardTileTypeId => {
  const typeId = tileTypeFromInstanceId(tileId);
  if (getTileDefinition(typeId).bonus) {
    throw new TypeError("Winning solvers do not accept bonus tiles");
  }
  return typeId as StandardTileTypeId;
};

const tileCounts = (
  tileIds: readonly TileInstanceId[],
): ReadonlyMap<StandardTileTypeId, number> => {
  const counts = new Map<StandardTileTypeId, number>();
  for (const tileId of tileIds) {
    const typeId = standardType(tileId);
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  return counts;
};

const mutableCounts = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
): Map<StandardTileTypeId, number> => new Map(counts);

const adjustCount = (
  counts: Map<StandardTileTypeId, number>,
  typeId: StandardTileTypeId,
  amount: number,
): void => {
  const next = (counts.get(typeId) ?? 0) + amount;
  if (next < 0) {
    throw new Error(`Winning solver count underflow for ${typeId}`);
  }
  if (next === 0) {
    counts.delete(typeId);
  } else {
    counts.set(typeId, next);
  }
};

const firstRemainingType = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
): StandardTileTypeId | null =>
  (sortTileTypes([...counts.keys()]) as readonly StandardTileTypeId[])[0] ?? null;

const chowAfter = (
  typeId: StandardTileTypeId,
): readonly [StandardTileTypeId, StandardTileTypeId] | null => {
  const definition = getTileDefinition(typeId);
  if (
    definition.rank === undefined ||
    definition.rank > 7 ||
    !["characters", "dots", "bamboo"].includes(definition.category)
  ) {
    return null;
  }
  return [
    `${definition.category}.${String(definition.rank + 1)}` as StandardTileTypeId,
    `${definition.category}.${String(definition.rank + 2)}` as StandardTileTypeId,
  ];
};

const enumerateMeldGroups = (
  counts: Map<StandardTileTypeId, number>,
  groupsNeeded: number,
  groups: ConcealedGroup[],
  results: ConcealedGroup[][],
): void => {
  const typeId = firstRemainingType(counts);
  if (typeId === null) {
    if (groups.length === groupsNeeded) {
      results.push(structuredClone(groups));
    }
    return;
  }
  if (groups.length >= groupsNeeded) {
    return;
  }

  if ((counts.get(typeId) ?? 0) >= 3) {
    adjustCount(counts, typeId, -3);
    groups.push({ kind: "pung", tileTypes: [typeId, typeId, typeId] });
    enumerateMeldGroups(counts, groupsNeeded, groups, results);
    groups.pop();
    adjustCount(counts, typeId, 3);
  }

  const following = chowAfter(typeId);
  if (
    following !== null &&
    (counts.get(following[0]) ?? 0) > 0 &&
    (counts.get(following[1]) ?? 0) > 0
  ) {
    adjustCount(counts, typeId, -1);
    adjustCount(counts, following[0], -1);
    adjustCount(counts, following[1], -1);
    groups.push({
      kind: "chow",
      tileTypes: [typeId, following[0], following[1]],
    });
    enumerateMeldGroups(counts, groupsNeeded, groups, results);
    groups.pop();
    adjustCount(counts, typeId, 1);
    adjustCount(counts, following[0], 1);
    adjustCount(counts, following[1], 1);
  }
};

const standardDecompositions = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
  melds: readonly Meld[],
): readonly WinningDecomposition[] => {
  const groupsNeeded = 4 - melds.length;
  if (groupsNeeded < 0) {
    return [];
  }
  const expectedConcealedTiles = groupsNeeded * 3 + 2;
  const actualConcealedTiles = [...counts.values()].reduce((total, count) => total + count, 0);
  if (actualConcealedTiles !== expectedConcealedTiles) {
    return [];
  }

  const results: WinningDecomposition[] = [];
  for (const pairType of sortTileTypes(
    [...counts.entries()].filter(([, count]) => count >= 2).map(([typeId]) => typeId),
  ) as readonly StandardTileTypeId[]) {
    const remaining = mutableCounts(counts);
    adjustCount(remaining, pairType, -2);
    const groupResults: ConcealedGroup[][] = [];
    enumerateMeldGroups(remaining, groupsNeeded, [], groupResults);
    for (const groups of groupResults) {
      results.push({
        form: "standard",
        concealedGroups: [...groups, { kind: "pair", tileTypes: [pairType, pairType] }],
        declaredMeldIds: melds.map(({ id }) => id),
      });
    }
  }
  return results;
};

const sevenPairsDecomposition = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
  melds: readonly Meld[],
  allowQuadAsTwoPairs: boolean,
): WinningDecomposition | null => {
  if (melds.length > 0) {
    return null;
  }
  const entries = (sortTileTypes([...counts.keys()]) as readonly StandardTileTypeId[]).map(
    (typeId) => [typeId, counts.get(typeId)!] as const,
  );
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const pairCount = entries.reduce((sum, [, count]) => sum + count / 2, 0);
  const validCounts = entries.every(
    ([, count]) => count === 2 || (allowQuadAsTwoPairs && count === 4),
  );
  if (total !== 14 || pairCount !== 7 || !validCounts) {
    return null;
  }
  return {
    form: "seven_pairs",
    concealedGroups: entries.flatMap(([typeId, count]) =>
      Array.from({ length: count / 2 }, () => ({
        kind: "pair" as const,
        tileTypes: [typeId, typeId] as const,
      })),
    ),
    declaredMeldIds: [],
  };
};

const ORPHAN_TYPES = [
  "characters.1",
  "characters.9",
  "dots.1",
  "dots.9",
  "bamboo.1",
  "bamboo.9",
  "wind.east",
  "wind.south",
  "wind.west",
  "wind.north",
  "dragon.red",
  "dragon.green",
  "dragon.white",
] as const satisfies readonly StandardTileTypeId[];

const thirteenOrphansDecomposition = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
  melds: readonly Meld[],
  winningTileId: TileInstanceId,
  requireThirteenSidedWait: boolean,
): WinningDecomposition | null => {
  if (
    melds.length > 0 ||
    [...counts.values()].reduce((sum, count) => sum + count, 0) !== 14 ||
    counts.size !== ORPHAN_TYPES.length ||
    ORPHAN_TYPES.some((typeId) => (counts.get(typeId) ?? 0) < 1) ||
    [...counts.values()].filter((count) => count === 2).length !== 1
  ) {
    return null;
  }
  if (requireThirteenSidedWait) {
    const predecessor = mutableCounts(counts);
    adjustCount(predecessor, standardType(winningTileId), -1);
    if (
      predecessor.size !== ORPHAN_TYPES.length ||
      ORPHAN_TYPES.some((typeId) => predecessor.get(typeId) !== 1)
    ) {
      return null;
    }
  }
  return {
    form: "thirteen_orphans",
    concealedGroups: [],
    declaredMeldIds: [],
  };
};

const nineGatesDecomposition = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
  melds: readonly Meld[],
  winningTileId: TileInstanceId,
  declaredKongsAllowed: boolean,
): WinningDecomposition | null => {
  if (melds.length > 0 && (!declaredKongsAllowed || melds.some(({ kind }) => kind !== "kong"))) {
    return null;
  }
  const winningType = standardType(winningTileId);
  const winningDefinition = getTileDefinition(winningType);
  if (
    winningDefinition.rank === undefined ||
    !["characters", "dots", "bamboo"].includes(winningDefinition.category)
  ) {
    return null;
  }
  const predecessor = mutableCounts(counts);
  for (const meld of melds) {
    adjustCount(predecessor, standardType(meld.tileIds[0]!), 3);
  }
  adjustCount(predecessor, winningType, -1);
  for (let rank = 1; rank <= 9; rank += 1) {
    const typeId = `${winningDefinition.category}.${String(rank)}` as StandardTileTypeId;
    const required = rank === 1 || rank === 9 ? 3 : 1;
    if ((predecessor.get(typeId) ?? 0) !== required) {
      return null;
    }
    predecessor.delete(typeId);
  }
  if (predecessor.size > 0) {
    return null;
  }
  return {
    form: "nine_gates",
    concealedGroups: [],
    declaredMeldIds: melds.map(({ id }) => id),
  };
};

/** Enumerates every materially distinct legal winning decomposition. */
export const solveWinningHand = (input: WinningSolveInput): readonly WinningDecomposition[] => {
  const physicalTileIds = [
    ...input.concealedTileIds,
    ...input.melds.flatMap(({ tileIds }) => tileIds),
  ];
  if (
    !input.concealedTileIds.includes(input.winningTileId) ||
    new Set(physicalTileIds).size !== physicalTileIds.length
  ) {
    throw new TypeError(
      "Winning solver input must contain the exact winning tile once and no duplicate physical IDs",
    );
  }
  standardType(input.winningTileId);
  const counts = tileCounts(input.concealedTileIds);
  const results: WinningDecomposition[] = [...standardDecompositions(counts, input.melds)];
  if (input.options.allowSevenPairs) {
    const sevenPairs = sevenPairsDecomposition(
      counts,
      input.melds,
      input.options.sevenPairsAllowsQuadAsTwoPairs,
    );
    if (sevenPairs !== null) {
      results.push(sevenPairs);
    }
  }
  if (input.options.allowThirteenOrphans) {
    const orphans = thirteenOrphansDecomposition(
      counts,
      input.melds,
      input.winningTileId,
      input.options.thirteenOrphansRequireThirteenSidedWait,
    );
    if (orphans !== null) {
      results.push(orphans);
    }
  }
  if (input.options.allowNineGates) {
    const nineGates = nineGatesDecomposition(
      counts,
      input.melds,
      input.winningTileId,
      input.options.nineGatesDeclaredKongsAllowed,
    );
    if (nineGates !== null) {
      results.push(nineGates);
    }
  }

  const unique = new Map(results.map((result) => [canonicalJson(result), result]));
  return [...unique.values()];
};
