---
status: active
value: null
effort: null
remaining: "Verify smoke/fluid tier, dissipation, lifecycle, and fallback behavior against current renderer."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Fluid Smoke and White-Hot Fire Core

**Status:** Approved for implementation on 2026-08-12  
**Supersedes:** The 2D renderer choice in `shipped/2026-04-15-effects-phase-1i-smoke-design.md`  
**Extends:** `2026-08-11-2d-fire-renderer-upgrade.md`

## Outcome

The production Fire effect remains the cinematic, reaction-aware fluid renderer. Its hottest transported flame volume gains a controlled white-hot interior before tone mapping and bloom.

The production 2D Smoke effect moves from independent Canvas puffs to an advected density field. It keeps the existing Smoke intent, palette names, tracking modes, persisted settings, presets, and 3D presentation contract. The existing puff renderer remains a capability fallback for browsers without the required WebGL2 float-render-target support.

The comparison lab renders several real choreography shapes with synchronized players so Fire quality can be judged in motion. It also exposes the old puff Smoke beside fluid Smoke for palette and motion review.

## Architecture

`WebGLFluidSolver2D` is the single owner of reusable incompressible-flow mechanics:

- velocity transport;
- curl and vorticity confinement;
- buoyancy;
- divergence, pressure solve, and projection;
- scalar transport, including MacCormack correction when the device budget permits;
- field allocation, resize, clear, and disposal.

Fire and Smoke own their materials, emitters, and presentation:

- Fire owns fuel, temperature, reaction, combustion, blackbody color, HDR reconstruction, bloom, and frame caching.
- Smoke owns density, thermal lift, palette shading, optical depth, and non-emissive alpha compositing.

The effect plugin registry owns Smoke backend selection and lifecycle. It attempts the WebGL renderer first, then activates the existing Canvas renderer if initialization fails. Live playback and export use the same backend order.

## Compatibility

- `SmokeIntent` and its storage schema do not change.
- Existing Smoke palettes remain valid. `campfire` becomes the fire-colored smoke palette rather than a Fire implementation.
- Existing presets and tip assignments continue to resolve through the current effects configuration state.
- The 3D Smoke renderer keeps its particle geometry and receives the same palette color update.
- Fire's original rendering profile is preserved as the `Liquid Fire` preset.
  Selecting Classic, Blue Flame, or Spirit returns Fire to the natural profile.
- `Liquid Fire` restores its intended classic palette and natural color mode as
  one complete look. Color customization remains available after selection.

## Quality and Performance

- Scalar fields use half-float render targets where WebGL2 exposes `EXT_color_buffer_float`.
- Simulation resolution is bounded independently of display resolution. Smoke is reconstructed at the overlay canvas size with linear filtering, avoiding simulation-grid pixels in the final image.
- Fluid instances share an adaptive pressure/MacCormack budget so multiple players do not multiply the most expensive passes without limit.
- Density and temperature dissipate continuously; no unbounded particle arrays are introduced.
- Smoke uses standard alpha compositing. Fire alone uses additive HDR bloom.

## Failure Behavior

- Missing WebGL2 or float render targets selects Canvas Smoke without changing user settings.
- Shader compilation or framebuffer failures dispose partial GPU resources before selecting the fallback.
- A failed effect renderer does not interrupt choreography playback.
- Export follows the same fallback policy and never substitutes Fire for Smoke.

## Verification

1. Pure tests cover resolution tiers, density dissipation, palette conversion, and shared fluid-budget choices.
2. Renderer lifecycle tests cover WebGL selection, fallback selection, resize, clear, and disposal.
3. Smoke translator and preset tests prove stored intent compatibility.
4. Fire shader tests prove the transported hot-interior term is present before HDR rolloff.
5. Export tests prove Smoke selects the WebGL backend and falls back to Canvas when unavailable.
6. Type checking and the production build run after targeted tests.
7. The comparison lab is inspected at 1920, 2560, 3840, 1440, tablet, 960x412, and 375-pixel viewports. The required visual review checks synchronization, clipping, readable controls, smooth edges, white-core containment, and reduced-motion behavior.

## Exclusions

- The 3D Smoke renderer is not rewritten.
- The experimental render-graph payloads are not promoted into production in this change.
- No new Fire or Smoke sliders are added.
- No persisted effect schema migration is required.
