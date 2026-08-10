import { canonicalJsonHash, type BonusTileTypeId, type Wind } from "@hk-mahjong/core";
import { z } from "zod";

export const SCORING_RULE_IDS = [
  "no_bonus_tiles",
  "seat_flower",
  "seat_season",
  "all_chows",
  "concealed_hand",
  "dragon_pung",
  "seat_wind",
  "prevailing_wind",
  "self_draw",
  "last_tile_draw",
  "last_tile_discard",
  "robbing_kong",
  "replacement_win",
  "all_flowers",
  "all_seasons",
  "all_pungs",
  "half_flush",
  "little_three_dragons",
  "seven_pairs",
  "full_flush",
  "four_concealed_pungs",
  "big_three_dragons",
  "little_four_winds",
  "big_four_winds",
  "all_honors",
  "all_terminals",
  "nine_gates",
  "thirteen_orphans",
  "all_kongs",
  "jade_dragon",
  "ruby_dragon",
  "pearl_dragon",
  "heavenly_hand",
  "earthly_hand",
] as const;

export type ScoringRuleId = (typeof SCORING_RULE_IDS)[number];

const localizedNameSchema = z
  .object({
    en: z.string().trim().min(1),
    zhHant: z.string().trim().min(1),
    zhHans: z.string().trim().min(1),
  })
  .strict();

const scoringValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("faan"), amount: z.number().int().min(1).max(99) }).strict(),
  z.object({ type: z.literal("limit") }).strict(),
]);

const ruleReferenceSchema = z
  .object({
    target: z.enum(["rule", "stacking_group"]),
    id: z.string().trim().min(1),
  })
  .strict();

export const scoringRuleDefinitionSchema = z
  .object({
    id: z.enum(SCORING_RULE_IDS),
    names: localizedNameSchema,
    evaluator: z.enum(SCORING_RULE_IDS),
    value: scoringValueSchema,
    enabled: z.boolean(),
    category: z.enum(["hand_composition", "bonus", "wind_dragon", "winning_condition"]),
    stackingGroup: z.string().trim().min(1).nullable(),
    implies: z.array(ruleReferenceSchema),
    suppresses: z.array(ruleReferenceSchema),
    excludes: z.array(ruleReferenceSchema),
    explanation: z.string().trim().min(1),
    examples: z.array(z.string().trim().min(1)).min(1),
    houseRuleSensitive: z.boolean(),
  })
  .strict();

const paymentBucketSchema = z
  .object({
    minimumFaan: z.number().int().min(0),
    maximumFaan: z.number().int().min(0).nullable(),
    basePoints: z.number().int().positive(),
  })
  .strict();

const windSchema = z.enum(["east", "south", "west", "north"]);
const flowerTileTypeSchema = z.enum([
  "flower.plum",
  "flower.orchid",
  "flower.chrysanthemum",
  "flower.bamboo",
]);
const seasonTileTypeSchema = z.enum([
  "season.spring",
  "season.summer",
  "season.autumn",
  "season.winter",
]);

const seatBonusMappingSchema = z
  .object({
    seat: windSchema,
    flower: flowerTileTypeSchema,
    season: seasonTileTypeSchema,
  })
  .strict();

