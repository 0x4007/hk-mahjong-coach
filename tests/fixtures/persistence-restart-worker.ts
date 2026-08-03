import {
  createGameEngine,
  type CreateEngineResult,
  type GameState,
} from "../../packages/core/src/index.js";
import { writeFileSync } from "node:fs";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  resolveRuleset,
  toCoreGameRules,
} from "../../packages/hk-rules/src/index.js";
import {
  PERSISTENCE_SCHEMA_VERSION,
  SqlitePersistenceRepository,
  type GameSessionConfigurationV1,
} from "../../packages/persistence/src/index.js";

interface WorkerRequest {
  operation: "benchmark" | "continue" | "resume" | "write" | "write_and_crash";
  databasePath: string;
}

const readRequest = async (): Promise<WorkerRequest> => {
  let text = "";
  for await (const chunk of process.stdin) {
    text += String(chunk);
  }
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("operation" in parsed) ||
    (parsed.operation !== "benchmark" &&
      parsed.operation !== "write" &&
      parsed.operation !== "write_and_crash" &&
      parsed.operation !== "resume" &&
      parsed.operation !== "continue") ||
    !("databasePath" in parsed) ||
    typeof parsed.databasePath !== "string" ||
    parsed.databasePath.length === 0
  ) {
    throw new Error("Persistence restart worker request is invalid");
  }
  return {
    operation: parsed.operation,
    databasePath: parsed.databasePath,
  };
};

const createEngine = () => {
  const ruleset = getBundledRuleset("training_relaxed_v1");
  return createGameEngine({
    scoringSystem: createHongKongScoringSystem(ruleset),
  });
};

const createGame = (): Extract<CreateEngineResult, { accepted: true }> => {
  const ruleset = getBundledRuleset("training_relaxed_v1");
  const result = createEngine().create({
    type: "create_game",
    requestId: "create:process-restart",
    branchId: "main",
    seed: "process-restart",
    mode: "guided",
    matchLength: "one_wind",
    rules: toCoreGameRules(ruleset),
    players: [
      { id: "east", displayName: "East", controller: "human", seat: "east" },
      { id: "south", displayName: "South", controller: "bot", seat: "south" },
      { id: "west", displayName: "West", controller: "bot", seat: "west" },
      { id: "north", displayName: "North", controller: "bot", seat: "north" },
    ],
  });
  if (!result.accepted) {
    throw new Error(result.error.message);
  }
  return result;
};

const sessionConfiguration: GameSessionConfigurationV1 = {
  schemaVersion: 1,
  bots: [
    { playerId: "north", difficulty: "advanced", personality: "balanced" },
    { playerId: "south", difficulty: "basic", personality: "fast" },
    { playerId: "west", difficulty: "intermediate", personality: "value" },
  ],
  coach: {
    enabled: true,
    provider: "templates",
    verbosity: "brief",
  },
};

const appendOneLegalAction = (
  state: GameState,
  requestId: string,
): Extract<ReturnType<typeof engine.decide>, { accepted: true }> => {
  for (const playerId of Object.keys(state.players).sort()) {
    const action = engine.legalActions(state, playerId)[0];
    if (action === undefined) {
      continue;
    }
    const result = engine.decide(state, {
      type: "submit_action",
      gameId: state.gameId,
      branchId: state.branchId,
      playerId,
      expectedRevision: state.revision,
      requestId,
      actionId: action.id,
    });
    if (!result.accepted) {
      throw new Error(result.error.message);
    }
    repository.appendAcceptedCommand({
      key: { gameId: result.state.gameId, branchId: result.state.branchId },
      requestId,
      events: result.events,
      state: result.state,
    });
    return result;
  }
  throw new Error("Expected the resumed game to expose a legal action");
};

const writeResult = (): void => {
  const resumed = repository.loadLatestResumableGame("process-learner");
  if (resumed === null) {
    throw new Error("Expected a resumable process game");
  }
  const replay = repository.replayToTerminal(resumed.key);
  writeFileSync(
    1,
    JSON.stringify({
      gameId: resumed.key.gameId,
      persistenceSchemaVersion: PERSISTENCE_SCHEMA_VERSION,
      revision: resumed.state.revision,
      stateHash: resumed.state.stateHash,
      replayStateHash: replay.state.stateHash,
      sessionConfiguration: resumed.game.sessionConfiguration,
      sessionConfigurationHash: resumed.game.sessionConfigurationHash,
    }),
  );
};

const benchmarkResume = (): void => {
  const startedAt = performance.now();
  const resumed = repository.loadLatestResumableGame("process-learner");
  const resumeDurationMs = performance.now() - startedAt;
  if (resumed === null) {
    throw new Error("Expected a resumable process game");
  }
  writeFileSync(1, JSON.stringify({ resumeDurationMs }));
};

const request = await readRequest();
const engine = createEngine();
const repository = new SqlitePersistenceRepository({
  databasePath: request.databasePath,
  reducer: (state, event) => engine.reduce(state, event),
  legalActions: (state, playerId) => engine.legalActions(state, playerId),
  validateRulesetDefinition: (definition) => {
    const ruleset = resolveRuleset(definition);
    return {
      definition: ruleset.definition,
      hash: ruleset.hash,
      coreRules: toCoreGameRules(ruleset),
    };
  },
  clock: () => "2026-08-03T03:00:00.000Z",
});
try {
  if (request.operation === "benchmark") {
    benchmarkResume();
  } else {
    if (request.operation === "write" || request.operation === "write_and_crash") {
      const created = createGame();
      repository.appendAcceptedCommand({
        key: { gameId: created.state.gameId, branchId: created.state.branchId },
        requestId: created.events[0]?.requestId ?? "missing-create-request",
        events: created.events,
        state: created.state,
        learnerId: "process-learner",
        rulesetDefinition: getBundledRuleset("training_relaxed_v1").definition,
        sessionConfiguration,
      });
      appendOneLegalAction(
        created.state,
        `action:process-restart:${String(created.state.revision)}`,
      );
    } else if (request.operation === "continue") {
      const resumed = repository.loadLatestResumableGame("process-learner");
      if (resumed === null) {
        throw new Error("Expected a resumable process game");
      }
      appendOneLegalAction(
        resumed.state,
        `continue:process-restart:${String(resumed.state.revision)}`,
      );
    }
    writeResult();
    if (request.operation === "write_and_crash") {
      process.kill(process.pid, "SIGKILL");
    }
  }
} finally {
  repository.close();
}
