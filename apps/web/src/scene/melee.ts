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
export const MELEE_REFERENCE_SWING_SPEED_RADIANS_PER_SECOND = 8;
export const MELEE_MIN_SWING_SPEED_RADIANS_PER_SECOND = 3;
export const MELEE_MAX_SWING_SPEED_RADIANS_PER_SECOND = 18;
export const MELEE_REFERENCE_DAMAGE = 24;
export const MELEE_MIN_DAMAGE = 6;
export const MELEE_MAX_DAMAGE = 96;
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

export interface MeleeObjectSnapshot {
  readonly objectId: number;
  readonly displayName: string;
  readonly volumeM3: number;
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
 */
export const resolveMeleeSwingPose = (progress: number): MeleeSwingPose => {
  const safeProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const eased = safeProgress * safeProgress * (3 - 2 * safeProgress);
  const returnAmount = Math.sin(eased * Math.PI);
  return {
    pitchRadians: -0.42 * returnAmount,
    yawRadians: 0.55 * returnAmount,
    rollRadians: -0.72 * returnAmount,
    offsetX: 0.18 * returnAmount,
    offsetY: -0.08 * returnAmount,
    offsetZ: 0.3 * returnAmount,
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

