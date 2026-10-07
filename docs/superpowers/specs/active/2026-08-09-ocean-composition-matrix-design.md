---
status: active
value: null
effort: null
remaining: "Verify ocean composition matrix proof and downstream scene changes against current asset facts and ecology rules."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Ocean Composition Matrix — Design

**Status:** approved 2026-08-09
**Supersedes the placement half of:** `scripts/generate-ocean-placements.cjs` hardcoded scale buckets
**Related:** `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md` (Gate 3, the terrain this composes onto)

## The problem

The reef's 300+ objects are placed by a generator that knows nothing about what
it is placing. Every model is normalized to 1-unit maximum extent at import, and
then re-scaled by a hardcoded per-bucket range:

```js
lerp(0.6, 2.5, rng())   // "meters -- prominent reef rocks"
lerp(1.5, 4.0, rng())   // "large reef formations"
lerp(3.0, 6.0, rng())   // "tall background kelp"
```

Real-world scale is discarded at import and re-invented by bucket. A table coral
and a boulder in the same bucket come out the same size. Nothing knows what a
thing sits on, which way its interesting face points, or whether it grows alone
or in colonies.

Two symptoms name the same root cause. `FloraInstances.svelte` decides whether a
mesh sways by measuring its bounding-box aspect ratio, with the comment that
*"the GLB names are opaque."* And 49 of the 172 unmapped objects in
`ocean-blender-placements.json` are anonymous `Mesh_0.001`–`Mesh_0.049`, because
nothing ever recorded which asset they came from.

There is no per-asset knowledge anywhere in the pipeline. That is the gap.

## The shape of the fix

An **index of facts** about each asset, a small set of **ecology rules** keyed by
silhouette class, and a **seeded generator** that reads both plus the terrain.

Scope is 47 static placeable assets (16 in `static/models/ocean/`, 20 in
`meshy/`, 4 in `structures/`, 5 in `polyhaven/`, 2 in `kelp/`). Measuring them
found eight are duplicate re-exports of another asset under a different name, so
the scene has 39 distinct shapes, not 47 -- less variety than it believed. The 50 fish in
`pack/` are a separate pelagic family and are out of scope here. Eight root GLBs
are stage or pipeline artifacts, not scenery: `dais`, `stage`, `stage_meshy`,
`ocean-environment`, `ocean_flora_scene`, and the three `*_raw`.

The 300+ scene objects are *instances* of those 47. That is what makes a
researched index affordable: it is a 47-row table, not a 300-row one.

## Two data files, deliberately separate

They have different lifetimes. Facts get corrected when they are wrong. Rules
get tuned every time someone looks at a frame and wants the kelp thicker. One
file would mean every art tweak risks stepping on a measurement.

### `scripts/ocean-asset-facts.json`

One row per asset. Objective.

```jsonc
"meshy/table_coral": {
  "path": "meshy/table_coral.glb",
  "species": "Acropora hyacinthus (table coral)",
  "sizeMetres": { "min": 1.0, "max": 2.2, "axis": "width" },
  "upAxis": "y",
  "baseOffset": -0.04,
  "footprintRadius": 0.48,
  "facing": 45,
  "silhouette": "plate",
  "source": "meshy",
  "signature": { "vertices": 24770, "ratio": [1, 0.31, 0.98] }
}
```

`upAxis`, `baseOffset`, `footprintRadius` and `signature` are **measured** by a
script from the GLB. `species`, `sizeMetres`, `facing` and `silhouette` are
**authored** — the researched half, anchored to real marine biology rather than
art direction (table coral 1–2 m across, staghorn 0.5–1.5 m, brain coral
0.3–1 m, basalt pinnacle 6–12 m, giant kelp 10 m+).

`baseOffset` and `footprintRadius` are in normalized units, so they survive any
choice of metre size: multiply by the chosen size to get metres.

`facing` is degrees, 0 = +z, naming which way the asset's interesting face
points. Arches, fans and anything with a front need it; boulders do not and get 0.

