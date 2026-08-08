import { describe, expect, it } from "vitest";

import {
  generateWeaponPickups,
  WEAPON_MINIMUM_SPAWN_DISTANCE_METERS,
  canInterruptWeaponReload,
  resolveWeaponEffectOpacity,
  resolveWeaponReloadDuration,
  resolveWeaponReloadMode,
  resolveWeaponBurstCooldownSeconds,
  resolveWeaponBurstSize,
  resolveWeaponTriggerProfile,
  resolveWeaponReloadPose,
  resolveWeaponReloadInsertionImpulse,
  resolveWeaponRoundReloadPose,
  resolveWeaponReloadSeconds,
  resolveWeaponRecoilAmount,
  resolveWeaponStoppingPower,
  WEAPON_STOPPING_POWER_MAX_METERS_PER_SECOND,
  WEAPON_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE,
  resolveWeaponHotkey,
  WEAPON_DEFINITIONS,
  WEAPON_CHART_ENTRIES,
  WEAPON_IDS,
  WEAPON_BULLET_HOLE_FADE_SECONDS,
  WEAPON_BULLET_HOLE_LIFETIME_SECONDS,
  WEAPON_BULLET_HOLE_MAX_COUNT,
  WEAPON_BLOOD_CLOUD_LIFETIME_SECONDS,
  WEAPON_BLOOD_CLOUD_MIN_SCALE,
  WEAPON_BLOOD_CLOUD_MAX_SCALE,
  WEAPON_BLOOD_DECAL_LIFETIME_SECONDS,
  WEAPON_BLOOD_DECAL_FADE_SECONDS,
  resolveWeaponBloodCloudScale,
  resolveWeaponBloodSmearRatio,
  resolveWeaponBloodEligibility,
  resolveWeaponShieldHit,
  WEAPON_BLOOD_CLOUD_PARTICLE_COUNT,
  WEAPON_BLOOD_CLOUD_OPACITY,
  WEAPON_BLOOD_CLOUD_COLOR,
  WEAPON_BLOOD_SPLAT_OPACITY,
  WEAPON_BLOOD_SPLAT_COLOR,
  WEAPON_SHIELD_SPARK_LIFETIME_SECONDS,
  WEAPON_SHIELD_SPARK_COLOR,
  WEAPON_SHIELD_SPARK_OPACITY,
  WEAPON_BARREL_AMBIENT_TEMPERATURE_C,
  WEAPON_BARREL_GLOW_TEMPERATURE_C,
  WEAPON_BARREL_RED_HOT_TEMPERATURE_C,
  WEAPON_BARREL_HEAT_CELSIUS_PER_DAMAGE,
  WEAPON_BARREL_COOLING_COEFFICIENT_PER_SECOND,
  WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO,
  WEAPON_BARREL_SMOKE_START_HEAT_RATIO,
  WEAPON_MUZZLE_SMOKE_LIFETIME_SECONDS,
  WEAPON_MUZZLE_SMOKE_PARTICLE_COUNT,
  WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS,
  WEAPON_MUZZLE_FLASH_LIGHT_INTENSITY,
  WEAPON_MUZZLE_FLASH_LIGHT_DISTANCE,
  WEAPON_MUZZLE_FLASH_LIGHT_DECAY,
  resolveWeaponMuzzleFlashLightRatio,
  resolveWeaponMuzzleSmokeLogProgress,
  resolveWeaponMuzzleSmokeOpacity,
  WEAPON_SMOKE_CLEAR_OPACITY_THRESHOLD,
  WEAPON_PICKUP_RANGE_METERS,
  WEAPON_RELOAD_SKY_PITCH_RADIANS,
  WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS,
  WEAPON_SHOT_SOUND_WAVEFORM,
  WEAPON_TRACER_LIFETIME_SECONDS,
  resolveWeaponSpreadRadians,
  resolveWeaponBarrelTemperatureC,
  resolveWeaponBarrelGlowRatio,
  resolveWeaponBarrelSmokeRatio,
  shouldClearWeaponSmoke,
  resolveGunAudioProfile,
  resolveBulletImpactAudioProfile,
  resolveBulletImpactAngleRadians,
  resolveWeaponAudioProximity,
  GUN_AUDIO_MIN_DAMAGE,
  GUN_AUDIO_MAX_DAMAGE,
  GUN_AUDIO_MIN_BARREL_LENGTH_METERS,
  GUN_AUDIO_MAX_BARREL_LENGTH_METERS,
  BULLET_IMPACT_AUDIO_MIN_DAMAGE,
  BULLET_IMPACT_AUDIO_MAX_DAMAGE,
  BULLET_IMPACT_AUDIO_MAX_ANGLE_RADIANS,
  WEAPON_AUDIO_MAX_DISTANCE_METERS,
  WEAPON_AUDIO_REFERENCE_DISTANCE_METERS,
  WEAPON_AUDIO_ROLLOFF_FACTOR,
  type WeaponSpawnRect,
} from "./weapons.js";
import { resolveMeleeSwing } from "./melee.js";

