#!/usr/bin/env node

import {
  getTileDefinition,
  parseTileTypes,
  tileTypeFromInstanceId,
  type TileTypeId,
} from "@hk-mahjong/core";
import { BUNDLED_RULESET_IDS, getBundledRuleset, listBundledRulesets } from "@hk-mahjong/hk-rules";
import { createBundledDrillLibrary } from "@hk-mahjong/coach";
import { distanceOptionsForRuleset, distanceToReady } from "@hk-mahjong/analysis";
import {
  actionSubmissionSchema,
  agentProtocolEnvelopeSchema,
  createProtocolEnvelope,
  hostProtocolEnvelopeSchema,
  parseJsonlEnvelope,
  serializeJsonlEnvelope,
  ProtocolSequenceValidator,
  type AgentProtocolEnvelope,
  type PlayerObservationDto,
} from "@hk-mahjong/protocol";
import { SessionController, DEFAULT_OPPONENTS, listSeededDemos } from "@hk-mahjong/session";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const usage = `Hong Kong Mahjong Coach

Usage:
  mahjong play [--mode guided] [--rules hk_nyc_social_v1] [--seed demo-001]
  mahjong play --output jsonl
  mahjong serve --stdio --seat player-0
  mahjong replay <game-or-hand-id> [--format jsonl]
  mahjong analyze --hand "1m 2m 3m ..." --rules hk_nyc_social_v1
  mahjong drill tiles
  mahjong drill scoring
  mahjong rules list
  mahjong rules show hk_nyc_social_v1
  mahjong demos
  mahjong profile show
`;

const DEFAULT_DATABASE_PATH = join(homedir(), ".hk-mahjong-coach", "coach.sqlite");

const ensureDatabaseDirectory = async (): Promise<void> => {
  await mkdir(dirname(DEFAULT_DATABASE_PATH), { recursive: true });
};

interface PlayOptions {
  mode: "learn" | "guided" | "socratic" | "competitive" | "exam" | "sandbox";
  rulesetId: (typeof BUNDLED_RULESET_IDS)[number];
  seed: string;
  output: "human" | "jsonl";
  playerId: string;
  noColor: boolean;
}

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};

const hasFlag = (args: readonly string[], flag: string): boolean => args.includes(flag);

const rulesetIdFrom = (value: string | undefined): PlayOptions["rulesetId"] => {
  const candidate = value ?? "hk_nyc_social_v1";
  if (!(BUNDLED_RULESET_IDS as readonly string[]).includes(candidate)) {
    throw new Error(`Unknown bundled ruleset ${candidate}`);
  }
  return candidate as PlayOptions["rulesetId"];
};

const playOptionsFrom = (args: readonly string[]): PlayOptions => {
  const mode = valueAfter(args, "--mode") ?? "guided";
  if (
    !(["learn", "guided", "socratic", "competitive", "exam", "sandbox"] as const).includes(
      mode as PlayOptions["mode"],
    )
  ) {
    throw new Error(`Unknown game mode ${mode}`);
  }
  const output = valueAfter(args, "--output") ?? "human";
  if (output !== "human" && output !== "jsonl") {
    throw new Error(`Unknown output format ${output}`);
  }
  return {
    mode: mode as PlayOptions["mode"],
    rulesetId: rulesetIdFrom(valueAfter(args, "--rules")),
    seed: valueAfter(args, "--seed") ?? "demo-001",
    output,
    playerId: valueAfter(args, "--seat") ?? "player-0",
    noColor: hasFlag(args, "--no-color"),
  };
};

const instanceLabel = (instanceId: string): string =>
  getTileDefinition(tileTypeFromInstanceId(instanceId)).compactCode;

const typeLabel = (tileType: string): string =>
  getTileDefinition(tileType as TileTypeId).compactCode;

type ActionDto = PlayerObservationDto["legalActions"][number];

const actionLabel = (action: ActionDto): string => {
  switch (action.type) {
    case "discard":
      return `Discard ${instanceLabel(action.tileId)}`;
    case "declare_win":
      return `Declare win (${action.source})`;
    case "declare_concealed_kong":
      return `Declare concealed kong (${action.tileIds.map(instanceLabel).join(" ")})`;
    case "declare_added_kong":
      return `Declare added kong (${instanceLabel(action.tileId)})`;
    case "claim_chow":
      return `Claim chow (${action.tileIdsFromHand.map(instanceLabel).join(" ")})`;
    case "claim_pung":
      return `Claim pung (${action.tileIdsFromHand.map(instanceLabel).join(" ")})`;
    case "claim_kong":
      return `Claim kong (${action.tileIdsFromHand.map(instanceLabel).join(" ")})`;
    case "claim_win":
      return `Claim win (${action.source})`;
    case "pass":
      return "Pass";
    case "start_next_hand":
      return "Start next hand";
  }
};

