param(
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$PackageRoot = '',
    [ValidateSet('', 'gate', 'camp', 'fire', 'overview', 'woods', 'upper', 'jam-entrance', 'jam-stage', 'jam-outside', 'jam-club')][string]$Review = '',
    [switch]$Explore,
    [switch]$Library,
    [string]$Capture = '',
    [ValidateRange(1, 300)][int]$CaptureFrames = 1,
    [ValidateRange(0, 300)][double]$CaptureStart = 25,
    [ValidateRange(0.033334, 5)][double]$CaptureInterval = 0.1,
    [string]$LogPath = '',
    [string]$Character = '',
    [string]$Prop = '',
    [string]$Motion = '',
    [double]$MotionTime = -1,
    [switch]$PoseEvidence,
    [switch]$PoseParity,
    [switch]$BypassArmClearance,
    [switch]$ClearanceStats,
    [ValidateSet('', 'carry', 'eat', 'sit')][string]$Activity = '',
    [double]$ActivityTime = 2,
    [double]$ActivityExit = -1,
    [switch]$ActivityPlayback,
    [ValidateSet('', 'flow', 'idle', 'ride', 'walk', 'jump')][string]$Showcase = '',
    [ValidateRange(80, 1000)][double]$CameraDistance = 350,
    [double]$CameraYaw = 145,
    [ValidateRange(-80, 80)][double]$CameraPitch = -6,
    [ValidateRange(-100, 100)][double]$CameraHeight = 0,
    [ValidateRange(-50, 50)][double]$ShowcaseEast = 0,
    [ValidateRange(-50, 50)][double]$ShowcaseSouth = 0,
    [ValidateRange(0, 300)][double]$FlowStopAt = 0,
    [ValidateRange(0, 24)][double]$Hour = 17,
    [switch]$Wardrobe,
    [switch]$Offscreen,
    [switch]$AutoExit,
    [switch]$Smoke,
    # Jam polish: the "Dusk at Middle Earth" slice; -Watch records it to Saved/Polish/Jam.
    [switch]$Jam,
    [switch]$Watch,
    [ValidateRange(5, 1800)][double]$NightSeconds = 240,
    # Phrase stage: two staff spinners play the phrase schedule; -Watch records ~20 s and two stills
    # to Saved/PhraseStageProof, -StageSeconds quits after that many seconds (for stat unit runs).
    [switch]$PhraseStage,
    [ValidateRange(0, 600)][double]$StageSeconds = 0,
    [ValidateRange(0, 4096)][double]$StartBeat = 0,
    # body response (2026-10-23): planted phrases read the planner's .body.json sidecars (off by default).
    [switch]$BodyResponse
)

$ErrorActionPreference = 'Stop'
if ($BypassArmClearance -and (-not $PoseParity -or -not $PoseEvidence -or -not $Showcase)) {
    throw '-BypassArmClearance is a development diagnostic and requires -PoseParity, -PoseEvidence, and -Showcase.'
}
# Jam polish: the slice owns the camera and the clock, so it runs alone.
if ($Watch -and -not ($Jam -or $PhraseStage)) { throw '-Watch requires -Jam or -PhraseStage.' }
# Phrase stage: the stage owns its camera and clock too.
if ($PhraseStage -and ($Jam -or $Review -or $Explore -or $Showcase -or $Wardrobe -or $Smoke -or $Capture -or $Activity -or $Motion)) {
    throw '-PhraseStage runs the stage alone; it cannot combine with the jam, review, explore, showcase, wardrobe, smoke, capture, activity, or motion runs.'
}
if (($StageSeconds -gt 0 -or $PSBoundParameters.ContainsKey('StartBeat') -or $BodyResponse) -and -not $PhraseStage) { throw '-StageSeconds, -StartBeat and -BodyResponse require -PhraseStage.' }
if ($Jam -and ($Review -or $Explore -or $Showcase -or $Wardrobe -or $Smoke -or $Capture -or $Activity -or $Motion)) {
    throw '-Jam runs the slice alone; it cannot combine with review, explore, showcase, wardrobe, smoke, capture, activity, or motion runs.'
}
if ($Library -and -not $Explore) { throw '-Library requires -Explore to open the performance library on foot.' }
if ($Explore) {
    if ($Showcase -or $Wardrobe -or $Smoke) { throw '-Explore cannot combine with showcase, wardrobe, or smoke runs.' }
    if (-not $Review) { $Review = 'fire' }
    if ($Review -eq 'overview') { throw '-Explore requires a ground location: gate, camp, or fire.' }
}
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectFile = Join-Path $projectRoot 'FlowFest.uproject'
$editor = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor.exe'
if (-not (Test-Path -LiteralPath $projectFile)) { throw "Project missing: $projectFile" }
if ($Capture) {
    if (-not [System.IO.Path]::IsPathRooted($Capture) -or [System.IO.Path]::GetExtension($Capture) -ne '.png') {
        throw '-Capture requires an absolute .png path.'
    }
    $captureParent = Split-Path -Parent $Capture
    if (-not (Test-Path -LiteralPath $captureParent)) { New-Item -ItemType Directory -Path $captureParent -Force | Out-Null }
}

