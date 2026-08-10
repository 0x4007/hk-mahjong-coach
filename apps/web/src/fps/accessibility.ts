export const FPS_ACCESSIBILITY_STORAGE_KEY = "hk-mahjong-coach:fps-accessibility:v1";

export const FPS_CONTROL_CODES = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
] as const;

export type FpsControlCode = (typeof FPS_CONTROL_CODES)[number];

export interface FpsControlBindings {
  readonly forward: FpsControlCode;
  readonly backward: FpsControlCode;
  readonly left: FpsControlCode;
  readonly right: FpsControlCode;
}

export interface FpsAccessibilitySettings {
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly colorCues: "standard" | "color-safe";
  readonly uiScale: "100" | "115" | "130";
  readonly subtitles: boolean;
  readonly controls: FpsControlBindings;
}

export const DEFAULT_FPS_CONTROL_BINDINGS: FpsControlBindings = {
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
};

export const DEFAULT_FPS_ACCESSIBILITY_SETTINGS: FpsAccessibilitySettings = {
  reducedMotion: false,
  highContrast: false,
  colorCues: "standard",
  uiScale: "100",
  subtitles: true,
  controls: DEFAULT_FPS_CONTROL_BINDINGS,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isControlCode = (value: unknown): value is FpsControlCode =>
  typeof value === "string" && (FPS_CONTROL_CODES as readonly string[]).includes(value);

const isUiScale = (value: unknown): value is FpsAccessibilitySettings["uiScale"] =>
  value === "100" || value === "115" || value === "130";

const controlValue = (
  source: Record<string, unknown> | undefined,
  key: keyof FpsControlBindings,
  fallback: FpsControlCode,
): FpsControlCode => (source !== undefined && isControlCode(source[key]) ? source[key] : fallback);

/** Parse persisted accessibility preferences without allowing malformed storage to affect play. */
export const normalizeFpsAccessibilitySettings = (value: unknown): FpsAccessibilitySettings => {
  if (!isRecord(value)) return DEFAULT_FPS_ACCESSIBILITY_SETTINGS;
  const controls = isRecord(value.controls) ? value.controls : undefined;
  return {
    reducedMotion:
      typeof value.reducedMotion === "boolean"
        ? value.reducedMotion
        : DEFAULT_FPS_ACCESSIBILITY_SETTINGS.reducedMotion,
    highContrast:
      typeof value.highContrast === "boolean"
        ? value.highContrast
        : DEFAULT_FPS_ACCESSIBILITY_SETTINGS.highContrast,
    colorCues: value.colorCues === "color-safe" ? "color-safe" : "standard",
    uiScale: isUiScale(value.uiScale) ? value.uiScale : DEFAULT_FPS_ACCESSIBILITY_SETTINGS.uiScale,
    subtitles:
      typeof value.subtitles === "boolean"
        ? value.subtitles
        : DEFAULT_FPS_ACCESSIBILITY_SETTINGS.subtitles,
    controls: {
      forward: controlValue(controls, "forward", DEFAULT_FPS_CONTROL_BINDINGS.forward),
      backward: controlValue(controls, "backward", DEFAULT_FPS_CONTROL_BINDINGS.backward),
      left: controlValue(controls, "left", DEFAULT_FPS_CONTROL_BINDINGS.left),
      right: controlValue(controls, "right", DEFAULT_FPS_CONTROL_BINDINGS.right),
    },
  };
};

export const loadFpsAccessibilitySettings = (): FpsAccessibilitySettings => {
  if (typeof window === "undefined") return DEFAULT_FPS_ACCESSIBILITY_SETTINGS;
  try {
    const stored = window.localStorage.getItem(FPS_ACCESSIBILITY_STORAGE_KEY);
    const parsed: unknown = stored === null ? null : (JSON.parse(stored) as unknown);
    const normalized = normalizeFpsAccessibilitySettings(parsed);
    if (stored === null && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { ...normalized, reducedMotion: true };
    }
    return normalized;
  } catch {
    return DEFAULT_FPS_ACCESSIBILITY_SETTINGS;
  }
};

export const controlCodeLabel = (code: FpsControlCode): string => {
  switch (code) {
    case "KeyW":
      return "W";
    case "KeyA":
      return "A";
    case "KeyS":
      return "S";
    case "KeyD":
      return "D";
    case "ArrowUp":
      return "Arrow up";
    case "ArrowLeft":
      return "Arrow left";
    case "ArrowDown":
      return "Arrow down";
    case "ArrowRight":
      return "Arrow right";
  }
};
