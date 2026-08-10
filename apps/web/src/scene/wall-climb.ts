import type { PhysicsBox, PhysicsVector } from "./mahjong-physics.js";
import {
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_WALL_CLIMB_MAX_ACCELERATION,
  PLAYER_WALL_CLIMB_PEAK_SPEED,
  PLAYER_WALL_CLIMB_TOP_CLEARANCE,
} from "./world-scale.js";

const GEOMETRY_EPSILON = 0.0005;
const WALL_CONTACT_TOLERANCE = 0.035;
const WALL_TOP_INSET = PLAYER_CAPSULE_RADIUS + WALL_CONTACT_TOLERANCE;

export interface WallClimbCapsuleDimensions {
  readonly radius: number;
  readonly halfHeight: number;
}

export interface WallClimbWallInput {
  readonly wallNormal: PhysicsVector;
  readonly wallFacePoint: PhysicsVector;
  readonly wallTopY: number;
  readonly box: PhysicsBox;
}

export interface WallClimbGeometryResolution extends WallClimbWallInput {
  /** Capsule-centre position that has clearance above the resolved top. */
  readonly target: PhysicsVector;
  /** Same target height, kept explicit for the physics motor. */
  readonly targetCenterY: number;
  /** Horizontal gap from the capsule centre to the selected wall face. */
  readonly gap: number;
}

export const WALL_CLIMB_PEAK_SPEED = PLAYER_WALL_CLIMB_PEAK_SPEED;
export const WALL_CLIMB_MAX_ACCELERATION = PLAYER_WALL_CLIMB_MAX_ACCELERATION;
export const WALL_CLIMB_TOP_CLEARANCE = PLAYER_WALL_CLIMB_TOP_CLEARANCE;

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const clampFinite = (value: number, minimum: number, maximum: number): number =>
  clamp(finiteOr(value, minimum), minimum, maximum);

const isYawOnly = (box: PhysicsBox): boolean =>
  Math.abs(box.rotationX ?? 0) <= GEOMETRY_EPSILON &&
  Math.abs(box.rotationZ ?? 0) <= GEOMETRY_EPSILON;

const rotateToLocal = (
  x: number,
  z: number,
  rotationY: number,
): { readonly x: number; readonly z: number } => {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return {
    x: cosine * x + sine * z,
    z: -sine * x + cosine * z,
  };
};

const rotateFromLocal = (
  x: number,
  z: number,
  rotationY: number,
): { readonly x: number; readonly z: number } => {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return {
    x: cosine * x - sine * z,
    z: sine * x + cosine * z,
  };
};

const toLocalPoint = (
  point: PhysicsVector,
  box: PhysicsBox,
): { readonly x: number; readonly z: number } =>
  rotateToLocal(point.x - box.center.x, point.z - box.center.z, box.rotationY ?? 0);

const fromLocalPoint = (
  x: number,
  z: number,
  box: PhysicsBox,
): { readonly x: number; readonly z: number } => {
  const world = rotateFromLocal(x, z, box.rotationY ?? 0);
  return { x: world.x + box.center.x, z: world.z + box.center.z };
};

const readDimensions = (
  dimensions: WallClimbCapsuleDimensions | undefined,
): WallClimbCapsuleDimensions => ({
  radius: Math.max(0, finiteOr(dimensions?.radius ?? PLAYER_CAPSULE_RADIUS, PLAYER_CAPSULE_RADIUS)),
  halfHeight: Math.max(
    0,
    finiteOr(dimensions?.halfHeight ?? PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_HALF_HEIGHT),
  ),
});

