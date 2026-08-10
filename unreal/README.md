# Unreal visual lane

This directory is a UE5 runtime visual slice for the `feat/unreal` worktree. It
does not replace the authoritative TypeScript game engine. The scene is created
at runtime by `AMahjongVisualGameMode` so the branch stays free of generated
binary map assets while the composition is still immediately inspectable in
Unreal.

## Local setup

1. Install Unreal Engine 5.4 or newer.
2. From this worktree root, run:

   ```bash
   ./scripts/setup-unreal.sh
   ```

3. Open the generated project in the installed engine and press **Play**.
4. Use the editor viewport at 1440x900 or larger for the intended camera framing.

The current machine has no `UnrealEditor` executable, so C++ compilation and the rendered-frame check still require an Unreal-equipped machine. The project intentionally leaves `EngineAssociation` unset so the
installed UE5 version can be selected without changing source.

## Visual slice

- A high-key Manhattan penthouse shell uses charcoal, architectural white, red,
  and cyan accents.
- The table and tile fixture are the foreground hero, with station marks kept
  ready for future game anchors.
- The skyline uses cheap static boxes plus a stepped central landmark and spire,
  avoiding a large binary asset dependency while preserving scale.
- Runtime lighting combines a warm directional sun, cool sky fill, two rect
  lights, height fog, a box reflection capture, and a restrained post-process
  stack.
- `DefaultEngine.ini` enables UE5 Lumen, virtual shadows, TSR, auto exposure,
  bloom, and distance fields for a stronger default than the blank template.

This is a rendering prototype, not production-ready art. Replace the procedural
fixtures with authored Nanite/glTF assets only after the camera composition is
accepted in the real Unreal renderer.
