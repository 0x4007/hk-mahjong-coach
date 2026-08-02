import { describe, expect, it } from "vitest";
import generatedJsonSchema from "../../../rulesets/ruleset.schema.json" with { type: "json" };
import {
  BUNDLED_RULESETS,
  bonusTilesForSeat,
  createRulesetRegistry,
  getBundledRuleset,
  listBundledRulesets,
  resolveRuleset,
  SCORING_RULE_IDS,
  type RulesetDefinition,
  type ResolvedRuleset,
  validateRuleset,
} from "./index.js";
import { rulesetDefinitionSchema } from "./ruleset.js";

const ruleValue = (rulesetId: string, ruleId: string): unknown =>
  getBundledRuleset(rulesetId).definition.scoringRules.find(({ id }) => id === ruleId)?.value;

const mutableDefaultDefinition = (): RulesetDefinition =>
  structuredClone(getBundledRuleset("hk_nyc_social_v1").definition) as unknown as RulesetDefinition;

const expectInvalid = (mutate: (definition: RulesetDefinition) => void, message: RegExp): void => {
  const definition = mutableDefaultDefinition();
  mutate(definition);
  const result = validateRuleset(definition);
  expect(result.valid).toBe(false);
  if (result.valid) {
    throw new Error("Expected the ruleset to be invalid");
  }
  expect(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" ")).toMatch(
    message,
  );
};

