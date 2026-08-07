import { createSeededRandom } from "@hk-mahjong/core/public";

export const WEAPON_IDS = ["pistol", "shotgun", "machineGun", "sniper"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** The three reload mechanisms used by the visual weapon prototype. */
export type WeaponReloadMode = "clip" | "round" | "belt";
export type GunFormulaVersion = "v1";
export type GunGenerationArchetypeV1 = "general" | "submachine";

/** Seeded generator profile version for profile hash derivation and replay trace. */
export const WEAPON_FORMULA_VERSION: GunFormulaVersion = "v1";

/** One versioned stream for generated profile RNG and derived profile hashes. */
export const WEAPON_PROFILE_GENERATION_STREAM = "weapons|generation" as const;

/** A separate stream keeps memorable names stable when profile sampling changes. */
export const WEAPON_NAME_GENERATION_STREAM = "weapons|name" as const;

const resolveArchetypeStreamSuffix = (archetype: GunGenerationArchetypeV1): string =>
  archetype === "general" ? "" : `|${archetype}`;

/** The shared oxygen charge used by the current visual-table projectile law. */
export const WEAPON_OXYGEN_DAMAGE_FACTOR = 0.25;

/** The default prototype inventory rule. Profiles never own a slot count. */
export const DEFAULT_GUN_SLOT_COUNT = 2;

/** Build the canonical stream used by every generated profile. */
export const resolveWeaponGenerationStream = (
  roomSeed: string,
  gunSeed: string,
  formulaVersion: GunFormulaVersion = WEAPON_FORMULA_VERSION,
  archetype: GunGenerationArchetypeV1 = "general",
): string =>
  `${roomSeed.trim() || "room-01"}|${WEAPON_PROFILE_GENERATION_STREAM}|${formulaVersion}${resolveArchetypeStreamSuffix(archetype)}|${gunSeed}`;

/** Build the canonical stream used for generated display names and short codes. */
export const resolveWeaponNameGenerationStream = (
  roomSeed: string,
  gunSeed: string,
  formulaVersion: GunFormulaVersion = WEAPON_FORMULA_VERSION,
  archetype: GunGenerationArchetypeV1 = "general",
): string =>
  `${roomSeed.trim() || "room-01"}|${WEAPON_NAME_GENERATION_STREAM}|${formulaVersion}${resolveArchetypeStreamSuffix(archetype)}|${gunSeed.trim()}`;

/** Keep profile math readable for each resolved version. */
const WEAPON_CLIP_RELOAD_BASE_SECONDS = 0;
const WEAPON_ROUND_RELOAD_BASE_SECONDS = 0;
const WEAPON_BELT_RELOAD_BASE_SECONDS = 0;
const WEAPON_CLIP_LOADER_RATE = 100;
const WEAPON_ROUND_LOADER_RATE = 100;
// Belt feeds expose a continuous segment loader; the higher global rate keeps
// the bounded generated envelope usable while still making large magazines
// materially slower than a light clip.
const WEAPON_BELT_LOADER_RATE = 320;
const WEAPON_RECOIL_DAMAGE_SCALE = 100;
const WEAPON_RECOIL_HANDLING_BIAS = 0.22;
const WEAPON_RECOIL_MAX_AMOUNT = 0.52;

const clampRange = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Canonical deterministic hash for profile replay and pickup identity. */
const resolveProfileHash = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((entry) => normalize(entry));
    }
    if (input === null || typeof input !== "object") {
      return input;
    }
    return Object.fromEntries(
      Object.entries(input)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, next]) => [key, normalize(next)]),
    );
  };
  const payload = JSON.stringify(normalize(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * The first resolved profile version follows the parametric-gun spec for phase-one
 * generation and inventory logic.
 */
export interface GunPrimitivesV1 {
  readonly profileId: string;
  readonly displayName: string;
  readonly damagePerProjectile: number;
  readonly projectilesPerShot: number;
  readonly fireIntervalSeconds: number;
  readonly burstSize: number;
  readonly burstCooldownSeconds: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly feedStyle: WeaponReloadMode;
  readonly spreadRadians: number;
  readonly hotBarrelLengthMeters: number;
  readonly barrelRadiusMeters: number;
  readonly receiverLengthMeters: number;
  readonly receiverWidthMeters: number;
  readonly receiverHeightMeters: number;
  readonly massKg: number;
  readonly gripAngleRadians: number;
  readonly stockLengthMeters: number;
  readonly opticMagnification: number | null;
  readonly accentColor: number;
  readonly generatorSeed: string;
}

/** Derived sound inputs. The scene may map these to any local audio backend. */
export interface GunAudioProfileV1 {
  readonly effectPower: number;
  readonly muzzleLevel: number;
  readonly crackLevel: number;
  readonly crackPitchHz: number;
  readonly tailLevel: number;
  readonly tailSeconds: number;
  readonly mechanicalLevel: number;
  readonly mechanicalPitchHz: number;
  readonly barrelLengthScale: number;
}

/** The bounded latent axes used by the deterministic generator receipt. */
export interface GunLatentVectorV1 {
  readonly payload: number;
  readonly cadence: number;
  readonly capacity: number;
  readonly reach: number;
  readonly mass: number;
  readonly accuracy: number;
  readonly feedStyle: WeaponReloadMode;
}

/** Redacted replay metadata; it contains no hidden world state. */
export interface GunGenerationReceiptV1 {
  readonly formulaVersion: GunFormulaVersion;
  readonly archetype: GunGenerationArchetypeV1;
  readonly roomSeed: string;
  readonly gunSeed: string;
  readonly stream: string;
  readonly nameStream: string;
  readonly profileId: string;
  readonly displayName: string;
  readonly profileHash: string;
  readonly latent: GunLatentVectorV1;
}

/** Runtime and UI-facing resolved values for one weapon profile. */
export interface GunResolvedProfileV1 extends GunPrimitivesV1 {
  readonly formulaVersion: GunFormulaVersion;
  readonly profileHash: string;
  /** Presentation metadata is resolved once and is not a gameplay branch. */
  readonly shortLabel: string;
  readonly ironSight: WeaponIronSightProfile;

  readonly groupDamage: number;
  readonly burstDamage: number;
  readonly magazineDamage: number;
  readonly inventoryDamage: number;
  readonly cyclicRate: number;
  readonly projectilesPerSecond: number;
  readonly burstsPerSecond: number;
  readonly burstCycleTime: number;
  readonly burstDps: number;
  readonly timeToEmptyMagazineSeconds: number;
  readonly clipReloadSeconds: number;
  readonly roundInterval: number;
  /** Full magazine reload workload for round-fed profiles. */
  readonly roundReloadSeconds: number;
  readonly beltReloadSeconds: number;
  /** One round or continuous-feed segment interval. */
  readonly reloadIntervalSeconds: number;
  readonly reloadWork: number;
  readonly reloadSeconds: number;
  readonly reloadMode: WeaponReloadMode;
  readonly reloadCanInterrupt: boolean;
  readonly handling: number;
  readonly recoilKick: number;
  readonly aimRecoveryTime: number;
  readonly movementPenalty: number;
  readonly switchTime: number;
  readonly expectedShotsFromFullInventory: number;
  readonly expectedGroupDamageFromFullInventory: number;
  readonly expectedMagazines: number;
  readonly expectedBulletsPerSecond: number;
  readonly sustainedDamagePerSecond: number;
  readonly handlingSpreadFactor: number;
  readonly hipSpreadRadians: number;
  readonly zoomSpreadRadians: number;
  readonly heatSpreadFactor: number;
  readonly recoverySpreadFactor: number;
  readonly oxygenCostPerGroup: number;
  readonly oxygenCostPerBurst: number;
  readonly oxygenCostPerMagazine: number;
  readonly damagePerReload: number;
  readonly reserveDamagePerSecond: number;
  readonly audio: GunAudioProfileV1;
}

export interface GunSpreadResolutionContextV1 {
  readonly zoomed?: boolean;
  /** 0–1 movement intensity supplied by the authoritative movement loop. */
  readonly movementFactor?: number;
  /** 0 for a braced/crouched posture, 1 for standing posture. */
  readonly postureFactor?: number;
  /** Current horizontal speed, used as a second-order movement penalty. */
  readonly speedMetersPerSecond?: number;
  /** 0–1 normalized current barrel heat. */
  readonly heatRatio?: number;
  /** 0–1 unresolved shared recoil presentation amount. */
  readonly unresolvedRecoil?: number;
}

/** Mutable state carried by one generated gun through pickup, drop, and replay. */
export interface GunInstance {
  readonly instanceId: string;
  readonly profileHash: string;
  readonly primitives: GunPrimitivesV1;
  readonly profile: GunResolvedProfileV1;
  readonly generatorSeed: string;
  loadedAmmo: number;
  reserveAmmo: number;
  temperatureC: number;
}

/** Subjective ratings captured after a local gun playtest. */
export interface GunPlaytestRatingsV1 {
  readonly power: number | null;
  readonly control: number | null;
  readonly clarity: number | null;
  readonly fun: number | null;
}

export type GunPlaytestPostureV1 = "standing" | "crouched";
export type GunPlaytestDistanceBandV1 = "close" | "medium" | "long";

export interface GunPlaytestRateSummaryV1 {
  readonly shots: number;
  readonly hits: number;
  readonly hitRate: number;
}

/**
 * Presentation-safe playtest telemetry. It is a report about one generated
 * profile and scenario; it does not contain world state or concealed tiles.
 */
export interface GunPlaytestTelemetryV1 {
  readonly profileHash: string;
  readonly generatorSeed: string;
  readonly scenarioSeed: string;
  readonly elapsedSeconds: number;
  readonly firstAcceptedShotSeconds: number | null;
  readonly lastHitSeconds: number | null;
  readonly acceptedShots: number;
  readonly projectilesFired: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly hitIntervalsSeconds: readonly number[];
  readonly hitRateByPosture: Readonly<Record<GunPlaytestPostureV1, GunPlaytestRateSummaryV1>>;
  readonly hitRateByDistance: Readonly<Record<GunPlaytestDistanceBandV1, GunPlaytestRateSummaryV1>>;
  readonly totalDamage: number;
  readonly damagePerSecond: number;
  readonly peakBurstDamage: number;
  readonly recoilDisplacement: number;
  readonly recoilRecoveryTime: number;
  readonly peakMovementSpeedMetersPerSecond: number;
  readonly movementAimPenalty: number;
  readonly peakHeatRatio: number;
  readonly glowSeconds: number;
  readonly thermalSmokeRate: number;
  readonly reloadDurationSeconds: number;
  readonly reloadOperations: number;
  readonly reloadInterruptions: number;
  readonly reloadInterruptionRate: number;
  readonly ammunitionConsumed: number;
  readonly oxygenConsumed: number;
  readonly engagementRangeMeters: number;
  readonly emptyMagazineEvents: number;
  readonly deaths: number;
  readonly ratings: GunPlaytestRatingsV1;
}

export type GunPlaytestTelemetryEventV1 =
  | {
      readonly type: "time";
      readonly deltaSeconds: number;
      readonly heatRatio?: number;
      readonly thermalSmokeRate?: number;
    }
  | {
      readonly type: "shotAccepted";
      readonly timestampSeconds: number;
      readonly projectileCount?: number;
      readonly ammunitionConsumed?: number;
      readonly oxygenConsumed?: number;
      readonly recoilDisplacement?: number;
      readonly movementAimPenalty?: number;
      readonly movementSpeedMetersPerSecond?: number;
      readonly distanceMeters?: number;
      readonly posture?: GunPlaytestPostureV1;
    }
  | {
      readonly type: "hit";
      readonly timestampSeconds: number;
      readonly damage: number;
      readonly distanceMeters?: number;
      readonly heatRatio?: number;
      readonly burstDamage?: number;
      readonly posture?: GunPlaytestPostureV1;
    }
  | {
      readonly type: "reload";
      readonly durationSeconds: number;
      readonly interrupted?: boolean;
    }
  | { readonly type: "emptyMagazine" }
  | { readonly type: "death" }
  | {
      readonly type: "rating";
      readonly ratings: Partial<GunPlaytestRatingsV1>;
    };

const normalizeTelemetryNumber = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;

/** Keep derived duration telemetry stable across ordinary floating-point drift. */
const normalizeTelemetryDuration = (value: number): number =>
  Math.round(Math.max(0, normalizeTelemetryNumber(value)) * 1_000_000) / 1_000_000;

const clampTelemetryRatio = (value: number): number =>
  clampRange(normalizeTelemetryNumber(value), 0, 1);

const normalizeRating = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(value) ? null : clampRange(value, 1, 5);

const createTelemetryRateSummary = (): GunPlaytestRateSummaryV1 => ({
  shots: 0,
  hits: 0,
  hitRate: 0,
});

const createTelemetryPostureRates = (): Readonly<
  Record<GunPlaytestPostureV1, GunPlaytestRateSummaryV1>
> => ({
  standing: createTelemetryRateSummary(),
  crouched: createTelemetryRateSummary(),
});

const createTelemetryDistanceRates = (): Readonly<
  Record<GunPlaytestDistanceBandV1, GunPlaytestRateSummaryV1>
> => ({
  close: createTelemetryRateSummary(),
  medium: createTelemetryRateSummary(),
  long: createTelemetryRateSummary(),
});

const updateTelemetryRateSummary = (
  previous: GunPlaytestRateSummaryV1,
  shotsDelta: number,
  hitsDelta: number,
): GunPlaytestRateSummaryV1 => {
  const shots = previous.shots + Math.max(0, Math.floor(shotsDelta));
  const hits = Math.min(shots, previous.hits + Math.max(0, Math.floor(hitsDelta)));
  return {
    shots,
    hits,
    hitRate: shots <= 0 ? 0 : hits / shots,
  };
};

const resolveTelemetryDistanceBand = (
  distanceMeters: number | undefined,
): GunPlaytestDistanceBandV1 | null => {
  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    return null;
  }
  if (distanceMeters <= 10) {
    return "close";
  }
  if (distanceMeters <= 25) {
    return "medium";
  }
  return "long";
};

/** Create an empty, deterministic report for one profile/scenario pair. */
export const createGunPlaytestTelemetryV1 = (
  profile: Pick<GunResolvedProfileV1, "profileHash" | "generatorSeed">,
  scenarioSeed: string,
): GunPlaytestTelemetryV1 => ({
  profileHash: profile.profileHash,
  generatorSeed: profile.generatorSeed,
  scenarioSeed: scenarioSeed.trim() || "scenario-01",
  elapsedSeconds: 0,
  firstAcceptedShotSeconds: null,
  lastHitSeconds: null,
  acceptedShots: 0,
  projectilesFired: 0,
  hits: 0,
  misses: 0,
  hitRate: 0,
  hitIntervalsSeconds: [],
  hitRateByPosture: createTelemetryPostureRates(),
  hitRateByDistance: createTelemetryDistanceRates(),
  totalDamage: 0,
  damagePerSecond: 0,
  peakBurstDamage: 0,
  recoilDisplacement: 0,
  recoilRecoveryTime: 0,
  peakMovementSpeedMetersPerSecond: 0,
  movementAimPenalty: 0,
  peakHeatRatio: 0,
  glowSeconds: 0,
  thermalSmokeRate: 0,
  reloadDurationSeconds: 0,
  reloadOperations: 0,
  reloadInterruptions: 0,
  reloadInterruptionRate: 0,
  ammunitionConsumed: 0,
  oxygenConsumed: 0,
  engagementRangeMeters: 0,
  emptyMagazineEvents: 0,
  deaths: 0,
  ratings: { power: null, control: null, clarity: null, fun: null },
});

/** Advance a report without mutating the previous snapshot. */
export const recordGunPlaytestTelemetryEventV1 = (
  previous: GunPlaytestTelemetryV1,
  event: GunPlaytestTelemetryEventV1,
): GunPlaytestTelemetryV1 => {
  if (event.type === "time") {
    const delta = Math.max(0, normalizeTelemetryNumber(event.deltaSeconds));
    const heatRatio = clampTelemetryRatio(event.heatRatio ?? previous.peakHeatRatio);
    const smokeRate = Math.max(0, normalizeTelemetryNumber(event.thermalSmokeRate ?? 0));
    return {
      ...previous,
      elapsedSeconds: previous.elapsedSeconds + delta,
      peakHeatRatio: Math.max(previous.peakHeatRatio, heatRatio),
      glowSeconds: previous.glowSeconds + (heatRatio >= 0.8 ? delta : 0),
      thermalSmokeRate: Math.max(previous.thermalSmokeRate, smokeRate),
    };
  }
  if (event.type === "shotAccepted") {
    const timestamp = Math.max(0, normalizeTelemetryNumber(event.timestampSeconds));
    const first = previous.firstAcceptedShotSeconds ?? timestamp;
    const acceptedShots = previous.acceptedShots + 1;
    const projectilesFired =
      previous.projectilesFired +
      Math.max(1, Math.floor(normalizeTelemetryNumber(event.projectileCount ?? 1)));
    const projectileCount = projectilesFired - previous.projectilesFired;
    const postureRates =
      event.posture === undefined
        ? previous.hitRateByPosture
        : {
            ...previous.hitRateByPosture,
            [event.posture]: updateTelemetryRateSummary(
              previous.hitRateByPosture[event.posture],
              projectileCount,
              0,
            ),
          };
    const distanceBand = resolveTelemetryDistanceBand(event.distanceMeters);
    const distanceRates =
      distanceBand === null
        ? previous.hitRateByDistance
        : {
            ...previous.hitRateByDistance,
            [distanceBand]: updateTelemetryRateSummary(
              previous.hitRateByDistance[distanceBand],
              projectileCount,
              0,
            ),
          };
    return {
      ...previous,
      elapsedSeconds: Math.max(previous.elapsedSeconds, timestamp),
      firstAcceptedShotSeconds: first,
      acceptedShots,
      projectilesFired,
      misses: Math.max(0, projectilesFired - previous.hits),
      hitRate: projectilesFired <= 0 ? 0 : previous.hits / projectilesFired,
      hitRateByPosture: postureRates,
      hitRateByDistance: distanceRates,
      recoilDisplacement: Math.max(
        previous.recoilDisplacement,
        Math.max(0, normalizeTelemetryNumber(event.recoilDisplacement ?? 0)),
      ),
      recoilRecoveryTime: Math.max(
        previous.recoilRecoveryTime,
        Math.max(0, normalizeTelemetryNumber(event.recoilDisplacement ?? 0)) * 0.95,
      ),
      peakMovementSpeedMetersPerSecond: Math.max(
        previous.peakMovementSpeedMetersPerSecond,
        Math.max(0, normalizeTelemetryNumber(event.movementSpeedMetersPerSecond ?? 0)),
      ),
      movementAimPenalty: Math.max(
        previous.movementAimPenalty,
        clampTelemetryRatio(event.movementAimPenalty ?? 0),
      ),
      ammunitionConsumed:
        previous.ammunitionConsumed +
        Math.max(0, normalizeTelemetryNumber(event.ammunitionConsumed ?? 1)),
      oxygenConsumed:
        previous.oxygenConsumed + Math.max(0, normalizeTelemetryNumber(event.oxygenConsumed ?? 0)),
    };
  }
  if (event.type === "hit") {
    const timestamp = Math.max(0, normalizeTelemetryNumber(event.timestampSeconds));
    const damage = Math.max(0, normalizeTelemetryNumber(event.damage));
    const previousHitTimestamp = previous.lastHitSeconds;
    const hitIntervalsSeconds =
      previousHitTimestamp === null
        ? previous.hitIntervalsSeconds
        : [
            ...previous.hitIntervalsSeconds,
            normalizeTelemetryDuration(timestamp - previousHitTimestamp),
          ];
    const hits = previous.hits + 1;
    const elapsedFromFirst =
      previous.firstAcceptedShotSeconds === null
        ? Math.max(0.001, timestamp)
        : Math.max(0.001, timestamp - previous.firstAcceptedShotSeconds);
    const previousRangeWeight = previous.hits;
    const distance = Math.max(0, normalizeTelemetryNumber(event.distanceMeters ?? 0));
    const postureRates =
      event.posture === undefined
        ? previous.hitRateByPosture
        : {
            ...previous.hitRateByPosture,
            [event.posture]: updateTelemetryRateSummary(
              previous.hitRateByPosture[event.posture],
              0,
              1,
            ),
          };
    const distanceBand = resolveTelemetryDistanceBand(event.distanceMeters);
    const distanceRates =
      distanceBand === null
        ? previous.hitRateByDistance
        : {
            ...previous.hitRateByDistance,
            [distanceBand]: updateTelemetryRateSummary(
              previous.hitRateByDistance[distanceBand],
              0,
              1,
            ),
          };
    return {
      ...previous,
      elapsedSeconds: Math.max(previous.elapsedSeconds, timestamp),
      lastHitSeconds: timestamp,
      hits,
      misses: Math.max(0, previous.projectilesFired - hits),
      hitRate: previous.projectilesFired <= 0 ? 0 : hits / previous.projectilesFired,
      hitIntervalsSeconds,
      hitRateByPosture: postureRates,
      hitRateByDistance: distanceRates,
      totalDamage: previous.totalDamage + damage,
      damagePerSecond: (previous.totalDamage + damage) / elapsedFromFirst,
      peakBurstDamage: Math.max(
        previous.peakBurstDamage,
        Math.max(damage, normalizeTelemetryNumber(event.burstDamage ?? 0)),
      ),
      peakHeatRatio: Math.max(previous.peakHeatRatio, clampTelemetryRatio(event.heatRatio ?? 0)),
      engagementRangeMeters:
        hits <= 0 ? 0 : (previous.engagementRangeMeters * previousRangeWeight + distance) / hits,
    };
  }
  if (event.type === "reload") {
    const durationSeconds = Math.max(0, normalizeTelemetryNumber(event.durationSeconds));
    const reloadOperations = previous.reloadOperations + 1;
    const reloadInterruptions = previous.reloadInterruptions + (event.interrupted === true ? 1 : 0);
    return {
      ...previous,
      reloadDurationSeconds: previous.reloadDurationSeconds + durationSeconds,
      reloadOperations,
      reloadInterruptions,
      reloadInterruptionRate: reloadOperations <= 0 ? 0 : reloadInterruptions / reloadOperations,
    };
  }
  if (event.type === "emptyMagazine") {
    return { ...previous, emptyMagazineEvents: previous.emptyMagazineEvents + 1 };
  }
  if (event.type === "death") {
    return { ...previous, deaths: previous.deaths + 1 };
  }
  return {
    ...previous,
    ratings: {
      power: normalizeRating(event.ratings.power ?? previous.ratings.power),
      control: normalizeRating(event.ratings.control ?? previous.ratings.control),
      clarity: normalizeRating(event.ratings.clarity ?? previous.ratings.clarity),
      fun: normalizeRating(event.ratings.fun ?? previous.ratings.fun),
    },
  };
};

/** Inventory ownership is a slot-to-instance relation, never a weapon-id map. */
export interface GunInventorySlot {
  readonly slotIndex: number;
  readonly gunInstanceId: string | null;
}

/** Return the lowest free slot, or null when the generic inventory is full. */
export const findFirstFreeGunSlot = (slots: readonly GunInventorySlot[]): number | null => {
  const free = slots.find((slot) => slot.gunInstanceId === null);
  return free?.slotIndex ?? null;
};

/** Insert one instance into the first free slot without replacing anything. */
export const insertGunIntoFirstFreeSlot = (
  slots: readonly GunInventorySlot[],
  gunInstanceId: string,
): readonly GunInventorySlot[] | null => {
  const slotIndex = findFirstFreeGunSlot(slots);
  if (slotIndex === null || slots.some((slot) => slot.gunInstanceId === gunInstanceId)) {
    return null;
  }
  return slots.map((slot) => (slot.slotIndex === slotIndex ? { ...slot, gunInstanceId } : slot));
};

/** Clear one generic slot while leaving every other instance untouched. */
export const clearGunInventorySlot = (
  slots: readonly GunInventorySlot[],
  slotIndex: number,
): readonly GunInventorySlot[] =>
  slots.map((slot) => (slot.slotIndex === slotIndex ? { ...slot, gunInstanceId: null } : slot));

export interface GunVelocityVectorV1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Add a forward toss impulse to the player's current world velocity.
 *
 * The direction is deliberately horizontal: the runtime uses the player's
 * current view yaw for the Minecraft-like throw arc, while the supplied
 * velocity preserves sprinting, strafing, and jump momentum.
 */
export const resolveGunThrowVelocityV1 = (
  forwardDirection: GunVelocityVectorV1,
  playerVelocity: GunVelocityVectorV1,
  throwSpeed: number,
): GunVelocityVectorV1 => {
  const forwardX = Number.isFinite(forwardDirection.x) ? forwardDirection.x : 0;
  const forwardZ = Number.isFinite(forwardDirection.z) ? forwardDirection.z : 0;
  const forwardLength = Math.hypot(forwardX, forwardZ);
  const normalizedForwardX = forwardLength > 0.0001 ? forwardX / forwardLength : 0;
  const normalizedForwardZ = forwardLength > 0.0001 ? forwardZ / forwardLength : -1;
  const safeThrowSpeed = Number.isFinite(throwSpeed) ? Math.max(0, throwSpeed) : 0;
  return {
    x:
      (Number.isFinite(playerVelocity.x) ? playerVelocity.x : 0) +
      normalizedForwardX * safeThrowSpeed,
    y: Number.isFinite(playerVelocity.y) ? playerVelocity.y : 0,
    z:
      (Number.isFinite(playerVelocity.z) ? playerVelocity.z : 0) +
      normalizedForwardZ * safeThrowSpeed,
  };
};

/** Generic nearby pickup data safe for the HUD and other presentation clients. */
export interface NearbyGunPickupSnapshot {
  readonly pickupId: string;
  readonly gunInstanceId: string;
  readonly profileHash: string;
  readonly profileId: string;
  readonly displayName: string;
  readonly shortLabel: string;
  readonly accentColor: number;
  readonly loadedAmmo: number;
  readonly reserveAmmo: number;
  readonly temperatureC: number;
  readonly generatorSeed: string;
}

const resolveMassFactor = (massKg: number): number => clampRange(0.35 + massKg * 0.5, 0.35, 2.4);
const resolveLengthFactor = (hotBarrelLengthMeters: number, stockLengthMeters: number): number =>
  clampRange((0.9 + hotBarrelLengthMeters * 4 + stockLengthMeters * 2) / 3, 0.35, 2.2);

const resolveHandling = (
  massKg: number,
  hotBarrelLengthMeters: number,
  stockLengthMeters: number,
): number => {
  const massFactor = resolveMassFactor(massKg);
  const lengthFactor = resolveLengthFactor(hotBarrelLengthMeters, stockLengthMeters);
  return clampRange(massFactor * lengthFactor, 0.35, 2.8);
};

const resolveBarrelLengthScale = (hotBarrelLengthMeters: number): number =>
  clampRange((hotBarrelLengthMeters - 0.34) / (1.35 - 0.34), 0, 1);

/** Resolve sound-engine inputs from the same payload and barrel dimensions as the shot effects. */
export const resolveGunAudioProfileV1 = (
  groupDamage: number,
  hotBarrelLengthMeters: number,
  fireIntervalSeconds: number,
  feedStyle: WeaponReloadMode,
): GunAudioProfileV1 => {
  const safeGroupDamage = Number.isFinite(groupDamage) ? Math.max(0, groupDamage) : 0;
  const effectPower = Math.max(0.45, safeGroupDamage / 32);
  const barrelLengthScale = resolveBarrelLengthScale(hotBarrelLengthMeters);
  const cadence = 1 / Math.max(0.02, fireIntervalSeconds);
  const muzzleLevel = clampRange(0.42 + Math.log1p(effectPower) * 0.2, 0.42, 1);
  const crackLevel = clampRange(
    0.42 + (1 - barrelLengthScale) * 0.34 + Math.log1p(effectPower) * 0.08,
    0.35,
    1,
  );
  const crackPitchHz = clampRange(
    1680 - Math.sqrt(effectPower) * 220 - barrelLengthScale * 260,
    620,
    1680,
  );
  const tailLevel = clampRange(
    0.22 + Math.sqrt(effectPower) * 0.12 + barrelLengthScale * 0.18,
    0.2,
    1,
  );
  const tailSeconds = clampRange(
    0.1 + barrelLengthScale * 0.42 + Math.sqrt(effectPower) * 0.04,
    0.1,
    1.4,
  );
  const mechanicalLevel = clampRange(
    0.18 + (feedStyle === "belt" ? 0.18 : feedStyle === "round" ? 0.14 : 0.1) + cadence * 0.004,
    0.12,
    0.75,
  );
  const mechanicalPitchHz = clampRange(
    820 + cadence * 8 - (feedStyle === "belt" ? 80 : feedStyle === "round" ? 35 : 0),
    320,
    1200,
  );
  return {
    effectPower,
    muzzleLevel,
    crackLevel,
    crackPitchHz,
    tailLevel,
    tailSeconds,
    mechanicalLevel,
    mechanicalPitchHz,
    barrelLengthScale,
  };
};

/** Resolve the shared live-reticule spread from one profile and frame state. */
export const resolveGunSpreadRadiansV1 = (
  profile: Pick<
    GunResolvedProfileV1,
    | "hipSpreadRadians"
    | "zoomSpreadRadians"
    | "movementPenalty"
    | "heatSpreadFactor"
    | "recoverySpreadFactor"
  >,
  context: GunSpreadResolutionContextV1 = {},
): number => {
  const movement = clampRange(context.movementFactor ?? 0, 0, 1);
  const posture = clampRange(context.postureFactor ?? 1, 0, 1);
  const speed = clampRange((context.speedMetersPerSecond ?? 0) / 12, 0, 1);
  const heat = clampRange(context.heatRatio ?? 0, 0, 1);
  const recovery = clampRange(context.unresolvedRecoil ?? 0, 0, 1);
  const baseSpread = context.zoomed === true ? profile.zoomSpreadRadians : profile.hipSpreadRadians;
  const movementFactor =
    (1 + movement * (0.35 + clampRange(profile.movementPenalty, 0, 1) * 0.65) + speed * 0.12) *
    (1 - (1 - posture) * 0.1);
  const heatFactor = 1 + heat * Math.max(0, profile.heatSpreadFactor - 1);
  const recoveryFactor = 1 + recovery * Math.max(0, profile.recoverySpreadFactor - 1);
  return Math.max(0, baseSpread * movementFactor * heatFactor * recoveryFactor);
};

/** Derive open iron sights from the resolved receiver and barrel dimensions. */
const resolveGunIronSightProfile = (input: GunPrimitivesV1): WeaponIronSightProfile => {
  const receiverHalf = Math.max(0.08, input.receiverLengthMeters * 0.5);
  const frontZ = -(receiverHalf + input.hotBarrelLengthMeters * 0.72);
  const rearZ = Math.max(0.08, input.stockLengthMeters * 0.55);
  const sightWidth = clampRange(input.receiverWidthMeters * 0.16, 0.018, 0.05);
  const sightHeight = clampRange(input.receiverHeightMeters * 0.32, 0.04, 0.12);
  const rearHeight = clampRange(sightHeight * 0.7, 0.035, 0.08);
  const notchWidth = clampRange(input.receiverWidthMeters * 0.36, 0.045, 0.09);
  const earWidth = clampRange(input.receiverWidthMeters * 0.11, 0.018, 0.035);
  return {
    frontZ,
    frontBaseY: input.receiverHeightMeters * 0.09,
    frontHeight: sightHeight,
    frontWidth: sightWidth,
    frontDepth: clampRange(input.barrelRadiusMeters * 1.5, 0.025, 0.07),
    rearZ,
    rearBaseY: input.receiverHeightMeters * 0.12,
    rearHeight,
    rearEarWidth: earWidth,
    rearNotchWidth: notchWidth,
    rearDepth: clampRange(input.barrelRadiusMeters * 1.7, 0.03, 0.08),
    railY: input.receiverHeightMeters * 0.16,
    railHeight: clampRange(input.receiverHeightMeters * 0.06, 0.01, 0.02),
    railWidth: Math.max(notchWidth + earWidth * 2, input.receiverWidthMeters * 0.54),
  };
};

/** Resolve all derived quantities and deterministic hash for one parametric profile. */
export const resolveGunProfileV1 = (input: GunPrimitivesV1): GunResolvedProfileV1 => {
  if (input.profileId.trim().length === 0 || input.displayName.trim().length === 0) {
    throw new Error("Gun profiles require a profileId and displayName");
  }
  if (input.generatorSeed.trim().length === 0) {
    throw new Error(`Invalid generatorSeed for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.damagePerProjectile) || input.damagePerProjectile <= 0) {
    throw new Error(`Invalid damagePerProjectile for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.projectilesPerShot) || input.projectilesPerShot <= 0) {
    throw new Error(`Invalid projectilesPerShot for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.fireIntervalSeconds) || input.fireIntervalSeconds <= 0) {
    throw new Error(`Invalid fireIntervalSeconds for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.burstSize) || input.burstSize <= 0) {
    throw new Error(`Invalid burstSize for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.burstCooldownSeconds) || input.burstCooldownSeconds < 0) {
    throw new Error(`Invalid burstCooldownSeconds for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.magazineSize) || input.magazineSize <= 0) {
    throw new Error(`Invalid magazineSize for profile ${input.profileId}`);
  }
  if (!Number.isFinite(input.reserveAmmo) || input.reserveAmmo < 0) {
    throw new Error(`Invalid reserveAmmo for profile ${input.profileId}`);
  }
  if (input.damagePerProjectile > 250 || input.projectilesPerShot > 32) {
    throw new Error(`Payload exceeds v1 bounds for profile ${input.profileId}`);
  }
  if (input.fireIntervalSeconds < 0.02 || input.magazineSize > 256 || input.reserveAmmo > 8192) {
    throw new Error(`Cadence or ammunition exceeds v1 bounds for profile ${input.profileId}`);
  }
  for (const [name, value] of [
    ["spreadRadians", input.spreadRadians],
    ["hotBarrelLengthMeters", input.hotBarrelLengthMeters],
    ["barrelRadiusMeters", input.barrelRadiusMeters],
    ["receiverLengthMeters", input.receiverLengthMeters],
    ["receiverWidthMeters", input.receiverWidthMeters],
    ["receiverHeightMeters", input.receiverHeightMeters],
    ["massKg", input.massKg],
    ["gripAngleRadians", input.gripAngleRadians],
    ["stockLengthMeters", input.stockLengthMeters],
    ["accentColor", input.accentColor],
  ] as const) {
    if (
      !Number.isFinite(value) ||
      (name !== "spreadRadians" && name !== "gripAngleRadians" && value <= 0)
    ) {
      throw new Error(`Invalid ${name} for profile ${input.profileId}`);
    }
  }
  if (
    input.spreadRadians < 0 ||
    (input.opticMagnification !== null &&
      (!Number.isFinite(input.opticMagnification) || input.opticMagnification <= 0))
  ) {
    throw new Error(`Invalid optic or spread for profile ${input.profileId}`);
  }
  if (!(["clip", "round", "belt"] as const).includes(input.feedStyle)) {
    throw new Error(`Invalid feedStyle for profile ${input.profileId}`);
  }
  if (
    input.spreadRadians <= 0.000001 &&
    input.damagePerProjectile * input.projectilesPerShot > 400 &&
    input.fireIntervalSeconds < 0.08
  ) {
    throw new Error(
      `Zero-spread high-payload profile violates the v1 tradeoff for ${input.profileId}`,
    );
  }
  const safeSpread = Math.max(0, input.spreadRadians);
  const magazineSize = Math.floor(input.magazineSize);
  const reserveAmmo = Math.floor(Math.max(0, input.reserveAmmo));
  const burstSize = Math.max(1, Math.floor(input.burstSize));
  const fireIntervalSeconds = input.fireIntervalSeconds;
  const cyclicRate = 1 / fireIntervalSeconds;
  const burstCooldownSeconds = Math.max(input.fireIntervalSeconds, input.burstCooldownSeconds);
  const projectilesPerShot = Math.max(1, Math.floor(input.projectilesPerShot));
  const damagePerProjectile = input.damagePerProjectile;
  const groupDamage = damagePerProjectile * projectilesPerShot;
  const burstDamage = groupDamage * burstSize;
  const magazineDamage = groupDamage * magazineSize;
  const inventoryDamage = groupDamage * (magazineSize + reserveAmmo);
  const burstCycleTime =
    burstSize === 1
      ? fireIntervalSeconds
      : (burstSize - 1) * fireIntervalSeconds + burstCooldownSeconds;
  const burstsPerSecond = burstCycleTime <= 0 ? 0 : 1 / burstCycleTime;
  const fullBursts = Math.floor(magazineSize / burstSize);
  const remainderRounds = magazineSize - fullBursts * burstSize;
  const timeToEmptyMagazineSeconds =
    fullBursts * burstCycleTime + remainderRounds * fireIntervalSeconds;
  const clipReloadSeconds =
    WEAPON_CLIP_RELOAD_BASE_SECONDS + magazineDamage / WEAPON_CLIP_LOADER_RATE;
  const roundInterval = WEAPON_ROUND_RELOAD_BASE_SECONDS + groupDamage / WEAPON_ROUND_LOADER_RATE;
  const beltReloadSeconds =
    WEAPON_BELT_RELOAD_BASE_SECONDS + magazineDamage / WEAPON_BELT_LOADER_RATE;
  const roundReloadSeconds = roundInterval * magazineSize;
  const reloadMode = input.feedStyle;
  const reloadSeconds =
    reloadMode === "clip"
      ? clipReloadSeconds
      : reloadMode === "round"
        ? roundReloadSeconds
        : beltReloadSeconds;
  const reloadIntervalSeconds =
    reloadMode === "belt"
      ? beltReloadSeconds / magazineSize
      : reloadMode === "round"
        ? roundInterval
        : reloadSeconds;
  const handling = resolveHandling(
    input.massKg,
    input.hotBarrelLengthMeters,
    input.stockLengthMeters,
  );
  const recoilKick =
    WEAPON_RECOIL_MAX_AMOUNT *
    (Math.max(0.2, damagePerProjectile / WEAPON_RECOIL_DAMAGE_SCALE) /
      (handling + WEAPON_RECOIL_HANDLING_BIAS));
  const expectedShotsFromFullInventory = magazineSize + reserveAmmo;
  const expectedMagazines = Math.max(1, Math.ceil(expectedShotsFromFullInventory / magazineSize));
  const sustainedMagazineCycleSeconds = Math.max(
    0.001,
    timeToEmptyMagazineSeconds + (reloadSeconds === 0 ? 0 : reloadSeconds),
  );
  const expectedBulletsPerSecond = magazineSize / sustainedMagazineCycleSeconds;
  const sustainedDamagePerSecond = magazineDamage / sustainedMagazineCycleSeconds;
  const handlingSpreadFactor = clampRange(1 + handling * 0.16, 1, 1.55);
  const hipSpreadRadians = safeSpread * handlingSpreadFactor;
  const opticSpreadFactor =
    input.opticMagnification === null
      ? 1
      : clampRange(1 / Math.max(1, input.opticMagnification), 0.2, 1);
  const zoomSpreadRadians = hipSpreadRadians * opticSpreadFactor;
  const heatSpreadFactor = clampRange(1.08 + handling * 0.08, 1.08, 1.42);
  const recoverySpreadFactor = clampRange(1.05 + recoilKick * 0.8, 1.05, 1.85);
  const oxygenCostPerGroup = WEAPON_OXYGEN_DAMAGE_FACTOR * groupDamage;
  const oxygenCostPerBurst = oxygenCostPerGroup * burstSize;
  const oxygenCostPerMagazine = oxygenCostPerGroup * magazineSize;
  const damagePerReload = magazineDamage;
  const reserveMagazineCount = Math.max(1, Math.ceil(reserveAmmo / magazineSize));
  const reserveCycleSeconds = Math.max(0.001, reserveMagazineCount * sustainedMagazineCycleSeconds);
  const reserveDamagePerSecond = (groupDamage * reserveAmmo) / reserveCycleSeconds;
  const audio = resolveGunAudioProfileV1(
    groupDamage,
    input.hotBarrelLengthMeters,
    fireIntervalSeconds,
    reloadMode,
  );

  const normalizedInput: GunPrimitivesV1 = {
    ...input,
    magazineSize,
    reserveAmmo,
    projectilesPerShot,
    fireIntervalSeconds,
    burstCooldownSeconds,
    burstSize,
    spreadRadians: safeSpread,
  };

  const profilePayload = {
    ...normalizedInput,
    formulaVersion: WEAPON_FORMULA_VERSION,
    shortLabel: input.profileId
      .replace(/[^a-z0-9]+/giu, " ")
      .trim()
      .slice(0, 16)
      .toUpperCase(),
    ironSight: resolveGunIronSightProfile(normalizedInput),
    groupDamage,
    burstDamage,
    magazineDamage,
    inventoryDamage,
    cyclicRate,
    projectilesPerSecond: cyclicRate * projectilesPerShot,
    burstsPerSecond,
    burstCycleTime,
    burstDps: burstDamage * burstsPerSecond,
    timeToEmptyMagazineSeconds,
    clipReloadSeconds,
    roundInterval,
    roundReloadSeconds,
    beltReloadSeconds,
    reloadIntervalSeconds,
    reloadWork: magazineDamage,
    reloadSeconds,
    reloadMode,
    reloadCanInterrupt: reloadMode !== "clip",
    handling,
    recoilKick,
    aimRecoveryTime: clampRange(recoilKick * 0.95 + 0.6, 0.15, 2.8),
    movementPenalty: clampRange(0.22 * handling + 0.1, 0.1, 0.9),
    switchTime: clampRange(0.16 + handling * 0.06, 0.1, 0.95),
    expectedShotsFromFullInventory,
    expectedGroupDamageFromFullInventory: groupDamage * expectedShotsFromFullInventory,
    expectedMagazines,
    expectedBulletsPerSecond,
    sustainedDamagePerSecond,
    handlingSpreadFactor,
    hipSpreadRadians,
    zoomSpreadRadians,
    heatSpreadFactor,
    recoverySpreadFactor,
    oxygenCostPerGroup,
    oxygenCostPerBurst,
    oxygenCostPerMagazine,
    damagePerReload,
    reserveDamagePerSecond,
    audio,
    profileHash: "",
  };
  const profileWithoutHash = { ...profilePayload, profileHash: undefined };
  const profileHash = resolveProfileHash(profileWithoutHash);
  return {
    ...profilePayload,
    profileHash,
  };
};

export interface GenerateGunProfileOptions {
  readonly displayName?: string;
  readonly profileId?: string;
  readonly archetype?: GunGenerationArchetypeV1;
}

export interface GunProfileGenerationResultV1 {
  readonly profile: GunResolvedProfileV1;
  readonly receipt: GunGenerationReceiptV1;
}

/** A tunable envelope for a heavy generated test family, not a runtime branch. */
export interface GunProfileEnvelopeV1 {
  readonly payload: readonly [number, number];
  readonly cadence: readonly [number, number];
  readonly capacity: readonly [number, number];
  readonly reach: readonly [number, number];
  readonly mass: readonly [number, number];
  readonly accuracy: readonly [number, number];
}

export const HEAVY_TURRET_PROFILE_ENVELOPE_V1: GunProfileEnvelopeV1 = Object.freeze({
  payload: [0.78, 0.98] as const,
  cadence: [0.28, 0.62] as const,
  capacity: [0.72, 0.98] as const,
  reach: [0.72, 1] as const,
  mass: [0.78, 1] as const,
  accuracy: [0.2, 0.72] as const,
});

const resolveEnvelopeValue = (value: number, envelope: readonly [number, number]): number =>
  envelope[0] + clampRange(value, 0, 1) * (envelope[1] - envelope[0]);

/** Return deterministic, human-readable tradeoff violations for a profile. */
export const getGunTradeoffViolationsV1 = (
  profile: Pick<
    GunResolvedProfileV1,
    | "profileId"
    | "groupDamage"
    | "spreadRadians"
    | "fireIntervalSeconds"
    | "sustainedDamagePerSecond"
    | "reloadSeconds"
    | "massKg"
    | "handling"
  >,
): readonly string[] => {
  const violations: string[] = [];
  if (profile.sustainedDamagePerSecond > 12_000) {
    violations.push("sustained damage exceeds the v1 playtest ceiling");
  }
  if (profile.reloadSeconds > 180) {
    violations.push("reload work exceeds the v1 interaction ceiling");
  }
  if (
    profile.spreadRadians <= 0.000001 &&
    profile.groupDamage > 400 &&
    profile.fireIntervalSeconds < 0.08
  ) {
    violations.push("maximum payload and cadence require a non-zero spread cost");
  }
  if (profile.massKg >= 5.4 && profile.handling < 1.05) {
    violations.push("heavy profiles require a handling cost");
  }
  return violations.map((violation) => `${profile.profileId}: ${violation}`);
};

/** Boolean convenience form for UI and test harness validation. */
export const validateGunTradeoffsV1 = (
  profile: Pick<
    GunResolvedProfileV1,
    | "profileId"
    | "groupDamage"
    | "spreadRadians"
    | "fireIntervalSeconds"
    | "sustainedDamagePerSecond"
    | "reloadSeconds"
    | "massKg"
    | "handling"
  >,
): boolean => getGunTradeoffViolationsV1(profile).length === 0;

const GENERATED_GUN_NAME_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GENERATED_GUN_NAME_CODE_LENGTH = 6;

const GENERATED_GUN_NAME_NOUNS: Readonly<Record<WeaponReloadMode, readonly string[]>> = {
  clip: ["Ember", "Comet", "Signal", "Halo", "Cinder", "Vesper", "Arrow", "Echo", "Lumen"],
  round: ["Needle", "Hail", "Shard", "Lance", "Frost", "Pulse", "Meteor", "Rook", "Quill"],
  belt: ["Hammer", "Thunder", "Anvil", "Forge", "Torrent", "Atlas", "Quake", "Bastion", "Rumble"],
};

const resolveNameScore = (value: number): number =>
  clampRange(Number.isFinite(value) ? value : 0, 0, 0.999999);

const resolveNameBand = (value: number): number =>
  Math.min(2, Math.floor(resolveNameScore(value) * 3));

const resolveGeneratedGunNameFeedStyle = (value: unknown): WeaponReloadMode => {
  if (value === "clip" || value === "round" || value === "belt") {
    return value;
  }
  return "clip";
};

const resolveGeneratedGunNameCodeV1 = (
  roomSeed: string,
  gunSeed: string,
  archetype: GunGenerationArchetypeV1 = "general",
): string => {
  const random = createSeededRandom(
    resolveWeaponNameGenerationStream(roomSeed, gunSeed, WEAPON_FORMULA_VERSION, archetype),
  );
  let code = "";
  for (let index = 0; index < GENERATED_GUN_NAME_CODE_LENGTH; index += 1) {
    const character =
      GENERATED_GUN_NAME_CODE_ALPHABET[random.nextInt(GENERATED_GUN_NAME_CODE_ALPHABET.length)];
    if (character !== undefined) {
      code += character;
    }
  }
  return code;
};

/**
 * Resolve a memorable generated name from the latent tradeoffs and a stable
 * short code. The code is derived from a name-only stream, so adding the name
 * to the profile hash cannot create a circular dependency.
 */
export const resolveGeneratedGunNameV1 = (
  roomSeed: string,
  gunSeed: string,
  latent: GunLatentVectorV1,
  archetype: GunGenerationArchetypeV1 = "general",
): string => {
  const adjectiveAxes: readonly {
    readonly score: number;
    readonly words: readonly [string, string, string];
  }[] = [
    { score: latent.accuracy, words: ["Wild", "Keen", "True"] },
    { score: latent.cadence, words: ["Measured", "Steady", "Swift"] },
    { score: latent.payload, words: ["Light", "Forceful", "Thunder"] },
    { score: latent.mass, words: ["Feather", "Balanced", "Iron"] },
    { score: latent.reach, words: ["Close", "Far", "Long"] },
    { score: latent.capacity, words: ["Lean", "Ready", "Deep"] },
  ];
  let adjectiveAxis = adjectiveAxes[0];
  for (const candidate of adjectiveAxes.slice(1)) {
    if (
      adjectiveAxis === undefined ||
      resolveNameScore(candidate.score) > resolveNameScore(adjectiveAxis.score)
    ) {
      adjectiveAxis = candidate;
    }
  }
  const adjective = adjectiveAxis?.words[resolveNameBand(adjectiveAxis.score)] ?? "True";
  const feedStyle = resolveGeneratedGunNameFeedStyle(latent.feedStyle);
  const nounPool = GENERATED_GUN_NAME_NOUNS[feedStyle];
  const nounMix =
    resolveNameScore(latent.payload) * 0.35 +
    resolveNameScore(latent.capacity) * 0.25 +
    resolveNameScore(latent.reach) * 0.2 +
    resolveNameScore(latent.accuracy) * 0.2;
  const noun =
    nounPool[Math.min(nounPool.length - 1, Math.floor(nounMix * nounPool.length))] ?? "Signal";
  const code = resolveGeneratedGunNameCodeV1(roomSeed, gunSeed, archetype);
  return `${adjective} ${noun} · ${code}`;
};

const sampleGunLatentVectorV1 = (
  random: ReturnType<typeof createSeededRandom>,
  archetype: GunGenerationArchetypeV1 = "general",
): GunLatentVectorV1 => {
  if (archetype === "submachine") {
    return {
      // A submachine profile is a compact, single-projectile, high-cadence
      // envelope. It remains data-driven; the runtime never branches on this
      // label.
      payload: 0.18 + random.nextFloat() * 0.52,
      cadence: 0.72 + random.nextFloat() * 0.28,
      capacity: 0.3 + random.nextFloat() * 0.6,
      reach: 0.05 + random.nextFloat() * 0.45,
      mass: 0.05 + random.nextFloat() * 0.35,
      accuracy: 0.35 + random.nextFloat() * 0.6,
      feedStyle: "clip",
    };
  }
  const payload = 0.2 + random.nextFloat() * 0.8;
  const cadence = 0.12 + random.nextFloat() * 0.88;
  const capacity = 0.15 + random.nextFloat() * 0.85;
  const reach = random.nextFloat();
  const mass = 0.2 + random.nextFloat() * 0.8;
  const accuracy = random.nextFloat();
  const feedStyle: WeaponReloadMode =
    random.nextInt(3) === 0 ? "round" : random.nextInt(2) === 0 ? "belt" : "clip";
  return { payload, cadence, capacity, reach, mass, accuracy, feedStyle };
};

const generateGunProfileFromLatentV1 = (
  latent: GunLatentVectorV1,
  random: ReturnType<typeof createSeededRandom>,
  profileId: string,
  displayName: string,
  gunSeed: string,
  archetype: GunGenerationArchetypeV1 = "general",
): GunResolvedProfileV1 => {
  // Cadence and payload share a budget. This keeps a high-energy profile from
  // also receiving the fastest cyclic rate by construction.
  const effectiveCadence = latent.cadence * (1 - latent.payload * 0.44);
  const isSubmachine = archetype === "submachine";
  const feedStyle = isSubmachine ? "clip" : latent.feedStyle;
  const projectilesPerShot = isSubmachine ? 1 : Math.max(1, Math.round(1 + latent.payload * 7));
  const damagePerProjectile = isSubmachine ? 9 + latent.payload * 10 : 8 + latent.payload * 68;
  const magazineSize =
    feedStyle === "belt"
      ? Math.max(12, Math.round(24 + latent.capacity * 72))
      : feedStyle === "round"
        ? Math.max(4, Math.round(4 + latent.capacity * 10))
        : isSubmachine
          ? Math.max(20, Math.round(20 + latent.capacity * 10))
          : Math.max(8, Math.round(8 + latent.capacity * 36));
  const reserveAmmo = magazineSize * (2 + Math.round(random.nextFloat() * 4));
  const receiverLengthMeters = isSubmachine ? 0.34 + latent.reach * 0.5 : 0.42 + latent.reach * 0.9;
  const hotBarrelLengthMeters = isSubmachine
    ? 0.24 + latent.reach * 0.55
    : 0.28 + latent.reach * 1.15;
  return resolveGunProfileV1({
    profileId,
    displayName,
    damagePerProjectile,
    projectilesPerShot,
    fireIntervalSeconds: isSubmachine
      ? 0.045 + (1 - effectiveCadence) * 0.09
      : 0.075 + (1 - effectiveCadence) * 0.82,
    burstSize: isSubmachine
      ? 1
      : effectiveCadence > 0.82
        ? 1
        : 1 + Math.floor(random.nextFloat() * 3),
    burstCooldownSeconds: isSubmachine
      ? 0.08 + (1 - effectiveCadence) * 0.12
      : 0.14 + (1 - effectiveCadence) * 0.7,
    magazineSize,
    reserveAmmo,
    feedStyle,
    spreadRadians: isSubmachine
      ? 0.018 + (1 - latent.accuracy) * 0.045
      : 0.005 + (1 - latent.accuracy) * 0.095,
    hotBarrelLengthMeters,
    barrelRadiusMeters: isSubmachine
      ? 0.03 + latent.payload * 0.02
      : 0.035 + latent.payload * 0.035,
    receiverLengthMeters,
    receiverWidthMeters: isSubmachine ? 0.16 + latent.mass * 0.08 : 0.18 + latent.mass * 0.14,
    receiverHeightMeters: isSubmachine ? 0.13 + latent.mass * 0.1 : 0.14 + latent.mass * 0.17,
    massKg: isSubmachine ? 0.65 + latent.mass * 2.2 : 0.7 + latent.mass * 5.2,
    gripAngleRadians: -0.22 + random.nextFloat() * 0.44,
    stockLengthMeters: isSubmachine ? 0.08 + latent.reach * 0.35 : 0.12 + latent.reach * 0.7,
    opticMagnification:
      isSubmachine || latent.accuracy <= 0.72 ? null : 1.5 + latent.accuracy * 3.5,
    accentColor: Math.floor(0x5e8fa0 + random.nextFloat() * 0x8a6f59),
    generatorSeed: gunSeed,
  });
};

/** Generate a bounded latent profile and its redacted deterministic receipt. */
export const generateGunProfileWithReceiptV1 = (
  roomSeed: string,
  gunSeed: string,
  options: GenerateGunProfileOptions = {},
): GunProfileGenerationResultV1 => {
  const normalizedGunSeed = gunSeed.trim();
  if (normalizedGunSeed.length === 0) {
    throw new Error("Invalid generatorSeed for generated gun");
  }
  const normalizedRoomSeed = roomSeed.trim() || "room-01";
  const archetype = options.archetype ?? "general";
  const stream = resolveWeaponGenerationStream(
    normalizedRoomSeed,
    normalizedGunSeed,
    WEAPON_FORMULA_VERSION,
    archetype,
  );
  const nameStream = resolveWeaponNameGenerationStream(
    normalizedRoomSeed,
    normalizedGunSeed,
    WEAPON_FORMULA_VERSION,
    archetype,
  );
  const random = createSeededRandom(stream);
  const latent = sampleGunLatentVectorV1(random, archetype);
  const profileId = options.profileId ?? `generated-${normalizedGunSeed}`;
  const displayName =
    options.displayName ??
    resolveGeneratedGunNameV1(normalizedRoomSeed, normalizedGunSeed, latent, archetype);
  let boundedLatent = latent;
  let profile = generateGunProfileFromLatentV1(
    boundedLatent,
    random,
    profileId,
    displayName,
    normalizedGunSeed,
    archetype,
  );
  let violations = getGunTradeoffViolationsV1(profile);
  for (let attempt = 0; attempt < 8 && violations.length > 0; attempt += 1) {
    // Keep the original sampled direction, but progressively buy down the
    // offending payload/capacity axes instead of silently dropping a seed.
    boundedLatent = {
      ...boundedLatent,
      payload: Math.max(0.2, boundedLatent.payload * 0.88),
      capacity: Math.max(0.15, boundedLatent.capacity * 0.78),
      cadence: Math.max(0.12, boundedLatent.cadence * 0.92),
    };
    profile = generateGunProfileFromLatentV1(
      boundedLatent,
      random,
      profileId,
      displayName,
      normalizedGunSeed,
      archetype,
    );
    violations = getGunTradeoffViolationsV1(profile);
  }
  if (violations.length > 0) {
    throw new Error(`Generated gun failed v1 tradeoff validation: ${violations.join("; ")}`);
  }
  return {
    profile,
    receipt: {
      formulaVersion: WEAPON_FORMULA_VERSION,
      archetype,
      roomSeed: normalizedRoomSeed,
      gunSeed: normalizedGunSeed,
      stream,
      nameStream,
      profileId: profile.profileId,
      displayName: profile.displayName,
      profileHash: profile.profileHash,
      latent: boundedLatent,
    },
  };
};

/** Generate the profile alone for existing generic inventory callers. */
export const generateGunProfileV1 = (
  roomSeed: string,
  gunSeed: string,
  options: GenerateGunProfileOptions = {},
): GunResolvedProfileV1 => generateGunProfileWithReceiptV1(roomSeed, gunSeed, options).profile;

/**
 * Generate a heavy-turret test candidate through the same generic resolver.
 * The envelope only biases latent sampling; it never becomes a runtime branch.
 */
export const generateHeavyTurretGunProfileV1 = (
  roomSeed: string,
  gunSeed: string,
  options: GenerateGunProfileOptions = {},
): GunResolvedProfileV1 => {
  const normalizedGunSeed = gunSeed.trim();
  if (normalizedGunSeed.length === 0) {
    throw new Error("Invalid generatorSeed for generated gun");
  }
  const normalizedRoomSeed = roomSeed.trim() || "room-01";
  const stream = resolveWeaponGenerationStream(normalizedRoomSeed, normalizedGunSeed);
  const random = createSeededRandom(`${stream}|heavy-envelope`);
  const latent: GunLatentVectorV1 = {
    payload: resolveEnvelopeValue(random.nextFloat(), HEAVY_TURRET_PROFILE_ENVELOPE_V1.payload),
    cadence: resolveEnvelopeValue(random.nextFloat(), HEAVY_TURRET_PROFILE_ENVELOPE_V1.cadence),
    capacity: resolveEnvelopeValue(random.nextFloat(), HEAVY_TURRET_PROFILE_ENVELOPE_V1.capacity),
    reach: resolveEnvelopeValue(random.nextFloat(), HEAVY_TURRET_PROFILE_ENVELOPE_V1.reach),
    mass: resolveEnvelopeValue(random.nextFloat(), HEAVY_TURRET_PROFILE_ENVELOPE_V1.mass),
    accuracy: resolveEnvelopeValue(random.nextFloat(), HEAVY_TURRET_PROFILE_ENVELOPE_V1.accuracy),
    feedStyle: "belt",
  };
  return generateGunProfileFromLatentV1(
    latent,
    random,
    options.profileId ?? `generated-heavy-${normalizedGunSeed}`,
    options.displayName ?? resolveGeneratedGunNameV1(normalizedRoomSeed, normalizedGunSeed, latent),
    normalizedGunSeed,
  );
};

/** Default number of generated profiles staged in the parametric test catalog. */
export const DEFAULT_PARAMETRIC_GUN_CATALOG_COUNT = 24;
export const MAX_PARAMETRIC_GUN_CATALOG_COUNT = 96;
/** Half of the default campus catalog is reserved for the high-cadence SMG family. */
export const DEFAULT_PARAMETRIC_GUN_SMG_COUNT = 12;

/** Generate a stable, indexed catalog that testers can reproduce from a room seed. */
export const generateParametricGunCatalogV1 = (
  roomSeed: string,
  count: number = DEFAULT_PARAMETRIC_GUN_CATALOG_COUNT,
): readonly GunProfileGenerationResultV1[] => {
  const normalizedRoomSeed = roomSeed.trim() || "room-01";
  const safeCount = Math.max(
    0,
    Math.min(MAX_PARAMETRIC_GUN_CATALOG_COUNT, Math.floor(Number.isFinite(count) ? count : 0)),
  );
  return Array.from({ length: safeCount }, (_, index) =>
    generateGunProfileWithReceiptV1(
      normalizedRoomSeed,
      `catalog-${String(index + 1).padStart(3, "0")}`,
      {
        archetype:
          index < Math.min(DEFAULT_PARAMETRIC_GUN_SMG_COUNT, safeCount) ? "submachine" : "general",
      },
    ),
  );
};

const resolveParetoMetrics = (profile: GunResolvedProfileV1): readonly number[] => [
  profile.burstDps,
  profile.sustainedDamagePerSecond,
  1 / Math.max(0.0001, profile.zoomSpreadRadians + 0.001),
  1 / Math.max(0.001, profile.movementPenalty),
  profile.reserveDamagePerSecond,
  -profile.reloadSeconds,
  -profile.oxygenCostPerGroup,
];

const dominatesParetoMetrics = (left: readonly number[], right: readonly number[]): boolean => {
  let strictlyBetter = false;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue < rightValue) {
      return false;
    }
    if (leftValue > rightValue) {
      strictlyBetter = true;
    }
  }
  return strictlyBetter;
};

