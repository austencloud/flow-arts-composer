---
status: active
value: null
effort: null
remaining: "Verify 3D Smoke Volume Rebuild against the current 3D Smoke Volume Rebuild runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Verify smoke volume at the eight-performer camera, orbit parallax, quality tiers, and fallback gates."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# 3D Smoke Volume Rebuild

**Status:** Active  
**Date:** 2026-08-15  
**Owner:** `SceneEffectsManager3D`

## 2026-08-27 corrective review

The first volume implementation failed visual review. At the production Classic
preset, one performer accumulated a density sum above 300 and rendered as a
performer-sized white dome. Four moving prop tips collapsed into one stationary
column, opaque scene geometry could make the whole volume appear or disappear,
and overlapping performer domains produced a flat wall of haze. This is the
"haunted humidifier" failure mode. It does not satisfy the outcome below.

The failure came from four concrete implementation errors:

- source density had a constant floor even when authored emission was zero and
  ignored the 2D renderer's ambient/motion rate contract;
- prop velocity was integrated as a small force, including timestep scaling,
  instead of being splatted into the velocity field as source momentum;
- two pressure iterations and a very large 4.7 x 6.1 x 4.7 metre performer
  domain erased coherent wakes into low-frequency blobs; and
- conventional depth testing happened on the volume cube's back face. An
  opaque fragment in front of that face could reject the entire ray even when
  smoke in front of the opaque surface should remain visible.

This correction keeps the scene-level density owner, but changes its observable
contract. Density must remain sparse and source-shaped. Motion must pull a wake
away from the current prop position within two simulation steps. A stationary
source may create a narrow buoyant filament; it may not fill the performer
domain. Scene depth clamps the ray itself, never the proxy cube fragment.

## Outcome

Smoke reveals the lingering, buoyant three-dimensional wake of the prop. The
wake remains suspended in world space, rolls into vortices, overlaps itself,
and separates in parallax as the camera moves.

This observable is distinct from Trails (the immediate prop path), Bubbles
(discrete rising shells), Ink (coherent pigment strokes), and atmospheric fog
(a scene-wide wash). If the effect can be described as a softer Trail or a
different Bubble texture, it has failed its slot.

## Evidence and ownership

Search terms: `smoke`, `density`, `volume`, `raymarch`, `Data3DTexture`,
`depthTexture`, `half-res`, `fluid`, `advection`, `vorticity`, `pressure`, and
`billboard`.

Closest owners:

- `SceneEffectsManager3D` owns scene-level effect lifecycle and frame updates.
- `ScenePostProcessing` owns the composed scene render and scene depth.
- `volumetric-fire-mesh.ts` owns the existing object-space raymarch pattern.
- `web-gl-smoke-renderer.ts` owns the 2D fluid solver and its simulation policy.
- `QualityTierDetector` owns device-tier selection.

This work extends `SceneEffectsManager3D`, composes the existing raymarch,
quality, and post-processing infrastructure, and creates a 3D density-volume
solver. The new solver is justified because the 2D solver owns a planar texture
field and cannot represent world-space parallax, volume bounds, or scene-depth
intersections.

This document supersedes the 3D Smoke section of
`2026-04-15-effects-phase-1i-smoke-design.md` and amends the 3D exclusion in
`2026-08-12-fluid-smoke-and-hot-core-design.md`.

## Rendering architecture

### Current WebGL2 viewer

High and Medium tiers use one scene-level renderer backed by a shared 3D
density atlas. Each performer receives one 24-cubed brick in that atlas. All
tracked prop tips for the performer inject density, heat, and velocity into the
same brick. A brick follows its performer in whole-voxel increments while
shifting its fields in the opposite direction, so existing smoke remains fixed
in world space. Its physical envelope is not a permanent performer-sized box:
solo and duet plumes expand into room space over their first seconds. Density
and temperature dilute by the gained volume as the envelope entrains air.
Groups of three or more retain the compact envelope to prevent transparent
overdraw from eight overlapping room-sized fields.

The CPU simulation runs at a fixed 30 Hz and uploads an unsigned-byte density
atlas. Three-to-four performer groups interleave alternating brick sets at
15 Hz. Larger crowds interleave four brick sets at 7.5 Hz while the material
continues to animate its sub-voxel detail every frame. It performs:

- semi-Lagrangian transport for velocity plus bounded MacCormack correction for
  density and temperature in the single-performer close review;
- the same ambient/motion emission-rate composition as the 2D renderer;
- direct, filtered prop-momentum splats plus buoyancy and drag;
- deterministic divergence-free curl forcing in world space;
- three-dimensional curl measurement and vorticity confinement;
- divergence, a tier-aware six-to-twelve-iteration Jacobi pressure solve, and
  velocity projection;
- exponential dissipation;
- plume-envelope growth with mass-aware entrainment dilution; and
- segment splats between the previous and current prop-tip positions.