describe("weapon definitions", () => {
  it("maps number-row weapon keys and reserves zero for an empty hand", () => {
    expect(resolveWeaponHotkey("Digit0")).toBeNull();
    expect(resolveWeaponHotkey("Digit1")).toBe("pistol");
    expect(resolveWeaponHotkey("Digit4")).toBe("sniper");
    expect(resolveWeaponHotkey("Digit5")).toBe("carbine");
    expect(resolveWeaponHotkey("Digit6")).toBe("submachineGun");
    expect(resolveWeaponHotkey("Digit7")).toBeUndefined();
    expect(resolveWeaponHotkey("Numpad0")).toBeUndefined();
  });

  it("contains the six playable weapon profiles", () => {
    expect(WEAPON_IDS).toEqual([
      "pistol",
      "shotgun",
      "machineGun",
      "sniper",
      "carbine",
      "submachineGun",
    ]);
    for (const weapon of WEAPON_IDS) {
      const definition = WEAPON_DEFINITIONS[weapon];
      expect(definition.magazineSize).toBeGreaterThan(0);
      expect(definition.reserveAmmo).toBeGreaterThan(definition.magazineSize);
      expect(definition.pellets).toBeGreaterThan(0);
      expect(definition.fireIntervalSeconds).toBeGreaterThan(0);
      expect(definition.stoppingPowerPerBullet).toBe(resolveWeaponStoppingPower(definition.damage));
      expect(definition.burstSize).toBeGreaterThan(0);
      expect(definition.burstCooldownSeconds).toBeGreaterThanOrEqual(0);
      expect(definition.meleeVolumeM3).toBeGreaterThan(0);
      expect(definition.meleeLengthMeters).toBeGreaterThan(0);
      expect("range" in definition).toBe(false);
    }
  });

  it("derives gun melee damage and swing speed from the gun's physical size", () => {
    const pistol = resolveMeleeSwing(WEAPON_DEFINITIONS.pistol.meleeVolumeM3);
    const carbine = resolveMeleeSwing(WEAPON_DEFINITIONS.carbine.meleeVolumeM3);
    expect(WEAPON_DEFINITIONS.carbine.meleeLengthMeters).toBeGreaterThan(
      WEAPON_DEFINITIONS.pistol.meleeLengthMeters,
    );
    expect(carbine.damage).toBeGreaterThan(pistol.damage);
    expect(carbine.swingSpeedRadiansPerSecond).toBeLessThan(pistol.swingSpeedRadiansPerSecond);
  });

  it("derives a slow scoped carbine and an ultra-fast low-damage burst profile", () => {
    const carbine = WEAPON_DEFINITIONS.carbine;
    const submachineGun = WEAPON_DEFINITIONS.submachineGun;
    expect(carbine.scope?.magnification).toBe(3.2);
    expect(carbine.fireIntervalSeconds).toBeGreaterThan(
      WEAPON_DEFINITIONS.machineGun.fireIntervalSeconds,
    );
    expect(carbine.damage).toBeGreaterThan(submachineGun.damage);
    expect(submachineGun.fireMode).toBe("burst");
    expect(submachineGun.burstSize).toBe(3);
    expect(submachineGun.fireIntervalSeconds).toBeLessThan(
      WEAPON_DEFINITIONS.machineGun.fireIntervalSeconds,
    );
    expect(submachineGun.damage).toBeLessThan(WEAPON_DEFINITIONS.machineGun.damage);
    expect(resolveWeaponBurstSize(submachineGun)).toBe(3);
    expect(resolveWeaponBurstCooldownSeconds(submachineGun)).toBeCloseTo(0.24, 8);
  });

  it("keeps the submachine gun automatic normally and triple-shot with the reticle enabled", () => {
    const submachineGun = WEAPON_DEFINITIONS.submachineGun;
    const automatic = resolveWeaponTriggerProfile(submachineGun, false);
    const tripleShot = resolveWeaponTriggerProfile(submachineGun, true);

    expect(automatic).toEqual({
      burstSize: 1,
      burstCooldownSeconds: submachineGun.fireIntervalSeconds,
      fireMode: "automatic",
      requiresTriggerRelease: false,
    });
    expect(tripleShot).toEqual({
      burstSize: 3,
      burstCooldownSeconds: submachineGun.burstCooldownSeconds,
      fireMode: "burst",
      requiresTriggerRelease: false,
    });
    expect(resolveWeaponTriggerProfile(WEAPON_DEFINITIONS.machineGun, false)).toEqual({
      burstSize: 1,
      burstCooldownSeconds: WEAPON_DEFINITIONS.machineGun.fireIntervalSeconds,
      fireMode: "automatic",
      requiresTriggerRelease: false,
    });
  });

  it("makes the pistol a fast automatic normally and one shot per Caps Lock press", () => {
    const pistol = WEAPON_DEFINITIONS.pistol;
    expect(pistol.fireIntervalSeconds).toBeCloseTo(0.045, 8);
    expect(resolveWeaponTriggerProfile(pistol, false)).toEqual({
      burstSize: 1,
      burstCooldownSeconds: pistol.fireIntervalSeconds,
      fireMode: "automatic",
      requiresTriggerRelease: false,
    });
    expect(resolveWeaponTriggerProfile(pistol, true)).toEqual({
      burstSize: 1,
      burstCooldownSeconds: pistol.fireIntervalSeconds,
      fireMode: "automatic",
      requiresTriggerRelease: true,
    });
    expect(pistol.magazineSize / pistol.fireIntervalSeconds).toBeGreaterThan(20);
  });

  it("keeps the armory chart rows aligned with loaded and reserve ammunition", () => {
    expect(WEAPON_CHART_ENTRIES.map((entry) => entry.id)).toEqual([...WEAPON_IDS]);
    for (const entry of WEAPON_CHART_ENTRIES) {
      const definition = WEAPON_DEFINITIONS[entry.id];
      expect(entry.damagePerBullet).toBe(definition.damage);
      expect(entry.pelletsPerShot).toBe(definition.pellets);
      expect(entry.stoppingPowerPerBullet).toBe(definition.stoppingPowerPerBullet);
      expect(entry.magazineSize).toBe(definition.magazineSize);
      expect(entry.reserveAmmo).toBe(definition.reserveAmmo);
      expect(entry.totalAmmo).toBe(definition.magazineSize + definition.reserveAmmo);
      expect(entry.reloadMode).toBe(definition.reloadMode);
      expect(entry.reloadSeconds).toBe(definition.reloadSeconds);
      expect(entry.burstSize).toBe(definition.burstSize);
      expect(entry.burstCooldownSeconds).toBe(definition.burstCooldownSeconds);
      expect(entry.fireMode).toBe(definition.fireMode);
      expect(entry.scopeMagnification).toBe(definition.scope?.magnification ?? null);
    }
  });

  it("derives bounded stopping power from each projectile's damage", () => {
    expect(resolveWeaponStoppingPower(0)).toBe(0);
    expect(resolveWeaponStoppingPower(16)).toBe(
      16 * WEAPON_STOPPING_POWER_METERS_PER_SECOND_PER_DAMAGE,
    );
    expect(resolveWeaponStoppingPower(100)).toBeCloseTo(6.5, 8);
    expect(resolveWeaponStoppingPower(1_000)).toBe(WEAPON_STOPPING_POWER_MAX_METERS_PER_SECOND);
    expect(resolveWeaponStoppingPower(Number.NaN)).toBe(0);
    expect(resolveWeaponStoppingPower(Number.POSITIVE_INFINITY)).toBe(0);
    expect(resolveWeaponStoppingPower(-12)).toBe(0);
    expect(WEAPON_DEFINITIONS.shotgun.stoppingPowerPerBullet).toBe(
      resolveWeaponStoppingPower(WEAPON_DEFINITIONS.shotgun.damage),
    );
  });

  it("derives clip versus round reloads from total damage per trigger pull", () => {
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.pistol)).toBe("clip");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.machineGun)).toBe("clip");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.shotgun)).toBe("round");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.sniper)).toBe("round");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.carbine)).toBe("clip");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.submachineGun)).toBe("clip");

    expect(WEAPON_DEFINITIONS.pistol.reloadSeconds).toBeCloseTo(28 * 12 * 0.01, 8);
    expect(WEAPON_DEFINITIONS.machineGun.reloadSeconds).toBeCloseTo(12 * 30 * 0.01, 8);
    expect(WEAPON_DEFINITIONS.carbine.reloadSeconds).toBeCloseTo(36 * 18 * 0.01, 8);
    expect(WEAPON_DEFINITIONS.submachineGun.reloadSeconds).toBeCloseTo(9 * 36 * 0.01, 8);
    expect(WEAPON_DEFINITIONS.shotgun.totalDamagePerShot).toBe(16 * 8);
    expect(WEAPON_DEFINITIONS.shotgun.reloadSeconds).toBeCloseTo(16 * 8 * 0.01, 8);
    expect(WEAPON_DEFINITIONS.sniper.reloadSeconds).toBeCloseTo(100 * 0.01, 8);
    expect(resolveWeaponReloadSeconds(WEAPON_DEFINITIONS.sniper)).toBeCloseTo(1, 8);
    expect(resolveWeaponReloadDuration(WEAPON_DEFINITIONS.shotgun, 6)).toBeCloseTo(7.68, 8);
    expect(canInterruptWeaponReload(WEAPON_DEFINITIONS.shotgun, 1)).toBe(true);
    expect(canInterruptWeaponReload(WEAPON_DEFINITIONS.sniper, 1)).toBe(true);
    expect(canInterruptWeaponReload(WEAPON_DEFINITIONS.sniper, 0)).toBe(false);
    expect(canInterruptWeaponReload(WEAPON_DEFINITIONS.pistol, 1)).toBe(false);
  });

  it("scales the local weapon kick from each projectile's damage", () => {
    const recoil = WEAPON_IDS.map((weapon) =>
      resolveWeaponRecoilAmount(WEAPON_DEFINITIONS[weapon].damage),
    );
    expect(recoil[0]!).toBeGreaterThan(recoil[2]!);
    expect(recoil[2]!).toBeGreaterThan(0);
    expect(recoil[1]!).toBeGreaterThan(recoil[2]!);
    expect(recoil[3]!).toBeGreaterThan(recoil[0]!);
  });

  it("gives every weapon a separated front post and open rear notch", () => {
    for (const weapon of WEAPON_IDS) {
      const sight = WEAPON_DEFINITIONS[weapon].ironSight;
      expect(sight.frontZ).toBeLessThan(sight.rearZ);
      expect(sight.frontHeight).toBeGreaterThan(0);
      expect(sight.rearHeight).toBeGreaterThan(0);
      expect(sight.rearNotchWidth).toBeGreaterThan(0);
      expect(sight.rearEarWidth).toBeGreaterThan(0);
      expect(sight.railWidth).toBeGreaterThan(sight.rearNotchWidth);
    }
  });

  it("keeps the sight hardware below a clear crouched sight channel", () => {
    for (const weapon of WEAPON_IDS) {
      const sight = WEAPON_DEFINITIONS[weapon].ironSight;
      expect(sight.frontBaseY + sight.frontHeight).toBeLessThan(0.13);
      expect(sight.rearBaseY + sight.rearHeight).toBeLessThan(0.11);
      expect(sight.railY + sight.railHeight).toBeLessThan(0.09);
    }
  });

  it("keeps ordinary guns on the live aim ray and reserves inherent spread for the shotgun", () => {
    for (const weapon of ["pistol", "machineGun", "sniper", "carbine", "submachineGun"] as const) {
      expect(resolveWeaponSpreadRadians(WEAPON_DEFINITIONS[weapon])).toBe(0);
    }

    const spread = resolveWeaponSpreadRadians(WEAPON_DEFINITIONS.shotgun);

    expect(spread).toBe(WEAPON_DEFINITIONS.shotgun.spreadRadians);
    expect(spread).toBeGreaterThan(0);
  });
});

