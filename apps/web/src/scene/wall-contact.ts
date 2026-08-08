import type { PhysicsBox, PhysicsVector } from "./mahjong-physics.js";

/** Extra clearance over the controller's contact margin for a stable brace. */
export const PLAYER_WALL_CONTACT_TOLERANCE = 0.035;
/** Maximum capsule-to-wall gap that can engage cover on the zoom-on edge. */
export const PLAYER_WALL_COVER_RANGE_METERS = 2;
/** Cover accepts a 90° horizontal cone: 45° to either side of the wall face. */
export const PLAYER_WALL_COVER_HALF_ANGLE_RADIANS = Math.PI / 4;
/** Small gap retained by the snap target so the capsule stays outside the wall. */
export const PLAYER_WALL_SNAP_CLEARANCE = 0.01;

const CONTACT_EPSILON = 0.0005;
const DIRECTION_DOT_EPSILON = Number.EPSILON * 32;

export interface PlayerCapsuleDimensions {
  readonly radius: number;
  readonly halfHeight: number;
}

/**
 * The wall face currently supporting the player's side contact. `tangent` is
 * a unit world-space vector along the face; `tangentLimit` is the furthest the
 * capsule centre may travel along that axis while retaining a full-radius
 * overlap with the box.
 */
export interface PlayerWallContact {
  readonly box: PhysicsBox;
  readonly normal: PhysicsVector;
  readonly tangent: PhysicsVector;
  readonly tangentLimit: number;
  /** Horizontal gap from the capsule surface to the selected wall face. */
  readonly distance: number;
}

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const hasOnlyYawRotation = (box: PhysicsBox): boolean =>
  Math.abs(box.rotationX ?? 0) <= CONTACT_EPSILON &&
  Math.abs(box.rotationZ ?? 0) <= CONTACT_EPSILON;

/**
 * Return whether a horizontal view direction points into the selected wall's
 * 90° cover cone. `normal` points from the wall toward the player, so the
 * player-facing direction is its inverse. Vertical camera pitch is ignored.
 */
export const isPlayerFacingWall = (
  viewForward: PhysicsVector,
  contact: Pick<PlayerWallContact, "normal">,
  halfAngleRadians = PLAYER_WALL_COVER_HALF_ANGLE_RADIANS,
): boolean => {
  const forwardLength = Math.hypot(
    finiteOr(viewForward.x, Number.NaN),
    finiteOr(viewForward.z, Number.NaN),
  );
  const normalLength = Math.hypot(
    finiteOr(contact.normal.x, Number.NaN),
    finiteOr(contact.normal.z, Number.NaN),
  );
  if (!(forwardLength > CONTACT_EPSILON) || !(normalLength > CONTACT_EPSILON)) {
    return false;
  }
  const safeHalfAngle = Math.min(
    Math.PI,
    Math.max(0, finiteOr(halfAngleRadians, PLAYER_WALL_COVER_HALF_ANGLE_RADIANS)),
  );
  const towardWallDot =
    (-viewForward.x * contact.normal.x - viewForward.z * contact.normal.z) /
    (forwardLength * normalLength);
  return towardWallDot >= Math.cos(safeHalfAngle) - DIRECTION_DOT_EPSILON;
};

type WallContactPredicate = (contact: PlayerWallContact) => boolean;

/**
 * Resolve the nearest vertical side of a collidable box within the requested
 * capsule-to-wall distance.
 * The physics controller keeps a small separation from colliders, so the
 * tolerance includes that gap without turning nearby geometry into a brace.
 *
 * Only yaw is handled here. A box tilted around X/Z is a ramp or sloped
 * surface, not a wall; its vertical support remains the physics controller's
 * responsibility. Dynamic boxes are included because they are still solid in
 * the active Rapier world and can be a wall-sized prop.
 */
