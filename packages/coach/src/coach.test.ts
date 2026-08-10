import { describe, expect, it } from "vitest";
import { createAnalyzer } from "@hk-mahjong/analysis";
import { createGameEngine, type GameEngine, type PlayerObservation } from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";

import {
  CoachNarrationService,
  DeterministicCoach,
  TemplateCoachNarrator,
  coachingAnalysisFromDiscard,
  createBundledDrillLibrary,
  deriveLearnerPatterns,
  updateConceptMastery,
  type CoachMemoryPort,
  type ConceptId,
  type ConceptMastery,
  type CoachingDecisionRecord,
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

const learner = (mode: "guided" | "competitive" = "guided") => ({
  learnerId: "learner-1",
  mode,
  currentObjective: "Keep the hand flexible.",
  mastery: [],
  patterns: [],
  verbosity: "brief" as const,
});

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
