export const VISUAL_DEBUG_PANEL_STATE_STORAGE_KEY = "hk-mahjong-coach:visual-debug-panel-state:v1";

export const readVisualDebugPanelExpanded = (
  storage: Storage | null | undefined,
  defaultExpanded: boolean,
): boolean => {
  if (storage === null || storage === undefined) {
    return defaultExpanded;
  }
  try {
    const stored = storage.getItem(VISUAL_DEBUG_PANEL_STATE_STORAGE_KEY);
    if (stored === "expanded") {
      return true;
    }
    if (stored === "collapsed") {
      return false;
    }
  } catch {
    // Browser storage is best-effort for the development-only panel.
  }
  return defaultExpanded;
};

export const writeVisualDebugPanelExpanded = (
  storage: Storage | null | undefined,
  expanded: boolean,
): boolean => {
  if (storage === null || storage === undefined) {
    return false;
  }
  try {
    storage.setItem(VISUAL_DEBUG_PANEL_STATE_STORAGE_KEY, expanded ? "expanded" : "collapsed");
    return true;
  } catch {
    return false;
  }
};
