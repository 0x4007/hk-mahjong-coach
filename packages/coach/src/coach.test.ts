import { describe, expect, it } from "vitest";
import { createAnalyzer, type AnalysisFact, type LegalActionAnalysis } from "@hk-mahjong/analysis";
import { createGameEngine, type GameEngine, type PlayerObservation } from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";

import {
  CoachNarratorFailure,
  CoachNarrationService,
  DeterministicCoach,
  OpenAICoachNarrator,
  TemplateCoachNarrator,
  allowedNarratorConcepts,
  coachingAnalysisFromDiscard,
  coachingAnalysisFromLegalActions,
  conceptsForCoachingAnalysis,
  createBundledDrillLibrary,
  createPostHandReview,
  createTileRecognitionDrill,
  curriculumStageFor,
  decisionQualityFromAnalysis,
  deriveLearnerPatterns,
  drillTypesForConcept,
  hintWeightFor,
  nextCurriculumConcept,
  updateConceptMastery,
  validateCoachNarration,
  type CoachMode,
  type CoachMemoryPort,
  type CoachNarrationInput,
  type CoachNarrationResult,
  type ConceptId,
  type ConceptMastery,
  type CoachingDecisionRecord,
  type LearnerContext,
} from "./index.js";

const ruleset = getBundledRuleset("hk_nyc_social_v1");

const createdObservation = (): PlayerObservation => {
  const engine: GameEngine = createGameEngine({
    scoringSystem: createHongKongScoringSystem(ruleset),
  });
  const created = engine.create({
    type: "create_game",
    requestId: "coach-test-create",
    branchId: "main",
    seed: "coach-test-seed",
    mode: "guided",
    matchLength: "one_wind",
    rules: toCoreGameRules(ruleset),
    players: [
      { id: "east", displayName: "East", controller: "human", seat: "east" },
      { id: "south", displayName: "South", controller: "bot", seat: "south" },
      { id: "west", displayName: "West", controller: "bot", seat: "west" },
      { id: "north", displayName: "North", controller: "bot", seat: "north" },
    ],
  });
  if (!created.accepted) {
    throw new Error(created.error.message);
  }
  return engine.observation(created.state, "east");
};

class Memory implements CoachMemoryPort {
  readonly mastery = new Map<string, ConceptMastery>();
  readonly decisions: CoachingDecisionRecord[] = [];
  readonly hints: { learnerId: string; decisionId: string | null; level: string }[] = [];

  getConceptMastery(learnerId: string, conceptId: ConceptId): ConceptMastery | null {
    return this.mastery.get(`${learnerId}:${conceptId}`) ?? null;
  }

  saveConceptMastery(mastery: ConceptMastery): void {
    this.mastery.set(`${mastery.learnerId}:${mastery.conceptId}`, mastery);
  }

  recordDecision(decision: CoachingDecisionRecord): void {
    this.decisions.push(decision);
  }

  recordHint(input: {
    learnerId: string;
    decisionId: string | null;
    level: "nudge" | "compare" | "reveal";
    conceptIds: readonly ConceptId[];
    createdAt: string;
  }): void {
    this.hints.push({
      learnerId: input.learnerId,
      decisionId: input.decisionId,
      level: input.level,
    });
  }
}

const learner = (mode: CoachMode = "guided"): LearnerContext => ({
  learnerId: "learner-1",
  mode,
  currentObjective: "Keep the hand flexible.",
  mastery: [],
  patterns: [],
  verbosity: "brief" as const,
});

const narrationInput = (
  mode: CoachMode = "guided",
  hintLevel: CoachNarrationInput["hintLevel"] = "reveal",
): CoachNarrationInput => {
  const observation = createdObservation();
  return {
    observation,
    analysis: coachingAnalysisFromDiscard(createAnalyzer(ruleset).analyzeDiscards(observation)),
    learner: learner(mode),
    hintLevel,
  };
};

const analysisFact = (id: string, kind: AnalysisFact["kind"] = "distance"): AnalysisFact => ({
  id,
  kind,
  summary: `Structured ${kind} evidence.`,
  data: { source: "coach-test" },
});

