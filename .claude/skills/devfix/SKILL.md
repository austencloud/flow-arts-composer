---
description: Use when local dev infrastructure is broken — the dev server won't serve, https/certificate errors, the Claude launcher or right-click context menu broke, or "fix my dev environment". Encodes the known failure modes so they're diagnosed in minutes, not rediscovered.
argument-hint: "[symptom, e.g. 'localhost:5173 not serving']"
---

# Fix Dev Infrastructure

**Args:** `$ARGUMENTS`

The stack: Vite serves **HTTPS/2** on `:5173` (mkcert certs in `.cert/`).
`scripts/start-dev.ps1` launches and supervises it and its header comments are
the canonical doc — read it before theorizing.

**The public dev address (`dev.tkaflowarts.com`) and its Cloudflare tunnel were
retired on 2026-11-24. Do not repair, recreate, or probe them, and do not add a
tunnel back to the launcher.** Exposing a dev server needs a login in front and
Austen's explicit yes.

**Restart `:5173` with `pm2 restart tka-dev`.** pm2 supervises the server as
`tka-dev` and restarts the launcher with it. When the server is down or stuck,
diagnose, then restart it yourself without asking. Never start it by
`npm run dev`, a bare `vite`, or a hand-run `scripts/start-dev.ps1`, and never
kill the port holder: those fight pm2 for the port. See
`.claude/rules/never-start-the-dev-server.md`.

Diagnose with `curl -k -g 'https://[::1]:5173/'` — `dev` is `vite --host ::`
(IPv6), so plain `localhost` resolves to IPv4 and returns `000` on a healthy
server.

## First: check the local server

```bash
curl -k -s -o /dev/null -g -w "%{http_code}" --max-time 5 'https://[::1]:5173/'
```

`000` means Vite isn't serving: run `pm2 restart tka-dev`. `200` means the
server is fine and the bug is elsewhere.

## Known failure modes

- **`http://` anywhere → ERR_EMPTY_RESPONSE.** The dev server is HTTPS/h2
  only. Every localhost URL, curl, and link is `https://`.
- **allowedHosts:** Vite only answers for hosts in `vite.config.ts`
  `server.allowedHosts`. A new hostname needs adding there.
- **`Cannot find module` during initialization:** run
  `pnpm run verify:workspace-install` as a read-only diagnosis. A package
  directory can exist while its files are missing, and a normal `pnpm install`
  may still report "Already up to date." `scripts/start-dev.ps1` checks all
  declared package manifests plus the boot-critical imports before Vite starts.
  When the check fails it force-rebuilds from the frozen lockfile, rebuilds the
  workspace packages, verifies again, and gives Vite one clean optimizer pass.
  If that repair still fails, the launcher deliberately leaves Vite stopped and
  prints the package that is still broken instead of caching the failure.
- **Launcher / context menu:** `launchers/start-claude.bat` and
  `launchers/install-claude-context-menu.ps1` (registry `HKCU` key pointing at
  the Claude install — reinstalls move the path; rerun the installer script).
- **Whole-machine setup:** `launchers/bootstrap-machine.ps1` replicates the
  full agent scaffolding on a fresh machine (CLIs, context menus, launcher
  shortcuts, global Claude/Codex config, pm2 stack, PrtSc→F13 remap). It is
  idempotent, so it also works as a repair-everything pass here; assets live
  in `launchers/bootstrap-assets/`.

## After any fix

Prove it: rerun the curl and show the code, or have Austen confirm the
page loads. Config-only changes still follow `verification-protocol.md`.
