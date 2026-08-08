import { describe, expect, it } from "vitest";

import {
  MELEE_MAX_DAMAGE,
  MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_MAX_THROW_SPEED_METERS_PER_SECOND,
  MELEE_MIN_DAMAGE,
  MELEE_MIN_RANGE_METERS,
  MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_MIN_THROW_SPEED_METERS_PER_SECOND,
  MELEE_IDLE_RESET_DELAY_SECONDS,
  MELEE_IDLE_RESET_DURATION_SECONDS,
  MELEE_REFERENCE_DAMAGE,
  MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND,
  MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND,
  MELEE_REFERENCE_VOLUME_M3,
  createEmptyMeleeStateSnapshot,
  resolveMeleeDamage,
  resolveMeleeDamageWithMomentum,
  resolveMeleeAudioProfile,
  MELEE_FALLING_REFERENCE_SPEED_METERS_PER_SECOND,
  MELEE_MAX_MOMENTUM_MULTIPLIER,
  MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND,
  MELEE_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE,
  MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND,
  resolveMeleeIdleResetPose,
  resolveMeleeIdleResetProgress,
  resolveMeleeLongestSizeMeters,
  resolveMeleeO2Cost,
  resolveMeleeRangeMeters,
  resolveMeleeSwingEnvelopeGain,
  resolveMeleeSwing,
  resolveMeleeSwingPose,
  resolveMeleeSwingSpeed,
  resolveMeleeStoppingPower,
  resolveMeleeThrowSpeed,
  shouldAdvanceMeleeIdleReset,
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

  it("throws smaller volumes faster while keeping every launch useful", () => {
    expect(resolveMeleeThrowSpeed(MELEE_REFERENCE_VOLUME_M3)).toBe(
      MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND,
    );
    expect(resolveMeleeThrowSpeed(0.03)).toBeGreaterThan(resolveMeleeThrowSpeed(0.3));
    expect(resolveMeleeThrowSpeed(Number.NaN)).toBe(MELEE_MAX_THROW_SPEED_METERS_PER_SECOND);
    expect(resolveMeleeThrowSpeed(100)).toBe(MELEE_MIN_THROW_SPEED_METERS_PER_SECOND);
  });

  it("charges one quarter of damage to O2 like a gun projectile", () => {
    const swing = resolveMeleeSwing(0.3);
    expect(swing.oxygenCost).toBeCloseTo(swing.damage * 0.25, 10);
    expect(resolveMeleeO2Cost(Number.NaN)).toBe(0);
  });

  it("derives strong, bounded stopping power from the resolved damage", () => {
    expect(resolveMeleeStoppingPower(0)).toBe(0);
    expect(resolveMeleeStoppingPower(100)).toBe(
      100 * MELEE_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE,
    );
    expect(resolveMeleeStoppingPower(1_000)).toBe(MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND);
    expect(resolveMeleeStoppingPower(Number.NaN)).toBe(0);
    expect(resolveMeleeSwing(MELEE_REFERENCE_VOLUME_M3).stoppingPower).toBe(
      resolveMeleeStoppingPower(MELEE_REFERENCE_DAMAGE),
    );
  });

  it("derives deterministic woosh and bang controls from object attributes", () => {
    const light = resolveMeleeAudioProfile({
      volumeM3: 0.03,
      rangeMeters: 0.8,
      swingSpeedRadiansPerSecond: MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND,
      damage: MELEE_MIN_DAMAGE,
    });
    const heavy = resolveMeleeAudioProfile({
      volumeM3: 0.3,
      rangeMeters: 2.2,
      swingSpeedRadiansPerSecond: MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
      damage: MELEE_MAX_DAMAGE,
    });

    expect(light.swingNoisePlaybackRate).toBeGreaterThan(heavy.swingNoisePlaybackRate);
    expect(light.swingNoiseCenterFrequencyHz).toBeGreaterThan(heavy.swingNoiseCenterFrequencyHz);
    expect(light.swingDurationSeconds).toBeLessThan(heavy.swingDurationSeconds);
    expect(light.impactNoisePlaybackRate).toBeGreaterThan(heavy.impactNoisePlaybackRate);
    expect(light.impactNoiseGain).toBeLessThan(heavy.impactNoiseGain);
    expect(light.impactDurationSeconds).toBeLessThan(heavy.impactDurationSeconds);
    expect(
      resolveMeleeAudioProfile({
        volumeM3: Number.NaN,
        rangeMeters: Number.NaN,
        swingSpeedRadiansPerSecond: Number.NaN,
        damage: Number.NaN,
      }),
    ).toEqual(
      resolveMeleeAudioProfile({
        volumeM3: 0.0001,
        rangeMeters: 0,
        swingSpeedRadiansPerSecond: MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
        damage: MELEE_MIN_DAMAGE,
      }),
    );
  });

  it("peaks swing volume at the apex with a symmetric exponential falloff", () => {
    const start = resolveMeleeSwingEnvelopeGain(0, 0.8);
    const quarter = resolveMeleeSwingEnvelopeGain(0.25, 0.8);
    const apex = resolveMeleeSwingEnvelopeGain(0.5, 0.8);
    const end = resolveMeleeSwingEnvelopeGain(1, 0.8);

    expect(apex).toBeCloseTo(0.8, 10);
    expect(start).toBeCloseTo(end, 10);
    expect(resolveMeleeSwingEnvelopeGain(0.25, 0.8)).toBeCloseTo(
      resolveMeleeSwingEnvelopeGain(0.75, 0.8),
      10,
    );
    expect(apex).toBeGreaterThan(quarter);
    expect(quarter).toBeGreaterThan(start);
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

  it("waits five seconds, then eases the left-ready pose back to the right", () => {
    expect(MELEE_IDLE_RESET_DELAY_SECONDS).toBe(5);
    expect(resolveMeleeIdleResetProgress(-1)).toBe(0);
    expect(resolveMeleeIdleResetProgress(MELEE_IDLE_RESET_DELAY_SECONDS)).toBe(0);
    expect(
      resolveMeleeIdleResetProgress(
        MELEE_IDLE_RESET_DELAY_SECONDS + MELEE_IDLE_RESET_DURATION_SECONDS / 2,
      ),
    ).toBeCloseTo(0.5, 10);
    expect(
      resolveMeleeIdleResetProgress(
        MELEE_IDLE_RESET_DELAY_SECONDS + MELEE_IDLE_RESET_DURATION_SECONDS,
      ),
    ).toBe(1);
    expect(resolveMeleeIdleResetProgress(Number.NaN)).toBe(0);
  });

  it("continues the reset timer while the player walks", () => {
    expect(
      shouldAdvanceMeleeIdleReset({
        drawn: true,
        active: true,
        controlsActive: true,
        swinging: false,
        fireHeld: false,
        viewmodelTransitionIdle: true,
      }),
    ).toBe(true);
  });

  it("keeps the reset endpoints on the two existing ready positions", () => {
    const leftReady = resolveMeleeSwingPose(0, "left-to-right");
    const rightReady = resolveMeleeSwingPose(0, "right-to-left");
    expect(resolveMeleeIdleResetPose(0)).toEqual(leftReady);
    expect(resolveMeleeIdleResetPose(1)).toEqual(rightReady);
    const midpoint = resolveMeleeIdleResetPose(0.5);
    expect(midpoint.offsetX).toBeCloseTo(0, 10);
    expect(midpoint.rollRadians).toBeCloseTo(0, 10);
    expect(resolveMeleeIdleResetPose(-1)).toEqual(leftReady);
    expect(resolveMeleeIdleResetPose(2)).toEqual(rightReady);
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

describe("momentum melee damage", () => {
  const forwardAttack = {
    x: 0,
    y: 0,
    z: -1,
  } as const;

  it("keeps a stationary hit at base damage", () => {
    const resolution = resolveMeleeDamageWithMomentum({
      baseDamage: 100,
      attackDirection: forwardAttack,
      attackerVelocity: { x: 0, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
    });

    expect(resolution.closingSpeedMetersPerSecond).toBe(0);
    expect(resolution.fallingSpeedMetersPerSecond).toBe(0);
    expect(resolution.multiplier).toBe(1);
    expect(resolution.damage).toBe(100);
  });

  it("adds both sprint closing speed and a target running toward the attack", () => {
    const attackerOnly = resolveMeleeDamageWithMomentum({
      baseDamage: 100,
      attackDirection: forwardAttack,
      attackerVelocity: { x: 0, y: 0, z: -MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND },
      targetVelocity: { x: 0, y: 0, z: 0 },
    });
    const bothPlayers = resolveMeleeDamageWithMomentum({
      baseDamage: 100,
      attackDirection: forwardAttack,
      attackerVelocity: { x: 0, y: 0, z: -MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND },
      targetVelocity: { x: 0, y: 0, z: MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND },
    });
    const targetFleeing = resolveMeleeDamageWithMomentum({
      baseDamage: 100,
      attackDirection: forwardAttack,
      attackerVelocity: { x: 0, y: 0, z: -MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND },
      targetVelocity: { x: 0, y: 0, z: -MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND },
    });

    expect(attackerOnly.damage).toBeGreaterThan(100);
    expect(bothPlayers.damage).toBeGreaterThan(attackerOnly.damage);
    expect(targetFleeing.damage).toBe(100);
  });

  it("adds bounded falling impact only while airborne", () => {
    const falling = resolveMeleeDamageWithMomentum({
      baseDamage: 100,
      attackDirection: forwardAttack,
      attackerVelocity: { x: 0, y: -MELEE_FALLING_REFERENCE_SPEED_METERS_PER_SECOND, z: 0 },
      attackerAirborne: true,
    });
    const grounded = resolveMeleeDamageWithMomentum({
      baseDamage: 100,
      attackDirection: forwardAttack,
      attackerVelocity: { x: 0, y: -MELEE_FALLING_REFERENCE_SPEED_METERS_PER_SECOND, z: 0 },
      attackerAirborne: false,
    });

    expect(falling.damage).toBeGreaterThan(grounded.damage);
    expect(falling.multiplier).toBeCloseTo(1.45, 10);
    expect(falling.fallingSpeedMetersPerSecond).toBe(
      MELEE_FALLING_REFERENCE_SPEED_METERS_PER_SECOND,
    );
  });

  it("normalizes invalid input and caps the combined multiplier", () => {
    const resolution = resolveMeleeDamageWithMomentum({
      baseDamage: Number.NaN,
      attackDirection: { x: Number.NaN, y: 0, z: 0 },
      attackerVelocity: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
      attackerAirborne: true,
    });

    expect(resolution.baseDamage).toBe(MELEE_MIN_DAMAGE);
    expect(resolution.multiplier).toBe(1);
    expect(resolution.damage).toBe(MELEE_MIN_DAMAGE);
    expect(
      resolveMeleeDamageWithMomentum({
        baseDamage: 100,
        attackDirection: forwardAttack,
        attackerVelocity: { x: 0, y: -100, z: -100 },
        targetVelocity: { x: 0, y: 0, z: 100 },
        attackerAirborne: true,
      }).multiplier,
    ).toBe(MELEE_MAX_MOMENTUM_MULTIPLIER);
  });
});
