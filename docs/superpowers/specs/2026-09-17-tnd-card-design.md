# TnD Card

Date: 2026-09-17
Status: design approved in conversation ("send it"); ready for an
implementation plan
Companion: `2026-09-17-generate-card-morph-design.md` supplies the card
that grows into its workspace. Build that first; this spec adds the fourth
host card and the engine work behind it.

## Problem

Hand relationship lives inside Customize as a drill of four hand-rolled
radio rows (Mirrored, Flipped, Unison, Opposite) plus an Inverted toggle and a
Match turns toggle. The names describe location maps, not what the user
hears when they think about timing and direction. The shape matrix and Fuse
already name the same six relationships as Timing x Direction chips with
element accents (Together Same is Earth, and so on). The generate screen
says "Mirrored" where the rest of the app says "Together Opposite (Air)".

Two more gaps:

- The engine has four hand relationship maps: identity, rotate 180, reflect
  north-south, reflect east-west. Quarter timing (Sun, Moon) has no map, so
  the third row of the grid cannot be offered.
- Nothing constrains the props. The user can ask for hands that move
  Together Same and get props spinning Split Opposite, because the prop
  relationship only falls out of turns and start orientations after the hand
  path is chosen.

## Decision

A top-level bento card named **TnD** on `/create/generate`, one row with
LOOP. It carries two 3x2 Timing x Direction grids, one for Hands and one for
Props, each with a Free option. The engine satisfies the hand condition, the
prop condition, or both. Customize loses its Hand relationship drill.

### Vocabulary

Hands and props share the six modes and their elements. `TnDMode` values are
`"TS" | "TO" | "SS" | "SO" | "QS" | "QO"` (the shape matrix `VtgMode` set),
resolved to element accents and icons through `MODE_FAMILY_ID` and
`TND_BY_FAMILY`.

Hand mode is the geometric relation between the two hand paths on the grid:

| Mode | Element | Location map          | Was      |
| ---- | ------- | --------------------- | -------- |
| TS   | Earth   | identity              | Unison   |
| TO   | Air     | reflect north-south   | Mirrored |
| SS   | Water   | rotate 180            | Opposite |
| SO   | Fire    | reflect east-west     | Flipped  |
| QS   | Sun     | rotate 90 (cw or ccw) | new      |
| QO   | Moon    | reflect on a diagonal | new      |

Prop mode is the relation between the two prop bearings and spins:
direction is same spin or opposite spin; timing is where the props sit in
their circles relative to each other (Together, Split, Quarter), per the VTG
glossary in `packages/vtg-domain`.

## User-facing behavior

### The card

Collapsed, the card shows two lines: "Hands: Together Same" over its Earth
accent and "Props: Free", each line carrying the element icon when a mode is
set. `colorKey` follows the hand element when set, else the prop element,
else the neutral card color. Tour header "Timing and direction", tour span
matching LOOP.

### The panel

Opened through the card morph, the panel holds two sections, Hands and
Props. Each is a `TnDModeGrid` (below) preceded by a Free chip. Under the
Props grid sits the existing Match hand turns toggle, moved out of
Customize, disabled and forced on while a prop timing is set (the constraint
needs equal turns; see Engine).

Rules the panel enforces so the engine never receives a contradiction:

- Hand QS and QO chips are disabled when LOOP is set to a transform the
  quarter maps do not commute with (see LOOP compatibility). The chip's
  tooltip says which LOOP setting blocks it.
- Nothing else is cross-disabled. Hands and props are independent inputs,
  and every prop mode is available at every level: start orientations carry
  the phase and equal turns keep it (verified at level 1 on 2026-09-17:
  Unison in/in gave Together Same on every shift beat, Opposite in/out the
  same).

### Customize

The Hand relationship drill, `HandRelationshipPanel.svelte`, the Inverted
toggle and the Match turns toggle leave Customize. Customize keeps its
remaining drills. The primary checkout has an uncommitted edit to
`HandRelationshipPanel.svelte`; the implementation branches from `main` and
retires the file, so that edit is superseded, not merged.

### Shared `TnDModeGrid`

