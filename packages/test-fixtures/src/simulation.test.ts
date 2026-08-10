import { describe, expect, it } from "vitest";
import { runBotSimulation } from "./simulation.js";

describe("seeded bot simulation", () => {
  it("finishes a seeded normal-policy hand without illegal actions", { timeout: 60_000 }, () => {
    const summary = runBotSimulation(1);

    expect(summary.completedHands).toBe(1);
    expect(summary.failures).toEqual({
      illegalActions: 0,
      invariantViolations: 0,
      crashes: 0,
      commandBoundExceeded: 0,
      replayMismatches: 0,
    });
    expect(summary.terminationReasons.win + summary.terminationReasons.exhaustive_draw).toBe(1);
    expect(summary.meanAcceptedCommands).toBeGreaterThan(10);
    expect(summary.actionCounts.discard).toBeGreaterThan(1);
    expect(
      Object.values(summary.decisionConfigurationCounts).reduce((total, count) => total + count, 0),
    ).toBeGreaterThan(10);
    expect(summary.replaySamples).toHaveLength(1);
  });

  it("repeats the same action and replay receipt for the same seeds", { timeout: 60_000 }, () => {
    expect(runBotSimulation(1).runDigest).toBe(runBotSimulation(1).runDigest);
  });

  it("supports a fully natural shuffled-wall mode", { timeout: 60_000 }, () => {
    const summary = runBotSimulation(1, {
      wallMode: "natural_shuffle",
      seedNamespace: "test-natural",
    });

    expect(summary.wallMode).toBe("natural_shuffle");
    expect(summary.seedNamespace).toBe("test-natural");
    expect(summary.wallProfileCounts).toEqual({
      natural_shuffle: 1,
      terminal_regression: 0,
    });
  });
});
