import { O2_BRACED_STABILITY_FACTOR, resolveO2Stability } from "./o2-stability.js";
import { PLAYER_MOVE_SPEED_METERS_PER_SECOND, PLAYER_WALK_SPEED_RATIO } from "./world-scale.js";

/**
 * Horizontal acceleration expressed in the player's local frame.
 *
 * `right` is positive toward screen-right and `forward` is positive toward
 * the view direction. Keeping both components together lets collision and
 * locomotion code submit one physical signal to the presentation damper.
 */
export interface CameraLocalAcceleration {
  readonly right: number;
  readonly forward: number;
}

export interface CameraMotionUpdateInput {
  readonly deltaSeconds: number;
  /** Actual horizontal acceleration in the player's local frame. */
  readonly localAcceleration: CameraLocalAcceleration;
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
  /** Whether the physics-resolved player support is on the ground. */
  readonly grounded?: boolean;
  /** Whether an active vault or wall-climb arc is currently moving the player. */
  readonly traversalActive?: boolean;
  /** The resolved movement duration for the active vault or wall climb. */
  readonly traversalDurationSeconds?: number;
  /** The active traversal kind, used to choose the held-gun lower amount. */
  readonly traversalKind?: CameraTraversalKind;
  /** Height of the traversed obstacle in metres for wall-climb scaling. */
  readonly traversalHeightMeters?: number;
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
  /** Continuous vertical gait and breathing bob in metres. */
  readonly headBob: number;
  /** Local left/right gait displacement in metres. */
  readonly headBobLateral: number;
  /** Local forward/back gait displacement in metres. */
  readonly headBobDepth: number;
  /** Short-lived pitch response to take-off, landing, and front/back acceleration. */
  readonly headBobPitch: number;
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

export type CameraTraversalKind = "vault" | "wall-climb";

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
  readonly applyWeaponSwitchImpulse: (input: CameraWeaponSwitchInput) => void;
  readonly clearAcceleration: () => void;
  readonly clearBob: () => void;
  readonly reset: () => void;
  readonly getOffsets: () => CameraMotionOffsets;
}

/** Horizontal acceleration that reaches the same maximum response as a full sprint roll. */
export const CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED = 60;
/** Preserve the accepted full-sprint response while using acceleration as the sole roll source. */
export const CAMERA_ACCELERATION_MAX_RESPONSE = (3.6 * Math.PI) / 180;
export const CAMERA_ACCELERATION_ROLL_MAX = CAMERA_ACCELERATION_MAX_RESPONSE;
export const CAMERA_ACCELERATION_PITCH_MAX = CAMERA_ACCELERATION_MAX_RESPONSE;
export const CAMERA_ACCELERATION_TARGET_DAMPING = 4;
export const CAMERA_ACCELERATION_DAMPING = 6;
export const CAMERA_BOB_AMPLITUDE = 0.025;
export const CAMERA_BOB_LATERAL_AMPLITUDE = 0.012;
export const CAMERA_BOB_DEPTH_AMPLITUDE = 0.008;
/** Extra gait amplitude applied across the walk-to-sprint speed blend. */
export const CAMERA_SPRINT_GAIT_GAIN = 0.6;
/** Maximum gait amount at full standing sprint. */
export const CAMERA_GAIT_AMOUNT_MAX = 1 + CAMERA_SPRINT_GAIT_GAIN;
export const CAMERA_BOB_DAMPING = 12;
/** Player height used by the gait model supplied by the first-person scale. */
export const CAMERA_GAIT_PLAYER_HEIGHT_METERS = 1.85;
/** Alexander's hip-height approximation for a standing human. */
export const CAMERA_GAIT_HIP_HEIGHT_RATIO = 0.53;
export const CAMERA_GAIT_HIP_HEIGHT_METERS =
  CAMERA_GAIT_PLAYER_HEIGHT_METERS * CAMERA_GAIT_HIP_HEIGHT_RATIO;
