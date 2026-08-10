import { expandBounds, intersectsBounds } from "../coordinates.js";
import type { BuildingPart, Bounds2, CombatEdge, CombatObstacle, Vec2 } from "../world-types.js";

const segmentBounds = (start: Vec2, end: Vec2): Bounds2 => ({
  minX: Math.min(start.x, end.x),
  maxX: Math.max(start.x, end.x),
  minZ: Math.min(start.z, end.z),
  maxZ: Math.max(start.z, end.z),
});

export const combatRouteBounds = (edge: CombatEdge, extraClearanceM = 1.5): readonly Bounds2[] =>
  edge.segments.map((segment) =>
    expandBounds(segmentBounds(segment.start, segment.end), edge.widthM / 2 + extraClearanceM),
  );

export const buildingIntersectsCombatRoute = (
  building: BuildingPart,
  edges: readonly CombatEdge[],
): boolean =>
  edges.some((edge) =>
    combatRouteBounds(edge).some((route) => intersectsBounds(building.bounds, route)),
  );

const subtractBounds = (source: Bounds2, cutter: Bounds2): readonly Bounds2[] => {
  if (!intersectsBounds(source, cutter)) return [source];
  const overlap = {
    minX: Math.max(source.minX, cutter.minX),
    maxX: Math.min(source.maxX, cutter.maxX),
    minZ: Math.max(source.minZ, cutter.minZ),
    maxZ: Math.min(source.maxZ, cutter.maxZ),
  };
  const pieces: Bounds2[] = [];
  if (source.minZ < overlap.minZ - 1e-9) {
    pieces.push({
      minX: source.minX,
      maxX: source.maxX,
      minZ: source.minZ,
      maxZ: overlap.minZ,
    });
  }
  if (overlap.maxZ < source.maxZ - 1e-9) {
    pieces.push({
      minX: source.minX,
      maxX: source.maxX,
      minZ: overlap.maxZ,
      maxZ: source.maxZ,
    });
  }
  if (source.minX < overlap.minX - 1e-9) {
    pieces.push({
      minX: source.minX,
      maxX: overlap.minX,
      minZ: overlap.minZ,
      maxZ: overlap.maxZ,
    });
  }
  if (overlap.maxX < source.maxX - 1e-9) {
    pieces.push({
      minX: overlap.maxX,
      maxX: source.maxX,
      minZ: overlap.minZ,
      maxZ: overlap.maxZ,
    });
  }
  return pieces.filter((piece) => piece.maxX - piece.minX > 1e-6 && piece.maxZ - piece.minZ > 1e-6);
};

/**
 * Split authored combat walls wherever the graph says a player must walk.
 * Combat edges are authoritative: a visibility blocker may occupy the sides
 * of a route, but it must never leave a solid collision box across the route.
 */
export const carveCombatObstacles = (
  obstacles: readonly CombatObstacle[],
  edges: readonly CombatEdge[],
  extraClearanceM = 1.5,
): readonly CombatObstacle[] => {
  const result: CombatObstacle[] = [];
  for (const obstacle of obstacles) {
    let pieces: readonly Bounds2[] = [obstacle.bounds];
    for (const edge of edges) {
      for (const route of combatRouteBounds(edge, extraClearanceM)) {
        pieces = pieces.flatMap((piece) => subtractBounds(piece, route));
        if (pieces.length === 0) break;
      }
      if (pieces.length === 0) break;
    }
    pieces.forEach((bounds, index) => {
      result.push({
        ...obstacle,
        id: pieces.length === 1 ? obstacle.id : `${obstacle.id}-part-${String(index)}`,
        bounds,
      });
    });
  }
  return result;
};

export const carveCombatBuildingParts = (
  buildings: readonly BuildingPart[],
  districtBounds: Bounds2,
  edges: readonly CombatEdge[],
): readonly BuildingPart[] =>
  buildings.filter(
    (building) =>
      !intersectsBounds(building.bounds, districtBounds) ||
      !buildingIntersectsCombatRoute(building, edges),
  );
