# 3D Visual World Production Specification

## Manhattan Penthouse Mahjong AI Teacher

**Document status:** UI/rendering implementation contract
**Primary technology:** TypeScript + Three.js
**Primary target:** Desktop browser
**Current phase:** Environment, assets, scene composition, materials, lighting, rendering, and visual polish only
**Visual direction:** An original, bright architectural-futurist style strongly informed by the visual principles of _Mirror’s Edge Catalyst_, combined with a luxurious Manhattan penthouse overlooking Midtown

---

# 0. Non-Negotiable Scope Lock

This task is strictly the **3D presentation layer**.

Focus on:

- the Manhattan penthouse world
- the Midtown skyline backdrop
- the mahjong table
- mahjong tile models and face artwork
- furniture and architectural props
- scene composition
- camera composition
- materials and shaders
- lighting
- shadows and reflections
- ambient visual animation
- asset loading and asset optimization
- graphics quality presets
- browser rendering performance
- visual-development tools and static presentation fixtures

Do **not** implement, alter, or refactor:

- mahjong rules
- scoring
- legal move calculation
- turn sequencing
- game-state transitions
- opponent AI
- AI-teacher reasoning
- backend services
- API routes
- database schemas
- persistence
- authentication
- networking
- multiplayer
- authoritative game state
- hidden-information logic
- application protocols

Do not create fake gameplay systems merely to make the scene appear functional.

If the current repository already supplies presentation data, consume it through the narrowest existing UI-facing interface. If it does not, create a clearly isolated static fixture under a name such as `visual-fixtures` or `scene-demo-data`. The fixture exists only to stage objects for visual development. It must not be presented as a game engine or moved into core game code.

Do not change shared game types merely to make rendering easier. Adapt game-facing data at the UI boundary later.

Do not introduce React Three Fiber or replace the existing Three.js architecture unless the repository already uses it. Work with the current rendering stack.

All new or modified files should remain within the frontend, scene, visual, theme, or asset-pipeline areas unless a tiny build configuration change is essential for importing assets.

---

# 1. Product Fantasy

The user should feel seated at a private mahjong training table inside a near-future Manhattan penthouse.

The room is on a high floor in a fictional NoMad tower, looking north and northeast toward Midtown. The skyline should make the location feel unmistakably New York without requiring a survey-accurate recreation of Manhattan.

The default visual composition should include:

- the player’s side of the mahjong table in the foreground
- the full table and three opposing stations in the middle ground
- a double-height white penthouse interior around the table
- floor-to-ceiling glass beyond the opponents
- the Empire State Building as the primary skyline landmark
- One Vanderbilt and the Chrysler Building farther to the right
- one or two slender north-Midtown towers in the distance
- lower Manhattan rooftop forms, water towers, setbacks, and mechanical structures in nearer skyline layers
- a bright, slightly hazy New York sky

The emotional target is:

> A wealthy New Yorker’s private AI training salon, designed by an architect from a clean and optimistic near future.

This is not a casino, a traditional mahjong parlor, a generic luxury condo, or a dark cyberpunk room.

---

# 2. Creative North Star

Use the following internal phrase whenever choosing between visual options:

> **Mirror’s Edge-style architectural clarity inside a Manhattan penthouse, with the mahjong table treated as the hero object.**

The visual hierarchy must be:

1. mahjong tiles and table
2. player stations and teacher-display surfaces
3. penthouse architecture
4. Midtown skyline
5. decorative props

The skyline should establish place and aspiration, but it must not compete with tile readability.

The room should feel expensive because of proportion, material quality, light, and view—not because it contains many objects.

---

# 3. Inspiration Boundaries

The project may borrow high-level visual principles from _Mirror’s Edge Catalyst_:

- broad white architectural planes
- sharp contrast between white, charcoal, and one saturated accent
- clean steel and glass
- asymmetric geometric composition
- long lines that guide the eye
- high-key daylight
- realistic materials rendered in a stylized way
- tranquil, sterile luxury
- sparse environmental graphics
- selective red directional accents
- muted pink or lavender atmospheric tones in affluent spaces
- a sense of height, openness, and city scale

Do not copy or ship:

- game screenshots
- extracted textures
- extracted models
- logos
- proprietary symbols
- exact signs
- exact furniture
- exact floor plans
- exact UI graphics
- recognizable scene recreations
- character designs
- typography traced from the game

