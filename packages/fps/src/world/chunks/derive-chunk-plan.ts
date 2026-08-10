import { canonicalJsonHash } from "@hk-mahjong/core";
import { chunkBounds, containsPoint, intersectsBounds, isValidChunkCoord } from "../coordinates.js";
import type {
  AxisAlignedSegment,
  Bounds2,
  BuildingPart,
  ChunkCoord,
  ChunkPlan,
  CombatFeature,
  CoverPlacement,
  RoadSegment,
  RoadSegmentSlice,
  SurfacePolygon,
  Vec2,
  WorldPlan,
} from "../world-types.js";

const clipSegment = (segment: AxisAlignedSegment, bounds: Bounds2): AxisAlignedSegment | null => {
  const horizontal = Math.abs(segment.start.z - segment.end.z) < 1e-9;
  if (horizontal) {
    const z = segment.start.z;
    if (z < bounds.minZ || z > bounds.maxZ) return null;
    const minX = Math.max(bounds.minX, Math.min(segment.start.x, segment.end.x));
    const maxX = Math.min(bounds.maxX, Math.max(segment.start.x, segment.end.x));
    return minX > maxX ? null : { start: { x: minX, z }, end: { x: maxX, z } };
  }
  const x = segment.start.x;
  if (x < bounds.minX || x > bounds.maxX) return null;
  const minZ = Math.max(bounds.minZ, Math.min(segment.start.z, segment.end.z));
  const maxZ = Math.min(bounds.maxZ, Math.max(segment.start.z, segment.end.z));
  return minZ > maxZ ? null : { start: { x, z: minZ }, end: { x, z: maxZ } };
};

const clipPolygon = (points: readonly Vec2[], bounds: Bounds2): readonly Vec2[] => {
  let current = [...points];
  const clip = (
    inside: (point: Vec2) => boolean,
    intersection: (left: Vec2, right: Vec2) => Vec2,
  ): void => {
    if (current.length === 0) return;
    const next: Vec2[] = [];
    let previous = current[current.length - 1]!;
    let previousInside = inside(previous);
    for (const point of current) {
      const pointInside = inside(point);
      if (pointInside !== previousInside) next.push(intersection(previous, point));
      if (pointInside) next.push(point);
      previous = point;
      previousInside = pointInside;
    }
    current = next;
  };
  clip(
    (point) => point.x >= bounds.minX,
    (left, right) => ({ x: bounds.minX, z: left.z + ((right.z - left.z) * (bounds.minX - left.x)) / (right.x - left.x) }),
  );
  clip(
    (point) => point.x <= bounds.maxX,
    (left, right) => ({ x: bounds.maxX, z: left.z + ((right.z - left.z) * (bounds.maxX - left.x)) / (right.x - left.x) }),
  );
  clip(
    (point) => point.z >= bounds.minZ,
    (left, right) => ({ x: left.x + ((right.x - left.x) * (bounds.minZ - left.z)) / (right.z - left.z), z: bounds.minZ }),
  );
  clip(
    (point) => point.z <= bounds.maxZ,
    (left, right) => ({ x: left.x + ((right.x - left.x) * (bounds.maxZ - left.z)) / (right.z - left.z), z: bounds.maxZ }),
  );
  return current;
};

const clippedBounds = (source: Bounds2, bounds: Bounds2): Bounds2 | null => {
  if (!intersectsBounds(source, bounds)) return null;
  const result = {
    minX: Math.max(source.minX, bounds.minX),
    maxX: Math.min(source.maxX, bounds.maxX),
    minZ: Math.max(source.minZ, bounds.minZ),
    maxZ: Math.min(source.maxZ, bounds.maxZ),
  };
  return result.minX >= result.maxX || result.minZ >= result.maxZ ? null : result;
};

const sliceRoad = (road: RoadSegment, bounds: Bounds2, coord: ChunkCoord): RoadSegmentSlice | null => {
  const segment = clipSegment({ start: road.start, end: road.end }, bounds);
  if (segment === null) return null;
  return { ...road, id: `${road.id}@${String(coord.x)}:${String(coord.z)}`, sourceRoadId: road.id, start: segment.start, end: segment.end };
};

const sliceSurface = (surface: SurfacePolygon, bounds: Bounds2, coord: ChunkCoord): SurfacePolygon | null => {
  const points = clipPolygon(surface.points, bounds);
  return points.length < 3 ? null : { ...surface, id: `${surface.id}@${String(coord.x)}:${String(coord.z)}`, points };
};

const sliceBuilding = (part: BuildingPart, bounds: Bounds2, coord: ChunkCoord): BuildingPart | null => {
  const clipped = clippedBounds(part.bounds, bounds);
  return clipped === null ? null : { ...part, id: `${part.id}@${String(coord.x)}:${String(coord.z)}`, bounds: clipped };
};

const sliceCover = (cover: CoverPlacement, bounds: Bounds2, coord: ChunkCoord): CoverPlacement | null => {
  const clipped = clippedBounds(cover.bounds, bounds);
  return clipped === null ? null : { ...cover, id: `${cover.id}@${String(coord.x)}:${String(coord.z)}`, bounds: clipped };
};

const featureBounds = (feature: CombatFeature): Bounds2 => {
  if (feature.kind === "node" || feature.kind === "objective" || feature.kind === "spawn") {
    return { minX: feature.position.x, maxX: feature.position.x, minZ: feature.position.z, maxZ: feature.position.z };
  }
  if (feature.kind === "cover") return feature.bounds;
  const points = feature.segments.flatMap((segment) => [segment.start, segment.end]);
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};

