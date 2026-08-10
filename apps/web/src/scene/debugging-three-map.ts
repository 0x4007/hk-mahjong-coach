import * as THREE from "three";
import { createSeededRandom } from "@hk-mahjong/core/public";

import type { PhysicsBox } from "./mahjong-physics.js";

/** The 750 m square training ground used by Debugging 03. */
export const DEBUGGING_THREE_WORLD_SIZE_METERS = 750;
export const DEBUGGING_THREE_WORLD_BOUNDS = {
  minX: -DEBUGGING_THREE_WORLD_SIZE_METERS / 2,
  maxX: DEBUGGING_THREE_WORLD_SIZE_METERS / 2,
  minZ: -DEBUGGING_THREE_WORLD_SIZE_METERS / 2,
  maxZ: DEBUGGING_THREE_WORLD_SIZE_METERS / 2,
} as const;

export const CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS = 10;
export const CLIMBING_GYM_BLOCK_MIN_HEIGHT_METERS = 1;
export const CLIMBING_GYM_BLOCK_GENERATION = "climbing-gym-block-field-v1";
export const CLIMBING_GYM_FOG_GENERATION = "climbing-gym-linear-fog-v1";
export const CLIMBING_GYM_SKY_COLOR = 0xa8c9d4;
export const CLIMBING_GYM_FOG_COLOR = 0xa8c9d4;
export const CLIMBING_GYM_FOG_NEAR = 48;
export const CLIMBING_GYM_FOG_FAR = 620;

/** The low-contrast haze keeps the long course readable without flattening it. */
export const createClimbingGymFog = (): THREE.Fog => {
  const fog = new THREE.Fog(CLIMBING_GYM_FOG_COLOR, CLIMBING_GYM_FOG_NEAR, CLIMBING_GYM_FOG_FAR);
  fog.name = CLIMBING_GYM_FOG_GENERATION;
  return fog;
};

export interface ClimbingGymMapResources {
  readonly root: THREE.Group;
  /** One coarse static collider for every rendered block and climb ledge. */
  readonly physicsBoxes: readonly PhysicsBox[];
  readonly staticPhysicsBoxes: readonly PhysicsBox[];
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly simulantSpawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly variant: string;
  readonly explorationArea: string;
  readonly cyanMaterials: readonly THREE.MeshStandardMaterial[];
  readonly redMaterials: readonly THREE.MeshStandardMaterial[];
  readonly textures: readonly THREE.Texture[];
}

/** Shared material seams supplied by the scene renderer in production. */
export interface ClimbingGymMaterialFactories {
  readonly createMaterial: (
    color: number,
    roughness: number,
    metalness: number,
  ) => THREE.MeshStandardMaterial;
  readonly createAccentMaterial: (
    color: number,
    roughness: number,
    metalness: number,
    emissiveIntensity: number,
  ) => THREE.MeshStandardMaterial;
  readonly createFloorMaterial: () => THREE.MeshPhysicalMaterial;
}

interface BlockPlan {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly rotationY: number;
  readonly color: number;
}

interface LedgePlan {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly rotationY: number;
  readonly color: number;
}

interface ClimbingGymGeneration {
  readonly blocks: readonly BlockPlan[];
  readonly ledges: readonly LedgePlan[];
  readonly physicsBoxes: readonly PhysicsBox[];
}