const legalActionAnalysis = (
  observation: PlayerObservation,
  index: number,
  rank: number,
  totalScore: number,
  facts: readonly AnalysisFact[],
): LegalActionAnalysis => {
  const action = observation.legalActions[index];
  if (action === undefined) {
    throw new Error(`Expected legal action at index ${String(index)}`);
  }
  return {
    actionId: action.id,
    actionType: action.type,
    branchId: observation.branchId,
    practiceBranch: observation.practiceBranch,
    observationRevision: observation.revision,
    rank,
    totalScore,
    weightingVersion: "legal-action-weights-v1",
    baselineActionId: null,
    scoreDeltaFromBaseline: 0,
    components: {
      speed: 0,
      visibleAvailability: 0,
      handValue: 0,
      flexibility: 0,
      callCompatibility: 0,
      relativeSafety: 0,
    },
    distanceAfterAction: null,
    visibleImprovingCopies: null,
    likelyFaanPaths: [],
    relativeRisk: 0,
    valueFaan: 0,
    opensHand: false,
    facts,
  };
};

const masteryFor = (conceptId: ConceptId, value: number): ConceptMastery => ({
  ...updateConceptMastery(null, {
    learnerId: "learner-1",
    conceptId,
    quality: value,
    independent: true,
    hintLevel: "none",
    occurredAt: "2026-08-02T12:00:00.000Z",
  }).mastery,
  mastery: value,
  confidence: value,
});

const validatedNarration = (input: CoachNarrationInput): CoachNarrationResult => {
  const actionId = input.analysis.recommendedActionId;
  const fact = input.analysis.facts[0] ?? input.analysis.candidates[0]?.facts[0];
  if (actionId === null || fact === undefined) {
    throw new Error("Expected a recommendation and fact for narration validation");
  }
  return {
    recommendedActionId: actionId,
    confidence: 0.75,
    headline: "Keep the wider improving set.",
    explanation: "This recommendation cites only the supplied visible-information fact.",
    alternatives: [],
    question: "Which action keeps more ways to improve?",
    conceptIds: allowedNarratorConcepts(input).slice(0, 1),
    factIds: [fact.id],
    uncertainty: "This is a strategic preference.",
  };
};