const renderObservation = (observation: PlayerObservationDto): string => {
  const lines = [
    `${observation.round.prevailingWind} round · You are ${observation.viewer.seat} · ${String(observation.round.liveWallCount)} live tiles · ${String(observation.ruleset.minimumFaan)}-faan minimum`,
    "",
  ];
  for (const player of [...observation.players].sort((left, right) =>
    left.seat.localeCompare(right.seat),
  )) {
    const melds = player.melds
      .map((meld) => `[${meld.tileTypes.map(typeLabel).join(" ")}]`)
      .join(" ");
    lines.push(
      `${player.seat.padEnd(5)} [score ${String(player.score)}] ${player.playerId === observation.viewer.playerId ? "you " : "     "}${String(player.concealedTileCount)} concealed ${melds || "melds: —"}`,
    );
  }
  lines.push(
    "",
    "Your hand",
    observation.private.concealedTiles.map(instanceLabel).join(" "),
    "",
    "Legal actions",
  );
  observation.legalActions.forEach((action, index) =>
    lines.push(`[${String(index + 1)}] ${actionLabel(action)}`),
  );
  return lines.join("\n");
};

const sessionInput = (options: PlayOptions) => ({
  mode: options.mode,
  rulesetId: options.rulesetId,
  matchLength: "one_wind" as const,
  seed: options.seed,
  learnerId: "local-learner",
  humanPlayerId: options.playerId,
  humanDisplayName: "You",
  opponents: DEFAULT_OPPONENTS,
});

const runHuman = async (options: PlayOptions): Promise<void> => {
  const controller = new SessionController({ databasePath: DEFAULT_DATABASE_PATH });
  const created = controller.create(sessionInput(options));
  let observation = created.observation;
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });
  try {
    for (;;) {
      process.stdout.write(`${renderObservation(observation)}\n`);
      if (observation.phase === "match_ended") {
        break;
      }
      const firstAction = observation.legalActions[0];
      if (firstAction === undefined) {
        throw new Error("The session produced no legal action for the human player");
      }
      let selectedActionId = firstAction.id;
      if (process.stdin.isTTY) {
        const answer = await new Promise<string>((resolve) =>
          input.question("Choose an action number or ID: ", resolve),
        );
        const index = Number.parseInt(answer.trim(), 10);
        selectedActionId =
          Number.isInteger(index) && index >= 1 && index <= observation.legalActions.length
            ? (observation.legalActions[index - 1]?.id ?? firstAction.id)
            : answer.trim() || firstAction.id;
      }
      const result = controller.submit({
        gameId: observation.gameId,
        branchId: observation.branchId,
        playerId: options.playerId,
        expectedRevision: observation.revision,
        requestId: `cli:${observation.gameId}:${String(observation.revision)}`,
        actionId: selectedActionId,
      });
      if (!result.accepted) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }
      observation = result.observation;
    }
  } finally {
    input.close();
    controller.close();
  }
};

let hostOutputSequence = 0;

// Keep the external-player boundary bounded even when the caller never writes a response. The
// value is intentionally advertised in `hello` and on every action request so an agent can make
// its own scheduling decision without guessing the host policy.
const JSONL_ACTION_TIMEOUT_MS = 1_000;
const JSONL_MALFORMED_RESPONSE_LIMIT = 3;

const emitJsonl = (
  type: string,
  payload: unknown,
  identity: { gameId?: string; branchId?: string; requestId?: string } = {},
): void => {
  const envelope = createProtocolEnvelope({
    type,
    seq: hostOutputSequence++,
    payload,
    ...identity,
  });
  hostProtocolEnvelopeSchema.parse(envelope);
  process.stdout.write(serializeJsonlEnvelope(envelope));
};

type JsonlReadResult =
  | { readonly kind: "line"; readonly line: string }
  | { readonly kind: "timeout" }
  | { readonly kind: "closed" };

