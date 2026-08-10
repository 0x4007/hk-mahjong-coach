import { worldBounds } from "../coordinates.js";
import type { Bounds2, CityBlock, RoadSegment, WorldConfig } from "../world-types.js";

const sortUnique = (values: readonly number[]): readonly number[] =>
  [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((left, right) => left - right);

const corridorEdges = (
  roads: readonly RoadSegment[],
  axis: "x" | "z",
  sidewalkWidthM: number,
): readonly number[] =>
  roads
    .filter((road) =>
      axis === "x"
        ? Math.abs(road.start.x - road.end.x) < 1e-9
        : Math.abs(road.start.z - road.end.z) < 1e-9,
    )
    .flatMap((road) => {
      const coordinate = axis === "x" ? road.start.x : road.start.z;
      const half = road.widthM / 2 + sidewalkWidthM;
      return [coordinate - half, coordinate + half];
    });

export const generateBlocks = (
  config: WorldConfig,
  roads: readonly RoadSegment[],
): readonly CityBlock[] => {
  const bounds = worldBounds(config);
  const xEdges = sortUnique([bounds.minX, bounds.maxX, ...corridorEdges(roads, "x", config.sidewalkWidthM)]);
  const zEdges = sortUnique([bounds.minZ, bounds.maxZ, ...corridorEdges(roads, "z", config.sidewalkWidthM)]);
  const blocks: CityBlock[] = [];
  for (let zIndex = 0; zIndex + 1 < zEdges.length; zIndex += 1) {
    for (let xIndex = 0; xIndex + 1 < xEdges.length; xIndex += 1) {
      const minX = xEdges[xIndex]!;
      const maxX = xEdges[xIndex + 1]!;
      const minZ = zEdges[zIndex]!;
      const maxZ = zEdges[zIndex + 1]!;
      if (maxX - minX < 10 || maxZ - minZ < 10) continue;
      const inset = Math.min(2, (maxX - minX) / 10, (maxZ - minZ) / 10);
      const blockBounds: Bounds2 = { minX, maxX, minZ, maxZ };
      blocks.push({
        id: `block-${String(xIndex)}-${String(zIndex)}`,
        bounds: blockBounds,
        buildableBounds: {
          minX: minX + inset,
          maxX: maxX - inset,
          minZ: minZ + inset,
          maxZ: maxZ - inset,
        },
        districtKind: "dense-urban",
        parcelIds: [],
      });
    }
  }
  return blocks;
};
