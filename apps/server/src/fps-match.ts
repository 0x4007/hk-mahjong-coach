import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  FpsMatch,
  verifyFpsReplay,
  type FpsInputCommand,
  type FpsMatchOptions,
  type FpsReplay,
  type FpsSnapshot,
} from "@hk-mahjong/fps";
import {
  fpsDiagnosticsSchema,
  fpsInputCommandSchema,
  fpsSocketClientEnvelopeSchema,
  fpsReplaySchema,
  fpsRoomCreateRequestSchema,
  fpsRoomJoinRequestSchema,
  fpsSnapshotSchema,
  type FpsDiagnosticsDto,
  type FpsRoomCreateRequest,
  type FpsRoomJoinRequest,
} from "@hk-mahjong/protocol";
import {
  FpsMatchJournal,
  type FpsJournalRequest,
  type FpsJournalSession,
} from "@hk-mahjong/persistence";

export interface FpsSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...arguments_: unknown[]) => void): void;
}

interface FpsSession {
  readonly matchId: string;
  readonly playerId: string;
  readonly ticketHash: string;
  readonly owner: boolean;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly revoked: boolean;
}

export interface FpsRoomCreateResponse {
  readonly roomId: string;
  readonly matchId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly phase: FpsSnapshot["phase"];
  readonly snapshot: FpsSnapshot;
}

export type FpsRoomJoinResponse = FpsRoomCreateResponse;

/** Public replay projection. The authoritative seed remains server-side for audit/replay. */
export type FpsPublicReplay = Omit<FpsReplay, "seed">;

export type FpsServiceErrorCode =
  | "invalid_request"
  | "unknown_match"
  | "unknown_player"
  | "invalid_ticket"
  | "cross_player_message"
  | "match_not_ready"
  | "match_not_active"
  | "duplicate_input"
  | "stale_input"
  | "player_disconnected"
  | "rate_limited"
  | "reconnect_reservation_expired"
  | "ticket_expired"
  | "origin_not_allowed"
  | "frame_too_large"
  | "room_closed";

export class FpsServiceError extends Error {
  public constructor(
    public readonly code: FpsServiceErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "FpsServiceError";
  }
}

const hashTicket = (ticket: string): string =>
  `sha256:${createHash("sha256").update(ticket, "utf8").digest("hex")}`;

const ticketsEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
};

const newTicket = (): string => randomBytes(32).toString("base64url");

const safeId = (prefix: string): string =>
  `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 20)}`;

const FPS_BOT_NAMES = [
  "Rival Echo",
  "Rival Nova",
  "Rival Vex",
  "Rival Kestrel",
  "Rival Flux",
  "Rival Ember",
  "Rival Orion",
] as const;

const MAX_REALTIME_CATCH_UP_TICKS = 8;

interface FpsSocketConnection {
  readonly socket: FpsSocketLike;
  readonly matchId: string;
  readonly playerId: string;
  readonly ticket: string;
  nextServerSequence: number;
  lastClientSequence: number;
  inputWindowStartedAtMs: number;
  inputCount: number;
  lastInputSequence: number;
  lastInputTransitMs: number | null;
  disconnected: boolean;
  lastSnapshotId: string | null;
  lastPublishedServerTick: number;
  lastPublishedEventCount: number;
}

export interface FpsMatchServiceOptions {
  readonly matchFactory?: (options: FpsMatchOptions) => FpsMatch;
  readonly tickIntervalMs?: number;
  readonly databasePath?: string;
  readonly now?: () => number;
  /** Monotonic scheduler clock; wall-clock time remains reserved for tickets and metadata. */
  readonly monotonicNow?: () => number;
  readonly ticketTtlMs?: number;
  readonly maxFrameBytes?: number;
  readonly maxInputsPerSecond?: number;
  readonly maxReconnectsPerMinute?: number;
  readonly maxClientClockSkewMs?: number;
  readonly allowedOrigins?: readonly string[];
}

export interface FpsServiceMetrics {
  readonly connectedPlayers: number;
  readonly rooms: number;
  readonly activeMatches: number;
  readonly phaseDurationMs: number;
  readonly reconnectCount: number;
  readonly inputAccepted: number;
  readonly inputRejected: number;
  readonly rateLimited: number;
  readonly malformedFrames: number;
  readonly oversizedFrames: number;
  readonly droppedFrames: number;
  readonly websocketUpgrades: number;
  readonly websocketUpgradeFailures: number;
  readonly snapshotsSent: number;
  readonly snapshotBytes: number;
  readonly persistenceWrites: number;
  readonly persistenceLatencyMs: number;
  readonly maxPersistenceLatencyMs: number;
  readonly persistenceFailures: number;
  readonly commitFailures: number;
  readonly replayFailures: number;
  readonly serverRestarts: number;
  readonly simulationTicks: number;
  readonly averageTickMs: number;
  readonly maxTickMs: number;
  readonly simulationOverruns: number;
  /** Mean age of accepted client timestamps at the server boundary, not an RTT claim. */
  readonly inputTransitMs: number;
  /** Mean absolute change in the measured client-timestamp age. */
  readonly inputTransitJitterMs: number;
  /** Gaps observed in a player's monotonic input sequence on a WebSocket connection. */
  readonly inputSequenceGaps: number;
  readonly resyncRequests: number;
  readonly snapshotFailures: number;
  readonly fireRequests: number;
  readonly acceptedShots: number;
  readonly rejectedShots: number;
  readonly hitEvents: number;
  readonly deaths: number;
  readonly respawns: number;
  readonly terminalMatches: number;
  readonly terminalScoreEvents: number;
  readonly kickedPlayers: number;
}

