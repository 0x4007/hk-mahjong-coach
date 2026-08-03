import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getTileDefinition, type TileTypeId } from "@hk-mahjong/core/public";

export type SceneView = "seat" | "overhead";

export interface MahjongTableMount {
  readonly setView: (view: SceneView) => void;
  readonly dispose: () => void;
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

const TABLE_TOP_Y = 1.05;
const TABLE_WIDTH = 16;
const TABLE_DEPTH = 12;
const TILE_WIDTH = 0.52;
const TILE_HEIGHT = 0.78;
const TILE_DEPTH = 0.28;
const WALL_COUNT = 18;
const WALL_SPACING = 0.76;
const TILE_BACK_COLOR = "#0e1211";
const TILE_EDGE_COLOR = "#111413";
const TILE_GOLD = "#d3ad66";

const COLORS = {
  night: 0xe7eceb,
  glass: 0xd8e2e3,
  skyline: 0x2a3032,
  wood: 0xd5d8d3,
  woodDark: 0x171a1b,
  brass: 0xc9a45a,
  felt: 0x101313,
  feltLight: 0x262b2b,
  black: 0x0d100f,
  red: 0xe9554d,
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
    position: new THREE.Vector3(10.8, 8.2, 14.2),
    target: new THREE.Vector3(0, 1.45, 0),
  },
  overhead: {
    position: new THREE.Vector3(0, 16.5, 0.2),
    target: new THREE.Vector3(0, 0.8, 0),
  },
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
    characters: TILE_GOLD,
    dots: TILE_GOLD,
    bamboo: "#5ca279",
    wind: TILE_GOLD,
    dragon: tile === "dragon.red" ? "#df6557" : tile === "dragon.green" ? "#5ca279" : TILE_GOLD,
    flower: TILE_GOLD,
    season: TILE_GOLD,
  };
  const ink = palette[visual.category] ?? TILE_GOLD;

  const paper = context.createLinearGradient(0, 0, 256, 384);
  paper.addColorStop(0, "#1b1e1b");
  paper.addColorStop(1, "#090b0a");
  context.fillStyle = paper;
  roundedRect(context, 8, 8, 240, 368, 22);
  context.fill();
  context.strokeStyle = TILE_GOLD;
  context.lineWidth = 5;
  context.stroke();

  context.fillStyle = TILE_GOLD;
  context.font = "700 18px ui-monospace, monospace";
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
      context.fillStyle = "#e8c982";
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
    context.fillStyle = "#df6557";
    context.beginPath();
    context.arc(156, 151, 19, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e8c982";
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
    context.fillStyle = "#8e7650";
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
  context.strokeStyle = "#5b4527";
  context.lineWidth = 8;
  for (let offset = -384; offset < 256; offset += 36) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + 384, 384);
    context.stroke();
  }
  context.strokeStyle = TILE_GOLD;
  context.lineWidth = 5;
  roundedRect(context, 18, 18, 220, 348, 18);
  context.stroke();
  context.fillStyle = TILE_GOLD;
  context.font = "700 24px ui-sans-serif, sans-serif";
  context.textAlign = "center";
  context.fillText("HK", 128, 204);
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
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH + 1.25, 0.9, TABLE_DEPTH + 1.25, 5, 0.4),
    createMaterial(COLORS.woodDark, 0.42),
  );
  base.position.y = 0.48;
  base.castShadow = true;
  base.receiveShadow = true;
  table.add(base);

  const woodTop = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH, 0.32, TABLE_DEPTH, 5, 0.22),
    createMaterial(COLORS.wood, 0.35),
  );
  woodTop.position.y = 0.98;
  woodTop.castShadow = true;
  woodTop.receiveShadow = true;
  table.add(woodTop);

  const felt = new THREE.Mesh(
    new RoundedBoxGeometry(TABLE_WIDTH - 0.7, 0.18, TABLE_DEPTH - 0.7, 5, 0.18),
    new THREE.MeshStandardMaterial({
      color: COLORS.felt,
      roughness: 0.92,
      metalness: 0,
    }),
  );
  // Keep the felt, inlay, and wood on distinct depth layers; coplanar faces flicker in WebGL.
  felt.position.y = TABLE_TOP_Y + 0.06;
  felt.receiveShadow = true;
  table.add(felt);

  const inlay = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.67, 64),
    new THREE.MeshStandardMaterial({
      color: COLORS.brass,
      roughness: 0.3,
      metalness: 0.75,
      emissive: 0x3c2510,
      emissiveIntensity: 0.3,
    }),
  );
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = TABLE_TOP_Y + 0.18;
  table.add(inlay);

  const center = new THREE.Mesh(
    new THREE.CircleGeometry(1.56, 64),
    new THREE.MeshStandardMaterial({ color: COLORS.feltLight, roughness: 0.93 }),
  );
  center.rotation.x = -Math.PI / 2;
  center.position.y = TABLE_TOP_Y + 0.17;
  table.add(center);

  const rails = [
    [0, 1.34, TABLE_WIDTH - 1.25, 0.12],
    [0, -1.34, TABLE_WIDTH - 1.25, 0.12],
  ] as const;
  for (const [x, z, width, depth] of rails) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.18, depth, 3, 0.05),
      createMaterial(COLORS.brass, 0.3, 0.65),
    );
    rail.position.set(x, TABLE_TOP_Y + 0.25, z);
    rail.castShadow = true;
    table.add(rail);
  }
  const sideRails = [
    [-7.34, 0, 0.12, TABLE_DEPTH - 1.25],
    [7.34, 0, 0.12, TABLE_DEPTH - 1.25],
  ] as const;
  for (const [x, z, width, depth] of sideRails) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.18, depth, 3, 0.05),
      createMaterial(COLORS.brass, 0.3, 0.65),
    );
    rail.position.set(x, TABLE_TOP_Y + 0.25, z);
    rail.castShadow = true;
    table.add(rail);
  }
  return table;
};

