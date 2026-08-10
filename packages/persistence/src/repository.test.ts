import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGameEngine,
  type CreateEngineResult,
  type GameEngine,
  type GameMode,
  type GameState,
  type LegalAction,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";

import { PersistenceValidationError } from "./errors.js";
import { SqlitePersistenceRepository } from "./repository.js";
import type { GameKey } from "./types.js";

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

const createEngine = (): GameEngine => {
  const ruleset = getBundledRuleset("training_relaxed_v1");
  return createGameEngine({ scoringSystem: createHongKongScoringSystem(ruleset) });
};

const createGame = (
  engine: GameEngine,
  seed: string,
  mode: GameMode = "guided",
): Extract<CreateEngineResult, { accepted: true }> => {
  const result = engine.create({
    type: "create_game",
    requestId: `create:${seed}`,
    branchId: "main",
    seed,
    mode,
    matchLength: "one_wind",
    rules: toCoreGameRules(getBundledRuleset("training_relaxed_v1")),
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

const createRepository = (databasePath: string, engine: GameEngine): SqlitePersistenceRepository =>
  new SqlitePersistenceRepository({
    databasePath,
    reducer: (state, event) => engine.reduce(state, event),
    snapshotEveryEvents: 1,
    clock: () => "2026-08-02T12:00:00.000Z",
  });

const mainKey = (state: GameState): GameKey => ({
  gameId: state.gameId,
  branchId: state.branchId,
});

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

describe("SQLite persistence repository", () => {
  it("resumes an exact state after close/reopen and makes request IDs idempotent", () => {
    const databasePath = createDatabasePath();
    const engine = createEngine();
    const created = createGame(engine, "persistence-resume");
    const repository = createRepository(databasePath, engine);
    const key = appendCreation(repository, created);

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
    expect(reopened.replayToTerminal(key).state).toEqual(result.state);
    reopened.close();
  });

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

  it("exports/imports immutable practice branches without changing the parent stream", () => {
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
    repository.saveDrillItem({
      id: "drill:reset",
      learnerId: "learner-1",
      source: "generated",
      conceptIds: ["tile_efficiency"],
      difficulty: 0.5,
      data: { prompt: "discard" },
    });

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

    repository.deleteAllData();
    expect(repository.exportData().data.learners).toEqual([]);
    expect(repository.exportData().data.learnerPreferences).toEqual([]);
    repository.close();
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
    expect(repository.loadGame(key).state.stateHash).toBe(created.state.stateHash);
    repository.close();
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
});
