import { canonicalJsonHash } from "./canonical.js";
import { planInitialDeal } from "./dealing.js";
import {
  type AssignedPlayer,
  type ClaimWindowAction,
  type CoreGameRules,
  type CreateEngineResult,
  type CreateGameCommand,
  type DrawCompletedEvent,
  type DrawStep,
  type EngineDependencies,
  type EngineError,
  type EngineErrorCode,
  type EngineResult,
  type GameCommand,
  type GameEngine,
  type GameEvent,
  type GameState,
  type LegalAction,
  MAIN_BRANCH_ID,
  type PendingDecision,
  type PlayerId,
  type PlayerObservation,
  type PublicGameEvent,
  type RequestId,
  type ScoringAssessment,
  type ScoringAssessmentInput,
  type ScoringBreakdown,
  type ScoringPreview,
  type SubmitActionCommand,
  type WallProviderContext,
  type WinnerRecord,
  type WinSource,
} from "./domain.js";
import { assertStateInvariants, assertUniqueActionIds } from "./invariants.js";
import { computeRoundProgression } from "./progression.js";
import { createSeededRandom, shuffle, type RandomSource } from "./rng.js";
import { deriveSeed } from "./rng.js";
import { seatDistance, seatsAfter, WINDS, type Wind } from "./seats.js";
import {
  createTileInventory,
  getTileDefinition,
  sortTileInstances,
  tileTypeFromInstanceId,
  type TileInstanceId,
  type TileTypeId,
} from "./tiles.js";
import { createPlayerObservation } from "./observation.js";
import { projectPublicEvent } from "./public-events.js";
import { reduceGameEvent } from "./reducer.js";

type EventMetadataKey = "id" | "gameId" | "branchId" | "revision" | "requestId" | "visibility";
type EventPayload = GameEvent extends infer Event
  ? Event extends GameEvent
    ? Omit<Event, EventMetadataKey>
    : never
  : never;

interface MutableEventBatch {
  state: GameState | undefined;
  events: GameEvent[];
  publicEvents: PublicGameEvent[];
}

const error = (
  code: EngineErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): EngineError => ({ code, message, details });

const rejectedCreate = (
  code: EngineErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): CreateEngineResult => ({
  accepted: false,
  error: error(code, message, details),
  events: [],
  publicEvents: [],
});

const rejected = (
  state: GameState,
  code: EngineErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): EngineResult => ({
  accepted: false,
  state,
  error: error(code, message, details),
  events: [],
  publicEvents: [],
});

const appendEvent = (
  batch: MutableEventBatch,
  gameId: string,
  requestId: RequestId,
  visibility: "public" | "internal",
  payload: EventPayload,
  branchId = batch.state?.branchId ?? MAIN_BRANCH_ID,
): GameState => {
  const before = batch.state;
  const revision = (batch.state?.revision ?? 0) + 1;
  const event: GameEvent = {
    ...payload,
    id: `event:${gameId}:${branchId}:${String(revision)}`,
    gameId,
    branchId,
    revision,
    requestId,
    visibility,
  };
  const next = reduceGameEvent(batch.state, event);
  batch.events.push(event);
  batch.publicEvents.push(...projectPublicEvent(before, event, next));
  batch.state = next;
  return next;
};

const requireBatchState = (batch: MutableEventBatch): GameState => {
  /* v8 ignore next -- every caller appends or receives an event before requiring batch state */
  if (batch.state === undefined) {
    throw new Error("An event batch has no game state");
  }
  return batch.state;
};

const nonEmptyString = (value: string): boolean => value.trim().length > 0;

const validateRules = (rules: CoreGameRules): EngineError | null => {
  if (
    !nonEmptyString(rules.id) ||
    !nonEmptyString(rules.version) ||
    !/^sha256:[0-9a-f]{64}$/u.test(rules.hash)
  ) {
    return error("ruleset_invalid", "Ruleset identity is invalid");
  }
  if (
    !Number.isSafeInteger(rules.minimumFaan) ||
    rules.minimumFaan < 0 ||
    !Number.isSafeInteger(rules.capFaan) ||
    rules.capFaan < 1 ||
    rules.minimumFaan > rules.capFaan
  ) {
    return error("ruleset_invalid", "Ruleset faan limits are invalid");
  }
  if (
    rules.prevailingWinds.length < 1 ||
    rules.prevailingWinds.length > WINDS.length ||
    new Set(rules.prevailingWinds).size !== rules.prevailingWinds.length ||
    rules.prevailingWinds.some((wind) => !WINDS.includes(wind))
  ) {
    return error("ruleset_invalid", "Ruleset prevailing winds are invalid");
  }
  if (
    new Set(rules.concealedKongRobberyForms).size !== rules.concealedKongRobberyForms.length ||
    (!rules.robConcealedKong && rules.concealedKongRobberyForms.length > 0)
  ) {
    return error("ruleset_invalid", "Concealed-kong robbery settings are invalid");
  }
  return null;
};

const validateCreateCommand = (command: CreateGameCommand): EngineError | null => {
  const branchId: unknown = command.branchId;
  if (
    !nonEmptyString(command.requestId) ||
    !nonEmptyString(command.seed) ||
    branchId !== MAIN_BRANCH_ID
  ) {
    return error("invalid_request", "Create request ID, seed, and main branch ID must be valid");
  }
  const ids = command.players.map(({ id }) => id);
  if (ids.some((id) => !nonEmptyString(id)) || new Set(ids).size !== WINDS.length) {
    return error("invalid_request", "A game requires four distinct non-empty player IDs");
  }
  const specifiedSeats = command.players
    .map(({ seat }) => seat)
    .filter((seat): seat is Wind => seat !== undefined);
  if (
    specifiedSeats.some((seat) => !WINDS.includes(seat)) ||
    new Set(specifiedSeats).size !== specifiedSeats.length
  ) {
    return error("invalid_request", "Specified player seats must be distinct valid winds");
  }
  for (const player of command.players) {
    if (
      !nonEmptyString(player.displayName) ||
      (player.initialScore !== undefined &&
        (!Number.isSafeInteger(player.initialScore) || player.initialScore < 0))
    ) {
      return error("invalid_request", `Player ${player.id} has invalid setup data`);
    }
  }
  return validateRules(command.rules);
};

