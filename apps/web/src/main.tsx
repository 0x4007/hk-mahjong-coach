import React from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { MahjongTableScene } from "./scene/MahjongTableScene.js";
import {
  DEBUG_BOKEH_STRENGTH_MAX,
  DEFAULT_ROOM_SEED,
  normalizeVisualRoomSeed,
} from "./scene/mahjong-table.js";
import type {
  MahjongTableMount,
  MotionLookStatus,
  SceneDebugSnapshot,
  SceneView,
  VisualCameraPreset,
  VisualGlassMode,
  VisualQualityMode,
  VisualShadowQuality,
  VisualToneMapper,
} from "./scene/mahjong-table.js";

const DEBUG_PANEL_ENABLED =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("debug");

const debugCameraPresets: readonly {
  readonly value: VisualCameraPreset;
  readonly label: string;
}[] = [
  { value: "table", label: "Table" },
  { value: "roomReveal", label: "Room reveal" },
  { value: "assetReview", label: "Asset review" },
  { value: "focusCalibration", label: "Focus calibration" },
  { value: "climbingGym", label: "Climbing gym" },
];

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

const MOTION_LOOK_PREFERENCE_STORAGE_KEY = "hk-mahjong-coach:mobile-motion-look:v1";
const VISUAL_DEBUG_STATE_ENDPOINT = "/__codex/visual-debug-state";

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
}

interface PersistedVisualDebugState {
  readonly savedAt: string;
  readonly scene: PersistedVisualDebugScene;
}

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
  const [isExpanded, setIsExpanded] = React.useState(() => !isMobile);
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
    window.addEventListener("pagehide", persistPendingDebugState);
    return () => {
      window.removeEventListener("pagehide", persistPendingDebugState);
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
  const openFocusCalibration = (): void => {
    setCameraPreset("focusCalibration");
    mount.debug.teleportToFocusLab();
    setIsExpanded(true);
  };
  const openClimbingGym = (): void => {
    setCameraPreset("climbingGym");
    setIsExpanded(true);
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
          onClick={() => setIsExpanded((expanded) => !expanded)}
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
          onClick={openFocusCalibration}
          type="button"
        >
          Open focus calibration
        </button>
        <button className="scene-debug-focus-quick-action" onClick={openClimbingGym} type="button">
          Open climbing gym
        </button>
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
              <option key={preset.value} value={preset.value}>
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
  normalizeVisualRoomSeed(
    new URLSearchParams(window.location.search).get("room") ?? DEFAULT_ROOM_SEED,
  );

const App = (): React.JSX.Element => {
  const [view, setView] = React.useState<SceneView>("seat");
  const [roomSeed, setRoomSeed] = React.useState(getInitialRoomSeed);
  const [roomVariant, setRoomVariant] = React.useState("Northlight");
  const [explorationArea, setExplorationArea] = React.useState("Penthouse");
  const [isMobile, setIsMobile] = React.useState(isMobileDevice);
  const [motionStatus, setMotionStatus] = React.useState<MotionLookStatus>(() =>
    isMobile ? "needs-permission" : "unsupported",
  );
  const [isMotionLookEnabled, setIsMotionLookEnabled] = React.useState<boolean>(() =>
    isMobile ? readMotionLookPreference() : false,
  );
  const hasAttemptedMotionReenable = React.useRef(false);
  const [isCrouched, setIsCrouched] = React.useState(false);
  const mountRef = React.useRef<MahjongTableMount | null>(null);
  const [debugMount, setDebugMount] = React.useState<MahjongTableMount | null>(null);
  const joystickKnobRef = React.useRef<HTMLSpanElement>(null);
  const lastTouchActionAtRef = React.useRef(0);
  const roomSequenceRef = React.useRef(1);

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

  const handleMount = React.useCallback(
    (mount: MahjongTableMount | null): void => {
      mountRef.current = mount;
      setDebugMount(mount);
      if (mount === null) {
        // When the scene unmounts we reset motion‑look related UI state.
        setIsCrouched(false);
        setExplorationArea("Penthouse");
        hasAttemptedMotionReenable.current = false;
        return;
      }
      const snapshot = mount.debug.getSnapshot();
      setRoomVariant(snapshot.roomVariant);
      setExplorationArea(snapshot.explorationArea);
      hasAttemptedMotionReenable.current = false;

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
    },
    // Adding `isMotionLookEnabled` as a dependency makes sure the latest UI
    // state is reflected when the mount is recreated (e.g., after a hot reload).
    [isMotionLookEnabled],
  );
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
    mountRef.current?.jump();
  };
  const nextRoom = (): void => {
    roomSequenceRef.current += 1;
    setExplorationArea("Penthouse");
    setRoomSeed(`room-${String(roomSequenceRef.current).padStart(2, "0")}`);
  };
  const loadRoomSeed = (seed: string): void => {
    setExplorationArea("Penthouse");
    setRoomSeed(normalizeVisualRoomSeed(seed));
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
          <MahjongTableScene
            debug={DEBUG_PANEL_ENABLED}
            onExplorationAreaChange={handleExplorationAreaChange}
            roomSeed={roomSeed}
            view={view}
            onMount={handleMount}
            onMotionLookStatusChange={handleMotionLookStatusChange}
          />
          {DEBUG_PANEL_ENABLED && debugMount !== null ? (
            <VisualDebugPanel
              isMobile={isMobile}
              mount={debugMount}
              onNextRoom={nextRoom}
              onRoomSeedSubmit={loadRoomSeed}
            />
          ) : null}
          <div className="scene-reticule" aria-hidden="true">
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
                Click to look around. WASD moves through the room; double-tap W sprints. Walk
                through the cyan arch to leave the room and explore streamed play areas.
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
          </div>
          <div className="scene-hud" aria-label="Scene details">
            <span>
              <i aria-hidden="true" /> Live 3D preview
            </span>
            <span>Round 1 · East</span>
            <span>
              {explorationArea} · {roomVariant} · {roomSeed}
            </span>
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
              </div>
            </div>
          )}
          <footer className="scene-card-footer scene-overlay scene-overlay-footer">
            <p>
              {isMobile
                ? "Drag joystick: center slow · edge sprint · Swipe to look · Crouch · Jump"
                : "Mouse look · WASD move · double-tap W sprint · Shift crouch · Space jump · Esc releases pointer"}
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
