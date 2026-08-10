import { canonicalJsonHash } from "@hk-mahjong/core";
import type {
  FpsArenaDefinition,
  FpsArenaObstacle,
  FpsPlayerLifecycle,
  FpsPublicAvatarSnapshot,
  FpsVector3,
} from "./types.js";

export const DEFAULT_FPS_ARENA: FpsArenaDefinition = {
  mapId: "slayer-arena-v1",
  bounds: { minX: -18, maxX: 18, minZ: -12, maxZ: 12 },
  floorY: 0,
  collisionRadius: 0.38,
  capsuleHeight: 1.8,
  obstacles: [
    { id: "center-cover", minX: -1.4, maxX: 1.4, minZ: -4.5, maxZ: 4.5, height: 2.1 },
    { id: "west-cover", minX: -11.5, maxX: -7.2, minZ: -1.2, maxZ: 1.2, height: 1.6 },
    { id: "east-cover", minX: 7.2, maxX: 11.5, minZ: -1.2, maxZ: 1.2, height: 1.6 },
  ],
  spawnPoints: [
    { id: "north-west", position: { x: -13, y: 0, z: -8 }, yaw: 2.1224513093234436 },
    { id: "north-mid-west", position: { x: -6, y: 0, z: -8 }, yaw: 2.498091544796509 },
    { id: "north-mid-east", position: { x: 6, y: 0, z: -8 }, yaw: -2.498091544796509 },
    { id: "north-east", position: { x: 13, y: 0, z: -8 }, yaw: -2.1224513093234436 },
    { id: "south-west", position: { x: -13, y: 0, z: 8 }, yaw: 1.0191413442663497 },
    { id: "south-mid-west", position: { x: -6, y: 0, z: 8 }, yaw: 0.6435011087932844 },
    { id: "south-mid-east", position: { x: 6, y: 0, z: 8 }, yaw: -0.6435011087932844 },
    { id: "south-east", position: { x: 13, y: 0, z: 8 }, yaw: -1.0191413442663497 },
  ],
};

export const fpsMapHash = (arena: FpsArenaDefinition): string =>
  `sha256:${canonicalJsonHash(arena)}`;

export interface FpsMapCapsuleDiagnostic {
  readonly playerId: string;
  readonly center: FpsVector3;
  readonly radius: number;
  readonly height: number;
  readonly valid: boolean;
  readonly overlappingObstacleIds: readonly string[];
  readonly overlappingPlayerIds: readonly string[];
}

export interface FpsMapSpawnRayDiagnostic {
  readonly spawnPointId: string;
  readonly origin: FpsVector3;
  readonly direction: FpsVector3;
  readonly length: number;
  readonly valid: boolean;
  readonly blockedByObstacleId: string | null;
}

export interface FpsMapVisibilityDiagnostic {
  readonly sourceId: string;
  readonly targetId: string;
  readonly visible: boolean;
  readonly blockedByObstacleId: string | null;
}

export interface FpsMapDiagnostic {
  readonly mapId: string;
  readonly mapHash: string;
  readonly floorY: number;
  readonly bounds: FpsArenaDefinition["bounds"];
  readonly collision: {
    readonly capsuleRadius: number;
    readonly capsuleHeight: number;
    readonly obstacleIds: readonly string[];
  };
  readonly capsules: readonly FpsMapCapsuleDiagnostic[];
  readonly spawnRays: readonly FpsMapSpawnRayDiagnostic[];
  readonly visibilityTests: readonly FpsMapVisibilityDiagnostic[];
}