/**
 * Readline's async iterator cannot cancel a pending `next()` call. A small event-backed queue
 * lets the JSONL host race a line against its deadline without leaking stale reads after a
 * timeout, while still preserving lines that arrive between requests.
 */
const createTimedLineReader = (input: ReturnType<typeof createInterface>) => {
  const queued: string[] = [];
  let closed = false;
  let pending: ((result: JsonlReadResult) => void) | null = null;

  const onLine = (line: string): void => {
    if (pending !== null) {
      const resolve = pending;
      pending = null;
      resolve({ kind: "line", line });
      return;
    }
    queued.push(line);
  };
  const onClose = (): void => {
    closed = true;
    if (pending !== null) {
      const resolve = pending;
      pending = null;
      resolve({ kind: "closed" });
    }
  };
  input.on("line", onLine);
  input.on("close", onClose);

  const read = (timeoutMs: number): Promise<JsonlReadResult> => {
    const queuedLine = queued.shift();
    if (queuedLine !== undefined) {
      return Promise.resolve({ kind: "line", line: queuedLine });
    }
    if (closed) {
      return Promise.resolve({ kind: "closed" });
    }
    return new Promise<JsonlReadResult>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        pending = null;
        resolve({ kind: "timeout" });
      }, timeoutMs);
      pending = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
    });
  };

  const dispose = (): void => {
    input.off("line", onLine);
    input.off("close", onClose);
    pending = null;
    queued.length = 0;
  };

  return { read, dispose };
};