const BLOCK_GRID_PITCH_METERS = 14;
const BLOCK_GRID_RADIUS = 25;
const BLOCK_OCCUPANCY = 0.34;
const BLOCK_MIN_WIDTH_METERS = 3.4;
const BLOCK_MAX_WIDTH_METERS = 8.4;
const BLOCK_MIN_DEPTH_METERS = 3.4;
const BLOCK_MAX_DEPTH_METERS = 8.4;
const BLOCK_HEIGHT_STEP_METERS = 0.5;
const BLOCK_SEAM_METERS = 0.045;
const LEDGE_HEIGHT_METERS = 0.24;
const LEDGE_DEPTH_METERS = 0.72;
const LEDGE_WIDTH_MIN_METERS = 1.2;
const LEDGE_WIDTH_MAX_METERS = 2.6;
const LEDGE_VERTICAL_PITCH_METERS = 1.6;
const LEDGE_FACE_INSET_METERS = 0.035;
const BLOCK_COLORS = [0x2e5267, 0x345d70, 0x3d6879, 0x466f7e, 0x385a6b] as const;
const LEDGE_COLORS = [0x31c8e9, 0x5fd9ed, 0xb1434f, 0xc45457] as const;
const FLOOR_COLOR = 0x343a43;
const FLOOR_ROUGHNESS = 0.22;
const FLOOR_METALNESS = 0.76;
const FLOOR_CLEARCOAT = 0.62;
const BORDER_COLOR = 0x273b47;
const YELLOW_LED_COLOR = 0xffd42e;
const RED_LED_COLOR = 0xff2638;
const CYAN_LED_COLOR = 0x38cfff;
const HIGH_BAY_HEIGHT_METERS = 16;
const DAYLIGHT_HEMISPHERE_SKY_COLOR = 0xdff5ff;
const DAYLIGHT_HEMISPHERE_GROUND_COLOR = 0x52616b;
const DAYLIGHT_HEMISPHERE_INTENSITY = 1.6;
const DAYLIGHT_SUN_COLOR = 0xfff0d2;
const DAYLIGHT_SUN_INTENSITY = 2.8;
const SPAWN_Z = DEBUGGING_THREE_WORLD_BOUNDS.maxZ - 26;
const SIMULANT_SPAWN_Z = DEBUGGING_THREE_WORLD_BOUNDS.minZ + 26;

const randomBetween = (
  random: ReturnType<typeof createSeededRandom>,
  min: number,
  max: number,
): number => min + random.nextFloat() * (max - min);

const randomSigned = (random: ReturnType<typeof createSeededRandom>, magnitude: number): number =>
  (random.nextFloat() * 2 - 1) * magnitude;

const quantizeHeight = (height: number): number =>
  Math.max(
    CLIMBING_GYM_BLOCK_MIN_HEIGHT_METERS,
    Math.min(
      CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS,
      Math.round(height / BLOCK_HEIGHT_STEP_METERS) * BLOCK_HEIGHT_STEP_METERS,
    ),
  );

const boxPhysics = (
  obstacleId: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  rotationY: number,
): PhysicsBox => ({
  obstacleId,
  center: { x, y, z },
  halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
  rotationY,
  friction: 0.86,
});

