/**
 * Physics-facing first-person head response.
 *
 * The capsule pose and velocity remain owned by the physics runtime. This
 * module only integrates the presentation response to the resolved local
 * delta-v and publishes one immutable snapshot for every perspective
 * consumer. No camera offset is fed back into the capsule.
 */

export type HeadImpulseSource =
  "locomotion" | "take-off" | "collision-stop" | "support-stop" | "traversal" | "weapon" | "melee";

export interface HeadMotionVector {
  readonly right: number;
  readonly up: number;
  readonly forward: number;
}

export interface HeadRotationVector {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}

export interface HeadMotionLimits {
  readonly translation: HeadMotionVector;
  readonly rotation: HeadRotationVector;
}

export interface HeadImpulse {
  readonly source: HeadImpulseSource;
  /** Local body delta-v. The head receives the opposite response. */
  readonly deltaVelocity: HeadMotionVector;
  /** Optional local angular delta-v, for recoil and melee contacts. */
  readonly angularDeltaVelocity?: HeadRotationVector;
}

export interface HeadMotionState {
  readonly translation: HeadMotionVector;
  readonly translationVelocity: HeadMotionVector;
  readonly rotation: HeadRotationVector;
  readonly rotationVelocity: HeadRotationVector;
}

export interface HeadMotionSnapshot extends HeadMotionState {
  readonly source: HeadImpulseSource | null;
  readonly translationClamped: boolean;
  readonly rotationClamped: boolean;
  /** Final presentation clamp status, filled by the camera boundary. */
  readonly supportClamped: boolean;
  readonly ceilingClamped: boolean;
}

export interface HeadMotionStepInput {
  readonly deltaSeconds: number;
  readonly targetTranslation?: HeadMotionVector;
  readonly targetRotation?: HeadRotationVector;
  readonly impulse?: HeadImpulse;
  readonly limits?: Partial<HeadMotionLimits>;
}

export interface HeadMotionSolverOptions {
  /** Shared second-order spring stiffness for every axis. */
  readonly stiffness: number;
  /** Shared second-order damping for every axis. */
  readonly damping: number;
  /** Opposite head response multiplier applied to body delta-v. */
  readonly impulseScale: number;
  readonly limits: HeadMotionLimits;
}

const DEFAULT_LIMITS: HeadMotionLimits = {
  translation: { right: 0.28, up: 0.9, forward: 0.22 },
  rotation: { pitch: 0.24, yaw: 0.22, roll: 0.18 },
};

/** Tuned for an impact to compress a 1.75 m eye toward a 1 m support eye. */
export const HEAD_MOTION_DEFAULT_OPTIONS: HeadMotionSolverOptions = {
  stiffness: 72,
  damping: 17,
  impulseScale: 0.82,
  limits: DEFAULT_LIMITS,
};

const finite = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);

const clamp = (value: number, limit: number): number => {
  const safeLimit = Math.max(0, finite(limit));
  return Math.min(safeLimit, Math.max(-safeLimit, finite(value)));
};

const clampVector = (value: HeadMotionVector, limit: HeadMotionVector): HeadMotionVector => ({
  right: clamp(value.right, limit.right),
  up: clamp(value.up, limit.up),
  forward: clamp(value.forward, limit.forward),
});

const clampRotation = (
  value: HeadRotationVector,
  limit: HeadRotationVector,
): HeadRotationVector => ({
  pitch: clamp(value.pitch, limit.pitch),
  yaw: clamp(value.yaw, limit.yaw),
  roll: clamp(value.roll, limit.roll),
});

const addVector = (left: HeadMotionVector, right: HeadMotionVector): HeadMotionVector => ({
  right: left.right + right.right,
  up: left.up + right.up,
  forward: left.forward + right.forward,
});

const addRotation = (left: HeadRotationVector, right: HeadRotationVector): HeadRotationVector => ({
  pitch: left.pitch + right.pitch,
  yaw: left.yaw + right.yaw,
  roll: left.roll + right.roll,
});

const scaleVector = (value: HeadMotionVector, scale: number): HeadMotionVector => ({
  right: value.right * scale,
  up: value.up * scale,
  forward: value.forward * scale,
});

const scaleRotation = (value: HeadRotationVector, scale: number): HeadRotationVector => ({
  pitch: value.pitch * scale,
  yaw: value.yaw * scale,
  roll: value.roll * scale,
});

const integrateAxis = (
  position: number,
  velocity: number,
  target: number,
  deltaSeconds: number,
  stiffness: number,
  damping: number,
): readonly [position: number, velocity: number] => {
  const delta = Math.max(0, finite(deltaSeconds));
  if (delta === 0) {
    return [position, velocity];
  }
  const safeStiffness = Math.max(0.0001, finite(stiffness, 1));
  const safeDamping = Math.max(0, finite(damping));
  const omega = Math.sqrt(safeStiffness);
  const halfDamping = safeDamping * 0.5;
  const offset = finite(position) - finite(target);
  const initialVelocity = finite(velocity);
  if (halfDamping < omega) {
    const dampedOmega = Math.sqrt(Math.max(0, safeStiffness - halfDamping * halfDamping));
    const decay = Math.exp(-halfDamping * delta);
    const angle = dampedOmega * delta;
    const cosine = Math.cos(angle);
    const sine = dampedOmega > 0 ? Math.sin(angle) / dampedOmega : delta;
    const coefficient = initialVelocity + halfDamping * offset;
    const nextOffset = decay * (offset * cosine + coefficient * sine);
    const nextVelocity =
      decay *
      (initialVelocity * cosine - (halfDamping * coefficient + offset * dampedOmega ** 2) * sine);
    return [nextOffset + finite(target), nextVelocity];
  }
  const repeatedRoot = Math.sqrt(safeStiffness);
  const coefficient = initialVelocity + repeatedRoot * offset;
  const decay = Math.exp(-repeatedRoot * delta);
  const nextOffset = decay * (offset + coefficient * delta);
  const nextVelocity = decay * (initialVelocity - repeatedRoot * coefficient * delta);
  return [nextOffset + finite(target), nextVelocity];
};

