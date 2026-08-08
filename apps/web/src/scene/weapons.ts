import { createSeededRandom } from "@hk-mahjong/core/public";

export const WEAPON_IDS = [
  "pistol",
  "shotgun",
  "machineGun",
  "sniper",
  "carbine",
  "submachineGun",
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** Trigger presentation derived from the primitive burst size. */
export type WeaponFireMode = "automatic" | "burst";

/** The two reload mechanisms used by the visual weapon prototype. */
export type WeaponReloadMode = "clip" | "round";

/** One second of reload time for every 100 damage represented by the reload. */
export const WEAPON_RELOAD_SECONDS_PER_DAMAGE = 0.01;

/** A high-damage trigger pull is reloaded one bullet or shell at a time. */
export const WEAPON_ROUND_RELOAD_DAMAGE_THRESHOLD = 100;

/** Linear per-projectile stopping power derived from the damage payload. */
export const WEAPON_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE = 0.065;
/** Prevent malformed or future high-damage profiles from creating unbounded throws. */
export const WEAPON_STOPPING_POWER_MAX_METERS_PER_SECOND = 8;

/**
 * Resolve the impact velocity contributed by one projectile.
 *
 * This is deliberately per bullet, not per trigger pull: a shotgun's eight
 * pellets each submit their own stopping-power impulse and therefore add up
 * when they strike the same target or ragdoll object.
 */
export const resolveWeaponStoppingPower = (damage: number): number => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  return Math.min(
    WEAPON_STOPPING_POWER_MAX_METERS_PER_SECOND,
    safeDamage * WEAPON_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE,
  );
};

/** Resolve a number-row weapon key; `Digit0` is the explicit empty-hand slot. */
export const resolveWeaponHotkey = (code: string): WeaponId | null | undefined => {
  if (code === "Digit0") {
    return null;
  }
  if (!/^Digit[1-9]$/u.test(code)) {
    return undefined;
  }
  const index = Number(code.slice(-1)) - 1;
  return WEAPON_IDS[index];
};

/** Presentation lifetimes for the deterministic shot effects. */
export const WEAPON_TRACER_LIFETIME_SECONDS = 0.14;
export const WEAPON_IMPACT_LIFETIME_SECONDS = 0.18;
/** Shield hits flash briefly at the actor before the shield absorbs the shot. */
export const WEAPON_SHIELD_SPARK_LIFETIME_SECONDS = 0.22;
export const WEAPON_SHIELD_SPARK_COLOR = 0x9df7ff;
export const WEAPON_SHIELD_SPARK_OPACITY = 0.92;
/** Gunshot gas clears quickly instead of accumulating during rapid fire. */
export const WEAPON_MUZZLE_SMOKE_LIFETIME_SECONDS = 1;
/** Keep one compact two-particle puff for each visible round. */
export const WEAPON_MUZZLE_SMOKE_PARTICLE_COUNT = 2;
/** Logarithmic gas expansion reaches its full scale at the end of the puff. */
export const WEAPON_MUZZLE_SMOKE_LOG_STRENGTH = 24;
/** The visible muzzle flash and its point-light pulse share one short lifetime. */
export const WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS = 0.055;
/** Full-energy point light mounted at the muzzle of held weapon models. */
export const WEAPON_MUZZLE_FLASH_LIGHT_INTENSITY = 32;
/** Keep the brief muzzle pulse local to the nearby room geometry. */
export const WEAPON_MUZZLE_FLASH_LIGHT_DISTANCE = 7.5;
/** Use physically plausible inverse-square attenuation for the flash. */
export const WEAPON_MUZZLE_FLASH_LIGHT_DECAY = 2;
export const WEAPON_BULLET_HOLE_LIFETIME_SECONDS = 5 * 60;
export const WEAPON_BULLET_HOLE_FADE_SECONDS = 12;
/** Keep sustained automatic fire from accumulating unbounded scene objects. */
export const WEAPON_BULLET_HOLE_MAX_COUNT = 256;
/** Blood bursts are independent world particles, not decals attached to actors. */
export const WEAPON_BLOOD_CLOUD_LIFETIME_SECONDS = 0.72;
/** Blood stains persist long enough to read during a running engagement. */
export const WEAPON_BLOOD_DECAL_LIFETIME_SECONDS = 180;
export const WEAPON_BLOOD_DECAL_FADE_SECONDS = 18;
export const WEAPON_BLOOD_DECAL_MAX_COUNT = 128;
export const WEAPON_BLOOD_CLOUD_MIN_DAMAGE = 9;
export const WEAPON_BLOOD_CLOUD_MAX_DAMAGE = 100;
export const WEAPON_BLOOD_CLOUD_MIN_SCALE = 0.72;
export const WEAPON_BLOOD_CLOUD_MAX_SCALE = 2.35;
/** Keep each projectile's actor response to one readable sphere. */
export const WEAPON_BLOOD_CLOUD_PARTICLE_COUNT = 1;
export const WEAPON_BLOOD_CLOUD_OPACITY = 0.34;
export const WEAPON_BLOOD_CLOUD_COLOR = 0x4b0610;
export const WEAPON_BLOOD_SPLAT_OPACITY = 0.42;
export const WEAPON_BLOOD_SPLAT_COLOR = 0x680812;
export const WEAPON_BLOOD_SMEAR_START_SPEED_METERS_PER_SECOND = 0.75;
export const WEAPON_BLOOD_SMEAR_FULL_SPEED_METERS_PER_SECOND = 3.2;

/** Fixed sound sources supported by the procedural shot-audio path. */
export type WeaponShotSoundWaveform = OscillatorType | "whiteNoise";
/** One deliberately static white-noise timbre for every trigger pull. */
export const WEAPON_SHOT_SOUND_WAVEFORM: WeaponShotSoundWaveform = "whiteNoise";
/** Distance at which a weapon sound is heard at full proximity gain. */
export const WEAPON_AUDIO_REFERENCE_DISTANCE_METERS = 1;
/** Distance at which a weapon sound fades out completely. */
export const WEAPON_AUDIO_MAX_DISTANCE_METERS = 32;
/** Inverse-distance rolloff used by the Web Audio spatializer. */
export const WEAPON_AUDIO_ROLLOFF_FACTOR = 0.65;

/**
 * Resolve the distance envelope shared by every weapon sound layer.
 *
 * The spatializer supplies directional placement and inverse-distance rolloff;
 * this bounded envelope guarantees that the fallback gain path is still quiet
 * at the edge of the audible weapon range.
 */
export const resolveWeaponAudioProximity = (distanceMeters: number): number => {
  if (!Number.isFinite(distanceMeters)) {
    return 0;
  }
  const safeDistance = Math.max(0, distanceMeters);
  if (safeDistance >= WEAPON_AUDIO_MAX_DISTANCE_METERS) {
    return 0;
  }
  const remainingRange = 1 - safeDistance / WEAPON_AUDIO_MAX_DISTANCE_METERS;
  return remainingRange * remainingRange;
};

export interface GunAudioParameters {
  readonly damage: number;
  readonly barrelLength: number;
}

export interface GunAudioProfile {
  readonly damagePitch: number;
  readonly damageVolume: number;
  readonly muzzleCutoffFrequencyHz: number;
  readonly crackVolume: number;
  readonly tailDurationSeconds: number;
  readonly tailVolume: number;
  readonly tailCutoffFrequencyHz: number;
  /** Projectile velocity used to schedule the pass-by arrival. */
  readonly bulletSpeedMetersPerSecond: number;
}

/** Inputs for the procedural sound emitted when a bullet reaches a surface. */
export interface BulletImpactAudioParameters {
  /** Projectile damage is the continuous bullet-strength input. */
  readonly damage: number;
  /** Acute incidence angle: 0 is head-on and π/2 is a grazing hit. */
  readonly impactAngleRadians: number;
}

