import { O2_JUMP_COST, O2_MINI_HOP_SPEED_BLEND } from "./player-vitals.js";
import {
  PLAYER_JUMP_SPEED,
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_TROT_SPEED_METERS_PER_SECOND,
} from "./world-scale.js";

/** The fixed upper bound used by the live controller and deterministic simulator. */
export const PLAYER_MOVEMENT_MAX_STEP_SECONDS = 1 / 30;
export const PLAYER_GROUND_ACCELERATION_RATE = 11;
export const PLAYER_GROUND_RELEASE_RATE = 3.5;
export const PLAYER_GROUND_REVERSE_BRAKE_RATE = 28;
export const PLAYER_AIR_CONTROL_RATE = 4.5;
export const PLAYER_AIR_SPEED_RATIO = 0.82;
export const PLAYER_CROUCH_SPEED_METERS_PER_SECOND = PLAYER_MOVE_SPEED_METERS_PER_SECOND * 0.5;
export const PLAYER_SLIDE_START_SPEED_METERS_PER_SECOND = PLAYER_TROT_SPEED_METERS_PER_SECOND * 0.9;
export const PLAYER_SLIDE_END_SPEED_METERS_PER_SECOND = PLAYER_MOVE_SPEED_METERS_PER_SECOND * 0.55;
export const PLAYER_SLIDE_FRICTION_RATE = 2.8;
export const PLAYER_SLIDE_MAX_SECONDS = 0.9;
export const PLAYER_LANDING_RECOVERY_SECONDS = 0.16;
export const PLAYER_FALLBACK_JUMP_SPEED_RATIO = O2_MINI_HOP_SPEED_BLEND;

export interface PlayerMovementVector {
  readonly right: number;
  readonly up: number;
  readonly forward: number;
}

export interface PlayerMovementDirection {
  readonly right: number;
  readonly forward: number;
}

export type PlayerMovementPace = "walk" | "run" | "sprint";
export type PlayerMovementPosture = "standing" | "crouching";

export type PlayerMovementState =
  | Readonly<{
      kind: "grounded";
      posture: PlayerMovementPosture;
      pace: PlayerMovementPace;
    }>
  | Readonly<{
      kind: "airborne";
      posture: PlayerMovementPosture;
    }>
  | Readonly<{
      kind: "slide";
      elapsedSeconds: number;
      progress: number;
    }>
  | Readonly<{
      kind: "vault";
      progress: number;
    }>
  | Readonly<{
      kind: "wall-contact";
      progress: number;
    }>
  | Readonly<{
      kind: "wall-climb";
      progress: number;
    }>
  | Readonly<{
      kind: "ledge-grab";
      progress: number;
    }>
  | Readonly<{
      kind: "landing-recovery";
      elapsedSeconds: number;
      progress: number;
      posture: PlayerMovementPosture;
    }>;

export type PlayerTraversalKind = "vault" | "wall-contact" | "wall-climb" | "ledge-grab";

export interface PlayerMovementObstacleMetadata {
  readonly id: string;
  readonly topY: number;
  readonly clearanceValid: boolean;
}

export interface PlayerMovementContact {
  readonly kind: "support" | "wall" | "vault" | "ledge";
  readonly normal: Readonly<{ x: number; y: number; z: number }>;
  readonly obstacle: PlayerMovementObstacleMetadata;
  readonly target?: Readonly<{ x: number; y: number; z: number }>;
}

export interface PlayerExternalTraversalState {
  readonly kind: PlayerTraversalKind;
  readonly obstacleId: string;
  readonly progress: number;
  readonly contactValid: boolean;
  readonly completed?: boolean;
  readonly cancelled?: boolean;
}

export type PlayerMovementEvent =
  | Readonly<{ kind: "jump"; result: "full" | "fallback" }>
  | Readonly<{ kind: "vault-start"; obstacleId: string }>
  | Readonly<{ kind: "wall-contact"; obstacleId: string }>
  | Readonly<{ kind: "wall-climb-request"; obstacleId: string }>
  | Readonly<{ kind: "ledge-grab"; obstacleId: string }>
  | Readonly<{ kind: "traversal-cancel"; traversal: PlayerTraversalKind }>
  | Readonly<{ kind: "traversal-complete"; traversal: PlayerTraversalKind }>
  | Readonly<{ kind: "slide-start" }>
  | Readonly<{ kind: "slide-end" }>
  | Readonly<{ kind: "landing"; downwardSpeed: number }>;

