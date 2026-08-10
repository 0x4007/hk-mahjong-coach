import { describe, expect, it } from "vitest";
import { parseTileTypes, type Meld, type TileInstanceId, type TileTypeId } from "@hk-mahjong/core";
import { getBundledRuleset } from "./bundled.js";
import { createHongKongScoringSystem } from "./scoring.js";
import { solveWinningHand, type WinningSolveOptions } from "./solver.js";
import { toCoreGameRules } from "./core-rules.js";

const instances = (notation: string): readonly TileInstanceId[] => {
  const copies = new Map<TileTypeId, number>();
  return parseTileTypes(notation).map((typeId) => {
    const copy = (copies.get(typeId) ?? 0) + 1;
    copies.set(typeId, copy);
    return `${typeId}#${String(copy)}` as TileInstanceId;
  });
};

const defaultOptions = (): WinningSolveOptions => {
  const ruleset = getBundledRuleset("training_relaxed_v1").definition;
  return {
    allowSevenPairs: ruleset.winRules.allowSevenPairs,
    sevenPairsAllowsQuadAsTwoPairs: ruleset.winRules.sevenPairsAllowsQuadAsTwoPairs,
    allowThirteenOrphans: ruleset.winRules.allowThirteenOrphans,
    thirteenOrphansRequireThirteenSidedWait:
      ruleset.patternSemantics.thirteenOrphans.requireThirteenSidedWait,
    allowNineGates: ruleset.winRules.allowNineGates,
    nineGatesDeclaredKongsAllowed: ruleset.patternSemantics.nineGates.declaredKongsAllowed,
  };
};

const concealedKong = (
  id: string,
  tileIds: readonly [TileInstanceId, TileInstanceId, TileInstanceId, TileInstanceId],
): Meld => ({
  id,
  kind: "kong",
  kongKind: "concealed",
  tileIds: [...tileIds],
  exposed: false,
  claimedFrom: null,
  claimedTileId: null,
  createdEventId: `event:${id}`,
});

describe("winning hand solver", () => {
  it("enumerates standard and Seven Pairs interpretations", () => {
    const tileIds = instances("1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m");
    const results = solveWinningHand({
      concealedTileIds: tileIds,
      melds: [],
      winningTileId: tileIds.at(-1)!,
      options: defaultOptions(),
    });

    expect(new Set(results.map(({ form }) => form))).toEqual(new Set(["standard", "seven_pairs"]));
    expect(results.filter(({ form }) => form === "standard").length).toBeGreaterThan(1);
  });

  it("accounts for a declared kong as one standard meld", () => {
    const kongTiles = instances("R R R R") as readonly [
      TileInstanceId,
      TileInstanceId,
      TileInstanceId,
      TileInstanceId,
    ];
    const concealed = instances("1m 2m 3m 1p 2p 3p 1s 2s 3s E E");
    const results = solveWinningHand({
      concealedTileIds: concealed,
      melds: [concealedKong("red-kong", kongTiles)],
      winningTileId: concealed.at(-1)!,
      options: defaultOptions(),
    });

    const standard = results.find(({ form }) => form === "standard");
    expect(standard?.declaredMeldIds).toEqual(["red-kong"]);
    expect(standard?.concealedGroups).toHaveLength(4);
  });

  it("returns no decomposition for an incomplete shape", () => {
    const tileIds = instances("1m 2m 4m 1p 2p 3p 1s 2s 3s R R R E E");
    expect(
      solveWinningHand({
        concealedTileIds: tileIds,
        melds: [],
        winningTileId: tileIds.at(-1)!,
        options: defaultOptions(),
      }),
    ).toEqual([]);
  });

  it("honors the quad-as-two-pairs option", () => {
    const tileIds = instances("1m 1m 1m 1m 2m 2m 3m 3m 4p 4p 5s 5s E E");
    const base = defaultOptions();
    const strict = solveWinningHand({
      concealedTileIds: tileIds,
      melds: [],
      winningTileId: tileIds.at(-1)!,
      options: base,
    });
    const relaxed = solveWinningHand({
      concealedTileIds: tileIds,
      melds: [],
      winningTileId: tileIds.at(-1)!,
      options: { ...base, sevenPairsAllowsQuadAsTwoPairs: true },
    });

    expect(strict.some(({ form }) => form === "seven_pairs")).toBe(false);
    expect(relaxed.some(({ form }) => form === "seven_pairs")).toBe(true);
  });

  it("supports both ordinary and strict thirteen-sided Thirteen Orphans waits", () => {
    const options = defaultOptions();
    const thirteenSided = instances("1m 9m 1p 9p 1s 9s E S W N R G Wh 1m");
    const singleWait = instances("1m 1m 9m 1p 9p 1s 9s E S W N R G Wh");

    expect(
      solveWinningHand({
        concealedTileIds: thirteenSided,
        melds: [],
        winningTileId: thirteenSided.at(-1)!,
        options: { ...options, thirteenOrphansRequireThirteenSidedWait: true },
      }).some(({ form }) => form === "thirteen_orphans"),
    ).toBe(true);
    expect(
      solveWinningHand({
        concealedTileIds: singleWait,
        melds: [],
        winningTileId: singleWait.at(-1)!,
        options,
      }).some(({ form }) => form === "thirteen_orphans"),
    ).toBe(true);
    expect(
      solveWinningHand({
        concealedTileIds: singleWait,
        melds: [],
        winningTileId: singleWait.at(-1)!,
        options: { ...options, thirteenOrphansRequireThirteenSidedWait: true },
      }).some(({ form }) => form === "thirteen_orphans"),
    ).toBe(false);
  });

  it("requires the pure Nine Gates predecessor and respects declared-kong semantics", () => {
    const options = defaultOptions();
    const pure = instances("1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 9m 9m 5m");
    expect(
      solveWinningHand({
        concealedTileIds: pure,
        melds: [],
        winningTileId: pure.at(-1)!,
        options,
      }).some(({ form }) => form === "nine_gates"),
    ).toBe(true);

    const kongTiles = instances("1m 1m 1m 1m") as readonly [
      TileInstanceId,
      TileInstanceId,
      TileInstanceId,
      TileInstanceId,
    ];
    const concealed = instances("2m 3m 4m 5m 6m 7m 8m 9m 9m 9m 5m");
    const input = {
      concealedTileIds: concealed,
      melds: [concealedKong("one-kong", kongTiles)],
      winningTileId: concealed.at(-1)!,
    };
    expect(
      solveWinningHand({
        ...input,
        options,
      }).some(({ form }) => form === "nine_gates"),
    ).toBe(false);
    expect(
      solveWinningHand({
        ...input,
        options: { ...options, nineGatesDeclaredKongsAllowed: true },
      }).some(({ form }) => form === "nine_gates"),
    ).toBe(true);
  });

  it("rejects absent winning tiles, duplicate physical IDs, and bonus tiles", () => {
    const complete = instances("1m 2m 3m 1p 2p 3p 1s 2s 3s R R R E E");
    expect(() =>
      solveWinningHand({
        concealedTileIds: complete,
        melds: [],
        winningTileId: "wind.south#1",
        options: defaultOptions(),
      }),
    ).toThrow(/exact winning tile/u);
    expect(() =>
      solveWinningHand({
        concealedTileIds: [...complete.slice(0, -1), complete[0]!],
        melds: [],
        winningTileId: complete[0]!,
        options: defaultOptions(),
      }),
    ).toThrow(/duplicate physical/u);
    expect(() =>
      solveWinningHand({
        concealedTileIds: ["flower.plum#1"],
        melds: [],
        winningTileId: "flower.plum#1",
        options: defaultOptions(),
      }),
    ).toThrow(/bonus tiles/u);
  });
});