export const validateFpsArena = (arena: FpsArenaDefinition): void => {
  if (
    !Number.isFinite(arena.floorY) ||
    !Number.isFinite(arena.collisionRadius) ||
    arena.collisionRadius <= 0 ||
    !Number.isFinite(arena.capsuleHeight) ||
    arena.capsuleHeight <= arena.collisionRadius * 2 ||
    !Number.isFinite(arena.bounds.minX) ||
    !Number.isFinite(arena.bounds.maxX) ||
    !Number.isFinite(arena.bounds.minZ) ||
    !Number.isFinite(arena.bounds.maxZ) ||
    arena.bounds.minX >= arena.bounds.maxX ||
    arena.bounds.minZ >= arena.bounds.maxZ
  ) {
    throw new Error("fps_arena_invalid_dimensions");
  }
  const ids = new Set<string>();
  for (const obstacle of arena.obstacles) {
    if (
      ids.has(obstacle.id) ||
      !obstacle.id ||
      !Number.isFinite(obstacle.minX) ||
      !Number.isFinite(obstacle.maxX) ||
      !Number.isFinite(obstacle.minZ) ||
      !Number.isFinite(obstacle.maxZ) ||
      !Number.isFinite(obstacle.height) ||
      obstacle.minX >= obstacle.maxX ||
      obstacle.minZ >= obstacle.maxZ ||
      obstacle.height <= arena.floorY
    ) {
      throw new Error("fps_arena_invalid_obstacle");
    }
    ids.add(obstacle.id);
  }
  const spawnIds = new Set<string>();
  if (arena.spawnPoints.length === 0) throw new Error("fps_arena_no_spawn_points");
  for (const spawn of arena.spawnPoints) {
    if (
      spawnIds.has(spawn.id) ||
      !spawn.id ||
      !Number.isFinite(spawn.yaw) ||
      !isSpawnPositionValid(arena, spawn.position)
    ) {
      throw new Error("fps_arena_invalid_spawn");
    }
    spawnIds.add(spawn.id);
  }
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const finiteVector = (value: FpsVector3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

const segmentIntersectsObstacle = (
  start: FpsVector3,
  end: FpsVector3,
  obstacle: FpsArenaObstacle,
): boolean => {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  let minimum = 0;
  let maximum = 1;
  for (const [origin, delta, minimumBound, maximumBound] of [
    [start.x, deltaX, obstacle.minX, obstacle.maxX],
    [start.z, deltaZ, obstacle.minZ, obstacle.maxZ],
  ] as const) {
    if (Math.abs(delta) < Number.EPSILON) {
      if (origin < minimumBound || origin > maximumBound) return false;
      continue;
    }
    const first = (minimumBound - origin) / delta;
    const second = (maximumBound - origin) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
};

const firstBlockingObstacle = (
  arena: FpsArenaDefinition,
  start: FpsVector3,
  end: FpsVector3,
): string | null =>
  arena.obstacles.find((obstacle) => segmentIntersectsObstacle(start, end, obstacle))?.id ?? null;

/** Return whether an eye-level segment is clear of authored collision geometry. */
export const isFpsLineOfSightClear = (
  arena: FpsArenaDefinition,
  start: FpsVector3,
  end: FpsVector3,
): boolean =>
  arena.obstacles.every(
    (obstacle) =>
      obstacle.height < Math.min(start.y, end.y) ||
      !segmentIntersectsObstacle(start, end, obstacle),
  );

const lifecycleIsVisible = (lifecycle: FpsPlayerLifecycle): boolean =>
  lifecycle !== "disconnected" && lifecycle !== "spectator";

const overlapsObstacle = (
  x: number,
  z: number,
  radius: number,
  obstacle: FpsArenaObstacle,
): boolean =>
  x >= obstacle.minX - radius &&
  x <= obstacle.maxX + radius &&
  z >= obstacle.minZ - radius &&
  z <= obstacle.maxZ + radius;

const resolveObstacle = (
  x: number,
  z: number,
  radius: number,
  obstacle: FpsArenaObstacle,
): { readonly x: number; readonly z: number; readonly blocked: boolean } => {
  if (!overlapsObstacle(x, z, radius, obstacle)) {
    return { x, z, blocked: false };
  }

  const candidates = [
    { x: obstacle.minX - radius, z, distance: Math.abs(x - (obstacle.minX - radius)) },
    { x: obstacle.maxX + radius, z, distance: Math.abs(x - (obstacle.maxX + radius)) },
    { x, z: obstacle.minZ - radius, distance: Math.abs(z - (obstacle.minZ - radius)) },
    { x, z: obstacle.maxZ + radius, distance: Math.abs(z - (obstacle.maxZ + radius)) },
  ];
  const nearest = candidates.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  );
  return { x: nearest.x, z: nearest.z, blocked: true };
};

export const isSpawnPositionValid = (
  arena: FpsArenaDefinition,
  position: FpsVector3,
  occupied: readonly FpsVector3[] = [],
): boolean => {
  if (!finiteVector(position) || position.y < arena.floorY - 0.001) {
    return false;
  }
  const radius = arena.collisionRadius;
  if (
    position.x < arena.bounds.minX + radius ||
    position.x > arena.bounds.maxX - radius ||
    position.z < arena.bounds.minZ + radius ||
    position.z > arena.bounds.maxZ - radius
  ) {
    return false;
  }
  if (
    arena.obstacles.some((obstacle) => overlapsObstacle(position.x, position.z, radius, obstacle))
  ) {
    return false;
  }
  return occupied.every(
    (other) => Math.hypot(other.x - position.x, other.z - position.z) >= radius * 2.5,
  );
};

/**
 * Build a deterministic, public-state-only map diagnostic for local acceptance and debugging.
 * It describes collision geometry, player capsules, spawn-facing rays, and spawn-to-player
 * visibility without exposing private server state.
 */
export const buildFpsMapDiagnostic = (
  arena: FpsArenaDefinition,
  players: readonly Pick<FpsPublicAvatarSnapshot, "playerId" | "position" | "lifecycle">[],
): FpsMapDiagnostic => {
  validateFpsArena(arena);
  const capsules = players.map((player): FpsMapCapsuleDiagnostic => {
    const overlappingObstacleIds = arena.obstacles
      .filter((obstacle) =>
        overlapsObstacle(player.position.x, player.position.z, arena.collisionRadius, obstacle),
      )
      .map((obstacle) => obstacle.id);
    const overlappingPlayerIds = players
      .filter(
        (other) =>
          other.playerId !== player.playerId &&
          Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z) <
            arena.collisionRadius * 2.5,
      )
      .map((other) => other.playerId);
    return {
      playerId: player.playerId,
      center: { ...player.position },
      radius: arena.collisionRadius,
      height: arena.capsuleHeight,
      valid: isSpawnPositionValid(arena, player.position) && overlappingPlayerIds.length === 0,
      overlappingObstacleIds,
      overlappingPlayerIds,
    };
  });
  const spawnRays = arena.spawnPoints.map((spawn): FpsMapSpawnRayDiagnostic => {
    const direction = { x: Math.sin(spawn.yaw), y: 0, z: -Math.cos(spawn.yaw) };
    const end = {
      x: spawn.position.x + direction.x * 4,
      y: spawn.position.y,
      z: spawn.position.z + direction.z * 4,
    };
    return {
      spawnPointId: spawn.id,
      origin: { ...spawn.position },
      direction,
      length: 4,
      valid: isSpawnPositionValid(arena, spawn.position),
      blockedByObstacleId: firstBlockingObstacle(arena, spawn.position, end),
    };
  });
  const visibilityTests = arena.spawnPoints.flatMap((spawn) =>
    players.map((player): FpsMapVisibilityDiagnostic => {
      const blockedByObstacleId = firstBlockingObstacle(arena, spawn.position, player.position);
      return {
        sourceId: `spawn:${spawn.id}`,
        targetId: player.playerId,
        visible:
          lifecycleIsVisible(player.lifecycle) &&
          isSpawnPositionValid(arena, spawn.position) &&
          blockedByObstacleId === null,
        blockedByObstacleId,
      };
    }),
  );
  return {
    mapId: arena.mapId,
    mapHash: fpsMapHash(arena),
    floorY: arena.floorY,
    bounds: { ...arena.bounds },
    collision: {
      capsuleRadius: arena.collisionRadius,
      capsuleHeight: arena.capsuleHeight,
      obstacleIds: arena.obstacles.map((obstacle) => obstacle.id),
    },
    capsules,
    spawnRays,
    visibilityTests,
  };
};

export interface FpsMovementInput {
  readonly position: FpsVector3;
  readonly velocity: FpsVector3;
  readonly moveX: number;
  readonly moveY: number;
  readonly yaw: number;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly jump: boolean;
  readonly grounded: boolean;
  readonly deltaSeconds: number;
}

export interface FpsMovementResult {
  readonly position: FpsVector3;
  readonly velocity: FpsVector3;
  readonly grounded: boolean;
  readonly blocked: boolean;
  readonly locomotion: "idle" | "walk" | "sprint" | "airborne" | "crouch";
}

const normalizeAxes = (x: number, y: number): { readonly x: number; readonly y: number } => {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
};

/** Deterministic server movement shared by prediction tests and the authoritative match. */
export const integrateFpsMovement = (
  arena: FpsArenaDefinition,
  input: FpsMovementInput,
): FpsMovementResult => {
  const delta = clamp(input.deltaSeconds, 0, 0.1);
  const axes = normalizeAxes(input.moveX, input.moveY);
  const forwardX = Math.sin(input.yaw);
  const forwardZ = -Math.cos(input.yaw);
  const rightX = Math.cos(input.yaw);
  const rightZ = Math.sin(input.yaw);
  const targetX = (forwardX * axes.y + rightX * axes.x) * (input.sprint ? 9.5 : 6.5);
  const targetZ = (forwardZ * axes.y + rightZ * axes.x) * (input.sprint ? 9.5 : 6.5);
  const acceleration = axes.x === 0 && axes.y === 0 ? 28 : 20;
  const approach = Math.min(1, acceleration * delta);
  let velocityX = input.velocity.x + (targetX - input.velocity.x) * approach;
  let velocityZ = input.velocity.z + (targetZ - input.velocity.z) * approach;
  let velocityY = input.velocity.y - 18 * delta;
  let grounded = input.grounded;
  if (grounded && input.jump && !input.crouch) {
    velocityY = 6.7;
    grounded = false;
  }
  if (grounded) {
    velocityY = 0;
  }

  let nextX = input.position.x + velocityX * delta;
  let nextZ = input.position.z + velocityZ * delta;
  let blocked = false;
  const radius = arena.collisionRadius;
  const clampedX = clamp(nextX, arena.bounds.minX + radius, arena.bounds.maxX - radius);
  const clampedZ = clamp(nextZ, arena.bounds.minZ + radius, arena.bounds.maxZ - radius);
  blocked ||= clampedX !== nextX || clampedZ !== nextZ;
  nextX = clampedX;
  nextZ = clampedZ;
  for (const obstacle of arena.obstacles) {
    const resolved = resolveObstacle(nextX, nextZ, radius, obstacle);
    if (resolved.blocked) {
      nextX = resolved.x;
      nextZ = resolved.z;
      blocked = true;
      if (Math.abs(velocityX) > Math.abs(velocityZ)) {
        velocityX = 0;
      } else {
        velocityZ = 0;
      }
    }
  }

  let nextY = input.position.y + velocityY * delta;
  if (nextY <= arena.floorY) {
    nextY = arena.floorY;
    velocityY = 0;
    grounded = true;
  }
  const moving = Math.hypot(velocityX, velocityZ) > 0.15;
  const locomotion = !grounded
    ? "airborne"
    : input.crouch
      ? "crouch"
      : !moving
        ? "idle"
        : input.sprint
          ? "sprint"
          : "walk";
  return {
    position: { x: nextX, y: nextY, z: nextZ },
    velocity: { x: velocityX, y: velocityY, z: velocityZ },
    grounded,
    blocked,
    locomotion,
  };
};
