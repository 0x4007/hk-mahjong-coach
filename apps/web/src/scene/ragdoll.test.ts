import { describe, expect, it } from "vitest";

import {
  RAGDOLL_DURATION_SECONDS,
  startRagdoll,
  stepRagdoll,
  resolveRagdollJointPose,
} from "./ragdoll.js";

describe("deterministic presentation ragdoll", () => {
  it("launches in the impact direction with an upward death impulse", () => {
    const state = startRagdoll(
      { x: 4, y: 0.86, z: -2 },
      { direction: { x: 1, y: 0, z: 0 }, force: 8 },
    );

    expect(state.velocity.x).toBeGreaterThan(0);
    expect(state.velocity.y).toBeGreaterThan(2.6);
    expect(state.velocity.z).toBe(0);
    expect(state.active).toBe(true);
  });

  it("settles at the supplied floor and remains reproducible", () => {
    const initial = startRagdoll(
      { x: 0, y: 0.86, z: 0 },
      { direction: { x: 0, y: 0, z: -1 }, force: 5 },
    );
    let first = initial;
    let second = initial;
    for (let index = 0; index < 180; index += 1) {
      first = stepRagdoll(first, 1 / 60, 0.86);
      second = stepRagdoll(second, 1 / 60, 0.86);
    }

    expect(first).toEqual(second);
    expect(first.position.y).toBeGreaterThanOrEqual(0.86);
    expect(first.elapsedSeconds).toBe(RAGDOLL_DURATION_SECONDS);
    expect(first.active).toBe(false);
  });

  it("produces finite joint motion that changes as the body settles", () => {
    const state = startRagdoll(
      { x: 0, y: 0.86, z: 0 },
      { direction: { x: -1, y: 0, z: 0 }, force: 12 },
    );
    const early = resolveRagdollJointPose(state);
    const late = resolveRagdollJointPose({ ...state, elapsedSeconds: 2.2 });

    expect(late.leftArmRoll).not.toBe(early.leftArmRoll);
    for (const value of Object.values(late)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
