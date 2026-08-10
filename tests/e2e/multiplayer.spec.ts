import { expect, test, type Page } from "@playwright/test";

interface RoomCredentials {
  readonly roomId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly gameId: string;
  readonly branchId: string;
}

interface BrowserRoomClients {
  readonly owner: RoomCredentials;
  readonly bob: RoomCredentials;
}

interface BrowserMessageState {
  readonly messages: string[];
  readonly socket: WebSocket;
}

const browserMessages = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => {
    const value = (window as unknown as { __mahjongMultiplayer?: BrowserMessageState })
      .__mahjongMultiplayer;
    if (value === undefined) {
      throw new Error("Multiplayer browser state is not available");
    }
    return value.messages;
  });

const waitForMessageType = async (page: Page, type: string): Promise<void> => {
  await expect
    .poll(
      async () =>
        page.evaluate((expectedType) => {
          const state = (window as unknown as { __mahjongMultiplayer?: BrowserMessageState })
            .__mahjongMultiplayer;
          if (state === undefined) {
            return false;
          }
          return state.messages.some((message) => {
            try {
              return (JSON.parse(message) as { type?: unknown }).type === expectedType;
            } catch {
              return false;
            }
          });
        }, type),
      { timeout: 15_000 },
    )
    .toBe(true);
};