All production assets must be original, procedurally generated, or properly licensed.

The result should evoke the same design family without appearing to be a fan remake.

---

# 4. Visual Rules

## 4.1 Composition before detail

Build the scene from large visual masses first:

- floor plane
- ceiling slab
- window wall
- structural wall volumes
- table silhouette
- skyline silhouette
- red architectural accent
- dark negative-space elements

Do not begin with tiny props, surface scratches, decorative screens, or complex shaders.

At every stage, review the scene from the shipping camera—not only from a free developer camera.

## 4.2 White must retain form

The scene should be bright, but white surfaces must not flatten into one featureless value.

Use at least four visibly different neutral material families:

- warm architectural white
- cool white lacquer
- pale gray structural material
- dark charcoal inset material

Separate adjacent white planes through:

- roughness differences
- slight hue differences
- shadow gaps
- black reveals
- beveled edges
- indirect-light gradients
- restrained ambient occlusion

Do not solve white-surface readability by making the whole room gray.

## 4.3 Accent colors must be scarce

Recommended screen-space balance in the default camera:

- 70–80% white and pale neutral surfaces
- 10–18% charcoal, black, and dark glass
- 3–7% red accents
- 1–4% cool cyan system light
- less than 3% muted amber, lavender, or warm wood

Red is a visual command. Use it only for deliberately important architectural lines, the table’s directional accent, or future UI attention states.

Do not distribute random red props around the room.

## 4.4 Luxury without clutter

Use a small number of substantial objects:

- one low sculptural sofa
- one side table
- one architectural floor lamp or suspended light
- one abstract sculpture
- one compact bar or tea counter
- one large wall-integrated display surface
- one rug or floor inset defining the mahjong zone

Avoid shelves full of books, bottles, dishes, plants, picture frames, cables, and household clutter.

## 4.5 NYC without photorealistic noise

New York identity should come from:

- skyline silhouette
- recognizable landmark proportions
- rooftop water towers
- prewar building setbacks
- varied window grids
- mechanical rooftop masses
- dense vertical layering
- atmospheric haze
- a few warm-lit windows at dusk

Do not cover the skyline with real company logos or advertising.

---

# 5. Spatial Layout and Coordinate Convention

Use meters for the interior scene.

Recommended convention:

- `Y` is up
- `+Z` is the south/interior/player side
- `-Z` is north/window/Midtown
- `+X` is east
- `-X` is west
- table center is world origin
- finished floor is `Y = 0`

Recommended room blockout:

- main visible room width: 13–16 m
- main visible room depth: 10–13 m
- ceiling height: 4.5–5.5 m
- north window wall: 10–13 m wide
- partial east corner glazing for additional depth
- table top height: approximately 0.76–0.80 m
- table footprint: approximately 1.45–1.70 m square

Recommended initial anchors:

```ts
export const penthouseAnchors = {
  tableCenter: new THREE.Vector3(0, 0.78, 0),
  playerSeat: new THREE.Vector3(0, 0, 2.35),
  northSeat: new THREE.Vector3(0, 0, -2.35),
  eastSeat: new THREE.Vector3(2.35, 0, 0),
  westSeat: new THREE.Vector3(-2.35, 0, 0),
  windowCenter: new THREE.Vector3(0, 2.5, -5.5),
  teacherPanel: new THREE.Vector3(-3.2, 1.35, -0.4),
  actionSurface: new THREE.Vector3(0, 0.92, 1.55),
};
```

These are starting values. Adjust them for the actual camera and existing scene.

The skyline must not be modeled at literal Manhattan scale inside the same coordinate system. Use a depth-compressed backdrop beyond the windows.

---

# 6. Default Camera Composition

The default camera is a composed gameplay beauty shot, not a free-flying camera.

Recommended starting point:

```ts
const camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 1200);
camera.position.set(0, 2.55, 4.8);
camera.lookAt(0, 0.72, -0.75);
```

Tune the camera until:

- the player’s tiles can occupy the lower 18–25% of the screen
- the discard area is near the visual center
- all four table sides are understandable
- the skyline occupies roughly the upper 25–35%
- the Empire State Building is visible but not directly behind critical tile information
- window mullions do not slice through the main table silhouette
- the room still feels tall and spacious

