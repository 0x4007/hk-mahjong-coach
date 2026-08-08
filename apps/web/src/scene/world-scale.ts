/**
 * Shared world-measurement contract.
 *
 * Every Three.js coordinate, PhysicsBox coordinate, and Rapier position in
 * the first-person scene is expressed in world units. The current contract is
 * intentionally human-readable: one world unit is exactly one metre.
 */
export const WORLD_SCALE_VERSION = "world-meters-v1" as const;
export const WORLD_METERS_PER_UNIT = 1;
export const WORLD_UNITS_PER_METER = 1 / WORLD_METERS_PER_UNIT;

export const worldUnitsFromMeters = (meters: number): number => {
  if (!Number.isFinite(meters)) {
    throw new TypeError("World measurements must be finite");
  }
  return meters * WORLD_UNITS_PER_METER;
};

export const metersFromWorldUnits = (worldUnits: number): number => {
  if (!Number.isFinite(worldUnits)) {
    throw new TypeError("World coordinates must be finite");
  }
  return worldUnits * WORLD_METERS_PER_UNIT;
};

/** Small geometric tolerance used by both live and fallback collision code. */
export const WORLD_EPSILON = worldUnitsFromMeters(0.0005);

/** The authoritative first-person capsule dimensions. */
export const PLAYER_CAPSULE_RADIUS_METERS = 0.26;
export const PLAYER_CAPSULE_HALF_HEIGHT_METERS = 0.6;
export const PLAYER_CAPSULE_CENTER_HEIGHT_METERS =
  PLAYER_CAPSULE_HALF_HEIGHT_METERS + PLAYER_CAPSULE_RADIUS_METERS;
export const PLAYER_CAPSULE_RADIUS = worldUnitsFromMeters(PLAYER_CAPSULE_RADIUS_METERS);
export const PLAYER_CAPSULE_HALF_HEIGHT = worldUnitsFromMeters(PLAYER_CAPSULE_HALF_HEIGHT_METERS);
export const PLAYER_CAPSULE_CENTER_HEIGHT = worldUnitsFromMeters(
  PLAYER_CAPSULE_CENTER_HEIGHT_METERS,
);

/** Human eye references measured from the player's feet. */
export const PLAYER_STANDING_EYE_HEIGHT_METERS = 1.75;
export const PLAYER_CROUCH_EYE_HEIGHT_METERS = 1;
export const PLAYER_STANDING_EYE_HEIGHT = worldUnitsFromMeters(PLAYER_STANDING_EYE_HEIGHT_METERS);
export const PLAYER_CROUCH_EYE_HEIGHT = worldUnitsFromMeters(PLAYER_CROUCH_EYE_HEIGHT_METERS);

/** Base movement values shared by the live controller and simulator. */
export const PLAYER_MOVE_SPEED_METERS_PER_SECOND = 3.4;
/** Upright walk mode uses the unscaled base movement speed. */
export const PLAYER_WALK_MULTIPLIER = 1;
/** Standing trot is exactly one-and-a-half times the base movement speed. */
export const PLAYER_TROT_MULTIPLIER = 1.5;
export const PLAYER_TROT_SPEED_METERS_PER_SECOND =
  PLAYER_MOVE_SPEED_METERS_PER_SECOND * PLAYER_TROT_MULTIPLIER;
export const PLAYER_TROT_SPEED_KILOMETERS_PER_HOUR = PLAYER_TROT_SPEED_METERS_PER_SECOND * 3.6;
/** Sprint is three times the base movement speed. */
export const PLAYER_SPRINT_MULTIPLIER = 3;
export const PLAYER_SPRINT_SPEED_METERS_PER_SECOND =
  PLAYER_MOVE_SPEED_METERS_PER_SECOND * PLAYER_SPRINT_MULTIPLIER;
export const PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR = PLAYER_SPRINT_SPEED_METERS_PER_SECOND * 3.6;
export const PLAYER_WALK_SPEED_RATIO =
  PLAYER_MOVE_SPEED_METERS_PER_SECOND / PLAYER_SPRINT_SPEED_METERS_PER_SECOND;
/** Trot's position on the walk-to-sprint O₂ telemetry scale. */
export const PLAYER_TROT_LOCOMOTION_BLEND =
  (PLAYER_TROT_SPEED_METERS_PER_SECOND / PLAYER_SPRINT_SPEED_METERS_PER_SECOND -
    PLAYER_WALK_SPEED_RATIO) /
  (1 - PLAYER_WALK_SPEED_RATIO);

/** Shared traversal and controller measurements. */
export const PLAYER_AUTOSTEP_HEIGHT_METERS = 0.28;
export const PLAYER_AUTOSTEP_MAX_WIDTH_METERS = 0.2;
export const PLAYER_SNAP_TO_GROUND_DISTANCE_METERS = 0.12;
export const PLAYER_SUPPORT_SNAP_HEIGHT_METERS = 0.14;
export const PLAYER_AUTOSTEP_HEIGHT = worldUnitsFromMeters(PLAYER_AUTOSTEP_HEIGHT_METERS);
export const PLAYER_AUTOSTEP_MAX_WIDTH = worldUnitsFromMeters(PLAYER_AUTOSTEP_MAX_WIDTH_METERS);
export const PLAYER_SNAP_TO_GROUND_DISTANCE = worldUnitsFromMeters(
  PLAYER_SNAP_TO_GROUND_DISTANCE_METERS,
);
export const PLAYER_SUPPORT_SNAP_HEIGHT = worldUnitsFromMeters(PLAYER_SUPPORT_SNAP_HEIGHT_METERS);

/** Shared movement acceleration values, expressed in metres-based units. */
export const PLAYER_JUMP_SPEED_METERS_PER_SECOND = 13.2;
export const WORLD_GRAVITY_METERS_PER_SECOND_SQUARED = 48;
export const PLAYER_JUMP_SPEED = worldUnitsFromMeters(PLAYER_JUMP_SPEED_METERS_PER_SECOND);
export const WORLD_GRAVITY = worldUnitsFromMeters(WORLD_GRAVITY_METERS_PER_SECOND_SQUARED);
