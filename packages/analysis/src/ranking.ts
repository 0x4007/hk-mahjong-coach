import {
  canonicalJsonHash,
  compareTileInstances,
  compareTileTypes,
  createSeededRandom,
  getTileDefinition,
  tileTypeFromInstanceId,
  type PlayerObservation,
  type StandardTileTypeId,
  type TileInstanceId,
  type TileTypeId,
} from "@hk-mahjong/core/public";
import type { ResolvedRuleset } from "@hk-mahjong/hk-rules";
import { distanceToReady, rawDistanceToReady, STANDARD_TILE_TYPES } from "./distance.js";
import { concealedTypesFromObservation, estimateFaanPaths } from "./paths.js";
import { analyzeRelativeRisk, createAnalysisFact } from "./risk.js";
import { assertObservationRuleset, compareCodePoints, configuredFaan } from "./ruleset.js";
import {
  ANALYSIS_VERSION,
  ANALYSIS_WEIGHTING_VERSION,
  ROLLOUT_VERSION,
  STRATEGIC_ACTION_WEIGHTING_VERSION,
  type AnalysisFact,
  type AnalysisPersonality,
  type CandidateComponents,
  type DiscardAnalysisOptions,
  type DiscardAnalysisResult,
  type DiscardCandidateAnalysis,
  type DistanceOptions,
  type FaanPath,
  type ImprovingTileAnalysis,
  type LegalActionAnalysis,
  type RolloutEstimate,
} from "./types.js";
import { improvingTiles, visibleStandardTileCounts } from "./visibility.js";

type ObservationAction = PlayerObservation["legalActions"][number];
type CandidateWeights = Readonly<Record<keyof CandidateComponents, number>>;

const WEIGHT_TOTAL = 10_000;
const COMPONENT_SCALE = 10_000;
const WEIGHTS: Readonly<Record<AnalysisPersonality, CandidateWeights>> = {
  fast: {
    speed: 3_000,
    visibleAvailability: 2_500,
    handValue: 1_000,
    flexibility: 2_000,
    callCompatibility: 1_000,
    relativeSafety: 500,
  },
  value: {
    speed: 1_500,
    visibleAvailability: 1_000,
    handValue: 3_500,
    flexibility: 1_000,
    callCompatibility: 2_000,
    relativeSafety: 1_000,
  },
  balanced: {
    speed: 2_500,
    visibleAvailability: 2_000,
    handValue: 2_000,
    flexibility: 1_500,
    callCompatibility: 1_000,
    relativeSafety: 1_000,
  },
};
const PERSONALITIES: readonly AnalysisPersonality[] = ["fast", "value", "balanced"];

const assertPersonality = (personality: AnalysisPersonality): void => {
  if (!PERSONALITIES.includes(personality)) {
    throw new RangeError(`Unknown analysis personality ${personality}`);
  }
};

const assertObservationActions = (observation: PlayerObservation): void => {
  const actionIds = observation.legalActions.map(({ id }) => id);
  if (new Set(actionIds).size !== actionIds.length) {
    throw new Error("Observation contains duplicate legal action IDs");
  }
  if (
    new Set(observation.private.concealedTiles).size !== observation.private.concealedTiles.length
  ) {
    throw new Error("Observation contains a duplicate concealed physical tile");
  }
  const viewer = observation.players.find(
    ({ playerId }) => playerId === observation.viewer.playerId,
  );
  if (viewer === undefined) {
    throw new Error("Observation omits its viewer from the public player list");
  }
  if (viewer.concealedTileCount !== observation.private.concealedTiles.length) {
    throw new Error("Observation viewer concealed count does not match its private tiles");
  }
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const distanceOptionsForRuleset = (ruleset: ResolvedRuleset): DistanceOptions => ({
  allowSevenPairs: ruleset.definition.winRules.allowSevenPairs,
  sevenPairsAllowsQuadAsTwoPairs: ruleset.definition.winRules.sevenPairsAllowsQuadAsTwoPairs,
  allowThirteenOrphans: ruleset.definition.winRules.allowThirteenOrphans,
});

const removePhysicalTile = (
  tileIds: readonly TileInstanceId[],
  discardedTileId: TileInstanceId,
): readonly TileInstanceId[] => {
  const index = tileIds.indexOf(discardedTileId);
  if (index < 0) {
    throw new Error(`Discard action references missing viewer tile ${discardedTileId}`);
  }
  return [...tileIds.slice(0, index), ...tileIds.slice(index + 1)];
};

const valueStrength = (paths: readonly FaanPath[], minimumFaan: number): number => {
  const multiplier: Readonly<Record<FaanPath["status"], number>> = {
    secured: 1,
    likely: 0.75,
    speculative: 0.3,
    impossible: 0,
  };
  const effective = (id: FaanPath["id"]): number => {
    const path = paths.find((candidate) => candidate.id === id);
    return path === undefined ? 0 : path.estimatedFaan * multiplier[path.status];
  };
  const additive = effective("dragon_or_wind") + effective("bonus_value");
  const suit = Math.max(effective("half_flush"), effective("full_flush"));
  const ordinaryShape = Math.max(effective("all_chows"), effective("all_pungs"));
  const ordinary = additive + suit + ordinaryShape;
  const special = Math.max(
    effective("seven_pairs") + additive,
    effective("thirteen_orphans"),
    effective("nine_gates"),
  );
  const best = Math.max(additive, ordinary, special);
  return clamp(best / Math.max(1, minimumFaan));
};

const callCompatibility = (paths: readonly FaanPath[], minimumFaan: number): number => {
  if (minimumFaan === 0) {
    return 1;
  }
  const openCompatible = paths.filter(({ id }) =>
    [
      "fast_mixed",
      "all_chows",
      "all_pungs",
      "half_flush",
      "full_flush",
      "dragon_or_wind",
      "bonus_value",
    ].includes(id),
  );
  return valueStrength(openCompatible, minimumFaan);
};

const weightedScore = (
  components: CandidateComponents,
  personality: AnalysisPersonality,
): number => {
  const weights = WEIGHTS[personality];
  return Math.round(
    (Object.keys(weights) as readonly (keyof CandidateComponents)[]).reduce(
      (total, key) => total + Math.round(clamp(components[key]) * COMPONENT_SCALE) * weights[key],
      0,
    ) / WEIGHT_TOTAL,
  );
};

const buildUnseenPool = (observation: PlayerObservation): readonly StandardTileTypeId[] => {
  const visible = visibleStandardTileCounts(observation);
  return STANDARD_TILE_TYPES.flatMap((typeId) =>
    Array.from({ length: 4 - (visible.get(typeId) ?? 0) }, () => typeId),
  );
};

const commonWorldSamples = (
  observation: PlayerObservation,
  iterations: number,
  depth: number,
): readonly (readonly StandardTileTypeId[])[] => {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_024) {
    throw new RangeError("Rollout iterations must be an integer from 1 through 1024");
  }
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 8) {
    throw new RangeError("Rollout depth must be an integer from 1 through 8");
  }
  const pool = buildUnseenPool(observation);
  if (pool.length === 0) {
    return [];
  }
  const redactedSeed = canonicalJsonHash({
    version: ROLLOUT_VERSION,
    gameId: observation.gameId,
    branchId: observation.branchId,
    practiceBranch: observation.practiceBranch,
    revision: observation.revision,
    viewerId: observation.viewer.playerId,
    rulesetHash: observation.ruleset.hash,
  });
  const random = createSeededRandom(redactedSeed);
  return Array.from({ length: iterations }, () => {
    const available = [...pool];
    const world: StandardTileTypeId[] = [];
    for (let index = 0; index < depth && index < available.length; index += 1) {
      const chosenIndex = index + random.nextInt(available.length - index);
      const chosen = available[chosenIndex]!;
      available[chosenIndex] = available[index]!;
      available[index] = chosen;
      world.push(chosen);
    }
    return world;
  });
};

