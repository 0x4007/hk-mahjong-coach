import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hostProtocolEnvelopeSchema } from "@hk-mahjong/protocol";

const repositoryRoot = process.cwd();

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
