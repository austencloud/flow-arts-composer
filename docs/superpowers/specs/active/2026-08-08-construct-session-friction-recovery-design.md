---
status: active
value: null
effort: null
remaining: "Verify one-action prop activation and label behavior for Undo, Save, Clear, Play, Actions, and Share against current Construct UI."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Construct Session Friction Recovery

- **Date:** 2026-08-08
- **Status:** Phase 1 implemented and verified locally. Phase 2 approved and verified locally. Phase 3's shared preview engine and adaptive first-use interaction hint are implemented; pending-hold feedback remains separately gated. Phases 4 and 5 remain individually gated.
- **Origin session:** Noah Morgan, `019fd2c5-e0dc-71db-990f-4c0a7a1a0c30`
- **Routes:** `/create/generate` to `/create/construct`

## Outcome

Use one real Create session to remove four distinct sources of friction without
bundling their design decisions together:

1. Make the Props control tell the truth and respond on the first click.
2. Add adaptive text labels to Undo, Save to library, Clear, Play, Actions, and
   Share when their local workspace containers have enough room.
3. Retain hold-to-preview and give its 350 ms hold state visible, cohesive
   feedback.
4. Offer an on-demand, approximately 22-second Build demonstration that shows
   both placement and drag-to-aim.

After the shipped work is complete, send Noah one concise notification that
explains that observing the session led to the improvements. Do not represent
the session as feedback he submitted.

This document is an umbrella contract. Approval of one phase does not authorize
another phase. Visual work stops at its prototype gate for Austen's review
before production behavior is finalized.

## Session evidence

The evidence bundle covered all 273 reported events and all 20 exception
events. Repeated permission exceptions are one infrastructure failure pattern,
not 20 independent user failures.

Noah used desktop Safari on macOS at a 1470 by 868 CSS-pixel viewport. This was
not an iPhone or narrow mobile session. That distinction matters because the
current icon-only actions were visible in a desktop workspace that still did
not have enough local width to justify labels safely.

### Props

- Noah selected Ember Trail, opened Display, and clicked Props four times in
  about two seconds.
- After the first click, the panel reported Props, Left, and Right as active,
  but no props appeared after the renderer's fade window.
- `DisplayPanel.svelte` owns the visible Props chip through the animation
  visibility manager.
- `canvas-2d-animation-renderer.ts` renders props only when both
  `visibility.propsVisible` is true and `trailSettings.hideProps` is false.
- `animation-settings-state.svelte.ts` persists `trail.hideProps`, while the
  general Display panel neither exposes nor clears that second veto.
- Effects Lab is the only ordinary UI found that changes `hideProps`.

The session data does not expose Noah's local-storage value, so it cannot prove
that `hideProps` was true on his machine. The code does prove that the control
can report Props as active while the renderer suppresses them. That mismatch is
the root defect this phase must remove.

### Manual Build

- Noah entered Build, stayed for about eight seconds, and returned to Presets.
- The trail contains no grid-point press and no drag gesture during that visit.
- The real grid currently says, "Press a point and drag to aim the left prop,"
  but the disabled confirmation control does not demonstrate the gesture.

This is evidence of abandonment before first success. It does not prove why he
left, so the design must remain an optional teaching aid rather than a forced
interruption.

### Hold-to-preview

- Noah successfully invoked the contextual preview twice.
- The first preview became ready after 2307 ms. The second became ready after
  103 ms, consistent with a learned and useful interaction.
- `hold-to-audition.ts` applies `option-audition-pending` immediately and starts
  the preview after a 350 ms hold.
- Both option-card renderers style `option-audition-active`, but neither styles
  `option-audition-pending`. The waiting period is therefore visually silent.
- Tap selection now has a separate arrival animation in
  `PictographArrivalStage.svelte`.

Tap-and-arrive commits a choice. Hold-to-preview auditions a choice without
committing it. They solve different problems. Hold-to-preview stays.

### Save and action recognition

- Noah did not explicitly save the sequence to his Library before the session
  ended.
- Undo, Save to library, Clear, Play, Sequence actions, and Share are icon-only
  in the current workspace.
- Create already keeps a recoverable draft. A draft and a Library item have
  different meanings, so this work does not turn abandoned drafts into Library
  saves and does not add an exit prompt.

