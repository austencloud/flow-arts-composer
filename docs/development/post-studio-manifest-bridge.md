# Edit an open Post Studio manifest from a local file

The dev bridge lets a local script replace the manifest in one open Post Studio editor. It does not open media files or switch sequences. The editor applies a replacement as one undo step and saves through its normal local storage and draft autosave. The bridge runs only in development and accepts loopback, same-origin requests.

## Named edits (the usual way)

Most changes need no manifest file. Each command below is one of the timeline's own edits, applied to the editor's current project on the server and delivered as one undo step. With one editor open the session is found automatically; otherwise pass `--session ID` or `--sequence ID`. A command waits until the editor confirms.

```powershell
node scripts/post-project.mjs show                       # items, tracks, times
node scripts/post-project.mjs add-hook --speed ease-out  # opening tunnel on the animation
node scripts/post-project.mjs hook-speed linear          # name, or x1,y1,x2,y2, or default
node scripts/post-project.mjs remove-hook
node scripts/post-project.mjs line-up-hook                 # tunnel ends on the footage's opening pose, footage dimmed behind it
node scripts/post-project.mjs appearance --item animations --set stepNumbers=false --set tkaGlyph=null
node scripts/post-project.mjs item --item ITEM_ID --patch '{"opacity":0.5}'
node scripts/post-project.mjs trim --item ITEM_ID --edge end --seconds 12
node scripts/post-project.mjs delete --item ITEM_ID
node scripts/post-project.mjs canvas 9:16
node scripts/post-project.mjs background blur
node scripts/post-project.mjs ops --file ops.json        # several edits, one undo step
```

`--item` takes an id, `hook` (the animation that opens with the tunnel), `animations` or `all`. The opening tunnel is part of the animation item itself, one canvas from the first frame to the last; a post saved with the tunnel as a separate item is merged into its animation when it opens. `--set key=value` accepts `true`, `false`, `null` (clears the flag), numbers and text. `ops.json` is an array such as `[{"op":"add-hook"},{"op":"hook-speed","speed":"smooth"}]`; a failing edit names its position and nothing is applied. A change that alters nothing returns `unchanged`. The editor tab must be open on the post, because the open editor owns the saved draft: a script never writes the draft file itself.

Ownership: `post-project-ops.ts` maps each named edit onto the existing pure edit in `post-project-edits.ts`; `queuePostProjectOps` in the bridge applies them to the session snapshot and reuses the manifest queue below.

## Whole-manifest replacement

With the editor open on the local dev server:

```powershell
node scripts/post-project.mjs list
node scripts/post-project.mjs read --session SESSION_ID --out post-session.json
```

`post-session.json` contains `snapshot`, `revision`, and `fingerprint`. Copy `snapshot` into a separate JSON file and edit it. Pass the exact revision and fingerprint returned by `read`:

```powershell
node scripts/post-project.mjs apply --session SESSION_ID --base-revision REVISION --base-fingerprint FINGERPRINT --file edited-post.json
node scripts/post-project.mjs status --session SESSION_ID --command COMMAND_ID
```

Add `--url http://127.0.0.1:PORT` to each command for a task-owned preview. The default is `https://[::1]:5173`. `apply` returns a command ID; `status` reports `pending`, `completed`, or `failed`. If an editor edit lands between `read` and `apply`, or before delivery, the bridge rejects the replacement. Read again and rebase your change onto that snapshot.

The replacement must be a complete, valid `PostProject` for the same sequence. This first version holds `takes`, `images`, `timings`, `mappingPreviewAppearances`, `fonts`, and `importSource` fixed. It supports timeline, transition, appearance, canvas, audio, and other manifest fields covered by the project schema. The editor normalizes timeline layout after applying the replacement. The open media bindings and playhead remain in place; undo restores the previous manifest. The server writes the previous validated snapshot under `~/.tka/post-studio-manifest-edits/` before queuing each edit. The usual Post Studio device storage also retains its previous project value.

The server endpoint is `/api/dev/post-project`: `GET` lists sessions, `GET ?sessionId=...` reads one, and `GET ?sessionId=...&commandId=...` reads status. `POST` accepts `kind: "apply"` with `sessionId`, `baseRevision`, `baseFingerprint`, and `project`. The browser sends `kind: "heartbeat"` about once a second, including a snapshot when it changes. The endpoint does not accept arbitrary file paths; the CLI reads the JSON file locally.

Ownership: `post-editor-state.svelte.ts` validates and commits replacements; `post-project-dev-bridge.ts` owns dev session state, queueing, and backups; `post-project-dev-client.ts` owns browser polling. `PostProjectSchema` and `normalizeProject` remain the schema and layout owners. The CLI is only a local endpoint client.

## Feature videos

