import { canonicalJsonHash } from "@hk-mahjong/core";
import {
  DEFAULT_FPS_ARENA,
  fpsMapHash,
  integrateFpsMovement,
  isFpsLineOfSightClear,
  isSpawnPositionValid,
  validateFpsArena,
} from "./arena.js";
import {
  EMPTY_FPS_INPUT_BUTTONS,
  FPS_PROTOCOL_VERSION,
  FPS_RNG_VERSION,
  FPS_RULES_VERSION,
  FPS_STATE_SCHEMA_VERSION,
  type FpsArenaDefinition,
  type FpsAvatarAction,
  type FpsEventRecord,
  type FpsInputCommand,
  type FpsInputReceipt,
  type FpsInputResult,
  type FpsJoinPlayer,
  type FpsLocomotion,
  type FpsMatchOptions,
  type FpsMatchCheckpoint,
  type FpsMatchPhase,
  type FpsMatchState,
  type FpsPlayerController,
  type FpsPlayerLifecycle,
  type FpsPrivatePlayerSnapshot,
  type FpsPublicAvatarSnapshot,
  type FpsPublicEvent,
  type FpsReplayRosterEntry,
  type FpsReplay,
  type FpsRules,
  type FpsScoreboardEntry,
  type FpsSnapshot,
  type FpsVector3,
  type FpsWeaponDefinition,
  type FpsWeaponId,
} from "./types.js";
import { FpsRng } from "./rng.js";

const COUNTDOWN_TICKS = 120;
const MAX_LOOK_DELTA = 0.35;
const MAX_FRAME_CLIENT_AGE_TICKS = 120;
const MAX_FUTURE_ACK_TICKS = 2;
const ASSIST_WINDOW_TICKS = 60 * 8;
const FULL_HEALTH = 100;
const FULL_SHIELD = 50;
const INITIAL_YAW = 0;
const INITIAL_LAST_FIRE_TICK = -Number.MAX_SAFE_INTEGER;
const ZERO_CHAIN_HASH = `sha256:${"0".repeat(64)}`;
const FPS_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

type FpsCheckpointPayload = Omit<FpsMatchCheckpoint, "checkpointHash">;

const hashFpsCheckpoint = (checkpoint: FpsCheckpointPayload): string =>
  `sha256:${canonicalJsonHash(checkpoint)}`;

const WEAPONS: readonly FpsWeaponDefinition[] = [
  {
    id: "pistol",
    displayName: "Pulse Pistol",
    damage: 34,
    headMultiplier: 1.75,
    cadenceTicks: 12,
    magazineSize: 12,
    reserveAmmo: 72,
    reloadTicks: 72,
    range: 80,
    spreadRadians: 0,
  },
  {
    id: "rifle",
    displayName: "Arc Rifle",
    damage: 14,
    headMultiplier: 1.35,
    cadenceTicks: 5,
    magazineSize: 30,
    reserveAmmo: 120,
    reloadTicks: 105,
    range: 100,
    spreadRadians: 0,
  },
];

const validateRuleOverrides = (overrides: NonNullable<FpsMatchOptions["rules"]>): void => {
  if (
    overrides.scoreTarget !== undefined &&
    (!Number.isSafeInteger(overrides.scoreTarget) ||
      overrides.scoreTarget < 1 ||
      overrides.scoreTarget > 100)
  ) {
    throw new Error("fps_rules_invalid_score_target");
  }
  if (
    overrides.durationTicks !== undefined &&
    (!Number.isSafeInteger(overrides.durationTicks) || overrides.durationTicks < 1)
  ) {
    throw new Error("fps_rules_invalid_duration");
  }
  if (
    overrides.snapshotRate !== undefined &&
    (!Number.isSafeInteger(overrides.snapshotRate) ||
      overrides.snapshotRate < 1 ||
      overrides.snapshotRate > 60 ||
      60 % overrides.snapshotRate !== 0)
  ) {
    throw new Error("fps_rules_invalid_snapshot_rate");
  }
};

const emptyVelocity = (): FpsVector3 => ({ x: 0, y: 0, z: 0 });

const copyButtons = (buttons: FpsInputCommand["buttons"]): FpsInputCommand["buttons"] => ({
  ...buttons,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const FPS_INPUT_FIELDS = [
  "protocolVersion",
  "matchId",
  "playerId",
  "inputSequence",
  "clientTimestampMs",
  "acknowledgedServerTick",
  "moveX",
  "moveY",
  "lookDeltaX",
  "lookDeltaY",
  "buttons",
  "selectedWeaponId",
  "actionNonce",
] as const;

const hasExactInputShape = (input: Record<string, unknown>): boolean => {
  const keys = Object.keys(input);
  return (
    keys.length === FPS_INPUT_FIELDS.length &&
    FPS_INPUT_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(input, field))
  );
};

const validButtons = (buttons: unknown): buttons is FpsInputCommand["buttons"] => {
  if (!isRecord(buttons)) return false;
  const candidate = buttons;
  const keys = Object.keys(
    EMPTY_FPS_INPUT_BUTTONS,
  ) as readonly (keyof FpsInputCommand["buttons"])[];
  return (
    Object.keys(candidate).length === keys.length &&
    keys.every((key) => typeof candidate[key] === "boolean")
  );
};

const validWeaponId = (value: unknown): value is FpsWeaponId =>
  typeof value === "string" && WEAPONS.some((weapon) => weapon.id === value);

const weaponById = (rules: FpsRules, id: FpsWeaponId): FpsWeaponDefinition => {
  const weapon = rules.weapons.find((candidate) => candidate.id === id);
  if (weapon === undefined) {
    throw new Error(`Unknown FPS weapon: ${id}`);
  }
  return weapon;
};

const finiteRange = (value: number, minimum: number, maximum: number): boolean =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

const makeRules = (
  arena: FpsArenaDefinition,
  overrides: FpsMatchOptions["rules"] = {},
): FpsRules => {
  validateRuleOverrides(overrides);
  const mapHash = fpsMapHash(arena);
  const weaponSetHash = `sha256:${canonicalJsonHash(WEAPONS)}`;
  const base = {
    rulesVersion: FPS_RULES_VERSION,
    rngVersion: FPS_RNG_VERSION,
    modeId: "slayer_ffa" as const,
    playerCap: 8,
    scoreTarget: overrides.scoreTarget ?? 25,
    durationTicks: overrides.durationTicks ?? 60 * 10 * 60,
    tickRate: 60 as const,
    snapshotRate: overrides.snapshotRate ?? 20,
    respawnDelayTicks: 120,
    spawnProtectionTicks: 120,
    minimumSpawnEnemyDistance: 6,
    reconnectReservationTicks: 60 * 30,
    inputHistoryTicks: 180,
    o2Policy: "disabled" as const,
    scoring: {
      killPoints: 1,
      assistPoints: 0,
      deathPoints: 0,
      suicidePoints: 0,
      environmentalPoints: 0,
      disconnectForfeitPoints: 0,
    },
    weapons: WEAPONS,
    mapHash,
    weaponSetHash,
  };
  return {
    ...base,
    rulesHash: `sha256:${canonicalJsonHash(base)}`,
  };
};

export const createFpsRules = (
  arena: FpsArenaDefinition = DEFAULT_FPS_ARENA,
  overrides: FpsMatchOptions["rules"] = {},
): FpsRules => makeRules(arena, overrides);

interface DamageContribution {
  readonly amount: number;
  readonly lastTick: number;
  readonly weaponId: FpsWeaponId;
}

interface MutablePlayer {
  readonly playerId: string;
  readonly controller: FpsPlayerController;
  readonly displayName: string;
  readonly modelId: string;
  lifecycle: FpsPlayerLifecycle;
  position: FpsVector3;
  velocity: FpsVector3;
  yaw: number;
  pitch: number;
  locomotion: FpsLocomotion;
  action: FpsAvatarAction;
  health: number;
  shield: number;
  alive: boolean;
  spawnProtectionEndsAtTick: number | null;
  spawnPointId: string | null;
  respawnAtTick: number | null;
  connectedAtTick: number;
  disconnectedAtTick: number | null;
  score: number;
  kills: number;
  assists: number;
  deaths: number;
  ready: boolean;
  equippedWeaponId: FpsWeaponId;
  ammoInMagazine: number;
  reserveAmmo: number;
  reloadEndsAtTick: number | null;
  lastAcceptedInputSequence: number;
  input: FpsInputCommand | null;
  previousButtons: FpsInputCommand["buttons"];
  lastAppliedLookInputSequence: number;
  lastFireTick: number;
  seenActionNonces: Set<string>;
  contributions: Map<string, DamageContribution>;
}

const publicScoreboard = (players: readonly MutablePlayer[]): readonly FpsScoreboardEntry[] =>
  [...players]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.kills - left.kills ||
        left.deaths - right.deaths ||
        left.playerId.localeCompare(right.playerId),
    )
    .map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      kills: player.kills,
      assists: player.assists,
      deaths: player.deaths,
      score: player.score,
      connected: player.lifecycle !== "disconnected" && player.lifecycle !== "spectator",
    }))
    .map((entry) => Object.freeze(entry));

