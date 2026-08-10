import { describe, expect, it } from "vitest";
import {
  fpsDiagnosticsSchema,
  fpsInputCommandSchema,
  fpsRoomCreateRequestSchema,
  fpsSnapshotSchema,
} from "./fps.js";

const validInput = {
  protocolVersion: 1,
  matchId: "match-1",
  playerId: "player-1",
  inputSequence: 0,
  clientTimestampMs: 1,
  acknowledgedServerTick: 0,
  moveX: 0,
  moveY: 1,
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
  selectedWeaponId: "pistol",
  actionNonce: null,
} as const;

describe("FPS protocol boundary", () => {
  it("validates redacted diagnostics and rejects private fields", () => {
    const hash = `sha256:${"0".repeat(64)}`;
    const diagnostics = {
      matchId: "match-1",
      roomId: "room-1",
      phase: "active",
      phaseDurationMs: 12.5,
      serverTick: 20,
      rulesHash: hash,
      mapHash: hash,
      weaponSetHash: hash,
      replayHash: hash,
      roster: [{ playerId: "player-1", displayName: "One", connected: true, score: 0 }],
      metrics: {
        connectedPlayers: 1,
        rooms: 1,
        activeMatches: 1,
        phaseDurationMs: 12.5,
        reconnectCount: 0,
        inputAccepted: 0,
        inputRejected: 0,
        rateLimited: 0,
        malformedFrames: 0,
        oversizedFrames: 0,
        droppedFrames: 0,
        websocketUpgrades: 1,
        websocketUpgradeFailures: 0,
        snapshotsSent: 1,
        snapshotBytes: 100,
        persistenceWrites: 1,
        persistenceLatencyMs: 0.5,
        maxPersistenceLatencyMs: 0.5,
        persistenceFailures: 0,
        commitFailures: 0,
        replayFailures: 0,
        serverRestarts: 0,
        simulationTicks: 20,
        averageTickMs: 0.2,
        maxTickMs: 0.4,
        simulationOverruns: 0,
        inputTransitMs: -2,
        inputTransitJitterMs: 1,
        inputSequenceGaps: 0,
        resyncRequests: 0,
        snapshotFailures: 0,
        fireRequests: 0,
        acceptedShots: 0,
        rejectedShots: 0,
        hitEvents: 0,
        deaths: 0,
        respawns: 0,
        terminalMatches: 0,
        terminalScoreEvents: 0,
        kickedPlayers: 0,
      },
    };
    expect(fpsDiagnosticsSchema.parse(diagnostics)).toEqual(diagnostics);
    expect(() => fpsDiagnosticsSchema.parse({ ...diagnostics, ticket: "secret" })).toThrow();
    expect(() =>
      fpsDiagnosticsSchema.parse({
        ...diagnostics,
        metrics: { ...diagnostics.metrics, inputTransitMs: Number.NaN },
      }),
    ).toThrow();
  });

  it("accepts a bounded server-owned bot count for solo rooms", () => {
    expect(
      fpsRoomCreateRequestSchema.parse({
        displayName: "One",
        seed: "solo-seed",
        botCount: 1,
      }),
    ).toMatchObject({ botCount: 1 });
    expect(() =>
      fpsRoomCreateRequestSchema.parse({
        displayName: "One",
        seed: "solo-seed",
        botCount: 8,
      }),
    ).toThrow();
  });

  it("accepts the compact input command and rejects client-owned state", () => {
    expect(fpsInputCommandSchema.parse(validInput)).toEqual(validInput);
    expect(() =>
      fpsInputCommandSchema.parse({ ...validInput, position: { x: 0, y: 0, z: 0 } }),
    ).toThrow();
    expect(() => fpsInputCommandSchema.parse({ ...validInput, moveX: 2 })).toThrow();
  });

  it("rejects a snapshot that tries to disclose private opponent ammo", () => {
    const snapshot = {
      protocolVersion: 1,
      stateSchemaVersion: 1,
      snapshotId: "match-1:1:0",
      matchId: "match-1",
      roomId: "room-1",
      serverTick: 1,
      durationTicks: 36_000,
      scoreTarget: 25,
      acknowledgedInputSequence: 0,
      rulesHash: `sha256:${"0".repeat(64)}`,
      mapHash: `sha256:${"1".repeat(64)}`,
      phase: "active",
      players: [
        {
          playerId: "player-1",
          displayName: "One",
          modelId: "fallback-mannequin-v1",
          teamId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { yaw: 0, pitch: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          locomotion: "idle",
          equippedWeaponId: "pistol",
          action: "none",
          health: 100,
          shield: 50,
          alive: true,
          spawnProtectionEndsAtTick: null,
          stateTick: 1,
          lifecycle: "alive",
          ammoInMagazine: 12,
        },
      ],
      scoreboard: [],
      events: [],
      privatePlayer: {
        playerId: "player-1",
        health: 100,
        shield: 50,
        ammoInMagazine: 12,
        reserveAmmo: 72,
        reloadEndsAtTick: null,
        lastAcceptedInputSequence: 0,
      },
      full: true,
      resyncRequired: false,
    };
    expect(() => fpsSnapshotSchema.parse(snapshot)).toThrow();
  });
});
