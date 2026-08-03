import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BotSimulationSummary } from "@hk-mahjong/test-fixtures";
import {
  aggregateSimulationReceipts,
  type SimulationShardReceiptInput,
} from "../scripts/simulation-ci-aggregate";
import {
  NATURAL_SIMULATION_SHARD_COUNT,
  assignmentFor,
  isRedactedSimulationError,
  parseSimulationCiConfig,
  redactSimulationSummary,
  redactedSimulationError,
  shardSeedNamespace,
  simulationSummaryDigest,
} from "../scripts/simulation-ci-common";

const NATURAL_HANDS = 128;
const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
const workflowSource = readFileSync(
  new URL("../.github/workflows/natural-simulation.yml", import.meta.url),
  "utf8",
);

const configFor = (shardIndex: number) =>
  parseSimulationCiConfig({
    schemaVersion: 1,
    totalHands: 500,
    shardCount: NATURAL_SIMULATION_SHARD_COUNT,
    shardIndex,
    seedNamespace: "m4-natural-ci-v1",
  });

const BASE_SUMMARY_WITHOUT_DIGEST = {
  schemaVersion: 1,
  versions: {
    rng: "xoshiro128ss-v1",
    analysis: "1.0.0",
    botPolicy: "1.0.0",
  },
  rulesets: [{ id: "hk_nyc_social_v1", version: "1.0.0", hash: ZERO_DIGEST }],
  wallMode: "natural_shuffle",
  seedNamespace: "m4-natural-ci-v1:shard:000",
  matchIndexOffset: 0,
  handIndexOffset: 0,
  requestedHands: 1,
  completedHands: 1,
  matchesStarted: 1,
  completedMatches: 0,
  replaySamples: [
    {
      globalHandIndex: 0,
      terminalStateHash: ZERO_DIGEST,
      eventPrefixDigest: ZERO_DIGEST,
    },
  ],
  replaySampleIndices: [0],
  handDigestCount: 1,
  handDigestRoot: ZERO_DIGEST,
  maximumAcceptedCommands: 1,
  meanAcceptedCommands: 1,
  actionCounts: {
    discard: 1,
    declare_win: 0,
    declare_concealed_kong: 0,
    declare_added_kong: 0,
    claim_chow: 0,
    claim_pung: 0,
    claim_kong: 0,
    claim_win: 0,
    pass: 0,
    start_next_hand: 0,
  },
  terminationReasons: { win: 1, exhaustive_draw: 0, sandbox_end: 0 },
  rulesetHandCounts: { hk_nyc_social_v1: 1 },
  wallProfileCounts: { natural_shuffle: 1, terminal_regression: 0 },
  configurationCounts: {
    "novice:fast": 1,
    "novice:value": 0,
    "novice:balanced": 0,
    "basic:fast": 0,
    "basic:value": 0,
    "basic:balanced": 0,
    "intermediate:fast": 0,
    "intermediate:value": 0,
    "intermediate:balanced": 0,
    "advanced:fast": 0,
    "advanced:value": 0,
    "advanced:balanced": 0,
  },
  decisionConfigurationCounts: {
    "novice:fast": 1,
    "novice:value": 0,
    "novice:balanced": 0,
    "basic:fast": 0,
    "basic:value": 0,
    "basic:balanced": 0,
    "intermediate:fast": 0,
    "intermediate:value": 0,
    "intermediate:balanced": 0,
    "advanced:fast": 0,
    "advanced:value": 0,
    "advanced:balanced": 0,
  },
  regressionSeeds: [],
  failures: {
    illegalActions: 0,
    invariantViolations: 0,
    crashes: 0,
    commandBoundExceeded: 0,
    replayMismatches: 0,
  },
  latency: {
    p50Milliseconds: 0,
    p95Milliseconds: 0,
    p99Milliseconds: 0,
    maximumMilliseconds: 0,
  },
} satisfies Omit<BotSimulationSummary, "runDigest">;

const BASE_SUMMARY: BotSimulationSummary = {
  ...BASE_SUMMARY_WITHOUT_DIGEST,
  runDigest: simulationSummaryDigest(BASE_SUMMARY_WITHOUT_DIGEST),
};

const receiptInputsFor = (): SimulationShardReceiptInput[] => {
  return Array.from({ length: NATURAL_SIMULATION_SHARD_COUNT }, (_, shardIndex) => {
    const config = parseSimulationCiConfig({
      schemaVersion: 1,
      totalHands: NATURAL_HANDS,
      shardCount: NATURAL_SIMULATION_SHARD_COUNT,
      shardIndex,
      seedNamespace: "m4-natural-ci-v1",
    });
    const assignment = assignmentFor(config);
    const seedNamespace = shardSeedNamespace(config);
    const summaryBeforeDigest: BotSimulationSummary = {
      ...BASE_SUMMARY,
      seedNamespace,
      matchIndexOffset: assignment.globalHandStart,
      handIndexOffset: assignment.globalHandStart,
      replaySamples: BASE_SUMMARY.replaySamples.map((sample) => ({
        ...sample,
        globalHandIndex: assignment.globalHandStart,
      })),
      replaySampleIndices: [assignment.globalHandStart],
    };
    const summary = redactSimulationSummary({
      ...summaryBeforeDigest,
      runDigest: simulationSummaryDigest(summaryBeforeDigest),
    });
    return {
      name: `simulation-shard-${String(shardIndex)}.json`,
      value: {
        schemaVersion: 1,
        status: "passed",
        totalHands: NATURAL_HANDS,
        shardCount: NATURAL_SIMULATION_SHARD_COUNT,
        shardIndex,
        globalHandStart: assignment.globalHandStart,
        assignedHands: assignment.assignedHands,
        seedNamespace,
        summary,
      },
    };
  });
};