const rotateDirection = (yaw: number, pitch: number): FpsVector3 => {
  const horizontal = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(-pitch),
    z: -Math.cos(yaw) * horizontal,
  };
};

const add = (left: FpsVector3, right: FpsVector3): FpsVector3 => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

const scale = (value: FpsVector3, amount: number): FpsVector3 => ({
  x: value.x * amount,
  y: value.y * amount,
  z: value.z * amount,
});

const distanceSquared = (left: FpsVector3, right: FpsVector3): number =>
  (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;

const rayBoxIntersection = (
  origin: FpsVector3,
  direction: FpsVector3,
  maxDistance: number,
  box: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  },
): boolean => {
  let minimum = 0;
  let maximum = maxDistance;
  for (const [start, delta, min, max] of [
    [origin.x, direction.x, box.minX, box.maxX],
    [origin.z, direction.z, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(delta) < 0.000001) {
      if (start < min || start > max) return false;
      continue;
    }
    const first = (min - start) / delta;
    const second = (max - start) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= maxDistance;
};

/**
 * Authoritative fixed-step Slayer simulation. The browser can request inputs only; this class
 * owns movement, collision, fire cadence, hit detection, damage, lifecycle, score, and replay.
 */
export class FpsMatch {
  public readonly matchId: string;
  public readonly roomId: string;
  public readonly seed: string;
  public readonly arena: FpsArenaDefinition;
  public readonly rules: FpsRules;

  private phase: FpsMatchPhase = "waiting";
  private serverTick = 0;
  private terminalReason: FpsMatchState["terminalReason"] = null;
  private readonly players = new Map<string, MutablePlayer>();
  private readonly eventRecords: FpsEventRecord[] = [];
  private eventCounter = 0;
  private snapshotCounter = 0;
  private lastFullSnapshotId: string | null = null;
  private spawnOrdinal = 0;
  private chainHash = `sha256:${"0".repeat(64)}`;
  private readonly inputReceipts: FpsInputReceipt[] = [];
  private readonly skipCountdown: boolean;

  public constructor(options: FpsMatchOptions) {
    this.matchId = options.matchId;
    this.roomId = options.roomId;
    this.seed = options.seed;
    this.arena = options.arena ?? DEFAULT_FPS_ARENA;
    validateFpsArena(this.arena);
    this.rules = makeRules(this.arena, options.rules);
    this.skipCountdown = options.skipCountdown ?? false;
  }

  public addPlayer(input: FpsJoinPlayer): FpsPublicAvatarSnapshot {
    if (this.phase !== "waiting" && this.phase !== "ready") {
      throw new Error("Players can only join before a Slayer match starts");
    }
    if (this.players.has(input.playerId)) {
      throw new Error("player_exists");
    }
    if (this.players.size >= this.rules.playerCap) {
      throw new Error("player_cap_reached");
    }
    const player: MutablePlayer = {
      playerId: input.playerId,
      controller: input.controller ?? "human",
      displayName: input.displayName,
      modelId: input.modelId ?? "fallback-mannequin-v1",
      lifecycle: "connected",
      position: { x: 0, y: this.arena.floorY, z: 0 },
      velocity: emptyVelocity(),
      yaw: INITIAL_YAW,
      pitch: 0,
      locomotion: "idle",
      action: "none",
      health: FULL_HEALTH,
      shield: FULL_SHIELD,
      alive: false,
      spawnProtectionEndsAtTick: null,
      spawnPointId: null,
      respawnAtTick: null,
      connectedAtTick: this.serverTick,
      disconnectedAtTick: null,
      score: 0,
      kills: 0,
      assists: 0,
      deaths: 0,
      ready: false,
      equippedWeaponId: "pistol",
      ammoInMagazine: WEAPONS[0]?.magazineSize ?? 12,
      reserveAmmo: WEAPONS[0]?.reserveAmmo ?? 72,
      reloadEndsAtTick: null,
      lastAcceptedInputSequence: -1,
      input: null,
      previousButtons: EMPTY_FPS_INPUT_BUTTONS,
      lastAppliedLookInputSequence: -1,
      lastFireTick: INITIAL_LAST_FIRE_TICK,
      seenActionNonces: new Set<string>(),
      contributions: new Map<string, DamageContribution>(),
    };
    this.players.set(input.playerId, player);
    return this.avatar(player);
  }

  public readyPlayer(playerId: string): void {
    const player = this.requirePlayer(playerId);
    if (player.lifecycle !== "connected" && player.lifecycle !== "reconnecting") {
      throw new Error("player_not_readyable");
    }
    player.ready = true;
    player.lifecycle = "ready";
    if (
      this.players.size >= 2 &&
      [...this.players.values()].every((candidate) => candidate.ready)
    ) {
      this.phase = "ready";
      this.appendEvent({ kind: "match_phase_changed", phase: "ready" });
    }
  }

  public startMatch(): void {
    if (this.phase !== "ready") {
      throw new Error("match_not_ready");
    }
    if (this.players.size < 2) {
      throw new Error("at_least_two_players_required");
    }
    this.phase = "countdown";
    this.appendEvent({ kind: "match_phase_changed", phase: "countdown" });
    if (this.skipCountdown) {
      this.activateMatch();
    }
  }

  public cancelMatch(): void {
    if (this.phase === "ended" || this.phase === "cancelled" || this.phase === "closed") return;
    this.phase = "cancelled";
    this.terminalReason = "cancelled";
    this.appendEvent({ kind: "match_phase_changed", phase: "cancelled" });
    this.appendEvent({ kind: "match_ended", reason: "cancelled", winnerIds: [] });
  }

  public closeMatch(): void {
    if (this.phase === "active" || this.phase === "countdown") {
      throw new Error("room_close_requires_waiting_state");
    }
    if (this.phase === "closed") return;
    this.phase = "closed";
    this.terminalReason = "cancelled";
    this.appendEvent({ kind: "match_phase_changed", phase: "closed" });
    this.appendEvent({ kind: "match_ended", reason: "cancelled", winnerIds: [] });
  }

  public reconnectPlayer(playerId: string): FpsSnapshot {
    const player = this.requirePlayer(playerId);
    if (player.lifecycle === "spectator") {
      throw new Error("reconnect_reservation_expired");
    }
    const wasDisconnected = player.lifecycle === "disconnected";
    player.lifecycle = player.alive
      ? "alive"
      : player.respawnAtTick === null
        ? "connected"
        : "dead";
    player.disconnectedAtTick = null;
    if (wasDisconnected) this.appendEvent({ kind: "player_reconnected", playerId });
    return this.snapshot(playerId, true, 0);
  }

  public disconnectPlayer(playerId: string): void {
    const player = this.requirePlayer(playerId);
    if (player.lifecycle === "spectator" || player.lifecycle === "disconnected") return;
    player.lifecycle = "disconnected";
    player.disconnectedAtTick = this.serverTick;
    // A reconnect must begin with an explicit fresh command. Do not carry a held input
    // across the disconnect boundary where its old fire/look edge could be replayed.
    player.input = null;
    player.previousButtons = EMPTY_FPS_INPUT_BUTTONS;
    player.action = "none";
    this.appendEvent({ kind: "player_disconnected", playerId });
  }

  /** Permanently remove a player from a room while retaining a public audit event. */
  public kickPlayer(playerId: string): void {
    const player = this.requirePlayer(playerId);
    if (this.phase === "ended" || this.phase === "cancelled" || this.phase === "closed") {
      throw new Error("match_not_active");
    }
    if (player.lifecycle === "spectator") return;
    player.lifecycle = "spectator";
    player.alive = false;
    player.action = "none";
    player.spawnProtectionEndsAtTick = null;
    player.respawnAtTick = null;
    player.input = null;
    player.previousButtons = EMPTY_FPS_INPUT_BUTTONS;
    player.disconnectedAtTick = null;
    player.contributions.clear();
    this.appendEvent({ kind: "player_kicked", playerId });
  }

  public submitInput(input: FpsInputCommand): FpsInputResult {
    const serverTick = this.serverTick;
    if (!isRecord(input)) {
      return this.recordInput(input, { accepted: false, reason: "invalid_input", serverTick });
    }
    const candidate = input as unknown as Record<string, unknown>;
    const command = input as unknown as FpsInputCommand;
    const protocolVersion = candidate.protocolVersion;
    if (protocolVersion !== FPS_PROTOCOL_VERSION) {
      return this.recordInput(input, { accepted: false, reason: "invalid_input", serverTick });
    }
    if (
      !hasExactInputShape(candidate) ||
      typeof input.matchId !== "string" ||
      typeof input.playerId !== "string" ||
      !finiteRange(command.moveX, -1, 1) ||
      !finiteRange(command.moveY, -1, 1) ||
      !finiteRange(command.lookDeltaX, -MAX_LOOK_DELTA, MAX_LOOK_DELTA) ||
      !finiteRange(command.lookDeltaY, -MAX_LOOK_DELTA, MAX_LOOK_DELTA) ||
      !Number.isSafeInteger(command.inputSequence) ||
      !Number.isSafeInteger(command.acknowledgedServerTick) ||
      !Number.isFinite(command.clientTimestampMs) ||
      !validButtons(command.buttons) ||
      !validWeaponId(command.selectedWeaponId) ||
      (command.actionNonce !== null && typeof command.actionNonce !== "string")
    ) {
      return this.recordInput(input, { accepted: false, reason: "invalid_input", serverTick });
    }
    if (command.matchId !== this.matchId) {
      return this.recordInput(command, { accepted: false, reason: "wrong_match", serverTick });
    }
    const player = this.players.get(command.playerId);
    if (player === undefined) {
      return this.recordInput(command, { accepted: false, reason: "unknown_player", serverTick });
    }
    if (player.lifecycle === "disconnected" || player.lifecycle === "spectator") {
      return this.recordInput(command, {
        accepted: false,
        reason: "player_disconnected",
        serverTick,
      });
    }
    if (this.phase !== "active" && this.phase !== "countdown") {
      return this.recordInput(command, {
        accepted: false,
        reason: "match_not_active",
        serverTick,
      });
    }
    if (command.inputSequence <= player.lastAcceptedInputSequence) {
      return this.recordInput(command, {
        accepted: false,
        reason:
          command.inputSequence === player.lastAcceptedInputSequence
            ? "duplicate_input"
            : "stale_input",
        serverTick,
      });
    }
    if (command.acknowledgedServerTick < serverTick - MAX_FRAME_CLIENT_AGE_TICKS) {
      return this.recordInput(command, { accepted: false, reason: "stale_input", serverTick });
    }
    if (command.acknowledgedServerTick > serverTick + MAX_FUTURE_ACK_TICKS) {
      return this.recordInput(command, { accepted: false, reason: "invalid_input", serverTick });
    }
    player.lastAcceptedInputSequence = command.inputSequence;
    player.input = {
      protocolVersion: FPS_PROTOCOL_VERSION,
      matchId: command.matchId,
      playerId: command.playerId,
      inputSequence: command.inputSequence,
      clientTimestampMs: command.clientTimestampMs,
      acknowledgedServerTick: command.acknowledgedServerTick,
      moveX: command.moveX,
      moveY: command.moveY,
      lookDeltaX: command.lookDeltaX,
      lookDeltaY: command.lookDeltaY,
      buttons: copyButtons(command.buttons),
      selectedWeaponId: command.selectedWeaponId,
      actionNonce: command.actionNonce,
    };
    return this.recordInput(command, { accepted: true, reason: "accepted", serverTick });
  }

  private recordInput(input: unknown, result: FpsInputResult): FpsInputResult {
    const candidate = isRecord(input) ? input : {};
    const playerId = typeof candidate.playerId === "string" ? candidate.playerId : "";
    const inputSequence =
      typeof candidate.inputSequence === "number" && Number.isSafeInteger(candidate.inputSequence)
        ? candidate.inputSequence
        : -1;
    const acknowledgedServerTick =
      typeof candidate.acknowledgedServerTick === "number" &&
      Number.isSafeInteger(candidate.acknowledgedServerTick)
        ? candidate.acknowledgedServerTick
        : -1;
    const player = this.players.get(playerId);
    this.inputReceipts.push({
      playerId,
      inputSequence,
      serverTick: result.serverTick,
      acknowledgedServerTick,
      accepted: result.accepted,
      reason: result.reason,
      controller: player?.controller ?? null,
      appliedServerTick: null,
      appliedPosition: null,
      appliedVelocity: null,
    });
    const maximum = Math.max(256, this.rules.inputHistoryTicks * this.rules.playerCap);
    if (this.inputReceipts.length > maximum)
      this.inputReceipts.splice(0, this.inputReceipts.length - maximum);
    return result;
  }

  /** Attach the authoritative fixed-step result to the accepted command receipt. */
  private recordAppliedInput(player: MutablePlayer, input: FpsInputCommand): void {
    for (let index = this.inputReceipts.length - 1; index >= 0; index -= 1) {
      const receipt = this.inputReceipts[index];
      if (
        receipt?.playerId !== player.playerId ||
        receipt.inputSequence !== input.inputSequence ||
        !receipt.accepted
      ) {
        continue;
      }
      this.inputReceipts[index] = {
        ...receipt,
        appliedServerTick: this.serverTick,
        appliedPosition: { ...player.position },
        appliedVelocity: { ...player.velocity },
      };
      return;
    }
  }

  public advanceTicks(count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > 60 * 60) {
      throw new Error("invalid_tick_count");
    }
    for (let index = 0; index < count; index += 1) {
      this.advanceOneTick();
    }
  }

  public getState(): FpsMatchState {
    return {
      schemaVersion: FPS_STATE_SCHEMA_VERSION,
      matchId: this.matchId,
      roomId: this.roomId,
      phase: this.phase,
      serverTick: this.serverTick,
      rules: this.rules,
      roster: [...this.players.values()].map((player) => this.avatar(player)),
      scoreboard: publicScoreboard([...this.players.values()]),
      terminalReason: this.terminalReason,
    };
  }

  /** Read the authoritative phase without allocating a public roster projection. */
  public getPhase(): FpsMatchPhase {
    return this.phase;
  }

  /** Read the authoritative simulation tick without allocating a state snapshot. */
  public getServerTick(): number {
    return this.serverTick;
  }

  public getSnapshot(
    playerId: string,
    full = true,
    fromServerTick = 0,
    baseSnapshotId?: string | null,
  ): FpsSnapshot {
    return this.snapshot(playerId, full, fromServerTick, baseSnapshotId);
  }

  public getReplay(): FpsReplay {
    return {
      matchId: this.matchId,
      roomId: this.roomId,
      rulesHash: this.rules.rulesHash,
      mapHash: this.rules.mapHash,
      weaponSetHash: this.rules.weaponSetHash,
      rngVersion: this.rules.rngVersion,
      roster: [...this.players.values()]
        .sort((left, right) => left.playerId.localeCompare(right.playerId))
        .map((player): FpsReplayRosterEntry => ({
          playerId: player.playerId,
          displayName: player.displayName,
        })),
      seed: this.seed,
      terminalScoreboard: publicScoreboard([...this.players.values()]),
      events: this.eventRecords.map((record) => ({
        event: record.event,
        eventHash: record.eventHash,
        previousChainHash: record.previousChainHash,
        chainHash: record.chainHash,
      })),
      terminalChainHash: this.chainHash,
    };
  }

  public exportCheckpoint(): FpsMatchCheckpoint {
    const checkpoint: FpsCheckpointPayload = {
      matchId: this.matchId,
      roomId: this.roomId,
      seed: this.seed,
      arena: this.arena,
      rules: this.rules,
      phase: this.phase,
      serverTick: this.serverTick,
      terminalReason: this.terminalReason,
      eventCounter: this.eventCounter,
      snapshotCounter: this.snapshotCounter,
      lastFullSnapshotId: this.lastFullSnapshotId,
      spawnOrdinal: this.spawnOrdinal,
      chainHash: this.chainHash,
      players: [...this.players.values()].map((player) => ({
        playerId: player.playerId,
        controller: player.controller,
        displayName: player.displayName,
        modelId: player.modelId,
        lifecycle: player.lifecycle,
        position: { ...player.position },
        velocity: { ...player.velocity },
        yaw: player.yaw,
        pitch: player.pitch,
        locomotion: player.locomotion,
        action: player.action,
        health: player.health,
        shield: player.shield,
        alive: player.alive,
        spawnProtectionEndsAtTick: player.spawnProtectionEndsAtTick,
        spawnPointId: player.spawnPointId,
        respawnAtTick: player.respawnAtTick,
        connectedAtTick: player.connectedAtTick,
        disconnectedAtTick: player.disconnectedAtTick,
        score: player.score,
        kills: player.kills,
        assists: player.assists,
        deaths: player.deaths,
        ready: player.ready,
        equippedWeaponId: player.equippedWeaponId,
        ammoInMagazine: player.ammoInMagazine,
        reserveAmmo: player.reserveAmmo,
        reloadEndsAtTick: player.reloadEndsAtTick,
        lastAcceptedInputSequence: player.lastAcceptedInputSequence,
        input: player.input,
        previousButtons: player.previousButtons,
        lastAppliedLookInputSequence: player.lastAppliedLookInputSequence,
        lastFireTick: player.lastFireTick,
        seenActionNonces: [...player.seenActionNonces],
        contributions: [...player.contributions.entries()].map(([playerId, contribution]) => ({
          playerId,
          ...contribution,
        })),
      })),
      eventRecords: this.eventRecords.map((record) => ({
        event: record.event,
        eventHash: record.eventHash,
        previousChainHash: record.previousChainHash,
        chainHash: record.chainHash,
      })),
      inputReceipts: this.inputReceipts.map((receipt) => ({ ...receipt })),
    };
    return { ...checkpoint, checkpointHash: hashFpsCheckpoint(checkpoint) };
  }

  public static fromCheckpoint(checkpoint: FpsMatchCheckpoint): FpsMatch {
    const match = new FpsMatch({
      matchId: checkpoint.matchId,
      roomId: checkpoint.roomId,
      seed: checkpoint.seed,
      arena: checkpoint.arena,
      rules: {
        scoreTarget: checkpoint.rules.scoreTarget,
        durationTicks: checkpoint.rules.durationTicks,
        snapshotRate: checkpoint.rules.snapshotRate,
      },
      skipCountdown: true,
    });
    // Reconstructing the rules from the authoritative arena and bounded overrides is not enough:
    // a corrupt checkpoint could otherwise change a stored map/weapon/rules identity field while
    // retaining an apparently valid event chain. Require the complete canonical rules object to
    // match before any persisted state is admitted to the live service.
    if (canonicalJsonHash(match.rules) !== canonicalJsonHash(checkpoint.rules)) {
      throw new Error("fps_checkpoint_rules_hash_mismatch");
    }
    if (
      !Number.isSafeInteger(checkpoint.serverTick) ||
      checkpoint.serverTick < 0 ||
      !Number.isSafeInteger(checkpoint.eventCounter) ||
      checkpoint.eventCounter < 0 ||
      !Number.isSafeInteger(checkpoint.snapshotCounter) ||
      checkpoint.snapshotCounter < 0 ||
      !Number.isSafeInteger(checkpoint.spawnOrdinal) ||
      checkpoint.spawnOrdinal < 0 ||
      !verifyFpsEventChain(
        checkpoint.eventRecords,
        checkpoint.chainHash,
        checkpoint.eventCounter,
        checkpoint.serverTick,
      )
    ) {
      throw new Error("fps_checkpoint_event_chain_mismatch");
    }
    const { checkpointHash, ...checkpointPayload } = checkpoint;
    if (
      !FPS_HASH_PATTERN.test(checkpointHash) ||
      checkpointHash !== hashFpsCheckpoint(checkpointPayload)
    ) {
      throw new Error("fps_checkpoint_state_hash_mismatch");
    }
    match.phase = checkpoint.phase;
    match.serverTick = checkpoint.serverTick;
    match.terminalReason = checkpoint.terminalReason;
    match.eventCounter = checkpoint.eventCounter;
    match.snapshotCounter = checkpoint.snapshotCounter;
    match.lastFullSnapshotId = checkpoint.lastFullSnapshotId;
    match.spawnOrdinal = checkpoint.spawnOrdinal;
    match.chainHash = checkpoint.chainHash;
    match.players.clear();
    for (const checkpointPlayer of checkpoint.players) {
      match.players.set(checkpointPlayer.playerId, {
        ...checkpointPlayer,
        // Older persisted checkpoints may omit the controller field.
        controller: checkpointPlayer.controller ?? "human",
        seenActionNonces: new Set(checkpointPlayer.seenActionNonces),
        contributions: new Map(
          checkpointPlayer.contributions.map((contribution) => [
            contribution.playerId,
            {
              amount: contribution.amount,
              lastTick: contribution.lastTick,
              weaponId: contribution.weaponId,
            },
          ]),
        ),
      });
    }
    match.eventRecords.push(...checkpoint.eventRecords);
    match.inputReceipts.push(...checkpoint.inputReceipts);
    return match;
  }

  public getEventRecords(): readonly FpsEventRecord[] {
    return this.eventRecords.map((record) => ({ ...record, event: { ...record.event } }));
  }

  public getEventCount(): number {
    return this.eventRecords.length;
  }

  public getInputReceipts(): readonly FpsInputReceipt[] {
    return this.inputReceipts.map((receipt) => ({ ...receipt }));
  }

  private requirePlayer(playerId: string): MutablePlayer {
    const player = this.players.get(playerId);
    if (player === undefined) {
      throw new Error("unknown_player");
    }
    return player;
  }

  private activateMatch(): void {
    if (this.phase === "active") return;
    const eligiblePlayers = [...this.players.values()].filter(
      (player) =>
        player.ready && player.lifecycle !== "disconnected" && player.lifecycle !== "spectator",
    );
    if (eligiblePlayers.length < 2) {
      this.cancelMatch();
      return;
    }
    this.phase = "active";
    this.appendEvent({ kind: "match_phase_changed", phase: "active" });
    for (const player of eligiblePlayers) {
      this.spawnPlayer(player, false);
    }
  }

  private spawnPlayer(player: MutablePlayer, isRespawn: boolean): void {
    const enemies = [...this.players.values()].filter(
      (candidate) => candidate.playerId !== player.playerId && candidate.alive,
    );
    const occupied = enemies.map((candidate) => candidate.position);
    const points = this.arena.spawnPoints;
    if (points.length === 0) throw new Error("arena_has_no_spawn_point");
    // Player IDs are room-local credentials and are intentionally random. They must not affect
    // seeded gameplay, otherwise the same match seed can produce different spawn geometry (and
    // therefore different hit visibility) on every room creation.
    const rng = new FpsRng(`${this.seed}|spawn|${String(this.spawnOrdinal)}`, "spawn");
    this.spawnOrdinal += 1;
    const offset = rng.nextInt(points.length);
    const ordered = points
      .map((_, index) => points[(offset + index) % points.length])
      .filter((point): point is (typeof points)[number] => point !== undefined);
    const validPoints = ordered.filter((point) =>
      isSpawnPositionValid(this.arena, point.position, occupied),
    );
    const safePoints = validPoints.filter((point) =>
      enemies.every((enemy) => {
        const enemyEye = {
          x: enemy.position.x,
          y: enemy.position.y + (enemy.locomotion === "crouch" ? 1.05 : 1.5),
          z: enemy.position.z,
        };
        const spawnEye = { x: point.position.x, y: point.position.y + 1.5, z: point.position.z };
        return (
          Math.hypot(enemy.position.x - point.position.x, enemy.position.z - point.position.z) >=
            this.rules.minimumSpawnEnemyDistance &&
          (!isRespawn || !isFpsLineOfSightClear(this.arena, enemyEye, spawnEye))
        );
      }),
    );
    // Initial spawns prefer distance-safe points. Respawns additionally prefer occluded points to
    // reduce spawn camping. If the arena is saturated, use the first valid point and rely on
    // explicit spawn protection rather than failing a live match.
    const selected = safePoints[0] ?? validPoints[0];
    if (selected === undefined) throw new Error("no_valid_spawn_point");
    player.position = { ...selected.position };
    player.velocity = emptyVelocity();
    player.yaw = selected.yaw;
    player.pitch = 0;
    player.health = FULL_HEALTH;
    player.shield = FULL_SHIELD;
    player.alive = true;
    player.lifecycle = "alive";
    player.action = "none";
    // A respawn is a new life. Pending commands from the previous life must never fire or
    // move the player before the client submits an input for the new spawn.
    player.input = null;
    player.previousButtons = EMPTY_FPS_INPUT_BUTTONS;
    player.spawnPointId = selected.id;
    player.spawnProtectionEndsAtTick = this.serverTick + this.rules.spawnProtectionTicks;
    player.respawnAtTick = null;
    player.ammoInMagazine = weaponById(this.rules, player.equippedWeaponId).magazineSize;
    player.reserveAmmo = weaponById(this.rules, player.equippedWeaponId).reserveAmmo;
    player.reloadEndsAtTick = null;
    player.contributions.clear();
    this.appendEvent({
      kind: isRespawn ? "player_respawned" : "player_spawned",
      playerId: player.playerId,
      spawnPointId: selected.id,
      protectionEndsAtTick: player.spawnProtectionEndsAtTick,
    });
  }

  private advanceOneTick(): void {
    this.serverTick += 1;
    this.expireDisconnectedPlayers();
    if (this.phase === "countdown") {
      if (this.serverTick >= COUNTDOWN_TICKS) {
        this.activateMatch();
      }
      return;
    }
    if (this.phase !== "active") return;

    this.updateBotInputs();

    for (const player of this.players.values()) {
      if (player.lifecycle === "alive" && player.alive) {
        this.stepAlivePlayer(player);
      } else if (player.lifecycle === "dead" && player.respawnAtTick !== null) {
        if (this.serverTick >= player.respawnAtTick) {
          this.spawnPlayer(player, true);
        }
      }
    }
    if (this.serverTick >= this.rules.durationTicks) {
      this.endMatch("time_limit");
    }
  }

  private expireDisconnectedPlayers(): void {
    for (const player of this.players.values()) {
      if (
        player.lifecycle !== "disconnected" ||
        player.disconnectedAtTick === null ||
        this.serverTick - player.disconnectedAtTick < this.rules.reconnectReservationTicks
      ) {
        continue;
      }
      player.lifecycle = "spectator";
      player.alive = false;
      player.respawnAtTick = null;
      player.input = null;
      player.previousButtons = EMPTY_FPS_INPUT_BUTTONS;
      player.action = "none";
      this.appendEvent({ kind: "player_spectating", playerId: player.playerId });
    }
  }

  private stepAlivePlayer(player: MutablePlayer): void {
    const input = player.input;
    const buttons = input?.buttons ?? EMPTY_FPS_INPUT_BUTTONS;
    if (input !== null && input.inputSequence > player.lastAppliedLookInputSequence) {
      player.yaw = normalizeYaw(player.yaw + input.lookDeltaX);
      player.pitch = clampPitch(player.pitch + input.lookDeltaY);
      player.lastAppliedLookInputSequence = input.inputSequence;
    }
    const jump = buttons.jump && !player.previousButtons.jump;
    const movement = integrateFpsMovement(this.arena, {
      position: player.position,
      velocity: player.velocity,
      moveX: input?.moveX ?? 0,
      moveY: input?.moveY ?? 0,
      yaw: player.yaw,
      sprint: buttons.sprint,
      crouch: buttons.crouch,
      jump,
      grounded:
        player.position.y <= this.arena.floorY + 0.001 && Math.abs(player.velocity.y) < 0.001,
      deltaSeconds: 1 / this.rules.tickRate,
    });
    player.position = movement.position;
    player.velocity = movement.velocity;
    player.locomotion = movement.locomotion;
    if (input !== null) this.recordAppliedInput(player, input);
    // Keep reload visible for the complete server-authorized reload window. A one-tick action
    // would disappear between 20 Hz snapshots and could make the browser show a ready weapon
    // while the server still rejects fire requests.
    player.action = player.reloadEndsAtTick === null ? "none" : "reload";
    if (input !== null) {
      if (input.selectedWeaponId !== player.equippedWeaponId && player.reloadEndsAtTick === null) {
        player.equippedWeaponId = input.selectedWeaponId;
        player.ammoInMagazine = weaponById(this.rules, player.equippedWeaponId).magazineSize;
        player.reserveAmmo = weaponById(this.rules, player.equippedWeaponId).reserveAmmo;
        player.action = "switch";
      }
      if (buttons.reload && !player.previousButtons.reload) {
        this.startReload(player);
      }
      if (player.reloadEndsAtTick !== null && this.serverTick >= player.reloadEndsAtTick) {
        this.finishReload(player);
      }
      if (buttons.fire && player.reloadEndsAtTick === null) {
        this.tryFire(player, input.actionNonce);
      }
    }
    player.previousButtons = copyButtons(buttons);
  }

  /** Submit ordinary player inputs for server-owned competitors before the shared simulation step. */
  private updateBotInputs(): void {
    for (const player of this.players.values()) {
      if (player.controller !== "bot" || !player.alive || player.lifecycle !== "alive") continue;
      const target = this.selectBotTarget(player);
      const weaponId: FpsWeaponId = "rifle";
      const weapon = weaponById(this.rules, weaponId);
      const origin = add(player.position, {
        x: 0,
        y: player.locomotion === "crouch" ? 1.05 : 1.5,
        z: 0,
      });
      let moveX = 0;
      let moveY = 0;
      let lookDeltaX = 0;
      let lookDeltaY = 0;
      let fire = false;
      if (target !== null) {
        const targetCenter = add(target.position, {
          x: 0,
          y: target.locomotion === "crouch" ? 0.9 : 1.15,
          z: 0,
        });
        const horizontalDistance = Math.hypot(targetCenter.x - origin.x, targetCenter.z - origin.z);
        const distance = Math.hypot(horizontalDistance, targetCenter.y - origin.y);
        const desiredYaw = Math.atan2(targetCenter.x - origin.x, -(targetCenter.z - origin.z));
        const desiredPitch = Math.atan2(
          -(targetCenter.y - origin.y),
          Math.max(horizontalDistance, 0.001),
        );
        const yawError = normalizeYaw(desiredYaw - player.yaw);
        const pitchError = desiredPitch - player.pitch;
        lookDeltaX = Math.max(-MAX_LOOK_DELTA, Math.min(MAX_LOOK_DELTA, yawError));
        lookDeltaY = Math.max(-MAX_LOOK_DELTA, Math.min(MAX_LOOK_DELTA, pitchError));
        const alignedYaw = Math.abs(
          normalizeYaw(desiredYaw - normalizeYaw(player.yaw + lookDeltaX)),
        );
        const alignedPitch = Math.abs(desiredPitch - clampPitch(player.pitch + lookDeltaY));
        const strafeWindow = Math.floor(this.serverTick / 45);
        const strafeDirection =
          new FpsRng(
            `${this.seed}|bot|${player.playerId}|${String(strafeWindow)}`,
            "behavior",
          ).nextInt(2) === 0
            ? -1
            : 1;
        moveX = strafeDirection * (distance < 4 ? 0.55 : 0.8);
        moveY = distance > 9 ? 1 : distance < 3.5 ? -0.35 : 0.1;
        fire =
          alignedYaw < 0.055 &&
          alignedPitch < 0.055 &&
          player.spawnProtectionEndsAtTick !== null &&
          this.serverTick >= player.spawnProtectionEndsAtTick;
      }
      const reload = player.ammoInMagazine <= 0 && player.reserveAmmo > 0;
      const buttons = {
        forward: moveY > 0,
        backward: moveY < 0,
        left: moveX < 0,
        right: moveX > 0,
        sprint: moveY > 0.9,
        crouch: false,
        jump: false,
        fire: fire && !reload,
        reload,
      };
      const input: FpsInputCommand = {
        protocolVersion: FPS_PROTOCOL_VERSION,
        matchId: this.matchId,
        playerId: player.playerId,
        inputSequence: player.lastAcceptedInputSequence + 1,
        clientTimestampMs: this.serverTick * (1000 / this.rules.tickRate),
        acknowledgedServerTick: this.serverTick,
        moveX,
        moveY,
        lookDeltaX,
        lookDeltaY,
        buttons,
        selectedWeaponId: weapon.id,
        actionNonce: null,
      };
      this.submitInput(input);
    }
  }

  private selectBotTarget(bot: MutablePlayer): MutablePlayer | null {
    return (
      [...this.players.values()]
        .filter(
          (candidate) =>
            candidate.playerId !== bot.playerId &&
            candidate.alive &&
            candidate.lifecycle === "alive",
        )
        .sort(
          (left, right) =>
            distanceSquared(bot.position, left.position) -
              distanceSquared(bot.position, right.position) ||
            left.playerId.localeCompare(right.playerId),
        )[0] ?? null
    );
  }

  private startReload(player: MutablePlayer): void {
    const weapon = weaponById(this.rules, player.equippedWeaponId);
    if (
      player.reloadEndsAtTick !== null ||
      player.ammoInMagazine >= weapon.magazineSize ||
      player.reserveAmmo <= 0
    ) {
      return;
    }
    player.reloadEndsAtTick = this.serverTick + weapon.reloadTicks;
    player.action = "reload";
  }

  private finishReload(player: MutablePlayer): void {
    const weapon = weaponById(this.rules, player.equippedWeaponId);
    const needed = weapon.magazineSize - player.ammoInMagazine;
    const loaded = Math.min(needed, player.reserveAmmo);
    player.ammoInMagazine += loaded;
    player.reserveAmmo -= loaded;
    player.reloadEndsAtTick = null;
    player.action = "reload";
  }

  private tryFire(player: MutablePlayer, actionNonce: string | null): void {
    const weapon = weaponById(this.rules, player.equippedWeaponId);
    if (actionNonce !== null) {
      if (player.seenActionNonces.has(actionNonce)) {
        // A held input can remain on the server for several ticks. Record one explicit
        // duplicate-nonce rejection at the edge, not one event per simulation tick.
        if (!player.previousButtons.fire) {
          this.appendEvent({
            kind: "shot_rejected",
            playerId: player.playerId,
            reason: "duplicate_action",
          });
        }
        return;
      }
      player.seenActionNonces.add(actionNonce);
      if (player.seenActionNonces.size > 256) {
        const oldest = player.seenActionNonces.values().next().value;
        if (oldest !== undefined) player.seenActionNonces.delete(oldest);
      }
    }
    if (
      player.spawnProtectionEndsAtTick !== null &&
      this.serverTick < player.spawnProtectionEndsAtTick
    ) {
      this.appendEvent({
        kind: "shot_rejected",
        playerId: player.playerId,
        reason: "spawn_protection",
      });
      return;
    }
    if (this.serverTick - player.lastFireTick < weapon.cadenceTicks) {
      this.appendEvent({
        kind: "shot_rejected",
        playerId: player.playerId,
        reason: "cooldown",
      });
      return;
    }
    if (player.ammoInMagazine <= 0) {
      this.appendEvent({
        kind: "shot_rejected",
        playerId: player.playerId,
        reason: "empty_magazine",
      });
      return;
    }
    player.lastFireTick = this.serverTick;
    player.ammoInMagazine -= 1;
    player.action = "fire";
    const shotId = `${this.matchId}:shot:${String(this.eventCounter + 1)}`;
    const origin = add(player.position, {
      x: 0,
      y: player.locomotion === "crouch" ? 1.05 : 1.5,
      z: 0,
    });
    const direction = rotateDirection(player.yaw, player.pitch);
    this.appendEvent({
      kind: "shot_fired",
      shotId,
      playerId: player.playerId,
      weaponId: weapon.id,
      origin,
      direction,
    });
    const hit = this.findHit(player, origin, direction, weapon.range);
    if (hit === null) return;
    const damage =
      hit.hitbox === "head" ? Math.round(weapon.damage * weapon.headMultiplier) : weapon.damage;
    this.appendEvent({
      kind: "hit_confirmed",
      shotId,
      shooterId: player.playerId,
      targetId: hit.target.playerId,
      hitbox: hit.hitbox,
      damage,
    });
    this.applyDamage(player, hit.target, damage, hit.hitbox, weapon.id);
  }

  private findHit(
    shooter: MutablePlayer,
    origin: FpsVector3,
    direction: FpsVector3,
    range: number,
  ): { readonly target: MutablePlayer; readonly hitbox: "head" | "body" } | null {
    let nearest: {
      readonly target: MutablePlayer;
      readonly distance: number;
      readonly hitbox: "head" | "body";
    } | null = null;
    for (const target of this.players.values()) {
      if (target.playerId === shooter.playerId || !target.alive || target.lifecycle !== "alive")
        continue;
      const targetCenter = add(target.position, {
        x: 0,
        y: target.locomotion === "crouch" ? 0.9 : 1.15,
        z: 0,
      });
      const toTarget = {
        x: targetCenter.x - origin.x,
        y: targetCenter.y - origin.y,
        z: targetCenter.z - origin.z,
      };
      const along = toTarget.x * direction.x + toTarget.y * direction.y + toTarget.z * direction.z;
      if (along <= 0 || along > range) continue;
      const closest = add(origin, scale(direction, along));
      if (distanceSquared(closest, targetCenter) > 0.55 ** 2) continue;
      const blocked = this.arena.obstacles.some(
        (obstacle) =>
          obstacle.height >= origin.y && rayBoxIntersection(origin, direction, along, obstacle),
      );
      if (blocked) continue;
      const headCenter = add(target.position, {
        x: 0,
        y: target.locomotion === "crouch" ? 1.45 : 1.65,
        z: 0,
      });
      const hitbox = distanceSquared(closest, headCenter) <= 0.3 ** 2 ? "head" : "body";
      if (nearest === null || along < nearest.distance) {
        nearest = { target, distance: along, hitbox };
      }
    }
    return nearest === null ? null : { target: nearest.target, hitbox: nearest.hitbox };
  }

  private applyDamage(
    source: MutablePlayer,
    target: MutablePlayer,
    damage: number,
    _hitbox: "head" | "body",
    weaponId: FpsWeaponId,
  ): void {
    if (
      target.spawnProtectionEndsAtTick !== null &&
      this.serverTick < target.spawnProtectionEndsAtTick
    )
      return;
    const shieldDamage = Math.min(target.shield, damage);
    const healthDamage = Math.max(0, damage - shieldDamage);
    target.shield -= shieldDamage;
    target.health = Math.max(0, target.health - healthDamage);
    target.contributions.set(source.playerId, {
      amount: (target.contributions.get(source.playerId)?.amount ?? 0) + damage,
      lastTick: this.serverTick,
      weaponId,
    });
    this.appendEvent({
      kind: "damage_applied",
      targetId: target.playerId,
      sourceId: source.playerId,
      shieldDamage,
      healthDamage,
      health: target.health,
      shield: target.shield,
    });
    if (target.health > 0) return;
    this.killPlayer(target, source.playerId, weaponId);
  }

  private killPlayer(target: MutablePlayer, killerId: string, weaponId: FpsWeaponId): void {
    if (!target.alive) return;
    target.alive = false;
    target.lifecycle = "dead";
    target.input = null;
    target.previousButtons = EMPTY_FPS_INPUT_BUTTONS;
    target.action = "none";
    target.deaths += 1;
    target.respawnAtTick = this.serverTick + this.rules.respawnDelayTicks;
    target.spawnProtectionEndsAtTick = null;
    const contributions = [...target.contributions.entries()]
      .filter(
        ([playerId, contribution]) =>
          playerId !== killerId && this.serverTick - contribution.lastTick <= ASSIST_WINDOW_TICKS,
      )
      .sort((left, right) => right[1].amount - left[1].amount || left[0].localeCompare(right[0]));
    const assisterIds = contributions.map(([playerId]) => playerId);
    const killer = this.players.get(killerId);
    if (killer !== undefined) {
      killer.kills += 1;
      killer.score += this.rules.scoring.killPoints;
    }
    for (const assisterId of assisterIds) {
      const assister = this.players.get(assisterId);
      if (assister !== undefined) {
        assister.assists += 1;
        assister.score += this.rules.scoring.assistPoints;
      }
    }
    this.appendEvent({
      kind: "player_died",
      playerId: target.playerId,
      killerId,
      assisterIds,
      weaponId,
      respawnAtTick: target.respawnAtTick,
    });
    for (const playerId of [killerId, ...assisterIds]) {
      const player = this.players.get(playerId);
      if (player !== undefined) {
        this.appendEvent({
          kind: "score_updated",
          playerId,
          score: player.score,
          kills: player.kills,
          assists: player.assists,
          deaths: player.deaths,
        });
      }
    }
    if (killer !== undefined && killer.score >= this.rules.scoreTarget) {
      this.endMatch("score_target");
    }
  }

  private endMatch(reason: "score_target" | "time_limit"): void {
    if (this.phase === "ended" || this.phase === "cancelled") return;
    this.phase = "ended";
    this.terminalReason = reason;
    this.appendEvent({ kind: "match_phase_changed", phase: "ended" });
    // Apply the documented Slayer tie-break order at the authoritative boundary. A terminal
    // match has one deterministic winner even when several players share the same score; the
    // public scoreboard already owns the stable score/kills/deaths/player-id ordering.
    const winnerIds = publicScoreboard([...this.players.values()])
      .slice(0, 1)
      .map((player) => player.playerId);
    this.appendEvent({ kind: "match_ended", reason, winnerIds });
  }

  private avatar(player: MutablePlayer): FpsPublicAvatarSnapshot {
    return {
      playerId: player.playerId,
      displayName: player.displayName,
      modelId: player.modelId,
      teamId: null,
      position: { ...player.position },
      rotation: { yaw: player.yaw, pitch: player.pitch },
      velocity: { ...player.velocity },
      locomotion: player.locomotion,
      equippedWeaponId: player.equippedWeaponId,
      action: player.action,
      health: player.health,
      shield: player.shield,
      alive: player.alive,
      spawnProtectionEndsAtTick: player.spawnProtectionEndsAtTick,
      stateTick: this.serverTick,
      lifecycle: player.lifecycle,
    };
  }

  private privateSnapshot(player: MutablePlayer): FpsPrivatePlayerSnapshot {
    return {
      playerId: player.playerId,
      lifecycle: player.lifecycle,
      action: player.action,
      equippedWeaponId: player.equippedWeaponId,
      health: player.health,
      shield: player.shield,
      ammoInMagazine: player.ammoInMagazine,
      reserveAmmo: player.reserveAmmo,
      reloadEndsAtTick: player.reloadEndsAtTick,
      lastAcceptedInputSequence: player.lastAcceptedInputSequence,
      serverTick: this.serverTick,
    };
  }

  private snapshot(
    playerId: string,
    full: boolean,
    fromServerTick: number,
    requestedBaseSnapshotId?: string | null,
  ): FpsSnapshot {
    const player = this.requirePlayer(playerId);
    const events = this.eventRecords
      .filter((record) => full || record.event.serverTick > fromServerTick)
      .map((record) => record.event);
    const snapshotId = `${this.matchId}:${String(this.serverTick)}:${String(this.snapshotCounter++)}`;
    const baseSnapshotId = full ? null : (requestedBaseSnapshotId ?? this.lastFullSnapshotId);
    if (full) this.lastFullSnapshotId = snapshotId;
    return {
      protocolVersion: FPS_PROTOCOL_VERSION,
      stateSchemaVersion: FPS_STATE_SCHEMA_VERSION,
      snapshotId,
      baseSnapshotId,
      matchId: this.matchId,
      roomId: this.roomId,
      serverTick: this.serverTick,
      durationTicks: this.rules.durationTicks,
      scoreTarget: this.rules.scoreTarget,
      acknowledgedInputSequence: player.lastAcceptedInputSequence,
      rulesHash: this.rules.rulesHash,
      mapHash: this.rules.mapHash,
      weaponSetHash: this.rules.weaponSetHash,
      rngVersion: this.rules.rngVersion,
      phase: this.phase,
      players: [...this.players.values()].map((candidate) => this.avatar(candidate)),
      scoreboard: publicScoreboard([...this.players.values()]),
      events,
      privatePlayer: this.privateSnapshot(player),
      full,
      resyncRequired: false,
    };
  }

  private appendEvent(event: FpsEventInput): void {
    const identified = {
      ...event,
      eventId: `${this.matchId}:event:${String(this.eventCounter).padStart(8, "0")}`,
      serverTick: this.serverTick,
    } as FpsPublicEvent;
    this.eventCounter += 1;
    const eventHash = `sha256:${canonicalJsonHash(identified)}`;
    const chainHash = `sha256:${canonicalJsonHash({ previousChainHash: this.chainHash, eventHash })}`;
    this.eventRecords.push({
      event: identified,
      eventHash,
      previousChainHash: this.chainHash,
      chainHash,
    });
    this.chainHash = chainHash;
  }
}

const normalizeYaw = (value: number): number => {
  const wrapped = value % (Math.PI * 2);
  return wrapped > Math.PI
    ? wrapped - Math.PI * 2
    : wrapped < -Math.PI
      ? wrapped + Math.PI * 2
      : wrapped;
};

const clampPitch = (value: number): number => Math.min(1.45, Math.max(-1.45, value));

type FpsEventInput = {
  [Kind in FpsPublicEvent["kind"]]: Omit<
    Extract<FpsPublicEvent, { kind: Kind }>,
    "eventId" | "serverTick"
  >;
}[FpsPublicEvent["kind"]];

export const verifyFpsReplay = (replay: FpsReplay): boolean => {
  if (!verifyFpsEventChain(replay.events, replay.terminalChainHash)) return false;
  try {
    const roster = new Map<string, FpsReplayRosterEntry>();
    for (const entry of replay.roster) {
      if (
        roster.has(entry.playerId) ||
        entry.playerId.length === 0 ||
        entry.displayName.length === 0
      ) {
        return false;
      }
      roster.set(entry.playerId, entry);
    }
    if (roster.size === 0) return false;
    const state = new Map(
      [...roster].map(([playerId, entry]) => [
        playerId,
        {
          ...entry,
          kills: 0,
          assists: 0,
          deaths: 0,
          score: 0,
          connected: true,
        },
      ]),
    );
    let terminalWinnerIds: readonly string[] | null = null;
    let terminalReason: "score_target" | "time_limit" | "cancelled" | null = null;
    for (const record of replay.events) {
      const event = record.event;
      const getState = (playerId: string) => state.get(playerId);
      switch (event.kind) {
        case "player_spawned":
        case "player_respawned":
        case "player_reconnected": {
          const player = getState(event.playerId);
          if (player === undefined) return false;
          player.connected = true;
          break;
        }
        case "player_disconnected":
        case "player_kicked":
        case "player_spectating": {
          const player = getState(event.playerId);
          if (player === undefined) return false;
          player.connected = false;
          break;
        }
        case "player_died": {
          const target = getState(event.playerId);
          if (target === undefined) return false;
          target.deaths += 1;
          if (event.killerId !== null && getState(event.killerId) === undefined) return false;
          for (const assisterId of event.assisterIds) {
            if (getState(assisterId) === undefined) return false;
          }
          break;
        }
        case "score_updated": {
          const player = getState(event.playerId);
          if (player === undefined) return false;
          if (
            event.deaths !== player.deaths ||
            event.kills < player.kills ||
            event.assists < player.assists ||
            event.score < player.score
          )
            return false;
          player.kills = event.kills;
          player.assists = event.assists;
          player.score = event.score;
          break;
        }
        case "shot_fired":
        case "shot_rejected":
        case "hit_confirmed":
        case "damage_applied":
        case "match_phase_changed":
          break;
        case "match_ended":
          terminalWinnerIds = event.winnerIds;
          terminalReason = event.reason;
          for (const winnerId of event.winnerIds) {
            if (getState(winnerId) === undefined) return false;
          }
          break;
        default:
          return false;
      }
    }
    const expectedScoreboard = [...state.values()]
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.kills - left.kills ||
          left.deaths - right.deaths ||
          left.playerId.localeCompare(right.playerId),
      )
      .map(({ playerId, displayName, kills, assists, deaths, score, connected }) => ({
        playerId,
        displayName,
        kills,
        assists,
        deaths,
        score,
        connected,
      }));
    if (canonicalJsonHash(expectedScoreboard) !== canonicalJsonHash(replay.terminalScoreboard)) {
      return false;
    }
    if (terminalWinnerIds !== null && terminalReason !== "cancelled") {
      const expectedWinner = expectedScoreboard[0]?.playerId;
      if (terminalWinnerIds.length !== 1 || terminalWinnerIds[0] !== expectedWinner) return false;
    }
    return true;
  } catch {
    return false;
  }
};

