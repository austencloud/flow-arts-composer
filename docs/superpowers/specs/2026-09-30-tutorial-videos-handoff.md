# Halloween Tutorial Videos — Handoff (2026-09-30)

Living document. Updated at every milestone by whichever agent holds the work.
Last update: 2026-09-30, investigation pass finished (Claude Opus 5.5 session).

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
| ΩΛ-XJ | Disk archive `~/.tka/post-studio-drafts`, key `tka:post-studio:project:v2:ΩΛ-XJ`, newest file `1790750362961-d15976c6-….json` (saved 2026-09-30 06:39Z, updatedAt 02:52Z, 77.69 s, includes the added Mandala). A second lineage without the Mandala sits in the 5197 preview's own root (`…/post-studio-verified-batch-20260929/.beat-live-drafts`, updatedAt 03:22Z). 5173 loads the `~/.tka` one. | Linked static files in the primary checkout, gitignored via `.git/info/exclude`: `static/word-videos/inshot-recovery/{camera-cut-1.mp4 (2160×3840 59.94fps, 25.14 s), camera-cut-2.mp4, pictograph.mp4, ending-card.png, PermanentMarker.ttf}` | **The template.** Recovered from InShot draft `Video_20260906_213218030.profile`, then edited by Austen. Never fully exported yet (no record of a full render). |
| Δ-ΛRZ (woods) | Disk archive, key `tka:post-studio:project:v2:Δ-ΛRZ`, newest file `1790742818893-0dfaed05-….json` (04:33Z). Only 3 saves. | **Local** refs (re-pick after every reload): `C:/Users/Austen/Downloads/InShot-woods-recovery-2026-09-29/woods-cut-1.mp4` (1080×1920 60fps, 16.17 s) and `woods-cut-2.mp4` (31.27 s), cut from raw `20260819_160715.mp4` (1.37 GB) in the same folder. | **Half built.** Three main clips (full speed split in two + slow breakdown), 23 zoom keys on the slow clip, crossfade, one animation overlay on the slow clip. Missing vs template: dual view on the run-through, captions, Moves PiP, mandala, card, auto colour, mirror, font. All three clips run at speed 0.7 (see open questions). Tapped beats exist: 33 on take 1, 16 on take 2. |
| DCKΨ- | **None found.** Not in `~/.tka/post-studio-drafts` (5173 endpoint returned `{"records":[]}` for both `DCKΨ-` and `DCKψ-`), not in the 5197 root, not in the in-app browser's localStorage on `https://localhost:5173` or `https://[::1]:5173` (both empty), Chrome agent profile not running. | Only low-res copies known: `static/word-videos/DCK-Psi-performance.mp4` (720×1280, 22.7 s) and the Firestore video `videos/DCKΨ-_1789408969122` ("2023 recording", 48.81 s, private). No raw camera file with a separate slow part located. | **Blocked on Austen:** where is the footage / project? |

Other attached videos (Firestore `videos`, read-only check): ΩΛ-XJ has three
records, two of them the same 36.6 s upload (09-24 and 09-25, identical
size 31,571,227 B) plus an older 43.7 s one; Δ-ΛRZ has one private 48.08 s
"2023 recording".

## The ΩΛ-XJ template, as saved

Canvas 9:16 (default), background dark, `mirrored: true`, audio from takes.

1. **Run through**, 0–25.14 s: take "Full Speed" in the top half (box y 0,
   h 0.5) with a source crop; animation overlay fills the bottom half
   (`animation-1`, anchored, fadeOut 1). Auto colour on at 0.4.
   Crossfade out 1 s.