describe("deterministic coaching", () => {
  it("uses analysis facts for templates and rejects invalid provider action references", async () => {
    const observation = createdObservation();
    const analysis = coachingAnalysisFromDiscard(
      createAnalyzer(ruleset).analyzeDiscards(observation),
    );
    const template = await new TemplateCoachNarrator().explain({
      observation,
      analysis,
      learner: learner(),
      hintLevel: "reveal",
    });
    expect(template.recommendedActionId).toBe(analysis.recommendedActionId ?? undefined);
    expect(template.factIds.every((id) => analysis.facts.some((fact) => fact.id === id))).toBe(
      true,
    );

    const service = new CoachNarrationService({
      provider: {
        explain: () =>
          Promise.resolve({
            recommendedActionId: "not-an-emitted-action",
            confidence: 1,
            headline: "Bad action",
            explanation: "Unsupported.",
            alternatives: [],
            conceptIds: [],
            factIds: [],
          }),
      },
    });
    const response = await service.explain({
      observation,
      analysis,
      learner: learner(),
      hintLevel: "reveal",
    });
    expect(response.status).toBe("fallback");
    expect(response.fallbackReason).toBe("invalid_output");
  });

  it("records hints as confidence calibration and keeps answer quality deterministic", () => {
    const observation = createdObservation();
    const analysis = coachingAnalysisFromDiscard(
      createAnalyzer(ruleset).analyzeDiscards(observation),
    );
    const recommendedActionId = analysis.recommendedActionId;
    if (recommendedActionId === null) {
      throw new Error("Expected a discard recommendation");
    }
    const memory = new Memory();
    const coach = new DeterministicCoach(memory);
    const updates = coach.recordDecision({
      decisionId: "decision-1",
      learnerId: "learner-1",
      observation,
      analysis,
      selectedActionId: recommendedActionId,
      independent: true,
      hintLevel: "none",
      createdAt: "2026-08-02T12:00:00.000Z",
    });
    expect(updates.length).toBeGreaterThan(0);
    expect(memory.decisions[0]?.quality).toBe(1);
    const conceptId = updates[0]!.mastery.conceptId;
    const beforeHint = memory.getConceptMastery("learner-1", conceptId);
    if (beforeHint === null) {
      throw new Error("Expected saved mastery");
    }
    coach.recordHint({
      learnerId: "learner-1",
      decisionId: "decision-1",
      level: "reveal",
      conceptIds: [conceptId],
      createdAt: "2026-08-02T12:01:00.000Z",
    });
    const afterHint = memory.getConceptMastery("learner-1", conceptId);
    expect(afterHint?.mastery).toBe(beforeHint.mastery);
    expect(afterHint?.confidence).not.toBe(beforeHint.confidence);
    expect(afterHint?.successfulAttempts).toBe(beforeHint.successfulAttempts);
  });

  it("uses documented EMA and one, three, seven, fourteen, thirty-day independent spacing", () => {
    let mastery: ConceptMastery | null = null;
    const intervals: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const update = updateConceptMastery(mastery, {
        learnerId: "learner-1",
        conceptId: "tile_efficiency",
        quality: 1,
        independent: true,
        hintLevel: "none",
        occurredAt: `2026-08-${String(index + 2).padStart(2, "0")}T12:00:00.000Z`,
      });
      mastery = update.mastery;
      intervals.push(update.intervalDays);
    }
    expect(intervals).toEqual([1, 3, 7, 14, 30]);
    const weak = updateConceptMastery(mastery, {
      learnerId: "learner-1",
      conceptId: "tile_efficiency",
      quality: 0.2,
      independent: true,
      hintLevel: "none",
      occurredAt: "2026-08-12T12:00:00.000Z",
    });
    expect(weak.intervalDays).toBe(1);
  });

  it("requires four related decisions before emitting evidence-backed patterns", () => {
    const decisions = (count: number): CoachingDecisionRecord[] =>
      Array.from({ length: count }, (_, index) => ({
        decisionId: `decision-${String(index)}`,
        learnerId: "learner-1",
        conceptIds: ["call_discipline"],
        selectedActionId: "discard-x",
        recommendedActionId: "discard-y",
        quality: 0.2,
        independent: true,
        hintLevel: "none",
        createdAt: `2026-08-0${String(index + 1)}T12:00:00.000Z`,
      }));
    expect(deriveLearnerPatterns(decisions(3))).toHaveLength(0);
    expect(deriveLearnerPatterns(decisions(4))).toMatchObject([
      { conceptId: "call_discipline", sampleSize: 4 },
    ]);
  });

  it("bundles all fourteen drills and suppresses live help in competitive mode", async () => {
    expect(createBundledDrillLibrary()).toHaveLength(14);
    const observation = createdObservation();
    const analysis = coachingAnalysisFromDiscard(
      createAnalyzer(ruleset).analyzeDiscards(observation),
    );
    const feedback = await new CoachNarrationService().explain({
      observation,
      analysis,
      learner: learner("competitive"),
      hintLevel: "reveal",
    });
    expect(feedback.status).toBe("unavailable");
    expect(feedback.narration.recommendedActionId).toBeUndefined();
  });
});

