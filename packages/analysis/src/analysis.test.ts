import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createGameEngine,
  createTileInventory,
  parseTileTypes,
  tileTypeFromInstanceId,
  type GameEngine,
  type GameState,
  type LegalAction,
  type ObservedPlayer,
  type PlayerObservation,
  type PublicDiscard,
  type PublicMeld,
  type TileInstanceId,
  type TileTypeId,
  type Wind,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  solveWinningHand,
  toCoreGameRules,
  type ResolvedRuleset,
} from "@hk-mahjong/hk-rules";
import {
  STRATEGIC_ACTION_WEIGHTING_VERSION,
  analyzeDiscardCandidates,
  analyzeLegalActions,
  analyzeRelativeRisk,
  createAnalyzer,
  distanceOptionsForRuleset,
  type AnalysisPersonality,
} from "./index.js";
import { STANDARD_TILE_TYPES, distanceToReady, rawDistanceToReady } from "./distance.js";
import { estimateFaanPaths } from "./paths.js";
import { improvingTiles, visibleStandardTileCounts } from "./visibility.js";

const DEFAULT_RULESET = getBundledRuleset("hk_nyc_social_v1");
const DISTANCE_OPTIONS = distanceOptionsForRuleset(DEFAULT_RULESET);
const WINDS: readonly Wind[] = ["east", "south", "west", "north"];

const physicalTiles = (notation: string): readonly TileInstanceId[] => {
  const copies = new Map<TileTypeId, number>();
  return parseTileTypes(notation).map((typeId) => {
    const copy = (copies.get(typeId) ?? 0) + 1;
    copies.set(typeId, copy);
    return `${typeId}#${String(copy)}` as TileInstanceId;
  });
};

const physicalTilesForTypes = (tileTypes: readonly TileTypeId[]): readonly TileInstanceId[] => {
  const copies = new Map<TileTypeId, number>();
  return tileTypes.map((typeId) => {
    const copy = (copies.get(typeId) ?? 0) + 1;
    copies.set(typeId, copy);
    return `${typeId}#${String(copy)}` as TileInstanceId;
  });
};

const discard = (
  id: string,
  tileType: TileTypeId,
  claimedBy: string | null = null,
): PublicDiscard => ({
  id,
  tileType,
  claimedBy,
  winningPlayerIds: [],
});

const meld = (
  id: string,
  kind: PublicMeld["kind"],
  tileTypes: readonly TileTypeId[],
): PublicMeld => ({
  id,
  kind,
  kongKind: kind === "kong" ? "exposed" : null,
  tileTypes,
  exposed: true,
  claimedFrom: "west",
});

type PlayerPatch = Partial<
  Pick<ObservedPlayer, "concealedTileCount" | "melds" | "bonusTiles" | "discards">
>;

interface ObservationFixtureOptions {
  ruleset?: ResolvedRuleset;
  playerPatches?: Readonly<Partial<Record<Wind, PlayerPatch>>>;
  legalTileIds?: readonly TileInstanceId[];
  liveWallCount?: number;
}

const observationFixture = (
  notation: string,
  options: ObservationFixtureOptions = {},
): PlayerObservation => {
  const ruleset = options.ruleset ?? DEFAULT_RULESET;
  const concealedTiles = physicalTiles(notation);
  const players = WINDS.map((seat): ObservedPlayer => {
    const patch = options.playerPatches?.[seat];
    return {
      playerId: seat,
      displayName: seat[0]!.toUpperCase() + seat.slice(1),
      seat,
      score: 500,
      concealedTileCount:
        patch?.concealedTileCount ?? (seat === "east" ? concealedTiles.length : 13),
      melds: patch?.melds ?? [],
      bonusTiles: patch?.bonusTiles ?? [],
      discards: patch?.discards ?? [],
    };
  });
  const legalTileIds = options.legalTileIds ?? concealedTiles;
  return {
    schemaVersion: 1,
    gameId: "game:analysis-fixture",
    branchId: "main",
    practiceBranch: false,
    revision: 7,
    phase: "awaiting_discard",
    ruleset: {
      id: ruleset.definition.id,
      version: ruleset.definition.version,
      hash: ruleset.hash,
      minimumFaan: ruleset.definition.winRules.minimumFaan,
      capFaan: ruleset.definition.winRules.capFaan,
      bonusTilesEnabled: ruleset.definition.tileSet.bonusTilesEnabled,
    },
    viewer: { playerId: "east", seat: "east", score: 500 },
    round: {
      prevailingWind: "east",
      prevailingWindIndex: 0,
      windHandIndex: 0,
      dealerPlayerId: "east",
      handIndex: 0,
      handsCompleted: 0,
      liveWallCount: options.liveWallCount ?? 40,
      replacementDrawsAvailable: options.liveWallCount ?? 40,
      activePlayerId: "east",
      lastDiscard: null,
      progression: null,
    },
    players,
    pending: null,
    result: null,
    private: {
      concealedTiles,
      drawnTileId: concealedTiles.at(-1) ?? null,
      temporaryRestrictions: [],
    },
    legalActions: legalTileIds.map((tileId) => ({
      id: `discard:${tileId}`,
      type: "discard" as const,
      tileId,
    })),
    winAssessment: null,
    claimWinAssessment: null,
  };
};