const rulesetShape = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9_]*$/u),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    displayName: z.string().trim().min(1),
    description: z.string().trim().min(1),
    disclaimer: z.string().trim().min(1),
    standardComparisonRulesetId: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/u)
      .nullable(),
    scoringEvaluatorVersion: z.literal("hk-scoring-v1"),
    patternSemantics: z
      .object({
        version: z.literal("hk_nyc_limits_v1"),
        fourConcealedPungs: z
          .object({
            winMode: z.literal("self_draw_only"),
            concealedKongsCount: z.boolean(),
          })
          .strict(),
        nineGates: z
          .object({
            waitMode: z.literal("pure_nine_sided"),
            declaredKongsAllowed: z.boolean(),
          })
          .strict(),
        thirteenOrphans: z
          .object({
            requireThirteenSidedWait: z.boolean(),
          })
          .strict(),
        coloredDragons: z
          .object({
            requireAllPungsOrKongs: z.boolean(),
            requireMatchingSuitPair: z.boolean(),
          })
          .strict(),
        heavenlyHand: z
          .object({
            initialBonusReplacementsAllowed: z.boolean(),
            kongBeforeWinAllowed: z.boolean(),
          })
          .strict(),
        earthlyHand: z
          .object({
            trigger: z.literal("dealer_first_discard"),
            initialBonusReplacementsAllowed: z.boolean(),
            kongBeforeWinAllowed: z.boolean(),
          })
          .strict(),
        limitAggregation: z.literal("cap_once_list_all_matches"),
        suppressNonLimitRulesWhenLimitMatches: z.boolean(),
      })
      .strict(),
    tileSet: z
      .object({
        bonusTilesEnabled: z.boolean(),
        replacementDrawDirection: z.literal("back"),
        ordinaryDrawDirection: z.literal("front"),
        exhaustionBoundary: z.literal("draw_ends_meet"),
      })
      .strict(),
    bonusRules: z
      .object({
        seatMapping: z.array(seatBonusMappingSchema).length(4),
      })
      .strict(),
    winRules: z
      .object({
        minimumFaan: z.number().int().min(0),
        capFaan: z.number().int().positive(),
        multipleWinners: z.boolean(),
        sameTileWinLockUntilNextDraw: z.boolean(),
        passedWinLockTriggers: z.enum(["explicit_pass", "any_unclaimed_legal_win"]),
        passedWinLockIncludesKongRobbery: z.boolean(),
        allowSevenPairs: z.boolean(),
        sevenPairsAllowsQuadAsTwoPairs: z.boolean(),
        specialHandsStackWithSuitPatterns: z.boolean(),
        allowThirteenOrphans: z.boolean(),
        allowNineGates: z.boolean(),
        initialDealWinsEnabled: z.boolean(),
      })
      .strict(),
    claimRules: z
      .object({
        equalPriorityResolution: z.literal("nearest_after_discarder"),
        multipleWinnerPayment: z.literal("settle_each_winner"),
      })
      .strict(),
    kongRules: z
      .object({
        robAddedKong: z.boolean(),
        robConcealedKong: z.boolean(),
        concealedKongRobberyForms: z.array(z.enum(["standard", "thirteen_orphans"])),
        allowKongImmediatelyAfterChowOrPung: z.boolean(),
      })
      .strict(),
    roundRules: z
      .object({
        prevailingWinds: z.array(windSchema).min(1).max(4),
        dealerRepeatsOnWin: z.boolean(),
        dealerRepeatsOnDraw: z.boolean(),
        dealerRepeatsWhenAmongMultipleWinners: z.boolean(),
      })
      .strict(),
    scoringRules: z.array(scoringRuleDefinitionSchema).length(SCORING_RULE_IDS.length),
    payment: z
      .object({
        strategy: z.enum(["each_loser_pays", "discarder_pays_all"]),
        basePointBuckets: z.array(paymentBucketSchema).min(1),
        discard: z
          .object({
            discarderMultiplier: z.number().int().min(0),
            otherLoserMultiplier: z.number().int().min(0),
          })
          .strict(),
        selfDraw: z
          .object({
            loserMultiplier: z.number().int().min(0),
          })
          .strict(),
        dealerMultiplier: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const rulesetDefinitionSchema = rulesetShape.superRefine((ruleset, context) => {
  if (ruleset.winRules.minimumFaan > ruleset.winRules.capFaan) {
    context.addIssue({
      code: "custom",
      path: ["winRules", "minimumFaan"],
      message: "minimumFaan must not exceed capFaan",
    });
  }

  const scoringIds = ruleset.scoringRules.map(({ id }) => id);
  if (new Set(scoringIds).size !== SCORING_RULE_IDS.length) {
    context.addIssue({
      code: "custom",
      path: ["scoringRules"],
      message: "scoring rule IDs must be unique",
    });
  }
  const missingRules = SCORING_RULE_IDS.filter((id) => !scoringIds.includes(id));
  if (missingRules.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["scoringRules"],
      message: `missing scoring rules: ${missingRules.join(", ")}`,
    });
  }

  const scoringIdSet = new Set<string>(scoringIds);
  const stackingGroupSet = new Set(
    ruleset.scoringRules
      .map(({ stackingGroup }) => stackingGroup)
      .filter((group): group is string => group !== null),
  );
  for (const [ruleIndex, rule] of ruleset.scoringRules.entries()) {
    for (const relationName of ["implies", "suppresses", "excludes"] as const) {
      const relations = rule[relationName];
      const seen = new Set<string>();
      for (const [relationIndex, relation] of relations.entries()) {
        const key = `${relation.target}:${relation.id}`;
        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            path: ["scoringRules", ruleIndex, relationName, relationIndex],
            message: "duplicate rule relation",
          });
        }
        seen.add(key);
        if (relation.target === "rule") {
          if (!scoringIdSet.has(relation.id)) {
            context.addIssue({
              code: "custom",
              path: ["scoringRules", ruleIndex, relationName, relationIndex, "id"],
              message: `unknown scoring rule ${relation.id}`,
            });
          }
          if (relation.id === rule.id) {
            context.addIssue({
              code: "custom",
              path: ["scoringRules", ruleIndex, relationName, relationIndex, "id"],
              message: "a scoring rule cannot reference itself",
            });
          }
        } else if (!stackingGroupSet.has(relation.id)) {
          context.addIssue({
            code: "custom",
            path: ["scoringRules", ruleIndex, relationName, relationIndex, "id"],
            message: `unknown stacking group ${relation.id}`,
          });
        }
      }
    }
  }

  const enabledById = new Map(ruleset.scoringRules.map(({ id, enabled }) => [id, enabled]));
  const specialHandSettings: readonly [boolean, ScoringRuleId][] = [
    [ruleset.winRules.allowSevenPairs, "seven_pairs"],
    [ruleset.winRules.allowThirteenOrphans, "thirteen_orphans"],
    [ruleset.winRules.allowNineGates, "nine_gates"],
  ];
  for (const [allowed, ruleId] of specialHandSettings) {
    if (enabledById.get(ruleId) !== allowed) {
      context.addIssue({
        code: "custom",
        path: ["scoringRules"],
        message: `${ruleId} enabled state must match its winRules setting`,
      });
    }
  }

  if (
    !ruleset.kongRules.robConcealedKong &&
    ruleset.kongRules.concealedKongRobberyForms.length > 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["kongRules", "concealedKongRobberyForms"],
      message: "concealed-kong robbery forms must be empty when robbery is disabled",
    });
  }

  const mappedSeats = ruleset.bonusRules.seatMapping.map(({ seat }) => seat);
  const mappedFlowers = ruleset.bonusRules.seatMapping.map(({ flower }) => flower);
  const mappedSeasons = ruleset.bonusRules.seatMapping.map(({ season }) => season);
  if (
    new Set(mappedSeats).size !== 4 ||
    new Set(mappedFlowers).size !== 4 ||
    new Set(mappedSeasons).size !== 4
  ) {
    context.addIssue({
      code: "custom",
      path: ["bonusRules", "seatMapping"],
      message: "seat bonus mapping must assign four distinct seats, flowers, and seasons",
    });
  }
  if (
    new Set(ruleset.roundRules.prevailingWinds).size !== ruleset.roundRules.prevailingWinds.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["roundRules", "prevailingWinds"],
      message: "prevailing winds must be unique",
    });
  }

  let expectedMinimum = 0;
  for (const [index, bucket] of ruleset.payment.basePointBuckets.entries()) {
    if (bucket.minimumFaan !== expectedMinimum) {
      context.addIssue({
        code: "custom",
        path: ["payment", "basePointBuckets", index, "minimumFaan"],
        message: `expected contiguous bucket beginning at ${String(expectedMinimum)} faan`,
      });
    }
    if (bucket.maximumFaan !== null && bucket.maximumFaan < bucket.minimumFaan) {
      context.addIssue({
        code: "custom",
        path: ["payment", "basePointBuckets", index, "maximumFaan"],
        message: "maximumFaan must be at least minimumFaan",
      });
    }
    if (bucket.maximumFaan === null && index !== ruleset.payment.basePointBuckets.length - 1) {
      context.addIssue({
        code: "custom",
        path: ["payment", "basePointBuckets", index, "maximumFaan"],
        message: "only the final payment bucket may be unbounded",
      });
    }
    expectedMinimum = (bucket.maximumFaan ?? bucket.minimumFaan) + 1;
  }
  const finalBucket = ruleset.payment.basePointBuckets.at(-1)!;
  if (finalBucket.maximumFaan !== null) {
    context.addIssue({
      code: "custom",
      path: ["payment", "basePointBuckets"],
      message: "the final payment bucket must use null for an unbounded maximum",
    });
  }

  if (
    ruleset.payment.strategy === "discarder_pays_all" &&
    ruleset.payment.discard.otherLoserMultiplier !== 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["payment", "discard", "otherLoserMultiplier"],
      message: "discarder_pays_all requires otherLoserMultiplier to be zero",
    });
  }
});