/** Procedural controls for a bullet impact body, resonance, and grazing glint. */
export interface BulletImpactAudioProfile {
  /** Compressed low-pass body for the material strike. */
  readonly impactNoisePlaybackRate: number;
  readonly impactNoiseGain: number;
  readonly impactNoiseCutoffFrequencyHz: number;
  readonly impactNoiseQ: number;
  readonly impactDurationSeconds: number;
  /** Decaying triangle resonance for the impact body. */
  readonly impactToneFrequencyHz: number;
  readonly impactToneGain: number;
  readonly impactToneEndFrequencyHz: number;
  /** High-frequency scrape layer that grows as the hit becomes more grazing. */
  readonly glancingNoisePlaybackRate: number;
  readonly glancingNoiseGain: number;
  readonly glancingNoiseCenterFrequencyHz: number;
  readonly glancingNoiseQ: number;
  readonly glancingDurationSeconds: number;
}

/** Damage bounds used by the continuous procedural gunshot curve. */
export const GUN_AUDIO_MIN_DAMAGE = 12;
export const GUN_AUDIO_MAX_DAMAGE = 100;
/** Barrel bounds used by the continuous resonance curve. */
export const GUN_AUDIO_MIN_BARREL_LENGTH_METERS = 0.34;
export const GUN_AUDIO_MAX_BARREL_LENGTH_METERS = 1.35;
/** Projectile speed bounds for the continuous damage/barrel model. */
export const GUN_AUDIO_MIN_BULLET_SPEED_METERS_PER_SECOND = 280;
export const GUN_AUDIO_MAX_BULLET_SPEED_METERS_PER_SECOND = 900;
const GUN_AUDIO_BULLET_SPEED_DAMAGE_WEIGHT = 0.72;
const GUN_AUDIO_BULLET_SPEED_BARREL_WEIGHT = 0.28;

/** A grazing hit is at most a right angle from the struck surface normal. */
export const BULLET_IMPACT_AUDIO_MAX_ANGLE_RADIANS = Math.PI / 2;
/** Strength bounds cover the weakest and strongest fixed-roster projectiles. */
export const BULLET_IMPACT_AUDIO_MIN_DAMAGE = 9;
export const BULLET_IMPACT_AUDIO_MAX_DAMAGE = GUN_AUDIO_MAX_DAMAGE;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Resolve a readable, monotonic blood-burst size from projectile damage. */
export const resolveWeaponBloodCloudScale = (damage: number): number => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : WEAPON_BLOOD_CLOUD_MIN_DAMAGE;
  const damageRatio = clamp01(
    (safeDamage - WEAPON_BLOOD_CLOUD_MIN_DAMAGE) /
      (WEAPON_BLOOD_CLOUD_MAX_DAMAGE - WEAPON_BLOOD_CLOUD_MIN_DAMAGE),
  );
  return (
    WEAPON_BLOOD_CLOUD_MIN_SCALE +
    Math.sqrt(damageRatio) * (WEAPON_BLOOD_CLOUD_MAX_SCALE - WEAPON_BLOOD_CLOUD_MIN_SCALE)
  );
};

/** Resolve the velocity-driven elongation used by a projected blood stain. */
export const resolveWeaponBloodSmearRatio = (speedMetersPerSecond: number): number => {
  const safeSpeed = Number.isFinite(speedMetersPerSecond) ? Math.max(0, speedMetersPerSecond) : 0;
  return clamp01(
    (safeSpeed - WEAPON_BLOOD_SMEAR_START_SPEED_METERS_PER_SECOND) /
      (WEAPON_BLOOD_SMEAR_FULL_SPEED_METERS_PER_SECOND -
        WEAPON_BLOOD_SMEAR_START_SPEED_METERS_PER_SECOND),
  );
};

/** Resolve the eased point-light strength for the remaining muzzle-flash time. */
export const resolveWeaponMuzzleFlashLightRatio = (remainingSeconds: number): number => {
  const safeRemaining = Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : 0;
  const progress = clamp01(safeRemaining / WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS);
  return progress * progress;
};

/** Blood starts only after the hit leaves the victim with no shield. */
export const resolveWeaponBloodEligibility = (shield: number, damage: number): boolean =>
  Number.isFinite(shield) && shield <= 0 && Number.isFinite(damage) && damage > 0;

/** A shield spark is emitted only for damage actually absorbed by shields. */
export const resolveWeaponShieldHit = (shieldDamage: number): boolean =>
  Number.isFinite(shieldDamage) && shieldDamage > 0;

/** Resolve the normalized logarithmic expansion progress for one muzzle puff. */
export const resolveWeaponMuzzleSmokeLogProgress = (elapsedSeconds: number): number => {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const progress = clamp01(safeElapsed / WEAPON_MUZZLE_SMOKE_LIFETIME_SECONDS);
  return (
    Math.log1p(WEAPON_MUZZLE_SMOKE_LOG_STRENGTH * progress) /
    Math.log1p(WEAPON_MUZZLE_SMOKE_LOG_STRENGTH)
  );
};

/** Resolve the inverse logarithmic opacity of one muzzle puff as it disperses. */
export const resolveWeaponMuzzleSmokeOpacity = (elapsedSeconds: number): number =>
  1 - resolveWeaponMuzzleSmokeLogProgress(elapsedSeconds);

/** Resolve gunshot and projectile controls from damage and barrel length only. */
export const resolveGunAudioProfile = ({
  damage,
  barrelLength,
}: GunAudioParameters): GunAudioProfile => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : GUN_AUDIO_MIN_DAMAGE;
  const damageRatio = clamp01(
    (safeDamage - GUN_AUDIO_MIN_DAMAGE) / (GUN_AUDIO_MAX_DAMAGE - GUN_AUDIO_MIN_DAMAGE),
  );
  const damageCurve = Math.sqrt(damageRatio);
  const safeBarrelLength = Number.isFinite(barrelLength)
    ? Math.max(0, barrelLength)
    : GUN_AUDIO_MIN_BARREL_LENGTH_METERS;
  const barrelRatio = clamp01(
    (safeBarrelLength - GUN_AUDIO_MIN_BARREL_LENGTH_METERS) /
      (GUN_AUDIO_MAX_BARREL_LENGTH_METERS - GUN_AUDIO_MIN_BARREL_LENGTH_METERS),
  );
  const bulletSpeedRatio = clamp01(
    damageCurve * GUN_AUDIO_BULLET_SPEED_DAMAGE_WEIGHT +
      barrelRatio * GUN_AUDIO_BULLET_SPEED_BARREL_WEIGHT,
  );
  return {
    damagePitch: 1.15 - damageCurve * 0.4,
    damageVolume: 0.8 + damageCurve * 0.5,
    muzzleCutoffFrequencyHz: 8200 - damageCurve * 6600,
    crackVolume: 0.25 - barrelRatio * 0.13,
    tailDurationSeconds: 0.08 + barrelRatio * 0.17,
    tailVolume: 0.5 - barrelRatio * 0.1,
    tailCutoffFrequencyHz: 3600 - barrelRatio * 2200,
    bulletSpeedMetersPerSecond:
      GUN_AUDIO_MIN_BULLET_SPEED_METERS_PER_SECOND +
      bulletSpeedRatio *
        (GUN_AUDIO_MAX_BULLET_SPEED_METERS_PER_SECOND -
          GUN_AUDIO_MIN_BULLET_SPEED_METERS_PER_SECOND),
  };
};

/**
 * Resolve a finite, deterministic bullet-impact mix from projectile strength
 * and the acute angle between the projectile path and struck surface normal.
 * Strong, square hits are lower, louder, and longer; grazing hits add a short
 * bright scrape so a shallow strike does not sound like a direct thump.
 */
