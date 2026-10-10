# Studio and Arrange consolidation

Implementation brief, 2026-10-08. Approved by Austen: “Let's do it. Full send.”

Studio owns the project library, timeline, music, playback, and export. Arrange
is an editable source inside a Studio project. It retains its grid, sequence
layers, timing offsets, transforms, colors, and effects. Existing Compose
records stay intact when imported. Old Compose entry points lead to Studio.

## Layout decision

Audience: people arranging flow sequences and assembling finished videos.
Success means opening an arrangement, editing its cells, saving, reopening,
and exporting the same composition without using a second timeline.

Two compositions considered with the same grid and video content:

- Permanent Arrange / Timeline tabs: easy switching, but two unrelated editing
  selections and save actions would remain visible at module level.
- One Studio timeline with a contextual Arrange workspace: the grid fills the
  canvas while edited, with its cell tools beside it (below on phones). Apply
  returns to the selected timeline item. Arrangement-only projects enter this
  workspace directly. This is the chosen direction; editing the enclosing video
  requires returning to its timeline.

Use the existing Studio shell, Arrange cell controls, sequence picker, animation
renderer, and export compositor. Load Arrange only when used. Nested editing
has isolated state; applying an edit creates one Studio undo entry.

Visual review rubric VR-1; evidence ledger 2026-09-21; calibration not yet
established. This brief records a design choice, not rendered acceptance.

## Compatibility

Arrangement snapshots are versioned data embedded in a Studio item. A new
standalone arrangement gets an independent Studio source identity; sequences
inside its cells retain their original IDs. This keeps separate arrangements
from overwriting the sequence's existing post in the current storage model.
Local Compose records without an owner require an explicit import and are
never silently assigned or uploaded to whichever account signs in next.

## Verification

Required: snapshot round trips, owner isolation and sync retry, isolated editor
undo/cancel, compiler timing, actual preview/export agreement, save/reopen,
old-link routing, and the responsive viewport matrix. Evidence will be added
after those checks run. No completion is claimed by this document.