const rolloutUtility = (
  concealedTypes: readonly TileTypeId[],
  declaredMeldCount: number,
  options: DistanceOptions,
  world: readonly StandardTileTypeId[],
): number => {
  let hand = [...concealedTypes];
  let bestDistance = rawDistanceToReady(hand, declaredMeldCount, options).minimum;
  for (const drawnType of world) {
    const withDraw = [...hand, drawnType];
    const completeDistance = rawDistanceToReady(withDraw, declaredMeldCount, options).minimum;
    if (completeDistance < 0) {
      return 1;
    }
    let selectedHand: TileTypeId[] | null = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    let selectedDiscard: TileTypeId | null = null;
    for (let index = 0; index < withDraw.length; index += 1) {
      const discardType = withDraw[index]!;
      const afterDiscard = [...withDraw.slice(0, index), ...withDraw.slice(index + 1)];
      const distance = rawDistanceToReady(afterDiscard, declaredMeldCount, options).minimum;
      if (
        distance < selectedDistance ||
        (distance === selectedDistance &&
          (selectedDiscard === null || compareTileTypes(discardType, selectedDiscard) < 0))
      ) {
        selectedHand = afterDiscard;
        selectedDistance = distance;
        selectedDiscard = discardType;
      }
    }
    if (selectedHand === null) {
      throw new Error("Rollout could not select a discard");
    }
    hand = selectedHand;
    bestDistance = selectedDistance;
  }
  return 1 / (2 + Math.max(0, bestDistance));
};

const rolloutForCandidate = (
  concealedTypes: readonly TileTypeId[],
  declaredMeldCount: number,
  options: DistanceOptions,
  samples: readonly (readonly StandardTileTypeId[])[],
  depth: number,
): RolloutEstimate | null => {
  if (samples.length === 0) {
    return null;
  }
  const utilities = samples.map((world) =>
    rolloutUtility(concealedTypes, declaredMeldCount, options, world),
  );
  const mean = utilities.reduce((total, value) => total + value, 0) / utilities.length;
  const variance =
    utilities.reduce((total, value) => total + (value - mean) ** 2, 0) / utilities.length;
  return {
    version: ROLLOUT_VERSION,
    iterations: samples.length,
    depth,
    meanUtility: round(mean),
    uncertainty: round(Math.sqrt(variance / utilities.length)),
  };
};

interface UnrankedCandidate extends Omit<DiscardCandidateAnalysis, "rank" | "confidence"> {
  rank: 0;
  confidence: 0;
}

const compareCandidates = (left: UnrankedCandidate, right: UnrankedCandidate): number =>
  right.totalScore - left.totalScore ||
  left.distanceAfterDiscard - right.distanceAfterDiscard ||
  right.visibleImprovingCopies - left.visibleImprovingCopies ||
  right.components.handValue - left.components.handValue ||
  right.components.relativeSafety - left.components.relativeSafety ||
  compareTileTypes(tileTypeFromInstanceId(left.tileId), tileTypeFromInstanceId(right.tileId)) ||
  compareTileInstances(left.tileId, right.tileId) ||
  compareCodePoints(left.actionId, right.actionId);

const pathMerit = (path: FaanPath): number => {
  const multiplier: Readonly<Record<FaanPath["status"], number>> = {
    secured: 1_000,
    likely: 750,
    speculative: 300,
    impossible: 0,
  };
  return path.estimatedFaan * multiplier[path.status];
};

