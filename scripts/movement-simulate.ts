import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import {
  createMahjongPhysics,
  type PhysicsBox,
  type PhysicsVector,
  type MahjongPhysicsRuntime,
} from "../apps/web/src/scene/mahjong-physics.js";
import {
  resolveLedgeClimbMomentum,
  resolveLedgeGrabTarget,
  resolveVaultTarget,
  resolveWallHangTargetDetails,
  WALL_CLIMB_SPEED,
} from "../apps/web/src/scene/mahjong-table.js";

type RawScenario = {
  readonly name?: string;
  readonly description?: string;
  readonly frameDurationSec?: unknown;
  readonly reportEveryFrames?: unknown;
  readonly start?: unknown;
  readonly physics?: unknown;
  readonly staticBoxes?: unknown;
  readonly frames?: unknown;
};

type RawScenarioStep = {
  readonly duration?: unknown;
  readonly forward?: unknown;
  readonly right?: unknown;
  readonly jump?: unknown;
  readonly sprint?: unknown;
  readonly crouch?: unknown;
  readonly yawRate?: unknown;
  readonly label?: unknown;
};

type PhysicsConfig = {
  readonly moveSpeed: number;
  readonly sprintMultiplier: number;
  readonly jumpSpeed: number;
  readonly gravity: number;
};

type StartState = {
  readonly position: PhysicsVector;
  readonly yaw: number;
  readonly grounded: boolean;
};

type Scenario = {
  readonly name: string;
  readonly description?: string;
  readonly frameDurationSec: number;
  readonly reportEveryFrames: number;
  readonly start: StartState;
  readonly physics: PhysicsConfig;
  readonly staticBoxes: readonly PhysicsBox[];
  readonly frames: readonly ScenarioStep[];
};

type ScenarioStep = {
  readonly duration: number;
  readonly forward: number;
  readonly right: number;
  readonly jump: boolean;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly yawRate: number;
  readonly label: string | null;
};

type LedgeEvent = {
  readonly targetX: number;
  readonly targetY: number;
  readonly targetZ: number;
  readonly preservedForwardVelocity: number;
  readonly preservedStrafeVelocity: number;
  readonly preserveSprinting: boolean;
};

type FrameSample = {
  readonly timeSec: number;
  readonly frame: number;
  readonly stepIndex: number;
  readonly stepLabel: string;
  readonly position: PhysicsVector;
  readonly velocityY: number;
  readonly grounded: boolean;
  readonly crouching: boolean;
  readonly sprinting: boolean;
  readonly collisions: number;
  readonly ledgeGrab: LedgeEvent | null;
  // A vault is a jump onto a low platform that does not qualify as a ledge.
  // We reuse the same shape as `LedgeEvent` because the data needed (target
  // position and preserved velocities) is identical.
  readonly vaultGrab: LedgeEvent | null;
  // A wallHang event is emitted only on the frame that enters the hanging
  // state. The state fields below describe subsequent hanging/climbing frames.
  readonly wallHang: LedgeEvent | null;
  readonly hanging: boolean;
  readonly climbing: boolean;
  readonly traversalState: TraversalState["kind"];
};

type WallHangingState = {
  readonly kind: "wall-hanging";
  readonly target: PhysicsVector;
  readonly wallNormal: PhysicsVector;
  readonly wallFacePoint: PhysicsVector;
  readonly wallTopY: number;
  readonly box: PhysicsBox;
  elapsed: number;
};

type WallClimbingState = {
  readonly kind: "wall-climbing";
  readonly targetPosition: PhysicsVector;
  readonly wallNormal: PhysicsVector;
  readonly wallTopY: number;
  readonly box: PhysicsBox;
};

type TraversalState = { readonly kind: "none" } | WallHangingState | WallClimbingState;

type SimulationState = {
  position: PhysicsVector;
  verticalVelocity: number;
  yaw: number;
  grounded: boolean;
  lastGrounded: boolean;
  traversal: TraversalState;
};

const DEFAULT_SCENARIO_PATH = resolvePath(
  process.cwd(),
  "scripts/movement-scenarios/default-movement.json",
);

