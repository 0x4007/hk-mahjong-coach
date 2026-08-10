import { describe, expect, it } from "vitest";
import {
  assertStateInvariants,
  assertUniqueActionIds,
  computeStateHash,
  createGameEngine,
  createTileInventory,
  getTileDefinition,
  playerAfter,
  projectPublicScoringResult,
  reduceGameEvent,
  replayEvents,
  tileTypeFromInstanceId,
  type CreateGameCommand,
  type GameState,
  type HandWonEvent,
  type LegalAction,
  type Meld,
  type TileInstanceId,
  type TileDiscardedEvent,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";
import { buildWallFixture } from "./wall.js";

const RULESET = getBundledRuleset("training_relaxed_v1");
const STANDARD_RULESET = getBundledRuleset("hk_nyc_social_v1");
const PLAYERS: CreateGameCommand["players"] = [
  { id: "east", displayName: "East", controller: "human", seat: "east" },
  { id: "south", displayName: "South", controller: "bot", seat: "south" },
  { id: "west", displayName: "West", controller: "bot", seat: "west" },
  { id: "north", displayName: "North", controller: "bot", seat: "north" },
];

const createState = (wallOrder?: readonly TileInstanceId[]): GameState => {
  const engine = createGameEngine({
    scoringSystem: createHongKongScoringSystem(RULESET),
    ...(wallOrder === undefined ? {} : { wallProvider: () => wallOrder }),
  });
  const result = engine.create({
    type: "create_game",
    requestId: "invariants:create",
    branchId: "main",
    seed: "invariants",
    mode: "guided",
    matchLength: "one_wind",
    rules: toCoreGameRules(RULESET),
    players: PLAYERS,
  });
  if (!result.accepted) {
    throw new Error(result.error.message);
  }
  return result.state;
};

const rehash = (state: GameState): void => {
  state.stateHash = computeStateHash(state);
};

const expectMutationFailure = (
  base: GameState,
  mutate: (state: GameState) => void,
  message: RegExp,
): void => {
  const state = structuredClone(base);
  mutate(state);
  rehash(state);
  expect(() => assertStateInvariants(state)).toThrow(new RegExp(message.source, "iu"));
};

const removeConcealed = (state: GameState, tileIds: readonly TileInstanceId[]): void => {
  const player = state.players[state.hand.activePlayerId]!;
  player.concealed = player.concealed.filter((tileId) => !tileIds.includes(tileId));
};

const withoutKey = <Value>(
  record: Readonly<Partial<Record<string, Value>>>,
  omittedKey: string,
): Partial<Record<string, Value>> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== omittedKey));

const initialWinningWall = (): readonly TileInstanceId[] => {
  const east: TileInstanceId[] = [
    "characters.1#1",
    "characters.2#1",
    "characters.3#1",
    "dots.1#1",
    "dots.2#1",
    "dots.3#1",
    "bamboo.1#1",
    "bamboo.2#1",
    "bamboo.3#1",
    "dragon.red#1",
    "dragon.red#2",
    "dragon.red#3",
    "wind.east#1",
    "wind.east#2",
  ];
  const available = createTileInventory(true).filter(
    (tileId) => !east.includes(tileId) && !getTileDefinition(tileTypeFromInstanceId(tileId)).bonus,
  );
  const south = available.slice(0, 13);
  const west = available.slice(13, 26);
  const north = available.slice(26, 39);
  const liveDraws: TileInstanceId[] = [];
  for (let index = 0; index < 13; index += 1) {
    liveDraws.push(east[index]!, south[index]!, west[index]!, north[index]!);
  }
  liveDraws.push(east[13]!);
  return buildWallFixture({
    id: "invariant_scored_win_v1",
    bonusTilesEnabled: true,
    liveDraws,
    replacementDraws: [],
  });
};

const discardWaitWall = (
  id: string,
  south: readonly TileInstanceId[],
  winningDiscard: TileInstanceId,
): readonly TileInstanceId[] => {
  if (south.length !== 13) {
    throw new Error("A discard-wait fixture requires thirteen South tiles");
  }
  const reserved = new Set<TileInstanceId>([...south, winningDiscard]);
  const available = createTileInventory(true).filter(
    (tileId) => !reserved.has(tileId) && !getTileDefinition(tileTypeFromInstanceId(tileId)).bonus,
  );
  const east = [...available.slice(0, 13), winningDiscard];
  const west = available.slice(13, 26);
  const north = available.slice(26, 39);
  const liveDraws: TileInstanceId[] = [];
  for (let index = 0; index < 13; index += 1) {
    liveDraws.push(east[index]!, south[index]!, west[index]!, north[index]!);
  }
  liveDraws.push(east[13]!);
  return buildWallFixture({
    id,
    bonusTilesEnabled: true,
    liveDraws,
    replacementDraws: [],
  });
};

