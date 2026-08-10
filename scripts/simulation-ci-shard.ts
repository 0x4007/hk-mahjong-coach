import { runParallelBotSimulation } from "./simulation-pool.js";
import {
  SHARD_CONFIG_PATH,
  assignmentFor,
  errorMessage,
  readSimulationCiConfig,
  shardSeedNamespace,
  type SimulationShardFailureReceipt,
  type SimulationShardSuccessReceipt,
  writeJsonFile,
} from "./simulation-ci-common.js";

const main = async (): Promise<void> => {
  const config = await readSimulationCiConfig(SHARD_CONFIG_PATH);
  const assignment = assignmentFor(config);
  const seedNamespace = shardSeedNamespace(config);
  const receiptPath = `.ci/simulation-shard-${String(config.shardIndex)}.json`;

  try {
    const summary = await runParallelBotSimulation(assignment.assignedHands, {
      wallMode: "natural_shuffle",
      seedNamespace,
    });
    const receipt: SimulationShardSuccessReceipt = {
      schemaVersion: 1,
      status: "passed",
      totalHands: config.totalHands,
      shardCount: config.shardCount,
      shardIndex: config.shardIndex!,
      globalHandStart: assignment.globalHandStart,
      assignedHands: assignment.assignedHands,
      seedNamespace,
      summary,
    };
    await writeJsonFile(receiptPath, receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const receipt: SimulationShardFailureReceipt = {
      schemaVersion: 1,
      status: "failed",
      totalHands: config.totalHands,
      shardCount: config.shardCount,
      shardIndex: config.shardIndex!,
      globalHandStart: assignment.globalHandStart,
      assignedHands: assignment.assignedHands,
      seedNamespace,
      error: errorMessage(error),
    };
    await writeJsonFile(receiptPath, receipt);
    throw error;
  }
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
}
