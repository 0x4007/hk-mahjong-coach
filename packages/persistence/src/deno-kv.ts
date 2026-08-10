import {
  canonicalJson,
  canonicalJsonHash,
  reduceGameEvent,
  type GameEvent,
  type GameEngine,
  type GameState,
  type PracticeBranchCreatedEvent,
} from "@hk-mahjong/core";

import {
  PersistenceConflictError,
  PersistenceCorruptionError,
  PersistenceNotFoundError,
  PersistenceValidationError,
} from "./errors.js";
import type {
  AppendAcceptedCommandInput,
  AppendAcceptedCommandResult,
  CommandReceipt,
  CommitNotificationInput,
  ForkPracticeBranchInput,
  ForkPracticeBranchResult,
  GameBranchMetadata,
  GameKey,
  GameMetadata,
  GameSessionConfigurationV1,
  LoadedGame,
  ReplayResult,
  StoredGameEvent,
} from "./types.js";

/** Deno KV rejects values at 64 KiB; oversized snapshots remain recoverable from the journal. */
const MAX_SNAPSHOT_BYTES = 60 * 1024;

/** Minimal Deno KV surface. Keeping this structural avoids importing Deno globals in Node builds. */
export interface DenoKvEntry<T> {
  readonly key: readonly unknown[];
  readonly value: T | null;
  readonly versionstamp: string | null;
}

export interface DenoKvAtomicOperation {
  check(check: { readonly key: readonly unknown[]; readonly versionstamp: string | null }): this;
  set(key: readonly unknown[], value: unknown): this;
  delete(key: readonly unknown[]): this;
  commit(): Promise<{ readonly ok: boolean }>;
}

export interface DenoKvLike {
  get<T>(key: readonly unknown[]): Promise<DenoKvEntry<T>>;
  list<T>(selector: { readonly prefix: readonly unknown[] }): AsyncIterable<DenoKvEntry<T>>;
  atomic(): DenoKvAtomicOperation;
  close(): void;
}

/** Opens the platform KV database without importing Deno's globals into the Node bundle. */
export const openDenoKv = async (): Promise<DenoKvLike> => {
  const runtime = (
    globalThis as unknown as {
      Deno?: { readonly openKv?: () => Promise<DenoKvLike> };
    }
  ).Deno;
  if (runtime?.openKv === undefined) {
    throw new Error("Deno.openKv is only available in the Deno runtime");
  }
  return runtime.openKv();
};

export interface DenoKvPersistenceOptions {
  readonly kv: DenoKvLike;
  readonly reducer?: GameEngine["reduce"];
  readonly validateRulesetDefinition: (definition: unknown) => {
    readonly definition: unknown;
    readonly hash: string;
  };
  readonly clock?: () => string;
  /** Key prefix shared with the commit notifier used by the owning service. */
  readonly commitNotificationPrefix?: readonly unknown[];
}

/** Minimal decision identity retained so practice forks cannot bypass learner provenance. */
export interface DenoKvDecisionProvenance {
  readonly decisionId: string;
  readonly key: GameKey;
  readonly learnerId: string | null;
  readonly handId: string;
  readonly revision: number;
  readonly playerId: string;
  readonly createdAt: string;
}

export interface AsyncGamePersistenceRepository {
  close(): void;
  appendAcceptedCommand(input: AppendAcceptedCommandInput): Promise<AppendAcceptedCommandResult>;
  getCommandReceipt(key: GameKey, requestId: string): Promise<CommandReceipt | null>;
  loadGame(key: GameKey): Promise<LoadedGame>;
  loadGameAtRevision(key: GameKey, revision: number): Promise<LoadedGame>;
  replayToTerminal(key: GameKey): Promise<ReplayResult>;
  forkPracticeBranch(input: ForkPracticeBranchInput): Promise<ForkPracticeBranchResult>;
  listEvents(
    key: GameKey,
    fromRevision?: number,
    toRevision?: number,
  ): Promise<readonly StoredGameEvent[]>;
}

type KvBranch = GameBranchMetadata;
type KvReceipt = CommandReceipt;

export const DEFAULT_COMMIT_NOTIFICATION_PREFIX = ["multiplayer", "commit"] as const;

interface CommitNotification {
  readonly schemaVersion: 1;
  readonly notificationId: string;
  readonly gameId: string;
  readonly branchId: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly eventChainHash: string;
  /** Accepted action identity used to deliver the submitting player's receipt across instances. */
  readonly action: CommitActionMetadata | null;
}