Use a field of view in the approximate range of 40–50 degrees. Avoid wide-angle distortion.

Product camera behavior:

- no unrestricted orbit controls
- no first-person walking
- no large idle sway
- no constant camera motion
- optional 1–3 degree pointer parallax
- optional slow 1–2 second room reveal on initial load
- optional gentle push toward the table for a future decision state

Developer-only camera behavior:

- orbit controls behind a debug flag
- landmark and anchor visualization
- light helpers
- bounding boxes
- frame-time and draw-call overlay

Create explicit camera presets even though gameplay transitions are not part of this task:

```ts
type VisualCameraPreset = "table" | "roomReveal" | "skylineReview" | "assetReview";
```

These presets are visual-development utilities only.

---

# 7. Penthouse Architecture

## 7.1 Architectural shell

Create a double-height room with a strong asymmetric frame around the windows.

Required architectural elements:

- broad white floor and ceiling planes
- one thick cantilevered ceiling or mezzanine volume
- floor-to-ceiling north glazing
- a narrower east glass return
- thin black window mullions
- one sculptural white wall volume
- one dark recessed corridor or entry opening
- a red architectural line or beam that visually leads toward the table
- integrated linear lighting
- a dark floor inset or rug beneath the table

The architecture should not be a plain rectangular apartment box.

Use overlapping planes, offsets, and shadow gaps to create depth. At least one ceiling or wall plane should extend farther than expected and frame the skyline.

## 7.2 Mirror’s Edge-inspired geometry language

Favor:

- long horizontal cuts
- diagonal transitions used sparingly
- chamfered corners
- clean panel seams
- cantilevered slabs
- thin railings
- white monolithic masses
- dark recessed voids
- red lines that imply direction

Avoid:

- excessive hexagons
- random sci-fi greebles
- glowing circuitry patterns
- exposed industrial pipes everywhere
- organic spaceship forms
- ornate crown molding
- classical columns
- traditional luxury detailing

## 7.3 Penthouse-specific warmth

The room should not feel like a laboratory.

Add a small amount of warmth through one or two of:

- pale desaturated oak
- warm off-white upholstery
- a muted beige rug
- late-afternoon sunlight
- a restrained amber task light

Do not let wood or beige become the dominant visual language.

---

# 8. Manhattan Skyline Strategy

The skyline is a fixed environmental set, not an explorable city.

Use a layered 2.5D/low-poly solution rather than building full Manhattan.

## 8.1 Layer A: immediate rooftops

Distance-equivalent: nearest exterior foreground.

Include:

- six to twelve low and mid-rise rooftop masses
- water towers
- HVAC boxes
- parapets
- setbacks
- antenna structures
- simplified brick or pale stone façades

This layer establishes that the penthouse exists inside Manhattan rather than in front of a flat wallpaper.

Use real geometry, low detail, no dynamic shadows.

## 8.2 Layer B: Midtown hero landmarks

Create original simplified meshes with recognizable silhouettes for:

- Empire State Building
- One Vanderbilt
- Chrysler Building
- one slender residential tower representing the north-Midtown skyline
- optional Hudson Yards massing toward the west edge

The Empire State Building should be the primary landmark, slightly left or right of center rather than perfectly centered.

The landmarks should be recognizable at silhouette level. Do not spend time on façade-perfect geometry.

Use two or three LOD levels for hero buildings.

## 8.3 Layer C: skyline filler

Create a reusable library of approximately 12–20 building archetypes:

- prewar setback tower
- glass office slab
- narrow residential tower
- masonry mid-rise
- stepped roof tower
- dark curtain-wall block
- white futuristic infill tower

Distribute them through instancing or merged regional batches.

Vary:

- height
- width
- window-grid scale
- roof treatment
- neutral hue
- roughness
- emissive window pattern

Do not rotate or scale distinctive hero landmarks randomly.

## 8.4 Layer D: distant matte and sky

Use either:

- a custom equirectangular skyline matte
- a cylindrical panoramic card
- a very distant low-detail skyline strip

The distant layer should fill horizon gaps and provide atmospheric continuity.

Use depth fog and color grading so the distant city recedes into pale blue-gray haze.

## 8.5 Skyline color hierarchy

Near rooftops:

- medium contrast
- warm gray and charcoal
- visible rooftop details

Hero landmarks:

- slightly higher contrast
- cool pale gray and blue glass
- recognizable edges

Far skyline:

- low contrast
- low saturation
- close to sky color

Avoid a uniformly dark skyline. The default scene is daylight, not cyberpunk night.

---

# 9. Mahjong Table as Hero Asset

Design a custom table rather than using a generic furniture asset.

Recommended form:

- square playing surface with subtly chamfered corners
- monolithic white or pale-gray base
- dark matte inset playing field
- recessed center discard field
- thin red undercut or edge line
- narrow cyan system ring or light seam
- hidden cable and mechanical details
- clean integrated player stations

Suggested dimensions:

- overall width and depth: 1.50–1.65 m
- top thickness: 0.09–0.14 m
- finished height: 0.76–0.80 m
- center discard inset: 0.62–0.78 m square

The table should look custom-made for this penthouse and for an AI training system.

Do not add casino cup holders, ornate wood trim, gold, green felt, coin trays, or automatic-table branding.

## 9.1 Surface treatment

Playing surface:

- charcoal or very dark blue-gray
- roughness around 0.75–0.92
- no obvious repeating fabric texture
- subtle alignment grid visible only at close range

Outer shell:

- architectural white
- roughness around 0.35–0.55
- subtle bevels that catch light

Accent line:

- red or cyan emissive material
- low emissive intensity at rest
- designed for later state changes without requiring them now

## 9.2 Player stations

Create four visual stations with:

- tile-hand anchor
- exposed-meld anchor
- discard-lane anchor
- seat label anchor
- optional thin embedded display strip

Expose these as named objects or exported transforms. Do not implement the data that drives them.

---

# 10. Mahjong Tile Asset System

Create production-quality tile assets even though game logic integration is out of scope.

## 10.1 Tile proportions

Use one consistent stylized size, approximately:

- width: 28–30 mm
- height: 37–40 mm
- depth: 20–23 mm

Scale may be increased slightly in the scene for readability.

The tile should include:

- softly beveled body
- subtly inset face
- slightly heavier base or back cap
- small edge radius
- clean contact shadow
- clear face art

Do not use perfectly sharp boxes.

## 10.2 Tile materials

Body:

- warm ivory rather than pure white
- metalness `0`
- roughness approximately `0.32–0.48`
- optional very low clearcoat on high quality only

Back:

- dark charcoal, restrained red, or a two-tone custom design
- no copied commercial tile-back pattern

Face art:

- crisp sRGB atlas
- authentic recognizable suits and honors
- optimized for normal camera distance
- no ultra-thin calligraphy
- no replacement with abstract sci-fi symbols

The user is learning physical mahjong, so real tile recognition must remain possible.

## 10.3 Rendering strategy

Use shared geometry and materials.

Recommended split:

- interactive or foreground hand tiles: individual meshes for easy future selection
- concealed wall and opponent-back tiles: `InstancedMesh`
- repeated skyline or rack tiles: instanced where practical
- face graphics: atlas-driven material, decal plane, or controlled shader variant

Do not create a unique high-resolution material instance for every tile.

## 10.4 Static visual fixture

Provide one visually compelling staged fixture containing:

- a complete human hand
- three concealed opponent hands
- a partial wall
- several center discards
- one exposed meld
- one separated newly drawn tile

This is static presentation data only.

---

# 11. Furniture and Prop List

Required hero props:

- four restrained player chairs or integrated stations
- one low white sectional sofa in the background
- one thin black or brushed-metal side table
- one sculptural pendant or linear ceiling fixture
- one bar/tea counter with minimal objects
- one abstract geometric sculpture
- one integrated teacher-display panel

Optional props if the composition remains clean:

- one pale planter with a highly restrained plant
- one floor lamp
- one red accent chair or bench
- one translucent room divider

Do not add more props until the default camera composition is already strong.

Every prop must contribute at least one of:

- scale
- luxury
- composition
- color balance
- foreground/midground depth
- functional visual anchoring

---

# 12. Material Bible

Use `MeshStandardMaterial` for most surfaces. Reserve `MeshPhysicalMaterial` for a small number of hero materials such as glass, polished tile, or lacquer where its extra properties visibly matter.

The following values are starting points, not final constants.

