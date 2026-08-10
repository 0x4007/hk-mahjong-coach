import { openDenoKv } from "../../packages/persistence/src/deno-kv.js";
import { serveDenoKv } from "./src/deno-kv-handler.js";
import { DenoMultiplayerService } from "./src/deno-multiplayer.js";

const kv = await openDenoKv();
const service = new DenoMultiplayerService({ kv });

await serveDenoKv(service, { hostname: "0.0.0.0", port: 8000 });
