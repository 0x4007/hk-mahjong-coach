import Database from "better-sqlite3";
import {
  canonicalJsonHash,
  canonicalJson,
  computeRoundProgression,
  reduceGameEvent,
  type CoreGameRules,
  type GameEvent,
  type GameMode,
  type GameState,
  type LegalAction,
  type PracticeBranchCreatedEvent,
} from "@hk-mahjong/core";

import {
  PersistenceError,
  PersistenceConflictError,
  PersistenceCorruptionError,
  PersistenceNotFoundError,
  PersistenceValidationError,
} from "./errors.js";
import { migratePersistence } from "./migrations.js";
import {
  MAIN_BRANCH_ID,
  PERSISTENCE_EXPORT_FORMAT,
  PERSISTENCE_EXPORT_VERSION,
  type AnalysisFactRecord,
  type AnalysisFactRecordInput,
  type AppendAcceptedCommandInput,
  type AppendAcceptedCommandResult,
  type CommandReceipt,
  type ConceptMasteryInput,
  type ConceptMasteryRecord,
  type DecisionRecord,
  type DecisionRecordInput,
  type DrillAttemptRecord,
  type DrillAttemptRecordInput,
  type DrillItemRecord,
  type DrillItemRecordInput,
  type ExportOptions,
  type ForkPracticeBranchInput,
  type ForkPracticeBranchResult,
  type GameBranchMetadata,
  type GameKey,
  type GameMetadata,
  type GameSessionConfigurationV1,
  type HandRecord,
  type HintRecord,
  type HintRecordInput,
  type ImportOptions,
  type ImportResult,
  type JsonObject,
  type JsonValue,
  type LearnerPreferencesInput,
  type LearnerPreferencesRecord,
  type LlmRequestMetadata,
  type LlmRequestMetadataInput,
  type LoadedGame,
  type LoadedResumableGame,
  type PersistenceExport,
  type PersistenceExportData,
  type PersistenceRepository,
  type PersistenceRepositoryOptions,
  type ReplayResult,
  type ReviewRecord,
  type ReviewRecordInput,
  type SnapshotRecovery,
  type SpacedRepetitionScheduleInput,
  type SpacedRepetitionScheduleRecord,
  type StoredGameEvent,
  type StoredGameSnapshot,
} from "./types.js";
import {
  assertGameKey,
  assertInputState,
  assertStateIntegrity,
  canonicalJsonText,
  isRecord,
  parsePersistedJson,
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

const GAME_MODES = new Set<GameMode>([
  "learn",
  "guided",
  "socratic",
  "competitive",
  "exam",
  "sandbox",
]);
const LLM_STATUSES = new Set(["aborted", "error", "success"] as const);
const DRILL_SOURCES = new Set(["bundled", "generated", "replay"] as const);
const BOT_DIFFICULTIES = new Set(["novice", "basic", "intermediate", "advanced"] as const);
const BOT_PERSONALITIES = new Set(["fast", "value", "balanced"] as const);
const COACH_PROVIDERS = new Set(["templates", "openai"] as const);
const COACH_VERBOSITIES = new Set(["brief", "normal", "detailed"] as const);
const PRACTICE_BRANCH_MODES = new Set<GameMode>(["learn", "guided", "socratic", "sandbox"]);
const MAX_BRANCH_DEPTH = 32;
const PERSISTENCE_EXPORT_DATA_FIELDS = [
  "learners",
  "learnerPreferences",
  "conceptMastery",
  "games",
  "branches",
  "hands",
  "events",
  "snapshots",
  "commandReceipts",
  "decisions",
  "analysisFacts",
  "hints",
  "reviews",
  "drillItems",
  "drillAttempts",
  "schedules",
  "llmRequests",
] as const satisfies readonly (keyof PersistenceExportData)[];
const compareCodePoints = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

interface GameRow {
  game_id: string;
  learner_id: string | null;
  ruleset_id: string;
  ruleset_version: string;
  ruleset_hash: string;
  ruleset_json: string | null;
  session_config_json: string | null;
  session_config_hash: string | null;
  seed: string;
  rng_version: string;
  mode: string;
  created_at: string;
}

interface BranchRow {
  game_id: string;
  branch_id: string;
  parent_branch_id: string | null;
  fork_revision: number;
  fork_state_hash: string | null;
  fork_event_chain_hash: string;
  practice: number;
  created_at: string;
  activity_order: number;
  current_revision: number;
  state_hash: string | null;
  event_chain_hash: string;
}

interface EventRow {
  game_id: string;
  branch_id: string;
  revision: number;
  event_id: string;
  request_id: string;
  event_type: string;
  visibility: string;
  event_json: string;
  event_hash: string;
  state_hash: string;
  event_chain_hash: string;
  created_at: string;
}

interface SnapshotRow {
  game_id: string;
  branch_id: string;
  revision: number;
  state_json: string;
  state_hash: string;
  snapshot_hash: string;
  event_chain_hash: string;
  created_at: string;
}

interface ReceiptRow {
  game_id: string;
  branch_id: string;
  result_branch_id: string | null;
  request_id: string;
  command_hash: string;
  start_revision: number;
  end_revision: number;
  state_hash: string;
  created_at: string;
}

interface LearnerRow {
  learner_id: string;
  created_at: string;
}

interface LearnerPreferencesRow {
  learner_id: string;
  preferences_json: string;
  updated_at: string;
}

interface MasteryRow {
  learner_id: string;
  concept_id: string;
  mastery: number;
  confidence: number;
  attempts: number;
  independent_attempts: number;
  successful_attempts: number;
  hint_weighted_score: number;
  algorithm_version: string;
  last_seen_at: string | null;
  next_review_at: string | null;
  updated_at: string;
}

interface DecisionRow {
  decision_id: string;
  game_id: string;
  branch_id: string;
  learner_id: string | null;
  hand_id: string;
  revision: number;
  player_id: string;
  request_id: string | null;
  action_id: string;
  independent: number;
  quality: number | null;
  analysis_version: string;
  weighting_version: string;
  data_json: string;
  created_at: string;
}

interface FactRow {
  fact_id: string;
  decision_id: string;
  kind: string;
  summary: string;
  data_json: string;
  created_at: string;
}

interface HintRow {
  hint_id: string;
  learner_id: string;
  decision_id: string | null;
  level: number;
  data_json: string;
  created_at: string;
}

interface ReviewRow {
  review_id: string;
  learner_id: string;
  game_id: string;
  branch_id: string;
  hand_id: string;
  data_json: string;
  created_at: string;
}

interface DrillItemRow {
  drill_item_id: string;
  learner_id: string;
  source: string;
  concept_ids_json: string;
  difficulty: number;
  data_json: string;
  created_at: string;
}

interface DrillAttemptRow {
  drill_attempt_id: string;
  drill_item_id: string;
  learner_id: string;
  correct: number;
  hint_level: number;
  data_json: string;
  created_at: string;
}

interface ScheduleRow {
  drill_item_id: string;
  learner_id: string;
  next_review_at: string;
  interval_days: number;
  ease: number;
  updated_at: string;
}

interface LlmRequestRow {
  llm_request_id: string;
  learner_id: string | null;
  decision_id: string | null;
  provider: string;
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  fact_ids_json: string;
  status: string;
  error_code: string | null;
  created_at: string;
}

interface HandRow {
  game_id: string;
  branch_id: string;
  hand_id: string;
  seed: string;
  hand_index: number;
  started_revision: number;
  ended_revision: number | null;
  result_json: string | null;
  practice: number;
}

interface HistorySegment {
  branch: GameBranchMetadata;
  startRevision: number;
  endRevision: number;
}

interface GameHistory {
  game: GameMetadata;
  branch: GameBranchMetadata;
  targetRevision: number;
  events: readonly StoredGameEvent[];
  stateHashByRevision: ReadonlyMap<number, string>;
  chainHashByRevision: ReadonlyMap<number, string>;
  segments: readonly HistorySegment[];
}

interface Reconstruction {
  state: GameState;
  recovery: SnapshotRecovery;
}

const corruption = (message: string): never => {
  throw new PersistenceCorruptionError(message);
};

const dbString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return corruption(`${label} is corrupt`);
  }
  return value;
};

const dbNullableString = (value: unknown, label: string): string | null => {
  if (value === null) {
    return null;
  }
  return dbString(value, label);
};

const dbInteger = (value: unknown, label: string, minimum = Number.MIN_SAFE_INTEGER): number => {
  const integer = typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(integer) || integer < minimum) {
    return corruption(`${label} is corrupt`);
  }
  return integer;
};

const dbNumber = (
  value: unknown,
  label: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    return corruption(`${label} is corrupt`);
  }
  return value;
};

const dbBoolean = (value: unknown, label: string): boolean => {
  if (value !== 0 && value !== 1) {
    return corruption(`${label} is corrupt`);
  }
  return value === 1;
};

const dbHash = (value: unknown, label: string): string => {
  const hash = dbString(value, label);
  if (!/^sha256:[0-9a-f]{64}$/u.test(hash)) {
    return corruption(`${label} is corrupt`);
  }
  return hash;
};

/**
 * Validates the resolved, historical ruleset record without depending on a mutable ruleset
 * registry. The canonical definition hash is the same identity produced by @hk-mahjong/hk-rules.
 */
const requireHistoricalRulesetDefinition = (
  value: unknown,
  expected: Pick<CoreGameRules, "id" | "version" | "hash">,
  label: string,
  validate: PersistenceRepositoryOptions["validateRulesetDefinition"],
  expectedCoreRules?: CoreGameRules,
): JsonObject => {
  const definition = requireJsonObject(value, label);
  let validated: ReturnType<PersistenceRepositoryOptions["validateRulesetDefinition"]>;
  try {
    validated = validate(definition);
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "unknown validation failure";
    throw new PersistenceValidationError(`${label} is invalid: ${reason}`);
  }
  const validatedDefinition = requireJsonObject(validated.definition, `${label} resolved value`);
  const validatedCoreRules = requireJsonObject(validated.coreRules, `${label} resolved core rules`);
  const id = requireNonEmptyString(validatedDefinition.id, `${label} ID`);
  const version = requireNonEmptyString(validatedDefinition.version, `${label} version`);
  const hash = requireHash(validated.hash, `${label} resolved hash`);
  if (
    canonicalJson(validatedDefinition) !== canonicalJson(definition) ||
    hash !== `sha256:${canonicalJsonHash(validatedDefinition)}`
  ) {
    throw new PersistenceValidationError(`${label} is not the canonical resolved ruleset`);
  }
  if (id !== expected.id || version !== expected.version || hash !== expected.hash) {
    throw new PersistenceValidationError(`${label} does not match the persisted ruleset identity`);
  }
  if (
    expectedCoreRules !== undefined &&
    canonicalJson(validatedCoreRules) !== canonicalJson(expectedCoreRules)
  ) {
    throw new PersistenceValidationError(
      `${label} does not match the authoritative core rule projection`,
    );
  }
  return validatedDefinition;
};

const requireExactFields = (
  value: JsonObject,
  expectedFields: readonly string[],
  label: string,
): void => {
  const expected = new Set(expectedFields);
  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((field) => !expected.has(field))
  ) {
    throw new PersistenceValidationError(`${label} has unsupported fields`);
  }
};

const requireSessionConfiguration = (
  value: unknown,
  label: string,
  expectedBotPlayerIds?: readonly string[],
): GameSessionConfigurationV1 => {
  const configuration = requireJsonObject(value, label);
  requireExactFields(configuration, ["schemaVersion", "bots", "coach"], label);
  if (configuration.schemaVersion !== 1) {
    throw new PersistenceValidationError(`${label} schema version is unsupported`);
  }
  const rawBots: unknown = configuration.bots;
  if (!Array.isArray(rawBots)) {
    throw new PersistenceValidationError(`${label} bots must be an array`);
  }
  const bots: GameSessionConfigurationV1["bots"][number][] = [];
  for (const [index, rawBot] of rawBots.entries()) {
    const bot = requireJsonObject(rawBot, `${label} bot ${String(index)}`);
    requireExactFields(
      bot,
      ["playerId", "difficulty", "personality"],
      `${label} bot ${String(index)}`,
    );
    const playerId = requireNonEmptyString(bot.playerId, `${label} bot player ID`);
    const difficulty = requireNonEmptyString(bot.difficulty, `${label} bot difficulty`);
    const personality = requireNonEmptyString(bot.personality, `${label} bot personality`);
    if (
      !BOT_DIFFICULTIES.has(difficulty as GameSessionConfigurationV1["bots"][number]["difficulty"])
    ) {
      throw new PersistenceValidationError(`${label} bot difficulty is unsupported`);
    }
    if (
      !BOT_PERSONALITIES.has(
        personality as GameSessionConfigurationV1["bots"][number]["personality"],
      )
    ) {
      throw new PersistenceValidationError(`${label} bot personality is unsupported`);
    }
    bots.push({
      playerId,
      difficulty: difficulty as GameSessionConfigurationV1["bots"][number]["difficulty"],
      personality: personality as GameSessionConfigurationV1["bots"][number]["personality"],
    });
  }
  bots.sort((left, right) => compareCodePoints(left.playerId, right.playerId));
  const botPlayerIds = bots.map(({ playerId }) => playerId);
  if (new Set(botPlayerIds).size !== botPlayerIds.length) {
    throw new PersistenceValidationError(`${label} contains duplicate bot player IDs`);
  }
  if (expectedBotPlayerIds !== undefined) {
    const expected = [...expectedBotPlayerIds].sort(compareCodePoints);
    if (
      expected.length !== botPlayerIds.length ||
      expected.some((playerId, index) => playerId !== botPlayerIds[index])
    ) {
      throw new PersistenceValidationError(
        `${label} must configure every persisted bot player exactly once`,
      );
    }
  }

  const coach = requireJsonObject(configuration.coach, `${label} coach`);
  requireExactFields(coach, ["enabled", "provider", "verbosity"], `${label} coach`);
  const enabled = requireBoolean(coach.enabled, `${label} coach enabled`);
  const provider = requireNonEmptyString(coach.provider, `${label} coach provider`);
  const verbosity = requireNonEmptyString(coach.verbosity, `${label} coach verbosity`);
  if (!COACH_PROVIDERS.has(provider as GameSessionConfigurationV1["coach"]["provider"])) {
    throw new PersistenceValidationError(`${label} coach provider is unsupported`);
  }
  if (!COACH_VERBOSITIES.has(verbosity as GameSessionConfigurationV1["coach"]["verbosity"])) {
    throw new PersistenceValidationError(`${label} coach verbosity is unsupported`);
  }
  return {
    schemaVersion: 1,
    bots,
    coach: {
      enabled,
      provider: provider as GameSessionConfigurationV1["coach"]["provider"],
      verbosity: verbosity as GameSessionConfigurationV1["coach"]["verbosity"],
    },
  };
};

const sessionConfigurationHashFor = (configuration: GameSessionConfigurationV1): string =>
  persistenceHash({
    kind: "hk-mahjong-persistence-session-configuration",
    version: 1,
    configuration,
  });

const requireSessionConfigurationForState = (
  configuration: GameSessionConfigurationV1,
  state: GameState,
  label: string,
): void => {
  const expectedBotPlayerIds = Object.values(state.players)
    .filter(({ controller }) => controller === "bot")
    .map(({ id }) => id);
  requireSessionConfiguration(configuration, label, expectedBotPlayerIds);
};