/** Keep profiles with different objective tradeoffs instead of one score. */
export const filterGunProfilesParetoV1 = (
  profiles: readonly GunResolvedProfileV1[],
): readonly GunResolvedProfileV1[] =>
  profiles.filter((candidate, candidateIndex) => {
    const candidateMetrics = resolveParetoMetrics(candidate);
    return !profiles.some(
      (other, otherIndex) =>
        otherIndex !== candidateIndex &&
        dominatesParetoMetrics(resolveParetoMetrics(other), candidateMetrics),
    );
  });

/** Alias with the noun-first spelling used by profile tooling. */
export const paretoFilterGunProfilesV1 = filterGunProfilesParetoV1;

/** Extract the canonical primitive input from a resolved profile for revalidation and replay. */
const extractGunPrimitivesV1 = (profile: GunResolvedProfileV1): GunPrimitivesV1 => ({
  profileId: profile.profileId,
  displayName: profile.displayName,
  damagePerProjectile: profile.damagePerProjectile,
  projectilesPerShot: profile.projectilesPerShot,
  fireIntervalSeconds: profile.fireIntervalSeconds,
  burstSize: profile.burstSize,
  burstCooldownSeconds: profile.burstCooldownSeconds,
  magazineSize: profile.magazineSize,
  reserveAmmo: profile.reserveAmmo,
  feedStyle: profile.feedStyle,
  spreadRadians: profile.spreadRadians,
  hotBarrelLengthMeters: profile.hotBarrelLengthMeters,
  barrelRadiusMeters: profile.barrelRadiusMeters,
  receiverLengthMeters: profile.receiverLengthMeters,
  receiverWidthMeters: profile.receiverWidthMeters,
  receiverHeightMeters: profile.receiverHeightMeters,
  massKg: profile.massKg,
  gripAngleRadians: profile.gripAngleRadians,
  stockLengthMeters: profile.stockLengthMeters,
  opticMagnification: profile.opticMagnification,
  accentColor: profile.accentColor,
  generatorSeed: profile.generatorSeed,
});

