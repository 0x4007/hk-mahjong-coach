import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const runWorker = (operation: "benchmark" | "write", databasePath: string): unknown => {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
  delete childEnvironment.NODE_V8_COVERAGE;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", join(process.cwd(), "tests/fixtures/persistence-restart-worker.ts")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnvironment,
      input: JSON.stringify({ operation, databasePath }),
    },
  );
  if (child.error !== undefined) {
    throw child.error;
  }
  if (child.status !== 0) {
    throw new Error(`Persistence performance worker failed: ${child.stderr}`);
  }
  return JSON.parse(child.stdout) as unknown;
};

describe("persistence performance", () => {
  it("loads an ordinary saved game in under 500 ms", () => {
    const directory = mkdtempSync(join(tmpdir(), "hk-mahjong-persistence-performance-"));
    directories.push(directory);
    const databasePath = join(directory, "coach.sqlite");
    runWorker("write", databasePath);
    const result = runWorker("benchmark", databasePath);
    if (
      typeof result !== "object" ||
      result === null ||
      !("resumeDurationMs" in result) ||
      typeof result.resumeDurationMs !== "number"
    ) {
      throw new Error("Persistence performance worker response is invalid");
    }
    expect(result.resumeDurationMs).toBeLessThan(500);
  }, 120_000);
});