const assignPlayers = (
  command: CreateGameCommand,
  random: RandomSource,
): readonly AssignedPlayer[] => {
  const usedSeats = new Set(
    command.players.map(({ seat }) => seat).filter((seat): seat is Wind => seat !== undefined),
  );
  const remainingSeats = WINDS.filter((seat) => !usedSeats.has(seat));
  const unassigned = shuffle(
    command.players.filter(({ seat }) => seat === undefined),
    random,
  );
  const assignedSeatById = new Map<PlayerId, Wind>();
  for (const [index, player] of unassigned.entries()) {
    const seat = remainingSeats[index];
    /* v8 ignore next -- create validation guarantees equal unassigned-player and seat counts */
    if (seat === undefined) {
      throw new Error("Seat assignment exhausted the available seats");
    }
    assignedSeatById.set(player.id, seat);
  }
  return command.players.map((player) => {
    const seat = player.seat ?? assignedSeatById.get(player.id);
    /* v8 ignore next -- every validated player is assigned explicitly or by the loop above */
    if (seat === undefined) {
      throw new Error(`Player ${player.id} has no assigned seat`);
    }
    return {
      id: player.id,
      displayName: player.displayName,
      controller: player.controller,
      seat,
      initialScore: player.initialScore ?? 500,
    };
  });
};

const validateWallOrder = (
  wallOrder: readonly TileInstanceId[],
  inventory: readonly TileInstanceId[],
): void => {
  if (
    wallOrder.length !== inventory.length ||
    new Set(wallOrder).size !== inventory.length ||
    inventory.some((tileId) => !wallOrder.includes(tileId))
  ) {
    throw new TypeError("Wall provider must return the exact resolved physical inventory");
  }
};

const gameIdFor = (command: CreateGameCommand): string =>
  `game:${canonicalJsonHash({
    requestId: command.requestId,
    seed: command.seed,
    mode: command.mode,
    matchLength: command.matchLength,
    ruleset: {
      id: command.rules.id,
      version: command.rules.version,
      hash: command.rules.hash,
    },
    players: command.players,
  }).slice(0, 24)}`;

const playerIdAtSeat = (state: GameState, seat: Wind): PlayerId => {
  const player = Object.values(state.players).find((candidate) => candidate.seat === seat);
  /* v8 ignore next -- state invariants require exactly one player at every seat */
  if (player === undefined) {
    throw new Error(`No player occupies ${seat}`);
  }
  return player.id;
};

const opponentsAfter = (state: GameState, sourcePlayerId: PlayerId): readonly PlayerId[] => {
  const source = state.players[sourcePlayerId];
  /* v8 ignore next -- engine callers use an emitted action's existing source player */
  if (source === undefined) {
    throw new Error(`Unknown source player ${sourcePlayerId}`);
  }
  return seatsAfter(source.seat).map((seat) => playerIdAtSeat(state, seat));
};

const actionHash = (payload: Readonly<Record<string, unknown>>): string =>
  canonicalJsonHash(payload).slice(0, 20);

const decisionActionId = (
  state: GameState,
  playerId: PlayerId,
  type: LegalAction["type"],
  payload: Readonly<Record<string, unknown>>,
): string =>
  `action:${state.hand.id}:${state.lastEventId!}:${playerId}:${type}:${actionHash(payload)}`;

const windowActionId = (
  windowId: string,
  playerId: PlayerId,
  type: ClaimWindowAction["type"],
  payload: Readonly<Record<string, unknown>>,
): string => `claim:${windowId}:${playerId}:${type}:${actionHash(payload)}`;

const replacementReasonForState = (state: GameState): "bonus" | "kong" | null => {
  if (state.hand.lastDrawReason === "bonus_replacement") {
    return "bonus";
  }
  if (state.hand.lastDrawReason === "kong_replacement") {
    return "kong";
  }
  /* v8 ignore next -- replacement wins can follow only bonus or kong replacement draws */
  return null;
};

const assessmentInput = (
  state: GameState,
  playerId: PlayerId,
  winningTileId: TileInstanceId,
  winSource: WinSource,
  fromPlayerId: PlayerId | null,
  concealedTileIds: readonly TileInstanceId[],
  discardFollowedFinalLiveDraw: boolean,
  robbedKongKind: "added" | "concealed" | null,
): ScoringAssessmentInput => {
  const player = state.players[playerId];
  /* v8 ignore next -- self-win assessment is called only for an existing observation player */
  if (player === undefined) {
    throw new Error(`Cannot evaluate unknown player ${playerId}`);
  }
  return {
    rules: state.ruleset,
    mode: state.mode,
    player: {
      id: player.id,
      seat: player.seat,
      concealedTileIds,
      melds: player.melds,
      bonusTileIds: player.bonusTiles,
    },
    prevailingWind: state.match.prevailingWind,
    dealerPlayerId: state.match.dealerPlayerId,
    winningTileId,
    winSource,
    fromPlayerId,
    replacementReason: winSource === "replacement" ? replacementReasonForState(state) : null,
    isInitialDeal: winSource === "initial_deal",
    isDealerFirstDiscard:
      winSource === "discard" &&
      fromPlayerId === state.match.dealerPlayerId &&
      !state.hand.firstDiscardCompleted,
    initialBonusReplacementOccurred: state.hand.initialBonusReplacementOccurred,
    openingKongOccurred: state.hand.openingKongOccurred,
    firstDiscardCompleted: state.hand.firstDiscardCompleted,
    callsOccurred: state.hand.callsOccurred,
    robbedKongKind,
    winningTileWasFinalLiveTile: winSource === "self_draw" && state.hand.drawnTileWasFinalLiveTile,
    discardFollowedFinalLiveDraw,
  };
};

const hasSameTileWinLock = (
  state: GameState,
  playerId: PlayerId,
  tileTypeId: TileTypeId,
): boolean =>
  state.players[playerId]!.temporaryRestrictions.some(
    (restriction) => restriction.tileTypeId === tileTypeId,
  );

const selfWinPreview = (
  state: GameState,
  playerId: PlayerId,
  dependencies: EngineDependencies,
): { source: WinSource; preview: ScoringPreview } | null => {
  const player = state.players[playerId];
  const winningTileId = state.hand.drawnTileId;
  if (player === undefined || winningTileId === null) {
    return null;
  }
  const source: WinSource =
    state.hand.turnOrigin === "initial_deal"
      ? "initial_deal"
      : state.hand.lastDrawSource === "replacement"
        ? "replacement"
        : "self_draw";
  if (source === "initial_deal" && !state.ruleset.initialDealWinsEnabled) {
    return null;
  }
  return {
    source,
    preview: dependencies.scoringSystem.assess(
      assessmentInput(state, playerId, winningTileId, source, null, player.concealed, false, null),
    ).preview,
  };
};