/** Reject tampered or stale resolved profiles before they become live instances. */
const validateResolvedGunProfileV1 = (profile: GunResolvedProfileV1): void => {
  const canonical = resolveGunProfileV1(extractGunPrimitivesV1(profile));
  const selfHash = resolveProfileHash({ ...profile, profileHash: undefined });
  if (
    profile.profileHash !== canonical.profileHash ||
    selfHash !== profile.profileHash ||
    !validateGunTradeoffsV1(profile)
  ) {
    throw new Error(`Invalid resolved gun profile ${profile.profileId}`);
  }
};

/** Create a mutable instance while preserving the resolved profile hash. */
export const createGunInstance = (
  profile: GunResolvedProfileV1,
  instanceId: string,
  overrides: Partial<Pick<GunInstance, "loadedAmmo" | "reserveAmmo" | "temperatureC">> = {},
): GunInstance => {
  if (instanceId.trim().length === 0) {
    throw new Error("Gun instances require an instanceId");
  }
  validateResolvedGunProfileV1(profile);
  return {
    instanceId,
    profileHash: profile.profileHash,
    primitives: extractGunPrimitivesV1(profile),
    profile,
    generatorSeed: profile.generatorSeed,
    loadedAmmo: Math.max(
      0,
      Math.min(profile.magazineSize, Math.floor(overrides.loadedAmmo ?? profile.magazineSize)),
    ),
    reserveAmmo: Math.max(0, Math.floor(overrides.reserveAmmo ?? profile.reserveAmmo)),
    temperatureC: Math.max(0, overrides.temperatureC ?? 0),
  };
};

