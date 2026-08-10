import {
  actionResponseSchema,
  actionSubmissionSchema,
  apiErrorResponseSchema,
  branchRequestSchema,
  healthResponseSchema,
  hintRequestSchema,
  roomCreateResponseSchema,
  roomJoinResponseSchema,
  roomInspectionResponseSchema,
  roomRulesetSummarySchema,
  roomRulesetsResponseSchema,
  roomStartResponseSchema,
  roomStartRequestSchema,
  replayResponseSchema,
  playerObservationSchema,
} from "@hk-mahjong/protocol";
import {
  MultiplayerServiceError,
  MultiplayerSocketHub,
  parseGameIdPath,
  parseGameQuery,
  parseRoomCreateRequest,
  parseRoomIdPath,
  parseRoomJoinRequest,
  parseRoomStartRequest,
  parseWebSocketQuery,
  type MultiplayerSocketLike,
} from "./multiplayer.js";
import type { MultiplayerService } from "./multiplayer.js";
import {
  DenoMultiplayerServiceError,
  DenoMultiplayerSocketHub,
  type DenoSocketLike,
} from "./deno-multiplayer.js";
import type { DenoMultiplayerService } from "./deno-multiplayer.js";

/** The small runtime surface used by Deno.serve; tests can inject a deterministic fake. */
export interface DenoServerRuntime {
  serve(
    options: { readonly port?: number; readonly hostname?: string },
    handler: (request: Request) => Response | Promise<Response>,
  ): unknown;
  upgradeWebSocket(request: Request): {
    readonly socket: DenoRuntimeSocket;
    readonly response: Response;
  };
}

export interface DenoRuntimeSocket {
  addEventListener(event: string, listener: (event: { readonly data?: unknown }) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const globalDenoRuntime = (): DenoServerRuntime => {
  const runtime = (globalThis as unknown as { Deno?: DenoServerRuntime }).Deno;
  if (runtime === undefined) {
    throw new Error("Deno.serve is only available in the Deno runtime");
  }
  return runtime;
};

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const ticketFromRequest = (request: Request, url: URL): string | undefined => {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const ticket = authorization.slice("Bearer ".length).trim();
    if (ticket.length > 0) {
      return ticket;
    }
  }
  const ticket = url.searchParams.get("ticket");
  return ticket === null || ticket.length === 0 ? undefined : ticket;
};

const errorPayload = (caught: unknown): { readonly status: number; readonly body: unknown } => {
  if (caught instanceof MultiplayerServiceError) {
    return {
      status: caught.statusCode,
      body: apiErrorResponseSchema.parse({ error: caught.payload }),
    };
  }
  return {
    status: 400,
    body: apiErrorResponseSchema.parse({
      error: {
        code: "invalid_request",
        message: "The request body or query is invalid",
        details: { reason: caught instanceof Error ? caught.message : "invalid_request" },
      },
    }),
  };
};

const readJson = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  return text.trim().length === 0 ? {} : (JSON.parse(text) as unknown);
};

class DenoSocketAdapter implements MultiplayerSocketLike {
  public constructor(private readonly socket: DenoRuntimeSocket) {}

  public send(data: string): void {
    this.socket.send(data);
  }

  public close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  public on(event: string, listener: (...arguments_: unknown[]) => void): void {
    this.socket.addEventListener(event, (message) => {
      if (event === "message") {
        listener(message.data, typeof message.data !== "string");
      } else {
        listener(message);
      }
    });
  }
}

class DenoAsyncSocketAdapter implements DenoSocketLike {
  public constructor(private readonly socket: DenoRuntimeSocket) {}

  public send(data: string): void {
    this.socket.send(data);
  }

  public close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  public on(event: string, listener: (...arguments_: unknown[]) => void): void {
    this.socket.addEventListener(event, (message) => {
      if (event === "message") {
        listener(message.data, typeof message.data !== "string");
      } else {
        listener(message);
      }
    });
  }
}

