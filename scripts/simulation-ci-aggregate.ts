import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJsonHash } from "@hk-mahjong/core";
import {
  SHARD_RECEIPT_DIRECTORY,
  AGGREGATE_RECEIPT_PATH,
  assignmentFor,
  errorMessage,
  hasExactKeys,
  isRecord,
  isRedactedSimulationError,
  isSha256Digest,
  readJsonFile,
  readSimulationCiConfig,
  REDACTED_SIMULATION_SUMMARY_KEYS,
  simulationSummaryDigest,
  type SimulationAggregateReceipt,
  type SimulationCiConfig,
  type SimulationShardReceipt,
  type SimulationShardSuccessReceipt,
  writeJsonFile,
  AGGREGATE_CONFIG_PATH,
} from "./simulation-ci-common.js";

const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const SHARD_RECEIPT_NAME_PATTERN = /^simulation-shard-\d+\.json$/u;
const ACTION_COUNT_KEYS = [
  "discard",
  "declare_win",
  "declare_concealed_kong",
  "declare_added_kong",
  "claim_chow",
  "claim_pung",
  "claim_kong",
  "claim_win",
  "pass",
  "start_next_hand",
] as const;
const CONFIGURATION_COUNT_KEYS = [
  "novice:fast",
  "novice:value",
  "novice:balanced",
  "basic:fast",
  "basic:value",
  "basic:balanced",
  "intermediate:fast",
  "intermediate:value",
  "intermediate:balanced",
  "advanced:fast",
  "advanced:value",
  "advanced:balanced",
] as const;

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isCountRecord = (value: unknown, keys: readonly string[]): boolean =>
  isRecord(value) &&
  hasExactKeys(value, keys) &&
  keys.every((key) => isSafeInteger(value[key]) && value[key] >= 0);

const isZeroFailureRecord = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const expectedKeys = [
    "illegalActions",
    "invariantViolations",
    "crashes",
    "commandBoundExceeded",
    "replayMismatches",
  ] as const;
  return hasExactKeys(value, expectedKeys) && expectedKeys.every((key) => value[key] === 0);
};

