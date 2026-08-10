import { O2_BRACED_STABILITY_FACTOR, resolveO2Stability } from "./o2-stability.js";
import {
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_WALK_SPEED_RATIO,
  WORLD_GRAVITY,
} from "./world-scale.js";

/**
 * Acceleration expressed in the player's local frame.
 *
 * `right` is positive toward screen-right and `forward` is positive toward
 * the view direction. `up` is the take-off/landing response axis. Keeping all
 * three components together lets locomotion and collision code submit one
 * physical signal to the presentation damper.
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
  /** World-space Y coordinate of the current support plane supplied by physics. */
  readonly supportPlaneY?: number;
  /** Minimum distance from the support plane to the head-proxy centre. */
  readonly headClearance?: number;
  /** World-space Y coordinate of the resolved head pose before presentation motion. */
  readonly baseHeadY?: number;
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

export interface CameraMotionOffsets {
  /** Presentation roll in radians. */
  readonly roll: number;
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
  readonly applyWeaponShotImpulse: (shot: CameraWeaponShotInput) => void;
  readonly applyWeaponSwitchImpulse: (input: CameraWeaponSwitchInput) => void;
  readonly clearAcceleration: () => void;
  readonly clearBob: () => void;
  readonly reset: () => void;
  readonly getOffsets: () => CameraMotionOffsets;
}

/** Acceleration scale used by the smooth inertial response. */
export const CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED = 60;
/** Maximum angular response for local lateral/fore-aft acceleration. */
export const CAMERA_ACCELERATION_MAX_RESPONSE = (3.6 * Math.PI) / 180;
export const CAMERA_ACCELERATION_ROLL_MAX = CAMERA_ACCELERATION_MAX_RESPONSE;
export const CAMERA_ACCELERATION_PITCH_MAX = CAMERA_ACCELERATION_MAX_RESPONSE;
/** The shared second-order head/body spring. */
export const CAMERA_HEAD_INERTIA_SPRING = 110;
export const CAMERA_HEAD_INERTIA_DAMPING_RATIO = 1;
export const CAMERA_HEAD_INERTIA_DAMPING =
  2 * CAMERA_HEAD_INERTIA_DAMPING_RATIO * Math.sqrt(CAMERA_HEAD_INERTIA_SPRING);
/** Maximum smooth translation responses for the three local load axes. */
export const CAMERA_HEAD_INERTIA_LATERAL_MAX_METERS = 0.045;
export const CAMERA_HEAD_INERTIA_DEPTH_MAX_METERS = 0.032;
/**
 * Vertical head compression has to remain visibly measurable at the normal
 * jump delta-v (13.2 m/s stopped over one resolved frame), while still being
 * bounded by the support-plane proxy. This is a spring target envelope, not a
 * direct camera jump; a full jump reaches roughly 1 m at its peak after the
 * airborne spring state settles, and harder falls continue to grow smoothly
 * until the support proxy intervenes.
 */
export const CAMERA_HEAD_INERTIA_VERTICAL_MAX_METERS = 24;
/**
 * Keep normal ledge, jump, and severe-fall delta-v values distinct. The
 * horizontal reference remains tuned for locomotion; vertical impacts carry
 * much larger one-frame accelerations and need a wider continuous envelope
 * before the smooth saturation becomes visually flat.
 */
