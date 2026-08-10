import { O2_BRACED_STABILITY_FACTOR, resolveO2Stability } from "./o2-stability.js";

export interface CameraMotionUpdateInput {
  readonly deltaSeconds: number;
  /** Horizontal input, where positive values mean movement to the right. */
  readonly lateralInput: number;
  readonly movementMagnitude: number;
  readonly movementSpeedRatio: number;
  /** Current oxygen ratio, where 1 is rested and 0 is out of breath. */
  readonly oxygenRatio: number;
  readonly crouching: boolean;
  readonly shiftEnabled: boolean;
  readonly bobEnabled: boolean;
  /** Whether the player is zoomed. */
  readonly aimingDownSights?: boolean;
  /** Whether the player is holding breath. */
  readonly holdingBreath?: boolean;
  /** Whether wall contact is providing free aim and breathing support. */
  readonly stabilizedByWall?: boolean;
  /** Whether a ledge/vault/wall traversal is currently moving the player. */
  readonly traversalActive?: boolean;
}

export interface CameraWeaponShotInput {
  /** Damage dealt by one projectile or pellet. */
  readonly damage: number;
  /** Visible centre-dot displacement from its rest point, in CSS pixels. */
  readonly reticleOffset: {
    readonly x: number;
    readonly y: number;
  };
}

export interface CameraLandingImpact {
  /** Downward velocity just before the support collision, in metres per second. */
  readonly downwardVelocity: number;
  /** Rate at which downward velocity is removed by the support collision, in metres per second squared. */
  readonly downwardAcceleration: number;
}

export interface CameraMotionOffsets {
  /** Presentation roll in radians. */
  readonly roll: number;
  /** Continuous gait bob in metres. */
  readonly headBob: number;
  /** Short-lived vertical weight response in metres. */
  readonly weightShift: number;
  /** The complete vertical camera offset in metres. */
  readonly verticalOffset: number;
  /** Short-lived local yaw impulse in radians; positive follows screen-right. */
  readonly recoilYaw: number;
  /** Short-lived local pitch impulse in radians; positive follows screen-down. */
  readonly recoilPitch: number;
  /** Composed local pose for the camera-attached first-person viewmodel. */
  readonly viewmodelOffset: CameraViewmodelOffset;
  /** Short discard/equip transition for the camera-attached viewmodel. */
  readonly viewmodelTransition: CameraViewmodelTransition;
  /** Continuous horizontal O₂-driven aim sway in radians. */
  readonly aimSwayX: number;
  /** Continuous vertical O₂-driven aim sway in radians. */
  readonly aimSwayY: number;
  /** Continuous full-screen O₂ fatigue blur in CSS pixels. */
  readonly screenBlurPixels: number;
  /** Continuous radial O₂ fatigue vignette strength. */
  readonly screenVignetteStrength: number;
  /** Multiplicative full-screen O₂ fatigue contrast response; kept neutral. */
  readonly screenContrastMultiplier: number;
}

export interface CameraViewmodelOffset {
  /** Local horizontal offset from the optical axis, in metres. */
  readonly x: number;
  /** Local vertical offset from the optical axis, in metres. */
  readonly y: number;
  /** Local forward offset from the camera, in metres. */
  readonly z: number;
}

export type CameraViewmodelTransitionPhase = "idle" | "lowering" | "raising";

export interface CameraViewmodelTransition {
  readonly phase: CameraViewmodelTransitionPhase;
  /** Progress through the active phase, from 0 to 1. */
  readonly progress: number;
  /** Local offset composed on top of the posture offset. */
  readonly offset: CameraViewmodelOffset;
  /** Local pitch composed after the reticle aim quaternion. */
  readonly pitchRadians: number;
  /** Local yaw composed after the reticle aim quaternion. */
  readonly yawRadians: number;
  /** Local roll composed after the reticle aim quaternion. */
  readonly rollRadians: number;
}

