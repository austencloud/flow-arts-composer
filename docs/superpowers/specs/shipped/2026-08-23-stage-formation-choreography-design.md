# Stage Formation Choreography — Design

**Date:** 2026-08-23
**Status:** Shipped. All five phases are complete as of 2026-08-26; Phase 5's
proof pass was absorbed into `2026-08-26-one-stage-design.md` Phase 7. Header
corrected and the file moved out of `active/` on 2026-09-13 — it still read
"Approved" while Phases 1–4d had already landed in `1b32c668ff`, `7b0091bdc8`,
`183fa4cd7f`, and `b80d793708`.

**Reconciliation evidence (2026-09-13):** `Formation`/`FormationSpot` are the
live model (`src/lib/features/stage/components/SetProperties.svelte:11`,
`services/tika-director-executor.ts:39` transforms formation spots). The retired
per-performer `Mark[]` chain survives only in
`src/lib/features/stage/domain/formation-migration.ts`, which is the legacy
migration path Phase 4d specified, not a second live model.

**Originally approved:** Austen approved Approach A and the four-section design
in conversation, 2026-08-23
**Supersedes:** the per-performer mark-chain movement model in
`2026-08-20-stage-performance-runtime-design.md` (the runtime's facing/walk-style
semantics, playhead clock, and rig ownership all carry forward unchanged).
**Related research:** `docs/superpowers/specs/backlog/2026-05-25-stage-locomotion-design.md`
(historical FormationKeyframe model; superseded but directionally aligned).

## Why

The Stage editor's mental model is marching band drill: formations are the unit
you move between. Poker chips on the ground — each performer walks to their spot
in a specific number of counts, usually 8 or 16, and the whole cast arrives
together. Austen's canonical example: a triangle with one performer downstage
center; in the final 16 counts of a 64-step sequence, that performer steps
backward while the two back performers step forward — a reverse triangle.

Today's data model cannot say that. Each `Performer` carries `marks: Mark[]`, a
chain of relative walk-durations, and a "formation" is a coincidence of N
separate chains staying in sync. If one performer's durations total 40 beats and
the rest total 48, the triangle silently stops being a triangle — nothing in the
model knows a triangle was intended. The existing "apply preset" flow
(`stage-choreography-state.svelte.ts:380-431`) spends ~50 lines of splice
arithmetic faking a group keyframe on per-performer chains, which is the
compile-down trap this design removes.

Decision (Approach A of three considered): **formations become the authoritative
data model.** Per-performer mark chains retire. Formation-as-authoring-layer
(compile to marks) was rejected as a two-sources-of-truth trap; coexisting
tracks were rejected as paying for two models forever.

## Data model

`Performer.marks` is removed. `StageChoreography` gains one ordered list:

```ts
interface StageChoreography {
  // ...existing fields unchanged (bpm, stage size, performers, clips)...
  formations: Formation[]; // sorted by atBeat; formations[0].atBeat === 0
}

interface Formation {
  id: string;
  label?: string;                // "Opening", "Set 2" — optional
  atBeat: number;                // absolute beat the cast must be IN PLACE
  transitionBeats: number;       // counts of walking that END at atBeat (0 = opening/snap)
  spots: Record<string, FormationSpot>; // keyed by performer id
  presetId?: FormationPresetId;  // provenance; flips to "custom" once a spot is dragged
}

interface FormationSpot {
  x: number;                     // stage-space, same convention as old Mark
  z: number;
  facingAngle?: number;          // undefined = walk-style default
  walkStyle: WalkStyle;          // "crab" | "direct", per performer per transition
  easing: EasingType;
}
```

### Timing semantics (arrive-by)

- A formation is **held** from its `atBeat` until the next formation's walk
  begins at `next.atBeat - next.transitionBeats`.
- The **walk** into formation `i` occupies
  `[atBeat - transitionBeats, atBeat]`, interpolating each performer from their
  spot in formation `i-1` to their spot in formation `i`, with that spot's
  easing. Straight-line paths in this slice.
- The triangle example is two rows of data: opening triangle at
  `atBeat: 0`, reverse triangle at `atBeat: 64, transitionBeats: 16`.

