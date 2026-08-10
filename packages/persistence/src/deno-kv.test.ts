import { describe, expect, it } from "vitest";
import { createGameEngine, type GameEngine } from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  resolveRuleset,
  toCoreGameRules,
} from "@hk-mahjong/hk-rules";
import {
  DenoKvCommitNotifier,
  DenoKvPersistenceRepository,
  type DenoKvAtomicOperation,
  type DenoKvEntry,
  type DenoKvLike,
} from "./deno-kv.js";
import type { AppendAcceptedCommandInput } from "./types.js";
import type { GameKey } from "./types.js";

interface MemoryRecord {
  readonly key: readonly unknown[];
  readonly value: unknown;
  readonly versionstamp: string;
}

class MemoryKv implements DenoKvLike {
  private readonly records = new Map<string, MemoryRecord>();
  private nextVersion = 1;

  public get<T>(key: readonly unknown[]): Promise<DenoKvEntry<T>> {
    const record = this.records.get(JSON.stringify(key));
    return Promise.resolve({
      key,
      value: record === undefined ? null : (structuredClone(record.value) as T),
      versionstamp: record?.versionstamp ?? null,
    });
  }

  public async *list<T>(selector: {
    readonly prefix: readonly unknown[];
  }): AsyncIterable<DenoKvEntry<T>> {
    await Promise.resolve();
    const prefix = JSON.stringify(selector.prefix).slice(0, -1);
    for (const record of this.records.values()) {
      if (!JSON.stringify(record.key).startsWith(prefix)) {
        continue;
      }
      yield {
        key: record.key,
        value: structuredClone(record.value) as T,
        versionstamp: record.versionstamp,
      };
    }
  }

  public atomic(): DenoKvAtomicOperation {
    const checks: { key: readonly unknown[]; versionstamp: string | null }[] = [];
    const writes: { type: "set" | "delete"; key: readonly unknown[]; value?: unknown }[] = [];
    const operation: DenoKvAtomicOperation = {
      check: (check) => {
        checks.push(check);
        return operation;
      },
      set: (key, value) => {
        writes.push({ type: "set", key, value });
        return operation;
      },
      delete: (key) => {
        writes.push({ type: "delete", key });
        return operation;
      },
      commit: () => {
        const result = (() => {
          for (const check of checks) {
            const current = this.records.get(JSON.stringify(check.key));
            if ((current?.versionstamp ?? null) !== check.versionstamp) {
              return { ok: false };
            }
          }
          for (const write of writes) {
            const key = JSON.stringify(write.key);
            if (write.type === "delete") {
              this.records.delete(key);
              continue;
            }
            this.records.set(key, {
              key: write.key,
              value: structuredClone(write.value),
              versionstamp: String(this.nextVersion++),
            });
          }
          return { ok: true };
        })();
        return Promise.resolve(result);
      },
    };
    return operation;
  }

  public close(): void {
    // The test double models a durable KV handle; closing one repository must not erase data.
  }
}