const createFourPlayerRoom = async (origin: string): Promise<BrowserRoomClients> => {
  const seed = `browser-${String(Date.now())}-${Math.random().toString(16).slice(2)}`;
  const createResponse = await fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Alice",
      rulesetId: "training_relaxed_v1",
      matchLength: "one_wind",
      seed,
      fillPolicy: "wait_for_four",
    }),
  });
  expect(createResponse.ok).toBe(true);
  const created = (await createResponse.json()) as {
    roomId: string;
    playerId: string;
    ticket: string;
  };
  let bob: RoomCredentials | null = null;
  for (const [index, displayName] of ["Bob", "Carol", "Dan"].entries()) {
    const joinResponse = await fetch(`${origin}/api/rooms/${created.roomId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, preferredSeat: ["south", "west", "north"][index] }),
    });
    expect(joinResponse.ok).toBe(true);
    if (displayName === "Bob") {
      const joined = (await joinResponse.json()) as {
        roomId: string;
        playerId: string;
        ticket: string;
        seat: string;
      };
      bob = {
        roomId: joined.roomId,
        playerId: joined.playerId,
        ticket: joined.ticket,
        gameId: "",
        branchId: "main",
      };
    }
  }
  const startResponse = await fetch(`${origin}/api/rooms/${created.roomId}/start`, {
    method: "POST",
    headers: { authorization: `Bearer ${created.ticket}`, "content-type": "application/json" },
    body: JSON.stringify({ requestId: `browser-start-${seed}` }),
  });
  expect(startResponse.ok).toBe(true);
  const started = (await startResponse.json()) as {
    game: { gameId: string; branchId: string };
  };
  if (bob === null) {
    throw new Error("Bob did not receive a separate room ticket");
  }
  const owner = {
    roomId: created.roomId,
    playerId: created.playerId,
    ticket: created.ticket,
    gameId: started.game.gameId,
    branchId: started.game.branchId,
  };
  return {
    owner,
    bob: { ...bob, gameId: started.game.gameId, branchId: started.game.branchId },
  };
};

const connectBrowserSocket = async (
  page: Page,
  origin: string,
  credentials: RoomCredentials,
  fromRevision = 0,
): Promise<void> => {
  const wsOrigin = origin.replace(/^http/u, "ws");
  const query = new URLSearchParams({
    playerId: credentials.playerId,
    branchId: credentials.branchId,
    ticket: credentials.ticket,
    fromRevision: String(fromRevision),
  });
  await page.evaluate(
    ({ url }) => {
      const messages: string[] = [];
      const socket = new WebSocket(url);
      const state: BrowserMessageState = { messages, socket };
      (window as unknown as { __mahjongMultiplayer?: BrowserMessageState }).__mahjongMultiplayer =
        state;
      socket.addEventListener("message", (event) => messages.push(String(event.data)));
    },
    { url: `${wsOrigin}/ws/games/${credentials.gameId}?${query.toString()}` },
  );
  await waitForMessageType(page, "observation");
};

test.describe("multiplayer browser slice", () => {
  test("two browser clients receive redacted observations and a reconnect catches up", async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://127.0.0.1:4173";
    const credentials = await createFourPlayerRoom(origin);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    try {
      await Promise.all([
        first.goto(`${origin}/api/health`, { waitUntil: "domcontentloaded", timeout: 15_000 }),
        second.goto(`${origin}/api/health`, { waitUntil: "domcontentloaded", timeout: 15_000 }),
      ]);
      await Promise.all([
        connectBrowserSocket(first, origin, credentials.owner),
        connectBrowserSocket(second, origin, credentials.bob),
      ]);
      await waitForMessageType(first, "action_request");
      const firstMessages = await browserMessages(first);
      const secondMessages = await browserMessages(second);
      const firstObservation = firstMessages
        .map((message) => JSON.parse(message) as { type?: string; payload?: { private?: unknown } })
        .find((message) => message.type === "observation");
      const secondObservation = secondMessages
        .map((message) => JSON.parse(message) as { type?: string; payload?: { private?: unknown } })
        .find((message) => message.type === "observation");
      expect(firstObservation?.payload?.private).toBeDefined();
      expect(secondObservation?.payload?.private).toBeDefined();
      expect(firstObservation?.payload?.private).not.toEqual(secondObservation?.payload?.private);

      const action = await first.evaluate(({ playerId, gameId, branchId }) => {
        const state = (window as unknown as { __mahjongMultiplayer?: BrowserMessageState })
          .__mahjongMultiplayer;
        if (state === undefined) {
          throw new Error("Missing first browser socket");
        }
        const request = state.messages
          .map(
            (message) =>
              JSON.parse(message) as {
                type?: string;
                payload?: {
                  requestId?: string;
                  expectedRevision?: number;
                  legalActions?: { id: string }[];
                };
              },
          )
          .find((message) => message.type === "action_request");
        if (
          request?.payload?.requestId === undefined ||
          request.payload.expectedRevision === undefined ||
          request.payload.legalActions?.[0] === undefined
        ) {
          throw new Error("No legal action request was received");
        }
        const requestId = request.payload.requestId;
        const payload = {
          playerId,
          branchId,
          expectedRevision: request.payload.expectedRevision,
          requestId,
          actionId: request.payload.legalActions[0].id,
        };
        state.socket.send(
          JSON.stringify({
            protocolVersion: 1,
            type: "submit_action",
            seq: 0,
            timestamp: new Date().toISOString(),
            gameId,
            branchId,
            requestId,
            payload,
          }),
        );
        return requestId;
      }, credentials.owner);
      await waitForMessageType(second, "public_event");
      const publicRevision = (await browserMessages(second))
        .map(
          (message) =>
            JSON.parse(message) as {
              type?: string;
              payload?: { event?: { revision?: number } };
            },
        )
        .filter((message) => message.type === "public_event")
        .map((message) => message.payload?.event?.revision)
        .find((revision): revision is number => revision !== undefined);
      expect(publicRevision).toBeDefined();
      await first.evaluate(() => {
        const state = (window as unknown as { __mahjongMultiplayer?: BrowserMessageState })
          .__mahjongMultiplayer;
        state?.socket.close();
      });
      await second.waitForTimeout(100);
      await connectBrowserSocket(
        first,
        origin,
        credentials.owner,
        Math.max(0, (publicRevision ?? 1) - 1),
      );
      await waitForMessageType(first, "observation");
      expect(
        (await browserMessages(first)).some((message) => message.includes('"public_event"')),
      ).toBe(true);
      expect(action).toContain("action:");
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });
});