describe("procedural weapon pickups", () => {
  const reservedRects: readonly WeaponSpawnRect[] = [{ minX: -25, maxX: 25, minZ: -25, maxZ: 25 }];

  it("uses an expanded walk-over pickup range", () => {
    expect(WEAPON_PICKUP_RANGE_METERS).toBe(3.5);
    expect(WEAPON_PICKUP_RANGE_METERS).toBeGreaterThan(2.05);
  });

  it("is deterministic for a room seed and changes with the seed", () => {
    const first = generateWeaponPickups("room-weapon-test", {
      reservedRects,
      worldHalfSize: 80,
    });
    const second = generateWeaponPickups("room-weapon-test", {
      reservedRects,
      worldHalfSize: 80,
    });
    const different = generateWeaponPickups("room-weapon-test-b", {
      reservedRects,
      worldHalfSize: 80,
    });

    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
  });

  it("places every pickup from the seeded full-world placement loop", () => {
    const reservedRect = reservedRects[0];
    if (reservedRect === undefined) {
      throw new Error("Expected one reserved play-area rectangle");
    }
    const pickups = generateWeaponPickups("room-weapon-count", {
      reservedRects,
      worldHalfSize: 80,
      pickupCountPerWeapon: 2,
      minimumDistance: 7,
    });
    expect(pickups).toHaveLength(12);
    expect(pickups[0]?.starter).toBe(true);
    expect(pickups[0]?.weapon).toBe("pistol");
    for (const weapon of WEAPON_IDS) {
      expect(pickups.filter((pickup) => pickup.weapon === weapon)).toHaveLength(2);
    }
    for (const pickup of pickups) {
      expect(pickup.position[0]).toBeGreaterThanOrEqual(-75);
      expect(pickup.position[0]).toBeLessThanOrEqual(75);
      expect(pickup.position[2]).toBeGreaterThanOrEqual(-75);
      expect(pickup.position[2]).toBeLessThanOrEqual(75);
      expect(
        pickup.position[0] < reservedRect.minX ||
          pickup.position[0] > reservedRect.maxX ||
          pickup.position[2] < reservedRect.minZ ||
          pickup.position[2] > reservedRect.maxZ,
      ).toBe(true);
    }
    const occupiedRegions = new Set(
      pickups.map(
        (pickup) =>
          `${pickup.position[0] < 0 ? "west" : "east"}-${pickup.position[2] < 0 ? "south" : "north"}`,
      ),
    );
    expect(occupiedRegions.size).toBe(4);
  });

  it("uses a dense map-wide default population", () => {
    const pickups = generateWeaponPickups("room-weapon-dense-default", {
      reservedRects,
      worldHalfSize: 120,
      minimumDistance: 7,
    });

    expect(pickups).toHaveLength(144);
    for (const weapon of WEAPON_IDS) {
      expect(pickups.filter((pickup) => pickup.weapon === weapon)).toHaveLength(24);
    }
    expect(
      new Set(
        pickups.map(
          (pickup) =>
            `${pickup.position[0] < 0 ? "west" : "east"}-${pickup.position[2] < 0 ? "south" : "north"}`,
        ),
      ).size,
    ).toBe(4);
  });

  it("caps the default compact-map spawn at one gun per 75 m radius", () => {
    const pickups = generateWeaponPickups("room-weapon-sparse-default", {
      reservedRects,
      worldHalfSize: 125,
    });

    expect(pickups.length).toBeGreaterThan(0);
    expect(pickups.length).toBeLessThan(144);
    for (let firstIndex = 0; firstIndex < pickups.length; firstIndex += 1) {
      const first = pickups[firstIndex];
      if (first === undefined) {
        continue;
      }
      for (let secondIndex = firstIndex + 1; secondIndex < pickups.length; secondIndex += 1) {
        const second = pickups[secondIndex];
        if (second === undefined) {
          continue;
        }
        const dx = first.position[0] - second.position[0];
        const dz = first.position[2] - second.position[2];
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(WEAPON_MINIMUM_SPAWN_DISTANCE_METERS);
      }
    }
  });

  it("keeps pickups clear of rotated coarse obstacles", () => {
    const pickups = generateWeaponPickups("room-weapon-obstacles", {
      worldHalfSize: 70,
      pickupCountPerWeapon: 2,
      minimumDistance: 7,
      obstacles: [
        {
          center: { x: 0, y: 2, z: 40 },
          halfExtents: { x: 12, y: 2, z: 3 },
          rotationY: Math.PI / 4,
        },
      ],
    });
    for (const pickup of pickups) {
      const dx = pickup.position[0];
      const dz = pickup.position[2] - 40;
      const localX = dx * Math.cos(Math.PI / 4) + dz * Math.sin(Math.PI / 4);
      const localZ = -dx * Math.sin(Math.PI / 4) + dz * Math.cos(Math.PI / 4);
      expect(Math.abs(localX) > 12.9 || Math.abs(localZ) > 3.9).toBe(true);
    }
  });
});

