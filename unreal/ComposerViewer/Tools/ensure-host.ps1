# Called only by the local dev viewer. Reuses the installed, staged runtime.
$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $PSCommandPath
$runtimeDir = Join-Path $env:LOCALAPPDATA 'FlowArtsComposer\ComposerViewer'
$stateFile = Join-Path $runtimeDir 'recovery-state.json'
$mutex = [Threading.Mutex]::new($false, 'Local\FlowArtsComposer.ComposerViewer.Recovery')
$acquired = $false

function Reply([string]$status, [string]$message) {
    @{ status = $status; message = $message } | ConvertTo-Json -Compress
}

try {
    try { $acquired = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        Reply 'starting' 'The local Unreal host is starting.'
        return
    }

    & (Join-Path $toolDir 'signalling-control.ps1') Start -NoSetup -Recover | Out-Null
    $health = Invoke-RestMethod 'http://127.0.0.1:18889/health' -TimeoutSec 2
    if ($health.service -ne 'composer-viewer') { throw 'Unexpected service on the local signalling port.' }
    if ($health.streamerReady) {
        if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
        Reply 'ready' 'The local Unreal host is ready.'
        return
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $state = @{ waitingSince = $now; lastStart = 0; attempts = 0; observedPid = 0 }
    if (Test-Path -LiteralPath $stateFile) {
        $saved = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        foreach ($key in @('waitingSince', 'lastStart', 'attempts', 'observedPid')) { $state[$key] = [long]$saved.$key }
    }
    $owned = & (Join-Path $toolDir 'native-control.ps1') Status -PassThru
    if ($owned -and $state.observedPid -ne $owned.ProcessId) {
        # A manual restart or another recovered launch gets its own loading grace.
        $state.observedPid = $owned.ProcessId
        $state.waitingSince = $now
    }
    # Give cold loading and shader setup time. A live PID alone is not readiness.
    if ($owned -and ($now - $state.waitingSince) -ge 300) {
        & (Join-Path $toolDir 'native-control.ps1') Stop | Out-Null
        $owned = $null
    }
    if (-not $owned) {
        # Bound repeated native crashes: 10, 20, 40, ... up to 120 seconds.
        $cooldown = [Math]::Min(120, 10 * [Math]::Pow(2, [Math]::Min(4, $state.attempts)))
        if (($now - $state.lastStart) -ge $cooldown) {
            $state.lastStart = $now
            $state.waitingSince = $now
            $state.attempts++
            $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
            & (Join-Path $toolDir 'native-control.ps1') Start -NoSetup | Out-Null
        }
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
    Reply 'starting' 'Starting the local Unreal performer. This can take a moment.'
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    Reply 'unavailable' 'The local Unreal host could not start. Retrying automatically.'
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