const claimWinAssessment = (
  state: GameState,
  playerId: PlayerId,
  offeredTileId: TileInstanceId,
  sourcePlayerId: PlayerId,
  source: "discard" | "robbing_kong",
  discardFollowedFinalLiveDraw: boolean,
  robbedKongKind: "added" | "concealed" | null,
  dependencies: EngineDependencies,
): ScoringAssessment | null => {
  const player = state.players[playerId];
  /* v8 ignore next -- claim options are built only for known opponents */
  if (player === undefined) {
    return null;
  }
  const tileTypeId = tileTypeFromInstanceId(offeredTileId);
  const assessment = dependencies.scoringSystem.assess(
    assessmentInput(
      state,
      playerId,
      offeredTileId,
      source,
      sourcePlayerId,
      [...player.concealed, offeredTileId],
      discardFollowedFinalLiveDraw,
      robbedKongKind,
    ),
  );
  const preview = assessment.preview;
  const robberyFormAllowed =
    source !== "robbing_kong" ||
    robbedKongKind !== "concealed" ||
    (preview.winningForm === "standard" &&
      state.ruleset.concealedKongRobberyForms.includes("standard")) ||
    (preview.winningForm === "thirteen_orphans" &&
      state.ruleset.concealedKongRobberyForms.includes("thirteen_orphans"));
  if (preview.legalWin && !robberyFormAllowed) {
    return {
      ...assessment,
      preview: {
        ...preview,
        legalWin: false,
        reason: "kong_robbery_form_not_allowed",
      },
    };
  }
  return {
    ...assessment,
    preview:
      hasSameTileWinLock(state, playerId, tileTypeId) && preview.legalWin
        ? {
            ...preview,
            legalWin: false,
            reason: "passed_win_restriction",
          }
        : preview,
  };
};

const matchingConcealed = (
  state: GameState,
  playerId: PlayerId,
  tileTypeId: TileTypeId,
): readonly TileInstanceId[] =>
  sortTileInstances(
    state.players[playerId]!.concealed.filter(
      (tileId) => tileTypeFromInstanceId(tileId) === tileTypeId,
    ),
  );

const chowCompositions = (
  state: GameState,
  playerId: PlayerId,
  offeredTileId: TileInstanceId,
): readonly (readonly TileInstanceId[])[] => {
  const offered = getTileDefinition(tileTypeFromInstanceId(offeredTileId));
  if (offered.rank === undefined || !["characters", "dots", "bamboo"].includes(offered.category)) {
    return [];
  }
  const player = state.players[playerId];
  /* v8 ignore next -- chow compositions are requested only for a known claimant */
  if (player === undefined) {
    return [];
  }
  const results: TileInstanceId[][] = [];
  for (const start of [offered.rank - 2, offered.rank - 1, offered.rank]) {
    if (start < 1 || start + 2 > 9) {
      continue;
    }
    const neededRanks = [start, start + 1, start + 2].filter((rank) => rank !== offered.rank);
    const chosen: TileInstanceId[] = [];
    for (const rank of neededRanks) {
      const typeId = `${offered.category}.${String(rank)}` as TileTypeId;
      const tileId = sortTileInstances(
        player.concealed.filter((candidate) => tileTypeFromInstanceId(candidate) === typeId),
      )[0];
      if (tileId === undefined) {
        chosen.length = 0;
        break;
      }
      chosen.push(tileId);
    }
    if (chosen.length === 2) {
      results.push(chosen);
    }
  }
  return results;
};

interface ClaimOptionsResult {
  options: readonly ClaimWindowAction[];
  winAssessment: ScoringAssessment;
}

const claimOptionsForDiscard = (
  state: GameState,
  playerId: PlayerId,
  discarderId: PlayerId,
  tileId: TileInstanceId,
  discardId: string,
  windowId: string,
  followedFinalLiveDraw: boolean,
  dependencies: EngineDependencies,
): ClaimOptionsResult => {
  const options: ClaimWindowAction[] = [];
  const winAssessment = claimWinAssessment(
    state,
    playerId,
    tileId,
    discarderId,
    "discard",
    followedFinalLiveDraw,
    null,
    dependencies,
  );
  /* v8 ignore next -- discard options are generated only for known opponents */
  if (winAssessment === null) {
    throw new Error(`Cannot assess unknown discard claimant ${playerId}`);
  }
  const preview = winAssessment.preview;
  if (preview.legalWin) {
    options.push({
      id: windowActionId(windowId, playerId, "claim_win", {
        source: "discard",
        discardId,
      }),
      type: "claim_win",
      windowId,
      source: "discard",
      discardId,
      tileTypeId: tileTypeFromInstanceId(tileId),
      meldId: null,
      preview,
    });
  }

  const tileTypeId = tileTypeFromInstanceId(tileId);
  const matching = matchingConcealed(state, playerId, tileTypeId);
  if (matching.length >= 3 && state.wall.liveIndex <= state.wall.replacementIndex) {
    const tileIdsFromHand = matching.slice(0, 3);
    options.push({
      id: windowActionId(windowId, playerId, "claim_kong", {
        discardId,
        tileIdsFromHand,
      }),
      type: "claim_kong",
      discardId,
      tileIdsFromHand,
    });
  }
  if (matching.length >= 2) {
    const tileIdsFromHand = matching.slice(0, 2);
    options.push({
      id: windowActionId(windowId, playerId, "claim_pung", {
        discardId,
        tileIdsFromHand,
      }),
      type: "claim_pung",
      discardId,
      tileIdsFromHand,
    });
  }

  const discarder = state.players[discarderId];
  const claimant = state.players[playerId];
  if (
    discarder !== undefined &&
    claimant !== undefined &&
    seatDistance(discarder.seat, claimant.seat) === 1
  ) {
    for (const tileIdsFromHand of chowCompositions(state, playerId, tileId)) {
      options.push({
        id: windowActionId(windowId, playerId, "claim_chow", {
          discardId,
          tileIdsFromHand,
        }),
        type: "claim_chow",
        discardId,
        tileIdsFromHand,
      });
    }
  }

  options.push({
    id: windowActionId(windowId, playerId, "pass", { windowId }),
    type: "pass",
    windowId,
  });
  assertUniqueActionIds(options);
  return { options, winAssessment };
};

const claimOptionsForRobbery = (
  state: GameState,
  playerId: PlayerId,
  proposerId: PlayerId,
  tileId: TileInstanceId,
  windowId: string,
  kongKind: "added" | "concealed",
  meldId: string | null,
  dependencies: EngineDependencies,
): ClaimOptionsResult => {
  const options: ClaimWindowAction[] = [];
  const winAssessment = claimWinAssessment(
    state,
    playerId,
    tileId,
    proposerId,
    "robbing_kong",
    false,
    kongKind,
    dependencies,
  );
  /* v8 ignore next -- robbery options are generated only for known opponents */
  if (winAssessment === null) {
    throw new Error(`Cannot assess unknown kong-robbery claimant ${playerId}`);
  }
  const preview = winAssessment.preview;
  if (preview.legalWin) {
    options.push({
      id: windowActionId(windowId, playerId, "claim_win", {
        source: "robbing_kong",
        tileId,
      }),
      type: "claim_win",
      windowId,
      source: "robbing_kong",
      discardId: null,
      tileTypeId: tileTypeFromInstanceId(tileId),
      meldId,
      preview,
    });
  }
  options.push({
    id: windowActionId(windowId, playerId, "pass", { windowId }),
    type: "pass",
    windowId,
  });
  return { options, winAssessment };
};

