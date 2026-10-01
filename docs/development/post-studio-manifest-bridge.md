# Edit an open Post Studio manifest from a local file

The dev bridge lets a local script replace the manifest in one open Post Studio editor. It does not open media files or switch sequences. The editor applies a replacement as one undo step and saves through its normal local storage and draft autosave. The bridge runs only in development and accepts loopback, same-origin requests.

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