const addBlockLedges = (
  block: BlockPlan,
  random: ReturnType<typeof createSeededRandom>,
  ledges: LedgePlan[],
  physicsBoxes: PhysicsBox[],
): void => {
  // Alternating faces make the full ten-metre towers a sequence of reachable
  // bouldering moves. The main block stays a single clean silhouette; these
  // small shelves are the intentional hand/foot holds used by traversal.
  const ledgeCount = Math.max(0, Math.ceil((block.height - 0.8) / LEDGE_VERTICAL_PITCH_METERS));
  const faceDirections = [0, 1, 2, 3] as const;
  for (let index = 0; index < ledgeCount; index += 1) {
    const face =
      faceDirections[(index + random.nextInt(faceDirections.length)) % faceDirections.length] ?? 0;
    const localY = 0.8 + index * LEDGE_VERTICAL_PITCH_METERS;
    const width = Math.min(
      randomBetween(random, LEDGE_WIDTH_MIN_METERS, LEDGE_WIDTH_MAX_METERS),
      face === 0 || face === 2 ? block.width - 0.42 : block.depth - 0.42,
    );
    const depth = LEDGE_DEPTH_METERS;
    const faceOffset = face === 0 || face === 2 ? block.depth / 2 : block.width / 2;
    const inwardOffset = 0.08;
    let localX = 0;
    let localZ = 0;
    let faceRotationY = block.rotationY;
    if (face === 0) {
      localZ += faceOffset + depth / 2 + LEDGE_FACE_INSET_METERS;
    } else if (face === 1) {
      localX += faceOffset + depth / 2 + LEDGE_FACE_INSET_METERS;
      faceRotationY += Math.PI / 2;
    } else if (face === 2) {
      localZ -= faceOffset + depth / 2 + LEDGE_FACE_INSET_METERS;
      faceRotationY += Math.PI;
    } else {
      localX -= faceOffset + depth / 2 + LEDGE_FACE_INSET_METERS;
      faceRotationY -= Math.PI / 2;
    }
    // Keep the ledge just outside the block footprint along its face. This
    // creates a visible seam without overlapping static colliders.
    if (face === 0 || face === 2) {
      localX += randomSigned(random, Math.max(0, (block.width - width) / 2 - inwardOffset));
    } else {
      localZ += randomSigned(random, Math.max(0, (block.depth - width) / 2 - inwardOffset));
    }
    const cosine = Math.cos(block.rotationY);
    const sine = Math.sin(block.rotationY);
    const x = block.x + cosine * localX - sine * localZ;
    const z = block.z + sine * localX + cosine * localZ;
    const id = `${block.id}-ledge-${String(index).padStart(2, "0")}`;
    const color = LEDGE_COLORS[random.nextInt(LEDGE_COLORS.length)] ?? LEDGE_COLORS[0];
    ledges.push({
      id,
      x,
      y: localY - LEDGE_HEIGHT_METERS / 2,
      z,
      width,
      depth,
      rotationY: faceRotationY,
      color,
    });
    physicsBoxes.push(
      boxPhysics(
        id,
        x,
        localY - LEDGE_HEIGHT_METERS / 2,
        z,
        width,
        LEDGE_HEIGHT_METERS,
        depth,
        faceRotationY,
      ),
    );
  }
};

const generateClimbingGym = (roomSeed: string): ClimbingGymGeneration => {
  const random = createSeededRandom(`${roomSeed}|debugging-03|${CLIMBING_GYM_BLOCK_GENERATION}`);
  const blocks: BlockPlan[] = [];
  const ledges: LedgePlan[] = [];
  const physicsBoxes: PhysicsBox[] = [];
  for (let gridX = -BLOCK_GRID_RADIUS; gridX <= BLOCK_GRID_RADIUS; gridX += 1) {
    for (let gridZ = -BLOCK_GRID_RADIUS; gridZ <= BLOCK_GRID_RADIUS; gridZ += 1) {
      const x = gridX * BLOCK_GRID_PITCH_METERS + randomSigned(random, 2.7);
      const z = gridZ * BLOCK_GRID_PITCH_METERS + randomSigned(random, 2.7);
      if (Math.hypot(x, z) > DEBUGGING_THREE_WORLD_SIZE_METERS * 0.49) {
        continue;
      }
      // Preserve a broad start court and centre sightline for the first-person
      // camera. The rest of the square is a seeded, sparse bouldering field.
      const centralClear = Math.abs(x) < 42 && Math.abs(z) < 42;
      const spawnClear = Math.abs(x) < 42 && z > SPAWN_Z - 70;
      const simulantClear = Math.abs(x) < 42 && z < SIMULANT_SPAWN_Z + 70;
      if (centralClear || spawnClear || simulantClear || random.nextFloat() > BLOCK_OCCUPANCY) {
        continue;
      }
      const width = randomBetween(random, BLOCK_MIN_WIDTH_METERS, BLOCK_MAX_WIDTH_METERS);
      const depth = randomBetween(random, BLOCK_MIN_DEPTH_METERS, BLOCK_MAX_DEPTH_METERS);
      const height = quantizeHeight(
        randomBetween(
          random,
          CLIMBING_GYM_BLOCK_MIN_HEIGHT_METERS,
          CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS,
        ),
      );
      const rotationY =
        Math.round((random.nextFloat() * Math.PI * 2) / (Math.PI / 4)) * (Math.PI / 4);
      const id = `climb-block-${String(gridX + BLOCK_GRID_RADIUS).padStart(2, "0")}-${String(gridZ + BLOCK_GRID_RADIUS).padStart(2, "0")}`;
      const color = BLOCK_COLORS[random.nextInt(BLOCK_COLORS.length)] ?? BLOCK_COLORS[0];
      const block: BlockPlan = { id, x, z, width, depth, height, rotationY, color };
      blocks.push(block);
      physicsBoxes.push(boxPhysics(id, x, height / 2, z, width, height, depth, rotationY));
      addBlockLedges(block, random, ledges, physicsBoxes);
    }
  }
  return { blocks, ledges, physicsBoxes };
};

