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

### Music

A feature video can have one music file under the whole post. The editor's preview plays it and keeps the picture in time with it, and the export mixes it under the takes. Export's Sound choice sets only the takes' sound: with Silent the music still plays. A render whose music file cannot be read fails instead of going out without it. Only feature videos have music, since the file lives in the feature video's folder.

```powershell
node scripts/post-project.mjs add-music D:\music\derail.wav --feature promo-1-0 --label "Derail" --artist "Yellowbase" --license "Epidemic Sound, license id, date"
node scripts/post-project.mjs music --feature promo-1-0 --bpm 85 --downbeat 0.42
node scripts/post-project.mjs music --feature promo-1-0 --from @2 --to @34 --fade-out 2 --gain 0.8
node scripts/post-project.mjs align-take --feature promo-1-0 --place video-3
node scripts/post-project.mjs trim --feature promo-1-0 --item video-3 --edge end --seconds @9.3
node scripts/post-project.mjs loudness D:\renders\promo.mp4 --feature promo-1-0
node scripts/post-project.mjs remove-music --feature promo-1-0
```

`add-music` copies the file into `media/music/` under a safe name no other file there uses and puts it under the post. A `.wav` of 16 or 24-bit PCM at 44.1 or 48 kHz with one or two channels is copied as it is. Anything else, such as an MP3, becomes a 16-bit 48 kHz stereo WAV: a compressed file can decode a few milliseconds apart in the browser and in ffmpeg, which would move every beat. Adding the same file again, under any name, reuses the copy already in `media/music/` instead of making another, so the music keeps its place, trims, level, fades, beat grid and credits; the command's `reused` says whether it did. A converted file is compared after conversion, and the WAV header names the ffmpeg version, so after an ffmpeg upgrade the same MP3 can count as a different file and the music starts fresh. When two copies are identical, the one the post plays is the one reused. A different file replaces the music and starts whole at 0 s at full level. If the edit fails, the command removes the copy it just made, so no unused file is left in `media/music/`; a copy it reused stays.

`music` changes any of its settings. `--start` is where the music begins on the post's clock; `--from` and `--to` are the part of the file that plays; `--gain` is its level, where 1 plays the file as it is and 2 is the most; `--fade-in` and `--fade-out` are seconds. `--bpm`, `--downbeat` (where bar 1 falls, in the file's own seconds) and `--beats-per-bar` make the beat grid, and `--bpm none` removes it. Until the music has a tempo, a downbeat or beats per bar needs `--bpm` in the same command. `--label`, `--artist` and `--license` are the credit, and an empty `--artist ""` or `--license ""` removes one. A value outside its range is refused with a message that names the setting and the range, and nothing changes: `--bpm` from 20 to 300, `--beats-per-bar` a whole number from 1 to 12, `--gain` from 0 to 2, fades of 0 or more, `--downbeat` within the file's length either side of its start, `--start` from 0 to 14400 s, and a `--from` and `--to` that stay inside the file and leave at least 0.1 s to play. The editor's panel fits the same values into range as you type or drag instead.

A time on the command line (`--start`, `--from`, `--to`, `add-titles --at`, `trim --seconds`) is seconds (`12.5`), a clock (`1:02.5`) or, once the music has a beat grid, a bar: `@9` is bar 9 and `@9.3` is bar 9, beat 3. `--from` and `--to` count bars in the file; the others count them where the music now sits in the post.

`align-take` finds where a take sits in the music from the take's own sound, for footage shot while the track played out loud. Both sounds are decoded at 8 kHz and turned into loudness envelopes at 200 frames a second, 5 ms each, and their rises in loudness are compared at every offset. `offsetSeconds` is the music's own time minus the take's own time at the same moment. The result also gives a `score`, a `confidence` (the best match's score over the next one's) and up to three `candidates` at least 0.25 s apart. A faint match (score under 0.15) or an unclear one (confidence under 1.5, as when the music repeats) comes with a `warning`. `--take ID` only measures. `--place ITEM` also puts that clip in time with the music; on a warning nothing moves, the command exits with code 1, and `sync-to-music --item ID --offset S` places the clip at the candidate you pick. Placing a clip changes which part of its take it plays, not where it sits in the post; it needs the clip at normal speed and enough take before and after.

`loudness` measures a render the way the platforms do, with ffmpeg's EBU R128 filter: integrated loudness in LUFS, loudness range, and true peak. With `--feature` it also suggests the music `gain` that brings the render to -14 LUFS without its peaks passing -1 dBTP, at most 2, assuming the music is all that plays; set it with `music --gain`. A silent render gets no suggestion.

In the editor, the music has its own row under the tracks. Drag it to move it. Selecting it shows its ends and the bar 1 flag: drag an end to trim the music, or the flag to move the grid. With the music selected, Music opens its panel (level, fades, the beat grid with Tap the beat and Suggest BPM, and the credit) and Delete removes it. The ruler numbers the bars, and clips snap to the music's edges and bars, and to its beats once they are far enough apart to pick out. Suggest BPM only offers a tempo; it never sets one.

