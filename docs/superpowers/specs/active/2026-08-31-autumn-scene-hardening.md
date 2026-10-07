---
status: active
value: null
effort: null
work_state: in-progress
remaining: Verify Autumn boot/retry and adaptive-quality acceptance on the production scene, then close remaining hardening gaps.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Autumn Scene Hardening

**Triage evidence (2026-10-07):** `src/lib/shared/3d/environments/scenes/AutumnScene.svelte` is present and the spec describes changes to the shipped scene. Boot, retry, adaptive-quality, and viewpoint acceptance still need production-scene verification.

**Status:** In progress; production-scene boot, retry, and adaptive-quality verification pending.
**Date:** 2026-08-31
**Owner:** 3D environments
**Review route:** `/test/autumn-scene`

## Outcome

Preserve the Autumn hero shot while bringing the whole environment up to the
same standard. The scene must remain an enchanted performance clearing from the
front, but it must also hold together from the side, reverse, walk, settlement,
shack, pond, fungi, fern, and root-contact views. Loading failure, adaptive
quality changes, scene retention, and reduced motion are part of the scene, not
separate polish work.

The current hero framing is the visual reference, not a mandate to preserve its
bugs. Its tree arch, warm/cool dusk split, moon, clearing scale, and performer
read stay recognizable. Oversized stars, bleached ground, hard shadow islands,
the neon-board stage, and empty backlot views do not.

## Audit Baseline

The adversarial audit graded the current scene:

- Architecture: C
- Code quality: B
- Accessibility: A+
- UX states: D
- UI consistency: A+
- Performance: D
- Security: A+

The optimized GLB is 18,160,288 bytes and renders 1,971,775 authored triangles
after GPU instance multiplication. At the 1920x1080 review shot, high quality
submitted 248 calls and 3.95 million renderer triangles. Low quality removed
only 6 calls and 63,800 triangles, a 1.6% reduction. The debug browser was
frame-capped, so the audit does not claim a current FPS regression.

The reference evidence is the `autumn-audit-*` screenshot set in the task's
temporary evidence directory. The hero frame is the before-reference. The
side, reverse, walk, settlement, shack, fungi, fern, and root frames are the
defect references.

## Research Decision

The scene will keep one optimized Blender-authored GLB. It will not ship a
second forest download and will not depend on `MSFT_lod`, because Three's GLTF
loader does not provide a dependable runtime contract for that vendor
extension.

The GLB already uses `EXT_mesh_gpu_instancing`. Quality tiers will therefore
control the submitted instance count of authored batches in place. This keeps
the source mesh, material, transforms, and high-tier composition canonical
while making low quality materially cheaper. Instance selection follows the
authored placement order, which deliberately puts the hero ring before
secondary saplings and the near belt before the middle belt.

Static scenery changes remain Blender-first. Runtime Threlte geometry is
limited to effects that cannot be baked: water, particles, wisps, and responsive
habitat glow. Animation tasks use Threlte's reactive `running` option so a
retained hidden scene stops working without being destroyed. Shader warm-up
continues to use the shared renderer owner.

## Scope and Ownership

### 1. Honest boot, failure, and retry

`AutumnScene` owns one boot state assembled from:

- the main optimized GLB;
- the ground-detail KTX2 texture; and
- both pond normal maps.

The loading curtain lifts only after the main GLB is ready and the two runtime
texture systems have settled. A decorative texture failure may degrade the
corresponding treatment, but it must settle explicitly. Main-GLB rejection or a
15-second timeout calls `reportFailed("environment", message)` and preserves the
existing retry affordance. It must never call `reportReady` for a failed main
asset.

Retry remounts the GLB loader with a new request identity. Dynamic Autumn chunk
imports in both retained and ordinary environment paths gain a catch branch
that reports the same feature failure instead of leaving the environment
transition pending forever.

### 2. Retention and adaptive quality

The entire runtime is no longer keyed by quality tier. Pond materials, texture
loads, listeners, and unrelated effects survive a tier change.

Every Autumn frame task and global pointer listener receives `active`:

- hidden retained Autumn performs no wind, particle, wisp, water, lantern, or
  interaction work;
- reactivation resumes the existing state without reloading assets; and
- reduced motion uploads one still particle frame, then stops mutating five GPU
  attributes every frame.

Only count-owned particle or wisp allocations may remount when their count
changes.

### 3. Meaningful geometry tiers

An Autumn geometry-tier owner classifies authored instanced batches by their
material contract and applies a deterministic visible-instance budget. The
high tier keeps every instance. Medium keeps the full hero ring and a reduced
secondary ecology. Low keeps the hero ring plus a sparse but intentional
silhouette, habitat, and shoreline set.

Acceptance budgets, measured from the loaded scene after tier application:

- high: current authored total, at most 2.2 million rendered source triangles;
- medium: at most 1.55 million, at least a 20% reduction from high; and
- low: at most 1.10 million, at least a 40% reduction from high.

Quality changes must not allocate a second GLB or rebuild the whole runtime.

### 4. The 360-degree world