The 3x2 radiogroup inside `FuseTnDModePicker.svelte` (six
`RelationshipChoiceChip`s in `GRID_ORDER`, element accent and icon per chip,
`ariaLabel` "Together Same, Earth (TS)") lifts into
`src/lib/shared/shape-matrix/components/TnDModeGrid.svelte` with the same
`selected`, `disabled`, `onpick` props plus `disabledModes?: TnDMode[]` and
`reasons?: Partial<Record<TnDMode, string>>` for per-chip disabling. Fuse's
picker becomes a thin wrapper over it. The generate panel uses it twice.

## Config

`generate-models.ts`:

```ts
handRelationship: "free" | TnDMode; // was HandRelationship
propRelationship: "free" | TnDMode; // new
matchHandTurns: boolean; // unchanged
// handRelationshipInverted: removed
```

`generator-persistence-normalizer.ts` migrates stored configs and presets:
`mirrored` becomes `TO`, `flipped` becomes `SO`, `unison` becomes `TS`,
`opposite` becomes `SS`, anything else becomes `free`;
`handRelationshipInverted` is read once for the migration (below) and then
dropped; a missing `propRelationship` becomes `free`.

Inverted is no longer a user input. Inversion is derived at config-mapping
time from the two selections:

```
inverted = isReflection(handMap) XOR (propDirection === "opp")
```

when a prop mode is set, and `false` (the engine's natural sense: reflection
gives opposite spin, rotation gives same spin) when props are Free. This is
the prop-direction law the harness verified on 2026-09-17 (355 opposite-spin
beats, 0 exceptions with match on): the props spin opposite exactly when the
hand map is a reflection or the relationship is inverted, not both. A stored
`handRelationshipInverted: true` with a legacy hand relationship migrates to
the prop direction that reproduces it (`TO`, `SO` inverted gave same spin,
so `propRelationship` becomes `TS`; `TS`, `SS` inverted gave opposite spin,
so it becomes `TO`). Prop timing is not recoverable from a legacy config and
stays Together in those two cases; that is the only lossy migration and it
only affects users who had Inverted on.

`hand-relationship.ts` in `shared/create/domain` shrinks to the mode-to-map
table, `handModeToEngine`, `isReflectionMode`, and
`describeHandRelationship` for the card and summaries. `HAND_RELATIONSHIPS`,
`relationshipReflectionAxis`, `TND_ROW_LABELS`, `ELEMENT_ROW_LABELS` and the
`MATCH_HAND_TURNS_*` copy retire with the drill. Consumers re-key from the
census in the plan: `generate-config.svelte.ts`, `config-mapper.ts`,
`generation-orchestrator.ts`, `generate-actions.svelte.ts`,
`loop-type-utils.ts`, `card-configurator.ts`, `card-registry.ts`,
`panel-coordination-state.svelte.ts`, `CardBasedSettingsContainer.svelte`,
`ConsolidatedLOOPCard.svelte`, `CustomizeCard.svelte`, `loop-card-display.ts`,
`loop-expanded-overlay-model.ts`, MotionPathExplorer on the guide route, and
their tests.

## Engine

### Hand maps for Quarter

`HandRelationshipMap` gains `rotate-90-cw`, `rotate-90-ccw`,
`reflect-northeast-southwest`, `reflect-northwest-southeast`.
`HAND_RELATIONSHIP_LOCATION_MAPS` takes the four tables from
`loop/detection/pair-relation.ts` (ROTATE_90_CW, ROTATE_90_CCW) and
`loop/placement-maps/strict-loop-placement-maps.ts`
(REFLECTION_LOCATION_MAPS northeast-southwest, northwest-southeast).
`REFLECTIONS` grows by the two diagonals so `spinRelates` keeps working.
`HandRelationshipConstraint` needs no other change: `couldSatisfy` is
per-candidate, so quarter maps prune the same way the four existing ones do
(verified: 0 violations across 1,152 constrained steps with the existing
maps; the quarter maps follow the same code path).

