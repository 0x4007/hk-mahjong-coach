import { describe, expect, it } from "vitest";

import {
  createShieldFlareMaterial,
  resolveShieldFlareOpacity,
  resolveShieldFlareShieldRatio,
  SHIELD_FLARE_FRAGMENT_SHADER,
  SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS,
  updateShieldFlareMaterial,
} from "./shield-flare.js";

describe("simulant shield flare", () => {
  it("starts bright and reaches zero at the end of its pulse", () => {
    expect(resolveShieldFlareOpacity(SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS)).toBe(1);
    expect(resolveShieldFlareOpacity(SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS / 2)).toBeCloseTo(
      0.5,
      8,
    );
    expect(resolveShieldFlareOpacity(0)).toBe(0);
    expect(resolveShieldFlareOpacity(Number.NaN)).toBe(0);
  });

  it("normalizes the shield reserve for the shader", () => {
    expect(resolveShieldFlareShieldRatio(100, 100)).toBe(1);
    expect(resolveShieldFlareShieldRatio(50, 100)).toBe(0.5);
    expect(resolveShieldFlareShieldRatio(150, 100)).toBe(1);
    expect(resolveShieldFlareShieldRatio(-10, 100)).toBe(0);
    expect(resolveShieldFlareShieldRatio(Number.NaN, 100)).toBe(0);
  });

  it("contains the warm peak colour and a zero-opacity lower-edge mask", () => {
    expect(SHIELD_FLARE_FRAGMENT_SHADER).toContain("warmWhite");
    expect(SHIELD_FLARE_FRAGMENT_SHADER).toContain("bottomMask");
    expect(SHIELD_FLARE_FRAGMENT_SHADER).toContain("smoothstep(0.0, 0.24, heightRatio)");
    const material = createShieldFlareMaterial();
    updateShieldFlareMaterial(material, 100, 100, SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS, 2);
    expect(material.uniforms.uFlare?.value).toBe(1);
    expect(material.uniforms.uShieldRatio?.value).toBe(1);
    expect(material.uniforms.uTime?.value).toBe(2);
    material.dispose();
  });
});
