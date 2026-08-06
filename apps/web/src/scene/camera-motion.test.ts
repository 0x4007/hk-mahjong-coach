import { describe, expect, it } from "vitest";

import {
  CAMERA_JUMP_LIFT_SCALE,
  CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS,
  CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS,
  CAMERA_VIEWMODEL_AIMING_OFFSET,
  CAMERA_VIEWMODEL_CROUCHING_OFFSET,
  CAMERA_VIEWMODEL_STANDING_OFFSET,
  createCameraMotionDamper,
  resolveCameraWeaponShotImpulse,
  resolveCameraViewmodelOffset,
  resolveCameraViewmodelTransition,
  resolveLandingWeightImpulse,
} from "./camera-motion.js";

const idleInput = {
  deltaSeconds: 1 / 60,
  lateralInput: 0,
  movementMagnitude: 0,
  movementSpeedRatio: 0,
  oxygenRatio: 1,
  crouching: false,
  shiftEnabled: true,
  bobEnabled: true,
} as const;

describe("camera motion damper", () => {
  it("keeps gait bob and weight impulses in one output", () => {
    const damper = createCameraMotionDamper();

    damper.applyJumpImpulse(12);
    const lifted = damper.update({
      ...idleInput,
      movementMagnitude: 1,
      movementSpeedRatio: 1 / 3,
    });

    expect(lifted.headBob).not.toBe(0);
    expect(lifted.weightShift).toBeGreaterThan(0);
    expect(lifted.verticalOffset).toBeCloseTo(lifted.headBob + lifted.weightShift, 8);
  });

  it("breathes while stationary and increases the bob when oxygen is low", () => {
    const rested = createCameraMotionDamper();
    const exhausted = createCameraMotionDamper();
    let restedPeak = 0;
    let exhaustedPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      restedPeak = Math.max(restedPeak, Math.abs(rested.update(idleInput).headBob));
      exhaustedPeak = Math.max(
        exhaustedPeak,
        Math.abs(exhausted.update({ ...idleInput, oxygenRatio: 0 }).headBob),
      );
    }

    expect(restedPeak).toBeGreaterThan(0);
    expect(exhaustedPeak).toBeGreaterThan(restedPeak * 4);
  });

  it("uses a continuous O₂ response and centres aim while holding breath", () => {
    const rested = createCameraMotionDamper();
    const strained = createCameraMotionDamper();
    const held = createCameraMotionDamper();
    let restedPeak = 0;
    let strainedPeak = 0;
    let heldPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const restedFrame = rested.update({ ...idleInput, aimingDownSights: true, oxygenRatio: 1 });
      const strainedFrame = strained.update({
        ...idleInput,
        aimingDownSights: true,
        oxygenRatio: 0.4,
      });
      const heldFrame = held.update({
        ...idleInput,
        aimingDownSights: true,
        holdingBreath: true,
        oxygenRatio: 0.4,
      });
      restedPeak = Math.max(restedPeak, Math.hypot(restedFrame.aimSwayX, restedFrame.aimSwayY));
      strainedPeak = Math.max(
        strainedPeak,
        Math.hypot(strainedFrame.aimSwayX, strainedFrame.aimSwayY),
      );
      heldPeak = Math.max(heldPeak, Math.hypot(heldFrame.aimSwayX, heldFrame.aimSwayY));
    }

    expect(strainedPeak).toBeGreaterThan(restedPeak);
    expect(heldPeak).toBe(0);
  });

  it("stops the stationary breathing bob while O₂ is held", () => {
    const damper = createCameraMotionDamper();
    let peak = 0;

    for (let index = 0; index < 180; index += 1) {
      const frame = damper.update({
        ...idleInput,
        aimingDownSights: true,
        holdingBreath: true,
        oxygenRatio: 0.4,
      });
      peak = Math.max(peak, Math.abs(frame.headBob));
    }

    expect(peak).toBe(0);
  });

  it("can disable breathing and gait bob together", () => {
    const damper = createCameraMotionDamper();

    const frame = damper.update({ ...idleInput, bobEnabled: false, oxygenRatio: 0 });

    expect(frame.headBob).toBe(0);
    expect(frame.verticalOffset).toBe(frame.weightShift);
  });

  it("pushes the camera up for take-off and down for landing", () => {
    const damper = createCameraMotionDamper();
    damper.applyJumpImpulse(12);
    const jumpFrame = damper.update(idleInput);

    damper.reset();
    damper.applyLandingImpulse({ downwardVelocity: 13.2, downwardAcceleration: 792 });
    const landingFrame = damper.update(idleInput);

    expect(jumpFrame.weightShift).toBeGreaterThan(0);
    expect(landingFrame.weightShift).toBeLessThan(0);
    expect(Math.abs(landingFrame.weightShift)).toBeGreaterThan(jumpFrame.weightShift);
  });

  it("makes a harder deceleration dip further for the same fall speed", () => {
    const gentleStop = resolveLandingWeightImpulse({
      downwardVelocity: 8,
      downwardAcceleration: 120,
    });
    const hardStop = resolveLandingWeightImpulse({
      downwardVelocity: 8,
      downwardAcceleration: 720,
    });

    expect(hardStop).toBeGreaterThan(gentleStop);
  });

  it("makes a building-height fall stronger than a normal jump landing", () => {
    const normalJump = resolveLandingWeightImpulse({
      downwardVelocity: 13.2,
      downwardAcceleration: 792,
    });
    const buildingFall = resolveLandingWeightImpulse({
      downwardVelocity: 40,
      downwardAcceleration: 2400,
    });

    expect(buildingFall).toBeGreaterThan(normalJump);
  });

  it("does not create an impulse for a stationary contact", () => {
    expect(resolveLandingWeightImpulse({ downwardVelocity: 0, downwardAcceleration: 0 })).toBe(0);
    const damper = createCameraMotionDamper();
    damper.applyLandingImpulse({ downwardVelocity: 0, downwardAcceleration: 0 });
    expect(damper.update(idleInput).weightShift).toBe(0);
  });

  it("uses the configured jump lift scale", () => {
    const damper = createCameraMotionDamper();
    damper.applyJumpImpulse(1);
    const frame = damper.update({ ...idleInput, deltaSeconds: 0.001 });

    expect(frame.weightShift).toBeGreaterThan(0);
    expect(frame.weightShift).toBeLessThan(CAMERA_JUMP_LIFT_SCALE);
  });

  it("scales shot recoil with per-projectile damage", () => {
    const machineGun = resolveCameraWeaponShotImpulse({
      damage: 12,
      reticleOffset: { x: 18, y: 0 },
    });
    const pistol = resolveCameraWeaponShotImpulse({
      damage: 28,
      reticleOffset: { x: 18, y: 0 },
    });
    const sniper = resolveCameraWeaponShotImpulse({
      damage: 100,
      reticleOffset: { x: 18, y: 0 },
    });

    expect(machineGun.yaw).toBeGreaterThan(0);
    expect(pistol.yaw).toBeGreaterThan(machineGun.yaw);
    expect(sniper.yaw).toBeGreaterThan(pistol.yaw);
    expect(Math.abs(sniper.pitch)).toBeGreaterThan(Math.abs(machineGun.pitch));
  });

  it("adds the shot kick in the signed direction of an already displaced reticle", () => {
    const centered = resolveCameraWeaponShotImpulse({
      damage: 100,
      reticleOffset: { x: 0, y: 0 },
    });
    const rightAndDown = resolveCameraWeaponShotImpulse({
      damage: 100,
      reticleOffset: { x: 36, y: 36 },
    });
    const leftAndUp = resolveCameraWeaponShotImpulse({
      damage: 100,
      reticleOffset: { x: -36, y: -36 },
    });

    expect(centered.pitch).toBeLessThan(0);
    expect(rightAndDown.yaw).toBeGreaterThan(0);
    expect(rightAndDown.pitch).toBeGreaterThan(0);
    expect(leftAndUp.yaw).toBeLessThan(0);
    expect(leftAndUp.pitch).toBeLessThan(centered.pitch);
  });

  it("returns shot recoil through the same damper output and lets it settle", () => {
    const damper = createCameraMotionDamper();
    damper.applyWeaponShotImpulse({ damage: 100, reticleOffset: { x: 36, y: 36 } });
    const kicked = damper.update(idleInput);
    expect(kicked.recoilYaw).toBeGreaterThan(0);
    expect(kicked.recoilPitch).toBeGreaterThan(0);

    let settled = kicked;
    for (let index = 0; index < 180; index += 1) {
      settled = damper.update(idleInput);
    }
    expect(Math.abs(settled.recoilYaw)).toBeLessThan(0.0001);
    expect(Math.abs(settled.recoilPitch)).toBeLessThan(0.0001);
  });

  it("resets roll, bob, and weight together", () => {
    const damper = createCameraMotionDamper();
    damper.applyJumpImpulse(12);
    damper.update({
      ...idleInput,
      lateralInput: 1,
      movementMagnitude: 1,
      movementSpeedRatio: 1,
    });

    damper.reset();

    expect(damper.getOffsets()).toEqual({
      roll: 0,
      headBob: 0,
      weightShift: 0,
      verticalOffset: 0,
      recoilYaw: 0,
      recoilPitch: 0,
      viewmodelOffset: CAMERA_VIEWMODEL_STANDING_OFFSET,
      viewmodelTransition: {
        phase: "idle",
        progress: 1,
        offset: { x: 0, y: 0, z: 0 },
        pitchRadians: 0,
        yawRadians: 0,
        rollRadians: 0,
      },
      aimSwayX: 0,
      aimSwayY: 0,
    });
  });

  it("keeps a crouched weapon between hip fire and explicit ADS", () => {
    const damper = createCameraMotionDamper();
    const standing = damper.update(idleInput);

    let crouched = standing;
    for (let index = 0; index < 120; index += 1) {
      crouched = damper.update({ ...idleInput, crouching: true });
    }

    expect(standing.viewmodelOffset).toEqual(CAMERA_VIEWMODEL_STANDING_OFFSET);
    expect(crouched.viewmodelOffset.x).toBeCloseTo(CAMERA_VIEWMODEL_CROUCHING_OFFSET.x, 5);
    expect(crouched.viewmodelOffset.y).toBeCloseTo(CAMERA_VIEWMODEL_CROUCHING_OFFSET.y, 5);
    expect(crouched.viewmodelOffset.y).toBeGreaterThan(standing.viewmodelOffset.y);
    expect(crouched.viewmodelOffset.z).toBeCloseTo(CAMERA_VIEWMODEL_CROUCHING_OFFSET.z, 5);
  });

  it("raises and centres the weapon only while aiming down sights", () => {
    const damper = createCameraMotionDamper();
    let aiming = damper.update({ ...idleInput, crouching: true });

    for (let index = 0; index < 120; index += 1) {
      aiming = damper.update({ ...idleInput, crouching: true, aimingDownSights: true });
    }

    expect(aiming.viewmodelOffset.x).toBeCloseTo(CAMERA_VIEWMODEL_AIMING_OFFSET.x, 5);
    expect(aiming.viewmodelOffset.y).toBeCloseTo(CAMERA_VIEWMODEL_AIMING_OFFSET.y, 5);
    expect(aiming.viewmodelOffset.y).toBeGreaterThan(CAMERA_VIEWMODEL_CROUCHING_OFFSET.y);
    expect(aiming.viewmodelOffset.z).toBeCloseTo(CAMERA_VIEWMODEL_AIMING_OFFSET.z, 5);
  });

  it("interpolates viewmodel posture without exposing an out-of-range amount", () => {
    expect(resolveCameraViewmodelOffset(-1)).toEqual(CAMERA_VIEWMODEL_STANDING_OFFSET);
    expect(resolveCameraViewmodelOffset(2)).toEqual(CAMERA_VIEWMODEL_CROUCHING_OFFSET);
    const midpoint = resolveCameraViewmodelOffset(0.5);
    expect(midpoint.x).toBeCloseTo(0.24, 8);
    expect(midpoint.y).toBeCloseTo(-0.335, 8);
    expect(midpoint.z).toBeCloseTo(-0.56, 8);
    expect(resolveCameraViewmodelOffset(0, 1)).toEqual(CAMERA_VIEWMODEL_AIMING_OFFSET);
  });

  it("drops the outgoing weapon, then raises the next weapon from below the frame", () => {
    const lowering = resolveCameraViewmodelTransition(CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS / 2);
    const raising = resolveCameraViewmodelTransition(
      CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS + CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS / 2,
    );
    const settled = resolveCameraViewmodelTransition(
      CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS + CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS,
    );

    expect(lowering.phase).toBe("lowering");
    expect(lowering.offset.y).toBeLessThan(0);
    expect(lowering.pitchRadians).toBeLessThan(0);
    expect(raising.phase).toBe("raising");
    expect(raising.offset.y).toBeLessThan(0);
    expect(raising.offset.y).toBeGreaterThan(lowering.offset.y);
    expect(raising.pitchRadians).toBeGreaterThan(lowering.pitchRadians);
    expect(settled.phase).toBe("idle");
  });

  it("starts a pickup equip directly in the raising phase when no gun is held", () => {
    const transition = resolveCameraViewmodelTransition(0, false);

    expect(transition.phase).toBe("raising");
    expect(transition.offset.y).toBeLessThan(0);
    expect(transition.pitchRadians).toBeLessThan(0);
  });

  it("composes a switch request into the shared damper output", () => {
    const damper = createCameraMotionDamper();
    damper.applyWeaponSwitchImpulse({ hasOutgoingWeapon: true });

    const lowering = damper.update(idleInput);
    expect(lowering.viewmodelTransition.phase).toBe("lowering");

    let raising = lowering;
    for (let index = 0; index < 20; index += 1) {
      raising = damper.update(idleInput);
    }
    expect(raising.viewmodelTransition.phase).toBe("raising");

    for (let index = 0; index < 30; index += 1) {
      raising = damper.update(idleInput);
    }
    expect(raising.viewmodelTransition.phase).toBe("idle");
  });
});
