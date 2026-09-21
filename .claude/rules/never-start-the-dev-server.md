# Port 5173 Ownership

Port 5173 and the `tka-dev` process belong to Austen's Agent Hub workflow.

- Never start, restart, stop, replace, or kill port 5173, `tka-dev`, or
  `scripts/start-dev.ps1`, even when the server appears broken.
- Diagnose with read-only process, port, and log checks. Ask Austen to use the
  Agent Hub control if a restart is required.
- The server binds IPv6 and uses HTTPS/2. Probe it with
  `curl.exe -k -g "https://[::1]:5173/"`; an IPv4 localhost failure is not proof
  that it is down.
- A task that needs an independent server may use a free non-5173 port after the
  `resource-budget.md` gate. For a delivery preview, the server's working
  directory must be the task worktree; verify the changed route and worktree
  content, open it in the task browser when available, and provide its clickable
  URL. Keep the handed-off preview process and tab alive past the final response.
  Use a persistent or detached process when needed, record its process, port,
  worktree, and log in task context, and stop it only when superseded by
  integration or when the user finishes the task.
- Do not kill another task's server or process to obtain a port or memory.
