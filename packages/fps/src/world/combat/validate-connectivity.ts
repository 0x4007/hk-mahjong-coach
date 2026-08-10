import type { CombatDistrictPlan, CombatNode } from "../world-types.js";

export interface ConnectivityValidation {
  readonly valid: boolean;
  readonly failures: readonly {
    readonly code: "unreachable-site" | "isolated-connector" | "multiple-components" | "dead-end" | "degree-limit";
    readonly message: string;
    readonly nodeIds: readonly string[];
  }[];
  readonly connectedComponentCount: number;
  readonly nodeDegrees: Readonly<Record<string, number>>;
}

const ordinaryNode = (node: CombatNode): boolean =>
  node.kind !== "attacker-spawn" &&
  node.kind !== "defender-spawn" &&
  node.kind !== "objective-a" &&
  node.kind !== "objective-b";

export const validateConnectivity = (plan: Pick<CombatDistrictPlan, "nodes" | "edges">): ConnectivityValidation => {
  const nodeIds = new Set(plan.nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  for (const node of plan.nodes) adjacency.set(node.id, new Set());
  for (const edge of plan.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) continue;
    adjacency.get(edge.fromNodeId)?.add(edge.toNodeId);
    adjacency.get(edge.toNodeId)?.add(edge.fromNodeId);
  }
  const nodeDegrees: Record<string, number> = {};
  for (const node of plan.nodes) nodeDegrees[node.id] = adjacency.get(node.id)?.size ?? 0;
  const failures: ConnectivityValidation["failures"][number][] = [];
  const unvisited = new Set(nodeIds);
  let connectedComponentCount = 0;
  while (unvisited.size > 0) {
    const first = unvisited.values().next().value!;
    connectedComponentCount += 1;
    const queue = [first];
    unvisited.delete(first);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!unvisited.has(neighbor)) continue;
        unvisited.delete(neighbor);
        queue.push(neighbor);
      }
    }
  }
  if (connectedComponentCount > 1) {
    failures.push({
      code: "multiple-components",
      message: `${String(connectedComponentCount)} disconnected combat components`,
      nodeIds: [...nodeIds],
    });
  }
  for (const node of plan.nodes) {
    const degree = nodeDegrees[node.id] ?? 0;
    if (ordinaryNode(node) && degree === 1) {
      failures.push({ code: "dead-end", message: `${node.id} is an unintended dead end`, nodeIds: [node.id] });
    }
    if (ordinaryNode(node) && degree > 3) {
      failures.push({ code: "degree-limit", message: `${node.id} has degree ${String(degree)}`, nodeIds: [node.id] });
    }
  }
  const reachableFrom = (sourceId: string): Set<string> => {
    const reachable = new Set<string>([sourceId]);
    const queue = [sourceId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (reachable.has(neighbor)) continue;
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
    return reachable;
  };
  const attackerReachable = reachableFrom("attacker-spawn");
  const defenderReachable = reachableFrom("defender-spawn");
  for (const site of ["objective-a", "objective-b"]) {
    if (!attackerReachable.has(site) || !defenderReachable.has(site)) {
      failures.push({ code: "unreachable-site", message: `${site} is not reachable by both teams`, nodeIds: [site] });
    }
  }
  return { valid: failures.length === 0, failures, connectedComponentCount, nodeDegrees };
};
