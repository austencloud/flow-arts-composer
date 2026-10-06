# Feature Video Pipeline and the 1.0 Promo: Design

Date: 2026-10-06. Status: approved in conversation (session 52d73a85),
2026-10-05 to 2026-10-06. Austen delegated the build and production decisions
("take the wheel"); the gates listed under Part C stay with him.

## Summary

Flow Arts Composer 1.0 gets a 60-second vertical promo for flow artists on
Instagram and YouTube, with 30 s and 15 s cuts. It is the first video made in
Post Studio as a **feature video**: a project that lives in a folder on this
computer, opens in the Post editor, and can be changed equally well by an agent
through the command line or by hand in the editor. Four additions make that
possible: folder-backed projects, a music lane with a beat grid, app recordings
as clips, and a saved end-card link with a scripted render. The same pipeline
is meant to produce later feature videos.

## Decisions already made

| Topic         | Decision                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Audience      | Flow artists on Instagram and YouTube. The July explainer video stays a separate project.        |
| Length        | 60 s master, then 30 s and 15 s cuts.                                                            |
| Aspect        | 9:16 master first (1080×1920). A 16:9 version comes later from the same media.                   |
| Direction     | "Written, then spun": the app writes a sequence, then Austen spins it.                           |
| Footage       | New shoot.                                                                                       |
| Sound         | One licensed library track. No voiceover.                                                        |
| Words         | One plain caption line where needed, plus an end card. Caption words come from Austen's answers. |
| Sequence      | DCKΨ-. Austen: "Does not matter, that's NOT the point." The agent picks incidental content.      |
| Feature store | A folder on this computer, not Firestore.                                                        |
| Target        | Within 2 to 4 weeks of 2026-10-05.                                                               |

## Part A: The 1.0 promo

### Picture, beat by beat (60 s master)

Times are starting points. During assembly every cut moves to the nearest bar of
the chosen track (DCKΨ- was fitted at 86.96 BPM, so the music search targets
82 to 92 BPM, or 164 to 184 BPM counted in half time).

| Start | Shot                                                                 | Source                      |
| ----- | -------------------------------------------------------------------- | --------------------------- |
| 0:00  | DCKΨ- draws itself in the tunnel ring                                | App recording               |
| 0:04  | One step's notation, large                                           | Post card or animation item |
| 0:06  | Austen spins that same step: dark room, LED staffs                   | Footage                     |
| 0:15  | Split screen: footage above, the notation below, in time             | Footage plus animation item |
| 0:30  | The real builder adds DCKΨ- step by step, with the visible pointer   | App recording               |
| 0:38  | The 3D performer spins DCKΨ-                                         | App recording               |
| 0:45  | Full-frame footage                                                   | Footage                     |
| 0:55  | Choreo card with QR code, app name, link, credits (Austen, musician) | Post card item              |

The 30 s cut keeps, in order: ring draw, notation, spin, split screen, builder,
3D performer, end card. The 15 s cut keeps notation, spin, split screen and end
card. Each cut is its own feature project that shares the master's media.

### Look

- Dark backgrounds throughout. The LED staffs and the notation carry the color.
- Real app recordings at their native size, never mocked up, shrunk into a
  device frame or redrawn.
- No title bands, labels, gradients, kinetic type or zoom punches. Cuts land on
  the beat.
- Captions: one line at a time in the app's UI font, white on the dark picture,
  at most three lines across the 60 s cut, each on screen for at least 2.5 s.
- Safe areas on 1080×1920: captions stay inside x 120 to 960 and y 270 to 1250
  (Meta's Reels safe zone, which also clears TikTok's right-side buttons).
  Anything that must be seen stays inside the centre 1080×1440 band, which is
  what Instagram's 3:4 profile grid shows.

### Words

Austen answers five prompts out loud or in writing. Caption lines are taken
from his answers, trimmed only to fit, and he approves each final line. No line
is written in his voice by anyone else.

1. When you show someone a written move for the first time, what do you tell them?
2. What changes for a spinner once their sequence is written down?
3. Finish this sentence any way you like: Flow Arts Composer lets you…
4. Why do you write your own sequences down?
5. If a spinner remembers one line from this video, what should it be?

### Sound

The track alone, mixed to an integrated loudness of −14 LUFS with true peak at
or below −1 dBTP. The filmed takes are muted.

### Guardrails

