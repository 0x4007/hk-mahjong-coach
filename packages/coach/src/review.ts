import { nextCurriculumConcept } from "./curriculum.js";
import type {
  CoachPublicHandResult,
  CoachingDecisionRecord,
  ConceptMastery,
  PostHandReview,
} from "./types.js";

const unique = <Value>(items: readonly Value[]): readonly Value[] => [...new Set(items)];

const scoreSummary = (result: CoachPublicHandResult): string => {
  if (result.kind !== "win") {
    return result.kind === "exhaustive_draw"
      ? "The hand ended in an exhaustive draw."
      : "The sandbox hand ended without a scored win.";
  }
  const winnerNames = result.winners.map(({ playerId }) => playerId).join(", ");
  const faan = result.winners.map(({ scoring }) => scoring.cappedFaan).join(", ");
  return `${winnerNames} won with ${faan} faan; payments were settled as zero-sum score changes.`;
};

/** Creates a compact, deterministic post-hand review without revealing live hidden information. */
export const createPostHandReview = (input: {
  handId: string;
  result: CoachPublicHandResult;
  decisions: readonly CoachingDecisionRecord[];
  mastery: readonly ConceptMastery[];
  omniscientAvailable: boolean;
}): PostHandReview => {
  const ordered = [...input.decisions].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.decisionId.localeCompare(right.decisionId),
  );
  const impactful = [...ordered]
    .sort(
      (left, right) =>
        left.quality - right.quality || left.decisionId.localeCompare(right.decisionId),
    )
    .slice(0, 3);
  const positive = [...ordered]
    .filter((decision) => decision.quality >= 0.8)
    .sort(
      (left, right) =>
        right.quality - left.quality || left.decisionId.localeCompare(right.decisionId),
    )[0];
  const conceptIds = unique(ordered.flatMap((decision) => decision.conceptIds));
  const weakConcepts = impactful.flatMap((decision) => decision.conceptIds);
  const nextDrillConceptId = nextCurriculumConcept(input.mastery, weakConcepts);
  return {
    handId: input.handId,
    finalScoreSummary: scoreSummary(input.result),
    timelineDecisionIds: ordered.map(({ decisionId }) => decisionId),
    highImpactDecisionIds: impactful.map(({ decisionId }) => decisionId),
    positiveDecisionId: positive?.decisionId ?? null,
    counterfactualActionIds: impactful
      .map(({ recommendedActionId }) => recommendedActionId)
      .filter((actionId): actionId is string => actionId !== null),
    conceptIds,
    nextDrillConceptId,
    omniscientAvailable: input.omniscientAvailable,
  };
};
