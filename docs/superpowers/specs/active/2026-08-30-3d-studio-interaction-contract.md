---
status: active
value: null
effort: null
work_state: unverified
remaining: Exercise 3D Studio selection/delete and undo precedence across canvas, drill chart, inspector, and timeline lenses.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# 3D Studio Interaction Contract

Status: Active implementation contract  
Owner: 3D Studio / Stage  
Last reviewed: 2026-08-30

## Decision

3D Studio is one editor with several projections of the same versioned project. Hands, Floor, Motion, the drill chart, the performer inspector, Director, and JSON are not separate products and do not get separate selection or command models.

Every command acts on an explicit selected object. The playhead answers “when?” It never silently answers “what?” for a destructive command.

This rule resolves the reported failure directly: selecting performer C and pressing Delete removes performer C and that performer's authored rows from the Studio project. It must not remove sets or clips merely because the playhead intersects them. If the sequence picker is open, the picker owns the keyboard. Delete or Backspace edits the picker or its text input where applicable and never reaches the Stage behind the modal.

## Why this model

The current product already has the correct reusable owners:

- `StageChoreographyState` owns the Stage document and its undo history.
- `StageEditMode` owns editor selection.
- `StageTimeline` projects the document through Hands, Floor, and Motion lenses.
- `PerformerSpine` and the scene control workspace own performer appearance and prop controls.
- `SequencePickerModal` is the shared sequence chooser.
- the keyboard shortcut manager owns customizable global shortcuts.
- `BaseModal` owns modal focus and keyboard isolation.
- `Crossfade`, `createLayoutMotion`, and the shared motion tokens own structural animation.

The failure was not a missing timeline feature. It was an ambiguous selection model plus a Delete shortcut that fell back to the active formation at the playhead. Extending the existing owners keeps one renderer, one document, and one command path.

## Interaction vocabulary

These states must remain distinct in code and on screen:

| State            | Meaning                                           | May receive a command?              |
| ---------------- | ------------------------------------------------- | ----------------------------------- |
| Hover            | Temporary preview of what can be targeted         | No                                  |
| Keyboard focus   | The control that receives the next keyboard event | Yes, for that control               |
| Selection        | The durable object or objects the user is editing | Yes                                 |
| Playhead         | The current score time                            | Only time commands                  |
| Active playback  | What is being performed now                       | No implicit editing                 |
| Modal scope      | The temporary workspace in front                  | Yes; it blocks the editor behind it |
| Drag transaction | A preview between pointer-down and commit/cancel  | Yes, through the drag owner only    |

Focus and selection may coincide, but neither is inferred from the playhead. Hover never mutates the project.

## Selection grammar

Studio selection is a discriminated union, not several nullable fields that can disagree:

```ts
type StageSelection =
  | { kind: "none" }
  | { kind: "performers"; performerIds: string[]; anchorId: string }
  | { kind: "formation"; formationId: string }
  | { kind: "spot"; formationId: string; performerId: string }
  | { kind: "travel"; formationId: string; performerId: string }
  | { kind: "clip"; performerId: string; clipId: string };
```

The union can grow when Motion gains authored events, but it must never be replaced by view-local selection stores. Switching Hands, Floor, or Motion changes the projection, not the project identity.

## Command precedence

Input is resolved in this order:

1. An open modal, menu, text field, numeric field, or other focused editor owns its standard keys.
2. An active drag owns pointer movement and Escape until it commits or cancels.
3. A visible explicit selection owns object commands such as Delete, duplicate, nudge, and inspect.
4. A view owns non-destructive navigation such as zoom, pan, lens switching, and playhead movement.
5. A global command may run only when the focused surface has not claimed the event.

There is no playhead fallback for Delete. No selection means no destructive action.

## Canonical input behavior

### Pointer and touch

- Click or tap selects the visible object under the pointer.
- Shift-click toggles performer membership in a multi-selection. Removing the final selected item clears selection; there is no hidden anchor.
- Clicking empty canvas or empty timeline space clears object selection only when the gesture is not a seek, pan, marquee, or drag.
- Double-click is reserved for a labeled drill-in action that is also available through a visible button or Enter. It never hides an essential command.
- Touch has the same commands through visible controls and sheets. Nothing depends on hover.
- Hover can preview an affordance or reveal a tooltip. Keyboard focus must reveal the same information.

### Dragging

