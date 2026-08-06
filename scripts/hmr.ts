import { statSync, utimesSync } from "node:fs";
import { resolve } from "node:path";

const sceneModulePath = resolve(process.cwd(), "apps/web/src/scene/mahjong-table.ts");

try {
  const current = statSync(sceneModulePath);
  const now = new Date();
  utimesSync(sceneModulePath, now, now);
  process.stdout.write(
    `Requested Vite scene HMR (${sceneModulePath}; previous mtime ${current.mtime.toISOString()}).\n`,
  );
  process.stdout.write(
    "Keep pnpm dev and the visual-table browser open; the scene should remount and restore its development snapshot.\n",
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to request Vite scene HMR: ${reason}\n`);
  process.exitCode = 1;
}
