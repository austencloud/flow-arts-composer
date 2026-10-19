# Private prop bridges (enforced)

Austen set this rule on 2026-10-19. Some prop bridges decode vendor protocols
or carry partner work. They live in the private `austencloud/prop-bridges`
repository, never in this public one.

## Where things live

- The private repo is cloned into `src/lib/private/`, which `.gitignore`
  excludes. A worktree gets its own copy with
  `git -C E:/tka-platform/src/lib/private worktree add <worktree>/src/lib/private <branch>`.
- The public app finds private device panels only through
  `src/lib/features/poi/private-device-panels.ts`. Public code never imports
  from `src/lib/private/`, names its files, or describes what they decode.
- Without the clone the app builds, tests and deploys normally and the POV lab
  shows no device panel. Builds include the panels only with
  `VITE_PRIVATE_BRIDGES=1`.

## Publishing

- Nothing from the private repo is pushed, published, shared, copied into this
  repo, or described in public files, issues, commits or artifacts without
  Austen's yes in chat for that item. Approval for one item covers only it.
- After his yes, the item is listed in `src/lib/private/CLEARED.md` as
  `allow: <path>` with his words and the date.
- Local `main` still holds the private commits from before 2026-10-19, so it is
  never pushed directly. Publish with `node scripts/push-public.mjs` (one
  snapshot commit of main's tree onto GitHub main), check that commit on d2,
  then push it with `--push` once Austen approves.

## Locks (do not work around them)

- `scripts/private-check.mjs` runs from the pre-push hooks and refuses a push
  to GitHub that adds private paths or protocol wording
  (`scripts/private-blocklist.txt`).
- `~/.claude/hooks/prop-bridges-guard.js` refuses `--no-verify`, hook-path
  overrides, pushes from the private folder to any other remote, and private
  files leaving through artifacts, email or Drive. It asks Austen before the
  lock files change.
- A refused push is a signal to stop and ask Austen, not a problem to solve.
