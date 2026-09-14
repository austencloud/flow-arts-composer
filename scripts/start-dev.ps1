# Unified dev server startup
# - Starts the Vite dev server (background), waits until it actually serves,
#   THEN starts the Cloudflare tunnel (dev.tkaflowarts.com).
# - Verifies installed dependency manifests and imports before Vite starts. A
#   broken install is rebuilt from the frozen lockfile and rechecked first.
# - Restores the machine-local mkcert certificate pair before Vite starts. The
#   tunnel always targets HTTPS, so allowing Vite to silently fall back to HTTP
#   would leave a connected tunnel returning 502s.
# - Ordering matters: cloudflared connects to Cloudflare's edge in ~1s, but Vite
#   on a project this size takes much longer to boot. If the tunnel comes up
#   first, dev.tkaflowarts.com returns 502 Bad Gateway for the whole cold-boot
#   window (edge connected, origin not yet answering). Gating the tunnel on a
#   real 200 from the origin closes that window.
# - The script supervises Vite and the public tunnel independently. If
#   cloudflared exits or stops serving while Vite is healthy, only the tunnel
#   is recycled with bounded backoff. A dead tunnel can no longer leave the
#   Agent Hub process looking healthy indefinitely.
# - Process existence is not treated as origin health. If Vite stops serving
#   while its pnpm/cmd wrapper remains alive, the launcher exits after three
#   failed probes so pm2 can rebuild the complete process tree.
# - Under pm2 the launcher watches its supervising shim (start-dev-pm2.cjs).
#   pm2 on Windows kills only that shim on stop/restart and cannot reach this
#   tree, so without the watch every restart left an orphaned Vite holding
#   :5173 and the next boot killed whichever server was actually healthy. When
#   the shim disappears, the launcher stops itself and its finally block tears
#   down Vite and the tunnel.
#
# Tunnel credentials (one-time setup on a new machine), first match wins:
#   1. Token file:  %USERPROFILE%\.cloudflared\tka-dev.token
#      (paste the tunnel token from Cloudflare Zero Trust -> Networks -> Tunnels,
#       or run `cloudflared tunnel token tka-dev` on a logged-in machine)
#   2. Origin cert: %USERPROFILE%\.cloudflared\cert.pem  (from `cloudflared tunnel login`)
# If neither exists the tunnel is skipped with a warning and Vite starts anyway.

try { $Host.UI.RawUI.WindowTitle = "TKA Dev Server" } catch { }

# Stream to real stdout so MINGW / Git Bash pty flushes live.
# Write-Host writes to the PS host object, which Git Bash's pty does not
# see until the child process exits. [Console]::Out.WriteLine goes direct
# to stdout so output appears line-by-line in bash terminals.
function Write-Line($msg) {
    [Console]::Out.WriteLine($msg)
    [Console]::Out.Flush()
}
function Write-Status($msg, $color = "White") {
    Write-Line "[$((Get-Date).ToString('HH:mm:ss'))] $msg"
}

