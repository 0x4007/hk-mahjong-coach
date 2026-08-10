import type {
  CoreGameRules,
  GameEngine,
  GameEvent,
  GameMode,
  GameState,
  PracticeBranchCreatedEvent,
} from "@hk-mahjong/core";
import type Database from "better-sqlite3";

export const PERSISTENCE_SCHEMA_VERSION = 4 as const;
export const PERSISTENCE_EXPORT_VERSION = 4 as const;
export const PERSISTENCE_EXPORT_FORMAT = "hk-mahjong-persistence" as const;
export const MAIN_BRANCH_ID = "main" as const;

export type JsonPrimitive = boolean | null | number | string;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

export interface GameKey {
  gameId: string;
  branchId: string;
}

export type PersistedBotDifficulty = "novice" | "basic" | "intermediate" | "advanced";
export type PersistedBotPersonality = "fast" | "value" | "balanced";
export type PersistedCoachProvider = "templates" | "openai";
export type PersistedCoachVerbosity = "brief" | "normal" | "detailed";

export interface GameSessionConfigurationV1 {
  schemaVersion: 1;
  bots: readonly {
    playerId: string;
    difficulty: PersistedBotDifficulty;
    personality: PersistedBotPersonality;
  }[];
  coach: {
    enabled: boolean;
    provider: PersistedCoachProvider;
    verbosity: PersistedCoachVerbosity;
  };
}

export interface HistoricalRulesetValidationResult {
  definition: unknown;
  hash: string;
  coreRules: CoreGameRules;
}

export type HistoricalLegalActions = (
  state: GameState,
  playerId: string,
  rulesetDefinition: JsonObject,
) => ReturnType<GameEngine["legalActions"]>;

export interface PersistenceRepositoryOptions {
  /** A file path or SQLite's special `:memory:` path. */
  databasePath: string;
  /** Passed directly to better-sqlite3 when the database is opened. */
  databaseOptions?: Database.Options;
  /** Store a replay snapshot at this interval in addition to hand boundaries. */
  snapshotEveryEvents?: number;
  /** Reconstructs authoritative state while loading or verifying a game. */
  reducer?: GameEngine["reduce"];
  /** Recomputes legal actions with the exact historical ruleset used by the persisted game. */
  legalActions: HistoricalLegalActions;
  /** Validates and resolves the exact historical ruleset without a mutable registry lookup. */
  validateRulesetDefinition: (definition: unknown) => HistoricalRulesetValidationResult;
  /** Metadata clock only; game and replay determinism never depend on it. */
  clock?: () => string;
}

export interface GameMetadata {
  gameId: string;
  learnerId: string | null;
  rulesetId: string;
  rulesetVersion: string;
  rulesetHash: string;
  /** The exact resolved definition used to create the game, never a mutable registry lookup. */
  rulesetDefinition: JsonObject;
  /**
   * Immutable composition policy needed to resume bot and coach behavior. Historical databases
   * without this field remain replayable but are not offered by the resumable-game query.
   */
  sessionConfiguration: GameSessionConfigurationV1 | null;
  sessionConfigurationHash: string | null;
  seed: string;
  rngVersion: string;
  mode: GameMode;
  createdAt: string;
}

export interface GameBranchMetadata {
  key: GameKey;
  parentKey: GameKey | null;
  forkRevision: number;
  forkStateHash: string | null;
  forkEventChainHash: string;
  practice: boolean;
  createdAt: string;
  /** Durable database-local ordering for the most recently accepted branch command. */
  activityOrder: number;
  currentRevision: number;
  stateHash: string | null;
  eventChainHash: string;
}

export interface StoredGameEvent {
  key: GameKey;
  revision: number;
  requestId: string;
  event: GameEvent;
  eventHash: string;
  stateHash: string;
  eventChainHash: string;
  createdAt: string;
}

export interface StoredGameSnapshot {
  key: GameKey;
  revision: number;
  state: GameState;
  stateHash: string;
  snapshotHash: string;
  eventChainHash: string;
  createdAt: string;
}

export interface CommandReceipt {
  /** The branch where the request was made. */
  key: GameKey;
  /** The branch that contains the accepted event range. Usually the same as `key`. */
  resultKey: GameKey;
  requestId: string;
  commandHash: string;
  startRevision: number;
  endRevision: number;
  stateHash: string;
  createdAt: string;
}

export interface SnapshotRecovery {
  usedSnapshotRevision: number | null;
  skippedCorruptSnapshotRevisions: readonly number[];
}

export interface LoadedGame {
  key: GameKey;
  game: GameMetadata;
  branch: GameBranchMetadata;
  state: GameState;
  recovery: SnapshotRecovery;
}

export interface LoadedResumableGame extends Omit<LoadedGame, "game"> {
  game: GameMetadata & {
    sessionConfiguration: GameSessionConfigurationV1;
    sessionConfigurationHash: string;
  };
}

