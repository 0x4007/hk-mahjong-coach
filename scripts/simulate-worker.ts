import { parentPort } from "node:worker_threads";
import {
  runBotMatchSimulation,
  type BotSimulationMatchLedger,
  type BotSimulationOptions,
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

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isBotSimulationOptions = (value: unknown): value is BotSimulationOptions => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.wallMode === undefined ||
      value.wallMode === "mixed" ||
      value.wallMode === "natural_shuffle") &&
    (value.seedNamespace === undefined || typeof value.seedNamespace === "string") &&
    (value.matchIndexOffset === undefined || isNonNegativeSafeInteger(value.matchIndexOffset)) &&
    (value.handIndexOffset === undefined || isNonNegativeSafeInteger(value.handIndexOffset))
  );
};

const isSimulateMatchRequest = (value: unknown): value is SimulateMatchRequest =>
  isRecord(value) &&
  value.type === "simulate_match" &&
  Number.isSafeInteger(value.matchIndex) &&
  Number(value.matchIndex) >= 0 &&
  Number.isSafeInteger(value.maximumHands) &&
  Number(value.maximumHands) >= 1 &&
  Number(value.maximumHands) <= 10_000 &&
  isBotSimulationOptions(value.options);

const port = parentPort;
if (port === null) {
  throw new Error("The simulation worker must run inside a worker thread");
}

port.on("message", (value: unknown) => {
  if (!isSimulateMatchRequest(value)) {
    const response: SimulationWorkerResponse = {
      type: "worker_error",
      matchIndex: null,
      message: "Simulation worker received an invalid request",
    };
    port.postMessage(response);
    return;
  }
  try {
    const match = runBotMatchSimulation(value.matchIndex, value.maximumHands, value.options);
    const response: SimulationWorkerResponse = {
      type: "match_complete",
      matchIndex: value.matchIndex,
      match,
    };
    port.postMessage(response);
  } catch (error) {
    const response: SimulationWorkerResponse = {
      type: "worker_error",
      matchIndex: value.matchIndex,
      message: error instanceof Error ? error.message : "Unknown simulation worker failure",
    };
    port.postMessage(response);
  }
});

const ready: SimulationWorkerResponse = { type: "ready" };
port.postMessage(ready);