describe("generic reload view-model pose", () => {
  it("swiftly lifts, keeps the reload work raised, then swiftly recentres", () => {
    const start = resolveWeaponReloadPose(0, 1);
    const lift = resolveWeaponReloadPose(0.05, 1);
    const skyward = resolveWeaponReloadPose(0.1, 1);
    const clipChange = resolveWeaponReloadPose(0.48, 1);
    const returnPhase = resolveWeaponReloadPose(0.95, 1);
    const center = resolveWeaponReloadPose(1, 1);

    expect(start.skyAmount).toBe(0);
    expect(start.pitchRadians).toBe(0);
    expect(lift.skyAmount).toBeGreaterThan(0.8);
    expect(skyward.skyAmount).toBe(1);
    expect(skyward.pitchRadians).toBeCloseTo(WEAPON_RELOAD_SKY_PITCH_RADIANS, 8);
    expect(clipChange.skyAmount).toBe(1);
    expect(Math.abs(clipChange.rollRadians)).toBeGreaterThan(0);
    expect(Math.abs(clipChange.lateralOffset)).toBeGreaterThan(0);
    expect(returnPhase.skyAmount).toBeGreaterThan(0);
    expect(returnPhase.skyAmount).toBeLessThan(0.5);
    expect(center.skyAmount).toBe(0);
    expect(center.pitchRadians).toBe(0);
  });

  it("normalizes the same pose across different reload durations", () => {
    const pistolPose = resolveWeaponReloadPose(
      0.34 * WEAPON_DEFINITIONS.pistol.reloadSeconds,
      WEAPON_DEFINITIONS.pistol.reloadSeconds,
    );
    const sniperPose = resolveWeaponReloadPose(
      0.34 * WEAPON_DEFINITIONS.sniper.reloadSeconds,
      WEAPON_DEFINITIONS.sniper.reloadSeconds,
    );

    expect(sniperPose).toEqual(pistolPose);
  });
});

