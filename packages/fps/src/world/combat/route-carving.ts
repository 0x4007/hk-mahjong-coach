import { expandBounds, intersectsBounds } from "../coordinates.js";
import type { BuildingPart, Bounds2, CombatEdge, Vec2 } from "../world-types.js";

const segmentBounds = (start: Vec2, end: Vec2): Bounds2 => ({
  minX: Math.min(start.x, end.x),
  maxX: Math.max(start.x, end.x),
  minZ: Math.min(start.z, end.z),
  maxZ: Math.max(start.z, end.z),
});

export const combatRouteBounds = (edge: CombatEdge, extraClearanceM = 1.5): readonly Bounds2[] =>
  edge.segments.map((segment) => expandBounds(segmentBounds(segment.start, segment.end), edge.widthM / 2 + extraClearanceM));

export const buildingIntersectsCombatRoute = (
  building: BuildingPart,
  edges: readonly CombatEdge[],
): boolean =>
  edges.some((edge) => combatRouteBounds(edge).some((route) => intersectsBounds(building.bounds, route)));

export const carveCombatBuildingParts = (
  buildings: readonly BuildingPart[],
  districtBounds: Bounds2,
  edges: readonly CombatEdge[],
): readonly BuildingPart[] =>
  buildings.filter(
    (building) =>
      !intersectsBounds(building.bounds, districtBounds) || !buildingIntersectsCombatRoute(building, edges),
  );