const makeClaimWindowData = (
  playerIds: readonly PlayerId[],
  factory: (playerId: PlayerId) => ClaimOptionsResult,
): {
  optionsByPlayer: Readonly<Partial<Record<PlayerId, readonly ClaimWindowAction[]>>>;
  winAssessmentsByPlayer: Readonly<Partial<Record<PlayerId, ScoringAssessment>>>;
} => {
  const results = playerIds.map((playerId) => [playerId, factory(playerId)] as const);
  return {
    optionsByPlayer: Object.fromEntries(
      results.map(([playerId, result]) => [playerId, result.options]),
    ),
    winAssessmentsByPlayer: Object.fromEntries(
      results.map(([playerId, result]) => [playerId, result.winAssessment]),
    ),
  };
};

const finalLiveForCurrentDiscard = (state: GameState): boolean =>
  state.hand.turnOrigin !== "claim" && state.hand.turnConsumedFinalLiveTile;

const declareActions = (
  state: GameState,
  playerId: PlayerId,
  dependencies: EngineDependencies,
): readonly LegalAction[] => {
  if (state.phase !== "awaiting_discard" || state.hand.activePlayerId !== playerId) {
    return [];
  }
  const player = state.players[playerId];
  /* v8 ignore next -- the active player is guaranteed to exist by state invariants */
  if (player === undefined) return [];
  const actions: LegalAction[] = player.concealed.map((tileId) => ({
    id: decisionActionId(state, playerId, "discard", { tileId }),
    type: "discard",
    tileId,
  }));

  const win = selfWinPreview(state, playerId, dependencies);
  if (win?.preview.legalWin === true && state.hand.drawnTileId !== null) {
    actions.push({
      id: decisionActionId(state, playerId, "declare_win", {
        source: win.source,
        winningTileId: state.hand.drawnTileId,
      }),
      type: "declare_win",
      source: win.source,
      preview: win.preview,
    });
  }

  const kongAllowedAfterClaim =
    state.hand.turnOrigin !== "claim" || state.ruleset.allowKongImmediatelyAfterChowOrPung;
  if (kongAllowedAfterClaim && state.wall.liveIndex <= state.wall.replacementIndex) {
    const groups = new Map<TileTypeId, TileInstanceId[]>();
    for (const tileId of player.concealed) {
      const typeId = tileTypeFromInstanceId(tileId);
      const group = groups.get(typeId) ?? [];
      group.push(tileId);
      groups.set(typeId, group);
    }
    for (const tileIds of groups.values()) {
      if (tileIds.length === 4) {
        const sorted = sortTileInstances(tileIds);
        actions.push({
          id: decisionActionId(state, playerId, "declare_concealed_kong", {
            tileIds: sorted,
          }),
          type: "declare_concealed_kong",
          tileIds: sorted,
        });
      }
    }
    for (const meld of player.melds) {
      if (meld.kind !== "pung" || !meld.exposed) {
        continue;
      }
      const typeId = tileTypeFromInstanceId(meld.tileIds[0]!);
      const tileId = matchingConcealed(state, playerId, typeId)[0];
      if (tileId !== undefined) {
        actions.push({
          id: decisionActionId(state, playerId, "declare_added_kong", {
            meldId: meld.id,
            tileId,
          }),
          type: "declare_added_kong",
          meldId: meld.id,
          tileId,
        });
      }
    }
  }
  assertUniqueActionIds(actions);
  return actions;
};

const legalActionsFor = (
  state: GameState,
  playerId: PlayerId,
  dependencies: EngineDependencies,
): readonly LegalAction[] => {
  if (state.players[playerId] === undefined) {
    return [];
  }
  if (state.phase === "hand_ended") {
    const progression = computeRoundProgression(state);
    /* v8 ignore next -- final hands append match_ended in the same accepted event batch */
    if (progression.matchComplete) {
      return [];
    }
    return [
      {
        id: decisionActionId(state, playerId, "start_next_hand", {
          completedHandId: state.hand.id,
        }),
        type: "start_next_hand",
        completedHandId: state.hand.id,
      },
    ];
  }
  if (state.phase === "awaiting_discard") {
    return declareActions(state, playerId, dependencies);
  }
  if (
    (state.phase === "awaiting_claims" || state.phase === "awaiting_kong_robbery") &&
    state.pending !== null &&
    state.pending.eligiblePlayerIds.includes(playerId) &&
    state.pending.responses[playerId] === undefined
  ) {
    const options = state.pending.optionsByPlayer[playerId]!;
    assertUniqueActionIds(options);
    return options;
  }
  return [];
};

const buildDrawPayload = (
  state: GameState,
  playerId: PlayerId,
  firstSource: "live" | "replacement",
  firstReason: "turn" | "kong_replacement",
  fromWindowId: string | null,
): Extract<EventPayload, { type: "draw_completed" }> => {
  let liveIndex = state.wall.liveIndex;
  let replacementIndex = state.wall.replacementIndex;
  let source = firstSource;
  let reason: DrawStep["reason"] = firstReason;
  const steps: DrawStep[] = [];
  let outcome: DrawCompletedEvent["outcome"] = "replacement_exhausted";

  while (liveIndex <= replacementIndex) {
    const finalLiveTile = source === "live" && liveIndex === replacementIndex;
    const tileId =
      source === "live" ? state.wall.tiles[liveIndex++] : state.wall.tiles[replacementIndex--];
    /* v8 ignore next -- the loop condition and validated contiguous wall guarantee a tile */
    if (tileId === undefined) throw new Error("Draw planner reached an invalid wall boundary");
    const bonus = getTileDefinition(tileTypeFromInstanceId(tileId)).bonus;
    steps.push({
      tileId,
      source,
      disposition: bonus ? "bonus" : "concealed",
      reason,
      finalLiveTile,
    });
    if (!bonus) {
      outcome = "ready";
      break;
    }
    source = "replacement";
    reason = "bonus_replacement";
  }

  return {
    type: "draw_completed",
    playerId,
    fromWindowId,
    steps,
    outcome,
  };
};

const applyDraw = (
  batch: MutableEventBatch,
  requestId: RequestId,
  playerId: PlayerId,
  firstSource: "live" | "replacement",
  firstReason: "turn" | "kong_replacement",
  fromWindowId: string | null,
): void => {
  const state = requireBatchState(batch);
  appendEvent(
    batch,
    state.gameId,
    requestId,
    "internal",
    buildDrawPayload(state, playerId, firstSource, firstReason, fromWindowId),
  );
};

