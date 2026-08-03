import {
  compactCodeForTile,
  parseTileTypes,
  type Meld,
  type PaymentSettlementInput,
  type PlayerId,
  type ScoringAssessmentInput,
  type ScoringBreakdown,
  type TileInstanceId,
  type TileTypeId,
  type WinSource,
  type Wind,
} from "@hk-mahjong/core";
import { describe, expect, it } from "vitest";
import { getBundledRuleset } from "./bundled.js";
import { toCoreGameRules } from "./core-rules.js";
import {
  GOLDEN_SCORING_FIXTURES,
  type GoldenScoringExpected,
  type GoldenScoringInput,
} from "./golden-scoring-fixtures.js";
import {
  basePointsForFaan,
  createHongKongScoringSystem,
  scoreHand,
  settlePayments,
} from "./scoring.js";
import { resolveRuleset, type RulesetDefinition, type ScoringRuleId } from "./ruleset.js";

interface MeldFixture {
  kind: "chow" | "pung" | "kong";
  tiles: string;
  exposed?: boolean;
  kongKind?: "exposed" | "concealed" | "added";
}

interface HandFixture {
  concealed: string;
  melds?: readonly MeldFixture[];
  bonus?: string;
  rulesetId?: "hk_nyc_social_v1" | "hk_modern_13f_v1" | "training_relaxed_v1";
  playerId?: PlayerId;
  seat?: Wind;
  dealerPlayerId?: PlayerId;
  prevailingWind?: Wind;
  source?: WinSource;
  fromPlayerId?: PlayerId | null;
  replacementReason?: "bonus" | "kong" | null;
  isInitialDeal?: boolean;
  isDealerFirstDiscard?: boolean;
  initialBonusReplacementOccurred?: boolean;
  openingKongOccurred?: boolean;
  firstDiscardCompleted?: boolean;
  callsOccurred?: boolean;
  robbedKongKind?: "added" | "concealed" | null;
  winningTileWasFinalLiveTile?: boolean;
  discardFollowedFinalLiveDraw?: boolean;
}

interface RuleGoldenCase {
  ruleId: ScoringRuleId;
  positive: HandFixture;
  nearMiss: HandFixture;
}

class PhysicalAllocator {
  readonly #copies = new Map<TileTypeId, number>();

