import {
  PLAYER_JUMP_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
} from "./world-scale.js";

/**
 * Deterministic melee tuning for objects that can be picked up from the
 * ragdoll/knockable world.
 *
 * Volume is used as a stable mass proxy. The scene supplies the physical
 * volume of the object's collider, while this module owns the gameplay
 * relationship: small objects complete a swing sooner, and large objects
 * deliver more damage.
 */

export const MELEE_FORMULA_VERSION = "v1" as const;

/** The reference object is a 0.12 m³ hand-held prop. */
export const MELEE_REFERENCE_VOLUME_M3 = 0.12;
export const MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND = 4;
export const MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND = 1.5;
export const MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND = 9;
/** Reference launch speed for a 0.12 m³ hand-held prop. */
export const MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND = 22;
export const MELEE_MIN_THROW_SPEED_METERS_PER_SECOND = 12;
export const MELEE_MAX_THROW_SPEED_METERS_PER_SECOND = 34;
export const MELEE_REFERENCE_DAMAGE = 100;
export const MELEE_MIN_DAMAGE = 6;
export const MELEE_MAX_DAMAGE = 400;
/** Approximate shoulder-to-hand reach for a 1.85 m adult player. */
export const MELEE_MIN_RANGE_METERS = 0.8;
export const MELEE_SWING_ARC_RADIANS = 2.2;
export const MELEE_SWING_RECOVERY_SECONDS = 0.08;
/** Time without melee activity before the prop returns to its right-ready pose. */
export const MELEE_IDLE_RESET_DELAY_SECONDS = 5;
/** The reset is deliberately slower than a swing so the resting pose changes calmly. */
export const MELEE_IDLE_RESET_DURATION_SECONDS = 0.9;
const MELEE_DAMAGE_VOLUME_EXPONENT = 0.85;

/** Full sprint and full-jump speeds are the reference points for impact load. */
export const MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND =
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND;
export const MELEE_FALLING_REFERENCE_SPEED_METERS_PER_SECOND = PLAYER_JUMP_SPEED_METERS_PER_SECOND;
/** Keep a moving hit meaningful without turning every sprint into a one-shot. */
export const MELEE_MOMENTUM_DAMAGE_PER_REFERENCE = 0.6;
export const MELEE_FALLING_DAMAGE_PER_REFERENCE = 0.45;
export const MELEE_MAX_MOMENTUM_MULTIPLIER = 2.5;
/** Melee carries more stopping force than a single projectile of equal damage. */
export const MELEE_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE = 0.12;
/** Keep even oversized generated props within a readable, bounded impulse. */
export const MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND = 18;

export interface MeleeMomentumVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MeleeMomentumInput {
  readonly baseDamage: number;
  /** Direction from the attacker to the contacted target. */
  readonly attackDirection: MeleeMomentumVector;
  readonly attackerVelocity: MeleeMomentumVector;
  readonly targetVelocity?: MeleeMomentumVector;
  /** Downward velocity contributes only while the attacker is airborne. */
  readonly attackerAirborne?: boolean;
}

export interface MeleeHitContext {
  /** World-space impact point for hit effects and diagnostics. */
  readonly point: MeleeMomentumVector;
  readonly attackDirection: MeleeMomentumVector;
  readonly attackerVelocity: MeleeMomentumVector;
  readonly attackerAirborne: boolean;
}

export interface MeleeMomentumResolution {
  readonly baseDamage: number;
  readonly closingSpeedMetersPerSecond: number;
  readonly fallingSpeedMetersPerSecond: number;
  readonly multiplier: number;
  readonly damage: number;
}

export interface MeleeSwingResolution {
  readonly volumeM3: number;
  readonly swingSpeedRadiansPerSecond: number;
  readonly damage: number;
  readonly stoppingPower: number;
  readonly oxygenCost: number;
  readonly swingDurationSeconds: number;
}

export interface MeleeSwingPose {
  readonly pitchRadians: number;
  readonly yawRadians: number;
  readonly rollRadians: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly offsetZ: number;
}