const engineFixture = (
  seed = "analysis-engine-fixture",
): { engine: GameEngine; state: GameState; observation: PlayerObservation } => {
  const engine = createGameEngine({
    scoringSystem: createHongKongScoringSystem(DEFAULT_RULESET),
  });
  const created = engine.create({
    type: "create_game",
    requestId: `create:${seed}`,
    branchId: "main",
    seed,
    mode: "guided",
    matchLength: "one_wind",
    rules: toCoreGameRules(DEFAULT_RULESET),
    players: [
      { id: "east", displayName: "east", controller: "bot", seat: "east" },
      { id: "south", displayName: "south", controller: "bot", seat: "south" },
      { id: "west", displayName: "west", controller: "bot", seat: "west" },
      { id: "north", displayName: "north", controller: "bot", seat: "north" },
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

const pathById = (
  paths: ReturnType<typeof estimateFaanPaths>,
  id: ReturnType<typeof estimateFaanPaths>[number]["id"],
) => {
  const path = paths.find((candidate) => candidate.id === id);
  if (path === undefined) {
    throw new Error(`Missing path ${id}`);
  }
  return path;
};

const legalPreview = (
  cappedFaan = 3,
): Extract<LegalAction, { type: "declare_win" }>["preview"] => ({
  shapeComplete: true,
  legalWin: true,
  rawFaan: cappedFaan,
  cappedFaan,
  minimumRequired: 3,
  missingFaan: 0,
  appliedRuleIds: [],
  winningForm: "standard",
  reason: "legal",
});

const physicalOfType = (
  observation: PlayerObservation,
  typeId: TileTypeId,
): readonly TileInstanceId[] =>
  observation.private.concealedTiles.filter((tileId) => tileTypeFromInstanceId(tileId) === typeId);

const analysisForType = (
  analyses: ReturnType<typeof analyzeLegalActions>,
  type: LegalAction["type"],
): (typeof analyses)[number] => {
  const analysis = analyses.find((candidate) => candidate.actionType === type);
  if (analysis === undefined) {
    throw new Error(`Missing analysis for ${type}`);
  }
  return analysis;
};

describe("exact distance to ready", () => {
  it("covers standard, declared-meld, Seven Pairs, and Thirteen Orphans shapes", () => {
    const readyStandard = parseTileTypes("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s 9s E");
    expect(rawDistanceToReady(readyStandard, 0, DISTANCE_OPTIONS).standard).toBe(0);
    expect(rawDistanceToReady([...readyStandard, "wind.east"], 0, DISTANCE_OPTIONS).standard).toBe(
      -1,
    );

    expect(
      distanceToReady(parseTileTypes("1m 2m 3m 4p 5p 6p 7s 8s 9s E"), 1, DISTANCE_OPTIONS).standard,
    ).toBe(0);

    const sevenPairs = distanceToReady(
      parseTileTypes("1m 1m 2m 2m 3p 3p 4p 4p 5s 5s E E R"),
      0,
      DISTANCE_OPTIONS,
    );
    expect(sevenPairs.sevenPairs).toBe(0);
    expect(sevenPairs.bestForms).toContain("seven_pairs");

    const orphans = distanceToReady(
      parseTileTypes("1m 9m 1p 9p 1s 9s E S W N R G Wh"),
      0,
      DISTANCE_OPTIONS,
    );
    expect(orphans.thirteenOrphans).toBe(0);
    expect(orphans.bestForms).toContain("thirteen_orphans");
  });

  it("applies the configured quad semantics and disables special hands after a declaration", () => {
    const quads = parseTileTypes("1m 1m 1m 1m 2m 2m 3p 3p 4p 4p 5s 5s E");
    expect(
      rawDistanceToReady(quads, 0, {
        ...DISTANCE_OPTIONS,
        sevenPairsAllowsQuadAsTwoPairs: false,
      }).sevenPairs,
    ).toBe(2);
    expect(
      rawDistanceToReady(quads, 0, {
        ...DISTANCE_OPTIONS,
        sevenPairsAllowsQuadAsTwoPairs: true,
      }).sevenPairs,
    ).toBe(0);

    const declared = distanceToReady(
      parseTileTypes("1m 2m 3m 4p 5p 6p 7s 8s 9s E"),
      1,
      DISTANCE_OPTIONS,
    );
    expect(declared.sevenPairs).toBeNull();
    expect(declared.thirteenOrphans).toBeNull();
  });

  it("rejects malformed arity, bonus tiles, fifth copies, and unbounded inventories", () => {
    expect(() => distanceToReady([], 4, DISTANCE_OPTIONS)).toThrow(/expected 1 or 2/u);
    expect(() =>
      distanceToReady(
        parseTileTypes("1m 1m 1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m"),
        0,
        DISTANCE_OPTIONS,
      ),
    ).toThrow(/five copies/u);
    expect(() =>
      distanceToReady(parseTileTypes("1m 2m 3m 4m 5m 6m 7m 8m 9m E S W F1"), 0, DISTANCE_OPTIONS),
    ).toThrow(/bonus/u);
    expect(() =>
      distanceToReady(createTileInventory(false).map(tileTypeFromInstanceId), 0, DISTANCE_OPTIONS),
    ).toThrow(/expected 13 or 14/u);
  });

  it("agrees with the winning solver on whether random 13-tile hands are ready", () => {
    const indexArbitrary = fc
      .array(fc.integer({ min: 0, max: STANDARD_TILE_TYPES.length - 1 }), {
        minLength: 13,
        maxLength: 13,
      })
      .filter((indices) => {
        const counts = new Map<number, number>();
        for (const index of indices) {
          counts.set(index, (counts.get(index) ?? 0) + 1);
        }
        return [...counts.values()].every((count) => count <= 4);
      });

    fc.assert(
      fc.property(indexArbitrary, (indices) => {
        const types = indices.map((index) => STANDARD_TILE_TYPES[index]!);
        const distance = rawDistanceToReady(types, 0, {
          allowSevenPairs: false,
          sevenPairsAllowsQuadAsTwoPairs: false,
          allowThirteenOrphans: false,
        }).standard;
        const counts = new Map<TileTypeId, number>();
        for (const typeId of types) {
          counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
        }
        const hasWinningDraw = STANDARD_TILE_TYPES.some((drawType) => {
          if ((counts.get(drawType) ?? 0) >= 4) {
            return false;
          }
          const physical = physicalTilesForTypes([...types, drawType]);
          return solveWinningHand({
            concealedTileIds: physical,
            melds: [],
            winningTileId: physical.at(-1)!,
            options: {
              allowSevenPairs: false,
              sevenPairsAllowsQuadAsTwoPairs: false,
              allowThirteenOrphans: false,
              thirteenOrphansRequireThirteenSidedWait: false,
              allowNineGates: false,
              nineGatesDeclaredKongsAllowed: false,
            },
          }).some(({ form }) => form === "standard");
        });
        expect(distance === 0).toBe(hasWinningDraw);
      }),
      { numRuns: 100, seed: 4_004 },
    );
  });
});

describe("visible availability and improving tiles", () => {
  const improvingNotation = "1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E E";

  it("lists only true improvements and retains exhausted nominal types", () => {
    const observation = observationFixture(improvingNotation, {
      playerPatches: {
        south: {
          discards: [
            discard("six-1", "bamboo.6"),
            discard("six-2", "bamboo.6"),
            discard("six-3", "bamboo.6"),
            discard("six-4", "bamboo.6"),
          ],
        },
      },
    });
    const results = improvingTiles(
      parseTileTypes(improvingNotation),
      0,
      observation,
      DISTANCE_OPTIONS,
    );
    expect(results.map(({ tileTypeId }) => tileTypeId)).toEqual(["bamboo.6", "bamboo.9"]);
    expect(results[0]).toMatchObject({
      visibleCopies: 4,
      visibleRemainingCopies: 0,
      exhausted: true,
    });
    expect(results[1]).toMatchObject({
      visibleCopies: 0,
      visibleRemainingCopies: 4,
      exhausted: false,
    });
  });

  it("counts a claimed discard only through its public meld and rejects a corrupt fifth copy", () => {
    const base = observationFixture("5m 1m 2m 3m 1p 2p 3p 1s 2s 3s E E R Wh", {
      playerPatches: {
        south: {
          melds: [meld("red-pung", "pung", ["characters.5", "characters.5", "characters.5"])],
        },
        west: {
          discards: [discard("claimed-five", "characters.5", "south")],
        },
      },
    });
    expect(visibleStandardTileCounts(base).get("characters.5")).toBe(4);

    const corrupt: PlayerObservation = {
      ...base,
      players: base.players.map((player) =>
        player.playerId === "north"
          ? { ...player, discards: [discard("fifth-five", "characters.5")] }
          : player,
      ),
    };
    expect(() => visibleStandardTileCounts(corrupt)).toThrow(/more than four visible/u);
  });

  it("keeps visible remaining copies within zero through four", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4 }), (visibleCopies) => {
        const observation = observationFixture(improvingNotation, {
          playerPatches: {
            south: {
              discards: Array.from({ length: visibleCopies }, (_, index) =>
                discard(`six-${String(index)}`, "bamboo.6"),
              ),
            },
          },
        });
        const six = improvingTiles(
          parseTileTypes(improvingNotation),
          0,
          observation,
          DISTANCE_OPTIONS,
        ).find(({ tileTypeId }) => tileTypeId === "bamboo.6");
        expect(six?.visibleRemainingCopies).toBe(4 - visibleCopies);
      }),
      { numRuns: 25, seed: 4007 },
    );
  });
});