const verifyFpsEventChain = (
  records: readonly FpsEventRecord[],
  terminalChainHash: string,
  expectedEventCounter?: number,
  maximumServerTick?: number,
): boolean => {
  try {
    if (!FPS_HASH_PATTERN.test(terminalChainHash)) return false;
    if (
      expectedEventCounter !== undefined &&
      (!Number.isSafeInteger(expectedEventCounter) || expectedEventCounter !== records.length)
    ) {
      return false;
    }
    let previous = ZERO_CHAIN_HASH;
    let previousServerTick = -1;
    const eventIds = new Set<string>();
    for (const record of records) {
      if (
        !FPS_HASH_PATTERN.test(record.eventHash) ||
        !FPS_HASH_PATTERN.test(record.previousChainHash) ||
        !FPS_HASH_PATTERN.test(record.chainHash) ||
        typeof record.event.eventId !== "string" ||
        record.event.eventId.length === 0 ||
        eventIds.has(record.event.eventId) ||
        !Number.isSafeInteger(record.event.serverTick) ||
        record.event.serverTick < previousServerTick ||
        (maximumServerTick !== undefined && record.event.serverTick > maximumServerTick)
      ) {
        return false;
      }
      const expectedEventHash = `sha256:${canonicalJsonHash(record.event)}`;
      if (record.previousChainHash !== previous || record.eventHash !== expectedEventHash) {
        return false;
      }
      const expectedChainHash = `sha256:${canonicalJsonHash({
        previousChainHash: previous,
        eventHash: expectedEventHash,
      })}`;
      if (record.chainHash !== expectedChainHash) return false;
      eventIds.add(record.event.eventId);
      previousServerTick = record.event.serverTick;
      previous = record.chainHash;
    }
    return previous === terminalChainHash;
  } catch {
    return false;
  }
};

export const fpsWeaponDefinitions = (): readonly FpsWeaponDefinition[] => WEAPONS;
