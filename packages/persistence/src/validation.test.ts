import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createGameEngine,
  type CreateEngineResult,
  type GameEvent,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";

import { PersistenceCorruptionError, PersistenceValidationError } from "./errors.js";
import {
  assertGameKey,
  assertInputState,
  canonicalJsonText,
  isRecord,
  parsePersistedJson,
  parsePersistedObject,
  parseStoredGameEvent,
  parseStoredGameState,
  persistenceHash,
  requireBoolean,
  requireFiniteNumber,
  requireHash,
  requireJsonObject,
  requireNonEmptyString,
  requireOptionalString,
  requireOptionalTimestamp,
  requireSafeInteger,
} from "./validation.js";

const createPersistableGame = (): Extract<CreateEngineResult, { accepted: true }> => {
  const ruleset = getBundledRuleset("training_relaxed_v1");
  const engine = createGameEngine({
    scoringSystem: createHongKongScoringSystem(ruleset),
  });
  const result = engine.create({
    type: "create_game",
    requestId: "create:validation",
    branchId: "main",
    seed: "persistence-validation",
    mode: "guided",
    matchLength: "one_wind",
    rules: toCoreGameRules(ruleset),
    players: [
      { id: "east", displayName: "East", controller: "human", seat: "east" },
      { id: "south", displayName: "South", controller: "bot", seat: "south" },
      { id: "west", displayName: "West", controller: "bot", seat: "west" },
      { id: "north", displayName: "North", controller: "bot", seat: "north" },
    ],
  });
  if (!result.accepted) {
    throw new Error(result.error.message);
  }
  return result;
};

describe("persistence boundary validation", () => {
  it("accepts canonical boundary values and rejects invalid scalar inputs", () => {
    expect(requireNonEmptyString(" value ", "Value")).toBe(" value ");
    expect(requireSafeInteger(3, "Count", 0)).toBe(3);
    expect(requireFiniteNumber(0.5, "Score", 0, 1)).toBe(0.5);
    expect(requireBoolean(false, "Flag")).toBe(false);
    expect(requireHash(persistenceHash({ value: 1 }), "Hash")).toMatch(/^sha256:/u);
    expect(requireOptionalTimestamp(undefined, "fallback")).toBe("fallback");
    expect(requireOptionalTimestamp("time", "fallback")).toBe("time");
    expect(requireOptionalString(undefined, "Optional")).toBeNull();
    expect(requireOptionalString("present", "Optional")).toBe("present");
    expect(() => requireNonEmptyString(" ", "Value")).toThrow(PersistenceValidationError);
    expect(() => requireSafeInteger(1.5, "Count", 0)).toThrow(PersistenceValidationError);
    expect(() => requireFiniteNumber(Number.NaN, "Score")).toThrow(PersistenceValidationError);
    expect(() => requireFiniteNumber(2, "Score", 0, 1)).toThrow(PersistenceValidationError);
    expect(() => requireBoolean(1, "Flag")).toThrow(PersistenceValidationError);
    expect(() => requireHash("not-a-hash", "Hash")).toThrow(PersistenceValidationError);
    expect(() => assertGameKey({ gameId: "", branchId: "main" })).toThrow(
      PersistenceValidationError,
    );
  });

  it("recognizes only finite acyclic JSON objects", () => {
    expect(isRecord({ nested: [true, null, 1, "text"] })).toBe(true);
    expect(isRecord([1, 2, 3])).toBe(false);
    expect(isRecord({ invalid: Number.POSITIVE_INFINITY })).toBe(false);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isRecord(cyclic)).toBe(false);
    expect(() => requireJsonObject(cyclic, "Cyclic object")).toThrow(PersistenceValidationError);
    expect(() => canonicalJsonText(cyclic, "Cyclic object")).toThrow(PersistenceValidationError);

    const deeplyNested: Record<string, unknown> = {};
    let cursor = deeplyNested;
    for (let depth = 0; depth < 300; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.value = child;
      cursor = child;
    }
    expect(isRecord(deeplyNested)).toBe(false);
    expect(() => requireJsonObject(deeplyNested, "Deep object")).toThrow(
      PersistenceValidationError,
    );
  });

  it("parses safe persisted JSON and rejects malformed or non-object data", () => {
    expect(parsePersistedJson('{"answer":42}', "Stored JSON")).toEqual({ answer: 42 });
    expect(parsePersistedObject('{"answer":42}', "Stored object")).toEqual({ answer: 42 });
    expect(() => parsePersistedJson(null, "Stored JSON")).toThrow(PersistenceCorruptionError);
    expect(() => parsePersistedJson("{", "Stored JSON")).toThrow(PersistenceCorruptionError);
    expect(() => parsePersistedObject("[1]", "Stored object")).toThrow(PersistenceCorruptionError);
    const deeplyNestedJson = `${'{"value":'.repeat(300)}null${"}".repeat(300)}`;
    expect(() => parsePersistedJson(deeplyNestedJson, "Deep stored JSON")).toThrow(
      PersistenceCorruptionError,
    );
  });

  it("validates persisted event identity and authoritative state hashes", () => {
    const created = createPersistableGame();
    const event = created.events[0];
    if (event === undefined) {
      throw new Error("Expected a game creation event");
    }
    expect(
      parseStoredGameEvent(canonicalJson(event), event.gameId, event.branchId, event.revision),
    ).toEqual(event);
    const unknownType = { ...event, type: "unknown_event" };
    expect(() =>
      parseStoredGameEvent(
        canonicalJson(unknownType),
        event.gameId,
        event.branchId,
        event.revision,
      ),
    ).toThrow(/unknown type/u);
    const wrongIdentity: GameEvent = { ...event, id: "invalid-event-id" };
    expect(() =>
      parseStoredGameEvent(
        canonicalJson(wrongIdentity),
        event.gameId,
        event.branchId,
        event.revision,
      ),
    ).toThrow(/identity is invalid/u);

    expect(
      parseStoredGameState(
        canonicalJson(created.state),
        created.state.gameId,
        created.state.branchId,
        created.state.revision,
        created.state.stateHash,
        "Stored state",
      ),
    ).toEqual(created.state);
    expect(() =>
      parseStoredGameState(
        canonicalJson({ ...created.state, stateHash: `sha256:${"0".repeat(64)}` }),
        created.state.gameId,
        created.state.branchId,
        created.state.revision,
        `sha256:${"0".repeat(64)}`,
        "Stored state",
      ),
    ).toThrow(PersistenceCorruptionError);
    expect(() =>
      assertInputState(
        { ...created.state, revision: created.state.revision + 1 },
        created.state.gameId,
        created.state.branchId,
      ),
    ).toThrow(PersistenceValidationError);
  });
});
