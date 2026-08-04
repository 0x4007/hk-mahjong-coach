import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionController, DEFAULT_OPPONENTS } from "./index.js";

const databasePath = (): string =>
  join(mkdtempSync(join(tmpdir(), "hk-mahjong-session-")), "game.sqlite");

describe("session composition boundary", () => {
  it("creates a protocol observation without exposing authoritative state", () => {
    const controller = new SessionController();
    try {
      const created = controller.create({
        mode: "guided",
        rulesetId: "hk_nyc_social_v1",
        matchLength: "one_wind",
        seed: "session-observation",
        learnerId: "learner-1",
        humanPlayerId: "player-0",
        humanDisplayName: "Learner",
        preferredSeat: "east",
        opponents: DEFAULT_OPPONENTS,
      });
      expect(created.game).toEqual({ gameId: created.observation.gameId, branchId: "main" });
      expect(created.observation.private.concealedTiles).toHaveLength(14);
      expect(created.observation.players.every((player) => player.concealedTileCount > 0)).toBe(
        true,
      );
      expect(created).not.toHaveProperty("state");
      expect(created).not.toHaveProperty("events");
      expect(JSON.stringify(created)).not.toContain("wallOrder");
    } finally {
      controller.close();
    }
  });

  it("resumes the latest persisted session after a controller restart", () => {
    const path = databasePath();
    const first = new SessionController({ databasePath: path });
    const created = first.create({
      mode: "guided",
      rulesetId: "hk_nyc_social_v1",
      matchLength: "one_wind",
      seed: "session-restart",
      learnerId: "learner-restart",
      humanPlayerId: "player-0",
      humanDisplayName: "Learner",
      preferredSeat: "east",
      opponents: DEFAULT_OPPONENTS,
    });
    const action = created.observation.legalActions[0];
    if (action === undefined) {
      throw new Error("Expected a legal opening action");
    }
    const accepted = first.submit({
      gameId: created.game.gameId,
      branchId: created.game.branchId,
      playerId: "player-0",
      expectedRevision: created.observation.revision,
      requestId: "session-restart-action",
      actionId: action.id,
    });
    expect(accepted.accepted).toBe(true);
    first.close();

    const second = new SessionController({ databasePath: path });
    try {
      const resumed = second.resume("learner-restart");
      expect(resumed?.game).toEqual(created.game);
      expect(resumed?.observation.revision).toBeGreaterThan(created.observation.revision);
      expect(resumed?.observation.private.concealedTiles).toEqual(
        second.observation(created.game.gameId, "player-0").private.concealedTiles,
      );

      const replayController = new SessionController({ databasePath: path });
      try {
        const replay = replayController.replay(created.game.gameId, "player-0");
        expect(replay.events.length).toBeGreaterThan(0);
        expect(replay.terminalObservation.revision).toBe(resumed?.observation.revision);
      } finally {
        replayController.close();
      }
    } finally {
      second.close();
      rmSync(path, { force: true });
      rmSync(join(path, ".."), { recursive: true, force: true });
    }
  });

  it("persists grounded human decision evidence with the accepted action", () => {
    const path = databasePath();
    const controller = new SessionController({ databasePath: path });
    try {
      const created = controller.create({
        mode: "guided",
        rulesetId: "hk_nyc_social_v1",
        matchLength: "one_wind",
        seed: "session-evidence",
        learnerId: "learner-evidence",
        humanPlayerId: "player-0",
        humanDisplayName: "Learner",
        preferredSeat: "east",
        opponents: DEFAULT_OPPONENTS,
      });
      const action = created.observation.legalActions[0];
      if (action === undefined) throw new Error("Expected a legal opening action");
      const accepted = controller.submit({
        gameId: created.game.gameId,
        branchId: created.game.branchId,
        playerId: "player-0",
        expectedRevision: created.observation.revision,
        requestId: "session-evidence-action",
        actionId: action.id,
      });
      expect(accepted.accepted).toBe(true);
      const exported = controller.exportData({ includeLlmMetadata: false });
      expect(exported.data.decisions).toHaveLength(1);
      expect(exported.data.decisions[0]).toMatchObject({
        learnerId: "learner-evidence",
        actionId: action.id,
        requestId: "session-evidence-action",
      });
      expect(exported.data.analysisFacts.length).toBeGreaterThan(0);
      expect(exported.data.decisions[0]?.data).toMatchObject({ selectedActionId: action.id });
    } finally {
      controller.close();
      rmSync(path, { force: true });
      rmSync(join(path, ".."), { recursive: true, force: true });
    }
  });

  it("updates decision mastery and resumes a persisted drill session", () => {
    const path = databasePath();
    const first = new SessionController({ databasePath: path });
    const drill = first.createDrillSession("learner-drill", ["tile_recognition"]);
    const firstItem = drill.items[0];
    if (firstItem === undefined) throw new Error("Expected a bundled drill item");
    const firstAnswer = first.answerDrill({
      sessionId: drill.sessionId,
      requestId: "drill-answer-1",
      answer: firstItem.choices[0],
      hintLevel: "none",
    });
    expect(firstAnswer.correct).toBe(true);
    expect(first.mastery("learner-drill")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conceptId: "tile_recognition", attempts: 1 }),
      ]),
    );
    first.close();

    const second = new SessionController({ databasePath: path });
    try {
      const secondItem = drill.items[1];
      if (secondItem === undefined) throw new Error("Expected a second persisted drill item");
      const resumed = second.answerDrill({
        sessionId: drill.sessionId,
        requestId: "drill-answer-2",
        answer: secondItem.choices[0],
        hintLevel: "none",
      });
      expect(resumed.correct).toBe(true);
      expect(second.mastery("learner-drill")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ conceptId: "tile_recognition", attempts: 2 }),
        ]),
      );
    } finally {
      second.close();
      rmSync(path, { force: true });
      rmSync(join(path, ".."), { recursive: true, force: true });
    }
  });
});
