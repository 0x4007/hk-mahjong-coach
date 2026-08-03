import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { getTileDefinition, type TileTypeId } from "@hk-mahjong/core/public";

export type SceneView = "seat" | "overhead";

export type MotionLookStatus =
  "unsupported" | "needs-permission" | "requesting" | "ready" | "denied";

export type TouchMovement = "forward" | "back" | "left" | "right";

export interface MahjongTableSceneOptions {
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
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
  readonly setTouchMovement: (direction: TouchMovement, active: boolean) => void;
  readonly toggleCrouch: () => boolean;
  readonly jump: () => void;
  readonly dispose: () => void;
  readonly anchors: PenthouseSceneAnchors;
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
const TILE_EDGE_COLOR = "#c6cfca";
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

const STANDING_EYE_HEIGHT = cameraPresets.seat.position.y;
const SEATED_EYE_HEIGHT = 1.45;
const STANDING_FOV = 90;
const SEATED_FOV = 68;
// Double both launch and gravity to double the apex while keeping the same quick airtime.
const JUMP_SPEED = 13.2;
const GRAVITY = 48;
const SPRINT_MULTIPLIER = 1.75;
const DOUBLE_TAP_WINDOW_MS = 300;
const ROOM_BOUNDS = {
  minX: -6.7,
  maxX: 6.7,
  minZ: -5.05,
  maxZ: 5.05,
} as const;

const DEGREES_TO_RADIANS = Math.PI / 180;
const DEVICE_ORIENTATION_ZEE = new THREE.Vector3(0, 0, 1);
const DEVICE_ORIENTATION_QUARTER = new THREE.Quaternion(
  -Math.sqrt(0.5),
  0,
  0,
  Math.sqrt(0.5),
);

interface DeviceOrientationEventPermissionConstructor {
  readonly requestPermission?: () => Promise<"granted" | "denied">;
}

const getScreenOrientationAngle = (): number => {
  const screenOrientation = window.screen.orientation;
  if (screenOrientation !== undefined && Number.isFinite(screenOrientation.angle)) {
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

const createTile = (cache: TileTextureCache, options: TileOptions): THREE.Group => {
  const width = options.width ?? TILE_WIDTH;
  const height = options.height ?? TILE_HEIGHT;
  const depth = options.depth ?? TILE_DEPTH;
  const group = new THREE.Group();
  group.userData = { tile: options.tile, faceUp: options.faceUp };

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 3, Math.min(0.05, depth / 4)),
    new THREE.MeshStandardMaterial({
      color: TILE_EDGE_COLOR,
      roughness: 0.55,
      metalness: 0.03,
    }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const frontTexture =
    options.faceUp && options.tile !== undefined ? getFaceTexture(cache, options.tile) : cache.back;
  const backTexture = options.faceUp && options.bothSides === true ? frontTexture : cache.back;
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: frontTexture,
    roughness: 0.68,
    metalness: 0,
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    map: backTexture,
    roughness: 0.68,
    metalness: 0,
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.86, height * 0.9), faceMaterial);
  front.position.z = depth / 2 + 0.004;
  front.castShadow = true;
  group.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.86, height * 0.9), backMaterial);
  back.position.z = -depth / 2 - 0.004;
  back.rotation.y = Math.PI;
  group.add(back);
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
  for (let index = 0; index < WALL_COUNT; index += 1) {
    const offset = start + index * WALL_SPACING;
    for (let level = 0; level < 2; level += 1) {
      const tile = createTile(cache, { faceUp: false, width: 0.12, height: 0.15, depth: 0.07 });
      tile.position.set(offset, TABLE_TOP_Y + 0.09 + level * 0.15, -wallOffset);
      tile.rotation.y = Math.PI;
      wall.add(tile);
      const southTile = createTile(cache, {
        faceUp: false,
        width: 0.12,
        height: 0.15,
        depth: 0.07,
      });
      southTile.position.set(offset, TABLE_TOP_Y + 0.09 + level * 0.15, wallOffset);
      wall.add(southTile);
      const eastTile = createTile(cache, { faceUp: false, width: 0.12, height: 0.15, depth: 0.07 });
      eastTile.position.set(wallOffset, TABLE_TOP_Y + 0.09 + level * 0.15, offset);
      eastTile.rotation.y = Math.PI / 2;
      wall.add(eastTile);
      const westTile = createTile(cache, { faceUp: false, width: 0.12, height: 0.15, depth: 0.07 });
      westTile.position.set(-wallOffset, TABLE_TOP_Y + 0.09 + level * 0.15, offset);
      westTile.rotation.y = -Math.PI / 2;
      wall.add(westTile);
    }
  }
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
  tiles.forEach((tile, index) => {
    const tileMesh = createTile(cache, {
      faceUp,
      width: 0.1,
      height: 0.16,
      depth: 0.065,
      ...(faceUp ? { tile } : {}),
    });
    tileMesh.position.set(start + index * 0.115, TABLE_TOP_Y + 0.22, -0.015);
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
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if ((column * 3 + row * 5 + Math.round(height)) % 7 < 2) {
        continue;
      }
      const material =
        (column * 7 + row * 11 + Math.round(height)) % 13 === 0
          ? accentWindowMaterial
          : windowMaterial;
      const window = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.2), material);
      window.position.set(
        x - width / 2 + 0.23 + column * ((width - 0.46) / Math.max(1, columns - 1)),
        0.96 + row * 0.44,
        z + depth / 2 + 0.006,
      );
      skyline.add(window);
    }
  }
};

