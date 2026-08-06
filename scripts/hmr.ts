import { mkdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sceneModulePath = resolve(process.cwd(), "apps/web/src/scene/mahjong-table.ts");
const manualHmrRequestPath = resolve(process.cwd(), ".data/visual-table-hmr-request");
const rawMessageArguments = process.argv.slice(2);
const messageArguments =
  rawMessageArguments[0] === "--" ? rawMessageArguments.slice(1) : rawMessageArguments;
const message = messageArguments.join(" ").trim();
const requestedAt = Date.now();

try {
  mkdirSync(dirname(manualHmrRequestPath), { recursive: true });
  const payload = { requestedAt, message: message.length > 0 ? message : null };
  writeFileSync(manualHmrRequestPath, `${JSON.stringify(payload)}\n`, "utf8");
  const current = statSync(sceneModulePath);
  const now = new Date();
  utimesSync(sceneModulePath, now, now);
  process.stdout.write(
    `Requested Vite scene HMR (${sceneModulePath}; previous mtime ${current.mtime.toISOString()}).\n`,
  );
  if (message.length > 0) {
    process.stdout.write(`Test note: ${message}\n`);
  }
  process.stdout.write(
    "Keep pnpm dev and the visual-table browser open; the scene should remount and restore its development snapshot.\n",
  );
} catch (error) {
  try {
    unlinkSync(manualHmrRequestPath);
  } catch {
    // The marker may not have been created before the failure.
  }
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to request Vite scene HMR: ${reason}\n`);
  process.exitCode = 1;
}
