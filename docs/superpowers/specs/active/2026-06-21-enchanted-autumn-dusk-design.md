---
status: active
value: 2
effort: M
remaining: "Verify Enchanted Autumn Dusk — 3D Scene Redesign against scripts/generate-autumn-meshy-from-image.mjs before resuming implementation. Prior recorded remainder: Verify the autumn hero and fill assets against AutumnFlora and the current environment; identify any remaining Meshy swap and visual acceptance."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Enchanted Autumn Dusk — 3D Scene Redesign

- **Date:** 2026-06-21
- **Status:** Built (scene architecture + runtime complete, 2026-06-22). Hero/fill assets pending.
- **Asset pivot (2026-06-22):** the low-poly CC0 kit fill read too mathematical. Asset authoring moved to Meshy **image-to-3D** (`model_type: standard`) driven by ChatGPT-curated reference images, replacing both text-to-3D heroes and the low-poly kit fill for everything the camera sees up close. Pipeline: `scripts/generate-autumn-meshy-from-image.mjs` (single + multi-image) + `scripts/autumn-meshy-images.json`. Concept-art prompts: `docs/reference/autumn-meshy-image-prompts.md`. The text-to-3D scripts remain for reference but are superseded. Kit-fill→Meshy swap in `AutumnFlora.svelte` is the follow-up once the first asset batch is generated.
- **Scope:** Replace the legacy procedural Autumn 3D environment (lollipop cylinder+sphere trees, `Stage3D` box) with a Meshy-authored + CC0-kit "Ocean treatment" scene.
- **Mandate:** "Take it to the moon like we did with the ocean scene." Direction 4 (Autumnal Magic), glow level **pushed / luminous**.
- **Mood board:** `static/sketches/2026-06-21-autumn-fantasy-forest-moods.html`

---

## 1. Why

Autumn was graded the weakest 3D scene in the set: trees are `CylinderGeometry` trunk + `SphereGeometry` canopy via InstancedMesh (`scenes/autumn/AutumnForest.svelte`) — programmer-art tier — and it still mounts the legacy `Stage3D` box. Ocean proved the alternative bar (authored GLB + runtime systems). Autumn is first in the "weakest first" queue; Blossom and Cosmic follow in later passes.

This redesign is reference-aligned with `.claude/rules/blender-first-3d-scenes.md`: static set-dressing is authored geometry (here: Meshy → GLB → optimize), not hand-built primitive meshes. Runtime particles/shaders/interaction remain the legitimate procedural exception.

## 2. Look

Golden-hour collapsing into dusk. A **warm/cool split**: low warm sun rakes one side (gold/amber); bioluminescence wakes on the shadow side (teal/violet). The orbit camera (the scene is a 360° backdrop around a performer on a stage platform — not a path traversed) reveals a different read from every angle.

- **Palette:** `#8a2e16` crimson · `#d98324` amber · `#2a1838` dusk · `#00c8b4` glow · `#ffd8a0` wisp.
- **Glow = pushed/luminous:** flora self-emits. Glowing mushroom groves, vein-lit flowers, emissive crimson-gold canopy rim, will-o-wisps. Reads "unmistakably magical," not just "pretty autumn."
- **Atmosphere:** soft ground fog (FogExp2), leaf litter, dusk sky gradient, volumetric god-ray shafts from the low sun.
- **Differentiation:** distinct from green daytime **Forest** and snowy-campfire **Winter** — both daytime, neither luminous.

## 3. Build strategy (chosen: A)

- **A — Full Ocean treatment (CHOSEN).** Meshy authors the *hero* assets only; CC0 kit (already on disk) instanced for mid/background fill; runtime systems for particles/pond/lighting/interaction. Mirrors Ocean's `authored/ + runtime/ + quality/` split.
- B — Kit-only + shaders. Rejected: low-poly kit trees can't carry the hero silhouette; fails the mandate.
- C — Procedural L-system trees at runtime. Rejected: fights never-hand-roll + blender-first, perf-risky, unpredictable.

## 4. Architecture (mirrors `scenes/ocean/`)

Restructure `src/lib/shared/3d/environments/scenes/autumn/` from flat legacy components into:

```
scenes/autumn/
  AutumnScene.svelte            # orchestrator: GLB load + fog + quality + scene-feature progress
  authored/
    AutumnFlora.svelte          # instanced CC0 kit placement (trees/mushrooms/rocks/flora)
    placements.ts               # seeded placement data (rings, jitter) — pure
  runtime/
    AutumnRuntimeSystems.svelte # composes the runtime children
    atmosphere/
      GodRayShafts.svelte       # reuse/adapt ocean's
      AutumnParticles.svelte    # leaves + spores + fireflies (driven by FallingParticles primitive)
    wisps/
      WillOWisps.svelte         # glowing orbs + drifting point lights
    water/
      AutumnPond.svelte         # reuse Winter's Reflector pattern
    lighting/
      AutumnLighting.svelte     # warm sun (DirectionalLight) + cool fill + hemisphere
    interaction/
      AutumnInteraction.svelte  # cursor/performer ray → pulse nearby glow (reuse OceanInteraction)
    loading/                    # reuse ocean loading curtain via scene-feature context
  quality/
    autumn-quality.ts           # clone detectOceanQuality + config tiers
    autumn-quality-override.svelte.ts
```

`AutumnScene.svelte` follows `OceanScene.svelte` exactly: load hero GLB with `meshoptDecoder`/`ktx2Loader`, fold seabed+flora-style progress into one combined fraction, report `environment` readiness, set fog/background, mount `authored/` + `runtime/`.