| Material            | Base color | Metalness | Roughness | Notes                         |
| ------------------- | ---------: | --------: | --------: | ----------------------------- |
| Architectural white |  `#E9ECE8` |       0.0 | 0.65–0.82 | Main walls and ceiling        |
| White lacquer       |  `#F3F4F0` |       0.0 | 0.24–0.38 | Select panels only            |
| Structural gray     |  `#B9BEC0` |      0.05 | 0.50–0.68 | Columns and frames            |
| Charcoal inset      |  `#151A1D` |       0.0 | 0.55–0.80 | Table surface and recesses    |
| Accent red          |  `#E94136` |       0.0 | 0.30–0.48 | Sparse architectural guidance |
| Teacher cyan        |  `#73DCE8` |       0.0 | 0.28–0.45 | Emissive system elements      |
| Brushed aluminum    |  `#B8BEC2` |  0.85–1.0 | 0.22–0.36 | Thin frames and hardware      |
| Pale oak            |  `#C8B69E` |       0.0 | 0.58–0.75 | Very limited warmth           |
| Tile ivory          |  `#F2EEE3` |       0.0 | 0.32–0.48 | Mahjong tile body             |

Material rules:

- color maps and emissive maps use sRGB color space
- normal, roughness, metalness, and AO maps remain non-color data
- HDR environment maps and light maps use the appropriate linear color space
- avoid pure `#FFFFFF` on broad surfaces
- avoid pure black except in very small graphic details
- keep material count low
- use roughness variation more often than additional texture detail

Use actual bevel geometry on hero edges. Small bevels are one of the most important ways to make large clean shapes catch light and feel finished.

---

# 13. Glass and Window Treatment

The windows are visually important but must not consume the rendering budget.

Use one continuous or minimally segmented glass system.

High-quality option:

- `MeshPhysicalMaterial`
- transmission near `1`
- opacity `1`
- roughness approximately `0.02–0.08`
- IOR approximately `1.45`
- very small thickness
- environment map enabled

Medium/low-quality option:

- simpler transparent PBR material
- no volumetric thickness
- reduced reflection complexity

Rules:

- avoid multiple overlapping transparent panes
- avoid real-time cube-camera updates every frame
- avoid physically simulating every reflection
- use environment lighting and a static or one-time reflection capture
- add a subtle edge tint and window grime only if nearly invisible
- do not make the windows blue mirrors

The skyline must remain readable through the glass.

---

# 14. Lighting Direction

The default lighting state is a clear, bright late afternoon—not night.

The room should feel high-key and tranquil, with slightly warm direct light and cool ambient city light.

## 14.1 Lighting rig

Use:

- one HDR or EXR environment processed through PMREM for image-based lighting
- one directional sun light with a tightly bounded shadow camera around the table zone
- one or two `RectAreaLight` fills representing window or ceiling sources
- emissive architectural strips that do not each spawn a real light
- baked light maps and AO for the static room shell when the asset workflow permits

Avoid:

- many point lights
- one light per city window
- fully dynamic global illumination
- harsh black shadows
- bright lights aimed directly into the camera

## 14.2 Sun direction

Place the sun so it creates long side-light across the room without turning the skyline into a blown-out backlight.

A useful starting direction is from the west or southwest, producing:

- warm highlights on the table and floor
- cool shadow planes
- visible bevels on tiles
- diagonal architectural shadows

The table face must remain evenly readable. Add soft fill rather than raising exposure until whites clip.

## 14.3 Shadows

Only the following should cast high-quality dynamic shadows:

- table
- tiles near the table
- chairs/player stations
- one or two nearby hero props
- selected architectural elements

The skyline does not need dynamic shadows.

Recommended quality tiers:

- high: 2048 shadow map, tightly framed
- medium: 1024 shadow map
- low: baked/contact shadow only or shadows disabled

When the scene is static, set shadow auto-update off and request an update only after relevant visual objects move.

## 14.4 Ambient occlusion

Prefer baked AO for the static shell.

On high quality, use restrained GTAO or another ambient-occlusion pass at reduced resolution. It should provide contact around tiles, table edges, wall seams, and furniture—not create black halos around every white surface.

---

# 15. Color Management and Tone Mapping

Implement a correct linear rendering workflow.

Required renderer behavior:

- sRGB display output
- correct color-space annotation on textures
- PBR materials lit by a PMREM environment
- explicit tone mapping
- explicit exposure tuning

Test both `AgXToneMapping` and `NeutralToneMapping` in the actual scene. Choose the one that best preserves:

- detail in broad white planes
- saturated red without clipping
- pale cyan emissive accents
- warm sunlight
- readable skyline haze

Do not accept `NoToneMapping` as the final visual configuration.

Starting renderer configuration:

```ts
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  stencil: false,
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dprCap));
renderer.shadowMap.enabled = quality.shadows !== "off";
```

Treat the exact exposure and tone mapper as art-direction values, not arbitrary technical defaults.

---

# 16. Ambient Motion

The room should appear alive while remaining calm.

Allowed ambient animation:

- very slow cloud or haze movement
- subtle city-window flicker in the far skyline
- a distant aircraft light moving rarely
- a slow cyan system pulse
- extremely slight reflection movement
- a soft curtain or translucent panel movement if present

Disallowed ambient animation:

- floating tiles
- rotating furniture
- constant camera bob
- flashing advertisements
- pulsing every red element
- heavy particle fields
- frequent helicopters or traffic animation

No ambient animation should draw more attention than the table.

---

# 17. Presentation Anchors for Future UI Integration

Although game behavior is out of scope, the scene must provide stable named anchors for future integration.

Required anchors:

```ts
interface PenthouseSceneAnchors {
  tableRoot: THREE.Object3D;
  playerHand: THREE.Object3D;
  opponentHands: Record<"north" | "east" | "west", THREE.Object3D>;
  discardZones: Record<"south" | "north" | "east" | "west", THREE.Object3D>;
  meldZones: Record<"south" | "north" | "east" | "west", THREE.Object3D>;
  wallRoot: THREE.Object3D;
  teacherPanel: THREE.Object3D;
  actionSurface: THREE.Object3D;
  roundStatusSurface: THREE.Object3D;
  cameraTargets: Record<string, THREE.Object3D>;
}
```

These are presentation anchors only.

The teacher panel should be a physical or spatial surface integrated into the room, such as:

- a vertical frosted-glass plane to the left of the table
- a thin wall-integrated display
- a suspended translucent panel

Do not implement the teacher’s content generation or decision logic.

Provide a static placeholder demonstrating text-safe negative space and legibility.

---

# 18. Three.js Scene Architecture

Use a clear scene graph.

Suggested structure:

```text
PenthouseSceneRoot
├── EnvironmentRoot
│   ├── ArchitecturalShell
│   ├── Windows
│   ├── Furniture
│   ├── ArchitecturalAccents
│   └── AmbientEffects
├── SkylineRoot
│   ├── NearRooftops
│   ├── HeroLandmarks
│   ├── SkylineFillers
│   └── DistantMatte
├── TableRoot
│   ├── TableBody
│   ├── TableLights
│   ├── PlayerStations
│   ├── TileFixture
│   └── PresentationAnchors
├── LightingRoot
├── CameraRig
└── DebugRoot
```

Separate static environment assets from frequently updated foreground objects.

Set `matrixAutoUpdate = false` on static objects after transforms are finalized where safe.

Avoid allocating vectors, colors, matrices, or arrays inside the animation loop.

Do not place every object in one giant monolithic GLB if that prevents useful culling or independent iteration. Conversely, do not split every panel into a separate draw call.

---

# 19. Asset Authoring Pipeline

Use Blender or the project’s established DCC pipeline.

Asset requirements:

- one Blender unit equals one meter
- transforms applied before export
- consistent forward/up orientation
- sensible origins and pivots
- descriptive object names
- correct smoothing and weighted normals
- actual bevels on visible hard-surface edges
- UV0 for material textures
- UV1 for baked light maps/AO where used
- no hidden high-poly geometry in exported GLBs
- no unused materials
- no unapplied modifiers that export unpredictably

Preferred runtime format:

- glTF 2.0 / GLB
- Meshopt or Draco geometry compression after visual validation
- KTX2/Basis textures for production
- original source files retained outside the runtime bundle

Recommended texture sizes:

- architecture trim sheets: 1024–2048
- hero table: 1024–2048
- tile face atlas: 2048, potentially 4096 only if measured readability requires it
- furniture: 512–1024 each or shared atlas
- skyline filler atlas: 1024–2048
- distant matte: 2048–4096 depending on compression and visibility

