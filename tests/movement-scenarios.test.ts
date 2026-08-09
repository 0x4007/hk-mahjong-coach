import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  formatMovementSimulationJson,
  isMovementTraversalGeometryValid,
  parseMovementScenario,
  runMovementScenario,
  type MovementFrameTrace,
  type MovementScenario,
  type MovementSimulationResult,
} from "../scripts/movement-simulate.js";
import {
  resolvePhysicsBoxGeometrySignature,
  type PhysicsBox,
} from "../apps/web/src/scene/mahjong-physics.js";
import { PLAYER_MOVEMENT_MAX_STEP_SECONDS } from "../apps/web/src/scene/player-movement.js";

const scenarioDirectory = fileURLToPath(new URL("../scripts/movement-scenarios/", import.meta.url));

const expectedScenarioNames = [
  "airborne-wall-contact",
  "crouch-movement",
  "diagonal-movement",
  "direction-reversal",
  "hard-braking",
  "held-jump",
  "invalid-vault",
  "jump",
  "ledge-contact-loss",
  "ledge-grab",
  "low-ledge-landing",
  "low-vault",
  "normal-jump-landing",
  "o2-depletion-recovery",
  "severe-fall",
  "slide-start-stop",
  "sprint-acceleration",
  "sprint-release",
  "top-support",
  "walk-acceleration",
  "wall-climb-release",
] as const;

const scenarios: readonly MovementScenario[] = readdirSync(scenarioDirectory)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) =>
    parseMovementScenario(
      JSON.parse(readFileSync(`${scenarioDirectory}/${name}`, "utf8")) as unknown,
    ),
  );

const results = new Map<string, MovementSimulationResult>();

const resultFor = (name: string): MovementSimulationResult => {
  const result = results.get(name);
  if (result === undefined) {
    throw new Error(`Missing movement scenario result: ${name}`);
  }
  return result;
};

const numericTraceValues = (sample: MovementFrameTrace): readonly number[] => [
  sample.timeSec,
  sample.position.x,
  sample.position.y,
  sample.position.z,
  sample.velocity.x,
  sample.velocity.y,
  sample.velocity.z,
  sample.o2,
  sample.movement.traversalProgress,
  sample.camera.input.localAcceleration.right,
  sample.camera.input.localAcceleration.forward,
  sample.camera.input.localAcceleration.up,
  sample.camera.offsets.roll,
  sample.camera.offsets.headBob,
  sample.camera.offsets.headBobLateral,
  sample.camera.offsets.headBobDepth,
  sample.camera.offsets.headBobPitch,
  sample.camera.offsets.verticalOffset,
  sample.camera.offsets.aimSwayX,
  sample.camera.offsets.aimSwayY,
];

const horizontalSpeed = (sample: MovementFrameTrace): number =>
  Math.hypot(sample.velocity.x, sample.velocity.z);

const beginsTraversalPhase = (sample: MovementFrameTrace): boolean =>
  sample.events.some(
    ({ event }) =>
      event.kind === "vault-start" ||
      event.kind === "ledge-grab" ||
      event.kind === "wall-contact" ||
      event.kind === "wall-climb-request",
  );

const traversalStates = new Set<MovementFrameTrace["movement"]["state"]>([
  "vault",
  "wall-contact",
  "wall-climb",
  "ledge-grab",
]);

const minimumVerticalOffset = (result: MovementSimulationResult): number =>
  Math.min(...result.trace.map((sample) => sample.camera.offsets.verticalOffset));

