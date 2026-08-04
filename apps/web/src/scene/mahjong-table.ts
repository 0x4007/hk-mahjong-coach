import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createSeededRandom, getTileDefinition, type TileTypeId } from "@hk-mahjong/core/public";

import {
  createMahjongPhysics,
  type MahjongPhysicsRuntime,
  type PhysicsBox,
  type PhysicsVector,
} from "./mahjong-physics.js";

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
  "table" | "roomReveal" | "skylineReview" | "assetReview" | "focusCalibration";

export type VisualToneMapper = "agx" | "neutral" | "cineon" | "linear";

export type VisualShadowQuality = "off" | "medium" | "high";

export type VisualSkylineLayer = "near" | "hero" | "fillers" | "distant";

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
const WORLD_BOUNDS = {
  minX: -60,
  maxX: 60,
  minZ: -52,
  maxZ: 52,
} as const;
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
  value === "skylineReview" ||
  value === "assetReview" ||
  value === "focusCalibration";

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
  readonly skylineVisible: boolean;
  readonly skylineLayers: Readonly<Record<VisualSkylineLayer, boolean>>;
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

const isSkylineLayerPreferences = (
  value: unknown,
): value is Readonly<Record<VisualSkylineLayer, boolean>> => {
  if (!isRecord(value)) {
    return false;
  }
  return ["near", "hero", "fillers", "distant"].every((layer) => isBoolean(value[layer]));
};

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
    isBoundedNumber(value.fogDensity, 0.004, 0.04) &&
    isBoolean(value.skylineVisible) &&
    isSkylineLayerPreferences(value.skylineLayers) &&
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
  readonly onReady?: () => void;
  readonly quality?: VisualQualityPreset | "auto";
  readonly roomSeed?: string;
}

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
  readonly jump: () => void;
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
  readonly skylineVisible: boolean;
  readonly skylineLayers: Readonly<Record<VisualSkylineLayer, boolean>>;
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
  readonly setSkylineVisible: (visible: boolean) => void;
  readonly setSkylineLayerVisible: (layer: VisualSkylineLayer, visible: boolean) => void;
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
  readonly skylineLodBias: number;
  readonly ambientAnimationRate: number;
}

interface SceneAmbientResources {
  readonly cyanMaterials: readonly THREE.MeshStandardMaterial[];
  readonly redMaterials: readonly THREE.MeshStandardMaterial[];
  readonly skylineMaterials: readonly THREE.MeshStandardMaterial[];
}

interface SkylineResources {
  readonly texture: THREE.CanvasTexture;
  readonly ambient: SceneAmbientResources;
}

interface ArchitectureResources {
  readonly ambient: SceneAmbientResources;
  readonly teacherTexture: THREE.CanvasTexture;
  readonly glassSurfaces: readonly THREE.Mesh[];
  readonly simpleGlassMaterial: THREE.MeshStandardMaterial;
  readonly physicalGlassMaterial: THREE.MeshPhysicalMaterial;
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
  sky: 0xdde9ea,
  architecturalWhite: 0xe9ece8,
  whiteLacquer: 0xf3f4f0,
  structuralGray: 0xb9bec0,
  charcoal: 0x151a1d,
  glass: 0xc8e2e7,
  paleOak: 0xc8b69e,
  red: 0xe94136,
  cyan: 0x73dce8,
  aluminum: 0xb8bec2,
  tileIvory: 0xf2eee3,
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
  skylineReview: {
    position: new THREE.Vector3(-2.6, 3.25, 4.15),
    target: new THREE.Vector3(-1.75, 2.55, -6.55),
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
});

const STANDING_EYE_HEIGHT = cameraPresets.seat.position.y;
const SEATED_EYE_HEIGHT = 1.45;
const TABLE_CAMERA_FOV = 45;
const DEBUG_STANDING_FOV = 90;
const DEBUG_SEATED_FOV = 68;
// Double both launch and gravity to double the apex while keeping the same quick airtime.
const JUMP_SPEED = 13.2;
const GRAVITY = 48;
const SPRINT_MULTIPLIER = 3;
const PLAYER_COLLIDER_RADIUS = 0.26;
const PLAYER_COLLIDER_HALF_HEIGHT = 0.6;
const PLAYER_COLLIDER_CENTER_HEIGHT = PLAYER_COLLIDER_HALF_HEIGHT + PLAYER_COLLIDER_RADIUS;
const DOUBLE_TAP_WINDOW_MS = 300;
const SWIPE_LOOK_SENSITIVITY = 0.00594;
const TOUCH_SIDEWAYS_SPRINT_FRACTION = 0.5;
const CAMERA_SHIFT_WALK = THREE.MathUtils.degToRad(0.9);
const CAMERA_SHIFT_SPRINT = THREE.MathUtils.degToRad(1.8);
const CAMERA_SHIFT_TARGET_DAMPING = 4;
const CAMERA_SHIFT_DAMPING = 6;
const CAMERA_BOB_AMPLITUDE = 0.025;
const CAMERA_BOB_DAMPING = 12;
const CAMERA_BOB_MIN_FREQUENCY = 8.5;
const CAMERA_BOB_MAX_FREQUENCY = 14;
const CAMERA_DIRECTION_MEMORY_SECONDS = 0.24;
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
// These values keep ordinary table views legible while still allowing a close
// tile to separate from the room. They are deliberately much gentler than a
// cinematic portrait treatment.
const BOKEH_BASE_APERTURE = 0.00095;
const BOKEH_BASE_MAX_BLUR = 0.003;
const BOKEH_FOCUS_FALLBACK_DISTANCE = 12;
/** Debug-only multiplier cap; 1× remains the restrained human-eye baseline. */
export const DEBUG_BOKEH_STRENGTH_MAX = 25;
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
const FOCUS_CALIBRATION_START_X = 9.2;
const FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE = HUMAN_EYE_REFERENCE_HYPERFOCAL_DISTANCE;
const FOCUS_CALIBRATION_LENGTH = FOCUS_CALIBRATION_HYPERFOCAL_DISTANCE * 2;
const FOCUS_CALIBRATION_ENTRY_MARGIN = 1.6;
const FOCUS_CALIBRATION_HALL_WIDTH = 6.4;
const FOCUS_CALIBRATION_PLATFORM_WIDTH = 16;
const FOCUS_CALIBRATION_BACK_EXTENSION = 12;
const FOCUS_CALIBRATION_DECK_HEIGHT = 7.5;
const FOCUS_CALIBRATION_RAMP_RUN = 24;
const FOCUS_CALIBRATION_RAMP_WIDTH = 8;
const FOCUS_CALIBRATION_RAMP_TOP_Z = FOCUS_CALIBRATION_PLATFORM_WIDTH / 2;
const EXPLORATION_CHUNK_SIZE = 8;

/**
 * The room is larger than one streamed block, so the first city blocks at
 * the gateway straddle it. Keep this exclusion slightly outside the visible
 * shell; city geometry may touch the gateway, but it must never be authored
 * under the penthouse floor or through its walls.
 */
export const EXPLORATION_PENTHOUSE_BOUNDS = {
  minX: -8.72,
  maxX: 8.72,
  minZ: -6.98,
  maxZ: 6.98,
} as const;

export interface ExplorationRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Return true when a horizontal city rectangle does not enter the room. */
export const isExplorationRectOutsidePenthouse = (rect: ExplorationRect): boolean =>
  rect.maxX <= EXPLORATION_PENTHOUSE_BOUNDS.minX ||
  rect.minX >= EXPLORATION_PENTHOUSE_BOUNDS.maxX ||
  rect.maxZ <= EXPLORATION_PENTHOUSE_BOUNDS.minZ ||
  rect.minZ >= EXPLORATION_PENTHOUSE_BOUNDS.maxZ;

const isExplorationRectOutsideFocusCalibrationRamp = (rect: ExplorationRect): boolean =>
  rect.maxX <= FOCUS_CALIBRATION_START_X - FOCUS_CALIBRATION_RAMP_WIDTH / 2 ||
  rect.minX >= FOCUS_CALIBRATION_START_X + FOCUS_CALIBRATION_RAMP_WIDTH / 2 ||
  rect.maxZ <= FOCUS_CALIBRATION_RAMP_TOP_Z ||
  rect.minZ >= FOCUS_CALIBRATION_RAMP_TOP_Z + FOCUS_CALIBRATION_RAMP_RUN;

/**
 * Subtract the penthouse rectangle from one city rectangle. The result is at
 * most four rectangles and is used for shared-geometry ground/path meshes so
 * a boundary chunk remains walkable without putting a mesh through the room.
 */
