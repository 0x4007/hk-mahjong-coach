import { useEffect, useRef, useState } from "react";

import {
  createMahjongTableScene,
  DEFAULT_ROOM_SEED,
  type ReticlePosition,
  type MahjongTableMount,
  type MotionLookStatus,
  type PlayerVitalsState,
  type SceneView,
  type WeaponStateSnapshot,
} from "./mahjong-table.js";

interface MahjongTableSceneProps {
  readonly debug?: boolean;
  readonly onExplorationAreaChange?: (area: string) => void;
  readonly roomSeed?: string;
  readonly view: SceneView;
  readonly reticlePosition?: ReticlePosition;
  readonly onMount?: (mount: MahjongTableMount | null) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
  readonly onSprintingChange?: (sprinting: boolean) => void;
  readonly onSpeedChange?: (speed: number) => void;
  readonly onVitalsChange?: (vitals: PlayerVitalsState) => void;
  readonly onWeaponStateChange?: (state: WeaponStateSnapshot) => void;
}

export const MahjongTableScene = ({
  debug = false,
  onExplorationAreaChange,
  roomSeed = DEFAULT_ROOM_SEED,
  view,
  reticlePosition,
  onMount,
  onMotionLookStatusChange,
  onSprintingChange,
  onSpeedChange,
  onVitalsChange,
  onWeaponStateChange,
}: MahjongTableSceneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<MahjongTableMount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const onMountRef = useRef(onMount);
  const onMotionLookStatusChangeRef = useRef(onMotionLookStatusChange);
  const onSprintingChangeRef = useRef(onSprintingChange);
  const onSpeedChangeRef = useRef(onSpeedChange);
  const onVitalsChangeRef = useRef(onVitalsChange);
  const onWeaponStateChangeRef = useRef(onWeaponStateChange);
  const onExplorationAreaChangeRef = useRef(onExplorationAreaChange);
  const debugRef = useRef(debug);
  const viewRef = useRef(view);
  const roomSeedRef = useRef(roomSeed);
  const appliedViewRef = useRef<SceneView | null>(null);
  onMountRef.current = onMount;
  onMotionLookStatusChangeRef.current = onMotionLookStatusChange;
  onSprintingChangeRef.current = onSprintingChange;
  onSpeedChangeRef.current = onSpeedChange;
  onVitalsChangeRef.current = onVitalsChange;
  onWeaponStateChangeRef.current = onWeaponStateChange;
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
          onExplorationAreaChange: (area) => onExplorationAreaChangeRef.current?.(area),
          onMotionLookStatusChange: (status) => onMotionLookStatusChangeRef.current?.(status),
          onSprintingChange: (sprinting) => onSprintingChangeRef.current?.(sprinting),
          onSpeedChange: (speed) => onSpeedChangeRef.current?.(speed),
          onVitalsChange: (vitals) => onVitalsChangeRef.current?.(vitals),
          onWeaponStateChange: (state) => onWeaponStateChangeRef.current?.(state),
          onReady: () => setSceneReady(true),
          roomSeed: roomSeedRef.current,
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
  }, [roomSeed]);

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
          <span>Loading the penthouse view…</span>
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
