import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalJsonHash, sha256 } from "./canonical.js";

describe("canonical identity", () => {
  it("matches published SHA-256 vectors", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("你好")).toBe("670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e");
    expect(sha256("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });

  it("sorts object keys recursively without changing array order", () => {
    const first = { z: [{ b: 2, a: 1 }], a: true };
    const second = { a: true, z: [{ a: 1, b: 2 }] };

    expect(canonicalJson(first)).toBe('{"a":true,"z":[{"a":1,"b":2}]}');
    expect(canonicalJsonHash(first)).toBe(canonicalJsonHash(second));
  });

  it("rejects values that ordinary JSON would silently lose", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(/does not support undefined/u);
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite/u);
    expect(() => canonicalJson(new Date())).toThrow(/plain objects/u);
    expect(() => canonicalJson(Array(1))).toThrow(/sparse arrays/u);
    expect(() => canonicalJson("\ud800")).toThrow(/lone Unicode surrogates/u);
    expect(() => canonicalJson(1n)).toThrow(/does not support bigint/u);
    expect(() => canonicalJson(Symbol("no"))).toThrow(/does not support symbol/u);
    expect(() => canonicalJson(() => undefined)).toThrow(/does not support function/u);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cyclic values/u);
  });

  it("uses platform-neutral UTF-16 key ordering", () => {
    expect(canonicalJson({ ä: 1, z: 2, A: 3 })).toBe('{"A":3,"z":2,"ä":1}');
    expect(canonicalJson([null, true, false, -0, "😀"])).toBe('[null,true,false,0,"😀"]');
    expect(() => canonicalJson("\udc00")).toThrow(/lone Unicode surrogates/u);
  });

  it("bounds nesting before the JavaScript call stack becomes the failure mode", () => {
    let nested: unknown = null;
    for (let index = 0; index < 130; index += 1) {
      nested = [nested];
    }
    expect(() => canonicalJson(nested)).toThrow(/nesting exceeds/u);
  });
});
