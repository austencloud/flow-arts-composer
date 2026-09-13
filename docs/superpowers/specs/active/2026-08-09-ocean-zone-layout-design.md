---
status: active
value: 3
effort: M
remaining: "Six of ten ledger items are done and in the tree. Four are genuinely open, in this order: (1) wire fauna cluster anchors to the zone anchor points - fish-compute.ts still divides cluster centres into an even ring and knows nothing about zones; (2) write scripts/verify-ocean-zone-layout.mjs and get it green - the file does not exist, so the exclusion/spacing contract is unenforced; (3) decimate boat.glb and octopus.glb and place them in wreck-hollow-southeast - the zone is declared in scripts/ocean-zone-layout.json but no placement references either asset; (4) stage crack/rim-light treatment. Items 2 and 1 are worth doing first: 2 is cheap and protects the work already banked."
depends_on: ""
plan_path: ""
tags: [3d, ocean, scene-composition, blender]
last_triaged: 2026-09-13
---

# Ocean Zone Layout — Intentional Composition Pass

**Date:** 2026-08-09
**Status:** In progress -- approved and substantially executed, not a draft. The
header read "Draft for review" until 2026-09-13 while six of the ten ledger
items below had already been checked off and five commits had landed against the
contract. Corrected during spec reconciliation.

**Reconciliation evidence (2026-09-13):** `scripts/ocean-zone-layout.json` is the
finalized contract (v1, seed 840917, with `placementRules` and
`heroPresentations`). Executing commits: `672366b53` (per-hero staging
directives), `393d757d6` (zone recompose tooling + placement updates),
`4267e5020` (re-ground 348 placements onto the sculpted terrain), `7ed1fd408`
(proscenium + stage clearance), `c6c18c541` (compose the reef from a per-asset
facts index). Each of the four unchecked ledger items was re-tested against the
tree and all four are still genuinely open -- see `remaining` in the frontmatter.

**Owner scene:** `src/lib/shared/3d/environments/scenes/ocean/`
**Template precedent:** Forest ground ecology (`2aef59b53b`, `scripts/forest-ground-life-layout.json` + verify/contact-sheet loop)

## Problem

The ocean is the most engineered scene in the app (GPGPU fish boids, verlet
jellyfish, Gerstner water, Snell window, caustics, quality tiers) and the least
composed. The 169 authored placements in
`src/lib/shared/3d/environments/scenes/ocean/authored/placements.ts` were laid
down under purely mechanical composer constraints (`maxObjects: 100`,
`minSpacing: 0.8`, one 5 m stage exclusion circle) — spacing rules without
intent. Observed live (2026-08-09, Scene Lab, two orbit angles):

1. **Ring-with-a-hole composition.** Reef objects form an even perimeter ring;
   the mid-ground between the stage exclusion radius and the ring is dead sand.
2. **No focal hierarchy.** The performer stage is the intended focal point but
   reads as an unlit black box; nothing frames it.
3. **Material clash.** Black basalt pinnacles (unlit, flat) sit next to mossy
   green rocks and pastel Meshy corals as scattered singles instead of grouped
   geological features.
4. **No depth layering.** Everything lives in one distance band; no foreground
   silhouettes, no background dissolve into fog.
5. **Uniform fauna.** Fish cluster centers are an evenly divided ring
   (`fish-compute.ts:121-132`) — even the life is uniformly distributed.
6. **Benched hero assets.** `boat.glb`, `octopus.glb`, `ray.glb`,
   `structures/*`, photoreal Meshy corals sit on disk with no role.

## Goal

Give the ocean the same authored-layout contract the forest just received: a
named-zone JSON with seeds, buffers, and verification tooling, recomposed in
Blender per `blender-first-3d-scenes.md`, baked into a regenerated
`ocean_flora_scene.glb`, with fauna anchored to the authored zones.

Target outcome: ocean composition rises from ~5/10 to the Autumn/Winter tier
and becomes the best overall scene in the app.

## Coordinate frame and constants

- Runtime metres, stage dais centered at origin (8×6 rect, slab height 0.5).
- Authored placements currently span x,z ∈ [−20, +20].
- **Performer exclusion:** keep 5 m radius, hard.
- **Default camera:** hosts orbit from +Z looking toward −Z; −Z is "upstage"
  (backdrop), +Z is "downstage" (camera side), ±X are wings.
- Layout file: `scripts/ocean-zone-layout.json` (schema mirrors
  `forest-ground-life-layout.json`: version, seed, coordinateFrame, rules,
  zones with center/radii/rotation/density/seed).

## Composition model

Three depth bands from the default camera, one story beat per quadrant:

| Band | Distance from origin | Role |
|---|---|---|
| Foreground (downstage, +Z) | 6–12 m | Low silhouette interest: anemones, starfish, brain coral, sea grass. Never taller than 1.5 m — must not occlude the stage. |
| Midground (wings, ±X) | 8–16 m | The current dead zone. Stepping-stone clusters that lead the eye from stage to reef walls. |
| Background (upstage, −Z) | 13–20 m | Tall backdrop: kelp curtain, coral citadel, basalt ridge dissolving into fog. |

### Zones (draft in `scripts/ocean-zone-layout.json`)

1. **`proscenium-arch-north`** — the sunlit coral arch (`meshy-sunlit-coral-arch`,
   currently at [−10.3, −8.7] as a side object) relocates to directly upstage
   (≈ [0, −13]) and scales up to frame the stage from the default camera. The
   single highest-leverage move in the pass.
