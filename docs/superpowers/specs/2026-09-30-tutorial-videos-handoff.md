# Halloween Tutorial Videos — Handoff (2026-09-30)

Living document. Updated at every milestone by whichever agent holds the work.
Last update: 2026-09-30 20:00 CDT (Claude Opus 5.5 session, seventh pass).
No work branch is open. `codex/tutorial-videos-fixes`, `codex/auto-colour`,
`codex/auto-colour-sky`, `codex/fill-box-save` and
`codex/post-sequence-actions` are merged to local main and removed. Nothing is
pushed.

## Mission

Austen needs three vertical 1080×1920 tutorial videos for the Halloween
devil-staff contest, all exportable by the night of 2026-10-01 (contest due
about 2026-10-02). The three sequences are the Firestore library folder
**"To Attach to Videos"** (`users/PBp3GSBO6igCKPwJyLZNmVEmamI3/collections/a30552c7-1ebf-462f-a91d-78764cbb52a7`):
`DCKΨ-`, `ΩΛ-XJ`, `Δ-ΛRZ` (the forest/"woods" one). All three follow one
template (the ΩΛ-XJ project) with as few decisions as possible on his side.
Background: memory `project_halloween_tutorial_videos.md`; Codex ledger
`C:/Users/Austen/Downloads/InShot-recovery-2026-09-29/POST-STUDIO-STATUS.md`
(its last entry is 2026-09-30 03:41 CDT).

## Where each video stands (2026-09-30 19:58 CDT)

All three have a Post Studio project in the disk archive
`~/.tka/post-studio-drafts` (key `tka:post-studio:project:v2:<id>`). Open any
of them at `https://localhost:5173/post?project=<id>`. All media are linked
static files in the primary checkout, gitignored via `.git/info/exclude`:
`static/word-videos/inshot-recovery/` (camera-cut-1/2, pictograph, woods-cut-1/2,
dck-cut-1/2, ending-card, dck-original-end-card, PermanentMarker.ttf).

Newest saves (times UTC):

| Video | Newest project                                                  | State                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ΩΛ-XJ | `1790805418223-…json`, updatedAt 21:56:58Z. 9 items.            | **The template.** `mirrored: true` and both clips `flip: true`, so footage and notation agree. Colour is still his sliders (1.00/1.17/1.12 and 1.00/1.25/1.09); Auto is Austen's to press. Takes are now "Full Speed" and "camera-cut-2.mp4" (he re-added a clip).                                                                                                                                                                |
| Δ-ΛRZ | `1790816050370-…json`, updatedAt 2026-10-01 00:54:10Z. 9 items. | Auto colour on (run 1.04/1.03/1.09, slow 1.05/1.04/1.09). Fill on the run clip (`sourceGeometry` box {0,0,1,0.5}, crop rows 0.25–0.75). **Notation is reflected over unflipped footage** (`mirrored: true`, both clips `flip: false`); the fix is Sequence → Mirror, not pressed yet. Edited 19:53–19:54 CDT by someone else (most likely Austen): caption alignment left, animation dark mode, mandala and elemental glyphs off. |
| DCKΨ- | `1790796700776-…json`, updatedAt 19:31:40Z. 11 items.           | Auto on both clips (1.20/1.03/1.12), six captions, no mandala. Same mirror pair as woods (`mirrored: true`, `flip: false`), not yet checked by eye. Both takes show "Timing not checked"; that doesn't block export.                                                                                                                                                                                                              |

No full export of any of the three exists yet.

## Done — verified

- 2026-09-30 before 03:41 CDT, by other agents (Codex coordinator + helper):
  template action `applyTutorialTemplate` in
  `src/lib/shared/media-composition/domain/post-project-looks.ts`
  (commit `64e1c84739`, merged `0a7bdd819b`; button "Use ΩΛ-XJ template",
  loads the newest saved ΩΛ-XJ via `loadPostDraft`). DCKΨ- recovered from
  InShot draft `Video_20260904_195028030.profile` into
  `C:/Users/Austen/Downloads/InShot-DCK-recovery-2026-09-30/`
  (`build-project.py`, `media-manifest.json`, cuts `dck-cut-1/2.mp4` from raw
  `05-20260904_191620.mp4`). Import parity fix and video-stall recovery also
  merged (`a020281f50` is main at that time).
