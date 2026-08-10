export const FPS_PROTOCOL_VERSION = 1 as const;
export const FPS_STATE_SCHEMA_VERSION = 1 as const;
export const FPS_RULES_VERSION = "slayer-ffa-v1" as const;
export const FPS_MAP_ID = "slayer-arena-v1" as const;
export const FPS_RNG_VERSION = "xoshiro128ss-v1" as const;

export interface FpsVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FpsRotation {
  readonly yaw: number;
  readonly pitch: number;
}

export type FpsMatchPhase =
  "waiting" | "ready" | "countdown" | "active" | "ended" | "cancelled" | "closed";

export type FpsPlayerLifecycle =
  | "joining"
  | "connected"
  | "ready"
  | "spawned"
  | "alive"
  | "dead"
  | "respawning"
  | "disconnected"
  | "reconnecting"
  | "spectator";

export type FpsPlayerController = "human" | "bot";

export type FpsLocomotion = "idle" | "walk" | "sprint" | "airborne" | "crouch";
export type FpsAvatarAction = "none" | "fire" | "reload" | "switch" | "melee";
export type FpsWeaponId = "pistol" | "rifle";
export type FpsHitboxId = "head" | "body";

export interface FpsInputButtons {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly jump: boolean;
  readonly fire: boolean;
  readonly reload: boolean;
}

export const EMPTY_FPS_INPUT_BUTTONS: FpsInputButtons = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  crouch: false,
  jump: false,
  fire: false,
  reload: false,
};

export interface FpsInputCommand {
  readonly protocolVersion: typeof FPS_PROTOCOL_VERSION;
  readonly matchId: string;
  readonly playerId: string;
  readonly inputSequence: number;
  readonly clientTimestampMs: number;
  readonly acknowledgedServerTick: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly lookDeltaX: number;
  readonly lookDeltaY: number;
  readonly buttons: FpsInputButtons;
  readonly selectedWeaponId: FpsWeaponId;
  readonly actionNonce: string | null;
}

export interface FpsWeaponDefinition {
  readonly id: FpsWeaponId;
  readonly displayName: string;
  readonly damage: number;
  readonly headMultiplier: number;
  readonly cadenceTicks: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly reloadTicks: number;
  readonly range: number;
  readonly spreadRadians: number;
}

export interface FpsArenaObstacle {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly height: number;
}

export interface FpsSpawnPoint {
  readonly id: string;
  readonly position: FpsVector3;
  readonly yaw: number;
}

export interface FpsArenaDefinition {
  readonly mapId: typeof FPS_MAP_ID;
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly floorY: number;
  readonly obstacles: readonly FpsArenaObstacle[];
  readonly spawnPoints: readonly FpsSpawnPoint[];
  readonly collisionRadius: number;
  readonly capsuleHeight: number;
}

export interface FpsRules {
  readonly rulesVersion: typeof FPS_RULES_VERSION;
  readonly rngVersion: typeof FPS_RNG_VERSION;
  readonly modeId: "slayer_ffa";
  readonly playerCap: number;
  readonly scoreTarget: number;
  readonly durationTicks: number;
  readonly tickRate: 60;
  readonly snapshotRate: number;
  readonly respawnDelayTicks: number;
  readonly spawnProtectionTicks: number;
  readonly minimumSpawnEnemyDistance: number;
  readonly reconnectReservationTicks: number;
  readonly inputHistoryTicks: number;
  readonly o2Policy: "disabled";
  readonly scoring: FpsScoringRules;
  readonly weapons: readonly FpsWeaponDefinition[];
  readonly rulesHash: string;
  readonly mapHash: string;
  readonly weaponSetHash: string;
}

export interface FpsScoringRules {
  readonly killPoints: number;
  readonly assistPoints: number;
  readonly deathPoints: number;
  readonly suicidePoints: number;
  readonly environmentalPoints: number;
  readonly disconnectForfeitPoints: number;
}

export interface FpsScoreboardEntry {
  readonly playerId: string;
  readonly displayName: string;
  readonly kills: number;
  readonly assists: number;
  readonly deaths: number;
  readonly score: number;
  readonly connected: boolean;
}

export interface FpsPublicAvatarSnapshot {
  readonly playerId: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly teamId: string | null;
  readonly position: FpsVector3;
  readonly rotation: FpsRotation;
  readonly velocity: FpsVector3;
  readonly locomotion: FpsLocomotion;
  readonly equippedWeaponId: FpsWeaponId;
  readonly action: FpsAvatarAction;
  readonly health: number;
  readonly shield: number;
  readonly alive: boolean;
  readonly spawnProtectionEndsAtTick: number | null;
  readonly stateTick: number;
  readonly lifecycle: FpsPlayerLifecycle;
}

