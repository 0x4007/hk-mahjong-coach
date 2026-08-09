import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCameraMotionDamper,
  resolveCameraLocalAccelerationFromVelocityDelta,
  type CameraMotionOffsets,
  type CameraMotionUpdateInput,
} from "../apps/web/src/scene/camera-motion.js";
import {
  createFallbackMahjongPhysics,
  createMahjongPhysics,
  resolvePhysicsBoxGeometrySignature,
  resolvePhysicsBoxObstacleId,
  type MahjongPhysicsRuntime,
  type PhysicsBox,
  type PhysicsContact,
  type PhysicsMovement,
  type PhysicsVector,
} from "../apps/web/src/scene/mahjong-physics.js";
import {
  isPlayerCapsulePositionClear,
  LOW_OBSTACLE_VAULT_MAX_HEIGHT,
  resolveCameraVerticalOffsetBounds,
  resolveLedgeGrabTargetDetails,
  resolveO2ScaledTraversalDuration,
  resolveReticlePresentation,
  resolveVaultTargetDetails,
  resolveVaultTraversalArcHeight,
  resolveVaultTraversalDuration,
  resolveVaultTraversalO2Cost,
  resolveWallClimbTarget,
  resolveWallHangTargetDetails,
  WALL_HANG_ATTACHMENT_TOLERANCE,
  WALL_HANG_CONTACT_PROBE_DISTANCE,
  WALL_HANG_SETTLE_DURATION,
  type TraversalTargetResolution,
} from "../apps/web/src/scene/mahjong-table.js";
import {
  PLAYER_MOVEMENT_MAX_STEP_SECONDS,
  createPlayerMovementControllerState,
  stepPlayerMovementController,
  type PlayerExternalTraversalState,
  type PlayerMovementContact,
  type PlayerMovementControllerState,
  type PlayerMovementEvent,
  type PlayerMovementPosture,
  type PlayerMovementVector,
  type PlayerTraversalKind,
} from "../apps/web/src/scene/player-movement.js";
import { resolveLandingO2Cost } from "../apps/web/src/scene/player-impact.js";
import {
  O2_JUMP_RECOVERY_DELAY_SECONDS,
  O2_LANDING_RECOVERY_DELAY_SECONDS,
  O2_SPRINT_DRAIN_PER_SECOND,
  PLAYER_MAX_O2,
  applyPlayerO2Cost,
  applyPlayerO2ImpactCost,
  canAffordPlayerO2Cost,
  createPlayerVitals,
  setPlayerHoldingBreath,
  tickPlayerVitals,
  type PlayerVitalsState,
} from "../apps/web/src/scene/player-vitals.js";
import {
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_STANDING_EYE_HEIGHT,
  PLAYER_SUPPORT_SNAP_HEIGHT,
  WORLD_GRAVITY,
} from "../apps/web/src/scene/world-scale.js";

export const MOVEMENT_SCENARIO_SCHEMA_VERSION = 2 as const;

const DEFAULT_SCENARIO_PATH = resolvePath(
  process.cwd(),
  "scripts/movement-scenarios/walk-acceleration.json",
);
const DEFAULT_FRAME_DURATION_SECONDS = 1 / 60;
const DEFAULT_FLOOR: PhysicsBox = {
  obstacleId: "floor",
  center: { x: 0, y: -0.5, z: 0 },
  halfExtents: { x: 100, y: 0.5, z: 100 },
};
const RETICLE_VIEWPORT_WIDTH = 1920;
const RETICLE_VIEWPORT_HEIGHT = 1080;
const TRAVERSAL_CONTACT_EPSILON = 0.03;

type PhysicsRuntimeKind = "fallback" | "rapier";

export interface MovementScenarioStart {
  readonly position: PhysicsVector;
  readonly velocity: PhysicsVector;
  readonly yaw: number;
  readonly grounded: boolean;
  readonly o2: number;
}

export interface MovementScenarioFrame {
  readonly duration: number;
  readonly forward: number;
  readonly right: number;
  readonly jump: boolean;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly walking: boolean;
  readonly slide: boolean;
  readonly zoom: boolean;
  readonly holdBreath: boolean;
  readonly yawRate: number;
  readonly label: string;
  readonly disabledObstacleIds: readonly string[];
}

export interface MovementEventPattern {
  readonly kind: PlayerMovementEvent["kind"];
  readonly result?: "full" | "fallback";
  readonly traversal?: PlayerTraversalKind;
}

export type MovementTraceNumericField =
  | "position.x"
  | "position.y"
  | "position.z"
  | "velocity.x"
  | "velocity.y"
  | "velocity.z"
  | "speed.horizontal"
  | "o2"
  | "collisions"
  | "movement.progress"
  | "camera.input.acceleration.right"
  | "camera.input.acceleration.forward"
  | "camera.input.acceleration.up"
  | "camera.offsets.roll"
  | "camera.offsets.headBob"
  | "camera.offsets.headBobLateral"
  | "camera.offsets.headBobDepth"
  | "camera.offsets.headBobPitch"
  | "camera.offsets.verticalOffset"
  | "camera.offsets.aimSwayX"
  | "camera.offsets.aimSwayY";

export interface MovementRangeExpectation {
  readonly id: string;
  readonly field: MovementTraceNumericField;
  readonly at: "first" | "last" | "min" | "max";
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
  readonly equals?: number;
  readonly tolerance: number;
}

export interface MovementScenarioExpectations {
  readonly requiredEvents: readonly MovementEventPattern[];
  readonly forbiddenEvents: readonly MovementEventPattern[];
  readonly requiredStates: readonly string[];
  readonly forbiddenStates: readonly string[];
  readonly requiredContactKinds: readonly PhysicsContact["kind"][];
  readonly finalGrounded?: boolean;
  readonly finalState?: string;
  readonly ranges: readonly MovementRangeExpectation[];
}

export interface MovementScenario {
  readonly schemaVersion: typeof MOVEMENT_SCENARIO_SCHEMA_VERSION;
  readonly name: string;
  readonly description: string;
  readonly seed: string;
  readonly frameDurationSec: number;
  readonly runtime: PhysicsRuntimeKind;
  readonly start: MovementScenarioStart;
  readonly staticBoxes: readonly PhysicsBox[];
  readonly frames: readonly MovementScenarioFrame[];
  readonly expect: MovementScenarioExpectations;
}

export interface MovementTraceEvent {
  readonly stage: "controller" | "post-physics";
  readonly event: PlayerMovementEvent;
}

export interface MovementCameraInputTrace {
  readonly deltaSeconds: number;
  readonly localAcceleration: CameraMotionUpdateInput["localAcceleration"];
  readonly movementMagnitude: number;
  readonly movementSpeedRatio: number;
  readonly oxygenRatio: number;
  readonly crouching: boolean;
  readonly shiftEnabled: boolean;
  readonly bobEnabled: boolean;
  readonly zoom: boolean;
  readonly holdingBreath: boolean;
  readonly stabilizedByWall: boolean;
  readonly grounded: boolean;
  readonly traversalActive: boolean;
  readonly verticalOffsetBounds: {
    readonly min: number;
    readonly max: number | null;
  };
}