Use texture atlases and trim sheets where repetition is intentional.

Run a reproducible optimization step that can:

- inspect asset size
- deduplicate data
- prune unused nodes and materials
- join compatible static primitives
- instance repeated objects
- compress geometry
- convert textures to KTX2 or another chosen web format
- validate the final glTF

Compression is the last stage. Keep editable uncompressed sources.

---

# 20. Browser Performance Contract

Target a stable 60 FPS on a modern laptop at a typical desktop viewport, with a functional 30 FPS fallback on weaker integrated graphics.

Initial budgets for the default camera:

| Budget                 |                    High |        Medium |          Low |
| ---------------------- | ----------------------: | ------------: | -----------: |
| Device-pixel-ratio cap |                 1.5–2.0 |      1.25–1.5 |          1.0 |
| Draw calls             |               under 120 |      under 85 |     under 60 |
| Visible triangles      |              under 600k |    under 350k |   under 180k |
| Shadow map             |                    2048 |          1024 | off or baked |
| AO                     | reduced-resolution GTAO | baked/minimal |          off |
| Skyline LOD            |                    full |       reduced |   silhouette |

These are guardrails, not permission to fill the entire budget.

Required optimizations:

- use `InstancedMesh` for repeated skyline buildings, windows, concealed tiles, and repeated structural props where appropriate
- use LOD for hero landmarks
- merge compatible static meshes by material and locality
- retain separate regional batches so frustum culling still works
- use KTX2 compressed textures
- cap device pixel ratio
- do not cast shadows from the skyline
- minimize transparent overlapping surfaces
- avoid `MeshPhysicalMaterial` on large numbers of objects
- preload critical assets
- call `renderer.compileAsync()` after lighting and environment are configured to avoid first-use shader stalls
- dispose geometries, materials, and textures when replaced
- pause or reduce rendering when the document is hidden
- reduce or stop the render loop when no visible animation is active
- monitor `renderer.info` in the development overlay

The scene should not hitch the first time the camera sees the skyline, glass, or tile material.

---

# 21. Quality Presets

Implement visual quality as a presentation-layer configuration object.

```ts
interface VisualQualityPreset {
  dprCap: number;
  shadows: "off" | "medium" | "high";
  shadowMapSize: 0 | 1024 | 2048;
  ambientOcclusion: boolean;
  glassMode: "simple" | "physical";
  skylineLodBias: number;
  ambientAnimationRate: number;
}
```

Required presets:

- `high`
- `medium`
- `low`

Changing a quality preset must not alter game state or require a page reload unless technically unavoidable.

The default should be selected from measured device performance, not only device type or user agent.

---

# 22. Loading and First Impression

The user should never stare at an empty black canvas while assets or shaders compile.

Implement a minimal visual loading state with:

- warm off-white background
- thin red progress line
- product title or scene title
- current asset stage
- graceful error state

Load priority:

1. renderer and camera
2. table graybox
3. tile material and tile face atlas
4. architectural shell
5. lighting environment
6. hero skyline landmarks
7. filler skyline
8. furniture and optional ambient motion

After critical assets load:

- configure environment and lights
- precompile shaders asynchronously
- fade from the loading treatment into the composed table view

Do not delay interactivity for distant decorative assets if the current architecture allows progressive loading.

---

# 23. Development Tools

Add a development-only visual panel or debug controls for:

- camera preset
- field of view
- exposure
- tone mapper
- sun direction and intensity
- environment intensity and rotation
- red accent intensity
- cyan emissive intensity
- fog density
- skyline layer visibility
- shadow quality
- DPR cap
- wireframe
- bounding boxes
- performance metrics

Do not ship the debug panel in production.

Provide one screenshot-capture command or documented workflow for consistent visual regression images.

---

# 24. Required Visual Checkpoints

Capture the following screenshots during implementation:

1. graybox composition, default camera
2. final architectural shell without props
3. skyline only from the table camera
4. table and tile materials under final lighting
5. complete daylight hero frame
6. optional dusk frame
7. low-quality preset frame
8. 1440×900 frame
9. 1920×1080 frame
10. 2560×1440 frame

The daylight hero frame is the source of truth.

