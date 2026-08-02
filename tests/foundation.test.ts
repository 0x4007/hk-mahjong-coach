import { describe, expect, it } from "vitest";
import { CORE_SCHEMA_VERSION } from "@hk-mahjong/core";
import { PROTOCOL_VERSION } from "@hk-mahjong/protocol";

describe("workspace foundation", () => {
  it("pins the authoritative schema and protocol versions", () => {
    expect(CORE_SCHEMA_VERSION).toBe(1);
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