export interface MovementFrameTrace {
  readonly frame: number;
  readonly timeSec: number;
  readonly stepIndex: number;
  readonly stepLabel: string;
  readonly position: PhysicsVector;
  readonly velocity: PhysicsVector;
  readonly grounded: boolean;
  readonly collisions: number;
  readonly contacts: readonly PhysicsContact[];
  readonly movement: {
    readonly state: PlayerMovementControllerState["movement"]["kind"];
    readonly posture: PlayerMovementPosture;
    readonly traversalProgress: number;
    readonly obstacleId: string | null;
  };
  readonly events: readonly MovementTraceEvent[];
  readonly o2: number;
  readonly vitals: PlayerVitalsState;
  readonly camera: {
    readonly input: MovementCameraInputTrace;
    readonly offsets: CameraMotionOffsets;
  };
  readonly presentation: {
    readonly visibleReticleNdc: Readonly<{ x: number; y: number }>;
    readonly aimRayNdc: Readonly<{ x: number; y: number }>;
    readonly focusRayNdc: Readonly<{ x: number; y: number }>;
  };
}

export interface MovementOrderedEvent extends MovementTraceEvent {
  readonly frame: number;
  readonly timeSec: number;
}

export interface MovementScenarioAssertion {
  readonly id: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
}

export interface MovementSimulationResult {
  readonly schemaVersion: typeof MOVEMENT_SCENARIO_SCHEMA_VERSION;
  readonly name: string;
  readonly description: string;
  readonly seed: string;
  readonly runtime: PhysicsRuntimeKind;
  readonly durationSec: number;
  readonly frameCount: number;
  readonly trace: readonly MovementFrameTrace[];
  readonly orderedEvents: readonly MovementOrderedEvent[];
  readonly final: MovementFrameTrace;
  readonly metrics: {
    readonly distanceMeters: number;
    readonly maximumHorizontalSpeed: number;
    readonly maximumUpwardSpeed: number;
    readonly maximumDownwardSpeed: number;
    readonly minimumO2: number;
    readonly maximumO2: number;
    readonly maximumCollisions: number;
  };
  readonly assertions: readonly MovementScenarioAssertion[];
}

interface ActiveTraversal {
  readonly kind: PlayerTraversalKind;
  readonly obstacleId: string;
  readonly sourceBox: PhysicsBox;
  readonly sourceGeometryKey: string;
  readonly start: PhysicsVector;
  readonly target: PhysicsVector;
  readonly duration: number;
  readonly arcHeight: number;
  readonly wall: WallTraversalGeometry | null;
  elapsed: number;
  terminal: "completed" | "cancelled" | null;
}

interface WallTraversalGeometry {
  readonly wallNormal: PhysicsVector;
  readonly wallFacePoint: PhysicsVector;
  readonly wallTopY: number;
  readonly box: PhysicsBox;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const parseVector = (value: unknown, field: string): PhysicsVector => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    throw new TypeError(`${field} must be a three-number vector`);
  }
  const [x, y, z] = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    throw new TypeError(`${field} must be a three-number vector`);
  }
  return { x, y, z };
};

const parseBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const parseNumber = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) ? value : fallback;

const parsePositiveNumber = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) && value > 0 ? value : fallback;

const parseStringArray = (value: unknown, field: string): readonly string[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError(`${field} must be an array of strings`);
  }
  return value;
};

const parsePhysicsBox = (value: unknown, index: number): PhysicsBox => {
  if (!isRecord(value)) {
    throw new TypeError(`staticBoxes[${String(index)}] must be an object`);
  }
  if (typeof value.obstacleId !== "string" || value.obstacleId.trim() === "") {
    throw new TypeError(`staticBoxes[${String(index)}].obstacleId is required`);
  }
  const rotationX = isFiniteNumber(value.rotationX) ? value.rotationX : undefined;
  const rotationY = isFiniteNumber(value.rotationY) ? value.rotationY : undefined;
  const rotationZ = isFiniteNumber(value.rotationZ) ? value.rotationZ : undefined;
  return {
    obstacleId: value.obstacleId,
    center: parseVector(value.center, `staticBoxes[${String(index)}].center`),
    halfExtents: parseVector(value.halfExtents, `staticBoxes[${String(index)}].halfExtents`),
    ...(rotationX === undefined ? {} : { rotationX }),
    ...(rotationY === undefined ? {} : { rotationY }),
    ...(rotationZ === undefined ? {} : { rotationZ }),
  };
};

const eventKinds = new Set<PlayerMovementEvent["kind"]>([
  "jump",
  "vault-start",
  "wall-contact",
  "wall-climb-request",
  "ledge-grab",
  "traversal-cancel",
  "traversal-complete",
  "slide-start",
  "slide-end",
  "landing",
]);

const parseEventPatterns = (value: unknown, field: string): readonly MovementEventPattern[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }
  return value.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.kind !== "string" ||
      !eventKinds.has(entry.kind as PlayerMovementEvent["kind"])
    ) {
      throw new TypeError(`${field}[${String(index)}] has an invalid event kind`);
    }
    const result =
      entry.result === "full" || entry.result === "fallback" ? entry.result : undefined;
    const traversal =
      entry.traversal === "vault" ||
      entry.traversal === "wall-contact" ||
      entry.traversal === "wall-climb" ||
      entry.traversal === "ledge-grab"
        ? entry.traversal
        : undefined;
    return {
      kind: entry.kind as PlayerMovementEvent["kind"],
      ...(result === undefined ? {} : { result }),
      ...(traversal === undefined ? {} : { traversal }),
    };
  });
};

const traceFields = new Set<MovementTraceNumericField>([
  "position.x",
  "position.y",
  "position.z",
  "velocity.x",
  "velocity.y",
  "velocity.z",
  "speed.horizontal",
  "o2",
  "collisions",
  "movement.progress",
  "camera.input.acceleration.right",
  "camera.input.acceleration.forward",
  "camera.input.acceleration.up",
  "camera.offsets.roll",
  "camera.offsets.headBob",
  "camera.offsets.headBobLateral",
  "camera.offsets.headBobDepth",
  "camera.offsets.headBobPitch",
  "camera.offsets.verticalOffset",
  "camera.offsets.aimSwayX",
  "camera.offsets.aimSwayY",
]);

const parseRangeExpectations = (value: unknown): readonly MovementRangeExpectation[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError("expect.ranges must be an array");
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new TypeError(`expect.ranges[${String(index)}] must be an object`);
    }
    if (typeof entry.id !== "string" || entry.id.trim() === "") {
      throw new TypeError(`expect.ranges[${String(index)}].id is required`);
    }
    if (
      typeof entry.field !== "string" ||
      !traceFields.has(entry.field as MovementTraceNumericField)
    ) {
      throw new TypeError(`expect.ranges[${String(index)}].field is invalid`);
    }
    if (entry.at !== "first" && entry.at !== "last" && entry.at !== "min" && entry.at !== "max") {
      throw new TypeError(`expect.ranges[${String(index)}].at is invalid`);
    }
    const label = typeof entry.label === "string" ? entry.label : undefined;
    const min = isFiniteNumber(entry.min) ? entry.min : undefined;
    const max = isFiniteNumber(entry.max) ? entry.max : undefined;
    const equals = isFiniteNumber(entry.equals) ? entry.equals : undefined;
    if (min === undefined && max === undefined && equals === undefined) {
      throw new TypeError(`expect.ranges[${String(index)}] needs min, max, or equals`);
    }
    return {
      id: entry.id,
      field: entry.field as MovementTraceNumericField,
      at: entry.at,
      ...(label === undefined ? {} : { label }),
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(equals === undefined ? {} : { equals }),
      tolerance: Math.max(0, parseNumber(entry.tolerance, 0)),
    };
  });
};

