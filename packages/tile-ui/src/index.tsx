import {
  getTileDefinition,
  type Rank,
  type TileCategory,
  type TileDefinition,
  type TileTypeId,
} from "@hk-mahjong/core";
import type { CSSProperties, MouseEvent, ReactElement } from "react";

/** Version of the local SVG tile vocabulary, independent from game rules. */
export const TILE_FACE_VERSION = "1.1.0" as const;

export type TileFaceSide = "face-up" | "face-down";
export type TileFaceRenderMode = "svg" | "text";

/** The complete visual state of a tile. Game clients decide when each state applies. */
export interface TileFaceState {
  readonly face: TileFaceSide;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly recommended: boolean;
  readonly drawn: boolean;
  readonly claimed: boolean;
}

export interface TileFaceStateInput {
  readonly face?: TileFaceSide;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly recommended?: boolean;
  readonly drawn?: boolean;
  readonly claimed?: boolean;
}

export interface TileFaceProps extends TileFaceStateInput {
  /** Semantic type ID only; physical tile identity is intentionally not needed for a face. */
  readonly tile: TileTypeId;
  /** Visible copies of this type, when the caller has a public count to show. */
  readonly visibleCount?: number;
  /** A compact text treatment for terminals or environments where SVG is unavailable. */
  readonly renderMode?: TileFaceRenderMode;
  /** Makes the tile a native 44px-or-larger button for keyboard and touch interaction. */
  readonly onPress?: (tile: TileTypeId, event: MouseEvent<HTMLButtonElement>) => void;
}

export interface TileFaceInspector {
  readonly id: TileTypeId;
  readonly english: string;
  readonly traditionalChinese: string;
  readonly simplifiedChinese: string;
  readonly jyutping: string;
  readonly pinyin: string;
  readonly compactCode: string;
  readonly category: TileCategory;
  readonly rank?: Rank;
  readonly terminal: boolean;
  readonly honor: boolean;
  readonly bonus: boolean;
  readonly visibleCount?: number;
  readonly accessibleDescription: string;
}

export interface TileFaceVisual {
  readonly id: TileTypeId;
  readonly category: TileCategory;
  readonly mainLabel: string;
  readonly compactCode: string;
  readonly rank?: Rank;
  readonly usesBirdMotif: boolean;
  readonly usesWhiteDragonFrame: boolean;
}

type TileFaceStatus = "selected" | "disabled" | "recommended" | "drawn" | "claimed";
type Point = readonly [x: number, y: number];

const DOT_POSITIONS: Readonly<Record<Rank, readonly Point[]>> = {
  1: [[40, 56]],
  2: [
    [27, 33],
    [53, 79],
  ],
  3: [
    [27, 33],
    [40, 56],
    [53, 79],
  ],
  4: [
    [25, 34],
    [55, 34],
    [25, 78],
    [55, 78],
  ],
  5: [
    [25, 34],
    [55, 34],
    [40, 56],
    [25, 78],
    [55, 78],
  ],
  6: [
    [25, 30],
    [55, 30],
    [25, 56],
    [55, 56],
    [25, 82],
    [55, 82],
  ],
  7: [
    [25, 28],
    [55, 28],
    [40, 46],
    [25, 58],
    [55, 58],
    [25, 84],
    [55, 84],
  ],
  8: [
    [25, 26],
    [55, 26],
    [25, 46],
    [55, 46],
    [25, 66],
    [55, 66],
    [25, 86],
    [55, 86],
  ],
  9: [
    [25, 29],
    [40, 29],
    [55, 29],
    [25, 56],
    [40, 56],
    [55, 56],
    [25, 83],
    [40, 83],
    [55, 83],
  ],
};

const faceColors: Readonly<Record<TileCategory, string>> = {
  characters: "#a72e3d",
  dots: "#315a9e",
  bamboo: "#246b4b",
  wind: "#26384f",
  dragon: "#3d3d3d",
  flower: "#7a447e",
  season: "#704e23",
};

const statusLabels: Readonly<Record<TileFaceStatus, string>> = {
  selected: "Selected",
  disabled: "Unavailable",
  recommended: "Recommended",
  drawn: "Recently drawn",
  claimed: "Claimed",
};