const DEFAULT_MOVE_SPEED = 3.4;
const DEFAULT_SPRINT_MULTIPLIER = 3;
const DEFAULT_JUMP_SPEED = 13.2;
const DEFAULT_GRAVITY = 48;
const PLAYER_COLLIDER_CENTER_HEIGHT = 0.86;
const PLAYER_COLLIDER_RADIUS = 0.26;
const LEDGE_GRAB_MIN_FALL_OFFSET = 0.05;
const FRAME_GROUND_EPSILON = 0.0005;
const WALL_HANG_EPSILON = 0.0001;
const WALL_HANG_SETTLE_DURATION = 0.14;
const WALL_CLIMB_CLEARANCE = 0.01;
const WALL_CLIMB_INWARD_OFFSET = 0.2;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const asVector = (value: unknown): PhysicsVector => {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((entry) => isFiniteNumber(entry))
  ) {
    throw new TypeError("A vector must be [x, y, z] with finite numeric values");
  }
  const [x, y, z] = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    throw new TypeError("A vector must be [x, y, z] with finite numeric values");
  }
  return { x, y, z };
};

const parseBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const parsePositiveNumber = (value: unknown, fallback: number): number => {
  if (!isFiniteNumber(value) || value <= 0) {
    return fallback;
  }
  return value;
};

const parsePercentLike = (value: unknown, min: number, max: number, fallback: number): number =>
  isFiniteNumber(value) && value >= min && value <= max ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const parsePhysicsBox = (box: unknown): PhysicsBox => {
  if (!box || typeof box !== "object" || box === null || Array.isArray(box)) {
    throw new TypeError("Each static collider must be an object");
  }
  const source = box as {
    center?: unknown;
    halfExtents?: unknown;
    rotationX?: unknown;
    rotationY?: unknown;
    rotationZ?: unknown;
    dynamic?: unknown;
    dynamicId?: unknown;
    restitution?: unknown;
    friction?: unknown;
    linearVelocity?: unknown;
    angularVelocity?: unknown;
    linearDamping?: unknown;
    angularDamping?: unknown;
  };
  const rotationX = asFiniteOrUndefined(source.rotationX);
  const rotationY = asFiniteOrUndefined(source.rotationY);
  const rotationZ = asFiniteOrUndefined(source.rotationZ);
  const dynamicId = typeof source.dynamicId === "number" ? source.dynamicId : undefined;
  const restitution =
    source.restitution === undefined ? undefined : asFiniteOrFallback(source.restitution, 0.15);
  const friction =
    source.friction === undefined ? undefined : asFiniteOrFallback(source.friction, 0.9);
  const linearVelocity =
    source.linearVelocity === undefined ? undefined : asVector(source.linearVelocity);
  const angularVelocity =
    source.angularVelocity === undefined ? undefined : asVector(source.angularVelocity);
  const linearDamping =
    source.linearDamping === undefined ? undefined : asFiniteOrFallback(source.linearDamping, 0.2);
  const angularDamping =
    source.angularDamping === undefined
      ? undefined
      : asFiniteOrFallback(source.angularDamping, 0.2);
  return {
    center: asVector(source.center),
    halfExtents: asVector(source.halfExtents),
    ...(rotationX === undefined ? {} : { rotationX }),
    ...(rotationY === undefined ? {} : { rotationY }),
    ...(rotationZ === undefined ? {} : { rotationZ }),
    ...(source.dynamic === true ? { dynamic: true } : {}),
    ...(dynamicId === undefined ? {} : { dynamicId }),
    ...(restitution === undefined ? {} : { restitution }),
    ...(friction === undefined ? {} : { friction }),
    ...(linearVelocity === undefined ? {} : { linearVelocity }),
    ...(angularVelocity === undefined ? {} : { angularVelocity }),
    ...(linearDamping === undefined ? {} : { linearDamping }),
    ...(angularDamping === undefined ? {} : { angularDamping }),
  };
};

const asFiniteOrUndefined = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

const asFiniteOrFallback = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) ? value : fallback;

