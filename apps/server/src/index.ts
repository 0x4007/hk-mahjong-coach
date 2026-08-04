import websocket from "@fastify/websocket";
import staticFiles from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_RULESET_IDS, getBundledRuleset, listBundledRulesets } from "@hk-mahjong/hk-rules";
import {
  actionRequestSchema,
  actionResponseSchema,
  apiErrorResponseSchema,
  branchRequestSchema,
  branchResponseSchema,
  curriculumResponseSchema,
  drillAnswerRequestSchema,
  drillAnswerResponseSchema,
  drillSessionRequestSchema,
  drillSessionResponseSchema,
  createGameRequestSchema,
  createGameResponseSchema,
  healthResponseSchema,
  importRequestSchema,
  profilePatchSchema,
  profileSchema,
  replayQuerySchema,
  replayResponseSchema,
  observationQuerySchema,
  rulesetSummarySchema,
  hintRequestSchema,
  hintResponseSchema,
  masteryResponseSchema,
  reviewSchema,
  rulesetDetailsSchema,
  demosResponseSchema,
  type ProtocolError,
} from "@hk-mahjong/protocol";
import { listSeededDemos, SessionController } from "@hk-mahjong/session";
import { CONCEPT_IDS, type ConceptId, type CoachNarrator } from "@hk-mahjong/coach";

const HOST = "127.0.0.1";
const PORT = 4173;
const DEFAULT_DATABASE_PATH = join(homedir(), ".hk-mahjong-coach", "coach.sqlite");
const LEARNER_ID = "local-learner";

export interface ServerOptions {
  readonly databasePath?: string;
  readonly controller?: SessionController;
  readonly narrator?: CoachNarrator | null;
}