- Never claim the app covers all props.
- Never claim the first notation for flow arts.
- Never imply the app reads or transcribes video. In every sequence of shots,
  the writing comes before the spinning.
- Post Studio is in early access and is not shown or advertised in the promo.

## Part B: Post Studio as a feature video pipeline

### Goals

- A feature video is a folder on disk that the Post editor opens, edits and saves
  in place, and that an agent can read and change with the existing
  `scripts/post-project.mjs` CLI whether or not an editor is open.
- Media in a feature project survives reloads with no re-picking of files.
- Music has its own lane, a beat grid, snapping and a correct export mix.
- App recordings are scripted, repeatable, and re-recordable in place without
  losing trims or framing.
- An agent can trigger a render and get the MP4, stills and a loudness report
  back on disk.

### Non-goals

- Headless rendering. Export stays in a real browser tab.
- More than one featured sequence per project. Other sequences appear as app
  recordings.
- Music in ordinary posts. The music lane is offered only in feature mode.
- Automatic captions, kinetic type or text animation.
- Cloud sync of feature projects, and any production deploy of these routes.

### Capability discovery

Search terms used on 2026-10-06: post-studio-drafts, savePostDraft,
post-project-store, waveform, wavesurfer, Content-Range, 206, bpm,
analyzeAudioBpm, snapToTargets, TimeRuler, planProjectAudio, mixPostAudio,
replaceTakeMedia, browser-director, launch-chrome-debug, qrUrl,
exportPostStudioVideo, renderPost. Paths are relative to `src/lib/` unless they
start with `scripts/`, `src/routes/` or `docs/`.

| Need                     | Closest existing owner                                                                                                            | Decision                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects saved on disk   | `scripts/post-studio-draft-storage.mjs` (`/_local/post-studio-drafts`), `shared/media-composition/services/post-project-store.ts` | **Create** `server/feature-video-store.ts`. The draft archive is keyed by sequence, keeps records only, has no media and resolves newest-wins; feature projects are keyed by slug, hold media and need revision-checked writes. |
| Editor persistence       | `createPostEditorState` calls `savePostProject`, `saveTakeTiming` and `savePostEditorHistory` directly                            | **Extend** `PostEditorDeps` with an optional store port. The default stays the current device stores.                                                                                                                           |
| Loopback-only dev routes | `authorize` in `src/routes/api/dev/post-project/+server.ts`                                                                       | **Extend**: move it to `server/dev-loopback.ts` and use it from both route families.                                                                                                                                            |
| Agent edits              | `server/post-project-dev-bridge.ts`, `shared/media-composition/domain/post-project-ops.ts`                                        | **Extend**: sessions carry a feature slug, a `render` command, new ops.                                                                                                                                                         |
| Locked parts of a post   | `shared/media-composition/domain/post-project-bridge-guard.ts`                                                                    | **Extend**: takes that point at feature media may be added or removed.                                                                                                                                                          |
| Waveform drawing         | `wavesurfer.js` ^7.12.1 (a dependency), used by `features/compose/timeline/components/TimelineAudioTrack.svelte`                  | **Compose** wavesurfer.js in a new Post lane. `TimelineAudioTrack` is bound to the Compose timeline state and is not reused.                                                                                                    |
| BPM detection            | `analyzeAudioBpm` in `features/compose/compose/phases/audio/bpm-analyzer.ts`                                                      | **Extend** by relocating it to `shared/audio/bpm-analyzer.ts` (this is its second consumer); Compose imports from the new path with no behavior change.                                                                         |
| Snapping                 | `snapToTargets` in `shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts`                                | **Extend** with beat and bar targets. Compose's `SnapService.ts` belongs to a different timeline model.                                                                                                                         |
| Ruler                    | `shared/timeline/TimeRuler.svelte`                                                                                                | **Extend** with optional labelled marks for bar numbers. Existing consumers pass nothing and are unchanged.                                                                                                                     |
| Export audio             | `planProjectAudio` and `mixPostAudio` (`domain/post-audio-plan.ts`), `buildPostAudioTrack` (`services/post-audio-track.ts`)       | **Extend** with a music segment and per-segment fades.                                                                                                                                                                          |
| Preview audio            | The `PreviewVideoController` read, align and hold pattern in `PostStudioMediaLayer.svelte`                                        | **Compose** the same pattern for one `<audio>` element. If the sync code is identical, extract it into a shared helper both use.                                                                                                |
| Re-record in place       | `replaceTakeMedia` in `domain/post-project-edits.ts`                                                                              | **Reuse**, with an added clamp when the new file is shorter.                                                                                                                                                                    |
| Scripted app capture     | `scripts/demo-capture/browser-director.mjs`, `encode-frames.py`, `mount-pointer.ts`, `CapturePointer.svelte`                      | **Extend** the director with a page port and a screencast size option. **Create** the runner `scripts/feature-video/capture.mjs` with a raw CDP adapter.                                                                        |
| Capture browser          | `scripts/launch-chrome-debug.ps1`                                                                                                 | **Reuse** with `-Port 9223` and its own profile directory.                                                                                                                                                                      |
| End-card QR link         | `qrUrl` dependency of `shared/choreo-card/state/choreo-card-qr-state.svelte.ts`                                                   | **Reuse**; the Post card item gains a stored `qrUrl`.                                                                                                                                                                           |
| Export                   | `exportPostStudioVideo` (`services/post-studio-exporter.ts`), `renderPost()` in `PostEditorWorkspace.svelte`                      | **Reuse**, plus a dev render hook and an on-disk destination.                                                                                                                                                                   |