export interface CameraMotionDamper {
  readonly update: (input: CameraMotionUpdateInput) => CameraMotionOffsets;
  readonly applyJumpImpulse: (jumpSpeed: number) => void;
  readonly applyLandingImpulse: (impact: CameraLandingImpact) => void;
  readonly applyWeaponShotImpulse: (shot: CameraWeaponShotInput) => void;
  readonly applyDeathTumble: () => void;
  readonly applyWeaponSwitchImpulse: (input: CameraWeaponSwitchInput) => void;
  readonly clearShift: () => void;
  readonly clearBob: () => void;
  readonly reset: () => void;
  readonly getOffsets: () => CameraMotionOffsets;
}

export const CAMERA_SHIFT_WEIGHT_MULTIPLIER = 2;
export const CAMERA_SHIFT_WALK = ((0.9 * Math.PI) / 180) * CAMERA_SHIFT_WEIGHT_MULTIPLIER;
export const CAMERA_SHIFT_SPRINT = ((1.8 * Math.PI) / 180) * CAMERA_SHIFT_WEIGHT_MULTIPLIER;
export const CAMERA_SHIFT_TARGET_DAMPING = 4;
export const CAMERA_SHIFT_DAMPING = 6;
export const CAMERA_BOB_AMPLITUDE = 0.025;
export const CAMERA_BOB_DAMPING = 12;
export const CAMERA_BOB_MIN_FREQUENCY = 8.5;
export const CAMERA_BOB_MAX_FREQUENCY = 14;
export const CAMERA_BREATHING_BASE_AMPLITUDE = 0.004;
export const CAMERA_BREATHING_MAX_AMPLITUDE = 0.045;
export const CAMERA_BREATHING_MIN_FREQUENCY = 0.9;
export const CAMERA_BREATHING_MAX_FREQUENCY = 2.3;
export const CAMERA_AIM_SWAY_FREQUENCY = 1.15;

/** Hip-fire placement used while standing. */
export const CAMERA_VIEWMODEL_STANDING_OFFSET: CameraViewmodelOffset = {
  x: 0.32,
  y: -0.42,
  z: -0.58,
};
/** Intermediate placement used while crouching without entering zoom. */
export const CAMERA_VIEWMODEL_CROUCHING_OFFSET: CameraViewmodelOffset = {
  x: 0.16,
  y: -0.32,
  z: -0.56,
};
/** Centered, fully raised placement used for explicit aim-down-sights mode.
 * Keep this equal to the original crouched sight pose so existing ironsights
 * and sniper optics remain exactly aligned. */
export const CAMERA_VIEWMODEL_AIMING_OFFSET: CameraViewmodelOffset = {
  x: 0,
  y: -0.22,
  z: -0.54,
};
export const CAMERA_VIEWMODEL_POSTURE_DAMPING = 14;
export const CAMERA_VIEWMODEL_AIM_DAMPING = 14;

/** The outgoing weapon clears the reticle before the new weapon rises. */
export const CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS = 0.18;
export const CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS = 0.34;
export const CAMERA_VIEWMODEL_SWITCH_DROP_Y = -1.18;
export const CAMERA_VIEWMODEL_SWITCH_DROP_Z = 0.08;
export const CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS = (-72 * Math.PI) / 180;
export const CAMERA_VIEWMODEL_SWITCH_ROLL_RADIANS = 0.24;

/**
 * The spring is intentionally separate from gait bob. Gait motion is a
 * repeating target, while weight motion is an impulse response: take-off
 * adds lift and a support collision removes downward momentum. This keeps
 * landing dip proportional to the speed that was actually stopped.
 */
export const CAMERA_WEIGHT_SPRING = 110;
export const CAMERA_WEIGHT_DAMPING = 19;
export const CAMERA_JUMP_LIFT_SCALE = 0.22;
export const CAMERA_LANDING_VELOCITY_SCALE = 0.15;
export const CAMERA_LANDING_ACCELERATION_SCALE = 0.002;
export const CAMERA_LANDING_VELOCITY_THRESHOLD = 1;
export const CAMERA_WEIGHT_IMPULSE_MAX = 7;
const CAMERA_DEATH_TUMBLE_SECONDS = 1.4;
const CAMERA_DEATH_TUMBLE_PITCH_RADIANS = Math.PI * 0.82;
const CAMERA_DEATH_TUMBLE_ROLL_RADIANS = 0.58;
const CAMERA_DEATH_TUMBLE_DROP_METERS = -0.58;
/** Damage value used to normalize the four visual weapon profiles. */
export const CAMERA_RECOIL_REFERENCE_DAMAGE = 100;
/** The CSS radius of the outer reticle ring at the default 16 px root size. */
export const CAMERA_RECOIL_RETICLE_RING_RADIUS_PIXELS = 27.6;
/** A 100-damage shot carries the aim 25% beyond the outer-ring radius. */
export const CAMERA_RECOIL_RETICLE_RING_OVERSHOOT = 1.25;
/**
 * Visible centre-dot pixels represented by one radian of camera recoil.
 * This is the shared 180 px/radian conversion multiplied by the dot's 5× aim
 * motion, so the damage scale is expressed in the same pixels the player sees.
 */
