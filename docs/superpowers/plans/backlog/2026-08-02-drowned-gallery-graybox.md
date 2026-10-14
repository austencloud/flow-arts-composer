# Drowned Gallery Graybox (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A walkable, untextured graybox of the Vulcan Cave Water room ("The Drowned Gallery") on the `/test/museum-cave-3d` route, proving layout, flow, scale, floor elevation (descend → submerge → surface), and the three-performer procession — before any art spend.

**Architecture:** Three new/reshaped rooms in the cave room graph (approach → sump → grotto) keep tile-grid collision authoritative while their *rendered* tile geometry is suppressed; a temporary `DrownedGalleryGraybox.svelte` layer renders floors/walls/water/shelves at true elevations over the nav scaffold — the same "authored shell over tile scaffold" pattern the Phase 2 GLB shell will use. A pure-function terrain program supplies `elevationAt`/`blockedAt`; the physics provider consumes it for ground clamping and water blocking.

**Tech Stack:** Svelte 5 + Threlte (`@threlte/core`), existing museum tile compiler (`buildMuseumGrid`), `MuseumPhysicsProvider`, vitest unit tests, TKA MCP (`tka-domain-local`) for sequence data.

**Spec:** `docs/superpowers/specs/2026-08-02-vulcan-cave-water-room-drowned-gallery-design.md`
**Geometry reference:** `static/sketches/2026-08-02-drowned-gallery-plan.html`

---

## Executor context (read first)

Conventions you must know (all verified against the code on 2026-08-02):

- **Tiles:** `TILE_SIZE = 0.5` world units/meters. `worldX = tileX * 0.5`, `worldZ = tileY * 0.5`. North = decreasing tileY/worldZ. Wing `bounds` are in tiles and INCLUDE the 1-tile wall ring; interior is `x+1 .. x+w-2`.
- **Room sizing:** `computeRoomDimensions` (`src/lib/features/museum/domain/wall-segment-types.ts:99`) → `w = ceil(max(wallLen, minInteriorWidth) * 1.5) + 2` tiles. So interior meters ≈ `minInteriorWidth * 0.75`.
- **Player Y:** `MuseumPhysicsProvider` (`src/lib/features/museum/services/museum-physics-provider.ts`) keeps `position.y` clamped to `STANDING_Y = 0.85`; UCC eye height = `position.y + 0.75` → 1.6 m eyes. UCC applies gravity; the clamp is the floor.
- **Walls render 4.5 m tall** (`WALL_HEIGHT` in `museum-geometry-builder.ts:25`), ceilings batch at 4.5. Tile floors all render at y = 0 — that is why water-bay rooms must suppress tile geometry rendering and get graybox meshes instead. Collision never depends on rendered meshes.
- **Elevation datum:** museum default floor = 0. Constants for this room: `WATERLINE_Y = -1.5`, `SUMP_FLOOR_Y = -4.1`, `SUMP_CEILING_Y = -1.9`, `CAUSEWAY_Y = -0.3`, `SHELF_Y = -1.0`, `POOL_BOTTOM_Y = -5.0`, `DOME_APEX_Y = 9.5`. Submersion check: eye (`position.y + 0.75`) `< WATERLINE_Y`. On the sump floor: `-4.1 + 0.85 + 0.75 = -2.5 < -1.5` ✓ submerged. On the causeway: `1.3 > -1.5` ✓ dry. Head naturally emerges before feet leave the water on the surfacing ramp — desired.
- **MCP:** load with ToolSearch `select:mcp__tka-domain-local__get_sequence_data`. Verified 2026-08-02: `get_sequence_data(word: "AAAA"|"BBBB"|"CCCC", constraintPreset: "smooth")` each return 5 beats, `alpha3→alpha3` (clean loop), score 1.00.
- **Commits:** explicit pathspec only (`git commit -m "..." -- path1 path2`). Never `git add -A`/`.`/`-u`. The working tree contains other sessions' files — touch only what a task names.
- **Do not** run `npm run dev`, kill port 5173, or start extra vite servers. Tests + `npm run check` only; visual verification is done by the orchestrator after the plan completes.

Files created by this plan:
- `src/lib/features/museum/data/drowned-gallery-terrain.ts`
- `src/lib/features/museum/components/game/DrownedGalleryGraybox.svelte`
- `tests/unit/museum/drowned-gallery-terrain.test.ts`
- `tests/unit/museum/museum-physics-elevation.test.ts`

Files modified: `vulcan-cave-floor-plan.ts`, `museum-grid-types.ts`, `museum-physics-provider.ts`, `museum-grid-builder.ts` (performer elevation copy), `museum-geometry-builder.ts` (suppression), `layout-types.ts` (performer elevation), `Museum3DScene.svelte`, `MuseumPerformerStation3D.svelte`, `DimensionFlipProof.svelte`, `museum-exhibit-sequences.ts`, `museum-room-content.ts`, `src/routes/test/museum-cave-3d/+page.svelte`, `tests/unit/museum/vulcan-cave-floor-plan.test.ts`.

---

### Task 1: Reshape the cave room graph — approach, sump, grotto

**Files:**
- Modify: `src/lib/features/museum/data/vulcan-cave-floor-plan.ts`
- Test: `tests/unit/museum/vulcan-cave-floor-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the existing describe block in `tests/unit/museum/vulcan-cave-floor-plan.test.ts` (match the file's existing import style — it already imports `buildVulcanCaveFloorPlan`):

```ts
describe("drowned gallery rooms", () => {
  const plan = buildVulcanCaveFloorPlan();
  const wing = (id: string) => {
    const w = plan.grid.wings.find((w) => w.id === id);
    if (!w) throw new Error(`missing wing ${id}`);
    return w;
  };

  it("builds the three water-bay rooms in route order", () => {
    expect(wing("cave-water-approach")).toBeDefined();
    expect(wing("cave-water-sump")).toBeDefined();
    expect(wing("cave-water")).toBeDefined();
  });

  it("gives the grotto exhibit scale (≥ 24 x 21 m interior)", () => {
    const g = wing("cave-water").bounds;
    // interior tiles = bounds minus the 1-tile wall ring; 0.5 m per tile
    expect((g.width - 2) * 0.5).toBeGreaterThanOrEqual(24);
    expect((g.height - 2) * 0.5).toBeGreaterThanOrEqual(21);
  });

  it("keeps the sump narrow and long (~2.5 x 10.5 m)", () => {
    const s = wing("cave-water-sump").bounds;
    const short = Math.min(s.width, s.height) - 2;
    const long = Math.max(s.width, s.height) - 2;
    expect(short * 0.5).toBeLessThanOrEqual(3);
    expect(long * 0.5).toBeGreaterThanOrEqual(10);
  });

  it("places three performers in the grotto", () => {
    const grottoPerformers = plan.grid.performers.filter((p) =>
      p.refId.startsWith("cave-water-")
    );
    expect(grottoPerformers.map((p) => p.refId).sort()).toEqual([
      "cave-water-a",
      "cave-water-b",
      "cave-water-c",
    ]);
  });

  it("still validates as a connected plan", () => {
    expect(plan.validation.valid).toBe(true);
  });
});
```

Note: check how existing tests access validation — if the build result exposes it under a different name (e.g. `plan.validation` vs a separate call), mirror the existing pattern in this file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/museum/vulcan-cave-floor-plan.test.ts`
Expected: FAIL — `missing wing cave-water-approach`.

