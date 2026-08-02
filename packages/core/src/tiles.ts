export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["characters", "dots", "bamboo"] as const;
export type Suit = (typeof SUITS)[number];

export const TILE_CATEGORIES = [
  "characters",
  "dots",
  "bamboo",
  "wind",
  "dragon",
  "flower",
  "season",
] as const;
export type TileCategory = (typeof TILE_CATEGORIES)[number];

export type SuitedTileTypeId = `${Suit}.${Rank}`;
export type WindTileTypeId = `wind.${"east" | "south" | "west" | "north"}`;
export type DragonTileTypeId = `dragon.${"red" | "green" | "white"}`;
export type FlowerTileTypeId = `flower.${"plum" | "orchid" | "chrysanthemum" | "bamboo"}`;
export type SeasonTileTypeId = `season.${"spring" | "summer" | "autumn" | "winter"}`;
export type StandardTileTypeId = SuitedTileTypeId | WindTileTypeId | DragonTileTypeId;
export type BonusTileTypeId = FlowerTileTypeId | SeasonTileTypeId;
export type TileTypeId = StandardTileTypeId | BonusTileTypeId;
export type StandardTileCopy = 1 | 2 | 3 | 4;
export type TileInstanceId = `${StandardTileTypeId}#${StandardTileCopy}` | `${BonusTileTypeId}#1`;

export interface TileNames {
  readonly en: string;
  readonly zhHant: string;
  readonly zhHans: string;
  readonly jyutping: string;
  readonly pinyin: string;
}

export interface TileDefinition {
  readonly id: TileTypeId;
  readonly compactCode: string;
  readonly category: TileCategory;
  readonly rank?: Rank;
  readonly terminal: boolean;
  readonly honor: boolean;
  readonly bonus: boolean;
  readonly names: TileNames;
}

const ENGLISH_RANKS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
] as const;
const TRADITIONAL_RANKS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const SIMPLIFIED_RANKS = TRADITIONAL_RANKS;
const JYUTPING_RANKS = [
  "jat1",
  "ji6",
  "saam1",
  "sei3",
  "ng5",
  "luk6",
  "cat1",
  "baat3",
  "gau2",
] as const;
const PINYIN_RANKS = ["yī", "èr", "sān", "sì", "wǔ", "liù", "qī", "bā", "jiǔ"] as const;