**Bespoke hero GLB:** `static/models/autumn/autumn-environment.glb` (Meshy → optimize). Loaded via `useGltf` with meshopt + KTX2 decoders.

## 5. Assets

### Bespoke (Meshy text-to-3D → optimize)
Author each as its own Meshy job, then compose/merge in Blender if needed, export one optimized environment GLB (or a small set of hero GLBs instanced):

1. **Hero gnarled ancient tree** ×2–3 silhouettes — twisted trunk, exposed roots, crimson-gold canopy. `texture-prompt` bakes emissive canopy-edge glow.
2. **Glowing mushroom-grove focal cluster** — oversized luminous caps, vein-lit gills (emissive baked + runtime emissive override for the pulse).
3. **Terrain shell** — gentle mounded forest floor with leaf litter, a pond depression, exposed roots/rocks.
4. **Pond bed** (if not part of terrain) — basin for the Reflector surface.

### Reused CC0 kit (already in `static/models/vegetation/` — zero new downloads)
- Trees (fill): `tree_oak_fall`, `tree_fat_fall`, `tree_detailed_fall`, `tree_tall_fall`, `tree_default_fall`, `tree_cone_fall`, `tree_thin_fall`, `tree_simple_fall`, `tree_small_fall`, `tree_plateau_fall`, `tree_blocks_fall` — instanced rings, mid/background.
- Mushrooms (glow groves): `mushroom_red`, `mushroom_redGroup`, `mushroom_redTall`, `mushroom_tan`, `mushroom_tanGroup`, `mushroom_tanTall` — runtime emissive override (Winter snow-tint clone pattern).
- Detail: `stump_*`, `log_*`, `grass_*`, `flower_*` (red/yellow/purple), `rock_*` (80+ available).

Kit models get a decimation/KTX2 pass via gltf-transform only if the combined draw budget exceeds the mobile target (measure first — see §7).

## 6. Meshy pipeline (clone the proven stage scripts)

Existing, shipped: `scripts/generate-stage-meshy.mjs` (preview→refine→download) + `scripts/optimize-stage-meshy.mjs` (gltf-transform optimize). `MESHY_API_KEY` already in `.env`. Two-stage flow: `mode: preview` (geometry, `should_remesh`, `target_polycount`) → `mode: refine` (`enable_pbr`, `texture_prompt`). **The glow can be baked into the PBR texture via `texture_prompt`** (per the stage optimize script's own note), complementing the runtime emissive override.

**Action:** clone to `scripts/generate-autumn-meshy.mjs` + `scripts/optimize-autumn-meshy.mjs`, parameterized for `static/models/autumn/`. Per-hero-asset prompt + texture-prompt pairs live in the spec/plan. Keep `--simplify true` ON (Meshy refine output is dense). Hero trees keep `--texture-size 2048`; lesser pieces 1024.

> **Physical-blocker note:** Meshy jobs run against Austen's account/credits and take minutes each. Generation is gated on Austen kicking off (or approving) the Meshy runs. The plan will stage all prompts so they can fire in one batch.

## 7. Performance

- Quality tiers: clone `detectOceanQuality` / `getOceanQualityConfig` → `autumn-quality.ts` (particle counts, instance counts, shadow on/off, texture size per tier).
- GPU instancing for all fill flora (one InstancedMesh per kit model).
- Hero GLB: Draco + meshopt + KTX2 (webp fallback) via the optimize script.
- Mobile WebGL budget enforced at the optimize pass. Measure combined scene draw with `scripts/measure-ocean-models.cjs` (clone → autumn) before shipping.

## 8. Interaction (earns its slot)

**Unique observable:** the forest responding to the performer's *presence*. Performer motion + pointer (reuse Ocean's cursor-ray in `OceanInteraction.svelte`) pulses nearby will-o-wisp + mushroom emissive brighter, with falloff by distance. Optional soft chime on the recent jellyfish-chime audio path. Distinct from any other effect: no existing effect visualizes environment-reacts-to-performer.

## 9. Integration

- `Environment3D.svelte` already routes `BackgroundType.AUTUMN → AutumnScene` — no switch change.
- Reuse scene-feature `environment` key (`requiresAsyncLoad: true`) for the async GLB load + loading curtain. Optional later: add `wisps` / `pond` toggles to `SCENE_FEATURES` (out of scope for v1).
- Retire legacy `scenes/autumn/AutumnForest|AutumnGround|WoodlandStream|MushroomCluster|GroundMist.svelte` and the `Stage3D` mount once the new scene reaches parity.

## 10. Out of scope (YAGNI)

- Multi-biome / sectioned forest (rejected: fights the orbit-camera backdrop model).
- New scene-feature toggles beyond reusing `environment`.
- A generic data-driven GLB-environment registry (known gap in `blender-first-3d-scenes.md`; not this scene's job).
- Seasonal day/night cycle — single baked dusk mood only.

## 11. Risks / open items

- **Meshy art-style consistency** across separately-generated hero trees — mitigate with a shared prompt prefix + a Blender pass to unify scale/origin/material.
- **Emissive at dusk** can blow out under bloom — tune against the per-tip halation budget already in the effects system.
- **Draw-call budget** with instanced kit + hero GLB on mobile — measure before shipping (§7).
- Pond Reflector cost on low tier — gate behind quality tier (drop to a static tinted plane on low).
