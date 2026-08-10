import {
  actionResponseSchema,
  actionSubmissionSchema,
  apiErrorResponseSchema,
  branchRequestSchema,
  healthResponseSchema,
  hintRequestSchema,
  roomCreateRequestSchema,
  roomCreateResponseSchema,
  roomInspectionResponseSchema,
  roomJoinRequestSchema,
  roomJoinResponseSchema,
  roomRulesetSummarySchema,
  roomRulesetsResponseSchema,
  roomStartRequestSchema,
  roomStartResponseSchema,
  replayResponseSchema,
  playerObservationSchema,
  type RoomStartRequest,
} from "@hk-mahjong/protocol";
import {
  DenoMultiplayerServiceError,
  DenoMultiplayerSocketHub,
  type DenoMultiplayerService,
  type DenoSocketLike,
} from "./deno-multiplayer.js";
import { z } from "zod";

export interface DenoKvRuntimeSocket {
  addEventListener(event: string, listener: (event: { readonly data?: unknown }) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface DenoKvRuntime {
  serve(
    options: { readonly port?: number; readonly hostname?: string },
    handler: (request: Request) => Response | Promise<Response>,
  ): unknown;
  upgradeWebSocket(request: Request): {
    readonly socket: DenoKvRuntimeSocket;
    readonly response: Response;
  };
}

const globalRuntime = (): DenoKvRuntime => {
  const runtime = (globalThis as unknown as { Deno?: DenoKvRuntime }).Deno;
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

const readJson = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  return text.trim().length === 0 ? {} : (JSON.parse(text) as unknown);
};

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

const gameQuerySchema = z
  .object({
    playerId: z.string().trim().min(1).max(256),
    branchId: z.string().trim().min(1).max(256).default("main"),
    ticket: z.string().trim().min(16).max(512).optional(),
  })
  .strict();

const websocketQuerySchema = gameQuerySchema.extend({
  ticket: z.string().trim().min(16).max(512).optional(),
  fromRevision: z.coerce.number().int().nonnegative().default(0),
});

const parseGameQuery = (url: URL): z.output<typeof gameQuerySchema> =>
  gameQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

const parseWebSocketQuery = (url: URL): z.output<typeof websocketQuerySchema> =>
  websocketQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

const invalidRequestResponse = (message: string, reason: string): Response =>
  jsonResponse(
    apiErrorResponseSchema.parse({
      error: {
        code: "invalid_request",
        message,
        details: { reason },
      },
    }),
    404,
  );

const notFoundResponse = (): Response =>
  jsonResponse(
    apiErrorResponseSchema.parse({
      error: {
        code: "invalid_request",
        message: "The requested endpoint was not found",
        details: { reason: "not_found" },
      },
    }),
    404,
  );

const errorResponse = (caught: unknown): Response => {
  if (caught instanceof DenoMultiplayerServiceError) {
    return jsonResponse(apiErrorResponseSchema.parse({ error: caught.payload }), caught.statusCode);
  }
  return jsonResponse(
    apiErrorResponseSchema.parse({
      error: {
        code: "invalid_request",
        message: "The request body or query is invalid",
        details: { reason: caught instanceof Error ? caught.message : "invalid_request" },
      },
    }),
    400,
  );
};

class DenoSocketAdapter implements DenoSocketLike {
  public constructor(private readonly socket: DenoKvRuntimeSocket) {}

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

/** Node-free HTTP/WebSocket routing for the Deno KV room service. */
export const createDenoKvHandler = (
  service: DenoMultiplayerService,
  runtime?: DenoKvRuntime,
): ((request: Request) => Promise<Response>) => {
  const socketHub = new DenoMultiplayerSocketHub(service);
  socketHub.startNotificationPump();
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
      if (pathname === "/api/health" && request.method === "GET") {
        return jsonResponse(healthResponseSchema.parse({ status: "ready", schemaVersion: 1 }));
      }
      if (pathname === "/api/rulesets" && request.method === "GET") {
        return jsonResponse(roomRulesetsResponseSchema.parse({ rulesets: service.listRulesets() }));
      }
      const rulesetId = /^\/api\/rulesets\/([^/]+)$/u.exec(pathname)?.[1];
      if (rulesetId !== undefined && request.method === "GET") {
        const rule = service.listRulesets().find(({ id }) => id === decodeURIComponent(rulesetId));
        return rule === undefined
          ? invalidRequestResponse("Ruleset not found", "ruleset_not_found")
          : jsonResponse(roomRulesetSummarySchema.parse(rule));
      }
      if (pathname === "/api/rooms" && request.method === "POST") {
        return jsonResponse(
          roomCreateResponseSchema.parse(
            await service.createRoom(roomCreateRequestSchema.parse(await readJson(request))),
          ),
          201,
        );
      }
      const roomId = /^\/api\/rooms\/([^/]+)$/u.exec(pathname)?.[1];
      if (roomId !== undefined && request.method === "GET") {
        return jsonResponse(
          roomInspectionResponseSchema.parse(await service.inspectRoom(decodeURIComponent(roomId))),
        );
      }
      const closeMatch = /^\/api\/rooms\/([^/]+)\/close$/u.exec(pathname);
      if (closeMatch?.[1] !== undefined && request.method === "POST") {
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
            await service.closeRoom(decodeURIComponent(closeMatch[1]), ticket),
          ),
        );
      }
      const joinMatch = /^\/api\/rooms\/([^/]+)\/join$/u.exec(pathname);
      if (joinMatch?.[1] !== undefined && request.method === "POST") {
        return jsonResponse(
          roomJoinResponseSchema.parse(
            await service.joinRoom(
              decodeURIComponent(joinMatch[1]),
              roomJoinRequestSchema.parse(await readJson(request)),
              ticketFromRequest(request, url),
            ),
          ),
        );
      }
      const startMatch = /^\/api\/rooms\/([^/]+)\/start$/u.exec(pathname);
      if (startMatch?.[1] !== undefined && request.method === "POST") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "An owner ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const startRequest: RoomStartRequest = roomStartRequestSchema.parse(
          await readJson(request),
        );
        return jsonResponse(
          roomStartResponseSchema.parse(
            await service.startRoom(
              decodeURIComponent(startMatch[1]),
              ticket,
              startRequest.requestId ?? `start:${decodeURIComponent(startMatch[1])}`,
            ),
          ),
        );
      }
      const observationMatch = /^\/api\/games\/([^/]+)\/observation$/u.exec(pathname);
      if (observationMatch?.[1] !== undefined && request.method === "GET") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const query = parseGameQuery(url);
        return jsonResponse(
          playerObservationSchema.parse(
            await service.getObservation(
              decodeURIComponent(observationMatch[1]),
              query.playerId,
              query.branchId,
              ticket,
            ),
          ),
        );
      }
      const actionMatch = /^\/api\/games\/([^/]+)\/actions$/u.exec(pathname);
      if (actionMatch?.[1] !== undefined && request.method === "POST") {
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
          gameId: decodeURIComponent(actionMatch[1]),
          ticket,
        });
        const botResults = await service.advanceBotTurns(result.key.gameId);
        await socketHub.publishActionResult(result, botResults);
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
      const replayMatch = /^\/api\/games\/([^/]+)\/replay$/u.exec(pathname);
      if (replayMatch?.[1] !== undefined && request.method === "GET") {
        const ticket = ticketFromRequest(request, url);
        if (ticket === undefined) {
          throw new DenoMultiplayerServiceError(
            "invalid_request",
            "A room ticket is required",
            { reason: "invalid_ticket" },
            401,
          );
        }
        const query = parseGameQuery(url);
        return jsonResponse(
          replayResponseSchema.parse(
            await service.getReplay(
              decodeURIComponent(replayMatch[1]),
              query.playerId,
              query.branchId,
              ticket,
            ),
          ),
        );
      }
      const branchMatch = /^\/api\/games\/([^/]+)\/branches$/u.exec(pathname);
      if (branchMatch?.[1] !== undefined && request.method === "POST") {
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
          decodeURIComponent(branchMatch[1]),
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
      const hintMatch = /^\/api\/games\/([^/]+)\/hints$/u.exec(pathname);
      if (hintMatch?.[1] !== undefined && request.method === "POST") {
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
          decodeURIComponent(hintMatch[1]),
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
      const websocketMatch = /^\/ws\/games\/([^/]+)$/u.exec(pathname);
      if (
        websocketMatch?.[1] !== undefined &&
        request.method === "GET" &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const query = parseWebSocketQuery(url);
        const ticket = query.ticket ?? ticketFromRequest(request, url);
        if (ticket === undefined) {
          return new Response(null, { status: 401 });
        }
        const origin = request.headers.get("origin") ?? undefined;
        if (!service.allowsOrigin(origin)) {
          return new Response(null, { status: 403 });
        }
        const gameId = decodeURIComponent(websocketMatch[1]);
        const authenticatedContext = await service.authenticateGame(
          gameId,
          query.branchId,
          query.playerId,
          ticket,
        );
        const upgraded = (runtime ?? globalRuntime()).upgradeWebSocket(request);
        const socket = new DenoSocketAdapter(upgraded.socket);
        const connection = {
          gameId,
          playerId: query.playerId,
          branchId: query.branchId,
          ticket,
          fromRevision: query.fromRevision,
          ...(origin === undefined ? {} : { origin }),
        };
        // The handler has already authenticated the request. Pass that context so the hub can
        // register the message listener synchronously before the first client frame arrives.
        void socketHub.attach(socket, connection, authenticatedContext);
        return upgraded.response;
      }
      if (pathname.startsWith("/api/") || pathname.startsWith("/ws/")) {
        return notFoundResponse();
      }
      return new Response("Not found", { status: 404 });
    } catch (caught) {
      return errorResponse(caught);
    }
  };
};

export const serveDenoKv = (
  service: DenoMultiplayerService,
  options: { readonly port?: number; readonly hostname?: string } = {},
  runtime: DenoKvRuntime = globalRuntime(),
): unknown => runtime.serve(options, createDenoKvHandler(service, runtime));