const rootChainHash = (gameId: string): string =>
  persistenceHash({
    kind: "hk-mahjong-persistence-event-chain",
    version: 1,
    gameId,
    branchId: MAIN_BRANCH_ID,
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

const snapshotHashFor = (state: GameState): string =>
  persistenceHash({ kind: "hk-mahjong-persistence-snapshot", version: 1, state });

const commandHashFor = (
  requestId: string,
  events: readonly GameEvent[],
  stateHash: string,
): string =>
  persistenceHash({
    kind: "hk-mahjong-persistence-command",
    version: 1,
    requestId,
    events,
    stateHash,
  });

const isHandBoundaryEvent = (event: GameEvent): boolean =>
  event.type === "game_created" ||
  event.type === "initial_deal_completed" ||
  event.type === "practice_branch_created" ||
  event.type === "next_hand_started" ||
  event.type === "hand_won" ||
  event.type === "hand_ended" ||
  event.type === "match_ended";

const isTruncatedCompletedMatch = (state: GameState): boolean =>
  state.phase === "hand_ended" && computeRoundProgression(state).matchComplete;

const rowToGameMetadata = (
  row: GameRow,
  validateRulesetDefinition: PersistenceRepositoryOptions["validateRulesetDefinition"],
): GameMetadata => {
  const mode = dbString(row.mode, "Game mode");
  if (!GAME_MODES.has(mode as GameMode)) {
    return corruption("Game mode is corrupt");
  }
  const metadata = {
    gameId: dbString(row.game_id, "Game ID"),
    learnerId: dbNullableString(row.learner_id, "Game learner ID"),
    rulesetId: dbString(row.ruleset_id, "Game ruleset ID"),
    rulesetVersion: dbString(row.ruleset_version, "Game ruleset version"),
    rulesetHash: dbHash(row.ruleset_hash, "Game ruleset hash"),
    seed: dbString(row.seed, "Game seed"),
    rngVersion: dbString(row.rng_version, "Game RNG version"),
    mode: mode as GameMode,
    createdAt: dbString(row.created_at, "Game creation time"),
  };
  if (row.ruleset_json === null) {
    return corruption("Game historical ruleset definition is missing");
  }
  try {
    let sessionConfiguration: GameSessionConfigurationV1 | null = null;
    let sessionConfigurationHash: string | null = null;
    if (row.session_config_json !== null || row.session_config_hash !== null) {
      if (row.session_config_json === null || row.session_config_hash === null) {
        return corruption("Game session configuration metadata is incomplete");
      }
      sessionConfiguration = requireSessionConfiguration(
        parsePersistedJson(row.session_config_json, "Game session configuration"),
        "Game session configuration",
      );
      sessionConfigurationHash = dbHash(row.session_config_hash, "Game session configuration hash");
      if (sessionConfigurationHash !== sessionConfigurationHashFor(sessionConfiguration)) {
        return corruption("Game session configuration hash is corrupt");
      }
    }
    return {
      ...metadata,
      rulesetDefinition: requireHistoricalRulesetDefinition(
        parsePersistedJson(row.ruleset_json, "Game historical ruleset definition"),
        {
          id: metadata.rulesetId,
          version: metadata.rulesetVersion,
          hash: metadata.rulesetHash,
        },
        "Game historical ruleset definition",
        validateRulesetDefinition,
      ),
      sessionConfiguration,
      sessionConfigurationHash,
    };
  } catch (caught) {
    const reason =
      caught instanceof Error ? caught.message : "invalid historical ruleset definition";
    return corruption(`Game historical ruleset definition is corrupt: ${reason}`);
  }
};

const rowToBranchMetadata = (row: BranchRow): GameBranchMetadata => {
  const gameId = dbString(row.game_id, "Branch game ID");
  const branchId = dbString(row.branch_id, "Branch ID");
  const parentBranchId = dbNullableString(row.parent_branch_id, "Parent branch ID");
  const forkRevision = dbInteger(row.fork_revision, "Branch fork revision", 0);
  const forkStateHash =
    row.fork_state_hash === null ? null : dbHash(row.fork_state_hash, "Fork state hash");
  const currentRevision = dbInteger(row.current_revision, "Branch revision", 0);
  const activityOrder = dbInteger(row.activity_order, "Branch activity order", 0);
  const stateHash = row.state_hash === null ? null : dbHash(row.state_hash, "Branch state hash");
  const parentKey = parentBranchId === null ? null : { gameId, branchId: parentBranchId };
  const practice = dbBoolean(row.practice, "Branch practice flag");
  if (
    (parentKey === null &&
      (branchId !== MAIN_BRANCH_ID || forkRevision !== 0 || forkStateHash !== null || practice)) ||
    (parentKey !== null &&
      (forkRevision < 1 ||
        forkStateHash === null ||
        currentRevision < forkRevision ||
        !practice ||
        branchId === MAIN_BRANCH_ID ||
        parentBranchId === branchId))
  ) {
    return corruption("Branch metadata is inconsistent");
  }
  if ((currentRevision === 0) !== (stateHash === null)) {
    return corruption("Branch state metadata is inconsistent");
  }
  return {
    key: { gameId, branchId },
    parentKey,
    forkRevision,
    forkStateHash,
    forkEventChainHash: dbHash(row.fork_event_chain_hash, "Fork event chain hash"),
    practice,
    createdAt: dbString(row.created_at, "Branch creation time"),
    activityOrder,
    currentRevision,
    stateHash,
    eventChainHash: dbHash(row.event_chain_hash, "Branch event chain hash"),
  };
};

const rowToStoredEvent = (row: EventRow): StoredGameEvent => {
  const key: GameKey = {
    gameId: dbString(row.game_id, "Event game ID"),
    branchId: dbString(row.branch_id, "Event branch ID"),
  };
  const revision = dbInteger(row.revision, "Event revision", 1);
  const event = parseStoredGameEvent(row.event_json, key.gameId, key.branchId, revision);
  const eventHash = dbHash(row.event_hash, "Event hash");
  if (eventHash !== persistenceHash(event)) {
    return corruption(`Event ${event.id} has a mismatched event hash`);
  }
  if (
    row.event_id !== event.id ||
    row.request_id !== event.requestId ||
    row.event_type !== event.type ||
    row.visibility !== event.visibility
  ) {
    return corruption(`Event ${event.id} has mismatched indexed metadata`);
  }
  return {
    key,
    revision,
    requestId: dbString(row.request_id, "Event request ID"),
    event,
    eventHash,
    stateHash: dbHash(row.state_hash, "Event state hash"),
    eventChainHash: dbHash(row.event_chain_hash, "Event chain hash"),
    createdAt: dbString(row.created_at, "Event creation time"),
  };
};

const rowToSnapshot = (row: SnapshotRow): StoredGameSnapshot => {
  const key: GameKey = {
    gameId: dbString(row.game_id, "Snapshot game ID"),
    branchId: dbString(row.branch_id, "Snapshot branch ID"),
  };
  const revision = dbInteger(row.revision, "Snapshot revision", 1);
  const stateHash = dbHash(row.state_hash, "Snapshot state hash");
  const state = parseStoredGameState(
    row.state_json,
    key.gameId,
    key.branchId,
    revision,
    stateHash,
    `Snapshot ${key.branchId}/${String(revision)}`,
  );
  const snapshotHash = dbHash(row.snapshot_hash, "Snapshot hash");
  if (snapshotHash !== snapshotHashFor(state)) {
    return corruption(
      `Snapshot ${key.branchId}/${String(revision)} has a mismatched snapshot hash`,
    );
  }
  return {
    key,
    revision,
    state,
    stateHash,
    snapshotHash,
    eventChainHash: dbHash(row.event_chain_hash, "Snapshot event chain hash"),
    createdAt: dbString(row.created_at, "Snapshot creation time"),
  };
};

const rowToReceipt = (row: ReceiptRow): CommandReceipt => ({
  key: {
    gameId: dbString(row.game_id, "Receipt game ID"),
    branchId: dbString(row.branch_id, "Receipt branch ID"),
  },
  resultKey: {
    gameId: dbString(row.game_id, "Receipt result game ID"),
    branchId: dbString(row.result_branch_id, "Receipt result branch ID"),
  },
  requestId: dbString(row.request_id, "Receipt request ID"),
  commandHash: dbHash(row.command_hash, "Receipt command hash"),
  startRevision: dbInteger(row.start_revision, "Receipt start revision", 1),
  endRevision: dbInteger(row.end_revision, "Receipt end revision", 1),
  stateHash: dbHash(row.state_hash, "Receipt state hash"),
  createdAt: dbString(row.created_at, "Receipt creation time"),
});

const asJsonObjectFromStored = (text: string, label: string): JsonObject => {
  const value = parsePersistedJson(text, label);
  if (!isRecord(value)) {
    return corruption(`${label} is not a JSON object`);
  }
  return value;
};

const asStringArrayFromStored = (text: string, label: string): readonly string[] => {
  const value = parsePersistedJson(text, label);
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    return corruption(`${label} is not a non-empty string array`);
  }
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return corruption(`${label} is not a non-empty string array`);
    }
    strings.push(item);
  }
  return strings;
};

export class SqlitePersistenceRepository implements PersistenceRepository {
  private readonly database: Database.Database;
  private readonly reducer: NonNullable<PersistenceRepositoryOptions["reducer"]>;
  private readonly legalActions: PersistenceRepositoryOptions["legalActions"];
  private readonly validateRulesetDefinition: PersistenceRepositoryOptions["validateRulesetDefinition"];
  private readonly snapshotEveryEvents: number;
  private readonly clock: () => string;

  constructor(options: PersistenceRepositoryOptions) {
    requireNonEmptyString(options.databasePath, "Persistence database path");
    this.snapshotEveryEvents =
      options.snapshotEveryEvents === undefined
        ? 16
        : requireSafeInteger(options.snapshotEveryEvents, "Snapshot interval", 1);
    this.reducer = options.reducer ?? reduceGameEvent;
    this.legalActions = options.legalActions;
    this.validateRulesetDefinition = options.validateRulesetDefinition;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.database = new Database(options.databasePath, options.databaseOptions);
    try {
      this.database.pragma("foreign_keys = ON");
      migratePersistence(this.database, this.now());
    } catch (caught) {
      if (this.database.open) {
        this.database.close();
      }
      throw caught;
    }
  }

  close(): void {
    if (this.database.open) {
      this.database.close();
    }
  }

  appendAcceptedCommand(input: AppendAcceptedCommandInput): AppendAcceptedCommandResult {
    return this.database.transaction(() => {
      const result = this.appendAcceptedCommandInternal(input);
      this.persistAcceptedDecisionEvidenceInternal(input, result.disposition);
      return result;
    })();
  }

  getCommandReceipt(key: GameKey, requestId: string): CommandReceipt | null {
    assertGameKey(key);
    requireNonEmptyString(requestId, "Command receipt request ID");
    return this.database.transaction(() => this.getReceiptInternal(key, requestId))();
  }

  loadGame(key: GameKey): LoadedGame {
    return this.database.transaction(() => {
      const branch = this.requireBranchInternal(key);
      return this.loadGameAtRevisionInternal(key, branch.currentRevision);
    })();
  }

  loadLatestResumableGame(learnerId: string | null): LoadedResumableGame | null {
    if (learnerId !== null) {
      requireNonEmptyString(learnerId, "Latest resumable learner ID");
    }
    return this.database.transaction(() => {
      const rows = this.database
        .prepare<[string | null], { game_id: string; branch_id: string }>(
          `SELECT games.game_id, branches.branch_id
           FROM games
           JOIN game_branches AS branches
             ON branches.game_id = games.game_id
           JOIN game_events AS terminal_event
             ON terminal_event.game_id = branches.game_id
            AND terminal_event.branch_id = branches.branch_id
            AND terminal_event.revision = branches.current_revision
           WHERE games.learner_id IS ?
             AND games.session_config_json IS NOT NULL
             AND games.session_config_hash IS NOT NULL
             AND terminal_event.event_type <> 'match_ended'
           ORDER BY branches.activity_order DESC, terminal_event.created_at DESC,
                    branches.created_at DESC, games.created_at DESC,
                    games.game_id DESC, branches.branch_id DESC`,
        )
        .all(learnerId);
      for (const row of rows) {
        const key = {
          gameId: dbString(row.game_id, "Latest resumable game ID"),
          branchId: dbString(row.branch_id, "Latest resumable branch ID"),
        };
        const loaded = this.loadGameAtRevisionInternal(
          key,
          this.requireBranchInternal(key).currentRevision,
        );
        if (loaded.state.phase === "match_ended") {
          continue;
        }
        const sessionConfiguration = loaded.game.sessionConfiguration;
        const sessionConfigurationHash = loaded.game.sessionConfigurationHash;
        if (sessionConfiguration === null || sessionConfigurationHash === null) {
          return corruption("Latest resumable game metadata is inconsistent");
        }
        return {
          ...loaded,
          game: {
            ...loaded.game,
            sessionConfiguration,
            sessionConfigurationHash,
          },
        };
      }
      return null;
    })();
  }

  loadGameAtRevision(key: GameKey, revision: number): LoadedGame {
    assertGameKey(key);
    requireSafeInteger(revision, "Load revision", 1);
    return this.database.transaction(() => this.loadGameAtRevisionInternal(key, revision))();
  }

  replayToTerminal(key: GameKey): ReplayResult {
    return this.database.transaction(() => {
      const branch = this.requireBranchInternal(key);
      this.validateBranchJournalBoundsInternal(branch);
      const history = this.collectHistoryInternal(key, branch.currentRevision);
      const state = this.replayHistoryInternal(history);
      return { key: { ...key }, state, eventCount: history.events.length };
    })();
  }

  forkPracticeBranch(input: ForkPracticeBranchInput): ForkPracticeBranchResult {
    assertGameKey(input.parent);
    return this.database.transaction(() => this.forkPracticeBranchInternal(input))();
  }

  ensureLearner(learnerId: string): void {
    requireNonEmptyString(learnerId, "Learner ID");
    this.database.transaction(() => this.ensureLearnerInternal(learnerId))();
  }

  saveLearnerPreferences(input: LearnerPreferencesInput): LearnerPreferencesRecord {
    return this.database.transaction(() => {
      requireNonEmptyString(input.learnerId, "Learner ID");
      const preferences = requireJsonObject(input.preferences, "Learner preferences");
      const updatedAt = requireOptionalTimestamp(input.updatedAt, this.now());
      this.ensureLearnerInternal(input.learnerId);
      this.database
        .prepare<[string, string, string]>(
          `INSERT INTO learner_preferences (learner_id, preferences_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT (learner_id) DO UPDATE SET
             preferences_json = excluded.preferences_json,
             updated_at = excluded.updated_at`,
        )
        .run(input.learnerId, canonicalJson(preferences), updatedAt);
      return { learnerId: input.learnerId, preferences, updatedAt };
    })();
  }

  getLearnerPreferences(learnerId: string): LearnerPreferencesRecord | null {
    requireNonEmptyString(learnerId, "Learner ID");
    return this.database.transaction(() => {
      const row = this.database
        .prepare<[string], LearnerPreferencesRow>(
          "SELECT learner_id, preferences_json, updated_at FROM learner_preferences WHERE learner_id = ?",
        )
        .get(learnerId);
      if (row === undefined) {
        return null;
      }
      return {
        learnerId: dbString(row.learner_id, "Learner preference learner ID"),
        preferences: asJsonObjectFromStored(row.preferences_json, "Learner preferences"),
        updatedAt: dbString(row.updated_at, "Learner preference update time"),
      };
    })();
  }

  upsertConceptMastery(input: ConceptMasteryInput): ConceptMasteryRecord {
    return this.database.transaction(() => this.upsertConceptMasteryInternal(input))();
  }

  listConceptMastery(learnerId: string): readonly ConceptMasteryRecord[] {
    requireNonEmptyString(learnerId, "Learner ID");
    return this.database.transaction(() =>
      this.database
        .prepare<[string], MasteryRow>(
          `SELECT learner_id, concept_id, mastery, confidence, attempts, independent_attempts,
                  successful_attempts, hint_weighted_score, algorithm_version, last_seen_at,
                  next_review_at, updated_at
           FROM concept_mastery
           WHERE learner_id = ?
           ORDER BY concept_id`,
        )
        .all(learnerId)
        .map((row) => this.rowToConceptMastery(row)),
    )();
  }

  recordDecision(input: DecisionRecordInput): DecisionRecord {
    return this.database.transaction(() => this.recordDecisionInternal(input))();
  }

  recordAnalysisFacts(input: readonly AnalysisFactRecordInput[]): readonly AnalysisFactRecord[] {
    return this.database.transaction(() => this.recordAnalysisFactsInternal(input))();
  }

  recordHint(input: HintRecordInput): HintRecord {
    return this.database.transaction(() => this.recordHintInternal(input))();
  }

  recordReview(input: ReviewRecordInput): ReviewRecord {
    return this.database.transaction(() => this.recordReviewInternal(input))();
  }

  saveDrillItem(input: DrillItemRecordInput): DrillItemRecord {
    return this.database.transaction(() => this.saveDrillItemInternal(input))();
  }

  recordDrillAttempt(input: DrillAttemptRecordInput): DrillAttemptRecord {
    return this.database.transaction(() => this.recordDrillAttemptInternal(input))();
  }

  saveSpacedRepetitionSchedule(
    input: SpacedRepetitionScheduleInput,
  ): SpacedRepetitionScheduleRecord {
    return this.database.transaction(() => this.saveSpacedRepetitionScheduleInternal(input))();
  }

  recordLlmRequestMetadata(input: LlmRequestMetadataInput): LlmRequestMetadata {
    return this.database.transaction(() => this.recordLlmRequestMetadataInternal(input))();
  }

  exportData(options: ExportOptions = {}): PersistenceExport {
    const includeLlmMetadata = options.includeLlmMetadata ?? true;
    return this.database.transaction(() => this.exportDataInternal(includeLlmMetadata))();
  }

  importData(input: unknown, options: ImportOptions = {}): ImportResult {
    try {
      const requestedMode: unknown = options.mode ?? "merge";
      if (requestedMode !== "merge" && requestedMode !== "replace") {
        throw new PersistenceValidationError("Persistence import mode is unsupported");
      }
      const document = this.parseImportDocument(input);
      return this.database.transaction(() => this.importDataInternal(document, requestedMode))();
    } catch (caught) {
      if (caught instanceof PersistenceCorruptionError) {
        throw new PersistenceValidationError(
          `Persistence import contains corrupt or inconsistent data: ${caught.message}`,
        );
      }
      if (caught instanceof PersistenceError) {
        throw caught;
      }
      throw new PersistenceValidationError("Import contains invalid or conflicting local data");
    }
  }

  resetLearnerProgress(learnerId: string): void {
    requireNonEmptyString(learnerId, "Learner ID");
    this.database.transaction(() => {
      this.requireLearnerInternal(learnerId);
      const invalidRetainedOrigin = this.database
        .prepare<[string, string], { decision_id: string }>(
          `SELECT decisions.decision_id
           FROM decisions
           JOIN games ON games.game_id = decisions.game_id
           JOIN game_events
             ON game_events.game_id = decisions.game_id
            AND game_events.event_type = 'practice_branch_created'
            AND json_extract(game_events.event_json, '$.originDecisionId') =
                decisions.decision_id
           WHERE decisions.learner_id = ?
             AND games.learner_id IS NOT ?
           LIMIT 1`,
        )
        .get(learnerId, learnerId);
      if (invalidRetainedOrigin !== undefined) {
        return corruption(
          "Learner reset found a cross-owner practice origin that requires a clean hard-cutover database",
        );
      }
      this.database
        .prepare<[string, string, string]>(
          `UPDATE llm_requests
           SET decision_id = NULL, fact_ids_json = '[]'
           WHERE (
               (learner_id IS NOT NULL AND learner_id <> ?)
               OR (
                 learner_id IS NULL
                 AND decision_id IN (
                   SELECT decisions.decision_id
                   FROM decisions
                   WHERE decisions.learner_id IS NOT NULL
                     AND decisions.learner_id <> ?
                 )
               )
             )
             AND decision_id IN (
               SELECT decisions.decision_id
               FROM decisions
               WHERE decisions.game_id IN (
                 SELECT game_id FROM games WHERE learner_id = ?
               )
             )`,
        )
        .run(learnerId, learnerId, learnerId);
      this.database
        .prepare<[string, string, string]>(
          `DELETE FROM llm_requests
           WHERE learner_id = ?
              OR (
                learner_id IS NULL
                AND decision_id IN (
                  SELECT decisions.decision_id
                  FROM decisions
                  WHERE decisions.learner_id = ?
                     OR (
                       decisions.learner_id IS NULL
                       AND decisions.game_id IN (
                         SELECT game_id FROM games WHERE learner_id = ?
                       )
                     )
                )
              )`,
        )
        .run(learnerId, learnerId, learnerId);
      // A learner reset removes their owned game history as well as derived progress. Preferences
      // remain on the learner row, while game FK cascades remove branches, events, snapshots,
      // hands, receipts, decisions, and facts together.
      this.database.prepare<[string]>("DELETE FROM games WHERE learner_id = ?").run(learnerId);
      this.database.prepare<[string]>("DELETE FROM hints WHERE learner_id = ?").run(learnerId);
      this.database.prepare<[string]>("DELETE FROM reviews WHERE learner_id = ?").run(learnerId);
      this.database
        .prepare<[string]>("DELETE FROM drill_attempts WHERE learner_id = ?")
        .run(learnerId);
      this.database
        .prepare<[string]>("DELETE FROM spaced_repetition_schedule WHERE learner_id = ?")
        .run(learnerId);
      this.database
        .prepare<[string]>("DELETE FROM drill_items WHERE learner_id = ?")
        .run(learnerId);
      this.database
        .prepare<[string]>("DELETE FROM concept_mastery WHERE learner_id = ?")
        .run(learnerId);
      this.database.prepare<[string]>("DELETE FROM decisions WHERE learner_id = ?").run(learnerId);
    })();
  }

