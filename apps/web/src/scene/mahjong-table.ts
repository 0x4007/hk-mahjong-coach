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
import { getTileDefinition, type TileTypeId } from "@hk-mahjong/core/public";

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // Ask the React wrapper to replace only the mounted Three.js scene. The
    // surrounding app state and browser session stay intact during iteration.
    window.dispatchEvent(new Event(MAHJONG_TABLE_HMR_EVENT));
  });
}

export const MAHJONG_TABLE_HMR_EVENT = "mahjong-table:scene-hmr";

export type SceneView = "seat" | "overhead";

export type SceneSeat = "east" | "south" | "west" | "north";

export interface MahjongTablePlayerState {
  readonly playerId: string;
  readonly displayName: string;
  readonly seat: SceneSeat;
  readonly concealedTileCount: number;
  readonly melds: readonly {
    readonly tileTypes: readonly TileTypeId[];
    readonly exposed: boolean;
  }[];
  readonly discards: readonly TileTypeId[];
}

/**
 * Observation-derived presentation state. It intentionally contains no wall order or opponent
 * concealed tile identities; the scene only receives a count for other players' hands.
 */
export interface MahjongTableGameState {
  readonly viewerSeat: SceneSeat;
  readonly activeSeat: SceneSeat;
  readonly playerHand: readonly TileTypeId[];
  readonly drawnTileIndex: number | null;
  readonly players: readonly MahjongTablePlayerState[];
}

export type VisualCameraPreset = "table" | "roomReveal" | "skylineReview" | "assetReview";

export type VisualToneMapper = "agx" | "neutral" | "cineon" | "linear";

export type VisualShadowQuality = "off" | "medium" | "high";

export type VisualSkylineLayer = "near" | "hero" | "fillers" | "distant";

export type MotionLookStatus =
  "unsupported" | "needs-permission" | "requesting" | "ready" | "denied";

export type VisualQualityPreset = "high" | "medium" | "low";

export interface MahjongTableSceneOptions {
  readonly debug?: boolean;
  readonly gameState?: MahjongTableGameState;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
  readonly onReady?: () => void;
  readonly quality?: VisualQualityPreset | "auto";
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
  readonly setGameState: (state: MahjongTableGameState | null) => void;
  readonly requestMotionLook: () => Promise<MotionLookStatus>;
  readonly setTouchMovementVector: (forward: number, right: number, active: boolean) => void;
  readonly toggleCrouch: () => boolean;
  readonly jump: () => void;
  readonly debug: MahjongTableDebugControls;
  readonly dispose: () => void;
  readonly anchors: PenthouseSceneAnchors;
}

