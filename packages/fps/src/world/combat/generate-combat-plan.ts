import { containsPoint, intersectsBounds } from "../coordinates.js";
import { createSeededRandom } from "../seeded-random.js";
import {
  placeCombatDistrict,
  type CombatDistrictPlacement,
} from "../planning/place-combat-district.js";
import type {
  BuildingPart,
  CombatDistrictPlan,
  CombatEdge,
  CombatNode,
  CombatValidation,
  CombatValidationFailure,
  CombatObstacle,
  Bounds2,
  WorldConfig,
} from "../world-types.js";
import { createCombatTemplate, translateTemplate, type CombatTemplate } from "./combat-template.js";
import { repairCoverPlacement, validateCoverPlacement } from "./cover-placement.js";
import {
  carveCombatBuildingParts,
  carveCombatObstacles,
  combatRouteBounds,
} from "./route-carving.js";
import { scoreCombatPlan } from "./score-combat-plan.js";
import { validateConnectivity } from "./validate-connectivity.js";
import { validateTiming } from "./validate-timing.js";
import { validateVisibility } from "./validate-visibility.js";

export interface GeneratedCombatPlan {
  readonly district: CombatDistrictPlan;
  readonly buildingParts: readonly BuildingPart[];
}

interface Candidate {
  readonly district: CombatDistrictPlan;
  readonly buildingParts: readonly BuildingPart[];
}

interface CandidateTransform {
  readonly rotationQuarterTurns: number;
  readonly mirrored: boolean;
  readonly horizontalFirst: boolean;
}

const addFailure = (
  failures: CombatValidationFailure[],
  failure: {
    readonly code: CombatValidationFailure["code"];
    readonly message: string;
    readonly nodeIds?: readonly string[];
  },
): void => {
  failures.push({ code: failure.code, message: failure.message, nodeIds: failure.nodeIds ?? [] });
};

const validateBounds = (
  placement: CombatDistrictPlacement,
  nodes: readonly CombatNode[],
): readonly CombatValidationFailure[] =>
  nodes
    .filter((node) => !containsPoint(placement.bounds, node.position))
    .map((node): CombatValidationFailure => ({
      code: "bounds",
      message: `${node.id} lies outside combat district`,
      nodeIds: [node.id],
    }));

const obstaclesForVisibility = (
  buildingParts: readonly BuildingPart[],
  districtBounds: CombatDistrictPlacement["bounds"],
  template: CombatTemplate,
): readonly CombatObstacle[] => [
  ...buildingParts
    .filter((part) => intersectsBounds(part.bounds, districtBounds))
    .map((part): CombatObstacle => ({
      id: part.id,
      bounds: part.bounds,
      heightM: part.heightM,
      kind: "building",
    })),
  ...template.obstacles.map((obstacle) => ({ ...obstacle, kind: "wall" as const })),
  ...template.coverObjects.map((cover): CombatObstacle => ({
    id: cover.id,
    bounds: cover.bounds,
    heightM: cover.heightM,
    kind: "cover",
  })),
];

const validateObstacleRoutes = (
  obstacles: readonly CombatObstacle[],
  edges: readonly CombatEdge[],
): readonly CombatValidationFailure[] =>
  obstacles.flatMap((obstacle) => {
    const clearance = obstacle.kind === "cover" ? 0 : 1.5;
    const blockingEdges = edges.filter((edge) =>
      combatRouteBounds(edge, clearance).some((route) => intersectsBounds(obstacle.bounds, route)),
    );
    return blockingEdges.length === 0
      ? []
      : [
          {
            code: "obstacle-blocks-route" as const,
            message: `${obstacle.id} blocks ${String(blockingEdges.length)} combat route(s)`,
            nodeIds: blockingEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
          },
        ];
  });

