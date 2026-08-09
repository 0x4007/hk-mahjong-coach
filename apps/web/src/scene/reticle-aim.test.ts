import { describe, expect, it } from "vitest";

import { resolveReticleAimNdc } from "./mahjong-table.js";

describe("live reticule aim projection", () => {
  it("maps the configured reticule position into camera NDC", () => {
    const ndc = resolveReticleAimNdc({ x: 0.5, y: 0.6 }, { x: 0, y: 0 }, 1000, 500);

    expect(ndc.x).toBeCloseTo(0, 8);
    expect(ndc.y).toBeCloseTo(-0.2, 8);
  });

  it("uses the same centre-dot CSS sway for the aim point", () => {
    const ndc = resolveReticleAimNdc({ x: 0.5, y: 0.6 }, { x: 10, y: 8 }, 1000, 500);

    expect(ndc.x).toBeCloseTo(0.02, 8);
    expect(ndc.y).toBeCloseTo(-0.232, 8);
  });

  it("remains finite when the layout has no measurable viewport", () => {
    const ndc = resolveReticleAimNdc({ x: 0.5, y: 0.6 }, { x: 10, y: 8 }, 0, 0);

    expect(ndc.x).toBeCloseTo(20, 8);
    expect(ndc.y).toBeCloseTo(-16.2, 8);
  });
});
