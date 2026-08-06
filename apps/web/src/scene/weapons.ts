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
export const WEAPON_BULLET_HOLE_LIFETIME_SECONDS = 5 * 60;
export const WEAPON_BULLET_HOLE_FADE_SECONDS = 12;
/** Keep sustained automatic fire from accumulating unbounded scene objects. */
export const WEAPON_BULLET_HOLE_MAX_COUNT = 256;

/** Fixed sound sources supported by the procedural shot-audio path. */
export type WeaponShotSoundWaveform = OscillatorType | "whiteNoise";
/** One deliberately static white-noise timbre for every trigger pull. */
export const WEAPON_SHOT_SOUND_WAVEFORM: WeaponShotSoundWaveform = "whiteNoise";
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
}

/** Damage bounds used by the continuous procedural gunshot curve. */
export const GUN_AUDIO_MIN_DAMAGE = 12;
export const GUN_AUDIO_MAX_DAMAGE = 100;
/** Barrel bounds used by the continuous resonance curve. */
export const GUN_AUDIO_MIN_BARREL_LENGTH_METERS = 0.34;
export const GUN_AUDIO_MAX_BARREL_LENGTH_METERS = 1.35;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Resolve the four-layer gunshot controls from damage and barrel length only. */
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
  return {
    damagePitch: 1.15 - damageCurve * 0.4,
    damageVolume: 0.8 + damageCurve * 0.5,
    muzzleCutoffFrequencyHz: 8200 - damageCurve * 6600,
    crackVolume: 0.25 - barrelRatio * 0.13,
    tailDurationSeconds: 0.08 + barrelRatio * 0.17,
    tailVolume: 0.5 - barrelRatio * 0.1,
    tailCutoffFrequencyHz: 3600 - barrelRatio * 2200,
  };
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

export type WeaponEffectKind = "tracer" | "impact" | "bulletHole";

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
  const lifetime =
    kind === "tracer" ? WEAPON_TRACER_LIFETIME_SECONDS : WEAPON_IMPACT_LIFETIME_SECONDS;
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
    reloadSeconds: resolveWeaponReloadSeconds(definition),
  };
};

export const WEAPON_DEFINITIONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  pistol: defineWeapon({
    id: "pistol",
    label: "Pistol",
    shortLabel: "SIDEARM",
    damage: 28,
    pellets: 1,
    magazineSize: 12,
    reserveAmmo: 72,
    fireIntervalSeconds: 0.28,
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
    shortLabel: "BURST",
    damage: 9,
    pellets: 1,
    magazineSize: 36,
    reserveAmmo: 180,
    fireIntervalSeconds: 0.045,
    burstSize: 4,
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
  /** True when the pickup is staged in the penthouse beside the mahjong table. */
  readonly nearTable?: boolean;
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
const DEFAULT_PICKUP_COUNT_PER_WEAPON = 3;
const DEFAULT_MINIMUM_DISTANCE = 7;
const PICKUP_HEIGHT = 0.72;
const OBSTACLE_CLEARANCE = 0.9;
const MAX_CANDIDATE_ATTEMPTS_PER_PICKUP = 240;
/** Radius used by both walk-over pickup and the manual E interaction. */
export const WEAPON_PICKUP_RANGE_METERS = 3.5;

/**
 * Keep one readable pickup for every weapon in the table-first penthouse
 * composition. The six pads sit outside the table footprint, with the
 * starter pistol closest to the initial south-seat camera.
 */
const TABLE_SIDE_PICKUP_LAYOUT = [
  {
    weapon: "pistol",
    position: [2.65, PICKUP_HEIGHT, 3.55],
    rotation: -0.32,
  },
  {
    weapon: "shotgun",
    position: [-2.65, PICKUP_HEIGHT, 3.55],
    rotation: 0.32,
  },
  {
    weapon: "machineGun",
    position: [2.65, PICKUP_HEIGHT, -3.55],
    rotation: Math.PI - 0.32,
  },
  {
    weapon: "sniper",
    position: [-2.65, PICKUP_HEIGHT, -3.55],
    rotation: Math.PI + 0.32,
  },
  {
    weapon: "carbine",
    position: [4.25, PICKUP_HEIGHT, 0],
    rotation: -Math.PI / 2,
  },
  {
    weapon: "submachineGun",
    position: [-4.25, PICKUP_HEIGHT, 0],
    rotation: Math.PI / 2,
  },
] as const satisfies readonly {
  readonly weapon: WeaponId;
  readonly position: readonly [number, number, number];
  readonly rotation: number;
}[];

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
 * One pickup for each weapon is staged beside the penthouse mahjong table so
 * all weapon types are visible and immediately testable. Remaining
 * pickups are seeded across the streamed world. Reserved authored play areas
 * and coarse scene obstacles apply to those outdoor placements; the deliberate
 * table-side set is the only placement inside the penthouse reservation.
 */
export const generateWeaponPickups = (
  roomSeed: string,
  options: GenerateWeaponPickupOptions = {},
): readonly WeaponPickupSpawn[] => {
  const normalizedSeed = roomSeed.trim() || "room-01";
  const worldHalfSize = Math.max(12, options.worldHalfSize ?? DEFAULT_WORLD_HALF_SIZE);
  const pickupCountPerWeapon = Math.max(
    1,
    Math.min(8, Math.floor(options.pickupCountPerWeapon ?? DEFAULT_PICKUP_COUNT_PER_WEAPON)),
  );
  const minimumDistance = Math.max(1.5, options.minimumDistance ?? DEFAULT_MINIMUM_DISTANCE);
  const reservedRects = options.reservedRects ?? [];
  const obstacles = options.obstacles ?? [];
  const random = createSeededRandom(`${normalizedSeed}|weapons|placements|v1`);
  const placements: WeaponPickupSpawn[] = TABLE_SIDE_PICKUP_LAYOUT.map(
    ({ weapon, position, rotation }) => ({
      id: `weapon-${weapon}-table`,
      weapon,
      position,
      rotation,
      nearTable: true,
      ...(weapon === "pistol" ? { starter: true } : {}),
    }),
  );
  const spawnOrder = WEAPON_IDS.flatMap((weapon) =>
    Array.from(
      {
        // The table-side set counts as one pickup for every non-pistol type.
        // Keep the existing public count semantics: the starter pistol is in
        // addition to its configured outdoor count, while other types have
        // the table-side pickup in place of one outdoor spawn.
        length: weapon === "pistol" ? pickupCountPerWeapon : pickupCountPerWeapon - 1,
      },
      () => weapon,
    ),
  );

  spawnOrder.forEach((weapon, index) => {
    let candidate: readonly [number, number] | null = null;
    for (let attempt = 0; attempt < MAX_CANDIDATE_ATTEMPTS_PER_PICKUP; attempt += 1) {
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
      // The default 1 km world has ample room. If a caller reserves nearly
      // all of it, keep the deterministic result valid rather than throwing
      // during scene construction.
      const angle = (index / Math.max(1, spawnOrder.length)) * Math.PI * 2;
      candidate = [
        Math.cos(angle) * Math.max(2, worldHalfSize - WORLD_EDGE_MARGIN),
        Math.sin(angle) * Math.max(2, worldHalfSize - WORLD_EDGE_MARGIN),
      ];
    }
    const [x, z] = candidate;
    placements.push({
      id: `weapon-${weapon}-${String(index + 1).padStart(2, "0")}`,
      weapon,
      position: [x, PICKUP_HEIGHT, z],
      rotation: random.nextFloat() * Math.PI * 2,
    });
  });
  return placements;
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