  allocate(notation: string): readonly TileInstanceId[] {
    if (notation.trim().length === 0) {
      return [];
    }
    return parseTileTypes(notation).map((typeId) => {
      const copy = (this.#copies.get(typeId) ?? 0) + 1;
      this.#copies.set(typeId, copy);
      const maximum = typeId.startsWith("flower.") || typeId.startsWith("season.") ? 1 : 4;
      if (copy > maximum) {
        throw new Error(`Fixture over-allocates ${typeId}`);
      }
      return `${typeId}#${String(copy)}` as TileInstanceId;
    });
  }
}

const materialize = (
  fixture: HandFixture,
  explicitRuleset = fixture.rulesetId,
): { input: ScoringAssessmentInput; ruleset: ReturnType<typeof getBundledRuleset> } => {
  const ruleset = getBundledRuleset(explicitRuleset ?? "hk_nyc_social_v1");
  const allocator = new PhysicalAllocator();
  const concealedTileIds = allocator.allocate(fixture.concealed);
  const melds: Meld[] = (fixture.melds ?? []).map((meld, index) => {
    const tileIds = allocator.allocate(meld.tiles);
    const exposed = meld.exposed ?? true;
    return {
      id: `meld:${String(index + 1)}`,
      kind: meld.kind,
      kongKind:
        meld.kind === "kong" ? (meld.kongKind ?? (exposed ? "exposed" : "concealed")) : null,
      tileIds: [...tileIds],
      exposed,
      claimedFrom: exposed ? "west" : null,
      claimedTileId: exposed ? (tileIds[0] ?? null) : null,
      createdEventId: `event:meld:${String(index + 1)}`,
    };
  });
  const bonusTileIds = allocator.allocate(fixture.bonus ?? "F1");
  const winningTileId = concealedTileIds.at(-1);
  if (winningTileId === undefined) {
    throw new Error("A scoring fixture requires a concealed winning tile");
  }
  const source = fixture.source ?? "discard";
  const playerId = fixture.playerId ?? "south";
  const dealerPlayerId = fixture.dealerPlayerId ?? "east";
  return {
    ruleset,
    input: {
      rules: toCoreGameRules(ruleset),
      mode: "guided",
      player: {
        id: playerId,
        seat: fixture.seat ?? "south",
        concealedTileIds,
        melds,
        bonusTileIds,
      },
      prevailingWind: fixture.prevailingWind ?? "west",
      dealerPlayerId,
      winningTileId,
      winSource: source,
      fromPlayerId:
        fixture.fromPlayerId ??
        (["self_draw", "replacement", "initial_deal"].includes(source) ? null : "west"),
      replacementReason: fixture.replacementReason ?? (source === "replacement" ? "kong" : null),
      isInitialDeal: fixture.isInitialDeal ?? source === "initial_deal",
      isDealerFirstDiscard: fixture.isDealerFirstDiscard ?? false,
      initialBonusReplacementOccurred: fixture.initialBonusReplacementOccurred ?? false,
      openingKongOccurred: fixture.openingKongOccurred ?? false,
      firstDiscardCompleted: fixture.firstDiscardCompleted ?? source !== "initial_deal",
      callsOccurred: fixture.callsOccurred ?? melds.some(({ exposed }) => exposed),
      robbedKongKind: fixture.robbedKongKind ?? (source === "robbing_kong" ? "added" : null),
      winningTileWasFinalLiveTile: fixture.winningTileWasFinalLiveTile ?? false,
      discardFollowedFinalLiveDraw: fixture.discardFollowedFinalLiveDraw ?? false,
    },
  };
};

const scoreFixture = (fixture: HandFixture, explicitRuleset?: HandFixture["rulesetId"]) => {
  const { input, ruleset } = materialize(fixture, explicitRuleset);
  return createHongKongScoringSystem(ruleset).assess(input);
};

const pung = (tiles: string): MeldFixture => ({ kind: "pung", tiles });
const chow = (tiles: string): MeldFixture => ({ kind: "chow", tiles });
const kong = (
  tiles: string,
  kongKind: "exposed" | "concealed" | "added" = "exposed",
): MeldFixture => ({
  kind: "kong",
  tiles,
  exposed: kongKind !== "concealed",
  kongKind,
});

const NEUTRAL: HandFixture = {
  concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 9p 9p",
  melds: [pung("5s 5s 5s")],
};
const CONCEALED_NEUTRAL: HandFixture = {
  concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 5s 5s 5s 9p 9p",
};
const ALL_CHOWS: HandFixture = {
  concealed: "4p 5p 6p 1s 2s 3s 4s 5s 6s 8m 8m",
  melds: [chow("1p 2p 3p")],
};
const LITTLE_DRAGONS: HandFixture = {
  concealed: "1m 2m 3m 4p 5p 6p Wh Wh",
  melds: [pung("R R R"), pung("G G G")],
};
const LITTLE_WINDS: HandFixture = {
  concealed: "1m 2m 3m N N",
  melds: [pung("E E E"), pung("S S S"), pung("W W W")],
};

const RULE_CASES: readonly RuleGoldenCase[] = [
  {
    ruleId: "no_bonus_tiles",
    positive: { ...NEUTRAL, bonus: "" },
    nearMiss: { ...NEUTRAL, bonus: "F1" },
  },
  {
    ruleId: "seat_flower",
    positive: { ...NEUTRAL, bonus: "F2" },
    nearMiss: { ...NEUTRAL, bonus: "F1" },
  },
  {
    ruleId: "seat_season",
    positive: { ...NEUTRAL, bonus: "S2" },
    nearMiss: { ...NEUTRAL, bonus: "S1" },
  },
  {
    ruleId: "all_chows",
    positive: ALL_CHOWS,
    nearMiss: {
      concealed: "4p 5p 6p 1s 2s 3s 4s 5s 6s 8m 8m",
      melds: [pung("1p 1p 1p")],
    },
  },
  {
    ruleId: "concealed_hand",
    positive: CONCEALED_NEUTRAL,
    nearMiss: NEUTRAL,
  },
  {
    ruleId: "dragon_pung",
    positive: {
      concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 9s 9s",
      melds: [pung("R R R")],
    },
    nearMiss: {
      concealed: "4m 5m 6m 1p 2p 3p 4p 5p 6p R R",
      melds: [chow("1m 2m 3m")],
    },
  },
  {
    ruleId: "seat_wind",
    positive: {
      concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 9s 9s",
      melds: [pung("S S S")],
    },
    nearMiss: {
      concealed: "4m 5m 6m 1p 2p 3p 4p 5p 6p S S",
      melds: [chow("1m 2m 3m")],
    },
  },
  {
    ruleId: "prevailing_wind",
    positive: {
      concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 9s 9s",
      melds: [pung("W W W")],
    },
    nearMiss: {
      concealed: "4m 5m 6m 1p 2p 3p 4p 5p 6p W W",
      melds: [chow("1m 2m 3m")],
    },
  },
  {
    ruleId: "self_draw",
    positive: { ...NEUTRAL, source: "self_draw" },
    nearMiss: { ...NEUTRAL, source: "discard" },
  },
  {
    ruleId: "last_tile_draw",
    positive: {
      ...NEUTRAL,
      source: "self_draw",
      winningTileWasFinalLiveTile: true,
    },
    nearMiss: {
      ...NEUTRAL,
      source: "self_draw",
      winningTileWasFinalLiveTile: false,
    },
  },
  {
    ruleId: "last_tile_discard",
    positive: { ...NEUTRAL, discardFollowedFinalLiveDraw: true },
    nearMiss: { ...NEUTRAL, discardFollowedFinalLiveDraw: false },
  },
  {
    ruleId: "robbing_kong",
    positive: { ...NEUTRAL, source: "robbing_kong", robbedKongKind: "added" },
    nearMiss: { ...NEUTRAL, source: "robbing_kong", robbedKongKind: "concealed" },
  },
  {
    ruleId: "replacement_win",
    positive: { ...NEUTRAL, source: "replacement", replacementReason: "kong" },
    nearMiss: { ...NEUTRAL, source: "self_draw" },
  },
  {
    ruleId: "all_flowers",
    positive: { ...NEUTRAL, bonus: "F1 F2 F3 F4" },
    nearMiss: { ...NEUTRAL, bonus: "F1 F2 F3" },
  },
  {
    ruleId: "all_seasons",
    positive: { ...NEUTRAL, bonus: "S1 S2 S3 S4" },
    nearMiss: { ...NEUTRAL, bonus: "S1 S2 S3" },
  },
  {
    ruleId: "all_pungs",
    positive: {
      concealed: "8s 8s 8s N N N 7m 7m",
      melds: [pung("2m 2m 2m"), pung("5p 5p 5p")],
    },
    nearMiss: {
      concealed: "8s 8s 8s 1s 2s 3s 7m 7m",
      melds: [pung("2m 2m 2m"), pung("5p 5p 5p")],
    },
  },
  {
    ruleId: "half_flush",
    positive: {
      concealed: "4m 5m 6m 7m 8m 9m N N N E E",
      melds: [chow("1m 2m 3m")],
    },
    nearMiss: {
      concealed: "4m 5m 6m 7m 8m 9m N N N E E",
      melds: [chow("1p 2p 3p")],
    },
  },
  {
    ruleId: "little_three_dragons",
    positive: LITTLE_DRAGONS,
    nearMiss: {
      concealed: "1m 2m 3m 4p 5p 6p 9s 9s",
      melds: [pung("R R R"), pung("G G G")],
    },
  },
  {
    ruleId: "seven_pairs",
    positive: {
      concealed: "1m 1m 2m 2m 3p 3p 4p 4p 5s 5s 6s 6s E E",
    },
    nearMiss: {
      concealed: "1m 1m 1m 2m 3m 4m 4p 5p 6p 7s 8s 9s E E",
      bonus: "",
    },
  },
  {
    ruleId: "full_flush",
    positive: {
      concealed: "4m 5m 6m 7m 8m 9m 2m 2m 2m 5m 5m",
      melds: [chow("1m 2m 3m")],
    },
    nearMiss: {
      concealed: "4m 5m 6m 7m 8m 9m 2m 2m 2m E E",
      melds: [chow("1m 2m 3m")],
    },
  },
  {
    ruleId: "four_concealed_pungs",
    positive: {
      concealed: "1m 1m 1m 2p 2p 2p 3s 3s 3s N N N 5m 5m",
      source: "self_draw",
    },
    nearMiss: {
      concealed: "1m 1m 1m 2p 2p 2p 3s 3s 3s N N N 5m 5m",
      source: "discard",
    },
  },
  {
    ruleId: "big_three_dragons",
    positive: {
      concealed: "Wh Wh Wh 1m 2m 3m 9s 9s",
      melds: [pung("R R R"), pung("G G G")],
    },
    nearMiss: LITTLE_DRAGONS,
  },
  {
    ruleId: "little_four_winds",
    positive: LITTLE_WINDS,
    nearMiss: {
      concealed: "1m 2m 3m 9m 9m",
      melds: [pung("E E E"), pung("S S S"), pung("W W W")],
    },
  },
  {
    ruleId: "big_four_winds",
    positive: {
      concealed: "R R",
      melds: [pung("E E E"), pung("S S S"), pung("W W W"), pung("N N N")],
    },
    nearMiss: LITTLE_WINDS,
  },
  {
    ruleId: "all_honors",
    positive: {
      concealed: "N N",
      melds: [pung("E E E"), pung("S S S"), pung("R R R"), pung("G G G")],
    },
    nearMiss: {
      concealed: "1m 1m",
      melds: [pung("E E E"), pung("S S S"), pung("R R R"), pung("G G G")],
    },
  },
  {
    ruleId: "all_terminals",
    positive: {
      concealed: "1s 1s",
      melds: [pung("1m 1m 1m"), pung("9m 9m 9m"), pung("1p 1p 1p"), pung("9p 9p 9p")],
    },
    nearMiss: {
      concealed: "E E",
      melds: [pung("1m 1m 1m"), pung("9m 9m 9m"), pung("1p 1p 1p"), pung("9p 9p 9p")],
    },
  },
  {
    ruleId: "nine_gates",
    positive: {
      concealed: "1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 9m 9m 5m",
    },
    nearMiss: {
      concealed: "1m 1m 2m 3m 4m 5m 5m 6m 7m 8m 9m 9m 9m 1m",
    },
  },
  {
    ruleId: "thirteen_orphans",
    positive: {
      concealed: "1m 9m 1p 9p 1s 9s E S W N R G Wh 1m",
    },
    nearMiss: {
      concealed: "1m 2m 3m 1p 2p 3p 1s 2s 3s E E E Wh Wh",
      bonus: "",
    },
  },
  {
    ruleId: "all_kongs",
    positive: {
      concealed: "5s 5s",
      melds: [
        kong("1m 1m 1m 1m", "concealed"),
        kong("9m 9m 9m 9m"),
        kong("1p 1p 1p 1p"),
        kong("9p 9p 9p 9p", "concealed"),
      ],
    },
    nearMiss: {
      concealed: "5s 5s",
      melds: [
        kong("1m 1m 1m 1m", "concealed"),
        kong("9m 9m 9m 9m"),
        kong("1p 1p 1p 1p"),
        pung("9p 9p 9p"),
      ],
    },
  },
  {
    ruleId: "jade_dragon",
    positive: {
      concealed: "2s 2s",
      melds: [pung("1s 1s 1s"), pung("5s 5s 5s"), pung("9s 9s 9s"), pung("G G G")],
    },
    nearMiss: {
      concealed: "E E",
      melds: [pung("1s 1s 1s"), pung("5s 5s 5s"), pung("9s 9s 9s"), pung("G G G")],
    },
  },
  {
    ruleId: "ruby_dragon",
    positive: {
      concealed: "2m 2m",
      melds: [pung("1m 1m 1m"), pung("5m 5m 5m"), pung("9m 9m 9m"), pung("R R R")],
    },
    nearMiss: {
      concealed: "E E",
      melds: [pung("1m 1m 1m"), pung("5m 5m 5m"), pung("9m 9m 9m"), pung("R R R")],
    },
  },
  {
    ruleId: "pearl_dragon",
    positive: {
      concealed: "2p 2p",
      melds: [pung("1p 1p 1p"), pung("5p 5p 5p"), pung("9p 9p 9p"), pung("Wh Wh Wh")],
    },
    nearMiss: {
      concealed: "E E",
      melds: [pung("1p 1p 1p"), pung("5p 5p 5p"), pung("9p 9p 9p"), pung("Wh Wh Wh")],
    },
  },
  {
    ruleId: "heavenly_hand",
    positive: {
      ...CONCEALED_NEUTRAL,
      playerId: "east",
      seat: "east",
      source: "initial_deal",
      fromPlayerId: null,
      isInitialDeal: true,
      firstDiscardCompleted: false,
      callsOccurred: false,
      initialBonusReplacementOccurred: true,
    },
    nearMiss: {
      ...CONCEALED_NEUTRAL,
      playerId: "east",
      seat: "east",
      source: "self_draw",
      fromPlayerId: null,
      isInitialDeal: false,
      firstDiscardCompleted: true,
      callsOccurred: false,
    },
  },
  {
    ruleId: "earthly_hand",
    positive: {
      ...CONCEALED_NEUTRAL,
      source: "discard",
      fromPlayerId: "east",
      isDealerFirstDiscard: true,
      firstDiscardCompleted: false,
      callsOccurred: false,
    },
    nearMiss: {
      ...CONCEALED_NEUTRAL,
      source: "discard",
      fromPlayerId: "east",
      isDealerFirstDiscard: false,
      firstDiscardCompleted: true,
      callsOccurred: false,
    },
  },
];

const GOLDEN_PLAYERS: PaymentSettlementInput["players"] = [
  { id: "east", seat: "east" },
  { id: "south", seat: "south" },
  { id: "west", seat: "west" },
  { id: "north", seat: "north" },
];

const materializeGolden = (
  fixture: GoldenScoringInput,
): {
  input: ScoringAssessmentInput;
  ruleset: ReturnType<typeof getBundledRuleset>;
} => {
  const ruleset = getBundledRuleset(fixture.rulesetId);
  if (ruleset.definition.version !== fixture.rulesetVersion) {
    throw new Error(`Golden fixture ${fixture.rulesetId} has a stale ruleset version`);
  }
  const allocator = new PhysicalAllocator();
  const concealedTileIds = allocator.allocate(fixture.concealedTiles);
  const winningTileId = fixture.winningTileId as TileInstanceId;
  if (!concealedTileIds.includes(winningTileId)) {
    throw new Error(`Golden fixture winning tile ${winningTileId} is not concealed`);
  }
  const melds: Meld[] = fixture.melds.map((meld) => {
    const tileIds = allocator.allocate(meld.tiles);
    const claimedTileId = meld.claimedTileId as TileInstanceId | null;
    const expectedClaimedTileId = meld.exposed ? (tileIds[0] ?? null) : null;
    if (claimedTileId !== expectedClaimedTileId) {
      throw new Error(`Golden fixture meld ${meld.id} has stale physical tile identity`);
    }
    return {
      id: meld.id,
      kind: meld.kind,
      kongKind: meld.kongKind,
      tileIds: [...tileIds],
      exposed: meld.exposed,
      claimedFrom: meld.claimedFrom,
      claimedTileId,
      createdEventId: meld.createdEventId,
    };
  });
  return {
    ruleset,
    input: {
      rules: toCoreGameRules(ruleset),
      mode: fixture.mode,
      player: {
        id: fixture.playerId,
        seat: fixture.seat,
        concealedTileIds,
        melds,
        bonusTileIds: allocator.allocate(fixture.bonusTiles),
      },
      prevailingWind: fixture.prevailingWind,
      dealerPlayerId: fixture.dealerPlayerId,
      winningTileId,
      winSource: fixture.winSource,
      fromPlayerId: fixture.fromPlayerId,
      replacementReason: fixture.replacementReason,
      isInitialDeal: fixture.isInitialDeal,
      isDealerFirstDiscard: fixture.isDealerFirstDiscard,
      initialBonusReplacementOccurred: fixture.initialBonusReplacementOccurred,
      openingKongOccurred: fixture.openingKongOccurred,
      firstDiscardCompleted: fixture.firstDiscardCompleted,
      callsOccurred: fixture.callsOccurred,
      robbedKongKind: fixture.robbedKongKind,
      winningTileWasFinalLiveTile: fixture.winningTileWasFinalLiveTile,
      discardFollowedFinalLiveDraw: fixture.discardFollowedFinalLiveDraw,
    },
  };
};

const goldenRuleValue = (
  value: ScoringBreakdown["applied"][number]["value"],
): readonly ["faan", number] | readonly ["limit"] =>
  value.type === "faan" ? ["faan", value.amount] : ["limit"];

const goldenDecomposition = (decomposition: ScoringBreakdown["decomposition"]) => ({
  form: decomposition.form,
  concealedGroups: decomposition.concealedGroups.map(
    ({ kind, tileTypes }) =>
      [kind, tileTypes.map((tileType) => compactCodeForTile(tileType)).join(" ")] as const,
  ),
  declaredMeldIds: decomposition.declaredMeldIds,
});

const normalizeGoldenExpected = (
  fixture: GoldenScoringInput,
  assessment: ReturnType<ReturnType<typeof createHongKongScoringSystem>["assess"]>,
  ruleset: ReturnType<typeof getBundledRuleset>,
): GoldenScoringExpected => {
  const breakdown = assessment.breakdown;
  const settlement =
    breakdown?.legalWin === true
      ? settlePayments(ruleset.definition.payment, {
          players: GOLDEN_PLAYERS,
          dealerPlayerId: fixture.dealerPlayerId,
          winners: [
            {
              playerId: fixture.playerId,
              source: fixture.winSource,
              fromPlayerId: fixture.fromPlayerId,
              breakdown,
            },
          ],
        })
      : null;
  return {
    decomposition: breakdown === null ? null : goldenDecomposition(breakdown.decomposition),
    alternateForms: breakdown?.alternatives.map(({ decomposition }) => decomposition.form) ?? [],
    applied:
      breakdown?.applied.map(
        ({ ruleId, value, occurrences, faanContribution, impliedByRuleIds }) => [
          ruleId as ScoringRuleId,
          goldenRuleValue(value),
          occurrences,
          faanContribution,
          impliedByRuleIds,
        ],
      ) ?? [],
    suppressed:
      breakdown?.suppressed.map(
        ({ ruleId, value, occurrences, wouldAddFaan, reason, byRuleIds }) => [
          ruleId as ScoringRuleId,
          goldenRuleValue(value),
          occurrences,
          wouldAddFaan,
          reason,
          byRuleIds as readonly ScoringRuleId[],
        ],
      ) ?? [],
    rawFaan: assessment.preview.rawFaan,
    cappedFaan: assessment.preview.cappedFaan,
    minimumRequired: assessment.preview.minimumRequired,
    missingFaan: assessment.preview.missingFaan,
    legalWin: assessment.preview.legalWin,
    basePoints: breakdown?.basePoints ?? null,
    payment:
      settlement === null
        ? null
        : {
            payments: settlement.payments.map(
              ({ fromPlayerId, toPlayerId, points, basePoints, multiplier, reasons }) => [
                fromPlayerId,
                toPlayerId,
                points,
                basePoints,
                multiplier,
                reasons,
              ],
            ),
            scoreDeltas: [
              settlement.scoreDeltas.east ?? 0,
              settlement.scoreDeltas.south ?? 0,
              settlement.scoreDeltas.west ?? 0,
              settlement.scoreDeltas.north ?? 0,
            ],
          },
  };
};

describe("golden scoring rules", () => {
  it("contains the required positive and near-miss fixture for every rule", () => {
    expect(GOLDEN_SCORING_FIXTURES).toHaveLength(75);
    expect(new Set(GOLDEN_SCORING_FIXTURES.map(({ id }) => id)).size).toBe(75);
    const coverage = GOLDEN_SCORING_FIXTURES.flatMap((fixture) =>
      fixture.coverage === null ? [] : [fixture.coverage],
    );
    expect(coverage).toHaveLength(68);
    const bundledRuleIds = getBundledRuleset("hk_nyc_social_v1")
      .definition.scoringRules.map(({ id }) => id)
      .sort();
    const coveredRuleIds = [...new Set(coverage.map(({ ruleId }) => ruleId))].sort();
    expect(coveredRuleIds).toStrictEqual(bundledRuleIds);
    for (const ruleId of coveredRuleIds) {
      expect(
        coverage
          .filter((candidate) => candidate.ruleId === ruleId)
          .map(({ kind }) => kind)
          .sort(),
      ).toStrictEqual(["near-miss", "positive"]);
    }
  });

  it.each(GOLDEN_SCORING_FIXTURES)("$id", (fixture) => {
    const { input, ruleset } = materializeGolden(fixture.input);
    const assessment = createHongKongScoringSystem(ruleset).assess(input);
    const actual = normalizeGoldenExpected(fixture.input, assessment, ruleset);
    expect(actual).toStrictEqual(fixture.expected);
    if (fixture.coverage !== null) {
      const matchedRuleIds = [
        ...actual.applied.map(([ruleId]) => ruleId),
        ...actual.suppressed.map(([ruleId]) => ruleId),
      ];
      if (fixture.coverage.kind === "positive") {
        expect(
          actual.applied.map(([ruleId]) => ruleId),
          `${fixture.coverage.ruleId} should contribute in its positive fixture`,
        ).toContain(fixture.coverage.ruleId);
      } else {
        expect(
          matchedRuleIds,
          `${fixture.coverage.ruleId} should not match its near miss`,
        ).not.toContain(fixture.coverage.ruleId);
      }
    }
  });
});

const MODERN_VALUE_RULES = [
  "little_three_dragons",
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
] as const satisfies readonly ScoringRuleId[];

describe("profile-driven values and relation boundaries", () => {
  it.each(MODERN_VALUE_RULES)("uses the modern configured value for %s", (ruleId) => {
    const fixture = RULE_CASES.find((candidate) => candidate.ruleId === ruleId)?.positive;
    if (fixture === undefined) {
      throw new Error(`Missing positive fixture for ${ruleId}`);
    }
    const assessment = scoreFixture(fixture, "hk_modern_13f_v1");
    const applied = assessment.breakdown?.applied.find(({ ruleId: id }) => id === ruleId);
    const configured = getBundledRuleset("hk_modern_13f_v1").definition.scoringRules.find(
      ({ id }) => id === ruleId,
    );
    expect(applied?.value).toEqual(configured?.value);
  });

  it("chooses Seven Pairs over lower-scoring standard decompositions", () => {
    const result = scoreFixture({
      concealed: "1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m",
    }).breakdown!;
    expect(result.decomposition.form).toBe("seven_pairs");
    expect(result.applied.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining(["seven_pairs", "full_flush", "concealed_hand"]),
    );
    expect(result.cappedFaan).toBe(10);
    expect(result.alternatives.some(({ decomposition }) => decomposition.form === "standard")).toBe(
      true,
    );
  });

  it("chooses the All Pungs interpretation of an ambiguous standard hand", () => {
    const result = scoreFixture({
      concealed: "1m 1m 1m 2m 2m 2m 3m 3m 3m 4m 4m 4m 5m 5m",
    }).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toContain("all_pungs");
    expect(result.cappedFaan).toBe(10);
  });

  it("stacks seat and prevailing wind on the same East pung", () => {
    const result = scoreFixture({
      concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 9s 9s",
      melds: [pung("E E E")],
      playerId: "east",
      seat: "east",
      prevailingWind: "east",
    }).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining(["seat_wind", "prevailing_wind"]),
    );
  });

  it("lists the seat Flower as suppressed by All Flowers", () => {
    const result = scoreFixture({ ...NEUTRAL, bonus: "F1 F2 F3 F4" }).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toContain("all_flowers");
    expect(result.suppressed).toContainEqual(
      expect.objectContaining({
        ruleId: "seat_flower",
        reason: "suppressed_by_rule",
        byRuleIds: ["all_flowers"],
      }),
    );
  });

  it("lists Dragon Pung as informational under Big Three Dragons", () => {
    const fixture = RULE_CASES.find(({ ruleId }) => ruleId === "big_three_dragons")!.positive;
    const result = scoreFixture(fixture).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toContain("big_three_dragons");
    expect(result.suppressed.map(({ ruleId }) => ruleId)).toContain("dragon_pung");
  });

  it("suppresses Full Flush under the Nine Gates limit", () => {
    const fixture = RULE_CASES.find(({ ruleId }) => ruleId === "nine_gates")!.positive;
    const result = scoreFixture(fixture).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toContain("nine_gates");
    expect(result.suppressed.map(({ ruleId }) => ruleId)).toContain("full_flush");
  });

  it("lists simultaneous true limits but aggregates the cap once", () => {
    const fixture = RULE_CASES.find(({ ruleId }) => ruleId === "big_four_winds")!.positive;
    const result = scoreFixture(fixture).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining(["big_four_winds", "all_honors"]),
    );
    expect(result.rawFaan).toBe(10);
    expect(result.cappedFaan).toBe(10);
  });

