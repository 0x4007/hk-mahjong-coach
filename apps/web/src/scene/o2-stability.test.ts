import { describe, expect, it } from "vitest";

import { resolveO2Stability } from "./o2-stability.js";

describe("continuous O₂ stability response", () => {
  it("changes smoothly between nearby reserve values", () => {
    const lower = resolveO2Stability({ oxygenRatio: 0.4, aimingDownSights: true });
    const higher = resolveO2Stability({ oxygenRatio: 0.41, aimingDownSights: true });

    expect(higher.breathlessness).toBeLessThan(lower.breathlessness);
    expect(higher.reticleSwayRadians).toBeLessThan(lower.reticleSwayRadians);
    expect(higher.weaponSwayRadians).toBeLessThan(lower.weaponSwayRadians);
    expect(higher.accuracyMultiplier).toBeLessThan(lower.accuracyMultiplier);
    expect(lower.reticleSwayRadians - higher.reticleSwayRadians).toBeLessThan(0.001);
  });

  it("centres aim while holding breath, then restores sway with no O₂", () => {
    const strained = resolveO2Stability({ oxygenRatio: 0.2, aimingDownSights: true });
    const controlled = resolveO2Stability({
      oxygenRatio: 0.2,
      aimingDownSights: true,
      holdingBreath: true,
    });
    const exhausted = resolveO2Stability({
      oxygenRatio: 0,
      aimingDownSights: true,
      holdingBreath: true,
    });
    const unheldExhausted = resolveO2Stability({ oxygenRatio: 0, aimingDownSights: true });

    expect(controlled.reticleSwayRadians).toBe(0);
    expect(controlled.weaponSwayRadians).toBe(0);
    expect(controlled.accuracyMultiplier).toBeLessThan(strained.accuracyMultiplier);
    expect(controlled.accuracyMultiplier).toBeGreaterThanOrEqual(1);
    expect(exhausted.reticleSwayRadians).toBe(unheldExhausted.reticleSwayRadians);
    expect(exhausted.weaponSwayRadians).toBe(unheldExhausted.weaponSwayRadians);
  });
});
