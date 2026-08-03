import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGameEngine,
  type CoreGameRules,
  type CreateEngineResult,
  type GameEngine,
  type GameMode,
  type GameState,
  type LegalAction,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  resolveRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";

import {
  PERSISTENCE_MIGRATIONS,
  PersistenceConflictError,
  PersistenceCorruptionError,
  PersistenceNotFoundError,
  PersistenceValidationError,
  SqlitePersistenceRepository,
  type GameKey,
  type GameSessionConfigurationV1,
} from "./index.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const createDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "hk-mahjong-persistence-"));
  directories.push(directory);
  return join(directory, "coach.sqlite");
};

const runRestartWorker = (
  operation: "continue" | "resume" | "write" | "write_and_crash",
  databasePath: string,
): {
  gameId: string;
  persistenceSchemaVersion: number;
  revision: number;
  stateHash: string;
  replayStateHash: string;
  sessionConfiguration: GameSessionConfigurationV1;
  sessionConfigurationHash: string;
} => {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
  delete childEnvironment.NODE_V8_COVERAGE;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", join(process.cwd(), "tests/fixtures/persistence-restart-worker.ts")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnvironment,
      input: JSON.stringify({ operation, databasePath }),
    },
  );
  if (child.error !== undefined) {
    throw child.error;
  }
  if (operation === "write_and_crash") {
    if (child.signal !== "SIGKILL") {
      throw new Error(`Persistence crash worker exited without SIGKILL: ${child.stderr}`);
    }
  } else if (child.status !== 0) {
    throw new Error(`Persistence restart worker failed: ${child.stderr}`);
  }
  const output = child.stdout;
  const parsed: unknown = JSON.parse(output);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("gameId" in parsed) ||
    typeof parsed.gameId !== "string" ||
    !("persistenceSchemaVersion" in parsed) ||
    parsed.persistenceSchemaVersion !== 4 ||
    !("revision" in parsed) ||
    !Number.isSafeInteger(parsed.revision) ||
    !("stateHash" in parsed) ||
    typeof parsed.stateHash !== "string" ||
    !("replayStateHash" in parsed) ||
    parsed.replayStateHash !== parsed.stateHash ||
    !("sessionConfiguration" in parsed) ||
    !("sessionConfigurationHash" in parsed) ||
    typeof parsed.sessionConfigurationHash !== "string"
  ) {
    throw new Error("Persistence restart worker response is invalid");
  }
  return parsed as {
    gameId: string;
    persistenceSchemaVersion: number;
    revision: number;
    stateHash: string;
    replayStateHash: string;
    sessionConfiguration: GameSessionConfigurationV1;
    sessionConfigurationHash: string;
  };
};

const createEngine = (): GameEngine => {
  const ruleset = getBundledRuleset("training_relaxed_v1");
  return createGameEngine({ scoringSystem: createHongKongScoringSystem(ruleset) });
};

