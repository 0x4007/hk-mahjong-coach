import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import {
  createMahjongPhysics,
  type MahjongPhysicsRuntime,
  type PhysicsBox,
  type PhysicsVector,
} from "../apps/web/src/scene/mahjong-physics.js";
import {
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_JUMP_SPEED,
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_MULTIPLIER,
  WORLD_EPSILON,
  WORLD_GRAVITY,
} from "../apps/web/src/scene/world-scale.js";
import { isPlayerTouchingWall } from "../apps/web/src/scene/wall-contact.js";
import {
  resolveWallClimbProgress,
  resolveWallClimbTargetAtContact,
  resolveWallClimbVelocity,
  type WallClimbGeometryResolution,
} from "../apps/web/src/scene/wall-climb.js";

type RawScenario = {
  readonly name?: unknown;
  readonly description?: unknown;
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

type Scenario = {
  readonly name: string;
  readonly description?: string;
  readonly frameDurationSec: number;
  readonly reportEveryFrames: number;
  readonly start: {
    readonly position: PhysicsVector;
    readonly yaw: number;
    readonly grounded: boolean;
  };
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
  readonly wallContact: boolean;
  readonly climbing: boolean;
  readonly climbProgress: number | null;
};

type SimulationState = {
  position: PhysicsVector;
  verticalVelocity: number;
  yaw: number;
  grounded: boolean;
  wallClimb: {
    readonly startY: number;
    readonly target: WallClimbGeometryResolution;
  } | null;
};

const DEFAULT_SCENARIO_PATH = resolvePath(
  process.cwd(),
  "scripts/movement-scenarios/default-movement.json",
);
const DEFAULT_MOVE_SPEED = PLAYER_MOVE_SPEED_METERS_PER_SECOND;
const DEFAULT_SPRINT_MULTIPLIER = PLAYER_SPRINT_MULTIPLIER;
const DEFAULT_JUMP_SPEED = PLAYER_JUMP_SPEED;
const DEFAULT_GRAVITY = WORLD_GRAVITY;
const PLAYER_COLLIDER_CENTER_HEIGHT = PLAYER_CAPSULE_CENTER_HEIGHT;
const FRAME_GROUND_EPSILON = WORLD_EPSILON;

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

const asFiniteOrUndefined = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

const asFiniteOrFallback = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) ? value : fallback;

const parseBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const parsePositiveNumber = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) && value > 0 ? value : fallback;

const parsePercentLike = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) && value >= -1 && value <= 1 ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const parsePhysicsBox = (value: unknown): PhysicsBox => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Each static collider must be an object");
  }
  const source = value as {
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
  const dynamicId = isFiniteNumber(source.dynamicId) ? source.dynamicId : undefined;
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

const parseScenario = (raw: unknown): Scenario => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("Scenario file must be a JSON object");
  }
  const source = raw as RawScenario;
  if (!Array.isArray(source.frames) || source.frames.length === 0) {
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
  const frames = source.frames.map((value, index): ScenarioStep => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`Frame ${String(index)} must be an object`);
    }
    const frame = value as RawScenarioStep;
    return {
      duration: parsePositiveNumber(frame.duration, 0.016),
      forward: parsePercentLike(frame.forward ?? 0, 0),
      right: parsePercentLike(frame.right ?? 0, 0),
      jump: parseBoolean(frame.jump, false),
      sprint: parseBoolean(frame.sprint, false),
      crouch: parseBoolean(frame.crouch, false),
      yawRate: isFiniteNumber(frame.yawRate) ? frame.yawRate : 0,
      label: typeof frame.label === "string" ? frame.label : null,
    };
  });
  const startValue = source.start ?? {};
  if (typeof startValue !== "object" || startValue === null || Array.isArray(startValue)) {
    throw new TypeError("start must be an object");
  }
  const startSource = startValue as { position?: unknown; yaw?: unknown; grounded?: unknown };
  const physicsValue = source.physics ?? {};
  const physicsSource =
    typeof physicsValue === "object" && physicsValue !== null && !Array.isArray(physicsValue)
      ? (physicsValue as {
          moveSpeed?: unknown;
          sprintMultiplier?: unknown;
          jumpSpeed?: unknown;
          gravity?: unknown;
        })
      : {};
  return {
    name: typeof source.name === "string" ? source.name : "movement-scenario",
    ...(typeof source.description === "string" ? { description: source.description } : {}),
    frameDurationSec: parsePositiveNumber(source.frameDurationSec, 0.016),
    reportEveryFrames:
      isFiniteNumber(source.reportEveryFrames) && Number.isInteger(source.reportEveryFrames)
        ? Math.max(1, source.reportEveryFrames)
        : 10,
    start: {
      position: asVector(startSource.position ?? [0, PLAYER_COLLIDER_CENTER_HEIGHT, 0]),
      yaw: isFiniteNumber(startSource.yaw) ? startSource.yaw : 0,
      grounded: parseBoolean(startSource.grounded, true),
    },
    physics: {
      moveSpeed: parsePositiveNumber(physicsSource.moveSpeed, DEFAULT_MOVE_SPEED),
      sprintMultiplier: parsePositiveNumber(
        physicsSource.sprintMultiplier,
        DEFAULT_SPRINT_MULTIPLIER,
      ),
      jumpSpeed: parsePositiveNumber(physicsSource.jumpSpeed, DEFAULT_JUMP_SPEED),
      gravity: parsePositiveNumber(physicsSource.gravity, DEFAULT_GRAVITY),
    },
    staticBoxes,
    frames,
  };
};