export class FpsMatchService {
  private readonly matches = new Map<string, FpsMatch>();
  private readonly sessions = new Map<string, FpsSession>();
  private readonly connections = new Set<FpsSocketConnection>();
  private readonly matchFactory: (options: FpsMatchOptions) => FpsMatch;
  private readonly tickIntervalMs: number;
  private readonly journal: FpsMatchJournal;
  private readonly lastPersistedTick = new Map<string, number>();
  private readonly lastPersistedEventCount = new Map<string, number>();
  private readonly requestReceipts = new Map<string, FpsSnapshot>();
  private readonly phaseStartedAtMs = new Map<string, number>();
  private readonly now: () => number;
  private readonly monotonicNow: () => number;
  private readonly ticketTtlMs: number;
  private readonly maxFrameBytes: number;
  private readonly maxInputsPerSecond: number;
  private readonly maxReconnectsPerMinute: number;
  private readonly maxClientClockSkewMs: number;
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly metricsState = {
    reconnectCount: 0,
    inputAccepted: 0,
    inputRejected: 0,
    rateLimited: 0,
    malformedFrames: 0,
    oversizedFrames: 0,
    droppedFrames: 0,
    websocketUpgrades: 0,
    websocketUpgradeFailures: 0,
    snapshotsSent: 0,
    snapshotBytes: 0,
    persistenceWrites: 0,
    persistenceLatencyMs: 0,
    maxPersistenceLatencyMs: 0,
    persistenceFailures: 0,
    commitFailures: 0,
    replayFailures: 0,
    serverRestarts: 0,
    simulationTicks: 0,
    averageTickMs: 0,
    maxTickMs: 0,
    simulationOverruns: 0,
    inputTransitMs: 0,
    inputTransitJitterMs: 0,
    inputSequenceGaps: 0,
    resyncRequests: 0,
    snapshotFailures: 0,
    fireRequests: 0,
  };
  private readonly httpRateWindows = new Map<string, { startedAtMs: number; count: number }>();
  private readonly reconnectRateWindows = new Map<string, { startedAtMs: number; count: number }>();
  private readonly pendingPublishes = new Set<string>();
  private readonly pendingPersists = new Map<string, boolean>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private clockLastTimeMs: number | null = null;
  private clockAccumulatorMs = 0;
  private closing = false;
  private inputTransitSamples = 0;
  private inputTransitJitterSamples = 0;

  public constructor(options: FpsMatchServiceOptions = {}) {
    this.matchFactory = options.matchFactory ?? ((matchOptions) => new FpsMatch(matchOptions));
    this.tickIntervalMs = options.tickIntervalMs ?? 1000 / 60;
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.ticketTtlMs = options.ticketTtlMs ?? 30 * 60 * 1000;
    this.maxFrameBytes = options.maxFrameBytes ?? 64 * 1024;
    this.maxInputsPerSecond = options.maxInputsPerSecond ?? 120;
    this.maxReconnectsPerMinute = options.maxReconnectsPerMinute ?? 12;
    this.maxClientClockSkewMs = options.maxClientClockSkewMs ?? 10_000;
    this.allowedOrigins = new Set(
      options.allowedOrigins ?? [
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://127.0.0.1:4183",
        "http://localhost:4183",
      ],
    );
    this.journal = new FpsMatchJournal(options.databasePath ?? ":memory:");
    for (const checkpoint of this.journal.loadMatches()) {
      const match = FpsMatch.fromCheckpoint(checkpoint);
      this.matches.set(match.matchId, match);
      this.phaseStartedAtMs.set(match.matchId, this.now());
      this.lastPersistedTick.set(match.matchId, checkpoint.serverTick);
      this.lastPersistedEventCount.set(match.matchId, checkpoint.eventRecords.length);
    }
    for (const session of this.journal.loadSessions())
      this.sessions.set(session.ticketHash, session);
    for (const request of this.journal.loadRequests()) {
      try {
        const snapshot = fpsSnapshotSchema.parse(JSON.parse(request.responseJson) as unknown);
        this.requestReceipts.set(this.requestKey(request), snapshot);
      } catch {
        this.metricsState.persistenceFailures += 1;
      }
    }
    this.metricsState.serverRestarts = this.matches.size > 0 ? 1 : 0;
  }

  public createRoom(request: FpsRoomCreateRequest): FpsRoomCreateResponse {
    const input = fpsRoomCreateRequestSchema.parse(request);
    const roomId = safeId("fps-room");
    const matchId = safeId("fps-match");
    const playerId = safeId("fps-player");
    const match = this.matchFactory({
      matchId,
      roomId,
      seed: input.seed,
      rules: {
        ...(input.scoreTarget === undefined ? {} : { scoreTarget: input.scoreTarget }),
        ...(input.durationSeconds === undefined
          ? {}
          : { durationTicks: input.durationSeconds * 60 }),
      },
    });
    match.addPlayer({ playerId, displayName: input.displayName });
    const botCount = input.botCount ?? 0;
    for (let index = 0; index < botCount; index += 1) {
      const botPlayerId = `fps-bot-${String(index + 1)}`;
      match.addPlayer({
        playerId: botPlayerId,
        displayName: FPS_BOT_NAMES[index] ?? `Rival ${String(index + 1)}`,
        controller: "bot",
      });
      match.readyPlayer(botPlayerId);
    }
    this.matches.set(matchId, match);
    const ticket = newTicket();
    const createdAtMs = this.now();
    this.phaseStartedAtMs.set(matchId, createdAtMs);
    const session: FpsJournalSession = {
      matchId,
      playerId,
      ticketHash: hashTicket(ticket),
      owner: true,
      createdAtMs,
      expiresAtMs: createdAtMs + this.ticketTtlMs,
      revoked: false,
    };
    this.sessions.set(session.ticketHash, session);
    this.journal.saveSession(session);
    this.persistMatch(match, true);
    return this.responseFor(match, playerId, ticket);
  }