export interface CommitActionMetadata {
  readonly requestId: string;
  readonly playerId: string;
  readonly actionId: string;
  readonly source: "human" | "bot" | "timeout_fallback";
  readonly fallback: {
    readonly source: "timeout_fallback";
    readonly reason: "action_timeout" | "disconnect_timeout";
    readonly deadline: string;
    readonly appliedAt: string;
  } | null;
}

export type DenoKvCommitNotificationInput = CommitNotificationInput;

const gameMetadataKey = (gameId: string): readonly unknown[] => ["game", gameId, "metadata"];
const branchMetadataKey = (key: GameKey): readonly unknown[] => [
  "game",
  key.gameId,
  "branch",
  key.branchId,
  "metadata",
];
const eventKey = (key: GameKey, revision: number): readonly unknown[] => [
  "game",
  key.gameId,
  "branch",
  key.branchId,
  "event",
  revision,
];
const snapshotKey = (key: GameKey, revision: number): readonly unknown[] => [
  "game",
  key.gameId,
  "branch",
  key.branchId,
  "snapshot",
  revision,
];
const requestKey = (key: GameKey, requestId: string): readonly unknown[] => [
  "game",
  key.gameId,
  "branch",
  key.branchId,
  "request",
  requestId,
];
const decisionKey = (key: GameKey, decisionId: string): readonly unknown[] => [
  "game",
  key.gameId,
  "branch",
  key.branchId,
  "decision",
  decisionId,
];
const commitNotificationKey = (
  prefix: readonly unknown[],
  gameId: string,
  branchId: string,
  notificationId: string,
): readonly unknown[] => [...prefix, gameId, branchId, notificationId];

const persistenceHash = (value: unknown): string => `sha256:${canonicalJsonHash(value)}`;
const rootChainHash = (gameId: string): string =>
  persistenceHash({
    kind: "hk-mahjong-persistence-event-chain",
    version: 1,
    gameId,
    branchId: "main",
    revision: 0,
  });
const nextChainHash = (
  key: GameKey,
  previousChainHash: string,
  revision: number,
  eventHash: string,
  stateHash: string,
): string =>
  persistenceHash({
    kind: "hk-mahjong-persistence-event-chain",
    version: 1,
    gameId: key.gameId,
    branchId: key.branchId,
    previousChainHash,
    revision,
    eventHash,
    stateHash,
  });
const commandHash = (requestId: string, events: readonly GameEvent[], stateHash: string): string =>
  persistenceHash({
    kind: "hk-mahjong-persistence-command",
    version: 1,
    requestId,
    events,
    stateHash,
  });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cloneObject = <T>(value: T, label: string): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (caught) {
    throw new PersistenceValidationError(
      `${label} is not JSON serializable: ${caught instanceof Error ? caught.message : "invalid value"}`,
    );
  }
};

const jsonByteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const requireGameKey = (key: GameKey): void => {
  if (!isObject(key) || typeof key.gameId !== "string" || typeof key.branchId !== "string") {
    throw new PersistenceValidationError("A game key must contain gameId and branchId");
  }
  if (key.gameId.trim().length === 0 || key.branchId.trim().length === 0) {
    throw new PersistenceValidationError("A game key must contain non-empty identifiers");
  }
};

const requireRevision = (revision: number, label: string): void => {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new PersistenceValidationError(`${label} must be a positive safe integer`);
  }
};

const eventFromEntry = (entry: DenoKvEntry<StoredGameEvent>, key: GameKey): StoredGameEvent => {
  const stored = entry.value;
  const entryRevision = entry.key.at(-1);
  if (stored === null) {
    throw new PersistenceCorruptionError(
      `Missing event at ${key.gameId}/${key.branchId}/${String(entryRevision)}`,
    );
  }
  if (
    stored.key.gameId !== key.gameId ||
    stored.key.branchId !== key.branchId ||
    stored.revision !== entryRevision ||
    stored.requestId !== stored.event.requestId ||
    stored.event.gameId !== key.gameId ||
    stored.event.branchId !== key.branchId ||
    stored.event.revision !== stored.revision ||
    stored.event.id !== `event:${key.gameId}:${key.branchId}:${String(stored.revision)}` ||
    stored.eventHash !== persistenceHash(stored.event)
  ) {
    throw new PersistenceCorruptionError("Deno KV event identity or hash is corrupt");
  }
  return stored;
};

const stateCacheKey = (key: GameKey): string => `${key.gameId}\u0000${key.branchId}`;

interface CachedGameState {
  readonly revision: number;
  readonly stateHash: string;
  readonly eventChainHash: string;
  readonly state: GameState;
}

/**
 * Deno KV implementation of the authoritative game journal. It intentionally exposes the
 * asynchronous game subset used by a Deno request handler; learner/coach records remain owned by
 * the existing local repository until their async boundary is introduced.
 */