export const resolveBulletImpactAudioProfile = ({
  damage,
  impactAngleRadians,
}: BulletImpactAudioParameters): BulletImpactAudioProfile => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : BULLET_IMPACT_AUDIO_MIN_DAMAGE;
  const strengthRatio = clamp01(
    (safeDamage - BULLET_IMPACT_AUDIO_MIN_DAMAGE) /
      (BULLET_IMPACT_AUDIO_MAX_DAMAGE - BULLET_IMPACT_AUDIO_MIN_DAMAGE),
  );
  const strengthCurve = Math.sqrt(strengthRatio);
  const safeAngle = Number.isFinite(impactAngleRadians)
    ? Math.max(0, Math.min(BULLET_IMPACT_AUDIO_MAX_ANGLE_RADIANS, impactAngleRadians))
    : 0;
  const angleRatio = safeAngle / BULLET_IMPACT_AUDIO_MAX_ANGLE_RADIANS;
  return {
    impactNoisePlaybackRate: 0.68 + (1 - strengthCurve) * 0.14 + angleRatio * 0.46,
    impactNoiseGain: 0.3 + strengthCurve * 0.62 - angleRatio * 0.12,
    impactNoiseCutoffFrequencyHz: 900 + (1 - strengthCurve) * 2_100 + angleRatio * 3_900,
    impactNoiseQ: 0.75 + strengthCurve * 1.6 + angleRatio * 2.2,
    impactDurationSeconds: 0.05 + strengthCurve * 0.11 + (1 - angleRatio) * 0.035,
    impactToneFrequencyHz: 85 + (1 - strengthCurve) * 260 + angleRatio * 480,
    impactToneGain: 0.04 + strengthCurve * 0.14 + angleRatio * 0.11,
    impactToneEndFrequencyHz:
      (85 + (1 - strengthCurve) * 260 + angleRatio * 480) *
      (0.54 + strengthCurve * 0.08 + (1 - angleRatio) * 0.12),
    glancingNoisePlaybackRate: 0.8 + strengthCurve * 0.15 + angleRatio * 0.65,
    glancingNoiseGain: angleRatio * (0.025 + strengthCurve * 0.19),
    glancingNoiseCenterFrequencyHz: 1_800 + (1 - strengthCurve) * 600 + angleRatio * 5_200,
    glancingNoiseQ: 1.4 + angleRatio * 5,
    glancingDurationSeconds: 0.018 + angleRatio * 0.055,
  };
};

/**
 * Convert a normalized projectile/normal dot product to an acute impact
 * angle. The absolute value makes front- and back-face winding equivalent.
 */
export const resolveBulletImpactAngleRadians = (directionDotSurfaceNormal: number): number => {
  const alignment = Number.isFinite(directionDotSurfaceNormal)
    ? Math.abs(Math.max(-1, Math.min(1, directionDotSurfaceNormal)))
    : 1;
  return Math.acos(alignment);
};

/** Surrounding temperature used as the lower bound for every weapon barrel. */
export const WEAPON_BARREL_AMBIENT_TEMPERATURE_C = 20;
/** A barrel begins its very faint visible red glow at this temperature. */
export const WEAPON_BARREL_GLOW_TEMPERATURE_C = 500;
/** A barrel reaches the maximum bright cherry-red material response at this temperature. */
export const WEAPON_BARREL_RED_HOT_TEMPERATURE_C = 800;
/** A quarter degree Celsius of barrel heat is added for each point of hit damage. */
export const WEAPON_BARREL_HEAT_CELSIUS_PER_DAMAGE = 0.25;
/** Newton-cooling coefficient shared by every weapon barrel. */
export const WEAPON_BARREL_COOLING_COEFFICIENT_PER_SECOND = 0.003;

/** Glow band in which a barrel begins to produce a visible thermal wisp. */
export const WEAPON_BARREL_SMOKE_START_HEAT_RATIO = 0.35;
/** Glow band at which the thermal wisp emitter reaches its full rate. */
export const WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO = 0.8;
/** Base thermal-wisp rate for the longest heated barrel; shorter barrels emit more often. */
export const WEAPON_BARREL_SMOKE_MAX_RATE = 4;
/** Fixed sprite budget for a held weapon's shot and thermal smoke. */
export const WEAPON_BARREL_SMOKE_POOL_SIZE = 192;

/**
 * A smoke sprite is no longer useful once its alpha is below this threshold.
 * Releasing it at the visual clear-out point keeps rapid fire from filling the
 * pool with invisible particles while preserving the rendered fade.
 */
export const WEAPON_SMOKE_CLEAR_OPACITY_THRESHOLD = 0.01;

/** Return whether a smoke particle can be returned to the fixed pool. */
export const shouldClearWeaponSmoke = (
  opacity: number,
  ageSeconds: number,
  lifetimeSeconds: number,
  opacityClearAfterSeconds = 0,
): boolean => {
  const safeOpacity = Number.isFinite(opacity) ? Math.max(0, opacity) : 0;
  const safeAge = Number.isFinite(ageSeconds) ? Math.max(0, ageSeconds) : Number.POSITIVE_INFINITY;
  const safeLifetime = Number.isFinite(lifetimeSeconds)
    ? Math.max(0, lifetimeSeconds)
    : Number.POSITIVE_INFINITY;
  const safeOpacityClearAfter = Number.isFinite(opacityClearAfterSeconds)
    ? Math.max(0, opacityClearAfterSeconds)
    : Number.POSITIVE_INFINITY;
  return (
    safeAge >= safeLifetime ||
    (safeAge >= safeOpacityClearAfter && safeOpacity <= WEAPON_SMOKE_CLEAR_OPACITY_THRESHOLD)
  );
};

/**
 * Resolve a barrel temperature after one hit and one elapsed-time slice.
 * Cooling is exponential (Newton's law of cooling), so the result is
 * independent of frame rate. Hit damage is deliberately separate from shots
 * fired: a miss adds no heat, and every shotgun pellet that hits contributes
 * its own damage.
 */
export const resolveWeaponBarrelTemperatureC = (
  currentTemperatureC: number,
  hitDamage = 0,
  elapsedSeconds = 0,
): number => {
  const current = Number.isFinite(currentTemperatureC)
    ? Math.max(WEAPON_BARREL_AMBIENT_TEMPERATURE_C, currentTemperatureC)
    : WEAPON_BARREL_AMBIENT_TEMPERATURE_C;
  const added = Number.isFinite(hitDamage) ? Math.max(0, hitDamage) : 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const cooledTemperature =
    WEAPON_BARREL_AMBIENT_TEMPERATURE_C +
    (current - WEAPON_BARREL_AMBIENT_TEMPERATURE_C) *
      Math.exp(-WEAPON_BARREL_COOLING_COEFFICIENT_PER_SECOND * elapsed);
  return cooledTemperature + added * WEAPON_BARREL_HEAT_CELSIUS_PER_DAMAGE;
};

/** Resolve the clamped red-glow presentation ratio for a Celsius temperature. */
export const resolveWeaponBarrelGlowRatio = (temperatureC: number): number => {
  const safeTemperature = Number.isFinite(temperatureC)
    ? Math.max(WEAPON_BARREL_AMBIENT_TEMPERATURE_C, temperatureC)
    : WEAPON_BARREL_AMBIENT_TEMPERATURE_C;
  const glowSpan = WEAPON_BARREL_RED_HOT_TEMPERATURE_C - WEAPON_BARREL_GLOW_TEMPERATURE_C;
  return Math.min(1, Math.max(0, (safeTemperature - WEAPON_BARREL_GLOW_TEMPERATURE_C) / glowSpan));
};

/** Resolve a smoothed thermal-smoke ratio from the normalized barrel glow. */
export const resolveWeaponBarrelSmokeRatio = (glowRatio: number): number => {
  const safeRatio = Number.isFinite(glowRatio) ? Math.max(0, Math.min(1, glowRatio)) : 0;
  const span = WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO - WEAPON_BARREL_SMOKE_START_HEAT_RATIO;
  const normalized = Math.max(
    0,
    Math.min(1, (safeRatio - WEAPON_BARREL_SMOKE_START_HEAT_RATIO) / span),
  );
  return normalized * normalized * (3 - 2 * normalized);
};