const createWall = (cache: TileTextureCache): THREE.Group => {
  const wall = new THREE.Group();
  const start = -((WALL_COUNT - 1) * WALL_SPACING) / 2;
  for (let index = 0; index < WALL_COUNT; index += 1) {
    const offset = start + index * WALL_SPACING;
    for (let level = 0; level < 2; level += 1) {
      const tile = createTile(cache, { faceUp: false, width: 0.65, height: 0.72, depth: 0.34 });
      tile.position.set(offset, TABLE_TOP_Y + 0.48 + level * 0.72, -5.24);
      tile.rotation.y = Math.PI;
      wall.add(tile);
      const southTile = createTile(cache, {
        faceUp: false,
        width: 0.65,
        height: 0.72,
        depth: 0.34,
      });
      southTile.position.set(offset, TABLE_TOP_Y + 0.48 + level * 0.72, 5.24);
      wall.add(southTile);
      const eastTile = createTile(cache, { faceUp: false, width: 0.65, height: 0.72, depth: 0.34 });
      eastTile.position.set(6.96, TABLE_TOP_Y + 0.48 + level * 0.72, offset);
      eastTile.rotation.y = Math.PI / 2;
      wall.add(eastTile);
      const westTile = createTile(cache, { faceUp: false, width: 0.65, height: 0.72, depth: 0.34 });
      westTile.position.set(-6.96, TABLE_TOP_Y + 0.48 + level * 0.72, offset);
      westTile.rotation.y = -Math.PI / 2;
      wall.add(westTile);
    }
  }
  return wall;
};

const createRack = (width: number): THREE.Group => {
  const rack = new THREE.Group();
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(width, 0.36, 0.62, 3, 0.08),
    createMaterial(COLORS.woodDark, 0.45),
  );
  base.position.y = TABLE_TOP_Y + 0.3;
  base.castShadow = true;
  rack.add(base);
  const lip = new THREE.Mesh(
    new RoundedBoxGeometry(width - 0.22, 0.17, 0.12, 3, 0.04),
    createMaterial(COLORS.brass, 0.3, 0.55),
  );
  lip.position.set(0, TABLE_TOP_Y + 0.58, -0.26);
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
  hand.position.copy(seatPosition);
  hand.rotation.y = rotation;
  hand.add(createRack(11.1));
  const start = -((tiles.length - 1) * 0.67) / 2;
  tiles.forEach((tile, index) => {
    const tileMesh = createTile(cache, {
      faceUp,
      width: 0.56,
      height: 0.86,
      depth: 0.3,
      ...(faceUp ? { tile } : {}),
    });
    tileMesh.position.set(start + index * 0.67, TABLE_TOP_Y + 1.03, -0.05);
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
  meld.position.copy(seatPosition);
  meld.rotation.y = rotation;
  const start = -((tiles.length - 1) * 0.58) / 2;
  tiles.forEach((tile, index) => {
    const tileMesh = createTile(cache, {
      tile,
      faceUp: true,
      bothSides: true,
      width: 0.46,
      height: 0.66,
      depth: 0.25,
    });
    tileMesh.position.set(start + index * 0.58, TABLE_TOP_Y + 0.49, 0);
    meld.add(tileMesh);
  });
  parent.add(meld);
};

const addDiscardRivers = (parent: THREE.Object3D, cache: TileTextureCache): void => {
  const rivers = [
    { position: new THREE.Vector3(0, TABLE_TOP_Y + 0.48, 2.1), rotation: 0, offset: 0 },
    { position: new THREE.Vector3(0, TABLE_TOP_Y + 0.48, -2.1), rotation: Math.PI, offset: 5 },
    { position: new THREE.Vector3(2.1, TABLE_TOP_Y + 0.48, 0), rotation: -Math.PI / 2, offset: 10 },
    { position: new THREE.Vector3(-2.1, TABLE_TOP_Y + 0.48, 0), rotation: Math.PI / 2, offset: 13 },
  ] as const;
  rivers.forEach((river, riverIndex) => {
    const row = new THREE.Group();
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
        width: 0.45,
        height: 0.64,
        depth: 0.23,
      });
      tileMesh.position.set((index - 1.5) * 0.56, 0, riverIndex % 2 === 0 ? 0 : 0.04);
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
  gradient.addColorStop(0, "#f2f5f2");
  gradient.addColorStop(0.52, "#d9e6e5");
  gradient.addColorStop(1, "#f1a17e");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.74)";
  for (let index = 0; index < 26; index += 1) {
    const x = (index * 317) % canvas.width;
    const y = 38 + ((index * 127) % 250);
    context.fillRect(x, y, index % 4 === 0 ? 5 : 3, index % 4 === 0 ? 5 : 3);
  }
  context.fillStyle = "#3a4142";
  context.fillRect(0, 480, canvas.width, 120);
  return createCanvasTexture(canvas);
};

