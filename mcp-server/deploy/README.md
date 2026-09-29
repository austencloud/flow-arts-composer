# Flow Arts Knowledge MCP — Bulletproof Deploy

Two Windows services that survive reboots, crashes, and closed terminals:

1. **`FlowArtsKnowledgeMCP`** — the Node MCP server listening on `localhost:3333`
2. **`cloudflared`** — a Cloudflare Tunnel exposing it at a stable public URL

Both start automatically at boot. The public URL never rotates (it's a real DNS record on `tkaflowarts.com`, not a `trycloudflare.com` throwaway).

---

## Part 1 — MCP server service (one-time, ~2 min)

Open **PowerShell as Administrator**, then:

```powershell
cd E:\tka-platform\mcp-server\deploy
powershell -ExecutionPolicy Bypass -File .\install-service.ps1
```

The script:
- Installs NSSM via winget if missing
- Registers `FlowArtsKnowledgeMCP` as an auto-start Windows service
- Points it at `run-mcp-http.cmd` (which runs `tsx index.ts` with `MCP_HTTP_PORT=3333`)
- Configures restart-on-crash (3s delay) and rotating logs at `deploy\logs\`
- Starts it and smoke-tests `http://localhost:3333/`

If the smoke test passes you're done with part 1. If not, check `deploy\logs\mcp-stderr.log`.

---

## Part 2 — Cloudflare Tunnel (one-time, ~5 min)

Follow the official remote-managed path (Cloudflare's current recommended setup):

1. Open [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) → **Networks → Tunnels** → **Create a tunnel**.
2. Connector type: **Cloudflared**. Name it `tka-mcp`. **Save tunnel**.
3. In the dashboard (**Networking → Tunnels → `tka-mcp`**), with Environment
   **Windows** and Architecture **64-bit**, copy the token with the copy icon.
   The install command on screen is masked. **Never run it.** It puts the token
   on the service's command line, which any local user can read, and Windows
   logs that line in plain text in System event 7045 ("A service was
   installed"). That is how the `tka-mcp` token leaked before its 2026-09-28
   rotation. Instead, from **an elevated PowerShell**, save the token where
   only SYSTEM and Administrators can read it, and create the service yourself:

   ```powershell
   $dir = 'C:\ProgramData\cloudflared'
   New-Item -ItemType Directory -Force $dir | Out-Null
   # No inheritance: full control for SYSTEM and Administrators only
   icacls $dir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'
   # Writes the clipboard's last word (the token, even from a copied command) as
   # UTF-8 without a BOM, so the token never appears on a command line
   [IO.File]::WriteAllText("$dir\tka-mcp.token", ((Get-Clipboard -Raw).Trim() -split '\s+')[-1])

   $bin = '"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --protocol http2 run --token-file "C:\ProgramData\cloudflared\tka-mcp.token"'
   New-Service -Name Cloudflared -DisplayName 'Cloudflared agent' -StartupType Automatic -BinaryPathName $bin
   sc.exe failure Cloudflared reset= 86400 actions= restart/20000   # restart 20 s after a crash
   Start-Service Cloudflared
   ```

   Event 7045 now records only the file path. Delete the copied entry from
   clipboard history (**Win+V**), wait for the dashboard to show the connector
   as healthy, then **Next**.

4. **Public Hostnames** tab → **Add a public hostname**:
   - Subdomain: `mcp`
   - Domain: `tkaflowarts.com`
   - Type: `HTTP`
   - URL: `localhost:3333`
   - **Save hostname**.
5. In the **TLS** section of that hostname's advanced settings, leave **No TLS verify** off — the origin is plain HTTP on localhost, which Cloudflare handles correctly by default.

Public URL: `https://mcp.tkaflowarts.com/mcp`

**Rotating the token.** In **Networking → Tunnels → `tka-mcp`**, open
**Overview** → **Refresh token** → **Rotate token**, then copy the new token
with the copy icon. Again, never run the install command. From an elevated
PowerShell, overwrite the file (it keeps the folder's ACL) and restart the
service:

```powershell
[IO.File]::WriteAllText('C:\ProgramData\cloudflared\tka-mcp.token', ((Get-Clipboard -Raw).Trim() -split '\s+')[-1])
Restart-Service Cloudflared
```

Then delete the copied entry from clipboard history (**Win+V**).

---

## Part 2b — Authorization (REQUIRED — the service will not start without it)

Since `0472386f94`, enabling `MCP_HTTP_PORT` without auth config is a fatal
startup error. There is no unauthenticated fallback, so a missing config
crash-loops the service until NSSM parks it as `PAUSED` and the tunnel 502s.

Cloudflare Access is the authorization server. It fronts the tunnel, runs the
OAuth flow with claude.ai, resolves the client's opaque token, and forwards a
signed JWT to the origin on `Cf-Access-Jwt-Assertion`. The origin verifies that
JWT against Access's JWKS — so a request that bypassed Access has no valid token
and is refused, and Cloudflare is never the only thing standing in front.

**Dashboard (one-time):**

1. Zero Trust → **Access controls → AI controls → Add an MCP server**.
   Server URL `https://mcp.tkaflowarts.com/mcp`. Add a policy that allows your
   own email.
2. In that application's **Advanced settings**, enable **Managed OAuth**. This is
   what lets claude.ai register itself; Access-for-SaaS OIDC has no dynamic
   client registration and would force a manually-pasted client ID.
3. Copy the application's **AUD tag** (Application Configuration → additional
   settings) and your team name from the team domain
   `https://<team>.cloudflareaccess.com`.

**Then create `deploy\auth.local.cmd`** (gitignored, never committed):

```bat
@echo off
set MCP_AUTH_ISSUER=https://<team>.cloudflareaccess.com
set MCP_AUTH_JWKS_URI=https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
set MCP_AUTH_RESOURCE_URL=https://mcp.tkaflowarts.com/mcp
set MCP_AUTH_AUDIENCE=<the AUD tag>
set MCP_AUTH_TOKEN_HEADER=Cf-Access-Jwt-Assertion
set MCP_ALLOWED_HOSTS=mcp.tkaflowarts.com,localhost,127.0.0.1
```

`MCP_AUTH_REQUIRED_SCOPE` is deliberately unset: an Access assertion carries no
`scope` claim, and demanding one rejects every valid token. The three URLs above
are what make the transport authenticated; they are not optional.

| Variable | Meaning |
|---|---|
| `MCP_AUTH_ISSUER` | Compared byte-for-byte against `iss`. No trailing slash for Access. |
| `MCP_AUTH_JWKS_URI` | Access signing keys. They rotate every 6 weeks; `jose` refetches on an unknown `kid`. |
| `MCP_AUTH_RESOURCE_URL` | This server's canonical public `/mcp` URL (RFC 9728 identifier). |
| `MCP_AUTH_AUDIENCE` | The Access AUD tag. Without it the audience defaults to the resource URL, which Access does not send, and every token is rejected. |
| `MCP_AUTH_TOKEN_HEADER` | Where the verifiable JWT arrives. Default `authorization`; Access needs the override. |

---

## Part 3 — Point claude.ai at the new URL

1. Open claude.ai → Settings → Integrations.
2. Edit the **Flow Arts Knowledge** MCP integration.
3. Replace the old `medicine-relationship-grew-now.trycloudflare.com/mcp` URL with `https://mcp.tkaflowarts.com/mcp`.
4. Reconnect. In Claude Code: `claude mcp list` should show it as `✓ Connected`.

---

## Verifying end-to-end

From any checkout, `npm run verify:mcp-service` checks everything below in one
read-only pass: the service state, the local health URL, how many times the
server exited on its own in the last hour, and whether any running cloudflared
tunnel routes `mcp.tkaflowarts.com`. It exits 1 and says what failed, with the
last error line from `logs\mcp-stderr.log` when the server itself is down.
`--json` prints the same report for other tools.

```powershell
# Service status
Get-Service FlowArtsKnowledgeMCP, cloudflared

# Local health — the only one that returns the plain string
curl http://localhost:3333/

# Public — Access answers BEFORE the tunnel, so this is a 401 challenge, not the
# health string, and it comes back even when no tunnel routes the hostname.
curl -i https://mcp.tkaflowarts.com/mcp
```

The public 401 must carry `WWW-Authenticate: Bearer ... resource_metadata=...`.
`Server-Timing: cfOrigin;dur=0` confirms Access refused it at the edge without
ever reaching the tunnel, so a 401 proves nothing about the tunnel or the
server. The route check in `npm run verify:mcp-service` asks each running
cloudflared which hostnames it routes; calling a tool through the claude.ai
connector is the only end-to-end proof.

---

## Monitoring

A scheduled task under your account runs that check at logon and every 15
minutes, and shows a Windows notification when the connector stops working.
It needs no admin rights:

```powershell
cd E:\tka-platform\mcp-server\deploy
powershell -ExecutionPolicy Bypass -File .\install-watch-task.ps1             # install; runs once right away
powershell -ExecutionPolicy Bypass -File .\install-watch-task.ps1 -Uninstall  # remove
```

The task runs `scripts\watch-mcp-service.mjs` from the main checkout through a
headless console, so no window appears. A failure counts only when a second
check a minute later agrees. You get a notification when the connector goes
down, when the problem moves between the server and the tunnel route, every 6
hours while it stays down, and once when it works again. Problem notifications
stay on screen until you dismiss them. The watcher never starts, stops, or
reconfigures the service. Its state and a line per run are in
`%LOCALAPPDATA%\FlowArtsKnowledgeMCP\`, and
`node scripts\watch-mcp-service.mjs --test-notification` shows a sample.

**Log retention.** NSSM rotates both logs before every start and never deletes
the old copies, so a crash loop leaves two files per attempt. Before each start,
`run-mcp-http.cmd` runs `prune-logs.mjs`, which keeps the newest 200 rotated
logs in `deploy\logs\` and never touches the live logs or subfolders. The
backlog from before the cap is in `deploy\logs\archive-2026-09-28\`; delete it
whenever you like.

---

## Updating the server

After changing code in `mcp-server\src\`:

```powershell
Restart-Service FlowArtsKnowledgeMCP    # needs an ELEVATED shell
```

No rebuild needed — it runs via `tsx` on source.

**After a merge that changes `mcp-server\package.json` or its lockfile**,
install in this folder before the service next restarts. The service loads
packages from the main checkout's `mcp-server\node_modules`, which a root
`pnpm install` never touches. The running process keeps its old code until a
restart or reboot, then fails on the missing package. That is how it
crash-looped from 2026-09-18 to 09-27.

```powershell
npm install --no-save --ignore-scripts --prefix "E:\tka-platform\mcp-server"
```

Never use `npm ci` here. It deletes `node_modules`, which holds the junctions
into `packages\`. If npm fails with `EPERM` or `EBUSY`, a running process has
one of the files open: stop the service (elevated), install, then start it.
`npm run wt:finish` checks this folder and `mcp-server-pkg` after every merge
and prints the install command when either drifts from its lockfile. Run the
same check at any time with `npm run verify:standalone-installs` from the repo
root.

**If it comes back as `Paused`, it is crash-looping, not idle.** NSSM parks a
service that keeps exiting. `Get-Service` shows `Paused`, nothing listens on
:3333, and claude.ai reports a sign-in/registration failure rather than a
connection error. The actual cause is always in `deploy\logs\mcp-stderr.log`:

```powershell
sc.exe query FlowArtsKnowledgeMCP          # STATE : 7 PAUSED
Get-Content .\logs\mcp-stderr.log -Tail 20
```

---

## Uninstall

```powershell
nssm stop FlowArtsKnowledgeMCP confirm
nssm remove FlowArtsKnowledgeMCP confirm
Stop-Service Cloudflared
sc.exe delete Cloudflared
Remove-Item C:\ProgramData\cloudflared\tka-mcp.token
```
