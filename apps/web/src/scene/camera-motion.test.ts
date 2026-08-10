import { describe, expect, it } from "vitest";

import {
  CAMERA_BOB_AMPLITUDE,
  CAMERA_BOB_LATERAL_AMPLITUDE,
  CAMERA_BREATHING_BASE_AMPLITUDE,
  CAMERA_HEAD_CONTACT_SOFTNESS_METERS,
  CAMERA_HEAD_INERTIA_DAMPING,
  CAMERA_HEAD_INERTIA_SPRING,
  CAMERA_HEAD_PROXY_RADIUS_METERS,
  CAMERA_COVER_LEAN_OFFSET_METERS,
  CAMERA_COVER_LEAN_ROLL_RADIANS,
  CAMERA_GAIT_PLAYER_HEIGHT_METERS,
  CAMERA_GAIT_AMOUNT_MAX,
  CAMERA_GAIT_HIP_HEIGHT_RATIO,
  CAMERA_VERTICAL_ACCELERATION_WEIGHT_SCALE,
  CAMERA_VERTICAL_ACCELERATION_RESPONSE_EXPONENT,
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
  CAMERA_VIEWMODEL_SWITCH_LOWER_SCALE,
  createCameraMotionDamper,
  resolveCameraAccelerationPitch,
  resolveCameraAccelerationRoll,
  resolveCameraBodyRelativeAcceleration,
  resolveCameraHeadContact,
  resolveCameraInertialLoad,
  resolveCameraLocalAccelerationFromVelocityDelta,
  resolveCameraLocalAccelerationFromWorld,
  resolveCameraWorldAccelerationFromVelocityDelta,
  resolveCameraGaitAngularFrequency,
  resolveCameraGaitAmount,
  resolveCameraGaitOffsets,
  resolveCameraGaitStepFrequency,
  resolveCameraWeaponShotImpulse,
  resolveCameraViewmodelOffset,
  resolveCameraViewmodelTransition,
  resolveCameraVerticalWeightImpulse,
  resolveCameraVerticalWeightResponse,
} from "./camera-motion.js";
import { O2_WALL_BRACE_STABILITY_FACTOR } from "./o2-stability.js";
import {
  PLAYER_JUMP_SPEED_METERS_PER_SECOND,
  WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
} from "./world-scale.js";

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

