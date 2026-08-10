import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestBus } from "./test-bus.js";
import {
  actionResponseSchema,
  actionSubmissionSchema,
  apiErrorResponseSchema,
  FPS_WEBSOCKET_PROTOCOL,
  fpsDiagnosticsSchema,
  fpsErrorSchema,
  fpsInputCommandSchema,
  fpsKickRequestSchema,
  fpsReplaySchema,
  fpsReadyRequestSchema,
  fpsRoomCreateRequestSchema,
  fpsRoomCreateResponseSchema,
  fpsRoomJoinRequestSchema,
  fpsRoomJoinResponseSchema,
  fpsStartRequestSchema,
  fpsSnapshotSchema,
  branchRequestSchema,
  healthResponseSchema,
  hintRequestSchema,
  roomCreateResponseSchema,
  roomJoinResponseSchema,
  roomInspectionResponseSchema,
  roomRulesetSummarySchema,
  roomRulesetsResponseSchema,
  roomStartResponseSchema,
  replayResponseSchema,
  playerObservationSchema,
} from "@hk-mahjong/protocol";
import { FpsMatchService, FpsServiceError, type FpsSocketLike } from "./fps-match.js";
import type { FpsMatchServiceOptions } from "./fps-match.js";
import {
  MultiplayerService,
  MultiplayerServiceError,
  MultiplayerSocketHub,
  parseGameIdPath,
  parseGameQuery,
  parseRoomCreateRequest,
  parseRoomIdPath,
  parseRoomJoinRequest,
  parseRoomStartRequest,
  parseWebSocketQuery,
  type MultiplayerServiceOptions,
  type MultiplayerSocketLike,
} from "./multiplayer.js";

const HOST = "0.0.0.0";
const PORT = 4173;

export interface ServerOptions {
  readonly multiplayer?: MultiplayerService;
  readonly multiplayerOptions?: MultiplayerServiceOptions;
  readonly fps?: FpsMatchService;
  readonly fpsOptions?: FpsMatchServiceOptions;
}

const errorResponse = (reply: FastifyReply, caught: unknown): FastifyReply => {
  if (caught instanceof MultiplayerServiceError) {
    return reply
      .code(caught.statusCode)
      .send(apiErrorResponseSchema.parse({ error: caught.payload }));
  }
  if (caught instanceof Error) {
    return reply.code(400).send(
      apiErrorResponseSchema.parse({
        error: {
          code: "invalid_request",
          message: "The request body or query is invalid",
          details: { reason: caught.message },
        },
      }),
    );
  }
  return reply.code(400).send(
    apiErrorResponseSchema.parse({
      error: {
        code: "invalid_request",
        message: "The request is invalid",
        details: {},
      },
    }),
  );
};

const fpsErrorResponse = (reply: FastifyReply, caught: unknown): FastifyReply => {
  if (caught instanceof FpsServiceError) {
    return reply.code(caught.statusCode).send(
      fpsErrorSchema.parse({
        code: caught.code,
        message: caught.message,
        details: caught.details,
      }),
    );
  }
  if (caught instanceof Error) {
    return reply
      .code(400)
      .send(
        fpsErrorSchema.parse({ code: "invalid_request", message: caught.message, details: {} }),
      );
  }
  return reply.code(400).send(
    fpsErrorSchema.parse({
      code: "invalid_request",
      message: "The FPS request is invalid",
      details: {},
    }),
  );
};

const bearerOrQueryTicket = (request: {
  headers: { authorization?: string | undefined };
  query: unknown;
}): string | undefined => {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const ticket = authorization.slice("Bearer ".length).trim();
    if (ticket.length > 0) {
      return ticket;
    }
  }
  if (
    typeof request.query === "object" &&
    request.query !== null &&
    !Array.isArray(request.query)
  ) {
    const queryTicket = (request.query as Record<string, unknown>).ticket;
    return typeof queryTicket === "string" ? queryTicket : undefined;
  }
  return undefined;
};

const bearerTicketOnly = (request: {
  headers: { authorization?: string | undefined };
}): string | undefined => {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return undefined;
  const ticket = authorization.slice("Bearer ".length).trim();
  return ticket.length > 0 ? ticket : undefined;
};

