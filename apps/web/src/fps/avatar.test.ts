import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  AVATAR_DEFINITIONS,
  FALLBACK_AVATAR_DEFINITION,
  FIRST_PERSON_BODY_LAYER,
  FPS_AVATAR_SOCKET_NAMES,
  applyAvatarSnapshot,
  applyFirstPersonWorldBodyPolicy,
  applyViewmodelSnapshot,
  avatarDiagnostic,
  createFirstPersonAvatarPresentation,
  createFallbackAvatar,
} from "./avatar.js";
import type { FpsPublicAvatarSnapshot } from "@hk-mahjong/fps";

const snapshot = (overrides: Partial<FpsPublicAvatarSnapshot> = {}): FpsPublicAvatarSnapshot => ({
  playerId: "player-1",
  displayName: "Alice",
  modelId: FALLBACK_AVATAR_DEFINITION.modelId,
  teamId: null,
  position: { x: 2, y: 0, z: -3 },
  rotation: { yaw: 0, pitch: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  locomotion: "idle",
  equippedWeaponId: "pistol",
  action: "none",
  health: 100,
  shield: 50,
  alive: true,
  spawnProtectionEndsAtTick: 120,
  stateTick: 10,
  lifecycle: "alive",
  ...overrides,
});

describe("FPS avatar diagnostics", () => {
  it("keeps the fallback registry and named sockets visible", () => {
    const root = createFallbackAvatar(snapshot());
    const socketNames = root
      .getObjectByName("sockets")
      ?.children.map((child) => child.name)
      .sort();
    const diagnostic = avatarDiagnostic(root, 10);
    expect(AVATAR_DEFINITIONS[FALLBACK_AVATAR_DEFINITION.modelId]).toBeDefined();
    expect(socketNames).toEqual([...FPS_AVATAR_SOCKET_NAMES].sort());
    expect(diagnostic).toMatchObject({
      entityId: "player-1",
      modelId: "fallback-mannequin-v1",
      fallback: true,
      meshCount: 7,
      visibleMeshes: 7,
      lastSnapshotTick: 10,
      diagnosticWarning: null,
    });
    expect(diagnostic.bounds.max.y).toBeGreaterThan(1.5);
  });

  it("reports an authored-model fallback and hides disconnected avatars", () => {
    const root = createFallbackAvatar(snapshot({ modelId: "missing-authored-model" }));
    expect(root.userData.diagnosticWarning).toBe("missing_avatar_asset_fallback");
    applyAvatarSnapshot(
      root,
      snapshot({ locomotion: "crouch", lifecycle: "disconnected", stateTick: 22 }),
    );
    expect(root.visible).toBe(false);
    expect(root.scale.y).toBeCloseTo(0.72);
    expect(root.userData.lastSnapshotTick).toBe(22);
    expect(avatarDiagnostic(root, 22).visibleMeshes).toBe(0);
  });

  it("keeps the world body present while camera-occluding only upper-body meshes", () => {
    const root = createFallbackAvatar(snapshot());
    applyFirstPersonWorldBodyPolicy(root, true);
    const firstPerson = avatarDiagnostic(root, 10);
    expect(firstPerson.rootVisible).toBe(true);
    expect(firstPerson.visibleMeshes).toBe(7);
    expect(firstPerson.layerMasks).toContain(1 << FIRST_PERSON_BODY_LAYER);
    expect(root.userData.firstPersonBodyPolicy).toBe("upper-body-camera-occluded");

    applyFirstPersonWorldBodyPolicy(root, false);
    const thirdPerson = avatarDiagnostic(root, 10);
    expect(thirdPerson.visibleMeshes).toBe(7);
    expect(thirdPerson.layerMasks).toEqual([1]);
    expect(root.userData.firstPersonBodyPolicy).toBe("full-world-body");
  });

  it("renders the authoritative world weapon and fire action", () => {
    const root = createFallbackAvatar(snapshot());
    const weapon = root.getObjectByName("avatar-weapon");
    expect(weapon).toBeInstanceOf(THREE.Mesh);
    applyAvatarSnapshot(
      root,
      snapshot({ equippedWeaponId: "rifle", action: "fire", stateTick: 44 }),
    );
    expect(root.userData.avatarAction).toBe("fire");
    expect(weapon?.scale.z).toBeCloseTo(1.45);
    expect(weapon?.userData.avatarWeaponId).toBe("rifle");
  });

  it("keeps the first-person viewmodel aligned with authoritative weapon and lifecycle state", () => {
    const presentation = createFirstPersonAvatarPresentation(snapshot());
    const weapon = presentation.viewmodel.getObjectByName("viewmodel-weapon");
    expect(weapon).toBeInstanceOf(THREE.Mesh);
    applyViewmodelSnapshot(
      presentation.viewmodel,
      snapshot({
        equippedWeaponId: "rifle",
        action: "reload",
        locomotion: "crouch",
        stateTick: 55,
      }),
    );
    expect(presentation.viewmodel.visible).toBe(true);
    expect(presentation.viewmodel.userData.avatarAction).toBe("reload");
    expect(presentation.viewmodel.userData.avatarWeaponId).toBe("rifle");
    expect(presentation.viewmodel.userData.lastSnapshotTick).toBe(55);
    expect(presentation.viewmodel.position.y).toBeCloseTo(-0.08);
    expect(weapon?.scale.z).toBeCloseTo(1.45);
    expect(weapon?.rotation.x).toBeCloseTo(-0.7);

    applyViewmodelSnapshot(
      presentation.viewmodel,
      snapshot({ lifecycle: "disconnected", alive: false, action: "none", stateTick: 56 }),
    );
    expect(presentation.viewmodel.visible).toBe(false);
  });
});