const parseExpectations = (value: unknown): MovementScenarioExpectations => {
  const source = isRecord(value) ? value : {};
  const finalGrounded =
    typeof source.finalGrounded === "boolean" ? source.finalGrounded : undefined;
  const finalState = typeof source.finalState === "string" ? source.finalState : undefined;
  const requiredContactKinds = parseStringArray(
    source.requiredContactKinds,
    "expect.requiredContactKinds",
  ).map((kind) => {
    if (kind !== "support" && kind !== "wall" && kind !== "ceiling") {
      throw new TypeError(`Invalid required contact kind: ${kind}`);
    }
    return kind;
  });
  return {
    requiredEvents: parseEventPatterns(source.requiredEvents, "expect.requiredEvents"),
    forbiddenEvents: parseEventPatterns(source.forbiddenEvents, "expect.forbiddenEvents"),
    requiredStates: parseStringArray(source.requiredStates, "expect.requiredStates"),
    forbiddenStates: parseStringArray(source.forbiddenStates, "expect.forbiddenStates"),
    requiredContactKinds,
    ...(finalGrounded === undefined ? {} : { finalGrounded }),
    ...(finalState === undefined ? {} : { finalState }),
    ranges: parseRangeExpectations(source.ranges),
  };
};

export const parseMovementScenario = (value: unknown): MovementScenario => {
  if (!isRecord(value)) {
    throw new TypeError("Scenario must be a JSON object");
  }
  if (value.schemaVersion !== MOVEMENT_SCENARIO_SCHEMA_VERSION) {
    throw new TypeError(
      `Scenario schemaVersion must be ${String(MOVEMENT_SCENARIO_SCHEMA_VERSION)}`,
    );
  }
  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new TypeError("Scenario name is required");
  }
  if (typeof value.seed !== "string" || value.seed.trim() === "") {
    throw new TypeError("Scenario seed is required");
  }
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new TypeError("Scenario frames must be a non-empty array");
  }
  const startSource = isRecord(value.start) ? value.start : {};
  const staticBoxes = Array.isArray(value.staticBoxes)
    ? value.staticBoxes.map(parsePhysicsBox)
    : [];
  const obstacleIds = new Set<string>([resolvePhysicsBoxObstacleId(DEFAULT_FLOOR)]);
  for (const box of staticBoxes) {
    const obstacleId = resolvePhysicsBoxObstacleId(box);
    if (obstacleIds.has(obstacleId)) {
      throw new TypeError(`Duplicate obstacleId: ${obstacleId}`);
    }
    obstacleIds.add(obstacleId);
  }
  const frames = value.frames.map((frame, index): MovementScenarioFrame => {
    if (!isRecord(frame)) {
      throw new TypeError(`frames[${String(index)}] must be an object`);
    }
    const label = typeof frame.label === "string" ? frame.label : `step-${String(index + 1)}`;
    return {
      duration: parsePositiveNumber(frame.duration, DEFAULT_FRAME_DURATION_SECONDS),
      forward: clamp(parseNumber(frame.forward, 0), -1, 1),
      right: clamp(parseNumber(frame.right, 0), -1, 1),
      jump: parseBoolean(frame.jump),
      sprint: parseBoolean(frame.sprint),
      crouch: parseBoolean(frame.crouch),
      walking: parseBoolean(frame.walking),
      slide: parseBoolean(frame.slide),
      zoom: parseBoolean(frame.zoom),
      holdBreath: parseBoolean(frame.holdBreath),
      yawRate: parseNumber(frame.yawRate, 0),
      label,
      disabledObstacleIds: parseStringArray(
        frame.disabledObstacleIds,
        `frames[${String(index)}].disabledObstacleIds`,
      ),
    };
  });
  const runtimeSource = isRecord(value.physics) ? value.physics.runtime : undefined;
  const runtime: PhysicsRuntimeKind = runtimeSource === "rapier" ? "rapier" : "fallback";
  return {
    schemaVersion: MOVEMENT_SCENARIO_SCHEMA_VERSION,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    seed: value.seed,
    frameDurationSec: parsePositiveNumber(value.frameDurationSec, DEFAULT_FRAME_DURATION_SECONDS),
    runtime,
    start: {
      position: parseVector(
        startSource.position ?? [0, PLAYER_CAPSULE_CENTER_HEIGHT, 0],
        "start.position",
      ),
      velocity: parseVector(startSource.velocity ?? [0, 0, 0], "start.velocity"),
      yaw: parseNumber(startSource.yaw, 0),
      grounded: parseBoolean(startSource.grounded, true),
      o2: clamp(parseNumber(startSource.o2, PLAYER_MAX_O2), 0, PLAYER_MAX_O2),
    },
    staticBoxes,
    frames,
    expect: parseExpectations(value.expect),
  };
};

export const readMovementScenarioFile = async (path: string): Promise<MovementScenario> =>
  parseMovementScenario(JSON.parse(await readFile(path, "utf8")) as unknown);

const horizontalBasis = (
  yaw: number,
): {
  readonly forward: PhysicsVector;
  readonly right: PhysicsVector;
} => {
  const forward = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  return {
    forward,
    right: { x: -forward.z, y: 0, z: forward.x },
  };
};

const worldToLocalVelocity = (velocity: PhysicsVector, yaw: number): PlayerMovementVector => {
  const basis = horizontalBasis(yaw);
  return {
    right: velocity.x * basis.right.x + velocity.z * basis.right.z,
    up: velocity.y,
    forward: velocity.x * basis.forward.x + velocity.z * basis.forward.z,
  };
};

const localToWorldVelocity = (velocity: PlayerMovementVector, yaw: number): PhysicsVector => {
  const basis = horizontalBasis(yaw);
  return {
    x: velocity.right * basis.right.x + velocity.forward * basis.forward.x,
    y: velocity.up,
    z: velocity.right * basis.right.z + velocity.forward * basis.forward.z,
  };
};

const smoothStep = (value: number): number => {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
};

const createRuntime = async (kind: PhysicsRuntimeKind): Promise<MahjongPhysicsRuntime> =>
  kind === "rapier"
    ? createMahjongPhysics([DEFAULT_FLOOR])
    : createFallbackMahjongPhysics([DEFAULT_FLOOR]);

const sourceBoxForTraversal = (
  boxes: readonly PhysicsBox[],
  obstacleId: string,
): PhysicsBox | null =>
  boxes.find((box) => resolvePhysicsBoxObstacleId(box) === obstacleId) ?? null;