export type WeaponEffectKind =
  "tracer" | "impact" | "shieldSpark" | "bulletHole" | "bloodCloud" | "bloodDecal";

/** Resolve the normalized opacity for a shot effect as it ages. */
export const resolveWeaponEffectOpacity = (
  kind: WeaponEffectKind,
  remainingSeconds: number,
): number => {
  const remaining = Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : 0;
  if (remaining <= 0) {
    return 0;
  }
  if (kind === "bulletHole") {
    const fadeStart = WEAPON_BULLET_HOLE_LIFETIME_SECONDS - WEAPON_BULLET_HOLE_FADE_SECONDS;
    if (remaining >= fadeStart) {
      return 1;
    }
    return Math.min(1, remaining / WEAPON_BULLET_HOLE_FADE_SECONDS);
  }
  if (kind === "bloodDecal") {
    const fadeStart = WEAPON_BLOOD_DECAL_LIFETIME_SECONDS - WEAPON_BLOOD_DECAL_FADE_SECONDS;
    if (remaining >= fadeStart) {
      return 1;
    }
    return Math.min(1, remaining / WEAPON_BLOOD_DECAL_FADE_SECONDS);
  }
  const lifetime =
    kind === "tracer"
      ? WEAPON_TRACER_LIFETIME_SECONDS
      : kind === "shieldSpark"
        ? WEAPON_SHIELD_SPARK_LIFETIME_SECONDS
        : kind === "bloodCloud"
          ? WEAPON_BLOOD_CLOUD_LIFETIME_SECONDS
          : WEAPON_IMPACT_LIFETIME_SECONDS;
  return Math.min(1, remaining / lifetime);
};

/** Local geometry anchors for the front post and rear notch on a held weapon. */
export interface WeaponIronSightProfile {
  /** Forward (muzzle-side) sight position in weapon-local Z. */
  readonly frontZ: number;
  readonly frontBaseY: number;
  readonly frontHeight: number;
  readonly frontWidth: number;
  readonly frontDepth: number;
  /** Rear (shooter-side) sight position in weapon-local Z. */
  readonly rearZ: number;
  readonly rearBaseY: number;
  readonly rearHeight: number;
  readonly rearEarWidth: number;
  readonly rearNotchWidth: number;
  readonly rearDepth: number;
  /** Low rail that visually joins the two sight blocks to the receiver. */
  readonly railY: number;
  readonly railHeight: number;
  readonly railWidth: number;
}

/** Primitive optic inputs used to derive the shared projected scope effect. */
export interface WeaponScopeProfile {
  readonly magnification: number;
  readonly lensRadius: number;
  readonly bodyLength: number;
  readonly bodyRadius: number;
  readonly ringRadius: number;
  readonly ringTubeRadius: number;
  readonly modelY: number;
  readonly lensColor: number;
}

interface WeaponDefinitionInput {
  readonly id: WeaponId;
  readonly label: string;
  readonly shortLabel: string;
  readonly damage: number;
  /** Physical occupied volume used by the shared size-based gun melee resolver. */
  readonly meleeVolumeM3: number;
  /** Longest occupied gun dimension used as melee reach. */
  readonly meleeLengthMeters: number;
  readonly pellets: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly fireIntervalSeconds: number;
  /** Number of projectiles in one trigger burst; one means continuous fire. */
  readonly burstSize?: number;
  /** Cooldown before a held trigger can start the next burst. */
  readonly burstCooldownSeconds?: number;
  /** Explicit override for unusual weapons; ordinary new guns use the damage threshold. */
  readonly reloadMode?: WeaponReloadMode;
  /** Inherent projectile cone. Non-shotguns keep this at zero and rely on the shared aim stack. */
  readonly spreadRadians: number;
  readonly color: number;
  readonly ironSight: WeaponIronSightProfile;
  readonly scope?: WeaponScopeProfile;
}

export interface WeaponDefinition extends Omit<
  WeaponDefinitionInput,
  "reloadMode" | "burstSize" | "burstCooldownSeconds"
> {
  /** Clip reloads finish once; round reloads insert one round per interval. */
  readonly reloadMode: WeaponReloadMode;
  readonly burstSize: number;
  readonly burstCooldownSeconds: number;
  readonly fireMode: WeaponFireMode;
  /** Damage represented by one reload operation, derived from the weapon profile. */
  readonly totalDamagePerShot: number;
  /** Impact velocity contributed by one projectile, derived from its damage. */
  readonly stoppingPowerPerBullet: number;
  /** Full-clip duration for clip weapons, or one round/shell duration for round weapons. */
  readonly reloadSeconds: number;
}

/** Resolve a valid projectile count for one trigger burst. */
export const resolveWeaponBurstSize = (
  definition: Pick<WeaponDefinitionInput, "burstSize">,
): number => {
  const burstSize = definition.burstSize ?? 1;
  return Number.isFinite(burstSize) ? Math.max(1, Math.floor(burstSize)) : 1;
};

/** Resolve the pause before a held trigger can begin its next burst. */
export const resolveWeaponBurstCooldownSeconds = (
  definition: Pick<WeaponDefinitionInput, "fireIntervalSeconds" | "burstCooldownSeconds">,
): number => {
  const cooldown = definition.burstCooldownSeconds ?? definition.fireIntervalSeconds;
  return Number.isFinite(cooldown) ? Math.max(0, cooldown) : 0;
};

export interface WeaponTriggerProfile {
  readonly burstSize: number;
  readonly burstCooldownSeconds: number;
  readonly fireMode: WeaponFireMode;
  /** A new shot is not allowed until the trigger input is released. */
  readonly requiresTriggerRelease: boolean;
}

/**
 * Resolve the trigger behavior for the current reticle state.
 *
 * The pistol is continuous while the reticle dot is hidden. Caps Lock changes
 * it to one shot per trigger press. The submachine gun is continuous while
 * the reticle dot is hidden and uses a deliberate three-round control burst
 * with Caps Lock enabled. Other weapons retain their fixed definition
 * profile.
 */
export const resolveWeaponTriggerProfile = (
  definition: Pick<
    WeaponDefinition,
    "id" | "fireIntervalSeconds" | "burstSize" | "burstCooldownSeconds" | "fireMode"
  >,
  reticleEnabled: boolean,
): WeaponTriggerProfile => {
  const requiresTriggerRelease = definition.id === "pistol" && reticleEnabled;
  if (definition.id === "submachineGun" && !reticleEnabled) {
    return {
      burstSize: 1,
      burstCooldownSeconds: resolveWeaponBurstCooldownSeconds({
        fireIntervalSeconds: definition.fireIntervalSeconds,
      }),
      fireMode: "automatic",
      requiresTriggerRelease: false,
    };
  }
  return {
    burstSize: resolveWeaponBurstSize(definition),
    burstCooldownSeconds: resolveWeaponBurstCooldownSeconds(definition),
    fireMode: definition.fireMode,
    requiresTriggerRelease,
  };
};

/** Resolve whether a weapon reloads as a full clip or as individual rounds. */
export const resolveWeaponReloadMode = (
  definition: Pick<WeaponDefinitionInput, "damage" | "pellets">,
): WeaponReloadMode =>
  definition.damage * definition.pellets >= WEAPON_ROUND_RELOAD_DAMAGE_THRESHOLD ? "round" : "clip";

/** Resolve the reload interval from damage, pellet payload, and magazine capacity. */
export const resolveWeaponReloadSeconds = (
  definition: Pick<WeaponDefinition, "damage" | "pellets" | "magazineSize" | "reloadMode">,
): number => {
  const damageUnits =
    definition.reloadMode === "round"
      ? definition.damage * definition.pellets
      : definition.damage * definition.magazineSize;
  return damageUnits * WEAPON_RELOAD_SECONDS_PER_DAMAGE;
};