export const CAMERA_VERTICAL_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED = 700;
/** Smooth vertical load exponent: soft free-fall gravity, strong landing delta-v. */
export const CAMERA_VERTICAL_ACCELERATION_RESPONSE_EXPONENT = 2;
/** Radius of the presentation-only head proxy used for support contact. */
export const CAMERA_HEAD_PROXY_RADIUS_METERS = 0.12;
/** Softness of the continuous head/support penalty, in metres. */
export const CAMERA_HEAD_CONTACT_SOFTNESS_METERS = 0.008;
/** The contact penalty feeds the same spring without changing capsule physics. */
export const CAMERA_HEAD_CONTACT_STIFFNESS = CAMERA_HEAD_INERTIA_SPRING;
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
export const CAMERA_COVER_LEAN_OFFSET_METERS = 0.28;
/** Roll at full cover lean; the camera and viewmodel share this response. */
export const CAMERA_COVER_LEAN_ROLL_RADIANS = (8 * Math.PI) / 180;
export const CAMERA_COVER_LEAN_DAMPING = 14;

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
/** Fraction of the switch pose used while discarding or equipping a weapon. */
export const CAMERA_VIEWMODEL_SWITCH_LOWER_SCALE = 0.2;
/** Backward-compatible names for the shared head spring tuning. */
export const CAMERA_WEIGHT_SPRING = CAMERA_HEAD_INERTIA_SPRING;
export const CAMERA_WEIGHT_DAMPING = CAMERA_HEAD_INERTIA_DAMPING;
/** Converts acceleration into the smooth vertical head-load target. */
export const CAMERA_VERTICAL_ACCELERATION_WEIGHT_SCALE = CAMERA_HEAD_INERTIA_VERTICAL_MAX_METERS;
/** Fore/aft acceleration is the only inertial pitch source. */
export const CAMERA_WEIGHT_PITCH_MAX = CAMERA_ACCELERATION_PITCH_MAX;
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
 * Convert one local acceleration component into an opposite inertial load.
 * `tanh` keeps the response finite while remaining continuous and monotonic
 * for every measured delta-v; an optional positive exponent can soften small
 * loads without introducing a threshold or overload branch.
 */
export const resolveCameraInertialLoad = (
  acceleration: number,
  maximumResponse: number,
  accelerationScale = CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED,
  responseExponent = 1,
): number => {
  const safeAcceleration = Number.isFinite(acceleration) ? acceleration : 0;
  const scale =
    Number.isFinite(accelerationScale) && Math.abs(accelerationScale) > Number.EPSILON
      ? Math.abs(accelerationScale)
      : CAMERA_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED;
  const maximum = Number.isFinite(maximumResponse) ? Math.abs(maximumResponse) : 0;
  if (Math.abs(safeAcceleration) <= Number.EPSILON || maximum <= Number.EPSILON) {
    return 0;
  }
  const exponent =
    Number.isFinite(responseExponent) && responseExponent > Number.EPSILON ? responseExponent : 1;
  const normalized = Math.abs(Math.tanh(safeAcceleration / scale));
  return -Math.sign(safeAcceleration) * normalized ** exponent * maximum;
};

/**
 * Convert front/back acceleration into the bounded presentation response used
 * by the shared local-acceleration damper. Positive forward acceleration
 * pitches up; braking pitches down.
 */
export const resolveCameraAccelerationPitch = (forwardAcceleration: number): number => {
  return resolveCameraInertialLoad(forwardAcceleration, CAMERA_ACCELERATION_PITCH_MAX);
};

/**
 * Convert local rightward acceleration into the bounded inertial roll response
 * from the shared local-acceleration damper. The sign is inverted because the
 * player's body leans left when accelerating to the right.
 */
export const resolveCameraAccelerationRoll = (rightAcceleration: number): number => {
  return resolveCameraInertialLoad(rightAcceleration, CAMERA_ACCELERATION_ROLL_MAX);
};

const sanitizeCameraLocalAcceleration = (
  acceleration: CameraLocalAcceleration,
): CameraLocalAcceleration => ({
  right: Number.isFinite(acceleration.right) ? acceleration.right : 0,
  forward: Number.isFinite(acceleration.forward) ? acceleration.forward : 0,
  up: Number.isFinite(acceleration.up) ? acceleration.up : 0,
});

/**
 * Remove shared free-fall gravity from the relative head/body load.
 *
 * Gravity accelerates the capsule and the head together, so feeding the raw
 * airborne gravity step into the presentation spring makes the head appear to
 * launch upward before impact. The same is true of the commanded upward jump
 * delta: the camera already follows the resolved body pose, so treating that
 * launch as a second head impulse creates an artificial spring rebound. Keep
 * airborne relative load only for acceleration beyond shared free fall in the
 * downward direction. Support and leg acceleration remain intact: the grounded
 * path keeps the resolved delta unchanged, so the support stop still compresses
 * the head according to the actual landing delta-v.
 */