export type ScoringRuleDefinition = z.infer<typeof scoringRuleDefinitionSchema>;
export type RulesetDefinition = z.infer<typeof rulesetDefinitionSchema>;

export type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export interface ResolvedRuleset {
  definition: DeepReadonly<RulesetDefinition>;
  hash: string;
}

export interface RulesetValidationIssue {
  path: string;
  message: string;
}

export class RulesetValidationError extends Error {
  readonly issues: readonly RulesetValidationIssue[];

  constructor(issues: readonly RulesetValidationIssue[]) {
    super(
      `Ruleset is invalid: ${issues.map(({ path, message }) => `${path}: ${message}`).join("; ")}`,
    );
    this.name = "RulesetValidationError";
    this.issues = issues;
  }
}

const validationIssues = (error: z.ZodError): readonly RulesetValidationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));

export type RulesetValidationResult =
  | { valid: true; ruleset: ResolvedRuleset }
  | { valid: false; issues: readonly RulesetValidationIssue[] };

const disableUnavailableBonusRules = (ruleset: RulesetDefinition): RulesetDefinition => {
  if (ruleset.tileSet.bonusTilesEnabled) {
    return ruleset;
  }
  return {
    ...ruleset,
    scoringRules: ruleset.scoringRules.map((rule) =>
      rule.category === "bonus" ? { ...rule, enabled: false } : rule,
    ),
  };
};

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
};

