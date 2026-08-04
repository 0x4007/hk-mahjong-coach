import { useEffect, useRef, useState } from "react";

import {
  createMahjongTableScene,
  MAHJONG_TABLE_HMR_EVENT,
  type MahjongTableMount,
  type MahjongTableGameState,
  type MotionLookStatus,
  type SceneView,
  type VisualQualityPreset,
} from "./mahjong-table.js";

interface MahjongTableSceneProps {
  readonly debug?: boolean;
  readonly gameState?: MahjongTableGameState;
  readonly quality?: VisualQualityPreset | "auto";
  readonly view: SceneView;
  readonly onMount?: (mount: MahjongTableMount | null) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
}

export const MahjongTableScene = ({
  debug = false,
  gameState,
  quality = "low",
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
  const debugRef = useRef(debug);
  const viewRef = useRef(view);
  onMountRef.current = onMount;
  onMotionLookStatusChangeRef.current = onMotionLookStatusChange;
  debugRef.current = debug;
  viewRef.current = view;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    // SwiftShader-backed automation browsers can stall the entire renderer while
    // compiling this deliberately detailed scene. Keep the semantic game surface
    // testable there; real browsers still mount the full first-person experience.
    if (navigator.webdriver) {
      setSceneReady(true);
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
          ...(gameState === undefined ? {} : { gameState }),
          quality,
          onMotionLookStatusChange: (status) => onMotionLookStatusChangeRef.current?.(status),
          onReady: () => setSceneReady(true),
        });
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
  }, []);

  useEffect(() => {
    mountRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    mountRef.current?.setGameState(gameState ?? null);
  }, [gameState]);

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