export const resolveCameraBodyRelativeAcceleration = (
  acceleration: CameraLocalAcceleration,
  grounded: boolean,
  gravity = WORLD_GRAVITY,
): CameraLocalAcceleration => {
  const safeAcceleration = sanitizeCameraLocalAcceleration(acceleration);
  const sharedGravity = Number.isFinite(gravity) ? gravity : WORLD_GRAVITY;
  const airborneRelativeUp = safeAcceleration.up + sharedGravity;
  return {
    right: safeAcceleration.right,
    forward: safeAcceleration.forward,
    up: grounded ? safeAcceleration.up : Math.min(0, airborneRelativeUp),
  };
};

interface CameraSpringState {
  position: number;
  velocity: number;
}

/**
 * Exact critically damped integration for one constant target over a frame.
 * The closed form makes a fixed physical spring independent of render rate,
 * while still allowing the target to change continuously every frame.
 */
const integrateCameraSpring = (
  state: CameraSpringState,
  target: number,
  deltaSeconds: number,
): CameraSpringState => {
  const delta = clamp(deltaSeconds, MIN_DELTA_SECONDS, MAX_DELTA_SECONDS);
  if (delta <= 0) {
    return state;
  }
  const angularFrequency = Math.sqrt(CAMERA_HEAD_INERTIA_SPRING);
  const error = state.position - target;
  const errorVelocity = state.velocity + angularFrequency * error;
  const decay = Math.exp(-angularFrequency * delta);
  const nextError = (error + errorVelocity * delta) * decay;
  return {
    position: target + nextError,
    velocity: (state.velocity - angularFrequency * errorVelocity * delta) * decay,
  };
};

const resolveSmoothLowerBound = (value: number, minimum: number, softness: number): number => {
  const safeValue = Number.isFinite(value) ? value : minimum;
  const safeMinimum = Number.isFinite(minimum) ? minimum : 0;
  const safeSoftness =
    Number.isFinite(softness) && softness > Number.EPSILON
      ? softness
      : CAMERA_HEAD_CONTACT_SOFTNESS_METERS;
  const normalized = (safeValue - safeMinimum) / safeSoftness;
  const softplus = normalized > 40 ? normalized : Math.log1p(Math.exp(normalized));
  return safeMinimum + safeSoftness * softplus;
};

export interface CameraHeadContactInput {
  readonly rawHeadOffset: number;
  readonly baseHeadY: number;
  readonly supportPlaneY: number;
  readonly headClearance: number;
  readonly softness?: number;
}

export interface CameraHeadContactResult {
  /** Minimum allowed presentation offset relative to the resolved head pose. */
  readonly minimumOffset: number;
  /** Smoothly constrained offset; it is always above the minimum. */
  readonly constrainedOffset: number;
  /** Positive correction applied by the support penalty. */
  readonly penaltyOffset: number;
}

/**
 * Resolve a continuous support penalty for the presentation-only head proxy.
 * Physics remains authoritative; this soft lower bound only keeps the camera
 * proxy from crossing the supplied support plane while preserving compression.
 */
export const resolveCameraHeadContact = (
  input: CameraHeadContactInput,
): CameraHeadContactResult => {
  const baseHeadY = Number.isFinite(input.baseHeadY) ? input.baseHeadY : 0;
  const supportPlaneY = Number.isFinite(input.supportPlaneY) ? input.supportPlaneY : 0;
  const headClearance = Number.isFinite(input.headClearance) ? Math.max(0, input.headClearance) : 0;
  const rawHeadOffset = Number.isFinite(input.rawHeadOffset) ? input.rawHeadOffset : 0;
  const minimumOffset = supportPlaneY + headClearance - baseHeadY;
  const constrainedOffset = resolveSmoothLowerBound(
    rawHeadOffset,
    minimumOffset,
    input.softness ?? CAMERA_HEAD_CONTACT_SOFTNESS_METERS,
  );
  return {
    minimumOffset,
    constrainedOffset,
    penaltyOffset: constrainedOffset - rawHeadOffset,
  };
};

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

