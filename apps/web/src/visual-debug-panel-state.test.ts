import { describe, expect, it } from "vitest";

import {
  readVisualDebugPanelExpanded,
  VISUAL_DEBUG_PANEL_STATE_STORAGE_KEY,
  writeVisualDebugPanelExpanded,
} from "./visual-debug-panel-state.js";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

describe("visual debug panel disclosure state", () => {
  it("round-trips expanded and collapsed state through browser storage", () => {
    const storage = new MemoryStorage();

    expect(writeVisualDebugPanelExpanded(storage, false)).toBe(true);
    expect(readVisualDebugPanelExpanded(storage, true)).toBe(false);
    expect(writeVisualDebugPanelExpanded(storage, true)).toBe(true);
    expect(readVisualDebugPanelExpanded(storage, false)).toBe(true);
  });

  it("uses the device default when storage is missing or invalid", () => {
    const storage = new MemoryStorage();

    expect(readVisualDebugPanelExpanded(storage, true)).toBe(true);
    expect(readVisualDebugPanelExpanded(storage, false)).toBe(false);

    storage.setItem(VISUAL_DEBUG_PANEL_STATE_STORAGE_KEY, "unexpected");
    expect(readVisualDebugPanelExpanded(storage, true)).toBe(true);
    expect(readVisualDebugPanelExpanded(storage, false)).toBe(false);
    expect(readVisualDebugPanelExpanded(null, true)).toBe(true);
  });
});