The first intervention is clearer action labeling where the layout can support
it. Save semantics remain unchanged.

## Decisions

| Area            | Decision                                                                            | Explicit non-goal                                                            |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Props           | Give effective prop visibility one truthful user-facing state and one command path. | Do not paper over repeated clicks with a debounce.                           |
| Action labels   | Label all six workspace actions only in proven roomy containers.                    | Do not use physical screen resolution or one global viewport breakpoint.     |
| Hold-to-preview | Retain it and add visible pending, active, cancel, and release states.              | Do not make a hold commit the option or duplicate tap arrival.               |
| Build teaching  | Add an on-demand isolated demonstration using the real placement grid.              | Do not mutate the user's live start pose or autoplay every time Build opens. |
| Saving          | Keep local draft recovery and explicit Library save as separate concepts.           | No automatic Library save and no leave-page confirmation in this scope.      |
| Closeout        | Reuse the existing notification pipeline with a targeted system announcement.       | Do not create a fake feedback item or request tester confirmation.           |

## Phase gates

| Phase | Work                         | Gate required before starting           | Gate required before shipping                                         |
| ----- | ---------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| 1     | Props visibility correctness | Approval of this phase                  | Runtime proof plus focused regression tests                           |
| 2     | Adaptive action labels       | Approval to build a visual prototype    | Austen approves the screenshots and recorded container thresholds     |
| 3     | Hold-to-preview motion       | Approval of the motion storyboard       | Austen approves the live prototype in normal and reduced motion       |
| 4     | Guided Build demonstration   | Approval of the storyboard and copy     | Austen approves the isolated live demonstration on desktop and mobile |
| 5     | Noah closeout notification   | All referenced improvements are shipped | Austen approves the exact final copy and the one-user delivery target |

No implementation phase begins automatically when the preceding phase ends.

### Current progress

- Phase 1 now routes both existing Display controls through
  `effective-prop-visibility.ts`.
- The conflicting persisted state is covered by four focused state tests and a
  browser component test that activates the real Props chip once.
- Phase 2 now has a local, unshipped adaptive-label implementation for all six
  workspace actions at a 768 CSS-pixel container seam. Its breakpoint tests,
  real-page measurements, and required viewport screenshots are complete and
  Austen approved the responsive result.
- Hold-to-preview now uses `PictographArrivalStage`, the same motion owner used
  by a committed tap, but stops before commit-only landing. A first-use
  teaching cue says `Tap to add` and `Hold to preview`. It appears in the
  workspace action rail below a 1536 CSS-pixel picker width and points to the
  first option only on genuinely roomy, native-4K layouts. The Construct guide
  repeats the distinction after the one-time cue is dismissed.
- The 350 ms pending-hold treatment remains a separate visual slice. Phases 4
  and 5 have not started.

## Phase 1: truthful Props visibility

### Behavior contract

The Display panel must represent effective prop visibility, not only one input
to the renderer.

- When the rendered props are suppressed by either the general visibility state
  or the trail-only preference, the Props chip reads off.
- Turning Props on is an explicit command to show props. It sets general prop
  visibility on and clears the trail-only veto through one canonical behavior
  owner.
- Turning Props off disables general prop visibility. It does not need to erase
  unrelated trail styling.
- Per-color Left and Right controls remain subordinate to the effective master
  visibility state.
- Canvas, exported playback, and any other renderer must consume the same
  resolved state.

`hideProps` may remain a stored effect preference if Effects Lab needs it, but
it may not silently contradict an active Props chip. The implementation should
introduce or extend one presentation command rather than teaching every panel
to coordinate two stores independently.

### Expected code scope

- `src/lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte`
- `src/lib/shared/animation-engine/state/effective-prop-visibility.ts` as the
  shared behavior owner for the resolved state and command
- the canonical animation presentation or settings state that will own the
  effective visibility command
- `src/lib/shared/animation-engine/state/animation-settings-state.svelte.ts`
  only if the owner belongs there
- renderer parameter resolution, including
  `src/lib/shared/animation-engine/services/canvas-2d-animation-renderer.ts`
- focused state and renderer regression tests

### Verification

The regression test starts from persisted `hideProps: true` with general Props
visibility true. It must prove all of these:

1. The Props chip initially reports the effective off state.
2. One activation changes the effective state to on.
3. The renderer receives a visible prop state after the normal fade interval.
4. Left and Right remain individually controllable.
5. Reloading preserves an internally consistent state.

Runtime verification must repeat Noah's path with Ember Trail and show props
after one click. A console or state trace must record both source flags and the
resolved result. Repeated clicking is not the success condition.

## Phase 2: adaptive workspace action labels

### Copy

- `Undo`
- `Save to library`
- `Clear`
- `Play`
- `Actions`
- `Share`

Accessible names can remain more specific, such as `Clear sequence`. The
visible wording above is the approved compact copy.

### Layout contract

The labels respond to available component width, not to device identity and
not directly to `window.innerWidth`.

- `ButtonPanel.svelte` owns the named `button-panel` inline-size container.
  Clear, Play, Actions, and Share use that container.
- The sequence top bar owns a named inline-size container for Save to library.
- The outer Create workspace owns a named inline-size container for Undo.
- Compact tier: icon-only controls with their existing accessible names and
  minimum touch targets.
- Roomy tier: icon plus visible label. The label is one line and its button has
  a stable width within the tier.
- The top bar keeps equal leading and trailing action tracks when Undo and Save
  expand, so the sequence word stays mathematically centered.
- The bottom Play control stays centered. Expanding Clear, Play, Actions, and
  Share may not invade its protected center zone or overlap one another.
- Tier changes are deterministic. There is no ResizeObserver-driven label
  toggle and no intermediate state that pushes adjacent controls during normal
  interaction.

A 4K panel is expected to qualify when its local Create workspace is roomy.
It may correctly remain icon-only when a sidebar, split view, browser zoom, or
narrow app column leaves insufficient local width. Conversely, a lower
resolution layout may qualify if the component genuinely has enough space.

### Breakpoint discovery protocol

The exact query thresholds are a prototype result, not a guessed pixel value.
For each of the top and bottom containers:

1. Measure the compact controls, labeled controls, gaps, padding, center safety
   zone, and longest approved English label at the computed root font size.
2. Find the first width at which the labeled tier has no overlap, clipping,
   wrapping, or center displacement.
3. Add a safety reserve of at least one control gap plus one root-relative text
   unit. Record the math in the implementation note.
4. Test the candidate threshold at minus 32, minus 1, exact, plus 1, and plus
   32 CSS pixels.
5. Test root-font outcomes from the active App Shell 4K scaling design. A rem
   query can cross at a different physical pixel width after root scaling, so
   the observed container state must be recorded.
6. Present the threshold table and screenshots to Austen. Production wiring
   waits for approval.

### Prototype matrix

Capture Construct with a populated sequence at:

- 1920 by 1080
- 2560 by 1440
- 3840 by 2160
- 1440 by 900
- 820 by 1180
- 960 by 412
- 375 by 667
- every threshold boundary listed above
- 200 percent browser zoom at one desktop size

For each frame, record the top-bar and bottom-panel container widths, active
label tier, `scrollWidth`, and center offset of the sequence word and Play
button. Acceptance requires no horizontal overflow and no visible center drift.

### Prototype result: 768 CSS pixels

The local implementation uses the same `min-width: 768px` seam for the named
`button-panel`, `sequence-workspace`, and `create-workspace` containers. The
query is deliberately in CSS pixels, so App Shell root-font scaling cannot move
the tier boundary.

At the roomy tier, the measured controls are 97.02 px for Undo, 159.19 px for
Save to library, 97.09 px for Clear, 106.27 px for Play, 112.88 px for Actions,
and 96.09 px for Share. Labels compute to 14 px on both the 2560 and 4K frames.
The root font remains 16 px, with 8 px icon gaps and 16 px inline padding.

The 192 px equal top-bar tracks provide the longest control with
`(192 - 159.19) / 2 = 16.405px` on each side. Adding the existing 8 px grid gap
leaves 24.405 px between Save and the word column, exceeding the required one
gap plus one root-relative text unit reserve of 24 px. Undo has 47.49 px on each
side of its equal track.