const addSkyline = (scene: THREE.Scene): THREE.CanvasTexture => {
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
  heroLandmarks.add(empire);

  const vanderbilt = new THREE.Mesh(
    new THREE.ConeGeometry(0.52, 4.35, 4),
    new THREE.MeshStandardMaterial({ color: 0xa9c1c5, roughness: 0.52, metalness: 0.16 }),
  );
  vanderbilt.name = "OneVanderbilt";
  vanderbilt.position.set(-0.9, 2.9, -6.94);
  vanderbilt.rotation.y = Math.PI / 4;
  heroLandmarks.add(vanderbilt);

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
  heroLandmarks.add(chrysler);

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

  scene.add(skyline);
  return skyTexture;
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

const addArchitecture = (scene: THREE.Scene): void => {
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
  environment.add(shell, windows, furniture, accents);

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
  const glass = new THREE.MeshPhysicalMaterial({
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
  const teacherPanel = new THREE.Mesh(
    new RoundedBoxGeometry(1.72, 1.18, 0.045, 4, 0.04),
    new THREE.MeshPhysicalMaterial({
      color: 0xc7e4e6,
      roughness: 0.24,
      transmission: 0.4,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
    }),
  );
  teacherPanel.name = "TeacherPanel";
  teacherPanel.position.set(-4.15, 2.3, -5.35);
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

  const sculpture = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.075, 12, 32), aluminum);
  sculpture.name = "GeometricSculpture";
  sculpture.position.set(-5.05, 1.4, -1.15);
  sculpture.rotation.set(Math.PI / 2.7, 0.25, 0.18);
  furniture.add(sculpture);
  scene.add(environment);
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

const addLighting = (scene: THREE.Scene): void => {
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.HemisphereLight(0xf4f7f4, 0x9aa8aa, 2.05));
  const key = new THREE.DirectionalLight(0xfff3de, 3.45);
  key.position.set(-5, 9.5, 6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6.5;
  key.shadow.camera.right = 6.5;
  key.shadow.camera.top = 6.5;
  key.shadow.camera.bottom = -6.5;
  scene.add(key);
  const windowFill = new THREE.RectAreaLight(0xd8f5ff, 4.2, 9.6, 3.3);
  windowFill.position.set(0, 3.0, -4.8);
  windowFill.lookAt(0, 0.8, 0);
  scene.add(windowFill);
  const ceilingFill = new THREE.RectAreaLight(0xfff5e9, 2.3, 5.5, 2.2);
  ceilingFill.position.set(1.2, 4.35, 0.2);
  ceilingFill.lookAt(0, 0.7, 0);
  scene.add(ceilingFill);
};

const addFloor = (scene: THREE.Scene): void => {
  addArchitecture(scene);
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

const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    const renderable = child as unknown as {
      readonly geometry?: { readonly dispose: () => void };
      readonly material?: THREE.Material | readonly THREE.Material[];
    };
    renderable.geometry?.dispose();
    const material = renderable.material;
    const materials: readonly THREE.Material[] =
      material === undefined ? [] : material instanceof THREE.Material ? [material] : material;
    for (const entry of materials) {
      entry.dispose();
    }
  });
};