const defaultTileFaceState: TileFaceState = {
  face: "face-up",
  selected: false,
  disabled: false,
  recommended: false,
  drawn: false,
  claimed: false,
};

const getTileFaceStatuses = (state: TileFaceState): readonly TileFaceStatus[] => {
  const statuses: TileFaceStatus[] = [];
  if (state.selected) {
    statuses.push("selected");
  }
  if (state.disabled) {
    statuses.push("disabled");
  }
  if (state.recommended) {
    statuses.push("recommended");
  }
  if (state.drawn) {
    statuses.push("drawn");
  }
  if (state.claimed) {
    statuses.push("claimed");
  }
  return statuses;
};

const descriptionForDefinition = (definition: TileDefinition, visibleCount?: number): string => {
  const rank = definition.rank === undefined ? "unranked" : `rank ${String(definition.rank)}`;
  const flags = [
    definition.terminal ? "terminal" : "not terminal",
    definition.honor ? "honor" : "not an honor",
    definition.bonus ? "bonus tile" : "standard tile",
  ];
  const count = visibleCount === undefined ? "" : `; visible count ${String(visibleCount)}`;

  return (
    [
      `English ${definition.names.en}`,
      `Traditional Chinese ${definition.names.zhHant}`,
      `Simplified Chinese ${definition.names.zhHans}`,
      `Jyutping ${definition.names.jyutping}`,
      `pinyin ${definition.names.pinyin}`,
      `compact code ${definition.compactCode}`,
      `category ${definition.category}, ${rank}`,
      flags.join(", "),
    ].join("; ") + count
  );
};

const descriptionForState = (state: TileFaceState): string => {
  const statuses = getTileFaceStatuses(state).map((status) => statusLabels[status]);
  return statuses.length === 0 ? "" : `; ${statuses.join(", ")}`;
};

/** Resolves optional convenience props into a stable, fully typed appearance state. */
export const resolveTileFaceState = (input: TileFaceStateInput = {}): TileFaceState => ({
  face: input.face ?? defaultTileFaceState.face,
  selected: input.selected ?? defaultTileFaceState.selected,
  disabled: input.disabled ?? defaultTileFaceState.disabled,
  recommended: input.recommended ?? defaultTileFaceState.recommended,
  drawn: input.drawn ?? defaultTileFaceState.drawn,
  claimed: input.claimed ?? defaultTileFaceState.claimed,
});

/**
 * Returns every label needed by a tile inspector. This consumes only immutable core metadata;
 * it does not inspect a game, observation, wall, or hidden tile instance.
 */
export const getTileFaceInspector = (
  tile: TileTypeId,
  visibleCount?: number,
): TileFaceInspector => {
  const definition = getTileDefinition(tile);
  const inspector: TileFaceInspector = {
    id: definition.id,
    english: definition.names.en,
    traditionalChinese: definition.names.zhHant,
    simplifiedChinese: definition.names.zhHans,
    jyutping: definition.names.jyutping,
    pinyin: definition.names.pinyin,
    compactCode: definition.compactCode,
    category: definition.category,
    terminal: definition.terminal,
    honor: definition.honor,
    bonus: definition.bonus,
    accessibleDescription: descriptionForDefinition(definition, visibleCount),
    ...(definition.rank === undefined ? {} : { rank: definition.rank }),
    ...(visibleCount === undefined ? {} : { visibleCount }),
  };
  return inspector;
};

/** A small stable visual model for previews, visual regression checks, and text fallbacks. */
export const getTileFaceVisual = (tile: TileTypeId): TileFaceVisual => {
  const definition = getTileDefinition(tile);
  return {
    id: definition.id,
    category: definition.category,
    mainLabel: definition.names.zhHant,
    compactCode: definition.compactCode,
    usesBirdMotif: definition.id === "bamboo.1",
    usesWhiteDragonFrame: definition.id === "dragon.white",
    ...(definition.rank === undefined ? {} : { rank: definition.rank }),
  };
};

/**
 * Builds the name exposed by TileFace. Face-down tiles deliberately reveal no supplied metadata.
 */
export const getTileFaceAccessibleDescription = (
  tile: TileTypeId,
  stateInput: TileFaceStateInput = {},
  visibleCount?: number,
): string => {
  const state = resolveTileFaceState(stateInput);
  if (state.face === "face-down") {
    return `Face-down mahjong tile${descriptionForState(state)}`;
  }
  return `${getTileFaceInspector(tile, visibleCount).accessibleDescription}${descriptionForState(state)}`;
};

