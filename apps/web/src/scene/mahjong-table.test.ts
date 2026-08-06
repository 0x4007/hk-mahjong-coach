import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  clipExplorationRectAroundPenthouse,
  collectScenePhysicsBoxes,
  createExplorationWorld,
  EXPLORATION_PENTHOUSE_BOUNDS,
  getVisualSceneStateStorageKey,
  LEDGE_CLIMB_EYE_HEIGHT_METERS,
  resolveLedgeClimbTargetCameraY,
  resolveLedgeGrabTarget,
  resolveLedgeClimbMomentum,
  resolveVaultTarget,
  resolveWallHangTarget,
  resolveWallHangTargetDetails,
  WALL_HANG_MIN_TOP,
  WALL_HANG_MAX_TOP_GAP,
  WALL_HANG_REACH,
  WALL_HANG_SIDE_BUFFER,
  WALL_CLIMB_SPEED,
  isExplorationRectOutsidePenthouse,
  readVisualDebugPreferences,
  readVisualSceneState,
  resolveFocusAccommodationDamping,
  resolveDofIntensityForPosture,
  resolveHumanEyeBokeh,
  resolveHumanEyePupilDiameter,
  resolveCrouchedStateAfterJump,
  resolveCrouchedStateAfterSprint,
  resolveJumpLaunchSpeed,
  resolveReticleZoomViewOffset,
  resolveWeaponShotReticleOffset,
  ZOOM_RECOIL_FEEDBACK_MULTIPLIER,
  resolveDesktopAimInput,
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
import type { PhysicsBox, PhysicsVector } from "./mahjong-physics.js";

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
  it("keeps walking speed during reload and caps sprint at the derived trot", () => {
    const walk = resolvePlayerMovementSpeedMultiplier({
      crouching: false,
      sprinting: false,
      jogging: false,
      reloading: false,
    });
    const walkingReload = resolvePlayerMovementSpeedMultiplier({
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

    expect(walkingReload).toBe(walk);
    expect(trot).toBeLessThan(sprint);
    expect(sprintingReload).toBe(trot);
  });

  it("keeps crouch speed ahead of the standing reload trot", () => {
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
    expect(crouch).toBeLessThan(standingReload);
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

    expect(world.getLoadedChunkCount()).toBe(121);
    world.update(new THREE.Vector3(16, 0, 0));
    const expandedCount = world.getLoadedChunkCount();
    expect(expandedCount).toBe(121);

    world.update(new THREE.Vector3(0, 0, 0));
    expect(world.getLoadedChunkCount()).toBe(expandedCount);
    world.dispose();
  });
});

