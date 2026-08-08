import * as THREE from "three";
import { createSeededRandom } from "@hk-mahjong/core/public";

import type { PhysicsBox } from "./mahjong-physics.js";

/** The warehouse play space used by Debugging 02. */
export const DEBUGGING_TWO_WORLD_BOUNDS = {
  minX: -48,
  maxX: 48,
  minZ: -36,
  maxZ: 36,
} as const;

/** The low-contrast haze used to separate the warehouse's long aisles. */
export const WAREHOUSE_FOG_COLOR = 0x07131c;
export const WAREHOUSE_FOG_NEAR = 10;
export const WAREHOUSE_FOG_FAR = 92;
export const WAREHOUSE_FOG_GENERATION = "warehouse-linear-fog-v1";

export const createWarehouseFog = (): THREE.Fog => {
  const fog = new THREE.Fog(WAREHOUSE_FOG_COLOR, WAREHOUSE_FOG_NEAR, WAREHOUSE_FOG_FAR);
  fog.name = WAREHOUSE_FOG_GENERATION;
  return fog;
};

/** Shared generated flare mask used by the Warehouse's bright fixtures. */
export const WAREHOUSE_LENS_FLARE_TEXTURE_SIZE = 64;
export const WAREHOUSE_LENS_FLARE_GENERATION = "warehouse-lens-flare-sprites-v1";
export const WAREHOUSE_LENS_FLARE_SPRITE_COUNT = 26;

/** Every generated warehouse crate is one exact one-metre cube. */
export const DEBUGGING_TWO_BOX_SIZE = 1;

/** A centimetre-scale visual seam keeps adjacent crates readable as separate boxes. */
export const DEBUGGING_TWO_BOX_GAP = 0.01;

/** Canonical silhouettes used by the warehouse's hand-held melee props. */
export type DebuggingTwoMeleeKind =
  | "crowbar"
  | "steel-pipe"
  | "fire-extinguisher"
  | "pipe-wrench"
  | "hammer"
  | "screwdriver"
  | "fireman-axe"
  | "box-cutter";

/** Horizontal centre spacing used for neighbouring crates in one pile. */
export const DEBUGGING_TWO_BOX_CELL_PITCH = DEBUGGING_TWO_BOX_SIZE + 0.08;

/** Vertical centre spacing used for supported layers in one pile. */
export const DEBUGGING_TWO_BOX_STACK_PITCH = DEBUGGING_TWO_BOX_SIZE + 0.04;

const WAREHOUSE_BAY_PITCH = 4.5;
const WAREHOUSE_BAY_MIN_X = -40.5;
const WAREHOUSE_BAY_MIN_Z = -27;
const WAREHOUSE_BAY_COUNT_X = 19;
const WAREHOUSE_BAY_COUNT_Z = 13;
const WAREHOUSE_MIN_STACK_HEIGHT = 2;
const WAREHOUSE_MAX_STACK_HEIGHT = 6;
const WAREHOUSE_PILE_MIN_COLUMNS = 1;
const WAREHOUSE_PILE_MAX_COLUMNS = 3;
const WAREHOUSE_PILE_MIN_ROWS = 1;
const WAREHOUSE_PILE_MAX_ROWS = 3;
/** Keep a small clear gap so neighbouring crates never interpenetrate. */
const WAREHOUSE_PILE_CELL_PITCH = DEBUGGING_TWO_BOX_CELL_PITCH;
/** A stacked crate sits directly over its support footprint with a tiny seam. */
const WAREHOUSE_PILE_LAYER_PITCH = DEBUGGING_TWO_BOX_STACK_PITCH;
const WAREHOUSE_PILE_ORIGIN_JITTER = 0.18;
const WAREHOUSE_WALL_ORIGIN_JITTER = 0.12;
const WAREHOUSE_WALL_MIN_HEIGHT = 3;
const WAREHOUSE_WALL_MAX_HEIGHT = 5;
const WAREHOUSE_WALL_TEMPLATES = [
  { id: "west-yard", originX: -35.5, originZ: -20, widthCells: 9, depthCells: 6 },
  { id: "east-yard", originX: 25.5, originZ: -5, widthCells: 7, depthCells: 8 },
  { id: "north-yard", originX: -16.5, originZ: 14, widthCells: 8, depthCells: 5 },
] as const;
const WAREHOUSE_BOX_COLORS = [0xb56f3b, 0xc47b40, 0xa86035, 0xd18a4c, 0x9e5931] as const;
const WAREHOUSE_RACK_BODY_SIZE = [0.84, 0.96, 0.8] as const;
/** Number of larger status bars placed around each rack body. */
export const DEBUGGING_TWO_RACK_LED_BARS_PER_RACK = 8;
/** Width of one status bar along a rack face. */
export const DEBUGGING_TWO_RACK_LED_BAR_WIDTH = 0.3;
/** Height of one status bar along a rack face. */
export const DEBUGGING_TWO_RACK_LED_BAR_HEIGHT = 0.035;
/** Depth of one boxed status bar, kept just outside the rack body. */
export const DEBUGGING_TWO_RACK_LED_BAR_DEPTH = 0.018;
const WAREHOUSE_RACK_LED_BAR_FACE_OFFSET_Z = 0.412;
const WAREHOUSE_RACK_LED_BAR_FACE_OFFSET_X = 0.432;
const WAREHOUSE_RACK_LED_BAR_VERTICAL_OFFSETS = [-0.2, 0.2] as const;
const WAREHOUSE_RACK_LED_ON_COLOR = 0x38cfff;
const WAREHOUSE_RACK_LED_OFF_COLOR = 0x14607a;
const WAREHOUSE_RACK_LED_GLOW_ON_COLOR = 0x9feeff;
const WAREHOUSE_RACK_LED_GLOW_OFF_COLOR = 0x25718d;
const WAREHOUSE_RACK_BLINK_GROUPS = 3;
const WAREHOUSE_RACK_BLINK_PERIOD_SECONDS = 1.1;
const WAREHOUSE_RACK_LED_GLOW_OPACITY = 0.28;
const WAREHOUSE_RACK_BLINK_GLOW_OPACITY = 0.4;
const WAREHOUSE_RACK_BLINK_GLOW_DARK_OPACITY = 0.16;
/** Rack indicators use opaque boxed bars with a small instanced alpha glow for readability. */
export const DEBUGGING_TWO_RACK_BLINKING_ENABLED = true;
const WAREHOUSE_CEILING_HEIGHT = 9;
const WAREHOUSE_LIGHT_HEIGHT = 8.25;
const WAREHOUSE_SPOTLIGHT_HEIGHT = 7.25;
const WAREHOUSE_LIGHT_X_POSITIONS = [-30, -10, 10, 30] as const;
const WAREHOUSE_LIGHT_Z_POSITIONS = [-22, 22] as const;
const WAREHOUSE_FLOOR_LED_HEIGHT = 0.028;
const WAREHOUSE_FLOOR_LED_WIDTH = 0.3;
const WAREHOUSE_FLOOR_LED_LENGTH = 0.9;
const WAREHOUSE_PERIMETER_LED_INSET = 1.35;
const WAREHOUSE_PERIMETER_LED_PITCH = 2.6;
const WAREHOUSE_PERIMETER_LED_LENGTH = 2.2;
const WAREHOUSE_PERIMETER_LED_COLOR = 0xffd42e;
const WAREHOUSE_EMERGENCY_LIGHT_HEIGHT = 3.35;
const WAREHOUSE_EMERGENCY_LIGHT_COLOR = 0xff2638;
const WAREHOUSE_WALL_LIGHTMAP_WIDTH = 96;
const WAREHOUSE_WALL_LIGHTMAP_HEIGHT = 24;
const WAREHOUSE_WALL_BASE_COLOR = 0x3c474c;
const WAREHOUSE_WALL_GLOW_CUTOFF_HEIGHT = 4.25;
const WAREHOUSE_WALL_GLOW_EXPONENT = 1.8;
const WAREHOUSE_WALL_BAKE_GENERATION = "warehouse-wall-area-bake-v2-dim-bottom";
const WAREHOUSE_FLOOR_LIGHTMAP_WIDTH = 96;
const WAREHOUSE_FLOOR_LIGHTMAP_HEIGHT = 72;
const WAREHOUSE_FLOOR_BASE_COLOR = 0x343a43;
const WAREHOUSE_FLOOR_BAKE_GENERATION = "warehouse-floor-area-bake-v1-center";
const WAREHOUSE_EMERGENCY_LIGHTS = [
  { id: "north", x: 0, z: DEBUGGING_TWO_WORLD_BOUNDS.maxZ - 0.42, rotationY: 0 },
  { id: "east", x: DEBUGGING_TWO_WORLD_BOUNDS.maxX - 0.42, z: 0, rotationY: Math.PI / 2 },
  { id: "south", x: 0, z: DEBUGGING_TWO_WORLD_BOUNDS.minZ + 0.42, rotationY: Math.PI },
  { id: "west", x: DEBUGGING_TWO_WORLD_BOUNDS.minX + 0.42, z: 0, rotationY: -Math.PI / 2 },
] as const;
const WAREHOUSE_LANE_EMERGENCY_LIGHT_X_POSITIONS = [-12, 12] as const;
const WAREHOUSE_LANE_EMERGENCY_LIGHT_Z_POSITIONS = [-30, -18, -6, 6, 18, 30] as const;

