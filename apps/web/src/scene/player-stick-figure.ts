import * as THREE from "three";

import {
  sampleMotionBricksClip,
  type MotionBricksClipName,
  type MotionBricksVector3,
} from "./motionbricks-clip.js";

/** The six actor parts retained by the combat and deterministic ragdoll seams. */
export interface StickFigureBodyParts {
  readonly head: THREE.Object3D;
  readonly torso: THREE.Object3D;
  readonly leftArm: THREE.Object3D;
  readonly rightArm: THREE.Object3D;
  readonly leftLeg: THREE.Object3D;
  readonly rightLeg: THREE.Object3D;
}

/** Extra joint pivots used by the procedural animation layer. */
export interface StickFigureJoints {
  readonly leftForearm: THREE.Object3D;
  readonly rightForearm: THREE.Object3D;
  readonly leftLowerLeg: THREE.Object3D;
  readonly rightLowerLeg: THREE.Object3D;
}

export interface StickFigureRig {
  readonly root: THREE.Group;
  readonly parts: StickFigureBodyParts;
  readonly joints: StickFigureJoints;
}

export type StickFigureActivity = "idle" | "walk" | "strike";

export type StickFigureWeaponPose = "none" | "gun" | "melee";

export interface StickFigureMotionState {
  readonly moving: boolean;
  readonly meleeSwinging: boolean;
  readonly weapon: StickFigureWeaponPose;
}

/** Resolve the real MotionBricks clip used by a runtime actor state. */
export const resolveStickFigureMotionClip = (
  state: StickFigureMotionState,
): MotionBricksClipName => {
  if (state.meleeSwinging) {
    return "walk_boxing";
  }
  if (state.weapon === "gun") {
    return "walk_gun";
  }
  if (state.moving) {
    return "walk";
  }
  return "idle";
};

export interface StickFigureAnimationInput {
  /** Monotonic phase in seconds. It is caller-owned so the pose is replayable. */
  readonly phaseSeconds: number;
  readonly activity: StickFigureActivity;
  readonly movementMagnitude: number;
  readonly speedRatio: number;
  readonly grounded: boolean;
  readonly seated: boolean;
  /** Head look offsets in the actor's local frame. */
  readonly headYaw: number;
  readonly headPitch: number;
  /** A normalized reach weight for the hand nearest the table or target. */
  readonly interaction: number;
  /** MotionBricks playback clip used by runtime actors. */
  readonly motionClip?: MotionBricksClipName;
  readonly motionPlaybackRate?: number;
}

/** Normalized browser-space bone directions sampled from a MotionBricks clip. */
export interface StickFigureMotionBricksTargets {
  readonly applyLegTargets: boolean;
  readonly torso: MotionBricksVector3;
  readonly leftArm: MotionBricksVector3;
  readonly leftForearm: MotionBricksVector3;
  readonly leftLeg: MotionBricksVector3;
  readonly leftLowerLeg: MotionBricksVector3;
  readonly rightArm: MotionBricksVector3;
  readonly rightForearm: MotionBricksVector3;
  readonly rightLeg: MotionBricksVector3;
  readonly rightLowerLeg: MotionBricksVector3;
}

export interface StickFigureAnimationPose {
  readonly rootBob: number;
  readonly torsoPitch: number;
  readonly torsoRoll: number;
  readonly headPitch: number;
  readonly headYaw: number;
  readonly leftArmPitch: number;
  readonly leftArmRoll: number;
  readonly leftForearmPitch: number;
  readonly leftForearmRoll: number;
  readonly rightArmPitch: number;
  readonly rightArmRoll: number;
  readonly rightForearmPitch: number;
  readonly rightForearmRoll: number;
  readonly leftLegPitch: number;
  readonly leftLegRoll: number;
  readonly leftLowerLegPitch: number;
  readonly rightLegPitch: number;
  readonly rightLegRoll: number;
  readonly rightLowerLegPitch: number;
  readonly motionBricksTargets?: StickFigureMotionBricksTargets;
}

export interface StickFigureBodyOptions {
  readonly color: THREE.ColorRepresentation;
  readonly name?: string;
  /** Additional scale applied after the canonical 1.8 m actor scale. */
  readonly scale?: number;
}