export class DenoKvPersistenceRepository implements AsyncGamePersistenceRepository {
  private readonly reducer: GameEngine["reduce"];
  private readonly validateRulesetDefinition: DenoKvPersistenceOptions["validateRulesetDefinition"];
  private readonly clock: () => string;
  private readonly commitNotificationPrefix: readonly unknown[];
  /** A durable branch metadata check gates this cache; it is never used as authority. */
  private readonly stateCache = new Map<string, CachedGameState>();

  public constructor(private readonly options: DenoKvPersistenceOptions) {
    this.reducer = options.reducer ?? reduceGameEvent;
    this.validateRulesetDefinition = options.validateRulesetDefinition;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.commitNotificationPrefix = [
      ...(options.commitNotificationPrefix ?? DEFAULT_COMMIT_NOTIFICATION_PREFIX),
    ];
  }

  public close(): void {
    this.options.kv.close();
  }

  public async getCommandReceipt(key: GameKey, requestId: string): Promise<CommandReceipt | null> {
    requireGameKey(key);
    if (requestId.trim().length === 0) {
      throw new PersistenceValidationError("Command receipt request ID must not be empty");
    }
    const entry = await this.options.kv.get<KvReceipt>(requestKey(key, requestId));
    return entry.value === null ? null : { ...entry.value };
  }

  /** Reads the compare-and-set branch metadata without replaying the event journal. */
  public async getBranchMetadata(key: GameKey): Promise<GameBranchMetadata> {
    requireGameKey(key);
    const entry = await this.options.kv.get<KvBranch>(branchMetadataKey(key));
    return cloneObject(this.requireBranch(entry.value, key), "Branch metadata");
  }

  public async getDecisionProvenance(
    key: GameKey,
    decisionId: string,
  ): Promise<DenoKvDecisionProvenance | null> {
    requireGameKey(key);
    if (decisionId.trim().length === 0) {
      throw new PersistenceValidationError("Decision ID must not be empty");
    }
    const entry = await this.options.kv.get<DenoKvDecisionProvenance>(decisionKey(key, decisionId));
    return entry.value === null ? null : cloneObject(entry.value, "Decision provenance");
  }

  public async saveDecisionProvenance(record: DenoKvDecisionProvenance): Promise<void> {
    requireGameKey(record.key);
    if (
      record.decisionId.trim().length === 0 ||
      record.handId.trim().length === 0 ||
      record.playerId.trim().length === 0 ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 1 ||
      (record.learnerId !== null && record.learnerId.trim().length === 0) ||
      record.createdAt.trim().length === 0
    ) {
      throw new PersistenceValidationError("Decision provenance is invalid");
    }
    const key = decisionKey(record.key, record.decisionId);
    const existing = await this.options.kv.get<DenoKvDecisionProvenance>(key);
    if (existing.value !== null) {
      if (canonicalJson(existing.value) !== canonicalJson(record)) {
        throw new PersistenceConflictError("Decision ID was already recorded with different data");
      }
      return;
    }
    const committed = await this.options.kv
      .atomic()
      .check({ key, versionstamp: null })
      .set(key, cloneObject(record, "Decision provenance"))
      .commit();
    if (!committed.ok) {
      const retry = await this.options.kv.get<DenoKvDecisionProvenance>(key);
      if (retry.value === null || canonicalJson(retry.value) !== canonicalJson(record)) {
        throw new PersistenceConflictError("Decision provenance compare-and-set failed");
      }
    }
  }

  public async loadGame(key: GameKey): Promise<LoadedGame> {
    const branchEntry = await this.options.kv.get<KvBranch>(branchMetadataKey(key));
    const branch = this.requireBranch(branchEntry.value, key);
    return this.loadGameAtRevision(key, branch.currentRevision);
  }

