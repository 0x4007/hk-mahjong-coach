import { useEffect, useRef, useState } from "react";

import {
  createMahjongTableScene,
  type MahjongTableMount,
  type SceneView,
} from "./mahjong-table.js";

interface MahjongTableSceneProps {
  readonly view: SceneView;
}

export const MahjongTableScene = ({ view }: MahjongTableSceneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<MahjongTableMount | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    try {
      const mount = createMahjongTableScene(container, view);
      mountRef.current = mount;
      setError(null);
      return () => {
        mount.dispose();
        mountRef.current = null;
      };
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The 3D scene could not start");
      return undefined;
    }
  }, []);

  useEffect(() => {
    mountRef.current?.setView(view);
  }, [view]);

  return (
    <div className="scene-canvas" ref={containerRef}>
      {error === null ? null : (
        <p className="scene-error" role="alert">
          {error}. Try a browser with WebGL enabled.
        </p>
      )}
    </div>
  );
};
