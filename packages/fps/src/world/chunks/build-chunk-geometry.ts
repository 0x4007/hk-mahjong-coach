import type { ChunkGeometry, ChunkGeometryBatch, ChunkPlan } from "../world-types.js";

export const buildChunkGeometry = (plan: ChunkPlan): ChunkGeometry => {
  const batches: ChunkGeometryBatch[] = [
    { archetype: "road" as const, count: plan.roads.length, vertexCount: plan.roads.length * 4, indexCount: plan.roads.length * 6 },
    { archetype: "sidewalk" as const, count: plan.sidewalks.length, vertexCount: plan.sidewalks.reduce((total, surface) => total + surface.points.length, 0), indexCount: plan.sidewalks.reduce((total, surface) => total + Math.max(0, surface.points.length - 2) * 3, 0) },
    { archetype: "building" as const, count: plan.buildingParts.length, vertexCount: plan.buildingParts.length * 8, indexCount: plan.buildingParts.length * 36 },
    { archetype: "cover" as const, count: plan.coverObjects.length, vertexCount: plan.coverObjects.length * 8, indexCount: plan.coverObjects.length * 36 },
    { archetype: "combat-edge" as const, count: plan.combatFeatures.filter((feature) => feature.kind === "edge").length, vertexCount: plan.combatFeatures.filter((feature) => feature.kind === "edge").length * 4, indexCount: plan.combatFeatures.filter((feature) => feature.kind === "edge").length * 6 },
  ].filter((batch) => batch.count > 0);
  return {
    coord: plan.coord,
    batches,
    collisionBoxes: [
      ...plan.buildingParts.map((part) => ({ id: part.id, bounds: part.bounds, heightM: part.heightM })),
      ...plan.coverObjects.map((cover) => ({ id: cover.id, bounds: cover.bounds, heightM: cover.heightM })),
    ],
  };
};