### `scripts/ocean-ecology-rules.json`

One row per silhouette class — eleven rows. Tunable.

```jsonc
"plate": {
  "substrate": ["rock", "reef"],
  "slopeRange": [0, 25],
  "depthBand": [2, 14],
  "habit": "solitary",
  "clumpSize": [1, 1],
  "companionSpacing": 1.4,
  "tiltJitter": 8,
  "yawPolicy": "face-camera-biased"
}
```

Silhouette classes: `plate`, `branching`, `mound`, `column`, `blade`, `boulder`,
`shell`, `arch`, `wall`, `swimmer`, `wreck`. A `roleAdmits` block maps each zone
role to the classes it accepts.

`yawPolicy` is `free`, `face-camera-biased` (rotate the `facing` direction toward
the default hero camera, with jitter), or `face-current` (align to the scene's
nominal current, for blades).

Zones stay in `scripts/ocean-zone-layout.json`, untouched. They keep owning
staging and sightlines — this is a theatre with a proscenium arch and a dais, and
a reef that composed itself would put a pinnacle in front of the stage. The rules
own what is plausible *within* a zone; the zone owns where the audience looks.

## Three scripts

### 1. Measure — `scripts/measure-ocean-assets.cjs`

Reads all 47 GLBs and writes the mechanical fields into `ocean-asset-facts.json`.

The GLB JSON-chunk parser and node-transform walk already exist inline in
`scripts/measure-ocean-models.cjs`. They get extracted to
`scripts/ocean-glb-metrics.cjs` and both scripts consume that — one owner for
"what are this GLB's bounds," per `never-hand-roll.md`.

It **never overwrites authored fields**. A new asset appears as a row with the
authored fields blank, which is the signal that a row needs a human.

The `signature` field (vertex count plus rounded bbox ratios) is what resolves
the 49 anonymous `Mesh_0.0xx` objects: match each one against the 47 known
assets. Whatever does not match is genuinely orphaned geometry and gets dropped
rather than carried forward as a mystery.

### 2. Substrate — `scripts/ocean_substrate.py`

The generator needs elevation, slope and substrate at any `(x, y)`. Those come
from `ocean_terrain_profile.py`, the single owner of the world's shape.

The original plan baked a heightmap for a JS sampler to interpolate, because the
generator was going to be JavaScript. It is Python instead (see below), so the
generator calls the height function directly and there is no baked grid, no
staleness guard, and no second implementation to drift. `ocean_substrate.py`
adds gradient, normal, slope, local mean height and substrate on top of it.

Substrate is derived, never painted, so retuning the terrain moves the substrate
with it:

| Condition | Substrate |
|---|---|
| slope > 35° | `rock` |
| inside the clearing radius (8 m) | `sand` |
| relief above the local mean | `reef` |
| otherwise | `sand` |

`LOCAL_MEAN_RADIUS` is 8 m. At the 3 m first guess the mean tracked the value it
was being compared against, and the world came out 85% sand with two branching
corals in it.

### 3. Generate — `scripts/generate-ocean-composition.py`

The spec originally called for rewriting `scripts/generate-ocean-placements.cjs`.
That script feeds `placements.ts`, which is a **dead path**: the live scene is
composed in `blender/ocean_scene.blend` and baked into `ocean_flora_scene.glb`,
and `ocean-blender-placements.json` is an extract of that blend rather than an
input to it. 87 of its 169 placements name objectKeys that are never registered.
Rewriting it would have produced a correct file nothing reads.

So the generator is new, and Python, next to the terrain module it depends on.
Per zone, per admitted asset:

1. Rejection-sample candidate points inside the zone ellipse.
2. Keep points whose sampled substrate, slope and depth satisfy the asset's rules.
3. Pick a size from `sizeMetres` and convert it to a scale factor (below).
4. Sit it on the terrain using `baseOffset × scale`.
5. Tilt to the substrate normal, jittered by `tiltJitter`.
6. Yaw per `yawPolicy`.
7. Clumping species place a seed, then scatter siblings within `clumpSize`.
8. Reject anything violating physical overlap, `companionSpacing` against its own
   class, the stage exclusion radius, the shelf lip, or the camera corridor.

