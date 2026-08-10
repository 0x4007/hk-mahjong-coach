import { boundsFromPoints, snapToGrid } from "../coordinates.js";
import type {
  AxisAlignedSegment,
  CombatEdge,
  CombatNode,
  CombatNodeKind,
  CombatObstacle,
  CombatOpenArea,
  CombatRouteRole,
  CombatSpaceKind,
  CoverPlacement,
  Vec2,
} from "../world-types.js";

interface TemplateNode {
  readonly id: string;
  readonly kind: CombatNodeKind;
  readonly position: Vec2;
}

interface TemplateEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly widthM: number;
  readonly spaceKind: CombatSpaceKind;
  readonly routeRole: CombatRouteRole;
}

export interface CombatTemplate {
  readonly nodes: readonly TemplateNode[];
  readonly edges: readonly CombatEdge[];
  readonly openAreas: readonly CombatOpenArea[];
  readonly coverObjects: readonly CoverPlacement[];
  readonly obstacles: readonly CombatObstacle[];
}

const CENTER = 150;

const nodes: readonly TemplateNode[] = [
  { id: "attacker-spawn", kind: "attacker-spawn", position: { x: 150, z: 210 } },
  { id: "a-lower", kind: "junction", position: { x: 100, z: 190 } },
  { id: "middle-lower", kind: "junction", position: { x: 150, z: 190 } },
  { id: "b-lower", kind: "junction", position: { x: 200, z: 190 } },
  { id: "a-junction", kind: "junction", position: { x: 100, z: 150 } },
  { id: "b-junction", kind: "junction", position: { x: 200, z: 150 } },
  { id: "arena", kind: "arena", position: { x: 150, z: 150 } },
  { id: "middle-choke", kind: "choke", position: { x: 150, z: 180 } },
  { id: "a-approach", kind: "choke", position: { x: 100, z: 120 } },
  { id: "b-approach", kind: "choke", position: { x: 200, z: 120 } },
  { id: "objective-a", kind: "objective-a", position: { x: 100, z: 100 } },
  { id: "objective-b", kind: "objective-b", position: { x: 200, z: 100 } },
  { id: "defender-spawn", kind: "defender-spawn", position: { x: 150, z: 20 } },
  { id: "defender-junction", kind: "junction", position: { x: 150, z: 60 } },
  { id: "defender-a", kind: "junction", position: { x: 110, z: 60 } },
  { id: "defender-b", kind: "junction", position: { x: 190, z: 60 } },
];

const edge = (
  id: string,
  fromNodeId: string,
  toNodeId: string,
  widthM: number,
  spaceKind: CombatSpaceKind,
  routeRole: CombatRouteRole,
): TemplateEdge => ({ id, fromNodeId, toNodeId, widthM, spaceKind, routeRole });

const edges: readonly TemplateEdge[] = [
  edge("attacker-a", "attacker-spawn", "a-lower", 12, "street", "a-side"),
  edge("attacker-middle", "attacker-spawn", "middle-lower", 12, "street", "middle"),
  edge("attacker-b", "attacker-spawn", "b-lower", 12, "street", "b-side"),
  edge("a-lower-junction", "a-lower", "a-junction", 8, "alley", "a-side"),
  edge("middle-lower-choke", "middle-lower", "middle-choke", 6, "passage", "middle"),
  edge("b-lower-junction", "b-lower", "b-junction", 8, "alley", "b-side"),
  edge("a-junction-approach", "a-junction", "a-approach", 8, "alley", "a-side"),
  edge("a-junction-arena", "a-junction", "arena", 20, "courtyard", "connector"),
  edge("middle-choke-arena", "middle-choke", "arena", 8, "passage", "middle"),
  edge("b-junction-arena", "b-junction", "arena", 20, "courtyard", "connector"),
  edge("b-junction-approach", "b-junction", "b-approach", 8, "alley", "b-side"),
  edge("a-approach-site", "a-approach", "objective-a", 10, "street", "a-side"),
  edge("b-approach-site", "b-approach", "objective-b", 10, "street", "b-side"),
  edge("defender-main", "defender-spawn", "defender-junction", 10, "street", "defender"),
  edge("defender-a", "defender-junction", "defender-a", 8, "passage", "defender"),
  edge("defender-b", "defender-junction", "defender-b", 8, "passage", "defender"),
  edge("defender-a-site", "defender-a", "objective-a", 6, "passage", "defender"),
  edge("defender-b-site", "defender-b", "objective-b", 6, "passage", "defender"),
];