describe("bundled rulesets", () => {
  it("loads three fully materialized, immutable, uniquely hashed profiles", () => {
    expect(BUNDLED_RULESETS).toHaveLength(3);
    expect(new Set(BUNDLED_RULESETS.map(({ hash }) => hash)).size).toBe(3);
    expect(
      Object.fromEntries(
        BUNDLED_RULESETS.map(({ definition, hash }) => [definition.id, hash] as const),
      ),
    ).toEqual({
      hk_nyc_social_v1: "sha256:0a78ff57e003b9e6e9216e9362c5dcb4b5b0db5f49b5006eb5acbd21d805b783",
      hk_modern_13f_v1: "sha256:847b9ecb60441e4df744aab625e3705d3071fa0349ec63d3f64b9aab8481aaa9",
      training_relaxed_v1:
        "sha256:3dc704a56379602ee450d8330dce03cce659b8b74073f1e46687b7c6df630ffe",
    });

    for (const ruleset of BUNDLED_RULESETS) {
      expect(ruleset.hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(ruleset.definition.scoringRules).toHaveLength(SCORING_RULE_IDS.length);
      expect(Object.isFrozen(ruleset)).toBe(true);
      expect(Object.isFrozen(ruleset.definition)).toBe(true);
      expect(Object.isFrozen(ruleset.definition.scoringRules)).toBe(true);
    }
  });

  it("exposes the exact default teaching identity and assumptions", () => {
    const ruleset = getBundledRuleset("hk_nyc_social_v1");

    expect(ruleset.definition.displayName).toBe(
      "Hong Kong Old Style — NYC Social Teaching Profile v1",
    );
    expect(ruleset.definition.disclaimer).toMatch(/not an official or universal/u);
    expect(ruleset.definition.winRules.minimumFaan).toBe(3);
    expect(ruleset.definition.winRules.capFaan).toBe(10);
    expect(ruleset.definition.scoringEvaluatorVersion).toBe("hk-scoring-v1");
    expect(ruleset.definition.tileSet.bonusTilesEnabled).toBe(true);
    expect(ruleset.definition.patternSemantics.earthlyHand.trigger).toBe("dealer_first_discard");
    expect(bonusTilesForSeat(ruleset, "west")).toEqual({
      flower: "flower.chrysanthemum",
      season: "season.autumn",
    });
  });

  it("materializes every alternate value instead of inheriting at runtime", () => {
    const modern = getBundledRuleset("hk_modern_13f_v1");

    expect(modern.definition.winRules.capFaan).toBe(13);
    expect(ruleValue(modern.definition.id, "full_flush")).toEqual({
      type: "faan",
      amount: 7,
    });
    expect(ruleValue(modern.definition.id, "big_three_dragons")).toEqual({
      type: "faan",
      amount: 8,
    });
    expect(ruleValue(modern.definition.id, "big_four_winds")).toEqual({
      type: "faan",
      amount: 10,
    });
    expect(ruleValue(modern.definition.id, "four_concealed_pungs")).toEqual({
      type: "faan",
      amount: 10,
    });
    expect(ruleValue(modern.definition.id, "thirteen_orphans")).toEqual({
      type: "limit",
    });
  });

  it("keeps training evaluators but removes the minimum and names the standard comparison", () => {
    const standard = getBundledRuleset("hk_nyc_social_v1");
    const training = getBundledRuleset("training_relaxed_v1");

    expect(training.definition.winRules.minimumFaan).toBe(0);
    expect(training.definition.standardComparisonRulesetId).toBe("hk_nyc_social_v1");
    expect(training.definition.scoringRules).toEqual(standard.definition.scoringRules);
  });

  it("returns stable readable summaries", () => {
    const summaries = listBundledRulesets();
    expect(summaries.map(({ id }) => id)).toEqual([
      "hk_nyc_social_v1",
      "hk_modern_13f_v1",
      "training_relaxed_v1",
    ]);
    expect(summaries.every(({ disclaimer }) => disclaimer.length > 20)).toBe(true);
    expect(() => getBundledRuleset("not_bundled")).toThrow(/Unknown bundled ruleset/u);
  });

  it("rejects malformed bundled registries and comparison targets", () => {
    const standard = getBundledRuleset("hk_nyc_social_v1");
    const modern = getBundledRuleset("hk_modern_13f_v1");
    const training = getBundledRuleset("training_relaxed_v1");

    expect(() =>
      createRulesetRegistry(
        [standard, standard, training],
        ["hk_nyc_social_v1", "hk_modern_13f_v1", "training_relaxed_v1"],
      ),
    ).toThrow(/registry does not match/u);
    expect(() =>
      createRulesetRegistry(
        [standard, modern],
        ["hk_nyc_social_v1", "hk_modern_13f_v1", "training_relaxed_v1"],
      ),
    ).toThrow(/registry does not match/u);

    const invalidComparison = mutableDefaultDefinition();
    invalidComparison.id = "comparison_child";
    invalidComparison.standardComparisonRulesetId = "missing_parent";
    const resolvedInvalidComparison = resolveRuleset(invalidComparison);
    expect(() =>
      createRulesetRegistry(
        [standard, resolvedInvalidComparison],
        ["hk_nyc_social_v1", "comparison_child"],
      ),
    ).toThrow(/invalid standard comparison/u);

    const selfComparison = mutableDefaultDefinition();
    selfComparison.standardComparisonRulesetId = selfComparison.id;
    expect(() =>
      createRulesetRegistry([resolveRuleset(selfComparison)], ["hk_nyc_social_v1"]),
    ).toThrow(/invalid standard comparison/u);
  });
});

describe("ruleset validation and resolution", () => {
  it("keeps the documented JSON Schema synchronized with the runtime schema", () => {
    expect(generatedJsonSchema).toEqual({
      $id: "https://local.hk-mahjong-coach.invalid/ruleset.schema.json",
      title: "Hong Kong Mahjong Coach Ruleset",
      ...rulesetDefinitionSchema.toJSONSchema({ target: "draft-2020-12" }),
    });
  });

  it("hashes equivalent key order identically", () => {
    const definition = mutableDefaultDefinition();
    const { payment, ...withoutPayment } = definition;
    const reordered = {
      payment,
      ...withoutPayment,
    };
    expect(resolveRuleset(reordered).hash).toBe(resolveRuleset(definition).hash);
  });

  it("automatically disables bonus scoring in a 136-tile profile before hashing", () => {
    const definition = mutableDefaultDefinition();
    definition.id = "custom_no_bonus";
    definition.tileSet.bonusTilesEnabled = false;

    const resolved = resolveRuleset(definition);
    const bonusRules = resolved.definition.scoringRules.filter(
      ({ category }) => category === "bonus",
    );
    expect(bonusRules.every(({ enabled }) => !enabled)).toBe(true);
    expect(resolved.definition.scoringRules.find(({ id }) => id === "all_chows")?.enabled).toBe(
      true,
    );
  });

  it("rejects unknown keys, missing rules, invalid mappings, and inconsistent cross-fields", () => {
    const definition = mutableDefaultDefinition();
    const malformed: Record<string, unknown> = { ...definition, secretFallback: true };
    expect(validateRuleset(malformed)).toMatchObject({
      valid: false,
    });

    definition.scoringRules.pop();
    const result = validateRuleset(definition);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ message }) => message).join(" ")).toMatch(
        /33|missing scoring rules/u,
      );
    }
  });

  it("rejects a scoring relation that names an unknown stacking group", () => {
    const definition = mutableDefaultDefinition();
    const firstRule = definition.scoringRules[0];
    if (firstRule === undefined) {
      throw new Error("Default ruleset unexpectedly has no scoring rules");
    }
    firstRule.excludes = [{ target: "stacking_group", id: "not_real" }];

    const result = validateRuleset(definition);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.some(({ message }) => message.includes("unknown stacking group"))).toBe(
        true,
      );
    }
  });

  it("reports every ruleset cross-field invariant with a readable path", () => {
    expectInvalid((definition) => {
      definition.winRules.minimumFaan = definition.winRules.capFaan + 1;
    }, /minimumFaan must not exceed capFaan/u);
    expectInvalid((definition) => {
      definition.scoringRules[1]!.id = definition.scoringRules[0]!.id;
    }, /unique|missing scoring rules/u);
    expectInvalid((definition) => {
      const rule = definition.scoringRules[0]!;
      rule.implies = [
        { target: "rule", id: "not_a_rule" },
        { target: "rule", id: "not_a_rule" },
      ];
    }, /duplicate rule relation.*unknown scoring rule/u);
    expectInvalid((definition) => {
      const rule = definition.scoringRules[0]!;
      rule.implies = [{ target: "rule", id: rule.id }];
    }, /cannot reference itself/u);
    expectInvalid((definition) => {
      definition.winRules.allowSevenPairs = false;
    }, /seven_pairs enabled state/u);
    expectInvalid((definition) => {
      definition.kongRules.concealedKongRobberyForms = ["thirteen_orphans"];
    }, /must be empty/u);
    expectInvalid((definition) => {
      definition.bonusRules.seatMapping[1]!.seat = "east";
    }, /four distinct seats/u);
    expectInvalid((definition) => {
      definition.bonusRules.seatMapping[1]!.flower = "flower.plum";
    }, /four distinct seats/u);
    expectInvalid((definition) => {
      definition.bonusRules.seatMapping[1]!.season = "season.spring";
    }, /four distinct seats/u);
    expectInvalid((definition) => {
      definition.roundRules.prevailingWinds = ["east", "east"];
    }, /prevailing winds must be unique/u);
    expectInvalid((definition) => {
      definition.payment.basePointBuckets[1]!.minimumFaan = 2;
    }, /expected contiguous bucket/u);
    expectInvalid((definition) => {
      definition.payment.basePointBuckets[0]!.maximumFaan = null;
    }, /only the final payment bucket/u);
    expectInvalid((definition) => {
      definition.payment.basePointBuckets[1]!.maximumFaan = 0;
    }, /maximumFaan must be at least/u);
    expectInvalid((definition) => {
      definition.payment.basePointBuckets.at(-1)!.maximumFaan = 20;
    }, /final payment bucket must use null/u);
    expectInvalid((definition) => {
      definition.payment.strategy = "discarder_pays_all";
    }, /requires otherLoserMultiplier to be zero/u);
  });

  it("accepts a coherent discarder-pays-all custom policy", () => {
    const definition = mutableDefaultDefinition();
    definition.id = "discarder_all_custom";
    definition.payment.strategy = "discarder_pays_all";
    definition.payment.discard.otherLoserMultiplier = 0;
    const result = validateRuleset(definition);
    expect(result.valid).toBe(true);
  });

  it("protects the impossible missing-seat lookup with a clear failure", () => {
    const standard = getBundledRuleset("hk_nyc_social_v1");
    const malformed = {
      ...standard,
      definition: {
        ...standard.definition,
        bonusRules: {
          seatMapping: standard.definition.bonusRules.seatMapping.filter(
            ({ seat }) => seat !== "north",
          ),
        },
      },
    } as unknown as ResolvedRuleset;
    expect(() => bonusTilesForSeat(malformed, "north")).toThrow(/no bonus mapping/u);
  });
});
