import type { PhysicsBox, PhysicsVector } from "./mahjong-physics.js";

/** Extra clearance over the controller's contact margin for a stable brace. */
export const PLAYER_WALL_CONTACT_TOLERANCE = 0.035;

const CONTACT_EPSILON = 0.0005;

export interface PlayerCapsuleDimensions {
  readonly radius: number;
  readonly halfHeight: number;
}

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const hasOnlyYawRotation = (box: PhysicsBox): boolean =>
  Math.abs(box.rotationX ?? 0) <= CONTACT_EPSILON &&
  Math.abs(box.rotationZ ?? 0) <= CONTACT_EPSILON;

/**
 * Return whether a capsule is touching the vertical side of any collidable
 * box. The physics controller keeps a small separation from colliders, so the
 * tolerance includes that gap without turning nearby geometry into a brace.
 *
 * Only yaw is handled here. A box tilted around X/Z is a ramp or sloped
 * surface, not a wall; its vertical support remains the physics controller's
 * responsibility. Dynamic boxes are included because they are still solid in
 * the active Rapier world and can be a wall-sized prop.
 */
export const isPlayerTouchingWall = (
  position: PhysicsVector,
  boxes: readonly PhysicsBox[],
  dimensions: PlayerCapsuleDimensions,
  tolerance = PLAYER_WALL_CONTACT_TOLERANCE,
): boolean => {
  const radius = Math.max(0, finiteOr(dimensions.radius, 0));
  const halfHeight = Math.max(0, finiteOr(dimensions.halfHeight, 0));
  const centerX = finiteOr(position.x, Number.NaN);
  const centerY = finiteOr(position.y, Number.NaN);
  const centerZ = finiteOr(position.z, Number.NaN);
  if (![centerX, centerY, centerZ].every(Number.isFinite)) {
    return false;
  }

  const safeTolerance = Math.max(0, finiteOr(tolerance, PLAYER_WALL_CONTACT_TOLERANCE));
  const capsuleBottom = centerY - halfHeight - radius;
  const capsuleTop = centerY + halfHeight + radius;

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
    if (horizontalGap <= radius + safeTolerance) {
      return true;
    }
  }
  return false;
};