- The dragged object follows the pointer without easing.
- The UI previews the pending result while the underlying history records one transaction.
- Releasing commits once. Escape restores the exact pre-drag state.
- Snapping is a Studio-level preference, visible and persistent. A temporary modifier may bypass it during one drag.
- The cursor, target highlight, numeric readout, and snap guide communicate what will be committed.
- Insertion, removal, and survivor recomposition animate through the canonical layout motion system after commit.

### Keyboard

- Delete and Backspace act on the explicit selected object described below.
- Escape cancels the topmost transient state in order: drag, popover, modal, then selection.
- Enter activates or opens the focused object.
- Space activates the focused button or selected widget. It controls transport only when no interactive control has claimed it.
- Arrow keys belong to the focused local control before they belong to the playhead. Shift applies the documented larger or smaller increment for that control.
- Tab order follows visual reading order. Focus remains on the nearest surviving peer after deletion.

### Motion and feedback

- Accidental geometry movement is prevented by reserving space.
- Intentional structural movement uses `Crossfade`, `PanelGroup`, `animate:flip`, or `createLayoutMotion` with shared durations and easing.
- Pointer-following motion is direct. Reduced-motion preferences collapse transitions to the accessible final state.
- A successful destructive edit produces concise feedback naming the object and its undo path.
- A refused edit explains the invariant, for example: “A scene needs at least one performer.”

## Delete contract

| Explicit selection         | Delete / Backspace result                                                                          | History and focus                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| One performer              | Remove that performer, their Hands clips, Floor spots/travel, and future Motion events by identity | One undo entry; select nearest surviving performer                                  |
| Several performers         | Remove exactly those performers unless that would leave zero                                       | One undo entry; select nearest survivor                                             |
| Hands clip                 | Remove that clip only                                                                              | One undo entry; keep its performer selected                                         |
| Formation / set            | Remove that set only                                                                               | One undo entry; opening set is protected                                            |
| Floor travel interval      | Reset that performer's custom departure, arrival, and step override to Auto                        | One undo entry; keep the travel selected                                            |
| Drill-chart spot           | Do not delete the required spot                                                                    | Explain that each performer needs a spot; offer move/reset through visible controls |
| Motion event               | Remove the selected authored event when Motion becomes editable                                    | One undo entry; keep its performer selected                                         |
| Library sequence in picker | No Stage deletion                                                                                  | Picker selection remains in the modal                                               |
| Text or number input       | Native text deletion                                                                               | Field-local undo behavior                                                           |
| Nothing                    | No-op                                                                                              | No toast, no history entry                                                          |

Explicit trash buttons resolve through the same command path. They do not call state mutation functions independently.

## Surface contract

### Guided start

| Target         | Pointer / touch     | Keyboard                        | Result                                            |
| -------------- | ------------------- | ------------------------------- | ------------------------------------------------- |
| Starter choice | Select card         | Arrows or Tab, then Enter/Space | Advance one animated decision                     |
| Back           | Activate button     | Enter/Space                     | Return one decision without losing prior choices  |
| Finish         | Activate button     | Enter/Space                     | Seed the same `StudioProjectV1` consumed by Stage |
| Existing scene | Activate named path | Enter/Space                     | Load through the existing migration path          |

The modal is centered, focus-contained, and keyboard-isolated. Each step announces and focuses its heading after the canonical transition.

### 3D canvas and camera

| Target           | Pointer / touch                          | Keyboard                                 | Result                                                    |
| ---------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Performer        | Click/tap                                | Enter from the accessible performer list | Select performer and open the existing performer controls |
| Empty stage      | Drag/pinch or click based on active tool | Camera controls                          | Orbit/pan/zoom or clear selection, never both             |
| Formation marker | Select and drag                          | Nudge controls                           | Author position through Stage state                       |
| Camera preset    | Activate visible control                 | Enter/Space                              | Change view, not project selection                        |

Direct canvas picking must map to the same performer and spot identifiers used by the rail and timeline.

### Performer rail and inspector

| Target             | Pointer / touch                                | Keyboard                              | Result                                                                                   |
| ------------------ | ---------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Numbered performer | Click; Shift-click for group                   | Enter/Space; Shift modifier for group | Select exact performer(s) and open shared prop, effort, effects, and appearance controls |
| Add performer      | Activate button                                | Enter/Space                           | Add through Stage document owner                                                         |
| Remove performer   | Select then Delete, or explicit labeled action | Delete/Backspace                      | Apply performer delete contract                                                          |
| Inspector setting  | Direct manipulation                            | Native control keys                   | Change the selected performer through the existing 3D control owner                      |