/** Resolve the total time to load a requested number of rounds. */
export const resolveWeaponReloadDuration = (
  definition: Pick<WeaponDefinition, "damage" | "pellets" | "magazineSize" | "reloadMode">,
  roundsToLoad = definition.magazineSize,
): number => {
  const rounds = Number.isFinite(roundsToLoad) ? Math.max(0, Math.ceil(roundsToLoad)) : 0;
  if (rounds === 0) {
    return 0;
  }
  if (definition.reloadMode === "clip") {
    return resolveWeaponReloadSeconds(definition);
  }
  return resolveWeaponReloadSeconds(definition) * rounds;
};

/** Round-based reloads may be cancelled by firing a round already in the gun. */
export const canInterruptWeaponReload = (
  definition: Pick<WeaponDefinition, "reloadMode">,
  ammoInMagazine: number,
): boolean =>
  definition.reloadMode === "round" && Number.isFinite(ammoInMagazine) && ammoInMagazine > 0;

/** Build a definition so all future guns inherit the damage-based reload rule. */
const defineWeapon = (input: WeaponDefinitionInput): WeaponDefinition => {
  const reloadMode = input.reloadMode ?? resolveWeaponReloadMode(input);
  const burstSize = resolveWeaponBurstSize(input);
  const burstCooldownSeconds = resolveWeaponBurstCooldownSeconds(input);
  const definition = { ...input, burstSize, burstCooldownSeconds, reloadMode } as const;
  return {
    ...definition,
    fireMode: burstSize > 1 ? "burst" : "automatic",
    totalDamagePerShot: input.damage * input.pellets,
    stoppingPowerPerBullet: resolveWeaponStoppingPower(input.damage),
    reloadSeconds: resolveWeaponReloadSeconds(definition),
  };
};

export const WEAPON_DEFINITIONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  pistol: defineWeapon({
    id: "pistol",
    label: "Pistol",
    shortLabel: "SIDEARM",
    damage: 28,
    meleeVolumeM3: 0.06,
    meleeLengthMeters: 0.7,
    pellets: 1,
    magazineSize: 12,
    reserveAmmo: 72,
    // Glock 19-like cyclic cadence: an empty 12-round magazine dumps in
    // roughly half a second when the trigger is held.
    fireIntervalSeconds: 0.045,
    spreadRadians: 0,
    color: 0xe95b4d,
    ironSight: {
      frontZ: -0.4,
      frontBaseY: 0.012,
      frontHeight: 0.09,
      frontWidth: 0.026,
      frontDepth: 0.04,
      rearZ: 0.12,
      rearBaseY: 0.035,
      rearHeight: 0.055,
      rearEarWidth: 0.022,
      rearNotchWidth: 0.06,
      rearDepth: 0.06,
      railY: 0.055,
      railHeight: 0.014,
      railWidth: 0.068,
    },
  }),
  shotgun: defineWeapon({
    id: "shotgun",
    label: "Shotgun",
    shortLabel: "BREACH",
    damage: 16,
    meleeVolumeM3: 0.205,
    meleeLengthMeters: 2.02,
    pellets: 8,
    magazineSize: 6,
    reserveAmmo: 36,
    fireIntervalSeconds: 0.92,
    spreadRadians: 0.12,
    color: 0xd6a15a,
    ironSight: {
      frontZ: -0.72,
      frontBaseY: 0.02,
      frontHeight: 0.095,
      frontWidth: 0.034,
      frontDepth: 0.05,
      rearZ: 0.43,
      rearBaseY: 0.035,
      rearHeight: 0.06,
      rearEarWidth: 0.025,
      rearNotchWidth: 0.07,
      rearDepth: 0.07,
      railY: 0.06,
      railHeight: 0.016,
      railWidth: 0.075,
    },
  }),
  machineGun: defineWeapon({
    id: "machineGun",
    label: "Machine gun",
    shortLabel: "SUPPRESS",
    damage: 12,
    meleeVolumeM3: 0.145,
    meleeLengthMeters: 1.28,
    pellets: 1,
    magazineSize: 30,
    reserveAmmo: 150,
    fireIntervalSeconds: 0.085,
    spreadRadians: 0,
    color: 0x75c9d1,
    ironSight: {
      frontZ: -0.62,
      frontBaseY: 0.018,
      frontHeight: 0.09,
      frontWidth: 0.03,
      frontDepth: 0.045,
      rearZ: 0.3,
      rearBaseY: 0.04,
      rearHeight: 0.06,
      rearEarWidth: 0.024,
      rearNotchWidth: 0.075,
      rearDepth: 0.065,
      railY: 0.065,
      railHeight: 0.016,
      railWidth: 0.08,
    },
  }),
  sniper: defineWeapon({
    id: "sniper",
    label: "Sniper",
    shortLabel: "LONGSHOT",
    damage: 100,
    meleeVolumeM3: 0.19,
    meleeLengthMeters: 2.6,
    pellets: 1,
    magazineSize: 5,
    reserveAmmo: 25,
    fireIntervalSeconds: 1.1,
    spreadRadians: 0,
    color: 0xb98ee8,
    scope: {
      magnification: 5,
      lensRadius: 0.062,
      bodyLength: 0.56,
      bodyRadius: 0.061,
      ringRadius: 0.07,
      ringTubeRadius: 0.012,
      modelY: 0.11979078,
      lensColor: 0x6edbe9,
    },
    ironSight: {
      frontZ: -1.16,
      frontBaseY: 0.018,
      frontHeight: 0.105,
      frontWidth: 0.03,
      frontDepth: 0.05,
      rearZ: 0.59,
      rearBaseY: 0.035,
      rearHeight: 0.06,
      rearEarWidth: 0.025,
      rearNotchWidth: 0.075,
      rearDepth: 0.07,
      railY: 0.06,
      railHeight: 0.016,
      railWidth: 0.08,
    },
  }),
  carbine: defineWeapon({
    id: "carbine",
    label: "Scoped carbine",
    shortLabel: "CARBINE",
    damage: 36,
    meleeVolumeM3: 0.215,
    meleeLengthMeters: 2.12,
    pellets: 1,
    magazineSize: 18,
    reserveAmmo: 90,
    fireIntervalSeconds: 0.42,
    spreadRadians: 0,
    color: 0x9bd37a,
    scope: {
      magnification: 3.2,
      lensRadius: 0.07,
      bodyLength: 0.48,
      bodyRadius: 0.055,
      ringRadius: 0.064,
      ringTubeRadius: 0.01,
      modelY: 0.11979078,
      lensColor: 0x9ce8c2,
    },
    ironSight: {
      frontZ: -0.86,
      frontBaseY: 0.018,
      frontHeight: 0.095,
      frontWidth: 0.03,
      frontDepth: 0.045,
      rearZ: 0.44,
      rearBaseY: 0.035,
      rearHeight: 0.06,
      rearEarWidth: 0.024,
      rearNotchWidth: 0.075,
      rearDepth: 0.065,
      railY: 0.062,
      railHeight: 0.016,
      railWidth: 0.08,
    },
  }),
  submachineGun: defineWeapon({
    id: "submachineGun",
    label: "Submachine gun",
    shortLabel: "SMG",
    damage: 9,
    meleeVolumeM3: 0.12,
    meleeLengthMeters: 1.2,
    pellets: 1,
    magazineSize: 36,
    reserveAmmo: 180,
    fireIntervalSeconds: 0.045,
    burstSize: 3,
    burstCooldownSeconds: 0.24,
    spreadRadians: 0,
    color: 0xf28aaf,
    ironSight: {
      frontZ: -0.52,
      frontBaseY: 0.016,
      frontHeight: 0.082,
      frontWidth: 0.028,
      frontDepth: 0.042,
      rearZ: 0.26,
      rearBaseY: 0.035,
      rearHeight: 0.055,
      rearEarWidth: 0.022,
      rearNotchWidth: 0.07,
      rearDepth: 0.06,
      railY: 0.06,
      railHeight: 0.015,
      railWidth: 0.075,
    },
  }),
};

/**
 * Stable rows for the penthouse armory sign. Keep this derived from the
 * playable definitions so the room chart and the loadout HUD cannot drift.
 */
