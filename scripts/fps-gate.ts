import { canonicalJsonHash } from "@hk-mahjong/core";
import { FpsMatch, verifyFpsReplay } from "@hk-mahjong/fps";
import { fpsSnapshotSchema } from "@hk-mahjong/protocol";

const PLAYER_COUNT = 8;
const SIMULATION_TICKS = 60 * 10;

const match = new FpsMatch({
  matchId: "fps-gate-match",
  roomId: "fps-gate-room",
  seed: "fps-gate-seed-v1",
  skipCountdown: true,
  rules: { durationTicks: SIMULATION_TICKS + 600 },
});

for (let index = 0; index < PLAYER_COUNT; index += 1) {
  match.addPlayer({
    playerId: `fps-gate-player-${String(index + 1)}`,
    displayName: `P${String(index + 1)}`,
  });
}
for (let index = 0; index < PLAYER_COUNT; index += 1) {
  match.readyPlayer(`fps-gate-player-${String(index + 1)}`);
}
match.startMatch();

let acceptedInputs = 0;
let rejectedInputs = 0;
let snapshots = 0;
let maxTickMs = 0;
const startedAt = performance.now();
for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) {
  for (let playerIndex = 0; playerIndex < PLAYER_COUNT; playerIndex += 1) {
    const playerId = `fps-gate-player-${String(playerIndex + 1)}`;
    const phase = (tick + playerIndex * 7) % 120;
    const moveX = phase < 30 ? 1 : phase < 60 ? -1 : 0;
    const moveY = phase >= 60 && phase < 100 ? 1 : 0;
    const fire = tick >= 121 && tick % 5 === playerIndex % 5;
    const result = match.submitInput({
      protocolVersion: 1,
      matchId: match.matchId,
      playerId,
      inputSequence: tick,
      clientTimestampMs: tick * 16,
      acknowledgedServerTick: match.getState().serverTick,
      moveX,
      moveY,
      lookDeltaX: playerIndex % 2 === 0 ? 0.002 : -0.002,
      lookDeltaY: 0,
      buttons: {
        forward: moveY > 0,
        backward: false,
        left: moveX < 0,
        right: moveX > 0,
        sprint: phase < 30,
        crouch: phase >= 100,
        jump: phase === 60,
        fire,
        reload: tick % 240 === 0,
      },
      selectedWeaponId: playerIndex % 2 === 0 ? "rifle" : "pistol",
      actionNonce: fire ? `fps-gate-fire-${String(playerIndex)}-${String(tick)}` : null,
    });
    if (result.accepted) acceptedInputs += 1;
    else rejectedInputs += 1;
  }
  const tickStartedAt = performance.now();
  match.advanceTicks(1);
  maxTickMs = Math.max(maxTickMs, performance.now() - tickStartedAt);
  if (tick % 3 === 0) {
    const snapshot = match.getSnapshot("fps-gate-player-1", false, Math.max(0, tick - 3));
    fpsSnapshotSchema.parse(snapshot);
    snapshots += 1;
  }
}

const replay = match.getReplay();
if (!verifyFpsReplay(replay)) throw new Error("fps_gate_replay_verification_failed");
const receipt = {
  schemaVersion: 1,
  players: PLAYER_COUNT,
  ticks: SIMULATION_TICKS,
  acceptedInputs,
  rejectedInputs,
  snapshots,
  eventCount: replay.events.length,
  terminalPhase: match.getState().phase,
  terminalChainHash: replay.terminalChainHash,
};
const digest = canonicalJsonHash(receipt);
process.stdout.write(
  `${JSON.stringify({
    ...receipt,
    receiptDigest: `sha256:${digest}`,
    performance: {
      maxTickMs: Number(maxTickMs.toFixed(3)),
      elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    },
  })}\n`,
);
