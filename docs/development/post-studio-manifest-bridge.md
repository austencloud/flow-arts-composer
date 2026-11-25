# Edit an open Post Studio manifest from a local file

The dev bridge lets a local script replace the manifest in one open Post Studio editor. It does not open media files or switch sequences. The editor applies a replacement as one undo step and saves through its normal local storage and draft autosave. The bridge runs only in development and accepts loopback, same-origin requests.

## Named edits (the usual way)

Most changes need no manifest file. Each command below is one of the timeline's own edits, applied to the editor's current project on the server and delivered as one undo step. With one editor open the session is found automatically; otherwise pass `--session ID` or `--sequence ID`. A command waits until the editor confirms.

```powershell
node scripts/post-project.mjs show                       # items, tracks, times
node scripts/post-project.mjs add-hook --speed ease-out  # opening tunnel on the animation, its footage behind it, its name kept at the start
node scripts/post-project.mjs hook-speed linear          # name, or x1,y1,x2,y2, or default
node scripts/post-project.mjs remove-hook
node scripts/post-project.mjs line-up-hook                 # tunnel ends on the footage's opening pose when the take is timed, footage dimmed behind it either way
node scripts/post-project.mjs appearance --item animations --set stepNumbers=false --set tkaGlyph=null
node scripts/post-project.mjs item --item ITEM_ID --patch '{"opacity":0.5}'
node scripts/post-project.mjs trim --item ITEM_ID --edge end --seconds 12
node scripts/post-project.mjs delete --item ITEM_ID
node scripts/post-project.mjs canvas 9:16
node scripts/post-project.mjs background blur
node scripts/post-project.mjs ops --file ops.json        # several edits, one undo step
```

`--item` takes an id, `hook` (the animation that opens with the tunnel), `animations` or `all`. The opening tunnel is part of the animation item itself, one canvas from the first frame to the last; a post saved with the tunnel as a separate item is merged into its animation when it opens. `--set key=value` accepts `true`, `false`, `null` (clears the flag), numbers and text. `ops.json` is an array such as `[{"op":"add-hook"},{"op":"hook-speed","speed":"smooth"}]`; a failing edit names its position and nothing is applied. A change that alters nothing returns `unchanged`. The editor tab must be open on the post, because the open editor owns the saved draft: a script never writes the draft file itself.

Ownership: `post-project-ops.ts` maps each named edit onto the existing pure edit, in `core/edit/project-edits.ts` of `@austencloud/video-editor` (the music ops in `core/edit/music-edits.ts`) or, for the titles and tunnel edits only tka has, in tka's `post-project-edits.ts`; `queuePostProjectOps` in the bridge applies them to the session snapshot and reuses the manifest queue below.

### Split hands

An animation clip can part into a left-hand canvas and a right-hand canvas, then rejoin. Set `split` with an `item` patch; `null` removes it:

```powershell
node scripts/post-project.mjs item --item ITEM_ID --patch '{"split":{"openAt":2,"openSeconds":0.7,"closeAt":6,"style":"echo"}}'
node scripts/post-project.mjs item --item ITEM_ID --patch '{"split":null}'
```

Times are seconds on the clip's own clock, from its first frame. `openSeconds` is how long the opening move takes. `closeAt` is optional (without it the hands stay apart to the end), and `closeSeconds` defaults to `openSeconds`. `style` is `glide`, `spring`, `peel` or `echo` (the default). `spread` (0 to 0.5, how far each canvas moves out, as a share of the frame width), `scale` (0.2 to 1.5, each canvas's size at rest) and `flash` (0 to 3, the brightness on the hit; glide has none) are optional. A `closeAt` before `openAt` is moved up to it. Only animation clips take a split, and a clip that shows one hand (`part.hand`) ignores it. The Split hands panel on the clip sets the same fields. To see one, open the harness at `/test/post-studio?fixture=split`.

### Lifted panel

An animation clip can lift its panel: the canvas rises and shrinks inside the clip's box, the step number moves to the box's top-left corner and the progress strip to its top edge. Set `panelLift` with an `item` patch; `null` removes it:

```bash
node scripts/post-project.mjs item --item ITEM_ID --patch '{"panelLift":{"canvasY":0.344,"canvasScale":0.95,"inAt":1,"inSeconds":0.8,"outAt":8.3,"outSeconds":0.7}}'
```

Every field is optional. `canvasY` (0.1 to 0.9, the canvas centre as a share of the box height, default 0.344), `canvasScale` (0.3 to 1.5, default 0.95), `stepInsetX` and `stepInsetY` (0 to 0.5, the step number's corner as shares of the box, defaults 0.056 and 0.029) and `barEdge` (`top`, the default, or `bottom`) set the lifted look. Times are seconds on the clip's own clock: `inAt` is when the lift is fully in, reached over `inSeconds` before it (default 0.8), and `outAt` is when it starts going back, over `outSeconds` (default 0.7), retracing the move in. Without `inAt` the clip is lifted from its first frame; without `outAt` it stays lifted to the end. An `outAt` before `inAt` is moved up to it. Breakdown and mandala views ignore the lift. The Lift panel on the clip sets the same fields; the harness shows one at `/test/post-studio?fixture=lift`.

### Titles: leave, arrive and the lit letter

A titles clip takes three optional fields through `item`. `leave` is `"lift"` (the default: the words rise away and fade at the end) or `"stay"` (they hold to the last frame). `enter` is `"rise"` (the default) or `"none"` (shown from the first frame). `lit` is `{ "from": s, "to": s }` in seconds from the clip's start: inside that span only the letter being performed draws at full strength and the rest dim, read from the clock of the footage under the clip. `null` clears `lit`, and the default value clears `leave` or `enter`.

```powershell
node scripts/post-project.mjs item --item TITLES_ID --patch '{"leave":"stay","lit":{"from":26,"to":76}}'
```

Any other value is refused with the allowed values, as is one of these fields on a clip that is not titles. A titles clip whose box has keyframes draws as one name-and-spoken-line pair that scales with its box; the titles tool's Park top left button writes those keyframes. A fourth field, `quiet` (`{ "from": s, "to": s }`, shaped like `lit`), fades the spoken line out over 0.3 s at `from` and back in at `to`.

### Card ending: cascade, ring, QR exit and title hand-off

A card clip takes four optional fields through `item`, with times in seconds from the card's start; `null` clears each one, and `"card"` clears `headerTitle`. A card with none of them draws as before.

- `enter`: `{ "style": "cascade", "step"?: 0.035, "each"?: 0.25 }`. The header fades in over `each`, then the tiles in reading order (top row, then pictographs 1 to N), each `step` after the last.
- `ring`: `{ "at": s, "every"?: s, "late"?: 0.05 }`. The amber ring sits on pictograph 1 from `at` and steps one pictograph every `every`, staying on the last. Without `every` it steps on the music's beat; a post with no beat grid must give `every`.
- `qrExit`: `{ "at": s, "seconds"?: 1.13, "to"?: { "x", "y", "width", "height" }, "caption"?: text }`. The QR flies and grows to `to` (shares of the frame; default a centred square 0.55 of the width, top at 0.27) while the rest of the card fades, then holds. `caption` (up to 80 letters) travels under it.
- `headerTitle`: `"clip"` keeps the header's space but leaves the word to the titles clip.

```powershell
node scripts/post-project.mjs item --item CARD_ID --patch '{"enter":{"style":"cascade"},"ring":{"at":1,"every":0.75},"qrExit":{"at":12.8,"caption":"Scan to try it"}}'
```

The titles tool's Land on card button measures where the drawn card puts its header word. A script has no drawing to measure, so `land-titles` takes that spot as shares of the card's box (read it from the card in the editor, or use the button): `node scripts/post-project.mjs land-titles --word '{"x":0.3,"y":0.012,"width":0.4,"height":0.05}' [--titles ID] [--card ID] [--at T]`. It writes the titles' box at `--at` (default the card's start) and the landed box 0.6 s later, sets `leave` to `"stay"`, quiets the spoken line from the landing on, and sets the card's `headerTitle` to `"clip"`.

### Flash: a hit with corner marks