export type MeleeSwingDirection = "right-to-left" | "left-to-right";

export interface MeleeObjectSnapshot {
  readonly objectId: number;
  readonly displayName: string;
  readonly volumeM3: number;
  readonly rangeMeters: number;
  readonly swingSpeedRadiansPerSecond: number;
  readonly damage: number;
  readonly stoppingPower: number;
  readonly oxygenCost: number;
}

export interface NearbyMeleePickupSnapshot extends MeleeObjectSnapshot {
  readonly distanceMeters: number;
}

export interface MeleeStateSnapshot {
  readonly active: MeleeObjectSnapshot | null;
  readonly nearby: NearbyMeleePickupSnapshot | null;
  readonly swinging: boolean;
  readonly swings: number;
  readonly hits: number;
  readonly lastDamage: number;
  readonly lastOxygenCost: number;
}

/**
 * Return whether the calm post-swing timer may advance this frame.
 * Locomotion is intentionally absent: walking with the prop drawn does not
 * count as melee activity and must not prevent the idle reset.
 */
export const shouldAdvanceMeleeIdleReset = ({
  drawn,
  active,
  controlsActive,
  swinging,
  fireHeld,
  viewmodelTransitionIdle,
}: {
  readonly drawn: boolean;
  readonly active: boolean;
  readonly controlsActive: boolean;
  readonly swinging: boolean;
  readonly fireHeld: boolean;
  readonly viewmodelTransitionIdle: boolean;
}): boolean =>
  drawn && active && controlsActive && !swinging && !fireHeld && viewmodelTransitionIdle;

/** Object attributes used by the deterministic procedural melee sound mix. */
export interface MeleeAudioParameters {
  readonly volumeM3: number;
  readonly rangeMeters: number;
  readonly swingSpeedRadiansPerSecond: number;
  readonly damage: number;
}

/** Two-layer sound controls for one melee object: air movement and impact. */
export interface MeleeAudioProfile {
  /** White-noise playback rate for the swing turbulence. */
  readonly swingNoisePlaybackRate: number;
  readonly swingNoiseGain: number;
  readonly swingNoiseCenterFrequencyHz: number;
  readonly swingNoiseQ: number;
  readonly swingToneFrequencyHz: number;
  readonly swingToneGain: number;
  readonly swingDurationSeconds: number;
  /** White-noise playback rate for the impact body. */
  readonly impactNoisePlaybackRate: number;
  readonly impactNoiseGain: number;
  readonly impactNoiseCutoffFrequencyHz: number;
  readonly impactDurationSeconds: number;
  readonly impactToneFrequencyHz: number;
  readonly impactToneGain: number;
}

const MELEE_AUDIO_MAX_REACH_METERS = 4;
const MELEE_AUDIO_MAX_IMPACT_PITCH = 1.06;
const MELEE_AUDIO_ENVELOPE_FLOOR_GAIN = 0.0001;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Resolve a finite, deterministic sound profile from the held object's
 * physical attributes. Small, quick props make a brighter shorter woosh;
 * larger, higher-damage props make a lower, longer bang.
 */