const computeForwardDirection = (yaw: number): PhysicsVector => ({
  x: -Math.sin(yaw),
  y: 0,
  z: -Math.cos(yaw),
});

const runScenario = async (
  scenario: Scenario,
): Promise<{
  readonly name: string;
  readonly description?: string;
  readonly durationSec: number;
  readonly finalPosition: PhysicsVector;
  readonly finalYaw: number;
  readonly finalGrounded: boolean;
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
    const state: SimulationState = {
      position: { ...scenario.start.position },
      verticalVelocity: 0,
      yaw: scenario.start.yaw,
      grounded: scenario.start.grounded,
      wallClimb: null,
    };
    const samples: FrameSample[] = [];
    let frameTimeSec = 0;
    let frameIndex = 0;
    let distanceXY = 0;
    let maxHorizontalSpeed = 0;
    let jumpHeld = false;
    let wallClimbPressConsumed = false;
    const collisionBoxes: readonly PhysicsBox[] = [defaultFloor, ...scenario.staticBoxes];
    for (const [stepIndex, step] of scenario.frames.entries()) {
      const requestedFrames = Math.max(1, Math.ceil(step.duration / scenario.frameDurationSec));
      for (let i = 0; i < requestedFrames; i += 1) {
        const delta = step.duration / requestedFrames;
        frameTimeSec += delta;
        const previous = { ...state.position };
        const forwardInput = clamp(step.forward, -1, 1);
        const rightInput = clamp(step.right, -1, 1);
        const inputMagnitude = Math.hypot(forwardInput, rightInput);
        const directionScale = inputMagnitude > 1 ? 1 / inputMagnitude : 1;
        const normalizedForward = forwardInput * directionScale;
        const normalizedRight = rightInput * directionScale;
        const movementFactor = Math.min(1, inputMagnitude);
        const sprinting = step.sprint && inputMagnitude > 0 && !step.crouch;
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
        const jumpPressed = step.jump && !jumpHeld;
        jumpHeld = step.jump;
        if (jumpPressed) {
          wallClimbPressConsumed = false;
        }
        const wallContactBeforeMove = isPlayerTouchingWall(state.position, collisionBoxes, {
          radius: PLAYER_CAPSULE_RADIUS,
          halfHeight: PLAYER_CAPSULE_HALF_HEIGHT,
        });
        if (jumpPressed && state.grounded) {
          state.verticalVelocity = scenario.physics.jumpSpeed;
          state.grounded = false;
        } else if (
          jumpPressed &&
          !state.grounded &&
          wallContactBeforeMove &&
          state.wallClimb === null
        ) {
          const resolution = resolveWallClimbTargetAtContact(state.position, collisionBoxes, {
            radius: PLAYER_CAPSULE_RADIUS,
            halfHeight: PLAYER_CAPSULE_HALF_HEIGHT,
          });
          if (resolution !== null && resolution.targetCenterY > state.position.y + WORLD_EPSILON) {
            state.wallClimb = {
              startY: state.position.y,
              target: resolution,
            };
            wallClimbPressConsumed = true;
            state.grounded = false;
          }
        }
        if (
          step.jump &&
          !state.grounded &&
          state.wallClimb === null &&
          !wallClimbPressConsumed &&
          wallContactBeforeMove
        ) {
          const resolution = resolveWallClimbTargetAtContact(state.position, collisionBoxes, {
            radius: PLAYER_CAPSULE_RADIUS,
            halfHeight: PLAYER_CAPSULE_HALF_HEIGHT,
          });
          if (resolution !== null && resolution.targetCenterY > state.position.y + WORLD_EPSILON) {
            state.wallClimb = {
              startY: state.position.y,
              target: resolution,
            };
            wallClimbPressConsumed = true;
            state.grounded = false;
          }
        }
        if (!step.jump) {
          state.wallClimb = null;
          wallClimbPressConsumed = false;
        }
        let climbThisFrame = state.wallClimb !== null && step.jump && !state.grounded;
        if (climbThisFrame && !wallContactBeforeMove) {
          state.wallClimb = null;
          climbThisFrame = false;
        }
        if (climbThisFrame && state.wallClimb !== null) {
          state.verticalVelocity -= scenario.physics.gravity * delta;
          const progress = resolveWallClimbProgress(
            state.position.y,
            state.wallClimb.startY,
            state.wallClimb.target.targetCenterY,
          );
          state.verticalVelocity = resolveWallClimbVelocity({
            currentVelocity: state.verticalVelocity,
            progress,
            deltaSeconds: delta,
          });
          const remainingHeight = state.wallClimb.target.targetCenterY - state.position.y;
          if (remainingHeight <= WORLD_EPSILON) {
            state.wallClimb = null;
            climbThisFrame = false;
          } else if (state.verticalVelocity > 0) {
            state.verticalVelocity = Math.min(state.verticalVelocity, remainingHeight / delta);
          }
        }
        const forward = computeForwardDirection(state.yaw);
        const right = { x: -forward.z, y: 0, z: forward.x };
        const desiredDelta = {
          x: (requestedForwardSpeed * forward.x + requestedRightSpeed * right.x) * delta,
          y: state.verticalVelocity * delta,
          z: (requestedForwardSpeed * forward.z + requestedRightSpeed * right.z) * delta,
        };
        const movement = runtime.move(state.position, desiredDelta);
        state.position = movement.position;
        state.grounded = movement.grounded && state.verticalVelocity <= 0;
        if (!state.grounded && !climbThisFrame) {
          state.verticalVelocity -= scenario.physics.gravity * delta;
        } else if (state.verticalVelocity < 0) {
          state.verticalVelocity = 0;
        }
        const wallContactAfterMove = isPlayerTouchingWall(state.position, collisionBoxes, {
          radius: PLAYER_CAPSULE_RADIUS,
          halfHeight: PLAYER_CAPSULE_HALF_HEIGHT,
        });
        if (state.wallClimb !== null) {
          const reachedWallTop =
            state.position.y >= state.wallClimb.target.targetCenterY - WORLD_EPSILON;
          const released = !step.jump;
          if (released || state.grounded || !wallContactAfterMove || reachedWallTop) {
            state.wallClimb = null;
            if (!released && (state.grounded || !wallContactAfterMove || reachedWallTop)) {
              // The pull has reached or cleared the real top. Remove the
              // remaining upward velocity so a short object cannot be
              // overshot before gravity/support resolves on the next frame.
              state.verticalVelocity = 0;
            }
          }
        }
        distanceXY += Math.hypot(state.position.x - previous.x, state.position.z - previous.z);
        if (
          state.grounded &&
          state.position.y - PLAYER_COLLIDER_CENTER_HEIGHT < FRAME_GROUND_EPSILON
        ) {
          state.position.y = PLAYER_COLLIDER_CENTER_HEIGHT;
          state.verticalVelocity = 0;
        }
        if (frameIndex % scenario.reportEveryFrames === 0 || i === requestedFrames - 1) {
          samples.push({
            timeSec: frameTimeSec,
            frame: frameIndex,
            stepIndex,
            stepLabel: step.label ?? `step-${String(stepIndex + 1)}`,
            position: { ...state.position },
            velocityY: state.verticalVelocity,
            grounded: state.grounded,
            crouching: step.crouch,
            sprinting,
            collisions: movement.collisions,
            wallContact: wallContactAfterMove,
            climbing: state.wallClimb !== null,
            climbProgress:
              state.wallClimb === null
                ? null
                : resolveWallClimbProgress(
                    state.position.y,
                    state.wallClimb.startY,
                    state.wallClimb.target.targetCenterY,
                  ),
          });
        }
        state.yaw += step.yawRate * delta;
        frameIndex += 1;
      }
    }
    return {
      name: scenario.name,
      ...(scenario.description === undefined ? {} : { description: scenario.description }),
      durationSec: frameTimeSec,
      finalPosition: state.position,
      finalYaw: state.yaw,
      finalGrounded: state.grounded,
      verticalVelocity: state.verticalVelocity,
      distanceXY,
      frameCount: frameIndex,
      maxHorizontalSpeed,
      samples,
    };
  } finally {
    runtime.dispose();
  }
};

