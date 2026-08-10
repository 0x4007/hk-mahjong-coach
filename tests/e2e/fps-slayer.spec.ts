import { expect, test, type Page } from "@playwright/test";
import {
  fpsInputCommandSchema,
  fpsSnapshotSchema,
  type FpsInputCommandDto,
  type FpsSnapshotDto,
} from "@hk-mahjong/protocol";

const FPS_SESSION_KEY = "hk-mahjong-coach:fps-slayer-session:v1";

interface BrowserFpsSession {
  readonly roomId: string;
  readonly matchId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly displayName: string;
}

type InputControls = Pick<
  FpsInputCommandDto,
  "moveX" | "moveY" | "lookDeltaX" | "lookDeltaY" | "buttons" | "selectedWeaponId" | "actionNonce"
>;

const neutralControls = (
  selectedWeaponId: InputControls["selectedWeaponId"] = "pistol",
): InputControls => ({
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  buttons: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jump: false,
    fire: false,
    reload: false,
  },
  selectedWeaponId,
  actionNonce: null,
});

const readSession = async (page: Page): Promise<BrowserFpsSession> => {
  const value = await page.evaluate((key) => {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as unknown;
  }, FPS_SESSION_KEY);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).roomId !== "string" ||
    typeof (value as Record<string, unknown>).matchId !== "string" ||
    typeof (value as Record<string, unknown>).playerId !== "string" ||
    typeof (value as Record<string, unknown>).ticket !== "string" ||
    typeof (value as Record<string, unknown>).displayName !== "string"
  ) {
    throw new Error("FPS session was not persisted in the browser");
  }
  return value as BrowserFpsSession;
};

const readSnapshot = async (page: Page, session: BrowserFpsSession): Promise<FpsSnapshotDto> => {
  const response = await page.evaluate(async (current) => {
    const result = await fetch(
      `/api/fps/matches/${encodeURIComponent(current.matchId)}/snapshot?playerId=${encodeURIComponent(current.playerId)}&full=true`,
      { headers: { authorization: `Bearer ${current.ticket}` } },
    );
    return { status: result.status, body: (await result.json()) as unknown };
  }, session);
  if (response.status !== 200) {
    throw new Error(`FPS snapshot read failed with ${String(response.status)}`);
  }
  return fpsSnapshotSchema.parse(response.body);
};

