import React from "react";
import {
  FPS_WEBSOCKET_PROTOCOL,
  fpsRoomCreateResponseSchema,
  fpsRoomJoinResponseSchema,
  fpsSnapshotSchema,
  fpsSocketHostEnvelopeSchema,
  type FpsInputCommandDto,
  type FpsSnapshotDto,
} from "@hk-mahjong/protocol";
import {
  FpsSnapshotTracker,
  FpsTransportTelemetry,
  type FpsTransportTelemetrySnapshot,
} from "@hk-mahjong/fps";
import { FpsArenaScene } from "./FpsArenaScene.js";
import {
  FPS_CONTROL_CODES,
  controlCodeLabel,
  loadFpsAccessibilitySettings,
  type FpsAccessibilitySettings,
  type FpsControlCode,
  type FpsControlBindings,
} from "./accessibility.js";

interface FpsSession {
  readonly roomId: string;
  readonly matchId: string;
  readonly playerId: string;
  readonly ticket: string;
  readonly displayName: string;
}

const FPS_SESSION_KEY = "hk-mahjong-coach:fps-slayer-session:v1";

const FPS_UI_SCALE: Record<FpsAccessibilitySettings["uiScale"], string> = {
  "100": "100%",
  "115": "115%",
  "130": "130%",
};

const FPS_MOVEMENT_BINDINGS = [
  ["forward", "Forward"],
  ["backward", "Backward"],
  ["left", "Strafe left"],
  ["right", "Strafe right"],
] as const satisfies readonly (readonly [keyof FpsControlBindings, string])[];

const readSession = (): FpsSession | null => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(FPS_SESSION_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.roomId !== "string" ||
      typeof record.matchId !== "string" ||
      typeof record.playerId !== "string" ||
      typeof record.ticket !== "string" ||
      typeof record.displayName !== "string"
    )
      return null;
    return parsed as FpsSession;
  } catch {
    return null;
  }
};

const writeSession = (session: FpsSession | null): void => {
  if (session === null) sessionStorage.removeItem(FPS_SESSION_KEY);
  else sessionStorage.setItem(FPS_SESSION_KEY, JSON.stringify(session));
};

