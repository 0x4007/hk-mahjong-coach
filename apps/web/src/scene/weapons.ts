import { createSeededRandom } from "@hk-mahjong/core/public";

import { resolveO2Stability } from "./o2-stability.js";

export const WEAPON_IDS = ["pistol", "shotgun", "machineGun", "sniper"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** Resolve a number-row weapon key; `Digit0` is the explicit empty-hand slot. */
export const resolveWeaponHotkey = (code: string): WeaponId | null | undefined => {
  if (code === "Digit0") {
    return null;
  }
  if (!/^Digit[1-4]$/u.test(code)) {
    return undefined;
  }
  return WEAPON_IDS[Number(code.slice(-1)) - 1];
};

/** Presentation lifetimes for the deterministic shot effects. */
export const WEAPON_TRACER_LIFETIME_SECONDS = 0.14;
export const WEAPON_IMPACT_LIFETIME_SECONDS = 0.18;
export const WEAPON_BULLET_HOLE_LIFETIME_SECONDS = 5 * 60;
export const WEAPON_BULLET_HOLE_FADE_SECONDS = 12;
/** Keep sustained automatic fire from accumulating unbounded scene objects. */
export const WEAPON_BULLET_HOLE_MAX_COUNT = 256;

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

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly label: string;
  readonly shortLabel: string;
  readonly damage: number;
  readonly pellets: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly fireIntervalSeconds: number;
  readonly reloadSeconds: number;
  readonly range: number;
  /** Inherent projectile cone. Non-shotguns keep this at zero and rely on the shared aim stack. */
  readonly spreadRadians: number;
  readonly color: number;
  readonly ironSight: WeaponIronSightProfile;
}

export const WEAPON_DEFINITIONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  pistol: {
    id: "pistol",
    label: "Pistol",
    shortLabel: "SIDEARM",
    damage: 28,
    pellets: 1,
    magazineSize: 12,
    reserveAmmo: 72,
    fireIntervalSeconds: 0.28,
    reloadSeconds: 0.95,
    range: 85,
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
  },
  shotgun: {
    id: "shotgun",
    label: "Shotgun",
    shortLabel: "BREACH",
    damage: 16,
    pellets: 8,
    magazineSize: 6,
    reserveAmmo: 36,
    fireIntervalSeconds: 0.92,
    reloadSeconds: 1.35,
    range: 32,
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
  },
  machineGun: {
    id: "machineGun",
    label: "Machine gun",
    shortLabel: "SUPPRESS",
    damage: 12,
    pellets: 1,
    magazineSize: 30,
    reserveAmmo: 150,
    fireIntervalSeconds: 0.085,
    reloadSeconds: 1.55,
    range: 105,
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
  },
  sniper: {
    id: "sniper",
    label: "Sniper",
    shortLabel: "LONGSHOT",
    damage: 100,
    pellets: 1,
    magazineSize: 5,
    reserveAmmo: 25,
    fireIntervalSeconds: 1.1,
    reloadSeconds: 1.8,
    range: 220,
    spreadRadians: 0,
    color: 0xb98ee8,
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
  },
};

/**
 * Resolve the only inherent projectile cone used by the firing runtime.
 *
 * Pistol, machine-gun, and sniper rounds leave the muzzle on the live reticle
 * ray. Their apparent spread is produced by the shared first-person
 * presentation stack: movement, breathing, posture, and prior shot recoil
 * move that ray before the next shot. The shotgun keeps a real pellet cone;
 * O₂ can widen or tighten that cone without introducing spread to other guns.
 */
export const resolveWeaponSpreadRadians = (
  definition: WeaponDefinition,
  oxygenRatio: number,
  aimingDownSights = false,
  holdingBreath = false,
): number =>
  definition.id === "shotgun"
    ? definition.spreadRadians *
      resolveO2Stability({ oxygenRatio, aimingDownSights, holdingBreath }).accuracyMultiplier
    : 0;

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

/** Peak local pitch for the generic snappy reload presentation. */
export const WEAPON_RELOAD_SKY_PITCH_RADIANS = (78 * Math.PI) / 180;
const WEAPON_RELOAD_LIFT_END = 0.2;
const WEAPON_RELOAD_CLIP_END = 0.48;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

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
): WeaponReloadPose => {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 1;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const progress = clampUnit(elapsed / duration);
  let skyAmount: number;
  let clipAmount = 0;
  if (progress < WEAPON_RELOAD_LIFT_END) {
    skyAmount = easeOutCubic(progress / WEAPON_RELOAD_LIFT_END);
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
    pitchRadians: WEAPON_RELOAD_SKY_PITCH_RADIANS * skyAmount,
    verticalOffset: 0.16 * skyAmount,
    depthOffset: 0.035 * skyAmount + 0.028 * clipAmount,
    lateralOffset: -0.055 * clipAmount,
    rollRadians: -0.16 * clipAmount,
  };
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
 * composition. The four pads sit outside the table footprint, with the
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
 * the four weapon types are visible and immediately testable. Remaining
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
