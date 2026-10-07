---
status: active
value: null
effort: null
remaining: "Verify Fathom Ocean — Gate 3: World Boundary and Palette against src/lib/shared/3d/environments/primitives/SkyGradient.svelte before resuming implementation. Prior recorded remainder: Verify recorded boundary defects and their fixes against current ocean sky, camera views, and visual proof."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Fathom Ocean — Gate 3: World Boundary and Palette

Date: 2026-08-09
Status: design approved, implementation not started
Scene steward: Fathom
Predecessor: `2026-08-09-fathom-ocean-lighting-palette-handoff.md` (Gates 1–2, done)

## The complaint this answers

Austen, 2026-08-09, looking at the scene from the `world` camera preset:

> it just looks like a ring floating in space with a area inside which is just a
> actual limited section which doesn't actually cover the whole ocean which
> doesn't actually make a lot of sense and it feels like I'm still underwater
> even when my camera is above the supposed surface of the water

Two defects, one root cause and one separate bug.

## Diagnosis

**The ocean is authored as a diorama with a finite extent, and fog is doing all
the work of hiding that extent. Fog only works from inside it.**

Measured, not assumed:

| Boundary | Radius | Source |
|---|---|---|
| Reef content | 8.0 – 18.4 m | `scripts/ocean-zone-layout.json`, 9 zones |
| Placement contract | **20 m** | `placementRules.outerBoundaryMetres` |
| Water plane | 25 m | `WaterSurface.svelte`, `size = 50` |
| Seabed mesh | 35 m | `Seabed` `world_size [70, 70, 1.60]` |

Three non-coincident circular boundaries with nothing beyond all three. The ring
is not emergent — `outerBoundaryMetres: 20` literally encodes it.

The seabed is also **flat**: 1.6 m of total relief across 70 m, on a 2,561-vert
plate (~50×51 grid, ~1.4 m per quad). There is no geology to bound the world
with, which is why objects read as slapped onto a floor.

The second defect is unrelated and simpler: `OceanScene.svelte` sets `scene.fog`
and `scene.background` in an `$effect` with **no camera dependency**, so nothing
in the scene ever reads camera Y. There is no above-water state to enter.

## How the sibling scenes solve this

Both are correct and the ocean is the outlier. This design copies them.

| | Forest | Winter | Ocean (today) |
|---|---|---|---|
| World radius | 170 m | 170 m | 35 m |
| Boundary shape | 3-harmonic irregular ±17 m | 3-harmonic irregular ±17 m | perfect circle |
| Terrain | height function, Python-built | 128×192 polar grid from `terrain_height(x,y)` | flat 2,561-vert plate |
| Edge | skirt from `0.84 × R` | skirt from `0.86 × R`, drops `WORLD_SKIRT_DEPTH = 14 m`, closed underside | hard rim |
| Backdrop | `SkyGradient` — inverted sphere r=200, 3-stop vertical gradient, **re-centred on the camera every frame** | none | none |
| Depth cue | fog + camera-locked dome | fog | fog only |

Key references:
- `scripts/build-winter-environment.py:270-330` — `terrain_boundary_radius(angle)`,
  `terrain_height(x,y)`, `WORLD_SKIRT_START = 0.86`, `WORLD_SKIRT_DEPTH = 14.0`
- `scripts/build-winter-environment.py:366-420` — closed underside, `tka_underside_closed`
- `scripts/build-forest-environment.py:228-268, 582-586` — `basin_rise`, `bank_noise`,
  `outer_influence = smoothstep(48, 102, radius)`, boundary assertion
- `src/lib/shared/3d/environments/primitives/SkyGradient.svelte:51, 245-249` —
  inverted `SphereGeometry(200, 32, 32)`, `depthTest:false`, `renderOrder:-1`,
  `skyMesh.position.copy(activeCamera.position)` each frame

The camera-locked dome is the load-bearing part. A backdrop that cannot be
outrun has no seam.