const postInput = async (
  page: Page,
  session: BrowserFpsSession,
  controls: InputControls,
): Promise<FpsSnapshotDto> => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await readSnapshot(page, session);
    const input = fpsInputCommandSchema.parse({
      protocolVersion: 1,
      matchId: session.matchId,
      playerId: session.playerId,
      // Reserve a small forward window over the 20 Hz render-loop input so the acceptance driver
      // cannot lose the race between its snapshot read and HTTP submission.
      inputSequence: current.privatePlayer.lastAcceptedInputSequence + 32,
      clientTimestampMs: Date.now(),
      acknowledgedServerTick: current.serverTick,
      ...controls,
    });
    const response = await page.evaluate(
      async ({ currentSession, payload }) => {
        const result = await fetch(
          `/api/fps/matches/${encodeURIComponent(currentSession.matchId)}/input`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${currentSession.ticket}`,
            },
            body: JSON.stringify(payload),
          },
        );
        return { status: result.status, body: (await result.json()) as unknown };
      },
      { currentSession: session, payload: input },
    );
    if (response.status === 200) return fpsSnapshotSchema.parse(response.body);
    if (response.status !== 409) {
      throw new Error(`FPS input failed with ${String(response.status)}`);
    }
    await page.waitForTimeout(30);
  }
  throw new Error("FPS input sequence did not converge with the live browser stream");
};

const normalizeAngle = (value: number): number => {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
};

const aimAt = async (
  page: Page,
  session: BrowserFpsSession,
  targetPlayerId: string,
  selectedWeaponId: InputControls["selectedWeaponId"],
): Promise<void> => {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await readSnapshot(page, session);
    const shooter = current.players.find((player) => player.playerId === session.playerId);
    const target = current.players.find((player) => player.playerId === targetPlayerId);
    if (shooter === undefined || target === undefined) throw new Error("FPS aim target missing");
    const desiredYaw = Math.atan2(
      target.position.x - shooter.position.x,
      -(target.position.z - shooter.position.z),
    );
    const delta = normalizeAngle(desiredYaw - shooter.rotation.yaw);
    if (Math.abs(delta) < 0.015) return;
    await postInput(page, session, {
      ...neutralControls(selectedWeaponId),
      lookDeltaX: Math.max(-0.3, Math.min(0.3, delta)),
    });
    await page.waitForTimeout(65);
  }
  throw new Error("FPS aim did not converge");
};

const fireUntilDeath = async (
  page: Page,
  session: BrowserFpsSession,
  targetPlayerId: string,
): Promise<void> => {
  for (let shot = 0; shot < 16; shot += 1) {
    const current = await readSnapshot(page, session);
    const target = current.players.find((player) => player.playerId === targetPlayerId);
    if (target?.alive === false) return;
    await postInput(page, session, {
      ...neutralControls("rifle"),
      buttons: { ...neutralControls("rifle").buttons, fire: true },
      actionNonce: `browser-lifecycle-shot-${String(shot)}`,
    });
    await page.waitForTimeout(110);
    if ((await readSnapshot(page, session)).phase === "ended") return;
    await postInput(page, session, neutralControls("rifle"));
  }
  const finalSnapshot = await readSnapshot(page, session);
  expect(finalSnapshot.players.find((player) => player.playerId === targetPlayerId)?.alive).toBe(
    false,
  );
};

test.describe("FPS Slayer rendered readiness slice", () => {
  test("two browser clients render fallback avatars and reconnectable authoritative state", async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://127.0.0.1:4183";
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    try {
      await first.goto(`${origin}/?fps=1`, { waitUntil: "networkidle" });
      await expect(first.locator("h1")).toHaveText("Slayer readiness arena");
      await first.getByLabel("Name").fill("Alice");
      await first.getByRole("button", { name: "Create Slayer room" }).click();
      await expect(first.locator(".fps-panel")).toContainText("fps-match-");
      const matchId = await first.locator(".fps-panel strong").innerText();

      await second.goto(`${origin}/?fps=1`, { waitUntil: "networkidle" });
      await second.getByLabel("Name").fill("Bob");
      await second.getByLabel("Match ID").fill(matchId);
      await second.getByRole("button", { name: "Join Slayer room" }).click();
      await expect(second.locator(".fps-panel")).toContainText("fps-match-");

      await first.getByRole("button", { name: "Ready" }).click();
      await second.getByRole("button", { name: "Ready" }).click();
      await first.getByRole("button", { name: "Start match" }).click();
      const fpsSocketUrls: string[] = [];
      first.on("websocket", (socket) => {
        if (socket.url().includes("/ws/fps/")) fpsSocketUrls.push(socket.url());
      });
      await first.getByRole("button", { name: "Connect WebSocket" }).click();
      await second.getByRole("button", { name: "Connect WebSocket" }).click();
      await expect(first.locator(".fps-hud")).toContainText("Tick");
      await expect(second.locator(".fps-hud")).toContainText("Tick");
      await expect(first.locator(".fps-hud")).toContainText("Live · authoritative server");
      await expect(second.locator(".fps-hud")).toContainText("Live · authoritative server");
      await expect(first.locator(".fps-hud")).toContainText(/RTT \d+ ms/u, { timeout: 2_000 });
      await expect(first.locator(".fps-hud")).toContainText(/Timer \d{2}:\d{2}/u);
      await expect(first.locator('[data-testid="fps-reticle-status"]')).toContainText("Reticle");
      const firstSession = await readSession(first);
      await expect.poll(() => fpsSocketUrls.length, { timeout: 2_000 }).toBeGreaterThan(0);
      const firstSocketUrl = fpsSocketUrls[0];
      if (firstSocketUrl === undefined) throw new Error("FPS WebSocket URL was not observed");
      const firstSocketUrlObject = new URL(firstSocketUrl);
      expect(firstSocketUrlObject.searchParams.get("playerId")).toBe(firstSession.playerId);
      expect(firstSocketUrlObject.searchParams.has("ticket")).toBe(false);
      expect(firstSocketUrl).not.toContain(firstSession.ticket);
      await expect(first.locator(".fps-transport-diagnostics")).toHaveAttribute(
        "data-fps-rtt-ms",
        /\d+/u,
      );
      await expect(first.locator(".fps-transport-diagnostics")).toHaveAttribute(
        "data-fps-jitter-ms",
        /(?:unknown|\d+\.\d{2})/u,
      );
      await expect(first.locator(".fps-transport-diagnostics")).toHaveAttribute(
        "data-fps-server-packet-loss",
        /\d+\.\d{2}/u,
      );
      await expect(first.locator(".fps-transport-diagnostics")).toHaveAttribute(
        "data-fps-correction-distance",
        /\d+\.\d{3}/u,
      );

      await first.getByText("Accessibility and controls", { exact: true }).click();
      await first.getByLabel("Reduced motion").check();
      await first.getByLabel("High contrast HUD").check();
      await first.getByLabel("Color cues").selectOption("color-safe");
      await first.getByLabel("Interface scale").selectOption("130");
      await first.getByLabel("Event captions").uncheck();
      await expect(first.locator(".fps-shell")).toHaveAttribute("data-reduced-motion", "true");
      await expect(first.locator(".fps-shell")).toHaveAttribute("data-high-contrast", "true");
      await expect(first.locator(".fps-shell")).toHaveAttribute("data-color-cues", "color-safe");
      await expect(first.locator(".fps-shell")).toHaveCSS("--fps-ui-scale", "1.3");
      await first.getByLabel("Event captions").check();

      const diagnosticsSession = await readSession(first);
      const diagnostics = await first.evaluate(async (current) => {
        const result = await fetch(
          `/api/fps/matches/${encodeURIComponent(current.matchId)}/diagnostics?playerId=${encodeURIComponent(current.playerId)}`,
          { headers: { authorization: `Bearer ${current.ticket}` } },
        );
        return { status: result.status, body: (await result.json()) as unknown };
      }, diagnosticsSession);
      expect(diagnostics.status).toBe(200);
      expect(JSON.stringify(diagnostics.body)).not.toContain(diagnosticsSession.ticket);
      expect(diagnostics.body).toMatchObject({
        matchId: diagnosticsSession.matchId,
        phase: "active",
        metrics: {
          connectedPlayers: 2,
          activeMatches: 1,
          persistenceFailures: 0,
          snapshotFailures: 0,
        },
      });
      const operationalMetrics = (
        diagnostics.body as { readonly metrics?: { readonly simulationTicks?: unknown } }
      ).metrics;
      expect(operationalMetrics?.simulationTicks).toBeGreaterThan(0);

      await expect(first.locator(".fps-arena-canvas")).toBeVisible();
      await expect(second.locator(".fps-arena-canvas")).toBeVisible();
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-mesh-count",
        "7",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-visible-meshes",
        "7",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-root-visible",
        "true",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-body-policy",
        "upper-body-camera-occluded",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-viewmodel-visible",
        "true",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-remote-avatar-count",
        "1",
      );
      const remoteDiagnostics = await first
        .locator(".fps-arena-canvas")
        .getAttribute("data-remote-avatar-diagnostics");
      expect(remoteDiagnostics).not.toBeNull();
      expect(JSON.parse(remoteDiagnostics ?? "[]")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: expect.any(String),
            meshCount: 7,
            rootVisible: true,
          }),
        ]),
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-snapshot-tick",
        /\d+/u,
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-map-id",
        "slayer-arena-v1",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-map-hash",
        /^sha256:[a-f0-9]{64}$/u,
      );
      const mapDiagnosticCounts = await first.locator(".fps-arena-canvas").evaluate((canvas) => {
        const arrayLength = (attribute: string): number => {
          try {
            const parsed: unknown = JSON.parse(canvas.getAttribute(attribute) ?? "[]");
            return Array.isArray(parsed) ? parsed.length : -1;
          } catch {
            return -1;
          }
        };
        return {
          capsuleCount: arrayLength("data-map-capsules"),
          spawnRayCount: arrayLength("data-map-spawn-rays"),
          visibilityTestCount: arrayLength("data-map-visibility-tests"),
          collision: canvas.getAttribute("data-map-collision") ?? "",
        };
      });
      expect(mapDiagnosticCounts).toMatchObject({
        capsuleCount: 2,
        spawnRayCount: 8,
        visibilityTestCount: 16,
      });
      expect(mapDiagnosticCounts.collision).toContain("center-cover");

      await first.getByRole("button", { name: "Reconnect" }).click();
      await expect(first.locator(".fps-hud")).toContainText("Live · authoritative server", {
        timeout: 2_000,
      });
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-snapshot-tick",
        /\d+/u,
      );

      const browserMetrics = await first.evaluate(
        () =>
          new Promise<{
            readonly elapsedMs: number;
            readonly frames: number;
            readonly averageFrameMs: number;
            readonly p95FrameMs: number;
            readonly maxFrameMs: number;
          }>((resolve) => {
            const startedAt = performance.now();
            const frameTimes: number[] = [];
            let previous = startedAt;
            let frames = 0;
            const sample = (now: number): void => {
              frameTimes.push(now - previous);
              previous = now;
              frames += 1;
              if (now - startedAt < 2000) {
                requestAnimationFrame(sample);
                return;
              }
              const ordered = [...frameTimes].sort((left, right) => left - right);
              const total = frameTimes.reduce((sum, value) => sum + value, 0);
              resolve({
                elapsedMs: Number((now - startedAt).toFixed(1)),
                frames,
                averageFrameMs: Number((total / Math.max(1, frameTimes.length)).toFixed(2)),
                p95FrameMs: Number((ordered[Math.floor(ordered.length * 0.95)] ?? 0).toFixed(2)),
                maxFrameMs: Number((ordered.at(-1) ?? 0).toFixed(2)),
              });
            };
            requestAnimationFrame(sample);
          }),
      );
      console.log(`[fps-browser-metrics] ${JSON.stringify(browserMetrics)}`);
      expect(browserMetrics.frames).toBeGreaterThan(30);
      expect(browserMetrics.p95FrameMs).toBeLessThan(100);
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute("data-draw-calls", /\d+/u);
      const renderDiagnostics = await first.locator(".fps-arena-canvas").evaluate((canvas) => ({
        drawCalls: Number(canvas.getAttribute("data-draw-calls") ?? 0),
        triangles: Number(canvas.getAttribute("data-triangles") ?? 0),
        frameTimeMs: Number(canvas.getAttribute("data-frame-time-ms") ?? 0),
      }));
      console.log(`[fps-render-diagnostics] ${JSON.stringify(renderDiagnostics)}`);
      expect(renderDiagnostics.drawCalls).toBeGreaterThan(0);
      expect(renderDiagnostics.triangles).toBeGreaterThan(0);

      for (const mode of ["low", "medium", "high"]) {
        await first.getByLabel("Quality").selectOption(mode);
        await expect(first.locator(".fps-arena-canvas")).toHaveAttribute("data-quality", mode);
      }
      await first.keyboard.press("Digit2");
      await expect(first.locator(".fps-hud")).toContainText("rifle");
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-viewmodel-weapon",
        "rifle",
        { timeout: 2_000 },
      );

      await first.screenshot({ path: "test-results/fps-slayer-first-person.png" });
      await first.getByRole("button", { name: "Third-person verification" }).click();
      await first.keyboard.down("KeyW");
      await first.waitForTimeout(250);
      await first.keyboard.up("KeyW");
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-visible-meshes",
        "7",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-avatar-body-policy",
        "full-world-body",
      );
      await expect(first.locator(".fps-arena-canvas")).toHaveAttribute(
        "data-viewmodel-visible",
        "false",
      );
      await first.screenshot({ path: "test-results/fps-slayer-third-person.png" });
      await expect(first.locator(".fps-hud")).toContainText("Alice");
      await expect(first.locator(".fps-hud")).toContainText("Bob");
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test("renders the authoritative switch, reload, hit, kill, death, and respawn lifecycle", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    try {
      await first.goto("/?fps=1", { waitUntil: "networkidle" });
      await first.getByLabel("Name").fill("Alice");
      await first.getByLabel("Seed").fill("lifecycle-1");
      await first.getByRole("button", { name: "Create Slayer room" }).click();
      await expect(first.locator(".fps-panel")).toContainText("fps-match-");
      const matchId = await first.locator(".fps-panel strong").innerText();

      await second.goto("/?fps=1", { waitUntil: "networkidle" });
      await second.getByLabel("Name").fill("Bob");
      await second.getByLabel("Match ID").fill(matchId);
      await second.getByRole("button", { name: "Join Slayer room" }).click();
      await first.getByRole("button", { name: "Ready" }).click();
      await second.getByRole("button", { name: "Ready" }).click();
      await first.getByRole("button", { name: "Start match" }).click();
      await first.getByRole("button", { name: "Connect WebSocket" }).click();
      await second.getByRole("button", { name: "Connect WebSocket" }).click();
      await expect(first.locator(".fps-hud")).toContainText("Live · authoritative server");
      await expect(second.locator(".fps-hud")).toContainText("Live · authoritative server");

      const firstSession = await readSession(first);
      const secondSession = await readSession(second);
      await expect
        .poll(
          async () => {
            const current = await readSnapshot(first, firstSession);
            const target = current.players.find(
              (player) => player.playerId === secondSession.playerId,
            );
            return target?.spawnProtectionEndsAtTick === null ||
              (target?.spawnProtectionEndsAtTick ?? Number.POSITIVE_INFINITY) < current.serverTick
              ? 1
              : 0;
          },
          {
            timeout: 8_000,
          },
        )
        .toBe(1);

      await first.keyboard.press("Digit2");
      await aimAt(first, firstSession, secondSession.playerId, "rifle");
      await postInput(first, firstSession, {
        ...neutralControls("rifle"),
        buttons: { ...neutralControls("rifle").buttons, fire: true },
        actionNonce: "browser-lifecycle-reload-seed",
      });
      await first.waitForTimeout(120);
      await postInput(first, firstSession, {
        ...neutralControls("rifle"),
        buttons: { ...neutralControls("rifle").buttons, reload: true },
      });
      await expect
        .poll(
          async () => (await readSnapshot(first, firstSession)).privatePlayer.reloadEndsAtTick,
          {
            timeout: 2_000,
          },
        )
        .not.toBeNull();
      await expect(first.locator(".fps-hud")).toContainText("reload", { timeout: 2_000 });
      await first.screenshot({ path: "test-results/fps-slayer-reload.png" });
      await expect
        .poll(
          async () => (await readSnapshot(first, firstSession)).privatePlayer.reloadEndsAtTick,
          {
            timeout: 4_000,
          },
        )
        .toBeNull();

      await aimAt(first, firstSession, secondSession.playerId, "rifle");
      await fireUntilDeath(first, firstSession, secondSession.playerId);
      await expect(second.locator(".fps-hud")).toContainText("dead", { timeout: 4_000 });
      await expect(first.locator(".fps-kill-feed")).toContainText("eliminated", {
        timeout: 4_000,
      });
      await expect(first.locator(".fps-hud")).toContainText("Alice 1K");
      await first.screenshot({ path: "test-results/fps-slayer-death.png" });

      await expect
        .poll(async () => (await readSnapshot(second, secondSession)).privatePlayer.lifecycle, {
          timeout: 6_000,
        })
        .toBe("alive");
      await expect(second.locator(".fps-hud")).toContainText("alive");
      await second.screenshot({ path: "test-results/fps-slayer-respawn.png" });
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test("renders the authoritative terminal winner when the score target is reached", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    try {
      await first.goto("/?fps=1", { waitUntil: "networkidle" });
      await first.getByLabel("Name").fill("Alice");
      await first.getByLabel("Seed").fill("lifecycle-1");
      await first.getByLabel("Score target").fill("1");
      await first.getByRole("button", { name: "Create Slayer room" }).click();
      await expect(first.locator(".fps-panel")).toContainText("fps-match-");
      const matchId = await first.locator(".fps-panel strong").innerText();

      await second.goto("/?fps=1", { waitUntil: "networkidle" });
      await second.getByLabel("Name").fill("Bob");
      await second.getByLabel("Match ID").fill(matchId);
      await second.getByRole("button", { name: "Join Slayer room" }).click();
      await first.getByRole("button", { name: "Ready" }).click();
      await second.getByRole("button", { name: "Ready" }).click();
      await first.getByRole("button", { name: "Start match" }).click();
      await first.getByRole("button", { name: "Connect WebSocket" }).click();
      await second.getByRole("button", { name: "Connect WebSocket" }).click();
      await expect(first.locator(".fps-hud")).toContainText("Live · authoritative server");
      await expect(first.locator(".fps-hud")).toContainText("Target 1");

      const firstSession = await readSession(first);
      const secondSession = await readSession(second);
      await expect
        .poll(
          async () => {
            const current = await readSnapshot(first, firstSession);
            const target = current.players.find(
              (player) => player.playerId === secondSession.playerId,
            );
            return target?.spawnProtectionEndsAtTick === null ||
              (target?.spawnProtectionEndsAtTick ?? Number.POSITIVE_INFINITY) < current.serverTick
              ? 1
              : 0;
          },
          { timeout: 8_000 },
        )
        .toBe(1);

      await first.keyboard.press("Digit2");
      await aimAt(first, firstSession, secondSession.playerId, "rifle");
      await fireUntilDeath(first, firstSession, secondSession.playerId);

      await expect(first.locator('[data-testid="fps-terminal-result"]')).toContainText(
        "Authoritative match_ended",
        { timeout: 4_000 },
      );
      await expect(first.locator('[data-testid="fps-terminal-result"]')).toContainText(
        "Score target reached",
      );
      await expect(first.locator('[data-testid="fps-terminal-result"]')).toContainText(
        "Winner Alice",
      );
      await expect(second.locator('[data-testid="fps-terminal-result"]')).toContainText(
        "Winner Alice",
        { timeout: 4_000 },
      );

      const terminalSnapshot = await readSnapshot(first, firstSession);
      expect(terminalSnapshot.phase).toBe("ended");
      expect(terminalSnapshot.scoreTarget).toBe(1);
      expect(terminalSnapshot.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "match_ended",
            reason: "score_target",
            winnerIds: [firstSession.playerId],
          }),
        ]),
      );
      await first.screenshot({ path: "test-results/fps-slayer-terminal.png" });
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test("lets one browser play a normal-vitals AI rival", async ({ browser }) => {
    test.setTimeout(30_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto("/?fps=1", { waitUntil: "networkidle" });
      await page.getByLabel("Name").fill("Alice");
      await page.getByLabel("Seed").fill("solo-ai-1");
      await page.getByRole("button", { name: "Play against AI rival" }).click();
      await expect(page.locator(".fps-panel")).toContainText("fps-match-");
      await expect(page.locator(".fps-hud")).toContainText("Rival Echo");

      await page.getByRole("button", { name: "Ready" }).click();
      await page.getByRole("button", { name: "Start match" }).click();
      await page.getByRole("button", { name: "Connect WebSocket" }).click();
      await expect(page.locator(".fps-hud")).toContainText("Live · authoritative server", {
        timeout: 5_000,
      });
      const session = await readSession(page);
      await expect
        .poll(
          async () => {
            const current = await readSnapshot(page, session);
            const rival = current.players.find((player) => player.displayName === "Rival Echo");
            return rival === undefined
              ? null
              : {
                  alive: rival.alive,
                  health: rival.health,
                  shield: rival.shield,
                  lifecycle: rival.lifecycle,
                  fired: current.events.some(
                    (event) => event.kind === "shot_fired" && event.playerId === rival.playerId,
                  ),
                };
          },
          { timeout: 10_000 },
        )
        .toMatchObject({ alive: true, health: 100, shield: 50, lifecycle: "alive", fired: true });
      await page.screenshot({ path: "test-results/fps-slayer-solo-ai.png" });
    } finally {
      await context.close();
    }
  });
});