describe("curriculum, drills, and analysis projections", () => {
  it("advances the curriculum and prioritizes a weak preferred concept", () => {
    expect(curriculumStageFor([]).id).toBe("tile_literacy");
    const completedTileLiteracy = [
      masteryFor("tile_recognition", 0.8),
      masteryFor("tile_categories", 0.8),
    ];
    expect(curriculumStageFor(completedTileLiteracy).id).toBe("turn_flow");
    expect(nextCurriculumConcept([], ["relative_safety"])).toBe("relative_safety");
  });

  it("creates local tile drills and maps concepts to the required exercise families", () => {
    const bundled = createBundledDrillLibrary();
    expect(bundled.every(({ answer, choices }) => choices.includes(answer))).toBe(true);
    expect(bundled.find(({ type }) => type === "complete_chow")).toMatchObject({
      prompt: "Which tile completes 1 Bamboo and 2 Bamboo as a chow?",
      answer: "3 Bamboo",
    });
    expect(createTileRecognitionDrill("wind.east")).toMatchObject({
      id: "generated:hk-drills-v1:tile:wind.east",
      source: "generated",
      type: "name_tile",
      answer: "East Wind",
      tile: "wind.east",
    });
    expect(createTileRecognitionDrill("dragon.red", "replay")).toMatchObject({
      id: "replay:hk-drills-v1:tile:dragon.red",
      source: "replay",
      answer: "Red Dragon",
    });
    expect(drillTypesForConcept("tile_recognition")).toEqual(["name_tile", "find_tile"]);
    expect(drillTypesForConcept("relative_safety")).toEqual(["compare_relative_safety"]);
  });

  it("sorts legal-action analysis and retains only supplied structured facts", () => {
    const observation = createdObservation();
    const distance = analysisFact("fact:distance");
    const risk = analysisFact("fact:risk", "relative_risk");
    const projected = coachingAnalysisFromLegalActions([
      legalActionAnalysis(observation, 1, 2, 8, [risk]),
      legalActionAnalysis(observation, 0, 1, 10, [distance]),
    ]);
    expect(projected.candidates.map(({ rank }) => rank)).toEqual([1, 2]);
    expect(projected.recommendedActionId).toBe(observation.legalActions[0]?.id);
    expect(projected.facts).toEqual([distance, risk]);
    expect(conceptsForCoachingAnalysis(projected)).toEqual(["relative_safety", "tile_efficiency"]);
    expect(
      allowedNarratorConcepts({
        observation,
        analysis: projected,
        learner: learner(),
        hintLevel: "reveal",
      }),
    ).toEqual(["relative_safety", "tile_efficiency"]);
    expect(coachingAnalysisFromLegalActions([])).toMatchObject({
      weightingVersion: "legal-action-weights-v1",
      recommendedActionId: null,
      candidates: [],
      facts: [],
    });
  });
});

