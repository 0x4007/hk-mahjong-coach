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
export const MELEE_REFERENCE_DAMAGE = 100;
export const MELEE_MIN_DAMAGE = 6;
export const MELEE_MAX_DAMAGE = 400;
/** Approximate shoulder-to-hand reach for a 1.85 m adult player. */
export const MELEE_MIN_RANGE_METERS = 0.8;
export const MELEE_SWING_ARC_RADIANS = 2.2;
export const MELEE_SWING_RECOVERY_SECONDS = 0.08;
const MELEE_DAMAGE_VOLUME_EXPONENT = 0.85;

export interface MeleeSwingResolution {
  readonly volumeM3: number;
  readonly swingSpeedRadiansPerSecond: number;
  readonly damage: number;
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

export const createEmptyMeleeStateSnapshot = (): MeleeStateSnapshot => ({
  active: null,
  nearby: null,
  swinging: false,
  swings: 0,
  hits: 0,
  lastDamage: 0,
  lastOxygenCost: 0,
});
