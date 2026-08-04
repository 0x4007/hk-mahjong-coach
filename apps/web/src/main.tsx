import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { tileTypeFromInstanceId, type TileTypeId } from "@hk-mahjong/core";
import {
  actionResponseSchema,
  createGameResponseSchema,
  curriculumResponseSchema,
  drillAnswerResponseSchema,
  drillSessionResponseSchema,
  hintResponseSchema,
  profileSchema,
  replayResponseSchema,
  rulesetSummarySchema,
  type PlayerObservationDto,
} from "@hk-mahjong/protocol";
import { TileFace } from "@hk-mahjong/tile-ui";
import "./styles.css";
import { MahjongTableScene } from "./scene/MahjongTableScene.js";
import type { MahjongTableGameState } from "./scene/mahjong-table.js";

interface RulesetSummary {
  id: string;
  displayName: string;
  minimumFaan: number;
  capFaan: number;
  disclaimer: string;
}

interface HintResult {
  status: "template" | "provider" | "fallback" | "unavailable";
  level: "nudge" | "compare" | "reveal";
  headline: string;
  explanation: string;
  recommendedActionId: string | null;
  factIds: string[];
  conceptIds: string[];
}

interface DrillItem {
  id: string;
  source: "bundled" | "generated" | "replay";
  type: string;
  conceptIds: string[];
  difficulty: number;
  prompt: string;
  choices: string[];
  tile?: string;
}

interface DrillSession {
  sessionId: string;
  items: DrillItem[];
}

interface ProfileData {
  learnerId: string;
  displayName: string;
  languageOverlays: string[];
  highContrast: boolean;
  reducedMotion: boolean;
  narratorStatus: string;
}

interface MasteryRecord {
  conceptId: string;
  mastery: number;
  confidence: number;
  attempts: number;
  nextReviewAt: string | null;
}

interface CurriculumData {
  current: {
    stage: number;
    id: string;
    name: string;
    outcomes: string[];
    suggestedUnlock: string;
    conceptIds: string[];
  };
  mastery: MasteryRecord[];
}

interface ReplayData {
  game: { gameId: string; branchId: string };
  viewerPlayerId: string;
  events: { eventId: string; revision: number; type: string }[];
  terminalObservation: PlayerObservationDto;
  omniscientAvailable: boolean;
}

const SAVED_GAME_KEY = "hk-mahjong-coach.saved-game";

const readJson = async (response: Response): Promise<unknown> => {
  const value: unknown = await response.json();
  if (!response.ok) {
    const errorValue =
      typeof value === "object" && value !== null && "error" in value
        ? (value as { error?: unknown }).error
        : undefined;
    const message =
      typeof errorValue === "object" &&
      errorValue !== null &&
      "message" in errorValue &&
      typeof (errorValue as { message?: unknown }).message === "string"
        ? (errorValue as { message: string }).message
        : "Request failed";
    throw new Error(message);
  }
  return value;
};

const actionLabel = (action: PlayerObservationDto["legalActions"][number]): string => {
  switch (action.type) {
    case "discard":
      return `Discard ${action.tileId}`;
    case "declare_win":
      return `Declare win (${action.source})`;
    case "declare_concealed_kong":
      return `Declare concealed kong (${String(action.tileIds.length)} tiles)`;
    case "declare_added_kong":
      return "Declare added kong";
    case "claim_chow":
      return "Claim chow";
    case "claim_pung":
      return "Claim pung";
    case "claim_kong":
      return "Claim kong";
    case "claim_win":
      return `Claim win (${action.source})`;
    case "pass":
      return "Pass";
    case "start_next_hand":
      return "Start next hand";
  }
};

const saveGame = (observation: PlayerObservationDto): void => {
  window.localStorage.setItem(
    SAVED_GAME_KEY,
    JSON.stringify({ gameId: observation.gameId, branchId: observation.branchId }),
  );
};

