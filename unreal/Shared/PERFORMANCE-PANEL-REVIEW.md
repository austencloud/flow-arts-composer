# Shared performance panel

## Design brief — 2026-10-16

Audience: a Museum visitor or Flow Fest player choosing and studying a prepared
performance. The main task is to watch the performer, recognize the sequence,
and control playback without losing the game view. Austen described the previous
prepared-sequences screen as “90s styling” and requested Composer pictographs.

Real content: the Museum's 25 captured sequences, their exact notation, and the
same runtime playback clock used by avatar and props. No invented preview art.

Two compositions were considered with that content:

1. Centered library: sequence list on the left, large pictograph and transport
   on the right. This makes more entries visible but covers the performer.
2. Side panel: the performer remains visible beside a searchable library and
   current notation. Transport stays at the bottom while content scrolls.

The implementation uses the side panel. It follows Composer's artifact-first
dark workspace: neutral surfaces, readable names, real pictographs, and a mint
selection outline that does not tint the notation. It is one Slate component
shared by both games. The browser continues to use its own shared Svelte owners.

## Intended interaction

1. Museum: approach a performer and press F6. Flow Fest: open the same F6 panel
   for the selected player performer. The Library view opens first.
2. Search or select a sequence. Selecting opens Now playing; its current
   pictograph follows the performance clock. Select a step thumbnail to seek
   to that step, or drag the timeline.
3. Library and Now playing remain available as tabs. Play/pause and transfer
   actions stay visible in either view. In short windows, seeking, restart,
   and speed controls follow the notation inside Now playing's scroll area.
   Only captures compatible with this rig and prop appear.
4. Paste score accepts a performance copied from Composer, selects a prepared
   match, and restores copied playback
   state. A new sequence without a prepared capture explains the limitation.
5. Copy score preserves the exact score and playback state for Composer's
   performance import page. Close, Escape, or F6 returns control to the game.

## Review record

Rubric: VR-1. Research ledger checked: 2026-09-21, within its 90-day window.
Reviewer calibration: not calibrated. A separate reviewer inspected the old
frame, implementation, and final packaged frames. The layout checks below
passed; owner aesthetic approval remains open.

Pre-render corrections: explicit 44px action targets, preview-key handling for
Escape/F6 inside child controls, smaller current picture in short windows, and
an active-step border independent of the pictograph's colors.

This record does not claim owner approval or observed newcomer usability.

First rendered review: the combined score/library composition hid every entry
at 1280×720, clipped the picture at 888×500, and clipped a transfer label.
Correction round 1 separates Library and Now playing, opens Library first, and
shortens the transfer labels while preserving detailed tooltips. Four native
automation tests passed: exact transfer, sealed pictograph timeline, shared
transport, and prepared performance session. The last intentionally exercises
a missing profile and reports its expected warning.

Revised native frames at 1280×720 show a searchable library with real notation
and the Now playing view paused at step 2. Its B pictograph and selected step
match the 1.0-second transport position. The 888×500 frame exposed a remaining
layout failure: the fixed controls consumed the entire list area. Correction
round 2 removes the duplicate Library heading and compacts the short-window
transport while keeping every action reachable.

Data verification: 25 library entries reference 98 canonical 400×400 PNGs.
The complete sidecar passes score, capture-provenance, timeline, path, and image
hash verification. Both generator tests pass. The final corrected Development
package compiled, cooked, staged, and archived successfully. Its post-package
checks passed: 25 prepared profiles, 25 exact library sequences, and all 98
pictograph image hashes and packaged bytes.

Final packaged render review passed at three window sizes:

- 888×500 Library: search and one complete playable entry remain visible above
  the fixed transport and transfer actions.
- 888×500 Now playing: the complete B pictograph, ABCD title, and step 2 label
  fit beside each other. The step rail and additional controls are reachable
  in the scrolling content.
- 1280×720 Now playing: the current pictograph and all four step thumbnails
  and labels fit above the fixed transport. The selected second step agrees
  with the paused 1.0-second playback position.
- 1920×1080 Now playing: the larger pictograph, full step rail, and transport
  fit within the panel.

Actual packaged frames are preserved in `E:/MuseumGamePerformance58/`:

- `pictograph-panel-888x500-packaged.png`
- `pictograph-panel-888x500-packaged-step-1.png`
- `pictograph-panel-1280x720-packaged-step-1.png`
- `pictograph-panel-1920x1080-packaged-step-1.png`

The four sequential review processes exited after capture. These rendered
checks establish panel geometry and notation visibility, not full interactive
usability or approval of the surrounding Museum scene.

Package: `E:/MuseumGamePerformance58/Builds/Windows/MuseumGame.exe`.
Build log: `E:/MuseumGamePerformance58/pictograph-final-package.log`.
The inner executable is 332,306,944 bytes, SHA-256
`0E0D8662563BB7B4E6F907DD19348AC07DE5157ADA63FC5513AE855BDFE3384F`.

Existing scene warning: Museum's Lumen configuration reports missing ray-tracing
data. This review does not treat the room lighting or avatar posing as approved.
