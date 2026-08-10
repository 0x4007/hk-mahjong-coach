import type { GameState, PlayerId } from "./domain.js";
import { WINDS, type Wind } from "./seats.js";

export interface RoundProgression {
  dealerRepeated: boolean;
  matchComplete: boolean;
  handIndex: number;
  prevailingWindIndex: number;
  prevailingWind: Wind;
  windHandIndex: number;
  dealerPlayerId: PlayerId;
  seatAssignments: readonly {
    playerId: PlayerId;
    seat: Wind;
  }[];
}

const shouldDealerRepeat = (state: GameState): boolean => {
  const result = state.hand.result;
  if (result === null) {
    throw new Error("Round progression requires a terminal hand result");
  }
  if (result.kind === "exhaustive_draw") {
    return state.ruleset.dealerRepeatsOnDraw;
  }
  if (result.kind !== "win") {
    return false;
  }
  const dealerWon = result.winners.some(({ playerId }) => playerId === state.match.dealerPlayerId);
  if (!dealerWon || !state.ruleset.dealerRepeatsOnWin) {
    return false;
  }
  return result.winners.length === 1 || state.ruleset.dealerRepeatsWhenAmongMultipleWinners;
};

const rotatedSeat = (seat: Wind): Wind =>
  WINDS[(WINDS.indexOf(seat) + WINDS.length - 1) % WINDS.length]!;

export const computeRoundProgression = (state: GameState): RoundProgression => {
  if (state.phase !== "hand_ended" && state.phase !== "match_ended") {
    throw new Error("Round progression is available only after a hand ends");
  }
  const dealerRepeated = shouldDealerRepeat(state);
  if (dealerRepeated) {
    return {
      dealerRepeated: true,
      matchComplete: false,
      handIndex: state.match.handIndex + 1,
      prevailingWindIndex: state.match.prevailingWindIndex,
      prevailingWind: state.match.prevailingWind,
      windHandIndex: state.match.windHandIndex,
      dealerPlayerId: state.match.dealerPlayerId,
      seatAssignments: Object.values(state.players).map(({ id, seat }) => ({
        playerId: id,
        seat,
      })),
    };
  }

  const handIndex = state.match.handIndex + 1;
  const advancedWindHandIndex = state.match.windHandIndex + 1;
  const prevailingWindIndex =
    state.match.prevailingWindIndex + Math.floor(advancedWindHandIndex / WINDS.length);
  const windHandIndex = advancedWindHandIndex % WINDS.length;
  const matchComplete = prevailingWindIndex >= state.match.effectivePrevailingWinds.length;
  if (matchComplete) {
    return {
      dealerRepeated: false,
      matchComplete: true,
      handIndex: state.match.handIndex,
      prevailingWindIndex: state.match.prevailingWindIndex,
      prevailingWind: state.match.prevailingWind,
      windHandIndex: state.match.windHandIndex,
      dealerPlayerId: state.match.dealerPlayerId,
      seatAssignments: Object.values(state.players).map(({ id, seat }) => ({
        playerId: id,
        seat,
      })),
    };
  }
  const seatAssignments = Object.values(state.players).map(({ id, seat }) => ({
    playerId: id,
    seat: rotatedSeat(seat),
  }));
  const dealer = seatAssignments.find(({ seat }) => seat === "east");
  /* v8 ignore next -- state invariants require exactly one East seat */
  if (dealer === undefined) {
    throw new Error("Rotated seats do not contain an East dealer");
  }
  return {
    dealerRepeated: false,
    matchComplete: false,
    handIndex,
    prevailingWindIndex,
    prevailingWind: state.match.effectivePrevailingWinds[prevailingWindIndex]!,
    windHandIndex,
    dealerPlayerId: dealer.playerId,
    seatAssignments,
  };
};
