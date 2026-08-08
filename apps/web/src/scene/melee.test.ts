import { describe, expect, it } from "vitest";

import {
  MELEE_MAX_DAMAGE,
  MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_MIN_DAMAGE,
  MELEE_MIN_RANGE_METERS,
  MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_REFERENCE_DAMAGE,
  MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_REFERENCE_VOLUME_M3,
  createEmptyMeleeStateSnapshot,
  resolveMeleeDamage,
  resolveMeleeLongestSizeMeters,
  resolveMeleeO2Cost,
  resolveMeleeRangeMeters,
  resolveMeleeSwing,
  resolveMeleeSwingPose,
  resolveMeleeSwingSpeed,
} from "./melee.js";

describe("ragdoll melee volume tuning", () => {
  it("makes larger volumes hit harder", () => {
    expect(resolveMeleeDamage(MELEE_REFERENCE_VOLUME_M3)).toBe(MELEE_REFERENCE_DAMAGE);
    expect(resolveMeleeDamage(0.03)).toBeLessThan(resolveMeleeDamage(0.3));
    expect(resolveMeleeDamage(Number.NaN)).toBe(MELEE_MIN_DAMAGE);
    expect(resolveMeleeDamage(100)).toBe(MELEE_MAX_DAMAGE);
  });

  it("makes smaller volumes swing faster", () => {
    expect(resolveMeleeSwingSpeed(MELEE_REFERENCE_VOLUME_M3)).toBe(
      MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND,
    );
    expect(resolveMeleeSwingSpeed(0.03)).toBeGreaterThan(resolveMeleeSwingSpeed(0.3));
    expect(resolveMeleeSwingSpeed(Number.NaN)).toBe(MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND);
    expect(resolveMeleeSwingSpeed(100)).toBe(MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND);
  });

  it("charges one quarter of damage to O2 like a gun projectile", () => {
    const swing = resolveMeleeSwing(0.3);
    expect(swing.oxygenCost).toBeCloseTo(swing.damage * 0.25, 10);
    expect(resolveMeleeO2Cost(Number.NaN)).toBe(0);
  });

  it("swipes horizontally and supports alternating directions", () => {
    expect(resolveMeleeSwingPose(-1)).toEqual(resolveMeleeSwingPose(0));
    expect(resolveMeleeSwingPose(2)).toEqual(resolveMeleeSwingPose(1));
    const rightReady = resolveMeleeSwingPose(0, "right-to-left");
    const leftReady = resolveMeleeSwingPose(0, "left-to-right");
    expect(rightReady.offsetX).toBeGreaterThan(0);
    expect(rightReady.offsetY).toBeGreaterThan(0);
    expect(rightReady.rollRadians).toBeLessThan(0);
    expect(leftReady.offsetX).toBeLessThan(0);
    expect(leftReady.rollRadians).toBeGreaterThan(0);
    expect(resolveMeleeSwingPose(1, "right-to-left")).toEqual(leftReady);
    expect(resolveMeleeSwingPose(1, "left-to-right")).toEqual(rightReady);
    const rightToLeftWindup = resolveMeleeSwingPose(0.18, "right-to-left");
    const rightToLeftFollowThrough = resolveMeleeSwingPose(0.7, "right-to-left");
    const leftToRightWindup = resolveMeleeSwingPose(0.18, "left-to-right");
    const leftToRightFollowThrough = resolveMeleeSwingPose(0.7, "left-to-right");
    expect(rightToLeftWindup.offsetX).toBeGreaterThan(0);
    expect(rightToLeftFollowThrough.offsetX).toBeLessThan(0);
    expect(leftToRightWindup.offsetX).toBeLessThan(0);
    expect(leftToRightFollowThrough.offsetX).toBeGreaterThan(0);
    expect(rightToLeftWindup.yawRadians).toBeGreaterThan(0);
    expect(leftToRightWindup.yawRadians).toBeLessThan(0);
    expect(resolveMeleeSwingPose(0.5, "right-to-left").yawRadians).toBeGreaterThan(0.2);
    expect(resolveMeleeSwingPose(0.5, "right-to-left").pitchRadians).toBeLessThan(-0.5);
    expect(resolveMeleeSwingPose(0.5, "left-to-right").pitchRadians).toBeLessThan(-0.5);
  });

  it("provides an empty state for a new scene", () => {
    expect(createEmptyMeleeStateSnapshot()).toEqual({
      active: null,
      nearby: null,
      swinging: false,
      swings: 0,
      hits: 0,
      lastDamage: 0,
      lastOxygenCost: 0,
    });
  });
});

describe("ragdoll melee reach", () => {
  it("uses the full longest collider axis", () => {
    expect(resolveMeleeLongestSizeMeters({ x: 0.2, y: 0.8, z: 0.3 })).toBeCloseTo(1.6, 10);
    expect(resolveMeleeLongestSizeMeters({ x: 0.9, y: 0.1, z: 0.2 })).toBeCloseTo(1.8, 10);
    expect(resolveMeleeLongestSizeMeters({ x: Number.NaN, y: -1, z: 0.4 })).toBeCloseTo(0.8, 10);
  });

  it("floors tiny objects at a realistic 185 cm player's arm reach", () => {
    expect(MELEE_MIN_RANGE_METERS).toBe(0.8);
    expect(resolveMeleeRangeMeters(0)).toBe(MELEE_MIN_RANGE_METERS);
    expect(resolveMeleeRangeMeters(0.79)).toBe(MELEE_MIN_RANGE_METERS);
    expect(resolveMeleeRangeMeters(1.6)).toBe(1.6);
    expect(resolveMeleeRangeMeters(Number.NaN)).toBe(MELEE_MIN_RANGE_METERS);
  });
});