const createDefaultMaterialFactories = (): ClimbingGymMaterialFactories => ({
  createMaterial: (color, roughness, metalness) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      envMapIntensity: 1.1,
    }),
  createAccentMaterial: (color, roughness, metalness, emissiveIntensity) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      envMapIntensity: 1.15,
    });
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = emissiveIntensity;
    return material;
  },
  createFloorMaterial: () =>
    new THREE.MeshPhysicalMaterial({
      color: FLOOR_COLOR,
      roughness: FLOOR_ROUGHNESS,
      metalness: FLOOR_METALNESS,
      clearcoat: FLOOR_CLEARCOAT,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.1,
    }),
});

const createFloor = (root: THREE.Group, factories: ClimbingGymMaterialFactories): void => {
  const geometry = new THREE.BoxGeometry(
    DEBUGGING_THREE_WORLD_SIZE_METERS,
    0.2,
    DEBUGGING_THREE_WORLD_SIZE_METERS,
  );
  const material = factories.createFloorMaterial();
  const floor = new THREE.Mesh(geometry, material);
  floor.name = "DebuggingThreeClimbingGymFloor";
  floor.position.y = -0.1;
  floor.receiveShadow = false;
  floor.userData = { mapFeature: "climbing-gym-floor", physicsIgnore: true };
  root.add(floor);
};

const createCourseBorder = (root: THREE.Group, factories: ClimbingGymMaterialFactories): void => {
  const borderMaterial = factories.createMaterial(BORDER_COLOR, 0.4, 0.68);
  const borderGeometry = new THREE.BoxGeometry(DEBUGGING_THREE_WORLD_SIZE_METERS, 0.14, 0.24);
  const borderPieces: readonly [number, number, number, number][] = [
    [0, 0.07, DEBUGGING_THREE_WORLD_BOUNDS.minZ + 0.12, 0],
    [0, 0.07, DEBUGGING_THREE_WORLD_BOUNDS.maxZ - 0.12, 0],
    [DEBUGGING_THREE_WORLD_BOUNDS.minX + 0.12, 0.07, 0, Math.PI / 2],
    [DEBUGGING_THREE_WORLD_BOUNDS.maxX - 0.12, 0.07, 0, Math.PI / 2],
  ];
  for (const [x, y, z, rotationY] of borderPieces) {
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.position.set(x, y, z);
    border.rotation.y = rotationY;
    border.name = "ClimbingGymCourseBorder";
    border.userData = { mapFeature: "climbing-gym-border", physicsIgnore: true };
    root.add(border);
  }
};

const createLaneLeds = (root: THREE.Group): void => {
  const geometry = new THREE.BoxGeometry(0.22, 0.025, 2.6);
  const yellowMaterial = new THREE.MeshBasicMaterial({
    color: YELLOW_LED_COLOR,
    toneMapped: false,
  });
  const redMaterial = new THREE.MeshBasicMaterial({ color: RED_LED_COLOR, toneMapped: false });
  const cyanMaterial = new THREE.MeshBasicMaterial({ color: CYAN_LED_COLOR, toneMapped: false });
  const lanes = new THREE.Group();
  lanes.name = "ClimbingGymCourseLeds";
  for (let x = -350; x <= 350; x += 14) {
    const led = new THREE.Mesh(geometry, yellowMaterial);
    led.position.set(x, 0.026, DEBUGGING_THREE_WORLD_BOUNDS.minZ + 2);
    led.userData = { mapFeature: "climbing-gym-course-led", physicsIgnore: true, dofIgnore: true };
    lanes.add(led);
  }
  for (let z = -336; z <= 336; z += 14) {
    const led = new THREE.Mesh(geometry, z % 28 === 0 ? redMaterial : cyanMaterial);
    led.rotation.y = Math.PI / 2;
    led.position.set(0, 0.027, z);
    led.userData = { mapFeature: "climbing-gym-course-led", physicsIgnore: true, dofIgnore: true };
    lanes.add(led);
  }
  root.add(lanes);
};

