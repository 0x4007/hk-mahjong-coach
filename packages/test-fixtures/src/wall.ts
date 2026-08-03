import { createTileInventory, type TileInstanceId } from "@hk-mahjong/core";

export interface WallFixtureDefinition {
  id: string;
  bonusTilesEnabled: boolean;
  /** Tiles consumed from the live/front end, in exact draw order. */
  liveDraws: readonly TileInstanceId[];
  /** Tiles consumed from the replacement/back end, in exact draw order. */
  replacementDraws: readonly TileInstanceId[];
}

/**
 * Builds a complete, exact physical wall while allowing a fixture to pin only relevant draws.
 * Unspecified tiles retain canonical inventory order.
 */
export const buildWallFixture = (definition: WallFixtureDefinition): readonly TileInstanceId[] => {
  if (definition.id.trim().length === 0) {
    throw new TypeError("Wall fixture ID must not be empty");
  }
  const inventory = createTileInventory(definition.bonusTilesEnabled);
  const specified = [...definition.liveDraws, ...definition.replacementDraws];
  if (
    new Set(specified).size !== specified.length ||
    specified.some((tileId) => !inventory.includes(tileId))
  ) {
    throw new TypeError(`Wall fixture ${definition.id} contains duplicate or unavailable tiles`);
  }
  const specifiedSet = new Set(specified);
  const unspecified = inventory.filter((tileId) => !specifiedSet.has(tileId));
  const wall = [
    ...definition.liveDraws,
    ...unspecified,
    ...[...definition.replacementDraws].reverse(),
  ];
  if (
    wall.length !== inventory.length ||
    new Set(wall).size !== inventory.length ||
    inventory.some((tileId) => !wall.includes(tileId))
  ) {
    throw new Error(`Wall fixture ${definition.id} did not produce the exact inventory`);
  }
  return wall;
};
