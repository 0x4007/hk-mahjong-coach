import { z } from "zod";
import {
  identifierSchema,
  nonNegativeIntegerSchema,
  playerIdSchema,
  protocolTimestampSchema,
  protocolVersionSchema,
  requestIdSchema,
} from "./common.js";

/** Stable WebSocket subprotocol selected during an FPS ticket-authenticated upgrade. */
export const FPS_WEBSOCKET_PROTOCOL = "fps.v1";

const fpsHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const fpsVectorSchema = z.object({ x: z.number(), y: z.number(), z: z.number() }).strict();
const fpsRotationSchema = z.object({ yaw: z.number(), pitch: z.number() }).strict();
const fpsWeaponIdSchema = z.enum(["pistol", "rifle"]);
// Zod v4 numbers reject NaN and infinities by default; keep the name explicit at this boundary.
const fpsFiniteNumberSchema = z.number();
const fpsNonNegativeNumberSchema = fpsFiniteNumberSchema.nonnegative();
const fpsPhaseSchema = z.enum([
  "waiting",
  "ready",
  "countdown",
  "active",
  "ended",
  "cancelled",
  "closed",
]);
const fpsLifecycleSchema = z.enum([
  "joining",
  "connected",
  "ready",
  "spawned",
  "alive",
  "dead",
  "respawning",
  "disconnected",
  "reconnecting",
  "spectator",
]);

export const fpsInputButtonsSchema = z
  .object({
    forward: z.boolean(),
    backward: z.boolean(),
    left: z.boolean(),
    right: z.boolean(),
    sprint: z.boolean(),
    crouch: z.boolean(),
    jump: z.boolean(),
    fire: z.boolean(),
    reload: z.boolean(),
  })
  .strict();

export const fpsInputCommandSchema = z
  .object({
    protocolVersion: z.literal(1),
    matchId: identifierSchema,
    playerId: playerIdSchema,
    inputSequence: nonNegativeIntegerSchema,
    clientTimestampMs: z.number(),
    acknowledgedServerTick: nonNegativeIntegerSchema,
    moveX: z.number().min(-1).max(1),
    moveY: z.number().min(-1).max(1),
    lookDeltaX: z.number().min(-0.35).max(0.35),
    lookDeltaY: z.number().min(-0.35).max(0.35),
    buttons: fpsInputButtonsSchema,
    selectedWeaponId: fpsWeaponIdSchema,
    actionNonce: identifierSchema.nullable(),
  })
  .strict();

const fpsAvatarActionSchema = z.enum(["none", "fire", "reload", "switch", "melee"]);
const fpsLocomotionSchema = z.enum(["idle", "walk", "sprint", "airborne", "crouch"]);

export const fpsAvatarSnapshotSchema = z
  .object({
    playerId: playerIdSchema,
    displayName: z.string().min(1).max(128),
    modelId: identifierSchema,
    teamId: identifierSchema.nullable(),
    position: fpsVectorSchema,
    rotation: fpsRotationSchema,
    velocity: fpsVectorSchema,
    locomotion: fpsLocomotionSchema,
    equippedWeaponId: fpsWeaponIdSchema,
    action: fpsAvatarActionSchema,
    health: z.number().int().min(0).max(100),
    shield: z.number().int().min(0).max(50),
    alive: z.boolean(),
    spawnProtectionEndsAtTick: nonNegativeIntegerSchema.nullable(),
    stateTick: nonNegativeIntegerSchema,
    lifecycle: fpsLifecycleSchema,
  })
  .strict();

export const fpsPrivatePlayerSnapshotSchema = z
  .object({
    playerId: playerIdSchema,
    lifecycle: fpsLifecycleSchema,
    action: fpsAvatarActionSchema,
    equippedWeaponId: fpsWeaponIdSchema,
    health: z.number().int().min(0).max(100),
    shield: z.number().int().min(0).max(50),
    ammoInMagazine: nonNegativeIntegerSchema,
    reserveAmmo: nonNegativeIntegerSchema,
    reloadEndsAtTick: nonNegativeIntegerSchema.nullable(),
    lastAcceptedInputSequence: z.number().int().min(-1),
    serverTick: nonNegativeIntegerSchema,
  })
  .strict();

export const fpsScoreboardEntrySchema = z
  .object({
    playerId: playerIdSchema,
    displayName: z.string().min(1).max(128),
    kills: nonNegativeIntegerSchema,
    assists: nonNegativeIntegerSchema,
    deaths: nonNegativeIntegerSchema,
    score: nonNegativeIntegerSchema,
    connected: z.boolean(),
  })
  .strict();

