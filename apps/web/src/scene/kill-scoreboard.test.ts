import { describe, expect, it } from "vitest";

import { createKillScoreSnapshot, recordKill } from "./kill-scoreboard.js";

describe("match kill scoreboard", () => {
  it("starts a match with zero kills and no last killer", () => {
    expect(createKillScoreSnapshot()).toEqual({
      playerKills: 0,
      simulantKills: 0,
      lastKiller: null,
    });
  });

  it("keeps immutable totals for both actors", () => {
    const initial = createKillScoreSnapshot();
    const playerLead = recordKill(initial, "player");
    const simulantLead = recordKill(playerLead, "simulant");

    expect(initial).toEqual({ playerKills: 0, simulantKills: 0, lastKiller: null });
    expect(playerLead).toEqual({ playerKills: 1, simulantKills: 0, lastKiller: "player" });
    expect(simulantLead).toEqual({ playerKills: 1, simulantKills: 1, lastKiller: "simulant" });
  });
});
