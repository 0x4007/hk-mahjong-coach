import { describe, expect, it } from "vitest";
import { runBotSimulation } from "./simulation.js";

describe("natural shuffled-wall simulation", () => {
  it("supports a fully natural shuffled-wall mode", { timeout: 120_000 }, () => {
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
