import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  MOTIONBRICKS_FPS,
  MOTIONBRICKS_SOURCE,
  sampleMotionBricksClip,
} from "./motionbricks-clip.js";
import {
  advanceStickFigurePhase,
  applyStickFigureAnimationPose,
  createStickFigureBody,
  resolveStickFigureAnimationPose,
  resolveStickFigureMotionClip,
  STICK_FIGURE_HEIGHT_METERS,
} from "./player-stick-figure.js";

describe("procedural stick-figure motion", () => {
  it("selects the matching MotionBricks clip for each runtime actor state", () => {
    expect(
      resolveStickFigureMotionClip({ moving: false, meleeSwinging: false, weapon: "none" }),
    ).toBe("idle");
    expect(
      resolveStickFigureMotionClip({ moving: true, meleeSwinging: false, weapon: "none" }),
    ).toBe("walk");
    expect(
      resolveStickFigureMotionClip({ moving: false, meleeSwinging: false, weapon: "gun" }),
    ).toBe("walk_gun");
    expect(resolveStickFigureMotionClip({ moving: true, meleeSwinging: true, weapon: "gun" })).toBe(
      "walk_boxing",
    );
  });

  it("keeps the phase deterministic and bounded for invalid frame inputs", () => {
    expect(advanceStickFigurePhase(1, 1 / 60, 0.5, 1, false)).toBeCloseTo(1.0341666667, 8);
    expect(advanceStickFigurePhase(Number.NaN, Number.POSITIVE_INFINITY, 2, -1, true)).toBe(0);
  });

  it("uses opposite leg and arm phases for a grounded gait", () => {
    const pose = resolveStickFigureAnimationPose({
      phaseSeconds: Math.PI / 10.8,
      activity: "walk",
      movementMagnitude: 1,
      speedRatio: 0.5,
      grounded: true,
      seated: false,
      headYaw: 0,
      headPitch: 0,
      interaction: 0,
    });

    expect(pose.leftLegPitch).toBeCloseTo(-pose.rightLegPitch, 5);
    expect(pose.leftArmPitch).toBeCloseTo(-pose.rightArmPitch, 5);
    expect(Math.abs(pose.leftLegPitch)).toBeGreaterThan(0.05);
  });

  it("keeps a seated figure grounded while breathing and reaching", () => {
    const idle = resolveStickFigureAnimationPose({
      phaseSeconds: 0.7,
      activity: "idle",
      movementMagnitude: 0,
      speedRatio: 0,
      grounded: true,
      seated: true,
      headYaw: 0.2,
      headPitch: -0.1,
      interaction: 0,
    });
    const reaching = resolveStickFigureAnimationPose({
      phaseSeconds: 0.7,
      activity: "idle",
      movementMagnitude: 0,
      speedRatio: 0,
      grounded: true,
      seated: true,
      headYaw: 0.2,
      headPitch: -0.1,
      interaction: 1,
    });

    expect(idle.leftLowerLegPitch).toBeGreaterThan(1);
    expect(reaching.leftForearmPitch).toBeGreaterThan(idle.leftForearmPitch);
    expect(reaching.rootBob).not.toBe(0);
    for (const value of Object.values(reaching)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("builds named hit-zone pivots and applies a pose without losing height", () => {
    const rig = createStickFigureBody({ color: 0x00ffff, name: "TestStickFigure" });
    const pose = resolveStickFigureAnimationPose({
      phaseSeconds: 0.4,
      activity: "strike",
      movementMagnitude: 0.8,
      speedRatio: 0.7,
      grounded: true,
      seated: false,
      headYaw: 0.1,
      headPitch: 0,
      interaction: 0,
    });
    applyStickFigureAnimationPose(rig, pose);
    expect(rig.root.name).toBe("TestStickFigure");
    expect(rig.root.scale.y * 1.1).toBeCloseTo(STICK_FIGURE_HEIGHT_METERS, 6);
    expect(rig.parts.head.userData.combatHitZone).toBe("head");
    expect(rig.parts.leftArm.userData.ragdollPart).toBe("leftArm");
    expect(rig.joints.rightForearm.rotation.x).not.toBe(0);
  });

  it("keeps the head attached to the torso while MotionBricks changes torso lean", () => {
    const rig = createStickFigureBody({ color: 0x00ffff, name: "AttachedHeadFigure" });
    const uprightInput = {
      phaseSeconds: 0,
      activity: "idle",
      movementMagnitude: 0,
      speedRatio: 0,
      grounded: true,
      seated: true,
      headYaw: 0,
      headPitch: 0,
      interaction: 0,
      motionClip: "idle",
    } as const;
    const upright = resolveStickFigureAnimationPose(uprightInput);
    const leaning = resolveStickFigureAnimationPose({
      ...uprightInput,
      phaseSeconds: 0.4,
      motionClip: "walk_boxing",
    });
    const uprightHead = new THREE.Vector3();
    const leaningHead = new THREE.Vector3();
    applyStickFigureAnimationPose(rig, upright);
    rig.root.updateMatrixWorld(true);
    rig.parts.head.getWorldPosition(uprightHead);
    applyStickFigureAnimationPose(rig, leaning);
    rig.root.updateMatrixWorld(true);
    rig.parts.head.getWorldPosition(leaningHead);

    expect(rig.parts.head.parent).toBe(rig.parts.torso);
    expect(leaningHead.distanceTo(uprightHead)).toBeGreaterThan(0.001);
  });

  it("samples the pinned MotionBricks playback checkpoint as a deterministic loop", () => {
    const first = sampleMotionBricksClip("idle", 0);
    const looped = sampleMotionBricksClip("idle", 1);

    expect(MOTIONBRICKS_FPS).toBe(30);
    expect(MOTIONBRICKS_SOURCE.commit).toBe("1983e88888217f6c69283cf3a9d1af01e87f07af");
    expect(looped.pelvis).toEqual(first.pelvis);
    expect(looped.leftHand).toEqual(first.leftHand);
    expect(first.rootHeightOffset).toBe(0);
  });

  it("maps MotionBricks boxing joints onto the rig while keeping seated legs seated", () => {
    const walkingPose = resolveStickFigureAnimationPose({
      phaseSeconds: 0.16,
      activity: "strike",
      movementMagnitude: 1,
      speedRatio: 0.6,
      grounded: true,
      seated: false,
      headYaw: 0,
      headPitch: 0,
      interaction: 0,
      motionClip: "walk_boxing",
      motionPlaybackRate: 0.5,
    });
    const walkingTargets = walkingPose.motionBricksTargets;
    expect(walkingTargets?.applyLegTargets).toBe(true);
    const directionValues: readonly (boolean | readonly number[])[] = Object.values(
      walkingTargets ?? {},
    );
    for (const direction of directionValues) {
      if (typeof direction !== "boolean") {
        expect(direction.every((value: number) => Number.isFinite(value))).toBe(true);
      }
    }

    const rig = createStickFigureBody({ color: 0xff00ff, name: "MotionBricksFigure" });
    applyStickFigureAnimationPose(rig, walkingPose);
    expect(rig.parts.leftArm.quaternion.equals(rig.parts.rightArm.quaternion)).toBe(false);

    const seatedPose = resolveStickFigureAnimationPose({
      phaseSeconds: 0.4,
      activity: "idle",
      movementMagnitude: 0,
      speedRatio: 0,
      grounded: true,
      seated: true,
      headYaw: 0,
      headPitch: 0,
      interaction: 0,
      motionClip: "idle",
    });
    applyStickFigureAnimationPose(rig, seatedPose);
    expect(rig.parts.leftLeg.rotation.x).toBeCloseTo(seatedPose.leftLegPitch, 6);
    expect(seatedPose.motionBricksTargets?.applyLegTargets).toBe(false);
  });
});
