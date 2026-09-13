---
status: backlog
value: 3
effort: M
remaining: "Genuinely unimplemented — verified 2026-09-13, not merely un-updated. src/lib/shared/3d/environments/components/Environment3D.svelte:100 still switches on the external BackgroundType enum (AUTUMN/FOREST/COSMIC/WINTER/OCEAN/EMBER/BLOSSOM/...), and no manifest or registry module exists anywhere under src/lib/shared/3d/environments/. Start at step 1 of the Design section: the self-describing scene manifest co-located with each GLB."
depends_on: ""
plan_path: ""
tags: [3d, environments, registry, pipeline]
last_triaged: 2026-09-13
---

<!--
Reconciliation note, 2026-09-13. The read-only drift detector classified this
spec DIVERGENT (15 topical commits of 175 touching its paths, 3 on named files).
Adjudicated as a FALSE POSITIVE: the traffic is shared-3D-infrastructure work
that happens to live on the same paths -- `perf(3d): stream environments and
retain shared resources`, `refactor(3d): shared environment infra, scene audio,
and performer stage bounds`, `feat(3d): preserve performers across environment
transitions` -- none of which touches the hardcoded switch this design exists to
remove. The switch was read directly and is still there. This is the detector's
documented "broad paths" failure mode; the spec is not a rebuild hazard.
-->

# Data-Driven GLB Environment Registry — Design

**Date:** 2026-05-29
**Status:** Draft
**Source:** 2026 pipeline audit (2026-05-29). Flagged "highest-leverage unlock" by the runtime, sourcing, and AI-gen prongs, and by the existing `.claude/rules/blender-first-3d-scenes.md` Gaps section.

## Problem

3D scene selection is a hardcoded `switch(bg)` in
`src/lib/shared/3d/environments/components/Environment3D.svelte:56` over the
`BackgroundType` enum from the **external** `@austencloud/backgrounds` package
(AUTUMN/FOREST/COSMIC/WINTER/OCEAN/EMBER/BLOSSOM/RAINBOW/CELESTIAL). Adding a new
GLB scene means editing the switch **and** publishing a new enum value in a
separate repo. That two-place, cross-repo edit is the bottleneck for the stated
goal: "drop in any open-source / Blender-authored scene via config."

The ecosystem ships no off-the-shelf solution: drei `<Environment>` and the
threlte equivalent handle HDRI cubemap **lighting**, not swappable whole-scene
**geometry**. So a typed in-repo registry is the correct (and only) idiom.

## Goal

Adding a GLB environment = adding one self-describing manifest entry + dropping
the GLB under `static/models/<scene>/`. No switch edit, no external enum edit,
no loader code.

## Design

### 1. Self-describing scene manifest (co-located with the GLB)

`static/models/<scene>/scene.json`:

```jsonc
{
  "id": "ocean",
  "glbUrl": "/models/ocean/ocean_flora_scene.glb",
  "license": "CC0",            // build-asserted ∈ {CC0, CC-BY+attribution}
  "attribution": "...",
  "source": "https://...",
  "thumbnailUrl": "/models/ocean/thumb.webp",
  "bounds": { "min": [...], "max": [...] },
  "compression": { "geometry": "meshopt", "texture": "ktx2" },
  "requiresAsyncLoad": true,
  "featureKey": "environment",  // ties into scene-feature-registry progress/curtain
  "fog": { "color": "#0d0d10", "density": 0.012 },
  "hdri": "/hdri/<name>.hdr"     // optional IBL (see splatting/sourcing specs)
}
```

Schema modeled on `toxsam/open-source-3D-assets` (the closest 2026 reference;
no ratified Khronos asset-license manifest exists yet — KhronosGroup/glTF #839
still open).

### 2. Typed registry

`src/lib/shared/3d/environments/registry/environment-registry.ts`:

```ts
export interface EnvironmentDef {
  id: SceneId;
  glbUrl: string;
  requiresAsyncLoad: boolean;
  featureKey?: string;
  fog?: { color: string; density: number };
  hdri?: string;
  // ...mirrors scene.json
}
export const ENVIRONMENTS: Record<SceneId, EnvironmentDef> = { /* ocean, ... */ };
```

Precedent to generalize: `src/lib/features/museum/services/museum-model-loader.ts`
already maps role → { path, scale, cache } as a `Record`. Same shape, scene-scoped.

### 3. Single loader component

`GlbEnvironment.svelte` reads an `EnvironmentDef`, loads via `useGltf` with the
canonical decoder hooks (`useDraco`/`useMeshopt`/`useKtx2`), wires fog + optional
HDRI/IBL, and reports through the scene-feature context
(`scene-feature-registry.ts`, `requiresAsyncLoad: true`). Replaces the per-scene
`*Scene.svelte` boilerplate for GLB-backed scenes.

### 4. Migration seam

Keep `Environment3D.svelte`'s switch for the legacy procedural scenes
(Autumn/Forest/Cosmic/etc., which are not GLB-backed). Route OCEAN — and every
future GLB scene — through a registry lookup branch first; fall through to the
switch only for procedural legacy types. Procedural scenes migrate to GLB
opportunistically (per the Blender-first rule), shrinking the switch over time.

## Files

- Create: `environment-registry.ts`, `GlbEnvironment.svelte`, `static/models/ocean/scene.json`
- Edit: `Environment3D.svelte` (registry-lookup branch before switch)
- Edit: `OceanScene.svelte` → either becomes the first `GlbEnvironment` consumer or is replaced by it
- Build: license assert (`license ∈ {CC0, CC-BY+attribution}`) over all `scene.json`

## Verification

- Adding a throwaway 2nd registry entry loads with zero switch/enum edits.
- OCEAN renders identically via the registry path (screenshot parity — **browser-gated, user on :5173**).
- `npm run check` green.
- Build fails if a `scene.json` has a non-clean license.

## Risks

- `SceneId` vs external `BackgroundType` enum: introduce an internal `SceneId`
  union; map legacy `BackgroundType` → `SceneId` at the seam so the external
  enum is no longer the source of truth for GLB scenes.
- Scene-feature progress contract: reuse `featureKey` exactly as OceanScene does
  today (`environment`, weighted seabed+flora fold) so the loading curtain keeps working.

## Out of scope

- Migrating procedural legacy scenes to GLB (separate, per-scene).
- A user-facing scene-picker UI (this is the data layer it would consume).
