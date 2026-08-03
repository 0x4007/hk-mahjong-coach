import type {
  AnalysisFact,
  AnalysisFactKind,
  DiscardAnalysisResult,
  LegalActionAnalysis,
} from "@hk-mahjong/analysis";
import type { PlayerObservation, TileTypeId } from "@hk-mahjong/core/public";

export const COACHING_TEMPLATE_VERSION = "1.0.0" as const;
export const MASTERY_ALGORITHM_VERSION = "ema-alpha-0.2-v1" as const;
export const CURRICULUM_VERSION = "hk-curriculum-v1" as const;
export const DRILL_LIBRARY_VERSION = "hk-drills-v1" as const;
export const NARRATOR_PROMPT_VERSION = "coach-narration-v1" as const;

export const COACH_MODES = [
  "learn",
  "guided",
  "socratic",
  "competitive",
  "exam",
  "sandbox",
] as const;
export type CoachMode = (typeof COACH_MODES)[number];

export const HINT_LEVELS = ["none", "nudge", "compare", "reveal"] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];

export const CONCEPT_IDS = [
  "tile_recognition",
  "tile_categories",
  "meld_recognition",
  "turn_order_claim_priority",
  "winning_shape",
  "minimum_faan_planning",
  "dragon_wind_value",
  "all_chows_all_pungs",
  "suit_hands",
  "waits_improving_tiles",
  "tile_efficiency",
  "call_discipline",
  "kong_judgment",
  "visible_tile_counting",
  "relative_safety",
  "speed_vs_value",
  "endgame_decisions",
  "scoring_payments",
  "social_table_procedure",
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export const DRILL_TYPES = [
  "name_tile",
  "find_tile",
  "sort_hand",
  "complete_chow",
  "identify_meld",
  "find_winning_tile",
  "count_visible_copies",
  "count_faan",
  "can_hand_win",
  "choose_discard",
  "call_or_pass",
  "compare_relative_safety",
  "replay_quiz",
  "social_table_procedure",
] as const;
export type DrillType = (typeof DRILL_TYPES)[number];
export type DrillSource = "bundled" | "generated" | "replay";

export interface CoachActionCandidate {
  readonly actionId: string;
  readonly rank: number;
  readonly totalScore: number;
  readonly confidence: number;
  readonly distanceAfterAction: number | null;
  readonly visibleImprovingCopies: number | null;
  readonly likelyFaanPathIds: readonly string[];
  readonly facts: readonly AnalysisFact[];
}

/** A compact analysis projection that contains everything a narrator may cite. */
export interface CoachingAnalysis {
  readonly analysisVersion: string;
  readonly weightingVersion: string;
  readonly recommendedActionId: string | null;
  readonly candidates: readonly CoachActionCandidate[];
  readonly facts: readonly AnalysisFact[];
  readonly rollout: {
    readonly version: string;
    readonly iterations: number;
    readonly uncertainty: number;
  } | null;
}

export interface LearnerPatternEvidence {
  readonly patternId: string;
  readonly conceptId: ConceptId;
  readonly sampleSize: number;
  readonly relevantDecisionIds: readonly string[];
  readonly metric: number;
  readonly comparisonBaseline: number | null;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly summary: string;
}

export interface LearnerContext {
  readonly learnerId: string;
  readonly mode: CoachMode;
  readonly currentObjective: string;
  readonly mastery: readonly ConceptMastery[];
  readonly patterns: readonly LearnerPatternEvidence[];
  readonly verbosity: "brief" | "normal" | "detailed";
}

/**
 * This deliberately contains `PlayerObservation`, never `GameState`. It is the only input shape
 * accepted by narrator implementations and keeps hidden wall/opponent state out of prose layers.
 */
export interface CoachNarrationInput {
  readonly observation: PlayerObservation;
  readonly analysis: CoachingAnalysis;
  readonly learner: LearnerContext;
  readonly hintLevel: HintLevel;
  readonly allowStylisticAlternative?: boolean;
}

export interface CoachNarrationAlternative {
  readonly actionId: string;
  readonly tradeoff: string;
  readonly factIds: readonly string[];
}

export interface CoachNarrationResult {
  readonly recommendedActionId?: string;
  readonly confidence: number;
  readonly headline: string;
  readonly explanation: string;
  readonly alternatives: readonly CoachNarrationAlternative[];
  readonly question?: string;
  readonly conceptIds: readonly ConceptId[];
  readonly factIds: readonly string[];
  readonly uncertainty?: string;
}

export interface CoachNarrator {
  explain(input: CoachNarrationInput): Promise<CoachNarrationResult>;
}

export type NarratorStatus = "template" | "provider" | "fallback" | "unavailable";

export interface CoachFeedback {
  readonly status: NarratorStatus;
  readonly level: HintLevel;
  readonly narration: CoachNarrationResult;
  readonly fallbackReason: "timeout" | "provider_error" | "invalid_output" | "cancelled" | null;
}

export interface ConceptMastery {
  readonly learnerId: string;
  readonly conceptId: ConceptId;
  readonly mastery: number;
  readonly confidence: number;
  readonly attempts: number;
  readonly independentAttempts: number;
  readonly successfulAttempts: number;
  readonly hintWeightedScore: number;
  readonly algorithmVersion: typeof MASTERY_ALGORITHM_VERSION;
  readonly lastSeenAt: string | null;
  readonly nextReviewAt: string | null;
  readonly updatedAt: string;
}

export interface MasteryUpdateInput {
  readonly learnerId: string;
  readonly conceptId: ConceptId;
  /** 0 is clearly inferior, 1 is top-ranked or near-equivalent. */
  readonly quality: number;
  readonly independent: boolean;
  readonly hintLevel: HintLevel;
  readonly occurredAt: string;
}

export interface MasteryUpdate {
  readonly mastery: ConceptMastery;
  readonly intervalDays: 1 | 3 | 7 | 14 | 30;
  readonly quality: number;
  readonly hintWeight: number;
}

export interface CoachingDecisionRecord {
  readonly decisionId: string;
  readonly learnerId: string;
  readonly conceptIds: readonly ConceptId[];
  readonly selectedActionId: string;
  readonly recommendedActionId: string | null;
  readonly quality: number;
  readonly independent: boolean;
  readonly hintLevel: HintLevel;
  readonly createdAt: string;
}

export interface DrillItem {
  readonly id: string;
  readonly source: DrillSource;
  readonly type: DrillType;
  readonly conceptIds: readonly ConceptId[];
  readonly difficulty: number;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly answer: string;
  readonly tile?: TileTypeId;
}

export interface DrillAttempt {
  readonly drillItemId: string;
  readonly learnerId: string;
  readonly correct: boolean;
  readonly hintLevel: HintLevel;
  readonly createdAt: string;
}

export interface PostHandReview {
  readonly handId: string;
  readonly finalScoreSummary: string;
  readonly timelineDecisionIds: readonly string[];
  readonly highImpactDecisionIds: readonly string[];
  readonly positiveDecisionId: string | null;
  readonly counterfactualActionIds: readonly string[];
  readonly conceptIds: readonly ConceptId[];
  readonly nextDrillConceptId: ConceptId | null;
  readonly omniscientAvailable: boolean;
}

/** Public scoring information suitable for a post-hand teaching review. */
export type CoachPublicHandResult =
  | {
      readonly kind: "win";
      readonly winners: readonly {
        readonly playerId: string;
        readonly scoring: { readonly cappedFaan: number };
      }[];
    }
  | { readonly kind: "exhaustive_draw" | "sandbox_end"; readonly winners: readonly [] };

export interface CurriculumStage {
  readonly stage: number;
  readonly id: string;
  readonly name: string;
  readonly outcomes: readonly string[];
  readonly suggestedUnlock: string;
  readonly conceptIds: readonly ConceptId[];
}

export const coachingAnalysisFromDiscard = (analysis: DiscardAnalysisResult): CoachingAnalysis => {
  const candidates = analysis.candidates.map((candidate): CoachActionCandidate => ({
    actionId: candidate.actionId,
    rank: candidate.rank,
    totalScore: candidate.totalScore,
    confidence: candidate.confidence,
    distanceAfterAction: candidate.distanceAfterDiscard,
    visibleImprovingCopies: candidate.visibleImprovingCopies,
    likelyFaanPathIds: candidate.likelyFaanPaths.map(({ id }) => id),
    facts: candidate.facts,
  }));
  const top = analysis.candidates[0];
  return {
    analysisVersion: analysis.analysisVersion,
    weightingVersion: analysis.weightingVersion,
    recommendedActionId: analysis.recommendedActionId,
    candidates,
    facts: analysis.facts,
    rollout:
      top?.rollout === null || top?.rollout === undefined
        ? null
        : {
            version: top.rollout.version,
            iterations: top.rollout.iterations,
            uncertainty: top.rollout.uncertainty,
          },
  };
};

export const coachingAnalysisFromLegalActions = (
  actions: readonly LegalActionAnalysis[],
): CoachingAnalysis => {
  const sorted = [...actions].sort(
    (left, right) => left.rank - right.rank || left.actionId.localeCompare(right.actionId),
  );
  return {
    analysisVersion: "legal-action-analysis-v1",
    weightingVersion: sorted[0]?.weightingVersion ?? "legal-action-weights-v1",
    recommendedActionId: sorted[0]?.actionId ?? null,
    candidates: sorted.map((action): CoachActionCandidate => ({
      actionId: action.actionId,
      rank: action.rank,
      totalScore: action.totalScore,
      confidence: 0.5,
      distanceAfterAction: action.distanceAfterAction,
      visibleImprovingCopies: action.visibleImprovingCopies,
      likelyFaanPathIds: action.likelyFaanPaths.map(({ id }) => id),
      facts: action.facts,
    })),
    facts: sorted.flatMap((action) => action.facts),
    rollout: null,
  };
};

export type { AnalysisFact, AnalysisFactKind };
