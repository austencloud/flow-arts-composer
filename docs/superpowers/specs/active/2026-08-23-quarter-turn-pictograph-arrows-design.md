---
status: active
value: null
effort: null
work_state: blocked
remaining: Calibrate the 32 quarter-turn arrow SVGs against guide artboards with Austen; then verify placement and resolver tests.
depends_on: 'external: Austen visual calibration against guide artboards'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Quarter-Turn Pictograph Arrows

**Status:** Structural support complete 2026-08-23; visual calibration blocked

Austen's review (2026-08-23): the `0.25` turn tuple is accepted; the 32
quarter-turn arrow SVGs are rejected as visually wrong across the board. The
resolver routing, orientation algebra, turn tuple, and targeted cache revision
below remain valid. The 32 shipped `*_0.25.svg` files and the canonical
`{0, 0}` anchor fallback are **unapproved scaffolding** — they must be
regenerated from an approved parametric source and calibrated through the
placement tiers before this spec can claim visual completion. Working plan:
`docs/superpowers/specs/active/2026-08-23-quarter-turn-visual-calibration-handoff`
(see repo handoff doc of the same date).

## Outcome

Pictographs accept `turns: 0.25` as a Level 6 turn value. The visible TKA
glyph prints `0.25`, and every valid quarter-turn arrow resolves to existing
art in both the browser and MCP renderer.

Quarter support extends the existing arrow system. It does not introduce a
second placement engine or a per-letter table of Level 6 coordinates.

## Valid state matrix

The end orientation is determined by the orientation algebra. It is not a
second freely selectable art axis.

| Motion | Valid starts | Valid paths | Direction handling |
| --- | --- | --- | --- |
| Pro / Anti | Eight relative orientations on the perimeter | Regular adjacent shifts and production skew `+` / `-` shifts | Existing rotation and mirror transforms |
| Static | Eight relative orientations on the perimeter; eight absolute `centerN` through `centerNW` orientations at center | Perimeter self path or center self path | Existing rotation and mirror transforms; center art encodes its absolute axis |
| Dash | Eight relative orientations on the perimeter; eight absolute center orientations for hash-out | Opposite dashes, hash-in, hash-out, and existing cross-grid placement cases | Existing rotation and mirror transforms; center art encodes its absolute axis |
| Float | Not valid with numeric `0.25` | Float continues to use `turns: "fl"` | Turn-invariant `float.svg` |

Nonzero `0.25` with `noRotation`, Pro or Anti at center, traveling Static,
self-path Dash, center-orientation tokens away from center, and end
orientations that disagree with the orientation algebra are invalid inputs.

The art matrix contains 32 files:

- Pro and Anti each have four relative-axis families: radial, nonradial,
  interradial clock-in, and interradial clock-out.
- Static and Dash each have the same four relative families plus eight
  absolute center-orientation families.

Clockwise and counterclockwise do not double the asset count. The established
rotation and mirroring rules supply direction. Asset identity is grid-neutral;
the placement frame handles diamond, box, skewed, centric, trigrid, and
8-point presentations.

## Ownership

`@tka/render-core` owns full-arrow asset paths. Its resolver provides exact
`0.25` formatting, case-insensitive orientation normalization, float
invariance, interradial folder selection, center folder selection, and the
quarter-skew fallback. The browser arrow resolver and MCP standalone renderer
both delegate to it.

The browser placement cascade remains intact:

1. special and persisted overrides;
2. prop-geometry adjustments;
3. authored default placement data;
4. the quarter asset's canonical `{0, 0}` anchor;
5. per-instance manual adjustment after calculated placement.

No shipped default or special placement file contains a `0.25` entry. A
missing quarter value therefore keeps the asset's authored anchor. It is not
interpolated between the unrelated 0-turn and half-turn art bounds. Exact
higher-tier quarter adjustments still win when they exist.

Interradial end orientations use the established layer-2 placement identity.
This prevents them from falling through to an unrelated bare motion key.

## Visible turn number

`static/images/numbers/0.25.svg` composes the established digit shapes into a
`120 x 45` viewBox. The turn-tuple parser recognizes `0.25`, the shared width
calculator reports 120, browser and export renderers load the same path, the
glyph cache preloads it, and the MCP renderer reads its natural viewBox.

## Animation

Arrow transition direction uses the complete eight-state relative orientation
cycle. Adjacent Level 6 states animate across 45 degrees instead of falling
back to a 315-degree route. Opposite axes retain the explicit rotation
direction as the tie-breaker.

## Verification contract

- Resolver tests enumerate all valid relative and center orientation families,
  lowercase MCP tokens, skew `+` / `-`, legacy non-quarter paths, and float.
- Placement tests prove exact quarter values win and missing values preserve
  the canonical anchor.
- Rotation tests cover every motion family and prove full-arrow rotation
  remains turn-agnostic.
- Transition tests cover all eight adjacent orientation pairs.
- TKA glyph tests prove tuple parsing, number-path selection, and natural
  width.
- MCP rendering tests prove an interradial asset is selected after lowercase
  normalization and that both `0.25` number glyphs render.
- The asset census must contain exactly 32 well-formed `*_0.25.svg` files:
  Pro 4, Anti 4, Static 12, and Dash 12.
- Runtime review covers the 24-step SpiroAnim translation plus representative
  relative, skew, hash-in, hash-out, center-orientation, and prop-size cases.