export interface FpsPrivatePlayerSnapshot {
  readonly playerId: string;
  readonly lifecycle: FpsPlayerLifecycle;
  readonly action: FpsAvatarAction;
  readonly equippedWeaponId: FpsWeaponId;
  readonly health: number;
  readonly shield: number;
  readonly ammoInMagazine: number;
  readonly reserveAmmo: number;
  readonly reloadEndsAtTick: number | null;
  readonly lastAcceptedInputSequence: number;
  readonly serverTick: number;
}

export interface FpsPublicEventBase {
  readonly eventId: string;
  readonly serverTick: number;
}

export type FpsPublicEvent =
  | (FpsPublicEventBase & {
      readonly kind: "match_phase_changed";
      readonly phase: FpsMatchPhase;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_spawned";
      readonly playerId: string;
      readonly spawnPointId: string;
      readonly protectionEndsAtTick: number;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_respawned";
      readonly playerId: string;
      readonly spawnPointId: string;
      readonly protectionEndsAtTick: number;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_disconnected";
      readonly playerId: string;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_kicked";
      readonly playerId: string;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_reconnected";
      readonly playerId: string;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_spectating";
      readonly playerId: string;
    })
  | (FpsPublicEventBase & {
      readonly kind: "shot_fired";
      readonly shotId: string;
      readonly playerId: string;
      readonly weaponId: FpsWeaponId;
      readonly origin: FpsVector3;
      readonly direction: FpsVector3;
    })
  | (FpsPublicEventBase & {
      readonly kind: "shot_rejected";
      readonly playerId: string;
      readonly reason:
        | "not_alive"
        | "reloading"
        | "cooldown"
        | "empty_magazine"
        | "spawn_protection"
        | "duplicate_action";
    })
  | (FpsPublicEventBase & {
      readonly kind: "hit_confirmed";
      readonly shotId: string;
      readonly shooterId: string;
      readonly targetId: string;
      readonly hitbox: FpsHitboxId;
      readonly damage: number;
    })
  | (FpsPublicEventBase & {
      readonly kind: "damage_applied";
      readonly targetId: string;
      readonly sourceId: string;
      readonly shieldDamage: number;
      readonly healthDamage: number;
      readonly health: number;
      readonly shield: number;
    })
  | (FpsPublicEventBase & {
      readonly kind: "player_died";
      readonly playerId: string;
      readonly killerId: string | null;
      readonly assisterIds: readonly string[];
      readonly weaponId: FpsWeaponId | null;
      readonly respawnAtTick: number;
    })
  | (FpsPublicEventBase & {
      readonly kind: "score_updated";
      readonly playerId: string;
      readonly score: number;
      readonly kills: number;
      readonly assists: number;
      readonly deaths: number;
    })
  | (FpsPublicEventBase & {
      readonly kind: "match_ended";
      readonly reason: "score_target" | "time_limit" | "cancelled";
      readonly winnerIds: readonly string[];
    });

export interface FpsEventRecord {
  readonly event: FpsPublicEvent;
  readonly eventHash: string;
  readonly previousChainHash: string;
  readonly chainHash: string;
}

export interface FpsSnapshot {
  readonly protocolVersion: typeof FPS_PROTOCOL_VERSION;
  readonly stateSchemaVersion: typeof FPS_STATE_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly baseSnapshotId: string | null;
  readonly matchId: string;
  readonly roomId: string;
  readonly serverTick: number;
  readonly durationTicks: number;
  readonly scoreTarget: number;
  readonly acknowledgedInputSequence: number;
  readonly rulesHash: string;
  readonly mapHash: string;
  readonly weaponSetHash: string;
  readonly rngVersion: typeof FPS_RNG_VERSION;
  readonly phase: FpsMatchPhase;
  readonly players: readonly FpsPublicAvatarSnapshot[];
  readonly scoreboard: readonly FpsScoreboardEntry[];
  readonly events: readonly FpsPublicEvent[];
  readonly privatePlayer: FpsPrivatePlayerSnapshot;
  readonly full: boolean;
  readonly resyncRequired: boolean;
}

export interface FpsReplay {
  readonly matchId: string;
  readonly roomId: string;
  readonly rulesHash: string;
  readonly mapHash: string;
  readonly weaponSetHash: string;
  readonly rngVersion: typeof FPS_RNG_VERSION;
  readonly roster: readonly FpsReplayRosterEntry[];
  readonly seed: string;
  readonly terminalScoreboard: readonly FpsScoreboardEntry[];
  readonly events: readonly FpsEventRecord[];
  readonly terminalChainHash: string;
}