  deleteAllData(): void {
    this.database.transaction(() => this.deleteAllDataInternal())();
  }

  private now(): string {
    return requireNonEmptyString(this.clock(), "Persistence clock result");
  }

  private nextActivityOrderInternal(): number {
    const row = this.database
      .prepare<[], { next_activity_order: number }>(
        `SELECT COALESCE(MAX(activity_order), 0) + 1 AS next_activity_order
         FROM game_branches`,
      )
      .get();
    return dbInteger(row?.next_activity_order, "Next branch activity order", 1);
  }

  private getGameInternal(gameId: string): GameMetadata | null {
    const row = this.database
      .prepare<[string], GameRow>(
        `SELECT game_id, learner_id, ruleset_id, ruleset_version, ruleset_hash, ruleset_json,
                session_config_json, session_config_hash, seed, rng_version, mode, created_at
         FROM games WHERE game_id = ?`,
      )
      .get(gameId);
    return row === undefined ? null : rowToGameMetadata(row, this.validateRulesetDefinition);
  }

  private getBranchInternal(key: GameKey): GameBranchMetadata | null {
    const row = this.database
      .prepare<[string, string], BranchRow>(
        `SELECT game_id, branch_id, parent_branch_id, fork_revision, fork_state_hash,
                fork_event_chain_hash, practice, created_at, activity_order, current_revision,
                state_hash, event_chain_hash
         FROM game_branches WHERE game_id = ? AND branch_id = ?`,
      )
      .get(key.gameId, key.branchId);
    return row === undefined ? null : rowToBranchMetadata(row);
  }

  private requireBranchInternal(key: GameKey): GameBranchMetadata {
    assertGameKey(key);
    const branch = this.getBranchInternal(key);
    if (branch === null) {
      throw new PersistenceNotFoundError(
        `Game branch ${key.gameId}/${key.branchId} does not exist`,
      );
    }
    return branch;
  }

  private requireLearnerInternal(learnerId: string): void {
    const row = this.database
      .prepare<[string], LearnerRow>(
        "SELECT learner_id, created_at FROM learners WHERE learner_id = ?",
      )
      .get(learnerId);
    if (row === undefined) {
      throw new PersistenceNotFoundError(`Learner ${learnerId} does not exist`);
    }
    dbString(row.learner_id, "Learner ID");
    dbString(row.created_at, "Learner creation time");
  }

  private ensureLearnerInternal(learnerId: string): void {
    this.database
      .prepare<[string, string]>(
        "INSERT INTO learners (learner_id, created_at) VALUES (?, ?) ON CONFLICT (learner_id) DO NOTHING",
      )
      .run(learnerId, this.now());
  }

  private requireDrillItemOwnerInternal(drillItemId: string, learnerId: string): void {
    const row = this.database
      .prepare<[string], { learner_id: string }>(
        "SELECT learner_id FROM drill_items WHERE drill_item_id = ?",
      )
      .get(drillItemId);
    if (row === undefined) {
      throw new PersistenceNotFoundError(`Drill item ${drillItemId} does not exist`);
    }
    if (dbString(row.learner_id, "Drill item learner ID") !== learnerId) {
      throw new PersistenceValidationError(
        "Drill attempts and schedules must belong to the drill item's learner",
      );
    }
  }

  private getDecisionInternal(decisionId: string): DecisionRecord | null {
    const row = this.database
      .prepare<[string], DecisionRow>(
        `SELECT decision_id, game_id, branch_id, learner_id, hand_id, revision, player_id,
                request_id, action_id, independent, quality, analysis_version, weighting_version,
                data_json, created_at
         FROM decisions
         WHERE decision_id = ?`,
      )
      .get(decisionId);
    return row === undefined ? null : this.rowToDecision(row);
  }

  private requireHandRecordInternal(key: GameKey, handId: string): HandRecord {
    const row = this.database
      .prepare<[string, string, string], HandRow>(
        `SELECT game_id, branch_id, hand_id, seed, hand_index, started_revision, ended_revision,
                result_json, practice
         FROM hands
         WHERE game_id = ? AND branch_id = ? AND hand_id = ?`,
      )
      .get(key.gameId, key.branchId, handId);
    if (row === undefined) {
      throw new PersistenceValidationError(
        `Hand ${key.gameId}/${key.branchId}/${handId} does not exist`,
      );
    }
    return this.rowToHand(row);
  }

  private requireLlmFactScopeInternal(
    learnerId: string | null,
    decisionId: string | null,
    factIds: readonly string[],
    label: string,
  ): void {
    if (new Set(factIds).size !== factIds.length) {
      throw new PersistenceValidationError(`${label} contains duplicate fact IDs`);
    }
    if (decisionId === null) {
      if (factIds.length > 0) {
        throw new PersistenceValidationError(`${label} without a decision cannot reference facts`);
      }
      return;
    }
    const decision = this.getDecisionInternal(decisionId);
    if (decision === null) {
      throw new PersistenceValidationError(`${label} decision does not exist`);
    }
    if (learnerId !== null && decision.learnerId !== learnerId) {
      throw new PersistenceValidationError(
        `${label} learner must match its referenced decision learner`,
      );
    }
    for (const factId of factIds) {
      const fact = this.database
        .prepare<[string, string], { fact_id: string }>(
          "SELECT fact_id FROM analysis_facts WHERE fact_id = ? AND decision_id = ?",
        )
        .get(factId, decisionId);
      if (fact === undefined) {
        throw new PersistenceValidationError(
          `${label} fact does not belong to its referenced decision`,
        );
      }
    }
  }

