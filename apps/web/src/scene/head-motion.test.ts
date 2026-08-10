import { describe, expect, it } from "vitest";

import {
  createHeadMotionState,
  HEAD_MOTION_DEFAULT_OPTIONS,
  integrateHeadMotion,
  type HeadMotionState,
} from "./head-motion.js";

const step = (
  state: HeadMotionState,
  deltaSeconds: number,
  impulse?: { readonly right: number; readonly up: number; readonly forward: number },
) =>
  integrateHeadMotion(state, {
    deltaSeconds,
    ...(impulse === undefined
      ? {}
      : { impulse: { source: "support-stop" as const, deltaVelocity: impulse } }),
  });

describe("unified head motion solver", () => {
  it("is exactly still without a target or a physics impulse", () => {
    const result = step(createHeadMotionState(), 1 / 60);

    expect(result.snapshot.translation).toEqual({ right: 0, up: 0, forward: 0 });
    expect(result.snapshot.rotation).toEqual({ pitch: 0, yaw: 0, roll: 0 });
    expect(result.snapshot.translationClamped).toBe(false);
    expect(result.snapshot.rotationClamped).toBe(false);
  });

  it("mirrors signed impulses on each local translation axis", () => {
    const axisSamples = [
      { right: 8, up: 0, forward: 0 },
      { right: 0, up: 8, forward: 0 },
      { right: 0, up: 0, forward: 8 },
    ] as const;

    for (const impulse of axisSamples) {
      const positive = step(createHeadMotionState(), 1 / 60, impulse).snapshot.translation;
      const negative = step(createHeadMotionState(), 1 / 60, {
        right: -impulse.right,
        up: -impulse.up,
        forward: -impulse.forward,
      }).snapshot.translation;
      expect(negative.right).toBeCloseTo(-positive.right, 12);
      expect(negative.up).toBeCloseTo(-positive.up, 12);
      expect(negative.forward).toBeCloseTo(-positive.forward, 12);
    }
  });

  it("mirrors signed angular impulses without cross-axis response", () => {
    const positive = integrateHeadMotion(createHeadMotionState(), {
      deltaSeconds: 1 / 60,
      impulse: {
        source: "weapon",
        deltaVelocity: { right: 0, up: 0, forward: 0 },
        angularDeltaVelocity: { pitch: 8, yaw: 0, roll: 0 },
      },
    }).snapshot.rotation;
    const negative = integrateHeadMotion(createHeadMotionState(), {
      deltaSeconds: 1 / 60,
      impulse: {
        source: "weapon",
        deltaVelocity: { right: 0, up: 0, forward: 0 },
        angularDeltaVelocity: { pitch: -8, yaw: 0, roll: 0 },
      },
    }).snapshot.rotation;

    expect(negative.pitch).toBeCloseTo(-positive.pitch, 12);
    expect(positive.yaw).toBe(0);
    expect(positive.roll).toBe(0);
    expect(Math.abs(positive.pitch)).toBeLessThanOrEqual(
      HEAD_MOTION_DEFAULT_OPTIONS.limits.rotation.pitch,
    );
  });

  it("accumulates same-frame body and contact impulses before integration", () => {
    const state = createHeadMotionState();
    const combined = integrateHeadMotion(state, {
      deltaSeconds: 1 / 60,
      impulses: [
        {
          source: "locomotion",
          deltaVelocity: { right: 2, up: 0, forward: 0 },
        },
        {
          source: "collision-stop",
          deltaVelocity: { right: 0, up: 4, forward: 0 },
        },
      ],
    });
    const summed = integrateHeadMotion(state, {
      deltaSeconds: 1 / 60,
      impulse: {
        source: "collision-stop",
        deltaVelocity: { right: 2, up: 4, forward: 0 },
      },
    });

    expect(combined.snapshot.translation.right).toBeCloseTo(summed.snapshot.translation.right, 12);
    expect(combined.snapshot.translation.up).toBeCloseTo(summed.snapshot.translation.up, 12);
    expect(combined.snapshot.source).toBe("collision-stop");
  });

  it("does not accumulate a free-fall gravity bias", () => {
    let state = createHeadMotionState();
    for (let index = 0; index < 120; index += 1) {
      state = step(state, 1 / 60).state;
    }

    expect(state.translation.up).toBe(0);
    expect(state.translationVelocity.up).toBe(0);
  });

  it("keeps a severe support stop stronger than a normal landing", () => {
    const simulate = (deltaVelocity: number, deltaSeconds: number, frames: number): number => {
      let state = createHeadMotionState();
      let minimum = 0;
      for (let index = 0; index < frames; index += 1) {
        const result =
          index === 0
            ? step(state, deltaSeconds, { right: 0, up: deltaVelocity, forward: 0 })
            : step(state, deltaSeconds);
        state = result.state;
        minimum = Math.min(minimum, result.snapshot.translation.up);
      }
      return minimum;
    };

    const normal = simulate(12.27, 1 / 60, 60);
    const severe = simulate(24.8, 1 / 60, 60);

    expect(normal).toBeLessThan(0);
    expect(severe).toBeLessThan(normal);
    expect(severe).toBeGreaterThanOrEqual(-HEAD_MOTION_DEFAULT_OPTIONS.limits.translation.up);
    expect(severe).toBeCloseTo(-0.87, 1);
  });

  it("is frame-rate equivalent for one impulse and its recovery", () => {
    const simulate = (deltaSeconds: number, frames: number) => {
      let state = createHeadMotionState();
      for (let index = 0; index < frames; index += 1) {
        state = step(
          state,
          deltaSeconds,
          index === 0 ? { right: 0, up: 24.8, forward: 0 } : undefined,
        ).state;
      }
      return state;
    };

    const sixty = simulate(1 / 60, 60);
    const oneTwenty = simulate(1 / 120, 120);
    expect(sixty.translation.up).toBeCloseTo(oneTwenty.translation.up, 8);
    expect(sixty.translationVelocity.up).toBeCloseTo(oneTwenty.translationVelocity.up, 8);
  });

  it("reports a bounded immutable snapshot", () => {
    const result = integrateHeadMotion(createHeadMotionState(), {
      deltaSeconds: 1 / 60,
      impulse: {
        source: "support-stop",
        deltaVelocity: { right: 0, up: 200, forward: 0 },
      },
      limits: {
        translation: { right: 0.1, up: 0.2, forward: 0.1 },
      },
    });

    expect(result.snapshot.translationClamped).toBe(true);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.translation)).toBe(true);
    expect(result.snapshot.source).toBe("support-stop");
  });
});
