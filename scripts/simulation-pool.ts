import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import {
  createBotSimulationAccumulator,
  type BotSimulationOptions,
  type BotSimulationMatchLedger,
  type BotSimulationSummary,
} from "@hk-mahjong/test-fixtures";

interface SimulateMatchRequest {
  type: "simulate_match";
  matchIndex: number;
  maximumHands: number;
  options: BotSimulationOptions;
}

type SimulationWorkerResponse =
  | { type: "ready" }
  | {
      type: "match_complete";
      matchIndex: number;
      match: BotSimulationMatchLedger;
    }
  | {
      type: "worker_error";
      matchIndex: number | null;
      message: string;
    };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isWorkerResponse = (value: unknown): value is SimulationWorkerResponse => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "ready") {
    return true;
  }
  if (value.type === "worker_error") {
    return (
      (value.matchIndex === null || Number.isSafeInteger(value.matchIndex)) &&
      typeof value.message === "string"
    );
  }
  return (
    value.type === "match_complete" &&
    Number.isSafeInteger(value.matchIndex) &&
    isRecord(value.match)
  );
};

const workerCountFor = (requestedHands: number): number =>
  Math.max(1, Math.min(requestedHands, availableParallelism() - 1));

export const runParallelBotSimulation = async (
  requestedHands: number,
  options: BotSimulationOptions = {},
): Promise<BotSimulationSummary> => {
  const accumulator = createBotSimulationAccumulator(requestedHands, options);
  const workerCount = workerCountFor(requestedHands);
  const maximumAhead = workerCount * 2;
  const workers: Worker[] = [];
  const idleWorkers = new Set<Worker>();
  const activeMatches = new Map<Worker, number>();
  const completedMatches = new Map<number, BotSimulationMatchLedger>();
  let nextMatchToSchedule = accumulator.nextMatchIndex;
  let settled = false;

  const terminateWorkers = async (): Promise<void> => {
    await Promise.allSettled(workers.map(async (worker) => await worker.terminate()));
  };

  return await new Promise<BotSimulationSummary>((resolve, reject) => {
    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      const failure = error instanceof Error ? error : new Error("Unknown simulation pool failure");
      void terminateWorkers().then(() => {
        reject(failure);
      });
    };

    const finish = (): void => {
      if (settled) {
        return;
      }
      let summary: BotSimulationSummary;
      try {
        summary = accumulator.finish();
      } catch (error) {
        fail(error);
        return;
      }
      settled = true;
      void terminateWorkers().then(() => {
        resolve(summary);
      });
    };

    const consumeMatches = (): boolean => {
      while (!accumulator.complete) {
        const match = completedMatches.get(accumulator.nextMatchIndex);
        if (match === undefined) {
          break;
        }
        completedMatches.delete(accumulator.nextMatchIndex);
        accumulator.acceptMatch(match);
      }
      if (accumulator.complete) {
        finish();
        return true;
      }
      return false;
    };

    const pump = (): void => {
      if (settled) {
        return;
      }
      try {
        if (consumeMatches()) {
          return;
        }
        for (const worker of [...idleWorkers]) {
          if (nextMatchToSchedule >= accumulator.nextMatchIndex + maximumAhead) {
            break;
          }
          idleWorkers.delete(worker);
          const matchIndex = nextMatchToSchedule;
          nextMatchToSchedule += 1;
          activeMatches.set(worker, matchIndex);
          const request: SimulateMatchRequest = {
            type: "simulate_match",
            matchIndex,
            maximumHands: requestedHands,
            options,
          };
          worker.postMessage(request);
        }
      } catch (error) {
        fail(error);
      }
    };

    for (let index = 0; index < workerCount; index += 1) {
      const worker = new Worker(new URL("./simulate-worker.ts", import.meta.url));
      workers.push(worker);
      worker.on("message", (value: unknown) => {
        if (!isWorkerResponse(value)) {
          fail(new Error("Simulation worker returned a malformed response"));
          return;
        }
        if (value.type === "ready") {
          idleWorkers.add(worker);
          pump();
          return;
        }
        const activeMatchIndex = activeMatches.get(worker);
        if (value.type === "worker_error") {
          fail(
            new Error(
              `Simulation worker failed for match ${String(value.matchIndex)}: ${value.message}`,
            ),
          );
          return;
        }
        if (
          activeMatchIndex === undefined ||
          activeMatchIndex !== value.matchIndex ||
          value.match.matchIndex !== value.matchIndex
        ) {
          fail(new Error("Simulation worker returned a result for the wrong match"));
          return;
        }
        activeMatches.delete(worker);
        idleWorkers.add(worker);
        completedMatches.set(value.matchIndex, value.match);
        pump();
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (!settled && code !== 0) {
          fail(new Error(`Simulation worker exited unexpectedly with code ${String(code)}`));
        }
      });
    }
  });
};