describe("round reload view-model pose", () => {
  it("stays raised between chambered rounds and only recentres after interruption", () => {
    const lift = resolveWeaponRoundReloadPose(0.05, 1);
    const betweenRounds = resolveWeaponRoundReloadPose(0.45, 1);
    const lateReload = resolveWeaponRoundReloadPose(0.95, 1);
    const interruptedStart = resolveWeaponRoundReloadPose(0, 1, 0);
    const interrupted = resolveWeaponRoundReloadPose(0, 1, 0.05);
    const centred = resolveWeaponRoundReloadPose(0, 1, 0.1);

    expect(lift.skyAmount).toBeGreaterThan(0.8);
    expect(betweenRounds.skyAmount).toBe(1);
    expect(lateReload.skyAmount).toBe(1);
    expect(interruptedStart.skyAmount).toBe(1);
    expect(interrupted.skyAmount).toBeLessThan(0.5);
    expect(centred.skyAmount).toBe(0);
  });

  it("adds a brief upward impulse when a round or clip insertion completes", () => {
    const idle = resolveWeaponReloadPose(1, 1);
    const inserted = resolveWeaponReloadPose(1, 1, { insertionImpulseElapsedSeconds: 0 });
    const expiredLeadIn = resolveWeaponReloadPose(1, 1, {
      insertionImpulseElapsedSeconds: WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS + 0.01,
    });
    const roundInserted = resolveWeaponRoundReloadPose(0.4, 1, null, 0);

    expect(resolveWeaponReloadInsertionImpulse(0)).toBe(1);
    expect(resolveWeaponReloadInsertionImpulse(WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS)).toBe(
      0,
    );
    expect(inserted.verticalOffset).toBeGreaterThan(idle.verticalOffset);
    expect(inserted.pitchRadians).toBeGreaterThan(idle.pitchRadians);
    expect(expiredLeadIn).toEqual(idle);
    expect(roundInserted.verticalOffset).toBeGreaterThan(
      resolveWeaponRoundReloadPose(0.4, 1).verticalOffset,
    );
  });
});