### Hands lens

| Target     | Pointer / touch                                               | Keyboard                                  | Result                                  |
| ---------- | ------------------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| Clip body  | Select; drag to move                                          | Enter selects; arrows nudge when authored | Edit one clip                           |
| Clip edge  | Drag to resize                                                | Documented resize keys                    | Change duration through one transaction |
| Loop       | Activate explicit control                                     | Enter/Space                               | Toggle only that clip                   |
| Trash      | Activate explicit control                                     | Enter/Space                               | Delete only that clip                   |
| Empty lane | Click to seek or open add flow according to active affordance | Enter on Add                              | Never imply performer deletion          |

### Floor lens and drill chart

| Target                     | Pointer / touch                    | Keyboard                             | Result                                                                             |
| -------------------------- | ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Set marker                 | Select; drag to retime             | Enter selects; arrows move by counts | Edit one formation                                                                 |
| Travel interval            | Select; drag body to move          | Arrows move; Delete resets to Auto   | Edit one performer trip                                                            |
| Departure / arrival handle | Drag edge                          | Arrows adjust local edge             | Change timing while respecting ordering limits                                     |
| Step count                 | Pick Auto or supported exact value | Native segmented/list control        | Feed the existing gait timing seam                                                 |
| Stage spot                 | Select; drag on chart              | Arrows nudge                         | Move required destination; Delete explains rather than corrupting set completeness |

### Motion lens

Motion is currently an explanatory projection of computed movement. It must look read-only and must not expose inert edit affordances. A later authored-event model extends `StageSelection` and the central command resolver rather than inventing another timeline.

### Transport, tempo, and snap

- Play, pause, seek, BPM, and loop are project-time commands and never change object selection.
- Space controls playback only outside a focused interactive control.
- Snap is a visible toggle with a readable current mode. Snap candidates include counts, set markers, clip edges, and other compatible selected-object boundaries.
- Drag previews disclose the snapped count and source. Turning snap off does not alter existing authored values.

### Sequence picker, scene, prop, effort, effects, and presets

- The sequence picker is a modal sub-workspace. Performer selection may remain visible as context, but global Stage mutation shortcuts are suspended while it is open.
- Choosing a sequence updates the explicit target performer(s) through the existing picker result path.
- Scene and preset changes operate on the project environment. Prop, effort, effects, and appearance operate on explicit performer identity.
- Presets disclose the values they will replace and create one undoable project edit when project-wide history is available.

### Director, JSON, export, and responsive surfaces

- Director and JSON edit the same versioned Studio project through capability-gated workspaces.
- Director must disclose loading or unsupported state; it never implies a film is ready when it is not.
- JSON validation is non-destructive. Invalid input remains editable and cannot partially mutate the scene.
- Export is a command with progress, cancellation where supported, success destination, and a retryable error.
- Compact layouts move the same controls into shared sheets or panels. They do not duplicate business logic or remove keyboard/touch parity.

## Current reuse points

| Responsibility                              | Existing owner to extend                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Versioned project handoff                   | `src/lib/features/stage/domain/studio-project.ts`                                                |
| Stage document and undo                     | `src/lib/features/stage/state/stage-choreography-state.svelte.ts`                                |
| Explicit editor selection                   | `src/lib/features/stage/state/stage-edit-mode.svelte.ts`                                         |
| Central delete interpretation               | `src/lib/features/stage/domain/stage-delete-command.ts`                                          |
| Timeline projection and direct manipulation | `src/lib/features/stage/components/StageTimeline.svelte`                                         |
| Floor travel intervals                      | `src/lib/features/stage/components/StageFloorLane.svelte`                                        |
| Drill-chart spot editing                    | `src/lib/features/stage/components/FormationOverlay.svelte`                                      |
| Performer rail and shared detail controls   | `src/lib/shared/3d/components/controls/PerformerSpine.svelte` and `SceneControlWorkspace.svelte` |
| Sequence selection                          | `src/lib/shared/components/sequence-picker/SequencePickerModal.svelte`                           |
| Global shortcut registration                | `src/lib/shared/keyboard/registration/register-stage-shortcuts.ts`                               |
| Modal focus and event isolation             | `src/lib/shared/foundation/ui/modal/BaseModal.svelte`                                            |
| Structural motion                           | `src/lib/shared/transitions/motion.ts` and `layout-flip.ts`                                      |
| User feedback                               | `src/lib/shared/toast/state/toast-state.svelte.ts`                                               |

