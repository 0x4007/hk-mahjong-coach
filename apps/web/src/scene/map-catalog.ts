import debugging01MapInput from "./maps/penthouse.json" with { type: "json" };

/** Stable IDs for the authored and procedural maps selectable in the browser. */
export type VisualMapId = "debugging-01" | "debugging-02" | "debugging-03";

export interface VisualMapDefinition {
  readonly id: VisualMapId;
  readonly label: string;
  readonly description: string;
  /** Authored JSON is validated by the scene's versioned map parser. */
  readonly document?: unknown;
  /** Procedural maps own their complete scene generator instead of a room document. */
  readonly generation: "authored" | "procedural";
}

export const DEFAULT_VISUAL_MAP_ID: VisualMapId = "debugging-01";

export const VISUAL_MAP_CATALOG: readonly VisualMapDefinition[] = [
  {
    id: "debugging-01",
    label: "Debugging 01",
    description: "Penthouse combat sandbox",
    document: debugging01MapInput,
    generation: "authored",
  },
  {
    id: "debugging-02",
    label: "Warehouse",
    description: "Industrial warehouse",
    generation: "procedural",
  },
  {
    id: "debugging-03",
    label: "Climbing Gym",
    description: "750 m procedural bouldering field",
    generation: "procedural",
  },
];

export const isVisualMapId = (value: unknown): value is VisualMapId =>
  value === "debugging-01" || value === "debugging-02" || value === "debugging-03";

/** Procedural maps own their complete world and do not load authored areas. */
export const isStandaloneProceduralVisualMap = (mapId: VisualMapId): boolean =>
  mapId === "debugging-02" || mapId === "debugging-03";

export const normalizeVisualMapId = (value: string | null | undefined): VisualMapId => {
  const normalized = value?.trim().toLowerCase();
  return isVisualMapId(normalized) ? normalized : DEFAULT_VISUAL_MAP_ID;
};

export const getVisualMapDefinition = (mapId: VisualMapId): VisualMapDefinition => {
  const definition = VISUAL_MAP_CATALOG.find((entry) => entry.id === mapId);
  if (definition === undefined) {
    throw new Error(`Unknown visual map: ${mapId}`);
  }
  return definition;
};
