---
status: backlog
value: null
effort: null
work_state: blocked
remaining: Release the locally implemented winter-wind package, then verify the consuming 3D scene against the design acceptance.
depends_on: 'external: winter-wind package release'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Living Winter Wind

**Date:** 2026-08-06  
**Status:** Implemented locally; package release pending  
**Owner:** `@austencloud/backgrounds` winter Canvas 2D system

## Target

Make the existing full-screen snowfall feel responsive and physically connected without adding a horizon, terrain, wildlife, or another scene object.

Snow should move in broad, coherent gusts instead of reading as independent flakes with unrelated sideways drift. Slow curl motion supplies small eddies between gusts. Pointer movement leaves a soft wake through nearby snow, then the field settles naturally. Mouse and pen input also shift the snow layers against a fixed sky to create shallow camera depth. A small cursor light catches nearby flakes without painting a visible halo on the sky.

## Existing path

```text
BackgroundHost pointer events
  -> BackgroundController.setPointer
  -> WinterBackgroundSystem
  -> SnowflakeSystem update
  -> CanvasRenderingContext2D
```

The current snow update combines a constant per-flake `sway`, a small sine offset, and one global wind scalar. Depth already exists on every flake, but the wind does not use it.

## Reuse decision

Internal searches covered `wind field`, `flow field`, `gust`, `vortex`, `wake`, `PerlinNoise`, and cursor forces.

- Extend the gust timing and easing patterns used by `BlossomWindSystem`.
- Reuse the seeded `PerlinNoise` implementation already used by the forest systems.
- Reuse the optional `IBackgroundSystem.setPointer` path already used by ocean.
- Keep rendering in the package's existing Canvas 2D animation loop.

External research found `simplex-noise` 4.0.3, a small maintained noise package. It is not adopted because the package already owns a tested-compatible seeded noise implementation and only needs 2D samples. Rive and sprite runtimes do not fit a particle-flow change.

For cursor lighting, internal searches covered `cursor glow`, `pointer light`, `radial gradient`, `shadowBlur`, `lighter`, `sparkle`, and `glint`.

- Reuse the touch and reduced-motion gates from `cursor-glow-effect.ts`.
- Reuse the time-corrected easing pattern from `WinterParallaxTracker`.
- Follow the existing `lighter` multi-pass Canvas 2D pattern, which avoids per-flake `shadowBlur`.
- Do not reuse the CSS cursor glow because it paints a radial overlay over the sky instead of lighting individual flakes.

PixiJS 8 filters were also evaluated. They require a WebGL or WebGPU scene and process a filtered container after rendering. Adopting Pixi for one localized light would replace the current Canvas 2D path and add a post-processing cost. The winter renderer can produce the effect with a distance sample and a second stroke on only the flakes inside the light radius.

## Motion model

Each frame samples one combined velocity target for every snowflake:

1. **Ambient curl:** a slowly translated scalar noise field. A finite-difference curl produces smooth local circulation without sinks that collapse flakes into a point.
2. **Gust front:** an occasional wide band crossing the viewport with eased strength. The front adds strong horizontal motion and a smaller lift component.
3. **Pointer wake:** recent pointer movement deposits a short row of spaced eddies. Adjacent eddies rotate in opposite directions, carrying snow forward while parting it around the path. The row drifts briefly, fades within roughly one second, and a stationary pointer has no force.
4. **Depth camera:** pointer position is normalized around the viewport center and eased without spring overshoot. Distant flakes move 2–4 pixels, middle flakes roughly 9–12 pixels, and foreground flakes up to 28 pixels in the opposite direction. The gradient remains fixed.
5. **Cursor light:** an eased light position follows mouse or pen input. Flakes inside a 135–190 pixel responsive radius receive a soft, depth-weighted opacity lift and a faint icy additive stroke. The sky receives no gradient or overlay. A small subset of close flakes produces a narrow glint pulse from the existing sparkle seed.
6. **Micro drift:** a reduced version of each flake's existing sway prevents identical trajectories.

The combined wind target is depth-scaled and velocity-smoothed before integration. Camera and light effects are applied only while drawing, so they cannot alter wind physics or particle recycling. Touch input stays flat. Reduced-motion mode disables gusts, pointer response, camera depth, and cursor light while retaining a faint ambient drift.

## Scope

### Shared package

- Add a winter-owned wind-field service and focused tests.
- Add a winter-owned parallax tracker with time-corrected easing and focused tests.
- Add a winter-owned cursor-light tracker with time-corrected position and intensity easing.
- Extend `Snowflake` with smoothed wind velocity.
- Replace the old global wind scalar in `SnowflakeSystem`.
- Forward pointer and accessibility state through `WinterBackgroundSystem`.
- Forward pointer type through the shared controller so touch can remain flat.
- Preserve current drawing and quality behavior.
- Keep enough flakes on narrow screens for the wind response to remain readable.
- Rescale existing particle positions during viewport changes so shrinking from 4K does not leave empty bands.

### TKA application

- Consume the new package build after release.
- Pass `PointerEvent.pointerType` from `BackgroundHost` to the shared controller.
- No ground layer, UI control, route, or component is added.

## Risks and limits

- Excess force can make snow look like rain or confetti. Vertical lift stays below the flake's normal fall speed for most particles.
- Pointer response can distract behind controls. Eddies are spaced, capped, and limited to a short fading history.
- Full-screen depth motion can trigger vestibular discomfort. The sky never moves, offsets are capped at 28 pixels, easing has no overshoot, touch is flat, and reduced motion resets the camera immediately.
- A visible circular halo would make the pointer read as a flashlight. Only flake strokes are brightened, with no fill or gradient drawn over the sky.
- Canvas `shadowBlur` on every flake would be expensive at 4K. Lighting uses one distance calculation per flake and adds a second crisp stroke only inside the light radius.
- Noise sampling runs per flake. Winter density is capped by the existing desktop-area calculation, and low quality already reduces particle count.
- Package publishing is a separate external release step. Local verification uses the built package without changing TKA's committed dependency source.

## Verification

- Unit tests prove coherent neighboring samples, wind depth scaling, bounded force, gust easing, alternating curl direction, pointer-wake decay, camera depth ordering, light falloff, frame-rate-independent easing, touch flattening, resize distribution, narrow-screen density, and reduced-motion behavior.
- Package tests and TypeScript build must pass.
- The built package is loaded into TKA locally for a runtime pass.
- Required viewport screenshots: 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, and 375x667.
- Visual review checks for readable snowfall, a visible but contained cursor light, rare glints, no halo on the sky, no edge clumping, and stable frame pacing.