/** Match the live source-identity and destination-clearance cancellation gate. */
export const isMovementTraversalGeometryValid = (
  kind: PlayerTraversalKind,
  obstacleId: string,
  sourceGeometryKey: string,
  target: PhysicsVector,
  boxes: readonly PhysicsBox[],
): boolean => {
  const sourceBox = sourceBoxForTraversal(boxes, obstacleId);
  return (
    sourceBox !== null &&
    resolvePhysicsBoxGeometrySignature(sourceBox) === sourceGeometryKey &&
    (kind === "wall-contact" || isPlayerCapsulePositionClear(target, boxes))
  );
};

export const isMovementWallAttachmentValid = (
  obstacleId: string,
  target: PhysicsVector,
  movement: PhysicsMovement,
): boolean =>
  movement.contacts.some(
    (contact) => contact.kind === "wall" && contact.obstacleId === obstacleId,
  ) &&
  Math.hypot(
    movement.position.x - target.x,
    movement.position.y - target.y,
    movement.position.z - target.z,
  ) <= WALL_HANG_ATTACHMENT_TOLERANCE;

const activeExternalTraversal = (
  traversal: ActiveTraversal | null,
  boxes: readonly PhysicsBox[],
  jump: boolean,
): PlayerExternalTraversalState | null => {
  if (traversal === null) {
    return null;
  }
  const geometryValid = isMovementTraversalGeometryValid(
    traversal.kind,
    traversal.obstacleId,
    traversal.sourceGeometryKey,
    traversal.target,
    boxes,
  );
  const releasedActiveMotion = !jump;
  const contactValid = geometryValid && !releasedActiveMotion && traversal.terminal !== "cancelled";
  return {
    kind: traversal.kind,
    obstacleId: traversal.obstacleId,
    progress: traversal.duration <= 0 ? 0 : clamp(traversal.elapsed / traversal.duration, 0, 1),
    contactValid,
    ...(traversal.terminal === "completed" ? { completed: true } : {}),
    ...(!contactValid || traversal.terminal === "cancelled" ? { cancelled: true } : {}),
  };
};

const motionForActiveTraversal = (
  runtime: MahjongPhysicsRuntime,
  traversal: ActiveTraversal,
  position: PhysicsVector,
  deltaSeconds: number,
): PhysicsMovement => {
  if (traversal.kind === "wall-contact") {
    traversal.elapsed = Math.min(traversal.duration, traversal.elapsed + deltaSeconds);
    const wallNormal = traversal.wall?.wallNormal ?? { x: 0, y: 0, z: 0 };
    const movement = runtime.move(position, {
      x: traversal.target.x - position.x - wallNormal.x * WALL_HANG_CONTACT_PROBE_DISTANCE,
      y: traversal.target.y - position.y,
      z: traversal.target.z - position.z - wallNormal.z * WALL_HANG_CONTACT_PROBE_DISTANCE,
    });
    const attached =
      traversal.wall !== null &&
      isMovementWallAttachmentValid(traversal.obstacleId, traversal.target, movement);
    if (!attached) {
      traversal.terminal = "cancelled";
    }
    return movement;
  }
  traversal.elapsed = Math.min(traversal.duration, traversal.elapsed + deltaSeconds);
  const progress = smoothStep(traversal.elapsed / traversal.duration);
  const proposed = {
    x: traversal.start.x + (traversal.target.x - traversal.start.x) * progress,
    y:
      traversal.start.y +
      (traversal.target.y - traversal.start.y) * progress +
      Math.sin(progress * Math.PI) * traversal.arcHeight,
    z: traversal.start.z + (traversal.target.z - traversal.start.z) * progress,
  };
  const movement = runtime.move(position, {
    x: proposed.x - position.x,
    y: proposed.y - position.y,
    z: proposed.z - position.z,
  });
  const blocked =
    movement.collisions > 0 &&
    Math.hypot(
      movement.position.x - proposed.x,
      movement.position.y - proposed.y,
      movement.position.z - proposed.z,
    ) > TRAVERSAL_CONTACT_EPSILON &&
    !(
      movement.contacts.length > 0 &&
      movement.contacts.every((contact) => contact.obstacleId === traversal.obstacleId)
    );
  if (blocked) {
    traversal.terminal = "cancelled";
    return movement;
  }
  if (traversal.elapsed < traversal.duration) {
    return movement;
  }
  const landing = runtime.move(movement.position, {
    x: traversal.target.x - movement.position.x,
    y: traversal.target.y - movement.position.y - PLAYER_SUPPORT_SNAP_HEIGHT,
    z: traversal.target.z - movement.position.z,
  });
  const landedOnSource =
    landing.grounded &&
    landing.contacts.some(
      (contact) => contact.kind === "support" && contact.obstacleId === traversal.obstacleId,
    );
  traversal.terminal = landedOnSource ? "completed" : "cancelled";
  return landing;
};

const addTraversalContact = (
  output: PlayerMovementContact[],
  kind: "vault" | "ledge",
  resolution: TraversalTargetResolution,
  approach: PhysicsVector,
  currentPosition: PhysicsVector,
  vitals: PlayerVitalsState,
): void => {
  const height = Math.max(0, resolution.target.y - currentPosition.y);
  const oxygenCost = resolveVaultTraversalO2Cost(height);
  output.push({
    kind,
    normal: { x: -approach.x, y: 0, z: -approach.z },
    obstacle: {
      id: resolution.obstacleId,
      topY: resolution.topY,
      clearanceValid: canAffordPlayerO2Cost(vitals, oxygenCost),
    },
    target: resolution.target,
  });
};

const resolveTraversalCandidates = (
  beforePosition: PhysicsVector,
  desiredHorizontalDelta: PhysicsVector,
  movement: PhysicsMovement,
  boxes: readonly PhysicsBox[],
  vitals: PlayerVitalsState,
): {
  readonly contacts: readonly PlayerMovementContact[];
  readonly vault: TraversalTargetResolution | null;
  readonly ledge: TraversalTargetResolution | null;
  readonly wall: ReturnType<typeof resolveWallHangTargetDetails>;
} => {
  const horizontalDistance = Math.hypot(desiredHorizontalDelta.x, desiredHorizontalDelta.z);
  if (horizontalDistance < 0.015) {
    return { contacts: [], vault: null, ledge: null, wall: null };
  }
  const approach = {
    x: desiredHorizontalDelta.x / horizontalDistance,
    y: 0,
    z: desiredHorizontalDelta.z / horizontalDistance,
  };
  const feetY = beforePosition.y - PLAYER_CAPSULE_CENTER_HEIGHT;
  const vaultCandidate = resolveVaultTargetDetails(
    beforePosition,
    desiredHorizontalDelta,
    feetY,
    boxes,
  );
  const vault =
    vaultCandidate !== null &&
    vaultCandidate.topY - feetY <= LOW_OBSTACLE_VAULT_MAX_HEIGHT &&
    isPlayerCapsulePositionClear(vaultCandidate.target, boxes)
      ? vaultCandidate
      : null;
  const ledgeCandidate =
    vault === null
      ? resolveLedgeGrabTargetDetails(beforePosition, desiredHorizontalDelta, feetY, boxes, [])
      : null;
  const ledge =
    ledgeCandidate !== null && isPlayerCapsulePositionClear(ledgeCandidate.target, boxes)
      ? ledgeCandidate
      : null;
  let wall =
    vault === null && ledge === null
      ? resolveWallHangTargetDetails(movement.position, approach, boxes)
      : null;
  if (
    wall !== null &&
    !movement.contacts.some(
      (contact) =>
        contact.kind === "wall" &&
        contact.obstacleId === resolvePhysicsBoxObstacleId(wall?.box ?? DEFAULT_FLOOR),
    )
  ) {
    wall = null;
  }
  const contacts: PlayerMovementContact[] = [];
  if (vault !== null) {
    addTraversalContact(contacts, "vault", vault, approach, beforePosition, vitals);
  } else if (ledge !== null) {
    addTraversalContact(contacts, "ledge", ledge, approach, beforePosition, vitals);
  } else if (wall !== null) {
    contacts.push({
      kind: "wall",
      normal: wall.wallNormal,
      obstacle: {
        id: resolvePhysicsBoxObstacleId(wall.box),
        topY: wall.wallTopY,
        clearanceValid: true,
      },
      target: wall.target,
    });
  }
  return { contacts, vault, ledge, wall };
};

