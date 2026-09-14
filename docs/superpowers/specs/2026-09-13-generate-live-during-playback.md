# Generate panel stays live during workspace playback

Play in the Generate workspace replaces the card with an animation of the
current result. Today the generate panel goes `inert` for the whole playback,
like the Construct picker does, but without Construct's dimming. The panel
looks clickable and does nothing until Stop. This change keeps the panel live
instead of styling it dead.

## Design decision

Construct has to go inert during playback: clicking an option adds a step,
and the playback snapshot cannot follow a document that moves mid-beat. Its
picker dims to 0.45 opacity to say so.

Generate does not have that problem. Every control on the panel edits the
generation config (level, length, hand relationship, saved setup, and the rest)
and none of them touch the sequence until Generate runs. Generate replaces the
sequence through `setCurrentSequence`, which bumps the revision counter, and
the existing `syncWorkspacePlaybackSource` effect in `CreationWorkspaceArea`
already ends playback on a revision change. Customize, the saved-setup drawer,
and the LOOP panel go through `closeAllPanels()`, which ends playback the same
way. So the only change is dropping the playback term from the generate
panel's `inert` condition in `CreationToolPanelSlot.svelte`.

What the user sees: Play, and the animation replaces the card while the panel
stays live. Change a setting and the animation keeps going, the same as it
would have left the card alone before. Press Generate and the animation
crossfades back to the retained card, which is already running its arrival
animation for the new sequence. The workspace button reads Play again.

Generate ends playback rather than restarting it with the new result. The
arrival animation is the moment Generate is built around and a restart would
hide it behind the player. A restart would also need a swap branch in the
playback state and a loading gap between sessions. If the extra Play tap
proves annoying it is a clean follow-up on top of this change.

Undo and redo stay inert during playback on both tabs. Construct is unchanged.

Options considered and set aside: dimming the generate panel to match Construct
(hides a panel that has no reason to be dead), and moving the pictograph
carousel into the tool panel slot during playback (turns a quick preview back
into a mode, and the viewer shell already owns that experience).

## Existing owners

- `src/lib/features/create/shared/components/CreationToolPanelSlot.svelte`
  owns the generate panel's `inert` binding.
- `src/lib/shared/create/state/panel-coordination-state.svelte.ts` owns
  `startWorkspacePlayback`, `stopWorkspacePlayback`, and
  `syncWorkspacePlaybackSource`. Unchanged.
- `tests/unit/create/workspace-playback-panel-state.test.ts` already covers
  "keeps Generate playback until its source tab or document changes", which is
  the transition Generate relies on.

No new component test. The change is one attribute expression and the
transition it depends on is unit-tested. Mounting `CreationToolPanelSlot`
needs the whole CreateModule context, which is too much harness for one
`inert` assertion.

## Verification

`tests/unit/create/workspace-playback-panel-state.test.ts` passes all nine
tests in the task worktree.

Chrome DevTools inspection on `/create/generate` from a task-owned Vite server
on port 5175, as a guest, at 1440x900 and 375x667 (mobile, touch). No console
errors on either tier. The `inert` attribute changes no geometry, so the pass
covers interaction and the two layout modes rather than all seven tiers.

Laptop. Play replaces the card with the animation; the generate panel has no
`inert` attribute and computed opacity 1 while `.workspace-history-actions`
stays inert at 0.45. A trusted click on Level 2 during playback flips its
pressed state and the seek slider keeps advancing (33 to 42 across 700 ms).
Regenerate during playback ends playback, the word changes from LΦ to RΛ, the
card returns with the new sequence, and the workspace button reads Play.
Escape ends playback. Opening Customize during playback ends playback and
opens the dialog; closing it leaves the card, Play, and a live panel. The Stop
button returns the card.

Phone. The animation sits above the panel (playback 374x206 at y=77, panel
375x277 at y=346), the panel is live at opacity 1, and the document has no
horizontal overflow. A trusted tap on Increase Length during playback reached
the guest step cap and opened the sign-in prompt, which is the existing guest
gate doing its job on a live control. After closing it, Increase Level moved
the level from 2 to 3 while the slider advanced (63 to 71). Generate during
playback ended playback and returned the card with the new AΦ- sequence.

The Generate button carries a permanent `subtlePulse` animation, so the
DevTools click helper refuses it as never stable. Focus plus Enter drives it
with trusted keyboard input; `inert` blocks focus, so the check still proves
the panel is live.
