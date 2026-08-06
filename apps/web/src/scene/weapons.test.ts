import { describe, expect, it } from "vitest";

import {
  generateWeaponPickups,
  canInterruptWeaponReload,
  resolveWeaponEffectOpacity,
  resolveWeaponReloadDuration,
  resolveWeaponReloadMode,
  resolveWeaponReloadPose,
  resolveWeaponReloadInsertionImpulse,
  resolveWeaponRoundReloadPose,
  resolveWeaponReloadSeconds,
  resolveWeaponRecoilAmount,
  resolveWeaponHotkey,
  WEAPON_DEFINITIONS,
  WEAPON_CHART_ENTRIES,
  WEAPON_IDS,
  WEAPON_BULLET_HOLE_FADE_SECONDS,
  WEAPON_BULLET_HOLE_LIFETIME_SECONDS,
  WEAPON_BULLET_HOLE_MAX_COUNT,
  WEAPON_BARREL_HEAT_COOLDOWN_DAMAGE_PER_SECOND,
  WEAPON_BARREL_HEAT_COOLDOWN_SECONDS,
  WEAPON_BARREL_HEAT_DAMAGE_THRESHOLD,
  WEAPON_BARREL_HEAT_MAX_SATURATION_SECONDS,
  WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO,
  WEAPON_BARREL_SMOKE_START_HEAT_RATIO,
  WEAPON_PICKUP_RANGE_METERS,
  WEAPON_RELOAD_SKY_PITCH_RADIANS,
  WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS,
  WEAPON_TRACER_LIFETIME_SECONDS,
  resolveWeaponSpreadRadians,
  resolveWeaponBarrelCooldownSeconds,
  resolveWeaponBarrelHeatDamage,
  resolveWeaponBarrelHeatRatio,
  resolveWeaponBarrelSmokeRatio,
  type WeaponSpawnRect,
} from "./weapons.js";