describe("natural simulation CI partitioning", () => {
  it("requires exactly 128 shards", () => {
    expect(NATURAL_SIMULATION_SHARD_COUNT).toBe(128);
    expect(() =>
      parseSimulationCiConfig({
        schemaVersion: 1,
        totalHands: 500,
        shardCount: 20,
        seedNamespace: "m4-natural-ci-v1",
      }),
    ).toThrow(/shardCount must be exactly 128/u);
    expect(() =>
      parseSimulationCiConfig({
        schemaVersion: 1,
        totalHands: 127,
        shardCount: NATURAL_SIMULATION_SHARD_COUNT,
        seedNamespace: "m4-natural-ci-v1",
      }),
    ).toThrow(/shardCount cannot exceed totalHands/u);
    const redacted = redactedSimulationError(new Error("hidden physical tile characters.5#3"));
    expect(isRedactedSimulationError(redacted)).toBe(true);
    expect(redacted).not.toContain("characters.5#3");
  });

  it("covers the requested hands contiguously with distinct shard seeds", () => {
    let expectedGlobalHandStart = 0;
    const seedNamespaces = new Set<string>();

    for (let shardIndex = 0; shardIndex < NATURAL_SIMULATION_SHARD_COUNT; shardIndex += 1) {
      const config = configFor(shardIndex);
      const assignment = assignmentFor(config);
      expect(assignment.globalHandStart).toBe(expectedGlobalHandStart);
      expect(assignment.assignedHands).toBeGreaterThan(0);
      expectedGlobalHandStart += assignment.assignedHands;
      seedNamespaces.add(shardSeedNamespace(config));
    }

    expect(expectedGlobalHandStart).toBe(500);
    expect(seedNamespaces).toHaveLength(128);
    expect(seedNamespaces).toContain("m4-natural-ci-v1:shard:000");
    expect(seedNamespaces).toContain("m4-natural-ci-v1:shard:127");
  });

  it("pins the remote workflow to one 128-entry matrix and the Free-plan cap", () => {
    expect(workflowSource).toMatch(/workflow_dispatch:/u);
    const matrixBlock = workflowSource.match(/matrix:\s*\n\s*shard:\s*\[([\s\S]*?)\n\s*\]/u)?.[1];
    expect(matrixBlock).toBeDefined();
    const shardIndices = [...(matrixBlock ?? "").matchAll(/^\s*(\d+),?\s*$/gmu)].map((match) =>
      Number(match[1]),
    );
    expect(shardIndices).toEqual(Array.from({ length: 128 }, (_, index) => index));
    expect(workflowSource).toMatch(/max-parallel:\s*20/u);
    expect(workflowSource).toMatch(/permissions:\s*\n\s+contents:\s*read/u);
    expect(workflowSource).toMatch(
      /concurrency:\s*\n\s+group: natural-simulation-\$\{\{ github\.repository \}\}/u,
    );
    expect(workflowSource).toMatch(/cancel-in-progress:\s*false/u);
    expect(workflowSource).toMatch(/\$\{#REQUESTED_HANDS\} > 5/u);
    expect(workflowSource.match(/include-hidden-files:\s*true/gu)).toHaveLength(2);
    expect(workflowSource.match(/Validate dispatch inputs once/gu)).toHaveLength(1);
    expect(workflowSource).not.toMatch(/inputs\.shards/u);
    expect(workflowSource).not.toMatch(/pnpm\s+(?:test:sim|test:sim:fast)/u);
  });

  it(
    "accepts all 128 redacted receipts and rejects digest or coverage tampering",
    { timeout: 60_000 },
    () => {
      const inputs = receiptInputsFor();
      const config = parseSimulationCiConfig({
        schemaVersion: 1,
        totalHands: NATURAL_HANDS,
        shardCount: NATURAL_SIMULATION_SHARD_COUNT,
        seedNamespace: "m4-natural-ci-v1",
      });
      const aggregate = aggregateSimulationReceipts(config, inputs);
      expect(aggregate.status).toBe("passed");
      expect(aggregate.completedHands).toBe(NATURAL_HANDS);
      expect(aggregate.shards).toHaveLength(NATURAL_SIMULATION_SHARD_COUNT);
      expect(aggregate.aggregateDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(aggregate).toEqual(aggregateSimulationReceipts(config, inputs));

      const tampered = inputs.map((input, index) =>
        index === 0
          ? {
              ...input,
              value: {
                ...(input.value as Record<string, unknown>),
                summary: {
                  ...((input.value as Record<string, unknown>).summary as Record<string, unknown>),
                  runDigest: `sha256:${"0".repeat(64)}`,
                },
              },
            }
          : input,
      );
      expect(() => aggregateSimulationReceipts(config, tampered)).toThrow(
        /invalid summary|digest/u,
      );
      expect(() => aggregateSimulationReceipts(config, inputs.slice(0, -1))).toThrow(
        /Missing receipt for shard 127/u,
      );
      expect(() =>
        aggregateSimulationReceipts(config, [...inputs, { name: "events.json", value: {} }]),
      ).toThrow(/unexpected shard receipt filename/u);
    },
  );
});
