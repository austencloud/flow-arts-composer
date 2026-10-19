# Port 5173 Dev Server

Port 5173 is the project dev server. pm2 supervises it as `tka-dev`, which runs
`scripts/start-dev.ps1` (Vite plus the `tka-dev` Cloudflare tunnel).

- When 5173 is down or stuck, restart it yourself with `pm2 restart tka-dev`.
  Do not ask first; say in one line what you found and that you restarted it.
  Stuck means the port is listening but requests hang or the page never loads.
- Restart only through pm2. Do not run `npm run dev`, a bare `vite`, or
  `scripts/start-dev.ps1` on 5173, and do not kill the port holder. A
  hand-started server lacks the tunnel and fights pm2 for the port.
- Diagnose before restarting. The server binds IPv6 and uses HTTPS/2. Probe it
  with `curl.exe -k -g "https://[::1]:5173/"`; an IPv4 localhost failure is not
  proof that it is down. After a restart, probe again until it answers.
- A task that needs an independent server may use a free non-5173 port after the
  `resource-budget.md` gate. For a delivery preview, the server's working
  directory must be the task worktree; verify the changed route and worktree
  content, open it in the task browser when available, and provide its clickable
  URL. Keep the handed-off preview process and tab alive past the final response.
  Use a persistent or detached process when needed, record its process, port,
  worktree, and log in task context, and stop it only when superseded by
  integration or when the user finishes the task.
- Do not kill another task's server or process to obtain a port or memory.
