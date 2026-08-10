import { readdir } from "node:fs/promises";
import { canonicalJsonHash } from "@hk-mahjong/core";
import {
  SHARD_RECEIPT_DIRECTORY,
  assignmentFor,
  errorMessage,
  isRecord,
  isSha256Digest,
  readJsonFile,
  readSimulationCiConfig,
  type SimulationAggregateReceipt,
  type SimulationCiConfig,
  type SimulationShardReceipt,
  type SimulationShardSuccessReceipt,
  writeJsonFile,
  AGGREGATE_CONFIG_PATH,
} from "./simulation-ci-common.js";

const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

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
  return expectedKeys.every((key) => value[key] === 0);
};

const isSimulationSummary = (value: unknown): value is SimulationShardSuccessReceipt["summary"] => {
  if (!isRecord(value)) {
    return false;
  }
  const wallProfileCounts = value.wallProfileCounts;
  const replaySamples = value.replaySamples;
  const replaySampleIndices = value.replaySampleIndices;
  const rulesets = value.rulesets;
  return (
    value.schemaVersion === 1 &&
    value.wallMode === "natural_shuffle" &&
    typeof value.seedNamespace === "string" &&
    isSafeInteger(value.requestedHands) &&
    value.requestedHands >= 1 &&
    isSafeInteger(value.completedHands) &&
    value.completedHands >= 1 &&
    isSafeInteger(value.handDigestCount) &&
    value.handDigestCount === value.completedHands &&
    isRecord(wallProfileCounts) &&
    wallProfileCounts.natural_shuffle === value.completedHands &&
    wallProfileCounts.terminal_regression === 0 &&
    isZeroFailureRecord(value.failures) &&
    isSha256Digest(value.handDigestRoot) &&
    isSha256Digest(value.runDigest) &&
    Array.isArray(replaySamples) &&
    Array.isArray(replaySampleIndices) &&
    replaySamples.length === replaySampleIndices.length &&
    replaySamples.every(
      (sample) =>
        isRecord(sample) &&
        isSafeInteger(sample.globalHandIndex) &&
        isSha256Digest(sample.terminalStateHash) &&
        isSha256Digest(sample.eventPrefixDigest),
    ) &&
    replaySampleIndices.every((index) => isSafeInteger(index) && index >= 0) &&
    Array.isArray(rulesets) &&
    rulesets.length > 0 &&
    rulesets.every(
      (ruleset) =>
        isRecord(ruleset) &&
        typeof ruleset.id === "string" &&
        typeof ruleset.version === "string" &&
        typeof ruleset.hash === "string",
    )
  );
};

const parseReceipt = (value: unknown): SimulationShardReceipt => {
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
    if (typeof value.error !== "string" || value.error.length === 0) {
      throw new TypeError("Failed simulation shard receipt is missing error");
    }
    return value as unknown as SimulationShardReceipt;
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

const validateSuccessReceipt = (
  config: SimulationCiConfig,
  receipt: SimulationShardSuccessReceipt,
): string | null => {
  const expected = expectedAssignment(config, receipt.shardIndex);
  const expectedSeedNamespace = `${config.seedNamespace}:shard:${String(receipt.shardIndex).padStart(2, "0")}`;
  if (
    receipt.totalHands !== config.totalHands ||
    receipt.shardCount !== config.shardCount ||
    receipt.globalHandStart !== expected.globalHandStart ||
    receipt.assignedHands !== expected.assignedHands ||
    receipt.seedNamespace !== expectedSeedNamespace ||
    receipt.summary.requestedHands !== expected.assignedHands ||
    receipt.summary.completedHands !== expected.assignedHands ||
    receipt.summary.seedNamespace !== expectedSeedNamespace
  ) {
    return `Shard ${String(receipt.shardIndex)} receipt does not match the requested partition`;
  }
  const expectedReplaySamples = Math.min(expected.assignedHands, 500);
  if (receipt.summary.replaySamples.length !== expectedReplaySamples) {
    return `Shard ${String(receipt.shardIndex)} replay sample count is not ${String(expectedReplaySamples)}`;
  }
  return null;
};

const aggregate = async (): Promise<SimulationAggregateReceipt> => {
  const config = await readSimulationCiConfig(AGGREGATE_CONFIG_PATH);
  const entries = await readdir(SHARD_RECEIPT_DIRECTORY, { withFileTypes: true }).catch(() => []);
  const receiptNames = entries
    .filter((entry) => entry.isFile() && /^simulation-shard-\d+\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const failures: string[] = [];
  const receipts = new Map<number, SimulationShardReceipt>();
  for (const name of receiptNames) {
    try {
      const receipt = parseReceipt(await readJsonFile(`${SHARD_RECEIPT_DIRECTORY}/${name}`));
      if (receipts.has(receipt.shardIndex)) {
        failures.push(`Duplicate receipt for shard ${String(receipt.shardIndex)}`);
      } else {
        receipts.set(receipt.shardIndex, receipt);
      }
    } catch (error) {
      failures.push(`${name}: ${errorMessage(error)}`);
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
    shards,
  };
  return {
    ...aggregatePayload,
    status: "passed",
    completedHands,
    aggregateDigest: `sha256:${canonicalJsonHash(aggregatePayload)}`,
  };
};

try {
  const receipt = await aggregate();
  await writeJsonFile(".ci/simulation-aggregate.json", receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
}