  public async loadGameAtRevision(key: GameKey, revision: number): Promise<LoadedGame> {
    requireGameKey(key);
    requireRevision(revision, "Load revision");
    const branchEntry = await this.options.kv.get<KvBranch>(branchMetadataKey(key));
    const branch = this.requireBranch(branchEntry.value, key);
    if (revision > branch.currentRevision || revision < Math.max(1, branch.forkRevision)) {
      throw new PersistenceValidationError("Requested revision is outside the branch history");
    }
    const gameEntry = await this.options.kv.get<GameMetadata>(gameMetadataKey(key.gameId));
    if (gameEntry.value === null) {
      throw new PersistenceCorruptionError("Game metadata is missing from Deno KV");
    }
    const cached = this.stateCache.get(stateCacheKey(key));
    const cachedState =
      cached?.revision === revision &&
      (revision !== branch.currentRevision ||
        (cached.stateHash === branch.stateHash && cached.eventChainHash === branch.eventChainHash))
        ? cached.state
        : null;
    const state =
      cachedState === null
        ? (await this.reconstruct(key, revision, branch)).state
        : cloneObject(cachedState, "Cached game state");
    if (revision === branch.currentRevision) {
      this.stateCache.set(stateCacheKey(key), {
        revision,
        stateHash: state.stateHash,
        eventChainHash: branch.eventChainHash,
        state: cloneObject(state, "Game state cache"),
      });
    }
    return {
      key: { ...key },
      game: cloneObject(gameEntry.value, "Game metadata"),
      branch: cloneObject(branch, "Branch metadata"),
      state,
      recovery: { usedSnapshotRevision: null, skippedCorruptSnapshotRevisions: [] },
    };
  }

  public async replayToTerminal(key: GameKey): Promise<ReplayResult> {
    const loaded = await this.loadGame(key);
    const events = await this.eventsThrough(key, loaded.branch.currentRevision);
    const { state } = await this.reconstruct(key, loaded.branch.currentRevision, loaded.branch);
    return { key: { ...key }, state, eventCount: events.length };
  }

  /**
   * Creates a practice branch only from the marker emitted by the pure core engine. The Deno KV
   * adapter stores the minimal decision identity needed for the same provenance checks as the
   * SQLite repository. Analysis facts and other learner records remain outside this async boundary.
   */
  public async forkPracticeBranch(
    input: ForkPracticeBranchInput,
  ): Promise<ForkPracticeBranchResult> {
    requireGameKey(input.parent);
    const event = input.event;
    const child: GameKey = { gameId: event.gameId, branchId: event.branchId };
    requireGameKey(child);
    const parent = await this.loadGameAtRevision(input.parent, event.parentRevision);
    await this.validatePracticeMarker(input.parent, event, parent);
    let reduced: GameState;
    try {
      reduced = this.reducer(parent.state, event);
    } catch (caught) {
      throw new PersistenceValidationError(
        `Practice branch cannot be created: ${caught instanceof Error ? caught.message : "reducer rejected event"}`,
      );
    }
    if (canonicalJson(reduced) !== canonicalJson(input.state)) {
      throw new PersistenceConflictError(
        "Practice branch state does not exactly match the core-produced marker state",
      );
    }
    const result = await this.appendAcceptedCommand({
      key: child,
      requestId: event.requestId,
      events: [event],
      state: input.state,
    });
    const branch = (await this.loadGame(child)).branch;
    return {
      branch,
      disposition: result.disposition === "appended" ? "created" : "idempotent",
    };
  }

  public async listEvents(
    key: GameKey,
    fromRevision = 0,
    toRevision?: number,
  ): Promise<readonly StoredGameEvent[]> {
    requireGameKey(key);
    if (!Number.isSafeInteger(fromRevision) || fromRevision < 0) {
      throw new PersistenceValidationError(
        "Event list start revision must be a non-negative safe integer",
      );
    }
    const branchEntry = await this.options.kv.get<KvBranch>(branchMetadataKey(key));
    const branch = this.requireBranch(branchEntry.value, key);
    const end = toRevision ?? branch.currentRevision;
    if (!Number.isSafeInteger(end) || end < fromRevision || end > branch.currentRevision) {
      throw new PersistenceValidationError(
        "Event list revision range is outside the branch history",
      );
    }
    const events = await this.eventsThrough(key, end);
    return events.filter(({ revision }) => revision > fromRevision);
  }