const lockTileTypeForResponse = (
  state: GameState,
  pending: PendingDecision,
  playerId: PlayerId,
  action: ClaimWindowAction,
): TileTypeId | null => {
  if (!state.ruleset.sameTileWinLockUntilNextDraw) {
    return null;
  }
  if (pending.kind === "kong_robbery" && !state.ruleset.passedWinLockIncludesKongRobbery) {
    return null;
  }
  const options = pending.optionsByPlayer[playerId]!;
  if (!options.some((option) => option.type === "claim_win")) {
    return null;
  }
  const triggers =
    state.ruleset.passedWinLockTriggers === "explicit_pass"
      ? action.type === "pass"
      : action.type !== "claim_win";
  const offeredTileId = pending.kind === "discard_claim" ? pending.tileId : pending.robberyTileId;
  return triggers ? tileTypeFromInstanceId(offeredTileId) : null;
};

const responsesComplete = (pending: PendingDecision): boolean =>
  pending.eligiblePlayerIds.every((playerId) => pending.responses[playerId] !== undefined);

const responseActions = (
  pending: PendingDecision,
): readonly { playerId: PlayerId; action: ClaimWindowAction }[] =>
  pending.eligiblePlayerIds.map((playerId) => {
    const response = pending.responses[playerId];
    /* v8 ignore next -- this helper is called only after responsesComplete succeeds */
    if (response === undefined) {
      throw new Error(`Pending window ${pending.id} lacks a response from ${playerId}`);
    }
    return response;
  });

const sortResponsesByDistance = (
  state: GameState,
  sourcePlayerId: PlayerId,
  responses: readonly { playerId: PlayerId; action: ClaimWindowAction }[],
): readonly { playerId: PlayerId; action: ClaimWindowAction }[] => {
  const source = state.players[sourcePlayerId];
  /* v8 ignore next -- pending windows retain an existing source player */
  if (source === undefined) {
    throw new Error(`Unknown priority source ${sourcePlayerId}`);
  }
  return [...responses].sort((left, right) => {
    const leftPlayer = state.players[left.playerId];
    const rightPlayer = state.players[right.playerId];
    /* v8 ignore next -- reducer validation restricts responses to eligible existing players */
    if (leftPlayer === undefined || rightPlayer === undefined) {
      throw new Error("A claim response references an unknown player");
    }
    return seatDistance(source.seat, leftPlayer.seat) - seatDistance(source.seat, rightPlayer.seat);
  });
};

interface UnsettledWinner {
  playerId: PlayerId;
  source: WinSource;
  winningTileId: TileInstanceId;
  fromPlayerId: PlayerId | null;
  preview: ScoringPreview;
  breakdown: ScoringBreakdown;
}

const requireLegalBreakdown = (
  preview: ScoringPreview,
  breakdown: ScoringBreakdown | null,
): ScoringBreakdown => {
  if (
    breakdown === null ||
    !breakdown.legalWin ||
    canonicalJsonHash(preview) !==
      canonicalJsonHash({
        shapeComplete: true,
        legalWin: breakdown.legalWin,
        rawFaan: breakdown.rawFaan,
        cappedFaan: breakdown.cappedFaan,
        minimumRequired: breakdown.minimumRequired,
        missingFaan: breakdown.missingFaan,
        appliedRuleIds: breakdown.applied.map(({ ruleId }) => ruleId),
        winningForm: breakdown.decomposition.form,
        reason: "legal",
      })
  ) {
    throw new Error("Winning action no longer matches its authoritative scoring assessment");
  }
  return breakdown;
};

const winnerFromResponse = (
  pending: PendingDecision,
  response: { playerId: PlayerId; action: ClaimWindowAction },
): UnsettledWinner => {
  /* v8 ignore next -- callers filter response actions to claim_win */
  if (response.action.type !== "claim_win") {
    throw new Error("Cannot create a winner from a non-win response");
  }
  const source = pending.kind === "discard_claim" ? "discard" : "robbing_kong";
  const winningTileId = pending.kind === "discard_claim" ? pending.tileId : pending.robberyTileId;
  const fromPlayerId = pending.kind === "discard_claim" ? pending.discarderId : pending.proposerId;
  const assessment = pending.winAssessmentsByPlayer[response.playerId];
  /* v8 ignore next -- claim-window construction persists one assessment per eligible player */
  if (assessment === undefined) {
    throw new Error(`Claim window lacks scoring for winner ${response.playerId}`);
  }
  return {
    playerId: response.playerId,
    source,
    winningTileId,
    fromPlayerId,
    preview: response.action.preview,
    breakdown: requireLegalBreakdown(response.action.preview, assessment.breakdown),
  };
};

const settleWinners = (
  state: GameState,
  drafts: readonly UnsettledWinner[],
  dependencies: EngineDependencies,
): { winners: readonly WinnerRecord[]; scoreDeltas: Readonly<Record<PlayerId, number>> } => {
  const settlement = dependencies.scoringSystem.settle({
    players: Object.values(state.players).map(({ id, seat }) => ({ id, seat })),
    dealerPlayerId: state.match.dealerPlayerId,
    winners: drafts.map(({ playerId, source, fromPlayerId, breakdown }) => ({
      playerId,
      source,
      fromPlayerId,
      breakdown,
    })),
  });
  return {
    winners: drafts.map(({ breakdown, ...winner }) => ({
      ...winner,
      scoring: {
        ...breakdown,
        payments: settlement.payments.filter(({ toPlayerId }) => toPlayerId === winner.playerId),
      },
    })),
    scoreDeltas: settlement.scoreDeltas,
  };
};

const completeKong = (
  batch: MutableEventBatch,
  requestId: RequestId,
  playerId: PlayerId,
  kongKind: "concealed" | "added",
  tileIds: readonly TileInstanceId[],
  meldId: string,
  windowId: string | null,
): void => {
  const state = requireBatchState(batch);
  appendEvent(batch, state.gameId, requestId, "public", {
    type: "kong_completed",
    windowId,
    playerId,
    kongKind,
    tileIds,
    meldId,
  });
  applyDraw(batch, requestId, playerId, "replacement", "kong_replacement", null);
};

