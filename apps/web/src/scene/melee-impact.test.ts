import { describe, expect, it } from "vitest";

import {
  MELEE_IMPACT_FLASH_DURATION_SECONDS,
  MELEE_IMPACT_DOF_BOOST_DURATION_SECONDS,
  MELEE_IMPACT_DOF_INTENSITY_MULTIPLIER,
  MELEE_IMPACT_MAX_DAMAGE,
  MELEE_IMPACT_MAX_FOCUS_SHIFT_METERS,
  MELEE_IMPACT_MIN_FOCUS_DISTANCE_METERS,
  createMeleeImpactFlashPass,
  resolveMeleeImpactFlashOpacity,
  resolveMeleeImpactFlashOpacityAtTime,
  resolveMeleeImpactFocusDistance,
  resolveMeleeImpactFocusShiftMeters,
} from "./melee-impact.js";

describe("melee impact presentation", () => {
  it("maps zero, capped, and oversized damage to white opacity", () => {
    expect(resolveMeleeImpactFlashOpacity(0)).toBe(0);
    expect(resolveMeleeImpactFlashOpacity(100)).toBeCloseTo(0.5, 10);
    expect(resolveMeleeImpactFlashOpacity(MELEE_IMPACT_MAX_DAMAGE)).toBe(1);
    expect(resolveMeleeImpactFlashOpacity(MELEE_IMPACT_MAX_DAMAGE + 1)).toBe(1);
    expect(resolveMeleeImpactFlashOpacity(Number.NaN)).toBe(0);
  });

  it("creates a capped hit pass at full opacity for its first rendered frame", () => {
    const pass = createMeleeImpactFlashPass(MELEE_IMPACT_MAX_DAMAGE);
    expect(pass.uniforms.uOpacity?.value).toBe(1);
    pass.dispose();
  });

  it("keeps the hit-induced depth-of-field boost obvious for five seconds", () => {
    expect(MELEE_IMPACT_DOF_INTENSITY_MULTIPLIER).toBe(2);
    expect(MELEE_IMPACT_DOF_BOOST_DURATION_SECONDS).toBe(5);
  });

  it("uses the same 200-point cap for the temporary focus shift", () => {
    expect(resolveMeleeImpactFocusShiftMeters(0)).toBe(0);
    expect(resolveMeleeImpactFocusShiftMeters(100)).toBeCloseTo(
      MELEE_IMPACT_MAX_FOCUS_SHIFT_METERS / 2,
      10,
    );
    expect(resolveMeleeImpactFocusShiftMeters(MELEE_IMPACT_MAX_DAMAGE)).toBe(
      MELEE_IMPACT_MAX_FOCUS_SHIFT_METERS,
    );
    expect(resolveMeleeImpactFocusShiftMeters(MELEE_IMPACT_MAX_DAMAGE * 2)).toBe(
      MELEE_IMPACT_MAX_FOCUS_SHIFT_METERS,
    );
  });

  it("moves the focus plane toward zero and reaches zero at the 200-point cap", () => {
    expect(resolveMeleeImpactFocusDistance(8, 0)).toBe(8);
    expect(resolveMeleeImpactFocusDistance(8, 0.25)).toBe(6);
    expect(resolveMeleeImpactFocusDistance(8, 1)).toBe(MELEE_IMPACT_MIN_FOCUS_DISTANCE_METERS);
    expect(resolveMeleeImpactFocusDistance(8, 2)).toBe(0);
    expect(resolveMeleeImpactFocusDistance(Number.NaN, 0)).toBe(12);
  });

  it("fades the white pulse to transparent over its presentation lifetime", () => {
    // The first frame is rendered at the requested opacity; fading starts on
    // the following frame.
    expect(resolveMeleeImpactFlashOpacityAtTime(0.8, 0)).toBeCloseTo(0.8, 10);
    expect(
      resolveMeleeImpactFlashOpacityAtTime(0.8, MELEE_IMPACT_FLASH_DURATION_SECONDS / 2),
    ).toBeCloseTo(0.4, 10);
    expect(resolveMeleeImpactFlashOpacityAtTime(0.8, MELEE_IMPACT_FLASH_DURATION_SECONDS)).toBe(0);
    expect(resolveMeleeImpactFlashOpacityAtTime(0.8, Number.NaN)).toBeCloseTo(0.8, 10);
  });
});