const discardWinningWall = (): readonly TileInstanceId[] =>
  discardWaitWall(
    "invariant_discard_win_v1",
    [
      "characters.1#1",
      "characters.2#1",
      "characters.3#1",
      "dots.1#1",
      "dots.2#1",
      "dots.3#1",
      "bamboo.1#1",
      "bamboo.2#1",
      "bamboo.3#1",
      "dragon.red#1",
      "dragon.red#2",
      "dragon.red#3",
      "wind.east#1",
    ],
    "wind.east#2",
  );

const laterDiscardWaitWall = (
  id: string,
  south: readonly TileInstanceId[],
  winningDiscard: TileInstanceId,
): readonly TileInstanceId[] => {
  if (south.length !== 13) {
    throw new Error("A later-discard fixture requires thirteen South tiles");
  }
  const eastInitialDiscard: TileInstanceId = "wind.north#1";
  const southTransientDraw: TileInstanceId = "wind.west#1";
  const reserved = new Set<TileInstanceId>([
    ...south,
    winningDiscard,
    eastInitialDiscard,
    southTransientDraw,
  ]);
  const available = createTileInventory(true).filter(
    (tileId) => !reserved.has(tileId) && !getTileDefinition(tileTypeFromInstanceId(tileId)).bonus,
  );
  const east = [...available.slice(0, 13), eastInitialDiscard];
  const west = available.slice(13, 26);
  const north = available.slice(26, 39);
  const liveDraws: TileInstanceId[] = [];
  for (let index = 0; index < 13; index += 1) {
    liveDraws.push(east[index]!, south[index]!, west[index]!, north[index]!);
  }
  liveDraws.push(east[13]!, southTransientDraw, winningDiscard);
  return buildWallFixture({
    id,
    bonusTilesEnabled: true,
    liveDraws,
    replacementDraws: [],
  });
};

