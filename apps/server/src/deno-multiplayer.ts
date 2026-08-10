import {
  canonicalJson,
  createGameEngine,
  projectPublicEventStream,
  reduceGameEvent,
  type CreateGameCommand,
  type GameEngine,
  type GameEvent,
  type GameState,
  type PlayerObservation,
  type PublicGameEvent,
} from "@hk-mahjong/core";
import { createBotPolicy, type BotPolicy } from "@hk-mahjong/bots";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  listBundledRulesets,
  resolveRuleset,
  toCoreGameRules,
  type ResolvedRuleset,
} from "@hk-mahjong/hk-rules";
import {
  actionSubmissionSchema,
  agentProtocolEnvelopeSchema,
  createProtocolEnvelope,
  hostProtocolEnvelopeSchema,
  playerObservationSchema,
  ProtocolSequenceValidator,
  protocolErrorSchema,
  publicGameEventSchema,
  replayResponseSchema,
  roomCreateRequestSchema,
  roomJoinRequestSchema,
  roomRulesetSummarySchema,
  type ActionSource,
  type FallbackActionMetadata,
  type RoomCreateRequest,
  type RoomDisconnectPolicy,
  type RoomFillPolicy,
  type RoomInspectionResponse,
  type RoomJoinRequest,
  type RoomJoinResponse,
  type RoomCreateResponse,
  type RoomRulesetSummary,
  type RoomStartResponse,
  type RoomStatus,
} from "@hk-mahjong/protocol";
import {
  DenoKvCommitNotifier,
  DenoKvPersistenceRepository,
  type DenoKvCommitNotification,
  type DenoKvLike,
} from "../../../packages/persistence/src/deno-kv.js";
import type {
  CommandReceipt,
  GameKey,
  GameSessionConfigurationV1,
  JsonObject,
} from "../../../packages/persistence/src/types.js";
import {
  PersistenceConflictError,
  PersistenceError,
  PersistenceNotFoundError,
  PersistenceValidationError,
} from "../../../packages/persistence/src/errors.js";
import type * as z from "zod";

const WINDS = ["east", "south", "west", "north"] as const;
const MAIN_BRANCH_ID = "main" as const;
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_MALFORMED_RESPONSE_LIMIT = 3;
const DEFAULT_DELIVERY_WINDOW = 512;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const MAX_FRAME_BYTES = 64 * 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4183",
  "http://localhost:4183",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://127.0.0.1:5173",
  "https://localhost:5173",
  "http://127.0.0.1:8000",
  "http://localhost:8000",
] as const;

type Seat = (typeof WINDS)[number];
type Controller = "human" | "bot";
type BotDifficulty = "novice" | "basic" | "intermediate" | "advanced";
type BotPersonality = "fast" | "value" | "balanced";
type DenoProtocolHostMessage = z.output<typeof hostProtocolEnvelopeSchema>;

interface DenoRoomMember {
  readonly roomId: string;
  readonly playerId: string;
  readonly displayName: string;
  readonly seat: Seat;
  readonly controller: Controller;
  readonly ticketHash: string | null;
  readonly ticketExpiresAt: number | null;
  readonly owner: boolean;
  readonly botDifficulty: BotDifficulty | null;
  readonly botPersonality: BotPersonality | null;
}

interface DenoRoomRecord {
  readonly roomId: string;
  readonly status: RoomStatus;
  readonly rulesetId: string;
  readonly rulesetVersion: string;
  readonly rulesetHash: string;
  readonly rulesetDefinition: JsonObject;
  readonly matchLength: "one_wind" | "full_four_winds";
  readonly seed: string;
  readonly fillPolicy: RoomFillPolicy;
  readonly disconnectPolicy: RoomDisconnectPolicy;
  readonly ownerPlayerId: string;
  readonly gameId: string | null;
  readonly startRequestId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DenoRoom extends DenoRoomRecord {
  readonly members: readonly DenoRoomMember[];
}

interface DenoActionReceipt {
  readonly gameId: string;
  readonly branchId: string;
  readonly requestId: string;
  readonly playerId: string;
  readonly expectedRevision: number;
  readonly actionId: string;
  readonly startRevision: number;
  readonly endRevision: number;
  readonly stateHash: string;
  readonly createdAt: string;
  readonly source: ActionSource;
  readonly fallback: FallbackActionMetadata | null;
}

export interface DenoPendingAction {
  readonly gameId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly deadlineAt: string;
  readonly pausedAt: string | null;
  readonly remainingMs: number | null;
}

const roomKey = (roomId: string): readonly unknown[] => ["room", roomId];
const memberKey = (roomId: string, playerId: string): readonly unknown[] => [
  "room",
  roomId,
  "member",
  playerId,
];
const memberPrefix = (roomId: string): readonly unknown[] => ["room", roomId, "member"];
const actionReceiptKey = (
  gameId: string,
  branchId: string,
  requestId: string,
): readonly unknown[] => ["multiplayer", "receipt", gameId, branchId, requestId];
const pendingActionKey = (
  gameId: string,
  branchId: string,
  playerId: string,
): readonly unknown[] => ["multiplayer", "pending", gameId, branchId, playerId];

const asJsonObject = (value: unknown, label: string): JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as JsonObject;
};

const clone = <T>(value: T): T => structuredClone(value);

const isoNow = (clock: () => Date): string => clock().toISOString();

const memberAtSeat = (room: DenoRoom, seat: Seat): DenoRoomMember | null =>
  room.members.find((member) => member.seat === seat) ?? null;

const sortMembers = (members: readonly DenoRoomMember[]): readonly DenoRoomMember[] =>
  [...members].sort((left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat));

const firstAvailableSeat = (room: DenoRoom, preferredSeat?: Seat): Seat | null => {
  if (preferredSeat !== undefined && memberAtSeat(room, preferredSeat) === null) {
    return preferredSeat;
  }
  return WINDS.find((seat) => memberAtSeat(room, seat) === null) ?? null;
};

const roomRulesetSummary = (ruleset: ResolvedRuleset): RoomRulesetSummary => {
  const bundled = listBundledRulesets().find(({ id }) => id === ruleset.definition.id);
  return (
    bundled ?? {
      id: ruleset.definition.id,
      version: ruleset.definition.version,
      hash: ruleset.hash,
      displayName: ruleset.definition.displayName,
      description: ruleset.definition.description,
      disclaimer: ruleset.definition.disclaimer,
      minimumFaan: ruleset.definition.winRules.minimumFaan,
      capFaan: ruleset.definition.winRules.capFaan,
      bonusTilesEnabled: ruleset.definition.tileSet.bonusTilesEnabled,
    }
  );
};

