import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { FpsPublicAvatarSnapshot } from "@hk-mahjong/fps";
import { FALLBACK_AVATAR_DEFINITION } from "./avatar.js";
import { RemotePlayerRenderer } from "./remote-players.js";

const snapshot = (stateTick: number, x: number): FpsPublicAvatarSnapshot => ({
  playerId: "remote-1",
  displayName: "Remote",
  modelId: FALLBACK_AVATAR_DEFINITION.modelId,
  teamId: null,
  position: { x, y: 0, z: 0 },
  rotation: { yaw: 0, pitch: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  locomotion: "walk",
  equippedWeaponId: "pistol",
  action: "none",
  health: 100,
  shield: 50,
  alive: true,
  spawnProtectionEndsAtTick: null,
  stateTick,
  lifecycle: "alive",
});

describe("FPS reduced-motion remote presentation", () => {
  it("uses the latest authoritative pose without interpolation", () => {
    const scene = new THREE.Scene();
    const renderer = new RemotePlayerRenderer(scene, "local-1");
    renderer.applySnapshots([snapshot(1, 0)], 0);
    renderer.applySnapshots([snapshot(2, 10)], 100);

    renderer.update(150, false);
    expect(renderer.getRoot("remote-1")?.position.x).toBeCloseTo(5);

    renderer.update(150, true);
    expect(renderer.getRoot("remote-1")?.position.x).toBeCloseTo(10);
    renderer.dispose();
  });
});
