# Worktree Lifecycle

Apply this to repository-modifying tasks. Read-only work may remain in the
primary checkout.

## Start

1. Use one task-owned worktree based on current local `main`. The primary
   checkout at `E:/tka-platform` is reserved for the dev server and integration
   unless Austen explicitly requests direct edits there.
2. Prefer Codex Handoff. If unavailable, create one resolved,
   repository-adjacent worktree. Never nest or repurpose a worktree.
3. Create a unique `codex/<task-slug>` branch before committing.
4. Check status before editing and before every commit. Preserve unrelated work
   and follow `commit-only-your-own-changes.md`.

## Verify and Finish

1. Run proportionate verification in the task worktree. Documentation-only
   branches do not require the full Svelte check; code branches use the nearest
   tests and relevant type/build gate. Visual work also follows
   `visual-verification-mandatory.md`.
2. Commit only task-owned paths with explicit pathspecs.
3. Bring the task branch current with local `main`. Repeat only checks invalidated
   by that update.
4. Leave the worktree before invoking the guarded finish command:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/<task-slug> --route /real-shipping-route
npm run wt:finish -- codex/<task-slug> --nonvisual
```

Use `--route` when a real app surface exists and `--nonvisual` otherwise. The
command checks cleanliness, ancestry, overlap with primary-checkout changes,
concurrent `main` movement, and the appropriate project gate. It merges to local
`main`, verifies ancestry, removes the clean worktree, and deletes the merged
local branch.

Implementation approval includes this guarded local integration and cleanup.
Stop with branch and worktree intact when a gate fails or integration is unsafe;
report the exact blocker. Never delete a dirty worktree, another task's branch,
or a `node_modules` path that may be a junction into the primary checkout.

## Removing a Worktree by Hand

`git worktree remove` follows a `node_modules` junction and deletes the files
in `E:/tka-platform/node_modules` (verified 2026-09-15 on git 2.50.1; it
emptied `.bin`, `.modules.yaml`, and hundreds of `.pnpm` packages).
`wt:finish` unlinks the junction and aborts if any link remains. Do the same
when removing one manually:

```powershell
cmd /c rmdir <worktree>\node_modules
cmd /c dir /AL /S <worktree>
git worktree remove <worktree>
```

`rmdir` on a junction removes only the link. The `dir /AL /S` listing must
show no remaining links before the remove. Never `rm -rf` a worktree that
still contains a junction; that recurses into the primary checkout too. If the
primary `node_modules` does get gutted, `pnpm install --frozen-lockfile
--force` rebuilds it from the local store in about 30 seconds.

`wt:status` and `wt:automerge` are diagnostic only. Do not use retired batch
apply/prune workflows. If the task depends on uncommitted primary-checkout state,
use Handoff or a working-tree starting state instead of copying files manually.
