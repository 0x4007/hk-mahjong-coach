import {
  MELEE_MAX_DAMAGE,
  MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_MIN_DAMAGE,
  MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
  createEmptyMeleeStateSnapshot,
  resolveMeleeDamage,
  resolveMeleeO2Cost,
  resolveMeleeSwing,
  resolveMeleeSwingPose,
  resolveMeleeSwingSpeed,
} from "./melee.js";

describe("ragdoll melee volume tuning", () => {
  it("makes larger volumes hit harder", () => {
    expect(resolveMeleeDamage(0.03)).toBeLessThan(resolveMeleeDamage(0.3));
    expect(resolveMeleeDamage(Number.NaN)).toBe(MELEE_MIN_DAMAGE);
    expect(resolveMeleeDamage(100)).toBe(MELEE_MAX_DAMAGE);
  });

  it("makes smaller volumes swing faster", () => {
    expect(resolveMeleeSwingSpeed(0.03)).toBeGreaterThan(resolveMeleeSwingSpeed(0.3));
    expect(resolveMeleeSwingSpeed(Number.NaN)).toBe(MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND);
    expect(resolveMeleeSwingSpeed(100)).toBe(MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND);
  });

  it("charges one quarter of damage to O2 like a gun projectile", () => {
    const swing = resolveMeleeSwing(0.3);
    expect(swing.oxygenCost).toBeCloseTo(swing.damage * 0.25, 10);
    expect(resolveMeleeO2Cost(Number.NaN)).toBe(0);
  });

  it("clamps swing pose progress and returns to the neutral pose", () => {
    expect(resolveMeleeSwingPose(-1)).toEqual(resolveMeleeSwingPose(0));
    expect(resolveMeleeSwingPose(2)).toEqual(resolveMeleeSwingPose(1));
    expect(resolveMeleeSwingPose(0)).toEqual({
      pitchRadians: -0,
      yawRadians: 0,
      rollRadians: -0,
      offsetX: 0,
      offsetY: -0,
      offsetZ: 0,
    });
    expect(resolveMeleeSwingPose(0.5).rollRadians).toBeLessThan(0);
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

