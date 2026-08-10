# Procedural FPS City Generator v0.1

## Recommendation

50 m is a sensible initial chunk size. Assuming the map is 1 km × 1 km:

| Measurement | Value |
| --- | --- |
| World dimensions | 1,000 m × 1,000 m |
| World area | 1,000,000 m² |
| Chunk dimensions | 50 m × 50 m |
| Chunks per axis | 20 |
| Total chunks | 400 |
| Internal planning grid | 5 m |
| Planning cells per chunk | 10 × 10 |
| Planning cells across world | 200 × 200 |

The important distinction is:

A chunk is a streaming and rendering boundary, not the unit that independently decides where roads go.

Generate one deterministic global city plan first. Individual chunks then materialize their portion of that plan. Otherwise, roads, blocks, and combat routes will frequently fail to connect at chunk boundaries.

A full kilometer is also much larger than a compact Counter-Strike arena. At a nominal movement speed of 6 m/s, crossing it directly takes about 167 seconds, and crossing it diagonally takes about 236 seconds. The recommended design is therefore:

* Generate the entire 1 km city.
* Select one 300 m × 300 m combat district for a match.
* Use the surrounding city for skyline, context, exploration, future game modes, or additional combat districts.

## Research conclusions

Procedural city research commonly separates generation into streets, blocks or lots, and buildings. Parish and Müller also separate broad “global goals” from “local constraints,” allowing a desired street pattern to be corrected when it meets boundaries, intersections, terrain, or other environmental conditions. Their system explicitly includes a rectangular “New York” street pattern, which is the right simple starting point here instead of beginning with an L-system.

For competitive FPS layouts, the useful precedent is not Minecraft terrain noise but graph-based generation. FPSEvolver represented maps using points joined by grid-snapped L-shaped corridors, then removed dead ends, reduced four-way intersections, added rooms and cover, and positioned objectives according to team travel times. Its playtest feedback favored multiple routes, a combination of enclosed and open spaces, accessible cover, and routes that did not take excessively long to reach objectives.

FPS level-design research also treats alternate routes, flanking routes, choke points, and protected long-range positions as distinct patterns that change player behavior. That supports generating and validating an explicit gameplay graph rather than assuming that a realistic street grid will automatically produce good combat.

Recent procedural FPS experiments similarly found that noisy layouts with many dead ends and sharp turns can strongly favor short-range weapons, while positions with visibility over a large part of the map can favor sniper behavior. The generator therefore needs explicit topology and visibility validation.

Wave Function Collapse can later populate façades, interiors, or local architectural modules because it supports constrained synthesis and can be combined with manually authored structures. It should not generate the macro street or combat topology in the first version.

---

## 1. Objective

Implement a deterministic procedural generator that creates:

1. A finite 1,000 m × 1,000 m urban world.
2. A 20 × 20 grid of 50 m chunks.
3. A simple Manhattan-style street and block shell.
4. One generated 300 m × 300 m competitive combat district.
5. Seeded building masses, roads, sidewalks, alleys, courtyards, objectives, and cover.
6. Chunk-based rendering and loading.
7. A top-down debug visualization and automatic gameplay validation.

The first version is a geometric blockout. It must prove that the chunk architecture, city plan, combat topology, and validation system work before architectural detail is added.

## 2. Core configuration

```ts
export interface WorldConfig {
  seed: string;
  generatorVersion: number;
  worldSizeM: number;             // Default: 1000
  chunkSizeM: number;             // Default: 50
  layoutCellSizeM: number;        // Default: 5
  streetPitchM: number;           // Default: 100
  arterialPitchM: number;         // Default: 200
  streetWidthM: number;           // Default: 10
  arterialWidthM: number;         // Default: 15
  sidewalkWidthM: number;         // Default: 3
  combatDistrictSizeM: number;    // Default: 300
  combatGraphSnapM: number;       // Default: 10
  nominalRunSpeedMps: number;     // Default: 6
  maxGenerationAttempts: number;  // Default: 32
}
```

