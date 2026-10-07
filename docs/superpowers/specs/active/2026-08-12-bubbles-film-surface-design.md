---
status: active
value: null
effort: null
remaining: "Recheck bubble size/lifetime and film shader tests plus visual acceptance before closing the implemented claim."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Bubbles Film Surface Pass

**Queue evidence (2026-10-07):** The later implemented-and-verified claim needs a current film-shader and visual acceptance recheck before archival.

**Original status (historical):** Approved for implementation on 2026-08-12

## 2026-08-13 quality elevation

The first film pass proved the pooled architecture, but the production forest
review exposed four visible limits:

- Low-poly sphere silhouettes could facet at hero size.
- Concentric view-angle color made neighboring bubbles look stamped.
- Fixed key lights did not bend the scene behind the film.
- New bubbles ignored prop velocity and accumulated in vertical columns.

The quality elevation keeps `BubbleRenderer3D` as the sole behavior owner and
changes the shell representation to an analytic ellipsoid reconstructed from a
two-triangle camera-facing surface. This removes capacity-dependent silhouette
quality and makes every shell single-pass.

The compositor downsamples its completed linear scene color to one-sixteenth
width and height after rendering. This optically blurred transmission field is
enough to bend broad background color through the film without paying for
detail the transparent center cannot preserve. Bubble film samples the resolved
texture on the next frame, which avoids read-write feedback and the measured
cost of a full-resolution framebuffer copy. The material applies restrained RGB
dispersion, then layers a three-wavelength thin-film response driven by a
180-720 nm animated thickness field. The optical phase uses film IOR, view
angle, wavelength, and life-driven drainage.

Motion now inherits a capped fraction of source velocity, distributes batched
spawns backward along the tip's frame path, relaxes vertical motion back toward
buoyancy, and samples the existing divergence-free curl field in the horizontal
plane. Nearby bubbles share air movement without a new simulation owner or
per-particle allocation.

## 2026-08-13 God Mode living-film pass

**Status:** Implemented and verified on 2026-08-13

The final pass concentrates the quality budget on motion that explains the
material. Relative air speed stretches the shell along its projected travel
direction, while the other axes contract to preserve volume. A damped spring
lets surface tension overshoot slightly before the film settles back to round.
The deformation stays inside the existing two-draw-call pool and adds no
per-frame allocations.

Film thickness now behaves as a living field instead of a stationary rainbow.
Coherent eddies advect the color, gravity drives exponential drainage, and a
clear zone descends from the top late in the bubble's life. Each bubble then
opens a deterministic, top-biased rupture. The hole expands locally, carries a
bright retracting rim, and throws its existing film fragments away from the
break point. This replaces the old whole-shell collapse.

The optical model follows measured soap-film behavior: interference depends on
film thickness, refractive index, wavelength, and view angle; gravity produces
non-uniform thinning; mature films tend to fail near their drained upper
region. The implementation uses a bounded three-wavelength approximation rather
than spectral integration:

- [Applied Optics: spatial and temporal film thickness measurement](https://doi.org/10.1364/AO.51.008863)
- [Journal of Fluid Mechanics: drainage and lifetime of thin liquid films](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/drainage-and-lifetime-of-thin-liquid-films-the-role-of-salinity-and-convective-evaporation/15E577AB3CACF5E43E4DE4CA3F0C4416)
- [Journal of Fluid Mechanics: cracks in bursting soap films](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/cracks-in-bursting-soap-films/A652601EFC45BDBD478A467BEB242273)

Transmission is depth-aware. Displaced scene samples are reduced near contact
and rejected when they would pull foreground silhouettes across the bubble.
The scene-color and depth snapshot is produced only while a bubble pool requests
it, with a three-frame demand lease. Quality tiers retain the same material
behavior while capping capacity at 2,048, 1,024, and 512 shells and scaling the
optical sampling strength.

Verification evidence:

- 40 focused unit and batching-contract tests pass.
- The live forest scene reports no console errors or warnings with eight emitters.
- Foreground A/B runs share the same 66.7 ms median frame interval with bubbles
  enabled and disabled; no repeatable bubble-specific slowdown was measured in
  the already constrained scene.
- Visual captures were inspected at 1440p, 1920p, 2560p, and 3840p. The 3D
  viewer is intentionally unavailable at the 820 px, 960 x 412 px, and 375 px
  responsive tiers, so those widths exercise the application's 2D fallback.

## Outcome

Bubbles reads as transparent soap film in both renderers. The existing 2D
renderer remains the visual reference: a clear center, a grazing-angle rim,
restrained thin-film color, two light responses, buoyant size-dependent motion,
and a short film-fragment pop. The 3D renderer reaches the same contract without
changing saved intents, presets, controls, or palette names.

## Evidence and ownership

Search terms: `bubble material`, `thin film`, `iridescence`, `Fresnel`,
`wireframe`, `soap film`.

- `Bubbles2DRenderer` already owns the complete Canvas presentation and stays
  intact.
- `BubbleRenderer3D` owns pooled Three.js presentation and becomes the one 3D
  simulation owner. It keeps shells and film fragments in separate bounded
  instance pools because their geometry costs differ materially.
- `BubbleEmitter3D` currently duplicates the simulation with per-particle
  Svelte meshes. It will delegate to `BubbleRenderer3D` instead.
- `ParticleInstancePool3D` is the closest instancing infrastructure, but it is
  already being changed by another session and its generic material contract
  cannot carry bubble film data. Bubbles therefore creates one effect-local
  instanced pool with the same allocation-free frame policy.

Relationship: **create** a bubble-specific film material and instanced pool,
then **reuse** them from both 3D entry paths. This is new creative rendering,
not a second generic particle capability.

## Optical model

The film shader uses a bounded real-time approximation of the properties that
make soap bubbles legible:

1. Schlick-like grazing-angle reflectance creates a strong rim and clear center.
2. View angle, per-bubble film phase, and time drive a restrained RGB
   interference sweep.
3. A low-resolution resolved scene texture supplies bounded screen-space
   refraction while a tight key reflection and broad opposing bounce retain
   shape on flat backgrounds.
4. Standard alpha blending and camera-relative, back-to-front instance sorting
   keep overlaps soft and avoid allocation-order artifacts.

The approximation follows the same concepts exposed by Three.js
`MeshPhysicalMaterial` (`iridescence`, `iridescenceIOR`, thickness, and
transmission), but avoids its per-pixel physical transmission cost across a
large particle field:

- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/docs/pages/InstancedMesh.html

The physical reference is thin-film reflection and transmission, with the
strongest interference near grazing incidence:

- https://doi.org/10.14935/jssej.38.188
- https://doi.org/10.1016/0095-8522(65)90025-5

## Motion and scale

- The field uses the 2D renderer's power-law size distribution: many small
  bubbles, rare large bubbles.
- World-space size gets an additional bounded scale so no bubble competes with
  a staff or performer.
- Radius swells by only eight percent across a lifetime. Bubbles do not triple
  in size.
- Larger bubbles rise faster; smaller bubbles sway more.
- Per-bubble phase drives mild anisotropic tension wobble.
- The pop briefly collapses the shell and emits four to seven tiny film
  fragments through a two-triangle film-sliver pool. Shells use the same
  analytic two-triangle surface at every capacity tier.

## Compatibility

- `BubblesIntent`, storage, presets, controls, palettes, and translators do not
  change.
- Scene batching remains two bounded draws: one for curved shells and one for
  materially cheaper film fragments.
- The fallback renderer uses the same simulation and material as the scene
  manager.
- Disabling emission lets existing bubbles complete their lifetime instead of
  disappearing immediately.

## Risks

- Transparent instances are sorted back-to-front from the active camera before
  each draw. Sorting is bounded by the resolved 512/1,024/2,048 pool tier.
- A physically complete spectral integration would be too expensive here. The
  three-channel phase approximation is deliberately art-directed and bounded.
- More sphere segments improve hero-scale silhouettes but raise vertex cost.
  Shell detail therefore follows the capacity tier, while fragments use a
  two-triangle plane instead of sphere geometry.

## Verification

1. Pure tests prove size bounds, lifetime swell, pop collapse, and fragment
   count.
2. Material tests prove the film shader keeps Fresnel, interference, clear
   center, normal blending, color management, and single-pass transparency.
3. Renderer tests prove one instanced mesh, stable attributes, bounded writes,
   clear, and disposal.
4. The production 16-count effect-preview LOOP drives the effect-grid hero and
   full-roster views.
5. Before/after review covers 1920x1080, 2560x1440, 3840x2160, 1440x900,
   820x1180, 960x412, and 375x667. The visual gate checks scale, clear centers,
   controlled overlap, recognizable pop, 2D/3D parity, and scene readability.