export const STICK_FIGURE_HEIGHT_METERS = 1.8;
export const STICK_FIGURE_SOURCE_HEIGHT_METERS = 1.1;
export const STICK_FIGURE_SOURCE_FOOT_OFFSET_METERS = 0.05;

const BODY_SCALE = STICK_FIGURE_HEIGHT_METERS / STICK_FIGURE_SOURCE_HEIGHT_METERS;
const BONE_RADIUS = 0.035;
const JOINT_RADIUS = 0.065;
const HEAD_RADIUS = 0.12;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

const finite = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);

const createBone = (
  length: number,
  material: THREE.Material,
  part: "head" | "body",
  ragdollPart: string,
  direction: "down" | "up" = "down",
): THREE.Mesh => {
  const bone = new THREE.Mesh(
    new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, length, 8),
    material,
  );
  bone.position.y = direction === "up" ? length / 2 : -length / 2;
  bone.userData = { combatHitZone: part, ragdollPart };
  bone.castShadow = true;
  bone.receiveShadow = true;
  return bone;
};

const createJoint = (
  material: THREE.Material,
  part: "head" | "body",
  ragdollPart: string,
): THREE.Mesh => {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(JOINT_RADIUS, 8, 6), material);
  joint.userData = { combatHitZone: part, ragdollPart };
  joint.castShadow = true;
  joint.receiveShadow = true;
  return joint;
};

/**
 * Build a deliberately simple stick figure with real joint pivots.
 *
 * The pivots are named like the previous combat body so hit-zone lookup and
 * the existing deterministic ragdoll can continue to address the same parts.
 */
export const createStickFigureBody = (options: StickFigureBodyOptions): StickFigureRig => {
  const root = new THREE.Group();
  root.name = options.name ?? "StickFigureBody";
  const relativeScale = options.scale === undefined ? 1 : finite(options.scale, 1);
  root.scale.setScalar(BODY_SCALE * Math.max(0.2, relativeScale));
  root.position.y = STICK_FIGURE_SOURCE_FOOT_OFFSET_METERS * BODY_SCALE;

  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    roughness: 0.54,
    metalness: 0.04,
    emissive: options.color,
    emissiveIntensity: 0.14,
  });

  const torso = new THREE.Group();
  torso.name = "RagdollTorso";
  torso.position.set(0, 0.38, 0);
  torso.userData = { combatHitZone: "body", ragdollPart: "torso" };
  torso.add(createBone(0.48, material, "body", "torso", "up"));
  torso.add(createJoint(material, "body", "torso"));
  root.add(torso);

  const head = new THREE.Group();
  head.name = "RagdollHead";
  // Keep the neck attached to the torso pivot so MotionBricks torso lean and
  // the live camera-driven head intent compose into one continuous pose.
  head.position.set(0, 0.61, 0);
  head.userData = { combatHitZone: "head", ragdollPart: "head" };
  const neck = createBone(0.12, material, "head", "head");
  neck.position.y = -0.06;
  head.add(neck);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 12, 8), material);
  headMesh.userData = { combatHitZone: "head", ragdollPart: "head" };
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  head.add(headMesh);
  torso.add(head);

  const createArm = (
    side: "left" | "right",
  ): {
    readonly arm: THREE.Group;
    readonly forearm: THREE.Group;
  } => {
    const sign = side === "left" ? -1 : 1;
    const arm = new THREE.Group();
    arm.name = side === "left" ? "RagdollLeftArm" : "RagdollRightArm";
    arm.position.set(sign * 0.27, 0.75, 0);
    arm.userData = { combatHitZone: "body", ragdollPart: side === "left" ? "leftArm" : "rightArm" };
    arm.add(createBone(0.29, material, "body", side === "left" ? "leftArm" : "rightArm"));
    arm.add(createJoint(material, "body", side === "left" ? "leftArm" : "rightArm"));
    const forearm = new THREE.Group();
    forearm.name = side === "left" ? "StickLeftForearm" : "StickRightForearm";
    forearm.position.y = -0.29;
    forearm.add(createBone(0.27, material, "body", side === "left" ? "leftArm" : "rightArm"));
    forearm.add(createJoint(material, "body", side === "left" ? "leftArm" : "rightArm"));
    arm.add(forearm);
    root.add(arm);
    return { arm, forearm };
  };

  const leftArm = createArm("left");
  const rightArm = createArm("right");

  const createLeg = (
    side: "left" | "right",
  ): {
    readonly leg: THREE.Group;
    readonly lowerLeg: THREE.Group;
  } => {
    const sign = side === "left" ? -1 : 1;
    const leg = new THREE.Group();
    leg.name = side === "left" ? "RagdollLeftLeg" : "RagdollRightLeg";
    leg.position.set(sign * 0.12, 0.37, 0);
    leg.userData = { combatHitZone: "body", ragdollPart: side === "left" ? "leftLeg" : "rightLeg" };
    leg.add(createBone(0.22, material, "body", side === "left" ? "leftLeg" : "rightLeg"));
    leg.add(createJoint(material, "body", side === "left" ? "leftLeg" : "rightLeg"));
    const lowerLeg = new THREE.Group();
    lowerLeg.name = side === "left" ? "StickLeftLowerLeg" : "StickRightLowerLeg";
    lowerLeg.position.y = -0.22;
    lowerLeg.add(createBone(0.22, material, "body", side === "left" ? "leftLeg" : "rightLeg"));
    lowerLeg.add(createJoint(material, "body", side === "left" ? "leftLeg" : "rightLeg"));
    leg.add(lowerLeg);
    root.add(leg);
    return { leg, lowerLeg };
  };

  const leftLeg = createLeg("left");
  const rightLeg = createLeg("right");

  return {
    root,
    parts: {
      head,
      torso,
      leftArm: leftArm.arm,
      rightArm: rightArm.arm,
      leftLeg: leftLeg.leg,
      rightLeg: rightLeg.leg,
    },
    joints: {
      leftForearm: leftArm.forearm,
      rightForearm: rightArm.forearm,
      leftLowerLeg: leftLeg.lowerLeg,
      rightLowerLeg: rightLeg.lowerLeg,
    },
  };
};

