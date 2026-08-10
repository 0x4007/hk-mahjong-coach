import { describe, expect, it } from "vitest";
import {
  DEFAULT_FPS_ACCESSIBILITY_SETTINGS,
  controlCodeLabel,
  normalizeFpsAccessibilitySettings,
} from "./accessibility.js";

describe("FPS accessibility preferences", () => {
  it("falls back to safe defaults for malformed persisted data", () => {
    expect(normalizeFpsAccessibilitySettings({ controls: { forward: "KeyQ" } })).toEqual(
      DEFAULT_FPS_ACCESSIBILITY_SETTINGS,
    );
  });

  it("normalizes supported preferences and key bindings", () => {
    expect(
      normalizeFpsAccessibilitySettings({
        reducedMotion: true,
        highContrast: true,
        colorCues: "color-safe",
        uiScale: "130",
        subtitles: false,
        controls: {
          forward: "ArrowUp",
          backward: "ArrowDown",
          left: "ArrowLeft",
          right: "ArrowRight",
        },
      }),
    ).toMatchObject({
      reducedMotion: true,
      highContrast: true,
      colorCues: "color-safe",
      uiScale: "130",
      subtitles: false,
      controls: {
        forward: "ArrowUp",
        backward: "ArrowDown",
        left: "ArrowLeft",
        right: "ArrowRight",
      },
    });
  });

  it("uses readable labels for every supported movement key", () => {
    expect(controlCodeLabel("KeyW")).toBe("W");
    expect(controlCodeLabel("ArrowRight")).toBe("Arrow right");
  });
});
