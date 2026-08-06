import { describe, expect, it } from "vitest";

import {
  generateWeaponPickups,
  resolveWeaponEffectOpacity,
  resolveWeaponReloadPose,
  resolveWeaponRecoilAmount,
  resolveWeaponHotkey,
  WEAPON_DEFINITIONS,
  WEAPON_IDS,
  WEAPON_BULLET_HOLE_FADE_SECONDS,
  WEAPON_BULLET_HOLE_LIFETIME_SECONDS,
  WEAPON_BULLET_HOLE_MAX_COUNT,
  WEAPON_PICKUP_RANGE_METERS,
  WEAPON_RELOAD_SKY_PITCH_RADIANS,
  WEAPON_TRACER_LIFETIME_SECONDS,
  resolveWeaponSpreadRadians,
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
      expect(definition.range).toBeGreaterThan(0);
    }
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
  it("snaps skyward, holds the clip-change beat, then returns to center", () => {
    const start = resolveWeaponReloadPose(0, 1);
    const skyward = resolveWeaponReloadPose(0.2, 1);
    const clipChange = resolveWeaponReloadPose(0.34, 1);
    const center = resolveWeaponReloadPose(1, 1);

    expect(start.skyAmount).toBe(0);
    expect(start.pitchRadians).toBe(0);
    expect(skyward.skyAmount).toBe(1);
    expect(skyward.pitchRadians).toBeCloseTo(WEAPON_RELOAD_SKY_PITCH_RADIANS, 8);
    expect(clipChange.skyAmount).toBe(1);
    expect(Math.abs(clipChange.rollRadians)).toBeGreaterThan(0);
    expect(Math.abs(clipChange.lateralOffset)).toBeGreaterThan(0);
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