interface WarehouseBoxPlan {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly color: number;
}

interface WarehouseGeneration {
  readonly boxes: readonly WarehouseBoxPlan[];
  readonly physicsBoxes: readonly PhysicsBox[];
  readonly stackCount: number;
  readonly wallCount: number;
  readonly wallCrateCount: number;
}

export interface DebuggingTwoMeleeSpawn {
  readonly id: string;
  readonly kind: DebuggingTwoMeleeKind;
  readonly displayName: string;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY: number;
  readonly color: number;
}

export interface DebuggingTwoMapResources {
  readonly root: THREE.Group;
  readonly physicsBoxes: readonly PhysicsBox[];
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly simulantSpawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly variant: string;
  readonly explorationArea: string;
  readonly cyanMaterials: readonly THREE.MeshStandardMaterial[];
  readonly redMaterials: readonly THREE.MeshStandardMaterial[];
  readonly textures: readonly THREE.Texture[];
  readonly meleeObjects: readonly DebuggingTwoMeleeSpawn[];
}

const clampStackHeight = (height: number): number =>
  Math.max(WAREHOUSE_MIN_STACK_HEIGHT, Math.min(WAREHOUSE_MAX_STACK_HEIGHT, height));

const randomSigned = (random: ReturnType<typeof createSeededRandom>, magnitude: number): number =>
  (random.nextFloat() * 2 - 1) * magnitude;

/**
 * Generate a warehouse aisle layout from the room seed. The centre aisle and
 * three cross aisles stay open so the player and simulant can traverse the
 * storage floor instead of spawning inside a solid crate field. Each bay is a
 * small, stable pile: layers can have one or two crates, upper layers only use
 * occupied support cells, and every crate stays level with a yaw-only rotation.
 */
const generateWarehouse = (roomSeed: string): WarehouseGeneration => {
  const random = createSeededRandom(`${roomSeed}|debugging-02|warehouse|v3`);
  const boxes: WarehouseBoxPlan[] = [];
  const physicsBoxes: PhysicsBox[] = [];
  let stackCount = 0;
  let wallCount = 0;
  let wallCrateCount = 0;

  const addCrate = (x: number, y: number, z: number, rotationY: number, color: number): boolean => {
    const clearOfExistingCrates = physicsBoxes.every(
      (existing) =>
        Math.abs(existing.center.x - x) >= DEBUGGING_TWO_BOX_SIZE + DEBUGGING_TWO_BOX_GAP ||
        Math.abs(existing.center.y - y) >= DEBUGGING_TWO_BOX_SIZE + DEBUGGING_TWO_BOX_GAP ||
        Math.abs(existing.center.z - z) >= DEBUGGING_TWO_BOX_SIZE + DEBUGGING_TWO_BOX_GAP,
    );
    if (!clearOfExistingCrates) {
      return false;
    }
    physicsBoxes.push({
      center: { x, y, z },
      halfExtents: {
        x: DEBUGGING_TWO_BOX_SIZE / 2,
        y: DEBUGGING_TWO_BOX_SIZE / 2,
        z: DEBUGGING_TWO_BOX_SIZE / 2,
      },
      rotationX: 0,
      rotationY,
      rotationZ: 0,
      friction: 0.86,
    });
    boxes.push({ x, y, z, rotationX: 0, rotationY, rotationZ: 0, color });
    return true;
  };

  // Build a few enclosed crate yards before the ordinary bay piles. The
  // occupancy check in addCrate reserves these wall footprints automatically.
  for (const template of WAREHOUSE_WALL_TEMPLATES) {
    const originX = template.originX + randomSigned(random, WAREHOUSE_WALL_ORIGIN_JITTER);
    const originZ = template.originZ + randomSigned(random, WAREHOUSE_WALL_ORIGIN_JITTER);
    const wallHeight =
      WAREHOUSE_WALL_MIN_HEIGHT +
      random.nextInt(WAREHOUSE_WALL_MAX_HEIGHT - WAREHOUSE_WALL_MIN_HEIGHT + 1);
    let hasWallCrate = false;
    for (let level = 0; level < wallHeight; level += 1) {
      for (let columnX = 0; columnX < template.widthCells; columnX += 1) {
        for (let columnZ = 0; columnZ < template.depthCells; columnZ += 1) {
          const boundary =
            columnX === 0 ||
            columnX === template.widthCells - 1 ||
            columnZ === 0 ||
            columnZ === template.depthCells - 1;
          if (!boundary) {
            continue;
          }
          const x = originX + columnX * WAREHOUSE_PILE_CELL_PITCH;
          const y = DEBUGGING_TWO_BOX_SIZE / 2 + level * WAREHOUSE_PILE_LAYER_PITCH;
          const z = originZ + columnZ * WAREHOUSE_PILE_CELL_PITCH;
          const added = addCrate(
            x,
            y,
            z,
            random.nextFloat() * Math.PI * 2,
            WAREHOUSE_BOX_COLORS[(columnX + columnZ + level) % WAREHOUSE_BOX_COLORS.length] ??
              WAREHOUSE_BOX_COLORS[0],
          );
          if (added) {
            wallCrateCount += 1;
            hasWallCrate = true;
          }
        }
      }
    }
    if (hasWallCrate) {
      wallCount += 1;
      stackCount += 1;
    }
  }

  for (let xIndex = 0; xIndex < WAREHOUSE_BAY_COUNT_X; xIndex += 1) {
    const bayX = WAREHOUSE_BAY_MIN_X + xIndex * WAREHOUSE_BAY_PITCH;
    // A wide forklift aisle runs from the player spawn to the simulant.
    if (xIndex === Math.floor(WAREHOUSE_BAY_COUNT_X / 2)) {
      continue;
    }
    for (let zIndex = 0; zIndex < WAREHOUSE_BAY_COUNT_Z; zIndex += 1) {
      const bayZ = WAREHOUSE_BAY_MIN_Z + zIndex * WAREHOUSE_BAY_PITCH;
      // Cross aisles break the rows into readable warehouse sections.
      if (zIndex % 4 === 1) {
        continue;
      }
      // Leave a few seed-derived gaps so the stacks do not form a repeated wall.
      if (random.nextFloat() < 0.08) {
        continue;
      }

      const baseHeight = 4 + random.nextInt(WAREHOUSE_MAX_STACK_HEIGHT - 3);
      const stackHeight = clampStackHeight(baseHeight + random.nextInt(3) - 1);
      const pileColumns =
        WAREHOUSE_PILE_MIN_COLUMNS +
        random.nextInt(WAREHOUSE_PILE_MAX_COLUMNS - WAREHOUSE_PILE_MIN_COLUMNS + 1);
      const pileRows =
        WAREHOUSE_PILE_MIN_ROWS +
        random.nextInt(WAREHOUSE_PILE_MAX_ROWS - WAREHOUSE_PILE_MIN_ROWS + 1);
      const pileOriginX = randomSigned(random, WAREHOUSE_PILE_ORIGIN_JITTER);
      const pileOriginZ = randomSigned(random, WAREHOUSE_PILE_ORIGIN_JITTER);
      const cellCount = pileColumns * pileRows;
      let supportedCells = Array.from({ length: cellCount }, () => true);
      let pileHasBox = false;

      for (let level = 0; level < stackHeight; level += 1) {
        const levelOccupancy = level === 0 ? 0.86 : 0.7;
        const nextSupportedCells = Array.from({ length: cellCount }, () => false);
        const firstSupportedCell = supportedCells.findIndex((supported) => supported);
        for (let columnX = 0; columnX < pileColumns; columnX += 1) {
          for (let columnZ = 0; columnZ < pileRows; columnZ += 1) {
            const cellIndex = columnX * pileRows + columnZ;
            const shouldPlace =
              supportedCells[cellIndex] === true &&
              (random.nextFloat() < levelOccupancy || cellIndex === firstSupportedCell);
            if (!shouldPlace) {
              continue;
            }

            // Crates remain parallel to the floor. Only yaw changes, so each
            // layer has full face-to-face support and cannot tilt into a gap.
            const rotationY = random.nextFloat() * Math.PI * 2;
            const x =
              bayX + pileOriginX + (columnX - (pileColumns - 1) / 2) * WAREHOUSE_PILE_CELL_PITCH;
            const z =
              bayZ + pileOriginZ + (columnZ - (pileRows - 1) / 2) * WAREHOUSE_PILE_CELL_PITCH;
            const y = DEBUGGING_TWO_BOX_SIZE / 2 + level * WAREHOUSE_PILE_LAYER_PITCH;
            const color =
              WAREHOUSE_BOX_COLORS[
                (random.nextInt(WAREHOUSE_BOX_COLORS.length) + level + cellIndex) %
                  WAREHOUSE_BOX_COLORS.length
              ] ?? WAREHOUSE_BOX_COLORS[0];

            if (addCrate(x, y, z, rotationY, color)) {
              nextSupportedCells[cellIndex] = true;
              pileHasBox = true;
            }
          }
        }
        supportedCells = nextSupportedCells;
      }
      if (pileHasBox) {
        stackCount += 1;
      }
    }
  }

  return { boxes, physicsBoxes, stackCount, wallCount, wallCrateCount };
};