const formatMatchTime = (snapshot: FpsSnapshotDto | null): string => {
  if (snapshot === null) return "--:--";
  const remainingTicks = Math.max(0, snapshot.durationTicks - snapshot.serverTick);
  const totalSeconds = Math.ceil(remainingTicks / 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const resolveReticleState = (
  snapshot: FpsSnapshotDto | null,
): "preview" | "ready" | "fire" | "reload" | "down" => {
  if (snapshot === null) return "preview";
  if (snapshot.privatePlayer.lifecycle !== "alive") return "down";
  if (snapshot.privatePlayer.action === "reload") return "reload";
  if (snapshot.privatePlayer.action === "fire") return "fire";
  return "ready";
};

const terminalReasonLabel = (
  reason: Extract<FpsSnapshotDto["events"][number], { kind: "match_ended" }>["reason"],
): string => {
  switch (reason) {
    case "score_target":
      return "Score target reached";
    case "time_limit":
      return "Time limit reached";
    case "cancelled":
      return "Match cancelled";
  }
};

export const FpsSlayerApp = (): React.JSX.Element => {
  const [session, setSession] = React.useState<FpsSession | null>(readSession);
  const [snapshot, setSnapshot] = React.useState<FpsSnapshotDto | null>(null);
  const [eventFeed, setEventFeed] = React.useState<FpsSnapshotDto["events"]>([]);
  const [displayName, setDisplayName] = React.useState("Alice");
  const [seed, setSeed] = React.useState("slayer-demo-001");
  const [scoreTarget, setScoreTarget] = React.useState("25");
  const [joinMatchId, setJoinMatchId] = React.useState("");
  const [joinTicket, setJoinTicket] = React.useState("");
  const [status, setStatus] = React.useState("Offline");
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);
  const [cameraMode, setCameraMode] = React.useState<"firstPerson" | "thirdPerson">("firstPerson");
  const [quality, setQuality] = React.useState<"low" | "medium" | "high">("medium");
  const [accessibility, setAccessibility] = React.useState<FpsAccessibilitySettings>(
    loadFpsAccessibilitySettings,
  );
  const transportTelemetryRef = React.useRef(new FpsTransportTelemetry());
  const [transportMetrics, setTransportMetrics] = React.useState<FpsTransportTelemetrySnapshot>(
    () => transportTelemetryRef.current.snapshot(),
  );
  const socketRef = React.useRef<WebSocket | null>(null);
  const transportSequenceRef = React.useRef(0);
  const inputSequenceRef = React.useRef(0);
  const snapshotTrackerRef = React.useRef(new FpsSnapshotTracker());
  const pingHandleRef = React.useRef<number | null>(null);
  const pingSentAtRef = React.useRef(new Map<string, number>());
  const reticleState = resolveReticleState(snapshot);

  const refreshTransportMetrics = React.useCallback((): void => {
    const next = transportTelemetryRef.current.snapshot();
    setTransportMetrics(next);
    setLatencyMs(next.rttMs === null ? null : Math.round(next.rttMs));
  }, []);

  const recordCorrectionDistance = React.useCallback(
    (distance: number): void => {
      transportTelemetryRef.current.recordCorrectionDistance(distance);
      refreshTransportMetrics();
    },
    [refreshTransportMetrics],
  );

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        "hk-mahjong-coach:fps-accessibility:v1",
        JSON.stringify(accessibility),
      );
    } catch {
      // Preferences are optional; a restricted storage context must not block the match.
    }
  }, [accessibility]);

  const updateAccessibility = <K extends keyof FpsAccessibilitySettings>(
    key: K,
    value: FpsAccessibilitySettings[K],
  ): void => {
    setAccessibility((previous) => ({ ...previous, [key]: value }));
  };

  const updateControlBinding = (
    direction: keyof FpsControlBindings,
    code: FpsControlCode,
  ): void => {
    setAccessibility((previous) => {
      const controls = { ...previous.controls };
      const conflictingDirection = (Object.keys(controls) as (keyof FpsControlBindings)[]).find(
        (candidate) => candidate !== direction && controls[candidate] === code,
      );
      const oldCode = controls[direction];
      controls[direction] = code;
      if (conflictingDirection !== undefined) controls[conflictingDirection] = oldCode;
      return { ...previous, controls };
    });
  };
  const terminalEvent = React.useMemo(() => {
    for (let index = eventFeed.length - 1; index >= 0; index -= 1) {
      const event = eventFeed[index];
      if (event?.kind === "match_ended") return event;
    }
    return null;
  }, [eventFeed]);
  const terminalWinnerNames = React.useMemo(() => {
    if (terminalEvent === null) return [];
    return terminalEvent.winnerIds.map(
      (winnerId) =>
        snapshot?.scoreboard.find((entry) => entry.playerId === winnerId)?.displayName ?? winnerId,
    );
  }, [snapshot?.scoreboard, terminalEvent]);
  const syncState = status.toLowerCase().includes("resync")
    ? "resync"
    : status.startsWith("Live")
      ? "synced"
      : "pending";

  const applySnapshot = (next: FpsSnapshotDto): void => {
    // Keep browser input monotonic even when a reconnect, HTTP acceptance test, or another
    // transport path advances the authoritative sequence before the render loop sends again.
    inputSequenceRef.current = Math.max(
      inputSequenceRef.current,
      next.privatePlayer.lastAcceptedInputSequence + 1,
    );
    setEventFeed((previous) => {
      const eventKey = (event: FpsSnapshotDto["events"][number]): string => {
        if (event.kind === "shot_rejected") {
          return `${event.kind}|${event.playerId}|${event.reason}`;
        }
        return event.eventId;
      };
      const byKey = new Map(previous.map((event) => [eventKey(event), event]));
      for (const event of next.events) byKey.set(eventKey(event), event);
      return [...byKey.values()]
        .sort(
          (left, right) =>
            left.serverTick - right.serverTick || left.eventId.localeCompare(right.eventId),
        )
        .slice(-12);
    });
    setSnapshot(next);
    if (next.phase === "active") setStatus("Live · authoritative server");
    else if (next.phase === "countdown") setStatus("Countdown · waiting for server start");
    else setStatus(`Match ${next.phase}`);
  };

  const saveSession = (next: FpsSession | null): void => {
    setSession(next);
    writeSession(next);
  };

  const applyAuthoritativeSnapshot = (next: FpsSnapshotDto): void => {
    const result = snapshotTrackerRef.current.apply(next);
    if (!result.accepted) {
      transportTelemetryRef.current.recordResyncRequest();
      refreshTransportMetrics();
      setStatus(`Resync required · ${result.reason}`);
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && session !== null) {
        const envelope = {
          protocolVersion: 1,
          type: "fps_resync_request",
          seq: transportSequenceRef.current++,
          timestamp: new Date().toISOString(),
          matchId: session.matchId,
          payload: {
            lastServerTick: result.snapshot?.serverTick ?? 0,
            lastSnapshotId: result.snapshot?.snapshotId ?? null,
          },
        };
        socket.send(JSON.stringify(envelope));
      }
      return;
    }
    applySnapshot(next);
  };

  const createRoom = async (botCount = 0): Promise<void> => {
    const requestedScoreTarget = Number(scoreTarget);
    if (
      !Number.isInteger(requestedScoreTarget) ||
      requestedScoreTarget < 1 ||
      requestedScoreTarget > 100
    ) {
      setStatus("Score target must be a whole number from 1 to 100");
      return;
    }
    setStatus("Creating FPS room…");
    try {
      const response = await fetch("/api/fps/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          seed,
          scoreTarget: requestedScoreTarget,
          durationSeconds: 600,
          ...(botCount > 0 ? { botCount } : {}),
        }),
      });
      const body: unknown = await response.json();
      const created = fpsRoomCreateResponseSchema.parse(body);
      const next = {
        roomId: created.roomId,
        matchId: created.matchId,
        playerId: created.playerId,
        ticket: created.ticket,
        displayName,
      } satisfies FpsSession;
      saveSession(next);
      snapshotTrackerRef.current.reset();
      setEventFeed([]);
      applyAuthoritativeSnapshot(created.snapshot);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "FPS room creation failed");
    }
  };

  const joinRoom = async (): Promise<void> => {
    if (joinMatchId.trim().length === 0) {
      setStatus("Enter the match ID from the first browser");
      return;
    }
    setStatus("Joining FPS room…");
    try {
      const response = await fetch(`/api/fps/rooms/${encodeURIComponent(joinMatchId)}/join`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(joinTicket.trim().length === 0 ? {} : { authorization: `Bearer ${joinTicket}` }),
        },
        body: JSON.stringify({ displayName }),
      });
      const body: unknown = await response.json();
      const joined = fpsRoomJoinResponseSchema.parse(body);
      const next = {
        roomId: joined.roomId,
        matchId: joined.matchId,
        playerId: joined.playerId,
        ticket: joined.ticket,
        displayName,
      } satisfies FpsSession;
      saveSession(next);
      snapshotTrackerRef.current.reset();
      setEventFeed([]);
      applyAuthoritativeSnapshot(joined.snapshot);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "FPS room join failed");
    }
  };

  const postPlayerAction = async (path: "ready" | "start"): Promise<void> => {
    if (session === null) return;
    setStatus(`${path === "ready" ? "Ready" : "Starting"}…`);
    try {
      const response = await fetch(
        `/api/fps/matches/${encodeURIComponent(session.matchId)}/${path}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.ticket}`,
          },
          body: JSON.stringify({
            playerId: session.playerId,
            requestId: `web-${path}-${String(Date.now())}`,
          }),
        },
      );
      const body: unknown = await response.json();
      applyAuthoritativeSnapshot(fpsSnapshotSchema.parse(body));
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : `FPS ${path} failed`);
    }
  };

  const connect = React.useCallback((): void => {
    if (session === null) return;
    socketRef.current?.close();
    snapshotTrackerRef.current.reset();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({ playerId: session.playerId });
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/fps/${encodeURIComponent(session.matchId)}?${query.toString()}`,
      [FPS_WEBSOCKET_PROTOCOL, session.ticket],
    );
    const sendPing = (): void => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const nonce = `ping-${String(Date.now())}-${String(transportSequenceRef.current)}`;
      pingSentAtRef.current.set(nonce, performance.now());
      socket.send(
        JSON.stringify({
          protocolVersion: 1,
          type: "fps_ping",
          seq: transportSequenceRef.current++,
          timestamp: new Date().toISOString(),
          matchId: session.matchId,
          payload: { nonce },
        }),
      );
    };
    socket.onopen = () => {
      setStatus("Connected · waiting for snapshots");
      transportTelemetryRef.current.reset();
      refreshTransportMetrics();
      sendPing();
      if (pingHandleRef.current !== null) window.clearInterval(pingHandleRef.current);
      pingHandleRef.current = window.setInterval(sendPing, 2_000);
    };
    socket.onclose = () => {
      if (pingHandleRef.current !== null) window.clearInterval(pingHandleRef.current);
      pingHandleRef.current = null;
      setStatus("Disconnected · use reconnect");
    };
    socket.onerror = () => setStatus("FPS WebSocket failed");
    socket.onmessage = (event) => {
      try {
        const envelope = fpsSocketHostEnvelopeSchema.parse(
          JSON.parse(String(event.data)) as unknown,
        );
        transportTelemetryRef.current.recordServerSequence(envelope.seq);
        if (envelope.type === "fps_snapshot") applyAuthoritativeSnapshot(envelope.payload);
        if (envelope.type === "fps_input_ack")
          setStatus(
            `Live · authoritative server · input ${String(envelope.payload.inputSequence)}`,
          );
        if (envelope.type === "fps_pong") {
          const sentAt = pingSentAtRef.current.get(envelope.payload.nonce);
          if (sentAt !== undefined) {
            pingSentAtRef.current.delete(envelope.payload.nonce);
            transportTelemetryRef.current.recordRtt(Math.max(0, performance.now() - sentAt));
            refreshTransportMetrics();
          }
        }
        if (envelope.type === "fps_resync_required") {
          transportTelemetryRef.current.recordResyncRequest();
          refreshTransportMetrics();
          setStatus("Resync required · server");
        }
        if (envelope.type === "fps_error") {
          setStatus((previous) =>
            previous.startsWith("Match ended") ? previous : envelope.payload.message,
          );
        }
      } catch (caught) {
        setStatus(caught instanceof Error ? caught.message : "Invalid FPS server frame");
      }
    };
    socketRef.current = socket;
    transportSequenceRef.current = 0;
    inputSequenceRef.current = 0;
  }, [refreshTransportMetrics, session]);

  React.useEffect(
    () => () => {
      if (pingHandleRef.current !== null) window.clearInterval(pingHandleRef.current);
      socketRef.current?.close();
    },
    [],
  );

  const eventSummary = (event: FpsSnapshotDto["events"][number]): string => {
    switch (event.kind) {
      case "player_died":
        return `${event.killerId ?? "environment"} eliminated ${event.playerId}`;
      case "score_updated":
        return `${event.playerId} score ${String(event.score)}`;
      case "player_respawned":
        return `${event.playerId} respawned`;
      case "player_spawned":
        return `${event.playerId} spawned`;
      case "shot_rejected":
        return `${event.playerId} shot rejected (${event.reason})`;
      case "hit_confirmed":
        return `${event.shooterId} hit ${event.targetId}`;
      case "damage_applied":
        return `${event.sourceId} damaged ${event.targetId}`;
      case "shot_fired":
        return `${event.playerId} fired ${event.weaponId}`;
      case "match_phase_changed":
        return `match ${event.phase}`;
      case "player_disconnected":
        return `${event.playerId} disconnected`;
      case "player_kicked":
        return `${event.playerId} was kicked`;
      case "player_reconnected":
        return `${event.playerId} reconnected`;
      case "player_spectating":
        return `${event.playerId} is spectating`;
      case "match_ended":
        return `match ended (${event.reason})`;
    }
  };

  const sendInput = React.useCallback(
    (
      input: Omit<
        FpsInputCommandDto,
        | "protocolVersion"
        | "matchId"
        | "playerId"
        | "inputSequence"
        | "clientTimestampMs"
        | "acknowledgedServerTick"
      >,
    ): void => {
      if (session === null || socketRef.current?.readyState !== WebSocket.OPEN) return;
      if (snapshot?.phase !== "active") return;
      const payload: FpsInputCommandDto = {
        ...input,
        matchId: session.matchId,
        playerId: session.playerId,
        inputSequence: inputSequenceRef.current++,
        clientTimestampMs: performance.timeOrigin + performance.now(),
        acknowledgedServerTick: snapshot.serverTick,
        protocolVersion: 1,
      };
      const envelope = {
        protocolVersion: 1,
        type: "fps_input",
        seq: transportSequenceRef.current++,
        timestamp: new Date().toISOString(),
        matchId: session.matchId,
        payload,
      };
      socketRef.current.send(JSON.stringify(envelope));
    },
    [session, snapshot],
  );

  return (
    <main
      className="fps-shell"
      data-reduced-motion={accessibility.reducedMotion}
      data-high-contrast={accessibility.highContrast}
      data-color-cues={accessibility.colorCues}
      style={{ "--fps-ui-scale": Number(accessibility.uiScale) / 100 } as React.CSSProperties}
    >
      <section className="fps-arena-card" aria-labelledby="fps-heading">
        <div
          className="fps-transport-diagnostics"
          data-fps-rtt-ms={
            transportMetrics.rttMs === null ? "unknown" : Math.round(transportMetrics.rttMs)
          }
          data-fps-jitter-ms={
            transportMetrics.jitterMs === null ? "unknown" : transportMetrics.jitterMs.toFixed(2)
          }
          data-fps-server-packet-loss={transportMetrics.serverPacketLossPercent.toFixed(2)}
          data-fps-correction-distance={transportMetrics.maxCorrectionDistance.toFixed(3)}
          data-fps-resync-requests={transportMetrics.resyncRequests}
          aria-hidden="true"
        />
        <FpsArenaScene
          snapshot={snapshot}
          playerId={session?.playerId ?? null}
          onInput={sendInput}
          cameraMode={cameraMode}
          quality={quality}
          reducedMotion={accessibility.reducedMotion}
          controlBindings={accessibility.controls}
          onCorrectionDistance={recordCorrectionDistance}
        />
        <div className="fps-reticle" data-reticle-state={reticleState} aria-hidden="true">
          <span className="fps-reticle-dot" />
        </div>
        <header className="fps-overlay fps-overlay-header">
          <p className="eyebrow">Authoritative browser prototype · Slayer FFA · map hash v1</p>
          <h1 id="fps-heading">Slayer readiness arena</h1>
          <p>WASD to move · mouse to look · click to fire · 1/2 switches weapons · R reloads</p>
        </header>
        <div className="fps-overlay fps-overlay-controls">
          <button
            onClick={() => setCameraMode("firstPerson")}
            aria-pressed={cameraMode === "firstPerson"}
            type="button"
          >
            First person
          </button>
          <button
            onClick={() => setCameraMode("thirdPerson")}
            aria-pressed={cameraMode === "thirdPerson"}
            type="button"
          >
            Third-person verification
          </button>
          <label className="fps-quality-control">
            Quality
            <select
              aria-label="Quality"
              value={quality}
              onChange={(event) =>
                setQuality(event.currentTarget.value as "low" | "medium" | "high")
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="fps-hud" aria-live="polite">
          <span>{status}</span>
          {snapshot === null ? (
            <>
              <span>Preview · fallback mannequin</span>
              <span>Timer --:--</span>
              <span>Sync pending</span>
            </>
          ) : (
            <>
              <span>
                Tick {snapshot.serverTick} · {snapshot.phase}
              </span>
              <span>Timer {formatMatchTime(snapshot)}</span>
              <span>Target {snapshot.scoreTarget}</span>
              <span>
                HP {snapshot.privatePlayer.health} · Shield {snapshot.privatePlayer.shield} · Ammo{" "}
                {snapshot.privatePlayer.ammoInMagazine}/{snapshot.privatePlayer.reserveAmmo} ·{" "}
                {snapshot.privatePlayer.equippedWeaponId} · {snapshot.privatePlayer.lifecycle} ·{" "}
                {snapshot.privatePlayer.action}
              </span>
              <span>RTT {latencyMs === null ? "—" : `${String(latencyMs)} ms`}</span>
              <span>
                Jitter{" "}
                {transportMetrics.jitterMs === null
                  ? "—"
                  : `${transportMetrics.jitterMs.toFixed(1)} ms`}{" "}
                · server loss {transportMetrics.serverPacketLossPercent.toFixed(1)}%
              </span>
              <span>
                Correction {transportMetrics.maxCorrectionDistance.toFixed(3)} m · resync{" "}
                {transportMetrics.resyncRequests}
              </span>
              <span data-testid="fps-reticle-status">Reticle {reticleState}</span>
              <span>Sync {syncState}</span>
            </>
          )}
          {snapshot?.scoreboard.map((entry) => (
            <span key={entry.playerId}>
              {entry.displayName} {entry.score}K/{entry.kills}D{entry.deaths}
            </span>
          ))}
        </div>
        {accessibility.subtitles && eventFeed.length > 0 ? (
          <ol className="fps-kill-feed" aria-label="FPS event feed">
            {eventFeed
              .slice(-4)
              .reverse()
              .map((event) => (
                <li key={event.eventId}>{eventSummary(event)}</li>
              ))}
          </ol>
        ) : null}
        {terminalEvent !== null ? (
          <section
            className="fps-terminal-result"
            data-testid="fps-terminal-result"
            aria-live="assertive"
          >
            <p className="eyebrow">Authoritative match_ended</p>
            <h2>Match complete</h2>
            <p>{terminalReasonLabel(terminalEvent.reason)}</p>
            <p>
              <strong>Winner</strong>{" "}
              {terminalWinnerNames.length > 0 ? terminalWinnerNames.join(", ") : "No winner"}
            </p>
          </section>
        ) : null}
      </section>
      <aside className="fps-panel" aria-label="FPS Slayer room controls">
        <span className="eyebrow">Room code transport</span>
        {session === null ? (
          <>
            <label>
              Name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
            </label>
            <label>
              Seed
              <input value={seed} onChange={(event) => setSeed(event.currentTarget.value)} />
            </label>
            <label>
              Score target
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={scoreTarget}
                onChange={(event) => setScoreTarget(event.currentTarget.value)}
              />
            </label>
            <button onClick={() => void createRoom()} type="button">
              Create Slayer room
            </button>
            <button onClick={() => void createRoom(1)} type="button">
              Play against AI rival
            </button>
            <div className="fps-divider">or join another browser</div>
            <label>
              Match ID
              <input
                value={joinMatchId}
                onChange={(event) => setJoinMatchId(event.currentTarget.value)}
              />
            </label>
            <label>
              Ticket
              <input
                value={joinTicket}
                onChange={(event) => setJoinTicket(event.currentTarget.value)}
              />
            </label>
            <button onClick={() => void joinRoom()} type="button">
              Join Slayer room
            </button>
          </>
        ) : (
          <>
            <p>
              <strong>{session.matchId}</strong>
              <br />
              {session.displayName} · {session.playerId}
            </p>
            <button onClick={connect} type="button">
              {socketRef.current?.readyState === WebSocket.OPEN ? "Reconnect" : "Connect WebSocket"}
            </button>
            <button onClick={() => void postPlayerAction("ready")} type="button">
              Ready
            </button>
            <button onClick={() => void postPlayerAction("start")} type="button">
              Start match
            </button>
            <button
              onClick={() => {
                socketRef.current?.close();
                saveSession(null);
                setSnapshot(null);
                setEventFeed([]);
                setLatencyMs(null);
                transportTelemetryRef.current.reset();
                refreshTransportMetrics();
                setStatus("Offline");
              }}
              type="button"
            >
              Leave room
            </button>
          </>
        )}
        <details className="fps-accessibility">
          <summary>Accessibility and controls</summary>
          <label className="fps-toggle">
            <input
              type="checkbox"
              checked={accessibility.reducedMotion}
              onChange={(event) =>
                updateAccessibility("reducedMotion", event.currentTarget.checked)
              }
            />
            Reduced motion
          </label>
          <label className="fps-toggle">
            <input
              type="checkbox"
              checked={accessibility.highContrast}
              onChange={(event) => updateAccessibility("highContrast", event.currentTarget.checked)}
            />
            High contrast HUD
          </label>
          <label>
            Color cues
            <select
              value={accessibility.colorCues}
              onChange={(event) =>
                updateAccessibility(
                  "colorCues",
                  event.currentTarget.value as "standard" | "color-safe",
                )
              }
            >
              <option value="standard">Standard</option>
              <option value="color-safe">Color-safe labels</option>
            </select>
          </label>
          <label>
            Interface scale
            <select
              value={accessibility.uiScale}
              onChange={(event) =>
                updateAccessibility(
                  "uiScale",
                  event.currentTarget.value as FpsAccessibilitySettings["uiScale"],
                )
              }
            >
              {(
                Object.entries(FPS_UI_SCALE) as readonly [
                  FpsAccessibilitySettings["uiScale"],
                  string,
                ][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="fps-toggle">
            <input
              type="checkbox"
              checked={accessibility.subtitles}
              onChange={(event) => updateAccessibility("subtitles", event.currentTarget.checked)}
            />
            Event captions
          </label>
          <fieldset>
            <legend>Movement keys</legend>
            {FPS_MOVEMENT_BINDINGS.map(([direction, label]) => (
              <label key={direction}>
                {label}
                <select
                  value={accessibility.controls[direction]}
                  onChange={(event) =>
                    updateControlBinding(direction, event.currentTarget.value as FpsControlCode)
                  }
                >
                  {FPS_CONTROL_CODES.map((code) => (
                    <option key={code} value={code}>
                      {controlCodeLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
          <p className="fps-accessibility-note">
            Preferences save automatically on this device. Color labels supplement, but do not
            replace, the reticle and event text.
          </p>
        </details>
        <p className="fps-note">
          The server owns movement, collision, fire cadence, hit detection, score, death, respawn,
          and the replay chain. The AI rival is a server-owned player with the same health, shield,
          weapon, damage, death, and respawn rules. The rendered mannequin is a deterministic
          fallback asset.
        </p>
      </aside>
    </main>
  );
};
