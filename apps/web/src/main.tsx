import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const App = (): React.JSX.Element => (
  <main id="main">
    <header>
      <p>Hong Kong Old Style · NYC Social Teaching Profile v1</p>
      <h1>Learn the tiles. Read the table. Play with confidence.</h1>
      <p>
        A local-first four-player mahjong coach with deterministic rules, visible assumptions, and
        no account required.
      </p>
    </header>
    <section aria-labelledby="foundation-status">
      <h2 id="foundation-status">Building the table</h2>
      <p>The deterministic engine and teaching game are being assembled milestone by milestone.</p>
    </section>
  </main>
);

const root = document.querySelector<HTMLElement>("#root");

if (root === null) {
  throw new Error("Missing application root");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