/** Real-world gravity for gait similarity; this is separate from game gravity. */
export const CAMERA_GAIT_GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;
export const CAMERA_GAIT_FORMULA_COEFFICIENT = 0.25;
export const CAMERA_GAIT_STRIDE_SPEED_EXPONENT = 1.67;
export const CAMERA_GAIT_STRIDE_HIP_EXPONENT = 1.17;
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
/** Vaults keep the gun just below its normal pose instead of hiding it. */
export const CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE = 0.2;
/** A four-metre wall climb reaches the fully lowered pose. */
export const CAMERA_VIEWMODEL_TRAVERSAL_FULL_LOWER_HEIGHT_METERS = 4;
/** The traversal lowering curve starts at twice the linear response. */
export const CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER = 2;

/**
 * Resolve how far the held gun should lower for one traversal.
 *
 * Low vaults use a deliberately shallow fixed amount so the gun can read as
 * resting on the obstacle. Wall climbs scale with the obstacle height and
 * reach the full switch pose at four metres.
 */
export const resolveCameraTraversalLoweringScale = (
  kind: CameraTraversalKind | undefined,
  heightMeters: number | undefined,
): number => {
  if (kind === "vault") {
    return CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE;
  }
  if (kind !== "wall-climb") {
    return 1;
  }
  const safeHeight = Number.isFinite(heightMeters) ? Math.max(0, heightMeters ?? 0) : 4;
  return clamp(
    Math.max(
      CAMERA_VIEWMODEL_TRAVERSAL_VAULT_LOWER_SCALE,
      safeHeight / CAMERA_VIEWMODEL_TRAVERSAL_FULL_LOWER_HEIGHT_METERS,
    ),
    0,
    1,
  );
};

/** Keep the player-resolved traversal duration authoritative for the gun pose. */
export const resolveCameraTraversalLoweringDuration = (
  traversalDurationSeconds: number | undefined,
): number => {
  const safeDuration =
    Number.isFinite(traversalDurationSeconds) && (traversalDurationSeconds ?? 0) > 0
      ? (traversalDurationSeconds ?? CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS)
      : CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS;
  return safeDuration;
};

/**
 * Resolve a faster-starting, non-freezing lowering curve.
 *
 * The power curve gives the gun a 2x initial response but still reaches its
 * target exactly at the end of the climb instead of clamping halfway through.
 */
export const resolveCameraTraversalLoweringProgress = (
  elapsedSeconds: number,
  durationSeconds: number,
): number => {
  const duration = resolveCameraTraversalLoweringDuration(durationSeconds);
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const normalized = clamp(elapsed / duration, 0, 1);
  return 1 - (1 - normalized) ** CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER;
};

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
/** Converts the spring's weight velocity into a short acceleration pitch. */
export const CAMERA_WEIGHT_PITCH_VELOCITY_SCALE = 0.015;
/** Keeps the pitch response visible after the impulse starts settling. */
export const CAMERA_WEIGHT_PITCH_POSITION_SCALE = 0.2;
export const CAMERA_WEIGHT_PITCH_MAX = 0.14;
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

const MIN_DELTA_SECONDS = 0;
const MAX_DELTA_SECONDS = 0.05;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const damp = (current: number, target: number, damping: number, deltaSeconds: number): number =>
  current + (target - current) * (1 - Math.exp(-damping * deltaSeconds));

/**
 * Estimate human step cadence from speed with Alexander's dynamic-similarity
 * relation. The relation returns a same-foot stride, so dividing by two gives
 * the distance between alternating foot contacts. This keeps the presentation
 * rhythm tied to metres travelled rather than to an arbitrary frame frequency.
 */
export const resolveCameraGaitStepFrequency = (speedMetersPerSecond: number): number => {
  const speed = Number.isFinite(speedMetersPerSecond) ? Math.max(0, speedMetersPerSecond) : 0;
  if (speed <= Number.EPSILON) {
    return 0;
  }
  const strideLength =
    ((speed /
      (CAMERA_GAIT_FORMULA_COEFFICIENT *
        Math.sqrt(CAMERA_GAIT_GRAVITY_METERS_PER_SECOND_SQUARED))) *
      CAMERA_GAIT_HIP_HEIGHT_METERS ** CAMERA_GAIT_STRIDE_HIP_EXPONENT) **
    (1 / CAMERA_GAIT_STRIDE_SPEED_EXPONENT);
  return speed / (strideLength / 2);
};

