import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FpsMatchCheckpoint } from "@hk-mahjong/fps";

export interface FpsJournalSession {
  readonly matchId: string;
  readonly playerId: string;
  readonly ticketHash: string;
  readonly owner: boolean;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly revoked: boolean;
}

export interface FpsJournalRequest {
  readonly matchId: string;
  readonly playerId: string;
  readonly requestId: string;
  readonly kind: "ready" | "start";
  readonly responseJson: string;
}

interface MatchRow {
  readonly match_id: string;
  readonly checkpoint_json: string;
  readonly updated_at: string;
}

interface SessionRow {
  readonly match_id: string;
  readonly player_id: string;
  readonly ticket_hash: string;
  readonly owner: number;
  readonly created_at_ms?: number;
  readonly expires_at_ms?: number;
  readonly revoked?: number;
}

interface RequestRow {
  readonly match_id: string;
  readonly player_id: string;
  readonly request_id: string;
  readonly kind: "ready" | "start";
  readonly response_json: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseCheckpoint = (value: string): FpsMatchCheckpoint => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("fps_checkpoint_invalid_json");
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.matchId !== "string" ||
    typeof parsed.roomId !== "string" ||
    typeof parsed.seed !== "string" ||
    typeof parsed.rules !== "object" ||
    typeof parsed.arena !== "object" ||
    typeof parsed.checkpointHash !== "string" ||
    !Array.isArray(parsed.players) ||
    !Array.isArray(parsed.eventRecords)
  ) {
    throw new Error("fps_checkpoint_invalid_shape");
  }
  return parsed as unknown as FpsMatchCheckpoint;
};

/** SQLite-backed checkpoint and event-chain journal for the FPS authority. */
export class FpsMatchJournal {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS fps_matches (
        match_id TEXT PRIMARY KEY,
        checkpoint_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fps_match_sessions (
        ticket_hash TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        owner INTEGER NOT NULL CHECK (owner IN (0, 1)),
        created_at_ms INTEGER NOT NULL DEFAULT 0,
        expires_at_ms INTEGER NOT NULL DEFAULT 0,
        revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
      );
      CREATE INDEX IF NOT EXISTS fps_sessions_by_match ON fps_match_sessions(match_id);
      CREATE TABLE IF NOT EXISTS fps_match_requests (
        match_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('ready', 'start')),
        response_json TEXT NOT NULL,
        PRIMARY KEY (match_id, player_id, request_id, kind)
      );
    `);
    this.addSessionColumn("created_at_ms", "INTEGER NOT NULL DEFAULT 0");
    this.addSessionColumn("expires_at_ms", "INTEGER NOT NULL DEFAULT 0");
    this.addSessionColumn("revoked", "INTEGER NOT NULL DEFAULT 0");
  }

  private addSessionColumn(name: string, definition: string): void {
    const columns = this.database
      .prepare<[], { readonly name: string }>("PRAGMA table_info(fps_match_sessions)")
      .all()
      .map((column) => column.name);
    if (!columns.includes(name)) {
      this.database.exec(`ALTER TABLE fps_match_sessions ADD COLUMN ${name} ${definition}`);
    }
  }

  public saveMatch(checkpoint: FpsMatchCheckpoint, updatedAt = new Date().toISOString()): void {
    this.database
      .prepare(
        `INSERT INTO fps_matches (match_id, checkpoint_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (match_id) DO UPDATE SET
           checkpoint_json = excluded.checkpoint_json,
           updated_at = excluded.updated_at`,
      )
      .run(checkpoint.matchId, JSON.stringify(checkpoint), updatedAt);
  }

  public saveSession(session: FpsJournalSession): void {
    this.database
      .prepare(
        `INSERT INTO fps_match_sessions
           (ticket_hash, match_id, player_id, owner, created_at_ms, expires_at_ms, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (ticket_hash) DO UPDATE SET
           match_id = excluded.match_id,
           player_id = excluded.player_id,
           owner = excluded.owner,
           created_at_ms = excluded.created_at_ms,
           expires_at_ms = excluded.expires_at_ms,
           revoked = excluded.revoked`,
      )
      .run(
        session.ticketHash,
        session.matchId,
        session.playerId,
        session.owner ? 1 : 0,
        session.createdAtMs,
        session.expiresAtMs,
        session.revoked ? 1 : 0,
      );
  }

  public loadMatches(): readonly FpsMatchCheckpoint[] {
    return this.database
      .prepare<[], MatchRow>(
        "SELECT match_id, checkpoint_json, updated_at FROM fps_matches ORDER BY updated_at",
      )
      .all()
      .map((row) => parseCheckpoint(row.checkpoint_json));
  }

  public loadSessions(): readonly FpsJournalSession[] {
    return this.database
      .prepare<[], SessionRow>(
        "SELECT match_id, player_id, ticket_hash, owner, created_at_ms, expires_at_ms, revoked FROM fps_match_sessions",
      )
      .all()
      .map((row) => ({
        matchId: row.match_id,
        playerId: row.player_id,
        ticketHash: row.ticket_hash,
        owner: row.owner === 1,
        createdAtMs: row.created_at_ms ?? 0,
        expiresAtMs: row.expires_at_ms ?? 0,
        revoked: row.revoked === 1,
      }));
  }

  public revokeSession(ticketHash: string): void {
    this.database
      .prepare("UPDATE fps_match_sessions SET revoked = 1 WHERE ticket_hash = ?")
      .run(ticketHash);
  }

  public saveRequest(request: FpsJournalRequest): void {
    this.database
      .prepare(
        `INSERT INTO fps_match_requests (match_id, player_id, request_id, kind, response_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (match_id, player_id, request_id, kind) DO UPDATE SET
           response_json = excluded.response_json`,
      )
      .run(
        request.matchId,
        request.playerId,
        request.requestId,
        request.kind,
        request.responseJson,
      );
  }

  public loadRequests(): readonly FpsJournalRequest[] {
    return this.database
      .prepare<[], RequestRow>(
        "SELECT match_id, player_id, request_id, kind, response_json FROM fps_match_requests",
      )
      .all()
      .map((row) => ({
        matchId: row.match_id,
        playerId: row.player_id,
        requestId: row.request_id,
        kind: row.kind,
        responseJson: row.response_json,
      }));
  }

  public close(): void {
    this.database.close();
  }
}