export interface SceneDebugSnapshot {
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
  readonly dpr: number;
  readonly dprCap: number;
  readonly wireframe: boolean;
  readonly boundsVisible: boolean;
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
  readonly setWireframe: (enabled: boolean) => void;
  readonly setBoundsVisible: (visible: boolean) => void;
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
  readonly glassMode: "simple" | "physical";
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

type RelativeTableSeat = "south" | "west" | "north" | "east";

const SEAT_ORDER: readonly SceneSeat[] = ["east", "south", "west", "north"];

const TABLE_HAND_LAYOUT: Readonly<
  Record<RelativeTableSeat, { readonly position: THREE.Vector3; readonly rotation: number }>
> = {
  south: { position: new THREE.Vector3(0, 0, 1.5), rotation: 0 },
  north: { position: new THREE.Vector3(0, 0, -1.5), rotation: Math.PI },
  east: { position: new THREE.Vector3(1.5, 0, 0), rotation: -Math.PI / 2 },
  west: { position: new THREE.Vector3(-1.5, 0, 0), rotation: Math.PI / 2 },
};

const TABLE_MELD_LAYOUT: Readonly<
  Record<RelativeTableSeat, { readonly position: THREE.Vector3; readonly rotation: number }>
> = {
  south: { position: new THREE.Vector3(0, 0, 0.98), rotation: 0 },
  north: { position: new THREE.Vector3(0, 0, -0.98), rotation: Math.PI },
  east: { position: new THREE.Vector3(0.98, 0, 0), rotation: -Math.PI / 2 },
  west: { position: new THREE.Vector3(-0.98, 0, 0), rotation: Math.PI / 2 },
};

const TABLE_DISCARD_LAYOUT: Readonly<
  Record<RelativeTableSeat, { readonly position: THREE.Vector3; readonly rotation: number }>
> = {
  south: { position: new THREE.Vector3(0, TABLE_TOP_Y + 0.1, 0.44), rotation: 0 },
  north: { position: new THREE.Vector3(0, TABLE_TOP_Y + 0.1, -0.44), rotation: Math.PI },
  east: { position: new THREE.Vector3(0.44, TABLE_TOP_Y + 0.1, 0), rotation: -Math.PI / 2 },
  west: { position: new THREE.Vector3(-0.44, TABLE_TOP_Y + 0.1, 0), rotation: Math.PI / 2 },
};

const DEFAULT_SCENE_GAME_STATE: MahjongTableGameState = {
  viewerSeat: "south",
  activeSeat: "south",
  playerHand: PLAYER_HAND,
  drawnTileIndex: null,
  players: [
    {
      playerId: "player-0",
      displayName: "You",
      seat: "south",
      concealedTileCount: PLAYER_HAND.length,
      melds: [],
      discards: PUBLIC_DISCARDS.slice(0, 12),
    },
    {
      playerId: "player-1",
      displayName: "Ming",
      seat: "east",
      concealedTileCount: 13,
      melds: [{ tileTypes: ["dots.7", "dots.8", "dots.9"], exposed: true }],
      discards: PUBLIC_DISCARDS.slice(0, 10),
    },
    {
      playerId: "player-2",
      displayName: "Jade",
      seat: "north",
      concealedTileCount: 13,
      melds: [{ tileTypes: ["characters.7", "characters.8", "characters.9"], exposed: true }],
      discards: PUBLIC_DISCARDS.slice(4, 14),
    },
    {
      playerId: "player-3",
      displayName: "Alex",
      seat: "west",
      concealedTileCount: 13,
      melds: [{ tileTypes: ["bamboo.3", "bamboo.4", "bamboo.5"], exposed: true }],
      discards: PUBLIC_DISCARDS.slice(2, 12),
    },
  ],
};

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

const visualCameraPresets: Readonly<Record<VisualCameraPreset, CameraPreset>> = {
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
};

const STANDING_EYE_HEIGHT = cameraPresets.seat.position.y;
const SEATED_EYE_HEIGHT = 1.45;
const TABLE_CAMERA_FOV = 45;
const DEBUG_STANDING_FOV = 90;
const DEBUG_SEATED_FOV = 68;
// Double both launch and gravity to double the apex while keeping the same quick airtime.
const JUMP_SPEED = 13.2;
const GRAVITY = 48;
const SPRINT_MULTIPLIER = 3;
const DOUBLE_TAP_WINDOW_MS = 300;
const SWIPE_LOOK_SENSITIVITY = 0.00594;
const TOUCH_SIDEWAYS_SPRINT_FRACTION = 0.5;
const CAMERA_SHIFT_WALK = THREE.MathUtils.degToRad(0.9);
const CAMERA_SHIFT_SPRINT = THREE.MathUtils.degToRad(1.8);
const CAMERA_SHIFT_TARGET_DAMPING = 8;
const CAMERA_SHIFT_DAMPING = 12;
const CAMERA_BOB_AMPLITUDE = 0.025;
const CAMERA_BOB_DAMPING = 12;
const CAMERA_BOB_MIN_FREQUENCY = 8.5;
const CAMERA_BOB_MAX_FREQUENCY = 14;
const CAMERA_DIRECTION_MEMORY_SECONDS = 0.24;
const ROOM_BOUNDS = {
  minX: -6.7,
  maxX: 6.7,
  minZ: -5.05,
  maxZ: 5.05,
} as const;

const getTouchSprintCap = (forwardDirection: number): number => {
  const forwardBias = THREE.MathUtils.clamp(forwardDirection, 0, 1);
  const curvedForwardBias = forwardBias * forwardBias;
  return TOUCH_SIDEWAYS_SPRINT_FRACTION + (1 - TOUCH_SIDEWAYS_SPRINT_FRACTION) * curvedForwardBias;
};

const QUALITY_PRESETS: Readonly<Record<VisualQualityPreset, Omit<SceneQuality, "preset">>> = {
  high: {
    dprCap: 1.75,
    shadows: "high",
    shadowMapSize: 2048,
    ambientOcclusion: true,
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

const measureRenderFrameMs = (renderer: THREE.WebGLRenderer): number | null => {
  const probeScene = new THREE.Scene();
  const probeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  probeCamera.position.set(0, 1.5, 8);
  probeCamera.lookAt(0, 0, 0);
  const probeRoot = new THREE.Group();
  const probeGeometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const probeMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.tileIvory,
    roughness: 0.48,
    metalness: 0.04,
  });
  for (let index = 0; index < 72; index += 1) {
    const mesh = new THREE.Mesh(probeGeometry, probeMaterial);
    const column = index % 12;
    const row = Math.floor(index / 12);
    mesh.position.set((column - 5.5) * 0.34, (row - 2.5) * 0.34, -row * 0.18);
    mesh.rotation.set(row * 0.12, column * 0.17, (row + column) * 0.05);
    probeRoot.add(mesh);
  }
  probeScene.add(probeRoot, new THREE.HemisphereLight(0xf4f7f4, 0x334044, 1.6));
  const probeKey = new THREE.DirectionalLight(0xfff3de, 2.2);
  probeKey.position.set(-3, 6, 5);
  probeScene.add(probeKey);
  const target = new THREE.WebGLRenderTarget(96, 96);
  const pixels = new Uint8Array(4);
  try {
    renderer.setRenderTarget(target);
    renderer.compile(probeScene, probeCamera);
    for (let frame = 0; frame < 3; frame += 1) {
      renderer.render(probeScene, probeCamera);
    }
    const start = performance.now();
    for (let frame = 0; frame < 8; frame += 1) {
      renderer.render(probeScene, probeCamera);
    }
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
    const elapsed = performance.now() - start;
    return elapsed / 8;
  } catch {
    return null;
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    probeGeometry.dispose();
    probeMaterial.dispose();
    probeScene.clear();
  }
};

const resolveQuality = (
  requested: VisualQualityPreset | "auto" | undefined,
  renderer: THREE.WebGLRenderer,
): SceneQuality => {
  let preset = requested === undefined || requested === "auto" ? undefined : requested;
  if (preset === undefined) {
    const measuredFrameMs = measureRenderFrameMs(renderer);
    preset =
      measuredFrameMs === null || measuredFrameMs > 24
        ? "low"
        : measuredFrameMs > 14
          ? "medium"
          : "high";
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
  group.userData = { tile: options.tile, faceUp: options.faceUp };

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

const clearChildren = (group: THREE.Group): void => {
  while (group.children.length > 0) {
    const child = group.children[group.children.length - 1];
    if (child === undefined) {
      break;
    }
    group.remove(child);
  }
};

const createHand = (
  cache: TileTextureCache,
  seat: RelativeTableSeat,
  faceUp: boolean,
  tiles: readonly TileTypeId[],
  concealedTileCount = tiles.length,
  drawnTileIndex: number | null = null,
): THREE.Group => {
  const hand = new THREE.Group();
  hand.name = `${seat === "south" ? "Player" : "Opponent"}Hand`;
  const layout = TABLE_HAND_LAYOUT[seat];
  hand.position.copy(layout.position);
  hand.rotation.y = layout.rotation;
  const rack = createRack(1.48);
  rack.name = "HandRack";
  hand.add(rack);
  populateHand(hand, cache, faceUp, tiles, concealedTileCount, drawnTileIndex);
  return hand;
};

const populateHand = (
  hand: THREE.Group,
  cache: TileTextureCache,
  faceUp: boolean,
  tiles: readonly TileTypeId[],
  concealedTileCount = tiles.length,
  drawnTileIndex: number | null = null,
): void => {
  const rack = hand.getObjectByName("HandRack");
  for (const child of [...hand.children]) {
    if (child !== rack) {
      hand.remove(child);
    }
  }
  const tileCount = faceUp ? tiles.length : Math.max(0, concealedTileCount);
  if (tileCount === 0) {
    return;
  }
  const start = -((tileCount - 1) * 0.115) / 2;
  if (!faceUp) {
    const placements = Array.from({ length: tileCount }, (_, index): BackTilePlacement => ({
      position: new THREE.Vector3(start + index * 0.115, TABLE_TOP_Y + 0.22, -0.015),
      rotation: 0,
    }));
    hand.add(createBackTileInstances(cache, placements, 0.1, 0.16, 0.065));
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
    const drawOffset = index === drawnTileIndex ? 0.075 : 0;
    tileMesh.position.set(start + index * 0.115 + drawOffset, TABLE_TOP_Y + 0.22, -0.015);
    hand.add(tileMesh);
  });
};

const addMeld = (
  cache: TileTextureCache,
  tiles: readonly TileTypeId[],
  exposed: boolean,
): THREE.Group => {
  const meld = new THREE.Group();
  meld.name = "ExposedMeld";
  const start = -((tiles.length - 1) * 0.105) / 2;
  if (!exposed) {
    const placements = tiles.map((_, index): BackTilePlacement => ({
      position: new THREE.Vector3(start + index * 0.105, TABLE_TOP_Y + 0.11, 0),
      rotation: 0,
    }));
    meld.add(createBackTileInstances(cache, placements, 0.09, 0.14, 0.06));
    return meld;
  }
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
  return meld;
};

const populateMelds = (
  root: THREE.Group,
  cache: TileTextureCache,
  melds: readonly { readonly tileTypes: readonly TileTypeId[]; readonly exposed: boolean }[],
): void => {
  clearChildren(root);
  melds.forEach((meld, index) => {
    const meldGroup = addMeld(cache, meld.tileTypes, meld.exposed);
    meldGroup.position.x = (index - (melds.length - 1) / 2) * 0.31;
    root.add(meldGroup);
  });
};

const populateDiscards = (
  root: THREE.Group,
  cache: TileTextureCache,
  tiles: readonly TileTypeId[],
): void => {
  clearChildren(root);
  const columns = 6;
  tiles.forEach((tile, index) => {
    const tileMesh = createTile(cache, {
      tile,
      faceUp: true,
      bothSides: true,
      width: 0.09,
      height: 0.13,
      depth: 0.055,
    });
    const column = index % columns;
    const row = Math.floor(index / columns);
    tileMesh.position.set((column - (columns - 1) / 2) * 0.105, row * 0.14, 0);
    root.add(tileMesh);
  });
};

const relativeSeatFor = (viewerSeat: SceneSeat, playerSeat: SceneSeat): RelativeTableSeat => {
  const viewerIndex = SEAT_ORDER.indexOf(viewerSeat);
  const playerIndex = SEAT_ORDER.indexOf(playerSeat);
  const relativeIndex = (playerIndex - viewerIndex + SEAT_ORDER.length) % SEAT_ORDER.length;
  return (["south", "west", "north", "east"] as const)[relativeIndex] ?? "south";
};

interface SceneTableContent {
  readonly handRoots: Record<RelativeTableSeat, THREE.Group>;
  readonly meldRoots: Record<RelativeTableSeat, THREE.Group>;
  readonly discardRoots: Record<RelativeTableSeat, THREE.Group>;
}

const createSceneTableContent = (
  scene: THREE.Scene,
  cache: TileTextureCache,
): SceneTableContent => {
  const handRoots = {} as Record<RelativeTableSeat, THREE.Group>;
  const meldRoots = {} as Record<RelativeTableSeat, THREE.Group>;
  const discardRoots = {} as Record<RelativeTableSeat, THREE.Group>;
  for (const seat of ["south", "west", "north", "east"] as const) {
    const hand = createHand(cache, seat, seat === "south", seat === "south" ? PLAYER_HAND : [], 13);
    hand.name = `${seat[0]?.toUpperCase() ?? ""}${seat.slice(1)}Hand`;
    const handLayout = TABLE_HAND_LAYOUT[seat];
    hand.position.copy(handLayout.position);
    hand.rotation.y = handLayout.rotation;
    handRoots[seat] = hand;
    scene.add(hand);

    const meld = new THREE.Group();
    meld.name = `${seat[0]?.toUpperCase() ?? ""}${seat.slice(1)}Melds`;
    const meldLayout = TABLE_MELD_LAYOUT[seat];
    meld.position.copy(meldLayout.position);
    meld.rotation.y = meldLayout.rotation;
    meldRoots[seat] = meld;
    scene.add(meld);

    const discard = new THREE.Group();
    discard.name = `${seat[0]?.toUpperCase() ?? ""}${seat.slice(1)}Discards`;
    const discardLayout = TABLE_DISCARD_LAYOUT[seat];
    discard.position.copy(discardLayout.position);
    discard.rotation.y = discardLayout.rotation;
    discardRoots[seat] = discard;
    scene.add(discard);
  }
  return { handRoots, meldRoots, discardRoots };
};

const updateLabel = (sprite: THREE.Sprite, label: string, accent: string): void => {
  const material = sprite.material;
  const previousTexture = material.map;
  material.map = makeLabelTexture(label, accent);
  material.needsUpdate = true;
  previousTexture?.dispose();
};

const updateSceneTableContent = (
  content: SceneTableContent,
  cache: TileTextureCache,
  state: MahjongTableGameState,
  labels: Readonly<Record<RelativeTableSeat, THREE.Sprite>>,
): void => {
  const playersByRelativeSeat = new Map<RelativeTableSeat, MahjongTablePlayerState>();
  for (const player of state.players) {
    playersByRelativeSeat.set(relativeSeatFor(state.viewerSeat, player.seat), player);
  }
  for (const seat of ["south", "west", "north", "east"] as const) {
    const player = playersByRelativeSeat.get(seat);
    const isViewer = seat === "south";
    populateHand(
      content.handRoots[seat],
      cache,
      isViewer,
      isViewer ? state.playerHand : [],
      isViewer ? state.playerHand.length : (player?.concealedTileCount ?? 0),
      isViewer ? state.drawnTileIndex : null,
    );
    populateMelds(content.meldRoots[seat], cache, player?.melds ?? []);
    populateDiscards(content.discardRoots[seat], cache, player?.discards ?? []);
    const label =
      player === undefined
        ? "OPEN SEAT"
        : `${player.seat === state.viewerSeat ? "YOU" : player.displayName} · ${player.seat.toUpperCase()}${player.seat === state.activeSeat ? " · ACTIVE" : ""}`;
    updateLabel(
      labels[seat],
      label,
      isViewer || player?.seat === state.activeSeat ? "#e94136" : "#73dce8",
    );
  }
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

const addLabel = (
  scene: THREE.Scene,
  label: string,
  position: THREE.Vector3,
  accent: string,
): THREE.Sprite => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeLabelTexture(label, accent),
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.userData.dofIgnore = true;
  sprite.position.copy(position);
  sprite.scale.set(0.95, 0.22, 1);
  scene.add(sprite);
  return sprite;
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
  const glass =
    quality.glassMode === "physical"
      ? new THREE.MeshPhysicalMaterial({
          color: COLORS.glass,
          roughness: 0.055,
          metalness: 0,
          transmission: 1,
          transparent: true,
          opacity: 1,
          ior: 1.45,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          color: COLORS.glass,
          roughness: 0.15,
          metalness: 0.05,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15.2, 11.6), architecturalWhite);
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

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.34, 11.6), whiteLacquer);
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