const fpsEventBaseSchema = z
  .object({ eventId: identifierSchema, serverTick: nonNegativeIntegerSchema })
  .strict();

export const fpsPublicEventSchema = z.discriminatedUnion("kind", [
  fpsEventBaseSchema.extend({ kind: z.literal("match_phase_changed"), phase: fpsPhaseSchema }),
  fpsEventBaseSchema.extend({
    kind: z.literal("player_spawned"),
    playerId: playerIdSchema,
    spawnPointId: identifierSchema,
    protectionEndsAtTick: nonNegativeIntegerSchema,
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("player_respawned"),
    playerId: playerIdSchema,
    spawnPointId: identifierSchema,
    protectionEndsAtTick: nonNegativeIntegerSchema,
  }),
  fpsEventBaseSchema.extend({ kind: z.literal("player_disconnected"), playerId: playerIdSchema }),
  fpsEventBaseSchema.extend({ kind: z.literal("player_kicked"), playerId: playerIdSchema }),
  fpsEventBaseSchema.extend({ kind: z.literal("player_reconnected"), playerId: playerIdSchema }),
  fpsEventBaseSchema.extend({ kind: z.literal("player_spectating"), playerId: playerIdSchema }),
  fpsEventBaseSchema.extend({
    kind: z.literal("shot_fired"),
    shotId: identifierSchema,
    playerId: playerIdSchema,
    weaponId: fpsWeaponIdSchema,
    origin: fpsVectorSchema,
    direction: fpsVectorSchema,
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("shot_rejected"),
    playerId: playerIdSchema,
    reason: z.enum([
      "not_alive",
      "reloading",
      "cooldown",
      "empty_magazine",
      "spawn_protection",
      "duplicate_action",
    ]),
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("hit_confirmed"),
    shotId: identifierSchema,
    shooterId: playerIdSchema,
    targetId: playerIdSchema,
    hitbox: z.enum(["head", "body"]),
    damage: z.number().int().positive(),
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("damage_applied"),
    targetId: playerIdSchema,
    sourceId: playerIdSchema,
    shieldDamage: nonNegativeIntegerSchema,
    healthDamage: nonNegativeIntegerSchema,
    health: z.number().int().min(0).max(100),
    shield: z.number().int().min(0).max(50),
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("player_died"),
    playerId: playerIdSchema,
    killerId: playerIdSchema.nullable(),
    assisterIds: z.array(playerIdSchema),
    weaponId: fpsWeaponIdSchema.nullable(),
    respawnAtTick: nonNegativeIntegerSchema,
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("score_updated"),
    playerId: playerIdSchema,
    score: nonNegativeIntegerSchema,
    kills: nonNegativeIntegerSchema,
    assists: nonNegativeIntegerSchema,
    deaths: nonNegativeIntegerSchema,
  }),
  fpsEventBaseSchema.extend({
    kind: z.literal("match_ended"),
    reason: z.enum(["score_target", "time_limit", "cancelled"]),
    winnerIds: z.array(playerIdSchema),
  }),
]);

export const fpsSnapshotSchema = z
  .object({
    protocolVersion: z.literal(1),
    stateSchemaVersion: z.literal(1),
    snapshotId: identifierSchema,
    baseSnapshotId: identifierSchema.nullable(),
    matchId: identifierSchema,
    roomId: identifierSchema,
    serverTick: nonNegativeIntegerSchema,
    durationTicks: nonNegativeIntegerSchema,
    scoreTarget: nonNegativeIntegerSchema,
    acknowledgedInputSequence: z.number().int().min(-1),
    rulesHash: fpsHashSchema,
    mapHash: fpsHashSchema,
    weaponSetHash: fpsHashSchema,
    rngVersion: z.literal("xoshiro128ss-v1"),
    phase: fpsPhaseSchema,
    players: z.array(fpsAvatarSnapshotSchema),
    scoreboard: z.array(fpsScoreboardEntrySchema),
    events: z.array(fpsPublicEventSchema),
    privatePlayer: fpsPrivatePlayerSnapshotSchema,
    full: z.boolean(),
    resyncRequired: z.boolean(),
  })
  .strict();