/** Creates the server-authoritative HTTP/WebSocket handler for Deno.serve. */
export const createDenoHandler = (
  service: MultiplayerService,
  runtime?: DenoServerRuntime,
): ((request: Request) => Promise<Response>) => {
  const socketHub = new MultiplayerSocketHub(service);
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(healthResponseSchema.parse({ status: "ready", schemaVersion: 1 }));
    }
    try {
      if (pathname === "/api/rulesets" && request.method === "GET") {
        return jsonResponse(roomRulesetsResponseSchema.parse({ rulesets: service.listRulesets() }));
      }
      const rulesetMatch = /^\/api\/rulesets\/([^/]+)$/u.exec(pathname);
      if (rulesetMatch !== null && request.method === "GET") {
        const ruleset = service
          .listRulesets()
          .find(({ id }) => id === decodeURIComponent(rulesetMatch[1]!));
        return ruleset === undefined
          ? jsonResponse(
              apiErrorResponseSchema.parse({
                error: {
                  code: "invalid_request",
                  message: "Ruleset not found",
                  details: { reason: "ruleset_not_found" },
                },
              }),
              404,
            )
          : jsonResponse(roomRulesetSummarySchema.parse(ruleset));
      }
      if (pathname === "/api/rooms" && request.method === "POST") {
        const response = roomCreateResponseSchema.parse(
          service.createRoom(parseRoomCreateRequest(await readJson(request))),
        );
        return jsonResponse(response, 201);
      }
      const roomMatch = /^\/api\/rooms\/([^/]+)$/u.exec(pathname);
      if (roomMatch !== null && request.method === "GET") {
        return jsonResponse(
          roomInspectionResponseSchema.parse(
            service.inspectRoom(parseRoomIdPath({ roomId: decodeURIComponent(roomMatch[1]!) })),
          ),
        );
      }
      const closeMatch = /^\/api\/rooms\/([^/]+)\/close$/u.exec(pathname);
      if (closeMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "An owner ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        return jsonResponse(
          roomInspectionResponseSchema.parse(
            service.closeRoom(decodeURIComponent(closeMatch[1]!), ticket),
          ),
        );
      }
      const joinMatch = /^\/api\/rooms\/([^/]+)\/join$/u.exec(pathname);
      if (joinMatch !== null && request.method === "POST") {
        const roomId = decodeURIComponent(joinMatch[1]!);
        const response = roomJoinResponseSchema.parse(
          service.joinRoom(
            roomId,
            parseRoomJoinRequest(await readJson(request)),
            ticketFromRequest(request, url),
          ),
        );
        return jsonResponse(response);
      }
      const startMatch = /^\/api\/rooms\/([^/]+)\/start$/u.exec(pathname);
      if (startMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "An owner ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const response = roomStartResponseSchema.parse(
          service.startRoom(
            decodeURIComponent(startMatch[1]!),
            ticket,
            parseRoomStartRequest(await readJson(request)).requestId,
          ),
        );
        return jsonResponse(response);
      }
      const gameObservationMatch = /^\/api\/games\/([^/]+)\/observation$/u.exec(pathname);
      if (gameObservationMatch !== null && request.method === "GET") {
        const query = parseGameQuery(Object.fromEntries(url.searchParams.entries()));
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        return jsonResponse(
          playerObservationSchema.parse(
            service.getObservation(
              parseGameIdPath({ gameId: decodeURIComponent(gameObservationMatch[1]!) }),
              query.playerId,
              query.branchId,
              ticket,
            ),
          ),
        );
      }
      const gameActionsMatch = /^\/api\/games\/([^/]+)\/actions$/u.exec(pathname);
      if (gameActionsMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const action = actionSubmissionSchema.parse(await readJson(request));
        const gameId = decodeURIComponent(gameActionsMatch[1]!);
        const result = service.submitAction({
          ...action,
          gameId,
          ticket,
        });
        const botResults = service.advanceBotTurns(gameId);
        return jsonResponse(
          actionResponseSchema.parse({
            accepted: true,
            observation: service.getObservation(gameId, action.playerId, action.branchId, ticket),
            publicEvents: [
              ...result.publicEvents,
              ...botResults.flatMap(({ publicEvents }) => publicEvents),
            ],
          }),
        );
      }
      const gameReplayMatch = /^\/api\/games\/([^/]+)\/replay$/u.exec(pathname);
      if (gameReplayMatch !== null && request.method === "GET") {
        const query = parseGameQuery(Object.fromEntries(url.searchParams.entries()));
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        return jsonResponse(
          replayResponseSchema.parse(
            service.getReplay(
              decodeURIComponent(gameReplayMatch[1]!),
              query.playerId,
              query.branchId,
              ticket,
            ),
          ),
        );
      }
      const gameBranchMatch = /^\/api\/games\/([^/]+)\/branches$/u.exec(pathname);
      if (gameBranchMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const branch = branchRequestSchema.parse(await readJson(request));
        service.authenticateGame(
          decodeURIComponent(gameBranchMatch[1]!),
          branch.parentBranchId,
          branch.playerId,
          ticket,
        );
        throw new MultiplayerServiceError(
          "action_not_legal",
          "Practice branches are disabled for competitive rooms",
          { reason: "unsupported_room_action" },
          409,
        );
      }
      const gameHintMatch = /^\/api\/games\/([^/]+)\/hints$/u.exec(pathname);
      if (gameHintMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new MultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const hint = hintRequestSchema.parse(await readJson(request));
        service.authenticateGame(
          decodeURIComponent(gameHintMatch[1]!),
          hint.branchId,
          hint.playerId,
          ticket,
        );
        throw new MultiplayerServiceError(
          "invalid_request",
          "Coaching hints are disabled for competitive rooms",
          { reason: "unsupported_room_action" },
          409,
        );
      }
      const wsMatch = /^\/ws\/games\/([^/]+)$/u.exec(pathname);
      if (
        wsMatch !== null &&
        request.method === "GET" &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const query = parseWebSocketQuery(Object.fromEntries(url.searchParams.entries()));
        const ticket = query.ticket ?? ticketFromRequest(request, url);
        if (ticket === undefined) {
          return new Response(null, { status: 401 });
        }
        const origin = request.headers.get("origin") ?? undefined;
        if (!service.allowsOrigin(origin)) {
          return new Response(null, { status: 403 });
        }
        const gameId = decodeURIComponent(wsMatch[1]!);
        service.authenticateGame(gameId, query.branchId, query.playerId, ticket);
        const upgraded = (runtime ?? globalDenoRuntime()).upgradeWebSocket(request);
        socketHub.attach(new DenoSocketAdapter(upgraded.socket), {
          gameId,
          playerId: query.playerId,
          branchId: query.branchId,
          ticket,
          fromRevision: query.fromRevision,
          ...(origin === undefined ? {} : { origin }),
        });
        return upgraded.response;
      }
      return new Response("Not found", { status: 404 });
    } catch (caught) {
      const error = errorPayload(caught);
      return jsonResponse(error.body, error.status);
    }
  };
};

