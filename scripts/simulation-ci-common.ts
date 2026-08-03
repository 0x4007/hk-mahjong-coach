import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJsonHash } from "@hk-mahjong/core";
import type { BotSimulationSummary } from "@hk-mahjong/test-fixtures";

export const SHARD_CONFIG_PATH = ".ci/simulation-shard.json";
export const AGGREGATE_CONFIG_PATH = ".ci/simulation-aggregate-config.json";
export const AGGREGATE_RECEIPT_PATH = ".ci/simulation-aggregate-receipt.json";
export const SHARD_RECEIPT_DIRECTORY = ".ci/receipts";
export const NATURAL_SIMULATION_SHARD_COUNT = 128;

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const REDACTED_ERROR_PATTERN = /^simulation shard failed; errorDigest=sha256:[0-9a-f]{64}$/u;
const SEED_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;

/**
 * The only top-level fields allowed in an uploaded shard summary.  A shard
 * receipt is deliberately an aggregate: event streams, physical tile IDs,
 * and per-decision traces must never cross the artifact boundary.
 */
export const REDACTED_SIMULATION_SUMMARY_KEYS = [
  "schemaVersion",
  "versions",
  "rulesets",
  "wallMode",
  "seedNamespace",
  "matchIndexOffset",
  "handIndexOffset",
  "requestedHands",
  "completedHands",
  "matchesStarted",
  "completedMatches",
  "replaySamples",
  "replaySampleIndices",
  "handDigestCount",
  "handDigestRoot",
  "maximumAcceptedCommands",
  "meanAcceptedCommands",
  "actionCounts",
  "terminationReasons",
  "rulesetHandCounts",
  "wallProfileCounts",
  "configurationCounts",
  "decisionConfigurationCounts",
  "regressionSeeds",
  "failures",
  "latency",
  "runDigest",
] as const;

export interface SimulationCiConfig {
  schemaVersion: 1;
  totalHands: number;
  shardCount: number;
  shardIndex?: number;
  seedNamespace: string;
}

export interface SimulationShardAssignment {
  globalHandStart: number;
  assignedHands: number;
}

export interface SimulationShardSuccessReceipt {
  schemaVersion: 1;
  status: "passed";
  totalHands: number;
  shardCount: number;
  shardIndex: number;
  globalHandStart: number;
  assignedHands: number;
  seedNamespace: string;
  summary: BotSimulationSummary;
}

export interface SimulationShardFailureReceipt {
  schemaVersion: 1;
  status: "failed";
  totalHands: number;
  shardCount: number;
  shardIndex: number;
  globalHandStart: number;
  assignedHands: number;
  seedNamespace: string;
  error: string;
}

export type SimulationShardReceipt = SimulationShardSuccessReceipt | SimulationShardFailureReceipt;

export interface SimulationAggregateReceipt {
  schemaVersion: 1;
  status: "passed";
  totalHands: number;
  shardCount: number;
  completedHands: number;
  aggregateDigest: string;
  shards: readonly {
    shardIndex: number;
    globalHandStart: number;
    assignedHands: number;
    seedNamespace: string;
    handDigestRoot: string;
    runDigest: string;
  }[];
}

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

export const isSha256Digest = (value: unknown): value is string =>
  typeof value === "string" && SHA256_DIGEST_PATTERN.test(value);

export const isRedactedSimulationError = (value: unknown): value is string =>
  typeof value === "string" && REDACTED_ERROR_PATTERN.test(value);

export const hasExactKeys = (
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
};

/** Copy only the allowlisted, aggregate fields into the artifact boundary. */
export const redactSimulationSummary = (summary: BotSimulationSummary): BotSimulationSummary =>
  Object.fromEntries(
    REDACTED_SIMULATION_SUMMARY_KEYS.map((key) => [key, summary[key]]),
  ) as unknown as BotSimulationSummary;

/** The deterministic portion used by BotSimulationSummary.runDigest. */
export const deterministicSimulationSummaryPayload = (
  summary: object,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(summary).filter(
      ([key]) =>
        key !== "schemaVersion" && key !== "failures" && key !== "latency" && key !== "runDigest",
    ),
  );

export const simulationSummaryDigest = (summary: object): string =>
  `sha256:${canonicalJsonHash(deterministicSimulationSummaryPayload(summary))}`;

const parseCanonicalInteger = (
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number => {
  const source =
    typeof value === "number"
      ? Number.isSafeInteger(value)
        ? String(value)
        : ""
      : typeof value === "string"
        ? value
        : "";
  if (!/^(?:0|[1-9]\d*)$/u.test(source)) {
    throw new RangeError(`${label} must be a canonical non-negative decimal integer`);
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RangeError(`${label} must be from ${String(minimum)} through ${String(maximum)}`);
  }
  return parsed;
};

const parseSeedNamespace = (value: unknown): string => {
  if (typeof value !== "string" || !SEED_NAMESPACE_PATTERN.test(value)) {
    throw new RangeError(
      "seedNamespace must be 1 through 80 ASCII letters, digits, '.', '_', ':', or '-'",
    );
  }
  return value;
};

export const parseSimulationCiConfig = (value: unknown): SimulationCiConfig => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError("Simulation CI config must have schemaVersion 1");
  }
  const totalHands = parseCanonicalInteger(value.totalHands, "totalHands", 1, 10_000);
  const shardCount = parseCanonicalInteger(
    value.shardCount,
    "shardCount",
    1,
    NATURAL_SIMULATION_SHARD_COUNT,
  );
  if (shardCount !== NATURAL_SIMULATION_SHARD_COUNT) {
    throw new RangeError(`shardCount must be exactly ${String(NATURAL_SIMULATION_SHARD_COUNT)}`);
  }
  if (shardCount > totalHands) {
    throw new RangeError("shardCount cannot exceed totalHands");
  }
  const shardIndex =
    value.shardIndex === undefined
      ? undefined
      : parseCanonicalInteger(value.shardIndex, "shardIndex", 0, shardCount - 1);
  const seedNamespace = parseSeedNamespace(value.seedNamespace);
  return {
    schemaVersion: 1,
    totalHands,
    shardCount,
    ...(shardIndex === undefined ? {} : { shardIndex }),
    seedNamespace,
  };
};

export const readJsonFile = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

export const readSimulationCiConfig = async (path: string): Promise<SimulationCiConfig> =>
  parseSimulationCiConfig(await readJsonFile(path));

export const writeJsonFile = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
};

export const assignmentFor = (config: SimulationCiConfig): SimulationShardAssignment => {
  if (config.shardIndex === undefined) {
    throw new Error("Simulation shard config is missing shardIndex");
  }
  if (config.shardIndex < 0 || config.shardIndex >= config.shardCount) {
    throw new RangeError("Simulation shard index is outside the requested shard count");
  }
  const baseHands = Math.floor(config.totalHands / config.shardCount);
  const remainder = config.totalHands % config.shardCount;
  return {
    globalHandStart: config.shardIndex * baseHands + Math.min(config.shardIndex, remainder),
    assignedHands: baseHands + (config.shardIndex < remainder ? 1 : 0),
  };
};

export const shardSeedNamespace = (config: SimulationCiConfig): string => {
  if (config.shardIndex === undefined) {
    throw new Error("Simulation shard config is missing shardIndex");
  }
  return `${config.seedNamespace}:shard:${String(config.shardIndex).padStart(3, "0")}`;
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown simulation CI failure";

/** Keep failure artifacts useful without copying hidden engine details into CI receipts. */
export const redactedSimulationError = (error: unknown): string =>
  `simulation shard failed; errorDigest=sha256:${canonicalJsonHash(errorMessage(error))}`;