## Decisions taken

Austen chose, via question:

1. **Keep it underwater.** The scene is only ever viewed from near the stage.
   Skip all sky/surface-break work. Clamp the camera below the water plane.
2. **Bound it with a drop-off into the abyss**, not a wall ring. The floor ends
   and falls away into deep water.
3. **One wall, one drop.** Upstage (north, behind the proscenium arch) the ground
   RISES into a reef wall. Downstage and to the sides it FALLS into the abyss.
   A 360° drop-off was rejected because it is the ring restated — an isolated
   plateau in a void.
4. **Fold the palette pass into the same Blender trip.** One export, one
   optimize, one R2 upload.

Defaults taken without objection: the upstage wall crests **above** the water
plane; the abyss is ~45 m deep with no visible bottom; world radius is 110 m.

## Design

### 1. `scripts/build-ocean-terrain.py`

Replaces the flat `Seabed` with a generated terrain, following
`build-winter-environment.py` structurally. A polar grid, 128 radial × 192
angular, driven by `ocean_floor_height(x, y)` composed of:

- **Performer clearing**, r ≤ 8 → forced to 0. Non-negotiable: the stage and the
  inner placements must keep exactly the footing they have now.
- **Reef shelf**, r = 8 → 24. Relief ±0.6 m from a 3-term noise sum. Enough to
  stop reading as a plate; shallow enough that ground-snapped coral does not tilt.
- **Upstage wall**, gated on the north half. Ramps from r ≈ 16, cresting above
  the water plane (Blender Z > +12) at r ≈ 30–38. North is upstage: the arch
  zone is `proscenium-arch-north`, and Blender +Y maps to three.js −Z, which is
  behind the stage from the default camera at z = +19.
- **Shelf lip and abyss skirt** on the south/east/west. Lip radius uses the same
  3-harmonic perturbation the siblings use, so the edge is never a circle.
  Amplitude ±2.5 m on a nominal 24 m lip — the siblings run ±17 m on 170 m, so
  this holds their ~10% proportion. Past the lip, a plunge of ~45 m — three
  times winter's 14 m, because the goal is "gone past fog," not "falls away."
- **Closed underside**, winter's `tka_underside_closed` treatment, so a low or
  orbiting camera never catches a paper-thin edge.

World radius 110 m, not the siblings' 170. **Radius costs no vertices** — the
grid is a fixed 128×192 either way. It costs *resolution*: 110 m gives 0.86 m
per radial ring where 170 m would give 1.33 m. Since `FogExp2` at 0.026 is ~96%
opaque by 70 m, everything past ~70 m is invisible regardless, so the smaller
radius buys finer detail where it can actually be seen, for free.

Vertex cost: ~25k for the terrain, against a 102.6M-vert `.blend`. Negligible.

### 2. The abyss must be dark, and fog cannot do that

`FogExp2` has no height term. It fades everything to one colour — currently
`#0a2438`. Looking *down* into the abyss would fade to exactly the same navy as
looking *out* at the horizon. There would be no darker-with-depth cue at all.
Fog alone produces a ledge over a glowing blue nothing.

Two parts:

**`OceanDepthGradient`** — built on the `SkyGradient` pattern, not a new
invention. Inverted sphere, camera-locked, `depthTest:false`, `renderOrder:-1`,
3-stop vertical ramp: brighter teal near the water plane, `#0a2438` at eye
level, near-black `#01060b` below. Because it is camera-locked with depth test
off, looking down past the shelf lip always resolves to black. The lip
silhouettes against a void instead of against the same navy as the horizon.

**A baked vertex-colour darkening ramp** on all terrain below the lip,
multiplied into albedo. Without it the drop face — being real geometry — fogs
toward `#0a2438` and glows *brighter* than the void behind it, which inverts the
depth read. Baked at build time, zero runtime cost.

### 3. Content re-placement