  public joinRoom(
    matchId: string,
    request: FpsRoomJoinRequest,
    reconnectTicket?: string,
  ): FpsRoomJoinResponse {
    const match = this.requireMatch(matchId);
    const input = fpsRoomJoinRequestSchema.parse(request);
    if (reconnectTicket !== undefined) {
      const session = this.authenticate(matchId, "", reconnectTicket, true);
      try {
        const state = match.getState();
        if (
          state.roster.some(
            (player) => player.playerId === session.playerId && player.lifecycle === "disconnected",
          )
        ) {
          match.reconnectPlayer(session.playerId);
          this.metricsState.reconnectCount += 1;
          this.persistMatch(match, true);
          this.publish(matchId);
        }
      } catch (caught) {
        throw this.mapMatchError(caught);
      }
      return this.responseFor(match, session.playerId, reconnectTicket);
    }
    const playerId = safeId("fps-player");
    match.addPlayer({ playerId, displayName: input.displayName });
    const ticket = newTicket();
    const createdAtMs = this.now();
    const session: FpsJournalSession = {
      matchId,
      playerId,
      ticketHash: hashTicket(ticket),
      owner: false,
      createdAtMs,
      expiresAtMs: createdAtMs + this.ticketTtlMs,
      revoked: false,
    };
    this.sessions.set(session.ticketHash, session);
    this.journal.saveSession(session);
    this.persistMatch(match, true);
    return this.responseFor(match, playerId, ticket);
  }

  public ready(
    matchId: string,
    playerId: string,
    ticket: string,
    requestId = `legacy-ready-${playerId}`,
  ): FpsSnapshot {
    const match = this.requireMatch(matchId);
    this.authenticate(matchId, playerId, ticket);
    const previous = this.requestReceipts.get(
      this.requestKey({ matchId, playerId, requestId, kind: "ready" }),
    );
    if (previous !== undefined) return previous;
    const phaseBefore = match.getState().phase;
    try {
      match.readyPlayer(playerId);
    } catch (caught) {
      throw this.mapMatchError(caught);
    }
    if (match.getState().phase !== phaseBefore) this.notePhaseChange(matchId);
    const snapshot = match.getSnapshot(playerId, true, 0);
    this.persistMatch(match, true);
    this.saveRequest({ matchId, playerId, requestId, kind: "ready" }, snapshot);
    this.publish(matchId);
    return snapshot;
  }

  public start(
    matchId: string,
    playerId: string,
    ticket: string,
    requestId = `legacy-start-${playerId}`,
  ): FpsSnapshot {
    const match = this.requireMatch(matchId);
    const session = this.authenticate(matchId, playerId, ticket);
    if (!session.owner) {
      throw new FpsServiceError(
        "invalid_ticket",
        "Only the room owner can start the match",
        {},
        403,
      );
    }
    const previous = this.requestReceipts.get(
      this.requestKey({ matchId, playerId, requestId, kind: "start" }),
    );
    if (previous !== undefined) return previous;
    const phaseBefore = match.getState().phase;
    try {
      match.startMatch();
    } catch (caught) {
      throw this.mapMatchError(caught);
    }
    if (match.getState().phase !== phaseBefore) this.notePhaseChange(matchId);
    const snapshot = match.getSnapshot(playerId, true, 0);
    this.persistMatch(match, true);
    this.saveRequest({ matchId, playerId, requestId, kind: "start" }, snapshot);
    this.publish(matchId);
    return snapshot;
  }

  public submitInput(
    matchId: string,
    playerId: string,
    ticket: string,
    input: FpsInputCommand,
  ): FpsSnapshot {
    const match = this.requireMatch(matchId);
    this.authenticate(matchId, playerId, ticket);
    const parsed = fpsInputCommandSchema.parse(input);
    if (parsed.playerId !== playerId) {
      throw new FpsServiceError(
        "cross_player_message",
        "Input identity does not match the ticket",
        {},
        403,
      );
    }
    if (parsed.buttons.fire) this.metricsState.fireRequests += 1;
    if (Math.abs(this.now() - parsed.clientTimestampMs) > this.maxClientClockSkewMs) {
      this.metricsState.inputRejected += 1;
      throw new FpsServiceError(
        "stale_input",
        "The client input timestamp is outside the accepted clock window",
        { maxClientClockSkewMs: this.maxClientClockSkewMs },
        409,
      );
    }
    const result = match.submitInput(parsed);
    if (!result.accepted) {
      this.metricsState.inputRejected += 1;
      const code: FpsServiceErrorCode =
        result.reason === "duplicate_input" || result.reason === "stale_input"
          ? result.reason
          : result.reason === "unknown_player"
            ? "unknown_player"
            : result.reason === "match_not_active"
              ? "match_not_active"
              : result.reason === "player_disconnected"
                ? "player_disconnected"
                : result.reason === "wrong_match"
                  ? "invalid_request"
                  : "invalid_request";
      throw new FpsServiceError(
        code,
        `Input was rejected: ${result.reason}`,
        { reason: result.reason },
        409,
      );
    }
    this.metricsState.inputAccepted += 1;
    this.persistMatch(match);
    return match.getSnapshot(playerId, false, Math.max(0, match.getState().serverTick - 3));
  }

  public getSnapshot(
    matchId: string,
    playerId: string,
    ticket: string,
    full = true,
    fromTick = 0,
  ): FpsSnapshot {
    const match = this.requireMatch(matchId);
    this.authenticate(matchId, playerId, ticket);
    if (!Number.isSafeInteger(fromTick) || fromTick < 0) {
      throw new FpsServiceError("invalid_request", "The snapshot tick is invalid", {}, 400);
    }
    return fpsSnapshotSchema.parse(match.getSnapshot(playerId, full, fromTick));
  }

