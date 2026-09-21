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
