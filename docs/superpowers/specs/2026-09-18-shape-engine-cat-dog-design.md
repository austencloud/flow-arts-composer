# Shape Engine Cat Dog Mode Design

Date: 2026-09-18
Status: approved for implementation

## Problem

The app's prop is a pair (`leftPropType`, `rightPropType`, `catDogMode` in
settings). Shape Engine holds one `propType`, saved in its own snapshot,
defaulting to staff, with its own picker. Opening the Create module's Shape
tab therefore ignores the prop the user chose everywhere else, and a user
who spins a staff and a fan (cat dog mode) cannot see that pair in the
matrix, the Drill, or the Theory surface at all.

## Decisions

- The Shape tab follows the app's prop pair and writes back to it. One
  source of truth; picking a prop inside Shape changes it in Construct and
  everywhere else, the same as the Construct prop sheet does.
- Shape Engine draws the left hand with the left prop and the right hand
  with the right prop on every surface: matrix cells and axis headers, the
  Drill and its realizations, the Theory surface, the live ratio stage,
  share links, and the public `/shape-engine` route.
- The engine's geometry stays composed from single-prop builds. A mixed
  pair is two cached single-prop matrices stitched together, so existing
  single-prop callers keep working and switching one hand reuses the other
  hand's warm cache.
- Picking uses the app's existing hand-aware panel (`AnimationPanel`
  `handProps`: Cat Dog chip plus Left/Right segments), as the sequence
  viewer does. No new picker.
- A separate spec, after this lands, audits every other app surface that
  still collapses the pair to one prop.

## Engine prop model

`ShapeMatrixPropPair = { left: PropType; right: PropType }`.

App state (`shape-matrix-app-state.svelte.ts`):

- `leftPropType`, `rightPropType` replace `propType`. The `propType` getter
  is removed so every consumer fails to compile until it names a hand.
- `catDog: boolean` says whether the hand segments are shown. It starts
  true when the restored pair differs and false otherwise. `toggleCatDog()`
  turning it off folds the right hand onto the left, the same collapse
  Settings performs; turning it on changes nothing until a hand is picked.
- `propHand: "left" | "right"` is the hand the picker addresses while
  `catDog` is on. `setPropHand(hand)` sets it. It resets to `"left"` when
  cat dog turns off.
- `setPropType(prop, hand?)` with `hand` defaulting to `propHand` when
  `catDog` is on and `"both"` otherwise. Equal pairs are a no-op. A change
  reloads the matrix for the new pair and, on success, syncs the snapshot
  and notifies `onPropPairChange` (see Shape tab sync).
- `adoptPropPair(pair, catDog)` sets the pair and the flag without syncing
  the snapshot or notifying. Used by the settings-backed source only.
- `togglePropPicker` / `closePropPicker` / `propPickerOpen` are unchanged.

Snapshot (`ShapeMatrixAppSnapshot`):

- `leftPropType: PropType` and `rightPropType: PropType` are written.
- `propType?: PropType` stays on the type as a legacy read: a snapshot
  without the pair fills both hands from it, or staff when it is absent.
  It is never written again.
- `restoreState` skips the pair when the app has a prop source (below).

Share URL (`src/routes/(public)/shape-engine/_state/shape-matrix-url.ts`):

- `prop` keeps meaning the left hand, so existing links stay valid.
- `rp` is the right hand, written only when it differs from `prop`,
  deleted otherwise. Reading: `rp` absent means both hands are `prop`.
  Unknown values fall back exactly as `prop` does today.

## Geometry: composed per hand

`loadShapeMatrix(props, options)` accepts a `PropType` (unchanged for
single-prop callers such as Tunnel's source picker, the VTG lab modal, and
the test route) or a `ShapeMatrixPropPair`.

- A single prop, or a pair whose hands are equal, is the existing single
  build, cached under `${prop}|${geometryKey}` as today.
- A mixed pair awaits the two single builds and composes a
  `ShapeMatrixData` whose `left` map comes from the left prop's build and
  `right` map from the right prop's build. Composition is cheap (the maps
  are lazy) and is not cached separately.

`ShapeMatrixData` changes:

- `props: ShapeMatrixPropPair` replaces `propType?`.
- `tips: { left: TipPoint; right: TipPoint }` replaces `tipPoint?`. With
  `trace: "hands"` both are the hand point, as today.
- `reach: { left: number; right: number }` is the per-hand radial reach.
- `clubTipDx` stays and equals `Math.max(reach.left, reach.right)`. Every
  painter, the Theory pane, and the Theory detail scale by it, so cells,
  headers and the diagonal keep one shared scale. Under a mixed pair the
  diagonal no longer overlaps into one purple flower; a staff and a fan
  trace different sizes, which is the truth of cat dog mode.

Artwork cache keys (`shape-matrix-artwork.ts`) include both props:
`${props.left}|${props.right}` in place of `${propType}`.

## Realization pipeline honours both tips

The cell overlay the Drill hands to `buildModeRealizationCandidates`
carries `tips: { left, right }` in place of `tipPoint`. Down the pipeline:

- `verify-realization-parity.ts` `realize()` passes the mandala calculator
  `MandalaTipOverrides` `{ left: [tips.left], right: [tips.right] }` with
  `tipEnds: 1`. The calculator already supports independent per-hand tips.
  The numeric form of the parameter (`TipPoint | number`) is replaced by
  the pair type; the one internal caller that passed a number passes the
  pair.