- `placementRules.outerBoundaryMetres`: 20 → 24, the shelf lip.
- Re-run `ocean_zone_pass3.py` / `ocean_zone_recompose.py` so every object
  re-runs `ground_snap(o, target_min_z=-0.15)` against the new surface. This is
  a scripted operation, which is what makes replacing the seabed affordable.
- Borrow forest's far-depth trick: a sparse outer band of silhouette-scale rocks
  on the upstage wall face, drawn **only from already-imported meshes**. No new
  assets — `Reef_Wall` is 41,617 verts for one 6 m rock, so the existing
  vocabulary cannot be used to build volume.

### 4. Palette, same pass

- Cool the salmon sand.
- Collapse 6–7 hue families to two plus one accent.
- Thin coral variety by ~⅓.

### 5. Runtime

- Clamp the camera below y = +10.5. This closes the "still feels underwater"
  complaint by construction rather than by building an above-water state.
- Register `OceanDepthGradient` in the ocean scene.
- `FogExp2` density stays 0.026 (Gate 1 value, unchanged).

### 6. Pipeline

Unchanged from `blender-first-3d-scenes.md`. Snapshot to
`ocean_scene.pre-terrain.blend` first, per the established `.pre-<pass>.blend`
convention.

`build-ocean-terrain.py` → `blender-export-ocean-full.py` →
`optimize-ocean-glb.mjs` → `static/models/ocean/` → R2.

Note the carried debt: **prod still serves the old GLB.** The R2 re-upload of
`ocean_flora_scene.glb` was already outstanding before this gate.

## Verification

The `/test/ocean-scene` harness exists and is not auth-gated. Its `world` preset
(`[0, 26, 30]`, target origin, fov 52) is the exact shot that showed the ring,
so it is the before/after.

Required frames, per `visual-verification-mandatory.md`, adjusted for a 3D
scene — aspect ratio, not width, changes camera framing, so the sweep covers
distinct ratios rather than every listed width:

- `world` — the ring must be gone; no boundary visible in any direction
- `hero` — the upstage wall must read as a landmark, not a backdrop
- `shaft` — god-ray columns must read against dark water, not navy haze
- `reef` — the shelf lip must silhouette against black
- `walk` — eye-level; the abyss must be legible as depth

Plus two measured checks via `evaluate_script`:

- The camera clamp holds at y ≤ 10.5 when driven past it.
- The depth ordering is correct. Sample pixel luminance at three points in the
  `reef` frame: shelf surface, drop face, open void below the lip. Required
  ordering is `shelf > drop face > void`. If the drop face is brighter than the
  void, the vertex-colour darkening ramp is missing or too weak — that is the
  specific failure this gate exists to prevent.

## Risks

- **Ground-snap regressions.** 348 objects re-snap onto a surface that is no
  longer flat. Anything near the new slopes may tilt or float. Mitigation: the
  clearing r ≤ 8 stays forced flat, and the shelf keeps relief to ±0.6 m.
- **Terrain replacement discards the current `Seabed_Sand_PBR` UV layout.** The
  new mesh needs winter's warped world-planar UV treatment
  (`terrain_snow_uv`, `build-winter-environment.py:326-330`) to avoid visible
  grid-repeat cadence.
- **Vert budget.** The `.blend` is already 102.6M verts across 348 meshes, ~54M
  after `simplify 0.65`. The terrain adds ~25k; the risk is the temptation to
  dress the new space with more 41k-vert rocks. Do not.

## Cross-scene findings for Bramble and Elsa

1. **Forest has two placement systems that disagree.** Scene Lab renders
   `FOREST_TREE_RINGS` (`forest-scene-config.ts:92-121`) — 4 rings at
   r = 14/17.5/21/25, counts 20/28/36/44. Production renders
   `forest-environment.glb` baked from `forest-tree-layout.json` — 11 named
   clusters reaching r ≈ 118. These are not the same forest. The Lab rings also
   use a fake-perspective trick (density increasing outward 20→44 while
   `scaleBase` shrinks 1.4→0.9) that only holds from one vantage.
   This is the same class of bug as the ocean's Scene Lab config→3D disconnect
   at `ScenePreview.svelte:296` — so it is a pattern across scenes, not a one-off.
