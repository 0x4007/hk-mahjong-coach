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
  WEAPON_SPAWN_DENSITY_RADIUS_METERS,
  WEAPON_RELOAD_SKY_PITCH_RADIANS,
  WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS,
  WEAPON_TRACER_LIFETIME_SECONDS,
  resolveWeaponSpreadRadians,
  resolveWeaponBarrelCooldownSeconds,
  resolveWeaponBarrelHeatDamage,
  resolveWeaponBarrelHeatRatio,
  resolveWeaponBarrelSmokeRatio,
  resolveWeaponGenerationStream,
  resolveWeaponNameGenerationStream,
  resolveGeneratedGunNameV1,
  generateGunProfileV1,
  generateGunProfileWithReceiptV1,
  generateHeavyTurretGunProfileV1,
  generateParametricGunCatalogV1,
  generateParametricGunPickupsV1,
  DEFAULT_PARAMETRIC_GUN_SMG_COUNT,
  filterGunProfilesParetoV1,
  resolveGunSpreadRadiansV1,
  createGunPlaytestTelemetryV1,
  recordGunPlaytestTelemetryEventV1,
  validateGunTradeoffsV1,
  resolveGunProfileV1,
  createGunInstance,
  createEmptyWeaponStateSnapshot,
  DEFAULT_GUN_SLOT_COUNT,
  findFirstFreeGunSlot,
  insertGunIntoFirstFreeSlot,
  clearGunInventorySlot,
  resolveGunThrowVelocityV1,
  GUN_PROFILES,
  type WeaponSpawnRect,
} from "./weapons.js";