const valueAt = <Value>(values: readonly Value[], index: number): Value => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing canonical tile metadata at index ${String(index)}`);
  }
  return value;
};

interface SuitLanguage {
  compactSuffix: "m" | "p" | "s";
  englishSingular: "Character" | "Dot" | "Bamboo";
  englishPlural: "Characters" | "Dots" | "Bamboo";
  traditional: string;
  simplified: string;
  jyutping: string;
  pinyin: string;
}

const SUIT_LANGUAGES: Readonly<Record<Suit, SuitLanguage>> = {
  characters: {
    compactSuffix: "m",
    englishSingular: "Character",
    englishPlural: "Characters",
    traditional: "萬",
    simplified: "万",
    jyutping: "maan6",
    pinyin: "wàn",
  },
  dots: {
    compactSuffix: "p",
    englishSingular: "Dot",
    englishPlural: "Dots",
    traditional: "筒",
    simplified: "筒",
    jyutping: "tung4",
    pinyin: "tǒng",
  },
  bamboo: {
    compactSuffix: "s",
    englishSingular: "Bamboo",
    englishPlural: "Bamboo",
    traditional: "索",
    simplified: "索",
    jyutping: "sok3",
    pinyin: "suǒ",
  },
};

const createSuitedDefinitions = (suit: Suit): readonly TileDefinition[] => {
  const language = SUIT_LANGUAGES[suit];
  return RANKS.map((rank, index) => {
    const englishRank = valueAt(ENGLISH_RANKS, index);
    const traditionalRank = valueAt(TRADITIONAL_RANKS, index);
    const simplifiedRank = valueAt(SIMPLIFIED_RANKS, index);
    const jyutpingRank = valueAt(JYUTPING_RANKS, index);
    const pinyinRank = valueAt(PINYIN_RANKS, index);

    return {
      id: `${suit}.${String(rank)}` as SuitedTileTypeId,
      compactCode: `${String(rank)}${language.compactSuffix}`,
      category: suit,
      rank,
      terminal: rank === 1 || rank === 9,
      honor: false,
      bonus: false,
      names: {
        en: `${englishRank} ${rank === 1 ? language.englishSingular : language.englishPlural}`,
        zhHant: `${traditionalRank}${language.traditional}`,
        zhHans: `${simplifiedRank}${language.simplified}`,
        jyutping: `${jyutpingRank} ${language.jyutping}`,
        pinyin: `${pinyinRank} ${language.pinyin}`,
      },
    };
  });
};

const HONOR_AND_BONUS_DEFINITIONS: readonly TileDefinition[] = [
  {
    id: "wind.east",
    compactCode: "E",
    category: "wind",
    terminal: false,
    honor: true,
    bonus: false,
    names: { en: "East Wind", zhHant: "東", zhHans: "东", jyutping: "dung1", pinyin: "dōng" },
  },
  {
    id: "wind.south",
    compactCode: "S",
    category: "wind",
    terminal: false,
    honor: true,
    bonus: false,
    names: { en: "South Wind", zhHant: "南", zhHans: "南", jyutping: "naam4", pinyin: "nán" },
  },
  {
    id: "wind.west",
    compactCode: "W",
    category: "wind",
    terminal: false,
    honor: true,
    bonus: false,
    names: { en: "West Wind", zhHant: "西", zhHans: "西", jyutping: "sai1", pinyin: "xī" },
  },
  {
    id: "wind.north",
    compactCode: "N",
    category: "wind",
    terminal: false,
    honor: true,
    bonus: false,
    names: { en: "North Wind", zhHant: "北", zhHans: "北", jyutping: "bak1", pinyin: "běi" },
  },
  {
    id: "dragon.red",
    compactCode: "R",
    category: "dragon",
    terminal: false,
    honor: true,
    bonus: false,
    names: {
      en: "Red Dragon",
      zhHant: "中",
      zhHans: "中",
      jyutping: "zung1",
      pinyin: "zhōng",
    },
  },
  {
    id: "dragon.green",
    compactCode: "G",
    category: "dragon",
    terminal: false,
    honor: true,
    bonus: false,
    names: {
      en: "Green Dragon",
      zhHant: "發",
      zhHans: "发",
      jyutping: "faat3",
      pinyin: "fā",
    },
  },
  {
    id: "dragon.white",
    compactCode: "Wh",
    category: "dragon",
    terminal: false,
    honor: true,
    bonus: false,
    names: {
      en: "White Dragon",
      zhHant: "白",
      zhHans: "白",
      jyutping: "baak6",
      pinyin: "bái",
    },
  },
  {
    id: "flower.plum",
    compactCode: "F1",
    category: "flower",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Plum", zhHant: "梅", zhHans: "梅", jyutping: "mui4", pinyin: "méi" },
  },
  {
    id: "flower.orchid",
    compactCode: "F2",
    category: "flower",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Orchid", zhHant: "蘭", zhHans: "兰", jyutping: "laan4", pinyin: "lán" },
  },
  {
    id: "flower.chrysanthemum",
    compactCode: "F3",
    category: "flower",
    terminal: false,
    honor: false,
    bonus: true,
    names: {
      en: "Chrysanthemum",
      zhHant: "菊",
      zhHans: "菊",
      jyutping: "guk1",
      pinyin: "jú",
    },
  },
  {
    id: "flower.bamboo",
    compactCode: "F4",
    category: "flower",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Bamboo", zhHant: "竹", zhHans: "竹", jyutping: "zuk1", pinyin: "zhú" },
  },
  {
    id: "season.spring",
    compactCode: "S1",
    category: "season",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Spring", zhHant: "春", zhHans: "春", jyutping: "ceon1", pinyin: "chūn" },
  },
  {
    id: "season.summer",
    compactCode: "S2",
    category: "season",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Summer", zhHant: "夏", zhHans: "夏", jyutping: "haa6", pinyin: "xià" },
  },
  {
    id: "season.autumn",
    compactCode: "S3",
    category: "season",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Autumn", zhHant: "秋", zhHans: "秋", jyutping: "cau1", pinyin: "qiū" },
  },
  {
    id: "season.winter",
    compactCode: "S4",
    category: "season",
    terminal: false,
    honor: false,
    bonus: true,
    names: { en: "Winter", zhHant: "冬", zhHans: "冬", jyutping: "dung1", pinyin: "dōng" },
  },
];

export const TILE_DEFINITIONS: readonly TileDefinition[] = Object.freeze(
  [
    ...createSuitedDefinitions("characters"),
    ...createSuitedDefinitions("dots"),
    ...createSuitedDefinitions("bamboo"),
    ...HONOR_AND_BONUS_DEFINITIONS,
  ].map((definition) =>
    Object.freeze({
      ...definition,
      names: Object.freeze({ ...definition.names }),
    }),
  ),
);

const tileDefinitionsById = new Map(
  TILE_DEFINITIONS.map((definition) => [definition.id, definition]),
);
const tileTypesByCompactCode = new Map(
  TILE_DEFINITIONS.map((definition) => [definition.compactCode, definition.id]),
);
const tileTypeOrder = new Map(TILE_DEFINITIONS.map(({ id }, index) => [id, index]));

if (
  TILE_DEFINITIONS.length !== 42 ||
  tileDefinitionsById.size !== TILE_DEFINITIONS.length ||
  tileTypesByCompactCode.size !== TILE_DEFINITIONS.length
) {
  throw new Error("The canonical tile catalog must contain 42 unique tile types");
}

export const isTileTypeId = (value: string): value is TileTypeId =>
  tileDefinitionsById.has(value as TileTypeId);

export const getTileDefinition = (id: TileTypeId): TileDefinition => {
  const definition = tileDefinitionsById.get(id);
  if (definition === undefined) {
    throw new RangeError(`Unknown tile type: ${id}`);
  }
  return definition;
};

export const parseTileType = (value: string): TileTypeId => {
  const normalized = value.trim();
  if (isTileTypeId(normalized)) {
    return normalized;
  }
  const tileType = tileTypesByCompactCode.get(normalized);
  if (tileType === undefined) {
    throw new RangeError(`Unknown tile code: ${value}`);
  }
  return tileType;
};

export const parseTileTypes = (notation: string): readonly TileTypeId[] => {
  const tokens = notation.trim().split(/\s+/u).filter(Boolean);
  return tokens.map(parseTileType);
};

const tileOrder = (tileType: TileTypeId): number => {
  const order = tileTypeOrder.get(tileType);
  if (order === undefined) {
    throw new RangeError(`Unknown tile type: ${tileType}`);
  }
  return order;
};

export const compareTileTypes = (left: TileTypeId, right: TileTypeId): number => {
  return tileOrder(left) - tileOrder(right);
};

export const sortTileTypes = (tileTypes: readonly TileTypeId[]): readonly TileTypeId[] =>
  [...tileTypes].sort(compareTileTypes);

export const createTileInstancesForType = (typeId: TileTypeId): readonly TileInstanceId[] => {
  const definition = getTileDefinition(typeId);
  if (definition.bonus) {
    return [`${typeId}#1` as TileInstanceId];
  }
  return ([1, 2, 3, 4] as const).map((copy) => `${typeId}#${String(copy)}` as TileInstanceId);
};

