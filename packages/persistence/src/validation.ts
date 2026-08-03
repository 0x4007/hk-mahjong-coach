import {
  assertStateInvariants,
  canonicalJson,
  canonicalJsonHash,
  computeStateHash,
  type GameEvent,
  type GameState,
} from "@hk-mahjong/core";

import { PersistenceCorruptionError, PersistenceValidationError } from "./errors.js";
import type { GameKey, JsonObject, JsonValue } from "./types.js";

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAX_PERSISTED_JSON_BYTES = 16 * 1024 * 1024;
const MAX_PERSISTED_JSON_DEPTH = 256;
const GAME_EVENT_TYPES = new Set<GameEvent["type"]>([
  "game_created",
  "initial_deal_completed",
  "draw_completed",
  "tile_discarded",
  "claim_response_recorded",
  "meld_claimed",
  "kong_proposed",
  "kong_completed",
  "hand_won",
  "hand_ended",
  "next_hand_started",
  "match_ended",
  "practice_branch_created",
]);

export const persistenceHash = (value: unknown): string => `sha256:${canonicalJsonHash(value)}`;

const isJsonValue = (
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
  depth = 0,
): value is JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (typeof value !== "object" || ancestors.has(value) || depth > MAX_PERSISTED_JSON_DEPTH) {
    return false;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item) => isJsonValue(item, ancestors, depth + 1));
    }
    return Object.values(value).every((item) => isJsonValue(item, ancestors, depth + 1));
  } finally {
    ancestors.delete(value);
  }
};

export const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value);

export const requireNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PersistenceValidationError(`${label} must be a non-empty string`);
  }
  return value;
};

export const requireSafeInteger = (
  value: unknown,
  label: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number => {
  const integer = typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(integer) || integer < minimum) {
    throw new PersistenceValidationError(
      `${label} must be a safe integer at least ${String(minimum)}`,
    );
  }
  return integer;
};

export const requireFiniteNumber = (
  value: unknown,
  label: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new PersistenceValidationError(`${label} must be a finite number in range`);
  }
  return value;
};

export const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new PersistenceValidationError(`${label} must be a boolean`);
  }
  return value;
};

export const requireHash = (value: unknown, label: string): string => {
  const hash = requireNonEmptyString(value, label);
  if (!HASH_PATTERN.test(hash)) {
    throw new PersistenceValidationError(`${label} must be a sha256 hash`);
  }
  return hash;
};

export const assertGameKey = (key: GameKey): void => {
  requireNonEmptyString(key.gameId, "Game key gameId");
  requireNonEmptyString(key.branchId, "Game key branchId");
};

export const canonicalJsonText = (value: unknown, label: string): string => {
  try {
    return canonicalJson(value);
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "invalid JSON value";
    throw new PersistenceValidationError(`${label} is not canonical JSON: ${reason}`);
  }
};

export const requireJsonObject = (value: unknown, label: string): JsonObject => {
  if (!isRecord(value)) {
    throw new PersistenceValidationError(`${label} must be a JSON object`);
  }
  canonicalJsonText(value, label);
  return value;
};

export const parsePersistedJson = (text: unknown, label: string): JsonValue => {
  if (typeof text !== "string" || text.length > MAX_PERSISTED_JSON_BYTES) {
    throw new PersistenceCorruptionError(
      `${label} exceeds the persisted JSON limit or is not text`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "invalid JSON";
    throw new PersistenceCorruptionError(`${label} is invalid JSON: ${reason}`);
  }
  if (!isJsonValue(parsed)) {
    throw new PersistenceCorruptionError(`${label} is not a JSON value`);
  }
  try {
    canonicalJson(parsed);
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "invalid canonical JSON";
    throw new PersistenceCorruptionError(`${label} is not safe canonical JSON: ${reason}`);
  }
  return parsed;
};

export const parsePersistedObject = (text: unknown, label: string): JsonObject => {
  const parsed = parsePersistedJson(text, label);
  if (!isRecord(parsed)) {
    throw new PersistenceCorruptionError(`${label} must be a JSON object`);
  }
  return parsed;
};

export const parseStoredGameEvent = (
  text: unknown,
  expectedGameId: string,
  expectedBranchId: string,
  expectedRevision: number,
): GameEvent => {
  const record = parsePersistedObject(text, "Persisted game event");
  const type = record.type;
  if (typeof type !== "string" || !GAME_EVENT_TYPES.has(type as GameEvent["type"])) {
    throw new PersistenceCorruptionError("Persisted game event has an unknown type");
  }
  if (
    record.gameId !== expectedGameId ||
    record.branchId !== expectedBranchId ||
    record.revision !== expectedRevision ||
    record.id !== `event:${expectedGameId}:${expectedBranchId}:${String(expectedRevision)}` ||
    typeof record.requestId !== "string" ||
    (record.visibility !== "public" && record.visibility !== "internal")
  ) {
    throw new PersistenceCorruptionError("Persisted game event identity is invalid");
  }
  return record as unknown as GameEvent;
};

export const assertStateIntegrity = (
  state: GameState,
  expectedGameId: string,
  expectedRevision: number | null,
  expectedHash: string | null,
  label: string,
  expectedBranchId: string | null = null,
): void => {
  try {
    const candidate = state as unknown;
    if (!isRecord(candidate) || candidate.schemaVersion !== 1) {
      throw new Error("state schema version is invalid");
    }
    if (state.gameId !== expectedGameId) {
      throw new Error("state game ID is invalid");
    }
    if (expectedBranchId !== null && state.branchId !== expectedBranchId) {
      throw new Error("state branch ID is invalid");
    }
    if (expectedRevision !== null && state.revision !== expectedRevision) {
      throw new Error("state revision is invalid");
    }
    if (!HASH_PATTERN.test(state.stateHash)) {
      throw new Error("state hash format is invalid");
    }
    const computedHash = computeStateHash(state);
    if (
      computedHash !== state.stateHash ||
      (expectedHash !== null && computedHash !== expectedHash)
    ) {
      throw new Error("state hash does not match authoritative state");
    }
    assertStateInvariants(state);
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "unknown state failure";
    throw new PersistenceCorruptionError(`${label} is corrupt: ${reason}`);
  }
};

export const parseStoredGameState = (
  text: unknown,
  expectedGameId: string,
  expectedBranchId: string,
  expectedRevision: number,
  expectedHash: string,
  label: string,
): GameState => {
  const parsed = parsePersistedObject(text, label);
  const state = parsed as unknown as GameState;
  assertStateIntegrity(
    state,
    expectedGameId,
    expectedRevision,
    expectedHash,
    label,
    expectedBranchId,
  );
  return state;
};

export const assertInputState = (
  state: GameState,
  expectedGameId: string,
  expectedBranchId: string | null = null,
): void => {
  try {
    assertStateIntegrity(
      state,
      expectedGameId,
      null,
      null,
      "Provided game state",
      expectedBranchId,
    );
  } catch (caught) {
    if (caught instanceof PersistenceCorruptionError) {
      throw new PersistenceValidationError(
        caught.message.replace("Provided game state is corrupt: ", ""),
      );
    }
    throw caught;
  }
};

export const requireOptionalTimestamp = (value: string | undefined, fallback: string): string =>
  value === undefined ? fallback : requireNonEmptyString(value, "Timestamp");

export const requireOptionalString = (value: string | undefined, label: string): string | null =>
  value === undefined ? null : requireNonEmptyString(value, label);
