import { describe, expect, it } from "vitest";

import {
  CAMERA_BOB_AMPLITUDE,
  CAMERA_BOB_LATERAL_AMPLITUDE,
  CAMERA_BREATHING_BASE_AMPLITUDE,
  CAMERA_GAIT_PLAYER_HEIGHT_METERS,
  CAMERA_GAIT_AMOUNT_MAX,
  CAMERA_GAIT_HIP_HEIGHT_RATIO,
  CAMERA_JUMP_LIFT_SCALE,
  CAMERA_WEIGHT_PITCH_MAX,
  CAMERA_RECOIL_RETICLE_FOLLOW_ANGLE,
  CAMERA_RECOIL_RETICLE_PIXELS_PER_RADIAN,
  CAMERA_RECOIL_RETICLE_RING_OVERSHOOT,
  CAMERA_RECOIL_RETICLE_RING_RADIUS_PIXELS,
  CAMERA_RECOIL_DAMPING,
  CAMERA_RECOIL_RECOVERY_DELAY_SECONDS,
  CAMERA_RECOIL_RECOVERY_OVERSHOOT_MULTIPLIER,
  CAMERA_RECOIL_RETURN_VELOCITY,
  CAMERA_RECOIL_SHOT_MULTIPLIER,
  CAMERA_RECOIL_SPRING,
  CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS,
  CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS,
  CAMERA_VIEWMODEL_AIMING_OFFSET,
  CAMERA_VIEWMODEL_CROUCHING_OFFSET,
  CAMERA_VIEWMODEL_STANDING_OFFSET,
  CAMERA_VIEWMODEL_SWITCH_DROP_Y,
  CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS,
  CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER,
  CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE,
  createCameraMotionDamper,
  resolveCameraAccelerationPitch,
  resolveCameraAccelerationRoll,
  resolveCameraGaitAngularFrequency,
  resolveCameraGaitAmount,
  resolveCameraGaitOffsets,
  resolveCameraGaitStepFrequency,
  resolveCameraWeaponShotImpulse,
  resolveCameraViewmodelOffset,
  resolveCameraViewmodelTransition,
  resolveCameraTraversalLoweringDuration,
  resolveCameraTraversalLoweringProgress,
  resolveCameraTraversalLoweringScale,
  resolveLandingWeightImpulse,
} from "./camera-motion.js";
import { O2_WALL_BRACE_STABILITY_FACTOR } from "./o2-stability.js";

