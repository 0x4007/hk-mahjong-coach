import React from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { MahjongTableScene } from "./scene/MahjongTableScene.js";
import type { SceneView } from "./scene/mahjong-table.js";

const App = (): React.JSX.Element => {
  const [view, setView] = React.useState<SceneView>("seat");
  return (
    <main id="main">
      <header className="intro">
        <p>Hong Kong Old Style · NYC Social Teaching Profile v1</p>
        <h1>Pull up a chair above Midtown.</h1>
        <p>
          A first-person table for learning to read Hong Kong mahjong: warm felt, ivory tiles, and
          the Manhattan skyline after dark.
        </p>
      </header>
      <section className="scene-card" aria-labelledby="table-heading">
        <header className="scene-card-header">
          <div>
            <p className="eyebrow">Milestone 7 · visual table base</p>
            <h2 id="table-heading">The social table is set.</h2>
          </div>
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
        </header>
        <div className="scene-frame">
          <MahjongTableScene view={view} />
          <div className="scene-hud" aria-label="Scene details">
            <span>
              <i aria-hidden="true" /> Live 3D preview
            </span>
            <span>Round 1 · East</span>
            <span>8:42 PM · Midtown</span>
          </div>
        </div>
        <footer className="scene-card-footer">
          <p>
            Drag to orbit · scroll to zoom · opponents stay face-down until the engine makes their
            tiles public.
          </p>
          <span className="scene-credit">Procedural geometry · no external assets</span>
        </footer>
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
