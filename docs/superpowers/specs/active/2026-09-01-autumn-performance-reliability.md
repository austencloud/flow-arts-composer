---
status: active
value: null
effort: null
work_state: verification
remaining: 'Complete the Autumn release gate: production-scene performance/reliability run and P0/P1 issue review.'
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Autumn Performance Reliability

**Status:** Implemented; release qualification pending
**Date:** 2026-09-01
**Owner:** Shared 3D environment runtime with Autumn-owned policy

## Outcome

Autumn must keep the approved high-fidelity composition on every supported
device while maintaining enough render headroom that ordinary playback,
camera motion, effects, scene retention, and brief operating-system contention
do not expose stutter.

"No quality loss" means the same authored placements, silhouettes, lighting
intent, interactions, and readable surface detail. A different implementation
is acceptable only when deterministic visual comparison cannot distinguish it
at the approved camera and viewport matrix. Removing ecology, particles,
shadows, or scene features is not an optimization path.

## Current Evidence

- The baseline optimized GLB is 18,165,324 bytes and contains 1,973,443 authored
  triangles, 56 meshes, 65 nodes, and 48 KTX2 textures.
- Instancing reduces uploaded geometry to 536,597 vertices, but the high scene
  still processes 5,920,329 vertices in its main pass.
- The high review harness reports 3.955M triangles and 252 draws at DPR 1.
- Autumn's small pond uses physical transmission. The installed Three.js
  renderer responds by rendering every opaque object into a transmission
  target before the normal scene render.
- The production viewer preserves the default drawing buffer continuously so
  unrelated poster and review capture paths can read it later.
- The focused Autumn harness did not include the production bloom composer, so
  its baseline counters understated the cost of the real viewer graph.
- Every GLB material exports double-sided.
- The current tier implementation lowers `InstancedMesh.count`, removing
  authored placements rather than rendering the same scene more efficiently.
- The 15-second environment timeout can expire before an 18.17 MB GLB finishes
  on a healthy 10 Mbps connection.

## Capability Ownership

This work extends existing owners:

- `PerfMonitor.svelte` owns live renderer measurement. It gains percentiles,
  GPU timing when supported, and production-path samples.
- `ScenePostProcessing.svelte` owns bloom and final-frame render targets. It
  exposes the existing composed frame to capture rather than creating a second
  composer.
- `view-capture.ts`, tunnel-poster capture, scene-collection capture, and the
  offline exporter remain the capture consumers. They route through one shared
  readable-frame owner.
- `worlds/autumn/autumn-pond.ts`, with `autumn-pond-surface-material.ts`, owns
  the pond surface and may change its shader/material implementation while
  preserving the approved pond image.
- `worlds/autumn/autumn-lighting.ts` owns Autumn's moon shadow. Production
  performers and props are animated casters, so the shadow stays live while
  Autumn is active and the complete lighting rig leaves the renderer when
  Autumn is retained but inactive.
- `autumn-geometry-tier.ts` remains the geometry-policy owner. It stops
  deleting authored placement counts and instead partitions exact authored
  instances into bounded culling cells.
- `scene-asset-manifest.ts` and `scene-prefetch.ts` remain the owners of HTTP
  cache warming.
- `autumn-environment-request.ts` remains the owner of cancellation, retries,
  progress, and stall detection.

No parallel render loop, quality detector, capture service, or asset loader is
introduced.

The pond and lighting owners were `AutumnPond.svelte` and
`AutumnLighting.svelte` when this spec was written. They moved into the shared
Autumn world on 2026-09-04, and the unmounted Svelte copies were deleted on
2026-09-28.

## Performance Contract

### Runtime

- Production-path measurements include the real viewer renderer, performer,
  playback, effects, shadows, and postprocessing.
- A 120-second steady-state run records CPU frame time, GPU frame time when
  `EXT_disjoint_timer_query_webgl2` is present, p50/p95/p99, long-frame count,
  draw calls, triangles, programs, geometries, textures, and drawing-buffer
  pixels.