const formatSummary = (summary: Awaited<ReturnType<typeof runScenario>>): string =>
  [
    `name: ${summary.name}`,
    summary.description === undefined ? null : `description: ${summary.description}`,
    `frames: ${summary.frameCount}`,
    `duration_sec: ${summary.durationSec.toFixed(3)}`,
    `distance_xy_m: ${summary.distanceXY.toFixed(4)}`,
    `max_horizontal_speed_m_s: ${summary.maxHorizontalSpeed.toFixed(3)}`,
    `final_position_m: x=${summary.finalPosition.x.toFixed(3)} y=${summary.finalPosition.y.toFixed(3)} z=${summary.finalPosition.z.toFixed(3)}`,
    `final_yaw_rad: ${summary.finalYaw.toFixed(4)}`,
    `final_grounded: ${String(summary.finalGrounded)}`,
    `final_vertical_velocity_m_s: ${summary.verticalVelocity.toFixed(3)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

const parseArgs = (): { readonly scenarioPath: string; readonly emitJson: boolean } => {
  const args = process.argv.slice(2);
  return {
    scenarioPath: args.find((entry) => !entry.startsWith("--")) ?? DEFAULT_SCENARIO_PATH,
    emitJson: args.includes("--json"),
  };
};

const main = async (): Promise<void> => {
  const { scenarioPath, emitJson } = parseArgs();
  const scenario = parseScenario(JSON.parse(await readFile(scenarioPath, "utf8")) as unknown);
  const summary = await runScenario(scenario);
  process.stdout.write(`${emitJson ? JSON.stringify(summary, null, 2) : formatSummary(summary)}\n`);
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown movement simulation error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