The bottom rail remains comfortable at the lower seam. The 768 px query also
uses the existing constrained-panel values: 18 px horizontal padding and a
10 px trailing-group gap. The trailing group is therefore
`112.88 + 10 + 96.09 = 218.97px`. Half of the panel minus its padding, that
group, and half of the 106.27 px Play control leaves
`384 - 18 - 218.97 - 53.135 = 93.895px` between Play and the trailing action
zone. The leading side leaves
`384 - 18 - 97.09 - 53.135 = 215.775px`. The centered word column retains
344 px and continues to use its existing fit-and-ellipsis behavior.

| Container width | Label tier | Undo / Save / Clear / Play / Actions / Share widths | Play offset | Word offset | Overlap |
| --------------- | ---------- | --------------------------------------------------- | ----------- | ----------- | ------- |
| 736 px          | Compact    | 44 / 44 / 44 / 50 / 44 / 44 px                      | 0 px        | 0 px        | None    |
| 767 px          | Compact    | 44 / 44 / 44 / 50 / 44 / 44 px                      | 0 px        | 0 px        | None    |
| 768 px          | Roomy      | 97.02 / 159.19 / 97.09 / 106.27 / 112.88 / 96.09 px | 0 px        | 0 px        | None    |
| 769 px          | Roomy      | 97.02 / 159.19 / 97.09 / 106.27 / 112.88 / 96.09 px | 0 px        | 0 px        | None    |
| 800 px          | Roomy      | 97.02 / 159.19 / 97.09 / 106.27 / 112.88 / 96.09 px | 0 px        | 0 px        | None    |

The populated Construct sweep produced these real local widths:

| CSS viewport / condition        | Bottom / top container | Label tier | Maximum center drift | Horizontal overflow |
| ------------------------------- | ---------------------- | ---------- | -------------------- | ------------------- |
| 1440 by 900                     | 681.67 px              | Compact    | 0 px                 | None                |
| 1698 by 1078 requested desktop  | 810.67 px              | Roomy      | 0 px                 | None                |
| 1920 by 1080                    | 928.84 px              | Roomy      | 0.01 px              | None                |
| 2560 by 1440                    | 1241.67 px             | Roomy      | 0 px                 | None                |
| 3840 by 2160                    | 1881.67 px             | Roomy      | 0 px                 | None                |
| 820 by 1180 tablet              | 808.67 px              | Roomy      | 0 px                 | None                |
| 960 by 412 mobile landscape     | 437.67 px              | Compact    | 0 px                 | None                |
| 375 by 667 phone                | 364 px                 | Compact    | 0 px                 | None                |
| 1920 by 1080 at 200% equivalent | 438.24 px              | Compact    | 0 px                 | None                |

The in-app browser sweep found no label, overlap, overflow, or centering errors.
Its isolated unauthenticated session logged one Firebase token-refresh network
error that did not affect the page. Six related browser component files pass
13 tests, including exact 767-to-768 tier assertions; `svelte-check` reports
zero errors and zero warnings. This remains unshipped until Austen approves the
screenshots and threshold.

### Expected code scope

- existing workspace button components: `UndoButton.svelte`,
  `ClearSequenceButton.svelte`, `ViewSequenceButton.svelte`,
  `SequenceActionsButton.svelte`, `WorkspaceShareControl.svelte`, and
  `SaveToLibraryButton.svelte`
- `StandardWorkspaceLayout.svelte`, `ButtonPanel.svelte`, and
  `SequenceDisplay.svelte`
- `workspace-button-layout.ts`, which already owns the canonical action names
- the existing shared Share trigger primitive if it needs an optional visible
  label

No parallel toolbar button component is introduced. The implementation extends
the existing controls.

## Phase 3: cohesive hold-to-preview motion

### Approved discoverability slice

The first-use hint is deliberately smaller than the pending-motion prototype:

- It says `Tap to add` and `Hold to preview` in both presentations.
- Below a 1536 CSS-pixel option-picker width, it rises from the empty center of
  the workspace action rail after a start pose exists and before the first
  movement is added. This opaque banner sits between Clear and Actions and
  never covers an option.
- At or above a 1536 CSS-pixel option-picker width in side-by-side layout, it
  becomes the original anchored cue and points to the first visible option.
- The threshold uses the measured picker container, not physical display size
  or a global viewport media query. Focused tests pin both the 1535 and 1536
  boundaries.
- Both presentations are absolute and nonmodal, so neither changes layout. The
  compact banner enters with a 12 px rise and fade; reduced motion removes the
  movement.
