/**
 * Curated live-player surface for analysis, bots, coaching, and external clients.
 *
 * This module intentionally excludes authoritative state, engine, reducer, replay, wall, event,
 * and invariant APIs. Live-information consumers must not import the unrestricted core barrel.
 */
export { canonicalJsonHash } from "./canonical.js";
export { createSeededRandom } from "./rng.js";
export {
  TILE_DEFINITIONS,
  compareTileInstances,
  compareTileTypes,
  getTileDefinition,
  sortTileTypes,
  tileTypeFromInstanceId,
} from "./tiles.js";
export type { PlayerObservation, WinningForm } from "./domain.js";
export type { StandardTileTypeId, TileInstanceId, TileTypeId } from "./tiles.js";
