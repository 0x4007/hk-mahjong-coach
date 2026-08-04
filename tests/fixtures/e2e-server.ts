import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../../apps/server/src/index.js";

const directory = await mkdtemp(join(tmpdir(), "hk-mahjong-e2e-"));
const server = await buildServer({ databasePath: join(directory, "coach.sqlite") });
await server.listen({ host: "127.0.0.1", port: 4173 });

const shutdown = async (): Promise<void> => {
  await server.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
