import type { ChunkGeometry, ChunkGeometryBatch, ChunkPlan } from "../world-types.js";

export const buildChunkGeometry = (
  plan: ChunkPlan,
  lod: "gameplay" | "high" | "low" = "high",
): ChunkGeometry => {
  const includeGameplay = lod !== "low";
  const combatEdgeCount = includeGameplay
    ? plan.combatFeatures.filter((feature) => feature.kind === "edge").length
    : 0;
  const coverCount = includeGameplay ? plan.coverObjects.length : 0;
  const windowCount = lod === "low" ? 0 : plan.buildingWindows.length;
  const stairCount =
    lod === "low"
      ? 0
      : plan.buildingStairwells.reduce(
          (total, stairwell) => total + stairwell.flights.length + stairwell.landings.length,
          0,
        );
  const batches: ChunkGeometryBatch[] = [
    {
      archetype: "road" as const,
      count: plan.roads.length,
      vertexCount: plan.roads.length * 4,
      indexCount: plan.roads.length * 6,
    },
    {
      archetype: "sidewalk" as const,
      count: plan.sidewalks.length,
      vertexCount: plan.sidewalks.reduce((total, surface) => total + surface.points.length, 0),
      indexCount: plan.sidewalks.reduce(
        (total, surface) => total + Math.max(0, surface.points.length - 2) * 3,
        0,
      ),
    },
    {
      archetype: "building" as const,
      count: plan.buildingParts.length,
      vertexCount: plan.buildingParts.length * 8,
      indexCount: plan.buildingParts.length * 36,
    },
    {
      archetype: "building-window" as const,
      count: windowCount,
      vertexCount: windowCount * 8,
      indexCount: windowCount * 36,
    },
    {
      archetype: "building-stair" as const,
      count: stairCount,
      vertexCount: stairCount * 8,
      indexCount: stairCount * 36,
    },
    {
      archetype: "cover" as const,
      count: coverCount,
      vertexCount: coverCount * 8,
      indexCount: coverCount * 36,
    },
    {
      archetype: "combat-edge" as const,
      count: combatEdgeCount,
      vertexCount: combatEdgeCount * 4,
      indexCount: combatEdgeCount * 6,
    },
  ].filter((batch) => batch.count > 0);
  const triangles = batches.reduce((total, batch) => total + Math.floor(batch.indexCount / 3), 0);
  // The blockout vertex layout uses position, normal, and UV attributes. This
  // estimate is deliberately conservative and is used for debug telemetry,
  // not for allocating a renderer buffer.
  const geometryBytes = batches.reduce(
    (total, batch) => total + batch.vertexCount * 32 + batch.indexCount * 4,
    0,
  );
  return {
    coord: plan.coord,
    lod,
    batches,
    metrics: {
      drawCalls: batches.length,
      triangles,
      geometryBytes,
      textureBytes: 0,
    },
    collisionBoxes:
      lod === "low"
        ? []
        : [
            ...plan.buildingParts.map((part) => ({
              id: part.id,
              bounds: part.bounds,
              heightM: part.heightM,
            })),
            ...plan.coverObjects.map((cover) => ({
              id: cover.id,
              bounds: cover.bounds,
              heightM: cover.heightM,
            })),
          ],
  };
};