const resolveDiscardWindow = (
  batch: MutableEventBatch,
  requestId: RequestId,
  pending: Extract<PendingDecision, { kind: "discard_claim" }>,
  dependencies: EngineDependencies,
): void => {
  const state = requireBatchState(batch);
  const ordered = sortResponsesByDistance(state, pending.discarderId, responseActions(pending));
  const wins = ordered.filter(({ action }) => action.type === "claim_win");
  if (wins.length > 0) {
    const selected = state.ruleset.multipleWinners ? wins : wins.slice(0, 1);
    const settlement = settleWinners(
      state,
      selected.map((response) => winnerFromResponse(pending, response)),
      dependencies,
    );
    appendEvent(batch, state.gameId, requestId, "public", {
      type: "hand_won",
      windowId: pending.id,
      winners: settlement.winners,
      scoreDeltas: settlement.scoreDeltas,
      tileOwner: { kind: "discard", discardId: pending.discardId },
    });
    return;
  }

  const meldClaims = ordered.filter(
    ({ action }) => action.type === "claim_pung" || action.type === "claim_kong",
  );
  const selectedMeld = meldClaims[0] ?? ordered.find(({ action }) => action.type === "claim_chow");
  if (
    selectedMeld !== undefined &&
    (selectedMeld.action.type === "claim_chow" ||
      selectedMeld.action.type === "claim_pung" ||
      selectedMeld.action.type === "claim_kong")
  ) {
    const kind =
      selectedMeld.action.type === "claim_chow"
        ? "chow"
        : selectedMeld.action.type === "claim_pung"
          ? "pung"
          : "kong";
    const meldId = `meld:${state.hand.id}:${pending.id}:${selectedMeld.playerId}`;
    appendEvent(batch, state.gameId, requestId, "public", {
      type: "meld_claimed",
      windowId: pending.id,
      playerId: selectedMeld.playerId,
      discardId: pending.discardId,
      kind,
      tileIdsFromHand: selectedMeld.action.tileIdsFromHand,
      meldId,
    });
    if (kind === "kong") {
      applyDraw(batch, requestId, selectedMeld.playerId, "replacement", "kong_replacement", null);
    }
    return;
  }

  if (state.wall.liveIndex > state.wall.replacementIndex) {
    appendEvent(batch, state.gameId, requestId, "public", {
      type: "hand_ended",
      reason: "exhaustive_draw",
    });
    return;
  }
  const nextPlayerId = playerIdAtSeat(
    state,
    WINDS[(WINDS.indexOf(state.players[pending.discarderId]!.seat) + 1) % WINDS.length]!,
  );
  applyDraw(batch, requestId, nextPlayerId, "live", "turn", pending.id);
};

const resolveRobberyWindow = (
  batch: MutableEventBatch,
  requestId: RequestId,
  pending: Extract<PendingDecision, { kind: "kong_robbery" }>,
  dependencies: EngineDependencies,
): void => {
  const state = requireBatchState(batch);
  const ordered = sortResponsesByDistance(state, pending.proposerId, responseActions(pending));
  const wins = ordered.filter(({ action }) => action.type === "claim_win");
  if (wins.length > 0) {
    const selected = state.ruleset.multipleWinners ? wins : wins.slice(0, 1);
    const settlement = settleWinners(
      state,
      selected.map((response) => winnerFromResponse(pending, response)),
      dependencies,
    );
    appendEvent(batch, state.gameId, requestId, "public", {
      type: "hand_won",
      windowId: pending.id,
      winners: settlement.winners,
      scoreDeltas: settlement.scoreDeltas,
      tileOwner: {
        kind: "kong_robbery",
        proposerId: pending.proposerId,
        tileId: pending.robberyTileId,
      },
    });
    return;
  }
  const meldId = pending.meldId ?? `meld:${state.hand.id}:${pending.id}:${pending.proposerId}`;
  completeKong(
    batch,
    requestId,
    pending.proposerId,
    pending.kongKind,
    pending.kongKind === "concealed" ? pending.concealedTileIds : [pending.robberyTileId],
    meldId,
    pending.id,
  );
};

const recordClaimResponse = (
  batch: MutableEventBatch,
  command: SubmitActionCommand,
  action: ClaimWindowAction,
  dependencies: EngineDependencies,
): void => {
  const state = requireBatchState(batch);
  const pending = state.pending;
  /* v8 ignore next -- claim actions are emitted only while their pending window exists */
  if (pending === null) {
    throw new Error("Cannot record a response without a pending window");
  }
  const lockTileTypeId = lockTileTypeForResponse(state, pending, command.playerId, action);
  const afterResponse = appendEvent(batch, state.gameId, command.requestId, "internal", {
    type: "claim_response_recorded",
    windowId: pending.id,
    playerId: command.playerId,
    action,
    passedWinLockTileTypeId: lockTileTypeId,
  });
  const updated = afterResponse.pending;
  if (updated === null || !responsesComplete(updated)) {
    return;
  }
  if (updated.kind === "discard_claim") {
    resolveDiscardWindow(batch, command.requestId, updated, dependencies);
  } else {
    resolveRobberyWindow(batch, command.requestId, updated, dependencies);
  }
};

const proposeKong = (
  batch: MutableEventBatch,
  requestId: RequestId,
  playerId: PlayerId,
  kongKind: "added" | "concealed",
  robberyTileId: TileInstanceId,
  concealedTileIds: readonly TileInstanceId[],
  meldId: string | null,
  dependencies: EngineDependencies,
): void => {
  const state = requireBatchState(batch);
  const windowId = `window:${state.hand.id}:kong:${String(state.revision + 1)}`;
  const eligiblePlayerIds = opponentsAfter(state, playerId);
  const claimWindow = makeClaimWindowData(eligiblePlayerIds, (candidateId) =>
    claimOptionsForRobbery(
      state,
      candidateId,
      playerId,
      robberyTileId,
      windowId,
      kongKind,
      meldId,
      dependencies,
    ),
  );
  appendEvent(batch, state.gameId, requestId, "internal", {
    type: "kong_proposed",
    windowId,
    proposerId: playerId,
    kongKind,
    robberyTileId,
    concealedTileIds,
    meldId,
    eligiblePlayerIds,
    optionsByPlayer: claimWindow.optionsByPlayer,
    winAssessmentsByPlayer: claimWindow.winAssessmentsByPlayer,
  });
};