  private appendAcceptedCommandInternal(
    input: AppendAcceptedCommandInput,
    receiptKey: GameKey = input.key,
  ): AppendAcceptedCommandResult {
    assertGameKey(input.key);
    assertGameKey(receiptKey);
    if (receiptKey.gameId !== input.key.gameId) {
      throw new PersistenceValidationError("A command receipt must belong to the target game");
    }
    requireNonEmptyString(input.requestId, "Accepted command request ID");
    if (input.events.length === 0) {
      throw new PersistenceValidationError("An accepted command must contain at least one event");
    }
    assertInputState(input.state, input.key.gameId, input.key.branchId);
    for (const event of input.events) {
      canonicalJsonText(event, "Accepted command event");
      if (event.gameId !== input.key.gameId || event.requestId !== input.requestId) {
        throw new PersistenceValidationError(
          "Every accepted command event must match the game and request identity",
        );
      }
    }

    let game = this.getGameInternal(input.key.gameId);
    let branch = this.getBranchInternal(input.key);
    const initializingGame = branch === null;
    if (branch === null) {
      if (game !== null) {
        throw new PersistenceNotFoundError(
          `Branch ${input.key.branchId} does not exist; create it through forkPracticeBranch`,
        );
      }
      branch = this.createNewGameInternal(input);
      game = this.getGameInternal(input.key.gameId);
      if (game === null) {
        return corruption("Newly created game metadata is unavailable");
      }
    } else if (game === null) {
      return corruption(`Branch ${input.key.gameId}/${input.key.branchId} has no game metadata`);
    } else if (input.learnerId !== undefined && game.learnerId !== input.learnerId) {
      throw new PersistenceConflictError(
        "A persisted game cannot be reassigned to another learner",
      );
    }
    const commandHash = commandHashFor(input.requestId, input.events, input.state.stateHash);
    const existingReceipt = this.getReceiptInternal(receiptKey, input.requestId);
    if (existingReceipt !== null) {
      if (existingReceipt.commandHash !== commandHash) {
        throw new PersistenceConflictError(
          `Request ${input.requestId} was already accepted with a different command payload`,
        );
      }
      const creationRetry =
        existingReceipt.startRevision === 1 && input.events[0]?.type === "game_created";
      if (input.sessionConfiguration !== undefined) {
        if (
          !creationRetry ||
          game.sessionConfiguration === null ||
          game.sessionConfigurationHash === null
        ) {
          throw new PersistenceValidationError(
            "Game session configuration is immutable after game creation",
          );
        }
        const retryConfiguration = requireSessionConfiguration(
          input.sessionConfiguration,
          "Retried game session configuration",
          Object.values(input.state.players)
            .filter(({ controller }) => controller === "bot")
            .map(({ id }) => id),
        );
        if (sessionConfigurationHashFor(retryConfiguration) !== game.sessionConfigurationHash) {
          throw new PersistenceConflictError(
            "Retried game creation has different session configuration",
          );
        }
      }
      if (input.rulesetDefinition !== undefined) {
        if (!creationRetry) {
          throw new PersistenceValidationError(
            "Historical ruleset definition is immutable after game creation",
          );
        }
        const retryRuleset = requireHistoricalRulesetDefinition(
          input.rulesetDefinition,
          {
            id: game.rulesetId,
            version: game.rulesetVersion,
            hash: game.rulesetHash,
          },
          "Retried game historical ruleset definition",
          this.validateRulesetDefinition,
          input.state.ruleset,
        );
        if (canonicalJson(retryRuleset) !== canonicalJson(game.rulesetDefinition)) {
          throw new PersistenceConflictError(
            "Retried game creation has a different historical ruleset definition",
          );
        }
      }
      if (existingReceipt.endRevision > branch.currentRevision) {
        return corruption("Command receipt extends past its branch revision");
      }
      if (
        existingReceipt.resultKey.gameId !== input.key.gameId ||
        existingReceipt.resultKey.branchId !== input.key.branchId
      ) {
        throw new PersistenceConflictError(
          `Request ${input.requestId} is already bound to another result branch`,
        );
      }
      const current = this.reconstructInternal(existingReceipt.resultKey, branch.currentRevision);
      if (current.state.stateHash !== branch.stateHash) {
        return corruption("Branch state metadata disagrees with reconstructed state");
      }
      return {
        key: { ...input.key },
        disposition: "idempotent",
        startRevision: existingReceipt.startRevision,
        endRevision: existingReceipt.endRevision,
        stateHash: existingReceipt.stateHash,
      };
    }
    if (
      !initializingGame &&
      (input.sessionConfiguration !== undefined || input.rulesetDefinition !== undefined)
    ) {
      throw new PersistenceValidationError(
        "Game session configuration and historical ruleset are immutable after game creation",
      );
    }

    let currentState: GameState | undefined;
    if (branch.currentRevision > 0) {
      if (branch.currentRevision > branch.forkRevision) {
        this.validateBranchJournalBoundsInternal(branch);
      }
      currentState = this.reconstructInternal(input.key, branch.currentRevision).state;
    } else if (branch.key.branchId !== MAIN_BRANCH_ID || branch.parentKey !== null) {
      return corruption("An empty non-root branch is invalid");
    }

    const startRevision = branch.currentRevision + 1;
    const states: GameState[] = [];
    let reduced = currentState;
    for (const [index, event] of input.events.entries()) {
      const expectedRevision = startRevision + index;
      if (
        event.revision !== expectedRevision ||
        event.id !==
          `event:${input.key.gameId}:${input.key.branchId}:${String(expectedRevision)}` ||
        event.branchId !== input.key.branchId
      ) {
        throw new PersistenceValidationError(
          "Accepted command events must have contiguous canonical revisions",
        );
      }
      try {
        reduced = this.reducer(reduced, event);
      } catch (caught) {
        const reason = caught instanceof Error ? caught.message : "Reducer rejected the event";
        throw new PersistenceValidationError(`Accepted command cannot be replayed: ${reason}`);
      }
      assertInputState(reduced, input.key.gameId, input.key.branchId);
      states.push(reduced);
    }
    const finalState = states.at(-1);
    if (finalState === undefined) {
      throw new PersistenceValidationError("Accepted command did not produce a state");
    }
    if (
      finalState.revision !== input.state.revision ||
      finalState.stateHash !== input.state.stateHash ||
      canonicalJson(finalState) !== canonicalJson(input.state)
    ) {
      throw new PersistenceConflictError(
        "Accepted command state does not exactly match the reducer's reconstructed state",
      );
    }
    if (isTruncatedCompletedMatch(finalState)) {
      throw new PersistenceValidationError(
        "A completed match must persist hand_ended and match_ended in the same command",
      );
    }

    const createdAt = this.now();
    let previousChainHash = branch.eventChainHash;
    const storedEvents: StoredGameEvent[] = [];
    for (const [index, event] of input.events.entries()) {
      const state = states[index];
      if (state === undefined) {
        return corruption("Accepted command lost an intermediate state");
      }
      const eventHash = persistenceHash(event);
      const eventChainHash = nextChainHash(
        input.key,
        previousChainHash,
        event.revision,
        eventHash,
        state.stateHash,
      );
      const stored: StoredGameEvent = {
        key: { ...input.key },
        revision: event.revision,
        requestId: event.requestId,
        event,
        eventHash,
        stateHash: state.stateHash,
        eventChainHash,
        createdAt,
      };
      this.insertStoredEventInternal(stored);
      this.upsertHandInternal(input.key, state, branch.practice, event);
      if (isHandBoundaryEvent(event) || event.revision % this.snapshotEveryEvents === 0) {
        this.insertSnapshotInternal({
          key: { ...input.key },
          revision: event.revision,
          state,
          stateHash: state.stateHash,
          snapshotHash: snapshotHashFor(state),
          eventChainHash,
          createdAt,
        });
      }
      storedEvents.push(stored);
      previousChainHash = eventChainHash;
    }

    const updated = this.database
      .prepare<[number, string, string, number, string, string]>(
        `UPDATE game_branches
         SET current_revision = ?, state_hash = ?, event_chain_hash = ?, activity_order = ?
         WHERE game_id = ? AND branch_id = ?`,
      )
      .run(
        finalState.revision,
        finalState.stateHash,
        previousChainHash,
        this.nextActivityOrderInternal(),
        input.key.gameId,
        input.key.branchId,
      );
    if (updated.changes !== 1) {
      return corruption("Accepted command could not update branch metadata");
    }
    this.database
      .prepare<[string, string, string, string, string, number, number, string, string]>(
        `INSERT INTO command_receipts (
           game_id, branch_id, result_branch_id, request_id, command_hash,
           start_revision, end_revision, state_hash, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receiptKey.gameId,
        receiptKey.branchId,
        input.key.branchId,
        input.requestId,
        commandHash,
        startRevision,
        finalState.revision,
        finalState.stateHash,
        createdAt,
      );
    if (storedEvents.length !== input.events.length) {
      return corruption("Accepted command event journal is incomplete");
    }
    return {
      key: { ...input.key },
      disposition: "appended",
      startRevision,
      endRevision: finalState.revision,
      stateHash: finalState.stateHash,
    };
  }

  private createNewGameInternal(input: AppendAcceptedCommandInput): GameBranchMetadata {
    const created = input.events[0];
    if (
      created === undefined ||
      input.key.branchId !== MAIN_BRANCH_ID ||
      created.type !== "game_created"
    ) {
      throw new PersistenceValidationError(
        "Only a game_created event may initialize the main branch",
      );
    }
    if (created.revision !== 1 || input.state.gameId !== created.gameId) {
      throw new PersistenceValidationError("Game creation has invalid initial identity");
    }
    if (input.rulesetDefinition === undefined) {
      throw new PersistenceValidationError(
        "Game creation must include the exact resolved historical ruleset definition",
      );
    }
    const rulesetDefinition = requireHistoricalRulesetDefinition(
      input.rulesetDefinition,
      created.rules,
      "Game historical ruleset definition",
      this.validateRulesetDefinition,
      created.rules,
    );
    if (input.sessionConfiguration === undefined) {
      throw new PersistenceValidationError(
        "Game creation must include immutable bot and coach session configuration",
      );
    }
    const expectedBotPlayerIds = Object.values(input.state.players)
      .filter(({ controller }) => controller === "bot")
      .map(({ id }) => id);
    const sessionConfiguration = requireSessionConfiguration(
      input.sessionConfiguration,
      "Game session configuration",
      expectedBotPlayerIds,
    );
    const sessionConfigurationHash = sessionConfigurationHashFor(sessionConfiguration);
    if (input.learnerId !== undefined) {
      requireNonEmptyString(input.learnerId, "Game learner ID");
      this.ensureLearnerInternal(input.learnerId);
    }
    const createdAt = this.now();
    this.database
      .prepare<
        [
          string,
          string | null,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      >(
        `INSERT INTO games (
           game_id, learner_id, ruleset_id, ruleset_version, ruleset_hash, ruleset_json,
           session_config_json, session_config_hash, seed, rng_version, mode, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.gameId,
        input.learnerId ?? null,
        created.rules.id,
        created.rules.version,
        created.rules.hash,
        canonicalJson(rulesetDefinition),
        canonicalJson(sessionConfiguration),
        sessionConfigurationHash,
        created.seed,
        created.rngVersion,
        created.mode,
        createdAt,
      );
    const chainHash = rootChainHash(created.gameId);
    this.database
      .prepare<
        [
          string,
          string,
          string | null,
          number,
          string | null,
          string,
          number,
          string,
          number,
          string | null,
          string,
        ]
      >(
        `INSERT INTO game_branches (
           game_id, branch_id, parent_branch_id, fork_revision, fork_state_hash, fork_event_chain_hash,
           practice, created_at, current_revision, state_hash, event_chain_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.gameId,
        MAIN_BRANCH_ID,
        null,
        0,
        null,
        chainHash,
        0,
        createdAt,
        0,
        null,
        chainHash,
      );
    const branch = this.getBranchInternal(input.key);
    if (branch === null) {
      return corruption("New main branch was not created");
    }
    return branch;
  }

  private getReceiptInternal(key: GameKey, requestId: string): CommandReceipt | null {
    const row = this.database
      .prepare<[string, string, string], ReceiptRow>(
        `SELECT game_id, branch_id, result_branch_id, request_id, command_hash, start_revision, end_revision,
                state_hash, created_at
         FROM command_receipts
         WHERE game_id = ? AND branch_id = ? AND request_id = ?`,
      )
      .get(key.gameId, key.branchId, requestId);
    return row === undefined ? null : rowToReceipt(row);
  }

  private insertStoredEventInternal(event: StoredGameEvent): void {
    this.database
      .prepare<
        [
          string,
          string,
          number,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      >(
        `INSERT INTO game_events (
           game_id, branch_id, revision, event_id, request_id, event_type, visibility, event_json,
           event_hash, state_hash, event_chain_hash, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.key.gameId,
        event.key.branchId,
        event.revision,
        event.event.id,
        event.requestId,
        event.event.type,
        event.event.visibility,
        canonicalJson(event.event),
        event.eventHash,
        event.stateHash,
        event.eventChainHash,
        event.createdAt,
      );
  }

  private insertSnapshotInternal(snapshot: StoredGameSnapshot): void {
    this.database
      .prepare<[string, string, number, string, string, string, string, string]>(
        `INSERT INTO game_snapshots (
           game_id, branch_id, revision, state_json, state_hash, snapshot_hash, event_chain_hash, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, branch_id, revision) DO NOTHING`,
      )
      .run(
        snapshot.key.gameId,
        snapshot.key.branchId,
        snapshot.revision,
        canonicalJson(snapshot.state),
        snapshot.stateHash,
        snapshot.snapshotHash,
        snapshot.eventChainHash,
        snapshot.createdAt,
      );
  }

  private upsertHandInternal(
    key: GameKey,
    state: GameState,
    practice: boolean,
    event: GameEvent,
  ): void {
    const resultJson = state.hand.result === null ? null : canonicalJson(state.hand.result);
    const terminal = event.type === "hand_won" || event.type === "hand_ended";
    this.database
      .prepare<
        [string, string, string, string, number, number, number | null, string | null, number]
      >(
        `INSERT INTO hands (
           game_id, branch_id, hand_id, seed, hand_index, started_revision, ended_revision, result_json, practice
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, branch_id, hand_id) DO UPDATE SET
           seed = excluded.seed,
           hand_index = excluded.hand_index,
           started_revision = MIN(hands.started_revision, excluded.started_revision),
           ended_revision = COALESCE(excluded.ended_revision, hands.ended_revision),
           result_json = COALESCE(excluded.result_json, hands.result_json),
           practice = excluded.practice`,
      )
      .run(
        key.gameId,
        key.branchId,
        state.hand.id,
        state.hand.seed,
        state.match.handIndex,
        state.revision,
        terminal ? state.revision : null,
        resultJson,
        practice ? 1 : 0,
      );
  }

  private loadGameAtRevisionInternal(key: GameKey, revision: number): LoadedGame {
    const branch = this.requireBranchInternal(key);
    const firstVisibleRevision = branch.parentKey === null ? 1 : branch.forkRevision + 1;
    if (revision > branch.currentRevision || revision < firstVisibleRevision) {
      throw new PersistenceValidationError(
        `Revision ${String(revision)} is outside branch ${key.branchId}'s available history`,
      );
    }
    if (revision === branch.currentRevision) {
      this.validateBranchJournalBoundsInternal(branch);
    }
    const game = this.getGameInternal(key.gameId);
    if (game === null) {
      return corruption(`Game ${key.gameId} is missing metadata`);
    }
    const reconstruction = this.reconstructInternal(key, revision);
    if (revision === branch.currentRevision && isTruncatedCompletedMatch(reconstruction.state)) {
      return corruption("Branch head stops before the required match_ended event");
    }
    if (game.sessionConfiguration !== null) {
      requireSessionConfigurationForState(
        game.sessionConfiguration,
        reconstruction.state,
        "Persisted game session configuration",
      );
    }
    return {
      key: { ...key },
      game,
      branch,
      state: reconstruction.state,
      recovery: reconstruction.recovery,
    };
  }

  private lineageInternal(key: GameKey): readonly GameBranchMetadata[] {
    const reverse: GameBranchMetadata[] = [];
    const seen = new Set<string>();
    let current = this.requireBranchInternal(key);
    const appendToLineage = (branch: GameBranchMetadata): void => {
      const identifier = `${branch.key.gameId}\u0000${branch.key.branchId}`;
      if (seen.has(identifier) || reverse.length >= MAX_BRANCH_DEPTH) {
        return corruption("Game branch lineage is cyclic or too deep");
      }
      seen.add(identifier);
      reverse.push(branch);
    };
    appendToLineage(current);
    while (current.parentKey !== null) {
      current =
        this.getBranchInternal(current.parentKey) ??
        corruption(`Branch ${current.key.branchId} has a missing parent`);
      appendToLineage(current);
    }
    const lineage = reverse.reverse();
    const root = lineage[0];
    if (root?.key.branchId !== MAIN_BRANCH_ID || root.parentKey !== null) {
      return corruption("Game branch lineage does not begin at main");
    }
    return lineage;
  }

  private collectHistoryInternal(key: GameKey, targetRevision: number): GameHistory {
    const branch = this.requireBranchInternal(key);
    if (
      !Number.isSafeInteger(targetRevision) ||
      targetRevision < Math.max(1, branch.forkRevision) ||
      targetRevision > branch.currentRevision
    ) {
      throw new PersistenceValidationError(
        "Requested replay revision is outside the branch history",
      );
    }
    const game = this.getGameInternal(key.gameId);
    if (game === null) {
      return corruption(`Game ${key.gameId} is missing metadata`);
    }
    const lineage = this.lineageInternal(key);
    const events: StoredGameEvent[] = [];
    const stateHashByRevision = new Map<number, string>();
    const chainHashByRevision = new Map<number, string>();
    const segments: HistorySegment[] = [];

    for (const [index, segmentBranch] of lineage.entries()) {
      const child = lineage[index + 1];
      const startRevision = segmentBranch.parentKey === null ? 0 : segmentBranch.forkRevision;
      const endRevision = child === undefined ? targetRevision : child.forkRevision;
      if (endRevision < startRevision || endRevision > segmentBranch.currentRevision) {
        return corruption("Game branch lineage has an invalid revision boundary");
      }
      let previousChainHash: string;
      if (startRevision === 0) {
        const expectedRoot = rootChainHash(key.gameId);
        if (segmentBranch.forkEventChainHash !== expectedRoot) {
          return corruption("Main branch has an invalid event chain root");
        }
        previousChainHash = expectedRoot;
      } else {
        const parentStateHash = stateHashByRevision.get(startRevision);
        const parentChainHash = chainHashByRevision.get(startRevision);
        if (
          parentStateHash !== segmentBranch.forkStateHash ||
          parentChainHash !== segmentBranch.forkEventChainHash
        ) {
          return corruption(`Branch ${segmentBranch.key.branchId} has a mismatched fork state`);
        }
        previousChainHash = segmentBranch.forkEventChainHash;
      }

      const rows = this.database
        .prepare<[string, string, number, number], EventRow>(
          `SELECT game_id, branch_id, revision, event_id, request_id, event_type, visibility,
                  event_json, event_hash, state_hash, event_chain_hash, created_at
           FROM game_events
           WHERE game_id = ? AND branch_id = ? AND revision > ? AND revision <= ?
           ORDER BY revision`,
        )
        .all(segmentBranch.key.gameId, segmentBranch.key.branchId, startRevision, endRevision);
      if (rows.length !== endRevision - startRevision) {
        return corruption(`Branch ${segmentBranch.key.branchId} has a gap in its event journal`);
      }
      let expectedRevision = startRevision + 1;
      for (const row of rows) {
        const event = rowToStoredEvent(row);
        if (
          event.key.gameId !== segmentBranch.key.gameId ||
          event.key.branchId !== segmentBranch.key.branchId ||
          event.revision !== expectedRevision
        ) {
          return corruption("Stored event does not match its branch position");
        }
        const expectedChainHash = nextChainHash(
          event.key,
          previousChainHash,
          event.revision,
          event.eventHash,
          event.stateHash,
        );
        if (event.eventChainHash !== expectedChainHash) {
          return corruption(`Event ${event.event.id} has a mismatched chain hash`);
        }
        events.push(event);
        stateHashByRevision.set(event.revision, event.stateHash);
        chainHashByRevision.set(event.revision, event.eventChainHash);
        previousChainHash = event.eventChainHash;
        expectedRevision += 1;
      }
      segments.push({ branch: segmentBranch, startRevision, endRevision });
    }

    if (events.length !== targetRevision) {
      return corruption("Visible branch history does not start at revision one");
    }
    if (targetRevision === branch.currentRevision) {
      const stateHash = stateHashByRevision.get(targetRevision);
      const chainHash = chainHashByRevision.get(targetRevision);
      if (stateHash !== branch.stateHash || chainHash !== branch.eventChainHash) {
        return corruption("Branch terminal metadata does not match its event journal");
      }
    }
    return {
      game,
      branch,
      targetRevision,
      events,
      stateHashByRevision,
      chainHashByRevision,
      segments,
    };
  }

  private snapshotRowsForHistoryInternal(history: GameHistory): readonly SnapshotRow[] {
    const candidates: { row: SnapshotRow; segmentIndex: number }[] = [];
    for (const [segmentIndex, segment] of history.segments.entries()) {
      const minimumRevision = segment.startRevision + 1;
      if (minimumRevision > segment.endRevision) {
        continue;
      }
      const rows = this.database
        .prepare<[string, string, number, number], SnapshotRow>(
          `SELECT game_id, branch_id, revision, state_json, state_hash, snapshot_hash,
                  event_chain_hash, created_at
           FROM game_snapshots
           WHERE game_id = ? AND branch_id = ? AND revision >= ? AND revision <= ?`,
        )
        .all(
          segment.branch.key.gameId,
          segment.branch.key.branchId,
          minimumRevision,
          segment.endRevision,
        );
      for (const row of rows) {
        candidates.push({ row, segmentIndex });
      }
    }
    candidates.sort(
      (left, right) =>
        right.row.revision - left.row.revision || right.segmentIndex - left.segmentIndex,
    );
    return candidates.map(({ row }) => row);
  }

  private reconstructInternal(key: GameKey, targetRevision: number): Reconstruction {
    const history = this.collectHistoryInternal(key, targetRevision);
    let state: GameState | undefined;
    let usedSnapshotRevision: number | null = null;
    const skippedCorruptSnapshotRows: SnapshotRow[] = [];
    const skippedCorruptSnapshotRevisions: number[] = [];
    for (const row of this.snapshotRowsForHistoryInternal(history)) {
      try {
        const snapshot = rowToSnapshot(row);
        const expectedStateHash = history.stateHashByRevision.get(snapshot.revision);
        const expectedChainHash = history.chainHashByRevision.get(snapshot.revision);
        if (
          expectedStateHash !== snapshot.stateHash ||
          expectedChainHash !== snapshot.eventChainHash ||
          snapshot.key.gameId !== key.gameId
        ) {
          throw new PersistenceCorruptionError(
            "Snapshot does not match its event stream checkpoint",
          );
        }
        if (state === undefined) {
          state = snapshot.state;
          usedSnapshotRevision = snapshot.revision;
        }
      } catch (caught) {
        if (!(caught instanceof PersistenceCorruptionError)) {
          throw caught;
        }
        skippedCorruptSnapshotRows.push(row);
        skippedCorruptSnapshotRevisions.push(dbInteger(row.revision, "Snapshot revision", 1));
      }
    }

    for (const event of history.events) {
      if (usedSnapshotRevision !== null && event.revision <= usedSnapshotRevision) {
        continue;
      }
      state = this.reduceStoredEventInternal(state, event);
    }
    if (state === undefined) {
      return corruption("Replay could not reconstruct a game state");
    }
    this.assertReconstructionTerminalInternal(history, state);
    for (const row of skippedCorruptSnapshotRows) {
      const removed = this.database
        .prepare<[string, string, number]>(
          `DELETE FROM game_snapshots
           WHERE game_id = ? AND branch_id = ? AND revision = ?`,
        )
        .run(
          dbString(row.game_id, "Snapshot game ID"),
          dbString(row.branch_id, "Snapshot branch ID"),
          dbInteger(row.revision, "Snapshot revision", 1),
        );
      if (removed.changes !== 1) {
        return corruption("Corrupt snapshot could not be removed after successful recovery");
      }
    }
    return {
      state,
      recovery: { usedSnapshotRevision, skippedCorruptSnapshotRevisions },
    };
  }

  private replayHistoryInternal(history: GameHistory): GameState {
    let state: GameState | undefined;
    for (const event of history.events) {
      state = this.reduceStoredEventInternal(state, event);
    }
    if (state === undefined) {
      return corruption("Replay could not reconstruct a game state");
    }
    this.assertReconstructionTerminalInternal(history, state);
    return state;
  }

  private reduceStoredEventInternal(
    current: GameState | undefined,
    storedEvent: StoredGameEvent,
  ): GameState {
    let state: GameState;
    try {
      state = this.reducer(current, storedEvent.event);
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "unknown reducer failure";
      throw new PersistenceCorruptionError(
        `Stored event ${storedEvent.event.id} cannot be replayed: ${reason}`,
      );
    }
    assertStateIntegrity(
      state,
      storedEvent.key.gameId,
      storedEvent.revision,
      storedEvent.stateHash,
      `State after ${storedEvent.event.id}`,
      storedEvent.key.branchId,
    );
    return state;
  }

  private assertReconstructionTerminalInternal(history: GameHistory, state: GameState): void {
    const expectedStateHash = history.stateHashByRevision.get(history.targetRevision);
    const expectedChainHash = history.chainHashByRevision.get(history.targetRevision);
    if (state.stateHash !== expectedStateHash || state.revision !== history.targetRevision) {
      return corruption("Reconstructed state does not match its terminal event hash");
    }
    if (
      (history.branch.parentKey === null || history.targetRevision > history.branch.forkRevision) &&
      (state.branchId !== history.branch.key.branchId ||
        state.practiceBranch !== history.branch.practice)
    ) {
      return corruption("Reconstructed state does not match branch identity");
    }
    if (
      history.targetRevision === history.branch.currentRevision &&
      (history.branch.stateHash !== state.stateHash ||
        history.branch.eventChainHash !== expectedChainHash)
    ) {
      return corruption("Reconstructed state does not match branch metadata");
    }
    try {
      requireHistoricalRulesetDefinition(
        history.game.rulesetDefinition,
        state.ruleset,
        "Reconstructed game historical ruleset definition",
        this.validateRulesetDefinition,
        state.ruleset,
      );
    } catch (caught) {
      const reason =
        caught instanceof Error ? caught.message : "unknown core ruleset projection mismatch";
      return corruption(`Reconstructed game ruleset is corrupt: ${reason}`);
    }
  }

  private forkPracticeBranchInternal(input: ForkPracticeBranchInput): ForkPracticeBranchResult {
    const event: PracticeBranchCreatedEvent = input.event;
    canonicalJsonText(event, "Practice branch event");
    assertGameKey(input.parent);
    if (
      event.gameId !== input.parent.gameId ||
      event.parentBranchId !== input.parent.branchId ||
      event.originDecisionBranchId !== input.parent.branchId ||
      event.branchId === MAIN_BRANCH_ID ||
      event.branchId === input.parent.branchId ||
      event.revision !== event.parentRevision + 1
    ) {
      throw new PersistenceValidationError(
        "Practice branch event has inconsistent branch identity",
      );
    }
    const parent = this.requireBranchInternal(input.parent);
    const game = this.getGameInternal(input.parent.gameId);
    if (game === null) {
      return corruption("Practice branch parent is missing game metadata");
    }
    if (!PRACTICE_BRANCH_MODES.has(game.mode)) {
      throw new PersistenceValidationError(
        "Practice branches are unavailable in competitive or exam games",
      );
    }
    assertInputState(input.state, event.gameId, event.branchId);
    if (
      event.parentRevision > parent.currentRevision ||
      event.parentRevision < Math.max(1, parent.forkRevision)
    ) {
      throw new PersistenceValidationError(
        "Practice fork revision is outside the parent branch history",
      );
    }

    const history = this.collectHistoryInternal(input.parent, event.parentRevision);
    const reconstructed = this.reconstructInternal(input.parent, event.parentRevision);
    if (
      reconstructed.state.stateHash !== event.parentStateHash ||
      reconstructed.state.lastEventId !== event.parentEventId
    ) {
      throw new PersistenceValidationError(
        "Practice branch event does not match its parent checkpoint",
      );
    }
    const forkEventChainHash = history.chainHashByRevision.get(event.parentRevision);
    if (forkEventChainHash === undefined) {
      return corruption("Practice fork has no event chain checkpoint");
    }
    const originRow = this.database
      .prepare<[string, string, string], DecisionRow>(
        `SELECT decision_id, game_id, branch_id, learner_id, hand_id, revision, player_id,
                request_id, action_id, independent, quality, analysis_version, weighting_version,
                data_json, created_at
         FROM decisions
         WHERE decision_id = ? AND game_id = ? AND branch_id = ?`,
      )
      .get(event.originDecisionId, input.parent.gameId, input.parent.branchId);
    if (originRow === undefined) {
      throw new PersistenceValidationError(
        "Practice branch origin decision does not exist on its parent branch",
      );
    }
    const originDecision = this.rowToDecision(originRow);
    if (
      originDecision.revision !== event.parentRevision ||
      originDecision.playerId !== event.requestedByPlayerId ||
      (originDecision.learnerId !== null && originDecision.learnerId !== game.learnerId)
    ) {
      throw new PersistenceValidationError(
        "Practice branch event does not match its origin decision",
      );
    }

    const key: GameKey = { gameId: event.gameId, branchId: event.branchId };
    const commandHash = commandHashFor(event.requestId, [event], input.state.stateHash);
    const existingReceipt = this.getReceiptInternal(input.parent, event.requestId);
    if (existingReceipt !== null) {
      if (
        existingReceipt.commandHash !== commandHash ||
        existingReceipt.resultKey.gameId !== key.gameId ||
        existingReceipt.resultKey.branchId !== key.branchId
      ) {
        throw new PersistenceConflictError(
          "Practice branch request ID was reused with different data",
        );
      }
      const existing = this.requireBranchInternal(key);
      if (existing.currentRevision < existingReceipt.endRevision) {
        return corruption("Practice branch receipt extends past the child head");
      }
      const recorded = this.reconstructInternal(key, existingReceipt.endRevision).state;
      if (recorded.stateHash !== existingReceipt.stateHash) {
        return corruption("Practice branch receipt does not match its recorded child state");
      }
      return { branch: existing, disposition: "idempotent" };
    }
    if (this.getBranchInternal(key) !== null) {
      throw new PersistenceConflictError(
        "Practice branch already exists without its source receipt",
      );
    }

    let reduced: GameState;
    try {
      reduced = this.reducer(reconstructed.state, event);
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "unknown fork reducer error";
      throw new PersistenceValidationError(`Practice branch cannot be created: ${reason}`);
    }
    assertInputState(reduced, key.gameId, key.branchId);
    if (canonicalJson(reduced) !== canonicalJson(input.state)) {
      throw new PersistenceConflictError(
        "Practice branch state does not exactly match the core-produced marker state",
      );
    }

    const createdAt = this.now();
    this.database
      .prepare<
        [string, string, string, number, string, string, number, string, number, string, string]
      >(
        `INSERT INTO game_branches (
           game_id, branch_id, parent_branch_id, fork_revision, fork_state_hash, fork_event_chain_hash,
           practice, created_at, current_revision, state_hash, event_chain_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        key.gameId,
        key.branchId,
        input.parent.branchId,
        event.parentRevision,
        event.parentStateHash,
        forkEventChainHash,
        1,
        createdAt,
        event.parentRevision,
        event.parentStateHash,
        forkEventChainHash,
      );
    this.appendAcceptedCommandInternal(
      {
        key,
        requestId: event.requestId,
        events: [event],
        state: input.state,
      },
      input.parent,
    );
    const branch = this.requireBranchInternal(key);
    return { branch, disposition: "created" };
  }

  private rowToConceptMastery(row: MasteryRow): ConceptMasteryRecord {
    const mastery = dbNumber(row.mastery, "Mastery score", 0, 1);
    const confidence = dbNumber(row.confidence, "Mastery confidence", 0, 1);
    const attempts = dbInteger(row.attempts, "Mastery attempts", 0);
    const independentAttempts = dbInteger(
      row.independent_attempts,
      "Mastery independent attempts",
      0,
    );
    const successfulAttempts = dbInteger(row.successful_attempts, "Mastery successes", 0);
    if (independentAttempts > attempts || successfulAttempts > attempts) {
      return corruption("Mastery counters are inconsistent");
    }
    return {
      learnerId: dbString(row.learner_id, "Mastery learner ID"),
      conceptId: dbString(row.concept_id, "Mastery concept ID"),
      mastery,
      confidence,
      attempts,
      independentAttempts,
      successfulAttempts,
      hintWeightedScore: dbNumber(row.hint_weighted_score, "Mastery hint weighted score"),
      algorithmVersion: dbString(row.algorithm_version, "Mastery algorithm version"),
      lastSeenAt: dbNullableString(row.last_seen_at, "Mastery last seen time"),
      nextReviewAt: dbNullableString(row.next_review_at, "Mastery next review time"),
      updatedAt: dbString(row.updated_at, "Mastery update time"),
    };
  }

  private upsertConceptMasteryInternal(input: ConceptMasteryInput): ConceptMasteryRecord {
    requireNonEmptyString(input.learnerId, "Mastery learner ID");
    requireNonEmptyString(input.conceptId, "Mastery concept ID");
    const mastery = requireFiniteNumber(input.mastery, "Mastery score", 0, 1);
    const confidence = requireFiniteNumber(input.confidence, "Mastery confidence", 0, 1);
    const attempts = requireSafeInteger(input.attempts, "Mastery attempts", 0);
    const independentAttempts = requireSafeInteger(
      input.independentAttempts,
      "Mastery independent attempts",
      0,
    );
    const successfulAttempts = requireSafeInteger(input.successfulAttempts, "Mastery successes", 0);
    if (independentAttempts > attempts || successfulAttempts > attempts) {
      throw new PersistenceValidationError("Mastery counters cannot exceed total attempts");
    }
    const hintWeightedScore = requireFiniteNumber(
      input.hintWeightedScore,
      "Mastery hint weighted score",
    );
    const algorithmVersion = requireNonEmptyString(
      input.algorithmVersion,
      "Mastery algorithm version",
    );
    const lastSeenAt = requireOptionalString(input.lastSeenAt, "Mastery last seen time");
    const nextReviewAt = requireOptionalString(input.nextReviewAt, "Mastery next review time");
    const updatedAt = requireOptionalTimestamp(input.updatedAt, this.now());
    this.ensureLearnerInternal(input.learnerId);
    this.database
      .prepare<
        [
          string,
          string,
          number,
          number,
          number,
          number,
          number,
          number,
          string,
          string | null,
          string | null,
          string,
        ]
      >(
        `INSERT INTO concept_mastery (
           learner_id, concept_id, mastery, confidence, attempts, independent_attempts,
           successful_attempts, hint_weighted_score, algorithm_version, last_seen_at, next_review_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (learner_id, concept_id) DO UPDATE SET
           mastery = excluded.mastery,
           confidence = excluded.confidence,
           attempts = excluded.attempts,
           independent_attempts = excluded.independent_attempts,
           successful_attempts = excluded.successful_attempts,
           hint_weighted_score = excluded.hint_weighted_score,
           algorithm_version = excluded.algorithm_version,
           last_seen_at = excluded.last_seen_at,
           next_review_at = excluded.next_review_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.learnerId,
        input.conceptId,
        mastery,
        confidence,
        attempts,
        independentAttempts,
        successfulAttempts,
        hintWeightedScore,
        algorithmVersion,
        lastSeenAt,
        nextReviewAt,
        updatedAt,
      );
    return {
      learnerId: input.learnerId,
      conceptId: input.conceptId,
      mastery,
      confidence,
      attempts,
      independentAttempts,
      successfulAttempts,
      hintWeightedScore,
      algorithmVersion,
      lastSeenAt,
      nextReviewAt,
      updatedAt,
    };
  }

  private recordDecisionInternal(input: DecisionRecordInput): DecisionRecord {
    requireNonEmptyString(input.id, "Decision ID");
    assertGameKey(input.key);
    const branch = this.requireBranchInternal(input.key);
    const learnerId = requireOptionalString(input.learnerId, "Decision learner ID");
    if (learnerId !== null) {
      this.ensureLearnerInternal(learnerId);
    }
    const handId = requireNonEmptyString(input.handId, "Decision hand ID");
    const revision = requireSafeInteger(input.revision, "Decision revision", 1);
    const playerId = requireNonEmptyString(input.playerId, "Decision player ID");
    const requestId = requireOptionalString(input.requestId, "Decision request ID");
    const actionId = requireNonEmptyString(input.actionId, "Decision action ID");
    const independent = requireBoolean(input.independent, "Decision independent flag");
    const quality =
      input.quality === null ? null : requireFiniteNumber(input.quality, "Decision quality");
    const analysisVersion = requireNonEmptyString(
      input.analysisVersion,
      "Decision analysis version",
    );
    const weightingVersion = requireNonEmptyString(
      input.weightingVersion,
      "Decision weighting version",
    );
    const data = requireJsonObject(input.data, "Decision data");
    const createdAt = requireOptionalTimestamp(input.createdAt, this.now());
    const firstVisibleRevision = branch.parentKey === null ? 1 : branch.forkRevision + 1;
    if (revision < firstVisibleRevision || revision > branch.currentRevision) {
      throw new PersistenceValidationError("Decision revision is outside the branch history");
    }
    const state = this.reconstructInternal(input.key, revision).state;
    if (state.hand.id !== handId || state.players[playerId] === undefined) {
      throw new PersistenceValidationError("Decision does not match the persisted hand or player");
    }
    const game = this.getGameInternal(input.key.gameId);
    if (game === null) {
      return corruption("Decision branch has no persisted game metadata");
    }
    if (game.learnerId !== null && learnerId !== game.learnerId) {
      throw new PersistenceValidationError(
        "A decision learner must own the persisted game that produced it",
      );
    }
    const legalAction = this.legalActions(state, playerId, game.rulesetDefinition).find(
      ({ id }) => id === actionId,
    );
    if (legalAction === undefined) {
      throw new PersistenceValidationError(
        "Decision action was not emitted for the persisted player and revision",
      );
    }
    if (requestId !== null) {
      this.assertDecisionMatchesAcceptedCommandInternal(input, legalAction, requestId);
    }
    this.database
      .prepare<
        [
          string,
          string,
          string,
          string | null,
          string,
          number,
          string,
          string | null,
          string,
          number,
          number | null,
          string,
          string,
          string,
          string,
        ]
      >(
        `INSERT INTO decisions (
           decision_id, game_id, branch_id, learner_id, hand_id, revision, player_id, request_id,
           action_id, independent, quality, analysis_version, weighting_version, data_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.key.gameId,
        input.key.branchId,
        learnerId,
        handId,
        revision,
        playerId,
        requestId,
        actionId,
        independent ? 1 : 0,
        quality,
        analysisVersion,
        weightingVersion,
        canonicalJson(data),
        createdAt,
      );
    return {
      id: input.id,
      key: { ...input.key },
      learnerId,
      handId,
      revision,
      playerId,
      requestId,
      actionId,
      independent,
      quality,
      analysisVersion,
      weightingVersion,
      data,
      createdAt,
    };
  }

  /**
   * A request ID is the durable bridge between a learner's pre-action analysis and the command
   * that was actually accepted.  Merely finding another event with the same request ID is not
   * enough: the selected action, player, and revision must agree with the emitted event batch.
   */
  private assertDecisionMatchesAcceptedCommandInternal(
    input: DecisionRecordInput,
    action: LegalAction,
    requestId: string,
  ): void {
    const events = this.database
      .prepare<[string, string, string], EventRow>(
        `SELECT game_id, branch_id, revision, event_id, request_id, event_type, visibility,
                event_json, event_hash, state_hash, event_chain_hash, created_at
         FROM game_events
         WHERE game_id = ? AND branch_id = ? AND request_id = ?
         ORDER BY revision`,
      )
      .all(input.key.gameId, input.key.branchId, requestId)
      .map(rowToStoredEvent);
    if (events.length === 0) {
      throw new PersistenceValidationError("Decision request ID has no persisted branch event");
    }
    if (events[0]?.revision !== input.revision + 1) {
      throw new PersistenceValidationError(
        "Decision request does not immediately follow the analyzed revision",
      );
    }
    const matches = events.some(({ event }) => {
      switch (event.type) {
        case "tile_discarded":
          return (
            action.type === "discard" &&
            event.playerId === input.playerId &&
            event.tileId === action.tileId
          );
        case "claim_response_recorded":
          return event.playerId === input.playerId && event.action.id === action.id;
        case "hand_won":
          return event.winners.some(
            (winner) =>
              winner.playerId === input.playerId &&
              ((action.type === "declare_win" && winner.source === action.source) ||
                (action.type === "claim_win" && winner.source === action.source)),
          );
        case "kong_completed":
          return (
            (action.type === "declare_concealed_kong" &&
              event.playerId === input.playerId &&
              event.kongKind === "concealed" &&
              canonicalJson(event.tileIds) === canonicalJson(action.tileIds)) ||
            (action.type === "declare_added_kong" &&
              event.playerId === input.playerId &&
              event.kongKind === "added" &&
              event.meldId === action.meldId &&
              event.tileIds.includes(action.tileId))
          );
        case "kong_proposed":
          return (
            (action.type === "declare_concealed_kong" &&
              event.proposerId === input.playerId &&
              event.kongKind === "concealed" &&
              canonicalJson(event.concealedTileIds) === canonicalJson(action.tileIds)) ||
            (action.type === "declare_added_kong" &&
              event.proposerId === input.playerId &&
              event.kongKind === "added" &&
              event.meldId === action.meldId &&
              event.robberyTileId === action.tileId)
          );
        default:
          return false;
      }
    });
    if (!matches) {
      throw new PersistenceValidationError(
        "Decision action does not match the accepted command selected by its request ID",
      );
    }
  }

  private persistAcceptedDecisionEvidenceInternal(
    input: AppendAcceptedCommandInput,
    disposition: AppendAcceptedCommandResult["disposition"],
  ): void {
    const evidence = input.decisionEvidence;
    if (evidence === undefined) {
      return;
    }
    const decisionInput: DecisionRecordInput = {
      ...evidence.decision,
      key: { ...input.key },
      requestId: input.requestId,
    };
    const facts: AnalysisFactRecordInput[] = evidence.analysisFacts.map((fact) => ({
      ...fact,
      decisionId: evidence.decision.id,
    }));
    if (disposition === "appended") {
      this.recordDecisionInternal(decisionInput);
      this.recordAnalysisFactsInternal(facts);
      return;
    }
    this.assertAcceptedDecisionEvidenceMatchesInternal(decisionInput, facts);
  }

  private assertAcceptedDecisionEvidenceMatchesInternal(
    decisionInput: DecisionRecordInput,
    facts: readonly AnalysisFactRecordInput[],
  ): void {
    const existing = this.getDecisionInternal(
      requireNonEmptyString(decisionInput.id, "Accepted decision ID"),
    );
    if (existing === null) {
      return corruption("Accepted command receipt is missing its atomic decision evidence");
    }
    const expectedDecision: DecisionRecord = {
      id: decisionInput.id,
      key: {
        gameId: requireNonEmptyString(decisionInput.key.gameId, "Accepted decision game ID"),
        branchId: requireNonEmptyString(decisionInput.key.branchId, "Accepted decision branch ID"),
      },
      learnerId: requireOptionalString(decisionInput.learnerId, "Accepted decision learner ID"),
      handId: requireNonEmptyString(decisionInput.handId, "Accepted decision hand ID"),
      revision: requireSafeInteger(decisionInput.revision, "Accepted decision revision", 1),
      playerId: requireNonEmptyString(decisionInput.playerId, "Accepted decision player ID"),
      requestId: requireOptionalString(decisionInput.requestId, "Accepted decision request ID"),
      actionId: requireNonEmptyString(decisionInput.actionId, "Accepted decision action ID"),
      independent: requireBoolean(decisionInput.independent, "Accepted decision independent flag"),
      quality:
        decisionInput.quality === null
          ? null
          : requireFiniteNumber(decisionInput.quality, "Accepted decision quality"),
      analysisVersion: requireNonEmptyString(
        decisionInput.analysisVersion,
        "Accepted decision analysis version",
      ),
      weightingVersion: requireNonEmptyString(
        decisionInput.weightingVersion,
        "Accepted decision weighting version",
      ),
      data: requireJsonObject(decisionInput.data, "Accepted decision data"),
      createdAt:
        decisionInput.createdAt === undefined
          ? existing.createdAt
          : requireNonEmptyString(decisionInput.createdAt, "Accepted decision creation time"),
    };
    if (canonicalJson(existing) !== canonicalJson(expectedDecision)) {
      throw new PersistenceConflictError(
        "Accepted command was already recorded with different decision evidence",
      );
    }
    for (const factInput of facts) {
      const factId = requireNonEmptyString(factInput.id, "Accepted analysis fact ID");
      const row = this.database
        .prepare<[string], FactRow>(
          `SELECT fact_id, decision_id, kind, summary, data_json, created_at
           FROM analysis_facts
           WHERE fact_id = ?`,
        )
        .get(factId);
      if (row === undefined) {
        return corruption("Accepted command receipt is missing atomic analysis evidence");
      }
      const actual = this.rowToFact(row);
      const expected: AnalysisFactRecord = {
        id: factId,
        decisionId: requireNonEmptyString(
          factInput.decisionId,
          "Accepted analysis fact decision ID",
        ),
        kind: requireNonEmptyString(factInput.kind, "Accepted analysis fact kind"),
        summary: requireNonEmptyString(factInput.summary, "Accepted analysis fact summary"),
        data: requireJsonObject(factInput.data, "Accepted analysis fact data"),
        createdAt:
          factInput.createdAt === undefined
            ? actual.createdAt
            : requireNonEmptyString(factInput.createdAt, "Accepted analysis fact creation time"),
      };
      if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new PersistenceConflictError(
          "Accepted command was already recorded with different analysis evidence",
        );
      }
    }
  }

  private recordAnalysisFactsInternal(
    input: readonly AnalysisFactRecordInput[],
  ): readonly AnalysisFactRecord[] {
    const records: AnalysisFactRecord[] = [];
    for (const fact of input) {
      requireNonEmptyString(fact.id, "Analysis fact ID");
      requireNonEmptyString(fact.decisionId, "Analysis fact decision ID");
      const kind = requireNonEmptyString(fact.kind, "Analysis fact kind");
      const summary = requireNonEmptyString(fact.summary, "Analysis fact summary");
      const data = requireJsonObject(fact.data, "Analysis fact data");
      const createdAt = requireOptionalTimestamp(fact.createdAt, this.now());
      this.database
        .prepare<[string, string, string, string, string, string]>(
          `INSERT INTO analysis_facts (fact_id, decision_id, kind, summary, data_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(fact.id, fact.decisionId, kind, summary, canonicalJson(data), createdAt);
      records.push({
        id: fact.id,
        decisionId: fact.decisionId,
        kind,
        summary,
        data,
        createdAt,
      });
    }
    return records;
  }

  private recordHintInternal(input: HintRecordInput): HintRecord {
    requireNonEmptyString(input.id, "Hint ID");
    requireNonEmptyString(input.learnerId, "Hint learner ID");
    const decisionId = requireOptionalString(input.decisionId, "Hint decision ID");
    const level = requireSafeInteger(input.level, "Hint level", 1);
    if (level > 3) {
      throw new PersistenceValidationError("Hint level must be from 1 through 3");
    }
    const data = requireJsonObject(input.data, "Hint data");
    const createdAt = requireOptionalTimestamp(input.createdAt, this.now());
    this.ensureLearnerInternal(input.learnerId);
    if (decisionId !== null) {
      const decision = this.getDecisionInternal(decisionId);
      if (decision?.learnerId !== input.learnerId) {
        throw new PersistenceValidationError("A linked hint must belong to the decision's learner");
      }
    }
    this.database
      .prepare<[string, string, string | null, number, string, string]>(
        `INSERT INTO hints (hint_id, learner_id, decision_id, level, data_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.id, input.learnerId, decisionId, level, canonicalJson(data), createdAt);
    return {
      id: input.id,
      learnerId: input.learnerId,
      decisionId,
      level: level as 1 | 2 | 3,
      data,
      createdAt,
    };
  }

  private recordReviewInternal(input: ReviewRecordInput): ReviewRecord {
    requireNonEmptyString(input.id, "Review ID");
    requireNonEmptyString(input.learnerId, "Review learner ID");
    assertGameKey(input.key);
    this.requireBranchInternal(input.key);
    const game = this.getGameInternal(input.key.gameId);
    if (game === null) {
      return corruption("Review branch has no persisted game metadata");
    }
    if (game.learnerId !== null && game.learnerId !== input.learnerId) {
      throw new PersistenceValidationError(
        "A review learner must own the persisted game that produced it",
      );
    }
    const handId = requireNonEmptyString(input.handId, "Review hand ID");
    const hand = this.requireHandRecordInternal(input.key, handId);
    if (hand.endedRevision === null) {
      throw new PersistenceValidationError("A review requires a completed persisted hand");
    }
    const data = requireJsonObject(input.data, "Review data");
    const createdAt = requireOptionalTimestamp(input.createdAt, this.now());
    this.ensureLearnerInternal(input.learnerId);
    this.database
      .prepare<[string, string, string, string, string, string, string]>(
        `INSERT INTO reviews (review_id, learner_id, game_id, branch_id, hand_id, data_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.learnerId,
        input.key.gameId,
        input.key.branchId,
        handId,
        canonicalJson(data),
        createdAt,
      );
    return {
      id: input.id,
      learnerId: input.learnerId,
      key: { ...input.key },
      handId,
      data,
      createdAt,
    };
  }

  private saveDrillItemInternal(input: DrillItemRecordInput): DrillItemRecord {
    requireNonEmptyString(input.id, "Drill item ID");
    requireNonEmptyString(input.learnerId, "Drill learner ID");
    if (!DRILL_SOURCES.has(input.source)) {
      throw new PersistenceValidationError("Drill source is invalid");
    }
    const conceptIds = this.requireStringArrayInput(input.conceptIds, "Drill concept IDs");
    const difficulty = requireFiniteNumber(input.difficulty, "Drill difficulty");
    const data = requireJsonObject(input.data, "Drill data");
    const createdAt = requireOptionalTimestamp(input.createdAt, this.now());
    const existingOwner = this.database
      .prepare<[string], { learner_id: string }>(
        "SELECT learner_id FROM drill_items WHERE drill_item_id = ?",
      )
      .get(input.id);
    if (
      existingOwner !== undefined &&
      dbString(existingOwner.learner_id, "Drill item learner ID") !== input.learnerId
    ) {
      throw new PersistenceValidationError("A drill item's learner is immutable");
    }
    this.ensureLearnerInternal(input.learnerId);
    this.database
      .prepare<[string, string, string, string, number, string, string]>(
        `INSERT INTO drill_items (
           drill_item_id, learner_id, source, concept_ids_json, difficulty, data_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (drill_item_id) DO UPDATE SET
           source = excluded.source,
           concept_ids_json = excluded.concept_ids_json,
           difficulty = excluded.difficulty,
           data_json = excluded.data_json`,
      )
      .run(
        input.id,
        input.learnerId,
        input.source,
        canonicalJson(conceptIds),
        difficulty,
        canonicalJson(data),
        createdAt,
      );
    return {
      id: input.id,
      learnerId: input.learnerId,
      source: input.source,
      conceptIds,
      difficulty,
      data,
      createdAt,
    };
  }

  private recordDrillAttemptInternal(input: DrillAttemptRecordInput): DrillAttemptRecord {
    requireNonEmptyString(input.id, "Drill attempt ID");
    requireNonEmptyString(input.drillItemId, "Drill attempt item ID");
    requireNonEmptyString(input.learnerId, "Drill attempt learner ID");
    const correct = requireBoolean(input.correct, "Drill attempt correct flag");
    const hintLevel = requireSafeInteger(input.hintLevel, "Drill attempt hint level", 0);
    if (hintLevel > 3) {
      throw new PersistenceValidationError("Drill attempt hint level must be from 0 through 3");
    }
    const data = requireJsonObject(input.data, "Drill attempt data");
    const createdAt = requireOptionalTimestamp(input.createdAt, this.now());
    this.requireDrillItemOwnerInternal(input.drillItemId, input.learnerId);
    this.ensureLearnerInternal(input.learnerId);
    this.database
      .prepare<[string, string, string, number, number, string, string]>(
        `INSERT INTO drill_attempts (
           drill_attempt_id, drill_item_id, learner_id, correct, hint_level, data_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.drillItemId,
        input.learnerId,
        correct ? 1 : 0,
        hintLevel,
        canonicalJson(data),
        createdAt,
      );
    return {
      id: input.id,
      drillItemId: input.drillItemId,
      learnerId: input.learnerId,
      correct,
      hintLevel: hintLevel as 0 | 1 | 2 | 3,
      data,
      createdAt,
    };
  }

  private saveSpacedRepetitionScheduleInternal(
    input: SpacedRepetitionScheduleInput,
  ): SpacedRepetitionScheduleRecord {
    requireNonEmptyString(input.drillItemId, "Spaced repetition drill item ID");
    requireNonEmptyString(input.learnerId, "Spaced repetition learner ID");
    const nextReviewAt = requireNonEmptyString(
      input.nextReviewAt,
      "Spaced repetition next review time",
    );
    const intervalDays = requireFiniteNumber(input.intervalDays, "Spaced repetition interval", 0);
    const ease = requireFiniteNumber(input.ease, "Spaced repetition ease", Number.MIN_VALUE);
    const updatedAt = requireOptionalTimestamp(input.updatedAt, this.now());
    this.requireDrillItemOwnerInternal(input.drillItemId, input.learnerId);
    this.ensureLearnerInternal(input.learnerId);
    this.database
      .prepare<[string, string, string, number, number, string]>(
        `INSERT INTO spaced_repetition_schedule (
           drill_item_id, learner_id, next_review_at, interval_days, ease, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (drill_item_id) DO UPDATE SET
           learner_id = excluded.learner_id,
           next_review_at = excluded.next_review_at,
           interval_days = excluded.interval_days,
           ease = excluded.ease,
           updated_at = excluded.updated_at`,
      )
      .run(input.drillItemId, input.learnerId, nextReviewAt, intervalDays, ease, updatedAt);
    return {
      drillItemId: input.drillItemId,
      learnerId: input.learnerId,
      nextReviewAt,
      intervalDays,
      ease,
      updatedAt,
    };
  }

  private recordLlmRequestMetadataInternal(input: LlmRequestMetadataInput): LlmRequestMetadata {
    requireNonEmptyString(input.id, "LLM request ID");
    const learnerId = requireOptionalString(input.learnerId, "LLM learner ID");
    const decisionId = requireOptionalString(input.decisionId, "LLM decision ID");
    const provider = requireNonEmptyString(input.provider, "LLM provider");
    const model = requireNonEmptyString(input.model, "LLM model");
    const latencyMs = requireSafeInteger(input.latencyMs, "LLM latency", 0);
    const inputTokens =
      input.inputTokens === undefined
        ? null
        : requireSafeInteger(input.inputTokens, "LLM input token count", 0);
    const outputTokens =
      input.outputTokens === undefined
        ? null
        : requireSafeInteger(input.outputTokens, "LLM output token count", 0);
    const factIds = this.requireStringArrayInput(input.factIds, "LLM fact IDs");
    if (!LLM_STATUSES.has(input.status)) {
      throw new PersistenceValidationError("LLM request status is invalid");
    }
    const errorCode = requireOptionalString(input.errorCode, "LLM error code");
    const createdAt = requireOptionalTimestamp(input.createdAt, this.now());
    this.requireLlmFactScopeInternal(learnerId, decisionId, factIds, "LLM request metadata");
    if (learnerId !== null) {
      this.ensureLearnerInternal(learnerId);
    }
    this.database
      .prepare<
        [
          string,
          string | null,
          string | null,
          string,
          string,
          number,
          number | null,
          number | null,
          string,
          string,
          string | null,
          string,
        ]
      >(
        `INSERT INTO llm_requests (
           llm_request_id, learner_id, decision_id, provider, model, latency_ms, input_tokens,
           output_tokens, fact_ids_json, status, error_code, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        learnerId,
        decisionId,
        provider,
        model,
        latencyMs,
        inputTokens,
        outputTokens,
        canonicalJson(factIds),
        input.status,
        errorCode,
        createdAt,
      );
    return {
      id: input.id,
      learnerId,
      decisionId,
      provider,
      model,
      latencyMs,
      inputTokens,
      outputTokens,
      factIds,
      status: input.status,
      errorCode,
      createdAt,
    };
  }

  private requireStringArrayInput(value: unknown, label: string): readonly string[] {
    if (!Array.isArray(value)) {
      throw new PersistenceValidationError(`${label} must be an array of non-empty strings`);
    }
    const values = value.map((item) => requireNonEmptyString(item, label));
    if (new Set(values).size !== values.length) {
      throw new PersistenceValidationError(`${label} must not contain duplicate IDs`);
    }
    return values;
  }

  private parseImportDocument(input: unknown): PersistenceExport {
    const document = requireJsonObject(input, "Persistence import");
    const rootFields = new Set(["format", "version", "exportedAt", "data"]);
    if (Object.keys(document).some((field) => !rootFields.has(field))) {
      throw new PersistenceValidationError("Persistence import contains unknown top-level fields");
    }
    if (document.format !== PERSISTENCE_EXPORT_FORMAT) {
      throw new PersistenceValidationError("Persistence import format is unsupported");
    }
    if (document.version !== PERSISTENCE_EXPORT_VERSION) {
      throw new PersistenceValidationError("Persistence import version is unsupported");
    }
    const exportedAt = requireNonEmptyString(document.exportedAt, "Persistence import timestamp");
    const data = requireJsonObject(document.data, "Persistence import data");
    const expectedDataFields = new Set<string>(PERSISTENCE_EXPORT_DATA_FIELDS);
    if (Object.keys(data).some((field) => !expectedDataFields.has(field))) {
      throw new PersistenceValidationError("Persistence import data contains unknown fields");
    }
    const records = <T extends (typeof PERSISTENCE_EXPORT_DATA_FIELDS)[number]>(
      field: T,
    ): PersistenceExport["data"][T] => {
      const value: JsonValue | undefined = data[field];
      if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
        throw new PersistenceValidationError(
          `Persistence import ${field} must be an array of objects`,
        );
      }
      return value as PersistenceExport["data"][T];
    };
    return {
      format: PERSISTENCE_EXPORT_FORMAT,
      version: PERSISTENCE_EXPORT_VERSION,
      exportedAt,
      data: {
        learners: records("learners"),
        learnerPreferences: records("learnerPreferences"),
        conceptMastery: records("conceptMastery"),
        games: records("games"),
        branches: records("branches"),
        hands: records("hands"),
        events: records("events"),
        snapshots: records("snapshots"),
        commandReceipts: records("commandReceipts"),
        decisions: records("decisions"),
        analysisFacts: records("analysisFacts"),
        hints: records("hints"),
        reviews: records("reviews"),
        drillItems: records("drillItems"),
        drillAttempts: records("drillAttempts"),
        schedules: records("schedules"),
        llmRequests: records("llmRequests"),
      },
    };
  }

  private importDataInternal(document: PersistenceExport, mode: "merge" | "replace"): ImportResult {
    if (mode === "replace") {
      this.deleteAllDataInternal();
    }
    const { data } = document;

    for (const learner of data.learners) {
      this.database
        .prepare("INSERT INTO learners (learner_id, created_at) VALUES (?, ?)")
        .run(learner.learnerId, learner.createdAt);
    }
    for (const game of data.games) {
      const rulesetDefinition = requireHistoricalRulesetDefinition(
        game.rulesetDefinition,
        {
          id: game.rulesetId,
          version: game.rulesetVersion,
          hash: game.rulesetHash,
        },
        "Imported game historical ruleset definition",
        this.validateRulesetDefinition,
      );
      let sessionConfiguration: GameSessionConfigurationV1 | null = null;
      let sessionConfigurationHash: string | null = null;
      if (game.sessionConfiguration !== null || game.sessionConfigurationHash !== null) {
        if (game.sessionConfiguration === null || game.sessionConfigurationHash === null) {
          throw new PersistenceValidationError(
            "Imported game session configuration metadata is incomplete",
          );
        }
        sessionConfiguration = requireSessionConfiguration(
          game.sessionConfiguration,
          "Imported game session configuration",
        );
        sessionConfigurationHash = requireHash(
          game.sessionConfigurationHash,
          "Imported game session configuration hash",
        );
        if (sessionConfigurationHash !== sessionConfigurationHashFor(sessionConfiguration)) {
          throw new PersistenceValidationError(
            "Imported game session configuration hash does not match its data",
          );
        }
      }
      this.database
        .prepare(
          `INSERT INTO games (
             game_id, learner_id, ruleset_id, ruleset_version, ruleset_hash, ruleset_json,
             session_config_json, session_config_hash, seed, rng_version, mode, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          game.gameId,
          game.learnerId,
          game.rulesetId,
          game.rulesetVersion,
          game.rulesetHash,
          canonicalJsonText(rulesetDefinition, "Imported game historical ruleset definition"),
          sessionConfiguration === null
            ? null
            : canonicalJsonText(sessionConfiguration, "Imported game session configuration"),
          sessionConfigurationHash,
          game.seed,
          game.rngVersion,
          game.mode,
          game.createdAt,
        );
    }

    const remainingBranches = [...data.branches];
    if (
      remainingBranches.some(
        (branch) => branch.parentKey !== null && branch.parentKey.gameId !== branch.key.gameId,
      )
    ) {
      throw new PersistenceValidationError(
        "Persistence import branch parent must belong to the same game",
      );
    }
    while (remainingBranches.length > 0) {
      const nextIndex = remainingBranches.findIndex(
        (branch) => branch.parentKey === null || this.getBranchInternal(branch.parentKey) !== null,
      );
      if (nextIndex < 0) {
        throw new PersistenceValidationError(
          "Persistence import branches are not rooted in an available parent branch",
        );
      }
      const branch = remainingBranches.splice(nextIndex, 1)[0];
      if (branch === undefined) {
        return corruption("Persistence import lost a pending branch");
      }
      this.database
        .prepare(
          `INSERT INTO game_branches (
             game_id, branch_id, parent_branch_id, fork_revision, fork_state_hash, fork_event_chain_hash,
             practice, created_at, activity_order, current_revision, state_hash, event_chain_hash
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          branch.key.gameId,
          branch.key.branchId,
          branch.parentKey?.branchId ?? null,
          branch.forkRevision,
          branch.forkStateHash,
          branch.forkEventChainHash,
          branch.practice ? 1 : 0,
          branch.createdAt,
          branch.activityOrder,
          branch.currentRevision,
          branch.stateHash,
          branch.eventChainHash,
        );
    }
    for (const hand of data.hands) {
      this.database
        .prepare(
          `INSERT INTO hands (
             game_id, branch_id, hand_id, seed, hand_index, started_revision, ended_revision, result_json, practice
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          hand.key.gameId,
          hand.key.branchId,
          hand.handId,
          hand.seed,
          hand.handIndex,
          hand.startedRevision,
          hand.endedRevision,
          hand.result === null ? null : canonicalJsonText(hand.result, "Imported hand result"),
          hand.practice ? 1 : 0,
        );
    }
    for (const stored of data.events) {
      this.database
        .prepare(
          `INSERT INTO game_events (
             game_id, branch_id, revision, event_id, request_id, event_type, visibility, event_json,
             event_hash, state_hash, event_chain_hash, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stored.key.gameId,
          stored.key.branchId,
          stored.revision,
          stored.event.id,
          stored.requestId,
          stored.event.type,
          stored.event.visibility,
          canonicalJsonText(stored.event, "Imported game event"),
          stored.eventHash,
          stored.stateHash,
          stored.eventChainHash,
          stored.createdAt,
        );
    }
    for (const snapshot of data.snapshots) {
      this.database
        .prepare(
          `INSERT INTO game_snapshots (
             game_id, branch_id, revision, state_json, state_hash, snapshot_hash, event_chain_hash, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.key.gameId,
          snapshot.key.branchId,
          snapshot.revision,
          canonicalJsonText(snapshot.state, "Imported game snapshot"),
          snapshot.stateHash,
          snapshot.snapshotHash,
          snapshot.eventChainHash,
          snapshot.createdAt,
        );
    }
    for (const receipt of data.commandReceipts) {
      this.database
        .prepare(
          `INSERT INTO command_receipts (
             game_id, branch_id, result_branch_id, request_id, command_hash,
             start_revision, end_revision, state_hash, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          receipt.key.gameId,
          receipt.key.branchId,
          receipt.resultKey.branchId,
          receipt.requestId,
          receipt.commandHash,
          receipt.startRevision,
          receipt.endRevision,
          receipt.stateHash,
          receipt.createdAt,
        );
    }
    for (const preference of data.learnerPreferences) {
      this.database
        .prepare(
          `INSERT INTO learner_preferences (learner_id, preferences_json, updated_at)
           VALUES (?, ?, ?)`,
        )
        .run(
          preference.learnerId,
          canonicalJsonText(preference.preferences, "Imported learner preferences"),
          preference.updatedAt,
        );
    }
    for (const mastery of data.conceptMastery) {
      this.database
        .prepare(
          `INSERT INTO concept_mastery (
             learner_id, concept_id, mastery, confidence, attempts, independent_attempts,
             successful_attempts, hint_weighted_score, algorithm_version, last_seen_at,
             next_review_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          mastery.learnerId,
          mastery.conceptId,
          mastery.mastery,
          mastery.confidence,
          mastery.attempts,
          mastery.independentAttempts,
          mastery.successfulAttempts,
          mastery.hintWeightedScore,
          mastery.algorithmVersion,
          mastery.lastSeenAt,
          mastery.nextReviewAt,
          mastery.updatedAt,
        );
    }
    for (const decision of data.decisions) {
      this.database
        .prepare(
          `INSERT INTO decisions (
             decision_id, game_id, branch_id, learner_id, hand_id, revision, player_id, request_id,
             action_id, independent, quality, analysis_version, weighting_version, data_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          decision.id,
          decision.key.gameId,
          decision.key.branchId,
          decision.learnerId,
          decision.handId,
          decision.revision,
          decision.playerId,
          decision.requestId,
          decision.actionId,
          decision.independent ? 1 : 0,
          decision.quality,
          decision.analysisVersion,
          decision.weightingVersion,
          canonicalJsonText(decision.data, "Imported decision data"),
          decision.createdAt,
        );
    }
    for (const fact of data.analysisFacts) {
      this.database
        .prepare(
          `INSERT INTO analysis_facts (fact_id, decision_id, kind, summary, data_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          fact.id,
          fact.decisionId,
          fact.kind,
          fact.summary,
          canonicalJsonText(fact.data, "Imported analysis fact data"),
          fact.createdAt,
        );
    }
    for (const hint of data.hints) {
      this.database
        .prepare(
          `INSERT INTO hints (hint_id, learner_id, decision_id, level, data_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          hint.id,
          hint.learnerId,
          hint.decisionId,
          hint.level,
          canonicalJsonText(hint.data, "Imported hint data"),
          hint.createdAt,
        );
    }
    for (const review of data.reviews) {
      this.database
        .prepare(
          `INSERT INTO reviews (review_id, learner_id, game_id, branch_id, hand_id, data_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          review.id,
          review.learnerId,
          review.key.gameId,
          review.key.branchId,
          review.handId,
          canonicalJsonText(review.data, "Imported review data"),
          review.createdAt,
        );
    }
    for (const drill of data.drillItems) {
      this.database
        .prepare(
          `INSERT INTO drill_items (
             drill_item_id, learner_id, source, concept_ids_json, difficulty, data_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          drill.id,
          drill.learnerId,
          drill.source,
          canonicalJsonText(drill.conceptIds, "Imported drill concepts"),
          drill.difficulty,
          canonicalJsonText(drill.data, "Imported drill data"),
          drill.createdAt,
        );
    }
    for (const attempt of data.drillAttempts) {
      this.database
        .prepare(
          `INSERT INTO drill_attempts (
             drill_attempt_id, drill_item_id, learner_id, correct, hint_level, data_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          attempt.id,
          attempt.drillItemId,
          attempt.learnerId,
          attempt.correct ? 1 : 0,
          attempt.hintLevel,
          canonicalJsonText(attempt.data, "Imported drill attempt data"),
          attempt.createdAt,
        );
    }
    for (const schedule of data.schedules) {
      this.database
        .prepare(
          `INSERT INTO spaced_repetition_schedule (
             drill_item_id, learner_id, next_review_at, interval_days, ease, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          schedule.drillItemId,
          schedule.learnerId,
          schedule.nextReviewAt,
          schedule.intervalDays,
          schedule.ease,
          schedule.updatedAt,
        );
    }
    for (const request of data.llmRequests) {
      this.database
        .prepare(
          `INSERT INTO llm_requests (
             llm_request_id, learner_id, decision_id, provider, model, latency_ms, input_tokens,
             output_tokens, fact_ids_json, status, error_code, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          request.id,
          request.learnerId,
          request.decisionId,
          request.provider,
          request.model,
          request.latencyMs,
          request.inputTokens,
          request.outputTokens,
          canonicalJsonText(request.factIds, "Imported LLM fact IDs"),
          request.status,
          request.errorCode,
          request.createdAt,
        );
    }

    this.validateAllBranchesInternal();
    const roundTripped = this.exportDataInternal(true);
    this.assertImportedDataCanonicalInternal(data, roundTripped.data);
    return {
      mode,
      importedGames: data.games.length,
      importedBranches: data.branches.length,
    };
  }

  private deleteAllDataInternal(): void {
    this.database.exec("DELETE FROM llm_requests; DELETE FROM games; DELETE FROM learners;");
  }

  private assertImportedDataCanonicalInternal(
    imported: PersistenceExportData,
    persisted: PersistenceExportData,
  ): void {
    for (const field of PERSISTENCE_EXPORT_DATA_FIELDS) {
      const remaining = new Map<string, number>();
      for (const record of persisted[field]) {
        const canonical = canonicalJsonText(record, `Persisted ${field} record`);
        remaining.set(canonical, (remaining.get(canonical) ?? 0) + 1);
      }
      for (const record of imported[field]) {
        const canonical = canonicalJsonText(record, `Imported ${field} record`);
        const count = remaining.get(canonical) ?? 0;
        if (count < 1) {
          throw new PersistenceValidationError(
            `Persistence import ${field} contains a non-canonical record`,
          );
        }
        if (count === 1) {
          remaining.delete(canonical);
        } else {
          remaining.set(canonical, count - 1);
        }
      }
    }
  }

  private exportDataInternal(includeLlmMetadata: boolean): PersistenceExport {
    for (const branch of this.allBranchesInternal()) {
      this.reconstructInternal(branch.key, branch.currentRevision);
    }
    this.validateAllBranchesInternal();
    this.validateDerivedSemanticsInternal();
    const learners = this.database
      .prepare<[], LearnerRow>("SELECT learner_id, created_at FROM learners ORDER BY learner_id")
      .all()
      .map((row) => ({
        learnerId: dbString(row.learner_id, "Export learner ID"),
        createdAt: dbString(row.created_at, "Export learner creation time"),
      }));
    const learnerPreferences = this.database
      .prepare<[], LearnerPreferencesRow>(
        "SELECT learner_id, preferences_json, updated_at FROM learner_preferences ORDER BY learner_id",
      )
      .all()
      .map((row) => ({
        learnerId: dbString(row.learner_id, "Export preference learner ID"),
        preferences: asJsonObjectFromStored(row.preferences_json, "Export preferences"),
        updatedAt: dbString(row.updated_at, "Export preference update time"),
      }));
    const conceptMastery = this.database
      .prepare<[], MasteryRow>(
        `SELECT learner_id, concept_id, mastery, confidence, attempts, independent_attempts,
                successful_attempts, hint_weighted_score, algorithm_version, last_seen_at,
                next_review_at, updated_at
         FROM concept_mastery ORDER BY learner_id, concept_id`,
      )
      .all()
      .map((row) => this.rowToConceptMastery(row));
    const games = this.database
      .prepare<[], GameRow>(
        `SELECT game_id, learner_id, ruleset_id, ruleset_version, ruleset_hash, ruleset_json,
                session_config_json, session_config_hash, seed, rng_version, mode, created_at
         FROM games ORDER BY game_id`,
      )
      .all()
      .map((row) => rowToGameMetadata(row, this.validateRulesetDefinition));
    const branches = this.allBranchesInternal();
    const hands = this.database
      .prepare<[], HandRow>(
        `SELECT game_id, branch_id, hand_id, seed, hand_index, started_revision, ended_revision,
                result_json, practice
         FROM hands ORDER BY game_id, branch_id, hand_index`,
      )
      .all()
      .map((row) => this.rowToHand(row));
    const events = this.database
      .prepare<[], EventRow>(
        `SELECT game_id, branch_id, revision, event_id, request_id, event_type, visibility,
                event_json, event_hash, state_hash, event_chain_hash, created_at
         FROM game_events ORDER BY game_id, branch_id, revision`,
      )
      .all()
      .map(rowToStoredEvent);
    const snapshots = this.database
      .prepare<[], SnapshotRow>(
        `SELECT game_id, branch_id, revision, state_json, state_hash, snapshot_hash,
                event_chain_hash, created_at
         FROM game_snapshots ORDER BY game_id, branch_id, revision`,
      )
      .all()
      .map(rowToSnapshot);
    const commandReceipts = this.database
      .prepare<[], ReceiptRow>(
        `SELECT game_id, branch_id, result_branch_id, request_id, command_hash, start_revision, end_revision,
                state_hash, created_at
         FROM command_receipts ORDER BY game_id, branch_id, start_revision`,
      )
      .all()
      .map(rowToReceipt);
    const decisions = this.database
      .prepare<[], DecisionRow>(
        `SELECT decision_id, game_id, branch_id, learner_id, hand_id, revision, player_id,
                request_id, action_id, independent, quality, analysis_version, weighting_version,
                data_json, created_at
         FROM decisions ORDER BY created_at, decision_id`,
      )
      .all()
      .map((row) => this.rowToDecision(row));
    const analysisFacts = this.database
      .prepare<[], FactRow>(
        `SELECT fact_id, decision_id, kind, summary, data_json, created_at
         FROM analysis_facts ORDER BY created_at, fact_id`,
      )
      .all()
      .map((row) => this.rowToFact(row));
    const hints = this.database
      .prepare<[], HintRow>(
        `SELECT hint_id, learner_id, decision_id, level, data_json, created_at
         FROM hints ORDER BY created_at, hint_id`,
      )
      .all()
      .map((row) => this.rowToHint(row));
    const reviews = this.database
      .prepare<[], ReviewRow>(
        `SELECT review_id, learner_id, game_id, branch_id, hand_id, data_json, created_at
         FROM reviews ORDER BY created_at, review_id`,
      )
      .all()
      .map((row) => this.rowToReview(row));
    const drillItems = this.database
      .prepare<[], DrillItemRow>(
        `SELECT drill_item_id, learner_id, source, concept_ids_json, difficulty, data_json, created_at
         FROM drill_items ORDER BY created_at, drill_item_id`,
      )
      .all()
      .map((row) => this.rowToDrillItem(row));
    const drillAttempts = this.database
      .prepare<[], DrillAttemptRow>(
        `SELECT drill_attempt_id, drill_item_id, learner_id, correct, hint_level, data_json, created_at
         FROM drill_attempts ORDER BY created_at, drill_attempt_id`,
      )
      .all()
      .map((row) => this.rowToDrillAttempt(row));
    const schedules = this.database
      .prepare<[], ScheduleRow>(
        `SELECT drill_item_id, learner_id, next_review_at, interval_days, ease, updated_at
         FROM spaced_repetition_schedule ORDER BY learner_id, next_review_at, drill_item_id`,
      )
      .all()
      .map((row) => this.rowToSchedule(row));
    const llmRequests = includeLlmMetadata
      ? this.database
          .prepare<[], LlmRequestRow>(
            `SELECT llm_request_id, learner_id, decision_id, provider, model, latency_ms,
                    input_tokens, output_tokens, fact_ids_json, status, error_code, created_at
             FROM llm_requests ORDER BY created_at, llm_request_id`,
          )
          .all()
          .map((row) => this.rowToLlmRequest(row))
      : [];
    return {
      format: PERSISTENCE_EXPORT_FORMAT,
      version: PERSISTENCE_EXPORT_VERSION,
      exportedAt: this.now(),
      data: {
        learners,
        learnerPreferences,
        conceptMastery,
        games,
        branches,
        hands,
        events,
        snapshots,
        commandReceipts,
        decisions,
        analysisFacts,
        hints,
        reviews,
        drillItems,
        drillAttempts,
        schedules,
        llmRequests,
      },
    };
  }

  private allBranchesInternal(): readonly GameBranchMetadata[] {
    return this.database
      .prepare<[], BranchRow>(
        `SELECT game_id, branch_id, parent_branch_id, fork_revision, fork_state_hash,
                fork_event_chain_hash, practice, created_at, activity_order, current_revision,
                state_hash, event_chain_hash
         FROM game_branches ORDER BY game_id, created_at, branch_id`,
      )
      .all()
      .map(rowToBranchMetadata);
  }

  private rowToHand(row: HandRow): HandRecord {
    const result =
      row.result_json === null
        ? null
        : parsePersistedJson(dbString(row.result_json, "Hand result JSON"), "Hand result JSON");
    return {
      key: {
        gameId: dbString(row.game_id, "Hand game ID"),
        branchId: dbString(row.branch_id, "Hand branch ID"),
      },
      handId: dbString(row.hand_id, "Hand ID"),
      seed: dbString(row.seed, "Hand seed"),
      handIndex: dbInteger(row.hand_index, "Hand index", 0),
      startedRevision: dbInteger(row.started_revision, "Hand start revision", 1),
      endedRevision:
        row.ended_revision === null ? null : dbInteger(row.ended_revision, "Hand end revision", 1),
      result,
      practice: dbBoolean(row.practice, "Hand practice flag"),
    };
  }

  private rowToDecision(row: DecisionRow): DecisionRecord {
    const independent = dbBoolean(row.independent, "Decision independent flag");
    return {
      id: dbString(row.decision_id, "Decision ID"),
      key: {
        gameId: dbString(row.game_id, "Decision game ID"),
        branchId: dbString(row.branch_id, "Decision branch ID"),
      },
      learnerId: dbNullableString(row.learner_id, "Decision learner ID"),
      handId: dbString(row.hand_id, "Decision hand ID"),
      revision: dbInteger(row.revision, "Decision revision", 1),
      playerId: dbString(row.player_id, "Decision player ID"),
      requestId: dbNullableString(row.request_id, "Decision request ID"),
      actionId: dbString(row.action_id, "Decision action ID"),
      independent,
      quality: row.quality === null ? null : dbNumber(row.quality, "Decision quality"),
      analysisVersion: dbString(row.analysis_version, "Decision analysis version"),
      weightingVersion: dbString(row.weighting_version, "Decision weighting version"),
      data: asJsonObjectFromStored(row.data_json, "Decision data"),
      createdAt: dbString(row.created_at, "Decision creation time"),
    };
  }

  private rowToFact(row: FactRow): AnalysisFactRecord {
    return {
      id: dbString(row.fact_id, "Analysis fact ID"),
      decisionId: dbString(row.decision_id, "Analysis fact decision ID"),
      kind: dbString(row.kind, "Analysis fact kind"),
      summary: dbString(row.summary, "Analysis fact summary"),
      data: asJsonObjectFromStored(row.data_json, "Analysis fact data"),
      createdAt: dbString(row.created_at, "Analysis fact creation time"),
    };
  }

  private rowToHint(row: HintRow): HintRecord {
    const level = dbInteger(row.level, "Hint level", 1);
    if (level > 3) {
      return corruption("Hint level is corrupt");
    }
    return {
      id: dbString(row.hint_id, "Hint ID"),
      learnerId: dbString(row.learner_id, "Hint learner ID"),
      decisionId: dbNullableString(row.decision_id, "Hint decision ID"),
      level: level as 1 | 2 | 3,
      data: asJsonObjectFromStored(row.data_json, "Hint data"),
      createdAt: dbString(row.created_at, "Hint creation time"),
    };
  }

  private rowToReview(row: ReviewRow): ReviewRecord {
    return {
      id: dbString(row.review_id, "Review ID"),
      learnerId: dbString(row.learner_id, "Review learner ID"),
      key: {
        gameId: dbString(row.game_id, "Review game ID"),
        branchId: dbString(row.branch_id, "Review branch ID"),
      },
      handId: dbString(row.hand_id, "Review hand ID"),
      data: asJsonObjectFromStored(row.data_json, "Review data"),
      createdAt: dbString(row.created_at, "Review creation time"),
    };
  }

  private rowToDrillItem(row: DrillItemRow): DrillItemRecord {
    const source = dbString(row.source, "Drill source");
    if (!DRILL_SOURCES.has(source as DrillItemRecord["source"])) {
      return corruption("Drill source is corrupt");
    }
    const conceptIds = asStringArrayFromStored(row.concept_ids_json, "Drill concept IDs");
    if (new Set(conceptIds).size !== conceptIds.length) {
      return corruption("Drill concept IDs contain duplicates");
    }
    return {
      id: dbString(row.drill_item_id, "Drill item ID"),
      learnerId: dbString(row.learner_id, "Drill learner ID"),
      source: source as DrillItemRecord["source"],
      conceptIds,
      difficulty: dbNumber(row.difficulty, "Drill difficulty"),
      data: asJsonObjectFromStored(row.data_json, "Drill data"),
      createdAt: dbString(row.created_at, "Drill creation time"),
    };
  }

  private rowToDrillAttempt(row: DrillAttemptRow): DrillAttemptRecord {
    const hintLevel = dbInteger(row.hint_level, "Drill attempt hint level", 0);
    if (hintLevel > 3) {
      return corruption("Drill attempt hint level is corrupt");
    }
    return {
      id: dbString(row.drill_attempt_id, "Drill attempt ID"),
      drillItemId: dbString(row.drill_item_id, "Drill attempt item ID"),
      learnerId: dbString(row.learner_id, "Drill attempt learner ID"),
      correct: dbBoolean(row.correct, "Drill attempt correct flag"),
      hintLevel: hintLevel as 0 | 1 | 2 | 3,
      data: asJsonObjectFromStored(row.data_json, "Drill attempt data"),
      createdAt: dbString(row.created_at, "Drill attempt creation time"),
    };
  }

  private rowToSchedule(row: ScheduleRow): SpacedRepetitionScheduleRecord {
    return {
      drillItemId: dbString(row.drill_item_id, "Schedule drill item ID"),
      learnerId: dbString(row.learner_id, "Schedule learner ID"),
      nextReviewAt: dbString(row.next_review_at, "Schedule next review time"),
      intervalDays: dbNumber(row.interval_days, "Schedule interval", 0),
      ease: dbNumber(row.ease, "Schedule ease", Number.MIN_VALUE),
      updatedAt: dbString(row.updated_at, "Schedule update time"),
    };
  }

  private rowToLlmRequest(row: LlmRequestRow): LlmRequestMetadata {
    const status = dbString(row.status, "LLM request status");
    if (!LLM_STATUSES.has(status as LlmRequestMetadata["status"])) {
      return corruption("LLM request status is corrupt");
    }
    return {
      id: dbString(row.llm_request_id, "LLM request ID"),
      learnerId: dbNullableString(row.learner_id, "LLM learner ID"),
      decisionId: dbNullableString(row.decision_id, "LLM decision ID"),
      provider: dbString(row.provider, "LLM provider"),
      model: dbString(row.model, "LLM model"),
      latencyMs: dbInteger(row.latency_ms, "LLM latency", 0),
      inputTokens:
        row.input_tokens === null ? null : dbInteger(row.input_tokens, "LLM input token count", 0),
      outputTokens:
        row.output_tokens === null
          ? null
          : dbInteger(row.output_tokens, "LLM output token count", 0),
      factIds: asStringArrayFromStored(row.fact_ids_json, "LLM fact IDs"),
      status: status as LlmRequestMetadata["status"],
      errorCode: dbNullableString(row.error_code, "LLM error code"),
      createdAt: dbString(row.created_at, "LLM request creation time"),
    };
  }

  private validateDerivedSemanticsInternal(): void {
    for (const branch of this.allBranchesInternal()) {
      const history = this.collectHistoryInternal(branch.key, branch.currentRevision);
      let state: GameState | undefined;
      const expectedHands = new Map<string, HandRecord>();
      const localEvents: StoredGameEvent[] = [];
      for (const event of history.events) {
        state = this.reduceStoredEventInternal(state, event);
        if (event.key.gameId !== branch.key.gameId || event.key.branchId !== branch.key.branchId) {
          continue;
        }
        localEvents.push(event);
        const existing = expectedHands.get(state.hand.id);
        const terminal = event.event.type === "hand_won" || event.event.type === "hand_ended";
        expectedHands.set(state.hand.id, {
          key: { ...branch.key },
          handId: state.hand.id,
          seed: state.hand.seed,
          handIndex: state.match.handIndex,
          startedRevision: existing?.startedRevision ?? state.revision,
          endedRevision: terminal ? state.revision : (existing?.endedRevision ?? null),
          result:
            state.hand.result === null
              ? (existing?.result ?? null)
              : (state.hand.result as JsonValue),
          practice: branch.practice,
        });
      }
      if (state === undefined || localEvents.length === 0) {
        throw new PersistenceValidationError("Persisted branch has no local event history");
      }
      const actualHands = this.database
        .prepare<[string, string], HandRow>(
          `SELECT game_id, branch_id, hand_id, seed, hand_index, started_revision, ended_revision,
                  result_json, practice
           FROM hands
           WHERE game_id = ? AND branch_id = ?
           ORDER BY hand_id`,
        )
        .all(branch.key.gameId, branch.key.branchId)
        .map((row) => this.rowToHand(row));
      const expected = [...expectedHands.values()].sort((left, right) =>
        compareCodePoints(left.handId, right.handId),
      );
      if (canonicalJson(actualHands) !== canonicalJson(expected)) {
        throw new PersistenceValidationError(
          "Persisted hand records do not match their authoritative event history",
        );
      }

      if (branch.parentKey === null) {
        if (branch.practice) {
          throw new PersistenceValidationError("A root game branch cannot be marked as practice");
        }
        continue;
      }
      if (!branch.practice) {
        throw new PersistenceValidationError("A child game branch must be marked as practice");
      }
      const marker = localEvents[0]?.event;
      if (
        marker?.type !== "practice_branch_created" ||
        marker.gameId !== branch.key.gameId ||
        marker.branchId !== branch.key.branchId ||
        marker.parentBranchId !== branch.parentKey.branchId ||
        marker.originDecisionBranchId !== branch.parentKey.branchId ||
        marker.parentRevision !== branch.forkRevision ||
        marker.parentStateHash !== branch.forkStateHash ||
        marker.revision !== branch.forkRevision + 1
      ) {
        throw new PersistenceValidationError(
          "Practice branch metadata does not match its first local marker",
        );
      }
      const parentHistory = this.collectHistoryInternal(branch.parentKey, branch.forkRevision);
      const parentState = this.replayHistoryInternal(parentHistory);
      if (
        marker.parentEventId !== parentState.lastEventId ||
        branch.forkEventChainHash !== parentHistory.chainHashByRevision.get(branch.forkRevision)
      ) {
        throw new PersistenceValidationError(
          "Practice branch does not match its parent checkpoint",
        );
      }
      const originDecision = this.getDecisionInternal(marker.originDecisionId);
      if (
        originDecision?.key.gameId !== branch.parentKey.gameId ||
        originDecision.key.branchId !== branch.parentKey.branchId ||
        originDecision.revision !== marker.parentRevision ||
        originDecision.playerId !== marker.requestedByPlayerId ||
        (originDecision.learnerId !== null && originDecision.learnerId !== history.game.learnerId)
      ) {
        throw new PersistenceValidationError("Practice branch does not match its origin decision");
      }
      const receipt = this.getReceiptInternal(branch.parentKey, marker.requestId);
      if (
        receipt?.resultKey.gameId !== branch.key.gameId ||
        receipt.resultKey.branchId !== branch.key.branchId
      ) {
        throw new PersistenceValidationError(
          "Practice branch is missing its parent-side creation receipt",
        );
      }
    }

    const decisions = this.database
      .prepare<[], DecisionRow>(
        `SELECT decision_id, game_id, branch_id, learner_id, hand_id, revision, player_id,
                request_id, action_id, independent, quality, analysis_version, weighting_version,
                data_json, created_at
         FROM decisions`,
      )
      .all()
      .map((row) => this.rowToDecision(row));
    for (const decision of decisions) {
      const branch = this.requireBranchInternal(decision.key);
      const game = this.getGameInternal(decision.key.gameId);
      if (game === null) {
        return corruption("Persisted decision branch has no game metadata");
      }
      if (game.learnerId !== null && decision.learnerId !== game.learnerId) {
        throw new PersistenceValidationError("Persisted decision learner does not own its game");
      }
      const firstVisibleRevision = branch.parentKey === null ? 1 : branch.forkRevision + 1;
      if (decision.revision < firstVisibleRevision || decision.revision > branch.currentRevision) {
        throw new PersistenceValidationError(
          "Persisted decision revision is outside its branch history",
        );
      }
      const stateAtDecision = this.reconstructInternal(decision.key, decision.revision).state;
      if (
        stateAtDecision.hand.id !== decision.handId ||
        stateAtDecision.players[decision.playerId] === undefined
      ) {
        throw new PersistenceValidationError(
          "Persisted decision does not match its hand or player",
        );
      }
      if (
        !this.legalActions(stateAtDecision, decision.playerId, game.rulesetDefinition).some(
          ({ id }) => id === decision.actionId,
        )
      ) {
        throw new PersistenceValidationError(
          "Persisted decision action was not emitted for its player and revision",
        );
      }
      if (decision.requestId !== null) {
        const event = this.database
          .prepare<[string, string, string], { event_id: string }>(
            `SELECT event_id FROM game_events
             WHERE game_id = ? AND branch_id = ? AND request_id = ?
             LIMIT 1`,
          )
          .get(decision.key.gameId, decision.key.branchId, decision.requestId);
        if (event === undefined) {
          throw new PersistenceValidationError(
            "Persisted decision request has no same-branch event",
          );
        }
      }
    }

    const attempts = this.database
      .prepare<[], DrillAttemptRow>(
        `SELECT drill_attempt_id, drill_item_id, learner_id, correct, hint_level, data_json,
                created_at
         FROM drill_attempts`,
      )
      .all()
      .map((row) => this.rowToDrillAttempt(row));
    for (const attempt of attempts) {
      this.requireDrillItemOwnerInternal(attempt.drillItemId, attempt.learnerId);
    }
    const schedules = this.database
      .prepare<[], ScheduleRow>(
        `SELECT drill_item_id, learner_id, next_review_at, interval_days, ease, updated_at
         FROM spaced_repetition_schedule`,
      )
      .all()
      .map((row) => this.rowToSchedule(row));
    for (const schedule of schedules) {
      this.requireDrillItemOwnerInternal(schedule.drillItemId, schedule.learnerId);
    }

    const reviews = this.database
      .prepare<[], ReviewRow>(
        `SELECT review_id, learner_id, game_id, branch_id, hand_id, data_json, created_at
         FROM reviews`,
      )
      .all()
      .map((row) => this.rowToReview(row));
    for (const review of reviews) {
      const game = this.getGameInternal(review.key.gameId);
      if (game === null) {
        return corruption("Persisted review branch has no game metadata");
      }
      if (game.learnerId !== null && review.learnerId !== game.learnerId) {
        throw new PersistenceValidationError("Persisted review learner does not own its game");
      }
      const hand = this.requireHandRecordInternal(review.key, review.handId);
      if (hand.endedRevision === null) {
        throw new PersistenceValidationError(
          "Persisted review requires a completed persisted hand",
        );
      }
    }
    const hints = this.database
      .prepare<[], HintRow>(
        "SELECT hint_id, learner_id, decision_id, level, data_json, created_at FROM hints",
      )
      .all()
      .map((row) => this.rowToHint(row));
    for (const hint of hints) {
      if (hint.decisionId === null) {
        continue;
      }
      const decision = this.getDecisionInternal(hint.decisionId);
      if (decision?.learnerId !== hint.learnerId) {
        throw new PersistenceValidationError(
          "Persisted hint does not belong to its linked decision learner",
        );
      }
    }
    const llmRequests = this.database
      .prepare<[], LlmRequestRow>(
        `SELECT llm_request_id, learner_id, decision_id, provider, model, latency_ms,
                input_tokens, output_tokens, fact_ids_json, status, error_code, created_at
         FROM llm_requests`,
      )
      .all()
      .map((row) => this.rowToLlmRequest(row));
    for (const request of llmRequests) {
      this.requireLlmFactScopeInternal(
        request.learnerId,
        request.decisionId,
        request.factIds,
        "Persisted LLM request metadata",
      );
    }
  }

  private validateAllBranchesInternal(): void {
    const branches = this.allBranchesInternal();
    const gameRows = this.database
      .prepare<[], { game_id: string }>("SELECT game_id FROM games ORDER BY game_id")
      .all();
    for (const { game_id: rawGameId } of gameRows) {
      const gameId = dbString(rawGameId, "Validated game ID");
      const roots = branches.filter(
        ({ key, parentKey }) => key.gameId === gameId && parentKey === null,
      );
      if (roots.length !== 1 || roots[0]?.key.branchId !== MAIN_BRANCH_ID) {
        return corruption("Every persisted game must have exactly one main root branch");
      }
    }

    for (const branch of branches) {
      this.validateBranchJournalBoundsInternal(branch);

      const history = this.collectHistoryInternal(branch.key, branch.currentRevision);
      const state = this.replayHistoryInternal(history);
      if (
        state.ruleset.id !== history.game.rulesetId ||
        state.ruleset.version !== history.game.rulesetVersion ||
        state.ruleset.hash !== history.game.rulesetHash ||
        state.seed !== history.game.seed ||
        state.rngVersion !== history.game.rngVersion ||
        state.mode !== history.game.mode
      ) {
        return corruption("Replayed state does not match persisted game identity");
      }
      try {
        requireHistoricalRulesetDefinition(
          history.game.rulesetDefinition,
          state.ruleset,
          "Persisted game historical ruleset definition",
          this.validateRulesetDefinition,
          state.ruleset,
        );
      } catch (caught) {
        const reason =
          caught instanceof Error ? caught.message : "unknown ruleset identity mismatch";
        return corruption(`Persisted game historical ruleset definition is corrupt: ${reason}`);
      }
      if (state.branchId !== branch.key.branchId || state.practiceBranch !== branch.practice) {
        return corruption("Replayed state does not match persisted branch identity");
      }
      if (isTruncatedCompletedMatch(state)) {
        return corruption("Branch head stops before the required match_ended event");
      }
      if (history.game.sessionConfiguration !== null) {
        requireSessionConfigurationForState(
          history.game.sessionConfiguration,
          state,
          "Persisted game session configuration",
        );
      }
      for (const row of this.snapshotRowsForHistoryInternal(history)) {
        const snapshot = rowToSnapshot(row);
        if (
          snapshot.stateHash !== history.stateHashByRevision.get(snapshot.revision) ||
          snapshot.eventChainHash !== history.chainHashByRevision.get(snapshot.revision)
        ) {
          return corruption("Snapshot does not match its visible event history");
        }
      }
    }
    this.validateCommandReceiptsInternal();
  }

  private validateBranchJournalBoundsInternal(branch: GameBranchMetadata): void {
    const expectedLocalEventCount = branch.currentRevision - branch.forkRevision;
    const eventBounds = this.database
      .prepare<
        [string, string],
        {
          event_count: number;
          minimum_revision: number | null;
          maximum_revision: number | null;
        }
      >(
        `SELECT COUNT(*) AS event_count, MIN(revision) AS minimum_revision,
                MAX(revision) AS maximum_revision
         FROM game_events
         WHERE game_id = ? AND branch_id = ?`,
      )
      .get(branch.key.gameId, branch.key.branchId);
    if (
      expectedLocalEventCount < 1 ||
      dbInteger(eventBounds?.event_count, "Branch local event count", 0) !==
        expectedLocalEventCount ||
      dbInteger(eventBounds?.minimum_revision, "Branch first local event revision", 1) !==
        branch.forkRevision + 1 ||
      dbInteger(eventBounds?.maximum_revision, "Branch last local event revision", 1) !==
        branch.currentRevision
    ) {
      return corruption("Branch metadata does not bound its complete local event journal");
    }
    const snapshotRows = this.database
      .prepare<[string, string], { revision: number }>(
        `SELECT revision
         FROM game_snapshots
         WHERE game_id = ? AND branch_id = ?`,
      )
      .all(branch.key.gameId, branch.key.branchId);
    if (
      snapshotRows.some(({ revision }) => {
        const parsed = dbInteger(revision, "Branch snapshot revision", 1);
        return parsed <= branch.forkRevision || parsed > branch.currentRevision;
      })
    ) {
      return corruption("Branch contains a snapshot outside its local event journal");
    }
  }

  private validateCommandReceiptsInternal(): void {
    const receipts = this.database
      .prepare<[], ReceiptRow>(
        `SELECT game_id, branch_id, result_branch_id, request_id, command_hash, start_revision, end_revision,
                state_hash, created_at
         FROM command_receipts`,
      )
      .all()
      .map(rowToReceipt);
    const receiptByResultBatch = new Map<string, CommandReceipt>();
    for (const receipt of receipts) {
      const batchId = `${receipt.resultKey.gameId}\u0000${receipt.resultKey.branchId}\u0000${receipt.requestId}`;
      if (receiptByResultBatch.has(batchId)) {
        return corruption("Multiple command receipts claim the same accepted event batch");
      }
      receiptByResultBatch.set(batchId, receipt);
    }
    const eventBatches = this.database
      .prepare<
        [],
        {
          game_id: string;
          branch_id: string;
          request_id: string;
          first_revision: number;
          last_revision: number;
          event_count: number;
        }
      >(
        `SELECT game_id, branch_id, request_id, MIN(revision) AS first_revision,
                MAX(revision) AS last_revision, COUNT(*) AS event_count
         FROM game_events
         GROUP BY game_id, branch_id, request_id`,
      )
      .all();
    for (const batch of eventBatches) {
      const gameId = dbString(batch.game_id, "Accepted event batch game ID");
      const branchId = dbString(batch.branch_id, "Accepted event batch branch ID");
      const requestId = dbString(batch.request_id, "Accepted event batch request ID");
      const firstRevision = dbInteger(
        batch.first_revision,
        "Accepted event batch first revision",
        1,
      );
      const lastRevision = dbInteger(batch.last_revision, "Accepted event batch last revision", 1);
      const eventCount = dbInteger(batch.event_count, "Accepted event batch count", 1);
      const receipt = receiptByResultBatch.get(`${gameId}\u0000${branchId}\u0000${requestId}`);
      if (
        receipt?.startRevision !== firstRevision ||
        receipt.endRevision !== lastRevision ||
        eventCount !== lastRevision - firstRevision + 1
      ) {
        return corruption("Accepted event batch is missing its exact command receipt");
      }
    }
    if (receiptByResultBatch.size !== eventBatches.length) {
      return corruption("Command receipt set does not match accepted event batches");
    }
    for (const receipt of receipts) {
      const events = this.database
        .prepare<[string, string, number, number], EventRow>(
          `SELECT game_id, branch_id, revision, event_id, request_id, event_type, visibility,
                  event_json, event_hash, state_hash, event_chain_hash, created_at
           FROM game_events
           WHERE game_id = ? AND branch_id = ? AND revision >= ? AND revision <= ?
           ORDER BY revision`,
        )
        .all(
          receipt.resultKey.gameId,
          receipt.resultKey.branchId,
          receipt.startRevision,
          receipt.endRevision,
        )
        .map(rowToStoredEvent);
      if (
        events.length !== receipt.endRevision - receipt.startRevision + 1 ||
        events.some((event) => event.requestId !== receipt.requestId)
      ) {
        return corruption("Command receipt does not match an atomic event range");
      }
      if (
        receipt.key.gameId !== receipt.resultKey.gameId ||
        receipt.key.branchId !== receipt.resultKey.branchId
      ) {
        const resultBranch = this.requireBranchInternal(receipt.resultKey);
        const marker = events.length === 1 ? events[0]?.event : undefined;
        if (
          resultBranch.parentKey?.gameId !== receipt.key.gameId ||
          resultBranch.parentKey.branchId !== receipt.key.branchId ||
          !resultBranch.practice ||
          receipt.startRevision !== resultBranch.forkRevision + 1 ||
          receipt.endRevision !== receipt.startRevision ||
          marker?.type !== "practice_branch_created" ||
          marker.gameId !== receipt.resultKey.gameId ||
          marker.branchId !== receipt.resultKey.branchId ||
          marker.parentBranchId !== receipt.key.branchId ||
          marker.requestId !== receipt.requestId
        ) {
          return corruption("Cross-branch command receipt is not a valid practice fork receipt");
        }
      }
      const terminal = events.at(-1);
      if (
        terminal?.stateHash !== receipt.stateHash ||
        commandHashFor(
          receipt.requestId,
          events.map(({ event }) => event),
          receipt.stateHash,
        ) !== receipt.commandHash
      ) {
        return corruption("Command receipt has a mismatched hash or terminal state");
      }
    }
  }
}
