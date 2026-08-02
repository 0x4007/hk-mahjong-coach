import { type RandomSource, shuffle } from "./rng.js";

export const WINDS = ["east", "south", "west", "north"] as const;
export type Wind = (typeof WINDS)[number];

export const nextSeat = (seat: Wind): Wind => {
  switch (seat) {
    case "east":
      return "south";
    case "south":
      return "west";
    case "west":
      return "north";
    case "north":
      return "east";
  }
};

/** Returns 0 for the same seat, then 1–3 in East → South → West → North order. */
export const seatDistance = (from: Wind, to: Wind): number => {
  const fromIndex = WINDS.indexOf(from);
  const toIndex = WINDS.indexOf(to);
  return (toIndex - fromIndex + WINDS.length) % WINDS.length;
};

export const seatsAfter = (seat: Wind): readonly Wind[] => {
  const ordered: Wind[] = [];
  let cursor = seat;
  for (let count = 0; count < WINDS.length - 1; count += 1) {
    cursor = nextSeat(cursor);
    ordered.push(cursor);
  }
  return ordered;
};

export interface SeatAssignment<PlayerId extends string = string> {
  playerId: PlayerId;
  seat: Wind;
}

export const randomizeSeats = <PlayerId extends string>(
  playerIds: readonly [PlayerId, PlayerId, PlayerId, PlayerId],
  random: RandomSource,
): readonly SeatAssignment<PlayerId>[] => {
  if (new Set(playerIds).size !== WINDS.length) {
    throw new TypeError("Seat assignment requires four distinct player IDs");
  }
  const shuffledPlayers = shuffle(playerIds, random);
  return shuffledPlayers.map((playerId, index) => {
    const seat = WINDS[index];
    if (seat === undefined) {
      throw new Error("Seeded seat shuffle returned an invalid player count");
    }
    return { playerId, seat };
  });
};