describe("state invariant corruption guards", () => {
  it("rejects player, seat, dealer, wind, and hand-progression corruption", () => {
    const base = createState();
    const cases: readonly [(state: GameState) => void, RegExp][] = [
      [
        (state) => {
          state.players.south!.id = "east";
        },
        /four distinct players/u,
      ],
      [
        (state) => {
          state.players.south!.seat = "east";
        },
        /assign East, South, West, and North/u,
      ],
      [
        (state) => {
          state.hand.activePlayerId = "missing";
        },
        /active player must exist/u,
      ],
      [
        (state) => {
          state.match.dealerPlayerId = "south";
          state.hand.dealerPlayerId = "south";
        },
        /dealer must hold the East seat/u,
      ],
      [
        (state) => {
          state.hand.dealerPlayerId = "south";
        },
        /dealer must hold the East seat/u,
      ],
      [
        (state) => {
          state.match.effectivePrevailingWinds = ["east", "south"];
        },
        /wind progression is invalid/u,
      ],
      [
        (state) => {
          state.match.prevailingWindIndex = -1;
        },
        /wind progression is invalid/u,
      ],
      [
        (state) => {
          state.match.prevailingWindIndex = 1;
        },
        /wind progression is invalid/u,
      ],
      [
        (state) => {
          state.match.prevailingWind = "south";
        },
        /wind progression is invalid/u,
      ],
      [
        (state) => {
          state.match.windHandIndex = -1;
        },
        /wind progression is invalid/u,
      ],
      [
        (state) => {
          state.match.windHandIndex = 4;
        },
        /wind progression is invalid/u,
      ],
      [
        (state) => {
          state.match.handIndex = -1;
        },
        /hand progression is invalid/u,
      ],
      [
        (state) => {
          state.match.handsCompleted = 1;
        },
        /hand progression is invalid/u,
      ],
      [
        (state) => {
          state.hand.id = "hand:wrong";
        },
        /hand progression is invalid/u,
      ],
      [
        (state) => {
          state.hand.seed = "wrong";
        },
        /hand progression is invalid/u,
      ],
    ];
    for (const [mutate, message] of cases) {
      expectMutationFailure(base, mutate, message);
    }
  });

  it("rejects every wall-boundary, inventory, and conservation failure mode", () => {
    const base = createState();
    const wallLength = base.wall.tiles.length;
    const boundaryCases: readonly ((state: GameState) => void)[] = [
      (state) => {
        state.wall.liveIndex = -1;
      },
      (state) => {
        state.wall.liveIndex = wallLength + 1;
      },
      (state) => {
        state.wall.replacementIndex = -2;
      },
      (state) => {
        state.wall.replacementIndex = wallLength;
      },
      (state) => {
        state.wall.liveIndex = state.wall.replacementIndex + 2;
      },
    ];
    for (const mutate of boundaryCases) {
      expectMutationFailure(base, mutate, /wall draw boundaries are invalid/u);
    }
    expectMutationFailure(
      base,
      (state) => {
        state.wall.tiles = state.wall.tiles.slice(1);
      },
      /persisted wall order/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        state.wall.tiles = [...state.wall.tiles.slice(1), state.wall.tiles[1]!];
      },
      /persisted wall order/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        const first = state.wall.tiles[0]!;
        state.wall.tiles = ["characters.1#99" as TileInstanceId, ...state.wall.tiles.slice(1)];
        expect(first).not.toBe(state.wall.tiles[0]);
      },
      /persisted wall order/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        state.hand.winningTileZone.push(state.wall.tiles[state.wall.liveIndex]!);
      },
      /exactly one authoritative zone/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        state.players.east!.concealed.pop();
      },
      /exactly one authoritative zone/u,
    );
  });

  it("rejects bonus placement, malformed melds, hand counts, and score drift", () => {
    const bonusWall = buildWallFixture({
      id: "invariant_bonus_v1",
      bonusTilesEnabled: true,
      liveDraws: ["flower.plum#1"],
      replacementDraws: ["characters.9#4"],
    });
    const bonusState = createState(bonusWall);
    const bonusOwner = Object.values(bonusState.players).find(({ bonusTiles }) =>
      bonusTiles.includes("flower.plum#1"),
    );
    if (bonusOwner === undefined) {
      throw new Error("Expected the pinned exposed bonus tile");
    }
    expectMutationFailure(
      bonusState,
      (state) => {
        const owner = state.players[bonusOwner.id]!;
        const standard = owner.concealed[0]!;
        owner.bonusTiles = owner.bonusTiles.filter((tileId) => tileId !== "flower.plum#1");
        owner.concealed[0] = "flower.plum#1";
        state.hand.winningTileZone.push(standard);
      },
      /cannot remain concealed/u,
    );
    expectMutationFailure(
      bonusState,
      (state) => {
        const owner = state.players[bonusOwner.id]!;
        const standard = owner.concealed.shift()!;
        owner.bonusTiles = owner.bonusTiles.filter((tileId) => tileId !== "flower.plum#1");
        owner.bonusTiles.push(standard);
        state.hand.winningTileZone.push("flower.plum#1");
      },
      /cannot enter the bonus zone/u,
    );
    expectMutationFailure(
      bonusState,
      (state) => {
        const owner = state.players[bonusOwner.id]!;
        const standards = owner.concealed.splice(0, 2);
        owner.bonusTiles = owner.bonusTiles.filter((tileId) => tileId !== "flower.plum#1");
        owner.melds.push({
          id: "meld:bonus",
          kind: "pung",
          kongKind: null,
          tileIds: ["flower.plum#1", ...standards],
          exposed: true,
          claimedFrom: "south",
          claimedTileId: "flower.plum#1",
          createdEventId: state.lastEventId!,
        });
      },
      /contains a bonus tile/u,
    );

    const base = createState();
    expectMutationFailure(
      base,
      (state) => {
        const player = state.players[state.hand.activePlayerId]!;
        const moved = player.concealed.slice(0, 3);
        removeConcealed(state, moved);
        player.melds.push({
          id: "meld:bad-size",
          kind: "pung",
          kongKind: null,
          tileIds: moved.slice(0, 2),
          exposed: true,
          claimedFrom: "south",
          claimedTileId: moved[0]!,
          createdEventId: state.lastEventId!,
        });
        state.hand.winningTileZone.push(moved[2]!);
      },
      /invalid physical tile count/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        const player = state.players[state.hand.activePlayerId]!;
        const first = player.concealed[0]!;
        const second = player.concealed.find(
          (tileId) => tileTypeFromInstanceId(tileId) !== tileTypeFromInstanceId(first),
        )!;
        const third = player.concealed.find((tileId) => tileId !== first && tileId !== second)!;
        const moved = [first, second, third];
        removeConcealed(state, moved);
        const meld: Meld = {
          id: "meld:mixed-pung",
          kind: "pung",
          kongKind: null,
          tileIds: moved,
          exposed: true,
          claimedFrom: "south",
          claimedTileId: first,
          createdEventId: state.lastEventId!,
        };
        player.melds.push(meld);
      },
      /does not contain one tile type/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        const player = state.players[state.hand.activePlayerId]!;
        const moved = player.concealed.slice(0, 3);
        removeConcealed(state, moved);
        player.melds.push({
          id: "meld:invalid-chow",
          kind: "chow",
          kongKind: null,
          tileIds: moved,
          exposed: true,
          claimedFrom: "south",
          claimedTileId: moved[0]!,
          createdEventId: state.lastEventId!,
        });
      },
      /not a valid chow/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        let candidate:
          | {
              player: (typeof state.players)[string];
              tiles: TileInstanceId[];
            }
          | undefined;
        for (const player of Object.values(state.players)) {
          const groups = new Map<string, TileInstanceId[]>();
          for (const tileId of player.concealed) {
            const typeId = tileTypeFromInstanceId(tileId);
            const group = groups.get(typeId) ?? [];
            group.push(tileId);
            groups.set(typeId, group);
          }
          const tiles = [...groups.values()].find((group) => group.length >= 3);
          if (tiles !== undefined) {
            candidate = { player, tiles: tiles.slice(0, 3) };
            break;
          }
        }
        if (candidate === undefined) {
          throw new Error("Expected a triple in the deterministic invariant hand");
        }
        candidate.player.concealed = candidate.player.concealed.filter(
          (tileId) => !candidate.tiles.includes(tileId),
        );
        candidate.player.melds.push({
          id: "meld:bad-kong-tag",
          kind: "pung",
          kongKind: "added",
          tileIds: candidate.tiles,
          exposed: true,
          claimedFrom: "south",
          claimedTileId: candidate.tiles[0]!,
          createdEventId: state.lastEventId!,
        });
      },
      /inconsistent kong visibility/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        const removed = state.players.east!.concealed.pop()!;
        state.hand.winningTileZone.push(removed);
      },
      /invalid ready concealed count/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        state.players.east!.score += 1;
      },
      /scores must sum/u,
    );
    expectMutationFailure(
      base,
      (state) => {
        const original = state.players.east!.concealed[0]!;
        state.players.east!.concealed[0] = "characters.1#99" as TileInstanceId;
        expect(original).not.toBe(state.players.east!.concealed[0]);
      },
      /missing a physical tile/u,
    );
  });

  it("rejects phase, pending-window, request, revision, and hash corruption", () => {
    const engine = createGameEngine({
      scoringSystem: createHongKongScoringSystem(RULESET),
    });
    const created = engine.create({
      type: "create_game",
      requestId: "pending:create",
      branchId: "main",
      seed: "pending",
      mode: "guided",
      matchLength: "one_wind",
      rules: toCoreGameRules(RULESET),
      players: PLAYERS,
    });
    if (!created.accepted) {
      throw new Error(created.error.message);
    }
    const discard = engine
      .legalActions(created.state, "east")
      .find(
        (action): action is Extract<LegalAction, { type: "discard" }> =>
          action.type === "discard" && action.tileId === created.state.hand.drawnTileId,
      );
    if (discard === undefined) {
      throw new Error("Expected a discard action");
    }
    const discarded = engine.decide(created.state, {
      type: "submit_action",
      gameId: created.state.gameId,
      branchId: created.state.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "pending:discard",
      actionId: discard.id,
    });
    if (!discarded.accepted) {
      throw new Error(discarded.error.message);
    }
    const pending = discarded.state;

    const discardRecord = pending.players.east!.discards[0]!;
    expectMutationFailure(
      pending,
      (state) => {
        const discard = state.players.east!.discards[0]!;
        discard.claimedBy = "south";
        discard.claimMeldId = "meld:fake";
        discard.winningPlayerIds = ["west"];
        state.hand.winningTileZone.push(discard.tileId);
      },
      /inconsistent claim disposition/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        const discard = state.players.east!.discards[0]!;
        discard.winningPlayerIds = ["south", "south"];
        state.hand.winningTileZone.push(discard.tileId);
      },
      /inconsistent claim disposition/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        const discard = state.players.east!.discards[0]!;
        discard.winningPlayerIds = ["missing"];
        state.hand.winningTileZone.push(discard.tileId);
      },
      /inconsistent claim disposition/u,
    );
    expect(discardRecord.claimedBy).toBeNull();

    expectMutationFailure(
      pending,
      (state) => {
        const removed = state.players.south!.concealed.pop()!;
        state.hand.winningTileZone.push(removed);
      },
      /invalid claim-window concealed count/u,
    );
    expectMutationFailure(
      created.state,
      (state) => {
        state.phase = "awaiting_kong_robbery";
        const removed = state.players.south!.concealed.pop()!;
        state.hand.winningTileZone.push(removed);
      },
      /invalid robbery-window concealed count/u,
    );
    expectMutationFailure(
      created.state,
      (state) => {
        state.phase = "drawing_replacement";
        const eastRemoved = state.players.east!.concealed.pop()!;
        const southRemoved = state.players.south!.concealed.pop()!;
        state.hand.winningTileZone.push(eastRemoved, southRemoved);
      },
      /invalid pre-replacement concealed count/u,
    );

    expectMutationFailure(
      pending,
      (state) => {
        state.phase = "drawing_replacement";
      },
      /phase and pending\/result state disagree|pending window requires/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        state.pending = null;
      },
      /phase and pending\/result state disagree/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        state.pending!.eligiblePlayerIds[0] = "east";
      },
      /distinct eligible players/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        const playerId = state.pending!.eligiblePlayerIds[0]!;
        state.pending!.optionsByPlayer = Object.fromEntries(
          Object.entries(state.pending!.optionsByPlayer).filter(([id]) => id !== playerId),
        );
      },
      /exactly one pass option/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        const playerId = state.pending!.eligiblePlayerIds[0]!;
        state.pending!.responses[playerId] = {
          playerId,
          action: { id: "not-emitted", type: "pass", windowId: state.pending!.id },
        };
      },
      /was not an emitted option/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        state.processedRequestIds.push(state.processedRequestIds[0]!);
      },
      /request IDs must remain unique/u,
    );
    expectMutationFailure(
      pending,
      (state) => {
        state.lastEventId = "event:wrong";
      },
      /revision and last event ID disagree/u,
    );

    const wrongHash = structuredClone(pending);
    wrongHash.stateHash = "sha256:wrong";
    expect(() => assertStateInvariants(wrongHash)).toThrow(/state hash/u);

    expect(() =>
      assertUniqueActionIds([
        { id: "same", type: "pass", windowId: "one" },
        { id: "same", type: "pass", windowId: "two" },
      ]),
    ).toThrow(/unique/u);
    expect(playerAfter(created.state, "east")).toBe("south");
    expect(() => playerAfter(created.state, "missing")).toThrow(/Unknown player/u);
    const missingSeat = structuredClone(created.state);
    missingSeat.players.south!.seat = "east";
    expect(() => playerAfter(missingSeat, "east")).toThrow(/No player occupies/u);
  });

  it("rejects corrupted persisted claim-window scoring and emitted win actions", () => {
    const wall = discardWinningWall();
    const engine = createGameEngine({
      scoringSystem: createHongKongScoringSystem(RULESET),
      wallProvider: () => wall,
    });
    const before = createState(wall);
    const discard = engine
      .legalActions(before, "east")
      .find(
        (action): action is Extract<LegalAction, { type: "discard" }> =>
          action.type === "discard" && action.tileId === before.hand.drawnTileId,
      );
    if (discard === undefined) {
      throw new Error("Expected the pinned winning discard");
    }
    const discarded = engine.decide(before, {
      type: "submit_action",
      gameId: before.gameId,
      branchId: before.branchId,
      playerId: "east",
      expectedRevision: before.revision,
      requestId: "invariants:scored-discard",
      actionId: discard.id,
    });
    if (!discarded.accepted) {
      throw new Error(discarded.error.message);
    }
    const persisted = discarded.events.find(
      (event): event is TileDiscardedEvent => event.type === "tile_discarded",
    );
    if (persisted === undefined) {
      throw new Error("Expected a persisted discard event");
    }
    const winnerId = persisted.eligiblePlayerIds.find(
      (playerId) => persisted.winAssessmentsByPlayer[playerId]?.breakdown !== null,
    );
    const incompleteId = persisted.eligiblePlayerIds.find(
      (playerId) => persisted.winAssessmentsByPlayer[playerId]?.breakdown === null,
    );
    if (winnerId === undefined || incompleteId === undefined) {
      throw new Error("Expected complete and incomplete claim assessments");
    }
    expect(persisted.optionsByPlayer[winnerId]?.some(({ type }) => type === "claim_win")).toBe(
      true,
    );

    const rejects = (mutate: (event: TileDiscardedEvent) => void, message: RegExp): void => {
      const event = structuredClone(persisted);
      mutate(event);
      expect(() => reduceGameEvent(before, event)).toThrow(message);
    };

    rejects((event) => {
      event.eligiblePlayerIds = [
        event.eligiblePlayerIds[0]!,
        event.eligiblePlayerIds[0]!,
        ...event.eligiblePlayerIds.slice(2),
      ];
    }, /scoring keys do not match eligible players/u);
    rejects((event) => {
      event.winAssessmentsByPlayer = {
        ...event.winAssessmentsByPlayer,
        east: structuredClone(event.winAssessmentsByPlayer[winnerId]!),
      };
    }, /scoring keys do not match eligible players/u);
    rejects((event) => {
      event.optionsByPlayer = {
        ...event.optionsByPlayer,
        east: structuredClone(event.optionsByPlayer[incompleteId]!),
      };
    }, /scoring keys do not match eligible players/u);
    rejects((event) => {
      const replaced = event.eligiblePlayerIds[0]!;
      const replacementOptions = event.optionsByPlayer[replaced]!;
      const replacementAssessment = event.winAssessmentsByPlayer[replaced]!;
      const options = withoutKey(event.optionsByPlayer, replaced);
      const assessments = withoutKey(event.winAssessmentsByPlayer, replaced);
      options.missing = replacementOptions;
      assessments.missing = replacementAssessment;
      event.eligiblePlayerIds = ["missing", ...event.eligiblePlayerIds.slice(1)];
      event.optionsByPlayer = options;
      event.winAssessmentsByPlayer = assessments;
    }, /references unknown player/u);
    rejects((event) => {
      event.winAssessmentsByPlayer = withoutKey(event.winAssessmentsByPlayer, incompleteId);
    }, /omits options or scoring/u);
    rejects((event) => {
      event.optionsByPlayer = withoutKey(event.optionsByPlayer, incompleteId);
    }, /omits options or scoring/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[incompleteId]!.preview.shapeComplete = true;
    }, /incomplete scoring assessment has an invalid preview/iu);
    rejects((event) => {
      event.winAssessmentsByPlayer[incompleteId]!.preview.legalWin = true;
    }, /incomplete scoring assessment has an invalid preview/iu);
    rejects((event) => {
      event.winAssessmentsByPlayer[incompleteId]!.preview.winningForm = "standard";
    }, /incomplete scoring assessment has an invalid preview/iu);
    rejects((event) => {
      event.winAssessmentsByPlayer[incompleteId]!.preview.reason = "legal";
    }, /incomplete scoring assessment has an invalid preview/iu);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.rulesetId = "wrong";
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.rulesetVersion = "wrong";
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.winnerId = "west";
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.winningTileId = "characters.9#4";
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.winSource = "robbing_kong";
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.rawFaan = Number.POSITIVE_INFINITY;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.cappedFaan = Number.POSITIVE_INFINITY;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.minimumRequired = Number.POSITIVE_INFINITY;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.missingFaan = Number.POSITIVE_INFINITY;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.basePoints = Number.POSITIVE_INFINITY;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.cappedFaan = -1;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.breakdown!.legalWin = false;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winAssessmentsByPlayer[winnerId]!.preview.rawFaan += 1;
    }, /preview does not match/u);
    rejects((event) => {
      event.optionsByPlayer = {
        ...event.optionsByPlayer,
        [winnerId]: event.optionsByPlayer[winnerId]!.filter(({ type }) => type !== "claim_win"),
      };
    }, /win action disagrees with scoring/u);
    rejects((event) => {
      event.optionsByPlayer = {
        ...event.optionsByPlayer,
        [winnerId]: event.optionsByPlayer[winnerId]!.map((action) =>
          action.type === "claim_win"
            ? {
                ...action,
                preview: {
                  ...action.preview,
                  rawFaan: action.preview.rawFaan + 1,
                },
              }
            : action,
        ),
      };
    }, /win action disagrees with scoring/u);
    rejects((event) => {
      const winnerAction = event.optionsByPlayer[winnerId]!.find(
        (action) => action.type === "claim_win",
      );
      if (winnerAction === undefined) {
        throw new Error("Expected the winner's emitted action");
      }
      event.optionsByPlayer = {
        ...event.optionsByPlayer,
        [incompleteId]: [
          ...event.optionsByPlayer[incompleteId]!,
          {
            ...structuredClone(winnerAction),
            id: `${winnerAction.id}:fabricated`,
          },
        ],
      };
    }, /win action disagrees with scoring/u);

    const closedWindow = engine.decide(discarded.state, {
      type: "submit_action",
      gameId: discarded.state.gameId,
      branchId: discarded.state.branchId,
      playerId: winnerId,
      expectedRevision: discarded.state.revision,
      requestId: "invariants:closed-claim-window",
      actionId: "claim:another-window:fabricated",
    });
    expect(closedWindow).toMatchObject({
      accepted: false,
      error: { code: "claim_window_closed" },
    });

    const missingAssessmentState = structuredClone(discarded.state);
    missingAssessmentState.pending!.winAssessmentsByPlayer = withoutKey(
      missingAssessmentState.pending!.winAssessmentsByPlayer,
      winnerId,
    );
    expect(engine.observation(missingAssessmentState, winnerId).claimWinAssessment).toBeNull();
  });

  it("rejects corrupted persisted terminal scoring, payments, and score deltas", () => {
    const wall = initialWinningWall();
    const engine = createGameEngine({
      scoringSystem: createHongKongScoringSystem(RULESET),
      wallProvider: () => wall,
    });
    const before = createState(wall);
    const win = engine
      .legalActions(before, "east")
      .find(
        (action): action is Extract<LegalAction, { type: "declare_win" }> =>
          action.type === "declare_win",
      );
    if (win === undefined) {
      throw new Error("Expected a legal initial-deal win");
    }
    const won = engine.decide(before, {
      type: "submit_action",
      gameId: before.gameId,
      branchId: before.branchId,
      playerId: "east",
      expectedRevision: before.revision,
      requestId: "invariants:scored-win",
      actionId: win.id,
    });
    if (!won.accepted) {
      throw new Error(won.error.message);
    }
    const persisted = won.events.find((event): event is HandWonEvent => event.type === "hand_won");
    if (persisted === undefined) {
      throw new Error("Expected a persisted hand-win event");
    }
    const originalWinner = persisted.winners[0]!;
    const originalPayment = originalWinner.scoring.payments[0]!;
    expect(originalWinner.scoring.payments.length).toBeGreaterThan(0);

    const rejects = (mutate: (event: HandWonEvent) => void, message: RegExp): void => {
      const event = structuredClone(persisted);
      mutate(event);
      expect(() => reduceGameEvent(before, event)).toThrow(message);
    };

    rejects((event) => {
      event.winners = [];
    }, /one new, distinct winner set/u);
    rejects((event) => {
      event.winners = [event.winners[0]!, structuredClone(event.winners[0]!)];
    }, /one new, distinct winner set/u);
    rejects((event) => {
      event.winners[0]!.playerId = "south";
    }, /winners do not match/u);
    rejects((event) => {
      event.tileOwner = { kind: "discard", discardId: "discard:missing" };
    }, /self-draw hand win does not match/u);
    rejects((event) => {
      event.winners[0]!.source = "discard";
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.fromPlayerId = "south";
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.winningTileId = "characters.9#4";
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.preview.legalWin = false;
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.scoring.winnerId = "south";
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.scoring.winSource = "discard";
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.scoring.winningTileId = "characters.9#4";
    }, /identity, source, or tile/u);
    rejects((event) => {
      event.winners[0]!.scoring.rulesetHash = "sha256:wrong";
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winners[0]!.scoring.rawFaan = -1;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winners[0]!.scoring.cappedFaan = before.ruleset.capFaan + 1;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winners[0]!.scoring.minimumRequired += 1;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winners[0]!.scoring.missingFaan += 1;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winners[0]!.scoring.basePoints = 0;
    }, /invalid identity or totals/u);
    rejects((event) => {
      event.winners[0]!.preview.rawFaan += 1;
    }, /preview does not match/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.fromPlayerId = "missing";
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.toPlayerId = "south";
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.fromPlayerId = "east";
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.points = Number.MAX_SAFE_INTEGER + 1;
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.basePoints += 1;
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.multiplier = 0;
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments[0]!.points += 1;
    }, /payment is invalid/u);
    rejects((event) => {
      event.winners[0]!.scoring.payments = [
        ...event.winners[0]!.scoring.payments,
        structuredClone(event.winners[0]!.scoring.payments[0]!),
      ];
    }, /payment is invalid or duplicated/u);
    rejects((event) => {
      const deltas = { ...event.scoreDeltas };
      delete deltas.north;
      event.scoreDeltas = deltas;
    }, /score deltas do not match/u);
    rejects((event) => {
      event.scoreDeltas = {
        ...event.scoreDeltas,
        east: event.scoreDeltas.east! + 1,
      };
    }, /score deltas do not match/u);
    rejects((event) => {
      event.scoreDeltas = {
        ...event.scoreDeltas,
        east: Number.MAX_SAFE_INTEGER + 1,
      };
    }, /score deltas do not match/u);

    const overflowState = structuredClone(before);
    overflowState.players.east!.score = Number.MAX_SAFE_INTEGER;
    expect(() => reduceGameEvent(overflowState, persisted)).toThrow(/player score exceeds/iu);

    const withoutStandardComparison = structuredClone(originalWinner.scoring);
    withoutStandardComparison.standardComparison = null;
    const projected = projectPublicScoringResult(withoutStandardComparison);
    expect(projected.standardComparison).toBeNull();
    expect(projected.winningTileTypeId).toBe(tileTypeFromInstanceId(originalWinner.winningTileId));
    expect(JSON.stringify(projected)).not.toContain(originalWinner.winningTileId);
    expect(originalPayment.toPlayerId).toBe("east");
  });

  it("recognizes bonus metadata used by the corruption fixtures", () => {
    expect(getTileDefinition("flower.plum").bonus).toBe(true);
    expect(getTileDefinition("characters.9").bonus).toBe(false);
  });

  it("normalizes a non-Error wall-provider failure at the creation boundary", () => {
    const engine = createGameEngine({
      scoringSystem: createHongKongScoringSystem(RULESET),
      wallProvider: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercises unknown throw normalization
        throw "non-error wall failure";
      },
    });
    const result = engine.create({
      type: "create_game",
      requestId: "invariants:non-error-create",
      branchId: "main",
      seed: "non-error-create",
      mode: "guided",
      matchLength: "one_wind",
      rules: toCoreGameRules(RULESET),
      players: PLAYERS,
    });
    expect(result).toMatchObject({
      accepted: false,
      error: {
        code: "invalid_request",
        message: "Game creation failed",
      },
    });
  });
});

