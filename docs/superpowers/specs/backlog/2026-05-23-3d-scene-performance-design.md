---
status: backlog
value: 3
effort: M
remaining: Recheck LOD, ObsidianPillars instancing, shadow limits, warmup, and material sharing in current 3D code.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# 3D Scene Performance Wins

> **DRIFT WARNING — 2026-08-02.** Shader warm-up + most material sharing shipped; LOD, ObsidianPillars instancing, shadow-caster limiting did not
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-23
**Status:** Backlog
**Scope:** All 3D environment scenes + WorldSceneContent

Five independent workstreams, each shippable solo. Combined savings: 200-500ms first-frame stutter eliminated, 30-50% GPU memory reduction on material-heavy scenes, 30-50% vertex throughput savings at distance.

---

## 1. Shader Warm-up (first-frame stutter)

### Problem

Only `AutumnScene.svelte:96-101` calls `renderer.current.compile()`. The other 9 scenes (Forest, Winter, Ember, Blossom, Rainbow, Celestial, Void, Cosmic, Ocean) skip it, so shaders compile lazily on first render frame -- causing 200-500ms jank.

### Canonical pattern (AutumnScene.svelte:96-101)

```svelte
<script lang="ts">
  const { scene, renderer, camera } = useThrelte();
  const sceneFeatures = getSceneFeatureContext();

  $effect(() => {
    if (!scene.current || !renderer.current || !camera.current) return;
    renderer.current.compile(scene.current, camera.current);
    sceneFeatures?.reportReady("environment");
  });
</script>
```

### Fix

Add this `$effect` block to every scene that currently calls `reportReady` without a preceding `compile`:

| File | Current state |
|------|---------------|
| `ForestScene.svelte` | `reportReady` only, no compile |
| `WinterScene.svelte` | `reportReady` only, no compile |
| `EmberScene.svelte` | `reportReady` only, no compile |
| `BlossomScene.svelte` | `reportReady` only, no compile |
| `RainbowScene.svelte` | `reportReady` only, no compile |
| `CelestialScene.svelte` | `reportReady` only, no compile |
| `VoidScene.svelte` | `reportReady` only, no compile |
| `CosmicScene.svelte` | `reportReady` only, no compile |
| `OceanScene.svelte` | `reportReady` only, no compile |

Each scene already imports `useThrelte` and calls `reportReady`. The change is: insert `renderer.current.compile(scene.current, camera.current)` on the line immediately before `reportReady`.

For scenes that gate `reportReady` behind an async condition (Ocean, Winter, Cosmic, Ember, Forest wait for GLTF loads or similar), the compile call should run after the async gate resolves but before `reportReady` fires.

---

## 2. Material Sharing

### 2a. LunarCrystals.svelte -- per-shard MeshPhysicalMaterial

**File:** `src/lib/shared/3d/environments/scenes/cosmic/LunarCrystals.svelte:89-101`

**Before:** Each shard in each cluster creates its own `MeshPhysicalMaterial`. With 8 clusters x 2-4 shards = 16-32 materials, all with identical parameters (same color, transmission, roughness, IOR). Only `emissiveIntensity` varies at runtime.

```typescript
// BEFORE (line 89, inside per-shard loop)
const material = new MeshPhysicalMaterial({
  color: crystalColor,
  emissive: glowCol,
  emissiveIntensity: 0,
  transmission: 0.85,
  thickness: 0.4,
  roughness: 0.05,
  metalness: 0.0,
  ior: 1.45,
  transparent: true,
  opacity: config.opacity,
  envMapIntensity: 1.5,
});
```

**After:** One shared material created outside the loop. The pulse animation (lines 130-143) already iterates every shard per frame to set `emissiveIntensity` -- that still works since MeshPhysicalMaterial uniforms are per-material, not per-instance. But all shards in a cluster share the same pulse phase, so they can share the material within a cluster. Across clusters, each cluster needs its own emissiveIntensity, so share one material per cluster (not one global).

Actually, re-reading the animation code: each cluster gets its own pulse phase, but all shards within a cluster share the same intensity. So the minimum is one material per cluster.

But we can do better: use a single material globally and animate via `onBeforeRender` per-cluster or accept the single-frame-behind approximation. The simplest correct fix:

```typescript
// AFTER: one material per cluster (not per shard)
for (let i = 0; i < config.clusterCount; i++) {
  // ... angle/position math unchanged ...

  const material = new MeshPhysicalMaterial({
    color: crystalColor,
    emissive: glowCol,
    emissiveIntensity: 0,
    transmission: 0.85,
    thickness: 0.4,
    roughness: 0.05,
    metalness: 0.0,
    ior: 1.45,
    transparent: true,
    opacity: config.opacity,
    envMapIntensity: 1.5,
  });

  for (let j = 0; j < shardCount; j++) {
    const geometry = new ConeGeometry(/* ... */);
    const mesh = new Mesh(geometry, material); // shared across shards
    // ...
  }

  shards.push({ geometry, material: material, mesh, /* ... */ });
}
```