QS has two senses (cw, ccw) and QO two axes. The app picks: when a start
placement is pinned, the sense whose map sends the right hand's start
location onto the left's; otherwise a random sense per build so consecutive
generations differ. The engine takes a fully specified map.

Box mode note: on the box grid, rotate 180 and the two diagonal reflections
coincide on the four diagonal locations for some letters, so a box QO
sequence can also read as SS by the classifier. This is geometry, not a bug;
the card shows what the user selected.

### Prop relationship constraint

New `constraintOptions.propRelationship?: PropRelationshipOptions`:

```ts
interface PropRelationshipOptions {
  direction: "same" | "opp";
  timing?: "tog" | "split" | "quarter";
}
```

`PropRelationshipConstraint` (hard, `constraints/style/`) rejects a
candidate step whose two shift motions would spin in the wrong relation.
Rotation direction is settled at candidate time for shifts (pro/anti and the
hand path fix it), so this is a per-candidate check like the hand
constraint. Dash and static motions spin whichever way the turn materializer
gives them, so the constraint passes them through and the materializer
enforces direction there (below).

When `timing` is set, the constraint also rejects letters whose two motions
fall in different motion classes (one shift with one dash or static). The
harness showed those steps drift the phase by a quarter (a shift changes
bearing by 90 degrees plus turns; a dash or static changes it by turns
only), which would break the timing invariant mid-sequence. Excluding them is
the v1 rule; a later version can allow them in pairs that cancel.

`SequenceBuilder` wires it into the hard constraint set next to
`HandRelationshipConstraint`, and `eligibleStarts` filters the same way.

### Turns and materialization

- `TurnAllocator`: when `propRelationship.timing` is set, `matchHands` is
  forced on and `"fl"` is removed from the level 3 pool. Equal, non-float
  turns keep the phase relation an invariant across the sequence (same spin:
  `b_L - b_R` constant; opposite spin: `b_L + b_R - pi` constant, the VTG
  reading where Together means both props pass the downbeat at once).
  Verified: 253 of 253 opposite-spin shift steps hold the sum invariant.
- `TurnMaterializer`: when `propRelationship` is set, the left hand's dash
  and static `forcedRotationDirection` derives from the right hand's
  materialized direction and the requested relation, regardless of
  `matchHandTurns`. Today that forcing only runs under
  `matchedHandRelationship`, which is why match-off runs showed 35 dash/dash
  steps with the wrong spin.
- Start orientations: when `timing` is set and the caller passes no
  `leftStartOrientation`, `postProcess` derives the left start orientation
  from the right one and the required phase (`tog` 0, `quarter` pi/2,
  `split` pi) using the bearing table, before `OrientationPropagator` runs.
  A caller-supplied pair that contradicts the timing is an error in
  `BuildResult.constraintReport`, not silently overridden.

### Post-build validation

`postProcess` classifies every beat with the engine-side classifier (below)
and records a `propRelationship` entry in `constraintReport` with the count
of beats that hold and the first offending index, in the same shape the LOOP
validation report uses. A beat the classifier reads as float (a zero-turn
dash or static, or a float turn) has no prop relation and is exempt; it
neither holds nor offends. The builder retries the beam once on a failure, then
returns the best sequence with the report so the app can show "Props
constraint not fully met" the way it already shows LOOP shortfalls.

### Engine-side classifier

`packages/sequence-engine/src/generation/prop-relationship.ts`, exported
from `@tka/sequence-engine/generation`:

- The bearing table (location angle plus radial orientation index, the same
  numbers `angle-calculator.ts` and `orientation-angle.ts` use).
- `classifyPropRelationship(left, right)` returning `float`,
  `direction-only`, or `full { direction, timing }`.
- Timing: same spin uses `b_L - b_R`; opposite spin uses `b_L + b_R - pi`
  measured against South. A step whose start and end phase land in different
  timing classes returns `direction-only`.

The app's `shape-matrix/domain/prop-relationship.ts` keeps its exports and
delegates the geometry to the engine function, so the shape matrix, choreo
cards, viewer cells and exports all read the same classification. A parity
test asserts the engine bearing table equals `mapOrientationToAngle(o,
mapPositionToAngle(l))` for all 64 orientation and location pairs.