const transformPoint = (point: Vec2, rotationQuarterTurns: number, mirrored: boolean): Vec2 => {
  const centered = mirrored ? { x: CENTER - (point.x - CENTER), z: point.z } : point;
  const dx = centered.x - CENTER;
  const dz = centered.z - CENTER;
  switch (rotationQuarterTurns % 4) {
    case 0:
      return { x: CENTER + dx, z: CENTER + dz };
    case 1:
      return { x: CENTER - dz, z: CENTER + dx };
    case 2:
      return { x: CENTER - dx, z: CENTER - dz };
    case 3:
      return { x: CENTER + dz, z: CENTER - dx };
  }
  throw new Error("world_combat_invalid_rotation");
};

const transformBounds = (
  bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
  rotationQuarterTurns: number,
  mirrored: boolean,
) =>
  boundsFromPoints([
    transformPoint({ x: bounds.minX, z: bounds.minZ }, rotationQuarterTurns, mirrored),
    transformPoint({ x: bounds.minX, z: bounds.maxZ }, rotationQuarterTurns, mirrored),
    transformPoint({ x: bounds.maxX, z: bounds.minZ }, rotationQuarterTurns, mirrored),
    transformPoint({ x: bounds.maxX, z: bounds.maxZ }, rotationQuarterTurns, mirrored),
  ]);

const pathSegments = (start: Vec2, end: Vec2, horizontalFirst: boolean): readonly AxisAlignedSegment[] => {
  if (Math.abs(start.x - end.x) < 1e-9 || Math.abs(start.z - end.z) < 1e-9) {
    return [{ start, end }];
  }
  const bend = horizontalFirst ? { x: end.x, z: start.z } : { x: start.x, z: end.z };
  return [
    { start, end: bend },
    { start: bend, end },
  ];
};

const segmentLength = (segment: AxisAlignedSegment): number =>
  Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z);

const transformCover = (
  cover: CoverPlacement,
  rotationQuarterTurns: number,
  mirrored: boolean,
): CoverPlacement => ({
  ...cover,
  bounds: transformBounds(cover.bounds, rotationQuarterTurns, mirrored),
  rotationRadians: cover.rotationRadians + rotationQuarterTurns * (Math.PI / 2),
});

