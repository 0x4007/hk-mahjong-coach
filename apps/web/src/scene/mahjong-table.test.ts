import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  clipExplorationRectAroundPenthouse,
  collectScenePhysicsBoxes,
  createExplorationWorld,
  EXPLORATION_CHUNK_SIZE,
  EXPLORATION_CHUNKS_PER_SIDE,
  EXPLORATION_PENTHOUSE_BOUNDS,
  EXPLORATION_WORLD_HALF_SIZE,
  EXPLORATION_WORLD_SIZE_METERS,
  getVisualSceneStateStorageKey,
  PLAY_AREA_ORIGINS,
  PLAY_AREA_SIZE_METERS,
  isExplorationRectOutsidePenthouse,
  readVisualDebugPreferences,
  readVisualSceneState,
  resolveFocusAccommodationDamping,
  resolveDofIntensityForPosture,
  resolveHumanEyeBokeh,
  resolveHumanEyePupilDiameter,
  resolveCrouchedStateAfterJump,
  resolveCrouchedStateAfterSprint,
  resolveSprintRequestAfterO2Check,
  shouldInterruptReloadForSprint,
  shouldTriggerJumpFromKeydown,
  resolveJumpLaunchSpeed,
  resolveReticleZoomViewOffset,
  resolveWeaponShotReticleOffset,
  ZOOM_RECOIL_FEEDBACK_MULTIPLIER,
  resolveDesktopAimInput,
  resolveCoverLeanInput,
  resolveCoverModeFromAimTransition,
  resolveReloadAimingDownSights,
  resolvePlayerMovementSpeedMultiplier,
  isMovementDoubleTap,
  MOVEMENT_DOUBLE_TAP_WINDOW_MS,
  isLeftCommandKeyEvent,
  serializeVisualSceneState,
  shouldCaptureLeftCommandKeystroke,
  writeVisualDebugPreferences,
  writeVisualSceneState,
} from "./mahjong-table.js";
import type { VisualDebugPreferences, VisualSceneState } from "./mahjong-table.js";
import {
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_TROT_MULTIPLIER,
  PLAYER_TROT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_TROT_SPEED_METERS_PER_SECOND,
  PLAYER_WALK_MULTIPLIER,
} from "./world-scale.js";

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

describe("player movement speed", () => {
  it("ends the sprint request when its O₂ slice is unaffordable", () => {
    expect(resolveSprintRequestAfterO2Check(true, false)).toBe(false);
    expect(resolveSprintRequestAfterO2Check(true, true)).toBe(true);
    expect(resolveSprintRequestAfterO2Check(false, false)).toBe(false);
  });

  it("defaults standing movement to the 1.5-times-base trot and keeps crouch in walk mode", () => {
    const defaultStanding = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      walking: false,
      sprinting: false,
      jogging: false,
      reloading: false,
    });
    const standingReload = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: false,
      jogging: false,
      reloading: true,
    });
    const trot = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: false,
      jogging: true,
      reloading: false,
    });

    const crouch = resolvePlayerMovementSpeedMultiplier({
      crouching: true,
      sprinting: false,
      jogging: false,
      reloading: false,
    });

    expect(defaultStanding).toBe(trot);
    expect(standingReload).toBe(trot);
    expect(crouch).toBe(0.5);
    expect(crouch).toBeLessThan(defaultStanding);
  });

  it("honors the hidden walking toggle while standing and over full sprint", () => {
    const trot = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      walking: false,
      sprinting: false,
      jogging: false,
      reloading: false,
    });
    const hiddenWalk = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      walking: true,
      sprinting: false,
      jogging: false,
      reloading: false,
    });
    const hiddenWalkDuringSprint = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      walking: true,
      sprinting: true,
      jogging: false,
      reloading: false,
    });
    const crouched = resolvePlayerMovementSpeedMultiplier({
      crouching: true,
      walking: true,
      sprinting: true,
      jogging: false,
      reloading: false,
    });

    expect(hiddenWalk).toBe(PLAYER_WALK_MULTIPLIER);
    expect(hiddenWalk).toBe(1);
    expect(hiddenWalk).toBeLessThan(trot);
    expect(hiddenWalkDuringSprint).toBe(hiddenWalk);
    expect(crouched).toBe(0.5);
    expect(crouched).not.toBe(hiddenWalk);
  });

  it("keeps full sprint O₂-gated and caps it at trot during reload", () => {
    const trot = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: false,
      jogging: false,
      reloading: false,
    });
    const sprint = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: true,
      jogging: false,
      reloading: false,
    });
    const sprintingReload = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: true,
      jogging: false,
      reloading: true,
    });

    expect(trot).toBeLessThan(sprint);
    expect(sprintingReload).toBe(trot);
  });

  it("keeps the 1.5-times-base trot below the three-times-base sprint target", () => {
    const trotMultiplier = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: false,
      jogging: false,
      reloading: false,
    });
    expect(PLAYER_TROT_MULTIPLIER).toBe(1.5);
    expect(PLAYER_TROT_SPEED_METERS_PER_SECOND).toBe(
      PLAYER_MOVE_SPEED_METERS_PER_SECOND * PLAYER_TROT_MULTIPLIER,
    );
    expect(PLAYER_TROT_SPEED_METERS_PER_SECOND).toBeCloseTo(5.1, 8);
    expect(PLAYER_TROT_SPEED_KILOMETERS_PER_HOUR).toBeCloseTo(18.36, 8);
    expect(PLAYER_SPRINT_SPEED_METERS_PER_SECOND).toBe(
      PLAYER_MOVE_SPEED_METERS_PER_SECOND * PLAYER_SPRINT_MULTIPLIER,
    );
    expect(PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR).toBeCloseTo(36.72, 8);
    expect(PLAYER_MOVE_SPEED_METERS_PER_SECOND * trotMultiplier).toBeCloseTo(
      PLAYER_TROT_SPEED_METERS_PER_SECOND,
      8,
    );
    expect(trotMultiplier).toBeLessThan(PLAYER_SPRINT_MULTIPLIER);
  });

  it("keeps the existing crouch walk speed during reload", () => {
    const crouch = resolvePlayerMovementSpeedMultiplier({
      crouching: true,
      sprinting: false,
      jogging: false,
      reloading: true,
    });
    const standingReload = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: false,
      jogging: false,
      reloading: true,
    });

    expect(crouch).toBe(0.5);
    expect(standingReload).toBeGreaterThan(crouch);
  });
});

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
  cameraPreset: "roomReveal",
  enabledAreas: {
    focusCalibration: true,
    penthouse: false,
    climbingGym: true,
    parametricBarracks: false,
    targetRange: true,
  },
  fov: 82,
  exposure: 1.12,
  toneMapper: "neutral",
  fogDensity: 0.023,
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
    expect(quarterBlurFocus.intensity).toBeGreaterThan(resolveHumanEyeBokeh(4, 4).intensity);
  });
});

