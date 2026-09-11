# Choose Start picker

Date: 2026-09-11
Status: approved (Austen, prototype reviewed at `/test/choose-start`)

## Problem

The "First Step" tool asks the user to tap the step that should play first.
Pictographs draw props at their end locations, so the pose visible on tile N
is where the hands are after beat N. Someone scanning the workspace for the
pose they want to start from taps the tile showing that pose and gets the
wrong step: the one that _arrives_ at the pose, not the one that leaves it.

## Decision

Rename the tool to "Choose Start" and make every tile a pose. Tapping a tile
makes that pose the sequence start. The underlying transform
(`shiftStartPosition(sequence, targetStepNumber)`, "this step becomes step 1")
is unchanged; the picker translates a tapped tile into the target step.

## Semantics

Tile index 0 is the start tile; step tile N shows the pose after beat N.

| Tap              | Loop sequence                             | Non-loop sequence                                    |
| ---------------- | ----------------------------------------- | ---------------------------------------------------- |
| Start tile       | no-op, "That's already the start."        | same                                                 |
| Step N, N < last | step N+1 becomes step 1, 1..N move to end | confirm, then steps 1..N removed, N+1 becomes step 1 |
| Last step        | no-op, "That's already the start."        | refused, "Nothing would be left after this step."    |

The Alt+F shortcut (`shift_start` with step 2) and the dispatcher are not
touched; they already express "rotate by one".

## Picker mode visuals

While picking, step tiles drop everything that says "beat": arrows, TKA
letter, turns column, step number, reversal dots, position glyph, TnD,
elemental, duration, and path-shape glyphs. Only the grid and props remain, so
the row reads as poses. The start tile keeps its glyphs so it still reads as
the current start. Tile positions do not move.

Implementation: `PictographRenderer` takes a `poseOnly` prop. It drives the
glyph components' existing `visible` props (each fades with its own
transition), hides the step number, and fades the arrows group and the
duration/path-shape layers with a renderer-scoped opacity transition, since
`ArrowSvg` unmounts on `showArrow`. `PictographContainer`, `StepCell`,
`WorkspaceGrid`, and `StepGrid` (`posePicker`) pass it through so the grid
never reaches into renderer internals. `prefers-reduced-motion` disables the
transition. The cyan glow already on the wrapper stays.

## Copy

- Button: "Choose Start". Active: "Choosing Start".
- Enter toast: "Tap the pose you want to start from."
- Confirm dialog: title "Start from here?", body "Steps 1 through N will be
  removed.", buttons "Cancel" / "Set Start".
- Success: "New start set." Non-loop appends " Removed N steps."
- Help card (`shift-start`): name "Choose Start", short "Pick the start pose",
  full: "Changes where the sequence starts. While choosing, every tile shows
  only its pose. Tap the pose you want to start from and the sequence reorders
  to begin there. Sequences that don't loop drop the steps before it."

## Surfaces

- `first-step-analyzer.ts`: input is the tapped tile index, output carries the
  `targetStepNumber` the transform expects plus the steps that will be removed.
  Gets a unit test file.
- `sequence-actions-orchestrator.ts`: `analyzeShiftStart(tileIndex)`,
  `shiftStart(targetStepNumber)`, result message from the analyzer.
- `SequenceActionsPanel.svelte`: start tile routes into the shift handler with
  index 0; toasts and confirm wiring use the new copy.
- `SequenceDisplay.svelte`: start-tile click honours shift mode; strip-down
  CSS.
- `MobileActionToolbar.svelte`, `SequenceTransformActions.svelte`,
  `transform-help-content.ts`, `FirstStepConfirmDialog.svelte`: labels.
- Fuse (`FuseSourceCard.svelte`): same tile-to-target remap and last-step
  no-op. Fuse sources are always loops so there is no confirm path. Picker
  toolbar copy updated. `FuseLivePathGrid` takes `posePicker` and renders
  its step tiles pose-only; the drawer picker (`FuseFirstStepPanel`) passes
  `posePicker` through `ChoreoCard`, `CardGridLayout`, `CellRenderer`, and
  `LiveCardPictograph` so its card tiles read as poses too.
- `/test/sequence-actions` review variant label follows the rename.

## Out of scope

Rendering boundary poses as their own tap targets. Revisit only if tapping
step tiles for poses proves confusing in use.
