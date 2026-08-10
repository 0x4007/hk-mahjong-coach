import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { strict as assert } from "node:assert";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildServer } from "../apps/server/src/index.js";
import { fpsRoomCreateResponseSchema, fpsRoomJoinResponseSchema } from "@hk-mahjong/protocol";

type FpsRoomCreateResponse = ReturnType<typeof fpsRoomCreateResponseSchema.parse>;
type FpsRoomJoinResponse = ReturnType<typeof fpsRoomJoinResponseSchema.parse>;

const SOAK_PORT = 4185;
const SOAK_ORIGIN = `http://127.0.0.1:${String(SOAK_PORT)}`;
const SOAK_CLIENTS = 8;
const SOAK_HOLD_SECONDS = 10 * 60;
const SOAK_MATCH_SECONDS = SOAK_HOLD_SECONDS + 60;
const SOAK_SEED = "fps-browser-soak-v1";
const FPS_SESSION_KEY = "hk-mahjong-coach:fps-slayer-session:v1";
const SOAK_QUALITY = "medium";

interface FpsBrowserSession {
  readonly roomId: string;
  readonly matchId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly displayName: string;
}

interface BrowserFrameMetrics {
  readonly frames: number;
  readonly averageFrameMs: number;
  readonly p95FrameMs: number;
  readonly maxFrameMs: number;
  readonly usedHeapBytes: number | null;
  readonly heapLimitBytes: number | null;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly frameTimeMs: number;
}

interface ServiceDiagnostics {
  readonly matchId: string;
  readonly phase: string;
  readonly serverTick: number;
  readonly rosterCount: number;
  readonly connectedPlayers: number;
  readonly activeMatches: number;
  readonly simulationTicks: number;
  readonly averageTickMs: number;
  readonly maxTickMs: number;
  readonly simulationOverruns: number;
  readonly inputAccepted: number;
  readonly inputRejected: number;
  readonly snapshotsSent: number;
  readonly snapshotBytes: number;
  readonly resyncRequests: number;
  readonly snapshotFailures: number;
  readonly persistenceFailures: number;
  readonly replayFailures: number;
  readonly websocketUpgrades: number;
}

interface BrowserSoakReceipt {
  readonly schemaVersion: 1;
  readonly clients: number;
  readonly holdSeconds: number;
  readonly observedHoldSeconds: number;
  readonly diagnostics: ServiceDiagnostics;
  readonly browserFrames: readonly BrowserFrameMetrics[];
}

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("FPS browser soak received a non-object response");
  }
  return value as Record<string, unknown>;
};

const numberField = (value: Record<string, unknown>, key: string): number => {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new Error(`FPS browser soak response field ${key} is not finite`);
  }
  return candidate;
};

const pageFetchJson = async (
  page: Page,
  path: string,
  init: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  } = {},
): Promise<unknown> => {
  const result = await page.evaluate(
    async ({ requestPath, requestInit }) => {
      const response = await fetch(requestPath, requestInit);
      return { status: response.status, body: (await response.json()) as unknown };
    },
    { requestPath: path, requestInit: init },
  );
  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `FPS browser soak browser request failed (${String(result.status)}): ${JSON.stringify(result.body)}`,
    );
  }
  return result.body;
};

const sessionFor = (
  response: FpsRoomCreateResponse | FpsRoomJoinResponse,
  displayName: string,
): FpsBrowserSession => ({
  roomId: response.roomId,
  matchId: response.matchId,
  playerId: response.playerId,
  ticket: response.ticket,
  displayName,
});

const writeSession = async (page: Page, session: FpsBrowserSession): Promise<void> => {
  await page.evaluate(
    ({ key, value }) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: FPS_SESSION_KEY, value: session },
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect WebSocket" }).waitFor();
};

const sampleBrowser = async (page: Page): Promise<BrowserFrameMetrics> =>
  page.evaluate(
    () =>
      new Promise<BrowserFrameMetrics>((resolve) => {
        const sampleState: {
          readonly startedAt: number;
          frameTimes: number[];
          previous: number;
          frames: number;
          sample: ((now: number) => void) | null;
        } = {
          startedAt: performance.now(),
          frameTimes: [],
          previous: performance.now(),
          frames: 0,
          sample: null,
        };
        sampleState.sample = (now: number): void => {
          sampleState.frameTimes.push(now - sampleState.previous);
          sampleState.previous = now;
          sampleState.frames += 1;
          if (now - sampleState.startedAt < 2_000) {
            requestAnimationFrame((nextNow) => sampleState.sample?.(nextNow));
            return;
          }
          const ordered = [...sampleState.frameTimes].sort((left, right) => left - right);
          const memory = (
            performance as Performance & {
              readonly memory?: {
                readonly usedJSHeapSize?: number;
                readonly jsHeapSizeLimit?: number;
              };
            }
          ).memory;
          const canvas = document.querySelector<HTMLCanvasElement>(".fps-arena-canvas");
          const drawCallsValue = Number(canvas?.getAttribute("data-draw-calls") ?? "NaN");
          const trianglesValue = Number(canvas?.getAttribute("data-triangles") ?? "NaN");
          const frameTimeValue = Number(canvas?.getAttribute("data-frame-time-ms") ?? "NaN");
          const total = sampleState.frameTimes.reduce((sum, value) => sum + value, 0);
          resolve({
            frames: sampleState.frames,
            averageFrameMs: Number((total / Math.max(1, sampleState.frameTimes.length)).toFixed(2)),
            p95FrameMs: Number((ordered[Math.floor(ordered.length * 0.95)] ?? 0).toFixed(2)),
            maxFrameMs: Number((ordered.at(-1) ?? 0).toFixed(2)),
            usedHeapBytes: memory?.usedJSHeapSize ?? null,
            heapLimitBytes: memory?.jsHeapSizeLimit ?? null,
            drawCalls: Number.isFinite(drawCallsValue) ? drawCallsValue : 0,
            triangles: Number.isFinite(trianglesValue) ? trianglesValue : 0,
            frameTimeMs: Number.isFinite(frameTimeValue) ? frameTimeValue : 0,
          });
        };
        requestAnimationFrame((now) => sampleState.sample?.(now));
      }),
  );