describe("faan paths and relative risk", () => {
  it("does not call ready special or pung shapes secured All Chows", () => {
    const pungNotation = "1m 1m 1m 2m 2m 2m 3p 3p 3p 4s 4s 4s 5s";
    const observation = observationFixture(pungNotation);
    const distance = distanceToReady(parseTileTypes(pungNotation), 0, DISTANCE_OPTIONS);
    const paths = estimateFaanPaths(
      observation,
      parseTileTypes(pungNotation),
      distance,
      DEFAULT_RULESET,
    );
    expect(pathById(paths, "all_chows").status).toBe("speculative");
    expect(pathById(paths, "all_pungs").status).toBe("likely");

    const sevenPairsNotation = "1m 1m 2m 2m 3p 3p 4p 4p 5s 5s E E R";
    const sevenPairsObservation = observationFixture(sevenPairsNotation);
    const sevenPairsPaths = estimateFaanPaths(
      sevenPairsObservation,
      parseTileTypes(sevenPairsNotation),
      distanceToReady(parseTileTypes(sevenPairsNotation), 0, DISTANCE_OPTIONS),
      DEFAULT_RULESET,
    );
    expect(pathById(sevenPairsPaths, "seven_pairs").status).toBe("likely");
  });

  it("keeps discardable honors compatible with Full Flush and exposes strict Nine Gates", () => {
    const flushNotation = "1m 1m 2m 3m 4m 5m 6m 7m 8m 8m 9m 9m E";
    const flushObservation = observationFixture(flushNotation);
    const flushPaths = estimateFaanPaths(
      flushObservation,
      parseTileTypes(flushNotation),
      distanceToReady(parseTileTypes(flushNotation), 0, DISTANCE_OPTIONS),
      DEFAULT_RULESET,
    );
    expect(pathById(flushPaths, "full_flush").status).toBe("likely");

    const gatesNotation = "1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 9m 9m";
    const gatesObservation = observationFixture(gatesNotation);
    const gatesPaths = estimateFaanPaths(
      gatesObservation,
      parseTileTypes(gatesNotation),
      distanceToReady(parseTileTypes(gatesNotation), 0, DISTANCE_OPTIONS),
      DEFAULT_RULESET,
    );
    expect(pathById(gatesPaths, "nine_gates")).toMatchObject({
      status: "likely",
      estimatedFaan: 10,
    });
  });

  it("counts only dragons, seat winds, and prevailing winds as public value", () => {
    const concealed = "1m 2m 3m 1p 2p 3p 1s 2s 3s R";
    const westObservation = observationFixture(concealed, {
      playerPatches: {
        east: {
          concealedTileCount: 10,
          melds: [meld("west-pung", "pung", ["wind.west", "wind.west", "wind.west"])],
        },
      },
    });
    const westPaths = estimateFaanPaths(
      westObservation,
      parseTileTypes(concealed),
      distanceToReady(parseTileTypes(concealed), 1, DISTANCE_OPTIONS),
      DEFAULT_RULESET,
    );
    expect(pathById(westPaths, "dragon_or_wind")).toMatchObject({
      status: "speculative",
      estimatedFaan: 0,
    });

    const eastObservation = observationFixture(concealed, {
      playerPatches: {
        east: {
          concealedTileCount: 10,
          melds: [meld("east-pung", "pung", ["wind.east", "wind.east", "wind.east"])],
        },
      },
    });
    const eastPaths = estimateFaanPaths(
      eastObservation,
      parseTileTypes(concealed),
      distanceToReady(parseTileTypes(concealed), 1, DISTANCE_OPTIONS),
      DEFAULT_RULESET,
    );
    expect(pathById(eastPaths, "dragon_or_wind")).toMatchObject({
      status: "secured",
      estimatedFaan: 2,
    });
  });

  it("uses explicit relative-risk language without claiming guaranteed safety", () => {
    const observation = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E E 5s", {
      liveWallCount: 12,
      playerPatches: {
        south: { discards: [discard("prior-five", "bamboo.5")] },
      },
    });
    const risk = analyzeRelativeRisk(observation, "bamboo.5", DEFAULT_RULESET);
    expect(risk.risk).toBeGreaterThanOrEqual(0);
    expect(risk.risk).toBeLessThanOrEqual(1);
    expect(risk.facts[0]?.summary).toContain("not labeled guaranteed safe");
    expect(risk.facts[0]?.data).toMatchObject({
      priorOpponentDiscardCount: 1,
    });
  });

  it("uses exposed honors and recent discard order as public suit-commitment evidence", () => {
    const committedMelds = [
      meld("bamboo-chow", "chow", ["bamboo.2", "bamboo.3", "bamboo.4"]),
      meld("red-pung", "pung", ["dragon.red", "dragon.red", "dragon.red"]),
    ];
    const baseline = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E 5s 5s", {
      playerPatches: {
        south: { concealedTileCount: 7, melds: committedMelds },
      },
    });
    const patterned = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E 5s 5s", {
      playerPatches: {
        south: {
          concealedTileCount: 7,
          melds: committedMelds,
          discards: [
            discard("recent-character", "characters.2"),
            discard("recent-dot", "dots.6"),
            discard("recent-honor", "wind.west"),
          ],
        },
      },
    });
    const baselineRisk = analyzeRelativeRisk(baseline, "bamboo.5", DEFAULT_RULESET);
    const patternedRisk = analyzeRelativeRisk(patterned, "bamboo.5", DEFAULT_RULESET);

    expect(patternedRisk.risk).toBeGreaterThan(baselineRisk.risk);
    expect(patternedRisk.facts[0]?.data).toMatchObject({
      committedOpponentIds: ["south"],
      honorSupportedCommitmentIds: ["south"],
      recentDiscardPatternOpponentIds: ["south"],
    });
  });
});