const startRequestedTraversal = (
  request: NonNullable<ReturnType<typeof stepPlayerMovementController>["traversalRequest"]>,
  candidates: ReturnType<typeof resolveTraversalCandidates>,
  position: PhysicsVector,
  vitals: PlayerVitalsState,
): { readonly traversal: ActiveTraversal | null; readonly vitals: PlayerVitalsState } => {
  if (request.kind === "wall-contact") {
    const wall = candidates.wall;
    if (wall?.box === undefined || resolvePhysicsBoxObstacleId(wall.box) !== request.obstacle.id) {
      return { traversal: null, vitals };
    }
    return {
      traversal: {
        kind: "wall-contact",
        obstacleId: request.obstacle.id,
        sourceBox: wall.box,
        sourceGeometryKey: resolvePhysicsBoxGeometrySignature(wall.box),
        start: { ...position },
        target: { ...wall.target },
        duration: WALL_HANG_SETTLE_DURATION,
        arcHeight: 0,
        wall: {
          wallNormal: wall.wallNormal,
          wallFacePoint: wall.wallFacePoint,
          wallTopY: wall.wallTopY,
          box: wall.box,
        },
        elapsed: 0,
        terminal: null,
      },
      vitals,
    };
  }
  const resolution =
    request.kind === "vault"
      ? candidates.vault
      : request.kind === "ledge-grab"
        ? candidates.ledge
        : null;
  if (resolution?.obstacleId !== request.obstacle.id) {
    return { traversal: null, vitals };
  }
  const height = Math.max(0, resolution.target.y - position.y);
  const oxygenCost = resolveVaultTraversalO2Cost(height);
  if (!canAffordPlayerO2Cost(vitals, oxygenCost)) {
    return { traversal: null, vitals };
  }
  const nextVitals = applyPlayerO2Cost(vitals, oxygenCost, O2_JUMP_RECOVERY_DELAY_SECONDS);
  return {
    traversal: {
      kind: request.kind,
      obstacleId: resolution.obstacleId,
      sourceBox: resolution.box,
      sourceGeometryKey: resolvePhysicsBoxGeometrySignature(resolution.box),
      start: { ...position },
      target: { ...resolution.target },
      duration: resolveO2ScaledTraversalDuration(
        resolveVaultTraversalDuration(height),
        nextVitals.o2 / PLAYER_MAX_O2,
      ),
      arcHeight: resolveVaultTraversalArcHeight(height),
      wall: null,
      elapsed: 0,
      terminal: null,
    },
    vitals: nextVitals,
  };
};

const startWallClimb = (
  traversal: ActiveTraversal | null,
  boxes: readonly PhysicsBox[],
  position: PhysicsVector,
  vitals: PlayerVitalsState,
): { readonly traversal: ActiveTraversal | null; readonly vitals: PlayerVitalsState } => {
  if (traversal?.kind !== "wall-contact" || traversal.wall === null) {
    return { traversal: null, vitals };
  }
  const sourceBox = sourceBoxForTraversal(boxes, traversal.obstacleId);
  if (sourceBox === null) {
    return { traversal: null, vitals };
  }
  const wall = { ...traversal.wall, box: sourceBox };
  const target = resolveWallClimbTarget(wall);
  if (!isPlayerCapsulePositionClear(target, boxes)) {
    return { traversal: null, vitals };
  }
  const height = Math.max(0, target.y - position.y);
  const oxygenCost = resolveVaultTraversalO2Cost(height);
  if (!canAffordPlayerO2Cost(vitals, oxygenCost)) {
    return { traversal: null, vitals };
  }
  const nextVitals = applyPlayerO2Cost(vitals, oxygenCost, O2_JUMP_RECOVERY_DELAY_SECONDS);
  return {
    traversal: {
      kind: "wall-climb",
      obstacleId: traversal.obstacleId,
      sourceBox,
      sourceGeometryKey: resolvePhysicsBoxGeometrySignature(sourceBox),
      start: { ...position },
      target,
      duration: resolveO2ScaledTraversalDuration(
        resolveVaultTraversalDuration(height),
        nextVitals.o2 / PLAYER_MAX_O2,
      ),
      arcHeight: resolveVaultTraversalArcHeight(height),
      wall,
      elapsed: 0,
      terminal: null,
    },
    vitals: nextVitals,
  };
};

const eventMatches = (event: PlayerMovementEvent, pattern: MovementEventPattern): boolean => {
  if (event.kind !== pattern.kind) {
    return false;
  }
  if (pattern.result !== undefined) {
    return event.kind === "jump" && event.result === pattern.result;
  }
  if (pattern.traversal !== undefined) {
    return (
      (event.kind === "traversal-cancel" || event.kind === "traversal-complete") &&
      event.traversal === pattern.traversal
    );
  }
  return true;
};

const traceNumber = (sample: MovementFrameTrace, field: MovementTraceNumericField): number => {
  switch (field) {
    case "position.x":
      return sample.position.x;
    case "position.y":
      return sample.position.y;
    case "position.z":
      return sample.position.z;
    case "velocity.x":
      return sample.velocity.x;
    case "velocity.y":
      return sample.velocity.y;
    case "velocity.z":
      return sample.velocity.z;
    case "speed.horizontal":
      return Math.hypot(sample.velocity.x, sample.velocity.z);
    case "o2":
      return sample.o2;
    case "collisions":
      return sample.collisions;
    case "movement.progress":
      return sample.movement.traversalProgress;
    case "camera.input.acceleration.right":
      return sample.camera.input.localAcceleration.right;
    case "camera.input.acceleration.forward":
      return sample.camera.input.localAcceleration.forward;
    case "camera.input.acceleration.up":
      return sample.camera.input.localAcceleration.up;
    case "camera.offsets.roll":
      return sample.camera.offsets.roll;
    case "camera.offsets.headBob":
      return sample.camera.offsets.headBob;
    case "camera.offsets.headBobLateral":
      return sample.camera.offsets.headBobLateral;
    case "camera.offsets.headBobDepth":
      return sample.camera.offsets.headBobDepth;
    case "camera.offsets.headBobPitch":
      return sample.camera.offsets.headBobPitch;
    case "camera.offsets.verticalOffset":
      return sample.camera.offsets.verticalOffset;
    case "camera.offsets.aimSwayX":
      return sample.camera.offsets.aimSwayX;
    case "camera.offsets.aimSwayY":
      return sample.camera.offsets.aimSwayY;
  }
};