const parseScenario = (raw: unknown): Scenario => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("Scenario file must be a JSON object");
  }
  const source = raw as RawScenario;

  if (!Array.isArray(source.frames) || source.frames.length < 1) {
    throw new TypeError("Scenario must include at least one frame");
  }

  const staticBoxes = Array.isArray(source.staticBoxes)
    ? source.staticBoxes.map((box, index) => {
        try {
          return parsePhysicsBox(box);
        } catch (error) {
          throw new Error(
            `Invalid static collider at index ${String(index)}: ${String(error instanceof Error ? error.message : "unknown")}`,
          );
        }
      })
    : [];

  const parsedFrames = source.frames.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`Frame ${String(index)} must be an object`);
    }
    const frame = value as RawScenarioStep;
    const duration = parsePositiveNumber(frame.duration, 0.016);
    const forwardRaw = parsePercentLike(frame.forward ?? 0, -1, 1, 0);
    const rightRaw = parsePercentLike(frame.right ?? 0, -1, 1, 0);
    const jump = parseBoolean(frame.jump, false);
    const sprint = parseBoolean(frame.sprint, false);
    const crouch = parseBoolean(frame.crouch, false);
    const yawRate = isFiniteNumber(frame.yawRate) ? frame.yawRate : 0;
    const label = frame.label === undefined || typeof frame.label !== "string" ? null : frame.label;
    return { duration, forward: forwardRaw, right: rightRaw, jump, sprint, crouch, yawRate, label };
  });

  const start: StartState = (() => {
    const provided = source.start ?? {};
    if (typeof provided !== "object" || provided === null || Array.isArray(provided)) {
      throw new TypeError("start must be an object");
    }
    const startRaw = provided as { position?: unknown; yaw?: unknown; grounded?: unknown };
    const position = asVector(startRaw.position ?? [0, PLAYER_COLLIDER_CENTER_HEIGHT, 0]);
    const yaw = isFiniteNumber(startRaw.yaw) ? startRaw.yaw : 0;
    const grounded = parseBoolean(startRaw.grounded, true);
    return { position, yaw, grounded };
  })();

  const physicsSource = source.physics ?? {};
  const physics =
    typeof physicsSource === "object" && physicsSource !== null && !Array.isArray(physicsSource)
      ? {
          moveSpeed: parsePositiveNumber(
            (physicsSource as { moveSpeed?: unknown }).moveSpeed,
            DEFAULT_MOVE_SPEED,
          ),
          sprintMultiplier: parsePositiveNumber(
            (physicsSource as { sprintMultiplier?: unknown }).sprintMultiplier,
            DEFAULT_SPRINT_MULTIPLIER,
          ),
          jumpSpeed: parsePositiveNumber(
            (physicsSource as { jumpSpeed?: unknown }).jumpSpeed,
            DEFAULT_JUMP_SPEED,
          ),
          gravity: parsePositiveNumber(
            (physicsSource as { gravity?: unknown }).gravity,
            DEFAULT_GRAVITY,
          ),
        }
      : {
          moveSpeed: DEFAULT_MOVE_SPEED,
          sprintMultiplier: DEFAULT_SPRINT_MULTIPLIER,
          jumpSpeed: DEFAULT_JUMP_SPEED,
          gravity: DEFAULT_GRAVITY,
        };

  const description = typeof source.description === "string" ? source.description : undefined;
  return {
    name: typeof source.name === "string" ? source.name : "movement-scenario",
    ...(description === undefined ? {} : { description }),
    frameDurationSec: parsePositiveNumber(source.frameDurationSec, 0.016),
    reportEveryFrames: Number.isInteger(source.reportEveryFrames as number)
      ? Math.max(1, Number(source.reportEveryFrames))
      : 10,
    start,
    physics,
    staticBoxes,
    frames: parsedFrames,
  };
};

const computeForwardDirection = (yaw: number): PhysicsVector => ({
  x: -Math.sin(yaw),
  y: 0,
  z: -Math.cos(yaw),
});