const startNextHand = (
  batch: MutableEventBatch,
  requestId: RequestId,
  dependencies: EngineDependencies,
): void => {
  const state = requireBatchState(batch);
  const progression = computeRoundProgression(state);
  /* v8 ignore next -- start_next_hand is not emitted for a completed schedule */
  if (progression.matchComplete) {
    throw new Error("A completed match cannot start another hand");
  }
  const handSeed = deriveSeed(state.seed, "hand", String(progression.handIndex));
  const random = createSeededRandom(handSeed);
  const inventory = createTileInventory(state.ruleset.bonusTilesEnabled);
  const nextPlayers = progression.seatAssignments
    .map(({ playerId, seat }) => {
      const player = state.players[playerId];
      /* v8 ignore next -- progression seat assignments are derived from the same player map */
      if (player === undefined) {
        throw new Error(`Round progression references unknown player ${playerId}`);
      }
      return {
        id: player.id,
        displayName: player.displayName,
        controller: player.controller,
        seat,
        initialScore: player.score,
      };
    })
    .sort((left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat));
  const [first, second, third, fourth, extra] = nextPlayers;
  /* v8 ignore next -- match state invariants require exactly four distinct players */
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    extra !== undefined
  ) {
    throw new Error("Round progression must retain exactly four players");
  }
  const wallContext: WallProviderContext = {
    gameId: state.gameId,
    requestId,
    branchId: state.branchId,
    seed: handSeed,
    mode: state.mode,
    matchLength: state.match.matchLength,
    rules: state.ruleset,
    players: [first, second, third, fourth],
    handIndex: progression.handIndex,
  };
  const wallOrder =
    dependencies.wallProvider?.(inventory, random, wallContext) ?? shuffle(inventory, random);
  validateWallOrder(wallOrder, inventory);
  const previousHandId = state.hand.id;
  const started = appendEvent(batch, state.gameId, requestId, "internal", {
    type: "next_hand_started",
    previousHandId,
    handId: `hand:${state.gameId}:${state.branchId}:${String(progression.handIndex)}`,
    dealerRepeated: progression.dealerRepeated,
    handIndex: progression.handIndex,
    handsCompleted: state.match.handsCompleted,
    prevailingWindIndex: progression.prevailingWindIndex,
    prevailingWind: progression.prevailingWind,
    windHandIndex: progression.windHandIndex,
    dealerPlayerId: progression.dealerPlayerId,
    seatAssignments: progression.seatAssignments,
    handSeed,
    rngVersion: random.version,
    wallOrder,
  });
  appendEvent(batch, state.gameId, requestId, "internal", planInitialDeal(started));
};

const applyDecisionAction = (
  batch: MutableEventBatch,
  command: SubmitActionCommand,
  action: LegalAction,
  dependencies: EngineDependencies,
): void => {
  const state = requireBatchState(batch);
  switch (action.type) {
    case "discard": {
      const discardId = `discard:${state.hand.id}:${String(state.revision + 1)}`;
      const windowId = `window:${state.hand.id}:discard:${String(state.revision + 1)}`;
      const eligiblePlayerIds = opponentsAfter(state, command.playerId);
      const followedFinalLiveDraw = finalLiveForCurrentDiscard(state);
      const dealerFirstDiscard =
        command.playerId === state.match.dealerPlayerId && !state.hand.firstDiscardCompleted;
      const claimWindow = makeClaimWindowData(eligiblePlayerIds, (playerId) =>
        claimOptionsForDiscard(
          state,
          playerId,
          command.playerId,
          action.tileId,
          discardId,
          windowId,
          followedFinalLiveDraw,
          dependencies,
        ),
      );
      appendEvent(batch, state.gameId, command.requestId, "internal", {
        type: "tile_discarded",
        playerId: command.playerId,
        tileId: action.tileId,
        discardId,
        windowId,
        eligiblePlayerIds,
        optionsByPlayer: claimWindow.optionsByPlayer,
        winAssessmentsByPlayer: claimWindow.winAssessmentsByPlayer,
        followedFinalLiveDraw,
        dealerFirstDiscard,
      });
      return;
    }

    case "declare_win": {
      const winningTileId = state.hand.drawnTileId;
      /* v8 ignore next -- declare_win is emitted only with a current drawn tile */
      if (winningTileId === null) {
        throw new Error("A self-draw win has no winning tile");
      }
      const player = state.players[command.playerId];
      /* v8 ignore next -- self-win actions are emitted only for the active existing player */
      if (player === undefined) {
        throw new Error(`Unknown self-draw winner ${command.playerId}`);
      }
      const assessment = dependencies.scoringSystem.assess(
        assessmentInput(
          state,
          command.playerId,
          winningTileId,
          action.source,
          null,
          player.concealed,
          false,
          null,
        ),
      );
      const settlement = settleWinners(
        state,
        [
          {
            playerId: command.playerId,
            source: action.source,
            winningTileId,
            fromPlayerId: null,
            preview: action.preview,
            breakdown: requireLegalBreakdown(action.preview, assessment.breakdown),
          },
        ],
        dependencies,
      );
      appendEvent(batch, state.gameId, command.requestId, "public", {
        type: "hand_won",
        windowId: null,
        winners: settlement.winners,
        scoreDeltas: settlement.scoreDeltas,
        tileOwner: { kind: "self_draw" },
      });
      return;
    }

    case "declare_concealed_kong": {
      const sorted = sortTileInstances(action.tileIds);
      const robberyTileId = sorted[0];
      /* v8 ignore next -- concealed-kong actions always carry four emitted tile IDs */
      if (robberyTileId === undefined) {
        throw new Error("A concealed kong has no tiles");
      }
      const meldId = `meld:${state.hand.id}:concealed:${String(state.revision + 1)}`;
      if (state.ruleset.robConcealedKong) {
        proposeKong(
          batch,
          command.requestId,
          command.playerId,
          "concealed",
          robberyTileId,
          sorted,
          meldId,
          dependencies,
        );
      } else {
        completeKong(batch, command.requestId, command.playerId, "concealed", sorted, meldId, null);
      }
      return;
    }

    case "declare_added_kong":
      if (state.ruleset.robAddedKong) {
        proposeKong(
          batch,
          command.requestId,
          command.playerId,
          "added",
          action.tileId,
          [action.tileId],
          action.meldId,
          dependencies,
        );
      } else {
        completeKong(
          batch,
          command.requestId,
          command.playerId,
          "added",
          [action.tileId],
          action.meldId,
          null,
        );
      }
      return;

    case "claim_chow":
    case "claim_pung":
    case "claim_kong":
    case "claim_win":
    case "pass":
      recordClaimResponse(batch, command, action, dependencies);
      return;

    case "start_next_hand":
      /* v8 ignore next -- the action ID commits to the current completed hand ID */
      if (action.completedHandId !== state.hand.id) {
        throw new Error("Next-hand action references a different completed hand");
      }
      startNextHand(batch, command.requestId, dependencies);
      return;
  }
};

const finishMatchIfComplete = (batch: MutableEventBatch, requestId: RequestId): void => {
  const state = requireBatchState(batch);
  if (state.phase !== "hand_ended" || !computeRoundProgression(state).matchComplete) {
    return;
  }
  appendEvent(batch, state.gameId, requestId, "public", {
    type: "match_ended",
    finalHandId: state.hand.id,
    reason: "schedule_complete",
  });
};

