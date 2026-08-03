import { describe, expect, it } from "vitest";
import {
  createGameEngine,
  type GameEngine,
  type GameState,
  type PlayerObservation,
  type ScoringPreview,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";
import {
  createAdaptiveDifficultySelector,
  createBotPolicy,
  createScriptedTeachingBotPolicy,
  selectAdaptiveDifficulty,
  type AdaptiveDecisionEvidence,
  type BotDifficulty,
  type BotPersonality,
  type BotPolicyConfig,
} from "./index.js";

const RULESET = getBundledRuleset("hk_nyc_social_v1");
const DIFFICULTIES: readonly BotDifficulty[] = ["novice", "basic", "intermediate", "advanced"];
const PERSONALITIES: readonly BotPersonality[] = ["fast", "value", "balanced"];
const LEGAL_PREVIEW: ScoringPreview = {
  shapeComplete: true,
  legalWin: true,
  rawFaan: 3,
  cappedFaan: 3,
  minimumRequired: 3,
  missingFaan: 0,
  appliedRuleIds: ["all_pungs"],
  winningForm: "standard",
  reason: "legal",
};

const engineObservation = (
  seed = "bots-test",
): { engine: GameEngine; state: GameState; observation: PlayerObservation } => {
  const engine = createGameEngine({
    scoringSystem: createHongKongScoringSystem(RULESET),
  });
  const created = engine.create({
    type: "create_game",
    requestId: `create:${seed}`,
    branchId: "main",
    seed,
    mode: "competitive",
    matchLength: "one_wind",
    rules: toCoreGameRules(RULESET),
    players: [
      { id: "east", displayName: "East", controller: "bot", seat: "east" },
      { id: "south", displayName: "South", controller: "bot", seat: "south" },
      { id: "west", displayName: "West", controller: "bot", seat: "west" },
      { id: "north", displayName: "North", controller: "bot", seat: "north" },
    ],
  });
  if (!created.accepted) {
    throw new Error(created.error.message);
  }
  return {
    engine,
    state: created.state,
    observation: engine.observation(created.state, "east"),
  };
};

const config = (
  difficulty: BotDifficulty = "intermediate",
  personality: BotPersonality = "balanced",
): BotPolicyConfig => ({
  botId: "east",
  difficulty,
  personality,
  ruleset: RULESET,
});

const withLegalActions = (
  observation: PlayerObservation,
  legalActions: PlayerObservation["legalActions"],
): PlayerObservation => ({ ...observation, legalActions });

describe("observation-only bot policy", () => {
  it("always accepts ordinary legal wins at every strength and personality", () => {
    const { observation } = engineObservation("ordinary-win");
    const winning = withLegalActions(observation, [
      {
        id: "claim-win",
        type: "claim_win",
        windowId: "window",
        source: "discard",
        discardId: "discard",
        tileTypeId: "dragon.red",
        meldId: null,
        preview: LEGAL_PREVIEW,
      },
      { id: "pass", type: "pass", windowId: "window" },
    ]);
    for (const difficulty of DIFFICULTIES) {
      for (const personality of PERSONALITIES) {
        expect(createBotPolicy(config(difficulty, personality)).decide(winning)).toMatchObject({
          actionId: "claim-win",
          actionType: "claim_win",
          reason: "ordinary_win",
        });
      }
    }
  });

  it("isolates explicit teaching win passes from ordinary policies", () => {
    const { observation } = engineObservation("scripted-pass");
    const winning = withLegalActions(observation, [
      {
        id: "claim-win",
        type: "claim_win",
        windowId: "window",
        source: "discard",
        discardId: "discard",
        tileTypeId: "dragon.red",
        meldId: null,
        preview: LEGAL_PREVIEW,
      },
      { id: "pass", type: "pass", windowId: "window" },
    ]);
    expect(createBotPolicy(config()).decide(winning)?.actionId).toBe("claim-win");
    expect(
      createScriptedTeachingBotPolicy({
        ...config(),
        passLegalWinsAtRevisions: [winning.revision],
      }).decide(winning),
    ).toMatchObject({
      actionId: "pass",
      reason: "scripted_win_pass",
    });
  });

  it("advances completed hands and returns null only when no action exists", () => {
    const { observation } = engineObservation("progression");
    const policy = createBotPolicy(config());
    expect(
      policy.decide(
        withLegalActions(observation, [
          { id: "next", type: "start_next_hand", completedHandId: "hand:0" },
        ]),
      ),
    ).toMatchObject({
      actionId: "next",
      reason: "match_progression",
    });
    expect(policy.decide(withLegalActions(observation, []))).toBeNull();
  });

  it(
    "selects only emitted actions deterministically at all four strengths",
    { timeout: 20_000 },
    () => {
      const { observation } = engineObservation("strengths");
      for (const difficulty of DIFFICULTIES) {
        const policy = createBotPolicy(config(difficulty));
        const first = policy.decide(observation);
        expect(policy.decide(observation)).toEqual(first);
        expect(observation.legalActions.some(({ id }) => id === first?.actionId)).toBe(true);
        expect(first?.difficulty).toBe(difficulty);
      }
    },
  );

  it("uses personality weighting to break basic discard choices at equal distance", () => {
    const { observation } = engineObservation("basic-personality-5");
    const actionIds = PERSONALITIES.map(
      (personality) => createBotPolicy(config("basic", personality)).decide(observation)?.actionId,
    );
    expect(actionIds.every((actionId) => actionId !== undefined)).toBe(true);
    expect(new Set(actionIds).size).toBeGreaterThan(1);
  });

  it("makes deterministic, configurable novice mistakes without unseeded randomness", () => {
    const { observation } = engineObservation("novice-mistakes");
    const policy = createBotPolicy({ ...config("novice"), noviceMistakeFrequency: 2 });
    const decisions = Array.from({ length: 20 }, (_, revision) =>
      policy.decide({ ...observation, revision }),
    );
    expect(decisions.some((candidate) => candidate?.reason === "novice_mistake")).toBe(true);
    expect(
      Array.from({ length: 20 }, (_, revision) => policy.decide({ ...observation, revision })),
    ).toEqual(decisions);
  });

  it("rejects a wrong viewer identity", () => {
    const { observation } = engineObservation("wrong-viewer");
    const southPolicy = createBotPolicy({ ...config(), botId: "south" });
    expect(() => southPolicy.decide(observation)).toThrow(/cannot decide observation/u);
  });

  it(
    "cannot change its decision when only opponents' tiles and wall order change",
    { timeout: 30_000 },
    () => {
      const { engine, state, observation } = engineObservation("bot-hidden-invariance");
      const changed = structuredClone(state);
      [changed.players.south!.concealed, changed.players.west!.concealed] = [
        changed.players.west!.concealed,
        changed.players.south!.concealed,
      ];
      changed.wall.tiles = [...changed.wall.tiles].reverse();
      const changedObservation = engine.observation(changed, "east");
      expect(changedObservation).toEqual(observation);

      for (const difficulty of DIFFICULTIES) {
        for (const personality of PERSONALITIES) {
          const policy = createBotPolicy(config(difficulty, personality));
          expect(policy.decide(changedObservation)).toEqual(policy.decide(observation));
        }
      }
    },
  );
});

describe("adaptive difficulty", () => {
  const evidence = (
    count: number,
    quality: number,
    independent = true,
  ): readonly AdaptiveDecisionEvidence[] =>
    Array.from({ length: count }, (_, index) => ({
      decisionId: `decision:${String(index)}`,
      quality,
      independent,
    }));

  it("uses sustained independent evidence and moves at most one level", () => {
    expect(
      selectAdaptiveDifficulty({
        previousDifficulty: "basic",
        branchId: "main",
        practiceBranch: false,
        nextHandIndex: 3,
        recentDecisions: evidence(7, 1),
      }).difficulty,
    ).toBe("basic");
    expect(
      selectAdaptiveDifficulty({
        previousDifficulty: "basic",
        branchId: "main",
        practiceBranch: false,
        nextHandIndex: 3,
        recentDecisions: evidence(8, 0.9),
      }),
    ).toMatchObject({
      difficulty: "intermediate",
      branchId: "main",
      practiceBranch: false,
      handIndex: 3,
      version: "adaptive-difficulty-v1",
    });
    expect(
      selectAdaptiveDifficulty({
        previousDifficulty: "intermediate",
        branchId: "main",
        practiceBranch: false,
        nextHandIndex: 4,
        recentDecisions: evidence(8, 0.2),
      }).difficulty,
    ).toBe("basic");
    expect(
      selectAdaptiveDifficulty({
        previousDifficulty: "basic",
        branchId: "main",
        practiceBranch: false,
        nextHandIndex: 5,
        recentDecisions: evidence(12, 1, false),
      }).difficulty,
    ).toBe("basic");
  });

  it("locks a selection for the complete hand", () => {
    const { observation } = engineObservation("adaptive-lock");
    const selector = createAdaptiveDifficultySelector("basic");
    const selected = selector.selectionForHand(observation, evidence(8, 0.9));
    expect(selector.selectionForHand(observation, evidence(8, 0.1))).toEqual(selected);

    const nextHand: PlayerObservation = {
      ...observation,
      round: { ...observation.round, handIndex: observation.round.handIndex + 1 },
    };
    expect(() => selector.selectionForHand(nextHand, evidence(8, 0.1))).toThrow(
      /Complete the locked/u,
    );
    expect(() => selector.completeHand(observation)).toThrow(/terminal phase/u);
    selector.completeHand({ ...observation, phase: "hand_ended" });
    expect(selector.selectionForHand(nextHand, evidence(8, 0.1)).difficulty).toBe("basic");
  });
});