const evaluateRange = (
  trace: readonly MovementFrameTrace[],
  expectation: MovementRangeExpectation,
): MovementScenarioAssertion => {
  const candidates =
    expectation.label === undefined
      ? trace
      : trace.filter((sample) => sample.stepLabel === expectation.label);
  if (candidates.length === 0) {
    return {
      id: expectation.id,
      passed: false,
      expected: `samples for ${expectation.label ?? "scenario"}`,
      actual: "no matching samples",
    };
  }
  const values = candidates.map((sample) => traceNumber(sample, expectation.field));
  const actual =
    expectation.at === "first"
      ? values[0]
      : expectation.at === "last"
        ? values[values.length - 1]
        : expectation.at === "min"
          ? Math.min(...values)
          : Math.max(...values);
  if (actual === undefined) {
    throw new Error(`Missing numeric value for ${expectation.id}`);
  }
  const tolerance = expectation.tolerance;
  const equalsPass =
    expectation.equals === undefined || Math.abs(actual - expectation.equals) <= tolerance;
  const minPass = expectation.min === undefined || actual >= expectation.min - tolerance;
  const maxPass = expectation.max === undefined || actual <= expectation.max + tolerance;
  return {
    id: expectation.id,
    passed: equalsPass && minPass && maxPass,
    expected: JSON.stringify({
      ...(expectation.equals === undefined ? {} : { equals: expectation.equals }),
      ...(expectation.min === undefined ? {} : { min: expectation.min }),
      ...(expectation.max === undefined ? {} : { max: expectation.max }),
      tolerance,
    }),
    actual: String(actual),
  };
};

const evaluateExpectations = (
  scenario: MovementScenario,
  trace: readonly MovementFrameTrace[],
  events: readonly MovementOrderedEvent[],
): readonly MovementScenarioAssertion[] => {
  const assertions: MovementScenarioAssertion[] = [];
  for (const [index, pattern] of scenario.expect.requiredEvents.entries()) {
    const count = events.filter((entry) => eventMatches(entry.event, pattern)).length;
    assertions.push({
      id: `required-event-${String(index + 1)}-${pattern.kind}`,
      passed: count > 0,
      expected: `at least one ${JSON.stringify(pattern)}`,
      actual: String(count),
    });
  }
  for (const [index, pattern] of scenario.expect.forbiddenEvents.entries()) {
    const count = events.filter((entry) => eventMatches(entry.event, pattern)).length;
    assertions.push({
      id: `forbidden-event-${String(index + 1)}-${pattern.kind}`,
      passed: count === 0,
      expected: `no ${JSON.stringify(pattern)}`,
      actual: String(count),
    });
  }
  for (const state of scenario.expect.requiredStates) {
    const count = trace.filter((sample) => sample.movement.state === state).length;
    assertions.push({
      id: `required-state-${state}`,
      passed: count > 0,
      expected: `state ${state}`,
      actual: String(count),
    });
  }
  for (const state of scenario.expect.forbiddenStates) {
    const count = trace.filter((sample) => sample.movement.state === state).length;
    assertions.push({
      id: `forbidden-state-${state}`,
      passed: count === 0,
      expected: `no state ${state}`,
      actual: String(count),
    });
  }
  for (const kind of scenario.expect.requiredContactKinds) {
    const count = trace.reduce(
      (total, sample) => total + sample.contacts.filter((contact) => contact.kind === kind).length,
      0,
    );
    assertions.push({
      id: `required-contact-${kind}`,
      passed: count > 0,
      expected: `contact ${kind}`,
      actual: String(count),
    });
  }
  const final = trace[trace.length - 1];
  if (final === undefined) {
    throw new Error(`Scenario ${scenario.name} produced no trace`);
  }
  if (scenario.expect.finalGrounded !== undefined) {
    assertions.push({
      id: "final-grounded",
      passed: final.grounded === scenario.expect.finalGrounded,
      expected: String(scenario.expect.finalGrounded),
      actual: String(final.grounded),
    });
  }
  if (scenario.expect.finalState !== undefined) {
    assertions.push({
      id: "final-state",
      passed: final.movement.state === scenario.expect.finalState,
      expected: scenario.expect.finalState,
      actual: final.movement.state,
    });
  }
  assertions.push(
    ...scenario.expect.ranges.map((expectation) => evaluateRange(trace, expectation)),
  );
  return assertions;
};