/** One second of reload time for every 100 damage represented by the reload. */
export const WEAPON_RELOAD_SECONDS_PER_DAMAGE = 0.01;

/** A high-damage trigger pull is reloaded one bullet or shell at a time. */
export const WEAPON_ROUND_RELOAD_DAMAGE_THRESHOLD = 100;

/** Resolve a number-row weapon key; `Digit0` is the explicit empty-hand slot. */
export const resolveWeaponHotkey = (code: string): number | null | undefined => {
  if (code === "Digit0") {
    return null;
  }
  if (!/^Digit[1-4]$/u.test(code)) {
    return undefined;
  }
  return Number(code.slice(-1)) - 1;
};

/** Presentation lifetimes for the deterministic shot effects. */
export const WEAPON_TRACER_LIFETIME_SECONDS = 0.14;
export const WEAPON_IMPACT_LIFETIME_SECONDS = 0.18;
export const WEAPON_BULLET_HOLE_LIFETIME_SECONDS = 5 * 60;
export const WEAPON_BULLET_HOLE_FADE_SECONDS = 12;
/** Keep sustained automatic fire from accumulating unbounded scene objects. */
export const WEAPON_BULLET_HOLE_MAX_COUNT = 256;

/** Damage payload that makes a barrel fully red hot. */
export const WEAPON_BARREL_HEAT_DAMAGE_THRESHOLD = 500;
/** Full red-hot saturation cools back to ambient within thirty seconds. */
export const WEAPON_BARREL_HEAT_MAX_SATURATION_SECONDS = 30;
/** Linear cooling rate shared by every weapon barrel. */
export const WEAPON_BARREL_HEAT_COOLDOWN_DAMAGE_PER_SECOND =
  WEAPON_BARREL_HEAT_DAMAGE_THRESHOLD / WEAPON_BARREL_HEAT_MAX_SATURATION_SECONDS;