/** Convert alternating-foot cadence into the U-gait phase's angular rate. */
export const resolveCameraGaitAngularFrequency = (speedMetersPerSecond: number): number =>
  Math.PI * resolveCameraGaitStepFrequency(speedMetersPerSecond);

/**
 * Resolve the shared gait intensity from the controller's normalized movement
 * values. The speed ratio supplies both the ordinary gait amount and a
 * sprint-only amplification, while movement magnitude fades the response as
 * input is released. Keeping this calculation here makes the camera, weapon
 * viewmodel, reticle, and aim ray consume one damped intensity.
 */
export const resolveCameraGaitAmount = (
  movementMagnitude: number,
  movementSpeedRatio: number,
  crouching = false,
): number => {
  const magnitude = clamp(movementMagnitude, 0, 1);
  const speedRatio = clamp(movementSpeedRatio, 0, 1);
  const sprintBlend = clamp(
    (speedRatio - PLAYER_WALK_SPEED_RATIO) / (1 - PLAYER_WALK_SPEED_RATIO),
    0,
    1,
  );
  const postureFactor = crouching ? 0.7 : 1;
  return clamp(
    magnitude * speedRatio * postureFactor * (1 + CAMERA_SPRINT_GAIT_GAIN * sprintBlend),
    0,
    CAMERA_GAIT_AMOUNT_MAX,
  );
};

/**
 * Resolve one running stride as a reticle-space U instead of a circular orbit.
 * The lateral stride is sinusoidal; the vertical path is a parabola of that
 * stride, so the camera dips through the middle and rises at both sides.
 */
export const resolveCameraGaitOffsets = (
  phase: number,
  amount: number,
): Pick<CameraMotionOffsets, "headBob" | "headBobLateral" | "headBobDepth"> => {
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const safeAmount = clamp(amount, 0, CAMERA_GAIT_AMOUNT_MAX);
  const stride = Math.sin(safePhase);
  return {
    headBob: (1 - 2 * stride ** 2) * CAMERA_BOB_AMPLITUDE * safeAmount,
    headBobLateral: stride * CAMERA_BOB_LATERAL_AMPLITUDE * safeAmount,
    headBobDepth: Math.sin(safePhase * 2) * CAMERA_BOB_DEPTH_AMPLITUDE * safeAmount,
  };
};

/**
 * Convert front/back acceleration into the bounded presentation response used
 * by the shared local-acceleration damper. Positive forward acceleration
 * pitches up; braking pitches down.
 */
export const resolveCameraAccelerationPitch = (forwardAcceleration: number): number => {
  const acceleration = Number.isFinite(forwardAcceleration) ? forwardAcceleration : 0;
  return (
    -clamp(acceleration / CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED, -1, 1) *
    CAMERA_ACCELERATION_PITCH_MAX
  );
};

/**
 * Convert local rightward acceleration into the bounded inertial roll response
 * from the shared local-acceleration damper. The sign is inverted because the
 * player's body leans left when accelerating to the right.
 */
export const resolveCameraAccelerationRoll = (rightAcceleration: number): number => {
  const acceleration = Number.isFinite(rightAcceleration) ? rightAcceleration : 0;
  return (
    -clamp(acceleration / CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED, -1, 1) *
    CAMERA_ACCELERATION_ROLL_MAX
  );
};

const resolveCameraLocalAcceleration = (
  acceleration: CameraLocalAcceleration,
): CameraLocalAcceleration => ({
  right: Number.isFinite(acceleration.right) ? acceleration.right : 0,
  forward: Number.isFinite(acceleration.forward) ? acceleration.forward : 0,
});

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