const targetFromWall = (wall: WallClimbWallInput, dimensions?: WallClimbCapsuleDimensions) => {
  const { radius } = readDimensions(dimensions);
  const rotationY = finiteOr(wall.box.rotationY ?? 0, 0);
  const localFacePoint = toLocalPoint(wall.wallFacePoint, wall.box);
  const localNormal = rotateToLocal(wall.wallNormal.x, wall.wallNormal.z, rotationY);
  const movingAlongX = Math.abs(localNormal.x) >= Math.abs(localNormal.z);
  const normalSign = movingAlongX ? Math.sign(localNormal.x) : Math.sign(localNormal.z);
  const inwardSign = normalSign === 0 ? 0 : -normalSign;
  const localMinNormal = movingAlongX ? -wall.box.halfExtents.x : -wall.box.halfExtents.z;
  const localMaxNormal = movingAlongX ? wall.box.halfExtents.x : wall.box.halfExtents.z;
  const localMinTangent = movingAlongX ? -wall.box.halfExtents.z : -wall.box.halfExtents.x;
  const localMaxTangent = movingAlongX ? wall.box.halfExtents.z : wall.box.halfExtents.x;
  const localFaceAxis = movingAlongX ? localFacePoint.x : localFacePoint.z;
  const localFaceTangent = movingAlongX ? localFacePoint.z : localFacePoint.x;
  const inset = Math.max(radius + WALL_CONTACT_TOLERANCE, WALL_TOP_INSET);
  const safeNormalMin = localMinNormal + inset;
  const safeNormalMax = localMaxNormal - inset;
  const safeTangentMin = localMinTangent + inset;
  const safeTangentMax = localMaxTangent - inset;
  const targetNormal =
    safeNormalMin <= safeNormalMax
      ? clamp(localFaceAxis + inwardSign * inset, safeNormalMin, safeNormalMax)
      : (localMinNormal + localMaxNormal) / 2;
  const targetTangent =
    safeTangentMin <= safeTangentMax
      ? clamp(localFaceTangent, safeTangentMin, safeTangentMax)
      : (localMinTangent + localMaxTangent) / 2;
  const targetLocal = movingAlongX
    ? { x: targetNormal, z: targetTangent }
    : { x: targetTangent, z: targetNormal };
  const targetHorizontal = fromLocalPoint(targetLocal.x, targetLocal.z, wall.box);
  const targetCenterY =
    finiteOr(wall.wallTopY, wall.box.center.y + wall.box.halfExtents.y) +
    PLAYER_CAPSULE_CENTER_HEIGHT +
    WALL_CLIMB_TOP_CLEARANCE;
  return {
    x: targetHorizontal.x,
    y: targetCenterY,
    z: targetHorizontal.z,
  } satisfies PhysicsVector;
};

/**
 * Resolve the capsule-centre target for a known wall face. This only computes
 * geometry; it never moves the authoritative capsule.
 */
export function resolveWallClimbTarget(wall: WallClimbWallInput): PhysicsVector;
/** Resolve a real wall top from the current capsule contact. */
export function resolveWallClimbTarget(
  position: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions?: WallClimbCapsuleDimensions,
): WallClimbGeometryResolution | null;
export function resolveWallClimbTarget(
  first: WallClimbWallInput | PhysicsVector,
  boxes?: readonly PhysicsBox[],
  dimensions?: WallClimbCapsuleDimensions,
): PhysicsVector | WallClimbGeometryResolution | null {
  if (boxes === undefined && "wallNormal" in first) {
    return targetFromWall(first, dimensions);
  }
  if (boxes === undefined) {
    return null;
  }
  if (!("x" in first)) {
    return null;
  }
  return resolveWallTopClearance(first, boxes, dimensions);
}

/**
 * Find the nearest yaw-rotated wall currently touching the capsule and return
 * its real top plus the capsule clearance needed to pass over it.
 */