export const CAMERA_RECOIL_RETICLE_PIXELS_PER_RADIAN = 180 * 5;
/** Outward reticle-following kick at reference damage, in radians. */
export const CAMERA_RECOIL_RETICLE_FOLLOW_ANGLE =
  (CAMERA_RECOIL_RETICLE_RING_RADIUS_PIXELS * CAMERA_RECOIL_RETICLE_RING_OVERSHOOT) /
  CAMERA_RECOIL_RETICLE_PIXELS_PER_RADIAN;
/** Global shot-jerk tuning applied consistently to every weapon profile. */
export const CAMERA_RECOIL_SHOT_MULTIPLIER = 10;
/** Short shared outward phase before a shot's return impulse is released. */
export const CAMERA_RECOIL_RECOVERY_DELAY_SECONDS = 0.06;
/** Base return velocity per radian of the outward shot displacement. */
export const CAMERA_RECOIL_RETURN_VELOCITY = 36;
/** Shared multiplier that makes recovery cross the reticle rest point. */
export const CAMERA_RECOIL_RECOVERY_OVERSHOOT_MULTIPLIER = 1.5;
/**
 * Shared recoil spring. It is intentionally fast enough for a single kick to
 * cross the reticle rest point in a few frames, including at automatic-fire
 * cadence, without consulting a weapon's type or fire interval.
 */
export const CAMERA_RECOIL_SPRING = 1200;
/**
 * Underdamped recovery lets every non-zero impulse overshoot the rest point.
 * The same second-order response is used for every present and future weapon;
 * firing speed only determines how often new impulses enter this state.
 */
export const CAMERA_RECOIL_DAMPING = 34;

const CAMERA_DIRECTION_MEMORY_SECONDS = 0.24;
const MIN_LATERAL_INPUT = 0.05;
const MIN_DELTA_SECONDS = 0;
const MAX_DELTA_SECONDS = 0.05;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const damp = (current: number, target: number, damping: number, deltaSeconds: number): number =>
  current + (target - current) * (1 - Math.exp(-damping * deltaSeconds));

export interface CameraWeaponShotImpulse {
  readonly yaw: number;
  readonly pitch: number;
}

export interface CameraWeaponSwitchInput {
  /** Whether an already-held weapon should be shown lowering first. */
  readonly hasOutgoingWeapon: boolean;
}

/**
 * Resolve one damage-scaled shot kick. The vector from the reticle's rest
 * point to its live centre dot supplies the direction, so the kick goes away
 * from the rest point in any quadrant. A perfectly centred shot has no
 * camera-direction impulse; the weapon's damage controls the outward distance.
 */
export const resolveCameraWeaponShotImpulse = (
  shot: CameraWeaponShotInput,
): CameraWeaponShotImpulse => {
  const damageRatio =
    clamp(shot.damage, 0, CAMERA_RECOIL_REFERENCE_DAMAGE) / CAMERA_RECOIL_REFERENCE_DAMAGE;
  const reticleX = Number.isFinite(shot.reticleOffset.x) ? shot.reticleOffset.x : 0;
  const reticleY = Number.isFinite(shot.reticleOffset.y) ? shot.reticleOffset.y : 0;
  const reticleDistance = Math.hypot(reticleX, reticleY);
  if (reticleDistance <= Number.EPSILON || damageRatio <= 0) {
    return { yaw: 0, pitch: 0 };
  }
  const kickAngle =
    damageRatio * CAMERA_RECOIL_RETICLE_FOLLOW_ANGLE * CAMERA_RECOIL_SHOT_MULTIPLIER;
  return {
    yaw: (reticleX / reticleDistance) * kickAngle,
    pitch: (reticleY / reticleDistance) * kickAngle,
  };
};