export const createMahjongTableScene = (
  container: HTMLElement,
  initialView: SceneView = "seat",
  options: MahjongTableSceneOptions = {},
): MahjongTableMount => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 10, 34);
  const camera = new THREE.PerspectiveCamera(STANDING_FOV, 1, 0.05, 1200);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
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
  container.dataset.controlActive = "false";
  container.replaceChildren(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  composer.addPass(new RenderPass(scene, camera));
  const bokehPass = new BokehPass(scene, camera, {
    focus: 8,
    aperture: 0.0018,
    maxblur: 0.0045,
  });
  composer.addPass(bokehPass);
  const focusRaycaster = new THREE.Raycaster();
  const focusNdc = new THREE.Vector2(0, 0);
  let focusDistance = 8;

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
  const orientationConstructor = (
    window as unknown as {
      readonly DeviceOrientationEvent?: DeviceOrientationEventPermissionConstructor;
    }
  ).DeviceOrientationEvent;
  const supportsMotionLook =
    isTouchDevice &&
    (orientationConstructor !== undefined || "ondeviceorientation" in window);
  let motionLookStatus: MotionLookStatus = supportsMotionLook
    ? "needs-permission"
    : "unsupported";
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
            setMotionLookStatus("denied");
            return "denied";
          }
        }
        motionLookEnabled = true;
        resetMotionCalibration();
        attachOrientationListener();
        setMotionLookStatus("ready");
        return "ready";
      } catch {
        motionLookEnabled = false;
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
  let isSprinting = false;
  let lastForwardTapAt = Number.NEGATIVE_INFINITY;
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
  const crouchKeys = new Set(["ShiftLeft", "ShiftRight"]);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (activeView !== "seat" || !firstPersonControls.isLocked) {
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
    if (event.code === "KeyW") {
      isSprinting = false;
    }
  };
  const onWindowBlur = (): void => {
    pressedKeys.clear();
    verticalVelocity = 0;
    jumpOffset = 0;
    grounded = true;
    forwardVelocity = 0;
    strafeVelocity = 0;
    isSprinting = false;
    lastForwardTapAt = Number.NEGATIVE_INFINITY;
  };
  const setControlActive = (active: boolean): void => {
    container.dataset.controlActive = active ? "true" : "false";
  };
  const onControlsLock = (): void => {
    setControlActive(true);
  };
  const onControlsUnlock = (): void => {
    setControlActive(false);
  };
  const onCanvasClick = (): void => {
    if (activeView === "seat" && !firstPersonControls.isLocked) {
      firstPersonControls.lock();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  renderer.domElement.addEventListener("click", onCanvasClick);
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
    camera.position.copy(preset.position);
    camera.lookAt(preset.target);
  };
  const setView = (view: SceneView): void => {
    activeView = view;
    if (view === "seat") {
      orbitControls.enabled = false;
      firstPersonControls.enabled = true;
      setFirstPersonPreset();
      return;
    }
    if (firstPersonControls.isLocked) {
      firstPersonControls.unlock();
    }
    firstPersonControls.enabled = false;
    orbitControls.enabled = true;
    setCameraPreset(camera, orbitControls, view);
  };
  setView(initialView);

  addFloor(scene);
  addLighting(scene);
  const skylineTexture = addSkyline(scene);
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
  const timer = new THREE.Timer();
  timer.connect(document);
  const moveSpeed = 3.4;
  const animate = (timestamp?: number): void => {
    if (disposed) {
      return;
    }
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    const targetFov = activeView === "seat" && isCrouched ? SEATED_FOV : STANDING_FOV;
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 10, delta);
    if (Math.abs(nextFov - camera.fov) > 0.001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
    for (const label of seatLabels) {
      label.visible = !isCrouched || activeView !== "seat";
    }
    if (firstPersonControls.enabled && firstPersonControls.isLocked) {
      const crouching = isCrouched;
      const targetEyeHeight = crouching ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT;
      eyeHeight = THREE.MathUtils.damp(eyeHeight, targetEyeHeight, 14, delta);
      const forward =
        (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) -
        (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
      const right =
        (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0) -
        (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0);
      const sprinting = isSprinting && pressedKeys.has("KeyW") && !crouching;
      const speedMultiplier = crouching ? 0.5 : sprinting ? SPRINT_MULTIPLIER : 1;
      const currentMoveSpeed = moveSpeed * speedMultiplier;
      const inputMagnitude = Math.hypot(forward, right);
      const inputScale = inputMagnitude > 1 ? 1 / inputMagnitude : 1;
      const desiredForward = forward * inputScale * currentMoveSpeed;
      const desiredStrafe = right * inputScale * currentMoveSpeed;
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
      camera.position.y = eyeHeight + jumpOffset;
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        ROOM_BOUNDS.minZ,
        ROOM_BOUNDS.maxZ,
      );
    } else {
      forwardVelocity = THREE.MathUtils.damp(forwardVelocity, 0, 10, delta);
      strafeVelocity = THREE.MathUtils.damp(strafeVelocity, 0, 10, delta);
      orbitControls.update();
    }
    focusRaycaster.setFromCamera(focusNdc, camera);
    const focusHit = focusRaycaster
      .intersectObjects(scene.children, true)
      .find((intersection) => !isDofIgnored(intersection.object));
    const nextFocusDistance = focusHit?.distance ?? 8;
    focusDistance = THREE.MathUtils.damp(focusDistance, nextFocusDistance, 12, delta);
    const focusUniform = bokehPass.materialBokeh.uniforms.focus;
    if (focusUniform !== undefined) {
      focusUniform.value = focusDistance;
    }
    composer.render();
    animationFrame = window.requestAnimationFrame(animate);
  };
  animate();

  return {
    setView,
    anchors,
    dispose: () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      if (resizeFrame !== 0) {
        window.cancelAnimationFrame(resizeFrame);
      }
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      firstPersonControls.removeEventListener("lock", onControlsLock);
      firstPersonControls.removeEventListener("unlock", onControlsUnlock);
      if (firstPersonControls.isLocked) {
        firstPersonControls.unlock();
      }
      firstPersonControls.dispose();
      orbitControls.dispose();
      timer.dispose();
      disposeObject(scene);
      bokehPass.dispose();
      composer.dispose();
      skylineTexture.dispose();
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
