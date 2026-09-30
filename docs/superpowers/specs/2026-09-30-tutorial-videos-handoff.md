# Halloween Tutorial Videos — Handoff (2026-09-30)

Living document. Updated at every milestone by whichever agent holds the work.
Last update: 2026-09-30, after Austen's answers, the draft-loading measurement,
and recovery of the phone-pull recipe (Claude Opus 5.5 session). That session
stopped on a usage limit before pulling the DCKΨ- draft.

## Mission

Austen needs three vertical 1080×1920 tutorial videos for the Halloween
devil-staff contest, all exportable by the night of 2026-10-01 (contest due
about 2026-10-02). The three sequences are the Firestore library folder
**"To Attach to Videos"** (`users/PBp3GSBO6igCKPwJyLZNmVEmamI3/collections/a30552c7-1ebf-462f-a91d-78764cbb52a7`):
`DCKΨ-`, `ΩΛ-XJ`, `Δ-ΛRZ` (the forest/"woods" one). He wants all three to
follow one template (the finished ΩΛ-XJ project) with as few decisions as
possible on his side. Background and every earlier Post Studio decision:
memory `project_halloween_tutorial_videos.md`; the earlier Codex ledger is
`C:/Users/Austen/Downloads/InShot-recovery-2026-09-29/POST-STUDIO-STATUS.md`.

## Where each video stands (evidence gathered 2026-09-30)

| Video | Project | Media | State |
| --- | --- | --- | --- |
| ΩΛ-XJ | Disk archive `~/.tka/post-studio-drafts`, key `tka:post-studio:project:v2:ΩΛ-XJ`, newest file was `1790750362961-d15976c6-….json` (77.69 s, includes the added Mandala). **Austen is editing it live**: updatedAt moved to 07:15:39Z on 2026-09-30. Re-read the newest file before copying anything from it. A second lineage without the Mandala sits in the 5197 preview's own root (`…/post-studio-verified-batch-20260929/.beat-live-drafts`). 5173 loads the `~/.tka` one. | Linked static files in the primary checkout, gitignored via `.git/info/exclude`: `static/word-videos/inshot-recovery/{camera-cut-1.mp4 (2160×3840 59.94fps, 25.14 s), camera-cut-2.mp4, pictograph.mp4, ending-card.png, PermanentMarker.ttf}` | **The template.** Recovered from InShot draft `Video_20260906_213218030.profile`, then edited by Austen. Never fully exported yet. |
| Δ-ΛRZ (woods) | Disk archive, key `tka:post-studio:project:v2:Δ-ΛRZ`, newest file `1790742818893-0dfaed05-….json` (04:33Z; re-saved unchanged at 07:19Z). | **Local** refs (re-pick after every reload): `C:/Users/Austen/Downloads/InShot-woods-recovery-2026-09-29/woods-cut-1.mp4` (1080×1920 60fps, 16.17 s) and `woods-cut-2.mp4` (31.27 s), cut from raw `20260819_160715.mp4` in the same folder (InShot draft `Video_20260906_001628561.profile`). | **Half built.** Three main clips at speed 0.7 (full speed split in two + slow breakdown), 23 zoom keys on the slow clip, crossfade, one animation overlay on the slow clip. Missing vs template: dual view on the run-through, captions, Moves PiP, mandala, card, auto colour, mirror, font. Tapped beats: 33 on take 1, 16 on take 2. |
| DCKΨ- | **None in Post Studio.** Not in `~/.tka/post-studio-drafts` (5173 endpoint returned `{"records":[]}` for `DCKΨ-` and `DCKψ-`), not in the 5197 root, not in the in-app browser's localStorage. | Austen (2026-09-30): the source is **an InShot draft on his phone**. Not pulled yet. Low-res fallbacks only: `static/word-videos/DCK-Psi-performance.mp4` (720×1280, 22.7 s), Firestore `videos/DCKΨ-_1789408969122` (48.81 s, private). | **Next step: pull the draft** (recipe in Gotchas), decode, build on the template. |

## The ΩΛ-XJ template, as saved

Canvas 9:16 (default), background dark, `mirrored: true`, audio from takes.

1. **Run through**, 0–25.14 s: take "Full Speed" in the top half (box y 0,
   h 0.5) with a source crop; animation overlay fills the bottom half
   (`animation-1`, anchored, fadeOut 1). Auto colour on at 0.4.
   Crossfade out 1 s.