/** Convert vertical acceleration into the opposite smooth head-load target. */
export const resolveCameraVerticalWeightResponse = (verticalAcceleration: number): number =>
  resolveCameraInertialLoad(
    verticalAcceleration,
    CAMERA_HEAD_INERTIA_VERTICAL_MAX_METERS,
    CAMERA_VERTICAL_ACCELERATION_REFERENCE_METERS_PER_SECOND_SQUARED,
    CAMERA_VERTICAL_ACCELERATION_RESPONSE_EXPONENT,
  );

/**
 * Retain an impulse helper for callers that reason in delta-v units. The
 * damper itself consumes the continuous target directly, so no one-frame
 * overload is introduced by this helper.
 */
export const resolveCameraVerticalWeightImpulse = (
  verticalAcceleration: number,
  deltaSeconds: number,
): number => {
  const delta = clamp(deltaSeconds, MIN_DELTA_SECONDS, MAX_DELTA_SECONDS);
  return resolveCameraVerticalWeightResponse(verticalAcceleration) * delta;
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
 * A held weapon rotates muzzle-down and lowers during a switch. The next
 * weapon starts at that switch pose, then rotates back up into the reticle.
 * Keeping the pose here makes the transition a centralized presentation
 * output instead of a second path in the weapon runtime.
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
    const amount = CAMERA_VIEWMODEL_SWITCH_LOWER_SCALE * easeInOutCubic(progress);
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
    const amount = CAMERA_VIEWMODEL_SWITCH_LOWER_SCALE * (1 - easeOutCubic(progress));
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
  coverLeanOffset: 0,
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
  let lateralSpring: CameraSpringState = { position: 0, velocity: 0 };
  let depthSpring: CameraSpringState = { position: 0, velocity: 0 };
  let verticalSpring: CameraSpringState = { position: 0, velocity: 0 };
  let rollSpring: CameraSpringState = { position: 0, velocity: 0 };
  let pitchSpring: CameraSpringState = { position: 0, velocity: 0 };
  let bobPhase = 0;
  let bobAmount = 0;
  let breathingPhase = 0;
  let aimSwayPhase = 0;
  let recoilYaw = 0;
  let recoilYawVelocity = 0;
  let recoilPitch = 0;
  let recoilPitchVelocity = 0;
  const pendingRecoilRecoveries: PendingRecoilRecovery[] = [];
  let crouchAmount = 0;
  let aimAmount = 0;
  let coverLeanAmount = 0;
  let viewmodelSwitchElapsed = 0;
  let viewmodelSwitchActive = false;
  let viewmodelSwitchHasOutgoingWeapon = true;
  let offsets = createDefaultOffsets();

  const clearAcceleration = (): void => {
    lateralSpring = { position: 0, velocity: 0 };
    depthSpring = { position: 0, velocity: 0 };
    verticalSpring = { position: 0, velocity: 0 };
    rollSpring = { position: 0, velocity: 0 };
    pitchSpring = { position: 0, velocity: 0 };
    offsets = {
      ...offsets,
      roll: 0,
      headBobLateral: 0,
      headBobDepth: 0,
      headBobPitch: 0,
      weightShift: 0,
      verticalOffset: offsets.headBob,
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
      verticalOffset: verticalSpring.position,
      aimSwayX: 0,
      aimSwayY: 0,
    };
  };

  const reset = (): void => {
    lateralSpring = { position: 0, velocity: 0 };
    depthSpring = { position: 0, velocity: 0 };
    verticalSpring = { position: 0, velocity: 0 };
    rollSpring = { position: 0, velocity: 0 };
    pitchSpring = { position: 0, velocity: 0 };
    bobPhase = 0;
    bobAmount = 0;
    breathingPhase = 0;
    aimSwayPhase = 0;
    recoilYaw = 0;
    recoilYawVelocity = 0;
    recoilPitch = 0;
    recoilPitchVelocity = 0;
    pendingRecoilRecoveries.length = 0;
    crouchAmount = 0;
    aimAmount = 0;
    coverLeanAmount = 0;
    viewmodelSwitchElapsed = 0;
    viewmodelSwitchActive = false;
    viewmodelSwitchHasOutgoingWeapon = true;
    offsets = createDefaultOffsets();
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
    const coverLeanRoll = coverLeanAmount * CAMERA_COVER_LEAN_ROLL_RADIANS;
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

    // Gait represents footfall, so it must not continue while the physics
    // capsule is airborne. Keep the damper stateful so the gait settles
    // smoothly when leaving the ground; jump/landing weight, breathing, and
    // aim sway remain independent.
    const gaitEnabled = input.bobEnabled && input.grounded !== false;
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

    // One continuous six-axis head/body inertia model. Every local component
    // receives the same second-order integration; only its signed load scale
    // differs. Horizontal debug shifting can be disabled, while vertical
    // weight and contact remain tied to the resolved physics delta.
    const rightAcceleration = input.shiftEnabled ? localAcceleration.right : 0;
    const forwardAcceleration = input.shiftEnabled ? localAcceleration.forward : 0;
    lateralSpring = integrateCameraSpring(
      lateralSpring,
      resolveCameraInertialLoad(rightAcceleration, CAMERA_HEAD_INERTIA_LATERAL_MAX_METERS),
      deltaSeconds,
    );
    depthSpring = integrateCameraSpring(
      depthSpring,
      resolveCameraInertialLoad(forwardAcceleration, CAMERA_HEAD_INERTIA_DEPTH_MAX_METERS),
      deltaSeconds,
    );
    rollSpring = integrateCameraSpring(
      rollSpring,
      resolveCameraAccelerationRoll(rightAcceleration),
      deltaSeconds,
    );
    pitchSpring = integrateCameraSpring(
      pitchSpring,
      resolveCameraAccelerationPitch(forwardAcceleration),
      deltaSeconds,
    );
    verticalSpring = integrateCameraSpring(
      verticalSpring,
      resolveCameraVerticalWeightResponse(localAcceleration.up),
      deltaSeconds,
    );

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

    const rawVerticalOffset = headBob + verticalSpring.position;
    const hasHeadContact =
      Number.isFinite(input.supportPlaneY) &&
      Number.isFinite(input.headClearance) &&
      Number.isFinite(input.baseHeadY);
    if (hasHeadContact) {
      const contact = resolveCameraHeadContact({
        rawHeadOffset: rawVerticalOffset,
        baseHeadY: input.baseHeadY ?? 0,
        supportPlaneY: input.supportPlaneY ?? 0,
        headClearance: input.headClearance ?? 0,
      });
      // Feed the smooth penalty back into the same spring velocity, then
      // retain the constrained position. The capsule is never moved by this
      // correction; it only keeps the rendered head proxy above support.
      verticalSpring.velocity +=
        contact.penaltyOffset * CAMERA_HEAD_CONTACT_STIFFNESS * deltaSeconds;
      verticalSpring.position = contact.constrainedOffset - headBob;
    }
    const weightShift = verticalSpring.position;
    const headBobPitch = clamp(
      pitchSpring.position,
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
    if (switchTransition.phase === "idle") {
      viewmodelSwitchActive = false;
    }

    offsets = {
      roll: rollSpring.position + coverLeanRoll,
      coverLeanOffset,
      headBob,
      headBobLateral: gait.headBobLateral + lateralSpring.position,
      headBobDepth: gait.headBobDepth + depthSpring.position,
      headBobPitch,
      weightShift,
      verticalOffset: headBob + weightShift,
      recoilYaw,
      recoilPitch,
      viewmodelOffset: resolveCameraViewmodelOffset(crouchAmount, aimAmount),
      viewmodelTransition: switchTransition,
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
    applyWeaponSwitchImpulse,
    clearAcceleration,
    clearBob,
    reset,
    getOffsets: () => offsets,
  };
};
