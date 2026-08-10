import { containsPoint, distance2, intersectsBounds } from "../coordinates.js";
import type {
  Bounds2,
  CombatDistrictPlan,
  CombatNode,
  CombatObstacle,
  CombatVisibilityMetrics,
  Vec2,
} from "../world-types.js";

export interface VisibilityValidation {
  readonly valid: boolean;
  readonly failures: readonly {
    readonly code: "spawn-to-spawn-visible" | "spawn-to-objective-visible" | "objective-to-objective-visible" | "long-sightline" | "visibility-share";
    readonly message: string;
    readonly nodeIds: readonly string[];
  }[];
  readonly metrics: CombatVisibilityMetrics;
}

const lineIntersectsBounds = (start: Vec2, end: Vec2, bounds: Bounds2): boolean => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  let minimum = 0;
  let maximum = 1;
  for (const [origin, delta, lower, upper] of [
    [start.x, dx, bounds.minX, bounds.maxX],
    [start.z, dz, bounds.minZ, bounds.maxZ],
  ] as const) {
    if (Math.abs(delta) < Number.EPSILON) {
      if (origin < lower || origin > upper) return false;
      continue;
    }
    const first = (lower - origin) / delta;
    const second = (upper - origin) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
};

const blocked = (start: Vec2, end: Vec2, obstacles: readonly CombatObstacle[]): boolean =>
  obstacles.some((obstacle) => lineIntersectsBounds(start, end, obstacle.bounds));

const node = (nodes: readonly CombatNode[], id: string): CombatNode => {
  const result = nodes.find((candidate) => candidate.id === id);
  if (result === undefined) throw new Error(`world_visibility_node_missing_${id}`);
  return result;
};

const samplePoints = (plan: Pick<CombatDistrictPlan, "nodes" | "edges" | "openAreas" | "bounds">, obstacles: readonly CombatObstacle[]): readonly Vec2[] => {
  const points: Vec2[] = [];
  for (let z = plan.bounds.minZ + 5; z < plan.bounds.maxZ; z += 10) {
    for (let x = plan.bounds.minX + 5; x < plan.bounds.maxX; x += 10) {
      const point = { x, z };
      if (!obstacles.some((obstacle) => containsPoint(obstacle.bounds, point))) points.push(point);
    }
  }
  if (points.length > 0) return points;
  for (const area of plan.openAreas) {
    for (let zIndex = 1; zIndex <= 3; zIndex += 1) {
      for (let xIndex = 1; xIndex <= 3; xIndex += 1) {
        const point = {
          x: area.bounds.minX + (area.bounds.maxX - area.bounds.minX) * (xIndex / 4),
          z: area.bounds.minZ + (area.bounds.maxZ - area.bounds.minZ) * (zIndex / 4),
        };
        if (!obstacles.some((obstacle) => containsPoint(obstacle.bounds, point))) points.push(point);
      }
    }
  }
  return plan.edges.flatMap((edge) => edge.segments.map((segment) => ({
    x: (segment.start.x + segment.end.x) / 2,
    z: (segment.start.z + segment.end.z) / 2,
  })));
};

export const validateVisibility = (
  plan: Pick<CombatDistrictPlan, "nodes" | "edges" | "openAreas" | "bounds">,
  obstacles: readonly CombatObstacle[],
): VisibilityValidation => {
  const attacker = node(plan.nodes, "attacker-spawn");
  const defender = node(plan.nodes, "defender-spawn");
  const objectiveA = node(plan.nodes, "objective-a");
  const objectiveB = node(plan.nodes, "objective-b");
  const spawnToSpawnVisible = !blocked(attacker.position, defender.position, obstacles);
  const spawnToObjectiveVisible = [attacker, defender].flatMap((spawn) =>
    [objectiveA, objectiveB].map((objective) => ({
      spawnId: spawn.id,
      objectiveId: objective.id,
      visible: !blocked(spawn.position, objective.position, obstacles),
    })),
  );
  const objectiveToObjectiveVisible = !blocked(objectiveA.position, objectiveB.position, obstacles);
  const samples = samplePoints(plan, obstacles);
  const importantNodes = plan.nodes.filter(
    (candidate) => candidate.kind === "attacker-spawn" || candidate.kind === "defender-spawn" || candidate.kind.startsWith("objective") || candidate.kind === "arena" || candidate.kind === "choke",
  );
  let maximumVisibleDistanceM = 0;
  let maximumVisibleShare = 0;
  const longSightlines: { readonly sourceId: string; readonly targetId: string; readonly distanceM: number }[] = [];
  for (const source of importantNodes) {
    let visibleCount = 0;
    for (const target of samples) {
      const distance = distance2(source.position, target);
      if (distance > maximumVisibleDistanceM) maximumVisibleDistanceM = distance;
      if (!blocked(source.position, target, obstacles)) {
        visibleCount += 1;
      }
    }
    maximumVisibleShare = Math.max(maximumVisibleShare, samples.length === 0 ? 0 : visibleCount / samples.length);
  }
  for (let sourceIndex = 0; sourceIndex < importantNodes.length; sourceIndex += 1) {
    const source = importantNodes[sourceIndex]!;
    for (let targetIndex = sourceIndex + 1; targetIndex < importantNodes.length; targetIndex += 1) {
      const target = importantNodes[targetIndex]!;
      const distance = distance2(source.position, target.position);
      if (distance > 120 && !blocked(source.position, target.position, obstacles)) {
        longSightlines.push({ sourceId: source.id, targetId: target.id, distanceM: distance });
      }
    }
  }
  const metrics: CombatVisibilityMetrics = {
    maximumVisibleDistanceM,
    maximumVisibleShare,
    spawnToSpawnVisible,
    spawnToObjectiveVisible,
    objectiveToObjectiveVisible,
    longSightlines,
  };
  const failures: VisibilityValidation["failures"][number][] = [];
  if (spawnToSpawnVisible) failures.push({ code: "spawn-to-spawn-visible", message: "team spawns have a direct line of sight", nodeIds: [attacker.id, defender.id] });
  for (const result of spawnToObjectiveVisible) {
    if (result.visible) failures.push({ code: "spawn-to-objective-visible", message: `${result.spawnId} can directly see ${result.objectiveId}`, nodeIds: [result.spawnId, result.objectiveId] });
  }
  if (objectiveToObjectiveVisible) failures.push({ code: "objective-to-objective-visible", message: "objective sites have a direct line of sight", nodeIds: [objectiveA.id, objectiveB.id] });
  if (longSightlines.length > 1) failures.push({ code: "long-sightline", message: "more than one unbroken long sightline remains", nodeIds: [longSightlines[0]!.sourceId] });
  if (maximumVisibleShare > 0.3) failures.push({ code: "visibility-share", message: `important node sees ${(maximumVisibleShare * 100).toFixed(1)}% of walkable samples`, nodeIds: importantNodes.map((candidate) => candidate.id) });
  return { valid: failures.length === 0, failures, metrics };
};

export const segmentBlockedByObstacle = (start: Vec2, end: Vec2, obstacle: CombatObstacle): boolean =>
  intersectsBounds(
    { minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x), minZ: Math.min(start.z, end.z), maxZ: Math.max(start.z, end.z) },
    obstacle.bounds,
  ) && lineIntersectsBounds(start, end, obstacle.bounds);
