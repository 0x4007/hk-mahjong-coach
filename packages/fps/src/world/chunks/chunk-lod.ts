import type { ChunkLod, ChunkStreamingConfig } from "../world-types.js";

export const DEFAULT_CHUNK_STREAMING_CONFIG: ChunkStreamingConfig = {
  gameplayRadiusChunks: 3,
  lowDetailRadiusChunks: 5,
  unloadRadiusChunks: 6,
  buildBudgetMs: 4,
};

export const resolveChunkLod = (
  distanceChunks: number,
  isInsideCombatDistrict: boolean,
  config: ChunkStreamingConfig = DEFAULT_CHUNK_STREAMING_CONFIG,
): ChunkLod => {
  if (isInsideCombatDistrict && distanceChunks <= config.unloadRadiusChunks) return "gameplay";
  if (distanceChunks <= config.gameplayRadiusChunks) return "high";
  if (distanceChunks <= config.lowDetailRadiusChunks) return "low";
  return "unloaded";
};