describe("weapon definitions", () => {
  it("maps number-row weapon keys and reserves zero for an empty hand", () => {
    expect(resolveWeaponHotkey("Digit0")).toBeNull();
    expect(resolveWeaponHotkey("Digit1")).toBe(0);
    expect(resolveWeaponHotkey("Digit4")).toBe(3);
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

describe("generic parametric gun profiles", () => {
  it("uses the versioned generation stream and stable profile hashes", () => {
    expect(resolveWeaponGenerationStream("room-a", "seed-7")).toBe(
      "room-a|weapons|generation|v1|seed-7",
    );
    expect(resolveWeaponNameGenerationStream("room-a", "seed-7")).toBe(
      "room-a|weapons|name|v1|seed-7",
    );
    const first = generateGunProfileV1("room-a", "seed-7");
    const second = generateGunProfileV1("room-a", "seed-7");
    const differentRoom = generateGunProfileV1("room-b", "seed-7");
    const differentGun = generateGunProfileV1("room-a", "seed-8");
    expect(first).toEqual(second);
    expect(first.profileHash).toMatch(/^[0-9a-f]{8}$/u);
    expect(first).not.toEqual(differentRoom);
    expect(first).not.toEqual(differentGun);
    expect(first.groupDamage).toBeCloseTo(first.damagePerProjectile * first.projectilesPerShot, 10);
    expect(first.burstDamage).toBeCloseTo(first.groupDamage * first.burstSize, 10);
    expect(first.inventoryDamage).toBeCloseTo(
      first.groupDamage * (first.magazineSize + first.reserveAmmo),
      10,
    );
    expect(first.cyclicRate).toBeCloseTo(1 / first.fireIntervalSeconds, 10);
    expect(first.reloadIntervalSeconds).toBeGreaterThan(0);
    expect(first.reloadWork).toBe(first.magazineDamage);
    expect(first.ironSight.frontZ).toBeLessThan(first.ironSight.rearZ);
    expect(first.displayName).toMatch(/^[A-Z][A-Za-z]+ [A-Z][A-Za-z]+ · [A-Z2-9]{6}$/u);
    expect(first.displayName).toBe(second.displayName);
    expect(first.displayName).not.toBe(differentRoom.displayName);
    expect(first.displayName).not.toBe(differentGun.displayName);
  });

  it("uses the full magazine workload for round-feed reload and sustained DPS", () => {
    const shotgun = GUN_PROFILES.shotgun;
    expect(shotgun.reloadMode).toBe("round");
    expect(shotgun.roundReloadSeconds).toBeCloseTo(
      shotgun.roundInterval * shotgun.magazineSize,
      10,
    );
    expect(shotgun.reloadSeconds).toBe(shotgun.roundReloadSeconds);
    expect(shotgun.reloadIntervalSeconds).toBe(shotgun.roundInterval);
    expect(shotgun.sustainedDamagePerSecond).toBeCloseTo(
      shotgun.magazineDamage / (shotgun.timeToEmptyMagazineSeconds + shotgun.roundReloadSeconds),
      10,
    );
  });

  it("carries instance state without changing the resolved profile", () => {
    const profile = GUN_PROFILES.pistol;
    const instance = createGunInstance(profile, "drop-test-instance", {
      loadedAmmo: 3,
      reserveAmmo: 9,
      temperatureC: 120,
    });
    expect(instance.instanceId).toBe("drop-test-instance");
    expect(instance.profileHash).toBe(profile.profileHash);
    expect(instance.primitives.profileId).toBe(profile.profileId);
    expect(instance.primitives.generatorSeed).toBe(profile.generatorSeed);
    expect(instance.generatorSeed).toBe(profile.generatorSeed);
    expect(instance.loadedAmmo).toBe(3);
    expect(instance.reserveAmmo).toBe(9);
    expect(instance.temperatureC).toBe(120);
    expect(instance.profile).toBe(profile);
    expect(() =>
      createGunInstance({ ...profile, groupDamage: profile.groupDamage + 1 }, "tampered-instance"),
    ).toThrow(/Invalid resolved gun profile/u);
  });

  it("rejects invalid generated inputs before they can become instances", () => {
    expect(() => generateGunProfileV1("room-a", "", { profileId: "bad" })).toThrow(
      /generatorSeed/u,
    );
    const invalid = { ...GUN_PROFILES.pistol, massKg: Number.NaN };
    expect(() => {
      // The cast keeps this regression focused on runtime validation rather
      // than the compile-time readonly profile contract.
      return resolveGunProfileV1(invalid);
    }).toThrow(/Invalid massKg/u);
  });

  it("emits a redacted receipt and resolves shared spread modifiers", () => {
    const generated = generateGunProfileWithReceiptV1("room-a", "receipt-seed");
    expect(generated.receipt.stream).toBe("room-a|weapons|generation|v1|receipt-seed");
    expect(generated.receipt.nameStream).toBe("room-a|weapons|name|v1|receipt-seed");
    expect(generated.receipt.displayName).toBe(generated.profile.displayName);
    expect(generated.receipt.profileHash).toBe(generated.profile.profileHash);
    expect(generated.receipt.archetype).toBe("general");
    expect(generated.receipt.latent.feedStyle).toMatch(/^(clip|round|belt)$/u);
    expect(validateGunTradeoffsV1(generated.profile)).toBe(true);
    const hip = resolveGunSpreadRadiansV1(generated.profile, {
      movementFactor: 0,
      postureFactor: 1,
    });
    const moving = resolveGunSpreadRadiansV1(generated.profile, {
      movementFactor: 1,
      postureFactor: 1,
      speedMetersPerSecond: 8,
      heatRatio: 1,
      unresolvedRecoil: 1,
    });
    expect(moving).toBeGreaterThanOrEqual(hip);
    expect(resolveGunSpreadRadiansV1(generated.profile, { zoomed: true })).toBeLessThanOrEqual(
      generated.profile.hipSpreadRadians,
    );
  });

  it("generates a deterministic high-cadence single-projectile SMG envelope", () => {
    const first = generateGunProfileWithReceiptV1("room-a", "smg-7", {
      archetype: "submachine",
    });
    const second = generateGunProfileWithReceiptV1("room-a", "smg-7", {
      archetype: "submachine",
    });
    expect(first).toEqual(second);
    expect(first.receipt.archetype).toBe("submachine");
    expect(first.receipt.stream).toBe("room-a|weapons|generation|v1|submachine|smg-7");
    expect(first.receipt.nameStream).toBe("room-a|weapons|name|v1|submachine|smg-7");
    expect(first.profile.feedStyle).toBe("clip");
    expect(first.profile.projectilesPerShot).toBe(1);
    expect(first.profile.fireIntervalSeconds).toBeLessThan(0.15);
    expect(first.profile.magazineSize).toBeGreaterThanOrEqual(20);
    expect(first.profile.reloadSeconds).toBeLessThan(5);
    expect(validateGunTradeoffsV1(first.profile)).toBe(true);
  });

  it("names a reproducible catalog with stable codes and preserves explicit favorites", () => {
    const first = generateParametricGunCatalogV1("barracks-room", 32);
    const second = generateParametricGunCatalogV1("barracks-room", 32);
    expect(first).toEqual(second);
    expect(new Set(first.map(({ profile }) => profile.displayName)).size).toBe(first.length);
    expect(first.every(({ profile, receipt }) => receipt.displayName === profile.displayName)).toBe(
      true,
    );
    expect(first.filter(({ receipt }) => receipt.archetype === "submachine")).toHaveLength(
      DEFAULT_PARAMETRIC_GUN_SMG_COUNT,
    );
    expect(
      first.every(({ profile }) =>
        /^[A-Z][A-Za-z]+ [A-Z][A-Za-z]+ · [A-Z2-9]{6}$/u.test(profile.displayName),
      ),
    ).toBe(true);
    expect(first[0]?.profile.displayName).not.toBe(
      generateParametricGunCatalogV1("other-room", 32)[0]?.profile.displayName,
    );

    const favorite = generateGunProfileWithReceiptV1("barracks-room", "catalog-001", {
      displayName: "Quiet Ember",
    });
    expect(favorite.profile.displayName).toBe("Quiet Ember");
    expect(favorite.receipt.displayName).toBe("Quiet Ember");
    expect(
      resolveGeneratedGunNameV1("barracks-room", "catalog-001", favorite.receipt.latent),
    ).not.toBe("Quiet Ember");
  });

  it("creates generic pickup instances for every generated catalog profile", () => {
    const pickups = generateParametricGunPickupsV1("barracks-room", { count: 24 });
    expect(pickups).toHaveLength(24);
    expect(new Set(pickups.map((pickup) => pickup.gunInstanceId)).size).toBe(24);
    expect(new Set(pickups.map((pickup) => pickup.profileHash)).size).toBe(24);
    expect(pickups.every((pickup) => pickup.profile.displayName.includes("·"))).toBe(true);
  });

  it("keeps Pareto candidates and exposes the heavy envelope through generic data", () => {
    const profiles = [
      generateGunProfileV1("room-a", "pareto-a"),
      generateGunProfileV1("room-a", "pareto-b"),
      generateGunProfileV1("room-a", "pareto-c"),
    ];
    const filtered = filterGunProfilesParetoV1(profiles);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThanOrEqual(profiles.length);
    const heavy = generateHeavyTurretGunProfileV1("room-a", "heavy-a");
    expect(heavy.feedStyle).toBe("belt");
    expect(heavy.massKg).toBeGreaterThan(4);
    expect(heavy.magazineSize).toBeGreaterThan(40);
    expect(heavy.reloadSeconds).toBe(heavy.beltReloadSeconds);
    expect(heavy.reloadIntervalSeconds).toBeCloseTo(
      heavy.beltReloadSeconds / heavy.magazineSize,
      10,
    );
    expect(validateGunTradeoffsV1(heavy)).toBe(true);
  });

  it("records immutable playtest events without exposing world state", () => {
    const profile = GUN_PROFILES.pistol;
    const initial = createGunPlaytestTelemetryV1(profile, "scenario-a");
    const afterShot = recordGunPlaytestTelemetryEventV1(initial, {
      type: "shotAccepted",
      timestampSeconds: 0.4,
      oxygenConsumed: profile.oxygenCostPerGroup,
      recoilDisplacement: profile.recoilKick,
      movementAimPenalty: profile.movementPenalty,
      movementSpeedMetersPerSecond: 6,
      distanceMeters: 12,
      posture: "standing",
    });
    const afterHit = recordGunPlaytestTelemetryEventV1(afterShot, {
      type: "hit",
      timestampSeconds: 0.6,
      damage: profile.groupDamage,
      distanceMeters: 12,
      heatRatio: 0.9,
      posture: "standing",
    });
    const afterSecondShot = recordGunPlaytestTelemetryEventV1(afterHit, {
      type: "shotAccepted",
      timestampSeconds: 0.9,
      projectileCount: 1,
      movementSpeedMetersPerSecond: 2,
      distanceMeters: 16,
      posture: "crouched",
    });
    const afterSecondHit = recordGunPlaytestTelemetryEventV1(afterSecondShot, {
      type: "hit",
      timestampSeconds: 1.1,
      damage: profile.groupDamage,
      distanceMeters: 16,
      heatRatio: 0.9,
      posture: "crouched",
    });
    const afterTime = recordGunPlaytestTelemetryEventV1(afterSecondHit, {
      type: "time",
      deltaSeconds: 1,
      heatRatio: 0.9,
      thermalSmokeRate: 2,
    });
    expect(initial.acceptedShots).toBe(0);
    expect(afterTime.acceptedShots).toBe(2);
    expect(afterTime.hits).toBe(2);
    expect(afterTime.hitRate).toBe(1);
    expect(afterTime.hitRateByPosture.standing.shots).toBe(1);
    expect(afterTime.hitRateByPosture.standing.hits).toBe(1);
    expect(afterTime.hitRateByPosture.standing.hitRate).toBe(1);
    expect(afterTime.hitRateByPosture.crouched.hitRate).toBe(1);
    expect(afterTime.hitRateByDistance.medium.hitRate).toBe(1);
    expect(afterTime.peakMovementSpeedMetersPerSecond).toBe(6);
    expect(afterTime.hitIntervalsSeconds).toEqual([0.5]);
    expect(afterTime.totalDamage).toBe(profile.groupDamage * 2);
    expect(afterTime.engagementRangeMeters).toBe(14);
    expect(afterTime.glowSeconds).toBeGreaterThan(0);
    expect(afterTime.thermalSmokeRate).toBe(2);
    expect(afterTime.reloadInterruptionRate).toBe(0);
    const afterInterruptedReload = recordGunPlaytestTelemetryEventV1(afterTime, {
      type: "reload",
      durationSeconds: 0.3,
      interrupted: true,
    });
    expect(afterInterruptedReload.reloadOperations).toBe(1);
    expect(afterInterruptedReload.reloadInterruptions).toBe(1);
    expect(afterInterruptedReload.reloadInterruptionRate).toBe(1);
  });
});

describe("generic gun inventory slots", () => {
  it("starts with two free generic slots and fills the first free slot", () => {
    const empty = createEmptyWeaponStateSnapshot();
    expect(empty.slots).toHaveLength(DEFAULT_GUN_SLOT_COUNT);
    const slotIds = empty.slots.map(({ slotIndex, gunInstanceId }) => ({
      slotIndex,
      gunInstanceId,
    }));
    expect(findFirstFreeGunSlot(slotIds)).toBe(0);
    const withFirst = insertGunIntoFirstFreeSlot(slotIds, "gun-a");
    expect(withFirst?.map((slot) => slot.gunInstanceId)).toEqual(["gun-a", null]);
    expect(findFirstFreeGunSlot(withFirst ?? [])).toBe(1);
    const full = insertGunIntoFirstFreeSlot(withFirst ?? [], "gun-b");
    expect(full?.map((slot) => slot.gunInstanceId)).toEqual(["gun-a", "gun-b"]);
    expect(insertGunIntoFirstFreeSlot(full ?? [], "gun-c")).toBeNull();
    expect(insertGunIntoFirstFreeSlot(full ?? [], "gun-a")).toBeNull();
  });

  it("drops only the selected instance and preserves other slots", () => {
    const slots = [
      { slotIndex: 0, gunInstanceId: "gun-a" },
      { slotIndex: 1, gunInstanceId: "gun-b" },
    ] as const;
    expect(clearGunInventorySlot(slots, 0)).toEqual([
      { slotIndex: 0, gunInstanceId: null },
      { slotIndex: 1, gunInstanceId: "gun-b" },
    ]);
  });

  it("adds a forward toss impulse without losing sprint or strafe momentum", () => {
    expect(resolveGunThrowVelocityV1({ x: 0, y: 0, z: -1 }, { x: 4.2, y: 0.4, z: 1.1 }, 7)).toEqual(
      { x: 4.2, y: 0.4, z: -5.9 },
    );
    expect(resolveGunThrowVelocityV1({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 2)).toEqual({
      x: 0,
      y: 0,
      z: -2,
    });
  });
});

describe("procedural weapon pickups", () => {
  const reservedRects: readonly WeaponSpawnRect[] = [{ minX: -25, maxX: 25, minZ: -25, maxZ: 25 }];

  it("uses an expanded walk-over pickup range", () => {
    expect(WEAPON_PICKUP_RANGE_METERS).toBe(3.5);
    expect(WEAPON_PICKUP_RANGE_METERS).toBeGreaterThan(2.05);
  });

  it("caps procedural outdoor density at one pickup per 50 m horizontal radius", () => {
    expect(WEAPON_SPAWN_DENSITY_RADIUS_METERS).toBe(50);
    const pickups = generateWeaponPickups("room-weapon-density", {
      worldHalfSize: 125,
      minimumDistance: 1,
    });
    const outdoor = pickups.filter((pickup) => pickup.nearTable !== true);
    for (let leftIndex = 0; leftIndex < outdoor.length; leftIndex += 1) {
      const left = outdoor[leftIndex];
      if (left === undefined) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < outdoor.length; rightIndex += 1) {
        const right = outdoor[rightIndex];
        if (right === undefined) continue;
        expect(
          Math.hypot(left.position[0] - right.position[0], left.position[2] - right.position[2]),
        ).toBeGreaterThanOrEqual(WEAPON_SPAWN_DENSITY_RADIUS_METERS);
      }
    }
  });

  it("omits impossible outdoor placements instead of breaking the density cap", () => {
    const pickups = generateWeaponPickups("room-weapon-constrained", {
      worldHalfSize: 12,
      pickupCountPerWeapon: 8,
    });
    expect(pickups.every((pickup) => pickup.nearTable === true)).toBe(true);
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
    expect(new Set(first.map((pickup) => pickup.gunInstanceId)).size).toBe(first.length);
    for (const pickup of first) {
      expect(pickup.gun.instanceId).toBe(pickup.gunInstanceId);
      expect(pickup.gun.profileHash).toBe(pickup.profileHash);
      expect(pickup.gun.loadedAmmo).toBe(pickup.loadedAmmo);
      expect(pickup.gun.reserveAmmo).toBe(pickup.reserveAmmo);
      expect(pickup.gun.temperatureC).toBe(pickup.temperatureC);
    }
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
    expect(pickups[0]?.profileId).toBe("pistol");
    const tableSidePickups = pickups.filter((pickup) => pickup.nearTable === true);
    expect(tableSidePickups).toHaveLength(4);
    expect(tableSidePickups.map((pickup) => pickup.profileId)).toEqual([
      "pistol",
      "shotgun",
      "machineGun",
      "sniper",
    ]);
    for (const pickup of tableSidePickups) {
      expect(Math.hypot(pickup.position[0], pickup.position[2])).toBeLessThan(5);
    }
    for (const weapon of WEAPON_IDS) {
      expect(pickups.filter((pickup) => pickup.profileId === weapon)).toHaveLength(
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