  public async appendAcceptedCommand(
    input: AppendAcceptedCommandInput,
  ): Promise<AppendAcceptedCommandResult> {
    requireGameKey(input.key);
    if (input.events.length === 0 || input.requestId.trim().length === 0) {
      throw new PersistenceValidationError(
        "An accepted Deno KV command needs events and a request ID",
      );
    }
    const branchEntry = await this.options.kv.get<KvBranch>(branchMetadataKey(input.key));
    const existingBranch = branchEntry.value;
    const initializing = existingBranch === null;
    if (initializing) {
      const firstEvent = input.events[0];
      if (
        (input.key.branchId === "main" && firstEvent?.type !== "game_created") ||
        (input.key.branchId !== "main" && firstEvent?.type !== "practice_branch_created")
      ) {
        throw new PersistenceValidationError(
          "A new Deno KV branch must begin with game_created or practice_branch_created",
        );
      }
    }
    const receiptKeyValue = requestKey(input.key, input.requestId);
    const existingReceiptEntry = await this.options.kv.get<KvReceipt>(receiptKeyValue);
    const hash = commandHash(input.requestId, input.events, input.state.stateHash);
    if (existingReceiptEntry.value !== null) {
      if (existingReceiptEntry.value.commandHash !== hash) {
        throw new PersistenceConflictError(
          "Request ID was already accepted with a different command",
        );
      }
      return {
        key: { ...input.key },
        disposition: "idempotent",
        startRevision: existingReceiptEntry.value.startRevision,
        endRevision: existingReceiptEntry.value.endRevision,
        stateHash: existingReceiptEntry.value.stateHash,
      };
    }

    let currentState: GameState | undefined;
    let previousChainHash: string;
    let currentRevision = 0;
    let parentKey: GameKey | null = null;
    let forkRevision = 0;
    let forkStateHash: string | null = null;
    let forkEventChainHash = "";
    if (existingBranch === null) {
      const firstEvent = input.events[0];
      if (firstEvent?.type === "game_created") {
        previousChainHash = rootChainHash(input.key.gameId);
      } else if (firstEvent?.type === "practice_branch_created") {
        parentKey = { gameId: firstEvent.gameId, branchId: firstEvent.parentBranchId };
        const parentEntry = await this.options.kv.get<KvBranch>(branchMetadataKey(parentKey));
        const parent = this.requireBranch(parentEntry.value, parentKey);
        if (
          firstEvent.branchId !== input.key.branchId ||
          firstEvent.parentRevision < Math.max(1, parent.forkRevision) ||
          firstEvent.parentRevision > parent.currentRevision ||
          firstEvent.revision !== firstEvent.parentRevision + 1
        ) {
          throw new PersistenceValidationError(
            "Practice branch marker is outside the parent history",
          );
        }
        const parentLoaded = await this.loadGameAtRevision(parentKey, firstEvent.parentRevision);
        await this.validatePracticeMarker(parentKey, firstEvent, parentLoaded);
        const parentEvents = await this.eventsThrough(parentKey, firstEvent.parentRevision);
        const parentCheckpoint = parentEvents.at(-1);
        if (
          parentLoaded.state.stateHash !== firstEvent.parentStateHash ||
          parentLoaded.state.lastEventId !== firstEvent.parentEventId ||
          parentCheckpoint === undefined
        ) {
          throw new PersistenceValidationError(
            "Practice branch marker does not match its parent checkpoint",
          );
        }
        currentState = parentLoaded.state;
        currentRevision = firstEvent.parentRevision;
        previousChainHash = parentCheckpoint.eventChainHash;
        forkRevision = firstEvent.parentRevision;
        forkStateHash = firstEvent.parentStateHash;
        forkEventChainHash = parentCheckpoint.eventChainHash;
      } else {
        throw new PersistenceValidationError(
          "Only game_created or practice_branch_created can initialize a branch",
        );
      }
    } else {
      currentRevision = existingBranch.currentRevision;
      previousChainHash = existingBranch.eventChainHash;
      parentKey = existingBranch.parentKey;
      forkRevision = existingBranch.forkRevision;
      forkStateHash = existingBranch.forkStateHash;
      forkEventChainHash = existingBranch.forkEventChainHash;
      if (currentRevision > 0) {
        const cached = this.stateCache.get(stateCacheKey(input.key));
        const cachedState =
          cached?.revision === currentRevision &&
          cached.stateHash === existingBranch.stateHash &&
          cached.eventChainHash === existingBranch.eventChainHash
            ? cached.state
            : null;
        currentState =
          cachedState === null
            ? (await this.reconstruct(input.key, currentRevision, existingBranch)).state
            : cloneObject(cachedState, "Cached game state");
      }
    }
    if (existingBranch === null && parentKey === null) {
      forkEventChainHash = previousChainHash;
    }
    const startRevision = currentRevision + 1;
    const storedEvents: StoredGameEvent[] = [];
    const snapshots: {
      readonly revision: number;
      readonly state: GameState;
      readonly stateHash: string;
      readonly eventChainHash: string;
    }[] = [];
    let reduced = currentState;
    for (const [index, event] of input.events.entries()) {
      const revision = startRevision + index;
      if (
        event.revision !== revision ||
        event.id !== `event:${input.key.gameId}:${input.key.branchId}:${String(revision)}` ||
        event.gameId !== input.key.gameId ||
        event.branchId !== input.key.branchId ||
        event.requestId !== input.requestId
      ) {
        throw new PersistenceValidationError(
          "Deno KV command events have invalid identity or revision",
        );
      }
      try {
        reduced = this.reducer(reduced, event);
      } catch (caught) {
        throw new PersistenceValidationError(
          `Accepted command cannot be replayed: ${caught instanceof Error ? caught.message : "reducer rejected event"}`,
        );
      }
      const state = reduced;
      const eventHash = persistenceHash(event);
      const eventChainHash = nextChainHash(
        input.key,
        previousChainHash,
        revision,
        eventHash,
        state.stateHash,
      );
      storedEvents.push({
        key: { ...input.key },
        revision,
        requestId: input.requestId,
        event: cloneObject(event, "Game event"),
        eventHash,
        stateHash: state.stateHash,
        eventChainHash,
        createdAt: this.clock(),
      });
      snapshots.push({
        revision,
        state,
        stateHash: state.stateHash,
        eventChainHash,
      });
      previousChainHash = eventChainHash;
    }
    const finalState = reduced;
    if (finalState === undefined || canonicalJson(finalState) !== canonicalJson(input.state)) {
      throw new PersistenceConflictError("Accepted command state differs from the reducer state");
    }
    const createdAt = this.clock();
    const finalRevision = finalState.revision;
    const branch: KvBranch = {
      key: { ...input.key },
      parentKey,
      forkRevision,
      forkStateHash,
      forkEventChainHash,
      practice: existingBranch?.practice ?? parentKey !== null,
      createdAt: existingBranch?.createdAt ?? createdAt,
      activityOrder: finalRevision,
      currentRevision: finalRevision,
      stateHash: finalState.stateHash,
      eventChainHash: previousChainHash,
    };
    const receipt: KvReceipt = {
      key: { ...input.key },
      resultKey: { ...input.key },
      requestId: input.requestId,
      commandHash: hash,
      startRevision,
      endRevision: finalRevision,
      stateHash: finalState.stateHash,
      createdAt,
    };
    const commitNotification = this.buildCommitNotification(
      input.key,
      input.commitNotification,
      input.requestId,
      startRevision,
      finalRevision,
      previousChainHash,
    );
    const notificationKey =
      commitNotification === null
        ? null
        : commitNotificationKey(
            this.commitNotificationPrefix,
            commitNotification.gameId,
            commitNotification.branchId,
            commitNotification.notificationId,
          );
    const notificationEntry =
      notificationKey === null
        ? null
        : await this.options.kv.get<DenoKvCommitNotification>(notificationKey);
    if (
      commitNotification !== null &&
      notificationEntry?.value !== null &&
      notificationEntry !== null &&
      canonicalJson(notificationEntry.value) !== canonicalJson(commitNotification)
    ) {
      throw new PersistenceConflictError("Commit notification ID was already recorded differently");
    }
    const transaction = this.options.kv.atomic().check({
      key: branchMetadataKey(input.key),
      versionstamp: branchEntry.versionstamp,
    });
    if (notificationKey !== null) {
      transaction.check({
        key: notificationKey,
        versionstamp: notificationEntry?.versionstamp ?? null,
      });
    }
    if (initializing) {
      const event = input.events[0];
      if (event?.type === "game_created") {
        if (input.rulesetDefinition === undefined) {
          throw new PersistenceValidationError("Deno KV game creation needs a historical ruleset");
        }
        const ruleset = cloneObject(input.rulesetDefinition, "Historical ruleset");
        const sessionConfiguration = cloneObject(
          input.sessionConfiguration ?? null,
          "Session configuration",
        );
        if (sessionConfiguration === null) {
          throw new PersistenceValidationError("Deno KV game creation needs session configuration");
        }
        const historical = this.validateRulesetDefinition(ruleset);
        if (historical.hash !== event.rules.hash) {
          throw new PersistenceValidationError(
            "Historical ruleset hash does not match game_created",
          );
        }
        const metadata: GameMetadata = {
          gameId: event.gameId,
          learnerId: input.learnerId ?? null,
          rulesetId: event.rules.id,
          rulesetVersion: event.rules.version,
          rulesetHash: event.rules.hash,
          rulesetDefinition: ruleset as GameMetadata["rulesetDefinition"],
          sessionConfiguration: sessionConfiguration as GameSessionConfigurationV1,
          sessionConfigurationHash: persistenceHash(sessionConfiguration),
          seed: event.seed,
          rngVersion: event.rngVersion,
          mode: event.mode,
          createdAt,
        };
        transaction.check({ key: gameMetadataKey(input.key.gameId), versionstamp: null });
        transaction.set(gameMetadataKey(input.key.gameId), metadata);
        transaction.set(branchMetadataKey(input.key), branch);
      } else if (event?.type === "practice_branch_created") {
        transaction.set(branchMetadataKey(input.key), branch);
      } else {
        throw new PersistenceValidationError("Deno KV branch creation event is invalid");
      }
    } else {
      transaction.set(branchMetadataKey(input.key), branch);
    }
    for (const stored of storedEvents) {
      transaction.set(eventKey(input.key, stored.revision), stored);
      const snapshot = snapshots.find(({ revision }) => revision === stored.revision);
      if (snapshot === undefined) {
        throw new PersistenceCorruptionError("Deno KV snapshot state was not produced");
      }
      const snapshotValue = {
        key: { ...input.key },
        revision: snapshot.revision,
        state: snapshot.state,
        stateHash: snapshot.stateHash,
        eventChainHash: snapshot.eventChainHash,
      };
      if (jsonByteLength(snapshotValue) <= MAX_SNAPSHOT_BYTES) {
        transaction.set(snapshotKey(input.key, stored.revision), snapshotValue);
      }
    }
    transaction.set(requestKey(input.key, input.requestId), receipt);
    if (commitNotification !== null && notificationKey !== null) {
      transaction.set(notificationKey, commitNotification);
    }
    const committed = await transaction.commit();
    if (!committed.ok) {
      const retry = await this.getCommandReceipt(input.key, input.requestId);
      if (retry !== null && retry.commandHash === hash) {
        return {
          key: { ...input.key },
          disposition: "idempotent",
          startRevision: retry.startRevision,
          endRevision: retry.endRevision,
          stateHash: retry.stateHash,
        };
      }
      throw new PersistenceConflictError("Deno KV branch compare-and-set failed");
    }
    this.stateCache.set(stateCacheKey(input.key), {
      revision: finalRevision,
      stateHash: finalState.stateHash,
      eventChainHash: previousChainHash,
      state: cloneObject(finalState, "Game state cache"),
    });
    return {
      key: { ...input.key },
      disposition: "appended",
      startRevision,
      endRevision: finalRevision,
      stateHash: finalState.stateHash,
    };
  }