- On each declared supported hardware/resolution class, GPU p95 is at most
  11.5 ms, complete-frame p99 is at most 16.7 ms, and fewer than 0.1% of frames
  exceed 33 ms after warm-up.
- The final 30 seconds may not regress more than 10% against the first 30
  seconds.
- Ten environment switches may not leak renderer resources, increase the
  steady-state program count, or lose the WebGL context.

### Loading

- A healthy 10 Mbps cold load may not fail because total elapsed time exceeds
  15 seconds.
- A request fails only after verified lack of byte progress or a bounded hard
  ceiling, and retry cancels every prior request and ignores late completion.
- Every curtain-blocking Autumn asset is included in prefetching.
- External textures are resized or GPU-compressed only when the approved image
  remains visually unchanged and no second runtime loader path is introduced.

### Visual parity

- Deterministic stills freeze wind, particles, wisps, water, and camera time.
- Hero, walk, world, overlook, reverse, depth, settlement, shack, pond, fungi,
  ferns, root-contact, and owl views are compared at 1920×1080, 2560×1440,
  3840×2160, 1440×900, 820×1180, 960×412, and 375×667.
- The overlook view reproduces the reported 70-meter, high-oblique camera in
  both the empty review graph and a deterministic production graph with three
  animated performers, distinct efforts and effects, live shadows, and the
  production postprocessing composer.
- Static SSIM is at least 0.995; 99.9% of changed pixels remain below ΔE2000 1;
  and silhouette displacement remains below 0.5 physical pixel.
- Motion samples retain the same trajectories, counts, interaction radii, and
  settled material intensities.
- Human inspection must find no lost depth cue, grounding, water read,
  reflection, shadow contact, glow, habitat, or authored ecology.

## Implementation

### 1. Production measurement

Extend the existing monitor and Autumn review route so the test can use the
same postprocessing, renderer settings, and quality context as production.
Record pass-attributed counters and asynchronous GPU timing without blocking
the render loop. Unsupported timing extensions fall back to CPU frame
percentiles and Long Animation Frame observation.

### 2. Remove redundant full-frame work

1. Replace the pond's physical transmission with an alpha-composited,
   normal-driven water surface over the authored basin. Preserve clearcoat,
   ripple motion, moon column, depth color, and the approved silhouette.
2. Default the interactive viewer to a nonpersistent drawing buffer. Capture
   requests ask the existing render owner for one final composed frame and read
   it immediately while the default framebuffer is valid.
3. Keep bloom's approved output. Autumn's wisps, habitats, lantern, and the
   production trail are persistent bloom contributors, so a demand gate cannot
   remove that pass without changing the scene.

Static shadow caching was rejected during implementation: the environment and
stage are static, but `Avatar3D` and glTF props explicitly cast while animated.
A frozen map would trade frame time for visibly stale performer shadows.

### 3. Remove invisible geometry and fragment work

1. Export closed opaque solids front-sided after topology/winding proof. Keep
   intentional thin foliage and failed topology candidates double-sided.
2. Split large instanced families into spatial cells so ordinary frustum
   culling can reject off-camera placements without changing visible content.
3. Freeze static object matrices after world transforms and bounds are final.

Static stage merging is excluded. The authored stage is already a small share
of the frame, and merging would complicate material identity, collision, and
shadow correctness without addressing the measured full-scene rerender.

### 4. Screen-space geometry

The previous count-trimming path is removed. Repeated fern, tree, and rock
families retain their full source geometry and every authored transform, then
split into measured spatial cells so native frustum culling becomes effective.
Geometry substitution is intentionally excluded from this pass because the
request requires literal quality retention, not merely an imperceptibility
threshold.

### 5. Loading and memory