- [ ] **Step 3: Implement the room graph changes**

In `src/lib/features/museum/data/vulcan-cave-floor-plan.ts`:

3a. Extend `EDGE_IDS` — replace the single `squeezeToWater` entry with three:

```ts
const EDGE_IDS = {
  thresholdToSqueeze: "cave-threshold->cave-squeeze",
  squeezeToApproach: "cave-squeeze->cave-water-approach",
  approachToSump: "cave-water-approach->cave-water-sump",
  sumpToGrotto: "cave-water-sump->cave-water",
  waterToFire: "cave-water->cave-fire",
  fireToEarth: "cave-fire->cave-earth",
  earthToAir: "cave-earth->cave-air",
  airToSun: "cave-air->cave-sun",
  sunToMoon: "cave-sun->cave-moon",
  moonToEgypt: "cave-moon->egypt-threshold",
} as const;
```

Update `cave-squeeze`'s north wall to `doorWall(EDGE_IDS.squeezeToApproach, "start", 3)`.

3b. Replace the existing `cave-water` room object with three rooms (insert `approach` and `sump` between `cave-squeeze` and the grotto in `VULCAN_CAVE_ROOMS`):

```ts
{
  id: "cave-water-approach",
  name: "The Flooded Approach",
  material: "stone",
  theme: "cave",
  minInteriorWidth: 3,
  minInteriorHeight: 16,
  description:
    "A descending passage where water is heard before it is seen; the floor drops toward the waterline.",
  walls: {
    north: doorWall(EDGE_IDS.approachToSump, "start", 3),
    south: doorWall(EDGE_IDS.squeezeToApproach, "end", 3),
    east: EMPTY_WALL,
    west: EMPTY_WALL,
  },
},
{
  id: "cave-water-sump",
  name: "The Sump",
  material: "stone",
  theme: "cave",
  minInteriorWidth: 3,
  minInteriorHeight: 14,
  description:
    "A fully flooded passage. The visitor walks the sump floor below the waterline and surfaces at the far end.",
  walls: {
    north: doorWall(EDGE_IDS.sumpToGrotto, "start", 3),
    south: doorWall(EDGE_IDS.approachToSump, "end", 3),
    east: EMPTY_WALL,
    west: EMPTY_WALL,
  },
},
{
  id: "cave-water",
  name: "The Drowned Gallery",
  material: "stone",
  theme: "cave",
  minInteriorWidth: 33,
  minInteriorHeight: 29,
  description:
    "The Water grotto: waterfall, mirror pool, glowworm dome, and three waterline alcoves performing A, B, C.",
  roomPresentation: { suppressTileGeometry: true },
  walls: {
    north: torchWall("center"),
    south: doorWall(EDGE_IDS.sumpToGrotto, "start", 3),
    east: doorWall(EDGE_IDS.waterToFire, "end"),
    west: EMPTY_WALL,
  },
  performers: [
    {
      offsetX: -0.28,
      offsetY: -0.42,
      facing: "south",
      refId: "cave-water-a",
      collisionRadiusTiles: 2,
      elevation: -1.0,
    },
    {
      offsetX: 0,
      offsetY: -0.42,
      facing: "south",
      refId: "cave-water-b",
      collisionRadiusTiles: 2,
      elevation: -1.0,
    },
    {
      offsetX: 0.28,
      offsetY: -0.42,
      facing: "south",
      refId: "cave-water-c",
      collisionRadiusTiles: 2,
      elevation: -1.0,
    },
  ],
},
```

