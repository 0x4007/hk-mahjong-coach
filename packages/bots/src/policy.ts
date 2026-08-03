import {
  canonicalJsonHash,
  compareTileInstances,
  getTileDefinition,
  tileTypeFromInstanceId,
  type PlayerObservation,
} from "@hk-mahjong/core/public";
import {
  createAnalyzer,
  type DiscardCandidateAnalysis,
  type LegalActionAnalysis,
} from "@hk-mahjong/analysis";
import {
  BOT_POLICY_VERSION,
  type BotDecision,
  type BotPolicy,
  type BotPolicyConfig,
  type ObservedLegalAction,
  type ScriptedTeachingBotPolicyConfig,
} from "./types.js";

const DEFAULT_NOVICE_MISTAKE_FREQUENCY = 5;
const NOVICE_GROUPING_MISTAKE_GAP = 5;
const NOVICE_STRATEGIC_MISTAKE_GAP = 750;

const compareCodePoints = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const actionById = (observation: PlayerObservation, actionId: string): ObservedLegalAction => {
  const action = observation.legalActions.find(({ id }) => id === actionId);
  if (action === undefined) {
    throw new Error(`Bot analysis selected unavailable action ${actionId}`);
  }
  return action;
};

const orderedActionsOfType = <Type extends ObservedLegalAction["type"]>(
  observation: PlayerObservation,
  types: readonly Type[],
): readonly Extract<ObservedLegalAction, { type: Type }>[] =>
  observation.legalActions
    .filter((action): action is Extract<ObservedLegalAction, { type: Type }> =>
      types.includes(action.type as Type),
    )
    .sort((left, right) => compareCodePoints(left.id, right.id));

const basicDiscardOrder = (
  left: DiscardCandidateAnalysis,
  right: DiscardCandidateAnalysis,
): number =>
  left.distanceAfterDiscard - right.distanceAfterDiscard ||
  right.totalScore - left.totalScore ||
  right.visibleImprovingCopies - left.visibleImprovingCopies ||
  compareTileInstances(left.tileId, right.tileId) ||
  compareCodePoints(left.actionId, right.actionId);

const noviceDiscardKeepScore = (
  action: Extract<ObservedLegalAction, { type: "discard" }>,
  observation: PlayerObservation,
): number => {
  const typeId = tileTypeFromInstanceId(action.tileId);
  const definition = getTileDefinition(typeId);
  const concealedTypes = observation.private.concealedTiles.map(tileTypeFromInstanceId);
  const identical = concealedTypes.filter((candidate) => candidate === typeId).length - 1;
  if (definition.rank === undefined) {
    return identical * 5;
  }
  let neighboring = 0;
  for (const candidate of concealedTypes) {
    const other = getTileDefinition(candidate);
    if (
      other.rank !== undefined &&
      other.category === definition.category &&
      candidate !== typeId
    ) {
      const gap = Math.abs(other.rank - definition.rank);
      neighboring += gap === 1 ? 3 : gap === 2 ? 1 : 0;
    }
  }
  return identical * 5 + neighboring;
};

const noviceDiscardOrder = (
  observation: PlayerObservation,
): readonly Extract<ObservedLegalAction, { type: "discard" }>[] =>
  [...orderedActionsOfType(observation, ["discard"])].sort(
    (left, right) =>
      noviceDiscardKeepScore(left, observation) - noviceDiscardKeepScore(right, observation) ||
      compareTileInstances(left.tileId, right.tileId) ||
      compareCodePoints(left.id, right.id),
  );

const noviceIndex = (
  observation: PlayerObservation,
  config: Pick<BotPolicyConfig, "botId" | "difficulty" | "personality">,
  candidateCount: number,
  frequency: number,
): number => {
  if (candidateCount < 2) {
    return 0;
  }
  const digest = canonicalJsonHash({
    version: BOT_POLICY_VERSION,
    botId: config.botId,
    difficulty: config.difficulty,
    personality: config.personality,
    gameId: observation.gameId,
    branchId: observation.branchId,
    practiceBranch: observation.practiceBranch,
    revision: observation.revision,
    actionIds: observation.legalActions.map(({ id }) => id).sort(compareCodePoints),
  });
  const bucket = Number.parseInt(digest.slice(0, 8), 16);
  return bucket % frequency === 0 ? 1 + (bucket % Math.min(3, candidateCount - 1)) : 0;
};

const decision = (
  config: BotPolicyConfig,
  observation: PlayerObservation,
  action: ObservedLegalAction,
  reason: BotDecision["reason"],
  analysisRank: number | null,
): BotDecision => ({
  schemaVersion: 1,
  policyVersion: BOT_POLICY_VERSION,
  botId: config.botId,
  difficulty: config.difficulty,
  personality: config.personality,
  branchId: observation.branchId,
  practiceBranch: observation.practiceBranch,
  observationRevision: observation.revision,
  actionId: action.id,
  actionType: action.type,
  analysisRank,
  reason,
});

const chooseStrategicAction = (
  analyses: readonly LegalActionAnalysis[],
): LegalActionAnalysis | null => analyses[0] ?? null;

