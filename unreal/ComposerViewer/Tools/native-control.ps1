param(
    [ValidateSet('Start', 'Stop', 'Status')]
    [string]$Action = 'Status',
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'FlowArtsComposer\ComposerViewer\Host'),
    [switch]$Stage
)

$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $PSCommandPath
$runtimeFull = [IO.Path]::GetFullPath($RuntimeRoot).TrimEnd('\')
$expectedBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FlowArtsComposer\ComposerViewer')).TrimEnd('\')
if (-not $runtimeFull.StartsWith($expectedBase + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "RuntimeRoot must be inside $expectedBase"
}
$projectFile = Join-Path $runtimeFull 'Project\ComposerViewer.uproject'
$pidFile = Join-Path $runtimeFull 'native-process.json'

function Get-OwnedProcess {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    if ($record.project -ne $projectFile) { throw 'Native PID record refers to another project.' }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
    if (-not $process) { return $null }
    if ($process.CommandLine -notlike "*$projectFile*") {
        throw "PID $($record.pid) no longer belongs to ComposerViewer; refusing to stop it."
    }
    return $process
}

if ($Action -eq 'Status') {
    $owned = Get-OwnedProcess
    if ($owned) { Write-Output "ComposerViewer native process running: PID $($owned.ProcessId), project $projectFile" }
    else { Write-Output 'ComposerViewer native process is stopped.' }
    return
}
if ($Action -eq 'Stop') {
    $owned = Get-OwnedProcess
    if ($owned) {
        Stop-Process -Id $owned.ProcessId
        Write-Output "Stopped ComposerViewer native PID $($owned.ProcessId)."
    } else { Write-Output 'ComposerViewer native process was already stopped.' }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
    return
}

$owned = Get-OwnedProcess
if ($owned) {
    Write-Output "ComposerViewer native process already running as PID $($owned.ProcessId)."
    return
}
$assetFiles = @(
    (Join-Path $runtimeFull 'Project\Content\Data\props.json'),
    (Join-Path $runtimeFull 'Project\Content\Data\PropMotion\ch01_P_staff_A.json'),
    (Join-Path $runtimeFull 'Project\Content\Data\PropMotion\ch01_P_fan_A.json')
)
$needsAssets = @($assetFiles | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }).Count -gt 0
if ($Stage -or -not (Test-Path -LiteralPath $projectFile) -or $needsAssets) {
    & (Join-Path $toolDir 'stage-runtime.ps1') -RuntimeRoot $runtimeFull
    if ($LASTEXITCODE -ge 8) { throw 'Runtime staging failed.' }
}
$engineExe = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor.exe'
if (-not (Test-Path -LiteralPath $engineExe)) { throw "UE 5.8 editor not found: $engineExe" }
if (-not (Test-Path -LiteralPath $projectFile)) { throw "Staged project not found: $projectFile" }
if (-not (Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort 18888 -ErrorAction SilentlyContinue)) {
    throw 'Composer signalling streamer port 18888 is not listening. Start signalling-control.ps1 first.'
}

$process = Start-Process -FilePath $engineExe -WorkingDirectory (Split-Path -Parent $projectFile) -ArgumentList @(
    '"' + $projectFile + '"',
    '-game',
    '-RenderOffScreen',
    '-PixelStreamingConnectionURL=ws://127.0.0.1:18888',
    '-PixelStreamingID=ComposerViewer'
) -WindowStyle Hidden -PassThru
@{
    pid = $process.Id
    project = $projectFile
    engine = $engineExe
    started = (Get-Date).ToString('o')
    streamer = 'ws://127.0.0.1:18888'
    unrealLog = (Join-Path $runtimeFull 'Project\Saved\Logs')
} | ConvertTo-Json | Set-Content -LiteralPath $pidFile
Write-Output "Started ComposerViewer native process PID $($process.Id)."
Write-Output "Unreal logs: $(Join-Path $runtimeFull 'Project\Saved\Logs')"
