---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify fan appearance normalization and asset resolution across 2D, Tunnel, 3D, and prop rails.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Shared Fan Appearance in 2D, Tunnel, 3D, and Prop Rails

## Outcome

Fan remains one notation prop. Pictograph, DoodleGrip Fire, Home of Poi Medium
Lotus Fire, and DoodleGrip Day are appearance builds of that prop, selected once
and presented consistently in the animated 2D canvas, Tunnel, 3D, and every
single-prop rail glyph.

The prop rail also stops borrowing rotations from paired-prop composition
recipes. A single-prop presentation registry owns optical centering, scale, and
orientation, so a club can stand vertically and the exact selected club variant
can occupy its button cleanly without changing the two-prop picker artwork.

## Existing Owners We Extend

- `AppSettings` remains the persisted application-preference owner.
- `PropType` remains the notation and choreography identity owner. No build is
  introduced as a new prop type.
- `PropBuildPicker.svelte` remains the illustrated option-button primitive.
- `Canvas2DImageLoader` and `PropTypeManager` remain the texture-loading and
  hot-swap owners. Fan builds enter them as internal render keys while animator
  state continues to hold `fan` or `bigfan`.
- `Crossfade.svelte` remains the content-swap motion owner, including reduced
  motion.
- The scene package's `propFinishState` remains the 3D default-build adapter.
  A viewer bridge synchronizes its fan fields with `AppSettings`; performer
  overrides remain performer-scoped.

## Shared Domain Contract

```ts
type FanBuild = "pictograph" | "fire" | "lotus" | "day";
type FanFrameColor = "black" | "white";
type FanCover = "bare" | "covered";

interface FanAppearance {
  build: FanBuild;
  frameColor: FanFrameColor;
  cover: FanCover;
}
```

The default is pictograph / black / bare. Normalization accepts missing or
older persisted values and always returns a complete valid object.

Internal render keys (`fan__fire`, `bigfan__lotus`, and siblings) are renderer
implementation details. They never enter a sequence, URL prop parameter,
Firestore choreography document, or `PropType` registry.

## Artwork and Geometry

The build artwork is derived from the same measured product references already
used by `static/models/props/fan.glb`:

- DoodleGrip Fire: `scripts/assets/doodlegrip-fire-reference.json`
- Medium Lotus Fire: `scripts/assets/lotus-fire-reference.svg` and `.json`
- DoodleGrip Day: `scripts/assets/doodlegrip-day-contours.json`

The checked-in Lotus animation artwork is generated from all ten traced
centerlines plus the measured rings, cradle, and wick geometry. DoodleGrip Fire
is likewise generated from the measured five-wick crown, curved outside rails,
straight inner spines, welded lattice, spinning ring, and constant-radius grip
shell. Its covered variant uses one fitted crescent sleeve derived from the
same wick-clearance curve as the 3D cover, never generic dots placed over the
bare sprite.

Physical materials remain distinct in the renderer. Motion identity recolors
only the marked fan frame; woven Kevlar stays cream and the fitted cover keeps
its authored fabric color. Both generators write source and version metadata
into the SVG, and focused parity tests count the structural parts that would be
easy to lose during a later asset refinement.

The animated SVGs keep the established fan pivot and five-emitter envelope so
the existing assembly, trail, LED, charcoal, and fire systems continue to use
one geometry path. Big Fan uses the same artwork scaled around its existing
center pivot and big-fan reach.

## UI and Motion

One `FanAppearancePicker` is composed into the existing Props panel in 2D,
Tunnel, and 3D. It reuses the illustrated build picker and existing 3D preview
renders. Frame color and wick cover appear only for builds that support them.

Build changes do not resize the canvas or rail slot. The canvas keeps its
existing prop texture crossfade, and rail artwork swaps through the canonical
`Crossfade`. Reduced motion collapses those transitions through the existing
owners.

## Persistence and Scope

`AppSettings.fanAppearance` is the shared default. A 2D or Tunnel selection
updates it directly. The viewer synchronizes it with the 3D scene default.
Editing a specific 3D performer remains a performer override; editing All
Performers updates the shared default and clears conflicting performer build
overrides.

## Verification

- Unit tests cover normalization, render-key resolution, asset resolution, and
  appearance-triggered prop crossfades.
- The existing prop-glyph gate renders every registered prop at real desktop
  and mobile rail sizes, including every fan build.
- The fire-fan fidelity gate compares each current 3D proof render with blue and
  red output from the production 2D SVG generator, including bare DoodleGrip,
  covered DoodleGrip, and Lotus.
- The sequence-viewer transition gate exercises Pictograph, Fire, Lotus, and
  Day in 2D and Tunnel, then 3D, at desktop, tablet, short-landscape, and iPhone
  SE viewports with normal and reduced motion.
- Final `pnpm check` and focused Vitest suites must pass before integration.

## Non-goals

- Fan builds do not alter authored choreography or create new notation entries.
- This pass does not add per-performer build selection to 2D/Tunnel; those
  visualizations have one shared two-hand prop appearance today.
- Existing 3D performer overrides and saved-scene behavior remain intact.
