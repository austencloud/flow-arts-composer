# Autumn tree shadows

## Outcome

The seven hero trees and four foreground saplings cast readable moon-aligned
shadows into the Autumn clearing from the same optimized GLB geometry that
draws each visible tree.
The production viewer and the Autumn review harness use the same shadow
capability, so the projected trunks, branches, roots, and crowns match the
objects in the frame.

## Ownership

- `scripts/build-autumn-environment.py` owns the seven visible hero-tree
  placements, four foreground saplings, and their source GLB geometry.
- `autumn-shadow-roles.ts` owns runtime shadow participation. Hero A meshes are
  recognized by their authored node names. The optimizer's unnamed Hero B
  instance batch is recognized by its authored material name.
- `worlds/autumn/autumn-lighting.ts` is the single light and shadow-frustum
  owner.
- `src/routes/test/autumn-scene/+page.svelte` enables the renderer shadow map so
  the verification route reflects production behavior.

## Design

All four Hero A instances cast directly from their loaded geometry. The three
Hero B trees and four saplings share one seven-instance optimized batch, which
also casts directly from its loaded geometry. Distant trees and the low-quality
tier remain excluded. No extra light, cascade, proxy mesh, shadow card, or
shadow map is introduced.

## Budgets and contracts

- All seven entries in `TREE_PLACEMENTS` and all four `SAPLING_PLACEMENTS`
  entries participate in the runtime shadow pass: four named Hero A nodes plus
  one Hero B instanced node with seven transforms.
- The optimized foreground-tree geometry adds roughly 395,000 rendered
  triangles to the shadow pass. This is the explicit cost of matching the
  visible GLBs.
- No `Autumn_ShadowProxy_` node or `Autumn Shadow` material may survive the
  asset build.
- The optimized Autumn GLB remains below the existing delivery thresholds.

## Risks

- The exact hero geometry costs substantially more than an approximation.
  Medium and high quality accept that cost; low quality disables shadows.
- The optimizer preserves Hero A names but collapses Hero B and the saplings
  into an unnamed `EXT_mesh_gpu_instancing` node. Optimized-GLB tests assert
  both paths.
- Future hero-material renames must update the runtime role contract or the
  Hero B batch will become receive-only.

## Verification

1. Compile the Blender authoring script and rebuild, export, and optimize the
   Autumn asset.
2. Run the Autumn asset performance verifier and focused runtime/GLB tests.
3. Inspect the live hero and walk views with high quality enabled, including
   the required 1920, 2560, 3840, 1440, tablet, 960x412, and 375-wide captures.
4. Audit the loaded scene to prove that the visible hero meshes have
   `castShadow` enabled and that no proxy nodes or materials remain.
5. Confirm a clean browser console and record the performance overlay.