const isCapsulePositionClear = (
  position: PhysicsVector,
  staticPhysicsBoxes: readonly PhysicsBox[],
): boolean => {
  const capsuleBottomY = position.y - PLAYER_COLLIDER_CENTER_HEIGHT;
  const capsuleTopY = position.y + PLAYER_COLLIDER_CENTER_HEIGHT;
  for (const box of staticPhysicsBoxes) {
    const minX = box.center.x - box.halfExtents.x;
    const maxX = box.center.x + box.halfExtents.x;
    const minZ = box.center.z - box.halfExtents.z;
    const maxZ = box.center.z + box.halfExtents.z;
    const boxBottomY = box.center.y - box.halfExtents.y;
    const boxTopY = box.center.y + box.halfExtents.y;
    if (capsuleBottomY >= boxTopY - FRAME_GROUND_EPSILON || capsuleTopY <= boxBottomY) {
      continue;
    }
    const closestX = clamp(position.x, minX, maxX);
    const closestZ = clamp(position.z, minZ, maxZ);
    const horizontalDistance = Math.hypot(position.x - closestX, position.z - closestZ);
    if (horizontalDistance < PLAYER_COLLIDER_RADIUS - FRAME_GROUND_EPSILON) {
      return false;
    }
  }
  return true;
};

const resolveWallClimbTarget = (
  wallHang: {
    readonly wallNormal: PhysicsVector;
    readonly wallFacePoint: PhysicsVector;
    readonly wallTopY: number;
    readonly box: PhysicsBox;
  },
  staticPhysicsBoxes: readonly PhysicsBox[],
): PhysicsVector | null => {
  const wallDepth =
    wallHang.wallNormal.x !== 0 ? wallHang.box.halfExtents.x : wallHang.box.halfExtents.z;
  const inwardOffset = Math.min(WALL_CLIMB_INWARD_OFFSET, wallDepth * 0.5);
  const target: PhysicsVector = {
    x: wallHang.wallFacePoint.x - wallHang.wallNormal.x * inwardOffset,
    y: wallHang.wallTopY + PLAYER_COLLIDER_CENTER_HEIGHT + WALL_CLIMB_CLEARANCE,
    z: wallHang.wallFacePoint.z - wallHang.wallNormal.z * inwardOffset,
  };
  return isCapsulePositionClear(target, staticPhysicsBoxes) ? target : null;
};

const advanceWallClimb = (
  position: PhysicsVector,
  targetPosition: PhysicsVector,
  delta: number,
): { readonly position: PhysicsVector; readonly reachedTarget: boolean } => {
  let nextPosition = { ...position };
  let remainingDistance = WALL_CLIMB_SPEED * delta;
  if (nextPosition.y < targetPosition.y) {
    const verticalDistance = Math.min(remainingDistance, targetPosition.y - nextPosition.y);
    nextPosition = { ...nextPosition, y: nextPosition.y + verticalDistance };
    remainingDistance -= verticalDistance;
  }
  const horizontalDelta = {
    x: targetPosition.x - nextPosition.x,
    z: targetPosition.z - nextPosition.z,
  };
  const horizontalDistance = Math.hypot(horizontalDelta.x, horizontalDelta.z);
  if (remainingDistance > 0 && horizontalDistance > FRAME_GROUND_EPSILON) {
    const horizontalDistanceStep = Math.min(remainingDistance, horizontalDistance);
    nextPosition = {
      ...nextPosition,
      x: nextPosition.x + (horizontalDelta.x / horizontalDistance) * horizontalDistanceStep,
      z: nextPosition.z + (horizontalDelta.z / horizontalDistance) * horizontalDistanceStep,
    };
  }
  const reachedTarget =
    Math.abs(nextPosition.y - targetPosition.y) <= FRAME_GROUND_EPSILON &&
    Math.hypot(nextPosition.x - targetPosition.x, nextPosition.z - targetPosition.z) <=
      FRAME_GROUND_EPSILON;
  return { position: nextPosition, reachedTarget };
};