Do not spread these values through the implementation. Every system must derive dimensions from `WorldConfig`.

## 3. Scope

### Included

* Flat ground.
* One urban visual theme.
* Deterministic seeded generation.
* Rectangular street network.
* Blocks, sidewalks, alleys, plazas, and simple building boxes.
* One combat district.
* Two team spawns.
* Two objective sites.
* Three principal approaches.
* Alternate and flanking connections.
* Basic cover placement.
* Graph, travel-time, and visibility validation.
* Chunk loading, unloading, LOD, batching, and debugging.
* Exploration of the larger city shell outside the match district.

### Excluded

* Building interiors.
* Terrain elevation.
* Rivers or coastlines.
* Multiple biomes.
* Wave Function Collapse.
* Detailed façades.
* Destruction.
* Vehicles and traffic.
* NPC navigation.
* Multiplayer synchronization.
* Persistent world modifications.
* Infinite generation.
* Fully procedural competitive topology without a template.
* Photorealistic assets.

The code should leave room for these features, but none should be implemented in v0.1.

---

## 4. High-level architecture

```text
WorldConfig + seed
        │
        ▼
Seeded deterministic random service
        │
        ▼
Global WorldPlan
 ├── street network
 ├── blocks and parcels
 ├── combat-district placement
 ├── combat gameplay graph
 ├── building footprints
 └── validation metrics
        │
        ▼
ChunkPlan extraction
        │
        ▼
Chunk geometry builder
 ├── roads
 ├── sidewalks
 ├── buildings
 ├── cover
 └── collision
        │
        ▼
Chunk manager
 ├── load
 ├── LOD
 ├── cull
 ├── cache
 └── unload
```

### Critical invariant

The global `WorldPlan` must exist before any chunk geometry is generated.

Do not let each chunk independently choose:

* Road locations.
* Road exits.
* District boundaries.
* Objective routes.
* Building footprints that cross chunk boundaries.
* Multi-chunk structures.

The chunk builder receives an already-resolved world plan and produces only the geometry intersecting its bounds.

This is the part to borrow conceptually from Minecraft: globally deterministic feature passes followed by local chunk materialization.

---

## 5. Coordinates and chunk indexing

Use a centered coordinate system:

```text
X range: -500 inclusive to +500 exclusive
Z range: -500 inclusive to +500 exclusive
Y: vertical axis
Ground: Y = 0
```

Chunk coordinates range from 0 through 19.

Conceptually:

```ts
chunkX = floor((worldX + 500) / 50);
chunkZ = floor((worldZ + 500) / 50);
```

Use half-open bounds so a location on an edge has exactly one owner:

```text
[minX, maxX)
[minZ, maxZ)
```

The world is not large enough to require floating-origin repositioning.

---

## 6. Deterministic randomness

Do not use `Math.random()`.

Expose keyed random functions resembling:

```ts
randomFloat(
  namespace: string,
  globalX: number,
  globalZ: number,
  index?: number
): number;
```

Examples:

```text
building-height / parcel-42
courtyard-type / block-17
cover-rotation / combat-area-4 / item-8
```

The result must depend on:

* world seed
* generator version
* feature namespace
* stable global feature identifier
* attempt index, when applicable

It must not depend on:

* Chunk loading order.
* Player movement.
* Frame timing.
* Previous calls to the random function.
* The number of already generated chunks.

Two clients given the same seed, configuration, and generator version must produce byte-equivalent serialized `WorldPlan` data.

---

## 7. World-level city shell

### 7.1 Terrain

For v0.1:

* Ground is a flat plane at Y = 0.
* No height noise.
* No slopes.
* No bridges.
* No underground areas.

Terrain variation should be added only after road generation and player collision are stable.

### 7.2 Street network

Use an axis-aligned rectangular grid.

Recommended defaults:

| Street class | Spacing | Width |
| --- | ---: | ---: |
| Local street | 100 m | 10 m |
| Arterial street | 200 m | 15 m |
| Sidewalk | Along each road edge | 3 m |