const resolveNearestPlayerWallContact = (
  position: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions: PlayerCapsuleDimensions,
  tolerance = PLAYER_WALL_CONTACT_TOLERANCE,
  predicate: WallContactPredicate = () => true,
): PlayerWallContact | null => {
  const radius = Math.max(0, finiteOr(dimensions.radius, 0));
  const halfHeight = Math.max(0, finiteOr(dimensions.halfHeight, 0));
  const centerX = finiteOr(position.x, Number.NaN);
  const centerY = finiteOr(position.y, Number.NaN);
  const centerZ = finiteOr(position.z, Number.NaN);
  if (![centerX, centerY, centerZ].every(Number.isFinite)) {
    return null;
  }

  const safeTolerance = Math.max(0, finiteOr(tolerance, PLAYER_WALL_CONTACT_TOLERANCE));
  const capsuleBottom = centerY - halfHeight - radius;
  const capsuleTop = centerY + halfHeight + radius;

  let nearestContact: PlayerWallContact | null = null;
  for (const box of boxes) {
    if (!hasOnlyYawRotation(box)) {
      continue;
    }
    const halfX = Math.max(0, finiteOr(box.halfExtents.x, 0));
    const halfY = Math.max(0, finiteOr(box.halfExtents.y, 0));
    const halfZ = Math.max(0, finiteOr(box.halfExtents.z, 0));
    const boxBottom = box.center.y - halfY;
    const boxTop = box.center.y + halfY;
    // Strict overlap rejects a floor or platform that only meets the capsule
    // at its feet, while still accepting a side that spans the player body.
    if (boxBottom >= capsuleTop - CONTACT_EPSILON || boxTop <= capsuleBottom + CONTACT_EPSILON) {
      continue;
    }

    const deltaX = centerX - box.center.x;
    const deltaZ = centerZ - box.center.z;
    const yaw = finiteOr(box.rotationY ?? 0, 0);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    // Transform the capsule centre into the box's yaw-local horizontal frame.
    const localX = cosYaw * deltaX + sinYaw * deltaZ;
    const localZ = -sinYaw * deltaX + cosYaw * deltaZ;
    const outsideX = Math.max(0, Math.abs(localX) - halfX);
    const outsideZ = Math.max(0, Math.abs(localZ) - halfZ);
    const horizontalGap = Math.hypot(outsideX, outsideZ);
    const distance = Math.max(0, horizontalGap - radius);
    if (distance > safeTolerance) {
      continue;
    }

    // A normal aligned with the nearest box face gives cover a stable tangent
    // even when the capsule is just outside a rounded corner. Thin wall slabs
    // therefore resolve to their long face, while a broad block still has a
    // deterministic side at a corner.
    const useXFace =
      outsideX > CONTACT_EPSILON && (outsideZ <= CONTACT_EPSILON || outsideX <= outsideZ);
    const useZFace = !useXFace;
    const localNormalX = useXFace ? (localX >= 0 ? 1 : -1) : 0;
    const localNormalZ = useZFace ? (localZ >= 0 ? 1 : -1) : 0;
    const normal: PhysicsVector = {
      x: cosYaw * localNormalX - sinYaw * localNormalZ,
      y: 0,
      z: sinYaw * localNormalX + cosYaw * localNormalZ,
    };
    const tangent: PhysicsVector = useXFace
      ? { x: -sinYaw, y: 0, z: cosYaw }
      : { x: cosYaw, y: 0, z: sinYaw };
    const tangentHalfExtent = useXFace ? halfZ : halfX;
    const contact: PlayerWallContact = {
      box,
      normal,
      tangent,
      // The tangent limit describes the physical wall face, not the search
      // range. A near-wall query can use a 2 m tolerance without collapsing
      // the playable cover span to zero.
      tangentLimit: Math.max(0, tangentHalfExtent - radius - PLAYER_WALL_CONTACT_TOLERANCE),
      distance,
    };
    if (!predicate(contact)) {
      continue;
    }
    if (nearestContact === null || contact.distance < nearestContact.distance) {
      nearestContact = contact;
    }
  }
  return nearestContact;
};

export const resolvePlayerWallContact = (
  position: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions: PlayerCapsuleDimensions,
  tolerance = PLAYER_WALL_CONTACT_TOLERANCE,
): PlayerWallContact | null =>
  resolveNearestPlayerWallContact(position, boxes, dimensions, tolerance);

/**
 * Resolve the nearest wall that is both in range and inside the player's
 * horizontal cover cone. Filtering before nearest-contact selection prevents
 * a parallel or rear wall from hiding a valid wall farther ahead.
 */
export const resolvePlayerWallContactInFacingCone = (
  position: PhysicsVector,
  viewForward: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions: PlayerCapsuleDimensions,
  tolerance = PLAYER_WALL_CONTACT_TOLERANCE,
  halfAngleRadians = PLAYER_WALL_COVER_HALF_ANGLE_RADIANS,
): PlayerWallContact | null =>
  resolveNearestPlayerWallContact(position, boxes, dimensions, tolerance, (contact) =>
    isPlayerFacingWall(viewForward, contact, halfAngleRadians),
  );

/** Return only the boolean contact state for callers that do not need details. */
export const isPlayerTouchingWall = (
  position: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions: PlayerCapsuleDimensions,
  tolerance = PLAYER_WALL_CONTACT_TOLERANCE,
): boolean => resolvePlayerWallContact(position, boxes, dimensions, tolerance) !== null;