/**
 * Integrate one axis of the shared underdamped recoil response. A shot adds a
 * displacement immediately; the spring supplies the universal recovery and
 * opposite-side overshoot. No weapon metadata is needed here.
 */
const integrateRecoilAxis = (
  offset: number,
  velocity: number,
  deltaSeconds: number,
): readonly [number, number] => {
  let nextVelocity = velocity - offset * CAMERA_RECOIL_SPRING * deltaSeconds;
  nextVelocity *= Math.exp(-CAMERA_RECOIL_DAMPING * deltaSeconds);
  const nextOffset = offset + nextVelocity * deltaSeconds;
  return [nextOffset, nextVelocity];
};

interface PendingRecoilRecovery {
  remainingSeconds: number;
  yawVelocity: number;
  pitchVelocity: number;
}

/**
 * Resolve the downward impulse produced by a support collision.
 *
 * The velocity component gives ordinary drops a readable response. The
 * acceleration component is intentionally additive: if the controller stops
 * the same fall over a shorter interval, the camera dips further. The values
 * are kept in spring-impulse units rather than metres so the final response
 * remains bounded and readable in first person.
 */
export const resolveLandingWeightImpulse = (impact: CameraLandingImpact): number => {
  const downwardVelocity = Math.max(
    0,
    Number.isFinite(impact.downwardVelocity) ? impact.downwardVelocity : 0,
  );
  const downwardAcceleration = Math.max(
    0,
    Number.isFinite(impact.downwardAcceleration) ? impact.downwardAcceleration : 0,
  );
  const velocityComponent = Math.max(0, downwardVelocity - CAMERA_LANDING_VELOCITY_THRESHOLD);
  const impulse =
    velocityComponent * CAMERA_LANDING_VELOCITY_SCALE +
    downwardAcceleration * CAMERA_LANDING_ACCELERATION_SCALE;
  return Math.min(CAMERA_WEIGHT_IMPULSE_MAX, impulse);
};

export const resolveCameraViewmodelOffset = (
  crouchAmount: number,
  aimAmount = 0,
): CameraViewmodelOffset => {
  const amount = clamp(crouchAmount, 0, 1);
  const aiming = clamp(aimAmount, 0, 1);
  const postureOffset = {
    x:
      CAMERA_VIEWMODEL_STANDING_OFFSET.x +
      (CAMERA_VIEWMODEL_CROUCHING_OFFSET.x - CAMERA_VIEWMODEL_STANDING_OFFSET.x) * amount,
    y:
      CAMERA_VIEWMODEL_STANDING_OFFSET.y +
      (CAMERA_VIEWMODEL_CROUCHING_OFFSET.y - CAMERA_VIEWMODEL_STANDING_OFFSET.y) * amount,
    z:
      CAMERA_VIEWMODEL_STANDING_OFFSET.z +
      (CAMERA_VIEWMODEL_CROUCHING_OFFSET.z - CAMERA_VIEWMODEL_STANDING_OFFSET.z) * amount,
  };
  return {
    x: postureOffset.x + (CAMERA_VIEWMODEL_AIMING_OFFSET.x - postureOffset.x) * aiming,
    y: postureOffset.y + (CAMERA_VIEWMODEL_AIMING_OFFSET.y - postureOffset.y) * aiming,
    z: postureOffset.z + (CAMERA_VIEWMODEL_AIMING_OFFSET.z - postureOffset.z) * aiming,
  };
};

const createIdleViewmodelTransition = (): CameraViewmodelTransition => ({
  phase: "idle",
  progress: 1,
  offset: { x: 0, y: 0, z: 0 },
  pitchRadians: 0,
  yawRadians: 0,
  rollRadians: 0,
});

const easeInOutCubic = (value: number): number =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

/**
 * Resolve the shared discard/equip pose for the first-person viewmodel.
 *
 * A held weapon rotates muzzle-down and drops below the frame. The next
 * weapon starts at that same off-screen pose, then rotates back up into the
 * reticle. Keeping the pose here makes the transition another camera-damper
 * output instead of a second presentation path in the weapon runtime.
 */