# Poll the Vite origin until it serves a 200 (or we time out). curl.exe ships
# with Windows 10/11 and honors -k for the mkcert self-signed dev cert; Windows
# PowerShell 5.1's Invoke-WebRequest has no -SkipCertificateCheck. A pre-boot
# request yields "000" (connection refused) until Vite is listening.
function Wait-ForOrigin {
    param([string]$Url = "https://[::1]:5173/", [int]$TimeoutSec = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-SupervisorAlive)) { return $false }
        $code = & curl.exe -g -k -s -o NUL -w "%{http_code}" --max-time 5 $Url
        if ($code -eq "200") { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# The pm2 shim hands us its pid in TKA_PM2_PARENT_PID. Once that process is
# gone, pm2 has already moved on (stop, restart, or crash) and this tree is an
# orphan that would fight the replacement boot for :5173. Manual runs have no
# supervisor and never trip this.
$supervisorPid = 0
if ($env:TKA_PM2_PARENT_PID -match '^\d+$') { $supervisorPid = [int]$env:TKA_PM2_PARENT_PID }
function Test-SupervisorAlive {
    if ($supervisorPid -le 0) { return $true }
    $alive = $null -ne (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue)
    if (-not $alive) {
        Write-Status "pm2 shim (PID $supervisorPid) is gone - this launcher is orphaned; shutting down its Vite and tunnel."
    }
    return $alive
}

function Test-Http200 {
    param(
        [string]$Url,
        [bool]$SkipCertificateCheck = $false,
        [int]$TimeoutSec = 8
    )

    $curlArguments = @("-g", "-s", "-o", "NUL", "-w", "%{http_code}", "--max-time", $TimeoutSec)
    if ($SkipCertificateCheck) { $curlArguments += "-k" }
    $curlArguments += $Url

    $code = & curl.exe @curlArguments
    return $code -eq "200"
}

function Test-CompetingCloudflaredService {
    $service = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
    return $service -and $service.Status -eq "Running"
}

# A previous launcher or an ad-hoc tunnel command can leave a connector alive
# after its owner exits. Cloudflare will keep routing requests through every
# registered connector, so even one stale process can make otherwise healthy
# requests fail intermittently. Match only this tunnel, never dev2/dev3.
function Get-StaleTkaTunnelProcesses {
    param([string]$TokenFile)

    $token = if (Test-Path -LiteralPath $TokenFile) {
        (Get-Content -LiteralPath $TokenFile -Raw).Trim()
    } else {
        $null
    }

    return @(Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $commandLine = $_.CommandLine
            if (-not $commandLine) { return $false }

            $isNamedTunnel = $commandLine -match '(?i)(?:^|\s)run\s+tka-dev(?:\s|$)'
            $usesManagedToken = $token -and $commandLine.Contains($token)
            return $isNamedTunnel -or $usesManagedToken
        })
}

function Clear-StaleTkaTunnelProcesses {
    param([string]$TokenFile)

    $staleProcesses = @(Get-StaleTkaTunnelProcesses $TokenFile)
    foreach ($process in $staleProcesses) {
        Write-Status "Stopping stale tka-dev tunnel connector PID $($process.ProcessId) before managed startup."
        Stop-ProcessTree $process.ProcessId
    }
    if ($staleProcesses.Count -gt 0) { Start-Sleep -Seconds 1 }
}

# Stop-Process on the cmd wrapper leaves the pnpm/node grandchildren alive
# (it is not a tree kill), and an orphaned vite holding :5173 pushes the next
# boot to :5174 because `pnpm run dev` has no --strictPort — which silently
# breaks the tunnel and every localhost:5173 consumer. taskkill /T takes the
# whole tree down.
function Stop-ProcessTree($processId) {
    if ($processId) {
        & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    }
}

# Pre-boot sweep: anything already listening on :5173 is a stale server from a
# previous run — tree-kill it so this boot owns the port. If pm2 supervises
# tka-dev, stop it through pm2 FIRST: killing its vite directly makes pm2
# respawn it instantly, and the respawn wins the race for :5173 (manual boots
# then die with "port already in use"). Skipped when we ARE the pm2 child
# (TKA_PM2 set by start-dev-pm2.cjs) — pm2 stop would stop ourselves.
function Stop-Pm2App {
    if ($env:TKA_PM2) { return }
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2) {
        Write-Status "Stopping pm2 app tka-dev (manual run takes over; 'pm2 start tka-dev' to hand back)."
        & pm2 stop tka-dev 2>$null | Out-Null
    }
}
function Clear-Port5173 {
    $owners = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $owners) {
        Write-Status "Port 5173 held by PID $ownerPid - killing its process tree."
        Stop-ProcessTree $ownerPid
    }
    if ($owners) { Start-Sleep -Seconds 2 }
}

# Vite remembers failed package resolution for the life of the process. Check
# the real installed files and import the boot-critical dependency graph before
# Vite is allowed to start, so a hollow pnpm package directory cannot poison the
# module graph until Austen restarts again.
function Test-WorkspaceInstall($RepoRoot) {
    $verifier = Join-Path $RepoRoot "scripts\verify-workspace-install.mjs"
    $check = Start-Process -FilePath "node.exe" -ArgumentList $verifier, $RepoRoot `
        -WorkingDirectory $RepoRoot -NoNewWindow -Wait -PassThru
    return $check.ExitCode -eq 0
}

function Invoke-RepoCommand($RepoRoot, $Command) {
    $commandProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/s", "/c", $Command `
        -WorkingDirectory $RepoRoot -NoNewWindow -Wait -PassThru
    return $commandProcess.ExitCode
}