/** Validates, resolves derived settings, and hashes the exact historical rules data. */
export const resolveRuleset = (input: unknown): ResolvedRuleset => {
  const result = rulesetDefinitionSchema.safeParse(input);
  if (!result.success) {
    throw new RulesetValidationError(validationIssues(result.error));
  }
  const definition = deepFreeze(disableUnavailableBonusRules(result.data));
  return deepFreeze({
    definition,
    hash: `sha256:${canonicalJsonHash(definition)}`,
  });
};

export const validateRuleset = (input: unknown): RulesetValidationResult => {
  try {
    return { valid: true, ruleset: resolveRuleset(input) };
  } catch (error) {
    if (error instanceof RulesetValidationError) {
      return { valid: false, issues: error.issues };
    }
    /* v8 ignore next -- resolveRuleset normalizes schema failures to RulesetValidationError */
    throw error;
  }
};

export interface SeatBonusTiles {
  flower: BonusTileTypeId;
  season: BonusTileTypeId;
}

export const bonusTilesForSeat = (ruleset: ResolvedRuleset, seat: Wind): SeatBonusTiles => {
  const mapping = ruleset.definition.bonusRules.seatMapping.find((entry) => entry.seat === seat);
  if (mapping === undefined) {
    throw new Error(`Resolved ruleset has no bonus mapping for ${seat}`);
  }
  return {
    flower: mapping.flower,
    season: mapping.season,
  };
};