const candidateFacts = (
  tileId: TileInstanceId,
  distance: number,
  improvements: readonly ImprovingTileAnalysis[],
  paths: readonly FaanPath[],
  riskFacts: readonly AnalysisFact[],
): readonly AnalysisFact[] => {
  const tileTypeId = tileTypeFromInstanceId(tileId);
  const visibleCopies = improvements.reduce(
    (total, improvement) => total + improvement.visibleRemainingCopies,
    0,
  );
  const leadingPath = [...paths]
    .filter(({ id, status }) => id !== "fast_mixed" && status !== "impossible")
    .sort(
      (left, right) => pathMerit(right) - pathMerit(left) || compareCodePoints(left.id, right.id),
    )[0];
  return [
    createAnalysisFact(
      "distance",
      `Discarding ${getTileDefinition(tileTypeId).names.en} leaves the hand ${String(distance)} tile${distance === 1 ? "" : "s"} from ready.`,
      { tileId, tileTypeId, distance },
    ),
    createAnalysisFact(
      "improving_tiles",
      `${String(improvements.length)} tile types improve this shape, with ${String(visibleCopies)} visible-remaining copies.`,
      {
        tileId,
        tileTypeId,
        improvingTileTypes: improvements.map(({ tileTypeId: improvingType }) => improvingType),
        visibleImprovingCopies: visibleCopies,
        exhaustedTileTypes: improvements
          .filter(({ exhausted }) => exhausted)
          .map(({ tileTypeId: improvingType }) => improvingType),
      },
    ),
    createAnalysisFact(
      "faan_path",
      `The leading value direction is ${leadingPath?.label ?? "not established"}.`,
      {
        tileId,
        paths: paths.map(({ id, status, estimatedFaan }) => ({
          id,
          status,
          estimatedFaan,
        })),
      },
    ),
    ...riskFacts,
  ].sort((left, right) => compareCodePoints(left.id, right.id));
};

export const analyzeDiscardCandidates = (
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
  analysisOptions: DiscardAnalysisOptions = {},
): DiscardAnalysisResult => {
  assertObservationRuleset(observation, ruleset);
  const personality = analysisOptions.personality ?? "balanced";
  assertPersonality(personality);
  assertObservationActions(observation);
  const viewer = observation.players.find(
    ({ playerId }) => playerId === observation.viewer.playerId,
  );
  if (viewer === undefined) {
    throw new Error("Observation omits its viewer from the public player list");
  }
  const discardActions = observation.legalActions.filter(
    (action): action is Extract<ObservationAction, { type: "discard" }> =>
      action.type === "discard",
  );
  const distanceOptions = distanceOptionsForRuleset(ruleset);
  const samples =
    analysisOptions.rollout === undefined
      ? []
      : commonWorldSamples(
          observation,
          analysisOptions.rollout.iterations,
          analysisOptions.rollout.depth,
        );

  const candidates: UnrankedCandidate[] = discardActions.map((action) => {
    const afterDiscardIds = removePhysicalTile(observation.private.concealedTiles, action.tileId);
    const afterDiscardTypes = afterDiscardIds.map(tileTypeFromInstanceId);
    const discardedType = tileTypeFromInstanceId(action.tileId);
    if (getTileDefinition(discardedType).bonus) {
      throw new TypeError("A legal discard action cannot reference a bonus tile");
    }
    const distance = distanceToReady(afterDiscardTypes, viewer.melds.length, distanceOptions);
    const improvements = improvingTiles(
      afterDiscardTypes,
      viewer.melds.length,
      observation,
      distanceOptions,
    );
    const paths = estimateFaanPaths(observation, afterDiscardTypes, distance, ruleset);
    const risk = analyzeRelativeRisk(observation, discardedType as StandardTileTypeId, ruleset);
    const visibleImprovingCopies = improvements.reduce(
      (total, improvement) => total + improvement.visibleRemainingCopies,
      0,
    );
    const components: CandidateComponents = {
      speed: clamp(1 - distance.minimum / 6),
      visibleAvailability:
        improvements.length === 0 ? 0 : clamp(visibleImprovingCopies / (improvements.length * 4)),
      handValue: valueStrength(paths, observation.ruleset.minimumFaan),
      flexibility: clamp(improvements.length / 12),
      callCompatibility: callCompatibility(paths, observation.ruleset.minimumFaan),
      relativeSafety: 1 - risk.risk,
    };
    const rollout = rolloutForCandidate(
      afterDiscardTypes,
      viewer.melds.length,
      distanceOptions,
      samples,
      analysisOptions.rollout?.depth ?? 1,
    );
    const heuristicScore = weightedScore(components, personality);
    const totalScore =
      rollout === null
        ? heuristicScore
        : Math.round(
            (heuristicScore * 85 + Math.round(rollout.meanUtility * COMPONENT_SCALE) * 15) / 100,
          );
    return {
      actionId: action.id,
      tileId: action.tileId,
      rank: 0,
      totalScore,
      confidence: 0,
      components: {
        speed: round(components.speed),
        visibleAvailability: round(components.visibleAvailability),
        handValue: round(components.handValue),
        flexibility: round(components.flexibility),
        callCompatibility: round(components.callCompatibility),
        relativeSafety: round(components.relativeSafety),
      },
      distanceAfterDiscard: distance.minimum,
      improvingTileTypes: improvements.map(({ tileTypeId }) => tileTypeId),
      visibleImprovingCopies,
      improvingTiles: improvements,
      likelyFaanPaths: paths,
      relativeRisk: risk.risk,
      rollout,
      risks: risk.facts,
      facts: candidateFacts(action.tileId, distance.minimum, improvements, paths, risk.facts),
      weightingVersion: `${ANALYSIS_WEIGHTING_VERSION}:${personality}`,
    };
  });

  const ordered = candidates.sort(compareCandidates);
  const bestScore = ordered[0]?.totalScore ?? 0;
  const secondScore = ordered[1]?.totalScore ?? bestScore;
  const scoreGap = Math.max(0, bestScore - secondScore);
  const ranked = ordered.map((candidate, index): DiscardCandidateAnalysis => ({
    ...candidate,
    rank: index + 1,
    confidence:
      ordered.length === 1
        ? 1
        : round(
            clamp(
              (index === 0
                ? 0.5 + scoreGap / 2_500
                : 0.5 - (bestScore - candidate.totalScore) / 5_000) -
                (candidate.rollout?.uncertainty ?? 0),
            ),
          ),
  }));
  const allFacts = new Map<string, AnalysisFact>();
  for (const fact of ranked.flatMap(({ facts }) => facts)) {
    allFacts.set(fact.id, fact);
  }
  if (ranked.length > 1) {
    const scoreFact = createAnalysisFact(
      "score_gap",
      `The top two discard scores differ by ${String(scoreGap)} weighting basis points.`,
      {
        recommendedActionId: ranked[0]!.actionId,
        alternativeActionId: ranked[1]!.actionId,
        scoreGap,
        unit: "weighting_basis_points",
      },
    );
    allFacts.set(scoreFact.id, scoreFact);
  }
  return {
    schemaVersion: 1,
    analysisVersion: ANALYSIS_VERSION,
    weightingVersion: `${ANALYSIS_WEIGHTING_VERSION}:${personality}`,
    branchId: observation.branchId,
    practiceBranch: observation.practiceBranch,
    observationRevision: observation.revision,
    playerId: observation.viewer.playerId,
    personality,
    recommendedActionId: ranked[0]?.actionId ?? null,
    candidates: ranked,
    facts: [...allFacts.values()].sort((left, right) => compareCodePoints(left.id, right.id)),
  };
};

