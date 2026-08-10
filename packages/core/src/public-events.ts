import type { GameEvent, GameState, PublicGameEvent, PublicHandResult } from "./domain.js";
import { projectPublicScoringResult } from "./public-scoring.js";
import { reduceGameEvent } from "./reducer.js";
import { WINDS } from "./seats.js";
import { tileTypeFromInstanceId } from "./tiles.js";

const base = (event: GameEvent, after: GameState) => ({
  schemaVersion: 1 as const,
  eventId: event.id,
  gameId: event.gameId,
  branchId: after.branchId,
  practiceBranch: after.practiceBranch,
  revision: event.revision,
});

const remainingWallCount = (state: GameState): number =>
  Math.max(0, state.wall.replacementIndex - state.wall.liveIndex + 1);

const publicResult = (state: GameState): PublicHandResult => {
  const result = state.hand.result;
  /* v8 ignore next -- only terminal reducers invoke a terminal public projection */
  if (result === null) {
    throw new Error("A terminal public event requires a hand result");
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

const assertNever = (event: never): never => {
  throw new Error(`Unhandled authoritative event ${JSON.stringify(event)}`);
};

/**
 * Converts one trusted persistence event into zero or more broadcast-safe events.
 * Request IDs, physical tile IDs, seeds, walls, hidden choices, and claim options never cross
 * this boundary.
 */
export const projectPublicEvent = (
  before: GameState | undefined,
  event: GameEvent,
  after: GameState,
): readonly PublicGameEvent[] => {
  void before;
  const metadata = base(event, after);
  switch (event.type) {
    case "game_created":
      return [
        {
          ...metadata,
          type: "game_started",
          mode: event.mode,
          matchLength: event.matchLength,
          ruleset: {
            id: event.rules.id,
            version: event.rules.version,
            hash: event.rules.hash,
            minimumFaan: event.rules.minimumFaan,
            capFaan: event.rules.capFaan,
            bonusTilesEnabled: event.rules.bonusTilesEnabled,
          },
          players: event.players.map((player) => ({
            playerId: player.id,
            displayName: player.displayName,
            controller: player.controller,
            seat: player.seat,
            score: player.initialScore,
          })),
          prevailingWind: after.match.prevailingWind,
          dealerPlayerId: after.match.dealerPlayerId,
        },
      ];

    case "initial_deal_completed":
      return [
        {
          ...metadata,
          type: "initial_deal_completed",
          handId: after.hand.id,
          players: Object.values(after.players)
            .sort((left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat))
            .map((player) => ({
              playerId: player.id,
              concealedTileCount: player.concealed.length,
              bonusTileTypes: player.bonusTiles.map(tileTypeFromInstanceId),
            })),
          liveWallCount: remainingWallCount(after),
        },
      ];

    case "draw_completed":
      return [
        {
          ...metadata,
          type: "tile_drawn",
          playerId: event.playerId,
          concealedTileDrawn: event.steps.some(({ disposition }) => disposition === "concealed"),
          exposedBonusTileTypes: event.steps
            .filter(({ disposition }) => disposition === "bonus")
            .map(({ tileId }) => tileTypeFromInstanceId(tileId)),
          outcome: event.outcome,
          liveWallCount: remainingWallCount(after),
        },
      ];

    case "tile_discarded":
      return [
        {
          ...metadata,
          type: "tile_discarded",
          playerId: event.playerId,
          discardId: event.discardId,
          windowId: event.windowId,
          tileTypeId: tileTypeFromInstanceId(event.tileId),
          followedFinalLiveDraw: event.followedFinalLiveDraw,
        },
      ];

    case "claim_response_recorded":
      return [];

    case "meld_claimed": {
      const meld = after.players[event.playerId]?.melds.find(({ id }) => id === event.meldId);
      /* v8 ignore next -- the reducer creates this exact meld before projection */
      if (meld === undefined) {
        throw new Error(`Public projection cannot find claimed meld ${event.meldId}`);
      }
      return [
        {
          ...metadata,
          type: "meld_claimed",
          playerId: event.playerId,
          discardId: event.discardId,
          meldId: event.meldId,
          kind: event.kind,
          tileTypes: meld.tileIds.map(tileTypeFromInstanceId),
        },
      ];
    }

    case "kong_proposed":
      return [
        {
          ...metadata,
          type: "kong_proposed",
          windowId: event.windowId,
          proposerId: event.proposerId,
          kongKind: event.kongKind,
          tileTypeId: tileTypeFromInstanceId(event.robberyTileId),
          meldId: event.meldId,
        },
      ];

    case "kong_completed": {
      const meld = after.players[event.playerId]?.melds.find(({ id }) => id === event.meldId);
      /* v8 ignore next -- the reducer finalizes this exact kong before projection */
      if (meld === undefined) {
        throw new Error(`Public projection cannot find completed kong ${event.meldId}`);
      }
      return [
        {
          ...metadata,
          type: "kong_completed",
          playerId: event.playerId,
          kongKind: event.kongKind,
          meldId: event.meldId,
          tileTypes: meld.tileIds.map(tileTypeFromInstanceId),
        },
      ];
    }

    case "hand_won":
    case "hand_ended":
      return [
        {
          ...metadata,
          type: "hand_ended",
          handId: after.hand.id,
          result: publicResult(after),
        },
      ];

    case "next_hand_started":
      return [
        {
          ...metadata,
          type: "hand_started",
          previousHandId: event.previousHandId,
          handId: event.handId,
          dealerRepeated: event.dealerRepeated,
          handIndex: event.handIndex,
          handsCompleted: event.handsCompleted,
          prevailingWindIndex: event.prevailingWindIndex,
          prevailingWind: event.prevailingWind,
          windHandIndex: event.windHandIndex,
          dealerPlayerId: event.dealerPlayerId,
          seatAssignments: structuredClone(event.seatAssignments),
        },
      ];

    case "practice_branch_created":
      return [
        {
          ...metadata,
          type: "practice_branch_created",
          parentBranchId: event.parentBranchId,
          parentRevision: event.parentRevision,
          parentEventId: event.parentEventId,
          originDecisionId: event.originDecisionId,
          originDecisionBranchId: event.originDecisionBranchId,
          requestedByPlayerId: event.requestedByPlayerId,
        },
      ];

    case "match_ended":
      return [
        {
          ...metadata,
          type: "match_ended",
          finalHandId: event.finalHandId,
          reason: event.reason,
          standings: Object.values(after.players)
            .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
            .map(({ id, seat, score }) => ({ playerId: id, seat, score })),
        },
      ];

    default:
      /* v8 ignore next -- the switch is compile-time exhaustive over GameEvent */
      return assertNever(event);
  }
};

export const projectPublicEventStream = (
  events: readonly GameEvent[],
): readonly PublicGameEvent[] => {
  let state: GameState | undefined;
  const projected: PublicGameEvent[] = [];
  for (const event of events) {
    const before = state;
    state = reduceGameEvent(state, event);
    projected.push(...projectPublicEvent(before, event, state));
  }
  return projected;
};