/** Async KV room metadata and multiplayer receipt store. No socket or game state is cached here. */
export class DenoKvRoomStore {
  public constructor(
    private readonly kv: DenoKvLike,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async createRoom(room: DenoRoomRecord, members: readonly DenoRoomMember[]): Promise<void> {
    const operation = this.kv.atomic().check({ key: roomKey(room.roomId), versionstamp: null });
    operation.set(roomKey(room.roomId), clone(room));
    for (const member of members) {
      operation.set(memberKey(room.roomId, member.playerId), clone(member));
    }
    const committed = await operation.commit();
    if (!committed.ok) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room ID already exists",
        { reason: "room_conflict" },
        409,
      );
    }
  }

  public async getRoom(roomId: string): Promise<DenoRoom | null> {
    const entry = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
    if (entry.value === null) {
      return null;
    }
    const members: DenoRoomMember[] = [];
    for await (const memberEntry of this.kv.list<DenoRoomMember>({
      prefix: memberPrefix(roomId),
    })) {
      if (memberEntry.value !== null) {
        members.push(clone(memberEntry.value));
      }
    }
    return { ...clone(entry.value), members: sortMembers(members) };
  }

  public async getRoomByGameId(gameId: string): Promise<DenoRoom | null> {
    for await (const entry of this.kv.list<DenoRoomRecord>({ prefix: ["room"] })) {
      if (entry.value?.gameId === gameId) {
        return this.getRoom(entry.value.roomId);
      }
    }
    return null;
  }

  public async addMember(member: DenoRoomMember, startRequestId?: string): Promise<void> {
    const entry = await this.kv.get<DenoRoomRecord>(roomKey(member.roomId));
    if (entry.value === null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room was not found",
        { reason: "room_not_found" },
        404,
      );
    }
    const room = await this.getRoom(member.roomId);
    if (room === null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room was not found",
        { reason: "room_not_found" },
        404,
      );
    }
    if (
      room.gameId !== null ||
      (room.startRequestId !== null && room.startRequestId !== startRequestId) ||
      (room.status !== "waiting" && room.status !== "ready")
    ) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room is not accepting joins",
        { reason: "room_already_started" },
        409,
      );
    }
    if (room.members.length >= WINDS.length || memberAtSeat(room, member.seat) !== null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The requested seat is occupied",
        { reason: "room_full" },
        409,
      );
    }
    const updated: DenoRoomRecord = { ...room, updatedAt: isoNow(this.clock) };
    const operation = this.kv
      .atomic()
      .check({ key: roomKey(member.roomId), versionstamp: entry.versionstamp });
    operation
      .set(roomKey(member.roomId), updated)
      .set(memberKey(member.roomId, member.playerId), clone(member));
    const committed = await operation.commit();
    if (!committed.ok) {
      const current = await this.getRoom(member.roomId);
      if (current === null) {
        throw new DenoMultiplayerServiceError(
          "invalid_request",
          "Room was not found",
          { reason: "room_not_found" },
          404,
        );
      }
      if (
        current.gameId !== null ||
        (current.startRequestId !== null && current.startRequestId !== startRequestId) ||
        (current.status !== "waiting" && current.status !== "ready")
      ) {
        throw new DenoMultiplayerServiceError(
          "invalid_request",
          "The room is not accepting joins",
          { reason: "room_already_started" },
          409,
        );
      }
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room membership changed; retry the join",
        { reason: "seat_taken" },
        409,
      );
    }
  }

  public async claimStart(roomId: string, requestId: string): Promise<boolean> {
    const entry = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
    if (entry.value === null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room was not found",
        { reason: "room_not_found" },
        404,
      );
    }
    if (entry.value.gameId !== null && entry.value.startRequestId === requestId) {
      return true;
    }
    if (entry.value.gameId !== null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room has already started",
        { reason: "room_already_started" },
        409,
      );
    }
    if (entry.value.status !== "waiting" && entry.value.status !== "ready") {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room is not ready to start",
        { reason: "room_not_ready" },
        409,
      );
    }
    if (entry.value.startRequestId !== null && entry.value.startRequestId !== requestId) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room has already accepted a start request",
        { reason: "room_already_started" },
        409,
      );
    }
    if (entry.value.startRequestId === requestId) {
      return false;
    }
    const updated: DenoRoomRecord = {
      ...entry.value,
      startRequestId: requestId,
      updatedAt: isoNow(this.clock),
    };
    const operation = this.kv
      .atomic()
      .check({ key: roomKey(roomId), versionstamp: entry.versionstamp })
      .set(roomKey(roomId), updated);
    if (!(await operation.commit()).ok) {
      const current = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
      if (current.value?.startRequestId === requestId) {
        return false;
      }
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room start compare-and-set failed",
        { reason: "room_start_conflict" },
        409,
      );
    }
    return false;
  }

  public async closeWaitingRoom(roomId: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
      if (entry.value === null) {
        return false;
      }
      if (
        entry.value.gameId !== null ||
        entry.value.startRequestId !== null ||
        (entry.value.status !== "waiting" && entry.value.status !== "ready")
      ) {
        return false;
      }
      const updated: DenoRoomRecord = {
        ...entry.value,
        status: "closed",
        updatedAt: isoNow(this.clock),
      };
      const operation = this.kv
        .atomic()
        .check({ key: roomKey(roomId), versionstamp: entry.versionstamp })
        .set(roomKey(roomId), updated);
      if ((await operation.commit()).ok) {
        return true;
      }
    }
    throw new DenoMultiplayerServiceError(
      "persistence_failure",
      "Room close compare-and-set failed",
      { reason: "room_close_conflict" },
      503,
    );
  }

  public async markReady(roomId: string, requestId: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
      if (entry.value === null) {
        throw new DenoMultiplayerServiceError(
          "invalid_request",
          "Room was not found",
          { reason: "room_not_found" },
          404,
        );
      }
      if (entry.value.gameId !== null && entry.value.startRequestId === requestId) {
        return;
      }
      if (
        entry.value.gameId !== null ||
        entry.value.startRequestId !== requestId ||
        (entry.value.status !== "waiting" && entry.value.status !== "ready")
      ) {
        throw new DenoMultiplayerServiceError(
          "persistence_failure",
          "Room ready compare-and-set failed",
          { reason: "room_ready_conflict" },
          503,
        );
      }
      if (entry.value.status === "ready") {
        return;
      }
      const updated: DenoRoomRecord = {
        ...entry.value,
        status: "ready",
        updatedAt: isoNow(this.clock),
      };
      const operation = this.kv
        .atomic()
        .check({ key: roomKey(roomId), versionstamp: entry.versionstamp })
        .set(roomKey(roomId), updated);
      if ((await operation.commit()).ok) {
        return;
      }
    }
    throw new DenoMultiplayerServiceError(
      "persistence_failure",
      "Room ready compare-and-set failed",
      { reason: "room_ready_conflict" },
      503,
    );
  }

  public async markStarted(roomId: string, gameId: string, requestId: string): Promise<void> {
    const entry = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
    if (entry.value === null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room was not found",
        { reason: "room_not_found" },
        404,
      );
    }
    if (entry.value.gameId === gameId && entry.value.startRequestId === requestId) {
      return;
    }
    if (entry.value.gameId !== null) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room has already started",
        { reason: "room_already_started" },
        409,
      );
    }
    if (entry.value.status !== "waiting" && entry.value.status !== "ready") {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "The room is not ready to start",
        { reason: "room_not_ready" },
        409,
      );
    }
    const updated: DenoRoomRecord = {
      ...entry.value,
      status: "active",
      gameId,
      startRequestId: requestId,
      updatedAt: isoNow(this.clock),
    };
    const operation = this.kv
      .atomic()
      .check({ key: roomKey(roomId), versionstamp: entry.versionstamp });
    operation.set(roomKey(roomId), updated);
    if (!(await operation.commit()).ok) {
      throw new DenoMultiplayerServiceError(
        "invalid_request",
        "Room start lost a compare-and-set race",
        { reason: "room_start_conflict" },
        409,
      );
    }
  }

  public async setStatus(roomId: string, status: RoomStatus): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await this.kv.get<DenoRoomRecord>(roomKey(roomId));
      if (entry.value === null) {
        return;
      }
      const updated: DenoRoomRecord = { ...entry.value, status, updatedAt: isoNow(this.clock) };
      const operation = this.kv
        .atomic()
        .check({ key: roomKey(roomId), versionstamp: entry.versionstamp })
        .set(roomKey(roomId), updated);
      if ((await operation.commit()).ok) {
        return;
      }
    }
    throw new DenoMultiplayerServiceError(
      "persistence_failure",
      "Room status compare-and-set failed",
      { reason: "room_status_conflict" },
      503,
    );
  }

  public async getMember(roomId: string, playerId: string): Promise<DenoRoomMember | null> {
    const entry = await this.kv.get<DenoRoomMember>(memberKey(roomId, playerId));
    return entry.value === null ? null : clone(entry.value);
  }

  public async getMemberForTicket(
    roomId: string,
    ticketHash: string,
    now: number,
  ): Promise<DenoRoomMember | null> {
    for await (const entry of this.kv.list<DenoRoomMember>({ prefix: memberPrefix(roomId) })) {
      const member = entry.value;
      if (member?.ticketHash !== ticketHash) {
        continue;
      }
      if (member.ticketExpiresAt !== null && member.ticketExpiresAt <= now) {
        return null;
      }
      return clone(member);
    }
    return null;
  }

  public async getActionReceipt(
    gameId: string,
    branchId: string,
    requestId: string,
  ): Promise<DenoActionReceipt | null> {
    const entry = await this.kv.get<DenoActionReceipt>(
      actionReceiptKey(gameId, branchId, requestId),
    );
    return entry.value === null ? null : clone(entry.value);
  }

  public async saveActionReceipt(receipt: DenoActionReceipt): Promise<void> {
    const key = actionReceiptKey(receipt.gameId, receipt.branchId, receipt.requestId);
    const entry = await this.kv.get<DenoActionReceipt>(key);
    if (entry.value !== null) {
      return;
    }
    const operation = this.kv.atomic().check({ key, versionstamp: null }).set(key, clone(receipt));
    await operation.commit();
  }

  public async getPendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
  ): Promise<DenoPendingAction | null> {
    const entry = await this.kv.get<DenoPendingAction>(
      pendingActionKey(gameId, branchId, playerId),
    );
    return entry.value === null ? null : clone(entry.value);
  }

  public async savePendingAction(action: DenoPendingAction): Promise<void> {
    await this.kv
      .atomic()
      .set(pendingActionKey(action.gameId, action.branchId, action.playerId), clone(action))
      .commit();
  }

  public async clearPendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    requestId?: string,
  ): Promise<void> {
    const key = pendingActionKey(gameId, branchId, playerId);
    const entry = await this.kv.get<DenoPendingAction>(key);
    if (entry.value === null || (requestId !== undefined && entry.value.requestId !== requestId)) {
      return;
    }
    const committed = await this.kv
      .atomic()
      .check({ key, versionstamp: entry.versionstamp })
      .delete(key)
      .commit();
    if (!committed.ok && requestId !== undefined) {
      // A newer request won the race; never delete its durable deadline.
      const current = await this.kv.get<DenoPendingAction>(key);
      if (current.value?.requestId === requestId) {
        throw new DenoMultiplayerServiceError(
          "persistence_failure",
          "Pending action compare-and-set failed",
          { reason: "pending_action_conflict" },
          503,
        );
      }
    }
  }

  public async pausePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    pausedAt: string,
  ): Promise<void> {
    const key = pendingActionKey(gameId, branchId, playerId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await this.kv.get<DenoPendingAction>(key);
      const pending = entry.value;
      if (pending?.pausedAt !== null) {
        return;
      }
      const updated: DenoPendingAction = {
        ...pending,
        pausedAt,
        remainingMs: Math.max(0, Date.parse(pending.deadlineAt) - Date.parse(pausedAt)),
      };
      const committed = await this.kv
        .atomic()
        .check({ key, versionstamp: entry.versionstamp })
        .set(key, updated)
        .commit();
      if (committed.ok) {
        return;
      }
    }
    throw new DenoMultiplayerServiceError(
      "persistence_failure",
      "Pending action pause compare-and-set failed",
      { reason: "pending_action_conflict" },
      503,
    );
  }

  public async resumePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    resumedAt: string,
  ): Promise<DenoPendingAction | null> {
    const key = pendingActionKey(gameId, branchId, playerId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await this.kv.get<DenoPendingAction>(key);
      const pending = entry.value;
      if (pending?.pausedAt === null) {
        return pending;
      }
      if (pending === null) {
        return null;
      }
      const resumed: DenoPendingAction = {
        ...pending,
        deadlineAt: new Date(Date.parse(resumedAt) + (pending.remainingMs ?? 0)).toISOString(),
        pausedAt: null,
        remainingMs: null,
      };
      const committed = await this.kv
        .atomic()
        .check({ key, versionstamp: entry.versionstamp })
        .set(key, resumed)
        .commit();
      if (committed.ok) {
        return resumed;
      }
    }
    throw new DenoMultiplayerServiceError(
      "persistence_failure",
      "Pending action resume compare-and-set failed",
      { reason: "pending_action_conflict" },
      503,
    );
  }
}

const digestTicket = async (ticket: string): Promise<string> => {
  const bytes = new TextEncoder().encode(ticket);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
};