  public getReplay(matchId: string, playerId: string, ticket: string): FpsPublicReplay {
    const match = this.requireMatch(matchId);
    this.authenticate(matchId, playerId, ticket);
    const replay = match.getReplay();
    if (!verifyFpsReplay(replay)) {
      this.metricsState.replayFailures += 1;
      throw new FpsServiceError(
        "invalid_request",
        "The authoritative event chain failed validation",
        {},
        500,
      );
    }
    const { seed: _seed, ...publicReplay } = replay;
    void _seed;
    return fpsReplaySchema.parse(publicReplay);
  }

  public assertOrigin(origin: string | undefined, countUpgradeFailure = true): void {
    if (origin !== undefined && !this.allowedOrigins.has(origin)) {
      if (countUpgradeFailure) this.metricsState.websocketUpgradeFailures += 1;
      throw new FpsServiceError("origin_not_allowed", "The FPS origin is not allowed", {}, 403);
    }
  }

  public assertHttpRateLimit(key: string, kind: "create" | "join" | "input"): void {
    const limit = kind === "create" ? 20 : kind === "join" ? 60 : this.maxInputsPerSecond;
    const bucketKey = `${kind}|${key}`;
    const now = this.now();
    const current = this.httpRateWindows.get(bucketKey);
    if (current === undefined || now - current.startedAtMs >= 60_000) {
      this.httpRateWindows.set(bucketKey, { startedAtMs: now, count: 1 });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      this.metricsState.rateLimited += 1;
      throw new FpsServiceError(
        "rate_limited",
        "The FPS HTTP rate is above the limit",
        { kind },
        429,
      );
    }
  }

  public assertInputHttpRateLimit(
    matchId: string,
    playerId: string,
    ticket: string,
    key: string,
  ): void {
    this.requireMatch(matchId);
    this.authenticate(matchId, playerId, ticket);
    this.assertHttpRateLimit(`${key}|${matchId}|${playerId}`, "input");
  }

  public closeRoom(matchId: string, playerId: string, ticket: string): FpsSnapshot {
    const match = this.requireMatch(matchId);
    const session = this.authenticate(matchId, playerId, ticket);
    if (!session.owner) {
      throw new FpsServiceError(
        "invalid_ticket",
        "Only the room owner can close the room",
        {},
        403,
      );
    }
    const phaseBefore = match.getState().phase;
    try {
      match.closeMatch();
    } catch (caught) {
      throw this.mapMatchError(caught);
    }
    if (match.getState().phase !== phaseBefore) this.notePhaseChange(matchId);
    for (const current of this.sessions.values()) {
      if (current.matchId === matchId) {
        this.sessions.set(current.ticketHash, { ...current, revoked: true });
        this.journal.revokeSession(current.ticketHash);
      }
    }
    this.persistMatch(match, true);
    this.publish(matchId);
    return match.getSnapshot(playerId, true, 0);
  }

  public kickPlayer(
    matchId: string,
    ownerPlayerId: string,
    ownerTicket: string,
    targetPlayerId: string,
  ): FpsSnapshot {
    const match = this.requireMatch(matchId);
    const session = this.authenticate(matchId, ownerPlayerId, ownerTicket);
    if (!session.owner) {
      throw new FpsServiceError("invalid_ticket", "Only the room owner can kick a player", {}, 403);
    }
    if (targetPlayerId === ownerPlayerId) {
      throw new FpsServiceError(
        "invalid_request",
        "The room owner cannot kick themself",
        { targetPlayerId },
        400,
      );
    }
    const target = match.getState().roster.find((player) => player.playerId === targetPlayerId);
    if (target === undefined) {
      throw new FpsServiceError("unknown_player", "The player was not found", {}, 404);
    }
    try {
      match.kickPlayer(targetPlayerId);
    } catch (caught) {
      throw this.mapMatchError(caught);
    }
    for (const current of this.sessions.values()) {
      if (current.matchId !== matchId || current.playerId !== targetPlayerId) continue;
      this.sessions.set(current.ticketHash, { ...current, revoked: true });
      this.journal.revokeSession(current.ticketHash);
    }
    for (const connection of this.connections) {
      if (connection.matchId !== matchId || connection.playerId !== targetPlayerId) continue;
      connection.disconnected = true;
      this.connections.delete(connection);
      connection.socket.close(4003, "player_kicked");
    }
    this.persistMatch(match, true);
    this.publish(matchId);
    return match.getSnapshot(ownerPlayerId, true, 0);
  }

  public revokeTicket(ticket: string): void {
    const ticketHash = hashTicket(ticket);
    const session = this.sessions.get(ticketHash);
    if (session === undefined) return;
    this.sessions.set(ticketHash, { ...session, revoked: true });
    this.journal.revokeSession(ticketHash);
  }

  public getMetrics(): FpsServiceMetrics {
    const phaseDurationMs = Math.max(
      0,
      ...[...this.matches.keys()].map((matchId) => this.phaseDurationMs(matchId)),
    );
    const eventMetrics = this.eventMetrics();
    return {
      connectedPlayers: [...this.connections].filter((connection) => !connection.disconnected)
        .length,
      rooms: this.matches.size,
      activeMatches: [...this.matches.values()].filter(
        (match) => match.getState().phase === "active",
      ).length,
      phaseDurationMs,
      ...this.metricsState,
      ...eventMetrics,
    };
  }