const createCandidate = (
  config: WorldConfig,
  placement: CombatDistrictPlacement,
  baseBuildingParts: readonly BuildingPart[],
  attempt: number,
  forcedTransform?: CandidateTransform,
): Candidate => {
  const random = createSeededRandom(config.seed, config.generatorVersion);
  const rotationQuarterTurns =
    forcedTransform?.rotationQuarterTurns ??
    random.randomInt(
      "combat-topology-rotation",
      placement.chunkMin.x,
      placement.chunkMin.z,
      4,
      attempt,
    );
  const mirrored =
    forcedTransform?.mirrored ??
    random.randomBoolean(
      "combat-topology-mirror",
      placement.chunkMin.x,
      placement.chunkMin.z,
      attempt,
    );
  const horizontalFirst = (edgeId: string): boolean =>
    forcedTransform?.horizontalFirst ??
    random.randomBoolean(
      `combat-edge-axis/${edgeId}`,
      placement.chunkMin.x,
      placement.chunkMin.z,
      attempt,
    );
  const localTemplate = createCombatTemplate(
    rotationQuarterTurns,
    mirrored,
    horizontalFirst,
    config.combatDistrictSizeM,
    config.combatGraphSnapM,
  );
  const template = translateTemplate(localTemplate, {
    x: placement.bounds.minX,
    z: placement.bounds.minZ,
  });
  const carved = carveCombatBuildingParts(baseBuildingParts, placement.bounds, template.edges);
  const coverObjects = repairCoverPlacement(
    template.openAreas,
    template.coverObjects,
    template.edges,
  );
  const carvedObstacles = carveCombatObstacles(template.obstacles, template.edges);
  const repairedTemplate: CombatTemplate = {
    ...template,
    coverObjects,
    obstacles: carvedObstacles,
  };
  const obstacles = obstaclesForVisibility(carved, placement.bounds, repairedTemplate);
  const connectivity = validateConnectivity(repairedTemplate);
  const timing = validateTiming(repairedTemplate, config.nominalRunSpeedMps);
  const visibility = validateVisibility(
    { ...repairedTemplate, bounds: placement.bounds },
    obstacles,
  );
  const coverFailures = validateCoverPlacement(
    repairedTemplate.openAreas,
    repairedTemplate.coverObjects,
    repairedTemplate.edges,
  );
  const failures: CombatValidationFailure[] = [];
  failures.push(...validateBounds(placement, template.nodes));
  for (const failure of connectivity.failures) addFailure(failures, failure);
  for (const failure of timing.failures) addFailure(failures, failure);
  for (const failure of visibility.failures) addFailure(failures, failure);
  for (const failure of coverFailures) addFailure(failures, failure);
  const physicalCombatObstacles: readonly CombatObstacle[] = [
    ...repairedTemplate.obstacles,
    ...carved
      .filter((part) => intersectsBounds(part.bounds, placement.bounds))
      .map((part): CombatObstacle => ({ ...part, kind: "building" })),
  ];
  for (const failure of validateObstacleRoutes(physicalCombatObstacles, repairedTemplate.edges)) {
    addFailure(failures, failure);
  }
  const validation: CombatValidation = {
    valid: failures.length === 0,
    failures,
    travel: timing.metrics,
    visibility: visibility.metrics,
    connectedComponentCount: connectivity.connectedComponentCount,
    nodeDegrees: connectivity.nodeDegrees,
    score: scoreCombatPlan(failures, timing.metrics, visibility.metrics),
  };
  const district: CombatDistrictPlan = {
    id: `combat-district-${String(placement.chunkMin.x)}-${String(placement.chunkMin.z)}`,
    bounds: placement.bounds,
    chunkMin: placement.chunkMin,
    chunkSize: placement.chunkSpan,
    attempt,
    rotationQuarterTurns,
    mirrored,
    nodes: repairedTemplate.nodes,
    edges: repairedTemplate.edges,
    openAreas: repairedTemplate.openAreas,
    coverObjects: repairedTemplate.coverObjects,
    obstacles,
    validation,
  };
  return { district, buildingParts: carved };
};

const candidateRank = (candidate: Candidate): number =>
  (candidate.district.validation.valid ? 1_000_000_000 : 0) + candidate.district.validation.score;

export const generateCombatPlan = (
  config: WorldConfig,
  baseBuildingParts: readonly BuildingPart[],
  reservedRects: readonly Bounds2[] = [],
): GeneratedCombatPlan => {
  const random = createSeededRandom(config.seed, config.generatorVersion);
  const candidates: Candidate[] = [];
  for (let attempt = 0; attempt < config.maxGenerationAttempts; attempt += 1) {
    const placement = placeCombatDistrict(config, random, attempt, reservedRects);
    const candidate = createCandidate(config, placement, baseBuildingParts, attempt);
    candidates.push(candidate);
  }
  const valid = candidates.filter((candidate) => candidate.district.validation.valid);
  // Always evaluate the complete retry budget. This makes candidate choice
  // independent of which attempt happens to pass first and lets the score
  // select the best valid layout rather than the earliest valid layout.
  const pool = valid.length > 0 ? valid : candidates;
  const best = pool.reduce((current, candidate) =>
    candidateRank(candidate) > candidateRank(current) ? candidate : current,
  );
  if (valid.length > 0) return best;

  // A seed must still produce a usable deterministic map if a future
  // constraint rejects every retry. Rebuild the canonical template from the
  // seed's first placement/transform, which preserves the route structure and
  // leaves a validation receipt for diagnostics.
  const canonicalPlacement = placeCombatDistrict(config, random, 0, reservedRects);
  const canonicalTransforms: readonly CandidateTransform[] = [
    { rotationQuarterTurns: 0, mirrored: false, horizontalFirst: false },
    { rotationQuarterTurns: 1, mirrored: false, horizontalFirst: false },
    { rotationQuarterTurns: 2, mirrored: false, horizontalFirst: false },
    { rotationQuarterTurns: 3, mirrored: false, horizontalFirst: false },
    { rotationQuarterTurns: 0, mirrored: true, horizontalFirst: false },
    { rotationQuarterTurns: 1, mirrored: true, horizontalFirst: false },
    { rotationQuarterTurns: 2, mirrored: true, horizontalFirst: false },
    { rotationQuarterTurns: 3, mirrored: true, horizontalFirst: false },
  ];
  for (const transform of canonicalTransforms) {
    const candidate = createCandidate(config, canonicalPlacement, baseBuildingParts, 0, transform);
    if (candidate.district.validation.valid) return candidate;
  }
  return createCandidate(config, canonicalPlacement, baseBuildingParts, 0, canonicalTransforms[0]);
};
