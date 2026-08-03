import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  assertStateInvariants,
  computeRoundProgression,
  createGameEngine,
  createOmniscientReplayView,
  createTileInventory,
  deriveSeed,
  getTileDefinition,
  projectPublicEventStream,
  reduceGameEvent,
  replayEvents,
  tileTypeFromInstanceId,
  type CreateGameCommand,
  type GameEngine,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PublicGameEvent,
  type TileInstanceId,
  type Wind,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  resolveRuleset,
  toCoreGameRules,
  type ResolvedRuleset,
} from "@hk-mahjong/hk-rules";
import { buildWallFixture } from "./wall.js";

const TRAINING_RULESET = getBundledRuleset("training_relaxed_v1");

const PLAYERS: CreateGameCommand["players"] = [
  { id: "east", displayName: "East", controller: "human", seat: "east" },
  { id: "south", displayName: "South", controller: "bot", seat: "south" },
  { id: "west", displayName: "West", controller: "bot", seat: "west" },
  { id: "north", displayName: "North", controller: "bot", seat: "north" },
];

type PartialHands = Readonly<Partial<Record<Wind, readonly TileInstanceId[]>>>;

interface ScenarioWallInput {
  id: string;
  ruleset?: ResolvedRuleset;
  partialHands?: PartialHands;
  futureLiveDraws?: readonly TileInstanceId[];
  replacementDraws?: readonly TileInstanceId[];
}

const completeHands = (
  ruleset: ResolvedRuleset,
  partialHands: PartialHands,
  reservedExtra: readonly TileInstanceId[],
): Readonly<Record<Wind, readonly TileInstanceId[]>> => {
  const targets: Readonly<Record<Wind, number>> = {
    east: 14,
    south: 13,
    west: 13,
    north: 13,
  };
  const specified = [...Object.values(partialHands).flat(), ...reservedExtra];
  if (new Set(specified).size !== specified.length) {
    throw new Error("Scenario hand reservations must use distinct physical tiles");
  }
  const available = createTileInventory(ruleset.definition.tileSet.bonusTilesEnabled).filter(
    (tileId) =>
      !specified.includes(tileId) && !getTileDefinition(tileTypeFromInstanceId(tileId)).bonus,
  );
  let availableIndex = 0;
  const hands = {} as Record<Wind, readonly TileInstanceId[]>;
  for (const wind of ["east", "south", "west", "north"] as const) {
    const hand = [...(partialHands[wind] ?? [])];
    while (hand.length < targets[wind]) {
      const tileId = available[availableIndex++];
      if (tileId === undefined) {
        throw new Error("Scenario filler exhausted the standard inventory");
      }
      hand.push(tileId);
    }
    if (hand.length !== targets[wind]) {
      throw new Error(`Scenario ${wind} hand exceeds its physical deal size`);
    }
    hands[wind] = hand;
  }
  return hands;
};

const initialLiveDraws = (
  hands: Readonly<Record<Wind, readonly TileInstanceId[]>>,
): readonly TileInstanceId[] => {
  const draws: TileInstanceId[] = [];
  for (let round = 0; round < 13; round += 1) {
    for (const wind of ["east", "south", "west", "north"] as const) {
      const tileId = hands[wind][round];
      if (tileId === undefined) {
        throw new Error(`Scenario ${wind} hand lacks deal slot ${String(round)}`);
      }
      draws.push(tileId);
    }
  }
  const dealerExtra = hands.east[13];
  if (dealerExtra === undefined) {
    throw new Error("Scenario East hand lacks its fourteenth tile");
  }
  draws.push(dealerExtra);
  return draws;
};

const scenarioWall = (input: ScenarioWallInput): readonly TileInstanceId[] => {
  const ruleset = input.ruleset ?? TRAINING_RULESET;
  const futureLiveDraws = input.futureLiveDraws ?? [];
  const replacementDraws = input.replacementDraws ?? [];
  const hands = completeHands(ruleset, input.partialHands ?? {}, [
    ...futureLiveDraws,
    ...replacementDraws,
  ]);
  return buildWallFixture({
    id: input.id,
    bonusTilesEnabled: ruleset.definition.tileSet.bonusTilesEnabled,
    liveDraws: [...initialLiveDraws(hands), ...futureLiveDraws],
    replacementDraws,
  });
};

const createEngine = (
  ruleset: ResolvedRuleset = TRAINING_RULESET,
  wallOrder?: readonly TileInstanceId[],
): GameEngine =>
  createGameEngine({
    scoringSystem: createHongKongScoringSystem(ruleset),
    ...(wallOrder === undefined ? {} : { wallProvider: () => wallOrder }),
  });