/** Advance a caller-owned gait phase without using wall-clock time. */
export const advanceStickFigurePhase = (
  phaseSeconds: number,
  deltaSeconds: number,
  speedRatio: number,
  movementMagnitude: number,
  seated: boolean,
): number => {
  const phase = finite(phaseSeconds);
  const delta = THREE.MathUtils.clamp(finite(deltaSeconds), 0, 0.1);
  const speed = clamp01(speedRatio);
  const movement = clamp01(movementMagnitude);
  const frequency = seated ? 0.72 : 1.15 + speed * 1.8;
  return phase + delta * frequency * (seated ? 1 : Math.max(0.2, movement));
};

const motionPositionToBrowserSpace = (position: MotionBricksVector3): THREE.Vector3 =>
  // MotionBricks uses X-right/Z-forward while the browser actor faces -Z.
  // Mirroring both horizontal axes preserves the named left/right limbs.
  new THREE.Vector3(-position[0], position[1], -position[2]);

const normalizedDirection = (
  from: THREE.Vector3,
  to: THREE.Vector3,
  fallback: THREE.Vector3,
): MotionBricksVector3 => {
  const direction = to.clone().sub(from);
  if (direction.lengthSq() <= 0.000001) {
    return [fallback.x, fallback.y, fallback.z];
  }
  direction.normalize();
  return [direction.x, direction.y, direction.z];
};

const blendDirection = (
  from: MotionBricksVector3,
  to: MotionBricksVector3,
  amount: number,
): MotionBricksVector3 => {
  const blended = new THREE.Vector3(...from).lerp(new THREE.Vector3(...to), clamp01(amount));
  if (blended.lengthSq() <= 0.000001) {
    return from;
  }
  blended.normalize();
  return [blended.x, blended.y, blended.z];
};

