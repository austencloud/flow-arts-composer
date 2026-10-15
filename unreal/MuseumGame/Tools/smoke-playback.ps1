param(
    [string]$ProjectFile = (Join-Path $PSScriptRoot '..\MuseumGame.uproject'),
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$Executable,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Screenshots([string[]]$Roots) {
    foreach ($root in $Roots | Select-Object -Unique) {
        if (Test-Path -LiteralPath $root -PathType Container) {
            Get-ChildItem -LiteralPath $root -Filter '*.png' -File -Recurse -ErrorAction Stop
        }
    }
}

$processIds = [System.Collections.Generic.HashSet[int]]::new()
$result = 1
try {
    if ($TimeoutSeconds -le 0) { throw 'TimeoutSeconds must be positive.' }
    $projectPath = (Resolve-Path -LiteralPath $ProjectFile).Path
    $projectDir = Split-Path -Parent $projectPath
    $packaged = -not [string]::IsNullOrWhiteSpace($Executable)
    if ($packaged) {
        $executablePath = (Resolve-Path -LiteralPath $Executable).Path
        # A package-root launcher creates another process. Launch its game binary directly.
        $launcherDir = Split-Path -Parent $executablePath
        $launcherName = [IO.Path]::GetFileNameWithoutExtension($executablePath)
        foreach ($binaryName in @("$launcherName-Win64-Shipping.exe", "$launcherName-Win64-Development.exe", "$launcherName.exe")) {
            $gameBinary = Join-Path $launcherDir "$launcherName\Binaries\Win64\$binaryName"
            if (Test-Path -LiteralPath $gameBinary -PathType Leaf) { $executablePath = $gameBinary; break }
        }
    } else {
        $executablePath = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
        if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
            throw "UnrealEditor-Cmd.exe not found: $executablePath"
        }
    }

    $logDir = Join-Path $projectDir 'Saved\Logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $runId = [guid]::NewGuid().ToString('N')
    $logPath = Join-Path $logDir "MuseumPlaybackSmoke-$runId.log"
    $screenshotRoots = @((Join-Path $projectDir 'Saved\Screenshots'))
    if ($packaged) {
        $binaryDir = Split-Path -Parent $executablePath
        $packageProjectDir = Split-Path -Parent (Split-Path -Parent $binaryDir)
        $screenshotRoots += (Join-Path $packageProjectDir 'Saved\Screenshots')
        $screenshotRoots += (Join-Path (Split-Path -Parent $packageProjectDir) 'Saved\Screenshots')
    }
    $priorScreenshots = @{}
    foreach ($shot in Get-Screenshots $screenshotRoots) {
        $priorScreenshots[$shot.FullName] = "$($shot.Length):$($shot.LastWriteTimeUtc.Ticks)"
    }

    $arguments = @()
    if (-not $packaged) {
        $arguments += ('"' + ($projectPath -replace '"', '\"') + '"')
        $arguments += '-game'
    }
    $arguments += @(
        '-RenderOffscreen', '-unattended', '-nosplash', '-nop4',
        '-MuseumPlaybackSmoke', '-MuseumStartX=502', '-MuseumStartY=32',
        '-MuseumStartYaw=90', '-MuseumShot', '-ResX=1280', '-ResY=720', '-windowed',
        ('-abslog="' + ($logPath -replace '"', '\"') + '"')
    )
    $startedAt = [DateTime]::UtcNow
    $owned = Start-Process -FilePath $executablePath -ArgumentList $arguments -PassThru -WindowStyle Hidden
    [void]$processIds.Add($owned.Id)
    Write-Host "Museum playback smoke PID $($owned.Id); log $logPath"
    $deadline = $startedAt.AddSeconds($TimeoutSeconds)
    $passed = $false
    $screenshot = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        # Keep track of children only if a supplied executable spawned them.
        if ($packaged) {
            foreach ($child in Get-CimInstance Win32_Process | Where-Object { $processIds.Contains([int]$_.ParentProcessId) }) {
                [void]$processIds.Add([int]$child.ProcessId)
            }
        }
        if (Test-Path -LiteralPath $logPath -PathType Leaf) {
            $lines = Get-Content -LiteralPath $logPath -ErrorAction Stop
            if ($lines -match 'MUSEUM_PLAYBACK_SMOKE FAIL:') {
                throw (($lines | Select-String 'MUSEUM_PLAYBACK_SMOKE FAIL:' | Select-Object -Last 1).Line)
            }
            $passed = [bool]($lines -match 'MUSEUM_PLAYBACK_SMOKE PASS:')
        }
        if (-not $screenshot) {
            foreach ($shot in Get-Screenshots $screenshotRoots) {
                $fingerprint = "$($shot.Length):$($shot.LastWriteTimeUtc.Ticks)"
                if ($shot.Length -gt 0 -and $shot.LastWriteTimeUtc -ge $startedAt.AddSeconds(-1) -and
                    (-not $priorScreenshots.ContainsKey($shot.FullName) -or $priorScreenshots[$shot.FullName] -ne $fingerprint)) {
                    $screenshot = $shot.FullName
                    break
                }
            }
        }
        if ($passed -and $screenshot) {
            Write-Host "MUSEUM_PLAYBACK_SMOKE PASS; screenshot $screenshot; log $logPath"
            $result = 0
            break
        }
        $running = @($processIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        if ($running.Count -eq 0) { throw 'Owned Unreal process exited before PASS and screenshot.' }
        Start-Sleep -Milliseconds 500
    }
    if ($result -ne 0) { throw "Timed out after $TimeoutSeconds seconds waiting for PASS and a fresh screenshot. Log: $logPath" }
} catch {
    Write-Host "MUSEUM_PLAYBACK_SMOKE FAIL: $($_.Exception.Message)"
} finally {
    foreach ($id in @($processIds) | Sort-Object -Descending) {
        $child = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($child) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    }
}
exit $result
