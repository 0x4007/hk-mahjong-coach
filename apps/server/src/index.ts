import staticFiles from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 4173;

export const buildServer = async (): Promise<FastifyInstance> => {
  const server = Fastify({ logger: false });

  server.get("/api/health", () => ({
    status: "ready",
    schemaVersion: 1,
  }));

  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(moduleDirectory, "../../web/dist");

  try {
    await access(webRoot);
    await server.register(staticFiles, {
      root: webRoot,
      wildcard: false,
    });
    server.get("/*", (_request, reply) => reply.sendFile("index.html"));
  } catch {
    server.get("/", (_request, reply) =>
      reply
        .type("text/html")
        .send("<main><h1>Hong Kong Mahjong Coach</h1><p>Build the web app to begin.</p></main>"),
    );
  }

  return server;
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const server = await buildServer();
  await server.listen({ host: HOST, port: PORT });
}
