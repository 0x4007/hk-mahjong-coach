import { describe, expect, it } from "vitest";
import { FpsMatch, FpsSnapshotTracker } from "../../packages/fps/src/index.js";

const createMatch = (): FpsMatch => {
  const match = new FpsMatch({
    matchId: "network-match",
    roomId: "network-room",
    seed: "network-seed",
    skipCountdown: true,
  });
  match.addPlayer({ playerId: "p1", displayName: "Alice" });
  match.addPlayer({ playerId: "p2", displayName: "Bob" });
  match.readyPlayer("p1");
  match.readyPlayer("p2");
  match.startMatch();
  match.advanceTicks(121);
  return match;
};

describe("FPS packet loss and ordering policy", () => {
  it("requires a full baseline and rejects a different match identity", () => {
    const match = createMatch();
    const tracker = new FpsSnapshotTracker();
    const full = match.getSnapshot("p1", true, 0);
    const delta = match.getSnapshot("p1", false, 0, full.snapshotId);

    expect(tracker.apply(delta)).toMatchObject({
      accepted: false,
      snapshot: null,
      resyncRequired: true,
      reason: "base_mismatch",
    });
    expect(tracker.apply(full).accepted).toBe(true);
    expect(
      tracker.apply({
        ...full,
        snapshotId: `${full.snapshotId}:other-match`,
        matchId: "different-match",
      }),
    ).toMatchObject({
      accepted: false,
      resyncRequired: true,
      reason: "identity_mismatch",
    });
  });

  it("requests a full resync when a delayed delta arrives after a later delta", () => {
    const match = createMatch();
    const tracker = new FpsSnapshotTracker();
    const full = match.getSnapshot("p1", true, 0);
    match.advanceTicks(1);
    const firstDelta = match.getSnapshot("p1", false, 0, full.snapshotId);
    match.advanceTicks(1);
    const secondDelta = match.getSnapshot("p1", false, 0, firstDelta.snapshotId);

    expect(tracker.apply(full).accepted).toBe(true);
    expect(tracker.apply(secondDelta)).toMatchObject({
      accepted: false,
      resyncRequired: true,
      reason: "base_mismatch",
    });
    expect(tracker.apply(firstDelta).accepted).toBe(true);
    expect(tracker.apply(secondDelta).accepted).toBe(true);
    expect(tracker.apply(secondDelta)).toMatchObject({ accepted: true, resyncRequired: false });

    const resync = match.getSnapshot("p1", true, 0);
    expect(tracker.apply(resync)).toMatchObject({ accepted: true, resyncRequired: false });
    expect(tracker.getLatest()?.snapshotId).toBe(resync.snapshotId);
  });
});