export const resolveMeleeAudioProfile = ({
  volumeM3,
  rangeMeters,
  swingSpeedRadiansPerSecond,
  damage,
}: MeleeAudioParameters): MeleeAudioProfile => {
  const safeVolume = normalizeVolume(volumeM3);
  const sizeRatio = clamp01((Math.log2(safeVolume / MELEE_REFERENCE_VOLUME_M3) + 2) / 4);
  const safeRange = Number.isFinite(rangeMeters)
    ? Math.max(MELEE_MIN_RANGE_METERS, rangeMeters)
    : 0;
  const reachRatio = clamp01(
    (safeRange - MELEE_MIN_RANGE_METERS) / (MELEE_AUDIO_MAX_REACH_METERS - MELEE_MIN_RANGE_METERS),
  );
  const safeSpeed = Number.isFinite(swingSpeedRadiansPerSecond)
    ? Math.max(MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND, swingSpeedRadiansPerSecond)
    : MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND;
  const speedRatio = clamp01(
    (safeSpeed - MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND) /
      (MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND - MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND),
  );
  const safeDamage = Number.isFinite(damage)
    ? Math.max(MELEE_MIN_DAMAGE, damage)
    : MELEE_MIN_DAMAGE;
  const damageRatio = clamp01(
    (safeDamage - MELEE_MIN_DAMAGE) / (MELEE_MAX_DAMAGE - MELEE_MIN_DAMAGE),
  );
  const quickness = clamp01(speedRatio * 0.7 + (1 - sizeRatio) * 0.3);
  const heft = clamp01(damageRatio * 0.7 + sizeRatio * 0.3);
  return {
    swingNoisePlaybackRate: 0.72 + quickness * 0.66,
    swingNoiseGain: 0.16 + quickness * 0.34 + reachRatio * 0.08,
    swingNoiseCenterFrequencyHz: 620 + quickness * 1_760 + reachRatio * 260,
    swingNoiseQ: 1.1 + quickness * 2.2,
    swingToneFrequencyHz: 130 + quickness * 220 + (1 - sizeRatio) * 70,
    swingToneGain: 0.018 + quickness * 0.052,
    swingDurationSeconds: 0.16 + (1 - quickness) * 0.15 + reachRatio * 0.07,
    impactNoisePlaybackRate: MELEE_AUDIO_MAX_IMPACT_PITCH - heft * 0.36,
    impactNoiseGain: 0.3 + heft * 0.58,
    impactNoiseCutoffFrequencyHz: 1_200 + (1 - heft) * 2_400,
    impactDurationSeconds: 0.07 + heft * 0.12 + reachRatio * 0.025,
    impactToneFrequencyHz: 95 + (1 - heft) * 260,
    impactToneGain: 0.05 + heft * 0.18,
  };
};

/**
 * Resolve the symmetric exponential gain curve used while a prop is moving.
 * Progress 0.5 is the swing apex; progress 0 and 1 share the same quiet floor.
 */
export const resolveMeleeSwingEnvelopeGain = (progress: number, peakGain: number): number => {
  const safeProgress = clamp01(Number.isFinite(progress) ? progress : 0);
  const safePeakGain = Number.isFinite(peakGain)
    ? Math.max(MELEE_AUDIO_ENVELOPE_FLOOR_GAIN, peakGain)
    : MELEE_AUDIO_ENVELOPE_FLOOR_GAIN;
  const distanceFromApex = Math.abs(safeProgress * 2 - 1);
  return Math.max(
    MELEE_AUDIO_ENVELOPE_FLOOR_GAIN,
    safePeakGain * MELEE_AUDIO_ENVELOPE_FLOOR_GAIN ** distanceFromApex,
  );
};

const normalizeVolume = (volumeM3: number): number =>
  Number.isFinite(volumeM3) ? Math.max(0.0001, volumeM3) : 0.0001;