Ownership: `post-music.ts` owns the music's schema, `music-grid.ts` bars, beats and the times that name a bar, `post-music-edits.ts` its edits, and `post-audio-plan.ts` its sound for the export and the preview (`planMusicAudio`). `music-preview-sync.ts` and `PostMusicPreview.svelte` keep the preview's player and clock on the music; `PostTimelineMusicLane.svelte` and `PostMusicTool.svelte` are its lane and panel. `scripts/feature-video/music-import.mjs`, `align-take.mjs`, `loudness.mjs` and `time-args.mjs` serve the CLI.

### App recordings

A capture records a scripted pass through the app as a take. The script is `<slug>/captures/<id>.capture.mjs`; an id is lowercase letters, digits and hyphens.

```js
export default {
  id: "builder-dckpsi",
  url: "/create/construct",
  viewport: { width: 432, height: 768, deviceScaleFactor: 2.5, mobile: true },
  ready: "document.querySelector('.canvas-wrapper') !== null", // optional: waits for this to be true
  settleMs: 1500, // optional: a pause after load, 1500 by default
  async run(director) {
    await director.shot("builder-dckpsi", 8, async () => {
      await director.click("Play");
    });
  },
};
```

Each recording runs in its own headless Chrome, started at the script's viewport and scale, so a phone's 432 by 768 at 2.5 records 1080 by 1920. `mobile` is true unless the script sets it to false. A windowed Chrome would send frames at the screen's scale instead: 648 by 1152 on a 150% display. Keep the phone viewport for 9:16. A wider one such as 720 by 1280 at 1.5 also gives 1080 by 1920, but the app lays it out differently and text comes out at 60% of its phone size. The director's calls are `click(label)`, `fill(label, value)`, `cell(index)`, `canvas()`, `move(x, y)`, `wait(ms)` and `shot(id, seconds, action)`; the shot named like the capture is the one that is encoded.

```powershell
node scripts/feature-video/capture.mjs --feature promo-1-0 --capture builder-dckpsi
node scripts/post-project.mjs capture-info --feature promo-1-0
node scripts/post-project.mjs link-capture --feature promo-1-0 --capture builder-dckpsi --media captures/builder-dckpsi.2.mp4
```

The headless Chrome starts with a fresh profile, signed out, and closes when the recording ends. It is never your Chrome and never the shared agent browser on 9222. The dev server must be running; the runner never starts it, and a page Chrome cannot load fails the run with Chrome's reason. A page that crashes fails the run at once, and so does any command Chrome leaves unanswered for 60 s. `--origin` records from another dev server on this computer, such as a worktree's, and the runner's CLI calls go to the same server. A 10 s capture took about 2½ minutes on 2026-10-07, so give the command at least that long.

Each run writes `media/captures/<id>.<n>.mp4` with n counting up, so no earlier recording is overwritten, then links it. The first run adds a take labelled with the id. Every later run points that same take at the new file, so the clips cut from it stay in the post. A longer file keeps every clip as it was. A shorter one cuts back a clip it ends inside and removes a clip it no longer reaches, and the main track closes up as it does when a take is removed. The output then lists them under `clips`, `removed` by id and `shortened` with each clip's old and new length, with a note to check the timeline. The take's timing now ends where the new file ends, and a timing you had checked shows "Timing not checked" until you check it again. While an editor has the feature video open, `link-capture` finds the take in the editor's post, and the editor saves the change to disk.

A run that fails while it records keeps its frames in `captures/frames/<id>/`, writes no video and leaves the project as it was. One that records but cannot be linked, for example because the editor refused the edit, keeps its video and prints the `link-capture` command that links it once the reason is fixed. Frames stay after a good run too, until the next run of the same id replaces them; a 10 s run left 37 MB on 2026-10-07. Run one capture of an id at a time, since two would share its frames folder. `duplicate` copies the capture scripts, without their frames.

### End card and render

A feature video's card can show a QR code for a link you choose, such as the sequence's short link, and the code opens that link for anyone who scans it, signed in or not. In the editor, select the card and type the link under Scan link. Only a feature video's cards have the field. A link is an `https://` address with no spaces, at most 200 characters; a good one switches the card's info cell to the QR, and clearing the field brings back your account's own code. `add-card` puts a card at the end of the main track, with the link when `--qr-url` gives one.

```powershell
node scripts/post-project.mjs add-card --feature promo-1-0 --label "Get the app" --qr-url https://example.com/end --fade-in 0.5
node scripts/post-project.mjs sound silent --feature promo-1-0
node scripts/post-project.mjs render --feature promo-1-0 --name promo-1-0-v1
node scripts/post-project.mjs render --feature promo-1-0 --open
node scripts/post-project.mjs stills E:\tka-platform-media\feature-videos\promo-1-0\exports\promo-1-0-v1.mp4 --at 0,4,6.5
node scripts/post-project.mjs contact-sheet E:\tka-platform-media\feature-videos\promo-1-0\exports\promo-1-0-v1.mp4
```