const idleInput = {
  deltaSeconds: 1 / 60,
  localAcceleration: { right: 0, forward: 0 },
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

  it("uses a continuous O₂ response without reserve-driven aim sway while holding breath", () => {
    const rested = createCameraMotionDamper();
    const strained = createCameraMotionDamper();
    const held = createCameraMotionDamper();
    const heldLow = createCameraMotionDamper();
    let restedPeak = 0;
    let strainedPeak = 0;
    let heldPeak = 0;
    let heldLowPeak = 0;

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
      const heldLowFrame = heldLow.update({
        ...idleInput,
        aimingDownSights: true,
        holdingBreath: true,
        oxygenRatio: 0.1,
      });
      restedPeak = Math.max(restedPeak, Math.hypot(restedFrame.aimSwayX, restedFrame.aimSwayY));
      strainedPeak = Math.max(
        strainedPeak,
        Math.hypot(strainedFrame.aimSwayX, strainedFrame.aimSwayY),
      );
      heldPeak = Math.max(heldPeak, Math.hypot(heldFrame.aimSwayX, heldFrame.aimSwayY));
      heldLowPeak = Math.max(heldLowPeak, Math.hypot(heldLowFrame.aimSwayX, heldLowFrame.aimSwayY));
    }

    expect(strainedPeak).toBeGreaterThan(restedPeak);
    expect(heldPeak).toBeGreaterThan(0);
    expect(heldPeak).toBeCloseTo(heldLowPeak, 12);
    expect(heldPeak / restedPeak).toBeCloseTo(O2_WALL_BRACE_STABILITY_FACTOR, 2);
  });

  it("does not amplify stationary breathing while O₂ is held", () => {
    const restedDamper = createCameraMotionDamper();
    const heldDamper = createCameraMotionDamper();
    const heldLowDamper = createCameraMotionDamper();
    let restedPeak = 0;
    let heldPeak = 0;
    let heldLowPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const restedFrame = restedDamper.update(idleInput);
      const heldFrame = heldDamper.update({
        ...idleInput,
        holdingBreath: true,
        oxygenRatio: 0.4,
      });
      const heldLowFrame = heldLowDamper.update({
        ...idleInput,
        holdingBreath: true,
        oxygenRatio: 0.1,
      });
      restedPeak = Math.max(restedPeak, Math.abs(restedFrame.headBob));
      heldPeak = Math.max(heldPeak, Math.abs(heldFrame.headBob));
      heldLowPeak = Math.max(heldLowPeak, Math.abs(heldLowFrame.headBob));
    }

    expect(heldPeak).toBeCloseTo(heldLowPeak, 12);
    expect(heldPeak / restedPeak).toBeCloseTo(O2_WALL_BRACE_STABILITY_FACTOR, 2);
  });

  it("leaves one half of breathing and aim sway while braced against a wall", () => {
    const normalDamper = createCameraMotionDamper();
    const bracedDamper = createCameraMotionDamper();
    let headBobPeak = 0;
    let aimSwayPeak = 0;
    let normalHeadBobPeak = 0;
    let normalAimSwayPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const normalFrame = normalDamper.update({
        ...idleInput,
        aimingDownSights: true,
        oxygenRatio: 0,
      });
      normalHeadBobPeak = Math.max(normalHeadBobPeak, Math.abs(normalFrame.headBob));
      normalAimSwayPeak = Math.max(
        normalAimSwayPeak,
        Math.hypot(normalFrame.aimSwayX, normalFrame.aimSwayY),
      );
      const frame = bracedDamper.update({
        ...idleInput,
        aimingDownSights: true,
        oxygenRatio: 0,
        stabilizedByWall: true,
      });
      headBobPeak = Math.max(headBobPeak, Math.abs(frame.headBob));
      aimSwayPeak = Math.max(aimSwayPeak, Math.hypot(frame.aimSwayX, frame.aimSwayY));
    }

    expect(headBobPeak / normalHeadBobPeak).toBeCloseTo(O2_WALL_BRACE_STABILITY_FACTOR, 2);
    expect(aimSwayPeak / normalAimSwayPeak).toBeCloseTo(O2_WALL_BRACE_STABILITY_FACTOR, 2);
  });

  it("stacks wall bracing and held breath into quarter camera motion", () => {
    const restedDamper = createCameraMotionDamper();
    const combinedDamper = createCameraMotionDamper();
    let restedHeadBobPeak = 0;
    let combinedHeadBobPeak = 0;
    let restedAimSwayPeak = 0;
    let combinedAimSwayPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const restedFrame = restedDamper.update({ ...idleInput, aimingDownSights: true });
      const combinedFrame = combinedDamper.update({
        ...idleInput,
        aimingDownSights: true,
        holdingBreath: true,
        stabilizedByWall: true,
        oxygenRatio: 0.2,
      });
      restedHeadBobPeak = Math.max(restedHeadBobPeak, Math.abs(restedFrame.headBob));
      combinedHeadBobPeak = Math.max(combinedHeadBobPeak, Math.abs(combinedFrame.headBob));
      restedAimSwayPeak = Math.max(
        restedAimSwayPeak,
        Math.hypot(restedFrame.aimSwayX, restedFrame.aimSwayY),
      );
      combinedAimSwayPeak = Math.max(
        combinedAimSwayPeak,
        Math.hypot(combinedFrame.aimSwayX, combinedFrame.aimSwayY),
      );
    }

    const quarterFactor = O2_WALL_BRACE_STABILITY_FACTOR ** 2;
    expect(combinedHeadBobPeak / restedHeadBobPeak).toBeCloseTo(quarterFactor, 2);
    expect(combinedAimSwayPeak / restedAimSwayPeak).toBeCloseTo(quarterFactor, 2);
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

  it("turns jump take-off and landing deceleration into a shared pitch response", () => {
    const damper = createCameraMotionDamper();
    damper.applyJumpImpulse(12);
    const jumpFrame = damper.update(idleInput);

    damper.reset();
    damper.applyLandingImpulse({ downwardVelocity: 13.2, downwardAcceleration: 792 });
    const landingFrame = damper.update(idleInput);

    expect(jumpFrame.headBobPitch).toBeLessThan(0);
    expect(landingFrame.headBobPitch).toBeGreaterThan(0);
    expect(Math.abs(landingFrame.headBobPitch)).toBeGreaterThan(Math.abs(jumpFrame.headBobPitch));
    expect(Math.abs(landingFrame.headBobPitch)).toBeLessThanOrEqual(CAMERA_WEIGHT_PITCH_MAX);
  });

  it("matches the lateral shift with a damped front/back acceleration pitch", () => {
    const accelerating = createCameraMotionDamper();
    const braking = createCameraMotionDamper();
    const forwardFrame = accelerating.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 60 },
    });
    const brakingFrame = braking.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: -60 },
    });

    expect(resolveCameraAccelerationPitch(60)).toBeLessThan(0);
    expect(resolveCameraAccelerationPitch(-60)).toBeGreaterThan(0);
    expect(resolveCameraAccelerationPitch(-600)).toBeCloseTo(
      Math.abs(resolveCameraAccelerationPitch(60)),
      8,
    );
    expect(forwardFrame.headBobPitch).toBeLessThan(0);
    expect(brakingFrame.headBobPitch).toBeGreaterThan(0);
    expect(Math.abs(forwardFrame.headBobPitch)).toBeCloseTo(Math.abs(brakingFrame.headBobPitch), 8);

    let settled = forwardFrame;
    for (let index = 0; index < 180; index += 1) {
      settled = accelerating.update(idleInput);
    }
    expect(Math.abs(settled.headBobPitch)).toBeLessThan(Math.abs(forwardFrame.headBobPitch) * 0.2);
  });

  it("uses the right component of the local acceleration vector for roll", () => {
    const acceleratingRight = createCameraMotionDamper();
    const acceleratingLeft = createCameraMotionDamper();
    const rightFrame = acceleratingRight.update({
      ...idleInput,
      localAcceleration: { right: 60, forward: 0 },
    });
    const leftFrame = acceleratingLeft.update({
      ...idleInput,
      localAcceleration: { right: -60, forward: 0 },
    });

    expect(resolveCameraAccelerationRoll(60)).toBeLessThan(0);
    expect(resolveCameraAccelerationRoll(-60)).toBeGreaterThan(0);
    expect(rightFrame.roll).toBeLessThan(0);
    expect(leftFrame.roll).toBeGreaterThan(0);
    expect(Math.abs(rightFrame.roll)).toBeCloseTo(Math.abs(leftFrame.roll), 8);
  });

  it("keeps gait bob on the lateral and depth axes", () => {
    const damper = createCameraMotionDamper();
    let lateralPeak = 0;
    let depthPeak = 0;
    for (let index = 0; index < 60; index += 1) {
      const frame = damper.update({
        ...idleInput,
        movementMagnitude: 1,
        movementSpeedRatio: 1,
      });
      lateralPeak = Math.max(lateralPeak, Math.abs(frame.headBobLateral));
      depthPeak = Math.max(depthPeak, Math.abs(frame.headBobDepth));
    }

    expect(lateralPeak).toBeGreaterThan(0);
    expect(depthPeak).toBeGreaterThan(0);
  });

  it("removes footfall gait impulses while airborne", () => {
    const damper = createCameraMotionDamper();
    for (let index = 0; index < 60; index += 1) {
      damper.update({
        ...idleInput,
        grounded: true,
        movementMagnitude: 1,
        movementSpeedRatio: 1,
      });
    }

    damper.applyJumpImpulse(12);
    const airborne = damper.update({
      ...idleInput,
      grounded: false,
      movementMagnitude: 1,
      movementSpeedRatio: 1,
    });

    expect(airborne.headBobLateral).toBe(0);
    expect(airborne.headBobDepth).toBe(0);
    expect(Math.abs(airborne.headBob)).toBeLessThanOrEqual(CAMERA_BREATHING_BASE_AMPLITUDE);
    expect(airborne.weightShift).toBeGreaterThan(0);
  });

  it("shapes running gait as a U instead of a sine/cosine orbit", () => {
    const middle = resolveCameraGaitOffsets(0, 1);
    const rightSide = resolveCameraGaitOffsets(Math.PI / 2, 1);
    const leftSide = resolveCameraGaitOffsets((Math.PI * 3) / 2, 1);

    expect(middle.headBob).toBeCloseTo(CAMERA_BOB_AMPLITUDE, 10);
    expect(rightSide.headBob).toBeCloseTo(-CAMERA_BOB_AMPLITUDE, 10);
    expect(leftSide.headBob).toBeCloseTo(-CAMERA_BOB_AMPLITUDE, 10);
    expect(rightSide.headBobLateral).toBeCloseTo(CAMERA_BOB_LATERAL_AMPLITUDE, 10);
    expect(leftSide.headBobLateral).toBeCloseTo(-CAMERA_BOB_LATERAL_AMPLITUDE, 10);
  });

  it("amplifies the shared gait as speed rises from walk through trot to sprint", () => {
    const walk = resolveCameraGaitAmount(1, 1 / 3);
    const trot = resolveCameraGaitAmount(1, 2 / 3);
    const sprint = resolveCameraGaitAmount(1, 1);

    expect(walk).toBeCloseTo(1 / 3, 10);
    expect(trot).toBeCloseTo((2 / 3) * 1.3, 10);
    expect(sprint).toBe(CAMERA_GAIT_AMOUNT_MAX);
    expect(walk).toBeLessThan(trot);
    expect(trot).toBeLessThan(sprint);
  });

  it("derives walking steps from the 185 cm player's 3.4 m/s gait speed", () => {
    const walkSpeed = 3.4;
    const stepFrequency = resolveCameraGaitStepFrequency(walkSpeed);

    expect(CAMERA_GAIT_PLAYER_HEIGHT_METERS).toBe(1.85);
    expect(CAMERA_GAIT_HIP_HEIGHT_RATIO).toBe(0.53);
    expect(stepFrequency).toBeCloseTo(2.8618, 3);
    expect(1 / stepFrequency).toBeCloseTo(0.3494, 3);
    expect(resolveCameraGaitAngularFrequency(walkSpeed)).toBeCloseTo(Math.PI * stepFrequency, 10);
    expect(resolveCameraGaitStepFrequency(0)).toBe(0);
  });

  it("damps the sprint gait back toward center after movement stops", () => {
    const damper = createCameraMotionDamper();
    let sprintPeak = 0;
    for (let index = 0; index < 120; index += 1) {
      const frame = damper.update({
        ...idleInput,
        movementMagnitude: 1,
        movementSpeedRatio: 1,
      });
      sprintPeak = Math.max(sprintPeak, Math.hypot(frame.headBobLateral, frame.headBobDepth));
    }

    let stoppedFrame = damper.update(idleInput);
    for (let index = 1; index < 60; index += 1) {
      stoppedFrame = damper.update(idleInput);
    }

    expect(sprintPeak).toBeGreaterThan(0);
    expect(Math.hypot(stoppedFrame.headBobLateral, stoppedFrame.headBobDepth)).toBeLessThan(
      sprintPeak * 0.2,
    );
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
    expect(machineGun.pitch).toBe(0);
    expect(pistol.yaw).toBeGreaterThan(machineGun.yaw);
    expect(sniper.yaw).toBeGreaterThan(pistol.yaw);
    expect(sniper.yaw).toBeCloseTo(
      CAMERA_RECOIL_RETICLE_FOLLOW_ANGLE * CAMERA_RECOIL_SHOT_MULTIPLIER,
      8,
    );
    expect(pistol.yaw / sniper.yaw).toBeCloseTo(0.28, 8);
    expect(
      CAMERA_RECOIL_RETICLE_FOLLOW_ANGLE * CAMERA_RECOIL_RETICLE_PIXELS_PER_RADIAN,
    ).toBeCloseTo(
      CAMERA_RECOIL_RETICLE_RING_RADIUS_PIXELS * CAMERA_RECOIL_RETICLE_RING_OVERSHOOT,
      8,
    );
  });

  it("kicks away from the rest point in the live reticle direction", () => {
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

    expect(centered).toEqual({ yaw: 0, pitch: 0 });
    expect(rightAndDown.yaw).toBeGreaterThan(0);
    expect(rightAndDown.pitch).toBeGreaterThan(0);
    expect(leftAndUp.yaw).toBeLessThan(0);
    expect(leftAndUp.pitch).toBeLessThan(0);
    expect(rightAndDown.yaw / rightAndDown.pitch).toBeCloseTo(1, 8);
    expect(Math.hypot(rightAndDown.yaw, rightAndDown.pitch)).toBeCloseTo(
      CAMERA_RECOIL_RETICLE_FOLLOW_ANGLE * CAMERA_RECOIL_SHOT_MULTIPLIER,
      8,
    );
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

  it("returns every damage-scaled shot kick swiftly through the reticle rest point", () => {
    for (const damage of [12, 28, 100]) {
      const damper = createCameraMotionDamper();
      damper.applyWeaponShotImpulse({ damage, reticleOffset: { x: 36, y: 0 } });
      const initial = damper.update(idleInput);
      expect(initial.recoilYaw).toBeGreaterThan(0);

      let crossedRest = false;
      let frame = initial;
      for (let index = 0; index < 24; index += 1) {
        frame = damper.update(idleInput);
        crossedRest ||= frame.recoilYaw < 0;
      }

      expect(crossedRest).toBe(true);
      expect(Math.abs(frame.recoilYaw)).toBeLessThan(initial.recoilYaw);
      expect(CAMERA_RECOIL_DAMPING).toBeLessThan(2 * Math.sqrt(CAMERA_RECOIL_SPRING));
    }
  });

  it("releases a shared recovery impulse after the outward phase", () => {
    const damper = createCameraMotionDamper();
    damper.applyWeaponShotImpulse({ damage: 12, reticleOffset: { x: 36, y: 0 } });

    let frame = damper.update(idleInput);
    const preRecoveryFrames = Math.max(
      1,
      Math.ceil(CAMERA_RECOIL_RECOVERY_DELAY_SECONDS / idleInput.deltaSeconds) - 1,
    );
    for (let index = 1; index < preRecoveryFrames; index += 1) {
      frame = damper.update(idleInput);
    }
    expect(frame.recoilYaw).toBeGreaterThan(0);

    let oppositePeak = 0;
    for (let index = 0; index < 8; index += 1) {
      frame = damper.update(idleInput);
      oppositePeak = Math.min(oppositePeak, frame.recoilYaw);
    }
    expect(oppositePeak).toBeLessThan(0);
    expect(CAMERA_RECOIL_RETURN_VELOCITY).toBeGreaterThan(0);
    expect(CAMERA_RECOIL_RECOVERY_OVERSHOOT_MULTIPLIER).toBeGreaterThan(1);
  });

  it("uses one underdamped recovery response for every shot strength", () => {
    const damper = createCameraMotionDamper();
    for (const damage of [12, 28, 100]) {
      damper.reset();
      damper.applyWeaponShotImpulse({ damage, reticleOffset: { x: 36, y: 0 } });
      expect(damper.update(idleInput).recoilYaw).toBeGreaterThan(0);

      let oppositePeak = 0;
      for (let index = 0; index < 18; index += 1) {
        oppositePeak = Math.min(oppositePeak, damper.update(idleInput).recoilYaw);
      }
      expect(oppositePeak).toBeLessThan(0);
    }
    expect(CAMERA_RECOIL_DAMPING).toBeLessThan(2 * Math.sqrt(CAMERA_RECOIL_SPRING));
  });

  it("crosses the rest point before the machine-gun cadence reaches its next shot", () => {
    const damper = createCameraMotionDamper();
    damper.applyWeaponShotImpulse({ damage: 12, reticleOffset: { x: 36, y: 0 } });

    let frame = damper.update(idleInput);
    for (let index = 1; index < 5; index += 1) {
      frame = damper.update(idleInput);
    }

    expect(frame.recoilYaw).toBeLessThan(0);
  });

  it("resets roll, bob, and weight together", () => {
    const damper = createCameraMotionDamper();
    damper.applyJumpImpulse(12);
    damper.update({
      ...idleInput,
      localAcceleration: { right: 60, forward: 0 },
      movementMagnitude: 1,
      movementSpeedRatio: 1,
    });

    damper.reset();

    expect(damper.getOffsets()).toEqual({
      roll: 0,
      headBob: 0,
      headBobLateral: 0,
      headBobDepth: 0,
      headBobPitch: 0,
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
      screenBlurPixels: 0,
      screenVignetteStrength: 0,
      screenContrastMultiplier: 1,
    });
  });

  it("resets an active zoom pose with the rest of the presentation state", () => {
    const damper = createCameraMotionDamper();
    for (let index = 0; index < 120; index += 1) {
      damper.update({ ...idleInput, aimingDownSights: true });
    }

    damper.reset();

    expect(damper.getOffsets().viewmodelOffset).toEqual(CAMERA_VIEWMODEL_STANDING_OFFSET);
  });

  it("keeps a crouched weapon between hip fire and explicit zoom", () => {
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

  it("raises and centres the weapon only while zoomed", () => {
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
    expect(midpoint.y).toBeCloseTo(-0.37, 8);
    expect(midpoint.z).toBeCloseTo(-0.57, 8);
    const aiming = resolveCameraViewmodelOffset(0, 1);
    expect(aiming.x).toBeCloseTo(CAMERA_VIEWMODEL_AIMING_OFFSET.x, 8);
    expect(aiming.y).toBeCloseTo(CAMERA_VIEWMODEL_AIMING_OFFSET.y, 8);
    expect(aiming.z).toBeCloseTo(CAMERA_VIEWMODEL_AIMING_OFFSET.z, 8);
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

  it("holds the weapon lowered through traversal, then raises it after release", () => {
    const damper = createCameraMotionDamper();

    let lowering = damper.update({ ...idleInput, traversalActive: true });
    expect(lowering.viewmodelTransition.phase).toBe("lowering");

    for (let index = 0; index < 60; index += 1) {
      lowering = damper.update({ ...idleInput, traversalActive: true });
    }
    expect(lowering.viewmodelTransition.phase).toBe("lowering");
    expect(lowering.viewmodelTransition.progress).toBe(1);
    expect(lowering.viewmodelTransition.offset.y).toBeLessThan(0);
    expect(lowering.viewmodelTransition.pitchRadians).toBeLessThan(0);

    const raising = damper.update({ ...idleInput, traversalActive: false });
    expect(raising.viewmodelTransition.phase).toBe("raising");
    expect(raising.viewmodelTransition.offset.y).toBeCloseTo(
      lowering.viewmodelTransition.offset.y,
      8,
    );

    let settled = raising;
    for (let index = 0; index < 30; index += 1) {
      settled = damper.update({ ...idleInput, traversalActive: false });
    }
    expect(settled.viewmodelTransition.phase).toBe("idle");
    expect(settled.viewmodelTransition.offset.y).toBe(0);
  });

  it("lowers only a shallow amount over the resolved vault duration", () => {
    const damper = createCameraMotionDamper();
    const traversalInput = {
      ...idleInput,
      traversalActive: true,
      traversalDurationSeconds: 0.8,
      traversalKind: "vault" as const,
      traversalHeightMeters: 2,
    };

    expect(CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER).toBe(2);
    expect(resolveCameraTraversalLoweringDuration(0.8)).toBeCloseTo(0.8, 8);
    expect(resolveCameraTraversalLoweringProgress(0.4, 0.8)).toBeCloseTo(0.75, 8);
    expect(resolveCameraTraversalLoweringProgress(0.8, 0.8)).toBe(1);

    let halfway = damper.update(traversalInput);
    for (let index = 1; index < 24; index += 1) {
      halfway = damper.update(traversalInput);
    }

    expect(halfway.viewmodelTransition.progress).toBeCloseTo(0.5, 2);
    expect(halfway.viewmodelTransition.offset.y).toBeGreaterThan(
      CAMERA_VIEWMODEL_SWITCH_DROP_Y * CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE,
    );

    let settled = halfway;
    for (let index = 0; index < 40; index += 1) {
      settled = damper.update(traversalInput);
    }
    expect(settled.viewmodelTransition.progress).toBe(1);
    expect(settled.viewmodelTransition.offset.y).toBeCloseTo(
      CAMERA_VIEWMODEL_SWITCH_DROP_Y * CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE,
      6,
    );
    expect(settled.viewmodelTransition.pitchRadians).toBeCloseTo(
      CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS * CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE,
      6,
    );
  });

  it("uses the full lower pose for a four-metre wall climb", () => {
    expect(resolveCameraTraversalLoweringScale("vault", 2)).toBe(
      CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE,
    );
    expect(resolveCameraTraversalLoweringScale("wall-climb", 2)).toBeCloseTo(0.5, 8);
    expect(resolveCameraTraversalLoweringScale("wall-climb", 4)).toBe(1);

    const damper = createCameraMotionDamper();
    const traversalInput = {
      ...idleInput,
      traversalActive: true,
      traversalDurationSeconds: 0.8,
      traversalKind: "wall-climb" as const,
      traversalHeightMeters: 4,
    };
    let lowered = damper.update(traversalInput);
    for (let index = 0; index < 60; index += 1) {
      lowered = damper.update(traversalInput);
    }

    expect(lowered.viewmodelTransition.progress).toBe(1);
    expect(lowered.viewmodelTransition.offset.y).toBeCloseTo(CAMERA_VIEWMODEL_SWITCH_DROP_Y, 6);
    expect(lowered.viewmodelTransition.pitchRadians).toBeCloseTo(
      CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS,
      6,
    );
  });
});
