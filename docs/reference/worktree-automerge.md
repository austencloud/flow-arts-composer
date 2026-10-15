# Worktree lifecycle

Worktrees isolate implementation from Austen's primary-checkout dev server.
They are temporary task infrastructure, not a review or approval queue.

## Normal finish

Once implementation is approved, the agent owns the whole lifecycle: verify,
commit, integrate into local `main`, remove the worktree and branch, then put
the integrated result in front of Austen. There is no separate merge or cleanup
approval.

From the primary checkout:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/<task-slug> --route /real-shipping-route
npm run wt:finish -- codex/<task-slug> --nonvisual
```

The primary-checkout directory matters on Windows. A terminal whose current
directory is inside the task worktree prevents Windows from deleting it.

The finish command requires all of these conditions:

- exact task branch and registered worktree;
- clean task worktree;
- task branch contains current local `main`, or is already integrated;
- no in-progress Git operation in the primary checkout;
- no overlap between task paths and uncommitted primary-checkout paths;
- `npm run check` passes;
- local `main` does not move while checks run;
- visual work names a real app-relative delivery route.

Unrelated uncommitted work in the primary checkout is preserved. A failed gate
returns nonzero before integration and leaves the task branch and worktree
intact. A successful finish creates one local merge commit, verifies ancestry,
unlinks the root `node_modules` junction safely, removes the worktree, deletes
the merged branch, prunes stale metadata, and prints the
`https://localhost:5173` delivery URL.

The agent must immediately open that URL in the desktop app's in-app Browser
pane. When guarded integration is blocked, a verified live preview from the actual task worktree is an allowed final handoff. Keep its task-owned server and delivered tab alive, record worktree/port/process/log details and link the direct route. Nonvisual work needs a reviewable artifact and an explicit integration-incomplete status.

## Readiness diagnostics

These commands are read-only:

```powershell
npm run wt:status     # cheap gates only
npm run wt:automerge  # includes npm run check for candidates
```

They report worktrees that look ready relative to local `main`. They never
merge, push, delete, or prune. The former server-side `--apply` and `--prune`
paths are retired and fail closed; batch-merging could update remote `main`
without updating the local `main` that drives port 5173, and it could leave the
worktree behind.

## Legacy scheduled task

The Windows Scheduled Task `tka-worktree-automerge` was disabled on 2026-08-31.
It called the retired server-side batch apply path every 20 minutes from an old
worktree launcher. Keep it disabled. The launcher remains on disk only as
recoverable historical state; it is not part of the supported lifecycle.

## Audit log

Successful local finishes append the task branch, task head, pre-merge local
main, post-merge local main, and delivery URL to `.git/automerge-log.jsonl`.
This is an audit trail, not a substitute for Git history.