function Repair-WorkspaceInstall($RepoRoot) {
    Write-Status "Dependency preflight failed - rebuilding the frozen install before Vite starts."

    $installExit = Invoke-RepoCommand $RepoRoot "pnpm install --force --offline --frozen-lockfile --reporter=append-only"
    if ($installExit -ne 0) {
        Write-Status "Offline repair could not complete - retrying from the registry with the same frozen lockfile."
        $installExit = Invoke-RepoCommand $RepoRoot "pnpm install --force --frozen-lockfile --reporter=append-only"
    }
    if ($installExit -ne 0) {
        throw "Dependency repair failed. Vite was not started with an unhealthy install."
    }

    $buildExit = Invoke-RepoCommand $RepoRoot "pnpm run build:packages"
    if ($buildExit -ne 0) {
        throw "Workspace package rebuild failed. Vite was not started with stale package entrypoints."
    }

    if (-not (Test-WorkspaceInstall $RepoRoot)) {
        throw "Dependency repair completed but the install still fails its importability check. Vite was not started."
    }

    # The repaired package version may be identical, so source paths alone do
    # not prove Vite's existing optimizer output is safe. Force exactly the next
    # dev-server optimizer pass through the canonical Vite cache owner.
    $env:TKA_FORCE_VITE_DEPS = "1"
    Write-Status "Dependency repair verified - Vite will rebuild its dependency cache once."
}

# SvelteKit's generated route proxies are shared mutable state. A route-tree
# update can leave the root proxy absent if generation is interrupted, and Vite
# then serves a sticky 500 even though its process is still alive. Run the
# existing guarded generator only while Vite is stopped so startup never inherits
# that broken state.
function Repair-SvelteKitGeneratedState($RepoRoot) {
    Write-Status "Verifying SvelteKit generated route state before Vite starts."
    $syncExit = Invoke-RepoCommand $RepoRoot "node scripts/svelte-kit-sync-if-needed.mjs"
    if ($syncExit -ne 0) {
        throw "SvelteKit generated route repair failed. Vite was not started with missing route proxies."
    }
}

# Read the response only after the cheap status-only origin probe fails. This
# distinguishes the known generated-proxy race from a real source-code error;
# only the former earns an immediate full-stack recycle.
function Test-SvelteKitGeneratedStateError {
    param(
        [string]$Url,
        [bool]$SkipCertificateCheck = $false,
        [int]$TimeoutSec = 8
    )

    $curlArguments = @("-g", "-s", "--max-time", $TimeoutSec)
    if ($SkipCertificateCheck) { $curlArguments += "-k" }
    $curlArguments += $Url

    $response = (& curl.exe @curlArguments 2>$null) -join "`n"
    return $response -match "ENOENT: no such file or directory" -and
        $response -match "\.svelte-kit[\\\\/]types[\\\\/]src[\\\\/]routes[\\\\/]proxy\+layout\.server\.ts"
}

function Ensure-DevHttpsCertificate($RepoRoot) {
    $certificateDirectory = Join-Path $RepoRoot ".cert"
    $certificatePath = Join-Path $certificateDirectory "dev-cert.pem"
    $keyPath = Join-Path $certificateDirectory "dev-key.pem"

    if ((Test-Path -LiteralPath $certificatePath) -and (Test-Path -LiteralPath $keyPath)) {
        return
    }

    $mkcert = Join-Path $RepoRoot ".tools\mkcert.exe"
    if (-not (Test-Path -LiteralPath $mkcert)) {
        throw "Dev HTTPS certificate is missing and $mkcert is unavailable. Vite was not started because the Cloudflare tunnel requires HTTPS."
    }

    New-Item -ItemType Directory -Force -Path $certificateDirectory | Out-Null
    Write-Status "Dev HTTPS certificate missing - regenerating the localhost certificate pair."
    & $mkcert -cert-file $certificatePath -key-file $keyPath localhost 127.0.0.1 ::1

    if (($LASTEXITCODE -ne 0) -or
        (-not (Test-Path -LiteralPath $certificatePath)) -or
        (-not (Test-Path -LiteralPath $keyPath))) {
        throw "Dev HTTPS certificate generation failed. Vite was not started because the Cloudflare tunnel requires HTTPS."
    }

    Write-Status "Dev HTTPS certificate restored."
}