export const resolveCameraViewmodelTransition = (
  elapsedSeconds: number,
  hasOutgoingWeapon = true,
): CameraViewmodelTransition => {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const lowerSeconds = hasOutgoingWeapon ? CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS : 0;
  const raiseElapsed = Math.max(0, elapsed - lowerSeconds);
  if (hasOutgoingWeapon && elapsed < lowerSeconds) {
    const progress = Math.min(1, elapsed / lowerSeconds);
    const amount = easeInOutCubic(progress);
    return {
      phase: "lowering",
      progress,
      offset: {
        x: 0,
        y: CAMERA_VIEWMODEL_SWITCH_DROP_Y * amount,
        z: CAMERA_VIEWMODEL_SWITCH_DROP_Z * amount,
      },
      pitchRadians: CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS * amount,
      yawRadians: 0,
      rollRadians: CAMERA_VIEWMODEL_SWITCH_ROLL_RADIANS * amount,
    };
  }
  if (raiseElapsed < CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS) {
    const progress = Math.min(1, raiseElapsed / CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS);
    const amount = 1 - easeOutCubic(progress);
    return {
      phase: "raising",
      progress,
      offset: {
        x: 0,
        y: CAMERA_VIEWMODEL_SWITCH_DROP_Y * amount,
        z: CAMERA_VIEWMODEL_SWITCH_DROP_Z * amount,
      },
      pitchRadians: CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS * amount,
      yawRadians: 0,
      rollRadians: CAMERA_VIEWMODEL_SWITCH_ROLL_RADIANS * amount,
    };
  }
  return createIdleViewmodelTransition();
};

const createDefaultOffsets = (): CameraMotionOffsets => ({
  roll: 0,
  headBob: 0,
  weightShift: 0,
  verticalOffset: 0,
  recoilYaw: 0,
  recoilPitch: 0,
  viewmodelOffset: { ...CAMERA_VIEWMODEL_STANDING_OFFSET },
  viewmodelTransition: createIdleViewmodelTransition(),
  aimSwayX: 0,
  aimSwayY: 0,
  screenBlurPixels: 0,
  screenVignetteStrength: 0,
  screenContrastMultiplier: 1,
});

