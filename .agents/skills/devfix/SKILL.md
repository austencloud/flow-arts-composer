---
name: devfix
description: Use when local dev infrastructure is broken — dev.tkaflowarts.com shows 502/503, the dev server won't serve, https/certificate errors, the Cloudflare tunnel is down, the Codex launcher or right-click context menu broke, or "fix my dev environment". Encodes the known failure modes so they're diagnosed in minutes, not rediscovered.
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# Fix Dev Infrastructure

When explicitly invoked, treat the text after `$devfix` as `<arguments>`. Expected shape: `[symptom, e.g. 'dev.tkaflowarts.com 502']`.

**Args:** `<arguments>`

The stack: Vite serves **HTTPS/2** on `:5173` (mkcert certs in `.cert/`),
cloudflared runs the locally-managed `tka-dev` tunnel exposing it as
`https://dev.tkaflowarts.com`. `scripts/start-dev.ps1` orchestrates both and
its header comments are the canonical doc — read it before theorizing.

**Restart `:5173` with `pm2 restart tka-dev`.** pm2 supervises the server as
`tka-dev` and restarts the tunnel with it. When the server is down or stuck,
diagnose, then restart it yourself without asking. Never start it by
`npm run dev`, a bare `vite`, or a hand-run `scripts/start-dev.ps1`, and never
kill the port holder: those lack the tunnel and fight pm2 for the port. See
`.claude/rules/never-start-the-dev-server.md`.

Diagnose with `curl -k -g 'https://[::1]:5173/'` — `dev` is `vite --host ::`
(IPv6), so plain `localhost` resolves to IPv4 and returns `000` on a healthy
server.

## First: split the fault domain

```powershell
curl.exe -k -s -o NUL -w "%{http_code}" --max-time 5 https://localhost:5173/
curl.exe -s -o NUL -w "%{http_code}" --max-time 10 https://dev.tkaflowarts.com/
```

| local | tunnel | Meaning                                                                                                                                                                                                                  |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 000   | 502    | Vite isn't serving — run `pm2 restart tka-dev`                                                                                                                                                                           |
| 200   | 502    | Tunnel connected before Vite finished cold boot (the race `start-dev.ps1` now gates against), or cloudflared died — run `pm2 restart tka-dev`                                                                            |
| 200   | 503    | Token-based tunnel run missing `--url` — locally-managed tunnels get **no ingress rules** with a token; every request 503s. `start-dev.ps1` passes `--url https://localhost:5173`; a hand-started tunnel probably didn't |
| 200   | 200    | Nothing wrong with the stack — the bug is elsewhere                                                                                                                                                                      |

## Known failure modes

- **`http://` anywhere → ERR_EMPTY_RESPONSE.** The dev server is HTTPS/h2
  only. Every localhost URL, curl, and link is `https://`.
- **Tunnel origin TLS:** cloudflared can't read the Windows trust store for
  the mkcert CA → runs need `--no-tls-verify` (script handles it).
- **Tunnel credentials:** `%USERPROFILE%\.cloudflared\tka-dev.token` (or
  `cert.pem` from `cloudflared tunnel login`). Missing both → script skips the
  tunnel with a warning; dev.tkaflowarts.com stays dead. Refresh a token via
  `cloudflared tunnel token tka-dev` on a logged-in machine.
- **allowedHosts:** Vite only answers for hosts in `vite.config.ts`
  `server.allowedHosts` (includes `dev.tkaflowarts.com`). A new hostname needs
  adding there.
- **`Cannot find module` during initialization:** run
  `pnpm run verify:workspace-install` as a read-only diagnosis. A package
  directory can exist while its files are missing, and a normal `pnpm install`
  may still report "Already up to date." `scripts/start-dev.ps1` now checks all
  declared package manifests plus the boot-critical imports before Vite starts.
  When the check fails it force-rebuilds from the frozen lockfile, rebuilds the
  workspace packages, verifies again, and gives Vite one clean optimizer pass.
  If that repair still fails, the launcher deliberately leaves Vite stopped and
  prints the package that is still broken instead of caching the failure.
- **Launcher / context menu:** `launchers/start-codex.bat` and
  `launchers/install-codex-context-menu.ps1` (registry `HKCU` key pointing at
  the Codex install — reinstalls move the path; rerun the installer script).
- **Whole-machine setup:** `launchers/bootstrap-machine.ps1` replicates the
  full agent scaffolding on a fresh machine (CLIs, context menus, launcher
  shortcuts, global Claude/Codex config, pm2 stack, PrtSc→F13 remap). It is
  idempotent, so it also works as a repair-everything pass here; assets live
  in `launchers/bootstrap-assets/`.

## After any fix

Prove it: rerun both curls and show the codes, or have Austen confirm the
page loads. Config-only changes still follow `verification-protocol.md`.