const combatFeatures = (plan: WorldPlan, bounds: Bounds2): readonly CombatFeature[] => {
  const district = plan.combatDistrict;
  const features: CombatFeature[] = [];
  for (const node of district.nodes) {
    if (containsPoint(bounds, node.position)) features.push({ kind: "node", id: node.id, nodeKind: node.kind, position: node.position });
  }
  for (const edge of district.edges) {
    if (edge.segments.some((segment) => intersectsBounds(featureBounds({ kind: "edge", id: edge.id, routeRole: edge.routeRole, spaceKind: edge.spaceKind, widthM: edge.widthM, segments: [segment] }), bounds))) {
      features.push({ kind: "edge", id: edge.id, routeRole: edge.routeRole, spaceKind: edge.spaceKind, widthM: edge.widthM, segments: edge.segments });
    }
  }
  for (const cover of district.coverObjects) {
    if (intersectsBounds(cover.bounds, bounds)) features.push({ kind: "cover", id: cover.id, coverKind: cover.kind, bounds: cover.bounds, heightM: cover.heightM });
  }
  for (const node of district.nodes) {
    if (node.kind === "objective-a" || node.kind === "objective-b") {
      if (containsPoint(bounds, node.position)) features.push({ kind: "objective", id: node.id, position: node.position });
    }
    if (node.kind === "attacker-spawn" || node.kind === "defender-spawn") {
      if (containsPoint(bounds, node.position)) features.push({ kind: "spawn", id: node.id, team: node.kind === "attacker-spawn" ? "attacker" : "defender", position: node.position });
    }
  }
  return features;
};

const edgeSignature = (plan: WorldPlan, coord: ChunkCoord, axis: "x" | "z", coordinate: number): string => {
  const bounds = plan.bounds;
  const features = [
    ...plan.roads.map((road) => ({ id: road.id, kind: "road", start: road.start, end: road.end, widthM: road.widthM })),
    ...plan.sidewalks.map((surface) => ({ id: surface.id, kind: "sidewalk", points: surface.points })),
    ...plan.buildingParts.map((part) => ({ id: part.id, kind: part.kind, bounds: part.bounds })),
    ...plan.combatDistrict.coverObjects.map((cover) => ({ id: cover.id, kind: "cover", bounds: cover.bounds })),
  ].filter((feature) => {
    const featureBoundsValue = "bounds" in feature
      ? feature.bounds
      : "points" in feature
        ? { minX: Math.min(...feature.points.map((point) => point.x)), maxX: Math.max(...feature.points.map((point) => point.x)), minZ: Math.min(...feature.points.map((point) => point.z)), maxZ: Math.max(...feature.points.map((point) => point.z)) }
        : { minX: Math.min(feature.start.x, feature.end.x), maxX: Math.max(feature.start.x, feature.end.x), minZ: Math.min(feature.start.z, feature.end.z), maxZ: Math.max(feature.start.z, feature.end.z) };
    return axis === "x"
      ? Math.abs(featureBoundsValue.minX - coordinate) < 1e-6 || Math.abs(featureBoundsValue.maxX - coordinate) < 1e-6
      : Math.abs(featureBoundsValue.minZ - coordinate) < 1e-6 || Math.abs(featureBoundsValue.maxZ - coordinate) < 1e-6;
  });
  void bounds;
  void coord;
  return canonicalJsonHash({ axis, coordinate, features });
};

export const deriveChunkPlan = (plan: WorldPlan, coord: ChunkCoord): ChunkPlan => {
  if (!isValidChunkCoord(plan.config, coord)) throw new Error("world_chunk_coordinate_out_of_bounds");
  const bounds = chunkBounds(plan.config, coord);
  const roads = plan.roads.map((road) => sliceRoad(road, bounds, coord)).filter((road): road is RoadSegmentSlice => road !== null);
  const sidewalks = plan.sidewalks.map((surface) => sliceSurface(surface, bounds, coord)).filter((surface): surface is SurfacePolygon => surface !== null);
  const buildingParts = plan.buildingParts.map((part) => sliceBuilding(part, bounds, coord)).filter((part): part is BuildingPart => part !== null);
  const coverObjects = plan.combatDistrict.coverObjects.map((cover) => sliceCover(cover, bounds, coord)).filter((cover): cover is CoverPlacement => cover !== null);
  const features = combatFeatures(plan, bounds);
  const hashable = { coord, bounds, roads, sidewalks, buildingParts, coverObjects, combatFeatures: features };
  const world = plan.bounds;
  const edgeSignatures = {
    north: edgeSignature(plan, coord, "z", bounds.maxZ),
    east: edgeSignature(plan, coord, "x", bounds.maxX),
    south: edgeSignature(plan, coord, "z", bounds.minZ),
    west: edgeSignature(plan, coord, "x", bounds.minX),
  };
  void world;
  return {
    coord,
    bounds,
    roads,
    sidewalks,
    buildingParts,
    coverObjects,
    combatFeatures: features,
    isInsideCombatDistrict: intersectsBounds(bounds, plan.combatDistrict.bounds),
    edgeSignatures,
    planHash: `sha256:${canonicalJsonHash({ ...hashable, edgeSignatures })}`,
  };
};

export const neighboringChunkEdgeSignaturesMatch = (
  left: ChunkPlan,
  right: ChunkPlan,
  direction: "north" | "east",
): boolean => direction === "east"
  ? left.edgeSignatures.east === right.edgeSignatures.west
  : left.edgeSignatures.north === right.edgeSignatures.south;