### Piece 1: Feature video projects

#### Folder layout

The root is `TKA_FEATURE_VIDEO_ROOT` when set, otherwise
`E:/tka-platform-media/feature-videos`. Every dev server on this computer,
including worktree previews, reads the same root.

```
<root>/<slug>/
  project.json      the project file (format below)
  history/          earlier project.json versions, one file per saved revision
  media/
    footage/        filmed takes as H.264 MP4
    captures/       app recordings made by the capture runner
    music/          the licensed track
    images/         stills used as items
  captures/         capture scripts (<id>.capture.mjs) and raw frames (frames/<id>/)
  exports/          rendered MP4s, stills/, contact sheets, loudness reports
```

A slug matches `^[a-z0-9][a-z0-9-]{0,62}$`.

#### Project file

```ts
interface FeatureVideoFile {
  format: "feature-video-v1";
  slug: string;
  title: string;
  /** Starts at 1 and goes up by one on every saved write. */
  revision: number;
  savedAt: number;
  project: PostProject; // the existing v2 schema, parsed with PostProjectSchema
}
```

`project.sequenceId` is the featured sequence. Storage is keyed by slug, so a
feature project on DCKΨ- never touches the ordinary DCKΨ- post.

#### Server (dev only, loopback only)

`server/feature-video-store.ts` owns reading and writing feature folders.
`src/routes/api/dev/feature-videos/` exposes it:

| Route                                         | Method | Behavior                                                                                                                        |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `/api/dev/feature-videos`                     | GET    | Lists projects: slug, title, revision, savedAt, sequenceId.                                                                     |
| `/api/dev/feature-videos`                     | POST   | Creates a project: `{slug, title, sequenceId, canvas}`. 409 when the slug exists.                                               |
| `/api/dev/feature-videos/<slug>`              | GET    | Returns the file plus its fingerprint (`fingerprint()` from the bridge).                                                        |
| `/api/dev/feature-videos/<slug>`              | PUT    | `{baseRevision, project}`. Writes revision + 1 when `baseRevision` matches, otherwise 409 with the current revision.            |
| `/api/dev/feature-videos/<slug>/ops`          | POST   | Applies `PostProjectOp[]` server-side through `applyPostProjectOps`. 409 while an editor session on this server holds the slug. |
| `/api/dev/feature-videos/<slug>/media/<path>` | GET    | Streams a file under `media/` with single-range support (206, 416, `Accept-Ranges: bytes`).                                     |
| `/api/dev/feature-videos/<slug>/exports`      | POST   | Streams an uploaded render into `exports/` (piece 4).                                                                           |

Writes are serialized per slug inside one server process. Each write goes to a
temporary file, is renamed into place, read back and compared, the same pattern
the draft archive uses. The previous `project.json` is copied into `history/`
first. History keeps the newest 200 revisions.

Every route uses `server/dev-loopback.ts`: 404 outside `dev`, loopback host and
loopback client only, same origin for anything but GET. Media paths are
resolved and must stay under `<root>/<slug>/media/` after resolving `..`,
percent-encoding, backslashes and symlinks. Media extensions are limited to
`.mp4 .mov .m4a .mp3 .wav .aac .jpg .jpeg .png .webp`. `project.json` is capped
at 12 MB, matching the bridge.