describe("shot effect lifetimes", () => {
  it("keeps tracers visible briefly and fades bullet holes only at the end of five minutes", () => {
    expect(WEAPON_TRACER_LIFETIME_SECONDS).toBeGreaterThan(0.1);
    expect(WEAPON_BULLET_HOLE_LIFETIME_SECONDS).toBe(300);
    expect(WEAPON_BULLET_HOLE_FADE_SECONDS).toBeLessThan(WEAPON_BULLET_HOLE_LIFETIME_SECONDS);
    expect(resolveWeaponEffectOpacity("tracer", WEAPON_TRACER_LIFETIME_SECONDS)).toBe(1);
    expect(resolveWeaponEffectOpacity("tracer", 0)).toBe(0);
    expect(resolveWeaponEffectOpacity("shieldSpark", WEAPON_SHIELD_SPARK_LIFETIME_SECONDS)).toBe(1);
    expect(resolveWeaponEffectOpacity("shieldSpark", 0)).toBe(0);
    expect(resolveWeaponEffectOpacity("bulletHole", WEAPON_BULLET_HOLE_LIFETIME_SECONDS)).toBe(1);
    expect(
      resolveWeaponEffectOpacity("bulletHole", WEAPON_BULLET_HOLE_FADE_SECONDS / 2),
    ).toBeCloseTo(0.5, 8);
    expect(resolveWeaponEffectOpacity("bulletHole", 0)).toBe(0);
    expect(WEAPON_BULLET_HOLE_MAX_COUNT).toBeGreaterThan(0);
  });

  it("scales simulant blood by projectile damage and smears it with target speed", () => {
    expect(WEAPON_BLOOD_CLOUD_LIFETIME_SECONDS).toBeGreaterThan(0.5);
    expect(WEAPON_BLOOD_DECAL_LIFETIME_SECONDS).toBeGreaterThan(WEAPON_BLOOD_DECAL_FADE_SECONDS);
    expect(resolveWeaponBloodCloudScale(9)).toBe(WEAPON_BLOOD_CLOUD_MIN_SCALE);
    expect(resolveWeaponBloodCloudScale(100)).toBe(WEAPON_BLOOD_CLOUD_MAX_SCALE);
    expect(resolveWeaponBloodCloudScale(100)).toBeGreaterThan(resolveWeaponBloodCloudScale(12));
    expect(resolveWeaponBloodCloudScale(Number.NaN)).toBe(WEAPON_BLOOD_CLOUD_MIN_SCALE);
    expect(resolveWeaponBloodSmearRatio(0)).toBe(0);
    expect(resolveWeaponBloodSmearRatio(3.2)).toBe(1);
    expect(resolveWeaponBloodSmearRatio(8)).toBe(1);
    expect(WEAPON_BLOOD_CLOUD_PARTICLE_COUNT).toBe(1);
    expect(WEAPON_BLOOD_CLOUD_OPACITY).toBeLessThan(0.5);
    expect(WEAPON_BLOOD_SPLAT_OPACITY).toBeLessThan(0.5);
    expect(WEAPON_BLOOD_CLOUD_COLOR).toBeLessThan(0x800000);
    expect(WEAPON_BLOOD_SPLAT_COLOR).toBeLessThan(0x800000);
    expect(resolveWeaponBloodEligibility(100, 12)).toBe(false);
    expect(resolveWeaponBloodEligibility(0, 12)).toBe(true);
    expect(resolveWeaponBloodEligibility(-1, 12)).toBe(true);
    expect(resolveWeaponBloodEligibility(0, 0)).toBe(false);
    expect(resolveWeaponShieldHit(12)).toBe(true);
    expect(resolveWeaponShieldHit(0)).toBe(false);
    expect(resolveWeaponShieldHit(Number.NaN)).toBe(false);
    expect(WEAPON_SHIELD_SPARK_LIFETIME_SECONDS).toBeGreaterThan(0);
    expect(WEAPON_SHIELD_SPARK_OPACITY).toBeLessThanOrEqual(1);
    expect(WEAPON_SHIELD_SPARK_COLOR).toBeGreaterThan(0x80ffff);
  });
});

describe("gunshot smoke lifecycle", () => {
  it("keeps two short-lived puffs and uses inverse logarithmic dispersion", () => {
    expect(WEAPON_MUZZLE_SMOKE_PARTICLE_COUNT).toBe(2);
    expect(WEAPON_MUZZLE_SMOKE_LIFETIME_SECONDS).toBe(1);
    expect(resolveWeaponMuzzleSmokeLogProgress(0)).toBe(0);
    expect(resolveWeaponMuzzleSmokeLogProgress(0.1)).toBeGreaterThan(0.1);
    expect(resolveWeaponMuzzleSmokeLogProgress(1)).toBe(1);
    expect(resolveWeaponMuzzleSmokeLogProgress(2)).toBe(1);
    expect(resolveWeaponMuzzleSmokeOpacity(0)).toBe(1);
    expect(resolveWeaponMuzzleSmokeOpacity(0.5)).toBeLessThan(0.5);
    expect(resolveWeaponMuzzleSmokeOpacity(1)).toBe(0);
    expect(resolveWeaponMuzzleSmokeOpacity(Number.NaN)).toBe(1);
  });
});

describe("muzzle flash point light", () => {
  it("fades the held-muzzle light from full energy to disabled", () => {
    expect(WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS).toBeGreaterThan(0);
    expect(WEAPON_MUZZLE_FLASH_LIGHT_INTENSITY).toBe(32);
    expect(WEAPON_MUZZLE_FLASH_LIGHT_DISTANCE).toBe(7.5);
    expect(WEAPON_MUZZLE_FLASH_LIGHT_DECAY).toBeGreaterThanOrEqual(2);
    expect(resolveWeaponMuzzleFlashLightRatio(WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS)).toBe(1);
    expect(resolveWeaponMuzzleFlashLightRatio(WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS / 2)).toBe(0.25);
    expect(resolveWeaponMuzzleFlashLightRatio(0)).toBe(0);
    expect(resolveWeaponMuzzleFlashLightRatio(-1)).toBe(0);
    expect(resolveWeaponMuzzleFlashLightRatio(Number.NaN)).toBe(0);
    expect(resolveWeaponMuzzleFlashLightRatio(WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS * 2)).toBe(1);
  });
});