This produces approximately ten urban blocks along each dimension. A typical block is about 85–90 m wide after road and sidewalk space is removed.

For the first version:

* All global streets are straight.
* Streets meet at right angles.
* All primary roads connect to the world boundary or another road.
* No global street terminates in the middle of an ordinary block.
* No curved roads.
* No random street displacement.
* No procedural road growth simulation.

The street network should be represented as data first, not inferred from rendered meshes.

```ts
export interface RoadSegment {
  id: string;
  kind: "arterial" | "local" | "alley";
  start: Vec2;
  end: Vec2;
  widthM: number;
}
```

### 7.3 Blocks and parcels

Subtract the road and sidewalk areas from the world grid to identify city blocks.

Each block receives:

* Stable ID.
* Bounding polygon or rectangle.
* Buildable bounds.
* Parcel list.
* Optional courtyard.
* Optional combat override.

For v0.1, divide each block into simple rectangular parcels. Keep building footprints within a single chunk wherever practical. When a footprint would cross a chunk boundary, split it into separately rendered sections that share one logical building ID.

### 7.4 Buildings

Buildings are closed rectangular masses.

Recommended initial values:

| Property | Default range |
| --- | --- |
| Footprint width | 15–40 m |
| Footprint depth | 15–40 m |
| Building height | 10–40 m |
| Ground-floor setback | 0–4 m |
| Gap between buildings | 3–8 m |

Buildings need only:

* A box mesh.
* A roof.
* A simple façade material or atlas.
* A collision volume.
* A stable building ID.

There are no accessible doors or interiors.

### 7.5 District scaffolding

Include this type:

```ts
export type DistrictKind =
  | "dense-urban"
  | "residential"
  | "industrial"
  | "civic"
  | "park";
```

For v0.1, every ordinary block can use dense-urban. Do not implement biome blending yet. The type exists so future generation does not require rewriting the world format.

---

## 8. Combat district

### 8.1 Size and placement

Generate one combat district measuring:

```text
300 m × 300 m
6 × 6 chunks
```

Its bounds must:

* Align to 50 m chunk boundaries.
* Remain at least two chunks from the world perimeter.
* Include a mixture of streets and blocks.
* Not overlap a future reserved landmark slot, if one exists.
* Be selected deterministically from the seed.

The city outside this area remains an ordinary visual and exploratory shell.

### 8.2 Template-first topology

Do not generate an unrestricted random graph in v0.1.

Begin with a reliable competitive template containing:

* One attacker spawn region.
* One defender spawn region.
* Objective A.
* Objective B.
* Three principal approaches:
  * A-side lane.
  * Middle lane.
  * B-side lane.
* Two or three cross-connectors.
* At least one flanking route.
* One or two open combat spaces.
* Several controlled choke points.

The seed may:

* Mirror the topology.
* Rotate it in 90-degree increments.
* Move nodes inside allowed placement regions.
* Change whether a segment becomes a street, alley, courtyard, or passage.
* Adjust corridor width.
* Adjust cover arrangement.
* Swap visual identities of the objective sites.

The seed may not remove the fundamental route structure.

### 8.3 Graph representation

```ts
export interface CombatNode {
  id: string;
  kind:
    | "attacker-spawn"
    | "defender-spawn"
    | "objective-a"
    | "objective-b"
    | "junction"
    | "choke"
    | "arena";
  position: Vec2;
}

export interface CombatEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  widthM: number;
  spaceKind: "street" | "alley" | "courtyard" | "passage";
}
```

Node positions are snapped to a 10 m grid.

Connect node pairs with one- or two-segment axis-aligned paths. Prefer L-shaped paths. Determine the horizontal-first or vertical-first orientation from the seed and constraint results.

### 8.4 Converting the graph into city geometry

| Gameplay space | Recommended width |
| --- | ---: |
| Narrow passage | 4–6 m |
| Alley | 5–8 m |
| Ordinary lane | 8–12 m |
| Street route | 10–15 m |
| Courtyard or plaza | 20–35 m |