#### Editor in feature mode

- `/post?feature=<slug>` opens a feature project. It works only when
  `import.meta.env.DEV` is true. In dev, the Post project list shows a
  "Feature videos" group read from the list route.
- Feature mode skips the Post early-access check (`canAccessPostStudio()`),
  because everything behind it exists only on a dev server and only for
  loopback clients. This lets the guest capture browser open and render a
  feature project. The plan's first task confirms a guest can load the
  featured sequence. If it cannot, the capture profile gets a one-time sign-in
  by Austen instead.
- `PostModule.svelte` loads the file, opens the featured sequence through its
  usual path, and passes the project as `initialProject` with a feature store.
- `createPostEditorState` gets an optional `store` dependency with project,
  timing and history load and save functions. The feature store keeps its
  in-tab buffer under its own key prefix, `tka:feature-video:v1:<slug>:`, so no
  existing scanner of `tka:post-studio:*` keys ever sees it, and it saves
  durably with a debounced PUT.
- Takes in a feature project are `linked` takes whose URL is the media route,
  for example `/api/dev/feature-videos/promo-1-0/media/footage/take-03.mp4`.
  They are same-origin, so the current CSP `media-src 'self'` already allows
  them, and they need no re-pick after a reload.
- The editor heartbeat (`services/post-project-dev-client.ts`) sends the slug.
  The bridge answers with the file's current revision. When that revision is
  newer than the one the editor's own last save returned, the editor pulls the
  file in as one undo step.
- Conflict rule: disk wins and Undo keeps the editor's version. A 409 on save,
  or a newer revision seen in a heartbeat, loads the disk version as a new undo
  step and shows a one-line notice. No edit is lost, because the replaced
  version is one Undo away.

#### Agent access

- Commands that act on a project take `--feature <slug>`. When an active
  editor session holds the slug, edits go through the bridge and land as undo
  steps in that editor. Otherwise they go to the `ops` route and are written to
  the file. An editor open on a different dev server sees the new revision on
  its next heartbeat and pulls it in, so disk stays the single source.
- The bridge guard allows adding and removing takes whose URL starts with
  `/api/dev/feature-videos/`. Changes to other takes, timings, images and fonts
  stay locked.
- New commands: `create <slug> --sequence <id>`,
  `add-take <file> [--label]`, `duplicate <slug> <new-slug> [--share-media]`.
- `add-take` copies the file into `media/footage/`, reads its duration with
  ffprobe, and makes an H.264 High MP4 copy (CRF 16, AAC 192 kbps, frame rate
  kept) when the source is not H.264 in MP4, such as iPhone HEVC.
- `duplicate --share-media` keeps the new project's takes pointing at the
  source project's media, which is how the 30 s and 15 s cuts share files.
- `docs/development/post-studio-manifest-bridge.md` documents every new command.

### Piece 2: Music lane

#### Data

`PostProject` gains an optional field, so every saved v2 project still parses
and no schema version bump is needed:

```ts
music?: {
  id: string;
  /** A feature media URL, like takes; must start with /api/dev/feature-videos/. */
  url: string;
  label: string;
  artist?: string;
  /** Library, license id and purchase date, as free text. */
  license?: string;
  /** Where sourceInSeconds lands on the post's clock. */
  startSeconds: number;
  sourceInSeconds: number;
  sourceOutSeconds: number; // greater than sourceInSeconds
  durationSeconds: number;  // the file's length
  gain: number;             // linear, 0 to 2, default 1
  fadeInSeconds: number;    // default 0
  fadeOutSeconds: number;   // default 0
  grid?: {
    bpm: number;            // 20 to 300, the TAKE_MIN_BPM..TAKE_MAX_BPM range
    /** Bar 1, beat 1, in the track's own seconds, so the grid moves with the clip. */
    downbeatSeconds: number;
    beatsPerBar: number;    // default 4
  };
}
```

#### Pure math

`shared/media-composition/domain/music-grid.ts` converts between bars and post
seconds:

`postSeconds(bar, beat) = startSeconds + (downbeatSeconds − sourceInSeconds) + ((bar − 1) × beatsPerBar + (beat − 1)) × 60 / bpm`

