# Tutorial Videos, Part 2 — Handoff (2026-10-01, 14:35)

**Closed 2026-10-04.** All three videos are exported and uploaded by Austen.
Nothing below is open. See the first handoff for the closing note.

## Completion update (2026-10-01, 14:46 CDT)
Both code changes and the final draft edits below are complete on local main.
The empty mount-save guard and the arrival/travel title highlight switch landed
together. Focused tests passed (17); `npm run check` had zero errors/warnings.
Fresh, schema-valid DCKΨ- and ΩΛ-XJ archive files were appended at 14:46; a
rerun found them and woods unchanged. Woods already had the requested credit.
The exact files and timing edits are recorded in the earlier handoff. An
isolated browser opened `https://localhost:5173/post` but sign-in blocked
saved-project inspection. **Austen must reload every open Post tab before
clicking, then export all three videos himself.** Nothing was pushed.

The "In flight" and "Loose ends" sections below are historical as of 14:35.

## Mission
Three vertical tutorial videos (DCKΨ-, ΩΛ-XJ, Δ-ΛRZ "woods") built in Post Studio on the ΩΛ-XJ template, due the night of 2026-10-01. Austen exports them himself. Earlier context: `docs/superpowers/specs/2026-09-30-tutorial-videos-handoff.md` on local main.

## Done — verified
- ΩΛ-XJ was blanked at 14:15:15 (0 takes, 0 items) and restored at 14:21:32 from the 13:49 copy. The new archive file is `~/.tka/post-studio-drafts/1790882492833-...json`. Evidence: Austen's window mount-saved the restored copy at 14:22:35 (3 takes, 9 items).
- DCKΨ- slow clip is back at speed 0.8, which closed the empty gap before the card. Austen kept it in later edits; the newest copy at 14:29:07 has speed 0.8 and the card at 79.278.
- Austen turned on the DCKΨ- moves-strip glyph and progress bar himself at 14:29. The newest archive shows `tkaGlyph: true` and `progressBar: true`, so that pick is done.

## Root cause of the blank (mechanism confirmed in code; trigger inferred)
- `PostEditorWorkspace.svelte` (~line 327) has an `$effect` that calls `draftAutosave.submit(editor.snapshot)` on mount, at `saveRevision` 0. Every open writes the loaded project to disk.
- If the open finds no saved copy, `openPostProject` (`post-project-store.ts`) creates an empty project stamped `now`. The mount save then writes that blank as the newest copy.
- `loadPostDraft` (`post-draft-storage.ts`) also falls back to browser-only records on an archive fetch error or timeout, but still reports `diskAvailable: true`, so the save stays enabled.
- Trigger (inferred): the blank landed 12 s after merge `1827bce25e` (`codex/post-beat-wheel-zoom`, Post Studio code) at 14:15:03. The 14:15:51 saves of DCKΨ- and ΩΛ-XJ came together, which looks like a full reload.
- HMR hazard: a hot remount rebuilds the editor from `state.draft`, the copy loaded when the post was opened. Austen's next edit then stamps that stale copy as newest. After any Post Studio merge, tell Austen to reload all Post tabs before clicking anything.

## In flight
- Worktree `E:/worktrees/tka-platform/post-arrival-highlight`, branch `codex/post-arrival-highlight`, has a node_modules junction. Before any manual removal, run `cmd /c rmdir` on the junction. No code changes yet; only this doc is committed.

## Loose ends (ranked). Austen's picks, all approved, both code changes to land together ("Both now")
1. **Blank-save fix.** In the mount-time autosave, skip the submit when the project is empty (no takes and no track items). The blank can then never overwrite the archive. Add a focused unit test, for example an exported `isEmptyPostProject` helper in `post-draft-storage.ts` with a test.
2. **Title highlight "on arrival", with a switch.**
   - Default: arrival. The letter lights when its move lands and holds during the next move's travel. Nothing is lit during beat 1.
   - Current code: `AnimatorCanvas.svelte` ~774 `headerActiveStepNumber` lights the travelling beat. `currentStep` is in [k, k+1) while beat k travels.
   - Arrival formula: `floor(currentStep + 1e-3) - 1`. Return null when the result is below 1; return `steps.length` at the end.
   - The switch: add a visibility setting such as `wordHeaderHighlight: "arrival" | "travel"`. It needs:
     - `animation-visibility-state.svelte.ts` (default "arrival");
     - `PostAnimationItemSchema.animationAppearance` in `post-project.ts` (strict schema, so add it there);
     - the `keys` list in `PostAnimationAppearanceTool.svelte` and a Display control;
     - the main animator `DisplayPanel.svelte`.
   - Also check the export paths: `features/compose/services/canvas-renderer.ts` ~310 (`activeStepNumber`), and however Post export draws the animation overlay. The last grep was interrupted.
   - Only ΩΛ-XJ shows the title, so this must land before Austen exports ΩΛ-XJ.
3. **Merge** with `MSYS_NO_PATHCONV=1 npm run wt:finish -- codex/post-arrival-highlight --route /post` from E:/tka-platform. Then tell Austen to reload every Post tab.
4. **Draft edits.** Write each as a NEW archive file built from the newest copy, with `updatedAt = Date.now()`, using tmp + rename. Never edit or delete old files. Validate with `PostProjectSchema` first; an invalid copy is dropped on load. Do this right after the merge and before Austen reloads. He edits live, so re-read the newest copy first.
   - **DCKΨ- run to slow crossfade:**
     - Run clip `fadeOut` 0.5 → 0.
     - Slow clip `dck-main-2` `start` 22.411648 → 21.411648, so it overlaps the run clip by 1 s like the others.
     - Every overlay anchored to `dck-main-2` shifts −1 s in `start`. Their `anchor.offset` stays the same.
     - The card stays at 79.2779; with the shift it now starts exactly at the slow clip's end. Total length is unchanged.
   - **DCKΨ- last captions:**
     - "Now repeat 100x" (`text-6`, track-1): end it at the card start (start 76.2779, duration 3, `fadeOut` 0.5) and update `anchor.offset` to start − 21.411648.
     - "You got this!" (`text-5`): end it at 76.2779.
   - **Credit line on all three.** Copy woods' `text-1` ("Created with\nFlow Arts Composer", track-1, box x 0.07 y 0 w 0.86 h 0.14, size m, anchor = card item, offset 2, duration 3). Add it to DCKΨ- and ΩΛ-XJ with a new id, `start` = card start + 2, and the anchor pointing at that post's card id.
5. Update `MEMORY.md` (Halloween line) and the earlier handoff with all of the above.

## Decisions already made (2026-10-01)
- Woods rename to Δ-ΛRZ: done earlier, then reverted by Austen's 14:11 save. Not redone. Export filename is already Δ-ΛRZ.mp4.
- Woods animation box nudge (14:11): leave it; Austen didn't pick it.
- Credit line: "Add to all three".
- Highlight: "On arrival, with a switch". Timing: "Both now".
- Woods colour: leave as is. Austen exports himself.

## Gotchas
- Use https://localhost:5173, never [::1]. Never touch port 5173.
- tab-1 in the in-app browser is Austen's: read-only. The agent Chrome (DevTools, page 16) is at localhost.
- Two windows on one post fight; the newest `updatedAt` wins. Austen was actively editing DCKΨ- at 14:29–14:31.
- Newest archive copies at handoff: DCKΨ- `1790882947678-...` (14:29:07), ΩΛ-XJ `1790882894970-...`, woods `1790882827984-...`.
- Archive records are in `records[]`, with `value` as a JSON string. Skip non-`.json` entries in that folder.