const createDaylight = (root: THREE.Group): void => {
  const lighting = new THREE.Group();
  lighting.name = "ClimbingGymDaylight";

  const skylight = new THREE.HemisphereLight(
    DAYLIGHT_HEMISPHERE_SKY_COLOR,
    DAYLIGHT_HEMISPHERE_GROUND_COLOR,
    DAYLIGHT_HEMISPHERE_INTENSITY,
  );
  skylight.position.set(0, HIGH_BAY_HEIGHT_METERS * 2, 0);
  skylight.userData = {
    mapFeature: "climbing-gym-daylight-skylight",
    physicsIgnore: true,
    dofIgnore: true,
  };
  lighting.add(skylight);

  const sun = new THREE.DirectionalLight(DAYLIGHT_SUN_COLOR, DAYLIGHT_SUN_INTENSITY);
  sun.position.set(-180, 240, 140);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = false;
  sun.userData = {
    mapFeature: "climbing-gym-daylight-sun",
    physicsIgnore: true,
    dofIgnore: true,
    castsShadow: false,
  };
  sun.target.userData = { physicsIgnore: true, dofIgnore: true };
  lighting.add(sun, sun.target);
  root.add(lighting);
};

const createHighBayLights = (root: THREE.Group): void => {
  const lighting = new THREE.Group();
  lighting.name = "ClimbingGymHighBayLighting";
  const positions: readonly [number, number][] = [
    [-225, -225],
    [0, -225],
    [225, -225],
    [-225, 0],
    [0, 0],
    [225, 0],
    [-225, 225],
    [0, 225],
    [225, 225],
  ];
  for (const [x, z] of positions) {
    const light = new THREE.PointLight(0xffc979, 0.65, 120, 1.7);
    light.position.set(x, HIGH_BAY_HEIGHT_METERS, z);
    light.castShadow = false;
    light.userData = {
      mapFeature: "climbing-gym-high-bay-light",
      physicsIgnore: true,
      dofIgnore: true,
      castsShadow: false,
      generation: CLIMBING_GYM_BLOCK_GENERATION,
    };
    lighting.add(light);
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 1.8),
      new THREE.MeshBasicMaterial({ color: 0xffdca0 }),
    );
    fixture.position.set(x, HIGH_BAY_HEIGHT_METERS, z);
    fixture.userData = {
      mapFeature: "climbing-gym-high-bay-fixture",
      physicsIgnore: true,
      dofIgnore: true,
    };
    lighting.add(fixture);
  }
  root.add(lighting);
};