const removePhysicalTiles = (
  tileIds: readonly TileInstanceId[],
  removedTileIds: readonly TileInstanceId[],
): readonly TileInstanceId[] => {
  if (new Set(removedTileIds).size !== removedTileIds.length) {
    throw new Error("Strategic action references a concealed tile more than once");
  }
  let remaining = [...tileIds];
  for (const tileId of removedTileIds) {
    const index = remaining.indexOf(tileId);
    if (index < 0) {
      throw new Error(`Strategic action references missing viewer tile ${tileId}`);
    }
    remaining = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
  }
  return remaining;
};

type ObservedMeld = PlayerObservation["players"][number]["melds"][number];

interface StrategicShape {
  concealedTileIds: readonly TileInstanceId[];
  distance: ReturnType<typeof distanceToReady>;
  improvements: readonly ImprovingTileAnalysis[];
  visibleImprovingCopies: number;
  paths: readonly FaanPath[];
  components: CandidateComponents;
  relativeRisk: number;
  followUpDiscardTileId: TileInstanceId | null;
}

const viewerFromObservation = (
  observation: PlayerObservation,
): PlayerObservation["players"][number] => {
  const viewer = observation.players.find(
    ({ playerId }) => playerId === observation.viewer.playerId,
  );
  if (viewer === undefined) {
    throw new Error("Observation omits its viewer from the public player list");
  }
  return viewer;
};

const withViewerShape = (
  observation: PlayerObservation,
  concealedTileIds: readonly TileInstanceId[],
  melds: readonly ObservedMeld[],
): PlayerObservation => ({
  ...observation,
  players: observation.players.map((player) =>
    player.playerId === observation.viewer.playerId
      ? {
          ...player,
          concealedTileCount: concealedTileIds.length,
          melds,
        }
      : player,
  ),
  private: {
    ...observation.private,
    concealedTiles: concealedTileIds,
    drawnTileId:
      observation.private.drawnTileId !== null &&
      concealedTileIds.includes(observation.private.drawnTileId)
        ? observation.private.drawnTileId
        : null,
  },
});

const requirePendingDiscardType = (
  observation: PlayerObservation,
  actionType: "claim_chow" | "claim_pung" | "claim_kong",
): StandardTileTypeId => {
  if (observation.pending?.kind !== "discard_claim") {
    throw new Error(`${actionType} requires a public pending discard`);
  }
  if (getTileDefinition(observation.pending.tileTypeId).bonus) {
    throw new TypeError(`${actionType} cannot claim a bonus tile`);
  }
  return observation.pending.tileTypeId as StandardTileTypeId;
};

const sameStandardType = (
  tileIds: readonly TileInstanceId[],
  actionType: string,
): StandardTileTypeId => {
  const typeIds = tileIds.map(tileTypeFromInstanceId);
  const first = typeIds[0];
  if (
    first === undefined ||
    getTileDefinition(first).bonus ||
    typeIds.some((typeId) => typeId !== first)
  ) {
    throw new Error(`${actionType} must reference matching standard tiles`);
  }
  return first as StandardTileTypeId;
};

const hypotheticalMeldForClaim = (
  action: Extract<ObservationAction, { type: "claim_chow" | "claim_pung" | "claim_kong" }>,
  observation: PlayerObservation,
): ObservedMeld => {
  const offeredType = requirePendingDiscardType(observation, action.type);
  const handTypes = action.tileIdsFromHand.map(tileTypeFromInstanceId);
  if (handTypes.some((typeId) => getTileDefinition(typeId).bonus)) {
    throw new TypeError(`${action.type} cannot use a bonus tile`);
  }
  const tileTypes = [...handTypes, offeredType].sort(compareTileTypes);
  if (action.type !== "claim_chow" && tileTypes.some((typeId) => typeId !== offeredType)) {
    throw new Error(`${action.type} must use tiles matching the pending discard`);
  }
  return {
    id: `analysis:${action.id}`,
    kind: action.type === "claim_chow" ? "chow" : action.type === "claim_pung" ? "pung" : "kong",
    kongKind: action.type === "claim_kong" ? "exposed" : null,
    tileTypes,
    exposed: true,
    claimedFrom: observation.pending!.sourcePlayerId,
  };
};