export const createTileInventory = (bonusTilesEnabled: boolean): readonly TileInstanceId[] =>
  TILE_DEFINITIONS.filter((definition) => bonusTilesEnabled || !definition.bonus).flatMap(
    (definition) => createTileInstancesForType(definition.id),
  );

export const tileTypeFromInstanceId = (instanceId: string): TileTypeId => {
  const separator = instanceId.lastIndexOf("#");
  if (separator < 1) {
    throw new RangeError(`Invalid tile instance ID: ${instanceId}`);
  }

  const typeText = instanceId.slice(0, separator);
  const copyText = instanceId.slice(separator + 1);
  if (!isTileTypeId(typeText)) {
    throw new RangeError(`Unknown tile type in instance ID: ${instanceId}`);
  }

  const definition = getTileDefinition(typeText);
  const validCopy = definition.bonus ? copyText === "1" : /^[1-4]$/u.test(copyText);
  if (!validCopy) {
    throw new RangeError(`Invalid physical copy in tile instance ID: ${instanceId}`);
  }
  return typeText;
};

export const isTileInstanceId = (value: string): value is TileInstanceId => {
  try {
    tileTypeFromInstanceId(value);
    return true;
  } catch {
    return false;
  }
};

export const compareTileInstances = (left: TileInstanceId, right: TileInstanceId): number => {
  const typeDifference = compareTileTypes(
    tileTypeFromInstanceId(left),
    tileTypeFromInstanceId(right),
  );
  if (typeDifference !== 0) {
    return typeDifference;
  }
  return (
    Number(left.slice(left.lastIndexOf("#") + 1)) - Number(right.slice(right.lastIndexOf("#") + 1))
  );
};

export const sortTileInstances = (tiles: readonly TileInstanceId[]): readonly TileInstanceId[] =>
  [...tiles].sort(compareTileInstances);

export const compactCodeForTile = (typeId: TileTypeId): string =>
  getTileDefinition(typeId).compactCode;

export const compactCodeForInstance = (instanceId: TileInstanceId): string =>
  compactCodeForTile(tileTypeFromInstanceId(instanceId));
