import { canonicalJsonHash } from "@hk-mahjong/core";
import { FpsMatch, verifyFpsReplay } from "@hk-mahjong/fps";
import { fpsSnapshotSchema } from "@hk-mahjong/protocol";

const PLAYER_COUNT = 8;
const SIMULATION_TICKS = 60 * 60 * 10;
const playerId = (index: number): string => `fps-load-player-${String(index + 1)}`;

const match = new FpsMatch({
  matchId: "fps-load-match",
  roomId: "fps-load-room",
  seed: "fps-load-seed-v1",
  skipCountdown: true,
  rules: { durationTicks: SIMULATION_TICKS + 600 },
});
for (let index = 0; index < PLAYER_COUNT; index += 1) {
  match.addPlayer({ playerId: playerId(index), displayName: `P${String(index + 1)}` });
}
for (let index = 0; index < PLAYER_COUNT; index += 1) match.readyPlayer(playerId(index));
match.startMatch();

let acceptedInputs = 0;
let snapshots = 0;
let snapshotBytes = 0;
let maxTickMs = 0;
const startedAt = performance.now();
for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) {
  const acknowledgedServerTick = match.getState().serverTick;
  for (let index = 0; index < PLAYER_COUNT; index += 1) {
    const phase = (tick + index * 11) % 180;
    const moveX = phase < 45 ? 1 : phase < 90 ? -1 : 0;
    const moveY = phase >= 90 && phase < 150 ? 1 : 0;
    const fire = tick >= 121 && tick % 5 === index % 5;
    const result = match.submitInput({
      protocolVersion: 1,
      matchId: match.matchId,
      playerId: playerId(index),
      inputSequence: tick,
      clientTimestampMs: tick * 16,
      acknowledgedServerTick,
      moveX,
      moveY,
      lookDeltaX: index % 2 === 0 ? 0.001 : -0.001,
      lookDeltaY: 0,
      buttons: {
        forward: moveY > 0,
        backward: false,
        left: moveX < 0,
        right: moveX > 0,
        sprint: phase < 45,
        crouch: phase >= 150,
        jump: phase === 90,
        fire,
        reload: tick % 240 === 0,
      },
      selectedWeaponId: index % 2 === 0 ? "rifle" : "pistol",
      actionNonce: fire ? `fps-load-fire-${String(index)}-${String(tick)}` : null,
    });
    if (!result.accepted) throw new Error(`fps_load_input_rejected:${result.reason}`);
    acceptedInputs += 1;
  }
  const tickStartedAt = performance.now();
  match.advanceTicks(1);
  maxTickMs = Math.max(maxTickMs, performance.now() - tickStartedAt);
  if (tick % 3 === 0) {
    for (let index = 0; index < PLAYER_COUNT; index += 1) {
      const snapshot = match.getSnapshot(playerId(index), false, Math.max(0, tick - 3));
      fpsSnapshotSchema.parse(snapshot);
      snapshotBytes += Buffer.byteLength(JSON.stringify(snapshot));
      snapshots += 1;
    }
  }
}

const replay = match.getReplay();
if (!verifyFpsReplay(replay)) throw new Error("fps_load_replay_verification_failed");
const receipt = {
  schemaVersion: 1,
  players: PLAYER_COUNT,
  ticks: SIMULATION_TICKS,
  acceptedInputs,
  snapshots,
  eventCount: replay.events.length,
  snapshotBytes,
  terminalPhase: match.getState().phase,
  terminalChainHash: replay.terminalChainHash,
};
process.stdout.write(
  `${JSON.stringify({
    ...receipt,
    receiptDigest: `sha256:${canonicalJsonHash(receipt)}`,
    performance: {
      maxTickMs: Number(maxTickMs.toFixed(3)),
      elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    },
  })}\n`,
);