2. **Slow part**, 24.14–72.69 s: take "Half Speed" (he filmed it slow; speed
   1.0) full frame, 17 zoom/pan keys (InShot's eased curves), fadeOut 0.5,
   auto colour. Overlays:
   - `moves-1` mandala, bottom-left strip box, first 5 s of the slow part.
   - `moves-2` "alternate" PiP, bottom-right (x 0.60, y 0.78, w 0.34, h 0.19), whole slow part.
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

Investigation only so far; no product code changed in this session.

- Located all three projects/media as in the table (commands: listing
  `~/.tka/post-studio-drafts`, node summaries of each JSON, `ffprobe` on the
  media, Firestore reads of the collection and `videos`).
- Confirmed the Codex "Post as its own tab" work landed on main as
  `3c478389db` (merge of `codex/post-main-tab`, commits `d2ebb36e34`,
  `78e6f40c14`); its worktree is gone. New route:
  `https://localhost:5173/post?project=<sequenceId>` (module `post`,
  `src/lib/features/post/`). Its project list reads browser localStorage
  only, so a fresh browser shows no projects even though `?project=ΩΛ-XJ`
  still loads the disk draft.

## Believed true — unverified

- **Draft-load time-out hazard.** `scripts/post-studio-draft-storage.mjs`
  GET reads and JSON-parses every file in the archive on each load (223 files
  × ~80 KB and growing: every autosave adds a file). The client
  (`post-draft-storage.ts`) gives up after 10 s and falls back to browser
  storage, which is empty in a fresh browser, so the editor would open with
  no saved project. On 5173 the endpoint answered in roughly two minutes
  (curl, 2026-09-30); the cause of that slowness (parse cost vs a busy dev
  server) is not isolated. Measure before fixing. Note that
  `resolvePostStudioDraft` deliberately merges tap timings from the whole
  history, so "read newest file only" would change behaviour; an in-memory
  cache of parsed files (files are immutable once written) keeps it exact.
- Full-length export of any of the three has not been run. Memory lists
  "full export render with keyframes" as untested; InShot parity is "Open"
  in the Codex ledger (auto-adjust and letter-slide text are approximations).

## In flight

- Worktree `E:/worktrees/tka-platform/tutorial-videos`, branch
  `codex/tutorial-videos` (from main `3c478389db`). Holds only this doc.
- Preview servers left running by earlier Codex agents (do not kill; they are
  Austen's): 5195 (PID 156280, draft root `~/.tka`), 5197 (PID 44468, own
  root), 5198 (PID 135592, verification). All serve a frozen 2026-09-29 build
  from `…/post-studio-verified-batch-20260929`, so new code never appears
  there.

## Loose ends (ranked)

1. Get Austen's answers (see "Open questions"), DCKΨ- footage above all.
2. "Use ΩΛ-XJ as template" action: copy the template's structure onto another
   sequence's two takes. Place captions on the same beat numbers of the
   target's slow pass (fall back to proportional times when it has no taps);
   copy looks, PiP, mandala, card, crossfade, auto colour, mirror, font;
   leave each take's own zoom keys alone. Owner to extend:
   `post-project-looks.ts` (beside `applyTutorialPreset`), reached through
   `post-editor-state.svelte.ts`. Keep new UI text minimal; `messages/en.json`
   was just edited by the Post-tab merge.
3. Δ-ΛRZ: move the woods cuts next to the ΩΛ-XJ media (linked refs) so they
   load without re-picking, then apply the template.
4. Draft-load hazard (above): measure, then cache parsed archive files.
5. A real full export of ΩΛ-XJ early, to shake out render problems while
   there is time. Keep the tab visible (renders pause when hidden).
6. DCKΨ-: build from the template once footage exists.

## Open questions for Austen (asked 2026-09-30)

- Where is the DCKΨ- footage or project?
- Δ-ΛRZ clips all run at speed 0.7, including the "full speed" run through.
  Keep it, or set the run through back to 1.0? (His rule: never fake slow
  motion; he films the slow part.)
- Template behaviour: captions on the same beats (recommended) or the same
  seconds?

## Decisions already made

- Never slow a clip to fake slow motion; he films the slow part
  (memory, 2026-09-26).
- ΩΛ-XJ, not DCKψ-, is the sequence for the recovered InShot draft, and
  captions are English (Codex ledger, 2026-09-29).
- Mirror-me hand labelling is the default; colours look swapped against the
  footage on purpose.
- Split Crop from Zoom & pan only after the deadline.
- Subagents dispatched through Codex must use GPT-6.1 Sol at High effort or
  above (Austen, per the Codex ledger, 2026-09-29).

## Gotchas

- Do not edit Austen's live drafts for tests. Every save writes a new file
  into `~/.tka/post-studio-drafts`; test edits need an isolated draft root.
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
