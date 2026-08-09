import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  clipExplorationRectAroundPenthouse,
  CLIMBING_GYM_STANDING_EYE_HEIGHT,
  CLIMBING_GYM_VAULT_HEIGHTS,
  collectScenePhysicsBoxes,
  createExplorationWorld,
  DEFAULT_RETICLE_POSITION,
  EXPLORATION_CHUNK_SIZE,
  EXPLORATION_CHUNKS_PER_SIDE,
  EXPLORATION_PENTHOUSE_BOUNDS,
  EXPLORATION_WORLD_HALF_SIZE,
  EXPLORATION_WORLD_SIZE_METERS,
  getVisualSceneStateStorageKey,
  LEDGE_CLIMB_EYE_HEIGHT_METERS,
  PLAY_AREA_ORIGINS,
  PLAY_AREA_SIZE_METERS,
  resolveLedgeClimbTargetCameraY,
  resolveLedgeGrabTarget,
  resolveLedgeClimbMomentum,
  resolveCameraVerticalOffsetBounds,
  resolveVaultTarget,
  resolveVaultTraversalArcHeight,
  resolveVaultTraversalDuration,
  resolveVaultTraversalO2Cost,
  resolveO2ScaledTraversalDuration,
  resolveWallClimbTarget,
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
  resolveCancelledMeleeSwing,
  resolveFocusAccommodationDamping,
  resolveDofIntensityForPosture,
  resolveHumanEyeBokeh,
  resolveHumanEyeAdaptationLuminance,
  resolveHumanEyePupilDiameter,
  resolveCrouchedStateAfterJump,
  resolveWalkingModeAfterJump,
  resolveCrouchedStateAfterSprint,
  resolveSprintRequestAfterO2Check,
  shouldInterruptReloadForSprint,
  shouldInterruptReloadForMelee,
  resolveFirstPersonPresentation,
  resolveReticlePresentation,
  resolveReticleAimNdc,
  resolveReticleZoomViewOffset,
  resolveViewmodelAimTargetLocal,
  snapshotActionAimRay,
  resolveDesktopAimInput,
  resolveCoverLeanInput,
  resolveCoverModeFromAimTransition,
  resolveCoverModeAfterJump,
  resolveZoomActivationEdge,
  resolveMeleeDropRearmWeapon,
  shouldAutoRearmOwnedGunAfterMeleeDrop,
  shouldAutoReloadOnWeaponEquip,
  shouldEquipWalkOverGun,
  shouldResolveMeleeSwingImpact,
  shouldStashMeleeForGun,
  resolveReloadAimingDownSights,
  resolvePlayerMovementSpeedMultiplier,
  resolveSimulantShotDamage,
  resolvePlayerKnockbackVelocity,
  resolvePlayerRecoveryPosition,
  isWeaponRaycastSurface,
  isMovementDoubleTap,
  MOVEMENT_DOUBLE_TAP_WINDOW_MS,
  isLeftCommandKeyEvent,
  serializeVisualSceneState,
  shouldCaptureLeftCommandKeystroke,
  writeVisualDebugPreferences,
  writeVisualSceneState,
} from "./mahjong-table.js";
import { createCameraMotionDamper } from "./camera-motion.js";
import type { VisualDebugPreferences, VisualSceneState } from "./mahjong-table.js";
import type { PhysicsBox, PhysicsVector } from "./mahjong-physics.js";
import { createDebuggingTwoMap, DEBUGGING_TWO_BOX_STACK_PITCH } from "./debugging-two-map.js";
import { O2_LANDING_BASE_COST } from "./player-vitals.js";
import {
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_TROT_MULTIPLIER,
  PLAYER_TROT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_TROT_SPEED_METERS_PER_SECOND,
  PLAYER_WALK_MULTIPLIER,
  WORLD_EPSILON,
} from "./world-scale.js";