export const runMovementScenario = async (
  scenario: MovementScenario,
): Promise<MovementSimulationResult> => {
  const runtime = await createRuntime(scenario.runtime);
  const cameraDamper = createCameraMotionDamper();
  let controllerState = createPlayerMovementControllerState(scenario.seed, scenario.start.grounded);
  let position = { ...scenario.start.position };
  let velocity = { ...scenario.start.velocity };
  let grounded = scenario.start.grounded;
  let yaw = scenario.start.yaw;
  let vitals: PlayerVitalsState = { ...createPlayerVitals(), o2: scenario.start.o2 };
  let traversal: ActiveTraversal | null = null;
  let timeSec = 0;
  let frame = 0;
  let distanceMeters = 0;
  let maximumFallSpeed = Math.max(0, -velocity.y);
  const trace: MovementFrameTrace[] = [];
  const orderedEvents: MovementOrderedEvent[] = [];

  try {
    for (const [stepIndex, step] of scenario.frames.entries()) {
      const disabled = new Set(step.disabledObstacleIds);
      const activeBoxes = scenario.staticBoxes.filter(
        (box) => !disabled.has(resolvePhysicsBoxObstacleId(box)),
      );
      runtime.setDynamicBoxes(activeBoxes);
      const boundedFrameDuration = Math.min(
        scenario.frameDurationSec,
        PLAYER_MOVEMENT_MAX_STEP_SECONDS,
      );
      const frameCount = Math.max(1, Math.ceil(step.duration / boundedFrameDuration));
      const deltaSeconds = step.duration / frameCount;

      for (let stepFrame = 0; stepFrame < frameCount; stepFrame += 1) {
        frame += 1;
        timeSec += deltaSeconds;
        yaw += step.yawRate * deltaSeconds;
        const priorPosition = { ...position };
        const priorVelocity = { ...velocity };
        const priorGrounded = grounded;
        const inputMagnitude = Math.min(1, Math.hypot(step.right, step.forward));
        const sprintFrameCost = O2_SPRINT_DRAIN_PER_SECOND * deltaSeconds * inputMagnitude;
        const sprintAffordable = canAffordPlayerO2Cost(vitals, sprintFrameCost);
        const externalTraversal = activeExternalTraversal(traversal, activeBoxes, step.jump);
        const localVelocity = worldToLocalVelocity(velocity, yaw);
        const controllerOutput = stepPlayerMovementController(controllerState, {
          deltaSeconds,
          seed: scenario.seed,
          direction: { right: step.right, forward: step.forward },
          currentVelocity: localVelocity,
          grounded,
          sprint: step.sprint,
          sprintAffordable,
          crouch: step.crouch,
          jump: step.jump,
          walking: step.walking,
          oxygen: vitals.o2,
          externalTraversal,
          slideRequested: step.slide,
        });
        controllerState = controllerOutput.state;
        const frameEvents: MovementTraceEvent[] = controllerOutput.events.map((event) => ({
          stage: "controller",
          event,
        }));

        if (controllerOutput.jumpAction !== null) {
          vitals = applyPlayerO2Cost(
            vitals,
            controllerOutput.jumpAction.oxygenCost,
            O2_JUMP_RECOVERY_DELAY_SECONDS,
          );
        }
        vitals = setPlayerHoldingBreath(vitals, step.holdBreath, step.zoom, deltaSeconds);

        if (
          externalTraversal?.completed === true ||
          externalTraversal?.cancelled === true ||
          controllerOutput.events.some((event) => event.kind === "traversal-cancel")
        ) {
          traversal = null;
        }
        if (controllerOutput.events.some((event) => event.kind === "wall-climb-request")) {
          const started = startWallClimb(traversal, activeBoxes, position, vitals);
          traversal = started.traversal;
          vitals = started.vitals;
        }

        const controllerDesiredWorld = localToWorldVelocity(controllerOutput.desiredVelocity, yaw);
        let movement: PhysicsMovement;
        if (traversal !== null && traversal.terminal === null) {
          movement = motionForActiveTraversal(runtime, traversal, position, deltaSeconds);
        } else {
          const verticalVelocity =
            controllerOutput.jumpAction !== null
              ? controllerOutput.jumpAction.launchSpeed
              : grounded
                ? 0
                : velocity.y - WORLD_GRAVITY * deltaSeconds;
          const desiredDelta = {
            x: controllerDesiredWorld.x * deltaSeconds,
            y: verticalVelocity * deltaSeconds,
            z: controllerDesiredWorld.z * deltaSeconds,
          };
          movement = runtime.move(position, desiredDelta);
        }

        position = { ...movement.position };
        velocity = {
          x: (position.x - priorPosition.x) / deltaSeconds,
          y: (position.y - priorPosition.y) / deltaSeconds,
          z: (position.z - priorPosition.z) / deltaSeconds,
        };
        grounded = movement.grounded && velocity.y <= 0.001;
        if (traversal?.terminal === "completed") {
          velocity = { x: 0, y: 0, z: 0 };
          grounded = movement.grounded;
        }
        if (grounded) {
          velocity = { ...velocity, y: 0 };
        }
        maximumFallSpeed = Math.max(maximumFallSpeed, Math.max(0, -velocity.y));

        if (traversal === null && step.jump && !grounded) {
          const desiredHorizontalDelta = {
            x: controllerDesiredWorld.x * deltaSeconds,
            y: 0,
            z: controllerDesiredWorld.z * deltaSeconds,
          };
          const candidates = resolveTraversalCandidates(
            priorPosition,
            desiredHorizontalDelta,
            movement,
            activeBoxes,
            vitals,
          );
          const postPhysicsOutput = stepPlayerMovementController(controllerState, {
            phase: "post-physics",
            deltaSeconds: 0,
            seed: scenario.seed,
            direction: { right: step.right, forward: step.forward },
            currentVelocity: worldToLocalVelocity(velocity, yaw),
            grounded,
            sprint: step.sprint,
            sprintAffordable,
            crouch: step.crouch,
            jump: step.jump,
            walking: step.walking,
            oxygen: vitals.o2,
            contacts: candidates.contacts,
            externalTraversal: null,
          });
          controllerState = postPhysicsOutput.state;
          frameEvents.push(
            ...postPhysicsOutput.events.map((event): MovementTraceEvent => ({
              stage: "post-physics",
              event,
            })),
          );
          if (postPhysicsOutput.traversalRequest !== null) {
            const started = startRequestedTraversal(
              postPhysicsOutput.traversalRequest,
              candidates,
              position,
              vitals,
            );
            traversal = started.traversal;
            vitals = started.vitals;
            if (traversal?.kind === "wall-contact") {
              const attachment = runtime.move(position, {
                x: traversal.target.x - position.x,
                y: traversal.target.y - position.y,
                z: traversal.target.z - position.z,
              });
              const attached =
                Math.hypot(
                  attachment.position.x - traversal.target.x,
                  attachment.position.y - traversal.target.y,
                  attachment.position.z - traversal.target.z,
                ) <= TRAVERSAL_CONTACT_EPSILON;
              position = { ...attachment.position };
              velocity = {
                x: (position.x - priorPosition.x) / deltaSeconds,
                y: (position.y - priorPosition.y) / deltaSeconds,
                z: (position.z - priorPosition.z) / deltaSeconds,
              };
              grounded = false;
              if (!attached) {
                traversal.terminal = "cancelled";
              }
            }
          }
        }

        if (!priorGrounded && grounded) {
          const landingCost = resolveLandingO2Cost(maximumFallSpeed);
          vitals = applyPlayerO2ImpactCost(
            vitals,
            landingCost,
            O2_LANDING_RECOVERY_DELAY_SECONDS,
            0,
          ).state;
          maximumFallSpeed = 0;
        }
        const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
        const sprinting =
          step.sprint &&
          sprintAffordable &&
          !step.crouch &&
          inputMagnitude > 0 &&
          horizontalSpeed > 0;
        vitals = tickPlayerVitals(vitals, deltaSeconds, {
          exerciseIntensity: inputMagnitude * (sprinting ? 1 : 0.45),
          movementMagnitude: inputMagnitude,
          locomotionBlend: sprinting ? 1 : 0,
          sprinting,
          crouchWalking: step.crouch && inputMagnitude > 0,
          walking: !step.crouch && inputMagnitude > 0 && !sprinting,
          crouched: step.crouch,
          aimingDownSights: step.zoom,
        });

        const basis = horizontalBasis(yaw);
        const localAcceleration = resolveCameraLocalAccelerationFromVelocityDelta(
          velocity,
          priorVelocity,
          deltaSeconds,
          {
            right: basis.right,
            forward: basis.forward,
            up: { x: 0, y: 1, z: 0 },
          },
        );
        const posture = controllerOutput.posture;
        const baseCameraY =
          position.y -
          PLAYER_CAPSULE_CENTER_HEIGHT +
          (posture === "crouching" ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_STANDING_EYE_HEIGHT);
        const verticalOffsetBounds = resolveCameraVerticalOffsetBounds(
          position,
          baseCameraY,
          activeBoxes,
        );
        const traversalActive = traversal !== null && traversal.kind !== "wall-contact";
        const stabilizedByWall = step.zoom && traversal?.kind === "wall-contact";
        const cameraInput: CameraMotionUpdateInput = {
          deltaSeconds,
          localAcceleration,
          movementMagnitude: inputMagnitude,
          movementSpeedRatio: clamp(horizontalSpeed / PLAYER_SPRINT_SPEED_METERS_PER_SECOND, 0, 1),
          oxygenRatio: vitals.o2 / PLAYER_MAX_O2,
          crouching: posture === "crouching",
          shiftEnabled: true,
          bobEnabled: true,
          aimingDownSights: step.zoom,
          holdingBreath: vitals.holdingBreath,
          stabilizedByWall,
          grounded,
          traversalActive,
          ...(traversalActive && traversal !== null
            ? { traversalDurationSeconds: traversal.duration }
            : {}),
          verticalOffsetBounds,
        };
        const cameraOffsets = cameraDamper.update(cameraInput);
        const reticle = resolveReticlePresentation(
          { x: 0.5, y: 0.5 },
          cameraOffsets,
          RETICLE_VIEWPORT_WIDTH,
          RETICLE_VIEWPORT_HEIGHT,
        );
        const cameraInputTrace: MovementCameraInputTrace = {
          deltaSeconds,
          localAcceleration,
          movementMagnitude: inputMagnitude,
          movementSpeedRatio: cameraInput.movementSpeedRatio,
          oxygenRatio: cameraInput.oxygenRatio,
          crouching: cameraInput.crouching,
          shiftEnabled: cameraInput.shiftEnabled,
          bobEnabled: cameraInput.bobEnabled,
          zoom: step.zoom,
          holdingBreath: vitals.holdingBreath,
          stabilizedByWall,
          grounded,
          traversalActive,
          verticalOffsetBounds: {
            min: verticalOffsetBounds.min,
            max: Number.isFinite(verticalOffsetBounds.max) ? verticalOffsetBounds.max : null,
          },
        };
        const sample: MovementFrameTrace = {
          frame,
          timeSec,
          stepIndex,
          stepLabel: step.label,
          position: { ...position },
          velocity: { ...velocity },
          grounded,
          collisions: movement.collisions,
          contacts: [...movement.contacts].sort((left, right) =>
            `${left.obstacleId}:${left.kind}`.localeCompare(`${right.obstacleId}:${right.kind}`),
          ),
          movement: {
            state: controllerState.movement.kind,
            posture,
            traversalProgress:
              traversal === null || traversal.duration <= 0
                ? 0
                : clamp(traversal.elapsed / traversal.duration, 0, 1),
            obstacleId: traversal?.obstacleId ?? null,
          },
          events: frameEvents,
          o2: vitals.o2,
          vitals,
          camera: { input: cameraInputTrace, offsets: cameraOffsets },
          presentation: {
            visibleReticleNdc: reticle.aimNdc,
            aimRayNdc: reticle.aimNdc,
            focusRayNdc: reticle.aimNdc,
          },
        };
        trace.push(sample);
        for (const event of frameEvents) {
          orderedEvents.push({ frame, timeSec, ...event });
        }
        distanceMeters += Math.hypot(
          position.x - priorPosition.x,
          position.y - priorPosition.y,
          position.z - priorPosition.z,
        );
      }
    }
  } finally {
    runtime.dispose();
  }

  const final = trace[trace.length - 1];
  if (final === undefined) {
    throw new Error(`Scenario ${scenario.name} produced no frames`);
  }
  const speeds = trace.map((sample) => Math.hypot(sample.velocity.x, sample.velocity.z));
  const upwardSpeeds = trace.map((sample) => sample.velocity.y);
  const downwardSpeeds = trace.map((sample) => -sample.velocity.y);
  const oxygenValues = trace.map((sample) => sample.o2);
  const collisionCounts = trace.map((sample) => sample.collisions);
  const assertions = evaluateExpectations(scenario, trace, orderedEvents);
  return {
    schemaVersion: MOVEMENT_SCENARIO_SCHEMA_VERSION,
    name: scenario.name,
    description: scenario.description,
    seed: scenario.seed,
    runtime: scenario.runtime,
    durationSec: timeSec,
    frameCount: trace.length,
    trace,
    orderedEvents,
    final,
    metrics: {
      distanceMeters,
      maximumHorizontalSpeed: Math.max(...speeds),
      maximumUpwardSpeed: Math.max(...upwardSpeeds),
      maximumDownwardSpeed: Math.max(...downwardSpeeds),
      minimumO2: Math.min(...oxygenValues),
      maximumO2: Math.max(...oxygenValues),
      maximumCollisions: Math.max(...collisionCounts),
    },
    assertions,
  };
};