/** Starts a Deno listener. No ticket or query string is logged by this entry point. */
export const serveDeno = (
  service: MultiplayerService,
  options: { readonly port?: number; readonly hostname?: string } = {},
  runtime: DenoServerRuntime = globalDenoRuntime(),
): unknown => runtime.serve(options, createDenoHandler(service, runtime));

const denoErrorPayload = (caught: unknown): { readonly status: number; readonly body: unknown } => {
  if (caught instanceof DenoMultiplayerServiceError) {
    return {
      status: caught.statusCode,
      body: apiErrorResponseSchema.parse({ error: caught.payload }),
    };
  }
  return errorPayload(caught);
};

/** Creates the real asynchronous Deno/KV room handler described by multiplayer-spec.md. */
export const createDenoKvHandler = (
  service: DenoMultiplayerService,
  runtime?: DenoServerRuntime,
): ((request: Request) => Promise<Response>) => {
  const socketHub = new DenoMultiplayerSocketHub(service);
  socketHub.startNotificationPump();
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(healthResponseSchema.parse({ status: "ready", schemaVersion: 1 }));
    }
    try {
      if (pathname === "/api/rulesets" && request.method === "GET") {
        return jsonResponse(roomRulesetsResponseSchema.parse({ rulesets: service.listRulesets() }));
      }
      const rulesetMatch = /^\/api\/rulesets\/([^/]+)$/u.exec(pathname);
      if (rulesetMatch !== null && request.method === "GET") {
        const ruleset = service
          .listRulesets()
          .find(({ id }) => id === decodeURIComponent(rulesetMatch[1]!));
        return ruleset === undefined
          ? jsonResponse(
              apiErrorResponseSchema.parse({
                error: {
                  code: "invalid_request",
                  message: "Ruleset not found",
                  details: { reason: "ruleset_not_found" },
                },
              }),
              404,
            )
          : jsonResponse(roomRulesetSummarySchema.parse(ruleset));
      }
      if (pathname === "/api/rooms" && request.method === "POST") {
        const response = roomCreateResponseSchema.parse(
          await service.createRoom(parseRoomCreateRequest(await readJson(request))),
        );
        return jsonResponse(response, 201);
      }
      const roomMatch = /^\/api\/rooms\/([^/]+)$/u.exec(pathname);
      if (roomMatch !== null && request.method === "GET") {
        return jsonResponse(
          roomInspectionResponseSchema.parse(
            await service.inspectRoom(decodeURIComponent(roomMatch[1]!)),
          ),
        );
      }
      const closeMatch = /^\/api\/rooms\/([^/]+)\/close$/u.exec(pathname);
      if (closeMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "An owner ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        return jsonResponse(
          roomInspectionResponseSchema.parse(
            await service.closeRoom(decodeURIComponent(closeMatch[1]!), ticket),
          ),
        );
      }
      const joinMatch = /^\/api\/rooms\/([^/]+)\/join$/u.exec(pathname);
      if (joinMatch !== null && request.method === "POST") {
        const roomId = decodeURIComponent(joinMatch[1]!);
        return jsonResponse(
          roomJoinResponseSchema.parse(
            await service.joinRoom(
              roomId,
              parseRoomJoinRequest(await readJson(request)),
              ticketFromRequest(request, url),
            ),
          ),
        );
      }
      const startMatch = /^\/api\/rooms\/([^/]+)\/start$/u.exec(pathname);
      if (startMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "An owner ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const roomId = decodeURIComponent(startMatch[1]!);
        const body = roomStartRequestSchemaForDeno(await readJson(request), roomId);
        return jsonResponse(
          roomStartResponseSchema.parse(await service.startRoom(roomId, ticket, body)),
        );
      }
      const gameObservationMatch = /^\/api\/games\/([^/]+)\/observation$/u.exec(pathname);
      if (gameObservationMatch !== null && request.method === "GET") {
        const query = parseGameQuery(Object.fromEntries(url.searchParams.entries()));
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        return jsonResponse(
          playerObservationSchema.parse(
            await service.getObservation(
              decodeURIComponent(gameObservationMatch[1]!),
              query.playerId,
              query.branchId,
              ticket,
            ),
          ),
        );
      }
      const gameActionsMatch = /^\/api\/games\/([^/]+)\/actions$/u.exec(pathname);
      if (gameActionsMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const action = actionSubmissionSchema.parse(await readJson(request));
        const result = await service.submitAction({
          ...action,
          gameId: decodeURIComponent(gameActionsMatch[1]!),
          ticket,
        });
        const botResults = await service.advanceBotTurns(result.key.gameId);
        const observation = await service.getObservation(
          result.key.gameId,
          action.playerId,
          action.branchId,
          ticket,
        );
        return jsonResponse(
          actionResponseSchema.parse({
            accepted: true,
            observation,
            publicEvents: [
              ...result.publicEvents,
              ...botResults.flatMap(({ publicEvents }) => publicEvents),
            ],
          }),
        );
      }
      const gameReplayMatch = /^\/api\/games\/([^/]+)\/replay$/u.exec(pathname);
      if (gameReplayMatch !== null && request.method === "GET") {
        const query = parseGameQuery(Object.fromEntries(url.searchParams.entries()));
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        return jsonResponse(
          replayResponseSchema.parse(
            await service.getReplay(
              decodeURIComponent(gameReplayMatch[1]!),
              query.playerId,
              query.branchId,
              ticket,
            ),
          ),
        );
      }
      const gameBranchMatch = /^\/api\/games\/([^/]+)\/branches$/u.exec(pathname);
      if (gameBranchMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const branch = branchRequestSchema.parse(await readJson(request));
        await service.authenticateGame(
          decodeURIComponent(gameBranchMatch[1]!),
          branch.parentBranchId,
          branch.playerId,
          ticket,
        );
        throw new DenoMultiplayerServiceError(
          "action_not_legal",
          "Practice branches are disabled for competitive rooms",
          { reason: "unsupported_room_action" },
          409,
        );
      }
      const gameHintMatch = /^\/api\/games\/([^/]+)\/hints$/u.exec(pathname);
      if (gameHintMatch !== null && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const hint = hintRequestSchema.parse(await readJson(request));
        await service.authenticateGame(
          decodeURIComponent(gameHintMatch[1]!),
          hint.branchId,
          hint.playerId,
          ticket,
        );
        throw new DenoMultiplayerServiceError(
          "invalid_request",
          "Coaching hints are disabled for competitive rooms",
          { reason: "unsupported_room_action" },
          409,
        );
      }
      const wsMatch = /^\/ws\/games\/([^/]+)$/u.exec(pathname);
      if (
        wsMatch !== null &&
        request.method === "GET" &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const query = parseWebSocketQuery(Object.fromEntries(url.searchParams.entries()));
        const ticket = query.ticket ?? ticketFromRequest(request, url);
        if (ticket === undefined) {
          return new Response(null, { status: 401 });
        }
        const origin = request.headers.get("origin") ?? undefined;
        if (!service.allowsOrigin(origin)) {
          return new Response(null, { status: 403 });
        }
        const gameId = decodeURIComponent(wsMatch[1]!);
        await service.authenticateGame(gameId, query.branchId, query.playerId, ticket);
        const upgraded = (runtime ?? globalDenoRuntime()).upgradeWebSocket(request);
        void socketHub.attach(new DenoAsyncSocketAdapter(upgraded.socket), {
          gameId,
          playerId: query.playerId,
          branchId: query.branchId,
          ticket,
          fromRevision: query.fromRevision,
          ...(origin === undefined ? {} : { origin }),
        });
        return upgraded.response;
      }
      return new Response("Not found", { status: 404 });
    } catch (caught) {
      const error = denoErrorPayload(caught);
      return jsonResponse(error.body, error.status);
    }
  };
};

const roomStartRequestSchemaForDeno = (value: unknown, roomId: string): string => {
  const parsed = roomStartRequestSchema.parse(value);
  return parsed.requestId ?? `start:${roomId}`;
};

/** Starts the Deno KV server. The raw ticket and query string never enter this function's logs. */
export const serveDenoKv = (
  service: DenoMultiplayerService,
  options: { readonly port?: number; readonly hostname?: string } = {},
  runtime: DenoServerRuntime = globalDenoRuntime(),
): unknown => runtime.serve(options, createDenoKvHandler(service, runtime));