const rankFor = (definition: TileDefinition): Rank => {
  if (definition.rank === undefined) {
    throw new Error(`Expected a rank for ${definition.id}`);
  }
  return definition.rank;
};

const marker = (x: number, y: number, glyph: string, label: string): ReactElement => (
  <g aria-label={label} key={label}>
    <circle cx={x} cy={y} fill="#1b1b1b" r="7" />
    <text
      dominantBaseline="central"
      fill="#ffffff"
      fontFamily="system-ui, sans-serif"
      fontSize="9"
      fontWeight="700"
      textAnchor="middle"
      x={x}
      y={y + 0.5}
    >
      {glyph}
    </text>
  </g>
);

const TileStateMarkers = ({
  state,
  visibleCount,
}: {
  readonly state: TileFaceState;
  readonly visibleCount?: number;
}): ReactElement => (
  <>
    {state.selected ? marker(12, 21, "✓", statusLabels.selected) : null}
    {state.recommended ? marker(68, 21, "★", statusLabels.recommended) : null}
    {state.drawn ? marker(12, 91, "↓", statusLabels.drawn) : null}
    {state.claimed ? marker(68, 91, "↗", statusLabels.claimed) : null}
    {visibleCount === undefined ? null : (
      <text
        fill="#1b1b1b"
        fontFamily="system-ui, sans-serif"
        fontSize="8"
        fontWeight="700"
        textAnchor="middle"
        x="40"
        y="105"
      >
        {`×${String(visibleCount)}`}
      </text>
    )}
    {state.disabled ? (
      <>
        <path d="M8 91 65 22 72 28 15 97Z" fill="#1b1b1b" opacity="0.24" />
        <text
          fill="#1b1b1b"
          fontFamily="system-ui, sans-serif"
          fontSize="30"
          fontWeight="700"
          textAnchor="middle"
          x="40"
          y="66"
        >
          ×
        </text>
      </>
    ) : null}
  </>
);

const TileCorners = ({ definition }: { readonly definition: TileDefinition }): ReactElement => (
  <>
    <text
      fill="#303030"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      fontSize="8"
      fontWeight="700"
      x="10"
      y="18"
    >
      {definition.compactCode}
    </text>
    <text
      fill="#303030"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      fontSize="8"
      fontWeight="700"
      textAnchor="end"
      x="70"
      y="99"
    >
      {definition.compactCode}
    </text>
  </>
);

const CharactersFace = ({ definition }: { readonly definition: TileDefinition }): ReactElement => (
  <>
    <text
      fill={faceColors.characters}
      fontFamily="'PingFang TC', 'Noto Serif CJK TC', serif"
      fontSize="24"
      fontWeight="700"
      textAnchor="middle"
      x="40"
      y="63"
    >
      {definition.names.zhHant}
    </text>
    <text
      fill="#5a5a5a"
      fontFamily="system-ui, sans-serif"
      fontSize="7"
      letterSpacing="0.5"
      textAnchor="middle"
      x="40"
      y="78"
    >
      CHARACTERS
    </text>
  </>
);

const DotsFace = ({ definition }: { readonly definition: TileDefinition }): ReactElement => {
  const positions = DOT_POSITIONS[rankFor(definition)];
  return (
    <>
      {positions.map(([x, y], index) => {
        const fill = index % 3 === 0 ? "#b33b3d" : faceColors.dots;
        return (
          <g key={`${String(x)}-${String(y)}`}>
            <circle cx={x} cy={y} fill={fill} r="10" />
            <circle cx={x} cy={y} fill="#f9f6ee" r="3" />
          </g>
        );
      })}
    </>
  );
};

const OneBambooBird = (): ReactElement => (
  <g fill={faceColors.bamboo}>
    <path d="M40 29c9 2 16 8 19 17-8-4-15-3-19 2-4-5-11-6-19-2 3-9 10-15 19-17Z" />
    <path d="M39 45c7 1 12 7 12 14-5-4-11-4-16 0 0-7 2-11 4-14Z" fill="#b33b3d" />
    <path d="M29 59c4 7 10 11 18 11s14-4 18-11c-6 4-12 5-18 5s-12-1-18-5Z" />
    <circle cx="45" cy="43" fill="#f9f6ee" r="2" />
    <rect height="18" rx="3" width="7" x="37" y="72" />
    <rect height="6" rx="2" width="18" x="32" y="78" />
  </g>
);