const createState = (
  engine: GameEngine,
  ruleset: ResolvedRuleset = TRAINING_RULESET,
  seed = "m2-test",
  options: {
    mode?: CreateGameCommand["mode"];
    matchLength?: CreateGameCommand["matchLength"];
  } = {},
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => {
  const result = engine.create({
    type: "create_game",
    requestId: `create:${seed}`,
    branchId: "main",
    seed,
    mode: options.mode ?? "guided",
    matchLength: options.matchLength ?? "one_wind",
    rules: toCoreGameRules(ruleset),
    players: PLAYERS,
  });
  if (!result.accepted) {
    throw new Error(result.error.message);
  }
  return result;
};

const actionOfType = <Type extends LegalAction["type"]>(
  engine: GameEngine,
  state: GameState,
  playerId: PlayerId,
  type: Type,
): Extract<LegalAction, { type: Type }> => {
  const action = engine
    .legalActions(state, playerId)
    .find(
      (candidate): candidate is Extract<LegalAction, { type: Type }> => candidate.type === type,
    );
  if (action === undefined) {
    throw new Error(`Expected ${type} action for ${playerId}`);
  }
  return action;
};

const submit = (
  engine: GameEngine,
  state: GameState,
  playerId: PlayerId,
  action: LegalAction,
  requestId: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => {
  const result = engine.decide(state, {
    type: "submit_action",
    gameId: state.gameId,
    branchId: state.branchId,
    playerId,
    expectedRevision: state.revision,
    requestId,
    actionId: action.id,
  });
  if (!result.accepted) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result;
};

const discardTile = (
  engine: GameEngine,
  state: GameState,
  playerId: PlayerId,
  tileId: TileInstanceId,
  requestId: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => {
  const action = engine
    .legalActions(state, playerId)
    .find(
      (candidate): candidate is Extract<LegalAction, { type: "discard" }> =>
        candidate.type === "discard" && candidate.tileId === tileId,
    );
  if (action === undefined) {
    throw new Error(`Expected discard ${tileId} for ${playerId}`);
  }
  return submit(engine, state, playerId, action, requestId);
};

const respond = (
  engine: GameEngine,
  state: GameState,
  playerId: PlayerId,
  type: "claim_chow" | "claim_pung" | "claim_kong" | "claim_win" | "pass",
  requestId: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => submit(engine, state, playerId, actionOfType(engine, state, playerId, type), requestId);

const endSandboxHand = (
  engine: GameEngine,
  state: GameState,
  requestId: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => {
  const result = engine.decide(state, {
    type: "end_sandbox_hand",
    gameId: state.gameId,
    branchId: state.branchId,
    playerId: state.hand.activePlayerId,
    expectedRevision: state.revision,
    requestId,
  });
  if (!result.accepted) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result;
};

const startNextHand = (
  engine: GameEngine,
  state: GameState,
  playerId: PlayerId,
  requestId: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} =>
  submit(
    engine,
    state,
    playerId,
    actionOfType(engine, state, playerId, "start_next_hand"),
    requestId,
  );

const passEveryResponder = (
  engine: GameEngine,
  initialState: GameState,
  requestPrefix: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => {
  let state = initialState;
  const events: GameEvent[] = [];
  const publicEvents: PublicGameEvent[] = [];
  const responders = state.pending?.eligiblePlayerIds;
  if (responders === undefined) {
    throw new Error("Expected a pending response window");
  }
  for (const [index, playerId] of responders.entries()) {
    const result = respond(engine, state, playerId, "pass", `${requestPrefix}:${String(index)}`);
    state = result.state;
    events.push(...result.events);
    publicEvents.push(...result.publicEvents);
  }
  return { state, events, publicEvents };
};

const discardCurrentAndPass = (
  engine: GameEngine,
  initialState: GameState,
  requestPrefix: string,
): {
  state: GameState;
  events: readonly GameEvent[];
  publicEvents: readonly PublicGameEvent[];
} => {
  const playerId = initialState.hand.activePlayerId;
  const actions = engine.legalActions(initialState, playerId);
  const discard = actions.find(
    (candidate): candidate is Extract<LegalAction, { type: "discard" }> =>
      candidate.type === "discard" &&
      (initialState.hand.drawnTileId === null ||
        candidate.tileId === initialState.hand.drawnTileId),
  );
  if (discard === undefined) {
    throw new Error(`Expected a current discard for ${playerId}`);
  }
  const discarded = submit(engine, initialState, playerId, discard, `${requestPrefix}:discard`);
  const passed = passEveryResponder(engine, discarded.state, `${requestPrefix}:pass`);
  return {
    state: passed.state,
    events: [...discarded.events, ...passed.events],
    publicEvents: [...discarded.publicEvents, ...passed.publicEvents],
  };
};

const withRules = (
  base: ResolvedRuleset,
  changes: {
    bonusTilesEnabled?: boolean;
    multipleWinners?: boolean;
    sameTileWinLockUntilNextDraw?: boolean;
    initialDealWinsEnabled?: boolean;
    passedWinLockTriggers?: "explicit_pass" | "any_unclaimed_legal_win";
    passedWinLockIncludesKongRobbery?: boolean;
    robAddedKong?: boolean;
    robConcealedKong?: boolean;
    concealedKongRobberyForms?: readonly ("standard" | "thirteen_orphans")[];
    dealerRepeatsOnWin?: boolean;
    dealerRepeatsOnDraw?: boolean;
    dealerRepeatsWhenAmongMultipleWinners?: boolean;
  },
): ResolvedRuleset =>
  resolveRuleset({
    ...base.definition,
    tileSet: {
      ...base.definition.tileSet,
      bonusTilesEnabled: changes.bonusTilesEnabled ?? base.definition.tileSet.bonusTilesEnabled,
    },
    winRules: {
      ...base.definition.winRules,
      multipleWinners: changes.multipleWinners ?? base.definition.winRules.multipleWinners,
      sameTileWinLockUntilNextDraw:
        changes.sameTileWinLockUntilNextDraw ??
        base.definition.winRules.sameTileWinLockUntilNextDraw,
      initialDealWinsEnabled:
        changes.initialDealWinsEnabled ?? base.definition.winRules.initialDealWinsEnabled,
      passedWinLockTriggers:
        changes.passedWinLockTriggers ?? base.definition.winRules.passedWinLockTriggers,
      passedWinLockIncludesKongRobbery:
        changes.passedWinLockIncludesKongRobbery ??
        base.definition.winRules.passedWinLockIncludesKongRobbery,
    },
    kongRules: {
      ...base.definition.kongRules,
      robAddedKong: changes.robAddedKong ?? base.definition.kongRules.robAddedKong,
      robConcealedKong: changes.robConcealedKong ?? base.definition.kongRules.robConcealedKong,
      concealedKongRobberyForms:
        changes.concealedKongRobberyForms ?? base.definition.kongRules.concealedKongRobberyForms,
    },
    roundRules: {
      ...base.definition.roundRules,
      dealerRepeatsOnWin:
        changes.dealerRepeatsOnWin ?? base.definition.roundRules.dealerRepeatsOnWin,
      dealerRepeatsOnDraw:
        changes.dealerRepeatsOnDraw ?? base.definition.roundRules.dealerRepeatsOnDraw,
      dealerRepeatsWhenAmongMultipleWinners:
        changes.dealerRepeatsWhenAmongMultipleWinners ??
        base.definition.roundRules.dealerRepeatsWhenAmongMultipleWinners,
    },
  });

const CLAIM_PRIORITY_HANDS = {
  east: ["characters.3#1"],
  south: ["characters.1#1", "characters.2#1"],
  west: ["characters.3#2", "characters.3#3"],
  north: [
    "characters.1#2",
    "characters.2#2",
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
  ],
} as const satisfies PartialHands;

const claimPriorityWall = (): readonly TileInstanceId[] =>
  scenarioWall({
    id: "m2_claim_priority_v1",
    partialHands: CLAIM_PRIORITY_HANDS,
  });

const setupAddedKong = (
  ruleset: ResolvedRuleset,
  seed: string,
): { engine: GameEngine; state: GameState; events: readonly GameEvent[] } => {
  const wall = scenarioWall({
    id: `m2_added_kong_${seed}`,
    ruleset,
    partialHands: {
      east: ["characters.5#1"],
      south: ["characters.5#2", "characters.5#3"],
      north: [
        "characters.3#1",
        "characters.4#1",
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
      ],
    },
    futureLiveDraws: ["wind.south#4", "wind.west#4", "wind.north#4", "characters.5#4"],
    replacementDraws: ["dragon.white#4"],
  });
  const engine = createEngine(ruleset, wall);
  const created = createState(engine, ruleset, seed);
  let { state } = created;
  const events = [...created.events];
  let result = discardTile(engine, state, "east", "characters.5#1", `${seed}:east-discard`);
  state = result.state;
  events.push(...result.events);
  result = respond(engine, state, "south", "claim_pung", `${seed}:south-pung`);
  state = result.state;
  events.push(...result.events);
  result = respond(engine, state, "west", "pass", `${seed}:west-pass`);
  state = result.state;
  events.push(...result.events);
  result = respond(engine, state, "north", "pass", `${seed}:north-pass`);
  state = result.state;
  events.push(...result.events);

  for (let turn = 0; turn < 4; turn += 1) {
    result = discardCurrentAndPass(engine, state, `${seed}:turn:${String(turn)}`);
    state = result.state;
    events.push(...result.events);
  }
  if (state.hand.activePlayerId !== "south" || state.hand.drawnTileId !== "characters.5#4") {
    throw new Error("Added-kong setup did not return the fourth tile to South");
  }
  return { engine, state, events };
};

describe("core engine creation and dealing", () => {
  it("is deterministic and deals exact non-bonus hand sizes", () => {
    const engine = createEngine();
    const first = createState(engine, TRAINING_RULESET, "seeded-deal");
    const second = createState(engine, TRAINING_RULESET, "seeded-deal");

    expect(second).toEqual(first);
    expect(first.state.revision).toBe(2);
    expect(first.events.map(({ type }) => type)).toEqual([
      "game_created",
      "initial_deal_completed",
    ]);
    expect(first.state.players.east?.concealed).toHaveLength(14);
    expect(first.state.players.south?.concealed).toHaveLength(13);
    expect(first.state.players.west?.concealed).toHaveLength(13);
    expect(first.state.players.north?.concealed).toHaveLength(13);
    assertStateInvariants(first.state);
    expect(replayEvents(first.events)).toEqual(first.state);
  });

  it("replaces a live bonus through a chained back-end bonus draw", () => {
    const wall = buildWallFixture({
      id: "m2_initial_flower_chain_v1",
      bonusTilesEnabled: true,
      liveDraws: ["flower.plum#1"],
      replacementDraws: ["season.spring#1", "characters.9#4"],
    });
    const engine = createEngine(TRAINING_RULESET, wall);
    const { state, events } = createState(engine, TRAINING_RULESET, "flower-chain");
    const east = state.players.east;

    expect(east?.bonusTiles).toEqual(["flower.plum#1", "season.spring#1"]);
    expect(east?.concealed).toContain("characters.9#4");
    expect(east?.concealed).toHaveLength(14);
    const deal = events.find(({ type }) => type === "initial_deal_completed");
    expect(deal?.type).toBe("initial_deal_completed");
    if (deal?.type === "initial_deal_completed") {
      expect(deal.trace.slice(0, 3)).toEqual([
        {
          playerId: "east",
          tileId: "flower.plum#1",
          source: "live",
          disposition: "bonus",
        },
        {
          playerId: "east",
          tileId: "season.spring#1",
          source: "replacement",
          disposition: "bonus",
        },
        {
          playerId: "east",
          tileId: "characters.9#4",
          source: "replacement",
          disposition: "concealed",
        },
      ]);
    }
    assertStateInvariants(state);
  });

  it("rejects malformed command/rules boundaries and assigns omitted seats deterministically", () => {
    const engine = createEngine();
    const validCommand = (): CreateGameCommand => ({
      type: "create_game",
      requestId: "validation:create",
      branchId: "main",
      seed: "validation",
      mode: "guided",
      matchLength: "one_wind",
      rules: structuredClone(toCoreGameRules(TRAINING_RULESET)),
      players: structuredClone(PLAYERS),
    });
    const rejected = (
      mutate: (command: CreateGameCommand) => void,
      code: "invalid_request" | "ruleset_invalid",
    ): void => {
      const command = validCommand();
      mutate(command);
      const result = engine.create(command);
      expect(result.accepted).toBe(false);
      if (result.accepted) {
        throw new Error("Expected a rejected create command");
      }
      expect(result.error.code).toBe(code);
      expect(result.events).toEqual([]);
      expect(result.publicEvents).toEqual([]);
    };

    rejected((command) => {
      command.requestId = " ";
    }, "invalid_request");
    rejected((command) => {
      command.seed = "";
    }, "invalid_request");
    rejected((command) => {
      command.players[0].id = "";
    }, "invalid_request");
    rejected((command) => {
      command.players[1].id = command.players[0].id;
    }, "invalid_request");
    rejected((command) => {
      command.players[1].seat = "east";
    }, "invalid_request");
    rejected((command) => {
      command.players[0].seat = "invalid" as Wind;
    }, "invalid_request");
    rejected((command) => {
      command.players[0].displayName = " ";
    }, "invalid_request");
    rejected((command) => {
      command.players[0].initialScore = 1.5;
    }, "invalid_request");
    rejected((command) => {
      command.players[0].initialScore = -1;
    }, "invalid_request");
    rejected((command) => {
      command.rules.id = "";
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.version = "";
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.hash = "sha256:bad";
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.minimumFaan = 0.5;
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.minimumFaan = -1;
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.capFaan = 1.5;
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.capFaan = 0;
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.minimumFaan = command.rules.capFaan + 1;
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.prevailingWinds = [];
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.prevailingWinds = ["east", "south", "west", "north", "east"];
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.prevailingWinds = ["east", "east"];
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.prevailingWinds = ["invalid" as Wind];
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.concealedKongRobberyForms = ["standard", "standard"];
    }, "ruleset_invalid");
    rejected((command) => {
      command.rules.robConcealedKong = false;
      command.rules.concealedKongRobberyForms = ["standard"];
    }, "ruleset_invalid");

    const unassigned = validCommand();
    const playersWithoutSeats = unassigned.players.map(({ seat: omitted, ...player }) => {
      void omitted;
      return player;
    });
    const [firstPlayer, secondPlayer, thirdPlayer, fourthPlayer] = playersWithoutSeats;
    if (
      firstPlayer === undefined ||
      secondPlayer === undefined ||
      thirdPlayer === undefined ||
      fourthPlayer === undefined
    ) {
      throw new Error("Expected four unassigned validation players");
    }
    unassigned.players = [firstPlayer, secondPlayer, thirdPlayer, fourthPlayer];
    const first = engine.create(unassigned);
    const second = engine.create(unassigned);
    expect(first).toEqual(second);
    if (!first.accepted) {
      throw new Error(first.error.message);
    }
    expect(new Set(Object.values(first.state.players).map(({ seat }) => seat))).toEqual(
      new Set(["east", "south", "west", "north"]),
    );
    expect(Object.values(first.state.players).every(({ score }) => score === 500)).toBe(true);

    const invalidWallEngine = createGameEngine({
      scoringSystem: createHongKongScoringSystem(TRAINING_RULESET),
      wallProvider: (inventory) => inventory.slice(1),
    });
    expect(invalidWallEngine.create(validCommand())).toMatchObject({
      accepted: false,
      error: { code: "invalid_request" },
      events: [],
      publicEvents: [],
    });
  });

  it("chains a live bonus replacement and permits a real replacement-source win", () => {
    const wall = scenarioWall({
      id: "m2_turn_bonus_replacement_win_v1",
      partialHands: {
        south: [
          "characters.1#1",
          "characters.2#1",
          "characters.3#1",
          "characters.4#1",
          "characters.5#1",
          "characters.6#1",
          "dots.1#1",
          "dots.2#1",
          "dots.3#1",
          "bamboo.1#1",
          "bamboo.2#1",
          "bamboo.3#1",
          "dragon.red#1",
        ],
      },
      futureLiveDraws: ["flower.plum#1"],
      replacementDraws: ["dragon.red#2"],
    });
    const engine = createEngine(TRAINING_RULESET, wall);
    const created = createState(engine, TRAINING_RULESET, "turn-bonus-win");
    const turn = discardCurrentAndPass(engine, created.state, "turn-bonus-win:east");

    expect(turn.state).toMatchObject({
      phase: "awaiting_discard",
      hand: {
        activePlayerId: "south",
        drawnTileId: "dragon.red#2",
        lastDrawSource: "replacement",
        lastDrawReason: "bonus_replacement",
      },
    });
    expect(turn.state.players.south?.bonusTiles).toContain("flower.plum#1");
    expect(turn.publicEvents.at(-1)).toMatchObject({
      type: "tile_drawn",
      playerId: "south",
      concealedTileDrawn: true,
      exposedBonusTileTypes: ["flower.plum"],
    });
    const win = actionOfType(engine, turn.state, "south", "declare_win");
    expect(win.source).toBe("replacement");
    const won = submit(engine, turn.state, "south", win, "turn-bonus-win:declare");
    expect(won.state.hand.result).toMatchObject({
      kind: "win",
      winners: [{ playerId: "south", source: "replacement" }],
    });
  });

  it("persists an ordinary live-wall self-draw with exact replay provenance", () => {
    const wall = scenarioWall({
      id: "m2_ordinary_self_draw_v1",
      partialHands: {
        south: [
          "characters.1#1",
          "characters.2#1",
          "characters.3#1",
          "characters.4#1",
          "characters.5#1",
          "characters.6#1",
          "dots.1#1",
          "dots.2#1",
          "dots.3#1",
          "bamboo.1#1",
          "bamboo.2#1",
          "bamboo.3#1",
          "dragon.red#1",
        ],
      },
      futureLiveDraws: ["dragon.red#2"],
    });
    const engine = createEngine(TRAINING_RULESET, wall);
    const created = createState(engine, TRAINING_RULESET, "ordinary-self-draw");
    const turn = discardCurrentAndPass(engine, created.state, "ordinary-self-draw:east");
    expect(turn.state).toMatchObject({
      phase: "awaiting_discard",
      hand: {
        activePlayerId: "south",
        drawnTileId: "dragon.red#2",
        lastDrawSource: "live",
      },
    });
    const won = submit(
      engine,
      turn.state,
      "south",
      actionOfType(engine, turn.state, "south", "declare_win"),
      "ordinary-self-draw:win",
    );
    expect(won.state.hand.result).toMatchObject({
      kind: "win",
      winners: [{ playerId: "south", source: "self_draw" }],
    });
    expect(replayEvents([...created.events, ...turn.events, ...won.events])).toEqual(won.state);
  });
});

describe("hidden claim windows and priority", () => {
  it("keeps responses hidden, makes old revisions stale, and preserves window action IDs", () => {
    const engine = createEngine(TRAINING_RULESET, claimPriorityWall());
    let { state } = createState(engine, TRAINING_RULESET, "hidden-window");
    state = discardTile(engine, state, "east", "characters.3#1", "discard:hidden").state;

    const westBefore = engine.observation(state, "west");
    expect(westBefore.pending).toMatchObject({
      kind: "discard_claim",
      sourcePlayerId: "east",
      tileTypeId: "characters.3",
    });
    const westActionIds = westBefore.legalActions.map(({ id }) => id);
    const oldRevision = state.revision;
    state = respond(engine, state, "south", "claim_chow", "south:chow").state;
    const westAfter = engine.observation(state, "west");

    expect(westAfter.legalActions.map(({ id }) => id)).toEqual(westActionIds);
    expect({ ...westAfter, revision: 0 }).toEqual({ ...westBefore, revision: 0 });
    expect(JSON.stringify(westAfter)).not.toContain("south:chow");
    const stale = engine.decide(state, {
      type: "submit_action",
      gameId: state.gameId,
      branchId: state.branchId,
      playerId: "west",
      expectedRevision: oldRevision,
      requestId: "west:stale",
      actionId: westAfter.legalActions[0]!.id,
    });
    expect(stale.accepted).toBe(false);
    if (!stale.accepted) {
      expect(stale.error.code).toBe("stale_revision");
    }
  });

  it("allows chow only from the next seat and resolves pung above chow", () => {
    const engine = createEngine(TRAINING_RULESET, claimPriorityWall());
    let { state } = createState(engine, TRAINING_RULESET, "pung-priority");
    state = discardTile(engine, state, "east", "characters.3#1", "discard:pung").state;

    expect(engine.legalActions(state, "south").some(({ type }) => type === "claim_chow")).toBe(
      true,
    );
    expect(engine.legalActions(state, "west").some(({ type }) => type === "claim_chow")).toBe(
      false,
    );
    expect(engine.legalActions(state, "north").some(({ type }) => type === "claim_chow")).toBe(
      false,
    );

    state = respond(engine, state, "south", "claim_chow", "south:chow").state;
    state = respond(engine, state, "west", "claim_pung", "west:pung").state;
    state = respond(engine, state, "north", "pass", "north:pass").state;

    expect(state.phase).toBe("awaiting_discard");
    expect(state.hand.activePlayerId).toBe("west");
    expect(state.players.west?.melds).toHaveLength(1);
    expect(state.players.west?.melds[0]).toMatchObject({
      kind: "pung",
      claimedFrom: "east",
      claimedTileId: "characters.3#1",
    });
    expect(state.players.south?.melds).toHaveLength(0);
    assertStateInvariants(state);
  });

  it("resolves a next-seat chow when every higher-priority claimant passes", () => {
    const engine = createEngine(TRAINING_RULESET, claimPriorityWall());
    let { state } = createState(engine, TRAINING_RULESET, "chow-resolution");
    state = discardTile(engine, state, "east", "characters.3#1", "chow:discard").state;
    state = respond(engine, state, "south", "claim_chow", "chow:south").state;
    state = respond(engine, state, "west", "pass", "chow:west-pass").state;
    state = respond(engine, state, "north", "pass", "chow:north-pass").state;

    expect(state).toMatchObject({
      phase: "awaiting_discard",
      hand: {
        activePlayerId: "south",
        turnOrigin: "claim",
      },
    });
    expect(state.players.south?.melds).toContainEqual(
      expect.objectContaining({
        kind: "chow",
        kongKind: null,
        tileIds: ["characters.1#1", "characters.2#1", "characters.3#1"],
      }),
    );
    assertStateInvariants(state);

    const corruptChow = structuredClone(state);
    corruptChow.players.south!.melds[0]!.kongKind = "added";
    expect(() => assertStateInvariants(corruptChow)).toThrow(/not a valid chow/u);
  });

  it("waits for all responses, then resolves a legal win above meld claims", () => {
    const engine = createEngine(TRAINING_RULESET, claimPriorityWall());
    const created = createState(engine, TRAINING_RULESET, "win-priority");
    let { state } = created;
    const { events } = created;
    const allEvents = [...events];
    let result = discardTile(engine, state, "east", "characters.3#1", "discard:win");
    state = result.state;
    allEvents.push(...result.events);

    result = respond(engine, state, "north", "claim_win", "north:win");
    state = result.state;
    allEvents.push(...result.events);
    expect(state.phase).toBe("awaiting_claims");

    result = respond(engine, state, "south", "claim_chow", "south:late-chow");
    state = result.state;
    allEvents.push(...result.events);
    expect(state.phase).toBe("awaiting_claims");

    result = respond(engine, state, "west", "claim_pung", "west:late-pung");
    state = result.state;
    allEvents.push(...result.events);

    expect(state.phase).toBe("hand_ended");
    expect(state.hand.result).toMatchObject({
      kind: "win",
      winners: [{ playerId: "north", source: "discard" }],
    });
    expect(state.hand.winningTileZone).toEqual(["characters.3#1"]);
    expect(state.players.east?.discards[0]).toMatchObject({
      tileId: "characters.3#1",
      winningPlayerIds: ["north"],
    });
    assertStateInvariants(state);
    expect(replayEvents(allEvents)).toEqual(state);
  });

  it("resolves single and multiple equal-priority wins by seat distance", () => {
    const partialHands: PartialHands = {
      east: ["characters.3#1"],
      south: [
        "characters.1#1",
        "characters.2#1",
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
      ],
      west: [
        "characters.4#1",
        "characters.5#1",
        "dots.4#1",
        "dots.5#1",
        "dots.6#1",
        "bamboo.4#1",
        "bamboo.5#1",
        "bamboo.6#1",
        "dragon.green#1",
        "dragon.green#2",
        "dragon.green#3",
        "wind.south#1",
        "wind.south#2",
      ],
    };
    for (const multipleWinners of [false, true]) {
      const ruleset = withRules(TRAINING_RULESET, { multipleWinners });
      const wall = scenarioWall({
        id: `m2_${multipleWinners ? "multiple" : "single"}_winner_v1`,
        ruleset,
        partialHands,
      });
      const engine = createEngine(ruleset, wall);
      let { state } = createState(engine, ruleset, `winners:${String(multipleWinners)}`);
      state = discardTile(
        engine,
        state,
        "east",
        "characters.3#1",
        `winners:discard:${String(multipleWinners)}`,
      ).state;
      state = respond(
        engine,
        state,
        "west",
        "claim_win",
        `winners:west:${String(multipleWinners)}`,
      ).state;
      state = respond(
        engine,
        state,
        "south",
        "claim_win",
        `winners:south:${String(multipleWinners)}`,
      ).state;
      state = respond(
        engine,
        state,
        "north",
        "pass",
        `winners:north:${String(multipleWinners)}`,
      ).state;

      if (state.hand.result?.kind !== "win") {
        throw new Error("Expected a winning result");
      }
      expect(state.hand.result.winners.map(({ playerId }) => playerId)).toEqual(
        multipleWinners ? ["south", "west"] : ["south"],
      );
      expect(state.hand.winningTileZone).toEqual(["characters.3#1"]);
      assertStateInvariants(state);
    }
  });

  it("applies a same-tile passed-win lock until that player actually draws", () => {
    const lockRuleset = withRules(TRAINING_RULESET, {
      sameTileWinLockUntilNextDraw: true,
    });
    const wall = scenarioWall({
      id: "m2_passed_win_lock_v1",
      ruleset: lockRuleset,
      partialHands: CLAIM_PRIORITY_HANDS,
      futureLiveDraws: ["characters.3#4"],
    });
    const engine = createEngine(lockRuleset, wall);
    let { state } = createState(engine, lockRuleset, "passed-win-lock");
    state = discardTile(engine, state, "east", "characters.3#1", "lock:east-discard").state;
    state = respond(engine, state, "north", "pass", "lock:north-pass-win").state;
    state = respond(engine, state, "south", "pass", "lock:south-pass").state;
    state = respond(engine, state, "west", "pass", "lock:west-pass").state;

    expect(state.players.north?.temporaryRestrictions).toEqual([
      {
        type: "same_tile_win_lock",
        tileTypeId: "characters.3",
        until: "next_draw",
      },
    ]);
    expect(state.hand.activePlayerId).toBe("south");
    expect(state.hand.drawnTileId).toBe("characters.3#4");

    state = discardTile(engine, state, "south", "characters.3#4", "lock:south-discard").state;
    expect(engine.legalActions(state, "north").some(({ type }) => type === "claim_win")).toBe(
      false,
    );
    expect(engine.observation(state, "north").claimWinAssessment).toMatchObject({
      shapeComplete: true,
      legalWin: false,
      reason: "passed_win_restriction",
    });
    state = passEveryResponder(engine, state, "lock:second-window").state;
    expect(state.hand.activePlayerId).toBe("west");
    state = discardCurrentAndPass(engine, state, "lock:west-turn").state;
    expect(state.hand.activePlayerId).toBe("north");
    expect(state.players.north?.temporaryRestrictions).toEqual([]);
    assertStateInvariants(state);
  });

  it("locks any unclaimed legal win under the alternate passed-win trigger", () => {
    const lockRuleset = withRules(TRAINING_RULESET, {
      sameTileWinLockUntilNextDraw: true,
      passedWinLockTriggers: "any_unclaimed_legal_win",
    });
    const engine = createEngine(lockRuleset, claimPriorityWall());
    let { state } = createState(engine, lockRuleset, "passed-win-any-unclaimed");
    state = discardTile(engine, state, "east", "characters.3#1", "any-unclaimed:discard").state;
    state = respond(engine, state, "north", "pass", "any-unclaimed:north-pass").state;
    expect(state.players.north?.temporaryRestrictions).toEqual([
      {
        type: "same_tile_win_lock",
        tileTypeId: "characters.3",
        until: "next_draw",
      },
    ]);
  });
});

describe("revision safety, replay, and observations", () => {
  it("rejects duplicate requests before stale revisions and leaves state unchanged", () => {
    const engine = createEngine();
    const { state } = createState(engine, TRAINING_RULESET, "idempotency");
    const action = actionOfType(engine, state, "east", "discard");
    const command = {
      type: "submit_action" as const,
      gameId: state.gameId,
      branchId: state.branchId,
      playerId: "east",
      expectedRevision: state.revision,
      requestId: "same-request",
      actionId: action.id,
    };
    const accepted = engine.decide(state, command);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) {
      return;
    }

    const duplicate = engine.decide(accepted.state, command);
    expect(duplicate.accepted).toBe(false);
    if (!duplicate.accepted) {
      expect(duplicate.error.code).toBe("duplicate_request");
      expect(duplicate.state).toEqual(accepted.state);
      expect(duplicate.events).toEqual([]);
    }
    const stale = engine.decide(accepted.state, {
      ...command,
      requestId: "new-request",
    });
    expect(stale.accepted).toBe(false);
    if (!stale.accepted) {
      expect(stale.error.code).toBe("stale_revision");
      expect(stale.state).toEqual(accepted.state);
    }
  });

  it("returns structured command errors without mutating authoritative state", () => {
    const engine = createEngine();
    const { state } = createState(engine, TRAINING_RULESET, "command-errors");
    const action = actionOfType(engine, state, "east", "discard");
    const commands = [
      {
        command: {
          type: "submit_action",
          gameId: "game:wrong",
          branchId: state.branchId,
          playerId: "east",
          expectedRevision: state.revision,
          requestId: "error:game",
          actionId: action.id,
        } as const,
        code: "unknown_game",
      },
      {
        command: {
          type: "submit_action",
          gameId: state.gameId,
          branchId: state.branchId,
          playerId: "missing",
          expectedRevision: state.revision,
          requestId: "error:player",
          actionId: action.id,
        } as const,
        code: "unknown_player",
      },
      {
        command: {
          type: "submit_action",
          gameId: state.gameId,
          branchId: state.branchId,
          playerId: "east",
          expectedRevision: state.revision - 1,
          requestId: "error:revision",
          actionId: action.id,
        } as const,
        code: "stale_revision",
      },
      {
        command: {
          type: "submit_action",
          gameId: state.gameId,
          branchId: state.branchId,
          playerId: "east",
          expectedRevision: state.revision,
          requestId: "error:action",
          actionId: "action:fabricated",
        } as const,
        code: "action_not_legal",
      },
      {
        command: {
          type: "submit_action",
          gameId: state.gameId,
          branchId: state.branchId,
          playerId: "east",
          expectedRevision: state.revision,
          requestId: "error:closed",
          actionId: "claim:window:closed:east:pass:fake",
        } as const,
        code: "claim_window_closed",
      },
      {
        command: {
          type: "end_sandbox_hand",
          gameId: state.gameId,
          branchId: state.branchId,
          playerId: "east",
          expectedRevision: state.revision,
          requestId: "error:sandbox",
        } as const,
        code: "action_not_legal",
      },
    ];
    for (const { command, code } of commands) {
      const result = engine.decide(state, command);
      expect(result).toMatchObject({
        accepted: false,
        state,
        error: { code },
        events: [],
        publicEvents: [],
      });
    }
    expect(engine.legalActions(state, "missing")).toEqual([]);
    expect(() => engine.observation(state, "missing")).toThrow(/Unknown observation player/u);
  });

  it("redacts every opponent and wall physical ID from live observations", () => {
    const engine = createEngine();
    const { state } = createState(engine, TRAINING_RULESET, "redaction");

    for (const viewerId of ["east", "south", "west", "north"] as const) {
      const observation = engine.observation(state, viewerId);
      const json = JSON.stringify(observation);
      expect(json).not.toContain(state.seed);
      expect(json).not.toContain(state.stateHash);
      expect(json).not.toContain('"wall"');
      expect(json).not.toContain('"responses"');
      expect(json).not.toContain('"optionsByPlayer"');
      for (const player of Object.values(state.players)) {
        if (player.id !== viewerId) {
          for (const tileId of player.concealed) {
            expect(json).not.toContain(`"${tileId}"`);
          }
        }
      }
      for (const tileId of state.wall.tiles.slice(
        state.wall.liveIndex,
        state.wall.replacementIndex + 1,
      )) {
        expect(json).not.toContain(`"${tileId}"`);
      }
    }
    expect(engine.observation(state, "east").private.drawnTileId).toBe(state.hand.drawnTileId);
    expect(engine.observation(state, "south").private.drawnTileId).toBeNull();
    expect(() => createOmniscientReplayView(state)).toThrow(/unavailable/u);
  });
});

describe("practice branch lineage", () => {
  it("creates a branch-qualified event stream, scopes request receipts, and preserves practice identity", () => {
    const engine = createEngine();
    const parent = createState(engine, TRAINING_RULESET, "practice-branch", { mode: "sandbox" });
    const parentState = structuredClone(parent.state);
    const childBranchId = "practice:alternate-discard";
    const forked = engine.decide(parent.state, {
      type: "create_practice_branch",
      gameId: parent.state.gameId,
      branchId: childBranchId,
      parentBranchId: parent.state.branchId,
      playerId: "east",
      expectedRevision: parent.state.revision,
      requestId: "branch:create",
      originDecisionId: "decision:alternate-discard",
    });

    expect(forked.accepted).toBe(true);
    if (!forked.accepted) {
      return;
    }
    expect(parent.state).toEqual(parentState);
    expect(forked.events).toHaveLength(1);
    expect(forked.events[0]).toMatchObject({
      type: "practice_branch_created",
      id: `event:${parent.state.gameId}:${childBranchId}:${String(parent.state.revision + 1)}`,
      branchId: childBranchId,
      parentBranchId: "main",
      parentRevision: parent.state.revision,
      parentEventId: parent.state.lastEventId,
      parentStateHash: parent.state.stateHash,
      originDecisionId: "decision:alternate-discard",
      originDecisionBranchId: "main",
      requestedByPlayerId: "east",
    });
    expect(forked.state).toMatchObject({
      branchId: childBranchId,
      practiceBranch: true,
      revision: parent.state.revision + 1,
      processedRequestIds: ["branch:create"],
      hand: {
        id: `hand:${parent.state.gameId}:${childBranchId}:0`,
      },
    });
    expect(forked.publicEvents).toEqual([
      expect.objectContaining({
        type: "practice_branch_created",
        branchId: childBranchId,
        practiceBranch: true,
        parentBranchId: "main",
      }),
    ]);
    expect(JSON.stringify(forked.publicEvents)).not.toContain(parent.state.stateHash);
    expect(engine.observation(forked.state, "east")).toMatchObject({
      branchId: childBranchId,
      practiceBranch: true,
    });

    const ended = endSandboxHand(
      engine,
      forked.state,
      // This request was used by the parent creation event, proving receipt identity is branch-scoped.
      parent.state.processedRequestIds[0]!,
    );
    expect(ended.events.every(({ branchId }) => branchId === childBranchId)).toBe(true);
    const started = startNextHand(
      engine,
      ended.state,
      ended.state.hand.activePlayerId,
      "branch:next-hand",
    );
    expect(started.state).toMatchObject({
      branchId: childBranchId,
      practiceBranch: true,
      hand: {
        id: `hand:${parent.state.gameId}:${childBranchId}:1`,
      },
    });
    expect(started.events.every(({ branchId }) => branchId === childBranchId)).toBe(true);

    const replayed = replayEvents([
      ...parent.events,
      ...forked.events,
      ...ended.events,
      ...started.events,
    ]);
    expect(replayed).toEqual(started.state);
    expect(
      projectPublicEventStream([
        ...parent.events,
        ...forked.events,
        ...ended.events,
        ...started.events,
      ]),
    ).toEqual([
      ...parent.publicEvents,
      ...forked.publicEvents,
      ...ended.publicEvents,
      ...started.publicEvents,
    ]);
  });

  it("refuses a practice branch from competitive or mismatched branch state", () => {
    const engine = createEngine();
    const competitive = createState(engine, TRAINING_RULESET, "competitive-branch", {
      mode: "competitive",
    });
    const forbidden = engine.decide(competitive.state, {
      type: "create_practice_branch",
      gameId: competitive.state.gameId,
      branchId: "practice:forbidden",
      parentBranchId: competitive.state.branchId,
      playerId: "east",
      expectedRevision: competitive.state.revision,
      requestId: "branch:forbidden",
      originDecisionId: "decision:forbidden",
    });
    expect(forbidden).toMatchObject({
      accepted: false,
      error: { code: "action_not_legal" },
    });

    const mismatched = engine.decide(competitive.state, {
      type: "submit_action",
      gameId: competitive.state.gameId,
      branchId: "practice:not-current",
      playerId: "east",
      expectedRevision: competitive.state.revision,
      requestId: "branch:mismatched",
      actionId: actionOfType(engine, competitive.state, "east", "discard").id,
    });
    expect(mismatched).toMatchObject({ accepted: false, error: { code: "unknown_game" } });
  });
});

describe("public events and match progression", () => {
  const dealerWinningTiles = [
    "characters.1#1",
    "characters.2#1",
    "characters.3#1",
    "characters.4#1",
    "characters.5#1",
    "characters.6#1",
    "dots.1#1",
    "dots.2#1",
    "dots.3#1",
    "bamboo.1#1",
    "bamboo.2#1",
    "bamboo.3#1",
    "dragon.red#1",
    "dragon.red#2",
  ] as const;

  it("fails closed when progression is requested before a terminal result exists", () => {
    const engine = createEngine();
    const { state } = createState(engine, TRAINING_RULESET, "progression-guard");
    expect(() => computeRoundProgression(state)).toThrow(/only after a hand ends/u);
    const missingResult = structuredClone(state);
    missingResult.phase = "hand_ended";
    expect(() => computeRoundProgression(missingResult)).toThrow(
      /requires a terminal hand result/u,
    );
  });

  it("projects authoritative events through a hidden-information-safe public boundary", () => {
    const engine = createEngine();
    const created = createState(engine, TRAINING_RULESET, "public-events");

    expect(created.publicEvents.map(({ type }) => type)).toEqual([
      "game_started",
      "initial_deal_completed",
    ]);
    expect(projectPublicEventStream(created.events)).toEqual(created.publicEvents);
    const creationJson = JSON.stringify(created.publicEvents);
    expect(creationJson).not.toContain("public-events");
    expect(creationJson).not.toContain("create:public-events");
    expect(creationJson).not.toContain('"requestId"');
    expect(creationJson).not.toContain('"wallOrder"');
    for (const tileId of created.state.wall.tiles) {
      expect(creationJson).not.toContain(`"${tileId}"`);
    }

    const discarded = discardTile(
      engine,
      created.state,
      "east",
      created.state.hand.drawnTileId!,
      "public:discard",
    );
    expect(discarded.publicEvents).toEqual([
      expect.objectContaining({
        type: "tile_discarded",
        playerId: "east",
        tileTypeId: tileTypeFromInstanceId(created.state.hand.drawnTileId!),
      }),
    ]);
    expect(JSON.stringify(discarded.publicEvents)).not.toContain("optionsByPlayer");

    const responder = discarded.state.pending?.eligiblePlayerIds[0];
    if (responder === undefined) {
      throw new Error("Expected a public-event claim responder");
    }
    const hidden = submit(
      engine,
      discarded.state,
      responder,
      actionOfType(engine, discarded.state, responder, "pass"),
      "public:hidden-response",
    );
    expect(hidden.events.map(({ type }) => type)).toEqual(["claim_response_recorded"]);
    expect(hidden.publicEvents).toEqual([]);
  });

  it("repeats East after a configured dealer win and starts a deterministic next hand", () => {
    const wall = scenarioWall({
      id: "m2_dealer_repeat_v1",
      partialHands: { east: dealerWinningTiles },
    });
    const engine = createEngine(TRAINING_RULESET, wall);
    const created = createState(engine, TRAINING_RULESET, "dealer-repeat");
    const won = submit(
      engine,
      created.state,
      "east",
      actionOfType(engine, created.state, "east", "declare_win"),
      "dealer-repeat:win",
    );

    expect(won.state.phase).toBe("hand_ended");
    expect(won.state.match.handsCompleted).toBe(1);
    expect(computeRoundProgression(won.state)).toMatchObject({
      dealerRepeated: true,
      matchComplete: false,
      handIndex: 1,
      windHandIndex: 0,
      dealerPlayerId: "east",
    });
    expect(engine.observation(won.state, "south")).toMatchObject({
      result: { kind: "win", winners: [{ playerId: "east" }] },
      round: { progression: "repeat_dealer" },
    });
    const terminalReplay = createOmniscientReplayView(won.state);
    const settledEastScore = won.state.players.east!.score;
    terminalReplay.state.players.east!.score += 99;
    expect(won.state.players.east?.score).toBe(settledEastScore);

    const started = startNextHand(engine, won.state, "south", "dealer-repeat:next");
    expect(started.events.map(({ type }) => type)).toEqual([
      "next_hand_started",
      "initial_deal_completed",
    ]);
    expect(started.state).toMatchObject({
      phase: "awaiting_discard",
      match: {
        handIndex: 1,
        handsCompleted: 1,
        prevailingWindIndex: 0,
        windHandIndex: 0,
        dealerPlayerId: "east",
      },
      hand: {
        id: `hand:${created.state.gameId}:${created.state.branchId}:1`,
        seed: deriveSeed(created.state.seed, "hand", "1"),
        dealerPlayerId: "east",
      },
    });
    expect(started.state.players.east?.seat).toBe("east");
    expect(replayEvents([...created.events, ...won.events, ...started.events])).toEqual(
      started.state,
    );
  });

  it("suppresses an otherwise complete initial-deal win when the profile disables it", () => {
    const ruleset = withRules(TRAINING_RULESET, { initialDealWinsEnabled: false });
    const wall = scenarioWall({
      id: "m2_initial_win_disabled_v1",
      ruleset,
      partialHands: { east: dealerWinningTiles },
    });
    const engine = createEngine(ruleset, wall);
    const { state } = createState(engine, ruleset, "initial-win-disabled");
    expect(engine.legalActions(state, "east").some(({ type }) => type === "declare_win")).toBe(
      false,
    );
    expect(engine.observation(state, "east").winAssessment).toBeNull();
  });

  it("rotates every dealer, advances winds, and terminates configured schedules", () => {
    const runSchedule = (matchLength: CreateGameCommand["matchLength"], handCount: number) => {
      const engine = createEngine();
      const created = createState(engine, TRAINING_RULESET, `schedule:${matchLength}`, {
        mode: "sandbox",
        matchLength,
      });
      let state = created.state;
      const liveSandboxReplay = createOmniscientReplayView(state);
      liveSandboxReplay.state.players.east!.score += 99;
      expect(state.players.east?.score).toBe(500);
      const events = [...created.events];
      const publicEvents = [...created.publicEvents];
      for (let hand = 0; hand < handCount; hand += 1) {
        const ended = endSandboxHand(engine, state, `schedule:${matchLength}:end:${String(hand)}`);
        state = ended.state;
        events.push(...ended.events);
        publicEvents.push(...ended.publicEvents);
        expect(engine.observation(state, "east").round.progression).toBe(
          hand === handCount - 1 ? "match_complete" : "advance_dealer",
        );
        if (hand === handCount - 1) {
          break;
        }
        expect(state.phase).toBe("hand_ended");
        const started = startNextHand(
          engine,
          state,
          "east",
          `schedule:${matchLength}:start:${String(hand + 1)}`,
        );
        state = started.state;
        events.push(...started.events);
        publicEvents.push(...started.publicEvents);
      }
      return { engine, created, state, events, publicEvents };
    };

    const oneWind = runSchedule("one_wind", 4);
    expect(oneWind.state).toMatchObject({
      phase: "match_ended",
      match: {
        prevailingWind: "east",
        prevailingWindIndex: 0,
        windHandIndex: 3,
        handIndex: 3,
        handsCompleted: 4,
        dealerPlayerId: "north",
      },
    });
    expect(oneWind.state.players.north?.seat).toBe("east");
    expect(oneWind.engine.legalActions(oneWind.state, "east")).toEqual([]);
    expect(replayEvents(oneWind.events)).toEqual(oneWind.state);
    expect(projectPublicEventStream(oneWind.events)).toEqual(oneWind.publicEvents);
    expect(oneWind.publicEvents.slice(-2).map(({ type }) => type)).toEqual([
      "hand_ended",
      "match_ended",
    ]);

    const fourWinds = runSchedule("full_four_winds", 16);
    expect(fourWinds.state).toMatchObject({
      phase: "match_ended",
      match: {
        prevailingWind: "north",
        prevailingWindIndex: 3,
        windHandIndex: 3,
        handIndex: 15,
        handsCompleted: 16,
        dealerPlayerId: "north",
      },
    });
    expect(replayEvents(fourWinds.events)).toEqual(fourWinds.state);
  });

  it("honors dealer-win and multi-winner repeat switches", () => {
    const noWinRepeat = withRules(TRAINING_RULESET, { dealerRepeatsOnWin: false });
    const wall = scenarioWall({
      id: "m2_dealer_rotate_after_win_v1",
      ruleset: noWinRepeat,
      partialHands: { east: dealerWinningTiles },
    });
    const engine = createEngine(noWinRepeat, wall);
    const created = createState(engine, noWinRepeat, "dealer-no-repeat");
    const won = submit(
      engine,
      created.state,
      "east",
      actionOfType(engine, created.state, "east", "declare_win"),
      "dealer-no-repeat:win",
    );
    expect(computeRoundProgression(won.state)).toMatchObject({
      dealerRepeated: false,
      dealerPlayerId: "south",
      windHandIndex: 1,
    });

    const multipleWinnerState = structuredClone(won.state);
    multipleWinnerState.ruleset.dealerRepeatsOnWin = true;
    multipleWinnerState.ruleset.dealerRepeatsWhenAmongMultipleWinners = false;
    if (multipleWinnerState.hand.result?.kind !== "win") {
      throw new Error("Expected a winning progression fixture");
    }
    multipleWinnerState.hand.result.winners.push({
      ...multipleWinnerState.hand.result.winners[0]!,
      playerId: "south",
    });
    expect(computeRoundProgression(multipleWinnerState).dealerRepeated).toBe(false);
    multipleWinnerState.ruleset.dealerRepeatsWhenAmongMultipleWinners = true;
    expect(computeRoundProgression(multipleWinnerState).dealerRepeated).toBe(true);
  });
});

describe("kong transitions", () => {
  it("completes a concealed kong and draws its replacement from the back", () => {
    const wall = scenarioWall({
      id: "m2_concealed_kong_v1",
      partialHands: {
        east: ["dots.9#1", "dots.9#2", "dots.9#3", "dots.9#4"],
      },
      replacementDraws: ["dragon.white#4"],
    });
    const engine = createEngine(TRAINING_RULESET, wall);
    let { state } = createState(engine, TRAINING_RULESET, "concealed-kong");
    const action = engine
      .legalActions(state, "east")
      .find(
        (candidate): candidate is Extract<LegalAction, { type: "declare_concealed_kong" }> =>
          candidate.type === "declare_concealed_kong" &&
          candidate.tileIds.every((tileId) => tileTypeFromInstanceId(tileId) === "dots.9"),
      );
    if (action === undefined) {
      throw new Error("Expected the pinned Dots concealed kong");
    }
    const result = submit(engine, state, "east", action, "east:concealed-kong");
    state = result.state;

    expect(result.events.map(({ type }) => type)).toEqual(["kong_completed", "draw_completed"]);
    expect(state.players.east?.melds[0]).toMatchObject({
      kind: "kong",
      kongKind: "concealed",
      exposed: false,
    });
    expect(state.players.east?.concealed).toContain("dragon.white#4");
    expect(state.hand.drawnTileId).toBe("dragon.white#4");
    expect(state.phase).toBe("awaiting_discard");
    assertStateInvariants(state);
  });

  it("resolves an exposed kong above lower claims and draws a replacement", () => {
    const wall = scenarioWall({
      id: "m2_exposed_kong_v1",
      partialHands: {
        east: ["characters.5#1"],
        south: ["characters.5#2", "characters.5#3", "characters.5#4"],
      },
      replacementDraws: ["dragon.white#4"],
    });
    const engine = createEngine(TRAINING_RULESET, wall);
    let { state } = createState(engine, TRAINING_RULESET, "exposed-kong");
    state = discardTile(engine, state, "east", "characters.5#1", "east:discard-five").state;
    state = respond(engine, state, "south", "claim_kong", "south:claim-kong").state;
    state = respond(engine, state, "west", "pass", "west:pass-kong").state;
    const resolved = respond(engine, state, "north", "pass", "north:pass-kong");
    state = resolved.state;

    expect(resolved.events.map(({ type }) => type)).toEqual([
      "claim_response_recorded",
      "meld_claimed",
      "draw_completed",
    ]);
    expect(state.players.south?.melds[0]).toMatchObject({
      kind: "kong",
      kongKind: "exposed",
      tileIds: ["characters.5#1", "characters.5#2", "characters.5#3", "characters.5#4"],
    });
    expect(state.players.south?.concealed).toContain("dragon.white#4");
    expect(state.hand.activePlayerId).toBe("south");
    expect(state.phase).toBe("awaiting_discard");
    assertStateInvariants(state);
  });

  it("offers and resolves concealed-kong robbery without duplicating the tile", () => {
    const robberyRuleset = withRules(TRAINING_RULESET, {
      robConcealedKong: true,
      concealedKongRobberyForms: ["thirteen_orphans"],
    });
    const wall = scenarioWall({
      id: "m2_concealed_kong_robbed_v1",
      ruleset: robberyRuleset,
      partialHands: {
        east: ["wind.east#1", "wind.east#2", "wind.east#3", "wind.east#4"],
        north: [
          "characters.1#1",
          "characters.9#1",
          "dots.1#1",
          "dots.9#1",
          "bamboo.1#1",
          "bamboo.9#1",
          "wind.south#1",
          "wind.west#1",
          "wind.north#1",
          "dragon.red#1",
          "dragon.red#2",
          "dragon.green#1",
          "dragon.white#1",
        ],
      },
    });
    const engine = createEngine(robberyRuleset, wall);
    let { state } = createState(engine, robberyRuleset, "concealed-robbery");
    const eastWindKong = engine
      .legalActions(state, "east")
      .find(
        (candidate): candidate is Extract<LegalAction, { type: "declare_concealed_kong" }> =>
          candidate.type === "declare_concealed_kong" &&
          candidate.tileIds.every((tileId) => tileTypeFromInstanceId(tileId) === "wind.east"),
      );
    if (eastWindKong === undefined) {
      throw new Error("Expected the pinned East Wind concealed kong");
    }
    state = submit(engine, state, "east", eastWindKong, "east:propose-concealed").state;

    expect(state.phase).toBe("awaiting_kong_robbery");
    expect(actionOfType(engine, state, "north", "claim_win").preview.winningForm).toBe(
      "thirteen_orphans",
    );
    state = respond(engine, state, "north", "claim_win", "north:rob-concealed").state;
    state = respond(engine, state, "south", "pass", "south:pass-robbery").state;
    state = respond(engine, state, "west", "pass", "west:pass-robbery").state;

    expect(state.phase).toBe("hand_ended");
    expect(state.hand.winningTileZone).toEqual(["wind.east#1"]);
    expect(state.players.east?.concealed).not.toContain("wind.east#1");
    expect(state.players.east?.concealed).toEqual(
      expect.arrayContaining(["wind.east#2", "wind.east#3", "wind.east#4"]),
    );
    expect(state.players.east?.melds).toHaveLength(0);
    assertStateInvariants(state);
  });

  it("allows a configured standard-form concealed-kong robbery and completes it after passes", () => {
    const robberyRuleset = withRules(TRAINING_RULESET, {
      robConcealedKong: true,
      concealedKongRobberyForms: ["standard"],
      sameTileWinLockUntilNextDraw: true,
      passedWinLockIncludesKongRobbery: true,
      multipleWinners: true,
    });
    const wall = scenarioWall({
      id: "m2_concealed_kong_standard_v1",
      ruleset: robberyRuleset,
      partialHands: {
        east: ["characters.3#1", "characters.3#2", "characters.3#3", "characters.3#4"],
        south: [
          "characters.1#2",
          "characters.2#2",
          "dots.4#1",
          "dots.5#1",
          "dots.6#1",
          "bamboo.4#1",
          "bamboo.5#1",
          "bamboo.6#1",
          "dragon.green#1",
          "dragon.green#2",
          "dragon.green#3",
          "wind.south#1",
          "wind.south#2",
        ],
        north: [
          "characters.1#1",
          "characters.2#1",
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
        ],
      },
      replacementDraws: ["dragon.white#4"],
    });
    const engine = createEngine(robberyRuleset, wall);
    const created = createState(engine, robberyRuleset, "concealed-standard-robbery");
    const kong = engine
      .legalActions(created.state, "east")
      .find(
        (candidate): candidate is Extract<LegalAction, { type: "declare_concealed_kong" }> =>
          candidate.type === "declare_concealed_kong" &&
          candidate.tileIds.every((tileId) => tileTypeFromInstanceId(tileId) === "characters.3"),
      );
    if (kong === undefined) {
      throw new Error("Expected the pinned Characters 3 concealed kong");
    }
    const proposed = submit(engine, created.state, "east", kong, "concealed-standard:propose");
    expect(proposed.state.phase).toBe("awaiting_kong_robbery");
    const northWin = actionOfType(engine, proposed.state, "north", "claim_win");
    expect(northWin.preview).toMatchObject({
      legalWin: true,
      winningForm: "standard",
    });

    const claimResponse = submit(
      engine,
      proposed.state,
      "north",
      northWin,
      "concealed-standard:claim-branch",
    );
    expect(claimResponse.events[0]).toMatchObject({
      type: "claim_response_recorded",
      passedWinLockTileTypeId: null,
    });
    let claimedState = claimResponse.state;
    claimedState = respond(
      engine,
      claimedState,
      "south",
      "claim_win",
      "concealed-standard:south-claim",
    ).state;
    claimedState = respond(
      engine,
      claimedState,
      "west",
      "pass",
      "concealed-standard:west-pass",
    ).state;
    expect(claimedState.hand.result).toMatchObject({
      kind: "win",
      winners: [{ playerId: "south" }, { playerId: "north" }],
    });

    const completed = passEveryResponder(engine, proposed.state, "concealed-standard:pass-branch");
    expect(completed.events.slice(-2).map(({ type }) => type)).toEqual([
      "kong_completed",
      "draw_completed",
    ]);
    expect(completed.state.players.east?.melds).toContainEqual(
      expect.objectContaining({
        kind: "kong",
        kongKind: "concealed",
        tileIds: ["characters.3#1", "characters.3#2", "characters.3#3", "characters.3#4"],
      }),
    );
    expect(completed.state.hand.drawnTileId).toBe("dragon.white#4");
    assertStateInvariants(completed.state);
  });

  it("keeps an added-kong pung unchanged until all robbery responses pass", () => {
    const setup = setupAddedKong(TRAINING_RULESET, "added-pass");
    const { engine } = setup;
    let { state } = setup;
    const action = actionOfType(engine, state, "south", "declare_added_kong");
    const proposed = submit(engine, state, "south", action, "added-pass:propose");
    state = proposed.state;

    expect(proposed.events.map(({ type }) => type)).toEqual(["kong_proposed"]);
    expect(state.phase).toBe("awaiting_kong_robbery");
    expect(engine.observation(state, "north").pending).toMatchObject({
      kind: "kong_robbery",
      sourcePlayerId: "south",
      tileTypeId: "characters.5",
      kongKind: "added",
    });
    expect(engine.observation(state, "south").claimWinAssessment).toBeNull();
    expect(state.players.south?.melds[0]).toMatchObject({
      kind: "pung",
      tileIds: ["characters.5#1", "characters.5#2", "characters.5#3"],
    });
    expect(state.players.south?.concealed).toContain("characters.5#4");

    const passed = passEveryResponder(engine, state, "added-pass:robbery");
    state = passed.state;
    expect(passed.events.slice(-2).map(({ type }) => type)).toEqual([
      "kong_completed",
      "draw_completed",
    ]);
    expect(state.players.south?.melds[0]).toMatchObject({
      kind: "kong",
      kongKind: "added",
      tileIds: ["characters.5#1", "characters.5#2", "characters.5#3", "characters.5#4"],
    });
    expect(state.hand.drawnTileId).toBe("dragon.white#4");
    assertStateInvariants(state);
  });

  it("completes an added kong immediately when robbery is disabled", () => {
    const noRobberyRuleset = withRules(TRAINING_RULESET, { robAddedKong: false });
    const setup = setupAddedKong(noRobberyRuleset, "added-no-robbery");
    const completed = submit(
      setup.engine,
      setup.state,
      "south",
      actionOfType(setup.engine, setup.state, "south", "declare_added_kong"),
      "added-no-robbery:declare",
    );

    expect(completed.events.map(({ type }) => type)).toEqual(["kong_completed", "draw_completed"]);
    expect(completed.state.phase).toBe("awaiting_discard");
    expect(completed.state.players.south?.melds[0]).toMatchObject({
      kind: "kong",
      kongKind: "added",
    });
  });

  it("does not apply a passed-win lock to robbery when the profile excludes robbery", () => {
    const ruleset = withRules(TRAINING_RULESET, {
      sameTileWinLockUntilNextDraw: true,
      passedWinLockIncludesKongRobbery: false,
    });
    const setup = setupAddedKong(ruleset, "robbery-no-lock");
    let { state } = submit(
      setup.engine,
      setup.state,
      "south",
      actionOfType(setup.engine, setup.state, "south", "declare_added_kong"),
      "robbery-no-lock:propose",
    );
    state = respond(
      setup.engine,
      state,
      "north",
      "pass",
      "robbery-no-lock:robbery:north-pass",
    ).state;
    expect(state.players.north?.temporaryRestrictions).toEqual([]);
  });

  it("leaves the pung intact and draws no replacement when an added kong is robbed", () => {
    const setup = setupAddedKong(TRAINING_RULESET, "added-robbed");
    const { engine } = setup;
    let { state } = setup;
    state = submit(
      engine,
      state,
      "south",
      actionOfType(engine, state, "south", "declare_added_kong"),
      "added-robbed:propose",
    ).state;
    state = respond(engine, state, "north", "claim_win", "added-robbed:north-win").state;
    state = respond(engine, state, "east", "pass", "added-robbed:robbery-east-pass").state;
    state = respond(engine, state, "west", "pass", "added-robbed:robbery-west-pass").state;

    expect(state.phase).toBe("hand_ended");
    expect(state.players.south?.melds[0]).toMatchObject({
      kind: "pung",
      tileIds: ["characters.5#1", "characters.5#2", "characters.5#3"],
    });
    expect(state.players.south?.concealed).not.toContain("characters.5#4");
    expect(state.players.south?.concealed).not.toContain("dragon.white#4");
    expect(state.hand.winningTileZone).toEqual(["characters.5#4"]);
    expect(state.hand.result).toMatchObject({
      kind: "win",
      winners: [{ playerId: "north", source: "robbing_kong" }],
    });
    assertStateInvariants(state);
  });
});

describe("wall exhaustion", () => {
  it("resolves the final discard window before ending an exhaustive 136-tile hand", () => {
    const noBonusRuleset = withRules(TRAINING_RULESET, {
      bonusTilesEnabled: false,
    });
    const engine = createEngine(noBonusRuleset);
    const created = createState(engine, noBonusRuleset, "exhaustive-136");
    let { state } = created;
    const events = [...created.events];
    let requestIndex = 0;

    while (state.phase !== "hand_ended" && requestIndex < 1_000) {
      if (state.phase === "awaiting_discard") {
        const playerId = state.hand.activePlayerId;
        const drawnTileId = state.hand.drawnTileId;
        const actions = engine.legalActions(state, playerId);
        const discard = actions.find(
          (candidate): candidate is Extract<LegalAction, { type: "discard" }> =>
            candidate.type === "discard" &&
            (drawnTileId === null || candidate.tileId === drawnTileId),
        );
        if (discard === undefined) {
          throw new Error("Exhaustion simulation lacks a discard");
        }
        const result = submit(
          engine,
          state,
          playerId,
          discard,
          `exhaust:discard:${String(requestIndex)}`,
        );
        state = result.state;
        events.push(...result.events);
      } else {
        const playerId = state.pending?.eligiblePlayerIds.find(
          (candidateId) => state.pending?.responses[candidateId] === undefined,
        );
        if (playerId === undefined) {
          throw new Error("Exhaustion simulation lacks a pending responder");
        }
        const result = respond(
          engine,
          state,
          playerId,
          "pass",
          `exhaust:pass:${String(requestIndex)}`,
        );
        state = result.state;
        events.push(...result.events);
      }
      requestIndex += 1;
    }

    expect(requestIndex).toBeLessThan(1_000);
    expect(state.phase).toBe("hand_ended");
    expect(state.hand.result?.kind).toBe("exhaustive_draw");
    expect(state.wall.liveIndex).toBe(state.wall.replacementIndex + 1);
    expect(events.at(-1)?.type).toBe("hand_ended");
    expect(computeRoundProgression(state)).toMatchObject({
      dealerRepeated: true,
      dealerPlayerId: "east",
    });
    expect(engine.observation(state, "south").result).toMatchObject({
      kind: "exhaustive_draw",
      winners: [],
    });
    const noDrawRepeat = structuredClone(state);
    noDrawRepeat.ruleset.dealerRepeatsOnDraw = false;
    expect(computeRoundProgression(noDrawRepeat)).toMatchObject({
      dealerRepeated: false,
      dealerPlayerId: "south",
    });
    assertStateInvariants(state);
    expect(replayEvents(events)).toEqual(state);
  }, 60_000);
});

describe("authoritative replay validation", () => {
  it("rejects malformed stream identity, historical RNG, setup, and initial-deal events", () => {
    const engine = createEngine();
    const created = createState(engine, TRAINING_RULESET, "reducer-setup");
    const [gameCreated, initialDeal] = created.events;
    if (gameCreated?.type !== "game_created" || initialDeal?.type !== "initial_deal_completed") {
      throw new Error("Expected the canonical creation event pair");
    }

    expect(() => replayEvents([])).toThrow(/empty event stream/u);
    expect(() => replayEvents([initialDeal])).toThrow(/begin with game_created/u);

    const corruptCreation = (
      mutate: (event: Extract<GameEvent, { type: "game_created" }>) => void,
    ): void => {
      const event = structuredClone(gameCreated);
      mutate(event);
      expect(() => replayEvents([event])).toThrow();
    };
    corruptCreation((event) => {
      event.revision = 2;
    });
    corruptCreation((event) => {
      event.id = "event:wrong";
    });
    corruptCreation((event) => {
      event.rngVersion = "future-rng-v2";
    });
    corruptCreation((event) => {
      event.players[1]!.seat = "east";
    });
    corruptCreation((event) => {
      event.wallOrder = [...event.wallOrder.slice(1), event.wallOrder[1]!];
    });

    const secondCreation = structuredClone(gameCreated);
    secondCreation.revision = 2;
    secondCreation.id = `event:${secondCreation.gameId}:${secondCreation.branchId}:2`;
    secondCreation.requestId = "second-create";
    expect(() => replayEvents([gameCreated, secondCreation])).toThrow(
      /game_created can only be reduced/u,
    );

    const corruptDeal = structuredClone(initialDeal);
    corruptDeal.trace = corruptDeal.trace.slice(1);
    expect(() => replayEvents([gameCreated, corruptDeal])).toThrow(/does not match/u);

    const wrongGame = structuredClone(initialDeal);
    wrongGame.gameId = "game:other";
    expect(() => replayEvents([gameCreated, wrongGame])).toThrow(/does not match/u);
    const skippedRevision = structuredClone(initialDeal);
    skippedRevision.revision += 1;
    expect(() => replayEvents([gameCreated, skippedRevision])).toThrow(/does not follow/u);
    const noncanonicalId = structuredClone(initialDeal);
    noncanonicalId.id = "event:bad";
    expect(() => replayEvents([gameCreated, noncanonicalId])).toThrow(/canonical revision/u);
  });

  it("rejects corrupted draw provenance, wall direction, disposition, and outcomes", () => {
    const engine = createEngine();
    const created = createState(engine, TRAINING_RULESET, "reducer-draw");
    const turn = discardCurrentAndPass(engine, created.state, "reducer-draw");
    const stream = [...created.events, ...turn.events];
    const drawIndex = stream.findIndex(({ type }) => type === "draw_completed");
    const draw = stream[drawIndex];
    if (draw?.type !== "draw_completed" || drawIndex < 1) {
      throw new Error("Expected an ordinary draw event");
    }
    const before = replayEvents(stream.slice(0, drawIndex));
    const rejects = (
      mutate: (event: Extract<GameEvent, { type: "draw_completed" }>) => void,
      message: RegExp,
    ): void => {
      const event = structuredClone(draw);
      mutate(event);
      expect(() => reduceGameEvent(before, event)).toThrow(message);
    };

    rejects((event) => {
      event.fromWindowId = "window:missing";
    }, /unavailable window/u);
    rejects((event) => {
      event.steps = event.steps.map((step, index) =>
        index === 0 ? { ...step, finalLiveTile: !step.finalLiveTile } : step,
      );
    }, /final-live provenance/u);
    rejects((event) => {
      event.steps = event.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              tileId: before.wall.tiles[before.wall.liveIndex + 1]!,
            }
          : step,
      );
    }, /does not match live wall tile/u);
    rejects((event) => {
      event.steps = event.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              disposition: step.disposition === "bonus" ? "concealed" : "bonus",
            }
          : step,
      );
    }, /does not match its tile definition/u);
    rejects((event) => {
      event.outcome = "replacement_exhausted";
    }, /requires no standard draw and an empty wall/u);
    rejects((event) => {
      event.steps = [];
    }, /ready draw event must end/u);

    const afterDiscardIndex = stream.findIndex(({ type }) => type === "tile_discarded");
    const afterDiscard = replayEvents(stream.slice(0, afterDiscardIndex + 1));
    const prematureDraw = structuredClone(draw);
    prematureDraw.revision = afterDiscard.revision + 1;
    prematureDraw.id = `event:${afterDiscard.gameId}:${afterDiscard.branchId}:${String(prematureDraw.revision)}`;
    expect(() => reduceGameEvent(afterDiscard, prematureDraw)).toThrow(/every claim response/u);
  });

  it("rejects closed, duplicated, fabricated, and lock-corrupted claim responses", () => {
    const engine = createEngine();
    const created = createState(engine, TRAINING_RULESET, "reducer-response");
    const discarded = discardTile(
      engine,
      created.state,
      "east",
      created.state.hand.drawnTileId!,
      "reducer-response:discard",
    );
    const responder = discarded.state.pending?.eligiblePlayerIds[0];
    if (responder === undefined) {
      throw new Error("Expected a claim responder");
    }
    const recorded = respond(engine, discarded.state, responder, "pass", "reducer-response:pass");
    const response = recorded.events[0];
    if (response?.type !== "claim_response_recorded") {
      throw new Error("Expected a recorded claim response");
    }
    const rejects = (
      mutate: (event: Extract<GameEvent, { type: "claim_response_recorded" }>) => void,
      message: RegExp,
    ): void => {
      const event = structuredClone(response);
      mutate(event);
      expect(() => reduceGameEvent(discarded.state, event)).toThrow(message);
    };
    rejects((event) => {
      event.windowId = "window:closed";
    }, /closed window/u);
    rejects((event) => {
      event.playerId = "east";
    }, /unused emitted option/u);
    rejects((event) => {
      event.action = { ...event.action, id: "claim:fabricated" };
    }, /unused emitted option/u);
    rejects((event) => {
      event.passedWinLockTileTypeId = "characters.1";
    }, /invalid passed-win restriction/u);

    const duplicate = structuredClone(response);
    duplicate.revision = recorded.state.revision + 1;
    duplicate.id = `event:${recorded.state.gameId}:${recorded.state.branchId}:${String(duplicate.revision)}`;
    expect(() => reduceGameEvent(recorded.state, duplicate)).toThrow(/unused emitted option/u);
  });
});

describe("legal-sequence properties", () => {
  it("preserves conservation, replay identity, action IDs, and redaction", () => {
    const noBonusRuleset = withRules(TRAINING_RULESET, {
      bonusTilesEnabled: false,
    });
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9][a-z0-9_-]{0,23}$/u),
        fc.boolean(),
        fc.array(fc.nat(), { maxLength: 35 }),
        (seed, bonusTilesEnabled, selectors) => {
          const ruleset = bonusTilesEnabled ? TRAINING_RULESET : noBonusRuleset;
          const engine = createEngine(ruleset);
          const created = createState(engine, ruleset, seed);
          let state = created.state;
          const events: GameEvent[] = [];
          let incrementallyReduced: GameState | undefined;

          const acceptEvents = (nextEvents: readonly GameEvent[]): void => {
            for (const event of nextEvents) {
              incrementallyReduced = engine.reduce(incrementallyReduced, event);
              assertStateInvariants(incrementallyReduced);
              events.push(event);
            }
          };
          acceptEvents(created.events);
          expect(incrementallyReduced).toEqual(state);

          for (const [index, selector] of selectors.entries()) {
            if (state.phase === "hand_ended" || state.phase === "match_ended") {
              break;
            }
            let playerId: PlayerId | undefined;
            if (state.phase === "awaiting_discard") {
              playerId = state.hand.activePlayerId;
            } else {
              const responders =
                state.pending?.eligiblePlayerIds.filter(
                  (candidateId) => state.pending?.responses[candidateId] === undefined,
                ) ?? [];
              playerId = responders[selector % responders.length];
            }
            if (playerId === undefined) {
              throw new Error("Generated legal sequence has no acting player");
            }
            const actions = engine.legalActions(state, playerId);
            expect(actions).toEqual(engine.legalActions(state, playerId));
            expect(new Set(actions.map(({ id }) => id)).size).toBe(actions.length);
            const action = actions[selector % actions.length];
            if (action === undefined) {
              throw new Error("Generated legal sequence has no emitted action");
            }
            const result = engine.decide(state, {
              type: "submit_action",
              gameId: state.gameId,
              branchId: state.branchId,
              playerId,
              expectedRevision: state.revision,
              requestId: `property:${String(index)}`,
              actionId: action.id,
            });
            expect(result.accepted).toBe(true);
            if (!result.accepted) {
              throw new Error(result.error.message);
            }
            expect(result.state.revision - state.revision).toBe(result.events.length);
            acceptEvents(result.events);
            state = result.state;
            expect(incrementallyReduced).toEqual(state);

            for (const viewerId of ["east", "south", "west", "north"] as const) {
              const json = JSON.stringify(engine.observation(state, viewerId));
              for (const opponent of Object.values(state.players)) {
                if (opponent.id !== viewerId) {
                  for (const tileId of opponent.concealed) {
                    expect(json).not.toContain(`"${tileId}"`);
                  }
                }
              }
              for (const tileId of state.wall.tiles.slice(
                state.wall.liveIndex,
                state.wall.replacementIndex + 1,
              )) {
                expect(json).not.toContain(`"${tileId}"`);
              }
            }
          }

          const parsed: unknown = JSON.parse(JSON.stringify(events));
          expect(replayEvents(parsed as GameEvent[])).toEqual(state);
        },
      ),
      {
        numRuns: 24,
        endOnFailure: true,
      },
    );
  }, 60_000);
});
