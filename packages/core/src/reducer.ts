import { canonicalJsonHash } from "./canonical.js";
import { planInitialDeal } from "./dealing.js";
import {
  type ClaimWindowAction,
  type DiscardRecord,
  type GameEvent,
  type GameState,
  type HandResult,
  MAIN_BRANCH_ID,
  type Meld,
  type PlayerId,
  type PlayerState,
  type ScoringAssessment,
  type ScoringBreakdown,
  type ScoringPreview,
  type WinSource,
} from "./domain.js";
import { computeRoundProgression } from "./progression.js";
import { deriveSeed, RNG_VERSION } from "./rng.js";
import { seatDistance, WINDS } from "./seats.js";
import {
  createTileInventory,
  getTileDefinition,
  sortTileInstances,
  tileTypeFromInstanceId,
  type TileInstanceId,
} from "./tiles.js";

const stateHash = (state: Omit<GameState, "stateHash">): string =>
  `sha256:${canonicalJsonHash(state)}`;

export const computeStateHash = (state: GameState): string => {
  const { stateHash: previousHash, ...hashable } = state;
  void previousHash;
  return stateHash(hashable);
};

const removeTiles = (concealed: TileInstanceId[], tileIds: readonly TileInstanceId[]): void => {
  for (const tileId of tileIds) {
    const index = concealed.indexOf(tileId);
    if (index < 0) {
      throw new Error(`Cannot remove missing concealed tile ${tileId}`);
    }
    concealed.splice(index, 1);
  }
};

const playerById = (state: GameState, playerId: PlayerId): PlayerState => {
  const player = state.players[playerId];
  if (player === undefined) {
    throw new Error(`Event references unknown player ${playerId}`);
  }
  return player;
};

const discardById = (state: GameState, discardId: string): DiscardRecord => {
  for (const player of Object.values(state.players)) {
    const discard = player.discards.find(({ id }) => id === discardId);
    if (discard !== undefined) {
      return discard;
    }
  }
  throw new Error(`Event references unknown discard ${discardId}`);
};

const emptyScoreDeltas = (state: GameState): Readonly<Record<PlayerId, number>> =>
  Object.fromEntries(Object.keys(state.players).map((playerId) => [playerId, 0]));

const previewFromBreakdown = (breakdown: ScoringBreakdown): ScoringPreview => ({
  shapeComplete: true,
  legalWin: breakdown.legalWin,
  rawFaan: breakdown.rawFaan,
  cappedFaan: breakdown.cappedFaan,
  minimumRequired: breakdown.minimumRequired,
  missingFaan: breakdown.missingFaan,
  appliedRuleIds: breakdown.applied.map(({ ruleId }) => ruleId),
  winningForm: breakdown.decomposition.form,
  reason: breakdown.legalWin ? "legal" : "below_minimum_faan",
});

const assertScoringAssessment = (
  state: GameState,
  assessment: ScoringAssessment,
  playerId: PlayerId,
  winningTileId: TileInstanceId,
  source: WinSource,
): void => {
  const breakdown = assessment.breakdown;
  if (breakdown === null) {
    if (
      assessment.preview.shapeComplete ||
      assessment.preview.legalWin ||
      assessment.preview.winningForm !== null ||
      assessment.preview.reason !== "shape_incomplete"
    ) {
      throw new Error("Incomplete scoring assessment has an invalid preview");
    }
    return;
  }
  if (
    breakdown.rulesetId !== state.ruleset.id ||
    breakdown.rulesetVersion !== state.ruleset.version ||
    breakdown.rulesetHash !== state.ruleset.hash ||
    breakdown.winnerId !== playerId ||
    breakdown.winningTileId !== winningTileId ||
    breakdown.winSource !== source ||
    !Number.isSafeInteger(breakdown.rawFaan) ||
    !Number.isSafeInteger(breakdown.cappedFaan) ||
    !Number.isSafeInteger(breakdown.minimumRequired) ||
    !Number.isSafeInteger(breakdown.missingFaan) ||
    !Number.isSafeInteger(breakdown.basePoints) ||
    breakdown.rawFaan < 0 ||
    breakdown.cappedFaan < 0 ||
    breakdown.minimumRequired !== state.ruleset.minimumFaan ||
    breakdown.cappedFaan > state.ruleset.capFaan ||
    breakdown.missingFaan !== Math.max(0, state.ruleset.minimumFaan - breakdown.cappedFaan) ||
    breakdown.legalWin !== (breakdown.missingFaan === 0) ||
    breakdown.basePoints < 1
  ) {
    throw new Error("Scoring assessment has invalid identity or totals");
  }
  const expected = previewFromBreakdown(breakdown);
  const { legalWin: actualLegal, reason: actualReason, ...actualFacts } = assessment.preview;
  const { legalWin: expectedLegal, reason: expectedReason, ...expectedFacts } = expected;
  if (
    canonicalJsonHash(actualFacts) !== canonicalJsonHash(expectedFacts) ||
    (actualLegal === expectedLegal && actualReason !== expectedReason) ||
    (actualLegal !== expectedLegal &&
      (actualLegal ||
        !expectedLegal ||
        !["passed_win_restriction", "kong_robbery_form_not_allowed"].includes(actualReason)))
  ) {
    throw new Error("Scoring assessment preview does not match its detailed breakdown");
  }
};