### Invariants (enforced by state mutations, clamped on edit)

1. `formations` stays sorted by `atBeat`; no two formations share an `atBeat`.
2. `formations[0]` has `atBeat: 0, transitionBeats: 0` (the opening set).
3. `transitionBeats <= atBeat - previous.atBeat` — a walk cannot start before
   the previous set is reached.
4. Every formation has a spot for every performer; adding a performer backfills
   spots into all formations (at that performer's default preset position);
   removing a performer strips their spots.
5. `atBeat` and `transitionBeats` are whole beats.

### Defaults

New formation: `transitionBeats: 8` (16 one tap away). Spots seed from either
the current sampled cast positions ("keyframe what I see") or a preset from the
existing 17-generator library in `formation-presets.ts` (which is reused
unchanged — it already produces per-performer positions from
preset × count × stage size).

Everything stays in beats, so a BPM change re-times the whole drill to any song.
No audio subsystem is added in this slice; the existing beat clock is the
music-awareness.

## Runtime

`stage-performance-sampler.ts` is rewritten to consume formations:

- `samplePerformerPerformance(performer, choreography, beat)` becomes
  `sampleFormationPerformance(choreography, performerId, beat)` (or keeps its
  name with a changed signature — implementer's choice, but ALL callers are
  inside `src/lib/features/stage/`, verified by grep 2026-08-23).
- Segment lookup: binary/linear scan of `formations` for the hold-or-walk
  segment containing `beat`; interpolate with `applyStageEasing`; derive
  `speedMetersPerSecond` with the easing derivative exactly as today.
- **The `StagePerformanceFrame` output contract does not change** (position,
  `bodyFacing`, `travelDirection`, `moveDirection`, speed, `isMoving`,
  `transitionProgress`). `activeMarkIndex` is renamed `activeFormationIndex`.
  The crab/direct facing rules (`segmentFacing`), stage→world mapping, and
  easing math carry over verbatim.
- Downstream consumers (StageViewer rig driving, locomotion/motion-matching
  subsystem, dodge planner, video export) are untouched: they read frames.
- `formation-interpolator.ts` helpers (`computeMarkDistance`,
  `computeMarkSpeed`) are reworked in formation terms or folded into the
  sampler; `MarkProperties.svelte` becomes the per-spot/per-transition
  properties panel (walk style, easing, facing — same controls, new subject).

### Legacy migration

A pure converter `marksToFormations(performers): Formation[]` runs in the
choreography loader when a stored project has `marks` and no `formations`:

- Collect the union of arrival beats across all performers' chains.
- Create a formation at each arrival beat; each performer's spot = their old
  chain sampled at that beat (using the existing sampler math, kept private to
  the converter).
- `transitionBeats` = the gap since the previous arrival beat, clamped by
  invariant 3; walkStyle/easing taken from the mark active at that arrival.
- Best-effort by design: chains that were deliberately desynchronized flatten
  into more formations. Stage projects are young; this is acceptable and is
  covered by a unit test with a mixed-duration fixture.

## Editing

### Formation track (StageTimeline)

One new row above the performer lanes:

- Each set renders as a **block** at its anchor spanning its hold; the walk in
  renders as a visually distinct **ramp** spanning `transitionBeats` and ending
  at the anchor.
- Drag a block → move `atBeat` (whole-beat snap, invariants clamp).
- Drag the ramp's leading edge → retime `transitionBeats`.
- Click → select the formation (selection lives in `stage-edit-mode`); the
  top-down overlay switches to drill-chart editing for it.
- An add control at the playhead creates a formation there (seeded per
  Defaults). Delete/Backspace removes the selected formation (never the
  opening set).
- Built from the timeline's existing patterns and shared primitives — no new
  hand-rolled selector chrome; transition-count quick-pick (8/16) uses
  `SegmentedControl` or `FilterChipBase` per `chip-primitives.md` routing.

### Drill-chart overlay (FormationOverlay)

When a formation is selected:

- Its spots render as draggable chips (poker chips) in performer colors.
- The previous formation's spots render ghosted, with travel arrows previous →
  selected, so the move reads like a drill chart.
- Dragging a spot sets `presetId` to `"custom"`.
- The preset picker in `StageSidebar` now writes/reseeds the **selected
  formation's spots** instead of splicing marks.

### Undo/redo

All formation mutations go through the existing history in
`stage-choreography-state.svelte.ts` (same snapshot mechanism the mark
mutations use today).

## Out of scope (named, not forgotten)

- Collision/dodge wiring during transitions (the `locomotion/dodge/` planner
  exists; paths are derivable from this model later).
- Curved paths; deterministic foot phase; foot-planting quality — owned by
  `@austencloud/scene-3d` `PerformerRig` per the runtime spec's ownership table.
- The Blossom feet-below-floorboards bug (assigned to another agent).
- Audio import / beat detection.
- Per-performer "released from formation" free paths (the escape hatch is
  designed-for — a future `released: boolean` span on a spot — but not built in
  this slice).

## Verification contract

- Unit: `tests/unit/stage/stage-performance-sampler.test.ts` rewritten against
  formations (hold/walk boundaries, easing speed, crab vs direct facing,
  before-first/after-last clamps); new converter test with a desynchronized
  fixture; `stage-choreography-state.test.ts` extended for formation CRUD +
  invariant clamping; `formation-interpolator.test.ts` updated or retired with
  its module.
- Contract: `stage-module-contract.test.ts` stays green.
- End-to-end proof: the triangle → reverse-triangle move authored in the
  editor and played back — the downstage-center performer walks upstage while
  the two back performers walk downstage over the final 16 counts, sequences
  still playing. Screenshot/recording evidence per
  `visual-verification-mandatory.md` (all required viewports for the new
  timeline row; visual verification is done by the main session, never
  delegated).
- `npm run check` green; scoped commits per `commit-only-your-own-changes.md`.

## Implementation phases (each independently verifiable)

1. **Domain:** `Formation`/`FormationSpot` types; sampler rewrite; legacy
   converter; unit tests. No UI. (`stage-types.ts`,
   `stage-performance-sampler.ts`, new `formation-migration.ts`, tests.)
2. **State:** formation CRUD + invariants + selection in
   `stage-choreography-state.svelte.ts` / `stage-edit-mode.svelte.ts`;
   preset-apply rewired; mark CRUD removed; tests.
3. **Timeline UI:** formation track row in `StageTimeline.svelte` (blocks,
   ramps, drag/retime/select/add/delete).
4. **Overlay UI:** drill-chart mode in `FormationOverlay.svelte` (ghosts,
   arrows, spot drag); `MarkProperties.svelte` → spot/transition properties;
   `StageSidebar.svelte` preset picker rewire.
5. **Proof pass:** author the reverse-triangle demo, full visual verification
   sweep, evidence, ship.

## Ledger

- [x] **Phase 1 — Domain.** `Formation`/`FormationSpot` in `stage-types.ts`;
      shared sampling math exported from `stage-performance-sampler.ts`; new
      `stage-formation-sampler.ts` and `formation-migration.ts`; new state
      seeds `formations` from the default marks so the beat-0 invariant holds
      from birth. Evidence: 50 stage tests green under
      `tests/config/vitest.config.ts`, including an equivalence test that the
      derived formation track samples identically to the mark sampler at beats
      0/2/4/7.5/8/12; `npm run check` 0 errors 0 warnings.
- [x] **Phase 2 — State.** Formation CRUD (`addFormation`, `removeFormation`,
      `moveFormation`, `setFormationTransitionBeats`, `setFormationLabel`,
      `updateSpot{Position,WalkStyle,Easing,Facing}`, `applyPresetToFormation`),
      a pure `normalizeFormations` in `domain/formation-invariants.ts` that every
      mutation routes through, formations in undo/redo snapshots,
      `setPerformerCount` keeping every formation complete, and
      `selectFormation`/`selectSpot` in `stage-edit-mode.svelte.ts`. Evidence: 59
      stage tests green under the CI config; `npm run check` 0 errors 0 warnings.
      **Carry-in for Phase 4:** every mutation calls `normalizeFormationTrack()`,
      which replaces the whole `formations` array with fresh objects — a
      component holding a `formation` or `spot` reference across a mutation gets
      a stale object, so drag handlers must re-find by id each frame.
      **Resequenced:** the phase list above says Phase 2 removes mark CRUD. It
      does not. `FormationOverlay.svelte` and `MarkProperties.svelte` still call
      `addMark`/`updateMarkPosition`/`updateMarkBeats`/`updateMarkWalkStyle` and
      are not rewritten until Phase 4, so removing it here would leave the app
      broken between commits — against this section's own promise that each
      phase is independently verifiable. Formation CRUD is added alongside the
      mark model; removal moves to the end of Phase 4.
      Carry-ins: `snapshotHistory`/`restoreHistory` in
      `stage-choreography-state.svelte.ts` do not include `formations`, so
      undo/redo must be extended before formation editing lands. Crab travel
      whose previous spot has no `facingAngle` resolves to 0 (audience-facing)
      rather than a true carried facing — acceptable default, revisit if
      chained crab sets need to hold an angled facing.
- [x] **Phase 3 — Timeline UI.** `1b32c668ff`. A SETS row above the performer
      lanes in `StageTimeline.svelte`: a set renders as a marker anchored on its
      count and sized by its own label, with a hairline rail for the hold and a
      tapered arrowheaded bar for the walk into it. Drag to retime a set, drag
      its leading edge to resize the walk, keyboard equivalents on the block.
      Evidence: 59 stage tests green under the CI config; `npm run check`
      0 errors 0 warnings; screenshots read at 1920, 2560, 3840, 1440, 820,
      960x412 and 375.
      **Findings the screenshots caught that the numbers did not:** the set was
      first sized by its hold, which is legitimately 0 in the default document,
      so Set 1 collapsed to a 54px stub reading "S… 0"; `--theme-accent`
      resolves to pink here and made the spine read as a fifth performer lane;
      the ramp read as a divider until it got an arrowhead; and a 44px in-flow
      resize handle outweighed the label on a 72px marker.
      **Carry-in for Phase 4:** the track's `--formation-accent` is a hardcoded
      cool cyan for the reason above — the overlay's ghosts and arrows should
      consume the same variable rather than the theme accent, so the two
      surfaces agree on what "a set" looks like.
      **Noted, out of scope:** at 3840 the whole Stage editor chrome is small,
      because the root font ramp in `app.css` is scoped to `html:has(.mkt-shell)`
      / `html:has(.legal-container)` and app modules are a different regime. The
      formation row matches `.clip-name` exactly, so it is no worse than its
      siblings; ramping app modules is a cross-cutting change for its own task.
- [x] **Phase 4a — Read paths.** `7b0091bdc8` (Codex, verified by the main
      session). `maxTotalBeats`, `currentStep`, `totalSteps`,
      `beatMarkerPositions` and `performanceFrames` all derive from
      `choreography.formations` through `sampleStageFormations`. Mark CRUD is
      left intact but no longer read. `maxTotalBeats` now includes the last
      formation's `atBeat`, which the mark path had been dropping.
- [x] **Phase 4b/4c — Overlay and properties.** `183fa4cd7f`.
      `FormationOverlay.svelte` is a real drill chart: one `pxPerMetre` for both
      axes, letterboxed and centred, with chips, labels, grid dots and arrows
      all derived from it. `MarkProperties.svelte` is deleted and replaced by
      `SetProperties.svelte` (counts to get there, 8/16 quick counts, walk
      style, pacing, spot readout, remove-set). `active-formation.ts` is the
      single owner of which set is active — pinned selection wins, otherwise the
      playhead decides — consumed by the chart, the sidebar and the panel.
      `CountStepper.svelte` replaces the ad-hoc performer-count buttons.
      Evidence: 60/60 stage tests under the CI config; `npm run check` 0 errors
      0 warnings; drag proved with synthesized pointer events (a chip moved
      6.0×4.0 → 4.9×4.8 and Ctrl+Z restored it exactly); screenshots read at
      1920, 2560, 3840, 1440, 820x1180, 960x412 landscape and 375x667.
      **Findings the screenshots caught that the numbers did not:** the chart
      was anisotropic by 2.4× (174.9 px/m across, 72.1 px/m upstage), which
      fails the one job a drill chart has; the chart was undersized inside its
      pane and the grid was too faint to read as ground; the caption sat
      marooned over the cast at 960×412 and left dead rail everywhere wide; a
      short walk drew a 7px arrow stub reading as a smudge, and the first fix
      over-corrected into a large head on a 5.7px shaft because the marker is
      sized in stroke-widths; chips stayed 22px while the chart doubled at
      3840; and the 44px touch floor piled the whole cast into one blob at
      960×412.
      **Fixes worth carrying forward:** the touch target is a transparent
      22px-minimum circle separate from the 9px-minimum drawn chip — the same
      hit-zone/visible-grip split Phase 3 used for the transition handle. Below
      a 13px chip the performer's letter moves outside the dot. The caption
      lives in the letterbox rail when `originX >= 190`, so isotropy costs no
      usable space.
      **Also fixed here (pre-existing, module-wide):** undo was dead everywhere
      in Stage. `undoStack`/`redoStack` were plain arrays, so the `canUndo`
      getter never notified `EditHistoryShortcutBridge` and its
      `disabled={!canUndo}` kept Ctrl+Z inert regardless of edit count. They are
      `$state` now. Found while verifying that the new chip drag was undoable.
- [x] **Phase 4d — Retire the mark model.** `b80d793708` (Codex, then corrected
      and extended by the main session). The legacy model has one home:
      `formation-migration.ts` owns `Mark`, `LegacyPerformer` and
      `samplePerformerPerformance`, so persisted pre-formation documents still
      load and nothing else in the module can reach marks by accident. That also
      broke the circular import the first split created, and let `segmentFacing`
      type against `FormationSpot` — what its only live caller actually passes.
      The default document authors its two formations directly instead of
      authoring marks and migrating them, which additionally lets it set
      `presetId`; the Shape picker had been showing "custom" for a document that
      is plainly a line. Deleted: the six mark mutators, `createMark`,
      `totalBeatsForPerformer`, `Performer.marks`, `selectedMarkId`/`selectMark`,
      `sampleStagePerformance`, and `formation-interpolator.ts`.
      **Two corrections to the Codex pass, both caused by a loose brief:** it was
      told to keep `insertFormationAtPlayhead`'s "formation half", but that
      function was pure mark mutation with zero callers — it rewired a dead
      function onto live `addFormation` behaviour, which is worse than leaving it
      inert, because the next caller would get behaviour nobody designed or
      verified. Both it and `applyPreset` are deleted. It also kept the default
      formation ids as `migrated-formation-*` when nothing migrates them any
      more. Lesson for future briefs: say "delete if unreferenced", not "keep
      behaviour identical", when the behaviour under discussion may itself be
      dead.
      **Found while verifying in the browser (not by any test):** `.stage-sidebar`
      is a column flex container with `overflow-y: auto`, so its sections shrank
      below their content instead of the sidebar scrolling, and
      `CollapsibleSection`'s `overflow: hidden` clipped the remainder. The
      performer chips were cut in half, the `CountStepper` was gone entirely, and
      the "Reseeds Set 1." caption was laid out 78px below the bottom of the box
      that contained it. Fixed with `flex: none` on the sidebar's children. This
      was invisible to the Phase 4b/4c sweep because that sweep screenshotted the
      drill chart and never opened the Stage setup popover — a reminder that
      "seven viewports" only covers the surfaces actually on screen.
      Evidence: 58/58 stage tests; `npm run check` 0 errors 0 warnings; the
      default track still renders line → v-shape at count 8; sidebar scrolls with
      full-size sections at 1920 and 960x412.
- [x] **Phase 5 — Proof pass.** Discharged by `2026-08-26-one-stage-design.md`,
      which states in its header that it supersedes the Stage half of this
      design and that "its Phase 5 proof pass becomes Phase 7 here". One Stage's
      Phase 7 is checked: the reverse-triangle demo (final 16 counts of a
      64-step sequence, downstage-centre performer stepping backward while the
      two back performers step forward), the seven-viewport visual sweep, tests,
      and `npm run check`. Closed 2026-09-13 during spec reconciliation; the
      proof was performed there rather than here, not skipped.