const diagnosticsFor = async (
  page: Page,
  session: FpsBrowserSession,
): Promise<ServiceDiagnostics> => {
  const body = record(
    await pageFetchJson(
      page,
      `/api/fps/matches/${encodeURIComponent(session.matchId)}/diagnostics?playerId=${encodeURIComponent(session.playerId)}`,
      { headers: { authorization: `Bearer ${session.ticket}` } },
    ),
  );
  const metrics = record(body.metrics);
  const roster = body.roster;
  if (!Array.isArray(roster)) throw new Error("FPS browser soak diagnostics roster is missing");
  return {
    matchId: typeof body.matchId === "string" ? body.matchId : "",
    phase: typeof body.phase === "string" ? body.phase : "",
    serverTick: numberField(body, "serverTick"),
    rosterCount: roster.length,
    connectedPlayers: numberField(metrics, "connectedPlayers"),
    activeMatches: numberField(metrics, "activeMatches"),
    simulationTicks: numberField(metrics, "simulationTicks"),
    averageTickMs: numberField(metrics, "averageTickMs"),
    maxTickMs: numberField(metrics, "maxTickMs"),
    simulationOverruns: numberField(metrics, "simulationOverruns"),
    inputAccepted: numberField(metrics, "inputAccepted"),
    inputRejected: numberField(metrics, "inputRejected"),
    snapshotsSent: numberField(metrics, "snapshotsSent"),
    snapshotBytes: numberField(metrics, "snapshotBytes"),
    resyncRequests: numberField(metrics, "resyncRequests"),
    snapshotFailures: numberField(metrics, "snapshotFailures"),
    persistenceFailures: numberField(metrics, "persistenceFailures"),
    replayFailures: numberField(metrics, "replayFailures"),
    websocketUpgrades: numberField(metrics, "websocketUpgrades"),
  };
};

const assertBudget = (receipt: BrowserSoakReceipt): void => {
  const { diagnostics, browserFrames } = receipt;
  assert.equal(diagnostics.matchId.length > 0, true, "diagnostics match ID is missing");
  assert.equal(diagnostics.phase, "active", "the soak match ended before diagnostics");
  assert.equal(diagnostics.rosterCount, SOAK_CLIENTS, "the roster lost a browser client");
  assert.equal(diagnostics.connectedPlayers, SOAK_CLIENTS, "a browser socket disconnected");
  assert.equal(diagnostics.activeMatches, 1, "the soak match is not active");
  assert.ok(
    diagnostics.simulationTicks >= SOAK_HOLD_SECONDS * 60 * 0.97,
    `simulation tick count is below budget: ${String(diagnostics.simulationTicks)}`,
  );
  assert.ok(
    diagnostics.maxTickMs < 20,
    `maximum simulation tick exceeded 20 ms: ${String(diagnostics.maxTickMs)}`,
  );
  assert.ok(
    diagnostics.simulationOverruns < diagnostics.simulationTicks * 0.01,
    `simulation overrun rate exceeded 1%: ${String(diagnostics.simulationOverruns)}`,
  );
  assert.ok(
    diagnostics.inputAccepted >= 80_000,
    `too few accepted browser inputs: ${String(diagnostics.inputAccepted)}`,
  );
  assert.equal(diagnostics.inputRejected, 0, "browser input was rejected during the active soak");
  assert.ok(
    diagnostics.snapshotsSent >= 80_000,
    `too few snapshots sent: ${String(diagnostics.snapshotsSent)}`,
  );
  assert.ok(diagnostics.snapshotBytes >= 100_000_000, "snapshot bandwidth was not exercised");
  assert.equal(diagnostics.resyncRequests, 0, "the browser required a resync during the soak");
  assert.equal(diagnostics.snapshotFailures, 0, "the server failed to publish a snapshot");
  assert.equal(diagnostics.persistenceFailures, 0, "the server reported a persistence failure");
  assert.equal(diagnostics.replayFailures, 0, "the server reported a replay failure");
  assert.equal(diagnostics.websocketUpgrades, SOAK_CLIENTS, "unexpected WebSocket upgrade count");
  assert.equal(browserFrames.length, SOAK_CLIENTS);
  for (const [index, frame] of browserFrames.entries()) {
    assert.ok(frame.frames > 30, `browser ${String(index + 1)} produced too few frames`);
    assert.ok(frame.p95FrameMs < 100, `browser ${String(index + 1)} p95 frame exceeded 100 ms`);
    assert.ok(frame.maxFrameMs < 250, `browser ${String(index + 1)} max frame exceeded 250 ms`);
    assert.ok(frame.drawCalls > 0, `browser ${String(index + 1)} reported no draw calls`);
    assert.ok(frame.triangles > 0, `browser ${String(index + 1)} reported no triangles`);
    if (frame.usedHeapBytes !== null && frame.heapLimitBytes !== null) {
      assert.ok(
        frame.usedHeapBytes < Math.min(frame.heapLimitBytes, 512 * 1024 * 1024),
        `browser ${String(index + 1)} exceeded the 512 MiB heap budget`,
      );
    }
  }
};