const assertClaimWindowScoring = (
  state: GameState,
  eligiblePlayerIds: readonly PlayerId[],
  optionsByPlayer: Readonly<Partial<Record<PlayerId, readonly ClaimWindowAction[]>>>,
  assessmentsByPlayer: Readonly<Partial<Record<PlayerId, ScoringAssessment>>>,
  winningTileId: TileInstanceId,
  source: "discard" | "robbing_kong",
): void => {
  const eligible = new Set(eligiblePlayerIds);
  if (
    eligible.size !== eligiblePlayerIds.length ||
    Object.keys(assessmentsByPlayer).some((playerId) => !eligible.has(playerId)) ||
    Object.keys(optionsByPlayer).some((playerId) => !eligible.has(playerId))
  ) {
    throw new Error("Claim-window scoring keys do not match eligible players");
  }
  for (const playerId of eligiblePlayerIds) {
    if (state.players[playerId] === undefined) {
      throw new Error(`Claim window references unknown player ${playerId}`);
    }
    const assessment = assessmentsByPlayer[playerId];
    const options = optionsByPlayer[playerId];
    if (assessment === undefined || options === undefined) {
      throw new Error(`Claim window omits options or scoring for ${playerId}`);
    }
    assertScoringAssessment(state, assessment, playerId, winningTileId, source);
    const winAction = options.find((action) => action.type === "claim_win");
    if (
      (assessment.preview.legalWin && winAction === undefined) ||
      (!assessment.preview.legalWin && winAction !== undefined) ||
      (winAction !== undefined &&
        canonicalJsonHash(winAction.preview) !== canonicalJsonHash(assessment.preview))
    ) {
      throw new Error(`Claim-window win action disagrees with scoring for ${playerId}`);
    }
  }
};

const checkedAdd = (left: number, right: number, label: string): number => {
  const result = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error(`${label} exceeds safe-integer arithmetic`);
  }
  return result;
};

const checkedMultiply = (left: number, right: number, label: string): number => {
  const result = left * right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error(`${label} exceeds safe-integer arithmetic`);
  }
  return result;
};

const expectedWindowWinners = (
  state: GameState,
  pending: NonNullable<GameState["pending"]>,
): readonly PlayerId[] => {
  const sourcePlayerId =
    pending.kind === "discard_claim" ? pending.discarderId : pending.proposerId;
  const source = playerById(state, sourcePlayerId);
  const ordered = pending.eligiblePlayerIds
    .map((playerId) => playerById(state, playerId))
    .sort(
      (left, right) => seatDistance(source.seat, left.seat) - seatDistance(source.seat, right.seat),
    );
  const winners = ordered
    .filter((player) => pending.responses[player.id]?.action.type === "claim_win")
    .map(({ id }) => id);
  return state.ruleset.multipleWinners ? winners : winners.slice(0, 1);
};

