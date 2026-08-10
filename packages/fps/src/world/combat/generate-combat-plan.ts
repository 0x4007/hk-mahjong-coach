import { canonicalJsonHash } from "@hk-mahjong/core";
import { containsPoint, intersectsBounds } from "../coordinates.js";
import { createSeededRandom } from "../seeded-random.js";
import { placeCombatDistrict, type CombatDistrictPlacement } from "../planning/place-combat-district.js";
import type {
  BuildingPart,
  CombatDistrictPlan,
  CombatNode,
  CombatValidation,
  CombatValidationFailure,
  CombatObstacle,
  WorldConfig,
} from "../world-types.js";
import { createCombatTemplate, translateTemplate, type CombatTemplate } from "./combat-template.js";
import { repairCoverPlacement, validateCoverPlacement } from "./cover-placement.js";
import { carveCombatBuildingParts } from "./route-carving.js";
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

const addFailure = (
  failures: CombatValidationFailure[],
  failure: { readonly code: CombatValidationFailure["code"]; readonly message: string; readonly nodeIds?: readonly string[] },
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
    .map((part): CombatObstacle => ({ id: part.id, bounds: part.bounds, heightM: part.heightM })),
  ...template.obstacles,
  ...template.coverObjects.map((cover): CombatObstacle => ({ id: cover.id, bounds: cover.bounds, heightM: cover.heightM })),
];

const createCandidate = (
  config: WorldConfig,
  placement: CombatDistrictPlacement,
  baseBuildingParts: readonly BuildingPart[],
  attempt: number,
): Candidate => {
  const random = createSeededRandom(config.seed, config.generatorVersion);
  const rotationQuarterTurns = random.randomInt("combat-topology-rotation", placement.chunkMin.x, placement.chunkMin.z, 4, attempt);
  const mirrored = random.randomBoolean("combat-topology-mirror", placement.chunkMin.x, placement.chunkMin.z, attempt);
  const horizontalFirst = (edgeId: string): boolean =>
    random.randomBoolean(`combat-edge-axis/${edgeId}`, placement.chunkMin.x, placement.chunkMin.z, attempt);
  const localTemplate = createCombatTemplate(rotationQuarterTurns, mirrored, horizontalFirst);
  const template = translateTemplate(localTemplate, { x: placement.bounds.minX, z: placement.bounds.minZ });
  const carved = carveCombatBuildingParts(baseBuildingParts, placement.bounds, template.edges);
  const coverObjects = repairCoverPlacement(template.openAreas, template.coverObjects, template.edges);
  const repairedTemplate: CombatTemplate = { ...template, coverObjects };
  const obstacles = obstaclesForVisibility(carved, placement.bounds, repairedTemplate);
  const connectivity = validateConnectivity(repairedTemplate);
  const timing = validateTiming(repairedTemplate, config.nominalRunSpeedMps);
  const visibility = validateVisibility({ ...repairedTemplate, bounds: placement.bounds }, obstacles);
  const coverFailures = validateCoverPlacement(repairedTemplate.openAreas, repairedTemplate.coverObjects, repairedTemplate.edges);
  const failures: CombatValidationFailure[] = [];
  failures.push(...validateBounds(placement, template.nodes));
  for (const failure of connectivity.failures) addFailure(failures, failure);
  for (const failure of timing.failures) addFailure(failures, failure);
  for (const failure of visibility.failures) addFailure(failures, failure);
  for (const failure of coverFailures) addFailure(failures, failure);
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
): GeneratedCombatPlan => {
  const random = createSeededRandom(config.seed, config.generatorVersion);
  const candidates: Candidate[] = [];
  for (let attempt = 0; attempt < config.maxGenerationAttempts; attempt += 1) {
    const placement = placeCombatDistrict(config, random, attempt);
    candidates.push(createCandidate(config, placement, baseBuildingParts, attempt));
  }
  const valid = candidates.filter((candidate) => candidate.district.validation.valid);
  const pool = valid.length > 0 ? valid : candidates;
  if (pool.length === 0) throw new Error("world_combat_generation_failed");
  const best = pool.reduce((current, candidate) =>
    candidateRank(candidate) > candidateRank(current) ? candidate : current,
  );
  // A canonical fallback remains deterministic even if a future constraint is
  // tightened beyond the current template. It is still returned with its
  // validation receipt so callers can display the exact reason for repair.
  const hashInput = {
    id: best.district.id,
    bounds: best.district.bounds,
    nodes: best.district.nodes,
    edges: best.district.edges,
    attempt: best.district.attempt,
  };
  void canonicalJsonHash(hashInput);
  return best;
};