export interface MeleeObjectHalfExtents {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const normalizeDimension = (dimension: number): number =>
  Number.isFinite(dimension) ? Math.max(0, dimension) : 0;

/** Return the full length of the object's longest collider axis. */
export const resolveMeleeLongestSizeMeters = (halfExtents: MeleeObjectHalfExtents): number =>
  2 *
  Math.max(
    normalizeDimension(halfExtents.x),
    normalizeDimension(halfExtents.y),
    normalizeDimension(halfExtents.z),
  );

/** Keep tiny objects within arm's reach while letting long objects set their reach. */
export const resolveMeleeRangeMeters = (longestObjectSizeMeters: number): number =>
  Math.max(
    MELEE_MIN_RANGE_METERS,
    Number.isFinite(longestObjectSizeMeters) ? Math.max(0, longestObjectSizeMeters) : 0,
  );

/** Resolve the inverse volume-to-swing-speed relationship. */
export const resolveMeleeSwingSpeed = (volumeM3: number): number => {
  const normalizedVolume = normalizeVolume(volumeM3);
  return Math.min(
    MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND,
    Math.max(
      MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND,
      MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND *
        Math.sqrt(MELEE_REFERENCE_VOLUME_M3 / normalizedVolume),
    ),
  );
};

/** Resolve a volume-weighted launch speed for a thrown melee prop. */
export const resolveMeleeThrowSpeed = (volumeM3: number): number => {
  const normalizedVolume = normalizeVolume(volumeM3);
  return Math.min(
    MELEE_MAX_THROW_SPEED_METERS_PER_SECOND,
    Math.max(
      MELEE_MIN_THROW_SPEED_METERS_PER_SECOND,
      MELEE_REFERENCE_THROW_SPEED_METERS_PER_SECOND *
        Math.sqrt(MELEE_REFERENCE_VOLUME_M3 / normalizedVolume),
    ),
  );
};

/** Resolve impact damage from the object's collider volume. */
export const resolveMeleeDamage = (volumeM3: number): number => {
  const normalizedVolume = normalizeVolume(volumeM3);
  return Math.min(
    MELEE_MAX_DAMAGE,
    Math.max(
      MELEE_MIN_DAMAGE,
      MELEE_REFERENCE_DAMAGE *
        (normalizedVolume / MELEE_REFERENCE_VOLUME_M3) ** MELEE_DAMAGE_VOLUME_EXPONENT,
    ),
  );
};

/**
 * Resolve the direct velocity impulse carried by a melee contact.
 *
 * A hand-held prop should interrupt a charge more decisively than a single
 * projectile. The value is derived from the same resolved object damage,
 * remains finite for malformed inputs, and is capped so generated props cannot
 * launch a target out of the playable world.
 */
export const resolveMeleeStoppingPower = (damage: number): number => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  return Math.min(
    MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND,
    safeDamage * MELEE_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE,
  );
};

const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

const normalizeMomentumVector = (vector: MeleeMomentumVector): MeleeMomentumVector => ({
  x: finiteOrZero(vector.x),
  y: finiteOrZero(vector.y),
  z: finiteOrZero(vector.z),
});

const normalizeMomentumDirection = (vector: MeleeMomentumVector): MeleeMomentumVector | null => {
  const safeVector = normalizeMomentumVector(vector);
  const length = Math.hypot(safeVector.x, safeVector.y, safeVector.z);
  if (length <= Number.EPSILON) {
    return null;
  }
  return {
    x: safeVector.x / length,
    y: safeVector.y / length,
    z: safeVector.z / length,
  };
};

/**
 * Resolve the extra damage caused by a moving attacker and a closing target.
 *
 * Closing speed is the relative velocity projected onto the attack ray, so a
 * target running toward the player adds load while one fleeing in the same
 * direction reduces it to the base hit. A downward airborne velocity is an
 * additional bounded impact term for falling strikes. The resolver is pure so
 * the scene can use the same deterministic result for every combat actor.
 */
export const resolveMeleeDamageWithMomentum = ({
  baseDamage,
  attackDirection,
  attackerVelocity,
  targetVelocity = { x: 0, y: 0, z: 0 },
  attackerAirborne = false,
}: MeleeMomentumInput): MeleeMomentumResolution => {
  const safeBaseDamage = Number.isFinite(baseDamage)
    ? Math.max(MELEE_MIN_DAMAGE, baseDamage)
    : MELEE_MIN_DAMAGE;
  const direction = normalizeMomentumDirection(attackDirection);
  const attacker = normalizeMomentumVector(attackerVelocity);
  const target = normalizeMomentumVector(targetVelocity);
  const relativeVelocity = {
    x: attacker.x - target.x,
    y: attacker.y - target.y,
    z: attacker.z - target.z,
  };
  const closingSpeedMetersPerSecond =
    direction === null
      ? 0
      : Math.max(
          0,
          relativeVelocity.x * direction.x +
            relativeVelocity.y * direction.y +
            relativeVelocity.z * direction.z,
        );
  const fallingSpeedMetersPerSecond = attackerAirborne ? Math.max(0, -attacker.y) : 0;
  const closingRatio = Math.min(
    2,
    closingSpeedMetersPerSecond / MELEE_MOMENTUM_REFERENCE_SPEED_METERS_PER_SECOND,
  );
  const fallingRatio = Math.min(
    1,
    fallingSpeedMetersPerSecond / MELEE_FALLING_REFERENCE_SPEED_METERS_PER_SECOND,
  );
  const multiplier = Math.min(
    MELEE_MAX_MOMENTUM_MULTIPLIER,
    1 +
      closingRatio * MELEE_MOMENTUM_DAMAGE_PER_REFERENCE +
      fallingRatio * MELEE_FALLING_DAMAGE_PER_REFERENCE,
  );
  return {
    baseDamage: safeBaseDamage,
    closingSpeedMetersPerSecond,
    fallingSpeedMetersPerSecond,
    multiplier,
    damage: safeBaseDamage * multiplier,
  };
};