const validateHandWonEvent = (
  state: GameState,
  event: Extract<GameEvent, { type: "hand_won" }>,
): void => {
  if (
    state.hand.result !== null ||
    state.phase === "hand_ended" ||
    state.phase === "match_ended" ||
    event.winners.length === 0 ||
    new Set(event.winners.map(({ playerId }) => playerId)).size !== event.winners.length
  ) {
    throw new Error("A hand win requires one new, distinct winner set");
  }

  let expectedWinnerIds: readonly PlayerId[];
  let expectedSource: WinSource;
  let expectedFromPlayerId: PlayerId | null;
  let expectedWinningTileId: TileInstanceId;
  if (event.windowId === null) {
    if (
      state.phase !== "awaiting_discard" ||
      state.pending !== null ||
      event.tileOwner.kind !== "self_draw" ||
      state.hand.drawnTileId === null
    ) {
      throw new Error("A self-draw hand win does not match the current turn");
    }
    expectedWinnerIds = [state.hand.activePlayerId];
    expectedSource =
      state.hand.turnOrigin === "initial_deal"
        ? "initial_deal"
        : state.hand.lastDrawSource === "replacement"
          ? "replacement"
          : "self_draw";
    expectedFromPlayerId = null;
    expectedWinningTileId = state.hand.drawnTileId;
  } else {
    const pending = state.pending;
    if (
      pending?.id !== event.windowId ||
      !pending.eligiblePlayerIds.every((playerId) => pending.responses[playerId] !== undefined)
    ) {
      throw new Error("A claim win requires a completed matching claim window");
    }
    expectedWinnerIds = expectedWindowWinners(state, pending);
    if (pending.kind === "discard_claim") {
      if (
        state.phase !== "awaiting_claims" ||
        event.tileOwner.kind !== "discard" ||
        event.tileOwner.discardId !== pending.discardId
      ) {
        throw new Error("Discard-win ownership does not match the pending discard");
      }
      expectedSource = "discard";
      expectedFromPlayerId = pending.discarderId;
      expectedWinningTileId = pending.tileId;
    } else {
      if (
        state.phase !== "awaiting_kong_robbery" ||
        event.tileOwner.kind !== "kong_robbery" ||
        event.tileOwner.proposerId !== pending.proposerId ||
        event.tileOwner.tileId !== pending.robberyTileId
      ) {
        throw new Error("Robbery-win ownership does not match the pending kong");
      }
      expectedSource = "robbing_kong";
      expectedFromPlayerId = pending.proposerId;
      expectedWinningTileId = pending.robberyTileId;
    }
  }
  if (
    canonicalJsonHash(event.winners.map(({ playerId }) => playerId)) !==
    canonicalJsonHash(expectedWinnerIds)
  ) {
    throw new Error("Hand-win winners do not match claim priority and winner policy");
  }

  const winnerIds = new Set(expectedWinnerIds);
  const calculatedDeltas: Record<PlayerId, number> = Object.fromEntries(
    Object.keys(state.players).map((playerId) => [playerId, 0]),
  );
  const transferPairs = new Set<string>();
  for (const winner of event.winners) {
    const player = state.players[winner.playerId];
    const { payments, ...breakdown } = winner.scoring;
    if (
      player === undefined ||
      !winner.preview.legalWin ||
      winner.source !== expectedSource ||
      winner.fromPlayerId !== expectedFromPlayerId ||
      winner.winningTileId !== expectedWinningTileId ||
      winner.scoring.winnerId !== winner.playerId ||
      winner.scoring.winSource !== winner.source ||
      winner.scoring.winningTileId !== winner.winningTileId
    ) {
      throw new Error("Winner identity, source, or tile does not match the terminal context");
    }
    assertScoringAssessment(
      state,
      { preview: winner.preview, breakdown },
      winner.playerId,
      winner.winningTileId,
      winner.source,
    );
    if (event.windowId !== null) {
      const persisted = state.pending?.winAssessmentsByPlayer[winner.playerId]?.breakdown;
      if (
        persisted === undefined ||
        canonicalJsonHash(persisted) !== canonicalJsonHash(breakdown)
      ) {
        throw new Error("Winner scoring does not match the persisted claim assessment");
      }
    }
    for (const payment of payments) {
      const pair = `${payment.fromPlayerId}:${payment.toPlayerId}`;
      if (
        state.players[payment.fromPlayerId] === undefined ||
        state.players[payment.toPlayerId] === undefined ||
        payment.toPlayerId !== winner.playerId ||
        winnerIds.has(payment.fromPlayerId) ||
        payment.fromPlayerId === payment.toPlayerId ||
        !Number.isSafeInteger(payment.points) ||
        !Number.isSafeInteger(payment.basePoints) ||
        !Number.isSafeInteger(payment.multiplier) ||
        payment.points <= 0 ||
        payment.basePoints !== winner.scoring.basePoints ||
        payment.multiplier <= 0 ||
        payment.points !==
          checkedMultiply(payment.basePoints, payment.multiplier, "Payment points") ||
        transferPairs.has(pair)
      ) {
        throw new Error("Hand-win payment is invalid or duplicated");
      }
      transferPairs.add(pair);
      calculatedDeltas[payment.fromPlayerId] = checkedAdd(
        calculatedDeltas[payment.fromPlayerId]!,
        -payment.points,
        "Payer score delta",
      );
      calculatedDeltas[payment.toPlayerId] = checkedAdd(
        calculatedDeltas[payment.toPlayerId]!,
        payment.points,
        "Winner score delta",
      );
    }
  }

  const playerIds = Object.keys(state.players).sort();
  if (
    canonicalJsonHash(Object.keys(event.scoreDeltas).sort()) !== canonicalJsonHash(playerIds) ||
    playerIds.some(
      (playerId) =>
        !Number.isSafeInteger(event.scoreDeltas[playerId]) ||
        event.scoreDeltas[playerId] !== calculatedDeltas[playerId],
    )
  ) {
    throw new Error("Hand-win score deltas do not match persisted payments");
  }
  const zeroSum = playerIds.reduce(
    (total, playerId) => checkedAdd(total, event.scoreDeltas[playerId]!, "Payment total"),
    0,
  );
  if (zeroSum !== 0) {
    throw new Error("Hand-win score deltas must sum to zero");
  }
  for (const playerId of playerIds) {
    checkedAdd(playerById(state, playerId).score, event.scoreDeltas[playerId]!, "Player score");
  }
};

const addRequestId = (state: GameState, requestId: string): void => {
  if (!state.processedRequestIds.includes(requestId)) {
    state.processedRequestIds.push(requestId);
  }
};

const finalizeEvent = (state: GameState, event: GameEvent): GameState => {
  if (event.branchId !== state.branchId) {
    throw new Error("Event branch identity does not match its reduced state");
  }
  state.revision = event.revision;
  state.lastEventId = event.id;
  addRequestId(state, event.requestId);
  state.stateHash = computeStateHash(state);
  return state;
};