const decide = (
  state: GameState,
  command: GameCommand,
  dependencies: EngineDependencies,
): EngineResult => {
  if (command.gameId !== state.gameId) {
    return rejected(state, "unknown_game", "The command targets a different game", {
      gameId: command.gameId,
    });
  }
  if (
    (command.type === "create_practice_branch" && command.parentBranchId !== state.branchId) ||
    (command.type !== "create_practice_branch" && command.branchId !== state.branchId)
  ) {
    return rejected(state, "unknown_game", "The command targets a different game branch", {
      branchId:
        command.type === "create_practice_branch" ? command.parentBranchId : command.branchId,
      actualBranchId: state.branchId,
    });
  }
  if (state.players[command.playerId] === undefined) {
    return rejected(state, "unknown_player", "The command player does not exist", {
      playerId: command.playerId,
    });
  }
  if (
    command.type !== "create_practice_branch" &&
    state.processedRequestIds.includes(command.requestId)
  ) {
    return rejected(state, "duplicate_request", "This request ID has already been processed", {
      requestId: command.requestId,
    });
  }
  if (command.expectedRevision !== state.revision) {
    return rejected(state, "stale_revision", "The game has changed; refresh before acting", {
      expectedRevision: command.expectedRevision,
      actualRevision: state.revision,
    });
  }

  const batch: MutableEventBatch = { state, events: [], publicEvents: [] };
  if (command.type === "create_practice_branch") {
    if (
      !nonEmptyString(command.branchId) ||
      !nonEmptyString(command.parentBranchId) ||
      !nonEmptyString(command.originDecisionId) ||
      command.branchId === MAIN_BRANCH_ID ||
      command.branchId === state.branchId
    ) {
      return rejected(
        state,
        "invalid_request",
        "A practice branch needs a distinct non-main ID and decision provenance",
      );
    }
    if (!["learn", "guided", "socratic", "sandbox"].includes(state.mode)) {
      return rejected(
        state,
        "action_not_legal",
        "Only learning and sandbox games may create a practice branch",
      );
    }
    const parentEventId = state.lastEventId;
    if (parentEventId === null) {
      return rejected(state, "invalid_request", "A branch requires an existing parent event");
    }
    appendEvent(
      batch,
      state.gameId,
      command.requestId,
      "internal",
      {
        type: "practice_branch_created",
        parentBranchId: state.branchId,
        parentRevision: state.revision,
        parentEventId,
        parentStateHash: state.stateHash,
        originDecisionId: command.originDecisionId,
        originDecisionBranchId: state.branchId,
        requestedByPlayerId: command.playerId,
      },
      command.branchId,
    );
    const nextState = requireBatchState(batch);
    assertStateInvariants(nextState);
    return {
      accepted: true,
      state: nextState,
      events: batch.events,
      publicEvents: batch.publicEvents,
    };
  }
  if (command.type === "end_sandbox_hand") {
    if (state.mode !== "sandbox" || state.phase === "hand_ended" || state.phase === "match_ended") {
      return rejected(
        state,
        "action_not_legal",
        "The hand can only be ended explicitly in a live sandbox game",
      );
    }
    appendEvent(batch, state.gameId, command.requestId, "public", {
      type: "hand_ended",
      reason: "sandbox_end",
    });
    finishMatchIfComplete(batch, command.requestId);
  } else {
    const actions = legalActionsFor(state, command.playerId, dependencies);
    const action = actions.find(({ id }) => id === command.actionId);
    if (action === undefined) {
      const claimClosed =
        command.actionId.startsWith("claim:") &&
        (state.pending === null || !command.actionId.startsWith(`claim:${state.pending.id}:`));
      return rejected(
        state,
        claimClosed ? "claim_window_closed" : "action_not_legal",
        claimClosed
          ? "The referenced claim window is closed"
          : "The submitted action is not in the emitted legal-action set",
        { actionId: command.actionId },
      );
    }
    applyDecisionAction(batch, command, action, dependencies);
    finishMatchIfComplete(batch, command.requestId);
  }

  const nextState = requireBatchState(batch);
  assertStateInvariants(nextState);
  return {
    accepted: true,
    state: nextState,
    events: batch.events,
    publicEvents: batch.publicEvents,
  };
};

const create = (
  command: CreateGameCommand,
  dependencies: EngineDependencies,
): CreateEngineResult => {
  const validationError = validateCreateCommand(command);
  if (validationError !== null) {
    return {
      accepted: false,
      error: validationError,
      events: [],
      publicEvents: [],
    };
  }

  try {
    const random = createSeededRandom(command.seed);
    const players = assignPlayers(command, random);
    const inventory = createTileInventory(command.rules.bonusTilesEnabled);
    const gameId = gameIdFor(command);
    const wallContext: WallProviderContext = {
      gameId,
      branchId: command.branchId,
      requestId: command.requestId,
      seed: command.seed,
      mode: command.mode,
      matchLength: command.matchLength,
      rules: command.rules,
      players: command.players,
      handIndex: 0,
    };
    const wallOrder =
      dependencies.wallProvider?.(inventory, random, wallContext) ?? shuffle(inventory, random);
    validateWallOrder(wallOrder, inventory);
    const batch: MutableEventBatch = { state: undefined, events: [], publicEvents: [] };
    const created = appendEvent(batch, gameId, command.requestId, "internal", {
      type: "game_created",
      seed: command.seed,
      rngVersion: random.version,
      mode: command.mode,
      rules: structuredClone(command.rules),
      matchLength: command.matchLength,
      players,
      wallOrder,
    });
    appendEvent(batch, gameId, command.requestId, "internal", planInitialDeal(created));
    const nextState = requireBatchState(batch);
    assertStateInvariants(nextState);
    return {
      accepted: true,
      state: nextState,
      events: batch.events,
      publicEvents: batch.publicEvents,
    };
  } catch (caught) {
    return rejectedCreate(
      "invalid_request",
      caught instanceof Error ? caught.message : "Game creation failed",
    );
  }
};

const claimWinAssessmentForObservation = (
  state: GameState,
  playerId: PlayerId,
): ScoringPreview | null => {
  const pending = state.pending;
  if (!pending?.eligiblePlayerIds.includes(playerId)) {
    return null;
  }
  return pending.winAssessmentsByPlayer[playerId]?.preview ?? null;
};

export const createGameEngine = (dependencies: EngineDependencies): GameEngine => ({
  create: (command) => create(command, dependencies),
  decide: (state, command) => decide(state, command, dependencies),
  reduce: reduceGameEvent,
  legalActions: (state, playerId) => legalActionsFor(state, playerId, dependencies),
  observation: (state, playerId): PlayerObservation =>
    createPlayerObservation(state, playerId, legalActionsFor(state, playerId, dependencies), {
      winAssessment:
        state.phase === "awaiting_discard" && state.hand.activePlayerId === playerId
          ? (selfWinPreview(state, playerId, dependencies)?.preview ?? null)
          : null,
      claimWinAssessment: claimWinAssessmentForObservation(state, playerId),
    }),
});