  for (const x of [-7.45, 7.45]) {
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 5.1, 11.5),
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
  corridor.position.set(7.25, 2.15, 2.38);
  shell.add(corridor);

  const northGlass = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 4.42), glass);
  northGlass.name = "NorthGlazing";
  northGlass.position.set(0, 2.86, -5.62);
  windows.add(northGlass);
  const eastGlass = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.42), glass);
  eastGlass.name = "EastGlassReturn";
  eastGlass.rotation.y = Math.PI / 2;
  eastGlass.position.set(6.95, 2.86, -3.05);
  windows.add(eastGlass);
  const mullionMaterial = new THREE.MeshStandardMaterial({
    color: 0x20282b,
    roughness: 0.38,
    metalness: 0.42,
  });
  for (const x of [-6.25, -3.1, 0, 3.1, 6.25]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.045, 4.6, 0.08), mullionMaterial);
    mullion.name = "NorthMullion";
    mullion.position.set(x, 2.85, -5.54);
    windows.add(mullion);
  }
  const horizontalMullion = new THREE.Mesh(
    new THREE.BoxGeometry(14.65, 0.045, 0.08),
    mullionMaterial,
  );
  horizontalMullion.name = "NorthMullionHorizontal";
  horizontalMullion.position.set(0, 2.56, -5.54);
  windows.add(horizontalMullion);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.22, 0.32), structuralGray);
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
  const quality = resolveQuality(options.quality, renderer);
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
  const gtaoPass = quality.ambientOcclusion ? new GTAOPass(scene, camera, 512, 320) : null;
  if (gtaoPass !== null) {
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.blendIntensity = 0.72;
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
  }
  const bokehPass =
    quality.preset === "high"
      ? new BokehPass(scene, camera, {
          focus: 5.2,
          aperture: 0.0018,
          maxblur: 0.0045,
        })
      : null;
  if (bokehPass !== null) {
    composer.addPass(bokehPass);
  }
  composer.addPass(new OutputPass());
  let skylineRoot: THREE.Object3D | null = null;
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
  let debugWireframe = false;
  let debugBoundsVisible = false;
  const debugSkylineLayers: Record<VisualSkylineLayer, boolean> = {
    near: true,
    hero: true,
    fillers: true,
    distant: true,
  };
  let debugFps = 60;
  let debugFrameTimeMs = 1000 / 60;
  let previousAnimationTimestamp = 0;
  let focusDistance = 5.2;
  const getSunLight = (): THREE.DirectionalLight | null => sunLight;
  const getDebugBoundsRoot = (): THREE.Group | null => debugBoundsRoot;

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
    if (motionLookEnabled) {
      setControlActive(true);
    }
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
        return "ready";
      }
      setMotionLookStatus("requesting");
      try {
        const requestPermission = orientationConstructor?.requestPermission;
        if (requestPermission !== undefined) {
          const permission = await requestPermission();
          if (permission !== "granted") {
            motionLookEnabled = false;
            setControlActive(false);
            setMotionLookStatus("denied");
            return "denied";
          }
        }
        motionLookEnabled = true;
        resetMotionCalibration();
        attachOrientationListener();
        setMotionLookStatus("ready");
        setControlActive(true);
        return "ready";
      } catch {
        motionLookEnabled = false;
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
  let isCrouched = false;
  let jumpOffset = 0;
  let verticalVelocity = 0;
  let grounded = true;
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
    resetMotionCalibration();
  };
  const setComposedTablePreset = (): void => {
    const preset = cameraPresets.seat;
    activeView = "seat";
    resetCameraMotion();
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
    camera.fov = TABLE_CAMERA_FOV;
    camera.updateProjectionMatrix();
    resetMotionCalibration();
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

  const setDebugCameraPreset = (preset: VisualCameraPreset): void => {
    if (!debugEnabled) {
      return;
    }
    activeDebugPreset = preset;
    activeView = "overhead";
    firstPersonControls.enabled = false;
    if (firstPersonControls.isLocked) {
      firstPersonControls.unlock();
    }
    onWindowBlur();
    orbitControls.enabled = true;
    const cameraPreset = visualCameraPresets[preset];
    camera.position.copy(cameraPreset.position);
    orbitControls.target.copy(cameraPreset.target);
    orbitControls.update();
    debugFovOverride = camera.fov;
    resetMotionCalibration();
  };

  const setDebugFov = (fov: number): void => {
    debugFovOverride = THREE.MathUtils.clamp(fov, 30, 100);
    camera.fov = debugFovOverride;
    camera.updateProjectionMatrix();
  };

  const setDebugExposure = (exposure: number): void => {
    renderer.toneMappingExposure = THREE.MathUtils.clamp(exposure, 0.5, 2.2);
  };

  const setDebugToneMapper = (toneMapper: VisualToneMapper): void => {
    renderer.toneMapping = TONE_MAPPINGS[toneMapper];
  };

  const setDebugFogDensity = (density: number): void => {
    debugFogDensity = THREE.MathUtils.clamp(density, 0.004, 0.04);
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.far = THREE.MathUtils.clamp(46 - debugFogDensity * 666.6667, 14, 44);
      fog.near = THREE.MathUtils.clamp(fog.far * 0.3, 4, 12);
    }
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
  };

  const setDebugSkylineVisible = (visible: boolean): void => {
    for (const layer of Object.keys(debugSkylineLayers) as VisualSkylineLayer[]) {
      setDebugSkylineLayerVisible(layer, visible);
    }
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
  };

  const setDebugSunIntensity = (intensity: number): void => {
    debugSunIntensity = THREE.MathUtils.clamp(intensity, 0, 6);
    const light = getSunLight();
    if (light !== null) {
      light.intensity = debugSunIntensity;
    }
  };

  const setDebugEnvironmentIntensity = (intensity: number): void => {
    debugEnvironmentIntensity = THREE.MathUtils.clamp(intensity, 0, 2.5);
    scene.environmentIntensity = debugEnvironmentIntensity;
  };

  const setDebugEnvironmentRotation = (rotation: number): void => {
    debugEnvironmentRotation = THREE.MathUtils.clamp(rotation, -Math.PI, Math.PI);
    scene.environmentRotation.y = debugEnvironmentRotation;
  };

  const setDebugRedAccentIntensity = (intensity: number): void => {
    debugRedAccentIntensity = THREE.MathUtils.clamp(intensity, 0, 2.5);
    for (const material of redMaterials) {
      material.emissiveIntensity =
        (redMaterialBaseIntensity.get(material) ?? 0.12) * debugRedAccentIntensity;
    }
  };

  const setDebugCyanEmissiveIntensity = (intensity: number): void => {
    debugCyanEmissiveIntensity = THREE.MathUtils.clamp(intensity, 0, 2.5);
    for (const material of cyanMaterials) {
      material.emissiveIntensity =
        (cyanMaterialBaseIntensity.get(material) ?? 0.28) * debugCyanEmissiveIntensity;
    }
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
  };

  const setDebugDprCap = (dprCap: number): void => {
    debugDprCap = THREE.MathUtils.clamp(dprCap, 1, 2);
    const pixelRatio = Math.min(window.devicePixelRatio, debugDprCap);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    const width = Math.max(renderer.domElement.clientWidth, 1);
    const height = Math.max(renderer.domElement.clientHeight, 1);
    composer.setSize(width, height);
    if (gtaoPass !== null) {
      gtaoPass.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
    }
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
  };

  const setDebugBoundsVisible = (visible: boolean): void => {
    debugBoundsVisible = visible;
    const boundsRoot = getDebugBoundsRoot();
    if (boundsRoot !== null) {
      boundsRoot.visible = visible;
    }
  };

  const getDebugSnapshot = (): SceneDebugSnapshot => ({
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
    quality: quality.preset,
    dpr: renderer.getPixelRatio(),
    dprCap: debugDprCap,
    wireframe: debugWireframe,
    boundsVisible: debugBoundsVisible,
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
  const tableContent = createSceneTableContent(scene, textureCache);
  addDice(scene);
  const seatLabelByRelative: Record<RelativeTableSeat, THREE.Sprite> = {
    south: addLabel(scene, "YOU · SOUTH", new THREE.Vector3(0, 1.38, 1.78), "#e94136"),
    north: addLabel(scene, "NORTH", new THREE.Vector3(0, 1.38, -1.78), "#73dce8"),
    east: addLabel(scene, "EAST", new THREE.Vector3(1.78, 1.38, 0), "#73dce8"),
    west: addLabel(scene, "WEST", new THREE.Vector3(-1.78, 1.38, 0), "#73dce8"),
  };
  const seatLabels = Object.values(seatLabelByRelative);
  const setGameState = (state: MahjongTableGameState | null): void => {
    updateSceneTableContent(
      tableContent,
      textureCache,
      state ?? DEFAULT_SCENE_GAME_STATE,
      seatLabelByRelative,
    );
  };
  setGameState(options.gameState ?? null);

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
    if (gtaoPass !== null) {
      gtaoPass.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
    }
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
  let documentVisible = document.visibilityState !== "hidden";
  const timer = new THREE.Timer();
  timer.connect(document);
  const moveSpeed = 3.4;
  const onVisibilityChange = (): void => {
    documentVisible = document.visibilityState !== "hidden";
    if (documentVisible && animationFrame === 0 && !disposed) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
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
    const ambientPulse = Math.sin(ambientTime * 0.78) * 0.035 * quality.ambientAnimationRate;
    for (const material of cyanMaterials) {
      const baseIntensity = cyanMaterialBaseIntensity.get(material) ?? 0.28;
      material.emissiveIntensity = (baseIntensity + ambientPulse) * debugCyanEmissiveIntensity;
    }
    const skylinePulse = Math.sin(ambientTime * 0.24) * 0.022 * quality.ambientAnimationRate;
    for (const material of ambientSkylineMaterials) {
      material.emissiveIntensity = (0.16 + skylinePulse) * debugCyanEmissiveIntensity;
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
      if (Math.abs(right) > 0.05) {
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
      } else {
        lateralIdleTime += delta;
        if (lateralIdleTime > CAMERA_DIRECTION_MEMORY_SECONDS) {
          lastLateralDirection = 0;
        }
      }
      forwardVelocity = THREE.MathUtils.damp(forwardVelocity, desiredForward, 10, delta);
      strafeVelocity = THREE.MathUtils.damp(strafeVelocity, desiredStrafe, 10, delta);
      if (Math.abs(forwardVelocity) > 0.001) {
        firstPersonControls.moveForward(forwardVelocity * delta);
      }
      if (Math.abs(strafeVelocity) > 0.001) {
        firstPersonControls.moveRight(strafeVelocity * delta);
      }
      if (!grounded || jumpOffset > 0) {
        verticalVelocity -= GRAVITY * delta;
        jumpOffset += verticalVelocity * delta;
        if (jumpOffset <= 0) {
          jumpOffset = 0;
          verticalVelocity = 0;
          grounded = true;
        }
      }
      camera.position.x = THREE.MathUtils.clamp(
        camera.position.x,
        ROOM_BOUNDS.minX,
        ROOM_BOUNDS.maxX,
      );
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
      const bobTarget = movementMagnitude * movementSpeedRatio * (crouching ? 0.7 : 1);
      cameraBobAmount = THREE.MathUtils.damp(cameraBobAmount, bobTarget, CAMERA_BOB_DAMPING, delta);
      cameraBobPhase +=
        delta *
        THREE.MathUtils.lerp(
          CAMERA_BOB_MIN_FREQUENCY,
          CAMERA_BOB_MAX_FREQUENCY,
          movementSpeedRatio,
        );
      camera.position.y =
        eyeHeight + jumpOffset + Math.sin(cameraBobPhase) * CAMERA_BOB_AMPLITUDE * cameraBobAmount;
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        ROOM_BOUNDS.minZ,
        ROOM_BOUNDS.maxZ,
      );
      camera.updateMatrix();
      if (Math.abs(cameraShiftRoll) > 0.0001) {
        cameraRollMatrix.makeRotationZ(cameraShiftRoll);
        camera.matrix.multiply(cameraRollMatrix);
        camera.matrixWorldNeedsUpdate = true;
      }
    } else {
      forwardVelocity = THREE.MathUtils.damp(forwardVelocity, 0, 10, delta);
      strafeVelocity = THREE.MathUtils.damp(strafeVelocity, 0, 10, delta);
      orbitControls.update();
      resetCameraMotion();
    }
    if (bokehPass !== null) {
      const nextFocusDistance = THREE.MathUtils.clamp(
        camera.position.distanceTo(cameraPresets.seat.target),
        3,
        12,
      );
      focusDistance = THREE.MathUtils.damp(focusDistance, nextFocusDistance, 12, delta);
      const focusUniform = bokehPass.materialBokeh.uniforms.focus;
      if (focusUniform !== undefined) {
        focusUniform.value = focusDistance;
      }
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
  // Three.js' asynchronous shader polling fallback can outlive a disposed
  // StrictMode scene and dereference a removed program. Compile in a
  // cancellable task and schedule readiness on our own cancellable frame
  // instead. The first render remains the safe fallback when compilation fails
  // or the context is lost.
  let readyFrame = 0;
  let warmupTimer = window.setTimeout(() => {
    warmupTimer = 0;
    if (disposed) {
      return;
    }
    if (quality.preset !== "low") {
      try {
        renderer.compile(scene, camera);
      } catch {
        // Rendering remains the fallback when a browser cannot precompile a material.
      }
    }
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
    setGameState,
    requestMotionLook,
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
      setWireframe: setDebugWireframe,
      setBoundsVisible: setDebugBoundsVisible,
      getSnapshot: getDebugSnapshot,
    },
    anchors,
    dispose: () => {
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      if (orientationListenerAttached) {
        window.removeEventListener("deviceorientation", onDeviceOrientation);
        window.removeEventListener("orientationchange", resetMotionCalibration);
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
      disposeObject(scene);
      environmentTexture.dispose();
      disposeObject(roomEnvironment);
      pmremGenerator.dispose();
      gtaoPass?.dispose();
      bokehPass?.dispose();
      composer.dispose();
      skylineResources.texture.dispose();
      architectureResources.teacherTexture.dispose();
      textureCache.back.dispose();
      for (const texture of textureCache.face.values()) {
        texture.dispose();
      }
      for (const label of seatLabels) {
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