const clearSavedGame = (): void => window.localStorage.removeItem(SAVED_GAME_KEY);

const Nav = ({
  active,
  onNavigate,
}: {
  active: string;
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
}): React.JSX.Element => (
  <nav className="site-nav" aria-label="Main navigation">
    {(
      [
        ["home", "Home"],
        ["profile", "Profile"],
        ["drills", "Drills"],
        ["rules", "Rules"],
      ] as const
    ).map(([view, label]) => (
      <button
        aria-current={active === view ? "page" : undefined}
        className="nav-button"
        key={view}
        onClick={() => onNavigate(view)}
        type="button"
      >
        {label}
      </button>
    ))}
  </nav>
);

const Table = ({
  observation,
  onAction,
  onHint,
  onNavigate,
  onReplay,
  busy,
  hint,
}: {
  observation: PlayerObservationDto;
  onAction: (actionId: string) => void;
  onHint: (level: "nudge" | "compare" | "reveal") => void;
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
  onReplay: () => void;
  busy: boolean;
  hint: HintResult | null;
}): React.JSX.Element => {
  const sceneState = useMemo<MahjongTableGameState>(() => {
    const drawnTileIndex =
      observation.private.drawnTileId === null
        ? null
        : observation.private.concealedTiles.indexOf(observation.private.drawnTileId);
    return {
      viewerSeat: observation.viewer.seat,
      activeSeat:
        observation.players.find((player) => player.playerId === observation.round.activePlayerId)
          ?.seat ?? observation.viewer.seat,
      playerHand: observation.private.concealedTiles.map(tileTypeFromInstanceId),
      drawnTileIndex: drawnTileIndex === -1 ? null : drawnTileIndex,
      players: observation.players.map((player) => ({
        playerId: player.playerId,
        displayName: player.displayName,
        seat: player.seat,
        concealedTileCount: player.concealedTileCount,
        melds: player.melds.map((meld) => ({
          tileTypes: meld.tileTypes.map((tile) => tile as TileTypeId),
          exposed: meld.exposed,
        })),
        discards: player.discards.map((discard) => discard.tileType as TileTypeId),
      })),
    };
  }, [observation]);
  const discardActions = useMemo(
    () =>
      new Map(
        observation.legalActions
          .filter((action) => action.type === "discard")
          .map((action) => [action.tileId, action.id]),
      ),
    [observation.legalActions],
  );
  const discardChoices = observation.legalActions.filter((action) => action.type === "discard");
  const otherActions = observation.legalActions.filter((action) => action.type !== "discard");
  return (
    <>
      <Nav active="home" onNavigate={onNavigate} />
      <section
        className="immersive-scene game-scene"
        aria-labelledby="table-heading"
        data-game-id={observation.gameId}
      >
        <div className="scene-frame">
          <MahjongTableScene gameState={sceneState} quality="low" view="seat" />
          <div className="scene-reticule" aria-hidden="true">
            <span />
          </div>
          <header className="scene-overlay scene-overlay-intro game-scene-intro">
            <p className="eyebrow">{observation.ruleset.id} · first-person table</p>
            <h1 id="table-heading">Read the table. Make one clear decision.</h1>
            <p>
              You are {observation.viewer.seat}. Click the table to look around; use WASD to move.{" "}
              {observation.round.liveWallCount} live tiles remain.
            </p>
          </header>
          <aside className="scene-overlay game-action-dock" aria-label="Game actions">
            <div className="game-dock-heading">
              <div>
                <p className="eyebrow">Your hand</p>
                <h2>Select a legal move</h2>
              </div>
              <span role="status">{observation.phase.replaceAll("_", " ")}</span>
            </div>
            <div className="hand-row game-hand-row" aria-label="Your concealed hand">
              {observation.private.concealedTiles.map((tileId) => {
                const actionId = discardActions.get(tileId);
                return (
                  <TileFace
                    key={tileId}
                    tile={tileTypeFromInstanceId(tileId)}
                    drawn={tileId === observation.private.drawnTileId}
                    disabled={busy || actionId === undefined}
                    {...(actionId === undefined ? {} : { onPress: () => onAction(actionId) })}
                  />
                );
              })}
            </div>
            <div className="game-discard-actions" aria-label="Discard actions">
              {discardChoices.map((action) => (
                <button
                  className="game-action-button"
                  disabled={busy}
                  key={action.id}
                  onClick={() => onAction(action.id)}
                  type="button"
                >
                  {actionLabel(action)}
                </button>
              ))}
            </div>
            {otherActions.length > 0 ? (
              <div className="game-action-list" aria-label="Other legal actions">
                {otherActions.map((action) => (
                  <button
                    className="game-action-button"
                    disabled={busy}
                    key={action.id}
                    onClick={() => onAction(action.id)}
                    type="button"
                  >
                    {actionLabel(action)}
                  </button>
                ))}
              </div>
            ) : null}
            <details className="game-details">
              <summary>Table info · Revision {observation.revision}</summary>
              <div className="game-player-list">
                {observation.players.map((player) => (
                  <span key={player.playerId}>
                    <strong>{player.displayName}</strong> {player.seat} · {player.score} points ·{" "}
                    {player.concealedTileCount} concealed
                  </span>
                ))}
              </div>
            </details>
            <div className="game-coach" aria-labelledby="coach-heading">
              <div className="game-dock-heading">
                <div>
                  <p className="eyebrow">Teacher</p>
                  <h2 id="coach-heading">Grounded help</h2>
                </div>
                <span>offline first</span>
              </div>
              <div className="game-action-list">
                {(["nudge", "compare", "reveal"] as const).map((level) => (
                  <button
                    className="game-action-button quiet"
                    disabled={
                      busy ||
                      observation.phase === "hand_ended" ||
                      observation.phase === "match_ended"
                    }
                    key={level}
                    onClick={() => onHint(level)}
                    type="button"
                  >
                    {level[0]?.toUpperCase()}
                    {level.slice(1)} hint
                  </button>
                ))}
              </div>
              {hint !== null ? (
                <div className="game-hint" role="status">
                  <strong>{hint.headline}</strong>
                  <p>{hint.explanation}</p>
                  <small>
                    {hint.status} · {hint.factIds.length} grounded facts
                  </small>
                </div>
              ) : null}
            </div>
            {observation.result !== null ? (
              <div className="game-result" role="status">
                <p className="eyebrow">Hand result</p>
                <h2>{observation.result.kind.replaceAll("_", " ")}</h2>
                {observation.result.kind === "win" ? (
                  observation.result.winners.map((winner) => (
                    <div className="game-score" key={winner.playerId}>
                      <strong>
                        {winner.playerId} · {winner.scoring.cappedFaan} faan
                      </strong>
                      <span>
                        {winner.scoring.applied.map(({ ruleId }) => ruleId).join(", ") ||
                          "No scored patterns"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>The live wall ended without a scored win.</p>
                )}
                <div className="game-action-list">
                  <button className="game-action-button" onClick={onReplay} type="button">
                    Open replay
                  </button>
                </div>
              </div>
            ) : null}
          </aside>
          <div className="scene-hud game-scene-hud" aria-label="Scene details">
            <span>
              <i aria-hidden="true" /> Live first-person table
            </span>
            <span>
              {observation.round.prevailingWind} round · {observation.ruleset.minimumFaan} faan
              minimum
            </span>
            <span>Mouse look · WASD move · Esc releases pointer</span>
          </div>
        </div>
      </section>
    </>
  );
};

const Home = ({
  rulesets,
  rulesetId,
  mode,
  seed,
  busy,
  hasSavedGame,
  onRuleset,
  onMode,
  onSeed,
  onStart,
  onContinue,
  onNavigate,
}: {
  rulesets: RulesetSummary[];
  rulesetId: string;
  mode: string;
  seed: string;
  busy: boolean;
  hasSavedGame: boolean;
  onRuleset: (value: string) => void;
  onMode: (value: string) => void;
  onSeed: (value: string) => void;
  onStart: () => void;
  onContinue: () => void;
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
}): React.JSX.Element => {
  const selectedRuleset = rulesets.find(({ id }) => id === rulesetId);
  return (
    <>
      <Nav active="home" onNavigate={onNavigate} />
      <section className="immersive-scene home-scene" aria-labelledby="setup-heading">
        <div className="scene-frame">
          <MahjongTableScene quality="low" view="seat" />
          <div className="scene-reticule" aria-hidden="true">
            <span />
          </div>
          <header className="scene-overlay scene-overlay-intro home-scene-intro">
            <p className="eyebrow">Hong Kong Old Style · NYC Social Table</p>
            <h1 id="setup-heading">Stay in the hand.</h1>
            <p>
              Walk into a local-first four-player lesson. Click the table to look around; WASD moves
              through the room.
            </p>
          </header>
          <section className="scene-overlay home-setup-card" aria-label="Start a local hand">
            <div>
              <p className="eyebrow">First-person lesson</p>
              <h2>Choose your lesson</h2>
            </div>
            <label htmlFor="ruleset-select">Ruleset</label>
            <select
              id="ruleset-select"
              value={rulesetId}
              onChange={(event) => onRuleset(event.target.value)}
            >
              {rulesets.map((ruleset) => (
                <option key={ruleset.id} value={ruleset.id}>
                  {ruleset.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="mode-select">Mode</label>
            <select id="mode-select" value={mode} onChange={(event) => onMode(event.target.value)}>
              <option value="learn">Learn</option>
              <option value="guided">Guided</option>
              <option value="socratic">Socratic</option>
              <option value="competitive">Competitive</option>
              <option value="exam">Exam</option>
              <option value="sandbox">Sandbox</option>
            </select>
            <label htmlFor="seed-input">Seed</label>
            <input id="seed-input" value={seed} onChange={(event) => onSeed(event.target.value)} />
            {selectedRuleset ? (
              <p className="disclaimer">
                {selectedRuleset.disclaimer} Minimum {selectedRuleset.minimumFaan} faan; cap{" "}
                {selectedRuleset.capFaan}.
              </p>
            ) : null}
            <div className="home-setup-actions">
              <button
                className="primary-button"
                disabled={busy || rulesets.length === 0}
                onClick={onStart}
                type="button"
              >
                {busy ? "Preparing the table…" : "Start seeded hand"}
              </button>
              {hasSavedGame ? (
                <button
                  className="action-button"
                  disabled={busy}
                  onClick={onContinue}
                  type="button"
                >
                  Continue saved game
                </button>
              ) : null}
            </div>
          </section>
          <div className="scene-hud home-scene-hud" aria-label="Scene details">
            <span>
              <i aria-hidden="true" /> Live first-person preview
            </span>
            <span>Procedural geometry · no external assets</span>
            <span>Round 1 · East · Midtown / NE</span>
          </div>
        </div>
      </section>
    </>
  );
};

const ProfileView = ({
  profile,
  curriculum,
  onNavigate,
}: {
  profile: ProfileData | null;
  curriculum: CurriculumData | null;
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
}): React.JSX.Element => (
  <>
    <Nav active="profile" onNavigate={onNavigate} />
    <section className="content-card" aria-labelledby="profile-heading">
      <p className="eyebrow">Local learner memory</p>
      <h2 id="profile-heading">{profile?.displayName ?? "Learner"}</h2>
      <p>
        {profile?.narratorStatus === "templates"
          ? "Offline templates are active."
          : "Optional provider is available on the server."}
      </p>
      <div className="profile-grid">
        <article className="score-card">
          <strong>Curriculum stage {curriculum?.current.stage ?? 0}</strong>
          <p>{curriculum?.current.name ?? "Tile literacy"}</p>
          <small>{curriculum?.current.suggestedUnlock}</small>
        </article>
        {(curriculum?.mastery ?? []).map((record) => (
          <article className="score-card" key={record.conceptId}>
            <strong>{record.conceptId.replaceAll("_", " ")}</strong>
            <p>
              {Math.round(record.mastery * 100)}% mastery · {record.attempts} attempts
            </p>
            <small>
              {record.nextReviewAt === null
                ? "No review scheduled"
                : `Next review ${record.nextReviewAt}`}
            </small>
          </article>
        ))}
      </div>
    </section>
  </>
);

const DrillsView = ({
  session,
  answer,
  onNavigate,
}: {
  session: DrillSession | null;
  answer: (value: string) => void;
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
}): React.JSX.Element => {
  const item = session?.items[0];
  return (
    <>
      <Nav active="drills" onNavigate={onNavigate} />
      <section className="content-card" aria-labelledby="drills-heading">
        <p className="eyebrow">Spaced practice</p>
        <h2 id="drills-heading">One useful prompt at a time</h2>
        {item ? (
          <>
            <p>{item.prompt}</p>
            <div className="action-list drill-choices">
              {item.choices.map((choice) => (
                <button
                  className="action-button"
                  key={choice}
                  onClick={() => answer(choice)}
                  type="button"
                >
                  {choice}
                </button>
              ))}
            </div>
            <small>
              {item.type.replaceAll("_", " ")} · {session.items.length} remaining
            </small>
          </>
        ) : (
          <p>No drill is active. Choose Drills again to schedule one from your weakest concept.</p>
        )}
      </section>
    </>
  );
};

const RulesView = ({
  rulesets,
  onNavigate,
}: {
  rulesets: RulesetSummary[];
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
}): React.JSX.Element => (
  <>
    <Nav active="rules" onNavigate={onNavigate} />
    <section className="content-card" aria-labelledby="rules-heading">
      <p className="eyebrow">Visible assumptions</p>
      <h2 id="rules-heading">Bundled rulesets</h2>
      <div className="profile-grid">
        {rulesets.map((ruleset) => (
          <article className="score-card" key={ruleset.id}>
            <strong>{ruleset.displayName}</strong>
            <p>
              {ruleset.minimumFaan}-faan minimum · {ruleset.capFaan}-faan cap
            </p>
            <small>{ruleset.disclaimer}</small>
          </article>
        ))}
      </div>
    </section>
  </>
);

const ReplayView = ({
  replay,
  onBack,
}: {
  replay: ReplayData | null;
  onBack: () => void;
}): React.JSX.Element => (
  <section className="content-card" aria-labelledby="replay-heading">
    <div className="panel-heading">
      <div>
        <p className="eyebrow">Deterministic event log</p>
        <h2 id="replay-heading">Replay timeline</h2>
      </div>
      <button className="action-button" onClick={onBack} type="button">
        Back to table
      </button>
    </div>
    {replay === null ? (
      <p>Loading replay…</p>
    ) : (
      <>
        <p>
          {replay.events.length} public events · terminal revision{" "}
          {replay.terminalObservation.revision}
        </p>
        <ol className="timeline">
          {replay.events.map((event) => (
            <li key={event.eventId}>
              <span>#{event.revision}</span> {event.type.replaceAll("_", " ")}
            </li>
          ))}
        </ol>
        <p>
          {replay.omniscientAvailable
            ? "Post-hand review may include an explicitly labeled omniscient view."
            : "Live replay remains observation-redacted."}
        </p>
      </>
    )}
  </section>
);

const App = (): React.JSX.Element => {
  const [rulesets, setRulesets] = useState<RulesetSummary[]>([]);
  const [rulesetId, setRulesetId] = useState("hk_nyc_social_v1");
  const [mode, setMode] = useState("guided");
  const [seed, setSeed] = useState("browser-demo-001");
  const [observation, setObservation] = useState<PlayerObservationDto | null>(null);
  const [view, setView] = useState<"home" | "profile" | "drills" | "rules" | "replay">("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [drillSession, setDrillSession] = useState<DrillSession | null>(null);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [hasSavedGame, setHasSavedGame] = useState(false);

  const loadProfile = useCallback(async (): Promise<void> => {
    const [profileValue, curriculumValue] = await Promise.all([
      readJson(await fetch("/api/profile")),
      readJson(await fetch("/api/curriculum")),
    ]);
    setProfile(profileSchema.parse(profileValue));
    setCurriculum(curriculumResponseSchema.parse(curriculumValue));
  }, []);

  useEffect(() => {
    void Promise.all([fetch("/api/rulesets").then((response) => readJson(response)), loadProfile()])
      .then(([value]) => {
        if (!Array.isArray(value)) throw new Error("Ruleset response is invalid");
        setRulesets(value.map((entry) => rulesetSummarySchema.parse(entry)));
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load local data"),
      );
    setHasSavedGame(window.localStorage.getItem(SAVED_GAME_KEY) !== null);
  }, [loadProfile]);

  useEffect(() => {
    if (observation === null) return;
    saveGame(observation);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/games/${encodeURIComponent(observation.gameId)}?playerId=${encodeURIComponent(observation.viewer.playerId)}&branchId=${encodeURIComponent(observation.branchId)}`,
    );
    socket.addEventListener("message", (event) => {
      try {
        const message: unknown = JSON.parse(event.data as string);
        if (typeof message === "object" && message !== null && "observation" in message) {
          const next = (message as { observation?: unknown }).observation;
          if (next !== undefined) setObservation(next as PlayerObservationDto);
        }
      } catch {
        // HTTP responses remain authoritative when a browser WebSocket message is malformed.
      }
    });
    return () => socket.close();
  }, [observation?.gameId, observation?.branchId]);

  const startGame = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const value = await readJson(
        await fetch("/api/games", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode,
            rulesetId,
            matchLength: "one_wind",
            seed,
            human: { displayName: "You", preferredSeat: "east" },
            opponents: [
              { displayName: "Ming", difficulty: "basic", personality: "fast" },
              { displayName: "Jade", difficulty: "basic", personality: "value" },
              { displayName: "Alex", difficulty: "basic", personality: "balanced" },
            ],
            coach: { enabled: true, provider: "templates", verbosity: "brief" },
          }),
        }),
      );
      const created = createGameResponseSchema.parse(value);
      setObservation(created.observation);
      setView("home");
      setHasSavedGame(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start game");
    } finally {
      setBusy(false);
    }
  };

  const continueGame = async (): Promise<void> => {
    const raw = window.localStorage.getItem(SAVED_GAME_KEY);
    if (raw === null) return;
    setBusy(true);
    setError(null);
    try {
      const saved = JSON.parse(raw) as { gameId?: string; branchId?: string };
      if (typeof saved.gameId !== "string") throw new Error("Saved game identity is invalid");
      const response = await fetch(
        `/api/games/${encodeURIComponent(saved.gameId)}/observation?playerId=player-0&branchId=${encodeURIComponent(saved.branchId ?? "main")}`,
      );
      const value = await readJson(response);
      setObservation(value as PlayerObservationDto);
      setView("home");
    } catch (caught) {
      clearSavedGame();
      setHasSavedGame(false);
      setError(caught instanceof Error ? caught.message : "Saved game is no longer available");
    } finally {
      setBusy(false);
    }
  };

  const submitAction = async (actionId: string): Promise<void> => {
    if (observation === null) return;
    setBusy(true);
    setError(null);
    try {
      const value = await readJson(
        await fetch(`/api/games/${encodeURIComponent(observation.gameId)}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerId: observation.viewer.playerId,
            branchId: observation.branchId,
            expectedRevision: observation.revision,
            requestId: `web:${observation.gameId}:${String(observation.revision)}`,
            actionId,
          }),
        }),
      );
      setObservation(actionResponseSchema.parse(value).observation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action was rejected");
    } finally {
      setBusy(false);
    }
  };

  const requestHint = async (level: "nudge" | "compare" | "reveal"): Promise<void> => {
    if (observation === null) return;
    setBusy(true);
    setError(null);
    try {
      const value = await readJson(
        await fetch(`/api/games/${encodeURIComponent(observation.gameId)}/hints`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerId: observation.viewer.playerId,
            branchId: observation.branchId,
            expectedRevision: observation.revision,
            requestId: `hint:${observation.gameId}:${String(observation.revision)}:${level}`,
            level,
          }),
        }),
      );
      setHint(hintResponseSchema.parse(value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The hint was unavailable");
    } finally {
      setBusy(false);
    }
  };

  const openReplay = async (): Promise<void> => {
    if (observation === null) return;
    setView("replay");
    try {
      const value = await readJson(
        await fetch(
          `/api/games/${encodeURIComponent(observation.gameId)}/replay?playerId=${encodeURIComponent(observation.viewer.playerId)}&branchId=${encodeURIComponent(observation.branchId)}`,
        ),
      );
      setReplay(replayResponseSchema.parse(value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replay unavailable");
    }
  };

  const openDrills = async (): Promise<void> => {
    setView("drills");
    try {
      const value = await readJson(
        await fetch("/api/drills/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      setDrillSession(drillSessionResponseSchema.parse(value) as DrillSession);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Drills unavailable");
    }
  };

  const answerDrill = async (answer: string): Promise<void> => {
    if (drillSession === null) return;
    try {
      const value = await readJson(
        await fetch(`/api/drills/sessions/${encodeURIComponent(drillSession.sessionId)}/answers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: `web-drill:${drillSession.sessionId}:${String(drillSession.items.length)}`,
            answer,
            hintLevel: "none",
          }),
        }),
      );
      drillAnswerResponseSchema.parse(value);
      setDrillSession({ ...drillSession, items: drillSession.items.slice(1) });
      await loadProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The drill answer was rejected");
    }
  };

  const onNavigate = (next: "home" | "profile" | "drills" | "rules"): void => {
    setView(next);
    if (next === "profile") void loadProfile();
    if (next === "drills") void openDrills();
  };

  let content: React.JSX.Element;
  if (view === "profile")
    content = <ProfileView profile={profile} curriculum={curriculum} onNavigate={onNavigate} />;
  else if (view === "drills")
    content = (
      <DrillsView
        session={drillSession}
        answer={(value) => void answerDrill(value)}
        onNavigate={onNavigate}
      />
    );
  else if (view === "rules") content = <RulesView rulesets={rulesets} onNavigate={onNavigate} />;
  else if (view === "replay")
    content = <ReplayView replay={replay} onBack={() => setView("home")} />;
  else if (observation !== null)
    content = (
      <Table
        observation={observation}
        onAction={(actionId) => void submitAction(actionId)}
        onHint={(level) => void requestHint(level)}
        onNavigate={onNavigate}
        onReplay={() => void openReplay()}
        busy={busy}
        hint={hint}
      />
    );
  else
    content = (
      <Home
        rulesets={rulesets}
        rulesetId={rulesetId}
        mode={mode}
        seed={seed}
        busy={busy}
        hasSavedGame={hasSavedGame}
        onRuleset={setRulesetId}
        onMode={setMode}
        onSeed={setSeed}
        onStart={() => void startGame()}
        onContinue={() => void continueGame()}
        onNavigate={onNavigate}
      />
    );

  const immersive = view === "home" || observation !== null;
  return (
    <main className={immersive ? "immersive-shell" : "app-main"} id="main">
      {error !== null ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {content}
    </main>
  );
};

const root = document.querySelector<HTMLElement>("#root");
if (root === null) throw new Error("Missing application root");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