describe("damage-driven shot audio", () => {
  it("derives the layered gunshot profile from damage and barrel length", () => {
    expect(WEAPON_SHOT_SOUND_WAVEFORM).toBe("whiteNoise");
    const light = resolveGunAudioProfile({
      damage: GUN_AUDIO_MIN_DAMAGE,
      barrelLength: GUN_AUDIO_MIN_BARREL_LENGTH_METERS,
    });
    const heavy = resolveGunAudioProfile({
      damage: GUN_AUDIO_MAX_DAMAGE,
      barrelLength: GUN_AUDIO_MAX_BARREL_LENGTH_METERS,
    });
    expect(light.damagePitch).toBeGreaterThan(heavy.damagePitch);
    expect(light.damageVolume).toBeLessThan(heavy.damageVolume);
    expect(light.muzzleCutoffFrequencyHz).toBeGreaterThan(heavy.muzzleCutoffFrequencyHz);
    expect(light.crackVolume).toBeGreaterThan(heavy.crackVolume);
    expect(light.tailDurationSeconds).toBeLessThan(heavy.tailDurationSeconds);
    expect(light.tailCutoffFrequencyHz).toBeGreaterThan(heavy.tailCutoffFrequencyHz);
    expect(light.bulletSpeedMetersPerSecond).toBeLessThan(343);
    expect(heavy.bulletSpeedMetersPerSecond).toBeGreaterThan(light.bulletSpeedMetersPerSecond);
    expect(heavy.bulletSpeedMetersPerSecond).toBeGreaterThan(343);
    expect(
      resolveGunAudioProfile({
        damage: GUN_AUDIO_MIN_DAMAGE,
        barrelLength: GUN_AUDIO_MAX_BARREL_LENGTH_METERS,
      }).bulletSpeedMetersPerSecond,
    ).toBeGreaterThan(light.bulletSpeedMetersPerSecond);
    expect(resolveGunAudioProfile({ damage: Number.NaN, barrelLength: Number.NaN })).toEqual(
      resolveGunAudioProfile({
        damage: GUN_AUDIO_MIN_DAMAGE,
        barrelLength: GUN_AUDIO_MIN_BARREL_LENGTH_METERS,
      }),
    );
  });

  it("returns the exact same profile for identical parameters", () => {
    const parameters = { damage: 50, barrelLength: 0.8 } as const;
    expect(resolveGunAudioProfile(parameters)).toEqual(resolveGunAudioProfile(parameters));
  });
});