- Draft loading is not a hazard (measured: archive read 220 ms, 5173 TTFB
  0.48 s, resolve 331 ms for ~300 records).
- `autoAdjust` on video items is **reference only** (PostItemTool says so);
  its stale start/end seconds copied by the template change nothing on screen.
  Real colour comes from `colorGrade`.
- **DCKΨ- run-through beats derived and validated.** InShot overlaid the
  sequence animation video (`07-DCKΨ- (5).mp4`, 30 fps) at timeline 0, speed 1,
  on the run-through, so animation time = take-1 time. The animation's
  top-left beat counter changes at each landing. Script
  `scratchpad/beat_counter.py` (session scratchpad; logic: grayscale crop
  x0 y70 100×80, frame-difference runs > 1.0, time = (first changed frame
  − 0.5)/fps). Validation on ΩΛ-XJ: counter-change starts vs Austen's 32 hand
  taps → mean +0.019 s, sd 0.022 s, max 0.055 s, 80.0 BPM exactly. DCKΨ-:
  31 changes from 0.717 s every 0.690 s (86.96 BPM) + extrapolated 32nd at
  22.107 s (clip is 22.412 s).

- **DCKΨ- and Δ-ΛRZ corrected projects installed** (2026-09-30 12:35–12:42
  CDT) as new archive files; nothing old was edited or removed. Scripts are in
  `docs/superpowers/specs/tutorial-videos-scripts/` (`build-fixed-projects.cjs`,
  `fix-dck-geometry.cjs`, `install-fixed-projects.cjs`; paths point at the
  session scratchpad, so adjust `OUT` before reuse). Evidence: a scratch vitest
  (not committed) parsed both with `PostProjectSchema` and resolved them with
  `resolvePostStudioDraft` over the whole archive: DCKΨ- canvas default (9:16),
  11 items, six captions, dck-take-1 32 taps at 86.956522 BPM; Δ-ΛRZ 9 items;
  no mandala in either. Browser check (DevTools, agent profile, 12:43 CDT):
  DCKΨ- at 0:00 shows the cropped run-through strip over the animation, at 0:23
  the full-frame slow part with "Practice with me!" on top and the moves box
  bottom right, at 1:12.5 "You got this!" stacked over "Now repeat 100x";
  Δ-ΛRZ timeline has no mandala and both takes read "Timing checked".
- **DCKΨ- framing bug fixed.** The other agent's `build-project.py` read
  InShot's transform as square-canvas units and ignored the run-through crop,
  which is why it chose a 1:1 canvas. InShot's horizontal axis spans ±9/16, so
  widths and x offsets divide by 9/16 (same as `post-inshot-import.ts`
  `geometry`/`keyGeometry`), and clip 1 has crop rows 0.2056–0.7081. Easing
  code 5 is `[0.47,0,0,1]`, not linear. Key times stay in source seconds.
- **Template action follows the template's canvas and mandala** (commit
  `c0b4fee4ee`, merged to local main `3765fb61aa`, not pushed). It copies the
  template's canvas shape and adds a mandala only when the template has one.
  Evidence: `tests/unit/media-composition/post-project-looks.test.ts` 17 passed;
  svelte-check 0 errors in the `wt:finish` gate.
- **Auto colour audit** (2026-09-30 12:50–13:10 CDT). Scripts are in
  `docs/superpowers/specs/tutorial-videos-scripts/colour/`: `audit_inshot.py`
  compares grades with Austen's InShot export of ΩΛ-XJ
  (`C:/Users/Austen/Downloads/InShot-recovery-2026-09-29/reference-export.mp4`,
  InShot Auto Adjust at 40%), `grades.py` holds Python twins of the grades,
  and `sheet.py` renders the side-by-side sheet (sent to Austen). The paths
  point at the session scratchpad. Colour distance from InShot's export (CIE76 ΔE,
  median over 7 aligned frames): no grade 4.18; the old Auto 3.89 (it returned
  contrast 1.01 and nothing else; identity on dark stages); his sliders
  (contrast 1.17, saturation 1.12) 4.41; best possible per-channel curves 1.17;
  new Auto 1.57. InShot sinks a hazy black floor (about 0.065 to black), keeps the
  midtones (it even lowers mean luma slightly), and adds saturation; a
  warming white balance scored worse, so the new Auto has none. The existing
  brightness/contrast/saturation sliders can express this almost as well as
  curves (1.57 against 1.64), so no renderer change is needed.