export interface WeaponChartEntry {
  readonly id: WeaponId;
  readonly label: string;
  readonly damagePerBullet: number;
  readonly pelletsPerShot: number;
  readonly totalDamagePerShot: number;
  readonly stoppingPowerPerBullet: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly totalAmmo: number;
  readonly reloadMode: WeaponReloadMode;
  readonly reloadSeconds: number;
  readonly burstSize: number;
  readonly burstCooldownSeconds: number;
  readonly fireMode: WeaponFireMode;
  readonly scopeMagnification: number | null;
}

export const WEAPON_CHART_ENTRIES: readonly WeaponChartEntry[] = WEAPON_IDS.map((weapon) => {
  const definition = WEAPON_DEFINITIONS[weapon];
  return {
    id: weapon,
    label: definition.label,
    damagePerBullet: definition.damage,
    pelletsPerShot: definition.pellets,
    totalDamagePerShot: definition.totalDamagePerShot,
    stoppingPowerPerBullet: definition.stoppingPowerPerBullet,
    magazineSize: definition.magazineSize,
    reserveAmmo: definition.reserveAmmo,
    totalAmmo: definition.magazineSize + definition.reserveAmmo,
    reloadMode: definition.reloadMode,
    reloadSeconds: definition.reloadSeconds,
    burstSize: definition.burstSize,
    burstCooldownSeconds: definition.burstCooldownSeconds,
    fireMode: definition.fireMode,
    scopeMagnification: definition.scope?.magnification ?? null,
  };
});

/**
 * Resolve the only inherent projectile cone used by the firing runtime.
 *
 * Pistol, machine-gun, and sniper rounds leave the muzzle on the live reticle
 * ray. Their apparent spread is produced by the shared first-person
 * presentation stack: movement, breathing, posture, and prior shot recoil
 * move that ray before the next shot. The shotgun keeps a fixed real-world
 * pellet cone, centered on that same live reticle ray. O₂ never changes the
 * cone; it only contributes to the reticle and presentation motion.
 */
export const resolveWeaponSpreadRadians = (definition: WeaponDefinition): number =>
  Math.max(0, Number.isFinite(definition.spreadRadians) ? definition.spreadRadians : 0);

/**
 * Resolve the short local view-model slide from the same per-projectile
 * damage value that drives the central camera recoil damper.
 */
export const WEAPON_RECOIL_MAX_AMOUNT = 0.52;
export const resolveWeaponRecoilAmount = (damage: number): number =>
  Math.min(
    WEAPON_RECOIL_MAX_AMOUNT,
    (Math.max(0, Number.isFinite(damage) ? damage : 0) / 100) * WEAPON_RECOIL_MAX_AMOUNT,
  );

export interface WeaponReloadPose {
  /** How far the weapon is pitched toward the sky, from 0 to 1. */
  readonly skyAmount: number;
  /** Local X rotation applied after the weapon has aimed at the reticle. */
  readonly pitchRadians: number;
  /** Small lift that keeps the skyward motion readable in the lower frame. */
  readonly verticalOffset: number;
  /** Small local Z offset used while the clip-change beat plays. */
  readonly depthOffset: number;
  /** Side nudge that sells a quick clip-change adjustment. */
  readonly lateralOffset: number;
  /** Brief roll during the clip-change beat. */
  readonly rollRadians: number;
}

export interface WeaponReloadPoseOptions {
  /** Keep a round-reload weapon raised after the initial lift. */
  readonly holdRaised?: boolean;
  /** Elapsed time since the most recent inserted-round/clip impulse. */
  readonly insertionImpulseElapsedSeconds?: number | undefined;
}

/** Peak local pitch for the generic snappy reload presentation. */
export const WEAPON_RELOAD_SKY_PITCH_RADIANS = (78 * Math.PI) / 180;
/** Keep the lift and return short so the reload work happens while raised. */
export const WEAPON_RELOAD_LIFT_FRACTION = 0.1;
export const WEAPON_RELOAD_RETURN_FRACTION = 0.1;
/** Brief upward presentation impulse used to acknowledge each inserted round or clip. */
export const WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS = 0.12;
export const WEAPON_RELOAD_INSERT_IMPULSE_PITCH_RADIANS = (7 * Math.PI) / 180;
export const WEAPON_RELOAD_INSERT_IMPULSE_VERTICAL_OFFSET = 0.07;
const WEAPON_RELOAD_LIFT_END = WEAPON_RELOAD_LIFT_FRACTION;
const WEAPON_RELOAD_CLIP_END = 1 - WEAPON_RELOAD_RETURN_FRACTION;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

/** Resolve a short, decaying upward kick after a round or clip is inserted. */
export const resolveWeaponReloadInsertionImpulse = (elapsedSeconds: number): number => {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  if (elapsed >= WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS) {
    return 0;
  }
  return (1 - elapsed / WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS) ** 3;
};

/**
 * Resolve the shared reload pose for every held weapon.
 *
 * The animation is intentionally short and staged: snap the muzzle skyward,
 * hold a beat for the pretend clip change, then snap the weapon back to the
 * reticle. Elapsed time is normalized by the weapon's configured reload time
 * so the same presentation works for every weapon profile.
 */
export const resolveWeaponReloadPose = (
  elapsedSeconds: number,
  durationSeconds: number,
  options: WeaponReloadPoseOptions = {},
): WeaponReloadPose => {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 1;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const progress = clampUnit(elapsed / duration);
  const insertionImpulse =
    options.insertionImpulseElapsedSeconds === undefined
      ? 0
      : resolveWeaponReloadInsertionImpulse(options.insertionImpulseElapsedSeconds);
  let skyAmount: number;
  let clipAmount = 0;
  if (progress < WEAPON_RELOAD_LIFT_END) {
    skyAmount = easeOutCubic(progress / WEAPON_RELOAD_LIFT_END);
  } else if (options.holdRaised === true) {
    skyAmount = 1;
  } else if (progress < WEAPON_RELOAD_CLIP_END) {
    skyAmount = 1;
    clipAmount = Math.sin(
      ((progress - WEAPON_RELOAD_LIFT_END) / (WEAPON_RELOAD_CLIP_END - WEAPON_RELOAD_LIFT_END)) *
        Math.PI,
    );
  } else {
    skyAmount =
      1 - easeOutCubic((progress - WEAPON_RELOAD_CLIP_END) / (1 - WEAPON_RELOAD_CLIP_END));
  }
  return {
    skyAmount,
    pitchRadians:
      WEAPON_RELOAD_SKY_PITCH_RADIANS * skyAmount +
      WEAPON_RELOAD_INSERT_IMPULSE_PITCH_RADIANS * insertionImpulse,
    verticalOffset:
      0.16 * skyAmount + WEAPON_RELOAD_INSERT_IMPULSE_VERTICAL_OFFSET * insertionImpulse,
    depthOffset: 0.035 * skyAmount + 0.028 * clipAmount,
    lateralOffset: -0.055 * clipAmount,
    rollRadians: -0.16 * clipAmount,
  };
};

/**
 * Resolve the presentation for a shell-or-bullet reload. The first lift uses
 * the shared 10% phase, then the weapon stays raised for every chambering
 * interval. Supplying a return elapsed value starts the shared final 10%
 * recenter phase after an interruption or the final chamber.
 */
export const resolveWeaponRoundReloadPose = (
  liftElapsedSeconds: number,
  durationSeconds: number,
  returnElapsedSeconds: number | null = null,
  insertionImpulseElapsedSeconds?: number,
): WeaponReloadPose => {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 1;
  if (returnElapsedSeconds !== null) {
    const safeReturnElapsed = Number.isFinite(returnElapsedSeconds)
      ? Math.max(0, returnElapsedSeconds)
      : 0;
    return resolveWeaponReloadPose(
      duration * WEAPON_RELOAD_CLIP_END + safeReturnElapsed,
      duration,
      {
        insertionImpulseElapsedSeconds,
      },
    );
  }
  return resolveWeaponReloadPose(liftElapsedSeconds, duration, {
    holdRaised: true,
    insertionImpulseElapsedSeconds,
  });
};

