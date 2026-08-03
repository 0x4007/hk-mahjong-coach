import React from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { MahjongTableScene } from "./scene/MahjongTableScene.js";
import type { SceneView } from "./scene/mahjong-table.js";

const App = (): React.JSX.Element => {
  const [view, setView] = React.useState<SceneView>("seat");
  return (
    <main id="main" className="immersive-shell">
      <section className="scene-card immersive-scene" aria-labelledby="table-heading">
        <div className="scene-frame">
          <MahjongTableScene view={view} />
          <header className="scene-overlay scene-overlay-intro">
            <p className="eyebrow">Hong Kong Old Style · NYC Social Table</p>
            <h1 id="table-heading">Stay in the hand.</h1>
            <p>Click the table to look around. Use WASD or the arrow keys to shift your seat.</p>
          </header>
          <div className="scene-overlay scene-overlay-controls">
            <div className="scene-actions" role="group" aria-label="Camera view">
              <button aria-pressed={view === "seat"} onClick={() => setView("seat")} type="button">
                Seat view
              </button>
              <button
                aria-pressed={view === "overhead"}
                onClick={() => setView("overhead")}
                type="button"
              >
                Overhead
              </button>
            </div>
          </div>
          <div className="scene-hud" aria-label="Scene details">
            <span>
              <i aria-hidden="true" /> Live 3D preview
            </span>
            <span>Round 1 · East</span>
            <span>8:42 PM · Midtown</span>
          </div>
          <footer className="scene-card-footer scene-overlay scene-overlay-footer">
            <p>Mouse look · WASD move · Esc releases the pointer</p>
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