const createFixture = (
  mode: "competitive" | "sandbox" = "competitive",
): {
  readonly engine: GameEngine;
  readonly input: AppendAcceptedCommandInput;
  readonly key: GameKey;
} => {
  const ruleset = getBundledRuleset("training_relaxed_v1");
  const engine = createGameEngine({ scoringSystem: createHongKongScoringSystem(ruleset) });
  const result = engine.create({
    type: "create_game",
    requestId: "create:deno-kv",
    branchId: "main",
    seed: "deno-kv-seed",
    mode,
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
  const key = { gameId: result.state.gameId, branchId: "main" };
  return {
    engine,
    key,
    input: {
      key,
      requestId: "create:deno-kv",
      events: result.events,
      state: result.state,
      rulesetDefinition: ruleset.definition,
      sessionConfiguration: {
        schemaVersion: 1,
        bots: [
          { playerId: "south", difficulty: "basic", personality: "balanced" },
          { playerId: "west", difficulty: "basic", personality: "balanced" },
          { playerId: "north", difficulty: "basic", personality: "balanced" },
        ],
        coach: { enabled: false, provider: "templates", verbosity: "normal" },
      },
      commitNotification: {
        notificationId: `${result.state.gameId}:main:create:deno-kv`,
        action: null,
      },
    },
  };
};

describe("Deno KV persistence adapter", () => {
  it("commits, reloads, replays, and idempotently retries a game journal", async () => {
    const kv = new MemoryKv();
    const fixture = createFixture();
    const notificationPrefix = ["test", "multiplayer", "commit"] as const;
    const makeRepository = (): DenoKvPersistenceRepository =>
      new DenoKvPersistenceRepository({
        kv,
        reducer: (state, event) => fixture.engine.reduce(state, event),
        validateRulesetDefinition: (definition) => {
          const resolved = resolveRuleset(definition);
          return { definition: resolved.definition, hash: resolved.hash };
        },
        commitNotificationPrefix: notificationPrefix,
      });
    const repository = makeRepository();
    const appended = await repository.appendAcceptedCommand(fixture.input);
    expect(appended.disposition).toBe("appended");
    const notifier = new DenoKvCommitNotifier(kv, notificationPrefix);
    const notifications = await notifier.list(fixture.key.gameId, fixture.key.branchId);
    expect(notifications).toMatchObject([
      {
        notificationId: `${fixture.key.gameId}:main:create:deno-kv`,
        fromRevision: 1,
        toRevision: fixture.input.state.revision,
        action: null,
      },
    ]);
    const notification = notifications[0];
    if (notification === undefined) {
      throw new Error("Expected the atomic commit notification");
    }
    await expect(notifier.publish(notification)).resolves.toBeUndefined();
    await expect(
      notifier.publish({ ...notification, eventChainHash: "sha256:conflicting-notification" }),
    ).rejects.toThrow(/already recorded differently/u);
    const loadedAtFirstRevision = await repository.loadGameAtRevision(fixture.key, 1);
    expect(loadedAtFirstRevision.state.revision).toBe(1);
    const loaded = await repository.loadGame(fixture.key);
    expect(loaded.state.stateHash).toBe(fixture.input.state.stateHash);
    expect((await repository.replayToTerminal(fixture.key)).state.stateHash).toBe(
      fixture.input.state.stateHash,
    );
    expect((await repository.appendAcceptedCommand(fixture.input)).disposition).toBe("idempotent");
    repository.close();

    const resumed = makeRepository();
    expect((await resumed.loadGame(fixture.key)).state.stateHash).toBe(
      fixture.input.state.stateHash,
    );
    resumed.close();
  });

  it("creates practice branches only from a core-produced marker and replays them after restart", async () => {
    const kv = new MemoryKv();
    const fixture = createFixture("sandbox");
    const makeRepository = (): DenoKvPersistenceRepository =>
      new DenoKvPersistenceRepository({
        kv,
        reducer: (state, event) => fixture.engine.reduce(state, event),
        validateRulesetDefinition: (definition) => {
          const resolved = resolveRuleset(definition);
          return { definition: resolved.definition, hash: resolved.hash };
        },
      });
    const repository = makeRepository();
    await repository.appendAcceptedCommand(fixture.input);
    const branchDecision = fixture.engine.decide(fixture.input.state, {
      type: "create_practice_branch",
      gameId: fixture.key.gameId,
      branchId: "practice:marker",
      parentBranchId: fixture.key.branchId,
      playerId: "east",
      expectedRevision: fixture.input.state.revision,
      requestId: "branch:marker",
      originDecisionId: "decision:marker",
    });
    if (!branchDecision.accepted) {
      throw new Error(branchDecision.error.message);
    }
    const marker = branchDecision.events[0];
    if (marker?.type !== "practice_branch_created") {
      throw new Error("Expected the core to emit a practice branch marker");
    }
    await expect(
      repository.forkPracticeBranch({
        parent: fixture.key,
        event: marker,
        state: branchDecision.state,
      }),
    ).rejects.toThrow(/origin decision/u);
    await repository.saveDecisionProvenance({
      decisionId: "decision:marker",
      key: fixture.key,
      learnerId: null,
      handId: fixture.input.state.hand.id,
      revision: fixture.input.state.revision,
      playerId: "east",
      createdAt: "2026-08-06T00:00:00.000Z",
    });
    const created = await repository.forkPracticeBranch({
      parent: fixture.key,
      event: marker,
      state: branchDecision.state,
    });
    expect(created.disposition).toBe("created");
    expect(created.branch.practice).toBe(true);
    expect(created.branch.currentRevision).toBe(branchDecision.state.revision);
    expect(
      (
        await repository.forkPracticeBranch({
          parent: fixture.key,
          event: marker,
          state: branchDecision.state,
        })
      ).disposition,
    ).toBe("idempotent");
    repository.close();

    const resumed = makeRepository();
    const child = await resumed.loadGame({
      gameId: fixture.key.gameId,
      branchId: "practice:marker",
    });
    expect(child.state.stateHash).toBe(branchDecision.state.stateHash);
    expect((await resumed.replayToTerminal(child.key)).state.stateHash).toBe(
      branchDecision.state.stateHash,
    );
    await expect(
      resumed.forkPracticeBranch({
        parent: fixture.key,
        event: { ...marker, originDecisionBranchId: "other" },
        state: branchDecision.state,
      }),
    ).rejects.toThrow(/permitted parent/u);
    resumed.close();
  });
});