A scene is not accepted because it looks good from a free camera while the product camera is weak.

---

# 25. Milestone Order

## Milestone 1: Scope-safe scene shell

Implement:

- scene root
- coordinate system
- camera rig
- graybox penthouse
- graybox table
- graybox skyline layers
- static tile fixture
- debug camera and helpers

Acceptance:

- no game or backend files changed
- the default camera already communicates penthouse, table, and skyline
- the world scale feels coherent

## Milestone 2: Hero composition

Implement:

- final window framing
- large architectural planes
- red directional accent
- table silhouette
- skyline landmark placement
- background furniture silhouettes

Acceptance:

- a monochrome screenshot has a strong composition
- the Empire State Building is recognizable
- the table is the visual focus

## Milestone 3: Production assets

Implement:

- final table model
- tile body and face system
- player stations
- penthouse shell
- furniture props
- skyline archetypes and hero landmarks

Acceptance:

- all hero edges are beveled and shade correctly
- material count and asset hierarchy are controlled
- no copied commercial-game assets are present

## Milestone 4: Lighting and materials

Implement:

- PBR material library
- environment map and PMREM
- sun and area-light rig
- baked AO/light maps where appropriate
- glass
- fog and atmospheric depth
- tone mapping

Acceptance:

- white planes remain distinct
- tiles are readable
- red and cyan accents remain controlled
- the room feels bright rather than flat

## Milestone 5: Optimization and handoff

Implement:

- instancing
- LOD
- asset compression
- shader precompile
- quality presets
- resource disposal
- performance overlay
- documentation and screenshot baselines

Acceptance:

- performance budgets are measured
- low/medium/high presets visibly work
- the scene loads without a large first-use hitch
- all future gameplay integration points are named and documented

---

# 26. Final Acceptance Criteria

The visual implementation is accepted when all of the following are true.

## Scope

- No mahjong rules, scoring, AI, backend, persistence, or authoritative state logic was added or modified.
- Any demo data is isolated and explicitly labeled as a visual fixture.
- Scene objects expose stable anchors for future integration.

## Art direction

- The scene reads immediately as a bright futuristic Manhattan penthouse.
- The skyline reads as Midtown New York, with the Empire State Building as the primary landmark.
- The visual language evokes clean architectural futurism without copying _Mirror’s Edge Catalyst_ assets or compositions.
- White, charcoal, red, and cyan have a disciplined hierarchy.
- The room does not look like a casino, cyberpunk nightclub, traditional Chinese room, or generic asset-pack apartment.

## Composition

- The table is the hero object.
- The player’s tile area is readable at the default camera.
- The skyline adds scale without reducing tile contrast.
- Window mullions, furniture, and landmarks support rather than interrupt the composition.

## Asset quality

- Hero edges are beveled.
- Materials use plausible roughness and metalness.
- Tile art is crisp and recognizable.
- The penthouse contains enough detail to feel designed but not cluttered.
- All assets are original or properly licensed.

## Rendering

- Color spaces are configured correctly.
- Tone mapping is explicit and tuned.
- Broad white surfaces retain detail.
- Shadows are soft and localized.
- Glass does not dominate the rendering cost.

## Performance

- The default quality preset performs smoothly on a modern laptop.
- Draw calls, triangles, texture memory, and shader stalls are measured.
- Repeated objects use instancing where appropriate.
- Skyline detail uses LOD or layered simplification.
- GPU resources are disposed when no longer used.
- The tab does not wastefully render at full rate while hidden.

## Deliverables

- production scene code
- optimized runtime assets
- original source assets or clear source locations
- material and lighting configuration
- quality presets
- visual fixture data
- anchor documentation
- asset manifest
- performance measurements
- final hero screenshots

---

# 27. Final Instruction to the Implementation Agent

Stay focused on making the world beautiful.

Do not widen the task into game architecture, rules, AI, state management, or backend work. Use the existing frontend boundary or static visual fixtures and spend the implementation effort on:

- composition
- architecture
- skyline identity
- asset quality
- bevels and silhouettes
- tile readability
- material response
- high-key lighting
- restrained reflections
- controlled accents
- browser performance

The target is not “a functional mahjong prototype with a room around it.”

The target is:

> **A visually convincing Manhattan penthouse mahjong world that is ready for the game logic to be connected later.**