/** O₂ uses the same quarter-of-damage fatigue rule as one gun projectile. */
export const resolveMeleeO2Cost = (damage: number): number =>
  Number.isFinite(damage) ? Math.max(0, damage) * 0.25 : 0;

export const resolveMeleeSwing = (volumeM3: number): MeleeSwingResolution => {
  const normalizedVolume = normalizeVolume(volumeM3);
  const swingSpeedRadiansPerSecond = resolveMeleeSwingSpeed(normalizedVolume);
  const damage = resolveMeleeDamage(normalizedVolume);
  return {
    volumeM3: normalizedVolume,
    swingSpeedRadiansPerSecond,
    damage,
    stoppingPower: resolveMeleeStoppingPower(damage),
    oxygenCost: resolveMeleeO2Cost(damage),
    swingDurationSeconds:
      MELEE_SWING_ARC_RADIANS / swingSpeedRadiansPerSecond + MELEE_SWING_RECOVERY_SECONDS,
  };
};

/**
 * Shared first-person swing pose. The object remains on the camera child and
 * this pose is composed with the centralized camera-damper viewmodel offset.
 * Each swing starts in a high side-ready baseball-bat stance, winds farther
 * back, drives the bat outward across the reticule, and recovers high on the
 * opposite side. The runtime alternates the direction per swing.
 */
export const resolveMeleeSwingPose = (
  progress: number,
  direction: MeleeSwingDirection = "right-to-left",
): MeleeSwingPose => {
  const safeProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const directionSign = direction === "right-to-left" ? 1 : -1;
  const windupProgress = Math.min(1, Math.max(0, safeProgress / 0.22));
  const strikeProgress = Math.min(1, Math.max(0, (safeProgress - 0.22) / 0.44));
  const recoveryProgress = Math.min(1, Math.max(0, (safeProgress - 0.66) / 0.34));
  const smoothStep = (value: number): number => value * value * (3 - 2 * value);
  const windup = smoothStep(windupProgress);
  const strike = smoothStep(strikeProgress);
  const recovery = smoothStep(recoveryProgress);
  const strikeArc = safeProgress >= 0.22 && safeProgress <= 0.66 ? Math.sin(strike * Math.PI) : 0;
  // The held prop's longest source axis is upright (+Y). Negative roll puts
  // the right-side barrel high/right; positive roll mirrors that on the left.
  // These values keep the bat raised instead of looking like a katana held
  // down at rest.
  const rightReadyRoll = -0.45;
  const leftReadyRoll = 0.45;
  const startRoll = directionSign > 0 ? rightReadyRoll : leftReadyRoll;
  const windupRoll = startRoll - directionSign * 0.32;
  const endRoll = directionSign > 0 ? leftReadyRoll : rightReadyRoll;
  // Let the strike pass through a nearly horizontal barrel before the
  // recovery lifts it into the mirrored ready pose. That is the long way a
  // baseball bat travels, rather than a short rotation around a standing
  // pole's vertical axis.
  const strikeEndRoll = endRoll + directionSign * 1.1;
  const windupYaw = directionSign * 0.16;
  const outwardYaw = directionSign * 0.32;
  const horizontalOffset =
    safeProgress < 0.22
      ? 0.24 * directionSign + 0.14 * directionSign * windup
      : safeProgress < 0.66
        ? 0.38 * directionSign * (1 - strike) - 0.42 * directionSign * strike
        : -0.42 * directionSign * (1 - recovery) - 0.24 * directionSign * recovery;
  const roll =
    safeProgress < 0.22
      ? startRoll + (windupRoll - startRoll) * windup
      : safeProgress < 0.66
        ? windupRoll + (strikeEndRoll - windupRoll) * strike
        : strikeEndRoll + (endRoll - strikeEndRoll) * recovery;
  const yaw =
    safeProgress < 0.22
      ? windupYaw * windup
      : safeProgress < 0.66
        ? windupYaw + (outwardYaw - windupYaw) * strike
        : outwardYaw * (1 - recovery);
  const offsetY =
    safeProgress < 0.22
      ? 0.04 + 0.06 * windup
      : safeProgress < 0.66
        ? 0.1 - 0.15 * strike
        : -0.05 + 0.09 * recovery;
  const offsetZ =
    safeProgress < 0.22
      ? 0.08 * windup
      : safeProgress < 0.66
        ? 0.08 - 0.32 * strike
        : -0.24 + 0.24 * recovery;
  const readyPose = safeProgress === 0 || safeProgress === 1;
  const readyRoll = safeProgress === 0 ? startRoll : endRoll;
  return {
    // Tip the barrel away from the player during contact, then return it
    // upright during the follow-through recovery.
    pitchRadians: -0.95 * strikeArc,
    yawRadians: readyPose ? 0 : yaw,
    rollRadians: readyPose ? readyRoll : roll,
    offsetX: horizontalOffset,
    offsetY: readyPose ? 0.04 : offsetY,
    offsetZ,
  };
};

