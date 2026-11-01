---
status: active
value: 2
effort: S
work_state: verification
remaining: "Gallery shipped 2026-08-28 (6f1c22c141, e1c9fc6e6b, fe10533ef3, 252c73767c) in src/lib/shared/settings/components/tabs/prop-type/; Buugeng chirality later became four pair tiles (bbc12c6f2c). Remaining: browser proof of the acceptance list at the seven viewports plus 200% zoom, light and dark."
depends_on: ''
plan_path: ''
tags: []
last_triaged: 2026-11-01
---

# Prop Picker Gallery

> **Triage note (2026-11-01):** The Approved status above is historical. The gallery shipped in 6f1c22c141 and follow-ups (e1c9fc6e6b, fe10533ef3, 252c73767c), and Buugeng chirality was later reworked into four pair tiles (bbc12c6f2c); only the browser acceptance pass remains.

**Status:** Approved for implementation
**Date:** 2026-08-28

## Outcome

The prop picker must read as a confident gallery of available equipment, not a
disabled inventory floating inside a large drawer. Every unlocked prop remains
visibly available before hover, while selection and hand identity keep the
product's existing accent semantics.

## Visual hierarchy

- The shared `DrawerHeader` owns the title and close action.
- CatDog and per-hand controls remain secondary toolbar controls beneath the
  title.
- Unlocked prop artwork and labels are readable at rest. Reduced opacity is
  reserved for genuinely locked props.
- Tiles consume the theme card, stroke, text, and accent tokens. Different prop
  families do not receive arbitrary colors that could be mistaken for blue/red
  hand identity.
- Selected props receive the strongest accent surface, border, and checkmark.
- Section headings are real supplementary labels rather than decorative gray
  captions.

## Responsive composition

The desktop side drawer remains the same width and dismissal model. Its gallery
uses three substantial tiles per row so the known Standard and Novelty counts
form complete rows. Narrow phone layouts retain three columns with smaller
component-relative tiles. Wider bottom drawers may reveal additional columns
without enlarging the same controls merely because the viewport is wider.

The picker stays scrollable in short viewports. Tile media reserves its square
geometry before rendering, and selection does not reflow the grid.

## Existing owners

- `Drawer` and `DrawerHeader`: placement, dismissal, drag, focus, title, and
  close action.
- `PropSelectionSheet`: prop-picker composition and CatDog/per-hand toolbar.
- `BentoPropGrid`: section layout, family popovers, locked/premium routing, and
  chirality placement.
- `PropTypeButton`: prop tile interaction, accessible labels, selection state,
  badges, and prop preview presentation.
- `PropChiralityRow`: Buugeng A/B selection.

## Acceptance and verification

- Club, Double Staff, and Buugeng selection leave the picker open;
- Buugeng selection still reveals chirality without reopening the picker;
- X, Escape, backdrop, and drag dismissal remain available;
- unlocked props are clearly distinct from locked props before hover;
- visible prop labels use the essential-text minimum and section labels use the
  supplementary-text minimum;
- no arbitrary family colors replace theme or blue/red hand semantics;
- family style popovers and premium markers remain legible;
- dark and light theme variables produce readable card/text contrast;
- the drawer is visually checked at 375×667, 960×412, 820×1180, 1440×900,
  1920×1080, 2560×1440, and 3840×2160, plus 200% browser zoom.
