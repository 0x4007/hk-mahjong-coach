import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createSeededRandom, getTileDefinition, type TileTypeId } from "@hk-mahjong/core/public";

import {
  DEFAULT_VISUAL_MAP_ID,
  getVisualMapDefinition,
  normalizeVisualMapId,
  type VisualMapId,
} from "./map-catalog.js";
import {
  generateWeaponPickups,
  generateWeaponPickupsOnEdges,
  canInterruptWeaponReload,
  resolveWeaponEffectOpacity,
  WEAPON_DEFINITIONS,
  WEAPON_CHART_ENTRIES,
  WEAPON_SHIELD_SPARK_LIFETIME_SECONDS,
  WEAPON_SHIELD_SPARK_COLOR,
  WEAPON_SHIELD_SPARK_OPACITY,
  WEAPON_BULLET_HOLE_LIFETIME_SECONDS,
  WEAPON_BULLET_HOLE_MAX_COUNT,
  WEAPON_BLOOD_CLOUD_LIFETIME_SECONDS,
  WEAPON_BLOOD_CLOUD_OPACITY,
  WEAPON_BLOOD_CLOUD_COLOR,
  WEAPON_BLOOD_DECAL_LIFETIME_SECONDS,
  WEAPON_BLOOD_DECAL_MAX_COUNT,
  WEAPON_BLOOD_SPLAT_OPACITY,
  WEAPON_BLOOD_SPLAT_COLOR,
  WEAPON_IMPACT_LIFETIME_SECONDS,
  WEAPON_PICKUP_RANGE_METERS,
  WEAPON_TRACER_LIFETIME_SECONDS,
  WEAPON_RELOAD_LIFT_FRACTION,
  WEAPON_RELOAD_RETURN_FRACTION,
  WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS,
  WEAPON_BARREL_SMOKE_MAX_RATE,
  WEAPON_BARREL_SMOKE_POOL_SIZE,
  WEAPON_MUZZLE_SMOKE_LIFETIME_SECONDS,
  WEAPON_MUZZLE_SMOKE_PARTICLE_COUNT,
  WEAPON_MUZZLE_SMOKE_LOG_STRENGTH,
  WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS,
  WEAPON_MUZZLE_FLASH_LIGHT_INTENSITY,
  WEAPON_MUZZLE_FLASH_LIGHT_DISTANCE,
  WEAPON_MUZZLE_FLASH_LIGHT_DECAY,
  resolveWeaponMuzzleFlashLightRatio,
  resolveWeaponMuzzleSmokeLogProgress,
  resolveWeaponMuzzleSmokeOpacity,
  shouldClearWeaponSmoke,
  WEAPON_BARREL_AMBIENT_TEMPERATURE_C,
  resolveWeaponBarrelSmokeRatio,
  WEAPON_IDS,
  type WeaponId,
  type WeaponEffectKind,
  type WeaponIronSightProfile,
  type WeaponInventorySnapshot,
  type WeaponPickupSpawn,
  resolveWeaponReloadPose,
  resolveWeaponRoundReloadPose,
  resolveWeaponStoppingPower,
  resolveWeaponSpreadRadians,
  resolveWeaponTriggerProfile,
  resolveWeaponHotkey,
  resolveGunAudioProfile,
  resolveBulletImpactAudioProfile,
  resolveBulletImpactAngleRadians,
  GUN_AUDIO_MIN_BARREL_LENGTH_METERS,
  resolveWeaponAudioProximity,
  WEAPON_AUDIO_MAX_DISTANCE_METERS,
  WEAPON_AUDIO_REFERENCE_DISTANCE_METERS,
  WEAPON_AUDIO_ROLLOFF_FACTOR,
  resolveWeaponBarrelTemperatureC,
  resolveWeaponBarrelGlowRatio,
  resolveWeaponBloodCloudScale,
  resolveWeaponBloodSmearRatio,
  resolveWeaponBloodEligibility,
  resolveWeaponShieldHit,
  type WeaponSpawnRect,
  type WeaponStateSnapshot,
} from "./weapons.js";
import {
  MELEE_SWING_ARC_RADIANS,
  MELEE_SWING_RECOVERY_SECONDS,
  MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND,
  resolveMeleeLongestSizeMeters,
  resolveMeleeO2Cost,
  resolveMeleeRangeMeters,
  resolveMeleeSwing,
  resolveMeleeThrowSpeed,
  resolveMeleeDamageWithMomentum,
  resolveMeleeStoppingPower,
  resolveMeleeSwingEnvelopeGain,
  resolveMeleeIdleResetPose,
  resolveMeleeIdleResetProgress,
  resolveMeleeSwingPose,
  resolveMeleeAudioProfile,
  shouldAdvanceMeleeIdleReset,
  createEmptyMeleeStateSnapshot,
  type MeleeObjectSnapshot,
  type MeleeHitContext,
  type MeleeStateSnapshot,
  type MeleeSwingDirection,
} from "./melee.js";
import {
  createCombatDamageRouter,
  type CombatActorId,
  type CombatDamageApplicationResult,
  type CombatDamageSource,
  type CombatHitZone,
} from "./combat-damage.js";
import { createKillScoreSnapshot, recordKill, type KillScoreSnapshot } from "./kill-scoreboard.js";
import {
  createDebuggingTwoMap,
  createWarehouseFog,
  DEBUGGING_TWO_WORLD_BOUNDS,
  DEBUGGING_TWO_BOX_SIZE,
  DEBUGGING_TWO_BOX_STACK_PITCH,
  WAREHOUSE_FLOOR_TOP_Y,
  type DebuggingTwoMeleeKind,
  type DebuggingTwoMapResources,
} from "./debugging-two-map.js";

export type { WeaponId, WeaponInventorySnapshot, WeaponStateSnapshot } from "./weapons.js";
export type { MeleeObjectSnapshot, MeleeStateSnapshot } from "./melee.js";
export type { VisualMapId } from "./map-catalog.js";

import {
  createFallbackMahjongPhysics,
  createMahjongPhysics,
  resolvePhysicsBoxGeometrySignature,
  resolvePhysicsBoxObstacleId,
  type MahjongPhysicsRuntime,
  type PhysicsBodyState,
  type PhysicsBox,
  type PhysicsVector,
} from "./mahjong-physics.js";
import {
  O2_JUMP_RECOVERY_DELAY_SECONDS,
  O2_LANDING_BASE_COST,
  O2_LANDING_RECOVERY_DELAY_SECONDS,
  O2_SPRINT_DRAIN_PER_SECOND,
  PLAYER_MAX_O2,
  PLAYER_MAX_SHIELD,
  SHIELD_RECHARGE_DELAY_SECONDS,
  applyPlayerO2Cost,
  applyPlayerO2ImpactCost,
  applyPlayerProjectileO2Cost,
  canAffordPlayerO2Cost,
  createPlayerVitals,
  resetPlayerVitals,
  setPlayerHoldingBreath,
  tickPlayerVitals,
  type PlayerVitalsDamageResult,
  type PlayerVitalsState,
} from "./player-vitals.js";
import {
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_MULTIPLIER as SPRINT_MULTIPLIER,
  PLAYER_WALK_SPEED_RATIO,
  resolveImpactDamage,
  resolveLandingO2Cost,
  resolveLandingO2OverflowDamage,
} from "./player-impact.js";
import {
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_STANDING_EYE_HEIGHT,
  PLAYER_STANDING_EYE_HEIGHT_METERS,
  PLAYER_SUPPORT_SNAP_HEIGHT,
  PLAYER_WALK_MULTIPLIER,
  PLAYER_TROT_MULTIPLIER,
  WORLD_GRAVITY,
  WORLD_EPSILON,
} from "./world-scale.js";
import {
  PLAYER_SLIDE_START_SPEED_METERS_PER_SECOND,
  PLAYER_MOVEMENT_MAX_STEP_SECONDS,
  createPlayerMovementControllerState,
  stepPlayerMovementController,
  type PlayerExternalTraversalState,
  type PlayerJumpAction,
  type PlayerMovementContact,
  type PlayerMovementControllerState,
} from "./player-movement.js";
import {
  CAMERA_VIEWMODEL_STANDING_OFFSET,
  createCameraMotionDamper,
  resolveCameraLocalAccelerationFromWorld,
  resolveCameraLocalAccelerationFromVelocityDelta,
  resolveCameraViewmodelTransition,
  type CameraLocalFrame,
  type CameraMotionVector,
  type CameraViewmodelOffset,
  type CameraViewmodelTransition,
  type CameraLocalAcceleration,
  type CameraMotionOffsets,
  type CameraMotionUpdateInput,
  type CameraVerticalOffsetBounds,
} from "./camera-motion.js";
import type { HeadImpulse } from "./head-motion.js";
import {
  createDamageVignettePass,
  createO2BlurPass,
  DAMAGE_VIGNETTE_PULSE_DURATION_SECONDS,
  resolveDamageVignetteOpacityFromDelta,
  resolveDamageVignettePulseOpacity,
  setDamageVignettePassCenter,
  setDamageVignettePassSize,
  setDamageVignettePassStrength,
  setO2BlurPassCenter,
  setO2BlurPassPixels,
  setO2BlurPassSize,
  setO2BlurPassVignette,
  type DamageVignetteKind,
} from "./o2-blur.js";
import {
  clampPlayerPositionToWallTangent,
  isPlayerFacingWall,
  PLAYER_WALL_COVER_RANGE_METERS,
  projectPlayerMovementToWallTangent,
  resolvePlayerWallContact,
  resolvePlayerWallContactInFacingCone,
  resolvePlayerWallSnapDelta,
  resolvePlayerWallSnapTarget,
  type PlayerWallContact,
} from "./wall-contact.js";
import {
  applySniperScopeProjection,
  createSniperScopePass,
  resolveSniperScopeProjection,
  resolveSniperScopeCameraFov,
  setSniperScopeSceneTexture,
  shouldRenderSniperScopeObject,
  shouldEnableSniperScope,
} from "./sniper-scope.js";
import {
  createShieldFlareMaterial,
  SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS,
  updateShieldFlareMaterial,
} from "./shield-flare.js";
import {
  RAGDOLL_DURATION_SECONDS,
  resolveRagdollJointPose,
  startRagdoll,
  stepRagdoll,
  type RagdollImpulse,
  type RagdollState,
} from "./ragdoll.js";
import {
  createMeleeImpactFlashPass,
  MELEE_IMPACT_DOF_BOOST_DURATION_SECONDS,
  MELEE_IMPACT_DOF_INTENSITY_MULTIPLIER,
  MELEE_IMPACT_FLASH_DURATION_SECONDS,
  MELEE_IMPACT_MAX_DAMAGE,
  resolveMeleeImpactFlashOpacity,
  resolveMeleeImpactFlashOpacityAtTime,
  resolveMeleeImpactFocusDistance,
  resolveMeleeImpactFocusShiftMeters,
  setMeleeImpactFlashOpacity,
} from "./melee-impact.js";

export type { PlayerVitalsDamageResult, PlayerVitalsState } from "./player-vitals.js";
export type { KillScoreSnapshot } from "./kill-scoreboard.js";

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Flush the live scene before Vite replaces this module. React's wrapper
    // also disposes the mount, but that remount can race Fast Refresh when a
    // scene dependency changes.
    window.dispatchEvent(new Event(MAHJONG_TABLE_HMR_SAVE_EVENT));
  });
  import.meta.hot.accept(() => {
    // Ask the React wrapper to replace only the mounted Three.js scene. The
    // surrounding app state and browser session stay intact during iteration.
    window.dispatchEvent(new Event(MAHJONG_TABLE_HMR_EVENT));
  });
}

export const MAHJONG_TABLE_HMR_EVENT = "mahjong-table:scene-hmr";
export const MAHJONG_TABLE_HMR_SAVE_EVENT = "mahjong-table:scene-hmr-save";

export type SceneView = "seat" | "overhead";

/**
 * Detect the physical left Command key without treating right Command as a
 * game binding. `code` is the reliable value in real browsers; the key and
 * location fallback keeps the helper usable with keyboard-event shims.
 */
export const isLeftCommandKeyEvent = (
  event: Pick<KeyboardEvent, "code" | "key" | "location">,
): boolean => event.code === "MetaLeft" || (event.key === "Meta" && event.location === 1);

/**
 * Once left Command is down, every subsequent keystroke belongs to the game
 * rather than the browser (for example Command+W). The caller still decides
 * whether the scene is currently accepting gameplay input.
 */
export const shouldCaptureLeftCommandKeystroke = (
  event: Pick<KeyboardEvent, "code" | "key" | "location">,
  leftCommandHeld: boolean,
): boolean => leftCommandHeld || isLeftCommandKeyEvent(event);

export interface DesktopAimInputState {
  readonly aimingDownSights: boolean;
  readonly holdingBreath: boolean;
}

/** Left Command owns hold-breath; right mouse supplies a persistent zoom toggle. */
export const resolveDesktopAimInput = (
  leftCommandHeld: boolean,
  rightMouseAiming: boolean,
): DesktopAimInputState => ({
  aimingDownSights: leftCommandHeld || rightMouseAiming,
  holdingBreath: leftCommandHeld,
});

/**
 * Reloading temporarily owns the perspective presentation. Keep the player's
 * requested zoom input so it can be restored when the gun is ready, but do not
 * let the camera, reticule, or breath state stay sighted during the reload.
 */
export const resolveReloadAimingDownSights = (
  aimingDownSightsRequested: boolean,
  reloading: boolean,
): boolean => aimingDownSightsRequested && !reloading;

/** Only a new requested zoom input may arm a fresh cover transition. */
export const resolveZoomActivationEdge = (
  previousRequestedAiming: boolean,
  requestedAiming: boolean,
): boolean => !previousRequestedAiming && requestedAiming;

/** A successful gun interaction or selection takes input focus from drawn melee. */
export const shouldStashMeleeForGun = (
  meleeActive: boolean,
  gunActionSucceeded: boolean,
): boolean => meleeActive && gunActionSucceeded;

/** Walking over a gun may fill an inventory slot, but must not draw it over melee. */
export const shouldEquipWalkOverGun = (meleeActive: boolean, gunAlreadyActive: boolean): boolean =>
  !meleeActive && !gunAlreadyActive;

/** An equipped empty magazine must immediately consume available reserve ammo. */
export const shouldAutoReloadOnWeaponEquip = (
  ammoInMagazine: number,
  reserveAmmo: number,
): boolean =>
  Number.isFinite(ammoInMagazine) &&
  Number.isFinite(reserveAmmo) &&
  ammoInMagazine <= 0 &&
  reserveAmmo > 0;

/** Restore the gun that was in hand only after the melee object really drops. */
export const resolveMeleeDropRearmWeapon = (
  previouslyHeldWeapon: WeaponId | null,
  dropSucceeded: boolean,
): WeaponId | null => (dropSucceeded ? previouslyHeldWeapon : null);

/** Select an owned gun after a successful melee drop when no gun was active. */
export const shouldAutoRearmOwnedGunAfterMeleeDrop = (
  previouslyHeldWeapon: WeaponId | null,
  dropSucceeded: boolean,
  rearmSuppressed: boolean,
): boolean => dropSucceeded && previouslyHeldWeapon === null && !rearmSuppressed;

/**
 * Cover is an explicit zoom transition, not a side effect of walking into a
 * wall while already zoomed. The caller supplies the pending zoom-on edge
 * after the physics wall-range probe has run for the current frame. The aim
 * value is the requested input state, so a weapon reload can temporarily
 * unzoom the presentation without dropping an already-engaged cover stance.
 */
export const resolveCoverModeFromAimTransition = (
  coverMode: boolean,
  zoomActivated: boolean,
  aimingDownSightsRequested: boolean,
  wallInRange: boolean,
): boolean => aimingDownSightsRequested && wallInRange && (coverMode || zoomActivated);

/** An accepted jump always breaks the explicit cover stance. */
export const resolveCoverModeAfterJump = (coverMode: boolean, jumpAccepted: boolean): boolean =>
  jumpAccepted ? false : coverMode;

/** Resolve the A/D strafe input used by cover presentation. */
export const resolveCoverLeanInput = (coverMode: boolean, strafeInput: number): number => {
  if (!coverMode) {
    return 0;
  }
  return Number.isFinite(strafeInput) ? THREE.MathUtils.clamp(strafeInput, -1, 1) : 0;
};

export const MOVEMENT_DOUBLE_TAP_WINDOW_MS = 300;

const MOVEMENT_KEY_CODES: ReadonlySet<string> = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
]);

/** Return whether a non-repeating movement key press completes its double-tap. */
export const isMovementDoubleTap = (
  keyCode: string,
  currentTime: number,
  lastTapAtByKey: ReadonlyMap<string, number>,
  isRepeat: boolean,
): boolean => {
  if (isRepeat || !MOVEMENT_KEY_CODES.has(keyCode)) {
    return false;
  }
  const previousTapAt = lastTapAtByKey.get(keyCode);
  return (
    previousTapAt !== undefined &&
    currentTime >= previousTapAt &&
    currentTime - previousTapAt <= MOVEMENT_DOUBLE_TAP_WINDOW_MS
  );
};

/** A successful jump always leaves the player standing, while a rejected jump preserves posture. */
export const resolveCrouchedStateAfterJump = (
  isCrouched: boolean,
  jumpAccepted: boolean,
): boolean => (jumpAccepted ? false : isCrouched);

/** An accepted jump leaves the hidden upright locomotion toggle in run/trot mode. */
export const resolveWalkingModeAfterJump = (
  isWalkingMode: boolean,
  jumpAccepted: boolean,
): boolean => (jumpAccepted ? false : isWalkingMode);

/** A sprint request leaves crouch only when the required stand transition succeeds. */
export const resolveCrouchedStateAfterSprint = (
  isCrouched: boolean,
  sprintAccepted: boolean,
): boolean => (sprintAccepted ? false : isCrouched);

/** An O₂-unaffordable sprint falls back to trot until a new sprint starts. */
export const resolveSprintRequestAfterO2Check = (
  sprintRequested: boolean,
  sprintAccepted: boolean,
): boolean => sprintRequested && sprintAccepted;

/** Only an accepted sprint request may interrupt an active reload. */
export const shouldInterruptReloadForSprint = (
  isReloading: boolean,
  sprintAccepted: boolean,
): boolean => isReloading && sprintAccepted;

/** A gun melee input is an accepted action even while a reload is in progress. */
export const shouldInterruptReloadForMelee = (isReloading: boolean): boolean => isReloading;

export const VISUAL_SCENE_STATE_VERSION = 1 as const;

type VisualSceneVector3 = readonly [number, number, number];
type VisualSceneQuaternion = readonly [number, number, number, number];

/**
 * The browser-only presentation state that is safe to carry across a Vite
 * scene remount. It deliberately contains no game state or hidden tile data.
 */
export interface VisualSceneState {
  readonly version: typeof VISUAL_SCENE_STATE_VERSION;
  readonly roomSeed: string;
  readonly view: SceneView;
  readonly activeDebugPreset: VisualCameraPreset | null;
  readonly cameraPosition: VisualSceneVector3;
  readonly cameraQuaternion: VisualSceneQuaternion;
  readonly orbitTarget: VisualSceneVector3;
  readonly cameraFov: number;
  readonly isCrouched: boolean;
}

export type VisualCameraPreset =
  | "table"
  | "roomReveal"
  | "assetReview"
  | "focusCalibration"
  | "climbingGym"
  | "parametricBarracks"
  | "targetRange";

/** Independent authored spaces that can be omitted from a debug scene build. */
export type VisualSceneAreaId =
  "focusCalibration" | "penthouse" | "climbingGym" | "parametricBarracks" | "targetRange";

export const VISUAL_SCENE_AREA_IDS: readonly VisualSceneAreaId[] = [
  "focusCalibration",
  "penthouse",
  "climbingGym",
  "parametricBarracks",
  "targetRange",
];

export const DEFAULT_ENABLED_VISUAL_SCENE_AREAS: Readonly<Record<VisualSceneAreaId, boolean>> = {
  focusCalibration: true,
  penthouse: true,
  climbingGym: true,
  parametricBarracks: true,
  targetRange: true,
};

export const isVisualSceneAreaId = (value: unknown): value is VisualSceneAreaId =>
  value === "focusCalibration" ||
  value === "penthouse" ||
  value === "climbingGym" ||
  value === "parametricBarracks" ||
  value === "targetRange";

export type VisualToneMapper = "agx" | "neutral" | "cineon" | "linear";

export type VisualShadowQuality = "off" | "medium" | "high";

export type MotionLookStatus =
  "unsupported" | "needs-permission" | "requesting" | "ready" | "denied";

export type VisualQualityPreset = "high" | "medium" | "low";
export type VisualQualityMode = "adaptive" | VisualQualityPreset;
export type VisualGlassMode = "simple" | "physical";
export type VisualFocusTarget = "tile" | "surface" | "fallback";

export interface VisualBokehParameters {
  readonly hyperfocalDistance: number;
  readonly intensity: number;
  readonly aperture: number;
  readonly maxBlur: number;
}

export const DEFAULT_ROOM_SEED = "room-01";

export const normalizeVisualRoomSeed = (seed: string | undefined): string => {
  const normalized = seed?.trim().replace(/\s+/gu, "-").slice(0, 48) ?? "";
  return normalized.length > 0 ? normalized : DEFAULT_ROOM_SEED;
};

const VISUAL_SCENE_STATE_STORAGE_PREFIX = "hk-mahjong-coach:visual-scene:v1:";
const VISUAL_SCENE_FALL_RESET_Y = -2;
const WORLD_SPAWN_MARGIN = 1;
const WORLD_SPAWN_ATTEMPTS = 24;
const WORLD_SPAWN_DROP_HEIGHT = 80;
const WORLD_SPAWN_DROP_DISTANCE = WORLD_SPAWN_DROP_HEIGHT * 2;
const PLAYER_DEATH_RESPAWN_DELAY_MS = 3_000;
const PLAYER_DEATH_FADE_DURATION_MS = 650;
const PLAYER_RESPAWN_FADE_IN_DURATION_MS = 260;
const LOCAL_PLAYER_COMBAT_ACTOR_ID = "player";
const SIMULANT_COMBAT_ACTOR_ID = "bot:simulant";
const SIMULANT_STOP_DISTANCE_METERS = 2.4;
const SIMULANT_WEAPON_PICKUP_DISTANCE_METERS = 1.9;
const SIMULANT_MELEE_COOLDOWN_SECONDS = 0.28;
const SIMULANT_WEAPON_HAND_OFFSET = { x: 0.34, y: 0.42, z: -0.24 } as const;
/** Stopping power briefly interrupts the charge before the simulant resumes. */
const SIMULANT_MAX_STAGGER_SECONDS = 0.65;
const SIMULANT_STAGGER_SECONDS_PER_STOPPING_POWER = 0.09;
const SIMULANT_KNOCKBACK_DAMPING_PER_SECOND = 5.2;
const PLAYER_KNOCKBACK_DAMPING_PER_SECOND = 5.2;
// Keep the 250 m FPS world bounded to 125 m from the origin in each direction.
// Coarse chunks preserve long traversal sightlines while keeping the resident
// grid compact enough for the runner prototype.
const SIMULANT_MIN_START_DISTANCE_METERS = 180;
const SIMULANT_BODY_SOURCE_HEIGHT_METERS = 1.09;
const SIMULANT_BODY_TARGET_HEIGHT_METERS = 1.8;
const SIMULANT_BODY_SOURCE_FOOT_OFFSET_METERS = 0.05;
export const EXPLORATION_CHUNK_SIZE = 100;
export const EXPLORATION_CHUNKS_PER_SIDE = 1.25;
export const EXPLORATION_WORLD_SIZE_METERS =
  EXPLORATION_CHUNK_SIZE * EXPLORATION_CHUNKS_PER_SIDE * 2;
const EXPLORATION_DENSITY_MULTIPLIER = 2.85;
const EXPLORATION_DENSITY_SCALE =
  EXPLORATION_DENSITY_MULTIPLIER * Math.sqrt(EXPLORATION_CHUNK_SIZE / 8);
const EXPLORATION_DISTRICT_ELEVATION_MIN = 0.65;
const EXPLORATION_DISTRICT_ELEVATION_MAX = 3.15;
const EXPLORATION_BUILDING_ELEVATION_LIFT = 1.15;
const EXPLORATION_BUILDING_FEATURE_LIFT = 0.75;
export const EXPLORATION_WORLD_HALF_SIZE = EXPLORATION_WORLD_SIZE_METERS / 2;
export const EXPLORATION_WORLD_RADIUS_METERS = EXPLORATION_WORLD_HALF_SIZE;
const SIMULANT_SPAWN_RADIUS_METERS = EXPLORATION_WORLD_HALF_SIZE;
interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

type SimulantWeaponTarget =
  | { readonly kind: "melee-prop"; readonly objectId: number }
  | { readonly kind: "gun"; readonly pickupId: string; readonly weapon: WeaponId };

type SimulantWeaponSource =
  | {
      readonly kind: "melee-prop";
      readonly objectId: number;
      readonly snapshot: MeleeObjectSnapshot;
      readonly color: number;
      readonly sourceMatrix: THREE.Matrix4;
      readonly mesh: THREE.InstancedMesh;
    }
  | {
      readonly kind: "gun";
      readonly pickupId: string;
      readonly weapon: WeaponId;
      readonly snapshot: MeleeObjectSnapshot;
      readonly color: number;
    };

type SimulantMeleeTarget =
  | { readonly kind: "player" }
  | {
      readonly kind: "support-box";
      readonly objectId: number;
      readonly position: PhysicsVector;
    };

const WORLD_BOUNDS: WorldBounds = {
  minX: -EXPLORATION_WORLD_HALF_SIZE,
  maxX: EXPLORATION_WORLD_HALF_SIZE,
  minZ: -EXPLORATION_WORLD_HALF_SIZE,
  maxZ: EXPLORATION_WORLD_HALF_SIZE,
} as const;
export const PLAY_AREA_SIZE_METERS = 50;
const PLAY_AREA_GAP_METERS = 10;
const PLAY_AREA_SPACING_METERS = PLAY_AREA_SIZE_METERS + PLAY_AREA_GAP_METERS;
export const PLAY_AREA_ORIGINS = {
  climbingGym: { x: -PLAY_AREA_SPACING_METERS, z: 0 },
  penthouse: { x: 0, z: 0 },
  lookingFocusRoom: { x: PLAY_AREA_SPACING_METERS, z: 0 },
  parametricBarracks: { x: 0, z: -PLAY_AREA_SPACING_METERS },
  // Keep the 48 m deep target range inside the compact ±125 m world bounds.
  targetRange: { x: 0, z: -PLAY_AREA_SPACING_METERS * 1.5 },
} as const;
const PLAY_AREA_HALF_SIZE = PLAY_AREA_SIZE_METERS / 2;
const PENTHOUSE_FLOOR_WIDTH_METERS = PLAY_AREA_SIZE_METERS;
const PENTHOUSE_FLOOR_DEPTH_METERS = PLAY_AREA_SIZE_METERS;
const PENTHOUSE_INTERIOR_FLOOR_WIDTH_METERS = PENTHOUSE_FLOOR_WIDTH_METERS - 2;
const PENTHOUSE_INTERIOR_FLOOR_DEPTH_METERS = PENTHOUSE_FLOOR_DEPTH_METERS - 2;
const PENTHOUSE_CEILING_HEIGHT_METERS = 5;
const PENTHOUSE_CEILING_SLAB_THICKNESS_METERS = 0.34;
const PENTHOUSE_WALL_THICKNESS_METERS = 0.34;
const PENTHOUSE_HALF_WIDTH_METERS = PENTHOUSE_FLOOR_WIDTH_METERS / 2;
const PENTHOUSE_HALF_DEPTH_METERS = PENTHOUSE_FLOOR_DEPTH_METERS / 2;
const PENTHOUSE_SIDE_WALL_X = PENTHOUSE_HALF_WIDTH_METERS - PENTHOUSE_WALL_THICKNESS_METERS / 2;
const PENTHOUSE_NORTH_WALL_Z = -(PENTHOUSE_HALF_DEPTH_METERS - PENTHOUSE_WALL_THICKNESS_METERS / 2);
const PENTHOUSE_WINDOW_HEIGHT_METERS = PENTHOUSE_CEILING_HEIGHT_METERS - 0.12;
const PENTHOUSE_WINDOW_CENTER_Y = PENTHOUSE_WINDOW_HEIGHT_METERS / 2 + 0.04;
const PENTHOUSE_NORTH_GLASS_WIDTH_METERS =
  PENTHOUSE_FLOOR_WIDTH_METERS - PENTHOUSE_WALL_THICKNESS_METERS * 2;
const PENTHOUSE_NORTH_GLASS_Z = PENTHOUSE_NORTH_WALL_Z + 0.015;
const OUTSIDE_PLAY_GRID_UNIT = 0.5;
const OUTSIDE_PLAY_GRID_ROTATION_STEP = Math.PI / 4;

const quantizeToGrid = (value: number): number =>
  Math.round(value / OUTSIDE_PLAY_GRID_UNIT) * OUTSIDE_PLAY_GRID_UNIT;

const quantizeHorizontal = (position: THREE.Vector3): THREE.Vector3 => {
  position.x = quantizeToGrid(position.x);
  position.z = quantizeToGrid(position.z);
  return position;
};

const quantizeScale = (value: number): number =>
  Math.max(
    OUTSIDE_PLAY_GRID_UNIT,
    Math.round(value / OUTSIDE_PLAY_GRID_UNIT) * OUTSIDE_PLAY_GRID_UNIT,
  );

const quantizeRotation45 = (rotation: number): number =>
  Math.round(rotation / OUTSIDE_PLAY_GRID_ROTATION_STEP) * OUTSIDE_PLAY_GRID_ROTATION_STEP;

const isVisualScenePositionRecoverable = (position: VisualSceneVector3): boolean => {
  const [x, y, z] = position;
  return (
    x >= WORLD_BOUNDS.minX &&
    x <= WORLD_BOUNDS.maxX &&
    y >= VISUAL_SCENE_FALL_RESET_Y &&
    z >= WORLD_BOUNDS.minZ &&
    z <= WORLD_BOUNDS.maxZ
  );
};

export const getVisualSceneStateStorageKey = (roomSeed: string): string =>
  `${VISUAL_SCENE_STATE_STORAGE_PREFIX}${encodeURIComponent(normalizeVisualRoomSeed(roomSeed))}`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isVector3 = (value: unknown): value is VisualSceneVector3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((entry: unknown) => isFiniteNumber(entry));

const isQuaternion = (value: unknown): value is VisualSceneQuaternion => {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((entry: unknown) => isFiniteNumber(entry))
  ) {
    return false;
  }
  const [x, y, z, w] = value;
  if (x === undefined || y === undefined || z === undefined || w === undefined) {
    return false;
  }
  return Math.hypot(x, y, z, w) > 0.0001;
};

const isSceneView = (value: unknown): value is SceneView =>
  value === "seat" || value === "overhead";

const isVisualCameraPreset = (value: unknown): value is VisualCameraPreset =>
  value === "table" ||
  value === "roomReveal" ||
  value === "assetReview" ||
  value === "focusCalibration" ||
  value === "climbingGym" ||
  value === "parametricBarracks" ||
  value === "targetRange";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse and validate one versioned scene snapshot from browser storage. */
export const parseVisualSceneState = (
  serialized: string | null,
  roomSeed: string,
): VisualSceneState | null => {
  if (serialized === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const normalizedRoomSeed = normalizeVisualRoomSeed(roomSeed);
  const activeDebugPreset = parsed.activeDebugPreset;
  const cameraFov = parsed.cameraFov;
  if (
    parsed.version !== VISUAL_SCENE_STATE_VERSION ||
    parsed.roomSeed !== normalizedRoomSeed ||
    !isSceneView(parsed.view) ||
    !(activeDebugPreset === null || isVisualCameraPreset(activeDebugPreset)) ||
    !isVector3(parsed.cameraPosition) ||
    !isVisualScenePositionRecoverable(parsed.cameraPosition) ||
    !isQuaternion(parsed.cameraQuaternion) ||
    !isVector3(parsed.orbitTarget) ||
    !isFiniteNumber(cameraFov) ||
    cameraFov < 30 ||
    cameraFov > 100 ||
    typeof parsed.isCrouched !== "boolean"
  ) {
    return null;
  }
  return {
    version: VISUAL_SCENE_STATE_VERSION,
    roomSeed: normalizedRoomSeed,
    view: parsed.view,
    activeDebugPreset,
    cameraPosition: parsed.cameraPosition,
    cameraQuaternion: parsed.cameraQuaternion,
    orbitTarget: parsed.orbitTarget,
    cameraFov,
    isCrouched: parsed.isCrouched,
  };
};

export const serializeVisualSceneState = (state: VisualSceneState): string => JSON.stringify(state);

export const readVisualSceneState = (
  storage: Storage | null | undefined,
  roomSeed: string,
): VisualSceneState | null => {
  if (storage === null || storage === undefined) {
    return null;
  }
  try {
    return parseVisualSceneState(
      storage.getItem(getVisualSceneStateStorageKey(roomSeed)),
      roomSeed,
    );
  } catch {
    return null;
  }
};

export const writeVisualSceneState = (
  storage: Storage | null | undefined,
  state: VisualSceneState,
): boolean => {
  if (storage === null || storage === undefined) {
    return false;
  }
  try {
    storage.setItem(
      getVisualSceneStateStorageKey(state.roomSeed),
      serializeVisualSceneState(state),
    );
    return true;
  } catch {
    return false;
  }
};

const VISUAL_SCENE_STATE_SAVE_INTERVAL_MS = 250;

const getVisualSceneStateStorage = (): Storage | null => {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const VISUAL_DEBUG_PREFERENCES_VERSION = 1 as const;
export const VISUAL_DEBUG_PREFERENCES_STORAGE_KEY = "hk-mahjong-coach:visual-debug-preferences:v1";

/** Values controlled by the development visual panel and safe to persist. */
export interface VisualDebugPreferences {
  readonly version: typeof VISUAL_DEBUG_PREFERENCES_VERSION;
  readonly cameraPreset: VisualCameraPreset | null;
  /** Optional for compatibility with settings written before area toggles existed. */
  readonly enabledAreas?: Readonly<Record<VisualSceneAreaId, boolean>>;
  readonly fov: number;
  readonly exposure: number;
  readonly toneMapper: VisualToneMapper;
  readonly fogDensity: number;
  readonly sunYaw: number;
  readonly sunElevation: number;
  readonly sunIntensity: number;
  readonly environmentIntensity: number;
  readonly environmentRotation: number;
  readonly redAccentIntensity: number;
  readonly cyanEmissiveIntensity: number;
  readonly shadowQuality: VisualShadowQuality;
  readonly qualityMode: VisualQualityMode;
  readonly glassMode: VisualGlassMode;
  readonly ambientAnimationRate: number;
  readonly dprCap: number;
  readonly wireframe: boolean;
  readonly boundsVisible: boolean;
  readonly bokehEnabled: boolean;
  readonly bokehStrength: number;
  readonly ambientOcclusionEnabled: boolean;
  readonly autoExposureEnabled: boolean;
  readonly cameraShiftEnabled: boolean;
  readonly cameraBobEnabled: boolean;
}

export const VISUAL_MAP_DOCUMENT_VERSION = 1 as const;

export type VisualMapEntityKind = "planter" | "divider" | "wallPanel" | "lightBar" | "sculpture";

export type VisualMapEntityPosition = readonly [number, number, number];

export interface VisualMapEntity {
  readonly id: string;
  readonly kind: VisualMapEntityKind;
  readonly position: VisualMapEntityPosition;
  readonly rotationDegrees?: number;
  readonly scale?: number;
}

export interface VisualMapDocument {
  readonly version: typeof VISUAL_MAP_DOCUMENT_VERSION;
  readonly floor: {
    readonly width: number;
    readonly depth: number;
    readonly rotationDegrees?: number;
  };
  /** The complete room layout. Omitting an entity removes it from the generated room. */
  readonly entities: readonly VisualMapEntity[];
}

const VISUAL_MAP_ENTITY_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const VISUAL_MAP_ENTITY_LIMIT = 64;

const isVisualMapEntityKind = (value: unknown): value is VisualMapEntityKind =>
  value === "planter" ||
  value === "divider" ||
  value === "wallPanel" ||
  value === "lightBar" ||
  value === "sculpture";

const isVisualMapPosition = (value: unknown): value is VisualMapEntityPosition =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((entry: unknown) => isBoundedNumber(entry, -40, 40));

const isVisualMapEntity = (value: unknown): value is VisualMapEntity => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    VISUAL_MAP_ENTITY_ID.test(value.id) &&
    isVisualMapEntityKind(value.kind) &&
    isVisualMapPosition(value.position) &&
    (value.rotationDegrees === undefined || isBoundedNumber(value.rotationDegrees, -180, 180)) &&
    (value.scale === undefined || isBoundedNumber(value.scale, 0.25, 3))
  );
};

const isVisualMapDocument = (value: unknown): value is VisualMapDocument => {
  if (!isRecord(value) || value.version !== VISUAL_MAP_DOCUMENT_VERSION) {
    return false;
  }
  const floor = value.floor;
  const entities = value.entities;
  if (
    !isRecord(floor) ||
    !isBoundedNumber(floor.width, 2.8, PENTHOUSE_INTERIOR_FLOOR_WIDTH_METERS) ||
    !isBoundedNumber(floor.depth, 2.4, PENTHOUSE_INTERIOR_FLOOR_DEPTH_METERS) ||
    (floor.rotationDegrees !== undefined && !isBoundedNumber(floor.rotationDegrees, -180, 180)) ||
    !Array.isArray(entities) ||
    entities.length > VISUAL_MAP_ENTITY_LIMIT ||
    !entities.every((entity: unknown) => isVisualMapEntity(entity))
  ) {
    return false;
  }
  const ids = new Set(entities.map((entity: VisualMapEntity) => entity.id));
  return ids.size === entities.length;
};

const normalizeVisualMapDocument = (document: VisualMapDocument): VisualMapDocument => ({
  version: VISUAL_MAP_DOCUMENT_VERSION,
  floor: {
    width: document.floor.width,
    depth: document.floor.depth,
    rotationDegrees: document.floor.rotationDegrees ?? 0,
  },
  entities: document.entities.map((entity) => ({
    id: entity.id,
    kind: entity.kind,
    position: [...entity.position] as VisualMapEntityPosition,
    rotationDegrees: entity.rotationDegrees ?? 0,
    scale: entity.scale ?? 1,
  })),
});

export const parseVisualMapDocument = (serialized: string): VisualMapDocument | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
  if (!isVisualMapDocument(parsed)) {
    return null;
  }
  return normalizeVisualMapDocument(parsed);
};

export const serializeVisualMapDocument = (
  document: VisualMapDocument | null | undefined,
): string => {
  if (document === null || document === undefined || !isVisualMapDocument(document)) {
    return "{}";
  }
  return JSON.stringify(normalizeVisualMapDocument(document), null, 2);
};

const getAuthoredVisualMapDocument = (mapId: VisualMapId): VisualMapDocument => {
  const map = getVisualMapDefinition(mapId);
  if (map.document === undefined) {
    throw new Error(`The ${map.label} map is procedural and has no authored document`);
  }
  const document = parseVisualMapDocument(JSON.stringify(map.document));
  if (document === null) {
    throw new Error(`The authored ${map.label} map is invalid`);
  }
  return document;
};

const getVisualDebugPreferencesStorage = (debugEnabled: boolean): Storage | null => {
  // The checkpoint server serves a production bundle, but an explicit
  // `?debug=1` query still enables the local debug panel and its preferences.
  if ((!import.meta.env.DEV && !debugEnabled) || typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const isVisualQualityMode = (value: unknown): value is VisualQualityMode =>
  value === "adaptive" || value === "high" || value === "medium" || value === "low";

const isVisualToneMapper = (value: unknown): value is VisualToneMapper =>
  value === "agx" || value === "neutral" || value === "cineon" || value === "linear";

const isVisualShadowQuality = (value: unknown): value is VisualShadowQuality =>
  value === "off" || value === "medium" || value === "high";

const isVisualGlassMode = (value: unknown): value is VisualGlassMode =>
  value === "simple" || value === "physical";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const isVisualSceneAreaMap = (
  value: unknown,
): value is Readonly<Record<VisualSceneAreaId, boolean>> =>
  isRecord(value) && VISUAL_SCENE_AREA_IDS.every((area) => isBoolean(value[area]));

const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  isFiniteNumber(value) && value >= min && value <= max;

const isVisualDebugPreferences = (value: unknown): value is VisualDebugPreferences => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.version === VISUAL_DEBUG_PREFERENCES_VERSION &&
    (value.cameraPreset === null || isVisualCameraPreset(value.cameraPreset)) &&
    (value.enabledAreas === undefined || isVisualSceneAreaMap(value.enabledAreas)) &&
    isBoundedNumber(value.fov, 30, 100) &&
    isBoundedNumber(value.exposure, 0.5, 2.2) &&
    isVisualToneMapper(value.toneMapper) &&
    isBoundedNumber(value.fogDensity, 0, 0.04) &&
    isBoundedNumber(value.sunYaw, -Math.PI, Math.PI) &&
    isBoundedNumber(value.sunElevation, 0.25, 1.45) &&
    isBoundedNumber(value.sunIntensity, 0, 6) &&
    isBoundedNumber(value.environmentIntensity, 0, 2.5) &&
    isBoundedNumber(value.environmentRotation, -Math.PI, Math.PI) &&
    isBoundedNumber(value.redAccentIntensity, 0, 2.5) &&
    isBoundedNumber(value.cyanEmissiveIntensity, 0, 2.5) &&
    isVisualShadowQuality(value.shadowQuality) &&
    isVisualQualityMode(value.qualityMode) &&
    isVisualGlassMode(value.glassMode) &&
    isBoundedNumber(value.ambientAnimationRate, 0, 2) &&
    isBoundedNumber(value.dprCap, 1, 2) &&
    isBoolean(value.wireframe) &&
    isBoolean(value.boundsVisible) &&
    isBoolean(value.bokehEnabled) &&
    isBoundedNumber(value.bokehStrength, 0, DEBUG_BOKEH_STRENGTH_MAX) &&
    isBoolean(value.ambientOcclusionEnabled) &&
    isBoolean(value.autoExposureEnabled) &&
    isBoolean(value.cameraShiftEnabled) &&
    isBoolean(value.cameraBobEnabled)
  );
};

export const readVisualDebugPreferences = (
  storage: Storage | null | undefined,
): VisualDebugPreferences | null => {
  if (storage === null || storage === undefined) {
    return null;
  }
  try {
    const serialized = storage.getItem(VISUAL_DEBUG_PREFERENCES_STORAGE_KEY);
    if (serialized === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(serialized) as unknown;
    return isVisualDebugPreferences(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeVisualDebugPreferences = (
  storage: Storage | null | undefined,
  preferences: VisualDebugPreferences,
): boolean => {
  if (storage === null || storage === undefined) {
    return false;
  }
  try {
    storage.setItem(VISUAL_DEBUG_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
};

export interface MahjongTableSceneOptions {
  readonly debug?: boolean;
  readonly mapId?: VisualMapId;
  readonly onExplorationAreaChange?: (area: string) => void;
  readonly onVisualAreaChange?: (area: VisualSceneAreaId, enabled: boolean) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
  readonly onCrouchingChange?: (crouching: boolean) => void;
  readonly onSprintingChange?: (sprinting: boolean) => void;
  readonly onSpeedChange?: (speed: number) => void;
  readonly onVitalsChange?: (vitals: PlayerVitalsState) => void;
  readonly onKillScoreChange?: (score: KillScoreSnapshot) => void;
  readonly onWeaponStateChange?: (state: WeaponStateSnapshot) => void;
  readonly onMeleeStateChange?: (state: MeleeStateSnapshot) => void;
  readonly onReady?: () => void;
  readonly quality?: VisualQualityPreset | "auto";
  readonly roomSeed?: string;
  readonly reticlePosition?: ReticlePosition;
  /** Areas to construct for this scene. Omitted areas are unloaded on build. */
  readonly enabledAreas?: readonly VisualSceneAreaId[];
}

export interface ReticlePosition {
  readonly x: number;
  readonly y: number;
}

export interface ReticleBobbingOffset {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_RETICLE_POSITION: ReticlePosition = {
  x: 0.5,
  y: 0.6,
};

export interface ReticleNdc {
  readonly x: number;
  readonly y: number;
}

/** One immutable source for the visible ring, centre dot, and every aim ray. */
export interface ReticlePresentation {
  readonly basePosition: ReticlePosition;
  readonly ringOffsetCssPixels: ReticleBobbingOffset;
  readonly dotOffsetCssPixels: ReticleBobbingOffset;
  readonly aimNdc: ReticleNdc;
}

/**
 * Resolve the live reticule dot position in camera NDC space.
 *
 * The HTML reticule uses CSS pixels for its centralized motion output. Keep
 * this conversion beside that output so the weapon ray, focus ray, and the
 * visible dot all follow the same sway.
 */
export const resolveReticleAimNdc = (
  reticlePosition: ReticlePosition,
  dotOffsetCssPixels: ReticleBobbingOffset,
  viewportWidth: number,
  viewportHeight: number,
): ReticleNdc => {
  const baseX = Number.isFinite(reticlePosition.x) ? reticlePosition.x : DEFAULT_RETICLE_POSITION.x;
  const baseY = Number.isFinite(reticlePosition.y) ? reticlePosition.y : DEFAULT_RETICLE_POSITION.y;
  const width = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const bobX = Number.isFinite(dotOffsetCssPixels.x) ? dotOffsetCssPixels.x : 0;
  const bobY = Number.isFinite(dotOffsetCssPixels.y) ? dotOffsetCssPixels.y : 0;
  return {
    x: baseX * 2 - 1 + (bobX * 2) / width,
    y: 1 - baseY * 2 - (bobY * 2) / height,
  };
};

export interface PenthouseSceneAnchors {
  readonly tableRoot: THREE.Object3D;
  readonly playerHand: THREE.Object3D;
  readonly opponentHands: Record<"north" | "east" | "west", THREE.Object3D>;
  readonly discardZones: Record<"south" | "north" | "east" | "west", THREE.Object3D>;
  readonly meldZones: Record<"south" | "north" | "east" | "west", THREE.Object3D>;
  readonly wallRoot: THREE.Object3D;
  readonly teacherPanel: THREE.Object3D;
  readonly actionSurface: THREE.Object3D;
  readonly roundStatusSurface: THREE.Object3D;
  readonly cameraTargets: Record<string, THREE.Object3D>;
}

export interface MahjongTableMount {
  readonly setView: (view: SceneView) => void;
  readonly requestMotionLook: () => Promise<MotionLookStatus>;
  readonly setMotionLookEnabled: (enabled: boolean) => void;
  readonly setTouchMovementVector: (forward: number, right: number, active: boolean) => void;
  readonly toggleCrouch: () => boolean;
  readonly setJumpInput: (pressed: boolean) => boolean;
  /** Return the capsule to its most recent validated position after a geometry wedge. */
  readonly recoverPlayer: () => boolean;
  readonly fire: () => void;
  readonly melee: () => void;
  readonly setReticleEnabled: (enabled: boolean) => void;
  readonly reload: () => void;
  readonly interact: () => void;
  readonly cycleWeapon: (direction?: 1 | -1) => void;
  readonly cycleWeaponTo: (weapon: WeaponId) => void;
  readonly dropActiveWeapon: () => void;
  readonly setReticlePosition: (reticlePosition: ReticlePosition) => void;
  readonly getReticlePresentation: () => ReticlePresentation;
  readonly getAimRay: () => {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  };
  readonly applyDamage: (damage: number) => PlayerVitalsDamageResult;
  readonly getVitals: () => PlayerVitalsState;
  readonly resetVitals: () => PlayerVitalsState;
  readonly debug: MahjongTableDebugControls;
  readonly dispose: () => void;
  readonly anchors: PenthouseSceneAnchors;
}

export interface SceneDebugSnapshot {
  readonly roomSeed: string;
  readonly roomVariant: string;
  readonly explorationArea: string;
  readonly loadedExplorationChunks: number;
  readonly enabledAreas: Readonly<Record<VisualSceneAreaId, boolean>>;
  readonly qualityMode: VisualQualityMode;
  readonly cameraPreset: VisualCameraPreset | null;
  readonly fov: number;
  readonly exposure: number;
  readonly toneMapper: VisualToneMapper;
  readonly fogDensity: number;
  readonly sunYaw: number;
  readonly sunElevation: number;
  readonly sunIntensity: number;
  readonly environmentIntensity: number;
  readonly environmentRotation: number;
  readonly redAccentIntensity: number;
  readonly cyanEmissiveIntensity: number;
  readonly shadowQuality: VisualShadowQuality;
  readonly quality: VisualQualityPreset;
  readonly glassMode: VisualGlassMode;
  readonly ambientAnimationRate: number;
  readonly dpr: number;
  readonly dprCap: number;
  readonly wireframe: boolean;
  readonly boundsVisible: boolean;
  readonly bokehEnabled: boolean;
  readonly focusDistance: number;
  readonly focusTarget: VisualFocusTarget;
  readonly pupilDiameterMm: number;
  readonly bokehIntensity: number;
  readonly bokehStrength: number;
  readonly ambientOcclusionEnabled: boolean;
  readonly autoExposureEnabled: boolean;
  readonly cameraShiftEnabled: boolean;
  readonly cameraBobEnabled: boolean;
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly geometries: number;
  readonly textures: number;
}

export interface MahjongTableDebugControls {
  readonly setAreaEnabled: (area: VisualSceneAreaId, enabled: boolean) => void;
  readonly setQualityMode: (mode: VisualQualityMode) => void;
  readonly setCameraPreset: (preset: VisualCameraPreset) => void;
  readonly setFov: (fov: number) => void;
  readonly setExposure: (exposure: number) => void;
  readonly setToneMapper: (toneMapper: VisualToneMapper) => void;
  readonly setFogDensity: (density: number) => void;
  readonly setSunDirection: (yaw: number, elevation: number) => void;
  readonly setSunIntensity: (intensity: number) => void;
  readonly setEnvironmentIntensity: (intensity: number) => void;
  readonly setEnvironmentRotation: (rotation: number) => void;
  readonly setRedAccentIntensity: (intensity: number) => void;
  readonly setCyanEmissiveIntensity: (intensity: number) => void;
  readonly setShadowQuality: (quality: VisualShadowQuality) => void;
  readonly setDprCap: (dprCap: number) => void;
  readonly setBokehEnabled: (enabled: boolean) => void;
  readonly setBokehIntensity: (intensity: number) => void;
  readonly setAmbientOcclusionEnabled: (enabled: boolean) => void;
  readonly setAutoExposureEnabled: (enabled: boolean) => void;
  readonly setAmbientAnimationRate: (rate: number) => void;
  readonly setGlassMode: (mode: VisualGlassMode) => void;
  readonly setCameraShiftEnabled: (enabled: boolean) => void;
  readonly setCameraBobEnabled: (enabled: boolean) => void;
  readonly setWireframe: (enabled: boolean) => void;
  readonly setBoundsVisible: (visible: boolean) => void;
  readonly teleportToFocusLab: () => void;
  readonly resetDefaults: () => void;
  readonly getSnapshot: () => SceneDebugSnapshot;
}

interface CameraPreset {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

interface TileOptions {
  readonly tile?: TileTypeId;
  readonly faceUp: boolean;
  readonly bothSides?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
}

interface TileTextureCache {
  readonly face: Map<TileTypeId, THREE.CanvasTexture>;
  readonly back: THREE.CanvasTexture;
  readonly detail: THREE.CanvasTexture;
  readonly bodyGeometry: Map<string, RoundedBoxGeometry>;
  readonly faceGeometry: Map<string, THREE.PlaneGeometry>;
  readonly bodyMaterial: Map<string, THREE.MeshStandardMaterial>;
  readonly faceMaterial: Map<string, THREE.MeshStandardMaterial>;
  readonly backMaterial: Map<string, THREE.MeshStandardMaterial>;
}

interface SceneQuality {
  readonly preset: VisualQualityPreset;
  readonly dprCap: number;
  readonly shadows: "off" | "medium" | "high";
  readonly shadowMapSize: 0 | 1024 | 2048;
  readonly ambientOcclusion: boolean;
  readonly glassMode: VisualGlassMode;
  readonly ambientAnimationRate: number;
}

interface ClimbingTransition {
  traversalKind: "vault" | "ledge-grab" | "wall-climb";
  sourceObstacleId: string;
  sourceGeometryKey: string;
  sourceBox: PhysicsBox;
  duration: number;
  arcHeight: number;
  elapsed: number;
  phase: "vault" | "landingBoost";
  traversalHeightMeters: number;
  startX: number;
  startY: number;
  startZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  preservedForwardVelocity: number;
  preservedStrafeVelocity: number;
  preserveSprinting: boolean;
  landingBoostDistance: number;
}

interface WallHangState {
  readonly sourceObstacleId: string;
  readonly sourceGeometryKey: string;
  target: PhysicsVector;
  wallNormal: PhysicsVector;
  wallFacePoint: PhysicsVector;
  wallTopY: number;
  box: PhysicsBox;
  readonly approachDirection: PhysicsVector;
  readonly preservedForwardVelocity: number;
  readonly preservedStrafeVelocity: number;
  readonly preserveSprinting: boolean;
  elapsed: number;
}

type WallClimbTransition = ClimbingTransition;

type LedgeClimbMomentum = Readonly<{
  readonly preservedForwardVelocity: number;
  readonly preservedStrafeVelocity: number;
  readonly preserveSprinting: boolean;
}>;

export const resolveLedgeClimbMomentum = (
  desiredForward: number,
  desiredStrafe: number,
  fallbackForwardVelocity: number,
  fallbackStrafeVelocity: number,
  isSprinting: boolean,
  moveSpeed: number,
): LedgeClimbMomentum => {
  const preservedBaseForward =
    desiredForward !== 0 || desiredStrafe !== 0 ? desiredForward : fallbackForwardVelocity;
  const preservedBaseStrafe =
    desiredForward !== 0 || desiredStrafe !== 0 ? desiredStrafe : fallbackStrafeVelocity;
  const rawMomentum = Math.hypot(preservedBaseForward, preservedBaseStrafe);
  const minMomentum = isSprinting ? moveSpeed * SPRINT_MULTIPLIER : 0;
  if (rawMomentum <= 0) {
    return {
      preservedForwardVelocity: 0,
      preservedStrafeVelocity: 0,
      preserveSprinting: isSprinting,
    };
  }
  if (rawMomentum >= minMomentum) {
    return {
      preservedForwardVelocity: preservedBaseForward,
      preservedStrafeVelocity: preservedBaseStrafe,
      preserveSprinting: isSprinting,
    };
  }

  const scale = minMomentum / rawMomentum;
  return {
    preservedForwardVelocity: preservedBaseForward * scale,
    preservedStrafeVelocity: preservedBaseStrafe * scale,
    preserveSprinting: isSprinting,
  };
};

interface SceneAmbientResources {
  readonly cyanMaterials: readonly THREE.MeshStandardMaterial[];
  readonly redMaterials: readonly THREE.MeshStandardMaterial[];
}

interface ArchitectureResources {
  readonly ambient: SceneAmbientResources;
  readonly teacherTexture: THREE.CanvasTexture;
  readonly weaponChartTexture: THREE.CanvasTexture;
  readonly glassSurfaces: readonly THREE.Mesh[];
  readonly simpleGlassMaterial: THREE.MeshStandardMaterial;
  readonly physicalGlassMaterial: THREE.MeshPhysicalMaterial;
  readonly surfaceTextures: InteriorSurfaceTextures;
}

interface InteriorSurfaceTextures {
  readonly floor: THREE.CanvasTexture;
  readonly wall: THREE.CanvasTexture;
  readonly table: THREE.CanvasTexture;
  readonly wood: THREE.CanvasTexture;
  readonly fabric: THREE.CanvasTexture;
  readonly detail: THREE.CanvasTexture;
}

const TABLE_TOP_Y = 0.78;
const TABLE_WIDTH = 1.62;
const TABLE_DEPTH = 1.62;
const TILE_WIDTH = 0.11;
const TILE_HEIGHT = 0.17;
const TILE_DEPTH = 0.075;
const WALL_COUNT = 18;
const WALL_SPACING = 0.125;
const TILE_BACK_COLOR = "#1b282c";
const TILE_FACE_COLOR = "#f2eee3";
const TILE_RED = "#d8463d";
const TILE_GREEN = "#217f69";
const TILE_BLUE = "#315b86";
const TILE_INK = "#253237";

const COLORS = {
  sky: 0xf3f6f1,
  haze: 0xe5eeea,
  architecturalWhite: 0xf8faf8,
  whiteLacquer: 0xffffff,
  structuralGray: 0xc8d2d1,
  charcoal: 0x101a21,
  glass: 0x9bd5dc,
  paleOak: 0xe4dfd3,
  red: 0xf04438,
  cyan: 0x62dce6,
  aluminum: 0xa9bbc0,
  tileIvory: 0xf1e8d9,
} as const;

const PIP_POSITIONS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.31, 0.3],
    [0.69, 0.7],
  ],
  3: [
    [0.31, 0.3],
    [0.5, 0.5],
    [0.69, 0.7],
  ],
  4: [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.3, 0.7],
    [0.7, 0.7],
  ],
  5: [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.5, 0.5],
    [0.3, 0.7],
    [0.7, 0.7],
  ],
  6: [
    [0.3, 0.25],
    [0.7, 0.25],
    [0.3, 0.5],
    [0.7, 0.5],
    [0.3, 0.75],
    [0.7, 0.75],
  ],
  7: [
    [0.3, 0.2],
    [0.7, 0.2],
    [0.5, 0.37],
    [0.3, 0.52],
    [0.7, 0.52],
    [0.3, 0.8],
    [0.7, 0.8],
  ],
  8: [
    [0.3, 0.17],
    [0.7, 0.17],
    [0.3, 0.39],
    [0.7, 0.39],
    [0.3, 0.61],
    [0.7, 0.61],
    [0.3, 0.83],
    [0.7, 0.83],
  ],
  9: [
    [0.3, 0.18],
    [0.5, 0.18],
    [0.7, 0.18],
    [0.3, 0.5],
    [0.5, 0.5],
    [0.7, 0.5],
    [0.3, 0.82],
    [0.5, 0.82],
    [0.7, 0.82],
  ],
};

const PLAYER_HAND: readonly TileTypeId[] = [
  "characters.2",
  "characters.3",
  "characters.4",
  "characters.5",
  "characters.6",
  "dots.2",
  "dots.3",
  "dots.4",
  "bamboo.6",
  "bamboo.7",
  "bamboo.8",
  "wind.south",
  "dragon.red",
];

const PUBLIC_DISCARDS: readonly TileTypeId[] = [
  "characters.1",
  "dots.9",
  "bamboo.2",
  "wind.north",
  "dragon.green",
  "characters.9",
  "dots.5",
  "bamboo.9",
  "wind.west",
  "dragon.white",
  "characters.7",
  "dots.1",
  "bamboo.4",
  "wind.east",
  "characters.8",
  "dots.7",
];

const cameraPresets: Readonly<Record<SceneView, CameraPreset>> = {
  seat: {
    position: new THREE.Vector3(0, 2.55, 4.8),
    target: new THREE.Vector3(0, 0.72, -0.75),
  },
  overhead: {
    position: new THREE.Vector3(0, 5.8, 0.2),
    target: new THREE.Vector3(0, 0.68, 0),
  },
};

const createVisualCameraPresets = (): Readonly<Record<VisualCameraPreset, CameraPreset>> => ({
  table: cameraPresets.seat,
  roomReveal: {
    position: new THREE.Vector3(6.3, 4.55, 6.8),
    target: new THREE.Vector3(0, 1.15, -1.45),
  },
  assetReview: cameraPresets.overhead,
  focusCalibration: {
    position: new THREE.Vector3(
      FOCUS_CALIBRATION_START_X,
      FOCUS_CALIBRATION_DECK_HEIGHT + STANDING_EYE_HEIGHT,
      0,
    ),
    target: new THREE.Vector3(
      FOCUS_CALIBRATION_START_X + FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE / 2,
      FOCUS_CALIBRATION_DECK_HEIGHT + STANDING_EYE_HEIGHT,
      0,
    ),
  },
  climbingGym: {
    position: new THREE.Vector3(
      CLIMBING_GYM_PRESET_START_X,
      CLIMBING_GYM_RUN_Y + CLIMBING_GYM_STANDING_EYE_HEIGHT,
      CLIMBING_GYM_PRESET_START_Z,
    ),
    target: new THREE.Vector3(
      CLIMBING_GYM_PRESET_TARGET_X,
      CLIMBING_GYM_RUN_Y + CLIMBING_GYM_STANDING_EYE_HEIGHT,
      CLIMBING_GYM_PRESET_TARGET_Z,
    ),
  },
  parametricBarracks: {
    position: new THREE.Vector3(
      PLAY_AREA_ORIGINS.parametricBarracks.x,
      STANDING_EYE_HEIGHT,
      PLAY_AREA_ORIGINS.parametricBarracks.z + 18,
    ),
    target: new THREE.Vector3(
      PLAY_AREA_ORIGINS.parametricBarracks.x,
      1.25,
      PLAY_AREA_ORIGINS.parametricBarracks.z,
    ),
  },
  targetRange: {
    position: new THREE.Vector3(
      PLAY_AREA_ORIGINS.targetRange.x,
      STANDING_EYE_HEIGHT,
      PLAY_AREA_ORIGINS.targetRange.z + 20,
    ),
    target: new THREE.Vector3(
      PLAY_AREA_ORIGINS.targetRange.x,
      1.35,
      PLAY_AREA_ORIGINS.targetRange.z - 18,
    ),
  },
});

const TABLE_CAMERA_STANDING_EYE_HEIGHT = cameraPresets.seat.position.y;
const STANDING_EYE_HEIGHT = PLAYER_STANDING_EYE_HEIGHT;
const SEATED_EYE_HEIGHT = PLAYER_CROUCH_EYE_HEIGHT;
const TABLE_CAMERA_FOV = 45;
const SEAT_STANDING_FOV = 90;
const SEAT_AIMING_FOV = 45;
const DEBUG_STANDING_FOV = 90;

export interface ReticleZoomViewOffset {
  /** Normalized view offsets passed to PerspectiveCamera.setViewOffset. */
  readonly x: number;
  readonly y: number;
}

/**
 * Keep the world point under the reticule fixed while changing the seat FOV.
 *
 * The reticule is below the optical center, so a narrow FOV needs an off-axis
 * projection. The offset is normalized to the full camera view (1 = one full
 * viewport) and is zero at the standing FOV.
 */
export const resolveReticleZoomViewOffset = (
  fov: number,
  reticlePosition: ReticlePosition = DEFAULT_RETICLE_POSITION,
): ReticleZoomViewOffset => {
  const standingTangent = Math.tan(THREE.MathUtils.degToRad(SEAT_STANDING_FOV) * 0.5);
  const currentFov = THREE.MathUtils.clamp(fov, 0.001, 179.999);
  const currentTangent = Math.tan(THREE.MathUtils.degToRad(currentFov) * 0.5);
  const zoomScale = standingTangent / currentTangent;
  const reticleNdcX = (Number.isFinite(reticlePosition.x) ? reticlePosition.x : 0.5) * 2 - 1;
  const reticleNdcY = 1 - (Number.isFinite(reticlePosition.y) ? reticlePosition.y : 0.6) * 2;
  const x = (reticleNdcX * (zoomScale - 1)) / 2;
  const y = (reticleNdcY * (1 - zoomScale)) / 2;
  return {
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  };
};
const GRAVITY = WORLD_GRAVITY;

// Every platform traversal uses the same continuous climb-over transition.
// The duration is resolved from the obstacle height below; these offsets keep
// the landing supported and preserve the brief momentum carried over the top.
const LEDGE_CLIMB_FORWARD_OFFSET = 0.16;
const LEDGE_CLIMB_EXIT_BOOST_DURATION = 0.06;
const LEDGE_CLIMB_EXIT_BOOST_DISTANCE = 0.12;
export const LEDGE_CLIMB_EYE_HEIGHT_METERS = PLAYER_STANDING_EYE_HEIGHT_METERS;
export const LEDGE_CLIMB_EYE_HEIGHT = PLAYER_STANDING_EYE_HEIGHT;
/** Upper bound for a low-obstacle vault; taller valid tops use ledge grab/pull-up. */
export const LOW_OBSTACLE_VAULT_MAX_HEIGHT = 0.9;
const LEDGE_GRAB_MIN_HEIGHT = LOW_OBSTACLE_VAULT_MAX_HEIGHT;
const LEDGE_GRAB_MAX_HEIGHT = 2;
const LEDGE_GRAB_MIN_FALL_OFFSET = 0.05;
const LEDGE_GRAB_APPROACH_DISTANCE = 1;
const LEDGE_GRAB_SIDE_DISTANCE = 0.4;
const LEDGE_GRAB_PLATFORM_TOLERANCE = 0.01;
const LEDGE_GRAB_PLATFORM_INSET = 0.08;
const PLAYER_COLLIDER_RADIUS = PLAYER_CAPSULE_RADIUS;
const PLAYER_COLLIDER_HALF_HEIGHT = PLAYER_CAPSULE_HALF_HEIGHT;
const PLAYER_COLLIDER_CENTER_HEIGHT = PLAYER_CAPSULE_CENTER_HEIGHT;
const SWIPE_LOOK_SENSITIVITY = 0.00594;
const TOUCH_SIDEWAYS_SPRINT_FRACTION = 0.5;
const WALK_SPEED_RATIO = PLAYER_WALK_SPEED_RATIO;
const TROT_SPEED_MULTIPLIER = PLAYER_TROT_MULTIPLIER;
const CROUCH_SPEED_MULTIPLIER = 0.5;
const WALK_SPEED_MULTIPLIER = PLAYER_WALK_MULTIPLIER;
const SIMULANT_TROT_SPEED_METERS_PER_SECOND =
  PLAYER_MOVE_SPEED_METERS_PER_SECOND * TROT_SPEED_MULTIPLIER;
const SIMULANT_TROT_SPEED_RATIO =
  SIMULANT_TROT_SPEED_METERS_PER_SECOND / (PLAYER_MOVE_SPEED_METERS_PER_SECOND * SPRINT_MULTIPLIER);
const SIMULANT_TROT_LOCOMOTION_BLEND =
  (TROT_SPEED_MULTIPLIER / SPRINT_MULTIPLIER - WALK_SPEED_RATIO) / (1 - WALK_SPEED_RATIO);

export interface PlayerMovementSpeedInput {
  readonly crouching: boolean;
  /** Internal posture toggle used by keyboard/touch movement; never surfaced in the HUD. */
  readonly walking?: boolean;
  readonly sprinting: boolean;
  readonly jogging: boolean;
  readonly reloading: boolean;
}

/**
 * Resolve the grounded movement multiplier.
 *
 * Standing movement defaults to the 1.5×-base trot. Crouching always keeps its
 * own slower posture speed; the hidden walking toggle only applies while the
 * player is upright. A sprint request can still reach full sprint when its O₂
 * drain is affordable, and reloading caps a sprint request at the same trot.
 */
export const resolvePlayerMovementSpeedMultiplier = ({
  crouching,
  walking = false,
  sprinting,
  reloading,
}: PlayerMovementSpeedInput): number => {
  if (crouching) {
    return CROUCH_SPEED_MULTIPLIER;
  }
  if (walking) {
    return WALK_SPEED_MULTIPLIER;
  }
  const requestedMultiplier = sprinting ? SPRINT_MULTIPLIER : TROT_SPEED_MULTIPLIER;
  return reloading ? Math.min(requestedMultiplier, TROT_SPEED_MULTIPLIER) : requestedMultiplier;
};

/** Apply the same per-projectile damage payload used by the ordinary weapon path. */
export const resolveSimulantShotDamage = (
  damagePerProjectile: number,
  projectileCount = 1,
): number => {
  const damage = Number.isFinite(damagePerProjectile) ? Math.max(0, damagePerProjectile) : 0;
  const projectiles = Number.isFinite(projectileCount)
    ? Math.max(0, Math.floor(projectileCount))
    : 0;
  return damage * projectiles;
};

/**
 * Accumulate a horizontal melee impulse on the local player.
 *
 * The direction points from the simulant to the player, so the resulting
 * velocity moves the player away from the contact. Keep the accumulated
 * impulse bounded by the shared melee stopping-power cap; repeated swings
 * must not launch the player outside the playable world in one frame.
 */
export const resolvePlayerKnockbackVelocity = (
  direction: PhysicsVector,
  stoppingPower: number,
  currentVelocity: PhysicsVector = { x: 0, y: 0, z: 0 },
): PhysicsVector => {
  const currentX = Number.isFinite(currentVelocity.x) ? currentVelocity.x : 0;
  const currentZ = Number.isFinite(currentVelocity.z) ? currentVelocity.z : 0;
  const safeStoppingPower = Number.isFinite(stoppingPower)
    ? THREE.MathUtils.clamp(stoppingPower, 0, MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND)
    : 0;
  const directionX = Number.isFinite(direction.x) ? direction.x : 0;
  const directionZ = Number.isFinite(direction.z) ? direction.z : 0;
  const directionLength = Math.hypot(directionX, directionZ);
  let nextX = currentX;
  let nextZ = currentZ;
  if (directionLength > Number.EPSILON && safeStoppingPower > 0) {
    nextX += (directionX / directionLength) * safeStoppingPower;
    nextZ += (directionZ / directionLength) * safeStoppingPower;
  }
  const nextLength = Math.hypot(nextX, nextZ);
  if (nextLength <= MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND) {
    return { x: nextX, y: 0, z: nextZ };
  }
  const scale = MELEE_STOPPING_POWER_MAX_METERS_PER_SECOND / nextLength;
  return { x: nextX * scale, y: 0, z: nextZ * scale };
};

const RETICLE_SWAY_PIXELS_PER_RADIAN = 150;
const RETICLE_AIM_SWAY_PIXELS_PER_RADIAN = 260;
const RETICLE_HEAD_BOB_PIXELS_PER_METER = 160;
const RETICLE_HEAD_BOB_LATERAL_PIXELS_PER_METER = 160;
const RETICLE_HEAD_BOB_PITCH_PIXELS_PER_RADIAN = 180;
const RETICLE_RECOIL_PIXELS_PER_RADIAN = 180;
/** CSS motion applied to the reticule ring and its centre dot. */
export const RETICLE_RING_MOTION_MULTIPLIER = 5;
export const RETICLE_DOT_MOTION_MULTIPLIER = 5;

type ReticleMotionInput = Pick<
  CameraMotionOffsets,
  | "roll"
  | "coverLeanRoll"
  | "headBobLateral"
  | "verticalOffset"
  | "headBobPitch"
  | "aimSwayX"
  | "aimSwayY"
  | "recoilYaw"
  | "recoilPitch"
>;

const resolveReticleMotionOffset = (
  motion: Pick<
    CameraMotionOffsets,
    "roll" | "verticalOffset" | "aimSwayX" | "aimSwayY" | "recoilYaw" | "recoilPitch"
  > &
    Partial<Pick<CameraMotionOffsets, "coverLeanRoll" | "headBobLateral" | "headBobPitch">>,
): ReticleBobbingOffset => {
  const reticleRoll = motion.roll - (motion.coverLeanRoll ?? 0);
  return {
    x:
      reticleRoll * RETICLE_SWAY_PIXELS_PER_RADIAN +
      (motion.headBobLateral ?? 0) * RETICLE_HEAD_BOB_LATERAL_PIXELS_PER_METER +
      motion.aimSwayX * RETICLE_AIM_SWAY_PIXELS_PER_RADIAN +
      motion.recoilYaw * RETICLE_RECOIL_PIXELS_PER_RADIAN,
    y:
      motion.verticalOffset * RETICLE_HEAD_BOB_PIXELS_PER_METER +
      (motion.headBobPitch ?? 0) * RETICLE_HEAD_BOB_PITCH_PIXELS_PER_RADIAN +
      motion.aimSwayY * RETICLE_AIM_SWAY_PIXELS_PER_RADIAN +
      motion.recoilPitch * RETICLE_RECOIL_PIXELS_PER_RADIAN,
  };
};

/** Resolve the sole immutable reticle/aim snapshot for one presentation frame. */
export const resolveReticlePresentation = (
  position: ReticlePosition,
  motion: ReticleMotionInput,
  viewportWidth: number,
  viewportHeight: number,
): ReticlePresentation => {
  const basePosition = Object.freeze({
    x: Number.isFinite(position.x)
      ? THREE.MathUtils.clamp(position.x, 0, 1)
      : DEFAULT_RETICLE_POSITION.x,
    y: Number.isFinite(position.y)
      ? THREE.MathUtils.clamp(position.y, 0, 1)
      : DEFAULT_RETICLE_POSITION.y,
  });
  const motionOffset = resolveReticleMotionOffset(motion);
  const ringOffsetCssPixels = Object.freeze({
    x: motionOffset.x * RETICLE_RING_MOTION_MULTIPLIER,
    y: motionOffset.y * RETICLE_RING_MOTION_MULTIPLIER,
  });
  const dotOffsetCssPixels = Object.freeze({
    x: motionOffset.x * RETICLE_DOT_MOTION_MULTIPLIER,
    y: motionOffset.y * RETICLE_DOT_MOTION_MULTIPLIER,
  });
  const aimNdc = Object.freeze(
    resolveReticleAimNdc(basePosition, dotOffsetCssPixels, viewportWidth, viewportHeight),
  );
  return Object.freeze({ basePosition, ringOffsetCssPixels, dotOffsetCssPixels, aimNdc });
};

export interface FirstPersonPresentationSnapshot {
  readonly reticle: ReticlePresentation;
  readonly viewmodelOffset: CameraViewmodelOffset;
  readonly viewmodelRecoilDepth: number;
  readonly viewmodelTransition: CameraViewmodelTransition;
}

/** Select every reticle and held-viewmodel consumer from one damper snapshot. */
export const resolveFirstPersonPresentation = (
  position: ReticlePosition,
  motion: ReticleMotionInput &
    Pick<CameraMotionOffsets, "viewmodelOffset" | "viewmodelRecoilDepth" | "viewmodelTransition">,
  viewportWidth: number,
  viewportHeight: number,
): FirstPersonPresentationSnapshot =>
  Object.freeze({
    reticle: resolveReticlePresentation(position, motion, viewportWidth, viewportHeight),
    viewmodelOffset: motion.viewmodelOffset,
    viewmodelRecoilDepth: motion.viewmodelRecoilDepth,
    viewmodelTransition: motion.viewmodelTransition,
  });

/** Retain gameplay ray A while later presentation frames advance to ray B. */
export const snapshotActionAimRay = (aimRay: {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
}): { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 } => ({
  origin: aimRay.origin.clone(),
  direction: aimRay.direction.clone(),
});

export interface MeleeSwingLifecycleState<TAimRay> {
  readonly fireHeld: boolean;
  readonly swinging: boolean;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly hitResolved: boolean;
  readonly aimRay: TAimRay | null;
}

/** Cancel a delayed melee impact while preserving unrelated combat telemetry. */
export const resolveCancelledMeleeSwing = <TAimRay>(
  state: MeleeSwingLifecycleState<TAimRay>,
): MeleeSwingLifecycleState<TAimRay> => ({
  ...state,
  fireHeld: false,
  swinging: false,
  elapsedSeconds: 0,
  durationSeconds: 0,
  hitResolved: false,
  aimRay: null,
});

/** Require an active retained ray before the swing midpoint may resolve an impact. */
export const shouldResolveMeleeSwingImpact = (
  state: Pick<MeleeSwingLifecycleState<unknown>, "swinging" | "hitResolved" | "aimRay">,
  progress: number,
): boolean => state.swinging && !state.hitResolved && state.aimRay !== null && progress >= 0.5;

/**
 * Resolve the camera-local target used by a held viewmodel from the same live
 * ray as the visible reticle. The caller supplies scratch storage so this
 * shared-pose seam does not allocate in the animation loop.
 */
export const resolveViewmodelAimTargetLocal = (
  cameraWorldInverse: THREE.Matrix4,
  aimRay: {
    readonly origin: Readonly<PhysicsVector>;
    readonly direction: Readonly<PhysicsVector>;
  },
  distance: number,
  target = new THREE.Vector3(),
): THREE.Vector3 => {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  return target
    .set(
      aimRay.origin.x + aimRay.direction.x * safeDistance,
      aimRay.origin.y + aimRay.direction.y * safeDistance,
      aimRay.origin.z + aimRay.direction.z * safeDistance,
    )
    .applyMatrix4(cameraWorldInverse);
};
// Approximate the central human eye rather than a portrait lens: 17 mm focal
// length, a 1 arcminute circle of confusion, and a 4 mm reference pupil. The
// scene is authored in metre-like units, so photographic distances map
// directly to the table and room scale below.
const HUMAN_EYE_FOCAL_LENGTH_MM = 17;
const HUMAN_EYE_CIRCLE_OF_CONFUSION_MM =
  HUMAN_EYE_FOCAL_LENGTH_MM * Math.tan((1 / 60) * (Math.PI / 180));
const HUMAN_EYE_REFERENCE_PUPIL_MM = 4;
const HUMAN_EYE_BRIGHT_PUPIL_MM = 2.5;
const HUMAN_EYE_DARK_PUPIL_MM = 6.5;
const HUMAN_EYE_BRIGHT_LUMINANCE = 1.45;
const HUMAN_EYE_DARK_LUMINANCE = 0.35;
// Low contrast and larger-pupil aberration make dark-room focus acquisition
// less certain. This is a modest perceptual slowdown, not a claim that the
// ciliary muscles themselves respond 20% more slowly in darkness.
const HUMAN_EYE_DARK_ACCOMMODATION_SCALE = 0.8;
const HUMAN_EYE_REFERENCE_HYPERFOCAL_DISTANCE =
  (HUMAN_EYE_FOCAL_LENGTH_MM * HUMAN_EYE_FOCAL_LENGTH_MM) /
    ((HUMAN_EYE_FOCAL_LENGTH_MM / HUMAN_EYE_REFERENCE_PUPIL_MM) *
      HUMAN_EYE_CIRCLE_OF_CONFUSION_MM) /
    1000 +
  HUMAN_EYE_FOCAL_LENGTH_MM / 1000;
// Keep ordinary table views legible while still allowing a close tile to
// separate from the room. This is intentionally gentler than a cinematic
// portrait treatment.
const BOKEH_BASE_APERTURE = 0.00095;
const BOKEH_BASE_MAX_BLUR = 0.003;
const BOKEH_FOCUS_FALLBACK_DISTANCE = 12;
/** Debug-only multiplier cap; zoom mode uses the full available range. */
export const DEBUG_BOKEH_STRENGTH_MAX = 25;
export const STANDING_DOF_INTENSITY = 12.5;
export const ZOOMED_DOF_INTENSITY = 25;

/**
 * Resolve the default depth-of-field multiplier for the current view.
 * Posture no longer changes the blur; explicit zoom (iron sights or a scope)
 * uses the stronger 25× setting.
 */
export const resolveDofIntensityForPosture = (_isCrouched: boolean, isZoomed = false): number =>
  isZoomed ? ZOOMED_DOF_INTENSITY : STANDING_DOF_INTENSITY;
// Practical calibration points from the focus-lab pass: at the reference 4 mm
// pupil, 6 m reads as effectively sharp and 2.5 m retains roughly one quarter
// of the close-focus blur. Other pupil sizes scale this cutoff with dilation.
const BOKEH_PRACTICAL_HYPERFOCAL_DISTANCE = 6;
const BOKEH_DISTANCE_FALLOFF_POWER = 2.94;
// At the reference 4 mm pupil, 95% convergence is approximately 0.8 s near
// and 0.65 s far. Near focus is intentionally half-speed so shifting gaze onto
// a close object feels calm; dark adaptation adds a modest pupil-linked delay.
const BOKEH_NEAR_ACCOMMODATION_DAMPING = 3.5;
const BOKEH_FAR_ACCOMMODATION_DAMPING = 4.5;
const BOKEH_PUPIL_ADAPTATION_DAMPING = 2.4;
const shouldIncludeExplorationGateway = (): boolean => false;
const FOCUS_CALIBRATION_START_X = PLAY_AREA_ORIGINS.lookingFocusRoom.x - PLAY_AREA_SIZE_METERS / 4;
const FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE = HUMAN_EYE_REFERENCE_HYPERFOCAL_DISTANCE;
const FOCUS_CALIBRATION_LENGTH = FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE * 2;
const FOCUS_CALIBRATION_ENTRY_MARGIN = 1.6;
const FOCUS_CALIBRATION_HALL_WIDTH = 6.4;
const FOCUS_CALIBRATION_PLATFORM_WIDTH = 16;
const FOCUS_CALIBRATION_BACK_EXTENSION = 10;
const FOCUS_CALIBRATION_DECK_HEIGHT = 0;
const FOCUS_CALIBRATION_RAMP_RUN = 24;
const FOCUS_CALIBRATION_RAMP_WIDTH = 8;
const FOCUS_CALIBRATION_RAMP_TOP_Z = FOCUS_CALIBRATION_PLATFORM_WIDTH / 2;
const CLIMBING_GYM_RUN_Y = 0.11;
// The table camera is intentionally elevated for the seated mahjong view.
// The parkour test lane uses the capsule's real standing eye reference so a
// measured 2 m block is visibly above the player's head instead of below it.
export const CLIMBING_GYM_STANDING_EYE_HEIGHT = PLAYER_STANDING_EYE_HEIGHT;
// Keep the training lane centered in its own ground-level 50 m play area.
const CLIMBING_GYM_ZONE_ORIGIN_X = PLAY_AREA_ORIGINS.climbingGym.x;
const CLIMBING_GYM_ZONE_ORIGIN_Z = PLAY_AREA_ORIGINS.climbingGym.z;
// Keep the demo spawn on open ground and point directly at the measured vault
// row. The row is close enough that a normal walk reaches it in about a second,
// so every height can be tested without relying on the sprint double-tap.
const CLIMBING_GYM_PRESET_START_X = CLIMBING_GYM_ZONE_ORIGIN_X - 16;
const CLIMBING_GYM_PRESET_START_Z = CLIMBING_GYM_ZONE_ORIGIN_Z + 12;
const CLIMBING_GYM_PRESET_TARGET_X = CLIMBING_GYM_ZONE_ORIGIN_X - 7.4;
const CLIMBING_GYM_PRESET_TARGET_Z = CLIMBING_GYM_ZONE_ORIGIN_Z + 12;
const CLIMBING_GYM_PLATFORM_HEIGHT_METERS = 0.16;
const CLIMBING_GYM_PLATFORM_COLLIDER_HEIGHT_METERS = 0.16;

const PARAMETRIC_BARRACKS_WIDTH_METERS = 42;
const PARAMETRIC_BARRACKS_DEPTH_METERS = 24;
const PARAMETRIC_BARRACKS_WALL_HEIGHT_METERS = 3.8;
const PARAMETRIC_BARRACKS_ORIGIN = PLAY_AREA_ORIGINS.parametricBarracks;
const PARAMETRIC_TARGET_RANGE_WIDTH_METERS = 42;
const PARAMETRIC_TARGET_RANGE_DEPTH_METERS = 48;
const PARAMETRIC_TARGET_RANGE_ORIGIN = PLAY_AREA_ORIGINS.targetRange;
const PARAMETRIC_TARGET_RANGE_START_Z = PARAMETRIC_TARGET_RANGE_ORIGIN.z + 19;
const PARAMETRIC_GUN_RACK_ROWS = 4;
const PARAMETRIC_GUN_RACK_SPACING_Z = 4.2;

type ClimbingGymObstacleMaterial = "base" | "ledge" | "rail";

type ClimbingGymObstacleBase = Readonly<{
  name: string;
  kind: "run" | "ledge" | "vault" | "prism";
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  material: ClimbingGymObstacleMaterial;
}>;

type ClimbingGymRunObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "run"; y: number }>;
type ClimbingGymLedgeObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "ledge"; topY: number }>;
type ClimbingGymVaultObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "vault"; topY: number }>;
type ClimbingGymPrismObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "prism"; y: number }>;

type ClimbingGymObstacle =
  | ClimbingGymRunObstacle
  | ClimbingGymLedgeObstacle
  | ClimbingGymVaultObstacle
  | ClimbingGymPrismObstacle;

const CLIMBING_GYM_VAULT_HEIGHT_STEP_METERS = 0.1;
const CLIMBING_GYM_VAULT_MAX_HEIGHT_METERS = 5;
export const CLIMBING_GYM_VAULT_HEIGHTS: readonly number[] = Object.freeze(
  Array.from(
    {
      length: Math.round(
        CLIMBING_GYM_VAULT_MAX_HEIGHT_METERS / CLIMBING_GYM_VAULT_HEIGHT_STEP_METERS,
      ),
    },
    (_, index) => Number(((index + 1) * CLIMBING_GYM_VAULT_HEIGHT_STEP_METERS).toFixed(1)),
  ),
);
const CLIMBING_GYM_VAULT_ROW_X = CLIMBING_GYM_ZONE_ORIGIN_X - 6;
const CLIMBING_GYM_VAULT_ROW_START_Z = CLIMBING_GYM_ZONE_ORIGIN_Z + 12;
const CLIMBING_GYM_VAULT_ROW_SPACING = 0.96;
const CLIMBING_GYM_VAULT_BLOCK_WIDTH = 1.2;
const CLIMBING_GYM_VAULT_BLOCK_DEPTH = 0.8;
const CLIMBING_GYM_VAULT_BLOCKS: readonly ClimbingGymVaultObstacle[] =
  CLIMBING_GYM_VAULT_HEIGHTS.map((topY, index) => ({
    name: `ClimbingGymVaultBlock${String(Math.round(topY * 100)).padStart(3, "0")}`,
    kind: "vault",
    x: CLIMBING_GYM_VAULT_ROW_X,
    z:
      CLIMBING_GYM_VAULT_ROW_START_Z +
      (index - (CLIMBING_GYM_VAULT_HEIGHTS.length - 1) / 2) * CLIMBING_GYM_VAULT_ROW_SPACING,
    width: CLIMBING_GYM_VAULT_BLOCK_WIDTH,
    height: topY,
    depth: CLIMBING_GYM_VAULT_BLOCK_DEPTH,
    topY,
    material: "ledge",
  }));

const CLIMBING_GYM_FEATURES: readonly ClimbingGymObstacle[] = [
  {
    name: "ClimbingGymHangWall",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 10,
    y: 1.9,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 12,
    width: 0.5,
    height: 3.8,
    depth: 6,
    material: "base",
  },
  {
    name: "ClimbingGymRunEntry",
    kind: "run",
    x: CLIMBING_GYM_ZONE_ORIGIN_X,
    y: CLIMBING_GYM_RUN_Y,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z,
    width: 3.25,
    height: 0.22,
    depth: 1.9,
    material: "base",
  },
  {
    name: "ClimbingGymSouthWestRun",
    kind: "run",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 21.6,
    y: CLIMBING_GYM_RUN_Y,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 20.4,
    width: 6.1,
    height: 0.22,
    depth: 2.6,
    material: "base",
  },
  {
    name: "ClimbingGymSouthWestHoldOne",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 21.0,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 19.8,
    topY: 1.02,
    width: 3.6,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.9,
    material: "ledge",
  },
  {
    name: "ClimbingGymSouthWestHoldTwo",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 23.2,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 18.6,
    topY: 1.72,
    width: 2.8,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.5,
    material: "ledge",
  },
  {
    name: "ClimbingGymSouthWestHoldThree",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 22.6,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 22.1,
    topY: 2.32,
    width: 1.6,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.0,
    material: "ledge",
  },
  {
    name: "ClimbingGymSouthWestColumnOne",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 23.4,
    y: 1.4,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 20.2,
    width: 0.46,
    height: 2.5,
    depth: 0.46,
    material: "base",
  },
  {
    name: "ClimbingGymSouthWestBeamLow",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 20.8,
    y: 0.56,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 21.0,
    width: 3.8,
    height: 0.16,
    depth: 0.22,
    material: "rail",
  },
  {
    name: "ClimbingGymSouthWestBeamMid",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 24.0,
    y: 1.22,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 19.5,
    width: 2.0,
    height: 0.14,
    depth: 0.2,
    material: "rail",
  },
  {
    name: "ClimbingGymSouthWestWall",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 21.9,
    y: 1.25,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 17.9,
    width: 0.11,
    height: 1.95,
    depth: 2.2,
    material: "rail",
  },
  {
    name: "ClimbingGymWestRun",
    kind: "run",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 8.9,
    y: CLIMBING_GYM_RUN_Y,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 5.1,
    width: 4.4,
    height: 0.22,
    depth: 2.3,
    material: "base",
  },
  {
    name: "ClimbingGymWestHoldOne",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 9.8,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 4.8,
    topY: 0.97,
    width: 2.9,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.7,
    material: "ledge",
  },
  {
    name: "ClimbingGymWestHoldTwo",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 8.0,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 6.2,
    topY: 1.55,
    width: 2.1,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.4,
    material: "ledge",
  },
  {
    name: "ClimbingGymWestHoldThree",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 6.2,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 3.4,
    topY: 2.27,
    width: 1.8,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.2,
    material: "ledge",
  },
  {
    name: "ClimbingGymWestColumnOne",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 7.4,
    y: 1.2,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 5.0,
    width: 0.42,
    height: 2.6,
    depth: 0.42,
    material: "base",
  },
  {
    name: "ClimbingGymWestBeamLow",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 10.2,
    y: 0.56,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 6.9,
    width: 3.0,
    height: 0.16,
    depth: 0.22,
    material: "rail",
  },
  {
    name: "ClimbingGymWestBeamMid",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 7.0,
    y: 1.18,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 4.3,
    width: 2.2,
    height: 0.14,
    depth: 0.2,
    material: "rail",
  },
  {
    name: "ClimbingGymWestWall",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X - 5.4,
    y: 1.5,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z - 5.7,
    width: 0.11,
    height: 2.1,
    depth: 2.2,
    material: "rail",
  },
  {
    name: "ClimbingGymEastRun",
    kind: "run",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 7.8,
    y: CLIMBING_GYM_RUN_Y,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 6.0,
    width: 5.0,
    height: 0.22,
    depth: 2.6,
    material: "base",
  },
  {
    name: "ClimbingGymEastHoldOne",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 7.0,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 7.4,
    topY: 1.02,
    width: 2.9,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.7,
    material: "ledge",
  },
  {
    name: "ClimbingGymEastHoldTwo",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 9.6,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 5.6,
    topY: 1.7,
    width: 2.4,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.4,
    material: "ledge",
  },
  {
    name: "ClimbingGymEastHoldThree",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 11.0,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 8.2,
    topY: 2.35,
    width: 1.6,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.1,
    material: "ledge",
  },
  {
    name: "ClimbingGymEastColumnOne",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 9.2,
    y: 1.35,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 8.9,
    width: 0.38,
    height: 2.9,
    depth: 0.38,
    material: "base",
  },
  {
    name: "ClimbingGymEastBeamLow",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 10.4,
    y: 0.56,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 4.4,
    width: 3.4,
    height: 0.16,
    depth: 0.22,
    material: "rail",
  },
  {
    name: "ClimbingGymEastBeamMid",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 8.2,
    y: 1.16,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 6.8,
    width: 2.0,
    height: 0.14,
    depth: 0.2,
    material: "rail",
  },
  {
    name: "ClimbingGymEastWall",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 6.4,
    y: 1.9,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 6.4,
    width: 0.11,
    height: 2.0,
    depth: 2.2,
    material: "rail",
  },
  {
    name: "ClimbingGymNorthEastRun",
    kind: "run",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 18.8,
    y: CLIMBING_GYM_RUN_Y,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 18.8,
    width: 5.8,
    height: 0.22,
    depth: 2.8,
    material: "base",
  },
  {
    name: "ClimbingGymNorthEastHoldOne",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 17.2,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 19.4,
    topY: 1.02,
    width: 2.9,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.7,
    material: "ledge",
  },
  {
    name: "ClimbingGymNorthEastHoldTwo",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 20.0,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 20.4,
    topY: 1.72,
    width: 2.3,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.3,
    material: "ledge",
  },
  {
    name: "ClimbingGymNorthEastHoldThree",
    kind: "ledge",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 22.0,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 17.6,
    topY: 2.45,
    width: 1.6,
    height: CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
    depth: 1.1,
    material: "ledge",
  },
  {
    name: "ClimbingGymNorthEastColumnOne",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 20.4,
    y: 1.55,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 18.2,
    width: 0.44,
    height: 2.4,
    depth: 0.44,
    material: "base",
  },
  {
    name: "ClimbingGymNorthEastBeamLow",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 19.1,
    y: 0.56,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 21.2,
    width: 3.2,
    height: 0.16,
    depth: 0.22,
    material: "rail",
  },
  {
    name: "ClimbingGymNorthEastBeamMid",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 17.6,
    y: 1.22,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 19.8,
    width: 2.1,
    height: 0.14,
    depth: 0.2,
    material: "rail",
  },
  {
    name: "ClimbingGymNorthEastWall",
    kind: "prism",
    x: CLIMBING_GYM_ZONE_ORIGIN_X + 21.8,
    y: 1.45,
    z: CLIMBING_GYM_ZONE_ORIGIN_Z + 20.8,
    width: 0.11,
    height: 1.95,
    depth: 1.9,
    material: "rail",
  },
  ...CLIMBING_GYM_VAULT_BLOCKS,
];
const CLIMBING_GYM_TEST_FEATURES: readonly ClimbingGymObstacle[] = CLIMBING_GYM_FEATURES.filter(
  (obstacle) => obstacle.kind === "vault",
);

const createClimbingGymCollider = (obstacle: ClimbingGymObstacle): PhysicsBox => {
  if (obstacle.kind === "ledge") {
    return {
      center: {
        x: obstacle.x,
        y: obstacle.topY - CLIMBING_GYM_PLATFORM_COLLIDER_HEIGHT_METERS / 2,
        z: obstacle.z,
      },
      halfExtents: {
        x: obstacle.width / 2,
        y: CLIMBING_GYM_PLATFORM_COLLIDER_HEIGHT_METERS / 2,
        z: obstacle.depth / 2,
      },
    };
  }

  if (obstacle.kind === "vault") {
    return {
      center: {
        x: obstacle.x,
        y: obstacle.topY / 2,
        z: obstacle.z,
      },
      halfExtents: {
        x: obstacle.width / 2,
        y: obstacle.topY / 2,
        z: obstacle.depth / 2,
      },
    };
  }

  return {
    center: {
      x: obstacle.x,
      y: obstacle.y,
      z: obstacle.z,
    },
    halfExtents: {
      x: obstacle.width / 2,
      y: obstacle.height / 2,
      z: obstacle.depth / 2,
    },
  };
};

const EXPLORATION_CHUNK_BUILDING_EDGE_OFFSET = EXPLORATION_CHUNK_SIZE * (2.45 / 8);
const EXPLORATION_CHUNK_BUILDING_EDGE_JITTER = EXPLORATION_CHUNK_SIZE * (2.3 / 8);

/**
 * The room occupies the full streamed block at the gateway. Keep this
 * exclusion slightly outside the visible shell; city geometry may touch the
 * gateway, but it must never be authored under the penthouse floor or through
 * its walls.
 */
export const EXPLORATION_PENTHOUSE_BOUNDS = {
  minX: -(PENTHOUSE_HALF_WIDTH_METERS + 0.25),
  maxX: PENTHOUSE_HALF_WIDTH_METERS + 0.25,
  minZ: -(PENTHOUSE_HALF_DEPTH_METERS + 0.25),
  maxZ: PENTHOUSE_HALF_DEPTH_METERS + 0.25,
} as const;

export interface ExplorationRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const PLAY_AREA_DEFINITIONS = [
  {
    id: "penthouse",
    label: "Penthouse",
    origin: PLAY_AREA_ORIGINS.penthouse,
    accent: "#73dce8",
  },
  {
    id: "lookingFocusRoom",
    label: "Looking focus room",
    origin: PLAY_AREA_ORIGINS.lookingFocusRoom,
    accent: "#d8a85c",
  },
  {
    id: "climbingGym",
    label: "Climbing gym",
    origin: PLAY_AREA_ORIGINS.climbingGym,
    accent: "#db5c67",
  },
  {
    id: "parametricBarracks",
    label: "Parametric barracks",
    origin: PLAY_AREA_ORIGINS.parametricBarracks,
    accent: "#e1a64d",
  },
  {
    id: "targetRange",
    label: "Target range",
    origin: PLAY_AREA_ORIGINS.targetRange,
    accent: "#f04438",
  },
] as const;

const PLAY_AREA_BOUNDS = PLAY_AREA_DEFINITIONS.map(({ label, origin }) => ({
  label,
  minX: origin.x - PLAY_AREA_HALF_SIZE,
  maxX: origin.x + PLAY_AREA_HALF_SIZE,
  minZ: origin.z - PLAY_AREA_HALF_SIZE,
  maxZ: origin.z + PLAY_AREA_HALF_SIZE,
}));

/** Return true when a horizontal city rectangle does not enter the room. */
export const isExplorationRectOutsidePenthouse = (rect: ExplorationRect): boolean =>
  rect.maxX <= EXPLORATION_PENTHOUSE_BOUNDS.minX ||
  rect.minX >= EXPLORATION_PENTHOUSE_BOUNDS.maxX ||
  rect.maxZ <= EXPLORATION_PENTHOUSE_BOUNDS.minZ ||
  rect.minZ >= EXPLORATION_PENTHOUSE_BOUNDS.maxZ;

/** Return true when a rectangle stays outside every reserved play area. */
export const isExplorationRectOutsidePlayAreas = (rect: ExplorationRect): boolean =>
  PLAY_AREA_BOUNDS.every(
    (bounds) =>
      rect.maxX <= bounds.minX ||
      rect.minX >= bounds.maxX ||
      rect.maxZ <= bounds.minZ ||
      rect.minZ >= bounds.maxZ,
  );
const isExplorationRectOutsideWorld = (rect: ExplorationRect): boolean =>
  rect.maxX <= WORLD_BOUNDS.minX ||
  rect.minX >= WORLD_BOUNDS.maxX ||
  rect.maxZ <= WORLD_BOUNDS.minZ ||
  rect.minZ >= WORLD_BOUNDS.maxZ;

const isExplorationRectOutsideFocusCalibrationRamp = (rect: ExplorationRect): boolean =>
  rect.maxX <= FOCUS_CALIBRATION_START_X - FOCUS_CALIBRATION_RAMP_WIDTH / 2 ||
  rect.minX >= FOCUS_CALIBRATION_START_X + FOCUS_CALIBRATION_RAMP_WIDTH / 2 ||
  rect.maxZ <= FOCUS_CALIBRATION_RAMP_TOP_Z ||
  rect.minZ >= FOCUS_CALIBRATION_RAMP_TOP_Z + FOCUS_CALIBRATION_RAMP_RUN;

const clipExplorationRectAroundBounds = (
  rect: ExplorationRect,
  bounds: ExplorationRect,
): readonly ExplorationRect[] => {
  if (
    rect.maxX <= bounds.minX ||
    rect.minX >= bounds.maxX ||
    rect.maxZ <= bounds.minZ ||
    rect.minZ >= bounds.maxZ
  ) {
    return [rect];
  }

  const clipped: ExplorationRect[] = [];
  const add = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    if (maxX <= minX || maxZ <= minZ) {
      return;
    }
    clipped.push({ minX, maxX, minZ, maxZ });
  };

  if (rect.minX < bounds.minX) {
    add(rect.minX, Math.min(rect.maxX, bounds.minX), rect.minZ, rect.maxZ);
  }
  if (rect.maxX > bounds.maxX) {
    add(Math.max(rect.minX, bounds.maxX), rect.maxX, rect.minZ, rect.maxZ);
  }

  const overlapMinX = Math.max(rect.minX, bounds.minX);
  const overlapMaxX = Math.min(rect.maxX, bounds.maxX);
  if (overlapMaxX > overlapMinX) {
    if (rect.minZ < bounds.minZ) {
      add(overlapMinX, overlapMaxX, rect.minZ, Math.min(rect.maxZ, bounds.minZ));
    }
    if (rect.maxZ > bounds.maxZ) {
      add(overlapMinX, overlapMaxX, Math.max(rect.minZ, bounds.maxZ), rect.maxZ);
    }
  }
  return clipped;
};

/** Keep the existing penthouse clipping helper stable for map consumers. */
export const clipExplorationRectAroundPenthouse = (
  rect: ExplorationRect,
): readonly ExplorationRect[] =>
  clipExplorationRectAroundBounds(rect, EXPLORATION_PENTHOUSE_BOUNDS);

/** Keep streamed ground and paths out of every authored play-area footprint. */
export const clipExplorationRectAroundPlayAreas = (
  rect: ExplorationRect,
): readonly ExplorationRect[] => {
  let pieces: readonly ExplorationRect[] = [rect];
  for (const bounds of PLAY_AREA_BOUNDS) {
    pieces = pieces.flatMap((piece) => clipExplorationRectAroundBounds(piece, bounds));
  }
  return pieces;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothStep = (value: number): number => value * value * (3 - 2 * value);

const resolveClimbingTransitionY = (transition: ClimbingTransition, elapsed: number): number => {
  const progress = smoothStep(
    THREE.MathUtils.clamp(elapsed / Math.max(transition.duration, Number.EPSILON), 0, 1),
  );
  return transition.phase === "vault"
    ? THREE.MathUtils.lerp(transition.startY, transition.targetY, progress) +
        Math.sin(progress * Math.PI) * transition.arcHeight
    : THREE.MathUtils.lerp(transition.startY, transition.targetY, progress);
};

const hashNoise = (seed: string, x: number, z: number, salt: string): number => {
  const random = createSeededRandom(`${seed}|${salt}|${String(x)}|${String(z)}`);
  return random.nextFloat();
};

const sampleExplorationNoise = (
  seed: string,
  worldX: number,
  worldZ: number,
  scale: number,
  salt: string,
): number => {
  const scaledX = worldX * scale;
  const scaledZ = worldZ * scale;
  const x0 = Math.floor(scaledX);
  const z0 = Math.floor(scaledZ);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smoothStep(scaledX - x0);
  const tz = smoothStep(scaledZ - z0);
  const n00 = hashNoise(seed, x0, z0, salt);
  const n10 = hashNoise(seed, x1, z0, salt);
  const n01 = hashNoise(seed, x0, z1, salt);
  const n11 = hashNoise(seed, x1, z1, salt);
  const xA = n00 + (n10 - n00) * tx;
  const xB = n01 + (n11 - n01) * tx;
  return xA + (xB - xA) * tz;
};

const sampleExplorationBiomeNoise = (
  seed: string,
  chunkX: number,
  chunkZ: number,
  salt: string,
): number => {
  const worldX = chunkX * EXPLORATION_CHUNK_SIZE;
  const worldZ = chunkZ * EXPLORATION_CHUNK_SIZE;
  const coarse = sampleExplorationNoise(seed, worldX, worldZ, 0.022, salt);
  const fine = sampleExplorationNoise(seed, worldX, worldZ, 0.11, salt);
  return clamp01(0.72 * coarse + 0.28 * fine);
};

interface ExplorationBiomeStyle {
  readonly label: string;
  readonly ground: number;
  readonly path: number;
  readonly prop: number;
  readonly accent: number;
  readonly preferredTemperature: number;
  readonly preferredHumidity: number;
  readonly preferredElevation: number;
  readonly temperatureTolerance: number;
  readonly humidityTolerance: number;
  readonly elevationTolerance: number;
  readonly buildingDensity: number;
  readonly buildingHeightMin: number;
  readonly buildingHeightMax: number;
  readonly windowHeight: number;
  readonly pathFrequency: number;
  readonly bridgeDensity: number;
  readonly propDensity: number;
  readonly beaconDensity: number;
  readonly citySignDensity: number;
  readonly utilityPostDensity: number;
}

interface ResolvedExplorationBiome {
  readonly style: ExplorationBiomeStyle;
  readonly styleIndex: number;
  readonly temperature: number;
  readonly humidity: number;
  readonly elevation: number;
  readonly featureNoise: number;
}

const EXPLORATION_BIOMES: readonly ExplorationBiomeStyle[] = [
  {
    label: "South courtyard",
    ground: 0x545f67,
    path: 0x3a4852,
    prop: 0x72818d,
    accent: 0x93a0ad,
    preferredTemperature: 0.52,
    preferredHumidity: 0.48,
    preferredElevation: 0.3,
    temperatureTolerance: 0.2,
    humidityTolerance: 0.22,
    elevationTolerance: 0.24,
    buildingDensity: 1.45,
    buildingHeightMin: 1.5,
    buildingHeightMax: 5.6,
    windowHeight: 3.8,
    pathFrequency: 0.55,
    bridgeDensity: 0.15,
    propDensity: 1.05,
    beaconDensity: 0.22,
    citySignDensity: 1.2,
    utilityPostDensity: 1.0,
  },
  {
    label: "West tea garden",
    ground: 0x505c65,
    path: 0x37434d,
    prop: 0x6e7b88,
    accent: 0x8a96a2,
    preferredTemperature: 0.46,
    preferredHumidity: 0.63,
    preferredElevation: 0.48,
    temperatureTolerance: 0.23,
    humidityTolerance: 0.2,
    elevationTolerance: 0.25,
    buildingDensity: 1.0,
    buildingHeightMin: 1,
    buildingHeightMax: 4.2,
    windowHeight: 2.8,
    pathFrequency: 0.45,
    bridgeDensity: 0.12,
    propDensity: 1.36,
    beaconDensity: 0.3,
    citySignDensity: 1.0,
    utilityPostDensity: 1.15,
  },
  {
    label: "East practice court",
    ground: 0x5a656f,
    path: 0x3e4a54,
    prop: 0x7a8794,
    accent: 0x97a3ae,
    preferredTemperature: 0.63,
    preferredHumidity: 0.42,
    preferredElevation: 0.56,
    temperatureTolerance: 0.21,
    humidityTolerance: 0.22,
    elevationTolerance: 0.22,
    buildingDensity: 1.95,
    buildingHeightMin: 1.8,
    buildingHeightMax: 5.9,
    windowHeight: 4.2,
    pathFrequency: 0.52,
    bridgeDensity: 0.2,
    propDensity: 1.0,
    beaconDensity: 0.18,
    citySignDensity: 1.3,
    utilityPostDensity: 1.25,
  },
  {
    label: "North skybridge",
    ground: 0x515a63,
    path: 0x394450,
    prop: 0x6f7d89,
    accent: 0x91a0ad,
    preferredTemperature: 0.58,
    preferredHumidity: 0.54,
    preferredElevation: 0.68,
    temperatureTolerance: 0.21,
    humidityTolerance: 0.21,
    elevationTolerance: 0.2,
    buildingDensity: 1.15,
    buildingHeightMin: 2.8,
    buildingHeightMax: 7,
    windowHeight: 4.6,
    pathFrequency: 0.58,
    bridgeDensity: 0.35,
    propDensity: 0.85,
    beaconDensity: 0.18,
    citySignDensity: 1.4,
    utilityPostDensity: 1.1,
  },
] as const;

const resolveExplorationBiome = (
  seed: string,
  chunkX: number,
  chunkZ: number,
): ResolvedExplorationBiome => {
  const temperature = sampleExplorationBiomeNoise(seed, chunkX, chunkZ, "temp");
  const humidity = sampleExplorationBiomeNoise(seed, chunkX, chunkZ, "humidity");
  const elevation = sampleExplorationBiomeNoise(seed, chunkX, chunkZ, "elevation");
  const featureNoise = sampleExplorationBiomeNoise(seed, chunkX, chunkZ, "feature");

  let resolvedStyle = EXPLORATION_BIOMES[0]!;
  let resolvedStyleIndex = 0;
  let highestScore = -Infinity;

  for (let index = 0; index < EXPLORATION_BIOMES.length; index += 1) {
    const style = EXPLORATION_BIOMES[index];
    if (style === undefined) {
      continue;
    }
    const tempScore = clamp01(
      1 - Math.abs(temperature - style.preferredTemperature) / style.temperatureTolerance,
    );
    const humidityScore = clamp01(
      1 - Math.abs(humidity - style.preferredHumidity) / style.humidityTolerance,
    );
    const elevationScore = clamp01(
      1 - Math.abs(elevation - style.preferredElevation) / style.elevationTolerance,
    );
    const score = tempScore * 0.48 + humidityScore * 0.34 + elevationScore * 0.18;
    if (score > highestScore) {
      highestScore = score;
      resolvedStyle = style;
      resolvedStyleIndex = index;
    }
  }

  return {
    style: resolvedStyle,
    styleIndex: resolvedStyleIndex,
    temperature,
    humidity,
    elevation,
    featureNoise,
  };
};

const PHYSICS_COLLISION_ROOT_NAMES: ReadonlySet<string> = new Set([
  "EnvironmentRoot",
  "GeneratedRoomRoot",
  "ExplorationGateway",
  "FocusCalibrationRoot",
  "ParametricGunBarracksRoot",
  "ParametricTargetRangeRoot",
]);

// These are presentation-only details. Keeping them out of the collision set
// prevents a thin light strip or floor inlay from becoming a tiny bump while
// still allowing the surrounding walls, furniture, glass, and fixtures to be
// represented by coarse boxes.
const PHYSICS_IGNORED_OBJECT_NAMES: ReadonlySet<string> = new Set([
  "PenthouseFloor",
  "MahjongZoneInset",
  "GeneratedFloorPanel",
  "RedDirectionalLine",
  "CyanCeilingStrip",
  "TeacherPanelStatusLine",
  "PendantLightStrip",
  "GeneratedLightBar",
  "FocusCalibrationRamp",
]);

const PHYSICS_MINIMUM_HALF_EXTENT = 0.025;

const isPhysicsIgnored = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current.userData.physicsIgnore === true) {
      return true;
    }
    current = current.parent;
  }
  return PHYSICS_IGNORED_OBJECT_NAMES.has(object.name);
};

const isObjectVisibleInScene = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
};

const createWallPhysicsBoxes = (wallRoot: THREE.Object3D | null): readonly PhysicsBox[] => {
  if (wallRoot === null) {
    return [];
  }
  const wallOffset = TABLE_WIDTH / 2 + 0.19;
  const wallRunHalfLength = ((WALL_COUNT - 1) * WALL_SPACING) / 2 + 0.06;
  const wallHeightCenterY = TABLE_TOP_Y + 0.165;
  const wallHalfHeight = 0.15;
  const wallSideHalfThickness = 0.07;
  const wallEndHalfThickness = 0.08;
  return [
    {
      center: { x: 0, y: wallHeightCenterY, z: -wallOffset },
      halfExtents: {
        x: wallRunHalfLength,
        y: wallHalfHeight,
        z: wallEndHalfThickness,
      },
    },
    {
      center: { x: 0, y: wallHeightCenterY, z: wallOffset },
      halfExtents: {
        x: wallRunHalfLength,
        y: wallHalfHeight,
        z: wallEndHalfThickness,
      },
    },
    {
      center: { x: wallOffset, y: wallHeightCenterY, z: 0 },
      halfExtents: {
        x: wallSideHalfThickness,
        y: wallHalfHeight,
        z: wallRunHalfLength,
      },
    },
    {
      center: { x: -wallOffset, y: wallHeightCenterY, z: 0 },
      halfExtents: {
        x: wallSideHalfThickness,
        y: wallHalfHeight,
        z: wallRunHalfLength,
      },
    },
  ];
};

const createClimbingGymPhysicsBoxes = (): readonly PhysicsBox[] => {
  return CLIMBING_GYM_TEST_FEATURES.map(createClimbingGymCollider);
};

export const resolveLedgeClimbTargetCameraY = (transitionY: number): number =>
  transitionY - PLAYER_COLLIDER_CENTER_HEIGHT + LEDGE_CLIMB_EYE_HEIGHT;

/* ----------------------------------------------------------------------
 *  VAULT HELPERS
 *
 *  A “vault” is a jump onto a platform that is **not tall enough** for a
 *  ledge grab, but **too high** for the controller’s autostep.
 *
 *  The numbers below are tuned for the default character capsule
 *  (radius = 0.26 m, capsule centre = 0.86 m, eye height = 1.75 m). Feel
 *  free to expose them in a
 *  JSON scenario if you want them tunable.
 * ---------------------------------------------------------------------- */

/** Minimum top of a box (relative to the player’s feet) that can be vaulted onto. */
export const VAULT_MIN_HEIGHT = 0.15; // 15 cm above the feet
/** Maximum top of a box that can use the continuous vault/climb transition. */
export const VAULT_MAX_HEIGHT = 2; // 2 m above the feet
/** Obstacles at or below this height are crossed almost immediately. */
export const VAULT_LEG_HEIGHT = 0.45;
export const VAULT_MIN_DURATION_SECONDS = 0.04;
export const VAULT_MAX_DURATION_SECONDS = 1;
/** Resolve the climb-over duration from the obstacle height above the feet. */
export const resolveVaultTraversalDuration = (heightAboveFeet: number): number => {
  const normalizedHeight = THREE.MathUtils.clamp(
    (heightAboveFeet - VAULT_LEG_HEIGHT) / (VAULT_MAX_HEIGHT - VAULT_LEG_HEIGHT),
    0,
    1,
  );
  return THREE.MathUtils.lerp(
    VAULT_MIN_DURATION_SECONDS,
    VAULT_MAX_DURATION_SECONDS,
    normalizedHeight,
  );
};
/** Half of the full-landing reference charge is enough for a two-metre traversal. */
const O2_TRAVERSAL_COST_SCALE = 0.5;

/**
 * Resolve the discrete O₂ charge for a vault or wall climb from its height.
 * The smallest vaultable ledges are free; a two-metre traversal costs half of
 * the 10 O₂ reference charge used by a full landing, with a linear curve
 * between those endpoints.
 */
export const resolveVaultTraversalO2Cost = (heightAboveFeet: number): number => {
  const safeHeight = Number.isFinite(heightAboveFeet) ? Math.max(0, heightAboveFeet) : 0;
  const normalizedHeight = THREE.MathUtils.clamp(
    (safeHeight - VAULT_MIN_HEIGHT) / (VAULT_MAX_HEIGHT - VAULT_MIN_HEIGHT),
    0,
    1,
  );
  return O2_LANDING_BASE_COST * O2_TRAVERSAL_COST_SCALE * normalizedHeight;
};
/**
 * Scale traversal time from the current O₂ reserve. Empty O₂ keeps the existing
 * maximum duration as the slowest case; full O₂ doubles traversal speed.
 */
export const resolveO2ScaledTraversalDuration = (
  baseDurationSeconds: number,
  oxygenRatio: number,
): number => {
  const safeDuration = Number.isFinite(baseDurationSeconds) ? Math.max(0, baseDurationSeconds) : 0;
  const safeOxygenRatio = Number.isFinite(oxygenRatio)
    ? THREE.MathUtils.clamp(oxygenRatio, 0, 1)
    : 0;
  const durationMultiplier = 2 ** -safeOxygenRatio;
  return safeDuration * durationMultiplier;
};
/** Scale the over-the-top arc with the same continuous height mapping. */
export const resolveVaultTraversalArcHeight = (heightAboveFeet: number): number => {
  const normalizedHeight = THREE.MathUtils.clamp(
    (heightAboveFeet - VAULT_LEG_HEIGHT) / (VAULT_MAX_HEIGHT - VAULT_LEG_HEIGHT),
    0,
    1,
  );
  return THREE.MathUtils.lerp(0.03, 0.24, normalizedHeight);
};
/** Horizontal clearance needed on each side of the box while vaulting. */
export const VAULT_SIDE_BUFFER = 0.06; // same buffer used for ledge detection
/** Maximum distance from a low platform's approached edge before a vault can start. */
const VAULT_APPROACH_DISTANCE = 0.85;
/** Small allowance for a capsule that has already touched the platform edge. */
const VAULT_EDGE_TOLERANCE = 0.12;

/**
 * Try to find a static box that the player can “vault” onto.
 *
 * The resolver owns the continuous 0.15–2.0 m climb-over window (`VAULT_*`).
 * If a suitable box is found, a point on its supported top surface is
 * returned; otherwise `null` is returned.
 *
 * @param fromPosition          Player position **before** the jump.
 * @param desiredHorizontalDelta  Desired horizontal displacement for the current frame.
 * @param feetY                 Height of the player’s feet (center.y – collider radius).
 * @param staticPhysicsBoxes    All static colliders in the scene.
 *
 * @returns The capsule-centre target on top of the vaultable box, or `null`
 * if none found.
 */
export interface TraversalTargetResolution {
  readonly target: PhysicsVector;
  readonly box: PhysicsBox;
  readonly obstacleId: string;
  readonly topY: number;
}

export const resolveVaultTargetDetails = (
  fromPosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  feetY: number,
  staticPhysicsBoxes: readonly PhysicsBox[],
): TraversalTargetResolution | null => {
  const horizDist = Math.hypot(desiredHorizontalDelta.x, desiredHorizontalDelta.z);
  if (horizDist < 0.015) return null; // not moving enough horizontally

  // Normalised approach direction. Every box is evaluated in its own local
  // frame so streamed procedural boxes and authored boxes use the same face
  // geometry as their Rapier colliders.
  const dirX = desiredHorizontalDelta.x / horizDist;
  const dirZ = desiredHorizontalDelta.z / horizDist;

  const minTopY = feetY + VAULT_MIN_HEIGHT;
  const maxTopY = feetY + VAULT_MAX_HEIGHT;

  // Where the player wants to land if the vault succeeds. Keep the landing
  // bias used by the refined ledge transition: a vault should carry the
  // capsule onto the supported surface instead of stopping on its first
  // collision edge.
  const targetX = fromPosition.x + desiredHorizontalDelta.x + dirX * LEDGE_CLIMB_FORWARD_OFFSET;
  const targetZ = fromPosition.z + desiredHorizontalDelta.z + dirZ * LEDGE_CLIMB_FORWARD_OFFSET;

  const best: {
    value: {
      target: PhysicsVector;
      box: PhysicsBox;
      topY: number;
      gap: number;
      edgeGap: number;
    } | null;
  } = {
    value: null,
  };

  const tryBox = (box: PhysicsBox): void => {
    // The top of the box must be within the vault height window.
    const topY = box.center.y + box.halfExtents.y;
    if (topY < minTopY || topY > maxTopY) return;

    const rotationY = box.rotationY ?? 0;
    const localPosition = toBoxLocalPoint(fromPosition, box);
    const localDirection = rotateHorizontalToBoxLocal(dirX, dirZ, rotationY);
    const movingAlongX = Math.abs(localDirection.x) >= Math.abs(localDirection.z);
    const localProbeX =
      localPosition.x + localDirection.x * (PLAYER_COLLIDER_RADIUS + VAULT_SIDE_BUFFER);
    const localProbeZ =
      localPosition.z + localDirection.z * (PLAYER_COLLIDER_RADIUS + VAULT_SIDE_BUFFER);
    const localMinX = -box.halfExtents.x;
    const localMaxX = box.halfExtents.x;
    const localMinZ = -box.halfExtents.z;
    const localMaxZ = box.halfExtents.z;
    // A probe that merely overlaps a box is not enough to vault it. Require the
    // capsule to be approaching one of the box's near faces; this keeps nearby
    // platforms from stealing the refined transition while the player is
    // falling or moving past them.
    const edgeGap = movingAlongX
      ? localDirection.x >= 0
        ? localMinX - localPosition.x
        : localPosition.x - localMaxX
      : localDirection.z >= 0
        ? localMinZ - localPosition.z
        : localPosition.z - localMaxZ;
    if (edgeGap < -VAULT_EDGE_TOLERANCE || edgeGap > VAULT_APPROACH_DISTANCE) return;

    // Ensure the probe is inside the “safe” horizontal region of the box.
    if (
      localProbeX < localMinX - VAULT_SIDE_BUFFER ||
      localProbeX > localMaxX + VAULT_SIDE_BUFFER
    ) {
      return;
    }
    if (
      localProbeZ < localMinZ - VAULT_SIDE_BUFFER ||
      localProbeZ > localMaxZ + VAULT_SIDE_BUFFER
    ) {
      return;
    }

    // How far is the probe from the centre of the box?  Pick the nearest edge
    // candidate, then use centre distance only as a deterministic tie-break.
    const gap = Math.hypot(localProbeX, localProbeZ);
    if (
      best.value === null ||
      edgeGap < best.value.edgeGap ||
      (edgeGap === best.value.edgeGap && gap < best.value.gap)
    ) {
      const insetX = Math.min(VAULT_SIDE_BUFFER, box.halfExtents.x * 0.5);
      const insetZ = Math.min(VAULT_SIDE_BUFFER, box.halfExtents.z * 0.5);
      const localTarget = toBoxLocalPoint({ x: targetX, y: fromPosition.y, z: targetZ }, box);
      const targetHorizontal = fromBoxLocalPoint(
        THREE.MathUtils.clamp(localTarget.x, localMinX + insetX, localMaxX - insetX),
        THREE.MathUtils.clamp(localTarget.z, localMinZ + insetZ, localMaxZ - insetZ),
        box,
      );
      best.value = {
        target: {
          x: targetHorizontal.x,
          y: topY + PLAYER_COLLIDER_CENTER_HEIGHT,
          z: targetHorizontal.z,
        },
        box,
        topY,
        gap,
        edgeGap,
      };
    }
  };

  // Scan all static boxes – you can also pass in a filtered subset if you
  // only want “vault‑able” objects.
  for (const box of staticPhysicsBoxes) {
    tryBox(box);
  }

  const resolved = best.value;
  return resolved === null
    ? null
    : {
        target: resolved.target,
        box: resolved.box,
        obstacleId: resolvePhysicsBoxObstacleId(resolved.box),
        topY: resolved.topY,
      };
};

export const resolveVaultTarget = (
  fromPosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  feetY: number,
  staticPhysicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null =>
  resolveVaultTargetDetails(fromPosition, desiredHorizontalDelta, feetY, staticPhysicsBoxes)
    ?.target ?? null;

// ----------------------------------------------------------------------
//  WALL HANG HELPERS
//
//  Wall hanging is deliberately separate from ledge grabbing. A candidate
//  must be a tall, vertically overlapping box in front of the player; an
//  arbitrary collision is never enough to enter this state.
// ----------------------------------------------------------------------

/**
 * Minimum wall-top height measured from the player's feet. Keep wall hangs just
 * above the refined ledge range so a low platform keeps its existing ledge/vault
 * behaviour while a higher parkour face can be caught during a jump.
 */
export const WALL_HANG_MIN_TOP = LEDGE_GRAB_MAX_HEIGHT;
/** Maximum horizontal reach measured from the capsule's front surface. */
export const WALL_HANG_REACH = 0.5;
/** Maximum height above the capsule top that the player's hands can catch. */
export const WALL_HANG_MAX_TOP_GAP = 0.6;
/** Horizontal side buffer for wall-hang detection. */
export const WALL_HANG_SIDE_BUFFER = 0.06;
/** Speed at which the character climbs up while hanging (metres per second). */
export const WALL_CLIMB_SPEED = 2.5;

const WALL_HANG_SEPARATION = 0.01;
const WALL_HANG_EPSILON = 0.0001;
export const WALL_HANG_CONTACT_PROBE_DISTANCE = 0.02;
export const WALL_HANG_ATTACHMENT_TOLERANCE = 0.025;
const WALL_CLIMB_CLEARANCE = 0.04;
const WALL_CLIMB_TOP_INSET = PLAYER_COLLIDER_RADIUS + WALL_HANG_SEPARATION;
// Keep the attachment visible for a short beat before a held approach input
// starts the climb. Otherwise a run into the wall enters and leaves the hang
// state within one animation frame and feels like an ordinary collision.
export const WALL_HANG_SETTLE_DURATION = 0.14;

export type WallHangResolution = Readonly<{
  readonly target: PhysicsVector;
  /** Unit normal pointing away from the approached wall face. */
  readonly wallNormal: PhysicsVector;
  /** Point on the approached face at the player's current vertical anchor. */
  readonly wallFacePoint: PhysicsVector;
  readonly wallTopY: number;
  readonly box: PhysicsBox;
  /** Gap between the capsule front and the wall face in metres. */
  readonly gap: number;
}>;

const normalizeHorizontal = (vector: PhysicsVector): PhysicsVector | null => {
  const length = Math.hypot(vector.x, vector.z);
  if (length <= WALL_HANG_EPSILON) {
    return null;
  }
  return { x: vector.x / length, y: 0, z: vector.z / length };
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Rotate a world-space horizontal vector into a PhysicsBox's local frame. */
const rotateHorizontalToBoxLocal = (
  x: number,
  z: number,
  rotationY: number,
): { readonly x: number; readonly z: number } => {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return {
    x: cosine * x + sine * z,
    z: -sine * x + cosine * z,
  };
};

/** Rotate a PhysicsBox-local horizontal vector back into world space. */
const rotateHorizontalFromBoxLocal = (
  x: number,
  z: number,
  rotationY: number,
): { readonly x: number; readonly z: number } => {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return {
    x: cosine * x - sine * z,
    z: sine * x + cosine * z,
  };
};

const toBoxLocalPoint = (
  point: PhysicsVector,
  box: PhysicsBox,
): { readonly x: number; readonly z: number } => {
  const local = rotateHorizontalToBoxLocal(
    point.x - box.center.x,
    point.z - box.center.z,
    box.rotationY ?? 0,
  );
  return { x: local.x, z: local.z };
};

const fromBoxLocalPoint = (
  localX: number,
  localZ: number,
  box: PhysicsBox,
): { readonly x: number; readonly z: number } => {
  const world = rotateHorizontalFromBoxLocal(localX, localZ, box.rotationY ?? 0);
  return { x: world.x + box.center.x, z: world.z + box.center.z };
};

/**
 * Resolve a wall hang and retain the geometry needed by a climb transition.
 *
 * `fromPosition` is the capsule centre (its feet are at `y -
 * PLAYER_COLLIDER_CENTER_HEIGHT`). Reach is measured from the capsule's front
 * surface, so a target is always offset from the wall by the capsule radius
 * and a small separation epsilon.
 */
export const resolveWallHangTargetDetails = (
  fromPosition: PhysicsVector,
  forwardVector: PhysicsVector,
  staticPhysicsBoxes: readonly PhysicsBox[],
): WallHangResolution | null => {
  const forward = normalizeHorizontal(forwardVector);
  if (forward === null) {
    return null;
  }

  const capsuleBottomY = fromPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT;
  const capsuleTopY = fromPosition.y + PLAYER_COLLIDER_CENTER_HEIGHT;
  const minTopY = fromPosition.y + (WALL_HANG_MIN_TOP - PLAYER_COLLIDER_CENTER_HEIGHT);
  const maxTopY = capsuleTopY + WALL_HANG_MAX_TOP_GAP;
  let best: WallHangResolution | null = null;

  for (const box of staticPhysicsBoxes) {
    // Streamed backdrop buildings and bridges can be rotated. Resolve the
    // approach in the collider's local frame so the wall face, lateral reach,
    // and eventual top landing all agree with Rapier's oriented cuboid.
    const rotationY = box.rotationY ?? 0;
    const localPosition = toBoxLocalPoint(fromPosition, box);
    const localForward = rotateHorizontalToBoxLocal(forward.x, forward.z, rotationY);
    const facingX = Math.abs(localForward.x) >= Math.abs(localForward.z);
    const bottomY = box.center.y - box.halfExtents.y;
    const topY = box.center.y + box.halfExtents.y;

    // A wall must be taller than an ordinary ledge, but still within the
    // player's hand reach. This keeps a jump into a five-metre wall an
    // ordinary collision instead of granting an implausible vertical climb.
    if (topY < minTopY || topY > maxTopY) {
      continue;
    }
    // The side of a thin platform can sit just above the capsule head while
    // the top is still within hand reach. Treat that as usable contact so a
    // jump that nearly clears the platform can catch its upper face instead
    // of passing through the edge. A floating box farther than the same hand
    // reach remains invalid.
    if (topY < capsuleBottomY || bottomY > capsuleTopY + WALL_HANG_MAX_TOP_GAP) {
      continue;
    }

    const localMinX = -box.halfExtents.x;
    const localMaxX = box.halfExtents.x;
    const localMinZ = -box.halfExtents.z;
    const localMaxZ = box.halfExtents.z;
    const face = facingX
      ? localForward.x > 0
        ? localMinX
        : localMaxX
      : localForward.z > 0
        ? localMinZ
        : localMaxZ;
    const centreAxis = facingX ? localPosition.x : localPosition.z;
    const signedGap = facingX
      ? localForward.x > 0
        ? face - centreAxis - PLAYER_COLLIDER_RADIUS
        : centreAxis - face - PLAYER_COLLIDER_RADIUS
      : localForward.z > 0
        ? face - centreAxis - PLAYER_COLLIDER_RADIUS
        : centreAxis - face - PLAYER_COLLIDER_RADIUS;

    // A capsule can cross a very thin upper platform between physics steps:
    // the side contact starts just below the hand window, then the next step
    // is already inside the box. Accept that swept-contact case only while
    // the centre is still inside the box slab. A point beyond the far side is
    // still rejected, which keeps walls behind the player from being grabbed.
    const centreAxisMin = facingX ? localMinX : localMinZ;
    const centreAxisMax = facingX ? localMaxX : localMaxZ;
    const centreInsideWallSlab =
      centreAxis >= centreAxisMin - WALL_HANG_SEPARATION &&
      centreAxis <= centreAxisMax + WALL_HANG_SEPARATION;
    if (
      (signedGap < -WALL_HANG_SEPARATION && !centreInsideWallSlab) ||
      signedGap > WALL_HANG_REACH
    ) {
      continue;
    }

    const orthogonalPosition = facingX ? localPosition.z : localPosition.x;
    const orthogonalMin = facingX ? localMinZ : localMinX;
    const orthogonalMax = facingX ? localMaxZ : localMaxX;
    const orthogonalReach = PLAYER_COLLIDER_RADIUS + WALL_HANG_SIDE_BUFFER;
    if (
      orthogonalPosition < orthogonalMin - orthogonalReach ||
      orthogonalPosition > orthogonalMax + orthogonalReach
    ) {
      continue;
    }

    const safeOrthogonalMin = orthogonalMin + PLAYER_COLLIDER_RADIUS + WALL_HANG_SEPARATION;
    const safeOrthogonalMax = orthogonalMax - PLAYER_COLLIDER_RADIUS - WALL_HANG_SEPARATION;
    const targetOrthogonal =
      safeOrthogonalMin <= safeOrthogonalMax
        ? clampNumber(orthogonalPosition, safeOrthogonalMin, safeOrthogonalMax)
        : (orthogonalMin + orthogonalMax) / 2;
    const wallNormalLocal = facingX
      ? { x: localForward.x > 0 ? -1 : 1, z: 0 }
      : { x: 0, z: localForward.z > 0 ? -1 : 1 };
    const targetAxis =
      face +
      (facingX ? wallNormalLocal.x : wallNormalLocal.z) *
        (PLAYER_COLLIDER_RADIUS + WALL_HANG_SEPARATION);
    const targetLocal = facingX
      ? { x: targetAxis, z: targetOrthogonal }
      : { x: targetOrthogonal, z: targetAxis };
    const wallFaceLocal = facingX
      ? { x: face, z: targetOrthogonal }
      : { x: targetOrthogonal, z: face };
    const targetHorizontal = fromBoxLocalPoint(targetLocal.x, targetLocal.z, box);
    const wallFaceHorizontal = fromBoxLocalPoint(wallFaceLocal.x, wallFaceLocal.z, box);
    const wallNormalWorld = rotateHorizontalFromBoxLocal(
      wallNormalLocal.x,
      wallNormalLocal.z,
      rotationY,
    );
    const wallNormal = { x: wallNormalWorld.x, y: 0, z: wallNormalWorld.z };
    const target = { x: targetHorizontal.x, y: fromPosition.y, z: targetHorizontal.z };
    const wallFacePoint = {
      x: wallFaceHorizontal.x,
      y: fromPosition.y,
      z: wallFaceHorizontal.z,
    };
    const candidate: WallHangResolution = {
      target,
      wallNormal,
      wallFacePoint,
      wallTopY: topY,
      box,
      // Keep shallow swept penetration behind a valid near-face contact from
      // tying every inside-slab candidate at zero; the closest face still
      // wins when several boxes overlap the same frame.
      gap: Math.abs(signedGap),
    };
    if (best === null || candidate.gap < best.gap) {
      best = candidate;
    }
  }

  return best;
};

/**
 * Resolve only the capsule-centre target for callers that do not need climb
 * metadata.
 */
export const resolveWallHangTarget = (
  fromPosition: PhysicsVector,
  forwardVector: PhysicsVector,
  staticPhysicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null =>
  resolveWallHangTargetDetails(fromPosition, forwardVector, staticPhysicsBoxes)?.target ?? null;

/**
 * Resolve the top landing used by a wall climb.
 *
 * Keep the tangent coordinate from the hang instead of replacing it with the
 * collider centre. That is important for thin/long walls: the player should
 * climb over the point they caught, not skate sideways to an arbitrary centre.
 * The same local-frame math also keeps rotated generated backdrop boxes
 * aligned with their Rapier colliders.
 */
export const resolveWallClimbTarget = (
  wall: Pick<WallHangResolution, "wallNormal" | "wallFacePoint" | "wallTopY" | "box">,
): PhysicsVector => {
  const rotationY = wall.box.rotationY ?? 0;
  const localFacePoint = toBoxLocalPoint(wall.wallFacePoint, wall.box);
  const localNormal = rotateHorizontalToBoxLocal(wall.wallNormal.x, wall.wallNormal.z, rotationY);
  const movingAlongX = Math.abs(localNormal.x) >= Math.abs(localNormal.z);
  const normalSign = movingAlongX ? Math.sign(localNormal.x) : Math.sign(localNormal.z);
  const inwardSign = normalSign === 0 ? 0 : -normalSign;
  const localMinNormal = movingAlongX ? -wall.box.halfExtents.x : -wall.box.halfExtents.z;
  const localMaxNormal = movingAlongX ? wall.box.halfExtents.x : wall.box.halfExtents.z;
  const localMinTangent = movingAlongX ? -wall.box.halfExtents.z : -wall.box.halfExtents.x;
  const localMaxTangent = movingAlongX ? wall.box.halfExtents.z : wall.box.halfExtents.x;
  const localFaceAxis = movingAlongX ? localFacePoint.x : localFacePoint.z;
  const localFaceTangent = movingAlongX ? localFacePoint.z : localFacePoint.x;
  const safeNormalMin = localMinNormal + WALL_CLIMB_TOP_INSET;
  const safeNormalMax = localMaxNormal - WALL_CLIMB_TOP_INSET;
  const safeTangentMin = localMinTangent + WALL_CLIMB_TOP_INSET;
  const safeTangentMax = localMaxTangent - WALL_CLIMB_TOP_INSET;
  const targetNormal =
    safeNormalMin <= safeNormalMax
      ? clampNumber(localFaceAxis + inwardSign * WALL_CLIMB_TOP_INSET, safeNormalMin, safeNormalMax)
      : (localMinNormal + localMaxNormal) / 2;
  const targetTangent =
    safeTangentMin <= safeTangentMax
      ? clampNumber(localFaceTangent, safeTangentMin, safeTangentMax)
      : (localMinTangent + localMaxTangent) / 2;
  const targetLocal = movingAlongX
    ? { x: targetNormal, z: targetTangent }
    : { x: targetTangent, z: targetNormal };
  const targetHorizontal = fromBoxLocalPoint(targetLocal.x, targetLocal.z, wall.box);
  return {
    x: targetHorizontal.x,
    y: wall.wallTopY + PLAYER_COLLIDER_CENTER_HEIGHT + WALL_CLIMB_CLEARANCE,
    z: targetHorizontal.z,
  };
};

export const resolveLedgeGrabTargetDetails = (
  fromPosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  feetY: number,
  staticPhysicsBoxes: readonly PhysicsBox[],
  dynamicPhysicsBoxes: readonly PhysicsBox[],
): TraversalTargetResolution | null => {
  const horizontalDistance = Math.hypot(desiredHorizontalDelta.x, desiredHorizontalDelta.z);
  if (horizontalDistance < 0.015) {
    return null;
  }
  const directionX = desiredHorizontalDelta.x / horizontalDistance;
  const directionZ = desiredHorizontalDelta.z / horizontalDistance;
  const minTopY = feetY + LEDGE_GRAB_MIN_HEIGHT;
  const maxTopY = feetY + LEDGE_GRAB_MAX_HEIGHT;
  const best: {
    value: {
      target: PhysicsVector;
      box: PhysicsBox;
      topY: number;
      gap: number;
    } | null;
  } = {
    value: null,
  };
  const tryBox = (box: PhysicsBox): void => {
    if (box.halfExtents.y < 0.06) {
      return;
    }
    const topY = box.center.y + box.halfExtents.y;
    if (topY < minTopY || topY > maxTopY) {
      return;
    }
    const rotationY = box.rotationY ?? 0;
    const localPosition = toBoxLocalPoint(fromPosition, box);
    const localDirection = rotateHorizontalToBoxLocal(directionX, directionZ, rotationY);
    const movingAlongX = Math.abs(localDirection.x) >= Math.abs(localDirection.z);
    const localProbeX =
      localPosition.x + localDirection.x * (PLAYER_COLLIDER_RADIUS + VAULT_SIDE_BUFFER);
    const localProbeZ =
      localPosition.z + localDirection.z * (PLAYER_COLLIDER_RADIUS + VAULT_SIDE_BUFFER);
    const localMinX = -box.halfExtents.x;
    const localMaxX = box.halfExtents.x;
    const localMinZ = -box.halfExtents.z;
    const localMaxZ = box.halfExtents.z;
    if (
      localProbeX < localMinX - LEDGE_GRAB_SIDE_DISTANCE ||
      localProbeX > localMaxX + LEDGE_GRAB_SIDE_DISTANCE ||
      localProbeZ < localMinZ - LEDGE_GRAB_SIDE_DISTANCE ||
      localProbeZ > localMaxZ + LEDGE_GRAB_SIDE_DISTANCE
    ) {
      return;
    }
    const edgeGap = movingAlongX
      ? localDirection.x >= 0
        ? localMinX - localPosition.x
        : localPosition.x - localMaxX
      : localDirection.z >= 0
        ? localMinZ - localPosition.z
        : localPosition.z - localMaxZ;
    if (edgeGap < LEDGE_GRAB_PLATFORM_TOLERANCE || edgeGap > LEDGE_GRAB_APPROACH_DISTANCE) {
      return;
    }
    const sideDelta = movingAlongX ? Math.abs(localProbeZ) : Math.abs(localProbeX);
    const maxSideDelta =
      (movingAlongX ? box.halfExtents.z : box.halfExtents.x) + LEDGE_GRAB_SIDE_DISTANCE;
    if (sideDelta > maxSideDelta) {
      return;
    }
    const halfInsetX = Math.min(LEDGE_GRAB_PLATFORM_INSET, box.halfExtents.x * 0.85);
    const halfInsetZ = Math.min(LEDGE_GRAB_PLATFORM_INSET, box.halfExtents.z * 0.85);
    const minTargetX = localMinX + halfInsetX;
    const maxTargetX = localMaxX - halfInsetX;
    const minTargetZ = localMinZ + halfInsetZ;
    const maxTargetZ = localMaxZ - halfInsetZ;
    const desiredTarget = toBoxLocalPoint(
      {
        x: fromPosition.x + desiredHorizontalDelta.x + directionX * LEDGE_CLIMB_FORWARD_OFFSET,
        y: fromPosition.y,
        z: fromPosition.z + desiredHorizontalDelta.z + directionZ * LEDGE_CLIMB_FORWARD_OFFSET,
      },
      box,
    );
    const targetHorizontal = fromBoxLocalPoint(
      minTargetX > maxTargetX ? 0 : THREE.MathUtils.clamp(desiredTarget.x, minTargetX, maxTargetX),
      minTargetZ > maxTargetZ ? 0 : THREE.MathUtils.clamp(desiredTarget.z, minTargetZ, maxTargetZ),
      box,
    );
    const candidate: PhysicsVector = {
      x: targetHorizontal.x,
      y: topY + PLAYER_COLLIDER_CENTER_HEIGHT,
      z: targetHorizontal.z,
    };
    if (best.value === null || edgeGap < best.value.gap) {
      best.value = { target: candidate, box, topY, gap: edgeGap };
    }
  };
  for (const box of staticPhysicsBoxes) {
    tryBox(box);
  }
  for (const box of dynamicPhysicsBoxes) {
    tryBox(box);
  }
  const resolved = best.value;
  if (resolved === null) {
    return null;
  }
  return {
    target: resolved.target,
    box: resolved.box,
    obstacleId: resolvePhysicsBoxObstacleId(resolved.box),
    topY: resolved.topY,
  };
};

export const resolveLedgeGrabTarget = (
  fromPosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  feetY: number,
  staticPhysicsBoxes: readonly PhysicsBox[],
  dynamicPhysicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null =>
  resolveLedgeGrabTargetDetails(
    fromPosition,
    desiredHorizontalDelta,
    feetY,
    staticPhysicsBoxes,
    dynamicPhysicsBoxes,
  )?.target ?? null;

/** Validate full capsule clearance at a proposed traversal landing. */
export const isPlayerCapsulePositionClear = (
  position: PhysicsVector,
  physicsBoxes: readonly PhysicsBox[],
): boolean => {
  const capsuleBottomY = position.y - PLAYER_COLLIDER_CENTER_HEIGHT;
  const capsuleTopY = position.y + PLAYER_COLLIDER_CENTER_HEIGHT;
  for (const box of physicsBoxes) {
    const boxBottomY = box.center.y - box.halfExtents.y;
    const boxTopY = box.center.y + box.halfExtents.y;
    if (capsuleBottomY >= boxTopY - WORLD_EPSILON || capsuleTopY <= boxBottomY + WORLD_EPSILON) {
      continue;
    }
    const local = toBoxLocalPoint(position, box);
    const closestX = THREE.MathUtils.clamp(local.x, -box.halfExtents.x, box.halfExtents.x);
    const closestZ = THREE.MathUtils.clamp(local.z, -box.halfExtents.z, box.halfExtents.z);
    if (
      Math.hypot(local.x - closestX, local.z - closestZ) <
      PLAYER_COLLIDER_RADIUS - WORLD_EPSILON
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Select a validated capsule position for the explicit geometry-recovery action.
 * The last safe position is preferred; the caller can provide a spawn fallback
 * when streamed geometry invalidated that checkpoint.
 */
export const resolvePlayerRecoveryPosition = (
  lastSafePosition: PhysicsVector | null,
  fallbackPosition: PhysicsVector,
  physicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null => {
  for (const candidate of [lastSafePosition, fallbackPosition]) {
    if (
      candidate !== null &&
      [candidate.x, candidate.y, candidate.z].every(Number.isFinite) &&
      isPlayerCapsulePositionClear(candidate, physicsBoxes)
    ) {
      return { x: candidate.x, y: candidate.y, z: candidate.z };
    }
  }
  return null;
};

/**
 * Resolve render-only vertical clearance from the post-physics capsule pose.
 * The lower plane is the authoritative foot/support height. A yaw-rotated box
 * contributes an upper bound only when its horizontal footprint overlaps the
 * capsule and its underside is above the physical camera base.
 */
export const resolveCameraVerticalOffsetBounds = (
  capsulePosition: PhysicsVector,
  baseCameraY: number,
  physicsBoxes: readonly PhysicsBox[],
): CameraVerticalOffsetBounds => {
  const safeBaseCameraY = Number.isFinite(baseCameraY) ? baseCameraY : capsulePosition.y;
  const supportY = capsulePosition.y - PLAYER_COLLIDER_CENTER_HEIGHT;
  let ceilingY = Number.POSITIVE_INFINITY;
  for (const box of physicsBoxes) {
    const boxBottomY = box.center.y - box.halfExtents.y;
    if (boxBottomY <= safeBaseCameraY + WORLD_EPSILON || boxBottomY >= ceilingY) {
      continue;
    }
    const local = toBoxLocalPoint(capsulePosition, box);
    const closestX = THREE.MathUtils.clamp(local.x, -box.halfExtents.x, box.halfExtents.x);
    const closestZ = THREE.MathUtils.clamp(local.z, -box.halfExtents.z, box.halfExtents.z);
    if (
      Math.hypot(local.x - closestX, local.z - closestZ) <=
      PLAYER_COLLIDER_RADIUS + WORLD_EPSILON
    ) {
      ceilingY = boxBottomY;
    }
  }
  return {
    min: supportY - safeBaseCameraY,
    max: Number.isFinite(ceilingY)
      ? Math.max(supportY, ceilingY - WORLD_EPSILON) - safeBaseCameraY
      : Number.POSITIVE_INFINITY,
  };
};

/**
 * Builds deliberately coarse AABB colliders from selected render roots. The
 * renderer remains the source of geometry, while the physics world receives
 * one inexpensive box per meaningful mesh instead of every triangle. Roots
 * such as the table, tiles, and streamed chunks are excluded here so
 * they can use their own explicit or dynamic collider descriptions.
 */
export const collectScenePhysicsBoxes = (
  scene: THREE.Object3D,
  collidableRootNames: ReadonlySet<string> = PHYSICS_COLLISION_ROOT_NAMES,
): readonly PhysicsBox[] => {
  scene.updateMatrixWorld(true);
  const boxes: PhysicsBox[] = [];
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (const root of scene.children) {
    if (!collidableRootNames.has(root.name)) {
      continue;
    }
    root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        !isObjectVisibleInScene(object) ||
        isPhysicsIgnored(object)
      ) {
        return;
      }
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) {
        return;
      }
      bounds.getSize(size);
      bounds.getCenter(center);
      if (
        ![size.x, size.y, size.z, center.x, center.y, center.z].every((value) =>
          Number.isFinite(value),
        ) ||
        (size.x < 0.05 && size.y < 0.05 && size.z < 0.05)
      ) {
        return;
      }
      boxes.push({
        center: { x: center.x, y: center.y, z: center.z },
        halfExtents: {
          x: Math.max(size.x / 2, PHYSICS_MINIMUM_HALF_EXTENT),
          y: Math.max(size.y / 2, PHYSICS_MINIMUM_HALF_EXTENT),
          z: Math.max(size.z / 2, PHYSICS_MINIMUM_HALF_EXTENT),
        },
      });
    });
  }
  return boxes;
};

const createStaticPhysicsBoxes = (
  scene: THREE.Scene,
  worldBounds: WorldBounds = WORLD_BOUNDS,
  extraBoxes: readonly PhysicsBox[] = [],
): readonly PhysicsBox[] => {
  const focusRamp = scene.getObjectByName("FocusCalibrationRamp") ?? null;
  const wallRoot = scene.getObjectByName("WallRoot") ?? null;
  const climbingGymRoot = scene.getObjectByName("ClimbingGym") ?? null;
  const wallPhysicsBoxes = createWallPhysicsBoxes(wallRoot);
  const climbingGymPhysicsBoxes = climbingGymRoot === null ? [] : createClimbingGymPhysicsBoxes();
  const focusRampPhysicsBoxes: readonly PhysicsBox[] =
    focusRamp !== null
      ? [
          {
            center: {
              x: FOCUS_CALIBRATION_START_X + FOCUS_CALIBRATION_RAMP_RUN / 2,
              y: FOCUS_CALIBRATION_DECK_HEIGHT / 2,
              z: FOCUS_CALIBRATION_RAMP_TOP_Z,
            },
            halfExtents: {
              x: FOCUS_CALIBRATION_RAMP_RUN / 2,
              y: 0.09,
              z: FOCUS_CALIBRATION_RAMP_WIDTH / 2,
            },
            rotationZ: -Math.atan2(FOCUS_CALIBRATION_DECK_HEIGHT, FOCUS_CALIBRATION_RAMP_RUN),
          },
        ]
      : [];
  const boxes: PhysicsBox[] = [
    {
      center: {
        x: (worldBounds.minX + worldBounds.maxX) / 2,
        y: -0.1,
        z: (worldBounds.minZ + worldBounds.maxZ) / 2,
      },
      halfExtents: {
        x: (worldBounds.maxX - worldBounds.minX) / 2,
        y: 0.1,
        z: (worldBounds.maxZ - worldBounds.minZ) / 2,
      },
    },
  ];
  const tableRoot = scene.getObjectByName("TableRoot") ?? null;
  if (tableRoot !== null && isObjectVisibleInScene(tableRoot)) {
    boxes.push({
      center: { x: 0, y: 0.39, z: 0 },
      halfExtents: { x: 0.92, y: 0.39, z: 0.92 },
    });
  }
  if (focusRamp !== null && isObjectVisibleInScene(focusRamp)) {
    boxes.push(...focusRampPhysicsBoxes);
  }
  if (wallRoot !== null && isObjectVisibleInScene(wallRoot)) {
    boxes.push(...wallPhysicsBoxes);
  }
  if (climbingGymRoot !== null && isObjectVisibleInScene(climbingGymRoot)) {
    boxes.push(...climbingGymPhysicsBoxes);
  }
  boxes.push(...collectScenePhysicsBoxes(scene));
  boxes.push(...extraBoxes);
  return boxes;
};

const getTouchSprintCap = (forwardDirection: number): number => {
  const forwardBias = THREE.MathUtils.clamp(forwardDirection, 0, 1);
  const curvedForwardBias = forwardBias * forwardBias;
  return TOUCH_SIDEWAYS_SPRINT_FRACTION + (1 - TOUCH_SIDEWAYS_SPRINT_FRACTION) * curvedForwardBias;
};

const clampUnit = (value: number): number => THREE.MathUtils.clamp(value, 0, 1);

/** Map the scene's normalized luminance estimate to a virtual pupil diameter. */
export const resolveHumanEyePupilDiameter = (luminance: number): number => {
  const safeLuminance = Number.isFinite(luminance) ? luminance : 1;
  const lowLightMix = clampUnit(
    (HUMAN_EYE_BRIGHT_LUMINANCE - safeLuminance) /
      (HUMAN_EYE_BRIGHT_LUMINANCE - HUMAN_EYE_DARK_LUMINANCE),
  );
  const easedLowLightMix = lowLightMix * lowLightMix * (3 - 2 * lowLightMix);
  return THREE.MathUtils.lerp(HUMAN_EYE_BRIGHT_PUPIL_MM, HUMAN_EYE_DARK_PUPIL_MM, easedLowLightMix);
};

/**
 * Keep display exposure and eye adaptation separate. The warehouse is lit by
 * isolated pools against a black background, so its global render estimate is
 * not a useful proxy for the player's dark adaptation.
 */
export const resolveHumanEyeAdaptationLuminance = (
  sceneLuminance: number,
  isWarehouse: boolean,
): number => {
  const safeLuminance = Number.isFinite(sceneLuminance) ? sceneLuminance : 1;
  return isWarehouse ? Math.min(safeLuminance, HUMAN_EYE_DARK_LUMINANCE) : safeLuminance;
};

/** Use different, pupil-aware accommodation timing for near and far gaze changes. */
export const resolveFocusAccommodationDamping = (
  currentDistance: number,
  targetDistance: number,
  pupilDiameterMm = HUMAN_EYE_REFERENCE_PUPIL_MM,
): number => {
  const baseDamping =
    targetDistance < currentDistance
      ? BOKEH_NEAR_ACCOMMODATION_DAMPING
      : BOKEH_FAR_ACCOMMODATION_DAMPING;
  const safePupilDiameter = Number.isFinite(pupilDiameterMm)
    ? THREE.MathUtils.clamp(pupilDiameterMm, HUMAN_EYE_BRIGHT_PUPIL_MM, HUMAN_EYE_DARK_PUPIL_MM)
    : HUMAN_EYE_REFERENCE_PUPIL_MM;
  const dilationMix = clampUnit(
    (safePupilDiameter - HUMAN_EYE_REFERENCE_PUPIL_MM) /
      (HUMAN_EYE_DARK_PUPIL_MM - HUMAN_EYE_REFERENCE_PUPIL_MM),
  );
  const darkDamping = baseDamping * HUMAN_EYE_DARK_ACCOMMODATION_SCALE;
  return THREE.MathUtils.lerp(baseDamping, darkDamping, dilationMix);
};

/** Resolve restrained scene-space bokeh from eye focus and pupil size. */
export const resolveHumanEyeBokeh = (
  focusDistance: number,
  pupilDiameterMm: number,
): VisualBokehParameters => {
  const safeFocusDistance = Number.isFinite(focusDistance) ? Math.max(0.05, focusDistance) : 12;
  const safePupilDiameter = Number.isFinite(pupilDiameterMm)
    ? THREE.MathUtils.clamp(pupilDiameterMm, HUMAN_EYE_BRIGHT_PUPIL_MM, HUMAN_EYE_DARK_PUPIL_MM)
    : HUMAN_EYE_REFERENCE_PUPIL_MM;
  const hyperfocalDistance =
    HUMAN_EYE_REFERENCE_HYPERFOCAL_DISTANCE * (safePupilDiameter / HUMAN_EYE_REFERENCE_PUPIL_MM);
  const pupilScale = safePupilDiameter / HUMAN_EYE_REFERENCE_PUPIL_MM;
  const practicalHyperfocalDistance = BOKEH_PRACTICAL_HYPERFOCAL_DISTANCE * pupilScale;
  const normalizedFocus = clampUnit(safeFocusDistance / practicalHyperfocalDistance);
  // A smoothstep ease-out gives a calm, continuous shoulder at the practical
  // cutoff. Raising the remaining envelope makes the close-focus blur fall
  // quickly enough that 2.5 m is about 25% while 6 m is visually sharp.
  const smoothFocus = normalizedFocus * normalizedFocus * (3 - 2 * normalizedFocus);
  const intensity = Math.pow(1 - smoothFocus, BOKEH_DISTANCE_FALLOFF_POWER);
  return {
    hyperfocalDistance,
    intensity,
    aperture: BOKEH_BASE_APERTURE * pupilScale * intensity,
    maxBlur: BOKEH_BASE_MAX_BLUR * pupilScale * intensity,
  };
};

const QUALITY_PRESETS: Readonly<Record<VisualQualityPreset, Omit<SceneQuality, "preset">>> = {
  high: {
    dprCap: 1.75,
    shadows: "high",
    shadowMapSize: 2048,
    ambientOcclusion: false,
    glassMode: "physical",
    ambientAnimationRate: 1,
  },
  medium: {
    dprCap: 1.35,
    shadows: "medium",
    shadowMapSize: 1024,
    ambientOcclusion: false,
    glassMode: "simple",
    ambientAnimationRate: 0.75,
  },
  low: {
    dprCap: 1,
    shadows: "off",
    shadowMapSize: 0,
    ambientOcclusion: false,
    glassMode: "simple",
    ambientAnimationRate: 0.45,
  },
};

const resolveQuality = (requested: VisualQualityPreset | "auto" | undefined): SceneQuality => {
  let preset = requested === undefined || requested === "auto" ? undefined : requested;
  if (preset === undefined) {
    const deviceMemory = (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    // Adaptive presentation is deliberately conservative when the browser
    // does not expose a trustworthy memory budget.  High DPR, shadows, and
    // Bokeh can multiply the render target on laptops, phones, and software
    // WebGL; users can still opt into the high tier from the debug panel.
    preset = deviceMemory !== undefined && deviceMemory >= 8 && cores >= 8 ? "high" : "medium";
  }
  return { preset, ...QUALITY_PRESETS[preset] };
};

const DEGREES_TO_RADIANS = Math.PI / 180;
const DEVICE_ORIENTATION_ZEE = new THREE.Vector3(0, 0, 1);
const DEVICE_ORIENTATION_QUARTER = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

interface DeviceOrientationEventPermissionConstructor {
  readonly requestPermission?: () => Promise<"granted" | "denied">;
}

const getScreenOrientationAngle = (): number => {
  const screenOrientation = (
    window.screen as unknown as {
      readonly orientation?: { readonly angle?: unknown };
    }
  ).orientation;
  if (typeof screenOrientation?.angle === "number" && Number.isFinite(screenOrientation.angle)) {
    return screenOrientation.angle;
  }
  const legacyOrientation = (window as unknown as { readonly orientation?: unknown }).orientation;
  return typeof legacyOrientation === "number" ? legacyOrientation : 0;
};

const setDeviceOrientationQuaternion = (
  target: THREE.Quaternion,
  euler: THREE.Euler,
  screenQuaternion: THREE.Quaternion,
  event: DeviceOrientationEvent,
): boolean => {
  if (event.alpha === null || event.beta === null || event.gamma === null) {
    return false;
  }
  euler.set(
    event.beta * DEGREES_TO_RADIANS,
    event.alpha * DEGREES_TO_RADIANS,
    -event.gamma * DEGREES_TO_RADIANS,
    "YXZ",
  );
  target.setFromEuler(euler);
  target.multiply(DEVICE_ORIENTATION_QUARTER);
  screenQuaternion.setFromAxisAngle(
    DEVICE_ORIENTATION_ZEE,
    -getScreenOrientationAngle() * DEGREES_TO_RADIANS,
  );
  target.multiply(screenQuaternion);
  return true;
};

const createCanvasTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const clamp01ForNoise = (value: number): number => Math.max(0, Math.min(1, value));

const lerp = (start: number, end: number, t: number): number => start + (end - start) * t;

const hexToRgb = (color: number): readonly [number, number, number] => {
  const normalized = color & 0xffffff;
  return [(normalized >> 16) & 0xff, (normalized >> 8) & 0xff, normalized & 0xff];
};

const hashNoise2d = (x: number, y: number, seed: number): number => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
};

const fadeNoise = (value: number): number => value * value * (3 - 2 * value);

const valueNoise = (x: number, y: number, seed: number): number => {
  const xFloor = Math.floor(x);
  const yFloor = Math.floor(y);
  const xFract = x - xFloor;
  const yFract = y - yFloor;
  const xWrapped = fadeNoise(xFract);
  const yWrapped = fadeNoise(yFract);
  const n00 = hashNoise2d(xFloor, yFloor, seed);
  const n10 = hashNoise2d(xFloor + 1, yFloor, seed);
  const n01 = hashNoise2d(xFloor, yFloor + 1, seed);
  const n11 = hashNoise2d(xFloor + 1, yFloor + 1, seed);
  const xInter = lerp(n00, n10, xWrapped);
  const yInter = lerp(n01, n11, xWrapped);
  return lerp(xInter, yInter, yWrapped);
};

const fbmNoise = (x: number, y: number, seed: number): number => {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let index = 0; index < 4; index += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + index * 13) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return clamp01ForNoise(total / 1.875);
};

const configureSurfaceTexture = (
  texture: THREE.CanvasTexture,
  repeatX: number,
  repeatY: number,
): void => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
};

const createProceduralSurfaceTexture = (
  seed: number,
  baseColor: number,
  secondaryColor: number,
  grainSize: number,
  microLineDepth: number,
): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create canvas for a procedural surface");
  }

  const base = hexToRgb(baseColor);
  const secondary = hexToRgb(secondaryColor);
  const imageData = context.createImageData(canvas.width, canvas.height);
  const data = imageData.data;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixelIndex = (y * canvas.width + x) * 4;
      const coarseNoise = fbmNoise(x / grainSize, y / grainSize, seed);
      const microNoise = fbmNoise(x / 10 + seed * 0.01, y / 10 + seed * 0.02, seed + 100);
      const contrast = fbmNoise(x / 24 + seed * 0.03, y / 24 + seed * 0.04, seed + 300);
      const lineMark =
        (Math.sin((x * 2.2 + y * 3.3 + seed) / 9) + 1) * 0.5 * 0.012 * microLineDepth;
      const channelMix = THREE.MathUtils.clamp(0.5 + contrast * 0.22 + lineMark, 0.18, 0.82);
      const valueLift = clamp01ForNoise(0.91 + coarseNoise * 0.065 + microNoise * 0.025);

      data[pixelIndex] = Math.round(
        clamp01ForNoise(
          ((base[0] / 255) * channelMix + (secondary[0] / 255) * (1 - channelMix)) * valueLift,
        ) * 255,
      );
      data[pixelIndex + 1] = Math.round(
        clamp01ForNoise(
          ((base[1] / 255) * channelMix + (secondary[1] / 255) * (1 - channelMix)) * valueLift,
        ) * 255,
      );
      data[pixelIndex + 2] = Math.round(
        clamp01ForNoise(
          ((base[2] / 255) * channelMix + (secondary[2] / 255) * (1 - channelMix)) * valueLift,
        ) * 255,
      );
      data[pixelIndex + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);

  context.strokeStyle = "rgba(14, 20, 28, 0.075)";
  for (let index = 0; index < 180; index += 1) {
    const randomX = hashNoise2d(index * 2.13, index * 3.89, seed) * canvas.width;
    const randomY = hashNoise2d(index * 1.77, index * 4.11, seed) * canvas.height;
    const length = 6 + hashNoise2d(index * 0.61, index * 0.88, seed) * 18;
    const angle = hashNoise2d(index * 5.13, index * 2.9, seed) * Math.PI * 2;
    context.beginPath();
    context.lineWidth = 0.55;
    context.moveTo(randomX, randomY);
    context.lineTo(randomX + Math.cos(angle) * length, randomY + Math.sin(angle) * length);
    context.stroke();
  }

  return createCanvasTexture(canvas);
};

const createProceduralDetailTexture = (seed: number): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create canvas for a procedural detail texture");
  }

  const imageData = context.createImageData(canvas.width, canvas.height);
  const data = imageData.data;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixelIndex = (y * canvas.width + x) * 4;
      const broad = fbmNoise(x / 34, y / 34, seed);
      const grain = fbmNoise(x / 9, y / 9, seed + 17);
      const value = Math.round(112 + (broad * 0.72 + grain * 0.28) * 34);
      data[pixelIndex] = value;
      data[pixelIndex + 1] = value;
      data[pixelIndex + 2] = value;
      data[pixelIndex + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  const texture = createCanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
};

const createInteriorSurfaceTextures = (): InteriorSurfaceTextures => {
  const floor = createProceduralSurfaceTexture(1, 0xcbd9db, 0xb6c8cb, 180, 0.35);
  const wall = createProceduralSurfaceTexture(2, 0xe4ebea, 0xcbd8d8, 220, 0.18);
  const table = createProceduralSurfaceTexture(3, 0xf1f4ef, 0xdfe8e5, 150, 0.28);
  const wood = createProceduralSurfaceTexture(4, COLORS.paleOak, 0xb29b83, 160, 0.28);
  const fabric = createProceduralSurfaceTexture(5, 0x4a5961, COLORS.charcoal, 110, 0.22);
  const detail = createProceduralDetailTexture(9);
  configureSurfaceTexture(floor, 5, 5);
  configureSurfaceTexture(wall, 4, 4);
  configureSurfaceTexture(table, 5, 5);
  configureSurfaceTexture(wood, 4, 4);
  configureSurfaceTexture(fabric, 6, 6);
  configureSurfaceTexture(detail, 24, 24);
  return { floor, wall, table, wood, fabric, detail };
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
};

const drawTileFace = (tile: TileTypeId): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create a canvas context for a mahjong tile");
  }

  const definition = getTileDefinition(tile);
  const visual = {
    category: definition.category,
    compactCode: definition.compactCode,
    mainLabel: definition.names.zhHant,
    rank: definition.rank,
    usesBirdMotif: tile === "bamboo.1",
  };
  const palette: Readonly<Record<string, string>> = {
    characters: TILE_RED,
    dots: TILE_BLUE,
    bamboo: TILE_GREEN,
    wind: TILE_INK,
    dragon: tile === "dragon.red" ? TILE_RED : tile === "dragon.green" ? TILE_GREEN : TILE_INK,
    flower: TILE_RED,
    season: TILE_BLUE,
  };
  const ink = palette[visual.category] ?? TILE_INK;

  const paper = context.createLinearGradient(0, 0, 256, 384);
  paper.addColorStop(0, "#fffdf6");
  paper.addColorStop(1, TILE_FACE_COLOR);
  context.fillStyle = paper;
  roundedRect(context, 8, 8, 240, 368, 22);
  context.fill();
  context.strokeStyle = "#b4bfba";
  context.lineWidth = 4;
  context.stroke();

  context.fillStyle = TILE_INK;
  context.font = "700 17px ui-monospace, monospace";
  context.fillText(visual.compactCode, 23, 33);
  context.textAlign = "right";
  context.fillText(visual.compactCode, 233, 360);
  context.textAlign = "left";

  if (visual.category === "dots" && visual.rank !== undefined) {
    context.fillStyle = ink;
    for (const [x, y] of PIP_POSITIONS[visual.rank] ?? []) {
      const centerX = 128 + (x - 0.5) * 114;
      const centerY = 192 + (y - 0.5) * 220;
      context.beginPath();
      context.arc(centerX, centerY, 25, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#d9e7dc";
      context.beginPath();
      context.arc(centerX - 5, centerY - 5, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ink;
    }
  } else if (visual.category === "bamboo" && visual.rank !== undefined) {
    context.fillStyle = ink;
    for (const [x, y] of PIP_POSITIONS[visual.rank] ?? []) {
      const centerX = 128 + (x - 0.5) * 114;
      const centerY = 192 + (y - 0.5) * 220;
      context.save();
      context.translate(centerX, centerY);
      context.rotate((x < 0.5 ? -1 : 1) * 0.12);
      roundedRect(context, -12, -38, 24, 76, 8);
      context.fill();
      context.fillStyle = "#d3efd5";
      context.fillRect(-17, -7, 34, 12);
      context.restore();
      context.fillStyle = ink;
    }
  } else if (visual.usesBirdMotif) {
    context.fillStyle = "#5ca279";
    context.beginPath();
    context.ellipse(128, 165, 65, 52, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = TILE_RED;
    context.beginPath();
    context.arc(156, 151, 19, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f1e2a9";
    context.beginPath();
    context.arc(162, 146, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#277655";
    roundedRect(context, 116, 217, 24, 96, 8);
    context.fill();
  } else if (visual.category === "flower" || visual.category === "season") {
    context.strokeStyle = ink;
    context.lineWidth = 18;
    context.beginPath();
    context.arc(128, 190, 58, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = ink;
    context.font = "700 62px 'PingFang TC', 'Noto Serif CJK TC', serif";
    context.textAlign = "center";
    context.fillText(visual.mainLabel, 128, 214);
    context.textAlign = "left";
  } else {
    context.fillStyle = ink;
    context.font = "700 112px 'PingFang TC', 'Noto Serif CJK TC', serif";
    context.textAlign = "center";
    context.fillText(visual.mainLabel, 128, 233);
    context.textAlign = "left";
    context.fillStyle = "#677774";
    context.font = "700 17px ui-sans-serif, sans-serif";
    context.textAlign = "center";
    context.fillText(visual.category.toUpperCase(), 128, 278);
    context.textAlign = "left";
  }

  return createCanvasTexture(canvas);
};

const drawTileBack = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create a canvas context for a mahjong tile back");
  }
  context.fillStyle = TILE_BACK_COLOR;
  context.fillRect(0, 0, 256, 384);
  context.strokeStyle = "#314b50";
  context.lineWidth = 7;
  for (let offset = -384; offset < 256; offset += 42) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + 384, 384);
    context.stroke();
  }
  context.strokeStyle = TILE_RED;
  context.lineWidth = 5;
  roundedRect(context, 18, 18, 220, 348, 18);
  context.stroke();
  context.strokeStyle = "#73dce8";
  context.lineWidth = 3;
  roundedRect(context, 32, 32, 192, 320, 12);
  context.stroke();
  context.fillStyle = "#d6e7e4";
  context.font = "700 19px ui-sans-serif, sans-serif";
  context.textAlign = "center";
  context.fillText("MAHJONG", 128, 204);
  context.textAlign = "left";
  return createCanvasTexture(canvas);
};

const createTextureCache = (detail: THREE.CanvasTexture): TileTextureCache => ({
  face: new Map(),
  back: drawTileBack(),
  detail,
  bodyGeometry: new Map(),
  faceGeometry: new Map(),
  bodyMaterial: new Map(),
  faceMaterial: new Map(),
  backMaterial: new Map(),
});

const getFaceTexture = (cache: TileTextureCache, tile: TileTypeId): THREE.CanvasTexture => {
  const existing = cache.face.get(tile);
  if (existing !== undefined) {
    return existing;
  }
  const texture = drawTileFace(tile);
  cache.face.set(tile, texture);
  return texture;
};

const tileResourceKey = (width: number, height: number, depth: number): string =>
  `${width.toFixed(4)}:${height.toFixed(4)}:${depth.toFixed(4)}`;

const getTileBodyGeometry = (
  cache: TileTextureCache,
  width: number,
  height: number,
  depth: number,
): RoundedBoxGeometry => {
  const key = tileResourceKey(width, height, depth);
  const existing = cache.bodyGeometry.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const geometry = new RoundedBoxGeometry(width, height, depth, 3, Math.min(0.05, depth / 4));
  cache.bodyGeometry.set(key, geometry);
  return geometry;
};

const getTileFaceGeometry = (
  cache: TileTextureCache,
  width: number,
  height: number,
): THREE.PlaneGeometry => {
  const key = tileResourceKey(width, height, 0);
  const existing = cache.faceGeometry.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const geometry = new THREE.PlaneGeometry(width * 0.86, height * 0.9);
  cache.faceGeometry.set(key, geometry);
  return geometry;
};

const getTileBodyMaterial = (
  cache: TileTextureCache,
  width: number,
  height: number,
  depth: number,
): THREE.MeshStandardMaterial => {
  const key = tileResourceKey(width, height, depth);
  const existing = cache.bodyMaterial.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.tileIvory,
    roughness: 0.44,
    metalness: 0.03,
    roughnessMap: cache.detail,
    bumpMap: cache.detail,
    bumpScale: 0.004,
  });
  cache.bodyMaterial.set(key, material);
  return material;
};

const getTileBackMaterial = (
  cache: TileTextureCache,
  width: number,
  height: number,
  depth: number,
): THREE.MeshStandardMaterial => {
  const key = tileResourceKey(width, height, depth);
  const existing = cache.backMaterial.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const material = new THREE.MeshStandardMaterial({
    map: cache.back,
    roughness: 0.68,
    metalness: 0,
    roughnessMap: cache.detail,
    bumpMap: cache.detail,
    bumpScale: 0.003,
  });
  cache.backMaterial.set(key, material);
  return material;
};

const getTileFaceMaterial = (
  cache: TileTextureCache,
  tile: TileTypeId,
  width: number,
  height: number,
  depth: number,
): THREE.MeshStandardMaterial => {
  const key = `${tileResourceKey(width, height, depth)}:${tile}`;
  const existing = cache.faceMaterial.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const material = new THREE.MeshStandardMaterial({
    map: getFaceTexture(cache, tile),
    roughness: 0.68,
    metalness: 0,
    roughnessMap: cache.detail,
    bumpMap: cache.detail,
    bumpScale: 0.003,
  });
  cache.faceMaterial.set(key, material);
  return material;
};

const createTile = (cache: TileTextureCache, options: TileOptions): THREE.Group => {
  const width = options.width ?? TILE_WIDTH;
  const height = options.height ?? TILE_HEIGHT;
  const depth = options.depth ?? TILE_DEPTH;
  const group = new THREE.Group();
  group.userData = { tile: options.tile, faceUp: options.faceUp, dofFocusTarget: true };

  const body = new THREE.Mesh(
    getTileBodyGeometry(cache, width, height, depth),
    getTileBodyMaterial(cache, width, height, depth),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const faceMaterial =
    options.faceUp && options.tile !== undefined
      ? getTileFaceMaterial(cache, options.tile, width, height, depth)
      : getTileBackMaterial(cache, width, height, depth);
  const backMaterial =
    options.faceUp && options.bothSides === true
      ? faceMaterial
      : getTileBackMaterial(cache, width, height, depth);
  const faceGeometry = getTileFaceGeometry(cache, width, height);
  const front = new THREE.Mesh(faceGeometry, faceMaterial);
  front.position.z = depth / 2 + 0.004;
  front.castShadow = true;
  group.add(front);
  const back = new THREE.Mesh(faceGeometry, backMaterial);
  back.position.z = -depth / 2 - 0.004;
  back.rotation.y = Math.PI;
  group.add(back);
  return group;
};

interface BackTilePlacement {
  readonly position: THREE.Vector3;
  readonly rotation: number;
}

const createBackTileInstances = (
  cache: TileTextureCache,
  placements: readonly BackTilePlacement[],
  width: number,
  height: number,
  depth: number,
): THREE.Group => {
  const group = new THREE.Group();
  group.name = "ConcealedTileInstances";
  group.userData.dofFocusTarget = true;
  if (placements.length === 0) {
    return group;
  }
  const body = new THREE.InstancedMesh(
    getTileBodyGeometry(cache, width, height, depth),
    getTileBodyMaterial(cache, width, height, depth),
    placements.length,
  );
  body.name = "ConcealedTileBodies";
  body.castShadow = true;
  body.receiveShadow = true;
  const back = new THREE.InstancedMesh(
    getTileFaceGeometry(cache, width, height),
    getTileBackMaterial(cache, width, height, depth),
    placements.length,
  );
  back.name = "ConcealedTileBacks";
  back.castShadow = true;
  const axis = new THREE.Vector3(0, 1, 0);
  const localBackOffset = new THREE.Vector3(0, 0, -depth / 2 - 0.004);
  const matrix = new THREE.Matrix4();
  const backMatrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const backRotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const backPosition = new THREE.Vector3();
  placements.forEach((placement, index) => {
    rotation.setFromAxisAngle(axis, placement.rotation);
    matrix.compose(placement.position, rotation, scale);
    body.setMatrixAt(index, matrix);
    backPosition.copy(localBackOffset).applyQuaternion(rotation).add(placement.position);
    backRotation.copy(rotation).multiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI));
    backMatrix.compose(backPosition, backRotation, scale);
    back.setMatrixAt(index, backMatrix);
  });
  body.instanceMatrix.needsUpdate = true;
  back.instanceMatrix.needsUpdate = true;
  body.computeBoundingSphere();
  back.computeBoundingSphere();
  group.add(body, back);
  return group;
};

const createMaterial = (
  color: number,
  roughness: number,
  metalness = 0,
  map?: THREE.CanvasTexture | null,
  detailMap?: THREE.CanvasTexture | null,
): THREE.MeshStandardMaterial => {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: THREE.MathUtils.clamp(roughness * 0.9, 0.04, 0.96),
    metalness,
    envMapIntensity: metalness > 0.5 ? 1.28 : 0.78,
    dithering: true,
    ...(map === undefined ? {} : { map }),
    ...(detailMap === undefined || detailMap === null
      ? {}
      : {
          roughnessMap: detailMap,
          bumpMap: detailMap,
          bumpScale: THREE.MathUtils.clamp(0.0015 + roughness * 0.006, 0.0015, 0.008),
        }),
  });
  return material;
};

const createAccentMaterial = (
  color: number,
  roughness: number,
  metalness: number,
  emissiveIntensity: number,
  detailMap?: THREE.CanvasTexture | null,
): THREE.MeshStandardMaterial => {
  const material = createMaterial(color, roughness, metalness, undefined, detailMap);
  material.emissive = new THREE.Color(color);
  material.emissiveIntensity = emissiveIntensity;
  return material;
};

const createEpoxyFloorMaterial = (
  map?: THREE.CanvasTexture | null,
  detailMap?: THREE.CanvasTexture | null,
): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x9eafb2,
    roughness: 0.12,
    metalness: 0.16,
    envMapIntensity: 1.22,
    clearcoat: 0.78,
    clearcoatRoughness: 0.08,
    specularIntensity: 0.72,
    reflectivity: 0.88,
    ior: 1.58,
    ...(map === undefined ? {} : { map }),
    ...(detailMap === undefined || detailMap === null
      ? {}
      : {
          roughnessMap: detailMap,
          bumpMap: detailMap,
          bumpScale: 0.0015,
        }),
  });
  return material;
};

const createTable = (surfaceTextures: InteriorSurfaceTextures): THREE.Group => {
  const table = new THREE.Group();
  table.name = "TableRoot";
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH + 0.22, 0.58, TABLE_DEPTH + 0.22, 5, 0.12),
    createMaterial(COLORS.structuralGray, 0.58, 0, surfaceTextures.wall, surfaceTextures.detail),
  );
  base.name = "TableBody";
  base.position.y = 0.29;
  base.castShadow = true;
  base.receiveShadow = true;
  table.add(base);

  const shellTop = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH, 0.14, TABLE_DEPTH, 5, 0.08),
    createMaterial(COLORS.whiteLacquer, 0.32, 0, surfaceTextures.table, surfaceTextures.detail),
  );
  shellTop.name = "TableShell";
  shellTop.position.y = TABLE_TOP_Y - 0.07;
  shellTop.castShadow = true;
  shellTop.receiveShadow = true;
  table.add(shellTop);

  const felt = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH - 0.2, 0.045, TABLE_DEPTH - 0.2, 5, 0.035),
    createMaterial(COLORS.charcoal, 0.84, 0, surfaceTextures.fabric, surfaceTextures.detail),
  );
  felt.name = "PlayingSurface";
  // Keep the playing surface, inlay, and shell on distinct depth layers; coplanar faces flicker in WebGL.
  felt.position.y = TABLE_TOP_Y + 0.015;
  felt.receiveShadow = true;
  table.add(felt);

  const inlay = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.435, 64),
    new THREE.MeshStandardMaterial({
      color: COLORS.cyan,
      roughness: 0.34,
      metalness: 0.12,
      emissive: COLORS.cyan,
      emissiveIntensity: 0.28,
    }),
  );
  inlay.name = "TableSystemRing";
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = TABLE_TOP_Y + 0.05;
  table.add(inlay);

  const center = new THREE.Mesh(
    new THREE.CircleGeometry(0.39, 64),
    new THREE.MeshStandardMaterial({ color: 0x20292c, roughness: 0.88 }),
  );
  center.name = "DiscardField";
  center.rotation.x = -Math.PI / 2;
  center.position.y = TABLE_TOP_Y + 0.047;
  table.add(center);

  const redRails = [
    [0, TABLE_DEPTH / 2 + 0.015, TABLE_WIDTH - 0.18, 0.025],
    [0, -(TABLE_DEPTH / 2 + 0.015), TABLE_WIDTH - 0.18, 0.025],
  ] as const;
  for (const [x, z, width, depth] of redRails) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.035, depth, 3, 0.008),
      new THREE.MeshStandardMaterial({
        color: COLORS.red,
        roughness: 0.38,
        emissive: COLORS.red,
        emissiveIntensity: 0.13,
      }),
    );
    rail.name = "DirectionalAccent";
    rail.position.set(x, 0.57, z);
    rail.castShadow = true;
    table.add(rail);
  }
  const sideSeams = [
    [TABLE_WIDTH / 2 + 0.015, 0, 0.025, TABLE_DEPTH - 0.18],
    [-(TABLE_WIDTH / 2 + 0.015), 0, 0.025, TABLE_DEPTH - 0.18],
  ] as const;
  for (const [x, z, width, depth] of sideSeams) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.025, depth, 3, 0.008),
      new THREE.MeshStandardMaterial({
        color: COLORS.cyan,
        roughness: 0.42,
        emissive: COLORS.cyan,
        emissiveIntensity: 0.16,
      }),
    );
    rail.name = "SystemSeam";
    rail.position.set(x, TABLE_TOP_Y + 0.025, z);
    rail.castShadow = true;
    table.add(rail);
  }
  return table;
};

const createWall = (cache: TileTextureCache): THREE.Group => {
  const wall = new THREE.Group();
  wall.name = "WallRoot";
  const start = -((WALL_COUNT - 1) * WALL_SPACING) / 2;
  const wallOffset = TABLE_WIDTH / 2 + 0.19;
  const placements: BackTilePlacement[] = [];
  for (let index = 0; index < WALL_COUNT; index += 1) {
    const offset = start + index * WALL_SPACING;
    for (let level = 0; level < 2; level += 1) {
      const y = TABLE_TOP_Y + 0.09 + level * 0.15;
      placements.push(
        { position: new THREE.Vector3(offset, y, -wallOffset), rotation: Math.PI },
        { position: new THREE.Vector3(offset, y, wallOffset), rotation: 0 },
        { position: new THREE.Vector3(wallOffset, y, offset), rotation: Math.PI / 2 },
        { position: new THREE.Vector3(-wallOffset, y, offset), rotation: -Math.PI / 2 },
      );
    }
  }
  wall.add(createBackTileInstances(cache, placements, 0.12, 0.15, 0.07));
  return wall;
};

const createRack = (width: number, surfaceTextures?: InteriorSurfaceTextures): THREE.Group => {
  const rack = new THREE.Group();
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(width, 0.1, 0.16, 3, 0.025),
    createMaterial(COLORS.charcoal, 0.62, 0, surfaceTextures?.wall, surfaceTextures?.detail),
  );
  base.position.y = TABLE_TOP_Y + 0.1;
  base.castShadow = true;
  rack.add(base);
  const lip = new THREE.Mesh(
    new RoundedBoxGeometry(width - 0.04, 0.035, 0.025, 3, 0.008),
    createMaterial(COLORS.cyan, 0.34, 0.24),
  );
  lip.position.set(0, TABLE_TOP_Y + 0.17, -0.065);
  lip.castShadow = true;
  rack.add(lip);
  return rack;
};

const addHand = (
  parent: THREE.Object3D,
  cache: TileTextureCache,
  surfaceTextures: InteriorSurfaceTextures,
  seatPosition: THREE.Vector3,
  rotation: number,
  faceUp: boolean,
  tiles: readonly TileTypeId[],
): void => {
  const hand = new THREE.Group();
  hand.name = "PlayerHand";
  hand.position.copy(seatPosition);
  hand.rotation.y = rotation;
  hand.add(createRack(1.48, surfaceTextures));
  const start = -((tiles.length - 1) * 0.115) / 2;
  if (!faceUp) {
    const placements = tiles.map((_, index): BackTilePlacement => ({
      position: new THREE.Vector3(start + index * 0.115, TABLE_TOP_Y + 0.22, -0.015),
      rotation: 0,
    }));
    hand.add(createBackTileInstances(cache, placements, 0.1, 0.16, 0.065));
    parent.add(hand);
    return;
  }
  tiles.forEach((tile, index) => {
    const tileMesh = createTile(cache, {
      faceUp: true,
      width: 0.1,
      height: 0.16,
      depth: 0.065,
      tile,
    });
    const drawOffset = index === tiles.length - 1 ? 0.075 : 0;
    tileMesh.position.set(start + index * 0.115 + drawOffset, TABLE_TOP_Y + 0.22, -0.015);
    hand.add(tileMesh);
  });
  parent.add(hand);
};

const createSimulantBody = (color: THREE.Color, name = "SimulantBody"): THREE.Group => {
  const root = new THREE.Group();
  root.name = name;
  const bodyScale = SIMULANT_BODY_TARGET_HEIGHT_METERS / SIMULANT_BODY_SOURCE_HEIGHT_METERS;
  root.scale.setScalar(bodyScale);
  root.position.y = SIMULANT_BODY_SOURCE_FOOT_OFFSET_METERS * bodyScale;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: 0.2,
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), bodyMaterial);
  head.name = "RagdollHead";
  head.userData = { combatHitZone: "head", ragdollPart: "head" };
  head.position.set(0, 0.86, 0);
  root.add(head);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.52, 8, 8), bodyMaterial);
  torso.name = "RagdollTorso";
  torso.userData = { combatHitZone: "body", ragdollPart: "torso" };
  torso.position.set(0, 0.44, 0);
  root.add(torso);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.18), bodyMaterial);
  leftArm.name = "RagdollLeftArm";
  leftArm.userData = { combatHitZone: "body", ragdollPart: "leftArm" };
  leftArm.position.set(-0.28, 0.52, 0.02);
  leftArm.rotation.z = 0.25;
  root.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.18), bodyMaterial);
  rightArm.name = "RagdollRightArm";
  rightArm.userData = { combatHitZone: "body", ragdollPart: "rightArm" };
  rightArm.position.set(0.28, 0.52, 0.02);
  rightArm.rotation.z = -0.25;
  root.add(rightArm);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), bodyMaterial);
  leftLeg.name = "RagdollLeftLeg";
  leftLeg.userData = { combatHitZone: "body", ragdollPart: "leftLeg" };
  leftLeg.position.set(-0.12, 0.05, 0);
  root.add(leftLeg);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), bodyMaterial);
  rightLeg.name = "RagdollRightLeg";
  rightLeg.userData = { combatHitZone: "body", ragdollPart: "rightLeg" };
  rightLeg.position.set(0.12, 0.05, 0);
  root.add(rightLeg);
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return root;
};

interface RagdollBodyParts {
  readonly head: THREE.Object3D;
  readonly torso: THREE.Object3D;
  readonly leftArm: THREE.Object3D;
  readonly rightArm: THREE.Object3D;
  readonly leftLeg: THREE.Object3D;
  readonly rightLeg: THREE.Object3D;
}

const resolveRagdollBodyParts = (body: THREE.Group): RagdollBodyParts => {
  const resolve = (name: string): THREE.Object3D => {
    const part = body.getObjectByName(name);
    if (part === undefined) {
      throw new Error(`Ragdoll body is missing ${name}`);
    }
    return part;
  };
  return {
    head: resolve("RagdollHead"),
    torso: resolve("RagdollTorso"),
    leftArm: resolve("RagdollLeftArm"),
    rightArm: resolve("RagdollRightArm"),
    leftLeg: resolve("RagdollLeftLeg"),
    rightLeg: resolve("RagdollRightLeg"),
  };
};

const resetRagdollBodyPose = (body: THREE.Group, parts: RagdollBodyParts): void => {
  body.position.y =
    SIMULANT_BODY_SOURCE_FOOT_OFFSET_METERS *
    (SIMULANT_BODY_TARGET_HEIGHT_METERS / SIMULANT_BODY_SOURCE_HEIGHT_METERS);
  body.rotation.set(0, 0, 0);
  parts.head.rotation.set(0, 0, 0);
  parts.torso.rotation.set(0, 0, 0);
  parts.leftArm.rotation.set(0, 0, 0.25);
  parts.rightArm.rotation.set(0, 0, -0.25);
  parts.leftLeg.rotation.set(0, 0, 0);
  parts.rightLeg.rotation.set(0, 0, 0);
};

const applyRagdollBodyPose = (
  marker: THREE.Group,
  body: THREE.Group,
  parts: RagdollBodyParts,
  state: RagdollState,
): void => {
  const jointPose = resolveRagdollJointPose(state);
  marker.position.set(state.position.x, state.position.y, state.position.z);
  marker.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
  resetRagdollBodyPose(body, parts);
  parts.head.rotation.x = jointPose.headPitch;
  parts.torso.rotation.x = jointPose.torsoPitch;
  parts.torso.rotation.z = jointPose.torsoRoll;
  parts.leftArm.rotation.z = jointPose.leftArmRoll;
  parts.rightArm.rotation.z = jointPose.rightArmRoll;
  parts.leftLeg.rotation.x = jointPose.leftLegPitch;
  parts.rightLeg.rotation.x = jointPose.rightLegPitch;
};

const addOpenMeld = (
  parent: THREE.Object3D,
  cache: TileTextureCache,
  seatPosition: THREE.Vector3,
  rotation: number,
  tiles: readonly TileTypeId[],
): void => {
  const meld = new THREE.Group();
  meld.name = "ExposedMeld";
  meld.position.copy(seatPosition);
  meld.rotation.y = rotation;
  const start = -((tiles.length - 1) * 0.105) / 2;
  tiles.forEach((tile, index) => {
    const tileMesh = createTile(cache, {
      tile,
      faceUp: true,
      bothSides: true,
      width: 0.09,
      height: 0.14,
      depth: 0.06,
    });
    tileMesh.position.set(start + index * 0.105, TABLE_TOP_Y + 0.11, 0);
    meld.add(tileMesh);
  });
  parent.add(meld);
};

const addDiscardRivers = (parent: THREE.Object3D, cache: TileTextureCache): void => {
  const rivers = [
    { position: new THREE.Vector3(0, TABLE_TOP_Y + 0.1, 0.44), rotation: 0, offset: 0 },
    { position: new THREE.Vector3(0, TABLE_TOP_Y + 0.1, -0.44), rotation: Math.PI, offset: 5 },
    { position: new THREE.Vector3(0.44, TABLE_TOP_Y + 0.1, 0), rotation: -Math.PI / 2, offset: 10 },
    { position: new THREE.Vector3(-0.44, TABLE_TOP_Y + 0.1, 0), rotation: Math.PI / 2, offset: 13 },
  ] as const;
  rivers.forEach((river, riverIndex) => {
    const row = new THREE.Group();
    row.name = `DiscardZone${String(riverIndex)}`;
    row.position.copy(river.position);
    row.rotation.y = river.rotation;
    for (let index = 0; index < 4; index += 1) {
      const tile = PUBLIC_DISCARDS[(river.offset + index) % PUBLIC_DISCARDS.length];
      if (tile === undefined) {
        throw new Error("Public discard river is missing a tile");
      }
      const tileMesh = createTile(cache, {
        tile,
        faceUp: true,
        bothSides: true,
        width: 0.09,
        height: 0.13,
        depth: 0.055,
      });
      tileMesh.position.set((index - 1.5) * 0.105, 0, riverIndex % 2 === 0 ? 0 : 0.035);
      row.add(tileMesh);
    }
    parent.add(row);
  });
};

const makeLabelTexture = (label: string, accent: string): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 110;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create a seat label");
  }
  context.fillStyle = "rgba(21, 26, 29, 0.88)";
  roundedRect(context, 4, 4, 472, 102, 20);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = "#f3f4f0";
  context.font = "700 25px ui-sans-serif, sans-serif";
  context.textAlign = "center";
  context.fillText(label, 240, 69);
  context.textAlign = "left";
  return createCanvasTexture(canvas);
};

const createLabelSprite = (label: string, accent: string): THREE.Sprite => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeLabelTexture(label, accent),
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.userData.dofIgnore = true;
  return sprite;
};

/** Create one small deterministic alpha mask shared by every held weapon. */
const makeWeaponSmokeTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create a canvas context for weapon smoke");
  }
  const imageData = context.createImageData(canvas.width, canvas.height);
  const data = imageData.data;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const normalizedX = ((x + 0.5) / canvas.width) * 2 - 1;
      const normalizedY = ((y + 0.5) / canvas.height) * 2 - 1;
      const distance = Math.sqrt(normalizedX ** 2 + normalizedY ** 2);
      const edge = Math.max(0, 1 - distance);
      const noise = 0.72 + fbmNoise(x / 18, y / 18, 41) * 0.28;
      const alpha = Math.round(Math.pow(edge, 1.45) * noise * 255);
      const pixelIndex = (y * canvas.width + x) * 4;
      data[pixelIndex] = 226;
      data[pixelIndex + 1] = 232;
      data[pixelIndex + 2] = 228;
      data[pixelIndex + 3] = alpha;
    }
  }
  context.putImageData(imageData, 0, 0);
  const texture = createCanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

/** Create one shared, dark-red splat mask for every projected blood decal. */
const makeWeaponBloodSplatTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create a canvas context for blood splat");
  }
  const center = canvas.width / 2;
  const points = 32;
  const color = `#${WEAPON_BLOOD_SPLAT_COLOR.toString(16).padStart(6, "0")}`;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const radius =
      center *
      (0.57 +
        Math.sin(index * 2.7) * 0.08 +
        Math.sin(index * 5.1 + 0.6) * 0.05 +
        (index % 7 === 0 ? 0.12 : 0));
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
  context.fillStyle = color;
  context.fill();
  const texture = createCanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

const addLabel = (
  scene: THREE.Scene,
  label: string,
  position: THREE.Vector3,
  accent: string,
): THREE.Sprite => {
  const sprite = createLabelSprite(label, accent);
  sprite.position.copy(position);
  sprite.scale.set(0.95, 0.22, 1);
  scene.add(sprite);
  return sprite;
};

interface WeaponBarrelResources {
  readonly mesh: THREE.Mesh;
  readonly length: number;
  readonly material: THREE.MeshStandardMaterial;
  readonly baseColor: THREE.Color;
  readonly baseEmissive: THREE.Color;
  readonly baseEmissiveIntensity: number;
}

interface WeaponSmokeParticle {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly velocity: THREE.Vector3;
  readonly phase: number;
  age: number;
  lifetime: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  riseAcceleration: number;
  velocityDrag: number;
  spin: number;
  isGunshot: boolean;
  active: boolean;
}

interface WeaponModelResources {
  readonly root: THREE.Group;
  readonly muzzleFlash: THREE.Mesh;
  readonly muzzleFlashLight: THREE.PointLight | null;
  readonly barrels: readonly WeaponBarrelResources[];
  readonly hotBarrelLength: number;
  readonly muzzleSmokeRoot: THREE.Group | null;
  readonly smokeParticles: readonly WeaponSmokeParticle[];
  readonly muzzleWorldPosition: THREE.Vector3;
  readonly muzzleWorldVelocity: THREE.Vector3;
  readonly muzzleWorldForward: THREE.Vector3;
  muzzleWorldFrameInitialized: boolean;
  readonly scopeLensAnchor: THREE.Object3D | null;
  readonly scopeLensRadius: number;
}

interface WeaponPickupVisual {
  readonly spawn: WeaponPickupSpawn;
  readonly root: THREE.Group;
  readonly baseY: number;
  readonly barrels: readonly WeaponBarrelResources[];
  collected: boolean;
}

interface WeaponSwitchAnimation {
  readonly fromWeapon: WeaponId | null;
  readonly toWeapon: WeaponId | null;
}

interface WeaponEffect {
  readonly object: THREE.Object3D;
  readonly kind: WeaponEffectKind;
  readonly materials: readonly (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[];
  readonly opacityMultiplier: number;
  remainingSeconds: number;
}

interface WeaponHitResponse {
  readonly targetKind?: "simulant";
  readonly shieldHit?: boolean;
  readonly bloodEligible?: boolean;
  readonly targetVelocity?: PhysicsVector;
  /** Resolved impact damage for size/momentum-based melee hits. */
  readonly resolvedDamage?: number;
}

interface WeaponRuntime {
  readonly update: (
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    aimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 },
    getPresentationAimRay: () => {
      readonly origin: THREE.Vector3;
      readonly direction: THREE.Vector3;
    },
    controlsActive: boolean,
    viewActive: boolean,
    viewmodelOffset: CameraViewmodelOffset,
    getViewmodelRecoilDepth: () => number,
    viewmodelTransition: CameraViewmodelTransition,
    meleeActive: boolean,
    worldVelocity: PhysicsVector,
    airborne: boolean,
  ) => void;
  readonly setFireHeld: (held: boolean) => void;
  readonly setReticleEnabled: (enabled: boolean) => void;
  readonly fire: (aimRay: {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  }) => void;
  /** Swing the active gun as a melee weapon without consuming ammunition. */
  readonly melee: (aimRay: {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  }) => boolean;
  readonly fireFrom: (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    weapon: WeaponId,
    options?: WeaponFireFromOptions,
  ) => void;
  readonly playMeleeSwingSound: (
    attributes: MeleeObjectSnapshot,
    sourcePosition: THREE.Vector3,
    swingDurationSeconds: number,
  ) => void;
  readonly playMeleeImpactSound: (
    attributes: MeleeObjectSnapshot,
    sourcePosition: THREE.Vector3,
  ) => void;
  /** Render the same shield spark/blood response used by projectile hits. */
  readonly playMeleeHitEffects: (
    position: PhysicsVector,
    direction: PhysicsVector,
    damage: number,
    response: WeaponHitResponse,
  ) => void;
  readonly reload: () => void;
  readonly interruptReload: () => void;
  readonly isReloading: () => boolean;
  readonly interact: () => boolean;
  readonly holster: () => void;
  readonly cycleWeapon: (direction?: 1 | -1) => boolean;
  readonly cycleWeaponTo: (weapon: WeaponId) => boolean;
  readonly dropActiveWeapon: (playerVelocity?: PhysicsVector) => void;
  /** Claim a world pickup for the simulant without adding it to the player inventory. */
  readonly claimPickupForBot: (pickupId: string) => WeaponId | null;
  /** Return fixed gun pickups that have not been claimed by either actor. */
  readonly getAvailablePickups: () => readonly WeaponPickupSpawn[];
  /** Restore a bot-claimed pickup when the simulant respawns. */
  readonly releasePickupFromBot: (pickupId: string) => boolean;
  readonly recordDeath: () => void;
  readonly getWeaponScopeLens: () => {
    readonly anchor: THREE.Object3D;
    readonly radius: number;
    readonly magnification: number;
  } | null;
  readonly getSniperScopeLens: () => {
    readonly anchor: THREE.Object3D;
    readonly radius: number;
    readonly magnification: number;
  } | null;
  readonly getSnapshot: () => WeaponStateSnapshot;
  readonly dispose: () => void;
}

interface WeaponFireFromOptions {
  readonly random?: { readonly nextFloat: () => number };
  readonly spreadRadians?: number;
  readonly maxDistance?: number;
  readonly showWorldEffects?: boolean;
  readonly showCameraMuzzle?: boolean;
  readonly playAudio?: boolean;
  readonly playPassByAudio?: boolean;
  readonly trackShotHits?: boolean;
  readonly onHit?: (
    hitObject: THREE.Object3D,
    damage: number,
    context: WeaponHitContext,
  ) => WeaponHitResponse | undefined;
  readonly onTargetHit?: () => void;
}

interface WeaponHitContext {
  /** Projectile travel direction at the resolved hit. */
  readonly direction: PhysicsVector;
  /** World-space impact point for hit reactions and diagnostics. */
  readonly point: PhysicsVector;
  readonly distance: number;
  readonly pelletIndex: number;
  readonly projectileCount: number;
  readonly instanceIndex?: number;
  /** Gun strikes reuse the projectile hit seam without creating shot effects. */
  readonly mode?: "projectile" | "melee";
  readonly attackerVelocity?: PhysicsVector;
  readonly attackerAirborne?: boolean;
  readonly meleeSwingSpeedRadiansPerSecond?: number;
  readonly meleeStoppingPower?: number;
}

interface WeaponAudioSpatialOutput {
  readonly destination: GainNode;
  readonly cleanup: () => void;
}

const getWeaponAccent = (weapon: WeaponId): string =>
  `#${new THREE.Color(WEAPON_DEFINITIONS[weapon].color).getHexString()}`;

/** Build the shared melee attributes from a gun's physical size proxy. */
const resolveWeaponMeleeAttributes = (weapon: WeaponId): MeleeObjectSnapshot => {
  const definition = WEAPON_DEFINITIONS[weapon];
  const swing = resolveMeleeSwing(definition.meleeVolumeM3);
  return {
    objectId: -(WEAPON_IDS.indexOf(weapon) + 1),
    displayName: `${definition.label} melee`,
    volumeM3: definition.meleeVolumeM3,
    rangeMeters: resolveMeleeRangeMeters(definition.meleeLengthMeters),
    swingSpeedRadiansPerSecond: swing.swingSpeedRadiansPerSecond,
    damage: swing.damage,
    stoppingPower: swing.stoppingPower,
    oxygenCost: swing.oxygenCost,
  };
};

interface MeleeRuntime {
  readonly update: (
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    aimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 },
    getPresentationAimRay: () => {
      readonly origin: THREE.Vector3;
      readonly direction: THREE.Vector3;
    },
    controlsActive: boolean,
    viewActive: boolean,
    worldVelocity: PhysicsVector,
    airborne: boolean,
    viewmodelOffset: CameraViewmodelOffset,
    viewmodelTransition: CameraViewmodelTransition,
  ) => void;
  readonly setFireHeld: (held: boolean) => void;
  readonly recordDeath: () => void;
  readonly fire: (aimRay: {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  }) => boolean;
  readonly interact: () => boolean;
  readonly isActive: () => boolean;
  /** Hide the carried prop without returning it to the world. */
  readonly stash: () => boolean;
  readonly holster: () => boolean;
  readonly dropActiveObject: (playerVelocity?: PhysicsVector) => boolean;
  readonly throwActiveObject: (playerVelocity?: PhysicsVector) => boolean;
  readonly getSnapshot: () => MeleeStateSnapshot;
  readonly dispose: () => void;
}

/** Shared near-black finish for every procedural gun body and sight detail. */
const WEAPON_BLACK = 0x050607;
/** Hot steel colour used once a barrel has carried the full hit-damage load. */
const WEAPON_BARREL_HEAT_COLOR = new THREE.Color(0xff3518);
const WEAPON_BARREL_HEAT_EMISSIVE = new THREE.Color(0xff1600);
const WEAPON_BARREL_HEAT_EMISSIVE_INTENSITY = 1;
/** Thermal smoke fades in slowly, then expands into a transparent linger. */
const WEAPON_SMOKE_FADE_IN_SECONDS = 0.24;
const WEAPON_THERMAL_SMOKE_LIFETIME_SECONDS = 5;
const WEAPON_SMOKE_SIGMOID_STEEPNESS = 10;
const WEAPON_SMOKE_SIGMOID_START = 1 / (1 + Math.exp(WEAPON_SMOKE_SIGMOID_STEEPNESS / 2));
const WEAPON_SMOKE_SIGMOID_END = 1 / (1 + Math.exp(-WEAPON_SMOKE_SIGMOID_STEEPNESS / 2));
const WEAPON_SMOKE_SIGMOID_RANGE = WEAPON_SMOKE_SIGMOID_END - WEAPON_SMOKE_SIGMOID_START;
const WEAPON_SMOKE_REFERENCE_BARREL_LENGTH = 0.34;
const WEAPON_SMOKE_LONGEST_BARREL_LENGTH = 1.35;
const WEAPON_SMOKE_BARREL_LENGTH_SCALE_RANGE = 0.6;
const WEAPON_MUZZLE_SMOKE_EXPANSION_FRACTION = 0.45;
const WEAPON_THERMAL_SMOKE_RATE_MULTIPLIER = 2;
const WEAPON_SHOT_SOUND_MUZZLE_DURATION_SECONDS = 0.05;
const WEAPON_SHOT_SOUND_CRACK_DURATION_SECONDS = 0.006;
const WEAPON_SHOT_SOUND_CLICK_DURATION_SECONDS = 0.01;
const WEAPON_SHOT_SOUND_NOISE_BUFFER_SECONDS = 0.3;
const WEAPON_SHOT_SOUND_MASTER_GAIN = 0.08;
const WEAPON_SHOT_SOUND_CRACK_FILTER_FREQUENCY_HZ = 3200;
const WEAPON_SHOT_SOUND_CRACK_FILTER_Q = 0.7;
const WEAPON_SHOT_SOUND_CLICK_FREQUENCY_HZ = 190;
const WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND = 343;
const WEAPON_BULLET_WHIZZ_MAX_DISTANCE_METERS = 6;
const WEAPON_BULLET_WHIZZ_MIN_PROJECTION_METERS = 0.2;
const WEAPON_BULLET_WHIZZ_MIN_EVENT_DURATION_SECONDS = 0.028;
const WEAPON_BULLET_WHIZZ_MAX_EVENT_DURATION_SECONDS = 0.1;
const WEAPON_BULLET_WHIZZ_PAN_SCALE = 0.95;
const WEAPON_BULLET_WHIZZ_LIGHT_DAMAGE_START_PITCH_HZ = 5000;
const WEAPON_BULLET_WHIZZ_LIGHT_DAMAGE_END_PITCH_HZ = 2200;
const WEAPON_BULLET_WHIZZ_HEAVY_DAMAGE_START_PITCH_HZ = 2500;
const WEAPON_BULLET_WHIZZ_HEAVY_DAMAGE_END_PITCH_HZ = 700;
const WEAPON_BULLET_WHIZZ_NOISE_MIN_CENTER_HZ = 2000;
const WEAPON_BULLET_WHIZZ_NOISE_MAX_CENTER_HZ = 6000;
const WEAPON_BULLET_WHIZZ_NOISE_MIN_Q = 2;
const WEAPON_BULLET_WHIZZ_NOISE_MAX_Q = 10;
const WEAPON_BULLET_WHIZZ_NOISE_MIX = 0.8;
const WEAPON_BULLET_WHIZZ_WHISTLE_MIX = 0.2;
const WEAPON_BULLET_WHIZZ_VOLUME_SCALE = 1.1;

const createWeaponShotSaturationCurve = (): Float32Array => {
  const curve = new Float32Array(256);
  const drive = 1.35;
  for (let index = 0; index < curve.length; index += 1) {
    const input = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(input * drive);
  }
  return curve;
};

const WEAPON_SHOT_SATURATION_CURVE = createWeaponShotSaturationCurve();

const fillWeaponShotNoiseBuffer = (data: Float32Array): void => {
  let state = 0x6d2b79f5;
  for (let index = 0; index < data.length; index += 1) {
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
    state ^= state >>> 16;
    data[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
  }
};

/** Normalize a logistic curve so its exact endpoints remain transparent/opaque. */
const resolveNormalizedSigmoid = (progress: number): number => {
  const clamped = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const logistic = 1 / (1 + Math.exp(-WEAPON_SMOKE_SIGMOID_STEEPNESS * (clamped - 0.5)));
  return (logistic - WEAPON_SMOKE_SIGMOID_START) / WEAPON_SMOKE_SIGMOID_RANGE;
};

/** Normalize an ease-out logarithmic expansion for rapid growth then a plateau. */
const resolveNormalizedLogExpansion = (progress: number): number => {
  const clamped = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  return (
    Math.log1p(WEAPON_MUZZLE_SMOKE_LOG_STRENGTH * clamped) /
    Math.log1p(WEAPON_MUZZLE_SMOKE_LOG_STRENGTH)
  );
};

const addWeaponBox = (
  root: THREE.Group,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
  radius = 0.025,
): void => {
  const [width, height, depth] = size;
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
};

const addWeaponBarrel = (
  root: THREE.Group,
  length: number,
  radius: number,
  z: number,
  material: THREE.MeshStandardMaterial,
): WeaponBarrelResources => {
  // A barrel has its own material so the heat response never changes the
  // receiver, sights, or other dark details that share the source finish.
  const barrelMaterial = material.clone();
  barrelMaterial.emissive = barrelMaterial.emissive.clone();
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 12),
    barrelMaterial,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = z;
  barrel.castShadow = true;
  barrel.userData = { weaponVisual: true, weaponBarrel: true };
  root.add(barrel);
  return {
    mesh: barrel,
    length,
    material: barrelMaterial,
    baseColor: barrelMaterial.color.clone(),
    baseEmissive: barrelMaterial.emissive.clone(),
    baseEmissiveIntensity: barrelMaterial.emissiveIntensity,
  };
};

/** Add a low front post and split rear notch while keeping the sight channel open. */
const addWeaponIronSights = (
  root: THREE.Group,
  profile: WeaponIronSightProfile,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material,
): void => {
  const railDepth = Math.abs(profile.rearZ - profile.frontZ) + 0.08;
  const railCenterZ = (profile.rearZ + profile.frontZ) / 2;
  const railSideWidth = Math.max(0.008, (profile.railWidth - profile.rearNotchWidth) / 2);
  const railSideOffset = (profile.rearNotchWidth + railSideWidth) / 2;
  for (const side of [-1, 1] as const) {
    addWeaponBox(
      root,
      [railSideWidth, profile.railHeight, railDepth],
      [side * railSideOffset, profile.railY, railCenterZ],
      darkMaterial,
      0.008,
    );
  }

  const rearEarOffset = (profile.rearNotchWidth + profile.rearEarWidth) / 2;
  const rearEarY = profile.rearBaseY + profile.rearHeight / 2;
  addWeaponBox(
    root,
    [profile.rearEarWidth, profile.rearHeight, profile.rearDepth],
    [-rearEarOffset, rearEarY, profile.rearZ],
    darkMaterial,
    0.008,
  );
  addWeaponBox(
    root,
    [profile.rearEarWidth, profile.rearHeight, profile.rearDepth],
    [rearEarOffset, rearEarY, profile.rearZ],
    darkMaterial,
    0.008,
  );

  const frontPostY = profile.frontBaseY + profile.frontHeight / 2;
  addWeaponBox(
    root,
    [profile.frontWidth, profile.frontHeight, profile.frontDepth],
    [0, frontPostY, profile.frontZ],
    darkMaterial,
    0.008,
  );
  const beadRadius = Math.min(profile.frontWidth * 0.42, profile.frontHeight * 0.16);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(beadRadius, 8, 6), accentMaterial);
  bead.name = "WeaponFrontSightBead";
  bead.position.set(
    0,
    profile.frontBaseY + profile.frontHeight - beadRadius * 0.7,
    profile.frontZ - profile.frontDepth * 0.08,
  );
  bead.castShadow = true;
  root.add(bead);
};

const createWeaponSmokeParticles = (
  root: THREE.Group,
  texture: THREE.Texture,
): WeaponSmokeParticle[] => {
  const particles: WeaponSmokeParticle[] = [];
  for (let index = 0; index < WEAPON_BARREL_SMOKE_POOL_SIZE; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0x8b9692,
      transparent: true,
      opacity: 0,
      // World smoke must be occluded by the room after it leaves the muzzle.
      // It remains depth-write-free so overlapping wisps blend into a cloud.
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = "WeaponBarrelSmokeParticle";
    sprite.visible = false;
    // World particles can move outside the camera frustum before their
    // five-second fade completes. Keep them eligible for the explicit lifetime
    // path instead of letting frustum culling pop them.
    sprite.frustumCulled = false;
    sprite.scale.setScalar(0.01);
    sprite.userData = { weaponVisual: true, weaponSmoke: true };
    root.add(sprite);
    particles.push({
      sprite,
      material,
      velocity: new THREE.Vector3(),
      phase: index * 1.913,
      age: 0,
      lifetime: 0,
      startScale: 0,
      endScale: 0,
      startOpacity: 0,
      riseAcceleration: 0,
      velocityDrag: 0,
      spin: 0,
      isGunshot: false,
      active: false,
    });
  }
  return particles;
};

const createRightHandViewModel = (): THREE.Group => {
  const handRoot = new THREE.Group();
  handRoot.name = "WeaponRightHand";
  handRoot.userData = { weaponVisual: true, dofIgnore: true, handSide: "right" };
  const sleeveMaterial = createMaterial(COLORS.charcoal, 0.58, 0.12);
  const skinMaterial = createMaterial(0xc88973, 0.64, 0.02);
  const sleeve = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.24, 0.46, 4, 0.055), sleeveMaterial);
  sleeve.name = "WeaponRightForearm";
  sleeve.position.set(0.035, -0.36, 0.4);
  sleeve.rotation.x = -0.18;
  sleeve.castShadow = true;
  handRoot.add(sleeve);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.17, 0.24, 4, 0.06), skinMaterial);
  palm.name = "WeaponRightPalm";
  palm.position.set(0, -0.18, 0.14);
  palm.rotation.x = -0.08;
  palm.castShadow = true;
  handRoot.add(palm);
  const thumb = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.09, 0.16, 3, 0.03), skinMaterial);
  thumb.name = "WeaponRightThumb";
  thumb.position.set(0.105, -0.14, 0.06);
  thumb.rotation.set(-0.22, -0.32, -0.2);
  thumb.castShadow = true;
  handRoot.add(thumb);
  return handRoot;
};

const createWeaponModel = (
  weapon: WeaponId,
  scale: number,
  held = false,
  smokeTexture?: THREE.Texture,
): WeaponModelResources => {
  const definition = WEAPON_DEFINITIONS[weapon];
  const root = new THREE.Group();
  root.name = `WeaponModel:${weapon}`;
  root.scale.setScalar(scale);
  root.userData = { weaponVisual: true, dofFocusTarget: true };
  const bodyMaterial = createMaterial(WEAPON_BLACK, 0.28, 0.68);
  const darkMaterial = createMaterial(WEAPON_BLACK, 0.4, 0.58);
  const accentMaterial = createAccentMaterial(WEAPON_BLACK, 0.26, 0.25, 0.6);
  const barrels: WeaponBarrelResources[] = [];
  let muzzleSmokeRoot: THREE.Group | null = null;
  let smokeParticles: WeaponSmokeParticle[] = [];
  let muzzleZ: number;
  let scopeLensAnchor: THREE.Object3D | null = null;
  let scopeLensRadius = 0;
  if (weapon === "pistol") {
    // Keep the receiver below the sight line. The old full-width orange cap
    // sat directly behind the front post and covered the reticle while zoomed.
    addWeaponBox(root, [0.2, 0.14, 0.4], [0, -0.015, 0], bodyMaterial, 0.035);
    addWeaponBox(root, [0.12, 0.28, 0.16], [0, -0.19, 0.12], darkMaterial, 0.025);
    barrels.push(addWeaponBarrel(root, 0.34, 0.043, -0.35, darkMaterial));
    // Retain a coloured detail as a narrow side plate, never across the
    // central sight channel.
    addWeaponBox(root, [0.05, 0.035, 0.18], [0.08, 0.015, -0.04], accentMaterial, 0.01);
    muzzleZ = -0.53;
  } else if (weapon === "shotgun") {
    addWeaponBox(root, [0.23, 0.17, 0.72], [0, -0.015, 0.12], bodyMaterial, 0.04);
    addWeaponBox(root, [0.24, 0.15, 0.4], [0, -0.035, 0.62], darkMaterial, 0.04);
    barrels.push(addWeaponBarrel(root, 1.05, 0.055, -0.65, darkMaterial));
    addWeaponBox(root, [0.16, 0.22, 0.3], [0, -0.2, 0.26], accentMaterial, 0.025);
    muzzleZ = -1.2;
  } else if (weapon === "machineGun") {
    // The receiver is deliberately flat; its old raised top cap filled the
    // entire crouched sight picture before the front post could be read.
    addWeaponBox(root, [0.28, 0.17, 0.62], [0, -0.015, 0.08], bodyMaterial, 0.04);
    addWeaponBox(root, [0.13, 0.3, 0.2], [0, -0.21, 0.2], darkMaterial, 0.025);
    addWeaponBox(root, [0.16, 0.34, 0.22], [0, -0.25, -0.08], accentMaterial, 0.03);
    barrels.push(addWeaponBarrel(root, 0.62, 0.05, -0.55, darkMaterial));
    // Move the orange status rail to the receiver side so the centre notch
    // remains open when the weapon is raised into the sight line.
    addWeaponBox(root, [0.06, 0.04, 0.2], [0.11, 0.03, -0.14], accentMaterial, 0.012);
    muzzleZ = -0.88;
  } else if (weapon === "carbine") {
    addWeaponBox(root, [0.25, 0.17, 0.76], [0, -0.015, 0.16], bodyMaterial, 0.04);
    addWeaponBox(root, [0.24, 0.14, 0.38], [0, -0.035, 0.7], darkMaterial, 0.035);
    addWeaponBox(root, [0.13, 0.26, 0.2], [0, -0.18, 0.2], accentMaterial, 0.025);
    barrels.push(addWeaponBarrel(root, 0.92, 0.046, -0.72, darkMaterial));
    addWeaponBox(root, [0.06, 0.035, 0.28], [0.11, 0.025, -0.18], accentMaterial, 0.01);
    muzzleZ = -1.22;
  } else if (weapon === "submachineGun") {
    addWeaponBox(root, [0.25, 0.16, 0.5], [0, -0.015, 0.08], bodyMaterial, 0.035);
    addWeaponBox(root, [0.12, 0.28, 0.19], [0, -0.2, 0.2], darkMaterial, 0.024);
    addWeaponBox(root, [0.14, 0.24, 0.2], [0, -0.19, -0.08], accentMaterial, 0.025);
    barrels.push(addWeaponBarrel(root, 0.46, 0.043, -0.48, darkMaterial));
    addWeaponBox(root, [0.05, 0.03, 0.16], [0.1, 0.025, -0.1], accentMaterial, 0.01);
    muzzleZ = -0.74;
  } else {
    addWeaponBox(root, [0.22, 0.16, 0.92], [0, -0.01, 0.16], bodyMaterial, 0.035);
    addWeaponBox(root, [0.24, 0.15, 0.38], [0, -0.035, 0.72], darkMaterial, 0.04);
    barrels.push(addWeaponBarrel(root, 1.35, 0.045, -0.98, darkMaterial));
    addWeaponBox(root, [0.12, 0.12, 0.4], [0, 0.19, -0.2], accentMaterial, 0.03);
    barrels.push(addWeaponBarrel(root, 0.34, 0.055, -0.19, accentMaterial));
    muzzleZ = -1.68;
  }
  const scope = definition.scope;
  if (scope !== undefined) {
    const scopeRoot = new THREE.Group();
    scopeRoot.name = `${weapon}ScopeBody`;
    // The optic is a camera child and therefore inherits the centralized
    // viewmodel damper, recoil, reload, and reticule alignment.
    scopeRoot.position.set(0, scope.modelY, -0.05);
    scopeRoot.userData = { weaponVisual: true, dofIgnore: true };
    const scopeBody = new THREE.Mesh(
      new THREE.CylinderGeometry(
        scope.bodyRadius * 0.95,
        scope.bodyRadius,
        scope.bodyLength,
        16,
        1,
        true,
      ),
      darkMaterial,
    );
    scopeBody.name = `${weapon}ScopeTube`;
    scopeBody.rotation.x = Math.PI / 2;
    scopeBody.castShadow = true;
    scopeBody.userData = { weaponVisual: true, dofIgnore: true };
    scopeRoot.add(scopeBody);
    const ringOffset = scope.bodyLength * 0.45;
    for (const z of [-ringOffset, ringOffset] as const) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(scope.ringRadius, scope.ringTubeRadius, 8, 20),
        accentMaterial,
      );
      ring.name = `${weapon}ScopeRing`;
      ring.position.z = z;
      ring.userData = { weaponVisual: true, dofIgnore: true };
      scopeRoot.add(ring);
    }
    const lensMaterial = new THREE.MeshBasicMaterial({
      color: scope.lensColor,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(scope.lensRadius, 32), lensMaterial);
    lens.name = `${weapon}ScopeGlass`;
    // Keep the glass just ahead of the open rear rim so it remains visible
    // while the hidden scope camera samples the world through this anchor.
    lens.position.z = scope.bodyLength * 0.5 + 0.01;
    lens.userData = { weaponVisual: true, dofIgnore: true };
    scopeRoot.add(lens);
    scopeLensAnchor = new THREE.Object3D();
    scopeLensAnchor.name = `${weapon}ScopeLensAnchor`;
    scopeLensAnchor.position.copy(lens.position);
    scopeLensAnchor.userData = { weaponVisual: true, dofIgnore: true };
    scopeRoot.add(scopeLensAnchor);
    scopeLensRadius = scope.lensRadius;
    root.add(scopeRoot);
  }
  addWeaponIronSights(root, definition.ironSight, darkMaterial, accentMaterial);
  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 6),
    new THREE.MeshBasicMaterial({
      color: definition.color,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  muzzleFlash.name = "WeaponMuzzleFlash";
  muzzleFlash.position.z = muzzleZ;
  muzzleFlash.visible = false;
  muzzleFlash.userData = { weaponVisual: true, dofIgnore: true };
  root.add(muzzleFlash);
  let muzzleFlashLight: THREE.PointLight | null = null;
  if (held) {
    muzzleFlashLight = new THREE.PointLight(
      definition.color,
      0,
      WEAPON_MUZZLE_FLASH_LIGHT_DISTANCE,
      WEAPON_MUZZLE_FLASH_LIGHT_DECAY,
    );
    muzzleFlashLight.name = "WeaponMuzzleFlashLight";
    muzzleFlashLight.position.z = muzzleZ;
    muzzleFlashLight.visible = false;
    muzzleFlashLight.castShadow = false;
    muzzleFlashLight.userData = {
      weaponVisual: true,
      dofIgnore: true,
      muzzleFlashLight: true,
    };
    root.add(muzzleFlashLight);
  }
  if (held) {
    root.add(createRightHandViewModel());
  }
  if (held && smokeTexture !== undefined) {
    muzzleSmokeRoot = new THREE.Group();
    muzzleSmokeRoot.name = "WeaponMuzzleSmoke";
    // Seed the group near the forward barrel while it is assembled. The
    // runtime detaches this pool to the scene world before the first spawn;
    // every particle then receives an exact muzzle world position.
    muzzleSmokeRoot.position.set(0, 0.2, muzzleZ + 0.24);
    muzzleSmokeRoot.userData = { weaponVisual: true, weaponSmoke: true };
    root.add(muzzleSmokeRoot);
    smokeParticles = createWeaponSmokeParticles(muzzleSmokeRoot, smokeTexture);
  }
  return {
    root,
    muzzleFlash,
    muzzleFlashLight,
    barrels,
    hotBarrelLength: Math.max(...barrels.map((barrel) => barrel.length), 0),
    muzzleSmokeRoot,
    smokeParticles,
    muzzleWorldPosition: new THREE.Vector3(),
    muzzleWorldVelocity: new THREE.Vector3(),
    muzzleWorldForward: new THREE.Vector3(0, 0, -1),
    muzzleWorldFrameInitialized: false,
    scopeLensAnchor,
    scopeLensRadius,
  };
};

/** Apply one weapon's normalized glow response to every visible model copy. */
const applyWeaponBarrelGlowVisual = (barrel: WeaponBarrelResources, glowRatio: number): void => {
  const ratio = THREE.MathUtils.clamp(Number.isFinite(glowRatio) ? glowRatio : 0, 0, 1);
  barrel.material.color.copy(barrel.baseColor).lerp(WEAPON_BARREL_HEAT_COLOR, ratio);
  barrel.material.emissive.copy(barrel.baseEmissive).lerp(WEAPON_BARREL_HEAT_EMISSIVE, ratio);
  barrel.material.emissiveIntensity = THREE.MathUtils.lerp(
    barrel.baseEmissiveIntensity,
    WEAPON_BARREL_HEAT_EMISSIVE_INTENSITY,
    ratio,
  );
  barrel.material.needsUpdate = true;
  barrel.mesh.userData.weaponBarrelGlowRatio = ratio;
};

const isWeaponVisual = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current.userData.weaponVisual === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

/** Presentation-only groups must not stop a hitscan projectile. */
export const isWeaponRaycastSurface = (object: THREE.Object3D): boolean => {
  if (object instanceof THREE.Sprite || isWeaponVisual(object)) {
    return false;
  }
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current.userData.weaponRaycastIgnore === true) {
      return false;
    }
    current = current.parent;
  }
  return true;
};

interface WindowWithLegacyAudioContext extends Window {
  readonly AudioContext?: typeof AudioContext;
  readonly webkitAudioContext?: typeof AudioContext;
}

type WeaponShotAudioContextConstructor = new () => AudioContext;

const resolveWeaponShotAudioContextConstructor = ():
  WeaponShotAudioContextConstructor | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const browserWindow = window as WindowWithLegacyAudioContext;
  return browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
};

const WEAPON_VIEWMODEL_AIM_DISTANCE = 64;

const createWeaponRuntime = (
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  roomSeed: string,
  pickups: readonly WeaponPickupSpawn[],
  onStateChange?: (state: WeaponStateSnapshot) => void,
  onWeaponShot?: (damage: number, projectileCount: number) => void,
  onWeaponMeleeSwing?: (damage: number) => number,
  onWeaponHit?: (
    hitObject: THREE.Object3D,
    damage: number,
    context: WeaponHitContext,
  ) => WeaponHitResponse | undefined,
  onWeaponSwitch?: (hasOutgoingWeapon: boolean) => void,
): WeaponRuntime => {
  const pickupRoot = new THREE.Group();
  pickupRoot.name = "WeaponPickupRoot";
  pickupRoot.userData = { weaponVisual: true };
  scene.add(pickupRoot);
  const effectsRoot = new THREE.Group();
  effectsRoot.name = "WeaponEffectsRoot";
  effectsRoot.userData = { dofIgnore: true, weaponVisual: true };
  scene.add(effectsRoot);
  const worldSmokeRoot = new THREE.Group();
  worldSmokeRoot.name = "WeaponWorldSmokeRoot";
  // Ignore smoke for the local focus-ray target only. It remains a real
  // depth-tested world occluder for every camera that renders the scene.
  worldSmokeRoot.userData = {
    weaponVisual: true,
    weaponSmokeRoot: true,
    dofIgnore: true,
  };
  scene.add(worldSmokeRoot);
  const weaponSmokeTexture = makeWeaponSmokeTexture();
  const bloodSplatTexture = makeWeaponBloodSplatTexture();
  const bulletHoleRoot = new THREE.Group();
  bulletHoleRoot.name = "WeaponBulletHoleRoot";
  // Bullet holes are presentation-only scene objects, but they should still
  // participate in the normal depth-of-field pass instead of floating in a
  // separate overlay like the short-lived tracer and muzzle effects.
  bulletHoleRoot.userData = { weaponVisual: true, bulletHoleRoot: true };
  scene.add(bulletHoleRoot);
  const bloodRoot = new THREE.Group();
  bloodRoot.name = "WeaponBloodRoot";
  // Blood is a world effect: keep it in the depth-tested scene and let the
  // scope feed include it alongside the persistent surface decals.
  bloodRoot.userData = { weaponVisual: true, bloodRoot: true };
  scene.add(bloodRoot);
  const pickupVisuals: WeaponPickupVisual[] = [];
  for (const spawn of pickups) {
    const definition = WEAPON_DEFINITIONS[spawn.weapon];
    const pickup = new THREE.Group();
    pickup.name = `WeaponPickup:${spawn.id}`;
    pickup.position.set(spawn.position[0], spawn.position[1], spawn.position[2]);
    pickup.rotation.y = spawn.rotation;
    pickup.userData = { weaponVisual: true, dofFocusTarget: true };
    const padMaterial = new THREE.MeshBasicMaterial({
      color: definition.color,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      toneMapped: false,
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.035, 32), padMaterial);
    pad.name = "WeaponPickupPad";
    pad.position.y = -0.56;
    pad.userData = { weaponVisual: true, dofIgnore: true };
    pickup.add(pad);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: definition.color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 8, 32), ringMaterial);
    ring.name = "WeaponPickupRing";
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.52;
    ring.userData = { weaponVisual: true, dofIgnore: true };
    pickup.add(ring);
    const model = createWeaponModel(spawn.weapon, 0.82);
    model.root.position.y = -0.02;
    pickup.add(model.root);
    const label = createLabelSprite(`${definition.shortLabel} · E`, getWeaponAccent(spawn.weapon));
    label.name = "WeaponPickupLabel";
    label.position.set(0, 0.86, 0);
    label.scale.set(0.86, 0.2, 1);
    pickup.add(label);
    pickupRoot.add(pickup);
    pickupVisuals.push({
      spawn,
      root: pickup,
      baseY: spawn.position[1],
      barrels: model.barrels,
      collected: false,
    });
  }

  const viewModels = new Map<WeaponId, WeaponModelResources>();
  for (const weapon of WEAPON_IDS) {
    const model = createWeaponModel(weapon, 0.92, true, weaponSmokeTexture);
    // Smoke is a world effect, not a camera-child decoration. Detach the
    // pooled particle root once so every sprite can keep its captured world
    // position while the player turns, walks, holsters, or switches weapons.
    if (model.muzzleSmokeRoot !== null) {
      model.muzzleSmokeRoot.removeFromParent();
      model.muzzleSmokeRoot.position.set(0, 0, 0);
      model.muzzleSmokeRoot.rotation.set(0, 0, 0);
      model.muzzleSmokeRoot.scale.setScalar(1);
      worldSmokeRoot.add(model.muzzleSmokeRoot);
    }
    model.root.position.set(
      CAMERA_VIEWMODEL_STANDING_OFFSET.x,
      CAMERA_VIEWMODEL_STANDING_OFFSET.y,
      CAMERA_VIEWMODEL_STANDING_OFFSET.z,
    );
    model.root.visible = false;
    model.root.userData = { weaponVisual: true, dofIgnore: true };
    camera.add(model.root);
    viewModels.set(weapon, model);
  }

  const inventory = new Map<
    WeaponId,
    { owned: boolean; ammoInMagazine: number; reserveAmmo: number }
  >();
  for (const weapon of WEAPON_IDS) {
    inventory.set(weapon, { owned: false, ammoInMagazine: 0, reserveAmmo: 0 });
  }
  const barrelTemperatureC = new Map<WeaponId, number>(
    WEAPON_IDS.map((weapon) => [weapon, WEAPON_BARREL_AMBIENT_TEMPERATURE_C]),
  );
  let activeWeapon: WeaponId | null = null;
  let switchAnimation: WeaponSwitchAnimation | null = null;
  let switchStartedSinceLastUpdate = false;
  let viewmodelTransitionActive = false;
  let nearbyPickup: WeaponId | null = null;
  let reloadingSeconds = 0;
  let roundReloadLiftElapsedSeconds = 0;
  let roundReloadReturnElapsedSeconds: number | null = null;
  let reloadInsertionImpulseElapsedSeconds = Number.POSITIVE_INFINITY;
  let reloadInsertionPending = false;
  let fireCooldownSeconds = 0;
  let burstShotsRemaining = 0;
  let muzzleFlashSeconds = 0;
  let shotsFired = 0;
  let shotsHit = 0;
  let fireHeld = false;
  let meleeSwinging = false;
  let meleeSwingElapsedSeconds = 0;
  let meleeSwingDurationSeconds = 0;
  let meleeSwingDirection: MeleeSwingDirection = "right-to-left";
  let meleeNextSwingDirection: MeleeSwingDirection = "right-to-left";
  let meleeSwingHitResolved = false;
  let latestWorldVelocity: PhysicsVector = { x: 0, y: 0, z: 0 };
  let latestAirborne = false;
  /** Blocks the Caps-Lock pistol until the physical trigger is released. */
  let triggerReleaseLocked = false;
  let reticleEnabled = false;
  let burstCooldownAfterCurrentBurstSeconds = 0;
  let controlsActive = false;
  let viewActive = false;
  let pickupPositionInitialized = false;
  let smokeSpawnAccumulator = 0;
  let smokeAccumulatorWeapon: WeaponId | null = null;
  let latestAimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 } | null =
    null;
  let meleeAimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 } | null =
    null;
  let lastSnapshotSerialized = "";
  const shotRandom = createSeededRandom(`${roomSeed}|weapons|combat|v1`);
  const smokeRandom = createSeededRandom(`${roomSeed}|weapons|smoke|v1`);
  let shotAudioContext: AudioContext | null = null;
  let shotAudioMasterGain: GainNode | null = null;
  let shotAudioNoiseBuffer: AudioBuffer | null = null;
  const shotRaycaster = new THREE.Raycaster();
  // Sprite.raycast requires a camera even when the sprite is later filtered
  // out as a non-surface target. Supplying it also keeps label sprites from
  // polluting the console while a shot is being resolved.
  shotRaycaster.camera = camera;
  const rightVector = new THREE.Vector3();
  const upVector = new THREE.Vector3();
  const pelletDirection = new THREE.Vector3();
  const effectEnd = new THREE.Vector3();
  const effectStart = new THREE.Vector3();
  const passByDirection = new THREE.Vector3();
  const passByToListener = new THREE.Vector3();
  const passByClosestPoint = new THREE.Vector3();
  const passByRightAxis = new THREE.Vector3();
  const audioListenerPosition = new THREE.Vector3();
  const audioListenerForward = new THREE.Vector3();
  const audioListenerUp = new THREE.Vector3();
  const audioListenerQuaternion = new THREE.Quaternion();
  const hitColor = new THREE.Color();
  const surfaceNormal = new THREE.Vector3();
  const bulletHoleForward = new THREE.Vector3(0, 0, 1);
  const bulletHoleQuaternion = new THREE.Quaternion();
  const bulletHoleWorldMatrix = new THREE.Matrix4();
  const bulletHoleInstanceMatrix = new THREE.Matrix4();
  const bulletHoleNormalMatrix = new THREE.Matrix3();
  const effects: WeaponEffect[] = [];
  const bulletHoleEffects: WeaponEffect[] = [];
  const bloodDecalEffects: WeaponEffect[] = [];
  const bloodSurfaceRaycaster = new THREE.Raycaster();
  bloodSurfaceRaycaster.camera = camera;
  const bloodSurfaceOrigin = new THREE.Vector3();
  const bloodSurfaceNormal = new THREE.Vector3();
  const bloodSmearDirection = new THREE.Vector3();
  const bloodSmearLocal = new THREE.Vector3();
  const bloodDecalQuaternion = new THREE.Quaternion();
  const weaponForward = new THREE.Vector3(0, 0, -1);
  const weaponAimTargetLocal = new THREE.Vector3();
  const weaponAimDirectionLocal = new THREE.Vector3();
  const weaponAimQuaternion = new THREE.Quaternion();
  const weaponReloadQuaternion = new THREE.Quaternion();
  const weaponReloadEuler = new THREE.Euler(0, 0, 0, "XYZ");
  const lastPickupCheckPosition = new THREE.Vector3();
  const smokeWorldUp = new THREE.Vector3(0, 1, 0);
  const smokeMuzzleWorld = new THREE.Vector3();
  const smokeRightWorld = new THREE.Vector3();
  const smokeSpawnWorld = new THREE.Vector3();
  const smokeFallbackAxis = new THREE.Vector3(1, 0, 0);

  const ensureShotAudio = (): {
    readonly context: AudioContext;
    readonly output: GainNode;
    readonly noiseBuffer: AudioBuffer;
  } | null => {
    const AudioContextConstructor = resolveWeaponShotAudioContextConstructor();
    if (AudioContextConstructor === undefined) {
      return null;
    }
    if (shotAudioContext === null || shotAudioContext.state === "closed") {
      try {
        shotAudioContext = new AudioContextConstructor();
        shotAudioMasterGain = shotAudioContext.createGain();
        shotAudioMasterGain.gain.value = WEAPON_SHOT_SOUND_MASTER_GAIN;
        shotAudioMasterGain.connect(shotAudioContext.destination);
        const noiseLength = Math.max(
          1,
          Math.ceil(shotAudioContext.sampleRate * WEAPON_SHOT_SOUND_NOISE_BUFFER_SECONDS),
        );
        shotAudioNoiseBuffer = shotAudioContext.createBuffer(
          1,
          noiseLength,
          shotAudioContext.sampleRate,
        );
        const noiseData = shotAudioNoiseBuffer.getChannelData(0);
        fillWeaponShotNoiseBuffer(noiseData);
      } catch {
        shotAudioContext = null;
        shotAudioMasterGain = null;
        shotAudioNoiseBuffer = null;
        return null;
      }
    }
    const output = shotAudioMasterGain;
    const noiseBuffer = shotAudioNoiseBuffer;
    if (output === null || noiseBuffer === null) {
      return null;
    }
    if (shotAudioContext.state === "suspended") {
      void shotAudioContext.resume().catch(() => undefined);
    }
    return { context: shotAudioContext, output, noiseBuffer };
  };

  const updateShotAudioListener = (context: AudioContext): void => {
    camera.getWorldPosition(audioListenerPosition);
    camera.getWorldDirection(audioListenerForward);
    camera.getWorldQuaternion(audioListenerQuaternion);
    audioListenerUp.set(0, 1, 0).applyQuaternion(audioListenerQuaternion).normalize();
    const listener = context.listener;
    const when = context.currentTime;
    try {
      listener.positionX.setValueAtTime(audioListenerPosition.x, when);
      listener.positionY.setValueAtTime(audioListenerPosition.y, when);
      listener.positionZ.setValueAtTime(audioListenerPosition.z, when);
      listener.forwardX.setValueAtTime(audioListenerForward.x, when);
      listener.forwardY.setValueAtTime(audioListenerForward.y, when);
      listener.forwardZ.setValueAtTime(audioListenerForward.z, when);
      listener.upX.setValueAtTime(audioListenerUp.x, when);
      listener.upY.setValueAtTime(audioListenerUp.y, when);
      listener.upZ.setValueAtTime(audioListenerUp.z, when);
    } catch {
      // Unsupported listener positioning should not block visual firing. The
      // shared proximity gain remains active even without HRTF placement.
    }
  };

  const createWeaponAudioSpatialOutput = (
    audio: { readonly context: AudioContext; readonly output: GainNode },
    sourcePosition: THREE.Vector3,
    when: number,
  ): WeaponAudioSpatialOutput => {
    updateShotAudioListener(audio.context);
    const proximity = resolveWeaponAudioProximity(sourcePosition.distanceTo(audioListenerPosition));
    const proximityGain = audio.context.createGain();
    proximityGain.gain.setValueAtTime(proximity, when);
    let panner: PannerNode | null = null;
    try {
      panner = audio.context.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = WEAPON_AUDIO_REFERENCE_DISTANCE_METERS;
      panner.maxDistance = WEAPON_AUDIO_MAX_DISTANCE_METERS;
      panner.rolloffFactor = WEAPON_AUDIO_ROLLOFF_FACTOR;
      panner.positionX.setValueAtTime(sourcePosition.x, when);
      panner.positionY.setValueAtTime(sourcePosition.y, when);
      panner.positionZ.setValueAtTime(sourcePosition.z, when);
      proximityGain.connect(panner);
      panner.connect(audio.output);
    } catch {
      panner?.disconnect();
      // The gain still applies the bounded proximity envelope when a browser
      // lacks a usable PannerNode implementation.
      proximityGain.connect(audio.output);
      panner = null;
    }
    let cleaned = false;
    return {
      destination: proximityGain,
      cleanup: (): void => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        proximityGain.disconnect();
        panner?.disconnect();
      },
    };
  };

  const playWeaponShotSound = (
    profile: ReturnType<typeof resolveGunAudioProfile>,
    sourcePosition: THREE.Vector3,
  ): void => {
    const audio = ensureShotAudio();
    if (audio === null) {
      return;
    }
    const now = audio.context.currentTime;
    updateShotAudioListener(audio.context);
    const muzzlePropagationDelay =
      sourcePosition.distanceTo(audioListenerPosition) /
      WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND;
    const startAt = now + Math.max(0, muzzlePropagationDelay);
    const spatialOutput = createWeaponAudioSpatialOutput(audio, sourcePosition, startAt);
    const scheduleNoiseLayer = (options: {
      readonly durationSeconds: number;
      readonly gain: number;
      readonly playbackRate: number;
      readonly filterType: BiquadFilterType;
      readonly filterFrequencyHz: number;
      readonly filterQ: number;
      readonly destination: AudioNode;
      readonly onEnded?: () => void;
    }): void => {
      let source: AudioBufferSourceNode | null = null;
      let filter: BiquadFilterNode | null = null;
      let envelope: GainNode | null = null;
      try {
        source = audio.context.createBufferSource();
        filter = audio.context.createBiquadFilter();
        envelope = audio.context.createGain();
        source.buffer = audio.noiseBuffer;
        source.playbackRate.setValueAtTime(options.playbackRate, startAt);
        filter.type = options.filterType;
        filter.frequency.setValueAtTime(options.filterFrequencyHz, startAt);
        filter.Q.setValueAtTime(options.filterQ, startAt);
        envelope.gain.setValueAtTime(Math.max(0.0001, options.gain), startAt);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + options.durationSeconds);
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(options.destination);
        source.onended = (): void => {
          source?.disconnect();
          filter?.disconnect();
          envelope?.disconnect();
          options.onEnded?.();
        };
        source.start(startAt);
        source.stop(startAt + options.durationSeconds);
      } catch {
        source?.disconnect();
        filter?.disconnect();
        envelope?.disconnect();
      }
    };

    const muzzleCompressor = audio.context.createDynamicsCompressor();
    muzzleCompressor.threshold.setValueAtTime(-24, startAt);
    muzzleCompressor.knee.setValueAtTime(12, startAt);
    muzzleCompressor.ratio.setValueAtTime(2, startAt);
    muzzleCompressor.attack.setValueAtTime(0.001, startAt);
    muzzleCompressor.release.setValueAtTime(0.05, startAt);
    const muzzleSaturation = audio.context.createWaveShaper();
    muzzleSaturation.curve = WEAPON_SHOT_SATURATION_CURVE as unknown as Float32Array<ArrayBuffer>;
    muzzleSaturation.oversample = "2x";
    muzzleCompressor.connect(muzzleSaturation);
    muzzleSaturation.connect(spatialOutput.destination);
    scheduleNoiseLayer({
      durationSeconds: WEAPON_SHOT_SOUND_MUZZLE_DURATION_SECONDS,
      gain: profile.damageVolume,
      playbackRate: profile.damagePitch,
      filterType: "lowpass",
      filterFrequencyHz: profile.muzzleCutoffFrequencyHz,
      filterQ: 0.7,
      destination: muzzleCompressor,
      onEnded: (): void => {
        muzzleCompressor.disconnect();
        muzzleSaturation.disconnect();
      },
    });

    scheduleNoiseLayer({
      durationSeconds: WEAPON_SHOT_SOUND_CRACK_DURATION_SECONDS,
      gain: profile.crackVolume,
      playbackRate: 1,
      filterType: "highpass",
      filterFrequencyHz: WEAPON_SHOT_SOUND_CRACK_FILTER_FREQUENCY_HZ,
      filterQ: WEAPON_SHOT_SOUND_CRACK_FILTER_Q,
      destination: spatialOutput.destination,
    });

    try {
      const clickOscillator = audio.context.createOscillator();
      const clickEnvelope = audio.context.createGain();
      clickOscillator.type = "square";
      clickOscillator.frequency.setValueAtTime(WEAPON_SHOT_SOUND_CLICK_FREQUENCY_HZ, startAt);
      clickEnvelope.gain.setValueAtTime(0.1, startAt);
      clickEnvelope.gain.exponentialRampToValueAtTime(
        0.0001,
        startAt + WEAPON_SHOT_SOUND_CLICK_DURATION_SECONDS,
      );
      clickOscillator.connect(clickEnvelope);
      clickEnvelope.connect(spatialOutput.destination);
      clickOscillator.onended = (): void => {
        clickOscillator.disconnect();
        clickEnvelope.disconnect();
      };
      clickOscillator.start(startAt);
      clickOscillator.stop(startAt + WEAPON_SHOT_SOUND_CLICK_DURATION_SECONDS);
    } catch {
      // Web Audio is optional; visual firing must continue if a node fails.
    }

    scheduleNoiseLayer({
      durationSeconds: profile.tailDurationSeconds,
      gain: profile.tailVolume,
      playbackRate: profile.damagePitch,
      filterType: "lowpass",
      filterFrequencyHz: profile.tailCutoffFrequencyHz,
      filterQ: 0.8,
      destination: spatialOutput.destination,
      onEnded: spatialOutput.cleanup,
    });
  };

  const playWeaponImpactSound = (
    profile: ReturnType<typeof resolveBulletImpactAudioProfile>,
    sourcePosition: THREE.Vector3,
  ): void => {
    const audio = ensureShotAudio();
    if (audio === null) {
      return;
    }
    updateShotAudioListener(audio.context);
    const propagationDelay =
      sourcePosition.distanceTo(audioListenerPosition) /
      WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND;
    const start = audio.context.currentTime + Math.max(0, propagationDelay);
    const spatialOutput = createWeaponAudioSpatialOutput(audio, sourcePosition, start);
    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseFilter: BiquadFilterNode | null = null;
    let noiseEnvelope: GainNode | null = null;
    let toneOscillator: OscillatorNode | null = null;
    let toneEnvelope: GainNode | null = null;
    let glancingSource: AudioBufferSourceNode | null = null;
    let glancingFilter: BiquadFilterNode | null = null;
    let glancingEnvelope: GainNode | null = null;
    let compressor: DynamicsCompressorNode | null = null;
    let saturation: WaveShaperNode | null = null;
    let finishedLayers = 0;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      noiseSource?.disconnect();
      noiseFilter?.disconnect();
      noiseEnvelope?.disconnect();
      toneOscillator?.disconnect();
      toneEnvelope?.disconnect();
      glancingSource?.disconnect();
      glancingFilter?.disconnect();
      glancingEnvelope?.disconnect();
      compressor?.disconnect();
      saturation?.disconnect();
      spatialOutput.cleanup();
    };
    const finishLayer = (): void => {
      finishedLayers += 1;
      if (finishedLayers >= 3) {
        cleanup();
      }
    };
    const duration = Math.max(0.045, profile.impactDurationSeconds);
    const glancingDuration = Math.max(0.025, profile.glancingDurationSeconds);
    try {
      noiseSource = audio.context.createBufferSource();
      noiseFilter = audio.context.createBiquadFilter();
      noiseEnvelope = audio.context.createGain();
      compressor = audio.context.createDynamicsCompressor();
      saturation = audio.context.createWaveShaper();
      noiseSource.buffer = audio.noiseBuffer;
      noiseSource.playbackRate.setValueAtTime(profile.impactNoisePlaybackRate, start);
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(profile.impactNoiseCutoffFrequencyHz, start);
      noiseFilter.Q.setValueAtTime(profile.impactNoiseQ, start);
      noiseEnvelope.gain.setValueAtTime(Math.max(0.0001, profile.impactNoiseGain), start);
      noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      compressor.threshold.setValueAtTime(-22, start);
      compressor.knee.setValueAtTime(10, start);
      compressor.ratio.setValueAtTime(3.4, start);
      compressor.attack.setValueAtTime(0.001, start);
      compressor.release.setValueAtTime(0.06, start);
      saturation.curve = WEAPON_SHOT_SATURATION_CURVE as unknown as Float32Array<ArrayBuffer>;
      saturation.oversample = "2x";
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseEnvelope);
      noiseEnvelope.connect(compressor);
      compressor.connect(saturation);
      saturation.connect(spatialOutput.destination);

      toneOscillator = audio.context.createOscillator();
      toneEnvelope = audio.context.createGain();
      toneOscillator.type = "triangle";
      toneOscillator.frequency.setValueAtTime(profile.impactToneFrequencyHz, start);
      toneOscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, profile.impactToneEndFrequencyHz),
        start + duration,
      );
      toneEnvelope.gain.setValueAtTime(profile.impactToneGain, start);
      toneEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      toneOscillator.connect(toneEnvelope);
      toneEnvelope.connect(spatialOutput.destination);

      glancingSource = audio.context.createBufferSource();
      glancingFilter = audio.context.createBiquadFilter();
      glancingEnvelope = audio.context.createGain();
      glancingSource.buffer = audio.noiseBuffer;
      glancingSource.playbackRate.setValueAtTime(profile.glancingNoisePlaybackRate, start);
      glancingFilter.type = "bandpass";
      glancingFilter.frequency.setValueAtTime(profile.glancingNoiseCenterFrequencyHz, start);
      glancingFilter.Q.setValueAtTime(profile.glancingNoiseQ, start);
      glancingEnvelope.gain.setValueAtTime(Math.max(0.0001, profile.glancingNoiseGain), start);
      glancingEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + glancingDuration);
      glancingSource.connect(glancingFilter);
      glancingFilter.connect(glancingEnvelope);
      glancingEnvelope.connect(spatialOutput.destination);

      noiseSource.onended = finishLayer;
      toneOscillator.onended = finishLayer;
      glancingSource.onended = finishLayer;
      noiseSource.start(start);
      noiseSource.stop(start + duration);
      toneOscillator.start(start);
      toneOscillator.stop(start + duration);
      glancingSource.start(start);
      glancingSource.stop(start + glancingDuration);
    } catch {
      cleanup();
    }
  };

  const playWeaponPassBySound = (
    profile: ReturnType<typeof resolveGunAudioProfile>,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
  ): void => {
    const audio = ensureShotAudio();
    if (audio === null) {
      return;
    }
    updateShotAudioListener(audio.context);
    if (distance <= 0 || !Number.isFinite(distance)) {
      return;
    }
    const safeDirection = passByDirection.copy(direction).normalize();
    if (safeDirection.lengthSq() <= 0) {
      return;
    }
    passByToListener.copy(audioListenerPosition).sub(origin);
    const projection = passByToListener.dot(safeDirection);
    if (projection < WEAPON_BULLET_WHIZZ_MIN_PROJECTION_METERS) {
      return;
    }
    const clampedProjection = Math.max(0, Math.min(distance, projection));
    passByClosestPoint.copy(origin).addScaledVector(safeDirection, clampedProjection);
    const closestDistance = passByClosestPoint.distanceTo(audioListenerPosition);
    if (
      !Number.isFinite(closestDistance) ||
      closestDistance > WEAPON_BULLET_WHIZZ_MAX_DISTANCE_METERS
    ) {
      return;
    }
    const nearDistanceSpan = Math.max(
      0.05,
      WEAPON_BULLET_WHIZZ_MAX_DISTANCE_METERS - closestDistance,
    );
    const startProjection = Math.max(0, clampedProjection - nearDistanceSpan);
    const endProjection = Math.min(distance, clampedProjection + nearDistanceSpan);
    passByToListener.copy(origin).addScaledVector(safeDirection, startProjection);
    const startSoundDistance = passByToListener.distanceTo(audioListenerPosition);
    passByToListener.copy(origin).addScaledVector(safeDirection, endProjection);
    const endSoundDistance = passByToListener.distanceTo(audioListenerPosition);
    const now = audio.context.currentTime;
    const start =
      now +
      startProjection / profile.bulletSpeedMetersPerSecond +
      startSoundDistance / WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND;
    const end =
      now +
      endProjection / profile.bulletSpeedMetersPerSecond +
      endSoundDistance / WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND;
    const duration = Math.max(
      WEAPON_BULLET_WHIZZ_MIN_EVENT_DURATION_SECONDS,
      Math.min(WEAPON_BULLET_WHIZZ_MAX_EVENT_DURATION_SECONDS, end - start),
    );
    const travelRatio = THREE.MathUtils.clamp(
      1 - closestDistance / WEAPON_BULLET_WHIZZ_MAX_DISTANCE_METERS,
      0,
      1,
    );
    const damageRatio = THREE.MathUtils.clamp((profile.damageVolume - 0.8) / 0.5, 0, 1);
    const lightDamageStartPitch = WEAPON_BULLET_WHIZZ_LIGHT_DAMAGE_START_PITCH_HZ;
    const heavyDamageStartPitch = WEAPON_BULLET_WHIZZ_HEAVY_DAMAGE_START_PITCH_HZ;
    const lightDamageEndPitch = WEAPON_BULLET_WHIZZ_LIGHT_DAMAGE_END_PITCH_HZ;
    const heavyDamageEndPitch = WEAPON_BULLET_WHIZZ_HEAVY_DAMAGE_END_PITCH_HZ;
    const baseStartPitch = THREE.MathUtils.lerp(
      lightDamageStartPitch,
      heavyDamageStartPitch,
      damageRatio,
    );
    const baseEndPitch = THREE.MathUtils.lerp(
      lightDamageEndPitch,
      heavyDamageEndPitch,
      damageRatio,
    );
    const sweepDepth = 0.35 + travelRatio * 0.65;
    const startPitch = baseStartPitch;
    const endPitch = THREE.MathUtils.lerp(baseStartPitch, baseEndPitch, sweepDepth);
    const noiseStartFrequency = THREE.MathUtils.clamp(
      startPitch * 0.9,
      WEAPON_BULLET_WHIZZ_NOISE_MIN_CENTER_HZ,
      WEAPON_BULLET_WHIZZ_NOISE_MAX_CENTER_HZ,
    );
    const noiseEndFrequency = THREE.MathUtils.clamp(
      endPitch * 0.9,
      WEAPON_BULLET_WHIZZ_NOISE_MIN_CENTER_HZ * 0.75,
      WEAPON_BULLET_WHIZZ_NOISE_MAX_CENTER_HZ,
    );
    const noiseStartQ = THREE.MathUtils.lerp(
      WEAPON_BULLET_WHIZZ_NOISE_MIN_Q,
      WEAPON_BULLET_WHIZZ_NOISE_MAX_Q,
      travelRatio,
    );
    const noiseEndQ = Math.max(1.4, noiseStartQ * 0.72);
    const peakGain = Math.max(
      0.0001,
      profile.damageVolume * WEAPON_BULLET_WHIZZ_VOLUME_SCALE * (0.08 + travelRatio * 0.92),
    );
    const spatialOutput = createWeaponAudioSpatialOutput(audio, passByClosestPoint, start);

    let turbulenceSource: AudioBufferSourceNode | null = null;
    let turbulenceFilter: BiquadFilterNode | null = null;
    let turbulenceGain: GainNode | null = null;
    let whistleOscillator: OscillatorNode | null = null;
    let whistleGain: GainNode | null = null;
    let passByPan: StereoPannerNode | null = null;
    let finishedLayers = 0;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      turbulenceSource?.disconnect();
      turbulenceFilter?.disconnect();
      turbulenceGain?.disconnect();
      whistleOscillator?.disconnect();
      whistleGain?.disconnect();
      passByPan?.disconnect();
      spatialOutput.cleanup();
    };
    const finishLayer = (): void => {
      finishedLayers += 1;
      if (finishedLayers >= 2) {
        cleanup();
      }
    };
    try {
      turbulenceSource = audio.context.createBufferSource();
      turbulenceFilter = audio.context.createBiquadFilter();
      turbulenceGain = audio.context.createGain();
      whistleOscillator = audio.context.createOscillator();
      whistleGain = audio.context.createGain();
      turbulenceSource.buffer = audio.noiseBuffer;
      turbulenceFilter.type = "bandpass";
      turbulenceFilter.frequency.setValueAtTime(noiseStartFrequency, start);
      turbulenceFilter.frequency.exponentialRampToValueAtTime(noiseEndFrequency, start + duration);
      turbulenceFilter.Q.setValueAtTime(noiseStartQ, start);
      turbulenceFilter.Q.exponentialRampToValueAtTime(noiseEndQ, start + duration);
      whistleOscillator.type = "sine";
      whistleOscillator.frequency.setValueAtTime(startPitch, start);
      whistleOscillator.frequency.exponentialRampToValueAtTime(endPitch, start + duration);
      const peakTime = start + Math.min(0.005, duration * 0.2);
      turbulenceGain.gain.setValueAtTime(0.0001, start);
      turbulenceGain.gain.exponentialRampToValueAtTime(
        peakGain * WEAPON_BULLET_WHIZZ_NOISE_MIX,
        peakTime,
      );
      turbulenceGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      whistleGain.gain.setValueAtTime(0.0001, start);
      whistleGain.gain.exponentialRampToValueAtTime(
        peakGain * WEAPON_BULLET_WHIZZ_WHISTLE_MIX,
        peakTime,
      );
      whistleGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      turbulenceSource.connect(turbulenceFilter);
      turbulenceFilter.connect(turbulenceGain);
      whistleOscillator.connect(whistleGain);
      passByToListener.copy(audioListenerPosition).sub(passByClosestPoint);
      const contextWithOptionalStereoPanner = audio.context as Omit<
        AudioContext,
        "createStereoPanner"
      > & {
        createStereoPanner?: () => StereoPannerNode;
      };
      if (contextWithOptionalStereoPanner.createStereoPanner === undefined) {
        turbulenceGain.connect(spatialOutput.destination);
        whistleGain.connect(spatialOutput.destination);
      } else {
        passByPan = contextWithOptionalStereoPanner.createStereoPanner();
        passByRightAxis.set(1, 0, 0).applyQuaternion(audioListenerQuaternion);
        const rawPan = passByToListener.normalize().dot(passByRightAxis);
        passByPan.pan.setValueAtTime(
          THREE.MathUtils.clamp(rawPan * WEAPON_BULLET_WHIZZ_PAN_SCALE, -1, 1),
          start,
        );
        turbulenceGain.connect(passByPan);
        whistleGain.connect(passByPan);
        passByPan.connect(spatialOutput.destination);
      }
      turbulenceSource.onended = (): void => {
        finishLayer();
      };
      whistleOscillator.onended = (): void => {
        finishLayer();
      };
      turbulenceSource.start(start);
      turbulenceSource.stop(start + duration);
      whistleOscillator.start(start);
      whistleOscillator.stop(start + duration);
    } catch {
      cleanup();
    }
  };

  const playMeleeSwingSound = (
    attributes: MeleeObjectSnapshot,
    sourcePosition: THREE.Vector3,
    swingDurationSeconds: number,
  ): void => {
    const audio = ensureShotAudio();
    if (audio === null) {
      return;
    }
    const profile = resolveMeleeAudioProfile(attributes);
    updateShotAudioListener(audio.context);
    const propagationDelay =
      sourcePosition.distanceTo(audioListenerPosition) /
      WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND;
    const start = audio.context.currentTime + Math.max(0, propagationDelay);
    const spatialOutput = createWeaponAudioSpatialOutput(audio, sourcePosition, start);
    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseFilter: BiquadFilterNode | null = null;
    let noiseEnvelope: GainNode | null = null;
    let toneOscillator: OscillatorNode | null = null;
    let toneEnvelope: GainNode | null = null;
    let finishedLayers = 0;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      noiseSource?.disconnect();
      noiseFilter?.disconnect();
      noiseEnvelope?.disconnect();
      toneOscillator?.disconnect();
      toneEnvelope?.disconnect();
      spatialOutput.cleanup();
    };
    const finishLayer = (): void => {
      finishedLayers += 1;
      if (finishedLayers >= 2) {
        cleanup();
      }
    };
    const duration = Number.isFinite(swingDurationSeconds)
      ? Math.max(0.05, swingDurationSeconds)
      : Math.max(0.05, profile.swingDurationSeconds);
    try {
      noiseSource = audio.context.createBufferSource();
      noiseFilter = audio.context.createBiquadFilter();
      noiseEnvelope = audio.context.createGain();
      toneOscillator = audio.context.createOscillator();
      toneEnvelope = audio.context.createGain();
      noiseSource.buffer = audio.noiseBuffer;
      noiseSource.loop = true;
      noiseSource.playbackRate.setValueAtTime(profile.swingNoisePlaybackRate, start);
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(profile.swingNoiseCenterFrequencyHz, start);
      noiseFilter.Q.setValueAtTime(profile.swingNoiseQ, start);
      const apex = start + duration * 0.5;
      const noiseQuietGain = resolveMeleeSwingEnvelopeGain(0, profile.swingNoiseGain);
      const noisePeakGain = resolveMeleeSwingEnvelopeGain(0.5, profile.swingNoiseGain);
      noiseEnvelope.gain.setValueAtTime(noiseQuietGain, start);
      noiseEnvelope.gain.exponentialRampToValueAtTime(noisePeakGain, apex);
      noiseEnvelope.gain.exponentialRampToValueAtTime(noiseQuietGain, start + duration);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseEnvelope);
      noiseEnvelope.connect(spatialOutput.destination);

      toneOscillator.type = "sine";
      toneOscillator.frequency.setValueAtTime(profile.swingToneFrequencyHz, start);
      toneOscillator.frequency.exponentialRampToValueAtTime(
        profile.swingToneFrequencyHz * 1.08,
        start + duration,
      );
      const toneQuietGain = resolveMeleeSwingEnvelopeGain(0, profile.swingToneGain);
      const tonePeakGain = resolveMeleeSwingEnvelopeGain(0.5, profile.swingToneGain);
      toneEnvelope.gain.setValueAtTime(toneQuietGain, start);
      toneEnvelope.gain.exponentialRampToValueAtTime(tonePeakGain, apex);
      toneEnvelope.gain.exponentialRampToValueAtTime(toneQuietGain, start + duration);
      toneOscillator.connect(toneEnvelope);
      toneEnvelope.connect(spatialOutput.destination);
      noiseSource.onended = finishLayer;
      toneOscillator.onended = finishLayer;
      noiseSource.start(start);
      noiseSource.stop(start + duration);
      toneOscillator.start(start);
      toneOscillator.stop(start + duration);
    } catch {
      cleanup();
    }
  };

  const playMeleeImpactSound = (
    attributes: MeleeObjectSnapshot,
    sourcePosition: THREE.Vector3,
  ): void => {
    const audio = ensureShotAudio();
    if (audio === null) {
      return;
    }
    const profile = resolveMeleeAudioProfile(attributes);
    updateShotAudioListener(audio.context);
    const propagationDelay =
      sourcePosition.distanceTo(audioListenerPosition) /
      WEAPON_SOUND_SPEED_OF_SOUND_METERS_PER_SECOND;
    const start = audio.context.currentTime + Math.max(0, propagationDelay);
    const spatialOutput = createWeaponAudioSpatialOutput(audio, sourcePosition, start);
    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseFilter: BiquadFilterNode | null = null;
    let noiseEnvelope: GainNode | null = null;
    let toneOscillator: OscillatorNode | null = null;
    let toneEnvelope: GainNode | null = null;
    let compressor: DynamicsCompressorNode | null = null;
    let saturation: WaveShaperNode | null = null;
    let finishedLayers = 0;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      noiseSource?.disconnect();
      noiseFilter?.disconnect();
      noiseEnvelope?.disconnect();
      toneOscillator?.disconnect();
      toneEnvelope?.disconnect();
      compressor?.disconnect();
      saturation?.disconnect();
      spatialOutput.cleanup();
    };
    const finishLayer = (): void => {
      finishedLayers += 1;
      if (finishedLayers >= 2) {
        cleanup();
      }
    };
    const duration = Math.max(0.045, profile.impactDurationSeconds);
    try {
      noiseSource = audio.context.createBufferSource();
      noiseFilter = audio.context.createBiquadFilter();
      noiseEnvelope = audio.context.createGain();
      compressor = audio.context.createDynamicsCompressor();
      saturation = audio.context.createWaveShaper();
      toneOscillator = audio.context.createOscillator();
      toneEnvelope = audio.context.createGain();
      noiseSource.buffer = audio.noiseBuffer;
      noiseSource.playbackRate.setValueAtTime(profile.impactNoisePlaybackRate, start);
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(profile.impactNoiseCutoffFrequencyHz, start);
      noiseFilter.Q.setValueAtTime(0.8, start);
      noiseEnvelope.gain.setValueAtTime(Math.max(0.0001, profile.impactNoiseGain), start);
      noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      compressor.threshold.setValueAtTime(-22, start);
      compressor.knee.setValueAtTime(10, start);
      compressor.ratio.setValueAtTime(3.4, start);
      compressor.attack.setValueAtTime(0.001, start);
      compressor.release.setValueAtTime(0.06, start);
      saturation.curve = WEAPON_SHOT_SATURATION_CURVE as unknown as Float32Array<ArrayBuffer>;
      saturation.oversample = "2x";
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseEnvelope);
      noiseEnvelope.connect(compressor);
      compressor.connect(saturation);
      saturation.connect(spatialOutput.destination);

      toneOscillator.type = "triangle";
      toneOscillator.frequency.setValueAtTime(profile.impactToneFrequencyHz, start);
      toneOscillator.frequency.exponentialRampToValueAtTime(
        profile.impactToneFrequencyHz * 0.58,
        start + duration,
      );
      toneEnvelope.gain.setValueAtTime(profile.impactToneGain, start);
      toneEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      toneOscillator.connect(toneEnvelope);
      toneEnvelope.connect(spatialOutput.destination);
      noiseSource.onended = (): void => {
        finishLayer();
      };
      toneOscillator.onended = (): void => {
        finishLayer();
      };
      noiseSource.start(start);
      noiseSource.stop(start + duration);
      toneOscillator.start(start);
      toneOscillator.stop(start + duration);
    } catch {
      cleanup();
    }
  };

  const isReloadPresentationActive = (): boolean =>
    reloadingSeconds > 0 || roundReloadReturnElapsedSeconds !== null;

  const getSnapshot = (): WeaponStateSnapshot => ({
    activeWeapon,
    nearbyPickup,
    inventory: WEAPON_IDS.map((weapon): WeaponInventorySnapshot => {
      const slot = inventory.get(weapon);
      return {
        weapon,
        owned: slot?.owned ?? false,
        ammoInMagazine: slot?.ammoInMagazine ?? 0,
        reserveAmmo: slot?.reserveAmmo ?? 0,
      };
    }),
    reloading: isReloadPresentationActive(),
    shotsFired,
    shotsHit,
    bulletHoleCount: bulletHoleEffects.length,
  });
  const emitState = (force = false): void => {
    const snapshot = getSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (force || serialized !== lastSnapshotSerialized) {
      lastSnapshotSerialized = serialized;
      onStateChange?.(snapshot);
    }
  };
  const resetRoundReloadPresentation = (): void => {
    roundReloadLiftElapsedSeconds = 0;
    roundReloadReturnElapsedSeconds = null;
    reloadInsertionImpulseElapsedSeconds = Number.POSITIVE_INFINITY;
    reloadInsertionPending = false;
  };
  const triggerReloadInsertionImpulse = (): void => {
    reloadInsertionImpulseElapsedSeconds = 0;
    reloadInsertionPending = true;
  };
  /** Restart the visible load kick at the exact frame the ammo is committed. */
  const commitReloadInsertionImpulse = (): void => {
    reloadInsertionImpulseElapsedSeconds = 0;
    reloadInsertionPending = false;
  };
  const beginRoundReloadReturn = (): void => {
    if (activeWeapon !== null && WEAPON_DEFINITIONS[activeWeapon].reloadMode === "round") {
      if (reloadInsertionPending) {
        reloadInsertionImpulseElapsedSeconds = Number.POSITIVE_INFINITY;
        reloadInsertionPending = false;
      }
      roundReloadReturnElapsedSeconds = 0;
    }
  };
  const startReload = (allowDuringWeaponSwitch = false): boolean => {
    if (
      activeWeapon === null ||
      reloadingSeconds > 0 ||
      (!allowDuringWeaponSwitch && (switchAnimation !== null || viewmodelTransitionActive))
    ) {
      return false;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    const slot = inventory.get(activeWeapon);
    if (
      slot === undefined ||
      slot.ammoInMagazine >= definition.magazineSize ||
      slot.reserveAmmo <= 0
    ) {
      return false;
    }
    reloadingSeconds = definition.reloadSeconds;
    burstShotsRemaining = 0;
    burstCooldownAfterCurrentBurstSeconds = 0;
    triggerReleaseLocked = false;
    resetRoundReloadPresentation();
    emitState(true);
    return true;
  };
  const autoReloadActiveWeapon = (): void => {
    if (activeWeapon === null) {
      return;
    }
    const slot = inventory.get(activeWeapon);
    if (
      slot !== undefined &&
      shouldAutoReloadOnWeaponEquip(slot.ammoInMagazine, slot.reserveAmmo)
    ) {
      // The incoming viewmodel is still in the shared switch pose. Starting
      // the timer here means it is already reloading as it rises into view.
      startReload(true);
    }
  };
  const showWeaponViewModel = (weapon: WeaponId | null): void => {
    for (const [entry, model] of viewModels) {
      model.root.visible = viewActive && entry === weapon;
    }
  };
  const applyWeaponBarrelTemperature = (weapon: WeaponId, temperatureC: number): void => {
    const glowRatio = resolveWeaponBarrelGlowRatio(temperatureC);
    const viewModel = viewModels.get(weapon);
    for (const barrel of viewModel?.barrels ?? []) {
      applyWeaponBarrelGlowVisual(barrel, glowRatio);
    }
    for (const pickup of pickupVisuals) {
      if (pickup.spawn.weapon !== weapon) {
        continue;
      }
      for (const barrel of pickup.barrels) {
        applyWeaponBarrelGlowVisual(barrel, glowRatio);
      }
    }
  };
  const resetWeaponSmoke = (model: WeaponModelResources): void => {
    for (const particle of model.smokeParticles) {
      particle.active = false;
      particle.isGunshot = false;
      particle.age = 0;
      particle.material.opacity = 0;
      particle.sprite.visible = false;
    }
  };
  const clearGunshotSmoke = (model: WeaponModelResources): void => {
    for (const particle of model.smokeParticles) {
      if (!particle.active || !particle.isGunshot) {
        continue;
      }
      particle.active = false;
      particle.isGunshot = false;
      particle.age = 0;
      particle.material.opacity = 0;
      particle.sprite.visible = false;
    }
  };
  const clearAllGunshotSmoke = (): void => {
    for (const model of viewModels.values()) {
      clearGunshotSmoke(model);
    }
  };
  /** Keep visual smoke power tied to one trigger round's total damage. */
  const resolveWeaponSmokePower = (damagePerRound: number): number => {
    const safeDamage = Number.isFinite(damagePerRound) ? Math.max(0, damagePerRound) : 0;
    return Math.max(0.45, safeDamage / 32);
  };
  const resolveThermalSmokePower = (smokePower: number): number => {
    const safePower = Number.isFinite(smokePower) ? Math.max(0.45, smokePower) : 0.45;
    return Math.sqrt(safePower);
  };
  const resolveThermalSmokeBarrelLengthScale = (model: WeaponModelResources): number => {
    const barrelLengthProgress = THREE.MathUtils.clamp(
      (model.hotBarrelLength - WEAPON_SMOKE_REFERENCE_BARREL_LENGTH) /
        (WEAPON_SMOKE_LONGEST_BARREL_LENGTH - WEAPON_SMOKE_REFERENCE_BARREL_LENGTH),
      0,
      1,
    );
    return 1 + barrelLengthProgress * WEAPON_SMOKE_BARREL_LENGTH_SCALE_RANGE;
  };
  /** Emit more often when the same parametric function produces a smaller plume. */
  const resolveThermalSmokeRate = (model: WeaponModelResources, smokePower: number): number => {
    const sizeFactor =
      resolveThermalSmokePower(smokePower) * resolveThermalSmokeBarrelLengthScale(model);
    return (
      (WEAPON_BARREL_SMOKE_MAX_RATE * WEAPON_THERMAL_SMOKE_RATE_MULTIPLIER) /
      Math.max(0.001, sizeFactor)
    );
  };
  const updateWeaponSmokeWorldFrame = (model: WeaponModelResources, deltaSeconds = 0): void => {
    model.root.updateMatrixWorld(true);
    model.muzzleFlash.getWorldPosition(smokeMuzzleWorld);
    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (model.muzzleWorldFrameInitialized && safeDelta > 0.0001) {
      model.muzzleWorldVelocity
        .copy(smokeMuzzleWorld)
        .sub(model.muzzleWorldPosition)
        .multiplyScalar(1 / safeDelta)
        .clampLength(0, 30);
    } else if (!model.muzzleWorldFrameInitialized) {
      model.muzzleWorldVelocity.set(0, 0, 0);
    }
    model.muzzleWorldPosition.copy(smokeMuzzleWorld);
    model.muzzleWorldForward.set(0, 0, -1).transformDirection(model.root.matrixWorld).normalize();
    if (model.muzzleWorldForward.lengthSq() < 0.0001) {
      model.muzzleWorldForward.set(0, 0, -1);
    }
    model.muzzleWorldFrameInitialized = true;
  };
  const spawnWeaponSmoke = (
    model: WeaponModelResources,
    thermal: boolean,
    smokePower: number,
  ): void => {
    let particle = model.smokeParticles.find((candidate) => !candidate.active);
    if (particle === undefined) {
      particle = model.smokeParticles[0];
      for (const candidate of model.smokeParticles) {
        if (particle === undefined || candidate.age > particle.age) {
          particle = candidate;
        }
      }
    }
    if (particle === undefined) {
      return;
    }
    const random = (): number => smokeRandom.nextFloat();
    const safePower = Number.isFinite(smokePower) ? Math.max(0.45, smokePower) : 0.45;
    // Thermal size still follows round power, but its square-root response
    // stops shotgun/sniper steam from dominating the room.
    const powerForSmoke = thermal ? resolveThermalSmokePower(safePower) : safePower;
    const thermalBarrelLengthScale = resolveThermalSmokeBarrelLengthScale(model);
    const powerSpread = Math.min(3, powerForSmoke);
    const lateralSpread = (thermal ? 0.06 : 0.09) * (0.8 + powerSpread * 0.2);
    const concentratedSpread = lateralSpread * 0.24;
    smokeRightWorld.crossVectors(model.muzzleWorldForward, smokeWorldUp);
    if (smokeRightWorld.lengthSq() < 0.0001) {
      smokeRightWorld.crossVectors(model.muzzleWorldForward, smokeFallbackAxis);
    }
    smokeRightWorld.normalize();
    particle.active = true;
    particle.isGunshot = !thermal;
    particle.age = 0;
    // Gunshot gas is deliberately short-lived: it begins at zero size and
    // disperses over one second. Thermal wisps keep their slower five-second
    // diffusion so barrel heat remains readable during sustained fire.
    particle.lifetime = thermal
      ? WEAPON_THERMAL_SMOKE_LIFETIME_SECONDS
      : WEAPON_MUZZLE_SMOKE_LIFETIME_SECONDS;
    const smokeScaleMultiplier = thermal ? thermalBarrelLengthScale : 5;
    if (thermal) {
      particle.startScale = (0.22 + random() * 0.12) * powerForSmoke * smokeScaleMultiplier;
      particle.endScale = particle.startScale * (5.2 + random() * 1.6);
      particle.startOpacity = 0.55 + random() * 0.15;
    } else {
      particle.startScale = 0;
      particle.endScale =
        (0.26 + random() * 0.14) * powerForSmoke * smokeScaleMultiplier * (4.8 + random() * 1.5);
      particle.startOpacity = 1;
    }
    particle.riseAcceleration = thermal ? 0.1 + random() * 0.06 : 0.08 + random() * 0.06;
    particle.velocityDrag = thermal ? 0.32 + random() * 0.1 : 0.38 + random() * 0.12;
    particle.spin = (random() - 0.5) * (thermal ? 2.2 : 3.6);
    smokeSpawnWorld
      .copy(model.muzzleWorldPosition)
      .addScaledVector(smokeRightWorld, (random() - 0.5) * concentratedSpread)
      .addScaledVector(smokeWorldUp, (random() - 0.5) * concentratedSpread * 0.45)
      .addScaledVector(model.muzzleWorldForward, random() * (thermal ? 0.025 : 0.045));
    particle.sprite.position.copy(smokeSpawnWorld);
    const outwardSpeed = thermal ? 0.045 * (0.85 + powerSpread * 0.25) : 0.42 + powerSpread * 0.3;
    const upwardSpeed = (thermal ? 0.08 : 0.1) + random() * (thermal ? 0.08 : 0.12);
    particle.velocity
      .copy(model.muzzleWorldVelocity)
      .addScaledVector(model.muzzleWorldForward, outwardSpeed)
      .addScaledVector(smokeRightWorld, (random() - 0.5) * lateralSpread)
      .addScaledVector(smokeWorldUp, upwardSpeed);
    // Muzzle smoke is a soft gray; hot-barrel steam keeps its pale white
    // material. Starting transparent prevents a visible sprite pop.
    particle.material.color.setHex(thermal ? 0xf1f4ef : 0x7f8985);
    particle.material.opacity = thermal ? 0 : particle.startOpacity;
    particle.sprite.rotation.set(0, 0, random() * Math.PI * 2);
    particle.sprite.scale.set(particle.startScale, particle.startScale, 1);
    particle.sprite.visible = true;
  };
  const updateWeaponSmoke = (
    model: WeaponModelResources,
    weapon: WeaponId,
    deltaSeconds: number,
    emitThermal = true,
  ): void => {
    if (model.smokeParticles.length === 0) {
      return;
    }
    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (emitThermal) {
      updateWeaponSmokeWorldFrame(model, safeDelta);
      const temperatureC = barrelTemperatureC.get(weapon) ?? WEAPON_BARREL_AMBIENT_TEMPERATURE_C;
      const glowRatio = resolveWeaponBarrelGlowRatio(temperatureC);
      const thermalRatio = resolveWeaponBarrelSmokeRatio(glowRatio);
      const smokePower = resolveWeaponSmokePower(WEAPON_DEFINITIONS[weapon].totalDamagePerShot);
      const thermalSmokeRate = resolveThermalSmokeRate(model, smokePower);
      smokeSpawnAccumulator += safeDelta * thermalSmokeRate * thermalRatio;
      let thermalSpawns = 0;
      while (smokeSpawnAccumulator >= 1 && thermalSpawns < 8) {
        smokeSpawnAccumulator -= 1;
        spawnWeaponSmoke(model, true, smokePower);
        thermalSpawns += 1;
      }
      if (thermalRatio <= 0) {
        smokeSpawnAccumulator = Math.min(smokeSpawnAccumulator, 0.99);
      }
    }
    for (const particle of model.smokeParticles) {
      if (!particle.active) {
        continue;
      }
      particle.age += safeDelta;
      // Inherit the moving muzzle's world velocity, then damp all motion so
      // the plume gradually stops travelling forward while hot lift remains.
      particle.velocity.multiplyScalar(Math.exp(-particle.velocityDrag * safeDelta));
      particle.velocity.y += particle.riseAcceleration * safeDelta;
      particle.sprite.position.addScaledVector(particle.velocity, safeDelta);
      particle.sprite.position.x +=
        Math.sin(particle.phase + particle.age * 4.2) * 0.012 * safeDelta;
      particle.sprite.position.z +=
        Math.cos(particle.phase + particle.age * 3.4) * 0.008 * safeDelta;
      particle.sprite.rotation.z += particle.spin * safeDelta;
      const thermalFadeInDuration = particle.isGunshot
        ? 0
        : Math.min(WEAPON_SMOKE_FADE_IN_SECONDS, particle.lifetime);
      if (particle.isGunshot) {
        const sizeProgress = resolveWeaponMuzzleSmokeLogProgress(particle.age);
        const scale = particle.endScale * sizeProgress;
        particle.sprite.scale.set(scale, scale * (0.84 + sizeProgress * 0.26), 1);
        particle.material.opacity =
          particle.startOpacity * resolveWeaponMuzzleSmokeOpacity(particle.age);
      } else {
        const fadeInProgress = Math.min(1, particle.age / thermalFadeInDuration);
        const easedFadeIn = resolveNormalizedSigmoid(fadeInProgress);
        const thermalExpansionProgress = Math.min(
          1,
          Math.max(
            0,
            (particle.age - thermalFadeInDuration) /
              (Math.max(0.001, particle.lifetime - thermalFadeInDuration) *
                WEAPON_MUZZLE_SMOKE_EXPANSION_FRACTION),
          ),
        );
        const sizeProgress = resolveNormalizedLogExpansion(thermalExpansionProgress);
        const scale = THREE.MathUtils.lerp(particle.startScale, particle.endScale, sizeProgress);
        particle.sprite.scale.set(scale, scale * (0.84 + sizeProgress * 0.26), 1);
        // Thermal wisps follow the restrained expansion: bright at source
        // scale, then transparent while the max-size cloud lingers.
        particle.material.opacity = particle.startOpacity * easedFadeIn * (1 - sizeProgress);
      }
      if (
        shouldClearWeaponSmoke(
          particle.material.opacity,
          particle.age,
          particle.lifetime,
          thermalFadeInDuration,
        )
      ) {
        particle.active = false;
        particle.isGunshot = false;
        particle.sprite.visible = false;
        particle.material.opacity = 0;
      }
    }
  };
  const addWeaponHitHeat = (weapon: WeaponId, damage: number): void => {
    const currentTemperatureC =
      barrelTemperatureC.get(weapon) ?? WEAPON_BARREL_AMBIENT_TEMPERATURE_C;
    const nextTemperatureC = resolveWeaponBarrelTemperatureC(currentTemperatureC, damage);
    barrelTemperatureC.set(weapon, nextTemperatureC);
    applyWeaponBarrelTemperature(weapon, nextTemperatureC);
  };
  const coolWeaponBarrels = (deltaSeconds: number): void => {
    for (const weapon of WEAPON_IDS) {
      const currentTemperatureC =
        barrelTemperatureC.get(weapon) ?? WEAPON_BARREL_AMBIENT_TEMPERATURE_C;
      if (currentTemperatureC <= WEAPON_BARREL_AMBIENT_TEMPERATURE_C) {
        continue;
      }
      const nextTemperatureC = resolveWeaponBarrelTemperatureC(
        currentTemperatureC,
        0,
        deltaSeconds,
      );
      if (nextTemperatureC === currentTemperatureC) {
        continue;
      }
      barrelTemperatureC.set(weapon, nextTemperatureC);
      applyWeaponBarrelTemperature(weapon, nextTemperatureC);
    }
  };
  const setActiveWeapon = (weapon: WeaponId | null): boolean => {
    if (weapon !== null && inventory.get(weapon)?.owned !== true) {
      return false;
    }
    const previousWeapon = activeWeapon;
    activeWeapon = weapon;
    meleeSwinging = false;
    meleeSwingElapsedSeconds = 0;
    meleeSwingHitResolved = false;
    meleeAimRay = null;
    reloadingSeconds = 0;
    burstShotsRemaining = 0;
    burstCooldownAfterCurrentBurstSeconds = 0;
    triggerReleaseLocked = false;
    resetRoundReloadPresentation();
    if (previousWeapon !== weapon) {
      switchAnimation = { fromWeapon: previousWeapon, toWeapon: weapon };
      switchStartedSinceLastUpdate = true;
      onWeaponSwitch?.(previousWeapon !== null);
      showWeaponViewModel(previousWeapon);
    } else {
      switchAnimation = null;
      showWeaponViewModel(activeWeapon);
    }
    autoReloadActiveWeapon();
    return true;
  };
  const equipWeapon = (weapon: WeaponId): boolean => {
    return setActiveWeapon(weapon);
  };
  const holsterWeapon = (): void => {
    setActiveWeapon(null);
    emitState(true);
  };
  const collectPickup = (visual: WeaponPickupVisual, equip = true): boolean => {
    const definition = WEAPON_DEFINITIONS[visual.spawn.weapon];
    const slot = inventory.get(visual.spawn.weapon);
    if (slot === undefined) {
      return false;
    }
    if (!slot.owned) {
      slot.owned = true;
      slot.ammoInMagazine = definition.magazineSize;
      slot.reserveAmmo = definition.reserveAmmo;
    } else {
      slot.reserveAmmo = Math.min(
        definition.reserveAmmo * 2,
        slot.reserveAmmo + definition.magazineSize,
      );
    }
    visual.collected = true;
    visual.root.visible = false;
    if (equip) {
      equipWeapon(visual.spawn.weapon);
    } else if (activeWeapon === visual.spawn.weapon) {
      // A walk-over pickup can add reserve ammo without changing the active
      // slot. Do not leave that same held gun empty after the pickup.
      autoReloadActiveWeapon();
    }
    nearbyPickup = null;
    emitState(true);
    return true;
  };
  const claimPickupForBot = (pickupId: string): WeaponId | null => {
    const normalizedId = pickupId.trim();
    if (normalizedId.length === 0) {
      return null;
    }
    const visual = pickupVisuals.find((candidate) => candidate.spawn.id === normalizedId);
    if (visual === undefined || visual.collected) {
      return null;
    }
    visual.collected = true;
    visual.root.visible = false;
    if (nearbyPickup === visual.spawn.weapon) {
      nearbyPickup = null;
    }
    emitState(true);
    return visual.spawn.weapon;
  };
  const getAvailablePickups = (): readonly WeaponPickupSpawn[] =>
    pickupVisuals.filter((visual) => !visual.collected).map((visual) => visual.spawn);
  const releasePickupFromBot = (pickupId: string): boolean => {
    const normalizedId = pickupId.trim();
    if (normalizedId.length === 0) {
      return false;
    }
    const visual = pickupVisuals.find((candidate) => candidate.spawn.id === normalizedId);
    if (!visual?.collected) {
      return false;
    }
    visual.collected = false;
    visual.root.visible = true;
    emitState(true);
    return true;
  };
  const findNearestPickup = (
    position: THREE.Vector3,
  ): { readonly visual: WeaponPickupVisual; readonly distance: number } | undefined =>
    pickupVisuals
      .filter((visual) => !visual.collected)
      .map((visual) => ({ visual, distance: visual.root.position.distanceTo(position) }))
      .filter(({ distance }) => distance <= WEAPON_PICKUP_RANGE_METERS)
      .sort((left, right) => left.distance - right.distance)[0];
  const interact = (): boolean => {
    const candidate = findNearestPickup(camera.position);
    if (candidate !== undefined) {
      return collectPickup(candidate.visual, true);
    }
    return false;
  };
  const cycleWeapon = (direction: 1 | -1 = 1): boolean => {
    const owned = WEAPON_IDS.filter((weapon) => inventory.get(weapon)?.owned === true);
    if (owned.length === 0) {
      return false;
    }
    const currentIndex = activeWeapon === null ? -1 : owned.indexOf(activeWeapon);
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : owned.length - 1
        : (currentIndex + direction + owned.length) % owned.length;
    const nextWeapon = owned[nextIndex] ?? owned[0];
    if (nextWeapon === undefined) {
      return false;
    }
    const selected = equipWeapon(nextWeapon);
    emitState(true);
    return selected;
  };
  const selectWeapon = (weapon: WeaponId): boolean => {
    const selected = equipWeapon(weapon);
    if (selected) {
      emitState(true);
    }
    return selected;
  };
  const getWeaponScopeLens = (): {
    readonly anchor: THREE.Object3D;
    readonly radius: number;
    readonly magnification: number;
  } | null => {
    if (activeWeapon === null) {
      return null;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    const scope = definition.scope;
    if (scope === undefined) {
      return null;
    }
    const model = viewModels.get(activeWeapon);
    if (model?.scopeLensAnchor === null || model?.scopeLensAnchor === undefined) {
      return null;
    }
    return {
      anchor: model.scopeLensAnchor,
      radius: model.scopeLensRadius,
      magnification: scope.magnification,
    };
  };
  const removeEffect = (effect: WeaponEffect): void => {
    effect.object.removeFromParent();
    disposeObject(effect.object);
    const effectIndex = effects.indexOf(effect);
    if (effectIndex >= 0) {
      effects.splice(effectIndex, 1);
    }
    const bulletHoleIndex = bulletHoleEffects.indexOf(effect);
    if (bulletHoleIndex >= 0) {
      bulletHoleEffects.splice(bulletHoleIndex, 1);
    }
    const bloodDecalIndex = bloodDecalEffects.indexOf(effect);
    if (bloodDecalIndex >= 0) {
      bloodDecalEffects.splice(bloodDecalIndex, 1);
    }
  };
  const registerEffect = (
    object: THREE.Object3D,
    kind: WeaponEffectKind,
    remainingSeconds: number,
    opacityMultiplier = 1,
  ): void => {
    const materials: (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[] = [];
    object.traverse((child) => {
      const renderable = child as unknown as {
        readonly material?: THREE.Material | readonly THREE.Material[];
      };
      const entries: readonly THREE.Material[] =
        renderable.material === undefined
          ? []
          : renderable.material instanceof THREE.Material
            ? [renderable.material]
            : renderable.material;
      for (const material of entries) {
        if (
          material instanceof THREE.MeshBasicMaterial ||
          material instanceof THREE.LineBasicMaterial
        ) {
          materials.push(material);
        }
      }
    });
    const effect: WeaponEffect = {
      object,
      kind,
      materials,
      opacityMultiplier: Number.isFinite(opacityMultiplier)
        ? Math.max(0, Math.min(1, opacityMultiplier))
        : 1,
      remainingSeconds,
    };
    for (const material of effect.materials) {
      material.opacity = effect.opacityMultiplier;
    }
    effects.push(effect);
    if (kind === "bulletHole") {
      bulletHoleEffects.push(effect);
      while (bulletHoleEffects.length > WEAPON_BULLET_HOLE_MAX_COUNT) {
        const oldest = bulletHoleEffects[0];
        if (oldest === undefined) {
          break;
        }
        removeEffect(oldest);
      }
    }
    if (kind === "bloodDecal") {
      bloodDecalEffects.push(effect);
      while (bloodDecalEffects.length > WEAPON_BLOOD_DECAL_MAX_COUNT) {
        const oldest = bloodDecalEffects[0];
        if (oldest === undefined) {
          break;
        }
        removeEffect(oldest);
      }
    }
  };
  const reload = (): void => {
    startReload();
  };

  /**
   * Finish one reload operation. Clip weapons fill the magazine in one step;
   * high-damage weapons insert one bullet or shell and automatically continue
   * until the magazine is full or the reserve is empty.
   */
  const completeReloadOperation = (): void => {
    if (activeWeapon === null) {
      reloadingSeconds = 0;
      reloadInsertionPending = false;
      return;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    const slot = inventory.get(activeWeapon);
    if (slot === undefined) {
      reloadingSeconds = 0;
      reloadInsertionPending = false;
      return;
    }
    const needed = definition.magazineSize - slot.ammoInMagazine;
    if (needed <= 0 || slot.reserveAmmo <= 0) {
      reloadingSeconds = 0;
      reloadInsertionPending = false;
      return;
    }
    if (definition.reloadMode === "clip") {
      const loaded = Math.min(needed, slot.reserveAmmo);
      slot.ammoInMagazine += loaded;
      slot.reserveAmmo -= loaded;
      reloadingSeconds = 0;
    } else {
      slot.ammoInMagazine += 1;
      slot.reserveAmmo -= 1;
      reloadingSeconds =
        slot.ammoInMagazine < definition.magazineSize && slot.reserveAmmo > 0
          ? definition.reloadSeconds
          : 0;
    }
    // The lead-in pulse makes the insertion readable, while this reset keeps
    // its strongest frame aligned with the authoritative ammo commit.
    commitReloadInsertionImpulse();
    if (definition.reloadMode === "round" && reloadingSeconds === 0) {
      beginRoundReloadReturn();
    }
    emitState(true);
  };
  const addTracer = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    color: number,
  ): void => {
    effectStart.copy(origin).addScaledVector(direction, 0.2);
    effectEnd.copy(origin).addScaledVector(direction, distance);
    const geometry = new THREE.BufferGeometry().setFromPoints([effectStart, effectEnd]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = "WeaponTracer";
    line.userData = { weaponVisual: true, dofIgnore: true, tracer: true };
    const tracerHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 8, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    tracerHead.name = "WeaponTracerHead";
    tracerHead.position.copy(effectEnd);
    tracerHead.userData = { weaponVisual: true, dofIgnore: true, tracer: true };
    const tracer = new THREE.Group();
    tracer.name = "WeaponTracerRound";
    tracer.userData = { weaponVisual: true, dofIgnore: true, tracer: true };
    tracer.add(line, tracerHead);
    effectsRoot.add(tracer);
    registerEffect(tracer, "tracer", WEAPON_TRACER_LIFETIME_SECONDS);
  };
  const addImpact = (position: THREE.Vector3, color: number): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      toneMapped: false,
    });
    const impact = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), material);
    impact.name = "WeaponImpact";
    impact.position.copy(position);
    impact.userData = { weaponVisual: true, dofIgnore: true };
    effectsRoot.add(impact);
    registerEffect(impact, "impact", WEAPON_IMPACT_LIFETIME_SECONDS);
  };
  const addShieldSpark = (position: THREE.Vector3, direction: THREE.Vector3): void => {
    const spark = new THREE.Group();
    spark.name = "WeaponShieldSpark";
    spark.position.copy(position);
    spark.userData = { weaponVisual: true, dofIgnore: true, shieldSpark: true };
    spark.frustumCulled = false;
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: WEAPON_SHIELD_SPARK_COLOR,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), sparkMaterial);
    core.name = "WeaponShieldSparkCore";
    core.userData = { weaponVisual: true, dofIgnore: true, shieldSpark: true };
    spark.add(core);
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.14, 0, 0, -0.035, 0, 0, 0.035, 0, 0, 0.14, 0, 0, 0, -0.14, 0, 0, -0.035, 0, 0, 0.035,
          0, 0, 0.14, 0,
        ],
        3,
      ),
    );
    const streaks = new THREE.LineSegments(
      streakGeometry,
      new THREE.LineBasicMaterial({
        color: WEAPON_SHIELD_SPARK_COLOR,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    streaks.name = "WeaponShieldSparkStreaks";
    streaks.userData = { weaponVisual: true, dofIgnore: true, shieldSpark: true };
    spark.add(streaks);
    const sparkDirection = direction.clone();
    if (sparkDirection.lengthSq() <= 0.0001) {
      sparkDirection.copy(bulletHoleForward);
    } else {
      sparkDirection.normalize();
    }
    spark.quaternion.setFromUnitVectors(bulletHoleForward, sparkDirection);
    effectsRoot.add(spark);
    registerEffect(
      spark,
      "shieldSpark",
      WEAPON_SHIELD_SPARK_LIFETIME_SECONDS,
      WEAPON_SHIELD_SPARK_OPACITY,
    );
  };
  const addBloodCloud = (position: THREE.Vector3, damage: number): void => {
    const cloudScale = resolveWeaponBloodCloudScale(damage);
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({
        color: WEAPON_BLOOD_CLOUD_COLOR,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    cloud.name = "WeaponBloodCloud";
    cloud.position.copy(position);
    cloud.userData = { weaponVisual: true, bloodCloud: true };
    cloud.scale.setScalar(cloudScale);
    cloud.frustumCulled = false;
    bloodRoot.add(cloud);
    registerEffect(
      cloud,
      "bloodCloud",
      WEAPON_BLOOD_CLOUD_LIFETIME_SECONDS,
      WEAPON_BLOOD_CLOUD_OPACITY,
    );
  };
  const isCombatActorVisual = (object: THREE.Object3D): boolean => {
    let current: THREE.Object3D | null = object;
    while (current !== null) {
      if (typeof current.userData.combatActorId === "string") {
        return true;
      }
      current = current.parent;
    }
    return false;
  };
  const findBloodSurface = (
    position: THREE.Vector3,
    impactDirection: THREE.Vector3,
    targetVelocity: PhysicsVector,
  ): { readonly hit: THREE.Intersection; readonly direction: THREE.Vector3 } | null => {
    const candidates: THREE.Vector3[] = [];
    const motion = new THREE.Vector3(targetVelocity.x, targetVelocity.y, targetVelocity.z);
    if (motion.lengthSq() > 0.01) {
      candidates.push(motion.clone().normalize());
    }
    const projectile = impactDirection.clone();
    if (projectile.lengthSq() > 0.01) {
      candidates.push(projectile.normalize());
    }
    candidates.push(new THREE.Vector3(0, -1, 0));
    if (motion.lengthSq() > 0.01) {
      candidates.push(motion.clone().normalize().negate());
    }
    candidates.push(new THREE.Vector3(0, 1, 0));
    const roots = scene.children.filter(
      (object) => object.name !== "LightingRoot" && object.name !== "DebugRoot",
    );
    for (const candidate of candidates) {
      bloodSurfaceOrigin.copy(position).addScaledVector(candidate, 0.035);
      bloodSurfaceRaycaster.set(bloodSurfaceOrigin, candidate);
      bloodSurfaceRaycaster.near = 0.01;
      bloodSurfaceRaycaster.far = 3.5;
      const hit = bloodSurfaceRaycaster
        .intersectObjects(roots, true)
        .find(
          (intersection) =>
            !isWeaponVisual(intersection.object) &&
            !isCombatActorVisual(intersection.object) &&
            !(intersection.object instanceof THREE.Sprite),
        );
      if (hit !== undefined) {
        return { hit, direction: candidate.clone() };
      }
    }
    return null;
  };
  const addBloodDecal = (
    hit: THREE.Intersection,
    direction: THREE.Vector3,
    damage: number,
    targetVelocity: PhysicsVector,
  ): void => {
    resolveBulletImpactSurfaceNormal(hit, direction, surfaceNormal);
    bloodSurfaceNormal.copy(surfaceNormal);
    const cloudScale = resolveWeaponBloodCloudScale(damage);
    const smearRatio = resolveWeaponBloodSmearRatio(
      Math.hypot(targetVelocity.x, targetVelocity.y, targetVelocity.z),
    );
    const radius = 0.085 + cloudScale * 0.028;
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({
        map: bloodSplatTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    stain.name = "WeaponBloodDecal";
    stain.userData = { weaponVisual: true, bloodDecal: true };
    stain.position.copy(hit.point).addScaledVector(bloodSurfaceNormal, 0.006);
    bloodDecalQuaternion.setFromUnitVectors(bulletHoleForward, bloodSurfaceNormal);
    stain.quaternion.copy(bloodDecalQuaternion);
    bloodSmearDirection.set(targetVelocity.x, targetVelocity.y, targetVelocity.z);
    bloodSmearDirection.addScaledVector(
      bloodSurfaceNormal,
      -bloodSmearDirection.dot(bloodSurfaceNormal),
    );
    if (bloodSmearDirection.lengthSq() <= 0.0001) {
      bloodSmearDirection.copy(direction);
      bloodSmearDirection.addScaledVector(
        bloodSurfaceNormal,
        -bloodSmearDirection.dot(bloodSurfaceNormal),
      );
    }
    if (bloodSmearDirection.lengthSq() > 0.0001) {
      bloodSmearLocal.copy(bloodSmearDirection).normalize();
      bloodSmearLocal.applyQuaternion(bloodDecalQuaternion.clone().invert());
      stain.rotateZ(Math.atan2(bloodSmearLocal.y, bloodSmearLocal.x));
    }
    stain.scale.set(radius * (1 + smearRatio * 2.5), radius * (0.72 + smearRatio * 0.1), 1);
    stain.renderOrder = 50;
    stain.frustumCulled = false;
    bloodRoot.add(stain);
    registerEffect(
      stain,
      "bloodDecal",
      WEAPON_BLOOD_DECAL_LIFETIME_SECONDS,
      WEAPON_BLOOD_SPLAT_OPACITY,
    );
  };
  const addBloodHitEffects = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    damage: number,
    targetVelocity: PhysicsVector,
  ): void => {
    addBloodCloud(position, damage);
    const surface = findBloodSurface(position, direction, targetVelocity);
    if (surface !== null) {
      addBloodDecal(surface.hit, surface.direction, damage, targetVelocity);
    }
  };
  const playMeleeHitEffects = (
    position: PhysicsVector,
    direction: PhysicsVector,
    damage: number,
    response: WeaponHitResponse,
  ): void => {
    if (response.targetKind !== "simulant") {
      return;
    }
    const impactPosition = new THREE.Vector3(position.x, position.y, position.z);
    const impactDirection = new THREE.Vector3(direction.x, direction.y, direction.z);
    if (response.shieldHit === true) {
      addShieldSpark(impactPosition, impactDirection);
    }
    if (response.bloodEligible === true) {
      addBloodHitEffects(
        impactPosition,
        impactDirection,
        damage,
        response.targetVelocity ?? { x: 0, y: 0, z: 0 },
      );
    }
  };
  const resolveBulletImpactSurfaceNormal = (
    hit: THREE.Intersection,
    direction: THREE.Vector3,
    target: THREE.Vector3,
  ): void => {
    const hitObject = hit.object;
    const face = hit.face;
    hitObject.updateWorldMatrix(true, false);
    bulletHoleWorldMatrix.copy(hitObject.matrixWorld);
    if (hitObject instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      hitObject.getMatrixAt(hit.instanceId, bulletHoleInstanceMatrix);
      bulletHoleWorldMatrix.multiply(bulletHoleInstanceMatrix);
    }
    if (face !== undefined && face !== null) {
      bulletHoleNormalMatrix.getNormalMatrix(bulletHoleWorldMatrix);
      target.copy(face.normal).applyMatrix3(bulletHoleNormalMatrix).normalize();
    } else {
      target.copy(direction).multiplyScalar(-1).normalize();
    }
    if (target.lengthSq() < 0.0001) {
      target.set(0, 1, 0);
    }
    // Keep the normal pointed toward the shooter for both decals and the
    // acute impact-angle calculation, independent of triangle winding.
    if (target.dot(direction) > 0) {
      target.negate();
    }
  };
  const addBulletHole = (
    hit: THREE.Intersection,
    direction: THREE.Vector3,
    color: number,
  ): void => {
    resolveBulletImpactSurfaceNormal(hit, direction, surfaceNormal);
    // Make the mark readable at normal gameplay distances. It remains much
    // smaller than a tile or prop, but the contrasting rim prevents it from
    // disappearing into a dark or low-contrast surface.
    const radius = 0.11 + shotRandom.nextFloat() * 0.04;
    const hole = new THREE.Group();
    hole.name = "WeaponBulletHole";
    hole.userData = { weaponVisual: true, bulletHole: true };
    hole.position.copy(hit.point).addScaledVector(surfaceNormal, 0.004);
    bulletHoleQuaternion.setFromUnitVectors(bulletHoleForward, surfaceNormal);
    hole.quaternion.copy(bulletHoleQuaternion);
    hole.rotateZ(shotRandom.nextFloat() * Math.PI * 2);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 12),
      new THREE.MeshBasicMaterial({
        color: 0x050708,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    disc.name = "WeaponBulletHoleDisc";
    disc.userData = { weaponVisual: true, bulletHole: true };
    hole.add(disc);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.82, radius * 0.1, 6, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0xd7e0de), 0.42),
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    rim.name = "WeaponBulletHoleRim";
    rim.position.z = 0.001;
    rim.userData = { weaponVisual: true, bulletHole: true };
    hole.add(rim);
    disc.renderOrder = 50;
    rim.renderOrder = 51;
    hole.renderOrder = 50;
    hole.frustumCulled = false;
    bulletHoleRoot.add(hole);
    registerEffect(hole, "bulletHole", WEAPON_BULLET_HOLE_LIFETIME_SECONDS);
  };
  const findWeaponHit = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance?: number,
  ): THREE.Intersection | undefined => {
    shotRaycaster.set(origin, direction);
    // Shots are hitscan and continue until the first render surface. Keep the
    // raycaster unbounded instead of applying a weapon-specific distance cap.
    shotRaycaster.far =
      maxDistance === undefined || maxDistance < 0 ? Number.POSITIVE_INFINITY : maxDistance;
    try {
      // Chunks and other streamed render roots can be added after weapon
      // construction. Resolve the current scene children for every shot so
      // the hit list always matches what the player can see.
      const liveRaycastRoots = scene.children.filter(
        (object) => object.name !== "LightingRoot" && object.name !== "DebugRoot",
      );
      return shotRaycaster
        .intersectObjects(liveRaycastRoots, true)
        .find((intersection) => isWeaponRaycastSurface(intersection.object));
    } catch {
      // A malformed or concurrently-disposed render subtree must not take
      // down the interactive scene. The tracer still renders to the camera's
      // finite view distance as a presentation-only miss fallback.
      return undefined;
    }
  };
  const fireFrom = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    weapon: WeaponId,
    options: WeaponFireFromOptions = {},
  ): void => {
    const definition = WEAPON_DEFINITIONS[weapon];
    const spreadRadians = options.spreadRadians ?? resolveWeaponSpreadRadians(definition);
    const random = options.random ?? shotRandom;
    const maxDistance = options.maxDistance;
    const baseDirection = direction.clone().normalize();
    if (baseDirection.lengthSq() <= 0) {
      return;
    }
    const useCameraMuzzle = options.showCameraMuzzle ?? false;
    const useWorldEffects = options.showWorldEffects ?? true;
    const shouldPlayAudio = options.playAudio === true;
    const shouldPlayPassByAudio = options.playPassByAudio !== false;
    const shouldTrackShotHits = options.trackShotHits === true;
    const onHit = options.onHit ?? null;
    const onTargetHit = options.onTargetHit ?? null;
    const applyTargetHit = onTargetHit !== null;
    const weaponModel = viewModels.get(weapon);
    const viewModel = useCameraMuzzle ? weaponModel : undefined;
    const shotProfile = resolveGunAudioProfile({
      damage: definition.damage,
      barrelLength: weaponModel?.hotBarrelLength ?? GUN_AUDIO_MIN_BARREL_LENGTH_METERS,
    });
    if (useCameraMuzzle) {
      scene.updateMatrixWorld(true);
    }
    if (useCameraMuzzle && viewModel !== undefined) {
      updateWeaponSmokeWorldFrame(viewModel, 0);
    }
    if (shouldPlayAudio) {
      const soundOrigin = viewModel?.muzzleWorldPosition ?? origin;
      playWeaponShotSound(shotProfile, soundOrigin);
    }
    if (useCameraMuzzle && viewModel !== undefined) {
      // A new round replaces the previous gunshot gas immediately. Thermal
      // wisps are a separate heat signal and continue through the shot.
      clearAllGunshotSmoke();
      viewModel.muzzleFlash.visible = true;
      viewModel.muzzleFlash.scale.setScalar(1.2 + shotRandom.nextFloat() * 0.7);
      if (viewModel.muzzleFlashLight !== null) {
        viewModel.muzzleFlashLight.visible = true;
        viewModel.muzzleFlashLight.intensity = WEAPON_MUZZLE_FLASH_LIGHT_INTENSITY;
      }
      const smokePower = resolveWeaponSmokePower(definition.totalDamagePerShot);
      for (let puff = 0; puff < WEAPON_MUZZLE_SMOKE_PARTICLE_COUNT; puff += 1) {
        spawnWeaponSmoke(viewModel, false, smokePower);
      }
    }
    let targetWasHit = false;
    for (let pellet = 0; pellet < definition.pellets; pellet += 1) {
      pelletDirection.copy(baseDirection);
      if (spreadRadians > 0) {
        const angle = random.nextFloat() * Math.PI * 2;
        const radius = Math.sqrt(random.nextFloat()) * spreadRadians;
        rightVector.crossVectors(baseDirection, new THREE.Vector3(0, 1, 0));
        if (rightVector.lengthSq() < 0.0001) {
          rightVector.crossVectors(baseDirection, new THREE.Vector3(1, 0, 0));
        }
        rightVector.normalize();
        upVector.crossVectors(rightVector, baseDirection).normalize();
        pelletDirection
          .addScaledVector(rightVector, Math.cos(angle) * radius)
          .addScaledVector(upVector, Math.sin(angle) * radius)
          .normalize();
      }
      const hit = findWeaponHit(origin, pelletDirection, maxDistance);
      const distance = hit?.distance ?? maxDistance ?? camera.far;
      // Audio follows the intended projectile path rather than stopping at an
      // intervening render surface. Otherwise a table or wall can swallow an
      // incoming near-miss before the listener ever hears the whizz.
      const passByDistance = maxDistance ?? distance;
      if (useWorldEffects) {
        addTracer(origin, pelletDirection, distance, definition.color);
      }
      if (shouldPlayPassByAudio) {
        playWeaponPassBySound(shotProfile, origin, pelletDirection, passByDistance);
      }
      if (hit !== undefined) {
        if (shouldTrackShotHits) {
          shotsHit += 1;
        }
        addWeaponHitHeat(definition.id, definition.damage);
        const hitResponse = onHit?.(hit.object, definition.damage, {
          direction: {
            x: pelletDirection.x,
            y: pelletDirection.y,
            z: pelletDirection.z,
          },
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          distance: hit.distance,
          pelletIndex: pellet,
          projectileCount: definition.pellets,
          ...(hit.instanceId === undefined ? {} : { instanceIndex: hit.instanceId }),
        });
        if (shouldPlayAudio) {
          resolveBulletImpactSurfaceNormal(hit, pelletDirection, surfaceNormal);
          playWeaponImpactSound(
            resolveBulletImpactAudioProfile({
              damage: definition.damage,
              impactAngleRadians: resolveBulletImpactAngleRadians(
                pelletDirection.dot(surfaceNormal),
              ),
            }),
            hit.point,
          );
        }
        if (useWorldEffects) {
          if (hitResponse?.targetKind === "simulant") {
            if (hitResponse.shieldHit === true) {
              addShieldSpark(hit.point, pelletDirection);
            }
            if (hitResponse.bloodEligible === true) {
              addBloodHitEffects(
                hit.point,
                pelletDirection,
                definition.damage,
                hitResponse.targetVelocity ?? { x: 0, y: 0, z: 0 },
              );
            }
          } else {
            addImpact(hit.point, definition.color);
            addBulletHole(hit, pelletDirection, definition.color);
          }
        }
        hitColor.set(definition.color);
        hit.object.userData.lastWeaponHit = {
          weapon: definition.id,
          damage: definition.damage,
          stoppingPower: resolveWeaponStoppingPower(definition.damage),
          color: hitColor.getHexString(),
        };
      } else if (applyTargetHit && maxDistance !== undefined && !targetWasHit) {
        targetWasHit = true;
        onTargetHit();
      }
    }
  };

  /** Resolve one close-range gun strike through the normal ray/actor seam. */
  const resolveMeleeHit = (): void => {
    const actionAimRay = meleeAimRay;
    meleeAimRay = null;
    if (activeWeapon === null || actionAimRay === null) {
      return;
    }
    const attributes = resolveWeaponMeleeAttributes(activeWeapon);
    const direction = actionAimRay.direction.clone().normalize();
    if (direction.lengthSq() <= 0.0001) {
      return;
    }
    const hit = findWeaponHit(actionAimRay.origin, direction, attributes.rangeMeters);
    if (hit === undefined) {
      return;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    playMeleeImpactSound(attributes, hit.point);
    addImpact(hit.point, definition.color);
    const hitResponse = onWeaponHit?.(hit.object, attributes.damage, {
      direction: { x: direction.x, y: direction.y, z: direction.z },
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      distance: hit.distance,
      pelletIndex: 0,
      projectileCount: 1,
      mode: "melee",
      attackerVelocity: latestWorldVelocity,
      attackerAirborne: latestAirborne,
      meleeSwingSpeedRadiansPerSecond: attributes.swingSpeedRadiansPerSecond,
      meleeStoppingPower: attributes.stoppingPower,
      ...(hit.instanceId === undefined ? {} : { instanceIndex: hit.instanceId }),
    });
    const resolvedDamage = hitResponse?.resolvedDamage ?? attributes.damage;
    if (hitResponse?.targetKind === "simulant") {
      playMeleeHitEffects(hit.point, direction, resolvedDamage, hitResponse);
    }
    hit.object.userData.lastMeleeHit = {
      weapon: definition.id,
      damage: resolvedDamage,
      stoppingPower: attributes.stoppingPower,
      volumeM3: attributes.volumeM3,
      swingSpeedRadiansPerSecond: attributes.swingSpeedRadiansPerSecond,
    };
  };

  const tryMelee = (): boolean => {
    if (
      !controlsActive ||
      activeWeapon === null ||
      switchAnimation !== null ||
      viewmodelTransitionActive ||
      meleeSwinging ||
      latestAimRay === null
    ) {
      return false;
    }
    if (shouldInterruptReloadForMelee(isReloadPresentationActive())) {
      // Gun melee is an explicit reload cancel. Clear the timer and any
      // round-reload return pose so the swing starts from a clean viewmodel;
      // rounds committed before the interruption remain in the magazine.
      reloadingSeconds = 0;
      resetRoundReloadPresentation();
      emitState(true);
    }
    const attributes = resolveWeaponMeleeAttributes(activeWeapon);
    meleeSwingDirection = meleeNextSwingDirection;
    meleeNextSwingDirection =
      meleeSwingDirection === "right-to-left" ? "left-to-right" : "right-to-left";
    meleeSwingDurationSeconds =
      MELEE_SWING_ARC_RADIANS / attributes.swingSpeedRadiansPerSecond +
      MELEE_SWING_RECOVERY_SECONDS;
    meleeSwingElapsedSeconds = 0;
    meleeSwingHitResolved = false;
    meleeAimRay = snapshotActionAimRay(latestAimRay);
    meleeSwinging = true;
    // Gun melee uses the same exertion and shared camera/reticule impulse path
    // as a picked-up melee object. It does not consume ammunition or increment
    // projectile telemetry.
    if (onWeaponMeleeSwing !== undefined) {
      onWeaponMeleeSwing(attributes.damage);
    } else {
      onWeaponShot?.(attributes.damage, 1);
    }
    playMeleeSwingSound(attributes, camera.position, meleeSwingDurationSeconds);
    return true;
  };

  const tryFire = (canStartBurst: boolean): void => {
    if (
      !controlsActive ||
      activeWeapon === null ||
      switchAnimation !== null ||
      viewmodelTransitionActive ||
      meleeSwinging ||
      fireCooldownSeconds > 0
    ) {
      return;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    const startingBurst = burstShotsRemaining <= 0;
    if (startingBurst && !canStartBurst) {
      return;
    }
    const triggerProfile = startingBurst
      ? resolveWeaponTriggerProfile(definition, reticleEnabled)
      : null;
    const slot = inventory.get(activeWeapon);
    if (slot === undefined) {
      return;
    }
    if (slot.ammoInMagazine <= 0) {
      burstShotsRemaining = 0;
      reload();
      return;
    }
    if (triggerProfile?.requiresTriggerRelease && triggerReleaseLocked) {
      return;
    }
    if (latestAimRay === null) {
      return;
    }
    if (reloadingSeconds > 0 && !canInterruptWeaponReload(definition, slot.ammoInMagazine)) {
      return;
    }
    if (triggerProfile !== null) {
      burstShotsRemaining = triggerProfile.burstSize;
      burstCooldownAfterCurrentBurstSeconds = triggerProfile.burstCooldownSeconds;
      if (triggerProfile.requiresTriggerRelease) {
        triggerReleaseLocked = true;
      }
    }
    // A held fire input cancels a round reload as soon as a shell or bullet
    // has been chambered. Clip reloads remain atomic and cannot be cancelled.
    if (reloadingSeconds > 0) {
      beginRoundReloadReturn();
    }
    reloadingSeconds = 0;
    slot.ammoInMagazine -= 1;
    burstShotsRemaining = Math.max(0, burstShotsRemaining - 1);
    fireCooldownSeconds =
      burstShotsRemaining > 0
        ? definition.fireIntervalSeconds
        : burstCooldownAfterCurrentBurstSeconds;
    muzzleFlashSeconds = WEAPON_MUZZLE_FLASH_LIFETIME_SECONDS;
    onWeaponShot?.(definition.damage, definition.pellets);
    shotsFired += 1;
    const baseDirection = latestAimRay.direction.clone().normalize();
    const fireOptions: WeaponFireFromOptions = {
      random: shotRandom,
      spreadRadians: resolveWeaponSpreadRadians(definition),
      showCameraMuzzle: true,
      playAudio: true,
      showWorldEffects: true,
      trackShotHits: true,
      ...(onWeaponHit === undefined ? {} : { onHit: onWeaponHit }),
    };
    fireFrom(latestAimRay.origin, baseDirection, activeWeapon, fireOptions);
    emitState(true);
  };
  const update = (
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    aimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 },
    getPresentationAimRay: () => {
      readonly origin: THREE.Vector3;
      readonly direction: THREE.Vector3;
    },
    active: boolean,
    visibleInView: boolean,
    viewmodelOffset: CameraViewmodelOffset,
    getViewmodelRecoilDepth: () => number,
    viewmodelTransition: CameraViewmodelTransition,
    meleeActive: boolean,
    worldVelocity: PhysicsVector,
    airborne: boolean,
  ): void => {
    controlsActive = active;
    viewActive = visibleInView;
    latestAimRay = aimRay;
    latestWorldVelocity = worldVelocity;
    latestAirborne = airborne;
    if (shotAudioContext !== null && shotAudioContext.state !== "closed") {
      // Keep active tails and pass-by voices attached to the moving listener,
      // not just to the camera pose from the frame that spawned them.
      updateShotAudioListener(shotAudioContext);
    }
    // Traversal state arrives from the shared camera damper before firing or
    // reload input is processed for this frame.
    viewmodelTransitionActive = viewmodelTransition.phase !== "idle";
    coolWeaponBarrels(deltaSeconds);
    fireCooldownSeconds = Math.max(0, fireCooldownSeconds - deltaSeconds);
    const reloadDeltaSeconds = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (Number.isFinite(reloadInsertionImpulseElapsedSeconds)) {
      reloadInsertionImpulseElapsedSeconds += reloadDeltaSeconds;
      if (reloadInsertionImpulseElapsedSeconds >= WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS) {
        reloadInsertionImpulseElapsedSeconds = Number.POSITIVE_INFINITY;
      }
    }
    const activeReloadDefinition = activeWeapon === null ? null : WEAPON_DEFINITIONS[activeWeapon];
    const reloadInsertionLeadSeconds =
      activeReloadDefinition === null
        ? 0
        : Math.min(
            WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS,
            activeReloadDefinition.reloadSeconds,
          );
    if (
      activeReloadDefinition !== null &&
      reloadingSeconds > 0 &&
      !reloadInsertionPending &&
      reloadingSeconds <= reloadInsertionLeadSeconds
    ) {
      triggerReloadInsertionImpulse();
    }
    const roundReloadWasReturning =
      activeReloadDefinition?.reloadMode === "round" && roundReloadReturnElapsedSeconds !== null;
    if (
      activeReloadDefinition?.reloadMode === "round" &&
      reloadingSeconds > 0 &&
      roundReloadReturnElapsedSeconds === null
    ) {
      const liftDurationSeconds =
        activeReloadDefinition.reloadSeconds * WEAPON_RELOAD_LIFT_FRACTION;
      roundReloadLiftElapsedSeconds = Math.min(
        liftDurationSeconds,
        roundReloadLiftElapsedSeconds + reloadDeltaSeconds,
      );
    }
    let remainingReloadDeltaSeconds = reloadDeltaSeconds;
    if (reloadingSeconds > 0) {
      while (reloadingSeconds > 0 && remainingReloadDeltaSeconds >= reloadingSeconds) {
        remainingReloadDeltaSeconds -= reloadingSeconds;
        reloadingSeconds = 0;
        completeReloadOperation();
      }
      if (reloadingSeconds > 0) {
        reloadingSeconds = Math.max(0, reloadingSeconds - remainingReloadDeltaSeconds);
        remainingReloadDeltaSeconds = 0;
      }
    }
    if (
      activeReloadDefinition?.reloadMode === "round" &&
      roundReloadReturnElapsedSeconds !== null
    ) {
      const returnDeltaSeconds = roundReloadWasReturning
        ? reloadDeltaSeconds
        : remainingReloadDeltaSeconds;
      roundReloadReturnElapsedSeconds += returnDeltaSeconds;
      const returnDurationSeconds =
        activeReloadDefinition.reloadSeconds * WEAPON_RELOAD_RETURN_FRACTION;
      if (roundReloadReturnElapsedSeconds >= returnDurationSeconds) {
        resetRoundReloadPresentation();
      }
    }
    if (fireHeld || burstShotsRemaining > 0) {
      tryFire(fireHeld || burstShotsRemaining > 0);
    }
    const meleeDeltaSeconds = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (meleeSwinging) {
      meleeSwingElapsedSeconds += meleeDeltaSeconds;
      const progress = Math.min(
        1,
        meleeSwingElapsedSeconds / Math.max(0.001, meleeSwingDurationSeconds),
      );
      if (!meleeSwingHitResolved && progress >= 0.5) {
        meleeSwingHitResolved = true;
        resolveMeleeHit();
      }
      if (progress >= 1) {
        meleeSwinging = false;
        meleeSwingElapsedSeconds = 0;
        meleeAimRay = null;
      }
    }
    const presentationAimRay = getPresentationAimRay();
    latestAimRay = presentationAimRay;
    const viewmodelRecoilDepth = getViewmodelRecoilDepth();
    for (const visual of pickupVisuals) {
      if (visual.collected) {
        continue;
      }
      visual.root.rotation.y += deltaSeconds * 0.65;
      visual.root.position.y =
        visual.baseY + Math.sin(performance.now() * 0.002 + visual.root.id) * 0.055;
    }
    const horizontalDistanceMoved = pickupPositionInitialized
      ? Math.hypot(
          cameraPosition.x - lastPickupCheckPosition.x,
          cameraPosition.z - lastPickupCheckPosition.z,
        )
      : 0;
    lastPickupCheckPosition.copy(cameraPosition);
    pickupPositionInitialized = true;
    const nearest = findNearestPickup(cameraPosition);
    // Walking through the expanded pickup radius stores the closest gun while
    // melee is drawn (or another gun is already active). E/number selection
    // remains the deliberate handoff action.
    if (controlsActive && horizontalDistanceMoved > 0.001 && nearest !== undefined) {
      collectPickup(nearest.visual, shouldEquipWalkOverGun(meleeActive, activeWeapon !== null));
    }
    const nextNearby = findNearestPickup(cameraPosition)?.visual.spawn.weapon ?? null;
    if (nextNearby !== nearbyPickup) {
      nearbyPickup = nextNearby;
      emitState();
    }
    muzzleFlashSeconds = Math.max(0, muzzleFlashSeconds - deltaSeconds);
    resolveViewmodelAimTargetLocal(
      camera.matrixWorldInverse,
      presentationAimRay,
      WEAPON_VIEWMODEL_AIM_DISTANCE,
      weaponAimTargetLocal,
    );
    const effectiveViewmodelTransition =
      viewmodelTransition.phase === "idle" &&
      switchStartedSinceLastUpdate &&
      switchAnimation !== null
        ? resolveCameraViewmodelTransition(0, switchAnimation.fromWeapon !== null)
        : viewmodelTransition;
    viewmodelTransitionActive = effectiveViewmodelTransition.phase !== "idle";
    switchStartedSinceLastUpdate = false;
    let visibleWeapon = activeWeapon;
    if (switchAnimation !== null) {
      if (effectiveViewmodelTransition.phase === "lowering") {
        visibleWeapon = switchAnimation.fromWeapon;
      } else if (effectiveViewmodelTransition.phase === "raising") {
        visibleWeapon = switchAnimation.toWeapon;
      } else {
        switchAnimation = null;
      }
    }
    // Weapon switches and traversal both use the same camera-damper pose. A
    // traversal has no switchAnimation, but its lower/raise output still must
    // reach the camera-child model.
    const viewmodelPose =
      effectiveViewmodelTransition.phase === "idle" ? null : effectiveViewmodelTransition;
    if (smokeAccumulatorWeapon !== visibleWeapon) {
      smokeAccumulatorWeapon = visibleWeapon;
      smokeSpawnAccumulator = 0;
    }
    for (const [weapon, model] of viewModels) {
      const visible = viewActive && weapon === visibleWeapon;
      model.root.visible = visible;
      if (!visible) {
        model.muzzleFlash.visible = false;
        if (model.muzzleFlashLight !== null) {
          model.muzzleFlashLight.visible = false;
          model.muzzleFlashLight.intensity = 0;
        }
        // Existing world smoke continues diffusing after a switch, holster,
        // or camera move. Do not emit new thermal wisps from a hidden barrel.
        updateWeaponSmoke(model, weapon, deltaSeconds, false);
        continue;
      }
      const definition = WEAPON_DEFINITIONS[weapon];
      const insertionImpulseElapsedSeconds = Number.isFinite(reloadInsertionImpulseElapsedSeconds)
        ? reloadInsertionImpulseElapsedSeconds
        : undefined;
      const isActiveRoundReload =
        weapon === activeWeapon &&
        definition.reloadMode === "round" &&
        (reloadingSeconds > 0 || roundReloadReturnElapsedSeconds !== null);
      const reloadPose = isActiveRoundReload
        ? resolveWeaponRoundReloadPose(
            roundReloadLiftElapsedSeconds,
            definition.reloadSeconds,
            roundReloadReturnElapsedSeconds,
            insertionImpulseElapsedSeconds,
          )
        : weapon === activeWeapon && reloadingSeconds > 0
          ? resolveWeaponReloadPose(
              definition.reloadSeconds - reloadingSeconds,
              definition.reloadSeconds,
              { insertionImpulseElapsedSeconds },
            )
          : weapon === activeWeapon && insertionImpulseElapsedSeconds !== undefined
            ? resolveWeaponReloadPose(definition.reloadSeconds, definition.reloadSeconds, {
                insertionImpulseElapsedSeconds,
              })
            : null;
      const meleePose =
        weapon === activeWeapon && meleeSwinging
          ? resolveMeleeSwingPose(
              Math.min(1, meleeSwingElapsedSeconds / Math.max(0.001, meleeSwingDurationSeconds)),
              meleeSwingDirection,
            )
          : null;
      model.root.position.x =
        viewmodelOffset.x +
        (viewmodelPose?.offset.x ?? 0) +
        (reloadPose?.lateralOffset ?? 0) +
        (meleePose?.offsetX ?? 0);
      model.root.position.y =
        viewmodelOffset.y +
        (viewmodelPose?.offset.y ?? 0) +
        (reloadPose?.verticalOffset ?? 0) +
        (meleePose?.offsetY ?? 0);
      model.root.position.z =
        viewmodelOffset.z +
        (viewmodelPose?.offset.z ?? 0) +
        viewmodelRecoilDepth * 0.07 +
        (reloadPose?.depthOffset ?? 0) +
        (meleePose?.offsetZ ?? 0);
      weaponAimDirectionLocal.copy(weaponAimTargetLocal).sub(model.root.position);
      if (weaponAimDirectionLocal.lengthSq() > 0.0001) {
        weaponAimDirectionLocal.normalize();
        weaponAimQuaternion.setFromUnitVectors(weaponForward, weaponAimDirectionLocal);
        model.root.quaternion.copy(weaponAimQuaternion);
        if (viewmodelPose !== null) {
          weaponReloadEuler.set(
            viewmodelPose.pitchRadians,
            viewmodelPose.yawRadians,
            viewmodelPose.rollRadians,
          );
          weaponReloadQuaternion.setFromEuler(weaponReloadEuler);
          model.root.quaternion.multiply(weaponReloadQuaternion);
        } else if (reloadPose !== null) {
          weaponReloadEuler.set(reloadPose.pitchRadians, 0, reloadPose.rollRadians);
          weaponReloadQuaternion.setFromEuler(weaponReloadEuler);
          model.root.quaternion.multiply(weaponReloadQuaternion);
        }
        if (meleePose !== null) {
          weaponReloadEuler.set(
            meleePose.pitchRadians,
            meleePose.yawRadians,
            meleePose.rollRadians,
          );
          weaponReloadQuaternion.setFromEuler(weaponReloadEuler);
          model.root.quaternion.multiply(weaponReloadQuaternion);
        }
        // The camera child already inherits the shared damper, and this root
        // is aimed at the live reticule ray. Do not add a second breathing
        // oscillator here or the sights will drift away from that ray.
      }
      model.muzzleFlash.visible = muzzleFlashSeconds > 0;
      if (model.muzzleFlashLight !== null) {
        const lightRatio = resolveWeaponMuzzleFlashLightRatio(muzzleFlashSeconds);
        model.muzzleFlashLight.visible = lightRatio > 0;
        model.muzzleFlashLight.intensity = WEAPON_MUZZLE_FLASH_LIGHT_INTENSITY * lightRatio;
      }
      updateWeaponSmoke(model, weapon, deltaSeconds);
    }
    const bulletHoleCountBeforeCleanup = bulletHoleEffects.length;
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      if (effect === undefined) {
        continue;
      }
      effect.remainingSeconds -= deltaSeconds;
      const opacity = resolveWeaponEffectOpacity(effect.kind, effect.remainingSeconds);
      for (const material of effect.materials) {
        material.opacity = opacity * effect.opacityMultiplier;
      }
      if (effect.remainingSeconds <= 0) {
        removeEffect(effect);
      }
    }
    if (bulletHoleEffects.length !== bulletHoleCountBeforeCleanup) {
      emitState();
    }
  };
  const setFireHeld = (held: boolean): void => {
    fireHeld = held;
    if (!held) {
      triggerReleaseLocked = false;
      muzzleFlashSeconds = Math.min(muzzleFlashSeconds, 0.035);
    }
  };
  const setReticleEnabled = (enabled: boolean): void => {
    reticleEnabled = enabled;
  };
  const interruptReload = (): void => {
    if (reloadingSeconds <= 0) {
      return;
    }
    if (activeWeapon !== null && WEAPON_DEFINITIONS[activeWeapon].reloadMode === "round") {
      beginRoundReloadReturn();
    }
    reloadingSeconds = 0;
  };
  const dropActiveWeapon = (): void => {
    // Fixed weapons remain in the six-slot armory. The old parametric toss
    // action is intentionally inactive while this roster is selected.
  };
  const recordDeath = (): void => {
    fireHeld = false;
    meleeSwinging = false;
    meleeSwingElapsedSeconds = 0;
    meleeSwingHitResolved = false;
    meleeAimRay = null;
    triggerReleaseLocked = false;
    burstShotsRemaining = 0;
    burstCooldownAfterCurrentBurstSeconds = 0;
    interruptReload();
  };
  const dispose = (): void => {
    meleeAimRay = null;
    pickupRoot.removeFromParent();
    effectsRoot.removeFromParent();
    worldSmokeRoot.removeFromParent();
    bulletHoleRoot.removeFromParent();
    bloodRoot.removeFromParent();
    for (const model of viewModels.values()) {
      resetWeaponSmoke(model);
      camera.remove(model.root);
      disposeObject(model.root);
    }
    disposeObject(pickupRoot);
    disposeObject(effectsRoot);
    disposeObject(worldSmokeRoot);
    disposeObject(bulletHoleRoot);
    disposeObject(bloodRoot);
    weaponSmokeTexture.dispose();
    bloodSplatTexture.dispose();
    effects.length = 0;
    bulletHoleEffects.length = 0;
    bloodDecalEffects.length = 0;
    const audioContext = shotAudioContext;
    shotAudioContext = null;
    shotAudioMasterGain = null;
    shotAudioNoiseBuffer = null;
    if (audioContext !== null) {
      void audioContext.close().catch(() => undefined);
    }
  };
  emitState(true);
  return {
    update,
    setFireHeld,
    setReticleEnabled,
    fire: (aimRay) => {
      latestAimRay = aimRay;
      tryFire(true);
    },
    melee: (aimRay) => {
      latestAimRay = aimRay;
      return tryMelee();
    },
    fireFrom: (origin, direction, weapon, options) => {
      fireFrom(origin, direction, weapon, options);
    },
    playMeleeSwingSound,
    playMeleeImpactSound,
    playMeleeHitEffects,
    reload,
    interruptReload,
    isReloading: isReloadPresentationActive,
    interact,
    holster: holsterWeapon,
    cycleWeapon,
    cycleWeaponTo: selectWeapon,
    dropActiveWeapon,
    claimPickupForBot,
    getAvailablePickups,
    releasePickupFromBot,
    recordDeath,
    getWeaponScopeLens,
    getSniperScopeLens: getWeaponScopeLens,
    getSnapshot,
    dispose,
  };
};

interface MeleeViewModelResources {
  readonly root: THREE.Group;
  readonly object: THREE.Mesh;
}

interface MeleeImpactEffect {
  readonly object: THREE.Mesh;
  remainingSeconds: number;
}

/**
 * Runtime for claiming the same seeded knockable props used by the world
 * ragdoll path. It deliberately lives beside the gun runtime so both tools
 * share the reticle, camera-child viewmodel, and pointer input without
 * changing the authoritative physics representation.
 */
const createMeleeRuntime = (
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  explorationWorld: ExplorationWorld,
  onStateChange?: (state: MeleeStateSnapshot) => void,
  onMeleeSwing?: (damage: number) => number,
  onMeleeHit?: (
    hitObject: THREE.Object3D,
    damage: number,
    context: MeleeHitContext,
  ) => number | null,
  onMeleeSwingSound?: (
    attributes: MeleeObjectSnapshot,
    sourcePosition: THREE.Vector3,
    swingDurationSeconds: number,
  ) => void,
  onMeleeImpactSound?: (attributes: MeleeObjectSnapshot, sourcePosition: THREE.Vector3) => void,
  onMeleeEquip?: (redrawingClaimedObject: boolean) => void,
): MeleeRuntime => {
  const effectRoot = new THREE.Group();
  effectRoot.name = "MeleeEffectsRoot";
  effectRoot.userData = { weaponVisual: true, dofIgnore: true };
  scene.add(effectRoot);
  const impactEffects: MeleeImpactEffect[] = [];
  const raycaster = new THREE.Raycaster();
  raycaster.camera = camera;
  const aimTargetLocal = new THREE.Vector3();
  const aimDirectionLocal = new THREE.Vector3();
  const aimQuaternion = new THREE.Quaternion();
  const objectForward = new THREE.Vector3(0, 0, -1);
  const latestCameraPosition = new THREE.Vector3();
  const latestAimDirection = new THREE.Vector3(0, 0, -1);
  const dropDirection = new THREE.Vector3();
  const dropPosition = new THREE.Vector3();
  let activePickup: ExplorationMeleePickup | null = null;
  // A carried prop can be stashed while a gun is selected. It remains claimed
  // in the world simulation, but only the drawn item is active for input and
  // presentation.
  let drawn = false;
  let viewModel: MeleeViewModelResources | null = null;
  let nearby: MeleeStateSnapshot["nearby"] = null;
  let swinging = false;
  let swingElapsedSeconds = 0;
  let swingDurationSeconds = 0;
  let swingDirection: MeleeSwingDirection = "right-to-left";
  let nextSwingDirection: MeleeSwingDirection = "right-to-left";
  let swingHitResolved = false;
  let idleElapsedSeconds = 0;
  let swings = 0;
  let hits = 0;
  let lastDamage = 0;
  let lastOxygenCost = 0;
  let fireHeld = false;
  let controlsActive = false;
  let viewActive = false;
  let latestAimRay: {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  } | null = null;
  let swingAimRay: {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  } | null = null;
  let latestWorldVelocity: PhysicsVector = { x: 0, y: 0, z: 0 };
  let latestAirborne = false;
  let latestViewmodelOffset: CameraViewmodelOffset = { x: 0, y: 0, z: 0 };
  let latestViewmodelTransition: CameraViewmodelTransition = {
    phase: "idle",
    progress: 1,
    offset: { x: 0, y: 0, z: 0 },
    pitchRadians: 0,
    yawRadians: 0,
    rollRadians: 0,
  };
  let lastSerializedSnapshot = "";

  const getSnapshot = (): MeleeStateSnapshot => ({
    active: drawn ? (activePickup?.snapshot ?? null) : null,
    nearby,
    swinging,
    swings,
    hits,
    lastDamage,
    lastOxygenCost,
  });
  const emitState = (force = false): void => {
    const snapshot = getSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (force || serialized !== lastSerializedSnapshot) {
      lastSerializedSnapshot = serialized;
      onStateChange?.(snapshot);
    }
  };

  const disposeViewModel = (): void => {
    if (viewModel === null) {
      return;
    }
    camera.remove(viewModel.root);
    disposeObject(viewModel.root);
    viewModel = null;
  };
  const createViewModel = (
    pickup: ExplorationMeleePickup,
    sourceMatrix?: THREE.Matrix4,
  ): MeleeViewModelResources => {
    const root = new THREE.Group();
    root.name = `MeleeObject:${String(pickup.objectId)}`;
    root.userData = { weaponVisual: true, dofIgnore: true };
    const instanceMatrix = sourceMatrix?.clone() ?? new THREE.Matrix4();
    if (sourceMatrix === undefined) {
      pickup.mesh.getMatrixAt(pickup.index, instanceMatrix);
    }
    const instanceScale = new THREE.Vector3();
    // A knocked or dropped prop's matrix can contain an arbitrary ragdoll
    // rotation. Keep its scale for the full-size viewmodel, but deliberately
    // discard that transient quaternion; pickup should always normalize the
    // held object back to its canonical upright grip.
    instanceMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), instanceScale);
    // Use the source InstancedMesh geometry/material instead of inventing a
    // proxy shape. The instance matrix supplies the prop's proportions and
    // full world size; orientation is rebuilt from its canonical axis below.
    const geometry = pickup.mesh.geometry.clone();
    geometry.computeBoundingBox();
    const sourceSize = new THREE.Vector3();
    geometry.boundingBox?.getSize(sourceSize);
    const scaledSourceSize = sourceSize.multiply(
      new THREE.Vector3(
        Math.abs(instanceScale.x),
        Math.abs(instanceScale.y),
        Math.abs(instanceScale.z),
      ),
    );
    const longestAxis = new THREE.Vector3(1, 0, 0);
    if (scaledSourceSize.y > scaledSourceSize.x && scaledSourceSize.y >= scaledSourceSize.z) {
      longestAxis.set(0, 1, 0);
    } else if (scaledSourceSize.z > scaledSourceSize.x) {
      longestAxis.set(0, 0, 1);
    }
    const uprightGripQuaternion = new THREE.Quaternion().setFromUnitVectors(
      longestAxis,
      new THREE.Vector3(0, 1, 0),
    );
    const sourceLength = Math.max(scaledSourceSize.x, scaledSourceSize.y, scaledSourceSize.z);
    const sourceMaterial = pickup.mesh.material;
    const material = Array.isArray(sourceMaterial)
      ? sourceMaterial.map((entry) => entry.clone())
      : sourceMaterial.clone();
    const object = new THREE.Mesh(geometry, material);
    object.name = "MeleeRagdollObject";
    // Put the player's hand near the butt end of the full-size source prop.
    // The center is offset along the now-upright source axis so the bottom of
    // a pole sits at the hand instead of pivoting around its center of mass.
    object.position.set(0, sourceLength * 0.38, -0.1);
    // Keep the longest source axis upright. The shared swing pose can then
    // present bats, signs, pipes, and cones from their natural grip axis
    // instead of laying every item sideways like a generic blade.
    object.quaternion.copy(uprightGripQuaternion);
    object.scale.copy(instanceScale);
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData = {
      weaponVisual: true,
      dofIgnore: true,
      meleeObjectId: pickup.objectId,
      meleeDamage: pickup.snapshot.damage,
      meleeVolumeM3: pickup.snapshot.volumeM3,
    };
    root.add(object);
    root.add(createRightHandViewModel());
    root.position.set(
      CAMERA_VIEWMODEL_STANDING_OFFSET.x + 0.12,
      CAMERA_VIEWMODEL_STANDING_OFFSET.y - 0.08,
      CAMERA_VIEWMODEL_STANDING_OFFSET.z - 0.08,
    );
    root.visible = false;
    camera.add(root);
    return { root, object };
  };

  /** Resolve a pickup's distance from its collider centre without exposing it in the HUD. */
  const findNearestMeleePickup = (position: THREE.Vector3): ExplorationMeleePickup | null => {
    let best: { readonly pickup: ExplorationMeleePickup; readonly distance: number } | null = null;
    for (const pickup of explorationWorld.getMeleePickups()) {
      const instanceMatrix = new THREE.Matrix4();
      pickup.mesh.getMatrixAt(pickup.index, instanceMatrix);
      const instancePosition = new THREE.Vector3().setFromMatrixPosition(instanceMatrix);
      const distance = instancePosition.distanceTo(position);
      if (distance > WEAPON_PICKUP_RANGE_METERS) {
        continue;
      }
      if (best === null || distance < best.distance) {
        best = { pickup, distance };
      }
    }
    return best?.pickup ?? null;
  };

  const addImpact = (hit: THREE.Intersection, color: number): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const impact = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), material);
    impact.name = "MeleeImpact";
    impact.position.copy(hit.point);
    impact.userData = { weaponVisual: true, dofIgnore: true };
    effectRoot.add(impact);
    impactEffects.push({ object: impact, remainingSeconds: 0.16 });
  };

  const resolveSwingHit = (): void => {
    const actionAimRay = swingAimRay;
    swingAimRay = null;
    if (activePickup === null || actionAimRay === null) {
      return;
    }
    scene.updateMatrixWorld(true);
    raycaster.set(actionAimRay.origin, actionAimRay.direction);
    raycaster.near = 0.12;
    raycaster.far = activePickup.snapshot.rangeMeters;
    const hit = scene.children
      .filter((object) => object.name !== "LightingRoot" && object.name !== "DebugRoot")
      .flatMap((object) => raycaster.intersectObject(object, true))
      .find(
        (intersection) =>
          !isWeaponVisual(intersection.object) && !(intersection.object instanceof THREE.Sprite),
      );
    if (hit === undefined) {
      return;
    }
    onMeleeImpactSound?.(activePickup.snapshot, hit.point);
    addImpact(hit, activePickup.color);
    const combatDamage = onMeleeHit?.(hit.object, activePickup.snapshot.damage, {
      point: {
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z,
      },
      attackDirection: {
        x: actionAimRay.direction.x,
        y: actionAimRay.direction.y,
        z: actionAimRay.direction.z,
      },
      attackerVelocity: latestWorldVelocity,
      attackerAirborne: latestAirborne,
    });
    if (combatDamage !== null && combatDamage !== undefined) {
      hits += 1;
      lastDamage = combatDamage;
      emitState(true);
      return;
    }
    const objectId = explorationWorld.getMeleeObjectIdForHit(hit.object, hit.instanceId);
    if (objectId === null) {
      hit.object.userData.lastMeleeHit = {
        damage: activePickup.snapshot.damage,
        stoppingPower: activePickup.snapshot.stoppingPower,
        volumeM3: activePickup.snapshot.volumeM3,
      };
      return;
    }
    const didApply = explorationWorld.applyMeleeHit(
      objectId,
      {
        x: actionAimRay.direction.x,
        y: actionAimRay.direction.y,
        z: actionAimRay.direction.z,
      },
      activePickup.snapshot.swingSpeedRadiansPerSecond,
      activePickup.snapshot.stoppingPower,
    );
    if (didApply) {
      hits += 1;
      lastDamage = activePickup.snapshot.damage;
      emitState(true);
    }
  };

  const trySwing = (): boolean => {
    if (
      !controlsActive ||
      !drawn ||
      activePickup === null ||
      latestAimRay === null ||
      swinging ||
      latestViewmodelTransition.phase !== "idle"
    ) {
      return false;
    }
    const swing = resolveMeleeSwing(activePickup.snapshot.volumeM3);
    swingDirection = nextSwingDirection;
    nextSwingDirection = swingDirection === "right-to-left" ? "left-to-right" : "right-to-left";
    swingDurationSeconds = swing.swingDurationSeconds;
    swingElapsedSeconds = 0;
    swingHitResolved = false;
    swingAimRay = snapshotActionAimRay(latestAimRay);
    swinging = true;
    idleElapsedSeconds = 0;
    swings += 1;
    lastOxygenCost = onMeleeSwing?.(swing.damage) ?? resolveMeleeO2Cost(swing.damage);
    onMeleeSwingSound?.(activePickup.snapshot, latestCameraPosition, swing.swingDurationSeconds);
    emitState(true);
    return true;
  };

  const interact = (): boolean => {
    if (activePickup !== null) {
      if (!drawn) {
        drawn = true;
        onMeleeEquip?.(true);
        emitState(true);
      }
      return true;
    }
    if (!controlsActive) {
      return false;
    }
    const candidate = findNearestMeleePickup(latestCameraPosition);
    if (candidate === null) {
      return false;
    }
    const sourceMatrix = new THREE.Matrix4();
    candidate.mesh.getMatrixAt(candidate.index, sourceMatrix);
    const equipped = explorationWorld.equipMeleeObject(candidate.objectId);
    if (equipped === null) {
      return false;
    }
    activePickup = equipped;
    drawn = true;
    swingDirection = "right-to-left";
    nextSwingDirection = "right-to-left";
    viewModel = createViewModel(equipped, sourceMatrix);
    onMeleeEquip?.(false);
    emitState(true);
    return true;
  };

  const stash = (): boolean => {
    if (activePickup === null || !drawn) {
      return false;
    }
    drawn = false;
    swinging = false;
    swingAimRay = null;
    swingElapsedSeconds = 0;
    idleElapsedSeconds = 0;
    fireHeld = false;
    if (viewModel !== null) {
      viewModel.root.visible = false;
    }
    emitState(true);
    return true;
  };

  const dropActiveObject = (playerVelocity?: PhysicsVector): boolean => {
    if (activePickup === null) {
      return false;
    }
    dropDirection.copy(latestAimDirection).setY(0);
    if (dropDirection.lengthSq() <= 0.0001) {
      dropDirection.set(0, 0, -1);
    } else {
      dropDirection.normalize();
    }
    dropPosition.copy(latestCameraPosition).addScaledVector(dropDirection, 1.1);
    dropPosition.y = Math.max(0.2, latestCameraPosition.y - PLAYER_CAPSULE_CENTER_HEIGHT);
    const didDrop = explorationWorld.dropMeleeObject(
      activePickup.objectId,
      dropPosition,
      Math.atan2(dropDirection.x, dropDirection.z),
      playerVelocity,
    );
    if (!didDrop) {
      return false;
    }
    swinging = false;
    swingAimRay = null;
    swingElapsedSeconds = 0;
    idleElapsedSeconds = 0;
    drawn = false;
    disposeViewModel();
    activePickup = null;
    emitState(true);
    return true;
  };

  /** Launch the held object along the reticle with a volume-weighted speed. */
  const throwActiveObject = (playerVelocity?: PhysicsVector): boolean => {
    if (activePickup === null) {
      return false;
    }
    const throwDirection = latestAimDirection.clone();
    if (throwDirection.lengthSq() <= 0.0001) {
      throwDirection.set(0, 0, -1);
    } else {
      throwDirection.normalize();
    }
    const throwSpeed = resolveMeleeThrowSpeed(activePickup.snapshot.volumeM3);
    const baseX =
      playerVelocity !== undefined && Number.isFinite(playerVelocity.x) ? playerVelocity.x : 0;
    const baseY =
      playerVelocity !== undefined && Number.isFinite(playerVelocity.y) ? playerVelocity.y : 0;
    const baseZ =
      playerVelocity !== undefined && Number.isFinite(playerVelocity.z) ? playerVelocity.z : 0;
    return dropActiveObject({
      x: baseX + throwDirection.x * throwSpeed,
      y: baseY + throwDirection.y * throwSpeed,
      z: baseZ + throwDirection.z * throwSpeed,
    });
  };

  const update = (
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    aimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 },
    getPresentationAimRay: () => {
      readonly origin: THREE.Vector3;
      readonly direction: THREE.Vector3;
    },
    active: boolean,
    visibleInView: boolean,
    worldVelocity: PhysicsVector,
    airborne: boolean,
    viewmodelOffset: CameraViewmodelOffset,
    viewmodelTransition: CameraViewmodelTransition,
  ): void => {
    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    controlsActive = active;
    viewActive = visibleInView;
    latestCameraPosition.copy(cameraPosition);
    latestAimRay = aimRay;
    latestAimDirection.copy(aimRay.direction);
    latestWorldVelocity = worldVelocity;
    latestAirborne = airborne;
    latestViewmodelOffset = viewmodelOffset;
    latestViewmodelTransition = viewmodelTransition;
    if (fireHeld && drawn && activePickup !== null && !swinging) {
      trySwing();
    }
    if (swinging) {
      swingElapsedSeconds += safeDelta;
      const progress = Math.min(1, swingElapsedSeconds / Math.max(0.001, swingDurationSeconds));
      if (
        shouldResolveMeleeSwingImpact(
          { swinging, hitResolved: swingHitResolved, aimRay: swingAimRay },
          progress,
        )
      ) {
        swingHitResolved = true;
        resolveSwingHit();
      }
      if (progress >= 1) {
        swinging = false;
        swingAimRay = null;
        swingElapsedSeconds = 0;
        // The follow-through ends in the mirrored high-ready pose for the
        // next alternating swing, so the bat does not snap back across the
        // screen between attacks.
        swingDirection = nextSwingDirection;
        emitState(true);
      }
    }
    const canAdvanceIdleReset = shouldAdvanceMeleeIdleReset({
      drawn,
      active: activePickup !== null,
      controlsActive,
      swinging,
      fireHeld,
      viewmodelTransitionIdle: latestViewmodelTransition.phase === "idle",
    });
    if (canAdvanceIdleReset) {
      idleElapsedSeconds += safeDelta;
    } else {
      idleElapsedSeconds = 0;
    }
    if (
      swingDirection === "left-to-right" &&
      resolveMeleeIdleResetProgress(idleElapsedSeconds) >= 1
    ) {
      // The reset has put the prop on the default right side. Seed the next
      // swing from that same side instead of snapping back to the left.
      swingDirection = "right-to-left";
      nextSwingDirection = "right-to-left";
    }
    const presentationAimRay = getPresentationAimRay();
    latestCameraPosition.copy(cameraPosition);
    latestAimRay = presentationAimRay;
    latestAimDirection.copy(presentationAimRay.direction);
    const nearest = activePickup === null ? findNearestMeleePickup(cameraPosition) : null;
    const nextNearby =
      nearest === null
        ? null
        : {
            ...nearest.snapshot,
            distanceMeters: (() => {
              const matrix = new THREE.Matrix4();
              nearest.mesh.getMatrixAt(nearest.index, matrix);
              return new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(cameraPosition);
            })(),
          };
    if (JSON.stringify(nextNearby) !== JSON.stringify(nearby)) {
      nearby = nextNearby;
      emitState();
    }
    if (viewModel !== null) {
      const pose = swinging
        ? resolveMeleeSwingPose(
            Math.min(1, swingElapsedSeconds / Math.max(0.001, swingDurationSeconds)),
            swingDirection,
          )
        : swingDirection === "left-to-right"
          ? resolveMeleeIdleResetPose(resolveMeleeIdleResetProgress(idleElapsedSeconds))
          : resolveMeleeSwingPose(0, swingDirection);
      resolveViewmodelAimTargetLocal(
        camera.matrixWorldInverse,
        presentationAimRay,
        32,
        aimTargetLocal,
      );
      viewModel.root.position.set(
        latestViewmodelOffset.x + pose.offsetX + latestViewmodelTransition.offset.x,
        latestViewmodelOffset.y + pose.offsetY + latestViewmodelTransition.offset.y,
        latestViewmodelOffset.z + pose.offsetZ + latestViewmodelTransition.offset.z,
      );
      aimDirectionLocal.copy(aimTargetLocal).sub(viewModel.root.position);
      if (aimDirectionLocal.lengthSq() > 0.0001) {
        aimDirectionLocal.normalize();
        aimQuaternion.setFromUnitVectors(objectForward, aimDirectionLocal);
        viewModel.root.quaternion.copy(aimQuaternion);
        const swingEuler = new THREE.Euler(
          pose.pitchRadians + latestViewmodelTransition.pitchRadians,
          pose.yawRadians + latestViewmodelTransition.yawRadians,
          pose.rollRadians + latestViewmodelTransition.rollRadians,
          "XYZ",
        );
        viewModel.root.quaternion.multiply(new THREE.Quaternion().setFromEuler(swingEuler));
      }
      viewModel.root.visible = viewActive && controlsActive && drawn && activePickup !== null;
    }
    for (let index = impactEffects.length - 1; index >= 0; index -= 1) {
      const effect = impactEffects[index];
      if (effect === undefined) {
        continue;
      }
      effect.remainingSeconds -= safeDelta;
      effect.object.scale.setScalar(1 + (0.16 - Math.max(0, effect.remainingSeconds)) * 3);
      if (effect.object.material instanceof THREE.MeshBasicMaterial) {
        effect.object.material.opacity = Math.max(0, effect.remainingSeconds / 0.16);
      }
      if (effect.remainingSeconds <= 0) {
        effect.object.removeFromParent();
        disposeObject(effect.object);
        impactEffects.splice(index, 1);
      }
    }
  };

  const setFireHeld = (held: boolean): void => {
    fireHeld = held;
  };
  const recordDeath = (): void => {
    const cancelled = resolveCancelledMeleeSwing({
      fireHeld,
      swinging,
      elapsedSeconds: swingElapsedSeconds,
      durationSeconds: swingDurationSeconds,
      hitResolved: swingHitResolved,
      aimRay: swingAimRay,
    });
    fireHeld = cancelled.fireHeld;
    swinging = cancelled.swinging;
    swingElapsedSeconds = cancelled.elapsedSeconds;
    swingDurationSeconds = cancelled.durationSeconds;
    swingHitResolved = cancelled.hitResolved;
    swingAimRay = cancelled.aimRay;
    idleElapsedSeconds = 0;
    emitState(true);
  };
  const holster = (): boolean => dropActiveObject();
  const dispose = (): void => {
    swingAimRay = null;
    disposeViewModel();
    for (const effect of impactEffects) {
      effect.object.removeFromParent();
      disposeObject(effect.object);
    }
    impactEffects.length = 0;
    effectRoot.removeFromParent();
    disposeObject(effectRoot);
  };
  emitState(true);
  return {
    update,
    setFireHeld,
    recordDeath,
    fire: (aimRay) => {
      latestAimRay = aimRay;
      latestAimDirection.copy(aimRay.direction);
      return trySwing();
    },
    interact,
    isActive: () => drawn && activePickup !== null,
    stash,
    holster,
    dropActiveObject,
    throwActiveObject,
    getSnapshot,
    dispose,
  };
};

interface FocusCalibrationHallwayResources {
  readonly root: THREE.Group;
  readonly labels: readonly THREE.Sprite[];
}

const createFocusCalibrationHallway = (
  scene: THREE.Scene,
  surfaceTextures: InteriorSurfaceTextures,
): FocusCalibrationHallwayResources => {
  const root = new THREE.Group();
  root.name = "FocusCalibrationRoot";
  // The lab is part of the development map, not a separate camera scene.
  // Keep it present so the player can enter it from the streamed world.
  root.visible = true;
  const labels: THREE.Sprite[] = [];
  const deck = new THREE.Group();
  deck.name = "FocusCalibrationSecondLevel";
  deck.position.y = FOCUS_CALIBRATION_DECK_HEIGHT;
  root.add(deck);
  const startX = FOCUS_CALIBRATION_START_X;
  const hallwayStartX = startX - FOCUS_CALIBRATION_ENTRY_MARGIN - FOCUS_CALIBRATION_BACK_EXTENSION;
  const endX = startX + FOCUS_CALIBRATION_LENGTH;
  const hallwayLength = endX - hallwayStartX;
  const centerX = (hallwayStartX + endX) / 2;
  const halfWidth = FOCUS_CALIBRATION_HALL_WIDTH / 2;

  const floorMaterial = createEpoxyFloorMaterial(surfaceTextures.floor, surfaceTextures.detail);
  floorMaterial.fog = false;
  const wallMaterial = createMaterial(
    0xe5e9e4,
    0.76,
    0.08,
    surfaceTextures.wall,
    surfaceTextures.detail,
  );
  wallMaterial.fog = false;
  const ceilingMaterial = createMaterial(
    0x5d6a6c,
    0.7,
    0.18,
    surfaceTextures.table,
    surfaceTextures.detail,
  );
  ceilingMaterial.fog = false;
  const cyanMaterial = createAccentMaterial(COLORS.cyan, 0.35, 0.2, 0.42, surfaceTextures.detail);
  cyanMaterial.fog = false;
  const redMaterial = createAccentMaterial(COLORS.red, 0.35, 0.12, 0.28, surfaceTextures.detail);
  redMaterial.fog = false;
  const targetMaterials = [cyanMaterial, redMaterial] as const;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(hallwayLength, 0.08, FOCUS_CALIBRATION_PLATFORM_WIDTH),
    floorMaterial,
  );
  floor.name = "FocusCalibrationFloor";
  floor.position.set(centerX, 0, 0);
  floor.receiveShadow = true;
  deck.add(floor);

  for (const z of [-halfWidth, halfWidth] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(hallwayLength, 4.2, 0.16), wallMaterial);
    wall.name = "FocusCalibrationWall";
    wall.position.set(centerX, 2.1, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    deck.add(wall);
  }
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(hallwayLength, 0.14, FOCUS_CALIBRATION_HALL_WIDTH),
    ceilingMaterial,
  );
  ceiling.name = "FocusCalibrationCeiling";
  ceiling.position.set(centerX, 4.2, 0);
  ceiling.receiveShadow = true;
  deck.add(ceiling);

  for (const z of [-1.9, 1.9] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(hallwayLength, 0.035, 0.05), cyanMaterial);
    strip.name = "FocusCalibrationLightStrip";
    strip.position.set(centerX, 4.08, z);
    deck.add(strip);
  }

  const markerDistances = new Set<number>();
  for (let distance = 0; distance <= FOCUS_CALIBRATION_LENGTH + 0.001; distance += 1) {
    markerDistances.add(distance);
  }
  markerDistances.add(FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE);
  markerDistances.add(FOCUS_CALIBRATION_LENGTH);
  const sortedMarkerDistances = [...markerDistances].sort((left, right) => left - right);
  for (const distance of sortedMarkerDistances) {
    const isHyperfocal = Math.abs(distance - FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE) < 0.001;
    const isDoubleHyperfocal = Math.abs(distance - FOCUS_CALIBRATION_LENGTH) < 0.001;
    const markerMaterial = isHyperfocal || isDoubleHyperfocal ? redMaterial : cyanMaterial;
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.022, FOCUS_CALIBRATION_HALL_WIDTH - 0.3),
      markerMaterial,
    );
    marker.name = isHyperfocal
      ? "FocusCalibrationHyperfocalMarker"
      : isDoubleHyperfocal
        ? "FocusCalibrationDoubleHyperfocalMarker"
        : "FocusCalibrationMeterMarker";
    marker.position.set(startX + distance, 0.065, 0);
    deck.add(marker);

    const markerText = isHyperfocal
      ? `H  ${distance.toFixed(1)}m`
      : isDoubleHyperfocal
        ? `2H  ${distance.toFixed(1)}m`
        : `${distance.toFixed(0)}m`;
    const label = createLabelSprite(
      markerText,
      isHyperfocal || isDoubleHyperfocal ? "#e94136" : "#73dce8",
    );
    label.position.set(startX + distance, 0.34, -halfWidth + 0.18);
    label.scale.set(isHyperfocal || isDoubleHyperfocal ? 0.72 : 0.48, 0.14, 1);
    deck.add(label);
    labels.push(label);
  }

  const targetDistances = [
    0.75,
    1.5,
    2.5,
    4,
    6,
    FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE / 2,
    FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE,
    FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE * 1.5,
    FOCUS_CALIBRATION_LENGTH,
  ];
  const targetGeometry = new RoundedBoxGeometry(0.09, 0.62, 0.52, 4, 0.035);
  // The focus‑calibration target dot has historically been a small dark disc that
  // inherited the panel material. The new design calls for a larger, white,
  // semi‑transparent disc with a thicker outline.
  //
  // * Triple the original diameter – the original cylinder had a radius of 0.09,
  //   so the new radius is 0.27.
  // * Use a white colour with 50% opacity (hex `#ffffff80`).
  // * The disc remains thin (height = 0.025) and is rotated onto the Y-plane.
  // The focus‑calibration target dot is a visual aid that previously used a small
  // dark cylinder that inherited the panel material.  The new design requires a
  // larger white disc with 50% opacity (hex ``#ffffff80``) and a visible border
  // whose stroke width is three times the original thickness.
  //
  // * Triple the original radius: the old cylinder had a radius of ``0.09`` – the
  //   new radius is ``0.27``.
  // * Use a semi‑transparent white material for the fill.
  // * Add a thin ring geometry to serve as the outline (stroke). The ring is
  //   slightly larger than the disc to create a visible border.  The thickness is
  //   chosen as ``0.015`` which is roughly three times the estimated original
  //   stroke width.
  // ---------------------------------------------------------------------------
  // Focus‑calibration target – dot
  // ---------------------------------------------------------------------------
  // The original implementation used a small dark cylinder that inherited the
  // panel material. The new design requirements are:
  //   - The disc should be white with 50% opacity (hex ``#ffffff80``).
  //   • Its diameter should be three times the original (original radius = 0.09).
  //   • An outline (stroke) that is three times the original line width.
  //
  // We achieve this by:
  //   – Using a larger cylinder geometry (radius 0.27).
  //   – Creating a dedicated ``MeshBasicMaterial`` with ``color: 0xffffff`` and a
  //     semi‑transparent opacity of ``0.5``.
  //   – Adding a thin ``RingGeometry`` around the disc to act as the stroke.
  //     The ring thickness is based on an estimated original stroke of ``0.009`` –
  //     three times that gives a ``strokeWidth`` of ``0.027``.
  const targetDotGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.025, 20);
  // Material for the white, semi‑transparent fill.
  const whiteDotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  // Outline (stroke) geometry and material.
  const strokeWidth = 0.027; // three times an estimated original stroke width.
  const targetDotOutlineGeometry = new THREE.RingGeometry(
    0.27 - strokeWidth,
    0.27 + strokeWidth,
    20,
  );
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const [index, distance] of targetDistances.entries()) {
    const target = new THREE.Group();
    target.name = `FocusCalibrationTarget:${distance.toFixed(2)}m`;
    target.userData.dofFocusTarget = true;
    target.position.set(startX + distance, 1.65, index % 2 === 0 ? -1.2 : 1.2);
    const material = targetMaterials[index % targetMaterials.length] ?? cyanMaterial;
    const panel = new THREE.Mesh(targetGeometry, material);
    panel.name = "FocusCalibrationTargetPanel";
    panel.castShadow = true;
    panel.receiveShadow = true;
    target.add(panel);
    // Use the dedicated white, semi‑transparent material for the disc.
    const dot = new THREE.Mesh(targetDotGeometry, whiteDotMaterial);
    dot.name = "FocusCalibrationTargetDot";
    dot.rotation.z = Math.PI / 2;
    dot.position.x = -0.06;
    dot.castShadow = true;
    target.add(dot);

    // Add the outline (stroke) mesh. The outline sits just behind the disc to avoid
    // z‑fighting; a slight offset on the Y‑axis works well because the disc is thin.
    const outline = new THREE.Mesh(targetDotOutlineGeometry, outlineMaterial);
    outline.name = "FocusCalibrationTargetDotOutline";
    outline.rotation.z = Math.PI / 2;
    outline.position.set(-0.06, 0.001, 0);
    outline.castShadow = true;
    target.add(outline);
    deck.add(target);

    const isHyperfocal = Math.abs(distance - FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE) < 0.001;
    const isDoubleHyperfocal = Math.abs(distance - FOCUS_CALIBRATION_LENGTH) < 0.001;
    const targetText = isHyperfocal
      ? "TARGET H"
      : isDoubleHyperfocal
        ? "TARGET 2H"
        : `TARGET ${distance.toFixed(1)}m`;
    const targetLabel = createLabelSprite(targetText, index % 2 === 0 ? "#73dce8" : "#e94136");
    targetLabel.position.set(target.position.x, target.position.y + 0.48, target.position.z);
    targetLabel.scale.set(0.68, 0.16, 1);
    deck.add(targetLabel);
    labels.push(targetLabel);
  }

  const title = createLabelSprite(
    `FOCUS LAB  ·  H(4mm) ${FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE.toFixed(1)}m  ·  2H ${FOCUS_CALIBRATION_LENGTH.toFixed(1)}m`,
    "#e94136",
  );
  title.position.set(startX + 0.7, 3.72, 0);
  title.scale.set(1.6, 0.24, 1);
  deck.add(title);
  labels.push(title);

  scene.add(root);
  return { root, labels };
};

interface ParametricGunCampusResources {
  readonly labels: readonly THREE.Sprite[];
}

/** Create the seeded profile barracks and a simple live-fire target lane. */
const createParametricGunCampus = (
  scene: THREE.Scene,
  surfaceTextures: InteriorSurfaceTextures,
): ParametricGunCampusResources => {
  const labels: THREE.Sprite[] = [];
  const barracks = new THREE.Group();
  barracks.name = "ParametricGunBarracksRoot";

  const barracksFloorMaterial = createEpoxyFloorMaterial(
    surfaceTextures.floor,
    surfaceTextures.detail,
  );
  barracksFloorMaterial.fog = false;
  const barracksWallMaterial = createMaterial(
    0xd9e2df,
    0.72,
    0.08,
    surfaceTextures.wall,
    surfaceTextures.detail,
  );
  barracksWallMaterial.fog = false;
  const barracksInsetMaterial = createMaterial(
    COLORS.charcoal,
    0.66,
    0.12,
    surfaceTextures.table,
    surfaceTextures.detail,
  );
  barracksInsetMaterial.fog = false;
  const barracksAccentMaterial = createAccentMaterial(
    0xe1a64d,
    0.34,
    0.18,
    0.34,
    surfaceTextures.detail,
  );
  barracksAccentMaterial.fog = false;

  const barracksFloor = new THREE.Mesh(
    new THREE.BoxGeometry(PARAMETRIC_BARRACKS_WIDTH_METERS, 0.08, PARAMETRIC_BARRACKS_DEPTH_METERS),
    barracksFloorMaterial,
  );
  barracksFloor.name = "ParametricGunBarracksFloor";
  barracksFloor.position.set(PARAMETRIC_BARRACKS_ORIGIN.x, -0.04, PARAMETRIC_BARRACKS_ORIGIN.z);
  barracksFloor.userData = { physicsIgnore: true };
  barracksFloor.receiveShadow = true;
  barracks.add(barracksFloor);

  const barracksHalfWidth = PARAMETRIC_BARRACKS_WIDTH_METERS / 2;
  const barracksHalfDepth = PARAMETRIC_BARRACKS_DEPTH_METERS / 2;
  const addBarracksWall = (
    name: string,
    width: number,
    depth: number,
    x: number,
    z: number,
  ): void => {
    const wall = new THREE.Mesh(
      new RoundedBoxGeometry(width, PARAMETRIC_BARRACKS_WALL_HEIGHT_METERS, depth, 4, 0.08),
      barracksWallMaterial,
    );
    wall.name = name;
    wall.position.set(x, PARAMETRIC_BARRACKS_WALL_HEIGHT_METERS / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    barracks.add(wall);
  };
  addBarracksWall(
    "ParametricGunBarracksNorthWall",
    PARAMETRIC_BARRACKS_WIDTH_METERS,
    0.24,
    PARAMETRIC_BARRACKS_ORIGIN.x,
    PARAMETRIC_BARRACKS_ORIGIN.z - barracksHalfDepth,
  );
  addBarracksWall(
    "ParametricGunBarracksWestWall",
    0.24,
    PARAMETRIC_BARRACKS_DEPTH_METERS,
    PARAMETRIC_BARRACKS_ORIGIN.x - barracksHalfWidth,
    PARAMETRIC_BARRACKS_ORIGIN.z,
  );
  addBarracksWall(
    "ParametricGunBarracksEastWall",
    0.24,
    PARAMETRIC_BARRACKS_DEPTH_METERS,
    PARAMETRIC_BARRACKS_ORIGIN.x + barracksHalfWidth,
    PARAMETRIC_BARRACKS_ORIGIN.z,
  );

  for (let row = 0; row < PARAMETRIC_GUN_RACK_ROWS; row += 1) {
    const rowZ =
      PARAMETRIC_BARRACKS_ORIGIN.z +
      (row - (PARAMETRIC_GUN_RACK_ROWS - 1) / 2) * PARAMETRIC_GUN_RACK_SPACING_Z;
    const rackBack = new THREE.Mesh(
      new RoundedBoxGeometry(PARAMETRIC_BARRACKS_WIDTH_METERS - 3, 1.35, 0.12, 4, 0.04),
      barracksInsetMaterial,
    );
    rackBack.name = `ParametricGunRackBack:${String(row + 1)}`;
    rackBack.position.set(PARAMETRIC_BARRACKS_ORIGIN.x, 1.05, rowZ - 0.76);
    rackBack.castShadow = true;
    rackBack.receiveShadow = true;
    barracks.add(rackBack);
    const shelf = new THREE.Mesh(
      new RoundedBoxGeometry(PARAMETRIC_BARRACKS_WIDTH_METERS - 2.4, 0.09, 1.2, 4, 0.04),
      barracksAccentMaterial,
    );
    shelf.name = `ParametricGunRackShelf:${String(row + 1)}`;
    shelf.position.set(PARAMETRIC_BARRACKS_ORIGIN.x, 0.34, rowZ);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    barracks.add(shelf);
  }
  const barracksTitle = createLabelSprite("FIXED ARMORY  ·  SIX WEAPONS", "#e1a64d");
  barracksTitle.name = "ParametricGunBarracksTitle";
  barracksTitle.position.set(
    PARAMETRIC_BARRACKS_ORIGIN.x,
    PARAMETRIC_BARRACKS_WALL_HEIGHT_METERS - 0.42,
    PARAMETRIC_BARRACKS_ORIGIN.z + barracksHalfDepth - 0.35,
  );
  barracksTitle.scale.set(2.35, 0.32, 1);
  barracks.add(barracksTitle);
  labels.push(barracksTitle);

  scene.add(barracks);

  const targetRange = new THREE.Group();
  targetRange.name = "ParametricTargetRangeRoot";
  const rangeFloorMaterial = createEpoxyFloorMaterial(
    surfaceTextures.floor,
    surfaceTextures.detail,
  );
  rangeFloorMaterial.fog = false;
  const rangeWallMaterial = createMaterial(
    0x39484d,
    0.82,
    0.1,
    surfaceTextures.wall,
    surfaceTextures.detail,
  );
  rangeWallMaterial.fog = false;
  const rangeAccentMaterial = createAccentMaterial(
    COLORS.red,
    0.36,
    0.16,
    0.4,
    surfaceTextures.detail,
  );
  rangeAccentMaterial.fog = false;
  const rangeFloor = new THREE.Mesh(
    new THREE.BoxGeometry(
      PARAMETRIC_TARGET_RANGE_WIDTH_METERS,
      0.08,
      PARAMETRIC_TARGET_RANGE_DEPTH_METERS,
    ),
    rangeFloorMaterial,
  );
  rangeFloor.name = "ParametricTargetRangeFloor";
  rangeFloor.position.set(
    PARAMETRIC_TARGET_RANGE_ORIGIN.x,
    -0.04,
    PARAMETRIC_TARGET_RANGE_ORIGIN.z,
  );
  rangeFloor.userData = { physicsIgnore: true };
  rangeFloor.receiveShadow = true;
  targetRange.add(rangeFloor);

  const rangeHalfWidth = PARAMETRIC_TARGET_RANGE_WIDTH_METERS / 2;
  const rangeHalfDepth = PARAMETRIC_TARGET_RANGE_DEPTH_METERS / 2;
  for (const x of [
    PARAMETRIC_TARGET_RANGE_ORIGIN.x - rangeHalfWidth,
    PARAMETRIC_TARGET_RANGE_ORIGIN.x + rangeHalfWidth,
  ] as const) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(0.18, 0.42, PARAMETRIC_TARGET_RANGE_DEPTH_METERS, 4, 0.05),
      rangeWallMaterial,
    );
    rail.name = "ParametricTargetRangeSideRail";
    rail.position.set(x, 0.21, PARAMETRIC_TARGET_RANGE_ORIGIN.z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    targetRange.add(rail);
  }
  const backstop = new THREE.Mesh(
    new RoundedBoxGeometry(PARAMETRIC_TARGET_RANGE_WIDTH_METERS, 4.5, 0.3, 4, 0.08),
    rangeWallMaterial,
  );
  backstop.name = "ParametricTargetRangeBackstop";
  backstop.position.set(
    PARAMETRIC_TARGET_RANGE_ORIGIN.x,
    2.25,
    PARAMETRIC_TARGET_RANGE_ORIGIN.z - rangeHalfDepth + 0.25,
  );
  backstop.castShadow = true;
  backstop.receiveShadow = true;
  targetRange.add(backstop);

  for (const x of [-12, -4, 4, 12] as const) {
    const laneLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.018, PARAMETRIC_TARGET_RANGE_DEPTH_METERS - 2),
      rangeAccentMaterial,
    );
    laneLine.name = "ParametricTargetRangeLaneLine";
    laneLine.position.set(
      PARAMETRIC_TARGET_RANGE_ORIGIN.x + x,
      0.02,
      PARAMETRIC_TARGET_RANGE_ORIGIN.z,
    );
    laneLine.userData = { physicsIgnore: true };
    targetRange.add(laneLine);
  }

  const targetMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xf5f1e9 }),
    new THREE.MeshBasicMaterial({ color: COLORS.red, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: COLORS.charcoal }),
  ] as const;
  const targetDistances = [8, 16, 24, 32] as const;
  for (const [index, distance] of targetDistances.entries()) {
    const target = new THREE.Group();
    target.name = `ParametricTarget:${String(distance)}m`;
    target.userData = { dofFocusTarget: true };
    const targetX = PARAMETRIC_TARGET_RANGE_ORIGIN.x + [-12, -4, 4, 12][index]!;
    const targetZ = PARAMETRIC_TARGET_RANGE_START_Z - distance;
    target.position.set(targetX, 0, targetZ);
    const stand = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 1.1, 0.24, 4, 0.04),
      rangeWallMaterial,
    );
    stand.name = "ParametricTargetStand";
    stand.position.y = 0.55;
    stand.castShadow = true;
    target.add(stand);
    const board = new THREE.Mesh(
      new RoundedBoxGeometry(3.4, 2.7, 0.18, 4, 0.06),
      rangeWallMaterial,
    );
    board.name = "ParametricTargetBoard";
    board.position.y = 1.8;
    board.castShadow = true;
    board.receiveShadow = true;
    target.add(board);
    for (const [ringIndex, radius] of ([1.02, 0.69, 0.36] as const).entries()) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.07, radius, 32),
        targetMaterials[ringIndex + 1] ?? targetMaterials[0],
      );
      ring.name = `ParametricTargetRing:${String(ringIndex + 1)}`;
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 1.8, -0.11);
      ring.userData = { dofFocusTarget: true };
      target.add(ring);
    }
    const bullseye = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), targetMaterials[0]);
    bullseye.name = "ParametricTargetBullseye";
    bullseye.rotation.x = Math.PI / 2;
    bullseye.position.set(0, 1.8, -0.12);
    bullseye.userData = { dofFocusTarget: true };
    target.add(bullseye);
    targetRange.add(target);
    const targetLabel = createLabelSprite(
      `TARGET ${String(distance)}M  ·  LIVE FIRE`,
      index % 2 === 0 ? "#f04438" : "#73dce8",
    );
    targetLabel.name = `ParametricTargetLabel:${String(distance)}m`;
    targetLabel.position.set(targetX, 3.35, targetZ);
    targetLabel.scale.set(0.9, 0.19, 1);
    targetRange.add(targetLabel);
    labels.push(targetLabel);
  }
  const rangeTitle = createLabelSprite("TARGET RANGE  ·  AIM / FIRE / COMPARE", "#f04438");
  rangeTitle.name = "ParametricTargetRangeTitle";
  rangeTitle.position.set(
    PARAMETRIC_TARGET_RANGE_ORIGIN.x,
    3.95,
    PARAMETRIC_TARGET_RANGE_ORIGIN.z + rangeHalfDepth - 1.1,
  );
  rangeTitle.scale.set(2.25, 0.3, 1);
  targetRange.add(rangeTitle);
  labels.push(rangeTitle);
  scene.add(targetRange);

  return { labels };
};

const addDice = (scene: THREE.Scene): void => {
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.charcoal,
    roughness: 0.38,
    metalness: 0.06,
  });
  for (const [x, z, rotation] of [
    [-0.07, -0.05, 0.18],
    [0.055, -0.03, -0.22],
  ] as const) {
    const die = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.09, 0.09, 3, 0.018), material);
    die.position.set(x, TABLE_TOP_Y + 0.11, z);
    die.rotation.set(rotation, rotation * 0.5, rotation);
    die.castShadow = true;
    scene.add(die);
  }
};

const makeTeacherPanelTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create the teacher panel texture");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(11, 24, 27, 0.92)";
  roundedRect(context, 8, 8, 496, 344, 26);
  context.fill();
  context.fillStyle = "#73dce8";
  context.font = "700 22px ui-sans-serif, sans-serif";
  context.fillText("AI TEACHER", 32, 52);
  context.fillStyle = "#f3f4f0";
  context.font = "700 31px ui-sans-serif, sans-serif";
  context.fillText("STAY IN THE HAND", 32, 116);
  context.fillStyle = "#b9bec0";
  context.font = "500 20px ui-sans-serif, sans-serif";
  context.fillText("Observe the discard river.", 32, 160);
  context.fillText("Your next decision is staged.", 32, 188);
  context.fillStyle = "#e94136";
  context.fillRect(32, 230, 448, 5);
  context.fillStyle = "#b9bec0";
  context.font = "700 18px ui-monospace, monospace";
  context.fillText("ROUND 01  /  EAST WIND", 32, 282);
  context.fillStyle = "#73dce8";
  context.fillText("READY", 32, 318);
  return createCanvasTexture(canvas);
};

const makeWeaponChartTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create the weapon chart texture");
  }

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#0b171b");
  background.addColorStop(1, "#182a2e");
  context.fillStyle = background;
  roundedRect(context, 12, 12, canvas.width - 24, canvas.height - 24, 30);
  context.fill();
  context.strokeStyle = "#73dce8";
  context.lineWidth = 5;
  context.stroke();

  context.fillStyle = "#73dce8";
  context.font = "700 32px ui-sans-serif, sans-serif";
  context.fillText("ARMORY / WEAPON CHART", 64, 74);
  context.fillStyle = "#d8e4e1";
  context.font = "500 19px ui-monospace, monospace";
  context.fillText("PENTHOUSE LOADOUT  ·  DAMAGE + STOPPING POWER + STARTING AMMO", 66, 110);
  context.fillStyle = "#e94136";
  context.fillRect(66, 132, 1468, 5);

  const tableTop = 176;
  const rowHeight = 104;
  const columnX = {
    weapon: 104,
    damage: 620,
    stoppingPower: 850,
    pellets: 1_025,
    ammo: 1_290,
    total: 1496,
  } as const;
  context.fillStyle = "#8fa7aa";
  context.font = "700 20px ui-monospace, monospace";
  context.fillText("WEAPON", columnX.weapon, tableTop);
  context.textAlign = "right";
  context.fillText("DAMAGE / BULLET", columnX.damage, tableTop);
  context.fillText("STOPPING / BULLET", columnX.stoppingPower, tableTop);
  context.fillText("PELLETS", columnX.pellets, tableTop);
  context.fillText("MAG / RESERVE", columnX.ammo, tableTop);
  context.fillText("TOTAL", columnX.total, tableTop);
  context.textAlign = "left";

  WEAPON_CHART_ENTRIES.forEach((entry, index) => {
    const rowY = tableTop + 24 + index * rowHeight;
    const rowColor = new THREE.Color(WEAPON_DEFINITIONS[entry.id].color).getStyle();
    context.fillStyle = index % 2 === 0 ? "rgba(255, 255, 255, 0.055)" : "rgba(0, 0, 0, 0.12)";
    roundedRect(context, 64, rowY, 1470, rowHeight - 14, 14);
    context.fill();
    context.fillStyle = rowColor;
    roundedRect(context, 82, rowY + 18, 10, rowHeight - 50, 5);
    context.fill();

    context.fillStyle = "#f3f4f0";
    context.font = "700 28px ui-sans-serif, sans-serif";
    context.fillText(entry.label.toUpperCase(), columnX.weapon, rowY + 43);
    context.fillStyle = "#91a7aa";
    context.font = "500 16px ui-monospace, monospace";
    context.fillText(
      entry.id === "machineGun" ? "AUTOMATIC" : entry.id.toUpperCase(),
      columnX.weapon,
      rowY + 70,
    );

    context.fillStyle = "#f3f4f0";
    context.font = "700 29px ui-monospace, monospace";
    context.textAlign = "right";
    context.fillText(String(entry.damagePerBullet), columnX.damage, rowY + 48);
    context.fillText(entry.stoppingPowerPerBullet.toFixed(2), columnX.stoppingPower, rowY + 48);
    context.fillText(String(entry.pelletsPerShot), columnX.pellets, rowY + 48);
    context.fillText(
      `${String(entry.magazineSize)} / ${String(entry.reserveAmmo)}`,
      columnX.ammo,
      rowY + 48,
    );
    context.fillStyle = rowColor;
    context.fillText(String(entry.totalAmmo), columnX.total, rowY + 48);
    context.textAlign = "left";

    context.fillStyle = "#8fa7aa";
    context.font = "500 15px ui-monospace, monospace";
    context.textAlign = "right";
    context.fillText(
      entry.id === "shotgun" ? "PER SHELL: 8 PROJECTILES" : "PER SHOT: 1 PROJECTILE",
      columnX.total,
      rowY + 72,
    );
    context.textAlign = "left";
  });

  context.fillStyle = "#b8c7c5";
  context.font = "500 18px ui-monospace, monospace";
  context.fillText("AMMO = LOADED MAGAZINE / RESERVE ROUNDS ON PICKUP", 66, 748);
  context.fillStyle = "#73dce8";
  context.textAlign = "right";
  context.fillText("DAMAGE IS PER PROJECTILE", 1534, 748);
  context.textAlign = "left";
  return createCanvasTexture(canvas);
};

const addArchitecture = (scene: THREE.Scene, quality: SceneQuality): ArchitectureResources => {
  const environment = new THREE.Group();
  environment.name = "EnvironmentRoot";
  const shell = new THREE.Group();
  shell.name = "ArchitecturalShell";
  const windows = new THREE.Group();
  windows.name = "Windows";
  const furniture = new THREE.Group();
  furniture.name = "Furniture";
  const accents = new THREE.Group();
  accents.name = "ArchitecturalAccents";
  const ambientEffects = new THREE.Group();
  ambientEffects.name = "AmbientEffects";
  environment.add(shell, windows, furniture, accents, ambientEffects);
  const surfaceTextures = createInteriorSurfaceTextures();

  const aluminum = createMaterial(COLORS.aluminum, 0.28, 0.9, undefined, surfaceTextures.detail);
  const red = createAccentMaterial(COLORS.red, 0.38, 0, 0.12, surfaceTextures.detail);
  const cyan = createAccentMaterial(COLORS.cyan, 0.34, 0, 0.28, surfaceTextures.detail);
  const physicalGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: COLORS.glass,
    roughness: 0.055,
    metalness: 0,
    envMapIntensity: 1.12,
    transmission: 0.24,
    transparent: true,
    opacity: 0.24,
    ior: 1.45,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughnessMap: surfaceTextures.detail,
    bumpMap: surfaceTextures.detail,
    bumpScale: 0.001,
  });
  const simpleGlassMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.glass,
    roughness: 0.15,
    metalness: 0.05,
    envMapIntensity: 0.9,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughnessMap: surfaceTextures.detail,
    bumpMap: surfaceTextures.detail,
    bumpScale: 0.001,
  });
  const glass = quality.glassMode === "physical" ? physicalGlassMaterial : simpleGlassMaterial;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(PENTHOUSE_FLOOR_WIDTH_METERS, PENTHOUSE_FLOOR_DEPTH_METERS),
    createEpoxyFloorMaterial(surfaceTextures.floor, surfaceTextures.detail),
  );
  floor.name = "PenthouseFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.userData.dofIgnore = true;
  floor.receiveShadow = true;
  shell.add(floor);
  const floorInset = new THREE.Mesh(
    new RoundedBoxGeometry(7.6, 0.035, 7.6, 5, 0.22),
    createMaterial(0x343e41, 0.86, 0, surfaceTextures.wall, surfaceTextures.detail),
  );
  floorInset.name = "MahjongZoneInset";
  floorInset.position.y = 0.018;
  floorInset.userData.dofIgnore = true;
  floorInset.receiveShadow = true;
  shell.add(floorInset);

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(
      PENTHOUSE_FLOOR_WIDTH_METERS,
      PENTHOUSE_CEILING_SLAB_THICKNESS_METERS,
      PENTHOUSE_FLOOR_DEPTH_METERS,
    ),
    createMaterial(COLORS.whiteLacquer, 0.3, 0, surfaceTextures.table, surfaceTextures.detail),
  );
  ceiling.name = "CeilingSlab";
  ceiling.position.y =
    PENTHOUSE_CEILING_HEIGHT_METERS + PENTHOUSE_CEILING_SLAB_THICKNESS_METERS / 2;
  ceiling.receiveShadow = true;
  shell.add(ceiling);
  const cantilever = new THREE.Mesh(
    new RoundedBoxGeometry(6.1, 0.28, 2.35, 4, 0.08),
    createMaterial(
      COLORS.architecturalWhite,
      0.76,
      0,
      surfaceTextures.wall,
      surfaceTextures.detail,
    ),
  );
  cantilever.name = "CantileveredCeiling";
  cantilever.position.set(
    -PENTHOUSE_HALF_WIDTH_METERS * 0.62,
    PENTHOUSE_CEILING_HEIGHT_METERS - 0.3,
    -PENTHOUSE_HALF_DEPTH_METERS * 0.58,
  );
  cantilever.castShadow = true;
  cantilever.receiveShadow = true;
  shell.add(cantilever);

  for (const x of [-PENTHOUSE_SIDE_WALL_X, PENTHOUSE_SIDE_WALL_X]) {
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(
        PENTHOUSE_WALL_THICKNESS_METERS,
        PENTHOUSE_CEILING_HEIGHT_METERS,
        PENTHOUSE_FLOOR_DEPTH_METERS - PENTHOUSE_WALL_THICKNESS_METERS * 2,
      ),
      x < 0
        ? createMaterial(
            COLORS.architecturalWhite,
            0.76,
            0,
            surfaceTextures.wall,
            surfaceTextures.detail,
          )
        : createMaterial(
            COLORS.structuralGray,
            0.58,
            0.05,
            surfaceTextures.wall,
            surfaceTextures.detail,
          ),
    );
    sideWall.name = x < 0 ? "WestStructuralWall" : "EastStructuralWall";
    sideWall.position.set(x, PENTHOUSE_CEILING_HEIGHT_METERS / 2, 0);
    sideWall.castShadow = true;
    sideWall.receiveShadow = true;
    shell.add(sideWall);
  }

  const sculpturalWall = new THREE.Mesh(
    new RoundedBoxGeometry(2.25, 4.25, 2.15, 5, 0.12),
    createMaterial(COLORS.whiteLacquer, 0.3, 0, surfaceTextures.table, surfaceTextures.detail),
  );
  sculpturalWall.name = "SculpturalWhiteWall";
  sculpturalWall.position.set(
    -PENTHOUSE_HALF_WIDTH_METERS + 4.8,
    2.12,
    PENTHOUSE_HALF_DEPTH_METERS * 0.35,
  );
  sculpturalWall.castShadow = true;
  sculpturalWall.receiveShadow = true;
  shell.add(sculpturalWall);
  const corridor = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 3.35, 1.75),
    createMaterial(COLORS.charcoal, 0.68, 0, surfaceTextures.wall, surfaceTextures.detail),
  );
  corridor.name = "DarkCorridorInset";
  corridor.position.set(PENTHOUSE_SIDE_WALL_X - 0.2, 2.15, PENTHOUSE_HALF_DEPTH_METERS * 0.34);
  shell.add(corridor);

  const northGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(PENTHOUSE_NORTH_GLASS_WIDTH_METERS, PENTHOUSE_WINDOW_HEIGHT_METERS),
    glass,
  );
  northGlass.name = "NorthGlazing";
  northGlass.position.set(0, PENTHOUSE_WINDOW_CENTER_Y, PENTHOUSE_NORTH_GLASS_Z);
  windows.add(northGlass);
  const eastGlassReturnDepth = 9.5;
  const eastGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(eastGlassReturnDepth, PENTHOUSE_WINDOW_HEIGHT_METERS),
    glass,
  );
  eastGlass.name = "EastGlassReturn";
  eastGlass.rotation.y = Math.PI / 2;
  eastGlass.position.set(
    PENTHOUSE_SIDE_WALL_X - 0.03,
    PENTHOUSE_WINDOW_CENTER_Y,
    -PENTHOUSE_HALF_DEPTH_METERS + eastGlassReturnDepth / 2 + 0.18,
  );
  windows.add(eastGlass);
  const mullionMaterial = createMaterial(0x20282b, 0.38, 0.42, undefined, surfaceTextures.detail);
  for (const x of [-20, -10, 0, 10, 20]) {
    const mullion = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, PENTHOUSE_WINDOW_HEIGHT_METERS + 0.12, 0.08),
      mullionMaterial,
    );
    mullion.name = "NorthMullion";
    mullion.position.set(x, PENTHOUSE_WINDOW_CENTER_Y, PENTHOUSE_NORTH_GLASS_Z + 0.08);
    windows.add(mullion);
  }
  const horizontalMullion = new THREE.Mesh(
    new THREE.BoxGeometry(PENTHOUSE_NORTH_GLASS_WIDTH_METERS, 0.045, 0.08),
    mullionMaterial,
  );
  horizontalMullion.name = "NorthMullionHorizontal";
  horizontalMullion.position.set(
    0,
    PENTHOUSE_CEILING_HEIGHT_METERS / 2,
    PENTHOUSE_NORTH_GLASS_Z + 0.08,
  );
  windows.add(horizontalMullion);
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(PENTHOUSE_NORTH_GLASS_WIDTH_METERS + 0.2, 0.22, 0.32),
    createMaterial(COLORS.structuralGray, 0.58, 0.05, surfaceTextures.wall, surfaceTextures.detail),
  );
  sill.name = "WindowSill";
  sill.position.set(0, 0.14, PENTHOUSE_NORTH_GLASS_Z + 0.12);
  sill.castShadow = true;
  windows.add(sill);

  const redLine = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 12.5), red);
  redLine.name = "RedDirectionalLine";
  redLine.position.set(-PENTHOUSE_HALF_WIDTH_METERS + 3.2, 0.06, -3.2);
  redLine.rotation.y = -0.08;
  accents.add(redLine);
  const cyanStrip = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.032, 0.04), cyan);
  cyanStrip.name = "CyanCeilingStrip";
  cyanStrip.position.set(0, PENTHOUSE_CEILING_HEIGHT_METERS - 0.28, 0);
  accents.add(cyanStrip);
  const teacherTexture = makeTeacherPanelTexture();
  const teacherPanel = new THREE.Mesh(
    new RoundedBoxGeometry(1.72, 1.18, 0.045, 4, 0.04),
    new THREE.MeshStandardMaterial({
      map: teacherTexture,
      color: 0xffffff,
      emissive: 0x102a2e,
      emissiveMap: teacherTexture,
      emissiveIntensity: 0.18,
      roughness: 0.42,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    }),
  );
  teacherPanel.name = "TeacherPanel";
  teacherPanel.position.set(-PENTHOUSE_HALF_WIDTH_METERS + 8, 2.5, PENTHOUSE_NORTH_GLASS_Z + 0.26);
  teacherPanel.userData.dofIgnore = true;
  accents.add(teacherPanel);
  const teacherPanelLine = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.025, 0.05), cyan);
  teacherPanelLine.name = "TeacherPanelStatusLine";
  teacherPanelLine.position.set(
    -PENTHOUSE_HALF_WIDTH_METERS + 8,
    2.13,
    PENTHOUSE_NORTH_GLASS_Z + 0.3,
  );
  accents.add(teacherPanelLine);

  const weaponChartTexture = makeWeaponChartTexture();
  const weaponChart = new THREE.Group();
  weaponChart.name = "WeaponDamageAmmoChartSign";
  weaponChart.position.set(-PENTHOUSE_SIDE_WALL_X + 0.24, 2.25, 5.7);
  weaponChart.rotation.y = Math.PI / 2;
  weaponChart.userData = { physicsIgnore: true, dofFocusTarget: true };
  const weaponChartFrame = new THREE.Mesh(
    new RoundedBoxGeometry(8.5, 4.3, 0.18, 6, 0.1),
    createMaterial(COLORS.charcoal, 0.68, 0.18, undefined, surfaceTextures.detail),
  );
  weaponChartFrame.name = "WeaponDamageAmmoChartFrame";
  weaponChartFrame.castShadow = true;
  weaponChartFrame.receiveShadow = true;
  weaponChart.add(weaponChartFrame);
  const weaponChartPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(8.18, 4.02),
    new THREE.MeshStandardMaterial({
      map: weaponChartTexture,
      color: 0xffffff,
      emissive: 0x102a2e,
      emissiveMap: weaponChartTexture,
      emissiveIntensity: 0.2,
      roughness: 0.44,
      side: THREE.DoubleSide,
    }),
  );
  weaponChartPanel.name = "WeaponDamageAmmoChartPanel";
  weaponChartPanel.position.z = 0.101;
  weaponChartPanel.userData = { dofFocusTarget: true };
  weaponChart.add(weaponChartPanel);
  const weaponChartRail = new THREE.Mesh(new THREE.BoxGeometry(7.65, 0.035, 0.035), cyan);
  weaponChartRail.name = "WeaponChartAccent";
  weaponChartRail.position.set(0, -1.72, 0.12);
  weaponChart.add(weaponChartRail);
  accents.add(weaponChart);

  const sofa = new THREE.Group();
  sofa.name = "SculpturalSofa";
  const sofaSeat = new THREE.Mesh(
    new RoundedBoxGeometry(3.05, 0.34, 0.92, 5, 0.14),
    createMaterial(COLORS.paleOak, 0.66, 0, surfaceTextures.wood, surfaceTextures.detail),
  );
  sofaSeat.position.set(PENTHOUSE_HALF_WIDTH_METERS - 6.2, 0.48, -PENTHOUSE_HALF_DEPTH_METERS + 4);
  sofaSeat.castShadow = true;
  sofa.add(sofaSeat);
  const sofaBack = new THREE.Mesh(
    new RoundedBoxGeometry(3.05, 0.92, 0.27, 5, 0.1),
    createMaterial(COLORS.paleOak, 0.66, 0, surfaceTextures.wood, surfaceTextures.detail),
  );
  sofaBack.position.set(
    PENTHOUSE_HALF_WIDTH_METERS - 6.2,
    1.0,
    -PENTHOUSE_HALF_DEPTH_METERS + 3.68,
  );
  sofaBack.castShadow = true;
  sofa.add(sofaBack);
  furniture.add(sofa);

  const sideTable = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.5, 24), aluminum);
  sideTable.name = "SideTable";
  sideTable.position.set(
    PENTHOUSE_HALF_WIDTH_METERS - 2.8,
    0.28,
    -PENTHOUSE_HALF_DEPTH_METERS + 5.7,
  );
  sideTable.castShadow = true;
  furniture.add(sideTable);
  const pendant = new THREE.Mesh(new RoundedBoxGeometry(2.55, 0.08, 0.11, 3, 0.025), aluminum);
  pendant.name = "LinearPendant";
  pendant.position.set(0, PENTHOUSE_CEILING_HEIGHT_METERS - 0.65, 0);
  furniture.add(pendant);
  const pendantLight = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.018, 0.04), cyan);
  pendantLight.name = "PendantLightStrip";
  pendantLight.position.set(0, PENTHOUSE_CEILING_HEIGHT_METERS - 0.71, 0);
  furniture.add(pendantLight);

  const bar = new THREE.Group();
  bar.name = "TeaCounter";
  const barBody = new THREE.Mesh(
    new RoundedBoxGeometry(2.25, 0.92, 0.52, 4, 0.1),
    createMaterial(COLORS.whiteLacquer, 0.3, 0, surfaceTextures.table, surfaceTextures.detail),
  );
  barBody.position.set(
    -PENTHOUSE_HALF_WIDTH_METERS + 5.2,
    0.46,
    -PENTHOUSE_HALF_DEPTH_METERS + 4.2,
  );
  barBody.castShadow = true;
  bar.add(barBody);
  const barTop = new THREE.Mesh(
    new RoundedBoxGeometry(2.38, 0.08, 0.61, 4, 0.025),
    createMaterial(COLORS.paleOak, 0.66, 0, surfaceTextures.wood, surfaceTextures.detail),
  );
  barTop.position.set(-PENTHOUSE_HALF_WIDTH_METERS + 5.2, 0.96, -PENTHOUSE_HALF_DEPTH_METERS + 4.2);
  bar.add(barTop);
  furniture.add(bar);

  const stationMaterial = createMaterial(
    COLORS.whiteLacquer,
    0.42,
    0,
    surfaceTextures.table,
    surfaceTextures.detail,
  );
  const stationInset = createMaterial(
    COLORS.charcoal,
    0.72,
    0,
    surfaceTextures.wall,
    surfaceTextures.detail,
  );
  const stationPlacements = [
    ["SouthPlayerStation", 0, 0, 2.03, 0],
    ["NorthPlayerStation", 0, 0, -2.03, Math.PI],
    ["EastPlayerStation", 2.03, 0, 0, -Math.PI / 2],
    ["WestPlayerStation", -2.03, 0, 0, Math.PI / 2],
  ] as const;
  for (const [name, x, y, z, rotation] of stationPlacements) {
    const station = new THREE.Group();
    station.name = name;
    station.position.set(x, y, z);
    station.rotation.y = rotation;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.18, 0.78, 4, 0.1), stationMaterial);
    seat.position.y = 0.42;
    seat.castShadow = true;
    seat.receiveShadow = true;
    station.add(seat);
    const seatInset = new THREE.Mesh(
      new RoundedBoxGeometry(0.92, 0.035, 0.56, 4, 0.06),
      stationInset,
    );
    seatInset.position.set(0, 0.52, 0.01);
    seatInset.receiveShadow = true;
    station.add(seatInset);
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.7, 0.14, 4, 0.07), stationMaterial);
    back.position.set(0, 0.82, 0.31);
    back.castShadow = true;
    station.add(back);
    furniture.add(station);
  }

  const playAreas = new THREE.Group();
  playAreas.name = "PlayAreas";
  playAreas.userData = { physicsIgnore: true };
  for (const area of PLAY_AREA_DEFINITIONS) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(PLAY_AREA_SIZE_METERS, 0.05, PLAY_AREA_SIZE_METERS),
      new THREE.MeshStandardMaterial({
        color: 0x18272d,
        roughness: 0.9,
        metalness: 0.04,
        transparent: true,
        opacity: 0.78,
      }),
    );
    pad.name = `${area.id}PlayAreaPad`;
    pad.position.set(area.origin.x, -0.075, area.origin.z);
    pad.receiveShadow = true;
    playAreas.add(pad);

    const borderMaterial = new THREE.MeshStandardMaterial({
      color: area.accent,
      emissive: area.accent,
      emissiveIntensity: 0.24,
      roughness: 0.38,
      metalness: 0.18,
    });
    const borderPieces = [
      new THREE.Mesh(new THREE.BoxGeometry(PLAY_AREA_SIZE_METERS, 0.055, 0.11), borderMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(PLAY_AREA_SIZE_METERS, 0.055, 0.11), borderMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, PLAY_AREA_SIZE_METERS), borderMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, PLAY_AREA_SIZE_METERS), borderMaterial),
    ] as const;
    const [northBorder, southBorder, westBorder, eastBorder] = borderPieces;
    const edge = PLAY_AREA_HALF_SIZE - 0.055;
    northBorder.position.set(area.origin.x, -0.01, area.origin.z - edge);
    southBorder.position.set(area.origin.x, -0.01, area.origin.z + edge);
    westBorder.position.set(area.origin.x - edge, -0.01, area.origin.z);
    eastBorder.position.set(area.origin.x + edge, -0.01, area.origin.z);
    for (const border of borderPieces) {
      border.name = `${area.id}PlayAreaBorder`;
      border.receiveShadow = true;
      playAreas.add(border);
    }

    const label = createLabelSprite(`${area.label.toUpperCase()}  /  50M X 50M`, area.accent);
    label.name = `${area.id}PlayAreaLabel`;
    label.position.set(area.origin.x, 0.2, area.origin.z - PLAY_AREA_HALF_SIZE + 1.2);
    label.scale.set(2.7, 0.42, 1);
    playAreas.add(label);
  }
  environment.add(playAreas);

  const addClimbingGym = (root: THREE.Object3D): void => {
    const gym = new THREE.Group();
    gym.name = "ClimbingGym";
    gym.userData = { physicsIgnore: true };
    const baseMaterial = createMaterial(0x3a4c57, 0.61, 0.05, undefined, surfaceTextures.detail);
    const ledgeMaterial = createMaterial(0x5f7784, 0.49, 0.12, undefined, surfaceTextures.detail);
    const railMaterial = createAccentMaterial(0x849ead, 0.54, 0.21, 0.18, surfaceTextures.detail);
    const resolveMaterial = (material: ClimbingGymObstacleMaterial): THREE.Material => {
      if (material === "base") {
        return baseMaterial;
      }
      if (material === "ledge") {
        return ledgeMaterial;
      }
      return railMaterial;
    };

    const addFeature = (obstacle: ClimbingGymObstacle): void => {
      const material = resolveMaterial(obstacle.material);

      if (obstacle.kind === "run") {
        const run = new THREE.Mesh(
          new RoundedBoxGeometry(obstacle.width, obstacle.height, obstacle.depth, 4, 0.08),
          material,
        );
        run.name = obstacle.name;
        run.position.set(obstacle.x, obstacle.y, obstacle.z);
        run.castShadow = true;
        run.receiveShadow = true;
        gym.add(run);
        return;
      }

      if (obstacle.kind === "vault") {
        const bevelRadius = Math.min(
          0.08,
          obstacle.topY * 0.35,
          obstacle.width * 0.2,
          obstacle.depth * 0.2,
        );
        const block = new THREE.Mesh(
          new RoundedBoxGeometry(obstacle.width, obstacle.topY, obstacle.depth, 4, bevelRadius),
          material,
        );
        block.name = obstacle.name;
        block.position.set(obstacle.x, obstacle.topY / 2, obstacle.z);
        block.castShadow = true;
        block.receiveShadow = true;
        gym.add(block);

        const heightLabel = createLabelSprite(`${obstacle.topY.toFixed(2)}M`, "#d7f2f6");
        heightLabel.name = `${obstacle.name}HeightLabel`;
        heightLabel.position.set(obstacle.x, obstacle.topY + 0.24, obstacle.z);
        heightLabel.scale.set(1.15, 0.28, 1);
        gym.add(heightLabel);
        return;
      }

      if (obstacle.kind === "ledge") {
        const ledge = new THREE.Mesh(
          new RoundedBoxGeometry(
            obstacle.width,
            CLIMBING_GYM_PLATFORM_HEIGHT_METERS,
            obstacle.depth,
            4,
            0.05,
          ),
          material,
        );
        ledge.name = obstacle.name;
        ledge.position.set(
          obstacle.x,
          obstacle.topY - CLIMBING_GYM_PLATFORM_HEIGHT_METERS / 2,
          obstacle.z,
        );
        ledge.castShadow = true;
        ledge.receiveShadow = true;
        gym.add(ledge);
        return;
      }

      const prism = new THREE.Mesh(
        new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
        material,
      );
      prism.name = obstacle.name;
      prism.position.set(obstacle.x, obstacle.y, obstacle.z);
      prism.castShadow = true;
      prism.receiveShadow = true;
      gym.add(prism);
    };

    const vaultRowLabel = createLabelSprite("VAULT HEIGHTS  ·  0.10M → 5.00M", "#73dce8");
    vaultRowLabel.name = "ClimbingGymVaultHeightRowLabel";
    vaultRowLabel.position.set(
      CLIMBING_GYM_VAULT_ROW_X,
      CLIMBING_GYM_VAULT_MAX_HEIGHT_METERS + 0.55,
      CLIMBING_GYM_VAULT_ROW_START_Z,
    );
    vaultRowLabel.scale.set(3.4, 0.42, 1);
    gym.add(vaultRowLabel);

    for (const obstacle of CLIMBING_GYM_TEST_FEATURES) {
      addFeature(obstacle);
    }

    root.add(gym);
  };
  addClimbingGym(furniture);
  scene.add(environment);
  return {
    ambient: {
      cyanMaterials: [cyan],
      redMaterials: [red],
    },
    teacherTexture,
    weaponChartTexture,
    glassSurfaces: [northGlass, eastGlass],
    simpleGlassMaterial,
    physicalGlassMaterial,
    surfaceTextures,
  };
};

interface GeneratedRoomPalette {
  readonly label: string;
  readonly accent: number;
  readonly secondary: number;
  readonly surface: number;
  readonly dark: number;
  readonly plant: number;
}

interface GeneratedRoomResult {
  readonly variant: string;
}

const GENERATED_ROOM_PALETTES: readonly GeneratedRoomPalette[] = [
  {
    label: "Northstone",
    accent: 0xa8b5c1,
    secondary: 0x6f808e,
    surface: 0x2d3740,
    dark: 0x1d252b,
    plant: 0x58646f,
  },
  {
    label: "Northstone +1",
    accent: 0x98a8b5,
    secondary: 0x64737f,
    surface: 0x2b343c,
    dark: 0x1a2127,
    plant: 0x525d68,
  },
  {
    label: "Northstone +2",
    accent: 0x9aa8b4,
    secondary: 0x697985,
    surface: 0x2f3942,
    dark: 0x1c242a,
    plant: 0x55616d,
  },
  {
    label: "Northstone +3",
    accent: 0xa0adba,
    secondary: 0x6a7a88,
    surface: 0x2a3540,
    dark: 0x191f25,
    plant: 0x56616d,
  },
] as const;

const addGeneratedPlanter = (
  parent: THREE.Object3D,
  position: THREE.Vector3,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
  surfaceTextures?: InteriorSurfaceTextures,
): void => {
  const planter = new THREE.Group();
  planter.name = "GeneratedPlanter";
  planter.position.copy(position);
  quantizeHorizontal(planter.position);
  planter.rotation.y = quantizeRotation45(random.nextFloat() * Math.PI * 2);
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.42, 18),
    createMaterial(palette.dark, 0.78, 0, surfaceTextures?.wall, surfaceTextures?.detail),
  );
  pot.position.y = 0.21;
  pot.castShadow = true;
  pot.receiveShadow = true;
  planter.add(pot);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 0.62, 8),
    createMaterial(palette.plant, 0.82, 0, undefined, surfaceTextures?.detail),
  );
  stem.position.y = 0.66;
  stem.castShadow = true;
  planter.add(stem);
  const leafGeometry = new THREE.IcosahedronGeometry(0.17, 1);
  const leafMaterial = createMaterial(palette.plant, 0.7, 0, undefined, surfaceTextures?.detail);
  const leafCount = 3 + random.nextInt(3);
  for (let index = 0; index < leafCount; index += 1) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.position.set(
      quantizeToGrid((random.nextFloat() - 0.5) * 0.28),
      0.94 + random.nextFloat() * 0.45,
      quantizeToGrid((random.nextFloat() - 0.5) * 0.28),
    );
    leaf.scale.set(0.58, 1.25 + random.nextFloat() * 0.55, 0.58);
    leaf.rotation.set(
      random.nextFloat() * 0.35,
      quantizeRotation45(random.nextFloat() * Math.PI * 2),
      0,
    );
    leaf.castShadow = true;
    planter.add(leaf);
  }
  parent.add(planter);
};

const addGeneratedDivider = (
  parent: THREE.Object3D,
  position: THREE.Vector3,
  rotation: number,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
  surfaceTextures?: InteriorSurfaceTextures,
): void => {
  const divider = new THREE.Group();
  divider.name = "GeneratedRoomDivider";
  divider.position.copy(position);
  quantizeHorizontal(divider.position);
  divider.rotation.y = quantizeRotation45(rotation);
  const frameMaterial = createMaterial(
    palette.secondary,
    0.38,
    0.34,
    surfaceTextures?.wood,
    surfaceTextures?.detail,
  );
  const lightMaterial = createAccentMaterial(
    palette.accent,
    0.34,
    0.12,
    0.24,
    surfaceTextures?.detail,
  );
  const width = quantizeScale(1.25 + random.nextFloat() * 0.72);
  const height = quantizeScale(2.25 + random.nextFloat() * 0.8);
  const slatCount = 3 + random.nextInt(3);
  const slatSpacing = width / Math.max(1, slatCount - 1);
  for (let index = 0; index < slatCount; index += 1) {
    const slat = new THREE.Mesh(
      new RoundedBoxGeometry(0.075, height, 0.12, 3, 0.02),
      frameMaterial,
    );
    slat.position.set((index - (slatCount - 1) / 2) * slatSpacing, height / 2, 0);
    slat.castShadow = true;
    divider.add(slat);
  }
  const header = new THREE.Mesh(
    new RoundedBoxGeometry(width + 0.12, 0.08, 0.15, 3, 0.02),
    lightMaterial,
  );
  header.position.y = height + 0.045;
  header.castShadow = true;
  divider.add(header);
  parent.add(divider);
};

const addGeneratedWallPanel = (
  parent: THREE.Object3D,
  position: THREE.Vector3,
  rotation: number,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
  surfaceTextures?: InteriorSurfaceTextures,
): void => {
  const panel = new THREE.Group();
  panel.name = "GeneratedWallPanel";
  panel.position.copy(position);
  quantizeHorizontal(panel.position);
  panel.rotation.y = quantizeRotation45(rotation);
  const width = quantizeScale(0.86 + random.nextFloat() * 0.78);
  const height = quantizeScale(0.92 + random.nextFloat() * 0.78);
  const panelMaterial = createMaterial(
    palette.surface,
    0.65,
    0,
    surfaceTextures?.wall,
    surfaceTextures?.detail,
  );
  const accentMaterial = createAccentMaterial(
    palette.accent,
    0.38,
    0.2,
    0.19,
    surfaceTextures?.detail,
  );
  const face = new THREE.Mesh(new RoundedBoxGeometry(width, height, 0.075, 4, 0.04), panelMaterial);
  face.position.y = 1.55 + height / 2;
  face.castShadow = true;
  panel.add(face);
  const barCount = 2 + random.nextInt(3);
  for (let index = 0; index < barCount; index += 1) {
    const bar = new THREE.Mesh(
      new RoundedBoxGeometry(width * (0.26 + random.nextFloat() * 0.34), 0.035, 0.09, 3, 0.012),
      accentMaterial,
    );
    bar.position.set(
      (random.nextFloat() - 0.5) * width * 0.35,
      1.7 + random.nextFloat() * Math.max(0.1, height - 0.22),
      0.055,
    );
    bar.rotation.z = (random.nextFloat() - 0.5) * 0.42;
    bar.castShadow = true;
    panel.add(bar);
  }
  parent.add(panel);
};

const addGeneratedLightBar = (
  parent: THREE.Object3D,
  position: THREE.Vector3,
  rotation: number,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
): void => {
  const width = quantizeScale(1.2 + random.nextFloat() * 1.7);
  const fixture = new THREE.Mesh(
    new RoundedBoxGeometry(width, 0.06, 0.075, 3, 0.018),
    new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.42,
      roughness: 0.3,
      metalness: 0.18,
    }),
  );
  fixture.name = "GeneratedLightBar";
  fixture.position.copy(position);
  quantizeHorizontal(fixture.position);
  fixture.rotation.y = quantizeRotation45(rotation);
  fixture.castShadow = true;
  parent.add(fixture);
};

const addGeneratedSculpture = (
  parent: THREE.Object3D,
  position: THREE.Vector3,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
  surfaceTextures?: InteriorSurfaceTextures,
): void => {
  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(0.85 + random.nextFloat() * 0.42, 0.6, 0.85, 4, 0.08),
    createMaterial(palette.secondary, 0.46, 0.08, undefined, surfaceTextures?.detail),
  );
  plinth.name = "GeneratedSculpturePlinth";
  plinth.position.copy(position);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  const sculpture = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.22 + random.nextFloat() * 0.1, 0.05, 48, 10),
    createAccentMaterial(palette.accent, 0.3, 0.62, 0.2, surfaceTextures?.detail),
  );
  sculpture.name = "GeneratedSculpture";
  sculpture.position.y = 0.72;
  sculpture.rotation.y = quantizeRotation45(random.nextFloat() * Math.PI * 2);
  sculpture.castShadow = true;
  plinth.add(sculpture);
  parent.add(plinth);
};

const setVisualMapEntityMetadata = (
  object: THREE.Object3D,
  id: string,
  kind: VisualMapEntityKind,
): void => {
  object.userData.visualMapEntityId = id;
  object.userData.visualMapEntityKind = kind;
};

const applyVisualMapEntityTransform = (object: THREE.Object3D, entity: VisualMapEntity): void => {
  object.position.set(...entity.position);
  object.rotation.y = THREE.MathUtils.degToRad(entity.rotationDegrees ?? 0);
  object.scale.setScalar(entity.scale ?? 1);
};

const addVisualMapEntity = (
  parent: THREE.Object3D,
  entity: VisualMapEntity,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
  surfaceTextures?: InteriorSurfaceTextures,
): THREE.Object3D => {
  const position = new THREE.Vector3(...entity.position);
  const childCount = parent.children.length;
  switch (entity.kind) {
    case "planter":
      addGeneratedPlanter(parent, position, palette, random, surfaceTextures);
      break;
    case "divider":
      addGeneratedDivider(
        parent,
        position,
        THREE.MathUtils.degToRad(entity.rotationDegrees ?? 0),
        palette,
        random,
        surfaceTextures,
      );
      break;
    case "wallPanel":
      addGeneratedWallPanel(
        parent,
        position,
        THREE.MathUtils.degToRad(entity.rotationDegrees ?? 0),
        palette,
        random,
        surfaceTextures,
      );
      break;
    case "lightBar":
      addGeneratedLightBar(
        parent,
        position,
        THREE.MathUtils.degToRad(entity.rotationDegrees ?? 0),
        palette,
        random,
      );
      break;
    case "sculpture":
      addGeneratedSculpture(parent, position, palette, random);
      break;
  }
  const object = parent.children[childCount];
  if (object === undefined) {
    throw new Error(`Could not create map entity ${entity.id}`);
  }
  object.name = `MapEntity:${entity.id}`;
  setVisualMapEntityMetadata(object, entity.id, entity.kind);
  applyVisualMapEntityTransform(object, entity);
  return object;
};

const applyVisualMapDocument = (
  root: THREE.Object3D,
  document: VisualMapDocument,
  palette: GeneratedRoomPalette,
  random: ReturnType<typeof createSeededRandom>,
  surfaceTextures?: InteriorSurfaceTextures,
): void => {
  const entitiesById = new Map(document.entities.map((entity) => [entity.id, entity]));
  for (const object of [...root.children]) {
    const id: unknown = object.userData.visualMapEntityId;
    if (typeof id !== "string") {
      continue;
    }
    const entity = entitiesById.get(id);
    if (entity === undefined) {
      root.remove(object);
      continue;
    }
    if (object.userData.visualMapEntityKind !== entity.kind) {
      root.remove(object);
      addVisualMapEntity(root, entity, palette, random, surfaceTextures);
      continue;
    }
    object.name = `MapEntity:${entity.id}`;
    applyVisualMapEntityTransform(object, entity);
  }
  const existingIds = new Set(
    root.children
      .map((object): unknown => object.userData.visualMapEntityId)
      .filter((id): id is string => typeof id === "string"),
  );
  for (const entity of document.entities) {
    if (!existingIds.has(entity.id)) {
      addVisualMapEntity(root, entity, palette, random, surfaceTextures);
    }
  }
};

const createGeneratedRoom = (
  scene: THREE.Scene,
  roomSeed: string,
  mapDocument: VisualMapDocument,
  surfaceTextures: InteriorSurfaceTextures,
): GeneratedRoomResult => {
  const normalizedSeed = normalizeVisualRoomSeed(roomSeed);
  const random = createSeededRandom(normalizedSeed);
  const palette =
    GENERATED_ROOM_PALETTES[random.nextInt(GENERATED_ROOM_PALETTES.length)] ??
    GENERATED_ROOM_PALETTES[0];
  if (palette === undefined) {
    throw new Error("Generated room palette is empty");
  }
  const root = new THREE.Group();
  root.name = "GeneratedRoomRoot";
  root.userData = { roomSeed: normalizedSeed, roomVariant: palette.label };

  random.nextFloat();
  random.nextFloat();
  const floorRotationSeed = random.nextFloat();
  const baseCeilingLightSeed = 1 + random.nextInt(2);
  const floorWidth = mapDocument.floor.width;
  const floorDepth = mapDocument.floor.depth;
  const requestedFloorRotationDegrees = mapDocument.floor.rotationDegrees;
  const floorRotation =
    requestedFloorRotationDegrees === undefined
      ? (floorRotationSeed - 0.5) * 0.12
      : THREE.MathUtils.degToRad(requestedFloorRotationDegrees);
  const floorMaterial = createEpoxyFloorMaterial(surfaceTextures.floor, surfaceTextures.detail);
  const floorPanel = new THREE.Mesh(
    new RoundedBoxGeometry(floorWidth, 0.035, floorDepth, 5, 0.18),
    floorMaterial,
  );
  floorPanel.name = "GeneratedFloorPanel";
  floorPanel.position.y = 0.052;
  floorPanel.rotation.y = floorRotation;
  floorPanel.receiveShadow = true;
  root.add(floorPanel);

  const floorAccentMaterial = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: 0.16,
    roughness: 0.4,
    metalness: 0.18,
  });
  const floorAccentWidth = Math.max(2.4, floorWidth - 0.2);
  const floorAccentDepth = Math.max(1.8, floorDepth - 0.2);
  for (const [x, z, width, depth] of [
    [0, -floorAccentDepth / 2, floorAccentWidth, 0.025],
    [0, floorAccentDepth / 2, floorAccentWidth, 0.025],
    [-floorAccentWidth / 2, 0, 0.025, floorAccentDepth],
    [floorAccentWidth / 2, 0, 0.025, floorAccentDepth],
  ] as const) {
    const strip = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.018, depth, 3, 0.006),
      floorAccentMaterial,
    );
    strip.position.set(x, 0.086, z);
    strip.receiveShadow = true;
    root.add(strip);
  }

  const baseCeilingLightCount = baseCeilingLightSeed;
  const objectDensity = 0.35;
  const densityAdjustedCeilingLightCount = Math.max(
    1,
    Math.round(baseCeilingLightCount * THREE.MathUtils.clamp(0.6 + objectDensity * 0.5, 0.6, 1.5)),
  );
  const ceilingLightCount = Math.min(4, densityAdjustedCeilingLightCount);
  const ceilingLightSpanX = Math.min(18, floorWidth * 0.42);
  const ceilingLightSpanZ = Math.min(12, floorDepth * 0.28);
  for (let index = 0; index < ceilingLightCount; index += 1) {
    const x = quantizeToGrid(-ceilingLightSpanX / 2 + random.nextFloat() * ceilingLightSpanX);
    const z = quantizeToGrid(-ceilingLightSpanZ / 2 + random.nextFloat() * ceilingLightSpanZ);
    addGeneratedLightBar(
      root,
      new THREE.Vector3(x, PENTHOUSE_CEILING_HEIGHT_METERS - 0.42 + random.nextFloat() * 0.16, z),
      random.nextFloat() > 0.5 ? 0 : Math.PI / 2,
      palette,
      random,
    );
    const object = root.children[root.children.length - 1];
    if (object !== undefined) {
      setVisualMapEntityMetadata(object, `ceiling-light-${String(index + 1)}`, "lightBar");
    }
  }

  const wallInset = Math.max(1.2, Math.min(2.4, Math.min(floorWidth, floorDepth) * 0.06));
  const roomHalfWidth = floorWidth / 2;
  const roomHalfDepth = floorDepth / 2;
  const wallSlots = [
    {
      position: new THREE.Vector3(-roomHalfWidth + wallInset, 0, -roomHalfDepth * 0.48),
      rotation: Math.PI / 2,
    },
    {
      position: new THREE.Vector3(-roomHalfWidth + wallInset, 0, roomHalfDepth * 0.34),
      rotation: Math.PI / 2,
    },
    {
      position: new THREE.Vector3(roomHalfWidth - wallInset, 0, -roomHalfDepth * 0.38),
      rotation: -Math.PI / 2,
    },
    {
      position: new THREE.Vector3(roomHalfWidth - wallInset, 0, roomHalfDepth * 0.42),
      rotation: -Math.PI / 2,
    },
    {
      position: new THREE.Vector3(-roomHalfWidth * 0.46, 0, roomHalfDepth - wallInset),
      rotation: Math.PI,
    },
    {
      position: new THREE.Vector3(roomHalfWidth * 0.34, 0, roomHalfDepth - wallInset),
      rotation: Math.PI,
    },
  ] as const;
  wallSlots.forEach((slot, index) => {
    if (random.nextFloat() > objectDensity * 0.45) {
      return;
    }
    const position = slot.position.clone();
    position.z += (random.nextFloat() - 0.5) * (Math.abs(slot.position.x) > 7 ? 0.35 : 0.2);
    position.x += Math.abs(slot.position.x) > 7 ? 0 : (random.nextFloat() - 0.5) * 0.32;
    quantizeHorizontal(position);
    const kind = (random.nextInt(4) + index) % 4;
    const childCount = root.children.length;
    let entityKind: VisualMapEntityKind;
    if (kind === 0) {
      entityKind = "planter";
      addGeneratedPlanter(
        root,
        new THREE.Vector3(position.x, 0, position.z),
        palette,
        random,
        surfaceTextures,
      );
    } else if (kind === 1) {
      entityKind = "divider";
      addGeneratedDivider(root, position, slot.rotation, palette, random, surfaceTextures);
    } else if (kind === 2) {
      entityKind = "wallPanel";
      addGeneratedWallPanel(root, position, slot.rotation, palette, random, surfaceTextures);
    } else {
      entityKind = "lightBar";
      addGeneratedLightBar(
        root,
        new THREE.Vector3(
          position.x,
          PENTHOUSE_CEILING_HEIGHT_METERS - 1.34 + random.nextFloat() * 0.44,
          position.z,
        ),
        slot.rotation,
        palette,
        random,
      );
    }
    const object = root.children[childCount];
    if (object !== undefined) {
      setVisualMapEntityMetadata(object, `wall-slot-${String(index + 1)}`, entityKind);
    }
  });

  const sculpturePosition = new THREE.Vector3(
    roomHalfWidth - 3,
    0.3,
    roomHalfDepth - 4 + random.nextFloat() * 2.2,
  );
  quantizeHorizontal(sculpturePosition);
  const sculptureChildCount = root.children.length;
  addGeneratedSculpture(root, sculpturePosition, palette, random, surfaceTextures);
  const sculptureObject = root.children[sculptureChildCount];
  if (sculptureObject !== undefined) {
    setVisualMapEntityMetadata(sculptureObject, "sculpture", "sculpture");
  }

  applyVisualMapDocument(root, mapDocument, palette, random, surfaceTextures);

  scene.add(root);
  return { variant: palette.label };
};

interface ExplorationWorld {
  readonly update: (position: THREE.Vector3) => void;
  readonly updateKnockables: (
    deltaSeconds: number,
    playerPosition: THREE.Vector3,
    impactDelta: PhysicsVector,
    impactCollisions: number,
    grounded: boolean,
    dynamicBodyStates?: readonly PhysicsBodyState[],
    applyImpulse?: (
      dynamicId: number,
      linearVelocity: PhysicsVector,
      angularVelocity: PhysicsVector,
    ) => void,
  ) => void;
  readonly getArea: () => string;
  readonly getLoadedChunkCount: () => number;
  readonly getPhysicsBoxes: () => readonly PhysicsBox[];
  readonly getMeleePickups: () => readonly ExplorationMeleePickup[];
  readonly getMeleeObjectIdForHit: (
    object: THREE.Object3D,
    instanceIndex: number | undefined,
  ) => number | null;
  /** Resolve the lowest warehouse rack supporting a grounded player position. */
  readonly getMeleeSupportTarget: (position: PhysicsVector) => ExplorationMeleeSupportTarget | null;
  /** Resolve any streamed knockable prop, including one already in ragdoll. */
  readonly getRagdollObjectIdForHit: (
    object: THREE.Object3D,
    instanceIndex: number | undefined,
  ) => number | null;
  readonly equipMeleeObject: (objectId: number) => ExplorationMeleePickup | null;
  readonly dropMeleeObject: (
    objectId: number,
    position: THREE.Vector3,
    rotationY: number,
    releaseVelocity?: PhysicsVector,
  ) => boolean;
  readonly applyMeleeHit: (
    objectId: number,
    direction: PhysicsVector,
    swingSpeed: number,
    stoppingPower?: number,
  ) => boolean;
  /** Apply one projectile's stopping-power impulse to a knockable prop. */
  readonly applyProjectileHit: (
    objectId: number,
    direction: PhysicsVector,
    stoppingPower: number,
    applyImpulse?: (
      dynamicId: number,
      linearVelocity: PhysicsVector,
      angularVelocity: PhysicsVector,
    ) => void,
  ) => boolean;
  readonly getPhysicsVersion: () => number;
  readonly dispose: () => void;
}

interface ExplorationMeleePickup {
  readonly objectId: number;
  readonly snapshot: MeleeObjectSnapshot;
  readonly mesh: THREE.InstancedMesh;
  readonly index: number;
  readonly halfExtents: PhysicsVector;
  readonly color: number;
}

interface ExplorationMeleeSupportTarget {
  readonly objectId: number;
  readonly position: PhysicsVector;
}

interface ExplorationChunk {
  readonly root: THREE.Group;
  readonly physicsBoxes: readonly PhysicsBox[];
  readonly knockableProps: readonly ExplorationKnockable[];
}

interface ExplorationKnockable {
  readonly mesh: THREE.InstancedMesh;
  readonly index: number;
  readonly basePosition: THREE.Vector3;
  readonly baseScale: THREE.Vector3;
  readonly baseQuaternion: THREE.Quaternion;
  readonly halfExtents: PhysicsVector;
  readonly displayName: string;
  readonly color: number;
  rotationY?: number;
  readonly physicsId: number;
  /** Warehouse server cabinets are released only by projectile/melee impact. */
  readonly warehouseRack?: boolean;
  readonly fallAxis: THREE.Vector3;
  readonly launchLinearVelocity: THREE.Vector3;
  readonly launchAngularVelocity: THREE.Vector3;
  isKnocked: boolean;
  /** A dropped held prop remains recoverable while its ragdoll body settles. */
  isDropped: boolean;
  isEquipped: boolean;
  angle: number;
  angularVelocity: number;
  targetAngle: number;
  hasBodyState: boolean;
  kickCooldownSeconds: number;
}

const refreshKnockableMeshBounds = (mesh: THREE.InstancedMesh): void => {
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
};

type WarehouseSilhouettePoint = readonly [number, number];

/** Build a shallow, bevelled tool silhouette in the local X/Y plane. */
const createWarehouseSilhouetteGeometry = (
  points: readonly WarehouseSilhouettePoint[],
  depth = 0.18,
): THREE.BufferGeometry => {
  const firstPoint = points[0];
  if (firstPoint === undefined) {
    throw new Error("Warehouse melee silhouettes must contain at least one point");
  }
  const shape = new THREE.Shape();
  shape.moveTo(firstPoint[0], firstPoint[1]);
  for (const point of points.slice(1)) {
    shape.lineTo(point[0], point[1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeBoundingBox();
  return geometry;
};

/** Create the recognizable procedural silhouette for one warehouse pickup. */
const createWarehouseMeleeGeometry = (kind: DebuggingTwoMeleeKind): THREE.BufferGeometry => {
  switch (kind) {
    case "steel-pipe":
      return new THREE.CylinderGeometry(0.09, 0.09, 1, 16);
    case "crowbar":
      return createWarehouseSilhouetteGeometry([
        [-0.055, -0.5],
        [0.055, -0.5],
        [0.055, 0.19],
        [0.12, 0.3],
        [0.2, 0.31],
        [0.21, 0.4],
        [0.09, 0.4],
        [-0.035, 0.28],
        [-0.035, -0.5],
      ]);
    case "fire-extinguisher":
      return createWarehouseSilhouetteGeometry(
        [
          [-0.15, -0.32],
          [0.15, -0.32],
          [0.17, -0.24],
          [0.17, 0.25],
          [0.1, 0.34],
          [0.08, 0.43],
          [0.14, 0.47],
          [0.13, 0.5],
          [-0.08, 0.5],
          [-0.08, 0.46],
          [-0.03, 0.42],
          [-0.04, 0.34],
          [-0.14, 0.27],
          [-0.17, 0.2],
        ],
        0.22,
      );
    case "pipe-wrench":
      return createWarehouseSilhouetteGeometry([
        [-0.055, -0.5],
        [0.055, -0.5],
        [0.055, 0.19],
        [0.14, 0.27],
        [0.2, 0.38],
        [0.13, 0.45],
        [0.07, 0.35],
        [0.01, 0.31],
        [-0.08, 0.4],
        [-0.18, 0.43],
        [-0.14, 0.3],
        [-0.055, 0.19],
      ]);
    case "hammer":
      return createWarehouseSilhouetteGeometry(
        [
          [-0.05, -0.5],
          [0.05, -0.5],
          [0.05, 0.25],
          [0.22, 0.28],
          [0.22, 0.44],
          [-0.22, 0.44],
          [-0.22, 0.28],
          [-0.05, 0.25],
        ],
        0.2,
      );
    case "screwdriver":
      return createWarehouseSilhouetteGeometry(
        [
          [-0.12, -0.5],
          [0.12, -0.5],
          [0.16, -0.42],
          [0.14, -0.22],
          [0.1, -0.12],
          [0.03, -0.1],
          [0.03, 0.5],
          [-0.03, 0.5],
          [-0.03, -0.1],
          [-0.1, -0.12],
          [-0.14, -0.22],
          [-0.16, -0.42],
        ],
        0.14,
      );
    case "fireman-axe":
      return createWarehouseSilhouetteGeometry(
        [
          [-0.05, -0.5],
          [0.05, -0.5],
          [0.05, 0.2],
          [0.16, 0.25],
          [0.29, 0.37],
          [0.25, 0.49],
          [0.13, 0.47],
          [-0.04, 0.38],
          [-0.08, 0.27],
          [-0.05, 0.2],
        ],
        0.2,
      );
    case "box-cutter":
      return createWarehouseSilhouetteGeometry(
        [
          [-0.14, -0.5],
          [0.14, -0.5],
          [0.14, 0.12],
          [0.24, 0.18],
          [0.24, 0.26],
          [0.07, 0.31],
          [0.07, 0.5],
          [-0.07, 0.5],
          [-0.07, 0.31],
          [-0.14, 0.26],
        ],
        0.16,
      );
  }
};

const resolveWarehouseMeleeHalfExtents = (
  geometry: THREE.BufferGeometry,
  scale: THREE.Vector3,
): PhysicsVector => {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null) {
    return { x: 0.09 * scale.x, y: 0.5 * scale.y, z: 0.09 * scale.z };
  }
  const size = new THREE.Vector3();
  bounds.getSize(size);
  return {
    x: (size.x * Math.abs(scale.x)) / 2,
    y: (size.y * Math.abs(scale.y)) / 2,
    z: (size.z * Math.abs(scale.z)) / 2,
  };
};

interface ExplorationBuildingSpec {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly rotation: number;
}

interface ExplorationWindowSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly rotation: number;
}

const addExplorationGateway = (scene: THREE.Scene): void => {
  const gateway = new THREE.Group();
  gateway.name = "ExplorationGateway";
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f4f7,
    roughness: 0.34,
    metalness: 0.22,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f9ea8,
    emissive: 0x8f9ea8,
    emissiveIntensity: 0.32,
    roughness: 0.3,
    metalness: 0.18,
  });
  for (const x of [-1.65, 1.65] as const) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.14, 2.8, 0.14, 4, 0.035), frameMaterial);
    post.position.set(x, 1.4, 7.15);
    post.castShadow = true;
    gateway.add(post);
  }
  const beam = new THREE.Mesh(new RoundedBoxGeometry(3.45, 0.16, 0.16, 4, 0.04), frameMaterial);
  beam.position.set(0, 2.78, 7.15);
  beam.castShadow = true;
  gateway.add(beam);
  const beamLight = new THREE.Mesh(
    new RoundedBoxGeometry(2.9, 0.055, 0.08, 3, 0.02),
    accentMaterial,
  );
  beamLight.position.set(0, 2.67, 7.15);
  beamLight.castShadow = true;
  gateway.add(beamLight);
  const threshold = new THREE.Mesh(
    new RoundedBoxGeometry(3.1, 0.045, 0.34, 4, 0.025),
    accentMaterial,
  );
  threshold.position.set(0, 0.08, 7.15);
  threshold.receiveShadow = true;
  gateway.add(threshold);
  const arrowMaterial = new THREE.MeshStandardMaterial({
    color: 0xa4b2bd,
    emissive: 0xa4b2bd,
    emissiveIntensity: 0.18,
    roughness: 0.34,
  });
  for (const z of [7.68, 8.26, 8.84] as const) {
    const marker = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.025, 0.11, 3, 0.01), arrowMaterial);
    marker.position.set(0, 0.08, z);
    marker.receiveShadow = true;
    gateway.add(marker);
  }
  scene.add(gateway);
};

export const createExplorationWorld = (
  scene: THREE.Scene,
  roomSeed: string,
  surfaceTextures?: InteriorSurfaceTextures,
  onAreaChange?: (area: string) => void,
  warehouseResources?: DebuggingTwoMapResources,
): ExplorationWorld => {
  const normalizedSeed = normalizeVisualRoomSeed(roomSeed);
  const isWarehouseMode = warehouseResources !== undefined;
  const root = new THREE.Group();
  root.name = "ExplorationWorldRoot";
  root.userData = {
    roomSeed: normalizedSeed,
    streaming: !isWarehouseMode,
    ...(isWarehouseMode ? { mapId: "debugging-02", generation: "warehouse-melee-v1" } : {}),
  };
  scene.add(root);

  const groundGeometry = new THREE.BoxGeometry(
    EXPLORATION_CHUNK_SIZE - 0.08,
    0.1,
    EXPLORATION_CHUNK_SIZE - 0.08,
  );
  const pathGeometry = new THREE.BoxGeometry(EXPLORATION_CHUNK_SIZE * 0.84, 0.026, 0.9);
  const propGeometry = new RoundedBoxGeometry(0.28, 1, 0.28, 3, 0.04);
  const beaconGeometry = new RoundedBoxGeometry(0.12, 0.12, 0.12, 3, 0.02);
  const citySignGeometry = new RoundedBoxGeometry(1.25, 0.22, 0.06, 2, 0.02);
  const utilityPostGeometry = new RoundedBoxGeometry(0.12, 2, 0.12, 2, 0.03);
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const windowGeometry = new THREE.BoxGeometry(0.56, 0.055, 0.045);
  const bridgeGeometry = new RoundedBoxGeometry(EXPLORATION_CHUNK_SIZE * 0.86, 0.14, 0.2, 3, 0.035);
  const groundMaterials = EXPLORATION_BIOMES.map((style) =>
    createMaterial(style.ground, 0.9, 0, undefined, surfaceTextures?.detail),
  );
  const pathMaterials = EXPLORATION_BIOMES.map((style) =>
    createMaterial(style.path, 0.82, 0, undefined, surfaceTextures?.detail),
  );
  const propMaterials = EXPLORATION_BIOMES.map((style) =>
    createMaterial(style.prop, 0.66, 0.05, undefined, surfaceTextures?.detail),
  );
  const accentMaterials = EXPLORATION_BIOMES.map((style) =>
    createAccentMaterial(style.accent, 0.35, 0.16, 0.28, surfaceTextures?.detail),
  );
  const buildingMaterials = EXPLORATION_BIOMES.map((style) =>
    createMaterial(style.prop, 0.78, 0.08, undefined, surfaceTextures?.detail),
  );
  const windowMaterials = EXPLORATION_BIOMES.map((style) =>
    createAccentMaterial(style.accent, 0.32, 0.18, 0.2, surfaceTextures?.detail),
  );
  const bridgeMaterials = EXPLORATION_BIOMES.map((style) =>
    createMaterial(style.path, 0.48, 0.44, undefined, surfaceTextures?.detail),
  );
  const citySignMaterials = EXPLORATION_BIOMES.map((style) =>
    createAccentMaterial(style.accent, 0.24, 0.25, 0.35, surfaceTextures?.detail),
  );
  const utilityPostMaterials = EXPLORATION_BIOMES.map((style) =>
    createAccentMaterial(style.path, 0.38, 0.22, 0.16, surfaceTextures?.detail),
  );
  const warehouseMeleeGeometries = new Map<DebuggingTwoMeleeKind, THREE.BufferGeometry>(
    (
      [
        "crowbar",
        "steel-pipe",
        "fire-extinguisher",
        "pipe-wrench",
        "hammer",
        "screwdriver",
        "fireman-axe",
        "box-cutter",
      ] as const
    ).map((kind): [DebuggingTwoMeleeKind, THREE.BufferGeometry] => {
      const geometry = createWarehouseMeleeGeometry(kind);
      geometry.userData = { warehouseMeleeKind: kind };
      return [kind, geometry];
    }),
  );
  const warehouseMeleeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.22,
    vertexColors: true,
  });
  const activeChunks = new Map<string, ExplorationChunk>();
  const knockCollisionRefreshDistance = 1.05;
  const knockImpactSpeedMin = 0.9;
  const knockAngularVelocityMax = 2.9;
  const knockAngularVelocityMin = 1.3;
  const knockApproachDotMin = 0.05;
  const knockableHeightMax = 0.9;
  const knockLinearImpulseScale = 0.85;
  const knockLiftImpulse = 0.55;
  const knockAngularImpulseScale = 3.1;
  const knockedLinearDamping = 0.22;
  const knockedAngularDamping = 0.25;
  const knockedRestitution = 0.35;
  const knockedFriction = 0.21;
  const knockRehitCooldownSeconds = 0.12;
  const droppedRagdollLiftVelocity = 0.32;
  const droppedRagdollSpinVelocity = 2.6;
  let nextKnockablePhysicsId = 0;
  const knockAxis = new THREE.Vector3(0, 0, 1);
  const knockDirection = new THREE.Vector3();
  const knockToObject = new THREE.Vector3();
  const knockQuaternion = new THREE.Quaternion();
  const knockMatrix = new THREE.Matrix4();
  let physicsVersion = 0;
  let currentArea = warehouseResources?.explorationArea ?? "Penthouse";

  const warehouseRackSupportTolerance = DEBUGGING_TWO_BOX_SIZE * 0.12;
  const warehouseRackLayerTolerance = DEBUGGING_TWO_BOX_SIZE * 0.04;

  const activateWarehouseRack = (
    rack: ExplorationKnockable,
    direction: PhysicsVector,
    stoppingPower: number,
    isImpactRoot: boolean,
  ): void => {
    warehouseResources?.markRackDamaged(rack.index);
    activateKnockableRagdoll(rack, direction);
    const safeStoppingPower = Number.isFinite(stoppingPower) ? Math.max(0, stoppingPower) : 0;
    const horizontalDirection = new THREE.Vector3(direction.x, 0, direction.z);
    if (horizontalDirection.lengthSq() <= Number.EPSILON) {
      horizontalDirection.set(0, 0, -1);
    } else {
      horizontalDirection.normalize();
    }
    const impulseScale = isImpactRoot
      ? THREE.MathUtils.clamp(0.55 + safeStoppingPower * 0.22, 0.55, 4.4)
      : THREE.MathUtils.clamp(0.12 + safeStoppingPower * 0.025, 0.12, 0.55);
    rack.launchLinearVelocity.set(
      horizontalDirection.x * impulseScale,
      isImpactRoot ? 1.15 + safeStoppingPower * 0.08 : 0.12,
      horizontalDirection.z * impulseScale,
    );
    rack.launchAngularVelocity
      .copy(rack.fallAxis)
      .multiplyScalar(
        isImpactRoot ? THREE.MathUtils.clamp(1.8 + safeStoppingPower * 0.12, 1.8, 4.8) : 1.6,
      );
    rack.kickCooldownSeconds = knockRehitCooldownSeconds;
  };

  const releaseSupportedWarehouseRacks = (
    rootRack: ExplorationKnockable,
    direction: PhysicsVector,
    stoppingPower: number,
  ): void => {
    const released = new Set<number>();
    const pending: ExplorationKnockable[] = [rootRack];
    while (pending.length > 0) {
      const supportRack = pending.shift();
      if (supportRack === undefined) {
        continue;
      }
      for (const chunk of activeChunks.values()) {
        for (const candidate of chunk.knockableProps) {
          if (
            candidate.warehouseRack !== true ||
            candidate.isEquipped ||
            candidate.isKnocked ||
            released.has(candidate.physicsId)
          ) {
            continue;
          }
          const sameSupportCell =
            Math.abs(candidate.basePosition.x - supportRack.basePosition.x) <=
              warehouseRackSupportTolerance &&
            Math.abs(candidate.basePosition.z - supportRack.basePosition.z) <=
              warehouseRackSupportTolerance;
          const directlySupported =
            Math.abs(
              candidate.basePosition.y -
                (supportRack.basePosition.y + DEBUGGING_TWO_BOX_STACK_PITCH),
            ) <= warehouseRackLayerTolerance;
          if (!sameSupportCell || !directlySupported) {
            continue;
          }
          released.add(candidate.physicsId);
          activateWarehouseRack(candidate, direction, stoppingPower, false);
          pending.push(candidate);
        }
      }
    }
  };

  const activateKnockableRagdoll = (
    knockable: ExplorationKnockable,
    direction: PhysicsVector,
  ): void => {
    knockDirection.set(direction.x, 0, direction.z);
    if (knockDirection.lengthSq() <= Number.EPSILON) {
      knockDirection.set(0, 0, -1);
    } else {
      knockDirection.normalize();
    }
    knockable.isKnocked = true;
    knockable.angle = 0;
    knockable.hasBodyState = false;
    knockable.kickCooldownSeconds = knockRehitCooldownSeconds;
    knockAxis.set(knockDirection.z, 0, -knockDirection.x);
    if (knockAxis.lengthSq() <= Number.EPSILON) {
      knockAxis.set(1, 0, 0);
    }
    knockAxis.normalize();
    knockable.fallAxis.copy(knockAxis);
  };

  // Existing generator branches use this name; keep every streamed building,
  // prop, window, bridge, and beacon out of all authored play-area squares.
  const isExplorationRectOutsidePenthouse = (rect: ExplorationRect): boolean =>
    isExplorationRectOutsidePlayAreas(rect);

  const addClippedMeshes = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | undefined,
    rect: ExplorationRect,
    baseWidth: number,
    baseDepth: number,
    y: number,
    name: string,
    receiveShadow: boolean,
  ): void => {
    if (material === undefined) {
      return;
    }
    for (const piece of clipExplorationRectAroundPlayAreas(rect)) {
      const clippedPiece = {
        minX: Math.max(piece.minX, WORLD_BOUNDS.minX),
        maxX: Math.min(piece.maxX, WORLD_BOUNDS.maxX),
        minZ: Math.max(piece.minZ, WORLD_BOUNDS.minZ),
        maxZ: Math.min(piece.maxZ, WORLD_BOUNDS.maxZ),
      };
      if (clippedPiece.maxX <= clippedPiece.minX || clippedPiece.maxZ <= clippedPiece.minZ) {
        continue;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(
        (clippedPiece.minX + clippedPiece.maxX) / 2,
        y,
        (clippedPiece.minZ + clippedPiece.maxZ) / 2,
      );
      mesh.scale.set(
        (clippedPiece.maxX - clippedPiece.minX) / baseWidth,
        1,
        (clippedPiece.maxZ - clippedPiece.minZ) / baseDepth,
      );
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
    }
  };

  const chunkCoordinate = (value: number): number =>
    Math.floor((value + EXPLORATION_CHUNK_SIZE / 2) / EXPLORATION_CHUNK_SIZE);
  const chunkKey = (x: number, z: number): string => `${String(x)}:${String(z)}`;
  // Keep the playable square bounds unchanged, but omit diagonal chunks whose
  // centres sit beyond the compact radial footprint.
  const shouldRenderExplorationChunk = (chunkX: number, chunkZ: number): boolean =>
    Math.hypot(chunkX * EXPLORATION_CHUNK_SIZE, chunkZ * EXPLORATION_CHUNK_SIZE) <=
    EXPLORATION_WORLD_RADIUS_METERS;
  const describeArea = (position: THREE.Vector3): string => {
    if (warehouseResources !== undefined) {
      return warehouseResources.explorationArea;
    }
    const playArea = PLAY_AREA_BOUNDS.find(
      (bounds) =>
        position.x >= bounds.minX &&
        position.x <= bounds.maxX &&
        position.z >= bounds.minZ &&
        position.z <= bounds.maxZ,
    );
    if (playArea !== undefined) {
      return playArea.label;
    }
    if (position.z > 7.2 && Math.abs(position.x) < 15) {
      return "South courtyard";
    }
    if (position.x < -8.9) {
      return "West tea garden";
    }
    if (position.x > 8.9) {
      return "East practice court";
    }
    if (position.z < -7.2) {
      return "North skybridge";
    }
    return "Exploration grounds";
  };

  const createWarehouseChunk = (): ExplorationChunk => {
    if (warehouseResources === undefined) {
      throw new Error("Warehouse exploration resources are missing");
    }
    const chunk = new THREE.Group();
    chunk.name = "DebuggingTwoWarehouseMeleeChunk";
    chunk.userData = {
      mapId: "debugging-02",
      roomSeed: normalizedSeed,
      area: warehouseResources.explorationArea,
      generation: "warehouse-melee-v1",
    };
    const knockableProps: ExplorationKnockable[] = [];
    const yAxis = new THREE.Vector3(0, 1, 0);
    const rackBodyMesh = warehouseResources.rackBodyMesh;
    if (rackBodyMesh.count !== warehouseResources.physicsBoxes.length) {
      throw new Error("Warehouse rack render and physics counts must match");
    }
    const rackMatrix = new THREE.Matrix4();
    const rackPosition = new THREE.Vector3();
    const rackQuaternion = new THREE.Quaternion();
    const rackScale = new THREE.Vector3();
    warehouseResources.physicsBoxes.forEach((physicsBox, index) => {
      rackBodyMesh.getMatrixAt(index, rackMatrix);
      rackMatrix.decompose(rackPosition, rackQuaternion, rackScale);
      knockableProps.push({
        mesh: rackBodyMesh,
        index,
        basePosition: rackPosition.clone(),
        baseScale: rackScale.clone(),
        baseQuaternion: rackQuaternion.clone(),
        halfExtents: physicsBox.halfExtents,
        displayName: "Data-center server",
        color: 0x102534,
        physicsId: nextKnockablePhysicsId,
        warehouseRack: true,
        fallAxis: new THREE.Vector3(0, 0, 1),
        launchLinearVelocity: new THREE.Vector3(),
        launchAngularVelocity: new THREE.Vector3(),
        isKnocked: false,
        isDropped: false,
        isEquipped: false,
        angle: 0,
        angularVelocity: 0,
        targetAngle: Math.PI * 0.7,
        hasBodyState: false,
        kickCooldownSeconds: 0,
        ...(physicsBox.rotationY === undefined ? {} : { rotationY: physicsBox.rotationY }),
      });
      nextKnockablePhysicsId += 1;
    });
    for (const spawn of warehouseResources.meleeObjects) {
      const geometry = warehouseMeleeGeometries.get(spawn.kind);
      if (geometry === undefined) {
        throw new Error(`Warehouse melee geometry is missing for: ${spawn.kind}`);
      }
      const mesh = new THREE.InstancedMesh(geometry, warehouseMeleeMaterial, 1);
      mesh.name = `WarehouseMeleeObject:${spawn.id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        mapId: "debugging-02",
        mapFeature: "warehouse-melee",
        meleeObjectId: spawn.id,
      };
      const basePosition = new THREE.Vector3(...spawn.position);
      const baseScale = new THREE.Vector3(...spawn.scale);
      const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(yAxis, spawn.rotationY);
      const matrix = new THREE.Matrix4().compose(basePosition, baseQuaternion, baseScale);
      mesh.setMatrixAt(0, matrix);
      mesh.setColorAt(0, new THREE.Color(spawn.color));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
      mesh.computeBoundingSphere();
      chunk.add(mesh);
      knockableProps.push({
        mesh,
        index: 0,
        basePosition,
        baseScale,
        baseQuaternion,
        halfExtents: resolveWarehouseMeleeHalfExtents(geometry, baseScale),
        displayName: spawn.displayName,
        color: spawn.color,
        warehouseRack: false,
        rotationY: spawn.rotationY,
        physicsId: nextKnockablePhysicsId,
        fallAxis: new THREE.Vector3(0, 0, 1),
        launchLinearVelocity: new THREE.Vector3(),
        launchAngularVelocity: new THREE.Vector3(),
        isKnocked: false,
        isDropped: false,
        isEquipped: false,
        angle: 0,
        angularVelocity: 0,
        targetAngle: Math.PI * 0.7,
        hasBodyState: false,
        kickCooldownSeconds: 0,
      });
      nextKnockablePhysicsId += 1;
    }
    return { root: chunk, physicsBoxes: [], knockableProps };
  };

  const createChunk = (chunkX: number, chunkZ: number): ExplorationChunk => {
    if (isWarehouseMode) {
      return createWarehouseChunk();
    }
    const random = createSeededRandom(
      `${normalizedSeed}|exploration|${String(chunkX)}|${String(chunkZ)}`,
    );
    const biome = resolveExplorationBiome(normalizedSeed, chunkX, chunkZ);
    const style = biome.style;
    const styleIndex = biome.styleIndex;
    const terrainHeight = THREE.MathUtils.lerp(
      EXPLORATION_DISTRICT_ELEVATION_MIN,
      EXPLORATION_DISTRICT_ELEVATION_MAX,
      biome.elevation,
    );
    const featureBias = biome.featureNoise;
    const routeSeed = createSeededRandom(
      `${normalizedSeed}|exploration-route|${String(chunkX)}|${String(chunkZ)}`,
    );
    const chunk = new THREE.Group();
    const physicsBoxes: PhysicsBox[] = [];
    const knockableProps: ExplorationKnockable[] = [];
    chunk.name = `ExplorationChunk:${String(chunkX)}:${String(chunkZ)}`;
    chunk.userData = {
      chunkX,
      chunkZ,
      roomSeed: normalizedSeed,
      area: style.label,
    };
    const originX = chunkX * EXPLORATION_CHUNK_SIZE;
    const originZ = chunkZ * EXPLORATION_CHUNK_SIZE;
    const chunkHalfSize = EXPLORATION_CHUNK_SIZE / 2 - 0.04;
    addClippedMeshes(
      chunk,
      groundGeometry,
      groundMaterials[styleIndex],
      {
        minX: originX - chunkHalfSize,
        maxX: originX + chunkHalfSize,
        minZ: originZ - chunkHalfSize,
        maxZ: originZ + chunkHalfSize,
      },
      EXPLORATION_CHUNK_SIZE - 0.08,
      EXPLORATION_CHUNK_SIZE - 0.08,
      -0.06,
      "CityGround",
      true,
    );
    addClippedMeshes(
      chunk,
      pathGeometry,
      pathMaterials[styleIndex],
      {
        minX: originX - EXPLORATION_CHUNK_SIZE * 0.42,
        maxX: originX + EXPLORATION_CHUNK_SIZE * 0.42,
        minZ: originZ - 0.45,
        maxZ: originZ + 0.45,
      },
      EXPLORATION_CHUNK_SIZE * 0.84,
      0.9,
      0.012,
      "CityGridPath",
      true,
    );
    if (routeSeed.nextFloat() < style.pathFrequency) {
      const laneOffset = (routeSeed.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE * 0.22);
      addClippedMeshes(
        chunk,
        pathGeometry,
        pathMaterials[styleIndex],
        {
          minX: originX - EXPLORATION_CHUNK_SIZE * 0.32,
          maxX: originX + EXPLORATION_CHUNK_SIZE * 0.32,
          minZ: originZ - 0.3 + laneOffset,
          maxZ: originZ + 0.3 + laneOffset,
        },
        EXPLORATION_CHUNK_SIZE * 0.64,
        0.6,
        0.014,
        "CityDistrictRoad",
        true,
      );
    }

    // Keep a cross-city route at every chunk seam. The buildings and props
    // vary by seed, but the two orthogonal routes remain continuous so a
    // player can cross from one streamed block into the next without hitting
    // a dead-end caused by a random local road orientation.
    addClippedMeshes(
      chunk,
      pathGeometry,
      pathMaterials[styleIndex],
      {
        minX: originX - 0.45,
        maxX: originX + 0.45,
        minZ: originZ - EXPLORATION_CHUNK_SIZE * 0.42,
        maxZ: originZ + EXPLORATION_CHUNK_SIZE * 0.42,
      },
      0.9,
      EXPLORATION_CHUNK_SIZE * 0.84,
      0.013,
      "CityGridCrossPath",
      true,
    );

    const buildingCount = Math.max(
      1,
      Math.round(
        (style.buildingDensity + terrainHeight * 1.72 + featureBias * 1.15) *
          EXPLORATION_DENSITY_SCALE,
      ),
    );
    const buildingSpecs: ExplorationBuildingSpec[] = [];
    for (let index = 0; index < buildingCount; index += 1) {
      const edge = random.nextInt(4);
      const edgeOffset = (random.nextFloat() - 0.5) * EXPLORATION_CHUNK_BUILDING_EDGE_JITTER;
      const x = quantizeToGrid(
        edge === 0
          ? originX - EXPLORATION_CHUNK_BUILDING_EDGE_OFFSET + edgeOffset
          : edge === 1
            ? originX + EXPLORATION_CHUNK_BUILDING_EDGE_OFFSET + edgeOffset
            : originX + edgeOffset,
      );
      const z = quantizeToGrid(
        edge === 2
          ? originZ - EXPLORATION_CHUNK_BUILDING_EDGE_OFFSET + edgeOffset
          : edge === 3
            ? originZ + EXPLORATION_CHUNK_BUILDING_EDGE_OFFSET + edgeOffset
            : originZ + edgeOffset,
      );
      const width = quantizeScale(1 + random.nextFloat() * (1 + featureBias * 1.2));
      const height = quantizeScale(
        style.buildingHeightMin +
          random.nextFloat() * (style.buildingHeightMax - style.buildingHeightMin) +
          terrainHeight * EXPLORATION_BUILDING_ELEVATION_LIFT +
          featureBias * EXPLORATION_BUILDING_FEATURE_LIFT,
      );
      const depth = quantizeScale(1 + random.nextFloat() * (1 + terrainHeight));
      const rotation = random.nextInt(4) * (Math.PI / 2);
      const swapsAxes = Math.abs(Math.sin(rotation)) > 0.5;
      if (
        !isExplorationRectOutsidePenthouse({
          minX: x - (swapsAxes ? depth : width) / 2,
          maxX: x + (swapsAxes ? depth : width) / 2,
          minZ: z - (swapsAxes ? width : depth) / 2,
          maxZ: z + (swapsAxes ? width : depth) / 2,
        }) ||
        isExplorationRectOutsideWorld({
          minX: x - (swapsAxes ? depth : width) / 2,
          maxX: x + (swapsAxes ? depth : width) / 2,
          minZ: z - (swapsAxes ? width : depth) / 2,
          maxZ: z + (swapsAxes ? width : depth) / 2,
        }) ||
        !isExplorationRectOutsideFocusCalibrationRamp({
          minX: x - (swapsAxes ? depth : width) / 2,
          maxX: x + (swapsAxes ? depth : width) / 2,
          minZ: z - (swapsAxes ? width : depth) / 2,
          maxZ: z + (swapsAxes ? width : depth) / 2,
        })
      ) {
        continue;
      }
      buildingSpecs.push({ x, z, width, height, depth, rotation });
      physicsBoxes.push({
        center: { x, y: height / 2, z },
        halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
        rotationY: rotation,
      });
    }
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    if (buildingSpecs.length > 0) {
      const buildings = new THREE.InstancedMesh(
        buildingGeometry,
        buildingMaterials[styleIndex],
        buildingSpecs.length,
      );
      buildings.name = "CityBlockBuildingInstances";
      buildings.castShadow = true;
      buildings.receiveShadow = true;
      buildingSpecs.forEach((building, index) => {
        position.set(building.x, building.height / 2, building.z);
        rotation.setFromAxisAngle(yAxis, building.rotation);
        scale.set(building.width, building.height, building.depth);
        matrix.compose(position, rotation, scale);
        buildings.setMatrixAt(index, matrix);
      });
      buildings.instanceMatrix.needsUpdate = true;
      buildings.computeBoundingSphere();
      chunk.add(buildings);
    }

    const windowPlacements: ExplorationWindowSpec[] = [];
    for (const building of buildingSpecs) {
      const rows = Math.min(
        Math.floor(style.windowHeight / 0.95),
        Math.max(2, Math.floor(building.height / 1.05)),
      );
      const frontOffset = building.depth / 2 + 0.035;
      const offsetX = Math.sin(building.rotation) * frontOffset;
      const offsetZ = Math.cos(building.rotation) * frontOffset;
      for (let row = 0; row < rows; row += 1) {
        const windowWidth = Math.max(0.28, building.width * 0.42);
        const swapsAxes = Math.abs(Math.sin(building.rotation)) > 0.5;
        const halfWidth = swapsAxes ? 0.0225 : 0.28 * windowWidth;
        const halfDepth = swapsAxes ? 0.28 * windowWidth : 0.0225;
        const windowX = quantizeToGrid(building.x + offsetX);
        const windowZ = quantizeToGrid(building.z + offsetZ);
        if (
          !isExplorationRectOutsidePenthouse({
            minX: windowX - halfWidth,
            maxX: windowX + halfWidth,
            minZ: windowZ - halfDepth,
            maxZ: windowZ + halfDepth,
          }) ||
          isExplorationRectOutsideWorld({
            minX: windowX - halfWidth,
            maxX: windowX + halfWidth,
            minZ: windowZ - halfDepth,
            maxZ: windowZ + halfDepth,
          }) ||
          !isExplorationRectOutsideFocusCalibrationRamp({
            minX: windowX - halfWidth,
            maxX: windowX + halfWidth,
            minZ: windowZ - halfDepth,
            maxZ: windowZ + halfDepth,
          })
        ) {
          continue;
        }
        windowPlacements.push({
          x: windowX,
          y: 0.75 + row * 0.96,
          z: windowZ,
          width: windowWidth,
          rotation: building.rotation,
        });
      }
    }
    if (windowPlacements.length > 0) {
      const windows = new THREE.InstancedMesh(
        windowGeometry,
        windowMaterials[styleIndex],
        windowPlacements.length,
      );
      windows.name = "CityBlockWindowInstances";
      windows.castShadow = true;
      windowPlacements.forEach((window, index) => {
        position.set(window.x, window.y, window.z);
        rotation.setFromAxisAngle(yAxis, window.rotation);
        scale.set(window.width, 1, 1);
        matrix.compose(position, rotation, scale);
        windows.setMatrixAt(index, matrix);
      });
      windows.instanceMatrix.needsUpdate = true;
      windows.computeBoundingSphere();
      chunk.add(windows);
    }

    if (random.nextFloat() < style.bridgeDensity * (0.5 + style.preferredElevation)) {
      const bridgeRotation = random.nextFloat() > 0.5 ? 0 : Math.PI / 2;
      const bridgeLength = EXPLORATION_CHUNK_SIZE * 0.86;
      const bridgeHalfWidth = bridgeRotation === 0 ? bridgeLength / 2 : 0.1;
      const bridgeHalfDepth = bridgeRotation === 0 ? 0.1 : bridgeLength / 2;
      const bridgeX = originX;
      const bridgeZ = originZ;
      if (
        isExplorationRectOutsidePenthouse({
          minX: bridgeX - bridgeHalfWidth,
          maxX: bridgeX + bridgeHalfWidth,
          minZ: bridgeZ - bridgeHalfDepth,
          maxZ: bridgeZ + bridgeHalfDepth,
        }) &&
        isExplorationRectOutsideWorld({
          minX: bridgeX - bridgeHalfWidth,
          maxX: bridgeX + bridgeHalfWidth,
          minZ: bridgeZ - bridgeHalfDepth,
          maxZ: bridgeZ + bridgeHalfDepth,
        }) &&
        isExplorationRectOutsideFocusCalibrationRamp({
          minX: bridgeX - bridgeHalfWidth,
          maxX: bridgeX + bridgeHalfWidth,
          minZ: bridgeZ - bridgeHalfDepth,
          maxZ: bridgeZ + bridgeHalfDepth,
        })
      ) {
        const bridge = new THREE.Mesh(bridgeGeometry, bridgeMaterials[styleIndex]);
        bridge.name = "SkybridgeSpan";
        bridge.position.set(
          originX,
          3.2 + random.nextFloat() * 1.9 + terrainHeight * 0.65,
          originZ,
        );
        bridge.rotation.y = quantizeRotation45(bridgeRotation);
        bridge.castShadow = true;
        bridge.receiveShadow = true;
        chunk.add(bridge);
        physicsBoxes.push({
          center: { x: originX, y: bridge.position.y, z: originZ },
          halfExtents: { x: bridgeLength / 2, y: 0.07, z: 0.1 },
          rotationY: bridgeRotation,
        });
      }
    }

    const propCount = Math.max(
      1,
      Math.round(
        (style.propDensity * 2 + featureBias + random.nextFloat()) * EXPLORATION_DENSITY_SCALE,
      ),
    );
    const propMatrices: THREE.Matrix4[] = [];
    const propTransforms: {
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
      readonly displayName: string;
    }[] = [];
    const citySignCount = Math.max(
      1,
      Math.round(
        (style.citySignDensity + featureBias + random.nextFloat()) * EXPLORATION_DENSITY_SCALE,
      ),
    );
    const citySignMatrices: THREE.Matrix4[] = [];
    const citySignTransforms: {
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
      readonly displayName: string;
    }[] = [];
    const utilityPostCount = Math.max(
      1,
      Math.round((style.utilityPostDensity + random.nextFloat() * 0.7) * EXPLORATION_DENSITY_SCALE),
    );
    const utilityPostMatrices: THREE.Matrix4[] = [];
    const utilityPostTransforms: {
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
      readonly displayName: string;
    }[] = [];
    for (let index = 0; index < propCount; index += 1) {
      position.set(
        quantizeToGrid(originX + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 1.4)),
        quantizeToGrid(0.4 + random.nextFloat() * 0.8),
        quantizeToGrid(originZ + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 1.4)),
      );
      const rotationY = quantizeRotation45(random.nextFloat() * Math.PI * 2);
      rotation.setFromAxisAngle(yAxis, rotationY);
      scale.set(
        quantizeScale(0.65 + random.nextFloat() * 1.25),
        quantizeScale(0.65 + random.nextFloat() * 2.2),
        quantizeScale(0.65 + random.nextFloat() * 1.25),
      );
      const halfExtent = 0.14 * Math.max(scale.x, scale.z);
      if (
        !isExplorationRectOutsidePenthouse({
          minX: position.x - halfExtent,
          maxX: position.x + halfExtent,
          minZ: position.z - halfExtent,
          maxZ: position.z + halfExtent,
        }) ||
        isExplorationRectOutsideWorld({
          minX: position.x - halfExtent,
          maxX: position.x + halfExtent,
          minZ: position.z - halfExtent,
          maxZ: position.z + halfExtent,
        }) ||
        !isExplorationRectOutsideFocusCalibrationRamp({
          minX: position.x - halfExtent,
          maxX: position.x + halfExtent,
          minZ: position.z - halfExtent,
          maxZ: position.z + halfExtent,
        })
      ) {
        continue;
      }
      matrix.compose(position, rotation, scale);
      propMatrices.push(matrix.clone());
      const halfExtents = { x: scale.x * 0.14, y: scale.y * 0.5, z: scale.z * 0.14 };
      propTransforms.push({
        position: position.clone(),
        quaternion: rotation.clone(),
        scale: scale.clone(),
        halfExtents,
        rotationY,
        displayName: "Ragdoll Prop",
      });
    }
    for (let index = 0; index < citySignCount; index += 1) {
      position.set(
        quantizeToGrid(originX + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 2.1)),
        quantizeToGrid(1 + random.nextFloat() * 1.2),
        quantizeToGrid(originZ + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 2.1)),
      );
      const rotationY = quantizeRotation45(random.nextFloat() * Math.PI * 2);
      rotation.setFromAxisAngle(yAxis, rotationY);
      scale.set(
        quantizeScale(0.8 + random.nextFloat() * 1.4),
        quantizeScale(0.8 + random.nextFloat() * 0.9),
        quantizeScale(0.08 + random.nextFloat() * 0.09),
      );
      const baseHalfWidth = 0.625 * scale.x;
      const baseHalfHeight = 0.11 * scale.y;
      const baseHalfDepth = 0.03 * scale.z;
      const halfWidth =
        Math.abs(Math.cos(rotationY)) * baseHalfWidth +
        Math.abs(Math.sin(rotationY)) * baseHalfDepth;
      const halfDepth =
        Math.abs(Math.sin(rotationY)) * baseHalfWidth +
        Math.abs(Math.cos(rotationY)) * baseHalfDepth;
      if (
        !isExplorationRectOutsidePenthouse({
          minX: position.x - halfWidth,
          maxX: position.x + halfWidth,
          minZ: position.z - halfDepth,
          maxZ: position.z + halfDepth,
        }) ||
        isExplorationRectOutsideWorld({
          minX: position.x - halfWidth,
          maxX: position.x + halfWidth,
          minZ: position.z - halfDepth,
          maxZ: position.z + halfDepth,
        }) ||
        !isExplorationRectOutsideFocusCalibrationRamp({
          minX: position.x - halfWidth,
          maxX: position.x + halfWidth,
          minZ: position.z - halfDepth,
          maxZ: position.z + halfDepth,
        })
      ) {
        continue;
      }
      matrix.compose(position, rotation, scale);
      citySignMatrices.push(matrix.clone());
      citySignTransforms.push({
        position: position.clone(),
        quaternion: rotation.clone(),
        scale: scale.clone(),
        halfExtents: { x: baseHalfWidth, y: baseHalfHeight, z: baseHalfDepth },
        rotationY,
        displayName: "Ragdoll Sign",
      });
    }
    for (let index = 0; index < utilityPostCount; index += 1) {
      position.set(
        quantizeToGrid(originX + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 2)),
        0,
        quantizeToGrid(originZ + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 2)),
      );
      const rotationY = random.nextFloat() > 0.5 ? 0 : Math.PI / 2;
      rotation.setFromAxisAngle(yAxis, rotationY);
      scale.set(
        quantizeScale(0.6 + random.nextFloat() * 0.7),
        quantizeScale(1.4 + random.nextFloat() * 1.2),
        quantizeScale(0.6 + random.nextFloat() * 0.7),
      );
      position.y = scale.y / 2;
      const baseHalfWidth = 0.06 * scale.x;
      const baseHalfDepth = 0.06 * scale.z;
      if (
        !isExplorationRectOutsidePenthouse({
          minX: position.x - baseHalfWidth,
          maxX: position.x + baseHalfWidth,
          minZ: position.z - baseHalfDepth,
          maxZ: position.z + baseHalfDepth,
        }) ||
        isExplorationRectOutsideWorld({
          minX: position.x - baseHalfWidth,
          maxX: position.x + baseHalfWidth,
          minZ: position.z - baseHalfDepth,
          maxZ: position.z + baseHalfDepth,
        }) ||
        !isExplorationRectOutsideFocusCalibrationRamp({
          minX: position.x - baseHalfWidth,
          maxX: position.x + baseHalfWidth,
          minZ: position.z - baseHalfDepth,
          maxZ: position.z + baseHalfDepth,
        })
      ) {
        continue;
      }
      matrix.compose(position, rotation, scale);
      utilityPostMatrices.push(matrix.clone());
      utilityPostTransforms.push({
        position: position.clone(),
        quaternion: rotation.clone(),
        scale: scale.clone(),
        halfExtents: { x: baseHalfWidth, y: scale.y / 2, z: baseHalfDepth },
        rotationY,
        displayName: "Ragdoll Utility Post",
      });
    }
    if (propMatrices.length > 0) {
      const props = new THREE.InstancedMesh(
        propGeometry,
        propMaterials[styleIndex],
        propMatrices.length,
      );
      props.name = "ExplorationPropInstances";
      props.castShadow = true;
      props.receiveShadow = true;
      propMatrices.forEach((propMatrix, index) => {
        props.setMatrixAt(index, propMatrix);
      });
      propMatrices.forEach((_, index) => {
        const transform = propTransforms[index];
        if (transform === undefined) {
          return;
        }
        knockableProps.push({
          physicsId: nextKnockablePhysicsId,
          mesh: props,
          index,
          basePosition: transform.position,
          baseScale: transform.scale,
          baseQuaternion: transform.quaternion,
          halfExtents: transform.halfExtents,
          displayName: transform.displayName,
          color: style.prop,
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
          isDropped: false,
          isEquipped: false,
          angle: 0,
          angularVelocity: 0,
          targetAngle: Math.PI * 0.75,
        });
        nextKnockablePhysicsId += 1;
      });
      props.instanceMatrix.needsUpdate = true;
      props.computeBoundingSphere();
      chunk.add(props);
    }
    if (citySignMatrices.length > 0) {
      const signs = new THREE.InstancedMesh(
        citySignGeometry,
        citySignMaterials[styleIndex],
        citySignMatrices.length,
      );
      signs.name = "CitySignInstances";
      signs.castShadow = true;
      signs.receiveShadow = true;
      citySignMatrices.forEach((citySignMatrix, index) => {
        signs.setMatrixAt(index, citySignMatrix);
      });
      citySignMatrices.forEach((_, index) => {
        const transform = citySignTransforms[index];
        if (transform === undefined) {
          return;
        }
        knockableProps.push({
          physicsId: nextKnockablePhysicsId,
          mesh: signs,
          index,
          basePosition: transform.position,
          baseScale: transform.scale,
          baseQuaternion: transform.quaternion,
          halfExtents: transform.halfExtents,
          displayName: transform.displayName,
          color: style.accent,
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
          isDropped: false,
          isEquipped: false,
          angle: 0,
          angularVelocity: 0,
          targetAngle: Math.PI * 0.52,
        });
        nextKnockablePhysicsId += 1;
      });
      signs.instanceMatrix.needsUpdate = true;
      signs.computeBoundingSphere();
      chunk.add(signs);
    }
    if (utilityPostMatrices.length > 0) {
      const utilityPosts = new THREE.InstancedMesh(
        utilityPostGeometry,
        utilityPostMaterials[styleIndex],
        utilityPostMatrices.length,
      );
      utilityPosts.name = "CityUtilityPostInstances";
      utilityPosts.castShadow = true;
      utilityPosts.receiveShadow = true;
      utilityPostMatrices.forEach((utilityPostMatrix, index) => {
        utilityPosts.setMatrixAt(index, utilityPostMatrix);
      });
      utilityPostMatrices.forEach((_, index) => {
        const transform = utilityPostTransforms[index];
        if (transform === undefined) {
          return;
        }
        knockableProps.push({
          physicsId: nextKnockablePhysicsId,
          mesh: utilityPosts,
          index,
          basePosition: transform.position,
          baseScale: transform.scale,
          baseQuaternion: transform.quaternion,
          halfExtents: transform.halfExtents,
          displayName: transform.displayName,
          color: style.path,
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
          isDropped: false,
          isEquipped: false,
          angle: 0,
          angularVelocity: 0,
          targetAngle: Math.PI * 0.52,
        });
        nextKnockablePhysicsId += 1;
      });
      utilityPosts.instanceMatrix.needsUpdate = true;
      utilityPosts.computeBoundingSphere();
      chunk.add(utilityPosts);
    }

    const beaconCount = random.nextFloat() < style.beaconDensity * 1.2 + featureBias * 0.2 ? 1 : 0;
    const beaconMatrices: THREE.Matrix4[] = [];
    const beaconTransforms: {
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
      readonly displayName: string;
    }[] = [];
    const beaconScale = new THREE.Vector3(1, 1, 1);
    rotation.identity();
    for (let index = 0; index < beaconCount; index += 1) {
      position.set(
        quantizeToGrid(originX + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 1.2)),
        quantizeToGrid(1.5 + random.nextFloat() * 1.8),
        quantizeToGrid(originZ + (random.nextFloat() - 0.5) * (EXPLORATION_CHUNK_SIZE - 1.2)),
      );
      if (
        !isExplorationRectOutsidePenthouse({
          minX: position.x - 0.06,
          maxX: position.x + 0.06,
          minZ: position.z - 0.06,
          maxZ: position.z + 0.06,
        }) ||
        isExplorationRectOutsideWorld({
          minX: position.x - 0.06,
          maxX: position.x + 0.06,
          minZ: position.z - 0.06,
          maxZ: position.z + 0.06,
        }) ||
        !isExplorationRectOutsideFocusCalibrationRamp({
          minX: position.x - 0.06,
          maxX: position.x + 0.06,
          minZ: position.z - 0.06,
          maxZ: position.z + 0.06,
        })
      ) {
        continue;
      }
      matrix.compose(position, rotation, beaconScale);
      beaconMatrices.push(matrix.clone());
      beaconTransforms.push({
        position: position.clone(),
        quaternion: rotation.clone(),
        scale: beaconScale.clone(),
        halfExtents: { x: 0.06, y: 0.06, z: 0.06 },
        rotationY: 0,
        displayName: "Ragdoll Beacon",
      });
    }
    if (beaconMatrices.length > 0) {
      const beacons = new THREE.InstancedMesh(
        beaconGeometry,
        accentMaterials[styleIndex],
        beaconMatrices.length,
      );
      beacons.name = "ExplorationBeaconInstances";
      beacons.castShadow = true;
      beaconMatrices.forEach((beaconMatrix, index) => {
        beacons.setMatrixAt(index, beaconMatrix);
      });
      beaconMatrices.forEach((_, index) => {
        const transform = beaconTransforms[index];
        if (transform === undefined) {
          return;
        }
        knockableProps.push({
          physicsId: nextKnockablePhysicsId,
          mesh: beacons,
          index,
          basePosition: transform.position,
          baseScale: transform.scale,
          baseQuaternion: transform.quaternion,
          halfExtents: transform.halfExtents,
          displayName: transform.displayName,
          color: style.accent,
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
          isDropped: false,
          isEquipped: false,
          angle: 0,
          angularVelocity: 0,
          targetAngle: Math.PI * 0.68,
        });
        nextKnockablePhysicsId += 1;
      });
      beacons.instanceMatrix.needsUpdate = true;
      beacons.computeBoundingSphere();
      chunk.add(beacons);
    }
    return {
      root: chunk,
      physicsBoxes,
      knockableProps,
    };
  };

  const disposeChunk = (chunk: THREE.Group): void => {
    // InstancedMesh owns a separate instance-matrix GPU buffer even when its
    // base geometry/material is shared by every chunk. Release that buffer at
    // full scene teardown instead of waiting for an unpredictable garbage-
    // collection pass.
    chunk.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) {
        object.dispose();
      }
    });
  };

  const preloadAllChunks = (): void => {
    if (isWarehouseMode) {
      const chunk = createWarehouseChunk();
      activeChunks.set("warehouse", chunk);
      root.add(chunk.root);
      physicsVersion += 1;
      return;
    }
    let physicsChanged = false;
    const minChunkX = chunkCoordinate(WORLD_BOUNDS.minX);
    const maxChunkX = chunkCoordinate(WORLD_BOUNDS.maxX);
    const minChunkZ = chunkCoordinate(WORLD_BOUNDS.minZ);
    const maxChunkZ = chunkCoordinate(WORLD_BOUNDS.maxZ);

    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
        if (!shouldRenderExplorationChunk(chunkX, chunkZ)) {
          continue;
        }
        const key = chunkKey(chunkX, chunkZ);
        if (activeChunks.has(key)) {
          continue;
        }
        const chunk = createChunk(chunkX, chunkZ);
        activeChunks.set(key, chunk);
        root.add(chunk.root);
        physicsChanged = true;
      }
    }
    if (physicsChanged) {
      physicsVersion += 1;
    }
  };

  const update = (position: THREE.Vector3): void => {
    const nextArea = describeArea(position);
    if (nextArea !== currentArea) {
      currentArea = nextArea;
      onAreaChange?.(currentArea);
    }
  };

  const updateKnockables = (
    deltaSeconds: number,
    playerPosition: THREE.Vector3,
    impactDelta: PhysicsVector,
    impactCollisions: number,
    playerGrounded: boolean,
    dynamicBodyStates: readonly PhysicsBodyState[] = [],
    applyImpulse?: (
      dynamicId: number,
      linearVelocity: PhysicsVector,
      angularVelocity: PhysicsVector,
    ) => void,
  ): void => {
    if (deltaSeconds <= 0) {
      return;
    }
    const dynamicStateById = new Map<number, PhysicsBodyState>();
    for (const dynamicBodyState of dynamicBodyStates) {
      dynamicStateById.set(dynamicBodyState.dynamicId, dynamicBodyState);
    }
    const updatedMeshes = new Set<THREE.InstancedMesh>();
    const impactMagnitude = Math.hypot(impactDelta.x, impactDelta.z);
    const impactSpeed = impactMagnitude / Math.max(deltaSeconds, 1 / 240);
    const shouldKnock =
      impactSpeed >= knockImpactSpeedMin && playerGrounded && impactCollisions > 0;
    if (impactMagnitude > 0) {
      knockDirection.set(impactDelta.x, 0, impactDelta.z).normalize();
    } else {
      knockDirection.set(0, 0, 0);
    }
    let physicsChanged = false;

    for (const chunk of activeChunks.values()) {
      for (const knockable of chunk.knockableProps) {
        if (knockable.isEquipped) {
          continue;
        }
        const wasKnocked = knockable.isKnocked;
        if (knockable.kickCooldownSeconds > 0) {
          knockable.kickCooldownSeconds = Math.max(0, knockable.kickCooldownSeconds - deltaSeconds);
        }
        if (!knockable.isKnocked) {
          if (!shouldKnock || impactMagnitude <= 0) {
            continue;
          }
          // Server cabinets are released by a projectile impact, not by the
          // player brushing against their static support footprint.
          if (knockable.warehouseRack === true) {
            continue;
          }
          if (knockable.halfExtents.y > knockableHeightMax) {
            continue;
          }
          knockToObject.set(
            knockable.basePosition.x - playerPosition.x,
            0,
            knockable.basePosition.z - playerPosition.z,
          );
          const impactDistance = knockToObject.length();
          if (
            impactDistance >
            knockCollisionRefreshDistance +
              Math.max(knockable.halfExtents.x, knockable.halfExtents.z)
          ) {
            continue;
          }
          if (impactDistance <= Number.EPSILON) {
            continue;
          }
          const knockApproach = knockToObject.dot(knockDirection) / impactDistance;
          if (knockApproach <= knockApproachDotMin) {
            continue;
          }
          knockable.isKnocked = true;
          knockable.angle = 0;
          knockable.hasBodyState = false;
          const impactFactor = Math.max(
            0,
            Math.min(1, (impactSpeed - knockImpactSpeedMin) / knockImpactSpeedMin),
          );
          const knockScale = Math.max(0.02, impactFactor);
          knockable.angularVelocity =
            knockAngularVelocityMin +
            (knockAngularVelocityMax - knockAngularVelocityMin) * impactFactor;
          knockAxis.set(knockDirection.z, 0, -knockDirection.x);
          if (knockAxis.lengthSq() <= Number.EPSILON) {
            knockAxis.set(1, 0, 0);
          }
          knockAxis.normalize();
          knockable.fallAxis.copy(knockAxis);
          knockable.launchLinearVelocity.set(
            knockDirection.x * knockLinearImpulseScale * knockScale * 1.9,
            knockLiftImpulse + knockScale * 0.8,
            knockDirection.z * knockLinearImpulseScale * knockScale * 1.9,
          );
          knockable.launchAngularVelocity
            .copy(knockAxis)
            .multiplyScalar(knockAngularImpulseScale * (knockScale + 0.12));
          physicsChanged = true;
        }
        const bodyState = dynamicStateById.get(knockable.physicsId);
        if (bodyState !== undefined) {
          knockable.basePosition.set(bodyState.center.x, bodyState.center.y, bodyState.center.z);
        }
        if (
          wasKnocked &&
          shouldKnock &&
          knockable.warehouseRack !== true &&
          knockable.kickCooldownSeconds <= 0 &&
          impactMagnitude > 0 &&
          knockable.halfExtents.y <= knockableHeightMax
        ) {
          knockToObject.set(
            knockable.basePosition.x - playerPosition.x,
            0,
            knockable.basePosition.z - playerPosition.z,
          );
          const impactDistance = knockToObject.length();
          if (
            impactDistance <=
              knockCollisionRefreshDistance +
                Math.max(knockable.halfExtents.x, knockable.halfExtents.z) &&
            impactDistance > Number.EPSILON
          ) {
            const knockApproach = knockToObject.dot(knockDirection) / impactDistance;
            if (knockApproach > knockApproachDotMin) {
              const impactFactor = Math.max(
                0,
                Math.min(1, (impactSpeed - knockImpactSpeedMin) / knockImpactSpeedMin),
              );
              const knockScale = Math.max(0.02, impactFactor);
              knockAxis.set(knockDirection.z, 0, -knockDirection.x);
              if (knockAxis.lengthSq() <= Number.EPSILON) {
                knockAxis.set(1, 0, 0);
              }
              knockAxis.normalize();
              const impulseLinear = {
                x: knockDirection.x * knockLinearImpulseScale * knockScale * 1.1,
                y: knockLiftImpulse * 0.2,
                z: knockDirection.z * knockLinearImpulseScale * knockScale * 1.1,
              };
              const impulseAngular = {
                x: knockAxis.x * knockAngularImpulseScale * (knockScale + 0.1),
                y: knockAxis.y * knockAngularImpulseScale * (knockScale + 0.1),
                z: knockAxis.z * knockAngularImpulseScale * (knockScale + 0.1),
              };
              if (bodyState === undefined) {
                knockable.launchLinearVelocity.set(
                  impulseLinear.x,
                  impulseLinear.y,
                  impulseLinear.z,
                );
                knockable.launchAngularVelocity.set(
                  impulseAngular.x,
                  impulseAngular.y,
                  impulseAngular.z,
                );
                physicsChanged = true;
              } else {
                applyImpulse?.(knockable.physicsId, impulseLinear, impulseAngular);
              }
              knockable.kickCooldownSeconds = knockRehitCooldownSeconds;
            }
          }
        }
        if (bodyState === undefined) {
          knockable.hasBodyState = false;
          if (knockable.angle < knockable.targetAngle) {
            knockable.angle += knockable.angularVelocity * deltaSeconds;
            knockable.angularVelocity *= 1 - Math.min(0.9, 10 * deltaSeconds);
            if (knockable.angle >= knockable.targetAngle) {
              knockable.angle = knockable.targetAngle;
              knockable.angularVelocity = 0;
            }
          }
          knockQuaternion.setFromAxisAngle(knockable.fallAxis, knockable.angle);
          knockMatrix.compose(
            knockable.basePosition,
            knockQuaternion.multiply(knockable.baseQuaternion),
            knockable.baseScale,
          );
        } else {
          knockable.hasBodyState = true;
          knockQuaternion.set(
            bodyState.rotation.x,
            bodyState.rotation.y,
            bodyState.rotation.z,
            bodyState.rotation.w,
          );
          knockMatrix.compose(
            new THREE.Vector3(bodyState.center.x, bodyState.center.y, bodyState.center.z),
            knockQuaternion,
            knockable.baseScale,
          );
        }
        knockable.mesh.setMatrixAt(knockable.index, knockMatrix);
        knockable.mesh.instanceMatrix.needsUpdate = true;
        updatedMeshes.add(knockable.mesh);
      }
    }
    for (const mesh of updatedMeshes) {
      refreshKnockableMeshBounds(mesh);
    }
    // Rack LEDs are stored in rack-local space. Recompose them only after the
    // live body instances have received their Rapier/fallback transforms so
    // they tumble with the cabinets instead of remaining at spawn positions.
    warehouseResources?.updateRackPresentation();
    if (physicsChanged) {
      physicsVersion += 1;
    }
  };

  const writeKnockableMatrix = (
    knockable: ExplorationKnockable,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    scale: THREE.Vector3,
  ): void => {
    knockMatrix.compose(position, quaternion, scale);
    knockable.mesh.setMatrixAt(knockable.index, knockMatrix);
    knockable.mesh.instanceMatrix.needsUpdate = true;
    refreshKnockableMeshBounds(knockable.mesh);
  };

  const meleeLongestSize = (knockable: ExplorationKnockable): number =>
    resolveMeleeLongestSizeMeters(knockable.halfExtents);

  const meleeVolume = (knockable: ExplorationKnockable): number =>
    Math.max(
      0.0001,
      8 * knockable.halfExtents.x * knockable.halfExtents.y * knockable.halfExtents.z,
    );

  const toMeleePickup = (knockable: ExplorationKnockable): ExplorationMeleePickup => {
    const swing = resolveMeleeSwing(meleeVolume(knockable));
    return {
      objectId: knockable.physicsId,
      snapshot: {
        objectId: knockable.physicsId,
        displayName: knockable.displayName,
        volumeM3: swing.volumeM3,
        rangeMeters: resolveMeleeRangeMeters(meleeLongestSize(knockable)),
        swingSpeedRadiansPerSecond: swing.swingSpeedRadiansPerSecond,
        damage: swing.damage,
        stoppingPower: swing.stoppingPower,
        oxygenCost: swing.oxygenCost,
      },
      mesh: knockable.mesh,
      index: knockable.index,
      halfExtents: knockable.halfExtents,
      color: knockable.color,
    };
  };

  const findKnockable = (objectId: number): ExplorationKnockable | null => {
    for (const chunk of activeChunks.values()) {
      const knockable = chunk.knockableProps.find((candidate) => candidate.physicsId === objectId);
      if (knockable !== undefined) {
        return knockable;
      }
    }
    return null;
  };

  const isPositionInsideRackFootprint = (
    position: PhysicsVector,
    rack: ExplorationKnockable,
  ): boolean => {
    const offsetX = position.x - rack.basePosition.x;
    const offsetZ = position.z - rack.basePosition.z;
    const rotation = rack.rotationY ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    // Transform the world-space player position into the rack's local
    // horizontal frame before applying its half-extents. The extra capsule
    // radius keeps a grounded player on the edge of a box eligible.
    const localX = offsetX * cos + offsetZ * sin;
    const localZ = -offsetX * sin + offsetZ * cos;
    const margin = PLAYER_CAPSULE_RADIUS + 0.0005;
    return (
      Math.abs(localX) <= rack.halfExtents.x + margin &&
      Math.abs(localZ) <= rack.halfExtents.z + margin
    );
  };

  const getMeleeSupportTarget = (position: PhysicsVector): ExplorationMeleeSupportTarget | null => {
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return null;
    }
    const feetY = position.y - PLAYER_CAPSULE_CENTER_HEIGHT;
    const supportHeightTolerance = PLAYER_SUPPORT_SNAP_HEIGHT + 0.08;
    let topRack: ExplorationKnockable | null = null;
    let topRackY = Number.NEGATIVE_INFINITY;
    for (const chunk of activeChunks.values()) {
      for (const candidate of chunk.knockableProps) {
        if (
          candidate.warehouseRack !== true ||
          candidate.isKnocked ||
          candidate.isEquipped ||
          !isPositionInsideRackFootprint(position, candidate)
        ) {
          continue;
        }
        const candidateTopY = candidate.basePosition.y + candidate.halfExtents.y;
        if (
          candidateTopY > feetY + supportHeightTolerance ||
          feetY - candidateTopY > supportHeightTolerance ||
          candidateTopY <= topRackY
        ) {
          continue;
        }
        topRack = candidate;
        topRackY = candidateTopY;
      }
    }
    if (topRack === null) {
      return null;
    }

    // Hit the lowest rack in the connected support column. The existing
    // warehouse impact rule then releases every directly supported rack above
    // it, so a tall stack collapses as one readable event.
    let rootRack = topRack;
    for (;;) {
      let lowerRack: ExplorationKnockable | null = null;
      for (const chunk of activeChunks.values()) {
        for (const candidate of chunk.knockableProps) {
          if (
            candidate.warehouseRack !== true ||
            candidate.isKnocked ||
            candidate.isEquipped ||
            candidate.basePosition.y >= rootRack.basePosition.y
          ) {
            continue;
          }
          const sameSupportCell =
            Math.abs(candidate.basePosition.x - rootRack.basePosition.x) <=
              warehouseRackSupportTolerance &&
            Math.abs(candidate.basePosition.z - rootRack.basePosition.z) <=
              warehouseRackSupportTolerance;
          const directlyBelow =
            Math.abs(
              rootRack.basePosition.y - (candidate.basePosition.y + DEBUGGING_TWO_BOX_STACK_PITCH),
            ) <= warehouseRackLayerTolerance;
          if (!sameSupportCell || !directlyBelow) {
            continue;
          }
          lowerRack = candidate;
          break;
        }
        if (lowerRack !== null) {
          break;
        }
      }
      if (lowerRack === null) {
        break;
      }
      rootRack = lowerRack;
    }
    return {
      objectId: rootRack.physicsId,
      position: {
        x: rootRack.basePosition.x,
        y: rootRack.basePosition.y,
        z: rootRack.basePosition.z,
      },
    };
  };

  const dispose = (): void => {
    root.removeFromParent();
    for (const chunk of activeChunks.values()) {
      disposeChunk(chunk.root);
    }
    activeChunks.clear();
    groundGeometry.dispose();
    pathGeometry.dispose();
    propGeometry.dispose();
    citySignGeometry.dispose();
    utilityPostGeometry.dispose();
    for (const geometry of warehouseMeleeGeometries.values()) {
      geometry.dispose();
    }
    warehouseMeleeMaterial.dispose();
    beaconGeometry.dispose();
    buildingGeometry.dispose();
    windowGeometry.dispose();
    bridgeGeometry.dispose();
    for (const material of [
      ...groundMaterials,
      ...pathMaterials,
      ...propMaterials,
      ...accentMaterials,
      ...buildingMaterials,
      ...windowMaterials,
      ...bridgeMaterials,
      ...citySignMaterials,
      ...utilityPostMaterials,
    ]) {
      material.dispose();
    }
  };

  preloadAllChunks();
  update(new THREE.Vector3(0, 0, 0));
  onAreaChange?.(currentArea);
  return {
    update,
    updateKnockables,
    getArea: () => currentArea,
    getLoadedChunkCount: () => activeChunks.size,
    getPhysicsBoxes: () => {
      const boxes: PhysicsBox[] = [];
      for (const chunk of activeChunks.values()) {
        boxes.push(...chunk.physicsBoxes);
        for (const knockable of chunk.knockableProps) {
          if (knockable.isEquipped) {
            continue;
          }
          if (knockable.isKnocked) {
            boxes.push({
              center: {
                x: knockable.basePosition.x,
                y: knockable.basePosition.y,
                z: knockable.basePosition.z,
              },
              halfExtents: knockable.halfExtents,
              dynamic: true,
              dynamicId: knockable.physicsId,
              linearVelocity: {
                x: knockable.launchLinearVelocity.x,
                y: knockable.launchLinearVelocity.y,
                z: knockable.launchLinearVelocity.z,
              },
              angularVelocity: {
                x: knockable.launchAngularVelocity.x,
                y: knockable.launchAngularVelocity.y,
                z: knockable.launchAngularVelocity.z,
              },
              linearDamping: knockedLinearDamping,
              angularDamping: knockedAngularDamping,
              restitution: knockedRestitution,
              friction: knockedFriction,
              ...(knockable.rotationY === undefined ? {} : { rotationY: knockable.rotationY }),
            });
            continue;
          }
          boxes.push({
            center: {
              x: knockable.basePosition.x,
              y: knockable.basePosition.y,
              z: knockable.basePosition.z,
            },
            halfExtents: knockable.halfExtents,
            ...(knockable.rotationY === undefined ? {} : { rotationY: knockable.rotationY }),
          });
        }
      }
      return boxes;
    },
    getMeleePickups: () => {
      const pickups: ExplorationMeleePickup[] = [];
      for (const chunk of activeChunks.values()) {
        for (const knockable of chunk.knockableProps) {
          // Every world prop is a valid melee weapon. A toppled prop follows
          // the same live instance transform as a deliberately dropped one,
          // so it can be recovered while its ragdoll body is still settling.
          if (!knockable.isEquipped && knockable.warehouseRack !== true) {
            pickups.push(toMeleePickup(knockable));
          }
        }
      }
      return pickups;
    },
    getMeleeObjectIdForHit: (object, instanceIndex) => {
      if (!(object instanceof THREE.InstancedMesh) || instanceIndex === undefined) {
        return null;
      }
      for (const chunk of activeChunks.values()) {
        const knockable = chunk.knockableProps.find(
          (candidate) => candidate.mesh === object && candidate.index === instanceIndex,
        );
        if (
          knockable !== undefined &&
          knockable.warehouseRack !== true &&
          !knockable.isEquipped &&
          !knockable.isDropped
        ) {
          return knockable.physicsId;
        }
      }
      return null;
    },
    getMeleeSupportTarget,
    getRagdollObjectIdForHit: (object, instanceIndex) => {
      if (!(object instanceof THREE.InstancedMesh) || instanceIndex === undefined) {
        return null;
      }
      for (const chunk of activeChunks.values()) {
        const knockable = chunk.knockableProps.find(
          (candidate) => candidate.mesh === object && candidate.index === instanceIndex,
        );
        if (knockable !== undefined && !knockable.isEquipped) {
          return knockable.physicsId;
        }
      }
      return null;
    },
    equipMeleeObject: (objectId) => {
      const knockable = findKnockable(objectId);
      if (knockable === null || knockable.isEquipped || knockable.warehouseRack === true) {
        return null;
      }
      // A toppled or dropped prop may still be rotating or moving in the
      // dynamic body. Capture its current instance transform before removing
      // that body so the recovered item does not snap back to its seeded
      // spawn transform.
      const currentMatrix = new THREE.Matrix4();
      knockable.mesh.getMatrixAt(knockable.index, currentMatrix);
      const currentPosition = new THREE.Vector3();
      const currentQuaternion = new THREE.Quaternion();
      currentMatrix.decompose(currentPosition, currentQuaternion, knockable.baseScale);
      if (
        Number.isFinite(currentPosition.x) &&
        Number.isFinite(currentPosition.y) &&
        Number.isFinite(currentPosition.z)
      ) {
        knockable.basePosition.copy(currentPosition);
      }
      if (
        Number.isFinite(currentQuaternion.x) &&
        Number.isFinite(currentQuaternion.y) &&
        Number.isFinite(currentQuaternion.z) &&
        Number.isFinite(currentQuaternion.w)
      ) {
        knockable.baseQuaternion.copy(currentQuaternion);
      }
      knockable.isDropped = false;
      knockable.isKnocked = false;
      knockable.hasBodyState = false;
      knockable.angle = 0;
      knockable.angularVelocity = 0;
      knockable.kickCooldownSeconds = 0;
      knockable.launchLinearVelocity.set(0, 0, 0);
      knockable.launchAngularVelocity.set(0, 0, 0);
      knockable.isEquipped = true;
      writeKnockableMatrix(
        knockable,
        knockable.basePosition,
        knockable.baseQuaternion,
        new THREE.Vector3(0, 0, 0),
      );
      physicsVersion += 1;
      return toMeleePickup(knockable);
    },
    dropMeleeObject: (objectId, position, rotationY, releaseVelocity) => {
      const knockable = findKnockable(objectId);
      if (!knockable?.isEquipped) {
        return false;
      }
      knockable.isEquipped = false;
      knockable.isDropped = true;
      knockable.basePosition.copy(position);
      knockable.baseQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
      knockable.rotationY = rotationY;
      activateKnockableRagdoll(knockable, {
        x: Math.sin(rotationY),
        y: 0,
        z: Math.cos(rotationY),
      });
      const releaseX =
        releaseVelocity !== undefined && Number.isFinite(releaseVelocity.x) ? releaseVelocity.x : 0;
      const releaseY =
        releaseVelocity !== undefined && Number.isFinite(releaseVelocity.y) ? releaseVelocity.y : 0;
      const releaseZ =
        releaseVelocity !== undefined && Number.isFinite(releaseVelocity.z) ? releaseVelocity.z : 0;
      knockable.angularVelocity = droppedRagdollSpinVelocity;
      knockable.launchLinearVelocity.set(releaseX, releaseY + droppedRagdollLiftVelocity, releaseZ);
      knockable.launchAngularVelocity.copy(knockAxis).multiplyScalar(droppedRagdollSpinVelocity);
      writeKnockableMatrix(
        knockable,
        knockable.basePosition,
        knockable.baseQuaternion,
        knockable.baseScale,
      );
      physicsVersion += 1;
      return true;
    },
    applyMeleeHit: (objectId, direction, swingSpeed, stoppingPower) => {
      const knockable = findKnockable(objectId);
      if (knockable === null || knockable.isKnocked || knockable.isEquipped) {
        return false;
      }
      if (knockable.warehouseRack === true) {
        const safeStoppingPower =
          stoppingPower !== undefined && Number.isFinite(stoppingPower)
            ? Math.max(0, stoppingPower)
            : 0;
        activateWarehouseRack(knockable, direction, safeStoppingPower, true);
        releaseSupportedWarehouseRacks(knockable, direction, safeStoppingPower);
        physicsVersion += 1;
        return true;
      }
      knockable.isDropped = false;
      const safeSwingSpeed = Number.isFinite(swingSpeed) ? Math.max(0, swingSpeed) : 0;
      const swingScale = THREE.MathUtils.clamp(safeSwingSpeed / 8, 0.35, 2.2);
      const safeStoppingPower =
        stoppingPower !== undefined && Number.isFinite(stoppingPower)
          ? Math.max(0, stoppingPower)
          : 0;
      const swingImpulse = knockLinearImpulseScale * swingScale * 2.4;
      // Keep the historical swing response for callers that do not provide a
      // resolved stat, but let the carried melee stopping-power value provide
      // the stronger, object-facing impulse when it is available.
      const impactImpulse = Math.max(swingImpulse, safeStoppingPower);
      activateKnockableRagdoll(knockable, direction);
      knockable.launchLinearVelocity.set(
        knockDirection.x * impactImpulse,
        knockLiftImpulse + Math.max(swingScale * 0.45, safeStoppingPower * 0.08),
        knockDirection.z * impactImpulse,
      );
      knockable.launchAngularVelocity
        .copy(knockAxis)
        .multiplyScalar(
          Math.max(knockAngularImpulseScale * (swingScale + 0.4), safeStoppingPower * 1.25),
        );
      physicsVersion += 1;
      return true;
    },
    applyProjectileHit: (objectId, direction, stoppingPower, applyImpulse) => {
      const knockable = findKnockable(objectId);
      if (knockable === null || knockable.isEquipped) {
        return false;
      }
      const safeStoppingPower = Number.isFinite(stoppingPower) ? Math.max(0, stoppingPower) : 0;
      if (safeStoppingPower <= 0) {
        return false;
      }
      const wasKnocked = knockable.isKnocked;
      knockable.isDropped = false;
      if (!wasKnocked) {
        if (knockable.warehouseRack === true) {
          activateWarehouseRack(knockable, direction, safeStoppingPower, true);
          releaseSupportedWarehouseRacks(knockable, direction, safeStoppingPower);
        } else {
          activateKnockableRagdoll(knockable, direction);
        }
      } else {
        // A shot should continue to contribute force after the first pellet
        // starts the ragdoll. This is what makes a full shotgun spread read as
        // one large impact instead of dropping seven later pellets.
        knockDirection.set(direction.x, 0, direction.z);
        if (knockDirection.lengthSq() <= Number.EPSILON) {
          knockDirection.set(0, 0, -1);
        } else {
          knockDirection.normalize();
        }
      }
      const safeVerticalDirection = Number.isFinite(direction.y)
        ? THREE.MathUtils.clamp(direction.y, -0.5, 0.5)
        : 0;
      const impulseLinear = {
        x: knockDirection.x * safeStoppingPower,
        y: safeStoppingPower * (0.16 + safeVerticalDirection * 0.24),
        z: knockDirection.z * safeStoppingPower,
      };
      knockAxis.set(knockDirection.z, 0, -knockDirection.x);
      if (knockAxis.lengthSq() <= Number.EPSILON) {
        knockAxis.set(1, 0, 0);
      }
      knockAxis.normalize();
      const impulseAngular = {
        x: knockAxis.x * safeStoppingPower * 1.25,
        y: knockAxis.y * safeStoppingPower * 1.25,
        z: knockAxis.z * safeStoppingPower * 1.25,
      };
      if (knockable.hasBodyState && applyImpulse !== undefined) {
        applyImpulse(knockable.physicsId, impulseLinear, impulseAngular);
      } else {
        knockable.launchLinearVelocity.x += impulseLinear.x;
        knockable.launchLinearVelocity.y += impulseLinear.y;
        knockable.launchLinearVelocity.z += impulseLinear.z;
        knockable.launchAngularVelocity.x += impulseAngular.x;
        knockable.launchAngularVelocity.y += impulseAngular.y;
        knockable.launchAngularVelocity.z += impulseAngular.z;
        physicsVersion += 1;
      }
      // Projectile impacts are not subject to the player-contact re-hit
      // cooldown. Every pellet must be able to add its own impulse.
      knockable.kickCooldownSeconds = 0;
      return true;
    },
    getPhysicsVersion: () => physicsVersion,
    dispose,
  };
};

const createPresentationAnchors = (
  scene: THREE.Scene,
  tableRoot: THREE.Object3D,
  wallRoot: THREE.Object3D,
): PenthouseSceneAnchors => {
  const root = new THREE.Group();
  root.name = "PresentationAnchors";
  const make = (name: string, position: THREE.Vector3): THREE.Object3D => {
    const anchor = new THREE.Group();
    anchor.name = name;
    anchor.position.copy(position);
    root.add(anchor);
    return anchor;
  };
  const playerHand = make("AnchorPlayerHand", new THREE.Vector3(0, TABLE_TOP_Y + 0.22, 1.5));
  const opponentHands = {
    north: make("AnchorOpponentHandNorth", new THREE.Vector3(0, TABLE_TOP_Y + 0.22, -1.5)),
    east: make("AnchorOpponentHandEast", new THREE.Vector3(1.5, TABLE_TOP_Y + 0.22, 0)),
    west: make("AnchorOpponentHandWest", new THREE.Vector3(-1.5, TABLE_TOP_Y + 0.22, 0)),
  } as const;
  const discardZones = {
    south: make("AnchorDiscardSouth", new THREE.Vector3(0, TABLE_TOP_Y + 0.1, 0.44)),
    north: make("AnchorDiscardNorth", new THREE.Vector3(0, TABLE_TOP_Y + 0.1, -0.44)),
    east: make("AnchorDiscardEast", new THREE.Vector3(0.44, TABLE_TOP_Y + 0.1, 0)),
    west: make("AnchorDiscardWest", new THREE.Vector3(-0.44, TABLE_TOP_Y + 0.1, 0)),
  } as const;
  const meldZones = {
    south: make("AnchorMeldSouth", new THREE.Vector3(0, TABLE_TOP_Y + 0.11, 0.98)),
    north: make("AnchorMeldNorth", new THREE.Vector3(0, TABLE_TOP_Y + 0.11, -0.98)),
    east: make("AnchorMeldEast", new THREE.Vector3(0.98, TABLE_TOP_Y + 0.11, 0)),
    west: make("AnchorMeldWest", new THREE.Vector3(-0.98, TABLE_TOP_Y + 0.11, 0)),
  } as const;
  const teacherPanel =
    scene.getObjectByName("TeacherPanel") ??
    make("TeacherPanel", new THREE.Vector3(-4.15, 2.3, -5.35));
  const actionSurface = make("ActionSurface", new THREE.Vector3(0, TABLE_TOP_Y + 0.08, 0.92));
  const roundStatusSurface = make("RoundStatusSurface", new THREE.Vector3(0, 1.65, -2.2));
  const cameraTargets = {
    table: make("CameraTargetTable", new THREE.Vector3(0, 0.72, -0.75)),
    room: make("CameraTargetRoom", new THREE.Vector3(0, 1.45, -1.9)),
  } as const;
  scene.add(root);
  return {
    tableRoot,
    playerHand,
    opponentHands,
    discardZones,
    meldZones,
    wallRoot,
    teacherPanel,
    actionSurface,
    roundStatusSurface,
    cameraTargets,
  };
};

const addLighting = (scene: THREE.Scene): void => {
  const lightingRoot = new THREE.Group();
  lightingRoot.name = "LightingRoot";
  scene.add(lightingRoot);

  const keyLightTarget = new THREE.Object3D();
  keyLightTarget.name = "SunKeyLightTarget";
  keyLightTarget.position.set(0, 0.5, -0.1);
  scene.add(keyLightTarget);

  const keyLight = new THREE.DirectionalLight(0xffe7c9, 2.2);
  keyLight.name = "SunKeyLight";
  keyLight.position.set(-5.6, 9.5, 6.2);
  keyLight.target = keyLightTarget;
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.radius = 2.2;
  keyLight.shadow.bias = -0.00045;
  keyLight.shadow.normalBias = 0.014;
  keyLight.shadow.camera.near = 0.2;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  keyLight.userData.dofIgnore = true;
  lightingRoot.add(keyLight);

  const fillLight = new THREE.SpotLight(0x8fd8e8, 0.42, 24, THREE.MathUtils.degToRad(68), 0.5, 0.6);
  fillLight.name = "SunFillLight";
  fillLight.position.set(4.4, 4.8, -2.4);
  fillLight.target.position.set(-0.25, 0.65, 0.15);
  lightingRoot.add(fillLight);
  lightingRoot.add(fillLight.target);

  const rimLight = new THREE.PointLight(0xc69bd0, 0.2, 18);
  rimLight.name = "SunRimLight";
  rimLight.position.set(-0.05, 6.2, -8.2);
  rimLight.castShadow = false;
  rimLight.userData.dofIgnore = true;
  lightingRoot.add(rimLight);

  const ambientLight = new THREE.AmbientLight(0x7594a2, 0.14);
  ambientLight.name = "SceneAmbient";
  lightingRoot.add(ambientLight);

  // Keep a soft visual reference for the sun rig controls.
  const skySunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.92, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffb95c,
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const skySunCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffdf9b,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const skySunReference = new THREE.Group();
  skySunReference.name = "SkySunReference";
  skySunReference.add(skySunGlow, skySunCore);
  skySunReference.position.set(-5, 9.5, 6.5);
  skySunReference.userData.dofIgnore = true;
  skySunGlow.renderOrder = 10;
  skySunCore.renderOrder = 11;
  lightingRoot.add(skySunReference);
};

const addFloor = (scene: THREE.Scene, quality: SceneQuality): ArchitectureResources => {
  return addArchitecture(scene, quality);
};

/**
 * Allocate only the shared disposable resources needed by the standalone map.
 * Debugging 02 must not instantiate the penthouse architecture just to obtain
 * its texture cache or chart materials.
 */
const createCleanSlateArchitectureResources = (): ArchitectureResources => {
  const makeBlankTexture = (fill: string): THREE.CanvasTexture => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("Unable to create a clean-slate resource texture");
    }
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return createCanvasTexture(canvas);
  };
  const simpleGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0x273d5b,
    roughness: 0.6,
    metalness: 0.12,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const physicalGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x273d5b,
    roughness: 0.38,
    metalness: 0.08,
    transmission: 0.1,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    ior: 1.45,
  });
  return {
    ambient: { cyanMaterials: [], redMaterials: [] },
    teacherTexture: makeBlankTexture("#07101f"),
    weaponChartTexture: makeBlankTexture("#07101f"),
    glassSurfaces: [],
    simpleGlassMaterial,
    physicalGlassMaterial,
    surfaceTextures: createInteriorSurfaceTextures(),
  };
};

const SKY_SUN_DISTANCE = 10;
// Lower the visible reference into the north glazing so the complete disk stays
// inside the seat camera's sky band instead of clipping against the viewport edge.
const SKY_SUN_REFERENCE_ELEVATION_OFFSET = 0.42;

const isDofIgnored = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current.userData.dofIgnore === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const isDofFocusTarget = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current.userData.dofFocusTarget === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const setCameraPreset = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  view: SceneView,
  presets: Readonly<Record<SceneView, CameraPreset>> = cameraPresets,
): void => {
  const preset = presets[view];
  camera.position.copy(preset.position);
  controls.target.copy(preset.target);
  controls.update();
};

const TONE_MAPPINGS: Readonly<Record<VisualToneMapper, THREE.ToneMapping>> = {
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  cineon: THREE.CineonToneMapping,
  linear: THREE.LinearToneMapping,
};

const toneMapperName = (toneMapping: THREE.ToneMapping): VisualToneMapper => {
  if (toneMapping === THREE.NeutralToneMapping) {
    return "neutral";
  }
  if (toneMapping === THREE.CineonToneMapping) {
    return "cineon";
  }
  if (toneMapping === THREE.LinearToneMapping) {
    return "linear";
  }
  return "agx";
};

const disposeObject = (object: THREE.Object3D): void => {
  const geometries = new Set<{ readonly dispose: () => void }>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const renderable = child as unknown as {
      readonly geometry?: { readonly dispose: () => void };
      readonly material?: THREE.Material | readonly THREE.Material[];
    };
    if (renderable.geometry !== undefined) {
      geometries.add(renderable.geometry);
    }
    const material = renderable.material;
    const entries: readonly THREE.Material[] =
      material === undefined ? [] : material instanceof THREE.Material ? [material] : material;
    for (const entry of entries) {
      materials.add(entry);
    }
  });
  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
};

export const createMahjongTableScene = (
  container: HTMLElement,
  initialView: SceneView = "seat",
  options: MahjongTableSceneOptions = {},
): MahjongTableMount => {
  const debugEnabled = options.debug === true;
  const mapId = normalizeVisualMapId(options.mapId ?? DEFAULT_VISUAL_MAP_ID);
  const isCleanSlateMap = mapId === "debugging-02";
  const activeWorldBounds: WorldBounds = isCleanSlateMap
    ? DEBUGGING_TWO_WORLD_BOUNDS
    : WORLD_BOUNDS;
  const roomSeed = normalizeVisualRoomSeed(options.roomSeed);
  const debugPreferencesStorage = getVisualDebugPreferencesStorage(debugEnabled);
  const persistedDebugPreferences = readVisualDebugPreferences(debugPreferencesStorage);
  const enabledAreas: Record<VisualSceneAreaId, boolean> = {
    ...DEFAULT_ENABLED_VISUAL_SCENE_AREAS,
  };
  if (isCleanSlateMap) {
    for (const area of VISUAL_SCENE_AREA_IDS) {
      enabledAreas[area] = false;
    }
  } else if (options.enabledAreas !== undefined) {
    for (const area of VISUAL_SCENE_AREA_IDS) {
      enabledAreas[area] = options.enabledAreas.includes(area);
    }
  } else if (persistedDebugPreferences?.enabledAreas !== undefined) {
    for (const area of VISUAL_SCENE_AREA_IDS) {
      enabledAreas[area] = persistedDebugPreferences.enabledAreas[area];
    }
  }
  const isAreaEnabled = (area: VisualSceneAreaId): boolean => enabledAreas[area];
  const clampReticleCoordinate = (value: number, fallback: number): number =>
    Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  const resolveReticlePosition = (
    reticlePosition: ReticlePosition | undefined = DEFAULT_RETICLE_POSITION,
  ): ReticlePosition => ({
    x: clampReticleCoordinate(reticlePosition.x, DEFAULT_RETICLE_POSITION.x),
    y: clampReticleCoordinate(reticlePosition.y, DEFAULT_RETICLE_POSITION.y),
  });
  const visualCameraPresets = createVisualCameraPresets();
  const sceneStateStorage = getVisualSceneStateStorage();
  const persistedSceneState = readVisualSceneState(sceneStateStorage, roomSeed);
  const authoredRoomMap = isCleanSlateMap ? null : getAuthoredVisualMapDocument(mapId);
  const persistedQuality = persistedDebugPreferences?.qualityMode;
  const requestedQuality =
    options.quality ?? (persistedQuality === "adaptive" ? "auto" : persistedQuality);
  const cleanSlateSeatPreset: CameraPreset = {
    position: new THREE.Vector3(0, WAREHOUSE_FLOOR_TOP_Y + STANDING_EYE_HEIGHT, 27),
    target: new THREE.Vector3(0, 1.1, 0),
  };
  const cleanSlateOverheadPreset: CameraPreset = {
    position: new THREE.Vector3(0, 42, 22),
    target: new THREE.Vector3(0, 0, 0),
  };
  const activeSceneCameraPresets: Readonly<Record<SceneView, CameraPreset>> = isCleanSlateMap
    ? { seat: cleanSlateSeatPreset, overhead: cleanSlateOverheadPreset }
    : cameraPresets;
  const activeVisualCameraPresets: Readonly<Record<VisualCameraPreset, CameraPreset>> =
    isCleanSlateMap
      ? {
          ...visualCameraPresets,
          table: cleanSlateSeatPreset,
          roomReveal: {
            position: new THREE.Vector3(18, 20, 28),
            target: new THREE.Vector3(0, 0.8, 0),
          },
          assetReview: cleanSlateOverheadPreset,
        }
      : visualCameraPresets;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  // Start authored maps fully clear. Warehouse installs its map-local haze
  // after its isolated world is constructed; the legacy debug preference is
  // still read for snapshot compatibility but cannot attach a general pass.
  scene.fog = null;
  const camera = new THREE.PerspectiveCamera(TABLE_CAMERA_FOV, 1, 0.05, 1200);
  // This camera is deliberately not added to the scene graph. When the optic
  // is active it copies the live player pose, rotates onto the reticule ray,
  // and renders a true narrow-FOV world feed for the scope texture.
  const sniperScopeCamera = new THREE.PerspectiveCamera(TABLE_CAMERA_FOV, 1, 0.05, 1200);
  sniperScopeCamera.name = "SniperScopeCamera";
  sniperScopeCamera.matrixAutoUpdate = false;
  // The first-person weapon models are camera children. Keep the camera in
  // the rendered scene graph so Three.js traverses those view-model meshes.
  scene.add(camera);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  // PointerLockControls owns the camera quaternion. Keep its upright control
  // pose separate from the short-lived presentation roll applied at render.
  camera.matrixAutoUpdate = false;
  const cameraRollMatrix = new THREE.Matrix4();
  const cameraRecoilMatrix = new THREE.Matrix4();
  const cameraRecoilEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const cameraMotionRight = new THREE.Vector3();
  const cameraMotionForward = new THREE.Vector3();
  const cameraMotionUp = new THREE.Vector3();
  const cameraImpactRight = new THREE.Vector3();
  const cameraImpactForward = new THREE.Vector3();
  const cameraImpactUp = new THREE.Vector3();
  const quality = resolveQuality(requestedQuality);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dprCap));
  renderer.shadowMap.enabled = quality.shadows !== "off";
  // The warehouse uses softer shadow receivers to complement its high-bay
  // pools and ground-truth contact pass; keep the penthouse's sharper default.
  renderer.shadowMap.type = isCleanSlateMap ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive three-dimensional Hong Kong mahjong table",
  );
  renderer.domElement.setAttribute("tabindex", "0");
  renderer.domElement.dataset.sceneReady = "true";
  container.dataset.sceneReady = "false";
  container.dataset.sceneQuality = quality.preset;
  container.dataset.mapId = mapId;
  container.dataset.controlActive = "false";
  container.replaceChildren(renderer.domElement);
  const deathFadeOverlay = document.createElement("div");
  deathFadeOverlay.setAttribute("aria-hidden", "true");
  deathFadeOverlay.dataset.playerDeathFade = "true";
  deathFadeOverlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "pointer-events:none",
    "background:#000",
    "opacity:0",
    "transition:opacity 260ms ease-out",
  ].join(";");
  container.append(deathFadeOverlay);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTexture = pmremGenerator.fromScene(roomEnvironment).texture;
  scene.environment = environmentTexture;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dprCap));
  composer.addPass(new RenderPass(scene, camera));
  const gtaoPass = new GTAOPass(scene, camera, 512, 320);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = isCleanSlateMap ? 1.05 : 0.72;
  // Ground-truth ambient occlusion supplies ray-style crate contact shading
  // in the warehouse; other maps keep it opt-in from the debug panel.
  gtaoPass.enabled = isCleanSlateMap;
  gtaoPass.updateGtaoMaterial({
    radius: isCleanSlateMap ? 0.38 : 0.24,
    distanceExponent: 1.15,
    thickness: isCleanSlateMap ? 1.35 : 1.1,
    scale: 1.05,
    samples: isCleanSlateMap ? 12 : 8,
  });
  gtaoPass.updatePdMaterial({
    radius: 4,
    rings: 2,
    samples: 8,
  });
  composer.addPass(gtaoPass);
  const initialBokeh = resolveHumanEyeBokeh(
    BOKEH_FOCUS_FALLBACK_DISTANCE,
    HUMAN_EYE_REFERENCE_PUPIL_MM,
  );
  const bokehPass = new BokehPass(scene, camera, {
    focus: BOKEH_FOCUS_FALLBACK_DISTANCE,
    aperture: initialBokeh.aperture,
    maxblur: initialBokeh.maxBlur,
  });
  // Keep adaptive/medium rendering inexpensive enough for software WebGL and
  // mobile GPUs. High quality retains the visual treatment, and debug can
  // enable it explicitly on a stronger device.
  bokehPass.enabled = quality.preset === "high";
  composer.addPass(bokehPass);
  // The sniper lens samples the already-rendered scene after Bokeh, so the
  // magnified image keeps the same lighting and depth-of-field treatment as
  // the world the player is looking at.
  const sniperScopePass = createSniperScopePass();
  sniperScopePass.enabled = false;
  composer.addPass(sniperScopePass);
  // O₂ fatigue is a shallow full-screen optical response, separate from the
  // gaze-driven depth of field above and the scope's magnified source.
  const o2BlurPass = createO2BlurPass();
  o2BlurPass.enabled = false;
  const sniperScopeSceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  sniperScopeSceneTarget.texture.name = "SniperScopeWorldTexture";
  sniperScopeSceneTarget.texture.generateMipmaps = false;
  setSniperScopeSceneTexture(sniperScopePass, sniperScopeSceneTarget.texture);
  // Keep the O₂ blur and dithered black radial vignette in scene-linear space
  // before OutputPass. The display transform remains last in the chain.
  composer.addPass(o2BlurPass);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
  interface DamageVignettePulse {
    readonly pass: ReturnType<typeof createDamageVignettePass>;
    readonly initialOpacity: number;
    elapsedSeconds: number;
  }
  const damageVignettePulses: DamageVignettePulse[] = [];
  interface MeleeImpactFlashPulse {
    readonly pass: ReturnType<typeof createMeleeImpactFlashPass>;
    readonly initialOpacity: number;
    elapsedSeconds: number;
    /** Keep the hit at its requested opacity through the first rendered frame. */
    fresh: boolean;
  }
  const meleeImpactFlashPulses: MeleeImpactFlashPulse[] = [];
  let meleeFocusSeverity = 0;
  let meleeDofBoostRemainingSeconds = 0;
  const syncDamageVignettePassSizes = (width: number, height: number): void => {
    for (const pulse of damageVignettePulses) {
      setDamageVignettePassSize(pulse.pass, width, height);
    }
  };
  const publishDamageVignetteLayerCount = (): void => {
    container.dataset.playerDamageVignetteLayers = String(damageVignettePulses.length);
  };
  const addDamageVignette = (kind: DamageVignetteKind, damageDelta: number): void => {
    const initialOpacity = resolveDamageVignetteOpacityFromDelta(damageDelta);
    if (initialOpacity <= 0) {
      return;
    }
    const pass = createDamageVignettePass(kind, damageDelta);
    setDamageVignettePassSize(pass, renderer.domElement.width, renderer.domElement.height);
    const outputIndex = composer.passes.indexOf(outputPass);
    composer.insertPass(pass, outputIndex >= 0 ? outputIndex : composer.passes.length);
    damageVignettePulses.push({ pass, initialOpacity, elapsedSeconds: 0 });
    publishDamageVignetteLayerCount();
  };
  const clearDamageVignettePulses = (): void => {
    for (const pulse of damageVignettePulses) {
      composer.removePass(pulse.pass);
      pulse.pass.dispose();
    }
    damageVignettePulses.length = 0;
    publishDamageVignetteLayerCount();
  };
  const addMeleeImpactFlash = (damage: number): void => {
    const initialOpacity = resolveMeleeImpactFlashOpacity(damage);
    if (initialOpacity <= 0) {
      return;
    }
    const pass = createMeleeImpactFlashPass(damage);
    const outputIndex = composer.passes.indexOf(outputPass);
    composer.insertPass(pass, outputIndex >= 0 ? outputIndex : composer.passes.length);
    meleeImpactFlashPulses.push({ pass, initialOpacity, elapsedSeconds: 0, fresh: true });
    meleeFocusSeverity = Math.max(meleeFocusSeverity, resolveMeleeImpactFlashOpacity(damage));
    meleeDofBoostRemainingSeconds = MELEE_IMPACT_DOF_BOOST_DURATION_SECONDS;
    container.dataset.playerMeleeImpactOpacity = initialOpacity.toFixed(3);
    container.dataset.playerMeleeFocusShiftMeters =
      resolveMeleeImpactFocusShiftMeters(damage).toFixed(3);
  };
  const clearMeleeImpactFlashes = (): void => {
    for (const pulse of meleeImpactFlashPulses) {
      composer.removePass(pulse.pass);
      pulse.pass.dispose();
    }
    meleeImpactFlashPulses.length = 0;
    meleeFocusSeverity = 0;
    meleeDofBoostRemainingSeconds = 0;
    container.dataset.playerMeleeImpactOpacity = "0";
    container.dataset.playerMeleeFocusShiftMeters = "0";
  };
  const updateMeleeImpactFlashes = (deltaSeconds: number): void => {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    let hasFreshPulse = false;
    for (let index = meleeImpactFlashPulses.length - 1; index >= 0; index -= 1) {
      const pulse = meleeImpactFlashPulses[index];
      if (pulse === undefined) {
        continue;
      }
      // A simulant hit can be resolved earlier in this same animation frame.
      // Do not spend that frame's delta before the compositor presents the
      // newly inserted pass; the impact must begin at its full opacity.
      if (pulse.fresh) {
        hasFreshPulse = true;
        pulse.fresh = false;
        setMeleeImpactFlashOpacity(pulse.pass, pulse.initialOpacity);
        continue;
      }
      pulse.elapsedSeconds += delta;
      if (pulse.elapsedSeconds >= MELEE_IMPACT_FLASH_DURATION_SECONDS) {
        composer.removePass(pulse.pass);
        pulse.pass.dispose();
        meleeImpactFlashPulses.splice(index, 1);
        continue;
      }
      setMeleeImpactFlashOpacity(
        pulse.pass,
        resolveMeleeImpactFlashOpacityAtTime(pulse.initialOpacity, pulse.elapsedSeconds),
      );
    }
    if (!hasFreshPulse) {
      meleeFocusSeverity = THREE.MathUtils.damp(meleeFocusSeverity, 0, 5.5, delta);
      meleeDofBoostRemainingSeconds = Math.max(0, meleeDofBoostRemainingSeconds - delta);
    }
    container.dataset.playerMeleeFocusShiftMeters = resolveMeleeImpactFocusShiftMeters(
      meleeFocusSeverity * MELEE_IMPACT_MAX_DAMAGE,
    ).toFixed(3);
  };
  const updateDamageVignettePulses = (
    deltaSeconds: number,
    centerX: number,
    centerY: number,
  ): void => {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    for (let index = damageVignettePulses.length - 1; index >= 0; index -= 1) {
      const pulse = damageVignettePulses[index];
      if (pulse === undefined) {
        continue;
      }
      pulse.elapsedSeconds += delta;
      if (pulse.elapsedSeconds >= DAMAGE_VIGNETTE_PULSE_DURATION_SECONDS) {
        composer.removePass(pulse.pass);
        pulse.pass.dispose();
        damageVignettePulses.splice(index, 1);
        continue;
      }
      setDamageVignettePassCenter(pulse.pass, centerX, centerY);
      setDamageVignettePassStrength(
        pulse.pass,
        resolveDamageVignettePulseOpacity(pulse.initialOpacity, pulse.elapsedSeconds),
      );
    }
    publishDamageVignetteLayerCount();
  };
  publishDamageVignetteLayerCount();
  const focusRaycaster = new THREE.Raycaster();
  const sniperScopeCameraPosition = new THREE.Vector3();
  const sniperScopeCameraScale = new THREE.Vector3();
  const sniperScopeCameraQuaternion = new THREE.Quaternion();
  const sniperScopeCameraForward = new THREE.Vector3();
  const sniperScopeAimDirection = new THREE.Vector3();
  const sniperScopeRotationDelta = new THREE.Quaternion();
  let reticlePosition = resolveReticlePosition(options.reticlePosition);
  let focusCalibrationRoot: THREE.Group | null = null;
  let focusCalibrationLabels: readonly THREE.Sprite[] = [];
  let parametricCampusLabels: readonly THREE.Sprite[] = [];
  let debugBoundsRoot: THREE.Group | null = null;
  let sunLight: THREE.DirectionalLight | null = null;
  let skySunReference: THREE.Object3D | null = null;
  let redMaterials: THREE.MeshStandardMaterial[] = [];
  let cyanMaterials: THREE.MeshStandardMaterial[] = [];
  let redMaterialBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();
  let cyanMaterialBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();
  let activeDebugPreset: VisualCameraPreset | null = null;
  let debugFovOverride: number | null = null;
  let debugFogDensity = 0;
  let debugSunYaw = -0.59;
  let debugSunElevation = 0.86;
  let debugSunIntensity = 2.2;
  let debugEnvironmentIntensity = 0.82;
  let debugEnvironmentRotation = 0;
  let debugRedAccentIntensity = 1.1;
  let debugCyanEmissiveIntensity = 1.05;
  let debugShadowQuality: VisualShadowQuality = quality.shadows;
  let debugDprCap = quality.dprCap;
  let debugQualityMode: VisualQualityMode =
    options.quality === undefined || options.quality === "auto" ? "adaptive" : options.quality;
  let debugEffectiveQuality: VisualQualityPreset = quality.preset;
  let debugAmbientAnimationRate = quality.ambientAnimationRate;
  let debugCameraShiftEnabled = true;
  let debugCameraBobEnabled = true;
  let debugBokehEnabled = bokehPass.enabled;
  let debugBokehStrength = STANDING_DOF_INTENSITY;
  let debugAmbientOcclusionEnabled = gtaoPass.enabled;
  let debugAutoExposureEnabled = true;
  let debugExposureTarget = 1.02;
  let debugGlassMode: VisualGlassMode = quality.glassMode;
  let glassSurfaces: readonly THREE.Mesh[] = [];
  let simpleGlassMaterial: THREE.MeshStandardMaterial | null = null;
  let physicalGlassMaterial: THREE.MeshPhysicalMaterial | null = null;
  let debugWireframe = false;
  let debugBoundsVisible = false;
  let generatedRoomVariant = GENERATED_ROOM_PALETTES[0]?.label ?? "Northlight";
  let debuggingTwoMap: DebuggingTwoMapResources | null = null;
  let debugFps = 60;
  let debugFrameTimeMs = 1000 / 60;
  let previousAnimationTimestamp = 0;
  let explorationWorld: ExplorationWorld | null = null;
  let explorationArea = "Penthouse";
  let loadedExplorationChunks = 0;
  let focusDistance = BOKEH_FOCUS_FALLBACK_DISTANCE;
  let focusTarget: VisualFocusTarget = "fallback";
  let pupilDiameterMm = HUMAN_EYE_REFERENCE_PUPIL_MM;
  let bokehIntensity = initialBokeh.intensity;
  const exposureLookDirection = new THREE.Vector3();
  const getSunLight = (): THREE.DirectionalLight | null => sunLight;
  const updateSkySunReference = (): void => {
    if (skySunReference === null) {
      return;
    }
    // Keep the southwest key light physically correct, but mirror its visible
    // reference into the north-facing glazing so the seat camera can read it.
    const visualSunYaw = Math.atan2(-Math.abs(Math.sin(debugSunYaw)), Math.cos(debugSunYaw));
    const visualSunElevation = THREE.MathUtils.clamp(
      debugSunElevation - SKY_SUN_REFERENCE_ELEVATION_OFFSET,
      0.25,
      1.2,
    );
    const horizontal = Math.cos(visualSunElevation) * SKY_SUN_DISTANCE;
    skySunReference.position.set(
      Math.cos(visualSunYaw) * horizontal,
      Math.sin(visualSunElevation) * SKY_SUN_DISTANCE,
      Math.sin(visualSunYaw) * horizontal,
    );
    const intensityScale = THREE.MathUtils.clamp(
      0.85 + Math.pow(debugSunIntensity / 6, 0.75) * 0.75,
      0.85,
      1.6,
    );
    skySunReference.scale.setScalar(intensityScale);
  };
  const getDebugBoundsRoot = (): THREE.Group | null => debugBoundsRoot;
  let suppressDebugPreferencesPersistence = true;
  let lastDebugPreferencesSerialized: string | null = null;
  const captureDebugPreferences = (): VisualDebugPreferences => ({
    version: VISUAL_DEBUG_PREFERENCES_VERSION,
    cameraPreset: activeDebugPreset,
    enabledAreas: { ...enabledAreas },
    fov: THREE.MathUtils.clamp(debugFovOverride ?? camera.fov, 30, 100),
    exposure: THREE.MathUtils.clamp(
      debugAutoExposureEnabled ? debugExposureTarget : renderer.toneMappingExposure,
      0.5,
      2.2,
    ),
    toneMapper: toneMapperName(renderer.toneMapping),
    fogDensity: debugFogDensity,
    sunYaw: debugSunYaw,
    sunElevation: debugSunElevation,
    sunIntensity: debugSunIntensity,
    environmentIntensity: debugEnvironmentIntensity,
    environmentRotation: debugEnvironmentRotation,
    redAccentIntensity: debugRedAccentIntensity,
    cyanEmissiveIntensity: debugCyanEmissiveIntensity,
    shadowQuality: debugShadowQuality,
    qualityMode: debugQualityMode,
    glassMode: debugGlassMode,
    ambientAnimationRate: debugAmbientAnimationRate,
    dprCap: debugDprCap,
    wireframe: debugWireframe,
    boundsVisible: debugBoundsVisible,
    bokehEnabled: debugBokehEnabled,
    bokehStrength: debugBokehStrength,
    ambientOcclusionEnabled: debugAmbientOcclusionEnabled,
    autoExposureEnabled: debugAutoExposureEnabled,
    cameraShiftEnabled: debugCameraShiftEnabled,
    cameraBobEnabled: debugCameraBobEnabled,
  });
  const saveDebugPreferences = (): void => {
    if (debugPreferencesStorage === null) {
      return;
    }
    const preferences = captureDebugPreferences();
    const serialized = JSON.stringify(preferences);
    if (
      serialized !== lastDebugPreferencesSerialized &&
      writeVisualDebugPreferences(debugPreferencesStorage, preferences)
    ) {
      lastDebugPreferencesSerialized = serialized;
    }
  };
  const persistDebugPreferences = (): void => {
    if (debugEnabled && !suppressDebugPreferencesPersistence) {
      saveDebugPreferences();
    }
  };

  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.minDistance = 2.8;
  orbitControls.maxDistance = 14;
  orbitControls.maxPolarAngle = Math.PI;
  orbitControls.minPolarAngle = 0;
  orbitControls.enablePan = false;
  const firstPersonControls = new PointerLockControls(camera, renderer.domElement);
  firstPersonControls.pointerSpeed = 1.8;
  firstPersonControls.minPolarAngle = 0;
  firstPersonControls.maxPolarAngle = Math.PI;
  firstPersonControls.enabled = false;

  let activeView = initialView;
  let viewportAspect = camera.aspect;
  const syncReticleZoomProjection = (): void => {
    if (activeView !== "seat") {
      if (camera.view?.enabled === true) {
        camera.clearViewOffset();
      }
      return;
    }
    const offset = resolveReticleZoomViewOffset(camera.fov, reticlePresentation.basePosition);
    const view = camera.view;
    if (
      view?.enabled === true &&
      view.fullWidth === 1 &&
      view.fullHeight === 1 &&
      view.width === 1 &&
      view.height === 1 &&
      Math.abs(view.offsetX - offset.x) < 0.000001 &&
      Math.abs(view.offsetY - offset.y) < 0.000001
    ) {
      return;
    }
    camera.setViewOffset(1, 1, offset.x, offset.y, 1, 1);
    camera.aspect = viewportAspect;
    camera.updateProjectionMatrix();
  };
  const isTouchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window;
  const preventTouchTextMenu = (event: Event): void => {
    if (isTouchDevice || activeView === "seat") {
      event.preventDefault();
    }
  };
  renderer.domElement.addEventListener("contextmenu", preventTouchTextMenu);
  renderer.domElement.addEventListener("selectstart", preventTouchTextMenu);
  const orientationConstructor = (
    window as unknown as {
      readonly DeviceOrientationEvent?: DeviceOrientationEventPermissionConstructor;
    }
  ).DeviceOrientationEvent;
  const supportsMotionLook =
    isTouchDevice && (orientationConstructor !== undefined || "ondeviceorientation" in window);
  let motionLookStatus: MotionLookStatus = supportsMotionLook ? "needs-permission" : "unsupported";
  let motionLookEnabled = false;
  let motionRequest: Promise<MotionLookStatus> | null = null;
  let orientationListenerAttached = false;
  let hasMotionReference = false;
  let motionTargetValid = false;
  const deviceOrientationEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const deviceOrientationQuaternion = new THREE.Quaternion();
  const deviceScreenQuaternion = new THREE.Quaternion();
  const deviceReferenceQuaternion = new THREE.Quaternion();
  const cameraReferenceQuaternion = new THREE.Quaternion();
  const relativeMotionQuaternion = new THREE.Quaternion();
  const motionTargetQuaternion = new THREE.Quaternion();
  const motionTargetEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const swipeLookEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const setMotionLookStatus = (status: MotionLookStatus): void => {
    motionLookStatus = status;
    options.onMotionLookStatusChange?.(status);
  };
  setMotionLookStatus(motionLookStatus);
  const resetMotionCalibration = (): void => {
    hasMotionReference = false;
    motionTargetValid = false;
  };
  const onDeviceOrientation = (event: DeviceOrientationEvent): void => {
    if (!motionLookEnabled || activeView !== "seat") {
      return;
    }
    if (
      !setDeviceOrientationQuaternion(
        deviceOrientationQuaternion,
        deviceOrientationEuler,
        deviceScreenQuaternion,
        event,
      )
    ) {
      return;
    }
    if (!hasMotionReference) {
      deviceReferenceQuaternion.copy(deviceOrientationQuaternion);
      cameraReferenceQuaternion.copy(camera.quaternion);
      hasMotionReference = true;
      return;
    }
    relativeMotionQuaternion
      .copy(deviceReferenceQuaternion)
      .invert()
      .multiply(deviceOrientationQuaternion);
    motionTargetQuaternion.copy(cameraReferenceQuaternion).multiply(relativeMotionQuaternion);
    motionTargetEuler.setFromQuaternion(motionTargetQuaternion, "YXZ");
    motionTargetEuler.x = THREE.MathUtils.clamp(
      motionTargetEuler.x,
      -Math.PI / 2 + 0.12,
      Math.PI / 2 - 0.12,
    );
    motionTargetEuler.z = 0;
    motionTargetQuaternion.setFromEuler(motionTargetEuler);
    motionTargetValid = true;
  };
  let swipePointerId: number | null = null;
  let swipeLastX = 0;
  let swipeLastY = 0;
  const syncMotionLookReferenceToCamera = (): void => {
    cameraReferenceQuaternion.copy(camera.quaternion);
    if (hasMotionReference) {
      deviceReferenceQuaternion.copy(deviceOrientationQuaternion);
    }
    motionTargetQuaternion.copy(camera.quaternion);
    motionTargetValid = false;
  };
  const onSwipePointerDown = (event: PointerEvent): void => {
    if (
      !isTouchDevice ||
      activeView !== "seat" ||
      event.pointerType === "mouse" ||
      swipePointerId !== null
    ) {
      return;
    }
    event.preventDefault();
    swipePointerId = event.pointerId;
    swipeLastX = event.clientX;
    swipeLastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
    setControlActive(true);
  };
  const onSwipePointerMove = (event: PointerEvent): void => {
    if (swipePointerId !== event.pointerId || activeView !== "seat") {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - swipeLastX;
    const deltaY = event.clientY - swipeLastY;
    swipeLastX = event.clientX;
    swipeLastY = event.clientY;
    swipeLookEuler.setFromQuaternion(camera.quaternion, "YXZ");
    swipeLookEuler.y -= deltaX * SWIPE_LOOK_SENSITIVITY;
    swipeLookEuler.x = THREE.MathUtils.clamp(
      swipeLookEuler.x - deltaY * SWIPE_LOOK_SENSITIVITY,
      -Math.PI / 2 + 0.12,
      Math.PI / 2 - 0.12,
    );
    swipeLookEuler.z = 0;
    camera.quaternion.setFromEuler(swipeLookEuler);
    syncMotionLookReferenceToCamera();
  };
  const onSwipePointerEnd = (event: PointerEvent): void => {
    if (swipePointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    swipePointerId = null;
  };
  const attachOrientationListener = (): void => {
    if (orientationListenerAttached) {
      return;
    }
    window.addEventListener("deviceorientation", onDeviceOrientation, { passive: true });
    window.addEventListener("orientationchange", resetMotionCalibration);
    orientationListenerAttached = true;
  };
  const detachOrientationListener = (): void => {
    if (!orientationListenerAttached) {
      return;
    }
    window.removeEventListener("deviceorientation", onDeviceOrientation);
    window.removeEventListener("orientationchange", resetMotionCalibration);
    orientationListenerAttached = false;
  };
  const setMotionLookEnabled = (enabled: boolean): void => {
    if (!supportsMotionLook || motionLookStatus === "unsupported") {
      return;
    }
    if (!enabled) {
      motionLookEnabled = false;
      setControlActive(false);
      detachOrientationListener();
      resetMotionCalibration();
      return;
    }
    if (motionLookStatus !== "ready") {
      return;
    }
    motionLookEnabled = true;
    resetMotionCalibration();
    attachOrientationListener();
    setControlActive(true);
  };
  const requestMotionLook = (): Promise<MotionLookStatus> => {
    if (motionRequest !== null) {
      return motionRequest;
    }
    const request = (async (): Promise<MotionLookStatus> => {
      if (!supportsMotionLook) {
        setMotionLookStatus("unsupported");
        return "unsupported";
      }
      if (motionLookStatus === "ready") {
        setMotionLookEnabled(true);
        return "ready";
      }
      setMotionLookStatus("requesting");
      try {
        const requestPermission = orientationConstructor?.requestPermission;
        if (requestPermission !== undefined) {
          const permission = await requestPermission();
          if (permission !== "granted") {
            motionLookEnabled = false;
            detachOrientationListener();
            setControlActive(false);
            setMotionLookStatus("denied");
            return "denied";
          }
        }
        setMotionLookEnabled(true);
        setMotionLookStatus("ready");
        return "ready";
      } catch {
        motionLookEnabled = false;
        detachOrientationListener();
        setControlActive(false);
        setMotionLookStatus("denied");
        return "denied";
      }
    })();
    motionRequest = request;
    void request.then(
      () => {
        if (motionRequest === request) {
          motionRequest = null;
        }
      },
      () => {
        if (motionRequest === request) {
          motionRequest = null;
        }
      },
    );
    return request;
  };
  const pressedKeys = new Set<string>();
  let eyeHeight = STANDING_EYE_HEIGHT;
  let firstPersonGroundY = 0;
  let isCrouched = false;
  // This is deliberately separate from the visible posture state. Crouching
  // enables it for the next upright movement, while sprinting clears it; the
  // crouched posture speed remains independent. It is not persisted or exposed
  // through the HUD.
  let isWalkingMode = false;
  let lastDofZoomed: boolean | null = null;
  const syncDofIntensityForZoom = (): void => {
    const zoomedView = activeView === "seat" && aimingDownSights;
    if (zoomedView === lastDofZoomed) {
      return;
    }
    lastDofZoomed = zoomedView;
    debugBokehStrength = resolveDofIntensityForPosture(isCrouched, zoomedView);
    persistDebugPreferences();
  };
  /**
   * Physics bridge bookkeeping. These values are resolved by the movement
   * controller and collision runtime; they are not a second presentation
   * state. The camera receives only the post-physics delta-v impulse and never
   * writes any of these values back into the capsule.
   */
  let jumpOffset = 0;
  let verticalVelocity = 0;
  let presentationWorldVelocity: CameraMotionVector = { x: 0, y: 0, z: 0 };
  let grounded = true;
  let physicsRuntime: MahjongPhysicsRuntime | null = null;
  let physicsCharacterPosition: PhysicsVector | null = null;
  let weaponRuntime: WeaponRuntime | null = null;
  let meleeRuntime: MeleeRuntime | null = null;
  let meleeRearmWeapon: WeaponId | null = null;
  let meleeDropRearmSuppressed = false;
  let staticPhysicsBoxes: readonly PhysicsBox[] = [];
  let dynamicPhysicsBoxes: readonly PhysicsBox[] = [];
  let appliedPhysicsVersion = -1;
  let ledgeClimbTransition: ClimbingTransition | null = null;
  let wallHangState: WallHangState | null = null;
  let wallClimbTransition: WallClimbTransition | null = null;
  let wallHangElapsed = 0;
  let lastSafePhysicsPosition: PhysicsVector | null = null;
  let recoverPlayerFromGeometry: () => boolean = () => false;
  const movementControllerSeed = `${roomSeed}|player-movement-v1`;
  let movementControllerState: PlayerMovementControllerState =
    createPlayerMovementControllerState(movementControllerSeed);
  let pendingTraversalFeedback: PlayerExternalTraversalState | null = null;
  let slideRequested = false;
  let touchingWall = false;
  let wallContact: PlayerWallContact | null = null;
  let wallProximity: PlayerWallContact | null = null;
  let wallBracedAim = false;
  let coverMode = false;
  let coverActivationPending = false;
  let coverActivationPendingWall: PlayerWallContact | null = null;
  let coverWall: PlayerWallContact | null = null;
  let coverSnapTarget: PhysicsVector | null = null;
  let forwardVelocity = 0;
  let strafeVelocity = 0;
  const playerKnockbackVelocity = new THREE.Vector3();
  const cameraMotion = createCameraMotionDamper();
  let activeFirstPersonBaseCameraY: number | null = null;
  let firstPersonPresentation = resolveFirstPersonPresentation(
    reticlePosition,
    cameraMotion.getOffsets(),
    container.clientWidth,
    container.clientHeight,
  );
  let reticlePresentation = firstPersonPresentation.reticle;
  const refreshReticlePresentation = (): ReticlePresentation => {
    firstPersonPresentation = resolveFirstPersonPresentation(
      reticlePosition,
      cameraMotion.getOffsets(),
      container.clientWidth,
      container.clientHeight,
    );
    reticlePresentation = firstPersonPresentation.reticle;
    return reticlePresentation;
  };
  const publishActionCameraMotion = (motion: CameraMotionOffsets): void => {
    if (activeFirstPersonBaseCameraY === null) {
      refreshReticlePresentation();
      return;
    }
    composeFirstPersonCameraMotion(activeFirstPersonBaseCameraY, motion);
    camera.updateMatrixWorld(true);
  };
  const setFocusReticle = (position?: ReticlePosition): void => {
    reticlePosition = resolveReticlePosition(position);
    refreshReticlePresentation();
    syncReticleZoomProjection();
  };
  /** Project a world-space melee push into the current camera frame. */
  const resolveLocalMeleeImpactDirection = (
    worldDirection: PhysicsVector,
  ): CameraLocalAcceleration => {
    cameraImpactRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    cameraImpactForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    cameraImpactUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    return resolveCameraLocalAccelerationFromWorld(worldDirection, {
      right: cameraImpactRight,
      forward: cameraImpactForward,
      up: cameraImpactUp,
    });
  };
  /** Apply one directional kick through the same camera/viewmodel damper. */
  const applyMeleeViewImpact = (
    worldDirection: PhysicsVector,
    stoppingPower: number,
    directionSign: 1 | -1,
    publishImmediately = false,
  ): void => {
    const localDirection = resolveLocalMeleeImpactDirection({
      x: worldDirection.x * directionSign,
      y: worldDirection.y * directionSign,
      z: worldDirection.z * directionSign,
    });
    const motion = cameraMotion.applyMeleeImpactImpulse({ localDirection, stoppingPower });
    if (publishImmediately) {
      publishActionCameraMotion(motion);
    }
  };
  let touchMovementActive = false;
  let touchForward = 0;
  let touchRight = 0;
  let isSprinting = false;
  const lastMovementTapAtByKey = new Map<string, number>();
  let lastSceneStateSaveAt = Number.NEGATIVE_INFINITY;
  let lastSceneStateSerialized: string | null = null;
  const simulantRandom = createSeededRandom(`${roomSeed}|simulant-combat-v1`);
  const playerRespawnRandom = createSeededRandom(`${roomSeed}|player-death-respawn-v1`);
  let simulantMarker: THREE.Group | null = null;
  let simulantBody: THREE.Group | null = null;
  let simulantBodyParts: RagdollBodyParts | null = null;
  let simulantRing: THREE.Mesh | null = null;
  let simulantRagdollState: RagdollState | null = null;
  let simulantRagdollFloorY = PLAYER_COLLIDER_CENTER_HEIGHT;
  let simulantDeathImpulse: RagdollImpulse = {
    direction: { x: 0, y: 0, z: -1 },
    force: 3,
  };
  let playerRagdollMarker: THREE.Group | null = null;
  let playerRagdollBody: THREE.Group | null = null;
  let playerRagdollBodyParts: RagdollBodyParts | null = null;
  let playerRagdollState: RagdollState | null = null;
  let playerRagdollFloorY = PLAYER_COLLIDER_CENTER_HEIGHT;
  let simulantShieldFlareMaterial: THREE.ShaderMaterial | null = null;
  let simulantShieldShell: THREE.Mesh | null = null;
  let simulantShieldFlareRemainingSeconds = 0;
  let simulantShieldFlareElapsedSeconds = 0;
  let simulantRespawnTimer = 0;
  const simulantPosition = new THREE.Vector3();
  let simulantWorldVelocity: PhysicsVector = { x: 0, y: 0, z: 0 };
  const simulantKnockbackVelocity = new THREE.Vector3();
  let simulantStaggerSeconds = 0;
  let simulantWeaponTarget: SimulantWeaponTarget | null = null;
  let simulantWeapon: SimulantWeaponSource | null = null;
  let simulantWeaponModel: THREE.Group | null = null;
  let simulantMeleeSwinging = false;
  let simulantMeleeSwingElapsedSeconds = 0;
  let simulantMeleeSwingDurationSeconds = 0;
  let simulantMeleeSwingDirection: MeleeSwingDirection = "right-to-left";
  let simulantMeleeNextSwingDirection: MeleeSwingDirection = "right-to-left";
  let simulantMeleeHitResolved = false;
  let simulantMeleeTarget: SimulantMeleeTarget | null = null;
  let simulantMeleeCooldownSeconds = 0;
  const simulantPerspectiveRig = createCameraMotionDamper();
  let simulantVitals = createPlayerVitals();
  let playerVitals = createPlayerVitals();
  let killScore = createKillScoreSnapshot();
  let deathFadeStartTimer = 0;
  let deathRespawnTimer = 0;
  let vitalsPublishElapsed = 0;
  let speedPublishElapsed = 0;
  let publishedPlayerSpeed: number | null = null;
  let exerciseIntensity = 0;
  let movementMagnitudeActivity = 0;
  let locomotionBlendActivity = 0;
  let sprintingActivity = false;
  let publishedSprintingActivity: boolean | null = null;
  let crouchWalkingActivity = false;
  let walkingActivity = false;
  let crouchedActivity = false;
  let leftCommandHeld = false;
  let rightMouseAiming = false;
  let aimingDownSightsRequested = false;
  let aimingDownSights = false;
  let impactDamageCooldown = 0;
  /** Accumulated fall speed is physics/O₂ bookkeeping, never a camera load. */
  let maximumFallSpeed = 0;
  const publishSprintingActivity = (sprinting: boolean): void => {
    if (publishedSprintingActivity === sprinting) {
      return;
    }
    publishedSprintingActivity = sprinting;
    options.onSprintingChange?.(sprinting);
  };
  const publishPlayerSpeed = (speed: number, force = false): void => {
    const normalizedSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    if (!force && speedPublishElapsed < 0.1) {
      return;
    }
    speedPublishElapsed = 0;
    if (
      !force &&
      publishedPlayerSpeed !== null &&
      Math.abs(normalizedSpeed - publishedPlayerSpeed) < 0.01
    ) {
      container.dataset.playerSpeed = normalizedSpeed.toFixed(2);
      return;
    }
    publishedPlayerSpeed = normalizedSpeed;
    container.dataset.playerSpeed = normalizedSpeed.toFixed(2);
    options.onSpeedChange?.(normalizedSpeed);
  };
  const publishPlayerVitals = (force = false): void => {
    if (!force && vitalsPublishElapsed < 0.1) {
      return;
    }
    vitalsPublishElapsed = 0;
    container.dataset.playerHealth = String(Math.round(playerVitals.health));
    container.dataset.playerShield = String(Math.round(playerVitals.shield));
    container.dataset.playerO2 = String(Math.round(playerVitals.o2));
    container.dataset.playerHoldingBreath = playerVitals.holdingBreath ? "true" : "false";
    container.dataset.playerHoldBreathLocked = playerVitals.holdBreathLocked ? "true" : "false";
    container.dataset.playerAimingDownSights = aimingDownSights ? "true" : "false";
    container.dataset.playerShieldRecharging =
      playerVitals.shield < PLAYER_MAX_SHIELD &&
      playerVitals.timeSinceDamage >= SHIELD_RECHARGE_DELAY_SECONDS
        ? "true"
        : "false";
    options.onVitalsChange?.(playerVitals);
  };
  const publishKillScore = (): void => {
    options.onKillScoreChange?.(killScore);
  };
  const recordAuthoritativeKill = (attackerId: CombatActorId | null): void => {
    if (attackerId === LOCAL_PLAYER_COMBAT_ACTOR_ID) {
      killScore = recordKill(killScore, "player");
      publishKillScore();
      return;
    }
    if (attackerId === SIMULANT_COMBAT_ACTOR_ID) {
      killScore = recordKill(killScore, "simulant");
      publishKillScore();
    }
  };
  const didPlayerVitalsChange = (nextVitals: PlayerVitalsState): boolean =>
    nextVitals.health !== playerVitals.health ||
    nextVitals.shield !== playerVitals.shield ||
    nextVitals.o2 !== playerVitals.o2 ||
    nextVitals.oxygenRecoveryDelaySeconds !== playerVitals.oxygenRecoveryDelaySeconds ||
    nextVitals.holdingBreath !== playerVitals.holdingBreath ||
    nextVitals.holdBreathLocked !== playerVitals.holdBreathLocked;
  const cancelDeathRespawn = (): void => {
    if (deathFadeStartTimer !== 0) {
      window.clearTimeout(deathFadeStartTimer);
      deathFadeStartTimer = 0;
    }
    if (deathRespawnTimer !== 0) {
      window.clearTimeout(deathRespawnTimer);
      deathRespawnTimer = 0;
    }
  };
  const scheduleDeathRespawn = (): void => {
    cancelDeathRespawn();
    deathFadeOverlay.style.transition = "none";
    deathFadeOverlay.style.opacity = "0";
    deathFadeStartTimer = window.setTimeout(() => {
      deathFadeStartTimer = 0;
      deathFadeOverlay.style.transition = `opacity ${String(PLAYER_DEATH_FADE_DURATION_MS)}ms ease-in`;
      deathFadeOverlay.style.opacity = "1";
    }, PLAYER_DEATH_RESPAWN_DELAY_MS - PLAYER_DEATH_FADE_DURATION_MS);
    deathRespawnTimer = window.setTimeout(() => {
      deathRespawnTimer = 0;
      resetToSpawn();
      deathFadeOverlay.style.transition = `opacity ${String(PLAYER_RESPAWN_FADE_IN_DURATION_MS)}ms ease-out`;
      deathFadeOverlay.style.opacity = "0";
    }, PLAYER_DEATH_RESPAWN_DELAY_MS);
  };
  const startPlayerRagdoll = (): void => {
    if (
      playerRagdollMarker === null ||
      playerRagdollBody === null ||
      playerRagdollBodyParts === null
    ) {
      return;
    }
    const anchor = physicsCharacterPosition ?? {
      x: camera.position.x,
      y: camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
      z: camera.position.z,
    };
    const viewForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    viewForward.y = 0;
    if (viewForward.lengthSq() <= 0.0001) {
      viewForward.set(0, 0, -1);
    } else {
      viewForward.normalize();
    }
    const cameraForward = viewForward.clone();
    const movement = new THREE.Vector3(presentationWorldVelocity.x, 0, presentationWorldVelocity.z);
    if (movement.lengthSq() > 0.04) {
      cameraForward.copy(movement.normalize());
    }
    const speed = Math.hypot(presentationWorldVelocity.x, presentationWorldVelocity.z);
    const viewRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    viewRight.y = 0;
    if (viewRight.lengthSq() <= 0.0001) {
      viewRight.set(1, 0, 0);
    } else {
      viewRight.normalize();
    }
    const origin = {
      x: anchor.x + viewForward.x * 1.05 + viewRight.x * 0.35,
      y: anchor.y + 0.15,
      z: anchor.z + viewForward.z * 1.05 + viewRight.z * 0.35,
    };
    playerRagdollFloorY = anchor.y;
    playerRagdollState = startRagdoll(origin, {
      direction: cameraForward,
      force: 4 + speed * 0.55,
      upwardForce: Math.max(0, presentationWorldVelocity.y) * 0.08,
    });
    playerRagdollMarker.visible = true;
    playerRagdollMarker.userData.weaponRaycastIgnore = true;
    applyRagdollBodyPose(
      playerRagdollMarker,
      playerRagdollBody,
      playerRagdollBodyParts,
      playerRagdollState,
    );
  };
  const handlePlayerKilled = (): void => {
    startPlayerRagdoll();
    cameraMotion.applyDeathTumble();
    playerKnockbackVelocity.set(0, 0, 0);
    pressedKeys.clear();
    jumpKeyHeld = false;
    jumpPressQueued = false;
    touchMovementActive = false;
    touchForward = 0;
    touchRight = 0;
    isSprinting = false;
    leftCommandHeld = false;
    rightMouseAiming = false;
    aimingDownSightsRequested = false;
    syncAimingFromInput();
    forwardVelocity = 0;
    strafeVelocity = 0;
    verticalVelocity = 0;
    movementControllerState = createPlayerMovementControllerState(movementControllerSeed, false);
    slideRequested = false;
    meleeRuntime?.recordDeath();
    weaponRuntime?.setFireHeld(false);
    scheduleDeathRespawn();
  };
  const combatDamageRouter = createCombatDamageRouter();
  combatDamageRouter.register({
    id: LOCAL_PLAYER_COMBAT_ACTOR_ID,
    kind: "player",
    getVitals: () => playerVitals,
    setVitals: (nextVitals) => {
      playerVitals = nextVitals;
    },
    onDamage: (result) => {
      addDamageVignette("shield", result.shieldDamage);
      addDamageVignette("health", result.healthDamage);
      if (result.source.kind === "melee") {
        addMeleeImpactFlash(result.damage);
      }
      publishPlayerVitals(true);
    },
    onKilled: (result) => {
      recordAuthoritativeKill(result.attackerId);
      weaponRuntime?.recordDeath();
      handlePlayerKilled();
    },
  });
  combatDamageRouter.register({
    id: SIMULANT_COMBAT_ACTOR_ID,
    kind: "bot",
    getVitals: () => simulantVitals,
    setVitals: (nextVitals) => {
      simulantVitals = nextVitals;
    },
    onDamage: (result) => {
      if (result.shieldDamage > 0) {
        simulantShieldFlareRemainingSeconds = SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS;
      }
      syncSimulantMarkerVitals();
    },
    onKilled: (result) => {
      recordAuthoritativeKill(result.attackerId);
      scheduleSimulantRespawn();
    },
  });
  const applyPlayerKnockback = (direction: PhysicsVector, stoppingPower: number): void => {
    const resolved = resolvePlayerKnockbackVelocity(
      direction,
      stoppingPower,
      playerKnockbackVelocity,
    );
    playerKnockbackVelocity.set(resolved.x, resolved.y, resolved.z);
  };
  const resolveSimulantMeleeHit = (): void => {
    const source = simulantWeapon;
    const target = simulantMeleeTarget;
    if (
      source === null ||
      target === null ||
      playerVitals.isDead ||
      simulantVitals.isDead ||
      simulantRagdollState !== null
    ) {
      return;
    }
    if (target.kind === "support-box") {
      const direction = {
        x: target.position.x - simulantPosition.x,
        y: target.position.y - simulantPosition.y,
        z: target.position.z - simulantPosition.z,
      };
      const horizontalDistance = Math.hypot(direction.x, direction.z);
      if (horizontalDistance <= Number.EPSILON) {
        return;
      }
      direction.x /= horizontalDistance;
      direction.y = 0;
      direction.z /= horizontalDistance;
      const applied = explorationWorld?.applyMeleeHit(
        target.objectId,
        direction,
        source.snapshot.swingSpeedRadiansPerSecond,
        source.snapshot.stoppingPower,
      );
      if (applied === true) {
        weaponRuntime?.playMeleeImpactSound(
          source.snapshot,
          new THREE.Vector3(target.position.x, target.position.y, target.position.z),
        );
      }
      return;
    }
    const toPlayer = new THREE.Vector3(
      camera.position.x - simulantPosition.x,
      0,
      camera.position.z - simulantPosition.z,
    );
    const distance = toPlayer.length();
    const playerPosition =
      physicsCharacterPosition ??
      new THREE.Vector3(
        camera.position.x,
        camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
        camera.position.z,
      );
    const handHeight = simulantPosition.y + SIMULANT_WEAPON_HAND_OFFSET.y;
    const verticalReach = Math.max(0.8, source.snapshot.rangeMeters + PLAYER_CAPSULE_RADIUS);
    if (
      distance <= 0.0001 ||
      distance > SIMULANT_STOP_DISTANCE_METERS + 0.6 ||
      Math.abs(playerPosition.y - handHeight) > verticalReach
    ) {
      return;
    }
    toPlayer.multiplyScalar(1 / distance);
    const momentum = resolveMeleeDamageWithMomentum({
      baseDamage: source.snapshot.damage,
      attackDirection: { x: toPlayer.x, y: 0, z: toPlayer.z },
      attackerVelocity: simulantWorldVelocity,
      targetVelocity: presentationWorldVelocity,
      attackerAirborne: false,
    });
    const applied = combatDamageRouter.apply({
      targetId: LOCAL_PLAYER_COMBAT_ACTOR_ID,
      amount: momentum.damage,
      source: { kind: "melee", id: source.snapshot.displayName },
      attackerId: SIMULANT_COMBAT_ACTOR_ID,
    });
    if (applied.damage > 0 && !applied.killed) {
      const stoppingPower = resolveMeleeStoppingPower(momentum.damage);
      // The camera follows the same away-from-attacker vector as the physical
      // knockback. This is the resolved push direction, not a fixed backward
      // kick based on where the victim happens to be looking.
      applyMeleeViewImpact(toPlayer, stoppingPower, 1);
      applyPlayerKnockback(toPlayer, stoppingPower);
      weaponRuntime?.playMeleeImpactSound(source.snapshot, camera.position);
    }
  };
  const startSimulantMeleeSwing = (target: SimulantMeleeTarget): void => {
    const source = simulantWeapon;
    if (
      source === null ||
      simulantMeleeSwinging ||
      simulantMeleeCooldownSeconds > 0 ||
      playerVitals.isDead ||
      simulantVitals.isDead
    ) {
      return;
    }
    const swing = resolveMeleeSwing(source.snapshot.volumeM3);
    simulantMeleeSwingDirection = simulantMeleeNextSwingDirection;
    simulantMeleeNextSwingDirection =
      simulantMeleeSwingDirection === "right-to-left" ? "left-to-right" : "right-to-left";
    simulantMeleeSwingDurationSeconds = swing.swingDurationSeconds;
    simulantMeleeSwingElapsedSeconds = 0;
    simulantMeleeHitResolved = false;
    simulantMeleeTarget = target;
    simulantMeleeSwinging = true;
    weaponRuntime?.playMeleeSwingSound(
      source.snapshot,
      simulantPosition,
      simulantMeleeSwingDurationSeconds,
    );
  };
  const resolveSimulantMeleeTarget = (
    source: SimulantWeaponSource,
    attackDistance: number,
  ): SimulantMeleeTarget | null => {
    const playerPosition =
      physicsCharacterPosition ??
      new THREE.Vector3(
        camera.position.x,
        camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
        camera.position.z,
      );
    const playerDistance = Math.hypot(
      playerPosition.x - simulantPosition.x,
      playerPosition.z - simulantPosition.z,
    );
    const handHeight = simulantPosition.y + SIMULANT_WEAPON_HAND_OFFSET.y;
    const verticalReach = Math.max(0.8, source.snapshot.rangeMeters + PLAYER_CAPSULE_RADIUS);
    if (
      playerDistance <= attackDistance &&
      Math.abs(playerPosition.y - handHeight) <= verticalReach
    ) {
      return { kind: "player" };
    }
    if (!grounded) {
      return null;
    }
    const support = explorationWorld?.getMeleeSupportTarget({
      x: playerPosition.x,
      y: playerPosition.y,
      z: playerPosition.z,
    });
    if (support === null || support === undefined) {
      return null;
    }
    const supportDistance = Math.hypot(
      support.position.x - simulantPosition.x,
      support.position.z - simulantPosition.z,
    );
    if (supportDistance > attackDistance + DEBUGGING_TWO_BOX_SIZE * 0.5) {
      return null;
    }
    return {
      kind: "support-box",
      objectId: support.objectId,
      position: support.position,
    };
  };
  const damagePlayer = (
    damage: number,
    source: CombatDamageSource = { kind: "impact" },
  ): PlayerVitalsDamageResult =>
    combatDamageRouter.apply({
      targetId: LOCAL_PLAYER_COMBAT_ACTOR_ID,
      amount: damage,
      source,
    });
  const applyLandingO2 = (downwardSpeed: number): void => {
    const oxygenCost = resolveLandingO2Cost(downwardSpeed);
    if (oxygenCost <= 0 || playerVitals.isDead) {
      return;
    }
    const shortfallDamage = resolveLandingO2OverflowDamage(
      downwardSpeed,
      oxygenCost,
      playerVitals.o2,
    );
    const oxygenResult = applyPlayerO2ImpactCost(
      playerVitals,
      oxygenCost,
      O2_LANDING_RECOVERY_DELAY_SECONDS,
      0,
    );
    if (oxygenResult.oxygenSpent <= 0 && shortfallDamage <= 0) {
      return;
    }
    if (oxygenResult.oxygenSpent > 0 || shortfallDamage > 0) {
      playerVitals = oxygenResult.state;
    }
    if (shortfallDamage > 0) {
      damagePlayer(shortfallDamage, { kind: "oxygen", id: "landing-overflow" });
    } else if (oxygenResult.oxygenSpent > 0) {
      publishPlayerVitals(true);
    }
  };
  const spendPlayerO2 = (oxygenCost: number, recoveryDelaySeconds = 0): boolean => {
    if (playerVitals.isDead || oxygenCost > playerVitals.o2) {
      return false;
    }
    const nextVitals = applyPlayerO2Cost(playerVitals, oxygenCost, recoveryDelaySeconds);
    if (didPlayerVitalsChange(nextVitals)) {
      playerVitals = nextVitals;
      publishPlayerVitals(true);
    }
    return true;
  };
  const spendPlayerProjectileO2 = (
    damage: number,
    projectileCount: number,
    aimingDownSights = true,
  ): number => {
    if (playerVitals.isDead || playerVitals.o2 <= 0) {
      return 0;
    }
    const previousO2 = playerVitals.o2;
    const nextVitals = applyPlayerProjectileO2Cost(
      playerVitals,
      damage,
      projectileCount,
      aimingDownSights,
    );
    if (didPlayerVitalsChange(nextVitals)) {
      playerVitals = nextVitals;
      publishPlayerVitals(true);
    }
    return previousO2 - playerVitals.o2;
  };
  const clearCoverMode = (): void => {
    coverMode = false;
    coverActivationPending = false;
    coverActivationPendingWall = null;
    coverWall = null;
    coverSnapTarget = null;
  };
  const setAiming = (aiming: boolean, holdingBreath: boolean): void => {
    const controlsActive =
      firstPersonControls.isLocked || (isTouchDevice && firstPersonControls.enabled);
    const requestedAiming = aiming && activeView === "seat" && controlsActive;
    const zoomActivatedByInput = resolveZoomActivationEdge(
      aimingDownSightsRequested,
      requestedAiming,
    );
    aimingDownSightsRequested = requestedAiming;
    const nextAiming = resolveReloadAimingDownSights(
      requestedAiming,
      weaponRuntime?.isReloading() ?? false,
    );
    const aimingChanged = aimingDownSights !== nextAiming;
    aimingDownSights = nextAiming;
    if (!requestedAiming) {
      clearCoverMode();
    } else if (aimingChanged && zoomActivatedByInput) {
      // The wall-range flag is the last completed physics probe. This records
      // the near-wall state at the zoom-on edge, so walking into a wall while
      // already zoomed cannot arm cover later.
      coverActivationPending = wallProximity !== null;
      coverActivationPendingWall = wallProximity;
    }
    const nextVitals = setPlayerHoldingBreath(
      playerVitals,
      holdingBreath && nextAiming,
      nextAiming,
    );
    if (didPlayerVitalsChange(nextVitals) || aimingChanged) {
      playerVitals = nextVitals;
      publishPlayerVitals(true);
    }
  };
  const syncAimingFromInput = (): void => {
    const aimInput = resolveDesktopAimInput(leftCommandHeld, rightMouseAiming);
    setAiming(aimInput.aimingDownSights, aimInput.holdingBreath);
  };
  /** Melee is a hip-fire action: release both persistent zoom inputs first. */
  const cancelZoomForMelee = (): void => {
    if (!leftCommandHeld && !rightMouseAiming && !aimingDownSightsRequested && !aimingDownSights) {
      return;
    }
    leftCommandHeld = false;
    rightMouseAiming = false;
    syncAimingFromInput();
  };
  const resetVitalsState = (): PlayerVitalsState => {
    clearDamageVignettePulses();
    clearMeleeImpactFlashes();
    playerKnockbackVelocity.set(0, 0, 0);
    cancelDeathRespawn();
    playerRagdollState = null;
    if (playerRagdollMarker !== null) {
      playerRagdollMarker.visible = false;
      playerRagdollMarker.rotation.set(0, 0, 0);
      playerRagdollMarker.userData.weaponRaycastIgnore = true;
    }
    if (playerRagdollBody !== null && playerRagdollBodyParts !== null) {
      resetRagdollBodyPose(playerRagdollBody, playerRagdollBodyParts);
    }
    cameraMotion.reset();
    playerVitals = resetPlayerVitals();
    vitalsPublishElapsed = 0;
    publishPlayerVitals(true);
    return playerVitals;
  };
  publishPlayerVitals(true);
  publishKillScore();
  publishPlayerSpeed(0, true);
  const captureSceneState = (): VisualSceneState => {
    const standingEyeHeight =
      !debugEnabled && activeDebugPreset === null
        ? isCleanSlateMap
          ? cleanSlateSeatPreset.position.y
          : TABLE_CAMERA_STANDING_EYE_HEIGHT
        : STANDING_EYE_HEIGHT;
    const cameraPosition: VisualSceneState["cameraPosition"] = [
      camera.position.x,
      activeView === "seat"
        ? isCrouched
          ? SEATED_EYE_HEIGHT
          : standingEyeHeight
        : camera.position.y,
      camera.position.z,
    ];
    const cameraQuaternion: VisualSceneState["cameraQuaternion"] = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ];
    const orbitTarget: VisualSceneState["orbitTarget"] = [
      orbitControls.target.x,
      orbitControls.target.y,
      orbitControls.target.z,
    ];
    return {
      version: VISUAL_SCENE_STATE_VERSION,
      roomSeed,
      view: activeView,
      activeDebugPreset,
      cameraPosition,
      cameraQuaternion,
      orbitTarget,
      cameraFov: camera.fov,
      isCrouched: activeView === "seat" && isCrouched,
    };
  };
  const saveSceneState = (force = false): void => {
    if (sceneStateStorage === null) {
      return;
    }
    const now = window.performance.now();
    if (!force && now - lastSceneStateSaveAt < VISUAL_SCENE_STATE_SAVE_INTERVAL_MS) {
      return;
    }
    const state = captureSceneState();
    const serialized = serializeVisualSceneState(state);
    if (
      serialized !== lastSceneStateSerialized &&
      writeVisualSceneState(sceneStateStorage, state)
    ) {
      lastSceneStateSerialized = serialized;
    }
    lastSceneStateSaveAt = now;
  };
  const onHotModuleDispose = (): void => {
    saveSceneState(true);
  };
  window.addEventListener(MAHJONG_TABLE_HMR_SAVE_EVENT, onHotModuleDispose);
  const syncPhysicsCharacterToCamera = (): void => {
    physicsCharacterPosition = {
      x: camera.position.x,
      y: camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
      z: camera.position.z,
    };
    lastSafePhysicsPosition = { ...physicsCharacterPosition };
  };
  const clearWallTraversal = (): void => {
    wallHangState = null;
    wallClimbTransition = null;
    wallHangElapsed = 0;
  };
  const cancelTraversalExecution = (kind: PlayerExternalTraversalState["kind"]): void => {
    if (kind === "vault" || kind === "ledge-grab") {
      ledgeClimbTransition = null;
    } else if (kind === "wall-contact") {
      wallHangState = null;
      wallHangElapsed = 0;
    } else {
      wallClimbTransition = null;
    }
    grounded = false;
    verticalVelocity = 0;
  };
  const queueTraversalFeedback = (
    kind: PlayerExternalTraversalState["kind"],
    obstacleId: string,
    outcome: "completed" | "cancelled",
  ): void => {
    if (pendingTraversalFeedback?.completed === true && outcome === "cancelled") {
      return;
    }
    pendingTraversalFeedback =
      outcome === "completed"
        ? { kind, obstacleId, progress: 1, contactValid: true, completed: true }
        : { kind, obstacleId, progress: 0, contactValid: false, cancelled: true };
  };
  const beginWallClimb = (): boolean => {
    const wall = wallHangState;
    if (wall === null || wallClimbTransition !== null) {
      return false;
    }
    const wallClimbPhysicsBoxes = [
      ...staticPhysicsBoxes,
      ...dynamicPhysicsBoxes.filter((box) => box.dynamic !== true),
    ];
    const sourceBox = wallClimbPhysicsBoxes.find(
      (box) => resolvePhysicsBoxObstacleId(box) === wall.sourceObstacleId,
    );
    const refreshedWall =
      sourceBox === undefined ||
      resolvePhysicsBoxGeometrySignature(sourceBox) !== wall.sourceGeometryKey
        ? null
        : resolveWallHangTargetDetails(wall.target, wall.approachDirection, [sourceBox]);
    if (refreshedWall === null) {
      return false;
    }
    wall.target = refreshedWall.target;
    wall.wallNormal = refreshedWall.wallNormal;
    wall.wallFacePoint = refreshedWall.wallFacePoint;
    wall.wallTopY = refreshedWall.wallTopY;
    wall.box = refreshedWall.box;
    const targetPosition = resolveWallClimbTarget(wall);
    if (!isPlayerCapsulePositionClear(targetPosition, wallClimbPhysicsBoxes)) {
      return false;
    }
    const climbHeight = Math.max(0, targetPosition.y - wall.target.y);
    const oxygenRatio = playerVitals.o2 / PLAYER_MAX_O2;
    const traversalO2Cost = resolveVaultTraversalO2Cost(climbHeight);
    if (!spendPlayerO2(traversalO2Cost, O2_JUMP_RECOVERY_DELAY_SECONDS)) {
      return false;
    }
    const preservedSpeed = Math.hypot(wall.preservedForwardVelocity, wall.preservedStrafeVelocity);
    wallClimbTransition = {
      traversalKind: "wall-climb",
      sourceObstacleId: wall.sourceObstacleId,
      sourceGeometryKey: wall.sourceGeometryKey,
      sourceBox: wall.box,
      duration: resolveO2ScaledTraversalDuration(
        resolveVaultTraversalDuration(climbHeight),
        oxygenRatio,
      ),
      arcHeight: resolveVaultTraversalArcHeight(climbHeight),
      elapsed: 0,
      phase: "vault",
      traversalHeightMeters: climbHeight,
      startX: wall.target.x,
      startY: wall.target.y,
      startZ: wall.target.z,
      targetX: targetPosition.x,
      targetY: targetPosition.y,
      targetZ: targetPosition.z,
      preservedForwardVelocity: wall.preservedForwardVelocity,
      preservedStrafeVelocity: wall.preservedStrafeVelocity,
      preserveSprinting: wall.preserveSprinting,
      landingBoostDistance:
        preservedSpeed > 0 ? Math.min(LEDGE_CLIMB_EXIT_BOOST_DISTANCE, preservedSpeed * 0.05) : 0,
    };
    wallHangState = null;
    wallHangElapsed = 0;
    grounded = false;
    verticalVelocity = 0;
    forwardVelocity = 0;
    strafeVelocity = 0;
    return true;
  };
  const resetCameraMotion = (): void => {
    cameraMotion.reset();
    presentationWorldVelocity = { x: 0, y: verticalVelocity, z: 0 };
    refreshReticlePresentation();
    camera.updateMatrix();
  };
  const movementKeys = MOVEMENT_KEY_CODES;
  let jumpKeyHeld = false;
  let jumpPressQueued = false;
  const hasMovementInput = (): boolean => {
    for (const key of movementKeys) {
      if (pressedKeys.has(key)) {
        return true;
      }
    }
    return false;
  };
  const crouchKeys = new Set(["ShiftLeft", "ShiftRight"]);
  const setCrouched = (nextCrouched: boolean): boolean => {
    if (nextCrouched) {
      slideRequested =
        !isCrouched &&
        grounded &&
        (isSprinting ||
          Math.hypot(forwardVelocity, strafeVelocity) >=
            PLAYER_SLIDE_START_SPEED_METERS_PER_SECOND);
      // Crouch also enables the hidden upright walk switch. The crouched
      // posture branch remains authoritative for speed while it is active.
      isWalkingMode = true;
      // Do not let a prior sprint request resume automatically while crouched.
      isSprinting = false;
    }
    if (isCrouched !== nextCrouched) {
      isCrouched = nextCrouched;
      options.onCrouchingChange?.(isCrouched);
    }
    return true;
  };
  const resolvePlayerWorldVelocity = (): PhysicsVector => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 0.0001) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }
    return {
      x: forward.x * forwardVelocity + right.x * strafeVelocity,
      y: verticalVelocity,
      z: forward.z * forwardVelocity + right.z * strafeVelocity,
    };
  };
  const startSprint = (): void => {
    const sprintAccepted = !isCrouched || setCrouched(false);
    isCrouched = resolveCrouchedStateAfterSprint(isCrouched, sprintAccepted);
    isWalkingMode = isCrouched;
    if (isCrouched) {
      isSprinting = false;
      return;
    }
    if (shouldInterruptReloadForSprint(weaponRuntime?.isReloading() ?? false, sprintAccepted)) {
      weaponRuntime?.interruptReload();
    }
    isSprinting = true;
    // Sprinting is a committed locomotion action: leave the persistent
    // right-mouse zoom mode before the faster movement begins.
    if (rightMouseAiming) {
      rightMouseAiming = false;
      syncAimingFromInput();
    }
  };
  const runGunActionWithMeleeHandoff = (action: () => boolean): boolean => {
    const meleeWasActive = meleeRuntime?.isActive() ?? false;
    if (meleeWasActive && !(meleeRuntime?.stash() ?? false)) {
      return false;
    }
    const succeeded = action();
    if (!succeeded && meleeWasActive) {
      meleeRuntime?.interact();
    }
    return succeeded;
  };
  const triggerMeleeAttack = (): boolean => {
    const aimRay = capturePreActionAimRay();
    const started = meleeRuntime?.isActive()
      ? meleeRuntime.fire(aimRay)
      : (weaponRuntime?.melee(aimRay) ?? false);
    if (started) {
      cancelZoomForMelee();
    }
    return started;
  };
  const releaseMeleeObjectAndRearmGun = (throwObject: boolean): boolean => {
    const playerVelocity = resolvePlayerWorldVelocity();
    const dropped = throwObject
      ? (meleeRuntime?.throwActiveObject(playerVelocity) ?? false)
      : (meleeRuntime?.dropActiveObject(playerVelocity) ?? false);
    const rearmWeapon = resolveMeleeDropRearmWeapon(meleeRearmWeapon, dropped);
    if (!dropped) {
      return false;
    }
    const shouldCycleToOwnedGun = shouldAutoRearmOwnedGunAfterMeleeDrop(
      meleeRearmWeapon,
      dropped,
      meleeDropRearmSuppressed,
    );
    meleeRearmWeapon = null;
    meleeDropRearmSuppressed = false;
    if (rearmWeapon !== null) {
      weaponRuntime?.cycleWeaponTo(rearmWeapon);
    } else if (shouldCycleToOwnedGun) {
      weaponRuntime?.cycleWeapon(1);
    }
    return true;
  };
  const dropMeleeObjectAndRearmGun = (): boolean => releaseMeleeObjectAndRearmGun(false);
  const throwMeleeObjectAndRearmGun = (): boolean => {
    const thrown = releaseMeleeObjectAndRearmGun(true);
    if (thrown) {
      cancelZoomForMelee();
    }
    return thrown;
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const leftCommandKey = isLeftCommandKeyEvent(event);
    const captureLeftCommand = shouldCaptureLeftCommandKeystroke(event, leftCommandHeld);
    const controlsActive =
      firstPersonControls.isLocked || (isTouchDevice && firstPersonControls.enabled);
    if (activeView !== "seat" || (!controlsActive && !captureLeftCommand)) {
      return;
    }
    if (playerVitals.isDead) {
      return;
    }
    if (captureLeftCommand) {
      // Keep browser-level shortcuts such as Command+W from acting on the
      // game tab while the left Command hold is active.
      event.preventDefault();
      if (leftCommandKey) {
        leftCommandHeld = true;
        if (!event.repeat) {
          syncAimingFromInput();
        }
        return;
      }
    }
    if (
      movementKeys.has(event.code) ||
      crouchKeys.has(event.code) ||
      event.code === "Space" ||
      event.code === "KeyE" ||
      event.code === "KeyR" ||
      event.code === "KeyQ" ||
      event.code === "KeyF" ||
      event.code === "KeyX" ||
      /^Digit[0-6]$/u.test(event.code)
    ) {
      event.preventDefault();
      if (event.code === "KeyE") {
        if (!event.repeat) {
          const meleeActive = meleeRuntime?.isActive() ?? false;
          const gunNearby = (weaponRuntime?.getSnapshot().nearbyPickup ?? null) !== null;
          if (meleeActive || gunNearby) {
            // Stash before changing gun state so the two viewmodels can never
            // be active in the same frame. Restore melee if the gun action
            // does not succeed.
            runGunActionWithMeleeHandoff(() => weaponRuntime?.interact() ?? false);
          } else if (!meleeRuntime?.interact()) {
            weaponRuntime?.interact();
          }
        }
      } else if (event.code === "KeyR") {
        if (!event.repeat) {
          weaponRuntime?.reload();
        }
      } else if (event.code === "KeyQ") {
        if (!event.repeat) {
          if (!meleeRuntime?.isActive()) {
            weaponRuntime?.dropActiveWeapon(resolvePlayerWorldVelocity());
          } else {
            dropMeleeObjectAndRearmGun();
          }
        }
      } else if (event.code === "KeyF") {
        if (!event.repeat) {
          triggerMeleeAttack();
        }
      } else if (event.code === "KeyX") {
        if (!event.repeat) {
          recoverPlayerFromGeometry();
        }
      } else if (/^Digit[0-6]$/u.test(event.code)) {
        if (!event.repeat) {
          const selectedWeapon = resolveWeaponHotkey(event.code);
          if (selectedWeapon === null) {
            meleeRuntime?.holster();
            meleeRearmWeapon = null;
            meleeDropRearmSuppressed = true;
            weaponRuntime?.holster();
          } else if (selectedWeapon !== undefined) {
            runGunActionWithMeleeHandoff(
              () => weaponRuntime?.cycleWeaponTo(selectedWeapon) ?? false,
            );
          }
        }
      } else if (crouchKeys.has(event.code)) {
        if (!event.repeat) {
          setCrouched(!isCrouched);
        }
      } else if (event.code === "Space") {
        if (!jumpKeyHeld) {
          jumpPressQueued = true;
        }
        jumpKeyHeld = true;
      } else if (movementKeys.has(event.code)) {
        pressedKeys.add(event.code);
        const now = window.performance.now();
        if (isMovementDoubleTap(event.code, now, lastMovementTapAtByKey, event.repeat)) {
          startSprint();
        }
        if (!event.repeat) {
          lastMovementTapAtByKey.set(event.code, now);
        }
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    const leftCommandKey = isLeftCommandKeyEvent(event);
    if (shouldCaptureLeftCommandKeystroke(event, leftCommandHeld)) {
      event.preventDefault();
    }
    if (leftCommandKey) {
      leftCommandHeld = false;
      syncAimingFromInput();
    }
    pressedKeys.delete(event.code);
    if (event.code === "Space") {
      jumpKeyHeld = false;
    }
    if (movementKeys.has(event.code) && !hasMovementInput()) {
      isSprinting = false;
    }
  };
  const setTouchMovementVector = (forward: number, right: number, active: boolean): void => {
    if (playerVitals.isDead) {
      touchMovementActive = false;
      touchForward = 0;
      touchRight = 0;
      return;
    }
    touchForward = THREE.MathUtils.clamp(forward, -1, 1);
    touchRight = THREE.MathUtils.clamp(right, -1, 1);
    touchMovementActive = active;
  };
  const toggleCrouch = (): boolean => {
    if (activeView === "seat") {
      setCrouched(!isCrouched);
    }
    return isCrouched;
  };
  const setJumpInput = (pressed: boolean): boolean => {
    if (playerVitals.isDead) {
      jumpKeyHeld = false;
      jumpPressQueued = false;
      return isCrouched;
    }
    if (pressed && !jumpKeyHeld) {
      jumpPressQueued = true;
    }
    jumpKeyHeld = pressed;
    return isCrouched;
  };
  const applyControllerJump = (jumpAction: PlayerJumpAction): boolean => {
    if (
      jumpAction.oxygenCost > 0 &&
      !spendPlayerO2(jumpAction.oxygenCost, O2_JUMP_RECOVERY_DELAY_SECONDS)
    ) {
      return false;
    }
    setCrouched(resolveCrouchedStateAfterJump(isCrouched, true));
    isWalkingMode = resolveWalkingModeAfterJump(isWalkingMode, true);
    coverMode = resolveCoverModeAfterJump(coverMode, true);
    coverActivationPending = false;
    coverActivationPendingWall = null;
    coverWall = null;
    coverSnapTarget = null;
    verticalVelocity = jumpAction.launchSpeed;
    grounded = false;
    return true;
  };
  const onWindowBlur = (): void => {
    swipePointerId = null;
    pressedKeys.clear();
    touchMovementActive = false;
    touchForward = 0;
    touchRight = 0;
    verticalVelocity = 0;
    jumpOffset = 0;
    grounded = true;
    jumpKeyHeld = false;
    jumpPressQueued = false;
    forwardVelocity = 0;
    strafeVelocity = 0;
    movementControllerState = createPlayerMovementControllerState(movementControllerSeed);
    slideRequested = false;
    pendingTraversalFeedback = null;
    playerKnockbackVelocity.set(0, 0, 0);
    isSprinting = false;
    exerciseIntensity = 0;
    sprintingActivity = false;
    crouchWalkingActivity = false;
    walkingActivity = false;
    crouchedActivity = false;
    leftCommandHeld = false;
    rightMouseAiming = false;
    syncAimingFromInput();
    wallContact = null;
    wallProximity = null;
    coverActivationPendingWall = null;
    coverWall = null;
    coverSnapTarget = null;
    meleeRuntime?.setFireHeld(false);
    weaponRuntime?.setFireHeld(false);
    lastMovementTapAtByKey.clear();
    ledgeClimbTransition = null;
    clearWallTraversal();
    resetCameraMotion();
  };
  const setControlActive = (active: boolean): void => {
    container.dataset.controlActive = active ? "true" : "false";
  };
  const onControlsLock = (): void => {
    setControlActive(true);
    if (leftCommandHeld || rightMouseAiming) {
      syncAimingFromInput();
    }
  };
  const onControlsUnlock = (): void => {
    onWindowBlur();
    setControlActive(false);
  };
  const onCanvasClick = (): void => {
    if (!isTouchDevice && activeView === "seat" && !firstPersonControls.isLocked) {
      firstPersonControls.lock();
    }
  };
  const onCanvasMouseDown = (event: MouseEvent): void => {
    if (activeView !== "seat") {
      return;
    }
    if (playerVitals.isDead) {
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      rightMouseAiming = !rightMouseAiming;
      syncAimingFromInput();
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const activeMeleeRuntime = meleeRuntime;
    if (activeMeleeRuntime?.isActive()) {
      if (aimingDownSightsRequested || aimingDownSights) {
        activeMeleeRuntime.setFireHeld(false);
        throwMeleeObjectAndRearmGun();
      } else {
        activeMeleeRuntime.setFireHeld(true);
        triggerMeleeAttack();
      }
    } else {
      weaponRuntime?.setFireHeld(true);
      weaponRuntime?.fire(capturePreActionAimRay());
    }
  };
  const onWindowMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    meleeRuntime?.setFireHeld(false);
    weaponRuntime?.setFireHeld(false);
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("mouseup", onWindowMouseUp);
  renderer.domElement.addEventListener("click", onCanvasClick);
  renderer.domElement.addEventListener("mousedown", onCanvasMouseDown);
  renderer.domElement.addEventListener("pointerdown", onSwipePointerDown);
  renderer.domElement.addEventListener("pointermove", onSwipePointerMove);
  renderer.domElement.addEventListener("pointerup", onSwipePointerEnd);
  renderer.domElement.addEventListener("pointercancel", onSwipePointerEnd);
  firstPersonControls.addEventListener("lock", onControlsLock);
  firstPersonControls.addEventListener("unlock", onControlsUnlock);

  const setFirstPersonPreset = (): void => {
    const preset = activeSceneCameraPresets.seat;
    firstPersonGroundY = isCleanSlateMap ? WAREHOUSE_FLOOR_TOP_Y : 0;
    eyeHeight = STANDING_EYE_HEIGHT;
    isCrouched = false;
    isWalkingMode = false;
    jumpOffset = 0;
    verticalVelocity = 0;
    grounded = true;
    ledgeClimbTransition = null;
    clearWallTraversal();
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastMovementTapAtByKey.clear();
    resetCameraMotion();
    camera.position.set(preset.position.x, STANDING_EYE_HEIGHT, preset.position.z);
    const firstPersonTarget = preset.target.clone();
    firstPersonTarget.y += STANDING_EYE_HEIGHT - preset.position.y;
    camera.lookAt(firstPersonTarget);
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    syncPhysicsCharacterToCamera();
    resetMotionCalibration();
  };
  const setComposedTablePreset = (): void => {
    const preset = activeSceneCameraPresets.seat;
    firstPersonGroundY = 0;
    eyeHeight = TABLE_CAMERA_STANDING_EYE_HEIGHT;
    activeView = "seat";
    ledgeClimbTransition = null;
    clearWallTraversal();
    resetCameraMotion();
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    syncPhysicsCharacterToCamera();
    camera.fov = SEAT_STANDING_FOV;
    camera.updateProjectionMatrix();
    syncReticleZoomProjection();
    resetMotionCalibration();
  };
  const setFocusCalibrationVisibility = (): void => {
    if (focusCalibrationRoot !== null) {
      // The looking-focus room is a real ground-level play area. Debug mode
      // adds the calibrated spawn preset, but never hides the authored room.
      focusCalibrationRoot.visible = true;
    }
  };
  const setView = (view: SceneView): void => {
    leftCommandHeld = false;
    rightMouseAiming = false;
    syncAimingFromInput();
    if (view === "overhead" && !debugEnabled) {
      setComposedTablePreset();
      orbitControls.enabled = false;
      firstPersonControls.enabled = false;
      return;
    }
    activeView = view;
    activeDebugPreset = null;
    setFocusCalibrationVisibility();
    debugFovOverride = null;
    if (view === "seat") {
      orbitControls.enabled = false;
      firstPersonControls.enabled = true;
      if (debugEnabled) {
        setFirstPersonPreset();
      } else {
        setComposedTablePreset();
      }
      return;
    }
    if (firstPersonControls.isLocked) {
      firstPersonControls.unlock();
    }
    onWindowBlur();
    resetMotionCalibration();
    firstPersonControls.enabled = false;
    orbitControls.enabled = true;
    setCameraPreset(camera, orbitControls, view, activeSceneCameraPresets);
    camera.fov = TABLE_CAMERA_FOV;
    camera.updateProjectionMatrix();
    syncReticleZoomProjection();
  };

  const resetToSpawn = (): void => {
    resetVitalsState();
    impactDamageCooldown = 0;
    maximumFallSpeed = 0;
    setView("seat");
    onWindowBlur();
    firstPersonGroundY = 0;
    eyeHeight = STANDING_EYE_HEIGHT;
    isCrouched = false;
    isWalkingMode = false;
    jumpOffset = 0;
    verticalVelocity = 0;
    grounded = true;
    ledgeClimbTransition = null;
    clearWallTraversal();
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastMovementTapAtByKey.clear();

    const spawnPosition =
      isCleanSlateMap && debuggingTwoMap !== null
        ? debuggingTwoMap.spawn
        : resolveRandomSpawnPosition();
    const spawnSurfaceY =
      isCleanSlateMap && debuggingTwoMap !== null
        ? spawnPosition.y
        : spawnPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT;
    firstPersonGroundY = spawnSurfaceY;
    camera.position.set(spawnPosition.x, spawnSurfaceY + STANDING_EYE_HEIGHT, spawnPosition.z);
    camera.lookAt(0, camera.position.y, 0);
    debugFovOverride = null;
    camera.fov = debugEnabled ? DEBUG_STANDING_FOV : SEAT_STANDING_FOV;
    camera.updateProjectionMatrix();
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    resetMotionCalibration();
    syncPhysicsCharacterToCamera();
    saveSceneState(true);
  };

  recoverPlayerFromGeometry = (): boolean => {
    if (physicsRuntime === null) {
      resetToSpawn();
      return true;
    }
    const recoveryPhysicsBoxes = [
      ...staticPhysicsBoxes,
      ...dynamicPhysicsBoxes.filter((box) => box.dynamic !== true),
    ];
    const fallbackSpawn =
      isCleanSlateMap && debuggingTwoMap !== null
        ? {
            x: debuggingTwoMap.spawn.x,
            y: debuggingTwoMap.spawn.y + PLAYER_CAPSULE_CENTER_HEIGHT,
            z: debuggingTwoMap.spawn.z,
          }
        : resolveRandomSpawnPosition();
    const recoveryPosition = resolvePlayerRecoveryPosition(
      lastSafePhysicsPosition,
      fallbackSpawn,
      recoveryPhysicsBoxes,
    );
    if (recoveryPosition === null) {
      resetToSpawn();
      return true;
    }

    const settled = physicsRuntime.move(recoveryPosition, { x: 0, y: 0, z: 0 });
    physicsCharacterPosition = settled.position;
    lastSafePhysicsPosition = { ...settled.position };
    grounded = settled.grounded;
    verticalVelocity = 0;
    jumpOffset = Math.max(0, settled.position.y - PLAYER_CAPSULE_CENTER_HEIGHT);
    maximumFallSpeed = 0;
    forwardVelocity = 0;
    strafeVelocity = 0;
    playerKnockbackVelocity.set(0, 0, 0);
    pressedKeys.clear();
    touchMovementActive = false;
    touchForward = 0;
    touchRight = 0;
    jumpKeyHeld = false;
    jumpPressQueued = false;
    slideRequested = false;
    movementControllerState = createPlayerMovementControllerState(
      movementControllerSeed,
      settled.grounded,
    );
    pendingTraversalFeedback = null;
    ledgeClimbTransition = null;
    clearWallTraversal();
    touchingWall = false;
    wallContact = null;
    wallProximity = null;
    wallBracedAim = false;
    coverMode = false;
    coverActivationPending = false;
    coverActivationPendingWall = null;
    coverWall = null;
    coverSnapTarget = null;
    camera.position.set(
      settled.position.x,
      settled.position.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight,
      settled.position.z,
    );
    resetMotionCalibration();
    resetCameraMotion();
    saveSceneState(true);
    return true;
  };

  const resolveRandomSpawnPosition = (): PhysicsVector => {
    const minX = activeWorldBounds.minX + WORLD_SPAWN_MARGIN;
    const maxX = activeWorldBounds.maxX - WORLD_SPAWN_MARGIN;
    const minZ = activeWorldBounds.minZ + WORLD_SPAWN_MARGIN;
    const maxZ = activeWorldBounds.maxZ - WORLD_SPAWN_MARGIN;
    const spawnRangeX = maxX - minX;
    const spawnRangeZ = maxZ - minZ;
    const fallbackX = THREE.MathUtils.clamp(activeWorldBounds.minX + spawnRangeX / 2, minX, maxX);
    const fallbackZ = THREE.MathUtils.clamp(activeWorldBounds.minZ + spawnRangeZ / 2, minZ, maxZ);
    for (let attempt = 0; attempt < WORLD_SPAWN_ATTEMPTS; attempt += 1) {
      const sampleX =
        spawnRangeX > 0 ? minX + spawnRangeX * playerRespawnRandom.nextFloat() : fallbackX;
      const sampleZ =
        spawnRangeZ > 0 ? minZ + spawnRangeZ * playerRespawnRandom.nextFloat() : fallbackZ;
      if (physicsRuntime === null) {
        return { x: sampleX, y: PLAYER_COLLIDER_CENTER_HEIGHT, z: sampleZ };
      }
      const settled = physicsRuntime.move(
        { x: sampleX, y: WORLD_SPAWN_DROP_HEIGHT, z: sampleZ },
        { x: 0, y: -WORLD_SPAWN_DROP_DISTANCE, z: 0 },
      );
      if (
        Number.isFinite(settled.position.x) &&
        Number.isFinite(settled.position.y) &&
        Number.isFinite(settled.position.z) &&
        settled.grounded
      ) {
        return {
          x: THREE.MathUtils.clamp(settled.position.x, minX, maxX),
          y: settled.position.y,
          z: THREE.MathUtils.clamp(settled.position.z, minZ, maxZ),
        };
      }
    }
    return { x: fallbackX, y: PLAYER_COLLIDER_CENTER_HEIGHT, z: fallbackZ };
  };
  const resolveSimulantSpawnPosition = (): PhysicsVector => {
    const minX = activeWorldBounds.minX + WORLD_SPAWN_MARGIN;
    const maxX = activeWorldBounds.maxX - WORLD_SPAWN_MARGIN;
    const minZ = activeWorldBounds.minZ + WORLD_SPAWN_MARGIN;
    const maxZ = activeWorldBounds.maxZ - WORLD_SPAWN_MARGIN;
    const playerX = camera.position.x;
    const playerZ = camera.position.z;
    const spawnRadius = isCleanSlateMap
      ? Math.min(
          (activeWorldBounds.maxX - activeWorldBounds.minX) / 2 - WORLD_SPAWN_MARGIN,
          (activeWorldBounds.maxZ - activeWorldBounds.minZ) / 2 - WORLD_SPAWN_MARGIN,
        ) * 0.78
      : SIMULANT_SPAWN_RADIUS_METERS;
    const minimumStartDistance = isCleanSlateMap
      ? Math.min(
          SIMULANT_MIN_START_DISTANCE_METERS,
          Math.min(
            activeWorldBounds.maxX - activeWorldBounds.minX,
            activeWorldBounds.maxZ - activeWorldBounds.minZ,
          ) * 0.72,
        )
      : SIMULANT_MIN_START_DISTANCE_METERS;
    let bestDistance = Number.NEGATIVE_INFINITY;
    let bestX = minX;
    let bestZ = minZ;
    for (let attempt = 0; attempt < WORLD_SPAWN_ATTEMPTS; attempt += 1) {
      const angle = simulantRandom.nextFloat() * Math.PI * 2;
      const sampleX = Math.cos(angle) * spawnRadius;
      const sampleZ = Math.sin(angle) * spawnRadius;
      const candidateX = THREE.MathUtils.clamp(sampleX, minX, maxX);
      const candidateZ = THREE.MathUtils.clamp(sampleZ, minZ, maxZ);
      const distanceToPlayer =
        Number.isFinite(playerX) && Number.isFinite(playerZ)
          ? Math.hypot(candidateX - playerX, candidateZ - playerZ)
          : Number.POSITIVE_INFINITY;
      if (distanceToPlayer > bestDistance) {
        bestDistance = distanceToPlayer;
        bestX = candidateX;
        bestZ = candidateZ;
      }
      if (distanceToPlayer >= minimumStartDistance) {
        return { x: candidateX, y: PLAYER_COLLIDER_CENTER_HEIGHT, z: candidateZ };
      }
    }
    return { x: bestX, y: PLAYER_COLLIDER_CENTER_HEIGHT, z: bestZ };
  };
  const disposeSimulantWeaponModel = (): void => {
    if (simulantWeaponModel === null) {
      return;
    }
    simulantWeaponModel.removeFromParent();
    disposeObject(simulantWeaponModel);
    simulantWeaponModel = null;
  };
  const createSimulantWeaponModel = (source: SimulantWeaponSource): THREE.Group => {
    if (source.kind === "gun") {
      const model = createWeaponModel(source.weapon, 0.7, false);
      model.root.name = `SimulantWeapon:${source.weapon}`;
      model.root.userData = {
        ...model.root.userData,
        simulantWeapon: true,
        weaponRaycastIgnore: true,
      };
      model.root.position.set(
        SIMULANT_WEAPON_HAND_OFFSET.x,
        SIMULANT_WEAPON_HAND_OFFSET.y,
        SIMULANT_WEAPON_HAND_OFFSET.z,
      );
      return model.root;
    }

    const sourcePosition = new THREE.Vector3();
    const sourceQuaternion = new THREE.Quaternion();
    const sourceScale = new THREE.Vector3();
    source.sourceMatrix.decompose(sourcePosition, sourceQuaternion, sourceScale);
    const sourceMaterial = source.mesh.material;
    const materials = Array.isArray(sourceMaterial)
      ? sourceMaterial.map((entry) => entry.clone())
      : [sourceMaterial.clone()];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.vertexColors = false;
        material.color.setHex(source.color);
      }
    }
    const material = materials.length === 1 ? materials[0] : materials;
    const object = new THREE.Mesh(source.mesh.geometry.clone(), material);
    object.name = `SimulantWeapon:${String(source.objectId)}`;
    object.position.set(0, 0, 0);
    object.quaternion.copy(sourceQuaternion);
    object.scale.copy(sourceScale);
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData = {
      weaponVisual: true,
      weaponRaycastIgnore: true,
      simulantWeapon: true,
      meleeObjectId: source.objectId,
    };
    const root = new THREE.Group();
    root.name = `SimulantWeapon:${String(source.objectId)}`;
    root.userData = {
      weaponVisual: true,
      weaponRaycastIgnore: true,
      simulantWeapon: true,
    };
    root.position.set(
      SIMULANT_WEAPON_HAND_OFFSET.x,
      SIMULANT_WEAPON_HAND_OFFSET.y,
      SIMULANT_WEAPON_HAND_OFFSET.z,
    );
    root.add(object);
    return root;
  };
  const syncSimulantWeaponPresentation = (): void => {
    if (simulantWeaponModel === null || simulantWeapon === null) {
      return;
    }
    if (simulantRagdollState !== null || simulantBody === null) {
      simulantWeaponModel.visible = false;
      return;
    }
    const progress = simulantMeleeSwinging
      ? Math.min(
          1,
          simulantMeleeSwingElapsedSeconds / Math.max(0.001, simulantMeleeSwingDurationSeconds),
        )
      : 0;
    const pose = resolveMeleeSwingPose(progress, simulantMeleeSwingDirection);
    simulantWeaponModel.position.set(
      SIMULANT_WEAPON_HAND_OFFSET.x + pose.offsetX,
      SIMULANT_WEAPON_HAND_OFFSET.y + pose.offsetY,
      SIMULANT_WEAPON_HAND_OFFSET.z + pose.offsetZ,
    );
    simulantWeaponModel.rotation.set(pose.pitchRadians, pose.yawRadians, pose.rollRadians, "XYZ");
    simulantWeaponModel.visible = true;
  };
  const resolveSimulantWeaponTargetPosition = (
    target: SimulantWeaponTarget,
  ): THREE.Vector3 | null => {
    if (target.kind === "gun") {
      const spawn = weaponRuntime
        ?.getAvailablePickups()
        .find((candidate) => candidate.id === target.pickupId);
      if (spawn === undefined) {
        return null;
      }
      return new THREE.Vector3(spawn.position[0], spawn.position[1], spawn.position[2]);
    }
    const pickup = explorationWorld
      ?.getMeleePickups()
      .find((candidate) => candidate.objectId === target.objectId);
    if (pickup === undefined) {
      return null;
    }
    const matrix = new THREE.Matrix4();
    pickup.mesh.getMatrixAt(pickup.index, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  };
  const selectSimulantWeaponTarget = (): SimulantWeaponTarget | null => {
    let best: { readonly target: SimulantWeaponTarget; readonly distance: number } | null = null;
    for (const pickup of explorationWorld?.getMeleePickups() ?? []) {
      const matrix = new THREE.Matrix4();
      pickup.mesh.getMatrixAt(pickup.index, matrix);
      const position = new THREE.Vector3().setFromMatrixPosition(matrix);
      const distance = position.distanceTo(simulantPosition);
      if (best === null || distance < best.distance) {
        best = {
          target: { kind: "melee-prop", objectId: pickup.objectId },
          distance,
        };
      }
    }
    for (const spawn of weaponRuntime?.getAvailablePickups() ?? []) {
      const position = new THREE.Vector3(spawn.position[0], spawn.position[1], spawn.position[2]);
      const distance = position.distanceTo(simulantPosition);
      if (best === null || distance < best.distance) {
        best = {
          target: { kind: "gun", pickupId: spawn.id, weapon: spawn.weapon },
          distance,
        };
      }
    }
    return best?.target ?? null;
  };
  const acquireSimulantWeapon = (target: SimulantWeaponTarget): boolean => {
    if (target.kind === "gun") {
      const weapon = weaponRuntime?.claimPickupForBot(target.pickupId);
      if (weapon === null || weapon === undefined) {
        return false;
      }
      simulantWeapon = {
        kind: "gun",
        pickupId: target.pickupId,
        weapon,
        snapshot: resolveWeaponMeleeAttributes(weapon),
        color: WEAPON_DEFINITIONS[weapon].color,
      };
      disposeSimulantWeaponModel();
      simulantWeaponModel = createSimulantWeaponModel(simulantWeapon);
      simulantBody?.add(simulantWeaponModel);
      return true;
    }
    const world = explorationWorld;
    if (world === null) {
      return false;
    }
    const candidate = world.getMeleePickups().find((pickup) => pickup.objectId === target.objectId);
    if (candidate === undefined) {
      return false;
    }
    const sourceMatrix = new THREE.Matrix4();
    candidate.mesh.getMatrixAt(candidate.index, sourceMatrix);
    const equipped = world.equipMeleeObject(candidate.objectId);
    if (equipped === null) {
      return false;
    }
    simulantWeapon = {
      kind: "melee-prop",
      objectId: equipped.objectId,
      snapshot: equipped.snapshot,
      color: equipped.color,
      sourceMatrix,
      mesh: candidate.mesh,
    };
    disposeSimulantWeaponModel();
    simulantWeaponModel = createSimulantWeaponModel(simulantWeapon);
    simulantBody?.add(simulantWeaponModel);
    return true;
  };
  const releaseSimulantWeapon = (): void => {
    const source = simulantWeapon;
    if (source !== null) {
      if (source.kind === "melee-prop") {
        const dropDirection = new THREE.Vector3(
          camera.position.x - simulantPosition.x,
          0,
          camera.position.z - simulantPosition.z,
        );
        if (dropDirection.lengthSq() <= 0.0001) {
          dropDirection.set(0, 0, -1);
        } else {
          dropDirection.normalize();
        }
        explorationWorld?.dropMeleeObject(
          source.objectId,
          new THREE.Vector3(
            simulantPosition.x + dropDirection.x * 0.65,
            Math.max(0.2, simulantPosition.y),
            simulantPosition.z + dropDirection.z * 0.65,
          ),
          Math.atan2(dropDirection.x, dropDirection.z),
        );
      } else {
        weaponRuntime?.releasePickupFromBot(source.pickupId);
      }
    }
    disposeSimulantWeaponModel();
    simulantWeapon = null;
  };
  const resetSimulantWeaponHunt = (): void => {
    releaseSimulantWeapon();
    simulantWeaponTarget = null;
    simulantMeleeSwinging = false;
    simulantMeleeSwingElapsedSeconds = 0;
    simulantMeleeSwingDurationSeconds = 0;
    simulantMeleeHitResolved = false;
    simulantMeleeTarget = null;
    simulantMeleeCooldownSeconds = 0;
  };
  const syncSimulantShieldFlare = (): void => {
    if (simulantShieldFlareMaterial === null) {
      return;
    }
    updateShieldFlareMaterial(
      simulantShieldFlareMaterial,
      simulantVitals.shield,
      PLAYER_MAX_SHIELD,
      simulantShieldFlareRemainingSeconds,
      simulantShieldFlareElapsedSeconds,
    );
  };
  const syncSimulantMarkerVitals = (): void => {
    if (simulantMarker === null) {
      syncSimulantShieldFlare();
      return;
    }
    simulantMarker.userData.simulantHealth = simulantVitals.health;
    simulantMarker.userData.simulantShield = simulantVitals.shield;
    simulantMarker.userData.simulantO2 = simulantVitals.o2;
    simulantMarker.userData.simulantStoppingPower = Math.hypot(
      simulantKnockbackVelocity.x,
      simulantKnockbackVelocity.z,
    );
    simulantMarker.userData.simulantStaggerSeconds = simulantStaggerSeconds;
    simulantMarker.userData.simulantWeapon =
      simulantWeapon?.kind === "gun"
        ? simulantWeapon.weapon
        : simulantWeapon?.kind === "melee-prop"
          ? simulantWeapon.snapshot.displayName
          : null;
    simulantMarker.userData.simulantWeaponHuntTarget =
      simulantWeaponTarget?.kind === "gun"
        ? simulantWeaponTarget.pickupId
        : simulantWeaponTarget?.kind === "melee-prop"
          ? String(simulantWeaponTarget.objectId)
          : null;
    simulantMarker.userData.simulantMeleeSwinging = simulantMeleeSwinging;
    if (simulantShieldShell !== null) {
      // Once the shield is empty, let the ray continue to the body so the
      // actual head mesh can produce a headshot hit zone. The flare remains
      // visible for presentation, but it no longer blocks weapon rays.
      simulantShieldShell.userData.weaponRaycastIgnore =
        simulantVitals.isDead || simulantVitals.shield <= 0;
    }
    syncSimulantShieldFlare();
  };
  const syncSimulantPresentation = (motion: CameraMotionOffsets): void => {
    if (simulantRagdollState !== null || simulantBody === null) {
      syncSimulantWeaponPresentation();
      return;
    }
    const bodyBaseY =
      SIMULANT_BODY_SOURCE_FOOT_OFFSET_METERS *
      (SIMULANT_BODY_TARGET_HEIGHT_METERS / SIMULANT_BODY_SOURCE_HEIGHT_METERS);
    simulantBody.position.y = bodyBaseY + motion.verticalOffset;
    simulantBody.rotation.z = motion.roll;
    syncSimulantWeaponPresentation();
  };
  const respawnSimulant = (): void => {
    if (simulantMarker === null) {
      return;
    }
    resetSimulantWeaponHunt();
    simulantRagdollState = null;
    const position =
      isCleanSlateMap && debuggingTwoMap !== null
        ? debuggingTwoMap.simulantSpawn
        : resolveSimulantSpawnPosition();
    simulantPosition.set(position.x, position.y, position.z);
    simulantWorldVelocity = { x: 0, y: 0, z: 0 };
    simulantKnockbackVelocity.set(0, 0, 0);
    simulantStaggerSeconds = 0;
    simulantShieldFlareRemainingSeconds = 0;
    simulantShieldFlareElapsedSeconds = 0;
    simulantMarker.position.copy(simulantPosition);
    simulantMarker.rotation.set(0, 0, 0);
    simulantMarker.userData.weaponRaycastIgnore = false;
    simulantMarker.visible = true;
    if (simulantBody !== null && simulantBodyParts !== null) {
      resetRagdollBodyPose(simulantBody, simulantBodyParts);
    }
    if (simulantRing !== null) {
      simulantRing.visible = true;
    }
    if (simulantShieldShell !== null) {
      simulantShieldShell.visible = true;
    }
    simulantVitals = createPlayerVitals();
    simulantPerspectiveRig.reset();
    syncSimulantMarkerVitals();
  };
  const startSimulantRagdoll = (): void => {
    if (simulantMarker === null || simulantBody === null || simulantBodyParts === null) {
      return;
    }
    simulantRagdollState = startRagdoll(
      simulantPosition,
      simulantDeathImpulse,
      RAGDOLL_DURATION_SECONDS,
    );
    simulantRagdollFloorY = simulantPosition.y;
    simulantMarker.visible = true;
    simulantMarker.userData.weaponRaycastIgnore = true;
    if (simulantRing !== null) {
      simulantRing.visible = false;
    }
    if (simulantWeaponModel !== null) {
      simulantWeaponModel.visible = false;
    }
    if (simulantShieldShell !== null) {
      simulantShieldShell.visible = false;
    }
    applyRagdollBodyPose(simulantMarker, simulantBody, simulantBodyParts, simulantRagdollState);
  };
  const scheduleSimulantRespawn = (): void => {
    if (simulantRespawnTimer !== 0) {
      window.clearTimeout(simulantRespawnTimer);
    }
    if (simulantMarker === null) {
      return;
    }
    releaseSimulantWeapon();
    simulantWeaponTarget = null;
    simulantMeleeSwinging = false;
    startSimulantRagdoll();
    simulantWorldVelocity = { x: 0, y: 0, z: 0 };
    simulantKnockbackVelocity.set(0, 0, 0);
    simulantStaggerSeconds = 0;
    simulantRespawnTimer = window.setTimeout(() => {
      simulantRespawnTimer = 0;
      respawnSimulant();
    }, PLAYER_DEATH_RESPAWN_DELAY_MS);
  };
  const getCombatActorHitTarget = (
    hitObject: THREE.Object3D,
  ): { readonly actorId: CombatActorId; readonly object: THREE.Object3D } | null => {
    let current: THREE.Object3D | null = hitObject;
    while (current !== null) {
      const actorId: unknown = current.userData.combatActorId;
      if (typeof actorId === "string" && actorId.trim().length > 0) {
        return { actorId, object: current };
      }
      current = current.parent;
    }
    return null;
  };
  const getCombatHitZone = (hitObject: THREE.Object3D): CombatHitZone | undefined => {
    let current: THREE.Object3D | null = hitObject;
    while (current !== null) {
      const hitZone: unknown = current.userData.combatHitZone;
      if (hitZone === "head" || hitZone === "body") {
        return hitZone;
      }
      current = current.parent;
    }
    return undefined;
  };
  const applyDamageToHitObject = (
    hitObject: THREE.Object3D,
    damage: number,
    source: CombatDamageSource,
    attackerId: CombatActorId = LOCAL_PLAYER_COMBAT_ACTOR_ID,
    hitZone?: CombatHitZone,
  ): CombatDamageApplicationResult | null => {
    const target = getCombatActorHitTarget(hitObject);
    if (target === null) {
      return null;
    }
    return combatDamageRouter.apply({
      targetId: target.actorId,
      amount: damage,
      source,
      attackerId,
      ...(hitZone === undefined ? {} : { hitZone }),
    });
  };
  const applySimulantStoppingPower = (direction: PhysicsVector, stoppingPower: number): void => {
    const safeStoppingPower = Number.isFinite(stoppingPower) ? Math.max(0, stoppingPower) : 0;
    if (safeStoppingPower <= 0) {
      return;
    }
    const horizontalLength = Math.hypot(direction.x, direction.z);
    if (horizontalLength <= Number.EPSILON) {
      return;
    }
    simulantDeathImpulse = {
      direction: {
        x: direction.x / horizontalLength,
        y: 0,
        z: direction.z / horizontalLength,
      },
      force: safeStoppingPower,
    };
    simulantKnockbackVelocity.x += (direction.x / horizontalLength) * safeStoppingPower;
    simulantKnockbackVelocity.z += (direction.z / horizontalLength) * safeStoppingPower;
    simulantStaggerSeconds = Math.min(
      SIMULANT_MAX_STAGGER_SECONDS,
      Math.max(
        simulantStaggerSeconds,
        safeStoppingPower * SIMULANT_STAGGER_SECONDS_PER_STOPPING_POWER,
      ),
    );
    syncSimulantMarkerVitals();
  };

  const setDebugCameraPreset = (preset: VisualCameraPreset): void => {
    if (!debugEnabled) {
      return;
    }
    if (
      isCleanSlateMap &&
      (preset === "focusCalibration" ||
        preset === "climbingGym" ||
        preset === "parametricBarracks" ||
        preset === "targetRange")
    ) {
      activeDebugPreset = null;
      setView("seat");
      return;
    }
    const presetArea: VisualSceneAreaId | null = isCleanSlateMap
      ? null
      : preset === "focusCalibration"
        ? "focusCalibration"
        : preset === "climbingGym"
          ? "climbingGym"
          : preset === "parametricBarracks"
            ? "parametricBarracks"
            : preset === "targetRange"
              ? "targetRange"
              : "penthouse";
    if (presetArea !== null && !isAreaEnabled(presetArea)) {
      activeDebugPreset = null;
      setView("seat");
      return;
    }
    activeDebugPreset = preset;
    setFocusCalibrationVisibility();

    if (preset === "focusCalibration") {
      // Focus calibration is a walkable wing of the development map. Keep the
      // normal first-person controller active instead of replacing the player
      // with an orbit camera around a detached hallway.
      activeView = "seat";
      orbitControls.enabled = false;
      firstPersonControls.enabled = true;
      if (firstPersonControls.isLocked) {
        firstPersonControls.unlock();
      }
      onWindowBlur();
      firstPersonGroundY = FOCUS_CALIBRATION_DECK_HEIGHT;
      eyeHeight = STANDING_EYE_HEIGHT;
      isCrouched = false;
      isWalkingMode = false;
      jumpOffset = 0;
      verticalVelocity = 0;
      grounded = true;
      ledgeClimbTransition = null;
      clearWallTraversal();
      forwardVelocity = 0;
      strafeVelocity = 0;
      isSprinting = false;
      lastMovementTapAtByKey.clear();
      resetCameraMotion();
      physicsCharacterPosition = null;
      camera.position.set(
        FOCUS_CALIBRATION_START_X + 0.55,
        FOCUS_CALIBRATION_DECK_HEIGHT + STANDING_EYE_HEIGHT,
        0,
      );
      camera.lookAt(
        FOCUS_CALIBRATION_START_X + 7,
        FOCUS_CALIBRATION_DECK_HEIGHT + STANDING_EYE_HEIGHT,
        0,
      );
      debugFovOverride = DEBUG_STANDING_FOV;
      camera.fov = debugFovOverride;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      syncPhysicsCharacterToCamera();
      resetMotionCalibration();
      persistDebugPreferences();
      return;
    }
    if (preset === "climbingGym") {
      // The climbing section is an active parkour test target and remains in
      // seat mode so movement and edge logic continue to run.
      activeView = "seat";
      orbitControls.enabled = false;
      firstPersonControls.enabled = true;
      if (firstPersonControls.isLocked) {
        firstPersonControls.unlock();
      }
      onWindowBlur();
      firstPersonGroundY = CLIMBING_GYM_RUN_Y;
      eyeHeight = CLIMBING_GYM_STANDING_EYE_HEIGHT;
      isCrouched = false;
      isWalkingMode = false;
      jumpOffset = 0;
      verticalVelocity = 0;
      grounded = true;
      ledgeClimbTransition = null;
      clearWallTraversal();
      forwardVelocity = 0;
      strafeVelocity = 0;
      isSprinting = false;
      lastMovementTapAtByKey.clear();
      resetCameraMotion();
      physicsCharacterPosition = null;
      camera.position.set(
        CLIMBING_GYM_PRESET_START_X + 0.55,
        CLIMBING_GYM_RUN_Y + CLIMBING_GYM_STANDING_EYE_HEIGHT,
        CLIMBING_GYM_PRESET_START_Z,
      );
      camera.lookAt(
        CLIMBING_GYM_PRESET_TARGET_X,
        CLIMBING_GYM_RUN_Y + CLIMBING_GYM_STANDING_EYE_HEIGHT,
        CLIMBING_GYM_PRESET_TARGET_Z,
      );
      debugFovOverride = DEBUG_STANDING_FOV;
      camera.fov = debugFovOverride;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      syncPhysicsCharacterToCamera();
      resetMotionCalibration();
      persistDebugPreferences();
      return;
    }
    if (preset === "parametricBarracks" || preset === "targetRange") {
      // The weapon test campus stays in the normal first-person controller so
      // testers can walk the rack, collect a profile, and fire downrange.
      activeView = "seat";
      orbitControls.enabled = false;
      firstPersonControls.enabled = true;
      if (firstPersonControls.isLocked) {
        firstPersonControls.unlock();
      }
      onWindowBlur();
      firstPersonGroundY = 0;
      eyeHeight = STANDING_EYE_HEIGHT;
      isCrouched = false;
      isWalkingMode = false;
      jumpOffset = 0;
      verticalVelocity = 0;
      grounded = true;
      ledgeClimbTransition = null;
      clearWallTraversal();
      forwardVelocity = 0;
      strafeVelocity = 0;
      isSprinting = false;
      lastMovementTapAtByKey.clear();
      resetCameraMotion();
      physicsCharacterPosition = null;
      const cameraPreset = activeVisualCameraPresets[preset];
      camera.position.copy(cameraPreset.position);
      camera.lookAt(cameraPreset.target);
      debugFovOverride = DEBUG_STANDING_FOV;
      camera.fov = debugFovOverride;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      syncPhysicsCharacterToCamera();
      resetMotionCalibration();
      persistDebugPreferences();
      return;
    }

    activeView = "overhead";
    firstPersonControls.enabled = false;
    if (firstPersonControls.isLocked) {
      firstPersonControls.unlock();
    }
    onWindowBlur();
    physicsCharacterPosition = null;
    orbitControls.enabled = true;
    const cameraPreset = activeVisualCameraPresets[preset];
    camera.position.copy(cameraPreset.position);
    orbitControls.target.copy(cameraPreset.target);
    orbitControls.update();
    debugFovOverride = camera.fov;
    resetMotionCalibration();
    persistDebugPreferences();
  };

  const restoreSceneState = (state: VisualSceneState | null): void => {
    if (state === null || (state.view === "seat" && initialView !== "seat")) {
      return;
    }
    if (state.activeDebugPreset === "focusCalibration") {
      if (!debugEnabled) {
        return;
      }
      setDebugCameraPreset("focusCalibration");
      firstPersonGroundY = FOCUS_CALIBRATION_DECK_HEIGHT;
      isCrouched = state.isCrouched;
      isWalkingMode = isCrouched;
      ledgeClimbTransition = null;
      eyeHeight = isCrouched ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
      camera.position.fromArray(state.cameraPosition);
      camera.position.y = FOCUS_CALIBRATION_DECK_HEIGHT + eyeHeight;
      camera.quaternion.fromArray(state.cameraQuaternion).normalize();
      camera.fov = THREE.MathUtils.clamp(state.cameraFov, 30, 100);
      debugFovOverride = camera.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      syncPhysicsCharacterToCamera();
      return;
    }
    if (state.activeDebugPreset === "climbingGym") {
      if (!debugEnabled) {
        return;
      }
      setDebugCameraPreset("climbingGym");
      firstPersonGroundY = CLIMBING_GYM_RUN_Y;
      isCrouched = state.isCrouched;
      isWalkingMode = isCrouched;
      ledgeClimbTransition = null;
      eyeHeight = isCrouched ? SEATED_EYE_HEIGHT : CLIMBING_GYM_STANDING_EYE_HEIGHT;
      camera.position.fromArray(state.cameraPosition);
      camera.position.y = CLIMBING_GYM_RUN_Y + eyeHeight;
      camera.quaternion.fromArray(state.cameraQuaternion).normalize();
      camera.fov = THREE.MathUtils.clamp(state.cameraFov, 30, 100);
      debugFovOverride = camera.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      syncPhysicsCharacterToCamera();
      return;
    }
    if (
      state.activeDebugPreset === "parametricBarracks" ||
      state.activeDebugPreset === "targetRange"
    ) {
      if (!debugEnabled) {
        return;
      }
      setDebugCameraPreset(state.activeDebugPreset);
      firstPersonGroundY = 0;
      isCrouched = state.isCrouched;
      isWalkingMode = isCrouched;
      ledgeClimbTransition = null;
      eyeHeight = isCrouched ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
      camera.position.fromArray(state.cameraPosition);
      camera.position.y = eyeHeight;
      camera.quaternion.fromArray(state.cameraQuaternion).normalize();
      camera.fov = THREE.MathUtils.clamp(state.cameraFov, 30, 100);
      debugFovOverride = camera.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      syncPhysicsCharacterToCamera();
      return;
    }
    if (state.view === "overhead") {
      if (!debugEnabled) {
        return;
      }
      if (state.activeDebugPreset === null) {
        setView("overhead");
      } else {
        setDebugCameraPreset(state.activeDebugPreset);
      }
      camera.position.fromArray(state.cameraPosition);
      orbitControls.target.fromArray(state.orbitTarget);
      orbitControls.update();
      camera.quaternion.fromArray(state.cameraQuaternion).normalize();
      camera.fov = THREE.MathUtils.clamp(state.cameraFov, 30, 100);
      debugFovOverride = camera.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrix();
      return;
    }

    setView("seat");
    onWindowBlur();
    ledgeClimbTransition = null;
    firstPersonGroundY = isCleanSlateMap ? WAREHOUSE_FLOOR_TOP_Y : 0;
    isCrouched = state.isCrouched;
    isWalkingMode = isCrouched;
    eyeHeight = !debugEnabled
      ? isCleanSlateMap
        ? cleanSlateSeatPreset.position.y
        : TABLE_CAMERA_STANDING_EYE_HEIGHT
      : isCrouched
        ? SEATED_EYE_HEIGHT
        : STANDING_EYE_HEIGHT;
    camera.position.x = THREE.MathUtils.clamp(
      state.cameraPosition[0],
      activeWorldBounds.minX,
      activeWorldBounds.maxX,
    );
    camera.position.y = eyeHeight;
    camera.position.z = THREE.MathUtils.clamp(
      state.cameraPosition[2],
      activeWorldBounds.minZ,
      activeWorldBounds.maxZ,
    );
    camera.quaternion.fromArray(state.cameraQuaternion).normalize();
    camera.fov = debugEnabled ? THREE.MathUtils.clamp(state.cameraFov, 30, 100) : SEAT_STANDING_FOV;
    debugFovOverride = debugEnabled ? camera.fov : null;
    camera.updateProjectionMatrix();
    camera.updateMatrix();
    resetMotionCalibration();
    if (physicsRuntime !== null) {
      syncPhysicsCharacterToCamera();
    }
  };

  const setDebugFov = (fov: number): void => {
    debugFovOverride = THREE.MathUtils.clamp(fov, 30, 100);
    camera.fov = debugFovOverride;
    camera.updateProjectionMatrix();
    persistDebugPreferences();
  };

  const setDebugExposure = (exposure: number): void => {
    debugAutoExposureEnabled = false;
    debugExposureTarget = THREE.MathUtils.clamp(exposure, 0.5, 2.2);
    renderer.toneMappingExposure = debugExposureTarget;
    persistDebugPreferences();
  };

  const setDebugAutoExposureEnabled = (enabled: boolean): void => {
    debugAutoExposureEnabled = enabled;
    if (enabled) {
      debugExposureTarget = renderer.toneMappingExposure;
    }
    persistDebugPreferences();
  };

  const setDebugToneMapper = (toneMapper: VisualToneMapper): void => {
    renderer.toneMapping = TONE_MAPPINGS[toneMapper];
    persistDebugPreferences();
  };

  const setDebugFogDensity = (_density: number): void => {
    void _density;
    debugFogDensity = 0;
    // Fog is intentionally not a general debug effect. The warehouse owns a
    // fixed dark-room haze; the authored penthouse remains clear.
    scene.fog = isCleanSlateMap ? createWarehouseFog() : null;
    persistDebugPreferences();
  };

  const setDebugSunDirection = (yaw: number, elevation: number): void => {
    debugSunYaw = THREE.MathUtils.clamp(yaw, -Math.PI, Math.PI);
    debugSunElevation = THREE.MathUtils.clamp(elevation, 0.25, 1.45);
    const light = getSunLight();
    if (light !== null) {
      const horizontal = Math.cos(debugSunElevation) * SKY_SUN_DISTANCE;
      light.position.set(
        Math.cos(debugSunYaw) * horizontal,
        Math.sin(debugSunElevation) * SKY_SUN_DISTANCE,
        Math.sin(debugSunYaw) * horizontal,
      );
      light.lookAt(0, 0.8, 0);
    }
    updateSkySunReference();
    persistDebugPreferences();
  };

  const setDebugSunIntensity = (intensity: number): void => {
    debugSunIntensity = THREE.MathUtils.clamp(intensity, 0, 6);
    const light = getSunLight();
    if (light !== null) {
      light.intensity = debugSunIntensity;
    }
    updateSkySunReference();
    persistDebugPreferences();
  };

  const setDebugEnvironmentIntensity = (intensity: number): void => {
    debugEnvironmentIntensity = THREE.MathUtils.clamp(intensity, 0, 2.5);
    scene.environmentIntensity = debugEnvironmentIntensity;
    persistDebugPreferences();
  };

  const setDebugEnvironmentRotation = (rotation: number): void => {
    debugEnvironmentRotation = THREE.MathUtils.clamp(rotation, -Math.PI, Math.PI);
    scene.environmentRotation.y = debugEnvironmentRotation;
    persistDebugPreferences();
  };

  const setDebugRedAccentIntensity = (intensity: number): void => {
    debugRedAccentIntensity = THREE.MathUtils.clamp(intensity, 0, 2.5);
    for (const material of redMaterials) {
      material.emissiveIntensity =
        (redMaterialBaseIntensity.get(material) ?? 0.12) * debugRedAccentIntensity;
    }
    persistDebugPreferences();
  };

  const setDebugCyanEmissiveIntensity = (intensity: number): void => {
    debugCyanEmissiveIntensity = THREE.MathUtils.clamp(intensity, 0, 2.5);
    for (const material of cyanMaterials) {
      material.emissiveIntensity =
        (cyanMaterialBaseIntensity.get(material) ?? 0.28) * debugCyanEmissiveIntensity;
    }
    persistDebugPreferences();
  };

  const setDebugBokehEnabled = (enabled: boolean): void => {
    debugBokehEnabled = enabled;
    bokehPass.enabled = enabled;
    persistDebugPreferences();
  };

  const setDebugBokehIntensity = (intensity: number): void => {
    debugBokehStrength = THREE.MathUtils.clamp(intensity, 0, DEBUG_BOKEH_STRENGTH_MAX);
    persistDebugPreferences();
  };

  const setDebugAmbientOcclusionEnabled = (enabled: boolean): void => {
    debugAmbientOcclusionEnabled = enabled;
    gtaoPass.enabled = enabled;
    persistDebugPreferences();
  };

  const setDebugAmbientAnimationRate = (rate: number): void => {
    debugAmbientAnimationRate = THREE.MathUtils.clamp(rate, 0, 2);
    persistDebugPreferences();
  };

  const setDebugCameraShiftEnabled = (enabled: boolean): void => {
    debugCameraShiftEnabled = enabled;
    if (!enabled) {
      cameraMotion.clearAcceleration();
    }
    persistDebugPreferences();
  };

  const setDebugCameraBobEnabled = (enabled: boolean): void => {
    debugCameraBobEnabled = enabled;
    if (!enabled) {
      cameraMotion.clearBob();
    }
    persistDebugPreferences();
  };

  const setDebugGlassMode = (mode: VisualGlassMode): void => {
    debugGlassMode = mode;
    const material = mode === "physical" ? physicalGlassMaterial : simpleGlassMaterial;
    if (material === null) {
      persistDebugPreferences();
      return;
    }
    for (const surface of glassSurfaces) {
      surface.material = material;
    }
    persistDebugPreferences();
  };

  const setDebugShadowQuality = (shadowQuality: VisualShadowQuality): void => {
    debugShadowQuality = shadowQuality;
    const size = shadowQuality === "high" ? 2048 : shadowQuality === "medium" ? 1024 : 0;
    renderer.shadowMap.enabled = size > 0;
    const light = getSunLight();
    if (light !== null) {
      light.castShadow = size > 0;
      if (size > 0) {
        light.shadow.mapSize.set(size, size);
      }
    }
    renderer.shadowMap.needsUpdate = true;
    persistDebugPreferences();
  };

  const setDebugDprCap = (dprCap: number): void => {
    debugDprCap = THREE.MathUtils.clamp(dprCap, 1, 2);
    const pixelRatio = Math.min(window.devicePixelRatio, debugDprCap);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    const width = Math.max(renderer.domElement.clientWidth, 1);
    const height = Math.max(renderer.domElement.clientHeight, 1);
    composer.setSize(width, height);
    refreshReticlePresentation();
    syncReticleZoomProjection();
    setO2BlurPassSize(o2BlurPass, width * pixelRatio, height * pixelRatio);
    syncDamageVignettePassSizes(width * pixelRatio, height * pixelRatio);
    gtaoPass.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
    persistDebugPreferences();
  };

  const setDebugQualityMode = (mode: VisualQualityMode): void => {
    debugQualityMode = mode;
    const preset = mode === "adaptive" ? quality.preset : mode;
    const profile = QUALITY_PRESETS[preset];
    debugEffectiveQuality = preset;
    setDebugDprCap(profile.dprCap);
    setDebugShadowQuality(profile.shadows);
    setDebugAmbientOcclusionEnabled(mode === "adaptive" ? false : profile.ambientOcclusion);
    setDebugBokehEnabled(preset === "high");
    setDebugAmbientAnimationRate(profile.ambientAnimationRate);
    setDebugGlassMode(profile.glassMode);
    container.dataset.sceneQuality = preset;
    persistDebugPreferences();
  };

  const setMaterialWireframe = (material: THREE.Material, enabled: boolean): void => {
    const candidate = material as THREE.Material & { wireframe?: boolean };
    if (candidate.wireframe !== undefined) {
      candidate.wireframe = enabled;
    }
  };

  const setDebugWireframe = (enabled: boolean): void => {
    debugWireframe = enabled;
    scene.traverse((object) => {
      if (!("material" in object)) {
        return;
      }
      const material = (
        object as THREE.Object3D & {
          readonly material: THREE.Material | readonly THREE.Material[];
        }
      ).material;
      const materials: readonly THREE.Material[] =
        material instanceof THREE.Material ? [material] : material;
      for (const entry of materials) {
        setMaterialWireframe(entry, enabled);
      }
    });
    persistDebugPreferences();
  };

  const setDebugBoundsVisible = (visible: boolean): void => {
    debugBoundsVisible = visible;
    const boundsRoot = getDebugBoundsRoot();
    if (boundsRoot !== null) {
      boundsRoot.visible = visible;
    }
    persistDebugPreferences();
  };

  const setDebugAreaEnabled = (area: VisualSceneAreaId, enabled: boolean): void => {
    if (isCleanSlateMap || !debugEnabled || enabledAreas[area] === enabled) {
      return;
    }
    enabledAreas[area] = enabled;
    persistDebugPreferences();
    // The React wrapper remounts the scene from this callback. The current
    // mount reports the new value first so the debug-state write contains the
    // same area selection that the replacement scene will construct.
    options.onVisualAreaChange?.(area, enabled);
  };

  const defaultDebugPreferences = (): VisualDebugPreferences => ({
    version: VISUAL_DEBUG_PREFERENCES_VERSION,
    cameraPreset: null,
    fov: DEBUG_STANDING_FOV,
    exposure: 1.02,
    toneMapper: "agx",
    fogDensity: 0,
    sunYaw: -0.59,
    sunElevation: 0.86,
    sunIntensity: 2.2,
    environmentIntensity: 0.82,
    environmentRotation: 0,
    redAccentIntensity: 1.1,
    cyanEmissiveIntensity: 1.05,
    shadowQuality: quality.shadows,
    qualityMode:
      options.quality === undefined || options.quality === "auto" ? "adaptive" : options.quality,
    glassMode: quality.glassMode,
    ambientAnimationRate: quality.ambientAnimationRate,
    dprCap: quality.dprCap,
    wireframe: false,
    boundsVisible: false,
    bokehEnabled: quality.preset === "high",
    bokehStrength: STANDING_DOF_INTENSITY,
    ambientOcclusionEnabled: false,
    autoExposureEnabled: true,
    cameraShiftEnabled: true,
    cameraBobEnabled: true,
  });

  const applyDebugPreferences = (preferences: VisualDebugPreferences): void => {
    if (preferences.cameraPreset !== null) {
      setDebugCameraPreset(preferences.cameraPreset);
    } else if (activeDebugPreset !== null) {
      setView("seat");
    }
    setDebugQualityMode(preferences.qualityMode);
    setDebugToneMapper(preferences.toneMapper);
    setDebugFogDensity(preferences.fogDensity);
    setDebugSunDirection(preferences.sunYaw, preferences.sunElevation);
    setDebugSunIntensity(preferences.sunIntensity);
    setDebugEnvironmentIntensity(preferences.environmentIntensity);
    setDebugEnvironmentRotation(preferences.environmentRotation);
    setDebugRedAccentIntensity(preferences.redAccentIntensity);
    setDebugCyanEmissiveIntensity(preferences.cyanEmissiveIntensity);
    setDebugShadowQuality(preferences.shadowQuality);
    setDebugDprCap(preferences.dprCap);
    setDebugBokehEnabled(preferences.bokehEnabled);
    setDebugBokehIntensity(preferences.bokehStrength);
    setDebugAmbientOcclusionEnabled(preferences.ambientOcclusionEnabled);
    setDebugAutoExposureEnabled(preferences.autoExposureEnabled);
    debugExposureTarget = preferences.exposure;
    renderer.toneMappingExposure = preferences.exposure;
    setDebugGlassMode(preferences.glassMode);
    setDebugAmbientAnimationRate(preferences.ambientAnimationRate);
    setDebugCameraShiftEnabled(preferences.cameraShiftEnabled);
    setDebugCameraBobEnabled(preferences.cameraBobEnabled);
    setDebugWireframe(preferences.wireframe);
    setDebugBoundsVisible(preferences.boundsVisible);
    setDebugFov(preferences.fov);
  };

  const resetDebugPreferences = (): void => {
    suppressDebugPreferencesPersistence = true;
    try {
      applyDebugPreferences(defaultDebugPreferences());
    } finally {
      suppressDebugPreferencesPersistence = false;
    }
    for (const area of VISUAL_SCENE_AREA_IDS) {
      setDebugAreaEnabled(area, true);
    }
    lastDofZoomed = null;
    saveDebugPreferences();
  };

  const getDebugSnapshot = (): SceneDebugSnapshot => ({
    roomSeed,
    roomVariant: generatedRoomVariant,
    explorationArea,
    loadedExplorationChunks,
    enabledAreas: { ...enabledAreas },
    qualityMode: debugQualityMode,
    cameraPreset: activeDebugPreset,
    fov: camera.fov,
    exposure: renderer.toneMappingExposure,
    toneMapper: toneMapperName(renderer.toneMapping),
    fogDensity: debugFogDensity,
    sunYaw: debugSunYaw,
    sunElevation: debugSunElevation,
    sunIntensity: debugSunIntensity,
    environmentIntensity: debugEnvironmentIntensity,
    environmentRotation: debugEnvironmentRotation,
    redAccentIntensity: debugRedAccentIntensity,
    cyanEmissiveIntensity: debugCyanEmissiveIntensity,
    shadowQuality: debugShadowQuality,
    quality: debugEffectiveQuality,
    glassMode: debugGlassMode,
    ambientAnimationRate: debugAmbientAnimationRate,
    dpr: renderer.getPixelRatio(),
    dprCap: debugDprCap,
    wireframe: debugWireframe,
    boundsVisible: debugBoundsVisible,
    bokehEnabled: debugBokehEnabled,
    focusDistance,
    focusTarget,
    pupilDiameterMm,
    bokehIntensity,
    bokehStrength: debugBokehStrength,
    ambientOcclusionEnabled: debugAmbientOcclusionEnabled,
    autoExposureEnabled: debugAutoExposureEnabled,
    cameraShiftEnabled: debugCameraShiftEnabled,
    cameraBobEnabled: debugCameraBobEnabled,
    fps: debugFps,
    frameTimeMs: debugFrameTimeMs,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    points: renderer.info.render.points,
    lines: renderer.info.render.lines,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  });
  setView(initialView);

  const architectureResources = isCleanSlateMap
    ? createCleanSlateArchitectureResources()
    : addFloor(scene, quality);
  glassSurfaces = architectureResources.glassSurfaces;
  simpleGlassMaterial = architectureResources.simpleGlassMaterial;
  physicalGlassMaterial = architectureResources.physicalGlassMaterial;
  const penthouseEnabled = isAreaEnabled("penthouse");
  const climbingGymEnabled = isAreaEnabled("climbingGym");
  const focusCalibrationEnabled = isAreaEnabled("focusCalibration");
  const parametricBarracksEnabled = isAreaEnabled("parametricBarracks");
  const targetRangeEnabled = isAreaEnabled("targetRange");

  const environmentRoot = scene.getObjectByName("EnvironmentRoot") ?? null;
  if (isCleanSlateMap) {
    // No penthouse, focus room, gym, barracks, target range, gateway, or city
    // exploration chunks are constructed for Debugging 02. Its isolated
    // warehouse world only contributes the deterministic melee props.
    if (environmentRoot !== null) {
      environmentRoot.removeFromParent();
      disposeObject(environmentRoot);
    }
    glassSurfaces = [];
    debuggingTwoMap = createDebuggingTwoMap(scene, roomSeed);
    generatedRoomVariant = debuggingTwoMap.variant;
    explorationArea = debuggingTwoMap.explorationArea;
    explorationWorld = createExplorationWorld(
      scene,
      roomSeed,
      undefined,
      (area) => {
        explorationArea = area;
        options.onExplorationAreaChange?.(area);
      },
      debuggingTwoMap,
    );
    loadedExplorationChunks = explorationWorld.getLoadedChunkCount();
  } else {
    // `addArchitecture` owns the shared surface textures as well as the
    // penthouse meshes. Detach the optional gym first so it can remain loaded
    // when the penthouse is disabled, then release the unused authored shell.
    const climbingGymObject = scene.getObjectByName("ClimbingGym") ?? null;
    if (climbingGymObject !== null && climbingGymEnabled && !penthouseEnabled) {
      scene.add(climbingGymObject);
    }
    if (!climbingGymEnabled && climbingGymObject !== null) {
      climbingGymObject.removeFromParent();
      disposeObject(climbingGymObject);
    }
    if (!penthouseEnabled && environmentRoot !== null) {
      environmentRoot.removeFromParent();
      disposeObject(environmentRoot);
    }

    if (penthouseEnabled && authoredRoomMap !== null) {
      const generatedRoom = createGeneratedRoom(
        scene,
        roomSeed,
        authoredRoomMap,
        architectureResources.surfaceTextures,
      );
      generatedRoomVariant = generatedRoom.variant;
    }
    if (focusCalibrationEnabled) {
      const focusCalibration = createFocusCalibrationHallway(
        scene,
        architectureResources.surfaceTextures,
      );
      focusCalibrationRoot = focusCalibration.root;
      focusCalibrationLabels = focusCalibration.labels;
    }
    const parametricCampus = createParametricGunCampus(
      scene,
      architectureResources.surfaceTextures,
    );
    parametricCampusLabels = parametricCampus.labels;
    if (!parametricBarracksEnabled) {
      const barracksRoot = scene.getObjectByName("ParametricGunBarracksRoot") ?? null;
      if (barracksRoot !== null) {
        barracksRoot.removeFromParent();
        disposeObject(barracksRoot);
      }
    }
    if (!targetRangeEnabled) {
      const targetRangeRoot = scene.getObjectByName("ParametricTargetRangeRoot") ?? null;
      if (targetRangeRoot !== null) {
        targetRangeRoot.removeFromParent();
        disposeObject(targetRangeRoot);
      }
    }
    // Keep the penthouse clean and uncluttered; intentionally suppress the framed
    // gateway marker that is useful for debug layouting but reads as a door frame.
    if (shouldIncludeExplorationGateway()) {
      addExplorationGateway(scene);
    }
    explorationWorld = createExplorationWorld(
      scene,
      roomSeed,
      architectureResources.surfaceTextures,
      (area) => {
        explorationArea = area;
        options.onExplorationAreaChange?.(area);
      },
    );
    loadedExplorationChunks = explorationWorld.getLoadedChunkCount();
    addLighting(scene);
  }
  simulantMarker = new THREE.Group();
  simulantMarker.name = "SimulantSpawnMarker";
  simulantMarker.userData = {
    combatActorId: SIMULANT_COMBAT_ACTOR_ID,
    combatActorKind: "bot",
    simulantCombatMarker: true,
    simulantHealth: simulantVitals.health,
    simulantShield: simulantVitals.shield,
    simulantO2: simulantVitals.o2,
    simulantStoppingPower: 0,
    simulantStaggerSeconds: 0,
    simulantWeapon: null,
    simulantWeaponHuntTarget: null,
    simulantMeleeSwinging: false,
  };
  simulantBody = createSimulantBody(new THREE.Color(COLORS.red));
  simulantBody.name = "SimulantCombatBody";
  simulantBodyParts = resolveRagdollBodyParts(simulantBody);
  simulantShieldFlareMaterial = createShieldFlareMaterial();
  simulantShieldShell = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.42, 8, 16),
    simulantShieldFlareMaterial,
  );
  simulantShieldShell.name = "SimulantShieldFlare";
  simulantShieldShell.position.y = 0.48;
  simulantShieldShell.userData = { shieldFlare: true, weaponRaycastIgnore: false };
  simulantShieldShell.renderOrder = 20;
  simulantBody.add(simulantShieldShell);
  simulantMarker.add(simulantBody);
  simulantRing = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.27, 18),
    new THREE.MeshBasicMaterial({
      color: COLORS.red,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  simulantRing.name = "SimulantCombatRing";
  simulantRing.rotation.x = -Math.PI / 2;
  simulantRing.position.y = 0.02;
  simulantMarker.add(simulantRing);
  scene.add(simulantMarker);

  playerRagdollMarker = new THREE.Group();
  playerRagdollMarker.name = "PlayerDeathRagdollMarker";
  playerRagdollMarker.userData = {
    playerDeathRagdoll: true,
    weaponRaycastIgnore: true,
  };
  playerRagdollBody = createSimulantBody(new THREE.Color(COLORS.cyan), "PlayerDeathRagdollBody");
  playerRagdollBodyParts = resolveRagdollBodyParts(playerRagdollBody);
  playerRagdollMarker.add(playerRagdollBody);
  playerRagdollMarker.visible = false;
  scene.add(playerRagdollMarker);
  respawnSimulant();
  scene.environmentIntensity = debugEnvironmentIntensity;
  const table = penthouseEnabled
    ? createTable(architectureResources.surfaceTextures)
    : (() => {
        const emptyTable = new THREE.Group();
        emptyTable.name = "TableRoot";
        return emptyTable;
      })();
  if (penthouseEnabled) {
    scene.add(table);
  }
  const textureCache = penthouseEnabled
    ? createTextureCache(architectureResources.surfaceTextures.detail)
    : null;
  const wallRoot =
    penthouseEnabled && textureCache !== null
      ? createWall(textureCache)
      : (() => {
          const emptyWall = new THREE.Group();
          emptyWall.name = "WallRoot";
          return emptyWall;
        })();
  if (penthouseEnabled) {
    scene.add(wallRoot);
  }
  const anchors = createPresentationAnchors(scene, table, wallRoot);
  if (penthouseEnabled && textureCache !== null) {
    addHand(
      scene,
      textureCache,
      architectureResources.surfaceTextures,
      new THREE.Vector3(0, 0, 1.5),
      0,
      true,
      PLAYER_HAND,
    );
    addHand(
      scene,
      textureCache,
      architectureResources.surfaceTextures,
      new THREE.Vector3(0, 0, -1.5),
      Math.PI,
      false,
      PLAYER_HAND,
    );
    addHand(
      scene,
      textureCache,
      architectureResources.surfaceTextures,
      new THREE.Vector3(1.5, 0, 0),
      -Math.PI / 2,
      false,
      PLAYER_HAND,
    );
    addHand(
      scene,
      textureCache,
      architectureResources.surfaceTextures,
      new THREE.Vector3(-1.5, 0, 0),
      Math.PI / 2,
      false,
      PLAYER_HAND,
    );
    addOpenMeld(scene, textureCache, new THREE.Vector3(0, 0, -0.98), Math.PI, [
      "characters.7",
      "characters.8",
      "characters.9",
    ]);
    addOpenMeld(scene, textureCache, new THREE.Vector3(0.98, 0, 0), -Math.PI / 2, [
      "dots.7",
      "dots.8",
      "dots.9",
    ]);
    addOpenMeld(scene, textureCache, new THREE.Vector3(-0.98, 0, 0), Math.PI / 2, [
      "bamboo.3",
      "bamboo.4",
      "bamboo.5",
    ]);
    addDiscardRivers(scene, textureCache);
    addDice(scene);
  }
  const seatLabels = penthouseEnabled
    ? [
        addLabel(scene, "YOU · SOUTH", new THREE.Vector3(0, 1.38, 1.78), "#e94136"),
        addLabel(scene, "NORTH · VALUE", new THREE.Vector3(0, 1.38, -1.78), "#73dce8"),
        addLabel(scene, "EAST · FAST", new THREE.Vector3(1.78, 1.38, 0), "#e94136"),
        addLabel(scene, "WEST · BALANCED", new THREE.Vector3(-1.78, 1.38, 0), "#73dce8"),
      ]
    : [];

  const sunObject = scene.getObjectByName("SunKeyLight");
  if (sunObject instanceof THREE.DirectionalLight) {
    sunLight = sunObject;
    debugSunIntensity = sunLight.intensity;
    debugSunYaw = Math.atan2(sunLight.position.z, sunLight.position.x);
    debugSunElevation = Math.atan2(
      sunLight.position.y,
      Math.hypot(sunLight.position.x, sunLight.position.z),
    );
  }
  const skySunObject = scene.getObjectByName("SkySunReference");
  if (skySunObject !== undefined) {
    skySunReference = skySunObject;
    updateSkySunReference();
  }
  cyanMaterials = [
    ...architectureResources.ambient.cyanMaterials,
    ...(debuggingTwoMap?.cyanMaterials ?? []),
  ];
  redMaterials = [
    ...architectureResources.ambient.redMaterials,
    ...(debuggingTwoMap?.redMaterials ?? []),
  ];
  scene.traverse((object) => {
    if (!("material" in object)) {
      return;
    }
    const material = (
      object as THREE.Object3D & {
        readonly material: THREE.Material | readonly THREE.Material[];
      }
    ).material;
    const materials: readonly THREE.Material[] =
      material instanceof THREE.Material ? [material] : material;
    if (object.name === "SystemSeam" || object.name === "TableSystemRing") {
      for (const entry of materials) {
        if (entry instanceof THREE.MeshStandardMaterial && !cyanMaterials.includes(entry)) {
          cyanMaterials.push(entry);
        }
      }
    }
    if (object.name === "DirectionalAccent") {
      for (const entry of materials) {
        if (entry instanceof THREE.MeshStandardMaterial && !redMaterials.includes(entry)) {
          redMaterials.push(entry);
        }
      }
    }
  });
  redMaterialBaseIntensity = new Map(
    redMaterials.map((material) => [material, material.emissiveIntensity]),
  );
  cyanMaterialBaseIntensity = new Map(
    cyanMaterials.map((material) => [material, material.emissiveIntensity]),
  );

  debugBoundsRoot = new THREE.Group();
  debugBoundsRoot.name = "DebugRoot";
  debugBoundsRoot.userData.dofIgnore = true;
  debugBoundsRoot.visible = false;
  const debugBoundTargets = isCleanSlateMap
    ? [debuggingTwoMap?.root ?? null]
    : penthouseEnabled
      ? [scene.getObjectByName("EnvironmentRoot"), table, wallRoot]
      : [];
  for (const target of debugBoundTargets) {
    if (target === undefined || target === null) {
      continue;
    }
    const helper = new THREE.BoxHelper(target, 0x73dce8);
    helper.name = `${target.name}Bounds`;
    debugBoundsRoot.add(helper);
  }
  scene.add(debugBoundsRoot);

  if (persistedDebugPreferences !== null) {
    suppressDebugPreferencesPersistence = true;
    try {
      applyDebugPreferences(persistedDebugPreferences);
    } finally {
      suppressDebugPreferencesPersistence = false;
    }
  } else {
    setDebugFogDensity(debugFogDensity);
    setDebugRedAccentIntensity(debugRedAccentIntensity);
    setDebugCyanEmissiveIntensity(debugCyanEmissiveIntensity);
    setDebugEnvironmentIntensity(debugEnvironmentIntensity);
    setDebugSunDirection(debugSunYaw, debugSunElevation);
    setDebugSunIntensity(debugSunIntensity);
  }
  suppressDebugPreferencesPersistence = false;

  // Restore the last development-scene transform after all camera targets and
  // physics surfaces exist, so the first rendered frame starts in the same
  // place that the HMR remount replaced.
  restoreSceneState(persistedSceneState);
  const hasActiveDebugPreset = (): boolean => activeDebugPreset !== null;
  if (persistedSceneState === null && !hasActiveDebugPreset() && initialView === "seat") {
    setView("seat");
  }
  // Scene construction can invalidate the manually managed camera matrices;
  // commit the restored/preset transform before the first composer render.
  camera.updateMatrix();
  camera.updateMatrixWorld(true);

  let previousWidth = 0;
  let previousHeight = 0;
  const resize = (): void => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    if (width === previousWidth && height === previousHeight) {
      return;
    }
    previousWidth = width;
    previousHeight = height;
    viewportAspect = width / height;
    camera.aspect = viewportAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    setO2BlurPassSize(o2BlurPass, renderer.domElement.width, renderer.domElement.height);
    syncDamageVignettePassSizes(renderer.domElement.width, renderer.domElement.height);
    gtaoPass.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
  };
  let resizeFrame = 0;
  const observer = new ResizeObserver(() => {
    if (resizeFrame !== 0) {
      window.cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  });
  observer.observe(container);
  resize();

  /**
   * Render a clean, high-detail world-only source for the scope. A hidden
   * second camera aims through the live reticule at a narrow FOV, so the lens
   * receives fresh geometry pixels instead of a stretched player-viewport
   * crop. Bullet-hole decals remain in this pass; weapon/UI overlays do not.
   */
  const renderSniperScopeWorld = (projection: {
    readonly magnification: number;
    readonly sceneResolution: { readonly x: number; readonly y: number };
  }): void => {
    const width = Math.max(projection.sceneResolution.x, 1);
    const height = Math.max(projection.sceneResolution.y, 1);
    if (sniperScopeSceneTarget.width !== width || sniperScopeSceneTarget.height !== height) {
      sniperScopeSceneTarget.setSize(width, height);
    }
    const aimRay = getAimRay();
    camera.matrixWorld.decompose(
      sniperScopeCameraPosition,
      sniperScopeCameraQuaternion,
      sniperScopeCameraScale,
    );
    sniperScopeCameraForward.set(0, 0, -1).applyQuaternion(sniperScopeCameraQuaternion).normalize();
    sniperScopeAimDirection.copy(aimRay.direction).normalize();
    if (
      sniperScopeCameraForward.lengthSq() > 0.0001 &&
      sniperScopeAimDirection.lengthSq() > 0.0001
    ) {
      sniperScopeRotationDelta.setFromUnitVectors(
        sniperScopeCameraForward,
        sniperScopeAimDirection,
      );
      sniperScopeCameraQuaternion.premultiply(sniperScopeRotationDelta).normalize();
    }
    sniperScopeCamera.position.copy(sniperScopeCameraPosition);
    sniperScopeCamera.quaternion.copy(sniperScopeCameraQuaternion);
    sniperScopeCamera.scale.copy(sniperScopeCameraScale);
    sniperScopeCamera.fov = resolveSniperScopeCameraFov(camera.fov, projection.magnification);
    sniperScopeCamera.aspect = width / height;
    sniperScopeCamera.zoom = 1;
    sniperScopeCamera.clearViewOffset();
    sniperScopeCamera.updateProjectionMatrix();
    sniperScopeCamera.updateMatrix();
    sniperScopeCamera.updateMatrixWorld(true);
    const hidden: { readonly object: THREE.Object3D; readonly visible: boolean }[] = [];
    scene.traverse((object) => {
      if (!shouldRenderSniperScopeObject(object.userData, object instanceof THREE.Sprite)) {
        hidden.push({ object, visible: object.visible });
        object.visible = false;
      }
    });
    const previousTarget = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(sniperScopeSceneTarget);
      renderer.clear();
      renderer.render(scene, sniperScopeCamera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      for (let index = hidden.length - 1; index >= 0; index -= 1) {
        const entry = hidden[index];
        if (entry !== undefined) {
          entry.object.visible = entry.visible;
        }
      }
    }
  };

  let animationFrame = 0;
  let disposed = false;
  container.dataset.wallTraversal = "none";
  container.dataset.playerWallContact = "false";
  container.dataset.playerWallBraced = "false";
  container.dataset.playerDeathRagdoll = "false";
  container.dataset.simulantDeathRagdoll = "false";
  container.dataset.playerMeleeImpactOpacity = "0";
  container.dataset.playerMeleeFocusShiftMeters = "0";
  staticPhysicsBoxes = createStaticPhysicsBoxes(
    scene,
    activeWorldBounds,
    debuggingTwoMap?.staticPhysicsBoxes ?? debuggingTwoMap?.physicsBoxes ?? [],
  );
  const weaponReservedRects: readonly WeaponSpawnRect[] = isCleanSlateMap
    ? []
    : PLAY_AREA_BOUNDS.map((bounds) => ({
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      }));
  const weaponPickups = isCleanSlateMap
    ? generateWeaponPickupsOnEdges(roomSeed, DEBUGGING_TWO_WORLD_BOUNDS)
    : generateWeaponPickups(roomSeed, {
        worldHalfSize: EXPLORATION_WORLD_HALF_SIZE,
        reservedRects: weaponReservedRects,
        obstacles: [...staticPhysicsBoxes, ...explorationWorld.getPhysicsBoxes()],
      });
  let meleeTelemetryState = createEmptyMeleeStateSnapshot();
  const publishMeleeTelemetry = (next: MeleeStateSnapshot): void => {
    const merged: MeleeStateSnapshot = {
      ...next,
      swings: Math.max(next.swings, meleeTelemetryState.swings),
      hits: Math.max(next.hits, meleeTelemetryState.hits),
      lastDamage: next.lastDamage > 0 ? next.lastDamage : meleeTelemetryState.lastDamage,
    };
    meleeTelemetryState = merged;
    options.onMeleeStateChange?.(merged);
  };
  const recordGunMeleeSwing = (oxygenCost: number): void => {
    meleeTelemetryState = {
      ...meleeTelemetryState,
      swinging: true,
      swings: meleeTelemetryState.swings + 1,
      lastOxygenCost: Number.isFinite(oxygenCost) ? Math.max(0, oxygenCost) : 0,
    };
    options.onMeleeStateChange?.(meleeTelemetryState);
  };
  const recordGunMeleeHit = (damage: number): void => {
    meleeTelemetryState = {
      ...meleeTelemetryState,
      hits: meleeTelemetryState.hits + 1,
      lastDamage: Number.isFinite(damage) ? Math.max(0, damage) : 0,
    };
    options.onMeleeStateChange?.(meleeTelemetryState);
  };
  weaponRuntime = createWeaponRuntime(
    scene,
    camera,
    roomSeed,
    weaponPickups,
    options.onWeaponStateChange,
    (damage, projectileCount) => {
      const oxygenConsumed = spendPlayerProjectileO2(damage, projectileCount, aimingDownSights);
      publishActionCameraMotion(
        cameraMotion.applyWeaponShotImpulse({
          damage,
          reticleOffset: reticlePresentation.dotOffsetCssPixels,
        }),
      );
      return oxygenConsumed;
    },
    (damage) => {
      const oxygenConsumed = spendPlayerProjectileO2(damage, 1, true);
      recordGunMeleeSwing(oxygenConsumed);
      publishActionCameraMotion(
        cameraMotion.applyWeaponShotImpulse({
          damage,
          reticleOffset: reticlePresentation.dotOffsetCssPixels,
        }),
      );
      return oxygenConsumed;
    },
    (hitObject, damage, context) => {
      const isMeleeHit = context.mode === "melee";
      const combatTarget = getCombatActorHitTarget(hitObject);
      const targetVelocity: PhysicsVector =
        combatTarget?.actorId === SIMULANT_COMBAT_ACTOR_ID
          ? simulantWorldVelocity
          : { x: 0, y: 0, z: 0 };
      const momentum = isMeleeHit
        ? resolveMeleeDamageWithMomentum({
            baseDamage: damage,
            attackDirection: context.direction,
            attackerVelocity: context.attackerVelocity ?? presentationWorldVelocity,
            targetVelocity,
            attackerAirborne: context.attackerAirborne ?? !grounded,
          })
        : null;
      const resolvedDamage = momentum?.damage ?? damage;
      if (isMeleeHit) {
        recordGunMeleeHit(resolvedDamage);
      }
      const stoppingPower = isMeleeHit
        ? resolveMeleeStoppingPower(resolvedDamage)
        : resolveWeaponStoppingPower(damage);
      if (combatTarget?.actorId === SIMULANT_COMBAT_ACTOR_ID) {
        applySimulantStoppingPower(context.direction, stoppingPower);
      }
      const appliedDamage = applyDamageToHitObject(
        hitObject,
        resolvedDamage,
        { kind: isMeleeHit ? "melee" : "weapon" },
        LOCAL_PLAYER_COMBAT_ACTOR_ID,
        getCombatHitZone(hitObject),
      );
      if (
        isMeleeHit &&
        appliedDamage !== null &&
        appliedDamage.damage > 0 &&
        combatTarget?.actorId === SIMULANT_COMBAT_ACTOR_ID
      ) {
        // The wielder feels the impact back through the weapon: reverse the
        // attack vector while the victim receives the physical push vector.
        applyMeleeViewImpact(context.direction, stoppingPower, -1, true);
      }
      const ragdollObjectId =
        explorationWorld?.getRagdollObjectIdForHit(hitObject, context.instanceIndex) ?? null;
      if (ragdollObjectId !== null) {
        if (isMeleeHit) {
          explorationWorld?.applyMeleeHit(
            ragdollObjectId,
            context.direction,
            context.meleeSwingSpeedRadiansPerSecond ?? 0,
            context.meleeStoppingPower ?? stoppingPower,
          );
        } else {
          explorationWorld?.applyProjectileHit(
            ragdollObjectId,
            context.direction,
            stoppingPower,
            physicsRuntime?.applyImpulseToDynamicBody,
          );
        }
      }
      if (combatTarget?.actorId === SIMULANT_COMBAT_ACTOR_ID) {
        return {
          targetKind: "simulant",
          shieldHit: appliedDamage !== null && resolveWeaponShieldHit(appliedDamage.shieldDamage),
          bloodEligible:
            appliedDamage !== null &&
            resolveWeaponBloodEligibility(appliedDamage.state.shield, appliedDamage.damage),
          targetVelocity: { ...targetVelocity },
          ...(isMeleeHit ? { resolvedDamage } : {}),
        };
      }
      return undefined;
    },
    (hasOutgoingWeapon) => {
      cameraMotion.applyWeaponSwitchImpulse({ hasOutgoingWeapon });
    },
  );
  meleeRuntime = createMeleeRuntime(
    scene,
    camera,
    explorationWorld,
    publishMeleeTelemetry,
    (damage) => {
      const oxygenConsumed = spendPlayerProjectileO2(damage, 1);
      publishActionCameraMotion(
        cameraMotion.applyWeaponShotImpulse({
          damage,
          reticleOffset: reticlePresentation.dotOffsetCssPixels,
        }),
      );
      return oxygenConsumed;
    },
    (hitObject, damage, context) => {
      const target = getCombatActorHitTarget(hitObject);
      if (target === null) {
        return null;
      }
      const targetVelocity: PhysicsVector =
        target.actorId === SIMULANT_COMBAT_ACTOR_ID ? simulantWorldVelocity : { x: 0, y: 0, z: 0 };
      const momentum = resolveMeleeDamageWithMomentum({
        baseDamage: damage,
        attackDirection: context.attackDirection,
        attackerVelocity: context.attackerVelocity,
        targetVelocity,
        attackerAirborne: context.attackerAirborne,
      });
      if (target.actorId === SIMULANT_COMBAT_ACTOR_ID) {
        applySimulantStoppingPower(
          context.attackDirection,
          resolveMeleeStoppingPower(momentum.damage),
        );
      }
      const applied = applyDamageToHitObject(hitObject, momentum.damage, { kind: "melee" });
      if (applied !== null && target.actorId === SIMULANT_COMBAT_ACTOR_ID) {
        if (applied.damage > 0) {
          // A hand-held prop gives the same impact kick as gun melee. Both
          // use the actual attack vector so diagonal strikes stay diagonal.
          applyMeleeViewImpact(
            context.attackDirection,
            resolveMeleeStoppingPower(momentum.damage),
            -1,
            true,
          );
        }
        weaponRuntime?.playMeleeHitEffects(
          context.point,
          context.attackDirection,
          momentum.damage,
          {
            targetKind: "simulant",
            shieldHit: resolveWeaponShieldHit(applied.shieldDamage),
            bloodEligible: resolveWeaponBloodEligibility(applied.state.shield, applied.damage),
            targetVelocity,
          },
        );
      }
      return applied === null ? null : momentum.damage;
    },
    (attributes, sourcePosition, swingDurationSeconds) => {
      weaponRuntime?.playMeleeSwingSound(attributes, sourcePosition, swingDurationSeconds);
    },
    (attributes, sourcePosition) => {
      weaponRuntime?.playMeleeImpactSound(attributes, sourcePosition);
    },
    (redrawingClaimedObject) => {
      // A claimed ragdoll object occupies the player's hand. Keep the gun
      // instance in its inventory, but holster its viewmodel until the
      // object is dropped or manually re-equipped.
      cancelZoomForMelee();
      const activeWeapon = weaponRuntime?.getSnapshot().activeWeapon ?? null;
      if (!redrawingClaimedObject || activeWeapon !== null) {
        meleeRearmWeapon = activeWeapon;
        if (activeWeapon !== null) {
          meleeDropRearmSuppressed = false;
        }
      }
      weaponRuntime?.holster();
    },
  );
  // Keep the same collision/traversal path active while Rapier's optional
  // WASM module is loading.  The previous null-runtime window let the camera
  // move through the training wall before the async initialisation settled,
  // which made wall hanging appear unreliable and skipped the refined ledge
  // transition on slower browsers.
  const fallbackPhysicsRuntime = createFallbackMahjongPhysics(staticPhysicsBoxes);
  physicsRuntime = fallbackPhysicsRuntime;
  syncPhysicsCharacterToCamera();
  const initialPhysicsBoxes = explorationWorld.getPhysicsBoxes();
  fallbackPhysicsRuntime.setDynamicBoxes(initialPhysicsBoxes);
  dynamicPhysicsBoxes = initialPhysicsBoxes;
  appliedPhysicsVersion = explorationWorld.getPhysicsVersion();
  container.dataset.physicsReady = "fallback";
  void createMahjongPhysics(staticPhysicsBoxes).then(
    (runtime) => {
      if (disposed) {
        runtime.dispose();
        return;
      }
      fallbackPhysicsRuntime.dispose();
      physicsRuntime = runtime;
      syncPhysicsCharacterToCamera();
      const nextPhysicsBoxes = explorationWorld?.getPhysicsBoxes() ?? [];
      runtime.setDynamicBoxes(nextPhysicsBoxes);
      dynamicPhysicsBoxes = nextPhysicsBoxes;
      appliedPhysicsVersion = explorationWorld?.getPhysicsVersion() ?? 0;
      container.dataset.physicsReady = "true";
    },
    () => {
      // The fallback runtime was active from the first frame, so a Rapier
      // rejection needs no separate movement path or state reset.
      container.dataset.physicsReady = "fallback";
    },
  );
  let documentVisible = document.visibilityState !== "hidden";
  const timer = new THREE.Timer();
  timer.connect(document);
  const findVisibleFocusIntersection = (ndc: THREE.Vector2): THREE.Intersection | undefined => {
    focusRaycaster.setFromCamera(ndc, camera);
    return focusRaycaster
      .intersectObjects(scene.children, true)
      .find((intersection) => !isDofIgnored(intersection.object));
  };
  const reticleAimNdc = new THREE.Vector2();
  const getReticlePresentation = (): ReticlePresentation => reticlePresentation;
  const getAimRay = (): { origin: THREE.Vector3; direction: THREE.Vector3 } => {
    const { aimNdc } = getReticlePresentation();
    reticleAimNdc.set(aimNdc.x, aimNdc.y);
    focusRaycaster.setFromCamera(reticleAimNdc, camera);
    return {
      origin: focusRaycaster.ray.origin.clone(),
      direction: focusRaycaster.ray.direction.clone(),
    };
  };
  /** Compose one published damper snapshot without advancing its simulation. */
  const composeFirstPersonCameraMotion = (
    baseCameraY: number,
    motion: CameraMotionOffsets,
  ): CameraMotionOffsets => {
    camera.position.y = baseCameraY + motion.verticalOffset;
    cameraMotionRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    cameraMotionRight.y = 0;
    let presentationOffsetX = 0;
    let presentationOffsetZ = 0;
    if (cameraMotionRight.lengthSq() > 0.0001) {
      cameraMotionRight.normalize();
      presentationOffsetX += cameraMotionRight.x * motion.headBobLateral;
      presentationOffsetZ += cameraMotionRight.z * motion.headBobLateral;
      presentationOffsetX += cameraMotionRight.x * motion.coverLeanOffset;
      presentationOffsetZ += cameraMotionRight.z * motion.coverLeanOffset;
    }
    cameraMotionForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    cameraMotionForward.y = 0;
    if (cameraMotionForward.lengthSq() > 0.0001) {
      cameraMotionForward.normalize();
      presentationOffsetX += cameraMotionForward.x * motion.headBobDepth;
      presentationOffsetZ += cameraMotionForward.z * motion.headBobDepth;
    }
    camera.updateMatrix();
    // Keep the physical camera position untouched. The presentation offset is
    // composed into the render matrix so the fallback controller cannot feed
    // last frame's bob back into authoritative movement on the next frame.
    camera.matrix.elements[12] += presentationOffsetX;
    camera.matrix.elements[14] += presentationOffsetZ;
    camera.matrixWorldNeedsUpdate = true;
    if (
      Math.abs(motion.recoilYaw) > 0.0001 ||
      Math.abs(motion.recoilPitch) > 0.0001 ||
      Math.abs(motion.headBobPitch) > 0.0001
    ) {
      cameraRecoilEuler.set(motion.recoilPitch + motion.headBobPitch, motion.recoilYaw, 0);
      cameraRecoilMatrix.makeRotationFromEuler(cameraRecoilEuler);
      camera.matrix.multiply(cameraRecoilMatrix);
      camera.matrixWorldNeedsUpdate = true;
    }
    if (Math.abs(motion.roll) > 0.0001) {
      cameraRollMatrix.makeRotationZ(motion.roll);
      camera.matrix.multiply(cameraRollMatrix);
      camera.matrixWorldNeedsUpdate = true;
    }
    refreshReticlePresentation();
    return motion;
  };
  /** Apply the shared first-person presentation damper after physics resolves the base pose. */
  const applyFirstPersonCameraMotion = (
    baseCameraY: number,
    input: CameraMotionUpdateInput,
  ): CameraMotionOffsets => composeFirstPersonCameraMotion(baseCameraY, cameraMotion.update(input));
  /** Recompose the current snapshot before an input event captures gameplay ray A. */
  const capturePreActionAimRay = (): {
    readonly origin: THREE.Vector3;
    readonly direction: THREE.Vector3;
  } => {
    if (activeFirstPersonBaseCameraY !== null) {
      composeFirstPersonCameraMotion(activeFirstPersonBaseCameraY, cameraMotion.getOffsets());
    }
    camera.updateMatrixWorld(true);
    return getAimRay();
  };
  const moveSpeed = PLAYER_MOVE_SPEED_METERS_PER_SECOND;
  const COLLISION_DAMAGE_COOLDOWN_SECONDS = 0.8;
  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      saveSceneState(true);
    }
    documentVisible = document.visibilityState !== "hidden";
    if (documentVisible && animationFrame === 0 && !disposed) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  };
  const onPageHide = (): void => {
    saveSceneState(true);
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  const animate = (): void => {
    if (disposed) {
      return;
    }
    if (!documentVisible) {
      animationFrame = 0;
      return;
    }
    // Use one clock source for both the timer and frame metrics. Some browsers
    // expose requestAnimationFrame timestamps on a different origin than
    // performance.now(), which can otherwise produce a negative delta and send
    // the damping math to infinity.
    timer.update();
    const delta = THREE.MathUtils.clamp(timer.getDelta(), 0, PLAYER_MOVEMENT_MAX_STEP_SECONDS);
    // A reload can start from an empty magazine during weapon update. Reapply
    // the requested aim state before FOV, vitals, and camera motion are read so
    // the full first-person presentation leaves zoom for the reload window.
    syncAimingFromInput();
    vitalsPublishElapsed += delta;
    speedPublishElapsed += delta;
    impactDamageCooldown = Math.max(0, impactDamageCooldown - delta);
    const nextVitals = tickPlayerVitals(playerVitals, delta, {
      exerciseIntensity,
      movementMagnitude: movementMagnitudeActivity,
      locomotionBlend: locomotionBlendActivity,
      sprinting: sprintingActivity,
      crouchWalking: crouchWalkingActivity,
      walking: walkingActivity,
      crouched: crouchedActivity,
      aimingDownSights,
    });
    const vitalsChanged = didPlayerVitalsChange(nextVitals);
    playerVitals = nextVitals;
    if (vitalsChanged || (playerVitals.shield < PLAYER_MAX_SHIELD && vitalsPublishElapsed >= 0.1)) {
      publishPlayerVitals();
    }
    if (
      simulantMarker !== null &&
      !playerVitals.isDead &&
      !simulantVitals.isDead &&
      simulantRagdollState === null
    ) {
      const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
      simulantShieldFlareElapsedSeconds += safeDelta;
      simulantShieldFlareRemainingSeconds = Math.max(
        0,
        simulantShieldFlareRemainingSeconds - safeDelta,
      );
      const previousSimulantPosition = simulantPosition.clone();
      simulantStaggerSeconds = Math.max(0, simulantStaggerSeconds - safeDelta);
      const knockbackDelta = simulantKnockbackVelocity.clone().multiplyScalar(safeDelta);
      simulantKnockbackVelocity.multiplyScalar(
        Math.exp(-SIMULANT_KNOCKBACK_DAMPING_PER_SECOND * safeDelta),
      );
      if (simulantWeapon === null && simulantWeaponTarget === null) {
        simulantWeaponTarget = selectSimulantWeaponTarget();
      }
      let weaponTargetPosition =
        simulantWeaponTarget === null
          ? null
          : resolveSimulantWeaponTargetPosition(simulantWeaponTarget);
      if (simulantWeaponTarget !== null && weaponTargetPosition === null) {
        simulantWeaponTarget = selectSimulantWeaponTarget();
        weaponTargetPosition =
          simulantWeaponTarget === null
            ? null
            : resolveSimulantWeaponTargetPosition(simulantWeaponTarget);
      }
      if (
        simulantWeapon === null &&
        simulantWeaponTarget !== null &&
        weaponTargetPosition !== null
      ) {
        const targetDistance = Math.hypot(
          weaponTargetPosition.x - simulantPosition.x,
          weaponTargetPosition.z - simulantPosition.z,
        );
        if (targetDistance <= SIMULANT_WEAPON_PICKUP_DISTANCE_METERS) {
          const acquired = acquireSimulantWeapon(simulantWeaponTarget);
          simulantWeaponTarget = acquired ? null : selectSimulantWeaponTarget();
          weaponTargetPosition =
            simulantWeaponTarget === null
              ? null
              : resolveSimulantWeaponTargetPosition(simulantWeaponTarget);
        }
      }
      const simulantAttackDistance =
        simulantWeapon === null
          ? SIMULANT_STOP_DISTANCE_METERS
          : Math.max(
              1.35,
              Math.min(
                SIMULANT_STOP_DISTANCE_METERS,
                simulantWeapon.snapshot.rangeMeters * 0.78 + 0.8,
              ),
            );
      const currentSimulantMeleeTarget =
        simulantWeapon === null
          ? null
          : simulantMeleeSwinging && simulantMeleeTarget !== null
            ? simulantMeleeTarget
            : resolveSimulantMeleeTarget(simulantWeapon, simulantAttackDistance);
      if (!simulantMeleeSwinging) {
        simulantMeleeTarget = currentSimulantMeleeTarget;
      }
      const pursuitTarget =
        simulantWeapon === null && weaponTargetPosition !== null
          ? weaponTargetPosition
          : currentSimulantMeleeTarget?.kind === "support-box"
            ? currentSimulantMeleeTarget.position
            : camera.position;
      const pursuitX = pursuitTarget.x - simulantPosition.x;
      const pursuitZ = pursuitTarget.z - simulantPosition.z;
      const pursuitDistance = Math.hypot(pursuitX, pursuitZ);
      const pursuitStopDistance =
        simulantWeapon === null && weaponTargetPosition !== null
          ? SIMULANT_WEAPON_PICKUP_DISTANCE_METERS
          : simulantAttackDistance;
      const simulantMoving =
        pursuitDistance > pursuitStopDistance &&
        simulantStaggerSeconds <= 0 &&
        !simulantMeleeSwinging;
      simulantVitals = tickPlayerVitals(simulantVitals, safeDelta, {
        movementMagnitude: simulantMoving ? 1 : 0,
        locomotionBlend: simulantMoving ? SIMULANT_TROT_LOCOMOTION_BLEND : 0,
        walking: simulantMoving,
        sprinting: false,
        aimingDownSights: false,
      });
      const simulantMotion = simulantPerspectiveRig.update({
        deltaSeconds: safeDelta,
        localAcceleration: { right: 0, forward: 0, up: 0 },
        movementMagnitude: simulantMoving ? 1 : 0,
        movementSpeedRatio: simulantMoving ? SIMULANT_TROT_SPEED_RATIO : 0,
        oxygenRatio: simulantVitals.o2 / PLAYER_MAX_O2,
        crouching: false,
        shiftEnabled: false,
        bobEnabled: true,
        aimingDownSights: false,
        holdingBreath: false,
        stabilizedByWall: false,
        traversalActive: false,
      });
      syncSimulantPresentation(simulantMotion);
      syncSimulantMarkerVitals();
      if (simulantMoving) {
        const moveDistance = Math.min(
          pursuitDistance - pursuitStopDistance,
          SIMULANT_TROT_SPEED_METERS_PER_SECOND * safeDelta,
        );
        simulantPosition.x += (pursuitX / pursuitDistance) * moveDistance;
        simulantPosition.z += (pursuitZ / pursuitDistance) * moveDistance;
        simulantPosition.x = THREE.MathUtils.clamp(
          simulantPosition.x,
          activeWorldBounds.minX + WORLD_SPAWN_MARGIN,
          activeWorldBounds.maxX - WORLD_SPAWN_MARGIN,
        );
        simulantPosition.z = THREE.MathUtils.clamp(
          simulantPosition.z,
          activeWorldBounds.minZ + WORLD_SPAWN_MARGIN,
          activeWorldBounds.maxZ - WORLD_SPAWN_MARGIN,
        );
      }
      simulantPosition.add(knockbackDelta);
      simulantPosition.x = THREE.MathUtils.clamp(
        simulantPosition.x,
        activeWorldBounds.minX + WORLD_SPAWN_MARGIN,
        activeWorldBounds.maxX - WORLD_SPAWN_MARGIN,
      );
      simulantPosition.z = THREE.MathUtils.clamp(
        simulantPosition.z,
        activeWorldBounds.minZ + WORLD_SPAWN_MARGIN,
        activeWorldBounds.maxZ - WORLD_SPAWN_MARGIN,
      );
      simulantWorldVelocity =
        safeDelta > 0
          ? {
              x: (simulantPosition.x - previousSimulantPosition.x) / safeDelta,
              y: (simulantPosition.y - previousSimulantPosition.y) / safeDelta,
              z: (simulantPosition.z - previousSimulantPosition.z) / safeDelta,
            }
          : { x: 0, y: 0, z: 0 };
      simulantMarker.position.copy(simulantPosition);
      const facingTarget =
        currentSimulantMeleeTarget?.kind === "support-box"
          ? currentSimulantMeleeTarget.position
          : camera.position;
      const facingDistance = Math.hypot(
        facingTarget.x - simulantPosition.x,
        facingTarget.z - simulantPosition.z,
      );
      if (facingDistance > 0.1 && Number.isFinite(facingDistance)) {
        simulantMarker.rotation.y = Math.atan2(
          facingTarget.x - simulantPosition.x,
          facingTarget.z - simulantPosition.z,
        );
      }
      simulantMeleeCooldownSeconds = Math.max(0, simulantMeleeCooldownSeconds - safeDelta);
      if (simulantWeapon !== null) {
        if (simulantMeleeSwinging) {
          simulantMeleeSwingElapsedSeconds += safeDelta;
          const swingProgress = Math.min(
            1,
            simulantMeleeSwingElapsedSeconds / Math.max(0.001, simulantMeleeSwingDurationSeconds),
          );
          if (!simulantMeleeHitResolved && swingProgress >= 0.5) {
            simulantMeleeHitResolved = true;
            resolveSimulantMeleeHit();
          }
          if (swingProgress >= 1) {
            simulantMeleeSwinging = false;
            simulantMeleeSwingElapsedSeconds = 0;
            simulantMeleeCooldownSeconds = SIMULANT_MELEE_COOLDOWN_SECONDS;
            simulantMeleeTarget = null;
          }
        } else if (currentSimulantMeleeTarget !== null && simulantMeleeCooldownSeconds <= 0) {
          startSimulantMeleeSwing(currentSimulantMeleeTarget);
        }
      }
      syncSimulantPresentation(simulantMotion);
      simulantMarker.updateMatrixWorld(true);
    }
    const ragdollDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (
      simulantRagdollState !== null &&
      simulantMarker !== null &&
      simulantBody !== null &&
      simulantBodyParts !== null
    ) {
      simulantRagdollState = stepRagdoll(simulantRagdollState, ragdollDelta, simulantRagdollFloorY);
      applyRagdollBodyPose(simulantMarker, simulantBody, simulantBodyParts, simulantRagdollState);
      simulantMarker.updateMatrixWorld(true);
    }
    if (
      playerRagdollState !== null &&
      playerRagdollMarker !== null &&
      playerRagdollBody !== null &&
      playerRagdollBodyParts !== null
    ) {
      playerRagdollState = stepRagdoll(playerRagdollState, ragdollDelta, playerRagdollFloorY);
      applyRagdollBodyPose(
        playerRagdollMarker,
        playerRagdollBody,
        playerRagdollBodyParts,
        playerRagdollState,
      );
      playerRagdollMarker.updateMatrixWorld(true);
    }
    container.dataset.playerDeathRagdoll = playerRagdollState === null ? "false" : "true";
    container.dataset.simulantDeathRagdoll = simulantRagdollState === null ? "false" : "true";
    syncDofIntensityForZoom();
    const currentTimestamp = performance.now();
    if (previousAnimationTimestamp > 0) {
      const frameTime = Math.max(0.1, currentTimestamp - previousAnimationTimestamp);
      if (frameTime <= 250) {
        debugFrameTimeMs = THREE.MathUtils.lerp(debugFrameTimeMs, frameTime, 0.12);
        debugFps = 1000 / debugFrameTimeMs;
      }
    }
    previousAnimationTimestamp = currentTimestamp;
    const ambientTime = currentTimestamp * 0.001;
    const ambientPulse = Math.sin(ambientTime * 0.78) * 0.035 * debugAmbientAnimationRate;
    for (const material of cyanMaterials) {
      const baseIntensity = cyanMaterialBaseIntensity.get(material) ?? 0.28;
      material.emissiveIntensity = (baseIntensity + ambientPulse) * debugCyanEmissiveIntensity;
    }
    exposureLookDirection.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const windowFacing = THREE.MathUtils.clamp(-exposureLookDirection.z, 0, 1);
    const estimatedLuminance = THREE.MathUtils.clamp(
      0.72 +
        debugEnvironmentIntensity * 0.24 +
        (sunLight === null ? 0 : debugSunIntensity * 0.06) +
        windowFacing * 0.22,
      0.35,
      2.4,
    );
    if (debugAutoExposureEnabled) {
      const targetExposure = THREE.MathUtils.clamp(1.12 / estimatedLuminance, 0.64, 1.55);
      debugExposureTarget = THREE.MathUtils.damp(debugExposureTarget, targetExposure, 1.6, delta);
      renderer.toneMappingExposure = debugExposureTarget;
    }
    const seatTargetFov = aimingDownSights ? SEAT_AIMING_FOV : SEAT_STANDING_FOV;
    const targetFov =
      activeView === "seat" ? seatTargetFov : (debugFovOverride ?? TABLE_CAMERA_FOV);
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 10, delta);
    if (Math.abs(nextFov - camera.fov) > 0.001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
    // Rebuild the off-axis projection as the smooth zoom/hip-fire FOV changes.
    // This keeps the world point under the lower reticule fixed instead of
    // making the zoom pivot around the screen center.
    syncReticleZoomProjection();
    for (const label of seatLabels) {
      label.visible = !isCrouched || activeView !== "seat";
    }
    const firstPersonActive =
      firstPersonControls.enabled &&
      (firstPersonControls.isLocked || (isTouchDevice && activeView === "seat"));
    touchingWall = false;
    wallBracedAim = false;
    let knockImpactDelta: PhysicsVector = { x: 0, y: 0, z: 0 };
    let knockCollisionCount = 0;
    if (firstPersonActive) {
      const jumpInputActive = jumpKeyHeld || jumpPressQueued;
      jumpPressQueued = false;
      // Keep simulant melee recoil in the same authoritative movement path as
      // keyboard/touch input. The damper receives the resolved displacement
      // later in this frame, so the camera and viewmodel feel the same push.
      const playerKnockbackDelta: PhysicsVector = {
        x: playerKnockbackVelocity.x * delta,
        y: 0,
        z: playerKnockbackVelocity.z * delta,
      };
      playerKnockbackVelocity.multiplyScalar(
        Math.exp(-PLAYER_KNOCKBACK_DAMPING_PER_SECOND * delta),
      );
      if (motionLookEnabled && motionTargetValid) {
        camera.quaternion.slerp(motionTargetQuaternion, 1 - Math.exp(-18 * delta));
      }
      // Rebuild the upright control matrix before PointerLockControls moves.
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      // Cover is directional. Drop an existing stance before movement is
      // projected or snapped so turning outside the 90° wall-facing cone
      // cannot carry the player along the wall for one more frame.
      cameraMotionForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      cameraMotionForward.y = 0;
      if (cameraMotionForward.lengthSq() > 0.0001) {
        cameraMotionForward.normalize();
      } else {
        // A near-vertical look has no horizontal cover direction. Keep the
        // vector zero here; the camera-motion frame installs its own forward
        // fallback later for presentation-only damping.
        cameraMotionForward.set(0, 0, 0);
      }
      if (
        coverMode &&
        (coverWall === null || !isPlayerFacingWall(cameraMotionForward, coverWall))
      ) {
        clearCoverMode();
      }
      let crouching = isCrouched;
      const standingEyeHeight =
        activeDebugPreset === "climbingGym"
          ? CLIMBING_GYM_STANDING_EYE_HEIGHT
          : STANDING_EYE_HEIGHT;
      const targetEyeHeight = crouching ? SEATED_EYE_HEIGHT : standingEyeHeight;
      const isLedgeClimbing = ledgeClimbTransition !== null;
      const isWallClimbing = wallClimbTransition !== null;
      const reloadingMovement = weaponRuntime?.isReloading() ?? false;
      eyeHeight = THREE.MathUtils.damp(eyeHeight, targetEyeHeight, 14, delta);
      let forward: number;
      let right: number;
      let currentMoveSpeed: number;
      let movementMagnitude: number;
      let sprintingMovement = false;
      let joggingMovement: boolean;
      let inputScale = 1;
      if (isLedgeClimbing || isWallClimbing) {
        forward = 0;
        right = 0;
        movementMagnitude = 0;
        const transition = ledgeClimbTransition;
        if (transition !== null) {
          const preservedSpeed = Math.hypot(
            transition.preservedForwardVelocity,
            transition.preservedStrafeVelocity,
          );
          movementMagnitude =
            transition.preserveSprinting && preservedSpeed > 0
              ? 1
              : Math.min(1, preservedSpeed / (moveSpeed * 1));
          const fastMovementRequested =
            (isSprinting || transition.preserveSprinting) && preservedSpeed > 0;
          sprintingMovement =
            fastMovementRequested &&
            !reloadingMovement &&
            canAffordPlayerO2Cost(
              playerVitals,
              O2_SPRINT_DRAIN_PER_SECOND * delta * movementMagnitude,
            );
          if (fastMovementRequested && !sprintingMovement && !reloadingMovement) {
            isSprinting = resolveSprintRequestAfterO2Check(isSprinting, sprintingMovement);
            transition.preserveSprinting = false;
          }
          joggingMovement = fastMovementRequested && !sprintingMovement;
          const preservedSpeedCap = sprintingMovement
            ? preservedSpeed
            : Math.min(
                preservedSpeed,
                moveSpeed *
                  resolvePlayerMovementSpeedMultiplier({
                    crouching,
                    walking: isWalkingMode,
                    sprinting: reloadingMovement ? fastMovementRequested : sprintingMovement,
                    jogging: joggingMovement,
                    reloading: reloadingMovement,
                  }),
              );
          currentMoveSpeed = Math.max(
            moveSpeed *
              resolvePlayerMovementSpeedMultiplier({
                crouching,
                walking: isWalkingMode,
                sprinting: reloadingMovement ? fastMovementRequested : sprintingMovement,
                jogging: joggingMovement,
                reloading: reloadingMovement,
              }),
            preservedSpeedCap,
          );
        } else {
          currentMoveSpeed = 0;
        }
      } else if (touchMovementActive) {
        const touchMagnitude = Math.min(1, Math.hypot(touchForward, touchRight));
        const touchDirectionScale = touchMagnitude > 0 ? 1 / touchMagnitude : 0;
        forward = touchForward * touchDirectionScale;
        right = touchRight * touchDirectionScale;
        movementMagnitude = touchMagnitude;
        const sprintCap = getTouchSprintCap(forward);
        const fastMovementRequested = isSprinting && !crouching && touchMagnitude > 0.05;
        sprintingMovement =
          fastMovementRequested &&
          !reloadingMovement &&
          canAffordPlayerO2Cost(playerVitals, O2_SPRINT_DRAIN_PER_SECOND * delta * touchMagnitude);
        if (fastMovementRequested && !sprintingMovement && !reloadingMovement) {
          isSprinting = resolveSprintRequestAfterO2Check(isSprinting, sprintingMovement);
        }
        const touchSpeedMultiplier = crouching
          ? CROUCH_SPEED_MULTIPLIER
          : isWalkingMode
            ? WALK_SPEED_MULTIPLIER
            : sprintingMovement
              ? SPRINT_MULTIPLIER * sprintCap
              : TROT_SPEED_MULTIPLIER;
        const reloadTouchSpeedMultiplier = reloadingMovement
          ? Math.min(
              (crouching
                ? CROUCH_SPEED_MULTIPLIER
                : isWalkingMode
                  ? WALK_SPEED_MULTIPLIER
                  : fastMovementRequested
                    ? SPRINT_MULTIPLIER * sprintCap
                    : TROT_SPEED_MULTIPLIER) * touchMagnitude,
              TROT_SPEED_MULTIPLIER,
            )
          : touchSpeedMultiplier * touchMagnitude;
        currentMoveSpeed = moveSpeed * reloadTouchSpeedMultiplier;
      } else {
        forward =
          (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) -
          (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
        right =
          (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0) -
          (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0);
        const inputMagnitude = Math.hypot(forward, right);
        movementMagnitude = Math.min(1, inputMagnitude);
        inputScale = inputMagnitude > 1 ? 1 / inputMagnitude : 1;
        const fastMovementRequested = isSprinting && inputMagnitude > 0 && !crouching;
        sprintingMovement =
          fastMovementRequested &&
          !reloadingMovement &&
          canAffordPlayerO2Cost(
            playerVitals,
            O2_SPRINT_DRAIN_PER_SECOND * delta * movementMagnitude,
          );
        if (fastMovementRequested && !sprintingMovement && !reloadingMovement) {
          isSprinting = resolveSprintRequestAfterO2Check(isSprinting, sprintingMovement);
        }
        joggingMovement = fastMovementRequested && !sprintingMovement;
        const speedMultiplier = resolvePlayerMovementSpeedMultiplier({
          crouching,
          walking: isWalkingMode,
          sprinting: reloadingMovement ? fastMovementRequested : sprintingMovement,
          jogging: joggingMovement,
          reloading: reloadingMovement,
        });
        currentMoveSpeed = moveSpeed * speedMultiplier;
      }
      if (wallHangState !== null) {
        wallHangElapsed = Math.min(wallHangElapsed + delta, WALL_HANG_SETTLE_DURATION);
      }
      let isWallTraversalActive = wallHangState !== null || wallClimbTransition !== null;
      const desiredForward = isWallTraversalActive ? 0 : forward * inputScale * currentMoveSpeed;
      const desiredStrafe = isWallTraversalActive ? 0 : right * inputScale * currentMoveSpeed;
      const previousPresentationWorldVelocity = presentationWorldVelocity;
      const velocityDeltaSeconds = Math.max(delta, 1 / 120);
      let resolvedWorldVelocity: CameraMotionVector;
      const maxMoveSpeed = moveSpeed * SPRINT_MULTIPLIER;
      let movementSpeedRatio = THREE.MathUtils.clamp(currentMoveSpeed / maxMoveSpeed, 0, 1);
      movementMagnitudeActivity = movementMagnitude;
      locomotionBlendActivity = crouching
        ? 0
        : THREE.MathUtils.clamp(
            (movementSpeedRatio - WALK_SPEED_RATIO) / (1 - WALK_SPEED_RATIO),
            0,
            1,
          );
      exerciseIntensity = THREE.MathUtils.clamp(
        movementMagnitude * (crouching ? 1 : movementSpeedRatio),
        0,
        1,
      );
      if (!grounded) {
        exerciseIntensity = Math.max(exerciseIntensity, 0.25);
      }
      sprintingActivity = !crouching && movementMagnitude > 0.05 && sprintingMovement;
      crouchWalkingActivity = crouching && movementMagnitude > 0.05;
      walkingActivity =
        !crouching && movementMagnitude > 0.05 && !sprintingActivity && !isWallTraversalActive;
      crouchedActivity = crouching;
      const activeExternalTraversal: PlayerExternalTraversalState | null =
        wallHangState !== null
          ? {
              kind: "wall-contact",
              obstacleId: wallHangState.sourceObstacleId,
              progress: wallHangElapsed / WALL_HANG_SETTLE_DURATION,
              contactValid: jumpInputActive,
              ...(jumpInputActive ? {} : { cancelled: true }),
            }
          : wallClimbTransition !== null
            ? {
                kind: "wall-climb",
                obstacleId: wallClimbTransition.sourceObstacleId,
                progress: wallClimbTransition.elapsed / wallClimbTransition.duration,
                contactValid: jumpInputActive,
                ...(jumpInputActive ? {} : { cancelled: true }),
              }
            : ledgeClimbTransition !== null
              ? {
                  kind: ledgeClimbTransition.traversalKind,
                  obstacleId: ledgeClimbTransition.sourceObstacleId,
                  progress: ledgeClimbTransition.elapsed / ledgeClimbTransition.duration,
                  contactValid: jumpInputActive,
                  ...(jumpInputActive ? {} : { cancelled: true }),
                }
              : null;
      const externalTraversal = pendingTraversalFeedback ?? activeExternalTraversal;
      const controllerOutput = stepPlayerMovementController(movementControllerState, {
        deltaSeconds: delta,
        seed: movementControllerSeed,
        direction: { right: right * inputScale, forward: forward * inputScale },
        currentVelocity: {
          right: strafeVelocity,
          up: verticalVelocity,
          forward: forwardVelocity,
        },
        grounded,
        sprint: sprintingMovement,
        sprintAffordable: !isSprinting || sprintingMovement,
        crouch: crouching,
        jump: jumpInputActive,
        walking: isWalkingMode,
        oxygen: playerVitals.o2,
        targetSpeedMetersPerSecond: currentMoveSpeed,
        externalTraversal,
        slideRequested,
      });
      pendingTraversalFeedback = null;
      movementControllerState = controllerOutput.state;
      slideRequested = false;
      if (controllerOutput.jumpAction !== null) {
        applyControllerJump(controllerOutput.jumpAction);
        crouching = isCrouched;
      }
      for (const event of controllerOutput.events) {
        if (event.kind === "traversal-cancel") {
          cancelTraversalExecution(event.traversal);
        } else if (event.kind === "wall-climb-request") {
          if (!beginWallClimb()) {
            queueTraversalFeedback("wall-contact", event.obstacleId, "cancelled");
            cancelTraversalExecution("wall-contact");
          }
        }
      }
      isWallTraversalActive = wallHangState !== null || wallClimbTransition !== null;
      container.dataset.playerMovementState = movementControllerState.movement.kind;
      if (isWallTraversalActive) {
        forwardVelocity = 0;
        strafeVelocity = 0;
      } else {
        forwardVelocity = controllerOutput.desiredVelocity.forward;
        strafeVelocity = controllerOutput.desiredVelocity.right;
      }
      const movementStart = camera.position.clone();
      if (!isLedgeClimbing && !isWallTraversalActive && Math.abs(forwardVelocity) > 0.001) {
        firstPersonControls.moveForward(forwardVelocity * delta);
      }
      if (!isLedgeClimbing && !isWallTraversalActive && Math.abs(strafeVelocity) > 0.001) {
        firstPersonControls.moveRight(strafeVelocity * delta);
      }
      let desiredHorizontalDelta: PhysicsVector = camera.position.clone().sub(movementStart);
      if (coverMode && coverWall !== null) {
        // Once cover is engaged, keep locomotion on the wall face even when
        // the player turns to look around the corner. This removes the
        // camera-relative strafe's outward normal component before physics.
        desiredHorizontalDelta = projectPlayerMovementToWallTangent(
          desiredHorizontalDelta,
          coverWall,
        );
      }
      desiredHorizontalDelta = {
        x: desiredHorizontalDelta.x + playerKnockbackDelta.x,
        y: 0,
        z: desiredHorizontalDelta.z + playerKnockbackDelta.z,
      };
      let baseCameraY: number;
      let coverSnapDelta: PhysicsVector = { x: 0, y: 0, z: 0 };
      if (physicsRuntime !== null) {
        camera.position.copy(movementStart);
        const traversalPhysicsBoxes = [
          ...staticPhysicsBoxes,
          ...dynamicPhysicsBoxes.filter((box) => box.dynamic !== true),
        ];
        const resolveTraversalSourceBox = (obstacleId: string): PhysicsBox | null =>
          traversalPhysicsBoxes.find((box) => resolvePhysicsBoxObstacleId(box) === obstacleId) ??
          null;
        if (wallHangState !== null || wallClimbTransition !== null) {
          knockImpactDelta = { x: 0, y: 0, z: 0 };
          knockCollisionCount = 0;
          if (wallHangState !== null) {
            const wall = wallHangState;
            const traversalStart = physicsCharacterPosition ?? wall.target;
            const sourceBox = resolveTraversalSourceBox(wall.sourceObstacleId);
            const refreshedWall =
              sourceBox === null ||
              resolvePhysicsBoxGeometrySignature(sourceBox) !== wall.sourceGeometryKey
                ? null
                : resolveWallHangTargetDetails(traversalStart, wall.approachDirection, [sourceBox]);
            const attachment = physicsRuntime.move(
              traversalStart,
              refreshedWall === null
                ? { x: 0, y: 0, z: 0 }
                : {
                    x:
                      refreshedWall.target.x -
                      traversalStart.x -
                      refreshedWall.wallNormal.x * WALL_HANG_CONTACT_PROBE_DISTANCE,
                    y: refreshedWall.target.y - traversalStart.y,
                    z:
                      refreshedWall.target.z -
                      traversalStart.z -
                      refreshedWall.wallNormal.z * WALL_HANG_CONTACT_PROBE_DISTANCE,
                  },
            );
            const attachmentPosition = attachment.position;
            const contactValid =
              refreshedWall !== null &&
              resolvePhysicsBoxObstacleId(refreshedWall.box) === wall.sourceObstacleId &&
              attachment.contacts.some(
                (contact) =>
                  contact.kind === "wall" && contact.obstacleId === wall.sourceObstacleId,
              ) &&
              Math.hypot(
                attachmentPosition.x - refreshedWall.target.x,
                attachmentPosition.y - refreshedWall.target.y,
                attachmentPosition.z - refreshedWall.target.z,
              ) <= WALL_HANG_ATTACHMENT_TOLERANCE;
            physicsCharacterPosition = attachmentPosition;
            verticalVelocity = (attachmentPosition.y - traversalStart.y) / velocityDeltaSeconds;
            resolvedWorldVelocity = {
              x: (attachmentPosition.x - traversalStart.x) / velocityDeltaSeconds,
              y: verticalVelocity,
              z: (attachmentPosition.z - traversalStart.z) / velocityDeltaSeconds,
            };
            if (!contactValid) {
              queueTraversalFeedback("wall-contact", wall.sourceObstacleId, "cancelled");
              wallHangState = null;
              wallHangElapsed = 0;
              grounded = attachment.grounded;
            } else {
              wall.target = refreshedWall.target;
              wall.wallNormal = refreshedWall.wallNormal;
              wall.wallFacePoint = refreshedWall.wallFacePoint;
              wall.wallTopY = refreshedWall.wallTopY;
              wall.box = refreshedWall.box;
              grounded = false;
              verticalVelocity = 0;
              resolvedWorldVelocity = { x: 0, y: 0, z: 0 };
            }
            jumpOffset = Math.max(0, attachmentPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
            camera.position.x = attachmentPosition.x;
            camera.position.z = attachmentPosition.z;
            baseCameraY = attachmentPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
          } else {
            const transition = wallClimbTransition;
            if (transition === null) {
              baseCameraY = camera.position.y;
              resolvedWorldVelocity = { x: 0, y: 0, z: 0 };
            } else {
              const sourceBox = resolveTraversalSourceBox(transition.sourceObstacleId);
              const destination = {
                x: transition.targetX,
                y: transition.targetY,
                z: transition.targetZ,
              };
              if (
                sourceBox === null ||
                resolvePhysicsBoxGeometrySignature(sourceBox) !== transition.sourceGeometryKey ||
                !isPlayerCapsulePositionClear(destination, traversalPhysicsBoxes)
              ) {
                queueTraversalFeedback(
                  transition.traversalKind,
                  transition.sourceObstacleId,
                  "cancelled",
                );
                wallClimbTransition = null;
                const position = physicsCharacterPosition ?? {
                  x: transition.startX,
                  y: transition.startY,
                  z: transition.startZ,
                };
                physicsCharacterPosition = position;
                grounded = false;
                verticalVelocity = 0;
                jumpOffset = Math.max(0, position.y - PLAYER_COLLIDER_CENTER_HEIGHT);
                camera.position.x = position.x;
                camera.position.z = position.z;
                baseCameraY = position.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
                resolvedWorldVelocity = { x: 0, y: 0, z: 0 };
              } else {
                transition.sourceBox = sourceBox;
                const previousTransitionProgress = smoothStep(
                  THREE.MathUtils.clamp(transition.elapsed / transition.duration, 0, 1),
                );
                const previousTransitionX = THREE.MathUtils.lerp(
                  transition.startX,
                  transition.targetX,
                  previousTransitionProgress,
                );
                const previousTransitionZ = THREE.MathUtils.lerp(
                  transition.startZ,
                  transition.targetZ,
                  previousTransitionProgress,
                );
                const previousTransitionY = resolveClimbingTransitionY(
                  transition,
                  transition.elapsed,
                );
                transition.elapsed = Math.min(transition.elapsed + delta, transition.duration);
                const transitionY = resolveClimbingTransitionY(transition, transition.elapsed);
                const progress = smoothStep(
                  THREE.MathUtils.clamp(transition.elapsed / transition.duration, 0, 1),
                );
                const proposedPosition: PhysicsVector = {
                  x: THREE.MathUtils.lerp(transition.startX, transition.targetX, progress),
                  y: transitionY,
                  z: THREE.MathUtils.lerp(transition.startZ, transition.targetZ, progress),
                };
                const traversalStart = physicsCharacterPosition ?? {
                  x: previousTransitionX,
                  y: previousTransitionY,
                  z: previousTransitionZ,
                };
                const traversalMovement = physicsRuntime.move(traversalStart, {
                  x: proposedPosition.x - traversalStart.x,
                  y: proposedPosition.y - traversalStart.y,
                  z: proposedPosition.z - traversalStart.z,
                });
                const position = traversalMovement.position;
                const traversalBlocked =
                  traversalMovement.collisions > 0 &&
                  Math.hypot(
                    position.x - proposedPosition.x,
                    position.y - proposedPosition.y,
                    position.z - proposedPosition.z,
                  ) > 0.025 &&
                  !(
                    traversalMovement.contacts.length > 0 &&
                    traversalMovement.contacts.every(
                      (contact) => contact.obstacleId === transition.sourceObstacleId,
                    )
                  );
                verticalVelocity = (position.y - traversalStart.y) / velocityDeltaSeconds;
                resolvedWorldVelocity = {
                  x: (position.x - traversalStart.x) / velocityDeltaSeconds,
                  y: verticalVelocity,
                  z: (position.z - traversalStart.z) / velocityDeltaSeconds,
                };
                physicsCharacterPosition = position;
                grounded = traversalBlocked ? traversalMovement.grounded : false;
                jumpOffset = Math.max(0, position.y - PLAYER_COLLIDER_CENTER_HEIGHT);
                camera.position.x = position.x;
                camera.position.z = position.z;
                baseCameraY = position.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
                forwardVelocity = transition.preservedForwardVelocity;
                strafeVelocity = transition.preservedStrafeVelocity;
                if (traversalBlocked) {
                  queueTraversalFeedback(
                    transition.traversalKind,
                    transition.sourceObstacleId,
                    "cancelled",
                  );
                  wallClimbTransition = null;
                } else if (transition.elapsed >= transition.duration) {
                  if (transition.phase === "vault" && transition.landingBoostDistance > 0) {
                    const preservedSpeed = Math.hypot(
                      transition.preservedForwardVelocity,
                      transition.preservedStrafeVelocity,
                    );
                    const boostDirectionForward =
                      preservedSpeed > 0 ? transition.preservedForwardVelocity / preservedSpeed : 0;
                    const boostDirectionRight =
                      preservedSpeed > 0 ? transition.preservedStrafeVelocity / preservedSpeed : 0;
                    transition.startX = transition.targetX;
                    transition.startY = transition.targetY;
                    transition.startZ = transition.targetZ;
                    transition.targetX += boostDirectionForward * transition.landingBoostDistance;
                    transition.targetZ += boostDirectionRight * transition.landingBoostDistance;
                    transition.duration = LEDGE_CLIMB_EXIT_BOOST_DURATION;
                    transition.elapsed = 0;
                    transition.phase = "landingBoost";
                    baseCameraY = transition.startY - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
                  } else {
                    const targetPosition: PhysicsVector = {
                      x: transition.targetX,
                      y: transition.targetY,
                      z: transition.targetZ,
                    };
                    const landingStart = physicsCharacterPosition;
                    const landing = physicsRuntime.move(landingStart, {
                      x: targetPosition.x - landingStart.x,
                      y: targetPosition.y - landingStart.y - PLAYER_SUPPORT_SNAP_HEIGHT,
                      z: targetPosition.z - landingStart.z,
                    });
                    const landedPosition: PhysicsVector = {
                      x: THREE.MathUtils.clamp(
                        landing.position.x,
                        activeWorldBounds.minX,
                        activeWorldBounds.maxX,
                      ),
                      y: landing.position.y,
                      z: THREE.MathUtils.clamp(
                        landing.position.z,
                        activeWorldBounds.minZ,
                        activeWorldBounds.maxZ,
                      ),
                    };
                    physicsCharacterPosition = landedPosition;
                    grounded = landing.grounded;
                    verticalVelocity = 0;
                    jumpOffset = Math.max(0, landedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
                    camera.position.x = landedPosition.x;
                    camera.position.z = landedPosition.z;
                    baseCameraY = landedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
                    const landingCompleted =
                      landing.grounded &&
                      landing.contacts.some(
                        (contact) =>
                          contact.kind === "support" &&
                          contact.obstacleId === transition.sourceObstacleId,
                      ) &&
                      Math.hypot(
                        landedPosition.x - targetPosition.x,
                        landedPosition.y - targetPosition.y,
                        landedPosition.z - targetPosition.z,
                      ) <=
                        WALL_CLIMB_CLEARANCE + 0.025;
                    queueTraversalFeedback(
                      transition.traversalKind,
                      transition.sourceObstacleId,
                      landingCompleted ? "completed" : "cancelled",
                    );
                    wallClimbTransition = null;
                    resolvedWorldVelocity = { x: 0, y: 0, z: 0 };
                  }
                }
              }
            }
          }
        } else {
          if (physicsCharacterPosition === null) {
            syncPhysicsCharacterToCamera();
          }
          const characterPosition = physicsCharacterPosition ?? {
            x: camera.position.x,
            y: camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
            z: camera.position.z,
          };
          if (coverMode && coverWall !== null && coverSnapTarget !== null) {
            // Cover entry is a short assisted approach. Keep the approach
            // bounded by sprint speed, then let the physics controller settle
            // the final capsule-to-wall gap.
            coverSnapDelta = resolvePlayerWallSnapDelta(
              characterPosition,
              coverSnapTarget,
              maxMoveSpeed,
              delta,
            );
            desiredHorizontalDelta = {
              x: desiredHorizontalDelta.x + coverSnapDelta.x,
              y: 0,
              z: desiredHorizontalDelta.z + coverSnapDelta.z,
            };
          }
          const wasGrounded = grounded;
          if (!grounded || verticalVelocity > 0) {
            verticalVelocity -= GRAVITY * delta;
          }
          if (!wasGrounded) {
            maximumFallSpeed = Math.max(maximumFallSpeed, Math.max(0, -verticalVelocity));
          }
          const movement = physicsRuntime.move(characterPosition, {
            x: desiredHorizontalDelta.x,
            y: verticalVelocity * delta,
            z: desiredHorizontalDelta.z,
          });
          if (movement.collisions > 0 && delta > 0) {
            const requestedVelocity = {
              x: desiredHorizontalDelta.x / velocityDeltaSeconds,
              z: desiredHorizontalDelta.z / velocityDeltaSeconds,
            };
            const resolvedVelocity = {
              x: (movement.position.x - characterPosition.x) / velocityDeltaSeconds,
              z: (movement.position.z - characterPosition.z) / velocityDeltaSeconds,
            };
            const requestedSpeed = Math.hypot(requestedVelocity.x, requestedVelocity.z);
            if (
              impactDamageCooldown <= 0 &&
              Math.hypot(coverSnapDelta.x, coverSnapDelta.z) <= 0.0001
            ) {
              const velocityDrop = Math.hypot(
                requestedVelocity.x - resolvedVelocity.x,
                requestedVelocity.z - resolvedVelocity.z,
              );
              // Rapier may push a capsule back slightly while correcting contact
              // penetration. Do not turn that correction into more delta-v than
              // the player actually carried into the wall.
              const horizontalDeceleration = Math.min(requestedSpeed, velocityDrop);
              const collisionDamage = resolveImpactDamage(horizontalDeceleration);
              if (collisionDamage > 0) {
                damagePlayer(collisionDamage, { kind: "impact", id: "wall-collision" });
                impactDamageCooldown = COLLISION_DAMAGE_COOLDOWN_SECONDS;
              }
            }
          }
          knockImpactDelta = {
            x: desiredHorizontalDelta.x,
            y: 0,
            z: desiredHorizontalDelta.z,
          };
          knockCollisionCount = movement.collisions;
          let clampedPosition: PhysicsVector = {
            x: THREE.MathUtils.clamp(
              movement.position.x,
              activeWorldBounds.minX,
              activeWorldBounds.maxX,
            ),
            y: movement.position.y,
            z: THREE.MathUtils.clamp(
              movement.position.z,
              activeWorldBounds.minZ,
              activeWorldBounds.maxZ,
            ),
          };
          if (coverMode && coverWall !== null) {
            // The physics controller stops at the wall face but can slide past
            // the end of a thin box because there is no longer a side face to
            // collide with. Keep the cover capsule inside the engaged face's
            // tangent span so A/D cannot silently drop wall contact.
            clampedPosition = clampPlayerPositionToWallTangent(clampedPosition, coverWall);
          }
          if (
            movement.collisions === 0 &&
            isPlayerCapsulePositionClear(clampedPosition, traversalPhysicsBoxes)
          ) {
            lastSafePhysicsPosition = { ...clampedPosition };
          }
          const canUseAirborneTraversal =
            jumpInputActive &&
            !grounded &&
            (!movement.grounded || verticalVelocity > 0) &&
            jumpOffset > LEDGE_GRAB_MIN_FALL_OFFSET &&
            desiredHorizontalDelta.x ** 2 + desiredHorizontalDelta.z ** 2 > 0.0002;
          let vaultResolution: TraversalTargetResolution | null = null;
          let ledgeGrabResolution: TraversalTargetResolution | null = null;
          if (canUseAirborneTraversal) {
            const feetY = characterPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT;
            vaultResolution = resolveVaultTargetDetails(
              characterPosition,
              desiredHorizontalDelta,
              feetY,
              traversalPhysicsBoxes,
            );
            if (
              vaultResolution !== null &&
              (vaultResolution.target.y - PLAYER_COLLIDER_CENTER_HEIGHT - feetY >
                LOW_OBSTACLE_VAULT_MAX_HEIGHT ||
                !isPlayerCapsulePositionClear(vaultResolution.target, traversalPhysicsBoxes))
            ) {
              vaultResolution = null;
            }
            if (vaultResolution === null) {
              ledgeGrabResolution = resolveLedgeGrabTargetDetails(
                characterPosition,
                desiredHorizontalDelta,
                feetY,
                staticPhysicsBoxes,
                dynamicPhysicsBoxes.filter((box) => box.dynamic !== true),
              );
              if (
                ledgeGrabResolution !== null &&
                !isPlayerCapsulePositionClear(ledgeGrabResolution.target, traversalPhysicsBoxes)
              ) {
                ledgeGrabResolution = null;
              }
            }
          }
          let wallHangCandidate: WallHangResolution | null = null;
          const horizontalApproachDistance = Math.hypot(
            desiredHorizontalDelta.x,
            desiredHorizontalDelta.z,
          );
          const wallApproach =
            horizontalApproachDistance > WALL_HANG_EPSILON
              ? {
                  x: desiredHorizontalDelta.x / horizontalApproachDistance,
                  y: 0,
                  z: desiredHorizontalDelta.z / horizontalApproachDistance,
                }
              : null;
          const resolvedApproachDistance =
            wallApproach === null
              ? 0
              : (clampedPosition.x - characterPosition.x) * wallApproach.x +
                (clampedPosition.z - characterPosition.z) * wallApproach.z;
          const horizontalMotionBlocked =
            wallApproach !== null &&
            horizontalApproachDistance > 0.015 &&
            resolvedApproachDistance + WALL_HANG_EPSILON < horizontalApproachDistance;
          // Wall hanging is an approach traversal, not a generic collision
          // recovery. Rapier also reports floor, ceiling, and unrelated prop
          // contacts here; treating any of those as a wall contact lets the
          // resolver attach to a nearby face and degrades the ledge/vault UX.
          // Require the horizontal approach itself to be blocked before the
          // wall resolver is allowed to consider a candidate.
          if (
            jumpInputActive &&
            vaultResolution === null &&
            ledgeGrabResolution === null &&
            ledgeClimbTransition === null &&
            canUseAirborneTraversal &&
            wallApproach !== null &&
            horizontalMotionBlocked
          ) {
            // Streamed buildings and authored obstacle boxes live in the second
            // physics set. They are still static for traversal purposes; only
            // knocked props are marked dynamic and must not become hang points.
            wallHangCandidate = resolveWallHangTargetDetails(
              clampedPosition,
              wallApproach,
              traversalPhysicsBoxes,
            );
            wallHangCandidate ??= resolveWallHangTargetDetails(
              characterPosition,
              wallApproach,
              traversalPhysicsBoxes,
            );
            if (wallHangCandidate !== null) {
              const wallObstacleId = resolvePhysicsBoxObstacleId(wallHangCandidate.box);
              if (
                !movement.contacts.some(
                  (contact) => contact.kind === "wall" && contact.obstacleId === wallObstacleId,
                )
              ) {
                wallHangCandidate = null;
              }
            }
          }
          const contactNormal = wallApproach ?? ({ x: 0, y: 0, z: 0 } satisfies PhysicsVector);
          const traversalContacts: PlayerMovementContact[] = [];
          const addTargetContact = (
            kind: "vault" | "ledge",
            resolution: TraversalTargetResolution,
          ): void => {
            const climbHeight = Math.max(0, resolution.target.y - characterPosition.y);
            const traversalO2Cost = resolveVaultTraversalO2Cost(climbHeight);
            traversalContacts.push({
              kind,
              normal: { x: -contactNormal.x, y: 0, z: -contactNormal.z },
              obstacle: {
                id: resolution.obstacleId,
                topY: resolution.topY,
                clearanceValid: canAffordPlayerO2Cost(playerVitals, traversalO2Cost),
              },
              target: resolution.target,
            });
          };
          if (vaultResolution !== null) {
            addTargetContact("vault", vaultResolution);
          } else if (ledgeGrabResolution !== null) {
            addTargetContact("ledge", ledgeGrabResolution);
          } else if (wallHangCandidate !== null) {
            traversalContacts.push({
              kind: "wall",
              normal: wallHangCandidate.wallNormal,
              obstacle: {
                id: resolvePhysicsBoxObstacleId(wallHangCandidate.box),
                topY: wallHangCandidate.wallTopY,
                clearanceValid: true,
              },
              target: wallHangCandidate.target,
            });
          }
          const postPhysicsOutput = stepPlayerMovementController(movementControllerState, {
            phase: "post-physics",
            deltaSeconds: 0,
            seed: movementControllerSeed,
            direction: { right: right * inputScale, forward: forward * inputScale },
            currentVelocity: {
              right: strafeVelocity,
              up: verticalVelocity,
              forward: forwardVelocity,
            },
            grounded,
            sprint: sprintingMovement,
            sprintAffordable: !isSprinting || sprintingMovement,
            crouch: crouching,
            jump: jumpInputActive,
            walking: isWalkingMode,
            oxygen: playerVitals.o2,
            targetSpeedMetersPerSecond: currentMoveSpeed,
            contacts: traversalContacts,
            externalTraversal: null,
          });
          movementControllerState = postPhysicsOutput.state;
          container.dataset.playerMovementState = movementControllerState.movement.kind;
          const traversalRequest = postPhysicsOutput.traversalRequest;
          const requestedTargetResolution =
            traversalRequest?.kind === "vault" &&
            vaultResolution?.obstacleId === traversalRequest.obstacle.id
              ? vaultResolution
              : traversalRequest?.kind === "ledge-grab" &&
                  ledgeGrabResolution?.obstacleId === traversalRequest.obstacle.id
                ? ledgeGrabResolution
                : null;
          let climbTarget: PhysicsVector | null = null;
          let wallHangResolution: WallHangResolution | null = null;
          if (requestedTargetResolution !== null && ledgeClimbTransition === null) {
            const traversalTarget = requestedTargetResolution.target;
            const climbTraversalKind = traversalRequest?.kind === "vault" ? "vault" : "ledge-grab";
            // Use the feet height before this frame's physics move. A jump can
            // already be rising when the box is detected; timing and O₂ cost
            // from the post-move position would undercharge a measured vault.
            const climbHeight = Math.max(0, traversalTarget.y - characterPosition.y);
            const oxygenRatio = playerVitals.o2 / PLAYER_MAX_O2;
            const traversalO2Cost = resolveVaultTraversalO2Cost(climbHeight);
            if (!spendPlayerO2(traversalO2Cost, O2_JUMP_RECOVERY_DELAY_SECONDS)) {
              climbTarget = null;
            } else {
              const climbStartX = clampedPosition.x;
              const climbStartY = clampedPosition.y;
              const climbStartZ = clampedPosition.z;
              const clampedX = THREE.MathUtils.clamp(
                traversalTarget.x,
                activeWorldBounds.minX,
                activeWorldBounds.maxX,
              );
              const clampedZ = THREE.MathUtils.clamp(
                traversalTarget.z,
                activeWorldBounds.minZ,
                activeWorldBounds.maxZ,
              );
              const momentum = resolveLedgeClimbMomentum(
                desiredForward,
                desiredStrafe,
                forwardVelocity,
                strafeVelocity,
                isSprinting,
                moveSpeed,
              );
              const preservedSpeed = Math.hypot(
                momentum.preservedForwardVelocity,
                momentum.preservedStrafeVelocity,
              );
              const landingBoostDistance =
                preservedSpeed > 0
                  ? Math.min(LEDGE_CLIMB_EXIT_BOOST_DISTANCE, preservedSpeed * 0.05)
                  : 0;
              ledgeClimbTransition = {
                traversalKind: climbTraversalKind,
                sourceObstacleId: requestedTargetResolution.obstacleId,
                sourceGeometryKey: resolvePhysicsBoxGeometrySignature(
                  requestedTargetResolution.box,
                ),
                sourceBox: requestedTargetResolution.box,
                duration: resolveO2ScaledTraversalDuration(
                  resolveVaultTraversalDuration(climbHeight),
                  oxygenRatio,
                ),
                arcHeight: resolveVaultTraversalArcHeight(climbHeight),
                elapsed: 0,
                phase: "vault",
                traversalHeightMeters: climbHeight,
                startX: climbStartX,
                startY: climbStartY,
                startZ: climbStartZ,
                targetX: clampedX,
                targetY: traversalTarget.y,
                targetZ: clampedZ,
                preservedForwardVelocity: momentum.preservedForwardVelocity,
                preservedStrafeVelocity: momentum.preservedStrafeVelocity,
                preserveSprinting: momentum.preserveSprinting,
                landingBoostDistance,
              };
              climbTarget = traversalTarget;
              grounded = false;
              verticalVelocity = 0;
            }
          }
          if (
            traversalRequest?.kind === "wall-contact" &&
            wallHangCandidate !== null &&
            resolvePhysicsBoxObstacleId(wallHangCandidate.box) === traversalRequest.obstacle.id &&
            climbTarget === null
          ) {
            wallHangResolution = wallHangCandidate;
            const wallMomentum = resolveLedgeClimbMomentum(
              desiredForward,
              desiredStrafe,
              forwardVelocity,
              strafeVelocity,
              isSprinting,
              moveSpeed,
            );
            const attachment = physicsRuntime.move(clampedPosition, {
              x: wallHangResolution.target.x - clampedPosition.x,
              y: wallHangResolution.target.y - clampedPosition.y,
              z: wallHangResolution.target.z - clampedPosition.z,
            });
            const attached =
              Math.hypot(
                attachment.position.x - wallHangResolution.target.x,
                attachment.position.y - wallHangResolution.target.y,
                attachment.position.z - wallHangResolution.target.z,
              ) <= WALL_HANG_ATTACHMENT_TOLERANCE;
            if (attached) {
              clampedPosition = { ...attachment.position };
              wallHangState = {
                sourceObstacleId: resolvePhysicsBoxObstacleId(wallHangResolution.box),
                sourceGeometryKey: resolvePhysicsBoxGeometrySignature(wallHangResolution.box),
                target: attachment.position,
                wallNormal: wallHangResolution.wallNormal,
                wallFacePoint: wallHangResolution.wallFacePoint,
                wallTopY: wallHangResolution.wallTopY,
                box: wallHangResolution.box,
                approachDirection: {
                  x: desiredHorizontalDelta.x / horizontalApproachDistance,
                  y: 0,
                  z: desiredHorizontalDelta.z / horizontalApproachDistance,
                },
                preservedForwardVelocity: wallMomentum.preservedForwardVelocity,
                preservedStrafeVelocity: wallMomentum.preservedStrafeVelocity,
                preserveSprinting: wallMomentum.preserveSprinting,
                elapsed: 0,
              };
              wallHangElapsed = 0;
              grounded = false;
              verticalVelocity = 0;
              forwardVelocity = 0;
              strafeVelocity = 0;
            } else {
              queueTraversalFeedback("wall-contact", traversalRequest.obstacle.id, "cancelled");
              wallHangResolution = null;
            }
          }
          physicsCharacterPosition = clampedPosition;
          grounded =
            wallHangResolution !== null
              ? false
              : climbTarget === null
                ? movement.grounded && verticalVelocity <= 0
                : false;
          resolvedWorldVelocity =
            climbTarget !== null || wallHangResolution !== null
              ? { x: 0, y: 0, z: 0 }
              : {
                  x: (clampedPosition.x - characterPosition.x) / velocityDeltaSeconds,
                  y: grounded ? 0 : verticalVelocity,
                  z: (clampedPosition.z - characterPosition.z) / velocityDeltaSeconds,
                };
          if (
            !wasGrounded &&
            movement.grounded &&
            climbTarget === null &&
            wallHangResolution === null
          ) {
            applyLandingO2(maximumFallSpeed);
          }
          if (grounded) {
            maximumFallSpeed = 0;
          }
          jumpOffset = Math.max(0, clampedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
          if (grounded && verticalVelocity < 0) {
            verticalVelocity = 0;
          }
          camera.position.x = clampedPosition.x;
          camera.position.z = clampedPosition.z;
          baseCameraY = clampedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
          if (ledgeClimbTransition !== null) {
            const transition = ledgeClimbTransition;
            const sourceBox = resolveTraversalSourceBox(transition.sourceObstacleId);
            const destination = {
              x: transition.targetX,
              y: transition.targetY,
              z: transition.targetZ,
            };
            if (
              sourceBox === null ||
              resolvePhysicsBoxGeometrySignature(sourceBox) !== transition.sourceGeometryKey ||
              !isPlayerCapsulePositionClear(destination, traversalPhysicsBoxes)
            ) {
              queueTraversalFeedback(
                transition.traversalKind,
                transition.sourceObstacleId,
                "cancelled",
              );
              ledgeClimbTransition = null;
            } else {
              transition.sourceBox = sourceBox;
              transition.elapsed = Math.min(transition.elapsed + delta, transition.duration);
              const transitionY = resolveClimbingTransitionY(transition, transition.elapsed);
              const progress = smoothStep(
                THREE.MathUtils.clamp(transition.elapsed / transition.duration, 0, 1),
              );
              const transitionX = THREE.MathUtils.lerp(
                transition.startX,
                transition.targetX,
                progress,
              );
              const transitionZ = THREE.MathUtils.lerp(
                transition.startZ,
                transition.targetZ,
                progress,
              );
              const proposedPosition: PhysicsVector = {
                x: transitionX,
                y: transitionY,
                z: transitionZ,
              };
              const traversalStart = physicsCharacterPosition;
              const traversalMovement = physicsRuntime.move(traversalStart, {
                x: proposedPosition.x - traversalStart.x,
                y: proposedPosition.y - traversalStart.y,
                z: proposedPosition.z - traversalStart.z,
              });
              const traversalPosition = traversalMovement.position;
              const traversalBlocked =
                traversalMovement.collisions > 0 &&
                Math.hypot(
                  traversalPosition.x - proposedPosition.x,
                  traversalPosition.y - proposedPosition.y,
                  traversalPosition.z - proposedPosition.z,
                ) > 0.025 &&
                !(
                  traversalMovement.contacts.length > 0 &&
                  traversalMovement.contacts.every(
                    (contact) => contact.obstacleId === transition.sourceObstacleId,
                  )
                );
              verticalVelocity = (traversalPosition.y - traversalStart.y) / velocityDeltaSeconds;
              resolvedWorldVelocity = {
                x: (traversalPosition.x - traversalStart.x) / velocityDeltaSeconds,
                y: verticalVelocity,
                z: (traversalPosition.z - traversalStart.z) / velocityDeltaSeconds,
              };
              camera.position.x = traversalPosition.x;
              camera.position.z = traversalPosition.z;
              baseCameraY = resolveLedgeClimbTargetCameraY(traversalPosition.y);
              jumpOffset = Math.max(0, traversalPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
              forwardVelocity = transition.preservedForwardVelocity;
              strafeVelocity = transition.preservedStrafeVelocity;
              physicsCharacterPosition = traversalPosition;
              if (traversalBlocked) {
                queueTraversalFeedback(
                  transition.traversalKind,
                  transition.sourceObstacleId,
                  "cancelled",
                );
                ledgeClimbTransition = null;
                grounded = traversalMovement.grounded;
              } else if (transition.elapsed >= transition.duration) {
                if (transition.phase === "vault" && transition.landingBoostDistance > 0) {
                  const preservedSpeed = Math.hypot(
                    transition.preservedForwardVelocity,
                    transition.preservedStrafeVelocity,
                  );
                  const boostDirectionForward =
                    preservedSpeed > 0 ? transition.preservedForwardVelocity / preservedSpeed : 0;
                  const boostDirectionRight =
                    preservedSpeed > 0 ? transition.preservedStrafeVelocity / preservedSpeed : 0;
                  const landingTargetX =
                    transition.targetX + boostDirectionForward * transition.landingBoostDistance;
                  const landingTargetZ =
                    transition.targetZ + boostDirectionRight * transition.landingBoostDistance;
                  transition.startX = traversalPosition.x;
                  transition.startY = traversalPosition.y;
                  transition.startZ = traversalPosition.z;
                  transition.targetX = landingTargetX;
                  transition.targetZ = landingTargetZ;
                  transition.duration = LEDGE_CLIMB_EXIT_BOOST_DURATION;
                  transition.elapsed = 0;
                  transition.phase = "landingBoost";
                } else {
                  const targetPosition: PhysicsVector = {
                    x: transition.targetX,
                    y: transition.targetY,
                    z: transition.targetZ,
                  };
                  const landing = physicsRuntime.move(traversalPosition, {
                    x: targetPosition.x - traversalPosition.x,
                    y: targetPosition.y - traversalPosition.y - PLAYER_SUPPORT_SNAP_HEIGHT,
                    z: targetPosition.z - traversalPosition.z,
                  });
                  const landedPosition = landing.position;
                  const landingCompleted =
                    landing.grounded &&
                    landing.contacts.some(
                      (contact) =>
                        contact.kind === "support" &&
                        contact.obstacleId === transition.sourceObstacleId,
                    ) &&
                    Math.hypot(
                      landedPosition.x - targetPosition.x,
                      landedPosition.y - targetPosition.y,
                      landedPosition.z - targetPosition.z,
                    ) <= 0.025;
                  queueTraversalFeedback(
                    transition.traversalKind,
                    transition.sourceObstacleId,
                    landingCompleted ? "completed" : "cancelled",
                  );
                  ledgeClimbTransition = null;
                  grounded = landing.grounded;
                  verticalVelocity = 0;
                  jumpOffset = Math.max(0, landedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
                  physicsCharacterPosition = landedPosition;
                  camera.position.set(
                    landedPosition.x,
                    resolveLedgeClimbTargetCameraY(landedPosition.y),
                    landedPosition.z,
                  );
                  resolvedWorldVelocity = { x: 0, y: 0, z: 0 };
                }
              }
            }
          }
        }
      } else {
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x,
          activeWorldBounds.minX,
          activeWorldBounds.maxX,
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z,
          activeWorldBounds.minZ,
          activeWorldBounds.maxZ,
        );
        const wasGrounded = grounded;
        if (!grounded || jumpOffset > 0) {
          verticalVelocity -= GRAVITY * delta;
          if (!wasGrounded) {
            maximumFallSpeed = Math.max(maximumFallSpeed, Math.max(0, -verticalVelocity));
          }
          jumpOffset += verticalVelocity * delta;
          if (jumpOffset <= 0) {
            jumpOffset = 0;
            if (!wasGrounded) {
              applyLandingO2(maximumFallSpeed);
              maximumFallSpeed = 0;
            }
            verticalVelocity = 0;
            grounded = true;
          }
        }
        baseCameraY = firstPersonGroundY + eyeHeight + jumpOffset;
        resolvedWorldVelocity = {
          x: (camera.position.x - movementStart.x) / velocityDeltaSeconds,
          y: grounded ? 0 : verticalVelocity,
          z: (camera.position.z - movementStart.z) / velocityDeltaSeconds,
        };
      }
      const wallContactPosition = physicsCharacterPosition ?? {
        x: camera.position.x,
        y: camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
        z: camera.position.z,
      };
      const wallContactBoxes =
        dynamicPhysicsBoxes.length === 0
          ? staticPhysicsBoxes
          : [...staticPhysicsBoxes, ...dynamicPhysicsBoxes];
      wallContact = resolvePlayerWallContact(wallContactPosition, wallContactBoxes, {
        radius: PLAYER_COLLIDER_RADIUS,
        halfHeight: PLAYER_COLLIDER_HALF_HEIGHT,
      });
      wallProximity = resolvePlayerWallContactInFacingCone(
        wallContactPosition,
        cameraMotionForward,
        wallContactBoxes,
        {
          radius: PLAYER_COLLIDER_RADIUS,
          halfHeight: PLAYER_COLLIDER_HALF_HEIGHT,
        },
        PLAYER_WALL_COVER_RANGE_METERS,
      );
      touchingWall = wallContact !== null;
      const wasCoverMode = coverMode;
      coverMode = resolveCoverModeFromAimTransition(
        coverMode,
        coverActivationPending,
        aimingDownSightsRequested,
        wallProximity !== null,
      );
      if (!coverMode) {
        coverWall = null;
        coverSnapTarget = null;
      } else if (!wasCoverMode) {
        coverWall = coverActivationPendingWall ?? wallProximity ?? wallContact;
        coverSnapTarget =
          coverWall === null
            ? null
            : resolvePlayerWallSnapTarget(wallContactPosition, coverWall, {
                radius: PLAYER_COLLIDER_RADIUS,
                halfHeight: PLAYER_COLLIDER_HALF_HEIGHT,
              });
      } else if (coverWall === null) {
        coverWall = wallProximity ?? wallContact;
        coverSnapTarget =
          coverWall === null
            ? null
            : resolvePlayerWallSnapTarget(wallContactPosition, coverWall, {
                radius: PLAYER_COLLIDER_RADIUS,
                halfHeight: PLAYER_COLLIDER_HALF_HEIGHT,
              });
      }
      if (touchingWall) {
        coverSnapTarget = null;
      }
      // Wall bracing remains the independent physical side-contact signal;
      // the facing cone gates only cover-source selection and wall sticking.
      wallBracedAim = aimingDownSights && (touchingWall || coverMode);
      coverActivationPending = false;
      coverActivationPendingWall = null;
      // Input can remain held against a wall edge after the controller has
      // clamped the capsule. Drive gait, O₂ workload, and the viewmodel's
      // movement factor from the resolved horizontal velocity so a blocked
      // strafe does not keep producing a walking bounce.
      const resolvedHorizontalSpeed = Math.hypot(resolvedWorldVelocity.x, resolvedWorldVelocity.z);
      const movementReferenceSpeed =
        currentMoveSpeed > Number.EPSILON ? currentMoveSpeed : maxMoveSpeed;
      movementMagnitude = THREE.MathUtils.clamp(
        resolvedHorizontalSpeed / movementReferenceSpeed,
        0,
        1,
      );
      movementSpeedRatio = THREE.MathUtils.clamp(resolvedHorizontalSpeed / maxMoveSpeed, 0, 1);
      movementMagnitudeActivity = movementMagnitude;
      locomotionBlendActivity = crouching
        ? 0
        : THREE.MathUtils.clamp(
            (movementSpeedRatio - WALK_SPEED_RATIO) / (1 - WALK_SPEED_RATIO),
            0,
            1,
          );
      exerciseIntensity = THREE.MathUtils.clamp(
        movementMagnitude * (crouching ? 1 : movementSpeedRatio),
        0,
        1,
      );
      if (!grounded) {
        exerciseIntensity = Math.max(exerciseIntensity, 0.25);
      }
      sprintingActivity = !crouching && movementMagnitude > 0.05 && sprintingMovement;
      crouchWalkingActivity = crouching && movementMagnitude > 0.05;
      walkingActivity =
        !crouching && movementMagnitude > 0.05 && !sprintingActivity && !isWallTraversalActive;
      const supportStop =
        resolvedWorldVelocity.y === 0 &&
        previousPresentationWorldVelocity.y < -Number.EPSILON &&
        (grounded ||
          wallHangState !== null ||
          ledgeClimbTransition !== null ||
          wallClimbTransition !== null);
      presentationWorldVelocity = resolvedWorldVelocity;
      // PointerLockControls moves parallel to the world XZ plane. Use the
      // same yaw-only body basis for delta-v projection; looking up or down
      // must not turn horizontal braking into a fake vertical load. Vertical
      // acceleration remains world-up, which gives the full signed six-way
      // response without inventing a camera-pitch axis.
      cameraMotionRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      cameraMotionRight.y = 0;
      if (cameraMotionRight.lengthSq() > 0.0001) {
        cameraMotionRight.normalize();
      } else {
        cameraMotionRight.set(1, 0, 0);
      }
      cameraMotionForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      cameraMotionForward.y = 0;
      if (cameraMotionForward.lengthSq() > 0.0001) {
        cameraMotionForward.normalize();
      } else {
        cameraMotionForward.set(0, 0, -1);
      }
      cameraMotionUp.set(0, 1, 0);
      const cameraMotionFrame: CameraLocalFrame = {
        right: cameraMotionRight,
        forward: cameraMotionForward,
        up: cameraMotionUp,
      };
      const localAcceleration: CameraLocalAcceleration =
        resolveCameraLocalAccelerationFromVelocityDelta(
          resolvedWorldVelocity,
          previousPresentationWorldVelocity,
          velocityDeltaSeconds,
          cameraMotionFrame,
        );
      // The impulse stream is local to the yaw-only body frame. Project the
      // resolved physics delta once before the shared head solver consumes it.
      const resolvedLocalDeltaVelocity = {
        right: localAcceleration.right * velocityDeltaSeconds,
        up: localAcceleration.up * velocityDeltaSeconds,
        forward: localAcceleration.forward * velocityDeltaSeconds,
      };
      const hasHorizontalDeltaVelocity =
        Math.abs(resolvedLocalDeltaVelocity.right) > Number.EPSILON ||
        Math.abs(resolvedLocalDeltaVelocity.forward) > Number.EPSILON;
      const activeTraversal =
        ledgeClimbTransition !== null && ledgeClimbTransition.phase === "vault"
          ? {
              duration: ledgeClimbTransition.duration,
            }
          : wallClimbTransition !== null && wallClimbTransition.phase === "vault"
            ? {
                duration: wallClimbTransition.duration,
              }
            : null;
      const headImpulse: HeadImpulse | undefined = supportStop
        ? { source: "support-stop", deltaVelocity: resolvedLocalDeltaVelocity }
        : controllerOutput.jumpAction !== null
          ? { source: "take-off", deltaVelocity: resolvedLocalDeltaVelocity }
          : activeTraversal !== null
            ? { source: "traversal", deltaVelocity: resolvedLocalDeltaVelocity }
            : hasHorizontalDeltaVelocity
              ? {
                  source: "locomotion",
                  deltaVelocity: {
                    ...resolvedLocalDeltaVelocity,
                    // Airborne gravity is not a repeated impact. Let only
                    // explicit take-off, traversal, and support events carry
                    // vertical delta-v into the head solver.
                    up: grounded ? resolvedLocalDeltaVelocity.up : 0,
                  },
                }
              : undefined;
      const presentationCapsulePosition = physicsCharacterPosition ?? {
        x: camera.position.x,
        y: baseCameraY - eyeHeight + PLAYER_COLLIDER_CENTER_HEIGHT,
        z: camera.position.z,
      };
      activeFirstPersonBaseCameraY = baseCameraY;
      applyFirstPersonCameraMotion(baseCameraY, {
        deltaSeconds: delta,
        localAcceleration: debugCameraShiftEnabled
          ? localAcceleration
          : { right: 0, forward: 0, up: localAcceleration.up },
        movementMagnitude,
        movementSpeedRatio,
        oxygenRatio: playerVitals.o2 / PLAYER_MAX_O2,
        crouching,
        shiftEnabled: debugCameraShiftEnabled,
        bobEnabled: debugCameraBobEnabled,
        aimingDownSights,
        holdingBreath: playerVitals.holdingBreath,
        stabilizedByWall: wallBracedAim,
        coverMode,
        coverLean: resolveCoverLeanInput(coverMode, right),
        grounded,
        ...(headImpulse === undefined ? {} : { headImpulse }),
        suppressContinuousVerticalImpulse: true,
        verticalOffsetBounds: resolveCameraVerticalOffsetBounds(
          presentationCapsulePosition,
          baseCameraY,
          wallContactBoxes,
        ),
        traversalActive: activeTraversal !== null,
        ...(activeTraversal?.duration === undefined
          ? {}
          : { traversalDurationSeconds: activeTraversal.duration }),
      });
    } else {
      activeFirstPersonBaseCameraY = null;
      exerciseIntensity = 0;
      movementMagnitudeActivity = 0;
      locomotionBlendActivity = 0;
      sprintingActivity = false;
      crouchWalkingActivity = false;
      walkingActivity = false;
      crouchedActivity = false;
      forwardVelocity = THREE.MathUtils.damp(forwardVelocity, 0, 10, delta);
      strafeVelocity = THREE.MathUtils.damp(strafeVelocity, 0, 10, delta);
      // OrbitControls retains its own spherical state from the composed table
      // preset. Do not let it overwrite a restored first-person position while
      // the seat view is waiting for pointer lock (or while touch controls are
      // about to take over).
      if (activeView === "overhead" || !firstPersonControls.enabled) {
        orbitControls.update();
      }
      resetCameraMotion();
    }
    publishPlayerSpeed(Math.hypot(forwardVelocity, strafeVelocity));
    publishSprintingActivity(sprintingActivity);
    const cameraPosition: VisualSceneVector3 = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ];
    const physicsPositionIsUnrecoverable =
      physicsCharacterPosition !== null &&
      (!Number.isFinite(physicsCharacterPosition.x) ||
        !Number.isFinite(physicsCharacterPosition.y) ||
        !Number.isFinite(physicsCharacterPosition.z) ||
        physicsCharacterPosition.y < VISUAL_SCENE_FALL_RESET_Y);
    if (!isVisualScenePositionRecoverable(cameraPosition) || physicsPositionIsUnrecoverable) {
      resetToSpawn();
    }
    container.dataset.wallTraversal =
      wallClimbTransition !== null ? "climbing" : wallHangState !== null ? "hanging" : "none";
    container.dataset.playerWallContact = touchingWall ? "true" : "false";
    container.dataset.playerWallBraced = wallBracedAim ? "true" : "false";
    container.dataset.playerCoverMode = coverMode ? "true" : "false";
    camera.updateMatrixWorld(true);
    weaponRuntime?.update(
      delta,
      camera.position,
      getAimRay(),
      getAimRay,
      firstPersonActive,
      activeView === "seat" && firstPersonControls.enabled,
      firstPersonPresentation.viewmodelOffset,
      () => firstPersonPresentation.viewmodelRecoilDepth,
      firstPersonPresentation.viewmodelTransition,
      meleeRuntime?.isActive() ?? false,
      presentationWorldVelocity,
      !grounded,
    );
    meleeRuntime?.update(
      delta,
      camera.position,
      getAimRay(),
      getAimRay,
      firstPersonActive,
      activeView === "seat" && firstPersonControls.enabled,
      presentationWorldVelocity,
      !grounded,
      firstPersonPresentation.viewmodelOffset,
      firstPersonPresentation.viewmodelTransition,
    );
    // Weapon viewmodel transforms (including the camera-child scope glass)
    // changed during the update above. Refresh their world matrices before
    // projecting the lens into the post-process buffer.
    camera.updateMatrixWorld(true);
    const cameraMotionOffsets = cameraMotion.getOffsets();
    const reticlePresentation = getReticlePresentation();
    setO2BlurPassCenter(
      o2BlurPass,
      (reticlePresentation.aimNdc.x + 1) * 0.5,
      (reticlePresentation.aimNdc.y + 1) * 0.5,
    );
    setO2BlurPassPixels(
      o2BlurPass,
      cameraMotionOffsets.screenBlurPixels * renderer.getPixelRatio(),
    );
    setO2BlurPassVignette(o2BlurPass, cameraMotionOffsets.screenVignetteStrength);
    updateDamageVignettePulses(
      delta,
      (reticlePresentation.aimNdc.x + 1) * 0.5,
      (reticlePresentation.aimNdc.y + 1) * 0.5,
    );
    updateMeleeImpactFlashes(delta);
    container.dataset.o2VisionBlur = cameraMotionOffsets.screenBlurPixels.toFixed(3);
    container.dataset.o2VisionVignette = cameraMotionOffsets.screenVignetteStrength.toFixed(3);
    container.dataset.o2VisionContrast = cameraMotionOffsets.screenContrastMultiplier.toFixed(3);
    container.dataset.o2VisionPass = o2BlurPass.enabled ? "true" : "false";
    const sniperScopeLens = weaponRuntime?.getSniperScopeLens() ?? null;
    const sniperScopeEnabled = shouldEnableSniperScope({
      firstPersonActive,
      seatView: activeView === "seat",
      aimingDownSights,
      lensAvailable: sniperScopeLens !== null,
    });
    const sniperScopeProjection = resolveSniperScopeProjection({
      enabled: sniperScopeEnabled,
      camera,
      lensAnchor: sniperScopeLens?.anchor ?? null,
      lensRadius: sniperScopeLens?.radius ?? 0,
      ...(sniperScopeLens === null ? {} : { magnification: sniperScopeLens.magnification }),
      viewportWidth: renderer.domElement.width,
      viewportHeight: renderer.domElement.height,
    });
    applySniperScopeProjection(sniperScopePass, sniperScopeProjection);
    container.dataset.sniperScopeActive = sniperScopeProjection.enabled ? "true" : "false";
    if (sniperScopeProjection.enabled) {
      renderSniperScopeWorld(sniperScopeProjection);
    }
    // The focus lab is part of the same streamed world, so moving through it
    // must continue loading and retaining the surrounding development map.
    explorationWorld?.update(camera.position);
    explorationWorld?.updateKnockables(
      delta,
      camera.position,
      knockImpactDelta,
      knockCollisionCount,
      grounded,
      physicsRuntime?.getDynamicBodyStates() ?? [],
      physicsRuntime?.applyImpulseToDynamicBody,
    );
    const nextPhysicsVersion = explorationWorld?.getPhysicsVersion() ?? 0;
    if (physicsRuntime !== null && nextPhysicsVersion !== appliedPhysicsVersion) {
      const nextPhysicsBoxes = explorationWorld?.getPhysicsBoxes() ?? [];
      physicsRuntime.setDynamicBoxes(nextPhysicsBoxes);
      dynamicPhysicsBoxes = nextPhysicsBoxes;
      appliedPhysicsVersion = nextPhysicsVersion;
    }
    loadedExplorationChunks = explorationWorld?.getLoadedChunkCount() ?? 0;
    saveSceneState();
    let centerFocusHit: THREE.Intersection | undefined;
    let tileFocusHit: THREE.Intersection | undefined;
    const focusTrackingEnabled =
      debugBokehEnabled || meleeFocusSeverity > 0.001 || meleeDofBoostRemainingSeconds > 0.001;
    bokehPass.enabled = focusTrackingEnabled;
    if (focusTrackingEnabled) {
      const reticlePresentation = getReticlePresentation();
      reticleAimNdc.set(reticlePresentation.aimNdc.x, reticlePresentation.aimNdc.y);
      centerFocusHit = findVisibleFocusIntersection(reticleAimNdc);
      tileFocusHit =
        centerFocusHit !== undefined && isDofFocusTarget(centerFocusHit.object)
          ? centerFocusHit
          : undefined;
    }
    // Focus uses the exact same NDC as the visible centre dot and gameplay
    // ray. A nearby tile must not pull focus away from the reticle ray.
    const focusHit = tileFocusHit ?? centerFocusHit;
    const baseFocusDistance = focusHit?.distance ?? BOKEH_FOCUS_FALLBACK_DISTANCE;
    const nextFocusDistance = resolveMeleeImpactFocusDistance(
      baseFocusDistance,
      meleeFocusSeverity,
    );
    focusTarget = debugBokehEnabled
      ? tileFocusHit !== undefined
        ? "tile"
        : centerFocusHit !== undefined
          ? "surface"
          : "fallback"
      : "fallback";
    focusDistance =
      meleeFocusSeverity >= 0.999
        ? nextFocusDistance
        : THREE.MathUtils.damp(
            focusDistance,
            nextFocusDistance,
            resolveFocusAccommodationDamping(focusDistance, nextFocusDistance, pupilDiameterMm),
            delta,
          );
    pupilDiameterMm = THREE.MathUtils.damp(
      pupilDiameterMm,
      resolveHumanEyePupilDiameter(
        resolveHumanEyeAdaptationLuminance(estimatedLuminance, isCleanSlateMap),
      ),
      BOKEH_PUPIL_ADAPTATION_DAMPING,
      delta,
    );
    const bokeh = resolveHumanEyeBokeh(focusDistance, pupilDiameterMm);
    const bokehStrength =
      meleeDofBoostRemainingSeconds > 0.001
        ? debugBokehStrength * MELEE_IMPACT_DOF_INTENSITY_MULTIPLIER
        : debugBokehStrength;
    bokehIntensity = bokeh.intensity * bokehStrength;
    const focusUniform = bokehPass.materialBokeh.uniforms.focus;
    if (focusUniform !== undefined) {
      focusUniform.value = focusDistance;
    }
    const apertureUniform = bokehPass.materialBokeh.uniforms.aperture;
    const maxBlurUniform = bokehPass.materialBokeh.uniforms.maxblur;
    if (apertureUniform !== undefined) {
      apertureUniform.value = bokeh.aperture * bokehStrength;
    }
    if (maxBlurUniform !== undefined) {
      maxBlurUniform.value = bokeh.maxBlur * bokehStrength;
    }
    if (debugBoundsVisible) {
      const boundsRoot = getDebugBoundsRoot();
      if (boundsRoot !== null) {
        for (const helper of boundsRoot.children) {
          if (helper instanceof THREE.BoxHelper) {
            helper.update();
          }
        }
      }
    }
    composer.render();
    animationFrame = window.requestAnimationFrame(animate);
  };
  animate();
  // Keep readiness on our own cancellable frame. The first render remains the
  // safe fallback when lazy shader compilation fails or the context is lost;
  // no synchronous compile is forced on software WebGL.
  let readyFrame = 0;
  let warmupTimer = window.setTimeout(() => {
    warmupTimer = 0;
    if (disposed) {
      return;
    }
    // Do not force a synchronous shader compile here. Browsers can compile
    // lazily during the first render; forcing it blocks the main thread on
    // software WebGL and can make the page appear unresponsive.
    readyFrame = window.requestAnimationFrame(() => {
      readyFrame = 0;
      if (!disposed) {
        container.dataset.sceneReady = "true";
        options.onReady?.();
      }
    });
  }, 0);

  return {
    setView,
    requestMotionLook,
    setMotionLookEnabled,
    setTouchMovementVector,
    toggleCrouch,
    setJumpInput,
    recoverPlayer: () => recoverPlayerFromGeometry(),
    fire: () => {
      if (meleeRuntime?.isActive()) {
        if (aimingDownSightsRequested || aimingDownSights) {
          throwMeleeObjectAndRearmGun();
        } else {
          triggerMeleeAttack();
        }
        return;
      }
      weaponRuntime?.fire(capturePreActionAimRay());
    },
    melee: () => {
      triggerMeleeAttack();
    },
    setReticleEnabled: (enabled) => weaponRuntime?.setReticleEnabled(enabled),
    reload: () => weaponRuntime?.reload(),
    interact: () => {
      const meleeActive = meleeRuntime?.isActive() ?? false;
      const gunNearby = (weaponRuntime?.getSnapshot().nearbyPickup ?? null) !== null;
      if (meleeActive || gunNearby) {
        runGunActionWithMeleeHandoff(() => weaponRuntime?.interact() ?? false);
      } else if (!meleeRuntime?.interact()) {
        weaponRuntime?.interact();
      }
    },
    cycleWeapon: (direction = 1) =>
      runGunActionWithMeleeHandoff(() => weaponRuntime?.cycleWeapon(direction) ?? false),
    dropActiveWeapon: () => {
      if (!meleeRuntime?.isActive()) {
        weaponRuntime?.dropActiveWeapon();
      } else {
        dropMeleeObjectAndRearmGun();
      }
    },
    cycleWeaponTo: (weapon) =>
      runGunActionWithMeleeHandoff(() => weaponRuntime?.cycleWeaponTo(weapon) ?? false),
    setReticlePosition: setFocusReticle,
    getReticlePresentation,
    getAimRay,
    applyDamage: damagePlayer,
    getVitals: () => playerVitals,
    resetVitals: resetVitalsState,
    debug: {
      setAreaEnabled: setDebugAreaEnabled,
      setCameraPreset: setDebugCameraPreset,
      setFov: setDebugFov,
      setExposure: setDebugExposure,
      setToneMapper: setDebugToneMapper,
      setFogDensity: setDebugFogDensity,
      setSunDirection: setDebugSunDirection,
      setSunIntensity: setDebugSunIntensity,
      setEnvironmentIntensity: setDebugEnvironmentIntensity,
      setEnvironmentRotation: setDebugEnvironmentRotation,
      setRedAccentIntensity: setDebugRedAccentIntensity,
      setCyanEmissiveIntensity: setDebugCyanEmissiveIntensity,
      setShadowQuality: setDebugShadowQuality,
      setDprCap: setDebugDprCap,
      setQualityMode: setDebugQualityMode,
      setBokehEnabled: setDebugBokehEnabled,
      setBokehIntensity: setDebugBokehIntensity,
      setAmbientOcclusionEnabled: setDebugAmbientOcclusionEnabled,
      setAutoExposureEnabled: setDebugAutoExposureEnabled,
      setAmbientAnimationRate: setDebugAmbientAnimationRate,
      setGlassMode: setDebugGlassMode,
      setCameraShiftEnabled: setDebugCameraShiftEnabled,
      setCameraBobEnabled: setDebugCameraBobEnabled,
      setWireframe: setDebugWireframe,
      setBoundsVisible: setDebugBoundsVisible,
      resetDefaults: resetDebugPreferences,
      /**
       * Teleport the camera to the focus‑calibration platform.
       * This is exposed on the `debug` API so UI components can call
       * `mount.debug.teleportToFocusLab()` to instantly move the view to the
       * ramp used for focus calibration.
       */
      teleportToFocusLab: () => {
        if (focusCalibrationRoot !== null) {
          const worldPos = new THREE.Vector3();
          focusCalibrationRoot.getWorldPosition(worldPos);
          // The main Three.js camera used for rendering is the `camera`
          // variable defined earlier in this module. We copy the world
          // position of the ramp and orient the camera to look at that point.
          camera.position.copy(worldPos);
          camera.lookAt(worldPos);
          camera.updateMatrixWorld(true);
        }
      },
      getSnapshot: getDebugSnapshot,
    },
    anchors,
    dispose: () => {
      saveSceneState(true);
      publishPlayerSpeed(0, true);
      disposed = true;
      cancelDeathRespawn();
      clearMeleeImpactFlashes();
      deathFadeOverlay.remove();
      window.cancelAnimationFrame(animationFrame);
      if (warmupTimer !== 0) {
        window.clearTimeout(warmupTimer);
        warmupTimer = 0;
      }
      if (readyFrame !== 0) {
        window.cancelAnimationFrame(readyFrame);
        readyFrame = 0;
      }
      if (resizeFrame !== 0) {
        window.cancelAnimationFrame(resizeFrame);
      }
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener(MAHJONG_TABLE_HMR_SAVE_EVENT, onHotModuleDispose);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("mouseup", onWindowMouseUp);
      if (orientationListenerAttached) {
        detachOrientationListener();
      }
      renderer.domElement.removeEventListener("click", onCanvasClick);
      renderer.domElement.removeEventListener("mousedown", onCanvasMouseDown);
      renderer.domElement.removeEventListener("contextmenu", preventTouchTextMenu);
      renderer.domElement.removeEventListener("selectstart", preventTouchTextMenu);
      renderer.domElement.removeEventListener("pointerdown", onSwipePointerDown);
      renderer.domElement.removeEventListener("pointermove", onSwipePointerMove);
      renderer.domElement.removeEventListener("pointerup", onSwipePointerEnd);
      renderer.domElement.removeEventListener("pointercancel", onSwipePointerEnd);
      firstPersonControls.removeEventListener("lock", onControlsLock);
      firstPersonControls.removeEventListener("unlock", onControlsUnlock);
      if (firstPersonControls.isLocked) {
        firstPersonControls.unlock();
      }
      firstPersonControls.dispose();
      orbitControls.dispose();
      timer.dispose();
      physicsRuntime?.dispose();
      physicsRuntime = null;
      physicsCharacterPosition = null;
      if (simulantRespawnTimer !== 0) {
        window.clearTimeout(simulantRespawnTimer);
        simulantRespawnTimer = 0;
      }
      const disposedSimulantMarker = simulantMarker;
      disposedSimulantMarker?.removeFromParent();
      if (disposedSimulantMarker !== null) {
        disposeObject(disposedSimulantMarker);
      }
      simulantMarker = null;
      simulantBody = null;
      simulantBodyParts = null;
      simulantRing = null;
      simulantRagdollState = null;
      const disposedPlayerRagdollMarker = playerRagdollMarker;
      disposedPlayerRagdollMarker?.removeFromParent();
      if (disposedPlayerRagdollMarker !== null) {
        disposeObject(disposedPlayerRagdollMarker);
      }
      playerRagdollMarker = null;
      playerRagdollBody = null;
      playerRagdollBodyParts = null;
      playerRagdollState = null;
      weaponRuntime?.dispose();
      weaponRuntime = null;
      meleeRuntime?.dispose();
      meleeRuntime = null;
      explorationWorld?.dispose();
      explorationWorld = null;
      disposeObject(scene);
      for (const texture of debuggingTwoMap?.textures ?? []) {
        texture.dispose();
      }
      simpleGlassMaterial.dispose();
      physicalGlassMaterial.dispose();
      environmentTexture.dispose();
      disposeObject(roomEnvironment);
      pmremGenerator.dispose();
      gtaoPass.dispose();
      bokehPass.dispose();
      sniperScopePass.dispose();
      o2BlurPass.dispose();
      clearDamageVignettePulses();
      sniperScopeSceneTarget.dispose();
      composer.dispose();
      architectureResources.teacherTexture.dispose();
      architectureResources.weaponChartTexture.dispose();
      const surfaceTextures: readonly THREE.CanvasTexture[] = [
        architectureResources.surfaceTextures.floor,
        architectureResources.surfaceTextures.wall,
        architectureResources.surfaceTextures.table,
        architectureResources.surfaceTextures.wood,
        architectureResources.surfaceTextures.fabric,
        architectureResources.surfaceTextures.detail,
      ];
      for (const texture of surfaceTextures) {
        texture.dispose();
      }
      if (textureCache !== null) {
        textureCache.back.dispose();
        for (const texture of textureCache.face.values()) {
          texture.dispose();
        }
      }
      for (const label of [...seatLabels, ...focusCalibrationLabels, ...parametricCampusLabels]) {
        const material = label.material;
        if (material instanceof THREE.SpriteMaterial) {
          material.map?.dispose();
        }
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
