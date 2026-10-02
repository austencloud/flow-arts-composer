# Edit an open Post Studio manifest from a local file

The dev bridge lets a local script replace the manifest in one open Post Studio editor. It does not open media files or switch sequences. The editor applies a replacement as one undo step and saves through its normal local storage and draft autosave. The bridge runs only in development and accepts loopback, same-origin requests.

## Named edits (the usual way)

Most changes need no manifest file. Each command below is one of the timeline's own edits, applied to the editor's current project on the server and delivered as one undo step. With one editor open the session is found automatically; otherwise pass `--session ID` or `--sequence ID`. A command waits until the editor confirms.

```powershell
node scripts/post-project.mjs show                       # items, tracks, times
node scripts/post-project.mjs add-hook --speed ease-out  # opening tunnel on the animation
node scripts/post-project.mjs hook-speed linear          # name, or x1,y1,x2,y2, or default
node scripts/post-project.mjs remove-hook
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