  it("explains exact two-faan rejection and exact three-faan legality", () => {
    const two = scoreFixture({ ...ALL_CHOWS, bonus: "F2" }).preview;
    const three = scoreFixture({ ...ALL_CHOWS, bonus: "F2 S2" }).preview;
    expect(two).toMatchObject({
      rawFaan: 2,
      legalWin: false,
      missingFaan: 1,
      reason: "below_minimum_faan",
    });
    expect(three).toMatchObject({ rawFaan: 3, legalWin: true, missingFaan: 0 });
  });

  it("keeps training zero-faan play legal and exposes the standard comparison", () => {
    const result = scoreFixture({ ...NEUTRAL, rulesetId: "training_relaxed_v1" }).breakdown!;
    expect(result).toMatchObject({
      rawFaan: 0,
      legalWin: true,
      standardComparison: {
        rulesetId: "hk_nyc_social_v1",
        rawFaan: 0,
        legalWin: false,
        missingFaan: 3,
      },
    });
  });

  it("does not award No Bonus Tiles in resolved 136-tile play", () => {
    const mutable = structuredClone(
      getBundledRuleset("training_relaxed_v1").definition,
    ) as RulesetDefinition;
    mutable.id = "training_136_test";
    mutable.standardComparisonRulesetId = null;
    mutable.tileSet.bonusTilesEnabled = false;
    const ruleset = resolveRuleset(mutable);
    const { input } = materialize({ ...NEUTRAL, bonus: "" }, "training_relaxed_v1");
    const assessment = scoreHand(ruleset, {
      ...input,
      rules: toCoreGameRules(ruleset),
    });
    expect(assessment.breakdown?.applied.map(({ ruleId }) => ruleId)).not.toContain(
      "no_bonus_tiles",
    );
  });

