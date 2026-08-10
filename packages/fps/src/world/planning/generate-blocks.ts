import { worldBounds } from "../coordinates.js";
import type { Bounds2, CityBlock, RoadSegment, WorldConfig } from "../world-types.js";

interface Interval {
  readonly min: number;
  readonly max: number;
}

const mergeIntervals = (intervals: readonly Interval[]): readonly Interval[] => {
  const sorted = [...intervals].sort((left, right) => left.min - right.min);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous === undefined || interval.min > previous.max + 1e-9) {
      merged.push({ ...interval });
      continue;
    }
    merged[merged.length - 1] = {
      min: previous.min,
      max: Math.max(previous.max, interval.max),
    };
  }
  return merged;
};

const roadCorridors = (
  roads: readonly RoadSegment[],
  axis: "x" | "z",
  sidewalkWidthM: number,
): readonly Interval[] =>
  roads
    .filter((road) =>
      axis === "x"
        ? Math.abs(road.start.x - road.end.x) < 1e-9
        : Math.abs(road.start.z - road.end.z) < 1e-9,
    )
    .map((road) => {
      const coordinate = axis === "x" ? road.start.x : road.start.z;
      const halfCorridor = road.widthM / 2 + sidewalkWidthM;
      return { min: coordinate - halfCorridor, max: coordinate + halfCorridor };
    });

/**
 * Return only the land intervals between road and sidewalk corridors.
 *
 * Road corridor edges are not themselves block boundaries: treating every
 * edge as a block edge creates narrow pseudo-blocks inside the road. The
 * planner must subtract the complete corridor first, then take the Cartesian
 * product of the remaining X/Z intervals.
 */
const buildableIntervals = (
  bounds: { readonly min: number; readonly max: number },
  corridors: readonly Interval[],
): readonly Interval[] => {
  const result: Interval[] = [];
  let cursor = bounds.min;
  for (const corridor of mergeIntervals(corridors)) {
    const min = Math.max(bounds.min, corridor.min);
    const max = Math.min(bounds.max, corridor.max);
    if (min > cursor + 1e-9) result.push({ min: cursor, max: min });
    cursor = Math.max(cursor, max);
  }
  if (cursor < bounds.max - 1e-9) result.push({ min: cursor, max: bounds.max });
  return result;
};

export const generateBlocks = (
  config: WorldConfig,
  roads: readonly RoadSegment[],
): readonly CityBlock[] => {
  const bounds = worldBounds(config);
  const xIntervals = buildableIntervals(
    { min: bounds.minX, max: bounds.maxX },
    roadCorridors(roads, "x", config.sidewalkWidthM),
  );
  const zIntervals = buildableIntervals(
    { min: bounds.minZ, max: bounds.maxZ },
    roadCorridors(roads, "z", config.sidewalkWidthM),
  );
  const blocks: CityBlock[] = [];
  for (let zIndex = 0; zIndex < zIntervals.length; zIndex += 1) {
    for (let xIndex = 0; xIndex < xIntervals.length; xIndex += 1) {
      const xInterval = xIntervals[xIndex]!;
      const zInterval = zIntervals[zIndex]!;
      if (xInterval.max - xInterval.min < 10 || zInterval.max - zInterval.min < 10) continue;
      const inset = Math.min(
        2,
        (xInterval.max - xInterval.min) / 10,
        (zInterval.max - zInterval.min) / 10,
      );
      const blockBounds: Bounds2 = {
        minX: xInterval.min,
        maxX: xInterval.max,
        minZ: zInterval.min,
        maxZ: zInterval.max,
      };
      blocks.push({
        id: `block-${String(xIndex)}-${String(zIndex)}`,
        bounds: blockBounds,
        buildableBounds: {
          minX: xInterval.min + inset,
          maxX: xInterval.max - inset,
          minZ: zInterval.min + inset,
          maxZ: zInterval.max - inset,
        },
        districtKind: "dense-urban",
        parcelIds: [],
      });
    }
  }
  return blocks;
};