export interface ReplayResult {
  key: GameKey;
  state: GameState;
  eventCount: number;
}

export interface AcceptedDecisionEvidenceInput {
  decision: Omit<DecisionRecordInput, "key" | "requestId">;
  analysisFacts: readonly Omit<AnalysisFactRecordInput, "decisionId">[];
}

export interface CommitNotificationActionInput {
  requestId: string;
  playerId: string;
  actionId: string;
  source: "human" | "bot" | "timeout_fallback";
  fallback: {
    source: "timeout_fallback";
    reason: "action_timeout" | "disconnect_timeout";
    deadline: string;
    appliedAt: string;
  } | null;
}

export interface CommitNotificationInput {
  notificationId: string;
  action: CommitNotificationActionInput | null;
}

export interface AppendAcceptedCommandInput {
  key: GameKey;
  requestId: string;
  events: readonly GameEvent[];
  state: GameState;
  /** Required only when the first command creates a game. */
  learnerId?: string;
  /**
   * The resolved ruleset definition used by the game_created event. This is intentionally an
   * external boundary value: repository validation freezes its canonical historical identity.
   */
  rulesetDefinition?: unknown;
  /** Required only when the first command creates a game. */
  sessionConfiguration?: unknown;
  /** Optional learner evidence committed atomically with this accepted command. */
  decisionEvidence?: AcceptedDecisionEvidenceInput;
  /** Optional Deno KV outbox record committed atomically with this accepted command. */
  commitNotification?: CommitNotificationInput;
}

export interface AppendAcceptedCommandResult {
  key: GameKey;
  disposition: "appended" | "idempotent";
  startRevision: number;
  endRevision: number;
  stateHash: string;
}

export interface ForkPracticeBranchInput {
  /** The physical source branch of the core-produced marker event. */
  parent: GameKey;
  event: PracticeBranchCreatedEvent;
  /** The exact post-marker state returned by the core engine. */
  state: GameState;
}

export interface ForkPracticeBranchResult {
  branch: GameBranchMetadata;
  disposition: "created" | "idempotent";
}

export interface LearnerPreferencesInput {
  learnerId: string;
  preferences: JsonObject;
  updatedAt?: string;
}

export interface LearnerPreferencesRecord {
  learnerId: string;
  preferences: JsonObject;
  updatedAt: string;
}

export interface ConceptMasteryInput {
  learnerId: string;
  conceptId: string;
  mastery: number;
  confidence: number;
  attempts: number;
  independentAttempts: number;
  successfulAttempts: number;
  hintWeightedScore: number;
  algorithmVersion: string;
  lastSeenAt?: string;
  nextReviewAt?: string;
  updatedAt?: string;
}

export interface ConceptMasteryRecord {
  learnerId: string;
  conceptId: string;
  mastery: number;
  confidence: number;
  attempts: number;
  independentAttempts: number;
  successfulAttempts: number;
  hintWeightedScore: number;
  algorithmVersion: string;
  lastSeenAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
}

export interface DecisionRecordInput {
  id: string;
  key: GameKey;
  learnerId?: string;
  handId: string;
  revision: number;
  playerId: string;
  requestId?: string;
  actionId: string;
  independent: boolean;
  quality: number | null;
  analysisVersion: string;
  weightingVersion: string;
  data: JsonObject;
  createdAt?: string;
}

export interface DecisionRecord extends Omit<
  DecisionRecordInput,
  "learnerId" | "requestId" | "createdAt"