export const isSimulationSummary = (
  value: unknown,
): value is SimulationShardSuccessReceipt["summary"] => {
  if (!isRecord(value)) {
    return false;
  }
  const wallProfileCounts = value.wallProfileCounts;
  const replaySamples = value.replaySamples;
  const replaySampleIndices = value.replaySampleIndices;
  const rulesets = value.rulesets;
  const versions = value.versions;
  const latency = value.latency;
  const rulesetHandCounts = value.rulesetHandCounts;
  const terminationReasons = value.terminationReasons;
  const configurationCounts = value.configurationCounts;
  const decisionConfigurationCounts = value.decisionConfigurationCounts;
  const validRulesets =
    Array.isArray(rulesets) &&
    rulesets.length > 0 &&
    rulesets.every(
      (ruleset) =>
        isRecord(ruleset) &&
        hasExactKeys(ruleset, ["id", "version", "hash"]) &&
        typeof ruleset.id === "string" &&
        typeof ruleset.version === "string" &&
        isSha256Digest(ruleset.hash),
    );
  const rulesetIds = validRulesets
    ? (rulesets as readonly Readonly<Record<string, unknown>>[]).map(
        (ruleset) => ruleset.id as string,
      )
    : [];
  const digestMatches = (() => {
    try {
      return value.runDigest === simulationSummaryDigest(value);
    } catch {
      return false;
    }
  })();
  return (
    hasExactKeys(value, REDACTED_SIMULATION_SUMMARY_KEYS) &&
    value.schemaVersion === 1 &&
    isRecord(versions) &&
    hasExactKeys(versions, ["rng", "analysis", "botPolicy"]) &&
    typeof versions.rng === "string" &&
    typeof versions.analysis === "string" &&
    typeof versions.botPolicy === "string" &&
    value.wallMode === "natural_shuffle" &&
    typeof value.seedNamespace === "string" &&
    isSafeInteger(value.matchIndexOffset) &&
    value.matchIndexOffset >= 0 &&
    isSafeInteger(value.handIndexOffset) &&
    value.handIndexOffset >= 0 &&
    isSafeInteger(value.requestedHands) &&
    value.requestedHands >= 1 &&
    isSafeInteger(value.completedHands) &&
    value.completedHands >= 1 &&
    isSafeInteger(value.matchesStarted) &&
    value.matchesStarted >= 1 &&
    isSafeInteger(value.completedMatches) &&
    value.completedMatches >= 0 &&
    isSafeInteger(value.maximumAcceptedCommands) &&
    value.maximumAcceptedCommands >= 1 &&
    isNonNegativeFiniteNumber(value.meanAcceptedCommands) &&
    isSafeInteger(value.handDigestCount) &&
    value.handDigestCount === value.completedHands &&
    isRecord(wallProfileCounts) &&
    isCountRecord(wallProfileCounts, ["natural_shuffle", "terminal_regression"]) &&
    wallProfileCounts.natural_shuffle === value.completedHands &&
    wallProfileCounts.terminal_regression === 0 &&
    isCountRecord(value.actionCounts, ACTION_COUNT_KEYS) &&
    isCountRecord(terminationReasons, ["win", "exhaustive_draw", "sandbox_end"]) &&
    isCountRecord(configurationCounts, CONFIGURATION_COUNT_KEYS) &&
    isCountRecord(decisionConfigurationCounts, CONFIGURATION_COUNT_KEYS) &&
    validRulesets &&
    isCountRecord(rulesetHandCounts, rulesetIds) &&
    isRecord(latency) &&
    hasExactKeys(latency, [
      "p50Milliseconds",
      "p95Milliseconds",
      "p99Milliseconds",
      "maximumMilliseconds",
    ]) &&
    [
      latency.p50Milliseconds,
      latency.p95Milliseconds,
      latency.p99Milliseconds,
      latency.maximumMilliseconds,
    ].every(isNonNegativeFiniteNumber) &&
    isZeroFailureRecord(value.failures) &&
    isSha256Digest(value.handDigestRoot) &&
    isSha256Digest(value.runDigest) &&
    digestMatches &&
    Array.isArray(replaySamples) &&
    Array.isArray(replaySampleIndices) &&
    replaySamples.length === replaySampleIndices.length &&
    replaySamples.every(
      (sample) =>
        isRecord(sample) &&
        hasExactKeys(sample, ["globalHandIndex", "terminalStateHash", "eventPrefixDigest"]) &&
        isSafeInteger(sample.globalHandIndex) &&
        isSha256Digest(sample.terminalStateHash) &&
        isSha256Digest(sample.eventPrefixDigest),
    ) &&
    replaySampleIndices.every((index) => isSafeInteger(index) && index >= 0) &&
    Array.isArray(value.regressionSeeds) &&
    value.regressionSeeds.every((seed) => typeof seed === "string")
  );
};

export const parseReceipt = (value: unknown): SimulationShardReceipt => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    (value.status !== "passed" && value.status !== "failed") ||
    !isSafeInteger(value.totalHands) ||
    !isSafeInteger(value.shardCount) ||
    !isSafeInteger(value.shardIndex) ||
    !isSafeInteger(value.globalHandStart) ||
    !isSafeInteger(value.assignedHands) ||
    typeof value.seedNamespace !== "string"
  ) {
    throw new TypeError("Malformed simulation shard receipt");
  }
  if (value.status === "failed") {
    if (
      !hasExactKeys(value, [
        "schemaVersion",
        "status",
        "totalHands",
        "shardCount",
        "shardIndex",
        "globalHandStart",
        "assignedHands",
        "seedNamespace",
        "error",
      ])
    ) {
      throw new TypeError("Failed simulation shard receipt contains unexpected fields");
    }
    if (!isRedactedSimulationError(value.error)) {
      throw new TypeError("Failed simulation shard receipt is not redacted");
    }
    return value as unknown as SimulationShardReceipt;
  }
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "status",
      "totalHands",
      "shardCount",
      "shardIndex",
      "globalHandStart",
      "assignedHands",
      "seedNamespace",
      "summary",
    ])
  ) {
    throw new TypeError("Passed simulation shard receipt contains unexpected fields");
  }
  if (!isSimulationSummary(value.summary)) {
    throw new TypeError("Passed simulation shard receipt contains an invalid summary");
  }
  return value as unknown as SimulationShardReceipt;
};

