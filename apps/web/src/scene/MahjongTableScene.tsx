import { useEffect, useRef, useState } from "react";

import {
  createMahjongTableScene,
  type MahjongTableMount,
  type MotionLookStatus,
  type SceneView,
} from "./mahjong-table.js";

interface MahjongTableSceneProps {
  readonly view: SceneView;
  readonly onMount?: (mount: MahjongTableMount | null) => void;
  readonly onMotionLookStatusChange?: (status: MotionLookStatus) => void;
}

export const MahjongTableScene = ({
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
  onMountRef.current = onMount;
  onMotionLookStatusChangeRef.current = onMotionLookStatusChange;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    setSceneReady(false);
    try {
      const mount = createMahjongTableScene(container, view, {
        onMotionLookStatusChange: (status) => onMotionLookStatusChangeRef.current?.(status),
        onReady: () => setSceneReady(true),
      });
      mountRef.current = mount;
      onMountRef.current?.(mount);
      setError(null);
      return () => {
        onMountRef.current?.(null);
        mount.dispose();
        mountRef.current = null;
      };
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The 3D scene could not start");
      setSceneReady(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
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