export interface FpsReplayRosterEntry {
  readonly playerId: string;
  readonly displayName: string;
}

export interface FpsPlayerCheckpoint {
  readonly playerId: string;
  readonly controller?: FpsPlayerController;
  readonly displayName: string;
  readonly modelId: string;
  readonly lifecycle: FpsPlayerLifecycle;
  readonly position: FpsVector3;
  readonly velocity: FpsVector3;
  readonly yaw: number;
  readonly pitch: number;
  readonly locomotion: FpsLocomotion;
  readonly action: FpsAvatarAction;
  readonly health: number;
  readonly shield: number;
  readonly alive: boolean;
  readonly spawnProtectionEndsAtTick: number | null;
  readonly spawnPointId: string | null;
  readonly respawnAtTick: number | null;
  readonly connectedAtTick: number;
  readonly disconnectedAtTick: number | null;
  readonly score: number;
  readonly kills: number;
  readonly assists: number;
  readonly deaths: number;
  readonly ready: boolean;
  readonly equippedWeaponId: FpsWeaponId;
  readonly ammoInMagazine: number;
  readonly reserveAmmo: number;
  readonly reloadEndsAtTick: number | null;
  readonly lastAcceptedInputSequence: number;
  readonly input: FpsInputCommand | null;
  readonly previousButtons: FpsInputButtons;
  readonly lastAppliedLookInputSequence: number;
  readonly lastFireTick: number;
  readonly seenActionNonces: readonly string[];
  readonly contributions: readonly {
    readonly playerId: string;
    readonly amount: number;
    readonly lastTick: number;
    readonly weaponId: FpsWeaponId;
  }[];
}

export interface FpsMatchCheckpoint {
  readonly matchId: string;
  readonly roomId: string;
  readonly seed: string;
  readonly arena: FpsArenaDefinition;
  readonly rules: FpsRules;
  readonly phase: FpsMatchPhase;
  readonly serverTick: number;
  readonly terminalReason: FpsMatchState["terminalReason"];
  readonly eventCounter: number;
  readonly snapshotCounter: number;
  readonly lastFullSnapshotId: string | null;
  readonly spawnOrdinal: number;
  readonly chainHash: string;
  /** Canonical digest of every checkpoint field except this digest. */
  readonly checkpointHash: string;
  readonly players: readonly FpsPlayerCheckpoint[];
  readonly eventRecords: readonly FpsEventRecord[];
  readonly inputReceipts: readonly FpsInputReceipt[];
}

export interface FpsInputReceipt {
  readonly playerId: string;
  readonly inputSequence: number;
  readonly serverTick: number;
  readonly acknowledgedServerTick: number;
  readonly accepted: boolean;
  readonly reason: FpsInputResult["reason"];
  /** The authoritative controller that submitted the command; null means the player was unknown. */
  readonly controller: FpsPlayerController | null;
  /** Fixed-step tick at which the accepted command last produced an authoritative movement result. */
  readonly appliedServerTick: number | null;
  readonly appliedPosition: FpsVector3 | null;
  readonly appliedVelocity: FpsVector3 | null;
}

export interface FpsMatchState {
  readonly schemaVersion: typeof FPS_STATE_SCHEMA_VERSION;
  readonly matchId: string;
  readonly roomId: string;
  readonly phase: FpsMatchPhase;
  readonly serverTick: number;
  readonly rules: FpsRules;
  readonly roster: readonly FpsPublicAvatarSnapshot[];
  readonly scoreboard: readonly FpsScoreboardEntry[];
  readonly terminalReason: "score_target" | "time_limit" | "cancelled" | null;
}

export interface FpsMatchOptions {
  readonly matchId: string;
  readonly roomId: string;
  readonly seed: string;
  readonly rules?: Partial<Pick<FpsRules, "scoreTarget" | "durationTicks" | "snapshotRate">>;
  readonly arena?: FpsArenaDefinition;
  readonly skipCountdown?: boolean;
}

export interface FpsJoinPlayer {
  readonly playerId: string;
  readonly displayName: string;
  readonly modelId?: string;
  readonly controller?: FpsPlayerController;
}

export interface FpsInputResult {
  readonly accepted: boolean;
  readonly reason:
    | "accepted"
    | "duplicate_input"
    | "stale_input"
    | "invalid_input"
    | "cross_player_message"
    | "unknown_player"
    | "wrong_match"
    | "player_disconnected"
    | "match_not_active";
  readonly serverTick: number;
}