- `solve-prop-relationship-phase.ts` and `build-realization-cards.ts`
  take the same pair. Review cards keep rendering clubs on both hands on
  purpose (their comment explains why); they build their overlay with the
  club tip on both sides.

Drill layers carry `leftPropType` and `rightPropType`; the animation
player options and the step rail receive the real pair instead of the same
prop twice.

## Theory surface and live stage

`ShapeMatrixLiveRatioStage` props change from `propType`, `propReach`,
`tipAngle` to `leftPropType`, `rightPropType`, `propReach: { left, right }`,
`tipAngle: { left, right }`. It already loads one sprite per side; each side
now loads its own prop. Trail and stick maths read the hand's own reach and
tip bearing.

`ShapeMatrixTheoryDetail` derives per-hand tip angles from
`shapeMatrixTipPoint(hand prop)` and per-hand reach from `data.reach`,
falling back to the standard staff reach for both while data loads, as
today. `ShapeMatrixTheoryPane` keeps scaling its tiles by `data.clubTipDx`.

## Picker

Every `AnimationPanel` the engine mounts (Drill, Focus workspace, Customize
workspace, Theory detail) receives:

- `selectedPropType`: the addressed hand's prop (`propHand` while `catDog`
  is on, left otherwise).
- `onPropChange`: `(prop) => app.setPropType(prop)`.
- `handProps`: `{ catDog, hand: propHand, leftPropType, rightPropType,
onToggleCatDog: app.toggleCatDog, onHandChange: app.setPropHand }`.

The Focus workspace's inline `BentoPropGrid` (the `propsOpen` branch) shows
the same `CatDogToggle` and `SegmentedControl` above its heading, wired to
the same state, so the two picking surfaces behave identically.

The Focus workspace's `selectedName` reads the addressed hand's label, or
"Staff / Fan" style pair text when `catDog` is on and the hands differ,
matching `viewingPropLabel`.

## Shape tab: two-way with settings

`ShapeMatrixApp` gains an optional `propSource` prop:

```ts
export interface ShapeMatrixPropSource {
  readonly left: PropType;
  readonly right: PropType;
  readonly catDog: boolean;
  set(pair: { left: PropType; right: PropType; catDog: boolean }): void;
}
```

- Settings to engine: an `$effect` in `ShapeMatrixApp` reads
  `propSource.left/right/catDog` and calls `state.adoptPropPair`, which is
  a no-op when nothing changed and never persists or notifies.
- Engine to settings: the state's `onPropPairChange` dependency, which
  `ShapeMatrixApp` wires to `propSource.set` when a source exists. Only
  user actions inside the engine (`setPropType`, `toggleCatDog`) trigger it.
- `restoreState` skips the pair when a source exists, so settings beat
  stale tab state.

`ShapeEngineTab.svelte` (the Create tab) builds the source from
`getSettings()` and `updateSettings({ leftPropType, rightPropType,
catDogMode })`. The `.shape-engine-tab` host is unchanged. The standalone
`/shape-engine` route passes no source and keeps its pair in the URL.

The persistence adapter (`shape-engine-persistence.ts`) is unchanged in
shape: the snapshot still records the pair, and the tab ignores it on
restore because a source exists.

## Engine consumers in the app

- `ShapeMatrixTunnelSourcePicker` loads `{ left: settings.leftPropType,
right: settings.rightPropType }` instead of the default staff, so Tunnel's
  drill shows the user's pair too.
- `ShapeMatrixDrillModal` (VTG lab) and `src/routes/test/shape-matrix` stay
  single-prop through the unchanged single-prop call.

## Testing

Unit (vitest, existing `tests/unit/shape-matrix` folder and the Create
tests):

- `loadShapeMatrix` with a mixed pair: `left` map equals the left prop's
  single build map, `right` equals the right prop's, `reach` per hand,
  `clubTipDx` is the max; an equal pair returns the single build object.
- App state: `setPropType` under `catDog` addresses `propHand`; without it
  sets both; `toggleCatDog` off folds right onto left and resets
  `propHand`; `adoptPropPair` neither syncs nor notifies; `setPropType`
  notifies `onPropPairChange`.
- Snapshot restore: legacy `propType` fills both hands; a pair restores as
  is; restore with a source leaves the pair alone.
- URL codec: `rp` round trip, absent `rp` means both hands equal `prop`.
- Parity: `findExactParityCandidates` with per-hand tips finds exact
  matches for a mixed pair on the existing engine-contract fixture.
- Shape tab source: settings change reaches the engine; engine pick writes
  `updateSettings` with `catDogMode` derived from the pair.

Browser, task worktree on a task-owned port, guest session with a seeded
staff/fan pair in settings storage:

- Axis headers trace two sizes and the drill pictographs show a staff on
  blue and a fan on red.
- The Props page shows the Cat Dog chip on and the Left/Right segments;
  picking a club for the right hand updates the matrix and the stored
  settings pair.
- Cat Dog off folds to staff on both hands and the settings pair follows.
- `/shape-engine?prop=staff&rp=fan` restores the pair standalone; the share
  link carries `rp`.
- Viewports 1440x900 and 375x667 for the picker surfaces.

## Out of scope

- Per-hand path shapes or per-hand levels; the pair shares everything but
  the prop.
- The app-wide audit of single-prop collapses (next spec).
- Any change to the review cards' club-both-hands rendering.