const createWarehouseRacks = (
  root: THREE.Group,
  plans: readonly WarehouseBoxPlan[],
  roomSeed: string,
): void => {
  if (plans.length === 0) {
    return;
  }
  const rackRoot = new THREE.Group();
  rackRoot.name = "DebuggingTwoDataCenterRacks";
  rackRoot.userData = {
    dofIgnore: false,
    physicsIgnore: true,
    mapFeature: "data-center-racks",
    generation: "data-center-racks-v1",
    iceBlue: true,
    blinkingLedGroups: WAREHOUSE_RACK_BLINK_GROUPS,
    blinkingDisabled: false,
    blinkMaterial: "opaque-base-alpha-glow",
    alphaGlowGroups: WAREHOUSE_RACK_BLINK_GROUPS + 1,
    blinkMode: "four-sided-bar-opaque-base-alpha-glow",
    blinkPeriodSeconds: WAREHOUSE_RACK_BLINK_PERIOD_SECONDS,
    ledLayout: "four-sided-status-bars-v1",
    ledBarsPerRack: DEBUGGING_TWO_RACK_LED_BARS_PER_RACK,
    ledBarWidth: DEBUGGING_TWO_RACK_LED_BAR_WIDTH,
    ledBarHeight: DEBUGGING_TWO_RACK_LED_BAR_HEIGHT,
    ledBarDepth: DEBUGGING_TWO_RACK_LED_BAR_DEPTH,
    pixelVariation: "seeded-four-sided-bar-blink-v1",
    rackCount: plans.length,
  };

  const bodyGeometry = new THREE.BoxGeometry(...WAREHOUSE_RACK_BODY_SIZE);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x102534,
    roughness: 0.56,
    metalness: 0.76,
    vertexColors: true,
  });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, plans.length);
  bodies.name = "DataCenterRackBodies";
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  bodies.userData = {
    dofIgnore: false,
    physicsIgnore: true,
    dataCenterRack: true,
    rackBody: true,
  };
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  plans.forEach((plan, index) => {
    transform.position.set(plan.x, plan.y, plan.z);
    transform.rotation.set(plan.rotationX, plan.rotationY, plan.rotationZ, "XYZ");
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    bodies.setMatrixAt(index, transform.matrix);
    color.setHex(index % 3 === 0 ? 0x172f42 : index % 3 === 1 ? 0x10283a : 0x0c1f30);
    bodies.setColorAt(index, color);
  });
  bodies.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor !== null) {
    bodies.instanceColor.needsUpdate = true;
  }
  bodies.computeBoundingSphere();
  rackRoot.add(bodies);

  const steadyLedMatrices: THREE.Matrix4[] = [];
  const blinkingLedMatrices: THREE.Matrix4[][] = Array.from(
    { length: WAREHOUSE_RACK_BLINK_GROUPS },
    () => [],
  );
  const ledTransform = new THREE.Object3D();
  const ledPatternRandom = createSeededRandom(`${roomSeed}|debugging-02|rack-led-bars|v2`);
  const faceDefinitions = [
    { axis: "z", offset: -WAREHOUSE_RACK_LED_BAR_FACE_OFFSET_Z, rotationY: 0 },
    { axis: "z", offset: WAREHOUSE_RACK_LED_BAR_FACE_OFFSET_Z, rotationY: 0 },
    { axis: "x", offset: -WAREHOUSE_RACK_LED_BAR_FACE_OFFSET_X, rotationY: Math.PI / 2 },
    { axis: "x", offset: WAREHOUSE_RACK_LED_BAR_FACE_OFFSET_X, rotationY: Math.PI / 2 },
  ] as const;
  plans.forEach((plan) => {
    const cosine = Math.cos(plan.rotationY);
    const sine = Math.sin(plan.rotationY);
    for (const face of faceDefinitions) {
      for (const barOffset of WAREHOUSE_RACK_LED_BAR_VERTICAL_OFFSETS) {
        const localX = face.axis === "z" ? 0 : face.offset;
        const localZ = face.axis === "z" ? face.offset : barOffset;
        const worldX = plan.x + cosine * localX + sine * localZ;
        const worldZ = plan.z - sine * localX + cosine * localZ;
        const localY = barOffset;
        ledTransform.position.set(worldX, plan.y + localY, worldZ);
        ledTransform.rotation.set(0, plan.rotationY + face.rotationY, 0);
        ledTransform.scale.set(1, 1, 1);
        ledTransform.updateMatrix();
        const matrix = ledTransform.matrix.clone();
        if (ledPatternRandom.nextFloat() < 0.28) {
          const group = ledPatternRandom.nextInt(WAREHOUSE_RACK_BLINK_GROUPS);
          blinkingLedMatrices[group]?.push(matrix);
        } else {
          steadyLedMatrices.push(matrix);
        }
      }
    }
  });

  const ledGeometry = new THREE.BoxGeometry(
    DEBUGGING_TWO_RACK_LED_BAR_WIDTH,
    DEBUGGING_TWO_RACK_LED_BAR_HEIGHT,
    DEBUGGING_TWO_RACK_LED_BAR_DEPTH,
  );
  const glowGeometry = new THREE.BoxGeometry(
    DEBUGGING_TWO_RACK_LED_BAR_WIDTH * 1.8,
    DEBUGGING_TWO_RACK_LED_BAR_HEIGHT * 1.15,
    DEBUGGING_TWO_RACK_LED_BAR_DEPTH * 1.8,
  );
  const createLedMesh = (
    name: string,
    matrices: readonly THREE.Matrix4[],
    material: THREE.MeshBasicMaterial,
    geometry: THREE.BufferGeometry,
  ): THREE.InstancedMesh => {
    const leds = new THREE.InstancedMesh(geometry, material, matrices.length);
    leds.name = name;
    leds.castShadow = false;
    leds.receiveShadow = false;
    leds.userData = {
      warehouseLighting: true,
      physicsIgnore: true,
      dofIgnore: true,
      dataCenterRack: true,
      rackLed: true,
      ledLayout: "four-sided-status-bars-v1",
      ledBarsPerRack: DEBUGGING_TWO_RACK_LED_BARS_PER_RACK,
    };
    matrices.forEach((matrix, index) => leds.setMatrixAt(index, matrix));
    leds.instanceMatrix.needsUpdate = true;
    leds.computeBoundingSphere();
    rackRoot.add(leds);
    return leds;
  };
  const createGlow = (
    name: string,
    matrices: readonly THREE.Matrix4[],
    material: THREE.MeshBasicMaterial,
  ): THREE.InstancedMesh => {
    const glow = createLedMesh(name, matrices, material, glowGeometry);
    glow.userData.rackLed = false;
    glow.userData.rackLedGlow = true;
    glow.renderOrder = 2;
    return glow;
  };

  createLedMesh(
    "DataCenterRackLEDsSteady",
    steadyLedMatrices,
    new THREE.MeshBasicMaterial({
      color: WAREHOUSE_RACK_LED_ON_COLOR,
      toneMapped: false,
      fog: false,
    }),
    ledGeometry,
  );
  createGlow(
    "DataCenterRackLEDGlowSteady",
    steadyLedMatrices,
    new THREE.MeshBasicMaterial({
      color: WAREHOUSE_RACK_LED_GLOW_ON_COLOR,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: WAREHOUSE_RACK_LED_GLOW_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  blinkingLedMatrices.forEach((matrices, groupIndex) => {
    const material = new THREE.MeshBasicMaterial({
      color: WAREHOUSE_RACK_LED_ON_COLOR,
      toneMapped: false,
      fog: false,
    });
    const leds = createLedMesh(
      `DataCenterRackLEDsBlinking:${String(groupIndex)}`,
      matrices,
      material,
      ledGeometry,
    );
    leds.userData.blinking = true;
    leds.userData.phase = groupIndex / WAREHOUSE_RACK_BLINK_GROUPS;
    leds.userData.opaqueBlink = true;
    leds.userData.blinkMode = "opaque-bar-square-wave";
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: WAREHOUSE_RACK_LED_GLOW_ON_COLOR,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: WAREHOUSE_RACK_BLINK_GLOW_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = createGlow(
      `DataCenterRackLEDGlowBlinking:${String(groupIndex)}`,
      matrices,
      glowMaterial,
    );
    glow.userData.blinkGlow = true;
    glow.userData.blinkGroup = groupIndex;
    const updateBlinkVisual = (): void => {
      const nowSeconds = typeof performance === "undefined" ? 0 : performance.now() / 1000;
      const phase = groupIndex / WAREHOUSE_RACK_BLINK_GROUPS;
      const cycle = (nowSeconds / WAREHOUSE_RACK_BLINK_PERIOD_SECONDS + phase) % 1;
      const isLit = cycle < 0.62;
      material.color.setHex(isLit ? WAREHOUSE_RACK_LED_ON_COLOR : WAREHOUSE_RACK_LED_OFF_COLOR);
      glowMaterial.color.setHex(
        isLit ? WAREHOUSE_RACK_LED_GLOW_ON_COLOR : WAREHOUSE_RACK_LED_GLOW_OFF_COLOR,
      );
      glowMaterial.opacity = isLit
        ? WAREHOUSE_RACK_BLINK_GLOW_OPACITY
        : WAREHOUSE_RACK_BLINK_GLOW_DARK_OPACITY;
    };
    leds.onBeforeRender = updateBlinkVisual;
    glow.onBeforeRender = updateBlinkVisual;
  });
  root.add(rackRoot);
};

type WarehouseWallDirection = "north" | "south" | "east" | "west";

const srgbByteToLinear = (value: number): number => Math.pow(value / 255, 2.2);

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const resolveWarehouseWallWorldPosition = (
  direction: WarehouseWallDirection,
  u: number,
  v: number,
  width: number,
  depth: number,
  wallHeight: number,
): { readonly x: number; readonly y: number; readonly z: number } => {
  const x = DEBUGGING_TWO_WORLD_BOUNDS.minX + width * u;
  const z = DEBUGGING_TWO_WORLD_BOUNDS.minZ + depth * u;
  const y = v * wallHeight;
  switch (direction) {
    case "north":
      return { x, y, z: DEBUGGING_TWO_WORLD_BOUNDS.maxZ - 0.38 };
    case "south":
      return { x, y, z: DEBUGGING_TWO_WORLD_BOUNDS.minZ + 0.38 };
    case "east":
      return { x: DEBUGGING_TWO_WORLD_BOUNDS.maxX - 0.38, y, z };
    case "west":
      return { x: DEBUGGING_TWO_WORLD_BOUNDS.minX + 0.38, y, z };
  }
};

const resolveWarehouseEmergencyGlow = (
  direction: WarehouseWallDirection,
  x: number,
  y: number,
  z: number,
): number => {
  const matchingFixture = WAREHOUSE_EMERGENCY_LIGHTS.find((fixture) => {
    if (fixture.id !== direction) {
      return false;
    }
    return true;
  });
  if (matchingFixture === undefined) {
    return 0;
  }
  const alongWall = direction === "north" || direction === "south" ? x : z;
  const fixtureAlongWall =
    direction === "north" || direction === "south" ? matchingFixture.x : matchingFixture.z;
  const distanceAlongWall = Math.abs(alongWall - fixtureAlongWall);
  const distanceFromFixture = Math.hypot(
    distanceAlongWall / 7.5,
    (y - WAREHOUSE_EMERGENCY_LIGHT_HEIGHT) / 2.2,
  );
  // The red fixture is intentionally a soft baked tint, not another dynamic light.
  return Math.exp(-(distanceFromFixture * distanceFromFixture));
};

const createWarehouseWallLightMap = (
  direction: WarehouseWallDirection,
  width: number,
  depth: number,
  wallHeight: number,
): THREE.DataTexture => {
  const baseRed = srgbByteToLinear((WAREHOUSE_WALL_BASE_COLOR >> 16) & 0xff);
  const baseGreen = srgbByteToLinear((WAREHOUSE_WALL_BASE_COLOR >> 8) & 0xff);
  const baseBlue = srgbByteToLinear(WAREHOUSE_WALL_BASE_COLOR & 0xff);
  const data = new Uint8Array(WAREHOUSE_WALL_LIGHTMAP_WIDTH * WAREHOUSE_WALL_LIGHTMAP_HEIGHT * 4);

  for (let row = 0; row < WAREHOUSE_WALL_LIGHTMAP_HEIGHT; row += 1) {
    const v = row / (WAREHOUSE_WALL_LIGHTMAP_HEIGHT - 1);
    for (let column = 0; column < WAREHOUSE_WALL_LIGHTMAP_WIDTH; column += 1) {
      const u = column / (WAREHOUSE_WALL_LIGHTMAP_WIDTH - 1);
      const position = resolveWarehouseWallWorldPosition(direction, u, v, width, depth, wallHeight);
      const centerDistance = Math.hypot(position.x, position.z);
      const centerGlow = Math.exp(-((centerDistance / 29) * (centerDistance / 29)));
      const floorGlow = Math.exp(-((position.y / 2.8) * (position.y / 2.8)));
      const verticalGlow =
        position.y >= WAREHOUSE_WALL_GLOW_CUTOFF_HEIGHT
          ? 0
          : Math.pow(
              1 - position.y / WAREHOUSE_WALL_GLOW_CUTOFF_HEIGHT,
              WAREHOUSE_WALL_GLOW_EXPONENT,
            );
      const emergencyGlow = resolveWarehouseEmergencyGlow(
        direction,
        position.x,
        position.y,
        position.z,
      );
      const perimeterGlow = 0.34 * floorGlow * verticalGlow;
      const ambient = verticalGlow * (0.22 + centerGlow * 0.28);
      const warm = verticalGlow * centerGlow * 0.2;
      const yellow = perimeterGlow * 0.42;
      const red = verticalGlow === 0 ? 0 : emergencyGlow * (0.11 + verticalGlow * 0.19);
      const redChannel =
        baseRed * (ambient + warm + yellow + red) + warm * 0.03 + yellow * 0.07 + red * 0.13;
      const greenChannel =
        baseGreen * (ambient + warm * 0.58 + yellow * 0.78 + red * 0.06) +
        warm * 0.018 +
        yellow * 0.045;
      const blueChannel =
        baseBlue * (ambient + warm * 0.2 + yellow * 0.08 + red * 0.02) + warm * 0.008;
      const offset = (row * WAREHOUSE_WALL_LIGHTMAP_WIDTH + column) * 4;
      data[offset] = Math.round(clampUnit(redChannel) * 255);
      data[offset + 1] = Math.round(clampUnit(greenChannel) * 255);
      data[offset + 2] = Math.round(clampUnit(blueChannel) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WAREHOUSE_WALL_LIGHTMAP_WIDTH,
    WAREHOUSE_WALL_LIGHTMAP_HEIGHT,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `WarehouseWallLightMap:${direction}`;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.userData = {
    warehouseLighting: true,
    bakedAreaLighting: true,
    generation: WAREHOUSE_WALL_BAKE_GENERATION,
    direction,
  };
  texture.needsUpdate = true;
  return texture;
};

const createWarehouseWallGeometry = (
  size: readonly [number, number, number],
  direction: WarehouseWallDirection,
): THREE.BoxGeometry => {
  const geometry = new THREE.BoxGeometry(...size);
  const position = geometry.getAttribute("position");
  const uv1 = new Float32Array(position.count * 2);
  const uv2 = new Float32Array(position.count * 2);
  const horizontalSize = direction === "north" || direction === "south" ? size[0] : size[2];
  for (let index = 0; index < position.count; index += 1) {
    const horizontal =
      direction === "north" || direction === "south" ? position.getX(index) : position.getZ(index);
    const vertical = position.getY(index);
    const u = clampUnit((horizontal + horizontalSize / 2) / horizontalSize);
    const v = clampUnit((vertical + size[1] / 2) / size[1]);
    uv1[index * 2] = u;
    uv1[index * 2 + 1] = v;
    uv2[index * 2] = u;
    uv2[index * 2 + 1] = v;
  }
  // Three.js calls the lightmap channel `uv1`; keep `uv2` as an explicit alias
  // for tooling and older scene diagnostics that refer to the second UV set.
  geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
  geometry.setAttribute("uv2", new THREE.Float32BufferAttribute(uv2, 2));
  return geometry;
};

const createWarehouseBakedWallMaterial = (
  direction: WarehouseWallDirection,
  width: number,
  depth: number,
  wallHeight: number,
  textures: THREE.Texture[],
): THREE.MeshBasicMaterial => {
  const lightMap = createWarehouseWallLightMap(direction, width, depth, wallHeight);
  textures.push(lightMap);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  material.name = `WarehouseBakedWallMaterial:${direction}`;
  material.lightMap = lightMap;
  material.lightMapIntensity = Math.PI;
  material.userData = {
    warehouseLighting: true,
    bakedAreaLighting: true,
    dynamicLightingDisabled: true,
    generation: WAREHOUSE_WALL_BAKE_GENERATION,
    direction,
  };
  return material;
};

const createWarehouseStructure = (root: THREE.Group, textures: THREE.Texture[]): void => {
  const structure = new THREE.Group();
  structure.name = "DebuggingTwoWarehouseStructure";
  structure.userData = {
    warehouseStructure: true,
    physicsIgnore: true,
    bakedAreaLighting: true,
    generation: WAREHOUSE_WALL_BAKE_GENERATION,
  };

  const steelMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b252a,
    roughness: 0.58,
    metalness: 0.72,
  });
  const hazardMaterial = new THREE.MeshStandardMaterial({
    color: 0xd18b22,
    emissive: 0x321b04,
    emissiveIntensity: 0.35,
    roughness: 0.65,
    metalness: 0.18,
  });
  const width = DEBUGGING_TWO_WORLD_BOUNDS.maxX - DEBUGGING_TWO_WORLD_BOUNDS.minX;
  const depth = DEBUGGING_TWO_WORLD_BOUNDS.maxZ - DEBUGGING_TWO_WORLD_BOUNDS.minZ;
  const wallHeight = WAREHOUSE_CEILING_HEIGHT;

  const addBox = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { warehouseStructure: true, physicsIgnore: true };
    structure.add(mesh);
  };

  const addBakedWall = (
    name: string,
    direction: WarehouseWallDirection,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
  ): void => {
    const mesh = new THREE.Mesh(
      createWarehouseWallGeometry(size, direction),
      createWarehouseBakedWallMaterial(direction, width, depth, wallHeight, textures),
    );
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = {
      warehouseStructure: true,
      warehouseWall: true,
      physicsIgnore: true,
      bakedAreaLighting: true,
      dynamicLightingDisabled: true,
      castsShadow: false,
      receivesShadow: false,
      generation: WAREHOUSE_WALL_BAKE_GENERATION,
      direction,
    };
    structure.add(mesh);
  };

  addBakedWall(
    "WarehouseWallNorth",
    "north",
    [width, wallHeight, 0.38],
    [0, wallHeight / 2, DEBUGGING_TWO_WORLD_BOUNDS.maxZ - 0.19],
  );
  addBakedWall(
    "WarehouseWallSouth",
    "south",
    [width, wallHeight, 0.38],
    [0, wallHeight / 2, DEBUGGING_TWO_WORLD_BOUNDS.minZ + 0.19],
  );
  addBakedWall(
    "WarehouseWallEast",
    "east",
    [0.38, wallHeight, depth],
    [DEBUGGING_TWO_WORLD_BOUNDS.maxX - 0.19, wallHeight / 2, 0],
  );
  addBakedWall(
    "WarehouseWallWest",
    "west",
    [0.38, wallHeight, depth],
    [DEBUGGING_TWO_WORLD_BOUNDS.minX + 0.19, wallHeight / 2, 0],
  );

  for (const z of [-24, 0, 24]) {
    addBox(
      "WarehouseRoofTruss",
      [width - 1.2, 0.24, 0.32],
      [0, wallHeight - 0.35, z],
      steelMaterial,
    );
  }
  for (const x of [DEBUGGING_TWO_WORLD_BOUNDS.minX + 1.1, DEBUGGING_TWO_WORLD_BOUNDS.maxX - 1.1]) {
    for (const z of [-30, -10, 10, 30]) {
      addBox(
        "WarehouseSteelColumn",
        [0.42, wallHeight, 0.42],
        [x, wallHeight / 2, z],
        steelMaterial,
      );
    }
  }

  // Forklift lanes use simple safety lines rather than extra blocking geometry.
  for (const x of [-12, 12]) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.18, depth - 8), hazardMaterial);
    lane.name = "WarehouseSafetyLine";
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, 0.018, 0);
    lane.userData = { warehouseStructure: true, physicsIgnore: true, dofIgnore: true };
    structure.add(lane);
  }

  root.add(structure);
};

