---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify stage-framed shape-matrix view-box geometry for square, portrait, and landscape containers.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Shape Matrix Stage Composition

## Outcome

The Shape Matrix detail stage uses its full rectangular frame without stretching
the square motion plane. The animation remains the visual center, while the word
header and pictograph annotations align to the stage edges. The pictograph strip
stays directly beneath the stage, and the relationship footer gives Hands and
Props a clearer information hierarchy.

## Product decisions

- Keep Hands as the canonical six-button relationship picker.
- Keep Props as a distinct inverse lookup. It reaches exact prop phases that a
  single default realization per hand relationship cannot expose.
- Do not add `H:` or `P:` labels inside the pictograph. The top-right and
  bottom-right elemental positions are explained by the footer and About copy.
- Do not stretch the grid, props, trails, or mandala. They remain on a centered
  square motion plane.
- Use the available rectangular frame for the word header and four annotations:
  beat top-left, prop element top-right, TKA bottom-left, hand element
  bottom-right.

## Ownership

- Keep selection and realization building in `ShapeMatrixDrill` and the existing
  shape-matrix services.
- Extend `GlyphOverlay` with an opt-in stage-framed coordinate system. The
  default pictograph coordinate system remains unchanged for all other callers.
- Thread the opt-in through `CanvasSurface`, `AnimatorCanvas`, and
  `InlineAnimationPlayer`; Shape Matrix is the first consumer.
- Keep `WordHeader`, `StepStrip`, `MandalaHeroLayer`, `DualSourceCrossfade`, and
  the disassembly state machine as the existing behavior owners.
- Compose the clearer Hands/Props footer inside `ShapeMatrixDrill`; it adds no
  new interaction or domain behavior.

## Responsive behavior

The stage-framed overlay expands its SVG view box along the longer container
axis. That keeps one SVG unit physically square, preserves glyph proportions,
and moves only edge-owned annotations. Landscape stages gain horizontal reach;
portrait stages gain vertical reach. The central position glyph remains centered
on the full stage.

The pictograph strip remains in normal flow immediately below the hero. Its
height and interaction behavior do not change in this pass. Short-wide and phone
compositions retain their existing rules.

## Motion and accessibility

The stage has stable geometry; selecting a relationship does not insert or
remove layout rows. Existing crossfades continue to communicate realization
changes. Disassembly uses the canonical reduced-motion-aware state machine.
Accessible labels continue to distinguish hand and prop elemental glyphs.

## Verification

- Unit-test the stage-framed view-box calculation for square, landscape, and
  portrait containers.
- Run focused component and service tests plus the project check gate.
- Inspect the live Shape Matrix at desktop, 4K, tablet, phone portrait, and phone
  landscape sizes, including assembled and disassembled states.
- Confirm the square motion plane is undistorted, all four annotations have
  balanced edge insets, the strip remains attached to the hero, and the footer
  remains legible without crowding.
