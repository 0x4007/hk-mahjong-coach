import { computeStateHash } from "./reducer.js";
import { MAIN_BRANCH_ID, type GameState, type LegalAction, type PlayerId } from "./domain.js";
import { deriveSeed } from "./rng.js";
import { WINDS } from "./seats.js";
import {
  createTileInventory,
  getTileDefinition,
  tileTypeFromInstanceId,
  type TileInstanceId,
} from "./tiles.js";

export class StateInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateInvariantError";
  }
}

const fail = (message: string): never => {
  throw new StateInvariantError(message);
};

const availableWallTiles = (state: GameState): readonly TileInstanceId[] =>
  state.wall.liveIndex <= state.wall.replacementIndex
    ? state.wall.tiles.slice(state.wall.liveIndex, state.wall.replacementIndex + 1)
    : [];

export const authoritativeTileZones = (state: GameState): readonly TileInstanceId[] => {
  const zones: TileInstanceId[] = [...availableWallTiles(state), ...state.hand.winningTileZone];
  for (const player of Object.values(state.players)) {
    zones.push(...player.concealed, ...player.bonusTiles);
    for (const meld of player.melds) {
      zones.push(...meld.tileIds);
    }
    for (const discard of player.discards) {
      if (discard.claimedBy === null && discard.winningPlayerIds.length === 0) {
        zones.push(discard.tileId);
      }
    }
  }
  return zones;
};

export const assertUniqueActionIds = (actions: readonly LegalAction[]): void => {
  const ids = actions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    fail("Legal action IDs must be unique within one observation");
  }
};