Flagged consequence: today's app classifier measures opposite-spin timing by
the bearing difference, which the harness showed is not an invariant under
opposite spin (196 of 355 opposite-spin beats change class within a
sequence). Switching to the sum reading changes the prop element label on
some existing opposite-spin sequences in the shape matrix, choreo cards and
exports. The change is correct per the VTG glossary and is the only way the
generate constraint and the display can agree. The plan includes a fixture
run over the community sequence set to count how many labels move.

### One or both

| Hands | Props | Engine receives                                   |
| ----- | ----- | ------------------------------------------------- |
| mode  | Free  | `handRelationship` only, `inverted: false`        |
| Free  | mode  | `propRelationship` only; hand paths unconstrained |
| mode  | mode  | both; `inverted` derived as above                 |
| Free  | Free  | neither (today's default)                         |

Props-only builds have no `matchedHandRelationship`, so the materializer's
new forcing path must not depend on it.

## LOOP compatibility

A hand map M is compatible with a LOOP transform T when they commute
(T after M equals M after T), because the LOOP validator checks the
transformed sequence still holds the hand relationship. Involutions commute
with each other on this grid; rotate 90 does not commute with the reflections.

| Hand mode | LOOP keeps                                                    | LOOP loses                |
| --------- | ------------------------------------------------------------- | ------------------------- |
| TS, SS    | everything                                                    | nothing                   |
| TO, SO    | today's rules (`resolveLoopConfig` coerces the axis)          | unchanged                 |
| QS        | rotated halved and quartered, invert, rewind                  | mirrored, swap, own-axis  |
| QO        | rotated halved (180), the same diagonal, swap, invert, rewind | quartered, the other axes |

A pure `tndLoopCompatibility(handMode, loopConfig)` helper in
`loop-type-utils.ts` returns the allowed components; `resolveLoopConfig`
coerces to them (extending today's `relationshipReflectionAxis` coercion)
and `loop-expanded-overlay-model.ts` feeds them into `disabledComponents`
with a reason. The TnD panel reads the same helper in reverse to disable QS
and QO chips when the current LOOP setting cannot keep them.

## Registry and layout

`card-registry.ts` adds `tnd` with `tourHeader: "Timing and direction"`,
`helpId: "tnd"`, `colorKey` resolved from the selection, `slot` next to
`loop`, not hidden at beginner. `card-configurator.ts` builds its descriptor
the same way it does for `loop`. Layout rows follow the companion spec: TnD
and LOOP share a row at every level.

## Verification

- Engine tests (`packages/sequence-engine`): quarter maps in the hand
  constraint (one fixture per new map); `PropRelationshipConstraint` on
  shift pairs, mixed-class exclusion with timing, pass-through without
  timing; allocator forces equal non-float turns with timing; materializer
  forces dash and static spin with props-only options; start orientation
  derivation per timing; classifier unit tests for the sum and difference
  readings; a generation test per row of the One or both table asserting the
  post-build report shows zero offending beats at levels 2 and 3 on both
  grids.
- Harness rerun: `tnd-harness.ts` extended with `PROPS=` and the six hand
  modes, reporting hand and prop classes per beat; the acceptance number is
  0 hand violations and 0 prop violations on every configuration that
  succeeds, and the set of configurations that fail to build is listed in the
  plan's report.
- App tests: normalizer migration table; derived inversion; `TnDModeGrid`
  disabling and labels; `tndLoopCompatibility` matrix; card summary lines;
  the bearing parity test; snapshot of prop element labels over the fixture
  sequence set before and after the classifier change, with the diff
  reported.
- Browser: the seven-viewport matrix for the new card and panel (new
  surface), a generate at level 2 with hands TO and props SS confirming the
  workspace's shape matrix reads the same elements, and Fuse's picker
  unchanged.

## Follow-ups (not in this spec)

- Constrained builds lean on dash letters; a soft constraint that penalizes
  consecutive dashes under a TnD selection.
- Allowing mixed-class letters in cancelling pairs under prop timing.