const integrateVector = (
  value: HeadMotionVector,
  velocity: HeadMotionVector,
  target: HeadMotionVector,
  deltaSeconds: number,
  stiffness: number,
  damping: number,
): readonly [HeadMotionVector, HeadMotionVector] => {
  const [right, rightVelocity] = integrateAxis(
    value.right,
    velocity.right,
    target.right,
    deltaSeconds,
    stiffness,
    damping,
  );
  const [up, upVelocity] = integrateAxis(
    value.up,
    velocity.up,
    target.up,
    deltaSeconds,
    stiffness,
    damping,
  );
  const [forward, forwardVelocity] = integrateAxis(
    value.forward,
    velocity.forward,
    target.forward,
    deltaSeconds,
    stiffness,
    damping,
  );
  return [
    { right, up, forward },
    { right: rightVelocity, up: upVelocity, forward: forwardVelocity },
  ];
};

const integrateRotation = (
  value: HeadRotationVector,
  velocity: HeadRotationVector,
  target: HeadRotationVector,
  deltaSeconds: number,
  stiffness: number,
  damping: number,
): readonly [HeadRotationVector, HeadRotationVector] => {
  const [pitch, pitchVelocity] = integrateAxis(
    value.pitch,
    velocity.pitch,
    target.pitch,
    deltaSeconds,
    stiffness,
    damping,
  );
  const [yaw, yawVelocity] = integrateAxis(
    value.yaw,
    velocity.yaw,
    target.yaw,
    deltaSeconds,
    stiffness,
    damping,
  );
  const [roll, rollVelocity] = integrateAxis(
    value.roll,
    velocity.roll,
    target.roll,
    deltaSeconds,
    stiffness,
    damping,
  );
  return [
    { pitch, yaw, roll },
    { pitch: pitchVelocity, yaw: yawVelocity, roll: rollVelocity },
  ];
};

export const createHeadMotionState = (): HeadMotionState => ({
  translation: { right: 0, up: 0, forward: 0 },
  translationVelocity: { right: 0, up: 0, forward: 0 },
  rotation: { pitch: 0, yaw: 0, roll: 0 },
  rotationVelocity: { pitch: 0, yaw: 0, roll: 0 },
});

export const integrateHeadMotion = (
  state: HeadMotionState,
  input: HeadMotionStepInput,
  options: HeadMotionSolverOptions = HEAD_MOTION_DEFAULT_OPTIONS,
): { readonly state: HeadMotionState; readonly snapshot: HeadMotionSnapshot } => {
  const impulse = input.impulse;
  const translationImpulse =
    impulse === undefined
      ? { right: 0, up: 0, forward: 0 }
      : scaleVector(impulse.deltaVelocity, -finite(options.impulseScale));
  const rotationImpulse =
    impulse?.angularDeltaVelocity === undefined
      ? { pitch: 0, yaw: 0, roll: 0 }
      : scaleRotation(impulse.angularDeltaVelocity, -finite(options.impulseScale));
  const translationVelocity = addVector(state.translationVelocity, translationImpulse);
  const rotationVelocity = addRotation(state.rotationVelocity, rotationImpulse);
  const targetTranslation = input.targetTranslation ?? { right: 0, up: 0, forward: 0 };
  const targetRotation = input.targetRotation ?? { pitch: 0, yaw: 0, roll: 0 };
  const [translation, nextTranslationVelocity] = integrateVector(
    state.translation,
    translationVelocity,
    targetTranslation,
    input.deltaSeconds,
    options.stiffness,
    options.damping,
  );
  const [rotation, nextRotationVelocity] = integrateRotation(
    state.rotation,
    rotationVelocity,
    targetRotation,
    input.deltaSeconds,
    options.stiffness,
    options.damping,
  );
  const limits = {
    translation: input.limits?.translation ?? options.limits.translation,
    rotation: input.limits?.rotation ?? options.limits.rotation,
  };
  const boundedTranslation = clampVector(translation, limits.translation);
  const boundedRotation = clampRotation(rotation, limits.rotation);
  const nextState: HeadMotionState = Object.freeze({
    translation: Object.freeze(boundedTranslation),
    translationVelocity: Object.freeze(nextTranslationVelocity),
    rotation: Object.freeze(boundedRotation),
    rotationVelocity: Object.freeze(nextRotationVelocity),
  });
  const snapshot: HeadMotionSnapshot = Object.freeze({
    ...nextState,
    source: impulse?.source ?? null,
    translationClamped:
      boundedTranslation.right !== translation.right ||
      boundedTranslation.up !== translation.up ||
      boundedTranslation.forward !== translation.forward,
    rotationClamped:
      boundedRotation.pitch !== rotation.pitch ||
      boundedRotation.yaw !== rotation.yaw ||
      boundedRotation.roll !== rotation.roll,
    supportClamped: false,
    ceilingClamped: false,
  });
  return { state: nextState, snapshot };
};
