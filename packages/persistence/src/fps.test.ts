import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FpsMatch } from "@hk-mahjong/fps";
import { FpsMatchJournal } from "./fps.js";

describe("FPS durable journal", () => {
  it("persists a checkpoint, event chain, and ticket session across a fresh handle", () => {
    const directory = mkdtempSync(join(tmpdir(), "hk-mahjong-fps-journal-"));
    const databasePath = join(directory, "fps.sqlite");
    try {
      const first = new FpsMatchJournal(databasePath);
      const match = new FpsMatch({
        matchId: "m1",
        roomId: "r1",
        seed: "seed",
        skipCountdown: true,
      });
      match.addPlayer({ playerId: "p1", displayName: "One" });
      first.saveMatch(match.exportCheckpoint(), "2026-08-07T00:00:00.000Z");
      first.saveSession({
        matchId: "m1",
        playerId: "p1",
        ticketHash: `sha256:${"a".repeat(64)}`,
        owner: true,
        createdAtMs: 0,
        expiresAtMs: 0,
        revoked: false,
      });
      first.close();
      const second = new FpsMatchJournal(databasePath);
      expect(second.loadMatches()[0]?.matchId).toBe("m1");
      expect(second.loadMatches()[0]?.eventRecords).toEqual([]);
      expect(second.loadSessions()).toEqual([
        {
          matchId: "m1",
          playerId: "p1",
          ticketHash: `sha256:${"a".repeat(64)}`,
          owner: true,
          createdAtMs: 0,
          expiresAtMs: 0,
          revoked: false,
        },
      ]);
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
