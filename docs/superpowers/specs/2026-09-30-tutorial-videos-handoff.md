# Halloween Tutorial Videos — Handoff (2026-09-30)

Living document. Updated at every milestone by whichever agent holds the work.
Last update: 2026-09-30 13:35 CDT (Claude Opus 5.5 session, fifth pass).
Work branch: `codex/auto-colour-sky`, worktree
`E:/worktrees/tka-platform/auto-colour-sky` (node_modules is a junction into the
primary checkout; `wt:finish` unlinks it). The earlier branch
`codex/tutorial-videos-fixes` is merged and removed.

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

## Where each video stands (2026-09-30 13:25 CDT)

All three have a Post Studio project in the disk archive
`~/.tka/post-studio-drafts` (key `tka:post-studio:project:v2:<id>`). Open any
of them at `https://localhost:5173/post?project=<id>`. All media are linked
static files in the primary checkout, gitignored via `.git/info/exclude`:
`static/word-videos/inshot-recovery/` (camera-cut-1/2, pictograph, woods-cut-1/2,
dck-cut-1/2, ending-card, dck-original-end-card, PermanentMarker.ttf).

| Video | Newest project                                                                   | State                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ΩΛ-XJ | updatedAt 07:15:39Z. 9 items, 77.69 s.                                           | **The template.** Austen removed its mandala at 07:09Z and raised contrast/saturation with sliders at 07:15Z (run 1.17/1.12, slow 1.25/1.09). A tab keeps re-saving it unchanged (last 11:51Z); don't edit it.                            |
| Δ-ΛRZ | updatedAt 17:35:34.865Z (archive file `1790789867792-…json`). 9 items, 71.75 s.  | Ready to export. Mandala removed. Speed 0.7 on both clips (Austen's call). Both takes' timing confirmed by Austen.                                                                                                                        |
| DCKΨ- | updatedAt 17:42:22.875Z (archive file `1790790167854-…json`). 11 items, 82.67 s. | Ready to export once Austen checks timing. 9:16, no mandala, its own six captions, run-through beats derived (32 taps, 86.96 BPM), video framing re-derived from InShot. Both takes show "Timing not checked"; that doesn't block export. |

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

## In flight

1. **New Auto colour** is on local main (merge `0a21f03cee`, svelte-check 0
   errors). `analyzeVideoColor` in
   `src/lib/shared/media-composition/domain/post-video-color-grade.ts` draws
   brightness then contrast as a line through two anchors. The black point (about
   half the darkest 0.5%) goes to black. The median lands 5% brighter, 12% on
   dim footage, and lower on overexposed footage. Guards stop a dim median from
   getting darker and limit newly clipped highlights. Vibrance tops out at 1.15.
   Follow-up on `codex/auto-colour-sky`: the highlight guard now ignores pixels
   that are already white. The woods sky is 1.6% pure white in the browser's
   sample, and the first version switched the whole grade off. On the browser's
   own 160×90 samples, saved as `scratchpad/colour/browser-samples.json`, it
   returns (brightness/contrast/saturation):
   ΩΛ-XJ run 1.09/1.15/1.10, slow 1.13/1.15/1.11; DCKΨ- both 1.20/1.03/1.12;
   woods run 1.04/1.03/1.09, slow 1.05/1.04/1.09. Tests: 8 passed.
2. Press Auto on all six video clips (ΩΛ-XJ, DCKΨ-, Δ-ΛRZ; Austen approved
   all three, colour only) and confirm the saved values. DCKΨ- is done
   (archive `1790792470489-…json`, updatedAt 18:21:10Z, both clips
   1.2/1.03/1.12, six captions intact). Woods and ΩΛ-XJ wait for the sky fix.
3. Full exports of all three, tab visible.
4. Austen: open DCKΨ- and press "Tap beats" → check on both takes (the derived
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
- Primary checkout has another task's uncommitted edits (worktree-automerge,
  worktree-workflow rule, elemental glyph files, sounds). Leave them alone.
- Treat InShot `.profile` files as the authority; never modify them.
- The "Use ΩΛ-XJ template" button replaces the destination's captions with the
  template's. Re-applying it to DCKΨ- would swap its six captions for ΩΛ-XJ's
  four. Don't press it on DCKΨ- again.
- InShot's Auto Adjust is an AI LUT model (`lut0-2.bin`, `pallet.model` in the
  app). Don't commit or use those proprietary files; the new Auto only
  imitates its measured result.
