import { describe, expect, it } from "vitest";
import {
  DEFAULT_FPS_ARENA,
  buildFpsMapDiagnostic,
  fpsMapHash,
  isFpsLineOfSightClear,
} from "./arena.js";
import type { FpsPublicAvatarSnapshot } from "./types.js";

const player = (
  overrides: Partial<Pick<FpsPublicAvatarSnapshot, "playerId" | "position" | "lifecycle">> = {},
): Pick<FpsPublicAvatarSnapshot, "playerId" | "position" | "lifecycle"> => ({
  playerId: "player-1",
  position: { x: 0, y: 0, z: 0 },
  lifecycle: "alive",
  ...overrides,
});

describe("FPS map diagnostics", () => {
  it("applies authored obstacle height to eye-level spawn visibility", () => {
    expect(
      isFpsLineOfSightClear(DEFAULT_FPS_ARENA, { x: -13, y: 1.5, z: -8 }, { x: 13, y: 1.5, z: -8 }),
    ).toBe(true);
    expect(
      isFpsLineOfSightClear(DEFAULT_FPS_ARENA, { x: -13, y: 1.5, z: 0 }, { x: 13, y: 1.5, z: 0 }),
    ).toBe(false);
    expect(
      isFpsLineOfSightClear(DEFAULT_FPS_ARENA, { x: -13, y: 2.2, z: 0 }, { x: 13, y: 2.2, z: 0 }),
    ).toBe(true);
  });

  it("reports collision, capsule, spawn-ray, and visibility data from public players", () => {
    const diagnostic = buildFpsMapDiagnostic(DEFAULT_FPS_ARENA, [player()]);

    expect(diagnostic).toMatchObject({
      mapId: DEFAULT_FPS_ARENA.mapId,
      mapHash: fpsMapHash(DEFAULT_FPS_ARENA),
      floorY: 0,
      collision: {
        capsuleRadius: 0.38,
        capsuleHeight: 1.8,
        obstacleIds: ["center-cover", "west-cover", "east-cover"],
      },
    });
    expect(diagnostic.capsules).toHaveLength(1);
    expect(diagnostic.capsules[0]).toMatchObject({
      playerId: "player-1",
      valid: false,
      overlappingObstacleIds: ["center-cover"],
    });
    expect(diagnostic.spawnRays).toHaveLength(8);
    expect(diagnostic.spawnRays.every((ray) => ray.valid)).toBe(true);
    expect(diagnostic.visibilityTests).toHaveLength(8);
    expect(
      diagnostic.visibilityTests.some((visibility) => visibility.blockedByObstacleId !== null),
    ).toBe(true);
  });

  it("marks overlapping capsules and disconnected targets without exposing private state", () => {
    const diagnostic = buildFpsMapDiagnostic(DEFAULT_FPS_ARENA, [
      player({ playerId: "player-1", position: { x: -6, y: 0, z: -8 } }),
      player({
        playerId: "player-2",
        position: { x: -6.5, y: 0, z: -8 },
        lifecycle: "disconnected",
      }),
    ]);

    expect(diagnostic.capsules[0]?.overlappingPlayerIds).toEqual(["player-2"]);
    expect(diagnostic.capsules[1]?.overlappingPlayerIds).toEqual(["player-1"]);
    expect(diagnostic.visibilityTests).toHaveLength(16);
    expect(
      diagnostic.visibilityTests
        .filter((visibility) => visibility.targetId === "player-2")
        .every((visibility) => !visibility.visible),
    ).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain("health");
    expect(JSON.stringify(diagnostic)).not.toContain("ammo");
  });
});