const BambooFace = ({ definition }: { readonly definition: TileDefinition }): ReactElement => {
  const rank = rankFor(definition);
  if (rank === 1) {
    return <OneBambooBird />;
  }

  return (
    <>
      {DOT_POSITIONS[rank].map(([x, y]) => (
        <g key={`${String(x)}-${String(y)}`} fill={faceColors.bamboo}>
          <rect height="16" rx="3" width="8" x={x - 4} y={y - 8} />
          <rect fill="#d9eddf" height="4" rx="1" width="12" x={x - 6} y={y - 2} />
        </g>
      ))}
    </>
  );
};

const HonorFace = ({ definition }: { readonly definition: TileDefinition }): ReactElement => {
  const color =
    definition.id === "dragon.red"
      ? "#b33038"
      : definition.id === "dragon.green"
        ? "#26734c"
        : faceColors.wind;
  return (
    <>
      <text
        fill={color}
        fontFamily="'PingFang TC', 'Noto Serif CJK TC', serif"
        fontSize="34"
        fontWeight="700"
        textAnchor="middle"
        x="40"
        y="69"
      >
        {definition.names.zhHant}
      </text>
      <text
        fill="#5a5a5a"
        fontFamily="system-ui, sans-serif"
        fontSize="7"
        letterSpacing="0.5"
        textAnchor="middle"
        x="40"
        y="82"
      >
        {definition.category === "wind" ? "WIND" : "DRAGON"}
      </text>
    </>
  );
};

const WhiteDragonFace = (): ReactElement => (
  <>
    <rect fill="#26384f" height="48" rx="5" width="48" x="16" y="32" />
    <rect fill="#fffdf7" height="40" rx="2" width="40" x="20" y="36" />
    <text
      fill="#26384f"
      fontFamily="'PingFang TC', 'Noto Serif CJK TC', serif"
      fontSize="12"
      fontWeight="700"
      textAnchor="middle"
      x="40"
      y="61"
    >
      白
    </text>
    <text
      fill="#5a5a5a"
      fontFamily="system-ui, sans-serif"
      fontSize="7"
      letterSpacing="0.5"
      textAnchor="middle"
      x="40"
      y="91"
    >
      DRAGON
    </text>
  </>
);

const FlowerMotif = ({ id }: { readonly id: TileTypeId }): ReactElement => {
  switch (id) {
    case "flower.plum":
      return (
        <g fill={faceColors.flower}>
          <circle cx="40" cy="49" r="6" />
          <circle cx="32" cy="44" r="6" />
          <circle cx="32" cy="54" r="6" />
          <circle cx="48" cy="44" r="6" />
          <circle cx="48" cy="54" r="6" />
          <circle cx="40" cy="49" fill="#f8e5bd" r="2" />
        </g>
      );
    case "flower.orchid":
      return (
        <g fill={faceColors.flower}>
          <path d="M40 58c-12-2-16-11-13-18 8 2 12 8 13 18Z" />
          <path d="M40 58c12-2 16-11 13-18-8 2-12 8-13 18Z" />
          <path d="M40 58c-5 6-3 13 0 17 3-4 5-11 0-17Z" />
          <circle cx="40" cy="57" fill="#f8e5bd" r="3" />
        </g>
      );
    case "flower.chrysanthemum":
      return (
        <g fill={faceColors.flower}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((rotation) => (
            <rect
              height="8"
              key={rotation}
              rx="3"
              transform={`rotate(${String(rotation)} 40 52)`}
              width="20"
              x="30"
              y="48"
            />
          ))}
          <circle cx="40" cy="52" fill="#f8e5bd" r="5" />
        </g>
      );
    case "flower.bamboo":
      return (
        <g fill={faceColors.bamboo}>
          <rect height="34" rx="3" width="7" x="37" y="34" />
          <path d="M37 44c-12-1-15-8-15-13 9 1 14 5 15 13Z" />
          <path d="M44 56c12-1 15-8 15-13-9 1-14 5-15 13Z" />
          <path d="M37 63c-10 0-14 5-15 10 9 0 13-3 15-10Z" />
        </g>
      );
    default:
      return <g />;
  }
};

