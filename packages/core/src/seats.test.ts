import { describe, expect, it } from "vitest";
import { createSeededRandom } from "./rng.js";
import { nextSeat, randomizeSeats, seatDistance, seatsAfter } from "./seats.js";

describe("seat order", () => {
  it("uses East, South, West, North turn order", () => {
    expect(nextSeat("east")).toBe("south");
    expect(nextSeat("south")).toBe("west");
    expect(nextSeat("west")).toBe("north");
    expect(nextSeat("north")).toBe("east");
    expect(seatsAfter("west")).toEqual(["north", "east", "south"]);
    expect(seatDistance("west", "south")).toBe(3);
  });

  it("assigns four distinct players reproducibly", () => {
    const players = ["p0", "p1", "p2", "p3"] as const;
    const first = randomizeSeats(players, createSeededRandom("seats"));
    const second = randomizeSeats(players, createSeededRandom("seats"));

    expect(first).toEqual(second);
    expect(new Set(first.map(({ playerId }) => playerId))).toEqual(new Set(players));
    expect(() => randomizeSeats(["p0", "p0", "p2", "p3"], createSeededRandom("duplicate"))).toThrow(
      /distinct player IDs/u,
    );
    expect(() =>
      randomizeSeats(
        ["p0", "p1", "p2", "p3", "p3"] as unknown as ["p0", "p1", "p2", "p3"],
        createSeededRandom("wrong-length"),
      ),
    ).toThrow(/invalid player count/u);
  });
});
