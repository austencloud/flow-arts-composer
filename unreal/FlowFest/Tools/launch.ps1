param(
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$PackageRoot = '',
    [ValidateSet('', 'gate', 'camp', 'fire', 'overview')][string]$Review = '',
    [string]$Capture = '',
    [string]$LogPath = '',
    [string]$Character = '',
    [string]$Prop = '',
    [ValidateSet('', 'flow', 'ride', 'walk', 'jump')][string]$Showcase = '',
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
if ($PSBoundParameters.ContainsKey('Hour')) {
    if (-not $Review -and -not $Showcase) { throw '-Hour requires a review location or character showcase.' }
    $arguments += '-FlowFestHour=' + $Hour.ToString([Globalization.CultureInfo]::InvariantCulture)
}
if ($Wardrobe) { $arguments += '-FlowFestWardrobe' }
if ($Capture) { $arguments += "-FlowFestCapture=$Capture" }
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
    if ($Capture -and ((-not (Test-Path -LiteralPath $Capture)) -or (Get-Item -LiteralPath $Capture).LastWriteTimeUtc -lt $launchStarted)) {
        throw "Flow Fest did not produce a new capture: $Capture"
    }
    if ($LogPath -and (Test-Path -LiteralPath $LogPath -PathType Leaf) -and
        (Select-String -LiteralPath $LogPath -SimpleMatch 'Failed to compile Material' -Quiet)) {
        throw "Flow Fest rendered with failed material shaders. See $LogPath"
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