const runScenario = async (
  scenario: Scenario,
): Promise<{
  readonly name: string;
  readonly description?: string;
  readonly durationSec: number;
  readonly finalPosition: PhysicsVector;
  readonly finalYaw: number;
  readonly finalGrounded: boolean;
  readonly finalHanging: boolean;
  readonly finalClimbing: boolean;
  readonly verticalVelocity: number;
  readonly distanceXY: number;
  readonly frameCount: number;
  readonly maxHorizontalSpeed: number;
  readonly samples: readonly FrameSample[];
}> => {
  const defaultFloor: PhysicsBox = {
    center: { x: 0, y: -0.5, z: 0 },
    halfExtents: { x: 100, y: 0.5, z: 100 },
  };
  const runtime: MahjongPhysicsRuntime = await createMahjongPhysics([
    defaultFloor,
    ...scenario.staticBoxes,
  ]);

  try {
    const startState = scenario.start;
    const state: SimulationState = {
      position: { ...startState.position },
      verticalVelocity: 0,
      yaw: startState.yaw,
      grounded: startState.grounded,
      lastGrounded: startState.grounded,
      traversal: { kind: "none" },
    };
    const samples: FrameSample[] = [];
    let frameTimeSec = 0;
    let frameIndex = 0;
    // Track total planar distance traveled (X‑Z plane). The original implementation
    // mistakenly used the variable name `distanceXy` (lower‑case "y"), but the function
    // later attempted to return `distanceXY`. This caused a runtime error:
    // "distanceXY is not defined". We rename the variable to `distanceXY` for
    // consistency with the returned summary.
    let distanceXY = 0;
    let maxHorizontalSpeed = 0;

    const frameDurationSec = scenario.frameDurationSec;

    for (const [stepIndex, step] of scenario.frames.entries()) {
      const requestedFrames = Math.max(1, Math.ceil(step.duration / frameDurationSec));
      for (let i = 0; i < requestedFrames; i += 1) {
        const delta = step.duration / requestedFrames;
        frameTimeSec += delta;
        const previous = { ...state.position };
        const fromPosition = { ...state.position };
        state.lastGrounded = state.grounded;

        const forwardInput = clamp(step.forward, -1, 1);
        const rightInput = clamp(step.right, -1, 1);
        const inputMagnitude = Math.hypot(forwardInput, rightInput);
        const normalizedForward =
          inputMagnitude <= 1 || inputMagnitude === 0
            ? forwardInput
            : forwardInput / inputMagnitude;
        const normalizedRight =
          inputMagnitude <= 1 || inputMagnitude === 0 ? rightInput : rightInput / inputMagnitude;
        const movementFactor = clamp(inputMagnitude, 0, 1);
        const canSprint = step.sprint && inputMagnitude > 0 && !step.crouch;
        const sprinting = canSprint;
        const moveSpeed =
          scenario.physics.moveSpeed *
          (step.crouch ? 0.5 : 1) *
          (sprinting ? scenario.physics.sprintMultiplier : 1);
        const requestedForwardSpeed = normalizedForward * moveSpeed * movementFactor;
        const requestedRightSpeed = normalizedRight * moveSpeed * movementFactor;

        maxHorizontalSpeed = Math.max(
          maxHorizontalSpeed,
          Math.hypot(requestedForwardSpeed, requestedRightSpeed),
        );

        let ledgeEvent: LedgeEvent | null = null;
        let vaultEvent: LedgeEvent | null = null;
        // This is intentionally frame-local. It describes only the transition
        // into hanging and cannot leak into later samples.
        let wallHangEvent: LedgeEvent | null = null;
        let movement = {
          position: { ...state.position },
          grounded: state.grounded,
          collisions: 0,
        };

        const traversalAtFrameStart = state.traversal;
        if (traversalAtFrameStart.kind === "wall-hanging") {
          state.position = { ...traversalAtFrameStart.target };
          state.grounded = false;
          state.verticalVelocity = 0;
          movement = { position: { ...state.position }, grounded: false, collisions: 0 };
          traversalAtFrameStart.elapsed = Math.min(
            traversalAtFrameStart.elapsed + delta,
            WALL_HANG_SETTLE_DURATION,
          );
          if (step.forward < 0) {
            // Backward input releases the wall; the ordinary movement path
            // below handles the resulting fall or retreat.
            state.traversal = { kind: "none" };
          } else if (
            traversalAtFrameStart.elapsed >= WALL_HANG_SETTLE_DURATION &&
            (step.forward > 0 || step.jump)
          ) {
            const targetPosition = resolveWallClimbTarget(
              traversalAtFrameStart,
              scenario.staticBoxes,
            );
            if (targetPosition !== null) {
              state.traversal = {
                kind: "wall-climbing",
                targetPosition,
                wallNormal: traversalAtFrameStart.wallNormal,
                wallTopY: traversalAtFrameStart.wallTopY,
                box: traversalAtFrameStart.box,
              };
            }
          }
        }

        if (state.traversal.kind === "wall-hanging") {
          // Gravity and ordinary movement are suppressed while attached.
          state.grounded = false;
          state.verticalVelocity = 0;
        } else if (state.traversal.kind === "wall-climbing") {
          const climb = advanceWallClimb(state.position, state.traversal.targetPosition, delta);
          state.position = climb.position;
          state.grounded = false;
          state.verticalVelocity = 0;
          movement = { position: { ...state.position }, grounded: false, collisions: 0 };
          if (climb.reachedTarget) {
            const landingMovement = runtime.move(state.position, { x: 0, y: 0, z: 0 });
            const targetBottomY = state.position.y - PLAYER_COLLIDER_CENTER_HEIGHT;
            const box = state.traversal.box;
            const boxTopY = box.center.y + box.halfExtents.y;
            const supportedByWallTop =
              Math.abs(targetBottomY - boxTopY) <= 0.03 &&
              state.position.x >= box.center.x - box.halfExtents.x &&
              state.position.x <= box.center.x + box.halfExtents.x &&
              state.position.z >= box.center.z - box.halfExtents.z &&
              state.position.z <= box.center.z + box.halfExtents.z;
            state.position = landingMovement.position;
            state.grounded = landingMovement.grounded || supportedByWallTop;
            state.verticalVelocity = 0;
            state.traversal = { kind: "none" };
            movement = landingMovement;
          }
        } else {
          const jumpStarted = step.jump && state.lastGrounded;
          if (step.jump && state.grounded) {
            state.verticalVelocity = scenario.physics.jumpSpeed;
            state.grounded = false;
          }

          const forward = computeForwardDirection(state.yaw);
          const right = { x: -forward.z, y: 0, z: forward.x };
          const desiredHorizontalDelta = {
            x: (requestedForwardSpeed * forward.x + requestedRightSpeed * right.x) * delta,
            y: 0,
            z: (requestedForwardSpeed * forward.z + requestedRightSpeed * right.z) * delta,
          };
          const desiredDelta = {
            x: desiredHorizontalDelta.x,
            y: state.verticalVelocity * delta,
            z: desiredHorizontalDelta.z,
          };

          movement = runtime.move(state.position, desiredDelta);
          state.position = movement.position;
          state.grounded = movement.grounded && state.verticalVelocity <= 0;
          if (!state.grounded) {
            state.verticalVelocity -= scenario.physics.gravity * delta;
          } else if (state.verticalVelocity < 0) {
            state.verticalVelocity = 0;
          }

          const justLeftGround = state.lastGrounded && !state.grounded;
          const jumpOffset = Math.max(0, movement.position.y - PLAYER_COLLIDER_CENTER_HEIGHT);
          const horizontalVelocity = {
            x: desiredHorizontalDelta.x / Math.max(delta, FRAME_GROUND_EPSILON),
            y: 0,
            z: desiredHorizontalDelta.z / Math.max(delta, FRAME_GROUND_EPSILON),
          };
          const canUseAirborneTraversal =
            (jumpStarted || !state.lastGrounded) &&
            !state.grounded &&
            (!movement.grounded || state.verticalVelocity > 0) &&
            jumpOffset > LEDGE_GRAB_MIN_FALL_OFFSET &&
            desiredHorizontalDelta.x ** 2 + desiredHorizontalDelta.z ** 2 > 0.0002;
          const canUseLedgeGrab =
            canUseAirborneTraversal && state.verticalVelocity <= 0 && movement.collisions > 0;
          const ledgeGrabTarget =
            canUseLedgeGrab && (justLeftGround || jumpOffset > LEDGE_GRAB_MIN_FALL_OFFSET)
              ? resolveLedgeGrabTarget(
                  fromPosition,
                  horizontalVelocity,
                  fromPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT,
                  scenario.staticBoxes,
                  [],
                )
              : null;

          // Resolve ledge-grab first – if that succeeds we ignore vault and
          // wall-hang logic for this frame.
          if (ledgeGrabTarget !== null) {
            const momentum = resolveLedgeClimbMomentum(
              requestedForwardSpeed,
              requestedRightSpeed,
              0,
              0,
              sprinting,
              scenario.physics.moveSpeed,
            );
            const transitionY = ledgeGrabTarget.y - PLAYER_COLLIDER_CENTER_HEIGHT;
            state.position.y = Math.max(state.position.y, clamp(transitionY, -50, 50));
            state.position.x = ledgeGrabTarget.x;
            state.position.z = ledgeGrabTarget.z;
            state.grounded = true;
            state.verticalVelocity = 0;
            state.traversal = { kind: "none" };
            ledgeEvent = {
              targetX: ledgeGrabTarget.x,
              targetY: ledgeGrabTarget.y,
              targetZ: ledgeGrabTarget.z,
              preservedForwardVelocity: momentum.preservedForwardVelocity,
              preservedStrafeVelocity: momentum.preservedStrafeVelocity,
              preserveSprinting: momentum.preserveSprinting,
            };
          } else {
            const vaultTarget = canUseAirborneTraversal
              ? resolveVaultTarget(
                  fromPosition,
                  horizontalVelocity,
                  fromPosition.y - PLAYER_COLLIDER_CENTER_HEIGHT,
                  scenario.staticBoxes,
                )
              : null;
            const horizontalApproachDistance = Math.hypot(
              desiredHorizontalDelta.x,
              desiredHorizontalDelta.z,
            );
            const approachDistance =
              horizontalApproachDistance > WALL_HANG_EPSILON
                ? (movement.position.x - fromPosition.x) *
                    (desiredHorizontalDelta.x / horizontalApproachDistance) +
                  (movement.position.z - fromPosition.z) *
                    (desiredHorizontalDelta.z / horizontalApproachDistance)
                : 0;
            const horizontalMotionBlocked =
              horizontalApproachDistance > 0.015 &&
              approachDistance + WALL_HANG_EPSILON < horizontalApproachDistance;
            // Wall hanging is an approach traversal, not a generic collision
            // recovery. A floor, ceiling, or unrelated prop can also produce
            // a Rapier collision while a wall happens to be nearby. Only a
            // blocked horizontal approach may enter the wall resolver; the
            // resolver then applies the near-top, reach, face, and overlap
            // checks.
            const wallContact = horizontalMotionBlocked;
            if (vaultTarget !== null) {
              state.position = { ...vaultTarget };
              state.grounded = true;
              state.verticalVelocity = 0;
              state.traversal = { kind: "none" };
              vaultEvent = {
                targetX: vaultTarget.x,
                targetY: vaultTarget.y,
                targetZ: vaultTarget.z,
                preservedForwardVelocity: requestedForwardSpeed,
                preservedStrafeVelocity: requestedRightSpeed,
                preserveSprinting: sprinting,
              };
            } else if (canUseAirborneTraversal && wallContact) {
              const wallPhysicsPosition = movement.position;
              const wallHang = resolveWallHangTargetDetails(
                wallPhysicsPosition,
                forward,
                scenario.staticBoxes,
              );
              const resolvedWallHang =
                wallHang ??
                (horizontalMotionBlocked
                  ? resolveWallHangTargetDetails(fromPosition, forward, scenario.staticBoxes)
                  : null);
              if (resolvedWallHang !== null) {
                state.position = { ...resolvedWallHang.target };
                state.verticalVelocity = 0;
                state.grounded = false;
                state.traversal = {
                  kind: "wall-hanging",
                  target: resolvedWallHang.target,
                  wallNormal: resolvedWallHang.wallNormal,
                  wallFacePoint: resolvedWallHang.wallFacePoint,
                  wallTopY: resolvedWallHang.wallTopY,
                  box: resolvedWallHang.box,
                  elapsed: 0,
                };
                wallHangEvent = {
                  targetX: resolvedWallHang.target.x,
                  targetY: resolvedWallHang.target.y,
                  targetZ: resolvedWallHang.target.z,
                  preservedForwardVelocity: requestedForwardSpeed,
                  preservedStrafeVelocity: requestedRightSpeed,
                  preserveSprinting: sprinting,
                };
              }
            }
          }
        }

        const planarDelta = Math.hypot(
          state.position.x - previous.x,
          state.position.z - previous.z,
        );
        distanceXY += planarDelta;

        if (
          state.grounded &&
          state.position.y - PLAYER_COLLIDER_CENTER_HEIGHT < FRAME_GROUND_EPSILON &&
          !state.lastGrounded
        ) {
          state.position.y = PLAYER_COLLIDER_CENTER_HEIGHT;
          state.verticalVelocity = 0;
        }

        if (
          frameIndex % scenario.reportEveryFrames === 0 ||
          ledgeEvent !== null ||
          vaultEvent !== null ||
          wallHangEvent !== null ||
          i === requestedFrames - 1
        ) {
          samples.push({
            timeSec: frameTimeSec,
            frame: frameIndex,
            stepIndex,
            stepLabel: step.label ?? `step-${String(stepIndex + 1)}`,
            position: {
              x: state.position.x,
              y: state.position.y,
              z: state.position.z,
            },
            velocityY: state.verticalVelocity,
            grounded: state.grounded,
            crouching: step.crouch,
            sprinting,
            collisions: movement.collisions,
            ledgeGrab: ledgeEvent,
            vaultGrab: vaultEvent,
            wallHang: wallHangEvent,
            hanging: state.traversal.kind === "wall-hanging",
            climbing: state.traversal.kind === "wall-climbing",
            traversalState: state.traversal.kind,
          });
        }

        state.yaw += step.yawRate * delta;
        frameIndex += 1;
      }
    }

    const totalFrames = frameIndex;
    const description = scenario.description;
    return {
      name: scenario.name,
      ...(description === undefined ? {} : { description }),
      durationSec: frameTimeSec,
      finalPosition: state.position,
      finalYaw: state.yaw,
      finalGrounded: state.grounded,
      finalHanging: state.traversal.kind === "wall-hanging",
      finalClimbing: state.traversal.kind === "wall-climbing",
      verticalVelocity: state.verticalVelocity,
      distanceXY,
      frameCount: totalFrames,
      maxHorizontalSpeed,
      samples,
    };
  } finally {
    runtime.dispose();
  }
};