describe("standard-profile engine scoring acceptance", () => {
  const playToWestDiscard = (
    seed: string,
    southTiles: readonly TileInstanceId[],
    winningDiscard: TileInstanceId,
  ) => {
    const wall = laterDiscardWaitWall(`standard_${seed}_v1`, southTiles, winningDiscard);
    const engine = createGameEngine({
      scoringSystem: createHongKongScoringSystem(STANDARD_RULESET),
      wallProvider: () => wall,
    });
    const created = engine.create({
      type: "create_game",
      requestId: `${seed}:create`,
      branchId: "main",
      seed,
      mode: "guided",
      matchLength: "one_wind",
      rules: toCoreGameRules(STANDARD_RULESET),
      players: PLAYERS,
    });
    if (!created.accepted) {
      throw new Error(created.error.message);
    }
    const events = [...created.events];
    let state = created.state;
    let requestIndex = 0;

    const submit = (playerId: string, actionId: string, label: string): void => {
      requestIndex += 1;
      const result = engine.decide(state, {
        type: "submit_action",
        gameId: state.gameId,
        branchId: state.branchId,
        playerId,
        expectedRevision: state.revision,
        requestId: `${seed}:${String(requestIndex)}:${label}`,
        actionId,
      });
      if (!result.accepted) {
        throw new Error(result.error.message);
      }
      events.push(...result.events);
      state = result.state;
    };

    const discardDrawnTile = (playerId: string): void => {
      const action = engine
        .legalActions(state, playerId)
        .find(
          (candidate): candidate is Extract<LegalAction, { type: "discard" }> =>
            candidate.type === "discard" && candidate.tileId === state.hand.drawnTileId,
        );
      if (action === undefined) {
        throw new Error(`Expected ${playerId}'s drawn-tile discard`);
      }
      submit(playerId, action.id, "discard");
    };

    const passWindow = (): void => {
      const responders = [...(state.pending?.eligiblePlayerIds ?? [])];
      for (const playerId of responders) {
        const pass = engine
          .legalActions(state, playerId)
          .find(
            (candidate): candidate is Extract<LegalAction, { type: "pass" }> =>
              candidate.type === "pass",
          );
        if (pass === undefined) {
          throw new Error(`Expected a pass for ${playerId}`);
        }
        submit(playerId, pass.id, "pass");
      }
    };

    discardDrawnTile("east");
    passWindow();
    expect(state.hand.activePlayerId).toBe("south");
    discardDrawnTile("south");
    passWindow();
    expect(state.hand.activePlayerId).toBe("west");
    expect(state.hand.firstDiscardCompleted).toBe(true);
    discardDrawnTile("west");

    return {
      engine,
      events,
      get state(): GameState {
        return state;
      },
      submit,
    };
  };

  it("accepts an exact three-faan discard win and persists deterministic payments", () => {
    const scenario = playToWestDiscard(
      "exact-three-faan",
      [
        "characters.1#1",
        "characters.2#1",
        "characters.3#1",
        "characters.4#1",
        "characters.5#1",
        "characters.6#1",
        "dots.1#1",
        "dots.2#1",
        "dots.3#1",
        "dots.4#1",
        "dots.5#1",
        "dots.6#1",
        "bamboo.8#1",
      ],
      "bamboo.8#2",
    );
    const pending = scenario.state.pending;
    const assessment = pending?.winAssessmentsByPlayer.south;
    expect(assessment?.preview).toMatchObject({
      shapeComplete: true,
      legalWin: true,
      rawFaan: 3,
      cappedFaan: 3,
      missingFaan: 0,
      reason: "legal",
    });
    expect(assessment?.preview.appliedRuleIds).toEqual(
      expect.arrayContaining(["no_bonus_tiles", "all_chows", "concealed_hand"]),
    );

    const responders = [...(pending?.eligiblePlayerIds ?? [])];
    for (const playerId of responders) {
      const wanted = playerId === "south" ? "claim_win" : "pass";
      const action = scenario.engine
        .legalActions(scenario.state, playerId)
        .find((candidate) => candidate.type === wanted);
      if (action === undefined) {
        throw new Error(`Expected ${wanted} for ${playerId}`);
      }
      scenario.submit(playerId, action.id, wanted);
    }

    expect(scenario.state.phase).toBe("hand_ended");
    const winEvent = scenario.events.find(
      (event): event is HandWonEvent => event.type === "hand_won",
    );
    if (winEvent === undefined) {
      throw new Error("Expected an authoritative hand-win event");
    }
    expect(winEvent.winners[0]?.scoring).toMatchObject({
      rawFaan: 3,
      cappedFaan: 3,
      legalWin: true,
      basePoints: 8,
    });
    expect(winEvent.scoreDeltas).toEqual({
      east: -8,
      south: 32,
      west: -16,
      north: -8,
    });
    expect(winEvent.winners[0]?.scoring.payments).toHaveLength(3);
    expect(
      winEvent.winners[0]?.scoring.payments.reduce((total, payment) => total + payment.points, 0),
    ).toBe(32);
    expect(replayEvents(scenario.events)).toEqual(scenario.state);
  });

  it("rejects a complete exact two-faan wait and records the one-faan shortfall", () => {
    const scenario = playToWestDiscard(
      "exact-two-faan",
      [
        "characters.1#1",
        "characters.2#1",
        "characters.3#1",
        "characters.4#1",
        "characters.5#1",
        "characters.6#1",
        "dots.1#1",
        "dots.2#1",
        "dots.3#1",
        "bamboo.5#1",
        "bamboo.5#2",
        "bamboo.5#3",
        "dots.9#1",
      ],
      "dots.9#2",
    );
    const assessment = scenario.state.pending?.winAssessmentsByPlayer.south;
    expect(assessment?.preview).toMatchObject({
      shapeComplete: true,
      legalWin: false,
      rawFaan: 2,
      cappedFaan: 2,
      minimumRequired: 3,
      missingFaan: 1,
      reason: "below_minimum_faan",
    });
    expect(assessment?.breakdown).toMatchObject({
      rawFaan: 2,
      legalWin: false,
      missingFaan: 1,
    });
    expect(
      scenario.engine
        .legalActions(scenario.state, "south")
        .some(({ type }) => type === "claim_win"),
    ).toBe(false);
    expect(scenario.engine.observation(scenario.state, "south").claimWinAssessment).toEqual(
      assessment?.preview,
    );
    expect(replayEvents(scenario.events)).toEqual(scenario.state);
  });
});
