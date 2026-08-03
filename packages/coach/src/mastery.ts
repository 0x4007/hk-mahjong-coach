import {
  MASTERY_ALGORITHM_VERSION,
  type CoachingAnalysis,
  type ConceptId,
  type ConceptMastery,
  type HintLevel,
  type LearnerPatternEvidence,
  type MasteryUpdate,
  type MasteryUpdateInput,
  type CoachingDecisionRecord,
} from "./types.js";

export const MASTERY_EMA_ALPHA = 0.2 as const;
export const SPACED_REPETITION_INTERVALS = [1, 3, 7, 14, 30] as const;

const HINT_WEIGHTS: Readonly<Record<HintLevel, number>> = {
  none: 1,
  nudge: 0.75,
  compare: 0.5,
  reveal: 0.25,
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const requireIsoDate = (value: string, label: string): Date => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`${label} must be an ISO timestamp`);
  }
  return new Date(timestamp);
};

const addUtcDays = (value: string, days: number): string => {
  const date = requireIsoDate(value, "Mastery timestamp");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const intervalAfter = (
  previous: ConceptMastery | null,
  quality: number,
  independent: boolean,
): (typeof SPACED_REPETITION_INTERVALS)[number] => {
  if (!independent || quality < 0.7) {
    return 1;
  }
  const previousDays =
    previous === null ? 0 : daysBetween(previous.updatedAt, previous.nextReviewAt);
  const previousIndex = SPACED_REPETITION_INTERVALS.indexOf(
    previousDays as (typeof SPACED_REPETITION_INTERVALS)[number],
  );
  const nextIndex =
    previousIndex < 0 ? 0 : Math.min(previousIndex + 1, SPACED_REPETITION_INTERVALS.length - 1);
  return SPACED_REPETITION_INTERVALS[nextIndex]!;
};

const daysBetween = (start: string, end: string | null): number => {
  if (end === null) {
    return 0;
  }
  const startTime = requireIsoDate(start, "Mastery start timestamp").getTime();
  const endTime = requireIsoDate(end, "Mastery end timestamp").getTime();
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
};

/** The documented confidence-only effect of a hint; it never changes decision correctness. */
export const hintWeightFor = (hintLevel: HintLevel): number => HINT_WEIGHTS[hintLevel];

/**
 * Converts deterministic rank/score gaps to a transparent quality score. The top action and
 * strategically near-equivalent actions receive 1.0; all other choices are normalized by the
 * deterministic total-score gap.
 */
export const decisionQualityFromAnalysis = (
  selectedActionId: string,
  analysis: CoachingAnalysis,
  nearEquivalentFraction = 0.02,
): number => {
  if (
    !Number.isFinite(nearEquivalentFraction) ||
    nearEquivalentFraction < 0 ||
    nearEquivalentFraction > 1
  ) {
    throw new RangeError("Near-equivalent fraction must be between 0 and 1");
  }
  const selected = analysis.candidates.find(({ actionId }) => actionId === selectedActionId);
  const top = analysis.candidates[0];
  if (selected === undefined || top === undefined) {
    throw new RangeError("Selected action must be an emitted analyzed action");
  }
  const gap = Math.max(0, top.totalScore - selected.totalScore);
  const scale = Math.max(1, Math.abs(top.totalScore));
  if (gap <= scale * nearEquivalentFraction) {
    return 1;
  }
  const worstScore = analysis.candidates.reduce(
    (minimum, candidate) => Math.min(minimum, candidate.totalScore),
    top.totalScore,
  );
  const spread = Math.max(1, top.totalScore - worstScore);
  return round(clamp(1 - gap / spread));
};

export const updateConceptMastery = (
  previous: ConceptMastery | null,
  input: MasteryUpdateInput,
): MasteryUpdate => {
  if (!Number.isFinite(input.quality) || input.quality < 0 || input.quality > 1) {
    throw new RangeError("Mastery quality must be between 0 and 1");
  }
  requireIsoDate(input.occurredAt, "Mastery timestamp");
  if (
    previous !== null &&
    (previous.learnerId !== input.learnerId || previous.conceptId !== input.conceptId)
  ) {
    throw new RangeError("Mastery update must match the existing learner and concept");
  }
  const quality = round(clamp(input.quality));
  const hintWeight = hintWeightFor(input.hintLevel);
  const weightedQuality = quality * hintWeight;
  const baseMastery = previous?.mastery ?? weightedQuality;
  const baseConfidence = previous?.confidence ?? (input.independent ? quality : weightedQuality);
  const nextMastery = round(
    clamp(baseMastery * (1 - MASTERY_EMA_ALPHA) + weightedQuality * MASTERY_EMA_ALPHA),
  );
  const confidenceEvidence = input.independent ? quality : weightedQuality;
  const nextConfidence = round(
    clamp(baseConfidence * (1 - MASTERY_EMA_ALPHA) + confidenceEvidence * MASTERY_EMA_ALPHA),
  );
  const intervalDays = intervalAfter(previous, quality, input.independent);
  const attempts = (previous?.attempts ?? 0) + 1;
  const independentAttempts = (previous?.independentAttempts ?? 0) + (input.independent ? 1 : 0);
  const successfulAttempts = (previous?.successfulAttempts ?? 0) + (quality >= 0.8 ? 1 : 0);
  const hintWeightedScore = round((previous?.hintWeightedScore ?? 0) + weightedQuality);

  return {
    mastery: {
      learnerId: input.learnerId,
      conceptId: input.conceptId,
      mastery: nextMastery,
      confidence: nextConfidence,
      attempts,
      independentAttempts,
      successfulAttempts,
      hintWeightedScore,
      algorithmVersion: MASTERY_ALGORITHM_VERSION,
      lastSeenAt: input.occurredAt,
      nextReviewAt: addUtcDays(input.occurredAt, intervalDays),
      updatedAt: input.occurredAt,
    },
    intervalDays,
    quality,
    hintWeight,
  };
};

/**
 * Builds conservative, evidence-backed coaching patterns. It intentionally returns no pattern
 * until four comparable decisions exist, so templates cannot make "always" or "never" claims.
 */
export const deriveLearnerPatterns = (
  decisions: readonly CoachingDecisionRecord[],
  minimumSampleSize = 4,
): readonly LearnerPatternEvidence[] => {
  if (!Number.isSafeInteger(minimumSampleSize) || minimumSampleSize < 4) {
    throw new RangeError("Learner patterns require a minimum sample size of at least four");
  }
  if (new Set(decisions.map(({ learnerId }) => learnerId)).size > 1) {
    throw new RangeError("Learner patterns must be derived from one learner");
  }
  const byConcept = new Map<ConceptId, CoachingDecisionRecord[]>();
  for (const decision of decisions) {
    for (const conceptId of decision.conceptIds) {
      const records = byConcept.get(conceptId) ?? [];
      records.push(decision);
      byConcept.set(conceptId, records);
    }
  }
  const patterns: LearnerPatternEvidence[] = [];
  for (const [conceptId, records] of byConcept) {
    const chronological = [...records].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.decisionId.localeCompare(right.decisionId),
    );
    if (chronological.length < minimumSampleSize) {
      continue;
    }
    const average =
      chronological.reduce((total, record) => total + record.quality, 0) / chronological.length;
    const weak = chronological.filter((record) => record.quality < 0.6);
    if (weak.length < minimumSampleSize / 2 || average >= 0.72) {
      continue;
    }
    const first = chronological[0];
    const last = chronological.at(-1);
    if (first === undefined || last === undefined) {
      continue;
    }
    patterns.push({
      patternId: `pattern:${conceptId}:${first.decisionId}:${last.decisionId}`,
      conceptId,
      sampleSize: chronological.length,
      relevantDecisionIds: chronological.map(({ decisionId }) => decisionId),
      metric: round(average),
      comparisonBaseline: 0.72,
      firstObservedAt: first.createdAt,
      lastObservedAt: last.createdAt,
      summary: `In ${String(weak.length)} of your last ${String(chronological.length)} ${conceptId.replaceAll("_", " ")} decisions, the deterministic alternative was meaningfully stronger.`,
    });
  }
  return patterns.sort((left, right) => left.conceptId.localeCompare(right.conceptId));
};
