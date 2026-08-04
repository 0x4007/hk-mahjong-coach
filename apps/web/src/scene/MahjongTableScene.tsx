import { useEffect, useRef, useState } from "react";

import {
  createMahjongTableScene,
  DEFAULT_ROOM_SEED,
  MAHJONG_TABLE_HMR_EVENT,
  type MahjongTableMount,
  type MotionLookStatus,
  type SceneView,
} from "./mahjong-table.js";

interface MahjongTableSceneProps {
  readonly debug?: boolean;
  readonly onExplorationAreaChange?: (area: string) => void;
  readonly roomSeed?: string;
  readonly view: SceneView;
  readonly onMount?: (mount: MahjongTableMount | null) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
}

export const MahjongTableScene = ({
  debug = false,
  onExplorationAreaChange,
  roomSeed = DEFAULT_ROOM_SEED,
  view,
  onMount,
  onMotionLookStatusChange,
}: MahjongTableSceneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<MahjongTableMount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const onMountRef = useRef(onMount);
  const onMotionLookStatusChangeRef = useRef(onMotionLookStatusChange);
  const onExplorationAreaChangeRef = useRef(onExplorationAreaChange);
  const debugRef = useRef(debug);
  const viewRef = useRef(view);
  const roomSeedRef = useRef(roomSeed);
  const appliedViewRef = useRef<SceneView | null>(null);
  onMountRef.current = onMount;
  onMotionLookStatusChangeRef.current = onMotionLookStatusChange;
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
          onReady: () => setSceneReady(true),
          roomSeed: roomSeedRef.current,
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

    const onSceneHotReload = (): void => {
      disposeScene();
      mountScene();
    };
    window.addEventListener(MAHJONG_TABLE_HMR_EVENT, onSceneHotReload);
    mountScene();
    return () => {
      window.removeEventListener(MAHJONG_TABLE_HMR_EVENT, onSceneHotReload);
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