1. Deliver a high-quality 512 px Autumn moon in lossless PNG with more than four times
   the largest approved 4K projected diameter, reducing decoded RGBA memory
   from roughly 15 MB to roughly 1 MB. Keep the two 512 px pond normals because
   their combined decoded cost is small and changing their compression path
   would add a second texture loader to the pond.
2. Add the pond normals and tiled ground detail to the Autumn manifest.
3. Replace total-duration timeout semantics with progress-aware stall
   detection and an explicit hard ceiling.
4. Give each Autumn request its own abortable `LoadingManager`, and dispose the
   dedicated GLTF's geometry, materials, and textures after restoring spatial
   batches on unmount. No late request or retired scene may retain GPU assets.

### 6. Fixed quality policy

The shared device tier remains an initial renderer hint, but Autumn does not
respond to frame pressure by removing ecology, substituting geometry, freezing
animated shadows, or disabling approved postprocessing. Reliability comes from
removing redundant work and recovering fixed headroom before the scene is
shown. Every tier retains the full authored placement set.

## Risks

- Removing transmission can flatten the pond if basin contrast, Fresnel, and
  reflection balance are not retuned together.
- Static shadow caching is forbidden while production performers or props cast;
  an optimization may not freeze their animated contact shadows.
- Nonpersistent framebuffer capture can silently produce blank or pre-bloom
  frames. Poster, review, image export, and video export all require direct
  regression coverage.
- Incorrect sidedness creates invisible holes only from certain cameras.
- Splitting instance batches can trade vertex savings for excess draw calls;
  the cell size is accepted only from measured production data.

## Release Gate

The work ships only when automated contracts, type checks, asset verification,
capture/export regression tests, production-path performance captures, and the
complete visual camera/viewport matrix pass. An independent adversarial audit
must return no remaining P0/P1 performance or reliability issue.

## Implementation Evidence and Open Release Gates

- Production graph: real `Viewer3DCanvas`, three animated performers with staff
  props, live performer shadows, effects, and the real postprocessing composer.
- 137-second steady-state high-quality run after a five-second warm-up:
  8,211 samples, 60 FPS, frame p50 16.7 ms, p95 18.7 ms, p99 20.3 ms,
  0.0365% frames over 33 ms, and +0.6% thermal drift.
- GPU timer query was supported: GPU p50 7.37 ms, p95 10.99 ms, and p99
  15.39 ms at a 3,087×1,646 drawing buffer.
- Ten real Autumn ↔ Void transitions exposed and then verified the GLTF
  lifecycle fix. After both worlds compiled, every Autumn return stabilized at
  178 geometries, 74 textures, and 172 programs; every Void return stabilized
  at 67 geometries, 29 textures, and 137 programs. No WebGL context loss or
  scene-owned console error occurred.
- The complete 12-camera × 7-viewport current matrix passed. Paired baseline
  desktop/mobile inspection covered the original transmission pond and every
  adversarial camera; the final pond retune restored the dark-water depth that
  the first alpha-composited pass had flattened.
- Automated coverage includes performance windows and thermal drift, GPU timer
  query behavior, exact spatial batching, front-sided material contracts,
  progress-aware timeout and transport aborts, composed-frame capture, poster
  capture, and standard/cinema offline video export cancellation.

This evidence proves the implementation and the tested desktop configuration,
but it does not close every approved release gate:

- The measured request-animation-frame interval p99 was 20.3 ms. That sampler
  includes display scheduling and is not yet a direct measure of complete-frame
  render work, so it neither passes nor validly falsifies the approved 16.7 ms
  complete-frame gate.
- Browser viewport emulation proves layout and rendering coverage, not the
  performance of every supported physical mobile GPU/resolution class.
- The historical comparison server predates the production composer harness
  and has no deterministic animation freeze. Its paired captures support human
  review, but cannot supply the approved SSIM, ΔE2000, and silhouette metrics.

Closing those gates requires a deterministic pre-change production-composer
baseline plus runs on the declared physical hardware classes, or an explicitly
approved revision to the release contract. The thresholds above remain intact
until that decision is made.