  private buildCommitNotification(
    key: GameKey,
    input: CommitNotificationInput | undefined,
    commandRequestId: string,
    fromRevision: number,
    toRevision: number,
    eventChainHash: string,
  ): DenoKvCommitNotification | null {
    if (input === undefined) {
      return null;
    }
    if (input.notificationId.trim().length === 0) {
      throw new PersistenceValidationError("Commit notification ID must not be empty");
    }
    const action = input.action === null ? null : cloneObject(input.action, "Commit action");
    if (
      action !== null &&
      (action.requestId !== commandRequestId ||
        action.requestId.trim().length === 0 ||
        action.playerId.trim().length === 0 ||
        action.actionId.trim().length === 0)
    ) {
      throw new PersistenceValidationError("Commit notification action identity is invalid");
    }
    return {
      schemaVersion: 1,
      notificationId: input.notificationId,
      gameId: key.gameId,
      branchId: key.branchId,
      fromRevision,
      toRevision,
      eventChainHash,
      action,
    };
  }

  private async eventsThrough(key: GameKey, revision: number): Promise<readonly StoredGameEvent[]> {
    const branchEntry = await this.options.kv.get<KvBranch>(branchMetadataKey(key));
    const branch = this.requireBranch(branchEntry.value, key);
    if (branch.parentKey !== null && revision <= branch.forkRevision) {
      return this.eventsThrough(branch.parentKey, revision);
    }
    const inherited =
      branch.parentKey === null
        ? []
        : [...(await this.eventsThrough(branch.parentKey, branch.forkRevision))];
    const events: StoredGameEvent[] = [];
    const firstLocalRevision = branch.parentKey === null ? 1 : branch.forkRevision + 1;
    for (let index = firstLocalRevision; index <= revision; index += 1) {
      const entry = await this.options.kv.get<StoredGameEvent>(eventKey(key, index));
      events.push(eventFromEntry(entry, key));
    }
    return [...inherited, ...events];
  }