const main = async (): Promise<void> => {
  const server = await buildServer({
    multiplayerOptions: {
      databasePath: ":memory:",
    },
    fpsOptions: {
      databasePath: ":memory:",
      allowedOrigins: [SOAK_ORIGIN],
    },
  });
  let browser: Browser | null = null;
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const movementHeld = new Set<Page>();
  try {
    await server.listen({ host: "127.0.0.1", port: SOAK_PORT });
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
    for (let index = 0; index < SOAK_CLIENTS; index += 1) {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await page.goto(`${SOAK_ORIGIN}/?fps=1`, { waitUntil: "networkidle" });
      await page.getByLabel("Quality").selectOption(SOAK_QUALITY);
    }

    const ownerBody = record(
      await pageFetchJson(pages[0]!, "/api/fps/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Soak-1",
          seed: SOAK_SEED,
          scoreTarget: 100,
          durationSeconds: SOAK_MATCH_SECONDS,
        }),
      }),
    );
    const owner = sessionFor(fpsRoomCreateResponseSchema.parse(ownerBody), "Soak-1");
    const sessions: FpsBrowserSession[] = [owner];
    for (let index = 1; index < SOAK_CLIENTS; index += 1) {
      const joinedBody = record(
        await pageFetchJson(
          pages[index]!,
          `/api/fps/rooms/${encodeURIComponent(owner.matchId)}/join`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ displayName: `Soak-${String(index + 1)}` }),
          },
        ),
      );
      sessions.push(
        sessionFor(fpsRoomJoinResponseSchema.parse(joinedBody), `Soak-${String(index + 1)}`),
      );
    }
    for (let index = 0; index < SOAK_CLIENTS; index += 1) {
      await writeSession(pages[index]!, sessions[index]!);
    }
    const clickAction = async (page: Page, action: "ready" | "start"): Promise<void> => {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .endsWith(`/api/fps/matches/${encodeURIComponent(owner.matchId)}/${action}`),
      );
      await page
        .getByRole("button", { name: action === "ready" ? "Ready" : "Start match" })
        .click();
      const response = await responsePromise;
      assert.equal(response.status(), 200, `FPS ${action} request failed`);
    };
    await Promise.all(pages.map((page) => clickAction(page, "ready")));
    await clickAction(pages[0]!, "start");
    await Promise.all(
      pages.map(async (page) => {
        await page.getByRole("button", { name: "Connect WebSocket" }).click();
        await page.getByText("Live · authoritative server").waitFor({ timeout: 10_000 });
        await page.keyboard.down("KeyW");
        movementHeld.add(page);
      }),
    );

    const startedAt = performance.now();
    let lastReport = -1;
    while (performance.now() - startedAt < SOAK_HOLD_SECONDS * 1000) {
      await delay(5_000);
      const elapsedSeconds = Math.floor((performance.now() - startedAt) / 1000);
      const reportMinute = Math.floor(elapsedSeconds / 60);
      if (reportMinute !== lastReport) {
        lastReport = reportMinute;
        process.stdout.write(`[fps-browser-soak] elapsedSeconds=${String(elapsedSeconds)}\n`);
      }
    }
    for (const page of movementHeld) await page.keyboard.up("KeyW");
    movementHeld.clear();

    const diagnostics = await diagnosticsFor(pages[0]!, owner);
    const browserFrames = await Promise.all(pages.map((page) => sampleBrowser(page)));
    const receipt: BrowserSoakReceipt = {
      schemaVersion: 1,
      clients: SOAK_CLIENTS,
      holdSeconds: SOAK_HOLD_SECONDS,
      observedHoldSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
      diagnostics,
      browserFrames,
    };
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/fps-browser-soak.json", `${JSON.stringify(receipt, null, 2)}\n`);
    assertBudget(receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally {
    for (const page of movementHeld) await page.keyboard.up("KeyW").catch(() => undefined);
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server.close();
  }
};

await main();