const hypotheticalKongShape = (
  action: Extract<ObservationAction, { type: "declare_concealed_kong" | "declare_added_kong" }>,
  observation: PlayerObservation,
): {
  concealedTileIds: readonly TileInstanceId[];
  observation: PlayerObservation;
} => {
  const viewer = viewerFromObservation(observation);
  if (action.type === "declare_concealed_kong") {
    const typeId = sameStandardType(action.tileIds, action.type);
    const concealedTileIds = removePhysicalTiles(
      observation.private.concealedTiles,
      action.tileIds,
    );
    const meld: ObservedMeld = {
      id: `analysis:${action.id}`,
      kind: "kong",
      kongKind: "concealed",
      tileTypes: action.tileIds.map(() => typeId),
      exposed: false,
      claimedFrom: null,
    };
    return {
      concealedTileIds,
      observation: withViewerShape(observation, concealedTileIds, [...viewer.melds, meld]),
    };
  }

  const typeId = tileTypeFromInstanceId(action.tileId);
  const sourceMeld = viewer.melds.find(({ id }) => id === action.meldId);
  if (
    sourceMeld?.kind !== "pung" ||
    sourceMeld.tileTypes.length !== 3 ||
    sourceMeld.tileTypes.some((meldType) => meldType !== typeId)
  ) {
    throw new Error("declare_added_kong must extend the viewer's matching public pung");
  }
  const concealedTileIds = removePhysicalTiles(observation.private.concealedTiles, [action.tileId]);
  const melds = viewer.melds.map((meld): ObservedMeld =>
    meld.id === action.meldId
      ? {
          ...meld,
          kind: "kong",
          kongKind: "added",
          tileTypes: [...meld.tileTypes, typeId],
        }
      : meld,
  );
  return {
    concealedTileIds,
    observation: withViewerShape(observation, concealedTileIds, melds),
  };
};

const shapeComponents = (
  observation: PlayerObservation,
  shapeObservation: PlayerObservation,
  concealedTileIds: readonly TileInstanceId[],
  ruleset: ResolvedRuleset,
  options: DistanceOptions,
  flexibilityMultiplier: number,
  relativeRisk: number,
  followUpDiscardTileId: TileInstanceId | null,
): StrategicShape => {
  const declaredMeldCount = viewerFromObservation(shapeObservation).melds.length;
  const concealedTypes = concealedTileIds.map(tileTypeFromInstanceId);
  const distance = distanceToReady(concealedTypes, declaredMeldCount, options);
  const improvements = improvingTiles(concealedTypes, declaredMeldCount, observation, options);
  const visibleImprovingCopies = improvements.reduce(
    (total, improvement) => total + improvement.visibleRemainingCopies,
    0,
  );
  const paths = estimateFaanPaths(shapeObservation, concealedTypes, distance, ruleset);
  const components: CandidateComponents = {
    speed: round(clamp(1 - distance.minimum / 6)),
    visibleAvailability: round(
      improvements.length === 0 ? 0 : clamp(visibleImprovingCopies / (improvements.length * 4)),
    ),
    handValue: round(valueStrength(paths, observation.ruleset.minimumFaan)),
    flexibility: round(clamp((improvements.length / 12) * flexibilityMultiplier)),
    callCompatibility: round(callCompatibility(paths, observation.ruleset.minimumFaan)),
    relativeSafety: round(1 - clamp(relativeRisk)),
  };
  return {
    concealedTileIds,
    distance,
    improvements,
    visibleImprovingCopies,
    paths,
    components,
    relativeRisk: round(clamp(relativeRisk)),
    followUpDiscardTileId,
  };
};

const compareStrategicShapes = (
  left: StrategicShape,
  right: StrategicShape,
  personality: AnalysisPersonality,
): number => {
  const scoreComparison =
    weightedScore(right.components, personality) - weightedScore(left.components, personality);
  if (scoreComparison !== 0) {
    return scoreComparison;
  }
  if (left.followUpDiscardTileId === null) {
    return right.followUpDiscardTileId === null ? 0 : -1;
  }
  if (right.followUpDiscardTileId === null) {
    return 1;
  }
  return (
    compareTileTypes(
      tileTypeFromInstanceId(left.followUpDiscardTileId),
      tileTypeFromInstanceId(right.followUpDiscardTileId),
    ) || compareTileInstances(left.followUpDiscardTileId, right.followUpDiscardTileId)
  );
};

const bestClaimShape = (
  action: Extract<ObservationAction, { type: "claim_chow" | "claim_pung" }>,
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
  options: DistanceOptions,
  personality: AnalysisPersonality,
): StrategicShape => {
  const viewer = viewerFromObservation(observation);
  const remaining = removePhysicalTiles(observation.private.concealedTiles, action.tileIdsFromHand);
  const meld = hypotheticalMeldForClaim(action, observation);
  const candidateShapes = remaining.map((discardTileId, index) => {
    const concealedTileIds = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
    const shapeObservation = withViewerShape(observation, concealedTileIds, [
      ...viewer.melds,
      meld,
    ]);
    const discardRisk = analyzeRelativeRisk(
      observation,
      tileTypeFromInstanceId(discardTileId) as StandardTileTypeId,
      ruleset,
    ).risk;
    const exposureRisk = action.type === "claim_chow" ? 0.24 : 0.2;
    return shapeComponents(
      observation,
      shapeObservation,
      concealedTileIds,
      ruleset,
      options,
      action.type === "claim_chow" ? 0.74 : 0.68,
      exposureRisk + discardRisk * 0.2,
      discardTileId,
    );
  });
  const selected = candidateShapes.sort((left, right) =>
    compareStrategicShapes(left, right, personality),
  )[0];
  if (selected === undefined) {
    throw new Error(`${action.type} leaves no tile available for its required discard`);
  }
  return selected;
};

