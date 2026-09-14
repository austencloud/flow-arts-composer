# Disassembled canvas fit and Side by Side divider

Date: 2026-09-14. Status: approved for implementation.

## Problem

Disassembling an animation canvas splits it into a hero plus two single-hand
canvases. `AnimatorCanvas` has two arrangements for that: `stacked` (hero over
the pair, a 2:3 block) and `sidecar` (hero beside a column of the pair, a 3:2
block). Every host except Shape Matrix gets the default `stacked`, and the
`auto` chooser routes anything under a 1.15 aspect ratio to `stacked`. The
Side by Side viewer pane is close to square, so the stack takes 56% of the
pane width and the rest is black. The same default hits every other host.

## Design

### 1. The canvas fits itself (every host)

- `disassemblyLayout` defaults to `"auto"`. Explicit `stacked`/`sidecar` still
  win.
- `auto` compares outcomes instead of aspect: for the measured host box it
  computes the hero size each arrangement yields (stacked: `min(W, (H-c)*2/3)`;
  sidecar: `min(2W/3, H-c)`, `c` = header + transport chrome) and takes the
  larger. Ties go to `stacked`.
- While disassembled, the arrangement re-resolves as the host box settles
  (existing ResizeObserver). A flip needs the other arrangement to win by at
  least 10% so a divider drag near break-even cannot flap.
- Non-fill hosts get the sidecar width rule they were missing (the 3:2 block
  bounded by pane width and usable height); the hero cell squares itself with
  `aspect-ratio` so the column width, not `100cqw`, drives its height.
- Whatever is left over stays centered letterboxing.

Pure logic lives in `animation-engine/services/disassembly-arrangement.ts`
with unit tests using real pane boxes from the report screenshot.

### 2. Side by Side divider (viewer only)

- `ViewerSplitPane` enables the `PanelGroup` handle between the animation and
  card panes, both directions, when the viewer is unfocused, not in Practice,
  and not on mobile.
- Limits: each pane keeps at least `MIN_VIEWER_PANE_REVEAL_SIZE` (240 px) and
  at least 25% of the split axis, so the share stays within 25–75%.
- `resolveViewerPanelLayout` accepts `userSplitFraction` (animation share) and
  uses it in place of `[1, 1]`. Focus (`[1,0]`/`[0,1]`) and Practice's own
  fraction keep priority, so destination-box and card-solve logic is unchanged.
- The fraction persists per device in localStorage (`tka-viewer-split`), one
  value per direction. Double-clicking the handle resets to 50/50.
- The viewer does not auto-widen the pane on disassembly; the user drags.

## Verification

- Unit: arrangement chooser (hero sizes, tie, hysteresis), layout resolver
  with fraction and priorities, prefs clamp/load.
- Browser at the report viewport: disassemble in Side by Side shows sidecar
  with the hero larger than before; dragging the divider grows the hero and
  the card shrinks; reload keeps the split; double-click resets.