  it.each([
    ["left_limit", { type: "limit" as const }, { type: "faan" as const, amount: 1 }, "all_chows"],
    [
      "right_limit",
      { type: "faan" as const, amount: 1 },
      { type: "limit" as const },
      "concealed_hand",
    ],
    [
      "higher_faan",
      { type: "faan" as const, amount: 1 },
      { type: "faan" as const, amount: 2 },
      "concealed_hand",
    ],
    [
      "canonical_tie",
      { type: "faan" as const, amount: 1 },
      { type: "faan" as const, amount: 1 },
      "all_chows",
    ],
  ] as const)(
    "resolves mutual exclusions by %s preference",
    (caseId, allChowsValue, concealedValue, expectedWinner) => {
      const ruleset = customRuleset(`mutual_exclusion_${caseId}`, (definition) => {
        const allChows = definition.scoringRules.find(({ id }) => id === "all_chows")!;
        const concealed = definition.scoringRules.find(({ id }) => id === "concealed_hand")!;
        allChows.value = allChowsValue;
        concealed.value = concealedValue;
        allChows.excludes = [{ target: "rule", id: "concealed_hand" }];
        concealed.excludes = [{ target: "rule", id: "all_chows" }];
      });
      const { input } = materialize({
        concealed: "1m 2m 3m 4m 5m 6m 1p 2p 3p 4s 5s 6s 8m 8m",
        bonus: "",
      });
      const result = scoreHand(ruleset, {
        ...input,
        rules: toCoreGameRules(ruleset),
      }).breakdown!;
      const loser = expectedWinner === "all_chows" ? "concealed_hand" : "all_chows";
      const expectedReason =
        allChowsValue.type === "limit" || concealedValue.type === "limit"
          ? "limit_aggregation"
          : "excluded_by_rule";
      expect(result.applied.map(({ ruleId }) => ruleId)).toContain(expectedWinner);
      expect(result.suppressed).toContainEqual(
        expect.objectContaining({
          ruleId: loser,
          reason: expectedReason,
          byRuleIds: [expectedWinner],
        }),
      );
    },
  );
});