A flash clip's start is the hit. A white veil covers the whole frame at `strength` (0 to 1, default 0.22) on the first frame and dies away to nothing over `fade` seconds (0.05 to 5, default 0.4). With `marks` (default `true`), four rounded corner brackets sit at the corners of the clip's box from its first frame to its last, so the box marks what to look at, such as a QR code. Everything is drawn from the playhead, so a paused frame is the exported frame. `add-flash` adds a 3 s clip with a centred square box; `item` changes the three fields afterwards.

```powershell
node scripts/post-project.mjs add-flash --at 12.5 --strength 0.3 --fade 0.5
node scripts/post-project.mjs item --item FLASH_ID --patch '{"marks":false}'
```

A value out of range, or one of these fields on a clip that is not a flash, is refused.

### Hold a clip's last frame

A video clip takes `holdOut` through `item`: seconds (0 to 30) it stays on screen after its footage ends, showing its last frame, silent. The hold counts in the clip's length. Layers over the clip that follow its footage, such as a moves square, an animation or a staff effect, stop on what they showed at the footage's last frame. `null` or 0 clears it; a value out of range, or `holdOut` on a clip that is not a video, is refused.

```powershell
node scripts/post-project.mjs item --item VIDEO_ID --patch '{"holdOut":2}'
```

### Fly into next clip

For an animation, moves, mandala or card clip with another of those right after it on the same lane, `fly-into-next` cross-fades the clip into that neighbour over `--seconds` (default 1.13). Over the cross-fade both clips ride one box path, eased in and out, from the outgoing clip's box to the incoming clip's box, keyed at the same two times on both. Outside the cross-fade each keeps its own box and keys. On an overlay lane the incoming clip starts earlier by the cross-fade's length and keeps its end, and every later clip on the lane stays where it was, so a cut timed to a song holds; on the main lane the editor's own cross-fade layout stands. The keys are ordinary box keys; running it again first removes the box keys inside the old and new cross-fade, so it replaces the earlier flight; a run that would write exactly what is there changes nothing and reports `unchanged`. The clip tools' Fly into next button does the same, with the length beside it.

```powershell
node scripts/post-project.mjs fly-into-next --item ANIMATION_ID --seconds 1.13
```

A clip with no such neighbour is refused. The harness shows both at `/test/post-studio?fixture=flash` and `?fixture=join`.

### Keyframes

`keyframe --item ID --action A` reads or edits one item's keyframes. Times are post times, written like every other time here; add `--own` (`"own": true` in a batch file) when they are seconds from the item's start instead.

- `list [--channel C] [--json]` prints the keyframes by channel, each with its time from the item's start, its post time and, when the post has a beat grid, its bar and beat. It changes nothing.
- `set --at T --patch '{...}' [--easing NAME]` keys fields that animate (`box`, `opacity`, and on video `zoom`, `panX`, `panY`, `rotation`, `sourceGeometry`) through the editor's own keyed edit: it changes the keyframe at T, or makes one. A still channel gets its first keyframe. `--easing` (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `smooth`, `overshoot`, `hold`) shapes the move leaving that keyframe, or arriving at it when it is the last.
- `move --at T --to T2 [--channel C]` moves the keyframe within 0.02 s of T. With no keyframe that close it fails and names the nearest one on each side.
- `retime --channel C --times T1,T2,...` gives each keyframe on the channel its new time, in order; the count must match.
- `delete --at T [--channel C]` removes the keyframe at T.
- `clear [--channel C] [--at T]` removes every keyframe, or one channel's, leaving the value at T (default: the item's start).

Every action refuses a time outside the item, two keyframes of a channel on one moment or out of order, and an item or channel that is not there, saying what it found. A change that alters nothing reports `unchanged`.

```powershell
node scripts/post-project.mjs keyframe --item SQUARE_ID --action set --at @29.3 --patch '{"opacity":0.5}' --easing ease-out
```

### Move a clip

`move --item ID --to T [--track N]` moves an overlay with the editor's own overlay move, where `--track` works as it does there (a busy track sends the clip to the nearest free one above, and the number of tracks asks for a new one), or places a main-track clip at T with the editor's own placement. Keyframes and the clip's own timed settings travel with it, because they are stored from the clip's start. The command prints the start and track it landed on.