const kongShape = (
  action: Extract<
    ObservationAction,
    { type: "declare_concealed_kong" | "declare_added_kong" | "claim_kong" }
  >,
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
  options: DistanceOptions,
): StrategicShape => {
  const replacementUncertainty =
    0.08 + (1 - clamp(observation.round.replacementDrawsAvailable / 16)) * 0.12;
  if (action.type === "claim_kong") {
    const viewer = viewerFromObservation(observation);
    const concealedTileIds = removePhysicalTiles(
      observation.private.concealedTiles,
      action.tileIdsFromHand,
    );
    const shapeObservation = withViewerShape(observation, concealedTileIds, [
      ...viewer.melds,
      hypotheticalMeldForClaim(action, observation),
    ]);
    return shapeComponents(
      observation,
      shapeObservation,
      concealedTileIds,
      ruleset,
      options,
      0.55,
      0.28 + replacementUncertainty,
      null,
    );
  }
  const hypothetical = hypotheticalKongShape(action, observation);
  return shapeComponents(
    observation,
    hypothetical.observation,
    hypothetical.concealedTileIds,
    ruleset,
    options,
    action.type === "declare_concealed_kong" ? 0.78 : 0.7,
    (action.type === "declare_concealed_kong" ? 0.04 : 0.12) + replacementUncertainty,
    null,
  );
};

const credibleOpenFaan = (paths: readonly FaanPath[]): number => {
  const usable = (id: FaanPath["id"]): number => {
    const path = paths.find((candidate) => candidate.id === id);
    return path !== undefined && (path.status === "secured" || path.status === "likely")
      ? path.estimatedFaan
      : 0;
  };
  const additive = usable("dragon_or_wind") + usable("bonus_value");
  const suit = Math.max(usable("half_flush"), usable("full_flush"));
  const ordinaryShape = Math.max(usable("all_chows"), usable("all_pungs"));
  return additive + suit + ordinaryShape;
};

const valueFaanForType = (
  typeId: TileTypeId,
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
): number => {
  const definition = getTileDefinition(typeId);
  if (definition.category === "dragon") {
    return configuredFaan(ruleset, "dragon_pung");
  }
  if (definition.category !== "wind") {
    return 0;
  }
  const wind = typeId.slice("wind.".length);
  return (
    (wind === observation.viewer.seat ? configuredFaan(ruleset, "seat_wind") : 0) +
    (wind === observation.round.prevailingWind ? configuredFaan(ruleset, "prevailing_wind") : 0)
  );
};

const actionValueFaan = (
  action: ObservationAction,
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
): number => {
  switch (action.type) {
    case "declare_concealed_kong":
      return valueFaanForType(tileTypeFromInstanceId(action.tileIds[0]!), observation, ruleset);
    case "claim_pung":
    case "claim_kong": {
      const offeredType = requirePendingDiscardType(observation, action.type);
      return valueFaanForType(offeredType, observation, ruleset);
    }
    case "declare_win":
    case "claim_win":
      return action.preview.cappedFaan;
    case "discard":
    case "declare_added_kong":
    case "claim_chow":
    case "pass":
    case "start_next_hand":
      return 0;
  }
};

const ACTION_TIE_PRIORITY: Readonly<Record<ObservationAction["type"], number>> = {
  declare_win: 0,
  claim_win: 1,
  start_next_hand: 2,
  discard: 3,
  pass: 4,
  declare_concealed_kong: 5,
  declare_added_kong: 6,
  claim_kong: 7,
  claim_pung: 8,
  claim_chow: 9,
};

const compareTileTypeArrays = (
  left: readonly TileTypeId[],
  right: readonly TileTypeId[],
): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = compareTileTypes(left[index]!, right[index]!);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.length - right.length;
};

const compareTileInstanceArrays = (
  left: readonly TileInstanceId[],
  right: readonly TileInstanceId[],
): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = compareTileInstances(left[index]!, right[index]!);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.length - right.length;
};

const actionTieTiles = (
  action: ObservationAction,
  observation: PlayerObservation,
): {
  typeIds: readonly TileTypeId[];
  tileIds: readonly TileInstanceId[];
} => {
  switch (action.type) {
    case "discard":
    case "declare_added_kong":
      return {
        typeIds: [tileTypeFromInstanceId(action.tileId)],
        tileIds: [action.tileId],
      };
    case "declare_concealed_kong": {
      const tileIds = [...action.tileIds].sort(compareTileInstances);
      return {
        typeIds: tileIds.map(tileTypeFromInstanceId).sort(compareTileTypes),
        tileIds,
      };
    }
    case "claim_chow":
    case "claim_pung":
    case "claim_kong": {
      const tileIds = [...action.tileIdsFromHand].sort(compareTileInstances);
      return {
        typeIds: [
          requirePendingDiscardType(observation, action.type),
          ...tileIds.map(tileTypeFromInstanceId),
        ].sort(compareTileTypes),
        tileIds,
      };
    }
    case "claim_win":
      return { typeIds: [action.tileTypeId], tileIds: [] };
    case "declare_win":
      return observation.private.drawnTileId === null
        ? { typeIds: [], tileIds: [] }
        : {
            typeIds: [tileTypeFromInstanceId(observation.private.drawnTileId)],
            tileIds: [observation.private.drawnTileId],
          };
    case "pass":
    case "start_next_hand":
      return { typeIds: [], tileIds: [] };
  }
};

const compareStrategicActions = (
  left: Omit<LegalActionAnalysis, "rank">,
  right: Omit<LegalActionAnalysis, "rank">,
  actions: ReadonlyMap<string, ObservationAction>,
  observation: PlayerObservation,
): number => {
  const leftAction = actions.get(left.actionId);
  const rightAction = actions.get(right.actionId);
  if (leftAction === undefined || rightAction === undefined) {
    throw new Error("Strategic analysis lost its source legal action");
  }
  const leftTiles = actionTieTiles(leftAction, observation);
  const rightTiles = actionTieTiles(rightAction, observation);
  return (
    right.totalScore - left.totalScore ||
    ACTION_TIE_PRIORITY[left.actionType] - ACTION_TIE_PRIORITY[right.actionType] ||
    compareTileTypeArrays(leftTiles.typeIds, rightTiles.typeIds) ||
    compareTileInstanceArrays(leftTiles.tileIds, rightTiles.tileIds) ||
    compareCodePoints(left.actionId, right.actionId)
  );
};

