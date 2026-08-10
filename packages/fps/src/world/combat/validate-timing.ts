import { distance2 } from "../coordinates.js";
import type { CombatDistrictPlan, CombatNode, CombatTravelMetrics } from "../world-types.js";

export interface TimingValidation {
  readonly valid: boolean;
  readonly failures: readonly {
    readonly code: "route-time" | "defender-advantage" | "site-rotation";
    readonly message: string;
    readonly nodeIds: readonly string[];
  }[];
  readonly metrics: CombatTravelMetrics;
}

const shortestPath = (
  nodes: readonly CombatNode[],
  plan: Pick<CombatDistrictPlan, "edges">,
  fromNodeId: string,
  toNodeId: string,
): number => {
  const distances = new Map(nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  distances.set(fromNodeId, 0);
  const visited = new Set<string>();
  while (visited.size < nodes.length) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [nodeId, value] of distances) {
      if (!visited.has(nodeId) && value < best) {
        current = nodeId;
        best = value;
      }
    }
    if (current === null) break;
    if (current === toNodeId) return best;
    visited.add(current);
    for (const edge of plan.edges) {
      const neighbor =
        edge.fromNodeId === current
          ? edge.toNodeId
          : edge.toNodeId === current
            ? edge.fromNodeId
            : null;
      if (neighbor === null || visited.has(neighbor)) continue;
      const candidate = best + edge.lengthM;
      if (candidate < (distances.get(neighbor) ?? Number.POSITIVE_INFINITY))
        distances.set(neighbor, candidate);
    }
  }
  return Number.POSITIVE_INFINITY;
};

const findNode = (nodes: readonly CombatNode[], id: string): CombatNode => {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`world_combat_node_missing_${id}`);
  return node;
};

export const calculateCombatTravel = (
  plan: Pick<CombatDistrictPlan, "nodes" | "edges">,
  nominalRunSpeedMps: number,
): CombatTravelMetrics => {
  if (!Number.isFinite(nominalRunSpeedMps) || nominalRunSpeedMps <= 0) {
    throw new Error("world_invalid_nominal_run_speed");
  }
  const seconds = (from: string, to: string): number =>
    shortestPath(plan.nodes, plan, from, to) / nominalRunSpeedMps;
  const attackerToASeconds = seconds("attacker-spawn", "objective-a");
  const attackerToBSeconds = seconds("attacker-spawn", "objective-b");
  const defenderToASeconds = seconds("defender-spawn", "objective-a");
  const defenderToBSeconds = seconds("defender-spawn", "objective-b");
  const siteToSiteSeconds = seconds("objective-a", "objective-b");
  const firstContactSeconds = seconds("attacker-spawn", "arena");
  // Force all named nodes to exist before returning a metric object. This gives
  // malformed template edits a deterministic error instead of NaN telemetry.
  void findNode(plan.nodes, "attacker-spawn");
  void findNode(plan.nodes, "defender-spawn");
  return {
    attackerToASeconds,
    attackerToBSeconds,
    defenderToASeconds,
    defenderToBSeconds,
    siteToSiteSeconds,
    firstContactSeconds,
  };
};

export const validateTiming = (
  plan: Pick<CombatDistrictPlan, "nodes" | "edges">,
  nominalRunSpeedMps: number,
): TimingValidation => {
  const metrics = calculateCombatTravel(plan, nominalRunSpeedMps);
  const failures: TimingValidation["failures"][number][] = [];
  const attackerDifference = Math.abs(metrics.attackerToASeconds - metrics.attackerToBSeconds);
  const attackerMean = Math.max(
    0.001,
    (metrics.attackerToASeconds + metrics.attackerToBSeconds) / 2,
  );
  if (attackerDifference / attackerMean > 0.2) {
    failures.push({
      code: "route-time",
      message: "attacker route times differ by more than 20%",
      nodeIds: ["attacker-spawn", "objective-a", "objective-b"],
    });
  }
  const defenderAdvantageA = metrics.attackerToASeconds - metrics.defenderToASeconds;
  const defenderAdvantageB = metrics.attackerToBSeconds - metrics.defenderToBSeconds;
  if (
    defenderAdvantageA < 2 ||
    defenderAdvantageA > 5 ||
    defenderAdvantageB < 2 ||
    defenderAdvantageB > 5
  ) {
    failures.push({
      code: "defender-advantage",
      message: "defender arrival advantage is outside the configured 2–5 second envelope",
      nodeIds: ["attacker-spawn", "defender-spawn", "objective-a", "objective-b"],
    });
  }
  if (metrics.siteToSiteSeconds < 15 || metrics.siteToSiteSeconds > 30) {
    failures.push({
      code: "site-rotation",
      message: "site-to-site rotation is outside the configured 15–30 second envelope",
      nodeIds: ["objective-a", "objective-b"],
    });
  }
  if (metrics.firstContactSeconds < 10 || metrics.firstContactSeconds > 20) {
    failures.push({
      code: "route-time",
      message: "first-contact route is outside the configured 10–20 second envelope",
      nodeIds: ["attacker-spawn", "arena"],
    });
  }
  return { valid: failures.length === 0, failures, metrics };
};

export const directDistance = (
  plan: Pick<CombatDistrictPlan, "nodes">,
  from: string,
  to: string,
): number => distance2(findNode(plan.nodes, from).position, findNode(plan.nodes, to).position);
