import { O2_LANDING_BASE_COST, PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD } from "./player-vitals.js";
import {
  PLAYER_JUMP_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
} from "./world-scale.js";

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

/** A normal full-jump landing is the damage-free vertical deceleration window. */
export const PLAYER_LANDING_DAMAGE_FREE_SPEED_METERS_PER_SECOND =
  PLAYER_JUMP_SPEED_METERS_PER_SECOND;

const METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR = 3.6;

const normalizeNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Convert impact delta-v into damage using a simple kinetic-energy-shaped curve.
 *
 * The player's sprint speed is deliberately a damage-free threshold. Above it,
 * the damage rises with the change in velocity squared and reaches lethal damage
 * at the approximate human terminal velocity. The scene supplies the velocity
 * lost during a wall collision or landing, rather than raw travel speed.
 */
export const resolveImpactDamage = (
  decelerationMetersPerSecond: number,
  damageFreeSpeedMetersPerSecond = PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
): number => {
  const deceleration = normalizeNonNegative(decelerationMetersPerSecond);
  const impactSpeedKilometersPerHour = deceleration * METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR;
  const damageFreeSpeed = normalizeNonNegative(damageFreeSpeedMetersPerSecond);
  const damageFreeSpeedKilometersPerHour =
    damageFreeSpeed * METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR;
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

/** Resolve vertical landing damage with a normal full-jump grace window. */
export const resolveLandingImpactDamage = (downwardSpeedMetersPerSecond: number): number =>
  resolveImpactDamage(
    downwardSpeedMetersPerSecond,
    PLAYER_LANDING_DAMAGE_FREE_SPEED_METERS_PER_SECOND,
  );

/**
 * Resolve the part of an unpaid landing charge that can become damage.
 *
 * The O₂ reserve still pays the full exertion charge, but the normal jump's
 * landing speed is a vertical damage grace window. Damage is capped by the
 * unpaid charge so the grace rule cannot increase the existing overflow.
 */
export const resolveLandingO2OverflowDamage = (
  downwardSpeedMetersPerSecond: number,
  landingO2Cost: number,
  availableO2: number,
): number => {
  const cost = normalizeNonNegative(landingO2Cost);
  const reserve = normalizeNonNegative(availableO2);
  const oxygenShortfall = Math.max(0, cost - reserve);
  return Math.min(oxygenShortfall, resolveLandingImpactDamage(downwardSpeedMetersPerSecond));
};

/**
 * Resolve the O₂ charge for a landing from its downward speed.
 *
 * A landing is an energy event, so the charge follows v² rather than the
 * frame-dependent acceleration used for presentation. The full jump's
 * downward speed is the 10 O₂ reference point; a faster fall costs more and
 * an easier drop costs less. Non-finite input is treated as no impact.
 */
export const resolveLandingO2Cost = (downwardSpeedMetersPerSecond: number): number => {
  const downwardSpeed = normalizeNonNegative(downwardSpeedMetersPerSecond);
  if (downwardSpeed <= 0) {
    return 0;
  }
  const speedRatio = downwardSpeed / PLAYER_JUMP_SPEED_METERS_PER_SECOND;
  return O2_LANDING_BASE_COST * speedRatio ** 2;
};