describe("mastery and evidence boundaries", () => {
  it("calibrates deterministic decision quality and rejects invalid selections", () => {
    const observation = createdObservation();
    const facts = [analysisFact("fact:quality")];
    const analysis = coachingAnalysisFromLegalActions([
      legalActionAnalysis(observation, 0, 1, 100, facts),
      legalActionAnalysis(observation, 1, 2, 99, facts),
      legalActionAnalysis(observation, 2, 3, 0, facts),
    ]);
    const top = observation.legalActions[0]?.id;
    const close = observation.legalActions[1]?.id;
    const worst = observation.legalActions[2]?.id;
    if (top === undefined || close === undefined || worst === undefined) {
      throw new Error("Expected three legal discard actions");
    }
    expect(decisionQualityFromAnalysis(top, analysis)).toBe(1);
    expect(decisionQualityFromAnalysis(close, analysis)).toBe(1);
    expect(decisionQualityFromAnalysis(close, analysis, 0)).toBe(0.99);
    expect(decisionQualityFromAnalysis(worst, analysis)).toBe(0);
    expect(() => decisionQualityFromAnalysis("missing-action", analysis)).toThrow(
      "Selected action must be an emitted analyzed action",
    );
    for (const invalidFraction of [-0.01, 1.01, Number.NaN]) {
      expect(() => decisionQualityFromAnalysis(top, analysis, invalidFraction)).toThrow(
        "Near-equivalent fraction must be between 0 and 1",
      );
    }
  });

  it("weights hints transparently and validates mastery identity and time", () => {
    expect(
      (["none", "nudge", "compare", "reveal"] as const).map((level) => hintWeightFor(level)),
    ).toEqual([1, 0.75, 0.5, 0.25]);
    const hinted = updateConceptMastery(null, {
      learnerId: "learner-1",
      conceptId: "tile_efficiency",
      quality: 0.8,
      independent: false,
      hintLevel: "compare",
      occurredAt: "2026-08-02T12:00:00.000Z",
    });
    expect(hinted).toMatchObject({
      intervalDays: 1,
      quality: 0.8,
      hintWeight: 0.5,
      mastery: {
        mastery: 0.4,
        confidence: 0.4,
        attempts: 1,
        independentAttempts: 0,
        successfulAttempts: 1,
        hintWeightedScore: 0.4,
      },
    });
    expect(() =>
      updateConceptMastery(null, {
        learnerId: "learner-1",
        conceptId: "tile_efficiency",
        quality: 2,
        independent: true,
        hintLevel: "none",
        occurredAt: "2026-08-02T12:00:00.000Z",
      }),
    ).toThrow("Mastery quality must be between 0 and 1");
    expect(() =>
      updateConceptMastery(null, {
        learnerId: "learner-1",
        conceptId: "tile_efficiency",
        quality: 1,
        independent: true,
        hintLevel: "none",
        occurredAt: "not-a-timestamp",
      }),
    ).toThrow("Mastery timestamp must be an ISO timestamp");
    expect(() =>
      updateConceptMastery(hinted.mastery, {
        learnerId: "different-learner",
        conceptId: "tile_efficiency",
        quality: 1,
        independent: true,
        hintLevel: "none",
        occurredAt: "2026-08-03T12:00:00.000Z",
      }),
    ).toThrow("Mastery update must match the existing learner and concept");
  });

  it("emits only sufficiently sampled weak patterns in deterministic order", () => {
    const decision = (
      decisionId: string,
      conceptId: ConceptId,
      quality: number,
      createdAt: string,
    ): CoachingDecisionRecord => ({
      decisionId,
      learnerId: "learner-1",
      conceptIds: [conceptId],
      selectedActionId: "discard:x",
      recommendedActionId: "discard:y",
      quality,
      independent: true,
      hintLevel: "none",
      createdAt,
    });
    const weak = [
      decision("decision-4", "relative_safety", 0.4, "2026-08-04T12:00:00.000Z"),
      decision("decision-2", "relative_safety", 0.5, "2026-08-02T12:00:00.000Z"),
      decision("decision-1", "relative_safety", 0.8, "2026-08-01T12:00:00.000Z"),
      decision("decision-3", "relative_safety", 0.4, "2026-08-03T12:00:00.000Z"),
    ];
    expect(deriveLearnerPatterns(weak)).toMatchObject([
      {
        conceptId: "relative_safety",
        sampleSize: 4,
        relevantDecisionIds: ["decision-1", "decision-2", "decision-3", "decision-4"],
        metric: 0.525,
        comparisonBaseline: 0.72,
      },
    ]);
    expect(deriveLearnerPatterns(weak.map((record) => ({ ...record, quality: 0.9 })))).toEqual([]);
    expect(() => deriveLearnerPatterns(weak, 3)).toThrow(
      "Learner patterns require a minimum sample size of at least four",
    );
    expect(() =>
      deriveLearnerPatterns(
        weak.map((record, index) => ({
          ...record,
          learnerId: index % 2 === 0 ? "learner-a" : "learner-b",
        })),
      ),
    ).toThrow("Learner patterns must be derived from one learner");
  });
});