const emptyComponents = (relativeSafety: number): CandidateComponents => ({
  speed: 0,
  visibleAvailability: 0,
  handValue: 0,
  flexibility: 0,
  callCompatibility: 0,
  relativeSafety,
});

const strategicFacts = (
  action: ObservationAction,
  shape: StrategicShape | null,
  valueFaan: number,
  opensHand: boolean,
  replacementUncertainty: number | null,
): readonly AnalysisFact[] => {
  const facts: AnalysisFact[] = [
    createAnalysisFact(
      "legal_rule",
      `${action.type} is compared using only the emitted action and the viewer's redacted observation.`,
      {
        actionId: action.id,
        actionType: action.type,
        weightingVersion: STRATEGIC_ACTION_WEIGHTING_VERSION,
        distanceAfterAction: shape?.distance.minimum ?? null,
        valueFaan,
        opensHand,
        followUpDiscardTileId: shape?.followUpDiscardTileId ?? null,
        replacementUncertainty,
      },
    ),
  ];
  if (shape !== null) {
    facts.push(
      createAnalysisFact(
        "distance",
        `${action.type} leaves the modeled hand ${String(shape.distance.minimum)} tile${shape.distance.minimum === 1 ? "" : "s"} from ready.`,
        {
          actionId: action.id,
          distance: shape.distance.minimum,
          followUpDiscardTileId: shape.followUpDiscardTileId,
        },
      ),
      createAnalysisFact(
        "improving_tiles",
        `${String(shape.improvements.length)} tile types improve the modeled post-action shape, with ${String(shape.visibleImprovingCopies)} visible-remaining copies.`,
        {
          actionId: action.id,
          improvingTileTypes: shape.improvements.map(({ tileTypeId }) => tileTypeId),
          visibleImprovingCopies: shape.visibleImprovingCopies,
          exhaustedTileTypes: shape.improvements
            .filter(({ exhausted }) => exhausted)
            .map(({ tileTypeId }) => tileTypeId),
        },
      ),
      createAnalysisFact(
        "faan_path",
        `The modeled action retains ${String(credibleOpenFaan(shape.paths))} faan in secured or likely open-compatible paths.`,
        {
          actionId: action.id,
          paths: shape.paths.map(({ id, status, estimatedFaan }) => ({
            id,
            status,
            estimatedFaan,
          })),
        },
      ),
      createAnalysisFact(
        "relative_risk",
        `${action.type} has relative exposure and flexibility risk ${shape.relativeRisk.toFixed(2)}; this is not a guarantee of safety.`,
        {
          actionId: action.id,
          relativeRisk: shape.relativeRisk,
          replacementUncertainty,
          opensHand,
        },
      ),
    );
  }
  return facts.sort((left, right) => compareCodePoints(left.id, right.id));
};