/**
 * Resolve the capsule centre that hugs the selected wall face while retaining
 * the current height and the nearest valid tangent coordinate.
 */
export const resolvePlayerWallSnapTarget = (
  position: PhysicsVector,
  contact: PlayerWallContact,
  dimensions: PlayerCapsuleDimensions,
  clearance = PLAYER_WALL_SNAP_CLEARANCE,
): PhysicsVector => {
  const yaw = finiteOr(contact.box.rotationY ?? 0, 0);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const localAxisX: PhysicsVector = { x: cosYaw, y: 0, z: sinYaw };
  const normalAxisDot = contact.normal.x * localAxisX.x + contact.normal.z * localAxisX.z;
  const useXFace = Math.abs(normalAxisDot) > 0.5;
  const normalHalfExtent = useXFace
    ? Math.max(0, finiteOr(contact.box.halfExtents.x, 0))
    : Math.max(0, finiteOr(contact.box.halfExtents.z, 0));
  const deltaX = position.x - contact.box.center.x;
  const deltaZ = position.z - contact.box.center.z;
  const tangentCoordinate = deltaX * contact.tangent.x + deltaZ * contact.tangent.z;
  const clampedTangentCoordinate = THREE_LIKE_CLAMP(
    tangentCoordinate,
    -contact.tangentLimit,
    contact.tangentLimit,
  );
  const safeRadius = Math.max(0, finiteOr(dimensions.radius, 0));
  const safeClearance = Math.max(0, finiteOr(clearance, PLAYER_WALL_SNAP_CLEARANCE));
  const wallFaceDistance = normalHalfExtent + safeRadius + safeClearance;
  return {
    x:
      contact.box.center.x +
      contact.normal.x * wallFaceDistance +
      contact.tangent.x * clampedTangentCoordinate,
    y: position.y,
    z:
      contact.box.center.z +
      contact.normal.z * wallFaceDistance +
      contact.tangent.z * clampedTangentCoordinate,
  };
};

/** Resolve one horizontal snap step without overshooting the target. */
export const resolvePlayerWallSnapDelta = (
  position: PhysicsVector,
  target: PhysicsVector,
  speedMetersPerSecond: number,
  deltaSeconds: number,
): PhysicsVector => {
  const deltaX = finiteOr(target.x, position.x) - finiteOr(position.x, 0);
  const deltaZ = finiteOr(target.z, position.z) - finiteOr(position.z, 0);
  const distance = Math.hypot(deltaX, deltaZ);
  const speed = Math.max(0, finiteOr(speedMetersPerSecond, 0));
  const delta = Math.max(0, finiteOr(deltaSeconds, 0));
  const step = Math.min(distance, speed * delta);
  if (distance <= Number.EPSILON || step <= Number.EPSILON) {
    return { x: 0, y: 0, z: 0 };
  }
  const scale = step / distance;
  return { x: deltaX * scale, y: 0, z: deltaZ * scale };
};

/**
 * Keep a cover player's capsule centre inside the engaged wall's tangent
 * extent. The normal component is intentionally untouched; Rapier remains
 * responsible for resolving the player's distance from the wall.
 */
export const clampPlayerPositionToWallTangent = (
  position: PhysicsVector,
  contact: PlayerWallContact,
): PhysicsVector => {
  const deltaX = position.x - contact.box.center.x;
  const deltaZ = position.z - contact.box.center.z;
  const tangentCoordinate = deltaX * contact.tangent.x + deltaZ * contact.tangent.z;
  const clampedCoordinate = THREE_LIKE_CLAMP(
    tangentCoordinate,
    -contact.tangentLimit,
    contact.tangentLimit,
  );
  const correction = clampedCoordinate - tangentCoordinate;
  return {
    x: position.x + contact.tangent.x * correction,
    y: position.y,
    z: position.z + contact.tangent.z * correction,
  };
};

/** Remove the wall-normal component from active-cover horizontal movement. */
export const projectPlayerMovementToWallTangent = (
  movement: PhysicsVector,
  contact: PlayerWallContact,
): PhysicsVector => {
  const normalComponent = movement.x * contact.normal.x + movement.z * contact.normal.z;
  return {
    x: movement.x - contact.normal.x * normalComponent,
    y: movement.y,
    z: movement.z - contact.normal.z * normalComponent,
  };
};

// Keep this module independent from Three.js; all inputs are already finite
// numbers from the physics/controller seam.
const THREE_LIKE_CLAMP = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