The `disposeClusters` function already disposes materials -- just ensure it only disposes once per cluster, not once per shard (avoid double-dispose).

**Savings:** 16-32 materials down to 8. MeshPhysicalMaterial is expensive (generates complex shader variants with transmission/IOR), so halving the count matters.

### 2b. ObsidianPillars.svelte -- per-pillar geometry + ShaderMaterial

**File:** `src/lib/shared/3d/environments/scenes/ember/ObsidianPillars.svelte:129-177`

**Before:** `createPillar()` is called per pillar. Each call creates:
- 1 ShaderMaterial (with per-pillar `uSeed`)
- 2-4 geometries (shaft, tip, optional secondary shard + shard tip)
- 2-4 meshes

With 2 rings of ~6 pillars each = ~12 pillars = ~12 ShaderMaterials + ~36 geometries.

The `uSeed` uniform varies per pillar (for vein pattern offset), but pillar geometry (CylinderGeometry, ConeGeometry) uses the same segment counts everywhere. Heights vary, so geometry can't be trivially shared. But all pillars with the same height could share geometry.

**Two-phase fix:**

Phase A (quick win): Share geometries across pillars of the same dimensions. Since heights are derived deterministically from seed, group pillars by height bucket. In practice, the height varies continuously, so this may not help much. Skip if grouping is impractical.

Phase B (real win): Convert to InstancedMesh. All pillars use the same ShaderMaterial program (same vertex + fragment source). The only per-instance varying uniform is `uSeed` and `uTime`. Convert to:
- 1 InstancedMesh for shafts (all pillars)
- 1 InstancedMesh for tips
- 1 InstancedMesh for secondary shards (optional)

Pass `uSeed` per instance via an InstancedBufferAttribute. The material's fragment shader reads from `attribute float aSeed` instead of `uniform float uSeed`.

```glsl
// Vertex shader addition
attribute float aSeed;
varying float vSeed;
void main() {
  vSeed = aSeed;
  // ... rest unchanged
}

// Fragment shader change
// Replace: uniform float uSeed;
// With:    varying float vSeed;
// Replace all uSeed references with vSeed
```

This reduces 12 draw calls to 2-3 draw calls.

### 2c. RainbowScene.svelte -- duplicate orb materials

**File:** `src/lib/shared/3d/environments/scenes/RainbowScene.svelte:375-406`

**Before:** `createPrismaticOrb()` is called 7 times (one per `ORB_CONFIGS` entry). Each call creates:
- 1 SphereGeometry (core, 24 segments) + 1 MeshPhysicalMaterial
- 1 SphereGeometry (glow, 16 segments) + 1 MeshStandardMaterial

Total: 14 geometries + 14 materials for 7 orbs.

Colors differ per orb, so materials can't be trivially shared. But geometries can:

```typescript
// AFTER: share geometry, unique materials only where color differs
const coreGeo = new SphereGeometry(1, 24, 24); // unit sphere, scale via mesh.scale
const glowGeo = new SphereGeometry(1, 16, 16);

function createPrismaticOrb(color: string, scale: number): Group {
  const group = new Group();

  const coreMat = new MeshPhysicalMaterial({ /* ... color-specific ... */ });
  const core = new Mesh(coreGeo, coreMat);
  core.scale.setScalar(scale);
  group.add(core);

  const glowMat = new MeshStandardMaterial({ /* ... color-specific ... */ });
  const glow = new Mesh(glowGeo, glowMat);
  glow.scale.setScalar(scale * 2.2);
  group.add(glow);

  return group;
}
```

**Savings:** 14 geometries down to 2. Materials stay at 14 (color-unique) but geometry sharing eliminates 12 GPU buffer allocations.

### 2d. instanced-vegetation.ts -- material recreation per category per call

**File:** `src/lib/shared/3d/procedural-engine/rendering/instanced-vegetation.ts:259-346`

**Before:** `getProceduralGeometryForCategory()` creates a new `MeshStandardMaterial` / `MeshLambertMaterial` every time it's called. Each category (tree, pine, palm, rock, bush, grass, flower, mushroom, log, cactus) gets a fresh material per call. If called during chunk streaming, this means repeated allocations.

**After:** Cache materials at the class level. Create them once in the constructor or on first access:

```typescript
private materialCache = new Map<VegetationCategory, Material>();

private getMaterialForCategory(category: VegetationCategory): Material {
  const cached = this.materialCache.get(category);
  if (cached) return cached;

  const mat = this.createMaterialForCategory(category);
  this.materialCache.set(category, mat);
  return mat;
}
```

Dispose all cached materials in `dispose()`.

---

## 3. LOD System