const createInitialState = (event: Extract<GameEvent, { type: "game_created" }>): GameState => {
  if (
    event.branchId !== MAIN_BRANCH_ID ||
    event.revision !== 1 ||
    event.id !== `event:${event.gameId}:${MAIN_BRANCH_ID}:1`
  ) {
    throw new Error("The first game event must have revision 1 and its canonical event ID");
  }
  if (event.rngVersion !== RNG_VERSION) {
    throw new Error(`Unsupported historical RNG version ${event.rngVersion}`);
  }
  const expectedInventory = createTileInventory(event.rules.bonusTilesEnabled);
  if (
    event.players.length !== WINDS.length ||
    new Set(event.players.map(({ id }) => id)).size !== WINDS.length ||
    new Set(event.players.map(({ seat }) => seat)).size !== WINDS.length ||
    event.players.some(
      ({ id, displayName, seat, initialScore }) =>
        id.trim().length === 0 ||
        displayName.trim().length === 0 ||
        !WINDS.includes(seat) ||
        !Number.isSafeInteger(initialScore) ||
        initialScore < 0,
    ) ||
    event.wallOrder.length !== expectedInventory.length ||
    new Set(event.wallOrder).size !== expectedInventory.length ||
    expectedInventory.some((tileId) => !event.wallOrder.includes(tileId))
  ) {
    throw new Error("Game-created event has invalid players or wall inventory");
  }
  const players: Record<PlayerId, PlayerState> = {};
  for (const assigned of event.players) {
    players[assigned.id] = {
      id: assigned.id,
      displayName: assigned.displayName,
      controller: assigned.controller,
      seat: assigned.seat,
      score: assigned.initialScore,
      concealed: [],
      melds: [],
      bonusTiles: [],
      discards: [],
      temporaryRestrictions: [],
    };
  }
  const dealer = event.players.find(({ seat }) => seat === "east");
  if (dealer === undefined) {
    throw new Error("A created game must assign an East player");
  }
  const initialTotalScore = event.players.reduce((total, player) => total + player.initialScore, 0);
  const effectivePrevailingWinds =
    event.matchLength === "one_wind"
      ? event.rules.prevailingWinds.slice(0, 1)
      : [...event.rules.prevailingWinds];
  const withoutHash: Omit<GameState, "stateHash"> = {
    schemaVersion: 1,
    gameId: event.gameId,
    branchId: MAIN_BRANCH_ID,
    practiceBranch: false,
    revision: event.revision,
    ruleset: structuredClone(event.rules),
    seed: event.seed,
    rngVersion: event.rngVersion,
    mode: event.mode,
    phase: "initial_replacements",
    match: {
      matchLength: event.matchLength,
      initialTotalScore,
      effectivePrevailingWinds,
      prevailingWindIndex: 0,
      prevailingWind: effectivePrevailingWinds[0] ?? "east",
      windHandIndex: 0,
      handIndex: 0,
      dealerPlayerId: dealer.id,
      handsCompleted: 0,
    },
    hand: {
      id: `hand:${event.gameId}:${MAIN_BRANCH_ID}:0`,
      seed: event.seed,
      activePlayerId: dealer.id,
      dealerPlayerId: dealer.id,
      turnOrigin: "initial_deal",
      drawnTileId: null,
      lastDrawSource: null,
      lastDrawReason: null,
      drawnTileWasFinalLiveTile: false,
      turnConsumedFinalLiveTile: false,
      lastDiscardId: null,
      firstDiscardCompleted: false,
      callsOccurred: false,
      initialBonusReplacementOccurred: false,
      openingKongOccurred: false,
      winningTileZone: [],
      result: null,
    },
    players,
    wall: {
      tiles: [...event.wallOrder],
      liveIndex: 0,
      replacementIndex: event.wallOrder.length - 1,
    },
    pending: null,
    processedRequestIds: [event.requestId],
    lastEventId: event.id,
  };
  return {
    ...withoutHash,
    stateHash: stateHash(withoutHash),
  };
};

