import type { ChunkPlan } from "../world-types.js";

export const buildChunkCollision = (plan: ChunkPlan): readonly {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly heightM: number;
}[] => [
  ...plan.buildingParts.map((part) => ({ id: part.id, ...part.bounds, heightM: part.heightM })),
  ...plan.coverObjects.map((cover) => ({ id: cover.id, ...cover.bounds, heightM: cover.heightM })),
];
