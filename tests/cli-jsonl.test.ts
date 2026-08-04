import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hostProtocolEnvelopeSchema, type LegalActionDto } from "@hk-mahjong/protocol";

const repositoryRoot = process.cwd();

interface ActionRequestPayload {
  readonly playerId: string;
  readonly branchId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
  readonly legalActions: readonly LegalActionDto[];
}

const actionRequestPayload = (payload: unknown): ActionRequestPayload =>
  payload as ActionRequestPayload;

const nextLineWithTimeout = async (
  iterator: AsyncIterator<string>,
  timeoutMs: number,
): Promise<string> => {
  const result = await Promise.race([
    iterator.next(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for JSONL output after ${String(timeoutMs)}ms`)),
        timeoutMs,
      ),
    ),
  ]);
  if (result.done) throw new Error("JSONL host exited before the expected message");
  return result.value;
};

describe("CLI JSONL host", () => {
  it("lets a scripted legal-action agent complete a seeded hand", async () => {
    const home = await mkdtemp(join(tmpdir(), "hk-mahjong-cli-jsonl-agent-"));
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "apps/cli/src/index.ts",
        "play",
        "--output",
        "jsonl",
        "--mode",
        "learn",
        "--rules",
        "training_relaxed_v1",
        "--seed",
        "cli-jsonl-agent",
      ],
      {
        cwd: repositoryRoot,
        env: { ...process.env, HOME: home },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const output = createInterface({ input: child.stdout });
    const iterator = output[Symbol.asyncIterator]();
    const sequences: number[] = [];
    let acceptedActions = 0;
    let agentSequence = 0;
    try {
      for (;;) {
        const line = await nextLineWithTimeout(iterator, 120_000);
        const envelope = hostProtocolEnvelopeSchema.parse(JSON.parse(line) as unknown);
        sequences.push(envelope.seq);
        if (envelope.type === "action_request") {
          const payload = actionRequestPayload(envelope.payload);
          const gameId = envelope.gameId;
          if (gameId === undefined) {
            throw new Error("The JSONL host omitted the action request game ID");
          }
          const action = payload.legalActions[0];
          if (action === undefined) {
            throw new Error("The JSONL host emitted an empty legal-action list");
          }
          const request = {
            protocolVersion: 1,
            type: "submit_action",
            seq: agentSequence++,
            timestamp: new Date().toISOString(),
            gameId,
            branchId: envelope.branchId,
            requestId: envelope.requestId,
            payload: {
              playerId: payload.playerId,
              branchId: payload.branchId,
              expectedRevision: payload.expectedRevision,
              requestId: payload.requestId,
              actionId: action.id,
            },
          };
          child.stdin.write(`${JSON.stringify(request)}\n`);
        } else if (envelope.type === "action_accepted") {
          acceptedActions += 1;
        } else if (envelope.type === "hand_ended") {
          break;
        } else if (envelope.type === "action_rejected") {
          throw new Error("The legal-action agent received an action rejection");
        }
      }
      expect(acceptedActions).toBeGreaterThan(0);
      expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
      expect(new Set(sequences).size).toBe(sequences.length);
    } finally {
      child.kill("SIGTERM");
      output.close();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("close", () => resolve());
      });
      await rm(home, { recursive: true, force: true });
    }
  }, 130_000);

  it("publishes valid envelopes and records bounded timeout fallback", async () => {
    const home = await mkdtemp(join(tmpdir(), "hk-mahjong-cli-jsonl-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/cli/src/index.ts", "serve", "--stdio", "--seat", "player-0"],
      {
        cwd: repositoryRoot,
        env: { ...process.env, HOME: home },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const output = createInterface({ input: child.stdout });
    const iterator = output[Symbol.asyncIterator]();
    const sequences: number[] = [];
    let sawFallbackTimeout: boolean;
    let fallbackTimeoutMs: number;
    let fallbackMalformedResponses: number;
    try {
      for (;;) {
        const line = await nextLineWithTimeout(iterator, 8_000);
        const parsed: unknown = JSON.parse(line);
        const envelope = hostProtocolEnvelopeSchema.parse(parsed);
        sequences.push(envelope.seq);
        if (envelope.type === "error") {
          const errorPayload = envelope.payload as {
            code: string;
            details: Record<string, unknown>;
          };
          if (
            errorPayload.code === "external_agent_timeout" &&
            errorPayload.details.fallback === true
          ) {
            sawFallbackTimeout = true;
            fallbackTimeoutMs = Number(errorPayload.details.timeoutMs);
            fallbackMalformedResponses = Number(errorPayload.details.malformedResponses);
            break;
          }
        }
      }
      expect(sawFallbackTimeout).toBe(true);
      expect(fallbackTimeoutMs).toBe(1_000);
      expect(fallbackMalformedResponses).toBe(3);
      expect(sequences.length).toBeGreaterThanOrEqual(11);
      expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
      expect(new Set(sequences).size).toBe(sequences.length);
    } finally {
      child.kill("SIGTERM");
      output.close();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("close", () => resolve());
      });
      await rm(home, { recursive: true, force: true });
    }
  }, 20_000);
});
