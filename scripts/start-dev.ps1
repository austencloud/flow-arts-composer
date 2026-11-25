# Dev server startup (Vite only, local, https://[::1]:5173/).
#
# NOTE: the public dev address (dev.tkaflowarts.com) and its Cloudflare tunnel
# were retired on 2026-11-24. Do not add a tunnel back to this script. Exposing
# a dev server needs a login in front of it and Austen's explicit yes.
#
# - Verifies installed dependency manifests and imports before Vite starts. A
#   broken install is rebuilt from the frozen lockfile and rechecked first.
# - Restores the machine-local mkcert certificate pair before Vite starts, so
#   Vite never silently falls back to HTTP.
# - Process existence is not treated as origin health. If Vite stops serving
#   while its pnpm/cmd wrapper remains alive, the launcher exits after three
#   failed probes so pm2 can rebuild the complete process tree.
# - Under pm2 the launcher watches its supervising shim (start-dev-pm2.cjs).
#   pm2 on Windows kills only that shim on stop/restart and cannot reach this
#   tree, so without the watch every restart left an orphaned Vite holding
#   :5173 and the next boot killed whichever server was actually healthy. When
#   the shim disappears, the launcher stops itself and its finally block tears
#   down Vite.

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
        Write-Status "pm2 shim (PID $supervisorPid) is gone - this launcher is orphaned; shutting down its Vite."
    }
    return $alive
}

function Get-HttpStatus {
    param(
        [string]$Url,
        [bool]$SkipCertificateCheck = $false,
        [int]$TimeoutSec = 8,
        [string]$Accept = ""
    )

    $curlArguments = @("-g", "-s", "-o", "NUL", "-w", "%{http_code}", "--max-time", $TimeoutSec)
    if ($SkipCertificateCheck) { $curlArguments += "-k" }
    if ($Accept) { $curlArguments += @("-H", "Accept: $Accept") }
    $curlArguments += $Url

    return & curl.exe @curlArguments
}

# Vite answers this Accept header itself with a 204 before any page renders,
# which separates a live server that is still rendering from a dead one.
function Test-VitePing([string]$Url) {
    return (Get-HttpStatus $Url $true 5 "text/x-vite-ping") -eq "204"
}

# Stop-Process on the cmd wrapper leaves the pnpm/node grandchildren alive
# (it is not a tree kill), and an orphaned vite holding :5173 pushes the next
# boot to :5174 because `pnpm run dev` has no --strictPort — which silently
# breaks every localhost:5173 consumer. taskkill /T takes the
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
        throw "Dev HTTPS certificate is missing and $mkcert is unavailable. Vite was not started because the dev server requires HTTPS."
    }

    New-Item -ItemType Directory -Force -Path $certificateDirectory | Out-Null
    Write-Status "Dev HTTPS certificate missing - regenerating the localhost certificate pair."
    & $mkcert -cert-file $certificatePath -key-file $keyPath localhost 127.0.0.1 ::1

    if (($LASTEXITCODE -ne 0) -or
        (-not (Test-Path -LiteralPath $certificatePath)) -or
        (-not (Test-Path -LiteralPath $keyPath))) {
        throw "Dev HTTPS certificate generation failed. Vite was not started because the dev server requires HTTPS."
    }

    Write-Status "Dev HTTPS certificate restored."
}

# Main execution
Write-Line ""
Write-Line "========================================"
Write-Line "     TKA Development Server"
Write-Line "========================================"
Write-Line ""

Write-Line "Local only: no public tunnel (retired 2026-11-24)."
Write-Line ""

# --- Start Vite in the background so we can supervise it -----------------
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
    # A cold Vite boot can take longer than three 30 s probes. Wait for the
    # first real 200 before supervising so a slow start is not mistaken for a
    # dead server.
    Write-Status "Waiting for Vite on https://localhost:5173..."
    if (Wait-ForOrigin) {
        Write-Status "Vite is serving."
    } else {
        Write-Status "Vite not ready after 180s - supervising anyway."
    }

    # Supervise Vite. Process existence is not enough: the origin must answer.
    $originUrl = "https://[::1]:5173/"
    $nextHealthProbeAt = Get-Date
    $originFailureCount = 0
    $originBusySince = $null
    while ($viteProc -and -not $viteProc.HasExited) {
        if (-not (Test-SupervisorAlive)) { break }
        if ((Get-Date) -ge $nextHealthProbeAt) {
            $originStatus = Get-HttpStatus $originUrl $true
            if ($originStatus -ne "200" -and (Test-SvelteKitGeneratedStateError $originUrl $true)) {
                throw "SvelteKit's generated root route proxy is unavailable. Exiting so pm2 can repair the generated state and restart the dev stack."
            } elseif ($originStatus -ne "200" -and (Test-VitePing $originUrl)) {
                $originFailureCount = 0
                if ($originStatus -eq "000") {
                    # An eight-second page probe can time out while browsers
                    # successfully render and load modules. A responsive Vite
                    # must not be recycled solely for exceeding that deadline.
                    $originBusySince = $null
                    Write-Status "Local Vite origin is busy: Vite answers, but the page probe timed out; preserving the live server."
                } else {
                    # Explicit SSR errors may be transient during warmup, but
                    # persistent failures still need a bounded recovery path.
                    if (-not $originBusySince) { $originBusySince = Get-Date }
                    $originBusySeconds = [int]((Get-Date) - $originBusySince).TotalSeconds
                    Write-Status "Local Vite origin is busy: Vite answers, but the page returned $originStatus (${originBusySeconds}s so far)."
                    if ($originBusySeconds -ge 300) {
                        throw "Local Vite origin answered pings but returned page errors for five minutes. Exiting so pm2 can restart the complete dev stack."
                    }
                }
            } elseif ($originStatus -ne "200") {
                $originFailureCount += 1
                Write-Status "Local Vite origin probe failed ($originFailureCount/3)."
                if ($originFailureCount -ge 3) {
                    throw "Local Vite origin remained unavailable across three probes. Exiting so pm2 can restart the complete dev stack."
                }
            } else {
                if ($originFailureCount -gt 0 -or $originBusySince) {
                    Write-Status "Local Vite origin recovered."
                }
                $originFailureCount = 0
                $originBusySince = $null
            }
            $nextHealthProbeAt = (Get-Date).AddSeconds(30)
        }
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Status "Shutting down..."
    if ($viteProc -and -not $viteProc.HasExited) {
        Stop-ProcessTree $viteProc.Id
    }
}
