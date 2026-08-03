import type Database from "better-sqlite3";

import { PersistenceCorruptionError } from "./errors.js";
import { PERSISTENCE_SCHEMA_VERSION } from "./types.js";

export interface PersistenceMigration {
  version: number;
  sql: string;
}

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  applied_at TEXT NOT NULL
);

CREATE TABLE learners (
  learner_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE learner_preferences (
  learner_id TEXT PRIMARY KEY REFERENCES learners(learner_id) ON DELETE CASCADE,
  preferences_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE concept_mastery (
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL,
  mastery REAL NOT NULL CHECK (mastery >= 0 AND mastery <= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  independent_attempts INTEGER NOT NULL CHECK (independent_attempts >= 0),
  successful_attempts INTEGER NOT NULL CHECK (successful_attempts >= 0),
  hint_weighted_score REAL NOT NULL,
  algorithm_version TEXT NOT NULL,
  last_seen_at TEXT,
  next_review_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (learner_id, concept_id)
);

CREATE TABLE games (
  game_id TEXT PRIMARY KEY,
  learner_id TEXT REFERENCES learners(learner_id) ON DELETE SET NULL,
  ruleset_id TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  ruleset_hash TEXT NOT NULL,
  seed TEXT NOT NULL,
  rng_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE game_branches (
  game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL,
  parent_branch_id TEXT,
  fork_revision INTEGER NOT NULL CHECK (fork_revision >= 0),
  fork_state_hash TEXT,
  fork_event_chain_hash TEXT NOT NULL,
  practice INTEGER NOT NULL CHECK (practice IN (0, 1)),
  created_at TEXT NOT NULL,
  current_revision INTEGER NOT NULL CHECK (current_revision >= 0),
  state_hash TEXT,
  event_chain_hash TEXT NOT NULL,
  PRIMARY KEY (game_id, branch_id),
  FOREIGN KEY (game_id, parent_branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE,
  CHECK (
    (parent_branch_id IS NULL AND fork_revision = 0 AND fork_state_hash IS NULL)
    OR
    (parent_branch_id IS NOT NULL AND fork_revision > 0 AND fork_state_hash IS NOT NULL)
  )
);

CREATE TABLE hands (
  game_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  hand_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  hand_index INTEGER NOT NULL CHECK (hand_index >= 0),
  started_revision INTEGER NOT NULL CHECK (started_revision >= 1),
  ended_revision INTEGER CHECK (ended_revision >= started_revision),
  result_json TEXT,
  practice INTEGER NOT NULL CHECK (practice IN (0, 1)),
  PRIMARY KEY (game_id, branch_id, hand_id),
  FOREIGN KEY (game_id, branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE game_events (
  game_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  event_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'internal')),
  event_json TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  event_chain_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, branch_id, revision),
  UNIQUE (game_id, branch_id, event_id),
  FOREIGN KEY (game_id, branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE game_snapshots (
  game_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  event_chain_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, branch_id, revision),
  FOREIGN KEY (game_id, branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE command_receipts (
  game_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  command_hash TEXT NOT NULL,
  start_revision INTEGER NOT NULL CHECK (start_revision >= 1),
  end_revision INTEGER NOT NULL CHECK (end_revision >= start_revision),
  state_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, branch_id, request_id),
  FOREIGN KEY (game_id, branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE decisions (
  decision_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  learner_id TEXT REFERENCES learners(learner_id) ON DELETE CASCADE,
  hand_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  player_id TEXT NOT NULL,
  request_id TEXT,
  action_id TEXT NOT NULL,
  independent INTEGER NOT NULL CHECK (independent IN (0, 1)),
  quality REAL,
  analysis_version TEXT NOT NULL,
  weighting_version TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id, branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE analysis_facts (
  fact_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(decision_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE hints (
  hint_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  decision_id TEXT REFERENCES decisions(decision_id) ON DELETE SET NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE reviews (
  review_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  hand_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id, branch_id)
    REFERENCES game_branches(game_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE drill_items (
  drill_item_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('bundled', 'generated', 'replay')),
  concept_ids_json TEXT NOT NULL,
  difficulty REAL NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE drill_attempts (
  drill_attempt_id TEXT PRIMARY KEY,
  drill_item_id TEXT NOT NULL REFERENCES drill_items(drill_item_id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  hint_level INTEGER NOT NULL CHECK (hint_level BETWEEN 0 AND 3),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE spaced_repetition_schedule (
  drill_item_id TEXT PRIMARY KEY REFERENCES drill_items(drill_item_id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  next_review_at TEXT NOT NULL,
  interval_days REAL NOT NULL CHECK (interval_days >= 0),
  ease REAL NOT NULL CHECK (ease > 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE llm_requests (
  llm_request_id TEXT PRIMARY KEY,
  learner_id TEXT REFERENCES learners(learner_id) ON DELETE CASCADE,
  decision_id TEXT REFERENCES decisions(decision_id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  input_tokens INTEGER CHECK (input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens >= 0),
  fact_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aborted', 'error', 'success')),
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX game_events_by_branch_request
  ON game_events(game_id, branch_id, request_id, revision);
CREATE INDEX game_snapshots_by_branch_revision
  ON game_snapshots(game_id, branch_id, revision DESC);
CREATE INDEX decisions_by_learner_created
  ON decisions(learner_id, created_at DESC);
CREATE INDEX analysis_facts_by_decision
  ON analysis_facts(decision_id);
CREATE INDEX drill_items_by_learner
  ON drill_items(learner_id, created_at DESC);
CREATE INDEX schedule_by_learner_due
  ON spaced_repetition_schedule(learner_id, next_review_at);
`;

export const PERSISTENCE_MIGRATIONS: readonly PersistenceMigration[] = [
  { version: 1, sql: INITIAL_SCHEMA },
  {
    version: 2,
    sql: `
      ALTER TABLE games ADD COLUMN ruleset_json TEXT;
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE command_receipts ADD COLUMN result_branch_id TEXT;
      UPDATE command_receipts
      SET result_branch_id = branch_id
      WHERE result_branch_id IS NULL;
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE games ADD COLUMN session_config_json TEXT;
      ALTER TABLE games ADD COLUMN session_config_hash TEXT;
      ALTER TABLE game_branches
        ADD COLUMN activity_order INTEGER NOT NULL DEFAULT 0 CHECK (activity_order >= 0);
    `,
  },
];

export const migratePersistence = (database: Database.Database, appliedAt: string): void => {
  database.pragma("foreign_keys = ON");
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY CHECK (version > 0), applied_at TEXT NOT NULL)",
  );

  const appliedRows = database
    .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
    .all();
  const knownVersions = new Set(PERSISTENCE_MIGRATIONS.map(({ version }) => version));
  for (const { version } of appliedRows) {
    if (!Number.isSafeInteger(version) || !knownVersions.has(version)) {
      throw new PersistenceCorruptionError(
        `Database contains unsupported persistence migration ${String(version)}`,
      );
    }
  }

  const applied = new Set(appliedRows.map(({ version }) => version));
  let sawMissingMigration = false;
  for (const { version } of PERSISTENCE_MIGRATIONS) {
    if (!applied.has(version)) {
      sawMissingMigration = true;
    } else if (sawMissingMigration) {
      throw new PersistenceCorruptionError(
        "Database contains a non-contiguous persistence migration ledger",
      );
    }
  }

  for (const migration of PERSISTENCE_MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare<[number, string]>(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        )
        .run(migration.version, appliedAt);
    })();
  }

  const latest = database
    .prepare<[], { version: number | null }>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    )
    .get();
  if (latest?.version !== PERSISTENCE_SCHEMA_VERSION) {
    throw new PersistenceCorruptionError(
      "Persistence migrations did not reach the expected schema version",
    );
  }
};
