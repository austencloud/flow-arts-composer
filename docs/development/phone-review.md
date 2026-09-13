# Phone review

`/review` is a development-only page for an interactive phone preview. It keeps
the review bar in the parent document and loads the selected application path in
a same-origin iframe.

An installed home-screen app on `dev.tkaflowarts.com` redirects its ordinary
`/create` launch to `/review`. Reload an already-open install once to pick up
this behavior. Browser tabs and explicit deep links keep their normal routes.
The preview iframe never redirects itself back into the review page.

Set the path from an agent or terminal:

```powershell
npm run review:target -- /compose
```

The page polls the local target file every three seconds while Follow is active.
Writing the same route does not reload the preview. Use `--reload` when a
deliberate reload of that route is needed:

```powershell
npm run review:target -- /compose --reload
```

The target file is stored in this repository's shared Git directory, outside
the worktree and Vite watch roots. Only same-origin application paths are
accepted. `/review` is rejected to prevent recursive frames.

## Remote interaction during a review

The same development-only shell can operate one connected preview without
touching the reviewer’s phone. It only dispatches a semantic click or a value
change to an enabled, visible native button, range/number/toggle input, or
select. It never evaluates JavaScript, reads input values or page text, sets
text/password/file fields, or broadcasts a command to every open review tab.

First list the connected clients. The viewport label separates a phone preview
from a desktop tab:

```powershell
npm run review:control -- status
```

Copy the intended client ID, then inspect its bounded control metadata. The
inspection command reports control IDs, accessible names, types, disabled state,
and select values through the local review status file:

```powershell
npm run review:control -- inspect <client-id>
npm run review:control -- status
```

Use an inspect-derived control ID when possible. Names must match exactly and
must identify one enabled visible control; a duplicate such as two `Mirror`
buttons fails rather than guessing.

```powershell
npm run review:control -- click <client-id> --id step-forward
npm run review:control -- set <client-id> --id speed --value 0.7
```

Commands are written only by the local CLI to the shared Git metadata file,
bound to that client’s current route, expire after 30 seconds, and are marked
delivered before dispatch so a refresh or route change cannot replay them. The
phone shell reports a concise completed/failed confirmation in `status`. Pausing
the preview fences both queued and in-flight polling work; resume Follow before
issuing another command.