Zone heroes are placed first from their own queue with their own attempt budget.
Drawn uniformly from the pool, the proscenium arch simply never came up against
nineteen boulders and eighteen kelp.

A final **floor-scatter** pass dresses the annulus the zones do not reach. The
nine zones cover roughly half the usable seabed and the rest rendered as bald
sand, which made the reef read as set pieces on a parking lot. Scatter places
only low classes, capped below knee height so it can cross the camera corridor.

Seeded per zone exactly as before: same seed, same reef.

**Size is not scale.** Geometry is normalised to 1-unit *maximum* extent at
import, so a scale factor sets the longest axis, which is only the authored size
when that axis happens to be the one the size names. Authoring kelp as "4-11 m
tall" and applying it directly produced an 11 m wide flat slab. Every conversion
goes through `scale_for_size`, which divides by the measured extent of the axis
`sizeMetres.axis` names.

### 4. Build and render — `prepare-ocean-sources.mjs`, `build-ocean-composition.py`, `render-ocean-composition.py`

A JSON summary cannot check a visual claim, so the composition is instantiated
and photographed rather than inspected. Blender's glTF importer reads neither
EXT_meshopt_compression nor Draco, so sources are decoded first via
`gltf-transform copy`. The build imports each distinct GLB once, normalises it,
and linked-duplicates it per placement, into a separate `ComposedReef` collection
with the pre-existing scenery hidden — the generated reef has to be compared
against what is there before it replaces it. The render shoots the same camera
presets the runtime harness uses.

`plot-ocean-composition.py` answers the cheap top-down half — masses, stage
clearance, anything stranded past the lip — without the Blender trip.

## What building it caught

Every one of these was invisible in the JSON and obvious in a frame:

- **`kelp_plant.glb` is not kelp.** It is a default Icosphere plus a 141 m stray
  object, and it was the most-placed blade in the scene.
- **Two `kelp/` assets are unusable** — one origin 39 extents off its geometry,
  one a flat sheet. All three are recorded in the index as excluded, with the
  reason, rather than silently skipped.
- **Deleting the importer's empties dropped their transform**, which put sea
  grass 44 m off origin and scaled kelp 2x its neighbours.
- **`transform_apply` refuses multi-user mesh data and only warns**, so
  normalisation was silently skipped for GLBs that share a mesh across nodes.
  The build now asserts the normalised extent is 1.0.
- **A `column` rule that could never fire**: it required rock substrate while
  capping slope at 30°, but rock is *derived* from slope > 35°. Rules are now
  validated for satisfiability at load.

## The downstream change

`FloraInstances.svelte` currently infers "is this a plant" from bounding-box
aspect ratio because the GLB names are opaque. Once placements carry the asset
id, sway is a fact lookup — `silhouette: "blade"` sways, `"boulder"` does not.
The aspect heuristic is deleted, and kelp that reads as bulky stops being frozen.

## How this is proven

Not by a green typecheck. The reef is built into Blender and rendered at the
`hero`, `reef`, `world` and `reverse` presets, and those frames are read. Every
defect listed above was found that way and none of them would have failed a
test. Frames live in `docs/superpowers/specs/active/ocean-composition/`.

Unit tests cover the mechanical parts, which are the parts that can be wrong
silently: `ocean_substrate.py` against known points of the height function, the
signature matcher against a known asset, and the generator's rule validation.

## Deliberately not doing

- **Fish.** `pack/` is 50 pelagic assets with their own motion problem. Separate.
- **Retiring zones.** Terrain-driven emergent composition is more realistic and
  wrong for a staged scene.
- **Re-authoring the `.blend`.** This generates placements; the Blender scene is
  rebuilt from them by the existing `reground-ocean-placements.py` path.
