# Undo coverage audit

Feedback: `6OaueIzjuarqWgkOWdG1`, “Audit undo coverage”.

## Scope

Reviewed the editing histories in Create, Assemble, Compose Timeline and Arrange,
Stage, the 3D viewer, Post Studio, prop placement, the hand-path builder, and
Effects Lab, Detection Studio, and Museum placement history. Checked action wiring, before/after snapshots, history
isolation, asynchronous completion, grouped gestures, unchanged edits, and Redo.

This audit covers the existing Undo contracts. Some small tools deliberately
offer only “undo last placement”; they do not provide a full document history.

## Findings and fixes

| Area | Finding | Resolution |
| --- | --- | --- |
| Spell | The snapshot was taken after replacing the sequence. | Capture the previous sequence before replacement. |
| Create | Async completion could record history on the newly selected tab. First generation from an empty workspace had no Undo snapshot. | Bind history to the originating sequence state and allow restoration to an empty workspace. |
| Empty Create workspace | Undoing the first generation hid Redo with the sequence controls. | Keep available Undo and Redo actions in the empty workspace's recovery area. |
| Create transforms and extensions | Failed or unchanged operations could consume an Undo entry; deferred capture could miss the original state. | Capture before transforming and commit only changed results, retaining recovery from partial failures. |
| Deferred Create results | Extensions and delayed letter calculations could overwrite a newer edit or Undo. | Discard results when the source sequence or its revision has changed. |
| Timeline | Several project, track and clip setters bypassed history. | Record those edits and group clip gestures into a single action. |
| Timeline audio | Restoring metadata did not restore its playable source. | Keep file selection, replacement, clearing and BPM in history; reload the matching source and retain blob URLs while history references them. |
| Arrange | Grid dimensions were absent from snapshots; coalescing could merge a new edit into an earlier history branch. | Restore dimensions with content and stop coalescing across a Redo branch. |
| Stage | Tempo changes bypassed history; null shared-sequence IDs were not restored; click-only drags consumed history. | Record tempo edits, restore null, and commit one entry per changed gesture. |
| Scene history | Unchanged operations consumed history, coalescing crossed Redo branches, and restored objects could alias stored snapshots. | Skip unchanged entries, respect history branches, and clone restored data. |
| 3D viewer | Resetting all performer overrides captured the wrong history domain. | Restore the affected performers' overrides for prop, effort, effects, and plane resets. |
| Hand-path builder | Undo, hand switching or Reset during animation could change the destination of a pending point. | Gate Undo and hand switching during animation; discard pending additions after Reset or a grid change. |
| Effects Lab | Some point edits bypassed history; Undo left a saved override where none existed before; no-op drags consumed history. | Record point edits, restore override absence, and discard unchanged gestures. |
| Detection Studio | Undoing a guided replacement erased an earlier correction and could reuse history from another video. | Restore the previous correction, remove first placements accurately, and isolate history by source. |

## Verification coverage

- Create and Assemble: sequence clearing/restoration, section isolation, redo
  after edits, placement and motion settings, hand switching, deletion,
  replacement, and paired-hand reorder.
- Post Studio: tutorial timing restoration, session accept/cancel, gesture
  grouping, slider coalescing boundaries, and media/tool edits.
- Shared history: command-stack bounds, new edits invalidating Redo, active
  editor shortcut routing, modal boundaries, disabled controls, and text input
  protection.
- Prop placement: dragging previews, one entry per committed drop, placement
  restoration, orientation restoration, and external input synchronization.
- Hand paths: four new tests reproduce animation/Undo races, Reset during an
  animation, a grid change followed by another animation, and active-hand Undo.
- Timeline, Arrange, Stage and 3D: document and performer restoration, gesture
  grouping, unchanged edits preserving Redo, and history branch boundaries.
- Timeline audio: selection, replacement, clearing, source/metadata pairing,
  unchanged actions, URL lifetime, document switching, and reload behavior.
- Effects Lab and Detection Studio: persisted override/correction restoration,
  grouped point movement, and switching between edited sources.

The combined regression run passed **240 tests across 25 files** using
`npm test -- --run --maxWorkers=1` with the audited history suites selected.
This includes the existing Create/Assemble, shortcut, Post Studio and prop
placement coverage alongside the added regression tests. The 3D suites emitted
a duplicate Three.js import warning; their assertions passed.
The final focused Timeline suite passed another **11 tests**, for **251 tests
across 26 files** in total.
After merging concurrent work from local main, the affected Post Studio,
keyboard shortcut and Create integrity suites passed **75 checks across six
files**. These include reruns of tests counted above.

## Browser checks and limits

Used a signed-out session at `https://[::1]:5173/create/construct` with temporary
local sequence data. Checked adding a step, the Undo button, Ctrl+Z, Ctrl+Y,
Ctrl+Shift+Z, and clearing a sequence followed by Undo restoring both its start
position and step. Account-gated editors are verified through their state/service
tests, without using a personal account or writing remote project data.

Timeline audio sources and histories involving them are session-only. Reloading
or opening another document clears unavailable audio rather than restoring stale
blob URLs. Select the audio file again after reload.

Collection scan Undo performs remote deletes and was inspected without executing
those mutations. Museum currently tracks fixture placement history only; other
placement types do not have that history. Its delete path also uses room
`unknown` for fixtures absent from the current editor's placement history, a
separate persistence issue identified during inspection and left unchanged.

This is not a claim that every external persistence failure,
browser/device combination, or historical saved document was exercised.