describe("left Command keyboard binding", () => {
  it("recognizes only the physical left Command key", () => {
    expect(isLeftCommandKeyEvent({ code: "MetaLeft", key: "Meta", location: 1 })).toBe(true);
    expect(isLeftCommandKeyEvent({ code: "MetaRight", key: "Meta", location: 2 })).toBe(false);
    expect(isLeftCommandKeyEvent({ code: "", key: "Meta", location: 1 })).toBe(true);
  });

  it("captures every following key while left Command is held", () => {
    const leftCommand = { code: "MetaLeft", key: "Meta", location: 1 } as const;
    const commandW = { code: "KeyW", key: "w", location: 0 } as const;

    expect(shouldCaptureLeftCommandKeystroke(leftCommand, false)).toBe(true);
    expect(shouldCaptureLeftCommandKeystroke(commandW, true)).toBe(true);
    expect(shouldCaptureLeftCommandKeystroke(commandW, false)).toBe(false);
  });

  it("keeps right mouse on zoom without making it a hold-breath input", () => {
    expect(resolveDesktopAimInput(false, true)).toEqual({
      aimingDownSights: true,
      holdingBreath: false,
    });
    expect(resolveDesktopAimInput(true, false)).toEqual({
      aimingDownSights: true,
      holdingBreath: true,
    });
  });

  it("temporarily leaves zoom during reload and restores the requested zoom when ready", () => {
    expect(resolveReloadAimingDownSights(true, true)).toBe(false);
    expect(resolveReloadAimingDownSights(true, false)).toBe(true);
    expect(resolveReloadAimingDownSights(false, true)).toBe(false);
  });
});

describe("cover mode", () => {
  it("arms only when zoom is activated while wall contact is present", () => {
    expect(resolveCoverModeFromAimTransition(false, false, true, true)).toBe(false);
    expect(resolveCoverModeFromAimTransition(false, true, true, true)).toBe(true);
    expect(resolveCoverModeFromAimTransition(false, true, true, false)).toBe(false);
    expect(resolveCoverModeFromAimTransition(true, false, true, false)).toBe(false);
    expect(resolveCoverModeFromAimTransition(true, false, true, true)).toBe(true);
    expect(resolveCoverModeFromAimTransition(true, true, false, true)).toBe(false);
  });

  it("uses explicit Z/C lean keys before strafe input", () => {
    expect(resolveCoverLeanInput(false, true, false, 1)).toBe(0);
    expect(resolveCoverLeanInput(true, true, false, 1)).toBe(-1);
    expect(resolveCoverLeanInput(true, false, true, -1)).toBe(1);
    expect(resolveCoverLeanInput(true, false, false, -0.4)).toBe(-0.4);
  });
});

