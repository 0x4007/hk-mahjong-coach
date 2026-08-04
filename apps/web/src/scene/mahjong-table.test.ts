import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  clipExplorationRectAroundPenthouse,
  collectScenePhysicsBoxes,
  createExplorationWorld,
  EXPLORATION_PENTHOUSE_BOUNDS,
  getVisualSceneStateStorageKey,
  isExplorationRectOutsidePenthouse,
  readVisualDebugPreferences,
  readVisualSceneState,
  resolveFocusAccommodationDamping,
  resolveHumanEyeBokeh,
  resolveHumanEyePupilDiameter,
  serializeVisualSceneState,
  writeVisualDebugPreferences,
  writeVisualSceneState,
} from "./mahjong-table.js";
import type { VisualDebugPreferences, VisualSceneState } from "./mahjong-table.js";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

const sceneState: VisualSceneState = {
  version: 1,
  roomSeed: "room-01",
  view: "seat",
  activeDebugPreset: null,
  cameraPosition: [1.25, 1.65, -2.5],
  cameraQuaternion: [0, 0.15, 0, 0.99],
  orbitTarget: [0, 0.8, 0],
  cameraFov: 68,
  isCrouched: true,
};

const debugPreferences: VisualDebugPreferences = {
  version: 1,
  cameraPreset: "skylineReview",
  fov: 82,
  exposure: 1.12,
  toneMapper: "neutral",
  fogDensity: 0.023,
  skylineVisible: false,
  skylineLayers: { near: false, hero: false, fillers: false, distant: false },
  sunYaw: 0.4,
  sunElevation: 0.92,
  sunIntensity: 2.7,
  environmentIntensity: 1.4,
  environmentRotation: -0.6,
  redAccentIntensity: 0.7,
  cyanEmissiveIntensity: 1.35,
  shadowQuality: "medium",
  qualityMode: "adaptive",
  glassMode: "simple",
  ambientAnimationRate: 0.75,
  dprCap: 1.5,
  wireframe: false,
  boundsVisible: true,
  bokehEnabled: true,
  bokehStrength: 3.5,
  ambientOcclusionEnabled: true,
  autoExposureEnabled: false,
  cameraShiftEnabled: false,
  cameraBobEnabled: true,
};

describe("human-eye bokeh model", () => {
  it("maps bright, indoor, and dark luminance to plausible pupil sizes", () => {
    const bright = resolveHumanEyePupilDiameter(1.45);
    const indoor = resolveHumanEyePupilDiameter(1);
    const dark = resolveHumanEyePupilDiameter(0.35);

    expect(bright).toBeCloseTo(2.5, 5);
    expect(indoor).toBeGreaterThan(bright);
    expect(indoor).toBeLessThan(dark);
    expect(dark).toBeCloseTo(6.5, 5);
  });

  it("accommodates to a near gaze faster than relaxing to a far gaze", () => {
    expect(resolveFocusAccommodationDamping(8, 2.5)).toBeGreaterThan(
      resolveFocusAccommodationDamping(2.5, 8),
    );
  });

  it("keeps the room restrained while opening for close, low-light focus", () => {
    const brightRoom = resolveHumanEyeBokeh(12, 2.5);
    const indoorTile = resolveHumanEyeBokeh(2.5, 4);
    const darkTile = resolveHumanEyeBokeh(2.5, 6.5);

    expect(brightRoom.hyperfocalDistance).toBeGreaterThan(6);
    expect(darkTile.hyperfocalDistance).toBeGreaterThan(brightRoom.hyperfocalDistance);
    expect(brightRoom.intensity).toBe(0);
    expect(indoorTile.maxBlur).toBeGreaterThan(brightRoom.maxBlur);
    expect(darkTile.maxBlur).toBeGreaterThan(indoorTile.maxBlur);
    expect(darkTile.maxBlur).toBeLessThanOrEqual(0.01);
  });

  it("uses a smooth practical cutoff for the focus-lab calibration", () => {
    const closeFocus = resolveHumanEyeBokeh(0.25, 4);
    const quarterBlurFocus = resolveHumanEyeBokeh(2.5, 4);
    const practicalHyperfocalFocus = resolveHumanEyeBokeh(6, 4);
    const farFocus = resolveHumanEyeBokeh(12, 4);

    expect(closeFocus.intensity).toBeGreaterThan(0.95);
    expect(quarterBlurFocus.intensity).toBeCloseTo(0.25, 2);
    expect(practicalHyperfocalFocus.intensity).toBe(0);
    expect(farFocus.intensity).toBe(0);
    expect(quarterBlurFocus.intensity).toBeGreaterThan(
      resolveHumanEyeBokeh(4, 4).intensity,
    );
  });
});

