---
status: active
value: null
effort: null
remaining: "Verify Ink width range, Watercolor zero stroke gravity, and dense-ink stroke against current translator and renderer tests before editing."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# 2D Ink Production-Context Redesign

**Status:** Approved 2026-08-06

## Goal

Make Watercolor read as a translucent painted mark inside the real 2D sequence
viewer. Preserve the heavier sag, breakup, and splatter identity of the dense
ink palettes.

## Evidence

The preset gallery and the sequence viewer run the same `Ink2DRenderer`, but
they do not place the renderer under the same conditions.

- The gallery drives two emitters through one slow, uninterrupted synthetic
  curve on a 554 x 357 canvas.
- The production capture used `create/generate?v=TFG7` at 1920 x 1080. Its ink
  overlay was 785 x 785, displayed with props, path lines, step changes, and
  self-crossing choreography.
- The production scale was 1.57. The gallery capped its scale at 1.15.
- Watercolor retained three seconds of stroke history. At 60 BPM, that put
  roughly three steps on screen together.
- Gravity acted on every stored stroke point. At the production scale, the
  Watercolor acceleration was about 56 px/s², enough to move an old point more
  than 250 px over the configured lifetime.
- The four full-width Watercolor passes could produce an outer mark close to
  100 px wide during slow motion.

The resulting production frames showed nested blue bands, large knots at path
crossings, and old marks collecting below the active props. The gallery did not
exercise those failure modes.

## Research Basis

[Dripping Thin Films for Real-time Digital Painting](https://research.adobe.com/publication/dripping-thin-films-for-real-time-digital-painting/)
(Adobe Research, Eurographics 2026) models paint as a thin fluid layer carrying
pigment. Dripping is a controllable behavior alongside pigment advection and
diffusion. That separation fits this renderer: the primary Watercolor mark can
stay on its recorded path while detached droplets keep their own gravity.

The implementation remains an art-directed Canvas2D approximation. A grid fluid
simulation would not fit the existing overlay budget or export pipeline.

## Existing Primitives

- Reuse `AnimatorCanvas` for production-context previews.
- Reuse `createEffectsConfigState(..., { persist: false })` so the review page
  never changes the user's saved effect settings.
- Reuse `generationOrchestrator`, `interpolatePropAngles`, and the existing
  smooth-sequence generation path used by the Effect Tuner.
- Extend `Ink2DRenderer`; do not add a second ink renderer.

No external UI or rendering package is required. The existing production
animation stack covers the comparison page and keeps preview/export behavior on
one code path.

## Rendering Decisions

### 1. Separate the painted mark from detached fluid

`Ink2DParams` gains `strokeGravityPx`. Watercolor resolves it to zero. Dense
palettes keep gravity on the attached strand. `gravityPx` remains the gravity
for breakup and splatter droplets.

### 2. Bound the mark by path length

`Ink2DParams` gains `strokeLengthPx`, authored against the 500 px reference
canvas. Each tip keeps the newest part of the path up to that scaled length.
The oldest retained segment is interpolated at the boundary, preventing a
visible pop as the path advances.

Watercolor also gets a shorter age limit. Length controls fast choreography;
age controls lingering paint during slow motion.

### 3. Stop doubling the Watercolor pigment body

Watercolor returns to the base stroke-width range. Its bleed remains wider than
its pigment body, but the body no longer starts at twice the dense-ink width.
The target on a 785 px stage is approximately 10 to 26 px for the body, with a
soft outer wash below 42 px.

### 4. Replace concentric bands with a wash

Watercolor uses two locally varied ribbon passes:

- a broad, faint bleed;
- a narrower pigment wash.

Opacity varies per path segment, and the tail fades locally instead of applying
one average alpha to the entire ribbon. Granulation stays clipped to the mark.
Fine bristle lines remove pigment rather than adding three bright parallel
stripes.

Dense palettes keep the existing multi-pass material until they receive their
own production-context review.

### 5. Make the review page honest

The page gets one large production `AnimatorCanvas` driven by a real generated
sequence. Selecting a candidate updates an isolated effects state and the stage
immediately. The compact synthetic cards remain useful for scanning material
differences, but they are secondary evidence.

## Scope

Modify:

- `src/lib/shared/effects/translators/canvas2d-types.ts`
- `src/lib/shared/effects/translators/canvas2d-translator.ts`
- `src/lib/shared/effects/renderers/ink-2d-renderer.ts`
- `tests/unit/effects/ink-2d-renderer.test.ts`
- `src/routes/test/ink-presets/+page.svelte`
- `src/routes/test/ink-presets/InkPresetPreview.svelte`
- `src/routes/test/ink-presets/ink-preset-candidates.ts`

Create one route-local production preview component if the page cannot stay
readable with the playback code inline.

## Risks

- A shared width or material change can damage India, Sumi, Neon, Blood, or
  Acid. Watercolor branches must remain explicit.
- The production preview must use isolated state. Persisting the candidate is a
  release decision, not a review-page side effect.
- Export uses the same renderer at other canvas sizes. Scale math must be tested
  and preview/export frames compared.
- Several animated canvases can consume the frame budget. Only the selected
  candidate gets the full production stage; compact cards stay throttled.

## Verification

- Unit-test the width range, Watercolor zero stroke gravity, dense-ink stroke
  gravity, scaled path-length bound, and palette composite modes.
- Run the focused renderer and translator tests with the repository Vitest
  config.
- Capture multiple moments from `create/generate?v=TFG7` at 1920 x 1080.
- Inspect the preset review route at 1920 x 1080, 2560 x 1440, 3840 x 2160,
  1440 x 900, 820 x 1180, 960 x 412, and 375 x 667.
- Check console errors, overflow, minimum text size, and touch targets.
- Compare a production preview frame with a deterministic export frame so the
  selected material does not diverge during export.