- It dismisses after the first option interaction or its explicit close button
  and records that dismissal locally.
- Adding the first movement removes the cue before Play enters the action rail.
- The public Level 1 guide suppresses the automatic hint because that surface
  already teaches its own interaction sequence.
- Step 2 of the optional Construct guide preserves the same explanation, so the
  distinction remains available after the one-time hint is gone.

Responsive verification covers 320×568, 375×812, 768×1024, 960×412,
1440×900, 1920×1080, 2560×1440, and 3840×2160 in the live Create route, plus
the 1535/1536 picker-container seam in focused tests. The compact layouts keep
the banner between the action buttons with no horizontal overflow and place the
option grid entirely below it. Native 4K retains the anchored presentation.

This approval does not include the pending progress halo or an active-preview
status label. Those remain behind their own live visual review.

### Interaction contract

- Pointer down enters a visible pending state immediately.
- Pending progress lasts the existing 350 ms hold duration.
- Moving beyond the existing 12 px tolerance, scrolling, pointer cancellation,
  window blur, or early release returns cleanly to idle and does not select the
  option.
- Completing the hold enters contextual preview without adding the option.
- Release returns to the picker without a late click.
- `Shift+Space` remains the keyboard audition shortcut, and Escape cancels it.

### Motion language

The audition and tap arrival share one animation owner, with different endings.

- Pending uses a restrained progress halo and press response around the source
  card. It communicates that continued pressure is doing work.
- Active audition uses `PictographArrivalStage` to animate the candidate from
  the current sequence endpoint to its completed pictograph, then holds that
  completed frame until release.
- Tap continues from that shared hold phase into grid landing and handoff.
  Audition never enters those commit-only phases and does not announce that a
  step was added.
- The contextual preview and the source card share one continuous visual state
  so activation does not look like an unrelated screen change.
- Release reverses the audition state with no flash, stale highlight, or layout
  jump.
- Reduced motion replaces travel and spring motion with an immediate outline,
  opacity change, and static preview state.

The prototype must compare at least two pending-halo treatments in the real
option picker. Austen selects the final treatment before it is wired into both
option-card renderers.

### Expected code scope

- `src/lib/features/create/construct/option-picker/services/hold-to-audition.ts`
- `OptionCard.svelte`
- `swipe-layout/components/OptionViewerSection.svelte`
- the existing option audition context and panel coordination state
- `PictographArrivalStage.svelte`, `StepGrid.svelte`, and
  `SequenceDisplay.svelte`
- removal of the obsolete AnimatorCanvas changed-transition preview branch
- `tests/unit/create/hold-to-audition.test.ts`
- a browser component regression test that proves audition reaches the completed
  motion frame and never begins grid landing

### Verification

- State tests cover pending, threshold completion, movement cancellation,
  release, click suppression, keyboard activation, and reduced motion.
- Runtime testing uses mouse, touch emulation, and keyboard.
- Screenshots capture idle, mid-hold, active preview, release, and cancellation.
- A tap still commits exactly once and runs the arrival animation. A hold never
  changes sequence length.

## Phase 4: on-demand guided Build demonstration

### Entry points

- A clear `How to build` action in the manual Build surface.
- A `Replay Build demo` action in Preferences near the existing Construct guide
  replay control.

Opening Build itself does not force the demonstration. The user requests it.

### Demonstration contract

The demonstration runs in an isolated modal on roomy screens and an
appropriately sized sheet on narrow screens. It uses the real
`PropPlacementGrid` with disposable local state.

The approximately 22-second storyboard is:

1. The pointer enters and hovers a valid left-prop point.
2. It presses, drags toward an orientation, and releases. The real grid halo,
   aim lines, prop preview, and orientation readout respond.
3. It repeats the interaction for the right prop.
4. The completed start pose is shown briefly.
5. The demonstration offers `Try it` and `Replay` and can be dismissed at any
   time.

The demonstration never writes to the live start pose, undo history, draft,
Library, or preferences beyond an optional local record that it was completed.
Closing it restores focus to the invoking control.

### Shared behavior ownership

- Reuse `PropPlacementGrid`; do not build an illustrated copy of the grid.
- Reuse `GhostPointer` and `createAttractGhost` for pointer presentation.
- Add one reusable drag-path primitive to the ghost motor. Do not script drag
  motion independently inside the modal.