const expectedAssignment = (
  config: SimulationCiConfig,
  shardIndex: number,
): { globalHandStart: number; assignedHands: number } => assignmentFor({ ...config, shardIndex });

export const validateSuccessReceipt = (
  config: SimulationCiConfig,
  receipt: SimulationShardSuccessReceipt,
): string | null => {
  if (receipt.shardIndex < 0 || receipt.shardIndex >= config.shardCount) {
    return `Shard ${String(receipt.shardIndex)} is outside the requested matrix`;
  }
  const expected = expectedAssignment(config, receipt.shardIndex);
  const expectedSeedNamespace = `${config.seedNamespace}:shard:${String(receipt.shardIndex).padStart(3, "0")}`;
  if (
    receipt.totalHands !== config.totalHands ||
    receipt.shardCount !== config.shardCount ||
    receipt.globalHandStart !== expected.globalHandStart ||
    receipt.assignedHands !== expected.assignedHands ||
    receipt.seedNamespace !== expectedSeedNamespace ||
    receipt.summary.requestedHands !== expected.assignedHands ||
    receipt.summary.completedHands !== expected.assignedHands ||
    receipt.summary.seedNamespace !== expectedSeedNamespace ||
    receipt.summary.matchIndexOffset !== expected.globalHandStart ||
    receipt.summary.handIndexOffset !== expected.globalHandStart
  ) {
    return `Shard ${String(receipt.shardIndex)} receipt does not match the requested partition`;
  }
  const expectedReplaySamples = Math.min(expected.assignedHands, 500);
  if (receipt.summary.replaySamples.length !== expectedReplaySamples) {
    return `Shard ${String(receipt.shardIndex)} replay sample count is not ${String(expectedReplaySamples)}`;
  }
  for (let index = 0; index < expectedReplaySamples; index += 1) {
    const expectedGlobalHandIndex = expected.globalHandStart + index;
    if (
      receipt.summary.replaySamples[index]?.globalHandIndex !== expectedGlobalHandIndex ||
      receipt.summary.replaySampleIndices[index] !== expectedGlobalHandIndex
    ) {
      return `Shard ${String(receipt.shardIndex)} replay samples do not cover its global hand range`;
    }
  }
  return null;
};

export interface SimulationShardReceiptInput {
  readonly name: string;
  readonly value?: unknown;
  readonly error?: string;
}