describe("development scene state", () => {
  it("round-trips a room-scoped snapshot through browser storage", () => {
    const storage = new MemoryStorage();

    expect(writeVisualSceneState(storage, sceneState)).toBe(true);
    expect(storage.getItem(getVisualSceneStateStorageKey("room 01"))).toBe(
      serializeVisualSceneState(sceneState),
    );
    expect(readVisualSceneState(storage, "room 01")).toEqual(sceneState);
    expect(readVisualSceneState(storage, "room 02")).toBeNull();
  });

  it("rejects malformed, stale, or unsafe snapshots", () => {
    const storage = new MemoryStorage();
    const key = getVisualSceneStateStorageKey(sceneState.roomSeed);

    storage.setItem(key, "not-json");
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...sceneState, version: 0 }));
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...sceneState, cameraQuaternion: [0, 0, 0, 0] }));
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...sceneState, cameraPosition: [0, -3, 0] }));
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...sceneState, cameraPosition: [61, 1.65, 0] }));
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...sceneState, cameraPosition: [0, 1.65, -53] }));
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();
  });
});

describe("visual debug preferences", () => {
  it("round-trips every persisted debug control", () => {
    const storage = new MemoryStorage();

    expect(writeVisualDebugPreferences(storage, debugPreferences)).toBe(true);
    expect(readVisualDebugPreferences(storage)).toEqual(debugPreferences);
  });

  it("rejects malformed, stale, and out-of-range preferences", () => {
    const storage = new MemoryStorage();
    const key = "hk-mahjong-coach:visual-debug-preferences:v1";

    storage.setItem(key, "not-json");
    expect(readVisualDebugPreferences(storage)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...debugPreferences, version: 0 }));
    expect(readVisualDebugPreferences(storage)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...debugPreferences, fov: 101 }));
    expect(readVisualDebugPreferences(storage)).toBeNull();

    storage.setItem(
      key,
      JSON.stringify({
        ...debugPreferences,
        skylineLayers: { ...debugPreferences.skylineLayers, hero: "visible" },
      }),
    );
    expect(readVisualDebugPreferences(storage)).toBeNull();
  });
});

describe("exploration room exclusion", () => {
  it("clips a boundary block into city-only rectangles", () => {
    const source = { minX: -12, maxX: 12, minZ: 4, maxZ: 12 } as const;
    const pieces = clipExplorationRectAroundPenthouse(source);

    expect(pieces.length).toBe(3);
    expect(pieces.every((piece) => isExplorationRectOutsidePenthouse(piece))).toBe(true);
    expect(pieces).toEqual(
      expect.arrayContaining([
        { minX: -12, maxX: EXPLORATION_PENTHOUSE_BOUNDS.minX, minZ: 4, maxZ: 12 },
        { minX: EXPLORATION_PENTHOUSE_BOUNDS.maxX, maxX: 12, minZ: 4, maxZ: 12 },
        {
          minX: EXPLORATION_PENTHOUSE_BOUNDS.minX,
          maxX: EXPLORATION_PENTHOUSE_BOUNDS.maxX,
          minZ: EXPLORATION_PENTHOUSE_BOUNDS.maxZ,
          maxZ: 12,
        },
      ]),
    );
  });

  it("removes rectangles wholly inside the penthouse and preserves outside blocks", () => {
    expect(clipExplorationRectAroundPenthouse({ minX: -4, maxX: 4, minZ: -4, maxZ: 4 })).toEqual(
      [],
    );
    const outside = { minX: 12, maxX: 16, minZ: 4, maxZ: 8 } as const;
    expect(clipExplorationRectAroundPenthouse(outside)).toEqual([outside]);
  });
});

describe("append-only exploration chunks", () => {
  it("preloads all exploration chunks up front and retains them", () => {
    const scene = new THREE.Scene();
    const world = createExplorationWorld(scene, "append-only-test");

    expect(world.getLoadedChunkCount()).toBe(255);
    world.update(new THREE.Vector3(16, 0, 0));
    const expandedCount = world.getLoadedChunkCount();
    expect(expandedCount).toBe(255);

    world.update(new THREE.Vector3(0, 0, 0));
    expect(world.getLoadedChunkCount()).toBe(expandedCount);
    world.dispose();
  });
});

describe("coarse scene collision extraction", () => {
  it("turns meaningful render meshes into boxes while ignoring presentation detail", () => {
    const scene = new THREE.Scene();
    const environment = new THREE.Group();
    environment.name = "EnvironmentRoot";
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.4), new THREE.MeshBasicMaterial());
    wall.name = "WestStructuralWall";
    wall.position.set(3, 1.5, -2);
    environment.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial());
    floor.name = "PenthouseFloor";
    environment.add(floor);
    const table = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), new THREE.MeshBasicMaterial());
    table.name = "TableBody";
    const tableRoot = new THREE.Group();
    tableRoot.name = "TableRoot";
    tableRoot.add(table);
    scene.add(environment, tableRoot);

    const boxes = collectScenePhysicsBoxes(scene);

    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box).toBeDefined();
    expect(box?.center.x).toBeCloseTo(3);
    expect(box?.center.y).toBeCloseTo(1.5);
    expect(box?.center.z).toBeCloseTo(-2);
    expect(box?.halfExtents.x).toBeCloseTo(1);
    expect(box?.halfExtents.y).toBeCloseTo(1.5);
    expect(box?.halfExtents.z).toBeCloseTo(0.2);
  });
});