describe("deterministic discard analysis", () => {
  it(
    "is invariant to safe input order and deterministic with observation-derived rollouts",
    { timeout: 30_000 },
    () => {
      const { observation } = engineFixture("personality-0");
      const options = {
        personality: "balanced" as const,
        rollout: { iterations: 8, depth: 1 },
      };
      const expected = analyzeDiscardCandidates(observation, DEFAULT_RULESET, options);
      const permuted: PlayerObservation = {
        ...observation,
        players: [...observation.players].reverse(),
        private: {
          ...observation.private,
          concealedTiles: [...observation.private.concealedTiles].reverse(),
        },
        legalActions: [...observation.legalActions].reverse(),
      };
      expect(analyzeDiscardCandidates(observation, DEFAULT_RULESET, options)).toEqual(expected);
      expect(analyzeDiscardCandidates(permuted, DEFAULT_RULESET, options)).toEqual(expected);
    },
  );

  it("gives the three personalities distinct preferences on a fixed live observation", () => {
    const { observation } = engineFixture("personality-0");
    const recommendations = (["fast", "value", "balanced"] as const).map(
      (personality) =>
        analyzeDiscardCandidates(observation, DEFAULT_RULESET, { personality }).recommendedActionId,
    );
    expect(new Set(recommendations).size).toBeGreaterThan(1);
  });

  it(
    "does not change when opponent concealed tiles and hidden wall order change",
    { timeout: 30_000 },
    () => {
      const { engine, state } = engineFixture("hidden-invariance");
      const changed = structuredClone(state);
      const south = changed.players.south!;
      const west = changed.players.west!;
      [south.concealed, west.concealed] = [west.concealed, south.concealed];
      changed.wall.tiles = [...changed.wall.tiles].reverse();

      const originalObservation = engine.observation(state, "east");
      const changedObservation = engine.observation(changed, "east");
      expect(changedObservation).toEqual(originalObservation);
      const options = {
        personality: "balanced" as const,
        rollout: { iterations: 24, depth: 2 },
      };
      const original = analyzeDiscardCandidates(originalObservation, DEFAULT_RULESET, options);
      const hiddenChanged = analyzeDiscardCandidates(changedObservation, DEFAULT_RULESET, options);
      expect(hiddenChanged).toEqual(original);

      const serialized = JSON.stringify(original);
      expect(serialized).not.toMatch(/"seed"/u);
      expect(serialized).not.toMatch(/stateHash/u);
      expect(serialized).not.toMatch(/pending responses/u);
      for (const hiddenId of [
        ...state.players.south!.concealed,
        ...state.players.west!.concealed,
        ...state.players.north!.concealed,
      ]) {
        expect(serialized).not.toContain(hiddenId);
      }
    },
  );

  it("validates ruleset identity and malformed runtime inputs", () => {
    const observation = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E E R");
    const analyzer = createAnalyzer(DEFAULT_RULESET);
    for (const rulesetPatch of [
      { id: "wrong" },
      { version: "9.9.9" },
      { hash: "sha256:wrong" },
      { minimumFaan: 99 },
    ]) {
      expect(() =>
        analyzer.analyzeDistance({
          ...observation,
          ruleset: { ...observation.ruleset, ...rulesetPatch },
        }),
      ).toThrow(/ruleset mismatch/u);
    }

    expect(() =>
      analyzeDiscardCandidates(observation, DEFAULT_RULESET, {
        personality: "reckless" as AnalysisPersonality,
      }),
    ).toThrow(/Unknown analysis personality/u);
    expect(() =>
      analyzeDiscardCandidates(
        {
          ...observation,
          legalActions: [
            observation.legalActions[0]!,
            { ...observation.legalActions[1]!, id: observation.legalActions[0]!.id },
          ],
        },
        DEFAULT_RULESET,
      ),
    ).toThrow(/duplicate legal action IDs/u);

    const bonusObservation = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E E F1");
    expect(() => analyzeDiscardCandidates(bonusObservation, DEFAULT_RULESET)).toThrow(
      /bonus tile/u,
    );
  });

  it("assigns full confidence to a forced discard", () => {
    const full = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s E E R");
    const forced: PlayerObservation = {
      ...full,
      legalActions: full.legalActions.slice(0, 1),
    };
    const result = analyzeDiscardCandidates(forced, DEFAULT_RULESET);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.confidence).toBe(1);
  });
});