export const resolveWallTopClearance = (
  position: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions?: WallClimbCapsuleDimensions,
): WallClimbGeometryResolution | null => {
  const capsule = readDimensions(dimensions);
  const centerX = finiteOr(position.x, Number.NaN);
  const centerY = finiteOr(position.y, Number.NaN);
  const centerZ = finiteOr(position.z, Number.NaN);
  if (![centerX, centerY, centerZ].every(Number.isFinite)) {
    return null;
  }
  const capsuleBottom = centerY - capsule.halfHeight - capsule.radius;
  const capsuleTop = centerY + capsule.halfHeight + capsule.radius;
  let best: WallClimbGeometryResolution | null = null;

  for (const box of boxes) {
    if (!isYawOnly(box)) {
      continue;
    }
    const halfX = Math.max(0, finiteOr(box.halfExtents.x, 0));
    const halfY = Math.max(0, finiteOr(box.halfExtents.y, 0));
    const halfZ = Math.max(0, finiteOr(box.halfExtents.z, 0));
    const boxBottom = finiteOr(box.center.y, 0) - halfY;
    const boxTop = finiteOr(box.center.y, 0) + halfY;
    if (boxBottom >= capsuleTop - GEOMETRY_EPSILON || boxTop <= capsuleBottom + GEOMETRY_EPSILON) {
      continue;
    }

    const local = toLocalPoint({ x: centerX, y: centerY, z: centerZ }, box);
    const outsideX = Math.max(0, Math.abs(local.x) - halfX);
    const outsideZ = Math.max(0, Math.abs(local.z) - halfZ);
    const horizontalGap = Math.hypot(outsideX, outsideZ);
    if (horizontalGap > capsule.radius + WALL_CONTACT_TOLERANCE + GEOMETRY_EPSILON) {
      continue;
    }

    const distanceToXFace = halfX - Math.abs(local.x);
    const distanceToZFace = halfZ - Math.abs(local.z);
    const useX = distanceToXFace <= distanceToZFace;
    const faceSign = useX ? (local.x >= 0 ? 1 : -1) : local.z >= 0 ? 1 : -1;
    const faceAxis = useX ? faceSign * halfX : faceSign * halfZ;
    const tangent = useX ? clamp(local.z, -halfZ, halfZ) : clamp(local.x, -halfX, halfX);
    const faceLocal = useX ? { x: faceAxis, z: tangent } : { x: tangent, z: faceAxis };
    const faceWorld = fromLocalPoint(faceLocal.x, faceLocal.z, box);
    const normalLocal = useX ? { x: faceSign, z: 0 } : { x: 0, z: faceSign };
    const normalWorld = rotateFromLocal(normalLocal.x, normalLocal.z, box.rotationY ?? 0);
    const wall: WallClimbWallInput = {
      wallNormal: { x: normalWorld.x, y: 0, z: normalWorld.z },
      wallFacePoint: { x: faceWorld.x, y: centerY, z: faceWorld.z },
      wallTopY: boxTop,
      box,
    };
    const target = targetFromWall(wall, capsule);
    const candidate: WallClimbGeometryResolution = {
      ...wall,
      target,
      targetCenterY: target.y,
      gap: horizontalGap,
    };
    if (best === null || candidate.gap < best.gap) {
      best = candidate;
    }
  }
  return best;
};

/** Explicit name for callers that want to document the contact requirement. */
export const resolveWallClimbTargetAtContact = resolveWallTopClearance;

export const resolveWallClimbProgress = (
  positionY: number,
  startY: number,
  targetY: number,
): number => {
  const distance = targetY - startY;
  if (!Number.isFinite(distance) || distance <= GEOMETRY_EPSILON) {
    return targetY <= startY ? 1 : 0;
  }
  return clampFinite((positionY - startY) / distance, 0, 1);
};

/** Slow at both ends and exactly at peak speed at the midpoint. */
export const resolveWallClimbProfile = (progress: number): number => {
  const normalized = clampFinite(progress, 0, 1);
  return WALL_CLIMB_PEAK_SPEED * Math.sin(Math.PI * normalized);
};

export const resolveWallClimbSpeed = resolveWallClimbProfile;

export interface WallClimbForceInput {
  readonly currentVelocity: number;
  readonly progress: number;
  readonly deltaSeconds: number;
}

/**
 * Return the bounded acceleration that approaches the current profile target.
 * Gravity is applied by the caller's normal physics integration; this motor
 * only supplies the additional upward pull and inherited-momentum braking.
 */
export const resolveWallClimbForce = ({
  currentVelocity,
  progress,
  deltaSeconds,
}: WallClimbForceInput): number => {
  const safeDelta = clampFinite(deltaSeconds, 1 / 240, 0.1);
  const current = finiteOr(currentVelocity, 0);
  const target = resolveWallClimbProfile(progress);
  const desired = (target - current) / safeDelta;
  return clamp(desired, -WALL_CLIMB_MAX_ACCELERATION, WALL_CLIMB_MAX_ACCELERATION);
};

export const resolveWallClimbVelocity = ({
  currentVelocity,
  progress,
  deltaSeconds,
}: WallClimbForceInput): number => {
  const safeDelta = clampFinite(deltaSeconds, 1 / 240, 0.1);
  const current = finiteOr(currentVelocity, 0);
  const target = resolveWallClimbProfile(progress);
  const next =
    current + resolveWallClimbForce({ currentVelocity, progress, deltaSeconds }) * safeDelta;
  return current <= target ? Math.min(target, next) : Math.max(target, next);
};
