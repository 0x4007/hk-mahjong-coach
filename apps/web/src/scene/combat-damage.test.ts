import { describe, expect, it, vi } from "vitest";

import {
  createCombatDamageRouter,
  HEADSHOT_DAMAGE_THRESHOLD,
  resolveCombatDamageAmount,
  type CombatDamageApplicationResult,
} from "./combat-damage.js";
import { createPlayerVitals, PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD } from "./player-vitals.js";

describe("central combat damage router", () => {
  it("makes an unshielded headshot lethal only above the per-bullet threshold", () => {
    const state = { health: 100, shield: 0 } as const;
    const weapon = { kind: "weapon" } as const;

    expect(resolveCombatDamageAmount(state, HEADSHOT_DAMAGE_THRESHOLD, weapon, "head")).toBe(
      HEADSHOT_DAMAGE_THRESHOLD,
    );
    expect(resolveCombatDamageAmount(state, 26, weapon, "head")).toBe(state.health);
    expect(resolveCombatDamageAmount(state, 36, weapon, "body")).toBe(36);
    expect(resolveCombatDamageAmount(state, 36, { kind: "melee" }, "head")).toBe(36);
  });

  it("keeps a qualifying headshot non-lethal while any shield remains", () => {
    expect(
      resolveCombatDamageAmount({ health: 100, shield: 1 }, 100, { kind: "weapon" }, "head"),
    ).toBe(100);
  });

  it("applies a qualifying headshot through the router and invokes the kill hook", () => {
    const router = createCombatDamageRouter();
    let botVitals = createPlayerVitals();
    botVitals = { ...botVitals, shield: 0 };
    const onKilled = vi.fn<(result: CombatDamageApplicationResult) => void>();
    router.register({
      id: "bot:headshot",
      kind: "bot",
      getVitals: () => botVitals,
      setVitals: (nextVitals) => {
        botVitals = nextVitals;
      },
      onKilled,
    });

    const result = router.apply({
      targetId: "bot:headshot",
      amount: 36,
      source: { kind: "weapon", id: "carbine" },
      hitZone: "head",
      attackerId: "player",
    });

    expect(result.killed).toBe(true);
    expect(result.healthDamage).toBe(100);
    expect(botVitals.isDead).toBe(true);
    expect(onKilled).toHaveBeenCalledOnce();
  });

  it("keeps a shotgun pellet below threshold as ordinary unshielded damage", () => {
    const router = createCombatDamageRouter();
    let botVitals = createPlayerVitals();
    botVitals = { ...botVitals, shield: 0 };
    router.register({
      id: "bot:shotgun-pellet",
      kind: "bot",
      getVitals: () => botVitals,
      setVitals: (nextVitals) => {
        botVitals = nextVitals;
      },
    });

    const result = router.apply({
      targetId: "bot:shotgun-pellet",
      amount: 16,
      source: { kind: "weapon", id: "shotgun" },
      hitZone: "head",
    });

    expect(result.killed).toBe(false);
    expect(result.healthDamage).toBe(16);
    expect(botVitals.health).toBe(84);
  });

  it("routes the same shield-before-health reducer for a player and a bot", () => {
    const router = createCombatDamageRouter();
    let playerVitals = createPlayerVitals();
    let botVitals = createPlayerVitals();
    router.register({
      id: "player",
      kind: "player",
      getVitals: () => playerVitals,
      setVitals: (nextVitals) => {
        playerVitals = nextVitals;
      },
    });
    router.register({
      id: "bot:simulant",
      kind: "bot",
      getVitals: () => botVitals,
      setVitals: (nextVitals) => {
        botVitals = nextVitals;
      },
    });

    const playerResult = router.apply({
      targetId: "player",
      amount: 125,
      source: { kind: "weapon", id: "carbine" },
    });
    const botResult = router.apply({
      targetId: "bot:simulant",
      amount: 125,
      source: { kind: "melee", id: "bat" },
      attackerId: "player",
    });

    expect(playerResult.targetKind).toBe("player");
    expect(playerResult.shieldDamage).toBe(100);
    expect(playerResult.healthDamage).toBe(25);
    expect(playerVitals.shield).toBe(0);
    expect(playerVitals.health).toBe(75);
    expect(botResult.targetKind).toBe("bot");
    expect(botResult.attackerId).toBe("player");
    expect(botVitals.shield).toBe(0);
    expect(botVitals.health).toBe(75);
  });

  it("calls damage and death hooks once for a lethal bot hit", () => {
    const router = createCombatDamageRouter();
    let botVitals = createPlayerVitals();
    const onDamage = vi.fn<(result: CombatDamageApplicationResult) => void>();
    const onKilled = vi.fn<(result: CombatDamageApplicationResult) => void>();
    router.register({
      id: "bot:training",
      kind: "bot",
      getVitals: () => botVitals,
      setVitals: (nextVitals) => {
        botVitals = nextVitals;
      },
      onDamage,
      onKilled,
    });

    const result = router.apply({
      targetId: "bot:training",
      amount: PLAYER_MAX_HEALTH + PLAYER_MAX_SHIELD,
      source: { kind: "impact", id: "wall" },
    });

    expect(result.killed).toBe(true);
    expect(botVitals.isDead).toBe(true);
    expect(onDamage).toHaveBeenCalledOnce();
    expect(onKilled).toHaveBeenCalledOnce();
    router.apply({
      targetId: "bot:training",
      amount: 50,
      source: { kind: "melee", id: "bat" },
    });
    expect(onDamage).toHaveBeenCalledOnce();
    expect(onKilled).toHaveBeenCalledOnce();
  });

  it("fails loudly when a hit targets an unregistered actor", () => {
    const router = createCombatDamageRouter();

    expect(() =>
      router.apply({
        targetId: "bot:missing",
        amount: 10,
        source: { kind: "weapon" },
      }),
    ).toThrow("No combat damage target is registered for: bot:missing");
  });
});