The graph may override the ordinary city shell by:

* Carving an alley through a block.
* Creating a courtyard.
* Splitting a building mass.
* Closing an existing street with construction barriers.
* Turning an intersection into a T-junction.
* Adding an elevated but inaccessible visual structure.
* Opening a passage through the ground floor of a building shell.

The combat graph is authoritative. Visual city realism must not break gameplay connectivity.

---

## 9. Initial gameplay constraints

These values are starting parameters, not permanent rules.

| Constraint | Initial target |
| --- | --- |
| Main routes from attacker side | 3 |
| Cross-connectors | 2–3 |
| Objective sites | 2 |
| Entrances per objective | 2–3 |
| Unintentional dead ends | 0 |
| Maximum ordinary graph degree | 3 |
| Attacker route-time difference between A and B | ≤20% |
| Defender arrival advantage at site | 2–5 seconds |
| First likely engagement | 10–20 seconds |
| Site-to-site rotation | 15–30 seconds |
| Ordinary maximum sightline | 100–120 m |
| Special long sightline | At most one, ≤160 m |
| Typical cover gap in open space | 8–15 m |

Additional hard rules:

* Team spawns cannot see one another.
* Neither spawn can directly see an objective.
* An objective cannot have only one entrance.
* All primary combat spaces must be reachable from both teams.
* No primary route may require jumping or climbing.
* A four-way combat junction must be converted into two offset three-way junctions or have one branch blocked.
* A long sightline must have intermittent cover or an alternate route.
* High-ground positions may not overlook both objective sites.
* The attacker spawn cannot be the most visible location in the district.
* The defender spawn cannot directly control the middle lane.

---

## 10. Validation pipeline

Generate the combat district as data, validate it, and only then create 3D geometry.

### 10.1 Connectivity validation

Run flood fill or graph traversal from each spawn.

Reject the layout when:

* A site is unreachable.
* A required connector is isolated.
* More than one connected walkable component exists.
* An ordinary graph node has degree one.
* A graph node has degree greater than three without an explicit exception.

### 10.2 Travel-time validation

Calculate shortest paths using weighted graph distance.

```text
travel time = shortest path length / nominal movement speed
```

Measure:

* Attacker spawn → A.
* Attacker spawn → B.
* Defender spawn → A.
* Defender spawn → B.
* A → B.
* Each spawn → likely first-contact locations.

The validator should use the configured nominal movement speed rather than assuming one fixed speed forever.

### 10.3 Visibility validation

Rasterize buildings and walls into a two-dimensional obstruction grid.

At minimum, test:

* Spawn-to-spawn visibility.
* Spawn-to-objective visibility.
* Objective-to-objective visibility.
* Maximum visible distance from important nodes.
* Percentage of walkable samples visible from each important node.
* Long, uninterrupted street corridors.

The planner does not need full Three.js raycasting. A two-dimensional line test against footprint geometry is sufficient for the blockout.

Reject a position that can see an excessive portion of the combat district. Use 30% of sampled walkable positions as an initial maximum, then tune from playtests.

### 10.4 Cover validation

For every open area larger than roughly 20 m:

* Place at least one cover cluster.
* Ensure cover does not completely close a route.
* Preserve multiple ways around major cover.
* Avoid a single cover object that controls every entrance.
* Ensure cover does not create tiny collision gaps.

Cover types in v0.1:

* Crate stacks.
* Concrete barriers.
* Construction partitions.
* Parked vehicle-shaped boxes.
* Kiosks.
* Low walls.

All can use placeholder boxes.

### 10.5 Generation retries

For each seed:

```text
seed + attempt 0
seed + attempt 1
...
seed + attempt 31
```

Run inexpensive validation first:

1. Bounds.
2. Connectivity.
3. Node degree.
4. Route timing.
5. Visibility.
6. Cover.

Return the highest-scoring valid candidate.