const createBuilding = (
  skyline: THREE.Group,
  x: number,
  width: number,
  height: number,
  depth: number,
  color: number,
  windowMaterial: THREE.MeshStandardMaterial,
  accentWindowMaterial: THREE.MeshStandardMaterial,
): void => {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 }),
  );
  building.position.set(x, 2.5 + height / 2, -7.15);
  building.castShadow = true;
  skyline.add(building);
  const columns = Math.max(2, Math.floor(width / 0.6));
  const rows = Math.max(2, Math.floor(height / 0.7));
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
        x - width / 2 + 0.35 + column * ((width - 0.7) / Math.max(1, columns - 1)),
        2.7 + row * 0.65,
        -6.57,
      );
      skyline.add(window);
    }
  }
};

const addSkyline = (scene: THREE.Scene): THREE.CanvasTexture => {
  const skyline = new THREE.Group();
  const skyTexture = createSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture, transparent: false }),
  );
  sky.position.set(0, 6.4, -8.1);
  skyline.add(sky);

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2425,
    roughness: 0.88,
    metalness: 0.02,
  });
  const accentWindowMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.red,
    emissive: 0x8d1e22,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });
  createBuilding(skyline, -6.1, 2.2, 5.1, 0.8, 0xc8d0d0, windowMaterial, accentWindowMaterial);
  createBuilding(skyline, -3.7, 2.8, 3.7, 0.8, 0xe3e7e3, windowMaterial, accentWindowMaterial);
  createBuilding(skyline, -0.6, 2.4, 6.8, 0.8, 0xbec8c8, windowMaterial, accentWindowMaterial);
  createBuilding(skyline, 2.3, 2.6, 4.5, 0.8, 0xd9dfdd, windowMaterial, accentWindowMaterial);
  createBuilding(skyline, 5.2, 2.9, 5.9, 0.8, 0xc5cecd, windowMaterial, accentWindowMaterial);
  createBuilding(skyline, 7.2, 1.6, 3.4, 0.8, 0xe5e9e5, windowMaterial, accentWindowMaterial);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 32),
    new THREE.MeshBasicMaterial({ color: 0xf27665 }),
  );
  sun.position.set(-5.8, 8.6, -7.98);
  skyline.add(sun);

  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 2.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x6d7778, roughness: 0.78, metalness: 0.2 }),
  );
  spire.position.set(-0.6, 9.15, -7.14);
  skyline.add(spire);
  const waterTank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.7, 16),
    new THREE.MeshStandardMaterial({ color: 0x3f4748, roughness: 0.8 }),
  );
  waterTank.position.set(5.2, 8.2, -7.1);
  skyline.add(waterTank);

  const mullionMaterial = new THREE.MeshStandardMaterial({
    color: 0x14191a,
    roughness: 0.45,
    metalness: 0.4,
  });
  for (const x of [-8.5, 0, 8.5]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 11.4, 0.3), mullionMaterial);
    mullion.position.set(x, 6.25, -7.8);
    skyline.add(mullion);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.28, 0.6), mullionMaterial);
  sill.position.set(0, 0.75, -7.75);
  skyline.add(sill);
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
  context.fillStyle = "rgba(5, 15, 20, 0.86)";
  roundedRect(context, 4, 4, 472, 102, 20);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = "#fff4d6";
  context.font = "700 28px ui-sans-serif, sans-serif";
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
): void => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeLabelTexture(label, accent),
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.position.copy(position);
  sprite.scale.set(2.5, 0.58, 1);
  scene.add(sprite);
};