/** Cooling time for the full red-hot threshold at the shared linear rate. */
export const WEAPON_BARREL_HEAT_COOLDOWN_SECONDS = WEAPON_BARREL_HEAT_MAX_SATURATION_SECONDS;

/** Heat band in which a barrel begins to produce a visible thermal wisp. */
export const WEAPON_BARREL_SMOKE_START_HEAT_RATIO = 0.35;
/** Heat band at which the thermal wisp emitter reaches its full rate. */
export const WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO = 0.8;
/** Base thermal-wisp rate for the longest heated barrel; shorter barrels emit more often. */
export const WEAPON_BARREL_SMOKE_MAX_RATE = 4;
/** Fixed sprite budget for a held weapon's shot and thermal smoke. */
export const WEAPON_BARREL_SMOKE_POOL_SIZE = 192;

/**
 * Resolve a barrel's remaining heat load after one hit and one elapsed-time
 * slice. Hit damage is deliberately separate from shots fired: a miss adds no
 * heat, and every shotgun pellet that hits contributes its own damage.
 */
export const resolveWeaponBarrelHeatDamage = (
  currentDamage: number,
  hitDamage = 0,
  elapsedSeconds = 0,
): number => {
  const current = Number.isFinite(currentDamage) ? Math.max(0, currentDamage) : 0;
  const added = Number.isFinite(hitDamage) ? Math.max(0, hitDamage) : 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  return Math.max(0, current + added - elapsed * WEAPON_BARREL_HEAT_COOLDOWN_DAMAGE_PER_SECOND);
};

