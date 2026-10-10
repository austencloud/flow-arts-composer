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

Evidence recorded on 2026-10-10:

- `npm run check`: zero errors and zero warnings after the SvelteKit 3 merge.
- Focused Compose, Studio, media-composition, viewer-destination, and fixture
  regression run: 163 test files passed, 1,915 tests passed, two skipped.
- Final persistence follow-up: 16 tests passed for browser-only guest reopening,
  account isolation, guest draft claiming, and direct opening before listing.
- Isolated Chromium on the task worktree exercised a real four-cell LOOP
  fixture, including two layers in one cell and a transformed/offset sequence.
  Applying BPM 120, undoing to 240, redoing to 120, reopening the editor, and
  cancelling a change to 90 all preserved the expected Studio project state.
- Inspected the seven required viewport sizes: 375×667, 960×412, 820×1180,
  1440×900, 1920×1080, 2560×1440, and 3840×2160. No horizontal overflow or
  page errors were observed. A 720×450 layout check covered the CSS viewport
  equivalent of 200% zoom on a 1440×900 screen, with reduced motion enabled.
- `/post?library=1` rendered the combined project library. `/compose/arrange`
  reached `/post?library=1`. These route checks used an isolated local early
  access/guest UI fixture, with external network traffic blocked; they do not
  establish live signed-in account or cloud behavior.

Local evidence and reproducible probes are in
`E:/tmp/studio-consolidation-20261008/`. Persistence tests mock cloud responses;
no real account data was changed. Browser storage and cloud are the production
save paths; the disk draft archive is a development-server feature.

The animation-grid compositor now draws the cells' rendered canvases directly,
avoiding a full DOM capture on every frame. Other cell types retain DOM capture.
Both focused compositor tests passed. The actual export passed in installed
Chrome with an isolated agent profile: a four-second H.264 MP4, 1080×1080,
30 fps, 120 frames, and 777,031 bytes, rendered in 5,196 ms. Two extracted frames
showed nonblank, changing poses and the expected multiple layers. No page errors
were observed. The video is `studio-arrangement-test.mp4` in the evidence folder.

Two attempts in bundled Playwright Chromium crashed at export startup. The cause
is not established, and the successful installed-Chrome run does not demonstrate
that the compositor change fixed that browser failure. Export sharpness is also
limited by the preview-sized cell canvases being enlarged to the output size.
These remain explicit targets for the independent review.

## Independent review

Austen requested an adversarial Claude audit after delivery and explicitly
authorized Claude to redesign or replace this implementation. The handoff is
prepared at `E:/tmp/studio-consolidation-20261008/claude-handoff.md`, with special
attention to account boundaries, legacy import semantics, export pixels and
resolution, rendering cost, and whether the combined workflow is coherent.
