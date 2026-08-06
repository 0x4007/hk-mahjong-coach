import { describe, expect, it } from "vitest";

import {
  HUMAN_TERMINAL_VELOCITY_KILOMETERS_PER_HOUR,
  PLAYER_MAX_IMPACT_DAMAGE,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  resolveImpactDamage,
} from "./player-impact.js";

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
});
