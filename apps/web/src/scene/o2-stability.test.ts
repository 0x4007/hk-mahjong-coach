import { describe, expect, it } from "vitest";

import {
  O2_SCREEN_BLUR_MAX_PIXELS,
  O2_SCREEN_BLUR_ZOOM_MAX_PIXELS,
  O2_SCREEN_CONTRAST_MAX_MULTIPLIER,
  O2_SCREEN_VIGNETTE_MAX_STRENGTH,
  O2_BRACED_STABILITY_FACTOR,
  O2_CROUCH_STABILITY_FACTOR,
  O2_WALL_BRACE_STABILITY_FACTOR,
  resolveO2Stability,
} from "./o2-stability.js";

describe("continuous O₂ stability response", () => {
  it("maps reserve continuously to a bounded fatigue blur", () => {
    const rested = resolveO2Stability({ oxygenRatio: 1 });
    const strained = resolveO2Stability({ oxygenRatio: 0.25 });
    const exhausted = resolveO2Stability({ oxygenRatio: 0 });
    const zoomedExhausted = resolveO2Stability({ oxygenRatio: 0, aimingDownSights: true });

    expect(rested.screenBlurPixels).toBe(0);
    expect(strained.screenBlurPixels).toBeGreaterThan(0);
    expect(strained.screenBlurPixels).toBeLessThan(O2_SCREEN_BLUR_MAX_PIXELS);
    expect(exhausted.screenBlurPixels).toBe(O2_SCREEN_BLUR_MAX_PIXELS);
    expect(zoomedExhausted.screenBlurPixels).toBe(O2_SCREEN_BLUR_ZOOM_MAX_PIXELS);
    expect(rested.screenVignetteStrength).toBe(0);
    expect(strained.screenVignetteStrength).toBeGreaterThan(0);
    expect(strained.screenVignetteStrength).toBeLessThan(O2_SCREEN_VIGNETTE_MAX_STRENGTH);
    expect(exhausted.screenVignetteStrength).toBe(O2_SCREEN_VIGNETTE_MAX_STRENGTH);
    expect(rested.screenContrastMultiplier).toBe(1);
    expect(exhausted.screenContrastMultiplier).toBe(O2_SCREEN_CONTRAST_MAX_MULTIPLIER);
  });

  it("changes smoothly between nearby reserve values", () => {
    const lower = resolveO2Stability({ oxygenRatio: 0.4, aimingDownSights: true });
    const higher = resolveO2Stability({ oxygenRatio: 0.41, aimingDownSights: true });

    expect(higher.breathlessness).toBeLessThan(lower.breathlessness);
    expect(higher.reticleSwayRadians).toBeLessThan(lower.reticleSwayRadians);
    expect(higher.accuracyMultiplier).toBeLessThan(lower.accuracyMultiplier);
    expect(lower.reticleSwayRadians - higher.reticleSwayRadians).toBeLessThan(0.001);
  });

  it("keeps zoom base sway equal to hip-fire base sway", () => {
    const hip = resolveO2Stability({ oxygenRatio: 0.4 });
    const zoom = resolveO2Stability({ oxygenRatio: 0.4, aimingDownSights: true });

    expect(zoom.reticleSwayRadians).toBeCloseTo(hip.reticleSwayRadians, 12);
  });

  it("amplifies the shared breathing sway consumed by reticle and viewmodel aim", () => {
    const rested = resolveO2Stability({ oxygenRatio: 1, aimingDownSights: true });
    const strained = resolveO2Stability({ oxygenRatio: 0.4, aimingDownSights: true });

    expect(strained.reticleSwayRadians).toBeGreaterThan(0.006);
    expect(strained.reticleSwayRadians).toBeGreaterThan(rested.reticleSwayRadians);
    expect("weaponSwayRadians" in strained).toBe(false);
  });

  it("suppresses reserve-driven aim sway while holding breath, then restores it with no O₂", () => {
    const strained = resolveO2Stability({ oxygenRatio: 0.2, aimingDownSights: true });
    const controlled = resolveO2Stability({
      oxygenRatio: 0.2,
      aimingDownSights: true,
      holdingBreath: true,
    });
    const restedControlled = resolveO2Stability({
      oxygenRatio: 1,
      aimingDownSights: true,
      holdingBreath: true,
    });
    const exhausted = resolveO2Stability({
      oxygenRatio: 0,
      aimingDownSights: true,
      holdingBreath: true,
    });
    const unheldExhausted = resolveO2Stability({ oxygenRatio: 0, aimingDownSights: true });

    expect(controlled.reticleSwayRadians).toBeGreaterThan(0);
    expect(restedControlled.reticleSwayRadians).toBe(0);
    expect(controlled.reticleSwayRadians).toBeLessThan(strained.reticleSwayRadians);
    expect(controlled.accuracyMultiplier).toBeLessThan(strained.accuracyMultiplier);
    expect(controlled.accuracyMultiplier).toBeGreaterThanOrEqual(1);
    expect(exhausted.reticleSwayRadians).toBe(unheldExhausted.reticleSwayRadians);
  });

  it("stacks wall bracing and held breath into quarter instability", () => {
    const held = resolveO2Stability({
      oxygenRatio: 0.2,
      aimingDownSights: true,
      holdingBreath: true,
    });
    const combined = resolveO2Stability({
      oxygenRatio: 0.2,
      aimingDownSights: true,
      holdingBreath: true,
      stabilizedByWall: true,
    });

    expect(combined.reticleSwayRadians / held.reticleSwayRadians).toBeCloseTo(
      O2_BRACED_STABILITY_FACTOR,
      8,
    );
    expect(combined.accuracyMultiplier - 1).toBeCloseTo(
      (held.accuracyMultiplier - 1) * O2_WALL_BRACE_STABILITY_FACTOR,
      8,
    );
    expect(combined.reticleSwayRadians).toBeLessThan(held.reticleSwayRadians);
  });

  it("leaves one half of aim instability while braced against a wall", () => {
    const braced = resolveO2Stability({
      oxygenRatio: 0,
      aimingDownSights: true,
      stabilizedByWall: true,
    });
    const normal = resolveO2Stability({ oxygenRatio: 0, aimingDownSights: true });

    expect(braced.reticleSwayRadians / normal.reticleSwayRadians).toBeCloseTo(
      O2_WALL_BRACE_STABILITY_FACTOR,
      8,
    );
    expect(braced.accuracyMultiplier - 1).toBeCloseTo(
      (normal.accuracyMultiplier - 1) * O2_WALL_BRACE_STABILITY_FACTOR,
      8,
    );
    expect(braced.accuracyMultiplier).toBeLessThan(normal.accuracyMultiplier);
    expect(braced.accuracyMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("leaves one half of aim instability while crouched", () => {
    const crouched = resolveO2Stability({
      oxygenRatio: 0,
      aimingDownSights: true,
      crouching: true,
    });
    const normal = resolveO2Stability({ oxygenRatio: 0, aimingDownSights: true });

    expect(crouched.reticleSwayRadians / normal.reticleSwayRadians).toBeCloseTo(
      O2_CROUCH_STABILITY_FACTOR,
      8,
    );
    expect(crouched.accuracyMultiplier - 1).toBeCloseTo(
      (normal.accuracyMultiplier - 1) * O2_CROUCH_STABILITY_FACTOR,
      8,
    );
    expect(crouched.accuracyMultiplier).toBeLessThan(normal.accuracyMultiplier);
  });

  it("stacks crouch and wall bracing into quarter instability", () => {
    const combined = resolveO2Stability({
      oxygenRatio: 0,
      aimingDownSights: true,
      crouching: true,
      stabilizedByWall: true,
    });
    const normal = resolveO2Stability({ oxygenRatio: 0, aimingDownSights: true });
    const quarterFactor = O2_CROUCH_STABILITY_FACTOR * O2_WALL_BRACE_STABILITY_FACTOR;

    expect(combined.reticleSwayRadians / normal.reticleSwayRadians).toBeCloseTo(quarterFactor, 8);
    expect(combined.accuracyMultiplier - 1).toBeCloseTo(
      (normal.accuracyMultiplier - 1) * quarterFactor,
      8,
    );
  });
});
