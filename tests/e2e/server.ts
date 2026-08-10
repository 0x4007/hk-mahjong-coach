import { buildServer } from "../../apps/server/src/index.js";

const server = await buildServer({
  multiplayerOptions: {
    databasePath: ":memory:",
    allowedOrigins: ["http://127.0.0.1:4183"],
  },
  fpsOptions: { databasePath: ":memory:" },
});

await server.listen({ host: "127.0.0.1", port: 4183 });