const inertialInput = {
  ...idleInput,
  bobEnabled: false,
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

  it("maps all six signed directions to opposite continuous head loads", () => {
    const right = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 30, forward: 0, up: 0 },
    });
    const left = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: -30, forward: 0, up: 0 },
    });
    const forward = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 0, forward: 30, up: 0 },
    });
    const backward = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 0, forward: -30, up: 0 },
    });
    const up = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 0, forward: 0, up: 30 },
    });
    const down = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 0, forward: 0, up: -30 },
    });

    expect(right.headBobLateral).toBeLessThan(0);
    expect(right.roll).toBeLessThan(0);
    expect(left.headBobLateral).toBeGreaterThan(0);
    expect(left.roll).toBeGreaterThan(0);
    expect(forward.headBobDepth).toBeLessThan(0);
    expect(forward.headBobPitch).toBeLessThan(0);
    expect(backward.headBobDepth).toBeGreaterThan(0);
    expect(backward.headBobPitch).toBeGreaterThan(0);
    expect(up.weightShift).toBeLessThan(0);
    expect(up.headBobPitch).toBe(0);
    expect(down.weightShift).toBeGreaterThan(0);
    expect(down.headBobPitch).toBe(0);
  });

  it("composes diagonal loads one local component at a time", () => {
    const diagonal = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 5, forward: 7, up: 9 },
    });
    const lateral = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 5, forward: 0, up: 0 },
    });
    const foreAft = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 0, forward: 7, up: 0 },
    });
    const vertical = createCameraMotionDamper().update({
      ...inertialInput,
      localAcceleration: { right: 0, forward: 0, up: 9 },
    });

    expect(diagonal.headBobLateral).toBeCloseTo(lateral.headBobLateral, 12);
    expect(diagonal.headBobDepth).toBeCloseTo(foreAft.headBobDepth, 12);
    expect(diagonal.roll).toBeCloseTo(lateral.roll, 12);
    expect(diagonal.headBobPitch).toBeCloseTo(foreAft.headBobPitch + vertical.headBobPitch, 12);
    expect(diagonal.weightShift).toBeCloseTo(vertical.weightShift, 12);
  });

  it("returns zero inertial load for zero acceleration", () => {
    const frame = createCameraMotionDamper().update(inertialInput);

    expect(resolveCameraInertialLoad(0, 1)).toBe(0);
    expect(frame.roll).toBe(0);
    expect(frame.headBobLateral).toBe(0);
    expect(frame.headBobDepth).toBe(0);
    expect(frame.headBobPitch).toBe(0);
    expect(frame.weightShift).toBe(0);
  });

  it("does not turn shared free-fall gravity into an upward head launch", () => {
    expect(
      resolveCameraBodyRelativeAcceleration(
        { right: 0, forward: 0, up: -WORLD_GRAVITY_METERS_PER_SECOND_SQUARED },
        false,
        WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
      ).up,
    ).toBeCloseTo(0, 12);
    expect(
      resolveCameraBodyRelativeAcceleration(
        { right: 0, forward: 0, up: 696 },
        true,
        WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
      ).up,
    ).toBe(696);
    expect(
      resolveCameraBodyRelativeAcceleration(
        { right: 0, forward: 0, up: PLAYER_JUMP_SPEED_METERS_PER_SECOND * 60 },
        false,
        WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
      ).up,
    ).toBe(0);
  });

  it("keeps response continuous and monotonic as acceleration grows", () => {
    const samples = [10, 60, 120, 600].map((acceleration) =>
      Math.abs(resolveCameraInertialLoad(acceleration, 1)),
    );

    expect(samples[0]).toBeLessThan(samples[1] ?? 0);
    expect(samples[1]).toBeLessThan(samples[2] ?? 0);
    expect(samples[2]).toBeLessThan(samples[3] ?? 0);
    expect(Math.abs(resolveCameraVerticalWeightResponse(-720))).toBeGreaterThan(
      Math.abs(resolveCameraVerticalWeightResponse(-120)),
    );
    expect(
      Math.abs(resolveCameraAccelerationPitch(120.001) - resolveCameraAccelerationPitch(119.999)),
    ).toBeLessThan(0.0001);
  });

  it("uses the same second-order spring at different frame rates", () => {
    const run = (deltaSeconds: number, frames: number) => {
      const damper = createCameraMotionDamper();
      let frame = damper.update(inertialInput);
      for (let index = 0; index < frames; index += 1) {
        frame = damper.update({
          ...inertialInput,
          deltaSeconds,
          localAcceleration: { right: 24, forward: -31, up: 17 },
        });
      }
      return frame;
    };
    const sixtyFps = run(1 / 60, 60);
    const thirtyFps = run(1 / 30, 30);

    expect(CAMERA_HEAD_INERTIA_DAMPING).toBeCloseTo(2 * Math.sqrt(CAMERA_HEAD_INERTIA_SPRING), 12);
    expect(thirtyFps.headBobLateral).toBeCloseTo(sixtyFps.headBobLateral, 8);
    expect(thirtyFps.headBobDepth).toBeCloseTo(sixtyFps.headBobDepth, 8);
    expect(thirtyFps.weightShift).toBeCloseTo(sixtyFps.weightShift, 8);
    expect(thirtyFps.roll).toBeCloseTo(sixtyFps.roll, 8);
    expect(thirtyFps.headBobPitch).toBeCloseTo(sixtyFps.headBobPitch, 8);
  });

  it("keeps the head proxy above a support plane with a smooth penalty", () => {
    const contact = resolveCameraHeadContact({
      rawHeadOffset: -1.8,
      baseHeadY: 1.75,
      supportPlaneY: 0,
      headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
    });
    expect(contact.minimumOffset).toBeCloseTo(CAMERA_HEAD_PROXY_RADIUS_METERS - 1.75, 12);
    expect(contact.constrainedOffset).toBeGreaterThan(contact.minimumOffset);
    expect(contact.penaltyOffset).toBeGreaterThan(0);
    expect(contact.penaltyOffset).toBeLessThan(0.2);

    const damper = createCameraMotionDamper();
    const frame = inertialInput;
    let output = damper.update({
      ...frame,
      localAcceleration: { right: 0, forward: 0, up: 720 },
      baseHeadY: 1.75,
      supportPlaneY: 0,
      headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
    });
    for (let index = 0; index < 120; index += 1) {
      output = damper.update({
        ...frame,
        localAcceleration: { right: 0, forward: 0, up: 720 },
        baseHeadY: 1.75,
        supportPlaneY: 0,
        headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
      });
    }
    expect(output.verticalOffset).toBeGreaterThanOrEqual(
      CAMERA_HEAD_PROXY_RADIUS_METERS - 1.75 - CAMERA_HEAD_CONTACT_SOFTNESS_METERS,
    );
  });

  it("brings the severe-landing head pose toward the floor without penetration", () => {
    const damper = createCameraMotionDamper();
    let lowestHeadY = 1.75;
    for (let index = 0; index < 120; index += 1) {
      const frame = damper.update({
        ...inertialInput,
        supportPlaneY: 0,
        headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
        baseHeadY: 1.75,
        localAcceleration: { right: 0, forward: 0, up: index === 0 ? 2400 : 0 },
      });
      lowestHeadY = Math.min(lowestHeadY, 1.75 + frame.verticalOffset);
    }

    expect(lowestHeadY).toBeLessThan(0.5);
    expect(lowestHeadY).toBeGreaterThanOrEqual(
      CAMERA_HEAD_PROXY_RADIUS_METERS - CAMERA_HEAD_CONTACT_SOFTNESS_METERS,
    );
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
    expect(lifted.weightShift).toBeLessThan(0);
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
    expect(left.roll).toBeLessThan(0);
    expect(left.roll).toBeGreaterThan(-CAMERA_COVER_LEAN_ROLL_RADIANS);

    const neutral = damper.update({
      ...idleInput,
      aimingDownSights: true,
      stabilizedByWall: true,
      coverMode: false,
      coverLean: -1,
    });
    expect(neutral.coverLeanOffset).toBeGreaterThan(left.coverLeanOffset);
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
    const jumpFrame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: 60 },
    });

    damper.reset();
    const landingFrame = damper.update({
      ...idleInput,
      localAcceleration: { right: 0, forward: 0, up: -180 },
    });

    expect(jumpFrame.weightShift).toBeLessThan(0);
    expect(landingFrame.weightShift).toBeGreaterThan(0);
    expect(Math.abs(landingFrame.weightShift)).toBeGreaterThan(Math.abs(jumpFrame.weightShift));
  });

  it("keeps vertical landing compression out of the fore/aft pitch channel", () => {
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

    expect(jumpFrame.headBobPitch).toBe(0);
    expect(landingFrame.headBobPitch).toBe(0);
    expect(Math.abs(landingFrame.headBobPitch)).toBeLessThanOrEqual(CAMERA_WEIGHT_PITCH_MAX);
  });

  it("keeps vertical response when horizontal acceleration is disabled", () => {
    const damper = createCameraMotionDamper();
    const frame = damper.update({
      ...idleInput,
      shiftEnabled: false,
      localAcceleration: { right: 60, forward: 60, up: 60 },
    });

    expect(frame.roll).toBe(0);
    expect(frame.headBobPitch).toBe(0);
    expect(frame.weightShift).toBeLessThan(0);
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
    expect(resolveCameraAccelerationPitch(-600)).toBeGreaterThan(0);
    expect(resolveCameraAccelerationPitch(-600)).toBeLessThan(CAMERA_WEIGHT_PITCH_MAX);
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

  it("makes a higher continuous load visible without a threshold jump", () => {
    const ordinary = createCameraMotionDamper().update({
      ...idleInput,
      localAcceleration: { right: 0, forward: -60, up: 0 },
    });
    const hardStop = createCameraMotionDamper().update({
      ...idleInput,
      localAcceleration: { right: 0, forward: -600, up: 0 },
    });

    expect(hardStop.headBobPitch).toBeGreaterThan(ordinary.headBobPitch);
    const justBelow = resolveCameraAccelerationPitch(-119.99);
    const justAbove = resolveCameraAccelerationPitch(-120.01);
    expect(justAbove).toBeGreaterThan(justBelow);
    expect(justAbove - justBelow).toBeLessThan(0.001);
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
    expect(airborne.weightShift).toBeLessThan(0);
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

    expect(Math.abs(hardStop)).toBeGreaterThan(Math.abs(gentleStop));
  });

  it("makes a building-height fall stronger than a normal jump landing", () => {
    const normalJump = Math.abs(resolveCameraVerticalWeightImpulse(-792, 1 / 60));
    const buildingFall = Math.abs(resolveCameraVerticalWeightImpulse(-2400, 1 / 60));

    expect(buildingFall).toBeGreaterThan(normalJump);
  });

  it("keeps a hard landing visibly stronger than a low ledge pulse", () => {
    const resolvePulse = (acceleration: number) => {
      const damper = createCameraMotionDamper();
      let peakCompression = 0;
      for (let index = 0; index < 36; index += 1) {
        const frame = damper.update({
          ...inertialInput,
          supportPlaneY: 0,
          headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
          baseHeadY: 1.75,
          localAcceleration: {
            right: 0,
            forward: 0,
            up: index === 0 ? acceleration : 0,
          },
        });
        peakCompression = Math.max(peakCompression, Math.abs(frame.weightShift));
      }
      return { peakCompression };
    };

    const lowLedge = resolvePulse(360);
    const fullJump = resolvePulse(792);
    const severeFall = resolvePulse(2400);

    expect(fullJump.peakCompression).toBeGreaterThan(lowLedge.peakCompression * 1.15);
    expect(severeFall.peakCompression).toBeGreaterThan(fullJump.peakCompression * 1.15);
    expect(fullJump.peakCompression).toBeGreaterThan(0.75);
    expect(severeFall.peakCompression).toBeGreaterThan(1.2);
  });

  it("uses the resolved landing delta-v to lower the eye point, not just pitch", () => {
    const resolveLandingCompression = (downwardSpeed: number): number => {
      const damper = createCameraMotionDamper();
      const frameDelta = 1 / 60;
      let peakCompression = 0;
      const supportInput = {
        ...inertialInput,
        supportPlaneY: 0,
        headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
        baseHeadY: 1.75,
      };
      // The body is falling at downwardSpeed and the physics resolver stops it
      // at support. This is the same complete world velocity delta used by
      // the scene, expressed on the up axis.
      const landingAcceleration = resolveCameraLocalAccelerationFromVelocityDelta(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: -downwardSpeed, z: 0 },
        frameDelta,
        {
          right: { x: 1, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: -1 },
          up: { x: 0, y: 1, z: 0 },
        },
      ).up;
      for (let index = 0; index < 36; index += 1) {
        const frame = damper.update({
          ...supportInput,
          localAcceleration: {
            right: 0,
            forward: 0,
            up: index === 0 ? landingAcceleration : 0,
          },
        });
        peakCompression = Math.max(peakCompression, -frame.weightShift);
        expect(frame.headBobPitch).toBe(0);
      }
      return peakCompression;
    };

    const lowLedge = resolveLandingCompression(6);
    const hardLanding = resolveLandingCompression(13.2);

    expect(lowLedge).toBeGreaterThan(0);
    expect(hardLanding).toBeGreaterThan(lowLedge * 1.4);
    expect(hardLanding).toBeGreaterThan(0.75);
  });

  it("does not launch the airborne head and keeps hard landing compression", () => {
    const damper = createCameraMotionDamper();
    const frameDelta = 1 / 60;
    const frameInput = {
      ...inertialInput,
      supportPlaneY: 0,
      headClearance: CAMERA_HEAD_PROXY_RADIUS_METERS,
      baseHeadY: 1.75,
    };
    let previousVelocity = {
      x: 0,
      y: 0,
      z: 0,
    };
    let verticalVelocity = PLAYER_JUMP_SPEED_METERS_PER_SECOND;
    let airbornePeak = 0;
    let lowestHeadY = 1.75;
    for (let index = 0; index < 32; index += 1) {
      if (index > 0) {
        verticalVelocity -= WORLD_GRAVITY_METERS_PER_SECOND_SQUARED * frameDelta;
      }
      const currentVelocity = { x: 0, y: verticalVelocity, z: 0 };
      const localAcceleration = resolveCameraLocalAccelerationFromVelocityDelta(
        currentVelocity,
        previousVelocity,
        frameDelta,
        {
          right: { x: 1, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: -1 },
          up: { x: 0, y: 1, z: 0 },
        },
      );
      const frame = damper.update({
        ...frameInput,
        grounded: false,
        localAcceleration: resolveCameraBodyRelativeAcceleration(
          localAcceleration,
          false,
          WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
        ),
      });
      airbornePeak = Math.max(airbornePeak, frame.weightShift);
      lowestHeadY = Math.min(lowestHeadY, 1.75 + frame.verticalOffset);
      previousVelocity = currentVelocity;
    }

    const landingAcceleration = resolveCameraLocalAccelerationFromVelocityDelta(
      { x: 0, y: 0, z: 0 },
      previousVelocity,
      frameDelta,
      {
        right: { x: 1, y: 0, z: 0 },
        forward: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
      },
    );
    const bodyRelativeLandingAcceleration = resolveCameraBodyRelativeAcceleration(
      landingAcceleration,
      true,
      WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
    );
    let peakCompression = 0;
    for (let index = 0; index < 36; index += 1) {
      const frame = damper.update({
        ...frameInput,
        grounded: true,
        localAcceleration:
          index === 0 ? bodyRelativeLandingAcceleration : { right: 0, forward: 0, up: 0 },
      });
      peakCompression = Math.max(peakCompression, -frame.weightShift);
      lowestHeadY = Math.min(lowestHeadY, 1.75 + frame.verticalOffset);
      expect(frame.headBobPitch).toBe(0);
    }

    expect(CAMERA_VERTICAL_ACCELERATION_RESPONSE_EXPONENT).toBeGreaterThan(1);
    expect(airbornePeak).toBe(0);
    expect(peakCompression).toBeGreaterThan(0.35);
    expect(lowestHeadY).toBeLessThan(1);
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

    expect(frame.weightShift).toBeLessThan(0);
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

    damper.reset();

    expect(damper.getOffsets()).toEqual({
      roll: 0,
      coverLeanOffset: 0,
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
      CAMERA_VIEWMODEL_SWITCH_DROP_Y * CAMERA_VIEWMODEL_SWITCH_LOWER_SCALE,
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
});