describe("melee and gun handoff", () => {
  it("stashes drawn melee only after a gun action succeeds", () => {
    expect(shouldStashMeleeForGun(true, true)).toBe(true);
    expect(shouldStashMeleeForGun(true, false)).toBe(false);
    expect(shouldStashMeleeForGun(false, true)).toBe(false);
  });

  it("never auto-equips a walked-over gun over drawn melee", () => {
    expect(shouldEquipWalkOverGun(true, false)).toBe(false);
    expect(shouldEquipWalkOverGun(true, true)).toBe(false);
    expect(shouldEquipWalkOverGun(false, false)).toBe(true);
    expect(shouldEquipWalkOverGun(false, true)).toBe(false);
  });

  it("auto-reloads an equipped empty gun only when reserve ammo exists", () => {
    expect(shouldAutoReloadOnWeaponEquip(0, 12)).toBe(true);
    expect(shouldAutoReloadOnWeaponEquip(-1, 12)).toBe(true);
    expect(shouldAutoReloadOnWeaponEquip(1, 12)).toBe(false);
    expect(shouldAutoReloadOnWeaponEquip(0, 0)).toBe(false);
  });

  it("restores the gun held before melee only after a successful drop", () => {
    expect(resolveMeleeDropRearmWeapon("pistol", true)).toBe("pistol");
    expect(resolveMeleeDropRearmWeapon("sniper", true)).toBe("sniper");
    expect(resolveMeleeDropRearmWeapon("pistol", false)).toBeNull();
    expect(resolveMeleeDropRearmWeapon(null, true)).toBeNull();
  });

  it("can cycle to an owned gun after an unarmed melee drop unless holstering was explicit", () => {
    expect(shouldAutoRearmOwnedGunAfterMeleeDrop(null, true, false)).toBe(true);
    expect(shouldAutoRearmOwnedGunAfterMeleeDrop(null, false, false)).toBe(false);
    expect(shouldAutoRearmOwnedGunAfterMeleeDrop(null, true, true)).toBe(false);
    expect(shouldAutoRearmOwnedGunAfterMeleeDrop("pistol", true, false)).toBe(false);
  });
});

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

  it("keeps Warehouse eye adaptation dark without changing display exposure", () => {
    const warehouseLuminance = resolveHumanEyeAdaptationLuminance(1.25, true);
    const penthouseLuminance = resolveHumanEyeAdaptationLuminance(1.25, false);

    expect(warehouseLuminance).toBeCloseTo(0.35, 5);
    expect(resolveHumanEyePupilDiameter(warehouseLuminance)).toBeCloseTo(6.5, 5);
    expect(penthouseLuminance).toBeCloseTo(1.25, 5);
  });

  it("uses half-speed near accommodation while preserving far relaxation", () => {
    expect(resolveFocusAccommodationDamping(8, 2.5)).toBe(3.5);
    expect(resolveFocusAccommodationDamping(2.5, 8)).toBe(4.5);
  });

  it("slows accommodation modestly as the dark-adapted pupil dilates", () => {
    expect(resolveFocusAccommodationDamping(8, 2.5, 6.5)).toBeCloseTo(2.8, 5);
    expect(resolveFocusAccommodationDamping(2.5, 8, 6.5)).toBeCloseTo(3.6, 5);
    expect(resolveFocusAccommodationDamping(8, 2.5, 2.5)).toBe(3.5);
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
    expect(resolveZoomActivationEdge(false, true)).toBe(true);
    expect(resolveZoomActivationEdge(true, true)).toBe(false);
    expect(resolveZoomActivationEdge(true, false)).toBe(false);
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

  it("keeps cover through a temporary reload unzoom but clears it on jump", () => {
    expect(resolveCoverModeFromAimTransition(true, false, true, true)).toBe(true);
    expect(resolveCoverModeAfterJump(true, true)).toBe(false);
    expect(resolveCoverModeAfterJump(true, false)).toBe(true);
  });

  it("uses only A/D strafe input for cover lean", () => {
    expect(resolveCoverLeanInput(false, 1)).toBe(0);
    expect(resolveCoverLeanInput(true, 1)).toBe(1);
    expect(resolveCoverLeanInput(true, -1)).toBe(-1);
    expect(resolveCoverLeanInput(true, -0.4)).toBe(-0.4);
    expect(resolveCoverLeanInput(true, Number.POSITIVE_INFINITY)).toBe(0);
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

  it("returns the hidden upright toggle to run mode after an accepted jump", () => {
    expect(resolveWalkingModeAfterJump(true, true)).toBe(false);
    expect(resolveWalkingModeAfterJump(false, true)).toBe(false);
    expect(resolveWalkingModeAfterJump(true, false)).toBe(true);
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

describe("gun melee reload interruption", () => {
  it("allows gun melee to cancel an active reload", () => {
    expect(shouldInterruptReloadForMelee(true)).toBe(true);
    expect(shouldInterruptReloadForMelee(false)).toBe(false);
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

describe("shared reticle presentation", () => {
  const motion = {
    roll: 0.01,
    coverLeanRoll: 0.002,
    headBobLateral: 0.015,
    verticalOffset: -0.02,
    headBobPitch: 0.004,
    aimSwayX: 0.003,
    aimSwayY: -0.002,
    recoilYaw: 0.006,
    recoilPitch: -0.005,
  } as const;

  it("uses one immutable dot offset for visible CSS and aim NDC", () => {
    const presentation = resolveReticlePresentation({ x: 0.5, y: 0.6 }, motion, 800, 600);

    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.basePosition)).toBe(true);
    expect(Object.isFrozen(presentation.ringOffsetCssPixels)).toBe(true);
    expect(Object.isFrozen(presentation.dotOffsetCssPixels)).toBe(true);
    expect(Object.isFrozen(presentation.aimNdc)).toBe(true);
    expect(presentation.aimNdc.x).toBeCloseTo((presentation.dotOffsetCssPixels.x * 2) / 800, 12);
    expect(presentation.aimNdc.y).toBeCloseTo(
      -0.2 - (presentation.dotOffsetCssPixels.y * 2) / 600,
      12,
    );
  });

  it("updates only the base component when the configured position changes", () => {
    const first = resolveReticlePresentation({ x: 0.5, y: 0.6 }, motion, 800, 600);
    const moved = resolveReticlePresentation({ x: 0.25, y: 0.4 }, motion, 800, 600);

    expect(moved.ringOffsetCssPixels).toEqual(first.ringOffsetCssPixels);
    expect(moved.dotOffsetCssPixels).toEqual(first.dotOffsetCssPixels);
    expect(moved.aimNdc.x - first.aimNdc.x).toBeCloseTo(-0.5, 12);
    expect(moved.aimNdc.y - first.aimNdc.y).toBeCloseTo(0.4, 12);
  });

  it("keeps the visible and aim offsets exactly zero at full-O₂ rest", () => {
    const idleMotion = createCameraMotionDamper().update({
      deltaSeconds: 1 / 60,
      localAcceleration: { right: 0, forward: 0, up: 0 },
      movementMagnitude: 0,
      movementSpeedRatio: 0,
      oxygenRatio: 1,
      crouching: false,
      shiftEnabled: true,
      bobEnabled: true,
    });
    const presentation = resolveReticlePresentation(DEFAULT_RETICLE_POSITION, idleMotion, 800, 600);

    expect(presentation.ringOffsetCssPixels).toEqual({ x: 0, y: 0 });
    expect(presentation.dotOffsetCssPixels).toEqual({ x: 0, y: 0 });
    expect(presentation.aimNdc).toEqual(
      resolveReticleAimNdc(DEFAULT_RETICLE_POSITION, { x: 0, y: 0 }, 800, 600),
    );
  });

  it("aims the held viewmodel at the same reticle ray without a second sway phase", () => {
    const camera = new THREE.PerspectiveCamera(75, 4 / 3, 0.05, 100);
    camera.position.set(2, 1.75, 3);
    camera.lookAt(0, 1.2, -4);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const presentation = resolveReticlePresentation({ x: 0.44, y: 0.63 }, motion, 800, 600);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(presentation.aimNdc.x, presentation.aimNdc.y),
      camera,
    );
    const aimRay = {
      origin: raycaster.ray.origin,
      direction: raycaster.ray.direction,
    } as const;
    const firstTarget = resolveViewmodelAimTargetLocal(camera.matrixWorldInverse, aimRay, 64);
    const secondTarget = resolveViewmodelAimTargetLocal(camera.matrixWorldInverse, aimRay, 64);
    const projected = firstTarget.clone().applyMatrix4(camera.matrixWorld).project(camera);

    expect(secondTarget).toEqual(firstTarget);
    expect(projected.x).toBeCloseTo(presentation.aimNdc.x, 10);
    expect(projected.y).toBeCloseTo(presentation.aimNdc.y, 10);
  });

  it("selects reticle and viewmodel consumers from one shot snapshot", () => {
    const damper = createCameraMotionDamper();
    damper.update({
      deltaSeconds: 1 / 60,
      localAcceleration: { right: 0, forward: 0, up: 0 },
      movementMagnitude: 0,
      movementSpeedRatio: 0,
      oxygenRatio: 1,
      crouching: false,
      shiftEnabled: true,
      bobEnabled: true,
    });
    const shotMotion = damper.applyWeaponShotImpulse({
      damage: 100,
      reticleOffset: { x: 24, y: -12 },
    });
    const presentation = resolveFirstPersonPresentation(
      DEFAULT_RETICLE_POSITION,
      shotMotion,
      800,
      600,
    );

    expect(Object.isFrozen(presentation)).toBe(true);
    expect(presentation.reticle).toEqual(
      resolveReticlePresentation(DEFAULT_RETICLE_POSITION, shotMotion, 800, 600),
    );
    expect(presentation.viewmodelOffset).toBe(shotMotion.viewmodelOffset);
    expect(presentation.viewmodelRecoilDepth).toBe(shotMotion.viewmodelRecoilDepth);
    expect(presentation.viewmodelTransition).toBe(shotMotion.viewmodelTransition);
    expect(presentation.viewmodelRecoilDepth).toBeGreaterThan(0);
    expect(Object.keys(presentation).sort()).toEqual(
      ["reticle", "viewmodelOffset", "viewmodelRecoilDepth", "viewmodelTransition"].sort(),
    );
    expect(presentation).not.toHaveProperty("weaponSway");
  });
});

describe("pre-action aim snapshots", () => {
  it("retains ray A after the live aim vectors advance to ray B", () => {
    const liveAimRay = {
      origin: new THREE.Vector3(1, 2, 3),
      direction: new THREE.Vector3(0.25, -0.5, -1),
    };
    const actionAimRay = snapshotActionAimRay(liveAimRay);

    liveAimRay.origin.set(10, 20, 30);
    liveAimRay.direction.set(-1, 0.5, 0.25);

    expect(actionAimRay.origin).not.toBe(liveAimRay.origin);
    expect(actionAimRay.direction).not.toBe(liveAimRay.direction);
    expect(actionAimRay.origin.toArray()).toEqual([1, 2, 3]);
    expect(actionAimRay.direction.toArray()).toEqual([0.25, -0.5, -1]);
  });

  it("prevents a retained pickup-melee ray from resolving after death", () => {
    const cancelled = resolveCancelledMeleeSwing({
      fireHeld: true,
      swinging: true,
      elapsedSeconds: 0.2,
      durationSeconds: 0.8,
      hitResolved: false,
      aimRay: snapshotActionAimRay({
        origin: new THREE.Vector3(1, 2, 3),
        direction: new THREE.Vector3(0, 0, -1),
      }),
    });

    expect(cancelled).toEqual({
      fireHeld: false,
      swinging: false,
      elapsedSeconds: 0,
      durationSeconds: 0,
      hitResolved: false,
      aimRay: null,
    });
    expect(shouldResolveMeleeSwingImpact(cancelled, 1)).toBe(false);
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

describe("simulant shot payload", () => {
  it("uses the same per-projectile damage payload as the ordinary weapon path", () => {
    expect(resolveSimulantShotDamage(28)).toBe(28);
    expect(resolveSimulantShotDamage(16, 8)).toBe(128);
  });

  it("rejects non-finite or negative payload inputs", () => {
    expect(resolveSimulantShotDamage(Number.NaN, 8)).toBe(0);
    expect(resolveSimulantShotDamage(16, Number.NaN)).toBe(0);
    expect(resolveSimulantShotDamage(-16, 8)).toBe(0);
    expect(resolveSimulantShotDamage(16, -2)).toBe(0);
  });
});

describe("simulant melee player knockback", () => {
  it("pushes the player away from the contact direction", () => {
    expect(resolvePlayerKnockbackVelocity({ x: 0, y: 0, z: -1 }, 12)).toEqual({
      x: 0,
      y: 0,
      z: -12,
    });
  });

  it("accumulates repeated hits without exceeding the melee stopping-power cap", () => {
    const velocity = resolvePlayerKnockbackVelocity({ x: 1, y: 0, z: 0 }, 12, {
      x: 0,
      y: 0,
      z: -12,
    });
    expect(Math.hypot(velocity.x, velocity.z)).toBeLessThanOrEqual(18);
    expect(velocity.x).toBeGreaterThan(0);
    expect(velocity.z).toBeLessThan(0);
  });

  it("ignores malformed impulses and preserves finite horizontal velocity", () => {
    expect(
      resolvePlayerKnockbackVelocity({ x: Number.NaN, y: 0, z: 0 }, Number.NaN, {
        x: 2,
        y: 9,
        z: -3,
      }),
    ).toEqual({ x: 2, y: 0, z: -3 });
  });
});

describe("exploration chunk footprint", () => {
  it("preloads the central and edge chunks while omitting the four corners", () => {
    const scene = new THREE.Scene();
    const world = createExplorationWorld(scene, "compact-footprint-test");

    expect(EXPLORATION_WORLD_SIZE_METERS).toBe(250);
    expect(EXPLORATION_WORLD_HALF_SIZE).toBe(125);
    expect(EXPLORATION_CHUNK_SIZE).toBe(100);
    expect(EXPLORATION_CHUNKS_PER_SIDE).toBe(1.25);
    expect(world.getLoadedChunkCount()).toBe(5);
    const root = scene.getObjectByName("ExplorationWorldRoot");
    expect(root).not.toBeNull();
    expect(root?.getObjectByName("ExplorationChunk:-1:-1")).toBeUndefined();
    expect(root?.getObjectByName("ExplorationChunk:-1:1")).toBeUndefined();
    expect(root?.getObjectByName("ExplorationChunk:1:-1")).toBeUndefined();
    expect(root?.getObjectByName("ExplorationChunk:1:1")).toBeUndefined();
    expect(root?.getObjectByName("ExplorationChunk:0:0")).not.toBeUndefined();
    world.update(new THREE.Vector3(16, 0, 0));
    const expandedCount = world.getLoadedChunkCount();
    expect(expandedCount).toBe(5);

    world.update(new THREE.Vector3(0, 0, 0));
    expect(world.getLoadedChunkCount()).toBe(expandedCount);
    world.dispose();
  });

  it("keeps a moved dropped prop recoverable without moving its siblings", () => {
    const scene = new THREE.Scene();
    const world = createExplorationWorld(scene, "ragdoll-drop-bounds-test");
    const pickupsBefore = world.getMeleePickups();
    const pickup = pickupsBefore[0];
    if (pickup === undefined) {
      throw new Error("Expected at least one exploration melee pickup");
    }
    const sibling = pickupsBefore.find((candidate) => candidate.objectId !== pickup.objectId);
    if (sibling === undefined) {
      throw new Error("Expected a second exploration melee pickup");
    }
    const sourceMatrix = new THREE.Matrix4();
    pickup.mesh.getMatrixAt(pickup.index, sourceMatrix);
    const siblingMatrixBefore = new THREE.Matrix4();
    sibling.mesh.getMatrixAt(sibling.index, siblingMatrixBefore);
    const sourcePosition = new THREE.Vector3().setFromMatrixPosition(sourceMatrix);
    const dropPosition = new THREE.Vector3(
      sourcePosition.x < 0 ? EXPLORATION_WORLD_HALF_SIZE - 1 : -EXPLORATION_WORLD_HALF_SIZE + 1,
      1,
      sourcePosition.z < 0 ? EXPLORATION_WORLD_HALF_SIZE - 1 : -EXPLORATION_WORLD_HALF_SIZE + 1,
    );

    try {
      expect(world.equipMeleeObject(pickup.objectId)).not.toBeNull();
      expect(world.dropMeleeObject(pickup.objectId, dropPosition, 0)).toBe(true);

      const droppedMatrix = new THREE.Matrix4();
      pickup.mesh.getMatrixAt(pickup.index, droppedMatrix);
      const droppedPosition = new THREE.Vector3().setFromMatrixPosition(droppedMatrix);
      expect(pickup.mesh.boundingSphere?.containsPoint(droppedPosition)).toBe(true);

      const droppedBody = world.getPhysicsBoxes().find((box) => box.dynamicId === pickup.objectId);
      expect(droppedBody?.dynamic).toBe(true);
      expect(droppedBody?.rotationY).toBe(0);
      expect(droppedBody?.linearVelocity?.y).toBeGreaterThan(0);
      expect(
        Math.hypot(
          droppedBody?.angularVelocity?.x ?? 0,
          droppedBody?.angularVelocity?.y ?? 0,
          droppedBody?.angularVelocity?.z ?? 0,
        ),
      ).toBeGreaterThan(0);

      const droppedPickup = world
        .getMeleePickups()
        .find((candidate) => candidate.objectId === pickup.objectId);
      expect(droppedPickup).toBeDefined();
      const siblingMatrixAfterDrop = new THREE.Matrix4();
      sibling.mesh.getMatrixAt(sibling.index, siblingMatrixAfterDrop);
      expect(siblingMatrixAfterDrop.equals(siblingMatrixBefore)).toBe(true);

      expect(world.equipMeleeObject(pickup.objectId)).not.toBeNull();
      expect(
        world.getMeleePickups().some((candidate) => candidate.objectId === pickup.objectId),
      ).toBe(false);
      expect(world.getPhysicsBoxes().some((box) => box.dynamicId === pickup.objectId)).toBe(false);
    } finally {
      world.dispose();
    }
  });

  it("keeps melee- and collision-toppled props available as weapons", () => {
    const scene = new THREE.Scene();
    const world = createExplorationWorld(scene, "toppled-prop-weapon-test");
    const initialPickup = world.getMeleePickups()[0];
    if (initialPickup === undefined) {
      throw new Error("Expected at least one exploration melee pickup");
    }

    try {
      expect(
        world.applyMeleeHit(
          initialPickup.objectId,
          { x: 0, y: 0, z: -1 },
          initialPickup.snapshot.swingSpeedRadiansPerSecond,
        ),
      ).toBe(true);
      expect(
        world.getMeleePickups().some((candidate) => candidate.objectId === initialPickup.objectId),
      ).toBe(true);
      expect(world.equipMeleeObject(initialPickup.objectId)).not.toBeNull();

      const collisionPickup = world
        .getMeleePickups()
        .find(
          (candidate) =>
            candidate.objectId !== initialPickup.objectId && candidate.halfExtents.y <= 0.9,
        );
      if (collisionPickup === undefined) {
        throw new Error("Expected a collision-topplable exploration melee pickup");
      }
      const collisionMatrix = new THREE.Matrix4();
      collisionPickup.mesh.getMatrixAt(collisionPickup.index, collisionMatrix);
      const collisionPosition = new THREE.Vector3().setFromMatrixPosition(collisionMatrix);
      world.updateKnockables(
        1 / 60,
        new THREE.Vector3(collisionPosition.x - 0.45, collisionPosition.y, collisionPosition.z),
        { x: 0.45, y: 0, z: 0 },
        1,
        true,
      );
      expect(
        world
          .getMeleePickups()
          .some((candidate) => candidate.objectId === collisionPickup.objectId),
      ).toBe(true);
      expect(world.equipMeleeObject(collisionPickup.objectId)).not.toBeNull();
    } finally {
      world.dispose();
    }
  });

  it("loads only deterministic warehouse melee props on Debugging 02", () => {
    const scene = new THREE.Scene();
    const map = createDebuggingTwoMap(scene, "warehouse-melee-test");
    const world = createExplorationWorld(scene, "warehouse-melee-test", undefined, undefined, map);
    try {
      expect(world.getLoadedChunkCount()).toBe(1);
      expect(world.getArea()).toBe("Ice-blue data center");
      const pickups = world.getMeleePickups();
      expect(pickups).toHaveLength(map.meleeObjects.length);
      expect(map.meleeObjects.map((spawn) => [spawn.kind, spawn.displayName])).toEqual([
        ["crowbar", "Warehouse Crowbar"],
        ["steel-pipe", "Warehouse Steel Pipe"],
        ["fire-extinguisher", "Warehouse Fire Extinguisher"],
        ["pipe-wrench", "Warehouse Pipe Wrench"],
        ["hammer", "Warehouse Hammer"],
        ["screwdriver", "Warehouse Screwdriver"],
        ["fireman-axe", "Warehouse Fireman Axe"],
        ["box-cutter", "Warehouse Box Cutter"],
      ]);
      const geometryKinds = pickups.map((pickup) => {
        const kind = pickup.mesh.geometry.userData.warehouseMeleeKind as unknown;
        return typeof kind === "string" ? kind : null;
      });
      expect(geometryKinds).toEqual(map.meleeObjects.map((spawn) => spawn.kind));
      expect(pickups.map((pickup) => pickup.snapshot.displayName)).toEqual(
        map.meleeObjects.map((spawn) => spawn.displayName),
      );
      expect(world.getPhysicsBoxes()).toHaveLength(
        map.physicsBoxes.length + map.meleeObjects.length,
      );
      const cityObjectNames: string[] = [];
      scene.traverse((object) => {
        if (
          object.name.startsWith("City") ||
          object.name.startsWith("Skybridge") ||
          object.name.startsWith("ExplorationProp")
        ) {
          cityObjectNames.push(object.name);
        }
      });
      expect(cityObjectNames).toEqual([]);

      const firstPickup = pickups[0];
      if (firstPickup === undefined) {
        throw new Error("Expected a warehouse melee pickup");
      }
      expect(
        world.applyMeleeHit(
          firstPickup.objectId,
          { x: 0, y: 0, z: -1 },
          firstPickup.snapshot.swingSpeedRadiansPerSecond,
          firstPickup.snapshot.stoppingPower,
        ),
      ).toBe(true);
      const firstBody = world
        .getPhysicsBoxes()
        .find((box) => box.dynamicId === firstPickup.objectId);
      expect(firstBody?.dynamic).toBe(true);
      expect(Math.hypot(firstBody?.linearVelocity?.x ?? 0, firstBody?.linearVelocity?.z ?? 0)).toBe(
        firstPickup.snapshot.stoppingPower,
      );
    } finally {
      world.dispose();
    }
  });

  it("releases a server and the supported servers above it into physics", () => {
    const scene = new THREE.Scene();
    const map = createDebuggingTwoMap(scene, "warehouse-server-stack-impact-test");
    const world = createExplorationWorld(
      scene,
      "warehouse-server-stack-impact-test",
      undefined,
      undefined,
      map,
    );
    try {
      const supportIndex = map.physicsBoxes.findIndex((box) =>
        map.physicsBoxes.some(
          (candidate) =>
            Math.abs(candidate.center.x - box.center.x) < 0.000001 &&
            Math.abs(candidate.center.z - box.center.z) < 0.000001 &&
            candidate.center.y > box.center.y &&
            Math.abs(candidate.center.y - (box.center.y + DEBUGGING_TWO_BOX_STACK_PITCH)) <
              0.000001,
        ),
      );
      if (supportIndex < 0) {
        throw new Error("Expected a supported Warehouse server stack");
      }
      const upperIndex = map.physicsBoxes.findIndex(
        (candidate) =>
          Math.abs(candidate.center.x - (map.physicsBoxes[supportIndex]?.center.x ?? 0)) <
            0.000001 &&
          Math.abs(candidate.center.z - (map.physicsBoxes[supportIndex]?.center.z ?? 0)) <
            0.000001 &&
          Math.abs(
            candidate.center.y -
              ((map.physicsBoxes[supportIndex]?.center.y ?? 0) + DEBUGGING_TWO_BOX_STACK_PITCH),
          ) < 0.000001,
      );
      if (upperIndex < 0) {
        throw new Error("Expected an upper server in the supported stack");
      }
      const rackObject = map.rackBodyMesh;
      const supportId = world.getRagdollObjectIdForHit(rackObject, supportIndex);
      const upperId = world.getRagdollObjectIdForHit(rackObject, upperIndex);
      expect(supportId).not.toBeNull();
      expect(upperId).not.toBeNull();
      if (supportId === null || upperId === null) {
        throw new Error("Expected Warehouse rack physics IDs");
      }
      const rackRoot = map.root.getObjectByName("DebuggingTwoDataCenterRacks");
      const ledMeshes =
        rackRoot?.children.filter(
          (child): child is THREE.InstancedMesh =>
            child instanceof THREE.InstancedMesh && child.userData.rackLed === true,
        ) ?? [];
      const supportBodyBefore = new THREE.Matrix4();
      map.rackBodyMesh.getMatrixAt(supportIndex, supportBodyBefore);
      const supportPositionBefore = new THREE.Vector3();
      const supportRotationBefore = new THREE.Quaternion();
      const supportScaleBefore = new THREE.Vector3();
      supportBodyBefore.decompose(supportPositionBefore, supportRotationBefore, supportScaleBefore);
      let trackedLed: THREE.InstancedMesh | undefined;
      let trackedLedIndex = -1;
      let trackedLedDistance = Number.POSITIVE_INFINITY;
      const candidateLedMatrix = new THREE.Matrix4();
      const candidateLedPosition = new THREE.Vector3();
      for (const ledMesh of ledMeshes) {
        for (let index = 0; index < ledMesh.count; index += 1) {
          ledMesh.getMatrixAt(index, candidateLedMatrix);
          candidateLedMatrix.decompose(
            candidateLedPosition,
            new THREE.Quaternion(),
            new THREE.Vector3(),
          );
          const distance = candidateLedPosition.distanceTo(supportPositionBefore);
          if (distance < trackedLedDistance) {
            trackedLed = ledMesh;
            trackedLedIndex = index;
            trackedLedDistance = distance;
          }
        }
      }
      if (trackedLed === undefined || trackedLedIndex < 0) {
        throw new Error("Expected a rack LED to track during impact");
      }

      const ledBeforeImpact = new THREE.Matrix4();
      trackedLed.getMatrixAt(trackedLedIndex, ledBeforeImpact);
      const ledScaleBeforeImpact = new THREE.Vector3();
      ledBeforeImpact.decompose(new THREE.Vector3(), new THREE.Quaternion(), ledScaleBeforeImpact);
      expect(ledScaleBeforeImpact.length()).toBeGreaterThan(0.9);

      expect(world.applyProjectileHit(supportId, { x: 1, y: 0, z: 0 }, 2)).toBe(true);
      const dynamicIds = new Set(
        world
          .getPhysicsBoxes()
          .filter((box) => box.dynamic === true)
          .map((box) => box.dynamicId),
      );
      expect(dynamicIds.has(supportId)).toBe(true);
      expect(dynamicIds.has(upperId)).toBe(true);

      const ledAfterImpact = new THREE.Matrix4();
      trackedLed.getMatrixAt(trackedLedIndex, ledAfterImpact);
      // Three.js decomposes a singular zero-scale matrix as unit scale because
      // its rotation basis is undefined; inspect the matrix columns instead.
      expect(ledAfterImpact.getMaxScaleOnAxis()).toBeCloseTo(0, 6);
      const localLed = supportBodyBefore.clone().invert().multiply(ledAfterImpact);

      world.updateKnockables(1 / 60, new THREE.Vector3(), { x: 0, y: 0, z: 0 }, 0, true);

      const supportBodyAfter = new THREE.Matrix4();
      map.rackBodyMesh.getMatrixAt(supportIndex, supportBodyAfter);
      const expectedLedAfter = supportBodyAfter.clone().multiply(localLed);
      const actualLedAfter = new THREE.Matrix4();
      trackedLed.getMatrixAt(trackedLedIndex, actualLedAfter);
      expectedLedAfter.elements.forEach((value, index) => {
        expect(actualLedAfter.elements[index]).toBeCloseTo(value, 4);
      });
    } finally {
      world.dispose();
    }
  });

  it("lets a simulant target the lowest rack beneath a grounded player", () => {
    const scene = new THREE.Scene();
    const map = createDebuggingTwoMap(scene, "warehouse-simulant-support-target-test");
    const world = createExplorationWorld(
      scene,
      "warehouse-simulant-support-target-test",
      undefined,
      undefined,
      map,
    );
    try {
      const columns = new Map<string, { readonly box: PhysicsBox; readonly index: number }[]>();
      map.physicsBoxes.forEach((box, index) => {
        const key = `${String(box.center.x)}:${String(box.center.z)}`;
        const column = columns.get(key) ?? [];
        column.push({ box, index });
        columns.set(key, column);
      });
      const column = [...columns.values()]
        .filter((candidate) => candidate.length >= 3)
        .sort((left, right) => right.length - left.length)[0];
      if (column === undefined) {
        throw new Error("Expected a tall Warehouse rack column");
      }
      column.sort((left, right) => left.box.center.y - right.box.center.y);
      const top = column[column.length - 1];
      const lowest = column[0];
      if (top === undefined || lowest === undefined) {
        throw new Error("Expected a non-empty Warehouse rack column");
      }
      const target = world.getMeleeSupportTarget({
        x: top.box.center.x,
        y: top.box.center.y + top.box.halfExtents.y + PLAYER_CAPSULE_CENTER_HEIGHT,
        z: top.box.center.z,
      });
      expect(target).not.toBeNull();
      if (target === null) {
        throw new Error("Expected a support rack target");
      }
      const lowestId = world.getRagdollObjectIdForHit(map.rackBodyMesh, lowest.index);
      expect(lowestId).not.toBeNull();
      expect(target.objectId).toBe(lowestId);
      expect(world.applyMeleeHit(target.objectId, { x: 0, y: 0, z: -1 }, 4, 8)).toBe(true);
      const dynamicIds = new Set(
        world
          .getPhysicsBoxes()
          .filter((box) => box.dynamic === true)
          .map((box) => box.dynamicId),
      );
      expect(dynamicIds.has(target.objectId)).toBe(true);
      expect(
        dynamicIds.has(world.getRagdollObjectIdForHit(map.rackBodyMesh, top.index) ?? -1),
      ).toBe(true);
    } finally {
      world.dispose();
    }
  });

  it("starts a ragdoll and accumulates one stopping-power impulse per bullet", () => {
    const scene = new THREE.Scene();
    const world = createExplorationWorld(scene, "projectile-ragdoll-stopping-power-test");
    const pickup = world.getMeleePickups()[0];
    if (pickup === undefined) {
      throw new Error("Expected an exploration melee pickup");
    }

    try {
      const objectId = world.getRagdollObjectIdForHit(pickup.mesh, pickup.index);
      expect(objectId).toBe(pickup.objectId);
      if (objectId === null) {
        throw new Error("Expected the pickup to resolve as a ragdoll object");
      }
      const perBulletPower = 16 * 0.065;
      expect(world.applyProjectileHit(objectId, { x: 1, y: 0, z: 0 }, perBulletPower)).toBe(true);
      expect(world.applyProjectileHit(objectId, { x: 1, y: 0, z: 0 }, perBulletPower)).toBe(true);

      const dynamicBody = world.getPhysicsBoxes().find((box) => box.dynamicId === pickup.objectId);
      expect(dynamicBody?.dynamic).toBe(true);
      expect(dynamicBody?.linearVelocity?.x).toBeCloseTo(perBulletPower * 2, 8);
      expect(dynamicBody?.linearVelocity?.y).toBeGreaterThan(0);
      expect(dynamicBody?.angularVelocity?.z).toBeLessThan(0);
    } finally {
      world.dispose();
    }
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

describe("ledge vaulting helpers", () => {
  it("maps leg-height vaults to an instant transition and two metres to one second", () => {
    expect(resolveVaultTraversalDuration(0.45)).toBeCloseTo(0.04, 6);
    expect(resolveVaultTraversalDuration(2)).toBeCloseTo(1, 6);
    expect(resolveVaultTraversalDuration(1)).toBeGreaterThan(0.04);
    expect(resolveVaultTraversalDuration(1)).toBeLessThan(1);
    expect(resolveVaultTraversalArcHeight(0.45)).toBeCloseTo(0.03, 6);
    expect(resolveVaultTraversalArcHeight(2)).toBeCloseTo(0.24, 6);
  });

  it("scales a maximum traversal from slow empty O₂ to fast full O₂", () => {
    const maximumDuration = resolveVaultTraversalDuration(2);

    expect(maximumDuration).toBeCloseTo(1, 6);
    expect(resolveO2ScaledTraversalDuration(maximumDuration, 1)).toBeCloseTo(0.5, 6);
    expect(resolveO2ScaledTraversalDuration(maximumDuration, 0.5)).toBeCloseTo(2 ** -0.5, 6);
    expect(resolveO2ScaledTraversalDuration(maximumDuration, 0)).toBeCloseTo(1, 6);
  });

  it("charges traversal O₂ continuously from the minimum vault to two metres", () => {
    expect(resolveVaultTraversalO2Cost(0.1)).toBe(0);
    expect(resolveVaultTraversalO2Cost(0.15)).toBeCloseTo(0, 8);
    expect(resolveVaultTraversalO2Cost(1.075)).toBeCloseTo(O2_LANDING_BASE_COST / 4, 8);
    expect(resolveVaultTraversalO2Cost(2)).toBeCloseTo(O2_LANDING_BASE_COST / 2, 8);
    expect(resolveVaultTraversalO2Cost(3)).toBeCloseTo(O2_LANDING_BASE_COST / 2, 8);
    expect(resolveVaultTraversalO2Cost(Number.NaN)).toBe(0);
  });

  it("keeps a procedural rotated box on the same local vault path", () => {
    const target = resolveVaultTarget({ x: 0.8, y: 0.86, z: -0.5 }, { x: 0, y: 0, z: 0.75 }, 0, [
      {
        center: { x: 0, y: 0.5, z: 0 },
        halfExtents: { x: 0.2, y: 0.5, z: 2 },
        rotationY: Math.PI / 2,
      },
    ]);

    expect(target).not.toBeNull();
    expect(target?.y).toBeCloseTo(1.86, 6);
    expect(target?.x).toBeCloseTo(0.8, 6);
    expect(target?.z).toBeGreaterThanOrEqual(-2 + 0.06);
    expect(target?.z).toBeLessThanOrEqual(2 - 0.06);
  });

  it("publishes the measured climbing-gym height row in ascending order", () => {
    expect(CLIMBING_GYM_VAULT_HEIGHTS).toHaveLength(50);
    expect(CLIMBING_GYM_VAULT_HEIGHTS[0]).toBeCloseTo(0.1, 6);
    for (let index = 1; index < CLIMBING_GYM_VAULT_HEIGHTS.length; index += 1) {
      const previous = CLIMBING_GYM_VAULT_HEIGHTS[index - 1];
      const current = CLIMBING_GYM_VAULT_HEIGHTS[index];
      if (previous === undefined || current === undefined) {
        throw new Error(`Missing climbing-gym height at index ${String(index)}`);
      }
      expect(current - previous).toBeCloseTo(0.1, 6);
    }
    expect(CLIMBING_GYM_VAULT_HEIGHTS.at(-1)).toBeCloseTo(5, 6);
    expect(CLIMBING_GYM_STANDING_EYE_HEIGHT).toBeCloseTo(1.75, 6);
    expect(CLIMBING_GYM_VAULT_HEIGHTS.at(-1)).toBeGreaterThan(CLIMBING_GYM_STANDING_EYE_HEIGHT);
  });

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

  it("keeps a rotated ledge target in the collider's local landing footprint", () => {
    const fromPosition: PhysicsVector = { x: 0.8, y: 0.86, z: -0.6 };
    const target = resolveLedgeGrabTarget(
      fromPosition,
      { x: 0, y: 0, z: 0.6 },
      0,
      [
        {
          center: { x: 0, y: 0.75, z: 0 },
          halfExtents: { x: 0.5, y: 0.75, z: 2 },
          rotationY: Math.PI / 2,
        },
      ],
      [],
    );

    expect(target).not.toBeNull();
    expect(target?.x).toBeCloseTo(0.8, 6);
    expect(target?.z).toBeCloseTo(0.16, 6);
    expect(target?.y).toBeCloseTo(2.36, 6);
  });

  it("bounds composed head motion between support and a rotated ceiling", () => {
    const bounds = resolveCameraVerticalOffsetBounds({ x: 0, y: 0.86, z: 0 }, 1.75, [
      {
        center: { x: 0, y: 2.15, z: 0 },
        halfExtents: { x: 1, y: 0.25, z: 0.2 },
        rotationY: Math.PI / 4,
      },
    ]);

    expect(bounds.min).toBeCloseTo(-1.75, 8);
    expect(bounds.max).toBeCloseTo(0.15 - WORLD_EPSILON, 8);
  });

  it("locks ledge transition camera to a 1.75m eye height", () => {
    expect(resolveLedgeClimbTargetCameraY(1.86)).toBeCloseTo(2.75);
    expect(LEDGE_CLIMB_EYE_HEIGHT_METERS).toBe(1.75);
  });

  it("captures at least sprint momentum at vault start", () => {
    const moveSpeed = PLAYER_MOVE_SPEED_METERS_PER_SECOND;
    const momentum = resolveLedgeClimbMomentum(0.2, 0, 0, 0, true, moveSpeed);
    expect(
      Math.hypot(momentum.preservedForwardVelocity, momentum.preservedStrafeVelocity),
    ).toBeCloseTo(PLAYER_SPRINT_SPEED_METERS_PER_SECOND, 2);
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

    expect(WALL_HANG_MIN_TOP).toBe(2);
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
      center: { x: 0, y: 2.64, z: -4 },
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

    const target = resolveWallHangTarget({ x: 0, y: 2.05, z: -4.29 }, { x: 0, y: 0, z: -1 }, [
      thinPlatform,
    ]);

    expect(target).not.toBeNull();
    expect(target?.z).toBeCloseTo(-3.5 + 0.26 + 0.01, 6);
    expect(target?.y).toBeCloseTo(2.05, 6);
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
    const target = resolveWallHangTarget({ x: 0, y: 2.05, z: -4.29 }, { x: 0, y: 0, z: -1 }, [
      wall,
    ]);

    expect(target).not.toBeNull();
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
      center: { x: -70, y: 1.95, z: -12 },
      halfExtents: { x: 0.25, y: 1.9, z: 3 },
    };
    const resolution = resolveWallHangTargetDetails(
      { x: -70.64, y: 2.7, z: -12 },
      { x: 1, y: 0, z: 0 },
      [wall],
    );

    expect(resolution).not.toBeNull();
    expect(resolution?.target.x).toBeCloseTo(-70.52, 6);
    expect(resolution?.target.y).toBeCloseTo(2.7, 6);
    expect(resolution?.target.z).toBeCloseTo(-12, 6);
    expect(resolution?.wallFacePoint.x).toBeCloseTo(-70.25, 6);
  });

  it("keeps the caught point when climbing a long skinny wall", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 2, z: -4 },
      halfExtents: { x: 3, y: 2, z: 0.1 },
    };
    const resolution = resolveWallHangTargetDetails(
      { x: 0.8, y: 2.7, z: -3.5 },
      { x: 0, y: 0, z: -1 },
      [wall],
    );

    expect(resolution).not.toBeNull();
    const target = resolution === null ? null : resolveWallClimbTarget(resolution);
    expect(target?.x).toBeCloseTo(0.8, 6);
    // The wall is thinner than the capsule diameter, so there is no safe
    // inset on its normal axis. The landing falls back to the wall centre;
    // the caught tangent coordinate above is the behaviour under test.
    expect(target?.z).toBeCloseTo(-4, 6);
  });

  it("resolves rotated generated walls in the same frame as their collider", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 2, z: -4 },
      halfExtents: { x: 0.2, y: 2, z: 2 },
      rotationY: Math.PI / 2,
    };
    const resolution = resolveWallHangTargetDetails(
      { x: 0.8, y: 2.7, z: -3.5 },
      { x: 0, y: 0, z: -1 },
      [wall],
    );

    expect(resolution).not.toBeNull();
    expect(resolution?.target.z).toBeCloseTo(-3.53, 6);
    const target = resolution === null ? null : resolveWallClimbTarget(resolution);
    expect(target?.x).toBeCloseTo(0.8, 6);
    // The rotated wall is thinner than the capsule diameter, so its normal
    // coordinate correctly falls back to the only supported top point; the
    // lateral catch coordinate must still remain at x=0.8.
    expect(target?.z).toBeCloseTo(-4, 6);
  });
});

describe("coarse scene collision extraction", () => {
  it("chooses a validated last-safe capsule position for geometry recovery", () => {
    const blockingWall: PhysicsBox = {
      center: { x: 0, y: 0.86, z: 0 },
      halfExtents: { x: 0.5, y: 0.86, z: 0.5 },
    };
    const fallback = { x: 2, y: PLAYER_CAPSULE_CENTER_HEIGHT, z: 0 };

    expect(
      resolvePlayerRecoveryPosition({ x: 0, y: PLAYER_CAPSULE_CENTER_HEIGHT, z: 0 }, fallback, [
        blockingWall,
      ]),
    ).toEqual(fallback);
    expect(resolvePlayerRecoveryPosition(null, fallback, [blockingWall])).toEqual(fallback);
  });

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

describe("weapon raycast surface filtering", () => {
  it("lets bullets pass through the warehouse lighting group but keeps structure hittable", () => {
    const scene = new THREE.Scene();
    createDebuggingTwoMap(scene, "warehouse-light-raycast-test");

    const spotlightShaft = scene.getObjectByName("WarehouseQuadrantSpotlightShaft:north-west");
    const warehouseWall = scene.getObjectByName("WarehouseWallNorth");
    const serverRackBody = scene.getObjectByName("DataCenterRackBodies");
    if (
      spotlightShaft === undefined ||
      warehouseWall === undefined ||
      serverRackBody === undefined
    ) {
      throw new Error("Expected Warehouse lighting and structure meshes");
    }

    expect(isWeaponRaycastSurface(spotlightShaft)).toBe(false);
    expect(isWeaponRaycastSurface(warehouseWall)).toBe(true);
    expect(isWeaponRaycastSurface(serverRackBody)).toBe(true);
  });
});