const createGame = (
  engine: GameEngine,
  seed: string,
  mode: GameMode = "guided",
  rules: CoreGameRules = toCoreGameRules(getBundledRuleset("training_relaxed_v1")),
): Extract<CreateEngineResult, { accepted: true }> => {
  const result = engine.create({
    type: "create_game",
    requestId: `create:${seed}`,
    branchId: "main",
    seed,
    mode,
    matchLength: "one_wind",
    rules,
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

const createRepository = (
  databasePath: string,
  engine: GameEngine,
  snapshotEveryEvents = 1,
): SqlitePersistenceRepository =>
  new SqlitePersistenceRepository({
    databasePath,
    reducer: (state, event) => engine.reduce(state, event),
    legalActions: (state, playerId) => engine.legalActions(state, playerId),
    validateRulesetDefinition: (definition) => {
      const ruleset = resolveRuleset(definition);
      return {
        definition: ruleset.definition,
        hash: ruleset.hash,
        coreRules: toCoreGameRules(ruleset),
      };
    },
    snapshotEveryEvents,
    clock: () => "2026-08-02T12:00:00.000Z",
  });

const mainKey = (state: GameState): GameKey => ({
  gameId: state.gameId,
  branchId: state.branchId,
});

const invalidHash = `sha256:${"0".repeat(64)}`;

interface PersistenceTamperCase {
  name: string;
  mutate: (database: Database.Database, key: GameKey) => unknown;
  verify: (repository: SqlitePersistenceRepository, key: GameKey) => unknown;
}

const sessionConfiguration: GameSessionConfigurationV1 = {
  schemaVersion: 1,
  bots: [
    { playerId: "north", difficulty: "advanced", personality: "balanced" },
    { playerId: "south", difficulty: "basic", personality: "fast" },
    { playerId: "west", difficulty: "intermediate", personality: "value" },
  ],
  coach: {
    enabled: true,
    provider: "templates",
    verbosity: "normal",
  },
};

const appendCreation = (
  repository: SqlitePersistenceRepository,
  created: Extract<CreateEngineResult, { accepted: true }>,
): GameKey => {
  const key = mainKey(created.state);
  repository.appendAcceptedCommand({
    key,
    requestId: created.events[0]?.requestId ?? "missing-create-request",
    events: created.events,
    state: created.state,
    learnerId: "learner-1",
    rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
    sessionConfiguration,
  });
  return key;
};

const firstDiscard = (engine: GameEngine, state: GameState): LegalAction => {
  const action = engine
    .legalActions(state, "east")
    .find((candidate) => candidate.type === "discard");
  if (action === undefined) {
    throw new Error("Expected East to have a discard action");
  }
  return action;
};

const endSandboxHand = (
  repository: SqlitePersistenceRepository,
  engine: GameEngine,
  state: GameState,
  requestId: string,
): GameState => {
  const result = engine.decide(state, {
    type: "end_sandbox_hand",
    gameId: state.gameId,
    branchId: state.branchId,
    playerId: "east",
    expectedRevision: state.revision,
    requestId,
  });
  if (!result.accepted) {
    throw new Error(result.error.message);
  }
  repository.appendAcceptedCommand({
    key: mainKey(state),
    requestId,
    events: result.events,
    state: result.state,
  });
  return result.state;
};

const submitLegalActionByType = (
  repository: SqlitePersistenceRepository,
  engine: GameEngine,
  state: GameState,
  actionType: LegalAction["type"],
  requestId: string,
): GameState => {
  for (const playerId of Object.keys(state.players).sort()) {
    const action = engine.legalActions(state, playerId).find(({ type }) => type === actionType);
    if (action === undefined) {
      continue;
    }
    const result = engine.decide(state, {
      type: "submit_action",
      gameId: state.gameId,
      branchId: state.branchId,
      playerId,
      expectedRevision: state.revision,
      requestId,
      actionId: action.id,
    });
    if (!result.accepted) {
      throw new Error(result.error.message);
    }
    repository.appendAcceptedCommand({
      key: mainKey(state),
      requestId,
      events: result.events,
      state: result.state,
    });
    return result.state;
  }
  throw new Error(`Expected a ${actionType} action`);
};

const advanceSandboxToFinalLiveHand = (
  repository: SqlitePersistenceRepository,
  engine: GameEngine,
  initialState: GameState,
): GameState => {
  let state = initialState;
  while (state.match.handsCompleted < 3) {
    state = endSandboxHand(
      repository,
      engine,
      state,
      `sandbox-end:pre-final:${String(state.match.handsCompleted)}`,
    );
    state = submitLegalActionByType(
      repository,
      engine,
      state,
      "start_next_hand",
      `sandbox-start:pre-final:${String(state.match.handsCompleted)}`,
    );
  }
  return state;
};

describe("SQLite persistence repository", () => {
  it("rejects a missing durable game through the public repository API", () => {
    const repository = createRepository(createDatabasePath(), createEngine());
    expect(() => repository.loadGame({ gameId: "missing-game", branchId: "main" })).toThrow(
      PersistenceNotFoundError,
    );
    repository.close();
  });

  it("resumes, continues, and replays the exact game across three fresh processes", () => {
    const databasePath = createDatabasePath();
    const written = runRestartWorker("write", databasePath);
    const resumed = runRestartWorker("resume", databasePath);
    expect(resumed).toEqual(written);
    expect(resumed.sessionConfiguration.coach.provider).toBe("templates");
    expect(resumed.sessionConfigurationHash).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const continued = runRestartWorker("continue", databasePath);
    expect(continued.gameId).toBe(resumed.gameId);
    expect(continued.revision).toBeGreaterThan(resumed.revision);
    expect(continued.stateHash).not.toBe(resumed.stateHash);
    expect(continued.sessionConfigurationHash).toBe(resumed.sessionConfigurationHash);
    expect(runRestartWorker("resume", databasePath)).toEqual(continued);
  }, 120_000);

  it("resumes the exact committed state after abrupt process termination", () => {
    const databasePath = createDatabasePath();
    const beforeCrash = runRestartWorker("write_and_crash", databasePath);
    expect(runRestartWorker("resume", databasePath)).toEqual(beforeCrash);
  }, 120_000);

  it("resumes an exact state after close/reopen and makes request IDs idempotent", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "persistence-resume");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    expect(
      repository.appendAcceptedCommand({
        key,
        requestId: created.events[0]?.requestId ?? "missing-create-request",
        events: created.events,
        state: created.state,
        learnerId: "learner-1",
        rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
        sessionConfiguration,
      }),
    ).toMatchObject({ disposition: "idempotent", stateHash: created.state.stateHash });
    expect(() =>
      repository.appendAcceptedCommand({
        key,
        requestId: created.events[0]?.requestId ?? "missing-create-request",
        events: created.events,
        state: created.state,
        learnerId: "learner-1",
        rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
        sessionConfiguration: {
          ...sessionConfiguration,
          coach: { ...sessionConfiguration.coach, verbosity: "detailed" },
        },
      }),
    ).toThrow(PersistenceConflictError);

    const action = firstDiscard(engine, created.state);
    const result = engine.decide(created.state, {
      type: "submit_action",
      gameId: created.state.gameId,
      branchId: created.state.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "discard:one",
      actionId: action.id,
    });
    if (!result.accepted) {
      throw new Error(result.error.message);
    }
    expect(
      repository.appendAcceptedCommand({
        key,
        requestId: "discard:one",
        events: result.events,
        state: result.state,
      }),
    ).toMatchObject({ disposition: "appended", stateHash: result.state.stateHash });
    expect(
      repository.appendAcceptedCommand({
        key,
        requestId: "discard:one",
        events: result.events,
        state: result.state,
      }),
    ).toMatchObject({ disposition: "idempotent", stateHash: result.state.stateHash });
    repository.close();

    const reopened = createRepository(databasePath, engine);
    expect(reopened.loadGame(key)).toMatchObject({
      state: { revision: result.state.revision, stateHash: result.state.stateHash },
      recovery: { skippedCorruptSnapshotRevisions: [] },
    });
    expect(reopened.loadGameAtRevision(key, created.state.revision).state).toEqual(created.state);
    expect(reopened.replayToTerminal(key).state).toEqual(result.state);
    const latest = reopened.loadLatestResumableGame("learner-1");
    expect(latest).toMatchObject({
      key,
      state: { stateHash: result.state.stateHash },
      game: { sessionConfiguration },
    });
    expect(reopened.loadLatestResumableGame("learner-other")).toBeNull();
    reopened.close();
  });

  it("preserves latest branch activity ordering across export and import", () => {
    const engine = createEngine();
    const source = createRepository(createDatabasePath(), engine);
    const older = createGame(engine, "activity-order-older");
    const newer = createGame(engine, "activity-order-newer");
    const olderKey = appendCreation(source, older);
    appendCreation(source, newer);
    expect(source.loadLatestResumableGame("learner-1")?.key.gameId).toBe(newer.state.gameId);

    const action = firstDiscard(engine, older.state);
    const decided = engine.decide(older.state, {
      type: "submit_action",
      gameId: older.state.gameId,
      branchId: older.state.branchId,
      playerId: "east",
      expectedRevision: older.state.revision,
      requestId: "discard:activity-order-older",
      actionId: action.id,
    });
    if (!decided.accepted) {
      throw new Error(decided.error.message);
    }
    source.appendAcceptedCommand({
      key: olderKey,
      requestId: "discard:activity-order-older",
      events: decided.events,
      state: decided.state,
    });
    expect(source.loadLatestResumableGame("learner-1")?.key).toEqual(olderKey);
    const exported = source.exportData();
    const olderActivity = exported.data.branches.find(
      ({ key }) => key.gameId === olderKey.gameId,
    )?.activityOrder;
    const newerActivity = exported.data.branches.find(
      ({ key }) => key.gameId === newer.state.gameId,
    )?.activityOrder;
    expect(olderActivity).toBeGreaterThan(newerActivity ?? Number.MAX_SAFE_INTEGER);
    source.close();

    const target = createRepository(createDatabasePath(), engine);
    target.importData(exported, { mode: "replace" });
    expect(target.loadLatestResumableGame("learner-1")?.key).toEqual(olderKey);
    target.close();
  });

  it("rejects a truncated final batch and skips the completed match when resuming", () => {
    const engine = createEngine();
    const source = createRepository(createDatabasePath(), engine);
    const liveFallback = createGame(engine, "resume-live-fallback");
    const liveFallbackKey = appendCreation(source, liveFallback);
    const sandbox = createGame(engine, "completed-sandbox-match", "sandbox");
    const sandboxKey = appendCreation(source, sandbox);
    const preFinal = advanceSandboxToFinalLiveHand(source, engine, sandbox.state);
    const final = engine.decide(preFinal, {
      type: "end_sandbox_hand",
      gameId: preFinal.gameId,
      branchId: preFinal.branchId,
      playerId: "east",
      expectedRevision: preFinal.revision,
      requestId: "sandbox-end:final",
    });
    if (!final.accepted) {
      throw new Error(final.error.message);
    }
    expect(final.events.map(({ type }) => type)).toEqual(["hand_ended", "match_ended"]);
    const handEnded = final.events[0];
    if (handEnded?.type !== "hand_ended") {
      throw new Error("Expected a hand-ended event before match completion");
    }
    const partialState = engine.reduce(preFinal, handEnded);
    expect(partialState.phase).toBe("hand_ended");
    expect(() =>
      source.appendAcceptedCommand({
        key: sandboxKey,
        requestId: "sandbox-end:final",
        events: [handEnded],
        state: partialState,
      }),
    ).toThrow(PersistenceValidationError);
    expect(source.loadGame(sandboxKey).state).toEqual(preFinal);

    source.appendAcceptedCommand({
      key: sandboxKey,
      requestId: "sandbox-end:final",
      events: final.events,
      state: final.state,
    });
    expect(source.loadGame(sandboxKey).state.phase).toBe("match_ended");
    expect(source.loadLatestResumableGame("learner-1")?.key).toEqual(liveFallbackKey);
    const exported = source.exportData();
    expect(
      exported.data.hands.find(
        ({ key, handId }) =>
          key.gameId === sandboxKey.gameId &&
          key.branchId === sandboxKey.branchId &&
          handId === preFinal.hand.id,
      )?.endedRevision,
    ).toBe(handEnded.revision);
    source.close();

    const target = createRepository(createDatabasePath(), engine);
    target.importData(exported, { mode: "replace" });
    expect(target.loadGame(sandboxKey).state).toEqual(final.state);
    expect(target.loadLatestResumableGame("learner-1")?.key).toEqual(liveFallbackKey);
    expect(
      target
        .exportData()
        .data.hands.find(
          ({ key, handId }) =>
            key.gameId === sandboxKey.gameId &&
            key.branchId === sandboxKey.branchId &&
            handId === preFinal.hand.id,
        )?.endedRevision,
    ).toBe(handEnded.revision);
    target.close();
  }, 60_000);

  it("recovers from a corrupt newest snapshot by replaying from an earlier checkpoint", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "snapshot-recovery");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    repository.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `UPDATE game_snapshots
         SET state_json = ?
         WHERE game_id = ? AND branch_id = ?
           AND revision = (
             SELECT MAX(revision) FROM game_snapshots WHERE game_id = ? AND branch_id = ?
           )`,
      )
      .run("{}", key.gameId, key.branchId, key.gameId, key.branchId);
    database.close();

    const reopened = createRepository(databasePath, engine);
    const loaded = reopened.loadGame(key);
    expect(loaded.state).toEqual(created.state);
    expect(loaded.recovery.skippedCorruptSnapshotRevisions).toEqual([created.state.revision]);
    expect(loaded.recovery.usedSnapshotRevision).toBe(1);

    const action = firstDiscard(engine, loaded.state);
    const continued = engine.decide(loaded.state, {
      type: "submit_action",
      gameId: loaded.state.gameId,
      branchId: loaded.state.branchId,
      playerId: "east",
      expectedRevision: loaded.state.revision,
      requestId: "discard:after-snapshot-recovery",
      actionId: action.id,
    });
    if (!continued.accepted) {
      throw new Error(continued.error.message);
    }
    reopened.appendAcceptedCommand({
      key,
      requestId: "discard:after-snapshot-recovery",
      events: continued.events,
      state: continued.state,
    });
    const exported = reopened.exportData();
    reopened.close();

    const target = createRepository(createDatabasePath(), engine);
    target.importData(exported, { mode: "replace" });
    expect(target.loadGame(key).state).toEqual(continued.state);
    expect(target.replayToTerminal(key).state).toEqual(continued.state);
    target.close();
  });

  it("stores snapshots at hand boundaries and the configured periodic interval", () => {
    const engine = createEngine();
    const created = createGame(engine, "snapshot-policy", "sandbox");
    const repository = createRepository(createDatabasePath(), engine, 3);
    const key = appendCreation(repository, created);
    expect(repository.exportData().data.snapshots.map(({ revision }) => revision)).toEqual([1, 2]);

    const action = firstDiscard(engine, created.state);
    const decided = engine.decide(created.state, {
      type: "submit_action",
      gameId: key.gameId,
      branchId: key.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "discard:snapshot-policy",
      actionId: action.id,
    });
    if (!decided.accepted) {
      throw new Error(decided.error.message);
    }
    repository.appendAcceptedCommand({
      key,
      requestId: "discard:snapshot-policy",
      events: decided.events,
      state: decided.state,
    });
    const ended = endSandboxHand(repository, engine, decided.state, "sandbox-end:snapshot-policy");
    const exported = repository.exportData();
    expect(ended.phase).toBe("hand_ended");
    expect(exported.data.snapshots.map(({ revision }) => revision)).toEqual([
      1,
      2,
      3,
      ended.revision,
    ]);
    for (const snapshot of exported.data.snapshots) {
      const event = exported.data.events.find(
        ({ key: eventKey, revision }) =>
          eventKey.gameId === snapshot.key.gameId &&
          eventKey.branchId === snapshot.key.branchId &&
          revision === snapshot.revision,
      );
      expect(snapshot.stateHash).toBe(event?.stateHash);
      expect(snapshot.eventChainHash).toBe(event?.eventChainHash);
    }
    repository.close();
  });

  it("repairs a corrupt latest snapshot during a cold export", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "cold-export-snapshot-recovery");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    repository.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `UPDATE game_snapshots
         SET snapshot_hash = ?
         WHERE game_id = ? AND branch_id = ?
           AND revision = (
             SELECT MAX(revision) FROM game_snapshots WHERE game_id = ? AND branch_id = ?
           )`,
      )
      .run(invalidHash, key.gameId, key.branchId, key.gameId, key.branchId);
    database.close();

    const reopened = createRepository(databasePath, engine);
    const exported = reopened.exportData();
    expect(
      exported.data.snapshots.some(
        (snapshot) =>
          snapshot.key.gameId === key.gameId &&
          snapshot.key.branchId === key.branchId &&
          snapshot.revision === created.state.revision,
      ),
    ).toBe(false);
    reopened.close();

    const target = createRepository(createDatabasePath(), engine);
    target.importData(exported, { mode: "replace" });
    expect(target.loadGame(key).state).toEqual(created.state);
    target.close();
  });

  it.each(["event_hash", "event_chain_hash"] as const)(
    "rejects authoritative event journal tampering in %s",
    (column) => {
      const databasePath = createDatabasePath();
      const engine = createEngine();
      const created = createGame(engine, `event-tamper:${column}`);
      const repository = createRepository(databasePath, engine);
      const key = appendCreation(repository, created);
      repository.close();

      const database = new Database(databasePath);
      database
        .prepare(
          `UPDATE game_events
           SET ${column} = ?
           WHERE game_id = ? AND branch_id = ? AND revision = 1`,
        )
        .run(invalidHash, key.gameId, key.branchId);
      database.close();

      const reopened = createRepository(databasePath, engine);
      expect(() => reopened.loadGame(key)).toThrow(PersistenceCorruptionError);
      reopened.close();
    },
  );

  it.each([
    {
      name: "command receipt hash",
      mutate: (database: Database.Database, key: GameKey) =>
        database
          .prepare(
            "UPDATE command_receipts SET command_hash = ? WHERE game_id = ? AND branch_id = ?",
          )
          .run(invalidHash, key.gameId, key.branchId),
      verify: (repository: SqlitePersistenceRepository) => repository.exportData(),
    },
    {
      name: "session configuration hash",
      mutate: (database: Database.Database, key: GameKey) =>
        database
          .prepare("UPDATE games SET session_config_hash = ? WHERE game_id = ?")
          .run(invalidHash, key.gameId),
      verify: (repository: SqlitePersistenceRepository, key: GameKey) => repository.loadGame(key),
    },
  ] satisfies readonly PersistenceTamperCase[])(
    "rejects tampering in $name",
    ({ mutate, verify }) => {
      const databasePath = createDatabasePath();
      const engine = createEngine();
      const created = createGame(engine, "metadata-hash-tamper");
      const repository = createRepository(databasePath, engine);
      const key = appendCreation(repository, created);
      repository.close();

      const database = new Database(databasePath);
      mutate(database, key);
      database.close();

      const reopened = createRepository(databasePath, engine);
      expect(() => verify(reopened, key)).toThrow(PersistenceCorruptionError);
      reopened.close();
    },
  );

  it.each([
    ["ruleset_json", "{}"],
    ["ruleset_hash", invalidHash],
  ] as const)("rejects cold-load historical ruleset tampering in %s", (column, value) => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, `historical-ruleset-tamper:${column}`);
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    repository.close();

    const database = new Database(databasePath);
    database.prepare(`UPDATE games SET ${column} = ? WHERE game_id = ?`).run(value, key.gameId);
    database.close();

    const reopened = createRepository(databasePath, engine);
    expect(() => reopened.loadGame(key)).toThrow(PersistenceCorruptionError);
    expect(() => reopened.replayToTerminal(key)).toThrow(PersistenceCorruptionError);
    expect(() => reopened.loadLatestResumableGame("learner-1")).toThrow(PersistenceCorruptionError);
    reopened.close();
  });

  it("rejects a branch head rolled back over a retained event tail", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "regressed-branch-head");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    const action = firstDiscard(engine, created.state);
    const decided = engine.decide(created.state, {
      type: "submit_action",
      gameId: key.gameId,
      branchId: key.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "discard:regressed-branch-head",
      actionId: action.id,
    });
    if (!decided.accepted) {
      throw new Error(decided.error.message);
    }
    repository.appendAcceptedCommand({
      key,
      requestId: "discard:regressed-branch-head",
      events: decided.events,
      state: decided.state,
    });
    repository.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `UPDATE game_branches
         SET current_revision = 1,
             state_hash = (
               SELECT state_hash FROM game_events
               WHERE game_id = ? AND branch_id = ? AND revision = 1
             ),
             event_chain_hash = (
               SELECT event_chain_hash FROM game_events
               WHERE game_id = ? AND branch_id = ? AND revision = 1
             )
         WHERE game_id = ? AND branch_id = ?`,
      )
      .run(key.gameId, key.branchId, key.gameId, key.branchId, key.gameId, key.branchId);
    database.close();

    const reopened = createRepository(databasePath, engine);
    expect(() => reopened.loadGame(key)).toThrow(PersistenceCorruptionError);
    expect(() => reopened.replayToTerminal(key)).toThrow(PersistenceCorruptionError);
    expect(() => reopened.loadLatestResumableGame("learner-1")).toThrow(PersistenceCorruptionError);
    reopened.close();
  });

  it("rolls back an accepted command completely when SQLite rejects one event", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "transaction-rollback");
    const initialized = createRepository(databasePath, engine);
    initialized.close();
    const database = new Database(databasePath);
    database.exec(`
      CREATE TRIGGER reject_second_create_event
      BEFORE INSERT ON game_events
      WHEN NEW.revision = 2
      BEGIN
        SELECT RAISE(ABORT, 'forced transaction failure');
      END;
    `);
    database.close();

    const repository = createRepository(databasePath, engine);
    expect(() => appendCreation(repository, created)).toThrow();
    repository.close();

    const verification = new Database(databasePath, { readonly: true });
    expect(verification.prepare("SELECT COUNT(*) AS count FROM games").get()).toEqual({ count: 0 });
    expect(verification.prepare("SELECT COUNT(*) AS count FROM game_events").get()).toEqual({
      count: 0,
    });
    verification.close();
  });

  it(
    "binds decisions to legal actions and commits decision evidence atomically",
    {
      timeout: 120_000,
    },
    () => {
      const databasePath = createDatabasePath();
      const engine = createEngine();
      const created = createGame(engine, "atomic-decision-evidence");
      const repository = createRepository(databasePath, engine);
      const key = appendCreation(repository, created);
      expect(() =>
        repository.recordDecision({
          id: "decision:forged-action",
          key,
          learnerId: "learner-1",
          handId: created.state.hand.id,
          revision: created.state.revision,
          playerId: "east",
          requestId: created.events[0]?.requestId ?? "missing-create-request",
          actionId: "forged:action",
          independent: true,
          quality: 0,
          analysisVersion: "1.0.0",
          weightingVersion: "discard-weights-v1",
          data: {},
        }),
      ).toThrow(PersistenceValidationError);

      const action = firstDiscard(engine, created.state);
      const decided = engine.decide(created.state, {
        type: "submit_action",
        gameId: created.state.gameId,
        branchId: created.state.branchId,
        playerId: "east",
        expectedRevision: created.state.revision,
        requestId: "discard:atomic-decision-evidence",
        actionId: action.id,
      });
      if (!decided.accepted) {
        throw new Error(decided.error.message);
      }
      const decisionEvidence = {
        decision: {
          id: "decision:atomic-evidence",
          learnerId: "learner-1",
          handId: created.state.hand.id,
          revision: created.state.revision,
          playerId: "east",
          actionId: action.id,
          independent: true,
          quality: 0.75,
          analysisVersion: "1.0.0",
          weightingVersion: "discard-weights-v1",
          data: { rank: 1 },
        },
        analysisFacts: [
          {
            id: "fact:atomic-evidence",
            kind: "score_gap",
            summary: "The selected action matched the deterministic recommendation.",
            data: { scoreGap: 0 },
          },
        ],
      } as const;
      const alternativeAction = engine
        .legalActions(created.state, "east")
        .find(({ id }) => id !== action.id);
      if (alternativeAction === undefined) {
        throw new Error("Expected a second legal action for the evidence binding regression");
      }
      const mismatched = engine.decide(created.state, {
        type: "submit_action",
        gameId: created.state.gameId,
        branchId: created.state.branchId,
        playerId: "east",
        expectedRevision: created.state.revision,
        requestId: "discard:atomic-mismatched-evidence",
        actionId: alternativeAction.id,
      });
      if (!mismatched.accepted) {
        throw new Error(mismatched.error.message);
      }
      expect(() =>
        repository.appendAcceptedCommand({
          key,
          requestId: "discard:atomic-mismatched-evidence",
          events: mismatched.events,
          state: mismatched.state,
          decisionEvidence,
        }),
      ).toThrow(/does not match the accepted command/u);
      expect(repository.exportData().data.decisions).toEqual([]);
      expect(() =>
        repository.appendAcceptedCommand({
          key,
          requestId: "discard:atomic-decision-evidence",
          events: decided.events,
          state: decided.state,
          decisionEvidence: {
            ...decisionEvidence,
            analysisFacts: [{ ...decisionEvidence.analysisFacts[0], summary: "" }],
          },
        }),
      ).toThrow(PersistenceValidationError);
      expect(repository.loadGame(key).state).toEqual(created.state);
      expect(repository.exportData().data.decisions).toEqual([]);
      expect(repository.exportData().data.analysisFacts).toEqual([]);

      const acceptedInput = {
        key,
        requestId: "discard:atomic-decision-evidence",
        events: decided.events,
        state: decided.state,
        decisionEvidence,
      } as const;
      expect(repository.appendAcceptedCommand(acceptedInput)).toMatchObject({
        disposition: "appended",
        stateHash: decided.state.stateHash,
      });
      expect(repository.exportData().data.decisions).toHaveLength(1);
      expect(repository.exportData().data.analysisFacts).toHaveLength(1);
      expect(repository.appendAcceptedCommand(acceptedInput)).toMatchObject({
        disposition: "idempotent",
        stateHash: decided.state.stateHash,
      });
      expect(() =>
        repository.appendAcceptedCommand({
          ...acceptedInput,
          decisionEvidence: {
            ...decisionEvidence,
            decision: { ...decisionEvidence.decision, quality: 0.25 },
          },
        }),
      ).toThrow(PersistenceConflictError);
      repository.close();
    },
  );

  it(
    "exports/imports immutable practice branches without changing the parent stream",
    {
      timeout: 120_000,
    },
    () => {
      const sourcePath = createDatabasePath();
      const engine = createEngine();
      const created = createGame(engine, "branch-export");
      const source = createRepository(sourcePath, engine);
      const parent = appendCreation(source, created);
      const decision = source.recordDecision({
        id: "decision:branch-export",
        key: parent,
        learnerId: "learner-1",
        handId: created.state.hand.id,
        revision: created.state.revision,
        playerId: "east",
        actionId: firstDiscard(engine, created.state).id,
        independent: true,
        quality: 1,
        analysisVersion: "1.0.0",
        weightingVersion: "discard-weights-v1",
        data: { source: "persistence-test" },
      });
      expect(decision.revision).toBe(created.state.revision);
      const parentBefore = source.loadGame(parent);
      const forked = engine.decide(created.state, {
        type: "create_practice_branch",
        gameId: created.state.gameId,
        branchId: "practice:branch-export",
        parentBranchId: parent.branchId,
        playerId: "east",
        expectedRevision: created.state.revision,
        requestId: "branch:branch-export",
        originDecisionId: decision.id,
      });
      if (!forked.accepted) {
        throw new Error(forked.error.message);
      }
      const marker = forked.events[0];
      if (marker?.type !== "practice_branch_created") {
        throw new Error("Expected the core engine to produce a practice branch marker");
      }
      const fork = source.forkPracticeBranch({
        parent,
        event: marker,
        state: forked.state,
      });
      expect(fork.disposition).toBe("created");
      expect(fork.branch.key.branchId).toBe(marker.branchId);
      expect(fork.branch.practice).toBe(true);
      expect(
        source.forkPracticeBranch({
          parent,
          event: marker,
          state: forked.state,
        }),
      ).toMatchObject({ disposition: "idempotent", branch: { key: fork.branch.key } });
      expect(source.loadGame(parent).state.stateHash).toBe(parentBefore.state.stateHash);
      const child = source.loadGame(fork.branch.key);
      expect(child.state.branchId).toBe(fork.branch.key.branchId);
      expect(child.state.practiceBranch).toBe(true);
      expect(child.state.revision).toBe(created.state.revision + 1);
      expect(source.loadLatestResumableGame("learner-1")?.key).toEqual(fork.branch.key);

      const exported = source.exportData();
      expect(exported.data.branches).toHaveLength(2);
      expect(
        exported.data.snapshots
          .filter((snapshot) => snapshot.key.branchId === fork.branch.key.branchId)
          .map((snapshot) => snapshot.revision),
      ).toEqual([forked.state.revision]);
      expect(
        exported.data.commandReceipts.find(
          (receipt) =>
            receipt.key.branchId === parent.branchId && receipt.requestId === marker.requestId,
        ),
      ).toMatchObject({ resultKey: fork.branch.key });
      source.close();

      const sourceDatabase = new Database(sourcePath);
      sourceDatabase
        .prepare(
          `UPDATE game_snapshots
         SET state_json = ?
         WHERE game_id = ? AND branch_id = ? AND revision = ?`,
        )
        .run("{}", fork.branch.key.gameId, fork.branch.key.branchId, forked.state.revision);
      sourceDatabase.close();
      const recoveredSource = createRepository(sourcePath, engine);
      expect(recoveredSource.loadGame(fork.branch.key)).toMatchObject({
        state: forked.state,
        recovery: {
          skippedCorruptSnapshotRevisions: [forked.state.revision],
          usedSnapshotRevision: created.state.revision,
        },
      });
      recoveredSource.close();

      const targetPath = createDatabasePath();
      const target = createRepository(targetPath, engine);
      expect(target.importData(exported, { mode: "replace" })).toEqual({
        mode: "replace",
        importedGames: 1,
        importedBranches: 2,
      });
      expect(target.loadGame(parent).state.stateHash).toBe(parentBefore.state.stateHash);
      expect(target.loadGame(fork.branch.key).state.stateHash).toBe(child.state.stateHash);
      target.close();
    },
  );

  it("fails a learner reset closed on a legacy cross-owner origin decision", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "legacy-cross-owner-origin");
    const repository = createRepository(databasePath, engine);
    const parent = appendCreation(repository, created);
    repository.ensureLearner("learner-2");
    const decision = repository.recordDecision({
      id: "decision:legacy-cross-owner-origin",
      key: parent,
      learnerId: "learner-1",
      handId: created.state.hand.id,
      revision: created.state.revision,
      playerId: "east",
      actionId: firstDiscard(engine, created.state).id,
      independent: true,
      quality: 1,
      analysisVersion: "1.0.0",
      weightingVersion: "discard-weights-v1",
      data: {},
    });
    const forked = engine.decide(created.state, {
      type: "create_practice_branch",
      gameId: created.state.gameId,
      branchId: "practice:legacy-cross-owner-origin",
      parentBranchId: parent.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "branch:legacy-cross-owner-origin",
      originDecisionId: decision.id,
    });
    const marker = forked.accepted ? forked.events[0] : undefined;
    if (marker?.type !== "practice_branch_created") {
      throw new Error("Expected a legacy practice branch marker");
    }
    const child = repository.forkPracticeBranch({
      parent,
      event: marker,
      state: forked.state,
    }).branch.key;
    repository.close();

    const legacyDatabase = new Database(databasePath);
    legacyDatabase
      .prepare("UPDATE decisions SET learner_id = ? WHERE decision_id = ?")
      .run("learner-2", decision.id);
    legacyDatabase.close();

    const resumed = createRepository(databasePath, engine);
    expect(() => resumed.resetLearnerProgress("learner-2")).toThrow(PersistenceCorruptionError);
    expect(resumed.loadGame(child).state.stateHash).toBe(forked.state.stateHash);
    expect(resumed.replayToTerminal(child).state.stateHash).toBe(forked.state.stateHash);
    resumed.close();

    const verification = new Database(databasePath, { readonly: true });
    expect(
      verification
        .prepare<[string], { learner_id: string }>(
          "SELECT learner_id FROM decisions WHERE decision_id = ?",
        )
        .get(decision.id),
    ).toEqual({ learner_id: "learner-2" });
    expect(
      verification
        .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM game_branches")
        .get(),
    ).toEqual({ count: 2 });
    verification.close();
  });

  it("rejects a core-shaped practice fork from competitive persistence state", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "competitive-branch-persistence", "competitive");
    const repository = createRepository(databasePath, engine);
    const parent = appendCreation(repository, created);
    const decision = repository.recordDecision({
      id: "decision:competitive-branch",
      key: parent,
      learnerId: "learner-1",
      handId: created.state.hand.id,
      revision: created.state.revision,
      playerId: "east",
      actionId: firstDiscard(engine, created.state).id,
      independent: true,
      quality: 1,
      analysisVersion: "1.0.0",
      weightingVersion: "discard-weights-v1",
      data: { source: "persistence-test" },
    });
    const parentEventId = created.state.lastEventId;
    if (parentEventId === null) {
      throw new Error("Expected a persisted competitive parent event");
    }
    expect(() =>
      repository.forkPracticeBranch({
        parent,
        event: {
          id: `event:${created.state.gameId}:practice:competitive:${String(created.state.revision + 1)}`,
          gameId: created.state.gameId,
          branchId: "practice:competitive",
          revision: created.state.revision + 1,
          requestId: "branch:competitive",
          visibility: "internal",
          type: "practice_branch_created",
          parentBranchId: parent.branchId,
          parentRevision: created.state.revision,
          parentEventId,
          parentStateHash: created.state.stateHash,
          originDecisionId: decision.id,
          originDecisionBranchId: parent.branchId,
          requestedByPlayerId: "east",
        },
        // The mode gate must reject before it accepts any forged child state.
        state: created.state,
      }),
    ).toThrow(/unavailable in competitive or exam games/u);
    expect(repository.exportData().data.branches).toHaveLength(1);
    repository.close();
  });

  it("rejects invalid practice-branch provenance without mutating the target", () => {
    const engine = createEngine();
    const sourcePath = createDatabasePath();
    const source = createRepository(sourcePath, engine);
    const created = createGame(engine, "cross-game-branch-parent");
    const parent = appendCreation(source, created);
    source.ensureLearner("learner-2");
    const decision = source.recordDecision({
      id: "decision:cross-game-parent",
      key: parent,
      learnerId: "learner-1",
      handId: created.state.hand.id,
      revision: created.state.revision,
      playerId: "east",
      actionId: firstDiscard(engine, created.state).id,
      independent: true,
      quality: 1,
      analysisVersion: "1.0.0",
      weightingVersion: "discard-weights-v1",
      data: {},
    });
    const legacyDatabase = new Database(sourcePath);
    legacyDatabase
      .prepare("UPDATE decisions SET learner_id = ? WHERE decision_id = ?")
      .run("learner-2", decision.id);
    legacyDatabase.close();
    const crossOwnerFork = engine.decide(created.state, {
      type: "create_practice_branch",
      gameId: created.state.gameId,
      branchId: "practice:cross-owner-parent",
      parentBranchId: parent.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "branch:cross-owner-parent",
      originDecisionId: decision.id,
    });
    const crossOwnerMarker = crossOwnerFork.accepted ? crossOwnerFork.events[0] : undefined;
    if (crossOwnerMarker?.type !== "practice_branch_created") {
      throw new Error("Expected a core-valid cross-owner practice branch");
    }
    expect(() =>
      source.forkPracticeBranch({
        parent,
        event: crossOwnerMarker,
        state: crossOwnerFork.state,
      }),
    ).toThrow(PersistenceValidationError);
    const unchanged = new Database(sourcePath, { readonly: true });
    expect(unchanged.prepare("SELECT COUNT(*) AS count FROM game_branches").get()).toEqual({
      count: 1,
    });
    unchanged.close();

    const repairedDatabase = new Database(sourcePath);
    repairedDatabase
      .prepare("UPDATE decisions SET learner_id = ? WHERE decision_id = ?")
      .run("learner-1", decision.id);
    repairedDatabase.close();

    const forked = engine.decide(created.state, {
      type: "create_practice_branch",
      gameId: created.state.gameId,
      branchId: "practice:cross-game-parent",
      parentBranchId: parent.branchId,
      playerId: "east",
      expectedRevision: created.state.revision,
      requestId: "branch:cross-game-parent",
      originDecisionId: decision.id,
    });
    if (!forked.accepted || forked.events[0]?.type !== "practice_branch_created") {
      throw new Error("Expected a valid practice branch");
    }
    source.forkPracticeBranch({
      parent,
      event: forked.events[0],
      state: forked.state,
    });
    const other = createGame(engine, "cross-game-branch-parent-other");
    const otherKey = appendCreation(source, other);
    const exported = source.exportData();
    source.close();

    const invalidDocuments = [
      {
        ...exported,
        data: {
          ...exported.data,
          branches: exported.data.branches.map((branch) =>
            branch.key.branchId === forked.state.branchId
              ? {
                  ...branch,
                  parentKey: { gameId: otherKey.gameId, branchId: otherKey.branchId },
                }
              : branch,
          ),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          commandReceipts: exported.data.commandReceipts.filter(
            ({ requestId }) => requestId !== "branch:cross-game-parent",
          ),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          decisions: exported.data.decisions.map((entry) =>
            entry.id === decision.id ? { ...entry, learnerId: "learner-2" } : entry,
          ),
        },
      },
    ];
    for (const invalid of invalidDocuments) {
      const target = createRepository(createDatabasePath(), engine);
      expect(() => target.importData(invalid, { mode: "replace" })).toThrow(
        PersistenceValidationError,
      );
      expect(target.exportData().data.games).toEqual([]);
      target.close();
    }
  });

  it("round-trips the complete learner evidence surface and supports merge imports", () => {
    const sourcePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "learner-evidence-round-trip", "sandbox");
    const source = createRepository(sourcePath, engine);
    const key = appendCreation(source, created);
    expect(source.getLearnerPreferences("learner-1")).toBeNull();
    source.saveLearnerPreferences({
      learnerId: "learner-1",
      preferences: { language: "en", verbosity: "brief" },
    });
    const mastery = source.upsertConceptMastery({
      learnerId: "learner-1",
      conceptId: "tile_efficiency",
      mastery: 0.6,
      confidence: 0.7,
      attempts: 5,
      independentAttempts: 4,
      successfulAttempts: 3,
      hintWeightedScore: 2.5,
      algorithmVersion: "mastery-v1",
      lastSeenAt: "2026-08-01T11:00:00.000Z",
      nextReviewAt: "2026-08-05T11:00:00.000Z",
    });
    expect(source.listConceptMastery("learner-1")).toEqual([mastery]);
    const decision = source.recordDecision({
      id: "decision:evidence-round-trip",
      key,
      learnerId: "learner-1",
      handId: created.state.hand.id,
      revision: created.state.revision,
      playerId: "east",
      actionId: firstDiscard(engine, created.state).id,
      independent: true,
      quality: 0.75,
      analysisVersion: "1.0.0",
      weightingVersion: "discard-weights-v1",
      data: { rank: 2, scoreGap: 0.1 },
    });
    const facts = source.recordAnalysisFacts([
      {
        id: "fact:evidence-round-trip",
        decisionId: decision.id,
        kind: "score_gap",
        summary: "The selected action was close to the top candidate.",
        data: { scoreGap: 0.1 },
      },
    ]);
    source.recordHint({
      id: "hint:evidence-round-trip",
      learnerId: "learner-1",
      decisionId: decision.id,
      level: 2,
      data: { candidates: 2 },
    });
    expect(() =>
      source.recordReview({
        id: "review:open-hand",
        learnerId: "learner-1",
        key,
        handId: created.state.hand.id,
        data: { focus: "tile_efficiency" },
      }),
    ).toThrow(PersistenceValidationError);
    const completedState = endSandboxHand(
      source,
      engine,
      created.state,
      "sandbox-end:evidence-round-trip",
    );
    source.recordReview({
      id: "review:evidence-round-trip",
      learnerId: "learner-1",
      key,
      handId: created.state.hand.id,
      data: { focus: "tile_efficiency" },
    });
    const drill = source.saveDrillItem({
      id: "drill:evidence-round-trip",
      learnerId: "learner-1",
      source: "replay",
      conceptIds: ["tile_efficiency"],
      difficulty: 0.55,
      data: { decisionId: decision.id },
    });
    source.recordDrillAttempt({
      id: "attempt:evidence-round-trip",
      drillItemId: drill.id,
      learnerId: "learner-1",
      correct: true,
      hintLevel: 1,
      data: { elapsedMs: 500 },
    });
    source.saveSpacedRepetitionSchedule({
      drillItemId: drill.id,
      learnerId: "learner-1",
      nextReviewAt: "2026-08-05T11:00:00.000Z",
      intervalDays: 4,
      ease: 2.5,
    });
    source.recordLlmRequestMetadata({
      id: "llm:evidence-round-trip",
      learnerId: "learner-1",
      decisionId: decision.id,
      provider: "fake",
      model: "fake-model",
      latencyMs: 25,
      inputTokens: 100,
      outputTokens: 30,
      factIds: facts.map(({ id }) => id),
      status: "success",
    });
    const exported = source.exportData();
    const redactedExport = source.exportData({ includeLlmMetadata: false });
    source.close();

    expect(exported.data.analysisFacts).toHaveLength(1);
    expect(exported.data.hints).toHaveLength(1);
    expect(exported.data.reviews).toHaveLength(1);
    expect(exported.data.drillAttempts).toHaveLength(1);
    expect(exported.data.schedules).toHaveLength(1);
    expect(exported.data.llmRequests).toHaveLength(1);
    expect(redactedExport.data.llmRequests).toEqual([]);

    const merged = createRepository(createDatabasePath(), engine);
    merged.ensureLearner("learner-other");
    expect(merged.importData(exported, { mode: "merge" })).toMatchObject({
      mode: "merge",
      importedGames: 1,
      importedBranches: 1,
    });
    expect(merged.exportData().data.learners.map(({ learnerId }) => learnerId)).toEqual([
      "learner-1",
      "learner-other",
    ]);
    merged.close();

    const replaced = createRepository(createDatabasePath(), engine);
    replaced.ensureLearner("learner-replaced");
    replaced.importData(exported, { mode: "replace" });
    expect(replaced.exportData().data).toEqual(exported.data);
    expect(replaced.loadGame(key).state).toEqual(completedState);
    replaced.close();

    const redacted = createRepository(createDatabasePath(), engine);
    redacted.importData(redactedExport, { mode: "replace" });
    expect(redacted.loadGame(key).state).toEqual(completedState);
    expect(redacted.exportData().data.llmRequests).toEqual([]);
    redacted.close();
  }, 60_000);

  it("rejects forged derived records while preserving the target transaction", () => {
    const engine = createEngine();
    const source = createRepository(createDatabasePath(), engine);
    const created = createGame(engine, "derived-import-integrity", "sandbox");
    const key = appendCreation(source, created);
    source.ensureLearner("learner-2");
    source.upsertConceptMastery({
      learnerId: "learner-1",
      conceptId: "tile_efficiency",
      mastery: 0.6,
      confidence: 0.7,
      attempts: 2,
      independentAttempts: 2,
      successfulAttempts: 1,
      hintWeightedScore: 1,
      algorithmVersion: "mastery-v1",
    });
    const decision = source.recordDecision({
      id: "decision:derived-import",
      key,
      learnerId: "learner-1",
      handId: created.state.hand.id,
      revision: created.state.revision,
      playerId: "east",
      actionId: firstDiscard(engine, created.state).id,
      independent: true,
      quality: 0.8,
      analysisVersion: "1.0.0",
      weightingVersion: "discard-weights-v1",
      data: {},
    });
    const [fact] = source.recordAnalysisFacts([
      {
        id: "fact:derived-import",
        decisionId: decision.id,
        kind: "score_gap",
        summary: "A grounded fact.",
        data: { scoreGap: 0.1 },
      },
    ]);
    if (fact === undefined) {
      throw new Error("Expected a persisted analysis fact");
    }
    source.recordHint({
      id: "hint:derived-import",
      learnerId: "learner-1",
      decisionId: decision.id,
      level: 1,
      data: {},
    });
    const openHandExport = source.exportData();
    endSandboxHand(source, engine, created.state, "sandbox-end:derived-import-integrity");
    source.recordReview({
      id: "review:derived-import",
      learnerId: "learner-1",
      key,
      handId: created.state.hand.id,
      data: {},
    });
    const drill = source.saveDrillItem({
      id: "drill:derived-import",
      learnerId: "learner-1",
      source: "replay",
      conceptIds: ["tile_efficiency"],
      difficulty: 0.5,
      data: {},
    });
    source.recordDrillAttempt({
      id: "attempt:derived-import",
      drillItemId: drill.id,
      learnerId: "learner-1",
      correct: true,
      hintLevel: 0,
      data: {},
    });
    source.saveSpacedRepetitionSchedule({
      drillItemId: drill.id,
      learnerId: "learner-1",
      nextReviewAt: "2026-08-04T12:00:00.000Z",
      intervalDays: 1,
      ease: 2.5,
    });
    source.recordLlmRequestMetadata({
      id: "llm:derived-import",
      learnerId: "learner-1",
      decisionId: decision.id,
      provider: "fake",
      model: "fake-model",
      latencyMs: 20,
      factIds: [fact.id],
      status: "success",
    });
    const exported = source.exportData();
    source.close();

    const invalidDocuments = [
      {
        ...exported,
        data: {
          ...exported.data,
          games: exported.data.games.map((game) => {
            const missingLearnerId: Partial<typeof game> = { ...game };
            delete missingLearnerId.learnerId;
            return missingLearnerId;
          }),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          commandReceipts: exported.data.commandReceipts.map((receipt) => ({
            ...receipt,
            resultKey: { ...receipt.resultKey, gameId: "forged-other-game" },
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          decisions: exported.data.decisions.map((record) => ({
            ...record,
            independent: "false",
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          conceptMastery: exported.data.conceptMastery.map((mastery) => ({
            ...mastery,
            mastery: "0.6",
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          games: exported.data.games.map((game) => ({ ...game, unexpected: true })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          drillItems: exported.data.drillItems.map((drillItem) => ({
            ...drillItem,
            conceptIds: [...drillItem.conceptIds, ...drillItem.conceptIds],
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          hands: exported.data.hands.map((hand) => ({ ...hand, seed: "forged-hand-seed" })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          decisions: exported.data.decisions.map((record) => ({
            ...record,
            playerId: "missing-player",
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          drillAttempts: exported.data.drillAttempts.map((attempt) => ({
            ...attempt,
            learnerId: "learner-2",
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          reviews: exported.data.reviews.map((review) => ({
            ...review,
            handId: "missing-hand",
          })),
        },
      },
      {
        ...openHandExport,
        data: {
          ...openHandExport.data,
          reviews: [
            {
              id: "review:forged-open-hand",
              learnerId: "learner-1",
              key,
              handId: created.state.hand.id,
              data: {},
              createdAt: "2026-08-02T12:00:00.000Z",
            },
          ],
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          hints: exported.data.hints.map((hint) => ({
            ...hint,
            learnerId: "learner-2",
          })),
        },
      },
      {
        ...exported,
        data: {
          ...exported.data,
          llmRequests: exported.data.llmRequests.map((request) => ({
            ...request,
            factIds: [fact.id, fact.id],
          })),
        },
      },
    ];
    for (const invalid of invalidDocuments) {
      const target = createRepository(createDatabasePath(), engine);
      target.ensureLearner("target-existing");
      const before = target.exportData().data;
      expect(() => target.importData(invalid, { mode: "replace" })).toThrow(
        PersistenceValidationError,
      );
      expect(target.exportData().data).toEqual(before);
      target.close();
    }
  }, 60_000);

  it("resets owned history while retaining learner preferences", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "learner-reset");
    const repository = createRepository(databasePath, engine);
    appendCreation(repository, created);
    repository.saveLearnerPreferences({
      learnerId: "learner-1",
      preferences: { language: "en", contrast: "high" },
    });
    repository.upsertConceptMastery({
      learnerId: "learner-1",
      conceptId: "tile_efficiency",
      mastery: 0.4,
      confidence: 0.2,
      attempts: 2,
      independentAttempts: 1,
      successfulAttempts: 1,
      hintWeightedScore: 1,
      algorithmVersion: "mastery-v1",
    });
    const resetDrill = repository.saveDrillItem({
      id: "drill:reset",
      learnerId: "learner-1",
      source: "generated",
      conceptIds: ["tile_efficiency"],
      difficulty: 0.5,
      data: { prompt: "discard" },
    });
    repository.recordDrillAttempt({
      id: "attempt:reset",
      drillItemId: resetDrill.id,
      learnerId: "learner-1",
      correct: false,
      hintLevel: 2,
      data: { source: "reset-test" },
    });
    repository.saveSpacedRepetitionSchedule({
      drillItemId: resetDrill.id,
      learnerId: "learner-1",
      nextReviewAt: "2026-08-04T12:00:00.000Z",
      intervalDays: 2,
      ease: 2.2,
    });
    expect(() =>
      repository.saveDrillItem({
        id: resetDrill.id,
        learnerId: "learner-2",
        source: "generated",
        conceptIds: ["tile_efficiency"],
        difficulty: 0.6,
        data: { prompt: "reassigned" },
      }),
    ).toThrow(PersistenceValidationError);
    expect(() =>
      repository.recordDrillAttempt({
        id: "attempt:wrong-learner",
        drillItemId: resetDrill.id,
        learnerId: "learner-2",
        correct: true,
        hintLevel: 0,
        data: {},
      }),
    ).toThrow(PersistenceValidationError);
    expect(() =>
      repository.saveSpacedRepetitionSchedule({
        drillItemId: resetDrill.id,
        learnerId: "learner-2",
        nextReviewAt: "2026-08-04T12:00:00.000Z",
        intervalDays: 2,
        ease: 2.2,
      }),
    ).toThrow(PersistenceValidationError);
    const decision = repository.recordDecision({
      id: "decision:reset",
      key: mainKey(created.state),
      learnerId: "learner-1",
      handId: created.state.hand.id,
      revision: created.state.revision,
      playerId: "east",
      actionId: firstDiscard(engine, created.state).id,
      independent: true,
      quality: 0.5,
      analysisVersion: "1.0.0",
      weightingVersion: "discard-weights-v1",
      data: { source: "reset-test" },
    });
    repository.recordLlmRequestMetadata({
      id: "llm:decision-owned",
      decisionId: decision.id,
      provider: "fake",
      model: "fake-model",
      latencyMs: 10,
      factIds: [],
      status: "success",
    });
    repository.recordLlmRequestMetadata({
      id: "llm:learner-owned",
      learnerId: "learner-1",
      provider: "fake",
      model: "fake-model",
      latencyMs: 11,
      factIds: [],
      status: "error",
      errorCode: "fake_error",
    });
    const runtimeOnlySecret = "runtime-only-secret-sentinel";
    repository.recordLlmRequestMetadata({
      id: "llm:anonymous",
      provider: "fake",
      model: "fake-model",
      latencyMs: 12,
      factIds: [],
      status: "aborted",
      apiKey: runtimeOnlySecret,
      prompt: runtimeOnlySecret,
    } as Parameters<SqlitePersistenceRepository["recordLlmRequestMetadata"]>[0]);
    expect(JSON.stringify(repository.exportData())).not.toContain(runtimeOnlySecret);
    expect(JSON.stringify(repository.exportData({ includeLlmMetadata: false }))).not.toContain(
      runtimeOnlySecret,
    );
    expect(() =>
      repository.recordDecision({
        id: "decision:other-learner",
        key: mainKey(created.state),
        learnerId: "learner-2",
        handId: created.state.hand.id,
        revision: created.state.revision,
        playerId: "east",
        actionId: firstDiscard(engine, created.state).id,
        independent: true,
        quality: 0.5,
        analysisVersion: "1.0.0",
        weightingVersion: "discard-weights-v1",
        data: { source: "cross-learner-reset-test" },
      }),
    ).toThrow(PersistenceValidationError);
    repository.recordLlmRequestMetadata({
      id: "llm:other-learner",
      learnerId: "learner-2",
      provider: "fake",
      model: "fake-model",
      latencyMs: 13,
      factIds: [],
      status: "success",
    });
    expect(repository.exportData({ includeLlmMetadata: false }).data.llmRequests).toEqual([]);

    repository.resetLearnerProgress("learner-1");
    expect(repository.getLearnerPreferences("learner-1")).toMatchObject({
      preferences: { language: "en", contrast: "high" },
    });
    const reset = repository.exportData();
    expect(reset.data.games).toEqual([]);
    expect(reset.data.branches).toEqual([]);
    expect(reset.data.events).toEqual([]);
    expect(reset.data.snapshots).toEqual([]);
    expect(reset.data.decisions).toEqual([]);
    expect(reset.data.conceptMastery).toEqual([]);
    expect(reset.data.drillItems).toEqual([]);
    expect(reset.data.drillAttempts).toEqual([]);
    expect(reset.data.schedules).toEqual([]);
    expect(reset.data.llmRequests).toMatchObject([
      { id: "llm:anonymous", learnerId: null, decisionId: null },
      {
        id: "llm:other-learner",
        learnerId: "learner-2",
        decisionId: null,
        factIds: [],
      },
    ]);

    repository.deleteAllData();
    expect(repository.exportData().data.learners).toEqual([]);
    expect(repository.exportData().data.learnerPreferences).toEqual([]);
    expect(repository.exportData().data.llmRequests).toEqual([]);
    repository.close();

    const verification = new Database(databasePath, { readonly: true });
    expect(
      verification
        .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map(({ version }) => version),
    ).toEqual([1, 2, 3, 4]);
    verification.close();
  });

  it("rejects malformed imports without mutating the existing database", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "invalid-import");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    expect(() =>
      repository.importData({ format: "wrong", version: 1, exportedAt: "x", data: {} }),
    ).toThrow(PersistenceValidationError);
    for (const version of [1, 2, 3, 5]) {
      expect(() =>
        repository.importData({
          format: "hk-mahjong-persistence",
          version,
          exportedAt: "2026-08-02T12:00:00.000Z",
          data: {},
        }),
      ).toThrow(PersistenceValidationError);
    }
    expect(() =>
      repository.importData(
        {},
        {
          mode: "unsupported" as never,
        },
      ),
    ).toThrow(PersistenceValidationError);
    expect(repository.loadGame(key).state.stateHash).toBe(created.state.stateHash);
    const exported = repository.exportData();
    const missingReceipt = {
      ...exported,
      data: {
        ...exported.data,
        commandReceipts: [],
      },
    };
    repository.close();

    const target = createRepository(createDatabasePath(), engine);
    target.ensureLearner("target-existing");
    const before = target.exportData().data;
    expect(() => target.importData(missingReceipt, { mode: "replace" })).toThrow(
      PersistenceValidationError,
    );
    expect(target.exportData().data).toEqual(before);
    target.close();
  });

  it("migrates a version-two ledger and backfills receipt result branches", () => {
    const databasePath = createDatabasePath();
    const database = new Database(databasePath);
    const first = PERSISTENCE_MIGRATIONS[0];
    const second = PERSISTENCE_MIGRATIONS[1];
    if (first === undefined || second === undefined) {
      throw new Error("Expected persistence migrations one and two");
    }
    database.exec(first.sql);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(first.version, "2026-08-01T00:00:00.000Z");
    database.exec(second.sql);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(second.version, "2026-08-01T00:00:00.000Z");
    database
      .prepare(
        `INSERT INTO games (
           game_id, learner_id, ruleset_id, ruleset_version, ruleset_hash, seed,
           rng_version, mode, created_at, ruleset_json
         ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        "legacy-game",
        "training_relaxed_v1",
        "1.0.0",
        invalidHash,
        "legacy-seed",
        "xoshiro128ss-v1",
        "guided",
        "2026-08-01T00:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO game_branches (
           game_id, branch_id, parent_branch_id, fork_revision, fork_state_hash,
           fork_event_chain_hash, practice, created_at, current_revision, state_hash,
           event_chain_hash
         ) VALUES (?, ?, NULL, 0, NULL, ?, 0, ?, 1, ?, ?)`,
      )
      .run(
        "legacy-game",
        "main",
        invalidHash,
        "2026-08-01T00:00:00.000Z",
        invalidHash,
        invalidHash,
      );
    database
      .prepare(
        `INSERT INTO command_receipts (
           game_id, branch_id, request_id, command_hash, start_revision, end_revision,
           state_hash, created_at
         ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(
        "legacy-game",
        "main",
        "legacy-request",
        invalidHash,
        invalidHash,
        "2026-08-01T00:00:00.000Z",
      );
    database.close();

    const migrated = createRepository(databasePath, createEngine());
    expect(migrated.loadLatestResumableGame(null)).toBeNull();
    migrated.close();
    const verification = new Database(databasePath, { readonly: true });
    expect(
      verification
        .prepare("SELECT result_branch_id FROM command_receipts WHERE request_id = ?")
        .get("legacy-request"),
    ).toEqual({ result_branch_id: "main" });
    expect(
      verification
        .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map(({ version }) => version),
    ).toEqual([1, 2, 3, 4]);
    verification.close();
  });

  it("keeps a pre-v4 save replayable but excludes it from automatic resume", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "legacy-session-configuration");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);
    repository.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `UPDATE games
         SET session_config_json = NULL, session_config_hash = NULL
         WHERE game_id = ?`,
      )
      .run(key.gameId);
    database.close();

    const migrated = createRepository(databasePath, engine);
    expect(migrated.loadGame(key).state).toEqual(created.state);
    expect(migrated.replayToTerminal(key).state).toEqual(created.state);
    expect(migrated.loadLatestResumableGame("learner-1")).toBeNull();
    expect(migrated.exportData().data.games).toMatchObject([
      {
        gameId: key.gameId,
        sessionConfiguration: null,
        sessionConfigurationHash: null,
      },
    ]);
    migrated.close();
  });

  it("rejects a non-contiguous persistence migration ledger", () => {
    const databasePath = createDatabasePath();
    const initialized = createRepository(databasePath, createEngine());
    initialized.close();
    const database = new Database(databasePath);
    database.prepare("DELETE FROM schema_migrations WHERE version = 2").run();
    database.close();

    expect(() => createRepository(databasePath, createEngine())).toThrow(
      PersistenceCorruptionError,
    );
    const verification = new Database(databasePath, { readonly: true });
    expect(
      verification
        .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map(({ version }) => version),
    ).toEqual([1, 3, 4]);
    verification.close();
  });

  it("rejects an unsupported persistence migration ledger without mutating it", () => {
    const databasePath = createDatabasePath();
    const initialized = createRepository(databasePath, createEngine());
    initialized.close();
    const database = new Database(databasePath);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(99, "2026-08-03T00:00:00.000Z");
    database.close();

    expect(() => createRepository(databasePath, createEngine())).toThrow(
      PersistenceCorruptionError,
    );
    const verification = new Database(databasePath, { readonly: true });
    expect(
      verification
        .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map(({ version }) => version),
    ).toEqual([1, 2, 3, 4, 99]);
    verification.close();
  });

  it("retains the exact resolved ruleset definition and rejects a mismatched import", () => {
    const sourcePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "historical-ruleset");
    const source = createRepository(sourcePath, engine);
    const key = appendCreation(source, created);
    const exported = source.exportData();
    const game = exported.data.games[0];
    expect(game).toMatchObject({
      gameId: key.gameId,
      rulesetId: "training_relaxed_v1",
      rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
    });
    source.close();

    const tampered = {
      ...exported,
      data: {
        ...exported.data,
        games: exported.data.games.map((entry) => ({
          ...entry,
          rulesetDefinition: {
            ...entry.rulesetDefinition,
            description: "tampered historical rules",
          },
        })),
      },
    };
    const targetPath = createDatabasePath();
    const target = createRepository(targetPath, engine);
    expect(() => target.importData(tampered, { mode: "replace" })).toThrow(
      PersistenceValidationError,
    );
    expect(target.exportData().data.games).toHaveLength(0);
    target.close();
  });

  it("binds historical ruleset data to the complete authoritative core projection", () => {
    const resolved = getBundledRuleset("training_relaxed_v1");
    const canonicalRules = toCoreGameRules(resolved);
    const forgedRules: CoreGameRules = {
      ...canonicalRules,
      minimumFaan: canonicalRules.minimumFaan + 1,
    };
    const engine = createEngine();
    const created = createGame(engine, "forged-core-rules", "guided", forgedRules);
    const direct = createRepository(createDatabasePath(), engine);
    expect(() =>
      direct.appendAcceptedCommand({
        key: mainKey(created.state),
        requestId: created.events[0]?.requestId ?? "missing-create-request",
        events: created.events,
        state: created.state,
        learnerId: "learner-1",
        rulesetDefinition: resolved.definition,
        sessionConfiguration,
      }),
    ).toThrow(PersistenceValidationError);
    expect(direct.exportData().data.games).toEqual([]);
    direct.close();

    const forgedSourcePath = createDatabasePath();
    const source = new SqlitePersistenceRepository({
      databasePath: forgedSourcePath,
      reducer: (state, event) => engine.reduce(state, event),
      legalActions: (state, playerId) => engine.legalActions(state, playerId),
      validateRulesetDefinition: (definition) => {
        const ruleset = resolveRuleset(definition);
        return {
          definition: ruleset.definition,
          hash: ruleset.hash,
          coreRules: forgedRules,
        };
      },
      snapshotEveryEvents: 1,
      clock: () => "2026-08-03T12:00:00.000Z",
    });
    source.appendAcceptedCommand({
      key: mainKey(created.state),
      requestId: created.events[0]?.requestId ?? "missing-create-request",
      events: created.events,
      state: created.state,
      learnerId: "learner-1",
      rulesetDefinition: resolved.definition,
      sessionConfiguration,
    });
    const forgedExport = source.exportData();
    source.close();

    const reopened = createRepository(forgedSourcePath, engine);
    expect(() => reopened.loadGame(mainKey(created.state))).toThrow(PersistenceCorruptionError);
    expect(() => reopened.replayToTerminal(mainKey(created.state))).toThrow(
      PersistenceCorruptionError,
    );
    expect(() => reopened.loadLatestResumableGame("learner-1")).toThrow(PersistenceCorruptionError);
    reopened.close();

    const target = createRepository(createDatabasePath(), engine);
    target.ensureLearner("target-existing");
    const before = target.exportData().data;
    expect(() => target.importData(forgedExport, { mode: "replace" })).toThrow(
      PersistenceValidationError,
    );
    expect(target.exportData().data).toEqual(before);
    target.close();
  });

  it("requires exact immutable bot mappings and rejects tampered session metadata", () => {
    const engine = createEngine();
    const localeSensitive = engine.create({
      type: "create_game",
      requestId: "create:locale-sensitive-player-ids",
      branchId: "main",
      seed: "locale-sensitive-player-ids",
      mode: "guided",
      matchLength: "one_wind",
      rules: toCoreGameRules(getBundledRuleset("training_relaxed_v1")),
      players: [
        { id: "human", displayName: "Human", controller: "human", seat: "east" },
        { id: "B", displayName: "B", controller: "bot", seat: "south" },
        { id: "a", displayName: "A", controller: "bot", seat: "west" },
        { id: "z", displayName: "Z", controller: "bot", seat: "north" },
      ],
    });
    if (!localeSensitive.accepted) {
      throw new Error(localeSensitive.error.message);
    }
    const localeSource = createRepository(createDatabasePath(), engine);
    expect(
      localeSource.appendAcceptedCommand({
        key: mainKey(localeSensitive.state),
        requestId: localeSensitive.events[0]?.requestId ?? "missing-create-request",
        events: localeSensitive.events,
        state: localeSensitive.state,
        learnerId: "learner-1",
        rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
        sessionConfiguration: {
          ...sessionConfiguration,
          bots: [
            { playerId: "a", difficulty: "basic", personality: "fast" },
            { playerId: "z", difficulty: "intermediate", personality: "value" },
            { playerId: "B", difficulty: "advanced", personality: "balanced" },
          ],
        },
      }),
    ).toMatchObject({ disposition: "appended" });
    localeSource.close();

    const created = createGame(engine, "session-configuration-integrity");
    const invalidSource = createRepository(createDatabasePath(), engine);
    expect(() =>
      invalidSource.appendAcceptedCommand({
        key: mainKey(created.state),
        requestId: created.events[0]?.requestId ?? "missing-create-request",
        events: created.events,
        state: created.state,
        learnerId: "learner-1",
        rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
        sessionConfiguration: {
          ...sessionConfiguration,
          bots: sessionConfiguration.bots.filter(({ playerId }) => playerId !== "north"),
        },
      }),
    ).toThrow(PersistenceValidationError);
    expect(invalidSource.exportData().data.games).toEqual([]);
    invalidSource.close();

    const adaptiveSource = createRepository(createDatabasePath(), engine);
    expect(() =>
      adaptiveSource.appendAcceptedCommand({
        key: mainKey(created.state),
        requestId: created.events[0]?.requestId ?? "missing-create-request",
        events: created.events,
        state: created.state,
        learnerId: "learner-1",
        rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
        sessionConfiguration: {
          ...sessionConfiguration,
          bots: sessionConfiguration.bots.map((bot, index) =>
            index === 0 ? { ...bot, difficulty: "adaptive" as never } : bot,
          ),
        },
      }),
    ).toThrow(PersistenceValidationError);
    expect(adaptiveSource.exportData().data.games).toEqual([]);
    adaptiveSource.close();

    const source = createRepository(createDatabasePath(), engine);
    appendCreation(source, created);
    const exported = source.exportData();
    source.close();
    const tampered = {
      ...exported,
      data: {
        ...exported.data,
        games: exported.data.games.map((game) => ({
          ...game,
          sessionConfiguration:
            game.sessionConfiguration === null
              ? null
              : {
                  ...game.sessionConfiguration,
                  coach: {
                    ...game.sessionConfiguration.coach,
                    verbosity: "detailed" as const,
                  },
                },
        })),
      },
    };
    const target = createRepository(createDatabasePath(), engine);
    expect(() => target.importData(tampered, { mode: "replace" })).toThrow(
      PersistenceValidationError,
    );
    expect(target.exportData().data.games).toEqual([]);
    target.close();
  });
});
