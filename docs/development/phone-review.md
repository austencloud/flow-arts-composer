# Phone review

`/review` is a development-only page for an interactive phone preview. It keeps
the review bar in the parent document and loads the selected application path in
a same-origin iframe.

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