- **Fill on InShot clips and the stuck save** (commit `9607eb0be0`, merged
  to local main `5b56a27ab1`, not pushed). Fill on a clip with InShot
  placement (`sourceGeometry`) used the canvas shape and the clip's old
  rectangle, so in the woods dual view it made a tall canvas-shaped video
  that spilled out of the top half. `sourceFillBox` in
  `src/lib/shared/share/components/post-studio/editor/post-source-crop.ts`
  now places the footage over the clip's box and crops the source to that
  shape, centred where the crop was. Separately, `savePostDraft` sent every
  save under 60 KB as `keepalive`. Chrome allows a page 64 KiB of keepalive
  bytes in flight; one woods save hung at about 18:26:52Z and every later
  save failed at once with "Failed to fetch". That tab had about 3.7 KB of
  keepalive room left, while a plain POST of the same size worked. A refused
  keepalive save now retries as a plain request. Evidence:
  `tests/unit/media-composition/post-source-crop.test.ts` and
  `post-draft-storage.test.ts`, 17 passed; the `wt:finish` gate passed. Saves
  from the built-in browser tab reach the archive (files at 19:26–19:28Z).

- **Woods Auto colour and Fill pressed** (2026-09-30 about 19:40 CDT, in the
  built-in browser tab after Austen's "You open woods"). Evidence: the archive
  values in the table above; Fill's geometry was also read in the page.
- **Sequence tool in Post** (commit `af4cf41b13`, merged to local main
  `4eaf29e6e0`, not pushed). Spec:
  `docs/superpowers/specs/2026-09-30-post-sequence-actions-design.md`.
  Selecting an animation, moves strip or card adds a Sequence tool after
  Appearance with Mirror, Flip, Rotate 90° left/right, Swap and Reset. Presses
  are saved in order as `sequenceActions`, replayed after hand labelling and
  before the whole-post mirror, and change the animation, moves and card
  together, export included. The footage and the saved sequence are left
  alone. The "Use ΩΛ-XJ template" button no longer copies `mirrored`.
  Evidence: `post-sequence-actions` 5, `post-sequence-view` 6,
  `post-project-looks` 18 and `post-editor-tools` 14 tests passed; the
  `wt:finish` svelte-check found 0 errors; the panel showed live on
  `https://localhost:5173/post?project=Δ-ΛRZ` with the animation selected
  ("Nothing applied.").

## Believed done — unverified

- A Mirror press un-reflects a real post's notation. Unit tests prove the
  order with fake transforms, and the transforms are the Composer's own, but
  nobody has pressed it on woods yet because Austen was editing woods. Check:
  after the press, the animation's props sit on the same side as the
  performer's hands in the footage.

## In flight

1. Woods: select the Animation clip → Sequence → Mirror, then compare the
   animation with the footage by eye. Austen does it in his own window, or an
   agent does it once he says woods is free. It saves as
   `sequenceActions: ["mirror"]`.
2. DCKΨ-: the same check, probably the same press.
3. ΩΛ-XJ: Auto adjust color on both clips (Austen). Expected from the
   browser's own samples: run 1.09/1.15/1.10, slow 1.13/1.15/1.11.
4. Full exports of all three, tab visible.
5. Austen: open DCKΨ- and press "Tap beats" → check on both takes (the derived
   run-through beats and the other agent's slow-take beats).

## Decisions already made

- 2026-09-30 (Austen): no mandala on any of the three.
- 2026-09-30 (Austen): DCKΨ- keeps its own six InShot captions, restyled like
  ΩΛ-XJ, at their original offsets into the slow part: "Practice with me! "
  (+0.427 s, 8.106 s), "Watch hands closely" (+12.807, 6.682), "Negative
  space is key" (+24.230, 6.140), "Go slower\nTo learn faster" (+34.445,
  7.798), "You got this! " (+47.924, 5.295), "Now repeat 100x" (+49.903, 3.0).
  Offsets are from InShot slow-clip start 21.904918 s.
- 2026-09-30 (Austen): colour — audit Auto colour first instead of copying
  ΩΛ-XJ's slider values. After the audit sheet (13:10 CDT) he chose "A:
  sliders version" (no renderer change) and "All three" (ΩΛ-XJ too, colour
  only). A curves version (per-channel tone curves in preview and export) is
  the parked upgrade.
