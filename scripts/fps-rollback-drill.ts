import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonHash } from "@hk-mahjong/core";
import { FpsMatch, verifyFpsReplay } from "@hk-mahjong/fps";
import {
  fpsReplaySchema,
  fpsRoomCreateResponseSchema,
  fpsRoomJoinResponseSchema,
  fpsSnapshotSchema,
} from "@hk-mahjong/protocol";
import { FpsMatchJournal } from "@hk-mahjong/persistence";
import { FpsMatchService } from "../apps/server/src/fps-match.js";

const ROLLBACK_SEED = "fps-rollback-drill-v1";

const makeInput = (
  matchId: string,
  playerId: string,
  inputSequence: number,
  serverTick: number,
) => ({
  protocolVersion: 1 as const,
  matchId,
  playerId,
  inputSequence,
  clientTimestampMs: Date.now(),
  acknowledgedServerTick: serverTick,
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  buttons: {
    forward: true,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jump: false,
    fire: false,
    reload: false,
  },
  selectedWeaponId: "pistol" as const,
  actionNonce: null,
});

const stableSnapshot = (snapshot: ReturnType<typeof fpsSnapshotSchema.parse>) => ({
  matchId: snapshot.matchId,
  roomId: snapshot.roomId,
  serverTick: snapshot.serverTick,
  durationTicks: snapshot.durationTicks,
  scoreTarget: snapshot.scoreTarget,
  acknowledgedInputSequence: snapshot.acknowledgedInputSequence,
  rulesHash: snapshot.rulesHash,
  mapHash: snapshot.mapHash,
  weaponSetHash: snapshot.weaponSetHash,
  rngVersion: snapshot.rngVersion,
  phase: snapshot.phase,
  players: snapshot.players,
  scoreboard: snapshot.scoreboard,
  events: snapshot.events,
  privatePlayer: snapshot.privatePlayer,
  full: snapshot.full,
  resyncRequired: snapshot.resyncRequired,
});

const main = async (): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), "hk-mahjong-fps-rollback-"));
  const databasePath = join(directory, "fps.sqlite");
  let owner: ReturnType<typeof fpsRoomCreateResponseSchema.parse>;
  let beforeSnapshot: ReturnType<typeof fpsSnapshotSchema.parse>;
  let beforeReplay: ReturnType<typeof fpsReplaySchema.parse>;
  let continuedInputAccepted: boolean;
  let checkpointRestored: boolean;
  try {
    const first = new FpsMatchService({
      databasePath,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    try {
      owner = fpsRoomCreateResponseSchema.parse(
        first.createRoom({
          displayName: "Rollback Owner",
          seed: ROLLBACK_SEED,
          scoreTarget: 10,
          durationSeconds: 60,
        }),
      );
      const joined = fpsRoomJoinResponseSchema.parse(
        first.joinRoom(owner.matchId, { displayName: "Rollback Rival" }),
      );
      first.ready(owner.matchId, owner.playerId, owner.ticket, "rollback-ready-owner");
      first.ready(joined.matchId, joined.playerId, joined.ticket, "rollback-ready-rival");
      first.start(owner.matchId, owner.playerId, owner.ticket, "rollback-start");
      const accepted = first.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        makeInput(owner.matchId, owner.playerId, 0, 0),
      );
      assert.equal(accepted.acknowledgedInputSequence, 0);
      first.advanceTicksForDeterministicGate(25);
      beforeSnapshot = fpsSnapshotSchema.parse(
        first.getSnapshot(owner.matchId, owner.playerId, owner.ticket, true, 0),
      );
      beforeReplay = fpsReplaySchema.parse(
        first.getReplay(owner.matchId, owner.playerId, owner.ticket),
      );
      assert.equal(JSON.stringify(beforeSnapshot).includes(ROLLBACK_SEED), false);
      assert.equal(JSON.stringify(beforeReplay).includes(ROLLBACK_SEED), false);
      assert.ok(beforeReplay.events.length > 0);
    } finally {
      first.close();
    }

    const journal = new FpsMatchJournal(databasePath);
    try {
      const checkpoint = journal.loadMatches()[0];
      assert.ok(checkpoint !== undefined);
      const restoredMatch = FpsMatch.fromCheckpoint(checkpoint);
      assert.equal(verifyFpsReplay(restoredMatch.getReplay()), true);
      checkpointRestored = true;
      beforeSnapshot = fpsSnapshotSchema.parse(restoredMatch.getSnapshot(owner.playerId, true, 0));
    } finally {
      journal.close();
    }

    const restored = new FpsMatchService({ databasePath });
    try {
      const afterSnapshot = fpsSnapshotSchema.parse(
        restored.getSnapshot(owner.matchId, owner.playerId, owner.ticket, true, 0),
      );
      const afterReplay = fpsReplaySchema.parse(
        restored.getReplay(owner.matchId, owner.playerId, owner.ticket),
      );
      assert.deepEqual(afterReplay, beforeReplay);
      assert.deepEqual(stableSnapshot(afterSnapshot), stableSnapshot(beforeSnapshot));
      const continued = restored.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        makeInput(owner.matchId, owner.playerId, 1, afterSnapshot.serverTick),
      );
      continuedInputAccepted = continued.acknowledgedInputSequence === 1;
      assert.equal(continuedInputAccepted, true);
      assert.equal(
        restored.getReplay(owner.matchId, owner.playerId, owner.ticket).events.length,
        beforeReplay.events.length,
      );
    } finally {
      restored.close();
    }

    const receipt = {
      schemaVersion: 1,
      policy: {
        temporaryDatabaseOnly: true,
        sourceResetUsed: false,
        publicEdgeUsed: false,
        seedOrTicketPersistedInReceipt: false,
      },
      match: {
        phase: beforeSnapshot.phase,
        serverTick: beforeSnapshot.serverTick,
        publicReplayEvents: beforeReplay.events.length,
        rulesHash: beforeSnapshot.rulesHash,
        mapHash: beforeSnapshot.mapHash,
        weaponSetHash: beforeSnapshot.weaponSetHash,
        replayVerified: true,
        checkpointRestored,
        continuedInputAccepted,
      },
    };
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/fps-rollback.json", `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ ...receipt, receiptDigest: `sha256:${canonicalJsonHash(receipt)}` })}\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

await main();