export interface WeaponSpawnRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface WeaponSpawnObstacle {
  readonly center: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly halfExtents: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly rotationY?: number;
}

export interface WeaponPickupSpawn {
  readonly id: string;
  readonly weapon: WeaponId;
  readonly position: readonly [number, number, number];
  readonly rotation: number;
  readonly starter?: boolean;
}

export interface GenerateWeaponPickupOptions {
  readonly worldHalfSize?: number;
  readonly reservedRects?: readonly WeaponSpawnRect[];
  readonly obstacles?: readonly WeaponSpawnObstacle[];
  readonly pickupCountPerWeapon?: number;
  readonly minimumDistance?: number;
}

const DEFAULT_WORLD_HALF_SIZE = 500;
const WORLD_EDGE_MARGIN = 5;
/** Per-weapon request ceiling; compact maps may return fewer placements. */
const DEFAULT_PICKUP_COUNT_PER_WEAPON = 24;
/** Keep at most one generated gun inside any 75 m radius. */
export const WEAPON_MINIMUM_SPAWN_DISTANCE_METERS = 75;
const PICKUP_HEIGHT = 0.72;
const DEFAULT_EDGE_PICKUP_MARGIN = 4;
const OBSTACLE_CLEARANCE = 0.9;
const MAX_CANDIDATE_ATTEMPTS_PER_PICKUP = 240;
const PROCEDURAL_SPAWN_REGION_COUNT = 4;
const PROCEDURAL_SPAWN_GRID_SIDE = 8;
const PROCEDURAL_SPAWN_CELL_INSET_RATIO = 0.15;
/** Radius used by both walk-over pickup and the manual E interaction. */
export const WEAPON_PICKUP_RANGE_METERS = 3.5;

interface WeaponSpawnCell {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

type WeaponPlacementRandom = ReturnType<typeof createSeededRandom>;

const shuffleValues = (
  values: (WeaponSpawnCell | number)[],
  random: WeaponPlacementRandom,
): void => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const otherIndex = random.nextInt(index + 1);
    const current = values[index];
    const other = values[otherIndex];
    if (current === undefined || other === undefined) {
      continue;
    }
    values[index] = other;
    values[otherIndex] = current;
  }
};

/** Build four seeded map sectors with deterministic candidate cells. */
const createProceduralSpawnCells = (
  worldHalfSize: number,
  random: WeaponPlacementRandom,
): WeaponSpawnCell[][] => {
  const cellsByRegion = Array.from(
    { length: PROCEDURAL_SPAWN_REGION_COUNT },
    (): WeaponSpawnCell[] => [],
  );
  const regionHalfSize = worldHalfSize / 2;
  const cellSize = regionHalfSize / PROCEDURAL_SPAWN_GRID_SIDE;
  const regionCoordinates = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;
  regionCoordinates.forEach(([regionX, regionZ], regionIndex) => {
    const regionCells = cellsByRegion[regionIndex];
    if (regionCells === undefined) {
      return;
    }
    const regionMinX = regionX < 0 ? -worldHalfSize : 0;
    const regionMinZ = regionZ < 0 ? -worldHalfSize : 0;
    for (let row = 0; row < PROCEDURAL_SPAWN_GRID_SIDE; row += 1) {
      for (let column = 0; column < PROCEDURAL_SPAWN_GRID_SIDE; column += 1) {
        regionCells.push({
          minX: regionMinX + column * cellSize,
          maxX: regionMinX + (column + 1) * cellSize,
          minZ: regionMinZ + row * cellSize,
          maxZ: regionMinZ + (row + 1) * cellSize,
        });
      }
    }
    shuffleValues(regionCells, random);
  });
  return cellsByRegion;
};

const sampleProceduralSpawnCell = (
  cell: WeaponSpawnCell,
  worldHalfSize: number,
  random: WeaponPlacementRandom,
): readonly [number, number] => {
  const insetX = (cell.maxX - cell.minX) * PROCEDURAL_SPAWN_CELL_INSET_RATIO;
  const insetZ = (cell.maxZ - cell.minZ) * PROCEDURAL_SPAWN_CELL_INSET_RATIO;
  const x =
    cell.minX + insetX + random.nextFloat() * Math.max(0, cell.maxX - cell.minX - insetX * 2);
  const z =
    cell.minZ + insetZ + random.nextFloat() * Math.max(0, cell.maxZ - cell.minZ - insetZ * 2);
  const edgeMin = -Math.max(0, worldHalfSize - WORLD_EDGE_MARGIN);
  const edgeMax = Math.max(0, worldHalfSize - WORLD_EDGE_MARGIN);
  return [
    Math.min(edgeMax, Math.max(edgeMin, Math.round(x / 0.5) * 0.5)),
    Math.min(edgeMax, Math.max(edgeMin, Math.round(z / 0.5) * 0.5)),
  ];
};

const isInsideRect = (x: number, z: number, rect: WeaponSpawnRect, clearance: number): boolean =>
  x >= rect.minX - clearance &&
  x <= rect.maxX + clearance &&
  z >= rect.minZ - clearance &&
  z <= rect.maxZ + clearance;

const isBlockedByObstacle = (
  x: number,
  z: number,
  obstacle: WeaponSpawnObstacle,
  clearance: number,
): boolean => {
  const dx = x - obstacle.center.x;
  const dz = z - obstacle.center.z;
  const rotation = obstacle.rotationY ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return (
    Math.abs(localX) <= obstacle.halfExtents.x + clearance &&
    Math.abs(localZ) <= obstacle.halfExtents.z + clearance &&
    obstacle.center.y + obstacle.halfExtents.y > 0.12
  );
};

const isValidCandidate = (
  x: number,
  z: number,
  reservedRects: readonly WeaponSpawnRect[],
  obstacles: readonly WeaponSpawnObstacle[],
  placements: readonly WeaponPickupSpawn[],
  minimumDistance: number,
): boolean => {
  if (
    reservedRects.some((rect) => isInsideRect(x, z, rect, OBSTACLE_CLEARANCE)) ||
    obstacles.some((obstacle) => isBlockedByObstacle(x, z, obstacle, OBSTACLE_CLEARANCE))
  ) {
    return false;
  }
  const minimumDistanceSquared = minimumDistance * minimumDistance;
  return placements.every((placement) => {
    const dx = x - placement.position[0];
    const dz = z - placement.position[2];
    return dx * dx + dz * dz >= minimumDistanceSquared;
  });
};

const fallbackCandidate = (
  index: number,
  worldHalfSize: number,
  reservedRects: readonly WeaponSpawnRect[],
  obstacles: readonly WeaponSpawnObstacle[],
  placements: readonly WeaponPickupSpawn[],
  minimumDistance: number,
): readonly [number, number] | null => {
  const ring = Math.floor(index / 16) + 1;
  const side = index % 16;
  const radius = Math.min(worldHalfSize - WORLD_EDGE_MARGIN, 12 + ring * 9);
  const angle = (side / 16) * Math.PI * 2 + (ring % 2 === 0 ? 0.17 : -0.11);
  const x = Math.round((Math.cos(angle) * radius) / 0.5) * 0.5;
  const z = Math.round((Math.sin(angle) * radius) / 0.5) * 0.5;
  return isValidCandidate(x, z, reservedRects, obstacles, placements, minimumDistance)
    ? [x, z]
    : null;
};

/**
 * Generate deterministic weapon pickups for one room seed.
 *
 * Keep all weapon pickups in the full procedural world so every placement is
 * visible by traversal. Reserved authored play areas and coarse scene obstacles
 * protect the stream; all seeds remain deterministic per room and spawn index.
 */
