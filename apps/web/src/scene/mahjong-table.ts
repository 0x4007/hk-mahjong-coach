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

import authoredVisualMapInput from "./maps/penthouse.json" with { type: "json" };
import {
  generateWeaponPickups,
  canInterruptWeaponReload,
  resolveWeaponEffectOpacity,
  WEAPON_DEFINITIONS,
  WEAPON_CHART_ENTRIES,
  WEAPON_BULLET_HOLE_LIFETIME_SECONDS,
  WEAPON_BULLET_HOLE_MAX_COUNT,
  WEAPON_IMPACT_LIFETIME_SECONDS,
  WEAPON_IDS,
  WEAPON_PICKUP_RANGE_METERS,
  WEAPON_TRACER_LIFETIME_SECONDS,
  WEAPON_RELOAD_LIFT_FRACTION,
  WEAPON_RELOAD_RETURN_FRACTION,
  WEAPON_RELOAD_INSERT_IMPULSE_DURATION_SECONDS,
  WEAPON_BARREL_SMOKE_MAX_RATE,
  WEAPON_BARREL_SMOKE_POOL_SIZE,
  resolveWeaponBarrelSmokeRatio,
  type WeaponId,
  type WeaponEffectKind,
  type WeaponIronSightProfile,
  type WeaponInventorySnapshot,
  type WeaponPickupSpawn,
  resolveWeaponReloadPose,
  resolveWeaponRoundReloadPose,
  resolveWeaponRecoilAmount,
  resolveWeaponSpreadRadians,
  resolveWeaponHotkey,
  resolveWeaponBarrelHeatDamage,
  resolveWeaponBarrelHeatRatio,
  type WeaponSpawnRect,
  type WeaponStateSnapshot,
} from "./weapons.js";

export type { WeaponId, WeaponInventorySnapshot, WeaponStateSnapshot } from "./weapons.js";

import {
  createFallbackMahjongPhysics,
  createMahjongPhysics,
  type MahjongPhysicsRuntime,
  type PhysicsBodyState,
  type PhysicsBox,
  type PhysicsVector,
} from "./mahjong-physics.js";
import {
  O2_JUMP_COST,
  O2_JUMP_RECOVERY_DELAY_SECONDS,
  O2_MINI_HOP_SPEED_BLEND,
  O2_NEUTRAL_JOG_SPEED_BLEND,
  O2_SPRINT_DRAIN_PER_SECOND,
  O2_STAND_COST,
  PLAYER_MAX_O2,
  PLAYER_MAX_SHIELD,
  SHIELD_RECHARGE_DELAY_SECONDS,
  applyPlayerDamage,
  applyPlayerO2Cost,
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
  resolveImpactDamage,
} from "./player-impact.js";
import {
  CAMERA_VIEWMODEL_STANDING_OFFSET,
  createCameraMotionDamper,
  resolveCameraViewmodelTransition,
  type CameraViewmodelOffset,
  type CameraViewmodelTransition,
  type CameraMotionOffsets,
  type CameraMotionUpdateInput,
} from "./camera-motion.js";
import {
  createO2BlurPass,
  setO2BlurPassCenter,
  setO2BlurPassPixels,
  setO2BlurPassSize,
  setO2BlurPassVignette,
} from "./o2-blur.js";
import { isPlayerTouchingWall } from "./wall-contact.js";
import {
  applySniperScopeProjection,
  createSniperScopePass,
  resolveSniperScopeProjection,
  resolveSniperScopeCameraFov,
  setSniperScopeSceneTexture,
  shouldRenderSniperScopeObject,
  shouldEnableSniperScope,
} from "./sniper-scope.js";

export type { PlayerVitalsDamageResult, PlayerVitalsState } from "./player-vitals.js";

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

/** A sprint request leaves crouch only when the required stand transition succeeds. */
export const resolveCrouchedStateAfterSprint = (
  isCrouched: boolean,
  sprintAccepted: boolean,
): boolean => (sprintAccepted ? false : isCrouched);

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
  "table" | "roomReveal" | "assetReview" | "focusCalibration" | "climbingGym";

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
// Keep the 1 km FPS world bounded to five coarse chunks from the origin in
// each direction. The larger chunk preserves long traversal sightlines while
// keeping the resident grid at a manageable 11 × 11 chunks.
const EXPLORATION_CHUNK_SIZE = 100;
const EXPLORATION_CHUNKS_PER_SIDE = 5;
const EXPLORATION_DENSITY_MULTIPLIER = 2;
const EXPLORATION_DENSITY_SCALE =
  EXPLORATION_DENSITY_MULTIPLIER * Math.sqrt(EXPLORATION_CHUNK_SIZE / 8);
const EXPLORATION_WORLD_HALF_SIZE = EXPLORATION_CHUNK_SIZE * EXPLORATION_CHUNKS_PER_SIDE;
const WORLD_BOUNDS = {
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
  value === "climbingGym";

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

const getAuthoredVisualMapDocument = (): VisualMapDocument => {
  const document = parseVisualMapDocument(JSON.stringify(authoredVisualMapInput));
  if (document === null) {
    throw new Error("The authored penthouse map is invalid");
  }
  return document;
};

const getVisualDebugPreferencesStorage = (): Storage | null => {
  if (!import.meta.env.DEV || typeof window === "undefined") {
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

const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  isFiniteNumber(value) && value >= min && value <= max;

const isVisualDebugPreferences = (value: unknown): value is VisualDebugPreferences => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.version === VISUAL_DEBUG_PREFERENCES_VERSION &&
    (value.cameraPreset === null || isVisualCameraPreset(value.cameraPreset)) &&
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
  readonly onExplorationAreaChange?: (area: string) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
  readonly onSprintingChange?: (sprinting: boolean) => void;
  readonly onSpeedChange?: (speed: number) => void;
  readonly onVitalsChange?: (vitals: PlayerVitalsState) => void;
  readonly onWeaponStateChange?: (state: WeaponStateSnapshot) => void;
  readonly onReady?: () => void;
  readonly quality?: VisualQualityPreset | "auto";
  readonly roomSeed?: string;
  readonly reticlePosition?: ReticlePosition;
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

/**
 * Resolve the live reticule dot position in camera NDC space.
 *
 * The HTML reticule uses CSS pixels for its centralized motion output. Keep
 * this conversion beside that output so the weapon ray, focus ray, and the
 * visible dot all follow the same sway.
 */
export const resolveReticleAimNdc = (
  reticlePosition: ReticlePosition,
  bobbingOffset: ReticleBobbingOffset,
  viewportWidth: number,
  viewportHeight: number,
): ReticleNdc => {
  const baseX = Number.isFinite(reticlePosition.x) ? reticlePosition.x : DEFAULT_RETICLE_POSITION.x;
  const baseY = Number.isFinite(reticlePosition.y) ? reticlePosition.y : DEFAULT_RETICLE_POSITION.y;
  const width = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const bobX = Number.isFinite(bobbingOffset.x) ? bobbingOffset.x : 0;
  const bobY = Number.isFinite(bobbingOffset.y) ? bobbingOffset.y : 0;
  return {
    x: baseX * 2 - 1 + (bobX * RETICLE_DOT_MOTION_MULTIPLIER * 2) / width,
    y: 1 - baseY * 2 - (bobY * RETICLE_DOT_MOTION_MULTIPLIER * 2) / height,
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
  readonly jump: () => boolean;
  readonly fire: () => void;
  readonly reload: () => void;
  readonly interact: () => void;
  readonly cycleWeapon: (direction?: 1 | -1) => void;
  readonly cycleWeaponTo: (weapon: WeaponId) => void;
  readonly setReticlePosition: (reticlePosition: ReticlePosition) => void;
  readonly getReticleBobbingOffset: () => ReticleBobbingOffset;
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
  duration: number;
  elapsed: number;
  phase: "vault" | "landingBoost";
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
  readonly target: PhysicsVector;
  readonly wallNormal: PhysicsVector;
  readonly wallFacePoint: PhysicsVector;
  readonly wallTopY: number;
  readonly box: PhysicsBox;
  readonly approachDirection: PhysicsVector;
  elapsed: number;
}

interface WallClimbTransition {
  elapsed: number;
  liftDuration: number;
  crossDuration: number;
  readonly startPosition: PhysicsVector;
  readonly clearPosition: PhysicsVector;
  readonly targetPosition: PhysicsVector;
}

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
      CLIMBING_GYM_RUN_Y + STANDING_EYE_HEIGHT,
      CLIMBING_GYM_PRESET_START_Z,
    ),
    target: new THREE.Vector3(
      CLIMBING_GYM_PRESET_TARGET_X,
      CLIMBING_GYM_RUN_Y + STANDING_EYE_HEIGHT,
      CLIMBING_GYM_PRESET_TARGET_Z,
    ),
  },
});

const STANDING_EYE_HEIGHT = cameraPresets.seat.position.y;
const SEATED_EYE_HEIGHT = 1.45;
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
// Double both launch and gravity to double the apex while keeping the same quick airtime.
const JUMP_SPEED = 13.2;
const GRAVITY = 48;
const MINI_HOP_SPEED = JUMP_SPEED * O2_MINI_HOP_SPEED_BLEND;

/** Use the full launch only after its complete O₂ charge is accepted. */
export const resolveJumpLaunchSpeed = (fullJumpAccepted: boolean): number =>
  fullJumpAccepted ? JUMP_SPEED : MINI_HOP_SPEED;

// Climbing over ledges should feel like a short climb-up, not a snap.
const LEDGE_CLIMB_DURATION = 0.24;
const LEDGE_CLIMB_ARC_HEIGHT = 0.09;
const LEDGE_CLIMB_FORWARD_OFFSET = 0.16;
const LEDGE_CLIMB_EXIT_BOOST_DURATION = 0.06;
const LEDGE_CLIMB_EXIT_BOOST_DISTANCE = 0.12;
export const LEDGE_CLIMB_EYE_HEIGHT_METERS = 1.75;
const LEDGE_GRAB_MIN_HEIGHT = 0.3;
const LEDGE_GRAB_MAX_HEIGHT = 1.6;
const LEDGE_GRAB_MIN_FALL_OFFSET = 0.05;
const LEDGE_GRAB_APPROACH_DISTANCE = 1;
const LEDGE_GRAB_SIDE_DISTANCE = 0.4;
const LEDGE_GRAB_PLATFORM_TOLERANCE = 0.01;
const LEDGE_GRAB_PLATFORM_INSET = 0.08;
const PLAYER_COLLIDER_RADIUS = 0.26;
const PLAYER_COLLIDER_HALF_HEIGHT = 0.6;
const PLAYER_COLLIDER_CENTER_HEIGHT = PLAYER_COLLIDER_HALF_HEIGHT + PLAYER_COLLIDER_RADIUS;
const SWIPE_LOOK_SENSITIVITY = 0.00594;
const TOUCH_SIDEWAYS_SPRINT_FRACTION = 0.5;
const WALK_SPEED_RATIO = 1 / SPRINT_MULTIPLIER;
const NEUTRAL_JOG_SPEED_RATIO =
  WALK_SPEED_RATIO + (1 - WALK_SPEED_RATIO) * O2_NEUTRAL_JOG_SPEED_BLEND;
const NEUTRAL_JOG_SPEED_MULTIPLIER = SPRINT_MULTIPLIER * NEUTRAL_JOG_SPEED_RATIO;

export interface PlayerMovementSpeedInput {
  readonly crouching: boolean;
  readonly sprinting: boolean;
  readonly jogging: boolean;
  readonly reloading: boolean;
}

/**
 * Resolve the grounded movement multiplier.
 *
 * Reloading caps the requested standing speed at the O₂-neutral trot. It does
 * not promote ordinary walking to trot, and it never allows a full sprint
 * while the weapon is being reloaded.
 */
export const resolvePlayerMovementSpeedMultiplier = ({
  crouching,
  sprinting,
  jogging,
  reloading,
}: PlayerMovementSpeedInput): number => {
  if (crouching) {
    return 0.5;
  }
  const requestedMultiplier = sprinting
    ? SPRINT_MULTIPLIER
    : jogging
      ? NEUTRAL_JOG_SPEED_MULTIPLIER
      : 1;
  return reloading
    ? Math.min(requestedMultiplier, NEUTRAL_JOG_SPEED_MULTIPLIER)
    : requestedMultiplier;
};

const RETICLE_SWAY_PIXELS_PER_RADIAN = 150;
const RETICLE_AIM_SWAY_PIXELS_PER_RADIAN = 260;
const RETICLE_HEAD_BOB_PIXELS_PER_METER = 160;
const RETICLE_RECOIL_PIXELS_PER_RADIAN = 180;
/** Keep zoom steadier than hip fire without removing deterministic recoil feedback. */
export const ZOOM_RECOIL_FEEDBACK_MULTIPLIER = 0.5;
/** CSS motion applied to the reticule ring and its centre dot. */
export const RETICLE_RING_MOTION_MULTIPLIER = 5;
export const RETICLE_DOT_MOTION_MULTIPLIER = 5;

/**
 * Resolve the reticule displacement used to choose a shot's direction. Hip
 * fire keeps the full prior recoil in that feedback path for its existing
 * natural spread. Zoom keeps a reduced deterministic portion of that recoil,
 * so recovery still affects the next shot without making sighted fire as loose
 * as hip fire.
 */