const randomTicket = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return `v1.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
};

const requireTicketEntropy = (ticket: string): string => {
  if (new TextEncoder().encode(ticket).byteLength < 16) {
    throw new Error("Ticket factory returned less than 128 bits of ticket material");
  }
  return ticket;
};

const publicObservation = (
  observation: PlayerObservation,
): z.output<typeof playerObservationSchema> => playerObservationSchema.parse(observation);

const publicEvent = (event: PublicGameEvent): z.output<typeof publicGameEventSchema> =>
  publicGameEventSchema.parse(event);

const sessionConfiguration = (members: readonly DenoRoomMember[]): GameSessionConfigurationV1 => ({
  schemaVersion: 1,
  bots: members
    .filter(({ controller }) => controller === "bot")
    .map((member) => ({
      playerId: member.playerId,
      difficulty: member.botDifficulty ?? "basic",
      personality: member.botPersonality ?? "balanced",
    })),
  coach: { enabled: false, provider: "templates", verbosity: "normal" },
});

const isTerminalStatus = (status: RoomStatus): boolean =>
  status === "match_ended" || status === "closed";

export interface DenoMultiplayerServiceOptions {
  readonly kv: DenoKvLike;
  readonly roomStore?: DenoKvRoomStore;
  readonly notifier?: DenoKvCommitNotifier;
  readonly repository?: DenoKvPersistenceRepository;
  readonly clock?: () => Date;
  readonly retentionMs?: number;
  readonly actionTimeoutMs?: number;
  readonly malformedResponseLimit?: number;
  readonly deliveryWindow?: number;
  readonly rateLimitPerMinute?: number;
  readonly allowedOrigins?: readonly string[];
  readonly roomIdFactory?: () => string;
  readonly playerIdFactory?: () => string;
  readonly ticketFactory?: () => string;
}

export interface DenoSubmitActionInput {
  readonly gameId: string;
  readonly ticket?: string;
  readonly playerId: string;
  readonly branchId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
  readonly actionId: string;
  readonly source?: ActionSource;
  readonly fallback?: FallbackActionMetadata;
}

export interface DenoSubmitActionResult {
  readonly accepted: true;
  readonly idempotent: boolean;
  readonly key: GameKey;
  readonly playerId: string;
  readonly requestId: string;
  readonly actionId: string;
  readonly startRevision: number;
  readonly endRevision: number;
  readonly observation: z.output<typeof playerObservationSchema>;
  readonly publicEvents: readonly z.output<typeof publicGameEventSchema>[];
  readonly state: GameState;
  readonly source: ActionSource;
  readonly fallback: FallbackActionMetadata | null;
}

export class DenoMultiplayerServiceError extends Error {
  public constructor(
    public readonly code: z.output<typeof protocolErrorSchema>["code"],
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "DenoMultiplayerServiceError";
  }

  public get payload(): z.output<typeof protocolErrorSchema> {
    return protocolErrorSchema.parse({
      code: this.code,
      message: this.message,
      details: this.details,
    });
  }
}

const fail = (
  code: z.output<typeof protocolErrorSchema>["code"],
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  statusCode = 400,
): never => {
  throw new DenoMultiplayerServiceError(code, message, details, statusCode);
};

const ruleSummaryFromRoom = (room: DenoRoom): RoomRulesetSummary =>
  roomRulesetSummarySchema.parse({
    id: room.rulesetId,
    version: room.rulesetVersion,
    hash: room.rulesetHash,
    ...(() => {
      const definition = room.rulesetDefinition as unknown as {
        displayName?: string;
        description?: string;
        disclaimer?: string;
        winRules?: { minimumFaan?: number; capFaan?: number };
        tileSet?: { bonusTilesEnabled?: boolean };
      };
      return {
        displayName: definition.displayName ?? room.rulesetId,
        description: definition.description ?? "Historical room ruleset",
        disclaimer: definition.disclaimer ?? "",
        minimumFaan: definition.winRules?.minimumFaan ?? 0,
        capFaan: definition.winRules?.capFaan ?? 13,
        bonusTilesEnabled: definition.tileSet?.bonusTilesEnabled ?? false,
      };
    })(),
  });

export class DenoMultiplayerService {
  public readonly actionTimeoutMs: number;
  public readonly malformedResponseLimit: number;
  public readonly deliveryWindow: number;
  public readonly rateLimitPerMinute: number;
  public readonly allowedOrigins: readonly string[];
  public readonly repository: DenoKvPersistenceRepository;
  public readonly roomStore: DenoKvRoomStore;
  public readonly notifier: DenoKvCommitNotifier;
  private readonly clock: () => Date;
  private readonly retentionMs: number;
  private readonly roomIdFactory: () => string;
  private readonly playerIdFactory: () => string;
  private readonly ticketFactory: () => string;
  private readonly engines = new Map<string, GameEngine>();
  private readonly botPolicies = new Map<string, BotPolicy>();
  private readonly ownsRepository: boolean;
  private readonly ownsRoomStore: boolean;

  public constructor(options: DenoMultiplayerServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    this.actionTimeoutMs = options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
    this.malformedResponseLimit =
      options.malformedResponseLimit ?? DEFAULT_MALFORMED_RESPONSE_LIMIT;
    this.deliveryWindow = options.deliveryWindow ?? DEFAULT_DELIVERY_WINDOW;
    this.rateLimitPerMinute = options.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
    this.allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
    this.roomIdFactory =
      options.roomIdFactory ?? (() => `room_${crypto.randomUUID().replaceAll("-", "")}`);
    this.playerIdFactory =
      options.playerIdFactory ?? (() => `p_${crypto.randomUUID().replaceAll("-", "")}`);
    this.ticketFactory = options.ticketFactory ?? randomTicket;
    this.roomStore = options.roomStore ?? new DenoKvRoomStore(options.kv, this.clock);
    this.ownsRoomStore = options.roomStore === undefined;
    this.notifier = options.notifier ?? new DenoKvCommitNotifier(options.kv);
    this.repository =
      options.repository ??
      new DenoKvPersistenceRepository({
        kv: options.kv,
        reducer: reduceGameEvent,
        validateRulesetDefinition: (definition) => {
          const resolved = resolveRuleset(definition);
          return { definition: resolved.definition, hash: resolved.hash };
        },
        clock: () => isoNow(this.clock),
        commitNotificationPrefix: this.notifier.prefix,
      });
    this.ownsRepository = options.repository === undefined;
  }

  public close(): void {
    if (this.ownsRepository || this.ownsRoomStore) {
      this.repository.close();
    }
  }

  public listRulesets(): readonly RoomRulesetSummary[] {
    return listBundledRulesets();
  }

  public async createRoom(request: RoomCreateRequest): Promise<RoomCreateResponse> {
    const input = roomCreateRequestSchema.parse(request);
    let ruleset: ResolvedRuleset;
    try {
      ruleset = getBundledRuleset(input.rulesetId);
    } catch {
      return fail("invalid_request", "The requested ruleset is unavailable", {
        reason: "ruleset_invalid",
        rulesetId: input.rulesetId,
      });
    }
    const roomId = this.requireFactoryId(this.roomIdFactory(), "Room");
    const playerId = this.requireFactoryId(this.playerIdFactory(), "Player");
    const ticket = requireTicketEntropy(this.ticketFactory());
    const now = isoNow(this.clock);
    const member: DenoRoomMember = {
      roomId,
      playerId,
      displayName: input.displayName,
      seat: input.preferredSeat ?? "east",
      controller: "human",
      ticketHash: await digestTicket(ticket),
      ticketExpiresAt: Date.parse(now) + this.retentionMs,
      owner: true,
      botDifficulty: null,
      botPersonality: null,
    };
    const room: DenoRoomRecord = {
      roomId,
      status: "waiting",
      rulesetId: ruleset.definition.id,
      rulesetVersion: ruleset.definition.version,
      rulesetHash: ruleset.hash,
      rulesetDefinition: asJsonObject(clone(ruleset.definition), "Ruleset definition"),
      matchLength: input.matchLength,
      seed: input.seed,
      fillPolicy: input.fillPolicy,
      disconnectPolicy: input.disconnectPolicy,
      ownerPlayerId: playerId,
      gameId: null,
      startRequestId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.roomStore.createRoom(room, [member]);
    return {
      roomId,
      status: room.status,
      playerId,
      seat: member.seat,
      ticket,
      ruleset: roomRulesetSummary(ruleset),
    };
  }

  public async joinRoom(
    roomId: string,
    request: RoomJoinRequest,
    existingTicket?: string,
  ): Promise<RoomJoinResponse> {
    const input = roomJoinRequestSchema.parse(request);
    const room = await this.requireRoom(roomId);
    if (existingTicket !== undefined) {
      if (room.status === "closed") {
        return fail(
          "invalid_request",
          "The room is closed and cannot be reconnected",
          { reason: "room_closed" },
          409,
        );
      }
      const member = await this.authenticateMember(room, existingTicket);
      return {
        roomId,
        status: room.status,
        playerId: member.playerId,
        seat: member.seat,
        ticket: existingTicket,
      };
    }
    if (
      room.gameId !== null ||
      room.startRequestId !== null ||
      (room.status !== "waiting" && room.status !== "ready")
    ) {
      return fail(
        "invalid_request",
        "The room has already started",
        { reason: "room_already_started" },
        409,
      );
    }
    const seat = firstAvailableSeat(room, input.preferredSeat);
    if (seat === null) {
      return fail("invalid_request", "The room has no open seats", { reason: "room_full" }, 409);
    }
    const playerId = this.requireFactoryId(this.playerIdFactory(), "Player");
    const ticket = requireTicketEntropy(this.ticketFactory());
    const now = isoNow(this.clock);
    await this.roomStore.addMember({
      roomId,
      playerId,
      displayName: input.displayName,
      seat,
      controller: "human",
      ticketHash: await digestTicket(ticket),
      ticketExpiresAt: Date.parse(now) + this.retentionMs,
      owner: false,
      botDifficulty: null,
      botPersonality: null,
    });
    const updated = await this.requireRoom(roomId);
    return {
      roomId,
      status: updated.status,
      playerId,
      seat,
      ticket,
    };
  }

  public async inspectRoom(roomId: string): Promise<RoomInspectionResponse> {
    const room = await this.requireRoom(roomId);
    return {
      roomId: room.roomId,
      status: room.status,
      ruleset: ruleSummaryFromRoom(room),
      matchLength: room.matchLength,
      fillPolicy: room.fillPolicy,
      disconnectPolicy: room.disconnectPolicy,
      occupiedSeats: room.members.map(({ seat }) => seat),
      acceptingJoins:
        room.members.length < WINDS.length &&
        room.gameId === null &&
        room.startRequestId === null &&
        (room.status === "waiting" || room.status === "ready"),
      gameId: room.gameId,
    };
  }

  /** Closes a waiting room at the owner's request without creating a game. */
  public async closeRoom(roomId: string, ownerTicket: string): Promise<RoomInspectionResponse> {
    const room = await this.requireRoom(roomId);
    const owner = await this.authenticateMember(room, ownerTicket);
    if (!owner.owner) {
      return fail(
        "invalid_request",
        "Only the room owner can close the room",
        { reason: "owner_required" },
        401,
      );
    }
    if (
      room.gameId !== null ||
      room.startRequestId !== null ||
      (room.status !== "waiting" && room.status !== "ready")
    ) {
      return fail(
        "invalid_request",
        "Only a waiting room can be closed",
        { reason: "room_already_started" },
        409,
      );
    }
    if (!(await this.roomStore.closeWaitingRoom(roomId))) {
      const current = await this.requireRoom(roomId);
      if (
        current.gameId !== null ||
        current.startRequestId !== null ||
        (current.status !== "waiting" && current.status !== "ready")
      ) {
        return fail(
          "invalid_request",
          "Only a waiting room can be closed",
          { reason: "room_already_started" },
          409,
        );
      }
      return fail(
        "persistence_failure",
        "The room close compare-and-set failed",
        { reason: "room_close_conflict" },
        503,
      );
    }
    return this.inspectRoom(roomId);
  }

  public async startRoom(
    roomId: string,
    ownerTicket: string,
    requestId = `start:${roomId}`,
  ): Promise<RoomStartResponse> {
    const room = await this.requireRoom(roomId);
    const owner = await this.authenticateMember(room, ownerTicket);
    if (!owner.owner) {
      return fail(
        "invalid_request",
        "Only the room owner can start the room",
        { reason: "owner_required" },
        401,
      );
    }
    if (room.gameId !== null) {
      if (room.startRequestId === requestId) {
        return this.startResponse(await this.requireRoom(roomId), owner.playerId, ownerTicket);
      }
      return fail(
        "invalid_request",
        "The room has already started",
        { reason: "room_already_started" },
        409,
      );
    }
    if (room.status !== "waiting" && room.status !== "ready") {
      return fail(
        "invalid_request",
        "The room is not ready to start",
        { reason: "room_not_ready" },
        409,
      );
    }
    if (room.fillPolicy === "wait_for_four" && room.members.length !== WINDS.length) {
      return fail(
        "invalid_request",
        "Four human seats are required before starting",
        { reason: "room_not_ready" },
        409,
      );
    }
    if (await this.roomStore.claimStart(roomId, requestId)) {
      return this.startResponse(await this.requireRoom(roomId), owner.playerId, ownerTicket);
    }
    let current = room;
    if (current.fillPolicy === "fill_with_bots") {
      for (const seat of WINDS) {
        if (memberAtSeat(current, seat) !== null) {
          continue;
        }
        const bot: DenoRoomMember = {
          roomId,
          playerId: `bot:${room.roomId}:${seat}`,
          displayName: `Bot ${seat[0]!.toUpperCase()}${seat.slice(1)}`,
          seat,
          controller: "bot",
          ticketHash: null,
          ticketExpiresAt: null,
          owner: false,
          botDifficulty: "basic",
          botPersonality: "balanced",
        };
        try {
          await this.roomStore.addMember(bot, requestId);
        } catch (caught) {
          const latest = await this.requireRoom(roomId);
          if (memberAtSeat(latest, seat)?.playerId !== bot.playerId) {
            throw caught;
          }
        }
        current = await this.requireRoom(roomId);
      }
    }
    if (current.members.length !== WINDS.length) {
      return fail(
        "invalid_request",
        "The room has an incomplete seat assignment",
        { reason: "room_not_ready" },
        409,
      );
    }
    // `ready` means the owner has requested the start and every required seat is
    // present. The start reservation is already durable before this transition.
    await this.roomStore.markReady(roomId, requestId);
    current = await this.requireRoom(roomId);
    const ruleset = resolveRuleset(current.rulesetDefinition);
    const engine = this.engineForRuleset(ruleset);
    const players = WINDS.map((seat) => {
      const member = memberAtSeat(current, seat);
      if (member === null) {
        throw new DenoMultiplayerServiceError(
          "invalid_request",
          "The room has an incomplete seat assignment",
          { reason: "room_not_ready" },
          409,
        );
      }
      return {
        id: member.playerId,
        displayName: member.displayName,
        controller: member.controller,
        seat: member.seat,
        initialScore: 500,
      };
    }) as unknown as CreateGameCommand["players"];
    const created = engine.create({
      type: "create_game",
      requestId,
      branchId: MAIN_BRANCH_ID,
      seed: current.seed,
      mode: "competitive",
      matchLength: current.matchLength,
      rules: toCoreGameRules(ruleset),
      players,
    });
    if (!created.accepted) {
      return fail(created.error.code, created.error.message, created.error.details, 409);
    }
    const key = { gameId: created.state.gameId, branchId: MAIN_BRANCH_ID };
    try {
      await this.repository.appendAcceptedCommand({
        key,
        requestId,
        events: created.events,
        state: created.state,
        rulesetDefinition: current.rulesetDefinition,
        sessionConfiguration: sessionConfiguration(current.members),
        commitNotification: {
          notificationId: `${key.gameId}:${key.branchId}:${requestId}`,
          action: null,
        },
      });
      await this.roomStore.markStarted(roomId, key.gameId, requestId);
      await this.publishCommit(key, created.events);
      await this.advanceBotTurns(key.gameId);
    } catch (caught) {
      return this.persistenceFailure(caught);
    }
    return this.startResponse(await this.requireRoom(roomId), owner.playerId, ownerTicket);
  }

  public async getObservation(
    gameId: string,
    playerId: string,
    branchId: string,
    ticket: string,
  ): Promise<z.output<typeof playerObservationSchema>> {
    const context = await this.authenticateGame(gameId, branchId, playerId, ticket);
    return publicObservation(context.engine.observation(context.loaded.state, playerId));
  }

  public async getReplay(
    gameId: string,
    playerId: string,
    branchId: string,
    ticket: string,
  ): Promise<z.output<typeof replayResponseSchema>> {
    const context = await this.authenticateGame(gameId, branchId, playerId, ticket);
    const events = await this.publicEventsFor(context.key, 0, context.loaded.state.revision);
    return replayResponseSchema.parse({
      game: context.key,
      viewerPlayerId: playerId,
      events,
      terminalObservation: publicObservation(
        context.engine.observation(context.loaded.state, playerId),
      ),
      omniscientAvailable: false,
    });
  }

  public async publicEventsFor(
    key: GameKey,
    fromRevision: number,
    toRevision?: number,
  ): Promise<readonly z.output<typeof publicGameEventSchema>[]> {
    const stored = await this.repository.listEvents(key, 0, toRevision);
    const projected = projectPublicEventStream(stored.map(({ event }) => event));
    return projected
      .filter(
        ({ revision }) =>
          revision > fromRevision && (toRevision === undefined || revision <= toRevision),
      )
      .map(publicEvent);
  }

  public actionRequestId(
    gameId: string,
    branchId: string,
    revision: number,
    playerId: string,
  ): string {
    return `action:${gameId}:${branchId}:${String(revision)}:${playerId}`;
  }

  public async registerPendingAction(action: DenoPendingAction): Promise<void> {
    await this.roomStore.savePendingAction(action);
  }

  public async pendingActionFor(
    gameId: string,
    branchId: string,
    playerId: string,
  ): Promise<DenoPendingAction | null> {
    return this.roomStore.getPendingAction(gameId, branchId, playerId);
  }

  public async pausePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
  ): Promise<void> {
    await this.roomStore.pausePendingAction(gameId, branchId, playerId, isoNow(this.clock));
  }

  public async resumePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
  ): Promise<DenoPendingAction | null> {
    return this.roomStore.resumePendingAction(gameId, branchId, playerId, isoNow(this.clock));
  }

  public async submitAction(input: DenoSubmitActionInput): Promise<DenoSubmitActionResult> {
    if (input.ticket === undefined) {
      return fail(
        "invalid_request",
        "A room ticket is required",
        { reason: "invalid_ticket" },
        401,
      );
    }
    const context = await this.authenticateGame(
      input.gameId,
      input.branchId,
      input.playerId,
      input.ticket,
    );
    return this.applyAction(context, input);
  }

  public async submitTimeoutFallback(
    gameId: string,
    branchId: string,
    playerId: string,
    requestId: string,
    expectedRevision: number,
    deadline: string,
    reason: "action_timeout" | "disconnect_timeout",
  ): Promise<DenoSubmitActionResult | null> {
    const pending = await this.roomStore.getPendingAction(gameId, branchId, playerId);
    if (pending === null) {
      return null;
    }
    if (
      pending.requestId !== requestId ||
      pending.expectedRevision !== expectedRevision ||
      pending.deadlineAt !== deadline ||
      pending.pausedAt !== null ||
      Date.parse(pending.deadlineAt) > this.clock().getTime()
    ) {
      return null;
    }
    const room = await this.requireRoomByGame(gameId);
    const member = room.members.find(({ playerId: candidate }) => candidate === playerId);
    if (member === undefined) {
      return null;
    }
    if (member.ticketHash === null) {
      return null;
    }
    const loaded = await this.repository.loadGame({ gameId, branchId });
    const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
    const observation = engine.observation(loaded.state, playerId);
    const action = this.selectBotAction(member, observation, loaded.game.rulesetDefinition);
    if (action === null) {
      await this.roomStore.clearPendingAction(gameId, branchId, playerId, requestId);
      return null;
    }
    const ticket = this.ticketForMember(room.roomId, member);
    return this.applyAction(
      { room, member, key: { gameId, branchId }, loaded, engine },
      {
        gameId,
        playerId,
        branchId,
        expectedRevision,
        requestId,
        actionId: action,
        source: "timeout_fallback",
        fallback: { source: "timeout_fallback", reason, deadline, appliedAt: isoNow(this.clock) },
        ticket,
      },
    );
  }

  public async advanceBotTurns(
    gameId: string,
    maximumTurns = 64,
  ): Promise<readonly DenoSubmitActionResult[]> {
    const results: DenoSubmitActionResult[] = [];
    for (let turn = 0; turn < maximumTurns; turn += 1) {
      const room = await this.requireRoomByGame(gameId);
      if (isTerminalStatus(room.status)) {
        break;
      }
      const loaded = await this.repository.loadGame({ gameId, branchId: MAIN_BRANCH_ID });
      if (loaded.state.phase === "match_ended") {
        break;
      }
      const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
      let selected: { member: DenoRoomMember; actionId: string } | null = null;
      for (const member of room.members) {
        if (member.controller !== "bot") {
          continue;
        }
        const observation = engine.observation(loaded.state, member.playerId);
        const action = this.selectBotAction(member, observation, loaded.game.rulesetDefinition);
        if (action !== null) {
          selected = { member, actionId: action };
          break;
        }
      }
      if (selected === null) {
        break;
      }
      const result = await this.applyAction(
        {
          room,
          member: selected.member,
          key: { gameId, branchId: MAIN_BRANCH_ID },
          loaded,
          engine,
        },
        {
          gameId,
          playerId: selected.member.playerId,
          branchId: MAIN_BRANCH_ID,
          expectedRevision: loaded.state.revision,
          requestId: `bot:${gameId}:${String(loaded.state.revision)}:${selected.member.playerId}`,
          actionId: selected.actionId,
          source: "bot",
          ticket: this.ticketForMember(room.roomId, selected.member),
        },
      );
      results.push(result);
    }
    return results;
  }

  public allowsOrigin(origin: string | undefined): boolean {
    return origin === undefined || this.allowedOrigins.includes(origin);
  }

  /** Returns the authoritative server clock used for durable deadlines and retention checks. */
  public nowMs(): number {
    return this.clock().getTime();
  }

  public async requireRoomForSocket(gameId: string): Promise<DenoRoom | null> {
    return this.roomStore.getRoomByGameId(gameId);
  }

  public async authenticateGame(
    gameId: string,
    branchId: string,
    playerId: string,
    ticket: string,
  ): Promise<AuthenticatedDenoGameContext> {
    if (branchId !== MAIN_BRANCH_ID) {
      return fail(
        "invalid_request",
        "Only the main multiplayer branch is available",
        { reason: "branch_unavailable" },
        409,
      );
    }
    const room = await this.requireRoomByGame(gameId);
    if (room.status === "closed") {
      return fail(
        "invalid_request",
        "The room is closed and cannot be reconnected",
        { reason: "room_closed" },
        409,
      );
    }
    const member = await this.authenticateMember(room, ticket);
    if (member.playerId !== playerId) {
      return fail(
        "unknown_player",
        "The ticket does not belong to this player",
        { reason: "cross_player_message" },
        401,
      );
    }
    const key = { gameId, branchId };
    let loaded: Awaited<ReturnType<DenoKvPersistenceRepository["loadGame"]>>;
    try {
      loaded = await this.repository.loadGame(key);
    } catch (caught) {
      if (caught instanceof PersistenceNotFoundError) {
        return fail("unknown_game", "The game was not found", { reason: "unknown_game" }, 404);
      }
      return this.persistenceFailure(caught);
    }
    const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
    return { room, member, key, loaded, engine };
  }

  public async authenticateMember(room: DenoRoom, ticket: string): Promise<DenoRoomMember> {
    const member = await this.roomStore.getMemberForTicket(
      room.roomId,
      await digestTicket(ticket),
      this.clock().getTime(),
    );
    if (member === null) {
      return fail(
        "invalid_request",
        "The room ticket is invalid or expired",
        { reason: "invalid_ticket" },
        401,
      );
    }
    return member;
  }

  private async applyAction(
    context: AuthenticatedDenoGameContext,
    input: DenoSubmitActionInput,
  ): Promise<DenoSubmitActionResult> {
    if (context.room.status === "closed" || context.room.status === "match_ended") {
      return fail(
        "invalid_request",
        "The room is read-only",
        { reason: context.room.status === "closed" ? "room_closed" : "match_ended" },
        409,
      );
    }
    const source = input.source ?? "human";
    const fallback = input.fallback ?? null;
    if (source === "timeout_fallback" && fallback === null) {
      return fail("invalid_request", "Timeout fallback metadata is required", {
        reason: "fallback_metadata_missing",
      });
    }
    if (source !== "timeout_fallback" && fallback !== null) {
      return fail("invalid_request", "Fallback metadata is only valid for a timeout fallback", {
        reason: "fallback_metadata_unexpected",
      });
    }
    const action = actionSubmissionSchema.parse({
      playerId: input.playerId,
      branchId: input.branchId,
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      actionId: input.actionId,
    });
    const existing = await this.roomStore.getActionReceipt(
      context.key.gameId,
      context.key.branchId,
      action.requestId,
    );
    if (existing !== null) {
      if (
        existing.playerId !== action.playerId ||
        existing.expectedRevision !== action.expectedRevision ||
        existing.actionId !== action.actionId
      ) {
        return fail("duplicate_request", "The request ID is already bound to another action", {
          requestId: action.requestId,
        });
      }
      return this.idempotentResult(context, existing);
    }
    const durableReceipt = await this.repository.getCommandReceipt(context.key, action.requestId);
    if (durableReceipt !== null) {
      if (!(await this.durableReceiptMatches(context, durableReceipt, action))) {
        return fail("duplicate_request", "The request ID is already bound to another action", {
          requestId: action.requestId,
        });
      }
      const result = await this.resultFromReceipt(
        context,
        durableReceipt,
        action,
        source,
        fallback,
      );
      await this.roomStore.saveActionReceipt(result.receipt);
      return result.result;
    }
    if (context.loaded.state.revision !== action.expectedRevision) {
      return fail(
        "stale_revision",
        "The action revision is stale",
        {
          currentRevision: context.loaded.state.revision,
          stateHash: context.loaded.state.stateHash,
          observation: publicObservation(
            context.engine.observation(context.loaded.state, action.playerId),
          ),
        },
        409,
      );
    }
    const decided = context.engine.decide(context.loaded.state, {
      type: "submit_action",
      gameId: context.key.gameId,
      branchId: context.key.branchId,
      playerId: action.playerId,
      expectedRevision: action.expectedRevision,
      requestId: action.requestId,
      actionId: action.actionId,
    });
    if (!decided.accepted) {
      return fail(decided.error.code, decided.error.message, decided.error.details, 409);
    }
    try {
      const appended = await this.repository.appendAcceptedCommand({
        key: context.key,
        requestId: action.requestId,
        events: decided.events,
        state: decided.state,
        commitNotification: {
          notificationId: `${context.key.gameId}:${context.key.branchId}:${action.requestId}`,
          action: {
            requestId: action.requestId,
            playerId: action.playerId,
            actionId: action.actionId,
            source,
            fallback,
          },
        },
      });
      const receipt: DenoActionReceipt = {
        gameId: context.key.gameId,
        branchId: context.key.branchId,
        requestId: action.requestId,
        playerId: action.playerId,
        expectedRevision: action.expectedRevision,
        actionId: action.actionId,
        startRevision: appended.startRevision,
        endRevision: appended.endRevision,
        stateHash: appended.stateHash,
        createdAt: isoNow(this.clock),
        source,
        fallback,
      };
      await this.roomStore.saveActionReceipt(receipt);
      await this.roomStore.clearPendingAction(
        context.key.gameId,
        context.key.branchId,
        action.playerId,
        action.requestId,
      );
      await this.updateRoomStatus(context.room.roomId, decided.state.phase);
      await this.publishCommit(context.key, decided.events, {
        requestId: action.requestId,
        playerId: action.playerId,
        actionId: action.actionId,
        source,
        fallback,
      });
      return {
        accepted: true,
        idempotent: appended.disposition === "idempotent",
        key: context.key,
        playerId: action.playerId,
        requestId: action.requestId,
        actionId: action.actionId,
        startRevision: appended.startRevision,
        endRevision: appended.endRevision,
        observation: publicObservation(context.engine.observation(decided.state, action.playerId)),
        publicEvents: decided.publicEvents.map(publicEvent),
        state: decided.state,
        source,
        fallback,
      };
    } catch (caught) {
      if (caught instanceof PersistenceConflictError) {
        const current = await this.repository.loadGame(context.key);
        return fail(
          "stale_revision",
          "The action lost the revision compare-and-set",
          {
            currentRevision: current.state.revision,
            stateHash: current.state.stateHash,
            observation: publicObservation(
              context.engine.observation(current.state, action.playerId),
            ),
          },
          409,
        );
      }
      if (caught instanceof PersistenceValidationError) {
        try {
          const current = await this.repository.loadGame(context.key);
          if (current.state.revision !== action.expectedRevision) {
            return fail(
              "stale_revision",
              "The action lost the revision compare-and-set",
              {
                currentRevision: current.state.revision,
                stateHash: current.state.stateHash,
                observation: publicObservation(
                  context.engine.observation(current.state, action.playerId),
                ),
              },
              409,
            );
          }
        } catch {
          // Preserve the persistence error when the current branch cannot be reloaded.
        }
      }
      return this.persistenceFailure(caught);
    }
  }

  private async idempotentResult(
    context: AuthenticatedDenoGameContext,
    receipt: DenoActionReceipt,
  ): Promise<DenoSubmitActionResult> {
    const state = (await this.repository.loadGameAtRevision(context.key, receipt.endRevision))
      .state;
    const publicEvents = await this.publicEventsFor(
      context.key,
      receipt.startRevision - 1,
      receipt.endRevision,
    );
    return {
      accepted: true,
      idempotent: true,
      key: context.key,
      playerId: receipt.playerId,
      requestId: receipt.requestId,
      actionId: receipt.actionId,
      startRevision: receipt.startRevision,
      endRevision: receipt.endRevision,
      observation: publicObservation(context.engine.observation(state, receipt.playerId)),
      publicEvents,
      state,
      source: receipt.source,
      fallback: receipt.fallback,
    };
  }

  private async durableReceiptMatches(
    context: AuthenticatedDenoGameContext,
    receipt: CommandReceipt,
    action: z.output<typeof actionSubmissionSchema>,
  ): Promise<boolean> {
    if (receipt.startRevision < 2 || receipt.endRevision < receipt.startRevision) {
      return false;
    }
    try {
      const before = await this.repository.loadGameAtRevision(
        context.key,
        receipt.startRevision - 1,
      );
      if (before.state.revision !== action.expectedRevision) {
        return false;
      }
      const decided = context.engine.decide(before.state, {
        type: "submit_action",
        gameId: context.key.gameId,
        branchId: context.key.branchId,
        playerId: action.playerId,
        expectedRevision: action.expectedRevision,
        requestId: action.requestId,
        actionId: action.actionId,
      });
      if (!decided.accepted || decided.state.stateHash !== receipt.stateHash) {
        return false;
      }
      const stored = await this.repository.listEvents(
        context.key,
        receipt.startRevision - 1,
        receipt.endRevision,
      );
      return (
        stored.length === decided.events.length &&
        stored.every(
          (entry, index) => canonicalJson(entry.event) === canonicalJson(decided.events[index]),
        )
      );
    } catch {
      return false;
    }
  }

  private async resultFromReceipt(
    context: AuthenticatedDenoGameContext,
    receipt: CommandReceipt,
    action: z.output<typeof actionSubmissionSchema>,
    source: ActionSource,
    fallback: FallbackActionMetadata | null,
  ): Promise<{ readonly receipt: DenoActionReceipt; readonly result: DenoSubmitActionResult }> {
    const state = (await this.repository.loadGameAtRevision(context.key, receipt.endRevision))
      .state;
    const stored: DenoActionReceipt = {
      gameId: context.key.gameId,
      branchId: context.key.branchId,
      requestId: action.requestId,
      playerId: action.playerId,
      expectedRevision: action.expectedRevision,
      actionId: action.actionId,
      startRevision: receipt.startRevision,
      endRevision: receipt.endRevision,
      stateHash: receipt.stateHash,
      createdAt: receipt.createdAt,
      source,
      fallback,
    };
    return {
      receipt: stored,
      result: {
        accepted: true,
        idempotent: true,
        key: context.key,
        playerId: action.playerId,
        requestId: action.requestId,
        actionId: action.actionId,
        startRevision: receipt.startRevision,
        endRevision: receipt.endRevision,
        observation: publicObservation(context.engine.observation(state, action.playerId)),
        publicEvents: await this.publicEventsFor(
          context.key,
          receipt.startRevision - 1,
          receipt.endRevision,
        ),
        state,
        source,
        fallback,
      },
    };
  }

  private selectBotAction(
    member: DenoRoomMember,
    observation: PlayerObservation,
    definition: unknown,
  ): string | null {
    const ruleset = resolveRuleset(definition);
    const policyKey = `${member.playerId}:${ruleset.hash}`;
    let policy = this.botPolicies.get(policyKey);
    if (policy === undefined) {
      policy = createBotPolicy({
        botId: member.playerId,
        difficulty: member.botDifficulty ?? "basic",
        personality: member.botPersonality ?? "balanced",
        ruleset,
      });
      this.botPolicies.set(policyKey, policy);
    }
    return policy.decide(observation)?.actionId ?? observation.legalActions[0]?.id ?? null;
  }

  private engineForDefinition(definition: unknown): GameEngine {
    return this.engineForRuleset(resolveRuleset(definition));
  }

  private engineForRuleset(ruleset: ResolvedRuleset): GameEngine {
    const existing = this.engines.get(ruleset.hash);
    if (existing !== undefined) {
      return existing;
    }
    const engine = createGameEngine({ scoringSystem: createHongKongScoringSystem(ruleset) });
    this.engines.set(ruleset.hash, engine);
    return engine;
  }

  private async startResponse(
    room: DenoRoom,
    playerId: string,
    ticket: string,
  ): Promise<RoomStartResponse> {
    if (room.gameId === null) {
      throw new Error("Started room has no game ID");
    }
    const member = room.members.find(({ playerId: candidate }) => candidate === playerId);
    if (member === undefined) {
      throw new Error("Room owner is not a member");
    }
    const observation = await this.getObservation(room.gameId, playerId, MAIN_BRANCH_ID, ticket);
    return {
      roomId: room.roomId,
      status: "active",
      game: { gameId: room.gameId, branchId: MAIN_BRANCH_ID },
      observation,
    };
  }

  private ticketForMember(roomId: string, member: DenoRoomMember): string {
    if (member.ticketHash === null) {
      return `internal:${roomId}:${member.playerId}`;
    }
    // Server-owned bot actions do not need an external bearer ticket. The authenticated path
    // only uses this value after the member identity has already been checked.
    return member.ticketHash;
  }

  private async requireRoom(roomId: string): Promise<DenoRoom> {
    const room = await this.roomStore.getRoom(roomId);
    if (room === null) {
      return fail("invalid_request", "Room was not found", { reason: "room_not_found" }, 404);
    }
    return this.roomWithRetention(room);
  }

  private async requireRoomByGame(gameId: string): Promise<DenoRoom> {
    const room = await this.roomStore.getRoomByGameId(gameId);
    if (room === null) {
      return fail("unknown_game", "Game was not found", { reason: "unknown_game" }, 404);
    }
    return this.roomWithRetention(room);
  }

  private async roomWithRetention(room: DenoRoom): Promise<DenoRoom> {
    if (room.status === "closed") {
      return room;
    }
    const updatedAt = Date.parse(room.updatedAt);
    if (!Number.isFinite(updatedAt) || this.nowMs() - updatedAt < this.retentionMs) {
      return room;
    }
    if (room.status === "waiting" || room.status === "ready") {
      if (!(await this.roomStore.closeWaitingRoom(room.roomId))) {
        return (await this.roomStore.getRoom(room.roomId)) ?? room;
      }
      return { ...room, status: "closed", updatedAt: isoNow(this.clock) };
    }
    await this.roomStore.setStatus(room.roomId, "closed");
    return { ...room, status: "closed", updatedAt: isoNow(this.clock) };
  }

  private async updateRoomStatus(roomId: string, phase: GameState["phase"]): Promise<void> {
    if (phase === "match_ended") {
      await this.roomStore.setStatus(roomId, "match_ended");
    } else if (phase === "hand_ended") {
      await this.roomStore.setStatus(roomId, "hand_ended");
    } else {
      await this.roomStore.setStatus(roomId, "active");
    }
  }

  private async publishCommit(
    key: GameKey,
    events: readonly GameEvent[],
    action: DenoKvCommitNotification["action"] = null,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const first = events[0]!;
    const last = events.at(-1)!;
    const notification: DenoKvCommitNotification = {
      schemaVersion: 1,
      notificationId: `${key.gameId}:${key.branchId}:${first.requestId}`,
      gameId: key.gameId,
      branchId: key.branchId,
      fromRevision: first.revision,
      toRevision: last.revision,
      eventChainHash: (await this.repository.getBranchMetadata(key)).eventChainHash,
      action,
    };
    await this.notifier.publish(notification);
  }

  private persistenceFailure(caught: unknown): never {
    return fail(
      "persistence_failure",
      "The durable game store rejected the command",
      { reason: caught instanceof PersistenceError ? caught.message : "persistence_failure" },
      503,
    );
  }

  private requireFactoryId(value: string, label: string): string {
    if (value.trim().length === 0) {
      throw new Error(`${label} ID factory returned an empty ID`);
    }
    return value;
  }
}

export interface AuthenticatedDenoGameContext {
  readonly room: DenoRoom;
  readonly member: DenoRoomMember;
  readonly key: GameKey;
  readonly loaded: Awaited<ReturnType<DenoKvPersistenceRepository["loadGame"]>>;
  readonly engine: GameEngine;
}

export interface DenoSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...arguments_: unknown[]) => void): void;
}

interface DenoSocketConnection {
  readonly socket: DenoSocketLike;
  readonly gameId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly seat: Seat;
  /** The host-to-client sequence. Client-to-host validation is independent. */
  nextSequence: number;
  readonly clientSequence: ProtocolSequenceValidator;
  lastPublicRevision: number;
  lastNotificationRevision: number;
  readonly acceptedRequestIds: Set<string>;
  lastTerminalRevision: number;
  malformedCount: number;
  messageTimes: number[];
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  pendingRequest: { requestId: string; expectedRevision: number; deadline: string } | null;
  /** Serialize asynchronous client messages so response/event order follows client sequence. */
  messageQueue: Promise<void>;
}

const rawFrameText = (value: unknown): string | null =>
  typeof value === "string"
    ? value
    : value instanceof ArrayBuffer
      ? new TextDecoder().decode(value)
      : null;
const rawFrameBytes = (value: unknown): number =>
  typeof value === "string"
    ? new TextEncoder().encode(value).byteLength
    : value instanceof ArrayBuffer
      ? value.byteLength
      : MAX_FRAME_BYTES + 1;

/** Deno-native asynchronous socket fan-out with durable reconnect and notification catch-up. */
export class DenoMultiplayerSocketHub {
  private readonly connections = new Set<DenoSocketConnection>();
  private notificationTimer: ReturnType<typeof setInterval> | null = null;
  private notificationPoll: Promise<void> | null = null;

  public constructor(private readonly service: DenoMultiplayerService) {}

  public startNotificationPump(intervalMs = 500): void {
    if (this.notificationTimer !== null) {
      return;
    }
    this.notificationTimer = setInterval(() => {
      if (this.notificationPoll !== null) {
        return;
      }
      this.notificationPoll = this.pollNotifications()
        .catch(() => undefined)
        .finally(() => {
          this.notificationPoll = null;
        });
    }, intervalMs);
  }

  public stop(): void {
    if (this.notificationTimer !== null) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = null;
    }
    for (const connection of this.connections) {
      if (connection.timeoutHandle !== null) {
        clearTimeout(connection.timeoutHandle);
      }
    }
    this.connections.clear();
  }

  public async attach(
    socket: DenoSocketLike,
    input: {
      readonly gameId: string;
      readonly playerId: string;
      readonly branchId: string;
      readonly ticket: string;
      readonly fromRevision: number;
      readonly origin?: string;
    },
    authenticatedContext?: AuthenticatedDenoGameContext,
  ): Promise<void> {
    if (!this.service.allowsOrigin(input.origin)) {
      socket.close(1008, "origin_not_allowed");
      return;
    }
    let context: AuthenticatedDenoGameContext;
    try {
      context =
        authenticatedContext ??
        (await this.service.authenticateGame(
          input.gameId,
          input.branchId,
          input.playerId,
          input.ticket,
        ));
    } catch {
      socket.close(1008, "invalid_ticket");
      return;
    }
    const connection: DenoSocketConnection = {
      socket,
      gameId: input.gameId,
      branchId: input.branchId,
      playerId: input.playerId,
      ticket: input.ticket,
      seat: context.member.seat,
      nextSequence: 0,
      clientSequence: new ProtocolSequenceValidator(),
      lastPublicRevision: input.fromRevision,
      lastNotificationRevision: input.fromRevision,
      acceptedRequestIds: new Set<string>(),
      lastTerminalRevision: -1,
      malformedCount: 0,
      messageTimes: [],
      timeoutHandle: null,
      pendingRequest: null,
      messageQueue: Promise.resolve(),
    };
    this.connections.add(connection);
    socket.on("message", (...arguments_) => {
      const [data, isBinary] = arguments_;
      connection.messageQueue = connection.messageQueue
        .then(() => this.handleMessage(connection, data, isBinary === true))
        .catch(() => undefined);
    });
    socket.on("close", () => void this.disconnect(connection));
    socket.on("error", () => void this.disconnect(connection));
    // Register the listener before yielding so a client frame sent immediately after the
    // handshake cannot race authentication. Defer the first server frame until the upgrade
    // response has been handed back to the client; native Deno may drop sends made before open.
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        void this.sendJoinSequence(connection, input.fromRevision, context)
          .then(resolve)
          .catch(() => {
            this.connections.delete(connection);
            socket.close(1011, "join_failed");
            resolve();
          });
      }, 0);
    });
  }

  private async disconnect(connection: DenoSocketConnection): Promise<void> {
    this.connections.delete(connection);
    if (connection.timeoutHandle !== null) {
      clearTimeout(connection.timeoutHandle);
      connection.timeoutHandle = null;
    }
    if (connection.pendingRequest === null) {
      return;
    }
    try {
      const room = await this.service.requireRoomForSocket(connection.gameId);
      if (room?.disconnectPolicy === "pause_on_disconnect") {
        await this.service.pausePendingAction(
          connection.gameId,
          connection.branchId,
          connection.playerId,
        );
      } else {
        this.scheduleTimeout(connection, connection.pendingRequest, true);
      }
    } catch {
      // The room may have ended or its deadline write may have lost a race.
    }
  }

  private async sendJoinSequence(
    connection: DenoSocketConnection,
    fromRevision: number,
    context: AuthenticatedDenoGameContext,
  ): Promise<void> {
    const currentRevision = context.loaded.state.revision;
    this.send(connection, "hello", {
      seat: connection.seat,
      actionTimeoutMs: this.service.actionTimeoutMs,
      malformedResponseLimit: this.service.malformedResponseLimit,
    });
    if (
      fromRevision < 0 ||
      fromRevision > currentRevision ||
      currentRevision - fromRevision > this.service.deliveryWindow
    ) {
      if (fromRevision < 1) {
        this.send(connection, "game_started", {
          observation: publicObservation(
            context.engine.observation(context.loaded.state, connection.playerId),
          ),
        });
      }
      this.send(
        connection,
        "observation",
        publicObservation(context.engine.observation(context.loaded.state, connection.playerId)),
      );
      connection.lastPublicRevision = currentRevision;
      connection.lastNotificationRevision = currentRevision;
      this.sendError(connection, {
        code: "invalid_request",
        message: "The requested replay range is outside the live delivery window",
        details: { resyncRequired: true, currentRevision },
      });
      await this.sendActionRequest(connection, context);
      return;
    }
    if (fromRevision < 1) {
      this.send(connection, "game_started", {
        observation: publicObservation(
          context.engine.observation(context.loaded.state, connection.playerId),
        ),
      });
    }
    for (const event of await this.service.publicEventsFor(
      context.key,
      fromRevision,
      currentRevision,
    )) {
      this.send(connection, "public_event", { event });
      connection.lastPublicRevision = Math.max(connection.lastPublicRevision, event.revision);
    }
    this.send(
      connection,
      "observation",
      publicObservation(context.engine.observation(context.loaded.state, connection.playerId)),
    );
    connection.lastNotificationRevision = Math.max(
      connection.lastNotificationRevision,
      currentRevision,
    );
    await this.sendActionRequest(connection, context);
  }

  private async handleMessage(
    connection: DenoSocketConnection,
    data: unknown,
    isBinary: boolean,
  ): Promise<void> {
    if (rawFrameBytes(data) > MAX_FRAME_BYTES) {
      connection.socket.close(1009, "frame_too_large");
      return;
    }
    if (isBinary) {
      this.malformed(connection, "Binary WebSocket frames are not supported");
      return;
    }
    const text = rawFrameText(data);
    if (text === null) {
      this.malformed(connection, "WebSocket frame must be UTF-8 text");
      return;
    }
    const now = Date.now();
    connection.messageTimes = connection.messageTimes.filter((time) => now - time < 60_000);
    if (connection.messageTimes.length >= this.service.rateLimitPerMinute) {
      this.sendError(connection, {
        code: "invalid_request",
        message: "The WebSocket action rate limit was exceeded",
        details: { reason: "rate_limited" },
      });
      return;
    }
    connection.messageTimes.push(now);
    let parsed: DenoProtocolHostMessage | z.output<typeof agentProtocolEnvelopeSchema>;
    try {
      parsed = agentProtocolEnvelopeSchema.parse(JSON.parse(text) as unknown);
      if (connection.clientSequence.lastSequence === -1 && parsed.seq !== 0) {
        throw new Error("Protocol sequence must start at zero");
      }
      connection.clientSequence.accept(parsed);
    } catch (caught) {
      this.malformed(
        connection,
        caught instanceof Error ? caught.message : "Malformed protocol envelope",
      );
      return;
    }
    if (parsed.gameId !== connection.gameId) {
      this.malformed(connection, "Envelope game identity does not match the socket");
      return;
    }
    if (parsed.branchId !== connection.branchId) {
      this.malformed(connection, "Envelope branch identity does not match the socket");
      return;
    }
    if (parsed.type === "submit_action") {
      let payload: z.output<typeof actionSubmissionSchema>;
      try {
        payload = actionSubmissionSchema.parse(parsed.payload);
      } catch (caught) {
        this.malformed(
          connection,
          caught instanceof Error ? caught.message : "Malformed action submission",
        );
        return;
      }
      if (parsed.requestId !== payload.requestId) {
        this.malformed(connection, "Envelope request identity does not match the action");
        return;
      }
      if (payload.playerId !== connection.playerId || payload.branchId !== connection.branchId) {
        await this.sendActionRejected(
          connection,
          {
            code: "unknown_player",
            message: "The message player or branch does not match this socket",
            details: { reason: "cross_player_message" },
          },
          parsed.requestId,
        );
        return;
      }
      try {
        const result = await this.service.submitAction({
          ...payload,
          gameId: connection.gameId,
          ticket: connection.ticket,
        });
        await this.publishActionResult(result);
      } catch (caught) {
        await this.sendActionRejected(
          connection,
          caught instanceof DenoMultiplayerServiceError
            ? caught.payload
            : {
                code: "persistence_failure",
                message: "The server could not apply the action",
                details: {},
              },
          parsed.requestId,
        );
      }
      return;
    }
    if (parsed.type === "ping") {
      try {
        const context = await this.service.authenticateGame(
          connection.gameId,
          connection.branchId,
          connection.playerId,
          connection.ticket,
        );
        this.send(
          connection,
          "observation",
          publicObservation(context.engine.observation(context.loaded.state, connection.playerId)),
        );
        connection.lastNotificationRevision = Math.max(
          connection.lastNotificationRevision,
          context.loaded.state.revision,
        );
      } catch (caught) {
        this.sendError(
          connection,
          caught instanceof DenoMultiplayerServiceError
            ? caught.payload
            : {
                code: "unknown_game",
                message: "The game could not be loaded",
                details: {},
              },
        );
      }
      return;
    }
    const payload = parsed.payload as { readonly playerId: string };
    if (payload.playerId !== connection.playerId) {
      this.sendError(
        connection,
        {
          code: "unknown_player",
          message: "The message player does not match this socket",
          details: { reason: "cross_player_message" },
        },
        parsed.requestId,
      );
      return;
    }
    this.sendError(
      connection,
      {
        code: "invalid_request",
        message: `${parsed.type} is not enabled for this competitive room`,
        details: { reason: "unsupported_room_action" },
      },
      parsed.requestId,
    );
  }

  /** Publishes a committed result for both WebSocket-originated and HTTP-originated actions. */
  public async publishActionResult(
    result: DenoSubmitActionResult,
    botResultsOverride?: readonly DenoSubmitActionResult[],
    options: { readonly advanceBots?: boolean; readonly sendNextAction?: boolean } = {},
  ): Promise<void> {
    if (result.idempotent) {
      for (const participant of this.connections) {
        if (
          participant.gameId !== result.key.gameId ||
          participant.branchId !== result.key.branchId
        ) {
          continue;
        }
        for (const event of result.publicEvents) {
          if (event.revision <= participant.lastPublicRevision) {
            continue;
          }
          this.send(participant, "public_event", { event });
          participant.lastPublicRevision = event.revision;
        }
        participant.lastNotificationRevision = Math.max(
          participant.lastNotificationRevision,
          result.endRevision,
        );
        if (participant.playerId === result.playerId) {
          this.clearConnectionPendingRequest(participant);
          if (participant.acceptedRequestIds.has(result.requestId)) {
            continue;
          }
          this.send(
            participant,
            "action_accepted",
            {
              playerId: result.playerId,
              actionId: result.actionId,
              revision: result.endRevision,
              source: result.source,
              ...(result.fallback === null ? {} : { fallback: result.fallback }),
              observation: result.observation,
            },
            result.requestId,
          );
          participant.acceptedRequestIds.add(result.requestId);
          continue;
        }
        try {
          const context = await this.service.authenticateGame(
            participant.gameId,
            participant.branchId,
            participant.playerId,
            participant.ticket,
          );
          this.send(
            participant,
            "observation",
            publicObservation(
              context.engine.observation(context.loaded.state, participant.playerId),
            ),
          );
          if (participant.pendingRequest === null) {
            await this.sendActionRequest(participant, context);
          }
        } catch {
          // A disconnected or expired participant can catch up from durable revision state.
        }
      }
      const terminalEvent = result.publicEvents.find(
        (event) => event.type === "hand_ended" || event.type === "match_ended",
      );
      if (terminalEvent !== undefined) {
        await this.sendTerminalEvent(result.key.gameId, result.key.branchId, terminalEvent);
      }
      for (const botResult of botResultsOverride ?? []) {
        await this.publishActionResult(botResult, [], { advanceBots: false, sendNextAction: true });
      }
      return;
    }
    for (const participant of this.connections) {
      if (participant.gameId !== result.key.gameId || participant.branchId !== result.key.branchId)
        continue;
      if (participant.playerId === result.playerId) {
        this.clearConnectionPendingRequest(participant);
      }
      for (const event of result.publicEvents) {
        if (event.revision <= participant.lastPublicRevision) continue;
        this.send(participant, "public_event", { event });
        participant.lastPublicRevision = event.revision;
      }
      participant.lastNotificationRevision = Math.max(
        participant.lastNotificationRevision,
        result.endRevision,
      );
    }
    for (const participant of this.connections) {
      if (participant.gameId !== result.key.gameId || participant.branchId !== result.key.branchId)
        continue;
      if (participant.playerId === result.playerId) {
        if (!participant.acceptedRequestIds.has(result.requestId)) {
          this.send(
            participant,
            "action_accepted",
            {
              playerId: result.playerId,
              actionId: result.actionId,
              revision: result.endRevision,
              source: result.source,
              ...(result.fallback === null ? {} : { fallback: result.fallback }),
              observation: result.observation,
            },
            result.requestId,
          );
          participant.acceptedRequestIds.add(result.requestId);
        }
      } else {
        const context = await this.service.authenticateGame(
          participant.gameId,
          participant.branchId,
          participant.playerId,
          participant.ticket,
        );
        this.send(
          participant,
          "observation",
          publicObservation(context.engine.observation(context.loaded.state, participant.playerId)),
        );
      }
    }
    const botResults =
      botResultsOverride ??
      (options.advanceBots === false ? [] : await this.service.advanceBotTurns(result.key.gameId));
    for (const botResult of botResults) {
      await this.publishActionResult(botResult, undefined, {
        advanceBots: false,
        sendNextAction: false,
      });
    }
    if (options.sendNextAction !== false) {
      const terminalEvent = [
        ...result.publicEvents,
        ...botResults.flatMap(({ publicEvents }) => publicEvents),
      ].find((event) => event.type === "hand_ended" || event.type === "match_ended");
      if (terminalEvent !== undefined) {
        await this.sendTerminalEvent(result.key.gameId, result.key.branchId, terminalEvent);
      }
      for (const participant of this.connections) {
        if (
          participant.gameId === result.key.gameId &&
          participant.branchId === result.key.branchId
        ) {
          const context = await this.service.authenticateGame(
            participant.gameId,
            participant.branchId,
            participant.playerId,
            participant.ticket,
          );
          await this.sendActionRequest(participant, context);
        }
      }
    }
  }

  private async sendActionRequest(
    connection: DenoSocketConnection,
    context: AuthenticatedDenoGameContext,
  ): Promise<void> {
    const observation = publicObservation(
      context.engine.observation(context.loaded.state, connection.playerId),
    );
    if (observation.legalActions.length === 0 || isTerminalStatus(context.room.status)) {
      this.clearConnectionPendingRequest(connection);
      return;
    }
    const requestId = this.service.actionRequestId(
      connection.gameId,
      connection.branchId,
      observation.revision,
      connection.playerId,
    );
    let pending = await this.service.pendingActionFor(
      connection.gameId,
      connection.branchId,
      connection.playerId,
    );
    const room = context.room;
    if (pending?.requestId !== requestId || pending.expectedRevision !== observation.revision) {
      pending = {
        gameId: connection.gameId,
        branchId: connection.branchId,
        playerId: connection.playerId,
        requestId,
        expectedRevision: observation.revision,
        deadlineAt: new Date(this.service.nowMs() + this.service.actionTimeoutMs).toISOString(),
        pausedAt: null,
        remainingMs: null,
      };
      await this.service.registerPendingAction(pending);
    } else if (pending.pausedAt !== null && room.disconnectPolicy === "pause_on_disconnect") {
      pending = await this.service.resumePendingAction(
        connection.gameId,
        connection.branchId,
        connection.playerId,
      );
    }
    const deadline =
      pending?.deadlineAt ??
      new Date(this.service.nowMs() + this.service.actionTimeoutMs).toISOString();
    connection.pendingRequest = { requestId, expectedRevision: observation.revision, deadline };
    this.scheduleTimeout(connection, connection.pendingRequest, false);
    this.send(
      connection,
      "action_request",
      {
        playerId: connection.playerId,
        branchId: connection.branchId,
        expectedRevision: observation.revision,
        requestId,
        deadline,
        legalActions: observation.legalActions,
      },
      requestId,
    );
  }

  private scheduleTimeout(
    connection: DenoSocketConnection,
    request: { requestId: string; expectedRevision: number; deadline: string },
    disconnected: boolean,
  ): void {
    if (connection.timeoutHandle !== null) clearTimeout(connection.timeoutHandle);
    connection.pendingRequest = request;
    connection.timeoutHandle = setTimeout(
      () => {
        connection.timeoutHandle = null;
        void this.service
          .submitTimeoutFallback(
            connection.gameId,
            connection.branchId,
            connection.playerId,
            request.requestId,
            request.expectedRevision,
            request.deadline,
            disconnected ? "disconnect_timeout" : "action_timeout",
          )
          .then((result) => (result === null ? undefined : this.publishActionResult(result)))
          .catch(() => undefined);
      },
      Math.max(0, Date.parse(request.deadline) - this.service.nowMs()),
    );
  }

  private async sendActionRejected(
    connection: DenoSocketConnection,
    error: z.output<typeof protocolErrorSchema>,
    requestId?: string,
  ): Promise<void> {
    let observation: z.output<typeof playerObservationSchema> | null = null;
    try {
      const context = await this.service.authenticateGame(
        connection.gameId,
        connection.branchId,
        connection.playerId,
        connection.ticket,
      );
      observation = publicObservation(
        context.engine.observation(context.loaded.state, connection.playerId),
      );
    } catch {
      // The room may have ended while an action error was being delivered.
    }
    this.send(
      connection,
      "action_rejected",
      {
        playerId: connection.playerId,
        error,
        observation,
      },
      requestId,
    );
  }

  private sendError(
    connection: DenoSocketConnection,
    error: z.output<typeof protocolErrorSchema>,
    requestId?: string,
  ): void {
    this.send(connection, "error", error, requestId);
  }

  private malformed(connection: DenoSocketConnection, message: string): void {
    connection.malformedCount += 1;
    this.sendError(connection, {
      code: "invalid_request",
      message,
      details: { malformedCount: connection.malformedCount },
    });
    if (connection.malformedCount >= this.service.malformedResponseLimit) {
      connection.socket.close(1008, "policy_violation");
      this.connections.delete(connection);
    }
  }

  private send(
    connection: DenoSocketConnection,
    type: string,
    payload: unknown,
    requestId?: string,
  ): void {
    try {
      const envelope = createProtocolEnvelope({
        type,
        seq: connection.nextSequence++,
        gameId: connection.gameId,
        branchId: connection.branchId,
        ...(requestId === undefined ? {} : { requestId }),
        payload,
      });
      connection.socket.send(JSON.stringify(hostProtocolEnvelopeSchema.parse(envelope)));
    } catch {
      connection.socket.close(1011, "delivery_failed");
      void this.disconnect(connection).catch(() => undefined);
    }
  }

  private async pollNotifications(): Promise<void> {
    const byGame = new Map<string, { readonly gameId: string; readonly branchId: string }>();
    for (const connection of this.connections) {
      const key = JSON.stringify([connection.gameId, connection.branchId]);
      byGame.set(key, { gameId: connection.gameId, branchId: connection.branchId });
    }
    for (const { gameId, branchId } of byGame.values()) {
      const notifications = await this.service.notifier.list(gameId, branchId);
      for (const notification of notifications) {
        for (const participant of this.connections) {
          if (participant.gameId !== gameId || participant.branchId !== branchId) continue;
          if (notification.toRevision <= participant.lastNotificationRevision) continue;
          const events = await this.service.publicEventsFor(
            { gameId, branchId },
            participant.lastNotificationRevision,
            notification.toRevision,
          );
          const action = notification.action ?? null;
          if (action !== null && action.playerId === participant.playerId) {
            this.clearConnectionPendingRequest(participant);
          }
          let deliveredTerminalEvent:
            | Extract<
                z.output<typeof publicGameEventSchema>,
                { type: "hand_ended" | "match_ended" }
              >
            | undefined;
          for (const event of events) {
            if (event.revision <= participant.lastPublicRevision) continue;
            this.send(participant, "public_event", { event });
            participant.lastPublicRevision = event.revision;
            if (event.type === "hand_ended" || event.type === "match_ended") {
              deliveredTerminalEvent = event;
            }
          }
          try {
            const context = await this.service.authenticateGame(
              gameId,
              branchId,
              participant.playerId,
              participant.ticket,
            );
            // The receipt and observation in this notification describe the committed command,
            // not necessarily the latest state if another instance has already appended more
            // commands. Load the exact commit revision for the accepted-action/observation
            // envelope, then use the latest context only when scheduling the next request.
            const committed = await this.service.repository.loadGameAtRevision(
              { gameId, branchId },
              notification.toRevision,
            );
            const observation = publicObservation(
              context.engine.observation(committed.state, participant.playerId),
            );
            const submittingAction =
              action !== null && action.playerId === participant.playerId ? action : null;
            if (
              submittingAction !== null &&
              !participant.acceptedRequestIds.has(submittingAction.requestId)
            ) {
              this.send(
                participant,
                "action_accepted",
                {
                  playerId: submittingAction.playerId,
                  actionId: submittingAction.actionId,
                  revision: notification.toRevision,
                  source: submittingAction.source,
                  ...(submittingAction.fallback === null
                    ? {}
                    : { fallback: submittingAction.fallback }),
                  observation,
                },
                submittingAction.requestId,
              );
              participant.acceptedRequestIds.add(submittingAction.requestId);
            } else {
              this.send(participant, "observation", observation);
            }
            participant.lastNotificationRevision = Math.max(
              participant.lastNotificationRevision,
              notification.toRevision,
            );
            if (deliveredTerminalEvent !== undefined) {
              this.sendTerminalEventToParticipant(participant, deliveredTerminalEvent, observation);
            }
            await this.sendActionRequest(participant, context);
          } catch {
            // A disconnected or expired participant will reconnect from durable revision state.
          }
        }
      }
    }
  }

  private clearConnectionPendingRequest(connection: DenoSocketConnection): void {
    if (connection.timeoutHandle !== null) {
      clearTimeout(connection.timeoutHandle);
      connection.timeoutHandle = null;
    }
    connection.pendingRequest = null;
  }

  private async sendTerminalEvent(
    gameId: string,
    branchId: string,
    event: Extract<z.output<typeof publicGameEventSchema>, { type: "hand_ended" | "match_ended" }>,
  ): Promise<void> {
    for (const participant of this.connections) {
      if (participant.gameId !== gameId || participant.branchId !== branchId) continue;
      try {
        const context = await this.service.authenticateGame(
          participant.gameId,
          participant.branchId,
          participant.playerId,
          participant.ticket,
        );
        const observation = publicObservation(
          context.engine.observation(context.loaded.state, participant.playerId),
        );
        this.sendTerminalEventToParticipant(participant, event, observation);
      } catch {
        // A disconnected or expired participant cannot receive the terminal notification.
      }
    }
  }

  private sendTerminalEventToParticipant(
    participant: DenoSocketConnection,
    event: Extract<z.output<typeof publicGameEventSchema>, { type: "hand_ended" | "match_ended" }>,
    observation: z.output<typeof playerObservationSchema>,
  ): void {
    if (event.revision <= participant.lastTerminalRevision) return;
    participant.lastTerminalRevision = event.revision;
    if (event.type === "hand_ended") {
      this.send(participant, "hand_ended", { result: event.result, observation });
    } else {
      this.send(participant, "match_ended", { observation });
    }
  }
}
