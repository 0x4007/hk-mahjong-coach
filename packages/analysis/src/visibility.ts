import {
  getTileDefinition,
  tileTypeFromInstanceId,
  type PlayerObservation,
  type StandardTileTypeId,
  type TileTypeId,
} from "@hk-mahjong/core/public";
import { distanceToReady, rawDistanceToReady, STANDARD_TILE_TYPES } from "./distance.js";
import type { DistanceOptions, ImprovingTileAnalysis } from "./types.js";

const increment = (counts: Map<StandardTileTypeId, number>, typeId: TileTypeId): void => {
  if (getTileDefinition(typeId).bonus) {
    return;
  }
  const standardType = typeId as StandardTileTypeId;
  const nextCount = (counts.get(standardType) ?? 0) + 1;
  if (nextCount > 4) {
    throw new RangeError(
      `Public observation contains more than four visible ${standardType} tiles`,
    );
  }
  counts.set(standardType, nextCount);
};

/**
 * Counts only information present in the observation. Claimed discards are omitted because the
 * same physical tile is already represented in the claimant's public meld.
 */
export const visibleStandardTileCounts = (
  observation: PlayerObservation,
): ReadonlyMap<StandardTileTypeId, number> => {
  const counts = new Map<StandardTileTypeId, number>();
  for (const tileId of observation.private.concealedTiles) {
    increment(counts, tileTypeFromInstanceId(tileId));
  }
  for (const player of observation.players) {
    for (const meld of player.melds) {
      for (const typeId of meld.tileTypes) {
        increment(counts, typeId);
      }
    }
    for (const discard of player.discards) {
      if (discard.claimedBy === null) {
        increment(counts, discard.tileType);
      }
    }
  }
  return counts;
};

export const visibleRemainingCopies = (
  observation: PlayerObservation,
  typeId: StandardTileTypeId,
): number => 4 - (visibleStandardTileCounts(observation).get(typeId) ?? 0);

export const improvingTiles = (
  concealedTileTypes: readonly TileTypeId[],
  declaredMeldCount: number,
  observation: PlayerObservation,
  options: DistanceOptions,
): readonly ImprovingTileAnalysis[] => {
  const baseline = rawDistanceToReady(concealedTileTypes, declaredMeldCount, options).minimum;
  const visible = visibleStandardTileCounts(observation);
  const concealedCounts = new Map<StandardTileTypeId, number>();
  for (const typeId of concealedTileTypes) {
    const standard = typeId as StandardTileTypeId;
    concealedCounts.set(standard, (concealedCounts.get(standard) ?? 0) + 1);
  }

  const results: ImprovingTileAnalysis[] = [];
  for (const typeId of STANDARD_TILE_TYPES) {
    if ((concealedCounts.get(typeId) ?? 0) >= 4) {
      continue;
    }
    const resulting = rawDistanceToReady(
      [...concealedTileTypes, typeId],
      declaredMeldCount,
      options,
    );
    if (resulting.minimum >= baseline) {
      continue;
    }
    const visibleCopies = visible.get(typeId) ?? 0;
    results.push({
      tileTypeId: typeId,
      theoreticalCopies: 4,
      visibleCopies,
      visibleRemainingCopies: 4 - visibleCopies,
      exhausted: visibleCopies === 4,
      resultingDistance: distanceToReady(
        [...concealedTileTypes, typeId],
        declaredMeldCount,
        options,
      ).minimum,
    });
  }
  return results;
};