2. **`coral-garden-east`** — dense, colorful: neon coral summit, photoreal Meshy
   corals (decimated per pipeline budget), anemones, reef-fish anchor zone.
3. **`kelp-curtain-northwest`** — tall kelp massed as one wall (density 1.2)
   instead of scattered singles; backdrop layer, sway shader already handles it.
4. **`basalt-ridge-west`** — ALL basalt pinnacles group into one geological
   ridge feature. Solves the material clash by making dark rock a distinct
   region, not scattered outliers. Gets a cool rim light in Blender bake.
5. **`wreck-hollow-southeast`** — `boat.glb` half-buried at ≈ [13, 10], listing
   ~20°, as the secondary focal point and story beat. `octopus.glb` posed in
   the hull. Needs a Blender decimation pass (12.3 MB → budget).
6. **`stepping-stones-east` / `stepping-stones-west`** — small rocks, urchins,
   shells, sea grass tufts bridging the mid-ground dead zone, density fading
   toward the stage exclusion.
7. **`open-sand-south`** — deliberately kept sparse (the ray's patrol ground;
   negative space is part of the composition, not a bug).

### Hero presentation rule (2026-08-09 addition, per Austen)

Every hero asset is staged individually — clear sightline, breathing room, a
deliberate best face toward the default camera. Heroes are never scatter
filler. The full per-hero staging directives live in
`scripts/ocean-zone-layout.json` → `heroPresentations`: the three arches as a
swim-through colonnade off the proscenium, `reef-wall` broadside as the eastern
backdrop shoulder, basalt pinnacles as a navigable slot canyon (not a fence),
the citadel/mountain/tower as a stepped skyline trio, specimen corals (brain,
fan, staghorn, table, bommie, photoreal) on museum pads inside the coral
garden, the wreck bow-toward-stage, and rock tables as structural perches.

### Placement rules (layout JSON `placementRules`)

- `stageExclusionRadiusMetres: 5` (existing, hard)
- `foregroundMaxHeightMetres: 1.5` (+Z band sightline guarantee)
- `minSpacingMetres: 0.8` (keep)
- `outerBoundaryMetres: 20`
- `minimumZones: 7`, `minimumInstances: 160` (parity with today's 169)
- Every zone: own sub-seed, elliptical radii, rotation — forest schema.

## Stage treatment (not part of the layout JSON, same pass)

- Brighten the bioluminescent crack network on `RuinsPlatform` and add a soft
  up/rim light so the dais reads as a stage, not a hole. (Shader + light tweak
  in `OceanStage.svelte` / `RuinsPlatform.svelte`; stage stays procedural per
  its can't-bake-to-glTF constraint.)

## Fauna anchoring

`fish-compute.ts` cluster centers change from the even ring to seeded picks
from zone anchor points exported alongside the layout (reef species →
`coral-garden-east` + `proscenium-arch-north`; bottom feeders →
`stepping-stones-*`; the ray patrols `open-sand-south`). Randomness within a
cluster is unchanged — distribution becomes intentional, motion stays alive.
Visitor rotation (`SpeciesRotationManager`) is untouched.

## Pipeline (per `blender-first-3d-scenes.md`)

1. Recompose in `ocean_scene.blend` following the zone layout (Blender is the
   authoring surface; the JSON is the contract it must satisfy).
2. Re-export placements (`scripts/blender-export-placements.py` →
   `blender-to-placements.cjs`) so `placements.ts` and the Scene Lab composer
   stay in sync.
3. Re-bake `ocean_flora_scene.glb` via the established optimize path (resize
   1024/WebP/weld/simplify 0.65/Draco); confirm it still clears the 25 MiB
   Cloudflare limit or continues shipping from R2.
4. Clone the forest QA loop: `scripts/verify-ocean-zone-layout.mjs` (zone
   coverage, exclusion, height-band, spacing assertions) +
   `scripts/build-ocean-zone-layout-contact-sheet.mjs` (top-down render for
   review).
5. Visual verification per `visual-verification-mandatory.md`: Scene Lab orbit
   screenshots from default camera + both wings, before/after.

## Non-goals

- No changes to fish boid behavior, jellyfish physics, water/atmosphere
  shaders, or quality tiers.
- No new effect slots.
- `ocean_scene_raw.glb` (1.02 GB Blender dump) cleanup is out of scope (worth
  a separate look at deploy-asset trimming, but not this pass).

## Ledger

- [x] `scripts/ocean-zone-layout.json` finalized (hero presentations added 2026-08-09)
- [x] Blender recomposition of `ocean_scene.blend` to the zone contract
      (`scripts/ocean_zone_recompose.py`, headless, idempotent; backup at
      `blender/ocean_scene.pre-zone-pass.blend`; 5 m exclusion audit clean)
- [ ] Boat + octopus decimation pass and placement in `wreck-hollow-southeast`
      (boat/octopus are NOT in ocean_scene.blend yet — import step required)
- [x] Placements re-export → `placements.ts` regenerated (43 entries updated)
- [x] `ocean_flora_scene.glb` re-baked and optimized (36.8 MB; prod still
      serves from R2 — **R2 re-upload is an open deploy step**)
- [ ] Stage crack/rim-light treatment
- [ ] Fauna cluster anchors wired to zone anchor points
- [ ] `verify-ocean-zone-layout.mjs` green (script not yet written; exclusion
      audit currently lives inline in ocean_zone_recompose.py)
- [x] Blender renders (`blender/previews/zone-pass-*.png`) + live Scene Lab
      screenshots from two orbit angles reviewed 2026-08-09
