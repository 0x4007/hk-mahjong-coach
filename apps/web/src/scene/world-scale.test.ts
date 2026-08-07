import { describe, expect, it } from "vitest";

import {
  metersFromWorldUnits,
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_CAPSULE_CENTER_HEIGHT_METERS,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_CAPSULE_RADIUS_METERS,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT_METERS,
  PLAYER_MOVE_SPEED_METERS_PER_SECOND,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_STANDING_EYE_HEIGHT,
  PLAYER_STANDING_EYE_HEIGHT_METERS,
  PLAYER_TROT_LOCOMOTION_BLEND,
  PLAYER_TROT_MULTIPLIER,
  PLAYER_TROT_SPEED_KILOMETERS_PER_HOUR,
  PLAYER_TROT_SPEED_METERS_PER_SECOND,
  PLAYER_WALK_MULTIPLIER,
  PLAYER_WALK_SPEED_RATIO,
  WORLD_METERS_PER_UNIT,
  WORLD_SCALE_VERSION,
  WORLD_UNITS_PER_METER,
  worldUnitsFromMeters,
} from "./world-scale.js";

describe("world measurement contract", () => {
  it("pins one world unit to one metre", () => {
    expect(WORLD_SCALE_VERSION).toBe("world-meters-v1");
    expect(WORLD_METERS_PER_UNIT).toBe(1);
    expect(WORLD_UNITS_PER_METER).toBe(1);
    expect(worldUnitsFromMeters(2.5)).toBe(2.5);
    expect(metersFromWorldUnits(2.5)).toBe(2.5);
  });

  it("keeps player dimensions and eye heights in the same scale", () => {
    expect(PLAYER_CAPSULE_RADIUS).toBe(PLAYER_CAPSULE_RADIUS_METERS);
    expect(PLAYER_CAPSULE_CENTER_HEIGHT).toBe(PLAYER_CAPSULE_CENTER_HEIGHT_METERS);
    expect(PLAYER_STANDING_EYE_HEIGHT).toBe(PLAYER_STANDING_EYE_HEIGHT_METERS);
    expect(PLAYER_STANDING_EYE_HEIGHT_METERS).toBe(1.75);
    expect(PLAYER_CROUCH_EYE_HEIGHT).toBe(PLAYER_CROUCH_EYE_HEIGHT_METERS);
    expect(PLAYER_CROUCH_EYE_HEIGHT_METERS).toBe(1);
    expect(PLAYER_STANDING_EYE_HEIGHT).toBeGreaterThan(PLAYER_CAPSULE_CENTER_HEIGHT);
  });

  it("pins the two-times-base trot and three-times-base sprint speeds", () => {
    expect(PLAYER_MOVE_SPEED_METERS_PER_SECOND).toBe(3.4);
    expect(PLAYER_WALK_MULTIPLIER).toBe(1);
    expect(PLAYER_TROT_MULTIPLIER).toBe(2);
    expect(PLAYER_TROT_SPEED_METERS_PER_SECOND).toBeCloseTo(6.8, 8);
    expect(PLAYER_TROT_SPEED_KILOMETERS_PER_HOUR).toBeCloseTo(24.48, 8);
    expect(PLAYER_SPRINT_MULTIPLIER).toBe(3);
    expect(PLAYER_SPRINT_SPEED_METERS_PER_SECOND).toBeCloseTo(10.2, 8);
    expect(PLAYER_SPRINT_SPEED_KILOMETERS_PER_HOUR).toBeCloseTo(36.72, 8);
    expect(PLAYER_WALK_SPEED_RATIO).toBeCloseTo(3.4 / 10.2, 8);
    expect(PLAYER_TROT_LOCOMOTION_BLEND).toBeCloseTo(0.5, 8);
  });

  it("rejects non-finite conversions", () => {
    expect(() => worldUnitsFromMeters(Number.NaN)).toThrow(TypeError);
    expect(() => metersFromWorldUnits(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