```powershell
node scripts/post-project.mjs move --item SQUARE_ID --to 12.5 --track 2
```

A time in `ops.json` can be a number, a string read by the same parser as the flags (`"12.5"`, `"1:02.5"`, `"@29.3"`), or the object `{"bar": 29, "beat": 3}`.

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

Ownership: `post-editor-state.svelte.ts` validates replacements (`replaceManifestFromDev`) and commits them through the package state, `state/video-editor-state.svelte.ts` in `@austencloud/video-editor`; `post-project-dev-bridge.ts` owns dev session state, queueing, and backups; `post-project-dev-client.ts` owns browser polling. `PostProjectSchema` and `normalizeProject` remain the schema and layout owners. The CLI is only a local endpoint client.

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

Ownership, in `@austencloud/video-editor`: `core/music/post-music.ts` owns the music's schema, `core/music/music-grid.ts` bars, beats and the times that name a bar, and `core/music/audio-plan.ts` its sound for the export and the preview (`planMusicAudio`); `core/edit/music-edits.ts` owns its edits. The package's `render/music-preview-sync.ts` and tka's `PostMusicPreview.svelte` keep the preview's player and clock on the music; `PostTimelineMusicLane.svelte` and `PostMusicTool.svelte` are its lane and panel. `scripts/feature-video/music-import.mjs`, `align-take.mjs`, `loudness.mjs` and `time-args.mjs` serve the CLI.

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

Each recording runs in its own headless Chrome, started at the script's viewport and scale, so a phone's 432 by 768 at 2.5 records 1080 by 1920. `mobile` is true unless the script sets it to false. A windowed Chrome would send frames at the screen's scale instead: 648 by 1152 on a 150% display. Keep the phone viewport for 9:16. A wider one such as 720 by 1280 at 1.5 also gives 1080 by 1920, but the app lays it out differently and text comes out at 60% of its phone size. The director's calls are `click(label)`, `fill(label, value)`, `cell(index)`, `pick(selector, index)`, `type(selector, text, { index, perKeyMs, enter })`, `canvas()`, `move(x, y)`, `wait(ms)` and `shot(id, seconds, action)`; the shot named like the capture is the one that is encoded. `click` takes the first visible control with that label. `pick` clicks the `index`th on-screen element that matches a CSS selector, counting from 0, for a target no label singles out: the builder labels every C option "Add C. Hold to preview.", so `pick('[data-testid="option-item"][data-letter="C"]', 3)` takes the fourth, and a start tile, a `role="button"` div, is `pick('[data-testid="start-placement-picker"] [data-ghost-label="β"]')`. `type` clicks a text field the way `pick` does, then types into it a key at a time (140 ms apart unless `perKeyMs` says otherwise) and presses Enter when `enter` is true: `type('input[name="generation-word"]', "CAKE", { enter: true })` spells a word in Generate.

```powershell
node scripts/feature-video/capture.mjs --feature promo-1-0 --capture builder-dckpsi
node scripts/post-project.mjs capture-info --feature promo-1-0
node scripts/post-project.mjs link-capture --feature promo-1-0 --capture builder-dckpsi --media captures/builder-dckpsi.2.mp4
```

The headless Chrome starts with a fresh profile, signed out, and closes when the recording ends. `--profile <absolute folder>` opens a kept profile instead, for a recording that needs the app signed in. Sign that profile in once with the shared test account (`docs/reference/agent-browser-profile.md`) and later recordings with it start signed in; the runner never deletes it, and only one Chrome can use it at a time. It is never your Chrome and never the shared agent browser on 9222. The dev server must be running; the runner never starts it, and a page Chrome cannot load fails the run with Chrome's reason. A page that crashes fails the run at once, and so does any command Chrome leaves unanswered for 60 s. `--origin` records from another dev server on this computer, such as a worktree's, and the runner's CLI calls go to the same server. A 10 s capture took about 2½ minutes on 2026-10-07, so give the command at least that long.

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
