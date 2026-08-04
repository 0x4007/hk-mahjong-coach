import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  TILE_DEFINITIONS,
  getTileDefinition,
  tileTypeFromInstanceId,
  type TileTypeId,
} from "@hk-mahjong/core";
import {
  actionResponseSchema,
  branchResponseSchema,
  createGameResponseSchema,
  curriculumResponseSchema,
  demoDescriptorSchema,
  demosResponseSchema,
  drillAnswerResponseSchema,
  drillSessionResponseSchema,
  hintResponseSchema,
  profileSchema,
  replayResponseSchema,
  rulesetDetailsSchema,
  rulesetSummarySchema,
  type DemoDescriptor,
  type OmniscientReplayView,
  type RulesetDetails,
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

type Demo = DemoDescriptor;
type MatchLength = "one_wind" | "full_four_winds";

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
  decisions: {
    id: string;
    handId: string;
    revision: number;
    actionId: string;
    recommendedActionId: string | null;
    quality: number;
  }[];
  terminalObservation: PlayerObservationDto;
  omniscientAvailable: boolean;
  omniscient: OmniscientReplayView | null;
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
                <p className="eyebrow">
                  {observation.phase === "match_ended" ? "Match result" : "Hand result"}
                </p>
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
                {observation.phase === "match_ended" ? (
                  <section aria-labelledby="match-standings-heading">
                    <p className="eyebrow" id="match-standings-heading">
                      Final standings
                    </p>
                    <ol className="game-standings">
                      {[...observation.players]
                        .sort((left, right) => right.score - left.score)
                        .map((player, index) => (
                          <li key={player.playerId}>
                            <strong>
                              {String(index + 1)}. {player.displayName}
                            </strong>
                            <span>
                              {player.seat} · {String(player.score)} points
                            </span>
                          </li>
                        ))}
                    </ol>
                    <button
                      className="game-action-button"
                      onClick={() => onNavigate("home")}
                      type="button"
                    >
                      Start another lesson
                    </button>
                  </section>
                ) : null}
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
  demos,
  rulesetId,
  mode,
  seed,
  matchLength,
  busy,
  hasSavedGame,
  onRuleset,
  onMode,
  onSeed,
  onMatchLength,
  onStart,
  onDemo,
  onContinue,
  onNavigate,
}: {
  rulesets: RulesetSummary[];
  demos: Demo[];
  rulesetId: string;
  mode: string;
  seed: string;
  matchLength: MatchLength;
  busy: boolean;
  hasSavedGame: boolean;
  onRuleset: (value: string) => void;
  onMode: (value: string) => void;
  onSeed: (value: string) => void;
  onMatchLength: (value: MatchLength) => void;
  onStart: () => void;
  onDemo: (demo: Demo) => void;
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
            <label htmlFor="match-length-select">Match length</label>
            <select
              id="match-length-select"
              value={matchLength}
              onChange={(event) => onMatchLength(event.target.value as MatchLength)}
            >
              <option value="one_wind">One wind · practice</option>
              <option value="full_four_winds">Full four winds</option>
            </select>
            {selectedRuleset ? (
              <p className="disclaimer">
                {selectedRuleset.disclaimer} Minimum {selectedRuleset.minimumFaan} faan; cap{" "}
                {selectedRuleset.capFaan}.
              </p>
            ) : null}
            {mode === "learn" ? (
              <aside className="orientation-lesson" aria-label="Tile orientation lesson">
                <p className="eyebrow">Tile orientation</p>
                <p>Dots are circles, Bamboo is a suit of sticks, and Characters show 萬.</p>
                <div className="orientation-tiles">
                  <TileFace tile="dots.5" />
                  <TileFace tile="bamboo.5" />
                  <TileFace tile="characters.5" />
                </div>
              </aside>
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
            <section className="demo-list" aria-labelledby="demo-heading">
              <div>
                <p className="eyebrow">Seeded rooms</p>
                <h3 id="demo-heading">Choose a focused lesson</h3>
              </div>
              {demos.length === 0 ? <p>No seeded rooms are available.</p> : null}
              <div className="demo-grid">
                {demos.map((demo) => (
                  <article className="demo-card" key={demo.id}>
                    <div>
                      <strong>{demo.title}</strong>
                      <span>{demo.description}</span>
                    </div>
                    <small>{demo.focus.join(" · ")}</small>
                    <button
                      className="game-action-button"
                      onClick={() => onDemo(demo)}
                      type="button"
                    >
                      Enter room
                    </button>
                  </article>
                ))}
              </div>
            </section>
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
  onPatch,
  onExport,
  onReset,
  onNavigate,
}: {
  profile: ProfileData | null;
  curriculum: CurriculumData | null;
  onPatch: (patch: { highContrast?: boolean; reducedMotion?: boolean }) => void;
  onExport: () => void;
  onReset: () => void;
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
      <div className="profile-controls" aria-label="Accessibility and data controls">
        <button
          className="action-button"
          onClick={() => onPatch({ highContrast: !(profile?.highContrast ?? false) })}
          type="button"
        >
          {profile?.highContrast ? "Disable high contrast" : "Enable high contrast"}
        </button>
        <button
          className="action-button"
          onClick={() => onPatch({ reducedMotion: !(profile?.reducedMotion ?? false) })}
          type="button"
        >
          {profile?.reducedMotion ? "Use normal motion" : "Reduce motion"}
        </button>
        <button className="action-button" onClick={onExport} type="button">
          Export local data
        </button>
        <button className="action-button danger-button" onClick={onReset} type="button">
          Reset learner progress
        </button>
      </div>
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
  details,
  rulesets,
  onNavigate,
}: {
  details: RulesetDetails[];
  rulesets: RulesetSummary[];
  onNavigate: (view: "home" | "profile" | "drills" | "rules") => void;
}): React.JSX.Element => (
  <>
    <Nav active="rules" onNavigate={onNavigate} />
    <section className="content-card" aria-labelledby="rules-heading">
      <p className="eyebrow">Visible assumptions</p>
      <h2 id="rules-heading">Rules and glossary</h2>
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
      {details.map((ruleset) => (
        <details className="rules-detail" key={ruleset.id} open={ruleset.id === rulesets[0]?.id}>
          <summary>{ruleset.displayName}</summary>
          <p>{ruleset.description}</p>
          <div className="rules-facts">
            <span>
              {ruleset.winRules.minimumFaan}-faan minimum · {ruleset.winRules.capFaan}-faan cap
            </span>
            <span>
              {ruleset.tileSet.bonusTilesEnabled ? "144 tiles with bonuses" : "136 tiles"} ·{" "}
              {ruleset.kongRules.robAddedKong
                ? "added-kong robbery enabled"
                : "added-kong robbery off"}
            </span>
          </div>
          <div
            className="rules-table"
            role="table"
            aria-label={`${ruleset.displayName} scoring rules`}
          >
            {ruleset.scoringRules.map((rule) => (
              <div className="rules-row" key={rule.id} role="row">
                <span role="cell">
                  <strong>{rule.names.en}</strong>
                  <small>{rule.id}</small>
                </span>
                <span role="cell">
                  {rule.enabled
                    ? rule.value.type === "limit"
                      ? "Limit"
                      : `${String(rule.value.amount)} faan`
                    : "Disabled"}
                </span>
                <span role="cell">
                  {rule.names.zhHant} · {rule.names.zhHans}
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}
      <section className="tile-glossary" aria-labelledby="tile-glossary-heading">
        <div>
          <p className="eyebrow">42 semantic tile types</p>
          <h3 id="tile-glossary-heading">Tile glossary</h3>
        </div>
        <div className="tile-glossary-grid">
          {TILE_DEFINITIONS.map((tile) => (
            <article className="tile-glossary-item" key={tile.id}>
              <TileFace tile={tile.id} />
              <div>
                <strong>{tile.names.en}</strong>
                <span>
                  {tile.compactCode} · {tile.names.zhHant} · {tile.names.zhHans}
                </span>
                <small>
                  {tile.names.jyutping} · {tile.names.pinyin}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  </>
);

const ReplayView = ({
  replay,
  comparison,
  onBranch,
  onBack,
  onToggleOmniscient,
  busy,
}: {
  replay: ReplayData | null;
  comparison: { parent: ReplayData; branch: ReplayData } | null;
  onBranch: (decision: ReplayData["decisions"][number]) => void;
  onBack: () => void;
  onToggleOmniscient: () => void;
  busy: boolean;
}): React.JSX.Element => {
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    setCursor(replay?.events.length ?? 0);
  }, [replay?.game.gameId, replay?.game.branchId, replay?.events.length]);
  const selectedEvent = replay?.events[cursor - 1] ?? null;
  const visibleDecisions = (replay?.decisions ?? []).filter(
    (decision) => decision.revision <= cursor,
  );
  return (
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
            {replay.terminalObservation.revision} · branch {replay.game.branchId}
          </p>
          {replay.omniscientAvailable ? (
            <section className="replay-omniscient" aria-labelledby="omniscient-heading">
              <div>
                <p className="eyebrow">Post-hand only</p>
                <h3 id="omniscient-heading">Reveal the completed table</h3>
              </div>
              <p>
                This view is intentionally unavailable during live play. It reveals concealed hands
                only after the hand has ended.
              </p>
              <button
                className="action-button"
                disabled={busy}
                onClick={onToggleOmniscient}
                type="button"
              >
                {replay.omniscient === null ? "Show omniscient view" : "Hide omniscient view"}
              </button>
              {replay.omniscient !== null ? (
                <div className="omniscient-players">
                  {replay.omniscient.players.map((player) => (
                    <article key={player.playerId}>
                      <strong>
                        {player.displayName} · {player.seat} · {player.score} points
                      </strong>
                      <span>
                        {player.concealedTiles
                          .map(
                            (tileId) =>
                              getTileDefinition(tileTypeFromInstanceId(tileId)).compactCode,
                          )
                          .join(" ")}
                      </span>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          <label className="replay-scrubber" htmlFor="replay-position">
            Event position <output>{cursor}</output>
            <input
              id="replay-position"
              max={replay.events.length}
              min={0}
              onChange={(event) => setCursor(Number(event.target.value))}
              type="range"
              value={cursor}
            />
          </label>
          {selectedEvent ? (
            <p className="replay-selected-event" role="status">
              At revision {selectedEvent.revision}: {selectedEvent.type.replaceAll("_", " ")}.
            </p>
          ) : null}
          <ol className="timeline" aria-label="Replay events">
            {replay.events.map((event) => (
              <li key={event.eventId}>
                <button
                  className={
                    event.revision === cursor ? "timeline-event selected" : "timeline-event"
                  }
                  onClick={() => setCursor(event.revision)}
                  type="button"
                >
                  <span>#{event.revision}</span> {event.type.replaceAll("_", " ")}
                </button>
              </li>
            ))}
          </ol>
          {visibleDecisions.length > 0 ? (
            <section className="replay-decisions" aria-labelledby="replay-decisions-heading">
              <div>
                <p className="eyebrow">Decision comparison</p>
                <h3 id="replay-decisions-heading">Practice another line</h3>
              </div>
              {visibleDecisions.map((decision) => (
                <article className="replay-decision" key={decision.id}>
                  <div>
                    <strong>Revision {decision.revision}</strong>
                    <span>
                      selected {decision.actionId}
                      {decision.recommendedActionId === null
                        ? ""
                        : ` · recommended ${decision.recommendedActionId}`}
                    </span>
                  </div>
                  <button
                    className="action-button"
                    onClick={() => onBranch(decision)}
                    type="button"
                  >
                    Branch and compare
                  </button>
                </article>
              ))}
            </section>
          ) : null}
          {comparison ? (
            <section className="replay-comparison" aria-labelledby="replay-comparison-heading">
              <p className="eyebrow">Side-by-side branch result</p>
              <h3 id="replay-comparison-heading">Parent vs practice branch</h3>
              <div className="comparison-grid">
                <article>
                  <strong>{comparison.parent.game.branchId}</strong>
                  <span>{comparison.parent.events.length} public events</span>
                  <span>Revision {comparison.parent.terminalObservation.revision}</span>
                </article>
                <article>
                  <strong>{comparison.branch.game.branchId}</strong>
                  <span>{comparison.branch.events.length} public events</span>
                  <span>Revision {comparison.branch.terminalObservation.revision}</span>
                </article>
              </div>
            </section>
          ) : null}
          <p>
            {replay.omniscientAvailable
              ? "Post-hand review may include an explicitly labeled omniscient view."
              : "Live replay remains observation-redacted."}
          </p>
        </>
      )}
    </section>
  );
};

const App = (): React.JSX.Element => {
  const [rulesets, setRulesets] = useState<RulesetSummary[]>([]);
  const [demos, setDemos] = useState<Demo[]>([]);
  const [rulesetId, setRulesetId] = useState("hk_nyc_social_v1");
  const [mode, setMode] = useState("guided");
  const [seed, setSeed] = useState("browser-demo-001");
  const [matchLength, setMatchLength] = useState<MatchLength>("one_wind");
  const [observation, setObservation] = useState<PlayerObservationDto | null>(null);
  const [view, setView] = useState<"home" | "profile" | "drills" | "rules" | "replay">("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [drillSession, setDrillSession] = useState<DrillSession | null>(null);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [comparison, setComparison] = useState<{
    parent: ReplayData;
    branch: ReplayData;
  } | null>(null);
  const [ruleDetails, setRuleDetails] = useState<RulesetDetails[]>([]);
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
    void Promise.all([
      fetch("/api/rulesets").then((response) => readJson(response)),
      fetch("/api/demos").then((response) => readJson(response)),
      loadProfile(),
    ])
      .then(([value, demoValue]) => {
        if (!Array.isArray(value)) throw new Error("Ruleset response is invalid");
        setRulesets(value.map((entry) => rulesetSummarySchema.parse(entry)));
        setDemos(
          demosResponseSchema.parse(demoValue).map((entry) => demoDescriptorSchema.parse(entry)),
        );
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load local data"),
      );
    setHasSavedGame(window.localStorage.getItem(SAVED_GAME_KEY) !== null);
  }, [loadProfile]);

  useEffect(() => {
    document.documentElement.dataset.contrast = profile?.highContrast ? "high" : "normal";
    document.documentElement.dataset.motion = profile?.reducedMotion ? "reduced" : "full";
  }, [profile?.highContrast, profile?.reducedMotion]);

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

  const startGame = async (demo?: Demo): Promise<void> => {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const value = await readJson(
        await fetch("/api/games", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: demo?.mode ?? mode,
            rulesetId: demo?.rulesetId ?? rulesetId,
            matchLength,
            seed: demo?.seed ?? seed,
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
    setComparison(null);
    try {
      const value = await readJson(
        await fetch(
          `/api/games/${encodeURIComponent(observation.gameId)}/replay?playerId=${encodeURIComponent(observation.viewer.playerId)}&branchId=${encodeURIComponent(observation.branchId)}&omniscient=false`,
        ),
      );
      setReplay(replayResponseSchema.parse(value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replay unavailable");
    }
  };

  const toggleOmniscientReplay = async (): Promise<void> => {
    if (observation === null || replay?.omniscientAvailable !== true) return;
    setBusy(true);
    setError(null);
    try {
      const value = await readJson(
        await fetch(
          `/api/games/${encodeURIComponent(observation.gameId)}/replay?playerId=${encodeURIComponent(observation.viewer.playerId)}&branchId=${encodeURIComponent(observation.branchId)}&omniscient=${replay.omniscient === null ? "true" : "false"}`,
        ),
      );
      setReplay(replayResponseSchema.parse(value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Omniscient replay unavailable");
    } finally {
      setBusy(false);
    }
  };

  const loadRuleDetails = async (): Promise<void> => {
    try {
      const values = await Promise.all(
        rulesets.map((ruleset) =>
          fetch(`/api/rulesets/${encodeURIComponent(ruleset.id)}/details`).then(readJson),
        ),
      );
      setRuleDetails(values.map((value) => rulesetDetailsSchema.parse(value)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rules glossary unavailable");
    }
  };

  const branchFromDecision = async (decision: ReplayData["decisions"][number]): Promise<void> => {
    if (observation === null || replay === null) return;
    setBusy(true);
    setError(null);
    try {
      const branchId = `practice:${decision.id.replaceAll(":", "-")}`;
      const branch = branchResponseSchema.parse(
        await readJson(
          await fetch(`/api/games/${encodeURIComponent(observation.gameId)}/branches`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              playerId: observation.viewer.playerId,
              parentBranchId: replay.game.branchId,
              branchId,
              decisionId: decision.id,
              expectedRevision: decision.revision,
              requestId: `web-branch:${decision.id}`,
            }),
          }),
        ),
      );
      const [parentValue, branchValue] = await Promise.all([
        fetch(
          `/api/games/${encodeURIComponent(observation.gameId)}/replay?playerId=${encodeURIComponent(observation.viewer.playerId)}&branchId=${encodeURIComponent(replay.game.branchId)}`,
        ).then(readJson),
        fetch(
          `/api/games/${encodeURIComponent(observation.gameId)}/replay?playerId=${encodeURIComponent(observation.viewer.playerId)}&branchId=${encodeURIComponent(branch.game.branchId)}`,
        ).then(readJson),
      ]);
      const parentReplay = replayResponseSchema.parse(parentValue);
      const branchReplay = replayResponseSchema.parse(branchValue);
      setObservation(branch.observation);
      setReplay(branchReplay);
      setComparison({ parent: parentReplay, branch: branchReplay });
      setView("replay");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Practice branch unavailable");
    } finally {
      setBusy(false);
    }
  };

  const patchProfile = async (patch: {
    highContrast?: boolean;
    reducedMotion?: boolean;
  }): Promise<void> => {
    try {
      const value = await readJson(
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        }),
      );
      setProfile(profileSchema.parse(value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile update failed");
    }
  };

  const exportProfile = async (): Promise<void> => {
    try {
      const value = await readJson(await fetch("/api/export"));
      const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "hk-mahjong-coach-export.json";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Data export failed");
    }
  };

  const resetProfile = async (): Promise<void> => {
    try {
      await readJson(
        await fetch("/api/profile/reset", {
          method: "POST",
        }),
      );
      await loadProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Learner reset failed");
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
    if (next === "rules") void loadRuleDetails();
  };

  let content: React.JSX.Element;
  if (view === "profile")
    content = (
      <ProfileView
        profile={profile}
        curriculum={curriculum}
        onExport={() => void exportProfile()}
        onNavigate={onNavigate}
        onPatch={(patch) => void patchProfile(patch)}
        onReset={() => void resetProfile()}
      />
    );
  else if (view === "drills")
    content = (
      <DrillsView
        session={drillSession}
        answer={(value) => void answerDrill(value)}
        onNavigate={onNavigate}
      />
    );
  else if (view === "rules")
    content = <RulesView details={ruleDetails} rulesets={rulesets} onNavigate={onNavigate} />;
  else if (view === "replay")
    content = (
      <ReplayView
        comparison={comparison}
        onBack={() => setView("home")}
        onBranch={(decision) => void branchFromDecision(decision)}
        onToggleOmniscient={() => void toggleOmniscientReplay()}
        replay={replay}
        busy={busy}
      />
    );
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
        demos={demos}
        rulesetId={rulesetId}
        mode={mode}
        seed={seed}
        matchLength={matchLength}
        busy={busy}
        hasSavedGame={hasSavedGame}
        onRuleset={setRulesetId}
        onMode={setMode}
        onSeed={setSeed}
        onMatchLength={setMatchLength}
        onStart={() => void startGame()}
        onDemo={(demo) => void startGame(demo)}
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
