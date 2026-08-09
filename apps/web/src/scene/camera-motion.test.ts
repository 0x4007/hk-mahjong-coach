import { describe, expect, it } from "vitest";

import {
  CAMERA_BOB_AMPLITUDE,
  CAMERA_BOB_LATERAL_AMPLITUDE,
  CAMERA_BREATHING_BASE_AMPLITUDE,
  CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE,
  CAMERA_COVER_LEAN_OFFSET_METERS,
  CAMERA_COVER_LEAN_ROLL_RADIANS,
  CAMERA_GAIT_PLAYER_HEIGHT_METERS,
  CAMERA_GAIT_AMOUNT_MAX,
  CAMERA_GAIT_HIP_HEIGHT_RATIO,
  CAMERA_VERTICAL_ACCELERATION_WEIGHT_SCALE,
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
  CAMERA_MELEE_IMPACT_MAX_PITCH_RADIANS,
  CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND,
  CAMERA_MELEE_IMPACT_MAX_YAW_RADIANS,
  CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS,
  CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS,
  CAMERA_VIEWMODEL_AIMING_OFFSET,
  CAMERA_VIEWMODEL_CROUCHING_OFFSET,
  CAMERA_VIEWMODEL_STANDING_OFFSET,
  CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE,
  CAMERA_VIEWMODEL_SWITCH_DROP_Y,
  CAMERA_VIEWMODEL_TRAVERSAL_LOWER_EASING_PASSES,
  CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER,
  createCameraMotionDamper,
  resolveCameraAccelerationPitch,
  resolveCameraAccelerationRoll,
  resolveCameraLocalAccelerationFromVelocityDelta,
  resolveCameraLocalAccelerationFromWorld,
  resolveCameraWorldAccelerationFromVelocityDelta,
  resolveCameraGaitAngularFrequency,
  resolveCameraGaitAmount,
  resolveCameraGaitOffsets,
  resolveCameraGaitStepFrequency,
  resolveCameraMeleeImpactImpulse,
  resolveCameraWeaponShotImpulse,
  resolveCameraViewmodelOffset,
  resolveCameraViewmodelTransition,
  resolveCameraTraversalLoweringDuration,
  resolveCameraTraversalLoweringProgress,
  resolveCameraVerticalWeightImpulse,
} from "./camera-motion.js";
import { O2_CROUCH_STABILITY_FACTOR, O2_WALL_BRACE_STABILITY_FACTOR } from "./o2-stability.js";

const idleInput = {
  deltaSeconds: 1 / 60,
  localAcceleration: { right: 0, forward: 0, up: 0 },
  movementMagnitude: 0,
  movementSpeedRatio: 0,
  oxygenRatio: 1,
  crouching: false,
  shiftEnabled: true,
  bobEnabled: true,
} as const;