/** Resolve the clamped red-hot presentation ratio for a heat load. */
export const resolveWeaponBarrelHeatRatio = (damage: number): number => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  return Math.min(1, safeDamage / WEAPON_BARREL_HEAT_DAMAGE_THRESHOLD);
};

/** Resolve a smoothed thermal-smoke ratio from the normalized barrel heat. */
export const resolveWeaponBarrelSmokeRatio = (heatRatio: number): number => {
  const safeRatio = Number.isFinite(heatRatio) ? Math.max(0, Math.min(1, heatRatio)) : 0;
  const span = WEAPON_BARREL_SMOKE_FULL_HEAT_RATIO - WEAPON_BARREL_SMOKE_START_HEAT_RATIO;
  const normalized = Math.max(
    0,
    Math.min(1, (safeRatio - WEAPON_BARREL_SMOKE_START_HEAT_RATIO) / span),
  );
  return normalized * normalized * (3 - 2 * normalized);
};

/** Resolve the linear cooldown time for a barrel's current heat load. */
export const resolveWeaponBarrelCooldownSeconds = (damage: number): number => {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  return safeDamage / WEAPON_BARREL_HEAT_COOLDOWN_DAMAGE_PER_SECOND;
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

interface WeaponDefinitionInput {
  readonly id: WeaponId;
  readonly label: string;
  readonly shortLabel: string;
  readonly damage: number;
  readonly pellets: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly fireIntervalSeconds: number;
  /** Explicit override for unusual weapons; ordinary new guns use the damage threshold. */
  readonly reloadMode?: WeaponReloadMode;
  /** Inherent projectile cone. Non-shotguns keep this at zero and rely on the shared aim stack. */
  readonly spreadRadians: number;
  readonly color: number;
  readonly ironSight: WeaponIronSightProfile;
}

export interface WeaponDefinition extends Omit<WeaponDefinitionInput, "reloadMode"> {
  /** Clip reloads finish once; round reloads insert one round per interval. */
  readonly reloadMode: WeaponReloadMode;
  /** Damage represented by one reload operation, derived from the weapon profile. */
  readonly totalDamagePerShot: number;
  /** Full-clip duration for clip weapons, or one round/shell duration for round weapons. */
  readonly reloadSeconds: number;
}

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
  const definition = { ...input, reloadMode } as const;
  return {
    ...definition,
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
};

/** Adapt the named fixture catalog into the same generic profile contract. */
const createFixtureGunProfile = (id: WeaponId): GunResolvedProfileV1 => {
  const definition = WEAPON_DEFINITIONS[id];
  return resolveGunProfileV1({
    profileId: id,
    displayName: definition.label,
    damagePerProjectile: definition.damage,
    projectilesPerShot: definition.pellets,
    fireIntervalSeconds: definition.fireIntervalSeconds,
    burstSize: 1,
    burstCooldownSeconds: definition.fireIntervalSeconds,
    magazineSize: definition.magazineSize,
    reserveAmmo: definition.reserveAmmo,
    feedStyle: definition.reloadMode,
    spreadRadians: definition.spreadRadians,
    hotBarrelLengthMeters: Math.max(0.2, Math.abs(definition.ironSight.frontZ) * 0.9),
    barrelRadiusMeters: 0.04,
    receiverLengthMeters: Math.max(
      0.35,
      Math.abs(definition.ironSight.rearZ - definition.ironSight.frontZ) * 0.55,
    ),
    receiverWidthMeters: 0.2,
    receiverHeightMeters: 0.16,
    massKg: id === "pistol" ? 1.1 : id === "shotgun" ? 3.4 : id === "machineGun" ? 4.1 : 5.2,
    gripAngleRadians: -0.12,
    stockLengthMeters: id === "pistol" ? 0.12 : 0.42,
    opticMagnification: id === "sniper" ? 4 : null,
    accentColor: definition.color,
    generatorSeed: `fixture:${id}`,
  });
};

export const GUN_PROFILES: Readonly<Record<WeaponId, GunResolvedProfileV1>> = Object.freeze(
  Object.fromEntries(WEAPON_IDS.map((id) => [id, createFixtureGunProfile(id)])) as Record<
    WeaponId,
    GunResolvedProfileV1
  >,
);

export const resolveGunProfile = (profileId: string): GunResolvedProfileV1 | null => {
  const fixture = (WEAPON_IDS as readonly string[]).includes(profileId)
    ? GUN_PROFILES[profileId as WeaponId]
    : null;
  return fixture ?? null;
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
export const resolveWeaponSpreadRadians = (
  profile: Pick<GunResolvedProfileV1, "spreadRadians"> | Pick<WeaponDefinition, "spreadRadians">,
): number => Math.max(0, profile.spreadRadians);

/**
 * Resolve the short local view-model slide from the same per-projectile
 * damage value that drives the central camera recoil damper.
 */
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

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
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
  const progress = clamp01(elapsed / duration);
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
  readonly gun: GunInstance;
  readonly gunInstanceId: string;
  readonly profile: GunResolvedProfileV1;
  readonly profileHash: string;
  readonly profileId: string;
  readonly generatorSeed: string;
  readonly loadedAmmo: number;
  readonly reserveAmmo: number;
  readonly temperatureC: number;
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
  /** Requested spacing; the outdoor density cap enforces a 50 m minimum. */
  readonly minimumDistance?: number;
}

export interface ParametricGunPickupPlacementV1 {
  readonly position: readonly [number, number, number];
  readonly rotation?: number;
}

export interface GenerateParametricGunPickupOptionsV1 {
  readonly count?: number;
  readonly placements?: readonly ParametricGunPickupPlacementV1[];
}

// Keep standalone pickup generation aligned with the compact 250 m scene.
const DEFAULT_WORLD_HALF_SIZE = 125;
const WORLD_EDGE_MARGIN = 5;
const DEFAULT_PICKUP_COUNT_PER_WEAPON = 3;
/**
 * Procedural outdoor pickups use one gun at most in each 50 m horizontal
 * radius. Authored table and parametric-rack displays are intentionally
 * exempt from this world-spawn density rule.
 */
export const WEAPON_SPAWN_DENSITY_RADIUS_METERS = 50;
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
    profileId: "pistol",
    position: [2.65, PICKUP_HEIGHT, 3.55],
    rotation: -0.32,
  },
  {
    profileId: "shotgun",
    position: [-2.65, PICKUP_HEIGHT, 3.55],
    rotation: 0.32,
  },
  {
    profileId: "machineGun",
    position: [2.65, PICKUP_HEIGHT, -3.55],
    rotation: Math.PI - 0.32,
  },
  {
    profileId: "sniper",
    position: [-2.65, PICKUP_HEIGHT, -3.55],
    rotation: Math.PI + 0.32,
  },
] as const satisfies readonly {
  readonly profileId: WeaponId;
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

const createGunPickupSpawn = (
  id: string,
  profile: GunResolvedProfileV1,
  position: readonly [number, number, number],
  rotation: number,
  flags: { readonly starter?: boolean; readonly nearTable?: boolean } = {},
): WeaponPickupSpawn => {
  const gun = createGunInstance(profile, `${id}:gun`);
  return {
    id,
    gun,
    gunInstanceId: gun.instanceId,
    profile,
    profileHash: gun.profileHash,
    profileId: profile.profileId,
    generatorSeed: gun.generatorSeed,
    loadedAmmo: gun.loadedAmmo,
    reserveAmmo: gun.reserveAmmo,
    temperatureC: gun.temperatureC,
    position,
    rotation,
    ...flags,
  };
};

const createWeaponPickupSpawn = (
  id: string,
  profileId: WeaponId,
  position: readonly [number, number, number],
  rotation: number,
  flags: { readonly starter?: boolean; readonly nearTable?: boolean } = {},
): WeaponPickupSpawn =>
  createGunPickupSpawn(id, GUN_PROFILES[profileId], position, rotation, flags);

const resolveDefaultParametricGunPickupPlacement = (
  index: number,
): ParametricGunPickupPlacementV1 => {
  const columns = 8;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    position: [(column - (columns - 1) / 2) * 1.8, PICKUP_HEIGHT, (row - 1.5) * 1.8],
    rotation: column % 2 === 0 ? 0.12 : -0.12,
  };
};

