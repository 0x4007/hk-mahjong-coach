import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  resolveSniperScopeCameraFov,
  resolveSniperScopeProjection,
  shouldRenderSniperScopeObject,
  shouldEnableSniperScope,
  SNIPER_SCOPE_FRAGMENT_SHADER,
  SNIPER_SCOPE_MAGNIFICATION,
} from "./sniper-scope.js";

describe("sniper scope lens projection", () => {
  it("activates only for a sniper in explicit zoom", () => {
    expect(
      shouldEnableSniperScope({
        firstPersonActive: true,
        seatView: true,
        aimingDownSights: true,
        lensAvailable: true,
      }),
    ).toBe(true);
    expect(
      shouldEnableSniperScope({
        firstPersonActive: true,
        seatView: true,
        aimingDownSights: false,
        lensAvailable: true,
      }),
    ).toBe(false);
  });

  it("disables the pass without a live lens while keeping finite defaults", () => {
    const projection = resolveSniperScopeProjection({
      enabled: true,
      camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 1200),
      lensAnchor: null,
      lensRadius: 0.062,
      viewportWidth: 0,
      viewportHeight: 0,
    });

    expect(projection.enabled).toBe(false);
    expect(projection.center).toEqual({ x: 0.5, y: 0.5 });
    expect(projection.resolution).toEqual({ x: 1, y: 1 });
    expect(projection.radius).toBeGreaterThan(0);
    expect(projection.magnification).toBe(SNIPER_SCOPE_MAGNIFICATION);
  });

  it("follows the camera-child glass and derives a visible lens radius", () => {
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 1200);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    const lens = new THREE.Object3D();
    lens.position.set(0, 0, -0.8);
    lens.updateMatrixWorld(true);

    const projection = resolveSniperScopeProjection({
      enabled: true,
      camera,
      lensAnchor: lens,
      lensRadius: 0.06,
      viewportWidth: 1600,
      viewportHeight: 900,
    });

    expect(projection.enabled).toBe(true);
    expect(projection.center.x).toBeCloseTo(0.5, 6);
    expect(projection.center.y).toBeCloseTo(0.5, 6);
    expect(projection.radius).toBeGreaterThan(0.045);
    expect(projection.radius).toBeLessThan(0.34);
    expect(projection.resolution).toEqual({ x: 1600, y: 900 });
    expect(projection.sceneResolution.x).toBe(projection.sceneResolution.y);
    expect(projection.sceneResolution.x).toBeGreaterThanOrEqual(256);
  });

  it("derives a tighter camera FOV without dividing degrees", () => {
    const scopeFov = resolveSniperScopeCameraFov(45);
    expect(scopeFov).toBeGreaterThan(0);
    expect(scopeFov).toBeLessThan(45);
    expect(scopeFov).toBeCloseTo(9.47, 1);
    expect(resolveSniperScopeCameraFov(45, 1)).toBeCloseTo(45, 8);
  });

  it("keeps bullet-hole decals in the clean world feed", () => {
    expect(shouldRenderSniperScopeObject({ weaponVisual: true }, false)).toBe(false);
    expect(shouldRenderSniperScopeObject({ weaponVisual: true, bulletHoleRoot: true }, false)).toBe(
      true,
    );
    expect(shouldRenderSniperScopeObject({ weaponVisual: true, bulletHole: true }, false)).toBe(
      true,
    );
    expect(shouldRenderSniperScopeObject({}, true)).toBe(false);
  });

  it("resamples the tight-FOV scene and draws an X scope mark", () => {
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("uniform sampler2D tDiffuse");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("uniform sampler2D uScopeScene");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("uniform vec2 uScopeSceneResolution");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("scopeBicubicSample");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("scopeCubicWeights");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("abs(lensDelta.y - lensDelta.x)");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("abs(lensDelta.y + lensDelta.x)");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("smoothstep");
  });
});