const createPolicy = (
  config: BotPolicyConfig,
  scriptedWinPassRevisions: ReadonlySet<number>,
): BotPolicy => {
  if (config.botId.trim().length === 0) {
    throw new TypeError("Bot ID must not be empty");
  }
  const mistakeFrequency = config.noviceMistakeFrequency ?? DEFAULT_NOVICE_MISTAKE_FREQUENCY;
  if (!Number.isSafeInteger(mistakeFrequency) || mistakeFrequency < 2 || mistakeFrequency > 100) {
    throw new RangeError("Novice mistake frequency must be an integer from 2 through 100");
  }
  const analyzer = createAnalyzer(config.ruleset);

  return {
    decide: (observation) => {
      if (observation.viewer.playerId !== config.botId) {
        throw new Error(
          `Bot ${config.botId} cannot decide observation for ${observation.viewer.playerId}`,
        );
      }
      if (observation.legalActions.length === 0) {
        return null;
      }

      const wins = orderedActionsOfType(observation, ["declare_win", "claim_win"]);
      if (wins.length > 0) {
        if (scriptedWinPassRevisions.has(observation.revision)) {
          const scriptedPass = orderedActionsOfType(observation, ["pass"])[0];
          if (scriptedPass !== undefined) {
            return decision(config, observation, scriptedPass, "scripted_win_pass", null);
          }
        }
        return decision(config, observation, wins[0]!, "ordinary_win", null);
      }

      const nextHand = orderedActionsOfType(observation, ["start_next_hand"])[0];
      if (nextHand !== undefined) {
        return decision(config, observation, nextHand, "match_progression", null);
      }

      const discardActions = orderedActionsOfType(observation, ["discard"]);
      if (discardActions.length > 0) {
        if (config.difficulty === "novice") {
          const orderedCandidates = noviceDiscardOrder(observation);
          const bestKeepScore =
            orderedCandidates[0] === undefined
              ? 0
              : noviceDiscardKeepScore(orderedCandidates[0], observation);
          const candidates = orderedCandidates.filter(
            (action) =>
              noviceDiscardKeepScore(action, observation) - bestKeepScore <=
              NOVICE_GROUPING_MISTAKE_GAP,
          );
          const candidateIndex = noviceIndex(
            observation,
            config,
            candidates.length,
            mistakeFrequency,
          );
          const selected = candidates[candidateIndex] ?? candidates[0];
          if (selected === undefined) {
            throw new Error("Novice bot received discard actions without a candidate");
          }
          return decision(
            config,
            observation,
            selected,
            candidateIndex === 0 ? "ranked_discard" : "novice_mistake",
            candidateIndex + 1,
          );
        }
        const rollout = config.difficulty === "advanced" ? { iterations: 8, depth: 1 } : undefined;
        const discardAnalysis = analyzer.analyzeDiscards(observation, {
          personality: config.personality,
          ...(rollout === undefined ? {} : { rollout }),
        });
        const orderedCandidates =
          config.difficulty === "basic"
            ? [...discardAnalysis.candidates].sort(basicDiscardOrder)
            : discardAnalysis.candidates;
        const candidateIndex = 0;
        const candidate = orderedCandidates[candidateIndex] ?? orderedCandidates[0];
        if (candidate === undefined) {
          throw new Error("Bot received discard actions without discard analysis");
        }

        const hasKongOption = observation.legalActions.some((action) =>
          ["declare_concealed_kong", "declare_added_kong", "claim_kong"].includes(action.type),
        );
        const bestStrategic = hasKongOption
          ? chooseStrategicAction(analyzer.analyzeLegalActions(observation, config.personality))
          : null;
        if (
          bestStrategic !== null &&
          bestStrategic.actionType !== "discard" &&
          bestStrategic.scoreDeltaFromBaseline > 0
        ) {
          return decision(
            config,
            observation,
            actionById(observation, bestStrategic.actionId),
            "strategic_action",
            bestStrategic.rank,
          );
        }
        return decision(
          config,
          observation,
          actionById(observation, candidate.actionId),
          "ranked_discard",
          candidate.rank,
        );
      }

      const analyses = analyzer.analyzeLegalActions(observation, config.personality);
      const best = analyses[0];
      const noviceAlternatives =
        best === undefined
          ? []
          : analyses.filter(
              (analysis, index) =>
                index === 0 ||
                (best.totalScore - analysis.totalScore <= NOVICE_STRATEGIC_MISTAKE_GAP &&
                  (!analysis.opensHand || analysis.scoreDeltaFromBaseline >= 0)),
            );
      const strategicIndex =
        config.difficulty === "novice"
          ? noviceIndex(observation, config, noviceAlternatives.length, mistakeFrequency)
          : 0;
      const selected =
        config.difficulty === "novice"
          ? (noviceAlternatives[strategicIndex] ?? noviceAlternatives[0])
          : analyses[0];
      if (selected === undefined) {
        return null;
      }
      return decision(
        config,
        observation,
        actionById(observation, selected.actionId),
        strategicIndex === 0 ? "strategic_action" : "novice_mistake",
        selected.rank,
      );
    },
  };
};

export const createBotPolicy = (config: BotPolicyConfig): BotPolicy =>
  createPolicy(config, new Set());

export const createScriptedTeachingBotPolicy = (
  config: ScriptedTeachingBotPolicyConfig,
): BotPolicy => {
  const revisions = new Set(config.passLegalWinsAtRevisions);
  if (
    revisions.size !== config.passLegalWinsAtRevisions.length ||
    [...revisions].some((revision) => !Number.isSafeInteger(revision) || revision < 0)
  ) {
    throw new RangeError("Scripted win-pass revisions must be unique nonnegative safe integers");
  }
  return createPolicy(config, revisions);
};
