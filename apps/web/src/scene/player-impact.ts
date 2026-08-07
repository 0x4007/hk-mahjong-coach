import { PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD } from "./player-vitals.js";
import { PLAYER_SPRINT_SPEED_METERS_PER_SECOND } from "./world-scale.js";

export {
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_WALK_SPEED_RATIO,
} from "./world-scale.js";

/** Approximate human terminal velocity in a spread-eagle fall. */
export const HUMAN_TERMINAL_VELOCITY_KILOMETERS_PER_HOUR = 200;

/** One full impact can deplete both the shield and health pools. */
export const PLAYER_MAX_IMPACT_DAMAGE = PLAYER_MAX_HEALTH + PLAYER_MAX_SHIELD;

const METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR = 3.6;

const normalizeDeceleration = (decelerationMetersPerSecond: number): number =>
  Number.isFinite(decelerationMetersPerSecond) ? Math.max(0, decelerationMetersPerSecond) : 0;

/**
 * Convert impact delta-v into damage using a simple kinetic-energy-shaped curve.
 *
 * The player's sprint speed is deliberately a damage-free threshold. Above it,
 * the damage rises with the change in velocity squared and reaches lethal damage
 * at the approximate human terminal velocity. The scene supplies the velocity
 * lost during a wall collision or landing, rather than raw travel speed.
 */
export const resolveImpactDamage = (decelerationMetersPerSecond: number): number => {
  const deceleration = normalizeDeceleration(decelerationMetersPerSecond);
  const impactSpeedKilometersPerHour = deceleration * METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR;
  const damageFreeSpeedKilometersPerHour =
    PLAYER_SPRINT_SPEED_METERS_PER_SECOND * METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR;
  if (impactSpeedKilometersPerHour <= damageFreeSpeedKilometersPerHour) {
    return 0;
  }

  const safeSpeedSquared = damageFreeSpeedKilometersPerHour ** 2;
  const terminalSpeedSquared = HUMAN_TERMINAL_VELOCITY_KILOMETERS_PER_HOUR ** 2;
  const excessKineticEnergyRatio = Math.min(
    1,
    (impactSpeedKilometersPerHour ** 2 - safeSpeedSquared) /
      (terminalSpeedSquared - safeSpeedSquared),
  );
  return PLAYER_MAX_IMPACT_DAMAGE * excessKineticEnergyRatio;
};
