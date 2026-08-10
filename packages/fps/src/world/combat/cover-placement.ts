import { containsPoint, intersectsBounds } from "../coordinates.js";
import type { Bounds2, CombatEdge, CombatOpenArea, CoverPlacement } from "../world-types.js";
import { combatRouteBounds } from "./route-carving.js";

export const validateCoverPlacement = (
  openAreas: readonly CombatOpenArea[],
  covers: readonly CoverPlacement[],
  edges: readonly CombatEdge[],
): readonly { readonly code: "missing-cover" | "cover-blocks-route"; readonly message: string }[] => {
  const failures: { readonly code: "missing-cover" | "cover-blocks-route"; readonly message: string }[] = [];
  for (const area of openAreas) {
    if (!covers.some((cover) => cover.openAreaId === area.id && intersectsBounds(cover.bounds, area.bounds))) {
      failures.push({ code: "missing-cover", message: `open area ${area.id} has no cover` });
    }
  }
  for (const cover of covers) {
    if (edges.some((edge) => combatRouteBounds(edge, 0).some((route) => intersectsBounds(cover.bounds, route)))) {
      failures.push({ code: "cover-blocks-route", message: `cover ${cover.id} blocks a route` });
    }
  }
  return failures;
};

const coverInside = (bounds: Bounds2, area: Bounds2): boolean =>
  containsPoint(area, { x: bounds.minX, z: bounds.minZ }) &&
  containsPoint(area, { x: bounds.maxX, z: bounds.maxZ });

/** Move a seeded cover object to the first deterministic open cell when a
 * quarter-turn transform places it on top of a route. */
export const repairCoverPlacement = (
  openAreas: readonly CombatOpenArea[],
  covers: readonly CoverPlacement[],
  edges: readonly CombatEdge[],
): readonly CoverPlacement[] => {
  const repaired: CoverPlacement[] = [];
  for (const cover of covers) {
    const area = openAreas.find((candidate) => candidate.id === cover.openAreaId);
    if (area === undefined) continue;
    const blockedByRoute = (bounds: Bounds2): boolean =>
      edges.some((edge) => combatRouteBounds(edge, 0).some((route) => intersectsBounds(bounds, route)));
    if (coverInside(cover.bounds, area.bounds) && !blockedByRoute(cover.bounds)) {
      repaired.push(cover);
      continue;
    }
    const width = cover.bounds.maxX - cover.bounds.minX;
    const depth = cover.bounds.maxZ - cover.bounds.minZ;
    let replacement: CoverPlacement | null = null;
    for (let z = area.bounds.minZ + depth / 2; z <= area.bounds.maxZ - depth / 2 && replacement === null; z += 5) {
      for (let x = area.bounds.minX + width / 2; x <= area.bounds.maxX - width / 2; x += 5) {
        const bounds: Bounds2 = { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
        if (blockedByRoute(bounds)) continue;
        replacement = { ...cover, bounds };
        break;
      }
    }
    if (replacement !== null) repaired.push(replacement);
  }
  return repaired;
};