> {
  learnerId: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AnalysisFactRecordInput {
  id: string;
  decisionId: string;
  kind: string;
  summary: string;
  data: JsonObject;
  createdAt?: string;
}

export interface AnalysisFactRecord extends Omit<AnalysisFactRecordInput, "createdAt"> {
  createdAt: string;
}

export interface HintRecordInput {
  id: string;
  learnerId: string;
  decisionId?: string;
  level: 1 | 2 | 3;
  data: JsonObject;
  createdAt?: string;
}

export interface HintRecord extends Omit<HintRecordInput, "decisionId" | "createdAt"> {
  decisionId: string | null;
  createdAt: string;
}

export interface ReviewRecordInput {
  id: string;
  learnerId: string;
  key: GameKey;
  handId: string;
  data: JsonObject;
  createdAt?: string;
}

export interface ReviewRecord extends Omit<ReviewRecordInput, "createdAt"> {
  createdAt: string;
}

export type DrillSource = "bundled" | "generated" | "replay";

export interface DrillItemRecordInput {
  id: string;
  learnerId: string;
  source: DrillSource;
  conceptIds: readonly string[];
  difficulty: number;
  data: JsonObject;
  createdAt?: string;
}

export interface DrillItemRecord extends Omit<DrillItemRecordInput, "createdAt"> {
  createdAt: string;
}

export interface DrillAttemptRecordInput {
  id: string;
  drillItemId: string;
  learnerId: string;
  correct: boolean;
  hintLevel: 0 | 1 | 2 | 3;
  data: JsonObject;
  createdAt?: string;
}

export interface DrillAttemptRecord extends Omit<DrillAttemptRecordInput, "createdAt"> {
  createdAt: string;
}

export interface SpacedRepetitionScheduleInput {
  drillItemId: string;
  learnerId: string;
  nextReviewAt: string;
  intervalDays: number;
  ease: number;
  updatedAt?: string;
}

export interface SpacedRepetitionScheduleRecord extends Omit<
  SpacedRepetitionScheduleInput,
  "updatedAt"
> {
  updatedAt: string;
}

export type LlmRequestStatus = "aborted" | "error" | "success";

/**
 * Intentionally metadata-only. It has no prompt or response field so local exports cannot
 * accidentally contain model conversation content.
 */
export interface LlmRequestMetadataInput {
  id: string;
  learnerId?: string;
  decisionId?: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  factIds: readonly string[];
  status: LlmRequestStatus;
  errorCode?: string;
  createdAt?: string;
}

export interface LlmRequestMetadata extends Omit<
  LlmRequestMetadataInput,
  "learnerId" | "decisionId" | "inputTokens" | "outputTokens" | "errorCode" | "createdAt"
> {
  learnerId: string | null;
  decisionId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  createdAt: string;
}

export interface HandRecord {
  key: GameKey;
  handId: string;
  seed: string;
  handIndex: number;
  startedRevision: number;
  endedRevision: number | null;
  result: JsonValue | null;
  practice: boolean;
}

export interface PersistenceExportData {
  learners: readonly { learnerId: string; createdAt: string }[];
  learnerPreferences: readonly LearnerPreferencesRecord[];
  conceptMastery: readonly ConceptMasteryRecord[];
  games: readonly GameMetadata[];
  branches: readonly GameBranchMetadata[];
  hands: readonly HandRecord[];
  events: readonly StoredGameEvent[];
  snapshots: readonly StoredGameSnapshot[];
  commandReceipts: readonly CommandReceipt[];
  decisions: readonly DecisionRecord[];
  analysisFacts: readonly AnalysisFactRecord[];
  hints: readonly HintRecord[];
  reviews: readonly ReviewRecord[];
  drillItems: readonly DrillItemRecord[];
  drillAttempts: readonly DrillAttemptRecord[];
  schedules: readonly SpacedRepetitionScheduleRecord[];
  llmRequests: readonly LlmRequestMetadata[];
}

export interface PersistenceExport {
  format: typeof PERSISTENCE_EXPORT_FORMAT;
  version: typeof PERSISTENCE_EXPORT_VERSION;
  exportedAt: string;
  data: PersistenceExportData;
}

export interface ExportOptions {
  includeLlmMetadata?: boolean;
}

export interface ImportOptions {
  mode?: "merge" | "replace";
}

export interface ImportResult {
  mode: "merge" | "replace";
  importedGames: number;
  importedBranches: number;
}

export interface PersistenceRepository {
  close(): void;
  appendAcceptedCommand(input: AppendAcceptedCommandInput): AppendAcceptedCommandResult;
  /** Returns a durable idempotency receipt without exposing command payloads. */
  getCommandReceipt(key: GameKey, requestId: string): CommandReceipt | null;
  loadGame(key: GameKey): LoadedGame;
  loadLatestResumableGame(learnerId: string | null): LoadedResumableGame | null;
  loadGameAtRevision(key: GameKey, revision: number): LoadedGame;
  replayToTerminal(key: GameKey): ReplayResult;
  forkPracticeBranch(input: ForkPracticeBranchInput): ForkPracticeBranchResult;
  ensureLearner(learnerId: string): void;
  saveLearnerPreferences(input: LearnerPreferencesInput): LearnerPreferencesRecord;
  getLearnerPreferences(learnerId: string): LearnerPreferencesRecord | null;
  upsertConceptMastery(input: ConceptMasteryInput): ConceptMasteryRecord;
  listConceptMastery(learnerId: string): readonly ConceptMasteryRecord[];
  recordDecision(input: DecisionRecordInput): DecisionRecord;
  recordAnalysisFacts(input: readonly AnalysisFactRecordInput[]): readonly AnalysisFactRecord[];
  recordHint(input: HintRecordInput): HintRecord;
  recordReview(input: ReviewRecordInput): ReviewRecord;
  saveDrillItem(input: DrillItemRecordInput): DrillItemRecord;
  recordDrillAttempt(input: DrillAttemptRecordInput): DrillAttemptRecord;
  saveSpacedRepetitionSchedule(
    input: SpacedRepetitionScheduleInput,
  ): SpacedRepetitionScheduleRecord;
  recordLlmRequestMetadata(input: LlmRequestMetadataInput): LlmRequestMetadata;
  exportData(options?: ExportOptions): PersistenceExport;
  importData(input: unknown, options?: ImportOptions): ImportResult;
  resetLearnerProgress(learnerId: string): void;
  deleteAllData(): void;
}