`sound` is Export's Sound choice: `takes` plays the takes' own sound and `silent` drops it. The music plays either way.

`render` renders the post the way Export does, in the editor that has the feature video open, and saves the MP4 in the project's `exports/` folder. Without `--name` the file is `<slug>-YYYYMMDD-HHMMSS.mp4`, and `.mp4` is added to a name without it. A name that is taken gets `-2`, `-3` and so on, so no render replaces another. The command prints the file, its whole path and its size, and reports progress on stderr. While a render runs, the editor refuses edits, and a render waits until a pending edit has landed. Keep the editor's tab in front: a render draws on animation frames, which a tab behind others does not get, and the command gives up on a render that has not moved for 3 minutes. With no editor open, the command says how to open one. `--open` opens one itself in a private headless Chrome, signed out, never your Chrome and never the agent browser on 9222, and closes it when the render ends; a render on the usual server opens `https://localhost:5173`. A render from the editor's own Render button lands in `exports/` too, and the panel still offers the download.

The bridge takes a render as `POST /api/dev/post-project {kind: "render", sessionId, name?}` and answers `{renderId, state: "queued"}`; `GET /api/dev/post-project?sessionId=…&renderId=…` reads the job: `state` (queued, rendering, completed or failed), `phase`, `percent`, `message`, and once it completes, `file`, `path` and `bytes`. The editor gets the job in its next heartbeat answer and reports progress in the heartbeats after. A job the editor has not started after 30 s fails, and so does one whose editor has sent nothing for a minute.

`stills` writes a JPEG at each `--at` time, and `contact-sheet` one sheet of a frame a second, ten across unless `--columns` (1 to 30) says otherwise. Both go to `exports/stills/`, named after the render: `<render>-<t>s.jpg` and `<render>-contact.jpg`. They replace earlier stills of the same render and time. A time past the render's end is refused.

`node scripts/feature-video/render-check.mjs --url http://localhost:5193` checks the whole path. It makes a scratch feature video from a 2 s clip that flashes white at 0.5 s and music that clicks at 0.5 s, renders it with `render --open`, and measures where the flash and the click land: each within a frame (1/30 s) of 0.5 s and of the other. It prints the result as JSON, with the stills and the contact sheet, and exits with code 1 when the check fails. It refuses port 5173, since it writes a project folder: run it on a task server started with a scratch `TKA_FEATURE_VIDEO_ROOT`, where the project stays for a look.

### When disk and the editor disagree

Disk wins. Each save from the editor names the revision it started from, and the server refuses one made from an older revision. The editor also checks the file's revision with its heartbeat, about once a second. Either way, when the file on disk is newer, the editor loads it as one undo step and says "Loaded the newer copy from disk." The editor's own version stays one Undo away, and undoing saves it as a new revision, so nothing is lost.

- To edit `project.json` by hand while an editor has it open, raise `revision` by one in the same save. Otherwise the editor's next save overwrites the hand edit.
- To restore an earlier save, copy it from `history/` over `project.json` and set its `revision` to one more than the revision of the file it replaces. History files are never overwritten, so a restored file that keeps its old, lower revision leaves the saves made after it out of the history.
- When `project.json` can't be read, the Post list names the folder and every write to it is refused. Restore it the same way.

The server routes are under `/api/dev/feature-videos`: `GET` lists and `POST {slug, title, sequenceId, canvas?}` creates; `GET /<slug>` reads and `PUT /<slug> {baseRevision, project}` saves; `POST /<slug>/ops {ops}` applies named edits to the file and answers 409 while an editor has it open; `POST /<slug>/duplicate {slug, title?, shareMedia?}` copies; `GET /<slug>/media/<path>` serves a media file with byte ranges; `POST /<slug>/exports?name=<file>.mp4` saves the MP4 in its body to `exports/` under the first free name and answers 201 with the file it wrote. Like the bridge, they answer only on a dev server, only to this computer, and only to the page's own origin.

Ownership: `feature-video-url.ts` owns slugs and media URLs, so the post schema can check a music URL without importing the rest of `feature-video.ts`, which owns the file format; `feature-video-store.ts` owns folders, revisions, history and copies; `feature-video-media.ts` serves media; `dev-loopback.ts` guards every dev route; `feature-video-client.ts` keeps an open feature video in step with its folder through the editor's storage port (`post-editor-store.ts`); `post-module-state.svelte.ts` opens feature videos on the Post page; `scripts/feature-video/media-import.mjs` probes and converts takes. `feature-video-export.ts` names renders and `feature-video-exports.ts` saves them; `scripts/feature-video/render.mjs`, `stills.mjs` and `render-check.mjs` serve `render`, `stills`, `contact-sheet` and the render check.