describe("weapon definitions", () => {
  it("maps number-row weapon keys and reserves zero for an empty hand", () => {
    expect(resolveWeaponHotkey("Digit0")).toBeNull();
    expect(resolveWeaponHotkey("Digit1")).toBe("pistol");
    expect(resolveWeaponHotkey("Digit4")).toBe("sniper");
    expect(resolveWeaponHotkey("Digit5")).toBeUndefined();
    expect(resolveWeaponHotkey("Numpad0")).toBeUndefined();
  });

  it("contains the four playable weapon profiles", () => {
    expect(WEAPON_IDS).toEqual(["pistol", "shotgun", "machineGun", "sniper"]);
    for (const weapon of WEAPON_IDS) {
      const definition = WEAPON_DEFINITIONS[weapon];
      expect(definition.magazineSize).toBeGreaterThan(0);
      expect(definition.reserveAmmo).toBeGreaterThan(definition.magazineSize);
      expect(definition.pellets).toBeGreaterThan(0);
      expect(definition.fireIntervalSeconds).toBeGreaterThan(0);
      expect("range" in definition).toBe(false);
    }
  });

  it("keeps the armory chart rows aligned with loaded and reserve ammunition", () => {
    expect(WEAPON_CHART_ENTRIES.map((entry) => entry.id)).toEqual([...WEAPON_IDS]);
    for (const entry of WEAPON_CHART_ENTRIES) {
      const definition = WEAPON_DEFINITIONS[entry.id];
      expect(entry.damagePerBullet).toBe(definition.damage);
      expect(entry.pelletsPerShot).toBe(definition.pellets);
      expect(entry.magazineSize).toBe(definition.magazineSize);
      expect(entry.reserveAmmo).toBe(definition.reserveAmmo);
      expect(entry.totalAmmo).toBe(definition.magazineSize + definition.reserveAmmo);
      expect(entry.reloadMode).toBe(definition.reloadMode);
      expect(entry.reloadSeconds).toBe(definition.reloadSeconds);
    }
  });

  it("derives clip versus round reloads from total damage per trigger pull", () => {
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.pistol)).toBe("clip");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.machineGun)).toBe("clip");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.shotgun)).toBe("round");
    expect(resolveWeaponReloadMode(WEAPON_DEFINITIONS.sniper)).toBe("round");

    expect(WEAPON_DEFINITIONS.pistol.reloadSeconds).toBeCloseTo(28 * 12 * 0.01, 8);
    expect(WEAPON_DEFINITIONS.machineGun.reloadSeconds).toBeCloseTo(12 * 30 * 0.01, 8);
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
    for (const weapon of ["pistol", "machineGun", "sniper"] as const) {
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

  it("includes a table-side set and an even outdoor spread", () => {
    const reservedRect = reservedRects[0];
    if (reservedRect === undefined) {
      throw new Error("Expected one reserved play-area rectangle");
    }
    const pickups = generateWeaponPickups("room-weapon-count", {
      reservedRects,
      worldHalfSize: 80,
      pickupCountPerWeapon: 2,
    });
    expect(pickups).toHaveLength(9);
    expect(pickups[0]?.starter).toBe(true);
    expect(pickups[0]?.weapon).toBe("pistol");
    const tableSidePickups = pickups.filter((pickup) => pickup.nearTable === true);
    expect(tableSidePickups).toHaveLength(4);
    expect(tableSidePickups.map((pickup) => pickup.weapon)).toEqual([
      "pistol",
      "shotgun",
      "machineGun",
      "sniper",
    ]);
    for (const pickup of tableSidePickups) {
      expect(Math.hypot(pickup.position[0], pickup.position[2])).toBeLessThan(5);
    }
    for (const weapon of WEAPON_IDS) {
      expect(pickups.filter((pickup) => pickup.weapon === weapon)).toHaveLength(
        weapon === "pistol" ? 3 : 2,
      );
    }
    for (const pickup of pickups.filter((entry) => entry.nearTable !== true)) {
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
  });

  it("keeps pickups clear of rotated coarse obstacles", () => {
    const pickups = generateWeaponPickups("room-weapon-obstacles", {
      worldHalfSize: 70,
      pickupCountPerWeapon: 2,
      obstacles: [
        {
          center: { x: 0, y: 2, z: 40 },
          halfExtents: { x: 12, y: 2, z: 3 },
          rotationY: Math.PI / 4,
        },
      ],
    });
    for (const pickup of pickups.slice(1)) {
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
    const roundInserted = resolveWeaponRoundReloadPose(0.4, 1, null, 0);

    expect(resolveWeaponReloadInsertionImpulse(0)).toBe(1);
    expect(resolveWeaponReloadInsertionImpulse(WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS)).toBe(
      0,
    );
    expect(inserted.verticalOffset).toBeGreaterThan(idle.verticalOffset);
    expect(inserted.pitchRadians).toBeGreaterThan(idle.pitchRadians);
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
    expect(resolveWeaponEffectOpacity("bulletHole", WEAPON_BULLET_HOLE_LIFETIME_SECONDS)).toBe(1);
    expect(
      resolveWeaponEffectOpacity("bulletHole", WEAPON_BULLET_HOLE_FADE_SECONDS / 2),
    ).toBeCloseTo(0.5, 8);
    expect(resolveWeaponEffectOpacity("bulletHole", 0)).toBe(0);
    expect(WEAPON_BULLET_HOLE_MAX_COUNT).toBeGreaterThan(0);
  });
});

describe("damage-driven barrel heat", () => {
  it("uses hit damage, reaches red-hot at 500, and cools linearly", () => {
    expect(WEAPON_BARREL_HEAT_DAMAGE_THRESHOLD).toBe(500);
    expect(WEAPON_BARREL_HEAT_MAX_SATURATION_SECONDS).toBe(30);
    expect(WEAPON_BARREL_HEAT_COOLDOWN_SECONDS).toBe(30);
    expect(WEAPON_BARREL_HEAT_COOLDOWN_DAMAGE_PER_SECOND).toBeCloseTo(500 / 30, 8);

    expect(resolveWeaponBarrelHeatDamage(0, 500)).toBe(500);
    expect(resolveWeaponBarrelHeatRatio(500)).toBe(1);
    expect(resolveWeaponBarrelHeatRatio(250)).toBeCloseTo(0.5, 8);
    expect(resolveWeaponBarrelCooldownSeconds(100)).toBeCloseTo(6, 8);
    expect(resolveWeaponBarrelCooldownSeconds(600)).toBeCloseTo(36, 8);
    expect(resolveWeaponBarrelHeatDamage(250, 0, 25)).toBeCloseTo(0, 8);
    expect(resolveWeaponBarrelHeatDamage(500, 0, 30)).toBeCloseTo(0, 8);
  });

  it("adds each hit pellet's damage while misses add nothing", () => {
    const shotgunPelletDamage = 16;
    const afterMiss = resolveWeaponBarrelHeatDamage(0, 0);
    const afterEightPelletHits = Array.from({ length: 8 }).reduce<number>(
      (heat: number) => resolveWeaponBarrelHeatDamage(heat, shotgunPelletDamage),
      afterMiss,
    );

    expect(afterMiss).toBe(0);
    expect(afterEightPelletHits).toBe(128);
  });

  it("keeps thermal smoke off cool barrels and eases it into the full rate", () => {
    expect(resolveWeaponBarrelSmokeRatio(0)).toBe(0);
    expect(resolveWeaponBarrelSmokeRatio(WEAPON_BARREL_SMOKE_START_HEAT_RATIO)).toBe(0);
    expect(resolveWeaponBarrelSmokeRatio(WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO)).toBe(1);
    expect(resolveWeaponBarrelSmokeRatio(1)).toBe(1);
    expect(resolveWeaponBarrelSmokeRatio(0.575)).toBeCloseTo(0.5, 8);
    expect(resolveWeaponBarrelSmokeRatio(Number.NaN)).toBe(0);
  });
});
