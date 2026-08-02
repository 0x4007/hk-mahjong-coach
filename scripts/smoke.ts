import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const server = spawn(process.execPath, ["apps/server/dist/index.js"], {
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  let response: Response | undefined;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      response = await fetch("http://127.0.0.1:4173/api/health");
      if (response.ok) {
        break;
      }
    } catch {
      await delay(100);
    }
  }

  if (!response?.ok) {
    throw new Error("Production server did not become healthy");
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("status" in body) || body.status !== "ready") {
    throw new Error("Health response did not match the public contract");
  }

  const page = await fetch("http://127.0.0.1:4173/");
  const html = await page.text();
  if (!page.ok || !html.includes("Hong Kong Mahjong Coach")) {
    throw new Error("Production web build was not served");
  }

  process.stdout.write("Production smoke test passed.\n");
} finally {
  server.kill("SIGTERM");
}