2. **Winter has device-tier content LOD; forest appears not to.** Winter bakes
   `Winter_Base_` / `Winter_Medium_` / `Winter_High_` into object names and
   toggles by tier. No forest equivalent found. May be deliberate.
3. Carried from Gate 2: the additive-shader double-multiply bug, cone geometry
   (not intensity) being what makes a key light read, and near-black stage
   materials making lighting gates unverifiable.

## Verification record — 2026-08-09

Harness: `/test/ocean-scene`. Chrome DevTools MCP against the shared debug
instance. All frames webp/70.

### What the terrain measures

| Property | Value |
|---|---|
| Vertices | 24,770 (was 2,561) |
| Extent | 220 x 220 m (was 70 x 70) |
| Wall crest | z = +15.56, above the water plane at +12 |
| Abyss floor | z = -46.16 |
| Shelf lip | irregular, 21.9-26.1 m |
| Shipped size | 3.04 MB |
| Placements floating or buried | 0 of 320 (worst gap was 44.66 m) |
| `ocean_terrain_profile` assertions | 12 of 12 pass |

### Views

- `hero`, `reverse`, `world` at 16:9 / 16:10 / 2.33:1 / 0.56:1.
- 3840 was not shot separately: the harness is a full-bleed 3D canvas with no
  CSS layout, so 3840x2160 frames identically to 1920x1080. Aspect ratio, not
  width, changes a perspective camera's composition.
- `world` needs `?clamp=0` — the preset sits at y = 26 specifically to
  photograph the boundary from outside it, which the camera clamp exists to
  prevent in normal use.

### Does the boundary read

From `world`, luminance falls monotonically outward: shelf centre 44.4, near
the lip 37.4, abyss left 35.7, abyss bottom-left 32.9, upper void 29.2. The
floor visibly ENDS on three sides against a graded dark, and rises upstage.
The old failure — a lit disc floating on flat black — is gone.

From every eye-level view the boundary is invisible, which is the point: fog
reaches opacity well before the lip, so the world has an edge without ever
showing one.

### Two defects the frames caught that the design did not predict

1. **The seabed was inside the wrong GLB.** `ocean_flora_scene.glb` contained
   a Seabed, and so did `ocean-environment.glb`. LOW tier skips the flora
   scene, so it had no floor at all; every other tier drew two. This predates
   Gate 3 and shipped to production. Fixed by giving the terrain its own
   export and skipping it in the flora export.
2. **The water plane's rim was legible** as a black lid with a curved cut-off
   at 50 m. Enlarged to 110 m, where fog takes it first.

### Not done, and why

- **The reef's hue families are untouched.** The design's palette mechanism was
  invalid: 45 of the scene's materials are texture-driven with no flat colour
  to retune, and the only 4 flat-colour materials are the torches, which must
  stay warm. The sand — the loudest offender and the half of the brief that
  named a specific colour — is graded via `baseColorFactor`. Collapsing the
  coral hue families needs its own design pass; the same `baseColorFactor`
  technique will do it, per material, once the target families are chosen.
- **R2 upload and deploy are deliberately not done.** Production serves
  `ocean_flora_scene.glb` from R2 and `ocean-environment.glb` from the site
  build. Uploading one without deploying the other puts the re-grounded reef
  on the old flat floor, with 320 objects floating or buried. The two are one
  coupled release and need Austen's go-ahead.
- `WaterSurface.svelte` carries the `size = 110` change **uncommitted**:
  another session has in-flight `surfaceY`/`opacity`/`tirDarkness` props in
  that same file for the Water Traverse, and committing it would sweep their
  work.