export interface PlayerJumpAction {
  readonly kind: "full" | "fallback";
  readonly launchSpeed: number;
  readonly oxygenCost: number;
}

export interface PlayerTraversalRequest {
  readonly kind: PlayerTraversalKind;
  readonly obstacle: PlayerMovementObstacleMetadata;
  readonly target?: Readonly<{ x: number; y: number; z: number }>;
}

export interface PlayerMovementControllerState {
  readonly movement: PlayerMovementState;
  readonly jumpHeld: boolean;
  readonly crouchHeld: boolean;
  readonly previousGrounded: boolean;
  readonly traversalLatched: boolean;
  readonly traversalObstacleId: string | null;
  readonly seed: string;
}

export interface PlayerMovementControllerInput {
  /** Pre-physics integrates input; post-physics commits validated traversal contacts only. */
  readonly phase?: "pre-physics" | "post-physics";
  readonly deltaSeconds: number;
  readonly seed: string;
  readonly direction: PlayerMovementDirection;
  readonly currentVelocity: PlayerMovementVector;
  readonly grounded: boolean;
  readonly sprint: boolean;
  readonly sprintAffordable: boolean;
  readonly crouch: boolean;
  readonly jump: boolean;
  readonly walking?: boolean;
  readonly oxygen: number;
  readonly targetSpeedMetersPerSecond?: number;
  readonly contacts?: readonly PlayerMovementContact[];
  readonly externalTraversal?: PlayerExternalTraversalState | null;
  readonly slideRequested?: boolean;
}

