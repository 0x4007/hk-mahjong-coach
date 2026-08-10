import type { GameEvent, GameState, PlayerId } from "./domain.js";
import { WINDS } from "./seats.js";
import {
  getTileDefinition,
  sortTileInstances,
  tileTypeFromInstanceId,
  type TileInstanceId,
} from "./tiles.js";

type InitialDealPayload = Pick<
  Extract<GameEvent, { type: "initial_deal_completed" }>,
  "type" | "deals" | "trace" | "liveIndex" | "replacementIndex"
>;

const playerIdsInSeatOrder = (
  players: Readonly<Record<PlayerId, { id: PlayerId; seat: (typeof WINDS)[number] }>>,
): readonly PlayerId[] =>
  Object.values(players)
    .sort((left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat))
    .map(({ id }) => id);

/** Plans the one authoritative 13-round deal, East extra tile, and chained bonus replacements. */
export const planInitialDeal = (state: GameState): InitialDealPayload => {
  let liveIndex = state.wall.liveIndex;
  let replacementIndex = state.wall.replacementIndex;
  const seatOrder = playerIdsInSeatOrder(state.players);
  const deals: Record<
    PlayerId,
    {
      concealed: TileInstanceId[];
      bonusTiles: TileInstanceId[];
      drawnTileId: TileInstanceId | null;
    }
  > = {};
  for (const playerId of seatOrder) {
    deals[playerId] = { concealed: [], bonusTiles: [], drawnTileId: null };
  }
  const trace: {
    playerId: PlayerId;
    tileId: TileInstanceId;
    source: "live" | "replacement";
    disposition: "concealed" | "bonus";
  }[] = [];

  const take = (source: "live" | "replacement"): TileInstanceId => {
    /* v8 ignore next -- validated walls have enough tiles for a complete initial deal */
    if (liveIndex > replacementIndex) {
      throw new Error("The wall exhausted during the initial deal");
    }
    const tileId =
      source === "live" ? state.wall.tiles[liveIndex++] : state.wall.tiles[replacementIndex--];
    /* v8 ignore next -- validated contiguous wall bounds always resolve an instance */
    if (tileId === undefined) {
      throw new Error("The wall has an invalid draw boundary");
    }
    return tileId;
  };

  const fillSlot = (
    playerId: PlayerId,
    dealerExtra: boolean,
    source: "live" | "replacement" = "live",
  ): void => {
    const deal = deals[playerId];
    /* v8 ignore next -- playerId comes from the same seat-order map used to create deals */
    if (deal === undefined) throw new Error(`Initial deal references unknown player ${playerId}`);
    const tileId = take(source);
    const bonus = getTileDefinition(tileTypeFromInstanceId(tileId)).bonus;
    trace.push({
      playerId,
      tileId,
      source,
      disposition: bonus ? "bonus" : "concealed",
    });
    if (bonus) {
      deal.bonusTiles.push(tileId);
      fillSlot(playerId, dealerExtra, "replacement");
      return;
    }
    deal.concealed.push(tileId);
    if (dealerExtra) {
      deal.drawnTileId = tileId;
    }
  };

  for (let round = 0; round < 13; round += 1) {
    for (const playerId of seatOrder) {
      fillSlot(playerId, false);
    }
  }
  fillSlot(state.match.dealerPlayerId, true);

  for (const deal of Object.values(deals)) {
    deal.concealed = [...sortTileInstances(deal.concealed)];
  }
  return {
    type: "initial_deal_completed",
    deals,
    trace,
    liveIndex,
    replacementIndex,
  };
};