describe("camera motion damper", () => {
  it("projects one measured acceleration into all signed local directions", () => {
    const acceleration = resolveCameraLocalAccelerationFromWorld(
      { x: -3, y: -4, z: -5 },
      {
        right: { x: 1, y: 0, z: 0 },
        forward: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
      },
    );

    expect(acceleration).toEqual({ right: -3, forward: 5, up: -4 });
  });

  it("keeps horizontal braking horizontal when the view is pitched", () => {
    const acceleration = resolveCameraLocalAccelerationFromWorld(
      { x: 0, y: 0, z: -10 },
      {
        right: { x: 1, y: 0, z: 0 },
        forward: { x: 0, y: -0.6, z: -0.8 },
        up: { x: 0, y: 1, z: 0 },
      },
    );

    expect(acceleration.forward).toBeCloseTo(8, 8);
    expect(acceleration.up).toBe(0);
  });

  it("derives a large stop from the actual resolved velocity delta", () => {
    const acceleration = resolveCameraWorldAccelerationFromVelocityDelta(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -10 },
      1 / 60,
    );

    expect(acceleration.z).toBeCloseTo(600, 8);
  });

  it("projects the complete velocity delta without a caller dropping an axis", () => {
    const acceleration = resolveCameraLocalAccelerationFromVelocityDelta(
      { x: -3, y: -4, z: -5 },
      { x: 0, y: 0, z: 0 },
      1,
      {
        right: { x: 1, y: 0, z: 0 },
        forward: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
      },
    );

    expect(acceleration).toEqual({ right: -3, forward: 5, up: -4 });
  });

  it("keeps gait bob and weight impulses in one output", () => {
    const damper = createCameraMotionDamper();

    const lifted = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: 60 },
      movementMagnitude: 1,
      movementSpeedRatio: 1 / 3,
    });

    expect(lifted.headBob).not.toBe(0);
    expect(lifted.weightShift).toBeGreaterThan(0);
    expect(lifted.verticalOffset).toBeCloseTo(lifted.headBob + lifted.weightShift, 8);
  });

  it("is exactly still at full O₂ and adds breathing only as reserve falls", () => {
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

    expect(restedPeak).toBe(0);
    expect(rested.getOffsets().aimSwayX).toBe(0);
    expect(rested.getOffsets().aimSwayY).toBe(0);
    expect(rested.getOffsets().verticalOffset).toBe(0);
    expect(exhaustedPeak).toBeGreaterThan(0);
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
    expect(restedPeak).toBe(0);
    expect(heldPeak).toBeGreaterThan(0);
    expect(heldPeak).toBeLessThan(strainedPeak);
    expect(heldLowPeak).toBeGreaterThan(heldPeak);
  });

  it("does not amplify stationary breathing while O₂ is held", () => {
    const unheldDamper = createCameraMotionDamper();
    const heldDamper = createCameraMotionDamper();
    const heldLowDamper = createCameraMotionDamper();
    let unheldPeak = 0;
    let heldPeak = 0;
    let heldLowPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const unheldFrame = unheldDamper.update({ ...idleInput, oxygenRatio: 0.4 });
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
      unheldPeak = Math.max(unheldPeak, Math.abs(unheldFrame.headBob));
      heldPeak = Math.max(heldPeak, Math.abs(heldFrame.headBob));
      heldLowPeak = Math.max(heldLowPeak, Math.abs(heldLowFrame.headBob));
    }

    expect(heldPeak).toBeGreaterThan(0);
    expect(heldPeak).toBeLessThan(unheldPeak);
    expect(heldLowPeak).toBeGreaterThan(heldPeak);
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

  it("leaves one half of breathing and aim sway while crouched", () => {
    const normalDamper = createCameraMotionDamper();
    const crouchedDamper = createCameraMotionDamper();
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
      const frame = crouchedDamper.update({
        ...idleInput,
        aimingDownSights: true,
        oxygenRatio: 0,
        crouching: true,
      });
      headBobPeak = Math.max(headBobPeak, Math.abs(frame.headBob));
      aimSwayPeak = Math.max(aimSwayPeak, Math.hypot(frame.aimSwayX, frame.aimSwayY));
    }

    expect(headBobPeak / normalHeadBobPeak).toBeCloseTo(O2_CROUCH_STABILITY_FACTOR, 2);
    expect(aimSwayPeak / normalAimSwayPeak).toBeCloseTo(O2_CROUCH_STABILITY_FACTOR, 2);
  });

  it("composes a damped lateral lean and roll only for active cover", () => {
    const damper = createCameraMotionDamper();
    const left = damper.update({
      ...idleInput,
      aimingDownSights: true,
      stabilizedByWall: true,
      coverMode: true,
      coverLean: -1,
    });
    expect(left.coverLeanOffset).toBeLessThan(0);
    expect(left.coverLeanOffset).toBeGreaterThan(-CAMERA_COVER_LEAN_OFFSET_METERS);
    expect(left.roll).toBeGreaterThan(0);
    expect(left.roll).toBeLessThan(CAMERA_COVER_LEAN_ROLL_RADIANS);

    const neutral = damper.update({
      ...idleInput,
      aimingDownSights: true,
      stabilizedByWall: true,
      coverMode: false,
      coverLean: -1,
    });
    expect(neutral.coverLeanOffset).toBeGreaterThan(left.coverLeanOffset);
  });

  it("stacks wall bracing on top of held-breath camera motion", () => {
    const heldDamper = createCameraMotionDamper();
    const combinedDamper = createCameraMotionDamper();
    let heldHeadBobPeak = 0;
    let combinedHeadBobPeak = 0;
    let heldAimSwayPeak = 0;
    let combinedAimSwayPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const heldFrame = heldDamper.update({
        ...idleInput,
        aimingDownSights: true,
        holdingBreath: true,
        oxygenRatio: 0.2,
      });
      const combinedFrame = combinedDamper.update({
        ...idleInput,
        aimingDownSights: true,
        holdingBreath: true,
        stabilizedByWall: true,
        oxygenRatio: 0.2,
      });
      heldHeadBobPeak = Math.max(heldHeadBobPeak, Math.abs(heldFrame.headBob));
      combinedHeadBobPeak = Math.max(combinedHeadBobPeak, Math.abs(combinedFrame.headBob));
      heldAimSwayPeak = Math.max(
        heldAimSwayPeak,
        Math.hypot(heldFrame.aimSwayX, heldFrame.aimSwayY),
      );
      combinedAimSwayPeak = Math.max(
        combinedAimSwayPeak,
        Math.hypot(combinedFrame.aimSwayX, combinedFrame.aimSwayY),
      );
    }

    expect(combinedHeadBobPeak / heldHeadBobPeak).toBeCloseTo(O2_WALL_BRACE_STABILITY_FACTOR, 2);
    expect(combinedAimSwayPeak / heldAimSwayPeak).toBeCloseTo(O2_WALL_BRACE_STABILITY_FACTOR, 2);
  });

  it("stacks crouch and wall bracing into quarter camera motion", () => {
    const normalDamper = createCameraMotionDamper();
    const combinedDamper = createCameraMotionDamper();
    let normalHeadBobPeak = 0;
    let combinedHeadBobPeak = 0;
    let normalAimSwayPeak = 0;
    let combinedAimSwayPeak = 0;

    for (let index = 0; index < 180; index += 1) {
      const normalFrame = normalDamper.update({
        ...idleInput,
        aimingDownSights: true,
        oxygenRatio: 0,
      });
      const combinedFrame = combinedDamper.update({
        ...idleInput,
        aimingDownSights: true,
        oxygenRatio: 0,
        crouching: true,
        stabilizedByWall: true,
      });
      normalHeadBobPeak = Math.max(normalHeadBobPeak, Math.abs(normalFrame.headBob));
      combinedHeadBobPeak = Math.max(combinedHeadBobPeak, Math.abs(combinedFrame.headBob));
      normalAimSwayPeak = Math.max(
        normalAimSwayPeak,
        Math.hypot(normalFrame.aimSwayX, normalFrame.aimSwayY),
      );
      combinedAimSwayPeak = Math.max(
        combinedAimSwayPeak,
        Math.hypot(combinedFrame.aimSwayX, combinedFrame.aimSwayY),
      );
    }

    const quarterFactor = O2_CROUCH_STABILITY_FACTOR * O2_WALL_BRACE_STABILITY_FACTOR;
    expect(combinedHeadBobPeak / normalHeadBobPeak).toBeCloseTo(quarterFactor, 2);
    expect(combinedAimSwayPeak / normalAimSwayPeak).toBeCloseTo(quarterFactor, 2);
  });

  it("can disable breathing and gait bob together", () => {
    const damper = createCameraMotionDamper();

    const frame = damper.update({ ...idleInput, bobEnabled: false, oxygenRatio: 0 });

    expect(frame.headBob).toBe(0);
    expect(frame.verticalOffset).toBe(frame.weightShift);
  });

  it("pushes the camera up for take-off and down for landing", () => {
    const damper = createCameraMotionDamper();
    const jumpFrame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: 60 },
    });

    damper.reset();
    const landingFrame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: -180 },
    });

    expect(jumpFrame.weightShift).toBeGreaterThan(0);
    expect(landingFrame.weightShift).toBeLessThan(0);
    expect(Math.abs(landingFrame.weightShift)).toBeGreaterThan(jumpFrame.weightShift);
  });

  it("turns jump take-off and landing deceleration into a shared pitch response", () => {
    const damper = createCameraMotionDamper();
    const jumpFrame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: 60 },
    });

    damper.reset();
    const landingFrame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: -180 },
    });

    expect(jumpFrame.headBobPitch).toBeLessThan(0);
    expect(landingFrame.headBobPitch).toBeGreaterThan(0);
    expect(Math.abs(landingFrame.headBobPitch)).toBeGreaterThan(Math.abs(jumpFrame.headBobPitch));
    expect(Math.abs(landingFrame.headBobPitch)).toBeLessThanOrEqual(CAMERA_WEIGHT_PITCH_MAX);
  });

  it("keeps vertical traversal response when horizontal acceleration is disabled", () => {
    const damper = createCameraMotionDamper();
    const frame = damper.update({
      ...idleInput,
      shiftEnabled: false,
      localAcceleration: { right: 60, forward: 60, up: 60 },
    });

    expect(frame.roll).toBe(0);
    expect(frame.headBobPitch).toBeLessThan(0);
    expect(frame.weightShift).toBeGreaterThan(0);
  });

  it("clamps only the final composed vertical presentation offset", () => {
    const damper = createCameraMotionDamper();
    const frame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: 600 },
      movementMagnitude: 1,
      movementSpeedRatio: 1,
      verticalOffsetBounds: { min: -0.01, max: 0.01 },
    });

    expect(frame.headBob + frame.weightShift).toBeGreaterThan(0.01);
    expect(frame.verticalOffset).toBe(0.01);
  });

  it("produces equivalent one-second gait and acceleration output at 60 and 120 Hz", () => {
    const simulate = (deltaSeconds: number, frames: number) => {
      const damper = createCameraMotionDamper();
      let frame = damper.getOffsets();
      for (let index = 0; index < frames; index += 1) {
        frame = damper.update({
          ...idleInput,
          deltaSeconds,
          localAcceleration: { right: 18, forward: -12, up: 0 },
          movementMagnitude: 1,
          movementSpeedRatio: 2 / 3,
        });
      }
      return frame;
    };

    const sixty = simulate(1 / 60, 60);
    const oneTwenty = simulate(1 / 120, 120);
    expect(sixty.roll).toBeCloseTo(oneTwenty.roll, 8);
    expect(sixty.headBobPitch).toBeCloseTo(oneTwenty.headBobPitch, 8);
    expect(sixty.headBob).toBeCloseTo(oneTwenty.headBob, 8);
    expect(sixty.headBobLateral).toBeCloseTo(oneTwenty.headBobLateral, 8);
    expect(sixty.headBobDepth).toBeCloseTo(oneTwenty.headBobDepth, 8);
  });

  it("matches the lateral shift with a damped front/back acceleration pitch", () => {
    const accelerating = createCameraMotionDamper();
    const braking = createCameraMotionDamper();
    const forwardFrame = accelerating.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 60, up: 0 },
    });
    const brakingFrame = braking.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: -60, up: 0 },
    });

    expect(resolveCameraAccelerationPitch(60)).toBeLessThan(0);
    expect(resolveCameraAccelerationPitch(-60)).toBeGreaterThan(0);
    expect(resolveCameraAccelerationPitch(-600)).toBeCloseTo(
      CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE,
      8,
    );
    expect(Math.abs(resolveCameraAccelerationPitch(-600))).toBeGreaterThan(
      Math.abs(resolveCameraAccelerationPitch(-60)),
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

  it("saturates the signed acceleration response monotonically at its hard bound", () => {
    const responses = [0, -20, -60, -600, -6_000].map(resolveCameraAccelerationPitch);

    for (let index = 1; index < responses.length; index += 1) {
      expect(responses[index]).toBeGreaterThanOrEqual(responses[index - 1] ?? 0);
    }
    for (const response of responses) {
      expect(response).toBeLessThanOrEqual(CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE);
    }
    expect(responses.at(-2)).toBe(CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE);
    expect(responses.at(-1)).toBe(CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE);
  });

  it("makes a high-energy stop visible on the first damper frame", () => {
    const ordinary = createCameraMotionDamper().update({
      ...idleInput,
      localAcceleration: { right: 0, forward: -60, up: 0 },
    });
    const hardStop = createCameraMotionDamper().update({
      ...idleInput,
      localAcceleration: { right: 0, forward: -600, up: 0 },
    });

    expect(hardStop.headBobPitch).toBeGreaterThan(ordinary.headBobPitch);
    expect(hardStop.headBobPitch).toBeGreaterThan(CAMERA_WEIGHT_PITCH_MAX * 0.9);
  });

  it("uses the right component of the local acceleration vector for roll", () => {
    const acceleratingRight = createCameraMotionDamper();
    const acceleratingLeft = createCameraMotionDamper();
    const rightFrame = acceleratingRight.update({
      ...idleInput,
      localAcceleration: { right: 60, forward: 0, up: 0 },
    });
    const leftFrame = acceleratingLeft.update({
      ...idleInput,
      localAcceleration: { right: -60, forward: 0, up: 0 },
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

    const airborne = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: 60 },
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
    const gentleStop = resolveCameraVerticalWeightImpulse(120, 1 / 60);
    const hardStop = resolveCameraVerticalWeightImpulse(720, 1 / 60);

    expect(hardStop).toBeGreaterThan(gentleStop);
  });

  it("makes a building-height fall stronger than a normal jump landing", () => {
    const lowLedge = Math.abs(resolveCameraVerticalWeightImpulse(-360, 1 / 60));
    const normalJump = Math.abs(resolveCameraVerticalWeightImpulse(-792, 1 / 60));
    const buildingFall = Math.abs(resolveCameraVerticalWeightImpulse(-2400, 1 / 60));

    expect(normalJump).toBeGreaterThan(lowLedge);
    expect(buildingFall).toBeGreaterThan(normalJump);
  });

  it("does not create an impulse for a stationary contact", () => {
    expect(resolveCameraVerticalWeightImpulse(0, 1 / 60)).toBe(0);
    const damper = createCameraMotionDamper();
    expect(damper.update(idleInput).weightShift).toBe(0);
  });

  it("uses the configured jump lift scale", () => {
    const damper = createCameraMotionDamper();
    const frame = damper.update({
      ...idleInput,
      deltaSeconds: 0.001,
      localAcceleration: { right: 0, forward: 0, up: 1 },
    });

    expect(frame.weightShift).toBeGreaterThan(0);
    expect(frame.weightShift).toBeLessThan(CAMERA_VERTICAL_ACCELERATION_WEIGHT_SCALE);
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

  it("publishes coherent recoil and viewmodel depth on the shot frame", () => {
    const damper = createCameraMotionDamper();
    const before = damper.update(idleInput);
    const shot = damper.applyWeaponShotImpulse({
      damage: 100,
      reticleOffset: { x: 36, y: 36 },
    });

    expect(shot).toBe(damper.getOffsets());
    expect(shot.recoilYaw).toBeGreaterThan(before.recoilYaw);
    expect(shot.recoilPitch).toBeGreaterThan(before.recoilPitch);
    expect(shot.viewmodelRecoilDepth).toBeGreaterThan(before.viewmodelRecoilDepth);

    const melee = damper.applyMeleeImpactImpulse({
      localDirection: { right: -1, forward: 0, up: 0 },
      stoppingPower: CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND,
    });
    expect(melee).toBe(damper.getOffsets());
    expect(melee.recoilYaw).toBeLessThan(shot.recoilYaw);
    expect(melee.recoilPitch).toBe(shot.recoilPitch);
    expect(melee.viewmodelRecoilDepth).toBe(shot.viewmodelRecoilDepth);
  });

  it("keeps damage-scaled recoil independent of O₂", () => {
    const rested = createCameraMotionDamper();
    const exhausted = createCameraMotionDamper();
    rested.update(idleInput);
    exhausted.update({ ...idleInput, oxygenRatio: 0 });

    const shot = { damage: 28, reticleOffset: { x: 36, y: -18 } } as const;
    rested.applyWeaponShotImpulse(shot);
    exhausted.applyWeaponShotImpulse(shot);

    expect(exhausted.getOffsets().recoilYaw).toBe(rested.getOffsets().recoilYaw);
    expect(exhausted.getOffsets().recoilPitch).toBe(rested.getOffsets().recoilPitch);
    expect(exhausted.getOffsets().viewmodelRecoilDepth).toBe(
      rested.getOffsets().viewmodelRecoilDepth,
    );
  });

  it("maps the physical melee push into a signed view impulse", () => {
    const rightPush = resolveCameraMeleeImpactImpulse({
      localDirection: { right: 1, forward: 0, up: 0 },
      stoppingPower: CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND,
    });
    const forwardPush = resolveCameraMeleeImpactImpulse({
      localDirection: { right: 0, forward: 1, up: 0 },
      stoppingPower: CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND,
    });
    const backwardPush = resolveCameraMeleeImpactImpulse({
      localDirection: { right: 0, forward: -1, up: 0 },
      stoppingPower: CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND / 2,
    });

    expect(rightPush).toEqual({
      yaw: CAMERA_MELEE_IMPACT_MAX_YAW_RADIANS,
      pitch: 0,
    });
    expect(forwardPush).toEqual({
      yaw: 0,
      pitch: -CAMERA_MELEE_IMPACT_MAX_PITCH_RADIANS,
    });
    expect(backwardPush.pitch).toBeCloseTo(CAMERA_MELEE_IMPACT_MAX_PITCH_RADIANS / 2, 10);
  });

  it("normalizes diagonal push direction and caps malformed or oversized force", () => {
    const diagonal = resolveCameraMeleeImpactImpulse({
      localDirection: { right: 3, forward: 4, up: 0 },
      stoppingPower: CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND * 2,
    });
    const invalid = resolveCameraMeleeImpactImpulse({
      localDirection: { right: Number.NaN, forward: 0, up: 0 },
      stoppingPower: Number.NaN,
    });

    expect(diagonal.yaw).toBeCloseTo(CAMERA_MELEE_IMPACT_MAX_YAW_RADIANS * 0.6, 10);
    expect(diagonal.pitch).toBeCloseTo(-CAMERA_MELEE_IMPACT_MAX_PITCH_RADIANS * 0.8, 10);
    expect(invalid).toEqual({ yaw: 0, pitch: 0 });
  });

  it("returns a melee impact through the shared damper and recovers", () => {
    const damper = createCameraMotionDamper();
    damper.applyMeleeImpactImpulse({
      localDirection: { right: 0, forward: 1, up: 0 },
      stoppingPower: CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND,
    });

    const kicked = damper.update(idleInput);
    expect(kicked.recoilPitch).toBeLessThan(0);
    let recovered = kicked;
    for (let index = 0; index < 180; index += 1) {
      recovered = damper.update(idleInput);
    }
    expect(Math.abs(recovered.recoilPitch)).toBeLessThan(0.0001);
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
    damper.update({
      ...idleInput,
      localAcceleration: { right: 60, forward: 0, up: 60 },
      movementMagnitude: 1,
      movementSpeedRatio: 1,
    });
    damper.applyWeaponShotImpulse({ damage: 100, reticleOffset: { x: 36, y: 0 } });

    damper.reset();

    expect(damper.getOffsets()).toEqual({
      roll: 0,
      coverLeanRoll: 0,
      coverLeanOffset: 0,
      headBob: 0,
      headBobLateral: 0,
      headBobDepth: 0,
      headBobPitch: 0,
      weightShift: 0,
      verticalOffset: 0,
      recoilYaw: 0,
      recoilPitch: 0,
      viewmodelRecoilDepth: 0,
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

  it("uses the partial lower pose for weapon switching", () => {
    const lowering = resolveCameraViewmodelTransition(CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS / 2);
    const raising = resolveCameraViewmodelTransition(
      CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS + CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS / 2,
    );
    const settled = resolveCameraViewmodelTransition(
      CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS + CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS,
    );

    expect(lowering.phase).toBe("lowering");
    expect(lowering.offset.y).toBeLessThan(0);
    expect(lowering.offset.y).toBeGreaterThan(
      CAMERA_VIEWMODEL_SWITCH_DROP_Y * CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE,
    );
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

  it("applies and resets the death tumble pose", () => {
    const damper = createCameraMotionDamper();
    damper.applyDeathTumble();

    const falling = damper.update(idleInput);
    expect(falling.recoilPitch).toBeGreaterThan(0);
    expect(falling.roll).toBeGreaterThan(0);
    expect(falling.verticalOffset).toBeLessThan(0);

    damper.reset();
    const reset = damper.update({ ...idleInput, bobEnabled: false });
    expect(reset.recoilPitch).toBe(0);
    expect(reset.roll).toBe(0);
    expect(reset.verticalOffset).toBe(0);
  });

  it("uses one partial traversal pose and raises from the exact reached amount", () => {
    const damper = createCameraMotionDamper();
    const traversalInput = {
      ...idleInput,
      traversalActive: true,
      traversalDurationSeconds: 0.8,
    };

    let lowering = damper.update(traversalInput);
    expect(lowering.viewmodelTransition.phase).toBe("lowering");

    for (let index = 0; index < 47; index += 1) {
      lowering = damper.update(traversalInput);
    }
    expect(lowering.viewmodelTransition.phase).toBe("lowering");
    expect(lowering.viewmodelTransition.progress).toBe(1);
    expect(lowering.viewmodelTransition.offset.y).toBeCloseTo(
      CAMERA_VIEWMODEL_SWITCH_DROP_Y * CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE,
      6,
    );
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

  it("continues lowering past the partial pose instead of clamping", () => {
    const damper = createCameraMotionDamper();
    const traversalInput = {
      ...idleInput,
      traversalActive: true,
      traversalDurationSeconds: 0.8,
    };

    expect(CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER).toBe(2);
    expect(CAMERA_VIEWMODEL_TRAVERSAL_LOWER_EASING_PASSES).toBe(2);
    expect(resolveCameraTraversalLoweringDuration(0.8)).toBeCloseTo(0.8, 8);
    expect(resolveCameraTraversalLoweringProgress(0.4, 0.8)).toBeCloseTo(0.9375, 8);
    expect(resolveCameraTraversalLoweringProgress(0.8, 0.8)).toBe(1);
    expect(resolveCameraTraversalLoweringProgress(2.4, 0.8)).toBeCloseTo(9, 8);

    let halfway = damper.update(traversalInput);
    for (let index = 1; index < 24; index += 1) {
      halfway = damper.update(traversalInput);
    }

    expect(halfway.viewmodelTransition.progress).toBeCloseTo(0.5, 2);
    expect(halfway.viewmodelTransition.offset.y).toBeGreaterThan(
      CAMERA_VIEWMODEL_SWITCH_DROP_Y * CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE,
    );

    let extended = halfway;
    for (let index = 0; index < 120; index += 1) {
      extended = damper.update(traversalInput);
    }
    expect(extended.viewmodelTransition.phase).toBe("lowering");
    expect(extended.viewmodelTransition.offset.y).toBeLessThan(CAMERA_VIEWMODEL_SWITCH_DROP_Y);

    const raising = damper.update({ ...idleInput, traversalActive: false });
    expect(raising.viewmodelTransition.phase).toBe("raising");
    expect(raising.viewmodelTransition.offset.y).toBeCloseTo(
      extended.viewmodelTransition.offset.y,
      8,
    );
  });
});