export interface PlayerMovementControllerOutput {
  readonly state: PlayerMovementControllerState;
  readonly desiredVelocity: PlayerMovementVector;
  readonly posture: PlayerMovementPosture;
  readonly traversalProgress: number;
  readonly jumpAction: PlayerJumpAction | null;
  readonly traversalRequest: PlayerTraversalRequest | null;
  readonly events: readonly PlayerMovementEvent[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

export const resolvePlayerMovementDeltaSeconds = (deltaSeconds: number): number =>
  clamp(deltaSeconds, 0, PLAYER_MOVEMENT_MAX_STEP_SECONDS);

const resolveDirection = (
  direction: PlayerMovementDirection,
): Readonly<{ right: number; forward: number; magnitude: number }> => {
  const right = clamp(direction.right, -1, 1);
  const forward = clamp(direction.forward, -1, 1);
  const rawMagnitude = Math.hypot(right, forward);
  if (rawMagnitude <= Number.EPSILON) {
    return { right: 0, forward: 0, magnitude: 0 };
  }
  const scale = 1 / rawMagnitude;
  return {
    right: right * scale,
    forward: forward * scale,
    magnitude: Math.min(1, rawMagnitude),
  };
};

const approachExponentially = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
): number => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const clampHorizontalSpeed = (
  right: number,
  forward: number,
  maximumSpeed: number,
): Readonly<{ right: number; forward: number }> => {
  const speed = Math.hypot(right, forward);
  if (speed <= maximumSpeed || speed <= Number.EPSILON) {
    return { right, forward };
  }
  const scale = maximumSpeed / speed;
  return { right: right * scale, forward: forward * scale };
};

/**
 * Accelerate toward the requested local velocity while preserving release
 * momentum and applying a stronger brake before a direction reversal.
 */
export const resolvePlayerHorizontalVelocity = (
  current: Readonly<{ right: number; forward: number }>,
  target: Readonly<{ right: number; forward: number }>,
  grounded: boolean,
  deltaSeconds: number,
  maximumSpeed: number,
): Readonly<{ right: number; forward: number }> => {
  const delta = resolvePlayerMovementDeltaSeconds(deltaSeconds);
  const currentRight = finite(current.right);
  const currentForward = finite(current.forward);
  const targetRight = finite(target.right);
  const targetForward = finite(target.forward);
  const currentSpeed = Math.hypot(currentRight, currentForward);
  const targetSpeed = Math.hypot(targetRight, targetForward);
  const opposing =
    currentSpeed > Number.EPSILON &&
    targetSpeed > Number.EPSILON &&
    currentRight * targetRight + currentForward * targetForward < 0;
  const rate = !grounded
    ? PLAYER_AIR_CONTROL_RATE
    : opposing
      ? PLAYER_GROUND_REVERSE_BRAKE_RATE
      : targetSpeed <= Number.EPSILON
        ? PLAYER_GROUND_RELEASE_RATE
        : PLAYER_GROUND_ACCELERATION_RATE;
  const resolved = clampHorizontalSpeed(
    approachExponentially(currentRight, targetRight, rate, delta),
    approachExponentially(currentForward, targetForward, rate, delta),
    Math.max(0, finite(maximumSpeed)),
  );
  return resolved;
};

export const resolvePlayerJumpAction = (
  oxygen: number,
  fullJumpCost = O2_JUMP_COST,
): PlayerJumpAction => {
  const available = Math.max(0, finite(oxygen));
  const cost = Math.max(0, finite(fullJumpCost));
  if (available >= cost) {
    return { kind: "full", launchSpeed: PLAYER_JUMP_SPEED, oxygenCost: cost };
  }
  return {
    kind: "fallback",
    launchSpeed: PLAYER_JUMP_SPEED * PLAYER_FALLBACK_JUMP_SPEED_RATIO,
    oxygenCost: 0,
  };
};

const postureFromInput = (crouch: boolean): PlayerMovementPosture =>
  crouch ? "crouching" : "standing";

const movementStateProgress = (movement: PlayerMovementState): number =>
  "progress" in movement ? clamp(movement.progress, 0, 1) : 0;

const movementTraversalKind = (movement: PlayerMovementState): PlayerTraversalKind | null => {
  switch (movement.kind) {
    case "vault":
    case "wall-contact":
    case "wall-climb":
    case "ledge-grab":
      return movement.kind;
    case "grounded":
    case "airborne":
    case "slide":
    case "landing-recovery":
      return null;
  }
};

const stateForTraversal = (
  traversal: PlayerExternalTraversalState,
): Extract<PlayerMovementState, { kind: PlayerTraversalKind }> => {
  const progress = clamp(traversal.progress, 0, 1);
  switch (traversal.kind) {
    case "vault":
      return { kind: "vault", progress };
    case "wall-contact":
      return { kind: "wall-contact", progress };
    case "wall-climb":
      return { kind: "wall-climb", progress };
    case "ledge-grab":
      return { kind: "ledge-grab", progress };
  }
};

const paceForInput = (input: PlayerMovementControllerInput): PlayerMovementPace => {
  if (input.sprint && input.sprintAffordable && !input.crouch) {
    return "sprint";
  }
  return input.walking === true ? "walk" : "run";
};

const speedForInput = (input: PlayerMovementControllerInput, pace: PlayerMovementPace): number => {
  const stateSpeed = input.crouch
    ? PLAYER_CROUCH_SPEED_METERS_PER_SECOND
    : pace === "walk"
      ? PLAYER_MOVE_SPEED_METERS_PER_SECOND
      : pace === "run"
        ? PLAYER_TROT_SPEED_METERS_PER_SECOND
        : PLAYER_SPRINT_SPEED_METERS_PER_SECOND;
  return input.targetSpeedMetersPerSecond === undefined
    ? stateSpeed
    : Math.min(stateSpeed, Math.max(0, finite(input.targetSpeedMetersPerSecond)));
};

const selectTraversalContact = (
  contacts: readonly PlayerMovementContact[],
): PlayerMovementContact | null => {
  const priorities: readonly PlayerMovementContact["kind"][] = ["vault", "ledge", "wall"];
  for (const kind of priorities) {
    const contact = contacts.find(
      (candidate) => candidate.kind === kind && candidate.obstacle.clearanceValid,
    );
    if (contact !== undefined) {
      return contact;
    }
  }
  return null;
};

export const createPlayerMovementControllerState = (
  seed: string,
  grounded = true,
): PlayerMovementControllerState => ({
  movement: grounded
    ? { kind: "grounded", posture: "standing", pace: "run" }
    : { kind: "airborne", posture: "standing" },
  jumpHeld: false,
  crouchHeld: false,
  previousGrounded: grounded,
  traversalLatched: false,
  traversalObstacleId: null,
  seed,
});

/** Advance the pure movement contract by one bounded simulation step. */
export const stepPlayerMovementController = (
  previous: PlayerMovementControllerState,
  input: PlayerMovementControllerInput,
): PlayerMovementControllerOutput => {
  const delta = resolvePlayerMovementDeltaSeconds(input.deltaSeconds);
  const direction = resolveDirection(input.direction);
  const currentVelocity: PlayerMovementVector = {
    right: finite(input.currentVelocity.right),
    up: finite(input.currentVelocity.up),
    forward: finite(input.currentVelocity.forward),
  };
  const events: PlayerMovementEvent[] = [];
  const posture = postureFromInput(input.crouch);
  const jumpPressed = input.jump && !previous.jumpHeld;
  const jumpReleased = !input.jump && previous.jumpHeld;
  const currentTraversal = movementTraversalKind(previous.movement);
  let traversalLatched = jumpReleased ? false : previous.traversalLatched;
  let traversalObstacleId = previous.traversalObstacleId;
  let traversalRequest: PlayerTraversalRequest | null = null;
  let jumpAction: PlayerJumpAction | null = null;
  let movement: PlayerMovementState = previous.movement;

  if (input.phase === "post-physics") {
    if (
      movement.kind === "airborne" &&
      input.jump &&
      !traversalLatched &&
      direction.magnitude > Number.EPSILON
    ) {
      const contact = selectTraversalContact(input.contacts ?? []);
      if (contact !== null) {
        const requestKind: PlayerTraversalKind =
          contact.kind === "vault"
            ? "vault"
            : contact.kind === "ledge"
              ? "ledge-grab"
              : "wall-contact";
        traversalRequest = {
          kind: requestKind,
          obstacle: contact.obstacle,
          ...(contact.target === undefined ? {} : { target: contact.target }),
        };
        traversalLatched = requestKind !== "wall-contact";
        traversalObstacleId = contact.obstacle.id;
        if (requestKind === "vault") {
          events.push({ kind: "vault-start", obstacleId: contact.obstacle.id });
          movement = { kind: "vault", progress: 0 };
        } else if (requestKind === "ledge-grab") {
          events.push({ kind: "ledge-grab", obstacleId: contact.obstacle.id });
          movement = { kind: "ledge-grab", progress: 0 };
        } else {
          events.push({ kind: "wall-contact", obstacleId: contact.obstacle.id });
          movement = { kind: "wall-contact", progress: 0 };
        }
      }
    }
    const state: PlayerMovementControllerState = {
      ...previous,
      movement,
      traversalLatched,
      traversalObstacleId,
      seed: input.seed || previous.seed,
    };
    return {
      state,
      desiredVelocity: currentVelocity,
      posture,
      traversalProgress: movementStateProgress(movement),
      jumpAction: null,
      traversalRequest,
      events,
    };
  }

  const externalTraversal = input.externalTraversal ?? null;
  if (externalTraversal !== null) {
    const obstacleMismatch =
      traversalObstacleId !== null && externalTraversal.obstacleId !== traversalObstacleId;
    if (
      externalTraversal.cancelled === true ||
      !externalTraversal.contactValid ||
      obstacleMismatch
    ) {
      events.push({ kind: "traversal-cancel", traversal: externalTraversal.kind });
      movement = { kind: "airborne", posture };
      traversalLatched = input.jump;
      traversalObstacleId = null;
    } else if (externalTraversal.completed === true) {
      events.push({ kind: "traversal-complete", traversal: externalTraversal.kind });
      movement = { kind: "landing-recovery", elapsedSeconds: 0, progress: 0, posture };
      traversalObstacleId = null;
    } else {
      movement = stateForTraversal(externalTraversal);
      traversalObstacleId = externalTraversal.obstacleId;
    }
  } else if (currentTraversal !== null) {
    events.push({ kind: "traversal-cancel", traversal: currentTraversal });
    traversalLatched = input.jump;
    movement = input.grounded
      ? { kind: "landing-recovery", elapsedSeconds: 0, progress: 0, posture }
      : { kind: "airborne", posture };
    traversalObstacleId = null;
  }

  if (
    movement.kind === "wall-contact" &&
    input.jump &&
    externalTraversal?.kind === "wall-contact" &&
    externalTraversal.progress >= 1 - Number.EPSILON &&
    !traversalLatched &&
    traversalObstacleId !== null
  ) {
    traversalLatched = true;
    events.push({ kind: "wall-climb-request", obstacleId: traversalObstacleId });
  } else if (jumpPressed && input.grounded && currentTraversal === null) {
    jumpAction = resolvePlayerJumpAction(input.oxygen);
    events.push({ kind: "jump", result: jumpAction.kind });
    movement = { kind: "airborne", posture: "standing" };
  }

  const pace = paceForInput(input);
  const horizontalSpeed = Math.hypot(currentVelocity.right, currentVelocity.forward);
  const crouchStarted = input.crouch && !previous.crouchHeld;
  const slideStarted =
    input.grounded &&
    (input.slideRequested === true ||
      (crouchStarted &&
        horizontalSpeed >= PLAYER_SLIDE_START_SPEED_METERS_PER_SECOND &&
        previous.movement.kind === "grounded" &&
        previous.movement.pace === "sprint"));
  if (slideStarted && movementTraversalKind(movement) === null) {
    events.push({ kind: "slide-start" });
    movement = { kind: "slide", elapsedSeconds: 0, progress: 0 };
  }

  let desiredRight: number;
  let desiredForward: number;
  let desiredUp = currentVelocity.up;
  if (movement.kind === "slide") {
    const elapsedSeconds = movement.elapsedSeconds + delta;
    const decay = Math.exp(-PLAYER_SLIDE_FRICTION_RATE * delta);
    desiredRight = currentVelocity.right * decay;
    desiredForward = currentVelocity.forward * decay;
    const speed = Math.hypot(desiredRight, desiredForward);
    if (
      !input.crouch ||
      speed <= PLAYER_SLIDE_END_SPEED_METERS_PER_SECOND ||
      elapsedSeconds >= PLAYER_SLIDE_MAX_SECONDS
    ) {
      events.push({ kind: "slide-end" });
      movement = input.grounded
        ? { kind: "grounded", posture, pace: "run" }
        : { kind: "airborne", posture };
    } else {
      movement = {
        kind: "slide",
        elapsedSeconds,
        progress: clamp(elapsedSeconds / PLAYER_SLIDE_MAX_SECONDS, 0, 1),
      };
    }
  } else if (movementTraversalKind(movement) !== null) {
    desiredRight = currentVelocity.right;
    desiredForward = currentVelocity.forward;
  } else {
    const requestedSpeed = speedForInput(input, pace);
    const target = {
      right: direction.right * direction.magnitude * requestedSpeed,
      forward: direction.forward * direction.magnitude * requestedSpeed,
    };
    const maximumSpeed = input.grounded
      ? PLAYER_SPRINT_SPEED_METERS_PER_SECOND
      : PLAYER_SPRINT_SPEED_METERS_PER_SECOND * PLAYER_AIR_SPEED_RATIO;
    const resolved = resolvePlayerHorizontalVelocity(
      currentVelocity,
      target,
      input.grounded,
      delta,
      maximumSpeed,
    );
    desiredRight = resolved.right;
    desiredForward = resolved.forward;
  }

  if (jumpAction !== null) {
    desiredUp = jumpAction.launchSpeed;
  }

  if (externalTraversal === null && movementTraversalKind(movement) === null) {
    if (jumpAction !== null) {
      movement = { kind: "airborne", posture: "standing" };
    } else if (!input.grounded) {
      movement = { kind: "airborne", posture };
    } else if (!previous.previousGrounded) {
      events.push({ kind: "landing", downwardSpeed: Math.max(0, -currentVelocity.up) });
      movement = { kind: "landing-recovery", elapsedSeconds: 0, progress: 0, posture };
    } else if (movement.kind === "landing-recovery") {
      const elapsedSeconds = movement.elapsedSeconds + delta;
      if (elapsedSeconds >= PLAYER_LANDING_RECOVERY_SECONDS) {
        movement = { kind: "grounded", posture, pace };
      } else {
        movement = {
          kind: "landing-recovery",
          elapsedSeconds,
          progress: clamp(elapsedSeconds / PLAYER_LANDING_RECOVERY_SECONDS, 0, 1),
          posture,
        };
      }
    } else if (movement.kind !== "slide") {
      movement = { kind: "grounded", posture, pace };
    }
  }

  const state: PlayerMovementControllerState = {
    movement,
    jumpHeld: input.jump,
    crouchHeld: input.crouch,
    previousGrounded: input.grounded,
    traversalLatched,
    traversalObstacleId,
    seed: input.seed || previous.seed,
  };
  return {
    state,
    desiredVelocity: {
      right: desiredRight,
      up: desiredUp,
      forward: desiredForward,
    },
    posture,
    traversalProgress: movementStateProgress(movement),
    jumpAction,
    traversalRequest,
    events,
  };
};