It also lists beat and bar times inside the music's span on the post clock.
`snapToTargets` takes those times as extra targets: bars always, beats when the
zoom puts them at least 12 px apart.

#### Lane

`PostTimelineMusicLane.svelte` sits under the tracks in `PostTimeline.svelte`
and uses the timeline's own pixels-per-second and scroll. It shows:

- the waveform, drawn by wavesurfer.js with interaction and its own scrolling
  turned off, sized to the clip at the timeline's zoom;
- bar lines (strong) and beat lines (faint) from `music-grid.ts`;
- bar numbers, through optional labelled marks added to `TimeRuler.svelte`.

The clip drags to move `startSeconds`, and its edges trim `sourceIn` and
`sourceOut`. Its inspector holds gain, fades, label, artist, license, BPM,
beats per bar, and the downbeat, which is set by tapping along or by dragging
the bar-1 line. "Suggest BPM" runs `analyzeAudioBpm` from its new shared home.
It shows the result and its confidence and is applied only when pressed.

#### Playback and export

- Preview: one `<audio>` element follows the timeline clock with the same read,
  align and hold rules that video preview uses.
- Export: `planProjectAudio` appends a music segment. `mixPostAudio` applies its
  fades. The `audio` setting now governs take sound only, and music always
  plays. The promo uses `audio: "silent"` plus music.
- `align-take <take>` estimates the offset between a take's camera audio and
  the music file by cross-correlating 200 Hz loudness envelopes extracted with
  ffmpeg. With `--place <item>` it sets that clip's `sourceIn` so the take sits
  in sync at its current position. This lines up footage shot while the track
  played out loud.
- After a render, `loudness <export>` runs ffmpeg's `ebur128` filter and reports
  integrated loudness and true peak. The agent adjusts `music.gain` toward −14
  LUFS.

#### CLI

`add-music <file> [--label --artist --license]` and
`music [--start --in --out --gain --fade-in --fade-out --bpm --downbeat --beats-per-bar]`.
Wherever a command takes a time, `@9` means bar 9 and `@9.3` means bar 9,
beat 3. Plain numbers and `m:ss.s` clocks keep their current meaning.

### Piece 3: App recordings as clips

#### Capture browser

A Chrome owned by the agent, started with the existing launcher:
`scripts/launch-chrome-debug.ps1 -Port 9223 -UserDataDir C:\Users\Austen\.claude\chrome-profile-capture`.
It is never Austen's own browser and never the shared 9222 agent browser, so a
capture cannot be disturbed by another task's tab. It records the app as a
guest.

#### Runner

`scripts/feature-video/capture.mjs --feature <slug> --capture <id> [--origin https://localhost:5173]`:

1. connects to the capture Chrome over the DevTools WebSocket (Node 24's
   built-in `WebSocket`; no new dependency);
2. opens a tab and sets device metrics from the script's viewport with
   `Emulation.setDeviceMetricsOverride`;
3. loads the script's URL, mounts the real pointer (`mount-pointer.ts`) and
   runs the script against the director;
4. records with the director's `shot()`;
5. encodes the frames to constant 30 fps with `encode-frames.py` into
   `media/captures/<id>.<n>.mp4`, where `n` counts up and no file is overwritten;
6. points the capture's take (the take whose URL is under
   `media/captures/<id>.`) at the new file, as described under Re-record, or
   adds a take labelled with the capture id when none exists.

The director currently calls a Codex runtime object (`tab.playwright.evaluate`,
`getByRole(...).fill/press`, `locator(...).getAttribute`, `domSnapshot`,
`tab.url`). It gains a small page port with `evaluate`, `fillByRole`,
`pressKey`, `getAttribute`, `url` and `snapshot`, with two adapters: the
existing Codex runtime, and a raw CDP adapter (`Runtime.evaluate`,
`Input.insertText`, `Input.dispatchKeyEvent`, a buffered event reader for
`readEvents`). `shot()` gains a size option so portrait captures are not
squeezed by today's 1920×1080 screencast cap.

#### Capture script

```js
// <root>/<slug>/captures/builder-dckpsi.capture.mjs
export default {
  id: "builder-dckpsi",
  url: "/create/construct",
  viewport: { width: 432, height: 768, deviceScaleFactor: 2.5, mobile: true },
  async run(director) {
    // director.click("…"), director.fill("…", 3), director.shot("builder", 8, async () => { … })
  },
};
```