describe("coaching modes and deterministic templates", () => {
  it("routes feedback and assistance by mode and current mastery", async () => {
    const memory = new Memory();
    const coach = new DeterministicCoach(memory);
    const input = narrationInput();
    await expect(coach.feedback(input)).resolves.toMatchObject({
      status: "template",
      level: "reveal",
    });
    expect(coach.shouldOfferProactiveHelp("learn", [])).toBe(true);
    expect(coach.shouldOfferProactiveHelp("guided", [])).toBe(true);
    expect(coach.shouldOfferProactiveHelp("socratic", [])).toBe(false);
    expect(coach.shouldOfferProactiveHelp("sandbox", [])).toBe(false);
    expect(coach.shouldOfferProactiveHelp("competitive", [])).toBe(false);
    expect(coach.shouldOfferProactiveHelp("exam", [])).toBe(false);
    expect(coach.shouldOfferProactiveHelp("guided", [masteryFor("tile_efficiency", 0.4)])).toBe(
      true,
    );
    expect(coach.shouldOfferProactiveHelp("guided", [masteryFor("tile_efficiency", 0.9)])).toBe(
      false,
    );

    coach.recordHint({
      learnerId: "learner-1",
      decisionId: null,
      level: "nudge",
      conceptIds: ["relative_safety"],
      createdAt: "2026-08-02T12:01:00.000Z",
    });
    expect(memory.hints).toHaveLength(1);
    expect(memory.mastery).toHaveLength(0);
  });

  it("renders nudge, compare, Socratic, and no-ranking template states", async () => {
    const revealInput = narrationInput();
    const narrator = new TemplateCoachNarrator();
    const nudge = await narrator.explain({ ...revealInput, hintLevel: "nudge" });
    expect(nudge).toMatchObject({
      headline: "Look for the choice that preserves more useful improvements.",
      alternatives: [],
    });
    expect(nudge.recommendedActionId).toBeUndefined();

    const compare = await narrator.explain({ ...revealInput, hintLevel: "compare" });
    expect(compare.recommendedActionId).toBe(revealInput.analysis.recommendedActionId);
    expect(compare.alternatives.length).toBeGreaterThan(0);
    expect(compare.alternatives.length).toBeLessThanOrEqual(2);

    const socratic = await narrator.explain({
      ...revealInput,
      learner: learner("socratic"),
    });
    expect(socratic.question).toContain("most visible ways");

    const noRanking = await narrator.explain({
      ...revealInput,
      analysis: {
        ...revealInput.analysis,
        recommendedActionId: null,
        candidates: [],
        facts: [],
      },
    });
    expect(noRanking).toMatchObject({
      confidence: 0,
      conceptIds: [],
      factIds: [],
      alternatives: [],
    });
    expect(noRanking.recommendedActionId).toBeUndefined();
  });
});