If all attempts fail, use a known-valid canonical template transformed by the seed. A seed must never produce an unusable map.

---

## 11. Chunk plans

```ts
export interface ChunkPlan {
  coord: ChunkCoord;
  bounds: Bounds2;
  roads: RoadSegmentSlice[];
  sidewalks: SurfacePolygon[];
  buildingParts: BuildingPart[];
  coverObjects: CoverPlacement[];
  combatFeatures: CombatFeature[];
  isInsideCombatDistrict: boolean;
  planHash: string;
}
```

A `ChunkPlan` is derived from `WorldPlan`; it is not independently randomized.

When creating a chunk:

1. Read all world features intersecting the chunk bounds.
2. Read a one-cell halo around the chunk for adjacency decisions.
3. Clip surface geometry to the chunk boundary.
4. Avoid duplicate collision faces on shared boundaries.
5. Assign stable object IDs.
6. Produce render geometry and collision geometry separately.

Tests must compare neighboring edge signatures:

```text
northEdge(chunkA) === southEdge(chunkB);
eastEdge(chunkA) === westEdge(chunkB);
```

---

## 12. Chunk streaming

Suggested chunk states:

```ts
export type ChunkState =
  | "unloaded"
  | "planned"
  | "queued"
  | "building"
  | "active-high"
  | "active-low"
  | "cached";
```

Recommended starting distances:

| Layer | Radius |
| --- | ---: |
| Full gameplay geometry | 3 chunks / 150 m |
| Low-detail visual shell | 5 chunks / 250 m |
| Unload threshold | 6 chunks / 300 m |

Use hysteresis so chunks do not repeatedly load and unload when the player stands near a boundary.

Prioritize the build queue in this order:

1. Current chunk.
2. Immediate neighboring chunks.
3. Chunks in front of player velocity.
4. Other high-detail chunks.
5. Low-detail visual chunks.

Limit chunk construction to a configurable CPU budget, initially around 4 ms per frame. Do not synchronously build a large ring of chunks in one frame.

For a competitive match, pin the entire 6 × 6 combat district’s gameplay data and collision in memory. Only surrounding visual city chunks need aggressive streaming.

---

## 13. Rendering requirements

Assuming the existing Three.js/WebGL direction:

* Create one scene group per chunk.
* Merge road surfaces per chunk.
* Merge sidewalk surfaces per chunk.
* Use instancing for repeated building and cover geometry.
* Batch by material and archetype.
* Cull complete chunks using chunk bounding boxes.
* Use high- and low-detail building representations.
* Do not create one draw call per building, sidewalk section, window, or cover item.

Three.js provides `InstancedMesh` specifically to render repeated geometry with fewer draw calls, while its optimization guidance recommends merging geometry where separate objects do not need to move independently.

Recommended chunk render structure:

```text
ChunkGroup
 ├── groundMesh
 ├── roadMesh
 ├── sidewalkMesh
 ├── buildingInstances
 ├── lowDetailBuildingMesh
 ├── coverInstances
 └── debugMesh
```

For v0.1:

* Use no more than a small shared material palette.
* Do not render individual windows.
* Do not add expensive post-processing.
* Dynamic shadows may be restricted to the combat district.
* Far buildings should become unlit or simplified skyline boxes.
* Collision geometry should be simpler than render geometry.

---

## 14. Debugging tools

The implementation is not complete without a top-down debug view.

Required controls:

* Enter seed.
* Regenerate.
* Advance to next seed.
* Toggle chunk boundaries.
* Toggle 5 m planning cells.
* Toggle global road graph.
* Toggle combat graph.
* Toggle route widths.
* Toggle walkable cells.
* Toggle visibility lines.
* Toggle cover influence.
* Show loaded chunk states.
* Show objective travel times.
* Show validation failures.
* Freeze chunk streaming.
* Export `WorldPlan` as JSON.
* Copy the current seed.
* Teleport to a chunk.
* Switch between player camera and free camera.

Use clear debug colors for:

