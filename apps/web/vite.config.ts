import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const devCertificateDirectory = fromRoot("../../.data/dev-cert/");
const devCertificateKeyPath = join(devCertificateDirectory, "localhost-key.pem");
const devCertificatePath = join(devCertificateDirectory, "localhost.pem");

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
  plugins: [react()],
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