/**
 * Resolve generic generated pickups for a barracks/range catalog. Placement
 * belongs to the caller so the generator stays independent of scene layout.
 */
export const generateParametricGunPickupsV1 = (
  roomSeed: string,
  options: GenerateParametricGunPickupOptionsV1 = {},
): readonly WeaponPickupSpawn[] => {
  const catalog = generateParametricGunCatalogV1(roomSeed, options.count);
  const normalizedSeed = roomSeed.trim() || "room-01";
  const random = createSeededRandom(`${normalizedSeed}|weapons|parametric-pickups|v1`);
  return catalog.map(({ profile }, index) => {
    const placement =
      options.placements?.[index] ?? resolveDefaultParametricGunPickupPlacement(index);
    return createGunPickupSpawn(
      `parametric-${String(index + 1).padStart(3, "0")}`,
      profile,
      placement.position,
      placement.rotation ?? random.nextFloat() * Math.PI * 2,
    );
  });
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
  const minimumDistance = Math.max(
    WEAPON_SPAWN_DENSITY_RADIUS_METERS,
    options.minimumDistance ?? WEAPON_SPAWN_DENSITY_RADIUS_METERS,
  );
  const reservedRects = options.reservedRects ?? [];
  const obstacles = options.obstacles ?? [];
  const random = createSeededRandom(`${normalizedSeed}|weapons|placements|v1`);
  const placements: WeaponPickupSpawn[] = TABLE_SIDE_PICKUP_LAYOUT.map(
    ({ profileId, position, rotation }) =>
      createWeaponPickupSpawn(`weapon-${profileId}-table`, profileId, position, rotation, {
        nearTable: true,
        ...(profileId === "pistol" ? { starter: true } : {}),
      }),
  );
  const spawnOrder = WEAPON_IDS.flatMap((profileId) =>
    Array.from(
      {
        // The table-side set counts as one pickup for every non-pistol type.
        // Keep the existing public count semantics: the starter pistol is in
        // addition to its configured outdoor count, while other types have
        // the table-side pickup in place of one outdoor spawn.
        length: profileId === "pistol" ? pickupCountPerWeapon : pickupCountPerWeapon - 1,
      },
      () => profileId,
    ),
  );

  spawnOrder.forEach((profileId, index) => {
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
    // A constrained scene may not have room for every requested pickup. Do
    // not place a closer fallback: returning fewer outdoor pickups preserves
    // the density cap and keeps the result deterministic.
    if (candidate === null) return;
    const [x, z] = candidate;
    placements.push(
      createWeaponPickupSpawn(
        `weapon-${profileId}-${String(index + 1).padStart(2, "0")}`,
        profileId,
        [x, PICKUP_HEIGHT, z],
        random.nextFloat() * Math.PI * 2,
      ),
    );
  });
  return placements;
};