const createTraversalViewmodelTransition = (
  phase: CameraViewmodelTransitionPhase,
  progress: number,
  amount: number,
): CameraViewmodelTransition => ({
  phase,
  progress,
  offset: {
    x: 0,
    y: CAMERA_VIEWMODEL_SWITCH_DROP_Y * amount,
    z: CAMERA_VIEWMODEL_SWITCH_DROP_Z * amount,
  },
  pitchRadians: CAMERA_VIEWMODEL_SWITCH_DOWN_PITCH_RADIANS * amount,
  yawRadians: 0,
  rollRadians: CAMERA_VIEWMODEL_SWITCH_ROLL_RADIANS * amount,
});

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
  headBobLateral: 0,
  headBobDepth: 0,
  headBobPitch: 0,
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
  let accelerationRoll = 0;
  let accelerationRollTarget = 0;
  let accelerationPitch = 0;
  let accelerationPitchTarget = 0;
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
  let traversalTransitionDurationSeconds = CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS;
  let traversalTransitionLoweringScale = 1;
  let traversalTransitionReleasing = false;
  let traversalReleaseElapsed = 0;
  let traversalReleaseStartScale = 1;
  let offsets = createDefaultOffsets();

  const clearAcceleration = (): void => {
    accelerationRoll = 0;
    accelerationRollTarget = 0;
    accelerationPitch = 0;
    accelerationPitchTarget = 0;
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
      headBobLateral: 0,
      headBobDepth: 0,
      headBobPitch: 0,
      verticalOffset: weightShift,
      aimSwayX: 0,
      aimSwayY: 0,
    };
  };

  const reset = (): void => {
    accelerationRoll = 0;
    accelerationRollTarget = 0;
    accelerationPitch = 0;
    accelerationPitchTarget = 0;
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
    traversalTransitionDurationSeconds = CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS;
    traversalTransitionLoweringScale = 1;
    traversalTransitionReleasing = false;
    traversalReleaseElapsed = 0;
    traversalReleaseStartScale = 1;
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
    const nextTraversalActive = input.traversalActive === true;
    const traversalReleaseStarted =
      !nextTraversalActive && traversalInputActive && traversalTransitionActive;
    if (nextTraversalActive && !traversalInputActive) {
      traversalTransitionElapsed = 0;
      traversalTransitionActive = true;
      traversalTransitionDurationSeconds = resolveCameraTraversalLoweringDuration(
        input.traversalDurationSeconds,
      );
      traversalTransitionLoweringScale = resolveCameraTraversalLoweringScale(
        input.traversalKind,
        input.traversalHeightMeters,
      );
      traversalTransitionReleasing = false;
      traversalReleaseElapsed = 0;
      traversalReleaseStartScale = 1;
    }
    if (traversalReleaseStarted) {
      // Release from the pose reached at the end of the climb. This keeps a
      // shallow vault drop shallow instead of snapping it to the full switch
      // pose before the normal raise phase starts.
      const loweringProgress = resolveCameraTraversalLoweringProgress(
        traversalTransitionElapsed + deltaSeconds,
        traversalTransitionDurationSeconds,
      );
      traversalReleaseStartScale = traversalTransitionLoweringScale * loweringProgress;
      traversalTransitionReleasing = true;
      traversalReleaseElapsed = 0;
    }
    traversalInputActive = nextTraversalActive;
    if (traversalTransitionActive && traversalInputActive) {
      traversalTransitionElapsed += deltaSeconds;
    } else if (
      traversalTransitionActive &&
      traversalTransitionReleasing &&
      !traversalReleaseStarted
    ) {
      traversalReleaseElapsed += deltaSeconds;
    }
    const localAcceleration = resolveCameraLocalAcceleration(input.localAcceleration);
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

    if (input.shiftEnabled && Math.abs(localAcceleration.right) > Number.EPSILON) {
      accelerationRollTarget = resolveCameraAccelerationRoll(localAcceleration.right);
    }
    accelerationRollTarget = damp(
      accelerationRollTarget,
      0,
      CAMERA_ACCELERATION_TARGET_DAMPING,
      deltaSeconds,
    );
    accelerationRoll = damp(
      accelerationRoll,
      accelerationRollTarget,
      CAMERA_ACCELERATION_DAMPING,
      deltaSeconds,
    );

    if (input.shiftEnabled && Math.abs(localAcceleration.forward) > Number.EPSILON) {
      accelerationPitchTarget = resolveCameraAccelerationPitch(localAcceleration.forward);
    }
    accelerationPitchTarget = damp(
      accelerationPitchTarget,
      0,
      CAMERA_ACCELERATION_TARGET_DAMPING,
      deltaSeconds,
    );
    accelerationPitch = damp(
      accelerationPitch,
      accelerationPitchTarget,
      CAMERA_ACCELERATION_DAMPING,
      deltaSeconds,
    );

    // Gait represents footfall, so it must not continue while the physics
    // capsule is airborne or moving through a vault/wall traversal. Keep the
    // damper stateful so the gait settles smoothly when leaving the ground;
    // jump/landing weight, breathing, and aim sway remain independent.
    const gaitEnabled = input.bobEnabled && input.grounded !== false && !nextTraversalActive;
    const bobTarget = gaitEnabled
      ? resolveCameraGaitAmount(movementMagnitude, movementSpeedRatio, input.crouching)
      : 0;
    bobAmount = damp(bobAmount, bobTarget, CAMERA_BOB_DAMPING, deltaSeconds);
    const gaitAngularFrequency =
      gaitEnabled && movementMagnitude > Number.EPSILON
        ? resolveCameraGaitAngularFrequency(
            (movementSpeedRatio / PLAYER_WALK_SPEED_RATIO) * PLAYER_MOVE_SPEED_METERS_PER_SECOND,
          )
        : 0;
    bobPhase += deltaSeconds * gaitAngularFrequency;
    const gait = resolveCameraGaitOffsets(bobPhase, gaitEnabled ? bobAmount : 0);
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
    const headBob = gait.headBob + breathingBob;

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
    const weightPitch = -(
      weightVelocity * CAMERA_WEIGHT_PITCH_VELOCITY_SCALE +
      weightShift * CAMERA_WEIGHT_PITCH_POSITION_SCALE
    );
    const headBobPitch = clamp(
      weightPitch + accelerationPitch,
      -CAMERA_WEIGHT_PITCH_MAX,
      CAMERA_WEIGHT_PITCH_MAX,
    );

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
      if (traversalInputActive) {
        const progress = clamp(
          traversalTransitionElapsed / traversalTransitionDurationSeconds,
          0,
          1,
        );
        const loweringProgress = resolveCameraTraversalLoweringProgress(
          traversalTransitionElapsed,
          traversalTransitionDurationSeconds,
        );
        traversalTransition = createTraversalViewmodelTransition(
          "lowering",
          progress,
          traversalTransitionLoweringScale * loweringProgress,
        );
      } else if (traversalTransitionReleasing) {
        const progress = clamp(
          traversalReleaseElapsed / CAMERA_VIEWMODEL_SWITCH_RAISE_SECONDS,
          0,
          1,
        );
        traversalTransition = createTraversalViewmodelTransition(
          "raising",
          progress,
          traversalReleaseStartScale * (1 - easeOutCubic(progress)),
        );
        if (progress >= 1) {
          traversalTransitionActive = false;
          traversalTransitionReleasing = false;
          traversalTransition = null;
        }
      }
    }
    if (switchTransition.phase === "idle") {
      viewmodelSwitchActive = false;
    }
    const viewmodelTransition = traversalTransition ?? switchTransition;

    offsets = {
      roll: accelerationRoll,
      headBob,
      headBobLateral: gait.headBobLateral,
      headBobDepth: gait.headBobDepth,
      headBobPitch,
      weightShift,
      verticalOffset: headBob + weightShift,
      recoilYaw,
      recoilPitch,
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
    applyWeaponSwitchImpulse,
    clearAcceleration,
    clearBob,
    reset,
    getOffsets: () => offsets,
  };
};