const errorPayload = (
  code: ProtocolError["code"],
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ProtocolError => ({ code, message, details });

const sendError = (
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  statusCode: number,
  error: ProtocolError,
): unknown => reply.code(statusCode).send(apiErrorResponseSchema.parse({ error }));

interface GameSocket {
  send(payload: string): void;
  close(): void;
  on(event: "message", handler: (raw: { toString(): string }) => void): void;
}

const rulesetId = (value: string): (typeof BUNDLED_RULESET_IDS)[number] => {
  if (!(BUNDLED_RULESET_IDS as readonly string[]).includes(value)) {
    throw new RangeError(`Unknown bundled ruleset ${value}`);
  }
  return value as (typeof BUNDLED_RULESET_IDS)[number];
};

export const buildServer = async (options: ServerOptions = {}): Promise<FastifyInstance> => {
  const ownsController = options.controller === undefined;
  const databasePath = options.databasePath ?? DEFAULT_DATABASE_PATH;
  if (databasePath !== ":memory:") {
    await mkdir(dirname(databasePath), { recursive: true });
  }
  const controller =
    options.controller ??
    new SessionController({
      databasePath,
      ...(options.narrator === undefined ? {} : { narrator: options.narrator }),
    });
  controller.resume(LEARNER_ID);
  const server = Fastify({ logger: false });
  await server.register(websocket);

  server.addHook("onClose", () => {
    if (ownsController) {
      controller.close();
    }
  });

  server.get("/api/health", () =>
    healthResponseSchema.parse({ status: "ready", schemaVersion: 1 }),
  );

  server.get("/api/rulesets", () =>
    listBundledRulesets().map((summary) => rulesetSummarySchema.parse(summary)),
  );

  server.get("/api/demos", () => demosResponseSchema.parse(listSeededDemos()));

  server.get<{ Params: { id: string } }>("/api/rulesets/:id", async (request, reply) => {
    try {
      return rulesetSummarySchema.parse(
        listBundledRulesets().find(({ id }) => id === request.params.id),
      );
    } catch (error) {
      return sendError(
        reply,
        404,
        errorPayload("ruleset_invalid", error instanceof Error ? error.message : "Unknown ruleset"),
      );
    }
  });

  server.get<{ Params: { id: string } }>("/api/rulesets/:id/details", async (request, reply) => {
    try {
      const ruleset = getBundledRuleset(request.params.id);
      const summary = listBundledRulesets().find(({ id }) => id === request.params.id);
      if (summary === undefined) {
        throw new RangeError(`Unknown bundled ruleset ${request.params.id}`);
      }
      return rulesetDetailsSchema.parse({
        ...summary,
        tileSet: {
          bonusTilesEnabled: ruleset.definition.tileSet.bonusTilesEnabled,
          ordinaryDrawDirection: ruleset.definition.tileSet.ordinaryDrawDirection,
          replacementDrawDirection: ruleset.definition.tileSet.replacementDrawDirection,
          exhaustionBoundary: ruleset.definition.tileSet.exhaustionBoundary,
        },
        winRules: {
          minimumFaan: ruleset.definition.winRules.minimumFaan,
          capFaan: ruleset.definition.winRules.capFaan,
          multipleWinners: ruleset.definition.winRules.multipleWinners,
          allowSevenPairs: ruleset.definition.winRules.allowSevenPairs,
          allowThirteenOrphans: ruleset.definition.winRules.allowThirteenOrphans,
          allowNineGates: ruleset.definition.winRules.allowNineGates,
        },
        kongRules: {
          robAddedKong: ruleset.definition.kongRules.robAddedKong,
          robConcealedKong: ruleset.definition.kongRules.robConcealedKong,
          allowKongImmediatelyAfterChowOrPung:
            ruleset.definition.kongRules.allowKongImmediatelyAfterChowOrPung,
        },
        scoringRules: ruleset.definition.scoringRules.map((rule) => ({
          id: rule.id,
          names: rule.names,
          value: rule.value,
          category: rule.category,
          enabled: rule.enabled,
        })),
      });
    } catch (error) {
      return sendError(
        reply,
        404,
        errorPayload("ruleset_invalid", error instanceof Error ? error.message : "Unknown ruleset"),
      );
    }
  });

  server.post("/api/games", async (request, reply) => {
    const parsed = createGameRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Game creation payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    try {
      const input = parsed.data;
      const created = controller.create({
        mode: input.mode,
        rulesetId: rulesetId(input.rulesetId),
        matchLength: input.matchLength,
        seed: input.seed ?? `web-${crypto.randomUUID()}`,
        learnerId: "local-learner",
        humanPlayerId: "player-0",
        humanDisplayName: input.human.displayName,
        ...(input.human.preferredSeat === undefined
          ? {}
          : { preferredSeat: input.human.preferredSeat }),
        opponents: input.opponents.map((opponent, index) => ({
          playerId: `player-${String(index + 1)}`,
          displayName: opponent.displayName,
          difficulty: opponent.difficulty === "adaptive" ? "basic" : opponent.difficulty,
          personality: opponent.personality,
        })),
        coach: input.coach,
      });
      return createGameResponseSchema.parse({
        game: created.game,
        observation: created.observation,
      });
    } catch (error) {
      return sendError(
        reply,
        400,
        errorPayload(
          "invalid_request",
          error instanceof Error ? error.message : "Game creation failed",
        ),
      );
    }
  });

  server.get<{ Params: { id: string }; Querystring: unknown }>(
    "/api/games/:id/observation",
    async (request, reply) => {
      const parsed = observationQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          errorPayload("invalid_request", "Observation query is invalid", {
            issues: parsed.error.issues,
          }),
        );
      }
      try {
        return controller.observation(
          request.params.id,
          parsed.data.playerId,
          parsed.data.branchId,
        );
      } catch (error) {
        return sendError(
          reply,
          404,
          errorPayload("unknown_game", error instanceof Error ? error.message : "Unknown game"),
        );
      }
    },
  );

  server.post<{ Params: { id: string } }>("/api/games/:id/actions", async (request, reply) => {
    const parsed = actionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Action payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    try {
      const result = controller.submit({ gameId: request.params.id, ...parsed.data });
      if (!result.accepted) {
        const status = result.error.code === "stale_revision" ? 409 : 400;
        return sendError(reply, status, result.error);
      }
      return actionResponseSchema.parse({
        accepted: true,
        observation: result.observation,
        publicEvents: result.publicEvents,
      });
    } catch (error) {
      return sendError(
        reply,
        404,
        errorPayload("unknown_game", error instanceof Error ? error.message : "Unknown game"),
      );
    }
  });

  server.post<{ Params: { id: string } }>("/api/games/:id/hints", async (request, reply) => {
    const parsed = hintRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Hint payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    try {
      const result = await controller.hint({ gameId: request.params.id, ...parsed.data });
      return hintResponseSchema.parse(result);
    } catch (error) {
      return sendError(
        reply,
        409,
        errorPayload(
          "stale_revision",
          error instanceof Error ? error.message : "Hint request failed",
        ),
      );
    }
  });

  server.get<{ Params: { id: string }; Querystring: unknown }>(
    "/api/games/:id/replay",
    async (request, reply) => {
      const parsed = replayQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          errorPayload("invalid_request", "Replay query is invalid", {
            issues: parsed.error.issues,
          }),
        );
      }
      try {
        return replayResponseSchema.parse(
          controller.replay(
            request.params.id,
            parsed.data.playerId,
            parsed.data.branchId,
            parsed.data.omniscient,
          ),
        );
      } catch (error) {
        return sendError(
          reply,
          404,
          errorPayload("unknown_game", error instanceof Error ? error.message : "Unknown game"),
        );
      }
    },
  );

  server.post<{ Params: { id: string } }>("/api/games/:id/branches", async (request, reply) => {
    const parsed = branchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Branch payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    try {
      return branchResponseSchema.parse(
        controller.branch({ gameId: request.params.id, ...parsed.data }),
      );
    } catch (error) {
      return sendError(
        reply,
        409,
        errorPayload(
          "invalid_request",
          error instanceof Error ? error.message : "Branch creation failed",
        ),
      );
    }
  });

  server.get("/api/profile", () => profileSchema.parse(controller.profile(LEARNER_ID)));

  server.patch("/api/profile", async (request, reply) => {
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Profile payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    return profileSchema.parse(controller.patchProfile(LEARNER_ID, parsed.data));
  });

  server.get("/api/profile/mastery", () => ({
    ...masteryResponseSchema.parse({
      learnerId: LEARNER_ID,
      mastery: controller.mastery(LEARNER_ID),
    }),
  }));

  server.get("/api/curriculum", () =>
    curriculumResponseSchema.parse(controller.curriculum(LEARNER_ID)),
  );

  server.get<{ Params: { handId: string } }>("/api/reviews/:handId", (request, reply) => {
    const review = controller.review(request.params.handId);
    if (review === null) {
      return sendError(
        reply,
        404,
        errorPayload("unknown_game", "No saved review exists for that hand"),
      );
    }
    return reviewSchema.parse(review);
  });

  server.post("/api/drills/sessions", async (request, reply) => {
    const parsed = drillSessionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Drill session payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    try {
      return drillSessionResponseSchema.parse(
        controller.createDrillSession(
          parsed.data.learnerId ?? LEARNER_ID,
          (parsed.data.conceptIds ?? []).filter((conceptId): conceptId is ConceptId =>
            CONCEPT_IDS.includes(conceptId as ConceptId),
          ),
        ),
      );
    } catch (error) {
      return sendError(
        reply,
        400,
        errorPayload(
          "invalid_request",
          error instanceof Error ? error.message : "Drill session failed",
        ),
      );
    }
  });

  server.post<{ Params: { id: string } }>(
    "/api/drills/sessions/:id/answers",
    async (request, reply) => {
      const parsed = drillAnswerRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          errorPayload("invalid_request", "Drill answer payload is invalid", {
            issues: parsed.error.issues,
          }),
        );
      }
      try {
        return drillAnswerResponseSchema.parse(
          controller.answerDrill({ sessionId: request.params.id, ...parsed.data }),
        );
      } catch (error) {
        return sendError(
          reply,
          404,
          errorPayload(
            "unknown_game",
            error instanceof Error ? error.message : "Unknown drill session",
          ),
        );
      }
    },
  );

  server.get("/api/export", () => controller.exportData({ includeLlmMetadata: false }));

  server.post("/api/import", async (request, reply) => {
    const parsed = importRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", "Import payload is invalid", {
          issues: parsed.error.issues,
        }),
      );
    }
    try {
      return controller.importData(parsed.data.document, parsed.data.mode ?? "merge");
    } catch (error) {
      return sendError(
        reply,
        400,
        errorPayload("invalid_request", error instanceof Error ? error.message : "Import failed"),
      );
    }
  });

  server.delete("/api/profile/progress", () => {
    controller.resetLearner(LEARNER_ID);
    return { status: "reset" };
  });
  server.post("/api/profile/reset", () => {
    controller.resetLearner(LEARNER_ID);
    return { status: "reset" };
  });

  server.get<{ Params: { id: string }; Querystring: { playerId?: string; branchId?: string } }>(
    "/ws/games/:id",
    { websocket: true },
    (socket, request) => {
      const client = socket as unknown as GameSocket;
      const playerId = request.query.playerId ?? "player-0";
      const branchId = request.query.branchId ?? "main";
      try {
        const observation = controller.observation(request.params.id, playerId, branchId);
        client.send(JSON.stringify({ type: "observation", observation }));
        client.on("message", (raw) => {
          let value: unknown;
          try {
            value = JSON.parse(raw.toString()) as unknown;
            const parsed = actionRequestSchema.parse(value);
            const result = controller.submit({ gameId: request.params.id, ...parsed });
            client.send(
              JSON.stringify(
                result.accepted
                  ? {
                      type: "action_accepted",
                      observation: result.observation,
                      publicEvents: result.publicEvents,
                    }
                  : {
                      type: "action_rejected",
                      observation: result.observation,
                      error: result.error,
                    },
              ),
            );
          } catch (error) {
            client.send(
              JSON.stringify({
                type: "error",
                error: errorPayload(
                  "invalid_request",
                  error instanceof Error ? error.message : "Invalid WebSocket action",
                ),
              }),
            );
          }
        });
      } catch (error) {
        client.send(
          JSON.stringify({
            type: "error",
            error: errorPayload(
              "unknown_game",
              error instanceof Error ? error.message : "Unknown game",
            ),
          }),
        );
        client.close();
      }
    },
  );

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