2. **Slow part**, 24.14–72.69 s: take "Half Speed" (he filmed it slow; speed
   1.0) full frame, 17 zoom/pan keys (InShot's eased curves), fadeOut 0.5,
   auto colour. Overlays:
   - `moves-1` mandala, bottom-left strip box (x 0, y 0.74, w 0.463, h 0.26), first 5 s of the slow part.
   - `moves-2` "alternate" PiP, bottom-right (x 0.603, y 0.776, w 0.337, h 0.19), whole slow part.
   - Captions in PermanentMarker, anchored to the slow clip, landing on its
     tapped beats: "Mirror me!" (~beat 1, offset 1.46 s), "Don't give up! "
     (~beat 5, 15.10 s), "You got this! " (~beat 9, 27.53 s),
     "Now repeat 100x" (~beat 15, 45.56 s). Each lasts ~5 s (last one runs
     to the card).
3. **Card**, 72.69–77.69 s, fadeIn 0.5.

The in-app "Tutorial" preset (`applyTutorialPreset` in
`src/lib/shared/media-composition/domain/post-project-looks.ts`) builds an
older layout (dual view, then the breakdown strip + carousel, then the card).
It does **not** reproduce the ΩΛ-XJ template: no captions, PiP, mandala,
crossfade, colour or mirror.

## Done — verified

No product code changed yet.

- Located all three projects/media as in the table (listing
  `~/.tka/post-studio-drafts`, node summaries of each JSON, `ffprobe`,
  Firestore reads of the collection and `videos`).
- Codex "Post as its own tab" landed on main as `3c478389db`. Route:
  `https://localhost:5173/post?project=<sequenceId>` (module `post`,
  `src/lib/features/post/`). Its project list reads browser localStorage
  only; `?project=ΩΛ-XJ` still loads the disk draft. Do not edit its files.
- **Draft loading is not a hazard; no fix needed.** Measured 2026-09-30:
  server read of the archive 220 ms for 300 files / 24 MB; 5173 endpoint
  time-to-first-byte 0.48 s for the ΩΛ-XJ response; client
  `resolvePostStudioDraft` 331 ms for 303 records. Each autosave adds about
  80 KB and about 1 ms, so the client's 10 s deadline is far away. An earlier
  two-minute curl was a transient server stall. If it ever matters: cache
  parsed archive files in memory (files are immutable); do not switch to
  "newest file only", because timings merge across the whole history.
- **Phone access works.** `adb connect 192.168.12.208:37163` → connected
  (2026-09-30). `run-as` fails (package not debuggable), and
  `/sdcard/Android/data/com.camerasideas.instashot/files/inshot/` holds only
  `.cache`, so drafts must come through InShot's content provider (recipe in
  Gotchas, taken from the Codex session that pulled the other two drafts).

## Believed true — unverified

- Full-length export of any of the three has not been run. Memory lists
  "full export render with keyframes" as untested; InShot parity is "Open"
  in the Codex ledger (auto-adjust and letter-slide text are approximations).

## In flight

- Worktree `E:/worktrees/tka-platform/tutorial-videos`, branch
  `codex/tutorial-videos` (from main `3c478389db`). Holds only this doc.
  Its `node_modules` is a junction into the primary checkout: unlink it
  (`cmd /c rmdir`) before any manual worktree removal; `wt:finish` does this.