export const clipExplorationRectAroundPenthouse = (
  rect: ExplorationRect,
): readonly ExplorationRect[] => {
  if (isExplorationRectOutsidePenthouse(rect)) {
    return [rect];
  }

  const clipped: ExplorationRect[] = [];
  const add = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    if (maxX <= minX || maxZ <= minZ) {
      return;
    }
    clipped.push({ minX, maxX, minZ, maxZ });
  };

  if (rect.minX < EXPLORATION_PENTHOUSE_BOUNDS.minX) {
    add(rect.minX, Math.min(rect.maxX, EXPLORATION_PENTHOUSE_BOUNDS.minX), rect.minZ, rect.maxZ);
  }
  if (rect.maxX > EXPLORATION_PENTHOUSE_BOUNDS.maxX) {
    add(Math.max(rect.minX, EXPLORATION_PENTHOUSE_BOUNDS.maxX), rect.maxX, rect.minZ, rect.maxZ);
  }

  const overlapMinX = Math.max(rect.minX, EXPLORATION_PENTHOUSE_BOUNDS.minX);
  const overlapMaxX = Math.min(rect.maxX, EXPLORATION_PENTHOUSE_BOUNDS.maxX);
  if (overlapMaxX > overlapMinX) {
    if (rect.minZ < EXPLORATION_PENTHOUSE_BOUNDS.minZ) {
      add(
        overlapMinX,
        overlapMaxX,
        rect.minZ,
        Math.min(rect.maxZ, EXPLORATION_PENTHOUSE_BOUNDS.minZ),
      );
    }
    if (rect.maxZ > EXPLORATION_PENTHOUSE_BOUNDS.maxZ) {
      add(
        overlapMinX,
        overlapMaxX,
        Math.max(rect.minZ, EXPLORATION_PENTHOUSE_BOUNDS.maxZ),
        rect.maxZ,
      );
    }
  }
  return clipped;
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