const createWarehouseFloorLightMap = (width: number, depth: number): THREE.DataTexture => {
  const baseRed = srgbByteToLinear((WAREHOUSE_FLOOR_BASE_COLOR >> 16) & 0xff);
  const baseGreen = srgbByteToLinear((WAREHOUSE_FLOOR_BASE_COLOR >> 8) & 0xff);
  const baseBlue = srgbByteToLinear(WAREHOUSE_FLOOR_BASE_COLOR & 0xff);
  const data = new Uint8Array(WAREHOUSE_FLOOR_LIGHTMAP_WIDTH * WAREHOUSE_FLOOR_LIGHTMAP_HEIGHT * 4);

  for (let row = 0; row < WAREHOUSE_FLOOR_LIGHTMAP_HEIGHT; row += 1) {
    const z =
      DEBUGGING_TWO_WORLD_BOUNDS.minZ + (row / (WAREHOUSE_FLOOR_LIGHTMAP_HEIGHT - 1)) * depth;
    for (let column = 0; column < WAREHOUSE_FLOOR_LIGHTMAP_WIDTH; column += 1) {
      const x =
        DEBUGGING_TWO_WORLD_BOUNDS.minX + (column / (WAREHOUSE_FLOOR_LIGHTMAP_WIDTH - 1)) * width;
      const centerGlow = Math.exp(-((Math.hypot(x, z) / 25) ** 2));
      const dimBase = centerGlow * 0.08;
      const warmPool = centerGlow * 0.65;
      const redChannel = baseRed * (dimBase + warmPool) + warmPool * 0.025;
      const greenChannel = baseGreen * (dimBase + warmPool * 0.72) + warmPool * 0.018;
      const blueChannel = baseBlue * (dimBase + warmPool * 0.28) + warmPool * 0.008;
      const offset = (row * WAREHOUSE_FLOOR_LIGHTMAP_WIDTH + column) * 4;
      data[offset] = Math.round(clampUnit(redChannel) * 255);
      data[offset + 1] = Math.round(clampUnit(greenChannel) * 255);
      data[offset + 2] = Math.round(clampUnit(blueChannel) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WAREHOUSE_FLOOR_LIGHTMAP_WIDTH,
    WAREHOUSE_FLOOR_LIGHTMAP_HEIGHT,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = "WarehouseFloorLightMap:center";
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.userData = {
    warehouseLighting: true,
    bakedAreaLighting: true,
    generation: WAREHOUSE_FLOOR_BAKE_GENERATION,
    source: "central-spotlight",
  };
  texture.needsUpdate = true;
  return texture;
};

const createWarehouseFloorGeometry = (width: number, depth: number): THREE.BoxGeometry => {
  const geometry = new THREE.BoxGeometry(width, 0.3, depth);
  const position = geometry.getAttribute("position");
  const uv1 = new Float32Array(position.count * 2);
  const uv2 = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const u = clampUnit((position.getX(index) + width / 2) / width);
    const v = clampUnit((position.getZ(index) + depth / 2) / depth);
    uv1[index * 2] = u;
    uv1[index * 2 + 1] = v;
    uv2[index * 2] = u;
    uv2[index * 2 + 1] = v;
  }
  geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
  geometry.setAttribute("uv2", new THREE.Float32BufferAttribute(uv2, 2));
  return geometry;
};

const createPlatform = (root: THREE.Group, textures: THREE.Texture[]): void => {
  const width = DEBUGGING_TWO_WORLD_BOUNDS.maxX - DEBUGGING_TWO_WORLD_BOUNDS.minX;
  const depth = DEBUGGING_TWO_WORLD_BOUNDS.maxZ - DEBUGGING_TWO_WORLD_BOUNDS.minZ;
  const lightMap = createWarehouseFloorLightMap(width, depth);
  textures.push(lightMap);
  const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
  material.name = "WarehouseBakedFloorMaterial:center";
  material.lightMap = lightMap;
  material.lightMapIntensity = Math.PI;
  material.userData = {
    warehouseLighting: true,
    bakedAreaLighting: true,
    dynamicLightingDisabled: true,
    floorColor: "black",
    generation: WAREHOUSE_FLOOR_BAKE_GENERATION,
    source: "central-spotlight",
  };
  const platform = new THREE.Mesh(createWarehouseFloorGeometry(width, depth), material);
  platform.name = "DebuggingTwoWarehousePlatform";
  platform.position.set(0, -0.15, 0);
  platform.castShadow = false;
  platform.receiveShadow = false;
  platform.userData = {
    dofIgnore: true,
    physicsIgnore: true,
    bakedAreaLighting: true,
    dynamicLightingDisabled: true,
    generation: WAREHOUSE_FLOOR_BAKE_GENERATION,
    source: "central-spotlight",
  };
  root.add(platform);
};

const createWarehousePerimeterLights = (lighting: THREE.Group): void => {
  const perimeterLights = new THREE.Group();
  perimeterLights.name = "WarehousePerimeterLights";
  perimeterLights.userData = {
    warehouseLighting: true,
    physicsIgnore: true,
    generation: "yellow-perimeter-leds-v1",
  };

  const minX = DEBUGGING_TWO_WORLD_BOUNDS.minX + WAREHOUSE_PERIMETER_LED_INSET;
  const maxX = DEBUGGING_TWO_WORLD_BOUNDS.maxX - WAREHOUSE_PERIMETER_LED_INSET;
  const minZ = DEBUGGING_TWO_WORLD_BOUNDS.minZ + WAREHOUSE_PERIMETER_LED_INSET;
  const maxZ = DEBUGGING_TWO_WORLD_BOUNDS.maxZ - WAREHOUSE_PERIMETER_LED_INSET;
  const runs = [
    {
      id: "north",
      start: new THREE.Vector3(minX, WAREHOUSE_FLOOR_LED_HEIGHT, maxZ),
      end: new THREE.Vector3(maxX, WAREHOUSE_FLOOR_LED_HEIGHT, maxZ),
      rotationY: Math.PI / 2,
    },
    {
      id: "east",
      start: new THREE.Vector3(maxX, WAREHOUSE_FLOOR_LED_HEIGHT, maxZ),
      end: new THREE.Vector3(maxX, WAREHOUSE_FLOOR_LED_HEIGHT, minZ),
      rotationY: 0,
    },
    {
      id: "south",
      start: new THREE.Vector3(maxX, WAREHOUSE_FLOOR_LED_HEIGHT, minZ),
      end: new THREE.Vector3(minX, WAREHOUSE_FLOOR_LED_HEIGHT, minZ),
      rotationY: Math.PI / 2,
    },
    {
      id: "west",
      start: new THREE.Vector3(minX, WAREHOUSE_FLOOR_LED_HEIGHT, minZ),
      end: new THREE.Vector3(minX, WAREHOUSE_FLOOR_LED_HEIGHT, maxZ),
      rotationY: 0,
    },
  ] as const;
  const plans: { readonly position: THREE.Vector3; readonly rotationY: number }[] = [];
  const occupied = new Set<string>();
  for (const run of runs) {
    const distance = run.start.distanceTo(run.end);
    const count = Math.max(2, Math.floor(distance / WAREHOUSE_PERIMETER_LED_PITCH) + 1);
    for (let index = 0; index < count; index += 1) {
      const progress = index / (count - 1);
      const position = run.start.clone().lerp(run.end, progress);
      const key = `${position.x.toFixed(4)}:${position.z.toFixed(4)}`;
      if (occupied.has(key)) {
        continue;
      }
      occupied.add(key);
      plans.push({ position, rotationY: run.rotationY });
    }
  }

  const led = new THREE.InstancedMesh(
    new THREE.BoxGeometry(
      WAREHOUSE_FLOOR_LED_WIDTH,
      WAREHOUSE_FLOOR_LED_HEIGHT,
      WAREHOUSE_PERIMETER_LED_LENGTH,
    ),
    new THREE.MeshBasicMaterial({ color: WAREHOUSE_PERIMETER_LED_COLOR, toneMapped: false }),
    plans.length,
  );
  led.name = "WarehouseYellowPerimeterLEDs";
  led.castShadow = false;
  led.receiveShadow = false;
  led.userData = {
    warehouseLighting: true,
    physicsIgnore: true,
    dofIgnore: true,
    floorLed: true,
    perimeterLed: true,
    color: "yellow",
  };
  const transform = new THREE.Object3D();
  plans.forEach((plan, index) => {
    transform.position.copy(plan.position);
    transform.rotation.set(0, plan.rotationY, 0);
    transform.updateMatrix();
    led.setMatrixAt(index, transform.matrix);
  });
  led.instanceMatrix.needsUpdate = true;
  led.computeBoundingSphere();
  perimeterLights.add(led);
  lighting.add(perimeterLights);
};

const createWarehouseEmergencyLights = (lighting: THREE.Group): void => {
  const emergencyLights = new THREE.Group();
  emergencyLights.name = "WarehouseEmergencyLights";
  emergencyLights.userData = {
    warehouseLighting: true,
    physicsIgnore: true,
    generation: "emergency-fixtures-v2-no-runtime-lights",
  };

  const housingMaterial = new THREE.MeshStandardMaterial({
    color: 0x171c20,
    roughness: 0.7,
    metalness: 0.45,
  });
  const lensMaterial = new THREE.MeshBasicMaterial({
    color: WAREHOUSE_EMERGENCY_LIGHT_COLOR,
    toneMapped: false,
  });
  const housingGeometry = new THREE.BoxGeometry(0.92, 0.36, 0.14);
  const lensGeometry = new THREE.BoxGeometry(0.58, 0.18, 0.025);

  for (const fixtureDefinition of WAREHOUSE_EMERGENCY_LIGHTS) {
    const fixture = new THREE.Group();
    fixture.name = `WarehouseEmergencyLight:${fixtureDefinition.id}`;
    fixture.position.set(
      fixtureDefinition.x,
      WAREHOUSE_EMERGENCY_LIGHT_HEIGHT,
      fixtureDefinition.z,
    );
    fixture.rotation.y = fixtureDefinition.rotationY;
    fixture.userData = { warehouseLighting: true, physicsIgnore: true, emergencyLight: true };

    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.name = "WarehouseEmergencyLightHousing";
    housing.castShadow = false;
    housing.receiveShadow = false;
    housing.userData = { warehouseLighting: true, physicsIgnore: true, dofIgnore: true };
    fixture.add(housing);

    const lens = new THREE.Mesh(lensGeometry, lensMaterial);
    lens.name = "WarehouseEmergencyLightLens";
    lens.position.z = -0.085;
    lens.userData = { warehouseLighting: true, physicsIgnore: true, dofIgnore: true };
    fixture.add(lens);

    emergencyLights.add(fixture);
  }

  lighting.add(emergencyLights);
};

const createWarehouseLaneEmergencyLights = (lighting: THREE.Group): void => {
  const laneLights = new THREE.Group();
  laneLights.name = "WarehouseLaneEmergencyLights";
  laneLights.userData = {
    warehouseLighting: true,
    physicsIgnore: true,
    generation: "floor-led-lanes-v2",
  };

  const lensGeometry = new THREE.BoxGeometry(
    WAREHOUSE_FLOOR_LED_WIDTH,
    WAREHOUSE_FLOOR_LED_HEIGHT,
    WAREHOUSE_FLOOR_LED_LENGTH,
  );
  const lensMaterial = new THREE.MeshBasicMaterial({
    color: WAREHOUSE_EMERGENCY_LIGHT_COLOR,
    toneMapped: false,
  });

  for (const x of WAREHOUSE_LANE_EMERGENCY_LIGHT_X_POSITIONS) {
    const laneId = x < 0 ? "west" : "east";
    for (const z of WAREHOUSE_LANE_EMERGENCY_LIGHT_Z_POSITIONS) {
      const marker = new THREE.Group();
      marker.name = `WarehouseLaneEmergencyLight:${laneId}:${String(z)}`;
      marker.position.set(x, WAREHOUSE_FLOOR_LED_HEIGHT, z);
      marker.userData = {
        warehouseLighting: true,
        physicsIgnore: true,
        laneEmergencyLight: true,
        floorLed: true,
      };

      const lens = new THREE.Mesh(lensGeometry, lensMaterial);
      lens.name = "WarehouseLaneEmergencyLightLens";
      lens.userData = {
        warehouseLighting: true,
        physicsIgnore: true,
        dofIgnore: true,
        floorLed: true,
      };
      marker.add(lens);

      laneLights.add(marker);
    }
  }

  lighting.add(laneLights);
};

const createWarehouseLensFlareTexture = (): THREE.DataTexture => {
  const size = WAREHOUSE_LENS_FLARE_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const normalizedY = ((y + 0.5) / size) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const normalizedX = ((x + 0.5) / size) * 2 - 1;
      const radius = Math.hypot(normalizedX, normalizedY);
      const core = Math.exp(-(radius * radius) * 18);
      const halo = Math.pow(Math.max(0, 1 - radius), 2.4) * 0.26;
      const streak =
        Math.exp(-Math.abs(normalizedY) * 38) *
        Math.pow(Math.max(0, 1 - Math.abs(normalizedX)), 3.4) *
        0.22;
      const alpha = Math.round(Math.min(1, core * 0.92 + halo + streak) * 255);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "WarehouseLensFlareSpriteTexture";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.userData = {
    warehouseLighting: true,
    lensFlare: true,
    generation: WAREHOUSE_LENS_FLARE_GENERATION,
    source: "procedural-radial-gradient",
  };
  texture.needsUpdate = true;
  return texture;
};

interface WarehouseLensFlareMaterialOptions {
  readonly color: number;
  readonly opacity: number;
}

const createWarehouseLensFlareMaterial = (
  texture: THREE.Texture,
  options: WarehouseLensFlareMaterialOptions,
): THREE.SpriteMaterial =>
  new THREE.SpriteMaterial({
    map: texture,
    color: options.color,
    opacity: options.opacity,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

const createWarehouseLensFlareSprites = (
  lighting: THREE.Group,
  textures: THREE.Texture[],
): void => {
  const flareTexture = createWarehouseLensFlareTexture();
  textures.push(flareTexture);

  const flareRoot = new THREE.Group();
  flareRoot.name = "WarehouseLensFlareSprites";
  flareRoot.userData = {
    warehouseLighting: true,
    physicsIgnore: true,
    weaponRaycastIgnore: true,
    dofIgnore: true,
    lensFlare: true,
    generation: WAREHOUSE_LENS_FLARE_GENERATION,
    spriteCount: WAREHOUSE_LENS_FLARE_SPRITE_COUNT,
    textureName: flareTexture.name,
    fog: false,
  };

  const haloMaterial = createWarehouseLensFlareMaterial(flareTexture, {
    color: 0xffd7a1,
    opacity: 0.23,
  });
  const streakMaterial = createWarehouseLensFlareMaterial(flareTexture, {
    color: 0xffc979,
    opacity: 0.14,
  });
  const emergencyHaloMaterial = createWarehouseLensFlareMaterial(flareTexture, {
    color: 0xff3540,
    opacity: 0.2,
  });
  const emergencyStreakMaterial = createWarehouseLensFlareMaterial(flareTexture, {
    color: 0xff2638,
    opacity: 0.12,
  });

  const addSprite = (
    name: string,
    source: string,
    position: readonly [number, number, number],
    scale: readonly [number, number],
    material: THREE.SpriteMaterial,
    element: "halo" | "streak",
  ): void => {
    const sprite = new THREE.Sprite(material);
    sprite.name = name;
    sprite.position.set(...position);
    sprite.scale.set(scale[0], scale[1], 1);
    sprite.renderOrder = 4;
    sprite.userData = {
      warehouseLighting: true,
      physicsIgnore: true,
      weaponRaycastIgnore: true,
      dofIgnore: true,
      lensFlare: true,
      lensFlareSprite: true,
      source,
      element,
      fog: false,
      generation: WAREHOUSE_LENS_FLARE_GENERATION,
    };
    flareRoot.add(sprite);
  };

  for (const x of WAREHOUSE_LIGHT_X_POSITIONS) {
    for (const z of WAREHOUSE_LIGHT_Z_POSITIONS) {
      const source = `high-bay:${String(x)}:${String(z)}`;
      addSprite(
        `WarehouseLensFlareHalo:${String(x)}:${String(z)}`,
        source,
        [x, WAREHOUSE_LIGHT_HEIGHT - 0.1, z],
        [1.55, 1.55],
        haloMaterial,
        "halo",
      );
      addSprite(
        `WarehouseLensFlareStreak:${String(x)}:${String(z)}`,
        source,
        [x, WAREHOUSE_LIGHT_HEIGHT - 0.1, z],
        [3.6, 0.28],
        streakMaterial,
        "streak",
      );
    }
  }

  addSprite(
    "WarehouseLensFlareHalo:central-spotlight",
    "central-spotlight",
    [0, WAREHOUSE_SPOTLIGHT_HEIGHT, 0],
    [2.1, 2.1],
    haloMaterial,
    "halo",
  );
  addSprite(
    "WarehouseLensFlareStreak:central-spotlight",
    "central-spotlight",
    [0, WAREHOUSE_SPOTLIGHT_HEIGHT, 0],
    [5.2, 0.36],
    streakMaterial,
    "streak",
  );

  for (const fixture of WAREHOUSE_EMERGENCY_LIGHTS) {
    const source = `emergency:${fixture.id}`;
    addSprite(
      `WarehouseLensFlareHalo:${fixture.id}`,
      source,
      [fixture.x, WAREHOUSE_EMERGENCY_LIGHT_HEIGHT, fixture.z],
      [1.1, 1.1],
      emergencyHaloMaterial,
      "halo",
    );
    addSprite(
      `WarehouseLensFlareStreak:${fixture.id}`,
      source,
      [fixture.x, WAREHOUSE_EMERGENCY_LIGHT_HEIGHT, fixture.z],
      [2.5, 0.22],
      emergencyStreakMaterial,
      "streak",
    );
  }

  lighting.add(flareRoot);
};

const createWarehouseLighting = (scene: THREE.Scene, textures: THREE.Texture[]): void => {
  const lighting = new THREE.Group();
  lighting.name = "DebuggingTwoIndustrialLighting";
  lighting.userData = {
    warehouseLighting: true,
    physicsIgnore: true,
    weaponRaycastIgnore: true,
  };

  const fixtureBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x141b1f,
    roughness: 0.44,
    metalness: 0.84,
  });
  const diffuserMaterial = new THREE.MeshStandardMaterial({
    color: 0x24201a,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.28,
    metalness: 0.12,
  });
  const fixtureBodyGeometry = new THREE.BoxGeometry(3.2, 0.16, 0.68);
  const diffuserGeometry = new THREE.BoxGeometry(2.65, 0.035, 0.34);

  for (const x of WAREHOUSE_LIGHT_X_POSITIONS) {
    for (const z of WAREHOUSE_LIGHT_Z_POSITIONS) {
      const fixture = new THREE.Group();
      fixture.name = `WarehouseHighBay:${String(x)}:${String(z)}`;
      fixture.position.set(x, WAREHOUSE_LIGHT_HEIGHT, z);
      fixture.userData = { warehouseLighting: true, physicsIgnore: true };

      const housing = new THREE.Mesh(fixtureBodyGeometry, fixtureBodyMaterial);
      housing.name = "WarehouseHighBayHousing";
      housing.castShadow = true;
      housing.receiveShadow = true;
      housing.userData = { warehouseLighting: true, physicsIgnore: true };
      fixture.add(housing);

      const diffuser = new THREE.Mesh(diffuserGeometry, diffuserMaterial);
      diffuser.name = "WarehouseHighBayDiffuser";
      diffuser.position.y = -0.105;
      diffuser.userData = { warehouseLighting: true, physicsIgnore: true, dofIgnore: true };
      fixture.add(diffuser);

      lighting.add(fixture);
    }
  }

  // Keep one broad pool over the centre aisle. The warehouse deliberately has
  // no shadow-casting lights, so it does not allocate or render a shadow map.
  const centralTarget = new THREE.Object3D();
  centralTarget.name = "WarehouseCentralSpotlightTarget";
  centralTarget.position.set(0, 0, 0);
  lighting.add(centralTarget);
  const centralSpot = new THREE.SpotLight(0xffc979, 220, 72, Math.PI / 2, 0.62, 1.45);
  centralSpot.name = "WarehouseCentralSpotlight";
  centralSpot.position.set(0, WAREHOUSE_SPOTLIGHT_HEIGHT, 0);
  centralSpot.target = centralTarget;
  centralSpot.castShadow = false;
  centralSpot.userData = { warehouseLighting: true, physicsIgnore: true, castsShadow: false };
  lighting.add(centralSpot);

  // WebGL spotlights do not render visible rays through empty air. A single
  // translucent cone and floor pool make the central high-bay beam readable
  // without adding another light, shadow map, or volumetric post-process.
  const shaftHeight = WAREHOUSE_SPOTLIGHT_HEIGHT;
  const shaft = new THREE.Mesh(
    new THREE.ConeGeometry(shaftHeight, shaftHeight, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc979,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  shaft.name = "WarehouseCentralSpotlightShaft";
  shaft.position.set(0, shaftHeight / 2, 0);
  shaft.userData = { warehouseLighting: true, physicsIgnore: true, dofIgnore: true };
  lighting.add(shaft);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(shaftHeight, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffc979,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.name = "WarehouseCentralSpotlightPool";
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.012;
  pool.userData = { warehouseLighting: true, physicsIgnore: true, dofIgnore: true };
  lighting.add(pool);

  createWarehousePerimeterLights(lighting);
  createWarehouseEmergencyLights(lighting);
  createWarehouseLaneEmergencyLights(lighting);
  createWarehouseLensFlareSprites(lighting, textures);

  scene.add(lighting);
};

export const createDebuggingTwoMap = (
  scene: THREE.Scene,
  roomSeed: string,
): DebuggingTwoMapResources => {
  const normalizedSeed = roomSeed.trim() || "room-01";
  const warehouse = generateWarehouse(normalizedSeed);
  const root = new THREE.Group();
  root.name = "DebuggingTwoWorldRoot";
  root.userData = {
    mapId: "debugging-02",
    generation: "warehouse-data-center-v1",
    physicsGeneration: "warehouse-supported-piles-v5",
    roomSeed: normalizedSeed,
    boxSizeMeters: DEBUGGING_TWO_BOX_SIZE,
    boxGapMeters: DEBUGGING_TWO_BOX_GAP,
    boxCount: warehouse.boxes.length,
    stackCount: warehouse.stackCount,
    wallCount: warehouse.wallCount,
    wallCrateCount: warehouse.wallCrateCount,
    fogGeneration: WAREHOUSE_FOG_GENERATION,
    lensFlareGeneration: WAREHOUSE_LENS_FLARE_GENERATION,
    lensFlareSpriteCount: WAREHOUSE_LENS_FLARE_SPRITE_COUNT,
  };
  scene.add(root);
  // Keep the warehouse background black so the explicit spotlight, corner
  // fill, and red emergency fixtures remain easy to read.
  scene.background = new THREE.Color(0x000000);
  scene.fog = createWarehouseFog();
  scene.environment = null;
  scene.environmentIntensity = 0;
  const textures: THREE.Texture[] = [];
  createPlatform(root, textures);
  createWarehouseStructure(root, textures);
  createWarehouseRacks(root, warehouse.boxes, normalizedSeed);
  createWarehouseLighting(scene, textures);

  return {
    root,
    physicsBoxes: warehouse.physicsBoxes,
    spawn: { x: 0, y: 1.05, z: 27 },
    simulantSpawn: { x: 0, y: 1.05, z: -27 },
    variant: "Ice-blue data center",
    explorationArea: "Ice-blue data center",
    cyanMaterials: [],
    redMaterials: [],
    textures,
    meleeObjects: [
      {
        id: "warehouse-crowbar-north",
        kind: "crowbar",
        displayName: "Warehouse Crowbar",
        position: [0, 0.58, 22],
        scale: [0.72, 1.16, 0.72],
        rotationY: 0.18,
        color: 0x7b8791,
      },
      {
        id: "warehouse-steel-pipe-north",
        kind: "steel-pipe",
        displayName: "Warehouse Steel Pipe",
        position: [0, 0.72, 18.2],
        scale: [0.58, 1.44, 0.58],
        rotationY: -0.34,
        color: 0x9da8ad,
      },
      {
        id: "warehouse-fire-extinguisher-south",
        kind: "fire-extinguisher",
        displayName: "Warehouse Fire Extinguisher",
        position: [0, 0.62, -22],
        scale: [0.92, 1.16, 0.92],
        rotationY: 0.52,
        color: 0xc74732,
      },
      {
        id: "warehouse-pipe-wrench-south",
        kind: "pipe-wrench",
        displayName: "Warehouse Pipe Wrench",
        position: [0, 0.56, -18.2],
        scale: [0.68, 1.12, 0.68],
        rotationY: -0.24,
        color: 0x5e6b75,
      },
      {
        id: "warehouse-hammer-west",
        kind: "hammer",
        displayName: "Warehouse Hammer",
        position: [-12, 0.66, -14.5],
        scale: [0.9, 1.32, 0.9],
        rotationY: 0.72,
        color: 0x6e4b3c,
      },
      {
        id: "warehouse-screwdriver-east",
        kind: "screwdriver",
        displayName: "Warehouse Screwdriver",
        position: [12, 0.7, -0.5],
        scale: [0.38, 0.96, 0.38],
        rotationY: -0.62,
        color: 0xb8c2c6,
      },
      {
        id: "warehouse-fireman-axe-west",
        kind: "fireman-axe",
        displayName: "Warehouse Fireman Axe",
        position: [-12, 0.6, 13.5],
        scale: [0.84, 1.2, 0.84],
        rotationY: 0.38,
        color: 0x9a4c3d,
      },
      {
        id: "warehouse-box-cutter-east",
        kind: "box-cutter",
        displayName: "Warehouse Box Cutter",
        position: [12, 0.76, 13.5],
        scale: [0.42, 0.72, 0.42],
        rotationY: -0.48,
        color: 0x6f7d84,
      },
    ],
  };
};
