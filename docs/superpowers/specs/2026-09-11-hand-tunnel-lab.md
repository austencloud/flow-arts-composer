# Hand Tunnel Lab

Route: `/test/hand-tunnel`. Code: `src/lib/features/lab/hand-tunnel/` and
`src/routes/test/hand-tunnel/`.

## Why

Ryan asked for a way to see several performers stacked in one wall plane, each
running a different timing-and-direction hand path, and to change any
performer's TnD and placement and watch the composite. His first target: two
mirrored split-opps behind a tog-opp. Then three or four performers, up to
eight eventually. Hand paths only; assigning prop letters to those paths is a
later layer.

## Model

Every TnD is a closed four-beat loop, so all performers share one four-beat
playhead. A performer differs only in which loop it runs and how the loop sits
on the grid:

```ts
interface Segment {
  fromBeat: number; // always 0 in the single-segment lab
  tnd: "ss" | "ts" | "so" | "to" | "qs" | "qo";
  rotation: 0 | 1 | 2 | 3; // quarter turns clockwise
  mirror: boolean; // east and west swap, and so do the hands
  flip: boolean; // north and south swap, hands stay put
  phase: 0 | 1 | 2 | 3; // which beat of the loop the performer is on at beat 0
}
interface Performer {
  id: string;
  label: string;
  segments: Segment[];
}
```

`segments` is a list so a later version can switch a performer's TnD at a beta
node mid-sequence without changing the shape of saved state.

Rotation and phase are separate parameters. They coincide for tog-same and
split-same, but for the opposite-direction modes "start at alpha instead of
beta" is a phase change, not a rotation.

Known redundancy: rotating a tog-opp a quarter turn produces a side-beta path,
which by TKA's card definitions reads as split-opp. The lab shows the TnD the
user picked, not a derived one.

## Geometry

`hand-path-reference-cards.ts` now exports `HAND_PATH_REFERENCE_MOVES`, the
six raw five-row waypoint tables the cards, learn lessons, and printed decks
build from. The lab reads those and never re-authors them.

`build-hand-tunnel-sequence.ts` turns a segment into a `HandPathCycle` (five
points per hand, closed) and then into a hand-path `SequenceData` on
`PropType.HAND`. Transforms are pure location maps applied in a fixed order:
flip, mirror, rotate, phase. Direction reversals from flip and mirror come free
from remapping the points; nothing reasons about clockwise or
counterclockwise.

Ryan's dictated trio checks out against the canonical cards without special
casing: A is the tog-opp card as-is, B is the split-opp card flipped, C is B
mirrored. Tests pin those waypoints.

## Page

One `AnimatorCanvas`, hands only, performer 0 as the base layer and the rest
as `additionalLayers`. `tunnelSpectrum` gives each performer its own hue;
`tunnelSelectedLayer` spotlights the selected card and dims the others, and
clicking the card again clears the spotlight. Per-layer prop state comes from
`interpolatePropAngles` at the shared playhead, the same way
`/test/prop-tunnel` does it.

Transport: play, pause, step back, step forward (steps snap to whole beats and
pause so a beta can be inspected), speed, grid toggle. A readout names every
performer's hand position at whole beats (`β S`, `α W·E`, `γ N·E`).

Rail: one card per performer, up to eight. Hue swatches, `PathMiniViz` for each
hand, the six TnD buttons with their elemental icons from `TND_BY_FAMILY`,
Rotate, Mirror, Flip, Phase −/+, Remove. Add performer copies the selected (or
last) performer's segment.

Presets: Ryan's trio, Ryan's quad, Stacked tog-same, One performer. State
persists to `localStorage` under `tka_hand_tunnel_lab`; Share writes it into
the URL hash and copies the link.

## Not in scope

Mid-sequence TnD changes, prop letters on the hand paths, and a derived TnD
label after rotation. The state shape leaves room for the first two.
