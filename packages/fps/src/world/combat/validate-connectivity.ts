import type { CombatDistrictPlan, CombatNode } from "../world-types.js";

export interface ConnectivityValidation {
  readonly valid: boolean;
  readonly failures: readonly {
    readonly code:
      | "unreachable-site"
      | "objective-entrance"
      | "primary-route"
      | "flanking-route"
      | "middle-control"
      | "isolated-connector"
      | "multiple-components"
      | "dead-end"
      | "degree-limit";
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

export const validateConnectivity = (
  plan: Pick<CombatDistrictPlan, "nodes" | "edges">,
): ConnectivityValidation => {
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
      failures.push({
        code: "dead-end",
        message: `${node.id} is an unintended dead end`,
        nodeIds: [node.id],
      });
    }
    if (ordinaryNode(node) && degree > 3) {
      failures.push({
        code: "degree-limit",
        message: `${node.id} has degree ${String(degree)}`,
        nodeIds: [node.id],
      });
    }
  }
  const objectiveIds = new Set(["objective-a", "objective-b"]);
  for (const objectiveId of objectiveIds) {
    const entranceEdges = plan.edges.filter(
      (edge) => edge.fromNodeId === objectiveId || edge.toNodeId === objectiveId,
    );
    const entranceNodeIds = new Set(
      entranceEdges.map((edge) =>
        edge.fromNodeId === objectiveId ? edge.toNodeId : edge.fromNodeId,
      ),
    );
    const degree = entranceNodeIds.size;
    const hasApproach = entranceEdges.some(
      (edge) => edge.routeRole === "a-side" || edge.routeRole === "b-side",
    );
    const hasDefenderEntry = entranceEdges.some((edge) => edge.routeRole === "defender");
    if (degree < 2 || degree > 3 || !hasApproach || !hasDefenderEntry) {
      failures.push({
        code: "objective-entrance",
        message: `${objectiveId} has ${String(degree)} distinct entrances; expected 2–3 with attacker and defender access`,
        nodeIds: [objectiveId],
      });
    }
  }
  const primaryRoles = new Set(["a-side", "middle", "b-side"]);
  for (const role of primaryRoles) {
    if (!plan.edges.some((edge) => edge.routeRole === role)) {
      failures.push({
        code: "primary-route",
        message: `required ${role} principal approach is missing`,
        nodeIds: [],
      });
    }
  }
  if (!plan.edges.some((edge) => edge.routeRole === "flank")) {
    failures.push({
      code: "flanking-route",
      message: "no explicit flanking route is present",
      nodeIds: [],
    });
  }
  const connectorCount = plan.edges.filter((edge) => edge.routeRole === "connector").length;
  if (connectorCount < 2 || connectorCount > 3) {
    failures.push({
      code: "isolated-connector",
      message: `expected 2–3 cross-connectors but found ${String(connectorCount)}`,
      nodeIds: plan.edges
        .filter((edge) => edge.routeRole === "connector")
        .flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
    });
  }
  const middleEdges = plan.edges.filter((edge) => edge.routeRole === "middle");
  const defenderEdges = new Set(
    plan.edges
      .filter((edge) => edge.routeRole === "defender")
      .flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
  );
  if (
    middleEdges.some(
      (edge) => defenderEdges.has(edge.fromNodeId) || defenderEdges.has(edge.toNodeId),
    )
  ) {
    failures.push({
      code: "middle-control",
      message: "defender route directly controls the middle lane",
      nodeIds: middleEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
    });
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
  const primaryCombatNodes = plan.nodes.filter(
    (node) =>
      node.kind === "objective-a" ||
      node.kind === "objective-b" ||
      node.kind === "arena" ||
      node.kind === "choke",
  );
  for (const node of primaryCombatNodes) {
    if (!attackerReachable.has(node.id) || !defenderReachable.has(node.id)) {
      failures.push({
        code: "unreachable-site",
        message: `${node.id} is not reachable by both teams`,
        nodeIds: [node.id],
      });
    }
  }
  return { valid: failures.length === 0, failures, connectedComponentCount, nodeDegrees };
};