describe("continuous head-motion movement scenarios", () => {
  beforeAll(async () => {
    for (const scenario of scenarios) {
      const first = await runMovementScenario(scenario);
      const second = await runMovementScenario(scenario);
      expect(second).toEqual(first);
      expect(formatMovementSimulationJson(second)).toBe(formatMovementSimulationJson(first));
      results.set(scenario.name, first);
    }
  }, 60_000);

  it("contains the complete hard-cut schema-v2 scenario matrix", () => {
    expect(scenarios.map((scenario) => scenario.name).sort()).toEqual(
      [...expectedScenarioNames].sort(),
    );
    expect(new Set(scenarios.map((scenario) => scenario.seed)).size).toBe(scenarios.length);
  });

  it("subdivides an oversized requested frame duration at the controller ceiling", async () => {
    const scenario = scenarios[0];
    if (scenario === undefined) {
      throw new Error("Missing movement scenario fixture");
    }
    const result = await runMovementScenario({
      ...scenario,
      frameDurationSec: 1,
    });

    expect(result.trace.length).toBeGreaterThan(0);
    expect(
      Math.max(...result.trace.map((sample) => sample.camera.input.deltaSeconds)),
    ).toBeLessThanOrEqual(PLAYER_MOVEMENT_MAX_STEP_SECONDS + 1e-9);
  });

  it("cancels traversal when source geometry changes or destination clearance closes", () => {
    const source: PhysicsBox = {
      obstacleId: "source",
      center: { x: 0, y: 1, z: 0 },
      halfExtents: { x: 0.5, y: 1, z: 0.5 },
    };
    const target = { x: 3, y: 0.86, z: 0 } as const;
    const sourceGeometryKey = resolvePhysicsBoxGeometrySignature(source);

    expect(
      isMovementTraversalGeometryValid("wall-climb", "source", sourceGeometryKey, target, [source]),
    ).toBe(true);
    expect(
      isMovementTraversalGeometryValid("wall-climb", "source", sourceGeometryKey, target, [
        { ...source, center: { ...source.center, x: 0.25 } },
      ]),
    ).toBe(false);
    expect(
      isMovementTraversalGeometryValid("wall-climb", "source", sourceGeometryKey, target, [
        source,
        {
          obstacleId: "destination-blocker",
          center: { ...target },
          halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
        },
      ]),
    ).toBe(false);
  });

  it.each(expectedScenarioNames)("validates %s through the shared frame pipeline", (name) => {
    const scenario = scenarios.find((candidate) => candidate.name === name);
    if (scenario === undefined) {
      throw new Error(`Missing scenario fixture: ${name}`);
    }
    const result = resultFor(name);
    const failedAssertions = result.assertions.filter((assertion) => !assertion.passed);
    expect(failedAssertions).toEqual([]);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.final).toEqual(result.trace[result.trace.length - 1]);
    expect(result.frameCount).toBe(result.trace.length);

    for (const [index, sample] of result.trace.entries()) {
      expect(sample.frame).toBe(index + 1);
      if (index > 0) {
        expect(sample.timeSec).toBeGreaterThan(result.trace[index - 1]?.timeSec ?? -1);
      }
      expect(numericTraceValues(sample).every(Number.isFinite)).toBe(true);
      expect(sample.o2).toBeGreaterThanOrEqual(0);
      expect(sample.o2).toBeLessThanOrEqual(100);
      expect(sample.camera.input.deltaSeconds).toBeLessThanOrEqual(
        PLAYER_MOVEMENT_MAX_STEP_SECONDS + 1e-9,
      );
      expect(sample.movement.traversalProgress).toBeGreaterThanOrEqual(0);
      expect(sample.movement.traversalProgress).toBeLessThanOrEqual(1);
      expect(sample.contacts.every((contact) => contact.obstacleId.length > 0)).toBe(true);
      expect(sample.camera.offsets.verticalOffset).toBeGreaterThanOrEqual(
        sample.camera.input.verticalOffsetBounds.min - 1e-9,
      );
      if (sample.camera.input.verticalOffsetBounds.max !== null) {
        expect(sample.camera.offsets.verticalOffset).toBeLessThanOrEqual(
          sample.camera.input.verticalOffsetBounds.max + 1e-9,
        );
      }
      expect(sample.presentation.visibleReticleNdc).toEqual(sample.presentation.aimRayNdc);
      expect(sample.presentation.visibleReticleNdc).toEqual(sample.presentation.focusRayNdc);
      if (!sample.grounded || sample.camera.input.traversalActive) {
        expect(sample.camera.offsets.headBobLateral).toBe(0);
        expect(sample.camera.offsets.headBobDepth).toBe(0);
      }
    }

    const flattenedEvents = result.trace.flatMap((sample) =>
      sample.events.map((event) => ({ frame: sample.frame, timeSec: sample.timeSec, ...event })),
    );
    expect(result.orderedEvents).toEqual(flattenedEvents);
    let priorRequiredIndex = -1;
    for (const required of scenario.expect.requiredEvents) {
      const nextIndex = result.orderedEvents.findIndex((entry, index) => {
        if (index <= priorRequiredIndex || entry.event.kind !== required.kind) {
          return false;
        }
        if (required.result !== undefined) {
          return entry.event.kind === "jump" && entry.event.result === required.result;
        }
        if (required.traversal !== undefined) {
          return (
            (entry.event.kind === "traversal-cancel" ||
              entry.event.kind === "traversal-complete") &&
            entry.event.traversal === required.traversal
          );
        }
        return true;
      });
      expect(nextIndex).toBeGreaterThan(priorRequiredIndex);
      priorRequiredIndex = nextIndex;
    }
  });

  it("keeps held input latched until release and a fresh jump press", () => {
    const result = resultFor("held-jump");
    const jumps = result.orderedEvents.filter((entry) => entry.event.kind === "jump");
    expect(jumps).toHaveLength(2);
    expect(
      result.trace
        .filter((sample) => sample.stepLabel === "held-through-landing")
        .flatMap((sample) => sample.events)
        .filter((entry) => entry.event.kind === "jump"),
    ).toHaveLength(1);
  });

  it("permits crouching and standing from zero O2", () => {
    const result = resultFor("crouch-movement");
    const zeroReserveCrouch = result.trace.find(
      (sample) =>
        sample.stepLabel === "crouch-walk" &&
        sample.o2 === 0 &&
        sample.movement.posture === "crouching",
    );
    expect(zeroReserveCrouch).toBeDefined();
    expect(result.final.movement.posture).toBe("standing");
  });

  it("applies faster reversal braking than passive sprint release", () => {
    const reversal = resultFor("direction-reversal");
    const release = resultFor("sprint-release");
    const reversalZeroSample = reversal.trace.find((sample) => sample.velocity.z >= 0);
    const releaseNearZeroSample = release.trace.find((sample) => horizontalSpeed(sample) <= 0.15);
    expect(reversalZeroSample).toBeDefined();
    expect(releaseNearZeroSample).toBeDefined();
    expect(reversalZeroSample?.timeSec ?? Infinity).toBeLessThan(
      releaseNearZeroSample?.timeSec ?? -Infinity,
    );
  });

  it("keeps equal diagonal components under the active speed cap", () => {
    const final = resultFor("diagonal-movement").final;
    expect(Math.abs(Math.abs(final.velocity.x) - Math.abs(final.velocity.z))).toBeLessThan(0.01);
    expect(horizontalSpeed(final)).toBeLessThanOrEqual(5.1 + 0.01);
  });

  it("keeps traversal progress monotonic until completion or cancellation", () => {
    for (const name of [
      "low-vault",
      "ledge-grab",
      "ledge-contact-loss",
      "wall-climb-release",
      "top-support",
    ]) {
      let previous: MovementFrameTrace | undefined;
      for (const current of resultFor(name).trace) {
        const sameContiguousPhase =
          previous !== undefined &&
          traversalStates.has(current.movement.state) &&
          current.movement.state === previous.movement.state &&
          current.movement.obstacleId === previous.movement.obstacleId &&
          !beginsTraversalPhase(current);
        if (sameContiguousPhase && previous !== undefined) {
          expect(current.movement.traversalProgress).toBeGreaterThanOrEqual(
            previous.movement.traversalProgress - 1e-9,
          );
        }
        previous = current;
      }
    }
  });

  it("uses interior traversal frames and one terminal event per traversal", () => {
    for (const [name, startKind, traversal] of [
      ["low-vault", "vault-start", "vault"],
      ["ledge-grab", "ledge-grab", "ledge-grab"],
    ] as const) {
      const result = resultFor(name);
      expect(
        result.trace.some(
          (sample) =>
            sample.movement.traversalProgress > 0 && sample.movement.traversalProgress < 1,
        ),
      ).toBe(true);
      expect(result.orderedEvents.filter(({ event }) => event.kind === startKind)).toHaveLength(1);
      expect(
        result.orderedEvents.filter(
          ({ event }) => event.kind === "traversal-complete" && event.traversal === traversal,
        ),
      ).toHaveLength(1);
    }

    const wall = resultFor("wall-climb-release");
    expect(wall.orderedEvents.filter(({ event }) => event.kind === "wall-contact")).toHaveLength(1);
    expect(
      wall.orderedEvents.filter(({ event }) => event.kind === "wall-climb-request"),
    ).toHaveLength(1);
    expect(
      wall.orderedEvents.filter(
        ({ event }) => event.kind === "traversal-cancel" && event.traversal === "wall-climb",
      ),
    ).toHaveLength(1);

    const completedWall = resultFor("top-support");
    expect(
      completedWall.trace.some(
        (sample) =>
          sample.movement.state === "wall-climb" &&
          sample.movement.traversalProgress > 0 &&
          sample.movement.traversalProgress < 1,
      ),
    ).toBe(true);
    expect(
      completedWall.orderedEvents.filter(({ event }) => event.kind === "wall-contact"),
    ).toHaveLength(1);
    expect(
      completedWall.orderedEvents.filter(({ event }) => event.kind === "wall-climb-request"),
    ).toHaveLength(1);
    expect(
      completedWall.orderedEvents.filter(
        ({ event }) => event.kind === "traversal-complete" && event.traversal === "wall-climb",
      ),
    ).toHaveLength(1);

    const slide = resultFor("slide-start-stop");
    expect(slide.orderedEvents.filter(({ event }) => event.kind === "slide-start")).toHaveLength(1);
    expect(slide.orderedEvents.filter(({ event }) => event.kind === "slide-end")).toHaveLength(1);
  });

  it("binds support and stabilization evidence to the named geometry", () => {
    const topSupport = resultFor("top-support");
    expect(
      topSupport.trace.some((sample) =>
        sample.contacts.some(
          (contact) => contact.kind === "support" && contact.obstacleId === "support-box",
        ),
      ),
    ).toBe(true);

    const lowDrop = resultFor("low-ledge-landing");
    const sourceSupport = lowDrop.trace.findIndex((sample) =>
      sample.contacts.some(
        (contact) => contact.kind === "support" && contact.obstacleId === "low-drop-source",
      ),
    );
    const landing = lowDrop.trace.findIndex((sample) =>
      sample.events.some(({ event }) => event.kind === "landing"),
    );
    expect(sourceSupport).toBeGreaterThanOrEqual(0);
    expect(landing).toBeGreaterThan(sourceSupport);

    const wallContactSamples = resultFor("airborne-wall-contact").trace.filter(
      (sample) => sample.stepLabel === "release-on-wall",
    );
    expect(wallContactSamples.length).toBeGreaterThanOrEqual(12);
    expect(
      wallContactSamples.every(
        (sample) =>
          sample.movement.state === "wall-contact" &&
          !sample.grounded &&
          Math.abs(sample.velocity.y) <= 0.05,
      ),
    ).toBe(true);
    expect(
      Math.max(
        ...wallContactSamples.map((sample) =>
          Math.hypot(sample.camera.offsets.aimSwayX, sample.camera.offsets.aimSwayY),
        ),
      ),
    ).toBeLessThanOrEqual(0.001);
  });

  it("accelerates and releases speed monotonically without reversing", () => {
    for (const name of ["walk-acceleration", "sprint-acceleration"]) {
      const samples = resultFor(name).trace;
      for (let index = 1; index < samples.length; index += 1) {
        expect(horizontalSpeed(samples[index]!)).toBeGreaterThanOrEqual(
          horizontalSpeed(samples[index - 1]!) - 1e-9,
        );
      }
    }

    const release = resultFor("sprint-release").trace;
    for (let index = 1; index < release.length; index += 1) {
      expect(horizontalSpeed(release[index]!)).toBeLessThanOrEqual(
        horizontalSpeed(release[index - 1]!) + 1e-9,
      );
      expect(release[index]!.velocity.z).toBeLessThanOrEqual(1e-9);
    }
  });

  it("orders low, normal, and severe landing weight responses", () => {
    const low = resultFor("low-ledge-landing");
    const normal = resultFor("normal-jump-landing");
    const severe = resultFor("severe-fall");
    expect(low.metrics.maximumDownwardSpeed).toBeLessThan(normal.metrics.maximumDownwardSpeed);
    expect(normal.metrics.maximumDownwardSpeed).toBeLessThan(severe.metrics.maximumDownwardSpeed);
    expect(Math.abs(minimumVerticalOffset(low))).toBeLessThan(
      Math.abs(minimumVerticalOffset(normal)),
    );
    expect(Math.abs(minimumVerticalOffset(normal))).toBeLessThan(
      Math.abs(minimumVerticalOffset(severe)),
    );
  });

  it("cancels a removed ledge before any false completion", () => {
    const result = resultFor("ledge-contact-loss");
    const events = result.orderedEvents.map((entry) => entry.event);
    const grabIndex = events.findIndex((event) => event.kind === "ledge-grab");
    const cancelIndex = events.findIndex(
      (event) => event.kind === "traversal-cancel" && event.traversal === "ledge-grab",
    );
    const completion = events.find(
      (event) => event.kind === "traversal-complete" && event.traversal === "ledge-grab",
    );
    expect(grabIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeGreaterThan(grabIndex);
    expect(completion).toBeUndefined();
  });

  it("depletes, bounds, and recovers O2 while keeping fallback jumping available", () => {
    const result = resultFor("o2-depletion-recovery");
    expect(result.metrics.minimumO2).toBe(0);
    expect(result.final.o2).toBeGreaterThan(15);
    expect(
      result.orderedEvents.some(
        (entry) => entry.event.kind === "jump" && entry.event.result === "fallback",
      ),
    ).toBe(true);
  });
});
