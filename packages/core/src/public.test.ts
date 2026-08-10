import { describe, expect, it } from "vitest";
import * as publicCore from "./public.js";

describe("curated public core surface", () => {
  it("exports only observation-safe runtime helpers", () => {
    expect(Object.keys(publicCore).sort()).toEqual([
      "TILE_DEFINITIONS",
      "canonicalJsonHash",
      "compareTileInstances",
      "compareTileTypes",
      "createSeededRandom",
      "getTileDefinition",
      "sortTileTypes",
      "tileTypeFromInstanceId",
    ]);
  });
});