export const resolveWeaponShotReticleOffset = (
  motion: Pick<
    CameraMotionOffsets,
    "roll" | "verticalOffset" | "aimSwayX" | "aimSwayY" | "recoilYaw" | "recoilPitch"
  >,
  includeRecoil = true,
  recoilFeedbackMultiplier = 1,
): ReticleBobbingOffset => {
  const safeRecoilFeedbackMultiplier = Number.isFinite(recoilFeedbackMultiplier)
    ? Math.max(0, Math.min(1, recoilFeedbackMultiplier))
    : 0;
  const recoilScale = includeRecoil ? safeRecoilFeedbackMultiplier : 0;
  return {
    x:
      (motion.roll * RETICLE_SWAY_PIXELS_PER_RADIAN +
        motion.aimSwayX * RETICLE_AIM_SWAY_PIXELS_PER_RADIAN +
        motion.recoilYaw * RETICLE_RECOIL_PIXELS_PER_RADIAN * recoilScale) *
      RETICLE_DOT_MOTION_MULTIPLIER,
    y:
      (motion.verticalOffset * RETICLE_HEAD_BOB_PIXELS_PER_METER +
        motion.aimSwayY * RETICLE_AIM_SWAY_PIXELS_PER_RADIAN +
        motion.recoilPitch * RETICLE_RECOIL_PIXELS_PER_RADIAN * recoilScale) *
      RETICLE_DOT_MOTION_MULTIPLIER,
  };
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
// 95% convergence is approximately 0.4 s near and 0.65 s far. The slower
// far-to-near transition avoids a distracting camera snap when gaze leaves a
// tile, while the reverse transition follows the eye's slower relaxation.
const BOKEH_NEAR_ACCOMMODATION_DAMPING = 7;
const BOKEH_FAR_ACCOMMODATION_DAMPING = 4.5;
const BOKEH_PUPIL_ADAPTATION_DAMPING = 2.4;
const BOKEH_TILE_SAMPLE_OFFSET = 0.028;
const INCLUDE_EXPLORATION_GATEWAY = false;
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
// Keep the training lane centered in its own ground-level 50 m play area.
const CLIMBING_GYM_ZONE_ORIGIN_X = PLAY_AREA_ORIGINS.climbingGym.x;
const CLIMBING_GYM_ZONE_ORIGIN_Z = PLAY_AREA_ORIGINS.climbingGym.z;
// Keep the demo spawn on open ground and point directly at the dedicated
// training wall. The spawn is intentionally close enough that a normal walk
// reaches the wall in about a second, so the traversal mechanic is easy to
// exercise without relying on the sprint double-tap.
const CLIMBING_GYM_PRESET_START_X = CLIMBING_GYM_ZONE_ORIGIN_X - 14.05;
const CLIMBING_GYM_PRESET_START_Z = CLIMBING_GYM_ZONE_ORIGIN_Z - 12;
const CLIMBING_GYM_PRESET_TARGET_X = CLIMBING_GYM_ZONE_ORIGIN_X - 9.7;
const CLIMBING_GYM_PRESET_TARGET_Z = CLIMBING_GYM_ZONE_ORIGIN_Z - 12;
const CLIMBING_GYM_PLATFORM_HEIGHT_METERS = 0.16;
const CLIMBING_GYM_PLATFORM_COLLIDER_HEIGHT_METERS = 0.16;

type ClimbingGymObstacleMaterial = "base" | "ledge" | "rail";

type ClimbingGymObstacleBase = Readonly<{
  name: string;
  kind: "run" | "ledge" | "prism";
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  material: ClimbingGymObstacleMaterial;
}>;

type ClimbingGymRunObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "run"; y: number }>;
type ClimbingGymLedgeObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "ledge"; topY: number }>;
type ClimbingGymPrismObstacle = ClimbingGymObstacleBase & Readonly<{ kind: "prism"; y: number }>;

type ClimbingGymObstacle =
  ClimbingGymRunObstacle | ClimbingGymLedgeObstacle | ClimbingGymPrismObstacle;

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
];

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

/** Return true when a rectangle stays outside all three reserved play areas. */
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

  let resolvedStyle = EXPLORATION_BIOMES[0] as ExplorationBiomeStyle;
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
  return CLIMBING_GYM_FEATURES.map(createClimbingGymCollider);
};

export const resolveLedgeClimbTargetCameraY = (transitionY: number): number =>
  transitionY - PLAYER_COLLIDER_CENTER_HEIGHT + LEDGE_CLIMB_EYE_HEIGHT_METERS;

/* ----------------------------------------------------------------------
 *  VAULT HELPERS
 *
 *  A “vault” is a jump onto a platform that is **not tall enough** for a
 *  ledge grab, but **too high** for the controller’s autostep.
 *
 *  The numbers below are tuned for the default character capsule
 *  (radius ≈ 0.3 m, eye height ≈ 0.86 m).  Feel free to expose them in a
 *  JSON scenario if you want them tunable.
 * ---------------------------------------------------------------------- */

/** Minimum top of a box (relative to the player’s feet) that can be vaulted onto. */
export const VAULT_MIN_HEIGHT = 0.15; // 15 cm above the feet
/** Maximum top of a box that is still considered a “vault”. */
export const VAULT_MAX_HEIGHT = 0.45; // 45 cm above the feet
/** Horizontal clearance needed on each side of the box while vaulting. */
export const VAULT_SIDE_BUFFER = 0.06; // same buffer used for ledge detection
/** Maximum distance from a low platform's approached edge before a vault can start. */
const VAULT_APPROACH_DISTANCE = 0.85;
/** Small allowance for a capsule that has already touched the platform edge. */
const VAULT_EDGE_TOLERANCE = 0.12;

/**
 * Try to find a static box that the player can “vault” onto.
 *
 * The algorithm mirrors `resolveLedgeGrabTarget` but uses a lower height
 * window (`VAULT_*`).  If a suitable box is found, a point on its top‑center
 * is returned; otherwise `null` is returned.
 *
 * @param fromPosition          Player position **before** the jump.
 * @param desiredHorizontalDelta  Desired horizontal displacement for the current frame.
 * @param feetY                 Height of the player’s feet (center.y – collider radius).
 * @param staticPhysicsBoxes    All static colliders in the scene.
 *
 * @returns The capsule-centre target on top of the vaultable box, or `null`
 * if none found.
 */
