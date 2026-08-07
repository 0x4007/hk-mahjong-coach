import React from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { MahjongTableScene } from "./scene/MahjongTableScene.js";
import {
  readVisualDebugPanelExpanded,
  writeVisualDebugPanelExpanded,
} from "./visual-debug-panel-state.js";
import {
  DEBUG_BOKEH_STRENGTH_MAX,
  DEFAULT_ROOM_SEED,
  DEFAULT_RETICLE_POSITION,
  MAHJONG_TABLE_HMR_EVENT,
  normalizeVisualRoomSeed,
  readVisualDebugPreferences,
  RETICLE_DOT_MOTION_MULTIPLIER,
  RETICLE_RING_MOTION_MULTIPLIER,
} from "./scene/mahjong-table.js";
import {
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_O2,
  PLAYER_MAX_SHIELD,
  SHIELD_RECHARGE_DELAY_SECONDS,
  createPlayerVitals,
} from "./scene/player-vitals.js";
import { createEmptyWeaponStateSnapshot } from "./scene/weapons.js";
import type {
  MahjongTableMount,
  MotionLookStatus,
  PlayerVitalsState,
  SceneDebugSnapshot,
  SceneView,
  VisualCameraPreset,
  VisualGlassMode,
  VisualQualityMode,
  VisualSceneAreaId,
  VisualShadowQuality,
  VisualToneMapper,
  WeaponStateSnapshot,
} from "./scene/mahjong-table.js";
import {
  DEFAULT_ENABLED_VISUAL_SCENE_AREAS,
  VISUAL_SCENE_AREA_IDS,
} from "./scene/mahjong-table.js";

const DEBUG_PANEL_ENABLED =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("debug");
const VISUAL_QUALITY_MODE_STORAGE_KEY = "hk-mahjong-coach:visual-quality-mode:v1";

const debugCameraPresets: readonly {
  readonly value: VisualCameraPreset;
  readonly label: string;
}[] = [
  { value: "table", label: "Table" },
  { value: "roomReveal", label: "Room reveal" },
  { value: "assetReview", label: "Asset review" },
  { value: "focusCalibration", label: "Focus test zone" },
  { value: "climbingGym", label: "Climbing gym" },
  { value: "parametricBarracks", label: "Parametric barracks" },
  { value: "targetRange", label: "Target range" },
];

const debugSceneAreas: readonly {
  readonly id: VisualSceneAreaId;
  readonly label: string;
}[] = [
  { id: "focusCalibration", label: "Focus test zone" },
  { id: "penthouse", label: "Mahjong penthouse" },
  { id: "climbingGym", label: "Climbing gym" },
  { id: "parametricBarracks", label: "Parametric barracks" },
  { id: "targetRange", label: "Target range" },
];

const debugCameraPresetArea = (preset: VisualCameraPreset): VisualSceneAreaId => {
  if (preset === "focusCalibration") return "focusCalibration";
  if (preset === "climbingGym") return "climbingGym";
  if (preset === "parametricBarracks") return "parametricBarracks";
  if (preset === "targetRange") return "targetRange";
  return "penthouse";
};

const debugToneMappers: readonly { readonly value: VisualToneMapper; readonly label: string }[] = [
  { value: "agx", label: "AgX" },
  { value: "neutral", label: "Neutral" },
  { value: "cineon", label: "Cineon" },
  { value: "linear", label: "Linear" },
];

const debugShadowQualities: readonly {
  readonly value: VisualShadowQuality;
  readonly label: string;
}[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "off", label: "Off" },
];

const debugQualityModes: readonly { readonly value: VisualQualityMode; readonly label: string }[] =
  [
    { value: "adaptive", label: "Adaptive" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];
const RETICLE_POSITION = DEFAULT_RETICLE_POSITION;

const MOTION_LOOK_PREFERENCE_STORAGE_KEY = "hk-mahjong-coach:mobile-motion-look:v1";
const VISUAL_DEBUG_STATE_ENDPOINT = "/__codex/visual-debug-state";
const VISUAL_DEBUG_STATE_LOAD_TIMEOUT_MS = 5000;
const HMR_TEST_NOTE_EVENT = "codex:hmr-test-note";
const HMR_TEST_MESSAGE_STORAGE_KEY = "hk-mahjong-coach:hmr-test-message:v1";

interface PersistedVisualDebugScene {
  readonly roomSeed: string;
  readonly roomVariant: string;
  readonly explorationArea: string;
  readonly cameraPreset: VisualCameraPreset | null;
  readonly fov: number;
  readonly exposure: number;
  readonly toneMapper: VisualToneMapper;
  readonly fogDensity: number;
  readonly sunYaw: number;
  readonly sunElevation: number;
  readonly sunIntensity: number;
  readonly environmentIntensity: number;
  readonly environmentRotation: number;
  readonly redAccentIntensity: number;
  readonly cyanEmissiveIntensity: number;
  readonly shadowQuality: VisualShadowQuality;
  readonly quality: VisualQualityMode;
  readonly glassMode: VisualGlassMode;
  readonly ambientAnimationRate: number;
  readonly dprCap: number;
  readonly wireframe: boolean;
  readonly boundsVisible: boolean;
  readonly bokehEnabled: boolean;
  readonly bokehStrength: number;
  readonly ambientOcclusionEnabled: boolean;
  readonly autoExposureEnabled: boolean;
  readonly cameraShiftEnabled: boolean;
  readonly cameraBobEnabled: boolean;
  readonly enabledAreas?: Readonly<Record<VisualSceneAreaId, boolean>>;
}

interface PersistedVisualDebugState {
  readonly savedAt: string;
  readonly scene: PersistedVisualDebugScene;
}

interface HmrTestMessagePayload {
  readonly message: string | null;
}

const INITIAL_ROOM_QUERY_VALUE = new URLSearchParams(window.location.search).get("room");
const HAS_EXPLICIT_ROOM_QUERY = INITIAL_ROOM_QUERY_VALUE !== null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const isPersistedEnabledAreas = (
  value: unknown,
): value is Readonly<Record<VisualSceneAreaId, boolean>> =>
  isRecord(value) && VISUAL_SCENE_AREA_IDS.every((area) => isBoolean(value[area]));

const cloneEnabledAreas = (
  areas: Readonly<Record<VisualSceneAreaId, boolean>>,
): Record<VisualSceneAreaId, boolean> => ({
  focusCalibration: areas.focusCalibration,
  penthouse: areas.penthouse,
  climbingGym: areas.climbingGym,
  parametricBarracks: areas.parametricBarracks,
  targetRange: areas.targetRange,
});

const isVisualCameraPreset = (value: unknown): value is VisualCameraPreset =>
  value === "table" ||
  value === "roomReveal" ||
  value === "assetReview" ||
  value === "focusCalibration" ||
  value === "climbingGym" ||
  value === "parametricBarracks" ||
  value === "targetRange";

const isVisualToneMapper = (value: unknown): value is VisualToneMapper =>
  value === "agx" || value === "neutral" || value === "cineon" || value === "linear";

const isVisualShadowQuality = (value: unknown): value is VisualShadowQuality =>
  value === "off" || value === "medium" || value === "high";

const isVisualGlassMode = (value: unknown): value is VisualGlassMode =>
  value === "simple" || value === "physical";

const isVisualQualityMode = (value: unknown): value is VisualQualityMode =>
  value === "adaptive" || value === "high" || value === "medium" || value === "low";

const getStoredVisualQualityMode = (): VisualQualityMode | null => {
  try {
    const stored = window.localStorage.getItem(VISUAL_QUALITY_MODE_STORAGE_KEY);
    return stored === null ? null : isVisualQualityMode(stored) ? stored : null;
  } catch {
    return null;
  }
};

const getInitialVisualQualityMode = (): VisualQualityMode => {
  const stored = getStoredVisualQualityMode();
  return stored === null ? "adaptive" : stored;
};

const writeVisualQualityMode = (mode: VisualQualityMode): void => {
  try {
    window.localStorage.setItem(VISUAL_QUALITY_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore unavailable or blocked storage.
  }
};

const isPersistedVisualDebugScene = (value: unknown): value is PersistedVisualDebugScene => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.cameraPreset === null || isVisualCameraPreset(value.cameraPreset)) &&
    typeof value.roomSeed === "string" &&
    typeof value.roomVariant === "string" &&
    typeof value.explorationArea === "string" &&
    isFiniteNumber(value.fov) &&
    value.fov >= 30 &&
    value.fov <= 100 &&
    isFiniteNumber(value.exposure) &&
    isVisualToneMapper(value.toneMapper) &&
    isFiniteNumber(value.fogDensity) &&
    value.fogDensity >= 0 &&
    value.fogDensity <= 0.04 &&
    isFiniteNumber(value.sunYaw) &&
    value.sunYaw >= -Math.PI &&
    value.sunYaw <= Math.PI &&
    isFiniteNumber(value.sunElevation) &&
    value.sunElevation >= 0.25 &&
    value.sunElevation <= 1.45 &&
    isFiniteNumber(value.sunIntensity) &&
    value.sunIntensity >= 0 &&
    value.sunIntensity <= 6 &&
    isFiniteNumber(value.environmentIntensity) &&
    value.environmentIntensity >= 0 &&
    value.environmentIntensity <= 2.5 &&
    isFiniteNumber(value.environmentRotation) &&
    value.environmentRotation >= -Math.PI &&
    value.environmentRotation <= Math.PI &&
    isFiniteNumber(value.redAccentIntensity) &&
    value.redAccentIntensity >= 0 &&
    value.redAccentIntensity <= 2.5 &&
    isFiniteNumber(value.cyanEmissiveIntensity) &&
    value.cyanEmissiveIntensity >= 0 &&
    value.cyanEmissiveIntensity <= 2.5 &&
    isVisualShadowQuality(value.shadowQuality) &&
    isVisualQualityMode(value.quality) &&
    isVisualGlassMode(value.glassMode) &&
    isFiniteNumber(value.ambientAnimationRate) &&
    value.ambientAnimationRate >= 0 &&
    value.ambientAnimationRate <= 2 &&
    isFiniteNumber(value.dprCap) &&
    value.dprCap >= 1 &&
    value.dprCap <= 2 &&
    isBoolean(value.wireframe) &&
    isBoolean(value.boundsVisible) &&
    isBoolean(value.bokehEnabled) &&
    isFiniteNumber(value.bokehStrength) &&
    value.bokehStrength >= 0 &&
    isBoolean(value.ambientOcclusionEnabled) &&
    isBoolean(value.autoExposureEnabled) &&
    isBoolean(value.cameraShiftEnabled) &&
    isBoolean(value.cameraBobEnabled) &&
    (value.enabledAreas === undefined || isPersistedEnabledAreas(value.enabledAreas))
  );
};

