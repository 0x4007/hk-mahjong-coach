import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  resolveSniperScopeProjection,
  shouldEnableSniperScope,
  SNIPER_SCOPE_FRAGMENT_SHADER,
  SNIPER_SCOPE_MAGNIFICATION,
} from "./sniper-scope.js";

describe("sniper scope lens projection", () => {
  it("activates only for a sniper in explicit ADS", () => {
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
  });

  it("contains a real scene-texture sample and inverse magnification", () => {
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("uniform sampler2D tDiffuse");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("uniform sampler2D uScopeScene");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("texture2D(uScopeScene");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("delta / max(uMagnification, 1.0)");
    expect(SNIPER_SCOPE_FRAGMENT_SHADER).toContain("smoothstep");
  });
});