export const fpsEventRecordSchema = z
  .object({
    event: fpsPublicEventSchema,
    eventHash: fpsHashSchema,
    previousChainHash: fpsHashSchema,
    chainHash: fpsHashSchema,
  })
  .strict();

export const fpsReplaySchema = z
  .object({
    matchId: identifierSchema,
    roomId: identifierSchema,
    rulesHash: fpsHashSchema,
    mapHash: fpsHashSchema,
    weaponSetHash: fpsHashSchema,
    rngVersion: z.literal("xoshiro128ss-v1"),
    roster: z
      .array(
        z.object({ playerId: playerIdSchema, displayName: z.string().min(1).max(128) }).strict(),
      )
      .min(1),
    terminalScoreboard: z.array(fpsScoreboardEntrySchema),
    events: z.array(fpsEventRecordSchema),
    terminalChainHash: fpsHashSchema,
  })
  .strict();

const fpsDiagnosticsMetricsSchema = z
  .object({
    connectedPlayers: nonNegativeIntegerSchema,
    rooms: nonNegativeIntegerSchema,
    activeMatches: nonNegativeIntegerSchema,
    phaseDurationMs: fpsNonNegativeNumberSchema,
    reconnectCount: nonNegativeIntegerSchema,
    inputAccepted: nonNegativeIntegerSchema,
    inputRejected: nonNegativeIntegerSchema,
    rateLimited: nonNegativeIntegerSchema,
    malformedFrames: nonNegativeIntegerSchema,
    oversizedFrames: nonNegativeIntegerSchema,
    droppedFrames: nonNegativeIntegerSchema,
    websocketUpgrades: nonNegativeIntegerSchema,
    websocketUpgradeFailures: nonNegativeIntegerSchema,
    snapshotsSent: nonNegativeIntegerSchema,
    snapshotBytes: nonNegativeIntegerSchema,
    persistenceWrites: nonNegativeIntegerSchema,
    persistenceLatencyMs: fpsNonNegativeNumberSchema,
    maxPersistenceLatencyMs: fpsNonNegativeNumberSchema,
    persistenceFailures: nonNegativeIntegerSchema,
    commitFailures: nonNegativeIntegerSchema,
    replayFailures: nonNegativeIntegerSchema,
    serverRestarts: nonNegativeIntegerSchema,
    simulationTicks: nonNegativeIntegerSchema,
    averageTickMs: fpsNonNegativeNumberSchema,
    maxTickMs: fpsNonNegativeNumberSchema,
    simulationOverruns: nonNegativeIntegerSchema,
    inputTransitMs: fpsFiniteNumberSchema,
    inputTransitJitterMs: fpsNonNegativeNumberSchema,
    inputSequenceGaps: nonNegativeIntegerSchema,
    resyncRequests: nonNegativeIntegerSchema,
    snapshotFailures: nonNegativeIntegerSchema,
    fireRequests: nonNegativeIntegerSchema,
    acceptedShots: nonNegativeIntegerSchema,
    rejectedShots: nonNegativeIntegerSchema,
    hitEvents: nonNegativeIntegerSchema,
    deaths: nonNegativeIntegerSchema,
    respawns: nonNegativeIntegerSchema,
    terminalMatches: nonNegativeIntegerSchema,
    terminalScoreEvents: nonNegativeIntegerSchema,
    kickedPlayers: nonNegativeIntegerSchema,
  })
  .strict();

/** Redacted operational diagnostics. Tickets, seeds, input receipts, and private state are absent. */
export const fpsDiagnosticsSchema = z
  .object({
    matchId: identifierSchema,
    roomId: identifierSchema,
    phase: fpsPhaseSchema,
    phaseDurationMs: fpsNonNegativeNumberSchema,
    serverTick: nonNegativeIntegerSchema,
    rulesHash: fpsHashSchema,
    mapHash: fpsHashSchema,
    weaponSetHash: fpsHashSchema,
    replayHash: fpsHashSchema,
    roster: z
      .array(
        z
          .object({
            playerId: playerIdSchema,
            displayName: z.string().min(1).max(128),
            connected: z.boolean(),
            score: nonNegativeIntegerSchema,
          })
          .strict(),
      )
      .max(8),
    metrics: fpsDiagnosticsMetricsSchema,
  })
  .strict();

export const fpsRoomCreateRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(128),
    seed: identifierSchema,
    scoreTarget: z.number().int().min(1).max(100).optional(),
    durationSeconds: z.number().int().min(30).max(3600).optional(),
    botCount: z.number().int().min(0).max(7).optional(),
  })
  .strict();