The Blender source gains cheap far-silhouette mass in the exposed side and
reverse quadrants. Existing high-detail hero trees do not multiply. The shack
gets one authored warm window/practical that remains a partial discovery at the
end of the cabin lane. The backlot must read as a forest continuing through
haze, not a pale terrain sheet with isolated props.

The build pipeline remains:

1. `build-autumn-environment.py` authors and verifies the `.blend`;
2. `blender-export-autumn-full.py` exports the raw GLB;
3. `optimize-autumn-environment.mjs` produces the KTX2 + meshopt asset; and
4. `verify-autumn-environment-performance.mjs` proves the delivery contract.

No runtime mesh is added to fake missing static scenery.

### 5. Magic, ground, pond, sky, shadows, and stage

The magic hierarchy becomes visible at ordinary performance distance:

- the broken champignon arc and root/deadwood colonies grow to readable but
  still ecological sizes;
- cap materials carry restrained bioluminescence;
- responsive habitat glow is driven by both pointer focus and live performer
  positions; and
- wisps remain accents instead of the only interactive magic.

The ground shader is generated from the canonical cabin-lane layout. No route
control point or width may be duplicated by hand in GLSL. The grade moves from
lavender-grey toward damp copper duff while keeping the path readable through
fog.

The pond loses the hard cut-out read through a softer bank/surface transition,
more visible bed, and a subtler reflection column. It does not add a planar
reflection pass.

Stars become smaller, higher, and less uniformly bright. They cannot intersect
the tree line as giant discs. Moon direction and light direction remain joined.

The moon shadow pass keeps contact but drops the large ink-island look. The
mixed Hero-B/sapling instanced batch no longer casts one indiscriminate shadow
batch. Shadow strength and fill are retuned against the hero and walk shots.

The canonical `Stage3D` remains the one dynamic stage owner. Autumn supplies a
subdued wood-and-copper appearance rather than cloning the stage. Direction
cues stay legible, but no longer read as a neon rectangular game board.
`stageZOffset` must affect the mounted stage.

### 6. Performer ownership

`Viewer3DScene` already owns live performer positions. It passes the visible
positions through `Environment3D` to Autumn. The scene does not query global
viewer state or invent another performer tracker. Standalone callers may omit
positions and retain pointer-only interaction.

### 7. Scene Lab and review tooling

The dead procedural Autumn config is replaced by controls that correspond to
the shipped scene. `ScenePreview` passes that config to `AutumnScene`; persisted
legacy Autumn config is migrated to production defaults rather than silently
driving nonexistent tree rings, stream, or mist systems.

The review route fixes its stale fungi, fern, and owl-root presets, clears its
capture timer on teardown, and exposes the resolved quality/geometry evidence.
Review presets must hit the named subject at the center ray where a surface is
expected.

Responsive acceptance is about the real scene composition, not making the
review inspector pretty. The hero camera may use an aspect-aware preset in the
harness so portrait and fold checks preserve the stage and tree arch. Production
camera choreography remains owned by the shared viewer.

## Verification Contract

### Automated

- focused Autumn unit and component tests cover boot success, main-asset
  rejection, timeout, retry identity, dynamic-import failure, active task
  gating, tier changes without whole-runtime remount, reduced-motion particle
  uploads, canonical route shader generation, and geometry budgets;
- existing Autumn ecology, material, optimized-GLB, shadow-role, pond, and
  quality tests remain green;
- the Blender ecology verifier and optimized-asset verifier pass;
- scoped TypeScript/Svelte checks report no new errors in owned files; and
- the deterministic audit collector and audit evaluator are rerun after the
  implementation.

### Runtime

At high, medium, and low quality record:

- renderer calls, triangles, geometries, textures, and programs;
- loaded authored triangle totals after instance-count application;
- environment feature state through success, simulated rejection, timeout,
  and retry; and
- retained inactive task/listener behavior.

### Visual

Capture high-quality frames at:

- hero, walk, world, depth, settlement, shack, fungi, ferns, root contact,
  owl/root contact, pond-side, side orbit, and reverse orbit;
- 375x667, 960x412, 820x1180, 1440x900, 1920x1080, 2560x1440, and
  3840x2160; and
- low quality at hero, walk, side, and reverse to prove the tier remains an
  intentional scene rather than visible asset deletion.

No final frame may show a terrain edge, giant star in the canopy, snow-grey
forest floor, hard blue pond cut-out, black polygonal shadow island, unlit cabin
destination, or neon stage dominating the world. The hero tree arch, moon,
clearing scale, and performer readability must survive.

## Risks and Guardrails

- Reordering instance matrices would corrupt the authored composition. Tiering
  changes `InstancedMesh.count` only and is tested against known batch counts.
- Cached GLTF scenes can share material objects. Every patch stores its original
  value and restores it on cleanup; effects remain idempotent.
- More backlot density may improve one shot while closing the moon or cabin
  sightline. Blender QA renders include hero, reverse, depth, settlement, and
  shack before export.
- Strong mushroom emission can turn ecology into theme-park signage. Glow is
  judged in hero, walk, fungi, and low-quality views, not only in the close-up.
- The primary checkout and port 5173 remain untouched until the verified branch
  is integrated through the worktree finish command.
