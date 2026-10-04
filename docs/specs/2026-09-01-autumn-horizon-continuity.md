# Autumn horizon continuity and proof contract

## Outcome

The Autumn environment must read as one continuous world from performance
height, walking height, overhead review, reverse angles, and the production
viewer with performers and effects. A distant tree may fade into atmosphere;
it may never read as a cutout floating in empty colour. No supported camera may
expose a straight ground edge or a visibly finite floor.

This is a visual contract. Geometric extent, asset size, frame rate, and passing
tests are necessary evidence, but none can substitute for the rendered image.

## Existing owners

- `scripts/build-autumn-environment.py` owns authored terrain geometry, UVs,
  material assignment, and exported ground metadata.
- `autumn-ground-detail.ts`, applied by `createAutumnMaterialRuntime`, owns
  repeated surface modulation across Autumn ground materials.
- `AutumnScene.svelte` and `autumn-scene-config.ts` own the sky/fog join.
- `SceneShaderWarmup.svelte` owns renderer compilation and the smooth-frame
  gate used before a scene can be called visually ready.
- `/test/autumn-scene` owns deterministic camera and production-graph replay.
- The route reset layout owns isolation from product boot, account, and cloud
  loading surfaces during deterministic review.

The implementation extends these owners. It does not add another ground
renderer, duplicate readiness mechanism, or scene-specific screenshot delay.

## Required behavior

1. The detailed ecology remains unchanged through the authored 165-metre atlas.
2. The transition terrain reaches 256 metres without a crack or material seam.
3. Beyond 256 metres, a low-cost rolling apron breaks the horizon silhouette,
   descends outside the supported sightlines, and reaches at least 1,024 metres.
4. The apron uses the same world-space repeated material patch as the living
   floor, but retains its cheaper material without normal or roughness textures.
5. The lowest sky colour matches the fog colour, with a broad transition into
   the existing mid and upper dusk colours. Stars and moon remain intact.
6. The raw review graph reports `data-autumn-ready="true"` only after every
   enabled Autumn asset is ready, shaders have compiled, the frame gate passes,
   and the camera reading exists.
7. The production graph reports the same attribute only after
   `Viewer3DCanvas` reports its complete scene ready. It includes three
   performers using trail, fire, and LED effects with glide, punch, and elastic
   efforts.
8. The review route removes the product boot surface at its layout boundary.
   A valid capture must still prove that no loader or transition veil is
   present and that the document did not change between readiness and capture.
9. `cam`, `look`, and `fov` URL coordinates replay through the canonical camera
   URL parser. Reloading a copied view must preserve its position and target.

## Visual rejection conditions

Reject the candidate immediately if any proof image shows:

- a horizontal or diagonal terrain edge against the sky;
- a large flat field with no depth or surface language;
- distant trunks ending in sky-coloured space;
- tree, cabin, pond, stage, or performer contact that appears airborne;
- a capture taken while trees, ground detail, performers, or effects are still
  arriving;
- an error, warning, loader, failed texture, or fallback surface;
- a quality-tier or viewport change that alters composition rather than detail.

## Required proof matrix

Every capture waits for `data-autumn-ready="true"` and proves that no loader or
transition veil is present. An arbitrary timeout or the disappearance of a
loader alone is not readiness. The capture transaction records the document's
time origin before and after the image; a changed document invalidates it.

Named camera sweep at desktop size:

- hero;
- walk;
- world;
- overlook (the reported failure pose);
- reverse;
- depth;
- settlement;
- pond;
- root contact;
- production graph at hero and overlook.

Responsive sweep:

- 1920 x 1080;
- 2560 x 1440;
- 3840 x 2160;
- 1440 x 900;
- 820 x 1180;
- 960 x 412;
- 375 x 667.

The responsive sweep must include hero, the reported overlook pose, and the
production graph across enough samples to cover desktop, tablet, and narrow
landscape/portrait cropping. Evidence is WebP at quality 70 and records the URL,
viewport, DPR, readiness attribute, and console state.

## Performance and delivery gates

- The optimized GLB remains at or below 20 MiB.
- Rendered source geometry remains below 2.2 million triangles.
- The rolling horizon contributes fewer than 7,500 triangles.
- Meshopt, GPU instancing, mesh quantization, and KTX2 stay present.
- The apron remains outside cast and receive shadow passes.
- The apron material retains no normal or metallic-roughness texture.
- Focused Autumn tests, the GLB verifier, Python compilation, and project check
  pass before visual acceptance.
- Performance is measured only after visual acceptance, on both the raw scene
  and production graph, without DevTools work running inside the sample window.

## Claim discipline

“Fixed” requires the complete proof matrix to pass after the final change. A
single hero screenshot, an asset metric, or a smooth frame counter supports the
claim but cannot establish it. Any failure reopens the candidate and invalidates
earlier visual evidence captured from a different build.
