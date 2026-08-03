import type { PlayerObservation } from "@hk-mahjong/core/public";
import type {
  AdaptiveDecisionEvidence,
  AdaptiveDifficultySelection,
  AdaptiveDifficultySelector,
  BotDifficulty,
} from "./types.js";

export const ADAPTIVE_DIFFICULTY_VERSION = "adaptive-difficulty-v1" as const;
const MINIMUM_INDEPENDENT_DECISIONS = 8;
const EVIDENCE_WINDOW = 20;
const PROMOTION_THRESHOLD = 0.78;
const DEMOTION_THRESHOLD = 0.42;
const DIFFICULTIES: readonly BotDifficulty[] = ["novice", "basic", "intermediate", "advanced"];

const validateEvidence = (evidence: readonly AdaptiveDecisionEvidence[]): void => {
  const ids = evidence.map(({ decisionId }) => decisionId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Adaptive evidence decision IDs must be unique");
  }
  for (const decision of evidence) {
    if (
      decision.decisionId.trim().length === 0 ||
      !Number.isFinite(decision.quality) ||
      decision.quality < 0 ||
      decision.quality > 1
    ) {
      throw new RangeError("Adaptive evidence must have an ID and quality from zero through one");
    }
  }
};

const adjacentDifficulty = (current: BotDifficulty, direction: -1 | 0 | 1): BotDifficulty => {
  const index = DIFFICULTIES.indexOf(current);
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, index + direction))]!;
};

export interface AdaptiveDifficultyInput {
  previousDifficulty: BotDifficulty;
  branchId: PlayerObservation["branchId"];
  practiceBranch: boolean;
  nextHandIndex: number;
  recentDecisions: readonly AdaptiveDecisionEvidence[];
}

/**
 * Selects one fixed strength from recent independent decision quality. The returned selection is
 * hand-scoped evidence that the composition root persists and reuses until that hand completes.
 */
export const selectAdaptiveDifficulty = (
  input: AdaptiveDifficultyInput,
): AdaptiveDifficultySelection => {
  if (!DIFFICULTIES.includes(input.previousDifficulty)) {
    throw new RangeError(`Unknown previous bot difficulty ${input.previousDifficulty}`);
  }
  if (!Number.isSafeInteger(input.nextHandIndex) || input.nextHandIndex < 0) {
    throw new RangeError("Adaptive hand index must be a nonnegative safe integer");
  }
  if (input.branchId.trim().length === 0) {
    throw new RangeError("Adaptive branch ID must not be empty");
  }
  validateEvidence(input.recentDecisions);
  const independent = input.recentDecisions
    .filter(({ independent: isIndependent }) => isIndependent)
    .slice(-EVIDENCE_WINDOW);
  const average =
    independent.length === 0
      ? 0
      : independent.reduce((total, { quality }) => total + quality, 0) / independent.length;
  const direction: -1 | 0 | 1 =
    independent.length < MINIMUM_INDEPENDENT_DECISIONS
      ? 0
      : average >= PROMOTION_THRESHOLD
        ? 1
        : average <= DEMOTION_THRESHOLD
          ? -1
          : 0;
  return {
    version: ADAPTIVE_DIFFICULTY_VERSION,
    branchId: input.branchId,
    practiceBranch: input.practiceBranch,
    handIndex: input.nextHandIndex,
    difficulty: adjacentDifficulty(input.previousDifficulty, direction),
    evidenceDecisionIds: independent.map(({ decisionId }) => decisionId),
  };
};

const handKey = (observation: PlayerObservation): string =>
  `${observation.gameId}:${observation.branchId}:${String(observation.practiceBranch)}:hand:${String(observation.round.handIndex)}`;

export const createAdaptiveDifficultySelector = (
  initialDifficulty: BotDifficulty = "basic",
): AdaptiveDifficultySelector => {
  if (!DIFFICULTIES.includes(initialDifficulty)) {
    throw new RangeError(`Unknown initial bot difficulty ${initialDifficulty}`);
  }
  let previousDifficulty = initialDifficulty;
  let locked: {
    key: string;
    selection: AdaptiveDifficultySelection;
  } | null = null;

  return {
    selectionForHand: (observation, recentDecisions) => {
      const key = handKey(observation);
      if (locked?.key === key) {
        return locked.selection;
      }
      if (locked !== null) {
        throw new Error("Complete the locked adaptive hand before selecting another");
      }
      const selection = selectAdaptiveDifficulty({
        previousDifficulty,
        branchId: observation.branchId,
        practiceBranch: observation.practiceBranch,
        nextHandIndex: observation.round.handIndex,
        recentDecisions,
      });
      locked = { key, selection };
      return selection;
    },
    completeHand: (observation) => {
      if (observation.phase !== "hand_ended" && observation.phase !== "match_ended") {
        throw new Error("Cannot complete an adaptive hand before it reaches a terminal phase");
      }
      const key = handKey(observation);
      if (locked?.key !== key) {
        throw new Error("Cannot complete an adaptive hand that is not locked");
      }
      previousDifficulty = locked.selection.difficulty;
      locked = null;
    },
  };
};
