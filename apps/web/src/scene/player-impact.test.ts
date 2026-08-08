import { describe, expect, it } from "vitest";

import {
  HUMAN_TERMINAL_VELOCITY_KILOMETERS_PER_HOUR,
  PLAYER_MAX_IMPACT_DAMAGE,
  resolveLandingO2Cost,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  resolveImpactDamage,
} from "./player-impact.js";
import { O2_LANDING_BASE_COST } from "./player-vitals.js";
import {
  PLAYER_JUMP_SPEED_METERS_PER_SECOND,
  WORLD_GRAVITY_METERS_PER_SECOND_SQUARED,
} from "./world-scale.js";

describe("player impact damage", () => {
  it("keeps sprint-speed-or-slower deceleration harmless", () => {
    expect(resolveImpactDamage(0)).toBe(0);
    expect(resolveImpactDamage(PLAYER_SPRINT_SPEED_METERS_PER_SECOND)).toBe(0);
    expect(resolveImpactDamage(PLAYER_SPRINT_SPEED_METERS_PER_SECOND - 0.01)).toBe(0);
  });

  it("ramps damage above sprint speed using delta-v", () => {
    const damage = resolveImpactDamage(PLAYER_SPRINT_SPEED_METERS_PER_SECOND + 5);

    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(PLAYER_MAX_IMPACT_DAMAGE);
  });

  it("makes terminal-velocity deceleration lethal", () => {
    const terminalVelocityMetersPerSecond = HUMAN_TERMINAL_VELOCITY_KILOMETERS_PER_HOUR / 3.6;

    expect(resolveImpactDamage(terminalVelocityMetersPerSecond)).toBe(PLAYER_MAX_IMPACT_DAMAGE);
    expect(resolveImpactDamage(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("maps landing speed to an energy-shaped O₂ cost", () => {
    expect(resolveLandingO2Cost(0)).toBe(0);
    expect(resolveLandingO2Cost(PLAYER_JUMP_SPEED_METERS_PER_SECOND)).toBeCloseTo(
      O2_LANDING_BASE_COST,
      8,
    );

    const twoMeterFallSpeed = Math.sqrt(2 * WORLD_GRAVITY_METERS_PER_SECOND_SQUARED * 2);
    const expectedCost =
      O2_LANDING_BASE_COST * (twoMeterFallSpeed / PLAYER_JUMP_SPEED_METERS_PER_SECOND) ** 2;
    expect(resolveLandingO2Cost(twoMeterFallSpeed)).toBeCloseTo(expectedCost, 8);
    expect(resolveLandingO2Cost(twoMeterFallSpeed)).toBeGreaterThan(O2_LANDING_BASE_COST);
    expect(resolveLandingO2Cost(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
