import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createGameEngine,
  projectPublicEventStream,
  reduceGameEvent,
  type CreateGameCommand,
  type GameEngine,
  type GameState,
  type PlayerObservation,
  type PublicGameEvent,
  type PlayerController,
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
  PersistenceConflictError,
  PersistenceError,
  PersistenceNotFoundError,
  SqlitePersistenceRepository,
  type CommandReceipt,
  type GameKey,
  type GameSessionConfigurationV1,
  type JsonObject,
  type PersistenceRepository,
} from "@hk-mahjong/persistence";
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
  roomDisconnectPolicySchema,
  roomJoinRequestSchema,
  roomStartRequestSchema,
  roomStatusSchema,
  type ActionSubmission,
  type PlayerObservationDto,
  type ProtocolError,
  type PublicGameEventDto,
  type RoomCreateRequest,
  type RoomCreateResponse,
  type RoomDisconnectPolicy,
  type RoomFillPolicy,
  type RoomInspectionResponse,
  type RoomJoinRequest,
  type RoomJoinResponse,
  type RoomRulesetSummary,
  type RoomStartRequest,
  type RoomStartResponse,
  type RoomStatus,
  type ActionSource,
  type FallbackActionMetadata,
} from "@hk-mahjong/protocol";
import { z } from "zod";

const WINDS = ["east", "south", "west", "north"] as const;
const MAIN_BRANCH_ID = "main" as const;
const DEFAULT_DATABASE_PATH = ".data/coach.sqlite";
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_MALFORMED_RESPONSE_LIMIT = 3;
const DEFAULT_DELIVERY_WINDOW = 512;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const MAX_FRAME_BYTES = 64 * 1024;

type Seat = (typeof WINDS)[number];
type HumanOrBotController = Extract<PlayerController, "human" | "bot">;
type ProtocolHostMessage = z.output<typeof hostProtocolEnvelopeSchema>;

const roomIdPathSchema = z.object({ roomId: z.string().trim().min(1).max(256) }).strict();
const gameIdPathSchema = z.object({ gameId: z.string().trim().min(1).max(256) }).strict();
const gameQuerySchema = z
  .object({
    playerId: z.string().trim().min(1).max(256),
    branchId: z.string().trim().min(1).max(256).default(MAIN_BRANCH_ID),
    ticket: z.string().trim().min(16).max(512).optional(),
  })
  .strict();
const websocketQuerySchema = gameQuerySchema.extend({
  fromRevision: z.coerce.number().int().nonnegative().default(0),
});

const seatSchema = z.enum(WINDS);
const controllerSchema = z.enum(["human", "bot"]);

export interface MultiplayerRoomMember {
  readonly roomId: string;
  readonly playerId: string;
  readonly displayName: string;
  readonly seat: Seat;
  readonly controller: HumanOrBotController;
  readonly ticketHash: string | null;
  readonly ticketExpiresAt: number | null;
  readonly owner: boolean;
  readonly botDifficulty: "novice" | "basic" | "intermediate" | "advanced" | null;
  readonly botPersonality: "fast" | "value" | "balanced" | null;
}

export interface MultiplayerRoomRecord {
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
  readonly members: readonly MultiplayerRoomMember[];
}

export interface MultiplayerActionReceipt {
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

export interface MultiplayerPendingAction {
  readonly gameId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly deadlineAt: string;
  readonly pausedAt: string | null;
  readonly remainingMs: number | null;
}

export interface RoomStore {
  close(): void;
  createRoom(input: MultiplayerRoomRecord): void;
  getRoom(roomId: string): MultiplayerRoomRecord | null;
  getRoomByGameId(gameId: string): MultiplayerRoomRecord | null;
  /** `startRequestId` is reserved for idempotent server-owned bot filling. */
  addMember(member: MultiplayerRoomMember, startRequestId?: string): void;
  /** Returns true when this request had already completed the start. */
  claimStart(roomId: string, requestId: string): boolean;
  /** Atomically closes a waiting room only when no start has been claimed. */
  closeWaitingRoom(roomId: string): boolean;
  /** Marks a fully assigned, reserved room ready without regressing an active start. */
  markReady(roomId: string, requestId: string): void;
  markStarted(roomId: string, gameId: string, requestId: string): void;
  setStatus(roomId: string, status: RoomStatus): void;
  getMemberForTicket(roomId: string, ticket: string, now: number): MultiplayerRoomMember | null;
  getActionReceipt(
    gameId: string,
    branchId: string,
    requestId: string,
  ): MultiplayerActionReceipt | null;
  saveActionReceipt(receipt: MultiplayerActionReceipt): void;
  getPendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
  ): MultiplayerPendingAction | null;
  savePendingAction(action: MultiplayerPendingAction): void;
  clearPendingAction(gameId: string, branchId: string, playerId: string, requestId?: string): void;
  pausePendingAction(gameId: string, branchId: string, playerId: string, pausedAt: string): void;
  resumePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    resumedAt: string,
  ): MultiplayerPendingAction | null;
}

interface RoomRow {
  room_id: string;
  status: string;
  ruleset_id: string;
  ruleset_version: string;
  ruleset_hash: string;
  ruleset_json: string;
  match_length: string;
  seed: string;
  fill_policy: string;
  disconnect_policy: string;
  owner_player_id: string;
  game_id: string | null;
  start_request_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  room_id: string;
  player_id: string;
  display_name: string;
  seat: string;
  controller: string;
  ticket_hash: string | null;
  ticket_expires_at: number | null;
  is_owner: number;
  bot_difficulty: string | null;
  bot_personality: string | null;
}

interface ActionReceiptRow {
  game_id: string;
  branch_id: string;
  request_id: string;
  player_id: string;
  expected_revision: number;
  action_id: string;
  start_revision: number;
  end_revision: number;
  state_hash: string;
  created_at: string;
  source: string;
  fallback_json: string | null;
}

interface PendingActionRow {
  game_id: string;
  branch_id: string;
  player_id: string;
  request_id: string;
  expected_revision: number;
  deadline_at: string;
  paused_at: string | null;
  remaining_ms: number | null;
}

const asJsonObject = (value: unknown, label: string): JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as JsonObject;
};

const parseJsonObject = (value: string, label: string): JsonObject => {
  try {
    return asJsonObject(JSON.parse(value) as unknown, label);
  } catch (caught) {
    throw new Error(
      `${label} is invalid: ${caught instanceof Error ? caught.message : "invalid JSON"}`,
      { cause: caught },
    );
  }
};

const parseStatus = (value: string): RoomStatus => roomStatusSchema.parse(value);
const parseSeat = (value: string): Seat => seatSchema.parse(value);
const parseController = (value: string): HumanOrBotController => controllerSchema.parse(value);

const parseBotDifficulty = (value: string | null): MultiplayerRoomMember["botDifficulty"] => {
  if (value === null) {
    return null;
  }
  if (!["novice", "basic", "intermediate", "advanced"].includes(value)) {
    throw new Error(`Unsupported bot difficulty ${value}`);
  }
  return value as NonNullable<MultiplayerRoomMember["botDifficulty"]>;
};

const parseBotPersonality = (value: string | null): MultiplayerRoomMember["botPersonality"] => {
  if (value === null) {
    return null;
  }
  if (!["fast", "value", "balanced"].includes(value)) {
    throw new Error(`Unsupported bot personality ${value}`);
  }
  return value as NonNullable<MultiplayerRoomMember["botPersonality"]>;
};

const parseActionSource = (value: string): ActionSource =>
  z.enum(["human", "bot", "timeout_fallback"]).parse(value);

const parseFallback = (value: string): FallbackActionMetadata => {
  try {
    return z
      .object({
        source: z.literal("timeout_fallback"),
        reason: z.enum(["action_timeout", "disconnect_timeout"]),
        deadline: z.iso.datetime(),
        appliedAt: z.iso.datetime(),
      })
      .strict()
      .parse(JSON.parse(value) as unknown);
  } catch (caught) {
    throw new Error(
      `Fallback metadata is invalid: ${caught instanceof Error ? caught.message : "invalid JSON"}`,
      { cause: caught },
    );
  }
};

const rowToMember = (row: MemberRow): MultiplayerRoomMember => ({
  roomId: row.room_id,
  playerId: row.player_id,
  displayName: row.display_name,
  seat: parseSeat(row.seat),
  controller: parseController(row.controller),
  ticketHash: row.ticket_hash,
  ticketExpiresAt: row.ticket_expires_at,
  owner: row.is_owner === 1,
  botDifficulty: parseBotDifficulty(row.bot_difficulty),
  botPersonality: parseBotPersonality(row.bot_personality),
});

const rowToRoom = (row: RoomRow, members: readonly MemberRow[]): MultiplayerRoomRecord => ({
  roomId: row.room_id,
  status: parseStatus(row.status),
  rulesetId: row.ruleset_id,
  rulesetVersion: row.ruleset_version,
  rulesetHash: row.ruleset_hash,
  rulesetDefinition: parseJsonObject(row.ruleset_json, "Room ruleset definition"),
  matchLength: z.enum(["one_wind", "full_four_winds"]).parse(row.match_length),
  seed: row.seed,
  fillPolicy: z.enum(["wait_for_four", "fill_with_bots"]).parse(row.fill_policy),
  disconnectPolicy: roomDisconnectPolicySchema.parse(row.disconnect_policy),
  ownerPlayerId: row.owner_player_id,
  gameId: row.game_id,
  startRequestId: row.start_request_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  members: members
    .map(rowToMember)
    .sort((left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat)),
});

const rowToActionReceipt = (row: ActionReceiptRow): MultiplayerActionReceipt => ({
  gameId: row.game_id,
  branchId: row.branch_id,
  requestId: row.request_id,
  playerId: row.player_id,
  expectedRevision: row.expected_revision,
  actionId: row.action_id,
  startRevision: row.start_revision,
  endRevision: row.end_revision,
  stateHash: row.state_hash,
  createdAt: row.created_at,
  source: parseActionSource(row.source),
  fallback: row.fallback_json === null ? null : parseFallback(row.fallback_json),
});