432×768 CSS pixels at a device scale of 2.5 records 1080×1920. The 3D performer
is hidden on small screens, so its capture uses a tall desktop viewport such
as 1080×1920 CSS at scale 1, and the clip is framed in Post.

#### Re-record

A new op, `relink-take {take, url, durationSeconds}`, calls `replaceTakeMedia`
with no offset. When the new file is shorter, every clip's source range is
clamped to it. Trims, framing and keyframes otherwise stay as they were. A
dev-only "Re-record" button on capture-backed clips, which runs the runner
from the server, is the last step of this piece and the first thing cut under
time pressure.

### Piece 4: End-card link and render

#### Saved link

The Post card item gains `qrUrl?: string` (https only, at most 200
characters). Post passes it to the Choreo Card's QR state, which already
accepts a `qrUrl`, so the QR renders for a guest and inside the capture
browser. For DCKΨ-, the agent looks up an existing `tka.run` short code with a
read-only query. If none exists, Austen opens the DCKΨ- card once while signed
in, which creates the code through the normal app path, and the agent stores
the resulting link. The agent never writes short codes to production itself.

#### Render

- `render [--name <file>]` queues a bridge command for the slug's editor
  session. The dev client calls a render hook that `PostEditorWorkspace.svelte`
  registers around `renderPost()`, then streams the MP4 to the `exports` route.
  The result returns through the heartbeat, and the CLI prints the saved path.
- `render --open` first opens `/post?feature=<slug>` in the capture Chrome,
  brings the tab to the front so timers are not throttled, waits for the
  editor's heartbeat, renders, and closes the tab.
- In feature mode the editor's own Export button also saves into `exports/` and
  still offers the download.
- `stills <export> --at 0,4,6,15` writes JPEG frames with ffmpeg, and
  `contact-sheet <export>` tiles one frame per second into a single image. These
  are what the review loop and Austen's phone see.
- The exports route streams to disk with a 2 GB cap and accepts only a
  sanitized file name ending in `.mp4`.

### Error handling

| Failure                          | Behavior                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Store unreachable or write fails | The existing save-error banner shows. The in-tab buffer keeps the project.                                       |
| Save conflict (409)              | Disk version loads as an undo step, with a one-line notice.                                                      |
| Corrupt `project.json`           | The GET returns a readable error and every write is refused until the file is fixed or restored from `history/`. |
| Media file missing               | The take shows its existing missing-media state.                                                                 |
| Capture fails mid-run            | The runner exits non-zero, keeps the frames folder, and leaves the project untouched.                            |
| Render fails                     | The CLI prints the failure message and exits non-zero. Nothing is written to `exports/`.                         |
| BPM suggestion is uncertain      | It is shown as uncertain and never applied on its own.                                                           |

### Tests

Silent-bug tests, each in the nearest existing test folder:

- Feature mode never writes a `tka:post-studio:project:v2:*`,
  take-timing or history key: open a feature project on a sequence that has an
  ordinary post, make edits, and assert the ordinary keys are byte-identical.
  This protects Austen's real posts.
- Store: matching `baseRevision` writes revision + 1 and archives the previous
  file; a stale `baseRevision` returns 409 and leaves the file unchanged.
- Media paths: `..`, encoded `%2e%2e`, backslashes, absolute paths and a
  symlink leading out of the root are all refused.
- Range parsing: full file, `bytes=a-b`, `bytes=a-`, `bytes=-n`, out of bounds
  (416), and more than one range (full 200 response).
- Bridge guard: feature-media takes may be added or removed; other take
  changes and timing changes are still refused.
- Schema: a v2 project without `music` parses unchanged; one with `music`
  round-trips.
- `music-grid.ts`: bar and beat to seconds and back, with non-zero
  `sourceInSeconds` and `startSeconds`, three beats per bar, and times before
  bar 1.
- Snap targets include beats and bars only inside the music's span.
- `planProjectAudio` with music: start, source in, duration, gain and fades,
  and music still present under `audio: "silent"`.
- `mixPostAudio` fades: known sample values at the start, middle and end of a
  fade.
- `align-take`: a synthetic signal with a known offset is recovered to within
  one envelope sample.
- Time arguments: `@9`, `@9.3`, `12.5`, `0:12.5`.
- `relink-take`: a shorter file clamps every clip's source range, and a longer
  one keeps every trim.