A feature video, such as the 1.0 promo, is a Post Studio project kept in a folder on this computer. It is built from one sequence but is not that sequence's post: it reads and writes no `tka:post-studio:` key and no account draft. Feature videos exist only on a dev server. `/post?feature=<slug>` opens one, and `/post?feature=` shows the Post list with its "Feature videos" group; neither needs Post's early access.

The folders live in `E:/tka-platform-media/feature-videos`; set `TKA_FEATURE_VIDEO_ROOT` to use another folder, as task previews do. A slug is 1 to 63 lowercase letters, digits and dashes, and starts with a letter or digit.

```text
<slug>/
  project.json    the title, the revision and the project
  history/        the 200 newest earlier saves, named by revision (r000001.json and on)
  media/
    footage/      takes added with add-take
    captures/     app recordings
    music/        the licensed track
    images/       stills used as items
  captures/       capture scripts and raw frames
  exports/        renders
```

```powershell
node scripts/post-project.mjs features                   # every feature video, newest first
node scripts/post-project.mjs create promo-1-0 --sequence "DCKΨ-" --title "1.0 promo" --canvas 9:16
node scripts/post-project.mjs add-take D:\shoot\IMG_0412.MOV --feature promo-1-0 --label "Opening" --append
node scripts/post-project.mjs show --feature promo-1-0   # add --json to see the takes and their ids
node scripts/post-project.mjs background blur --feature promo-1-0
node scripts/post-project.mjs remove-take --take take-2 --feature promo-1-0
node scripts/post-project.mjs duplicate promo-1-0 promo-1-0-30s --title "1.0 promo, 30 s" --share-media
```

`add-take` copies the clip into `media/footage/` under a safe name no other file there uses, and adds it as a take; `--append` also puts the whole take at the end of the main track. Adding the same clip twice makes a second file and a second take; remove the extra take with `remove-take`. An SDR H.264 `.mp4` is copied as it is. Anything else, such as iPhone HEVC, a `.mov` or 10-bit video, becomes an H.264 High MP4 (CRF 16, AAC 192 kbps, frame rate kept). HDR footage is tone-mapped to SDR on the way in, which shifts its colors a little, so film in SDR when color matters (on an iPhone, turn off HDR Video under Settings > Camera > Record Video). One sound track is kept: the first in a format ffmpeg reads, so an iPhone's spatial audio track gives way to its stereo track. ffmpeg and ffprobe come from `FFMPEG_DIR` when set, then `C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin`, then the PATH. `remove-take` removes the take and its clips from the project and leaves its file in `media/footage/`.

With `--feature`, `show` and every edit go to the editor that has the feature video open, where each command lands as one undo step. With no editor open they go to `project.json`, one revision per command. An editor counts as open until about 10 seconds after its tab closes, so wait that long before editing on disk. Two editors open on the same feature video stop the command until one closes. A command without `--feature` never reaches a feature video's editor.

`duplicate` copies a feature video into a new folder, such as a 30 s cut from the 60 s one. The copy starts at revision 1 with an empty history. By default it copies the media too, so each project owns its files. `--share-media` copies none and plays the original's files, so don't rename or delete a file in the original while a copy uses it.

### When disk and the editor disagree

Disk wins. Each save from the editor names the revision it started from, and the server refuses one made from an older revision. The editor also checks the file's revision with its heartbeat, about once a second. Either way, when the file on disk is newer, the editor loads it as one undo step and says "Loaded the newer copy from disk." The editor's own version stays one Undo away, and undoing saves it as a new revision, so nothing is lost.

- To edit `project.json` by hand while an editor has it open, raise `revision` by one in the same save. Otherwise the editor's next save overwrites the hand edit.
- To restore an earlier save, copy it from `history/` over `project.json` and set its `revision` to one more than the revision of the file it replaces. History files are never overwritten, so a restored file that keeps its old, lower revision leaves the saves made after it out of the history.
- When `project.json` can't be read, the Post list names the folder and every write to it is refused. Restore it the same way.

The server routes are under `/api/dev/feature-videos`: `GET` lists and `POST {slug, title, sequenceId, canvas?}` creates; `GET /<slug>` reads and `PUT /<slug> {baseRevision, project}` saves; `POST /<slug>/ops {ops}` applies named edits to the file and answers 409 while an editor has it open; `POST /<slug>/duplicate {slug, title?, shareMedia?}` copies; `GET /<slug>/media/<path>` serves a media file with byte ranges. Like the bridge, they answer only on a dev server, only to this computer, and only to the page's own origin.

Ownership: `feature-video.ts` owns slugs, the file format and media URLs; `feature-video-store.ts` owns folders, revisions, history and copies; `feature-video-media.ts` serves media; `dev-loopback.ts` guards every dev route; `feature-video-client.ts` keeps an open feature video in step with its folder through the editor's storage port (`post-editor-store.ts`); `post-module-state.svelte.ts` opens feature videos on the Post page; `scripts/feature-video/media-import.mjs` probes and converts takes.