const applyExistingStateEvent = (current: GameState, event: GameEvent): GameState => {
  if (event.gameId !== current.gameId) {
    throw new Error(`Event game ${event.gameId} does not match state game ${current.gameId}`);
  }
  if (event.revision !== current.revision + 1) {
    throw new Error(
      `Event revision ${String(event.revision)} does not follow state revision ${String(current.revision)}`,
    );
  }
  if (event.id !== `event:${event.gameId}:${event.branchId}:${String(event.revision)}`) {
    throw new Error(`Event ${event.id} does not use its canonical revision ID`);
  }
  if (
    (event.type === "practice_branch_created" && event.parentBranchId !== current.branchId) ||
    (event.type !== "practice_branch_created" && event.branchId !== current.branchId)
  ) {
    throw new Error("Event branch identity does not follow the current branch");
  }

  const state = structuredClone(current);

  switch (event.type) {
    case "game_created":
      throw new Error("game_created can only be reduced without an existing state");

    case "practice_branch_created": {
      if (
        event.visibility !== "internal" ||
        event.branchId.trim().length === 0 ||
        event.branchId === MAIN_BRANCH_ID ||
        event.branchId === current.branchId ||
        event.parentBranchId !== current.branchId ||
        event.parentRevision !== current.revision ||
        event.parentEventId !== current.lastEventId ||
        event.parentStateHash !== current.stateHash ||
        event.originDecisionBranchId !== current.branchId ||
        event.originDecisionId.trim().length === 0 ||
        state.players[event.requestedByPlayerId] === undefined ||
        !["learn", "guided", "socratic", "sandbox"].includes(state.mode)
      ) {
        throw new Error("Practice-branch event does not match its permitted parent state");
      }
      state.branchId = event.branchId;
      state.practiceBranch = true;
      state.hand.id = `hand:${state.gameId}:${event.branchId}:${String(state.match.handIndex)}`;
      // Request identities are scoped to a branch. Inherited parent receipts must not block a
      // legitimate request in the new event stream.
      state.processedRequestIds = [];
      break;
    }

    case "initial_deal_completed": {
      if (state.phase !== "initial_replacements") {
        throw new Error("An initial deal can only complete during initial replacements");
      }
      const expected = planInitialDeal(state);
      if (
        canonicalJsonHash({
          type: event.type,
          deals: event.deals,
          trace: event.trace,
          liveIndex: event.liveIndex,
          replacementIndex: event.replacementIndex,
        }) !== canonicalJsonHash(expected)
      ) {
        throw new Error("Initial-deal event does not match the persisted wall and seat order");
      }
      for (const [playerId, deal] of Object.entries(event.deals)) {
        const player = playerById(state, playerId);
        player.concealed = [...deal.concealed];
        player.bonusTiles = [...deal.bonusTiles];
        if (playerId === state.match.dealerPlayerId) {
          state.hand.drawnTileId = deal.drawnTileId;
        }
      }
      state.wall.liveIndex = event.liveIndex;
      state.wall.replacementIndex = event.replacementIndex;
      state.phase = "awaiting_discard";
      state.hand.turnOrigin = "initial_deal";
      state.hand.lastDrawSource = "initial_deal";
      state.hand.lastDrawReason = "initial_deal";
      state.hand.drawnTileWasFinalLiveTile = false;
      state.hand.turnConsumedFinalLiveTile = false;
      state.hand.initialBonusReplacementOccurred = event.trace.some(
        ({ disposition }) => disposition === "bonus",
      );
      break;
    }

    case "draw_completed": {
      const player = playerById(state, event.playerId);
      if (event.fromWindowId !== null) {
        if (state.pending?.id !== event.fromWindowId) {
          throw new Error(`Draw resolution references unavailable window ${event.fromWindowId}`);
        }
        if (
          !state.pending.eligiblePlayerIds.every(
            (playerId) => state.pending?.responses[playerId]?.action.type === "pass",
          )
        ) {
          throw new Error(`Draw resolution requires every claim response to pass`);
        }
        state.pending = null;
      }
      state.hand.activePlayerId = event.playerId;
      state.hand.drawnTileId = null;
      state.hand.lastDrawSource = null;
      state.hand.lastDrawReason = null;
      state.hand.drawnTileWasFinalLiveTile = false;
      state.hand.turnConsumedFinalLiveTile = false;

      if (event.steps.length > 0) {
        player.temporaryRestrictions = [];
      }

      for (const step of event.steps) {
        const expectedFinalLiveTile =
          step.source === "live" && state.wall.liveIndex === state.wall.replacementIndex;
        if (step.finalLiveTile !== expectedFinalLiveTile) {
          throw new Error(`Draw event has invalid final-live provenance for ${step.tileId}`);
        }
        const expectedTile =
          step.source === "live"
            ? state.wall.tiles[state.wall.liveIndex]
            : state.wall.tiles[state.wall.replacementIndex];
        if (expectedTile !== step.tileId) {
          throw new Error(
            `Draw event tile ${step.tileId} does not match ${step.source} wall tile ${String(expectedTile)}`,
          );
        }
        if (step.source === "live") {
          state.wall.liveIndex += 1;
        } else {
          state.wall.replacementIndex -= 1;
        }
        const definition = getTileDefinition(tileTypeFromInstanceId(step.tileId));
        if (definition.bonus !== (step.disposition === "bonus")) {
          throw new Error(`Draw disposition for ${step.tileId} does not match its tile definition`);
        }
        if (step.disposition === "bonus") {
          player.bonusTiles.push(step.tileId);
        } else {
          player.concealed.push(step.tileId);
          player.concealed = [...sortTileInstances(player.concealed)];
          state.hand.drawnTileId = step.tileId;
          state.hand.lastDrawSource = step.source;
          state.hand.lastDrawReason = step.reason;
          state.hand.drawnTileWasFinalLiveTile = step.finalLiveTile;
        }
        if (step.source === "live" && step.finalLiveTile) {
          state.hand.turnConsumedFinalLiveTile = true;
        }
      }

      if (event.outcome === "replacement_exhausted") {
        if (
          state.hand.drawnTileId !== null ||
          state.wall.liveIndex <= state.wall.replacementIndex
        ) {
          throw new Error("Replacement exhaustion requires no standard draw and an empty wall");
        }
        state.hand.result = {
          kind: "exhaustive_draw",
          winners: [],
          scoreDeltas: emptyScoreDeltas(state),
        };
        state.match.handsCompleted += 1;
        state.phase = "hand_ended";
      } else {
        if (state.hand.drawnTileId === null) {
          throw new Error("A ready draw event must end with a concealed standard tile");
        }
        state.hand.turnOrigin = state.hand.lastDrawSource === "live" ? "draw" : "replacement";
        state.phase = "awaiting_discard";
      }
      break;
    }

    case "tile_discarded": {
      const player = playerById(state, event.playerId);
      if (
        state.phase !== "awaiting_discard" ||
        state.pending !== null ||
        state.hand.activePlayerId !== event.playerId ||
        !player.concealed.includes(event.tileId) ||
        event.dealerFirstDiscard !==
          (event.playerId === state.match.dealerPlayerId && !state.hand.firstDiscardCompleted) ||
        event.followedFinalLiveDraw !==
          (state.hand.turnOrigin !== "claim" && state.hand.turnConsumedFinalLiveTile)
      ) {
        throw new Error("Discard event is not legal in the current turn state");
      }
      assertClaimWindowScoring(
        state,
        event.eligiblePlayerIds,
        event.optionsByPlayer,
        event.winAssessmentsByPlayer,
        event.tileId,
        "discard",
      );
      removeTiles(player.concealed, [event.tileId]);
      const discard: DiscardRecord = {
        id: event.discardId,
        tileId: event.tileId,
        playerId: event.playerId,
        eventId: event.id,
        followedFinalLiveDraw: event.followedFinalLiveDraw,
        dealerFirstDiscard: event.dealerFirstDiscard,
        claimedBy: null,
        claimMeldId: null,
        winningPlayerIds: [],
      };
      player.discards.push(discard);
      state.hand.drawnTileId = null;
      state.hand.lastDiscardId = event.discardId;
      state.hand.firstDiscardCompleted = true;
      state.phase = "awaiting_claims";
      state.pending = {
        kind: "discard_claim",
        id: event.windowId,
        discardId: event.discardId,
        discarderId: event.playerId,
        tileId: event.tileId,
        openedAtRevision: event.revision,
        eligiblePlayerIds: [...event.eligiblePlayerIds],
        optionsByPlayer: structuredClone(event.optionsByPlayer),
        winAssessmentsByPlayer: structuredClone(event.winAssessmentsByPlayer),
        responses: {},
      };
      break;
    }

    case "claim_response_recorded": {
      const pending = state.pending;
      if (pending?.id !== event.windowId) {
        throw new Error(`Claim response references closed window ${event.windowId}`);
      }
      const options = pending.optionsByPlayer[event.playerId];
      const emitted = options?.find(({ id }) => id === event.action.id);
      if (
        !pending.eligiblePlayerIds.includes(event.playerId) ||
        pending.responses[event.playerId] !== undefined ||
        emitted === undefined ||
        canonicalJsonHash(emitted) !== canonicalJsonHash(event.action)
      ) {
        throw new Error("Claim response is not an unused emitted option for this player");
      }
      const legalWinOffered = options?.some(({ type }) => type === "claim_win") ?? false;
      const shouldLock =
        state.ruleset.sameTileWinLockUntilNextDraw &&
        (pending.kind !== "kong_robbery" || state.ruleset.passedWinLockIncludesKongRobbery) &&
        legalWinOffered &&
        (state.ruleset.passedWinLockTriggers === "explicit_pass"
          ? event.action.type === "pass"
          : event.action.type !== "claim_win");
      const offeredTileId =
        pending.kind === "discard_claim" ? pending.tileId : pending.robberyTileId;
      const expectedLock = shouldLock ? tileTypeFromInstanceId(offeredTileId) : null;
      if (event.passedWinLockTileTypeId !== expectedLock) {
        throw new Error("Claim response has an invalid passed-win restriction");
      }
      pending.responses[event.playerId] = {
        playerId: event.playerId,
        action: structuredClone(event.action),
      };
      if (event.passedWinLockTileTypeId !== null) {
        const player = playerById(state, event.playerId);
        if (
          !player.temporaryRestrictions.some(
            ({ tileTypeId }) => tileTypeId === event.passedWinLockTileTypeId,
          )
        ) {
          player.temporaryRestrictions.push({
            type: "same_tile_win_lock",
            tileTypeId: event.passedWinLockTileTypeId,
            until: "next_draw",
          });
        }
      }
      break;
    }

    case "meld_claimed": {
      if (state.pending?.kind !== "discard_claim" || state.pending.id !== event.windowId) {
        throw new Error(`Meld claim references unavailable window ${event.windowId}`);
      }
      const response = state.pending.responses[event.playerId]?.action;
      const expectedActionType =
        event.kind === "chow" ? "claim_chow" : event.kind === "pung" ? "claim_pung" : "claim_kong";
      if (
        !state.pending.eligiblePlayerIds.every(
          (playerId) => state.pending?.responses[playerId] !== undefined,
        ) ||
        response?.type !== expectedActionType ||
        response.discardId !== event.discardId ||
        canonicalJsonHash(response.tileIdsFromHand) !== canonicalJsonHash(event.tileIdsFromHand)
      ) {
        throw new Error("Meld resolution does not match the completed claim responses");
      }
      const player = playerById(state, event.playerId);
      const discard = discardById(state, event.discardId);
      removeTiles(player.concealed, event.tileIdsFromHand);
      discard.claimedBy = event.playerId;
      discard.claimMeldId = event.meldId;
      const meld: Meld = {
        id: event.meldId,
        kind: event.kind,
        kongKind: event.kind === "kong" ? "exposed" : null,
        tileIds: [...sortTileInstances([...event.tileIdsFromHand, discard.tileId])],
        exposed: true,
        claimedFrom: discard.playerId,
        claimedTileId: discard.tileId,
        createdEventId: event.id,
      };
      player.melds.push(meld);
      state.hand.activePlayerId = event.playerId;
      state.hand.drawnTileId = null;
      state.hand.lastDrawSource = null;
      state.hand.lastDrawReason = null;
      state.hand.drawnTileWasFinalLiveTile = false;
      state.hand.turnConsumedFinalLiveTile = false;
      state.hand.callsOccurred = true;
      state.pending = null;
      if (event.kind === "kong") {
        state.phase = "drawing_replacement";
        state.hand.turnOrigin = "replacement";
      } else {
        state.phase = "awaiting_discard";
        state.hand.turnOrigin = "claim";
      }
      break;
    }

    case "kong_proposed": {
      const proposer = playerById(state, event.proposerId);
      if (
        state.phase !== "awaiting_discard" ||
        state.pending !== null ||
        state.hand.activePlayerId !== event.proposerId ||
        !proposer.concealed.includes(event.robberyTileId) ||
        event.concealedTileIds.some((tileId) => !proposer.concealed.includes(tileId))
      ) {
        throw new Error("Kong proposal is not legal in the current turn state");
      }
      assertClaimWindowScoring(
        state,
        event.eligiblePlayerIds,
        event.optionsByPlayer,
        event.winAssessmentsByPlayer,
        event.robberyTileId,
        "robbing_kong",
      );
      state.phase = "awaiting_kong_robbery";
      state.pending = {
        kind: "kong_robbery",
        id: event.windowId,
        proposerId: event.proposerId,
        kongKind: event.kongKind,
        robberyTileId: event.robberyTileId,
        concealedTileIds: [...event.concealedTileIds],
        meldId: event.meldId,
        openedAtRevision: event.revision,
        eligiblePlayerIds: [...event.eligiblePlayerIds],
        optionsByPlayer: structuredClone(event.optionsByPlayer),
        winAssessmentsByPlayer: structuredClone(event.winAssessmentsByPlayer),
        responses: {},
      };
      break;
    }

    case "kong_completed": {
      const player = playerById(state, event.playerId);
      if (
        state.hand.activePlayerId !== event.playerId ||
        (event.windowId === null
          ? state.pending !== null
          : state.pending?.kind !== "kong_robbery" ||
            state.pending.id !== event.windowId ||
            state.pending.proposerId !== event.playerId ||
            state.pending.kongKind !== event.kongKind ||
            !state.pending.eligiblePlayerIds.every(
              (playerId) => state.pending?.responses[playerId]?.action.type === "pass",
            ))
      ) {
        throw new Error("Kong completion does not match the current proposal state");
      }
      if (event.kongKind === "concealed") {
        removeTiles(player.concealed, event.tileIds);
        player.melds.push({
          id: event.meldId,
          kind: "kong",
          kongKind: "concealed",
          tileIds: [...sortTileInstances(event.tileIds)],
          exposed: false,
          claimedFrom: null,
          claimedTileId: null,
          createdEventId: event.id,
        });
      } else {
        const meld = player.melds.find(({ id }) => id === event.meldId);
        if (meld?.kind !== "pung" || event.tileIds.length !== 1) {
          throw new Error(`Added kong references invalid pung ${event.meldId}`);
        }
        removeTiles(player.concealed, event.tileIds);
        meld.kind = "kong";
        meld.kongKind = "added";
        meld.tileIds = [...sortTileInstances([...meld.tileIds, ...event.tileIds])];
      }
      state.hand.activePlayerId = event.playerId;
      state.hand.drawnTileId = null;
      state.hand.lastDrawSource = null;
      state.hand.lastDrawReason = null;
      state.hand.drawnTileWasFinalLiveTile = false;
      state.hand.turnConsumedFinalLiveTile = false;
      state.hand.callsOccurred = true;
      if (!state.hand.firstDiscardCompleted) {
        state.hand.openingKongOccurred = true;
      }
      state.hand.turnOrigin = "replacement";
      state.phase = "drawing_replacement";
      state.pending = null;
      break;
    }

    case "hand_won": {
      validateHandWonEvent(state, event);
      if (event.tileOwner.kind === "discard") {
        const discard = discardById(state, event.tileOwner.discardId);
        if (discard.claimedBy !== null || discard.winningPlayerIds.length > 0) {
          throw new Error(`Discard ${discard.id} has already been claimed`);
        }
        discard.winningPlayerIds = event.winners.map(({ playerId }) => playerId);
        state.hand.winningTileZone.push(discard.tileId);
      } else if (event.tileOwner.kind === "kong_robbery") {
        const robbedPlayer = playerById(state, event.tileOwner.proposerId);
        removeTiles(robbedPlayer.concealed, [event.tileOwner.tileId]);
        state.hand.winningTileZone.push(event.tileOwner.tileId);
      }
      for (const [playerId, delta] of Object.entries(event.scoreDeltas)) {
        const player = playerById(state, playerId);
        player.score = checkedAdd(player.score, delta, "Player score");
      }
      const result: HandResult = {
        kind: "win",
        winners: structuredClone([...event.winners]),
        scoreDeltas: structuredClone(event.scoreDeltas),
      };
      state.hand.result = result;
      state.match.handsCompleted += 1;
      state.phase = "hand_ended";
      state.pending = null;
      break;
    }

    case "hand_ended": {
      if (
        state.hand.result !== null ||
        state.phase === "hand_ended" ||
        state.phase === "match_ended"
      ) {
        throw new Error("A terminal hand cannot end again");
      }
      state.hand.result = {
        kind: event.reason,
        winners: [],
        scoreDeltas: emptyScoreDeltas(state),
      };
      state.match.handsCompleted += 1;
      state.phase = "hand_ended";
      state.pending = null;
      break;
    }

    case "next_hand_started": {
      const progression = computeRoundProgression(state);
      if (progression.matchComplete) {
        throw new Error("A completed match cannot start another hand");
      }
      const expectedHandSeed = deriveSeed(state.seed, "hand", String(progression.handIndex));
      if (
        event.previousHandId !== state.hand.id ||
        event.handId !==
          `hand:${state.gameId}:${state.branchId}:${String(progression.handIndex)}` ||
        event.dealerRepeated !== progression.dealerRepeated ||
        event.handIndex !== progression.handIndex ||
        event.handsCompleted !== state.match.handsCompleted ||
        event.prevailingWindIndex !== progression.prevailingWindIndex ||
        event.prevailingWind !== progression.prevailingWind ||
        event.windHandIndex !== progression.windHandIndex ||
        event.dealerPlayerId !== progression.dealerPlayerId ||
        event.handSeed !== expectedHandSeed ||
        event.rngVersion !== state.rngVersion
      ) {
        throw new Error("Next-hand event does not match deterministic round progression");
      }
      const expectedSeats = new Map(
        progression.seatAssignments.map(({ playerId, seat }) => [playerId, seat]),
      );
      if (
        event.seatAssignments.length !== WINDS.length ||
        new Set(event.seatAssignments.map(({ playerId }) => playerId)).size !== WINDS.length ||
        new Set(event.seatAssignments.map(({ seat }) => seat)).size !== WINDS.length ||
        event.seatAssignments.some(
          ({ playerId, seat }) => expectedSeats.get(playerId) !== seat || !WINDS.includes(seat),
        )
      ) {
        throw new Error("Next-hand event has invalid seat assignments");
      }
      for (const player of Object.values(state.players)) {
        const seat = expectedSeats.get(player.id);
        if (seat === undefined) {
          throw new Error(`Next-hand seats omit player ${player.id}`);
        }
        player.seat = seat;
        player.concealed = [];
        player.melds = [];
        player.bonusTiles = [];
        player.discards = [];
        player.temporaryRestrictions = [];
      }
      state.match.prevailingWindIndex = progression.prevailingWindIndex;
      state.match.prevailingWind = progression.prevailingWind;
      state.match.windHandIndex = progression.windHandIndex;
      state.match.handIndex = progression.handIndex;
      state.match.dealerPlayerId = progression.dealerPlayerId;
      state.hand = {
        id: event.handId,
        seed: event.handSeed,
        activePlayerId: progression.dealerPlayerId,
        dealerPlayerId: progression.dealerPlayerId,
        turnOrigin: "initial_deal",
        drawnTileId: null,
        lastDrawSource: null,
        lastDrawReason: null,
        drawnTileWasFinalLiveTile: false,
        turnConsumedFinalLiveTile: false,
        lastDiscardId: null,
        firstDiscardCompleted: false,
        callsOccurred: false,
        initialBonusReplacementOccurred: false,
        openingKongOccurred: false,
        winningTileZone: [],
        result: null,
      };
      state.wall = {
        tiles: [...event.wallOrder],
        liveIndex: 0,
        replacementIndex: event.wallOrder.length - 1,
      };
      state.pending = null;
      state.phase = "initial_replacements";
      break;
    }

    case "match_ended": {
      const progression = computeRoundProgression(state);
      if (!progression.matchComplete || event.finalHandId !== state.hand.id) {
        throw new Error("Match-ended event does not match the completed round schedule");
      }
      state.phase = "match_ended";
      break;
    }
  }

  return finalizeEvent(state, event);
};

export const reduceGameEvent = (state: GameState | undefined, event: GameEvent): GameState => {
  if (state === undefined) {
    if (event.type !== "game_created") {
      throw new Error("A replay must begin with game_created");
    }
    return createInitialState(event);
  }
  return applyExistingStateEvent(state, event);
};

export const replayEvents = (events: readonly GameEvent[]): GameState => {
  let state: GameState | undefined;
  for (const event of events) {
    state = reduceGameEvent(state, event);
  }
  if (state === undefined) {
    throw new Error("Cannot replay an empty event stream");
  }
  return state;
};
