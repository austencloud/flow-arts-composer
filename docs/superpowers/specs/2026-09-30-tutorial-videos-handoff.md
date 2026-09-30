# Halloween Tutorial Videos — Handoff (2026-09-30)

Living document. Updated at every milestone by whichever agent holds the work.
Last update: 2026-09-30 07:15 CDT (Claude Opus 5.5 session, second pass).
Work branch: `codex/tutorial-videos-fixes`, worktree
`E:/worktrees/tka-platform/tutorial-videos-fixes` (node_modules is a junction
into the primary checkout; `wt:finish` unlinks it).

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

## Where each video stands (2026-09-30 07:15 CDT)

All three have a Post Studio project in the disk archive
`~/.tka/post-studio-drafts` (key `tka:post-studio:project:v2:<id>`). Open any
of them at `https://localhost:5173/post?project=<id>`. All media are linked
static files in the primary checkout, gitignored via `.git/info/exclude`:
`static/word-videos/inshot-recovery/` (camera-cut-1/2, pictograph, woods-cut-1/2,
dck-cut-1/2, ending-card, dck-original-end-card, PermanentMarker.ttf).

| Video | Newest project | State |
| --- | --- | --- |
| ΩΛ-XJ | updatedAt 07:15:39Z. 9 items, 77.69 s. | **The template.** Austen removed its mandala at 07:09Z and raised contrast/saturation with sliders at 07:15Z (run 1.17/1.12, slow 1.25/1.09). A tab keeps re-saving it unchanged (last 11:51Z); don't edit it. |
| Δ-ΛRZ | updatedAt 08:08:54Z. 10 items, 71.75 s. | Template applied by another agent. Speed 0.7 on both clips (Austen's call). Still has a mandala → remove. |
| DCKΨ- | updatedAt 08:22:31Z. 10 items, 82.67 s. | Template applied by another agent. **Wrong:** canvas 1:1 (source is 2160×3840 portrait; his InShot export was 1080×1920); run-through take has 0 taps; has a mandala; has ΩΛ-XJ's 4 captions instead of its own 6. Slow clip speed 0.8 comes from his InShot draft; keep. |

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

## In flight

1. Write corrected DCKΨ- and Δ-ΛRZ projects as new archive records (see
   decisions). Validate with the real schema and `resolvePostStudioDraft`
   before writing.
2. Template action: follow the template's canvas and add a mandala only when
   the template has one. Focused test in
   `tests/unit/media-composition/post-project-looks.test.ts`.
3. Auto colour audit (Austen 2026-09-30: "I want something CapCut or InShot
   tier"). Owner code: `domain/post-video-color-grade.ts`,
   `PostItemTool.svelte` `autoAdjustColor()`.
4. Full exports of all three, tab visible.

## Decisions already made

- 2026-09-30 (Austen): no mandala on any of the three.
- 2026-09-30 (Austen): DCKΨ- keeps its own six InShot captions, restyled like
  ΩΛ-XJ, at their original offsets into the slow part: "Practice with me! "
  (+0.427 s, 8.106 s), "Watch hands closely" (+12.807, 6.682), "Negative
  space is key" (+24.230, 6.140), "Go slower\nTo learn faster" (+34.445,
  7.798), "You got this! " (+47.924, 5.295), "Now repeat 100x" (+49.903, 3.0).
  Offsets are from InShot slow-clip start 21.904918 s.
- 2026-09-30 (Austen): colour — audit Auto colour first instead of copying
  ΩΛ-XJ's slider values.
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
