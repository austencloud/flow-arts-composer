param(
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$PackageRoot = '',
    [ValidateSet('', 'gate', 'camp', 'fire', 'overview')][string]$Review = '',
    [string]$Capture = '',
    [ValidateRange(1, 300)][int]$CaptureFrames = 1,
    [ValidateRange(0, 300)][double]$CaptureStart = 25,
    [ValidateRange(0.033334, 5)][double]$CaptureInterval = 0.1,
    [string]$LogPath = '',
    [string]$Character = '',
    [string]$Prop = '',
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
    [switch]$Smoke
)

$ErrorActionPreference = 'Stop'
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
} else {
    if (-not (Test-Path -LiteralPath $editor)) { throw "Unreal Editor missing: $editor" }
    $executable = $editor
    $arguments = @($projectFile, '-game', '-windowed', '-ResX=1600', '-ResY=900', '-NoSplash')
}
if ($Review) { $arguments += "-FlowFestReview=$Review" }
if ($Character) { $arguments += "-FlowFestCharacter=$Character" }
if ($Prop) { $arguments += "-FlowFestProp=$Prop" }
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
if ($LogPath) {
    if (-not [System.IO.Path]::IsPathRooted($LogPath)) { throw '-LogPath requires an absolute path.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null
    $arguments += "-abslog=$LogPath"
}
if ($Offscreen) {
    if (-not $AutoExit) { throw '-Offscreen requires -AutoExit so an invisible game cannot be left running.' }
    $arguments += @('-RenderOffscreen', '-unattended')
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
    Write-Host 'Flow Fest run completed successfully.'
} else {
    Write-Host "Flow Fest running (PID $($gameProcess.Id))."
}