- 2026-09-30 (Austen): DCKΨ- source = his InShot draft; Δ-ΛRZ keeps speed
  0.7; template captions land on the same beat numbers.
- Never slow a clip to fake slow motion (memory, 2026-09-26); the woods 0.7
  and DCKΨ- 0.8 are his own settings.
- 2026-09-30 (Austen): he wants to mirror, flip, rotate and swap the
  notation on its own, the way he can the video, and line the two up
  himself. Whole-sequence actions in Post now; an "Edit in Composer" round
  trip for turns and beat changes after the deadline, in its own spec. Rotate
  turns 90° per press; Invert and Reverse stay out.
- Mirror-me hand labelling is the default. Split Crop from Zoom & pan only
  after the deadline. Codex workers: GPT-6.1 Sol, High effort or above.

## Gotchas

- Phone pull recipe: adb `C:/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe`,
  wireless serial currently `192.168.12.208:37163` (rediscover with
  `adb mdns services`). URI = `content://com.camerasideas.instashot.file/` +
  base64url(no padding) of the absolute path; read with
  `adb -s <serial> exec-out content read --user 0 --uri <URI>`. Draft list in
  `/data/user/0/com.camerasideas.instashot/files/mmkv/instashot`. The DCKΨ-
  draft file is **gone from the phone** (ENOENT on 2026-09-30); the local copy
  is the only one.
- On 2026-09-30 this session's pull overwrote the local DCKΨ- `.profile` with
  an error message; it was restored from `importSource.rawDraftText` in both
  `DCK-Psi.*.post-studio.json` files (identical, parses, 43,044 bytes).
- Do not edit Austen's live drafts for tests. Every save writes a new file into
  `~/.tka/post-studio-drafts`; the newest `updatedAt` wins. A test fixture key
  `post-draft-storage-fixture` was written there by another agent; harmless.
- Never start, restart or kill port 5173, 5195, 5197 or 5198.
- The agent-profile Chrome tab (DevTools page 2,
  `https://localhost:5173/post?project=Δ-ΛRZ`) still runs the old save code
  and holds an older woods copy (updatedAt 18:27:51Z, with a bad canvas-shaped
  Fill on the run clip). Don't edit or reload it; its copy is older, so it
  never wins on load.
- Two windows on one project fight: each save is a new archive file, and on
  load the newest `updatedAt` wins. Check which window Austen is using before
  pressing anything, and don't click while he is clicking.
- Undo restores the previous `updatedAt`, so a reload after Undo can bring
  the undone edit back (the newest `updatedAt` wins). Austen started a
  separate task for it (worktree `post-undo-updatedat`). Until it lands,
  take a Sequence press back by pressing the same button again, not Undo.
- Six media-composition unit tests already fail on main
  (`media-composition-schema` and `media-composition-state` crossfades, four
  in `take-timing-lane`). They are not from this work.
- The built-in browser tab `seed` holds woods as loaded at 19:54:38 CDT.
  Don't edit there while Austen is in woods.
- The "Use ΩΛ-XJ template" button also copies ΩΛ-XJ's clip colour (seen on
  woods at 19:26:56Z). Press Auto after it.
- In Git Bash, `npm run wt:finish -- <branch> --route /post` turns the route
  into a Windows path. Prefix `MSYS_NO_PATHCONV=1`.
- Primary checkout has another task's uncommitted edits (worktree-automerge,
  worktree-workflow rule, elemental glyph files, sounds). Leave them alone.
- Treat InShot `.profile` files as the authority; never modify them.
- The "Use ΩΛ-XJ template" button replaces the destination's captions with the
  template's. Re-applying it to DCKΨ- would swap its six captions for ΩΛ-XJ's
  four. Don't press it on DCKΨ- again.
- InShot's Auto Adjust is an AI LUT model (`lut0-2.bin`, `pallet.model` in the
  app). Don't commit or use those proprietary files; the new Auto only
  imitates its measured result.
