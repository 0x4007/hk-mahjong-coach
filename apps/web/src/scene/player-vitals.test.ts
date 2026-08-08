import { describe, expect, it } from "vitest";

import {
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_O2,
  PLAYER_MAX_SHIELD,
  O2_CROUCHED_RECOVERY_PER_SECOND,
  O2_CROUCH_WALK_RECOVERY_DELAY_SECONDS,
  O2_HOLD_BREATH_ACTION_COST,
  O2_HOLD_BREATH_DRAIN_PER_SECOND,
  O2_HOLD_BREATH_REARM_THRESHOLD,
  O2_IDLE_RECOVERY_PER_SECOND,
  O2_JUMP_COST,
  O2_JUMP_RECOVERY_DELAY_SECONDS,
  O2_LANDING_BASE_COST,
  O2_LANDING_RECOVERY_DELAY_SECONDS,
  O2_MINI_HOP_SPEED_BLEND,
  O2_TROT_SPEED_BLEND,
  O2_PROJECTILE_DAMAGE_FACTOR,
  O2_STAND_COST,
  O2_SPRINT_DRAIN_PER_SECOND,
  O2_SPRINT_DURATION_SECONDS,
  O2_SPRINT_RECOVERY_DELAY_SECONDS,
  O2_WALKING_RECOVERY_PER_SECOND,
  SHIELD_RECHARGE_DELAY_SECONDS,
  SHIELD_RECHARGE_RATE_PER_SECOND,
  applyPlayerDamage,
  applyPlayerO2Cost,
  applyPlayerO2ImpactCost,
  applyPlayerProjectileO2Cost,
  canAffordPlayerO2Cost,
  createPlayerVitals,
  resolveProjectileO2Cost,
  setPlayerHoldingBreath,
  tickPlayerVitals,
} from "./player-vitals.js";