export interface WeaponInventorySnapshot {
  readonly slotIndex: number;
  readonly gunInstanceId: string | null;
  readonly profileHash: string | null;
  readonly profileId: string | null;
  readonly displayName: string | null;
  readonly shortLabel: string | null;
  readonly owned: boolean;
  readonly ammoInMagazine: number;
  readonly reserveAmmo: number;
  readonly temperatureC: number;
}

export interface WeaponStateSnapshot {
  readonly activeSlotIndex: number | null;
  readonly nearbyPickup: NearbyGunPickupSnapshot | null;
  readonly slots: readonly WeaponInventorySnapshot[];
  readonly profileInspection: GunProfileInspectionSnapshot | null;
  readonly reloading: boolean;
  readonly shotsFired: number;
  /** Number of projectiles that currently resolved against a render surface. */
  readonly shotsHit: number;
  /** Number of live surface marks before their five-minute expiry. */
  readonly bulletHoleCount: number;
  /** Generic profile telemetry for the currently active gun, when equipped. */
  readonly telemetry: GunPlaytestTelemetryV1 | null;
}

/** Generic inventory naming for protocol and playtest consumers. */
export type GunInventorySnapshot = WeaponStateSnapshot;

/** Small generic profile view used by the inspection panel and test reports. */
export interface GunProfileInspectionSnapshot {
  readonly profileHash: string;
  readonly profileId: string;
  readonly displayName: string;
  readonly generatorSeed: string;
  readonly damagePerProjectile: number;
  readonly groupDamage: number;
  readonly burstDps: number;
  readonly sustainedDamagePerSecond: number;
  readonly hipSpreadRadians: number;
  readonly zoomSpreadRadians: number;
  readonly handling: number;
  readonly movementPenalty: number;
  readonly reloadSeconds: number;
  readonly oxygenCostPerGroup: number;
  readonly heatSpreadFactor: number;
  readonly audioEffectPower: number;
}

export const createEmptyWeaponStateSnapshot = (): WeaponStateSnapshot => ({
  activeSlotIndex: null,
  nearbyPickup: null,
  slots: Array.from(
    { length: DEFAULT_GUN_SLOT_COUNT },
    (_, slotIndex): WeaponInventorySnapshot => ({
      slotIndex,
      gunInstanceId: null,
      profileHash: null,
      profileId: null,
      displayName: null,
      shortLabel: null,
      owned: false,
      ammoInMagazine: 0,
      reserveAmmo: 0,
      temperatureC: 0,
    }),
  ),
  profileInspection: null,
  reloading: false,
  shotsFired: 0,
  shotsHit: 0,
  bulletHoleCount: 0,
  telemetry: null,
});
