import { describe, expect, it } from "vitest";
import { runBotSimulation } from "./simulation.js";

describe("seeded bot simulation", () => {
  it("finishes a seeded normal-policy hand without illegal actions", { timeout: 60_000 }, () => {
    const summary = runBotSimulation(1, {
      matchIndexOffset: 3,
      seedNamespace: "test-terminal-policy",
    });

    expect(summary.completedHands).toBe(1);
    expect(summary.failures).toEqual({
      illegalActions: 0,
      invariantViolations: 0,
      crashes: 0,
      commandBoundExceeded: 0,
      replayMismatches: 0,
    });
    expect(summary.terminationReasons.win + summary.terminationReasons.exhaustive_draw).toBe(1);
    expect(summary.wallProfileCounts).toEqual({
      natural_shuffle: 0,
      terminal_regression: 1,
    });
    expect(summary.meanAcceptedCommands).toBeGreaterThan(0);
    expect(summary.actionCounts.discard).toBeGreaterThan(0);
    expect(
      Object.values(summary.decisionConfigurationCounts).reduce((total, count) => total + count, 0),
    ).toBeGreaterThan(0);
    expect(summary.replaySamples).toHaveLength(1);
  });

  it("repeats the same action and replay receipt for the same seeds", { timeout: 60_000 }, () => {
    const options = {
      matchIndexOffset: 3,
      seedNamespace: "test-terminal-repeat",
    } as const;
    expect(runBotSimulation(1, options).runDigest).toBe(runBotSimulation(1, options).runDigest);
  });

  it(
    "preserves match and global hand offsets in deterministic receipts",
    { timeout: 60_000 },
    () => {
      const summary = runBotSimulation(1, {
        wallMode: "natural_shuffle",
        seedNamespace: "test-offsets",
        matchIndexOffset: 7,
        handIndexOffset: 11,
      });

      expect(summary.matchIndexOffset).toBe(7);
      expect(summary.handIndexOffset).toBe(11);
      expect(summary.replaySampleIndices).toEqual([11]);
      expect(summary.replaySamples[0]?.globalHandIndex).toBe(11);
    },
  );
});
