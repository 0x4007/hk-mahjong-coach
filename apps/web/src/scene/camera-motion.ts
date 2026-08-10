import {
  O2_BRACED_STABILITY_FACTOR,
  O2_CROUCH_STABILITY_FACTOR,
  resolveO2Stability,
} from "./o2-stability.js";
import { PLAYER_MOVE_SPEED_METERS_PER_SECOND, PLAYER_WALK_SPEED_RATIO } from "./world-scale.js";
import {
  createHeadMotionState,
  HEAD_MOTION_DEFAULT_OPTIONS,
  integrateHeadMotion,
  type HeadImpulse,
  type HeadMotionSnapshot,
  type HeadMotionState,
  type HeadMotionVector,
} from "./head-motion.js";

/**
 * Acceleration expressed in the player's local frame.
 *
 * `right` is positive toward screen-right and `forward` is positive toward
 * the view direction. `up` is the take-off/landing response axis: positive
 * values represent upward launch acceleration and negative values represent
 * support-stop deceleration. Keeping all three components together lets
 * locomotion, collision, and traversal code submit one physical signal to the
 * presentation damper.
 */
export interface CameraLocalAcceleration {
  readonly right: number;
  readonly forward: number;
  readonly up: number;
}

/** A finite three-dimensional vector in world or camera-local space. */
export interface CameraMotionVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Orthonormal camera basis used to project a world acceleration into local axes. */
export interface CameraLocalFrame {
  readonly right: CameraMotionVector;
  readonly forward: CameraMotionVector;
  readonly up: CameraMotionVector;
}

/** Physics-derived clearance for the final composed vertical presentation offset. */
export interface CameraVerticalOffsetBounds {
  readonly min: number;
  readonly max: number;
}

