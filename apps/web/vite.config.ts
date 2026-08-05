import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const devCertificateDirectory = fromRoot("../../.data/dev-cert/");
const devCertificateKeyPath = join(devCertificateDirectory, "localhost-key.pem");
const devCertificatePath = join(devCertificateDirectory, "localhost.pem");
const visualDebugStatePath = fromRoot("../../artifacts/visual/visual-debug-state.json");
const visualDebugStateEndpoint = "/__codex/visual-debug-state";

const getVisualDebugScenePayload = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const scene = (value as { readonly scene?: unknown }).scene;
  return scene === undefined ? null : JSON.stringify(scene);
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
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/ws": {
        target: "ws://127.0.0.1:4173",
        ws: true,
      },
    },
  },
}));