describe("strategic legal-action analysis", () => {
  it("compares both self-kong forms against the best ordinary discard", () => {
    const base = observationFixture("1m 1m 1m 1m 2m 3m 4m 5p 6p 7p R", {
      playerPatches: {
        east: {
          concealedTileCount: 11,
          melds: [meld("red-pung", "pung", ["dragon.red", "dragon.red", "dragon.red"])],
        },
      },
      legalTileIds: [],
    });
    const ones = physicalOfType(base, "characters.1");
    const red = physicalOfType(base, "dragon.red")[0]!;
    const ordinaryDiscard = physicalOfType(base, "characters.2")[0]!;
    const legalActions: readonly LegalAction[] = [
      { id: "discard:ordinary", type: "discard", tileId: ordinaryDiscard },
      {
        id: "kong:concealed",
        type: "declare_concealed_kong",
        tileIds: ones,
      },
      {
        id: "kong:added",
        type: "declare_added_kong",
        meldId: "red-pung",
        tileId: red,
      },
    ];
    const observation: PlayerObservation = { ...base, legalActions };
    const analyses = analyzeLegalActions(observation, DEFAULT_RULESET, "balanced");
    const discardAnalysis = analysisForType(analyses, "discard");
    const concealed = analysisForType(analyses, "declare_concealed_kong");
    const added = analysisForType(analyses, "declare_added_kong");

    for (const analysis of analyses) {
      expect(analysis.weightingVersion).toBe(`${STRATEGIC_ACTION_WEIGHTING_VERSION}:balanced`);
      expect(Object.values(analysis.components).every((value) => value >= 0 && value <= 1)).toBe(
        true,
      );
      expect(analysis.facts.map(({ id }) => id)).toEqual(
        [...analysis.facts.map(({ id }) => id)].sort(),
      );
    }
    expect(concealed).toMatchObject({
      baselineActionId: discardAnalysis.actionId,
      scoreDeltaFromBaseline: concealed.totalScore - discardAnalysis.totalScore,
      opensHand: false,
    });
    expect(added).toMatchObject({
      baselineActionId: discardAnalysis.actionId,
      scoreDeltaFromBaseline: added.totalScore - discardAnalysis.totalScore,
      opensHand: false,
      valueFaan: 0,
    });
    expect(concealed.distanceAfterAction).not.toBeNull();
    expect(added.distanceAfterAction).not.toBeNull();
    expect(concealed.visibleImprovingCopies).not.toBeNull();
    expect(added.visibleImprovingCopies).not.toBeNull();
    expect(concealed.relativeRisk).toBeLessThan(added.relativeRisk);
    expect(
      concealed.facts.some(
        ({ data }) =>
          data.weightingVersion === STRATEGIC_ACTION_WEIGHTING_VERSION &&
          typeof data.replacementUncertainty === "number",
      ),
    ).toBe(true);
  });

  it("compares chow, pung, and discard-kong claims with pass and models a forced discard", () => {
    const pendingDiscard = discard("pending-three", "characters.3");
    const base = observationFixture("1m 2m 3m 3m 3m 4p 5p 6p 7s 8s 9s R R", {
      playerPatches: {
        south: { discards: [pendingDiscard] },
      },
      legalTileIds: [],
    });
    const one = physicalOfType(base, "characters.1")[0]!;
    const two = physicalOfType(base, "characters.2")[0]!;
    const threes = physicalOfType(base, "characters.3");
    const legalActions: readonly LegalAction[] = [
      { id: "pass:claim", type: "pass", windowId: "window:claim" },
      {
        id: "claim:chow",
        type: "claim_chow",
        discardId: pendingDiscard.id,
        tileIdsFromHand: [one, two],
      },
      {
        id: "claim:pung",
        type: "claim_pung",
        discardId: pendingDiscard.id,
        tileIdsFromHand: threes.slice(0, 2),
      },
      {
        id: "claim:kong",
        type: "claim_kong",
        discardId: pendingDiscard.id,
        tileIdsFromHand: threes,
      },
      {
        id: "claim:win",
        type: "claim_win",
        windowId: "window:claim",
        source: "discard",
        discardId: pendingDiscard.id,
        tileTypeId: "characters.3",
        meldId: null,
        preview: legalPreview(4),
      },
    ];
    const observation: PlayerObservation = {
      ...base,
      phase: "awaiting_claims",
      round: {
        ...base.round,
        lastDiscard: pendingDiscard,
        activePlayerId: "south",
      },
      pending: {
        kind: "discard_claim",
        windowId: "window:claim",
        sourcePlayerId: "south",
        tileTypeId: "characters.3",
        discardId: pendingDiscard.id,
      },
      legalActions,
      claimWinAssessment: legalPreview(4),
    };
    const analyses = analyzeLegalActions(observation, DEFAULT_RULESET, "balanced");
    const pass = analysisForType(analyses, "pass");
    const chow = analysisForType(analyses, "claim_chow");
    const pung = analysisForType(analyses, "claim_pung");
    const kong = analysisForType(analyses, "claim_kong");
    const win = analysisForType(analyses, "claim_win");

    for (const claim of [chow, pung, kong]) {
      expect(claim.baselineActionId).toBe(pass.actionId);
      expect(claim.scoreDeltaFromBaseline).toBe(claim.totalScore - pass.totalScore);
      expect(claim.opensHand).toBe(true);
      expect(claim.distanceAfterAction).not.toBeNull();
      expect(claim.visibleImprovingCopies).not.toBeNull();
      expect(claim.likelyFaanPaths).not.toHaveLength(0);
      expect(claim.totalScore).toBeLessThan(pass.totalScore);
    }
    for (const claim of [chow, pung]) {
      const legalFact = claim.facts.find(({ kind }) => kind === "legal_rule");
      expect(legalFact?.data.followUpDiscardTileId).toEqual(expect.any(String));
    }
    expect(kong.facts.some(({ data }) => typeof data.replacementUncertainty === "number")).toBe(
      true,
    );
    expect(win).toMatchObject({
      rank: 1,
      baselineActionId: null,
      scoreDeltaFromBaseline: 0,
      distanceAfterAction: null,
      visibleImprovingCopies: null,
      likelyFaanPaths: [],
      relativeRisk: 0,
      valueFaan: 4,
      opensHand: false,
    });

    const permuted: PlayerObservation = {
      ...observation,
      players: [...observation.players].reverse(),
      private: {
        ...observation.private,
        concealedTiles: [...observation.private.concealedTiles].reverse(),
      },
      legalActions: [...observation.legalActions].reverse(),
    };
    expect(analyzeLegalActions(permuted, DEFAULT_RULESET, "balanced")).toEqual(analyses);
  });

  it("projects a claimed value pung into secured faan paths", () => {
    const pendingDiscard = discard("pending-red", "dragon.red");
    const base = observationFixture("R R 1s 2s 3s 4s 5s 6s 7s 8s 9s E E", {
      playerPatches: {
        south: { discards: [pendingDiscard] },
      },
      legalTileIds: [],
    });
    const reds = physicalOfType(base, "dragon.red");
    const legalActions: readonly LegalAction[] = [
      { id: "pass:red", type: "pass", windowId: "window:red" },
      {
        id: "claim:red-pung",
        type: "claim_pung",
        discardId: pendingDiscard.id,
        tileIdsFromHand: reds,
      },
    ];
    const observation: PlayerObservation = {
      ...base,
      phase: "awaiting_claims",
      pending: {
        kind: "discard_claim",
        windowId: "window:red",
        sourcePlayerId: "south",
        tileTypeId: "dragon.red",
        discardId: pendingDiscard.id,
      },
      legalActions,
    };
    const pung = analysisForType(
      analyzeLegalActions(observation, DEFAULT_RULESET, "value"),
      "claim_pung",
    );
    expect(pung.valueFaan).toBe(1);
    expect(pathById(pung.likelyFaanPaths, "dragon_or_wind")).toMatchObject({
      status: "secured",
      estimatedFaan: 1,
    });
  });

  it("covers terminal progression actions and canonical physical-tile ties", () => {
    const base = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s 9s E E", {
      legalTileIds: [],
    });
    const winActions: readonly LegalAction[] = [
      {
        id: "win:self",
        type: "declare_win",
        source: "self_draw",
        preview: legalPreview(3),
      },
      {
        id: "next:hand",
        type: "start_next_hand",
        completedHandId: "hand:complete",
      },
    ];
    const terminal = analyzeLegalActions(
      { ...base, legalActions: winActions },
      DEFAULT_RULESET,
      "fast",
    );
    expect(terminal.map(({ actionType }) => actionType)).toEqual([
      "declare_win",
      "start_next_hand",
    ]);
    for (const action of terminal) {
      expect(action).toMatchObject({
        baselineActionId: null,
        scoreDeltaFromBaseline: 0,
        distanceAfterAction: null,
        visibleImprovingCopies: null,
        likelyFaanPaths: [],
        relativeRisk: 0,
        opensHand: false,
      });
    }

    const eastTiles = physicalOfType(base, "wind.east");
    const tiedActions: readonly LegalAction[] = [...eastTiles]
      .reverse()
      .map((tileId) => ({ id: `discard:${tileId}`, type: "discard", tileId }));
    const tied = analyzeLegalActions(
      { ...base, legalActions: tiedActions },
      DEFAULT_RULESET,
      "balanced",
    );
    expect(tied.map(({ actionId }) => actionId)).toEqual(
      eastTiles.map((tileId) => `discard:${tileId}`),
    );
  });

  it("fails closed for missing baselines, missing claim context, and bad added-kong provenance", () => {
    const pendingDiscard = discard("pending-three", "characters.3");
    const claimBase = observationFixture("1m 2m 3m 3m 4p 5p 6p 7s 8s 9s R R E", {
      playerPatches: {
        south: { discards: [pendingDiscard] },
      },
      legalTileIds: [],
    });
    const claim: LegalAction = {
      id: "claim:chow",
      type: "claim_chow",
      discardId: pendingDiscard.id,
      tileIdsFromHand: [
        physicalOfType(claimBase, "characters.1")[0]!,
        physicalOfType(claimBase, "characters.2")[0]!,
      ],
    };
    const withPending: PlayerObservation = {
      ...claimBase,
      phase: "awaiting_claims",
      pending: {
        kind: "discard_claim",
        windowId: "window:claim",
        sourcePlayerId: "south",
        tileTypeId: "characters.3",
        discardId: pendingDiscard.id,
      },
      legalActions: [claim],
    };
    expect(() => analyzeLegalActions(withPending, DEFAULT_RULESET, "balanced")).toThrow(
      /exactly one emitted pass baseline/u,
    );
    expect(() =>
      analyzeLegalActions(
        {
          ...withPending,
          pending: null,
          legalActions: [{ id: "pass:claim", type: "pass", windowId: "window:claim" }, claim],
        },
        DEFAULT_RULESET,
        "balanced",
      ),
    ).toThrow(/public pending discard/u);

    const selfBase = observationFixture("1m 2m 3m 4m 5m 6m 1p 2p 3p 7s 8s 9s E E", {
      legalTileIds: [],
    });
    const east = physicalOfType(selfBase, "wind.east")[0]!;
    expect(() =>
      analyzeLegalActions(
        {
          ...selfBase,
          legalActions: [
            { id: "discard:east", type: "discard", tileId: east },
            {
              id: "kong:missing-meld",
              type: "declare_added_kong",
              meldId: "missing",
              tileId: east,
            },
          ],
        },
        DEFAULT_RULESET,
        "balanced",
      ),
    ).toThrow(/matching public pung/u);
  });
});