Also add `roomPresentation: { suppressTileGeometry: true }` to `cave-water-approach` and `cave-water-sump`. (The `suppressTileGeometry` field and the `elevation` performer field do not exist yet — Tasks 6 and 7 add them. TypeScript will error until then; that is why Steps 3–5 of this task land together with Tasks 6/7's type stubs — see Step 4.)

3c. Replace the `cave-squeeze → cave-water` edge in `VULCAN_CAVE_EDGES` with three edges (all `type: "main-path"`, `corridorWidth: 3`):

```ts
{ from: "cave-squeeze", to: "cave-water-approach", type: "main-path", fromWall: "north", toWall: "south", corridorWidth: 3 },
{ from: "cave-water-approach", to: "cave-water-sump", type: "main-path", fromWall: "north", toWall: "south", corridorWidth: 3 },
{ from: "cave-water-sump", to: "cave-water", type: "main-path", fromWall: "north", toWall: "south", corridorWidth: 3 },
```

3d. Update `CAVE_SPACE_ORDER` (insert after `"cave-squeeze"`):

```ts
export const CAVE_SPACE_ORDER = [
  "cave-threshold",
  "cave-squeeze",
  "cave-water-approach",
  "cave-water-sump",
  "cave-water",
  "cave-fire",
  "cave-earth",
  "cave-air",
  "cave-sun",
  "cave-moon",
  "egypt-threshold",
] as const;
```

3e. Add matching entries to `CAVE_SPACE_PROGRAM` (between squeeze and cave-water):

```ts
{
  id: "cave-water-approach",
  title: "Flooded approach",
  description:
    "A descending passage where the sound of water builds before anything is visible.",
  tone: "threshold",
},
{
  id: "cave-water-sump",
  title: "The sump",
  description:
    "The route passes fully underwater before surfacing into the Water grotto.",
  tone: "threshold",
},
```

And update the `cave-water` program entry's title/description to match the new room ("The drowned gallery" / waterfall–pool–alcoves description).

- [ ] **Step 4: Add the two type stubs this task depends on**

To keep this task compilable on its own, add the minimal type changes now (Tasks 6/7 build on them):

In `src/lib/features/museum/domain/layout-types.ts`, add to `PerformerPlacement`:

```ts
  /** Absolute floor elevation (world Y, meters) for the performer's feet. Default 0. */
  elevation?: number;
```

In `src/lib/features/museum/domain/museum-grid-types.ts`, find `MuseumRoomPresentation`, make `modelPath` optional, and add the flag:

```ts
export interface MuseumRoomPresentation {
  modelPath?: string;
  ceilingModelPath?: string;
  emissiveBoost?: number;
  atmosphere?: { /* keep existing shape unchanged */ };
  /**
   * Skip rendering this wing's tile floors/walls/ceiling. Collision and
   * validation still come from the tile grid; a presentation layer (authored
   * GLB or graybox component) supplies the visible room instead.
   */
  suppressTileGeometry?: boolean;
}
```

(Keep every existing field exactly as typed today; only `modelPath` loses its required status.) Then grep for consumers of `.modelPath` and guard: in `Museum3DScene.svelte` the `authoredRooms` derived (`flatMap` over `grid.wings` near line 190) must filter on `wing.roomPresentation?.modelPath` being truthy before emitting an authored-room entry. `MuseumFloorPlanPreview.svelte` also reads `roomPresentation` — check it guards `modelPath` (add `?.` if needed).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/museum/vulcan-cave-floor-plan.test.ts`
Expected: PASS (all new + all pre-existing tests — the pre-existing 9 cave tests must stay green; if one asserts the old room count or old `cave-water` size, update it to the new topology deliberately, and say so in the commit message).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(museum): reshape Water bay into approach/sump/grotto rooms for the Drowned Gallery graybox" -- src/lib/features/museum/data/vulcan-cave-floor-plan.ts src/lib/features/museum/domain/layout-types.ts src/lib/features/museum/domain/museum-grid-types.ts src/lib/features/museum/components/game/Museum3DScene.svelte src/lib/features/museum/components/editor/MuseumFloorPlanPreview.svelte tests/unit/museum/vulcan-cave-floor-plan.test.ts
```

(Drop `MuseumFloorPlanPreview.svelte` from the pathspec if it needed no guard. NOTE: `MuseumFloorPlanPreview.svelte` and `Museum3DScene.svelte` may carry other sessions' uncommitted edits — commit ONLY if your diff in them is limited to the guard; otherwise stage nothing you didn't write.)

---

### Task 2: Terrain program — elevation zones, water blocking, layout helper

**Files:**
- Create: `src/lib/features/museum/data/drowned-gallery-terrain.ts`
- Test: `tests/unit/museum/drowned-gallery-terrain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildVulcanCaveFloorPlan } from "$lib/features/museum/data/vulcan-cave-floor-plan";
import {
  createDrownedGalleryTerrain,
  buildDrownedGalleryLayout,
  WATERLINE_Y,
  SUMP_FLOOR_Y,
  CAUSEWAY_Y,
} from "$lib/features/museum/data/drowned-gallery-terrain";

const plan = buildVulcanCaveFloorPlan();
const terrain = createDrownedGalleryTerrain(plan.grid)!;
const layout = buildDrownedGalleryLayout(plan.grid)!;

const wing = (id: string) => plan.grid.wings.find((w) => w.id === id)!.bounds;
// world-space center of a wing's interior
const center = (b: { x: number; y: number; width: number; height: number }) => ({
  x: (b.x + b.width / 2) * 0.5,
  z: (b.y + b.height / 2) * 0.5,
});

describe("drowned gallery terrain", () => {
  it("exists for the cave plan", () => {
    expect(terrain).toBeTruthy();
    expect(terrain.waterlineY).toBe(WATERLINE_Y);
  });

  it("keeps the museum datum outside the water bay", () => {
    const squeeze = center(wing("cave-squeeze"));
    expect(terrain.elevationAt(squeeze.x, squeeze.z)).toBe(0);
  });

  it("descends monotonically through the approach (north = deeper)", () => {
    const a = wing("cave-water-approach");
    const xs = (a.x + a.width / 2) * 0.5;
    const zTop = (a.y + 1.5) * 0.5;      // north interior edge
    const zBottom = (a.y + a.height - 1.5) * 0.5; // south interior edge
    let prev = terrain.elevationAt(xs, zBottom);
    expect(prev).toBeCloseTo(0, 1);
    for (let t = 1; t <= 6; t++) {
      const z = zBottom + (zTop - zBottom) * (t / 6);
      const e = terrain.elevationAt(xs, z);
      expect(e).toBeLessThanOrEqual(prev + 1e-9);
      prev = e;
    }
  });

  it("puts the sump mid-section at the sump floor depth", () => {
    const s = center(wing("cave-water-sump"));
    expect(terrain.elevationAt(s.x, s.z)).toBeCloseTo(SUMP_FLOOR_Y, 5);
  });

  it("puts the causeway at causeway height and blocks the pool", () => {
    expect(terrain.elevationAt(layout.causewayProbe.x, layout.causewayProbe.z)).toBeCloseTo(CAUSEWAY_Y, 5);
    expect(terrain.blockedAt(layout.poolProbe.x, layout.poolProbe.z)).toBe(true);
    expect(terrain.blockedAt(layout.causewayProbe.x, layout.causewayProbe.z)).toBe(false);
  });

  it("keeps each overlook walkable and the shore/gate blocked", () => {
    for (const o of layout.overlookProbes) {
      expect(terrain.blockedAt(o.x, o.z)).toBe(false);
    }
    expect(terrain.blockedAt(layout.shoreProbe.x, layout.shoreProbe.z)).toBe(true);
    expect(terrain.blockedAt(layout.gateProbe.x, layout.gateProbe.z)).toBe(true);
  });

  it("positions three alcove shelves on the north shore", () => {
    expect(layout.alcoves).toHaveLength(3);
    const g = wing("cave-water");
    const northZ = (g.y + g.height * 0.2) * 0.5;
    for (const a of layout.alcoves) {
      expect(a.z).toBeLessThan(northZ); // all in the north band
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/museum/drowned-gallery-terrain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the terrain module**

Create `src/lib/features/museum/data/drowned-gallery-terrain.ts`. Full shape (fill in the arithmetic exactly as commented):

```ts
/**
 * Drowned Gallery terrain program.
 *
 * Pure geometry: given the compiled cave grid, derives world-space elevation
 * zones, water-blocked regions, and graybox layout anchors for the Water bay.
 * The physics provider consumes elevationAt/blockedAt; the graybox visual
 * layer consumes the layout rects. Single source of truth for both.
 *
 * Datum: default museum floor = 0. See the design spec for the section.
 */
import type { MuseumGrid, MuseumTerrainProgram } from "../domain/museum-grid-types";

export const WATERLINE_Y = -1.5;
export const SUMP_FLOOR_Y = -4.1;
export const SUMP_CEILING_Y = -1.9;
export const CAUSEWAY_Y = -0.3;
export const SHELF_Y = -1.0;
export const POOL_BOTTOM_Y = -5.0;
export const DOME_APEX_Y = 9.5;

const TILE = 0.5;

export interface WorldRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface ElevationZone {
  rect: WorldRect;
  /** Elevation at the minimum edge of `axis` */
  from: number;
  /** Elevation at the maximum edge of `axis` */
  to: number;
  axis: "x" | "z";
}

export interface DrownedGalleryLayout {
  approach: WorldRect;   // interior, world units
  sump: WorldRect;
  grotto: WorldRect;
  pool: WorldRect;
  shore: WorldRect;
  overlooks: WorldRect[];       // walkable carve-outs inside the pool rect
  gate: WorldRect;              // blocked strip on the east leg
  alcoves: { x: number; z: number }[]; // shelf centers for A, B, C (west→east)
  waterPlanes: WorldRect[];     // where to render water surface at WATERLINE_Y
  // probe points for tests
  causewayProbe: { x: number; z: number };
  poolProbe: { x: number; z: number };
  shoreProbe: { x: number; z: number };
  gateProbe: { x: number; z: number };
  overlookProbes: { x: number; z: number }[];
}

function interiorWorldRect(b: { x: number; y: number; width: number; height: number }): WorldRect {
  return {
    minX: (b.x + 1) * TILE,
    minZ: (b.y + 1) * TILE,
    maxX: (b.x + b.width - 1) * TILE,
    maxZ: (b.y + b.height - 1) * TILE,
  };
}

const inRect = (r: WorldRect, x: number, z: number) =>
  x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

export function buildDrownedGalleryLayout(grid: MuseumGrid): DrownedGalleryLayout | null {
  const approachWing = grid.wings.find((w) => w.id === "cave-water-approach");
  const sumpWing = grid.wings.find((w) => w.id === "cave-water-sump");
  const grottoWing = grid.wings.find((w) => w.id === "cave-water");
  if (!approachWing || !sumpWing || !grottoWing) return null;

  const approach = interiorWorldRect(approachWing.bounds);
  const sump = interiorWorldRect(sumpWing.bounds);
  const grotto = interiorWorldRect(grottoWing.bounds);
  const gw = grotto.maxX - grotto.minX; // ≈ 25
  const gh = grotto.maxZ - grotto.minZ; // ≈ 22

  // North shore strip (alcoves + habitat): top 3.5 m
  const shore: WorldRect = { minX: grotto.minX, minZ: grotto.minZ, maxX: grotto.maxX, maxZ: grotto.minZ + 3.5 };
  // Pool: from shore edge down to 4.5 m short of the south wall, inset 2 m
  // on the west (waterfall margin) and 3 m on the east (gate leg walkway).
  const pool: WorldRect = {
    minX: grotto.minX + 2,
    minZ: shore.maxZ,
    maxX: grotto.maxX - 3,
    maxZ: grotto.maxZ - 4.5,
  };
  // Three overlooks: 3 m wide, biting 1.5 m into the pool's south edge,
  // centered under each alcove.
  const alcoveXs = [0.22, 0.5, 0.78].map((f) => grotto.minX + gw * f);
  const overlooks: WorldRect[] = alcoveXs.map((cx) => ({
    minX: cx - 1.5,
    minZ: pool.maxZ - 1.5,
    maxX: cx + 1.5,
    maxZ: pool.maxZ,
  }));
  // Gate: blocked strip across the east walkway, level with the shore edge
  const gate: WorldRect = { minX: pool.maxX, minZ: shore.maxZ + 1.0, maxX: grotto.maxX, maxZ: shore.maxZ + 1.6 };

  const alcoves = alcoveXs.map((x) => ({ x, z: shore.minZ + 1.6 }));

  return {
    approach, sump, grotto, pool, shore, overlooks, gate, alcoves,
    waterPlanes: [
      pool,
      // sump water: covers sump + the corridor gaps north and south of it
      { minX: sump.minX - 1, minZ: approach.minZ - 1.5, maxX: sump.maxX + 1, maxZ: grotto.minZ + 0.5 },
    ],
    causewayProbe: { x: grotto.minX + gw * 0.5, z: pool.maxZ + 2.0 },
    poolProbe: { x: grotto.minX + gw * 0.5, z: (pool.minZ + pool.maxZ) / 2 },
    shoreProbe: { x: grotto.minX + gw * 0.5, z: shore.minZ + 1.0 },
    gateProbe: { x: (gate.minX + gate.maxX) / 2, z: (gate.minZ + gate.maxZ) / 2 },
    overlookProbes: overlooks.map((o) => ({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2 })),
  };
}

export function createDrownedGalleryTerrain(grid: MuseumGrid): MuseumTerrainProgram | null {
  const layout = buildDrownedGalleryLayout(grid);
  if (!layout) return null;
  const { approach, sump, grotto } = layout;

  // Zones are evaluated in order; first hit wins. Gradients run along z
  // (north = minZ = deeper into the bay).
  const zones: ElevationZone[] = [
    // approach: 0 at south door → WATERLINE at north end
    { rect: approach, from: WATERLINE_Y, to: 0, axis: "z" },
    // corridor between approach and sump: flat at waterline depth
    { rect: { minX: sump.minX - 1, minZ: sump.maxZ, maxX: sump.maxX + 1, maxZ: approach.minZ }, from: WATERLINE_Y, to: WATERLINE_Y, axis: "z" },
    // sump south ramp: first 2 m descend WATERLINE → SUMP_FLOOR
    { rect: { minX: sump.minX, minZ: sump.maxZ - 2, maxX: sump.maxX, maxZ: sump.maxZ }, from: SUMP_FLOOR_Y, to: WATERLINE_Y, axis: "z" },
    // sump north ramp: last 3 m rise SUMP_FLOOR → -2.2
    { rect: { minX: sump.minX, minZ: sump.minZ, maxX: sump.maxX, maxZ: sump.minZ + 3 }, from: -2.2, to: SUMP_FLOOR_Y, axis: "z" },
    // sump middle: flat floor
    { rect: sump, from: SUMP_FLOOR_Y, to: SUMP_FLOOR_Y, axis: "z" },
    // corridor between sump and grotto: flat at -2.2
    { rect: { minX: sump.minX - 1, minZ: grotto.maxZ, maxX: sump.maxX + 1, maxZ: sump.minZ }, from: -2.2, to: -2.2, axis: "z" },
    // grotto surfacing steps: the south-west entry strip rises -2.2 → CAUSEWAY
    { rect: { minX: grotto.minX, minZ: grotto.maxZ - 3, maxX: grotto.minX + 6, maxZ: grotto.maxZ }, from: CAUSEWAY_Y, to: -2.2, axis: "z" },
    // grotto east exit ramp: last 2 m before the fire door rise CAUSEWAY → 0
    { rect: { minX: grotto.maxX - 2, minZ: grotto.maxZ - 6, maxX: grotto.maxX, maxZ: grotto.maxZ }, from: CAUSEWAY_Y, to: 0, axis: "x" },
    // grotto everywhere else: causeway level
    { rect: grotto, from: CAUSEWAY_Y, to: CAUSEWAY_Y, axis: "z" },
  ];

  const blocked: WorldRect[] = [layout.shore, layout.pool, layout.gate];
  const allowed: WorldRect[] = layout.overlooks;

  return {
    waterlineY: WATERLINE_Y,
    elevationAt(x, z) {
      for (const zone of zones) {
        if (!inRect(zone.rect, x, z)) continue;
        if (zone.from === zone.to) return zone.from;
        const min = zone.axis === "z" ? zone.rect.minZ : zone.rect.minX;
        const max = zone.axis === "z" ? zone.rect.maxZ : zone.rect.maxX;
        const v = zone.axis === "z" ? z : x;
        const t = max === min ? 0 : (v - min) / (max - min);
        return zone.from + (zone.to - zone.from) * t;
      }
      return 0;
    },
    blockedAt(x, z) {
      for (const a of allowed) if (inRect(a, x, z)) return false;
      for (const b of blocked) if (inRect(b, x, z)) return true;
      return false;
    },
  };
}
```

Sanity-check the ramp directions against reality before trusting my `from`/`to` orientation: in the corridor gap rects, `approach.minZ` is approach's north interior edge and `sump.maxZ` its south — if the layout engine places the chain in the OPPOSITE z direction (north = increasing z), flip every gradient. The monotonic-descent unit test catches this; if it fails, swap `from`/`to` in the z-gradient zones rather than fighting the engine.

Also add `MuseumTerrainProgram` to `src/lib/features/museum/domain/museum-grid-types.ts`:

```ts
/** Optional per-plan terrain: floor elevation + walk blocking beyond tile types. */
export interface MuseumTerrainProgram {
  waterlineY: number;
  elevationAt(worldX: number, worldZ: number): number;
  blockedAt(worldX: number, worldZ: number): boolean;
}
```

and an optional field on `MuseumGrid`:

```ts
  /** Optional terrain program (elevation + blocking). Attached by floor-plan builders. */
  terrain?: MuseumTerrainProgram;
```

Then attach it at the end of `buildVulcanCaveFloorPlan()` in `vulcan-cave-floor-plan.ts`, before the return:

```ts
import { createDrownedGalleryTerrain } from "./drowned-gallery-terrain";
// ...
const terrain = createDrownedGalleryTerrain(build.grid);
if (terrain) build.grid.terrain = terrain;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/museum/drowned-gallery-terrain.test.ts tests/unit/museum/vulcan-cave-floor-plan.test.ts`
Expected: PASS. If the monotonic test fails, flip gradient orientation per the note above — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(museum): drowned-gallery terrain program (elevation zones, pool blocking, layout anchors)" -- src/lib/features/museum/data/drowned-gallery-terrain.ts src/lib/features/museum/domain/museum-grid-types.ts src/lib/features/museum/data/vulcan-cave-floor-plan.ts tests/unit/museum/drowned-gallery-terrain.test.ts
```

---

### Task 3: Physics — ground clamping on terrain + water blocking

**Files:**
- Modify: `src/lib/features/museum/services/museum-physics-provider.ts`
- Test: `tests/unit/museum/museum-physics-elevation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { MuseumPhysicsProvider } from "$lib/features/museum/services/museum-physics-provider";
import type { MuseumGrid, MuseumTerrainProgram } from "$lib/features/museum/domain/museum-grid-types";

const STANDING = 0.85;

/** 20x20 all-floor grid, tileSize 0.5, optional terrain */
function makeGrid(terrain?: MuseumTerrainProgram): MuseumGrid {
  const tiles = new Map<string, { type: string }>();
  for (let x = 0; x < 40; x++)
    for (let y = 0; y < 40; y++) tiles.set(`${x},${y}`, { type: "floor" });
  return {
    tiles,
    wings: [],
    performers: [],
    furniture: [],
    triggers: [],
    spawn: { x: 10, y: 10 },
    tileScale: 0.5,
    terrain,
  } as unknown as MuseumGrid;
}

const rampTerrain: MuseumTerrainProgram = {
  waterlineY: -1.5,
  // floor drops 1m per 1 world-unit of x beyond x=5, capped at -4
  elevationAt: (x) => Math.max(-4, Math.min(0, -(x - 5))),
  blockedAt: (x, z) => z > 8, // "pool" band
};

describe("museum physics with terrain", () => {
  it("clamps standing height to local floor while descending", () => {
    const p = new MuseumPhysicsProvider(makeGrid(rampTerrain), 0.5, { x: 5, y: 0, z: 5 });
    // walk east onto the ramp; gravity steps down each frame
    for (let i = 0; i < 200; i++) p.movePlayer({ x: 0.05, y: -0.2, z: 0 }, 1 / 60);
    const pos = p.getPlayerPosition();
    const floor = rampTerrain.elevationAt(pos.x, pos.z);
    expect(pos.y).toBeCloseTo(floor + STANDING, 3);
    expect(pos.y).toBeLessThan(STANDING - 1); // actually descended
  });

  it("pushes the player up when walking uphill", () => {
    const p = new MuseumPhysicsProvider(makeGrid(rampTerrain), 0.5, { x: 9, y: 0, z: 5 });
    for (let i = 0; i < 200; i++) p.movePlayer({ x: -0.05, y: -0.2, z: 0 }, 1 / 60);
    const pos = p.getPlayerPosition();
    expect(pos.y).toBeCloseTo(STANDING, 3); // back on the datum
  });

  it("blocks movement into terrain-blocked regions", () => {
    const p = new MuseumPhysicsProvider(makeGrid(rampTerrain), 0.5, { x: 5, y: 0, z: 7.5 });
    for (let i = 0; i < 100; i++) p.movePlayer({ x: 0, y: -0.2, z: 0.05 }, 1 / 60);
    expect(p.getPlayerPosition().z).toBeLessThanOrEqual(8 + 0.01);
  });

  it("behaves exactly as before without terrain", () => {
    const p = new MuseumPhysicsProvider(makeGrid(), 0.5, { x: 5, y: 0, z: 5 });
    p.movePlayer({ x: 0.1, y: -0.2, z: 0 }, 1 / 60);
    expect(p.getPlayerPosition().y).toBeCloseTo(STANDING, 5);
    expect(p.isGrounded()).toBe(true);
  });
});
```

(If `MuseumGrid`'s real shape rejects the cast, mirror whatever minimal grid the existing museum unit tests construct — grep `tests/unit/museum/` for prior `MuseumPhysicsProvider` or grid fixtures first and reuse their factory.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/museum/museum-physics-elevation.test.ts`
Expected: FAIL — descending test: y stays at 0.85.

- [ ] **Step 3: Implement terrain support in the provider**

In `museum-physics-provider.ts`:

```ts
export class MuseumPhysicsProvider implements PhysicsProvider {
	// ... existing fields ...
	private terrain: MuseumTerrainProgram | null;

	constructor(
		private grid: MuseumGrid,
		private tileSize: number,
		spawnPosition: Vector3
	) {
		this.terrain = grid.terrain ?? null;
		const spawnFloor = this.floorYAt(spawnPosition.x, spawnPosition.z);
		this.position = { x: spawnPosition.x, y: spawnFloor + STANDING_Y, z: spawnPosition.z };
		// ... existing furniture/performer collider setup unchanged ...
	}

	private floorYAt(worldX: number, worldZ: number): number {
		return this.terrain ? this.terrain.elevationAt(worldX, worldZ) : 0;
	}
```

In `isWalkableAt`, after the `collidesWithAuthoredObject` early-return, add:

```ts
		if (this.terrain?.blockedAt(worldX, worldZ)) return false;
```

In `movePlayer`, replace the final clamp block:

```ts
		// Y movement: accept UCC's jump/gravity calculations, clamp at local floor
		this.position.y += desiredMovement.y;
		const minY = this.floorYAt(this.position.x, this.position.z) + STANDING_Y;
		if (this.position.y < minY) {
			this.position.y = minY;
		}
```

In `isGrounded`:

```ts
	isGrounded(): boolean {
		const minY = this.floorYAt(this.position.x, this.position.z) + STANDING_Y;
		return this.position.y <= minY + 0.01;
	}
```

In `teleport`:

```ts
	teleport(position: Vector3): void {
		const floor = this.floorYAt(position.x, position.z);
		this.position = { x: position.x, y: floor + STANDING_Y, z: position.z };
	}
```

Import `MuseumTerrainProgram` from `../domain/museum-grid-types`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/museum/`
Expected: PASS — the new file AND every pre-existing museum test (no-terrain behavior is unchanged: `floorYAt` returns 0).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(museum): physics ground clamping + walk blocking from the terrain program" -- src/lib/features/museum/services/museum-physics-provider.ts tests/unit/museum/museum-physics-elevation.test.ts
```

---

### Task 4: A/B/C performer sequences + room content

**Files:**
- Modify: `src/lib/features/museum/data/museum-exhibit-sequences.ts`
- Modify: `src/lib/features/museum/data/museum-room-content.ts`

- [ ] **Step 1: Fetch the sequence data via MCP**

Load the tool: ToolSearch `select:mcp__tka-domain-local__get_sequence_data`, then call three times with full output:

```
get_sequence_data(word: "AAAA", constraintPreset: "smooth")
get_sequence_data(word: "BBBB", constraintPreset: "smooth")
get_sequence_data(word: "CCCC", constraintPreset: "smooth")
```

Each returns a 5-beat sequence (beat 0 start position + 4 steps), `alpha3→alpha3` — verified 2026-08-02. If a call fails, STOP and report; do not hand-write step data.

- [ ] **Step 2: Add the three entries**

In `museum-exhibit-sequences.ts`, find where the existing raw sequences map to ids (near the bottom, `MUSEUM_EXHIBIT_SEQUENCES` is built via `Object.fromEntries`; each existing entry pairs an id like `"cave-water-seq"` with `convertRaw({ word, steps })`). Add three entries following the exact same raw format as the neighbors (letter, startPosition, endPosition, blueMotion, redMotion with the same field names, stepNumber):

- `"cave-water-seq-a"` ← the AAAA data
- `"cave-water-seq-b"` ← the BBBB data
- `"cave-water-seq-c"` ← the CCCC data

Keep the old `"cave-water-seq"` entry (other tooling may reference it); it is simply no longer used by the grotto.

- [ ] **Step 3: Wire room content**

In `museum-room-content.ts`, find `ROOM_CONTENT["cave-water"]` and replace its `performers` map:

```ts
  "cave-water": {
    performers: {
      "cave-water-a": { sequenceId: "cave-water-seq-a", autoPlay: true },
      "cave-water-b": { sequenceId: "cave-water-seq-b", autoPlay: true },
      "cave-water-c": { sequenceId: "cave-water-seq-c", autoPlay: true },
    },
  },
```

(Preserve any `exhibits` key if one exists for cave-water; only the performers map changes.)

- [ ] **Step 4: Verify with a quick node check + run museum tests**

Run: `npx vitest run tests/unit/museum/`
Expected: PASS. Additionally add to `tests/unit/museum/vulcan-cave-floor-plan.test.ts` (same commit):

```ts
  it("has a looping base-letter sequence per grotto performer", async () => {
    const { MUSEUM_EXHIBIT_SEQUENCES } = await import(
      "$lib/features/museum/data/museum-exhibit-sequences"
    );
    for (const [id, letter] of [
      ["cave-water-seq-a", "A"],
      ["cave-water-seq-b", "B"],
      ["cave-water-seq-c", "C"],
    ] as const) {
      const seq = MUSEUM_EXHIBIT_SEQUENCES[id];
      expect(seq, id).toBeDefined();
      expect(seq.steps).toHaveLength(4);
      for (const step of seq.steps) expect(step.letter).toBe(letter);
    }
  });
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(museum): A/B/C base-letter loop sequences for the Drowned Gallery performers" -- src/lib/features/museum/data/museum-exhibit-sequences.ts src/lib/features/museum/data/museum-room-content.ts tests/unit/museum/vulcan-cave-floor-plan.test.ts
```

---

### Task 5: Performer elevation — thread placement → grid → scene → station

**Files:**
- Modify: `src/lib/features/museum/services/museum-grid-builder.ts` (performer placement copy)
- Modify: `src/lib/features/museum/components/game/Museum3DScene.svelte`
- Modify: `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte`

- [ ] **Step 1: Carry elevation through the grid build**

In `museum-grid-builder.ts`, find `placePerformers` (it resolves `offsetX/offsetY` into `tileX/tileY` and pushes performer records onto `grid.performers`). Add `elevation: placement.elevation ?? 0` to the pushed record. Add the matching optional field to the placed-performer type — grep for the interface that declares `refId` + `tileX` + `collisionRadiusTiles` in `museum-grid-types.ts` (likely named `PlacedPerformer` or similar) and add:

```ts
  /** Floor elevation (world Y) the performer stands at. 0 on the museum datum. */
  elevation?: number;
```

- [ ] **Step 2: Pass it in the scene**

In `Museum3DScene.svelte`, find where `MuseumPerformerStation3D` is rendered (search `<MuseumPerformerStation3D`). It passes `worldX`/`worldZ` computed from `tileX/tileY`. Add:

```svelte
  worldY={performer.elevation ?? 0}
```

(using whatever loop variable name the file uses for the performer item).

- [ ] **Step 3: Accept it in the station**

In `MuseumPerformerStation3D.svelte`, add to `Props`:

```ts
    /** Floor elevation (world Y) for this station. Default 0 (museum datum). */
    worldY?: number;
```

resolve `const worldY = props.worldY ?? 0;` next to the existing `worldX`/`worldZ` consts, then find the root `<T.Group` whose position uses `worldX`/`worldZ` (search `position={[worldX` — the pedestal cylinder and PerformerRig hang off it) and add `worldY` to the Y coordinate. If the group's Y is currently a constant or expression, ADD `worldY` to it rather than replacing (`position={[worldX, worldY + <existing>, worldZ]}`); if pedestal and rig are positioned separately, offset both.

- [ ] **Step 4: Type-check the touched slice**

Run: `npx vitest run tests/unit/museum/` (grid builder is covered by the floor-plan tests)
Expected: PASS. A full `npm run check` comes at the end of the plan (fast-iteration rule: one cold check per turn, at the gate).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(museum): performer stations accept floor elevation (Drowned Gallery shelves)" -- src/lib/features/museum/services/museum-grid-builder.ts src/lib/features/museum/domain/museum-grid-types.ts src/lib/features/museum/components/game/Museum3DScene.svelte src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte
```

(Only commit `Museum3DScene.svelte` if your diff in it is limited to the `worldY` pass-through + Task 1's guard; it may hold other sessions' edits.)

---

### Task 6: Suppress tile geometry rendering for water-bay rooms

**Files:**
- Modify: `src/lib/features/museum/services/museum-geometry-builder.ts`

- [ ] **Step 1: Implement the skip**

The builder assembles per-wing chunks (floors ~line 540+, walls ~line 643, ceiling batch ~line 662–680; `wing` is in scope where room geometry is built). At the top of the per-room build path add:

```ts
  const suppressTiles = wing.roomPresentation?.suppressTileGeometry === true;
```

and skip adding this wing's floor positions, wall boxes/kit walls, and ceiling positions when `suppressTiles` is true. Torch fixtures, plaques, lights, and door tiles in OTHER wings must be unaffected; corridor geometry (built separately) must be unaffected. Keep the wing's `RoomLight` emission (the graybox benefits from the ambient fill).

IMPORTANT: this code also runs inside the geometry Web Worker (`src/lib/features/museum/workers/geometry-worker.ts` imports the builder). `roomPresentation` is plain data and survives structured clone — but verify the worker's input actually includes `wings` with `roomPresentation` (grep the worker's message payload). If the worker receives a stripped wing shape, add the flag to that payload type.

- [ ] **Step 2: Run the museum test suite**

Run: `npx vitest run tests/unit/museum/`
Expected: PASS (suppression is opt-in; only the three water rooms set it).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(museum): rooms can suppress tile geometry rendering (collision stays tile-based)" -- src/lib/features/museum/services/museum-geometry-builder.ts src/lib/features/museum/workers/geometry-worker.ts
```

(Drop the worker path if untouched.)

---### Task 7: The graybox visual layer

**Files:**
- Create: `src/lib/features/museum/components/game/DrownedGalleryGraybox.svelte`
- Modify: `src/lib/features/museum/components/game/Museum3DScene.svelte` (mount)
- Modify: `src/lib/features/museum/components/game/VulcanCaveScenicLayer.svelte` (skip suppressed wings)

- [ ] **Step 1: Build the component**

Create `DrownedGalleryGraybox.svelte`. It receives `grid` and renders every visible surface of the bay from the terrain layout. Structure (complete component skeleton — fill mesh lists exactly as commented):

```svelte
<script lang="ts">
  /**
   * TEMPORARY Phase-1 graybox for the Drowned Gallery (Water room).
   * Replaced by the authored GLB shell in Phase 2 — delete this component
   * and its Museum3DScene mount when roomPresentation.modelPath lands.
   * Geometry derives entirely from buildDrownedGalleryLayout(grid); do not
   * hardcode world coordinates here.
   */
  import { T } from "@threlte/core";
  import { AdditiveBlending, DoubleSide, BackSide } from "three";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import {
    buildDrownedGalleryLayout,
    WATERLINE_Y, SUMP_FLOOR_Y, SUMP_CEILING_Y, CAUSEWAY_Y,
    SHELF_Y, POOL_BOTTOM_Y, DOME_APEX_Y,
  } from "../../data/drowned-gallery-terrain";

  interface Props { grid: MuseumGrid }
  const { grid }: Props = $props();
  const layout = buildDrownedGalleryLayout(grid);

  const ROCK = "#2b2620";
  const FLOOR_WET = "#4a3d2d";
  const STONE_WALK = "#7c6647";
  const WATER = "#0d3a52";
  const GLOW = "#9fe8ff";
  const FIRELIGHT = "#ffb35c";
  const GATE_GOLD = "#d9a441";

  // helpers: center + size of a WorldRect
  const cx = (r: { minX: number; maxX: number }) => (r.minX + r.maxX) / 2;
  const cz = (r: { minZ: number; maxZ: number }) => (r.minZ + r.maxZ) / 2;
  const sx = (r: { minX: number; maxX: number }) => r.maxX - r.minX;
  const sz = (r: { minZ: number; maxZ: number }) => r.maxZ - r.minZ;

  // Ramp helper: box tilted to connect elevation a (at maxZ) to b (at minZ)
  function rampY(a: number, b: number) { return (a + b) / 2; }
  function rampAngle(a: number, b: number, run: number) { return Math.atan2(b - a, run); }
  function rampLen(a: number, b: number, run: number) { return Math.hypot(run, b - a); }

  // Glowworms: ~250 points on the dome underside
  const glowworms: [number, number, number][] = [];
  if (layout) {
    for (let i = 0; i < 250; i++) {
      glowworms.push([
        layout.grotto.minX + Math.random() * sx(layout.grotto),
        DOME_APEX_Y - 0.2 - Math.random() * 1.4,
        layout.grotto.minZ + Math.random() * sz(layout.grotto),
      ]);
    }
  }
</script>

{#if layout}
  <!-- ══ FLOORS (thin boxes; top surface = elevation) ══
       approach: one tilted ramp box (0 → WATERLINE along its length)
       sump: south ramp box, flat middle slab (top at SUMP_FLOOR_Y),
             north ramp box (surfacing steps, tilted)
       grotto: causeway slab (top CAUSEWAY_Y) covering interior minus pool,
               rendered as 4 rect slabs around the pool + 3 overlook slabs;
               surfacing strip tilted box; east exit ramp tilted box
       pool: floor slab at POOL_BOTTOM_Y + 4 basin side walls
       shore: slab at SHELF_Y - 0.5 with 3 shelf boxes topping at SHELF_Y -->

  <!-- ══ WALLS ══ per room: 4 perimeter box walls, leaving 2 m gaps at door
       spans (doors are at wall-center x of the connecting corridor; derive
       each gap from the corridor rects already implied by layout —
       approach/sump walls run floorMin-0.5 up to +2.8; grotto walls up to
       DOME_APEX_Y). Material ROCK, roughness 1. -->

  <!-- ══ CEILINGS ══
       sump: slab at SUMP_CEILING_Y over the sump's flat middle only
       grotto: slab at DOME_APEX_Y (the dome read comes from wall height;
       apex detail is Phase 2) -->

  <!-- ══ WATER ══ for each layout.waterPlanes rect: plane at WATERLINE_Y,
       color WATER, transparent, opacity 0.55, DoubleSide.
       Underwater volume tint: BackSide boxes filling sump interior
       (SUMP_FLOOR_Y → WATERLINE_Y) and pool basin, color WATER, opacity 0.3. -->

  <!-- ══ HABITAT ══ per layout.alcoves[i]: shelf box 4 × 0.4 × 3 topping at
       SHELF_Y; back wall box behind; PointLight FIRELIGHT intensity 2.2
       distance 7 at shelf + 1.8 high; emissive cyan disc (pictograph
       placeholder) on the back wall, 1.2 m diameter, at eye height.
       Rock fin boxes between alcoves protruding 1.5 m south. -->

  <!-- ══ GATE ══ 6 vertical bars (0.08 × 1.6 × 0.08) spanning layout.gate,
       plus a crossbar; material GATE_GOLD, emissiveIntensity 0.3. -->

  <!-- ══ WATERFALL PLACEHOLDER ══ emissive white-blue column
       (1.6 × (DOME_APEX_Y − WATERLINE_Y) × 0.5) at the pool's NW corner,
       opacity 0.8; PointLight #bfe9ff above the plunge point. -->

  <!-- ══ BALUSTRADE ══ 0.5 m-tall stone boxes along the causeway's pool
       edge, skipping the three overlook spans. -->

  <!-- ══ GLOWWORMS ══ -->
  <T.Points>
    <T.BufferGeometry
      oncreate={(geo) => {
        const arr = new Float32Array(glowworms.flat());
        geo.setAttribute("position", new (globalThis as any).THREE?.BufferAttribute?.(arr, 3) ?? undefined);
      }}
    />
    <T.PointsMaterial color={GLOW} size={0.07} sizeAttenuation transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} />
  </T.Points>

  <!-- ══ FILL LIGHTS ══ cool downlight over pool center (#7fd8ff, 1.6, d=22,
       y=6); dim warm light at the surfacing steps. -->
{/if}
```

Implementation notes (binding, not suggestions):
- Every `<!-- ══ -->` block above becomes real `<T.Mesh>` markup — no block may be skipped. Use `<T.Mesh position={...} rotation.x={...}><T.BoxGeometry args={[w,h,d]} /><T.MeshStandardMaterial color={...} roughness={1} /></T.Mesh>`.
- For the BufferGeometry positions, import `BufferAttribute` from `three` directly instead of the `globalThis` fallback shown: `oncreate={(geo) => geo.setAttribute("position", new BufferAttribute(new Float32Array(glowworms.flat()), 3))}`.
- Ramps: `rotation.x = rampAngle(...)` for z-axis ramps (sign depends on the same north-z orientation as Task 2 — verify visually), box length `rampLen(...)`, centered at midpoint, mid elevation `rampY(...)`. Floors are 0.3 thick; subtract half thickness from the y so the TOP surface sits at the elevation.
- Door gaps in walls: the corridors enter each room at the door spans; leave a 2.5 m gap centered on the connecting corridor's x-center (`(sump.minX+sump.maxX)/2` for the north-south chain; the fire-door gap sits on the grotto's east wall at its south end). Precision is not critical — collision comes from tiles; these walls are visual.
- Keep every dimension derived from `layout` — zero literals for positions.

- [ ] **Step 2: Mount it in the scene, and mute the legacy scenic layer there**

In `Museum3DScene.svelte`, import and render next to the existing `VulcanCaveScenicLayer` mount:

```svelte
{#if grid.wings.some((w) => w.id === "cave-water-sump")}
  <DrownedGalleryGraybox {grid} />
{/if}
```

In `VulcanCaveScenicLayer.svelte`, wherever it iterates cave rooms / mode rooms to place mood lights and floor discs, skip wings whose `roomPresentation?.suppressTileGeometry` is true (their dressing now comes from the graybox layer). Grep its room-lookup and add the guard.

- [ ] **Step 3: Run the museum suite**

Run: `npx vitest run tests/unit/museum/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(museum): Drowned Gallery graybox layer (floors, water, alcoves, gate, glowworms)" -- src/lib/features/museum/components/game/DrownedGalleryGraybox.svelte src/lib/features/museum/components/game/Museum3DScene.svelte src/lib/features/museum/components/game/VulcanCaveScenicLayer.svelte
```

---

### Task 8: Submersion — detection, callback, page overlay

**Files:**
- Modify: `src/lib/features/museum/components/game/Museum3DScene.svelte`
- Modify: `src/lib/features/museum/components/game/DimensionFlipProof.svelte`
- Modify: `src/routes/test/museum-cave-3d/+page.svelte`

- [ ] **Step 1: Detect in the scene's frame loop**

In `Museum3DScene.svelte`: add to `Props`:

```ts
    /** Fires when the camera crosses the terrain waterline (underwater state). */
    onSubmergedChange?: (submerged: boolean) => void;
```

Near the player-position sync (`syncPositionFromPhysics` / the `useTask` that runs per frame), add:

```ts
  let wasSubmerged = false;
  function updateSubmersion(): void {
    const terrain = grid.terrain;
    if (!terrain || !props.onSubmergedChange) return;
    const eyeY = playerPosition.y + 0.75;
    const submerged = eyeY < terrain.waterlineY;
    if (submerged !== wasSubmerged) {
      wasSubmerged = submerged;
      props.onSubmergedChange(submerged);
    }
  }
```

Call `updateSubmersion()` inside the main `useTask` after movement/position sync (guard: it early-returns when no terrain, so every other museum surface pays one boolean check).

- [ ] **Step 2: Forward through DimensionFlipProof**

In `DimensionFlipProof.svelte`: add the same optional `onSubmergedChange` prop to its Props interface and pass it to `<Museum3DScene ... onSubmergedChange={props.onSubmergedChange} />`.

- [ ] **Step 3: Overlay on the test route**

In `src/routes/test/museum-cave-3d/+page.svelte`:

```ts
  let submerged = $state(false);
```

Pass `onSubmergedChange={(s) => (submerged = s)}` on the `<DimensionFlipProof>` mount. Add inside `<main>` after the DimensionFlipProof block:

```svelte
  {#if submerged}
    <div class="underwater-overlay" aria-hidden="true"></div>
  {/if}
```

And the style (inside the existing `<style>`):

```css
  .underwater-overlay {
    position: absolute;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    background:
      radial-gradient(circle at 50% 55%, rgba(13, 58, 82, 0.18), rgba(6, 26, 38, 0.55) 78%);
    backdrop-filter: blur(1.5px) saturate(0.85);
  }
```

No transition/animation needed for graybox (and none under reduced-motion by construction — it is a static overlay toggled by state).

- [ ] **Step 4: Run the museum suite once more**

Run: `npx vitest run tests/unit/museum/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(museum): waterline submersion event + underwater overlay on the cave review route" -- src/lib/features/museum/components/game/Museum3DScene.svelte src/lib/features/museum/components/game/DimensionFlipProof.svelte src/routes/test/museum-cave-3d/+page.svelte
```

---

### Task 9: Gate — full check + report

- [ ] **Step 1: One cold typecheck, captured**

```bash
npm run check > /tmp/check.log 2>&1
grep -niE "error" /tmp/check.log
```

Expected: `svelte-check found 0 errors`. Fix anything your diff introduced; pre-existing errors in files you never touched are NOT yours to fix — list them in the report instead.

- [ ] **Step 2: Full museum unit suite**

Run: `npx vitest run tests/unit/museum/`
Expected: all green, including the pre-existing floor-plan and shell-contract tests.

- [ ] **Step 3: Report**

Report back with: (a) the list of commits (SHA + subject), (b) the test summary output, (c) the check.log grep output, (d) any deviations from this plan and why. Do NOT attempt browser screenshots — the orchestrator runs the visual pass and the Austen walkthrough next, per the spec's dispatch discipline.

---

## Self-review notes (already applied)

- Spec coverage: rooms/dimensions (T1), elevation tech (T2+T3), waterline + submersion trigger (T2, T8), placeholder performers with A/B/C (T1, T4, T5), suppressed tile geometry + graybox envelope incl. placeholder waterfall/glowworms/gate/shelves (T6, T7), route overlay (T8), verification gate (T9). Audio ducking deferred: the test route mounts no soundscape player, so there is nothing to duck in Phase 1 — noted for Phase 2.
- Ordering: every commit compiles — T1 carries the two type stubs it needs; T2 attaches terrain before T3 consumes it (inert in between); T6 is opt-in.
- Type consistency: `MuseumTerrainProgram` lives in `museum-grid-types.ts`; `elevation` on `PerformerPlacement` (authoring) and on the placed performer record (grid); `worldY` on the station; constants exported once from `drowned-gallery-terrain.ts` and imported everywhere else.
- Known uncertainty, called out where it bites: z-axis orientation of the room chain (T2 Step 3 note + monotonic test), exact ceiling-batch code shape (T6 references line ranges, not exact code), station root-group Y (T5 Step 3 instructs additive change).