const runJsonl = async (options: PlayOptions): Promise<void> => {
  const controller = new SessionController({ databasePath: DEFAULT_DATABASE_PATH });
  const created = controller.create(sessionInput(options));
  let observation = created.observation;
  const hostSequence = new ProtocolSequenceValidator();
  emitJsonl("hello", {
    seat: options.playerId,
    actionTimeoutMs: JSONL_ACTION_TIMEOUT_MS,
    malformedResponseLimit: JSONL_MALFORMED_RESPONSE_LIMIT,
  });
  emitJsonl(
    "game_started",
    { observation },
    { gameId: observation.gameId, branchId: observation.branchId },
  );
  for (const event of created.publicEvents) {
    emitJsonl("public_event", { event }, { gameId: event.gameId, branchId: event.branchId });
  }
  const emitActionRequest = (): void => {
    if (observation.phase === "match_ended" || observation.legalActions.length === 0) {
      return;
    }
    const requestId = `cli-request:${observation.gameId}:${String(observation.revision)}`;
    const deadline = new Date(Date.now() + JSONL_ACTION_TIMEOUT_MS).toISOString();
    emitJsonl(
      "action_request",
      {
        playerId: options.playerId,
        branchId: observation.branchId,
        expectedRevision: observation.revision,
        requestId,
        deadline,
        legalActions: observation.legalActions,
      },
      { gameId: observation.gameId, branchId: observation.branchId, requestId },
    );
  };
  emitActionRequest();
  let malformedResponses = 0;
  const input = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  const lineReader = createTimedLineReader(input);
  const submitFallback = (): void => {
    const fallback = observation.legalActions[0];
    if (fallback === undefined) {
      return;
    }
    const result = controller.submit({
      gameId: observation.gameId,
      branchId: observation.branchId,
      playerId: options.playerId,
      expectedRevision: observation.revision,
      requestId: `fallback:${observation.gameId}:${String(observation.revision)}`,
      actionId: fallback.id,
    });
    if (!result.accepted) {
      emitJsonl(
        "error",
        {
          code: result.error.code,
          message: result.error.message,
          details: { fallback: true },
        },
        { gameId: observation.gameId, branchId: observation.branchId },
      );
      return;
    }
    observation = result.observation;
    emitJsonl(
      "action_accepted",
      {
        playerId: options.playerId,
        actionId: fallback.id,
        revision: observation.revision,
        observation,
      },
      { gameId: observation.gameId, branchId: observation.branchId },
    );
    malformedResponses = 0;
    emitActionRequest();
  };
  const recordMalformedResponse = (error: unknown): void => {
    malformedResponses += 1;
    emitJsonl("error", {
      code: "invalid_request",
      message: error instanceof Error ? error.message : "Malformed agent message",
      details: { malformedResponses },
    });
    if (malformedResponses >= JSONL_MALFORMED_RESPONSE_LIMIT) {
      submitFallback();
    }
  };
  try {
    for (;;) {
      const next = await lineReader.read(JSONL_ACTION_TIMEOUT_MS);
      if (next.kind === "closed") {
        break;
      }
      if (next.kind === "timeout") {
        malformedResponses += 1;
        emitJsonl(
          "error",
          {
            code: "external_agent_timeout",
            message: `External agent did not respond within ${String(JSONL_ACTION_TIMEOUT_MS)}ms`,
            details: {
              timeoutMs: JSONL_ACTION_TIMEOUT_MS,
              malformedResponses,
              fallback: malformedResponses >= JSONL_MALFORMED_RESPONSE_LIMIT,
            },
          },
          { gameId: observation.gameId, branchId: observation.branchId },
        );
        if (malformedResponses >= JSONL_MALFORMED_RESPONSE_LIMIT) {
          submitFallback();
        } else {
          emitActionRequest();
        }
        continue;
      }
      const line = next.line;
      if (line.trim().length === 0) {
        continue;
      }
      let message: AgentProtocolEnvelope;
      try {
        message = parseJsonlEnvelope(line, agentProtocolEnvelopeSchema);
        hostSequence.accept({ seq: message.seq });
      } catch (error) {
        recordMalformedResponse(error);
        continue;
      }
      if (message.type === "ping") {
        malformedResponses = 0;
        emitJsonl("observation", observation, {
          gameId: observation.gameId,
          branchId: observation.branchId,
        });
        continue;
      }
      if (message.type !== "submit_action") {
        emitJsonl(
          "error",
          {
            code: "invalid_request",
            message: `${message.type} is not available in this CLI host`,
            details: {},
          },
          { gameId: observation.gameId, branchId: observation.branchId },
        );
        recordMalformedResponse(new Error(`${message.type} is not available in this CLI host`));
        continue;
      }
      let actionPayload: ReturnType<typeof actionSubmissionSchema.parse>;
      try {
        actionPayload = actionSubmissionSchema.parse(message.payload);
      } catch (error) {
        recordMalformedResponse(error);
        continue;
      }
      const result = controller.submit({
        gameId: observation.gameId,
        branchId: actionPayload.branchId,
        playerId: actionPayload.playerId,
        expectedRevision: actionPayload.expectedRevision,
        requestId: actionPayload.requestId,
        actionId: actionPayload.actionId,
      });
      if (!result.accepted) {
        emitJsonl(
          "action_rejected",
          {
            playerId: actionPayload.playerId,
            error: result.error,
            observation: result.observation,
          },
          {
            gameId: observation.gameId,
            branchId: observation.branchId,
            requestId: actionPayload.requestId,
          },
        );
        recordMalformedResponse(new Error(result.error.message));
        continue;
      }
      malformedResponses = 0;
      observation = result.observation;
      for (const event of result.publicEvents) {
        emitJsonl("public_event", { event }, { gameId: event.gameId, branchId: event.branchId });
        if (event.type === "hand_ended") {
          emitJsonl(
            "hand_ended",
            { result: event.result, observation },
            { gameId: event.gameId, branchId: event.branchId },
          );
        }
      }
      emitJsonl(
        "action_accepted",
        {
          playerId: actionPayload.playerId,
          actionId: actionPayload.actionId,
          revision: observation.revision,
          observation,
        },
        {
          gameId: observation.gameId,
          branchId: observation.branchId,
          requestId: actionPayload.requestId,
        },
      );
      if (observation.phase === "match_ended") {
        emitJsonl(
          "match_ended",
          { observation },
          { gameId: observation.gameId, branchId: observation.branchId },
        );
        emitJsonl(
          "goodbye",
          { reason: "match_ended" },
          { gameId: observation.gameId, branchId: observation.branchId },
        );
        break;
      }
      emitActionRequest();
    }
  } finally {
    lineReader.dispose();
    input.close();
    controller.close();
  }
};

const printRules = (args: readonly string[]): void => {
  if (args[0] === "list") {
    for (const ruleset of listBundledRulesets()) {
      process.stdout.write(
        `${ruleset.id}\t${ruleset.displayName}\t${String(ruleset.minimumFaan)}-faan minimum\n`,
      );
    }
    return;
  }
  if (args[0] === "show") {
    const id = args[1] ?? "hk_nyc_social_v1";
    process.stdout.write(`${JSON.stringify(getBundledRuleset(id), null, 2)}\n`);
    return;
  }
  throw new Error("Usage: mahjong rules list|show <ruleset>");
};