const SeasonMotif = ({ id }: { readonly id: TileTypeId }): ReactElement => {
  switch (id) {
    case "season.spring":
      return (
        <g fill={faceColors.season}>
          <path d="M40 68c-11-8-13-19-6-28 10 5 12 16 6 28Z" />
          <path d="M40 68c11-8 13-19 6-28-10 5-12 16-6 28Z" />
        </g>
      );
    case "season.summer":
      return (
        <g fill={faceColors.season}>
          <circle cx="40" cy="52" r="10" />
          <rect height="8" rx="2" width="4" x="38" y="34" />
          <rect height="8" rx="2" width="4" x="38" y="62" />
          <rect height="4" rx="2" width="8" x="22" y="50" />
          <rect height="4" rx="2" width="8" x="50" y="50" />
        </g>
      );
    case "season.autumn":
      return (
        <g fill={faceColors.season}>
          <path d="M40 34c15 10 15 27 0 38-15-11-15-28 0-38Z" />
          <rect fill="#f8e5bd" height="25" rx="1" width="3" x="39" y="42" />
        </g>
      );
    case "season.winter":
      return (
        <g fill={faceColors.season}>
          <rect height="32" rx="2" width="4" x="38" y="36" />
          <rect height="4" rx="2" width="32" x="24" y="50" />
          <rect height="4" rx="2" transform="rotate(45 40 52)" width="30" x="25" y="50" />
          <rect height="4" rx="2" transform="rotate(-45 40 52)" width="30" x="25" y="50" />
        </g>
      );
    default:
      return <g />;
  }
};

const BonusFace = ({ definition }: { readonly definition: TileDefinition }): ReactElement => {
  const motif =
    definition.category === "flower" ? (
      <FlowerMotif id={definition.id} />
    ) : (
      <SeasonMotif id={definition.id} />
    );
  return (
    <>
      {motif}
      <text
        fill={faceColors[definition.category]}
        fontFamily="'PingFang TC', 'Noto Serif CJK TC', serif"
        fontSize="20"
        fontWeight="700"
        textAnchor="middle"
        x="40"
        y="87"
      >
        {definition.names.zhHant}
      </text>
    </>
  );
};

const faceFor = (definition: TileDefinition): ReactElement => {
  switch (definition.category) {
    case "characters":
      return <CharactersFace definition={definition} />;
    case "dots":
      return <DotsFace definition={definition} />;
    case "bamboo":
      return <BambooFace definition={definition} />;
    case "wind":
      return <HonorFace definition={definition} />;
    case "dragon":
      return definition.id === "dragon.white" ? (
        <WhiteDragonFace />
      ) : (
        <HonorFace definition={definition} />
      );
    case "flower":
    case "season":
      return <BonusFace definition={definition} />;
  }
};

const TileBack = (): ReactElement => (
  <>
    <rect fill="#1f3148" height="104" rx="10" width="72" x="4" y="4" />
    <path d="M14 56 40 20 66 56 40 92Z" fill="#e5ddc9" opacity="0.22" />
    <path d="M28 56 40 39 52 56 40 73Z" fill="#e5ddc9" opacity="0.48" />
    <text
      fill="#f8f3e8"
      fontFamily="system-ui, sans-serif"
      fontSize="11"
      fontWeight="700"
      letterSpacing="1"
      textAnchor="middle"
      x="40"
      y="100"
    >
      BACK
    </text>
  </>
);

const TileSvg = ({
  definition,
  state,
  visibleCount,
}: {
  readonly definition: TileDefinition;
  readonly state: TileFaceState;
  readonly visibleCount?: number;
}): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    height="100%"
    preserveAspectRatio="xMidYMid meet"
    style={{ display: "block", forcedColorAdjust: "auto", overflow: "visible" }}
    viewBox="0 0 80 112"
    width="100%"
  >
    {state.face === "face-down" ? (
      <TileBack />
    ) : (
      <>
        <rect fill="#fffdf7" height="104" rx="10" width="72" x="4" y="4" />
        <rect fill="#f0ebdf" height="96" rx="7" width="64" x="8" y="8" />
        <rect fill="#fffdf7" height="92" rx="6" width="60" x="10" y="10" />
        <TileCorners definition={definition} />
        {faceFor(definition)}
      </>
    )}
    <TileStateMarkers
      state={state}
      {...(state.face === "face-up" && visibleCount !== undefined ? { visibleCount } : {})}
    />
  </svg>
);