const resolveMeleeReadyPoseBlend = (progress: number): number => {
  const safeProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return safeProgress * safeProgress * (3 - 2 * safeProgress);
};

/**
 * Resolve the normalized progress of the calm post-swing reset. The delay is
 * flat so a player can pause briefly after a swing without the prop drifting;
 * only the following eased interval moves it back to the right.
 */
export const resolveMeleeIdleResetProgress = (idleSeconds: number): number => {
  const safeIdleSeconds = Number.isFinite(idleSeconds) ? Math.max(0, idleSeconds) : 0;
  return resolveMeleeReadyPoseBlend(
    (safeIdleSeconds - MELEE_IDLE_RESET_DELAY_SECONDS) / MELEE_IDLE_RESET_DURATION_SECONDS,
  );
};

/**
 * Blend the left-ready pose back to the default right-ready pose. This stays
 * on the camera-child viewmodel and is composed with the shared camera damper
 * output by the scene runtime.
 */
export const resolveMeleeIdleResetPose = (progress: number): MeleeSwingPose => {
  const amount = resolveMeleeReadyPoseBlend(progress);
  const leftReady = resolveMeleeSwingPose(0, "left-to-right");
  const rightReady = resolveMeleeSwingPose(0, "right-to-left");
  if (amount === 0) {
    return leftReady;
  }
  if (amount === 1) {
    return rightReady;
  }
  const blend = (from: number, to: number): number => from + (to - from) * amount;
  return {
    pitchRadians: blend(leftReady.pitchRadians, rightReady.pitchRadians),
    yawRadians: blend(leftReady.yawRadians, rightReady.yawRadians),
    rollRadians: blend(leftReady.rollRadians, rightReady.rollRadians),
    offsetX: blend(leftReady.offsetX, rightReady.offsetX),
    offsetY: blend(leftReady.offsetY, rightReady.offsetY),
    offsetZ: blend(leftReady.offsetZ, rightReady.offsetZ),
  };
};

export const createEmptyMeleeStateSnapshot = (): MeleeStateSnapshot => ({
  active: null,
  nearby: null,
  swinging: false,
  swings: 0,
  hits: 0,
  lastDamage: 0,
  lastOxygenCost: 0,
});
