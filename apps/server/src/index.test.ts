import { afterEach, describe, expect, it } from "vitest";
import { TemplateCoachNarrator } from "@hk-mahjong/coach";
import { buildServer } from "./index.js";

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("local HTTP game surface", () => {
  it("creates a seeded game, exposes only observation data, and accepts an emitted action", async () => {
    const server = await buildServer({ databasePath: ":memory:" });
    servers.push(server);

    const health = await server.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: "ready", schemaVersion: 1 });

    const created = await server.inject({
      method: "POST",
      url: "/api/games",
      payload: {
        mode: "guided",
        rulesetId: "hk_nyc_social_v1",
        matchLength: "one_wind",
        seed: "server-test",
        human: { displayName: "Learner", preferredSeat: "east" },
        opponents: [
          { displayName: "Ming", difficulty: "basic", personality: "fast" },
          { displayName: "Jade", difficulty: "basic", personality: "value" },
          { displayName: "Alex", difficulty: "basic", personality: "balanced" },
        ],
        coach: { enabled: false, provider: "templates", verbosity: "brief" },
      },
    });
    expect(created.statusCode).toBe(200);
    const game = JSON.parse(created.body) as {
      game: { gameId: string; branchId: string };
      observation: {
        revision: number;
        private: { concealedTiles: string[] };
        legalActions: { id: string }[];
      };
    };
    expect(game.observation.private.concealedTiles).toHaveLength(14);
    expect(JSON.stringify(game)).not.toContain("wallOrder");
    const action = game.observation.legalActions[0];
    if (action === undefined) {
      throw new Error("Expected a legal action from the seeded observation");
    }
    const accepted = await server.inject({
      method: "POST",
      url: `/api/games/${game.game.gameId}/actions`,
      payload: {
        playerId: "player-0",
        branchId: game.game.branchId,
        expectedRevision: game.observation.revision,
        requestId: "server-test-action",
        actionId: action.id,
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(JSON.parse(accepted.body)).toMatchObject({ accepted: true });

    const observation = await server.inject({
      method: "GET",
      url: `/api/games/${game.game.gameId}/observation?playerId=player-0&branchId=main`,
    });
    expect(observation.statusCode).toBe(200);
    const observationBody = JSON.parse(observation.body) as { revision: number };
    expect(observationBody.revision).toBeGreaterThan(game.observation.revision);
  });

  it("keeps coaching, replay, profile, drill, and export routes local", async () => {
    const server = await buildServer({ databasePath: ":memory:" });
    servers.push(server);
    const created = await server.inject({
      method: "POST",
      url: "/api/games",
      payload: {
        mode: "guided",
        rulesetId: "hk_nyc_social_v1",
        matchLength: "one_wind",
        seed: "server-surface-routes",
        human: { displayName: "Learner", preferredSeat: "east" },
        opponents: [
          { displayName: "Ming", difficulty: "basic", personality: "fast" },
          { displayName: "Jade", difficulty: "basic", personality: "value" },
          { displayName: "Alex", difficulty: "basic", personality: "balanced" },
        ],
        coach: { enabled: false, provider: "templates", verbosity: "brief" },
      },
    });
    const game = JSON.parse(created.body) as {
      game: { gameId: string; branchId: string };
      observation: { revision: number; legalActions: { id: string }[] };
    };
    const hint = await server.inject({
      method: "POST",
      url: `/api/games/${game.game.gameId}/hints`,
      payload: {
        playerId: "player-0",
        branchId: game.game.branchId,
        expectedRevision: game.observation.revision,
        requestId: "surface-hint-1",
        level: "reveal",
      },
    });
    expect(hint.statusCode).toBe(200);
    expect(JSON.parse(hint.body)).toHaveProperty("headline");

    const replay = await server.inject({
      method: "GET",
      url: `/api/games/${game.game.gameId}/replay?playerId=player-0&branchId=main`,
    });
    expect(replay.statusCode).toBe(200);
    const replayBody = JSON.parse(replay.body) as { events: unknown[] };
    expect(replayBody.events.length).toBeGreaterThan(0);
    expect(replayBody).toHaveProperty("omniscient", null);

    const profile = await server.inject({ method: "GET", url: "/api/profile" });
    expect(profile.statusCode).toBe(200);
    const profileBody = JSON.parse(profile.body) as { narratorStatus: string };
    expect(profileBody.narratorStatus).toBe("templates");

    const drill = await server.inject({
      method: "POST",
      url: "/api/drills/sessions",
      payload: { conceptIds: ["tile_recognition"] },
    });
    expect(drill.statusCode).toBe(200);
    const drillBody = JSON.parse(drill.body) as {
      sessionId: string;
      items: { choices: string[] }[];
    };
    const answer = await server.inject({
      method: "POST",
      url: `/api/drills/sessions/${encodeURIComponent(drillBody.sessionId)}/answers`,
      payload: {
        requestId: "surface-drill-1",
        answer: drillBody.items[0]?.choices[0],
        hintLevel: "none",
      },
    });
    expect(answer.statusCode).toBe(200);

    const exported = await server.inject({ method: "GET", url: "/api/export" });
    expect(exported.statusCode).toBe(200);
    const exportBody = JSON.parse(exported.body) as { format: string };
    expect(exportBody.format).toBe("hk-mahjong-persistence");
  });

  it("serves seeded rooms, rules details, and a gated sandbox omniscient replay", async () => {
    const server = await buildServer({ databasePath: ":memory:" });
    servers.push(server);

    const demos = await server.inject({ method: "GET", url: "/api/demos" });
    expect(demos.statusCode).toBe(200);
    const demoBody = JSON.parse(demos.body) as { id: string; seed: string }[];
    expect(demoBody).toHaveLength(10);
    expect(demoBody.map(({ id }) => id)).toContain("demo_robbing_kong");
    expect(demoBody.every(({ id, seed }) => id === seed)).toBe(true);

    const details = await server.inject({
      method: "GET",
      url: "/api/rulesets/hk_nyc_social_v1/details",
    });
    expect(details.statusCode).toBe(200);
    const detailsBody = JSON.parse(details.body) as {
      id: string;
      scoringRules: { id: string; names: Record<string, string> }[];
    };
    expect(detailsBody.id).toBe("hk_nyc_social_v1");
    expect(
      detailsBody.scoringRules.some(
        ({ id, names }) => id === "dragon_pung" && names.en === "Dragon Pung or Kong",
      ),
    ).toBe(true);

    const created = await server.inject({
      method: "POST",
      url: "/api/games",
      payload: {
        mode: "sandbox",
        rulesetId: "training_relaxed_v1",
        matchLength: "one_wind",
        seed: "sandbox-omniscient-surface",
        human: { displayName: "Learner", preferredSeat: "east" },
        opponents: [
          { displayName: "Ming", difficulty: "basic", personality: "fast" },
          { displayName: "Jade", difficulty: "basic", personality: "value" },
          { displayName: "Alex", difficulty: "basic", personality: "balanced" },
        ],
        coach: { enabled: false, provider: "templates", verbosity: "brief" },
      },
    });
    const game = JSON.parse(created.body) as { game: { gameId: string } };
    const omniscient = await server.inject({
      method: "GET",
      url: `/api/games/${game.game.gameId}/replay?playerId=player-0&branchId=main&omniscient=true`,
    });
    expect(omniscient.statusCode).toBe(200);
    const omniscientBody = JSON.parse(omniscient.body) as {
      omniscientAvailable: boolean;
      omniscient: { players: { concealedTiles: string[] }[] } | null;
    };
    expect(omniscientBody.omniscientAvailable).toBe(true);
    expect(omniscientBody.omniscient?.players).toHaveLength(4);
    expect(
      omniscientBody.omniscient?.players.every(({ concealedTiles }) => concealedTiles.length > 0),
    ).toBe(true);
  });

  it("composes an injected narrator only on the server boundary", async () => {
    const server = await buildServer({
      databasePath: ":memory:",
      narrator: new TemplateCoachNarrator(),
    });
    servers.push(server);
    const profile = await server.inject({ method: "GET", url: "/api/profile" });
    expect(profile.statusCode).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({ narratorStatus: "provider_available" });
    const created = await server.inject({
      method: "POST",
      url: "/api/games",
      payload: {
        mode: "guided",
        rulesetId: "hk_nyc_social_v1",
        matchLength: "one_wind",
        seed: "server-provider-boundary",
        human: { displayName: "Learner", preferredSeat: "east" },
        opponents: [
          { displayName: "Ming", difficulty: "basic", personality: "fast" },
          { displayName: "Jade", difficulty: "basic", personality: "value" },
          { displayName: "Alex", difficulty: "basic", personality: "balanced" },
        ],
        coach: { enabled: true, provider: "openai", verbosity: "brief" },
      },
    });
    const game = JSON.parse(created.body) as {
      game: { gameId: string; branchId: string };
      observation: { revision: number };
    };
    const hint = await server.inject({
      method: "POST",
      url: `/api/games/${game.game.gameId}/hints`,
      payload: {
        playerId: "player-0",
        branchId: game.game.branchId,
        expectedRevision: game.observation.revision,
        requestId: "server-provider-hint",
        level: "reveal",
      },
    });
    expect(hint.statusCode).toBe(200);
    expect(JSON.parse(hint.body)).toHaveProperty("status", "provider");
    expect(JSON.stringify(JSON.parse(hint.body))).not.toContain("apiKey");
  });
});
