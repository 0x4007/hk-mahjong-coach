#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNREAL_DIR="$PROJECT_ROOT/unreal"
UPROJECT_FILE="$UNREAL_DIR/HkMahjongCoach.uproject"
UNREAL_EDITOR=""

UNREAL_EDITOR_APP=""

log() {
  printf '%s\n' "$*"
}

if [[ ! -f "$UPROJECT_FILE" ]]; then
  log "Cannot find Unreal project file at $UPROJECT_FILE"
  exit 1
fi

command -v UnrealEditor >/dev/null 2>&1 && UNREAL_EDITOR="$(command -v UnrealEditor)"
if [[ -z "$UNREAL_EDITOR" ]] && [[ "$(uname -s)" == "Darwin" ]]; then
  UNREAL_EDITOR="$(find /Applications '/Users/Shared/Epic Games' -maxdepth 8 -type f -name UnrealEditor \
    \( -path '*/UE_*/*/Binaries/Mac/UnrealEditor' -o -path '*/UE_*/*/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor' \) 2>/dev/null \
    | head -n 1 || true)"
fi

if [[ -z "$UNREAL_EDITOR" ]]; then
  UNREAL_EDITOR="$(find /Users -maxdepth 8 -type d -name 'UE_*' 2>/dev/null \
    | while IFS= read -r dir; do
      for bin in "$dir/Engine/Binaries/Linux/UnrealEditor" "$dir/Engine/Binaries/Win64/UnrealEditor.exe"; do
        [[ -f "$bin" ]] && printf '%s\n' "$bin" && break 2
      done
    done | head -n 1 || true)"
fi

if [[ -z "$UNREAL_EDITOR" ]]; then
  log "No Unreal Editor binary was found on this machine."
  log "Install Unreal Engine 5.4+ in Epic Games Launcher first, then run this script again."
  exit 1
fi

ENGINE_ROOT=""
if [[ "$UNREAL_EDITOR" == *"UnrealEditor.app/Contents/MacOS/UnrealEditor" ]]; then
  ENGINE_ROOT="${UNREAL_EDITOR%/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor*/}"
  UNREAL_EDITOR_APP="${UNREAL_EDITOR%/Contents/MacOS/UnrealEditor*}/UnrealEditor.app"
elif [[ "$UNREAL_EDITOR" == *"Engine/Binaries/Mac/UnrealEditor" ]]; then
  ENGINE_ROOT="${UNREAL_EDITOR%/Engine/Binaries/Mac/UnrealEditor}"
  if [[ -d "$ENGINE_ROOT/Engine/Binaries/Mac/UnrealEditor.app" ]]; then
    UNREAL_EDITOR_APP="$ENGINE_ROOT/Engine/Binaries/Mac/UnrealEditor.app"
  fi
fi

if [[ -z "$ENGINE_ROOT" ]]; then
  ENGINE_ROOT="${UNREAL_EDITOR%/Engine/Binaries/*}"
fi

log "Using Unreal Editor: $UNREAL_EDITOR"
log "Using engine root: $ENGINE_ROOT"

PROJECTFILES_SCRIPT=""
if [[ -f "$ENGINE_ROOT/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh" ]]; then
  PROJECTFILES_SCRIPT="$ENGINE_ROOT/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh"
elif [[ -f "$ENGINE_ROOT/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh" ]]; then
  PROJECTFILES_SCRIPT="$ENGINE_ROOT/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh"
elif [[ -f "$ENGINE_ROOT/Engine/Build/BatchFiles/GenerateProjectFiles.sh" ]]; then
  PROJECTFILES_SCRIPT="$ENGINE_ROOT/Engine/Build/BatchFiles/GenerateProjectFiles.sh"
fi

log "Generating Unreal project files from: $UPROJECT_FILE"
if [[ -n "$PROJECTFILES_SCRIPT" ]]; then
  chmod +x "$PROJECTFILES_SCRIPT"
  "$PROJECTFILES_SCRIPT" -project="$UPROJECT_FILE" -game -engine
else
  log "GenerateProjectFiles script not found; using Unreal editor CLI fallback."
  "$UNREAL_EDITOR" "$UPROJECT_FILE" -projectfiles -game
fi

log "Project file generation complete."
log "Open the project when ready:"
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ -n "$UNREAL_EDITOR_APP" && -d "$UNREAL_EDITOR_APP" ]]; then
    log "  open -a \"$UNREAL_EDITOR_APP\" \"$UPROJECT_FILE\""
  else
    log "  open \"$UPROJECT_FILE\""
  fi
elif [[ "$(uname -s)" == "Linux" ]]; then
  log "  $UNREAL_EDITOR \"$UPROJECT_FILE\""
else
  log "  $UNREAL_EDITOR \"$UPROJECT_FILE\""
fi