const textFallbackStyle: CSSProperties = {
  alignItems: "center",
  background: "#fffdf7",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgb(0 0 0 / 0.16)",
  color: "#1b1b1b",
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 700,
  inlineSize: "100%",
  justifyContent: "center",
  lineHeight: 1.1,
  minBlockSize: "44px",
  textAlign: "center",
};

const TileTextFallback = ({
  definition,
  state,
  visibleCount,
}: {
  readonly definition: TileDefinition;
  readonly state: TileFaceState;
  readonly visibleCount?: number;
}): ReactElement => {
  const statuses = getTileFaceStatuses(state)
    .map(
      (status) =>
        ({
          selected: "✓",
          disabled: "×",
          recommended: "★",
          drawn: "↓",
          claimed: "↗",
        })[status],
    )
    .join(" ");
  const label = state.face === "face-down" ? "?" : definition.names.zhHant;
  const code = state.face === "face-down" ? "BACK" : definition.compactCode;

  return (
    <span aria-hidden="true" style={textFallbackStyle}>
      <span>{label}</span>
      <span
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "9px" }}
      >
        {code}
      </span>
      {state.face === "face-up" && visibleCount !== undefined ? (
        <span style={{ fontSize: "8px" }}>{`×${String(visibleCount)}`}</span>
      ) : null}
      {statuses.length > 0 ? <span style={{ fontSize: "10px" }}>{statuses}</span> : null}
    </span>
  );
};

const containerStyle = (disabled: boolean): CSSProperties => ({
  appearance: "none",
  background: "transparent",
  blockSize: "72px",
  border: 0,
  borderRadius: "8px",
  color: "#1b1b1b",
  cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex",
  inlineSize: "52px",
  margin: 0,
  minBlockSize: "44px",
  minInlineSize: "44px",
  padding: 0,
  position: "relative",
  touchAction: "manipulation",
  verticalAlign: "middle",
  WebkitTapHighlightColor: "transparent",
});

const staticContainerStyle: CSSProperties = {
  display: "inline-flex",
  inlineSize: "52px",
  position: "relative",
  verticalAlign: "middle",
};

const dataAttributesFor = (state: TileFaceState): Readonly<Record<string, string>> => ({
  "data-claimed": String(state.claimed),
  "data-disabled": String(state.disabled),
  "data-drawn": String(state.drawn),
  "data-face": state.face,
  "data-recommended": String(state.recommended),
  "data-selected": String(state.selected),
  "data-tile-face": "true",
});

/**
 * An original, local SVG mahjong tile. Supplying `onPress` produces a native button so its
 * keyboard and touch behavior comes from the platform; otherwise it is a labelled static image.
 */
export const TileFace = ({
  tile,
  visibleCount,
  renderMode = "svg",
  onPress,
  ...stateInput
}: TileFaceProps): ReactElement => {
  const state = resolveTileFaceState(stateInput);
  const definition = getTileDefinition(tile);
  const accessibleDescription = getTileFaceAccessibleDescription(tile, state, visibleCount);
  const content =
    renderMode === "text" ? (
      <TileTextFallback
        definition={definition}
        state={state}
        {...(visibleCount === undefined ? {} : { visibleCount })}
      />
    ) : (
      <TileSvg
        definition={definition}
        state={state}
        {...(visibleCount === undefined ? {} : { visibleCount })}
      />
    );
  const dataAttributes = dataAttributesFor(state);

  if (onPress !== undefined) {
    return (
      <button
        aria-label={accessibleDescription}
        aria-pressed={state.selected}
        disabled={state.disabled}
        onClick={(event) => onPress(tile, event)}
        style={containerStyle(state.disabled)}
        title={accessibleDescription}
        type="button"
        {...dataAttributes}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      aria-disabled={state.disabled || undefined}
      aria-label={accessibleDescription}
      role="img"
      style={staticContainerStyle}
      title={accessibleDescription}
      {...dataAttributes}
    >
      {content}
    </span>
  );
};