describe("ledge vaulting helpers", () => {
  it("returns a capsule-centre target for a low vault and keeps it on the platform", () => {
    const fromPosition: PhysicsVector = { x: 0, y: 0.86, z: -0.6 };
    const target = resolveVaultTarget(
      fromPosition,
      { x: 0, y: 0, z: 0.75 },
      fromPosition.y - 0.86,
      [
        {
          center: { x: 0, y: 0.11, z: 0 },
          halfExtents: { x: 0.5, y: 0.11, z: 0.5 },
        },
      ],
    );

    expect(target).not.toBeNull();
    expect(target?.y).toBeCloseTo(0.22 + 0.86);
    expect(target?.z).toBeCloseTo(0.31);
    expect(target?.z).toBeGreaterThanOrEqual(-0.5 + 0.06);
    expect(target?.z).toBeLessThanOrEqual(0.5 - 0.06);
  });

  it("does not vault a low platform that is merely nearby or behind the player", () => {
    const platform: PhysicsBox = {
      center: { x: 0, y: 0.11, z: 0 },
      halfExtents: { x: 0.5, y: 0.11, z: 0.5 },
    };

    expect(
      resolveVaultTarget({ x: 0, y: 0.86, z: -1.5 }, { x: 0, y: 0, z: 1 }, 0, [platform]),
    ).toBeNull();
    expect(
      resolveVaultTarget({ x: 0, y: 0.86, z: 0.7 }, { x: 0, y: 0, z: 1 }, 0, [platform]),
    ).toBeNull();
  });

  it("nudges ledge grab targets forward onto a supported landing zone", () => {
    const playerColliderCenterHeight = 0.86;
    const fromPosition: PhysicsVector = { x: 0, y: playerColliderCenterHeight, z: -0.6 };
    const delta: PhysicsVector = { x: 0, y: 0, z: 0.6 };
    const boxes: PhysicsBox[] = [
      {
        center: { x: 0, y: 0.5, z: 0 },
        halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
      },
    ];
    const target = resolveLedgeGrabTarget(
      fromPosition,
      delta,
      fromPosition.y - playerColliderCenterHeight,
      boxes,
      [],
    );

    expect(target).not.toBeNull();
    expect(target?.x).toBeCloseTo(0);
    expect(target?.z).toBeGreaterThan(fromPosition.z + delta.z);
    expect(target?.z).toBeCloseTo(0.16);
    expect(target?.y).toBeCloseTo(1.86);
  });

  it("locks ledge transition camera to a 1.75m eye height", () => {
    expect(resolveLedgeClimbTargetCameraY(1.86)).toBeCloseTo(2.75);
    expect(LEDGE_CLIMB_EYE_HEIGHT_METERS).toBe(1.75);
  });

  it("captures at least sprint momentum at vault start", () => {
    const moveSpeed = 3.4;
    const momentum = resolveLedgeClimbMomentum(0.2, 0, 0, 0, true, moveSpeed);
    expect(
      Math.hypot(momentum.preservedForwardVelocity, momentum.preservedStrafeVelocity),
    ).toBeCloseTo(moveSpeed * 3, 2);
  });

  it("falls back to stored velocity when input is still resolving", () => {
    const momentum = resolveLedgeClimbMomentum(0, 0, 0.6, 0.8, false, 3.4);
    expect(momentum.preservedForwardVelocity).toBeCloseTo(0.6);
    expect(momentum.preservedStrafeVelocity).toBeCloseTo(0.8);
    expect(momentum.preserveSprinting).toBe(false);
  });
});