  public getDiagnostics(matchId: string, playerId: string, ticket: string): FpsDiagnosticsDto {
    const match = this.requireMatch(matchId);
    this.authenticate(matchId, playerId, ticket);
    const state = match.getState();
    return fpsDiagnosticsSchema.parse({
      matchId,
      roomId: match.roomId,
      phase: state.phase,
      phaseDurationMs: this.phaseDurationMs(matchId),
      serverTick: state.serverTick,
      rulesHash: match.rules.rulesHash,
      mapHash: match.rules.mapHash,
      weaponSetHash: match.rules.weaponSetHash,
      replayHash: match.getReplay().terminalChainHash,
      roster: state.scoreboard.map((entry) => ({
        playerId: entry.playerId,
        displayName: entry.displayName,
        connected: entry.connected,
        score: entry.score,
      })),
      metrics: this.getMetrics(),
    });
  }

  public startClock(): void {
    if (this.tickHandle !== null) return;
    this.clockLastTimeMs = this.monotonicNow();
    this.clockAccumulatorMs = 0;
    this.tickHandle = setInterval(() => {
      const ticksDue = this.consumeRealtimeTicks();
      for (let tick = 0; tick < ticksDue; tick += 1) {
        for (const match of this.matches.values()) this.advanceRealtimeTick(match);
      }
    }, this.tickIntervalMs);
    const maybeUnref = this.tickHandle as ReturnType<typeof setInterval> & { unref?: () => void };
    if (typeof maybeUnref.unref === "function") maybeUnref.unref();
  }

  public stopClock(): void {
    if (this.tickHandle === null) return;
    clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.clockLastTimeMs = null;
    this.clockAccumulatorMs = 0;
  }