const isPersistedVisualDebugState = (value: unknown): value is PersistedVisualDebugState => {
  if (!isRecord(value) || typeof value.savedAt !== "string") {
    return false;
  }
  return isPersistedVisualDebugScene((value as { scene?: unknown }).scene);
};

const loadPersistedVisualDebugState = async (): Promise<PersistedVisualDebugScene | null> => {
  if (!import.meta.env.DEV) {
    return null;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), VISUAL_DEBUG_STATE_LOAD_TIMEOUT_MS);
  try {
    const response = await fetch(`${VISUAL_DEBUG_STATE_ENDPOINT}?r=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const payload: unknown = await response.json();
    if (!isPersistedVisualDebugState(payload)) {
      return null;
    }
    return payload.scene;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};

const isHmrTestMessagePayload = (value: unknown): value is HmrTestMessagePayload => {
  if (!isRecord(value)) {
    return false;
  }
  return value.message === null || typeof value.message === "string";
};

const readStoredHmrTestMessage = (): string | null => {
  if (!import.meta.env.DEV) {
    return null;
  }
  try {
    const message = window.sessionStorage.getItem(HMR_TEST_MESSAGE_STORAGE_KEY);
    return message === null || message.length === 0 ? null : message;
  } catch {
    return null;
  }
};

const storeHmrTestMessage = (message: string | null): void => {
  if (!import.meta.env.DEV) {
    return;
  }
  try {
    if (message === null || message.length === 0) {
      window.sessionStorage.removeItem(HMR_TEST_MESSAGE_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(HMR_TEST_MESSAGE_STORAGE_KEY, message);
  } catch {
    // Session storage is best-effort for this development-only hint.
  }
};

const buildPersistedVisualDebugScene = (
  snapshot: SceneDebugSnapshot,
): PersistedVisualDebugScene => ({
  roomSeed: snapshot.roomSeed,
  roomVariant: snapshot.roomVariant,
  explorationArea: snapshot.explorationArea,
  cameraPreset: snapshot.cameraPreset,
  fov: snapshot.fov,
  exposure: snapshot.exposure,
  toneMapper: snapshot.toneMapper,
  fogDensity: snapshot.fogDensity,
  sunYaw: snapshot.sunYaw,
  sunElevation: snapshot.sunElevation,
  sunIntensity: snapshot.sunIntensity,
  environmentIntensity: snapshot.environmentIntensity,
  environmentRotation: snapshot.environmentRotation,
  redAccentIntensity: snapshot.redAccentIntensity,
  cyanEmissiveIntensity: snapshot.cyanEmissiveIntensity,
  shadowQuality: snapshot.shadowQuality,
  quality: snapshot.quality,
  glassMode: snapshot.glassMode,
  ambientAnimationRate: snapshot.ambientAnimationRate,
  dprCap: snapshot.dprCap,
  wireframe: snapshot.wireframe,
  boundsVisible: snapshot.boundsVisible,
  bokehEnabled: snapshot.bokehEnabled,
  bokehStrength: snapshot.bokehStrength,
  ambientOcclusionEnabled: snapshot.ambientOcclusionEnabled,
  autoExposureEnabled: snapshot.autoExposureEnabled,
  cameraShiftEnabled: snapshot.cameraShiftEnabled,
  cameraBobEnabled: snapshot.cameraBobEnabled,
  enabledAreas: cloneEnabledAreas(snapshot.enabledAreas),
});

const readMotionLookPreference = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(MOTION_LOOK_PREFERENCE_STORAGE_KEY) === "enabled";
  } catch {
    return false;
  }
};

const writeMotionLookPreference = (enabled: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.sessionStorage.setItem(MOTION_LOOK_PREFERENCE_STORAGE_KEY, "enabled");
    } else {
      window.sessionStorage.removeItem(MOTION_LOOK_PREFERENCE_STORAGE_KEY);
    }
  } catch {
    // Session storage is intentionally best-effort here.
  }
};

const getVisualDebugPanelStateStorage = (): Storage | null => {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readInitialEnabledAreas = (): Record<VisualSceneAreaId, boolean> => {
  const persisted = readVisualDebugPreferences(getVisualDebugPanelStateStorage());
  return persisted?.enabledAreas === undefined
    ? cloneEnabledAreas(DEFAULT_ENABLED_VISUAL_SCENE_AREAS)
    : cloneEnabledAreas(persisted.enabledAreas);
};

interface VisualDebugPanelProps {
  readonly mount: MahjongTableMount;
  readonly isMobile: boolean;
  readonly onNextRoom: () => void;
  readonly onRoomSeedSubmit: (seed: string) => void;
}

const formatMetric = (value: number, digits = 0): string => value.toFixed(digits);

const VisualDebugPanel = ({
  mount,
  isMobile,
  onNextRoom,
  onRoomSeedSubmit,
}: VisualDebugPanelProps): React.JSX.Element => {
  const [snapshot, setSnapshot] = React.useState<SceneDebugSnapshot>(() =>
    mount.debug.getSnapshot(),
  );
  const debugStateLastPayloadRef = React.useRef<string | null>(null);
  const debugStatePendingRef = React.useRef<{
    readonly scene: PersistedVisualDebugScene;
    readonly scenePayload: string;
  } | null>(null);
  const debugStatePersistTimerRef = React.useRef<number | null>(null);
  const queuePersistPendingDebugStateRef = React.useRef<(() => void) | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(() =>
    readVisualDebugPanelExpanded(getVisualDebugPanelStateStorage(), !isMobile),
  );
  const [roomSeedDraft, setRoomSeedDraft] = React.useState(
    () => mount.debug.getSnapshot().roomSeed,
  );
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setSnapshot(mount.debug.getSnapshot());
    }, 500);
    return () => window.clearInterval(interval);
  }, [mount]);
  React.useEffect(() => {
    // The snapshot also contains live presentation telemetry (autofocus,
    // exposure, movement area, and camera easing). Establish the current scene
    // payload as the baseline, but do not write it just because the panel is
    // sampling that telemetry.
    debugStateLastPayloadRef.current = JSON.stringify(
      buildPersistedVisualDebugScene(mount.debug.getSnapshot()),
    );
    debugStatePendingRef.current = null;
    const persistPendingDebugState = (): void => {
      const pending = debugStatePendingRef.current;
      if (pending === null) {
        return;
      }
      debugStatePendingRef.current = null;
      debugStateLastPayloadRef.current = pending.scenePayload;
      const payload: PersistedVisualDebugState = {
        savedAt: new Date().toISOString(),
        scene: pending.scene,
      };
      const serializedPayload = JSON.stringify(payload);
      try {
        if (
          typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon(
            VISUAL_DEBUG_STATE_ENDPOINT,
            new Blob([serializedPayload], { type: "application/json" }),
          )
        ) {
          return;
        }
      } catch {
        // Fall through to a keepalive fetch when Beacon is unavailable.
      }
      void fetch(VISUAL_DEBUG_STATE_ENDPOINT, {
        body: serializedPayload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      }).catch(() => {
        // Best-effort persistence. The debug panel remains usable if the local
        // development write endpoint is unavailable during pagehide.
      });
    };
    const queuePersistPendingDebugState = (): void => {
      if (debugStatePersistTimerRef.current !== null) {
        window.clearTimeout(debugStatePersistTimerRef.current);
      }
      debugStatePersistTimerRef.current = window.setTimeout(() => {
        debugStatePersistTimerRef.current = null;
        persistPendingDebugState();
      }, 250);
    };
    const flushPendingDebugState = (): void => {
      if (debugStatePersistTimerRef.current !== null) {
        window.clearTimeout(debugStatePersistTimerRef.current);
        debugStatePersistTimerRef.current = null;
      }
      persistPendingDebugState();
    };
    queuePersistPendingDebugStateRef.current = queuePersistPendingDebugState;
    window.addEventListener("pagehide", flushPendingDebugState);
    document.addEventListener("visibilitychange", flushPendingDebugState);
    return () => {
      window.removeEventListener("pagehide", flushPendingDebugState);
      document.removeEventListener("visibilitychange", flushPendingDebugState);
      flushPendingDebugState();
      if (debugStatePersistTimerRef.current !== null) {
        window.clearTimeout(debugStatePersistTimerRef.current);
        debugStatePersistTimerRef.current = null;
      }
      queuePersistPendingDebugStateRef.current = null;
      debugStatePendingRef.current = null;
    };
  }, [mount]);
  React.useEffect(() => {
    const nextSnapshot = mount.debug.getSnapshot();
    setSnapshot(nextSnapshot);
    setRoomSeedDraft(nextSnapshot.roomSeed);
  }, [mount]);
  const markDebugStateDirty = (): void => {
    // Only explicit controls call this function. The 500 ms snapshot refresh
    // above is telemetry for the panel and must never be a persistence trigger.
    const scene = buildPersistedVisualDebugScene(mount.debug.getSnapshot());
    const scenePayload = JSON.stringify(scene);
    if (scenePayload === debugStateLastPayloadRef.current) {
      debugStatePendingRef.current = null;
      return;
    }
    debugStatePendingRef.current = { scene, scenePayload };
    queuePersistPendingDebugStateRef.current?.();
  };
  const refresh = (): void => setSnapshot(mount.debug.getSnapshot());
  const applyDebugChange = (change: () => void): void => {
    change();
    refresh();
    markDebugStateDirty();
  };
  const submitRoomSeed = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalizedSeed = normalizeVisualRoomSeed(roomSeedDraft);
    setRoomSeedDraft(normalizedSeed);
    onRoomSeedSubmit(normalizedSeed);
  };
  const setQualityMode = (mode: VisualQualityMode): void => {
    applyDebugChange(() => mount.debug.setQualityMode(mode));
  };
  const setCameraPreset = (preset: VisualCameraPreset): void => {
    applyDebugChange(() => mount.debug.setCameraPreset(preset));
  };
  const setFov = (fov: number): void => {
    applyDebugChange(() => mount.debug.setFov(fov));
  };
  const setExposure = (exposure: number): void => {
    applyDebugChange(() => mount.debug.setExposure(exposure));
  };
  const setToneMapper = (toneMapper: VisualToneMapper): void => {
    applyDebugChange(() => mount.debug.setToneMapper(toneMapper));
  };
  const setFogDensity = (density: number): void => {
    applyDebugChange(() => mount.debug.setFogDensity(density));
  };
  const setSunDirection = (yaw: number, elevation: number): void => {
    applyDebugChange(() => mount.debug.setSunDirection(yaw, elevation));
  };
  const setSunIntensity = (intensity: number): void => {
    applyDebugChange(() => mount.debug.setSunIntensity(intensity));
  };
  const setEnvironmentIntensity = (intensity: number): void => {
    applyDebugChange(() => mount.debug.setEnvironmentIntensity(intensity));
  };
  const setEnvironmentRotation = (rotation: number): void => {
    applyDebugChange(() => mount.debug.setEnvironmentRotation(rotation));
  };
  const setRedAccentIntensity = (intensity: number): void => {
    applyDebugChange(() => mount.debug.setRedAccentIntensity(intensity));
  };
  const setCyanEmissiveIntensity = (intensity: number): void => {
    applyDebugChange(() => mount.debug.setCyanEmissiveIntensity(intensity));
  };
  const setShadowQuality = (quality: VisualShadowQuality): void => {
    applyDebugChange(() => mount.debug.setShadowQuality(quality));
  };
  const setDprCap = (dprCap: number): void => {
    applyDebugChange(() => mount.debug.setDprCap(dprCap));
  };
  const setBokehEnabled = (enabled: boolean): void => {
    applyDebugChange(() => mount.debug.setBokehEnabled(enabled));
  };
  const setBokehIntensity = (intensity: number): void => {
    applyDebugChange(() => mount.debug.setBokehIntensity(intensity));
  };
  const setAmbientOcclusionEnabled = (enabled: boolean): void => {
    applyDebugChange(() => mount.debug.setAmbientOcclusionEnabled(enabled));
  };
  const setAutoExposureEnabled = (enabled: boolean): void => {
    applyDebugChange(() => mount.debug.setAutoExposureEnabled(enabled));
  };
  const setAmbientAnimationRate = (rate: number): void => {
    applyDebugChange(() => mount.debug.setAmbientAnimationRate(rate));
  };
  const setGlassMode = (mode: VisualGlassMode): void => {
    applyDebugChange(() => mount.debug.setGlassMode(mode));
  };
  const setCameraShiftEnabled = (enabled: boolean): void => {
    applyDebugChange(() => mount.debug.setCameraShiftEnabled(enabled));
  };
  const setCameraBobEnabled = (enabled: boolean): void => {
    applyDebugChange(() => mount.debug.setCameraBobEnabled(enabled));
  };
  const setWireframe = (enabled: boolean): void => {
    applyDebugChange(() => mount.debug.setWireframe(enabled));
  };
  const setBoundsVisible = (visible: boolean): void => {
    applyDebugChange(() => mount.debug.setBoundsVisible(visible));
  };
  const resetDefaults = (): void => {
    applyDebugChange(() => mount.debug.resetDefaults());
  };
  const setPanelExpanded = (expanded: boolean): void => {
    setIsExpanded(expanded);
    writeVisualDebugPanelExpanded(getVisualDebugPanelStateStorage(), expanded);
  };
  const openFocusCalibration = (): void => {
    if (!snapshot.enabledAreas.focusCalibration) {
      return;
    }
    setCameraPreset("focusCalibration");
    mount.debug.teleportToFocusLab();
    setPanelExpanded(true);
  };
  const openClimbingGym = (): void => {
    if (!snapshot.enabledAreas.climbingGym) {
      return;
    }
    setCameraPreset("climbingGym");
    setPanelExpanded(true);
  };
  const openParametricBarracks = (): void => {
    if (!snapshot.enabledAreas.parametricBarracks) {
      return;
    }
    setCameraPreset("parametricBarracks");
    setPanelExpanded(true);
  };
  const openTargetRange = (): void => {
    if (!snapshot.enabledAreas.targetRange) {
      return;
    }
    setCameraPreset("targetRange");
    setPanelExpanded(true);
  };
  const radiansToDegrees = (radians: number): number => (radians * 180) / Math.PI;
  return (
    <aside className="scene-debug-panel" aria-label="Visual development controls">
      <div className="scene-debug-header">
        <button
          aria-controls="scene-debug-controls"
          aria-expanded={isExpanded}
          aria-label={
            isExpanded ? "Collapse visual debug controls" : "Expand visual debug controls"
          }
          className="scene-debug-heading scene-debug-toggle"
          onClick={() => setPanelExpanded(!isExpanded)}
          type="button"
        >
          <strong>Visual debug</strong>
          <span className="scene-debug-status">
            {snapshot.qualityMode} · {snapshot.quality} · {formatMetric(snapshot.fps)} FPS
          </span>
          <span aria-hidden="true" className="scene-debug-chevron">
            ⌄
          </span>
        </button>
      </div>
      <div hidden={!isExpanded} id="scene-debug-controls">
        <button
          className="scene-debug-focus-quick-action"
          disabled={!snapshot.enabledAreas.focusCalibration}
          onClick={openFocusCalibration}
          type="button"
        >
          Open focus test zone
        </button>
        <button
          className="scene-debug-focus-quick-action"
          disabled={!snapshot.enabledAreas.climbingGym}
          onClick={openClimbingGym}
          type="button"
        >
          Open climbing gym
        </button>
        <button
          className="scene-debug-focus-quick-action"
          disabled={!snapshot.enabledAreas.parametricBarracks}
          onClick={openParametricBarracks}
          type="button"
        >
          Open parametric barracks
        </button>
        <button
          className="scene-debug-focus-quick-action"
          disabled={!snapshot.enabledAreas.targetRange}
          onClick={openTargetRange}
          type="button"
        >
          Open target range
        </button>
        <fieldset className="scene-debug-area-toggles">
          <legend>Loaded areas</legend>
          <small>
            Turn off unused spaces to unload their meshes and physics. The selection is saved in
            debug settings and restored after reload.
          </small>
          {debugSceneAreas.map((area) => {
            const enabled = snapshot.enabledAreas[area.id];
            return (
              <label className="scene-debug-check" key={area.id}>
                <input
                  checked={enabled}
                  onChange={(event) =>
                    applyDebugChange(() =>
                      mount.debug.setAreaEnabled(area.id, event.currentTarget.checked),
                    )
                  }
                  type="checkbox"
                />
                {area.label} <span>{enabled ? "loaded" : "unloaded"}</span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="scene-debug-room">
          <legend>Generated room</legend>
          <div className="scene-debug-room-meta">
            <strong>{snapshot.roomVariant}</strong>
            <span>{snapshot.roomSeed}</span>
            <span>
              {snapshot.explorationArea} · {snapshot.loadedExplorationChunks} loaded chunks
            </span>
          </div>
          <form className="scene-debug-seed-form" onSubmit={submitRoomSeed}>
            <label htmlFor="room-seed">Seed</label>
            <input
              id="room-seed"
              maxLength={48}
              onChange={(event) => setRoomSeedDraft(event.currentTarget.value)}
              type="text"
              value={roomSeedDraft}
            />
            <button type="submit">Load seed</button>
          </form>
          <button onClick={onNextRoom} type="button">
            Generate next room
          </button>
          <button onClick={resetDefaults} type="button">
            Reset debug defaults
          </button>
        </fieldset>
        <fieldset className="scene-debug-vitals">
          <legend>Player vitals</legend>
          <button onClick={() => mount.applyDamage(25)} type="button">
            Simulate 25 damage
          </button>
          <button onClick={() => mount.resetVitals()} type="button">
            Reset vitals
          </button>
          <small>High-speed wall impacts and hard landings also deal damage.</small>
        </fieldset>
        <label>
          Quality mode
          <select
            value={snapshot.qualityMode}
            onChange={(event) => setQualityMode(event.currentTarget.value as VisualQualityMode)}
          >
            {debugQualityModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Post effects</legend>
          <label className="scene-debug-check">
            <input
              checked={snapshot.bokehEnabled}
              onChange={(event) => setBokehEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            Bokeh / table blur
          </label>
          <label>
            DoF intensity <output>{formatMetric(snapshot.bokehStrength, 2)}×</output>
            <input
              max={DEBUG_BOKEH_STRENGTH_MAX}
              min="0"
              onChange={(event) => setBokehIntensity(Number(event.currentTarget.value))}
              step="0.05"
              type="range"
              value={snapshot.bokehStrength}
            />
          </label>
          <label className="scene-debug-check">
            <input
              checked={snapshot.ambientOcclusionEnabled}
              onChange={(event) => setAmbientOcclusionEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            GTAO ambient occlusion
          </label>
          <label className="scene-debug-check">
            <input
              checked={snapshot.autoExposureEnabled}
              onChange={(event) => setAutoExposureEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            Adaptive iris exposure
          </label>
          <label>
            Glass
            <select
              value={snapshot.glassMode}
              onChange={(event) => setGlassMode(event.currentTarget.value as VisualGlassMode)}
            >
              <option value="physical">Physical transmission</option>
              <option value="simple">Simple transparent</option>
            </select>
          </label>
          <label>
            Ambient animation <output>{formatMetric(snapshot.ambientAnimationRate, 2)}</output>
            <input
              max="2"
              min="0"
              onChange={(event) => setAmbientAnimationRate(Number(event.currentTarget.value))}
              step="0.05"
              type="range"
              value={snapshot.ambientAnimationRate}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Motion feel</legend>
          <label className="scene-debug-check">
            <input
              checked={snapshot.cameraShiftEnabled}
              onChange={(event) => setCameraShiftEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            Weight shift
          </label>
          <label className="scene-debug-check">
            <input
              checked={snapshot.cameraBobEnabled}
              onChange={(event) => setCameraBobEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            Head bob
          </label>
        </fieldset>
        <label>
          Camera preset
          <select
            value={snapshot.cameraPreset ?? "table"}
            onChange={(event) => setCameraPreset(event.currentTarget.value as VisualCameraPreset)}
          >
            {debugCameraPresets.map((preset) => (
              <option
                disabled={!snapshot.enabledAreas[debugCameraPresetArea(preset.value)]}
                key={preset.value}
                value={preset.value}
              >
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          FOV <output>{formatMetric(snapshot.fov, 1)}°</output>
          <input
            max="100"
            min="30"
            onChange={(event) => setFov(Number(event.currentTarget.value))}
            step="1"
            type="range"
            value={snapshot.fov}
          />
        </label>
        <label>
          Exposure <output>{formatMetric(snapshot.exposure, 2)}</output>
          <input
            max="2.2"
            min="0.5"
            onChange={(event) => setExposure(Number(event.currentTarget.value))}
            step="0.01"
            type="range"
            value={snapshot.exposure}
          />
        </label>
        <label>
          Tone mapper
          <select
            value={snapshot.toneMapper}
            onChange={(event) => setToneMapper(event.currentTarget.value as VisualToneMapper)}
          >
            {debugToneMappers.map((toneMapper) => (
              <option key={toneMapper.value} value={toneMapper.value}>
                {toneMapper.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fog density <output>{snapshot.fogDensity.toFixed(3)}</output>
          <input
            max="0.04"
            min="0"
            onChange={(event) => setFogDensity(Number(event.currentTarget.value))}
            step="0.001"
            type="range"
            value={snapshot.fogDensity}
          />
        </label>
        <fieldset>
          <legend>Sun rig</legend>
          <label>
            Yaw <output>{formatMetric(radiansToDegrees(snapshot.sunYaw))}°</output>
            <input
              max={Math.PI}
              min={-Math.PI}
              onChange={(event) =>
                setSunDirection(Number(event.currentTarget.value), snapshot.sunElevation)
              }
              step="0.02"
              type="range"
              value={snapshot.sunYaw}
            />
          </label>
          <label>
            Elevation <output>{formatMetric(radiansToDegrees(snapshot.sunElevation))}°</output>
            <input
              max="1.45"
              min="0.25"
              onChange={(event) =>
                setSunDirection(snapshot.sunYaw, Number(event.currentTarget.value))
              }
              step="0.01"
              type="range"
              value={snapshot.sunElevation}
            />
          </label>
          <label>
            Intensity <output>{formatMetric(snapshot.sunIntensity, 2)}</output>
            <input
              max="6"
              min="0"
              onChange={(event) => setSunIntensity(Number(event.currentTarget.value))}
              step="0.05"
              type="range"
              value={snapshot.sunIntensity}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Environment</legend>
          <label>
            Intensity <output>{formatMetric(snapshot.environmentIntensity, 2)}</output>
            <input
              max="2.5"
              min="0"
              onChange={(event) => setEnvironmentIntensity(Number(event.currentTarget.value))}
              step="0.05"
              type="range"
              value={snapshot.environmentIntensity}
            />
          </label>
          <label>
            Rotation{" "}
            <output>{formatMetric(radiansToDegrees(snapshot.environmentRotation))}°</output>
            <input
              max={Math.PI}
              min={-Math.PI}
              onChange={(event) => setEnvironmentRotation(Number(event.currentTarget.value))}
              step="0.02"
              type="range"
              value={snapshot.environmentRotation}
            />
          </label>
        </fieldset>
        <label>
          Red accent <output>{formatMetric(snapshot.redAccentIntensity, 2)}</output>
          <input
            max="2.5"
            min="0"
            onChange={(event) => setRedAccentIntensity(Number(event.currentTarget.value))}
            step="0.05"
            type="range"
            value={snapshot.redAccentIntensity}
          />
        </label>
        <label>
          Cyan emissive <output>{formatMetric(snapshot.cyanEmissiveIntensity, 2)}</output>
          <input
            max="2.5"
            min="0"
            onChange={(event) => setCyanEmissiveIntensity(Number(event.currentTarget.value))}
            step="0.05"
            type="range"
            value={snapshot.cyanEmissiveIntensity}
          />
        </label>
        <label>
          Shadow quality
          <select
            value={snapshot.shadowQuality}
            onChange={(event) => setShadowQuality(event.currentTarget.value as VisualShadowQuality)}
          >
            {debugShadowQualities.map((quality) => (
              <option key={quality.value} value={quality.value}>
                {quality.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          DPR cap <output>{formatMetric(snapshot.dprCap, 2)}</output>
          <input
            max="2"
            min="1"
            onChange={(event) => setDprCap(Number(event.currentTarget.value))}
            step="0.05"
            type="range"
            value={snapshot.dprCap}
          />
        </label>
        <div className="scene-debug-checks">
          <label className="scene-debug-check">
            <input
              checked={snapshot.wireframe}
              onChange={(event) => setWireframe(event.currentTarget.checked)}
              type="checkbox"
            />
            Wireframe
          </label>
          <label className="scene-debug-check">
            <input
              checked={snapshot.boundsVisible}
              onChange={(event) => setBoundsVisible(event.currentTarget.checked)}
              type="checkbox"
            />
            Bounds
          </label>
        </div>
        <dl className="scene-debug-metrics">
          <div>
            <dt>Draw calls</dt>
            <dd>{formatMetric(snapshot.drawCalls)}</dd>
          </div>
          <div>
            <dt>Triangles</dt>
            <dd>{formatMetric(snapshot.triangles)}</dd>
          </div>
          <div>
            <dt>Frame</dt>
            <dd>{formatMetric(snapshot.frameTimeMs, 1)} ms</dd>
          </div>
          <div>
            <dt>Focus</dt>
            <dd>
              {formatMetric(snapshot.focusDistance, 1)} m · {snapshot.focusTarget}
            </dd>
          </div>
          <div>
            <dt>Pupil</dt>
            <dd>
              {formatMetric(snapshot.pupilDiameterMm, 1)} mm ·{" "}
              {formatMetric(snapshot.bokehIntensity, 2)} blur
            </dd>
          </div>
          <div>
            <dt>DPR</dt>
            <dd>{formatMetric(snapshot.dpr, 2)}</dd>
          </div>
          <div>
            <dt>Memory</dt>
            <dd>
              {snapshot.geometries}g · {snapshot.textures}t
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
};

const isMobileDevice = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches ||
  navigator.maxTouchPoints > 0 ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const JOYSTICK_DEAD_ZONE = 0.08;

const getInitialRoomSeed = (): string =>
  normalizeVisualRoomSeed(INITIAL_ROOM_QUERY_VALUE ?? DEFAULT_ROOM_SEED);

const App = (): React.JSX.Element => {
  const [view, setView] = React.useState<SceneView>("seat");
  const [roomSeed, setRoomSeed] = React.useState(getInitialRoomSeed);
  const [enabledAreas, setEnabledAreas] =
    React.useState<Readonly<Record<VisualSceneAreaId, boolean>>>(readInitialEnabledAreas);
  const [roomVariant, setRoomVariant] = React.useState("Northlight");
  const [explorationArea, setExplorationArea] = React.useState("Penthouse");
  const [hmrSceneEpoch, setHmrSceneEpoch] = React.useState(0);
  const [hmrTestMessage, setHmrTestMessage] = React.useState(readStoredHmrTestMessage);
  const [isMobile, setIsMobile] = React.useState(isMobileDevice);
  const [visualQualityMode, setVisualQualityMode] = React.useState<VisualQualityMode>(
    getInitialVisualQualityMode,
  );
  const [motionStatus, setMotionStatus] = React.useState<MotionLookStatus>(() =>
    isMobile ? "needs-permission" : "unsupported",
  );
  const [isMotionLookEnabled, setIsMotionLookEnabled] = React.useState<boolean>(() =>
    isMobile ? readMotionLookPreference() : false,
  );
  const hasAttemptedMotionReenable = React.useRef(false);
  const [isCrouched, setIsCrouched] = React.useState(false);
  const [isSprinting, setIsSprinting] = React.useState(false);
  const [playerSpeed, setPlayerSpeed] = React.useState(0);
  const [isCapsLockOn, setIsCapsLockOn] = React.useState(false);
  const [playerVitals, setPlayerVitals] = React.useState<PlayerVitalsState>(() =>
    createPlayerVitals(),
  );
  const [weaponState, setWeaponState] = React.useState<WeaponStateSnapshot>(() =>
    createEmptyWeaponStateSnapshot(),
  );
  const mountRef = React.useRef<MahjongTableMount | null>(null);
  const [debugMount, setDebugMount] = React.useState<MahjongTableMount | null>(null);
  const joystickKnobRef = React.useRef<HTMLSpanElement>(null);
  const reticleRef = React.useRef<HTMLDivElement>(null);
  const lastTouchActionAtRef = React.useRef(0);
  const roomSequenceRef = React.useRef(1);
  const hasUserRoomOverrideRef = React.useRef(false);
  const persistedVisualDebugStateRef = React.useRef<PersistedVisualDebugScene | null>(null);
  const hasAppliedPersistedVisualStateRef = React.useRef(false);
  const reticleBobbingFrame = React.useRef(0);
  const [persistedVisualStateReady, setPersistedVisualStateReady] = React.useState(
    !import.meta.env.DEV || DEBUG_PANEL_ENABLED,
  );
  const enabledAreaIds = React.useMemo(
    () => VISUAL_SCENE_AREA_IDS.filter((area) => enabledAreas[area]),
    [enabledAreas],
  );
  const enabledAreaKey = VISUAL_SCENE_AREA_IDS.map((area) => (enabledAreas[area] ? "1" : "0")).join(
    "",
  );

  React.useEffect(() => {
    const updateDeviceClass = (): void => setIsMobile(isMobileDevice());
    updateDeviceClass();
    window.addEventListener("resize", updateDeviceClass);
    window.addEventListener("orientationchange", updateDeviceClass);
    return () => {
      window.removeEventListener("resize", updateDeviceClass);
      window.removeEventListener("orientationchange", updateDeviceClass);
    };
  }, []);

  React.useEffect(() => {
    const updateCapsLockState = (event: KeyboardEvent): void => {
      setIsCapsLockOn(event.getModifierState("CapsLock"));
    };
    window.addEventListener("keydown", updateCapsLockState);
    window.addEventListener("keyup", updateCapsLockState);
    return () => {
      window.removeEventListener("keydown", updateCapsLockState);
      window.removeEventListener("keyup", updateCapsLockState);
    };
  }, []);

  const applyPersistedVisualDebugState = React.useCallback((mount: MahjongTableMount): void => {
    const persisted = persistedVisualDebugStateRef.current;
    if (persisted === null || hasAppliedPersistedVisualStateRef.current) {
      return;
    }
    try {
      mount.debug.setQualityMode(persisted.quality);
      if (persisted.cameraPreset !== null) {
        mount.debug.setCameraPreset(persisted.cameraPreset);
      }
      mount.debug.setFov(persisted.fov);
      mount.debug.setExposure(persisted.exposure);
      mount.debug.setToneMapper(persisted.toneMapper);
      mount.debug.setFogDensity(persisted.fogDensity);
      mount.debug.setSunDirection(persisted.sunYaw, persisted.sunElevation);
      mount.debug.setSunIntensity(persisted.sunIntensity);
      mount.debug.setEnvironmentIntensity(persisted.environmentIntensity);
      mount.debug.setEnvironmentRotation(persisted.environmentRotation);
      mount.debug.setRedAccentIntensity(persisted.redAccentIntensity);
      mount.debug.setCyanEmissiveIntensity(persisted.cyanEmissiveIntensity);
      mount.debug.setShadowQuality(persisted.shadowQuality);
      mount.debug.setDprCap(persisted.dprCap);
      mount.debug.setBokehEnabled(persisted.bokehEnabled);
      mount.debug.setBokehIntensity(persisted.bokehStrength);
      mount.debug.setAmbientOcclusionEnabled(persisted.ambientOcclusionEnabled);
      mount.debug.setAutoExposureEnabled(persisted.autoExposureEnabled);
      mount.debug.setAmbientAnimationRate(persisted.ambientAnimationRate);
      mount.debug.setGlassMode(persisted.glassMode);
      mount.debug.setCameraShiftEnabled(persisted.cameraShiftEnabled);
      mount.debug.setCameraBobEnabled(persisted.cameraBobEnabled);
      mount.debug.setWireframe(persisted.wireframe);
      mount.debug.setBoundsVisible(persisted.boundsVisible);
      hasAppliedPersistedVisualStateRef.current = true;
    } catch {
      // Ignore invalid persisted values if replay fails.
    }
  }, []);

  React.useEffect(() => {
    if (!import.meta.env.DEV || DEBUG_PANEL_ENABLED) {
      setPersistedVisualStateReady(true);
      return;
    }
    let aborted = false;
    void (async (): Promise<void> => {
      const persisted = await loadPersistedVisualDebugState();
      if (aborted) {
        return;
      }
      if (persisted !== null) {
        persistedVisualDebugStateRef.current = persisted;
        if (persisted.enabledAreas !== undefined) {
          setEnabledAreas(cloneEnabledAreas(persisted.enabledAreas));
        }
        if (!HAS_EXPLICIT_ROOM_QUERY && !hasUserRoomOverrideRef.current) {
          setRoomSeed(persisted.roomSeed);
        }
      }
      setPersistedVisualStateReady(true);
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const handleMount = React.useCallback(
    (mount: MahjongTableMount | null): void => {
      mountRef.current = mount;
      setDebugMount(mount);
      if (mount === null) {
        // When the scene unmounts we reset motion‑look related UI state.
        setIsCrouched(false);
        setIsSprinting(false);
        setPlayerSpeed(0);
        setWeaponState(createEmptyWeaponStateSnapshot());
        setExplorationArea("Penthouse");
        hasAttemptedMotionReenable.current = false;
        hasAppliedPersistedVisualStateRef.current = false;
        if (reticleBobbingFrame.current !== 0) {
          window.cancelAnimationFrame(reticleBobbingFrame.current);
          reticleBobbingFrame.current = 0;
        }
        const reticleElement = reticleRef.current;
        if (reticleElement !== null) {
          reticleElement.style.setProperty("--scene-reticule-bob-x", "0px");
          reticleElement.style.setProperty("--scene-reticule-bob-y", "0px");
          reticleElement.style.setProperty("--scene-reticule-dot-bob-x", "0px");
          reticleElement.style.setProperty("--scene-reticule-dot-bob-y", "0px");
        }
        return;
      }
      const snapshot = mount.debug.getSnapshot();
      setRoomVariant(snapshot.roomVariant);
      setExplorationArea(snapshot.explorationArea);
      hasAttemptedMotionReenable.current = false;
      try {
        mount.debug.setQualityMode(visualQualityMode);
      } catch {
        // The mount may initialize during a concurrent remount.
      }
      if (!DEBUG_PANEL_ENABLED) {
        applyPersistedVisualDebugState(mount);
      }

      // Re‑apply the motion‑look flag after a hot‑reload or scene recreation.
      // The original implementation lost this flag, causing the enable/disable
      // control to have no visible effect on mobile devices.
      try {
        // Use the latest state of `isMotionLookEnabled` – the callback now
        // depends on that state, ensuring the current value is used.
        mount.setMotionLookEnabled(isMotionLookEnabled);
      } catch {
        // The scene may be disposed during a concurrent HMR remount.
        return;
      }
      if (reticleBobbingFrame.current !== 0) {
        window.cancelAnimationFrame(reticleBobbingFrame.current);
      }
      const applyReticleBobbing = (): void => {
        const reticleElement = reticleRef.current;
        if (reticleElement === null) {
          reticleBobbingFrame.current = 0;
          return;
        }
        try {
          const { x, y } = mount.getReticleBobbingOffset();
          reticleElement.style.setProperty(
            "--scene-reticule-bob-x",
            `${x * RETICLE_RING_MOTION_MULTIPLIER}px`,
          );
          reticleElement.style.setProperty(
            "--scene-reticule-bob-y",
            `${y * RETICLE_RING_MOTION_MULTIPLIER}px`,
          );
          reticleElement.style.setProperty(
            "--scene-reticule-dot-bob-x",
            `${x * (RETICLE_DOT_MOTION_MULTIPLIER - RETICLE_RING_MOTION_MULTIPLIER)}px`,
          );
          reticleElement.style.setProperty(
            "--scene-reticule-dot-bob-y",
            `${y * (RETICLE_DOT_MOTION_MULTIPLIER - RETICLE_RING_MOTION_MULTIPLIER)}px`,
          );
          reticleBobbingFrame.current = window.requestAnimationFrame(applyReticleBobbing);
        } catch {
          reticleBobbingFrame.current = 0;
        }
      };
      reticleBobbingFrame.current = window.requestAnimationFrame(applyReticleBobbing);
    },
    // Adding `isMotionLookEnabled` as a dependency makes sure the latest UI
    // state is reflected when the mount is recreated (e.g., after a hot reload).
    [isMotionLookEnabled, visualQualityMode],
  );

  React.useEffect(() => {
    return () => {
      if (reticleBobbingFrame.current !== 0) {
        window.cancelAnimationFrame(reticleBobbingFrame.current);
        reticleBobbingFrame.current = 0;
      }
    };
  }, []);

  const applyVisualQualityMode = (mode: VisualQualityMode): void => {
    setVisualQualityMode(mode);
    writeVisualQualityMode(mode);
    const mount = mountRef.current;
    if (mount === null) {
      return;
    }
    try {
      mount.debug.setQualityMode(mode);
    } catch {
      // The mount may disappear during a concurrent HMR remount.
    }
  };
  React.useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) {
      return;
    }
    try {
      mount.debug.setQualityMode(visualQualityMode);
    } catch {
      // Ignore transient mount disposal races during re-render or HMR.
    }
  }, [visualQualityMode]);
  const handleMotionLookStatusChange = React.useCallback((status: MotionLookStatus): void => {
    setMotionStatus(status);
    if (status === "denied" || status === "unsupported") {
      setIsMotionLookEnabled(false);
      writeMotionLookPreference(false);
      return;
    }
    if (status === "ready") {
      writeMotionLookPreference(true);
    }
  }, []);
  const handleExplorationAreaChange = React.useCallback((area: string): void => {
    setExplorationArea(area);
  }, []);
  const requestMotionLook = (): void => {
    void (async (): Promise<void> => {
      const status = await mountRef.current?.requestMotionLook();
      if (status === "ready") {
        writeMotionLookPreference(true);
        setIsMotionLookEnabled(true);
      }
    })();
  };
  const toggleMotionLook = (): void => {
    const mount = mountRef.current;
    if (mount === null) {
      return;
    }
    if (motionStatus !== "ready") {
      requestMotionLook();
      return;
    }
    if (isMotionLookEnabled) {
      mount.setMotionLookEnabled(false);
      writeMotionLookPreference(false);
      setIsMotionLookEnabled(false);
      return;
    }
    mount.setMotionLookEnabled(true);
    writeMotionLookPreference(true);
    setIsMotionLookEnabled(true);
  };
  const updateJoystick = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const knob = joystickKnobRef.current;
    if (knob === null) {
      return;
    }
    const joystickBounds = event.currentTarget.getBoundingClientRect();
    const knobBounds = knob.getBoundingClientRect();
    const maxOffset = Math.max(
      1,
      (Math.min(joystickBounds.width, joystickBounds.height) -
        Math.max(knobBounds.width, knobBounds.height)) /
        2 -
        4,
    );
    const centerX = joystickBounds.left + joystickBounds.width / 2;
    const centerY = joystickBounds.top + joystickBounds.height / 2;
    const distanceX = event.clientX - centerX;
    const distanceY = event.clientY - centerY;
    const distance = Math.hypot(distanceX, distanceY);
    const scale = distance > maxOffset ? maxOffset / distance : 1;
    const offsetX = distanceX * scale;
    const offsetY = distanceY * scale;
    knob.style.transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0)`;

    const normalizedX = offsetX / maxOffset;
    const normalizedY = offsetY / maxOffset;
    const distanceRatio = Math.min(Math.hypot(normalizedX, normalizedY), 1);
    const adjustedMagnitude =
      distanceRatio <= JOYSTICK_DEAD_ZONE
        ? 0
        : (distanceRatio - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
    const directionScale = distanceRatio > 0 ? adjustedMagnitude / distanceRatio : 0;
    mountRef.current?.setTouchMovementVector(
      -normalizedY * directionScale,
      normalizedX * directionScale,
      true,
    );
  };
  // Synchronize the underlying mount's motion‑look state with the persisted
  // preference, and re-open permission flow only once per mount/rebuild.
  React.useEffect(() => {
    const mount = mountRef.current;
    if (mount === null || !isMobile) {
      hasAttemptedMotionReenable.current = false;
      return;
    }
    if (motionStatus === "ready") {
      hasAttemptedMotionReenable.current = false;
      try {
        mount.setMotionLookEnabled(isMotionLookEnabled);
      } catch {
        // The mount may have been disposed during a concurrent hot‑reload.
      }
      return;
    }
    if (!isMotionLookEnabled || motionStatus !== "needs-permission") {
      hasAttemptedMotionReenable.current = false;
      return;
    }
    if (hasAttemptedMotionReenable.current) {
      return;
    }
    hasAttemptedMotionReenable.current = true;
    void (async (): Promise<void> => {
      const status = await mount.requestMotionLook();
      if (status === "ready") {
        setIsMotionLookEnabled(true);
      }
    })();
  }, [isMobile, isMotionLookEnabled, motionStatus]);

  React.useEffect(() => {
    if (motionStatus === "ready" && isMotionLookEnabled) {
      writeMotionLookPreference(true);
    }
  }, [motionStatus, isMotionLookEnabled]);
  const resetJoystick = (): void => {
    const knob = joystickKnobRef.current;
    if (knob !== null) {
      knob.style.transform = "translate3d(0, 0, 0)";
    }
    mountRef.current?.setTouchMovementVector(0, 0, false);
  };
  const handleJoystickPointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };
  const handleJoystickPointerUp = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    resetJoystick();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const toggleCrouch = (): void => {
    const nextCrouched = mountRef.current?.toggleCrouch();
    if (nextCrouched !== undefined) {
      setIsCrouched(nextCrouched);
    }
  };
  const jump = (): void => {
    const nextCrouched = mountRef.current?.jump();
    if (nextCrouched !== undefined) {
      setIsCrouched(nextCrouched);
    }
  };
  const fire = (): void => {
    mountRef.current?.fire();
  };
  const interact = (): void => {
    mountRef.current?.interact();
  };
  const reload = (): void => {
    mountRef.current?.reload();
  };
  const nextRoom = (): void => {
    hasUserRoomOverrideRef.current = true;
    roomSequenceRef.current += 1;
    setExplorationArea("Penthouse");
    setRoomSeed(`room-${String(roomSequenceRef.current).padStart(2, "0")}`);
  };
  const loadRoomSeed = (seed: string): void => {
    hasUserRoomOverrideRef.current = true;
    setExplorationArea("Penthouse");
    setRoomSeed(normalizeVisualRoomSeed(seed));
  };
  const handleVisualAreaChange = (area: VisualSceneAreaId, enabled: boolean): void => {
    setEnabledAreas((previous) => {
      if (previous[area] === enabled) {
        return previous;
      }
      return { ...previous, [area]: enabled };
    });
  };
  const handleMobileActionPointerDown = (
    action: () => void,
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.pointerType !== "touch") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    lastTouchActionAtRef.current = window.performance.now();
    action();
  };
  const handleMobileActionClick = (action: () => void): void => {
    const now = window.performance.now();
    if (now - lastTouchActionAtRef.current < 750) {
      lastTouchActionAtRef.current = 0;
      return;
    }
    action();
  };
  React.useEffect(() => {
    const onSceneHotReload = (): void => {
      setHmrSceneEpoch((epoch) => epoch + 1);
    };
    const onHmrTestNote = (payload: unknown): void => {
      if (!isHmrTestMessagePayload(payload)) {
        return;
      }
      const message =
        payload.message !== null && payload.message.length > 0 ? payload.message : null;
      setHmrTestMessage(message);
      storeHmrTestMessage(message);
    };
    window.addEventListener(MAHJONG_TABLE_HMR_EVENT, onSceneHotReload);
    import.meta.hot?.on(HMR_TEST_NOTE_EVENT, onHmrTestNote);

    const disposeAfterUpdate =
      import.meta.hot?.on(
        "vite:afterUpdate",
        (
          payload:
            | {
                readonly updates?: readonly {
                  readonly path?: string;
                }[];
              }
            | undefined,
        ): void => {
          const updates = payload?.updates;
          if (!Array.isArray(updates)) {
            return;
          }
          if (
            updates.some(
              (update) =>
                typeof update?.path === "string" &&
                (update.path.includes("/scene/mahjong-table") ||
                  update.path.includes("/scene/MahjongTableScene")),
            )
          ) {
            onSceneHotReload();
          }
        },
      ) ?? (() => {});

    return () => {
      window.removeEventListener(MAHJONG_TABLE_HMR_EVENT, onSceneHotReload);
      import.meta.hot?.off(HMR_TEST_NOTE_EVENT, onHmrTestNote);
      disposeAfterUpdate();
    };
  }, []);

  const motionInstruction =
    motionStatus === "ready"
      ? isMotionLookEnabled
        ? "Motion look is on. Tilt your iPhone or swipe the table to look around."
        : "Motion look is available. Swipe the table to look around, or tap Enable motion look."
      : motionStatus === "denied"
        ? "Motion access was blocked. Check Safari motion access and try again."
        : motionStatus === "unsupported"
          ? "Motion look needs a secure HTTPS page on iPhone. Open the secure preview URL."
          : "Tap Enable motion look, allow motion access, then tilt your iPhone or swipe the table.";
  const shieldPercent = Math.round((playerVitals.shield / PLAYER_MAX_SHIELD) * 100);
  const healthPercent = Math.round((playerVitals.health / PLAYER_MAX_HEALTH) * 100);
  const o2Percent = Math.round((playerVitals.o2 / PLAYER_MAX_O2) * 100);
  const shieldStatus =
    playerVitals.shield >= PLAYER_MAX_SHIELD
      ? "Full charge"
      : playerVitals.timeSinceDamage >= SHIELD_RECHARGE_DELAY_SECONDS
        ? "Recharging"
        : `Recharge in ${(SHIELD_RECHARGE_DELAY_SECONDS - playerVitals.timeSinceDamage).toFixed(1)}s`;
  const o2Status = playerVitals.holdingBreath
    ? "Holding breath"
    : playerVitals.holdBreathLocked
      ? "Recover above 25% to hold"
      : playerVitals.o2 >= PLAYER_MAX_O2
        ? "Ready"
        : "Recovering";
  const hudStatus: {
    readonly label: string;
    readonly tone: "ready" | "crouched" | "sprinting" | "focused" | "reloading";
  } = weaponState.reloading
    ? { label: "Reloading", tone: "reloading" }
    : playerVitals.holdingBreath
      ? { label: "Steady aim", tone: "focused" }
      : isSprinting
        ? { label: "Sprint", tone: "sprinting" }
        : isCrouched
          ? { label: "Crouched", tone: "crouched" }
          : { label: "Ready", tone: "ready" };
  const activeSlotIndex = weaponState.activeSlotIndex;
  const activeWeaponSlot =
    activeSlotIndex === null || activeSlotIndex < 0
      ? null
      : (weaponState.slots[activeSlotIndex] ?? null);
  const activeWeaponLabel = activeWeaponSlot?.displayName ?? null;
  const nearbyWeaponPickup = weaponState.nearbyPickup;
  const hasOwnedWeapon = weaponState.slots.some((slot) => slot.owned);
  const inventoryFull = weaponState.slots.every((slot) => slot.owned);

  return (
    <main id="main" className="immersive-shell">
      <section className="scene-card immersive-scene" aria-labelledby="table-heading">
        <div
          className="scene-frame"
          onContextMenu={(event) => {
            if (isMobile) {
              event.preventDefault();
            }
          }}
        >
          {persistedVisualStateReady ? (
            <MahjongTableScene
              key={`scene-${hmrSceneEpoch}-${roomSeed}-${enabledAreaKey}`}
              debug={DEBUG_PANEL_ENABLED}
              enabledAreas={enabledAreaIds}
              reticlePosition={RETICLE_POSITION}
              onExplorationAreaChange={handleExplorationAreaChange}
              onVisualAreaChange={handleVisualAreaChange}
              roomSeed={roomSeed}
              view={view}
              onMount={handleMount}
              onMotionLookStatusChange={handleMotionLookStatusChange}
              onSprintingChange={setIsSprinting}
              onSpeedChange={setPlayerSpeed}
              onVitalsChange={setPlayerVitals}
              onWeaponStateChange={setWeaponState}
            />
          ) : (
            <div className="scene-canvas">
              <div className="scene-loading" role="status" aria-live="polite">
                <span className="scene-loading-eyebrow">Hong Kong Mahjong Coach</span>
                <strong>Loading saved visual settings</strong>
                <span className="scene-loading-line" aria-hidden="true" />
                <span>Preparing the table…</span>
              </div>
            </div>
          )}
          {DEBUG_PANEL_ENABLED && debugMount !== null ? (
            <VisualDebugPanel
              isMobile={isMobile}
              mount={debugMount}
              onNextRoom={nextRoom}
              onRoomSeedSubmit={loadRoomSeed}
            />
          ) : null}
          <div
            ref={reticleRef}
            className={`scene-reticule${isCapsLockOn ? "" : " is-caps-lock-off"}${
              isSprinting ? " is-sprinting" : ""
            }${weaponState.reloading ? " is-reloading" : ""}`}
            aria-hidden="true"
            style={{ left: `${RETICLE_POSITION.x * 100}%`, top: `${RETICLE_POSITION.y * 100}%` }}
          >
            <span />
          </div>
          <header className="scene-overlay scene-overlay-intro">
            <p className="eyebrow">Hong Kong Old Style · NYC Social Table</p>
            <h1 id="table-heading">Stay in the hand.</h1>
            {isMobile ? (
              <>
                <p>
                  iPhone mode: turn your phone sideways into landscape for the best composed view.
                  {` ${motionInstruction}`}
                </p>
                {motionStatus !== "unsupported" && (
                  <button
                    className="motion-button"
                    disabled={motionStatus === "requesting"}
                    onClick={toggleMotionLook}
                    type="button"
                  >
                    {motionStatus === "requesting"
                      ? "Waiting for motion access…"
                      : motionStatus === "denied"
                        ? "Try motion access again"
                        : motionStatus === "ready" && isMotionLookEnabled
                          ? "Disable motion look"
                          : "Enable motion look"}
                  </button>
                )}
              </>
            ) : (
              <p>
                Click to look around. WASD moves through the room; double-tap any movement key to
                sprint. Walk through the cyan arch to leave the room and explore streamed play
                areas. Hold left Command to aim and hold your breath; right-click toggles aim
                without holding your breath. Double-tap a movement key to sprint and leave aim.
              </p>
            )}
          </header>
          <div
            className="scene-overlay scene-overlay-controls"
            style={{
              top: "max(0.7rem, env(safe-area-inset-top))",
              left: "max(0.7rem, env(safe-area-inset-left))",
              right: "auto",
              bottom: "auto",
              margin: 0,
              alignSelf: "flex-start",
            }}
          >
            <div className="scene-actions" role="group" aria-label="Camera view">
              <button aria-pressed={view === "seat"} onClick={() => setView("seat")} type="button">
                Seat view
              </button>
              <button onClick={nextRoom} type="button">
                New room
              </button>
              {DEBUG_PANEL_ENABLED ? (
                <button
                  aria-pressed={view === "overhead"}
                  onClick={() => setView("overhead")}
                  type="button"
                >
                  Overhead
                </button>
              ) : null}
            </div>
            {!DEBUG_PANEL_ENABLED ? (
              <label className="scene-video-quality" htmlFor="visual-quality-mode">
                Video quality
                <select
                  id="visual-quality-mode"
                  onChange={(event) =>
                    applyVisualQualityMode(event.currentTarget.value as VisualQualityMode)
                  }
                  value={visualQualityMode}
                >
                  {debugQualityModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="scene-hud" aria-label="Session status">
            <span className="scene-hud-item scene-hud-live">
              <i aria-hidden="true" />
              <span className="scene-hud-label">Live</span>
              <strong>3D preview</strong>
            </span>
            <span aria-hidden="true" className="scene-hud-divider" />
            <span className="scene-hud-item scene-hud-round">
              <span className="scene-hud-label">Round</span>
              <strong>1 · East</strong>
            </span>
            <span className="scene-hud-item scene-hud-location">
              <span className="scene-hud-label">Area</span>
              <strong>{explorationArea}</strong>
              <em>
                {roomVariant} · {roomSeed}
              </em>
            </span>
            <span
              className={`scene-hud-status scene-hud-status-${hudStatus.tone}`}
              data-status={hudStatus.tone}
            >
              <i aria-hidden="true" />
              <strong>{hudStatus.label}</strong>
            </span>
          </div>
          {DEBUG_PANEL_ENABLED ? (
            <output
              aria-label="Player speed"
              className="scene-speedometer"
              data-debug-speedometer="true"
              data-speed-mps={playerSpeed.toFixed(2)}
            >
              SPD {playerSpeed.toFixed(1)} m/s
            </output>
          ) : null}
          <div className="scene-vitals-stack">
            <div
              className="scene-vitals"
              aria-label="Player vitals"
              data-health-state={
                playerVitals.isDead ? "down" : healthPercent <= 25 ? "critical" : "stable"
              }
              data-o2-state={o2Percent <= 25 ? "low" : "stable"}
            >
              <div className="scene-panel-heading">
                <span>Player systems</span>
                <small>Live telemetry</small>
              </div>
              <div className="scene-vitals-row scene-vitals-shield">
                <div className="scene-vitals-heading">
                  <span>Shield</span>
                  <strong>{shieldPercent}%</strong>
                </div>
                <div
                  aria-label={`Shield ${shieldPercent}%`}
                  aria-valuemax={PLAYER_MAX_SHIELD}
                  aria-valuemin={0}
                  aria-valuenow={playerVitals.shield}
                  className="scene-vitals-track"
                  role="progressbar"
                >
                  <span style={{ width: `${shieldPercent}%` }} />
                </div>
                <small>{shieldStatus}</small>
              </div>
              <div className="scene-vitals-row scene-vitals-health">
                <div className="scene-vitals-heading">
                  <span>Health</span>
                  <strong>{healthPercent}%</strong>
                </div>
                <div
                  aria-label={`Health ${healthPercent}%`}
                  aria-valuemax={PLAYER_MAX_HEALTH}
                  aria-valuemin={0}
                  aria-valuenow={playerVitals.health}
                  className="scene-vitals-track"
                  role="progressbar"
                >
                  <span style={{ width: `${healthPercent}%` }} />
                </div>
                <small>
                  {playerVitals.isDead ? "Down" : healthPercent <= 25 ? "Critical" : "Stable"}
                </small>
              </div>
              <div className="scene-vitals-row scene-vitals-o2">
                <div className="scene-vitals-heading">
                  <span>O2</span>
                  <strong>{o2Percent}%</strong>
                </div>
                <div
                  aria-label={`O2 ${o2Percent}%`}
                  aria-valuemax={PLAYER_MAX_O2}
                  aria-valuemin={0}
                  aria-valuenow={playerVitals.o2}
                  className="scene-vitals-track"
                  role="progressbar"
                >
                  <span style={{ width: `${o2Percent}%` }} />
                </div>
                <small>{o2Status}</small>
              </div>
            </div>
            {hmrTestMessage !== null ? (
              <aside
                aria-label="Agent test note"
                aria-live="polite"
                className="scene-test-note"
                data-hmr-test-note="true"
                role="status"
              >
                <span>Agent test note</span>
                <p>{hmrTestMessage}</p>
              </aside>
            ) : null}
          </div>
          <div
            aria-label="Weapon loadout"
            className="scene-weapons"
            data-bullet-hole-count={weaponState.bulletHoleCount}
            data-reloading={weaponState.reloading ? "true" : "false"}
            data-shots-fired={weaponState.shotsFired}
            data-shots-hit={weaponState.shotsHit}
          >
            <div className="scene-panel-heading">
              <span>Loadout</span>
              <small>
                {weaponState.reloading ? "Reloading" : hasOwnedWeapon ? "Ready" : "Unarmed"}
              </small>
            </div>
            <div className="scene-weapons-heading">
              <span>{activeWeaponLabel ?? "No weapon"}</span>
              <strong>
                {activeWeaponSlot === null
                  ? "—"
                  : `${String(activeWeaponSlot.ammoInMagazine)} / ${String(activeWeaponSlot.reserveAmmo)}`}
              </strong>
            </div>
            {nearbyWeaponPickup !== null ? (
              <p className="scene-weapons-pickup">
                {inventoryFull && activeSlotIndex !== null
                  ? "Walk over to ignore · press E to swap "
                  : activeSlotIndex !== null
                    ? "Walk over to store · press E to equip "
                    : "Walk into or press E to equip "}
                {nearbyWeaponPickup.displayName}
              </p>
            ) : null}
            <div className="scene-weapon-slots">
              {weaponState.slots.map((slot) => {
                const shortLabel = slot.shortLabel ?? "—";
                const isOwned = slot.owned;
                const isActive = slot.slotIndex === activeSlotIndex;
                return (
                  <span
                    aria-label={`${slot.displayName ?? "Empty slot"}${
                      isOwned ? `, ${String(slot.ammoInMagazine)} rounds` : ", not collected"
                    }`}
                    className="scene-weapon-slot"
                    data-active={isActive ? "true" : "false"}
                    data-owned={isOwned ? "true" : "false"}
                    key={slot.slotIndex}
                  >
                    <b>{slot.slotIndex + 1}</b>
                    <i>{shortLabel}</i>
                  </span>
                );
              })}
            </div>
            <small>
              {weaponState.reloading
                ? "Reloading…"
                : activeWeaponSlot === null
                  ? hasOwnedWeapon
                    ? "1–2 equip · Q throw"
                    : "Find a glowing pickup"
                  : "Click fire · R reload · 0 holster · Q throw"}
            </small>
            {weaponState.profileInspection !== null ? (
              <details
                className="scene-weapon-inspection"
                data-profile-hash={weaponState.profileInspection.profileHash}
              >
                <summary>Inspect generated profile</summary>
                <dl>
                  <div>
                    <dt>Profile</dt>
                    <dd>{weaponState.profileInspection.displayName}</dd>
                  </div>
                  <div>
                    <dt>Hash / seed</dt>
                    <dd>
                      {weaponState.profileInspection.profileHash} ·{" "}
                      {weaponState.profileInspection.generatorSeed}
                    </dd>
                  </div>
                  <div>
                    <dt>Damage / sustained</dt>
                    <dd>
                      {weaponState.profileInspection.groupDamage.toFixed(1)} /{" "}
                      {weaponState.profileInspection.sustainedDamagePerSecond.toFixed(1)} dps
                    </dd>
                  </div>
                  <div>
                    <dt>Spread hip / zoom</dt>
                    <dd>
                      {weaponState.profileInspection.hipSpreadRadians.toFixed(3)} /{" "}
                      {weaponState.profileInspection.zoomSpreadRadians.toFixed(3)} rad
                    </dd>
                  </div>
                  <div>
                    <dt>Reload / O₂ per shot</dt>
                    <dd>
                      {weaponState.profileInspection.reloadSeconds.toFixed(2)} s /{" "}
                      {weaponState.profileInspection.oxygenCostPerGroup.toFixed(1)}
                    </dd>
                  </div>
                </dl>
                {weaponState.telemetry !== null ? (
                  <p>
                    {weaponState.telemetry.acceptedShots} shots ·{" "}
                    {weaponState.telemetry.hitRate.toFixed(0)}% hits ·{" "}
                    {weaponState.telemetry.totalDamage.toFixed(0)} damage ·{" "}
                    {weaponState.telemetry.oxygenConsumed.toFixed(1)} O₂ ·{" "}
                    {weaponState.telemetry.peakMovementSpeedMetersPerSecond.toFixed(1)} m/s ·{" "}
                    {(weaponState.telemetry.reloadInterruptionRate * 100).toFixed(0)}% reload
                    interruptions
                  </p>
                ) : null}
              </details>
            ) : null}
          </div>
          {isMobile && (
            <div className="mobile-touch-controls" aria-label="Mobile movement controls">
              <button
                aria-label="Move joystick"
                className="mobile-joystick"
                onPointerCancel={handleJoystickPointerUp}
                onPointerDown={handleJoystickPointerDown}
                onPointerLeave={handleJoystickPointerUp}
                onPointerMove={updateJoystick}
                onPointerUp={handleJoystickPointerUp}
                type="button"
              >
                <span aria-hidden="true" className="mobile-joystick-knob" ref={joystickKnobRef} />
              </button>
              <div className="mobile-action-controls" role="group" aria-label="Actions">
                <button
                  aria-pressed={isCrouched}
                  className="mobile-action-button"
                  onClick={() => handleMobileActionClick(toggleCrouch)}
                  onPointerDown={(event) => handleMobileActionPointerDown(toggleCrouch, event)}
                  type="button"
                >
                  Crouch
                </button>
                <button
                  className="mobile-action-button"
                  onClick={() => handleMobileActionClick(jump)}
                  onPointerDown={(event) => handleMobileActionPointerDown(jump, event)}
                  type="button"
                >
                  Jump
                </button>
                <button
                  className="mobile-action-button mobile-action-fire"
                  onClick={() => handleMobileActionClick(fire)}
                  onPointerDown={(event) => handleMobileActionPointerDown(fire, event)}
                  type="button"
                >
                  Fire
                </button>
                <button
                  className="mobile-action-button"
                  onClick={() => handleMobileActionClick(interact)}
                  onPointerDown={(event) => handleMobileActionPointerDown(interact, event)}
                  type="button"
                >
                  Equip
                </button>
                <button
                  className="mobile-action-button"
                  onClick={() => handleMobileActionClick(reload)}
                  onPointerDown={(event) => handleMobileActionPointerDown(reload, event)}
                  type="button"
                >
                  Reload
                </button>
              </div>
            </div>
          )}
          <footer className="scene-card-footer scene-overlay scene-overlay-footer">
            <p>
              {isMobile
                ? "Drag joystick: move · Swipe look · Equip · Fire · Reload · Crouch · Jump"
                : "Mouse look · WASD move · double-tap any movement key to sprint and leave aim · walk over to store / E equip or swap · click fire · right-click toggle aim · R reload · 0 holster · 1–2 equip · Q throw · Shift crouch · Space jump · Esc releases pointer"}
            </p>
            <span className="scene-credit">Procedural geometry · no external assets</span>
          </footer>
        </div>
      </section>
    </main>
  );
};

const root = document.querySelector<HTMLElement>("#root");

if (root === null) {
  throw new Error("Missing application root");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