- Route synthetic demonstration intent through an isolated adapter rather than
  dispatching trusted pointer events into the live workspace.
- Reuse the existing modal/sheet and Preferences action patterns.

The drag primitive needs a focused contract: move to origin, enter pressed
state, interpolate through a supplied path, expose progress to the isolated
grid adapter, release, and always clean up on cancellation.

### Accessibility and motion

- The modal or sheet has a name, description, close control, focus trap, and
  focus restoration.
- Narrated steps have text equivalents that update with the visual action.
- Pause when the document is hidden.
- Reduced motion uses manual, step-by-step states with `Next` instead of an
  animated pointer path.
- Replay starts from a clean disposable state.

### Review gates

1. Storyboard gate: static frames, timing sheet, and final UI copy.
2. Prototype gate: live isolated demo at desktop, tablet, portrait mobile, and
   landscape mobile sizes.
3. Production gate: only after Austen approves the live prototype.

### Expected code scope

- `BuildStartPosition.svelte` for the entry action only
- a focused demo component in the Construct tutorial or start-position feature
- `PropPlacementGrid.svelte` only for a reusable isolated-demo seam if needed
- `GhostPointer.svelte` and `attract-ghost.svelte.ts` for the shared drag motor
- `PreferencesTab.svelte`
- focused ghost-motor, demo-state, focus, and reduced-motion tests

## Phase 5: Noah closeout notification

### Delivery decision

Use the existing per-user notification and push pipeline with the existing
`system-announcement` notification type. Do not use `feedback-resolved`, because
that type requires a feedback item, deep-links to My Feedback, and asks the
tester to confirm a reported fix.

The notification is written once to Noah's user notification subcollection
with a deterministic ID derived from the source session. The write must be
idempotent, server-authorized, and limited to Noah's user ID. No feedback record
is fabricated.

### Draft copy

**Title:** Your session improved Create

**Message:** We watched how Create worked during one of your sessions. It led
to clearer actions, reliable prop controls, smoother option previews, and a new
Build guide. Thanks for helping improve TKA just by using it.

The final message lists only work that actually shipped. If a phase is declined
or materially changed, remove or rewrite that clause. Do not include click
counts, errors, the session ID, PostHog, or any language that suggests Noah
submitted feedback.

The final send requires:

1. proof that every named improvement is in production;
2. Austen's approval of the exact title and message;
3. a read-back of the single target user ID before the write;
4. proof that exactly one notification document exists and the push trigger
   accepted it.

The notification model, inbox item, preferences panel, and push dispatcher are
currently modified by another session. This phase must not touch or overwrite
those files. The proposed `system-announcement` reuse should avoid changes to
them, but their in-flight work must still be clear before delivery verification.

## Cross-spec dependencies

- `2026-08-06-pictograph-arrival-stage-design.md` owns committed-option arrival.
  Phase 3 coordinates with its motion language but does not replace it.
- `2026-08-06-app-shell-4k-lockstep-scaling-design.md` may change root font
  metrics at large viewports. Phase 2 measures against its actual shipped
  behavior before locking container thresholds.
- `2026-07-22-first-session-activation-design.md` covers broader activation and
  durable-save work. This spec does not create a second save path.

## Telemetry

Add only telemetry needed to tell whether each intervention works:

- effective Props state before and after a user command, including whether a
  hidden trail-only veto was cleared;
- action-label tier and owning container width when any of the six workspace
  actions is activated;
- audition pending, activated, canceled, and released, with pointer type and
  cancellation reason;
- Build demo opened, completed, dismissed, replayed, and entry source.

Do not capture raw pointer paths, notification message content, or additional
session-replay data for this work.

## Final acceptance

- Props become visible after one intentional activation from the conflicting
  persisted state.
- Undo, Save to library, Clear, Play, Actions, and Share gain labels only when
  their own containers meet measured, approved thresholds.
- No required viewport shows overlap, wrapping, horizontal overflow, or center
  displacement.
- Hold-to-preview remains reversible, gains immediate feedback, and stays
  distinct from tap arrival.
- The Build demonstration teaches both props and drag-to-aim in an isolated,
  replayable experience.
- Draft recovery and Library save semantics remain unchanged.
- Noah receives one accurate closeout notification only after the named work is
  live and the final copy is approved.