function Start-TkaTunnel {
    param(
        [string]$Cloudflared,
        [string]$TokenFile,
        [string]$CertFile
    )

    if (Test-Path -LiteralPath $TokenFile) {
        $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
        if (-not $token) {
            throw "The tka-dev tunnel token file is empty."
        }

        # Flag order matters. These configure the tunnel command and must
        # precede the run subcommand. After `run`, ingress flags parse but never
        # reach the ingress builder. HTTP/2 is deliberate: cloudflared's own
        # connectivity precheck selects it for this host, while QUIC connections
        # have remained registered during repeated public request timeouts.
        return Start-Process -FilePath $Cloudflared -ArgumentList `
            "tunnel", "--protocol", "http2", "--url", "https://localhost:5173", "--no-tls-verify", `
            "run", "--token", $token -NoNewWindow -PassThru
    }

    if (Test-Path -LiteralPath $CertFile) {
        # Named-tunnel ingress and origin TLS settings live in
        # %USERPROFILE%\.cloudflared\config.yml.
        return Start-Process -FilePath $Cloudflared -ArgumentList `
            "tunnel", "--protocol", "http2", "run", "tka-dev" -NoNewWindow -PassThru
    }

    return $null
}

function Register-TunnelExitCleanup($Process) {
    if (-not $Process) { return }

    # Kill the current tunnel if this window closes without reaching finally.
    # Restarted tunnel children each receive their own exit cleanup registration.
    $null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
        Get-Process -Id $event.MessageData -ErrorAction SilentlyContinue | Stop-Process -Force
    } -MessageData $Process.Id
}

# Main execution
Write-Line ""
Write-Line "========================================"
Write-Line "     TKA Development Server"
Write-Line "========================================"
Write-Line ""

# --- Resolve cloudflared + credentials (tunnel starts later, after Vite is up) -
$cloudflared = $null
# Only a real .exe works with Start-Process. Get-Command can resolve to the npm
# shim (cloudflared.ps1, an ExternalScript) which Start-Process rejects with
# "%1 is not a valid Win32 application." Take an Application whose source ends in
# .exe; otherwise fall back to the known install path.
$cmd = Get-Command cloudflared -CommandType Application -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -like "*.exe" } | Select-Object -First 1
if ($cmd) { $cloudflared = $cmd.Source }
elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
}

$tokenFile = Join-Path $env:USERPROFILE ".cloudflared\tka-dev.token"
$certFile = Join-Path $env:USERPROFILE ".cloudflared\cert.pem"
$tunnelProc = $null
$hasTunnelCredentials = (Test-Path -LiteralPath $tokenFile) -or (Test-Path -LiteralPath $certFile)
$manageTunnel = $cloudflared -and $hasTunnelCredentials

if ($manageTunnel -and (Test-CompetingCloudflaredService)) {
    throw "The Windows Cloudflared service is already running and would create a second tka-dev connector. Stop and disable that service before starting the Agent Hub dev server."
}
if ($manageTunnel) {
    Clear-StaleTkaTunnelProcesses $tokenFile
}

# --- Start Vite first, in the background, so we can wait for it -----------------
# cmd.exe /c wraps pnpm (a .cmd/.ps1 shim Start-Process can't launch directly)
# and stays alive for the life of the dev server. -NoNewWindow streams Vite logs
# into this console and keeps node in this process tree, so console Ctrl+C and
# VS Code "terminate" both reach it. WorkingDirectory is the repo root.
$repoRoot = Split-Path -Parent $PSScriptRoot
Ensure-DevHttpsCertificate $repoRoot
if (-not (Test-WorkspaceInstall $repoRoot)) {
    Stop-Pm2App
    Clear-Port5173
    Repair-WorkspaceInstall $repoRoot
} else {
    Stop-Pm2App
    Clear-Port5173
}
Repair-SvelteKitGeneratedState $repoRoot
Write-Status "Starting Vite dev server..."
Write-Line ""
$viteProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm run dev" `
    -WorkingDirectory $repoRoot -NoNewWindow -PassThru

try {
    # --- Wait for Vite to actually serve, THEN bring up the tunnel -------------
    if (-not $cloudflared) {
        Write-Status "cloudflared not found - skipping tunnel. Install: winget install Cloudflare.cloudflared"
    } elseif ($hasTunnelCredentials) {
        Write-Status "Waiting for Vite on https://localhost:5173 before opening the tunnel..."
        if (Wait-ForOrigin) {
            Write-Status "Vite is serving - starting Cloudflare tunnel (dev.tkaflowarts.com)."
        } else {
            Write-Status "Vite not ready after 180s - starting tunnel anyway (may 502 until Vite is up)."
        }

        try {
            $tunnelProc = Start-TkaTunnel $cloudflared $tokenFile $certFile
        } catch {
            Write-Status "Cloudflare tunnel could not start: $($_.Exception.Message)"
            $tunnelProc = $null
        }

        if ($tunnelProc) {
            Register-TunnelExitCleanup $tunnelProc
            Write-Status "Tunnel connector started; verifying https://dev.tkaflowarts.com in the background."
        }
    } else {
        Write-Status "No tunnel credentials - dev.tkaflowarts.com will NOT be live."
        Write-Status "  One-time fix: run 'cloudflared tunnel login', then restart."
        Write-Status "  (Or save the tunnel token to $tokenFile)"
    }

    # Supervise Vite and the tunnel separately. Process existence is not enough:
    # cloudflared can stay connected while the public route hangs. Three failed
    # public probes recycle only cloudflared, preserving the healthy Vite server.
    $originUrl = "https://[::1]:5173/"
    $nextHealthProbeAt = Get-Date
    $originFailureCount = 0
    $publicFailureCount = 0
    $tunnelRestartCount = 0
    while ($viteProc -and -not $viteProc.HasExited) {
        if (-not (Test-SupervisorAlive)) { break }
        if ($manageTunnel -and ((-not $tunnelProc) -or $tunnelProc.HasExited)) {
            $exitCode = if ($tunnelProc) { $tunnelProc.ExitCode } else { "not started" }
            $tunnelRestartCount += 1
            $restartDelaySec = [Math]::Min(30, [Math]::Pow(2, [Math]::Min(4, $tunnelRestartCount)))
            Write-Status "Cloudflare tunnel unavailable (code $exitCode); restarting in $restartDelaySec seconds while Vite stays online."
            Start-Sleep -Seconds $restartDelaySec
            try {
                $tunnelProc = Start-TkaTunnel $cloudflared $tokenFile $certFile
                Register-TunnelExitCleanup $tunnelProc
            } catch {
                Write-Status "Cloudflare tunnel restart failed: $($_.Exception.Message)"
                $tunnelProc = $null
            }
            $publicFailureCount = 0
            $nextHealthProbeAt = (Get-Date).AddSeconds(10)
        } elseif ((Get-Date) -ge $nextHealthProbeAt) {
            if (-not (Test-Http200 $originUrl $true)) {
                $originFailureCount += 1
                $publicFailureCount = 0
                Write-Status "Local Vite origin probe failed ($originFailureCount/3)."
                if (Test-SvelteKitGeneratedStateError $originUrl $true) {
                    throw "SvelteKit's generated root route proxy is unavailable. Exiting so pm2 can repair the generated state and restart the dev stack."
                }
                if ($originFailureCount -ge 3) {
                    throw "Local Vite origin remained unavailable across three probes. Exiting so pm2 can restart the complete dev stack."
                }
            } else {
                if ($originFailureCount -gt 0) {
                    Write-Status "Local Vite origin recovered."
                }
                $originFailureCount = 0

                if ($tunnelProc) {
                    if (Test-Http200 "https://dev.tkaflowarts.com/") {
                        if ($publicFailureCount -gt 0) {
                            Write-Status "Public tunnel recovered: https://dev.tkaflowarts.com"
                        } elseif ($tunnelRestartCount -eq 0) {
                            Write-Status "Tunnel verified: https://dev.tkaflowarts.com"
                        }
                        $publicFailureCount = 0
                        $tunnelRestartCount = 0
                    } else {
                        $publicFailureCount += 1
                        Write-Status "Public tunnel probe failed ($publicFailureCount/3); local Vite remains healthy."
                        if ($publicFailureCount -ge 3) {
                            Write-Status "Public tunnel is not serving - recycling cloudflared without stopping Vite."
                            Stop-ProcessTree $tunnelProc.Id
                        }
                    }
                }
            }
            $nextHealthProbeAt = (Get-Date).AddSeconds(30)
        }
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Status "Shutting down..."
    if ($tunnelProc -and -not $tunnelProc.HasExited) {
        Stop-ProcessTree $tunnelProc.Id
    }
    if ($viteProc -and -not $viteProc.HasExited) {
        Stop-ProcessTree $viteProc.Id
    }
}
