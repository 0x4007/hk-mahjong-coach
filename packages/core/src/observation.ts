import {
  type GameState,
  type LegalAction,
  type OmniscientReplayView,
  type PlayerId,
  type PlayerObservation,
  type PublicDiscard,
  type PublicHandResult,
  type PublicPendingDecision,
  type ScoringPreview,
} from "./domain.js";
import { projectPublicScoringResult } from "./public-scoring.js";
import { computeRoundProgression } from "./progression.js";
import { WINDS } from "./seats.js";
import { tileTypeFromInstanceId } from "./tiles.js";

export interface ObservationOptions {
  winAssessment: ScoringPreview | null;
  claimWinAssessment: ScoringPreview | null;
}

const publicDiscard = (state: GameState, discardId: string | null): PublicDiscard | null => {
  if (discardId === null) {
    return null;
  }
  for (const player of Object.values(state.players)) {
    const discard = player.discards.find(({ id }) => id === discardId);
    if (discard !== undefined) {
      return {
        id: discard.id,
        tileType: tileTypeFromInstanceId(discard.tileId),
        claimedBy: discard.claimedBy,
        winningPlayerIds: [...discard.winningPlayerIds],
      };
    }
  }
  return null;
};

const remainingWallCount = (state: GameState): number =>
  Math.max(0, state.wall.replacementIndex - state.wall.liveIndex + 1);

const publicPending = (state: GameState): PublicPendingDecision | null => {
  if (state.pending === null) {
    return null;
  }
  if (state.pending.kind === "discard_claim") {
    return {
      kind: "discard_claim",
      windowId: state.pending.id,
      sourcePlayerId: state.pending.discarderId,
      tileTypeId: tileTypeFromInstanceId(state.pending.tileId),
      discardId: state.pending.discardId,
    };
  }
  return {
    kind: "kong_robbery",
    windowId: state.pending.id,
    sourcePlayerId: state.pending.proposerId,
    tileTypeId: tileTypeFromInstanceId(state.pending.robberyTileId),
    kongKind: state.pending.kongKind,
    meldId: state.pending.meldId,
  };
};

const publicResult = (state: GameState): PublicHandResult | null => {
  const result = state.hand.result;
  if (result === null) {
    return null;
  }
  if (result.kind !== "win") {
    return structuredClone(result);
  }
  return {
    kind: "win",
    winners: result.winners.map((winner) => ({
      playerId: winner.playerId,
      source: winner.source,
      winningTileTypeId: tileTypeFromInstanceId(winner.winningTileId),
      fromPlayerId: winner.fromPlayerId,
      preview: structuredClone(winner.preview),
      scoring: projectPublicScoringResult(winner.scoring),
    })),
    scoreDeltas: structuredClone(result.scoreDeltas),
  };
};

const publicProgression = (
  state: GameState,
): "repeat_dealer" | "advance_dealer" | "match_complete" | null => {
  if (state.phase !== "hand_ended" && state.phase !== "match_ended") {
    return null;
  }
  const progression = computeRoundProgression(state);
  if (progression.matchComplete) {
    return "match_complete";
  }
  return progression.dealerRepeated ? "repeat_dealer" : "advance_dealer";
};

/**
 * Constructs a player-safe view from scratch. It never copies authoritative wall, seed,
 * state-hash, pending-response, or opponent-concealed fields.
 */
export const createPlayerObservation = (
  state: GameState,
  playerId: PlayerId,
  legalActions: readonly LegalAction[],
  options: ObservationOptions,
): PlayerObservation => {
  const viewer = state.players[playerId];
  if (viewer === undefined) {
    throw new RangeError(`Unknown observation player ${playerId}`);
  }
  const players = Object.values(state.players)
    .sort((left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat))
    .map((player) => ({
      playerId: player.id,
      displayName: player.displayName,
      seat: player.seat,
      score: player.score,
      concealedTileCount: player.concealed.length,
      melds: player.melds.map((meld) => ({
        id: meld.id,
        kind: meld.kind,
        kongKind: meld.kongKind,
        tileTypes: meld.tileIds.map(tileTypeFromInstanceId),
        exposed: meld.exposed,
        claimedFrom: meld.claimedFrom,
      })),
      bonusTiles: player.bonusTiles.map(tileTypeFromInstanceId),
      discards: player.discards.map((discard) => ({
        id: discard.id,
        tileType: tileTypeFromInstanceId(discard.tileId),
        claimedBy: discard.claimedBy,
        winningPlayerIds: [...discard.winningPlayerIds],
      })),
    }));

  return {
    schemaVersion: 1,
    gameId: state.gameId,
    branchId: state.branchId,
    practiceBranch: state.practiceBranch,
    revision: state.revision,
    phase: state.phase,
    ruleset: {
      id: state.ruleset.id,
      version: state.ruleset.version,
      hash: state.ruleset.hash,
      minimumFaan: state.ruleset.minimumFaan,
      capFaan: state.ruleset.capFaan,
      bonusTilesEnabled: state.ruleset.bonusTilesEnabled,
    },
    viewer: {
      playerId: viewer.id,
      seat: viewer.seat,
      score: viewer.score,
    },
    round: {
      prevailingWind: state.match.prevailingWind,
      prevailingWindIndex: state.match.prevailingWindIndex,
      windHandIndex: state.match.windHandIndex,
      dealerPlayerId: state.match.dealerPlayerId,
      handIndex: state.match.handIndex,
      handsCompleted: state.match.handsCompleted,
      liveWallCount: remainingWallCount(state),
      replacementDrawsAvailable: remainingWallCount(state),
      activePlayerId: state.hand.activePlayerId,
      lastDiscard: publicDiscard(state, state.hand.lastDiscardId),
      progression: publicProgression(state),
    },
    players,
    pending: publicPending(state),
    result: publicResult(state),
    private: {
      concealedTiles: [...viewer.concealed],
      drawnTileId: state.hand.activePlayerId === playerId ? state.hand.drawnTileId : null,
      temporaryRestrictions: structuredClone(viewer.temporaryRestrictions),
    },
    legalActions: structuredClone(legalActions),
    winAssessment: structuredClone(options.winAssessment),
    claimWinAssessment: structuredClone(options.claimWinAssessment),
  };
};

/**
 * Omniscient state is a separate, fail-closed API restricted to terminal hands or sandbox mode.
 */
export const createOmniscientReplayView = (state: GameState): OmniscientReplayView => {
  if (state.mode !== "sandbox" && state.phase !== "hand_ended" && state.phase !== "match_ended") {
    throw new Error("Omniscient replay is unavailable during a live non-sandbox hand");
  }
  return {
    schemaVersion: 1,
    state: structuredClone(state),
  };
};