export const assertStateInvariants = (state: GameState): void => {
  if (
    state.branchId.trim().length === 0 ||
    (state.branchId === MAIN_BRANCH_ID && state.practiceBranch) ||
    (state.branchId !== MAIN_BRANCH_ID && !state.practiceBranch)
  ) {
    fail("Game branch identity is invalid");
  }
  const players = Object.values(state.players);
  if (players.length !== 4 || new Set(players.map(({ id }) => id)).size !== 4) {
    fail("A game must contain four distinct players");
  }
  if (
    new Set(players.map(({ seat }) => seat)).size !== WINDS.length ||
    players.some(({ seat }) => !WINDS.includes(seat))
  ) {
    fail("A game must assign East, South, West, and North exactly once");
  }
  if (state.players[state.hand.activePlayerId] === undefined) {
    fail("The active player must exist");
  }
  if (
    state.players[state.match.dealerPlayerId]?.seat !== "east" ||
    state.hand.dealerPlayerId !== state.match.dealerPlayerId
  ) {
    fail("The current dealer must hold the East seat");
  }
  const expectedPrevailingWinds =
    state.match.matchLength === "one_wind"
      ? state.ruleset.prevailingWinds.slice(0, 1)
      : [...state.ruleset.prevailingWinds];
  if (
    expectedPrevailingWinds.length !== state.match.effectivePrevailingWinds.length ||
    expectedPrevailingWinds.some(
      (wind, index) => state.match.effectivePrevailingWinds[index] !== wind,
    ) ||
    !Number.isSafeInteger(state.match.prevailingWindIndex) ||
    state.match.prevailingWindIndex < 0 ||
    state.match.prevailingWindIndex >= state.match.effectivePrevailingWinds.length ||
    state.match.prevailingWind !==
      state.match.effectivePrevailingWinds[state.match.prevailingWindIndex] ||
    !Number.isSafeInteger(state.match.windHandIndex) ||
    state.match.windHandIndex < 0 ||
    state.match.windHandIndex >= WINDS.length
  ) {
    fail("Match wind progression is invalid");
  }
  const terminal = state.phase === "hand_ended" || state.phase === "match_ended";
  if (
    !Number.isSafeInteger(state.match.handIndex) ||
    state.match.handIndex < 0 ||
    !Number.isSafeInteger(state.match.handsCompleted) ||
    state.match.handsCompleted !== state.match.handIndex + (terminal ? 1 : 0) ||
    state.hand.id !== `hand:${state.gameId}:${state.branchId}:${String(state.match.handIndex)}` ||
    state.hand.seed !==
      (state.match.handIndex === 0
        ? state.seed
        : deriveSeed(state.seed, "hand", String(state.match.handIndex)))
  ) {
    fail("Match hand progression is invalid");
  }

  const wallLength = state.wall.tiles.length;
  if (
    state.wall.liveIndex < 0 ||
    state.wall.liveIndex > wallLength ||
    state.wall.replacementIndex < -1 ||
    state.wall.replacementIndex >= wallLength ||
    state.wall.liveIndex > state.wall.replacementIndex + 1
  ) {
    fail("Wall draw boundaries are invalid");
  }

  const expectedInventory = createTileInventory(state.ruleset.bonusTilesEnabled);
  if (
    state.wall.tiles.length !== expectedInventory.length ||
    new Set(state.wall.tiles).size !== expectedInventory.length ||
    expectedInventory.some((tileId) => !state.wall.tiles.includes(tileId))
  ) {
    fail("The persisted wall order is not the resolved physical inventory");
  }

  const zones = authoritativeTileZones(state);
  if (zones.length !== expectedInventory.length || new Set(zones).size !== zones.length) {
    fail("Every physical tile must exist in exactly one authoritative zone");
  }
  if (expectedInventory.some((tileId) => !zones.includes(tileId))) {
    fail("An authoritative tile zone is missing a physical tile");
  }

  for (const player of players) {
    for (const tileId of player.concealed) {
      if (getTileDefinition(tileTypeFromInstanceId(tileId)).bonus) {
        fail(`Bonus tile ${tileId} cannot remain concealed`);
      }
    }
    for (const bonusTileId of player.bonusTiles) {
      if (!getTileDefinition(tileTypeFromInstanceId(bonusTileId)).bonus) {
        fail(`Standard tile ${bonusTileId} cannot enter the bonus zone`);
      }
    }
    for (const meld of player.melds) {
      const expectedSize = meld.kind === "kong" ? 4 : 3;
      if (meld.tileIds.length !== expectedSize) {
        fail(`Meld ${meld.id} has an invalid physical tile count`);
      }
      if (meld.tileIds.some((tileId) => getTileDefinition(tileTypeFromInstanceId(tileId)).bonus)) {
        fail(`Meld ${meld.id} contains a bonus tile`);
      }
      const definitions = meld.tileIds.map((tileId) =>
        getTileDefinition(tileTypeFromInstanceId(tileId)),
      );
      if (meld.kind === "chow") {
        const ranks = definitions
          .map(({ rank }) => rank)
          .filter((rank): rank is NonNullable<typeof rank> => rank !== undefined)
          .sort((left, right) => left - right);
        if (
          ranks.length !== 3 ||
          new Set(definitions.map(({ category }) => category)).size !== 1 ||
          ranks[1] !== ranks[0]! + 1 ||
          ranks[2] !== ranks[1] + 1 ||
          meld.kongKind !== null
        ) {
          fail(`Meld ${meld.id} is not a valid chow`);
        }
      } else if (new Set(meld.tileIds.map((tileId) => tileTypeFromInstanceId(tileId))).size !== 1) {
        fail(`Meld ${meld.id} does not contain one tile type`);
      }
      if (
        (meld.kind === "kong") !== (meld.kongKind !== null) ||
        (meld.kongKind === "concealed" && meld.exposed)
      ) {
        fail(`Meld ${meld.id} has inconsistent kong visibility`);
      }
    }
    for (const discard of player.discards) {
      if (
        (discard.claimedBy !== null && discard.winningPlayerIds.length > 0) ||
        (discard.claimedBy === null) !== (discard.claimMeldId === null) ||
        new Set(discard.winningPlayerIds).size !== discard.winningPlayerIds.length ||
        discard.winningPlayerIds.some((winnerId) => state.players[winnerId] === undefined)
      ) {
        fail(`Discard ${discard.id} has inconsistent claim disposition`);
      }
    }
  }

  if (state.phase === "awaiting_discard") {
    for (const player of players) {
      const expected =
        (player.id === state.hand.activePlayerId ? 14 : 13) - player.melds.length * 3;
      if (player.concealed.length !== expected) {
        fail(`Player ${player.id} has an invalid ready concealed count`);
      }
    }
  } else if (state.phase === "awaiting_claims") {
    for (const player of players) {
      const expected = 13 - player.melds.length * 3;
      if (player.concealed.length !== expected) {
        fail(`Player ${player.id} has an invalid claim-window concealed count`);
      }
    }
  } else if (state.phase === "awaiting_kong_robbery") {
    for (const player of players) {
      const expected =
        (player.id === state.hand.activePlayerId ? 14 : 13) - player.melds.length * 3;
      if (player.concealed.length !== expected) {
        fail(`Player ${player.id} has an invalid robbery-window concealed count`);
      }
    }
  } else if (state.phase === "drawing_replacement") {
    for (const player of players) {
      const expected = 13 - player.melds.length * 3;
      if (player.concealed.length !== expected) {
        fail(`Player ${player.id} has an invalid pre-replacement concealed count`);
      }
    }
  }

  const scoreTotal = players.reduce((total, player) => total + player.score, 0);
  if (scoreTotal !== state.match.initialTotalScore) {
    fail("Player scores must sum to the match initial total");
  }

  if (
    (state.phase === "awaiting_claims" && state.pending?.kind !== "discard_claim") ||
    (state.phase === "awaiting_kong_robbery" && state.pending?.kind !== "kong_robbery") ||
    ((state.phase === "hand_ended" || state.phase === "match_ended") && state.hand.result === null)
  ) {
    fail("The phase and pending/result state disagree");
  }
  if (
    state.pending !== null &&
    state.phase !== "awaiting_claims" &&
    state.phase !== "awaiting_kong_robbery"
  ) {
    fail("A pending window requires a claim or robbery phase");
  }
  if (state.pending !== null) {
    const eligible = new Set(state.pending.eligiblePlayerIds);
    const sourcePlayerId =
      state.pending.kind === "discard_claim" ? state.pending.discarderId : state.pending.proposerId;
    if (
      eligible.size !== 3 ||
      eligible.has(sourcePlayerId) ||
      Object.keys(state.pending.optionsByPlayer).some((playerId) => !eligible.has(playerId)) ||
      Object.keys(state.pending.responses).some((playerId) => !eligible.has(playerId))
    ) {
      fail("Pending responses must belong to distinct eligible players");
    }
    for (const playerId of state.pending.eligiblePlayerIds) {
      const options = state.pending.optionsByPlayer[playerId];
      if (options?.filter(({ type }) => type === "pass").length !== 1) {
        return fail(`Pending player ${playerId} must have exactly one pass option`);
      }
      assertUniqueActionIds(options);
      const response = state.pending.responses[playerId];
      if (
        response !== undefined &&
        (response.playerId !== playerId || !options.some(({ id }) => id === response.action.id))
      ) {
        fail(`Pending response for ${playerId} was not an emitted option`);
      }
    }
  }

  if (new Set(state.processedRequestIds).size !== state.processedRequestIds.length) {
    fail("Processed request IDs must remain unique");
  }
  if (computeStateHash(state) !== state.stateHash) {
    fail("The state hash does not match canonical state content");
  }
  if (
    state.revision < 1 ||
    state.lastEventId !== `event:${state.gameId}:${state.branchId}:${String(state.revision)}`
  ) {
    fail("The state revision and last event ID disagree");
  }
};

export const playerAfter = (state: GameState, playerId: PlayerId): PlayerId => {
  const player = state.players[playerId];
  if (player === undefined) {
    return fail(`Unknown player ${playerId}`);
  }
  const nextWind = WINDS[(WINDS.indexOf(player.seat) + 1) % WINDS.length];
  const nextPlayer = Object.values(state.players).find(({ seat }) => seat === nextWind);
  if (nextPlayer === undefined) {
    return fail(`No player occupies the seat after ${player.seat}`);
  }
  return nextPlayer.id;
};