### Problem

Zero `THREE.LOD` usage in the codebase (confirmed by grep). Every environment object renders at full vertex detail regardless of camera distance. LOD candidates:

| Object | File | Vertex count | Distance where full detail is wasted |
|--------|------|-------------|--------------------------------------|
| Crystal formations | `LunarCrystals.svelte` | 6-segment cones | >15m |
| Reef structures | `ReefStructures.svelte` | GLTF models (high-poly coral) | >20m |
| Fish school | `FishSchool.svelte` | instanced geometry | >25m |
| Obsidian pillars | `ObsidianPillars.svelte` | 5-segment cylinders/cones | >15m |
| Autumn forest | `AutumnForest.svelte` | instanced trees | >20m |

### Approach

For procedural geometry (crystals, pillars), create 2 LOD levels:
- **LOD 0 (near, 0-15m):** current geometry
- **LOD 1 (far, 15m+):** half the radial segments (e.g. ConeGeometry segments 6 -> 3, CylinderGeometry segments 5 -> 3)

For GLTF-loaded models (reef structures), use `meshopt_simplifier` or pre-bake simplified GLBs at export time. Two LOD levels:
- **LOD 0 (near, 0-20m):** current model
- **LOD 1 (far, 20m+):** 50% decimated model

For instanced geometry (forest, fish), LOD is harder since InstancedMesh is a single draw call. Options:
- Split instances into near/far InstancedMeshes with different geometry
- Use shader-based vertex simplification (reduce displacement amplitude at distance)

Recommendation: start with the procedural geometry LODs (crystals, pillars) since those are the simplest to implement and have the most per-object overhead. Forest and fish already use instancing efficiently.

### Implementation pattern

```svelte
<script lang="ts">
  import { LOD } from "three";

  function createCrystalLOD(height: number, radius: number): LOD {
    const lod = new LOD();

    // LOD 0: full detail
    const hiGeo = new ConeGeometry(radius, height, 6, 1);
    const hiMesh = new Mesh(hiGeo, sharedMaterial);
    lod.addLevel(hiMesh, 0);

    // LOD 1: reduced
    const loGeo = new ConeGeometry(radius, height, 3, 1);
    const loMesh = new Mesh(loGeo, sharedMaterial);
    lod.addLevel(loMesh, 15);

    return lod;
  }
</script>
```

**Savings:** 30-50% vertex throughput for distant objects. Most visible on mobile GPUs where vertex processing is the bottleneck.

---

## 4. Frustum Culling

### Problem

34 sites set `frustumCulled = false`. Some are correct (sky domes, particle systems that span the viewport, effect renderers that follow props). Others are spatially-bounded meshes that should be culled.

### Audit

**Correct (keep frustumCulled=false):**
- `SkyGradient.svelte` -- full-viewport dome, always visible
- `FallingParticles.svelte` -- particles span entire scene volume
- `NebulaLayer.svelte` -- full-viewport backdrop
- `CloudDome.svelte` -- sky dome
- `VolcanicHaze.svelte` -- atmospheric full-scene
- `TrailRenderer3D.ts` -- follows prop tips, bounds unknown at creation
- `LedRenderer3D.ts` -- follows prop tips
- `PovStripRenderer3D.ts` -- follows prop tips
- `VolumetricFireMesh.ts` -- effect attached to prop
- `CharcoalRenderer3D.ts` -- effect attached to prop
- `MuseumTorch3D.svelte` -- point light glow billboard

**Should enable culling (set frustumCulled=true + compute boundingSphere):**

| File | Object | Why it should cull |
|------|--------|-------------------|
| `AutumnForest.svelte:234,237` | Tree InstancedMesh | Trees are in a ring 5-15m from center; camera can face away |
| `instanced-vegetation.ts:236,448` | All vegetation batches | Bounded to chunk extents |
| `ocean-instancing.ts:56,126,202` | Coral fans, kelp, anemones | Bounded placement rings |
| `cosmic-instancing.ts:181,254` | Cosmic environment instances | Ring-placed decorations |
| `OceanScene.svelte:835,864` | Ocean decorations | Bounded placement |
| `GodRayShafts.svelte:107` | Light shafts | Vertical columns, bounded laterally |
| `FishSchool.svelte:175,579,720` | Fish meshes | Fish swim in bounded volume |
| `UnderwaterParticles.svelte:134` | Particle points | Could use large bounding sphere |
| `EmberFountains.svelte:213` | Ember particles | Bounded eruption area |
| `EnergyParticles.svelte:155` | Cosmic particles | Bounded area |
| `MeteorStreaks.svelte:159` | Meteor lines | Could cull when behind camera |

### Fix pattern

For InstancedMesh, Three.js requires a manually-set bounding sphere because it can't auto-compute from instance matrices:

```typescript
// After setting all instance matrices:
mesh.frustumCulled = true;
mesh.geometry.boundingSphere = new Sphere(
  new Vector3(0, 0, 0), // center of the placement ring
  maxPlacementRadius + objectRadius // conservative radius
);
```

For instanced-vegetation.ts, compute the bounding sphere from the chunk's world-space bounds when instances are placed.

**Savings:** Prevents GPU from processing geometry that's entirely behind the camera. Biggest impact in scenes with ring-placed decorations (ocean, cosmic, autumn) where ~50% of objects are typically behind the camera at any time.

---

## 5. Shadow Map Right-Sizing

### Problem

**File:** `WorldSceneContent.svelte:607-608`

```typescript
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
```

2048x2048 shadow map = 16MB GPU memory (RGBA depth). The shadow camera frustum is 200m wide (`shadowSize = 100`, lines 612-616), giving ~10cm/texel resolution -- far more than needed for a distant sun on procedural terrain.

Additionally, `castShadow` is set on terrain meshes and GLTF models (lines 651-656) indiscriminately. Terrain casting shadows onto itself is expensive and rarely visible.

### Fix

```typescript
// Reduce shadow map to 1024x1024 (4MB GPU, ~20cm/texel -- still fine for outdoor scene)
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;

// Tighten shadow frustum to area around player (not 200m)
const shadowSize = 50; // 50m radius is plenty for visible shadow detail
```

For `castShadow` on terrain/models, limit to avatar and props:

```typescript
// Don't enable castShadow on terrain chunks or vegetation
// Only the avatar and held props need to cast shadows
model.castShadow = false; // terrain chunks
model.receiveShadow = true; // terrain receives shadows from avatar
```

The environment scenes (Autumn, Ocean, etc.) don't use WorldSceneContent's shadow system -- they use their own lighting. This fix is specific to the procedural world engine.

**Savings:** 12MB GPU memory (16MB -> 4MB), reduced shadow pass vertex count by eliminating terrain from the shadow caster list.

---

## Implementation Order

1. **Shader warm-up** -- lowest risk, highest certainty of impact, 30 minutes of work
2. **Material sharing (2a, 2c, 2d)** -- straightforward refactors, no behavioral change
3. **Frustum culling** -- requires per-site bounding sphere calculation, moderate effort
4. **Shadow map right-sizing** -- single-file change, test visually for shadow quality regression
5. **Material sharing (2b ObsidianPillars InstancedMesh)** -- shader refactor, higher effort
6. **LOD system** -- largest effort, most benefit on mobile, can be phased per-scene

---

## Files Modified

| File | Changes |
|------|---------|
| `ForestScene.svelte` | Add `renderer.compile` before `reportReady` |
| `WinterScene.svelte` | Add `renderer.compile` before `reportReady` |
| `EmberScene.svelte` | Add `renderer.compile` before `reportReady` |
| `BlossomScene.svelte` | Add `renderer.compile` before `reportReady` |
| `RainbowScene.svelte` | Add `renderer.compile` before `reportReady`; share orb geometry |
| `CelestialScene.svelte` | Add `renderer.compile` before `reportReady` |
| `VoidScene.svelte` | Add `renderer.compile` before `reportReady` |
| `CosmicScene.svelte` | Add `renderer.compile` before `reportReady` |
| `OceanScene.svelte` | Add `renderer.compile` before `reportReady` |
| `LunarCrystals.svelte` | Share material per cluster instead of per shard |
| `ObsidianPillars.svelte` | Convert to InstancedMesh with per-instance seed attribute |
| `instanced-vegetation.ts` | Cache materials at class level; enable frustum culling |
| `AutumnForest.svelte` | Enable frustum culling with bounding sphere |
| `ocean-instancing.ts` | Enable frustum culling with bounding sphere |
| `cosmic-instancing.ts` | Enable frustum culling with bounding sphere |
| `FishSchool.svelte` | Enable frustum culling with bounding sphere |
| `WorldSceneContent.svelte` | Reduce shadow map to 1024; limit castShadow to avatar/props |

## Risks

| Risk | Mitigation |
|------|------------|
| `renderer.compile` adds startup latency (shader compilation is front-loaded) | Net improvement: one predictable 50-100ms block replaces unpredictable 200-500ms stutter during interaction |
| Frustum culling with wrong bounding sphere causes objects to pop in/out | Use conservative (oversized) bounding spheres; test with camera orbiting each scene |
| Shadow map reduction causes visible quality loss | 1024 at 50m radius = 5cm/texel, fine for outdoor scenes; compare screenshots before/after |
| ObsidianPillars InstancedMesh conversion changes visual appearance | The shader is identical; only the delivery mechanism changes. Side-by-side screenshot comparison required |
| LOD transitions visible as geometry popping | Use `LOD.autoUpdate = true` (default) for smooth distance checks; consider vertex morph if popping is visible |
