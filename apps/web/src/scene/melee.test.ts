import { describe, expect, it } from "vitest";

import {
  MELEE_HIT_AREA_HALF_ANGLE_RADIANS,
  MELEE_HIT_AREA_RAY_OFFSETS,
  MELEE_HIT_PROGRESS,
  MELEE_MAX_DAMAGE,
  MELEE_MAX_THROW_SPEED_METERS_PER_SECOND,
  MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_MIN_DAMAGE,
  MELEE_MIN_RANGE_METERS,
  MELEE_MIN_THROW_SPEED_METERS_PER_SECOND,
  MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_REFERENCE_DAMAGE,
  MELEE_REFERENCE_THROW_MASS_KG,
  MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND,
  MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_REFERENCE_VOLUME_M3,
  createEmptyMeleeStateSnapshot,
  resolveMeleeDamage,
  resolveMeleeImpactDirection,
  resolveMeleeLongestSizeMeters,
  resolveMeleeO2Cost,
  resolveMeleeRangeMeters,
  resolveMeleeSwing,
  resolveMeleeSwingPose,
  resolveMeleeSwingSpeed,
  resolveMeleeThrow,
  resolveMeleeThrowDamage,
  resolveMeleeThrowKineticEnergy,
  resolveMeleeThrowSpeed,
  resolveMeleeThrowVelocity,
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

  it("resolves impact at the animation midpoint, with heavier props connecting later", () => {
    const lightSwing = resolveMeleeSwing(0.03);
    const heavySwing = resolveMeleeSwing(0.3);
    expect(lightSwing.hitProgress).toBe(MELEE_HIT_PROGRESS);
    expect(heavySwing.hitProgress).toBe(MELEE_HIT_PROGRESS);
    expect(lightSwing.hitTimeSeconds).toBeCloseTo(
      lightSwing.swingDurationSeconds * MELEE_HIT_PROGRESS,
      10,
    );
    expect(heavySwing.hitTimeSeconds).toBeGreaterThan(lightSwing.hitTimeSeconds);
  });

  it("samples a broad forward cone for forgiving melee contact", () => {
    expect(MELEE_HIT_AREA_RAY_OFFSETS.length).toBeGreaterThan(1);
    const outerAngle = Math.atan2(
      Math.hypot(
        MELEE_HIT_AREA_RAY_OFFSETS.at(-1)?.right ?? 0,
        MELEE_HIT_AREA_RAY_OFFSETS.at(-1)?.up ?? 0,
      ),
      MELEE_HIT_AREA_RAY_OFFSETS.at(-1)?.forward ?? 1,
    );
    expect(outerAngle).toBeCloseTo(MELEE_HIT_AREA_HALF_ANGLE_RADIANS, 10);
    expect(MELEE_HIT_AREA_RAY_OFFSETS[0]).toEqual({ forward: 1, right: 0, up: 0 });
  });

  it("uses bat-tip velocity first and the actual hit-point vector as fallback", () => {
    expect(
      resolveMeleeImpactDirection(
        { x: 0, y: 0, z: -4 },
        { x: 0, y: 0, z: 0 },
        { x: -3, y: 1, z: 0 },
      ),
    ).toEqual({ x: -3 / Math.sqrt(10), y: 1 / Math.sqrt(10), z: 0 });
    expect(
      resolveMeleeImpactDirection(
        { x: 2, y: 1, z: -2 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ),
    ).toEqual({ x: 2 / 3, y: 1 / 3, z: -2 / 3 });
    expect(
      resolveMeleeImpactDirection(
        { x: Number.NaN, y: Number.NaN, z: Number.NaN },
        { x: 0, y: 0, z: 0 },
      ),
    ).toEqual({ x: 0, y: 0, z: -1 });
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
    const rightToLeftCorkscrew = resolveMeleeSwingPose(0.44, "right-to-left");
    const rightToLeftUncorkscrew = resolveMeleeSwingPose(0.66, "right-to-left");
    const leftToRightCorkscrew = resolveMeleeSwingPose(0.44, "left-to-right");
    expect(rightToLeftCorkscrew.yawRadians).toBeGreaterThan(0.8);
    expect(rightToLeftUncorkscrew.yawRadians).toBe(0);
    expect(leftToRightCorkscrew.yawRadians).toBeLessThan(-0.8);
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

describe("ragdoll melee throw tuning", () => {
  it("uses mass and impact speed as a kinetic-energy damage curve", () => {
    expect(resolveMeleeThrowSpeed(MELEE_REFERENCE_THROW_MASS_KG)).toBe(
      MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND,
    );
    expect(resolveMeleeThrowSpeed(0.01)).toBe(MELEE_MAX_THROW_SPEED_METERS_PER_SECOND);
    expect(resolveMeleeThrowSpeed(1000)).toBe(MELEE_MIN_THROW_SPEED_METERS_PER_SECOND);
    expect(resolveMeleeThrowKineticEnergy(10, 4)).toBe(80);
    expect(resolveMeleeThrowDamage(10, 8)).toBeGreaterThan(resolveMeleeThrowDamage(10, 4));
    expect(resolveMeleeThrowDamage(90, 7.5)).toBeGreaterThan(200);
    expect(resolveMeleeThrowDamage(90, 7.5)).toBeLessThanOrEqual(MELEE_MAX_DAMAGE);
    expect(resolveMeleeThrowDamage(90, 0)).toBe(0);
  });

  it("preserves player momentum and adds a normalized mass-scaled throw", () => {
    expect(
      resolveMeleeThrowVelocity(
        { x: 0, y: 0, z: -4 },
        { x: 2, y: 0.5, z: 1 },
        MELEE_REFERENCE_THROW_MASS_KG,
      ),
    ).toEqual({ x: 2, y: 0.5, z: 1 - MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND });
    expect(resolveMeleeThrowVelocity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1000).z).toBe(
      -MELEE_MIN_THROW_SPEED_METERS_PER_SECOND,
    );
  });

  it("returns a complete throw resolution for impact telemetry", () => {
    expect(resolveMeleeThrow(12, 5)).toEqual({
      massKg: 12,
      speedMetersPerSecond: 5,
      kineticEnergyJoules: 150,
      damage: 18,
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