/**
 * Builds deliberately coarse AABB colliders from selected render roots. The
 * renderer remains the source of geometry, while the physics world receives
 * one inexpensive box per meaningful mesh instead of every triangle. Roots
 * such as the table, tiles, skyline, and streamed chunks are excluded here so
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
  const focusRamp = scene.getObjectByName("FocusCalibrationRamp");
  const focusRampPhysicsBoxes: readonly PhysicsBox[] =
    focusRamp?.visible === true
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
    skylineLodBias: 1,
    ambientAnimationRate: 1,
  },
  medium: {
    dprCap: 1.35,
    shadows: "medium",
    shadowMapSize: 1024,
    ambientOcclusion: false,
    glassMode: "simple",
    skylineLodBias: 0.78,
    ambientAnimationRate: 0.75,
  },
  low: {
    dprCap: 1,
    shadows: "off",
    shadowMapSize: 0,
    ambientOcclusion: false,
    glassMode: "simple",
    skylineLodBias: 0.56,
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

const createTextureCache = (): TileTextureCache => ({
  face: new Map(),
  back: drawTileBack(),
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
): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const createTable = (): THREE.Group => {
  const table = new THREE.Group();
  table.name = "TableRoot";
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH + 0.22, 0.58, TABLE_DEPTH + 0.22, 5, 0.12),
    createMaterial(COLORS.structuralGray, 0.58),
  );
  base.name = "TableBody";
  base.position.y = 0.29;
  base.castShadow = true;
  base.receiveShadow = true;
  table.add(base);

  const shellTop = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH, 0.14, TABLE_DEPTH, 5, 0.08),
    createMaterial(COLORS.whiteLacquer, 0.32),
  );
  shellTop.name = "TableShell";
  shellTop.position.y = TABLE_TOP_Y - 0.07;
  shellTop.castShadow = true;
  shellTop.receiveShadow = true;
  table.add(shellTop);

  const felt = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH - 0.2, 0.045, TABLE_DEPTH - 0.2, 5, 0.035),
    new THREE.MeshStandardMaterial({
      color: COLORS.charcoal,
      roughness: 0.84,
      metalness: 0,
    }),
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

const createRack = (width: number): THREE.Group => {
  const rack = new THREE.Group();
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(width, 0.1, 0.16, 3, 0.025),
    createMaterial(COLORS.charcoal, 0.62),
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
  seatPosition: THREE.Vector3,
  rotation: number,
  faceUp: boolean,
  tiles: readonly TileTypeId[],
): void => {
  const hand = new THREE.Group();
  hand.name = "PlayerHand";
  hand.position.copy(seatPosition);
  hand.rotation.y = rotation;
  hand.add(createRack(1.48));
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

const createSkyTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 600;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create the skyline canvas");
  }
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#a9cedf");
  gradient.addColorStop(0.45, "#e7f0ef");
  gradient.addColorStop(0.78, "#f3eee8");
  gradient.addColorStop(1, "#ded9e6");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.52)";
  for (let index = 0; index < 22; index += 1) {
    const x = (index * 317) % canvas.width;
    const y = 38 + ((index * 127) % 250);
    context.fillRect(x, y, index % 4 === 0 ? 5 : 3, index % 4 === 0 ? 5 : 3);
  }
  context.fillStyle = "#adb9ba";
  context.fillRect(0, 486, canvas.width, 114);
  return createCanvasTexture(canvas);
};

const createBuilding = (
  skyline: THREE.Group,
  x: number,
  width: number,
  height: number,
  depth: number,
  z: number,
  color: number,
  windowMaterial: THREE.MeshStandardMaterial,
  accentWindowMaterial: THREE.MeshStandardMaterial,
): void => {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 }),
  );
  building.position.set(x, 0.72 + height / 2, z);
  skyline.add(building);
  const columns = Math.max(2, Math.floor(width / 0.46));
  const rows = Math.max(2, Math.floor(height / 0.48));
  const windowPositions: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if ((column * 3 + row * 5 + Math.round(height)) % 7 < 2) {
        continue;
      }
      const position = new THREE.Vector3(
        x - width / 2 + 0.23 + column * ((width - 0.46) / Math.max(1, columns - 1)),
        0.96 + row * 0.44,
        z + depth / 2 + 0.006,
      );
      const materialIndex = (column * 7 + row * 11 + Math.round(height)) % 13 === 0 ? 1 : 0;
      windowPositions[materialIndex].push(position);
    }
  }
  const addWindowInstances = (
    name: string,
    positions: readonly THREE.Vector3[],
    material: THREE.MeshStandardMaterial,
  ): void => {
    if (positions.length === 0) {
      return;
    }
    const windows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.14, 0.2),
      material,
      positions.length,
    );
    windows.name = name;
    const matrix = new THREE.Matrix4();
    positions.forEach((position, index) => {
      matrix.makeTranslation(position.x, position.y, position.z);
      windows.setMatrixAt(index, matrix);
    });
    windows.instanceMatrix.needsUpdate = true;
    windows.computeBoundingSphere();
    skyline.add(windows);
  };
  addWindowInstances("WindowInstances", windowPositions[0], windowMaterial);
  addWindowInstances("AccentWindowInstances", windowPositions[1], accentWindowMaterial);
};

const addSkyline = (scene: THREE.Scene, skylineLodBias = 1): SkylineResources => {
  const skyline = new THREE.Group();
  skyline.name = "SkylineRoot";
  const nearRooftops = new THREE.Group();
  nearRooftops.name = "NearRooftops";
  const heroLandmarks = new THREE.Group();
  heroLandmarks.name = "HeroLandmarks";
  const skylineFillers = new THREE.Group();
  skylineFillers.name = "SkylineFillers";
  skyline.add(nearRooftops, heroLandmarks, skylineFillers);

  const skyTexture = createSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 11),
    new THREE.MeshBasicMaterial({ map: skyTexture, transparent: false }),
  );
  sky.name = "DistantMatte";
  sky.position.set(0, 5.7, -8.4);
  skyline.add(sky);

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x50676d,
    roughness: 0.7,
    metalness: 0.08,
  });
  const accentWindowMaterial = new THREE.MeshStandardMaterial({
    color: 0xc78d76,
    emissive: 0x6f403c,
    emissiveIntensity: 0.16,
    roughness: 0.64,
  });
  const fillerBuildings = [
    [-6.2, 1.45, 2.5, 0.54, 0xc2cbca, -6.22],
    [-4.85, 1.1, 2.0, 0.5, 0xd8ddda, -6.18],
    [-3.75, 1.55, 3.4, 0.58, 0xb4c0c0, -6.2],
    [-1.8, 0.95, 2.1, 0.5, 0xc9d1cf, -6.16],
    [0.25, 1.3, 2.7, 0.58, 0xb7c5c5, -6.2],
    [4.45, 1.2, 2.6, 0.6, 0xc5cecd, -6.18],
    [5.95, 1.7, 3.8, 0.55, 0xb9c4c4, -6.24],
    [7.0, 1.35, 2.4, 0.58, 0xd6dcda, -6.2],
  ] as const;
  for (const [x, width, height, depth, color, z] of fillerBuildings) {
    createBuilding(
      skylineFillers,
      x,
      width,
      height,
      depth,
      z,
      color,
      windowMaterial,
      accentWindowMaterial,
    );
  }

  const empire = new THREE.Group();
  empire.name = "EmpireStateBuilding";
  createBuilding(
    empire,
    -2.7,
    1.1,
    3.25,
    0.64,
    -6.82,
    0xaebcbc,
    windowMaterial,
    accentWindowMaterial,
  );
  const empireUpper = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.72, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xa4b3b4, roughness: 0.84 }),
  );
  empireUpper.position.set(-2.7, 4.05, -6.82);
  empire.add(empireUpper);
  const empireCrown = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.6, 4),
    new THREE.MeshStandardMaterial({ color: 0x8e9d9f, roughness: 0.72, metalness: 0.14 }),
  );
  empireCrown.position.set(-2.7, 4.7, -6.82);
  empire.add(empireCrown);
  const empireSpire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.045, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x728287, roughness: 0.5, metalness: 0.35 }),
  );
  empireSpire.position.set(-2.7, 5.55, -6.82);
  empire.add(empireSpire);
  const empireLod = new THREE.LOD();
  empireLod.name = "EmpireStateBuildingLOD";
  empireLod.addLevel(empire, 0);
  const empireSilhouette = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 4.25, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x95a8a9, roughness: 0.9 }),
  );
  empireSilhouette.position.set(-2.7, 2.84, -6.82);
  empireSilhouette.name = "EmpireStateBuildingSilhouette";
  empireLod.addLevel(empireSilhouette, 14 * skylineLodBias);
  heroLandmarks.add(empireLod);

  const vanderbilt = new THREE.Mesh(
    new THREE.ConeGeometry(0.52, 4.35, 4),
    new THREE.MeshStandardMaterial({ color: 0xa9c1c5, roughness: 0.52, metalness: 0.16 }),
  );
  vanderbilt.name = "OneVanderbilt";
  vanderbilt.position.set(-0.9, 2.9, -6.94);
  vanderbilt.rotation.y = Math.PI / 4;
  const vanderbiltLod = new THREE.LOD();
  vanderbiltLod.name = "OneVanderbiltLOD";
  vanderbiltLod.addLevel(vanderbilt, 0);
  const vanderbiltSilhouette = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 3.8, 4),
    new THREE.MeshStandardMaterial({ color: 0xa1b8bc, roughness: 0.88 }),
  );
  vanderbiltSilhouette.position.set(-0.9, 2.62, -6.94);
  vanderbiltSilhouette.rotation.y = Math.PI / 4;
  vanderbiltLod.addLevel(vanderbiltSilhouette, 14 * skylineLodBias);
  heroLandmarks.add(vanderbiltLod);

  const chrysler = new THREE.Group();
  chrysler.name = "ChryslerBuilding";
  createBuilding(
    chrysler,
    2.6,
    1.05,
    2.85,
    0.56,
    -6.8,
    0xb8c4c5,
    windowMaterial,
    accentWindowMaterial,
  );
  const chryslerCrown = new THREE.Mesh(
    new THREE.ConeGeometry(0.52, 1.18, 12),
    new THREE.MeshStandardMaterial({ color: 0x93a5a7, roughness: 0.42, metalness: 0.36 }),
  );
  chryslerCrown.position.set(2.6, 3.42, -6.8);
  chrysler.add(chryslerCrown);
  const chryslerSpire = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x778d91, roughness: 0.42, metalness: 0.36 }),
  );
  chryslerSpire.position.set(2.6, 4.62, -6.8);
  chrysler.add(chryslerSpire);
  const chryslerLod = new THREE.LOD();
  chryslerLod.name = "ChryslerBuildingLOD";
  chryslerLod.addLevel(chrysler, 0);
  const chryslerSilhouette = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 3.9, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x9aabad, roughness: 0.88 }),
  );
  chryslerSilhouette.position.set(2.6, 2.67, -6.8);
  chryslerLod.addLevel(chryslerSilhouette, 14 * skylineLodBias);
  heroLandmarks.add(chryslerLod);

  const slenderTower = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 4.7, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xc1d1d2, roughness: 0.4, metalness: 0.18 }),
  );
  slenderTower.name = "NorthMidtownTower";
  slenderTower.position.set(4.7, 3.05, -7.12);
  heroLandmarks.add(slenderTower);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2b69c }),
  );
  sun.name = "HazySun";
  sun.position.set(-5.7, 7.25, -8.05);
  skyline.add(sun);

  const waterTank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0x636f70, roughness: 0.78 }),
  );
  waterTank.name = "RooftopWaterTower";
  waterTank.position.set(5.85, 2.35, -6.3);
  nearRooftops.add(waterTank);
  const rooftopPlant = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.34, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x6f7a7a, roughness: 0.84 }),
  );
  rooftopPlant.position.set(-5.45, 1.02, -6.32);
  nearRooftops.add(rooftopPlant);

  const rooftopMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f8a8b,
    roughness: 0.88,
    metalness: 0.03,
  });
  const rooftopCapMaterial = new THREE.MeshStandardMaterial({
    color: 0x4e5d5f,
    roughness: 0.8,
    metalness: 0.08,
  });
  const rooftopMasses = [
    [-6.05, 0.72, 0.72, 0.48, -5.82],
    [-4.72, 0.48, 0.9, 0.62, -5.76],
    [-3.18, 0.64, 0.65, 0.52, -5.84],
    [1.42, 0.52, 0.82, 0.58, -5.8],
    [3.62, 0.66, 0.7, 0.46, -5.86],
    [5.62, 0.46, 1.02, 0.64, -5.78],
  ] as const;
  for (const [x, height, width, depth, z] of rooftopMasses) {
    const mass = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), rooftopMaterial);
    mass.name = "RooftopMass";
    mass.position.set(x, 0.72 + height / 2, z);
    nearRooftops.add(mass);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, 0.035, depth + 0.06),
      rooftopCapMaterial,
    );
    cap.name = "RooftopParapet";
    cap.position.set(x, 0.72 + height + 0.018, z);
    nearRooftops.add(cap);
  }

  scene.add(skyline);
  return {
    texture: skyTexture,
    ambient: {
      cyanMaterials: [],
      redMaterials: [],
      skylineMaterials: [accentWindowMaterial],
    },
  };
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

interface FocusCalibrationHallwayResources {
  readonly root: THREE.Group;
  readonly labels: readonly THREE.Sprite[];
}

const createFocusCalibrationHallway = (scene: THREE.Scene): FocusCalibrationHallwayResources => {
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

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x25363a,
    roughness: 0.82,
    metalness: 0.08,
  });
  floorMaterial.fog = false;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5e9e4,
    roughness: 0.76,
    metalness: 0.08,
  });
  wallMaterial.fog = false;
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d6a6c,
    roughness: 0.7,
    metalness: 0.18,
  });
  ceilingMaterial.fog = false;
  const cyanMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 0.42,
    roughness: 0.35,
    metalness: 0.2,
  });
  cyanMaterial.fog = false;
  const redMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.red,
    emissive: COLORS.red,
    emissiveIntensity: 0.28,
    roughness: 0.35,
    metalness: 0.12,
  });
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

  const rampMaterial = new THREE.MeshStandardMaterial({
    color: 0x34484c,
    roughness: 0.78,
    metalness: 0.12,
  });
  rampMaterial.fog = false;
  const rampAngle = Math.atan2(FOCUS_CALIBRATION_DECK_HEIGHT, FOCUS_CALIBRATION_RAMP_RUN);
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(FOCUS_CALIBRATION_RAMP_RUN + 0.12, 0.18, FOCUS_CALIBRATION_RAMP_WIDTH),
    rampMaterial,
  );
  ramp.name = "FocusCalibrationRamp";
  ramp.userData.physicsIgnore = true;
  ramp.position.set(
    startX + FOCUS_CALIBRATION_RAMP_RUN / 2,
    FOCUS_CALIBRATION_DECK_HEIGHT / 2,
    FOCUS_CALIBRATION_RAMP_TOP_Z,
  );
  ramp.rotation.z = -rampAngle;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  root.add(ramp);

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

  const architecturalWhite = createMaterial(COLORS.architecturalWhite, 0.76);
  const whiteLacquer = createMaterial(COLORS.whiteLacquer, 0.3);
  const structuralGray = createMaterial(COLORS.structuralGray, 0.58, 0.05);
  const charcoal = createMaterial(COLORS.charcoal, 0.68);
  const aluminum = createMaterial(COLORS.aluminum, 0.28, 0.9);
  const paleOak = createMaterial(COLORS.paleOak, 0.66);
  const red = new THREE.MeshStandardMaterial({
    color: COLORS.red,
    roughness: 0.38,
    emissive: COLORS.red,
    emissiveIntensity: 0.12,
  });
  const cyan = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    roughness: 0.34,
    emissive: COLORS.cyan,
    emissiveIntensity: 0.28,
  });
  const physicalGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: COLORS.glass,
    roughness: 0.055,
    metalness: 0,
    transmission: 0.24,
    transparent: true,
    opacity: 0.24,
    ior: 1.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const simpleGlassMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.glass,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glass = quality.glassMode === "physical" ? physicalGlassMaterial : simpleGlassMaterial;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 13.4), architecturalWhite);
  floor.name = "PenthouseFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.userData.dofIgnore = true;
  floor.receiveShadow = true;
  shell.add(floor);
  const floorInset = new THREE.Mesh(
    new RoundedBoxGeometry(3.5, 0.035, 3.5, 5, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x343e41, roughness: 0.86 }),
  );
  floorInset.name = "MahjongZoneInset";
  floorInset.position.y = 0.018;
  floorInset.userData.dofIgnore = true;
  floorInset.receiveShadow = true;
  shell.add(floorInset);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.34, 13.4), whiteLacquer);
  ceiling.name = "CeilingSlab";
  ceiling.position.y = 5.12;
  ceiling.receiveShadow = true;
  shell.add(ceiling);
  const cantilever = new THREE.Mesh(
    new RoundedBoxGeometry(6.1, 0.28, 2.35, 4, 0.08),
    architecturalWhite,
  );
  cantilever.name = "CantileveredCeiling";
  cantilever.position.set(-4.4, 4.7, -3.35);
  cantilever.castShadow = true;
  cantilever.receiveShadow = true;
  shell.add(cantilever);

  for (const x of [-8.45, 8.45]) {
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 5.1, 13.3),
      x < 0 ? architecturalWhite : structuralGray,
    );
    sideWall.name = x < 0 ? "WestStructuralWall" : "EastStructuralWall";
    sideWall.position.set(x, 2.55, 0);
    sideWall.castShadow = true;
    sideWall.receiveShadow = true;
    shell.add(sideWall);
  }

  const sculpturalWall = new THREE.Mesh(
    new RoundedBoxGeometry(2.25, 4.25, 2.15, 5, 0.12),
    whiteLacquer,
  );
  sculpturalWall.name = "SculpturalWhiteWall";
  sculpturalWall.position.set(-5.95, 2.12, 1.0);
  sculpturalWall.castShadow = true;
  sculpturalWall.receiveShadow = true;
  shell.add(sculpturalWall);
  const corridor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.35, 1.75), charcoal);
  corridor.name = "DarkCorridorInset";
  corridor.position.set(8.25, 2.15, 2.38);
  shell.add(corridor);

  const northGlass = new THREE.Mesh(new THREE.PlaneGeometry(16.6, 4.42), glass);
  northGlass.name = "NorthGlazing";
  northGlass.position.set(0, 2.86, -5.62);
  windows.add(northGlass);
  const eastGlass = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 4.42), glass);
  eastGlass.name = "EastGlassReturn";
  eastGlass.rotation.y = Math.PI / 2;
  eastGlass.position.set(7.95, 2.86, -3.05);
  windows.add(eastGlass);
  const mullionMaterial = new THREE.MeshStandardMaterial({
    color: 0x20282b,
    roughness: 0.38,
    metalness: 0.42,
  });
  for (const x of [-7.25, -3.6, 0, 3.6, 7.25]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.045, 4.6, 0.08), mullionMaterial);
    mullion.name = "NorthMullion";
    mullion.position.set(x, 2.85, -5.54);
    windows.add(mullion);
  }
  const horizontalMullion = new THREE.Mesh(
    new THREE.BoxGeometry(16.65, 0.045, 0.08),
    mullionMaterial,
  );
  horizontalMullion.name = "NorthMullionHorizontal";
  horizontalMullion.position.set(0, 2.56, -5.54);
  windows.add(horizontalMullion);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.22, 0.32), structuralGray);
  sill.name = "WindowSill";
  sill.position.set(0, 0.7, -5.5);
  sill.castShadow = true;
  windows.add(sill);

  const redLine = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 6.6), red);
  redLine.name = "RedDirectionalLine";
  redLine.position.set(-4.42, 0.06, -1.8);
  redLine.rotation.y = -0.08;
  accents.add(redLine);
  const cyanStrip = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.032, 0.04), cyan);
  cyanStrip.name = "CyanCeilingStrip";
  cyanStrip.position.set(2.9, 4.57, -4.86);
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
  teacherPanel.position.set(-4.15, 2.3, -5.35);
  teacherPanel.userData.dofIgnore = true;
  accents.add(teacherPanel);
  const teacherPanelLine = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.025, 0.05), cyan);
  teacherPanelLine.name = "TeacherPanelStatusLine";
  teacherPanelLine.position.set(-4.15, 1.93, -5.31);
  accents.add(teacherPanelLine);

  const sofa = new THREE.Group();
  sofa.name = "SculpturalSofa";
  const sofaSeat = new THREE.Mesh(new RoundedBoxGeometry(3.05, 0.34, 0.92, 5, 0.14), whiteLacquer);
  sofaSeat.position.set(4.2, 0.48, -3.96);
  sofaSeat.castShadow = true;
  sofa.add(sofaSeat);
  const sofaBack = new THREE.Mesh(new RoundedBoxGeometry(3.05, 0.92, 0.27, 5, 0.1), whiteLacquer);
  sofaBack.position.set(4.2, 1.0, -4.28);
  sofaBack.castShadow = true;
  sofa.add(sofaBack);
  furniture.add(sofa);

  const sideTable = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.5, 24), aluminum);
  sideTable.name = "SideTable";
  sideTable.position.set(6.02, 0.28, -2.75);
  sideTable.castShadow = true;
  furniture.add(sideTable);
  const pendant = new THREE.Mesh(new RoundedBoxGeometry(2.55, 0.08, 0.11, 3, 0.025), aluminum);
  pendant.name = "LinearPendant";
  pendant.position.set(2.15, 4.35, -0.72);
  furniture.add(pendant);
  const pendantLight = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.018, 0.04), cyan);
  pendantLight.name = "PendantLightStrip";
  pendantLight.position.set(2.15, 4.29, -0.72);
  furniture.add(pendantLight);

  const bar = new THREE.Group();
  bar.name = "TeaCounter";
  const barBody = new THREE.Mesh(new RoundedBoxGeometry(2.25, 0.92, 0.52, 4, 0.1), whiteLacquer);
  barBody.position.set(-4.58, 0.46, -3.9);
  barBody.castShadow = true;
  bar.add(barBody);
  const barTop = new THREE.Mesh(new RoundedBoxGeometry(2.38, 0.08, 0.61, 4, 0.025), paleOak);
  barTop.position.set(-4.58, 0.96, -3.9);
  bar.add(barTop);
  furniture.add(bar);

  const stationMaterial = createMaterial(COLORS.whiteLacquer, 0.42);
  const stationInset = createMaterial(COLORS.charcoal, 0.72);
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

  const sculpture = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.075, 12, 32), aluminum);
  sculpture.name = "GeometricSculpture";
  sculpture.position.set(-5.05, 1.4, -1.15);
  sculpture.rotation.set(Math.PI / 2.7, 0.25, 0.18);
  furniture.add(sculpture);
  scene.add(environment);
  return {
    ambient: {
      cyanMaterials: [cyan],
      redMaterials: [red],
      skylineMaterials: [],
    },
    teacherTexture,
    glassSurfaces: [northGlass, eastGlass],
    simpleGlassMaterial,
    physicalGlassMaterial,
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
): void => {
  const planter = new THREE.Group();
  planter.name = "GeneratedPlanter";
  planter.position.copy(position);
  quantizeHorizontal(planter.position);
  planter.rotation.y = quantizeRotation45(random.nextFloat() * Math.PI * 2);
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.42, 18),
    new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.78 }),
  );
  pot.position.y = 0.21;
  pot.castShadow = true;
  pot.receiveShadow = true;
  planter.add(pot);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 0.62, 8),
    new THREE.MeshStandardMaterial({ color: palette.plant, roughness: 0.82 }),
  );
  stem.position.y = 0.66;
  stem.castShadow = true;
  planter.add(stem);
  const leafGeometry = new THREE.IcosahedronGeometry(0.17, 1);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: palette.plant,
    roughness: 0.7,
  });
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
): void => {
  const divider = new THREE.Group();
  divider.name = "GeneratedRoomDivider";
  divider.position.copy(position);
  quantizeHorizontal(divider.position);
  divider.rotation.y = quantizeRotation45(rotation);
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: palette.secondary,
    roughness: 0.38,
    metalness: 0.34,
  });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: 0.24,
    roughness: 0.34,
    metalness: 0.12,
  });
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
): void => {
  const panel = new THREE.Group();
  panel.name = "GeneratedWallPanel";
  panel.position.copy(position);
  quantizeHorizontal(panel.position);
  panel.rotation.y = quantizeRotation45(rotation);
  const width = quantizeScale(0.86 + random.nextFloat() * 0.78);
  const height = quantizeScale(0.92 + random.nextFloat() * 0.78);
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: palette.surface,
    roughness: 0.65,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: 0.19,
    roughness: 0.38,
    metalness: 0.2,
  });
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

const createGeneratedRoom = (scene: THREE.Scene, roomSeed: string): GeneratedRoomResult => {
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

  const floorWidth = 3.8 + random.nextFloat() * 1.8;
  const floorDepth = 3.15 + random.nextFloat() * 1.6;
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: palette.surface,
    roughness: 0.88,
  });
  const floorPanel = new THREE.Mesh(
    new RoundedBoxGeometry(floorWidth, 0.035, floorDepth, 5, 0.18),
    floorMaterial,
  );
  floorPanel.name = "GeneratedFloorPanel";
  floorPanel.position.y = 0.052;
  floorPanel.rotation.y = (random.nextFloat() - 0.5) * 0.12;
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

  const ceilingLightCount = 1 + random.nextInt(2);
  for (let index = 0; index < ceilingLightCount; index += 1) {
    const x = quantizeToGrid(-3.2 + random.nextFloat() * 6.4);
    const z = quantizeToGrid(-4.35 + random.nextFloat() * 4.2);
    addGeneratedLightBar(
      root,
      new THREE.Vector3(x, 4.5 + random.nextFloat() * 0.24, z),
      random.nextFloat() > 0.5 ? 0 : Math.PI / 2,
      palette,
      random,
    );
  }

  const wallSlots = [
    { position: new THREE.Vector3(-7.8, 0, -3.4), rotation: Math.PI / 2 },
    { position: new THREE.Vector3(-7.8, 0, 0.4), rotation: Math.PI / 2 },
    { position: new THREE.Vector3(-7.8, 0, 3.7), rotation: Math.PI / 2 },
    { position: new THREE.Vector3(7.8, 0, -3.7), rotation: -Math.PI / 2 },
    { position: new THREE.Vector3(7.8, 0, -0.1), rotation: -Math.PI / 2 },
    { position: new THREE.Vector3(7.8, 0, 3.3), rotation: -Math.PI / 2 },
    { position: new THREE.Vector3(-4.2, 0, -5.36), rotation: 0 },
    { position: new THREE.Vector3(3.6, 0, -5.36), rotation: 0 },
  ] as const;
  wallSlots.forEach((slot, index) => {
    if (random.nextFloat() < 0.55) {
      return;
    }
    const position = slot.position.clone();
    position.z += (random.nextFloat() - 0.5) * (Math.abs(slot.position.x) > 7 ? 0.35 : 0.2);
    position.x += Math.abs(slot.position.x) > 7 ? 0 : (random.nextFloat() - 0.5) * 0.32;
    quantizeHorizontal(position);
    const kind = (random.nextInt(4) + index) % 4;
    if (kind === 0) {
      addGeneratedPlanter(root, new THREE.Vector3(position.x, 0, position.z), palette, random);
    } else if (kind === 1) {
      addGeneratedDivider(root, position, slot.rotation, palette, random);
    } else if (kind === 2) {
      addGeneratedWallPanel(root, position, slot.rotation, palette, random);
    } else {
      addGeneratedLightBar(
        root,
        new THREE.Vector3(position.x, 3.66 + random.nextFloat() * 0.44, position.z),
        slot.rotation,
        palette,
        random,
      );
    }
  });

  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(0.85 + random.nextFloat() * 0.42, 0.6, 0.85, 4, 0.08),
    new THREE.MeshStandardMaterial({ color: palette.secondary, roughness: 0.46, metalness: 0.08 }),
  );
  plinth.name = "GeneratedSculpturePlinth";
  plinth.position.set(random.nextFloat() > 0.5 ? -5.7 : 5.7, 0.3, -0.6 + random.nextFloat() * 2.2);
  quantizeHorizontal(plinth.position);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);
  const sculpture = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.22 + random.nextFloat() * 0.1, 0.05, 48, 10),
    new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.62,
    }),
  );
  sculpture.name = "GeneratedSculpture";
  sculpture.position.y = 0.72;
  sculpture.rotation.y = quantizeRotation45(random.nextFloat() * Math.PI * 2);
  sculpture.castShadow = true;
  plinth.add(sculpture);

  scene.add(root);
  return { variant: palette.label };
};

interface ExplorationZoneStyle {
  readonly label: string;
  readonly ground: number;
  readonly path: number;
  readonly prop: number;
  readonly accent: number;
}

interface ExplorationWorld {
  readonly update: (position: THREE.Vector3) => void;
  readonly getArea: () => string;
  readonly getLoadedChunkCount: () => number;
  readonly getPhysicsBoxes: () => readonly PhysicsBox[];
  readonly getPhysicsVersion: () => number;
  readonly dispose: () => void;
}

interface ExplorationChunk {
  readonly root: THREE.Group;
  readonly physicsBoxes: readonly PhysicsBox[];
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

const EXPLORATION_ZONE_STYLES: readonly ExplorationZoneStyle[] = [
  {
    label: "South courtyard",
    ground: 0x545f67,
    path: 0x3a4852,
    prop: 0x72818d,
    accent: 0x93a0ad,
  },
  {
    label: "West tea garden",
    ground: 0x505c65,
    path: 0x37434d,
    prop: 0x6e7b88,
    accent: 0x8a96a2,
  },
  {
    label: "East practice court",
    ground: 0x5a656f,
    path: 0x3e4a54,
    prop: 0x7a8794,
    accent: 0x97a3ae,
  },
  {
    label: "North skybridge",
    ground: 0x515a63,
    path: 0x394450,
    prop: 0x6f7d89,
    accent: 0x91a0ad,
  },
] as const;

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
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const windowGeometry = new THREE.BoxGeometry(0.56, 0.055, 0.045);
  const bridgeGeometry = new RoundedBoxGeometry(EXPLORATION_CHUNK_SIZE * 0.86, 0.14, 0.2, 3, 0.035);
  const groundMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) => new THREE.MeshStandardMaterial({ color: style.ground, roughness: 0.9 }),
  );
  const pathMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) => new THREE.MeshStandardMaterial({ color: style.path, roughness: 0.82 }),
  );
  const propMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) =>
      new THREE.MeshStandardMaterial({
        color: style.prop,
        roughness: 0.66,
        metalness: 0.05,
      }),
  );
  const accentMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) =>
      new THREE.MeshStandardMaterial({
        color: style.accent,
        emissive: style.accent,
        emissiveIntensity: 0.28,
        roughness: 0.35,
        metalness: 0.16,
      }),
  );
  const buildingMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) =>
      new THREE.MeshStandardMaterial({ color: style.prop, roughness: 0.78, metalness: 0.08 }),
  );
  const windowMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) =>
      new THREE.MeshStandardMaterial({
        color: style.accent,
        emissive: style.accent,
        emissiveIntensity: 0.2,
        roughness: 0.32,
        metalness: 0.18,
      }),
  );
  const bridgeMaterials = EXPLORATION_ZONE_STYLES.map(
    (style) =>
      new THREE.MeshStandardMaterial({
        color: style.path,
        roughness: 0.48,
        metalness: 0.44,
      }),
  );
  const activeChunks = new Map<string, ExplorationChunk>();
  let physicsVersion = 0;
  let currentArea = "Penthouse";

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
    for (const piece of clipExplorationRectAroundPenthouse(rect)) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set((piece.minX + piece.maxX) / 2, y, (piece.minZ + piece.maxZ) / 2);
      mesh.scale.set(
        (piece.maxX - piece.minX) / baseWidth,
        1,
        (piece.maxZ - piece.minZ) / baseDepth,
      );
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
    }
  };

  const chunkCoordinate = (value: number): number =>
    Math.floor((value + EXPLORATION_CHUNK_SIZE / 2) / EXPLORATION_CHUNK_SIZE);
  const chunkKey = (x: number, z: number): string => `${String(x)}:${String(z)}`;
  const describeArea = (position: THREE.Vector3): string => {
    if (Math.abs(position.x) <= 8.9 && position.z >= -7.2 && position.z <= 6.9) {
      return "Penthouse";
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
    const styleIndex = random.nextInt(EXPLORATION_ZONE_STYLES.length);
    const style = EXPLORATION_ZONE_STYLES[styleIndex] ?? EXPLORATION_ZONE_STYLES[0];
    if (style === undefined) {
      throw new Error("Exploration zone styles are empty");
    }
    const chunk = new THREE.Group();
    const physicsBoxes: PhysicsBox[] = [];
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

    const buildingCount = 1 + random.nextInt(2);
    const buildingSpecs: ExplorationBuildingSpec[] = [];
    for (let index = 0; index < buildingCount; index += 1) {
      const edge = random.nextInt(4);
      const edgeOffset = (random.nextFloat() - 0.5) * 2.3;
      const x = quantizeToGrid(
        edge === 0
          ? originX - 2.45 + edgeOffset
          : edge === 1
            ? originX + 2.45 + edgeOffset
            : originX + edgeOffset,
      );
      const z = quantizeToGrid(
        edge === 2
          ? originZ - 2.45 + edgeOffset
          : edge === 3
            ? originZ + 2.45 + edgeOffset
            : originZ + edgeOffset,
      );
      const width = quantizeScale(1.15 + random.nextFloat() * 1.55);
      const height = quantizeScale(1.7 + random.nextFloat() * 5.2);
      const depth = quantizeScale(1.15 + random.nextFloat() * 1.55);
      const rotation = random.nextInt(4) * (Math.PI / 2);
      const swapsAxes = Math.abs(Math.sin(rotation)) > 0.5;
      if (
        !isExplorationRectOutsidePenthouse({
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
      const rows = Math.min(5, Math.max(2, Math.floor(building.height / 1.05)));
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

    if (random.nextFloat() < 0.2) {
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
        isExplorationRectOutsideFocusCalibrationRamp({
          minX: bridgeX - bridgeHalfWidth,
          maxX: bridgeX + bridgeHalfWidth,
          minZ: bridgeZ - bridgeHalfDepth,
          maxZ: bridgeZ + bridgeHalfDepth,
        })
      ) {
        const bridge = new THREE.Mesh(bridgeGeometry, bridgeMaterials[styleIndex]);
        bridge.name = "SkybridgeSpan";
        bridge.position.set(originX, 3.2 + random.nextFloat() * 2.2, originZ);
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

    const propCount = 1 + random.nextInt(3);
    const propMatrices: THREE.Matrix4[] = [];
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
      physicsBoxes.push({
        center: { x: position.x, y: position.y, z: position.z },
        halfExtents: { x: scale.x * 0.14, y: scale.y * 0.5, z: scale.z * 0.14 },
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
      props.instanceMatrix.needsUpdate = true;
      props.computeBoundingSphere();
      chunk.add(props);
    }

    const beaconCount = random.nextInt(2);
    const beaconMatrices: THREE.Matrix4[] = [];
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
      beacons.instanceMatrix.needsUpdate = true;
      beacons.computeBoundingSphere();
      chunk.add(beacons);
    }
    return { root: chunk, physicsBoxes };
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
    const minChunkX = chunkCoordinate(WORLD_BOUNDS.minX) - 1;
    const maxChunkX = chunkCoordinate(WORLD_BOUNDS.maxX) + 1;
    const minChunkZ = chunkCoordinate(WORLD_BOUNDS.minZ) - 1;
    const maxChunkZ = chunkCoordinate(WORLD_BOUNDS.maxZ) + 1;

    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const centerX = chunkX * EXPLORATION_CHUNK_SIZE;
      if (
        centerX < WORLD_BOUNDS.minX - EXPLORATION_CHUNK_SIZE ||
        centerX > WORLD_BOUNDS.maxX + EXPLORATION_CHUNK_SIZE
      ) {
        continue;
      }
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
        const centerZ = chunkZ * EXPLORATION_CHUNK_SIZE;
        if (
          centerZ < WORLD_BOUNDS.minZ - EXPLORATION_CHUNK_SIZE ||
          centerZ > WORLD_BOUNDS.maxZ + EXPLORATION_CHUNK_SIZE
        ) {
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

  const dispose = (): void => {
    root.removeFromParent();
    for (const chunk of activeChunks.values()) {
      disposeChunk(chunk.root);
    }
    activeChunks.clear();
    groundGeometry.dispose();
    pathGeometry.dispose();
    propGeometry.dispose();
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
    ]) {
      material.dispose();
    }
  };

  preloadAllChunks();
  update(new THREE.Vector3(0, 0, 0));
  onAreaChange?.(currentArea);
  return {
    update,
    getArea: () => currentArea,
    getLoadedChunkCount: () => activeChunks.size,
    getPhysicsBoxes: () => {
      const boxes: PhysicsBox[] = [];
      for (const chunk of activeChunks.values()) {
        boxes.push(...chunk.physicsBoxes);
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
    skyline: make("CameraTargetSkyline", new THREE.Vector3(-1.8, 2.8, -6.6)),
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

const addLighting = (scene: THREE.Scene, quality: SceneQuality): void => {
  RectAreaLightUniformsLib.init();
  const lightingRoot = new THREE.Group();
  lightingRoot.name = "LightingRoot";
  scene.add(lightingRoot);
  const hemisphere = new THREE.HemisphereLight(0xf4f7f4, 0x9aa8aa, 2.05);
  lightingRoot.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff3de, 3.45);
  key.name = "SunKeyLight";
  key.position.set(-5, 9.5, 6.5);
  key.castShadow = quality.shadows !== "off";
  if (quality.shadowMapSize > 0) {
    key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  }
  key.shadow.camera.left = -6.5;
  key.shadow.camera.right = 6.5;
  key.shadow.camera.top = 6.5;
  key.shadow.camera.bottom = -6.5;
  lightingRoot.add(key);
  const windowFill = new THREE.RectAreaLight(0xd8f5ff, 4.2, 9.6, 3.3);
  windowFill.position.set(0, 3.0, -4.8);
  windowFill.lookAt(0, 0.8, 0);
  lightingRoot.add(windowFill);
  const ceilingFill = new THREE.RectAreaLight(0xfff5e9, 2.3, 5.5, 2.2);
  ceilingFill.position.set(1.2, 4.35, 0.2);
  ceilingFill.lookAt(0, 0.7, 0);
  lightingRoot.add(ceilingFill);
};

const addFloor = (scene: THREE.Scene, quality: SceneQuality): ArchitectureResources => {
  return addArchitecture(scene, quality);
};

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
  const visualCameraPresets = createVisualCameraPresets();
  const sceneStateStorage = getVisualSceneStateStorage();
  const persistedSceneState = readVisualSceneState(sceneStateStorage, roomSeed);
  const debugPreferencesStorage = getVisualDebugPreferencesStorage();
  const persistedDebugPreferences = debugEnabled
    ? readVisualDebugPreferences(debugPreferencesStorage)
    : null;
  const persistedQuality = persistedDebugPreferences?.qualityMode;
  const requestedQuality =
    options.quality ?? (persistedQuality === "adaptive" ? "auto" : persistedQuality);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 10, 34);
  const camera = new THREE.PerspectiveCamera(TABLE_CAMERA_FOV, 1, 0.05, 1200);
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
  const quality = resolveQuality(requestedQuality);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dprCap));
  renderer.shadowMap.enabled = quality.shadows !== "off";
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.98;
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
  composer.addPass(new OutputPass());
  const focusRaycaster = new THREE.Raycaster();
  const focusNdc = new THREE.Vector2(0, 0);
  let skylineRoot: THREE.Object3D | null = null;
  let focusCalibrationRoot: THREE.Group | null = null;
  let focusCalibrationLabels: readonly THREE.Sprite[] = [];
  let debugBoundsRoot: THREE.Group | null = null;
  let sunLight: THREE.DirectionalLight | null = null;
  let redMaterials: THREE.MeshStandardMaterial[] = [];
  let cyanMaterials: THREE.MeshStandardMaterial[] = [];
  let redMaterialBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();
  let cyanMaterialBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();
  let activeDebugPreset: VisualCameraPreset | null = null;
  let debugFovOverride: number | null = null;
  let debugFogDensity = 0.018;
  let debugSunYaw = -0.59;
  let debugSunElevation = 0.86;
  let debugSunIntensity = 3.45;
  let debugEnvironmentIntensity = 1;
  let debugEnvironmentRotation = 0;
  let debugRedAccentIntensity = 1;
  let debugCyanEmissiveIntensity = 1;
  let debugShadowQuality: VisualShadowQuality = quality.shadows;
  let debugDprCap = quality.dprCap;
  let debugQualityMode: VisualQualityMode =
    options.quality === undefined || options.quality === "auto" ? "adaptive" : options.quality;
  let debugEffectiveQuality: VisualQualityPreset = quality.preset;
  let debugAmbientAnimationRate = quality.ambientAnimationRate;
  let debugCameraShiftEnabled = true;
  let debugCameraBobEnabled = true;
  let debugBokehEnabled = bokehPass.enabled;
  let debugBokehStrength = 1;
  let debugAmbientOcclusionEnabled = gtaoPass.enabled;
  let debugAutoExposureEnabled = true;
  let debugExposureTarget = renderer.toneMappingExposure;
  let debugGlassMode: VisualGlassMode = quality.glassMode;
  let glassSurfaces: readonly THREE.Mesh[] = [];
  let simpleGlassMaterial: THREE.MeshStandardMaterial | null = null;
  let physicalGlassMaterial: THREE.MeshPhysicalMaterial | null = null;
  let debugWireframe = false;
  let debugBoundsVisible = false;
  let generatedRoomVariant = GENERATED_ROOM_PALETTES[0]?.label ?? "Northlight";
  const debugSkylineLayers: Record<VisualSkylineLayer, boolean> = {
    near: true,
    hero: true,
    fillers: true,
    distant: true,
  };
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
    skylineVisible: skylineRoot?.visible ?? true,
    skylineLayers: { ...debugSkylineLayers },
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
    if (!suppressDebugPreferencesPersistence) {
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
  const isTouchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window;
  const preventTouchTextMenu = (event: Event): void => {
    if (isTouchDevice) {
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
  let jumpOffset = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let physicsRuntime: MahjongPhysicsRuntime | null = null;
  let physicsCharacterPosition: PhysicsVector | null = null;
  let appliedPhysicsVersion = -1;
  let forwardVelocity = 0;
  let strafeVelocity = 0;
  let touchMovementActive = false;
  let touchForward = 0;
  let touchRight = 0;
  let isSprinting = false;
  let lastForwardTapAt = Number.NEGATIVE_INFINITY;
  let cameraShiftRoll = 0;
  let cameraShiftTarget = 0;
  let cameraBobPhase = 0;
  let cameraBobAmount = 0;
  let lastLateralDirection = 0;
  let lateralIdleTime = Number.POSITIVE_INFINITY;
  let lastSceneStateSaveAt = Number.NEGATIVE_INFINITY;
  let lastSceneStateSerialized: string | null = null;
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
  const resetCameraMotion = (): void => {
    cameraShiftRoll = 0;
    cameraShiftTarget = 0;
    cameraBobPhase = 0;
    cameraBobAmount = 0;
    lastLateralDirection = 0;
    lateralIdleTime = Number.POSITIVE_INFINITY;
    camera.updateMatrix();
  };
  const movementKeys = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ]);
  const hasMovementInput = (): boolean => {
    for (const key of movementKeys) {
      if (pressedKeys.has(key)) {
        return true;
      }
    }
    return false;
  };
  const crouchKeys = new Set(["ShiftLeft", "ShiftRight"]);
  const onKeyDown = (event: KeyboardEvent): void => {
    const controlsActive =
      firstPersonControls.isLocked || (isTouchDevice && firstPersonControls.enabled);
    if (activeView !== "seat" || !controlsActive) {
      return;
    }
    if (movementKeys.has(event.code) || crouchKeys.has(event.code) || event.code === "Space") {
      event.preventDefault();
      if (crouchKeys.has(event.code)) {
        if (!event.repeat) {
          isCrouched = !isCrouched;
        }
      } else if (movementKeys.has(event.code)) {
        pressedKeys.add(event.code);
        if (event.code === "KeyW" && !event.repeat) {
          const now = window.performance.now();
          if (now - lastForwardTapAt <= DOUBLE_TAP_WINDOW_MS) {
            isSprinting = true;
          }
          lastForwardTapAt = now;
        }
      } else if (event.code === "Space" && !event.repeat && grounded) {
        verticalVelocity = JUMP_SPEED;
        grounded = false;
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressedKeys.delete(event.code);
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
      isCrouched = !isCrouched;
    }
    return isCrouched;
  };
  const jump = (): void => {
    if (activeView === "seat" && grounded) {
      verticalVelocity = JUMP_SPEED;
      grounded = false;
    }
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
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastForwardTapAt = Number.NEGATIVE_INFINITY;
    resetCameraMotion();
  };
  const setControlActive = (active: boolean): void => {
    container.dataset.controlActive = active ? "true" : "false";
  };
  const onControlsLock = (): void => {
    setControlActive(true);
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
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  renderer.domElement.addEventListener("click", onCanvasClick);
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
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastForwardTapAt = Number.NEGATIVE_INFINITY;
    resetCameraMotion();
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    syncPhysicsCharacterToCamera();
    resetMotionCalibration();
  };
  const setComposedTablePreset = (): void => {
    const preset = cameraPresets.seat;
    firstPersonGroundY = 0;
    activeView = "seat";
    resetCameraMotion();
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    syncPhysicsCharacterToCamera();
    camera.fov = TABLE_CAMERA_FOV;
    camera.updateProjectionMatrix();
    resetMotionCalibration();
  };
  const setFocusCalibrationVisibility = (): void => {
    if (focusCalibrationRoot !== null) {
      // The calibration wing is part of the same walkable development map as
      // the penthouse and streamed exploration areas. Camera presets should
      // never hide the rest of the map to make the lab appear.
      focusCalibrationRoot.visible = debugEnabled;
    }
  };
  const setView = (view: SceneView): void => {
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
  };

  const resetToSpawn = (): void => {
    setView("seat");
    onWindowBlur();
    firstPersonGroundY = 0;
    eyeHeight = STANDING_EYE_HEIGHT;
    isCrouched = false;
    jumpOffset = 0;
    verticalVelocity = 0;
    grounded = true;
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastForwardTapAt = Number.NEGATIVE_INFINITY;

    const preset = cameraPresets.seat;
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    debugFovOverride = null;
    camera.fov = debugEnabled ? DEBUG_STANDING_FOV : TABLE_CAMERA_FOV;
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
      forwardVelocity = 0;
      strafeVelocity = 0;
      isSprinting = false;
      lastForwardTapAt = Number.NEGATIVE_INFINITY;
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
    camera.fov = debugEnabled ? THREE.MathUtils.clamp(state.cameraFov, 30, 100) : TABLE_CAMERA_FOV;
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
    debugFogDensity = THREE.MathUtils.clamp(density, 0.004, 0.04);
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.far = THREE.MathUtils.clamp(46 - debugFogDensity * 666.6667, 14, 44);
      fog.near = THREE.MathUtils.clamp(fog.far * 0.3, 4, 12);
    }
    persistDebugPreferences();
  };

  const skylineLayerNames: Readonly<Record<VisualSkylineLayer, string>> = {
    near: "NearRooftops",
    hero: "HeroLandmarks",
    fillers: "SkylineFillers",
    distant: "DistantMatte",
  };

  const setDebugSkylineLayerVisible = (layer: VisualSkylineLayer, visible: boolean): void => {
    debugSkylineLayers[layer] = visible;
    const object = skylineRoot?.getObjectByName(skylineLayerNames[layer]);
    if (object !== undefined) {
      object.visible = visible;
    }
    if (skylineRoot !== null) {
      skylineRoot.visible = Object.values(debugSkylineLayers).some(Boolean);
    }
    persistDebugPreferences();
  };

  const setDebugSkylineVisible = (visible: boolean): void => {
    for (const layer of Object.keys(debugSkylineLayers) as VisualSkylineLayer[]) {
      setDebugSkylineLayerVisible(layer, visible);
    }
    persistDebugPreferences();
  };

  const setDebugSunDirection = (yaw: number, elevation: number): void => {
    debugSunYaw = THREE.MathUtils.clamp(yaw, -Math.PI, Math.PI);
    debugSunElevation = THREE.MathUtils.clamp(elevation, 0.25, 1.45);
    const light = getSunLight();
    if (light !== null) {
      const horizontal = Math.cos(debugSunElevation) * 10;
      light.position.set(
        Math.cos(debugSunYaw) * horizontal,
        Math.sin(debugSunElevation) * 10,
        Math.sin(debugSunYaw) * horizontal,
      );
      light.lookAt(0, 0.8, 0);
    }
    persistDebugPreferences();
  };

  const setDebugSunIntensity = (intensity: number): void => {
    debugSunIntensity = THREE.MathUtils.clamp(intensity, 0, 6);
    const light = getSunLight();
    if (light !== null) {
      light.intensity = debugSunIntensity;
    }
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
      cameraShiftRoll = 0;
      cameraShiftTarget = 0;
    }
    persistDebugPreferences();
  };

  const setDebugCameraBobEnabled = (enabled: boolean): void => {
    debugCameraBobEnabled = enabled;
    if (!enabled) {
      cameraBobAmount = 0;
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
    for (const name of ["EmpireStateBuildingLOD", "OneVanderbiltLOD", "ChryslerBuildingLOD"]) {
      const lod = scene.getObjectByName(name);
      if (lod instanceof THREE.LOD && lod.levels[1] !== undefined) {
        lod.levels[1].distance = 14 * profile.skylineLodBias;
      }
    }
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
    exposure: 0.98,
    toneMapper: "agx",
    fogDensity: 0.018,
    skylineVisible: true,
    skylineLayers: { near: true, hero: true, fillers: true, distant: true },
    sunYaw: -0.59,
    sunElevation: 0.86,
    sunIntensity: 3.45,
    environmentIntensity: 1,
    environmentRotation: 0,
    redAccentIntensity: 1,
    cyanEmissiveIntensity: 1,
    shadowQuality: quality.shadows,
    qualityMode:
      options.quality === undefined || options.quality === "auto" ? "adaptive" : options.quality,
    glassMode: quality.glassMode,
    ambientAnimationRate: quality.ambientAnimationRate,
    dprCap: quality.dprCap,
    wireframe: false,
    boundsVisible: false,
    bokehEnabled: quality.preset === "high",
    bokehStrength: 1,
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
    for (const layer of Object.keys(debugSkylineLayers) as VisualSkylineLayer[]) {
      setDebugSkylineLayerVisible(layer, preferences.skylineLayers[layer]);
    }
    if (skylineRoot !== null) {
      skylineRoot.visible = preferences.skylineVisible;
    }
    setDebugFov(preferences.fov);
  };

  const resetDebugPreferences = (): void => {
    suppressDebugPreferencesPersistence = true;
    try {
      applyDebugPreferences(defaultDebugPreferences());
    } finally {
      suppressDebugPreferencesPersistence = false;
    }
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
    skylineVisible: skylineRoot?.visible ?? true,
    skylineLayers: { ...debugSkylineLayers },
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
  generatedRoomVariant = createGeneratedRoom(scene, roomSeed).variant;
  if (debugEnabled) {
    const focusCalibration = createFocusCalibrationHallway(scene);
    focusCalibrationRoot = focusCalibration.root;
    focusCalibrationLabels = focusCalibration.labels;
  }
  addExplorationGateway(scene);
  explorationWorld = createExplorationWorld(scene, roomSeed, (area) => {
    explorationArea = area;
    options.onExplorationAreaChange?.(area);
  });
  loadedExplorationChunks = explorationWorld.getLoadedChunkCount();
  addLighting(scene, quality);
  const skylineResources = addSkyline(scene, quality.skylineLodBias);
  skylineRoot = scene.getObjectByName("SkylineRoot") ?? null;
  const ambientSkylineMaterials = skylineResources.ambient.skylineMaterials;
  const table = createTable();
  scene.add(table);
  const textureCache = createTextureCache();
  const wallRoot = createWall(textureCache);
  scene.add(wallRoot);
  const anchors = createPresentationAnchors(scene, table, wallRoot);
  addHand(scene, textureCache, new THREE.Vector3(0, 0, 1.5), 0, true, PLAYER_HAND);
  addHand(scene, textureCache, new THREE.Vector3(0, 0, -1.5), Math.PI, false, PLAYER_HAND);
  addHand(scene, textureCache, new THREE.Vector3(1.5, 0, 0), -Math.PI / 2, false, PLAYER_HAND);
  addHand(scene, textureCache, new THREE.Vector3(-1.5, 0, 0), Math.PI / 2, false, PLAYER_HAND);
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
  const debugBoundTargets = [
    scene.getObjectByName("EnvironmentRoot"),
    skylineRoot,
    table,
    wallRoot,
  ];
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
    applyDebugPreferences(persistedDebugPreferences);
  }
  suppressDebugPreferencesPersistence = false;

  // Restore the last development-scene transform after all camera targets and
  // physics surfaces exist, so the first rendered frame starts in the same
  // place that the HMR remount replaced.
  restoreSceneState(persistedSceneState);

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
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
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

  let animationFrame = 0;
  let disposed = false;
  container.dataset.physicsReady = "loading";
  void createMahjongPhysics(createStaticPhysicsBoxes(scene)).then(
    (runtime) => {
      if (disposed) {
        runtime.dispose();
        return;
      }
      physicsRuntime = runtime;
      syncPhysicsCharacterToCamera();
      runtime.setDynamicBoxes(explorationWorld?.getPhysicsBoxes() ?? []);
      appliedPhysicsVersion = explorationWorld?.getPhysicsVersion() ?? 0;
      container.dataset.physicsReady = "true";
    },
    () => {
      // Rendering remains usable if a browser cannot initialize the optional
      // WASM physics module; the existing bounded movement is the fallback.
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
  const moveSpeed = 3.4;
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
    const skylinePulse = Math.sin(ambientTime * 0.24) * 0.022 * debugAmbientAnimationRate;
    for (const material of ambientSkylineMaterials) {
      material.emissiveIntensity = (0.16 + skylinePulse) * debugCyanEmissiveIntensity;
    }
    exposureLookDirection.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const windowFacing = THREE.MathUtils.clamp(-exposureLookDirection.z, 0, 1);
    const estimatedLuminance = THREE.MathUtils.clamp(
      0.72 + debugEnvironmentIntensity * 0.24 + debugSunIntensity * 0.06 + windowFacing * 0.22,
      0.35,
      2.4,
    );
    if (debugAutoExposureEnabled) {
      const targetExposure = THREE.MathUtils.clamp(0.98 / estimatedLuminance, 0.58, 1.45);
      debugExposureTarget = THREE.MathUtils.damp(debugExposureTarget, targetExposure, 1.6, delta);
      renderer.toneMappingExposure = debugExposureTarget;
    }
    const targetFov =
      debugFovOverride ??
      (debugEnabled && activeView === "seat" && isCrouched
        ? DEBUG_SEATED_FOV
        : debugEnabled && activeView === "seat"
          ? DEBUG_STANDING_FOV
          : TABLE_CAMERA_FOV);
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 10, delta);
    if (Math.abs(nextFov - camera.fov) > 0.001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
    for (const label of seatLabels) {
      label.visible = !isCrouched || activeView !== "seat";
    }
    const firstPersonActive =
      firstPersonControls.enabled &&
      (firstPersonControls.isLocked || (isTouchDevice && activeView === "seat"));
    if (firstPersonActive) {
      if (motionLookEnabled && motionTargetValid) {
        camera.quaternion.slerp(motionTargetQuaternion, 1 - Math.exp(-18 * delta));
      }
      // Rebuild the upright control matrix before PointerLockControls moves.
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      const crouching = isCrouched;
      const targetEyeHeight = crouching ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
      eyeHeight = THREE.MathUtils.damp(eyeHeight, targetEyeHeight, 14, delta);
      let forward: number;
      let right: number;
      let currentMoveSpeed: number;
      let movementMagnitude: number;
      let inputScale = 1;
      if (touchMovementActive) {
        const touchMagnitude = Math.min(1, Math.hypot(touchForward, touchRight));
        const touchDirectionScale = touchMagnitude > 0 ? 1 / touchMagnitude : 0;
        forward = touchForward * touchDirectionScale;
        right = touchRight * touchDirectionScale;
        movementMagnitude = touchMagnitude;
        const sprintCap = getTouchSprintCap(forward);
        currentMoveSpeed =
          moveSpeed * (crouching ? 0.5 : 1) * SPRINT_MULTIPLIER * sprintCap * touchMagnitude;
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
        const sprinting = isSprinting && inputMagnitude > 0 && !crouching;
        const speedMultiplier = crouching ? 0.5 : sprinting ? SPRINT_MULTIPLIER : 1;
        currentMoveSpeed = moveSpeed * speedMultiplier;
      }
      const desiredForward = forward * inputScale * currentMoveSpeed;
      const desiredStrafe = right * inputScale * currentMoveSpeed;
      const maxMoveSpeed = moveSpeed * SPRINT_MULTIPLIER;
      const movementSpeedRatio = THREE.MathUtils.clamp(currentMoveSpeed / maxMoveSpeed, 0, 1);
      if (debugCameraShiftEnabled && Math.abs(right) > 0.05) {
        const lateralDirection = Math.sign(right);
        if (lastLateralDirection === 0 || lateralDirection !== lastLateralDirection) {
          const sprintStrength = THREE.MathUtils.clamp(
            (movementSpeedRatio - 1 / SPRINT_MULTIPLIER) / (1 - 1 / SPRINT_MULTIPLIER),
            0,
            1,
          );
          const shiftAmount = THREE.MathUtils.lerp(
            CAMERA_SHIFT_WALK,
            CAMERA_SHIFT_SPRINT,
            sprintStrength,
          );
          cameraShiftTarget = -lateralDirection * shiftAmount;
        }
        lastLateralDirection = lateralDirection;
        lateralIdleTime = 0;
      } else if (debugCameraShiftEnabled) {
        lateralIdleTime += delta;
        if (lateralIdleTime > CAMERA_DIRECTION_MEMORY_SECONDS) {
          lastLateralDirection = 0;
        }
      } else {
        lastLateralDirection = 0;
        lateralIdleTime = Number.POSITIVE_INFINITY;
      }
      forwardVelocity = THREE.MathUtils.damp(forwardVelocity, desiredForward, 10, delta);
      strafeVelocity = THREE.MathUtils.damp(strafeVelocity, desiredStrafe, 10, delta);
      const movementStart = camera.position.clone();
      if (Math.abs(forwardVelocity) > 0.001) {
        firstPersonControls.moveForward(forwardVelocity * delta);
      }
      if (Math.abs(strafeVelocity) > 0.001) {
        firstPersonControls.moveRight(strafeVelocity * delta);
      }
      const desiredHorizontalDelta = camera.position.clone().sub(movementStart);
      let baseCameraY: number;
      if (physicsRuntime !== null) {
        camera.position.copy(movementStart);
        if (physicsCharacterPosition === null) {
          syncPhysicsCharacterToCamera();
        }
        const characterPosition = physicsCharacterPosition ?? {
          x: camera.position.x,
          y: camera.position.y - (eyeHeight - PLAYER_COLLIDER_CENTER_HEIGHT),
          z: camera.position.z,
        };
        if (!grounded || verticalVelocity > 0) {
          verticalVelocity -= GRAVITY * delta;
        }
        const movement = physicsRuntime.move(characterPosition, {
          x: desiredHorizontalDelta.x,
          y: verticalVelocity * delta,
          z: desiredHorizontalDelta.z,
        });
        const clampedPosition: PhysicsVector = {
          x: THREE.MathUtils.clamp(movement.position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
          y: movement.position.y,
          z: THREE.MathUtils.clamp(movement.position.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ),
        };
        physicsCharacterPosition = clampedPosition;
        grounded = movement.grounded;
        if (grounded && verticalVelocity < 0) {
          verticalVelocity = 0;
        }
        jumpOffset = Math.max(0, clampedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT);
        camera.position.x = clampedPosition.x;
        camera.position.z = clampedPosition.z;
        baseCameraY = clampedPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT + eyeHeight;
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
        if (!grounded || jumpOffset > 0) {
          verticalVelocity -= GRAVITY * delta;
          jumpOffset += verticalVelocity * delta;
          if (jumpOffset <= 0) {
            jumpOffset = 0;
            verticalVelocity = 0;
            grounded = true;
          }
        }
        baseCameraY = firstPersonGroundY + eyeHeight + jumpOffset;
      }
      cameraShiftTarget = THREE.MathUtils.damp(
        cameraShiftTarget,
        0,
        CAMERA_SHIFT_TARGET_DAMPING,
        delta,
      );
      cameraShiftRoll = THREE.MathUtils.damp(
        cameraShiftRoll,
        cameraShiftTarget,
        CAMERA_SHIFT_DAMPING,
        delta,
      );
      const bobTarget = debugCameraBobEnabled
        ? movementMagnitude * movementSpeedRatio * (crouching ? 0.7 : 1)
        : 0;
      cameraBobAmount = THREE.MathUtils.damp(cameraBobAmount, bobTarget, CAMERA_BOB_DAMPING, delta);
      cameraBobPhase +=
        delta *
        THREE.MathUtils.lerp(
          CAMERA_BOB_MIN_FREQUENCY,
          CAMERA_BOB_MAX_FREQUENCY,
          movementSpeedRatio,
        );
      camera.position.y =
        baseCameraY + Math.sin(cameraBobPhase) * CAMERA_BOB_AMPLITUDE * cameraBobAmount;
      camera.updateMatrix();
      if (Math.abs(cameraShiftRoll) > 0.0001) {
        cameraRollMatrix.makeRotationZ(cameraShiftRoll);
        camera.matrix.multiply(cameraRollMatrix);
        camera.matrixWorldNeedsUpdate = true;
      }
    } else {
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
    camera.updateMatrixWorld(true);
    // The focus lab is part of the same streamed world, so moving through it
    // must continue loading and retaining the surrounding development map.
    explorationWorld?.update(camera.position);
    const nextPhysicsVersion = explorationWorld?.getPhysicsVersion() ?? 0;
    if (physicsRuntime !== null && nextPhysicsVersion !== appliedPhysicsVersion) {
      physicsRuntime.setDynamicBoxes(explorationWorld?.getPhysicsBoxes() ?? []);
      appliedPhysicsVersion = nextPhysicsVersion;
    }
    loadedExplorationChunks = explorationWorld?.getLoadedChunkCount() ?? 0;
    saveSceneState();
    let centerFocusHit: THREE.Intersection | undefined;
    let tileFocusHit: THREE.Intersection | undefined;
    if (debugBokehEnabled) {
      centerFocusHit = findVisibleFocusIntersection(focusNdc);
      tileFocusHit =
        centerFocusHit !== undefined && isDofFocusTarget(centerFocusHit.object)
          ? centerFocusHit
          : undefined;
      let tileFocusOffset = Number.POSITIVE_INFINITY;
      if (tileFocusHit === undefined) {
        for (const offset of focusTileSampleOffsets) {
          const sampleNdc = focusNdc.clone().add(offset);
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
    debug: {
      setCameraPreset: setDebugCameraPreset,
      setFov: setDebugFov,
      setExposure: setDebugExposure,
      setToneMapper: setDebugToneMapper,
      setFogDensity: setDebugFogDensity,
      setSkylineVisible: setDebugSkylineVisible,
      setSkylineLayerVisible: setDebugSkylineLayerVisible,
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      if (orientationListenerAttached) {
        detachOrientationListener();
      }
      renderer.domElement.removeEventListener("click", onCanvasClick);
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
      composer.dispose();
      skylineResources.texture.dispose();
      architectureResources.teacherTexture.dispose();
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