* Roads.
* Buildings.
* Walkable routes.
* Attacker-controlled regions.
* Defender-controlled regions.
* Objectives.
* Choke points.
* Long sightlines.
* Invalid geometry.

The first useful deliverable should be the top-down planner and validator, not the finished 3D city.

---

## 15. Suggested module structure

```text
src/world/
  world-config.ts
  world-types.ts
  seeded-random.ts
  coordinates.ts
  planning/
    generate-world-plan.ts
    generate-street-grid.ts
    generate-blocks.ts
    generate-parcels.ts
    generate-buildings.ts
    place-combat-district.ts
  combat/
    combat-template.ts
    generate-combat-plan.ts
    route-carving.ts
    cover-placement.ts
    validate-connectivity.ts
    validate-timing.ts
    validate-visibility.ts
    score-combat-plan.ts
  chunks/
    derive-chunk-plan.ts
    chunk-manager.ts
    chunk-build-queue.ts
    build-chunk-geometry.ts
    build-chunk-collision.ts
    chunk-lod.ts
  rendering/
    geometry-batcher.ts
    instance-pool.ts
    materials.ts
  debug/
    world-plan-view.ts
    combat-debug-overlay.ts
    chunk-debug-overlay.ts
    world-debug-controls.ts
```

Keep planning modules pure TypeScript. They must not import Three.js. Three.js consumes the resulting plans through the rendering layer.

---

## 16. Testing requirements

### Determinism

* Same seed and config produce identical plan hash.
* Loading chunks in different orders produces identical chunk hashes.
* Reloading the page does not alter geometry.
* Generation is unaffected by frame rate.

### Chunk seams

* All adjacent road edges match.
* Sidewalk heights match.
* No cracks in the ground.
* No overlapping duplicate walls.
* Collision does not catch the player at boundaries.

### Property tests

Generate at least 100 seeds and assert:

* Every seed returns a valid plan, including fallback use.
* Both objectives are reachable.
* Both teams can reach every primary combat area.
* No direct spawn-to-spawn visibility exists.
* No direct spawn-to-site visibility exists.
* Route timing stays inside configured limits.
* No unintended graph node has degree one.
* No ordinary graph node has degree above three.
* All geometry remains inside world bounds.

### Performance

Record:

* Global plan generation time.
* Per-chunk build time.
* Active chunk count.
* Draw calls.
* Triangle count.
* Chunk queue length.
* Longest generation frame.
* Geometry and texture memory.

The blockout target should be a stable 60 FPS desktop experience before detailed assets are introduced.

---

## 17. Acceptance criteria

The v0.1 implementation is complete when:

1. A seed produces a deterministic 1 km × 1 km world.
2. The world contains exactly 20 × 20 addressable 50 m chunks.
3. A player can cross chunk boundaries without visual or collision seams.
4. Roads, sidewalks, blocks, and building masses form a coherent city.
5. One 6 × 6 chunk combat district is generated.
6. The district contains two spawns, two sites, three main approaches, and alternate connections.
7. All topology, timing, and visibility checks pass.
8. Invalid candidates regenerate automatically.
9. The same seed recreates exactly the same layout.
10. The top-down debug view explains why a layout passed or failed.
11. Geometry is batched or instanced rather than represented as thousands of independent meshes.
12. Chunks load and unload without noticeable frame stalls.
13. No terrain noise, interiors, WFC, or decorative biome work has been added prematurely.

## Implementation order

1. WorldConfig and deterministic random service
2. Pure 2D street/block planner
3. Combat template and graph generation
4. Connectivity, timing, and visibility validators
5. Top-down debug visualization
6. ChunkPlan extraction and seam tests
7. Three.js blockout geometry
8. Chunk loading and LOD
9. Geometry batching and performance instrumentation
10. Placeholder cover and minimal visual variation

The key initial decision is therefore:

Keep 50 m chunks, generate the entire 1 km plan globally, use a 5 m internal planning grid, and treat a 300 m multi-chunk structure as the first competitive FPS map.
