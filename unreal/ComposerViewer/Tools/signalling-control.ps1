param(
    [ValidateSet('Start', 'Stop', 'Status')]
    [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $PSCommandPath
$runtimeDir = Join-Path $env:LOCALAPPDATA 'FlowArtsComposer\ComposerViewer'
$signallingRuntime = Join-Path $runtimeDir 'Signalling'
$scriptPath = Join-Path $signallingRuntime 'signalling.mjs'
$pidFile = Join-Path $runtimeDir 'signalling-process.json'
$outLog = Join-Path $runtimeDir 'signalling-out.log'
$errLog = Join-Path $runtimeDir 'signalling-error.log'
$lockMarker = Join-Path $signallingRuntime 'installed-lock.sha256'

function Get-OwnedProcess {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    if ($record.script -ne $scriptPath) {
        throw "Signalling PID record belongs to another script: $($record.script)"
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
    if (-not $process) { return $null }
    if ($process.CommandLine -notlike "*$scriptPath*") {
        throw "PID $($record.pid) no longer belongs to Composer signalling; refusing to stop it."
    }
    return $process
}

function Test-ListeningPort([int]$port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $port -ErrorAction SilentlyContinue)
}

if ($Action -eq 'Status') {
    $owned = Get-OwnedProcess
    if ($owned) {
        Write-Output "Running PID $($owned.ProcessId); streamer 127.0.0.1:18888; player 127.0.0.1:18889"
        Write-Output "Runtime: $scriptPath"
        Write-Output "Logs: $outLog ; $errLog"
    } else {
        Write-Output 'Composer signalling is stopped.'
    }
    return
}

if ($Action -eq 'Stop') {
    $owned = Get-OwnedProcess
    if ($owned) {
        Stop-Process -Id $owned.ProcessId
        Write-Output "Stopped Composer signalling PID $($owned.ProcessId)."
    } else {
        Write-Output 'Composer signalling was already stopped.'
    }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
    return
}

$owned = Get-OwnedProcess
if ($owned) {
    Write-Output "Composer signalling already running as PID $($owned.ProcessId)."
    return
}
if ((Test-ListeningPort 18888) -or (Test-ListeningPort 18889)) {
    throw 'Port 18888 or 18889 is already in use; refusing to start another signalling server.'
}
New-Item -ItemType Directory -Path $signallingRuntime -Force | Out-Null
foreach ($file in @('signalling.mjs', 'package.json', 'package-lock.json')) {
    Copy-Item -LiteralPath (Join-Path $toolDir $file) -Destination (Join-Path $signallingRuntime $file) -Force
}
$lockHash = (Get-FileHash -LiteralPath (Join-Path $signallingRuntime 'package-lock.json') -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $lockMarker) { (Get-Content -LiteralPath $lockMarker -Raw).Trim() } else { '' }
if ($installedHash -ne $lockHash -or -not (Test-Path -LiteralPath (Join-Path $signallingRuntime 'node_modules\@epicgames-ps\lib-pixelstreamingsignalling-ue5.8'))) {
    Push-Location $signallingRuntime
    try {
        & npm ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
    Set-Content -LiteralPath $lockMarker -Value $lockHash
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $scriptPath + '"') -WorkingDirectory $signallingRuntime -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
@{
    pid = $process.Id
    script = $scriptPath
    runtime = $signallingRuntime
    started = (Get-Date).ToString('o')
    streamerPort = 18888
    playerPort = 18889
    outLog = $outLog
    errLog = $errLog
} | ConvertTo-Json | Set-Content -LiteralPath $pidFile
for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($process.HasExited) {
        throw "Signalling exited early (code $($process.ExitCode)). See $errLog"
    }
    if ((Test-ListeningPort 18888) -and (Test-ListeningPort 18889)) {
        Write-Output "Composer signalling ready: PID $($process.Id), streamer 127.0.0.1:18888, player 127.0.0.1:18889"
        Write-Output "Runtime: $scriptPath"
        Write-Output "Logs: $outLog ; $errLog"
        return
    }
    Start-Sleep -Milliseconds 200
}
throw "Signalling did not listen on both loopback ports. See $errLog"