const PLAYERS: PaymentSettlementInput["players"] = [
  { id: "east", seat: "east" },
  { id: "south", seat: "south" },
  { id: "west", seat: "west" },
  { id: "north", seat: "north" },
];

const THREE_FAAN = { ...ALL_CHOWS, bonus: "F2 S2" };

const paymentBreakdown = (playerId: PlayerId, source: WinSource): ScoringBreakdown => {
  const base = scoreFixture(THREE_FAAN).breakdown!;
  return {
    ...base,
    winnerId: playerId,
    winSource: source,
  };
};

const paymentInput = (
  winners: PaymentSettlementInput["winners"],
  dealerPlayerId: PlayerId = "east",
): PaymentSettlementInput => ({
  players: PLAYERS,
  dealerPlayerId,
  winners,
});

const defaultPayment = getBundledRuleset("hk_nyc_social_v1").definition.payment;

describe("payment buckets and zero-sum settlement", () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 4],
    [3, 8],
    [4, 16],
    [6, 16],
    [7, 32],
    [9, 32],
    [10, 64],
    [13, 64],
  ] as const)("maps %i faan to %i base points", (faan, expected) => {
    expect(basePointsForFaan(defaultPayment, faan)).toBe(expected);
  });

  it("settles a discard win across the discarder and other losers", () => {
    const result = settlePayments(
      defaultPayment,
      paymentInput([
        {
          playerId: "south",
          source: "discard",
          fromPlayerId: "west",
          breakdown: paymentBreakdown("south", "discard"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: -8, south: 32, west: -16, north: -8 });
  });

  it("settles a self-draw against every loser", () => {
    const result = settlePayments(
      defaultPayment,
      paymentInput([
        {
          playerId: "south",
          source: "self_draw",
          fromPlayerId: null,
          breakdown: paymentBreakdown("south", "self_draw"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: -16, south: 48, west: -16, north: -16 });
  });

  it("supports the discarder-pays-all strategy through configured multipliers", () => {
    const payment = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    payment.strategy = "discarder_pays_all";
    payment.discard.discarderMultiplier = 4;
    payment.discard.otherLoserMultiplier = 0;
    const result = settlePayments(
      payment,
      paymentInput([
        {
          playerId: "south",
          source: "discard",
          fromPlayerId: "west",
          breakdown: paymentBreakdown("south", "discard"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: 0, south: 32, west: -32, north: 0 });
  });

  it("applies the dealer multiplier once when the dealer wins", () => {
    const payment = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    payment.dealerMultiplier = 2;
    const result = settlePayments(
      payment,
      paymentInput([
        {
          playerId: "east",
          source: "self_draw",
          fromPlayerId: null,
          breakdown: paymentBreakdown("east", "self_draw"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: 96, south: -32, west: -32, north: -32 });
  });

  it("applies the dealer multiplier once when the dealer is another loser", () => {
    const payment = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    payment.dealerMultiplier = 2;
    const result = settlePayments(
      payment,
      paymentInput([
        {
          playerId: "south",
          source: "discard",
          fromPlayerId: "west",
          breakdown: paymentBreakdown("south", "discard"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: -16, south: 40, west: -16, north: -8 });
  });

  it("applies the dealer multiplier once to the discarder", () => {
    const payment = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    payment.dealerMultiplier = 2;
    const result = settlePayments(
      payment,
      paymentInput([
        {
          playerId: "south",
          source: "discard",
          fromPlayerId: "east",
          breakdown: paymentBreakdown("south", "discard"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: -32, south: 48, west: -8, north: -8 });
  });

  it("excludes co-winners from every multiple-winner payer set", () => {
    const result = settlePayments(
      defaultPayment,
      paymentInput([
        {
          playerId: "south",
          source: "discard",
          fromPlayerId: "east",
          breakdown: paymentBreakdown("south", "discard"),
        },
        {
          playerId: "west",
          source: "discard",
          fromPlayerId: "east",
          breakdown: paymentBreakdown("west", "discard"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: -32, south: 24, west: 24, north: -16 });
  });

  it("settles a dealer co-winner independently and remains zero-sum", () => {
    const payment = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    payment.dealerMultiplier = 2;
    const result = settlePayments(
      payment,
      paymentInput([
        {
          playerId: "east",
          source: "discard",
          fromPlayerId: "west",
          breakdown: paymentBreakdown("east", "discard"),
        },
        {
          playerId: "south",
          source: "discard",
          fromPlayerId: "west",
          breakdown: paymentBreakdown("south", "discard"),
        },
      ]),
    );
    expect(result.scoreDeltas).toEqual({ east: 48, south: 24, west: -48, north: -24 });
    expect(Object.values(result.scoreDeltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("rejects invalid source provenance and unsafe arithmetic", () => {
    expect(() =>
      settlePayments(
        defaultPayment,
        paymentInput([
          {
            playerId: "south",
            source: "self_draw",
            fromPlayerId: "west",
            breakdown: paymentBreakdown("south", "self_draw"),
          },
        ]),
      ),
    ).toThrow(/provenance/u);
    const unsafe = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    unsafe.dealerMultiplier = Number.MAX_SAFE_INTEGER;
    expect(() =>
      settlePayments(
        unsafe,
        paymentInput([
          {
            playerId: "east",
            source: "self_draw",
            fromPlayerId: null,
            breakdown: paymentBreakdown("east", "self_draw"),
          },
        ]),
      ),
    ).toThrow(/safe-integer/u);
  });

  it("binds the engine scoring system to the exact historical ruleset identity", () => {
    const ruleset = getBundledRuleset("hk_nyc_social_v1");
    const system = createHongKongScoringSystem(ruleset);
    const { input } = materialize(THREE_FAAN);
    expect(() =>
      system.assess({
        ...input,
        rules: { ...input.rules, id: "different_ruleset" },
      }),
    ).toThrow(/identity/u);
  });
});

const customRuleset = (id: string, mutate: (definition: RulesetDefinition) => void) => {
  const definition = structuredClone(
    getBundledRuleset("hk_nyc_social_v1").definition,
  ) as RulesetDefinition;
  definition.id = id;
  definition.standardComparisonRulesetId = null;
  mutate(definition);
  return resolveRuleset(definition);
};

describe("scoring and settlement defensive boundaries", () => {
  it("validates faan lookup input and rejects bonus tiles in the concealed zone", () => {
    expect(() => basePointsForFaan(defaultPayment, -1)).toThrow(/non-negative/u);
    expect(() => basePointsForFaan(defaultPayment, 1.5)).toThrow(/safe integer/u);

    const { input, ruleset } = materialize({ ...NEUTRAL, bonus: "" });
    expect(() =>
      scoreHand(ruleset, {
        ...input,
        player: {
          ...input.player,
          concealedTileIds: ["flower.plum#1", ...input.player.concealedTileIds.slice(1)],
        },
      }),
    ).toThrow(/bonus tiles/u);
  });

  it("supports configured opening-kong Heavenly Hand semantics", () => {
    const ruleset = customRuleset("opening_kong_heavenly_test", (definition) => {
      definition.patternSemantics.heavenlyHand.kongBeforeWinAllowed = true;
    });
    const { input } = materialize({
      ...CONCEALED_NEUTRAL,
      bonus: "",
      playerId: "east",
      seat: "east",
      source: "replacement",
      fromPlayerId: null,
      replacementReason: "kong",
      firstDiscardCompleted: false,
      callsOccurred: true,
      openingKongOccurred: true,
    });
    const result = scoreHand(ruleset, { ...input, rules: toCoreGameRules(ruleset) }).breakdown!;
    expect(result.applied.map(({ ruleId }) => ruleId)).toContain("heavenly_hand");
  });

  it("supports configured concealed-kong and opening-kong limit semantics", () => {
    const concealedKongRuleset = customRuleset(
      "concealed_kong_counts_for_four_pungs_test",
      (definition) => {
        definition.patternSemantics.fourConcealedPungs.concealedKongsCount = true;
      },
    );
    const { input: concealedKongInput } = materialize({
      concealed: "1m 1m 1m 2p 2p 2p 3s 3s 3s 5m 5m",
      melds: [kong("N N N N", "concealed")],
      source: "self_draw",
    });
    const concealedKongResult = scoreHand(concealedKongRuleset, {
      ...concealedKongInput,
      rules: toCoreGameRules(concealedKongRuleset),
    }).breakdown!;
    expect(concealedKongResult.applied.map(({ ruleId }) => ruleId)).toContain(
      "four_concealed_pungs",
    );

    const openingKongRuleset = customRuleset("opening_kong_earthly_test", (definition) => {
      definition.patternSemantics.earthlyHand.kongBeforeWinAllowed = true;
    });
    const { input: openingKongInput } = materialize({
      ...CONCEALED_NEUTRAL,
      source: "discard",
      fromPlayerId: "east",
      isDealerFirstDiscard: true,
      firstDiscardCompleted: false,
      callsOccurred: true,
      openingKongOccurred: true,
    });
    const openingKongResult = scoreHand(openingKongRuleset, {
      ...openingKongInput,
      rules: toCoreGameRules(openingKongRuleset),
    }).breakdown!;
    expect(openingKongResult.applied.map(({ ruleId }) => ruleId)).toContain("earthly_hand");

    const bonusReplacementResult = scoreFixture({
      ...CONCEALED_NEUTRAL,
      source: "discard",
      fromPlayerId: "east",
      isDealerFirstDiscard: true,
      initialBonusReplacementOccurred: true,
      firstDiscardCompleted: false,
      callsOccurred: false,
    }).breakdown!;
    expect(bonusReplacementResult.applied.map(({ ruleId }) => ruleId)).toContain("earthly_hand");
  });

  it("materializes an enabled implied rule even when its predicate did not independently match", () => {
    const result = scoreFixture({
      ...NEUTRAL,
      playerId: "east",
      seat: "east",
      source: "initial_deal",
      fromPlayerId: null,
      isInitialDeal: true,
      firstDiscardCompleted: false,
      callsOccurred: false,
    }).breakdown!;
    expect(result.suppressed).toContainEqual(
      expect.objectContaining({
        ruleId: "concealed_hand",
        evidence: ["Implied by heavenly_hand"],
      }),
    );
  });

  it("prefers a legal decomposition over a below-minimum alternate", () => {
    const ruleset = customRuleset("ambiguous_minimum_test", (definition) => {
      definition.winRules.minimumFaan = 10;
    });
    const { input } = materialize({
      concealed: "1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m",
      bonus: "",
    });
    const result = scoreHand(ruleset, { ...input, rules: toCoreGameRules(ruleset) }).breakdown!;
    expect(result.decomposition.form).toBe("seven_pairs");
    expect(result.legalWin).toBe(true);
    expect(result.alternatives.some(({ legalWin }) => !legalWin)).toBe(true);
  });

  it("returns a null standard comparison when the comparison profile cannot solve the shape", () => {
    const training = getBundledRuleset("training_relaxed_v1");
    const comparison = customRuleset("comparison_without_seven_pairs", (definition) => {
      definition.winRules.allowSevenPairs = false;
      definition.scoringRules.find(({ id }) => id === "seven_pairs")!.enabled = false;
    });
    const { input } = materialize({
      concealed: "1m 1m 2m 2m 3p 3p 4p 4p 5s 5s 6s 6s E E",
      bonus: "",
      rulesetId: "training_relaxed_v1",
    });
    const result = scoreHand(training, input, comparison).breakdown!;
    expect(result.decomposition.form).toBe("seven_pairs");
    expect(result.standardComparison).toBeNull();
  });

  it("rejects invalid settlement participants and winners", () => {
    const breakdown = paymentBreakdown("south", "discard");
    const goodWinner: PaymentSettlementInput["winners"][number] = {
      playerId: "south",
      source: "discard",
      fromPlayerId: "west",
      breakdown,
    };
    expect(() =>
      settlePayments(defaultPayment, {
        ...paymentInput([goodWinner]),
        players: [PLAYERS[0]!, PLAYERS[0]!, PLAYERS[2]!, PLAYERS[3]!],
      }),
    ).toThrow(/four distinct/u);
    expect(() =>
      settlePayments(defaultPayment, {
        ...paymentInput([goodWinner]),
        players: PLAYERS.slice(0, 3),
      }),
    ).toThrow(/four distinct/u);
    expect(() =>
      settlePayments(defaultPayment, {
        ...paymentInput([goodWinner]),
        dealerPlayerId: "ghost",
      }),
    ).toThrow(/valid dealer/u);
    expect(() => settlePayments(defaultPayment, paymentInput([]))).toThrow(/winners/u);
    expect(() => settlePayments(defaultPayment, paymentInput([goodWinner, goodWinner]))).toThrow(
      /distinct existing winners/u,
    );
    expect(() =>
      settlePayments(
        defaultPayment,
        paymentInput([
          { ...goodWinner, playerId: "ghost", breakdown: { ...breakdown, winnerId: "ghost" } },
        ]),
      ),
    ).toThrow(/existing winners/u);
  });

  it("rejects inconsistent scoring and source provenance", () => {
    const breakdown = paymentBreakdown("south", "discard");
    const winner: PaymentSettlementInput["winners"][number] = {
      playerId: "south",
      source: "discard",
      fromPlayerId: "west",
      breakdown,
    };
    for (const invalid of [
      { ...winner, breakdown: { ...breakdown, legalWin: false } },
      { ...winner, breakdown: { ...breakdown, winnerId: "north" } },
      { ...winner, breakdown: { ...breakdown, winSource: "self_draw" as const } },
      { ...winner, breakdown: { ...breakdown, basePoints: 0 } },
      { ...winner, breakdown: { ...breakdown, basePoints: Number.NaN } },
    ]) {
      expect(() => settlePayments(defaultPayment, paymentInput([invalid]))).toThrow(
        /legal winner/u,
      );
    }
    expect(() =>
      settlePayments(defaultPayment, paymentInput([{ ...winner, fromPlayerId: null }])),
    ).toThrow(/provenance/u);
    expect(() =>
      settlePayments(defaultPayment, paymentInput([{ ...winner, fromPlayerId: "ghost" }])),
    ).toThrow(/provenance/u);
    const west = {
      playerId: "west",
      source: "discard" as const,
      fromPlayerId: "east",
      breakdown: paymentBreakdown("west", "discard"),
    };
    expect(() =>
      settlePayments(defaultPayment, paymentInput([{ ...winner, fromPlayerId: "west" }, west])),
    ).toThrow(/provenance/u);
  });

  it("rejects unsafe delta aggregation after individually safe transfers", () => {
    const payment = structuredClone(defaultPayment) as RulesetDefinition["payment"];
    payment.discard.discarderMultiplier = 1;
    payment.discard.otherLoserMultiplier = 1;
    const largeBase = 4_600_000_000_000_000;
    const south = {
      ...paymentBreakdown("south", "discard"),
      basePoints: largeBase,
    };
    const west = {
      ...paymentBreakdown("west", "discard"),
      basePoints: largeBase,
    };
    expect(() =>
      settlePayments(
        payment,
        paymentInput([
          {
            playerId: "south",
            source: "discard",
            fromPlayerId: "east",
            breakdown: south,
          },
          {
            playerId: "west",
            source: "discard",
            fromPlayerId: "east",
            breakdown: west,
          },
        ]),
      ),
    ).toThrow(/safe-integer/u);
  });

  it("rejects comparison and settlement identities that do not match the bound system", () => {
    const nyc = getBundledRuleset("hk_nyc_social_v1");
    const modern = getBundledRuleset("hk_modern_13f_v1");
    const training = getBundledRuleset("training_relaxed_v1");
    expect(() => createHongKongScoringSystem(nyc, training)).toThrow(/comparison/u);
    expect(() => createHongKongScoringSystem(training, modern)).toThrow(/comparison/u);

    const system = createHongKongScoringSystem(nyc);
    const breakdown = {
      ...paymentBreakdown("south", "discard"),
      rulesetHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };
    expect(() =>
      system.settle(
        paymentInput([
          {
            playerId: "south",
            source: "discard",
            fromPlayerId: "west",
            breakdown,
          },
        ]),
      ),
    ).toThrow(/identity/u);
  });
});