  private async reconstruct(
    key: GameKey,
    revision: number,
    branch: KvBranch,
  ): Promise<{ readonly state: GameState }> {
    const events = await this.eventsThrough(key, revision);
    let state: GameState | undefined;
    let chain = rootChainHash(key.gameId);
    for (const stored of events) {
      const expectedChain = nextChainHash(
        stored.key,
        chain,
        stored.revision,
        stored.eventHash,
        stored.stateHash,
      );
      if (expectedChain !== stored.eventChainHash) {
        throw new PersistenceCorruptionError("Deno KV event chain hash is corrupt");
      }
      state = this.reducer(state, stored.event);
      if (state.stateHash !== stored.stateHash || state.revision !== stored.revision) {
        throw new PersistenceCorruptionError("Deno KV reconstructed state hash is corrupt");
      }
      chain = stored.eventChainHash;
    }
    if (
      state === undefined ||
      (revision === branch.currentRevision &&
        (state.stateHash !== branch.stateHash || chain !== branch.eventChainHash))
    ) {
      throw new PersistenceCorruptionError("Deno KV branch metadata disagrees with replay");
    }
    return { state };
  }

  private requireBranch(value: KvBranch | null, key: GameKey): KvBranch {
    if (value === null) {
      throw new PersistenceNotFoundError(`Branch ${key.gameId}/${key.branchId} does not exist`);
    }
    return value;
  }

