---
status: active
value: null
effort: null
remaining: "Verify timestep-normalized fire dissipation and shader compilation in the real WebGL2 comparison route."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# 2D Fire Renderer Upgrade

**Status:** Approved for implementation on 2026-08-11  
**Owner:** `src/lib/shared/animation-engine/services/fire/`

## Outcome

Keep the mature WebGL2 fluid renderer as the production owner and raise its
image quality without replacing it with the incomplete WebGPU port. The result
must preserve prop readability, deterministic export timing, transparent
compositing, adaptive quality, and the existing WebGL2 fallback contract.

## Scope

1. Preserve scalar detail with limited MacCormack advection for temperature,
   fuel, and color while velocity keeps the stable semi-Lagrangian path.
2. Consume fuel during combustion and carry an advected reaction coordinate so
   fresh cores, burning bodies, and cooling edges can render differently.
3. Separate flame amount from photographic brightness. `intensity` owns fuel,
   heat, and volume; `brightness` owns HDR emission.
4. Replace display-space flicker modulation in the upgraded profile with detail
   derived from advected thermal and reaction fields.
5. Finish the transparent HDR result with hue-preserving highlight rolloff and
   stable low-amplitude dithering before premultiplication.
6. Batch tip splats to keep the added scalar passes inside the frame budget.
7. Make loop caching replay the same bloom and tone-mapping path as live fire,
   include every visual input in invalidation, and enforce a hard GPU-memory
   budget.
8. Keep a `legacy` comparison profile in the test harness so the pre-upgrade
   renderer can be viewed beside the production profile from the same source.
9. Reconstruct the HDR display at a capped presentation resolution instead of
   baking bloom and tone mapping into the simulation grid. High-tier devices
   use a 256² solve; the HDR presentation target scales to 1024 pixels.
10. Run the comparison through the canonical inline sequence player so both
    profiles can be judged on the same real prop choreography.
11. Keep Fire in the foreground, but protect prop readability with an exact
    rendered-sprite color-and-silhouette matte in the final HDR composite. The matte caps
    only dense, prop-hiding fire; calm flame and bloom outside the silhouette
    remain untouched, the prop's color becomes a restrained heat glaze instead
    of a gray transparency window, and the ignition point keeps a small tip
    exemption.

## Deliberate Boundaries

- Do not switch production to the WebGPU executor. It does not yet have feature
  parity or a single-command-buffer simulation path.
- Do not add heat shimmer or local scene lighting until the 2D compositor owns
  a scene-color input. A transparent overlay cannot distort or illuminate pixels
  it never receives.
- Do not add opaque soot to the transparent prop overlay. Cooling-edge color and
  emissivity carry the combustion history without obscuring the notation.

## Performance Contract

- MacCormack applies only to scalar fields and may fall back to first-order
  transport when renderer concurrency requires it.
- Tip injection is accumulated in bounded uniform batches rather than one draw
  call per interpolated splat.
- Cache allocation never exceeds its configured byte budget. An over-budget
  loop stays live instead of recording a partial or repeatedly retrying cache.
- The prop matte is drawn once per visible sprite into an 8-bit RGBA
  presentation target. Sprite textures are reused by image identity and removed
  when the corresponding painted sprite leaves the frame.

## Verification

- Unit-test timestep-normalized dissipation, scalar-quality selection, cache
  capacity, cache bypass, brightness mapping, and complete cache invalidation.
- Compile every shader through the real WebGL2 renderer on the comparison route.
- Compare `legacy` and `cinematic` profiles at identical motion, settings, time,
  and viewport.
- Compare the profiles on the same eight-beat staff sequence, with autoplay
  released only after both player instances finish loading.
- Verify dense crossings preserve the prop silhouette in live playback, cached
  replay, and headless export without producing rectangular or capsule-shaped
  cutouts around fans, hoops, or asymmetric props.
- Check the route at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180,
  960x412, and 375x667. Record console errors and renderer diagnostics.