export const analyzeLegalActions = (
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
  personality: AnalysisPersonality,
): readonly LegalActionAnalysis[] => {
  assertObservationRuleset(observation, ruleset);
  assertPersonality(personality);
  assertObservationActions(observation);
  viewerFromObservation(observation);
  const options = distanceOptionsForRuleset(ruleset);
  const discardAnalysis = observation.legalActions.some(({ type }) => type === "discard")
    ? analyzeDiscardCandidates(observation, ruleset, { personality })
    : null;
  const discardCandidates = new Map(
    discardAnalysis?.candidates.map((candidate) => [candidate.actionId, candidate] as const) ?? [],
  );
  const actionsById = new Map(
    observation.legalActions.map((action) => [action.id, action] as const),
  );
  const shapeByActionId = new Map<string, StrategicShape>();
  const preliminary = observation.legalActions.map((action): Omit<LegalActionAnalysis, "rank"> => {
    const discardCandidate = discardCandidates.get(action.id);
    if (discardCandidate !== undefined) {
      return {
        actionId: action.id,
        actionType: action.type,
        branchId: observation.branchId,
        practiceBranch: observation.practiceBranch,
        observationRevision: observation.revision,
        totalScore: discardCandidate.totalScore,
        weightingVersion: `${STRATEGIC_ACTION_WEIGHTING_VERSION}:${personality}`,
        baselineActionId: null,
        scoreDeltaFromBaseline: 0,
        components: discardCandidate.components,
        distanceAfterAction: discardCandidate.distanceAfterDiscard,
        visibleImprovingCopies: discardCandidate.visibleImprovingCopies,
        likelyFaanPaths: discardCandidate.likelyFaanPaths,
        relativeRisk: discardCandidate.relativeRisk,
        valueFaan: 0,
        opensHand: false,
        facts: discardCandidate.facts,
      };
    }

    const valueFaan = actionValueFaan(action, observation, ruleset);
    const opensHand = ["claim_chow", "claim_pung", "claim_kong"].includes(action.type);
    let shape: StrategicShape | null = null;
    let replacementUncertainty: number | null = null;
    switch (action.type) {
      case "pass":
        shape = shapeComponents(
          observation,
          observation,
          observation.private.concealedTiles,
          ruleset,
          options,
          1,
          0,
          null,
        );
        break;
      case "claim_chow":
      case "claim_pung":
        shape = bestClaimShape(action, observation, ruleset, options, personality);
        break;
      case "claim_kong":
      case "declare_concealed_kong":
      case "declare_added_kong":
        replacementUncertainty = round(
          0.08 + (1 - clamp(observation.round.replacementDrawsAvailable / 16)) * 0.12,
        );
        shape = kongShape(action, observation, ruleset, options);
        break;
      case "discard":
        throw new Error(`Discard analysis is missing emitted action ${action.id}`);
      case "declare_win":
      case "claim_win":
      case "start_next_hand":
        break;
    }
    if (shape !== null) {
      shapeByActionId.set(action.id, shape);
    }
    const components =
      shape?.components ??
      (action.type === "declare_win" || action.type === "claim_win"
        ? {
            ...emptyComponents(1),
            speed: 1,
            handValue: clamp(
              action.preview.cappedFaan / Math.max(1, observation.ruleset.minimumFaan),
            ),
          }
        : emptyComponents(1));
    const strategicAdjustment =
      action.type === "declare_win" || action.type === "claim_win"
        ? 1_000_000
        : action.type === "start_next_hand"
          ? 900_000
          : action.type === "declare_concealed_kong"
            ? 120
            : action.type === "declare_added_kong"
              ? 80
              : action.type === "claim_kong"
                ? 60
                : 0;
    const totalScore = weightedScore(components, personality) + strategicAdjustment;
    return {
      actionId: action.id,
      actionType: action.type,
      branchId: observation.branchId,
      practiceBranch: observation.practiceBranch,
      observationRevision: observation.revision,
      totalScore,
      weightingVersion: `${STRATEGIC_ACTION_WEIGHTING_VERSION}:${personality}`,
      baselineActionId: null,
      scoreDeltaFromBaseline: 0,
      components,
      distanceAfterAction: shape?.distance.minimum ?? null,
      visibleImprovingCopies: shape?.visibleImprovingCopies ?? null,
      likelyFaanPaths: shape?.paths ?? [],
      relativeRisk: shape?.relativeRisk ?? 0,
      valueFaan,
      opensHand,
      facts: strategicFacts(action, shape, valueFaan, opensHand, replacementUncertainty),
    };
  });

  const preliminaryById = new Map(
    preliminary.map((analysis) => [analysis.actionId, analysis] as const),
  );
  const passes = preliminary.filter(({ actionType }) => actionType === "pass");
  const hasClaim = observation.legalActions.some(({ type }) =>
    ["claim_chow", "claim_pung", "claim_kong"].includes(type),
  );
  if (hasClaim && passes.length !== 1) {
    throw new Error("Strategic claim analysis requires exactly one emitted pass baseline");
  }
  const pass = passes[0];
  const bestDiscard = discardAnalysis?.candidates[0] ?? null;
  const withBaselines = preliminary.map((analysis): Omit<LegalActionAnalysis, "rank"> => {
    const action = actionsById.get(analysis.actionId)!;
    const baseline =
      action.type === "claim_chow" || action.type === "claim_pung" || action.type === "claim_kong"
        ? pass
        : action.type === "declare_concealed_kong" || action.type === "declare_added_kong"
          ? bestDiscard === null
            ? undefined
            : preliminaryById.get(bestDiscard.actionId)
          : undefined;
    if (
      (action.type === "claim_chow" ||
        action.type === "claim_pung" ||
        action.type === "claim_kong") &&
      baseline === undefined
    ) {
      throw new Error(`${action.type} requires an emitted pass baseline`);
    }
    if (
      (action.type === "declare_concealed_kong" || action.type === "declare_added_kong") &&
      baseline === undefined
    ) {
      throw new Error(`${action.type} requires an emitted ordinary-discard baseline`);
    }

    const shape = shapeByActionId.get(action.id);
    const lacksCredibleFaan =
      (action.type === "claim_chow" ||
        action.type === "claim_pung" ||
        action.type === "claim_kong") &&
      observation.ruleset.minimumFaan > 0 &&
      (shape === undefined || credibleOpenFaan(shape.paths) < observation.ruleset.minimumFaan);
    const totalScore =
      lacksCredibleFaan && baseline !== undefined
        ? Math.min(analysis.totalScore, baseline.totalScore - 1)
        : analysis.totalScore;
    const baselineActionId = baseline?.actionId ?? null;
    const scoreDeltaFromBaseline = baseline === undefined ? 0 : totalScore - baseline.totalScore;
    const comparisonFact =
      baseline === undefined
        ? null
        : createAnalysisFact(
            "score_gap",
            `${action.type} scores ${String(scoreDeltaFromBaseline)} weighting basis points relative to ${baseline.actionType}.`,
            {
              actionId: action.id,
              baselineActionId,
              scoreDeltaFromBaseline,
              credibleMinimumFaanPath: !lacksCredibleFaan,
              minimumFaan: observation.ruleset.minimumFaan,
              credibleOpenFaan: shape === undefined ? null : credibleOpenFaan(shape.paths),
            },
          );
    return {
      ...analysis,
      totalScore,
      baselineActionId,
      scoreDeltaFromBaseline,
      facts:
        comparisonFact === null
          ? analysis.facts
          : [...analysis.facts, comparisonFact].sort((left, right) =>
              compareCodePoints(left.id, right.id),
            ),
    };
  });

  return withBaselines
    .sort((left, right) => compareStrategicActions(left, right, actionsById, observation))
    .map((action, index) => ({ ...action, rank: index + 1 }));
};

export interface Analyzer {
  readonly rulesetHash: string;
  analyzeDistance(observation: PlayerObservation): ReturnType<typeof distanceToReady>;
  analyzeDiscards(
    observation: PlayerObservation,
    options?: DiscardAnalysisOptions,
  ): DiscardAnalysisResult;
  analyzeLegalActions(
    observation: PlayerObservation,
    personality: AnalysisPersonality,
  ): readonly LegalActionAnalysis[];
}

export const createAnalyzer = (ruleset: ResolvedRuleset): Analyzer => ({
  rulesetHash: ruleset.hash,
  analyzeDistance: (observation) => {
    assertObservationRuleset(observation, ruleset);
    const viewer = observation.players.find(
      ({ playerId }) => playerId === observation.viewer.playerId,
    );
    if (viewer === undefined) {
      throw new Error("Observation omits its viewer from the public player list");
    }
    return distanceToReady(
      concealedTypesFromObservation(observation),
      viewer.melds.length,
      distanceOptionsForRuleset(ruleset),
    );
  },
  analyzeDiscards: (observation, options) =>
    analyzeDiscardCandidates(observation, ruleset, options),
  analyzeLegalActions: (observation, personality) =>
    analyzeLegalActions(observation, ruleset, personality),
});