export const runMovementScenarioFile = async (path: string): Promise<MovementSimulationResult> =>
  runMovementScenario(await readMovementScenarioFile(path));

/** Exact serializer shared by the CLI and byte-level determinism coverage. */
export const formatMovementSimulationJson = (result: MovementSimulationResult): string =>
  `${JSON.stringify(result, null, 2)}\n`;

const formatSummary = (result: MovementSimulationResult): string => {
  const passed = result.assertions.filter((assertion) => assertion.passed).length;
  const eventNames = result.orderedEvents.map(({ event }) => event.kind).join(", ");
  return [
    `name: ${result.name}`,
    `schema_version: ${String(result.schemaVersion)}`,
    `runtime: ${result.runtime}`,
    `frames: ${String(result.frameCount)}`,
    `duration_sec: ${result.durationSec.toFixed(3)}`,
    `distance_m: ${result.metrics.distanceMeters.toFixed(3)}`,
    `max_horizontal_speed_m_s: ${result.metrics.maximumHorizontalSpeed.toFixed(3)}`,
    `max_downward_speed_m_s: ${result.metrics.maximumDownwardSpeed.toFixed(3)}`,
    `final_position_m: x=${result.final.position.x.toFixed(3)} y=${result.final.position.y.toFixed(3)} z=${result.final.position.z.toFixed(3)}`,
    `final_state: ${result.final.movement.state}`,
    `final_grounded: ${String(result.final.grounded)}`,
    `final_o2: ${result.final.o2.toFixed(3)}`,
    `events: ${eventNames || "none"}`,
    `assertions: ${String(passed)}/${String(result.assertions.length)} passed`,
  ].join("\n");
};

const parseArgs = (): { readonly scenarioPath: string; readonly emitJson: boolean } => {
  const args = process.argv.slice(2);
  const unknownFlags = args.filter((entry) => entry.startsWith("--") && entry !== "--json");
  if (unknownFlags.length > 0) {
    throw new TypeError(`Unknown option: ${unknownFlags.join(", ")}`);
  }
  const positional = args.filter((entry) => !entry.startsWith("--"));
  if (positional.length > 1) {
    throw new TypeError("Expected at most one scenario path");
  }
  return {
    scenarioPath: resolvePath(positional[0] ?? DEFAULT_SCENARIO_PATH),
    emitJson: args.includes("--json"),
  };
};

const main = async (): Promise<void> => {
  const { scenarioPath, emitJson } = parseArgs();
  const result = await runMovementScenarioFile(scenarioPath);
  if (emitJson) {
    process.stdout.write(formatMovementSimulationJson(result));
  } else {
    process.stdout.write(`${formatSummary(result)}\n`);
  }
  if (result.assertions.some((assertion) => !assertion.passed)) {
    process.exitCode = 1;
  }
};

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isMainModule) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown movement simulation error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