/** Create the one presentation damper shared by camera output and reticule aim. */
export const createCameraMotionDamper = (): CameraMotionDamper => {
  let shiftRoll = 0;
  let shiftTarget = 0;
  let bobPhase = 0;
  let bobAmount = 0;
  let breathingPhase = 0;
  let aimSwayPhase = 0;
  let weightShift = 0;
  let weightVelocity = 0;
  let recoilYaw = 0;
  let recoilYawVelocity = 0;
  let recoilPitch = 0;
  let recoilPitchVelocity = 0;
  const pendingRecoilRecoveries: PendingRecoilRecovery[] = [];
  let crouchAmount = 0;
  let aimAmount = 0;
  let viewmodelSwitchElapsed = 0;
  let viewmodelSwitchActive = false;
  let viewmodelSwitchHasOutgoingWeapon = true;
  let traversalInputActive = false;
  let traversalTransitionElapsed = 0;
  let traversalTransitionActive = false;
  let lastLateralDirection = 0;
  let lateralIdleTime = Number.POSITIVE_INFINITY;
  let offsets = createDefaultOffsets();
  let deathTumbleElapsedSeconds = Number.POSITIVE_INFINITY;
  let deathTumbleActive = false;

  const clearShift = (): void => {
    shiftRoll = 0;
    shiftTarget = 0;
    lastLateralDirection = 0;
    lateralIdleTime = Number.POSITIVE_INFINITY;
    offsets = {
      ...offsets,
      roll: 0,
    };
  };

  const clearBob = (): void => {
    bobPhase = 0;
    bobAmount = 0;
    breathingPhase = 0;
    aimSwayPhase = 0;
    offsets = {
      ...offsets,
      headBob: 0,
      verticalOffset: weightShift,
      aimSwayX: 0,
      aimSwayY: 0,
    };
  };

  const applyDeathTumble = (): void => {
    if (deathTumbleActive) {
      return;
    }
    deathTumbleActive = true;
    deathTumbleElapsedSeconds = 0;
  };

  const reset = (): void => {
    deathTumbleElapsedSeconds = Number.POSITIVE_INFINITY;
    deathTumbleActive = false;
    shiftRoll = 0;
    shiftTarget = 0;
    bobPhase = 0;
    bobAmount = 0;
    breathingPhase = 0;
    aimSwayPhase = 0;
    weightShift = 0;
    weightVelocity = 0;
    recoilYaw = 0;
    recoilYawVelocity = 0;
    recoilPitch = 0;
    recoilPitchVelocity = 0;
    pendingRecoilRecoveries.length = 0;
    crouchAmount = 0;
    aimAmount = 0;
    viewmodelSwitchElapsed = 0;
    viewmodelSwitchActive = false;
    viewmodelSwitchHasOutgoingWeapon = true;
    traversalInputActive = false;
    traversalTransitionElapsed = 0;
    traversalTransitionActive = false;
    lastLateralDirection = 0;
    lateralIdleTime = Number.POSITIVE_INFINITY;
    offsets = createDefaultOffsets();
  };

  const applyJumpImpulse = (jumpSpeed: number): void => {
    const safeJumpSpeed = Math.max(0, Number.isFinite(jumpSpeed) ? jumpSpeed : 0);
    weightVelocity += safeJumpSpeed * CAMERA_JUMP_LIFT_SCALE;
  };

  const applyLandingImpulse = (impact: CameraLandingImpact): void => {
    weightVelocity -= resolveLandingWeightImpulse(impact);
  };

  const applyWeaponShotImpulse = (shot: CameraWeaponShotInput): void => {
    const impulse = resolveCameraWeaponShotImpulse(shot);
    if (impulse.yaw === 0 && impulse.pitch === 0) {
      return;
    }
    recoilYaw += impulse.yaw;
    recoilPitch += impulse.pitch;
    const recoveryVelocity =
      CAMERA_RECOIL_RETURN_VELOCITY * CAMERA_RECOIL_RECOVERY_OVERSHOOT_MULTIPLIER;
    pendingRecoilRecoveries.push({
      remainingSeconds: CAMERA_RECOIL_RECOVERY_DELAY_SECONDS,
      yawVelocity: -impulse.yaw * recoveryVelocity,
      pitchVelocity: -impulse.pitch * recoveryVelocity,
    });
  };

  const applyWeaponSwitchImpulse = (input: CameraWeaponSwitchInput): void => {
    viewmodelSwitchElapsed = 0;
    viewmodelSwitchActive = true;
    viewmodelSwitchHasOutgoingWeapon = input.hasOutgoingWeapon;
  };

  const update = (input: CameraMotionUpdateInput): CameraMotionOffsets => {
    const deltaSeconds = clamp(input.deltaSeconds, MIN_DELTA_SECONDS, MAX_DELTA_SECONDS);
    let deathTumbleProgress = 0;
    if (deathTumbleActive) {
      deathTumbleElapsedSeconds = Math.min(
        CAMERA_DEATH_TUMBLE_SECONDS,
        deathTumbleElapsedSeconds + deltaSeconds,
      );
      deathTumbleProgress = deathTumbleElapsedSeconds / CAMERA_DEATH_TUMBLE_SECONDS;
    }
    const easedDeathTumble = easeOutCubic(deathTumbleProgress);
    const deathPitch = CAMERA_DEATH_TUMBLE_PITCH_RADIANS * easedDeathTumble;
    const deathRoll = CAMERA_DEATH_TUMBLE_ROLL_RADIANS * easedDeathTumble;
    const deathDrop = CAMERA_DEATH_TUMBLE_DROP_METERS * easedDeathTumble;

    const nextTraversalActive = input.traversalActive === true;
    if (nextTraversalActive && !traversalInputActive) {
      traversalTransitionElapsed = 0;
      traversalTransitionActive = true;
    }
    if (!nextTraversalActive && traversalInputActive && traversalTransitionActive) {
      // A hang can last longer than the switch animation. Release from the
      // shared fully-lowered pose so the normal raise phase always plays.
      traversalTransitionElapsed = CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS;
    }
    traversalInputActive = nextTraversalActive;
    if (traversalTransitionActive) {
      traversalTransitionElapsed += deltaSeconds;
    }
    const lateralInput = clamp(input.lateralInput, -1, 1);
    const movementMagnitude = clamp(input.movementMagnitude, 0, 1);
    const movementSpeedRatio = clamp(input.movementSpeedRatio, 0, 1);
    const oxygenRatio = clamp(input.oxygenRatio, 0, 1);
    crouchAmount = damp(
      crouchAmount,
      input.crouching ? 1 : 0,
      CAMERA_VIEWMODEL_POSTURE_DAMPING,
      deltaSeconds,
    );
    aimAmount = damp(
      aimAmount,
      input.aimingDownSights === true ? 1 : 0,
      CAMERA_VIEWMODEL_AIM_DAMPING,
      deltaSeconds,
    );

    if (input.shiftEnabled && Math.abs(lateralInput) > MIN_LATERAL_INPUT) {
      const lateralDirection = Math.sign(lateralInput);
      if (lateralDirection !== lastLateralDirection) {
        const sprintStrength = clamp((movementSpeedRatio - 1 / 3) / (1 - 1 / 3), 0, 1);
        shiftTarget =
          -lateralDirection *
          (CAMERA_SHIFT_WALK + (CAMERA_SHIFT_SPRINT - CAMERA_SHIFT_WALK) * sprintStrength);
      }
      lastLateralDirection = lateralDirection;
      lateralIdleTime = 0;
    } else if (input.shiftEnabled) {
      lateralIdleTime += deltaSeconds;
      if (lateralIdleTime > CAMERA_DIRECTION_MEMORY_SECONDS) {
        lastLateralDirection = 0;
      }
    } else {
      clearShift();
    }

    shiftTarget = damp(shiftTarget, 0, CAMERA_SHIFT_TARGET_DAMPING, deltaSeconds);
    shiftRoll = damp(shiftRoll, shiftTarget, CAMERA_SHIFT_DAMPING, deltaSeconds);

    const bobTarget = input.bobEnabled
      ? movementMagnitude * movementSpeedRatio * (input.crouching ? 0.7 : 1)
      : 0;
    bobAmount = damp(bobAmount, bobTarget, CAMERA_BOB_DAMPING, deltaSeconds);
    bobPhase +=
      deltaSeconds *
      (CAMERA_BOB_MIN_FREQUENCY +
        (CAMERA_BOB_MAX_FREQUENCY - CAMERA_BOB_MIN_FREQUENCY) * movementSpeedRatio);
    const gaitBob = Math.sin(bobPhase) * CAMERA_BOB_AMPLITUDE * bobAmount;
    const breathlessness = 1 - oxygenRatio;
    const holdingBreath = input.holdingBreath === true && oxygenRatio > 0;
    const effectiveBreathlessness = holdingBreath ? 0 : breathlessness;
    const bracedBreathingFactor =
      (holdingBreath ? O2_BRACED_STABILITY_FACTOR : 1) *
      (input.stabilizedByWall === true ? O2_BRACED_STABILITY_FACTOR : 1);
    const breathingAmplitude = input.bobEnabled
      ? (CAMERA_BREATHING_BASE_AMPLITUDE +
          CAMERA_BREATHING_MAX_AMPLITUDE * effectiveBreathlessness) *
        bracedBreathingFactor
      : 0;
    breathingPhase +=
      deltaSeconds *
      (CAMERA_BREATHING_MIN_FREQUENCY +
        (CAMERA_BREATHING_MAX_FREQUENCY - CAMERA_BREATHING_MIN_FREQUENCY) *
          effectiveBreathlessness);
    const breathingBob = Math.sin(breathingPhase) * breathingAmplitude;
    const headBob = gaitBob + breathingBob;

    const stability = resolveO2Stability({
      oxygenRatio,
      aimingDownSights: input.aimingDownSights === true,
      holdingBreath: input.holdingBreath === true,
      stabilizedByWall: input.stabilizedByWall === true,
    });
    aimSwayPhase += deltaSeconds * CAMERA_AIM_SWAY_FREQUENCY;
    const aimSwayX = input.bobEnabled ? Math.sin(aimSwayPhase) * stability.reticleSwayRadians : 0;
    const aimSwayY = input.bobEnabled
      ? Math.cos(aimSwayPhase * 0.83) * stability.reticleSwayRadians * 0.78
      : 0;

    weightVelocity += -weightShift * CAMERA_WEIGHT_SPRING * deltaSeconds;
    weightVelocity *= Math.exp(-CAMERA_WEIGHT_DAMPING * deltaSeconds);
    weightShift += weightVelocity * deltaSeconds;
    weightShift = clamp(weightShift, -0.45, 0.22);

    let pendingRecoveryCount = 0;
    let recoveryYawVelocity = 0;
    let recoveryPitchVelocity = 0;
    for (const pendingRecovery of pendingRecoilRecoveries) {
      const remainingSeconds = pendingRecovery.remainingSeconds - deltaSeconds;
      if (remainingSeconds <= 0) {
        recoveryYawVelocity += pendingRecovery.yawVelocity;
        recoveryPitchVelocity += pendingRecovery.pitchVelocity;
        continue;
      }
      pendingRecoilRecoveries[pendingRecoveryCount] = {
        ...pendingRecovery,
        remainingSeconds,
      };
      pendingRecoveryCount += 1;
    }
    pendingRecoilRecoveries.length = pendingRecoveryCount;
    recoilYawVelocity += recoveryYawVelocity;
    recoilPitchVelocity += recoveryPitchVelocity;

    [recoilYaw, recoilYawVelocity] = integrateRecoilAxis(
      recoilYaw,
      recoilYawVelocity,
      deltaSeconds,
    );
    [recoilPitch, recoilPitchVelocity] = integrateRecoilAxis(
      recoilPitch,
      recoilPitchVelocity,
      deltaSeconds,
    );

    if (viewmodelSwitchActive) {
      viewmodelSwitchElapsed += deltaSeconds;
    }
    const switchTransition = viewmodelSwitchActive
      ? resolveCameraViewmodelTransition(viewmodelSwitchElapsed, viewmodelSwitchHasOutgoingWeapon)
      : createIdleViewmodelTransition();
    let traversalTransition: CameraViewmodelTransition | null = null;
    if (traversalTransitionActive) {
      if (
        traversalInputActive &&
        traversalTransitionElapsed >= CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS
      ) {
        // Hold the exact muzzle-down/off-screen pose while the player is still
        // traversing. Once traversal releases, the normal raise phase below
        // starts from this same pose.
        traversalTransition = {
          phase: "lowering",
          progress: 1,
          offset: {
            x: 0,
            y: CAMERA_VIEWMODEL_SWITCH_DROP_Y,
            z: CAMERA_VIEWMODEL_SWITCH_DROP_Z,
          },
          pitchRadians: CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS,
          yawRadians: 0,
          rollRadians: CAMERA_VIEWMODEL_SWITCH_ROLL_RADIANS,
        };
      } else {
        traversalTransition = resolveCameraViewmodelTransition(traversalTransitionElapsed, true);
      }
      if (!traversalInputActive && traversalTransition.phase === "idle") {
        traversalTransitionActive = false;
        traversalTransition = null;
      }
    }
    if (switchTransition.phase === "idle") {
      viewmodelSwitchActive = false;
    }
    const viewmodelTransition = traversalTransition ?? switchTransition;

    offsets = {
      roll: shiftRoll + deathRoll,
      headBob,
      weightShift,
      verticalOffset: headBob + weightShift + deathDrop,
      recoilYaw,
      recoilPitch: recoilPitch + deathPitch,
      viewmodelOffset: resolveCameraViewmodelOffset(crouchAmount, aimAmount),
      viewmodelTransition,
      aimSwayX,
      aimSwayY,
      screenBlurPixels: stability.screenBlurPixels,
      screenVignetteStrength: stability.screenVignetteStrength,
      screenContrastMultiplier: stability.screenContrastMultiplier,
    };
    return offsets;
  };

  return {
    update,
    applyJumpImpulse,
    applyLandingImpulse,
    applyWeaponShotImpulse,
    applyDeathTumble,
    applyWeaponSwitchImpulse,
    clearShift,
    clearBob,
    reset,
    getOffsets: () => offsets,
  };
};