export const createCombatTemplate = (
  rotationQuarterTurns: number,
  mirrored: boolean,
  horizontalFirst: (edgeId: string) => boolean,
): CombatTemplate => {
  const transformedNodes = nodes.map(
    (node): CombatNode => ({
      id: node.id,
      kind: node.kind,
      position: snapToGrid(transformPoint(node.position, rotationQuarterTurns, mirrored), 10),
    }),
  );
  const nodeById = new Map(transformedNodes.map((node) => [node.id, node]));
  const transformedEdges: CombatEdge[] = [];
  for (const edgeSpec of edges) {
    const from = nodeById.get(edgeSpec.fromNodeId);
    const to = nodeById.get(edgeSpec.toNodeId);
    if (from === undefined || to === undefined) throw new Error("world_combat_template_node_missing");
    const segments = pathSegments(from.position, to.position, horizontalFirst(edgeSpec.id));
    transformedEdges.push({
      ...edgeSpec,
      segments,
      lengthM: segments.reduce((total, segment) => total + segmentLength(segment), 0),
    });
  }
  const openAreas: readonly CombatOpenArea[] = [
    { id: "arena-open", bounds: transformBounds({ minX: 115, maxX: 185, minZ: 135, maxZ: 185 }, rotationQuarterTurns, mirrored) },
    { id: "a-open", bounds: transformBounds({ minX: 65, maxX: 105, minZ: 110, maxZ: 155 }, rotationQuarterTurns, mirrored) },
    { id: "b-open", bounds: transformBounds({ minX: 195, maxX: 235, minZ: 110, maxZ: 155 }, rotationQuarterTurns, mirrored) },
  ];
  const coverObjects: readonly CoverPlacement[] = ([
    { id: "arena-cover", kind: "concrete-barrier", bounds: { minX: 165, maxX: 175, minZ: 177, maxZ: 183 }, heightM: 1.4, rotationRadians: 0, openAreaId: "arena-open" },
    { id: "a-cover", kind: "crate-stack", bounds: { minX: 70, maxX: 82, minZ: 138, maxZ: 145 }, heightM: 2, rotationRadians: 0, openAreaId: "a-open" },
    { id: "b-cover", kind: "parked-vehicle", bounds: { minX: 218, maxX: 230, minZ: 138, maxZ: 145 }, heightM: 1.8, rotationRadians: 0, openAreaId: "b-open" },
  ] as const).map((cover) => transformCover(cover, rotationQuarterTurns, mirrored));
  const obstacles: readonly CombatObstacle[] = [
    { id: "central-blocker", bounds: { minX: 130, maxX: 170, minZ: 110, maxZ: 135 }, heightM: 30 },
    { id: "west-objective-blocker", bounds: { minX: 80, maxX: 115, minZ: 75, maxZ: 95 }, heightM: 24 },
    { id: "east-objective-blocker", bounds: { minX: 185, maxX: 220, minZ: 75, maxZ: 95 }, heightM: 24 },
    { id: "west-mid-blocker", bounds: { minX: 115, maxX: 135, minZ: 135, maxZ: 145 }, heightM: 20 },
    { id: "east-mid-blocker", bounds: { minX: 165, maxX: 185, minZ: 135, maxZ: 145 }, heightM: 20 },
  ].map((obstacle) => ({
    ...obstacle,
    bounds: transformBounds(obstacle.bounds, rotationQuarterTurns, mirrored),
  }));
  return { nodes: transformedNodes, edges: transformedEdges, openAreas, coverObjects, obstacles };
};

export const translateTemplate = (
  template: CombatTemplate,
  offset: Vec2,
): CombatTemplate => ({
  nodes: template.nodes.map((node) => ({ ...node, position: { x: node.position.x + offset.x, z: node.position.z + offset.z } })),
  edges: template.edges.map((edge) => ({
    ...edge,
    segments: edge.segments.map((segment) => ({
      start: { x: segment.start.x + offset.x, z: segment.start.z + offset.z },
      end: { x: segment.end.x + offset.x, z: segment.end.z + offset.z },
    })),
  })),
  openAreas: template.openAreas.map((area) => ({
    ...area,
    bounds: {
      minX: area.bounds.minX + offset.x,
      maxX: area.bounds.maxX + offset.x,
      minZ: area.bounds.minZ + offset.z,
      maxZ: area.bounds.maxZ + offset.z,
    },
  })),
  coverObjects: template.coverObjects.map((cover) => ({
    ...cover,
    bounds: {
      minX: cover.bounds.minX + offset.x,
      maxX: cover.bounds.maxX + offset.x,
      minZ: cover.bounds.minZ + offset.z,
      maxZ: cover.bounds.maxZ + offset.z,
    },
  })),
  obstacles: template.obstacles.map((obstacle) => ({
    ...obstacle,
    bounds: {
      minX: obstacle.bounds.minX + offset.x,
      maxX: obstacle.bounds.maxX + offset.x,
      minZ: obstacle.bounds.minZ + offset.z,
      maxZ: obstacle.bounds.maxZ + offset.z,
    },
  })),
});