## Staged implementation

### Slice 1: selection and deletion foundation

- Replace disagreeing nullable selections with the typed selection union.
- Route keyboard and explicit trash actions through one pure selection-to-command resolver.
- Remove performers by identity while preserving formation invariants.
- Reset selected Floor travel to Auto instead of deleting unrelated timeline material.
- Suppress Stage shortcuts inside shared modals and locally owned timeline widgets.
- Animate surviving timeline rows through the canonical layout motion system.
- Cover every selection kind, refusal, undo, and modal-isolation path with focused tests.

### Slice 2: one complete Studio project and history

- Promote per-performer prop, effort, effect, and appearance data into the versioned project by stable performer identity.
- Migrate current viewer-local state without breaking saved scenes.
- Make one history transaction restore Stage document and performer appearance together.
- Verify that deleting and undoing a performer restores the exact avatar configuration, not merely the row count.

### Slice 3: full surface remediation

- Apply the selection grammar and command precedence to canvas picking, the drill chart, inspector fields, and all remaining buttons.
- Add the visible Studio snap preference and compatible boundary candidates.
- Add drag cancellation, snap guides, focus restoration, and accessible announcements where missing.
- Audit every visible target at desktop, tablet, compact landscape, phone, 200% zoom, reduced motion, keyboard-only, pointer, and touch.

### Slice 4: expert workspaces

- Bind Director and validated JSON to the common project command layer.
- Add authored Motion events only after a real domain owner exists.
- Expose capability and loading limitations without dead controls or false-ready states.

## Known boundary

`StudioProjectV1` currently wraps the Stage choreography, while some per-performer visual configuration remains in viewer-local state. Slice 1 can delete the correct Stage performer, clips, spots, and travel by identity. Exact cross-surface undo of a customized prop/effect look requires Slice 2; it must not be simulated with index-based copies or a second project model.

Motion is currently computed rather than authored. The contract defines how authored events must integrate later but does not invent a premature event schema.

## Acceptance criteria

1. Selecting performer A, B, or C in any timeline lens and pressing Delete removes exactly that selected performer, never items selected by the playhead.
2. Shift-selecting performers removes exactly that group in one transaction and never allows an empty cast.
3. Selecting a Hands clip and deleting removes only that clip.
4. Selecting a non-opening set and deleting removes only that set; the opening set explains why it is protected.
5. Selecting a Floor interval and deleting resets only its custom timing and step count to Auto.
6. Selecting a required spot and deleting leaves the document unchanged and explains the invariant.
7. Delete and Backspace inside the sequence picker, any modal, and text or number fields never mutate the Stage behind them.
8. Explicit trash buttons and keyboard deletion produce the same state transition, feedback, undo behavior, and focus result.
9. Row insertion and removal preserve spatial continuity through canonical, reduced-motion-aware layout motion.
10. Every accepted destructive edit creates exactly one undo entry. Every refused or no-op edit creates none.
11. Existing saved scenes, Stage migration, sequence loading, performer controls, transport, responsive layout, and accessibility remain available.
12. Focused unit/component tests, `svelte-check`, live keyboard and pointer paths, reduced motion, responsive viewports, and browser console inspection are green before integration.

## Evidence and platform conventions

- WAI-ARIA separates focus from selection and defines predictable keyboard behavior for composite widgets: <https://www.w3.org/WAI/ARIA/apg/patterns/listbox/> and <https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/>.
- Apple’s interaction guidance treats undo and drag-and-drop as explicit, reversible user operations: <https://developer.apple.com/design/human-interface-guidelines/undo-and-redo> and <https://developer.apple.com/design/human-interface-guidelines/drag-and-drop>.
- Microsoft’s keyboard guidance gives focused controls first ownership of their standard keystrokes: <https://learn.microsoft.com/en-us/windows/apps/develop/input/keyboard-interactions>.
- Adobe Premiere’s timeline selection model applies commands to selected clips rather than content merely crossed by the playhead: <https://helpx.adobe.com/uk/premiere/desktop/edit-projects/change-clip-sequence/select-clips.html>.

Repository evidence came from tracing selection, delete, undo, modal, shortcut, drag, performer, set, and timeline owners in the files listed above. This contract extends those owners and forbids feature-local duplicates.
