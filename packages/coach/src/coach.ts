import type { AnalysisFact } from "@hk-mahjong/analysis";
import type { PlayerObservation } from "@hk-mahjong/core/public";

import { MASTERY_EMA_ALPHA, decisionQualityFromAnalysis, updateConceptMastery } from "./mastery.js";
import { CoachNarrationService } from "./narrator.js";
import type {
  CoachFeedback,
  CoachingAnalysis,
  CoachingDecisionRecord,
  ConceptId,
  ConceptMastery,
  HintLevel,
  LearnerContext,
  MasteryUpdate,
} from "./types.js";

const conceptForFact: Readonly<Record<AnalysisFact["kind"], ConceptId>> = {
  distance: "tile_efficiency",
  improving_tiles: "waits_improving_tiles",
  visible_copies: "visible_tile_counting",
  faan_path: "minimum_faan_planning",
  relative_risk: "relative_safety",
  legal_rule: "turn_order_claim_priority",
  score_gap: "tile_efficiency",
  learner_pattern: "tile_efficiency",
};

export interface CoachMemoryPort {
  getConceptMastery(learnerId: string, conceptId: ConceptId): ConceptMastery | null;
  saveConceptMastery(mastery: ConceptMastery): void;
  recordDecision(decision: CoachingDecisionRecord): void;
  recordHint(input: {
    learnerId: string;
    decisionId: string | null;
    level: Exclude<HintLevel, "none">;
    conceptIds: readonly ConceptId[];
    createdAt: string;
  }): void;
}

export interface CoachDecisionInput {
  readonly decisionId: string;
  readonly learnerId: string;
  readonly observation: PlayerObservation;
  readonly analysis: CoachingAnalysis;
  readonly selectedActionId: string;
  readonly independent: boolean;
  readonly hintLevel: HintLevel;
  readonly conceptIds?: readonly ConceptId[];
  readonly createdAt: string;
}

const uniqueConcepts = (
  facts: readonly AnalysisFact[],
  extra: readonly ConceptId[] = [],
): readonly ConceptId[] => {
  const values = new Set<ConceptId>(extra);
  for (const fact of facts) {
    values.add(conceptForFact[fact.kind]);
  }
  return [...values].sort();
};

const factsForSelectedAction = (
  selectedActionId: string,
  analysis: CoachingAnalysis,
): readonly AnalysisFact[] => {
  const selected = analysis.candidates.find(({ actionId }) => actionId === selectedActionId);
  return selected === undefined ? analysis.facts : [...analysis.facts, ...selected.facts];
};

const applyHintConfidence = (
  mastery: ConceptMastery,
  level: Exclude<HintLevel, "none">,
  createdAt: string,
): ConceptMastery => {
  const strength: Readonly<Record<Exclude<HintLevel, "none">, number>> = {
    nudge: 0.75,
    compare: 0.5,
    reveal: 0.25,
  };
  return {
    ...mastery,
    confidence:
      Math.round(
        (mastery.confidence * (1 - MASTERY_EMA_ALPHA) + strength[level] * MASTERY_EMA_ALPHA) *
          1_000_000,
      ) / 1_000_000,
    lastSeenAt: createdAt,
    updatedAt: createdAt,
  };
};

/**
 * Pedagogical coordinator. It accepts only a redacted observation plus deterministic analysis and
 * persists its own evidence through an injected port; it never executes game commands or scores.
 */
export class DeterministicCoach {
  readonly #memory: CoachMemoryPort;
  readonly #narration: CoachNarrationService;

  public constructor(memory: CoachMemoryPort, narration = new CoachNarrationService()) {
    this.#memory = memory;
    this.#narration = narration;
  }

  public async feedback(input: {
    observation: PlayerObservation;
    analysis: CoachingAnalysis;
    learner: LearnerContext;
    hintLevel: HintLevel;
  }): Promise<CoachFeedback> {
    return this.#narration.explain(input);
  }

  public recordDecision(input: CoachDecisionInput): readonly MasteryUpdate[] {
    const quality = decisionQualityFromAnalysis(input.selectedActionId, input.analysis);
    const conceptIds = uniqueConcepts(
      factsForSelectedAction(input.selectedActionId, input.analysis),
      input.conceptIds,
    );
    const decision: CoachingDecisionRecord = {
      decisionId: input.decisionId,
      learnerId: input.learnerId,
      conceptIds,
      selectedActionId: input.selectedActionId,
      recommendedActionId: input.analysis.recommendedActionId,
      quality,
      independent: input.independent,
      hintLevel: input.hintLevel,
      createdAt: input.createdAt,
    };
    this.#memory.recordDecision(decision);
    const updates = conceptIds.map((conceptId) => {
      const previous = this.#memory.getConceptMastery(input.learnerId, conceptId);
      const update = updateConceptMastery(previous, {
        learnerId: input.learnerId,
        conceptId,
        quality,
        independent: input.independent,
        hintLevel: input.hintLevel,
        occurredAt: input.createdAt,
      });
      this.#memory.saveConceptMastery(update.mastery);
      return update;
    });
    return updates;
  }

  /** A recorded hint reduces confidence calibration but never marks an answer wrong. */
  public recordHint(input: {
    learnerId: string;
    decisionId: string | null;
    level: Exclude<HintLevel, "none">;
    conceptIds: readonly ConceptId[];
    createdAt: string;
  }): void {
    this.#memory.recordHint(input);
    for (const conceptId of input.conceptIds) {
      const previous = this.#memory.getConceptMastery(input.learnerId, conceptId);
      if (previous !== null) {
        this.#memory.saveConceptMastery(
          applyHintConfidence(previous, input.level, input.createdAt),
        );
      }
    }
  }

  /** Assistance naturally becomes less proactive as independent mastery and confidence improve. */
  public shouldOfferProactiveHelp(
    mode: LearnerContext["mode"],
    mastery: readonly ConceptMastery[],
  ): boolean {
    if (mode === "competitive" || mode === "exam") {
      return false;
    }
    if (mode === "learn") {
      return true;
    }
    if (mode === "sandbox") {
      return false;
    }
    if (mastery.length === 0) {
      return mode === "guided";
    }
    const average =
      mastery.reduce((total, record) => total + (record.mastery + record.confidence) / 2, 0) /
      mastery.length;
    return average < 0.7;
  }
}

export const conceptsForCoachingAnalysis = (analysis: CoachingAnalysis): readonly ConceptId[] =>
  uniqueConcepts([
    ...analysis.facts,
    ...analysis.candidates.flatMap((candidate) => candidate.facts),
  ]);