describe("narrator validation and provider fallback", () => {
  it("accepts grounded optional fields and rejects unsupported references and scoring", () => {
    const input = narrationInput();
    const valid = validatedNarration(input);
    expect(validateCoachNarration(valid, input)).toEqual(valid);

    const otherActionId = input.observation.legalActions.find(
      ({ id }) => id !== input.analysis.recommendedActionId,
    )?.id;
    if (otherActionId === undefined) {
      throw new Error("Expected an alternate legal action");
    }
    expect(
      validateCoachNarration(
        { ...valid, recommendedActionId: otherActionId },
        { ...input, allowStylisticAlternative: true },
      ).recommendedActionId,
    ).toBe(otherActionId);
    expect(() =>
      validateCoachNarration({ ...valid, recommendedActionId: "not-legal" }, input),
    ).toThrow("Narrator referenced an action that is not legal");
    expect(() =>
      validateCoachNarration({ ...valid, recommendedActionId: otherActionId }, input),
    ).toThrow("Narrator recommendation contradicts deterministic analysis");
    expect(() =>
      validateCoachNarration({ ...valid, factIds: ["fact:not-supplied"] }, input),
    ).toThrow("Narrator referenced an unavailable analysis fact");
    expect(() => validateCoachNarration({ ...valid, headline: "" }, input)).toThrow(
      "Narrator output did not match the coaching schema",
    );

    const observation = createdObservation();
    const distanceOnly = coachingAnalysisFromLegalActions([
      legalActionAnalysis(observation, 0, 1, 1, [analysisFact("fact:distance-only")]),
    ]);
    const distanceInput: CoachNarrationInput = {
      observation,
      analysis: distanceOnly,
      learner: learner(),
      hintLevel: "reveal",
    };
    expect(() =>
      validateCoachNarration(
        {
          ...validatedNarration(distanceInput),
          explanation: "This hand has 3 faan.",
        },
        distanceInput,
      ),
    ).toThrow("Narrator made an unsupported scoring claim");

    const faanFact: AnalysisFact = {
      id: "fact:faan-three",
      kind: "faan_path",
      summary: "The secured value path is worth three faan.",
      data: { paths: [{ id: "dragon_or_wind", estimatedFaan: 3 }] },
    };
    const faanAnalysis = coachingAnalysisFromLegalActions([
      legalActionAnalysis(observation, 0, 1, 1, [faanFact]),
    ]);
    const faanInput: CoachNarrationInput = {
      observation,
      analysis: faanAnalysis,
      learner: learner(),
      hintLevel: "reveal",
    };
    const supportedFaan = {
      ...validatedNarration(faanInput),
      explanation: "The cited path is worth three faan.",
    };
    expect(validateCoachNarration(supportedFaan, faanInput)).toEqual(supportedFaan);
    expect(() =>
      validateCoachNarration(
        { ...supportedFaan, explanation: "The hand is worth 99 faan." },
        faanInput,
      ),
    ).toThrow("Narrator cited an unsupported faan value");
    expect(() =>
      validateCoachNarration(
        { ...supportedFaan, explanation: "You always make this mistake." },
        faanInput,
      ),
    ).toThrow("Narrator used an absolute learner-history claim");
  });

  it("uses the Responses schema, caches validated output, and never sends a key", async () => {
    const input = narrationInput();
    const output = validatedNarration(input);
    let calls = 0;
    let captured: Readonly<Record<string, unknown>> | null = null;
    const narrator = new OpenAICoachNarrator({
      model: "gpt-test",
      narratorVersion: "test-narrator-v1",
      client: {
        responses: {
          create: (request) => {
            calls += 1;
            captured = request;
            return Promise.resolve({ output_text: JSON.stringify(output) });
          },
        },
      },
    });
    await expect(narrator.explain(input)).resolves.toEqual(output);
    await expect(narrator.explain(input)).resolves.toEqual(output);
    expect(calls).toBe(1);
    await expect(narrator.explain({ ...input, hintLevel: "compare" })).resolves.toEqual(output);
    await expect(narrator.explain({ ...input, allowStylisticAlternative: true })).resolves.toEqual(
      output,
    );
    expect(calls).toBe(3);
    expect(captured).toMatchObject({
      model: "gpt-test",
      text: {
        format: {
          type: "json_schema",
          name: "coach_narration",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(captured)).not.toContain("apiKey");
  });

  it("classifies invalid output, provider failure, and timeout", async () => {
    const input = narrationInput();
    for (const response of [null, { output_text: "" }, { output_text: "not-json" }]) {
      const narrator = new OpenAICoachNarrator({
        model: "gpt-test",
        client: {
          responses: {
            create: () => Promise.resolve(response),
          },
        },
      });
      await expect(narrator.explain(input)).rejects.toMatchObject({
        reason: "invalid_output",
      });
    }

    const failed = new OpenAICoachNarrator({
      model: "gpt-test",
      client: {
        responses: {
          create: () => Promise.reject(new Error("provider unavailable")),
        },
      },
    });
    await expect(failed.explain(input)).rejects.toMatchObject({ reason: "provider_error" });

    const timedOut = new OpenAICoachNarrator({
      model: "gpt-test",
      timeoutMs: 1,
      client: {
        responses: {
          create: (_request, options) =>
            new Promise((_resolve, reject) => {
              const signal = options?.signal;
              if (signal === undefined) {
                reject(new Error("missing abort signal"));
                return;
              }
              signal.addEventListener("abort", () => reject(new Error("request aborted")), {
                once: true,
              });
            }),
        },
      },
    });
    await expect(timedOut.explain(input)).rejects.toMatchObject({ reason: "timeout" });
    expect(
      () =>
        new OpenAICoachNarrator({
          model: "",
          client: { responses: { create: () => Promise.resolve({}) } },
        }),
    ).toThrow("Narrator model must be non-empty");
    expect(
      () =>
        new OpenAICoachNarrator({
          model: "gpt-test",
          timeoutMs: 0,
          client: { responses: { create: () => Promise.resolve({}) } },
        }),
    ).toThrow("Narrator timeout must be a positive safe integer");
  });

  it("reports provider status and preserves typed fallback reasons", async () => {
    const input = narrationInput();
    const templates = new CoachNarrationService();
    expect(templates.providerStatus()).toBe("unavailable");
    await expect(templates.explain(input)).resolves.toMatchObject({ status: "template" });

    const provider = new CoachNarrationService({
      provider: {
        explain: () => Promise.resolve(validatedNarration(input)),
      },
    });
    expect(provider.providerStatus()).toBe("provider");
    await expect(provider.explain(input)).resolves.toMatchObject({
      status: "provider",
      fallbackReason: null,
    });

    const cancelled = new CoachNarrationService({
      provider: {
        explain: () =>
          Promise.reject(new CoachNarratorFailure("cancelled", "caller cancelled request")),
      },
    });
    await expect(cancelled.explain(input)).resolves.toMatchObject({
      status: "fallback",
      fallbackReason: "cancelled",
    });

    const failed = new CoachNarrationService({
      provider: {
        explain: () => Promise.reject(new Error("provider failure")),
      },
    });
    await expect(failed.explain(input)).resolves.toMatchObject({
      status: "fallback",
      fallbackReason: "provider_error",
    });
  });
});

describe("post-hand review", () => {
  const reviewDecision = (
    decisionId: string,
    quality: number,
    createdAt: string,
    conceptId: ConceptId,
    recommendedActionId: string | null,
  ): CoachingDecisionRecord => ({
    decisionId,
    learnerId: "learner-1",
    conceptIds: [conceptId],
    selectedActionId: `selected:${decisionId}`,
    recommendedActionId,
    quality,
    independent: true,
    hintLevel: "none",
    createdAt,
  });

  it("orders the timeline, selects impact and praise, and schedules a weak-concept drill", () => {
    const review = createPostHandReview({
      handId: "hand-1",
      result: {
        kind: "win",
        winners: [{ playerId: "south", scoring: { cappedFaan: 3 } }],
      },
      decisions: [
        reviewDecision("decision-3", 0.9, "2026-08-03T12:00:00.000Z", "tile_efficiency", null),
        reviewDecision(
          "decision-1",
          0.2,
          "2026-08-01T12:00:00.000Z",
          "relative_safety",
          "discard:safer",
        ),
        reviewDecision("decision-4", 0.7, "2026-08-04T12:00:00.000Z", "call_discipline", "pass"),
        reviewDecision(
          "decision-2",
          0.4,
          "2026-08-02T12:00:00.000Z",
          "minimum_faan_planning",
          "discard:value",
        ),
      ],
      mastery: [],
      omniscientAvailable: true,
    });
    expect(review).toMatchObject({
      handId: "hand-1",
      timelineDecisionIds: ["decision-1", "decision-2", "decision-3", "decision-4"],
      highImpactDecisionIds: ["decision-1", "decision-2", "decision-4"],
      positiveDecisionId: "decision-3",
      counterfactualActionIds: ["discard:safer", "discard:value", "pass"],
      nextDrillConceptId: "relative_safety",
      omniscientAvailable: true,
    });
    expect(review.finalScoreSummary).toContain("south won with 3 faan");
  });

  it("summarizes non-winning hand endings without fabricating decisions", () => {
    const common = {
      handId: "hand-empty",
      decisions: [],
      mastery: [],
      omniscientAvailable: false,
    } as const;
    expect(
      createPostHandReview({
        ...common,
        result: { kind: "exhaustive_draw", winners: [] },
      }),
    ).toMatchObject({
      finalScoreSummary: "The hand ended in an exhaustive draw.",
      timelineDecisionIds: [],
      highImpactDecisionIds: [],
      positiveDecisionId: null,
      counterfactualActionIds: [],
    });
    expect(
      createPostHandReview({
        ...common,
        result: { kind: "sandbox_end", winners: [] },
      }).finalScoreSummary,
    ).toBe("The sandbox hand ended without a scored win.");
  });
});