describe("movement sprint double-tap", () => {
  const movementKeys = [
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ];

  it("starts sprinting from a second tap of every movement key", () => {
    for (const keyCode of movementKeys) {
      const taps = new Map([[keyCode, 1_000]]);

      expect(isMovementDoubleTap(keyCode, 1_000 + MOVEMENT_DOUBLE_TAP_WINDOW_MS, taps, false)).toBe(
        true,
      );
    }
  });

  it("keeps tap histories directional and ignores repeats or late taps", () => {
    const taps = new Map([["KeyW", 2_000]]);

    expect(isMovementDoubleTap("KeyA", 2_100, taps, false)).toBe(false);
    expect(isMovementDoubleTap("KeyW", 2_100, taps, true)).toBe(false);
    expect(
      isMovementDoubleTap("KeyW", 2_000 + MOVEMENT_DOUBLE_TAP_WINDOW_MS + 1, taps, false),
    ).toBe(false);
    expect(isMovementDoubleTap("KeyW", 1_999, taps, false)).toBe(false);
  });
});

describe("jump posture", () => {
  it("does not replay a held ground jump from keyboard repeat events", () => {
    expect(shouldTriggerJumpFromKeydown(false)).toBe(true);
    expect(shouldTriggerJumpFromKeydown(true)).toBe(false);
  });

  it("automatically stands from crouch only when the jump is accepted", () => {
    expect(resolveCrouchedStateAfterJump(true, true)).toBe(false);
    expect(resolveCrouchedStateAfterJump(true, false)).toBe(true);
    expect(resolveCrouchedStateAfterJump(false, true)).toBe(false);
  });

  it("uses a reduced free launch when the full O₂ jump charge is unavailable", () => {
    const fullJump = resolveJumpLaunchSpeed(true);
    const miniHop = resolveJumpLaunchSpeed(false);

    expect(miniHop).toBeGreaterThan(0);
    expect(miniHop).toBeLessThan(fullJump);
    expect(miniHop / fullJump).toBeCloseTo(12 / 17, 8);
  });
});

describe("sprint posture", () => {
  it("stands when a sprint request is accepted and preserves crouch when it is rejected", () => {
    expect(resolveCrouchedStateAfterSprint(true, true)).toBe(false);
    expect(resolveCrouchedStateAfterSprint(true, false)).toBe(true);
    expect(resolveCrouchedStateAfterSprint(false, true)).toBe(false);
  });

  it("interrupts reload only after sprint is accepted", () => {
    expect(shouldInterruptReloadForSprint(true, true)).toBe(true);
    expect(shouldInterruptReloadForSprint(true, false)).toBe(false);
    expect(shouldInterruptReloadForSprint(false, true)).toBe(false);
  });
});

describe("reticule-anchored seat zoom", () => {
  it("does not shift the standing projection", () => {
    expect(resolveReticleZoomViewOffset(90)).toEqual({ x: 0, y: 0 });
  });

  it("moves the narrow projection pivot above a lower reticule", () => {
    const offset = resolveReticleZoomViewOffset(45);

    expect(offset.x).toBeCloseTo(0, 8);
    expect(offset.y).toBeCloseTo(0.1414213562, 8);
  });

  it("keeps the lower reticule ray on the same world point while zooming", () => {
    const camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.05, 1200);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const reticleNdc = new THREE.Vector2(0, -0.2);
    raycaster.setFromCamera(reticleNdc, camera);
    const point = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 10);
    const offset = resolveReticleZoomViewOffset(45);

    camera.fov = 45;
    camera.setViewOffset(1, 1, offset.x, offset.y, 1, 1);
    camera.aspect = 16 / 9;
    camera.updateProjectionMatrix();

    expect(point.project(camera).y).toBeCloseTo(reticleNdc.y, 8);
  });
});

describe("shot direction reticule", () => {
  it("keeps full hip-fire recoil feedback and damps it for zoom direction selection", () => {
    const motion = {
      roll: 0.01,
      verticalOffset: 0.02,
      aimSwayX: 0.003,
      aimSwayY: -0.002,
      recoilYaw: 0.04,
      recoilPitch: -0.03,
    };
    const base = resolveWeaponShotReticleOffset(motion, false);
    const hip = resolveWeaponShotReticleOffset(motion, true);
    const zoom = resolveWeaponShotReticleOffset(motion, true, ZOOM_RECOIL_FEEDBACK_MULTIPLIER);

    expect(hip.x - base.x).toBeCloseTo(0.04 * 180 * 5, 8);
    expect(hip.y - base.y).toBeCloseTo(-0.03 * 180 * 5, 8);
    expect(zoom.x - base.x).toBeCloseTo(0.04 * 180 * 5 * ZOOM_RECOIL_FEEDBACK_MULTIPLIER, 8);
    expect(zoom.y - base.y).toBeCloseTo(-0.03 * 180 * 5 * ZOOM_RECOIL_FEEDBACK_MULTIPLIER, 8);
  });
});

