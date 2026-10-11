# Local Resource Budget

Apply this before starting a Vite server, `svelte-check`, `npm run check`, or a
full build.

1. Reuse an existing task-appropriate server when possible. Never touch the
   project server on port 5173.
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

On d1, send a full Vitest suite, full build, `check:full`, or a `verify:*` gate
to d2, the office desktop, instead of running it locally. Commit first: only
committed content runs there.

```powershell
pwsh scripts/d2-run.ps1 "pnpm vitest run"
pwsh scripts/d2-run.ps1 -Ref <sha> -Name build "pnpm run build"
pwsh scripts/d2-run.ps1 -NoWait "pnpm run check:full"   # prints a job id
pwsh scripts/d2-run.ps1 -Job <id>                      # waits, then log tail
```

It pushes the commit to d2, installs it in a scratch worktree there, runs the
command detached, and exits with the command's exit code. d2 has 12 threads to
d1's 32, so expect about twice the run time. Focused checks, the `wt:finish`
gate, and browser verification stay on d1. If d2 is unreachable, say so and
run the check on d1 under the rules above.

The script needs this rule in `.claude/settings.local.json` (Austen adds it):
`"PowerShell(pwsh scripts/d2-run.ps1 *)"`. Don't replace the script with raw
`ssh` or `scp` calls.
