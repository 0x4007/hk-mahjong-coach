import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import type { ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const devCertificateDirectory = fromRoot("../../.data/dev-cert/");
const devCertificateKeyPath = join(devCertificateDirectory, "localhost-key.pem");
const devCertificatePath = join(devCertificateDirectory, "localhost.pem");
const visualDebugStatePath = fromRoot("../../artifacts/visual/visual-debug-state.json");
const visualDebugStateEndpoint = "/__codex/visual-debug-state";
const sceneModulePath = fromRoot("../../apps/web/src/scene/mahjong-table.ts");
const manualHmrRequestPath = fromRoot("../../.data/visual-table-hmr-request");
const MANUAL_HMR_REQUEST_TIMEOUT_MS = 5_000;
const HMR_TEST_NOTE_EVENT = "codex:hmr-test-note";
const pendingChangedFiles = new Set<string>();
let manualHmrMode: "scene" | "full" | null = null;
let latestHmrTestMessage: { readonly message: string | null; readonly requestedAt: number } = {
  message: null,
  requestedAt: 0,
};

const consumeManualHmrRequest = (): boolean => {
  let rawRequest: string;
  try {
    rawRequest = readFileSync(manualHmrRequestPath, "utf8").trim();
    unlinkSync(manualHmrRequestPath);
  } catch {
    return false;
  }
  let parsedRequest: unknown;
  try {
    parsedRequest = JSON.parse(rawRequest);
  } catch {
    return false;
  }
  if (typeof parsedRequest !== "object" || parsedRequest === null || Array.isArray(parsedRequest)) {
    return false;
  }
  const request = parsedRequest as { readonly message?: unknown; readonly requestedAt?: unknown };
  const requestedAt = request.requestedAt;
  const message = request.message;
  if (
    typeof requestedAt !== "number" ||
    !Number.isSafeInteger(requestedAt) ||
    (message !== null && typeof message !== "string") ||
    Date.now() - requestedAt > MANUAL_HMR_REQUEST_TIMEOUT_MS
  ) {
    return false;
  }
  latestHmrTestMessage = {
    message: typeof message === "string" && message.length > 0 ? message : null,
    requestedAt,
  };
  return true;
};

const getVisualDebugScenePayload = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const scene = (value as { readonly scene?: unknown }).scene;
  return scene === undefined ? null : JSON.stringify(scene);
};

const setNoCacheHeaders = (response: ServerResponse): void => {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
};

const getDevCertificateHosts = (): string[] => {
  const hosts = new Set(["DNS:localhost", "IP:127.0.0.1", "IP:::1"]);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        hosts.add(`IP:${address.address}`);
      }
    }
  }
  return [...hosts];
};

const getDevHttpsOptions = (): { readonly key: Buffer; readonly cert: Buffer } => {
  mkdirSync(devCertificateDirectory, { recursive: true });
  if (!existsSync(devCertificateKeyPath) || !existsSync(devCertificatePath)) {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-sha256",
        "-days",
        "365",
        "-keyout",
        devCertificateKeyPath,
        "-out",
        devCertificatePath,
        "-subj",
        "/CN=localhost",
        "-addext",
        `subjectAltName=${getDevCertificateHosts().join(",")}`,
      ],
      { stdio: "inherit" },
    );
  }
  return {
    key: readFileSync(devCertificateKeyPath),
    cert: readFileSync(devCertificatePath),
  };
};

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "codex-visual-debug-state",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(visualDebugStateEndpoint, (req, res, next) => {
          setNoCacheHeaders(res);
          if (req.method === "GET") {
            try {
              if (!existsSync(visualDebugStatePath)) {
                res.statusCode = 404;
                res.end("not-found");
                return;
              }
              const payload = readFileSync(visualDebugStatePath, "utf8");
              res.setHeader("Content-Type", "application/json");
              res.statusCode = 200;
              res.end(payload);
              return;
            } catch {
              res.statusCode = 500;
              res.end("read-failed");
              return;
            }
          }
          if (req.method !== "POST") {
            next();
            return;
          }
          let body = "";
          req.on("data", (chunk: Buffer | string) => {
            body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
          });
          req.on("end", () => {
            try {
              if (body.length === 0) {
                res.statusCode = 400;
                res.end("empty-body");
                return;
              }
              const parsedBody: unknown = JSON.parse(body);
              mkdirSync(dirname(visualDebugStatePath), { recursive: true });
              const serialized = body.endsWith("\n") ? body : `${body}\n`;
              const current = existsSync(visualDebugStatePath)
                ? readFileSync(visualDebugStatePath, "utf8")
                : null;
              let currentScenePayload: string | null = null;
              if (current !== null) {
                try {
                  currentScenePayload = getVisualDebugScenePayload(JSON.parse(current));
                } catch {
                  // Replace malformed state with the next valid request.
                }
              }
              const nextScenePayload = getVisualDebugScenePayload(parsedBody);
              const sceneIsUnchanged =
                currentScenePayload !== null &&
                nextScenePayload !== null &&
                currentScenePayload === nextScenePayload;
              if (!sceneIsUnchanged && current !== serialized) {
                writeFileSync(visualDebugStatePath, serialized, "utf8");
              }
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 400;
              res.end("invalid-json");
            }
          });
        });
      },
    },
    {
      name: "codex-manual-scene-hmr",
      apply: "serve",
      hotUpdate(options) {
        if (this.environment.name !== "client") {
          return [];
        }
        if (options.file === sceneModulePath) {
          // Multiple development servers can watch one worktree (for example,
          // a LAN preview beside the primary 5173 lane). Only the server that
          // has an HMR client may consume the shared request marker; otherwise
          // a disconnected watcher can steal the request before the browser's
          // server sees it.
          if (options.server.ws.clients.size === 0) {
            return;
          }
          if (consumeManualHmrRequest()) {
            manualHmrMode = pendingChangedFiles.size === 0 ? "scene" : "full";
            pendingChangedFiles.clear();
            return;
          }
        }
        if (options.file !== sceneModulePath && options.file !== manualHmrRequestPath) {
          pendingChangedFiles.add(options.file);
        }
        return [];
      },
    },
  ],
  resolve: {
    alias: {
      "@hk-mahjong/core/public": fromRoot("../../packages/core/src/public.ts"),
      "@hk-mahjong/core": fromRoot("../../packages/core/src/index.ts"),
      "@hk-mahjong/protocol": fromRoot("../../packages/protocol/src/index.ts"),
      "@hk-mahjong/tile-ui": fromRoot("../../packages/tile-ui/src/index.tsx"),
    },
  },
  server: {
    host: "0.0.0.0",
    ...(command === "serve" ? { https: getDevHttpsOptions() } : {}),
    hotUpdateEnvironments: async (server, hmr) => {
      if (manualHmrMode === null) {
        return;
      }
      const mode = manualHmrMode;
      manualHmrMode = null;
      const testNote = latestHmrTestMessage;
      latestHmrTestMessage = { message: null, requestedAt: 0 };
      const shouldFullReload = mode === "full" || pendingChangedFiles.size > 0;
      pendingChangedFiles.clear();
      server.environments.client.hot.send({
        type: "custom",
        event: HMR_TEST_NOTE_EVENT,
        data: { message: testNote.message },
      });
      if (shouldFullReload) {
        server.environments.client.hot.send({ type: "full-reload", path: "*" });
        return;
      }
      await Promise.all(Object.values(server.environments).map(hmr));
    },
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/ws": {
        target: "ws://127.0.0.1:4173",
        ws: true,
      },
    },
  },
}));
