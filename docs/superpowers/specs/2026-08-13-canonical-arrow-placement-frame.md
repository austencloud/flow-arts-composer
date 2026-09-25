# Canonical Arrow Placement System

## Outcome

Arrow placement has one authored coordinate frame. Diamond and box remain display grids, but neither name owns placement data. A box pictograph resolves the same canonical adjustment as its diamond presentation and rotates the resulting screen-space vector 45 degrees clockwise around the pictograph center.

The canonical owner covers full-arrow position adjustments, arrow-glyph rotation flags, prop geometry, defaults, special placements, global overrides, and editor writes. Skewed motion remains a separate placement frame because it is not a rigid rotation of the canonical frame.

## Geometry contract

Let `C` be the pictograph center, `Pᴅ` a diamond anchor, and `Δᴅ` the final diamond adjustment after the directional-tuple transform.

```text
Pʙ = C + R45(Pᴅ - C)
Δʙ = R45(Δᴅ)
Aʙ = Pʙ + Δʙ = C + R45(Aᴅ - C)
```

The grid coordinator already supplies `Pʙ`, so the placement pipeline only applies `Δʙ = R45(Δᴅ)`.

Stored JSON and Firestore values are reference-frame values, not screen vectors. They must be processed with the diamond directional-tuple rules first. Rotating a raw stored tuple would be incorrect for motion types whose tuple transform depends on quadrant, direction, or orientation.

## Canonicalization boundary

For a box pictograph, the placement lookup context is normalized before any placement or rotation-override tier runs:

- `gridMode` becomes `diamond` on the pictograph and both motions.
- `startLocation`, `endLocation`, and `arrowLocation` rotate one 45-degree step counter-clockwise.
- letter, motion type, rotation direction, turns, orientations, prop types, and position group stay unchanged.
- the requested arrow location rotates one step counter-clockwise.

The complete placement cascade then runs in that canonical context:

1. global override
2. special placement
3. prop geometry
4. default placement
5. canonical directional-tuple transform
6. one 45-degree clockwise vector rotation when the displayed grid is box
7. manual per-pictograph adjustment in screen space

Diamond and non-rotational grid modes keep their existing behavior. Half-motion arrows keep their existing glyph-local path. Skewed beats follow the rule below.

## Skewed beats

Added 2026-09-24. A skewed beat mixes hands of three kinds: a hand that stays on the diamond points (cardinal start and end), a hand that stays on the box points (intercardinal start and end), and a hand that crosses between the grids. The first two kinds are ordinary Diamond and Box arrows, so each takes the anchor and the adjustment its own grid gives it:

- a diamond-point arrow uses the diamond anchors and the canonical frame unrotated;
- a box-point arrow uses the box anchors and the box canonicalization above: locations turn one step counter-clockwise and the final vector turns 45 degrees clockwise. The one difference is that `gridMode` stays `skewed` on the pictograph and both motions;
- an arrow that crosses between the grids keeps the skewed anchors and is not rotated.

Keeping `gridMode` skewed keeps the `skewed` placement-frame identity, so special, global, and prop-geometry data authored for skewed beats stays apart from canonical data. Before this rule, a box-point shift arrow in a skewed beat started from the skewed anchor, 62 px closer to the center than the box anchor, and took the legacy box directional tuples, so it could sit on top of its own prop (lettering review tile O2-11). Static and dash box-point arrows landed in the same place under both rules.

## Authoring and persistence

All placement editor identities and writes use the canonical context. A box arrow edit therefore addresses the same grid-neutral document and field as its diamond presentation.

WASD remains screen-relative:

1. rotate the requested box screen delta 45 degrees counter-clockwise;
2. invert the canonical directional-tuple transform;
3. save the resulting canonical reference-space delta.

Direct numeric inputs display and edit canonical reference values. Diagnostics name the canonical placement frame and grid-neutral static file.

Manual adjustment fields remain screen-space and pictograph-local. They are not rotated because they are applied after the calculated placement.

## Grid-neutral ownership

Display grid is forbidden in canonical placement storage:

- static assets live under `arrow_placement/default` and `arrow_placement/special`;
- canonical default filenames use `default_{motionType}_placements.json`;
- Firestore document IDs and override keys begin with the authored placement frame (`canonical` or `skewed`), never a display grid;
- schemas and repositories reject `diamond` and `box` as placement owners;
- rotation-override lookup canonicalizes the pictograph before it reads static or local data;
- regression tests and Firestore write rules reject display-grid asset paths, document IDs, and ownership fields.

Skewed data, when present, uses an explicit `skewed` placement-frame identity. It must not be folded into canonical storage until an independent transform and parity proof exist.

## Proof and regression coverage

Automated tests must prove:

- all eight perimeter locations round-trip between box and the canonical frame;
- vector magnitude is preserved by the 45-degree transform;
- a full box adjustment equals a rigidly rotated canonical adjustment for default and special-tier cases;
- diamond presentation output is unchanged;
- half-motion paths and skewed arrows that cross between the grids are unchanged;
- a skewed beat's diamond-point and box-point arrows land exactly where Diamond and Box put the same arrow;
- canonical special, global, default, and prop-geometry identities contain no display-grid segment;
- inverse WASD editing moves the rendered box arrow in the requested screen direction.
- static and dash glyph angles preserve the expected 45-degree presentation relationship;
- mirroring is identical for canonical-equivalent diamond and box contexts;
- rotation-override reads never request a diamond- or box-owned asset path;
- a canonical authoring write is read back by the production renderer under both display grids.

The visual proof surface ranks real legacy box-versus-canonical displacement and shows the worst cases side by side with the actual pictograph renderer. Each case includes the legacy position, the canonical rotated position, and the measured pixel correction.

## Retired surface

The diamond and box asset namespaces, grid-prefixed canonical document IDs, grid-prefixed override keys, duplicate box tuple branches, and parallel hardcoded adjustment processor are retired after migration proof passes. Display-grid code remains at the renderer boundary because it still owns anchors, prop presentation, and the final 45-degree transform.
