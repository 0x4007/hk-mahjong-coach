import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@hk-mahjong/core": fromRoot("../../packages/core/src/index.ts"),
      "@hk-mahjong/protocol": fromRoot("../../packages/protocol/src/index.ts"),
      "@hk-mahjong/tile-ui": fromRoot("../../packages/tile-ui/src/index.tsx"),
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/ws": {
        target: "ws://127.0.0.1:4173",
        ws: true,
      },
    },
  },
});