  private async validatePracticeMarker(
    parentKey: GameKey,
    event: PracticeBranchCreatedEvent,
    parent: LoadedGame,
  ): Promise<void> {
    if (
      event.gameId !== parentKey.gameId ||
      event.parentBranchId !== parentKey.branchId ||
      event.originDecisionBranchId !== parentKey.branchId ||
      event.branchId === "main" ||
      event.branchId === parentKey.branchId ||
      event.revision !== event.parentRevision + 1 ||
      event.originDecisionId.trim().length === 0 ||
      event.requestedByPlayerId.trim().length === 0 ||
      !["learn", "guided", "socratic", "sandbox"].includes(parent.game.mode) ||
      parent.state.lastEventId !== event.parentEventId ||
      parent.state.stateHash !== event.parentStateHash ||
      parent.state.branchId !== parentKey.branchId ||
      parent.state.players[event.requestedByPlayerId] === undefined
    ) {
      throw new PersistenceValidationError(
        "Practice branch event does not match its permitted parent checkpoint",
      );
    }
    const decision = await this.getDecisionProvenance(parentKey, event.originDecisionId);
    const decisionForComparison: DenoKvDecisionProvenance = decision ?? {
      decisionId: "",
      key: { gameId: "", branchId: "" },
      learnerId: null,
      handId: "",
      revision: -1,
      playerId: "",
      createdAt: "",
    };
    if (
      decision === null ||
      decisionForComparison.key.gameId !== parentKey.gameId ||
      decisionForComparison.key.branchId !== parentKey.branchId ||
      decisionForComparison.revision !== event.parentRevision ||
      decisionForComparison.handId !== parent.state.hand.id ||
      decisionForComparison.playerId !== event.requestedByPlayerId ||
      (decisionForComparison.learnerId !== null &&
        decisionForComparison.learnerId !== parent.game.learnerId)
    ) {
      throw new PersistenceValidationError(
        "Practice branch event does not match its origin decision",
      );
    }
  }
}

export interface DenoKvCommitNotification extends Omit<CommitNotification, "schemaVersion"> {
  readonly schemaVersion: 1;
}

/** Immutable KV notifications provide at-least-once fan-out across Deno Deploy instances. */
export class DenoKvCommitNotifier {
  public readonly prefix: readonly unknown[];

  public constructor(
    private readonly kv: DenoKvLike,
    prefix: readonly unknown[] = DEFAULT_COMMIT_NOTIFICATION_PREFIX,
  ) {
    this.prefix = [...prefix];
  }

  public async publish(notification: DenoKvCommitNotification): Promise<void> {
    const key = [
      ...this.prefix,
      notification.gameId,
      notification.branchId,
      notification.notificationId,
    ];
    const existing = await this.kv.get<DenoKvCommitNotification>(key);
    if (existing.value !== null) {
      if (canonicalJson(existing.value) !== canonicalJson(notification)) {
        throw new PersistenceConflictError(
          "Commit notification ID was already recorded differently",
        );
      }
      return;
    }
    const committed = await this.kv
      .atomic()
      .check({ key, versionstamp: null })
      .set(key, notification)
      .commit();
    if (!committed.ok) {
      const retry = await this.kv.get<DenoKvCommitNotification>(key);
      if (retry.value !== null && canonicalJson(retry.value) === canonicalJson(notification)) {
        return;
      }
      throw new PersistenceConflictError("Commit notification could not be persisted");
    }
  }

  public async list(
    gameId: string,
    branchId: string,
  ): Promise<readonly DenoKvCommitNotification[]> {
    const values: DenoKvCommitNotification[] = [];
    for await (const entry of this.kv.list<DenoKvCommitNotification>({
      prefix: [...this.prefix, gameId, branchId],
    })) {
      if (entry.value !== null) {
        values.push(entry.value);
      }
    }
    return values.sort(
      (left, right) =>
        left.toRevision - right.toRevision ||
        left.notificationId.localeCompare(right.notificationId),
    );
  }
}
