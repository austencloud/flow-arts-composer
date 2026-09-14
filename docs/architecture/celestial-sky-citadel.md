# Celestial Sky Citadel

Celestial is a heavenly castle and surrounding archipelago. A winged gateway,
cloistered performance courtyard, bridges, monastery, beacon and distant ruins
give the camera places to discover. The armillary and solar rose keep astronomy
within the architecture. The earlier Blender studies remain available.

## Source and runtime

- Editable source: `blender/celestial/sky-citadel.blend` (packed textures).
- Generate trees first: `node scripts/build-celestial-eztree.mjs` using the installed
  `@dgreenheck/ez-tree@1.1.0`. Then run `scripts/build-celestial-citadel.py` with
  Blender 5.0 in background mode. For a tree-only refresh of the saved castle,
  run `scripts/upgrade-celestial-eztree.py` instead; set `TKA_CITADEL_EVIDENCE`
  to the render output directory.
- Export: `scripts/blender-export-celestial-citadel.py`, then
  `node scripts/optimize-celestial-citadel.mjs`.
- Shared measurements: `scripts/celestial-citadel-layout.json`.
- Runtime asset: `static/models/celestial/sky-citadel.glb`, 14,756,084 bytes;
  material/role batching, 24 EZ-Tree trees in three distinct seeded variants,
  instanced wood/foliage pairs, WebP textures and Meshopt compression.
- Architecture, terrain and mineral textures are original Blender work. The
  tree family uses EZ-Tree's ash preset, increased branch resolution, original
  1024-pixel leaf and bark maps, and Blender-authored root flares. The bundled
  MIT notice is `static/models/celestial/EZ-TREE-LICENSE.txt`. Bark maps originate
  from Poly Haven's `bark_brown_02`, as recorded in EZ-Tree's assets README.
  The final asset contains no Meshy trees. Each tree is positioned from its
  trunk origin and raycast onto the meadow, or seated in the courtyard planter.
  The tree beside the west terrace moved from (-43,30) to (-47,24) in Blender XY.
  The remaining east podium collision is corrected from (23,22) to (39,10).
- Final bounded polish: `scripts/polish-celestial-citadel.py` opens the saved
  Blender source, replaces its route/grass pass, saves and exports it. Run this
  after a full castle rebuild or a tree refresh, then run the optimizer above.
  Six stone crossings connect all seven islands. Four use slopes no steeper
  than 10%; the two larger elevation changes use shallow stair treads.
  Landings meet raycast meadow heights; garden stairs join the elevated podium.
  Forest's existing `forest_ground_ecosystem.py` supplies three blade forms,
  instanced into 4,880 grass tufts with sage materials. Paving, routes and root
  flares have exclusion zones. No additional downloaded vegetation is needed.
  This is a static modeling pass: connected walking surfaces are authored, but
  player controls, navigation and terrain collision simulation are future work.
  Measurements and route connectivity live in `polish-manifest.json`.
- Clouds use a seeded 64³ density texture generated in memory and ray marching.
  The cloud sea and six distant cumulus volumes stay in world space. No cloud
  photograph is requested by the production world. Low tier uses fewer samples.
- Both production renderers use the same world factory, floor measurements,
  reflective pool and cloud implementation. Reduced motion freezes cloud drift.

## Verification

Reviewed Blender output and the live app at all seven required viewport sizes,
plus 800×450 reflow and reduced motion. Checked the wide island view and casts
of one and eight in the production viewer. Focused world, adapter, grounding
and asset-prefetch tests pass (18 tests). Svelte check: zero errors and warnings.
These viewport and performance figures describe the initial castle delivery.
For the EZ-Tree revision, the geometry verification checks 24 trees, three
variants, packed textures, 4 cm root burial and 13.24 m minimum distance from
the performance centre (10.2 m protected radius). Near, terrace and hero views
are checked using the production world factory. The shared foliage mipmap
preparer retains distant crowns and now also supports OffscreenCanvas workers.
The 18 Celestial contract tests and six mipmap tests pass. glTF validation:
zero errors; three generated tangent-space warnings for bark materials and
notices for extensions outside the validator's support.

The September 8 polish was checked in the production world factory at the
reported camera (26.84,0.67,-10.54), a garden contact view (45,1.6,-3), and a
wide bridge-network view (180,155,210), at 1440×900 with standard content and
motion frozen. These views confirm the concrete is clear, grass/root contacts
are visible, and the crossings reach all seven land masses. The authoring pass
asserts route reachability, landing heights, deck grades and trunk clearance
from masonry. The existing Blender tree verifier and ten focused world,
adapter and worker-layout tests pass. The asset now has 26 unique meshes and
2,516,436 triangles before instance reuse; this pass adds detail rather than
claiming a frame-rate improvement.

Local performance with several review tabs open reached 60 fps for one performer
and about 15 fps for eight. The eight-performer path remains costly; this is not
a claim of mobile or eight-performer 60 fps. The worker review camera also keeps
its existing closer cast framing. Cloud rendering assumes the normal camera
space above the cloud sea; this is not a flight-through-clouds simulator.