describe("Hong Kong scoring shape authority", () => {
  it("returns grounded legal and incomplete previews", () => {
    const ruleset = getBundledRuleset("training_relaxed_v1");
    const evaluator = createHongKongScoringSystem(ruleset);
    const rules = toCoreGameRules(ruleset);
    const complete = instances("1m 2m 3m 1p 2p 3p 1s 2s 3s R R R E E");
    const incomplete = instances("1m 2m 4m 1p 2p 3p 1s 2s 3s R R R E E");
    const input = (tileIds: readonly TileInstanceId[]) => ({
      rules,
      mode: "guided" as const,
      player: {
        id: "east",
        seat: "east" as const,
        concealedTileIds: tileIds,
        melds: [],
        bonusTileIds: [],
      },
      prevailingWind: "east" as const,
      dealerPlayerId: "east",
      winningTileId: tileIds.at(-1)!,
      winSource: "self_draw" as const,
      fromPlayerId: null,
      replacementReason: null,
      isInitialDeal: false,
      isDealerFirstDiscard: false,
      initialBonusReplacementOccurred: false,
      openingKongOccurred: false,
      firstDiscardCompleted: true,
      callsOccurred: false,
      robbedKongKind: null,
      winningTileWasFinalLiveTile: false,
      discardFollowedFinalLiveDraw: false,
    });

    expect(evaluator.assess(input(complete)).preview).toMatchObject({
      shapeComplete: true,
      legalWin: true,
      reason: "legal",
      winningForm: "standard",
    });
    expect(evaluator.assess(input(incomplete)).preview).toMatchObject({
      shapeComplete: false,
      legalWin: false,
      reason: "shape_incomplete",
      winningForm: null,
    });
  });

  it("supports nonzero-minimum profiles and rejects mismatched identities", () => {
    expect(() => createHongKongScoringSystem(getBundledRuleset("hk_nyc_social_v1"))).not.toThrow();
    const ruleset = getBundledRuleset("training_relaxed_v1");
    const evaluator = createHongKongScoringSystem(ruleset);
    const tiles = instances("1m 2m 3m 1p 2p 3p 1s 2s 3s R R R E E");
    expect(() =>
      evaluator.assess({
        rules: {
          ...toCoreGameRules(ruleset),
          id: "other_rules",
        },
        mode: "guided",
        player: {
          id: "east",
          seat: "east",
          concealedTileIds: tiles,
          melds: [],
          bonusTileIds: [],
        },
        prevailingWind: "east",
        dealerPlayerId: "east",
        winningTileId: tiles.at(-1)!,
        winSource: "self_draw",
        fromPlayerId: null,
        replacementReason: null,
        isInitialDeal: false,
        isDealerFirstDiscard: false,
        initialBonusReplacementOccurred: false,
        openingKongOccurred: false,
        firstDiscardCompleted: true,
        callsOccurred: false,
        robbedKongKind: null,
        winningTileWasFinalLiveTile: false,
        discardFollowedFinalLiveDraw: false,
      }),
    ).toThrow(/identity/u);
  });
});
