param(
    [string]$ProjectFile = (Join-Path $PSScriptRoot '..\MuseumGame.uproject'),
    [string]$Executable = '',
    [string]$MotionFile = '',
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8'
)

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $ProjectFile).Path
$projectDir = Split-Path -Parent $projectPath
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'Content\Data\runtime-rigs.json'))) {
    throw 'This Museum needs its shared runtime rig catalog. Stage the current shared assets first.'
}
$arguments = @()
if ($Executable) {
    $binary = (Resolve-Path -LiteralPath $Executable).Path
    $nested = Join-Path (Split-Path -Parent $binary) 'MuseumGame\Binaries\Win64\MuseumGame.exe'
    if (Test-Path -LiteralPath $nested) { $binary = $nested }
} else {
    $binary = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor.exe'
    if (-not (Test-Path -LiteralPath $binary)) { throw "Missing native editor: $binary" }
    $arguments += ('"' + $projectPath + '"'), '-game'
}
$arguments += '-MuseumComposerPreview', '-MuseumStartX=502', '-MuseumStartY=39',
    '-MuseumStartYaw=-90', '-MuseumStartPitch=-5', '-MuseumStartZ=150', '-windowed',
    '-ResX=1440', '-ResY=900', '-nosplash'
if ($MotionFile) {
    $motionPath = (Resolve-Path -LiteralPath $MotionFile).Path
    $arguments += ('-MuseumMotionFile="' + $motionPath + '"')
}
$process = Start-Process -FilePath $binary -ArgumentList $arguments -PassThru
Write-Output "Museum Composer preview PID $($process.Id). Press F6 at the performer to load another .motion.json; the game stays running."