export const aggregateSimulationReceipts = (
  config: SimulationCiConfig,
  inputs: readonly SimulationShardReceiptInput[],
): SimulationAggregateReceipt => {
  const failures: string[] = [];
  const receipts = new Map<number, SimulationShardReceipt>();
  for (const input of inputs) {
    if (!SHARD_RECEIPT_NAME_PATTERN.test(input.name)) {
      failures.push(`${input.name}: unexpected shard receipt filename`);
      continue;
    }
    if (input.error !== undefined) {
      failures.push(`${input.name}: ${input.error}`);
      continue;
    }
    try {
      const receipt = parseReceipt(input.value);
      if (receipts.has(receipt.shardIndex)) {
        failures.push(`Duplicate receipt for shard ${String(receipt.shardIndex)}`);
      } else {
        receipts.set(receipt.shardIndex, receipt);
      }
    } catch (error) {
      failures.push(`${input.name}: ${errorMessage(error)}`);
    }
  }

  const successfulReceipts: SimulationShardSuccessReceipt[] = [];
  const seedNamespaces = new Set<string>();
  for (let shardIndex = 0; shardIndex < config.shardCount; shardIndex += 1) {
    const receipt = receipts.get(shardIndex);
    if (receipt === undefined) {
      failures.push(`Missing receipt for shard ${String(shardIndex)}`);
      continue;
    }
    if (receipt.status === "failed") {
      failures.push(`Shard ${String(shardIndex)} failed: ${receipt.error}`);
      continue;
    }
    const validationError = validateSuccessReceipt(config, receipt);
    if (validationError !== null) {
      failures.push(validationError);
      continue;
    }
    if (seedNamespaces.has(receipt.seedNamespace)) {
      failures.push(`Duplicate seed namespace ${receipt.seedNamespace}`);
      continue;
    }
    seedNamespaces.add(receipt.seedNamespace);
    successfulReceipts.push(receipt);
  }

  if (receipts.size !== config.shardCount) {
    failures.push(
      `Expected ${String(config.shardCount)} shard receipts, found ${String(receipts.size)}`,
    );
  }
  let expectedGlobalHandStart = 0;
  for (const receipt of successfulReceipts) {
    if (receipt.globalHandStart !== expectedGlobalHandStart) {
      failures.push(
        `Shard ${String(receipt.shardIndex)} starts at ${String(receipt.globalHandStart)} instead of ${String(expectedGlobalHandStart)}`,
      );
    }
    expectedGlobalHandStart += receipt.assignedHands;
  }
  if (expectedGlobalHandStart !== config.totalHands) {
    failures.push(
      `Shard coverage ends at ${String(expectedGlobalHandStart)} instead of ${String(config.totalHands)}`,
    );
  }
  const completedHands = successfulReceipts.reduce(
    (total, receipt) => total + receipt.assignedHands,
    0,
  );
  if (completedHands !== config.totalHands) {
    failures.push(
      `Expected ${String(config.totalHands)} completed hands, found ${String(completedHands)}`,
    );
  }
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  const shards = successfulReceipts
    .sort((left, right) => left.shardIndex - right.shardIndex)
    .map((receipt) => ({
      shardIndex: receipt.shardIndex,
      globalHandStart: receipt.globalHandStart,
      assignedHands: receipt.assignedHands,
      seedNamespace: receipt.seedNamespace,
      handDigestRoot: receipt.summary.handDigestRoot,
      runDigest: receipt.summary.runDigest,
    }));
  const aggregatePayload = {
    schemaVersion: 1 as const,
    totalHands: config.totalHands,
    shardCount: config.shardCount,
    completedHands,
    shards,
  };
  return {
    ...aggregatePayload,
    status: "passed",
    aggregateDigest: `sha256:${canonicalJsonHash(aggregatePayload)}`,
  };
};

const aggregate = async (): Promise<SimulationAggregateReceipt> => {
  const config = await readSimulationCiConfig(AGGREGATE_CONFIG_PATH);
  const entries = await readdir(SHARD_RECEIPT_DIRECTORY, { withFileTypes: true }).catch(() => []);
  const receiptNames = entries.map((entry) => entry.name).sort();
  const inputs: SimulationShardReceiptInput[] = [];
  for (const name of receiptNames) {
    try {
      inputs.push({ name, value: await readJsonFile(`${SHARD_RECEIPT_DIRECTORY}/${name}`) });
    } catch (error) {
      inputs.push({ name, error: errorMessage(error) });
    }
  }
  return aggregateSimulationReceipts(config, inputs);
};

const isEntrypoint =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  try {
    const receipt = await aggregate();
    await writeJsonFile(AGGREGATE_RECEIPT_PATH, receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