if ($PackageRoot) {
    $packagePath = (Resolve-Path -LiteralPath $PackageRoot).Path
    $gameExe = Join-Path $packagePath 'FlowFest.exe'
    $paks = Join-Path $packagePath 'FlowFest\Content\Paks'
    if (-not (Test-Path -LiteralPath $gameExe) -or -not (Test-Path -LiteralPath $paks)) {
        throw "-PackageRoot must contain FlowFest.exe and FlowFest/Content/Paks: $packagePath"
    }
    # The root executable is a UAT bootstrapper; wait on the actual game process.
    $binaryDir = Join-Path $packagePath 'FlowFest\Binaries\Win64'
    $gameBinaries = @(Get-ChildItem -LiteralPath $binaryDir -Filter 'FlowFest*.exe' -File -ErrorAction SilentlyContinue)
    if ($gameBinaries.Count -ne 1) {
        throw "Expected one packaged FlowFest game binary in $binaryDir; found $($gameBinaries.Count)."
    }
    $executable = $gameBinaries[0].FullName
    $arguments = @('-windowed', '-ResX=1600', '-ResY=900', '-NoSplash')
    if ($PhraseStage) { $arguments = @('/Engine/Maps/Entry') + $arguments }
} else {
    if (-not (Test-Path -LiteralPath $editor)) { throw "Unreal Editor missing: $editor" }
    $executable = $editor
    $arguments = @($projectFile, '-game', '-windowed', '-ResX=1600', '-ResY=900', '-NoSplash')
    # Phrase stage: an empty engine map; the game mode builds the stage instead of the festival.
    if ($PhraseStage) { $arguments = @($projectFile, '/Engine/Maps/Entry') + $arguments[1..($arguments.Count - 1)] }
}
if ($Review) { $arguments += "-FlowFestReview=$Review" }
# Jam polish: -Jam plays the slice; -Watch keeps the camera and records 40 s at 1920x1080.
$jamDir = Join-Path $projectRoot 'Saved\Polish\Jam'
$jamFrames = Join-Path $jamDir 'WatchFrames'
if ($Jam) {
    $arguments += '-FlowFestJam'
    if ($Watch -and -not $PSBoundParameters.ContainsKey('NightSeconds')) { $NightSeconds = 30 }
    $arguments += '-FlowFestJamNightSeconds=' + $NightSeconds.ToString([Globalization.CultureInfo]::InvariantCulture)
}
$stageDir = Join-Path $projectRoot 'Saved\PhraseStageProof'
$stageFrames = Join-Path $stageDir 'WatchFrames'
if ($PhraseStage) {
    $arguments += '-FlowFestPhraseStage'
    if ($PSBoundParameters.ContainsKey('StartBeat')) { $arguments += '-FlowFestPhraseStageStartBeat=' + $StartBeat.ToString([Globalization.CultureInfo]::InvariantCulture) }
    if ($StageSeconds -gt 0) { $arguments += '-FlowFestPhraseStageExitAfter=' + $StageSeconds.ToString([Globalization.CultureInfo]::InvariantCulture) }
    if ($BodyResponse) { $arguments += '-BodyResponse' } # body response (2026-10-23)
}
if ($Watch -and $PhraseStage) {
    $arguments = @($arguments | ForEach-Object { if ($_ -eq '-ResX=1600') { '-ResX=1920' } elseif ($_ -eq '-ResY=900') { '-ResY=1080' } else { $_ } })
    if (Test-Path -LiteralPath $stageFrames) { Remove-Item -LiteralPath $stageFrames -Recurse -Force }
    New-Item -ItemType Directory -Path $stageFrames -Force | Out-Null
    $arguments += @("-FlowFestPhraseStageRecord=$stageFrames", '-FlowFestPhraseStageRecordSeconds=20')
} elseif ($Watch) {
    $arguments = @($arguments | ForEach-Object { if ($_ -eq '-ResX=1600') { '-ResX=1920' } elseif ($_ -eq '-ResY=900') { '-ResY=1080' } else { $_ } })
    if (Test-Path -LiteralPath $jamFrames) { Remove-Item -LiteralPath $jamFrames -Recurse -Force }
    New-Item -ItemType Directory -Path $jamFrames -Force | Out-Null
    $arguments += @('-FlowFestJamWatch', "-FlowFestJamRecord=$jamFrames", '-FlowFestJamRecordSeconds=40', '-FlowFestJamExit')
}
if ($Explore) { $arguments += '-FlowFestExplore' }
if ($Library) { $arguments += '-FlowFestLibrary' }
if ($Character) { $arguments += "-FlowFestCharacter=$Character" }
if ($Prop) { $arguments += "-FlowFestProp=$Prop" }
if ($Motion) { $arguments += "-FlowFestMotion=$((Resolve-Path -LiteralPath $Motion).Path)" }
if ($MotionTime -ge 0) { $arguments += '-FlowFestMotionTime=' + $MotionTime.ToString([Globalization.CultureInfo]::InvariantCulture) }
if ($PoseEvidence) { $arguments += '-FlowFestPoseEvidence' }
if ($PoseParity) { $arguments += '-FlowFestPoseParity' }
if ($BypassArmClearance) { $arguments += '-FlowFestRenderBypassClearance' }
if ($ClearanceStats) { $arguments += '-FlowFestClearanceStats' }
if ($Activity) {
    $arguments += "-FlowFestActivity=$Activity"
    $arguments += '-FlowFestActivityTime=' + $ActivityTime.ToString([Globalization.CultureInfo]::InvariantCulture)
    $arguments += '-FlowFestActivityExit=' + $ActivityExit.ToString([Globalization.CultureInfo]::InvariantCulture)
}
if ($ActivityPlayback) {
    if (-not $Activity) { throw '-ActivityPlayback requires -Activity.' }
    $arguments += '-FlowFestActivityPlayback'
}
if ($Showcase) { $arguments += "-FlowFestShowcase=$Showcase" }
foreach ($cameraOption in @('CameraDistance', 'CameraYaw', 'CameraPitch', 'CameraHeight', 'ShowcaseEast', 'ShowcaseSouth', 'FlowStopAt')) {
    if ($PSBoundParameters.ContainsKey($cameraOption)) {
        if (-not $Showcase) { throw "-$cameraOption requires -Showcase." }
        $optionValue = Get-Variable -Name $cameraOption -ValueOnly
        $arguments += '-FlowFest' + $cameraOption + '=' + $optionValue.ToString([Globalization.CultureInfo]::InvariantCulture)
    }
}
if ($PSBoundParameters.ContainsKey('Hour')) {
    if (-not $Review -and -not $Showcase) { throw '-Hour requires a review location or character showcase.' }
    $arguments += '-FlowFestHour=' + $Hour.ToString([Globalization.CultureInfo]::InvariantCulture)
}
if ($Wardrobe) { $arguments += '-FlowFestWardrobe' }
if ($Capture) {
    $arguments += "-FlowFestCapture=$Capture"
    $arguments += "-FlowFestCaptureFrames=$CaptureFrames"
    $arguments += '-FlowFestCaptureStart=' + $CaptureStart.ToString([Globalization.CultureInfo]::InvariantCulture)
    $arguments += '-FlowFestCaptureInterval=' + $CaptureInterval.ToString([Globalization.CultureInfo]::InvariantCulture)
} elseif ($CaptureFrames -gt 1 -or $PSBoundParameters.ContainsKey('CaptureStart') -or $PSBoundParameters.ContainsKey('CaptureInterval')) {
    throw 'Capture timing requires -Capture with an absolute .png path.'
}
if ($AutoExit) { $arguments += '-FlowFestAutoExit' }
if ($Smoke) { $arguments += '-FlowFestSmoke' }
if ($AutoExit -and $Smoke -and -not $LogPath) { throw '-AutoExit -Smoke requires -LogPath to verify a fresh PASS record.' }
if ($AutoExit -and $Motion -and -not $LogPath) { throw '-AutoExit -Motion requires -LogPath to verify that the requested motion loaded.' }
if ($LogPath) {
    if (-not [System.IO.Path]::IsPathRooted($LogPath)) { throw '-LogPath requires an absolute path.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null
    $arguments += "-abslog=$LogPath"
}
if ($Offscreen) {
    if (-not $AutoExit) { throw '-Offscreen requires -AutoExit so an invisible game cannot be left running.' }
    $arguments += @('-RenderOffscreen', '-unattended', '-Multiprocess')
}
# Start-Process joins ArgumentList, so quote each argument containing whitespace.
$quotedArguments = $arguments | ForEach-Object {
    if ($_ -match '"') { throw 'Double quotes are not supported inside launch arguments.' }
    if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
}
$launchStarted = [DateTime]::UtcNow
$startOptions = @{ FilePath = $executable; ArgumentList = $quotedArguments; PassThru = $true }
if ($PackageRoot) { $startOptions.WorkingDirectory = $packagePath }
if ($Offscreen) { $startOptions.WindowStyle = 'Hidden' }
$gameProcess = Start-Process @startOptions
if ($AutoExit) {
    $gameProcess.WaitForExit()
    $gameProcess.Refresh()
    if ($gameProcess.ExitCode -ne 0) { throw "Flow Fest exited with code $($gameProcess.ExitCode). See $LogPath" }
    if ($Capture) {
        for ($frame = 0; $frame -lt $CaptureFrames; $frame++) {
            $framePath = if ($frame -eq 0) { $Capture } else {
                Join-Path (Split-Path -Parent $Capture) ('{0}-{1:D3}.png' -f [IO.Path]::GetFileNameWithoutExtension($Capture), $frame)
            }
            if ((-not (Test-Path -LiteralPath $framePath)) -or (Get-Item -LiteralPath $framePath).LastWriteTimeUtc -lt $launchStarted) {
                throw "Flow Fest did not produce a new capture: $framePath"
            }
        }
    }
    if ($LogPath -and (Test-Path -LiteralPath $LogPath -PathType Leaf) -and
        (Select-String -LiteralPath $LogPath -Pattern 'Failed to compile Material|LogTemp: Error:' -Quiet)) {
        throw "Flow Fest reported a native asset/runtime error or failed material shader. See $LogPath"
    }
    if ($Smoke -and ((-not (Test-Path -LiteralPath $LogPath -PathType Leaf)) -or
        (Get-Item -LiteralPath $LogPath).LastWriteTimeUtc -lt $launchStarted -or
        -not (Select-String -LiteralPath $LogPath -SimpleMatch 'FlowFestSmoke PASS' -Quiet))) {
        throw "Flow Fest did not report a successful smoke test: $LogPath"
    }
    if ($Motion -and ((-not (Test-Path -LiteralPath $LogPath -PathType Leaf)) -or
        (Get-Item -LiteralPath $LogPath).LastWriteTimeUtc -lt $launchStarted -or
        -not (Select-String -LiteralPath $LogPath -SimpleMatch 'FlowFestRuntimeMotion PASS' -Quiet))) {
        throw "Flow Fest did not load the requested runtime motion: $LogPath"
    }
    Write-Host 'Flow Fest run completed successfully.'
} elseif ($Watch -and $PhraseStage) {
    # Phrase stage: encode the 20 s at 30 fps and keep a still per plane. The stage names in
    # stills.txt the first frame where a spinner has stood in a captured routine of each plane for two beats.
    $gameProcess.WaitForExit()
    $frames = @(Get-ChildItem -LiteralPath $stageFrames -Filter 'frame-*.png' -File | Sort-Object Name)
    if ($frames.Count -eq 0) { throw "The phrase stage recorded no frames. See the log in $stageDir" }
    $stillList = Join-Path $stageFrames 'stills.txt'
    if (Test-Path -LiteralPath $stillList) {
        foreach ($line in Get-Content -LiteralPath $stillList) {
            $plane, $frame, $performer = $line -split ' '
            $source = Join-Path $stageFrames ('frame-{0}.png' -f $frame)
            if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $stageDir "phrase-stage-$plane.png") -Force }
            Write-Host "Phrase stage still: $plane from frame $frame ($performer)"
        }
    }
    $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
    if (-not $ffmpeg) {
        $ffmpeg = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter ffmpeg.exe -Recurse -File -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $ffmpeg) { throw "ffmpeg not found; the frames are in $stageFrames" }
    $video = Join-Path $stageDir 'phrase-stage.mp4'
    & $ffmpeg -y -loglevel error -framerate 30 -i (Join-Path $stageFrames 'frame-%04d.png') -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p $video
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed to encode $video" }
    Remove-Item -LiteralPath $stageFrames -Recurse -Force
    Write-Host "Phrase stage watch: $($frames.Count) frames encoded to $video"
} elseif ($Watch) {
    # Jam polish: encode the recorded frames, or keep eight stills when ffmpeg is missing.
    $gameProcess.WaitForExit()
    $frames = @(Get-ChildItem -LiteralPath $jamFrames -Filter 'frame-*.png' -File | Sort-Object Name)
    if ($frames.Count -eq 0) { throw "The jam watch recorded no frames. See the log in $jamDir" }
    $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
    if (-not $ffmpeg) {
        $ffmpeg = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter ffmpeg.exe -Recurse -File -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if ($ffmpeg) {
        $video = Join-Path $jamDir 'jam-watch.mp4'
        & $ffmpeg -y -loglevel error -framerate 30 -i (Join-Path $jamFrames 'frame-%04d.png') -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p $video
        if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed to encode $video" }
        Write-Host "Jam watch: $($frames.Count) frames encoded to $video"
    } else {
        for ($i = 0; $i -lt 8; $i++) {
            $frame = $frames[[int][Math]::Floor($i * ($frames.Count - 1) / 7)]
            Copy-Item -LiteralPath $frame.FullName -Destination (Join-Path $jamDir ('jam-watch-{0}.png' -f ($i + 1))) -Force
        }
        Write-Host "Jam watch: ffmpeg not found; eight stills written to $jamDir"
    }
    $loading = Join-Path $jamFrames 'loading.png'
    if (Test-Path -LiteralPath $loading) { Copy-Item -LiteralPath $loading -Destination (Join-Path $jamDir 'jam-loading.png') -Force }
    Remove-Item -LiteralPath $jamFrames -Recurse -Force
} else {
    Write-Host "Flow Fest running (PID $($gameProcess.Id))."
}
