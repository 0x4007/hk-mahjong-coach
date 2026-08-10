import type { Bounds2, ChunkCoord, Vec2, WorldConfig } from "./world-types.js";

export const worldBounds = (config: WorldConfig): Bounds2 => {
  const half = config.worldSizeM / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
};

export const chunksPerAxis = (config: WorldConfig): number =>
  Math.round(config.worldSizeM / config.chunkSizeM);

export const isValidChunkCoord = (config: WorldConfig, coord: ChunkCoord): boolean =>
  Number.isSafeInteger(coord.x) &&
  Number.isSafeInteger(coord.z) &&
  coord.x >= 0 &&
  coord.z >= 0 &&
  coord.x < chunksPerAxis(config) &&
  coord.z < chunksPerAxis(config);

export const chunkBounds = (config: WorldConfig, coord: ChunkCoord): Bounds2 => {
  if (!isValidChunkCoord(config, coord)) throw new Error("world_chunk_coordinate_out_of_bounds");
  const bounds = worldBounds(config);
  const minX = bounds.minX + coord.x * config.chunkSizeM;
  const minZ = bounds.minZ + coord.z * config.chunkSizeM;
  return {
    minX,
    maxX: minX + config.chunkSizeM,
    minZ,
    maxZ: minZ + config.chunkSizeM,
  };
};

export const worldToChunkCoord = (config: WorldConfig, position: Vec2): ChunkCoord => {
  const bounds = worldBounds(config);
  const x = Math.floor((position.x - bounds.minX) / config.chunkSizeM);
  const z = Math.floor((position.z - bounds.minZ) / config.chunkSizeM);
  const coord = { x, z };
  if (!isValidChunkCoord(config, coord)) throw new Error("world_position_out_of_bounds");
  return coord;
};

export const allChunkCoords = (config: WorldConfig): readonly ChunkCoord[] => {
  const result: ChunkCoord[] = [];
  const count = chunksPerAxis(config);
  for (let z = 0; z < count; z += 1) {
    for (let x = 0; x < count; x += 1) result.push({ x, z });
  }
  return result;
};

export const containsPoint = (bounds: Bounds2, point: Vec2, epsilon = 1e-9): boolean =>
  point.x >= bounds.minX - epsilon &&
  point.x <= bounds.maxX + epsilon &&
  point.z >= bounds.minZ - epsilon &&
  point.z <= bounds.maxZ + epsilon;

export const intersectsBounds = (left: Bounds2, right: Bounds2, epsilon = 1e-9): boolean =>
  left.minX < right.maxX - epsilon &&
  left.maxX > right.minX + epsilon &&
  left.minZ < right.maxZ - epsilon &&
  left.maxZ > right.minZ + epsilon;

export const boundsFromPoints = (points: readonly Vec2[]): Bounds2 => {
  if (points.length === 0) throw new Error("world_bounds_empty_points");
  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minZ = points[0]!.z;
  let maxZ = points[0]!.z;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
};

export const expandBounds = (bounds: Bounds2, amount: number): Bounds2 => ({
  minX: bounds.minX - amount,
  maxX: bounds.maxX + amount,
  minZ: bounds.minZ - amount,
  maxZ: bounds.maxZ + amount,
});

export const snapToGrid = (point: Vec2, gridSizeM: number): Vec2 => {
  if (!Number.isFinite(gridSizeM) || gridSizeM <= 0) throw new Error("world_invalid_snap_grid");
  return {
    x: Math.round(point.x / gridSizeM) * gridSizeM,
    z: Math.round(point.z / gridSizeM) * gridSizeM,
  };
};

export const distance2 = (left: Vec2, right: Vec2): number =>
  Math.hypot(left.x - right.x, left.z - right.z);

export const boundsCenter = (bounds: Bounds2): Vec2 => ({
  x: (bounds.minX + bounds.maxX) / 2,
  z: (bounds.minZ + bounds.maxZ) / 2,
});
