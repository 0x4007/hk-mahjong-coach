import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { canonicalJsonHash } from "@hk-mahjong/core";
import { FpsMatch, FpsSnapshotTracker } from "@hk-mahjong/fps";
import { FpsServiceError, FpsMatchService } from "../apps/server/src/fps-match.js";
import { fpsSnapshotSchema } from "@hk-mahjong/protocol";

const MAX_CLOCK_SKEW_MS = 10_000;

const makeInput = (
  matchId: string,
  playerId: string,
  inputSequence: number,
  clientTimestampMs: number,
  acknowledgedServerTick: number,
) => ({
  protocolVersion: 1 as const,
  matchId,
  playerId,
  inputSequence,
  clientTimestampMs,
  acknowledgedServerTick,
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  buttons: {
    forward: false,
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

const runSnapshotFaultGate = (): Readonly<Record<string, unknown>> => {
  const match = new FpsMatch({
    matchId: "fps-network-match",
    roomId: "fps-network-room",
    seed: "fps-network-seed-v1",
    skipCountdown: true,
  });
  match.addPlayer({ playerId: "fps-network-p1", displayName: "Alice" });
  match.addPlayer({ playerId: "fps-network-p2", displayName: "Bob" });
  match.readyPlayer("fps-network-p1");
  match.readyPlayer("fps-network-p2");
  match.startMatch();
  match.advanceTicks(121);

  const tracker = new FpsSnapshotTracker();
  const full = fpsSnapshotSchema.parse(match.getSnapshot("fps-network-p1", true, 0));
  assert.equal(tracker.apply(full).accepted, true);

  match.advanceTicks(1);
  const dropped = fpsSnapshotSchema.parse(
    match.getSnapshot("fps-network-p1", false, 0, full.snapshotId),
  );
  match.advanceTicks(1);
  const reordered = fpsSnapshotSchema.parse(
    match.getSnapshot("fps-network-p1", false, 0, dropped.snapshotId),
  );
  const reorderedResult = tracker.apply(reordered);
  assert.deepEqual(reorderedResult, {
    accepted: false,
    snapshot: full,
    resyncRequired: true,
    reason: "base_mismatch",
  });
  assert.equal(tracker.apply(dropped).accepted, true);
  assert.equal(tracker.apply(reordered).accepted, true);
  assert.equal(tracker.apply(reordered).accepted, true);

  match.advanceTicks(1);
  const delayed = fpsSnapshotSchema.parse(
    match.getSnapshot("fps-network-p1", false, 0, reordered.snapshotId),
  );
  match.advanceTicks(1);
  const later = fpsSnapshotSchema.parse(
    match.getSnapshot("fps-network-p1", false, 0, delayed.snapshotId),
  );
  assert.equal(tracker.apply(later).resyncRequired, true);
  assert.equal(tracker.apply(delayed).accepted, true);
  assert.equal(tracker.apply(later).accepted, true);

  return {
    fullFrames: 1,
    droppedFrames: 1,
    delayedFrames: 1,
    reorderedFrames: 1,
    duplicateFrames: 1,
    resyncRequests: 2,
    finalServerTick: tracker.getLatest()?.serverTick ?? -1,
  };
};

const runClockSkewGate = (): Readonly<Record<string, unknown>> => {
  const baseTime = 1_750_000_000_000;
  let now = baseTime;
  const service = new FpsMatchService({
    now: () => now,
    maxClientClockSkewMs: MAX_CLOCK_SKEW_MS,
    matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
  });
  try {
    const owner = service.createRoom({ displayName: "Alice", seed: "fps-network-clock" });
    const joined = service.joinRoom(owner.matchId, { displayName: "Bob" });
    service.ready(owner.matchId, owner.playerId, owner.ticket, "network-ready-owner");
    service.ready(joined.matchId, joined.playerId, joined.ticket, "network-ready-joined");
    service.start(owner.matchId, owner.playerId, owner.ticket, "network-start");
    const accepted = service.submitInput(
      owner.matchId,
      owner.playerId,
      owner.ticket,
      makeInput(owner.matchId, owner.playerId, 0, now, 0),
    );
    assert.equal(accepted.acknowledgedInputSequence, 0);

    let staleCode: string | null = null;
    try {
      service.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        makeInput(owner.matchId, owner.playerId, 1, now - MAX_CLOCK_SKEW_MS - 1, 0),
      );
    } catch (caught) {
      assert.ok(caught instanceof FpsServiceError);
      staleCode = caught.code;
    }
    assert.equal(staleCode, "stale_input");

    let futureAckCode: string | null = null;
    try {
      service.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        makeInput(owner.matchId, owner.playerId, 1, now, 3),
      );
    } catch (caught) {
      assert.ok(caught instanceof FpsServiceError);
      futureAckCode = caught.code;
    }
    assert.equal(futureAckCode, "invalid_request");
    now += MAX_CLOCK_SKEW_MS;
    const boundary = service.submitInput(
      owner.matchId,
      owner.playerId,
      owner.ticket,
      makeInput(owner.matchId, owner.playerId, 1, now, 0),
    );
    assert.equal(boundary.acknowledgedInputSequence, 1);

    return {
      acceptedInputs: service.getMetrics().inputAccepted,
      rejectedInputs: service.getMetrics().inputRejected,
      staleCode,
      futureAcknowledgementCode: futureAckCode,
      boundaryAccepted: true,
    };
  } finally {
    service.close();
  }
};

const main = async (): Promise<void> => {
  const receipt = {
    schemaVersion: 1,
    policy: {
      maxClientClockSkewMs: MAX_CLOCK_SKEW_MS,
      delayedAndReorderedSnapshotsRequireFullResync: true,
      duplicateSnapshotsAreIdempotent: true,
    },
    snapshots: runSnapshotFaultGate(),
    clock: runClockSkewGate(),
  };
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/fps-network.json", `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ ...receipt, receiptDigest: `sha256:${canonicalJsonHash(receipt)}` })}\n`,
  );
};

await main();