- Preview servers left running by earlier Codex agents (do not kill; they are
  Austen's): 5195, 5197, 5198. All serve a frozen 2026-09-29 build, so new
  code never appears there.

## Loose ends (ranked)

1. **Pull the DCKΨ- InShot draft.** Read InShot's mmkv file to list draft
   paths, pick the one that is neither `Video_20260906_213218030` (ΩΛ-XJ)
   nor `Video_20260906_001628561` (woods) and matches DCKΨ- (ask Austen with
   a multiple-choice list if several candidates remain). Pull it and every
   media path it references into a new folder
   `C:/Users/Austen/Downloads/InShot-DCK-recovery-2026-09-30/`. Read-only on
   the phone. Decode with the existing tooling
   (`post-inshot-import.ts` / `inshot-recovery-package.ts`, or the Python
   pattern in `…/InShot-woods-recovery-2026-09-29/build-project.py`).
2. **"Use ΩΛ-XJ as template" action.** Copy the template's structure onto
   another sequence's two takes: dual view on the run-through, crossfade,
   slow part full frame, captions on the **same beat numbers** of the
   target's slow pass (proportional fallback when it has no taps), Moves
   alternate PiP, 5 s mandala, card, auto colour, mirror, PermanentMarker.
   Keep each take's own zoom keys and speed. Owner:
   `post-project-looks.ts` beside `applyTutorialPreset`, reached through
   `applyTutorial` in `post-editor-state.svelte.ts` (~line 958). Focused unit
   test. Minimal new UI text (`messages/en.json` just changed on main).
3. **Δ-ΛRZ.** Copy the woods cuts next to the ΩΛ-XJ media
   (`static/word-videos/inshot-recovery/` or a sibling, gitignored) and
   switch the refs to linked, then apply the template. Keep speed 0.7.
4. **Early full export of ΩΛ-XJ** to shake out render problems. Keep the tab
   visible (renders pause when hidden).
5. **DCKΨ-**: apply the template once item 1 lands.
6. Integrate via `npm run wt:finish -- codex/tutorial-videos --route /post`
   from `E:/tka-platform`, then verify
   `https://localhost:5173/post?project=<id>`.

## Decisions already made

- Austen, 2026-09-30: DCKΨ- comes from an InShot draft on his phone.
- Austen, 2026-09-30: Δ-ΛRZ keeps speed 0.7 on all clips.
- Austen, 2026-09-30: template captions land on the same beat numbers, not
  the same seconds.
- Austen, 2026-09-30: look at draft loading first (done; no fix needed).
- Never slow a clip to fake slow motion; he films the slow part
  (memory, 2026-09-26). The woods 0.7 is his explicit exception.
- ΩΛ-XJ, not DCKψ-, is the sequence for the recovered InShot draft
  `213218030`, and captions are English (Codex ledger, 2026-09-29).
- Mirror-me hand labelling is the default; colours look swapped against the
  footage on purpose.
- Split Crop from Zoom & pan only after the deadline.
- Codex subagents use GPT-6.1 Sol at High effort or above (Codex ledger,
  2026-09-29). Claude subagents get `model` set explicitly.

## Gotchas

- **Phone pull recipe** (from Codex session log
  `C:/Users/Austen/.codex/sessions/2026/09/29/rollout-2026-09-29T20-19-42-01a0efe5-6039-7822-870b-58a548fdc11f.jsonl`):
  - adb: `C:/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe`.
    Wireless; the port changes. Rediscover with `adb mdns services`
    (service `adb-RFCX71MRJ6J-5hnqJQ`), then `adb connect <ip:port>`.
  - URI = `content://com.camerasideas.instashot.file/` + base64url (no `=`
    padding) of the **absolute** path. Not `inshot_files_path/`; that gives
    "bad base-64".
  - Read: `adb -s <serial> exec-out content read --user 0 --uri <URI>`
    (binary-safe stdout; capture it in Python `subprocess.run(...,
    capture_output=True)`).
  - Draft list: read `/data/user/0/com.camerasideas.instashot/files/mmkv/instashot`
    and regex for `(/data/|/storage/|/sdcard/)….profile`.
  - Drafts live in `/data/user/0/com.camerasideas.instashot/files/inshot/.VideoProfile/<name>.profile`
    (JSON).
  - Media: walk the decoded draft for strings starting `/data/`,
    `/storage/`, `/sdcard/`. Pull `/data/` ones through the provider, others
    with `adb pull`.
  - Python used: `C:/Users/Austen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`.
- Do not edit Austen's live drafts for tests. Every save writes a new file
  into `~/.tka/post-studio-drafts`; test edits need an isolated draft root.
  He is editing ΩΛ-XJ right now.
- Never start, restart or kill port 5173, 5195, 5197 or 5198.
- Projects in browser storage are per origin (`localhost` vs `[::1]` vs each
  port). The disk archive is shared by every local server whose Vite config
  loads `postStudioDraftStoragePlugin`.
- Primary checkout has another task's uncommitted edits (worktree-automerge,
  worktree-workflow rule, elemental glyph files, sounds). Leave them alone.
- The `/test/post-studio` harness is hard-wired to ΩΛ-XJ.
- Recovery artefacts, scripts and the original InShot `.profile` drafts live
  in `C:/Users/Austen/Downloads/InShot-recovery-2026-09-29/` and
  `…/InShot-woods-recovery-2026-09-29/`. Treat the `.profile` files as the
  authority; never modify them.
- Chrome DevTools MCP needs Chrome launched first (it was not running); the
  in-app browser works but holds no localStorage for 5173.