export const generateWeaponPickups = (
  roomSeed: string,
  options: GenerateWeaponPickupOptions = {},
): readonly WeaponPickupSpawn[] => {
  const normalizedSeed = roomSeed.trim() || "room-01";
  const worldHalfSize = Math.max(12, options.worldHalfSize ?? DEFAULT_WORLD_HALF_SIZE);
  const pickupCountPerWeapon = Math.max(
    1,
    Math.min(32, Math.floor(options.pickupCountPerWeapon ?? DEFAULT_PICKUP_COUNT_PER_WEAPON)),
  );
  const minimumDistance = Math.max(
    1.5,
    options.minimumDistance ?? WEAPON_MINIMUM_SPAWN_DISTANCE_METERS,
  );
  const reservedRects = options.reservedRects ?? [];
  const obstacles = options.obstacles ?? [];
  const random = createSeededRandom(`${normalizedSeed}|weapons|placements|v1`);
  const placements: WeaponPickupSpawn[] = [];
  const cellsByRegion = createProceduralSpawnCells(worldHalfSize, random);
  const regionOrder = Array.from({ length: PROCEDURAL_SPAWN_REGION_COUNT }, (_, index) => index);
  shuffleValues(regionOrder, random);
  const spawnOrder: WeaponId[] = [];
  for (let copy = 0; copy < pickupCountPerWeapon; copy += 1) {
    spawnOrder.push(...WEAPON_IDS);
  }
  const pickupNumberByWeapon = new Map<WeaponId, number>();

  for (const [index, weapon] of spawnOrder.entries()) {
    let candidate: readonly [number, number] | null = null;
    const preferredRegion = regionOrder[index % regionOrder.length] ?? 0;
    const regionCandidates = [
      preferredRegion,
      ...regionOrder.filter((regionIndex) => regionIndex !== preferredRegion),
    ];
    for (const regionIndex of regionCandidates) {
      const cells = cellsByRegion[regionIndex];
      if (cells === undefined) {
        continue;
      }
      let cellIndex = 0;
      while (cellIndex < cells.length) {
        const cell = cells[cellIndex];
        if (cell === undefined) {
          cellIndex += 1;
          continue;
        }
        const cellCandidate = sampleProceduralSpawnCell(cell, worldHalfSize, random);
        if (
          isValidCandidate(
            cellCandidate[0],
            cellCandidate[1],
            reservedRects,
            obstacles,
            placements,
            minimumDistance,
          )
        ) {
          candidate = cellCandidate;
          cells.splice(cellIndex, 1);
          break;
        }
        // A rejected cell cannot become valid later: authored reservations,
        // obstacles, and the minimum-distance constraint only become stricter
        // as more pickups are accepted.
        cells.splice(cellIndex, 1);
      }
      if (candidate !== null) {
        break;
      }
    }
    for (let attempt = 0; attempt < MAX_CANDIDATE_ATTEMPTS_PER_PICKUP; attempt += 1) {
      if (candidate !== null) {
        break;
      }
      const x =
        Math.round(((random.nextFloat() * 2 - 1) * (worldHalfSize - WORLD_EDGE_MARGIN)) / 0.5) *
        0.5;
      const z =
        Math.round(((random.nextFloat() * 2 - 1) * (worldHalfSize - WORLD_EDGE_MARGIN)) / 0.5) *
        0.5;
      if (isValidCandidate(x, z, reservedRects, obstacles, placements, minimumDistance)) {
        candidate = [x, z];
        break;
      }
    }
    if (candidate === null) {
      for (let fallbackIndex = index; fallbackIndex < index + 256; fallbackIndex += 1) {
        candidate = fallbackCandidate(
          fallbackIndex,
          worldHalfSize,
          reservedRects,
          obstacles,
          placements,
          minimumDistance,
        );
        if (candidate !== null) {
          break;
        }
      }
    }
    if (candidate === null) {
      // No valid point remains at the requested spacing. Stop instead of
      // violating the spacing contract with an unvalidated fallback point.
      break;
    }
    const [x, z] = candidate;
    const pickupNumber = (pickupNumberByWeapon.get(weapon) ?? 0) + 1;
    pickupNumberByWeapon.set(weapon, pickupNumber);
    placements.push({
      id: `weapon-${weapon}-${String(pickupNumber).padStart(2, "0")}`,
      weapon,
      position: [x, PICKUP_HEIGHT, z],
      rotation: random.nextFloat() * Math.PI * 2,
      ...(pickupNumber === 1 && weapon === "pistol" ? { starter: true } : {}),
    });
  }
  return placements;
};

/**
 * Place one copy of every weapon at equal distances around a rectangular map
 * perimeter. The inset keeps pickups on the platform instead of directly on
 * the world boundary; rotations remain seed-derived for reproducibility.
 */
export const generateWeaponPickupsOnEdges = (
  roomSeed: string,
  bounds: WeaponSpawnRect,
  options: { readonly edgeMargin?: number } = {},
): readonly WeaponPickupSpawn[] => {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (!(width > 0) || !(depth > 0)) {
    return [];
  }

  const requestedMargin = Math.max(0, options.edgeMargin ?? DEFAULT_EDGE_PICKUP_MARGIN);
  const maximumInset = Math.max(0, Math.min(width, depth) / 2 - 0.5);
  const edgeMargin = Math.min(requestedMargin, maximumInset);
  const minX = bounds.minX + edgeMargin;
  const maxX = bounds.maxX - edgeMargin;
  const minZ = bounds.minZ + edgeMargin;
  const maxZ = bounds.maxZ - edgeMargin;
  const insetWidth = maxX - minX;
  const insetDepth = maxZ - minZ;
  const perimeter = 2 * (insetWidth + insetDepth);
  const spacing = perimeter / WEAPON_IDS.length;
  const normalizedSeed = roomSeed.trim() || "room-01";
  const random = createSeededRandom(`${normalizedSeed}|weapons|edge-placements|v1`);

  const samplePerimeter = (distance: number): readonly [number, number] => {
    const wrappedDistance = ((distance % perimeter) + perimeter) % perimeter;
    if (wrappedDistance < insetWidth) {
      return [minX + wrappedDistance, minZ];
    }
    if (wrappedDistance < insetWidth + insetDepth) {
      return [maxX, minZ + wrappedDistance - insetWidth];
    }
    if (wrappedDistance < insetWidth * 2 + insetDepth) {
      return [maxX - wrappedDistance + insetWidth + insetDepth, maxZ];
    }
    return [minX, maxZ - wrappedDistance + insetWidth * 2 + insetDepth];
  };

  return WEAPON_IDS.map((weapon, index) => {
    const [x, z] = samplePerimeter((index + 0.5) * spacing);
    return {
      id: `weapon-${weapon}-01`,
      weapon,
      position: [x, PICKUP_HEIGHT, z],
      rotation: random.nextFloat() * Math.PI * 2,
      ...(weapon === "pistol" ? { starter: true } : {}),
    };
  });
};

export interface WeaponInventorySnapshot {
  readonly weapon: WeaponId;
  readonly owned: boolean;
  readonly ammoInMagazine: number;
  readonly reserveAmmo: number;
}

export interface WeaponStateSnapshot {
  readonly activeWeapon: WeaponId | null;
  readonly nearbyPickup: WeaponId | null;
  readonly inventory: readonly WeaponInventorySnapshot[];
  readonly reloading: boolean;
  readonly shotsFired: number;
  /** Number of projectiles that currently resolved against a render surface. */
  readonly shotsHit: number;
  /** Number of live surface marks before their five-minute expiry. */
  readonly bulletHoleCount: number;
}

export const createEmptyWeaponStateSnapshot = (): WeaponStateSnapshot => ({
  activeWeapon: null,
  nearbyPickup: null,
  inventory: WEAPON_IDS.map((weapon): WeaponInventorySnapshot => ({
    weapon,
    owned: false,
    ammoInMagazine: 0,
    reserveAmmo: 0,
  })),
  reloading: false,
  shotsFired: 0,
  shotsHit: 0,
  bulletHoleCount: 0,
});