const createBlocks = (
  root: THREE.Group,
  generation: ClimbingGymGeneration,
  factories: ClimbingGymMaterialFactories,
): {
  readonly cyanMaterials: readonly THREE.MeshStandardMaterial[];
  readonly redMaterials: readonly THREE.MeshStandardMaterial[];
} => {
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const blockMaterial = factories.createMaterial(BLOCK_COLORS[0], 0.54, 0.42);
  const blocks = new THREE.InstancedMesh(blockGeometry, blockMaterial, generation.blocks.length);
  blocks.name = "ClimbingGymProceduralBlocks";
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  blocks.userData = {
    mapFeature: "climbing-gym-blocks",
    generation: CLIMBING_GYM_BLOCK_GENERATION,
    blockCount: generation.blocks.length,
    maxHeightMeters: CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS,
    weaponRaycastSurface: true,
  };
  const transform = new THREE.Object3D();
  generation.blocks.forEach((block, index) => {
    transform.position.set(block.x, block.height / 2, block.z);
    transform.rotation.set(0, block.rotationY, 0);
    transform.scale.set(
      block.width - BLOCK_SEAM_METERS,
      block.height - BLOCK_SEAM_METERS,
      block.depth - BLOCK_SEAM_METERS,
    );
    transform.updateMatrix();
    blocks.setMatrixAt(index, transform.matrix);
    blocks.setColorAt(index, new THREE.Color(block.color));
  });
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor !== null) {
    blocks.instanceColor.needsUpdate = true;
  }
  blocks.computeBoundingSphere();
  root.add(blocks);

  const ledgeGeometry = new THREE.BoxGeometry(1, LEDGE_HEIGHT_METERS, LEDGE_DEPTH_METERS);
  const ledgeMaterial = factories.createAccentMaterial(LEDGE_COLORS[0], 0.34, 0.42, 0.08);
  const ledges = new THREE.InstancedMesh(ledgeGeometry, ledgeMaterial, generation.ledges.length);
  ledges.name = "ClimbingGymProceduralLedges";
  ledges.castShadow = true;
  ledges.receiveShadow = true;
  ledges.userData = {
    mapFeature: "climbing-gym-climb-ledges",
    generation: CLIMBING_GYM_BLOCK_GENERATION,
    ledgeCount: generation.ledges.length,
    maxHeightMeters: CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS,
    weaponRaycastSurface: true,
  };
  generation.ledges.forEach((ledge, index) => {
    transform.position.set(ledge.x, ledge.y, ledge.z);
    transform.rotation.set(0, ledge.rotationY, 0);
    transform.scale.set(ledge.width, 1, 1);
    transform.updateMatrix();
    ledges.setMatrixAt(index, transform.matrix);
    ledges.setColorAt(index, new THREE.Color(ledge.color));
  });
  ledges.instanceMatrix.needsUpdate = true;
  if (ledges.instanceColor !== null) {
    ledges.instanceColor.needsUpdate = true;
  }
  ledges.computeBoundingSphere();
  root.add(ledges);
  return {
    cyanMaterials: [ledgeMaterial],
    redMaterials: [],
  };
};

/** Build the deterministic, large-scale climbing gym scene. */
export const createDebuggingThreeMap = (
  scene: THREE.Scene,
  roomSeed: string,
  factories: ClimbingGymMaterialFactories = createDefaultMaterialFactories(),
): ClimbingGymMapResources => {
  const normalizedSeed = roomSeed.trim() || "room-01";
  const generation = generateClimbingGym(normalizedSeed);
  const root = new THREE.Group();
  root.name = "DebuggingThreeClimbingGymRoot";
  root.userData = {
    mapId: "debugging-03",
    generation: CLIMBING_GYM_BLOCK_GENERATION,
    roomSeed: normalizedSeed,
    worldSizeMeters: DEBUGGING_THREE_WORLD_SIZE_METERS,
    worldWidthMeters: DEBUGGING_THREE_WORLD_SIZE_METERS,
    worldDepthMeters: DEBUGGING_THREE_WORLD_SIZE_METERS,
    blockCount: generation.blocks.length,
    ledgeCount: generation.ledges.length,
    blockMinHeightMeters: CLIMBING_GYM_BLOCK_MIN_HEIGHT_METERS,
    blockMaxHeightMeters: CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS,
    maxHeightMeters: CLIMBING_GYM_BLOCK_MAX_HEIGHT_METERS,
    climbable: true,
  };
  scene.add(root);
  scene.background = new THREE.Color(CLIMBING_GYM_SKY_COLOR);
  scene.fog = createClimbingGymFog();
  scene.environment = null;
  scene.environmentIntensity = 0;
  createFloor(root, factories);
  createCourseBorder(root, factories);
  createLaneLeds(root);
  createDaylight(root);
  createHighBayLights(root);
  const materials = createBlocks(root, generation, factories);
  return {
    root,
    physicsBoxes: generation.physicsBoxes,
    staticPhysicsBoxes: [],
    spawn: { x: 0, y: 0, z: SPAWN_Z },
    simulantSpawn: { x: 0, y: 1.05, z: SIMULANT_SPAWN_Z },
    variant: "Procedural bouldering field",
    explorationArea: "Climbing gym",
    cyanMaterials: materials.cyanMaterials,
    redMaterials: materials.redMaterials,
    textures: [],
  };
};
