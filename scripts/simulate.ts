import { runParallelBotSimulation } from "./simulation-pool.js";

const parseRequestedHands = (arguments_: readonly string[]): number => {
  if (arguments_.length > 1) {
    throw new RangeError("Usage: pnpm exec tsx scripts/simulate.ts [hands]");
  }
  const source = arguments_[0] ?? "10000";
  if (!/^[1-9]\d*$/u.test(source)) {
    throw new RangeError("Simulation count must be a canonical positive decimal integer");
  }
  const requestedHands = Number(source);
  if (!Number.isSafeInteger(requestedHands) || requestedHands > 10_000) {
    throw new RangeError("Simulation count must be from 1 through 10000");
  }
  return requestedHands;
};

try {
  const summary = await runParallelBotSimulation(parseRequestedHands(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown simulation failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
