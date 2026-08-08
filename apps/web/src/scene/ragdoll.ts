/** A finite vector used by the deterministic presentation ragdoll. */
export interface RagdollVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Impact information used to launch a dead actor. */
export interface RagdollImpulse {
  readonly direction: RagdollVector;
  readonly force: number;
  readonly upwardForce?: number;
}

/** Immutable state for one kinematic ragdoll animation. */
export interface RagdollState {
  readonly active: boolean;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly position: RagdollVector;
  readonly velocity: RagdollVector;
  /** Euler rotation in radians, applied as x/y/z body tumble. */
  readonly rotation: RagdollVector;
  readonly angularVelocity: RagdollVector;
}

/** Tuned for a readable short death animation before the actor respawns. */
export const RAGDOLL_DURATION_SECONDS = 2.8;
export const RAGDOLL_GRAVITY_METERS_PER_SECOND_SQUARED = 16;
export const RAGDOLL_HORIZONTAL_DRAG_PER_SECOND = 1.7;
export const RAGDOLL_ANGULAR_DRAG_PER_SECOND = 1.2;
export const RAGDOLL_BOUNCE_FACTOR = 0.18;
export const RAGDOLL_REST_SPEED_METERS_PER_SECOND = 0.22;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

const finiteVector = (vector: RagdollVector): RagdollVector => ({
  x: finite(vector.x),
  y: finite(vector.y),
  z: finite(vector.z),
});

const horizontalLength = (vector: RagdollVector): number => Math.hypot(vector.x, vector.z);

const normalizeHorizontal = (vector: RagdollVector): RagdollVector => {
  const length = horizontalLength(vector);
  if (length <= Number.EPSILON) {
    return { x: 0, y: 0, z: -1 };
  }
  return { x: vector.x / length, y: 0, z: vector.z / length };
};

const resolveDuration = (durationSeconds: number | undefined): number =>
  clamp(durationSeconds ?? RAGDOLL_DURATION_SECONDS, 0.5, 8);

/** Start a repeatable ragdoll from an impact direction and stopping power. */
export const startRagdoll = (
  origin: RagdollVector,
  impulse: RagdollImpulse,
  durationSeconds = RAGDOLL_DURATION_SECONDS,
): RagdollState => {
  const direction = normalizeHorizontal(finiteVector(impulse.direction));
  const force = clamp(impulse.force, 0, 24);
  const launchSpeed = 2.5 + force * 0.48;
  const upwardForce = clamp(impulse.upwardForce ?? 0, 0, 8);
  const sideSign = direction.x < -0.001 ? -1 : 1;
  return {
    active: true,
    elapsedSeconds: 0,
    durationSeconds: resolveDuration(durationSeconds),
    position: finiteVector(origin),
    velocity: {
      x: direction.x * launchSpeed,
      y: 2.6 + force * 0.07 + upwardForce,
      z: direction.z * launchSpeed,
    },
    rotation: { x: 0, y: 0, z: 0 },
    angularVelocity: {
      x: -1.35 - force * 0.04,
      y: sideSign * (0.7 + force * 0.035),
      z: sideSign * (1.7 + force * 0.055),
    },
  };
};

/** Advance one frame of the deterministic ragdoll and resolve its floor bounce. */
export const stepRagdoll = (
  state: RagdollState,
  deltaSeconds: number,
  floorY: number,
): RagdollState => {
  if (!state.active) {
    return state;
  }
  const delta = clamp(deltaSeconds, 0, 0.1);
  const elapsedSeconds = Math.min(state.durationSeconds, state.elapsedSeconds + delta);
  const velocityBeforeGravity = state.velocity;
  let position: RagdollVector = {
    x: state.position.x + velocityBeforeGravity.x * delta,
    y: state.position.y + velocityBeforeGravity.y * delta,
    z: state.position.z + velocityBeforeGravity.z * delta,
  };
  let velocity: RagdollVector = {
    x: velocityBeforeGravity.x * Math.exp(-RAGDOLL_HORIZONTAL_DRAG_PER_SECOND * delta),
    y: velocityBeforeGravity.y - RAGDOLL_GRAVITY_METERS_PER_SECOND_SQUARED * delta,
    z: velocityBeforeGravity.z * Math.exp(-RAGDOLL_HORIZONTAL_DRAG_PER_SECOND * delta),
  };
  const safeFloorY = finite(floorY);
  if (position.y < safeFloorY) {
    position = { ...position, y: safeFloorY };
    if (velocity.y < -RAGDOLL_REST_SPEED_METERS_PER_SECOND) {
      velocity = {
        ...velocity,
        y: -velocity.y * RAGDOLL_BOUNCE_FACTOR,
        x: velocity.x * 0.65,
        z: velocity.z * 0.65,
      };
    } else {
      velocity = { ...velocity, y: 0 };
    }
  }
  const angularVelocity: RagdollVector = {
    x: state.angularVelocity.x * Math.exp(-RAGDOLL_ANGULAR_DRAG_PER_SECOND * delta),
    y: state.angularVelocity.y * Math.exp(-RAGDOLL_ANGULAR_DRAG_PER_SECOND * delta),
    z: state.angularVelocity.z * Math.exp(-RAGDOLL_ANGULAR_DRAG_PER_SECOND * delta),
  };
  const rotation: RagdollVector = {
    x: state.rotation.x + angularVelocity.x * delta,
    y: state.rotation.y + angularVelocity.y * delta,
    z: state.rotation.z + angularVelocity.z * delta,
  };
  return {
    ...state,
    active: elapsedSeconds < state.durationSeconds,
    elapsedSeconds,
    position,
    velocity,
    rotation,
    angularVelocity,
  };
};

/** Resolve loose joint motion so the body reads as a ragdoll, not a rigid prop. */
export const resolveRagdollJointPose = (
  state: RagdollState,
): {
  readonly headPitch: number;
  readonly torsoPitch: number;
  readonly torsoRoll: number;
  readonly leftArmRoll: number;
  readonly rightArmRoll: number;
  readonly leftLegPitch: number;
  readonly rightLegPitch: number;
} => {
  const progress = clamp(state.elapsedSeconds / state.durationSeconds, 0, 1);
  const settled = progress * progress;
  const wobble = Math.sin(state.elapsedSeconds * 7.5) * (1 - settled) * 0.18;
  return {
    headPitch: -0.35 - settled * 0.42 + wobble,
    torsoPitch: settled * 0.8,
    torsoRoll: state.rotation.z * 0.2,
    leftArmRoll: 0.45 + settled * 1.1 + wobble,
    rightArmRoll: -0.45 - settled * 1.1 - wobble,
    leftLegPitch: -settled * 0.7,
    rightLegPitch: settled * 0.58,
  };
};