export const resolveVaultTarget = (
  fromPosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  feetY: number,
  staticPhysicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null => {
  const horizDist = Math.hypot(desiredHorizontalDelta.x, desiredHorizontalDelta.z);
  if (horizDist < 0.015) return null; // not moving enough horizontally

  // Normalised approach direction (same as ledge logic)
  const dirX = desiredHorizontalDelta.x / horizDist;
  const dirZ = desiredHorizontalDelta.z / horizDist;

  const minTopY = feetY + VAULT_MIN_HEIGHT;
  const maxTopY = feetY + VAULT_MAX_HEIGHT;

  // Probe point a little in front of the capsule – the same point the ledge
  // code uses to make sure we have clearance.
  const probeX = fromPosition.x + dirX * (PLAYER_COLLIDER_RADIUS + VAULT_SIDE_BUFFER);
  const probeZ = fromPosition.z + dirZ * (PLAYER_COLLIDER_RADIUS + VAULT_SIDE_BUFFER);

  // Where the player wants to land if the vault succeeds. Keep the landing
  // bias used by the refined ledge transition: a vault should carry the
  // capsule onto the supported surface instead of stopping on its first
  // collision edge.
  const targetX = fromPosition.x + desiredHorizontalDelta.x + dirX * LEDGE_CLIMB_FORWARD_OFFSET;
  const targetZ = fromPosition.z + desiredHorizontalDelta.z + dirZ * LEDGE_CLIMB_FORWARD_OFFSET;

  const best: {
    value: { x: number; y: number; z: number; gap: number; edgeGap: number } | null;
  } = {
    value: null,
  };

  const tryBox = (box: PhysicsBox): void => {
    // The top of the box must be within the vault height window.
    const topY = box.center.y + box.halfExtents.y;
    if (topY < minTopY || topY > maxTopY) return;

    // A probe that merely overlaps a box is not enough to vault it. Require the
    // capsule to be approaching one of the box's near faces; this keeps nearby
    // platforms from stealing the refined ledge transition while the player is
    // falling or moving past them.
    const movingAlongX = Math.abs(dirX) >= Math.abs(dirZ);
    const edgeGap = movingAlongX
      ? dirX >= 0
        ? box.center.x - box.halfExtents.x - fromPosition.x
        : fromPosition.x - (box.center.x + box.halfExtents.x)
      : dirZ >= 0
        ? box.center.z - box.halfExtents.z - fromPosition.z
        : fromPosition.z - (box.center.z + box.halfExtents.z);
    if (edgeGap < -VAULT_EDGE_TOLERANCE || edgeGap > VAULT_APPROACH_DISTANCE) return;

    // Ensure the probe is inside the “safe” horizontal region of the box.
    const safeMinX = box.center.x - box.halfExtents.x - VAULT_SIDE_BUFFER;
    const safeMaxX = box.center.x + box.halfExtents.x + VAULT_SIDE_BUFFER;
    const safeMinZ = box.center.z - box.halfExtents.z - VAULT_SIDE_BUFFER;
    const safeMaxZ = box.center.z + box.halfExtents.z + VAULT_SIDE_BUFFER;
    if (probeX < safeMinX || probeX > safeMaxX) return;
    if (probeZ < safeMinZ || probeZ > safeMaxZ) return;

    // How far is the probe from the centre of the box?  Pick the nearest edge
    // candidate, then use centre distance only as a deterministic tie-break.
    const gap = Math.hypot(probeX - box.center.x, probeZ - box.center.z);
    if (
      best.value === null ||
      edgeGap < best.value.edgeGap ||
      (edgeGap === best.value.edgeGap && gap < best.value.gap)
    ) {
      const insetX = Math.min(VAULT_SIDE_BUFFER, box.halfExtents.x * 0.5);
      const insetZ = Math.min(VAULT_SIDE_BUFFER, box.halfExtents.z * 0.5);
      best.value = {
        x: THREE.MathUtils.clamp(
          targetX,
          box.center.x - box.halfExtents.x + insetX,
          box.center.x + box.halfExtents.x - insetX,
        ),
        y: topY + PLAYER_COLLIDER_CENTER_HEIGHT,
        z: THREE.MathUtils.clamp(
          targetZ,
          box.center.z - box.halfExtents.z + insetZ,
          box.center.z + box.halfExtents.z - insetZ,
        ),
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
  return resolved === null ? null : { x: resolved.x, y: resolved.y, z: resolved.z };
};

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
export const WALL_HANG_MIN_TOP = LEDGE_GRAB_MAX_HEIGHT + 0.05;
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
const WALL_CLIMB_CLEARANCE = 0.04;
const WALL_CLIMB_MIN_PHASE_DURATION = 0.14;
// Keep the attachment visible for a short beat before a held approach input
// starts the climb. Otherwise a run into the wall enters and leaves the hang
// state within one animation frame and feels like an ordinary collision.
const WALL_HANG_SETTLE_DURATION = 0.14;

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

  const facingX = Math.abs(forward.x) >= Math.abs(forward.z);
  const capsuleBottomY = fromPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT;
  const capsuleTopY = fromPosition.y + PLAYER_COLLIDER_CENTER_HEIGHT;
  const minTopY = fromPosition.y + (WALL_HANG_MIN_TOP - PLAYER_COLLIDER_CENTER_HEIGHT);
  const maxTopY = capsuleTopY + WALL_HANG_MAX_TOP_GAP;
  let best: WallHangResolution | null = null;

  for (const box of staticPhysicsBoxes) {
    const minX = box.center.x - box.halfExtents.x;
    const maxX = box.center.x + box.halfExtents.x;
    const minZ = box.center.z - box.halfExtents.z;
    const maxZ = box.center.z + box.halfExtents.z;
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

    const face = facingX ? (forward.x > 0 ? minX : maxX) : forward.z > 0 ? minZ : maxZ;
    const centreAxis = facingX ? fromPosition.x : fromPosition.z;
    const signedGap = facingX
      ? forward.x > 0
        ? face - centreAxis - PLAYER_COLLIDER_RADIUS
        : centreAxis - face - PLAYER_COLLIDER_RADIUS
      : forward.z > 0
        ? face - centreAxis - PLAYER_COLLIDER_RADIUS
        : centreAxis - face - PLAYER_COLLIDER_RADIUS;

    // A capsule can cross a very thin upper platform between physics steps:
    // the side contact starts just below the hand window, then the next step
    // is already inside the box. Accept that swept-contact case only while
    // the centre is still inside the box slab. A point beyond the far side is
    // still rejected, which keeps walls behind the player from being grabbed.
    const centreAxisMin = facingX ? minX : minZ;
    const centreAxisMax = facingX ? maxX : maxZ;
    const centreInsideWallSlab =
      centreAxis >= centreAxisMin - WALL_HANG_SEPARATION &&
      centreAxis <= centreAxisMax + WALL_HANG_SEPARATION;
    if (
      (signedGap < -WALL_HANG_SEPARATION && !centreInsideWallSlab) ||
      signedGap > WALL_HANG_REACH
    ) {
      continue;
    }

    const orthogonalPosition = facingX ? fromPosition.z : fromPosition.x;
    const orthogonalMin = facingX ? minZ : minX;
    const orthogonalMax = facingX ? maxZ : maxX;
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
    const wallNormal = facingX
      ? { x: forward.x > 0 ? -1 : 1, y: 0, z: 0 }
      : { x: 0, y: 0, z: forward.z > 0 ? -1 : 1 };
    const targetAxis =
      face +
      (facingX ? wallNormal.x : wallNormal.z) * (PLAYER_COLLIDER_RADIUS + WALL_HANG_SEPARATION);
    const target = facingX
      ? { x: targetAxis, y: fromPosition.y, z: targetOrthogonal }
      : { x: targetOrthogonal, y: fromPosition.y, z: targetAxis };
    const wallFacePoint = facingX
      ? { x: face, y: fromPosition.y, z: targetOrthogonal }
      : { x: targetOrthogonal, y: fromPosition.y, z: face };
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

const resolveWallClimbTarget = (wall: WallHangState): PhysicsVector => {
  const movingAlongX = wall.wallNormal.x !== 0;
  const orthogonalMin = movingAlongX
    ? wall.box.center.z - wall.box.halfExtents.z
    : wall.box.center.x - wall.box.halfExtents.x;
  const orthogonalMax = movingAlongX
    ? wall.box.center.z + wall.box.halfExtents.z
    : wall.box.center.x + wall.box.halfExtents.x;
  const safeOrthogonalMin = orthogonalMin + PLAYER_COLLIDER_RADIUS + WALL_HANG_SEPARATION;
  const safeOrthogonalMax = orthogonalMax - PLAYER_COLLIDER_RADIUS - WALL_HANG_SEPARATION;
  const wallOrthogonal = movingAlongX ? wall.wallFacePoint.z : wall.wallFacePoint.x;
  const targetOrthogonal =
    safeOrthogonalMin <= safeOrthogonalMax
      ? clampNumber(wallOrthogonal, safeOrthogonalMin, safeOrthogonalMax)
      : (orthogonalMin + orthogonalMax) / 2;
  const targetY = wall.wallTopY + PLAYER_COLLIDER_CENTER_HEIGHT + WALL_CLIMB_CLEARANCE;

  return movingAlongX
    ? { x: wall.box.center.x, y: targetY, z: targetOrthogonal }
    : { x: targetOrthogonal, y: targetY, z: wall.box.center.z };
};

export const resolveLedgeGrabTarget = (
  fromPosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  feetY: number,
  staticPhysicsBoxes: readonly PhysicsBox[],
  dynamicPhysicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null => {
  const horizontalDistance = Math.hypot(desiredHorizontalDelta.x, desiredHorizontalDelta.z);
  if (horizontalDistance < 0.015) {
    return null;
  }
  const approachDirectionX = desiredHorizontalDelta.x / horizontalDistance;
  const approachDirectionZ = desiredHorizontalDelta.z / horizontalDistance;
  const directionX = desiredHorizontalDelta.x / horizontalDistance;
  const directionZ = desiredHorizontalDelta.z / horizontalDistance;
  const minTopY = feetY + LEDGE_GRAB_MIN_HEIGHT;
  const maxTopY = feetY + LEDGE_GRAB_MAX_HEIGHT;
  const probeX = fromPosition.x + directionX * (PLAYER_COLLIDER_RADIUS + 0.06);
  const probeZ = fromPosition.z + directionZ * (PLAYER_COLLIDER_RADIUS + 0.06);
  const targetX = fromPosition.x + desiredHorizontalDelta.x;
  const targetZ = fromPosition.z + desiredHorizontalDelta.z;
  const best: { value: { x: number; y: number; z: number; gap: number } | null } = {
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
    const probeSafeMinX = box.center.x - box.halfExtents.x - LEDGE_GRAB_SIDE_DISTANCE;
    const probeSafeMaxX = box.center.x + box.halfExtents.x + LEDGE_GRAB_SIDE_DISTANCE;
    const probeSafeMinZ = box.center.z - box.halfExtents.z - LEDGE_GRAB_SIDE_DISTANCE;
    const probeSafeMaxZ = box.center.z + box.halfExtents.z + LEDGE_GRAB_SIDE_DISTANCE;
    if (
      probeX < probeSafeMinX ||
      probeX > probeSafeMaxX ||
      probeZ < probeSafeMinZ ||
      probeZ > probeSafeMaxZ
    ) {
      return;
    }
    const movingAlongX = Math.abs(desiredHorizontalDelta.x) >= Math.abs(desiredHorizontalDelta.z);
    const edgeGap = movingAlongX
      ? directionX >= 0
        ? box.center.x - box.halfExtents.x - fromPosition.x
        : fromPosition.x - (box.center.x + box.halfExtents.x)
      : directionZ >= 0
        ? box.center.z - box.halfExtents.z - fromPosition.z
        : fromPosition.z - (box.center.z + box.halfExtents.z);
    if (edgeGap < LEDGE_GRAB_PLATFORM_TOLERANCE || edgeGap > LEDGE_GRAB_APPROACH_DISTANCE) {
      return;
    }
    const sideDelta = movingAlongX
      ? Math.abs(probeZ - box.center.z)
      : Math.abs(probeX - box.center.x);
    const maxSideDelta =
      (movingAlongX ? box.halfExtents.z : box.halfExtents.x) + LEDGE_GRAB_SIDE_DISTANCE;
    if (sideDelta > maxSideDelta) {
      return;
    }
    const halfInsetX = Math.min(LEDGE_GRAB_PLATFORM_INSET, box.halfExtents.x * 0.85);
    const halfInsetZ = Math.min(LEDGE_GRAB_PLATFORM_INSET, box.halfExtents.z * 0.85);
    const minTargetX = box.center.x - box.halfExtents.x + halfInsetX;
    const maxTargetX = box.center.x + box.halfExtents.x - halfInsetX;
    const minTargetZ = box.center.z - box.halfExtents.z + halfInsetZ;
    const maxTargetZ = box.center.z + box.halfExtents.z - halfInsetZ;
    const candidate = {
      x:
        minTargetX > maxTargetX
          ? box.center.x
          : THREE.MathUtils.clamp(
              targetX + approachDirectionX * LEDGE_CLIMB_FORWARD_OFFSET,
              minTargetX,
              maxTargetX,
            ),
      y: topY + PLAYER_COLLIDER_CENTER_HEIGHT,
      z:
        minTargetZ > maxTargetZ
          ? box.center.z
          : THREE.MathUtils.clamp(
              targetZ + approachDirectionZ * LEDGE_CLIMB_FORWARD_OFFSET,
              minTargetZ,
              maxTargetZ,
            ),
    };
    if (best.value === null || edgeGap < best.value.gap) {
      best.value = { ...candidate, gap: edgeGap };
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
  return { x: resolved.x, y: resolved.y, z: resolved.z };
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
        !object.visible ||
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

const createStaticPhysicsBoxes = (scene: THREE.Scene): readonly PhysicsBox[] => {
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
  return [
    {
      center: { x: 0, y: -0.1, z: 0 },
      halfExtents: { x: WORLD_BOUNDS.maxX, y: 0.1, z: WORLD_BOUNDS.maxZ },
    },
    {
      center: { x: 0, y: 0.39, z: 0 },
      halfExtents: { x: 0.92, y: 0.39, z: 0.92 },
    },
    ...focusRampPhysicsBoxes,
    ...wallPhysicsBoxes,
    ...climbingGymPhysicsBoxes,
    ...collectScenePhysicsBoxes(scene),
  ];
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

/** Use different accommodation timing for near and far gaze changes. */
export const resolveFocusAccommodationDamping = (
  currentDistance: number,
  targetDistance: number,
): number =>
  targetDistance < currentDistance
    ? BOKEH_NEAR_ACCOMMODATION_DAMPING
    : BOKEH_FAR_ACCOMMODATION_DAMPING;

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
  spin: number;
  active: boolean;
}

interface WeaponModelResources {
  readonly root: THREE.Group;
  readonly muzzleFlash: THREE.Mesh;
  readonly barrels: readonly WeaponBarrelResources[];
  readonly muzzleSmokeRoot: THREE.Group | null;
  readonly smokeParticles: readonly WeaponSmokeParticle[];
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
  remainingSeconds: number;
}

interface WeaponRuntime {
  readonly update: (
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    aimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 },
    controlsActive: boolean,
    viewActive: boolean,
    viewmodelOffset: CameraViewmodelOffset,
    viewmodelTransition: CameraViewmodelTransition,
  ) => void;
  readonly setFireHeld: (held: boolean) => void;
  readonly fire: () => void;
  readonly reload: () => void;
  readonly isReloading: () => boolean;
  readonly interact: () => void;
  readonly holster: () => void;
  readonly cycleWeapon: (direction?: 1 | -1) => void;
  readonly cycleWeaponTo: (weapon: WeaponId) => void;
  readonly getSniperScopeLens: () => {
    readonly anchor: THREE.Object3D;
    readonly radius: number;
  } | null;
  readonly getSnapshot: () => WeaponStateSnapshot;
  readonly dispose: () => void;
}

const getWeaponAccent = (weapon: WeaponId): string =>
  `#${new THREE.Color(WEAPON_DEFINITIONS[weapon].color).getHexString()}`;

/** Shared near-black finish for every procedural gun body and sight detail. */
const WEAPON_BLACK = 0x050607;
/** Hot steel colour used once a barrel has carried the full hit-damage load. */
const WEAPON_BARREL_HEAT_COLOR = new THREE.Color(0xff3518);
const WEAPON_BARREL_HEAT_EMISSIVE = new THREE.Color(0xff1600);
const WEAPON_BARREL_HEAT_EMISSIVE_INTENSITY = 1;

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
    // The pool is tiny, and world particles can move outside the camera
    // frustum before their ten-second fade completes. Keep them eligible for
    // the explicit lifetime path instead of letting frustum culling pop them.
    sprite.frustumCulled = false;
    sprite.scale.setScalar(0.01);
    sprite.userData = { weaponVisual: true, dofIgnore: true, weaponSmoke: true };
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
      spin: 0,
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
  } else {
    addWeaponBox(root, [0.22, 0.16, 0.92], [0, -0.01, 0.16], bodyMaterial, 0.035);
    addWeaponBox(root, [0.24, 0.15, 0.38], [0, -0.035, 0.72], darkMaterial, 0.04);
    barrels.push(addWeaponBarrel(root, 1.35, 0.045, -0.98, darkMaterial));
    addWeaponBox(root, [0.12, 0.12, 0.4], [0, 0.19, -0.2], accentMaterial, 0.03);
    barrels.push(addWeaponBarrel(root, 0.34, 0.055, -0.19, accentMaterial));
    // The camera-child scope is a real piece of the held model. Its rear
    // glass is kept in front of the camera near plane, while the full-screen
    // lens pass below samples the rendered scene through this projected disk.
    const scopeRoot = new THREE.Group();
    scopeRoot.name = "SniperScopeBody";
    // Keep the optic on the authored rifle sight line. The shared viewmodel
    // posture offset stays weapon-agnostic; only this model's local geometry
    // is lowered so the glass centre follows the reticle aim axis.
    scopeRoot.position.set(0, SNIPER_SCOPE_MODEL_Y, -0.05);
    scopeRoot.userData = { weaponVisual: true, dofIgnore: true };
    const scopeBody = new THREE.Mesh(
      // Leave both ends open: the default cylinder caps turn the rear of the
      // scope into a solid black panel directly in front of the glass.
      new THREE.CylinderGeometry(0.058, 0.064, 0.56, 16, 1, true),
      darkMaterial,
    );
    scopeBody.name = "SniperScopeTube";
    scopeBody.rotation.x = Math.PI / 2;
    scopeBody.castShadow = true;
    scopeBody.userData = { weaponVisual: true, dofIgnore: true };
    scopeRoot.add(scopeBody);
    for (const z of [-0.25, 0.25] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 20), accentMaterial);
      ring.name = "SniperScopeRing";
      ring.position.z = z;
      ring.userData = { weaponVisual: true, dofIgnore: true };
      scopeRoot.add(ring);
    }
    const lensMaterial = new THREE.MeshBasicMaterial({
      color: 0x6edbe9,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.062, 32), lensMaterial);
    lens.name = "SniperScopeGlass";
    // Put the glass just ahead of the open rear rim so it cannot z-fight with
    // the tube and remains visible from the camera side.
    lens.position.z = 0.29;
    lens.userData = { weaponVisual: true, dofIgnore: true };
    scopeRoot.add(lens);
    scopeLensAnchor = new THREE.Object3D();
    scopeLensAnchor.name = "SniperScopeLensAnchor";
    scopeLensAnchor.position.copy(lens.position);
    scopeLensAnchor.userData = { weaponVisual: true, dofIgnore: true };
    scopeRoot.add(scopeLensAnchor);
    scopeLensRadius = 0.062;
    root.add(scopeRoot);
    muzzleZ = -1.68;
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
    muzzleSmokeRoot.userData = { weaponVisual: true, dofIgnore: true, weaponSmoke: true };
    root.add(muzzleSmokeRoot);
    smokeParticles = createWeaponSmokeParticles(muzzleSmokeRoot, smokeTexture);
  }
  return {
    root,
    muzzleFlash,
    barrels,
    muzzleSmokeRoot,
    smokeParticles,
    scopeLensAnchor,
    scopeLensRadius,
  };
};

/** Apply one weapon's normalized heat response to every visible model copy. */
const applyWeaponBarrelHeatVisual = (barrel: WeaponBarrelResources, heatRatio: number): void => {
  const ratio = THREE.MathUtils.clamp(Number.isFinite(heatRatio) ? heatRatio : 0, 0, 1);
  barrel.material.color.copy(barrel.baseColor).lerp(WEAPON_BARREL_HEAT_COLOR, ratio);
  barrel.material.emissive.copy(barrel.baseEmissive).lerp(WEAPON_BARREL_HEAT_EMISSIVE, ratio);
  barrel.material.emissiveIntensity = THREE.MathUtils.lerp(
    barrel.baseEmissiveIntensity,
    WEAPON_BARREL_HEAT_EMISSIVE_INTENSITY,
    ratio,
  );
  barrel.material.needsUpdate = true;
  barrel.mesh.userData.weaponBarrelHeat = ratio;
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

const WEAPON_VIEWMODEL_AIM_DISTANCE = 64;
/**
 * Nominal crouched sight calibration: the 0.92 held-model scale, the
 * -0.22/-0.54 crouched viewmodel offset, the +0.24 lens depth, the 45° seat
 * FOV, and the y=0.60 reticle projection place the glass centre at y=0.60.
 */
const SNIPER_SCOPE_MODEL_Y = 0.11979078;

const createWeaponRuntime = (
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  roomSeed: string,
  pickups: readonly WeaponPickupSpawn[],
  onStateChange?: (state: WeaponStateSnapshot) => void,
  onWeaponShot?: (damage: number, projectileCount: number) => void,
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
  const weaponSmokeTexture = makeWeaponSmokeTexture();
  const bulletHoleRoot = new THREE.Group();
  bulletHoleRoot.name = "WeaponBulletHoleRoot";
  // Bullet holes are presentation-only scene objects, but they should still
  // participate in the normal depth-of-field pass instead of floating in a
  // separate overlay like the short-lived tracer and muzzle effects.
  bulletHoleRoot.userData = { weaponVisual: true, bulletHoleRoot: true };
  scene.add(bulletHoleRoot);
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
      effectsRoot.add(model.muzzleSmokeRoot);
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
  const barrelHeatDamage = new Map<WeaponId, number>(WEAPON_IDS.map((weapon) => [weapon, 0]));
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
  let muzzleFlashSeconds = 0;
  let recoilAmount = 0;
  let shotsFired = 0;
  let shotsHit = 0;
  let fireHeld = false;
  let controlsActive = false;
  let viewActive = false;
  let pickupPositionInitialized = false;
  let smokeSpawnAccumulator = 0;
  let smokeAccumulatorWeapon: WeaponId | null = null;
  let latestAimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 } | null =
    null;
  let lastSnapshotSerialized = "";
  const shotRandom = createSeededRandom(`${roomSeed}|weapons|combat|v1`);
  const smokeRandom = createSeededRandom(`${roomSeed}|weapons|smoke|v1`);
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
  const hitColor = new THREE.Color();
  const surfaceNormal = new THREE.Vector3();
  const bulletHoleForward = new THREE.Vector3(0, 0, 1);
  const bulletHoleQuaternion = new THREE.Quaternion();
  const bulletHoleWorldMatrix = new THREE.Matrix4();
  const bulletHoleInstanceMatrix = new THREE.Matrix4();
  const bulletHoleNormalMatrix = new THREE.Matrix3();
  const effects: WeaponEffect[] = [];
  const bulletHoleEffects: WeaponEffect[] = [];
  const weaponForward = new THREE.Vector3(0, 0, -1);
  const weaponAimTargetWorld = new THREE.Vector3();
  const weaponAimTargetLocal = new THREE.Vector3();
  const weaponAimDirectionLocal = new THREE.Vector3();
  const weaponAimQuaternion = new THREE.Quaternion();
  const weaponReloadQuaternion = new THREE.Quaternion();
  const weaponReloadEuler = new THREE.Euler(0, 0, 0, "XYZ");
  const lastPickupCheckPosition = new THREE.Vector3();
  const smokeWorldUp = new THREE.Vector3(0, 1, 0);
  const smokeMuzzleWorld = new THREE.Vector3();
  const smokeForwardWorld = new THREE.Vector3();
  const smokeRightWorld = new THREE.Vector3();
  const smokeSpawnWorld = new THREE.Vector3();
  const smokeFallbackAxis = new THREE.Vector3(1, 0, 0);

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
  const beginRoundReloadReturn = (): void => {
    if (activeWeapon !== null && WEAPON_DEFINITIONS[activeWeapon].reloadMode === "round") {
      if (reloadInsertionPending) {
        reloadInsertionImpulseElapsedSeconds = Number.POSITIVE_INFINITY;
        reloadInsertionPending = false;
      }
      roundReloadReturnElapsedSeconds = 0;
    }
  };
  const showWeaponViewModel = (weapon: WeaponId | null): void => {
    for (const [entry, model] of viewModels) {
      model.root.visible = viewActive && entry === weapon;
    }
  };
  const applyWeaponBarrelHeat = (weapon: WeaponId, damage: number): void => {
    const heatRatio = resolveWeaponBarrelHeatRatio(damage);
    const viewModel = viewModels.get(weapon);
    for (const barrel of viewModel?.barrels ?? []) {
      applyWeaponBarrelHeatVisual(barrel, heatRatio);
    }
    for (const pickup of pickupVisuals) {
      if (pickup.spawn.weapon !== weapon) {
        continue;
      }
      for (const barrel of pickup.barrels) {
        applyWeaponBarrelHeatVisual(barrel, heatRatio);
      }
    }
  };
  const resetWeaponSmoke = (model: WeaponModelResources): void => {
    for (const particle of model.smokeParticles) {
      particle.active = false;
      particle.age = 0;
      particle.material.opacity = 0;
      particle.sprite.visible = false;
    }
  };
  /** Keep visual smoke power tied to one trigger round's total damage. */
  const resolveWeaponSmokePower = (damagePerRound: number): number => {
    const safeDamage = Number.isFinite(damagePerRound) ? Math.max(0, damagePerRound) : 0;
    return Math.max(0.45, safeDamage / 32);
  };
  const updateWeaponSmokeWorldFrame = (model: WeaponModelResources): void => {
    model.root.updateMatrixWorld(true);
    model.muzzleFlash.getWorldPosition(smokeMuzzleWorld);
    smokeForwardWorld.set(0, 0, -1).transformDirection(model.root.matrixWorld).normalize();
    if (smokeForwardWorld.lengthSq() < 0.0001) {
      smokeForwardWorld.set(0, 0, -1);
    }
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
    const powerSpread = Math.min(3, safePower);
    const lateralSpread = (thermal ? 0.06 : 0.09) * (0.8 + powerSpread * 0.2);
    const concentratedSpread = lateralSpread * 0.24;
    smokeRightWorld.crossVectors(smokeForwardWorld, smokeWorldUp);
    if (smokeRightWorld.lengthSq() < 0.0001) {
      smokeRightWorld.crossVectors(smokeForwardWorld, smokeFallbackAxis);
    }
    smokeRightWorld.normalize();
    particle.active = true;
    particle.age = 0;
    // Keep the first frame dense at the captured muzzle point, then expand
    // the billboard and push it outward for a ten-second diffusion fade.
    particle.lifetime = thermal ? 9.6 + random() * 1.2 : 9.2 + random() * 1.6;
    particle.startScale = (thermal ? 0.22 + random() * 0.12 : 0.26 + random() * 0.14) * safePower;
    particle.endScale =
      particle.startScale * (thermal ? 5.2 + random() * 1.6 : 4.8 + random() * 1.5);
    particle.startOpacity = thermal ? 0.55 + random() * 0.15 : 0.86 + random() * 0.14;
    particle.riseAcceleration = thermal ? 0.1 + random() * 0.06 : 0.08 + random() * 0.06;
    particle.spin = (random() - 0.5) * (thermal ? 2.2 : 3.6);
    smokeSpawnWorld
      .copy(smokeMuzzleWorld)
      .addScaledVector(smokeRightWorld, (random() - 0.5) * concentratedSpread)
      .addScaledVector(smokeWorldUp, (random() - 0.5) * concentratedSpread * 0.45)
      .addScaledVector(smokeForwardWorld, random() * (thermal ? 0.025 : 0.045));
    particle.sprite.position.copy(smokeSpawnWorld);
    const outwardSpeed = (thermal ? 0.045 : 0.12) * (0.85 + powerSpread * 0.25);
    const upwardSpeed = (thermal ? 0.08 : 0.1) + random() * (thermal ? 0.08 : 0.12);
    particle.velocity
      .copy(smokeForwardWorld)
      .multiplyScalar(outwardSpeed)
      .addScaledVector(smokeRightWorld, (random() - 0.5) * lateralSpread)
      .addScaledVector(smokeWorldUp, upwardSpeed);
    // White smoke is the muzzle-flash companion; the alpha mask supplies the
    // soft edge so even the large shotgun and sniper plumes stay billowy.
    particle.material.color.setHex(thermal ? 0xf1f4ef : 0xffffff);
    particle.material.opacity = particle.startOpacity;
    particle.sprite.rotation.set(0, 0, random() * Math.PI * 2);
    particle.sprite.scale.set(
      particle.startScale,
      particle.startScale * (0.82 + random() * 0.3),
      1,
    );
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
      updateWeaponSmokeWorldFrame(model);
      const heatDamage = barrelHeatDamage.get(weapon) ?? 0;
      const heatRatio = resolveWeaponBarrelHeatRatio(heatDamage);
      const thermalRatio = resolveWeaponBarrelSmokeRatio(heatRatio);
      const smokePower = resolveWeaponSmokePower(WEAPON_DEFINITIONS[weapon].totalDamagePerShot);
      smokeSpawnAccumulator += safeDelta * WEAPON_BARREL_SMOKE_MAX_RATE * thermalRatio;
      let thermalSpawns = 0;
      while (smokeSpawnAccumulator >= 1 && thermalSpawns < 2) {
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
      const progress = Math.min(1, particle.age / Math.max(0.001, particle.lifetime));
      particle.velocity.y += particle.riseAcceleration * safeDelta;
      particle.sprite.position.addScaledVector(particle.velocity, safeDelta);
      particle.sprite.position.x +=
        Math.sin(particle.phase + particle.age * 4.2) * 0.012 * safeDelta;
      particle.sprite.position.z +=
        Math.cos(particle.phase + particle.age * 3.4) * 0.008 * safeDelta;
      particle.sprite.rotation.z += particle.spin * safeDelta;
      const easedProgress = progress * progress * (3 - 2 * progress);
      const scale = THREE.MathUtils.lerp(particle.startScale, particle.endScale, easedProgress);
      particle.sprite.scale.set(scale, scale * (0.84 + easedProgress * 0.26), 1);
      particle.material.opacity = particle.startOpacity * (1 - progress) ** 1.25;
      if (progress >= 1) {
        particle.active = false;
        particle.sprite.visible = false;
        particle.material.opacity = 0;
      }
    }
  };
  const addWeaponHitHeat = (weapon: WeaponId, damage: number): void => {
    const currentDamage = barrelHeatDamage.get(weapon) ?? 0;
    const nextDamage = resolveWeaponBarrelHeatDamage(currentDamage, damage);
    barrelHeatDamage.set(weapon, nextDamage);
    applyWeaponBarrelHeat(weapon, nextDamage);
  };
  const coolWeaponBarrels = (deltaSeconds: number): void => {
    for (const weapon of WEAPON_IDS) {
      const currentDamage = barrelHeatDamage.get(weapon) ?? 0;
      if (currentDamage <= 0) {
        continue;
      }
      const nextDamage = resolveWeaponBarrelHeatDamage(currentDamage, 0, deltaSeconds);
      if (nextDamage === currentDamage) {
        continue;
      }
      barrelHeatDamage.set(weapon, nextDamage);
      applyWeaponBarrelHeat(weapon, nextDamage);
    }
  };
  const setActiveWeapon = (weapon: WeaponId | null): void => {
    if (weapon !== null && inventory.get(weapon)?.owned !== true) {
      return;
    }
    const previousWeapon = activeWeapon;
    activeWeapon = weapon;
    reloadingSeconds = 0;
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
  };
  const equipWeapon = (weapon: WeaponId): void => {
    setActiveWeapon(weapon);
  };
  const holsterWeapon = (): void => {
    setActiveWeapon(null);
    emitState(true);
  };
  const collectPickup = (visual: WeaponPickupVisual): void => {
    const definition = WEAPON_DEFINITIONS[visual.spawn.weapon];
    const slot = inventory.get(visual.spawn.weapon);
    if (slot === undefined) {
      return;
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
    equipWeapon(visual.spawn.weapon);
    nearbyPickup = null;
    emitState(true);
  };
  const findNearestPickup = (
    position: THREE.Vector3,
  ): { readonly visual: WeaponPickupVisual; readonly distance: number } | undefined =>
    pickupVisuals
      .filter((visual) => !visual.collected)
      .map((visual) => ({ visual, distance: visual.root.position.distanceTo(position) }))
      .filter(({ distance }) => distance <= WEAPON_PICKUP_RANGE_METERS)
      .sort((left, right) => left.distance - right.distance)[0];
  const interact = (): void => {
    const candidate = findNearestPickup(camera.position);
    if (candidate !== undefined) {
      collectPickup(candidate.visual);
    }
  };
  const cycleWeapon = (direction: 1 | -1 = 1): void => {
    const owned = WEAPON_IDS.filter((weapon) => inventory.get(weapon)?.owned === true);
    if (owned.length === 0) {
      return;
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
      return;
    }
    equipWeapon(nextWeapon);
    emitState(true);
  };
  const selectWeapon = (weapon: WeaponId): void => {
    equipWeapon(weapon);
    emitState(true);
  };
  const getSniperScopeLens = (): {
    readonly anchor: THREE.Object3D;
    readonly radius: number;
  } | null => {
    if (activeWeapon !== "sniper") {
      return null;
    }
    const model = viewModels.get("sniper");
    if (model?.scopeLensAnchor === null || model?.scopeLensAnchor === undefined) {
      return null;
    }
    return {
      anchor: model.scopeLensAnchor,
      radius: model.scopeLensRadius,
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
  };
  const registerEffect = (
    object: THREE.Object3D,
    kind: WeaponEffectKind,
    remainingSeconds: number,
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
    const effect: WeaponEffect = { object, kind, materials, remainingSeconds };
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
  };
  const reload = (): void => {
    if (
      activeWeapon === null ||
      reloadingSeconds > 0 ||
      switchAnimation !== null ||
      viewmodelTransitionActive
    ) {
      return;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    const slot = inventory.get(activeWeapon);
    if (
      slot === undefined ||
      slot.ammoInMagazine >= definition.magazineSize ||
      slot.reserveAmmo <= 0
    ) {
      return;
    }
    reloadingSeconds = definition.reloadSeconds;
    resetRoundReloadPresentation();
    emitState(true);
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
      reloadInsertionPending = false;
    } else {
      slot.ammoInMagazine += 1;
      slot.reserveAmmo -= 1;
      reloadInsertionPending = false;
      reloadingSeconds =
        slot.ammoInMagazine < definition.magazineSize && slot.reserveAmmo > 0
          ? definition.reloadSeconds
          : 0;
      if (reloadingSeconds === 0) {
        beginRoundReloadReturn();
      }
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
  const addBulletHole = (
    hit: THREE.Intersection,
    direction: THREE.Vector3,
    color: number,
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
      surfaceNormal.copy(face.normal).applyMatrix3(bulletHoleNormalMatrix).normalize();
    } else {
      surfaceNormal.copy(direction).multiplyScalar(-1).normalize();
    }
    if (surfaceNormal.lengthSq() < 0.0001) {
      surfaceNormal.set(0, 1, 0);
    }
    // Keep the decal's front face toward the shooter even when a mesh reports
    // the opposite winding for its hit triangle.
    if (surfaceNormal.dot(direction) > 0) {
      surfaceNormal.negate();
    }
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
  ): THREE.Intersection | undefined => {
    shotRaycaster.set(origin, direction);
    // Shots are hitscan and continue until the first render surface. Keep the
    // raycaster unbounded instead of applying a weapon-specific distance cap.
    shotRaycaster.far = Number.POSITIVE_INFINITY;
    try {
      // Chunks and other streamed render roots can be added after weapon
      // construction. Resolve the current scene children for every shot so
      // the hit list always matches what the player can see.
      const liveRaycastRoots = scene.children.filter(
        (object) => object.name !== "LightingRoot" && object.name !== "DebugRoot",
      );
      return shotRaycaster
        .intersectObjects(liveRaycastRoots, true)
        .find(
          (intersection) =>
            !isWeaponVisual(intersection.object) && !(intersection.object instanceof THREE.Sprite),
        );
    } catch {
      // A malformed or concurrently-disposed render subtree must not take
      // down the interactive scene. The tracer still renders to the camera's
      // finite view distance as a presentation-only miss fallback.
      return undefined;
    }
  };
  const tryFire = (): void => {
    if (
      !controlsActive ||
      activeWeapon === null ||
      switchAnimation !== null ||
      viewmodelTransitionActive ||
      fireCooldownSeconds > 0
    ) {
      return;
    }
    const definition = WEAPON_DEFINITIONS[activeWeapon];
    const slot = inventory.get(activeWeapon);
    if (slot === undefined) {
      return;
    }
    if (slot.ammoInMagazine <= 0) {
      reload();
      return;
    }
    if (latestAimRay === null) {
      return;
    }
    if (reloadingSeconds > 0 && !canInterruptWeaponReload(definition, slot.ammoInMagazine)) {
      return;
    }
    // A held fire input cancels a round reload as soon as a shell or bullet
    // has been chambered. Clip reloads remain atomic and cannot be cancelled.
    if (reloadingSeconds > 0) {
      beginRoundReloadReturn();
    }
    reloadingSeconds = 0;
    slot.ammoInMagazine -= 1;
    fireCooldownSeconds = definition.fireIntervalSeconds;
    muzzleFlashSeconds = 0.055;
    recoilAmount = Math.min(1, recoilAmount + resolveWeaponRecoilAmount(definition.damage));
    onWeaponShot?.(definition.damage, definition.pellets);
    shotsFired += 1;
    scene.updateMatrixWorld(true);
    const baseDirection = latestAimRay.direction.clone().normalize();
    const viewModel = viewModels.get(activeWeapon);
    if (viewModel !== undefined) {
      updateWeaponSmokeWorldFrame(viewModel);
      viewModel.muzzleFlash.visible = true;
      viewModel.muzzleFlash.scale.setScalar(1.2 + shotRandom.nextFloat() * 0.7);
      const smokePower = resolveWeaponSmokePower(definition.totalDamagePerShot);
      const puffCount = Math.min(8, Math.max(3, Math.ceil(definition.totalDamagePerShot / 24)));
      for (let puff = 0; puff < puffCount; puff += 1) {
        spawnWeaponSmoke(viewModel, false, smokePower);
      }
    }
    const spreadRadians = resolveWeaponSpreadRadians(definition);
    if (spreadRadians > 0) {
      rightVector.crossVectors(baseDirection, new THREE.Vector3(0, 1, 0));
      if (rightVector.lengthSq() < 0.0001) {
        rightVector.crossVectors(baseDirection, new THREE.Vector3(1, 0, 0));
      }
      rightVector.normalize();
      upVector.crossVectors(rightVector, baseDirection).normalize();
    }
    for (let pellet = 0; pellet < definition.pellets; pellet += 1) {
      pelletDirection.copy(baseDirection);
      if (spreadRadians > 0) {
        const angle = shotRandom.nextFloat() * Math.PI * 2;
        const radius = Math.sqrt(shotRandom.nextFloat()) * spreadRadians;
        pelletDirection
          .addScaledVector(rightVector, Math.cos(angle) * radius)
          .addScaledVector(upVector, Math.sin(angle) * radius)
          .normalize();
      }
      const hit = findWeaponHit(latestAimRay.origin, pelletDirection);
      // A miss has no surface to terminate the tracer. Use the camera's far
      // plane only for finite effect geometry; it is not a gameplay range.
      const distance = hit?.distance ?? camera.far;
      addTracer(latestAimRay.origin, pelletDirection, distance, definition.color);
      if (hit !== undefined) {
        shotsHit += 1;
        addWeaponHitHeat(definition.id, definition.damage);
        addImpact(hit.point, definition.color);
        addBulletHole(hit, pelletDirection, definition.color);
        hitColor.set(definition.color);
        hit.object.userData.lastWeaponHit = {
          weapon: definition.id,
          damage: definition.damage,
          color: hitColor.getHexString(),
        };
      }
    }
    emitState(true);
  };
  const update = (
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    aimRay: { readonly origin: THREE.Vector3; readonly direction: THREE.Vector3 },
    active: boolean,
    visibleInView: boolean,
    viewmodelOffset: CameraViewmodelOffset,
    viewmodelTransition: CameraViewmodelTransition,
  ): void => {
    controlsActive = active;
    viewActive = visibleInView;
    latestAimRay = aimRay;
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
    if (fireHeld) {
      tryFire();
    }
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
    // Walking through the expanded pickup radius equips the closest gun. The
    // manual E interaction remains available for players who stop nearby.
    if (controlsActive && horizontalDistanceMoved > 0.001 && nearest !== undefined) {
      collectPickup(nearest.visual);
    }
    const nextNearby = findNearestPickup(cameraPosition)?.visual.spawn.weapon ?? null;
    if (nextNearby !== nearbyPickup) {
      nearbyPickup = nextNearby;
      emitState();
    }
    muzzleFlashSeconds = Math.max(0, muzzleFlashSeconds - deltaSeconds);
    recoilAmount = THREE.MathUtils.damp(recoilAmount, 0, 18, deltaSeconds);
    weaponAimTargetWorld
      .copy(aimRay.origin)
      .addScaledVector(aimRay.direction, WEAPON_VIEWMODEL_AIM_DISTANCE);
    weaponAimTargetLocal.copy(weaponAimTargetWorld).applyMatrix4(camera.matrixWorldInverse);
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
      model.root.position.x =
        viewmodelOffset.x + (viewmodelPose?.offset.x ?? 0) + (reloadPose?.lateralOffset ?? 0);
      model.root.position.y =
        viewmodelOffset.y + (viewmodelPose?.offset.y ?? 0) + (reloadPose?.verticalOffset ?? 0);
      model.root.position.z =
        viewmodelOffset.z +
        (viewmodelPose?.offset.z ?? 0) +
        recoilAmount * 0.07 +
        (reloadPose?.depthOffset ?? 0);
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
        // The camera child already inherits the shared damper, and this root
        // is aimed at the live reticule ray. Do not add a second breathing
        // oscillator here or the sights will drift away from that ray.
      }
      model.muzzleFlash.visible = muzzleFlashSeconds > 0;
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
        material.opacity = opacity;
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
      muzzleFlashSeconds = Math.min(muzzleFlashSeconds, 0.035);
    }
  };
  const dispose = (): void => {
    pickupRoot.removeFromParent();
    effectsRoot.removeFromParent();
    bulletHoleRoot.removeFromParent();
    for (const model of viewModels.values()) {
      resetWeaponSmoke(model);
      camera.remove(model.root);
      disposeObject(model.root);
    }
    disposeObject(pickupRoot);
    disposeObject(effectsRoot);
    disposeObject(bulletHoleRoot);
    weaponSmokeTexture.dispose();
    effects.length = 0;
    bulletHoleEffects.length = 0;
  };
  emitState(true);
  return {
    update,
    setFireHeld,
    fire: tryFire,
    reload,
    isReloading: isReloadPresentationActive,
    interact,
    holster: holsterWeapon,
    cycleWeapon,
    cycleWeaponTo: selectWeapon,
    getSniperScopeLens,
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

  if (FOCUS_CALIBRATION_DECK_HEIGHT > 0) {
    const rampMaterial = createEpoxyFloorMaterial(surfaceTextures.floor, surfaceTextures.detail);
    rampMaterial.fog = false;
    const rampAngle = Math.atan2(FOCUS_CALIBRATION_DECK_HEIGHT, FOCUS_CALIBRATION_RAMP_RUN);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(FOCUS_CALIBRATION_RAMP_RUN + 0.12, 0.18, FOCUS_CALIBRATION_RAMP_WIDTH),
      rampMaterial,
    );
    ramp.name = "FocusCalibrationRamp";
    ramp.position.set(
      startX + FOCUS_CALIBRATION_RAMP_RUN / 2,
      FOCUS_CALIBRATION_DECK_HEIGHT / 2,
      FOCUS_CALIBRATION_RAMP_TOP_Z,
    );
    ramp.rotation.z = -rampAngle;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    root.add(ramp);
  }

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
  // * Use a white colour with 50 % opacity (hex `#ffffff80`).
  // * The disc remains thin (height = 0.025) and is rotated onto the Y‑plane.
  // The focus‑calibration target dot is a visual aid that previously used a small
  // dark cylinder that inherited the panel material.  The new design requires a
  // larger white disc with 50 % opacity (hex ``#ffffff80``) and a visible border
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
  //   • The disc should be white with 50 % opacity (hex ``#ffffff80``).
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
  context.fillText("PENTHOUSE LOADOUT  ·  DAMAGE + STARTING AMMO", 66, 110);
  context.fillStyle = "#e94136";
  context.fillRect(66, 132, 1468, 5);

  const tableTop = 176;
  const rowHeight = 104;
  const columnX = {
    weapon: 104,
    damage: 720,
    pellets: 930,
    ammo: 1260,
    total: 1496,
  } as const;
  context.fillStyle = "#8fa7aa";
  context.font = "700 20px ui-monospace, monospace";
  context.fillText("WEAPON", columnX.weapon, tableTop);
  context.textAlign = "right";
  context.fillText("DAMAGE / BULLET", columnX.damage, tableTop);
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

    for (const obstacle of CLIMBING_GYM_FEATURES) {
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
    const id = object.userData.visualMapEntityId;
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
      .map((object) => object.userData.visualMapEntityId)
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
  const floorRotation = (
    requestedFloorRotationDegrees === undefined
      ? (floorRotationSeed - 0.5) * 0.12
      : THREE.MathUtils.degToRad(requestedFloorRotationDegrees)
  ) as number;
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
      setVisualMapEntityMetadata(object, `ceiling-light-${index + 1}`, "lightBar");
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
      setVisualMapEntityMetadata(object, `wall-slot-${index + 1}`, entityKind);
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
  readonly getPhysicsVersion: () => number;
  readonly dispose: () => void;
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
  readonly rotationY?: number;
  readonly physicsId: number;
  readonly fallAxis: THREE.Vector3;
  readonly launchLinearVelocity: THREE.Vector3;
  readonly launchAngularVelocity: THREE.Vector3;
  isKnocked: boolean;
  angle: number;
  angularVelocity: number;
  targetAngle: number;
  hasBodyState: boolean;
  kickCooldownSeconds: number;
}

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
): ExplorationWorld => {
  const normalizedSeed = normalizeVisualRoomSeed(roomSeed);
  const root = new THREE.Group();
  root.name = "ExplorationWorldRoot";
  root.userData = { roomSeed: normalizedSeed, streaming: true };
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
  let nextKnockablePhysicsId = 0;
  const knockAxis = new THREE.Vector3(0, 0, 1);
  const knockDirection = new THREE.Vector3();
  const knockToObject = new THREE.Vector3();
  const knockQuaternion = new THREE.Quaternion();
  const knockMatrix = new THREE.Matrix4();
  let physicsVersion = 0;
  let currentArea = "Penthouse";

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
  const describeArea = (position: THREE.Vector3): string => {
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

  const createChunk = (chunkX: number, chunkZ: number): ExplorationChunk => {
    const random = createSeededRandom(
      `${normalizedSeed}|exploration|${String(chunkX)}|${String(chunkZ)}`,
    );
    const biome = resolveExplorationBiome(normalizedSeed, chunkX, chunkZ);
    const style = biome.style;
    const styleIndex = biome.styleIndex;
    if (style === undefined) {
      throw new Error("Exploration zone styles are empty");
    }
    const terrainHeight = THREE.MathUtils.lerp(0.45, 1.7, biome.elevation);
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
        (style.buildingDensity + terrainHeight * 1.6 + featureBias) * EXPLORATION_DENSITY_SCALE,
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
          terrainHeight * 0.8,
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
    const propTransforms: Array<{
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
    }> = [];
    const citySignCount = Math.max(
      1,
      Math.round(
        (style.citySignDensity + featureBias + random.nextFloat()) * EXPLORATION_DENSITY_SCALE,
      ),
    );
    const citySignMatrices: THREE.Matrix4[] = [];
    const citySignTransforms: Array<{
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
    }> = [];
    const utilityPostCount = Math.max(
      1,
      Math.round((style.utilityPostDensity + random.nextFloat() * 0.7) * EXPLORATION_DENSITY_SCALE),
    );
    const utilityPostMatrices: THREE.Matrix4[] = [];
    const utilityPostTransforms: Array<{
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
    }> = [];
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
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
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
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
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
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
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
    const beaconTransforms: Array<{
      readonly position: THREE.Vector3;
      readonly quaternion: THREE.Quaternion;
      readonly scale: THREE.Vector3;
      readonly halfExtents: PhysicsVector;
      readonly rotationY: number;
    }> = [];
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
          rotationY: transform.rotationY,
          fallAxis: new THREE.Vector3(0, 0, 1),
          launchLinearVelocity: new THREE.Vector3(),
          launchAngularVelocity: new THREE.Vector3(),
          hasBodyState: false,
          kickCooldownSeconds: 0,
          isKnocked: false,
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
    let physicsChanged = false;
    const minChunkX = chunkCoordinate(WORLD_BOUNDS.minX);
    const maxChunkX = chunkCoordinate(WORLD_BOUNDS.maxX);
    const minChunkZ = chunkCoordinate(WORLD_BOUNDS.minZ);
    const maxChunkZ = chunkCoordinate(WORLD_BOUNDS.maxZ);

    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
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
        const wasKnocked = knockable.isKnocked;
        if (knockable.kickCooldownSeconds > 0) {
          knockable.kickCooldownSeconds = Math.max(0, knockable.kickCooldownSeconds - deltaSeconds);
        }
        if (!knockable.isKnocked) {
          if (!shouldKnock || impactMagnitude <= 0) {
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
        if (!knockable.isKnocked) {
          continue;
        }
        const bodyState = dynamicStateById.get(knockable.physicsId);
        if (bodyState !== undefined) {
          knockable.basePosition.set(bodyState.center.x, bodyState.center.y, bodyState.center.z);
        }
        if (
          wasKnocked &&
          shouldKnock &&
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
      }
    }
    if (physicsChanged) {
      physicsVersion += 1;
    }
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
): void => {
  const preset = cameraPresets[view];
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
  const roomSeed = normalizeVisualRoomSeed(options.roomSeed);
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
  const debugPreferencesStorage = getVisualDebugPreferencesStorage();
  const authoredRoomMap = getAuthoredVisualMapDocument();
  const persistedDebugPreferences = readVisualDebugPreferences(debugPreferencesStorage);
  const persistedQuality = persistedDebugPreferences?.qualityMode;
  const requestedQuality =
    options.quality ?? (persistedQuality === "adaptive" ? "auto" : persistedQuality);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.haze, 10, 34);
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
  const quality = resolveQuality(requestedQuality);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dprCap));
  renderer.shadowMap.enabled = quality.shadows !== "off";
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  container.dataset.controlActive = "false";
  container.replaceChildren(renderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTexture = pmremGenerator.fromScene(roomEnvironment).texture;
  scene.environment = environmentTexture;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dprCap));
  composer.addPass(new RenderPass(scene, camera));
  const gtaoPass = new GTAOPass(scene, camera, 512, 320);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = 0.72;
  // Keep GTAO opt-in so the adaptive/high baseline remains the last good
  // checkpoint. The debug checkbox can enable it without changing Bokeh.
  gtaoPass.enabled = false;
  gtaoPass.updateGtaoMaterial({
    radius: 0.24,
    distanceExponent: 1.15,
    thickness: 1.1,
    scale: 1.05,
    samples: 8,
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
  composer.addPass(new OutputPass());
  const focusRaycaster = new THREE.Raycaster();
  const sniperScopeCameraPosition = new THREE.Vector3();
  const sniperScopeCameraScale = new THREE.Vector3();
  const sniperScopeCameraQuaternion = new THREE.Quaternion();
  const sniperScopeCameraForward = new THREE.Vector3();
  const sniperScopeAimDirection = new THREE.Vector3();
  const sniperScopeRotationDelta = new THREE.Quaternion();
  let reticlePosition = resolveReticlePosition(options.reticlePosition);
  const setFocusReticle = (position?: ReticlePosition): void => {
    const normalized = resolveReticlePosition(position);
    reticlePosition = normalized;
  };
  setFocusReticle(options.reticlePosition);
  let focusCalibrationRoot: THREE.Group | null = null;
  let focusCalibrationLabels: readonly THREE.Sprite[] = [];
  let debugBoundsRoot: THREE.Group | null = null;
  let sunLight: THREE.DirectionalLight | null = null;
  let skySunReference: THREE.Object3D | null = null;
  let redMaterials: THREE.MeshStandardMaterial[] = [];
  let cyanMaterials: THREE.MeshStandardMaterial[] = [];
  let redMaterialBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();
  let cyanMaterialBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();
  let activeDebugPreset: VisualCameraPreset | null = null;
  let debugFovOverride: number | null = null;
  let debugFogDensity = 0.028;
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
    const offset = resolveReticleZoomViewOffset(camera.fov, reticlePosition);
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
  let jumpOffset = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let physicsRuntime: MahjongPhysicsRuntime | null = null;
  let physicsCharacterPosition: PhysicsVector | null = null;
  let weaponRuntime: WeaponRuntime | null = null;
  let staticPhysicsBoxes: readonly PhysicsBox[] = [];
  let dynamicPhysicsBoxes: readonly PhysicsBox[] = [];
  let appliedPhysicsVersion = -1;
  let ledgeClimbTransition: ClimbingTransition | null = null;
  let wallHangState: WallHangState | null = null;
  let wallClimbTransition: WallClimbTransition | null = null;
  let wallHangElapsed = 0;
  let touchingWall = false;
  let wallBracedAim = false;
  let forwardVelocity = 0;
  let strafeVelocity = 0;
  const cameraMotion = createCameraMotionDamper();
  let touchMovementActive = false;
  let touchForward = 0;
  let touchRight = 0;
  let isSprinting = false;
  const lastMovementTapAtByKey = new Map<string, number>();
  let lastSceneStateSaveAt = Number.NEGATIVE_INFINITY;
  let lastSceneStateSerialized: string | null = null;
  let playerVitals = createPlayerVitals();
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
  let aimingDownSights = false;
  let impactDamageCooldown = 0;
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
  const didPlayerVitalsChange = (nextVitals: PlayerVitalsState): boolean =>
    nextVitals.health !== playerVitals.health ||
    nextVitals.shield !== playerVitals.shield ||
    nextVitals.o2 !== playerVitals.o2 ||
    nextVitals.oxygenRecoveryDelaySeconds !== playerVitals.oxygenRecoveryDelaySeconds ||
    nextVitals.holdingBreath !== playerVitals.holdingBreath ||
    nextVitals.holdBreathLocked !== playerVitals.holdBreathLocked;
  const damagePlayer = (damage: number): PlayerVitalsDamageResult => {
    const result = applyPlayerDamage(playerVitals, damage);
    if (result.damage > 0) {
      playerVitals = result.state;
      publishPlayerVitals(true);
    }
    return result;
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
  const spendPlayerProjectileO2 = (damage: number, projectileCount: number): void => {
    if (playerVitals.isDead || playerVitals.o2 <= 0) {
      return;
    }
    const nextVitals = applyPlayerProjectileO2Cost(playerVitals, damage, projectileCount);
    if (didPlayerVitalsChange(nextVitals)) {
      playerVitals = nextVitals;
      publishPlayerVitals(true);
    }
  };
  const setAiming = (aiming: boolean, holdingBreath: boolean): void => {
    const controlsActive =
      firstPersonControls.isLocked || (isTouchDevice && firstPersonControls.enabled);
    const requestedAiming = aiming && activeView === "seat" && controlsActive;
    const nextAiming = resolveReloadAimingDownSights(
      requestedAiming,
      weaponRuntime?.isReloading() ?? false,
    );
    const aimingChanged = aimingDownSights !== nextAiming;
    aimingDownSights = nextAiming;
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
  const resetVitalsState = (): PlayerVitalsState => {
    playerVitals = resetPlayerVitals();
    vitalsPublishElapsed = 0;
    publishPlayerVitals(true);
    return playerVitals;
  };
  publishPlayerVitals(true);
  publishPlayerSpeed(0, true);
  const captureSceneState = (): VisualSceneState => {
    const cameraPosition: VisualSceneState["cameraPosition"] = [
      camera.position.x,
      activeView === "seat"
        ? isCrouched
          ? SEATED_EYE_HEIGHT
          : STANDING_EYE_HEIGHT
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
  };
  const clearWallTraversal = (): void => {
    wallHangState = null;
    wallClimbTransition = null;
    wallHangElapsed = 0;
  };
  const beginWallClimb = (): void => {
    const wall = wallHangState;
    if (wall === null || wallClimbTransition !== null) {
      return;
    }
    const targetPosition = resolveWallClimbTarget(wall);
    const clearPosition: PhysicsVector = {
      x: wall.target.x,
      y: targetPosition.y,
      z: wall.target.z,
    };
    const liftDistance = Math.max(0, clearPosition.y - wall.target.y);
    const crossDistance = Math.hypot(
      targetPosition.x - clearPosition.x,
      targetPosition.z - clearPosition.z,
    );
    wallClimbTransition = {
      elapsed: 0,
      liftDuration: Math.max(WALL_CLIMB_MIN_PHASE_DURATION, liftDistance / WALL_CLIMB_SPEED),
      crossDuration: Math.max(WALL_CLIMB_MIN_PHASE_DURATION, crossDistance / WALL_CLIMB_SPEED),
      startPosition: { ...wall.target },
      clearPosition,
      targetPosition,
    };
    wallHangState = null;
    wallHangElapsed = 0;
    grounded = false;
    verticalVelocity = 0;
    forwardVelocity = 0;
    strafeVelocity = 0;
  };
  const resetCameraMotion = (): void => {
    cameraMotion.reset();
    camera.updateMatrix();
  };
  const movementKeys = MOVEMENT_KEY_CODES;
  let jumpKeyHeld = false;
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
    if (isCrouched && !nextCrouched && !spendPlayerO2(O2_STAND_COST)) {
      return false;
    }
    isCrouched = nextCrouched;
    return true;
  };
  const startSprint = (): void => {
    const sprintAccepted = !isCrouched || setCrouched(false);
    isCrouched = resolveCrouchedStateAfterSprint(isCrouched, sprintAccepted);
    if (isCrouched) {
      isSprinting = false;
      return;
    }
    isSprinting = true;
    // Sprinting is a committed locomotion action: leave the persistent
    // right-mouse zoom mode before the faster movement begins.
    if (rightMouseAiming) {
      rightMouseAiming = false;
      syncAimingFromInput();
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const leftCommandKey = isLeftCommandKeyEvent(event);
    const captureLeftCommand = shouldCaptureLeftCommandKeystroke(event, leftCommandHeld);
    const controlsActive =
      firstPersonControls.isLocked || (isTouchDevice && firstPersonControls.enabled);
    if (activeView !== "seat" || (!controlsActive && !captureLeftCommand)) {
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
      /^Digit[0-4]$/u.test(event.code)
    ) {
      event.preventDefault();
      if (event.code === "KeyE") {
        if (!event.repeat) {
          weaponRuntime?.interact();
        }
      } else if (event.code === "KeyR") {
        if (!event.repeat) {
          weaponRuntime?.reload();
        }
      } else if (event.code === "KeyQ") {
        if (!event.repeat) {
          weaponRuntime?.cycleWeapon(-1);
        }
      } else if (/^Digit[0-4]$/u.test(event.code)) {
        if (!event.repeat) {
          const weapon = resolveWeaponHotkey(event.code);
          if (weapon === null) {
            weaponRuntime?.holster();
          } else if (weapon !== undefined) {
            weaponRuntime?.cycleWeaponTo(weapon);
          }
        }
      } else if (crouchKeys.has(event.code)) {
        if (!event.repeat) {
          setCrouched(!isCrouched);
        }
      } else if (event.code === "Space") {
        jumpKeyHeld = true;
        jump();
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
  const jump = (): boolean => {
    if (activeView === "seat" && wallHangState !== null) {
      beginWallClimb();
      return isCrouched;
    }
    if (
      activeView === "seat" &&
      grounded &&
      ledgeClimbTransition === null &&
      wallClimbTransition === null
    ) {
      const fullJumpAccepted = spendPlayerO2(O2_JUMP_COST, O2_JUMP_RECOVERY_DELAY_SECONDS);
      if (!fullJumpAccepted && playerVitals.isDead) {
        return isCrouched;
      }
      const launchSpeed = resolveJumpLaunchSpeed(fullJumpAccepted);
      isCrouched = resolveCrouchedStateAfterJump(isCrouched, true);
      verticalVelocity = launchSpeed;
      grounded = false;
      cameraMotion.applyJumpImpulse(launchSpeed);
    }
    return isCrouched;
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
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    exerciseIntensity = 0;
    sprintingActivity = false;
    crouchWalkingActivity = false;
    walkingActivity = false;
    crouchedActivity = false;
    leftCommandHeld = false;
    rightMouseAiming = false;
    syncAimingFromInput();
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
    if (event.button === 2) {
      event.preventDefault();
      rightMouseAiming = !rightMouseAiming;
      syncAimingFromInput();
      return;
    }
    if (event.button !== 0) {
      return;
    }
    weaponRuntime?.setFireHeld(true);
    weaponRuntime?.fire();
  };
  const onWindowMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
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
    const preset = cameraPresets.seat;
    firstPersonGroundY = 0;
    eyeHeight = STANDING_EYE_HEIGHT;
    isCrouched = false;
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
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    syncPhysicsCharacterToCamera();
    resetMotionCalibration();
  };
  const setComposedTablePreset = (): void => {
    const preset = cameraPresets.seat;
    firstPersonGroundY = 0;
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
    setCameraPreset(camera, orbitControls, view);
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
    jumpOffset = 0;
    verticalVelocity = 0;
    grounded = true;
    ledgeClimbTransition = null;
    clearWallTraversal();
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastMovementTapAtByKey.clear();

    const preset = cameraPresets.seat;
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    debugFovOverride = null;
    camera.fov = debugEnabled ? DEBUG_STANDING_FOV : SEAT_STANDING_FOV;
    camera.updateProjectionMatrix();
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    resetMotionCalibration();
    syncPhysicsCharacterToCamera();
    saveSceneState(true);
  };

  const setDebugCameraPreset = (preset: VisualCameraPreset): void => {
    if (!debugEnabled) {
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
      eyeHeight = STANDING_EYE_HEIGHT;
      isCrouched = false;
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
        CLIMBING_GYM_RUN_Y + STANDING_EYE_HEIGHT,
        CLIMBING_GYM_PRESET_START_Z,
      );
      camera.lookAt(
        CLIMBING_GYM_PRESET_TARGET_X,
        CLIMBING_GYM_RUN_Y + STANDING_EYE_HEIGHT,
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

    activeView = "overhead";
    firstPersonControls.enabled = false;
    if (firstPersonControls.isLocked) {
      firstPersonControls.unlock();
    }
    onWindowBlur();
    physicsCharacterPosition = null;
    orbitControls.enabled = true;
    const cameraPreset = visualCameraPresets[preset];
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
      ledgeClimbTransition = null;
      eyeHeight = isCrouched ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
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
    firstPersonGroundY = 0;
    isCrouched = state.isCrouched;
    eyeHeight = isCrouched ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
    camera.position.x = THREE.MathUtils.clamp(
      state.cameraPosition[0],
      WORLD_BOUNDS.minX,
      WORLD_BOUNDS.maxX,
    );
    camera.position.y = eyeHeight;
    camera.position.z = THREE.MathUtils.clamp(
      state.cameraPosition[2],
      WORLD_BOUNDS.minZ,
      WORLD_BOUNDS.maxZ,
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

  const setDebugFogDensity = (density: number): void => {
    debugFogDensity = THREE.MathUtils.clamp(density, 0, 0.04);
    if (debugFogDensity === 0) {
      scene.fog = null;
      persistDebugPreferences();
      return;
    }
    const nextFog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(COLORS.haze, 10, 34);
    scene.fog = nextFog;
    nextFog.far = THREE.MathUtils.clamp(46 - debugFogDensity * 666.6667, 14, 44);
    nextFog.near = THREE.MathUtils.clamp(nextFog.far * 0.3, 4, 12);
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
      cameraMotion.clearShift();
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
    setO2BlurPassSize(o2BlurPass, width * pixelRatio, height * pixelRatio);
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

  const defaultDebugPreferences = (): VisualDebugPreferences => ({
    version: VISUAL_DEBUG_PREFERENCES_VERSION,
    cameraPreset: null,
    fov: DEBUG_STANDING_FOV,
    exposure: 1.02,
    toneMapper: "agx",
    fogDensity: 0.028,
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
    lastDofZoomed = null;
    saveDebugPreferences();
  };

  const getDebugSnapshot = (): SceneDebugSnapshot => ({
    roomSeed,
    roomVariant: generatedRoomVariant,
    explorationArea,
    loadedExplorationChunks,
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

  const architectureResources = addFloor(scene, quality);
  glassSurfaces = architectureResources.glassSurfaces;
  simpleGlassMaterial = architectureResources.simpleGlassMaterial;
  physicalGlassMaterial = architectureResources.physicalGlassMaterial;
  const generatedRoom = createGeneratedRoom(
    scene,
    roomSeed,
    authoredRoomMap,
    architectureResources.surfaceTextures,
  );
  generatedRoomVariant = generatedRoom.variant;
  const focusCalibration = createFocusCalibrationHallway(
    scene,
    architectureResources.surfaceTextures,
  );
  focusCalibrationRoot = focusCalibration.root;
  focusCalibrationLabels = focusCalibration.labels;
  // Keep the penthouse clean and uncluttered; intentionally suppress the framed
  // gateway marker that is useful for debug layouting but reads as a door frame.
  if (INCLUDE_EXPLORATION_GATEWAY) {
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
  scene.environmentIntensity = debugEnvironmentIntensity;
  const table = createTable(architectureResources.surfaceTextures);
  scene.add(table);
  const textureCache = createTextureCache(architectureResources.surfaceTextures.detail);
  const wallRoot = createWall(textureCache);
  scene.add(wallRoot);
  const anchors = createPresentationAnchors(scene, table, wallRoot);
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
  const seatLabels = [
    addLabel(scene, "YOU · SOUTH", new THREE.Vector3(0, 1.38, 1.78), "#e94136"),
    addLabel(scene, "NORTH · VALUE", new THREE.Vector3(0, 1.38, -1.78), "#73dce8"),
    addLabel(scene, "EAST · FAST", new THREE.Vector3(1.78, 1.38, 0), "#e94136"),
    addLabel(scene, "WEST · BALANCED", new THREE.Vector3(-1.78, 1.38, 0), "#73dce8"),
  ];

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
  cyanMaterials = [...architectureResources.ambient.cyanMaterials];
  redMaterials = [...architectureResources.ambient.redMaterials];
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
  const debugBoundTargets = [scene.getObjectByName("EnvironmentRoot"), table, wallRoot];
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
  if (persistedSceneState === null && activeDebugPreset === null && initialView === "seat") {
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
    const hidden: Array<{ readonly object: THREE.Object3D; readonly visible: boolean }> = [];
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
  staticPhysicsBoxes = createStaticPhysicsBoxes(scene);
  const weaponReservedRects: readonly WeaponSpawnRect[] = PLAY_AREA_BOUNDS.map((bounds) => ({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  }));
  const weaponPickups = generateWeaponPickups(roomSeed, {
    worldHalfSize: EXPLORATION_WORLD_HALF_SIZE,
    reservedRects: weaponReservedRects,
    obstacles: [...staticPhysicsBoxes, ...(explorationWorld?.getPhysicsBoxes() ?? [])],
  });
  weaponRuntime = createWeaponRuntime(
    scene,
    camera,
    roomSeed,
    weaponPickups,
    options.onWeaponStateChange,
    (damage, projectileCount) => {
      spendPlayerProjectileO2(damage, projectileCount);
      const motion = cameraMotion.getOffsets();
      cameraMotion.applyWeaponShotImpulse({
        damage,
        reticleOffset: resolveWeaponShotReticleOffset(
          motion,
          true,
          aimingDownSights ? ZOOM_RECOIL_FEEDBACK_MULTIPLIER : 1,
        ),
      });
    },
    (hasOutgoingWeapon) => {
      cameraMotion.applyWeaponSwitchImpulse({ hasOutgoingWeapon });
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
  const initialPhysicsBoxes = explorationWorld?.getPhysicsBoxes() ?? [];
  fallbackPhysicsRuntime.setDynamicBoxes(initialPhysicsBoxes);
  dynamicPhysicsBoxes = initialPhysicsBoxes;
  appliedPhysicsVersion = explorationWorld?.getPhysicsVersion() ?? 0;
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
  const focusTileSampleOffsets: readonly THREE.Vector2[] = [
    new THREE.Vector2(BOKEH_TILE_SAMPLE_OFFSET, 0),
    new THREE.Vector2(-BOKEH_TILE_SAMPLE_OFFSET, 0),
    new THREE.Vector2(0, BOKEH_TILE_SAMPLE_OFFSET),
    new THREE.Vector2(0, -BOKEH_TILE_SAMPLE_OFFSET),
  ];
  const findVisibleFocusIntersection = (ndc: THREE.Vector2): THREE.Intersection | undefined => {
    focusRaycaster.setFromCamera(ndc, camera);
    return focusRaycaster
      .intersectObjects(scene.children, true)
      .find((intersection) => !isDofIgnored(intersection.object));
  };
  const reticleAimNdc = new THREE.Vector2();
  const getReticlePresentation = (): {
    readonly bobbingOffset: ReticleBobbingOffset;
    readonly aimNdc: THREE.Vector2;
  } => {
    const motion = cameraMotion.getOffsets();
    const bobbingOffset: ReticleBobbingOffset = {
      x:
        motion.roll * RETICLE_SWAY_PIXELS_PER_RADIAN +
        motion.aimSwayX * RETICLE_AIM_SWAY_PIXELS_PER_RADIAN +
        motion.recoilYaw * RETICLE_RECOIL_PIXELS_PER_RADIAN,
      y:
        motion.verticalOffset * RETICLE_HEAD_BOB_PIXELS_PER_METER +
        motion.aimSwayY * RETICLE_AIM_SWAY_PIXELS_PER_RADIAN +
        motion.recoilPitch * RETICLE_RECOIL_PIXELS_PER_RADIAN,
    };
    const aimNdc = resolveReticleAimNdc(
      reticlePosition,
      bobbingOffset,
      container.clientWidth,
      container.clientHeight,
    );
    reticleAimNdc.set(aimNdc.x, aimNdc.y);
    return { bobbingOffset, aimNdc: reticleAimNdc };
  };
  const getAimRay = (): { origin: THREE.Vector3; direction: THREE.Vector3 } => {
    const { aimNdc } = getReticlePresentation();
    focusRaycaster.setFromCamera(aimNdc, camera);
    return {
      origin: focusRaycaster.ray.origin.clone(),
      direction: focusRaycaster.ray.direction.clone(),
    };
  };
  /** Apply the shared first-person presentation damper after physics resolves the base pose. */
  const applyFirstPersonCameraMotion = (
    baseCameraY: number,
    input: CameraMotionUpdateInput,
  ): CameraMotionOffsets => {
    const motion = cameraMotion.update(input);
    camera.position.y = baseCameraY + motion.verticalOffset;
    camera.updateMatrix();
    if (Math.abs(motion.recoilYaw) > 0.0001 || Math.abs(motion.recoilPitch) > 0.0001) {
      cameraRecoilEuler.set(motion.recoilPitch, motion.recoilYaw, 0);
      cameraRecoilMatrix.makeRotationFromEuler(cameraRecoilEuler);
      camera.matrix.multiply(cameraRecoilMatrix);
      camera.matrixWorldNeedsUpdate = true;
    }
    if (Math.abs(motion.roll) > 0.0001) {
      cameraRollMatrix.makeRotationZ(motion.roll);
      camera.matrix.multiply(cameraRollMatrix);
      camera.matrixWorldNeedsUpdate = true;
    }
    return motion;
  };
  const getReticleBobbingOffset = (): ReticleBobbingOffset => {
    return getReticlePresentation().bobbingOffset;
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
    const delta = THREE.MathUtils.clamp(timer.getDelta(), 0, 0.05);
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
      if (motionLookEnabled && motionTargetValid) {
        camera.quaternion.slerp(motionTargetQuaternion, 1 - Math.exp(-18 * delta));
      }
      // Rebuild the upright control matrix before PointerLockControls moves.
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      const crouching = isCrouched;
      const targetEyeHeight = crouching ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
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
          joggingMovement = fastMovementRequested && !sprintingMovement;
          const preservedSpeedCap = sprintingMovement
            ? preservedSpeed
            : Math.min(
                preservedSpeed,
                moveSpeed *
                  resolvePlayerMovementSpeedMultiplier({
                    crouching,
                    sprinting: reloadingMovement ? fastMovementRequested : sprintingMovement,
                    jogging: joggingMovement,
                    reloading: reloadingMovement,
                  }),
              );
          currentMoveSpeed = Math.max(
            moveSpeed *
              resolvePlayerMovementSpeedMultiplier({
                crouching,
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
        const fastMovementRequested = !crouching && touchMagnitude > 0.05;
        sprintingMovement =
          fastMovementRequested &&
          !reloadingMovement &&
          canAffordPlayerO2Cost(playerVitals, O2_SPRINT_DRAIN_PER_SECOND * delta * touchMagnitude);
        joggingMovement = fastMovementRequested && !sprintingMovement;
        const touchSpeedMultiplier = crouching
          ? 0.5
          : sprintingMovement
            ? SPRINT_MULTIPLIER * sprintCap
            : joggingMovement
              ? NEUTRAL_JOG_SPEED_MULTIPLIER
              : 1;
        const reloadTouchSpeedMultiplier = reloadingMovement
          ? Math.min(
              (fastMovementRequested ? SPRINT_MULTIPLIER * sprintCap : 1) * touchMagnitude,
              NEUTRAL_JOG_SPEED_MULTIPLIER,
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
        joggingMovement = fastMovementRequested && !sprintingMovement;
        const speedMultiplier = resolvePlayerMovementSpeedMultiplier({
          crouching,
          sprinting: reloadingMovement ? fastMovementRequested : sprintingMovement,
          jogging: joggingMovement,
          reloading: reloadingMovement,
        });
        currentMoveSpeed = moveSpeed * speedMultiplier;
      }
      if (wallHangState !== null) {
        wallHangElapsed = Math.min(wallHangElapsed + delta, WALL_HANG_SETTLE_DURATION);
        if (forward < -0.1) {
          wallHangState = null;
          wallHangElapsed = 0;
          grounded = false;
          verticalVelocity = 0;
        } else if (wallHangElapsed >= WALL_HANG_SETTLE_DURATION && (forward > 0.1 || jumpKeyHeld)) {
          beginWallClimb();
        }
      }
      const isWallTraversalActive = wallHangState !== null || wallClimbTransition !== null;
      const desiredForward = isWallTraversalActive ? 0 : forward * inputScale * currentMoveSpeed;
      const desiredStrafe = isWallTraversalActive ? 0 : right * inputScale * currentMoveSpeed;
      const maxMoveSpeed = moveSpeed * SPRINT_MULTIPLIER;
      const movementSpeedRatio = THREE.MathUtils.clamp(currentMoveSpeed / maxMoveSpeed, 0, 1);
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
      if (isWallTraversalActive) {
        forwardVelocity = 0;
        strafeVelocity = 0;
      } else {
        forwardVelocity = THREE.MathUtils.damp(forwardVelocity, desiredForward, 10, delta);
        strafeVelocity = THREE.MathUtils.damp(strafeVelocity, desiredStrafe, 10, delta);
      }
      const movementStart = camera.position.clone();
      if (!isLedgeClimbing && !isWallTraversalActive && Math.abs(forwardVelocity) > 0.001) {
        firstPersonControls.moveForward(forwardVelocity * delta);
      }
      if (!isLedgeClimbing && !isWallTraversalActive && Math.abs(strafeVelocity) > 0.001) {
        firstPersonControls.moveRight(strafeVelocity * delta);
      }
      const desiredHorizontalDelta = camera.position.clone().sub(movementStart);
      let baseCameraY: number;
      if (physicsRuntime !== null) {
        camera.position.copy(movementStart);
        if (wallHangState !== null || wallClimbTransition !== null) {
          knockImpactDelta = { x: 0, y: 0, z: 0 };
          knockCollisionCount = 0;
          if (wallHangState !== null) {
            const target = wallHangState.target;
            physicsCharacterPosition = { ...target };
            grounded = false;
            verticalVelocity = 0;
            jumpOffset = Math.max(0, target.y - PLAYER_COLLIDER_CENTER_HEIGHT);
            camera.position.x = target.x;
            camera.position.z = target.z;
            baseCameraY = target.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
          } else {
            const transition = wallClimbTransition;
            if (transition === null) {
              baseCameraY = camera.position.y;
            } else {
              transition.elapsed = Math.min(
                transition.elapsed + delta,
                transition.liftDuration + transition.crossDuration,
              );
              const liftProgress = THREE.MathUtils.clamp(
                transition.elapsed / transition.liftDuration,
                0,
                1,
              );
              const crossProgress = THREE.MathUtils.clamp(
                (transition.elapsed - transition.liftDuration) / transition.crossDuration,
                0,
                1,
              );
              const position =
                transition.elapsed <= transition.liftDuration
                  ? {
                      x: transition.startPosition.x,
                      y: THREE.MathUtils.lerp(
                        transition.startPosition.y,
                        transition.clearPosition.y,
                        smoothStep(liftProgress),
                      ),
                      z: transition.startPosition.z,
                    }
                  : {
                      x: THREE.MathUtils.lerp(
                        transition.clearPosition.x,
                        transition.targetPosition.x,
                        smoothStep(crossProgress),
                      ),
                      y: transition.clearPosition.y,
                      z: THREE.MathUtils.lerp(
                        transition.clearPosition.z,
                        transition.targetPosition.z,
                        smoothStep(crossProgress),
                      ),
                    };
              physicsCharacterPosition = position;
              grounded = false;
              verticalVelocity = 0;
              jumpOffset = Math.max(0, position.y - PLAYER_COLLIDER_CENTER_HEIGHT);
              camera.position.x = position.x;
              camera.position.z = position.z;
              baseCameraY = position.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
              if (transition.elapsed >= transition.liftDuration + transition.crossDuration) {
                const landing = physicsRuntime.move(transition.targetPosition, {
                  x: 0,
                  y: -0.14,
                  z: 0,
                });
                const landedPosition: PhysicsVector = {
                  x: THREE.MathUtils.clamp(
                    landing.position.x,
                    WORLD_BOUNDS.minX,
                    WORLD_BOUNDS.maxX,
                  ),
                  y: landing.position.y,
                  z: THREE.MathUtils.clamp(
                    landing.position.z,
                    WORLD_BOUNDS.minZ,
                    WORLD_BOUNDS.maxZ,
                  ),
                };
                physicsCharacterPosition = landedPosition;
                grounded = landing.grounded;
                verticalVelocity = 0;
                jumpOffset = Math.max(0, landedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
                camera.position.x = landedPosition.x;
                camera.position.z = landedPosition.z;
                baseCameraY = landedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
                wallClimbTransition = null;
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
          if (movement.collisions > 0 && impactDamageCooldown <= 0 && delta > 0) {
            const requestedVelocity = {
              x: desiredHorizontalDelta.x / delta,
              z: desiredHorizontalDelta.z / delta,
            };
            const resolvedVelocity = {
              x: (movement.position.x - characterPosition.x) / delta,
              z: (movement.position.z - characterPosition.z) / delta,
            };
            const requestedSpeed = Math.hypot(requestedVelocity.x, requestedVelocity.z);
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
              damagePlayer(collisionDamage);
              impactDamageCooldown = COLLISION_DAMAGE_COOLDOWN_SECONDS;
            }
          }
          knockImpactDelta = {
            x: desiredHorizontalDelta.x,
            y: 0,
            z: desiredHorizontalDelta.z,
          };
          knockCollisionCount = movement.collisions;
          const clampedPosition: PhysicsVector = {
            x: THREE.MathUtils.clamp(movement.position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
            y: movement.position.y,
            z: THREE.MathUtils.clamp(movement.position.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ),
          };
          const canUseAirborneTraversal =
            !grounded &&
            (!movement.grounded || verticalVelocity > 0) &&
            jumpOffset > LEDGE_GRAB_MIN_FALL_OFFSET &&
            desiredHorizontalDelta.x ** 2 + desiredHorizontalDelta.z ** 2 > 0.0002;
          const canUseLedgeGrab =
            canUseAirborneTraversal && verticalVelocity <= 0 && movement.collisions > 0;
          let ledgeGrabTarget: PhysicsVector | null = null;
          if (canUseLedgeGrab) {
            ledgeGrabTarget = resolveLedgeGrabTarget(
              characterPosition,
              desiredHorizontalDelta,
              characterPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT,
              staticPhysicsBoxes,
              dynamicPhysicsBoxes,
            );
          }
          let vaultTarget: PhysicsVector | null = null;
          if (ledgeGrabTarget === null && canUseAirborneTraversal) {
            const vaultPhysicsBoxes =
              dynamicPhysicsBoxes.length === 0
                ? staticPhysicsBoxes
                : [...staticPhysicsBoxes, ...dynamicPhysicsBoxes];
            vaultTarget = resolveVaultTarget(
              characterPosition,
              desiredHorizontalDelta,
              characterPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT,
              vaultPhysicsBoxes,
            );
          }
          let wallHangResolution: WallHangResolution | null = null;
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
          const wallContact = horizontalMotionBlocked;
          if (
            ledgeGrabTarget === null &&
            vaultTarget === null &&
            ledgeClimbTransition === null &&
            canUseAirborneTraversal &&
            wallContact &&
            wallApproach !== null
          ) {
            // Streamed buildings and authored obstacle boxes live in the second
            // physics set. They are still static for traversal purposes; only
            // knocked props are marked dynamic and must not become hang points.
            const wallHangPhysicsBoxes =
              dynamicPhysicsBoxes.length === 0
                ? staticPhysicsBoxes
                : [
                    ...staticPhysicsBoxes,
                    ...dynamicPhysicsBoxes.filter((box) => box.dynamic !== true),
                  ];
            // Use Rapier's corrected contact position first. This prevents a
            // ceiling or unrelated side contact from stealing a nearby wall.
            // For a long horizontal sweep, retry the safe pre-move point only
            // when the approach itself was blocked.
            wallHangResolution = resolveWallHangTargetDetails(
              clampedPosition,
              wallApproach,
              wallHangPhysicsBoxes,
            );
            if (wallHangResolution === null && horizontalMotionBlocked) {
              wallHangResolution = resolveWallHangTargetDetails(
                characterPosition,
                wallApproach,
                wallHangPhysicsBoxes,
              );
            }
          }
          const climbTarget = ledgeGrabTarget ?? vaultTarget;
          if (climbTarget !== null && ledgeClimbTransition === null) {
            const climbStartX = clampedPosition.x;
            const climbStartY = clampedPosition.y;
            const climbStartZ = clampedPosition.z;
            const clampedX = THREE.MathUtils.clamp(
              climbTarget.x,
              WORLD_BOUNDS.minX,
              WORLD_BOUNDS.maxX,
            );
            const clampedZ = THREE.MathUtils.clamp(
              climbTarget.z,
              WORLD_BOUNDS.minZ,
              WORLD_BOUNDS.maxZ,
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
            clampedPosition.x = clampedX;
            clampedPosition.z = clampedZ;
            clampedPosition.y = climbTarget.y;
            ledgeClimbTransition = {
              duration: LEDGE_CLIMB_DURATION,
              elapsed: 0,
              phase: "vault",
              startX: climbStartX,
              startY: climbStartY,
              startZ: climbStartZ,
              targetX: clampedPosition.x,
              targetY: clampedPosition.y,
              targetZ: clampedPosition.z,
              preservedForwardVelocity: momentum.preservedForwardVelocity,
              preservedStrafeVelocity: momentum.preservedStrafeVelocity,
              preserveSprinting: momentum.preserveSprinting,
              landingBoostDistance,
            };
            grounded = true;
            verticalVelocity = 0;
          }
          if (wallHangResolution !== null && climbTarget === null) {
            clampedPosition.x = wallHangResolution.target.x;
            clampedPosition.y = wallHangResolution.target.y;
            clampedPosition.z = wallHangResolution.target.z;
            wallHangState = {
              target: wallHangResolution.target,
              wallNormal: wallHangResolution.wallNormal,
              wallFacePoint: wallHangResolution.wallFacePoint,
              wallTopY: wallHangResolution.wallTopY,
              box: wallHangResolution.box,
              approachDirection: {
                x: desiredHorizontalDelta.x / horizontalApproachDistance,
                y: 0,
                z: desiredHorizontalDelta.z / horizontalApproachDistance,
              },
              elapsed: 0,
            };
            wallHangElapsed = 0;
            grounded = false;
            verticalVelocity = 0;
            forwardVelocity = 0;
            strafeVelocity = 0;
          }
          physicsCharacterPosition = clampedPosition;
          grounded =
            wallHangResolution !== null
              ? false
              : climbTarget === null
                ? movement.grounded && verticalVelocity <= 0
                : true;
          if (
            !wasGrounded &&
            movement.grounded &&
            climbTarget === null &&
            wallHangResolution === null
          ) {
            const landingVelocity = Math.max(0, -verticalVelocity);
            cameraMotion.applyLandingImpulse({
              downwardVelocity: landingVelocity,
              downwardAcceleration: landingVelocity / Math.max(delta, 1 / 120),
            });
            const fallDamage = resolveImpactDamage(maximumFallSpeed);
            if (fallDamage > 0) {
              damagePlayer(fallDamage);
            }
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
            transition.elapsed = Math.min(transition.elapsed + delta, transition.duration);
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
            const transitionY =
              transition.phase === "vault"
                ? THREE.MathUtils.lerp(transition.startY, transition.targetY, progress) +
                  Math.sin(progress * Math.PI) * LEDGE_CLIMB_ARC_HEIGHT
                : THREE.MathUtils.lerp(transition.startY, transition.targetY, progress);
            camera.position.x = transitionX;
            camera.position.z = transitionZ;
            baseCameraY = resolveLedgeClimbTargetCameraY(transitionY);
            jumpOffset = Math.max(0, transitionY - PLAYER_COLLIDER_CENTER_HEIGHT);
            forwardVelocity = transition.preservedForwardVelocity;
            strafeVelocity = transition.preservedStrafeVelocity;
            physicsCharacterPosition = {
              x: transitionX,
              y: transitionY,
              z: transitionZ,
            };
            if (transition.elapsed >= transition.duration) {
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
                transition.startX = transition.targetX;
                transition.startY = transition.targetY;
                transition.startZ = transition.targetZ;
                transition.targetX = landingTargetX;
                transition.targetY = transition.targetY;
                transition.targetZ = landingTargetZ;
                transition.duration = LEDGE_CLIMB_EXIT_BOOST_DURATION;
                transition.elapsed = 0;
                transition.phase = "landingBoost";
              } else {
                const targetX = transition.targetX;
                const targetY = transition.targetY;
                const targetZ = transition.targetZ;
                ledgeClimbTransition = null;
                grounded = true;
                verticalVelocity = 0;
                jumpOffset = Math.max(0, targetY - PLAYER_COLLIDER_CENTER_HEIGHT);
                physicsCharacterPosition = {
                  x: targetX,
                  y: targetY,
                  z: targetZ,
                };
                camera.position.set(targetX, resolveLedgeClimbTargetCameraY(targetY), targetZ);
              }
            }
            if (transition.phase === "landingBoost" && transition.elapsed >= transition.duration) {
              const targetX = transition.targetX;
              const targetY = transition.targetY;
              const targetZ = transition.targetZ;
              ledgeClimbTransition = null;
              grounded = true;
              verticalVelocity = 0;
              jumpOffset = Math.max(0, targetY - PLAYER_COLLIDER_CENTER_HEIGHT);
              physicsCharacterPosition = {
                x: targetX,
                y: targetY,
                z: targetZ,
              };
              camera.position.set(targetX, resolveLedgeClimbTargetCameraY(targetY), targetZ);
            }
          }
        }
      } else {
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x,
          WORLD_BOUNDS.minX,
          WORLD_BOUNDS.maxX,
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z,
          WORLD_BOUNDS.minZ,
          WORLD_BOUNDS.maxZ,
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
              const landingVelocity = Math.max(0, -verticalVelocity);
              cameraMotion.applyLandingImpulse({
                downwardVelocity: landingVelocity,
                downwardAcceleration: landingVelocity / Math.max(delta, 1 / 120),
              });
              maximumFallSpeed = 0;
            }
            verticalVelocity = 0;
            grounded = true;
          }
        }
        baseCameraY = firstPersonGroundY + eyeHeight + jumpOffset;
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
      touchingWall = isPlayerTouchingWall(wallContactPosition, wallContactBoxes, {
        radius: PLAYER_COLLIDER_RADIUS,
        halfHeight: PLAYER_COLLIDER_HALF_HEIGHT,
      });
      wallBracedAim = touchingWall && aimingDownSights;
      if (jumpKeyHeld) {
        jump();
      }
      applyFirstPersonCameraMotion(baseCameraY, {
        deltaSeconds: delta,
        lateralInput: debugCameraShiftEnabled ? right : 0,
        movementMagnitude,
        movementSpeedRatio,
        oxygenRatio: playerVitals.o2 / PLAYER_MAX_O2,
        crouching,
        shiftEnabled: debugCameraShiftEnabled,
        bobEnabled: debugCameraBobEnabled,
        aimingDownSights,
        holdingBreath: playerVitals.holdingBreath,
        stabilizedByWall: wallBracedAim,
        traversalActive:
          ledgeClimbTransition !== null || wallHangState !== null || wallClimbTransition !== null,
      });
    } else {
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
    camera.updateMatrixWorld(true);
    weaponRuntime?.update(
      delta,
      camera.position,
      getAimRay(),
      firstPersonActive,
      activeView === "seat" && firstPersonControls.enabled,
      cameraMotion.getOffsets().viewmodelOffset,
      cameraMotion.getOffsets().viewmodelTransition,
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
    if (debugBokehEnabled) {
      const reticlePresentation = getReticlePresentation();
      centerFocusHit = findVisibleFocusIntersection(reticlePresentation.aimNdc);
      tileFocusHit =
        centerFocusHit !== undefined && isDofFocusTarget(centerFocusHit.object)
          ? centerFocusHit
          : undefined;
      let tileFocusOffset = Number.POSITIVE_INFINITY;
      if (tileFocusHit === undefined) {
        for (const offset of focusTileSampleOffsets) {
          const sampleNdc = reticlePresentation.aimNdc.clone().add(offset);
          const sampleHit = findVisibleFocusIntersection(sampleNdc);
          if (sampleHit === undefined || !isDofFocusTarget(sampleHit.object)) {
            continue;
          }
          const sampleOffset = offset.lengthSq();
          if (sampleOffset < tileFocusOffset) {
            tileFocusHit = sampleHit;
            tileFocusOffset = sampleOffset;
          }
        }
      }
    }
    // Keep the original nearest-surface behavior when the reticule is not on
    // a tile, but allow a tile immediately around the reticule to become the
    // subject when the center falls in a narrow gap between tile faces.
    const focusHit = tileFocusHit ?? centerFocusHit;
    const nextFocusDistance = focusHit?.distance ?? BOKEH_FOCUS_FALLBACK_DISTANCE;
    focusTarget = debugBokehEnabled
      ? tileFocusHit !== undefined
        ? "tile"
        : centerFocusHit !== undefined
          ? "surface"
          : "fallback"
      : "fallback";
    focusDistance = THREE.MathUtils.damp(
      focusDistance,
      nextFocusDistance,
      resolveFocusAccommodationDamping(focusDistance, nextFocusDistance),
      delta,
    );
    pupilDiameterMm = THREE.MathUtils.damp(
      pupilDiameterMm,
      resolveHumanEyePupilDiameter(estimatedLuminance),
      BOKEH_PUPIL_ADAPTATION_DAMPING,
      delta,
    );
    const bokeh = resolveHumanEyeBokeh(focusDistance, pupilDiameterMm);
    bokehIntensity = bokeh.intensity * debugBokehStrength;
    const focusUniform = bokehPass.materialBokeh.uniforms.focus;
    if (focusUniform !== undefined) {
      focusUniform.value = focusDistance;
    }
    const apertureUniform = bokehPass.materialBokeh.uniforms.aperture;
    const maxBlurUniform = bokehPass.materialBokeh.uniforms.maxblur;
    if (apertureUniform !== undefined) {
      apertureUniform.value = bokeh.aperture * debugBokehStrength;
    }
    if (maxBlurUniform !== undefined) {
      maxBlurUniform.value = bokeh.maxBlur * debugBokehStrength;
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
    jump,
    fire: () => weaponRuntime?.fire(),
    reload: () => weaponRuntime?.reload(),
    interact: () => weaponRuntime?.interact(),
    cycleWeapon: (direction = 1) => weaponRuntime?.cycleWeapon(direction),
    cycleWeaponTo: (weapon) => weaponRuntime?.cycleWeaponTo(weapon),
    setReticlePosition: setFocusReticle,
    getReticleBobbingOffset,
    getAimRay,
    applyDamage: damagePlayer,
    getVitals: () => playerVitals,
    resetVitals: resetVitalsState,
    debug: {
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
      weaponRuntime?.dispose();
      weaponRuntime = null;
      explorationWorld?.dispose();
      explorationWorld = null;
      disposeObject(scene);
      simpleGlassMaterial.dispose();
      physicalGlassMaterial.dispose();
      environmentTexture.dispose();
      disposeObject(roomEnvironment);
      pmremGenerator.dispose();
      gtaoPass.dispose();
      bokehPass.dispose();
      sniperScopePass.dispose();
      o2BlurPass.dispose();
      sniperScopeSceneTarget.dispose();
      composer.dispose();
      architectureResources.teacherTexture.dispose();
      architectureResources.weaponChartTexture.dispose();
      for (const texture of Object.values(architectureResources.surfaceTextures)) {
        texture.dispose();
      }
      textureCache.back.dispose();
      for (const texture of textureCache.face.values()) {
        texture.dispose();
      }
      for (const label of [...seatLabels, ...focusCalibrationLabels]) {
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