describe("player vitals model", () => {
  it("absorbs damage with shields before health", () => {
    const result = applyPlayerDamage(createPlayerVitals(), 30);

    expect(result.shieldDamage).toBe(30);
    expect(result.healthDamage).toBe(0);
    expect(result.state).toMatchObject({ health: PLAYER_MAX_HEALTH, shield: 70 });
    expect(result.state.timeSinceDamage).toBe(0);
    expect(result.state.o2).toBe(PLAYER_MAX_O2);
    expect(result.state.isDead).toBe(false);
  });

  it("carries overflow damage into health and reports a broken shield", () => {
    const damaged = applyPlayerDamage(createPlayerVitals(), PLAYER_MAX_SHIELD + 25);

    expect(damaged.shieldDamage).toBe(PLAYER_MAX_SHIELD);
    expect(damaged.healthDamage).toBe(25);
    expect(damaged.shieldBroken).toBe(true);
    expect(damaged.state).toMatchObject({ health: 75, shield: 0 });
  });

  it("waits for the no-damage delay before refilling shields", () => {
    const damaged = applyPlayerDamage(createPlayerVitals(), 40).state;

    expect(tickPlayerVitals(damaged, SHIELD_RECHARGE_DELAY_SECONDS - 0.01).shield).toBe(60);
    const refilling = tickPlayerVitals(damaged, SHIELD_RECHARGE_DELAY_SECONDS + 1);
    expect(refilling.shield).toBeCloseTo(60 + SHIELD_RECHARGE_RATE_PER_SECOND, 8);
    expect(refilling.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("applies recharge at the configured rate across repeated frame ticks", () => {
    const damaged = applyPlayerDamage(createPlayerVitals(), 80).state;
    const afterDelay = tickPlayerVitals(damaged, SHIELD_RECHARGE_DELAY_SECONDS);
    const afterOneSecond = tickPlayerVitals(afterDelay, 1);
    const afterAnotherSecond = tickPlayerVitals(afterOneSecond, 1);

    expect(afterOneSecond.shield).toBeCloseTo(20 + SHIELD_RECHARGE_RATE_PER_SECOND, 8);
    expect(afterAnotherSecond.shield).toBeCloseTo(20 + SHIELD_RECHARGE_RATE_PER_SECOND * 2, 8);
  });

  it("never exceeds shield capacity and does not recharge after death", () => {
    const full = tickPlayerVitals(
      applyPlayerDamage(createPlayerVitals(), 40).state,
      SHIELD_RECHARGE_DELAY_SECONDS + 10,
    );
    expect(full.shield).toBe(PLAYER_MAX_SHIELD);

    const dead = applyPlayerDamage(createPlayerVitals(), PLAYER_MAX_SHIELD + PLAYER_MAX_HEALTH);
    expect(dead.state.isDead).toBe(true);
    expect(tickPlayerVitals(dead.state, 100)).toEqual(dead.state);
  });

  it("uses the exact idle, walking, and crouched recovery rates", () => {
    const depleted = applyPlayerO2Cost(createPlayerVitals(), 50);
    const idle = tickPlayerVitals(depleted, 1);
    const walking = tickPlayerVitals(depleted, 1, { exerciseIntensity: 1, walking: true });
    const crouched = tickPlayerVitals(depleted, 1, { crouched: true });

    expect(idle.o2).toBeCloseTo(50 + O2_IDLE_RECOVERY_PER_SECOND, 8);
    expect(walking.o2).toBeCloseTo(50 + O2_WALKING_RECOVERY_PER_SECOND, 8);
    expect(crouched.o2).toBeCloseTo(50 + O2_CROUCHED_RECOVERY_PER_SECOND, 8);
  });

  it("taxes sprinting but keeps crouch-walking oxygen flat", () => {
    const sprinted = tickPlayerVitals(createPlayerVitals(), 1, {
      exerciseIntensity: 1,
      sprinting: true,
    });
    const crouchWalking = tickPlayerVitals(createPlayerVitals(), 1, {
      exerciseIntensity: 1,
      crouchWalking: true,
      crouched: true,
    });

    expect(sprinted.o2).toBeCloseTo(PLAYER_MAX_O2 - O2_SPRINT_DRAIN_PER_SECOND, 8);
    expect(crouchWalking.o2).toBe(PLAYER_MAX_O2);
  });

  it("does not recharge while crouch walking", () => {
    const depleted = applyPlayerO2Cost(createPlayerVitals(), 50);
    const crouchWalking = tickPlayerVitals(depleted, 5, {
      exerciseIntensity: 1,
      crouchWalking: true,
      crouched: true,
    });

    expect(crouchWalking.o2).toBe(depleted.o2);
    expect(crouchWalking.oxygenRecoveryDelaySeconds).toBe(O2_CROUCH_WALK_RECOVERY_DELAY_SECONDS);
  });

  it("slowly regenerates oxygen at the default standing trot", () => {
    const depleted = applyPlayerO2Cost(createPlayerVitals(), 50);
    const jogging = tickPlayerVitals(depleted, 1, {
      movementMagnitude: 1,
      locomotionBlend: O2_TROT_SPEED_BLEND,
      walking: true,
    });
    const expectedRecovery =
      O2_WALKING_RECOVERY_PER_SECOND * (1 - O2_TROT_SPEED_BLEND) -
      O2_SPRINT_DRAIN_PER_SECOND * O2_TROT_SPEED_BLEND;

    expect(O2_TROT_SPEED_BLEND).toBeCloseTo(0.25, 8);
    expect(expectedRecovery).toBeGreaterThan(0);
    expect(jogging.o2).toBeCloseTo(depleted.o2 + expectedRecovery, 8);
  });

  it("spends five percent oxygen on jumps and standing up", () => {
    const afterJump = applyPlayerO2Cost(
      createPlayerVitals(),
      O2_JUMP_COST,
      O2_JUMP_RECOVERY_DELAY_SECONDS,
    );
    const next = applyPlayerO2Cost(afterJump, O2_STAND_COST);

    expect(afterJump.o2).toBeCloseTo(PLAYER_MAX_O2 * 0.95, 8);
    expect(next.o2).toBeCloseTo(PLAYER_MAX_O2 * 0.9, 8);
    expect(afterJump.oxygenRecoveryDelaySeconds).toBe(O2_JUMP_RECOVERY_DELAY_SECONDS);
  });

  it("spends landing O₂ before carrying the unpaid impact into shields", () => {
    const fullReserve = applyPlayerO2ImpactCost(
      createPlayerVitals(),
      O2_LANDING_BASE_COST,
      O2_LANDING_RECOVERY_DELAY_SECONDS,
    );
    expect(fullReserve.oxygenSpent).toBe(O2_LANDING_BASE_COST);
    expect(fullReserve.state.o2).toBe(PLAYER_MAX_O2 - O2_LANDING_BASE_COST);
    expect(fullReserve.damage).toBe(0);
    expect(fullReserve.state.shield).toBe(PLAYER_MAX_SHIELD);
    expect(fullReserve.state.health).toBe(PLAYER_MAX_HEALTH);
    expect(fullReserve.state.oxygenRecoveryDelaySeconds).toBe(O2_LANDING_RECOVERY_DELAY_SECONDS);

    const lowReserve = applyPlayerO2Cost(createPlayerVitals(), PLAYER_MAX_O2 - 5);
    const overflow = applyPlayerO2ImpactCost(
      lowReserve,
      O2_LANDING_BASE_COST,
      O2_LANDING_RECOVERY_DELAY_SECONDS,
    );
    expect(overflow.oxygenSpent).toBe(5);
    expect(overflow.state.o2).toBe(0);
    expect(overflow.shieldDamage).toBe(O2_LANDING_BASE_COST - 5);
    expect(overflow.healthDamage).toBe(0);

    const emptyReserve = applyPlayerO2Cost(createPlayerVitals(), PLAYER_MAX_O2);
    const healthOverflow = applyPlayerO2ImpactCost(
      emptyReserve,
      PLAYER_MAX_SHIELD + 25,
      O2_LANDING_RECOVERY_DELAY_SECONDS,
    );
    expect(healthOverflow.oxygenSpent).toBe(0);
    expect(healthOverflow.shieldDamage).toBe(PLAYER_MAX_SHIELD);
    expect(healthOverflow.healthDamage).toBe(25);
  });

  it("derives the free mini-hop blend from standing recovery and the full jump charge", () => {
    expect(O2_MINI_HOP_SPEED_BLEND).toBeCloseTo(
      O2_IDLE_RECOVERY_PER_SECOND / (O2_IDLE_RECOVERY_PER_SECOND + O2_JUMP_COST),
      8,
    );
    expect(O2_MINI_HOP_SPEED_BLEND).toBeGreaterThan(0.5);
    expect(O2_MINI_HOP_SPEED_BLEND).toBeLessThan(1);
  });

  it("charges one quarter of every projectile's damage and counts every pellet", () => {
    expect(O2_PROJECTILE_DAMAGE_FACTOR).toBe(0.25);
    expect(resolveProjectileO2Cost(28)).toBe(7);
    expect(resolveProjectileO2Cost(12)).toBe(3);
    expect(resolveProjectileO2Cost(16, 8)).toBe(32);
    expect(resolveProjectileO2Cost(100)).toBe(25);

    const afterSniperRound = applyPlayerProjectileO2Cost(createPlayerVitals(), 100);
    expect(afterSniperRound.o2).toBe(75);

    let exhausted = afterSniperRound;
    for (let index = 0; index < 3; index += 1) {
      exhausted = applyPlayerProjectileO2Cost(exhausted, 100);
    }
    expect(exhausted.o2).toBe(0);

    const partialReserve = applyPlayerO2Cost(createPlayerVitals(), 90);
    expect(applyPlayerProjectileO2Cost(partialReserve, 100).o2).toBe(0);
  });

  it("requires enough reserve to pay each discrete action cost", () => {
    const exact = applyPlayerO2Cost(createPlayerVitals(), PLAYER_MAX_O2 - O2_JUMP_COST);
    const insufficient = applyPlayerO2Cost(
      createPlayerVitals(),
      PLAYER_MAX_O2 - O2_JUMP_COST + 0.01,
    );

    expect(canAffordPlayerO2Cost(exact, O2_JUMP_COST)).toBe(true);
    expect(canAffordPlayerO2Cost(insufficient, O2_JUMP_COST)).toBe(false);
    expect(applyPlayerO2Cost(exact, O2_JUMP_COST).o2).toBe(0);
    expect(applyPlayerO2Cost(insufficient, O2_JUMP_COST)).toEqual(insufficient);
  });

  it("requires one affordable action slice before holding breath", () => {
    const tinyReserve = applyPlayerO2Cost(createPlayerVitals(), PLAYER_MAX_O2 - 0.01);
    const sliceReserve = applyPlayerO2Cost(
      createPlayerVitals(),
      PLAYER_MAX_O2 - O2_HOLD_BREATH_ACTION_COST,
    );
    const emptyReserve = applyPlayerO2Cost(createPlayerVitals(), PLAYER_MAX_O2);

    expect(setPlayerHoldingBreath(tinyReserve, true, true).holdingBreath).toBe(false);
    expect(setPlayerHoldingBreath(sliceReserve, true, true).holdingBreath).toBe(true);
    expect(setPlayerHoldingBreath(emptyReserve, true, true).holdingBreath).toBe(false);
  });

  it("waits through sprint, crouch-walk, and jump recovery delays", () => {
    const exhausted = tickPlayerVitals(createPlayerVitals(), 5, {
      exerciseIntensity: 1,
      sprinting: true,
    });
    const sprintDelay = tickPlayerVitals(exhausted, O2_SPRINT_RECOVERY_DELAY_SECONDS);
    const sprintRecovery = tickPlayerVitals(sprintDelay, 1);
    const crouch = tickPlayerVitals(createPlayerVitals(), 1, {
      exerciseIntensity: 1,
      crouchWalking: true,
    });
    const crouchDelay = tickPlayerVitals(crouch, O2_CROUCH_WALK_RECOVERY_DELAY_SECONDS);
    const jump = applyPlayerO2Cost(
      createPlayerVitals(),
      O2_JUMP_COST,
      O2_JUMP_RECOVERY_DELAY_SECONDS,
    );
    const jumpDelay = tickPlayerVitals(jump, O2_JUMP_RECOVERY_DELAY_SECONDS);

    expect(sprintDelay.o2).toBe(exhausted.o2);
    expect(sprintDelay.oxygenRecoveryDelaySeconds).toBe(0);
    expect(sprintRecovery.o2).toBeCloseTo(exhausted.o2 + O2_IDLE_RECOVERY_PER_SECOND, 8);
    expect(crouchDelay.o2).toBe(crouch.o2);
    expect(crouchDelay.oxygenRecoveryDelaySeconds).toBe(0);
    expect(jumpDelay.o2).toBe(jump.o2);
    expect(jumpDelay.oxygenRecoveryDelaySeconds).toBe(0);
  });

  it("holds breath only while aiming, drains at fifteen per second, and rearms above twenty-five percent", () => {
    const notAiming = setPlayerHoldingBreath(createPlayerVitals(), true, false);
    const held = setPlayerHoldingBreath(createPlayerVitals(), true, true);
    const draining = tickPlayerVitals(held, 1, { aimingDownSights: true });
    const exhausted = tickPlayerVitals(held, 100, { aimingDownSights: true });
    const blocked = setPlayerHoldingBreath(exhausted, true, true);
    const belowRearm = tickPlayerVitals(exhausted, 2);
    const rearmed = tickPlayerVitals(belowRearm, 1);
    const activatedAgain = setPlayerHoldingBreath(rearmed, true, true);

    expect(notAiming.holdingBreath).toBe(false);
    expect(held.holdingBreath).toBe(true);
    expect(draining.o2).toBeCloseTo(PLAYER_MAX_O2 - O2_HOLD_BREATH_DRAIN_PER_SECOND, 8);
    expect(exhausted.o2).toBe(0);
    expect(exhausted.holdingBreath).toBe(false);
    expect(exhausted.holdBreathLocked).toBe(true);
    expect(blocked.holdingBreath).toBe(false);
    expect(belowRearm.o2).toBeCloseTo(O2_HOLD_BREATH_REARM_THRESHOLD - 1, 8);
    expect(rearmed.o2).toBeGreaterThan(O2_HOLD_BREATH_REARM_THRESHOLD);
    expect(rearmed.holdBreathLocked).toBe(false);
    expect(activatedAgain.holdingBreath).toBe(true);
  });

  it("depletes the reserve after approximately twenty consecutive jumps", () => {
    let state = createPlayerVitals();
    for (let index = 0; index < 20; index += 1) {
      state = applyPlayerO2Cost(state, O2_JUMP_COST, O2_JUMP_RECOVERY_DELAY_SECONDS);
    }

    expect(state.o2).toBe(0);
  });

  it("recovers oxygen after exercise stops and clamps at capacity", () => {
    const exhausted = tickPlayerVitals(createPlayerVitals(), 5, {
      exerciseIntensity: 1,
      sprinting: true,
    });
    const afterDelay = tickPlayerVitals(exhausted, O2_SPRINT_RECOVERY_DELAY_SECONDS);
    const recovering = tickPlayerVitals(afterDelay, 1);
    const full = tickPlayerVitals(recovering, 100);

    expect(recovering.o2).toBeCloseTo(
      PLAYER_MAX_O2 - O2_SPRINT_DRAIN_PER_SECOND * 5 + O2_IDLE_RECOVERY_PER_SECOND,
      8,
    );
    expect(full.o2).toBe(PLAYER_MAX_O2);
  });

  it("recovers while the failed sprint fallback keeps moving at trot", () => {
    const exhausted = tickPlayerVitals(createPlayerVitals(), O2_SPRINT_DURATION_SECONDS, {
      exerciseIntensity: 1,
      movementMagnitude: 1,
      locomotionBlend: 1,
      sprinting: true,
    });
    const trot = tickPlayerVitals(exhausted, O2_SPRINT_RECOVERY_DELAY_SECONDS + 1, {
      exerciseIntensity: 0.5,
      movementMagnitude: 1,
      locomotionBlend: O2_TROT_SPEED_BLEND,
      walking: true,
    });

    expect(exhausted.o2).toBe(0);
    expect(trot.o2).toBeGreaterThan(exhausted.o2);
  });

  it("ignores invalid or empty damage without resetting the recharge clock", () => {
    const damaged = applyPlayerDamage(createPlayerVitals(), 20).state;
    const ticking = tickPlayerVitals(damaged, 1);

    expect(applyPlayerDamage(ticking, 0).state).toEqual(ticking);
    expect(applyPlayerDamage(ticking, Number.NaN).state).toEqual(ticking);
  });
});