const formatSummary = (summary: Awaited<ReturnType<typeof runScenario>>): string => {
  const lines = [
    `name: ${summary.name}`,
    summary.description === undefined ? null : `description: ${summary.description}`,
    `frames: ${summary.frameCount}`,
    `duration_sec: ${summary.durationSec.toFixed(3)}`,
    `distance_xy_m: ${summary.distanceXY.toFixed(4)}`,
    `max_horizontal_speed_m_s: ${summary.maxHorizontalSpeed.toFixed(3)}`,
    `final_position_m: x=${summary.finalPosition.x.toFixed(3)} y=${summary.finalPosition.y.toFixed(3)} z=${summary.finalPosition.z.toFixed(3)}`,
    `final_yaw_rad: ${summary.finalYaw.toFixed(4)}`,
    `final_grounded: ${String(summary.finalGrounded)}`,
    `final_hanging: ${String(summary.finalHanging)}`,
    `final_climbing: ${String(summary.finalClimbing)}`,
    `final_vertical_velocity_m_s: ${summary.verticalVelocity.toFixed(3)}`,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
};

const parseArgs = (): { readonly scenarioPath: string; readonly emitJson: boolean } => {
  const args = process.argv.slice(2);
  const emitJson = args.includes("--json");
  const positional = args.filter((entry) => !entry.startsWith("--"));
  return {
    scenarioPath: positional[0] ?? DEFAULT_SCENARIO_PATH,
    emitJson,
  };
};

const readScenarioFile = async (path: string): Promise<Scenario> => {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  return parseScenario(raw);
};

const main = async (): Promise<void> => {
  const { scenarioPath, emitJson } = parseArgs();
  const scenario = await readScenarioFile(scenarioPath);
  const summary = await runScenario(scenario);
  if (emitJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatSummary(summary)}\n`);
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown movement simulation error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