const printAnalysis = (args: readonly string[]): void => {
  const notation = valueAfter(args, "--hand");
  if (notation === undefined) {
    throw new Error('Usage: mahjong analyze --hand "1m 2m 3m ..." [--rules <ruleset>]');
  }
  const ruleset = getBundledRuleset(rulesetIdFrom(valueAfter(args, "--rules")));
  const tiles = parseTileTypes(notation);
  const distance = distanceToReady(tiles, 0, distanceOptionsForRuleset(ruleset));
  const result = {
    ruleset: {
      id: ruleset.definition.id,
      version: ruleset.definition.version,
      hash: ruleset.hash,
    },
    tiles: tiles.map((tile) => getTileDefinition(tile).compactCode),
    distance,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

const printDrill = (args: readonly string[]): void => {
  const type = args[0] === "scoring" ? "count_faan" : args[0] === "tiles" ? "name_tile" : null;
  if (type === null) {
    throw new Error("Usage: mahjong drill tiles|scoring");
  }
  const drill = createBundledDrillLibrary().find((item) => item.type === type);
  if (drill === undefined) throw new Error(`Bundled drill ${type} is unavailable`);
  process.stdout.write(`${JSON.stringify({ ...drill, answer: undefined }, null, 2)}\n`);
};

const printDemos = (): void => {
  process.stdout.write(`${JSON.stringify(listSeededDemos(), null, 2)}\n`);
};

const printReplay = (args: readonly string[]): void => {
  const gameId = args[0];
  if (gameId === undefined) throw new Error("Usage: mahjong replay <game-id> [--format jsonl]");
  const controller = new SessionController({ databasePath: DEFAULT_DATABASE_PATH });
  try {
    controller.load(gameId, valueAfter(args, "--branch") ?? "main", "player-0");
    const replay = controller.replay(gameId, "player-0", valueAfter(args, "--branch") ?? "main");
    if (valueAfter(args, "--format") === "jsonl") {
      replay.events.forEach((event, index) =>
        process.stdout.write(
          `${JSON.stringify({ protocolVersion: 1, seq: index, type: "public_event", payload: { event } })}\n`,
        ),
      );
      return;
    }
    process.stdout.write(
      `Replay ${gameId}/${replay.game.branchId} · ${String(replay.events.length)} public events\n${renderObservation(replay.terminalObservation)}\n`,
    );
  } finally {
    controller.close();
  }
};

const main = async (): Promise<void> => {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(usage);
    return;
  }
  await ensureDatabaseDirectory();
  if (command === "rules") {
    printRules(args);
    return;
  }
  if (command === "analyze") {
    printAnalysis(args);
    return;
  }
  if (command === "drill") {
    printDrill(args);
    return;
  }
  if (command === "demos") {
    printDemos();
    return;
  }
  if (command === "replay") {
    printReplay(args);
    return;
  }
  if (command === "profile" && args[0] === "show") {
    const controller = new SessionController({ databasePath: DEFAULT_DATABASE_PATH });
    try {
      process.stdout.write(`${JSON.stringify(controller.profile("local-learner"), null, 2)}\n`);
    } finally {
      controller.close();
    }
    return;
  }
  if (command === "profile" && args[0] === "export") {
    const path = args[1];
    if (path === undefined) throw new Error("Usage: mahjong profile export <path>");
    const controller = new SessionController({ databasePath: DEFAULT_DATABASE_PATH });
    try {
      await writeFile(
        path,
        `${JSON.stringify(controller.exportData({ includeLlmMetadata: false }), null, 2)}\n`,
        "utf8",
      );
    } finally {
      controller.close();
    }
    return;
  }
  if (command === "profile" && args[0] === "reset") {
    const controller = new SessionController({ databasePath: DEFAULT_DATABASE_PATH });
    try {
      controller.resetLearner("local-learner");
    } finally {
      controller.close();
    }
    return;
  }
  if (command === "play") {
    const options = playOptionsFrom(args);
    if (options.output === "jsonl") {
      await runJsonl(options);
    } else {
      await runHuman(options);
    }
    return;
  }
  if (command === "serve" && hasFlag(args, "--stdio")) {
    await runJsonl(
      playOptionsFrom(["--output", "jsonl", "--seat", valueAfter(args, "--seat") ?? "player-0"]),
    );
    return;
  }
  throw new Error(`Unknown command ${command}`);
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