const rowToPendingAction = (row: PendingActionRow): MultiplayerPendingAction => ({
  gameId: row.game_id,
  branchId: row.branch_id,
  playerId: row.player_id,
  requestId: row.request_id,
  expectedRevision: row.expected_revision,
  deadlineAt: row.deadline_at,
  pausedAt: row.paused_at,
  remainingMs: row.remaining_ms,
});

/**
 * Durable room metadata. Game events remain in the existing persistence repository; this store
 * only owns membership, bearer hashes, room lifecycle, and the HTTP/WebSocket idempotency index.
 */
export class SqliteRoomStore implements RoomStore {
  private readonly database: Database.Database;
  private readonly clock: () => Date;

  public constructor(databasePath: string, clock: () => Date = () => new Date()) {
    this.clock = clock;
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.database = new Database(databasePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS multiplayer_rooms (
        room_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        ruleset_id TEXT NOT NULL,
        ruleset_version TEXT NOT NULL,
        ruleset_hash TEXT NOT NULL,
        ruleset_json TEXT NOT NULL,
        match_length TEXT NOT NULL,
        seed TEXT NOT NULL,
        fill_policy TEXT NOT NULL,
        disconnect_policy TEXT NOT NULL DEFAULT 'fallback_on_disconnect',
        owner_player_id TEXT NOT NULL,
        game_id TEXT,
        start_request_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS multiplayer_room_members (
        room_id TEXT NOT NULL REFERENCES multiplayer_rooms(room_id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        seat TEXT NOT NULL,
        controller TEXT NOT NULL,
        ticket_hash TEXT,
        ticket_expires_at INTEGER,
        is_owner INTEGER NOT NULL,
        bot_difficulty TEXT,
        bot_personality TEXT,
        PRIMARY KEY (room_id, player_id),
        UNIQUE (room_id, seat)
      );
      CREATE TABLE IF NOT EXISTS multiplayer_action_receipts (
        game_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        expected_revision INTEGER NOT NULL,
        action_id TEXT NOT NULL,
        start_revision INTEGER NOT NULL,
        end_revision INTEGER NOT NULL,
        state_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'human',
        fallback_json TEXT,
        PRIMARY KEY (game_id, branch_id, request_id)
      );
      CREATE TABLE IF NOT EXISTS multiplayer_pending_actions (
        game_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        expected_revision INTEGER NOT NULL,
        deadline_at TEXT NOT NULL,
        paused_at TEXT,
        remaining_ms INTEGER,
        PRIMARY KEY (game_id, branch_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS multiplayer_room_game_idx
        ON multiplayer_rooms (game_id);
    `);
    this.ensureColumn(
      "multiplayer_rooms",
      "disconnect_policy",
      "TEXT NOT NULL DEFAULT 'fallback_on_disconnect'",
    );
    this.ensureColumn("multiplayer_action_receipts", "source", "TEXT NOT NULL DEFAULT 'human'");
    this.ensureColumn("multiplayer_action_receipts", "fallback_json", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.database
      .prepare<[string], { name: string }>("SELECT name FROM pragma_table_info(?)")
      .all(table);
    if (columns.some(({ name }) => name === column)) {
      return;
    }
    this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  public close(): void {
    if (this.database.open) {
      this.database.close();
    }
  }

  public createRoom(input: MultiplayerRoomRecord): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO multiplayer_rooms (
             room_id, status, ruleset_id, ruleset_version, ruleset_hash, ruleset_json,
             match_length, seed, fill_policy, disconnect_policy, owner_player_id, game_id, start_request_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.roomId,
          input.status,
          input.rulesetId,
          input.rulesetVersion,
          input.rulesetHash,
          JSON.stringify(input.rulesetDefinition),
          input.matchLength,
          input.seed,
          input.fillPolicy,
          input.disconnectPolicy,
          input.ownerPlayerId,
          input.gameId,
          input.startRequestId,
          input.createdAt,
          input.updatedAt,
        );
      for (const member of input.members) {
        this.insertMember(member);
      }
    });
    transaction();
  }

  public getRoom(roomId: string): MultiplayerRoomRecord | null {
    const row = this.database
      .prepare<[string], RoomRow>("SELECT * FROM multiplayer_rooms WHERE room_id = ?")
      .get(roomId);
    return row === undefined ? null : rowToRoom(row, this.memberRows(roomId));
  }

  public getRoomByGameId(gameId: string): MultiplayerRoomRecord | null {
    const row = this.database
      .prepare<[string], RoomRow>("SELECT * FROM multiplayer_rooms WHERE game_id = ?")
      .get(gameId);
    return row === undefined ? null : rowToRoom(row, this.memberRows(row.room_id));
  }

  public addMember(member: MultiplayerRoomMember, startRequestId?: string): void {
    const transaction = this.database.transaction(() => {
      // Keep membership claims behind the same durable start reservation as Deno KV. A caller
      // joining from a stale room read must not be able to insert a human seat after start wins;
      // server-owned bot filling may proceed only for that exact reservation.
      const result = this.database
        .prepare(
          `INSERT INTO multiplayer_room_members (
             room_id, player_id, display_name, seat, controller, ticket_hash, ticket_expires_at,
             is_owner, bot_difficulty, bot_personality
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM multiplayer_rooms
             WHERE room_id = ? AND game_id IS NULL AND status IN ('waiting', 'ready')
               AND (start_request_id IS NULL OR start_request_id = ?)
           )`,
        )
        .run(
          member.roomId,
          member.playerId,
          member.displayName,
          member.seat,
          member.controller,
          member.ticketHash,
          member.ticketExpiresAt,
          member.owner ? 1 : 0,
          member.botDifficulty,
          member.botPersonality,
          member.roomId,
          startRequestId ?? null,
        );
      if (result.changes !== 1) {
        const room = this.getRoom(member.roomId);
        if (room === null) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "The room does not exist",
            { reason: "room_not_found" },
            404,
          );
        }
        throw new MultiplayerServiceError(
          "invalid_request",
          "The room is not accepting joins",
          { reason: "room_already_started" },
          409,
        );
      }
      this.database
        .prepare<[string, string]>("UPDATE multiplayer_rooms SET updated_at = ? WHERE room_id = ?")
        .run(this.clock().toISOString(), member.roomId);
    });
    transaction();
  }

  public claimStart(roomId: string, requestId: string): boolean {
    const now = this.clock().toISOString();
    const result = this.database
      .prepare<[string, string, string, string]>(
        `UPDATE multiplayer_rooms
         SET start_request_id = ?, updated_at = ?
         WHERE room_id = ? AND game_id IS NULL AND status IN ('waiting', 'ready')
           AND (start_request_id IS NULL OR start_request_id = ?)`,
      )
      .run(requestId, now, roomId, requestId);
    if (result.changes === 1) {
      return false;
    }
    const room = this.getRoom(roomId);
    if (room === null) {
      throw new MultiplayerServiceError(
        "invalid_request",
        "The room does not exist",
        { reason: "room_not_found" },
        404,
      );
    }
    if (room.gameId !== null && room.startRequestId === requestId) {
      return true;
    }
    if (
      room.gameId !== null ||
      (room.startRequestId !== null && room.startRequestId !== requestId)
    ) {
      throw new MultiplayerServiceError(
        "invalid_request",
        "The room has already accepted a start request",
        { reason: "room_already_started" },
        409,
      );
    }
    throw new MultiplayerServiceError(
      "persistence_failure",
      "The room start compare-and-set failed",
      { reason: "room_start_conflict" },
      503,
    );
  }

  public closeWaitingRoom(roomId: string): boolean {
    const result = this.database
      .prepare<[string, string]>(
        `UPDATE multiplayer_rooms
         SET status = 'closed', updated_at = ?
         WHERE room_id = ? AND game_id IS NULL AND start_request_id IS NULL
           AND status IN ('waiting', 'ready')`,
      )
      .run(this.clock().toISOString(), roomId);
    return result.changes === 1;
  }

  public markReady(roomId: string, requestId: string): void {
    const result = this.database
      .prepare<[string, string, string]>(
        `UPDATE multiplayer_rooms
         SET status = 'ready', updated_at = ?
         WHERE room_id = ? AND game_id IS NULL AND start_request_id = ?
           AND status IN ('waiting', 'ready')`,
      )
      .run(this.clock().toISOString(), roomId, requestId);
    if (result.changes === 1) {
      return;
    }
    const room = this.getRoom(roomId);
    if (room?.gameId !== null && room?.startRequestId === requestId) {
      return;
    }
    throw new MultiplayerServiceError(
      "persistence_failure",
      "The room ready compare-and-set failed",
      { reason: "room_ready_conflict" },
      503,
    );
  }

  public markStarted(roomId: string, gameId: string, requestId: string): void {
    const result = this.database
      .prepare<[string, string, string, string, string]>(
        `UPDATE multiplayer_rooms
         SET status = 'active', game_id = ?, start_request_id = ?, updated_at = ?
         WHERE room_id = ? AND game_id IS NULL AND start_request_id = ?
           AND status IN ('waiting', 'ready')`,
      )
      .run(gameId, requestId, this.clock().toISOString(), roomId, requestId);
    if (result.changes === 0) {
      const room = this.getRoom(roomId);
      if (room?.gameId !== gameId || room.startRequestId !== requestId) {
        throw new Error("Room start metadata could not be committed");
      }
    }
  }

  public setStatus(roomId: string, status: RoomStatus): void {
    this.database
      .prepare<[string, string, string]>(
        "UPDATE multiplayer_rooms SET status = ?, updated_at = ? WHERE room_id = ?",
      )
      .run(status, this.clock().toISOString(), roomId);
  }

  public getMemberForTicket(
    roomId: string,
    ticket: string,
    now: number,
  ): MultiplayerRoomMember | null {
    const hash = hashTicket(ticket);
    const row = this.database
      .prepare<[string, string], MemberRow>(
        "SELECT * FROM multiplayer_room_members WHERE room_id = ? AND ticket_hash = ?",
      )
      .get(roomId, hash);
    if (row?.ticket_hash === null || row === undefined) {
      return null;
    }
    if (row.ticket_expires_at !== null && row.ticket_expires_at <= now) {
      return null;
    }
    return rowToMember(row);
  }

  public getActionReceipt(
    gameId: string,
    branchId: string,
    requestId: string,
  ): MultiplayerActionReceipt | null {
    const row = this.database
      .prepare<[string, string, string], ActionReceiptRow>(
        `SELECT * FROM multiplayer_action_receipts
         WHERE game_id = ? AND branch_id = ? AND request_id = ?`,
      )
      .get(gameId, branchId, requestId);
    return row === undefined ? null : rowToActionReceipt(row);
  }

  public saveActionReceipt(receipt: MultiplayerActionReceipt): void {
    this.database
      .prepare(
        `INSERT INTO multiplayer_action_receipts (
           game_id, branch_id, request_id, player_id, expected_revision, action_id,
           start_revision, end_revision, state_hash, created_at, source, fallback_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, branch_id, request_id) DO NOTHING`,
      )
      .run(
        receipt.gameId,
        receipt.branchId,
        receipt.requestId,
        receipt.playerId,
        receipt.expectedRevision,
        receipt.actionId,
        receipt.startRevision,
        receipt.endRevision,
        receipt.stateHash,
        receipt.createdAt,
        receipt.source,
        receipt.fallback === null ? null : JSON.stringify(receipt.fallback),
      );
  }

  public getPendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
  ): MultiplayerPendingAction | null {
    const row = this.database
      .prepare<[string, string, string], PendingActionRow>(
        `SELECT * FROM multiplayer_pending_actions
         WHERE game_id = ? AND branch_id = ? AND player_id = ?`,
      )
      .get(gameId, branchId, playerId);
    return row === undefined ? null : rowToPendingAction(row);
  }

  public savePendingAction(action: MultiplayerPendingAction): void {
    this.database
      .prepare(
        `INSERT INTO multiplayer_pending_actions (
           game_id, branch_id, player_id, request_id, expected_revision, deadline_at,
           paused_at, remaining_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, branch_id, player_id) DO UPDATE SET
           request_id = excluded.request_id,
           expected_revision = excluded.expected_revision,
           deadline_at = excluded.deadline_at,
           paused_at = excluded.paused_at,
           remaining_ms = excluded.remaining_ms`,
      )
      .run(
        action.gameId,
        action.branchId,
        action.playerId,
        action.requestId,
        action.expectedRevision,
        action.deadlineAt,
        action.pausedAt,
        action.remainingMs,
      );
  }

  public clearPendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    requestId?: string,
  ): void {
    if (requestId === undefined) {
      this.database
        .prepare<[string, string, string]>(
          "DELETE FROM multiplayer_pending_actions WHERE game_id = ? AND branch_id = ? AND player_id = ?",
        )
        .run(gameId, branchId, playerId);
      return;
    }
    this.database
      .prepare<[string, string, string, string]>(
        "DELETE FROM multiplayer_pending_actions WHERE game_id = ? AND branch_id = ? AND player_id = ? AND request_id = ?",
      )
      .run(gameId, branchId, playerId, requestId);
  }

  public pausePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    pausedAt: string,
  ): void {
    const pending = this.getPendingAction(gameId, branchId, playerId);
    if (pending?.pausedAt !== null) {
      return;
    }
    const remainingMs = Math.max(0, Date.parse(pending.deadlineAt) - Date.parse(pausedAt));
    this.savePendingAction({ ...pending, pausedAt, remainingMs });
  }

  public resumePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
    resumedAt: string,
  ): MultiplayerPendingAction | null {
    const pending = this.getPendingAction(gameId, branchId, playerId);
    if (pending?.pausedAt === undefined || pending.pausedAt === null) {
      return pending;
    }
    const resumed: MultiplayerPendingAction = {
      ...pending,
      deadlineAt: new Date(Date.parse(resumedAt) + (pending.remainingMs ?? 0)).toISOString(),
      pausedAt: null,
      remainingMs: null,
    };
    this.savePendingAction(resumed);
    return resumed;
  }

  private insertMember(member: MultiplayerRoomMember): void {
    this.database
      .prepare(
        `INSERT INTO multiplayer_room_members (
           room_id, player_id, display_name, seat, controller, ticket_hash, ticket_expires_at,
           is_owner, bot_difficulty, bot_personality
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        member.roomId,
        member.playerId,
        member.displayName,
        member.seat,
        member.controller,
        member.ticketHash,
        member.ticketExpiresAt,
        member.owner ? 1 : 0,
        member.botDifficulty,
        member.botPersonality,
      );
  }

  private memberRows(roomId: string): readonly MemberRow[] {
    return this.database
      .prepare<[string], MemberRow>(
        "SELECT * FROM multiplayer_room_members WHERE room_id = ? ORDER BY seat",
      )
      .all(roomId);
  }
}

export interface MultiplayerServiceOptions {
  readonly databasePath?: string;
  readonly roomStore?: RoomStore;
  readonly repository?: PersistenceRepository;
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

export interface ServiceErrorPayload {
  readonly code: ProtocolError["code"];
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly statusCode: number;
}

export class MultiplayerServiceError extends Error implements ServiceErrorPayload {
  public readonly statusCode: number;

  public constructor(
    public readonly code: ProtocolError["code"],
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    statusCode = 400,
  ) {
    super(message);
    this.name = "MultiplayerServiceError";
    this.statusCode = statusCode;
  }

  public get payload(): ProtocolError {
    return protocolErrorSchema.parse({
      code: this.code,
      message: this.message,
      details: this.details,
    });
  }
}

const errorResponse = (
  code: ProtocolError["code"],
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  statusCode = 400,
): never => {
  throw new MultiplayerServiceError(code, message, details, statusCode);
};

const hashTicket = (ticket: string): string =>
  `sha256:${createHash("sha256").update(ticket, "utf8").digest("hex")}`;

const requireTicketEntropy = (ticket: string): string => {
  if (Buffer.byteLength(ticket, "utf8") < 16) {
    throw new Error("Ticket factory returned less than 128 bits of ticket material");
  }
  return ticket;
};

const equalTicket = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const jsonObjectFor = (value: unknown): JsonObject =>
  asJsonObject(JSON.parse(JSON.stringify(value)) as unknown, "Ruleset definition");

const protocolObservation = (observation: PlayerObservation): PlayerObservationDto =>
  playerObservationSchema.parse(observation);

const protocolPublicEvent = (event: PublicGameEvent): PublicGameEventDto =>
  publicGameEventSchema.parse(event);

const rulesetSummary = (ruleset: ResolvedRuleset): RoomRulesetSummary => {
  const summary = listBundledRulesets().find(({ id }) => id === ruleset.definition.id);
  if (summary === undefined) {
    return {
      id: ruleset.definition.id,
      version: ruleset.definition.version,
      hash: ruleset.hash,
      displayName: ruleset.definition.displayName,
      description: ruleset.definition.description,
      disclaimer: ruleset.definition.disclaimer,
      minimumFaan: ruleset.definition.winRules.minimumFaan,
      capFaan: ruleset.definition.winRules.capFaan,
      bonusTilesEnabled: ruleset.definition.tileSet.bonusTilesEnabled,
    };
  }
  return summary;
};

const memberAtSeat = (room: MultiplayerRoomRecord, seat: Seat): MultiplayerRoomMember | null =>
  room.members.find((member) => member.seat === seat) ?? null;

const firstAvailableSeat = (room: MultiplayerRoomRecord, preferredSeat?: Seat): Seat | null => {
  if (preferredSeat !== undefined && memberAtSeat(room, preferredSeat) === null) {
    return preferredSeat;
  }
  return WINDS.find((seat) => memberAtSeat(room, seat) === null) ?? null;
};

const playerById = (room: MultiplayerRoomRecord, playerId: string): MultiplayerRoomMember | null =>
  room.members.find((member) => member.playerId === playerId) ?? null;

const gameKeyFor = (gameId: string, branchId: string): GameKey => ({ gameId, branchId });

const sessionConfigurationFor = (
  members: readonly MultiplayerRoomMember[],
): GameSessionConfigurationV1 => ({
  schemaVersion: 1,
  bots: members
    .filter((member) => member.controller === "bot")
    .map((member) => ({
      playerId: member.playerId,
      difficulty: member.botDifficulty ?? "basic",
      personality: member.botPersonality ?? "balanced",
    })),
  coach: {
    enabled: false,
    provider: "templates",
    verbosity: "normal",
  },
});

const isRoomStatusTerminal = (status: RoomStatus): boolean =>
  status === "match_ended" || status === "closed";

export interface SubmitActionInput extends ActionSubmission {
  readonly gameId: string;
  readonly ticket: string;
  /** Internal provenance; browser clients cannot set this through the public schema. */
  readonly source?: ActionSource;
  readonly fallback?: FallbackActionMetadata;
}

export interface SubmitActionResult {
  readonly accepted: true;
  readonly idempotent: boolean;
  readonly key: GameKey;
  readonly playerId: string;
  readonly requestId: string;
  readonly actionId: string;
  readonly startRevision: number;
  readonly endRevision: number;
  readonly observation: PlayerObservationDto;
  readonly publicEvents: readonly PublicGameEventDto[];
  readonly state: GameState;
  readonly source: ActionSource;
  readonly fallback: FallbackActionMetadata | null;
}

export class MultiplayerService {
  public readonly actionTimeoutMs: number;
  public readonly malformedResponseLimit: number;
  public readonly deliveryWindow: number;
  public readonly rateLimitPerMinute: number;
  public readonly allowedOrigins: readonly string[];
  public readonly repository: PersistenceRepository;
  public readonly roomStore: RoomStore;
  private readonly clock: () => Date;
  private readonly retentionMs: number;
  private readonly roomIdFactory: () => string;
  private readonly playerIdFactory: () => string;
  private readonly ticketFactory: () => string;
  private readonly engines = new Map<string, GameEngine>();
  private readonly botPolicies = new Map<string, BotPolicy>();
  private readonly ownsRepository: boolean;
  private readonly ownsRoomStore: boolean;

  public constructor(options: MultiplayerServiceOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    this.actionTimeoutMs = options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
    this.malformedResponseLimit =
      options.malformedResponseLimit ?? DEFAULT_MALFORMED_RESPONSE_LIMIT;
    this.deliveryWindow = options.deliveryWindow ?? DEFAULT_DELIVERY_WINDOW;
    this.rateLimitPerMinute = options.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
    this.allowedOrigins = options.allowedOrigins ?? [
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ];
    this.roomIdFactory =
      options.roomIdFactory ?? (() => `room_${randomUUID().replaceAll("-", "")}`);
    this.playerIdFactory =
      options.playerIdFactory ?? (() => `p_${randomUUID().replaceAll("-", "")}`);
    this.ticketFactory =
      options.ticketFactory ?? (() => `v1.${randomBytes(24).toString("base64url")}`);
    const databasePath = options.databasePath ?? DEFAULT_DATABASE_PATH;
    this.roomStore = options.roomStore ?? new SqliteRoomStore(databasePath, this.clock);
    this.ownsRoomStore = options.roomStore === undefined;
    this.repository =
      options.repository ??
      new SqlitePersistenceRepository({
        databasePath,
        reducer: reduceGameEvent,
        legalActions: (state, playerId, definition) =>
          this.engineForDefinition(definition).legalActions(state, playerId),
        validateRulesetDefinition: (definition) => {
          const resolved = resolveRuleset(definition);
          return {
            definition: resolved.definition,
            hash: resolved.hash,
            coreRules: toCoreGameRules(resolved),
          };
        },
        clock: () => this.clock().toISOString(),
      });
    this.ownsRepository = options.repository === undefined;
  }

  public close(): void {
    if (this.ownsRepository) {
      this.repository.close();
    }
    if (this.ownsRoomStore) {
      this.roomStore.close();
    }
  }

  public listRulesets(): readonly RoomRulesetSummary[] {
    return listBundledRulesets();
  }

  public createRoom(request: RoomCreateRequest): RoomCreateResponse {
    const input = roomCreateRequestSchema.parse(request);
    let ruleset: ResolvedRuleset;
    try {
      ruleset = getBundledRuleset(input.rulesetId);
    } catch {
      return errorResponse(
        "invalid_request",
        "The requested ruleset is unavailable",
        { reason: "ruleset_invalid", rulesetId: input.rulesetId },
        400,
      );
    }
    const roomId = inputRoomId(this.roomIdFactory());
    const playerId = inputPlayerId(this.playerIdFactory());
    const ticket = requireTicketEntropy(this.ticketFactory());
    const seat = input.preferredSeat ?? "east";
    const nowDate = this.clock();
    const now = nowDate.toISOString();
    const member: MultiplayerRoomMember = {
      roomId,
      playerId,
      displayName: input.displayName,
      seat,
      controller: "human",
      ticketHash: hashTicket(ticket),
      ticketExpiresAt: nowDate.getTime() + this.retentionMs,
      owner: true,
      botDifficulty: null,
      botPersonality: null,
    };
    const record: MultiplayerRoomRecord = {
      roomId,
      status: "waiting",
      rulesetId: ruleset.definition.id,
      rulesetVersion: ruleset.definition.version,
      rulesetHash: ruleset.hash,
      rulesetDefinition: jsonObjectFor(ruleset.definition),
      matchLength: input.matchLength,
      seed: input.seed,
      fillPolicy: input.fillPolicy,
      disconnectPolicy: input.disconnectPolicy,
      ownerPlayerId: playerId,
      gameId: null,
      startRequestId: null,
      createdAt: now,
      updatedAt: now,
      members: [member],
    };
    try {
      this.roomStore.createRoom(record);
    } catch (caught) {
      return errorResponse(
        "persistence_failure",
        "The room could not be created",
        { reason: caught instanceof Error ? caught.message : "room_create_failed" },
        503,
      );
    }
    return {
      roomId,
      status: "waiting",
      playerId,
      seat,
      ticket,
      ruleset: rulesetSummary(ruleset),
    };
  }

  public joinRoom(
    roomId: string,
    request: RoomJoinRequest,
    reconnectTicket?: string,
  ): RoomJoinResponse {
    const input = roomJoinRequestSchema.parse(request);
    const room = this.requireRoom(roomId);
    if (reconnectTicket !== undefined) {
      if (room.status === "closed") {
        return errorResponse(
          "invalid_request",
          "The room is closed and cannot be reconnected",
          { reason: "room_closed" },
          409,
        );
      }
      const existing = this.roomStore.getMemberForTicket(
        roomId,
        reconnectTicket,
        this.clock().getTime(),
      );
      if (existing !== null) {
        return {
          roomId,
          status: room.status,
          playerId: existing.playerId,
          seat: existing.seat,
          ticket: reconnectTicket,
        };
      }
      return errorResponse("invalid_request", "The room ticket is invalid", {
        reason: "invalid_ticket",
      });
    }
    if ((room.status !== "waiting" && room.status !== "ready") || room.startRequestId !== null) {
      return errorResponse(
        "invalid_request",
        "The room is no longer accepting joins",
        {
          reason: "room_already_started",
        },
        409,
      );
    }
    const seat = firstAvailableSeat(room, input.preferredSeat);
    if (seat === null) {
      return errorResponse(
        "invalid_request",
        "The room has no available seat",
        {
          reason: "room_full",
        },
        409,
      );
    }
    const playerId = inputPlayerId(this.playerIdFactory());
    const ticket = requireTicketEntropy(this.ticketFactory());
    const nowDate = this.clock();
    const member: MultiplayerRoomMember = {
      roomId,
      playerId,
      displayName: input.displayName,
      seat,
      controller: "human",
      ticketHash: hashTicket(ticket),
      ticketExpiresAt: nowDate.getTime() + this.retentionMs,
      owner: false,
      botDifficulty: null,
      botPersonality: null,
    };
    try {
      this.roomStore.addMember(member);
    } catch (caught) {
      if (
        caught instanceof MultiplayerServiceError &&
        caught.details.reason === "room_already_started"
      ) {
        return errorResponse(
          "invalid_request",
          "The room is no longer accepting joins",
          { reason: "room_already_started" },
          409,
        );
      }
      return errorResponse(
        "invalid_request",
        "The requested seat is no longer available",
        { reason: "seat_taken" },
        409,
      );
    }
    const updatedRoom = this.requireRoom(roomId);
    return { roomId, status: updatedRoom.status, playerId, seat, ticket };
  }

  public inspectRoom(roomId: string): RoomInspectionResponse {
    const room = this.requireRoom(roomId);
    const ruleset = resolveRuleset(room.rulesetDefinition);
    return {
      roomId: room.roomId,
      status: room.status,
      ruleset: rulesetSummary(ruleset),
      matchLength: room.matchLength,
      fillPolicy: room.fillPolicy,
      disconnectPolicy: room.disconnectPolicy,
      occupiedSeats: room.members.map(({ seat }) => seat),
      acceptingJoins:
        room.members.length < WINDS.length &&
        room.startRequestId === null &&
        (room.status === "waiting" || room.status === "ready"),
      gameId: room.gameId,
    };
  }

  /** Closes a waiting room at the owner's request without creating a game. */
  public closeRoom(roomId: string, ownerTicket: string): RoomInspectionResponse {
    const room = this.requireRoom(roomId);
    const owner = this.authenticateMember(room, room.ownerPlayerId, ownerTicket);
    if (!owner.owner) {
      return errorResponse(
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
      return errorResponse(
        "invalid_request",
        "Only a waiting room can be closed",
        { reason: "room_already_started" },
        409,
      );
    }
    if (!this.roomStore.closeWaitingRoom(roomId)) {
      const current = this.requireRoom(roomId);
      if (
        current.gameId !== null ||
        current.startRequestId !== null ||
        (current.status !== "waiting" && current.status !== "ready")
      ) {
        return errorResponse(
          "invalid_request",
          "Only a waiting room can be closed",
          { reason: "room_already_started" },
          409,
        );
      }
      return errorResponse(
        "persistence_failure",
        "The room close compare-and-set failed",
        { reason: "room_close_conflict" },
        503,
      );
    }
    return this.inspectRoom(roomId);
  }

  public startRoom(
    roomId: string,
    ownerTicket: string,
    requestId = `start:${roomId}`,
  ): RoomStartResponse {
    const room = this.requireRoom(roomId);
    const owner = this.authenticateMember(room, room.ownerPlayerId, ownerTicket);
    if (!owner.owner) {
      return errorResponse(
        "invalid_request",
        "Only the room owner can start the room",
        {
          reason: "owner_required",
        },
        401,
      );
    }
    if (room.gameId !== null) {
      if (room.startRequestId === requestId) {
        const loaded = this.loadRoomGame(room, owner.playerId);
        return {
          roomId,
          status: "active",
          game: { gameId: loaded.key.gameId, branchId: MAIN_BRANCH_ID },
          observation: protocolObservation(loaded.observation),
        };
      }
      return errorResponse(
        "invalid_request",
        "The room has already started",
        {
          reason: "room_already_started",
        },
        409,
      );
    }
    if (room.status !== "waiting" && room.status !== "ready") {
      return errorResponse(
        "invalid_request",
        "The room is not ready to start",
        {
          reason: "room_not_ready",
        },
        409,
      );
    }

    const members = [...room.members];
    if (room.fillPolicy === "wait_for_four" && members.length !== WINDS.length) {
      return errorResponse(
        "invalid_request",
        "Four human seats are required before starting",
        {
          reason: "room_not_ready",
        },
        409,
      );
    }
    if (this.roomStore.claimStart(roomId, requestId)) {
      const loaded = this.loadRoomGame(this.requireRoom(roomId), owner.playerId);
      return {
        roomId,
        status: "active",
        game: { gameId: loaded.key.gameId, branchId: MAIN_BRANCH_ID },
        observation: protocolObservation(loaded.observation),
      };
    }
    if (room.fillPolicy === "fill_with_bots") {
      for (const seat of WINDS) {
        if (memberAtSeat(room, seat) !== null) {
          continue;
        }
        const bot: MultiplayerRoomMember = {
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
          this.roomStore.addMember(bot, requestId);
        } catch (caught) {
          const latest = this.requireRoom(roomId);
          if (memberAtSeat(latest, seat)?.playerId !== bot.playerId) {
            throw caught;
          }
        }
      }
    }
    const currentRoom = this.requireRoom(roomId);
    // `ready` means the owner has requested the start and every required seat is
    // present. Keep the reservation durable before exposing this intermediate state.
    if (currentRoom.members.length !== WINDS.length) {
      return errorResponse(
        "invalid_request",
        "The room has an incomplete seat assignment",
        { reason: "room_not_ready" },
        409,
      );
    }
    this.roomStore.markReady(roomId, requestId);
    const players = WINDS.map((seat) => {
      const member = memberAtSeat(currentRoom, seat);
      if (member === null) {
        throw new MultiplayerServiceError(
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
    const ruleset = resolveRuleset(currentRoom.rulesetDefinition);
    const engine = this.engineForRuleset(ruleset);
    const created = engine.create({
      type: "create_game",
      requestId,
      branchId: MAIN_BRANCH_ID,
      seed: currentRoom.seed,
      mode: "competitive",
      matchLength: currentRoom.matchLength,
      rules: toCoreGameRules(ruleset),
      players,
    });
    if (!created.accepted) {
      return errorResponse(created.error.code, created.error.message, created.error.details);
    }
    const key = gameKeyFor(created.state.gameId, MAIN_BRANCH_ID);
    try {
      this.repository.appendAcceptedCommand({
        key,
        requestId,
        events: created.events,
        state: created.state,
        rulesetDefinition: currentRoom.rulesetDefinition,
        sessionConfiguration: sessionConfigurationFor(currentRoom.members),
      });
      this.roomStore.markStarted(roomId, created.state.gameId, requestId);
      this.advanceBotTurns(created.state.gameId);
    } catch (caught) {
      return this.persistenceFailure(caught);
    }
    const loaded = this.loadRoomGame(this.requireRoom(roomId), owner.playerId);
    return {
      roomId,
      status: "active",
      game: { gameId: key.gameId, branchId: MAIN_BRANCH_ID },
      observation: protocolObservation(loaded.observation),
    };
  }

  public getObservation(
    gameId: string,
    playerId: string,
    branchId: string,
    ticket: string,
  ): PlayerObservationDto {
    const context = this.authenticateGame(gameId, branchId, playerId, ticket);
    return protocolObservation(context.observation);
  }

  public getReplay(
    gameId: string,
    playerId: string,
    branchId: string,
    ticket: string,
  ): z.output<typeof replayResponseSchema> {
    const context = this.authenticateGame(gameId, branchId, playerId, ticket);
    const loaded = context.loaded;
    const events = this.publicEventsFor(context.key, 0, loaded.state.revision);
    return replayResponseSchema.parse({
      game: context.key,
      viewerPlayerId: playerId,
      events,
      terminalObservation: protocolObservation(context.observation),
      omniscientAvailable: false,
    });
  }

  public publicEventsFor(
    key: GameKey,
    fromRevision: number,
    toRevision?: number,
  ): readonly PublicGameEventDto[] {
    const exported = this.repository.exportData({ includeLlmMetadata: false });
    const events = exported.data.events
      .filter(
        (stored) =>
          stored.key.gameId === key.gameId &&
          stored.key.branchId === key.branchId &&
          (toRevision === undefined || stored.revision <= toRevision),
      )
      .sort((left, right) => left.revision - right.revision)
      .map(({ event }) => event);
    return projectPublicEventStream(events)
      .filter(
        (event) =>
          event.revision > fromRevision &&
          (toRevision === undefined || event.revision <= toRevision),
      )
      .map(protocolPublicEvent);
  }

  public submitAction(input: SubmitActionInput): SubmitActionResult {
    const source = input.source ?? "human";
    const fallback = input.fallback ?? null;
    if (source === "timeout_fallback" && fallback === null) {
      return errorResponse(
        "invalid_request",
        "Timeout fallback metadata is required for a server-owned action",
        { reason: "fallback_metadata_missing" },
      );
    }
    if (source !== "timeout_fallback" && fallback !== null) {
      return errorResponse(
        "invalid_request",
        "Fallback metadata is only valid for a timeout fallback",
        { reason: "fallback_metadata_unexpected" },
      );
    }
    const action = actionSubmissionSchema.parse({
      playerId: input.playerId,
      branchId: input.branchId,
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      actionId: input.actionId,
    });
    const context = this.authenticateGame(
      input.gameId,
      action.branchId,
      action.playerId,
      input.ticket,
    );
    if (context.room.status === "closed" || context.room.status === "match_ended") {
      return errorResponse(
        "invalid_request",
        "The room is read-only",
        { reason: context.room.status === "closed" ? "room_closed" : "match_ended" },
        409,
      );
    }
    const key = context.key;
    const existing = this.roomStore.getActionReceipt(key.gameId, key.branchId, action.requestId);
    if (existing !== null) {
      if (
        existing.playerId !== action.playerId ||
        existing.expectedRevision !== action.expectedRevision ||
        existing.actionId !== action.actionId
      ) {
        return errorResponse(
          "duplicate_request",
          "The request ID is already bound to another action",
          {
            requestId: action.requestId,
          },
        );
      }
      return this.idempotentActionResult(context, existing);
    }
    const durableReceipt = this.repository.getCommandReceipt(key, action.requestId);
    if (durableReceipt !== null) {
      if (!this.durableReceiptMatches(context, durableReceipt, action)) {
        return errorResponse(
          "duplicate_request",
          "The request ID is already bound to another action",
          { requestId: action.requestId },
        );
      }
      const result = this.resultFromDurableReceipt(context, durableReceipt, action);
      this.roomStore.saveActionReceipt(result.receipt);
      return result.result;
    }
    const loaded = context.loaded;
    if (loaded.state.revision !== action.expectedRevision) {
      return errorResponse(
        "stale_revision",
        "The action revision is stale",
        {
          currentRevision: loaded.state.revision,
          stateHash: loaded.state.stateHash,
          observation: protocolObservation(context.observation),
        },
        409,
      );
    }
    const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
    const decided = engine.decide(loaded.state, {
      type: "submit_action",
      gameId: key.gameId,
      branchId: key.branchId,
      playerId: action.playerId,
      expectedRevision: action.expectedRevision,
      requestId: action.requestId,
      actionId: action.actionId,
    });
    if (!decided.accepted) {
      return errorResponse(decided.error.code, decided.error.message, decided.error.details, 409);
    }
    try {
      const appended = this.repository.appendAcceptedCommand({
        key,
        requestId: action.requestId,
        events: decided.events,
        state: decided.state,
      });
      const receipt: MultiplayerActionReceipt = {
        gameId: key.gameId,
        branchId: key.branchId,
        requestId: action.requestId,
        playerId: action.playerId,
        expectedRevision: action.expectedRevision,
        actionId: action.actionId,
        startRevision: appended.startRevision,
        endRevision: appended.endRevision,
        stateHash: appended.stateHash,
        createdAt: this.clock().toISOString(),
        source,
        fallback,
      };
      this.roomStore.saveActionReceipt(receipt);
      this.roomStore.clearPendingAction(
        key.gameId,
        key.branchId,
        action.playerId,
        action.requestId,
      );
      this.updateRoomStatus(key.gameId, decided.state.phase);
      return {
        accepted: true,
        idempotent: appended.disposition === "idempotent",
        key,
        playerId: action.playerId,
        requestId: action.requestId,
        actionId: action.actionId,
        startRevision: appended.startRevision,
        endRevision: appended.endRevision,
        observation: protocolObservation(engine.observation(decided.state, action.playerId)),
        publicEvents: decided.publicEvents.map(protocolPublicEvent),
        state: decided.state,
        source,
        fallback,
      };
    } catch (caught) {
      if (caught instanceof PersistenceConflictError) {
        const current = this.repository.loadGame(key);
        const currentEngine = this.engineForDefinition(current.game.rulesetDefinition);
        return errorResponse(
          "stale_revision",
          "The action lost the revision compare-and-set",
          {
            currentRevision: current.state.revision,
            stateHash: current.state.stateHash,
            observation: protocolObservation(
              currentEngine.observation(current.state, action.playerId),
            ),
          },
          409,
        );
      }
      return this.persistenceFailure(caught);
    }
  }

  public actionRequestId(
    gameId: string,
    branchId: string,
    revision: number,
    playerId: string,
  ): string {
    return `action:${gameId}:${branchId}:${String(revision)}:${playerId}`;
  }

  public registerPendingAction(input: MultiplayerPendingAction): void {
    this.roomStore.savePendingAction(input);
  }

  public pendingActionFor(
    gameId: string,
    branchId: string,
    playerId: string,
  ): MultiplayerPendingAction | null {
    return this.roomStore.getPendingAction(gameId, branchId, playerId);
  }

  public pausePendingAction(gameId: string, branchId: string, playerId: string): void {
    this.roomStore.pausePendingAction(gameId, branchId, playerId, this.clock().toISOString());
  }

  public resumePendingAction(
    gameId: string,
    branchId: string,
    playerId: string,
  ): MultiplayerPendingAction | null {
    return this.roomStore.resumePendingAction(
      gameId,
      branchId,
      playerId,
      this.clock().toISOString(),
    );
  }

  /** Selects and applies one deterministic observation-only action after a deadline. */
  public submitTimeoutFallback(
    gameId: string,
    branchId: string,
    playerId: string,
    ticket: string,
    requestId: string,
    expectedRevision: number,
    deadline: string,
    reason: "action_timeout" | "disconnect_timeout",
  ): SubmitActionResult | null {
    const context = this.authenticateGame(gameId, branchId, playerId, ticket);
    const pending = this.roomStore.getPendingAction(gameId, branchId, playerId);
    if (
      pending?.requestId !== requestId ||
      pending.expectedRevision !== expectedRevision ||
      pending.deadlineAt !== deadline
    ) {
      return null;
    }
    const now = this.clock().getTime();
    if (pending.pausedAt !== null || Date.parse(pending.deadlineAt) > now) {
      return null;
    }
    const policy = this.botPolicyFor(context.member, context.loaded.game.rulesetDefinition);
    const decision = policy.decide(context.observation);
    const actionId = decision?.actionId ?? context.observation.legalActions[0]?.id;
    if (actionId === undefined) {
      this.roomStore.clearPendingAction(gameId, branchId, playerId, requestId);
      return null;
    }
    const appliedAt = this.clock().toISOString();
    return this.submitAction({
      gameId,
      branchId,
      playerId,
      expectedRevision,
      requestId,
      actionId,
      ticket,
      source: "timeout_fallback",
      fallback: {
        source: "timeout_fallback",
        reason,
        deadline,
        appliedAt,
      },
    });
  }

  /** Advances deterministic bot seats until a human seat or a terminal state is reached. */
  public advanceBotTurns(gameId: string, maximumTurns = 64): readonly SubmitActionResult[] {
    const results: SubmitActionResult[] = [];
    for (let turn = 0; turn < maximumTurns; turn += 1) {
      const room = this.roomForGame(gameId);
      if (room.gameId === null || room.status === "match_ended" || room.status === "closed") {
        break;
      }
      const loaded = this.repository.loadGame(gameKeyFor(gameId, MAIN_BRANCH_ID));
      if (loaded.state.phase === "match_ended") {
        break;
      }
      const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
      let selected: {
        readonly member: MultiplayerRoomMember;
        readonly actionId: string;
      } | null = null;
      for (const member of room.members) {
        if (member.controller !== "bot") {
          continue;
        }
        const observation = engine.observation(loaded.state, member.playerId);
        if (observation.legalActions.length === 0) {
          continue;
        }
        const decision = this.botPolicyFor(member, loaded.game.rulesetDefinition).decide(
          observation,
        );
        const actionId = decision?.actionId ?? observation.legalActions[0]?.id;
        if (actionId !== undefined) {
          selected = { member, actionId };
          break;
        }
      }
      if (selected === null) {
        break;
      }
      const requestId = `bot:${gameId}:${String(loaded.state.revision)}:${selected.member.playerId}`;
      const decided = engine.decide(loaded.state, {
        type: "submit_action",
        gameId,
        branchId: MAIN_BRANCH_ID,
        playerId: selected.member.playerId,
        expectedRevision: loaded.state.revision,
        requestId,
        actionId: selected.actionId,
      });
      if (!decided.accepted) {
        break;
      }
      const appended = this.repository.appendAcceptedCommand({
        key: gameKeyFor(gameId, MAIN_BRANCH_ID),
        requestId,
        events: decided.events,
        state: decided.state,
      });
      const receipt: MultiplayerActionReceipt = {
        gameId,
        branchId: MAIN_BRANCH_ID,
        requestId,
        playerId: selected.member.playerId,
        expectedRevision: loaded.state.revision,
        actionId: selected.actionId,
        startRevision: appended.startRevision,
        endRevision: appended.endRevision,
        stateHash: appended.stateHash,
        createdAt: this.clock().toISOString(),
        source: "bot",
        fallback: null,
      };
      this.roomStore.saveActionReceipt(receipt);
      this.updateRoomStatus(gameId, decided.state.phase);
      results.push({
        accepted: true,
        idempotent: appended.disposition === "idempotent",
        key: gameKeyFor(gameId, MAIN_BRANCH_ID),
        playerId: selected.member.playerId,
        requestId,
        actionId: selected.actionId,
        startRevision: appended.startRevision,
        endRevision: appended.endRevision,
        observation: protocolObservation(
          engine.observation(decided.state, selected.member.playerId),
        ),
        publicEvents: decided.publicEvents.map(protocolPublicEvent),
        state: decided.state,
        source: "bot",
        fallback: null,
      });
    }
    return results;
  }

  public authenticateTicket(
    roomId: string,
    playerId: string,
    ticket: string,
  ): MultiplayerRoomMember {
    const room = this.requireRoom(roomId);
    return this.authenticateMember(room, playerId, ticket);
  }

  public roomForGame(gameId: string): MultiplayerRoomRecord {
    const room = this.roomStore.getRoomByGameId(gameId);
    if (room === null) {
      return errorResponse(
        "unknown_game",
        "The game does not belong to a multiplayer room",
        {},
        404,
      );
    }
    return this.roomWithRetention(room);
  }

  public allowsOrigin(origin: string | undefined): boolean {
    return origin === undefined || this.allowedOrigins.includes(origin);
  }

  /** Returns the authoritative server clock used for durable deadlines and retention checks. */
  public nowMs(): number {
    return this.clock().getTime();
  }

  private idempotentActionResult(
    context: AuthenticatedGameContext,
    receipt: MultiplayerActionReceipt,
  ): SubmitActionResult {
    const loaded = this.repository.loadGameAtRevision(context.key, receipt.endRevision);
    const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
    return {
      accepted: true,
      idempotent: true,
      key: context.key,
      playerId: receipt.playerId,
      requestId: receipt.requestId,
      actionId: receipt.actionId,
      startRevision: receipt.startRevision,
      endRevision: receipt.endRevision,
      observation: protocolObservation(engine.observation(loaded.state, receipt.playerId)),
      publicEvents: this.publicEventsFor(
        context.key,
        receipt.startRevision - 1,
        receipt.endRevision,
      ),
      state: loaded.state,
      source: receipt.source,
      fallback: receipt.fallback,
    };
  }

  private resultFromDurableReceipt(
    context: AuthenticatedGameContext,
    receipt: CommandReceipt,
    action: ActionSubmission,
  ): { receipt: MultiplayerActionReceipt; result: SubmitActionResult } {
    const loaded = this.repository.loadGameAtRevision(context.key, receipt.endRevision);
    const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
    const multiplayerReceipt: MultiplayerActionReceipt = {
      gameId: context.key.gameId,
      branchId: context.key.branchId,
      requestId: action.requestId,
      playerId: action.playerId,
      expectedRevision: receipt.startRevision - 1,
      actionId: action.actionId,
      startRevision: receipt.startRevision,
      endRevision: receipt.endRevision,
      stateHash: receipt.stateHash,
      createdAt: receipt.createdAt,
      source: "human",
      fallback: null,
    };
    return {
      receipt: multiplayerReceipt,
      result: {
        accepted: true,
        idempotent: true,
        key: context.key,
        playerId: action.playerId,
        requestId: action.requestId,
        actionId: action.actionId,
        startRevision: receipt.startRevision,
        endRevision: receipt.endRevision,
        observation: protocolObservation(engine.observation(loaded.state, action.playerId)),
        publicEvents: this.publicEventsFor(
          context.key,
          receipt.startRevision - 1,
          receipt.endRevision,
        ),
        state: loaded.state,
        source: "human",
        fallback: null,
      },
    };
  }

  private durableReceiptMatches(
    context: AuthenticatedGameContext,
    receipt: CommandReceipt,
    action: ActionSubmission,
  ): boolean {
    if (receipt.startRevision < 2 || receipt.endRevision < receipt.startRevision) {
      return false;
    }
    try {
      const before = this.repository.loadGameAtRevision(context.key, receipt.startRevision - 1);
      if (before.state.revision !== action.expectedRevision) {
        return false;
      }
      const decided = this.engineForDefinition(before.game.rulesetDefinition).decide(before.state, {
        type: "submit_action",
        gameId: context.key.gameId,
        branchId: context.key.branchId,
        playerId: action.playerId,
        expectedRevision: action.expectedRevision,
        requestId: action.requestId,
        actionId: action.actionId,
      });
      return decided.accepted && decided.state.stateHash === receipt.stateHash;
    } catch {
      return false;
    }
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

  private engineForDefinition(definition: unknown): GameEngine {
    return this.engineForRuleset(resolveRuleset(definition));
  }

  private botPolicyFor(member: MultiplayerRoomMember, definition: unknown): BotPolicy {
    const ruleset = resolveRuleset(definition);
    const key = `${member.playerId}:${ruleset.hash}`;
    const existing = this.botPolicies.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const policy = createBotPolicy({
      botId: member.playerId,
      difficulty: member.botDifficulty ?? "basic",
      personality: member.botPersonality ?? "balanced",
      ruleset,
    });
    this.botPolicies.set(key, policy);
    return policy;
  }

  private requireRoom(roomId: string): MultiplayerRoomRecord {
    const room = this.roomStore.getRoom(roomId);
    if (room === null) {
      return errorResponse(
        "invalid_request",
        "The room does not exist",
        {
          reason: "room_not_found",
        },
        404,
      );
    }
    return this.roomWithRetention(room);
  }

  private roomWithRetention(room: MultiplayerRoomRecord): MultiplayerRoomRecord {
    if (room.status === "closed") {
      return room;
    }
    const updatedAt = Date.parse(room.updatedAt);
    if (!Number.isFinite(updatedAt) || this.nowMs() - updatedAt < this.retentionMs) {
      return room;
    }
    if (room.status === "waiting" || room.status === "ready") {
      if (!this.roomStore.closeWaitingRoom(room.roomId)) {
        return this.roomStore.getRoom(room.roomId) ?? room;
      }
      return { ...room, status: "closed", updatedAt: this.clock().toISOString() };
    }
    this.roomStore.setStatus(room.roomId, "closed");
    return { ...room, status: "closed", updatedAt: this.clock().toISOString() };
  }

  private authenticateMember(
    room: MultiplayerRoomRecord,
    playerId: string,
    ticket: string,
  ): MultiplayerRoomMember {
    if (ticket.trim().length === 0) {
      return errorResponse(
        "invalid_request",
        "A room ticket is required",
        {
          reason: "invalid_ticket",
        },
        401,
      );
    }
    const member = this.roomStore.getMemberForTicket(room.roomId, ticket, this.clock().getTime());
    if (member === null) {
      return errorResponse(
        "invalid_request",
        "The room ticket is invalid",
        {
          reason: "invalid_ticket",
        },
        401,
      );
    }
    if (
      member.playerId !== playerId ||
      member.ticketHash === null ||
      !equalTicket(member.ticketHash, hashTicket(ticket))
    ) {
      return errorResponse(
        "invalid_request",
        "The room ticket is invalid",
        {
          reason: "invalid_ticket",
        },
        401,
      );
    }
    return member;
  }

  public authenticateGame(
    gameId: string,
    branchId: string,
    playerId: string,
    ticket: string,
    ticketPlayerIdAlreadyChecked = false,
  ): AuthenticatedGameContext {
    if (branchId !== MAIN_BRANCH_ID) {
      return errorResponse(
        "invalid_request",
        "Only the main multiplayer branch is available",
        {
          reason: "branch_unavailable",
        },
        409,
      );
    }
    const room = this.roomForGame(gameId);
    if (room.status === "closed") {
      return errorResponse(
        "invalid_request",
        "The room is closed and cannot be reconnected",
        { reason: "room_closed" },
        409,
      );
    }
    if (!ticketPlayerIdAlreadyChecked) {
      this.authenticateMember(room, playerId, ticket);
    }
    const member = playerById(room, playerId);
    if (member === null) {
      return errorResponse("unknown_player", "The player is not seated in this room", {}, 404);
    }
    let loaded: ReturnType<PersistenceRepository["loadGame"]>;
    try {
      loaded = this.repository.loadGame(gameKeyFor(gameId, branchId));
    } catch (caught) {
      if (caught instanceof PersistenceNotFoundError) {
        return errorResponse("unknown_game", "The game is not available", {}, 404);
      }
      return this.persistenceFailure(caught);
    }
    const engine = this.engineForDefinition(loaded.game.rulesetDefinition);
    return {
      room,
      member,
      key: gameKeyFor(gameId, branchId),
      loaded,
      observation: engine.observation(loaded.state, playerId),
    };
  }

  private loadRoomGame(
    room: MultiplayerRoomRecord,
    playerId: string,
  ): {
    key: GameKey;
    loaded: ReturnType<PersistenceRepository["loadGame"]>;
    observation: PlayerObservation;
  } {
    if (room.gameId === null) {
      return errorResponse("unknown_game", "The room has not started a game", {}, 404);
    }
    return this.authenticateGame(
      room.gameId,
      MAIN_BRANCH_ID,
      playerId,
      "internal-room-access",
      true,
    );
  }

  private updateRoomStatus(gameId: string, phase: GameState["phase"]): void {
    const room = this.roomStore.getRoomByGameId(gameId);
    if (room === null) {
      return;
    }
    if (phase === "match_ended") {
      this.roomStore.setStatus(room.roomId, "match_ended");
    } else if (phase === "hand_ended") {
      this.roomStore.setStatus(room.roomId, "hand_ended");
    } else if (!isRoomStatusTerminal(room.status)) {
      this.roomStore.setStatus(room.roomId, "active");
    }
  }

  private persistenceFailure(caught: unknown): never {
    return errorResponse(
      "persistence_failure",
      "The durable game store rejected the command",
      { reason: caught instanceof PersistenceError ? caught.message : "persistence_failure" },
      503,
    );
  }
}

interface AuthenticatedGameContext {
  readonly room: MultiplayerRoomRecord;
  readonly member: MultiplayerRoomMember;
  readonly key: GameKey;
  readonly loaded: ReturnType<PersistenceRepository["loadGame"]>;
  readonly observation: PlayerObservation;
}

const inputRoomId = (value: string): string => {
  if (value.trim().length === 0) {
    throw new Error("Room ID factory returned an empty ID");
  }
  return value;
};

const inputPlayerId = (value: string): string => {
  if (value.trim().length === 0) {
    throw new Error("Player ID factory returned an empty ID");
  }
  return value;
};

export interface MultiplayerSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...arguments_: unknown[]) => void): void;
}

interface SocketConnection {
  readonly socket: MultiplayerSocketLike;
  readonly gameId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly seat: Seat;
  readonly sequence: ProtocolSequenceValidator;
  nextSequence: number;
  lastPublicRevision: number;
  readonly acceptedRequestIds: Set<string>;
  lastTerminalRevision: number;
  malformedCount: number;
  messageTimes: number[];
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  pendingRequest: {
    requestId: string;
    expectedRevision: number;
    deadline: string;
  } | null;
}

const rawFrameText = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString("utf8");
  }
  if (Array.isArray(value) && value.every((item) => Buffer.isBuffer(item))) {
    return Buffer.concat(value).toString("utf8");
  }
  return null;
};

const rawFrameBytes = (value: unknown): number => {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8");
  }
  if (Buffer.isBuffer(value)) {
    return value.byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (Array.isArray(value) && value.every((item) => Buffer.isBuffer(item))) {
    return value.reduce((total, item) => total + item.byteLength, 0);
  }
  return MAX_FRAME_BYTES + 1;
};

export class MultiplayerSocketHub {
  private readonly connections = new Set<SocketConnection>();

  public constructor(private readonly service: MultiplayerService) {}

  public attach(
    socket: MultiplayerSocketLike,
    input: {
      readonly gameId: string;
      readonly playerId: string;
      readonly branchId: string;
      readonly ticket: string;
      readonly fromRevision: number;
      readonly origin?: string;
    },
  ): void {
    if (!this.service.allowsOrigin(input.origin)) {
      socket.close(1008, "origin_not_allowed");
      return;
    }
    let member: MultiplayerRoomMember;
    try {
      member = this.service.authenticateGame(
        input.gameId,
        input.branchId,
        input.playerId,
        input.ticket,
      ).member;
    } catch {
      socket.close(1008, "invalid_ticket");
      return;
    }
    const connection: SocketConnection = {
      socket,
      gameId: input.gameId,
      branchId: input.branchId,
      playerId: input.playerId,
      ticket: input.ticket,
      seat: member.seat,
      sequence: new ProtocolSequenceValidator(),
      nextSequence: 0,
      lastPublicRevision: input.fromRevision,
      acceptedRequestIds: new Set<string>(),
      lastTerminalRevision: -1,
      malformedCount: 0,
      messageTimes: [],
      timeoutHandle: null,
      pendingRequest: null,
    };
    this.connections.add(connection);
    socket.on("message", (...arguments_) => {
      const [data, isBinary] = arguments_;
      this.handleMessage(connection, data, isBinary === true);
    });
    socket.on("close", () => this.disconnect(connection));
    socket.on("error", () => this.disconnect(connection));
    try {
      this.sendJoinSequence(connection, input.fromRevision);
    } catch {
      this.connections.delete(connection);
      socket.close(1011, "join_failed");
    }
  }

  private disconnect(connection: SocketConnection): void {
    this.connections.delete(connection);
    if (connection.timeoutHandle !== null) {
      clearTimeout(connection.timeoutHandle);
      connection.timeoutHandle = null;
    }
    if (connection.pendingRequest === null) {
      return;
    }
    try {
      const room = this.service.roomForGame(connection.gameId);
      if (room.disconnectPolicy === "pause_on_disconnect") {
        this.service.pausePendingAction(
          connection.gameId,
          connection.branchId,
          connection.playerId,
        );
      } else {
        this.scheduleTimeout(connection, connection.pendingRequest, true);
      }
    } catch {
      // The room may have ended between the close event and this bookkeeping update.
    }
  }

  private sendJoinSequence(connection: SocketConnection, fromRevision: number): void {
    const context = this.service.authenticateGame(
      connection.gameId,
      connection.branchId,
      connection.playerId,
      connection.ticket,
    );
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
          observation: protocolObservation(context.observation),
        });
      }
      this.send(connection, "observation", protocolObservation(context.observation));
      connection.lastPublicRevision = currentRevision;
      this.sendError(connection, {
        code: "invalid_request",
        message: "The requested replay range is outside the live delivery window",
        details: { resyncRequired: true, currentRevision },
      });
      this.sendActionRequest(connection, protocolObservation(context.observation));
      return;
    }
    if (fromRevision < 1) {
      this.send(connection, "game_started", {
        observation: protocolObservation(context.observation),
      });
    }
    for (const event of this.service.publicEventsFor(context.key, fromRevision, currentRevision)) {
      this.send(connection, "public_event", { event });
      connection.lastPublicRevision = Math.max(connection.lastPublicRevision, event.revision);
    }
    this.send(connection, "observation", protocolObservation(context.observation));
    this.sendActionRequest(connection, protocolObservation(context.observation));
  }

  private handleMessage(connection: SocketConnection, data: unknown, isBinary: boolean): void {
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
    let parsed: z.output<typeof agentProtocolEnvelopeSchema>;
    try {
      parsed = agentProtocolEnvelopeSchema.parse(JSON.parse(text) as unknown);
      if (connection.sequence.lastSequence === -1 && parsed.seq !== 0) {
        throw new Error("Protocol sequence must start at zero");
      }
      connection.sequence.accept(parsed);
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
    switch (parsed.type) {
      case "submit_action": {
        let payload: ActionSubmission;
        try {
          payload = actionSubmissionSchema.parse(parsed.payload);
        } catch (caught) {
          this.malformed(
            connection,
            caught instanceof Error ? caught.message : "Malformed action submission",
          );
          break;
        }
        if (parsed.requestId !== payload.requestId) {
          this.malformed(connection, "Envelope request identity does not match the action");
          break;
        }
        this.handleSubmitAction(connection, payload);
        break;
      }
      case "ping":
        this.sendObservation(connection);
        break;
      case "request_hint":
      case "request_analysis":
      case "resign": {
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
          break;
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
        break;
      }
      default:
        this.malformed(connection, "Unsupported protocol message");
    }
  }

  private handleSubmitAction(connection: SocketConnection, payload: ActionSubmission): void {
    if (payload.playerId !== connection.playerId || payload.branchId !== connection.branchId) {
      this.sendActionRejected(
        connection,
        {
          code: "unknown_player",
          message: "The message player or branch does not match this socket",
          details: { reason: "cross_player_message" },
        },
        payload.requestId,
      );
      return;
    }
    try {
      const result = this.service.submitAction({
        ...payload,
        gameId: connection.gameId,
        ticket: connection.ticket,
      });
      this.publishActionResult(result);
    } catch (caught) {
      if (caught instanceof MultiplayerServiceError) {
        this.sendActionRejected(connection, caught.payload, payload.requestId);
      } else {
        this.sendError(
          connection,
          {
            code: "persistence_failure",
            message: "The server could not apply the action",
            details: {},
          },
          payload.requestId,
        );
      }
    }
  }

  private observationFor(connection: SocketConnection): PlayerObservationDto {
    return this.service.getObservation(
      connection.gameId,
      connection.playerId,
      connection.branchId,
      connection.ticket,
    );
  }

  /** Publishes a committed result for both WebSocket-originated and HTTP-originated actions. */
  public publishActionResult(
    result: SubmitActionResult,
    botResultsOverride?: readonly SubmitActionResult[],
  ): void {
    this.service.roomStore.clearPendingAction(
      result.key.gameId,
      result.key.branchId,
      result.playerId,
      result.requestId,
    );
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
          participant.lastPublicRevision = Math.max(participant.lastPublicRevision, event.revision);
        }
        if (participant.playerId === result.playerId) {
          if (participant.timeoutHandle !== null) {
            clearTimeout(participant.timeoutHandle);
            participant.timeoutHandle = null;
          }
          participant.pendingRequest = null;
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
        } else {
          this.sendObservation(participant);
        }
      }
      for (const botResult of botResultsOverride ?? []) {
        this.publishActionResult(botResult, []);
      }
      return;
    }
    for (const participant of this.connections) {
      if (
        participant.gameId !== result.key.gameId ||
        participant.branchId !== result.key.branchId
      ) {
        continue;
      }
      if (participant.playerId === result.playerId) {
        if (participant.timeoutHandle !== null) {
          clearTimeout(participant.timeoutHandle);
          participant.timeoutHandle = null;
        }
        participant.pendingRequest = null;
      }
      for (const event of result.publicEvents) {
        if (event.revision <= participant.lastPublicRevision) {
          continue;
        }
        this.send(participant, "public_event", { event });
        participant.lastPublicRevision = Math.max(participant.lastPublicRevision, event.revision);
      }
    }
    for (const participant of this.connections) {
      if (
        participant.gameId !== result.key.gameId ||
        participant.branchId !== result.key.branchId
      ) {
        continue;
      }
      if (participant.playerId === result.playerId) {
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
      } else {
        this.sendObservation(participant);
      }
    }
    const botResults = botResultsOverride ?? this.service.advanceBotTurns(result.key.gameId);
    for (const botResult of botResults) {
      for (const participant of this.connections) {
        if (
          participant.gameId !== botResult.key.gameId ||
          participant.branchId !== botResult.key.branchId
        ) {
          continue;
        }
        for (const event of botResult.publicEvents) {
          if (event.revision <= participant.lastPublicRevision) {
            continue;
          }
          this.send(participant, "public_event", { event });
          participant.lastPublicRevision = Math.max(participant.lastPublicRevision, event.revision);
        }
        this.sendObservation(participant);
      }
    }
    const terminalEvents = [
      ...result.publicEvents,
      ...botResults.flatMap(({ publicEvents }) => publicEvents),
    ];
    const terminalEvent = terminalEvents.find(
      (event) => event.type === "hand_ended" || event.type === "match_ended",
    );
    if (terminalEvent?.type === "hand_ended") {
      for (const participant of this.connections) {
        if (
          participant.gameId === result.key.gameId &&
          participant.branchId === result.key.branchId
        ) {
          if (terminalEvent.revision <= participant.lastTerminalRevision) {
            continue;
          }
          participant.lastTerminalRevision = terminalEvent.revision;
          this.send(participant, "hand_ended", {
            result: terminalEvent.result,
            observation: this.observationFor(participant),
          });
        }
      }
    } else if (terminalEvent?.type === "match_ended") {
      for (const participant of this.connections) {
        if (
          participant.gameId === result.key.gameId &&
          participant.branchId === result.key.branchId
        ) {
          if (terminalEvent.revision <= participant.lastTerminalRevision) {
            continue;
          }
          participant.lastTerminalRevision = terminalEvent.revision;
          this.send(participant, "match_ended", {
            observation: this.observationFor(participant),
          });
        }
      }
    }
    for (const participant of this.connections) {
      if (
        participant.gameId === result.key.gameId &&
        participant.branchId === result.key.branchId
      ) {
        this.sendActionRequest(participant, this.observationFor(participant));
      }
    }
  }

  private scheduleTimeout(
    connection: SocketConnection,
    request: { requestId: string; expectedRevision: number; deadline: string },
    disconnected: boolean,
  ): void {
    if (connection.timeoutHandle !== null) {
      clearTimeout(connection.timeoutHandle);
    }
    connection.pendingRequest = request;
    const waitMs = Math.max(0, Date.parse(request.deadline) - this.service.nowMs());
    connection.timeoutHandle = setTimeout(() => {
      connection.timeoutHandle = null;
      try {
        const result = this.service.submitTimeoutFallback(
          connection.gameId,
          connection.branchId,
          connection.playerId,
          connection.ticket,
          request.requestId,
          request.expectedRevision,
          request.deadline,
          disconnected ? "disconnect_timeout" : "action_timeout",
        );
        if (result !== null) {
          this.publishActionResult(result);
        }
      } catch (caught) {
        if (this.connections.has(connection) && caught instanceof MultiplayerServiceError) {
          this.sendActionRejected(connection, caught.payload);
        }
      }
    }, waitMs);
  }

  private sendObservation(connection: SocketConnection): void {
    this.send(connection, "observation", this.observationFor(connection));
  }

  private sendActionRequest(
    connection: SocketConnection,
    observation: Pick<PlayerObservationDto, "revision" | "legalActions">,
  ): void {
    if (observation.legalActions.length === 0) {
      this.clearConnectionPendingRequest(connection);
      return;
    }
    const room = this.service.roomForGame(connection.gameId);
    if (isRoomStatusTerminal(room.status)) {
      this.clearConnectionPendingRequest(connection);
      return;
    }
    const requestId = this.service.actionRequestId(
      connection.gameId,
      connection.branchId,
      observation.revision,
      connection.playerId,
    );
    let pending = this.service.pendingActionFor(
      connection.gameId,
      connection.branchId,
      connection.playerId,
    );
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
      this.service.registerPendingAction(pending);
    } else if (pending.pausedAt !== null && room.disconnectPolicy === "pause_on_disconnect") {
      pending = this.service.resumePendingAction(
        connection.gameId,
        connection.branchId,
        connection.playerId,
      );
    }
    const deadline =
      pending?.deadlineAt ??
      new Date(this.service.nowMs() + this.service.actionTimeoutMs).toISOString();
    this.scheduleTimeout(
      connection,
      { requestId, expectedRevision: observation.revision, deadline },
      false,
    );
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

  private sendActionRejected(
    connection: SocketConnection,
    error: ProtocolError,
    requestId?: string,
  ): void {
    const observation = (() => {
      try {
        return this.observationFor(connection);
      } catch {
        return null;
      }
    })();
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

  private sendError(connection: SocketConnection, error: ProtocolError, requestId?: string): void {
    this.send(connection, "error", error, requestId);
  }

  private malformed(connection: SocketConnection, message: string): void {
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
    connection: SocketConnection,
    type: ProtocolHostMessage["type"],
    payload: unknown,
    requestId?: string,
  ): void {
    const envelope = createProtocolEnvelope({
      type,
      seq: connection.nextSequence++,
      payload,
      gameId: connection.gameId,
      branchId: connection.branchId,
      ...(requestId === undefined ? {} : { requestId }),
    });
    try {
      connection.socket.send(JSON.stringify(hostProtocolEnvelopeSchema.parse(envelope)));
    } catch {
      connection.socket.close(1011, "delivery_failed");
      this.disconnect(connection);
    }
  }

  private clearConnectionPendingRequest(connection: SocketConnection): void {
    if (connection.timeoutHandle !== null) {
      clearTimeout(connection.timeoutHandle);
      connection.timeoutHandle = null;
    }
    connection.pendingRequest = null;
  }
}

export const parseRoomCreateRequest = (body: unknown): RoomCreateRequest =>
  roomCreateRequestSchema.parse(body);
export const parseRoomJoinRequest = (body: unknown): RoomJoinRequest =>
  roomJoinRequestSchema.parse(body);
export const parseRoomStartRequest = (body: unknown): RoomStartRequest =>
  roomStartRequestSchema.parse(body ?? {});
export const parseGameQuery = (query: unknown): z.output<typeof gameQuerySchema> =>
  gameQuerySchema.parse(query);
export const parseWebSocketQuery = (query: unknown): z.output<typeof websocketQuerySchema> =>
  websocketQuerySchema.parse(query);
export const parseRoomIdPath = (params: unknown): string => roomIdPathSchema.parse(params).roomId;
export const parseGameIdPath = (params: unknown): string => gameIdPathSchema.parse(params).gameId;
export const protocolErrorFor = (error: MultiplayerServiceError): ProtocolError => error.payload;
