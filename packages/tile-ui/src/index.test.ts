import { TILE_DEFINITIONS } from "@hk-mahjong/core";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import {
  getTileFaceAccessibleDescription,
  getTileFaceInspector,
  getTileFaceVisual,
  resolveTileFaceState,
  TileFace,
  type TileFaceState,
} from "./index.js";

interface TileFaceElementProps {
  readonly "aria-label": string;
  readonly "aria-pressed"?: boolean;
  readonly "data-selected": string;
  readonly type?: "button";
}

describe("TileFace metadata and visual vocabulary", () => {
  it("covers all 42 core semantic types with complete inspector metadata", () => {
    const inspectors = TILE_DEFINITIONS.map((definition) => getTileFaceInspector(definition.id, 2));

    expect(inspectors).toHaveLength(42);
    expect(new Set(inspectors.map((inspector) => inspector.id)).size).toBe(42);

    for (const definition of TILE_DEFINITIONS) {
      const inspector = getTileFaceInspector(definition.id, 2);
      expect(inspector).toMatchObject({
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
        visibleCount: 2,
      });
      expect(inspector.accessibleDescription).toContain(definition.names.en);
      expect(inspector.accessibleDescription).toContain(definition.names.zhHant);
      expect(inspector.accessibleDescription).toContain(definition.names.zhHans);
      expect(inspector.accessibleDescription).toContain(definition.names.jyutping);
      expect(inspector.accessibleDescription).toContain(definition.names.pinyin);
      expect(inspector.accessibleDescription).toContain(definition.compactCode);
      expect(inspector.accessibleDescription).toContain("visible count 2");
    }
  });

  it("has explicit recognizability treatments for the white dragon and one bamboo", () => {
    expect(getTileFaceVisual("dragon.white")).toMatchObject({
      usesBirdMotif: false,
      usesWhiteDragonFrame: true,
    });
    expect(getTileFaceVisual("bamboo.1")).toMatchObject({
      usesBirdMotif: true,
      usesWhiteDragonFrame: false,
      mainLabel: "一索",
    });
  });

  it("resolves every requested appearance state without putting state in game logic", () => {
    const state: TileFaceState = resolveTileFaceState({
      face: "face-up",
      selected: true,
      disabled: true,
      recommended: true,
      drawn: true,
      claimed: true,
    });

    expect(state).toEqual({
      face: "face-up",
      selected: true,
      disabled: true,
      recommended: true,
      drawn: true,
      claimed: true,
    });
    expect(getTileFaceAccessibleDescription("dots.9", state, 1)).toContain(
      "Selected, Unavailable, Recommended, Recently drawn, Claimed",
    );
  });

  it("keeps a face-down tile identity out of labels, including its visible count", () => {
    for (const definition of TILE_DEFINITIONS) {
      const description = getTileFaceAccessibleDescription(
        definition.id,
        {
          face: "face-down",
          selected: true,
        },
        4,
      );
      expect(description).toBe("Face-down mahjong tile; Selected");
      expect(description).not.toContain(definition.names.en);
      expect(description).not.toContain(definition.names.zhHant);
      expect(description).not.toContain("visible count");
    }
  });

  it("uses native button semantics when a press handler is supplied", () => {
    const tile = TileFace({
      tile: "characters.1",
      selected: true,
      onPress: () => undefined,
    }) as ReactElement<TileFaceElementProps>;
    const faceDownTile = TileFace({
      tile: "dragon.white",
      face: "face-down",
    }) as ReactElement<TileFaceElementProps>;

    expect(tile.type).toBe("button");
    expect(tile.props.type).toBe("button");
    expect(tile.props["aria-pressed"]).toBe(true);
    expect(tile.props["data-selected"]).toBe("true");
    expect(tile.props["aria-label"]).toContain("One Character");
    expect(faceDownTile.type).toBe("span");
    expect(faceDownTile.props["aria-label"]).toBe("Face-down mahjong tile");
    expect(faceDownTile.props["aria-label"]).not.toContain("White Dragon");
  });
});
