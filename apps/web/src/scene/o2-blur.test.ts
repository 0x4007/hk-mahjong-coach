import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  DAMAGE_VIGNETTE_PULSE_DURATION_SECONDS,
  createDamageVignettePass,
  resolveDamageVignetteOpacityFromDelta,
  resolveDamageVignettePulseOpacity,
  setDamageVignettePassCenter,
  setDamageVignettePassSize,
} from "./o2-blur.js";

describe("damage vignette response", () => {
  it("maps each lost point to one percentage point of opacity", () => {
    expect(resolveDamageVignetteOpacityFromDelta(1)).toBeCloseTo(0.01, 12);
    expect(resolveDamageVignetteOpacityFromDelta(37.5)).toBeCloseTo(0.375, 12);
    expect(resolveDamageVignetteOpacityFromDelta(100)).toBe(1);
    expect(resolveDamageVignetteOpacityFromDelta(250)).toBe(1);
    expect(resolveDamageVignetteOpacityFromDelta(0)).toBe(0);
    expect(resolveDamageVignetteOpacityFromDelta(Number.NaN)).toBe(0);
  });

  it("fades each strike layer independently", () => {
    const initialOpacity = resolveDamageVignetteOpacityFromDelta(40);

    expect(resolveDamageVignettePulseOpacity(initialOpacity, 0)).toBeCloseTo(0.4, 12);
    expect(
      resolveDamageVignettePulseOpacity(
        initialOpacity,
        DAMAGE_VIGNETTE_PULSE_DURATION_SECONDS * 0.5,
      ),
    ).toBeCloseTo(0.2, 12);
    expect(
      resolveDamageVignettePulseOpacity(initialOpacity, DAMAGE_VIGNETTE_PULSE_DURATION_SECONDS),
    ).toBe(0);
  });

  it("uses the same reticule-centred, aspect-aware pass controls as O₂", () => {
    const pass = createDamageVignettePass("shield", 25);
    const center = pass.uniforms.uVignetteCenter?.value;
    const resolution = pass.uniforms.uResolution?.value;
    const strength = pass.uniforms.uVignetteStrength?.value;
    const color = pass.uniforms.uVignetteColor?.value;

    expect(center).toBeInstanceOf(THREE.Vector2);
    expect(resolution).toBeInstanceOf(THREE.Vector2);
    expect(strength).toBeCloseTo(0.25, 12);
    expect(color).toBeInstanceOf(THREE.Color);

    setDamageVignettePassCenter(pass, 0.72, 0.38);
    setDamageVignettePassSize(pass, 1920, 1080);
    expect((center as THREE.Vector2).toArray()).toEqual([0.72, 0.38]);
    expect((resolution as THREE.Vector2).toArray()).toEqual([1920, 1080]);

    pass.dispose();
  });
});
