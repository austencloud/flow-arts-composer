param(
    [string]$ProjectFile = (Join-Path $PSScriptRoot '..\MuseumGame.uproject'),
    [string]$Executable = '',
    [string]$MotionFile = '',
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [ValidateSet('Hero', 'Room', 'Reverse')][string]$View = 'Hero',
    [switch]$FireEffect,
    [int]$Width = 1600,
    [int]$Height = 900,
    [int]$WarmupSeconds = 12,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $ProjectFile).Path
$projectDir = Split-Path -Parent $projectPath
$reviewDir = Join-Path $projectDir 'Saved\ExhibitReview'
New-Item -ItemType Directory -Path $reviewDir -Force | Out-Null
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $reviewDir "$View-$runId.log"
$screenshotDir = Join-Path $reviewDir "$View-$runId"
New-Item -ItemType Directory -Path $screenshotDir | Out-Null

if ($Executable) {
    $binary = (Resolve-Path -LiteralPath $Executable).Path
    # Use the actual game binary so the owned process can be stopped exactly.
    $nested = Join-Path (Split-Path -Parent $binary) 'MuseumGame\Binaries\Win64\MuseumGame.exe'
    if (Test-Path -LiteralPath $nested) { $binary = $nested }
    $arguments = @()
} else {
    $binary = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
    $arguments = @('"' + $projectPath + '"')
    $arguments += '-game'
}

$screenshotRoots = @((Join-Path $projectDir 'Saved\Screenshots'))
if ($Executable) {
    $packageProjectDir = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $binary))
    $screenshotRoots += (Join-Path $packageProjectDir 'Saved\Screenshots')
}
$startedAt = [DateTime]::UtcNow

$camera = switch ($View) {
    'Hero' { @{ X=502; Y=43; Yaw=-90; Pitch=-5 } }
    'Room' { @{ X=495; Y=44; Yaw=0; Pitch=-4 } }
    'Reverse' { @{ X=514; Y=44; Yaw=90; Pitch=-5 } }
}
$arguments += @(
    '-RenderOffscreen', '-Multiprocess', '-unattended', '-nosplash', '-nop4', '-windowed', '-ForceRes',
    '-ini:Engine:[DevOptions.Shaders]:NumUnusedShaderCompilingThreads=30',
    '-ini:Engine:[DevOptions.Shaders]:PercentageUnusedShaderCompilingThreads=94',
    "-ResX=$Width", "-ResY=$Height", '-MuseumShot', "-MuseumShotDelay=$WarmupSeconds",
    "-MuseumStartX=$($camera.X)", "-MuseumStartY=$($camera.Y)",
    "-MuseumStartYaw=$($camera.Yaw)", "-MuseumStartPitch=$($camera.Pitch)", '-MuseumStartZ=150',
    ('-abslog="' + $logPath + '"')
)
if ($FireEffect) { $arguments += '-MuseumReviewFire' }
$motionPath = ''
$motionHash = ''
if ($MotionFile) {
    $motionPath = (Resolve-Path -LiteralPath $MotionFile).Path
    $motionHash = (Get-FileHash -LiteralPath $motionPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $arguments += '-MuseumComposerPreview', ('-MuseumMotionFile="' + $motionPath + '"')
}
$process = $null
try {
    $process = Start-Process -FilePath $binary -ArgumentList $arguments -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $shot = $null
    while ((Get-Date) -lt $deadline) {
        $shot = $screenshotRoots | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ } |
            ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter '*.png' -File -Recurse } |
            Where-Object { $_.Length -gt 0 -and $_.LastWriteTimeUtc -ge $startedAt } |
            Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        if ($shot) { break }
        if ($process.HasExited) { throw "Museum exited before its screenshot. See $logPath" }
        Start-Sleep -Milliseconds 500
    }
    if (-not $shot) { throw "No fresh native screenshot within $TimeoutSeconds seconds. See $logPath" }
    $capturePath = Join-Path $screenshotDir $shot.Name
    Copy-Item -LiteralPath $shot.FullName -Destination $capturePath
    Add-Type -AssemblyName System.Drawing
    $capturedImage = [Drawing.Image]::FromFile($capturePath)
    try {
        $actualWidth = $capturedImage.Width
        $actualHeight = $capturedImage.Height
    } finally { $capturedImage.Dispose() }
    if ($actualWidth -ne $Width -or $actualHeight -ne $Height) {
        throw "Capture is ${actualWidth}x${actualHeight}; requested ${Width}x${Height}. See $logPath"
    }
    $receipt = @{
        view=$View; fireEffect=[bool]$FireEffect; executable=$binary; project=$projectPath; camera=$camera
        width=$Width; height=$Height; warmupSeconds=$WarmupSeconds
        screenshot=$capturePath; log=$logPath; processId=$process.Id
        motionFile=$motionPath; motionSHA256=$motionHash
        status='Captured; visual inspection required'
    }
    $receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reviewDir "$View-$runId.json")
    Write-Output "MUSEUM_EXHIBIT_CAPTURE $capturePath"
    Write-Output "MUSEUM_EXHIBIT_LOG $logPath"
} finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