- Raw CDP adapter: the event reader honors `methods`, `afterSequence` and
  `limit`.
- Card `qrUrl`: https only, length cap.
- Loudness parsing from a captured ffmpeg `ebur128` summary.

Integration check, run as a script against a real browser: a fixture feature
project with a generated two-second test clip and a click track renders, and
the export's first click lands within one frame of its planned time.

Browser checks for the music lane follow the visual verification contract: all
viewport tiers where the Post editor appears, drag and trim transitions, and a
30-second playback measuring drift between the audio element and the timeline
clock (target under one frame).

### Risks

| Risk                                                       | Mitigation                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| An edit in feature mode overwrites the ordinary DCKΨ- post | The store port, the separate key prefix, and the first test above.                        |
| Range requests misbehave in the SvelteKit dev endpoint     | First task of piece 1: stream a 4K file and seek it in the browser before building on it. |
| Preview music drifts from the picture                      | The video controller's align and hold rules, measured over 30 s.                          |
| The capture runner depended on the Codex runtime           | The page port and raw CDP adapter, proven on one short shot before any real capture.      |
| 4K60 footage stutters in preview                           | Measure on the first real take; if it stutters, add a lower-resolution preview copy then. |
| The 3D view is hidden on small screens                     | Capture it at a tall desktop viewport.                                                    |
| The QR short code needs a signed-in user                   | The stored `qrUrl`; the code is looked up or created by Austen in the normal app path.    |
| Rendering in a hidden tab is throttled                     | `render --open` brings its tab to the front.                                              |
| Bridge sessions live in one server process                 | The CLI's `--origin` picks the server whose editor holds the session.                     |
| Large files                                                | E: had 151 GB free on 2026-10-06. Exports and captures stay on E:.                        |

### Build order and delivery

Four pieces, each with its own implementation plan, in its own worktree under
`E:/worktrees/tka-platform/`, on its own `codex/` branch, and integrated with
`npm run wt:finish`: pieces 1, 2
and 4 with `--route /post`, piece 3 with `--nonvisual` unless the Re-record
button ships. Pieces 1 and 2 come first because the music has to be in place
before the shoot. A Sonnet subagent implements each task from the plan, an Opus
subagent reviews each piece, and the coordinating session verifies in the
browser. `docs/architecture/canonical-capabilities.md` gains entries for the
feature store, the music lane and the capture runner.

## Part C: Production

### Gates that stay with Austen

- Listening to the shortlist, picking the track, and buying its license.
- Answering the five prompts and approving every caption line.
- Spinning in the shoot.
- Approving the motion of each assembled section.
- The final OK, and posting.

### Steps

1. **Style guide.** `docs/architecture/feature-video-style.md` records the look
   rules above, the safe areas, the end-card layout, export settings, loudness
   targets and file naming, so later feature videos start from it.
2. **Music.** A background search names a library and a shortlist of three to
   five tracks near the target tempo, with license terms that allow social
   video. Austen listens, picks and buys. The agent never purchases, signs up
   or downloads on his behalf.
3. **Words.** Austen answers the five prompts. The agent proposes caption lines
   cut from his answers, and he approves them.
4. **App captures.** Ring draw, builder and 3D performer, as capture scripts in
   the promo's folder.
5. **Shot list and shoot.** Written once the track and captures exist. Shoot
   horizontal 4K at 60 fps, H.264 ("Most Compatible" on iPhone), on a tripod,
   with the track playing out loud so `align-take` can sync each take.
6. **Assembly.** One section at a time: stills and a contact sheet, an Opus
   critic pass against the style guide, then Austen's sign-off on the motion.
7. **Mix and cuts.** Loudness to −14 LUFS. The 30 s and 15 s cuts are
   duplicates sharing the master's media.
8. **Delivery.** Approved cuts are copied, never moved, to
   `D:\_THE KINETIC ALPHABET\_PROMOS\promo-1-0-2026-10\`. Austen posts.

### Schedule

| Week of    | Work                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| 2026-10-05 | Spec and plan, style guide, track shortlist and pick, prompts, pieces 1 and 2 |
| 2026-10-12 | Pieces 3 and 4, app captures, shot list, shoot                                |
| 2026-10-19 | Assembly with sign-offs, mix, cuts                                            |
| 2026-10-26 | Spare                                                                         |