describe("zoom depth-of-field defaults", () => {
  it("uses 12.5x outside zoom regardless of posture", () => {
    expect(resolveDofIntensityForPosture(false)).toBe(12.5);
    expect(resolveDofIntensityForPosture(true)).toBe(12.5);
  });

  it("uses 25x while zoomed for both standing and crouched posture", () => {
    expect(resolveDofIntensityForPosture(false, true)).toBe(25);
    expect(resolveDofIntensityForPosture(true, true)).toBe(25);
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

    storage.setItem(key, JSON.stringify({ ...sceneState, cameraPosition: [501, 1.65, 0] }));
    expect(readVisualSceneState(storage, sceneState.roomSeed)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...sceneState, cameraPosition: [0, 1.65, -501] }));
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
        enabledAreas: { ...debugPreferences.enabledAreas, targetRange: "yes" },
      }),
    );
    expect(readVisualDebugPreferences(storage)).toBeNull();

    storage.setItem(
      key,
      JSON.stringify({
        ...debugPreferences,
        cameraPreset: "bogus" as unknown as VisualDebugPreferences["cameraPreset"],
      }),
    );
    expect(readVisualDebugPreferences(storage)).toBeNull();
  });
});

describe("exploration room exclusion", () => {
  it("clips a boundary block into city-only rectangles", () => {
    const source = { minX: -30, maxX: 30, minZ: 20, maxZ: 30 } as const;
    const pieces = clipExplorationRectAroundPenthouse(source);

    expect(pieces.length).toBe(3);
    expect(pieces.every((piece) => isExplorationRectOutsidePenthouse(piece))).toBe(true);
    expect(pieces).toEqual(
      expect.arrayContaining([
        { minX: -30, maxX: EXPLORATION_PENTHOUSE_BOUNDS.minX, minZ: 20, maxZ: 30 },
        { minX: EXPLORATION_PENTHOUSE_BOUNDS.maxX, maxX: 30, minZ: 20, maxZ: 30 },
        {
          minX: EXPLORATION_PENTHOUSE_BOUNDS.minX,
          maxX: EXPLORATION_PENTHOUSE_BOUNDS.maxX,
          minZ: EXPLORATION_PENTHOUSE_BOUNDS.maxZ,
          maxZ: 30,
        },
      ]),
    );
  });

  it("removes rectangles wholly inside the penthouse and preserves outside blocks", () => {
    expect(clipExplorationRectAroundPenthouse({ minX: -4, maxX: 4, minZ: -4, maxZ: 4 })).toEqual(
      [],
    );
    const outside = { minX: 32, maxX: 36, minZ: 4, maxZ: 8 } as const;
    expect(clipExplorationRectAroundPenthouse(outside)).toEqual([outside]);
  });
});

describe("append-only exploration chunks", () => {
  it("preloads all exploration chunks up front and retains them", () => {
    const scene = new THREE.Scene();
    const world = createExplorationWorld(scene, "append-only-test");

    expect(EXPLORATION_WORLD_SIZE_METERS).toBe(250);
    expect(EXPLORATION_WORLD_HALF_SIZE).toBe(125);
    expect(EXPLORATION_CHUNK_SIZE).toBe(50);
    expect(EXPLORATION_CHUNKS_PER_SIDE).toBe(2);
    expect(world.getLoadedChunkCount()).toBe(25);
    world.update(new THREE.Vector3(16, 0, 0));
    const expandedCount = world.getLoadedChunkCount();
    expect(expandedCount).toBe(25);

    world.update(new THREE.Vector3(0, 0, 0));
    expect(world.getLoadedChunkCount()).toBe(expandedCount);
    world.dispose();
  });

  it("keeps every authored training pad inside the compact map bounds", () => {
    const playAreaHalfSize = PLAY_AREA_SIZE_METERS / 2;
    for (const origin of Object.values(PLAY_AREA_ORIGINS)) {
      expect(origin.x - playAreaHalfSize).toBeGreaterThanOrEqual(-EXPLORATION_WORLD_HALF_SIZE);
      expect(origin.x + playAreaHalfSize).toBeLessThanOrEqual(EXPLORATION_WORLD_HALF_SIZE);
      expect(origin.z - playAreaHalfSize).toBeGreaterThanOrEqual(-EXPLORATION_WORLD_HALF_SIZE);
      expect(origin.z + playAreaHalfSize).toBeLessThanOrEqual(EXPLORATION_WORLD_HALF_SIZE);
    }
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