const addDice = (scene: THREE.Scene): void => {
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.black,
    roughness: 0.38,
    metalness: 0.06,
  });
  for (const [x, z, rotation] of [
    [-0.48, -0.38, 0.18],
    [0.38, -0.2, -0.22],
  ] as const) {
    const die = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.5, 3, 0.08), material);
    die.position.set(x, TABLE_TOP_Y + 0.38, z);
    die.rotation.set(rotation, rotation * 0.5, rotation);
    die.castShadow = true;
    scene.add(die);
  }
};

const addLighting = (scene: THREE.Scene): void => {
  scene.add(new THREE.HemisphereLight(0xf4f7f4, 0x313637, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 5.7);
  key.position.set(-5, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 13;
  key.shadow.camera.bottom = -13;
  scene.add(key);
  const city = new THREE.PointLight(0xe9554d, 4.5, 24, 2);
  city.position.set(-4, 6, -5);
  scene.add(city);
  const tableLamp = new THREE.PointLight(0xffd083, 7, 14, 2);
  tableLamp.position.set(0, 5.5, 0);
  scene.add(tableLamp);
};

const addFloor = (scene: THREE.Scene): void => {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x140e12, roughness: 0.72, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);
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
): MahjongTableMount => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.night);
  scene.fog = new THREE.Fog(COLORS.night, 24, 46);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive three-dimensional Hong Kong mahjong table",
  );
  renderer.domElement.dataset.sceneReady = "true";
  container.replaceChildren(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 28;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minPolarAngle = Math.PI / 5.5;
  controls.enablePan = false;
  setCameraPreset(camera, controls, initialView);

  addFloor(scene);
  addLighting(scene);
  const skylineTexture = addSkyline(scene);
  const table = createTable();
  scene.add(table);
  const textureCache = createTextureCache();
  scene.add(createWall(textureCache));
  addHand(scene, textureCache, new THREE.Vector3(0, 0, 4.35), 0, true, PLAYER_HAND);
  addHand(scene, textureCache, new THREE.Vector3(0, 0, -4.35), Math.PI, false, PLAYER_HAND);
  addHand(scene, textureCache, new THREE.Vector3(4.35, 0, 0), -Math.PI / 2, false, PLAYER_HAND);
  addHand(scene, textureCache, new THREE.Vector3(-4.35, 0, 0), Math.PI / 2, false, PLAYER_HAND);
  addOpenMeld(scene, textureCache, new THREE.Vector3(0, 0, -3.3), Math.PI, [
    "characters.7",
    "characters.8",
    "characters.9",
  ]);
  addOpenMeld(scene, textureCache, new THREE.Vector3(3.3, 0, 0), -Math.PI / 2, [
    "dots.7",
    "dots.8",
    "dots.9",
  ]);
  addOpenMeld(scene, textureCache, new THREE.Vector3(-3.3, 0, 0), Math.PI / 2, [
    "bamboo.3",
    "bamboo.4",
    "bamboo.5",
  ]);
  addDiscardRivers(scene, textureCache);
  addDice(scene);
  addLabel(scene, "YOU · SOUTH", new THREE.Vector3(0, 3.65, 4.25), "#e9554d");
  addLabel(scene, "NORTH · VALUE", new THREE.Vector3(0, 3.65, -4.25), TILE_GOLD);
  addLabel(scene, "EAST · FAST", new THREE.Vector3(4.25, 3.65, 0), "#e9554d");
  addLabel(scene, "WEST · BALANCED", new THREE.Vector3(-4.25, 3.65, 0), TILE_GOLD);

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
  const animate = (): void => {
    if (disposed) {
      return;
    }
    controls.update();
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(animate);
  };
  animate();

  return {
    setView: (view) => setCameraPreset(camera, controls, view),
    dispose: () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      if (resizeFrame !== 0) {
        window.cancelAnimationFrame(resizeFrame);
      }
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      skylineTexture.dispose();
      textureCache.back.dispose();
      for (const texture of textureCache.face.values()) {
        texture.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