const splitWebSocketProtocolHeader = (header: unknown): readonly string[] => {
  const values = Array.isArray(header) ? header : [header];
  return values.flatMap((value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((protocol) => protocol.trim())
          .filter((protocol) => protocol.length > 0)
      : [],
  );
};

/** Extract the FPS ticket from the offered subprotocols without accepting a URL query ticket. */
export const fpsWebSocketTicketFromProtocolHeader = (header: unknown): string | undefined => {
  const protocols = splitWebSocketProtocolHeader(header);
  if (protocols.length !== 2) return undefined;
  if (protocols.filter((protocol) => protocol === FPS_WEBSOCKET_PROTOCOL).length !== 1) {
    return undefined;
  }
  const ticket = protocols.find((protocol) => protocol !== FPS_WEBSOCKET_PROTOCOL);
  return ticket === undefined || ticket.length === 0 ? undefined : ticket;
};

export const selectFpsWebSocketProtocol = (protocols: ReadonlySet<string>): string =>
  protocols.has(FPS_WEBSOCKET_PROTOCOL) ? FPS_WEBSOCKET_PROTOCOL : "";

export const buildServer = async (options: ServerOptions = {}): Promise<FastifyInstance> => {
  const server = Fastify({ logger: false });
  const service = options.multiplayer ?? new MultiplayerService(options.multiplayerOptions);
  const ownsService = options.multiplayer === undefined;
  const socketHub = new MultiplayerSocketHub(service);
  const fpsService =
    options.fps ??
    new FpsMatchService({ databasePath: ".data/coach.sqlite", ...options.fpsOptions });
  fpsService.startClock();

  await server.register(websocket, {
    options: {
      // The ticket is an offered credential, not an application protocol. Always select only the
      // stable FPS protocol so a raw ticket is never echoed in the 101 response.
      handleProtocols: (protocols: Set<string>) => selectFpsWebSocketProtocol(protocols),
    },
  });
  server.setErrorHandler((error, _request, reply) => {
    const fastifyError = error as {
      readonly statusCode?: unknown;
      readonly code?: unknown;
    };
    const statusCode =
      typeof fastifyError.statusCode === "number" &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 600
        ? fastifyError.statusCode
        : 400;
    const reason =
      fastifyError.code === "FST_ERR_CTP_INVALID_JSON_BODY" ? "invalid_json" : "request_error";
    return reply.code(statusCode).send(
      apiErrorResponseSchema.parse({
        error: {
          code: "invalid_request",
          message: "The request body or query is invalid",
          details: { reason },
        },
      }),
    );
  });
  server.addHook("onClose", () => {
    if (ownsService) {
      service.close();
    }
    if (options.fps === undefined) {
      fpsService.close();
    }
  });
  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/fps/")) return;
    try {
      fpsService.assertOrigin(request.headers.origin, false);
    } catch (caught) {
      await fpsErrorResponse(reply, caught);
    }
  });

  server.get("/api/health", () =>
    healthResponseSchema.parse({ status: "ready", schemaVersion: 1 }),
  );

  server.get("/api/rulesets", () =>
    roomRulesetsResponseSchema.parse({ rulesets: service.listRulesets() }),
  );
  server.get("/api/rulesets/:id", (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    const ruleset = service.listRulesets().find((candidate) => candidate.id === id);
    if (ruleset === undefined) {
      return reply.code(404).send(
        apiErrorResponseSchema.parse({
          error: {
            code: "invalid_request",
            message: "Ruleset not found",
            details: { reason: "ruleset_not_found" },
          },
        }),
      );
    }
    return reply.send(roomRulesetSummarySchema.parse(ruleset));
  });

  server.post("/api/fps/rooms", (request, reply) => {
    try {
      fpsService.assertHttpRateLimit(request.ip, "create");
      const response = fpsRoomCreateResponseSchema.parse(
        fpsService.createRoom(fpsRoomCreateRequestSchema.parse(request.body)),
      );
      return reply.code(201).send(response);
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/fps/rooms/:matchId/join", (request, reply) => {
    try {
      fpsService.assertHttpRateLimit(request.ip, "join");
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      if (typeof matchId !== "string" || matchId.length === 0) {
        throw new FpsServiceError("invalid_request", "The FPS match ID is invalid");
      }
      const response = fpsRoomJoinResponseSchema.parse(
        fpsService.joinRoom(
          matchId,
          fpsRoomJoinRequestSchema.parse(request.body),
          bearerTicketOnly(request),
        ),
      );
      return reply.send(response);
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/fps/matches/:matchId/ready", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const body = fpsReadyRequestSchema.parse(request.body);
      const playerId = body.playerId;
      const ticket = bearerTicketOnly(request);
      if (typeof matchId !== "string" || typeof playerId !== "string" || ticket === undefined) {
        throw new FpsServiceError("invalid_ticket", "A player ticket is required", {}, 401);
      }
      return reply.send(
        fpsSnapshotSchema.parse(fpsService.ready(matchId, playerId, ticket, body.requestId)),
      );
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/fps/matches/:matchId/start", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const body = fpsStartRequestSchema.parse(request.body);
      const playerId = body.playerId;
      const ticket = bearerTicketOnly(request);
      if (typeof matchId !== "string" || typeof playerId !== "string" || ticket === undefined) {
        throw new FpsServiceError("invalid_ticket", "An owner ticket is required", {}, 401);
      }
      return reply.send(
        fpsSnapshotSchema.parse(fpsService.start(matchId, playerId, ticket, body.requestId)),
      );
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.get("/api/fps/matches/:matchId/snapshot", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const query = request.query as {
        readonly playerId?: unknown;
        readonly fromTick?: unknown;
        readonly full?: unknown;
      };
      const ticket = bearerTicketOnly(request);
      if (
        typeof matchId !== "string" ||
        typeof query.playerId !== "string" ||
        ticket === undefined
      ) {
        throw new FpsServiceError("invalid_ticket", "A player ticket is required", {}, 401);
      }
      const fromTick = typeof query.fromTick === "string" ? Number(query.fromTick) : 0;
      const full = query.full !== "false";
      return reply.send(
        fpsSnapshotSchema.parse(
          fpsService.getSnapshot(matchId, query.playerId, ticket, full, fromTick),
        ),
      );
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/fps/matches/:matchId/input", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const ticket = bearerTicketOnly(request);
      if (typeof matchId !== "string" || ticket === undefined) {
        throw new FpsServiceError("invalid_ticket", "A player ticket is required", {}, 401);
      }
      const input = fpsInputCommandSchema.parse(request.body);
      fpsService.assertInputHttpRateLimit(matchId, input.playerId, ticket, request.ip);
      return reply.send(
        fpsSnapshotSchema.parse(fpsService.submitInput(matchId, input.playerId, ticket, input)),
      );
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.get("/api/fps/matches/:matchId/replay", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const playerId = (request.query as { readonly playerId?: unknown }).playerId;
      const ticket = bearerTicketOnly(request);
      if (typeof matchId !== "string" || typeof playerId !== "string" || ticket === undefined) {
        throw new FpsServiceError("invalid_ticket", "A player ticket is required", {}, 401);
      }
      return reply.send(fpsReplaySchema.parse(fpsService.getReplay(matchId, playerId, ticket)));
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/fps/matches/:matchId/close", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const playerId = (request.body as { readonly playerId?: unknown }).playerId;
      const ticket = bearerTicketOnly(request);
      if (typeof matchId !== "string" || typeof playerId !== "string" || ticket === undefined) {
        throw new FpsServiceError("invalid_ticket", "A player ticket is required", {}, 401);
      }
      return reply.send(fpsSnapshotSchema.parse(fpsService.closeRoom(matchId, playerId, ticket)));
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/fps/matches/:matchId/kick", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const body = fpsKickRequestSchema.parse(request.body);
      const ticket = bearerTicketOnly(request);
      if (typeof matchId !== "string" || ticket === undefined) {
        throw new FpsServiceError("invalid_ticket", "A room owner ticket is required", {}, 401);
      }
      return reply.send(
        fpsSnapshotSchema.parse(
          fpsService.kickPlayer(matchId, body.playerId, ticket, body.targetPlayerId),
        ),
      );
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.get("/api/fps/matches/:matchId/diagnostics", (request, reply) => {
    try {
      const matchId = (request.params as { readonly matchId?: unknown }).matchId;
      const query = request.query as { readonly playerId?: unknown };
      const ticket = bearerTicketOnly(request);
      if (
        typeof matchId !== "string" ||
        typeof query.playerId !== "string" ||
        ticket === undefined
      ) {
        throw new FpsServiceError("invalid_ticket", "A player ticket is required", {}, 401);
      }
      return reply.send(
        fpsDiagnosticsSchema.parse(fpsService.getDiagnostics(matchId, query.playerId, ticket)),
      );
    } catch (caught) {
      return fpsErrorResponse(reply, caught);
    }
  });

  server.post("/api/rooms", (request, reply) => {
    try {
      const response = roomCreateResponseSchema.parse(
        service.createRoom(parseRoomCreateRequest(request.body)),
      );
      return reply.code(201).send(response);
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.post("/api/rooms/:roomId/join", (request, reply) => {
    try {
      const roomId = parseRoomIdPath(request.params);
      const response = roomJoinResponseSchema.parse(
        service.joinRoom(roomId, parseRoomJoinRequest(request.body), bearerOrQueryTicket(request)),
      );
      return reply.code(200).send(response);
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.get("/api/rooms/:roomId", (request, reply) => {
    try {
      const response = roomInspectionResponseSchema.parse(
        service.inspectRoom(parseRoomIdPath(request.params)),
      );
      return reply.send(response);
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.post("/api/rooms/:roomId/close", (request, reply) => {
    try {
      const roomId = parseRoomIdPath(request.params);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "An owner ticket is required",
          { reason: "invalid_ticket" },
          401,
        );
      }
      return reply.send(roomInspectionResponseSchema.parse(service.closeRoom(roomId, ticket)));
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.post("/api/rooms/:roomId/start", (request, reply) => {
    try {
      const roomId = parseRoomIdPath(request.params);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "An owner ticket is required",
          { reason: "invalid_ticket" },
          401,
        );
      }
      const startRequest = parseRoomStartRequest(request.body);
      const response = roomStartResponseSchema.parse(
        service.startRoom(roomId, ticket, startRequest.requestId),
      );
      return reply.send(response);
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.get("/api/games/:gameId/observation", (request, reply) => {
    try {
      const gameId = parseGameIdPath(request.params);
      const query = parseGameQuery(request.query);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "A room ticket is required",
          {
            reason: "invalid_ticket",
          },
          401,
        );
      }
      return reply.send(
        playerObservationSchema.parse(
          service.getObservation(gameId, query.playerId, query.branchId, ticket),
        ),
      );
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.post("/api/games/:gameId/actions", (request, reply) => {
    try {
      const gameId = parseGameIdPath(request.params);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "A room ticket is required",
          {
            reason: "invalid_ticket",
          },
          401,
        );
      }
      const action = actionSubmissionSchema.parse(request.body);
      const result = service.submitAction({
        ...action,
        gameId,
        ticket,
      });
      const botResults = service.advanceBotTurns(gameId);
      socketHub.publishActionResult(result, botResults);
      return reply.send(
        actionResponseSchema.parse({
          accepted: true,
          observation: service.getObservation(gameId, action.playerId, action.branchId, ticket),
          publicEvents: [
            ...result.publicEvents,
            ...botResults.flatMap(({ publicEvents }) => publicEvents),
          ],
        }),
      );
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.get("/api/games/:gameId/replay", (request, reply) => {
    try {
      const gameId = parseGameIdPath(request.params);
      const query = parseGameQuery(request.query);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "A room ticket is required",
          {
            reason: "invalid_ticket",
          },
          401,
        );
      }
      return reply.send(
        replayResponseSchema.parse(
          service.getReplay(gameId, query.playerId, query.branchId, ticket),
        ),
      );
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  // Multiplayer rooms are always competitive in protocol v1. Keep the canonical game surfaces
  // explicit and authenticated, while refusing practice/coaching operations until a room mode
  // opts into them instead of silently falling through to the browser shell.
  server.post("/api/games/:gameId/branches", (request, reply) => {
    try {
      const gameId = parseGameIdPath(request.params);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "A room ticket is required",
          { reason: "invalid_ticket" },
          401,
        );
      }
      const branch = branchRequestSchema.parse(request.body);
      service.authenticateGame(gameId, branch.parentBranchId, branch.playerId, ticket);
      throw new MultiplayerServiceError(
        "action_not_legal",
        "Practice branches are disabled for competitive rooms",
        { reason: "unsupported_room_action" },
        409,
      );
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.post("/api/games/:gameId/hints", (request, reply) => {
    try {
      const gameId = parseGameIdPath(request.params);
      const ticket = bearerOrQueryTicket(request);
      if (ticket === undefined) {
        throw new MultiplayerServiceError(
          "invalid_request",
          "A room ticket is required",
          { reason: "invalid_ticket" },
          401,
        );
      }
      const hint = hintRequestSchema.parse(request.body);
      service.authenticateGame(gameId, hint.branchId, hint.playerId, ticket);
      throw new MultiplayerServiceError(
        "invalid_request",
        "Coaching hints are disabled for competitive rooms",
        { reason: "unsupported_room_action" },
        409,
      );
    } catch (caught) {
      return errorResponse(reply, caught);
    }
  });

  server.get("/ws/games/:gameId", { websocket: true }, (socket, request) => {
    const clientSocket = socket as unknown as MultiplayerSocketLike;
    const websocketRequest = request as unknown as {
      readonly params: unknown;
      readonly query: unknown;
      readonly headers: {
        readonly authorization?: string;
        readonly origin?: string | readonly string[];
      };
    };
    try {
      const gameId = parseGameIdPath(websocketRequest.params);
      const query = parseWebSocketQuery(websocketRequest.query);
      const ticket = query.ticket ?? bearerOrQueryTicket(websocketRequest);
      if (ticket === undefined) {
        clientSocket.close(1008, "invalid_ticket");
        return;
      }
      const originHeader = websocketRequest.headers.origin;
      const origin = typeof originHeader === "string" ? originHeader : undefined;
      socketHub.attach(clientSocket, {
        gameId,
        playerId: query.playerId,
        branchId: query.branchId,
        ticket,
        fromRevision: query.fromRevision,
        ...(origin === undefined ? {} : { origin }),
      });
    } catch {
      clientSocket.close(1008, "invalid_request");
    }
  });

  server.get("/ws/fps/:matchId", { websocket: true }, (socket, request) => {
    const websocketRequest = request as unknown as {
      readonly params: unknown;
      readonly query: unknown;
      readonly headers: {
        readonly origin?: string | readonly string[];
        readonly "sec-websocket-protocol"?: string | readonly string[];
      };
      readonly ip?: string;
    };
    const params = websocketRequest.params as { readonly matchId?: unknown };
    const query = websocketRequest.query as {
      readonly playerId?: unknown;
      readonly ticket?: unknown;
    };
    const ticket = fpsWebSocketTicketFromProtocolHeader(
      websocketRequest.headers["sec-websocket-protocol"],
    );
    if (
      typeof params.matchId !== "string" ||
      typeof query.playerId !== "string" ||
      query.ticket !== undefined ||
      ticket === undefined
    ) {
      (socket as unknown as FpsSocketLike).close(1008, "invalid_request");
      return;
    }
    try {
      const fpsSocket = socket as unknown as FpsSocketLike;
      const originHeader = websocketRequest.headers.origin;
      const origin = typeof originHeader === "string" ? originHeader : undefined;
      fpsService.attachSocket(
        fpsSocket,
        params.matchId,
        query.playerId,
        ticket,
        origin,
        websocketRequest.ip ?? "socket",
      );
    } catch (caught) {
      const reason = caught instanceof FpsServiceError ? caught.code : "invalid_ticket";
      (socket as unknown as FpsSocketLike).close(1008, reason);
    }
  });

  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(moduleDirectory, "../../web/dist");

  try {
    await access(webRoot);
    await server.register(staticFiles, {
      root: webRoot,
    });
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/ws/")) {
        return reply.code(404).send(
          apiErrorResponseSchema.parse({
            error: {
              code: "invalid_request",
              message: "The requested endpoint was not found",
              details: { reason: "not_found" },
            },
          }),
        );
      }
      return reply.sendFile("index.html");
    });
  } catch {
    server.get("/", (_request, reply) =>
      reply
        .type("text/html")
        .send("<main><h1>Hong Kong Mahjong Coach</h1><p>Build the web app to begin.</p></main>"),
    );
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/ws/")) {
        return reply.code(404).send(
          apiErrorResponseSchema.parse({
            error: {
              code: "invalid_request",
              message: "The requested endpoint was not found",
              details: { reason: "not_found" },
            },
          }),
        );
      }
      return reply.code(404).send("Not found");
    });
  }

  return server;
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const server = await buildServer();
  const testBus = await startTestBus();
  server.addHook("onClose", () => {
    testBus.stop();
  });
  try {
    await server.listen({ host: HOST, port: PORT });
  } catch (error) {
    testBus.stop();
    throw error;
  }
}