The renderer draws every active brick in one instanced call. A back-face
raymarch accumulates optical depth front-to-back, applies palette absorption and
scattering, samples a short density shadow cone, and adds sub-voxel turbulent
warping. The proxy cube does not use conventional depth testing. Instead, the
raymarch consumes the existing compositor-owned scene depth snapshot and clamps
each ray to the nearest opaque surface. This preserves smoke in front of props,
performers, and scenery while preventing bleed-through and whole-volume
eclipsing. The material writes transparent, non-emissive smoke with no depth
writing. Close and small-group views retain the full ray and three-tap shadow
budgets. Crowds above four performers use a 28-step High or 24-step Medium ray
budget with a single shadow sample because each plume occupies fewer pixels at
the wider camera framing.

### Lower tier and unsupported contexts

Low tier and WebGL contexts without 3D textures use the existing pooled
renderer with an art-directed turbulent fBm flipbook, animated atlas frames,
anisotropic growth, and palette-aware fading. The lower tier remains a named
renderer with explicit selection, never a silent failure of the volume path.

### WebGPU gate

Three.js now demonstrates a GPU 3D fluid simulation using storage textures.
The production viewer still uses `WebGLRenderer`, so native WebGPU compute is a
separate renderer-migration decision. This rebuild keeps the solver interface
backend-neutral. A WebGPU implementation may replace the CPU/WebGL2 backend
only after the full viewer, export path, and custom shader suite pass parity.

## Preset art direction

The saved intent schema does not change. The 3D translator derives hidden
simulation and material values from each palette.

| Palette  | Injection | Motion                      | Material read                |
| -------- | --------- | --------------------------- | ---------------------------- |
| Incense  | narrow    | laminar, slow curl          | silver filament              |
| Fog      | broad     | lateral, low rise           | dense cool wall              |
| Genie    | impulsive | fast curl and expansion     | saturated colored scattering |
| Cursed   | medium    | oily folds                  | high extinction, dark core   |
| Spirit   | soft      | long, gentle suspension     | pale translucent veil        |
| Campfire | medium    | strong buoyancy and breakup | warm dense core, cool edge   |

## Lifecycle

- Simulation uses a fixed timestep and deterministic source hashing.
- Pausing freezes simulation with the choreography.
- Disabling Smoke clears its density immediately.
- Seeking, scene replacement, renderer replacement, and disposal clear source
  history so no velocity spike or stale volume survives.
- Offline export advances through the same fixed-step path as live playback.
- Atlas textures, geometry, materials, and field arrays have one owner and are
  released by `SceneEffectsManager3D`.

## Comparison harness

`/test/smoke-3d-compare` uses `InfiniteSequenceGenerator`, requests 16 counts,
and validates the result with `isEffectPreviewLoop`. It exposes honest loading,
retry, and failure states. The harness renders the production 2D fluid and 3D
volume from the same sequence, preset, tempo, and effect state. The reference
can be shown side by side or hidden for full-stage crowd review. It reviews
every Smoke material across black, Forest, and bright environments with one,
four, and eight performers, and reports active bricks, source count, ray steps,
density, wake distance, and CPU solve time while the sequence plays.

## Acceptance gates

1. Smoke is readable at the normal eight-performer camera without zooming.
2. Camera orbit reveals parallax and a persistent world-space wake.
3. No billboard circles, hard volume boundaries, slice banding, or scenery
   bleed-through are visible at normal framing.
4. All six presets are distinguishable within one second.
5. A generated 16-count LOOP crosses its seam without a hold, reset, or flash.
6. Smoke costs no more than 3 ms GPU time at 2560x1440 and 5 ms at 3840x2160
   on the High tier. The lower-tier renderer costs no more than 2 ms.
7. Visual review covers 1920x1080, 2560x1440, 3840x2160, 1440x900,
   820x1180, 960x412, and 375x667.
8. Unit coverage proves atlas addressing, world-space brick shifts, continuous
   source splats, pressure projection, deterministic stepping, tier selection,
   disabling, and disposal.
9. With authored ambient and motion emission both set to zero, density remains
   zero. With motion emission enabled, density centroid and velocity align with
   the prop path and leave a measurable wake behind the live tip.
10. The comparison harness always exposes the production 2D reference. A 3D
    review graded without that reference is incomplete.
11. A solo plume grows beyond the original 2.7-metre performer box, thins as it
    occupies room space, and loses density after emission stops. It may not
    settle into a stationary halo around the performer.

## Risks and bail conditions

- **CPU budget:** reduce pressure iterations or simulation frequency before
  reducing the visual grid below the point where the wake reads continuously.
- **Transparent overlap:** performer bricks should not overlap under ordinary
  formations. If they do, migrate the composite to the scene post-processing
  owner rather than accepting order artifacts.
- **Fast camera motion:** reject temporal history on camera cuts if temporal
  reconstruction is introduced.
- **Renderer migration:** do not introduce WebGPU as a Smoke-only side path.
- **Export parity:** any nondeterministic noise source blocks release.