export const fpsRoomCreateResponseSchema = z
  .object({
    roomId: identifierSchema,
    matchId: identifierSchema,
    playerId: playerIdSchema,
    ticket: z.string().min(32).max(128),
    phase: fpsPhaseSchema,
    snapshot: fpsSnapshotSchema,
  })
  .strict();

export const fpsRoomJoinRequestSchema = z
  .object({ displayName: z.string().trim().min(1).max(128) })
  .strict();

export const fpsRoomJoinResponseSchema = z
  .object({
    roomId: identifierSchema,
    matchId: identifierSchema,
    playerId: playerIdSchema,
    ticket: z.string().min(32).max(128),
    phase: fpsPhaseSchema,
    snapshot: fpsSnapshotSchema,
  })
  .strict();

export const fpsReadyRequestSchema = z
  .object({ playerId: playerIdSchema, requestId: requestIdSchema })
  .strict();
export const fpsStartRequestSchema = z
  .object({ playerId: playerIdSchema, requestId: requestIdSchema })
  .strict();
export const fpsKickRequestSchema = z
  .object({ playerId: playerIdSchema, targetPlayerId: playerIdSchema })
  .strict();
export const fpsResyncRequestSchema = z
  .object({
    lastServerTick: nonNegativeIntegerSchema,
    lastSnapshotId: identifierSchema.nullable(),
  })
  .strict();
export const fpsInputAckSchema = z
  .object({
    inputSequence: nonNegativeIntegerSchema,
    acknowledgedServerTick: nonNegativeIntegerSchema,
    serverTick: nonNegativeIntegerSchema,
  })
  .strict();

export const fpsErrorSchema = z
  .object({
    code: z.enum([
      "invalid_request",
      "unknown_match",
      "unknown_player",
      "invalid_ticket",
      "cross_player_message",
      "match_not_ready",
      "match_not_active",
      "duplicate_input",
      "stale_input",
      "player_disconnected",
      "rate_limited",
      "reconnect_reservation_expired",
      "ticket_expired",
      "origin_not_allowed",
      "frame_too_large",
      "room_closed",
    ]),
    message: z.string().min(1).max(1000),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

export const fpsSocketClientEnvelopeSchema = z.discriminatedUnion("type", [
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_input"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      requestId: requestIdSchema.optional(),
      payload: fpsInputCommandSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_start"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      requestId: requestIdSchema,
      payload: fpsStartRequestSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_ready"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      requestId: requestIdSchema,
      payload: fpsReadyRequestSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_ping"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: z.object({ nonce: identifierSchema }).strict(),
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_resync_request"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: fpsResyncRequestSchema,
    })
    .strict(),
]);

export const fpsSocketHostEnvelopeSchema = z.discriminatedUnion("type", [
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_hello"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: z
        .object({ playerId: playerIdSchema, serverTick: nonNegativeIntegerSchema })
        .strict(),
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_snapshot"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: fpsSnapshotSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_input_ack"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: fpsInputAckSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_resync_required"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: z.object({ reason: z.string().min(1).max(128) }).strict(),
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_error"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: fpsErrorSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: protocolVersionSchema,
      type: z.literal("fps_pong"),
      seq: nonNegativeIntegerSchema,
      timestamp: protocolTimestampSchema,
      matchId: identifierSchema,
      payload: z.object({ nonce: identifierSchema }).strict(),
    })
    .strict(),
]);

export type FpsInputCommandDto = z.infer<typeof fpsInputCommandSchema>;
export type FpsSnapshotDto = z.infer<typeof fpsSnapshotSchema>;
export type FpsPublicEventDto = z.infer<typeof fpsPublicEventSchema>;
export type FpsDiagnosticsDto = z.infer<typeof fpsDiagnosticsSchema>;
export type FpsRoomCreateRequest = z.infer<typeof fpsRoomCreateRequestSchema>;
export type FpsRoomJoinRequest = z.infer<typeof fpsRoomJoinRequestSchema>;
export type FpsReadyRequest = z.infer<typeof fpsReadyRequestSchema>;
export type FpsStartRequest = z.infer<typeof fpsStartRequestSchema>;
export type FpsResyncRequest = z.infer<typeof fpsResyncRequestSchema>;
export type FpsSocketClientEnvelope = z.infer<typeof fpsSocketClientEnvelopeSchema>;