describe("proximity weapon audio", () => {
  it("fades every sound layer from the listener to the audible range", () => {
    expect(WEAPON_AUDIO_REFERENCE_DISTANCE_METERS).toBeGreaterThan(0);
    expect(WEAPON_AUDIO_MAX_DISTANCE_METERS).toBeGreaterThan(
      WEAPON_AUDIO_REFERENCE_DISTANCE_METERS,
    );
    expect(WEAPON_AUDIO_ROLLOFF_FACTOR).toBeGreaterThan(0);
    expect(resolveWeaponAudioProximity(0)).toBe(1);
    expect(resolveWeaponAudioProximity(2)).toBeLessThan(resolveWeaponAudioProximity(1));
    expect(resolveWeaponAudioProximity(WEAPON_AUDIO_MAX_DISTANCE_METERS)).toBe(0);
    expect(resolveWeaponAudioProximity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parametric bullet impact audio", () => {
  it("maps projectile strength and incidence angle to distinct impact layers", () => {
    const lightDirect = resolveBulletImpactAudioProfile({
      damage: BULLET_IMPACT_AUDIO_MIN_DAMAGE,
      impactAngleRadians: 0,
    });
    const heavyDirect = resolveBulletImpactAudioProfile({
      damage: BULLET_IMPACT_AUDIO_MAX_DAMAGE,
      impactAngleRadians: 0,
    });
    const heavyGrazing = resolveBulletImpactAudioProfile({
      damage: BULLET_IMPACT_AUDIO_MAX_DAMAGE,
      impactAngleRadians: BULLET_IMPACT_AUDIO_MAX_ANGLE_RADIANS,
    });

    expect(heavyDirect.impactNoiseGain).toBeGreaterThan(lightDirect.impactNoiseGain);
    expect(heavyDirect.impactDurationSeconds).toBeGreaterThan(lightDirect.impactDurationSeconds);
    expect(heavyDirect.impactNoiseCutoffFrequencyHz).toBeLessThan(
      lightDirect.impactNoiseCutoffFrequencyHz,
    );
    expect(heavyGrazing.glancingNoiseGain).toBeGreaterThan(heavyDirect.glancingNoiseGain);
    expect(heavyGrazing.impactNoisePlaybackRate).toBeGreaterThan(
      heavyDirect.impactNoisePlaybackRate,
    );
    expect(heavyGrazing.impactToneFrequencyHz).toBeGreaterThan(heavyDirect.impactToneFrequencyHz);
    expect(heavyGrazing.glancingNoiseCenterFrequencyHz).toBeGreaterThan(
      heavyDirect.glancingNoiseCenterFrequencyHz,
    );
  });

  it("normalizes acute angles and non-finite profile inputs deterministically", () => {
    expect(resolveBulletImpactAngleRadians(-1)).toBeCloseTo(0, 10);
    expect(resolveBulletImpactAngleRadians(0)).toBeCloseTo(Math.PI / 2, 10);
    expect(resolveBulletImpactAngleRadians(1)).toBeCloseTo(0, 10);
    expect(resolveBulletImpactAngleRadians(Number.NaN)).toBe(0);
    expect(
      resolveBulletImpactAudioProfile({
        damage: BULLET_IMPACT_AUDIO_MAX_DAMAGE,
        impactAngleRadians: 99,
      }),
    ).toEqual(
      resolveBulletImpactAudioProfile({
        damage: BULLET_IMPACT_AUDIO_MAX_DAMAGE,
        impactAngleRadians: BULLET_IMPACT_AUDIO_MAX_ANGLE_RADIANS,
      }),
    );
    expect(
      resolveBulletImpactAudioProfile({ damage: Number.NaN, impactAngleRadians: Number.NaN }),
    ).toEqual(
      resolveBulletImpactAudioProfile({
        damage: BULLET_IMPACT_AUDIO_MIN_DAMAGE,
        impactAngleRadians: 0,
      }),
    );
  });
});

describe("damage-driven barrel temperature", () => {
  it("uses Celsius thresholds and exponential Newton cooling", () => {
    expect(WEAPON_BARREL_AMBIENT_TEMPERATURE_C).toBe(20);
    expect(WEAPON_BARREL_GLOW_TEMPERATURE_C).toBe(500);
    expect(WEAPON_BARREL_RED_HOT_TEMPERATURE_C).toBe(800);
    expect(WEAPON_BARREL_HEAT_CELSIUS_PER_DAMAGE).toBe(0.25);
    expect(WEAPON_BARREL_COOLING_COEFFICIENT_PER_SECOND).toBe(0.003);

    expect(resolveWeaponBarrelTemperatureC(WEAPON_BARREL_AMBIENT_TEMPERATURE_C, 0)).toBe(20);
    expect(resolveWeaponBarrelGlowRatio(WEAPON_BARREL_AMBIENT_TEMPERATURE_C)).toBe(0);
    expect(resolveWeaponBarrelGlowRatio(WEAPON_BARREL_GLOW_TEMPERATURE_C)).toBe(0);
    expect(resolveWeaponBarrelGlowRatio(650)).toBeCloseTo(0.5, 8);
    expect(resolveWeaponBarrelGlowRatio(WEAPON_BARREL_RED_HOT_TEMPERATURE_C)).toBe(1);
    expect(resolveWeaponBarrelGlowRatio(800)).toBe(1);

    const cooledTemperature = resolveWeaponBarrelTemperatureC(
      WEAPON_BARREL_RED_HOT_TEMPERATURE_C,
      0,
      10,
    );
    expect(cooledTemperature).toBeCloseTo(
      WEAPON_BARREL_AMBIENT_TEMPERATURE_C +
        (WEAPON_BARREL_RED_HOT_TEMPERATURE_C - WEAPON_BARREL_AMBIENT_TEMPERATURE_C) *
          Math.exp(-WEAPON_BARREL_COOLING_COEFFICIENT_PER_SECOND * 10),
      8,
    );
    expect(cooledTemperature).toBeGreaterThan(WEAPON_BARREL_AMBIENT_TEMPERATURE_C);
  });

  it("adds each hit pellet's damage while misses add nothing", () => {
    const shotgunPelletDamage = 16;
    const afterMiss = resolveWeaponBarrelTemperatureC(WEAPON_BARREL_AMBIENT_TEMPERATURE_C, 0);
    const afterEightPelletHits = Array.from({ length: 8 }).reduce<number>(
      (temperatureC: number) => resolveWeaponBarrelTemperatureC(temperatureC, shotgunPelletDamage),
      afterMiss,
    );

    expect(afterMiss).toBe(WEAPON_BARREL_AMBIENT_TEMPERATURE_C);
    expect(afterEightPelletHits).toBe(WEAPON_BARREL_AMBIENT_TEMPERATURE_C + 32);
  });

  it("keeps seven 100-damage sniper hits below the glow threshold", () => {
    const sniperDamage = WEAPON_DEFINITIONS.sniper.damage;
    const afterSevenRounds = Array.from({ length: 7 }).reduce<number>(
      (temperatureC: number) => resolveWeaponBarrelTemperatureC(temperatureC, sniperDamage),
      WEAPON_BARREL_AMBIENT_TEMPERATURE_C,
    );

    expect(sniperDamage).toBe(100);
    expect(afterSevenRounds).toBe(195);
    expect(afterSevenRounds).toBeLessThan(WEAPON_BARREL_GLOW_TEMPERATURE_C);
    expect(resolveWeaponBarrelGlowRatio(afterSevenRounds)).toBe(0);
  });

  it("reaches the glow and maximum thresholds only after the scaled sniper heat load", () => {
    const sniperDamage = WEAPON_DEFINITIONS.sniper.damage;
    const afterTwentyRounds = Array.from({ length: 20 }).reduce<number>(
      (temperatureC: number) => resolveWeaponBarrelTemperatureC(temperatureC, sniperDamage),
      WEAPON_BARREL_AMBIENT_TEMPERATURE_C,
    );
    const afterThirtyTwoRounds = Array.from({ length: 32 }).reduce<number>(
      (temperatureC: number) => resolveWeaponBarrelTemperatureC(temperatureC, sniperDamage),
      WEAPON_BARREL_AMBIENT_TEMPERATURE_C,
    );

    expect(afterTwentyRounds).toBe(520);
    expect(afterTwentyRounds).toBeGreaterThan(WEAPON_BARREL_GLOW_TEMPERATURE_C);
    expect(afterThirtyTwoRounds).toBe(820);
    expect(resolveWeaponBarrelGlowRatio(afterThirtyTwoRounds)).toBe(1);
  });

  it("keeps thermal smoke off cool barrels and eases it into the full rate", () => {
    expect(resolveWeaponBarrelSmokeRatio(0)).toBe(0);
    expect(resolveWeaponBarrelSmokeRatio(WEAPON_BARREL_SMOKE_START_HEAT_RATIO)).toBe(0);
    expect(resolveWeaponBarrelSmokeRatio(WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO)).toBe(1);
    expect(resolveWeaponBarrelSmokeRatio(1)).toBe(1);
    expect(resolveWeaponBarrelSmokeRatio(0.575)).toBeCloseTo(0.5, 8);
    expect(resolveWeaponBarrelSmokeRatio(Number.NaN)).toBe(0);
  });

  it("returns smoke to the pool when it is visually clear", () => {
    expect(shouldClearWeaponSmoke(1, 0, 5)).toBe(false);
    expect(shouldClearWeaponSmoke(0, 0.1, 5, 0.24)).toBe(false);
    expect(shouldClearWeaponSmoke(WEAPON_SMOKE_CLEAR_OPACITY_THRESHOLD, 0.24, 5, 0.24)).toBe(true);
    expect(shouldClearWeaponSmoke(0.25, 5, 5)).toBe(true);
    expect(shouldClearWeaponSmoke(Number.NaN, 0, 5)).toBe(true);
  });
});