describe("wall hanging helper", () => {
  const playerY = 0.86;
  const airbornePlayerY = 2.7;
  const forwardZWall: PhysicsBox = {
    center: { x: 0, y: 2, z: -4 },
    halfExtents: { x: 0.5, y: 2, z: 0.5 },
  };

  it("detects the approached near face when a jump reaches the wall top", () => {
    const target = resolveWallHangTarget(
      { x: 0, y: airbornePlayerY, z: -3 },
      { x: 0, y: 0, z: -4 },
      [forwardZWall],
    );

    expect(target).not.toBeNull();
    expect(target?.y).toBe(airbornePlayerY);
    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
    expect(Math.abs((target?.z ?? 0) - -3.5)).toBeGreaterThan(0.26);
    expect(WALL_HANG_REACH).toBeGreaterThan(0);
    expect(WALL_HANG_MAX_TOP_GAP).toBeGreaterThan(0);
    expect(WALL_HANG_SIDE_BUFFER).toBeGreaterThan(0);
    expect(WALL_CLIMB_SPEED).toBeGreaterThan(0);
  });

  it("does not turn a ground-level collision with a tall wall into a climb", () => {
    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -3 }, { x: 0, y: 0, z: -1 }, [forwardZWall]),
    ).toBeNull();
  });

  it("rejects a five-metre wall even at the top of a normal jump", () => {
    const fiveMetreWall: PhysicsBox = {
      center: { x: 0, y: 2.5, z: -4 },
      halfExtents: { x: 0.5, y: 2.5, z: 0.5 },
    };

    expect(
      resolveWallHangTarget({ x: 0, y: airbornePlayerY, z: -3 }, { x: 0, y: 0, z: -1 }, [
        fiveMetreWall,
      ]),
    ).toBeNull();
  });

  it("uses a relative height threshold and rejects a short wall", () => {
    const shortWall: PhysicsBox = {
      center: { x: 0, y: 0.4, z: -4 },
      halfExtents: { x: 0.5, y: 0.4, z: 0.5 },
    };

    expect(WALL_HANG_MIN_TOP).toBeCloseTo(1.6 + 0.05);
    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -3 }, { x: 0, y: 0, z: -1 }, [shortWall]),
    ).toBeNull();

    const vaultHeightPlatform: PhysicsBox = {
      center: { x: 0, y: 0.5, z: -4 },
      halfExtents: { x: 1, y: 0.5, z: 1 },
    };
    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -3 }, { x: 0, y: 0, z: -1 }, [
        vaultHeightPlatform,
      ]),
    ).toBeNull();

    const floatingWall: PhysicsBox = {
      ...forwardZWall,
      center: { x: 0, y: 3.2, z: -4 },
      halfExtents: { x: 0.5, y: 0.4, z: 0.5 },
    };
    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -3 }, { x: 0, y: 0, z: -1 }, [floatingWall]),
    ).toBeNull();
  });

  it("catches a higher platform during an airborne approach before the apex", () => {
    const platformFace: PhysicsBox = {
      center: { x: 0, y: 2.24, z: -4 },
      halfExtents: { x: 0.5, y: 0.08, z: 0.5 },
    };

    const target = resolveWallHangTarget({ x: 0, y: 1.5, z: -3 }, { x: 0, y: 0, z: -1 }, [
      platformFace,
    ]);

    expect(target).not.toBeNull();
    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
    expect(target?.y).toBeCloseTo(1.5, 6);
  });

  it("catches a thin platform when its underside is just above the capsule head", () => {
    const thinPlatform: PhysicsBox = {
      center: { x: 0, y: 3.12, z: -4 },
      halfExtents: { x: 0.75, y: 0.08, z: 0.5 },
    };

    const target = resolveWallHangTarget({ x: 0, y: 2.17, z: -4.29 }, { x: 0, y: 0, z: -1 }, [
      thinPlatform,
    ]);

    expect(target).not.toBeNull();
    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
    expect(target?.y).toBeCloseTo(2.17, 6);
  });

  it("rejects walls outside lateral overlap or beyond reach", () => {
    const lateralWall: PhysicsBox = {
      ...forwardZWall,
      center: { x: 2, y: 2, z: -4 },
    };
    const distantWall: PhysicsBox = {
      ...forwardZWall,
      center: { x: 0, y: 2, z: -5 },
    };

    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -3 }, { x: 0, y: 0, z: -1 }, [lateralWall]),
    ).toBeNull();
    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -3 }, { x: 0, y: 0, z: -1 }, [distantWall]),
    ).toBeNull();
  });

  it("allows the capsule radius to overlap a wall's lateral edge", () => {
    const edgeWall: PhysicsBox = {
      ...forwardZWall,
      center: { x: 0.72, y: 2, z: -4 },
    };

    const target = resolveWallHangTarget(
      { x: 0, y: airbornePlayerY, z: -3 },
      { x: 0, y: 0, z: -1 },
      [edgeWall],
    );

    expect(target).not.toBeNull();
    expect(target?.x).toBeGreaterThanOrEqual(
      edgeWall.center.x - edgeWall.halfExtents.x + 0.26 + 0.01,
    );
  });

  it("does not grab a wall behind the player", () => {
    const behindWall: PhysicsBox = {
      center: { x: 0, y: 2, z: -1.9 },
      halfExtents: { x: 0.5, y: 2, z: 0.2 },
    };

    expect(
      resolveWallHangTarget({ x: 0, y: playerY, z: -2.2 }, { x: 0, y: 0, z: -1 }, [behindWall]),
    ).toBeNull();
  });

  it("recovers a swept contact while the capsule is still within the wall slab", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 1.6, z: -4 },
      halfExtents: { x: 0.5, y: 1.6, z: 0.5 },
    };
    const target = resolveWallHangTarget({ x: 0, y: 2.17, z: -4.29 }, { x: 0, y: 0, z: -1 }, [
      wall,
    ]);

    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
  });

  it("rejects a swept point that has passed beyond the far side", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 1.6, z: -4 },
      halfExtents: { x: 0.5, y: 1.6, z: 0.5 },
    };

    expect(
      resolveWallHangTarget({ x: 0, y: 2.17, z: -4.7 }, { x: 0, y: 0, z: -1 }, [wall]),
    ).toBeNull();
  });

  it("selects the closest qualifying wall", () => {
    const nearer: PhysicsBox = {
      center: { x: 0, y: 2, z: -4 },
      halfExtents: { x: 0.5, y: 2, z: 0.5 },
    };
    const farther: PhysicsBox = {
      center: { x: 0, y: 2, z: -4.2 },
      halfExtents: { x: 0.5, y: 2, z: 0.5 },
    };
    const target = resolveWallHangTarget(
      { x: 0, y: airbornePlayerY, z: -3 },
      { x: 0, y: 0, z: -1 },
      [farther, nearer],
    );

    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
  });

  it.each([
    [
      { x: 1, y: 0, z: 0 },
      { x: 3, y: airbornePlayerY, z: 0 },
      { x: 3.5 - 0.26 - 0.01, y: airbornePlayerY, z: 0 },
    ],
    [
      { x: -1, y: 0, z: 0 },
      { x: -3, y: airbornePlayerY, z: 0 },
      { x: -3.5 + 0.26 + 0.01, y: airbornePlayerY, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: airbornePlayerY, z: 3 },
      { x: 0, y: airbornePlayerY, z: 3.5 - 0.26 - 0.01 },
    ],
  ])("handles an approach on each cardinal axis", (forward, fromPosition, expected) => {
    const target = resolveWallHangTarget(fromPosition, forward, [
      {
        center: {
          x: expected.x === 0 ? 0 : expected.x > 0 ? 4 : -4,
          y: 2,
          z: expected.z === 0 ? 0 : expected.z > 0 ? 4 : -4,
        },
        halfExtents: { x: expected.x === 0 ? 0.5 : 0.5, y: 2, z: expected.z === 0 ? 0.5 : 0.5 },
      },
    ]);

    expect(target?.x).toBeCloseTo(expected.x, 6);
    expect(target?.z).toBeCloseTo(expected.z, 6);
  });

  it("supports a diagonal approach using the dominant axis", () => {
    const target = resolveWallHangTarget(
      { x: 0, y: airbornePlayerY, z: -3 },
      { x: 0.45, y: 0, z: -0.9 },
      [forwardZWall],
    );

    expect(target).not.toBeNull();
    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
    expect(target?.x).toBeGreaterThanOrEqual(-0.5 + 0.26);
    expect(target?.x).toBeLessThanOrEqual(0.5 - 0.26);
  });

  it("resolves a valid hang from the safe position just before a contact response", () => {
    const wall: PhysicsBox = {
      center: { x: -70, y: 1.9, z: -12 },
      halfExtents: { x: 0.25, y: 1.9, z: 3 },
    };
    const resolution = resolveWallHangTargetDetails(
      { x: -70.64, y: 2.7, z: -12 },
      { x: 1, y: 0, z: 0 },
      [wall],
    );

    expect(resolution?.target.x).toBeCloseTo(-70.52, 6);
    expect(resolution?.target.y).toBeCloseTo(2.7, 6);
    expect(resolution?.target.z).toBeCloseTo(-12, 6);
    expect(resolution?.wallFacePoint.x).toBeCloseTo(-70.25, 6);
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
