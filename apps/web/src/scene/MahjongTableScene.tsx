import { useEffect, useRef, useState } from "react";

import {
  createMahjongTableScene,
  DEFAULT_ROOM_SEED,
  type ReticlePosition,
  type MahjongTableMount,
  type MotionLookStatus,
  type PlayerVitalsState,
  type KillScoreSnapshot,
  type SceneView,
  type VisualSceneAreaId,
  type WeaponStateSnapshot,
  type MeleeStateSnapshot,
} from "./mahjong-table.js";
import type { VisualMapId } from "./map-catalog.js";

interface MahjongTableSceneProps {
  readonly debug?: boolean;
  readonly mapId?: VisualMapId;
  readonly onExplorationAreaChange?: (area: string) => void;
  readonly onVisualAreaChange?: (area: VisualSceneAreaId, enabled: boolean) => void;
  readonly enabledAreas?: readonly VisualSceneAreaId[];
  readonly roomSeed?: string;
  readonly view: SceneView;
  readonly reticlePosition?: ReticlePosition;
  readonly onMount?: (mount: MahjongTableMount | null) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
  readonly onCrouchingChange?: (crouching: boolean) => void;
  readonly onSprintingChange?: (sprinting: boolean) => void;
  readonly onSpeedChange?: (speed: number) => void;
  readonly onVitalsChange?: (vitals: PlayerVitalsState) => void;
  readonly onKillScoreChange?: (score: KillScoreSnapshot) => void;
  readonly onWeaponStateChange?: (state: WeaponStateSnapshot) => void;
  readonly onMeleeStateChange?: (state: MeleeStateSnapshot) => void;
}

export const MahjongTableScene = ({
  debug = false,
  mapId,
  onExplorationAreaChange,
  onVisualAreaChange,
  enabledAreas,
  roomSeed = DEFAULT_ROOM_SEED,
  view,
  reticlePosition,
  onMount,
  onMotionLookStatusChange,
  onCrouchingChange,
  onSprintingChange,
  onSpeedChange,
  onVitalsChange,
  onKillScoreChange,
  onWeaponStateChange,
  onMeleeStateChange,
}: MahjongTableSceneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<MahjongTableMount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const onMountRef = useRef(onMount);
  const onMotionLookStatusChangeRef = useRef(onMotionLookStatusChange);
  const onCrouchingChangeRef = useRef(onCrouchingChange);
  const onSprintingChangeRef = useRef(onSprintingChange);
  const onSpeedChangeRef = useRef(onSpeedChange);
  const onVitalsChangeRef = useRef(onVitalsChange);
  const onKillScoreChangeRef = useRef(onKillScoreChange);
  const onWeaponStateChangeRef = useRef(onWeaponStateChange);
  const onMeleeStateChangeRef = useRef(onMeleeStateChange);
  const onExplorationAreaChangeRef = useRef(onExplorationAreaChange);
  const debugRef = useRef(debug);
  const viewRef = useRef(view);
  const roomSeedRef = useRef(roomSeed);
  const appliedViewRef = useRef<SceneView | null>(null);
  onMountRef.current = onMount;
  onMotionLookStatusChangeRef.current = onMotionLookStatusChange;
  onCrouchingChangeRef.current = onCrouchingChange;
  onSprintingChangeRef.current = onSprintingChange;
  onSpeedChangeRef.current = onSpeedChange;
  onVitalsChangeRef.current = onVitalsChange;
  onKillScoreChangeRef.current = onKillScoreChange;
  onWeaponStateChangeRef.current = onWeaponStateChange;
  onMeleeStateChangeRef.current = onMeleeStateChange;
  onExplorationAreaChangeRef.current = onExplorationAreaChange;
  debugRef.current = debug;
  viewRef.current = view;
  roomSeedRef.current = roomSeed;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const disposeScene = (): void => {
      const mount = mountRef.current;
      if (mount === null) {
        return;
      }
      onMountRef.current?.(null);
      mount.dispose();
      mountRef.current = null;
    };
    const mountScene = (): void => {
      setSceneReady(false);
      try {
        const mount = createMahjongTableScene(container, viewRef.current, {
          debug: debugRef.current,
          ...(mapId === undefined ? {} : { mapId }),
          onExplorationAreaChange: (area) => onExplorationAreaChangeRef.current?.(area),
          ...(onVisualAreaChange === undefined ? {} : { onVisualAreaChange }),
          onMotionLookStatusChange: (status) => onMotionLookStatusChangeRef.current?.(status),
          onCrouchingChange: (crouching) => onCrouchingChangeRef.current?.(crouching),
          onSprintingChange: (sprinting) => onSprintingChangeRef.current?.(sprinting),
          onSpeedChange: (speed) => onSpeedChangeRef.current?.(speed),
          onVitalsChange: (vitals) => onVitalsChangeRef.current?.(vitals),
          onKillScoreChange: (score) => onKillScoreChangeRef.current?.(score),
          onWeaponStateChange: (state) => onWeaponStateChangeRef.current?.(state),
          onMeleeStateChange: (state) => onMeleeStateChangeRef.current?.(state),
          onReady: () => setSceneReady(true),
          roomSeed: roomSeedRef.current,
          ...(enabledAreas === undefined ? {} : { enabledAreas }),
          ...(reticlePosition === undefined ? {} : { reticlePosition }),
        });
        appliedViewRef.current = viewRef.current;
        mountRef.current = mount;
        onMountRef.current?.(mount);
        setError(null);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "The 3D scene could not start");
        setSceneReady(false);
      }
    };

    mountScene();
    return () => {
      disposeScene();
    };
  }, [mapId, roomSeed, enabledAreas]);

  useEffect(() => {
    if (appliedViewRef.current === view) {
      return;
    }
    appliedViewRef.current = view;
    mountRef.current?.setView(view);
  }, [view]);
  useEffect(() => {
    if (reticlePosition === undefined) {
      return;
    }
    mountRef.current?.setReticlePosition(reticlePosition);
  }, [reticlePosition?.x, reticlePosition?.y]);

  return (
    <div className="scene-canvas">
      <div className="scene-renderer" ref={containerRef} />
      {!sceneReady && error === null ? (
        <div className="scene-loading" role="status" aria-live="polite">
          <span className="scene-loading-eyebrow">Mahjong AI Teacher</span>
          <strong>Preparing the table</strong>
          <span className="scene-loading-line" aria-hidden="true" />
          <span>Loading the selected map…</span>
        </div>
      ) : null}
      {error === null ? null : (
        <p className="scene-error" role="alert">
          {error}. Try a browser with WebGL enabled.
        </p>
      )}
    </div>
  );
};