  /** Convert monotonic elapsed time into a bounded number of authoritative fixed ticks. */
  private consumeRealtimeTicks(): number {
    const currentTimeMs = this.monotonicNow();
    const previousTimeMs = this.clockLastTimeMs;
    this.clockLastTimeMs = currentTimeMs;
    if (previousTimeMs === null || !Number.isFinite(currentTimeMs)) return 0;
    const elapsedMs = currentTimeMs - previousTimeMs;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      this.clockAccumulatorMs = 0;
      return 0;
    }
    this.clockAccumulatorMs += Math.min(
      elapsedMs,
      this.tickIntervalMs * MAX_REALTIME_CATCH_UP_TICKS,
    );
    const ticksDue = Math.floor(this.clockAccumulatorMs / this.tickIntervalMs);
    this.clockAccumulatorMs -= ticksDue * this.tickIntervalMs;
    return ticksDue;
  }

  private advanceRealtimeTick(match: FpsMatch): void {
    const startedAt = this.monotonicNow();
    try {
      const eventCountBefore = match.getEventCount();
      const phaseBefore = match.getPhase();
      match.advanceTicks(1);
      const phaseChanged = match.getPhase() !== phaseBefore;
      if (phaseChanged) this.notePhaseChange(match.matchId);
      this.schedulePersist(match.matchId, phaseChanged);
      const eventCountAfter = match.getEventCount();
      const ticksPerSnapshot = Math.max(
        1,
        Math.floor(match.rules.tickRate / match.rules.snapshotRate),
      );
      if (match.getServerTick() % ticksPerSnapshot === 0 || eventCountAfter !== eventCountBefore) {
        this.schedulePublish(match.matchId);
      }
    } catch {
      this.metricsState.persistenceFailures += 1;
      try {
        match.cancelMatch();
        this.notePhaseChange(match.matchId);
        this.persistMatch(match, true);
      } catch {
        this.metricsState.persistenceFailures += 1;
      }
    } finally {
      const elapsedMs = Math.max(0, this.monotonicNow() - startedAt);
      this.metricsState.simulationTicks += 1;
      this.metricsState.averageTickMs =
        (this.metricsState.averageTickMs * (this.metricsState.simulationTicks - 1) + elapsedMs) /
        this.metricsState.simulationTicks;
      this.metricsState.maxTickMs = Math.max(this.metricsState.maxTickMs, elapsedMs);
      if (elapsedMs > this.tickIntervalMs) this.metricsState.simulationOverruns += 1;
    }
  }

  /** Advance a fixed number of authoritative ticks for deterministic local acceptance gates. */
  public advanceTicksForDeterministicGate(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > 60 * 60) {
      throw new FpsServiceError("invalid_request", "The deterministic tick count is invalid");
    }
    this.stopClock();
    for (const match of this.matches.values()) {
      const phaseBefore = match.getPhase();
      match.advanceTicks(count);
      if (match.getPhase() !== phaseBefore) this.notePhaseChange(match.matchId);
      this.persistMatch(match, true);
      this.publish(match.matchId);
    }
  }

  public close(): void {
    if (this.closing) return;
    this.closing = true;
    this.stopClock();
    this.pendingPersists.clear();
    for (const match of this.matches.values()) {
      try {
        this.persistMatch(match, true);
      } catch {
        // A shutdown write failure must not leave a silently resumable partial match. Try to
        // persist an explicit cancellation before closing the journal; metrics retain the failure.
        try {
          match.cancelMatch();
          this.persistMatch(match, true);
        } catch {
          this.metricsState.persistenceFailures += 1;
        }
      }
    }
    for (const connection of this.connections) connection.socket.close(1001, "server_shutdown");
    this.connections.clear();
    this.journal.close();
  }

  public attachSocket(
    socket: FpsSocketLike,
    matchId: string,
    playerId: string,
    ticket: string,
    origin?: string,
    rateLimitKey = "socket",
  ): void {
    const match = this.requireMatch(matchId);
    this.assertOrigin(origin);
    this.authenticate(matchId, playerId, ticket);
    this.metricsState.websocketUpgrades += 1;
    const state = match.getState();
    const current = state.roster.find((player) => player.playerId === playerId);
    if (current?.lifecycle === "disconnected") {
      this.assertReconnectRateLimit(matchId, playerId, rateLimitKey);
      try {
        match.reconnectPlayer(playerId);
        this.metricsState.reconnectCount += 1;
        this.persistMatch(match, true);
      } catch (caught) {
        throw this.mapMatchError(caught);
      }
    }
    for (const existing of this.connections) {
      if (
        existing.matchId === matchId &&
        existing.playerId === playerId &&
        !existing.disconnected
      ) {
        existing.disconnected = true;
        this.connections.delete(existing);
        existing.socket.close(4001, "replaced_connection");
      }
    }
    const connection: FpsSocketConnection = {
      socket,
      matchId,
      playerId,
      ticket,
      nextServerSequence: 0,
      lastClientSequence: -1,
      inputWindowStartedAtMs: this.now(),
      inputCount: 0,
      lastInputSequence: -1,
      lastInputTransitMs: null,
      disconnected: false,
      lastSnapshotId: null,
      lastPublishedServerTick: -1,
      lastPublishedEventCount: -1,
    };
    this.connections.add(connection);
    socket.on("message", (...arguments_: unknown[]) => {
      const data = arguments_[0];
      const byteLength =
        typeof data === "string"
          ? new TextEncoder().encode(data).byteLength
          : data instanceof Uint8Array
            ? data.byteLength
            : 0;
      if (byteLength > this.maxFrameBytes) {
        this.metricsState.oversizedFrames += 1;
        socket.close(1009, "frame_too_large");
        return;
      }
      const isBinary =
        arguments_[1] === true || (arguments_.length < 2 && typeof data !== "string");
      if (isBinary) {
        socket.close(1003, "text_frames_only");
        return;
      }
      const text =
        typeof data === "string"
          ? data
          : data instanceof Uint8Array
            ? new TextDecoder().decode(data)
            : null;
      if (text === null) {
        socket.close(1003, "text_frames_only");
        return;
      }
      void this.handleSocketMessage(connection, text);
    });
    socket.on("close", () => this.handleSocketDisconnect(connection));
    socket.on("error", () => this.handleSocketDisconnect(connection));
    this.send(connection, "fps_hello", { playerId, serverTick: match.getState().serverTick });
    this.sendSnapshot(connection, match.getSnapshot(playerId, true, 0));
    connection.lastPublishedServerTick = match.getState().serverTick;
    connection.lastPublishedEventCount = match.getEventCount();
  }

  private handleSocketDisconnect(connection: FpsSocketConnection): void {
    if (connection.disconnected) return;
    connection.disconnected = true;
    this.connections.delete(connection);
    if (this.closing) return;
    const match = this.matches.get(connection.matchId);
    if (match === undefined) return;
    try {
      match.disconnectPlayer(connection.playerId);
      this.persistMatch(match, true);
      this.publish(connection.matchId);
    } catch {
      this.metricsState.persistenceFailures += 1;
    }
  }

  private async handleSocketMessage(connection: FpsSocketConnection, raw: string): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(raw) as unknown;
      const envelope = fpsSocketClientEnvelopeSchema.parse(parsed);
      if (envelope.matchId !== connection.matchId) {
        throw new FpsServiceError(
          "cross_player_message",
          "The frame match does not match the socket",
          {},
          403,
        );
      }
      if (envelope.seq <= connection.lastClientSequence) {
        throw new FpsServiceError(
          "invalid_request",
          "Client sequence is not strictly increasing",
          {},
          409,
        );
      }
      connection.lastClientSequence = envelope.seq;
      if (envelope.type === "fps_input") {
        if (!this.consumeInputRate(connection)) {
          this.metricsState.rateLimited += 1;
          throw new FpsServiceError(
            "rate_limited",
            "The FPS input rate is above the connection limit",
            { maxInputsPerSecond: this.maxInputsPerSecond },
            429,
          );
        }
        const payload = fpsInputCommandSchema.parse(envelope.payload);
        const snapshot = this.submitInput(
          connection.matchId,
          connection.playerId,
          connection.ticket,
          payload,
        );
        this.recordInputTransport(connection, payload);
        this.send(connection, "fps_input_ack", {
          inputSequence: payload.inputSequence,
          acknowledgedServerTick: payload.acknowledgedServerTick,
          serverTick: snapshot.serverTick,
        });
        return;
      }
      if (envelope.type === "fps_ready") {
        if (envelope.payload.playerId !== connection.playerId) {
          throw new FpsServiceError(
            "cross_player_message",
            "Ready identity does not match the ticket",
            {},
            403,
          );
        }
        const snapshot = this.ready(
          connection.matchId,
          connection.playerId,
          connection.ticket,
          envelope.requestId,
        );
        this.sendSnapshot(connection, snapshot);
        return;
      }
      if (envelope.type === "fps_start") {
        const snapshot = this.start(
          connection.matchId,
          connection.playerId,
          connection.ticket,
          envelope.requestId,
        );
        this.sendSnapshot(connection, snapshot);
        return;
      }
      if (envelope.type === "fps_resync_request") {
        this.metricsState.resyncRequests += 1;
        this.sendSnapshot(
          connection,
          this.getSnapshot(connection.matchId, connection.playerId, connection.ticket, true, 0),
        );
        return;
      }
      this.send(connection, "fps_pong", { nonce: envelope.payload.nonce });
      return;
    } catch (caught) {
      if (!(caught instanceof FpsServiceError)) this.metricsState.malformedFrames += 1;
      const error =
        caught instanceof FpsServiceError
          ? caught
          : new FpsServiceError("invalid_request", "Malformed FPS frame");
      this.send(connection, "fps_error", {
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }
    await Promise.resolve();
  }

  private consumeInputRate(connection: FpsSocketConnection): boolean {
    const now = this.now();
    if (now - connection.inputWindowStartedAtMs >= 1000) {
      connection.inputWindowStartedAtMs = now;
      connection.inputCount = 0;
    }
    connection.inputCount += 1;
    return connection.inputCount <= this.maxInputsPerSecond;
  }

  private recordInputTransport(connection: FpsSocketConnection, input: FpsInputCommand): void {
    if (
      Number.isSafeInteger(input.inputSequence) &&
      input.inputSequence >= 0 &&
      input.inputSequence > connection.lastInputSequence
    ) {
      if (
        connection.lastInputSequence >= 0 &&
        input.inputSequence > connection.lastInputSequence + 1
      ) {
        this.metricsState.inputSequenceGaps +=
          input.inputSequence - connection.lastInputSequence - 1;
      }
      connection.lastInputSequence = input.inputSequence;
    }
    const transitMs = this.now() - input.clientTimestampMs;
    if (!Number.isFinite(transitMs) || transitMs < 0 || transitMs > this.maxClientClockSkewMs) {
      return;
    }
    this.metricsState.inputTransitMs =
      (this.metricsState.inputTransitMs * this.inputTransitSamples + transitMs) /
      (this.inputTransitSamples + 1);
    this.inputTransitSamples += 1;
    if (connection.lastInputTransitMs !== null) {
      this.metricsState.inputTransitJitterMs =
        (this.metricsState.inputTransitJitterMs * this.inputTransitJitterSamples +
          Math.abs(transitMs - connection.lastInputTransitMs)) /
        (this.inputTransitJitterSamples + 1);
      this.inputTransitJitterSamples += 1;
    }
    connection.lastInputTransitMs = transitMs;
  }

  private assertReconnectRateLimit(matchId: string, playerId: string, key: string): void {
    const bucketKey = `${key}|${matchId}|${playerId}`;
    const now = this.now();
    const current = this.reconnectRateWindows.get(bucketKey);
    if (current === undefined || now - current.startedAtMs >= 60_000) {
      this.reconnectRateWindows.set(bucketKey, { startedAtMs: now, count: 1 });
      return;
    }
    current.count += 1;
    if (current.count > this.maxReconnectsPerMinute) {
      this.metricsState.rateLimited += 1;
      throw new FpsServiceError(
        "rate_limited",
        "The FPS reconnect rate is above the limit",
        { maxReconnectsPerMinute: this.maxReconnectsPerMinute },
        429,
      );
    }
  }

  private sendSnapshot(connection: FpsSocketConnection, snapshot: FpsSnapshot): void {
    this.send(connection, "fps_snapshot", snapshot);
    connection.lastSnapshotId = snapshot.snapshotId;
  }

  private send(connection: FpsSocketConnection, type: string, payload: unknown): void {
    const encoded = JSON.stringify({
      protocolVersion: 1,
      type,
      seq: connection.nextServerSequence++,
      timestamp: new Date(this.now()).toISOString(),
      matchId: connection.matchId,
      payload,
    });
    try {
      connection.socket.send(encoded);
    } catch (caught) {
      this.metricsState.droppedFrames += 1;
      throw caught;
    }
    if (type === "fps_snapshot") {
      this.metricsState.snapshotsSent += 1;
      this.metricsState.snapshotBytes += new TextEncoder().encode(encoded).byteLength;
    }
  }

  /** Keep socket serialization and kernel writes out of the fixed-step simulation budget. */
  private schedulePublish(matchId: string): void {
    if (this.pendingPublishes.has(matchId)) return;
    this.pendingPublishes.add(matchId);
    setImmediate(() => {
      this.pendingPublishes.delete(matchId);
      if (this.closing) return;
      try {
        this.publish(matchId);
      } catch {
        this.metricsState.snapshotFailures += 1;
      }
    });
  }

  /** Keep periodic checkpoint serialization and SQLite writes out of the fixed-step budget. */
  private schedulePersist(matchId: string, force = false): void {
    const existing = this.pendingPersists.get(matchId);
    if (existing !== undefined) {
      if (force && !existing) this.pendingPersists.set(matchId, true);
      return;
    }
    this.pendingPersists.set(matchId, force);
    setImmediate(() => {
      const forcePersist = this.pendingPersists.get(matchId) ?? false;
      this.pendingPersists.delete(matchId);
      if (this.closing) return;
      const match = this.matches.get(matchId);
      if (match === undefined) return;
      try {
        this.persistMatch(match, forcePersist);
      } catch {
        this.metricsState.persistenceFailures += 1;
        try {
          const phaseBefore = match.getState().phase;
          match.cancelMatch();
          if (match.getState().phase !== phaseBefore) this.notePhaseChange(matchId);
          this.persistMatch(match, true);
        } catch {
          this.metricsState.persistenceFailures += 1;
        }
      }
    });
  }

  private publish(matchId: string): void {
    const match = this.requireMatch(matchId);
    const state = match.getState();
    const eventCount = match.getEventCount();
    for (const connection of this.connections) {
      if (connection.matchId !== matchId) continue;
      if (
        connection.lastPublishedServerTick === state.serverTick &&
        connection.lastPublishedEventCount === eventCount
      ) {
        continue;
      }
      try {
        this.sendSnapshot(
          connection,
          match.getSnapshot(
            connection.playerId,
            false,
            Math.max(0, match.getState().serverTick - 3),
            connection.lastSnapshotId,
          ),
        );
        connection.lastPublishedServerTick = state.serverTick;
        connection.lastPublishedEventCount = eventCount;
      } catch {
        this.metricsState.snapshotFailures += 1;
        connection.socket.close(1011, "snapshot_failed");
        this.connections.delete(connection);
      }
    }
  }

  private persistMatch(match: FpsMatch, force = false): void {
    const eventCount = match.getEventCount();
    const lastTick = this.lastPersistedTick.get(match.matchId) ?? -1;
    const lastEventCount = this.lastPersistedEventCount.get(match.matchId) ?? -1;
    const serverTick = match.getServerTick();
    if (!force && eventCount === lastEventCount && serverTick - lastTick < 20) return;
    const checkpoint = match.exportCheckpoint();
    const startedAt = performance.now();
    try {
      this.journal.saveMatch(checkpoint);
      this.lastPersistedTick.set(match.matchId, checkpoint.serverTick);
      this.lastPersistedEventCount.set(match.matchId, eventCount);
      this.metricsState.persistenceWrites += 1;
      this.recordPersistenceLatency(performance.now() - startedAt);
    } catch (caught) {
      this.metricsState.persistenceFailures += 1;
      this.metricsState.commitFailures += 1;
      this.recordPersistenceLatency(performance.now() - startedAt);
      throw caught;
    }
  }

  private notePhaseChange(matchId: string): void {
    this.phaseStartedAtMs.set(matchId, this.now());
  }

  private phaseDurationMs(matchId: string): number {
    const startedAt = this.phaseStartedAtMs.get(matchId);
    return startedAt === undefined ? 0 : Math.max(0, this.now() - startedAt);
  }

  private recordPersistenceLatency(elapsedMs: number): void {
    const writes = this.metricsState.persistenceWrites + this.metricsState.commitFailures;
    this.metricsState.persistenceLatencyMs =
      (this.metricsState.persistenceLatencyMs * Math.max(0, writes - 1) + elapsedMs) /
      Math.max(1, writes);
    this.metricsState.maxPersistenceLatencyMs = Math.max(
      this.metricsState.maxPersistenceLatencyMs,
      elapsedMs,
    );
  }

  private eventMetrics(): Pick<
    FpsServiceMetrics,
    | "acceptedShots"
    | "rejectedShots"
    | "hitEvents"
    | "deaths"
    | "respawns"
    | "terminalMatches"
    | "terminalScoreEvents"
    | "kickedPlayers"
  > {
    const counts = {
      acceptedShots: 0,
      rejectedShots: 0,
      hitEvents: 0,
      deaths: 0,
      respawns: 0,
      terminalMatches: 0,
      terminalScoreEvents: 0,
      kickedPlayers: 0,
    };
    for (const match of this.matches.values()) {
      for (const record of match.getEventRecords()) {
        switch (record.event.kind) {
          case "shot_fired":
            counts.acceptedShots += 1;
            break;
          case "shot_rejected":
            counts.rejectedShots += 1;
            break;
          case "hit_confirmed":
            counts.hitEvents += 1;
            break;
          case "player_died":
            counts.deaths += 1;
            break;
          case "player_respawned":
            counts.respawns += 1;
            break;
          case "match_ended":
            counts.terminalMatches += 1;
            break;
          case "score_updated":
            counts.terminalScoreEvents += 1;
            break;
          case "player_kicked":
            counts.kickedPlayers += 1;
            break;
          default:
            break;
        }
      }
    }
    return counts;
  }

  private responseFor(match: FpsMatch, playerId: string, ticket: string): FpsRoomCreateResponse {
    return {
      roomId: match.roomId,
      matchId: match.matchId,
      playerId,
      ticket,
      phase: match.getState().phase,
      snapshot: match.getSnapshot(playerId, true, 0),
    };
  }

  private requestKey(
    request: Pick<FpsJournalRequest, "matchId" | "playerId" | "requestId" | "kind">,
  ): string {
    return `${request.matchId}|${request.playerId}|${request.kind}|${request.requestId}`;
  }

  private saveRequest(
    request: Pick<FpsJournalRequest, "matchId" | "playerId" | "requestId" | "kind">,
    snapshot: FpsSnapshot,
  ): void {
    const journalRequest: FpsJournalRequest = {
      ...request,
      responseJson: JSON.stringify(snapshot),
    };
    this.requestReceipts.set(this.requestKey(request), snapshot);
    this.journal.saveRequest(journalRequest);
  }

  private requireMatch(matchId: string): FpsMatch {
    const match = this.matches.get(matchId);
    if (match === undefined)
      throw new FpsServiceError("unknown_match", "FPS match was not found", {}, 404);
    return match;
  }

  private authenticate(
    matchId: string,
    playerId: string,
    ticket: string,
    allowEmptyPlayer = false,
  ): FpsSession {
    const session = this.sessions.get(hashTicket(ticket));
    if (session === undefined) {
      throw new FpsServiceError(
        "invalid_ticket",
        "The FPS ticket does not authorize this player",
        {},
        403,
      );
    }
    if (session.matchId !== matchId || (!allowEmptyPlayer && session.playerId !== playerId)) {
      throw new FpsServiceError(
        allowEmptyPlayer
          ? "invalid_ticket"
          : session.playerId === playerId
            ? "invalid_ticket"
            : "cross_player_message",
        "The FPS ticket does not authorize this player",
        {},
        403,
      );
    }
    if (!ticketsEqual(session.ticketHash, hashTicket(ticket))) {
      throw new FpsServiceError("invalid_ticket", "The FPS ticket is invalid", {}, 403);
    }
    if (session.revoked) {
      throw new FpsServiceError("invalid_ticket", "The FPS ticket has been revoked", {}, 403);
    }
    if (session.expiresAtMs > 0 && this.now() >= session.expiresAtMs) {
      throw new FpsServiceError("ticket_expired", "The FPS ticket has expired", {}, 403);
    }
    return session;
  }

  private mapMatchError(caught: unknown): FpsServiceError {
    const reason = caught instanceof Error ? caught.message : "invalid_request";
    const code: FpsServiceErrorCode =
      reason === "match_not_ready" || reason === "at_least_two_players_required"
        ? "match_not_ready"
        : reason === "unknown_player"
          ? "unknown_player"
          : "invalid_request";
    return new FpsServiceError(code, `FPS match request failed: ${reason}`, { reason }, 409);
  }
}