const resolveMotionBricksTargets = (
  input: StickFigureAnimationInput,
): { readonly rootBob: number; readonly targets: StickFigureMotionBricksTargets } => {
  if (input.motionClip === undefined) {
    throw new Error("MotionBricks targets require a playback clip");
  }
  const sample = sampleMotionBricksClip(
    input.motionClip,
    input.phaseSeconds,
    input.motionPlaybackRate ?? 1,
  );
  const pelvis = motionPositionToBrowserSpace(sample.pelvis);
  const waist = motionPositionToBrowserSpace(sample.waist);
  const leftShoulder = motionPositionToBrowserSpace(sample.leftShoulder);
  const leftElbow = motionPositionToBrowserSpace(sample.leftElbow);
  const leftHand = motionPositionToBrowserSpace(sample.leftHand);
  const leftHip = motionPositionToBrowserSpace(sample.leftHip);
  const leftKnee = motionPositionToBrowserSpace(sample.leftKnee);
  const leftAnkle = motionPositionToBrowserSpace(sample.leftAnkle);
  const rightShoulder = motionPositionToBrowserSpace(sample.rightShoulder);
  const rightElbow = motionPositionToBrowserSpace(sample.rightElbow);
  const rightHand = motionPositionToBrowserSpace(sample.rightHand);
  const rightHip = motionPositionToBrowserSpace(sample.rightHip);
  const rightKnee = motionPositionToBrowserSpace(sample.rightKnee);
  const rightAnkle = motionPositionToBrowserSpace(sample.rightAnkle);
  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const leftForearm = normalizedDirection(leftElbow, leftHand, down);
  const rightForearm = normalizedDirection(rightElbow, rightHand, down);
  const interaction = input.seated ? clamp01(input.interaction) : 0;
  return {
    rootBob: sample.rootHeightOffset * BODY_SCALE,
    targets: {
      applyLegTargets: !input.seated,
      torso: normalizedDirection(pelvis, waist, up),
      leftArm: normalizedDirection(leftShoulder, leftElbow, down),
      leftForearm: blendDirection(leftForearm, [0, -0.34, -0.94], interaction),
      leftLeg: normalizedDirection(leftHip, leftKnee, down),
      leftLowerLeg: normalizedDirection(leftKnee, leftAnkle, down),
      rightArm: normalizedDirection(rightShoulder, rightElbow, down),
      rightForearm: blendDirection(rightForearm, [0, -0.34, -0.94], interaction * 0.35),
      rightLeg: normalizedDirection(rightHip, rightKnee, down),
      rightLowerLeg: normalizedDirection(rightKnee, rightAnkle, down),
    },
  };
};

/** Resolve a smooth, deterministic pose from locomotion and head intent. */
export const resolveStickFigureAnimationPose = (
  input: StickFigureAnimationInput,
): StickFigureAnimationPose => {
  const phase = finite(input.phaseSeconds);
  const movement = clamp01(input.movementMagnitude);
  const speed = clamp01(input.speedRatio);
  const grounded = input.grounded;
  const seated = input.seated;
  const interaction = clamp01(input.interaction);
  const strideEnabled = grounded && !seated && movement > 0.01;
  const stride = strideEnabled ? Math.sin(phase * (5.4 + speed * 2.1)) * movement : 0;
  const oppositeStride = -stride;
  const breath = Math.sin(phase * 1.65) * (seated ? 0.018 : 0.011);
  const crouch = seated ? 0.16 : 0;
  const strideAmplitude = (0.18 + speed * 0.26) * movement;
  const armSwing = (0.12 + speed * 0.22) * movement;
  const reach = interaction * (0.78 + 0.16 * Math.sin(phase * 1.2));
  const strike = input.activity === "strike" ? 1 : 0;

  const proceduralPose: StickFigureAnimationPose = {
    rootBob: breath + (strideEnabled ? Math.abs(Math.sin(phase * (5.4 + speed * 2.1))) * 0.018 : 0),
    torsoPitch: -0.055 * speed * movement - crouch * 0.22 + breath * 0.35,
    torsoRoll: strideEnabled ? stride * 0.06 : breath * 0.25,
    headPitch: THREE.MathUtils.clamp(
      finite(input.headPitch) + breath * 0.25 - crouch * 0.18,
      -0.65,
      0.65,
    ),
    headYaw: THREE.MathUtils.clamp(
      finite(input.headYaw) + (strideEnabled ? oppositeStride * 0.04 : 0),
      -0.9,
      0.9,
    ),
    leftArmPitch: oppositeStride * armSwing - reach * 0.48 - strike * 0.28,
    leftArmRoll: -0.12 + (seated ? -0.08 : 0) + reach * 0.22,
    leftForearmPitch: reach * 0.9 + strike * 0.5,
    leftForearmRoll: -0.14 + reach * 0.14,
    rightArmPitch: stride * armSwing - (seated ? reach * 0.12 : 0) + strike * 0.9,
    rightArmRoll: 0.12 + (seated ? 0.06 : 0) - strike * 0.18,
    rightForearmPitch: (seated ? reach * 0.36 : 0) - strike * 0.7,
    rightForearmRoll: 0.14 + strike * 0.16,
    leftLegPitch: seated ? -0.92 + stride * 0.06 : oppositeStride * strideAmplitude,
    leftLegRoll: seated ? -0.08 : stride * 0.045,
    leftLowerLegPitch: seated ? 1.22 - stride * 0.05 : Math.max(0, stride) * 0.55,
    rightLegPitch: seated ? -0.92 + oppositeStride * 0.06 : stride * strideAmplitude,
    rightLegRoll: seated ? 0.08 : oppositeStride * 0.045,
    rightLowerLegPitch: seated ? 1.22 - oppositeStride * 0.05 : Math.max(0, oppositeStride) * 0.55,
  };
  if (input.motionClip === undefined) {
    return proceduralPose;
  }
  const motionBricks = resolveMotionBricksTargets(input);
  return {
    ...proceduralPose,
    rootBob: motionBricks.rootBob,
    motionBricksTargets: motionBricks.targets,
  };
};

