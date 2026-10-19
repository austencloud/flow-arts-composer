# Local Resource Budget

Apply this before starting a Vite server, `svelte-check`, `npm run check`, or a
full build.

1. Reuse an existing task-appropriate server when possible. The project server
   on port 5173 is not a task server; restart it only with
   `pm2 restart tka-dev` (see `never-start-the-dev-server.md`).
2. Check available memory. Do not start a heavy process below 4096 MB available.
3. Check for an existing `svelte-check`; only one may run machine-wide. Wait for
   it instead of starting another.
4. At most two agent-owned Vite servers may run concurrently. A handed-off
   delivery preview reserves one slot while alive. If the cap is reached, reuse
   a task-appropriate server or report contention.
5. Stop temporary server and wrapper processes started by the current task
   before the turn ends. Keep a handed-off delivery preview alive until it is
   superseded by integration or the user finishes the task.

PowerShell probes:

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'svelte-check|vite\\bin\\vite\.js' } |
  Select-Object ProcessId, CommandLine
```

Do not kill another task's process to satisfy the budget. Prefer focused checks
and stop after the evidence required by `AGENTS.md` passes.

## Heavy Checks Run on d2

On d1, send a full Vitest suite (`pnpm run test:ci`), full build, `check:full`,
or a `verify:*` gate to d2, the office desktop, instead of running it locally.
Commit first: only committed content runs there.

```powershell
pwsh scripts/d2-run.ps1 "pnpm run test:ci"
pwsh scripts/d2-run.ps1 -Ref <sha> -Name build "pnpm run build"
pwsh scripts/d2-run.ps1 -NoWait "pnpm run check:full"   # prints a job id
pwsh scripts/d2-run.ps1 -Job <id>                      # waits, then log tail
```

It pushes the commit to d2, installs it in a scratch worktree there, runs the
command detached, and exits with the command's exit code. d2 has 12 threads to
d1's 32, so expect about twice the run time. Focused checks, the `wt:finish`
gate, and browser verification stay on d1. If d2 is unreachable, say so and
run the check on d1 under the rules above.

Each run leaves a scratch worktree of 5 to 8 GB on d2's E: drive. The d2
scheduled task "d2 scratch prune" (`scripts/d2-prune.ps1`) runs every hour. It
never touches a worktree with a live job or a process (dev server, install) in
it, or one used in the last 2 hours. Otherwise it keeps the newest 5 and one per
commit, and removes more, oldest first, whenever E: is under 80 GB free.
`d2-run` also calls it when E: drops under 25 GB, before creating the worktree.
Its log is `C:\Users\Austen\d2-tools\d2-prune.log` on d2. If a push to d2 fails
with "No space left on device", run `pwsh scripts/d2-prune.ps1 -Install` to
reinstall it and say so. This prune only covers E:. Job logs and other repos'
scratch live in `C:\Users\Austen\d2-jobs` on C:, which it does not touch.

The script needs this rule in `.claude/settings.local.json` (Austen adds it):
`"PowerShell(pwsh scripts/d2-run.ps1 *)"`. Don't replace the script with raw
`ssh` or `scp` calls.