export interface CameraMotionUpdateInput {
  readonly deltaSeconds: number;
  /** Actual acceleration in the player's local frame. */
  readonly localAcceleration: CameraLocalAcceleration;
  readonly movementMagnitude: number;
  readonly movementSpeedRatio: number;
  /** Current oxygen ratio, where 1 is rested and 0 is out of breath. */
  readonly oxygenRatio: number;
  readonly crouching: boolean;
  /** Whether horizontal acceleration roll and pitch are enabled. */
  readonly shiftEnabled: boolean;
  readonly bobEnabled: boolean;
  /** Whether the player is zoomed. */
  readonly aimingDownSights?: boolean;
  /** Whether the player is holding breath. */
  readonly holdingBreath?: boolean;
  /** Whether wall contact is providing free aim and breathing support. */
  readonly stabilizedByWall?: boolean;
  /** Whether the explicit cover state is active. */
  readonly coverMode?: boolean;
  /** Normalized cover lean input: -1 left, 0 centred, +1 right. */
  readonly coverLean?: number;
  /** Whether the physics-resolved player support is on the ground. */
  readonly grounded?: boolean;
  /** Whether an active vault or wall-climb arc is currently moving the player. */
  readonly traversalActive?: boolean;
  /** The resolved movement duration for the active vault or wall climb. */
  readonly traversalDurationSeconds?: number;
  /** Support and ceiling clearance measured from the post-physics base camera pose. */
  readonly verticalOffsetBounds?: CameraVerticalOffsetBounds;
  /** One physics-resolved body impulse. Gravity-only airborne frames omit it. */
  readonly headImpulse?: HeadImpulse;
  /** Disable legacy continuous vertical acceleration conversion for live physics. */
  readonly suppressContinuousVerticalImpulse?: boolean;
  /** Optional deterministic target injected into the shared head solver. */
  readonly headMotionTarget?: HeadMotionVector;
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

/**
 * One melee contact delivered to the first-person presentation damper.
 * `localDirection` is the actual world-space push projected into the camera's
 * signed local frame: right, forward, and up. The attacker submits the
 * opposite of the hit direction so the weapon impact recoils back toward the
 * hand; the victim submits the physical push direction.
 */
export interface CameraMeleeImpactInput {
  readonly localDirection: CameraLocalAcceleration;
  /** Stopping power in metres/second, before the shared melee cap. */
  readonly stoppingPower: number;
}

export interface CameraMotionOffsets {
  /** Presentation roll in radians. */
  readonly roll: number;
  /** Cover-only roll component, separated so the optical reticle can stay centred. */
  readonly coverLeanRoll: number;
  /** Camera-local lateral presentation offset used by cover lean, in metres. */
  readonly coverLeanOffset: number;
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
  /** Normalized camera-owned weapon kick depth used by every held gun. */
  readonly viewmodelRecoilDepth: number;
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
  readonly applyWeaponShotImpulse: (shot: CameraWeaponShotInput) => CameraMotionOffsets;
  readonly applyMeleeImpactImpulse: (impact: CameraMeleeImpactInput) => CameraMotionOffsets;
  /** Start the short first-person fall/tumble used when the player dies. */
  readonly applyDeathTumble: () => void;
  readonly applyWeaponSwitchImpulse: (input: CameraWeaponSwitchInput) => void;
  readonly clearAcceleration: () => void;
  readonly clearBob: () => void;
  readonly reset: () => void;
  readonly getOffsets: () => CameraMotionOffsets;
  /** Last immutable shared head snapshot used by every perspective consumer. */
  readonly getHeadMotionSnapshot: () => HeadMotionSnapshot;
}

/** Horizontal acceleration that reaches the same maximum response as a full sprint roll. */
export const CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED = 60;
/** Preserve the accepted full-sprint response while using acceleration as the sole roll source. */
export const CAMERA_ACCELERATION_MAX_RESPONSE = (3.6 * Math.PI) / 180;
export const CAMERA_ACCELERATION_ROLL_MAX = CAMERA_ACCELERATION_MAX_RESPONSE;
export const CAMERA_ACCELERATION_PITCH_MAX = CAMERA_ACCELERATION_MAX_RESPONSE;
/**
 * A hard stop can be much larger than the acceleration used to start a sprint.
 * Keep ordinary locomotion at the accepted response, but allow a measured
 * high-energy stop to read as an impact instead of flattening it to the same
 * small three-and-a-half degree shift.
 */
export const CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE = (12 * Math.PI) / 180;
export const CAMERA_ACCELERATION_HARD_STOP_THRESHOLD_METERS_PER_SECOND_SQUARED =
  CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED * 2;
export const CAMERA_ACCELERATION_HARD_STOP_SATURATION_METERS_PER_SECOND_SQUARED =
  CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED * 10;
/** Compensates for the shared head impulse scale on a one-frame hard stop. */
export const CAMERA_ACCELERATION_HARD_STOP_IMPULSE_GAIN = 1.15;
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
/** Lateral camera displacement at full cover lean. */
export const CAMERA_COVER_LEAN_OFFSET_METERS = 0.46;
/** Roll at full cover lean; the camera and viewmodel share this response. */
export const CAMERA_COVER_LEAN_ROLL_RADIANS = (12 * Math.PI) / 180;
export const CAMERA_COVER_LEAN_DAMPING = 16;

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
/** All viewmodel lower/raise transitions use this partial pose. */
export const CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE = 0.2;
/** Each traversal easing pass starts at twice the linear response. */
export const CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER = 2;
/** Apply the 2x easing pass twice for a faster initial lowering response. */
export const CAMERA_VIEWMODEL_TRAVERSAL_LOWER_EASING_PASSES = 2;

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
 * Two chained power curves give the gun a second 2x initial response. The
 * curve is intentionally unbounded after the resolved duration, so a delayed
 * traversal can continue below the partial pose and move off-screen instead
 * of holding at a lower clamp.
 */
export const resolveCameraTraversalLoweringProgress = (
  elapsedSeconds: number,
  durationSeconds: number,
): number => {
  const duration = resolveCameraTraversalLoweringDuration(durationSeconds);
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const normalized = Math.max(0, elapsed / duration);
  let progress = Math.min(1, normalized);
  for (let pass = 0; pass < CAMERA_VIEWMODEL_TRAVERSAL_LOWER_EASING_PASSES; pass += 1) {
    progress = 1 - (1 - progress) ** CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER;
  }
  if (normalized > 1) {
    const easingMultiplier =
      CAMERA_VIEWMODEL_TRAVERSAL_LOWER_SPEED_MULTIPLIER **
      CAMERA_VIEWMODEL_TRAVERSAL_LOWER_EASING_PASSES;
    progress = 1 + (normalized - 1) * easingMultiplier;
  }
  return progress;
};

/**
 * The spring is intentionally separate from gait bob. Gait motion is a
 * repeating target, while weight motion is an impulse response: take-off
 * adds lift and a support collision removes downward momentum. This keeps
 * landing dip proportional to the speed that was actually stopped.
 */
export const CAMERA_WEIGHT_SPRING = 110;
export const CAMERA_WEIGHT_DAMPING = 19;
/** Converts one metre/second of vertical delta-v into the weight spring. */
export const CAMERA_VERTICAL_ACCELERATION_WEIGHT_SCALE = 0.22;
export const CAMERA_WEIGHT_IMPULSE_MAX = 7;
/** Converts the spring's weight velocity into a short acceleration pitch. */
export const CAMERA_WEIGHT_PITCH_VELOCITY_SCALE = 0.015;
const CAMERA_DEATH_TUMBLE_SECONDS = 1.4;
const CAMERA_DEATH_TUMBLE_PITCH_RADIANS = Math.PI * 0.82;
const CAMERA_DEATH_TUMBLE_ROLL_RADIANS = 0.58;
const CAMERA_DEATH_TUMBLE_DROP_METERS = -0.58;
/** Keeps the pitch response visible after the impulse starts settling. */
export const CAMERA_WEIGHT_PITCH_POSITION_SCALE = 0.2;
export const CAMERA_WEIGHT_PITCH_MAX = 0.14;
/** Shared vertical translation bound before support/ceiling bounds are applied. */
export const CAMERA_HEAD_TRANSLATION_UP_LIMIT = HEAD_MOTION_DEFAULT_OPTIONS.limits.translation.up;
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
/** Maximum one-shot contribution to the normalized held-weapon depth kick. */
export const CAMERA_VIEWMODEL_RECOIL_MAX_AMOUNT = 0.52;
/** Shared recovery rate for the held-weapon depth kick. */
export const CAMERA_VIEWMODEL_RECOIL_DAMPING = 18;

/** Resolve damage into the camera-owned normalized held-weapon depth kick. */
export const resolveCameraViewmodelRecoilAmount = (damage: number): number =>
  Math.min(
    CAMERA_VIEWMODEL_RECOIL_MAX_AMOUNT,
    (Math.max(0, Number.isFinite(damage) ? damage : 0) / CAMERA_RECOIL_REFERENCE_DAMAGE) *
      CAMERA_VIEWMODEL_RECOIL_MAX_AMOUNT,
  );

/** Shared melee stopping-power scale used to bound a view impact. */
export const CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND = 18;
/** A full-strength lateral strike can turn the view by eleven degrees. */
export const CAMERA_MELEE_IMPACT_MAX_YAW_RADIANS = (11 * Math.PI) / 180;
/** Forward/upward impact response stays slightly smaller than the yaw kick. */
export const CAMERA_MELEE_IMPACT_MAX_PITCH_RADIANS = (8 * Math.PI) / 180;

const MIN_DELTA_SECONDS = 0;
const MAX_DELTA_SECONDS = 0.05;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const damp = (current: number, target: number, damping: number, deltaSeconds: number): number =>
  current + (target - current) * (1 - Math.exp(-damping * deltaSeconds));

const resolveFiniteMotionVector = (vector: CameraMotionVector): CameraMotionVector => ({
  x: Number.isFinite(vector.x) ? vector.x : 0,
  y: Number.isFinite(vector.y) ? vector.y : 0,
  z: Number.isFinite(vector.z) ? vector.z : 0,
});

const dotMotionVectors = (left: CameraMotionVector, right: CameraMotionVector): number =>
  left.x * right.x + left.y * right.y + left.z * right.z;

/**
 * Project one world-space acceleration into the player's signed local frame.
 *
 * The signs carry the opposite directions: negative right is left, negative
 * forward is backward, and negative up is downward. Keeping this projection
 * at the damper boundary means collisions and locomotion use the same input
 * regardless of which physics path resolved the player's position.
 */
export const resolveCameraLocalAccelerationFromWorld = (
  worldAcceleration: CameraMotionVector,
  frame: CameraLocalFrame,
): CameraLocalAcceleration => {
  const acceleration = resolveFiniteMotionVector(worldAcceleration);
  const right = resolveFiniteMotionVector(frame.right);
  const forward = resolveFiniteMotionVector(frame.forward);
  const up = resolveFiniteMotionVector(frame.up);
  return {
    right: dotMotionVectors(acceleration, right),
    forward: dotMotionVectors(acceleration, forward),
    up: dotMotionVectors(acceleration, up),
  };
};

/** Resolve one measured world-space delta-v into metres per second squared. */
export const resolveCameraWorldAccelerationFromVelocityDelta = (
  currentVelocity: CameraMotionVector,
  previousVelocity: CameraMotionVector,
  deltaSeconds: number,
): CameraMotionVector => {
  const current = resolveFiniteMotionVector(currentVelocity);
  const previous = resolveFiniteMotionVector(previousVelocity);
  const delta = Math.max(Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0, 1 / 120);
  return {
    x: (current.x - previous.x) / delta,
    y: (current.y - previous.y) / delta,
    z: (current.z - previous.z) / delta,
  };
};

/**
 * Resolve the complete signed local acceleration in one boundary operation.
 * Keeping velocity differencing and basis projection together prevents a
 * caller from accidentally omitting one world axis before the damper sees it.
 */
export const resolveCameraLocalAccelerationFromVelocityDelta = (
  currentVelocity: CameraMotionVector,
  previousVelocity: CameraMotionVector,
  deltaSeconds: number,
  frame: CameraLocalFrame,
): CameraLocalAcceleration =>
  resolveCameraLocalAccelerationFromWorld(
    resolveCameraWorldAccelerationFromVelocityDelta(
      currentVelocity,
      previousVelocity,
      deltaSeconds,
    ),
    frame,
  );

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
 * Preserve the accepted locomotion response while exposing unusually large
 * measured delta-v. The overload is based only on acceleration magnitude, so
 * a wall, prop, or traversal stop uses the same path without an impact event
 * or direction-specific branch.
 */
const resolveCameraAccelerationResponse = (
  acceleration: number,
  ordinaryMaximum: number,
): number => {
  const magnitude = Math.abs(Number.isFinite(acceleration) ? acceleration : 0);
  const ordinaryRatio = clamp(
    magnitude / CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED,
    0,
    1,
  );
  const hardStopRange =
    CAMERA_ACCELERATION_HARD_STOP_SATURATION_METERS_PER_SECOND_SQUARED -
    CAMERA_ACCELERATION_HARD_STOP_THRESHOLD_METERS_PER_SECOND_SQUARED;
  const hardStopBlend =
    hardStopRange > 0
      ? clamp(
          (magnitude - CAMERA_ACCELERATION_HARD_STOP_THRESHOLD_METERS_PER_SECOND_SQUARED) /
            hardStopRange,
          0,
          1,
        )
      : 0;
  const maximum =
    ordinaryMaximum +
    (CAMERA_ACCELERATION_HARD_STOP_MAX_RESPONSE - ordinaryMaximum) * hardStopBlend;
  return Math.sign(acceleration) * ordinaryRatio * maximum;
};

/** The extra signed response reserved for a high-energy stop. */
const resolveCameraAccelerationOverload = (
  acceleration: number,
  ordinaryMaximum: number,
): number => {
  const safeAcceleration = Number.isFinite(acceleration) ? acceleration : 0;
  const ordinaryRatio = clamp(
    Math.abs(safeAcceleration) / CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED,
    0,
    1,
  );
  return (
    resolveCameraAccelerationResponse(safeAcceleration, ordinaryMaximum) -
    Math.sign(safeAcceleration) * ordinaryRatio * ordinaryMaximum
  );
};

/**
 * Convert front/back acceleration into the bounded presentation response used
 * by the shared local-acceleration damper. Positive forward acceleration
 * pitches up; braking pitches down.
 */
export const resolveCameraAccelerationPitch = (forwardAcceleration: number): number => {
  const acceleration = Number.isFinite(forwardAcceleration) ? forwardAcceleration : 0;
  return -resolveCameraAccelerationResponse(acceleration, CAMERA_ACCELERATION_PITCH_MAX);
};

/**
 * Convert local rightward acceleration into the bounded inertial roll response
 * from the shared local-acceleration damper. The sign is inverted because the
 * player's body leans left when accelerating to the right.
 */
export const resolveCameraAccelerationRoll = (rightAcceleration: number): number => {
  const acceleration = Number.isFinite(rightAcceleration) ? rightAcceleration : 0;
  return -resolveCameraAccelerationResponse(acceleration, CAMERA_ACCELERATION_ROLL_MAX);
};

const sanitizeCameraLocalAcceleration = (
  acceleration: CameraLocalAcceleration,
): CameraLocalAcceleration => ({
  right: Number.isFinite(acceleration.right) ? acceleration.right : 0,
  forward: Number.isFinite(acceleration.forward) ? acceleration.forward : 0,
  up: Number.isFinite(acceleration.up) ? acceleration.up : 0,
});

export interface CameraWeaponShotImpulse {
  readonly yaw: number;
  readonly pitch: number;
}

export interface CameraMeleeImpactImpulse {
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
 * Resolve one melee view kick from the physical push vector.
 *
 * The direction is normalized before applying stopping power, so a diagonal
 * hit remains diagonal instead of becoming stronger than a straight hit.
 * Positive local forward acceleration pitches the view up through the same
 * inertial sign used by locomotion; a backward push therefore pitches down.
 */
export const resolveCameraMeleeImpactImpulse = (
  impact: CameraMeleeImpactInput,
): CameraMeleeImpactImpulse => {
  const direction = sanitizeCameraLocalAcceleration(impact.localDirection);
  const directionLength = Math.hypot(direction.right, direction.forward, direction.up);
  const stoppingPower = Number.isFinite(impact.stoppingPower)
    ? Math.max(0, impact.stoppingPower)
    : 0;
  const strength = clamp(
    stoppingPower / CAMERA_MELEE_IMPACT_MAX_STOPPING_POWER_METERS_PER_SECOND,
    0,
    1,
  );
  if (directionLength <= Number.EPSILON || strength <= 0) {
    return { yaw: 0, pitch: 0 };
  }
  return {
    yaw: (direction.right / directionLength) * CAMERA_MELEE_IMPACT_MAX_YAW_RADIANS * strength,
    pitch:
      ((-direction.forward + direction.up) / directionLength) *
      CAMERA_MELEE_IMPACT_MAX_PITCH_RADIANS *
      strength,
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
 * Convert the measured local vertical acceleration into one bounded spring
 * impulse. The scene supplies the actual delta-v over the frame, so take-off,
 * ledge catches, vault arcs, climbs, and landing stops share this conversion.
 */
export const resolveCameraVerticalWeightImpulse = (
  verticalAcceleration: number,
  deltaSeconds: number,
): number => {
  const acceleration = Number.isFinite(verticalAcceleration) ? verticalAcceleration : 0;
  const delta = clamp(deltaSeconds, MIN_DELTA_SECONDS, MAX_DELTA_SECONDS);
  return clamp(
    acceleration * delta * CAMERA_VERTICAL_ACCELERATION_WEIGHT_SCALE,
    -CAMERA_WEIGHT_IMPULSE_MAX,
    CAMERA_WEIGHT_IMPULSE_MAX,
  );
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
 * A held weapon rotates muzzle-down and lowers by the same partial amount as
 * traversal. The next weapon starts at that shared pose, then rotates back up
 * into the reticle. Keeping the pose here makes the transition another
 * camera-damper output instead of a second presentation path in the weapon
 * runtime.
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
    const amount = CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE * easeInOutCubic(progress);
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
    const amount = CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE * (1 - easeOutCubic(progress));
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
  let bobPhase = 0;
  let bobAmount = 0;
  let breathingPhase = 0;
  let aimSwayPhase = 0;
  let headMotionState: HeadMotionState = createHeadMotionState();
  let headMotionSnapshot: HeadMotionSnapshot = integrateHeadMotion(headMotionState, {
    deltaSeconds: 0,
  }).snapshot;
  let recoilYaw = 0;
  let recoilYawVelocity = 0;
  let recoilPitch = 0;
  let recoilPitchVelocity = 0;
  let viewmodelRecoilDepth = 0;
  const pendingRecoilRecoveries: PendingRecoilRecovery[] = [];
  let crouchAmount = 0;
  let aimAmount = 0;
  let coverLeanAmount = 0;
  let viewmodelSwitchElapsed = 0;
  let viewmodelSwitchActive = false;
  let viewmodelSwitchHasOutgoingWeapon = true;
  let traversalInputActive = false;
  let traversalTransitionElapsed = 0;
  let traversalTransitionActive = false;
  let traversalTransitionDurationSeconds = CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS;
  let traversalTransitionReleasing = false;
  let traversalReleaseElapsed = 0;
  let traversalReleaseStartAmount = 1;
  let offsets = createDefaultOffsets();
  let deathTumbleElapsedSeconds = Number.POSITIVE_INFINITY;
  let deathTumbleActive = false;

  const clearAcceleration = (): void => {
    headMotionState = Object.freeze({
      ...headMotionState,
      rotation: { pitch: 0, yaw: 0, roll: 0 },
      rotationVelocity: { pitch: 0, yaw: 0, roll: 0 },
    });
    headMotionSnapshot = integrateHeadMotion(headMotionState, { deltaSeconds: 0 }).snapshot;
    offsets = {
      ...offsets,
      roll: 0,
      coverLeanRoll: 0,
    };
  };

  const clearBob = (): void => {
    bobPhase = 0;
    bobAmount = 0;
    breathingPhase = 0;
    aimSwayPhase = 0;
    headMotionState = createHeadMotionState();
    headMotionSnapshot = integrateHeadMotion(headMotionState, { deltaSeconds: 0 }).snapshot;
    offsets = {
      ...offsets,
      headBob: 0,
      headBobLateral: 0,
      headBobDepth: 0,
      headBobPitch: 0,
      verticalOffset: headMotionSnapshot.translation.up,
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
    bobPhase = 0;
    bobAmount = 0;
    breathingPhase = 0;
    aimSwayPhase = 0;
    headMotionState = createHeadMotionState();
    headMotionSnapshot = integrateHeadMotion(headMotionState, { deltaSeconds: 0 }).snapshot;
    recoilYaw = 0;
    recoilYawVelocity = 0;
    recoilPitch = 0;
    recoilPitchVelocity = 0;
    viewmodelRecoilDepth = 0;
    pendingRecoilRecoveries.length = 0;
    crouchAmount = 0;
    aimAmount = 0;
    coverLeanAmount = 0;
    viewmodelSwitchElapsed = 0;
    viewmodelSwitchActive = false;
    viewmodelSwitchHasOutgoingWeapon = true;
    traversalInputActive = false;
    traversalTransitionElapsed = 0;
    traversalTransitionActive = false;
    traversalTransitionDurationSeconds = CAMERA_VIEWMODEL_SWITCH_LOWER_SECONDS;
    traversalTransitionReleasing = false;
    traversalReleaseElapsed = 0;
    traversalReleaseStartAmount = 1;
    offsets = createDefaultOffsets();
  };

  const applyWeaponShotImpulse = (shot: CameraWeaponShotInput): CameraMotionOffsets => {
    viewmodelRecoilDepth = Math.min(
      1,
      viewmodelRecoilDepth + resolveCameraViewmodelRecoilAmount(shot.damage),
    );
    const impulse = resolveCameraWeaponShotImpulse(shot);
    if (impulse.yaw !== 0 || impulse.pitch !== 0) {
      recoilYaw += impulse.yaw;
      recoilPitch += impulse.pitch;
      const recoveryVelocity =
        CAMERA_RECOIL_RETURN_VELOCITY * CAMERA_RECOIL_RECOVERY_OVERSHOOT_MULTIPLIER;
      pendingRecoilRecoveries.push({
        remainingSeconds: CAMERA_RECOIL_RECOVERY_DELAY_SECONDS,
        yawVelocity: -impulse.yaw * recoveryVelocity,
        pitchVelocity: -impulse.pitch * recoveryVelocity,
      });
    }
    offsets = { ...offsets, recoilYaw, recoilPitch, viewmodelRecoilDepth };
    return offsets;
  };

  const applyMeleeImpactImpulse = (impact: CameraMeleeImpactInput): CameraMotionOffsets => {
    const impulse = resolveCameraMeleeImpactImpulse(impact);
    if (impulse.yaw === 0 && impulse.pitch === 0) {
      return offsets;
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
    offsets = { ...offsets, recoilYaw, recoilPitch };
    return offsets;
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
    const traversalReleaseStarted =
      !nextTraversalActive && traversalInputActive && traversalTransitionActive;
    if (nextTraversalActive && !traversalInputActive) {
      traversalTransitionElapsed = 0;
      traversalTransitionActive = true;
      traversalTransitionDurationSeconds = resolveCameraTraversalLoweringDuration(
        input.traversalDurationSeconds,
      );
      traversalTransitionReleasing = false;
      traversalReleaseElapsed = 0;
      traversalReleaseStartAmount = 1;
    }
    if (traversalReleaseStarted) {
      // Release from the exact pose reached at the end of the climb. This
      // avoids snapping to a separate full-drop target before raising.
      const loweringProgress = resolveCameraTraversalLoweringProgress(
        traversalTransitionElapsed,
        traversalTransitionDurationSeconds,
      );
      traversalReleaseStartAmount = CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE * loweringProgress;
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
    const localAcceleration = sanitizeCameraLocalAcceleration(input.localAcceleration);
    const movementMagnitude = clamp(input.movementMagnitude, 0, 1);
    const movementSpeedRatio = clamp(input.movementSpeedRatio, 0, 1);
    const oxygenRatio = clamp(input.oxygenRatio, 0, 1);
    const coverLeanTarget = input.coverMode === true ? clamp(input.coverLean ?? 0, -1, 1) : 0;
    coverLeanAmount = damp(
      coverLeanAmount,
      coverLeanTarget,
      CAMERA_COVER_LEAN_DAMPING,
      deltaSeconds,
    );
    const coverLeanOffset = coverLeanAmount * CAMERA_COVER_LEAN_OFFSET_METERS;
    // Three.js camera roll is visually opposite to the screen-side lean
    // direction: a negative left-side input would tilt the horizon right.
    // Keep the lateral offset on the requested side and invert only the roll.
    const coverLeanRoll = -coverLeanAmount * CAMERA_COVER_LEAN_ROLL_RADIANS;
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

    const hasLateralAcceleration =
      input.shiftEnabled && Math.abs(localAcceleration.right) > Number.EPSILON;
    const accelerationRollSource = hasLateralAcceleration
      ? resolveCameraAccelerationRoll(localAcceleration.right)
      : 0;
    const hasForwardAcceleration =
      input.shiftEnabled && Math.abs(localAcceleration.forward) > Number.EPSILON;
    const accelerationPitchSource = hasForwardAcceleration
      ? resolveCameraAccelerationPitch(localAcceleration.forward)
      : 0;
    // High-energy stops are explicit angular events in the same head stream as
    // physics impulses. The division by frame duration converts the bounded
    // one-frame angle overload into angular delta-v for the shared solver.
    const angularStopDeltaVelocity =
      deltaSeconds > Number.EPSILON
        ? {
            pitch: hasForwardAcceleration
              ? (resolveCameraAccelerationOverload(
                  localAcceleration.forward,
                  CAMERA_ACCELERATION_PITCH_MAX,
                ) *
                  CAMERA_ACCELERATION_HARD_STOP_IMPULSE_GAIN) /
                deltaSeconds
              : 0,
            yaw: 0,
            roll: hasLateralAcceleration
              ? (resolveCameraAccelerationOverload(
                  localAcceleration.right,
                  CAMERA_ACCELERATION_ROLL_MAX,
                ) *
                  CAMERA_ACCELERATION_HARD_STOP_IMPULSE_GAIN) /
                deltaSeconds
              : 0,
          }
        : { pitch: 0, yaw: 0, roll: 0 };

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
      (input.crouching ? O2_CROUCH_STABILITY_FACTOR : 1) *
      (input.stabilizedByWall === true ? O2_BRACED_STABILITY_FACTOR : 1);
    const breathingAmplitude = input.bobEnabled
      ? (CAMERA_BREATHING_BASE_AMPLITUDE * breathlessness +
          CAMERA_BREATHING_MAX_AMPLITUDE * effectiveBreathlessness) *
        bracedBreathingFactor
      : 0;
    breathingPhase +=
      deltaSeconds *
      (CAMERA_BREATHING_MIN_FREQUENCY +
        (CAMERA_BREATHING_MAX_FREQUENCY - CAMERA_BREATHING_MIN_FREQUENCY) *
          effectiveBreathlessness);
    const breathingBob = Math.sin(breathingPhase) * breathingAmplitude;
    const headBobTarget = gait.headBob + breathingBob;

    const stability = resolveO2Stability({
      oxygenRatio,
      aimingDownSights: input.aimingDownSights === true,
      holdingBreath: input.holdingBreath === true,
      crouching: input.crouching,
      stabilizedByWall: input.stabilizedByWall === true,
    });
    aimSwayPhase += deltaSeconds * CAMERA_AIM_SWAY_FREQUENCY;
    const aimSwayX =
      input.bobEnabled && stability.reticleSwayRadians !== 0
        ? Math.sin(aimSwayPhase) * stability.reticleSwayRadians
        : 0;
    const aimSwayY =
      input.bobEnabled && stability.reticleSwayRadians !== 0
        ? Math.cos(aimSwayPhase * 0.83) * stability.reticleSwayRadians * 0.78
        : 0;

    const compatibilityImpulse =
      input.headImpulse === undefined
        ? {
            source: "locomotion" as const,
            // Legacy callers provide acceleration in the head-response sign
            // convention. The live physics path supplies an explicit body
            // delta-v instead, which the shared solver reverses once. Gravity
            // is deliberately omitted from this compatibility path when the
            // live loop marks an airborne frame as continuous free fall.
            deltaVelocity: {
              right: -localAcceleration.right * deltaSeconds,
              up:
                input.suppressContinuousVerticalImpulse === true
                  ? 0
                  : -localAcceleration.up * deltaSeconds,
              forward: -localAcceleration.forward * deltaSeconds,
            },
          }
        : undefined;
    const headMotionInput = {
      deltaSeconds,
      targetTranslation: {
        right: gait.headBobLateral,
        up: input.headMotionTarget?.up ?? headBobTarget,
        forward: gait.headBobDepth,
      },
      targetRotation: {
        pitch: accelerationPitchSource,
        yaw: 0,
        roll: accelerationRollSource,
      },
    };
    const baseHeadImpulse = input.headImpulse ?? compatibilityImpulse;
    const hasAngularStop =
      Math.abs(angularStopDeltaVelocity.pitch) > Number.EPSILON ||
      Math.abs(angularStopDeltaVelocity.roll) > Number.EPSILON;
    const headImpulse = hasAngularStop
      ? {
          ...(baseHeadImpulse ?? {
            source: "collision-stop" as const,
            deltaVelocity: { right: 0, up: 0, forward: 0 },
          }),
          angularDeltaVelocity: angularStopDeltaVelocity,
        }
      : baseHeadImpulse;
    const headMotion =
      headImpulse === undefined
        ? integrateHeadMotion(headMotionState, headMotionInput)
        : integrateHeadMotion(headMotionState, { ...headMotionInput, impulse: headImpulse });
    headMotionState = headMotion.state;
    headMotionSnapshot = headMotion.snapshot;
    const weightShift = headMotionSnapshot.translation.up - headBobTarget;
    const weightVelocity = headMotionSnapshot.translationVelocity.up;
    const weightPitch = -(
      weightVelocity * CAMERA_WEIGHT_PITCH_VELOCITY_SCALE +
      weightShift * CAMERA_WEIGHT_PITCH_POSITION_SCALE
    );
    const headBobPitch = clamp(
      weightPitch + headMotionSnapshot.rotation.pitch,
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
    viewmodelRecoilDepth = damp(
      viewmodelRecoilDepth,
      0,
      CAMERA_VIEWMODEL_RECOIL_DAMPING,
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
          CAMERA_VIEWMODEL_PARTIAL_LOWER_SCALE * loweringProgress,
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
          traversalReleaseStartAmount * (1 - easeOutCubic(progress)),
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

    const rawVerticalOffset = headMotionSnapshot.translation.up + deathDrop;
    const verticalOffsetBounds = input.verticalOffsetBounds;
    const verticalOffset =
      verticalOffsetBounds === undefined
        ? rawVerticalOffset
        : clamp(
            rawVerticalOffset,
            Math.min(verticalOffsetBounds.min, verticalOffsetBounds.max),
            Math.max(verticalOffsetBounds.min, verticalOffsetBounds.max),
          );
    if (verticalOffsetBounds !== undefined && verticalOffset !== rawVerticalOffset) {
      const lowerBound = Math.min(verticalOffsetBounds.min, verticalOffsetBounds.max);
      const upperBound = Math.max(verticalOffsetBounds.min, verticalOffsetBounds.max);
      headMotionSnapshot = Object.freeze({
        ...headMotionSnapshot,
        translationClamped: true,
        supportClamped: rawVerticalOffset < lowerBound,
        ceilingClamped: rawVerticalOffset > upperBound,
      });
    }
    offsets = {
      roll: headMotionSnapshot.rotation.roll + coverLeanRoll + deathRoll,
      coverLeanRoll,
      coverLeanOffset,
      headBob: headBobTarget,
      headBobLateral: gaitEnabled ? headMotionSnapshot.translation.right : 0,
      headBobDepth: gaitEnabled ? headMotionSnapshot.translation.forward : 0,
      headBobPitch,
      weightShift,
      verticalOffset,
      recoilYaw,
      recoilPitch: recoilPitch + deathPitch,
      viewmodelRecoilDepth,
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
    applyWeaponShotImpulse,
    applyMeleeImpactImpulse,
    applyDeathTumble,
    applyWeaponSwitchImpulse,
    clearAcceleration,
    clearBob,
    reset,
    getOffsets: () => offsets,
    getHeadMotionSnapshot: () => headMotionSnapshot,
  };
};