const setRotation = (object: THREE.Object3D, x: number, y: number, z: number): void => {
  object.rotation.set(finite(x), finite(y), finite(z));
};

const applyBoneDirection = (
  object: THREE.Object3D,
  sourceDirection: THREE.Vector3,
  targetDirection: MotionBricksVector3,
): void => {
  const target = new THREE.Vector3(...targetDirection);
  if (target.lengthSq() <= 0.000001) {
    return;
  }
  object.quaternion.setFromUnitVectors(sourceDirection, target.normalize());
};

/** Apply a resolved pose to the shared body pivots. */
export const applyStickFigureAnimationPose = (
  rig: StickFigureRig,
  pose: StickFigureAnimationPose,
): void => {
  setRotation(rig.parts.torso, pose.torsoPitch, 0, pose.torsoRoll);
  setRotation(rig.parts.head, pose.headPitch, pose.headYaw, 0);
  setRotation(rig.parts.leftArm, pose.leftArmPitch, 0, pose.leftArmRoll);
  setRotation(rig.joints.leftForearm, pose.leftForearmPitch, 0, pose.leftForearmRoll);
  setRotation(rig.parts.rightArm, pose.rightArmPitch, 0, pose.rightArmRoll);
  setRotation(rig.joints.rightForearm, pose.rightForearmPitch, 0, pose.rightForearmRoll);
  setRotation(rig.parts.leftLeg, pose.leftLegPitch, 0, pose.leftLegRoll);
  setRotation(rig.joints.leftLowerLeg, pose.leftLowerLegPitch, 0, 0);
  setRotation(rig.parts.rightLeg, pose.rightLegPitch, 0, pose.rightLegRoll);
  setRotation(rig.joints.rightLowerLeg, pose.rightLowerLegPitch, 0, 0);
  if (pose.motionBricksTargets !== undefined) {
    const targets = pose.motionBricksTargets;
    const down = new THREE.Vector3(0, -1, 0);
    const up = new THREE.Vector3(0, 1, 0);
    applyBoneDirection(rig.parts.torso, up, targets.torso);
    applyBoneDirection(rig.parts.leftArm, down, targets.leftArm);
    applyBoneDirection(rig.joints.leftForearm, down, targets.leftForearm);
    applyBoneDirection(rig.parts.rightArm, down, targets.rightArm);
    applyBoneDirection(rig.joints.rightForearm, down, targets.rightForearm);
    if (targets.applyLegTargets) {
      applyBoneDirection(rig.parts.leftLeg, down, targets.leftLeg);
      applyBoneDirection(rig.joints.leftLowerLeg, down, targets.leftLowerLeg);
      applyBoneDirection(rig.parts.rightLeg, down, targets.rightLeg);
      applyBoneDirection(rig.joints.rightLowerLeg, down, targets.rightLowerLeg);
    }
  }
};
