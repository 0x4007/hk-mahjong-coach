import { describe, expect, it } from "vitest";
import { canonicalJsonHash } from "./canonical.js";
import { createSeededRandom, shuffle } from "./rng.js";
import {
  compareTileInstances,
  compareTileTypes,
  compactCodeForInstance,
  createTileInventory,
  createTileInstancesForType,
  getTileDefinition,
  isTileInstanceId,
  isTileTypeId,
  parseTileType,
  parseTileTypes,
  sortTileInstances,
  sortTileTypes,
  TILE_DEFINITIONS,
  type TileTypeId,
  tileTypeFromInstanceId,
} from "./tiles.js";

describe("canonical tile catalog", () => {
  it("defines all 42 semantic tile types with complete labels", () => {
    expect(TILE_DEFINITIONS).toHaveLength(42);
    expect(new Set(TILE_DEFINITIONS.map(({ id }) => id)).size).toBe(42);

    for (const definition of TILE_DEFINITIONS) {
      expect(definition.compactCode).not.toBe("");
      expect(
        [
          definition.names.en,
          definition.names.zhHant,
          definition.names.zhHans,
          definition.names.jyutping,
          definition.names.pinyin,
        ].every((name) => name.length > 0),
      ).toBe(true);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.names)).toBe(true);
      expect(parseTileType(definition.compactCode)).toBe(definition.id);
    }
    expect(() => Object.assign(getTileDefinition("wind.east").names, { en: "Changed" })).toThrow();
    expect(getTileDefinition("wind.east").names.en).toBe("East Wind");
  });

  it("creates exact 136- and 144-tile physical inventories", () => {
    const standard = createTileInventory(false);
    const withBonuses = createTileInventory(true);

    expect(standard).toHaveLength(136);
    expect(withBonuses).toHaveLength(144);
    expect(new Set(withBonuses).size).toBe(144);
    expect(standard.every((id) => !getTileDefinition(tileTypeFromInstanceId(id)).bonus)).toBe(true);
    expect(
      withBonuses.filter((id) => getTileDefinition(tileTypeFromInstanceId(id)).bonus),
    ).toHaveLength(8);

    const counts = new Map<string, number>();
    for (const instanceId of withBonuses) {
      const typeId = tileTypeFromInstanceId(instanceId);
      counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
    }
    for (const definition of TILE_DEFINITIONS) {
      expect(counts.get(definition.id)).toBe(definition.bonus ? 1 : 4);
    }
  });

  it("parses semantic IDs and every compact-code family", () => {
    expect(parseTileTypes("1m 9p 4s E S W N R G Wh F1 F4 S1 S4")).toEqual([
      "characters.1",
      "dots.9",
      "bamboo.4",
      "wind.east",
      "wind.south",
      "wind.west",
      "wind.north",
      "dragon.red",
      "dragon.green",
      "dragon.white",
      "flower.plum",
      "flower.bamboo",
      "season.spring",
      "season.winter",
    ]);
    expect(parseTileType("dragon.white")).toBe("dragon.white");
    expect(() => parseTileType("1z")).toThrow(/Unknown tile code/u);
    expect(() => parseTileType("wh")).toThrow(/Unknown tile code/u);
    expect(() => parseTileType("s")).toThrow(/Unknown tile code/u);
    expect(getTileDefinition("characters.2").names.en).toBe("Two Characters");
    expect(getTileDefinition("dots.2").names.jyutping).toBe("ji6 tung4");
    expect(parseTileTypes("   ")).toEqual([]);
    expect(isTileTypeId("wind.east")).toBe(true);
    expect(isTileTypeId("wind.invalid")).toBe(false);
    expect(() => getTileDefinition("wind.invalid" as TileTypeId)).toThrow(/Unknown tile type/u);
  });

  it("sorts by Characters, Dots, Bamboo, Winds, Dragons, Flowers, Seasons", () => {
    expect(
      sortTileTypes([
        "season.winter",
        "dragon.red",
        "wind.north",
        "wind.south",
        "characters.9",
        "bamboo.1",
        "dots.5",
        "wind.east",
        "characters.1",
        "flower.plum",
      ]),
    ).toEqual([
      "characters.1",
      "characters.9",
      "dots.5",
      "bamboo.1",
      "wind.east",
      "wind.south",
      "wind.north",
      "dragon.red",
      "flower.plum",
      "season.winter",
    ]);

    const canonicalIds = TILE_DEFINITIONS.map(({ id }) => id);
    const reversed = [...canonicalIds].reverse();
    expect(sortTileTypes(reversed)).toEqual(canonicalIds);
    expect(reversed).toEqual([...canonicalIds].reverse());
    expect(compareTileTypes("wind.east", "wind.east")).toBe(0);
    expect(() => compareTileTypes("not.real" as TileTypeId, "wind.east")).toThrow(
      /Unknown tile type/u,
    );
  });

  it("validates physical copy suffixes and renders compact codes", () => {
    expect(tileTypeFromInstanceId("characters.5#3")).toBe("characters.5");
    expect(compactCodeForInstance("dragon.white#1")).toBe("Wh");
    expect(() => tileTypeFromInstanceId("flower.plum#2")).toThrow(/physical copy/u);
    expect(() => tileTypeFromInstanceId("characters.5#5")).toThrow(/physical copy/u);
    expect(() => tileTypeFromInstanceId("not-an-instance")).toThrow(/Invalid tile instance ID/u);
    expect(() => tileTypeFromInstanceId("unknown.1#1")).toThrow(/Unknown tile type/u);
    expect(isTileInstanceId("dots.4#2")).toBe(true);
    expect(isTileInstanceId("dots.4#8")).toBe(false);
    expect(createTileInstancesForType("flower.plum")).toEqual(["flower.plum#1"]);
    expect(createTileInstancesForType("dots.1")).toEqual([
      "dots.1#1",
      "dots.1#2",
      "dots.1#3",
      "dots.1#4",
    ]);
    expect(
      sortTileInstances(["wind.east#4", "characters.1#2", "wind.east#1", "characters.1#1"]),
    ).toEqual(["characters.1#1", "characters.1#2", "wind.east#1", "wind.east#4"]);
    expect(compareTileInstances("wind.east#2", "wind.east#2")).toBe(0);
  });

  it("locks the canonical shuffled wall for both inventory profiles", () => {
    const standardWall = shuffle(createTileInventory(false), createSeededRandom("wall-golden-v1"));
    const bonusWall = shuffle(createTileInventory(true), createSeededRandom("wall-golden-v1"));

    expect(canonicalJsonHash(standardWall)).toBe(
      "6f1a08c11845158aa7c973ba6f7df329b4333d0fab42cd0e6b2577e654e1398b",
    );
    expect(canonicalJsonHash(bonusWall)).toBe(
      "481ab4bcd6c6997cba9ef3f22f7383dacc0ad2c9c5a6708ce5c06424eda617b1",
    );
  });
});
