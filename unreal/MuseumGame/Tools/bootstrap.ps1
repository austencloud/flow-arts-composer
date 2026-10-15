param(
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$CompilerVersion = '',
    [switch]$SkipExport,
    [switch]$SkipBuild,
    [switch]$SkipAssets
)

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $project '..\..')).Path
$file = Join-Path $project 'MuseumGame.uproject'
$build = Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat'
$editor = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
foreach ($path in @($file, $build, $editor)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing prerequisite: $path" }
}
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules'))) {
    throw "Repository dependencies are missing: $repo\node_modules"
}
if (-not $SkipExport) {
    Push-Location $repo
    try {
        & node (Join-Path $PSScriptRoot 'build-export.mjs')
        if ($LASTEXITCODE -ne 0) { throw "Museum export failed ($LASTEXITCODE)" }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $project 'Content\Data\museum.json'))) {
    throw 'Museum layout is missing; export it before building.'
}
if (-not $SkipBuild) {
    $args = @('MuseumGameEditor', 'Win64', 'Development', "-Project=$file", '-WaitMutex', '-NoHotReloadFromIDE', '-MaxParallelActions=4', '-NoUBA')
    if ($CompilerVersion) { $args += "-CompilerVersion=$CompilerVersion" }
    & $build @args
    if ($LASTEXITCODE -ne 0) { throw "Museum C++ editor build failed ($LASTEXITCODE)" }
}
if (-not $SkipAssets) {
    & $editor $file '-run=pythonscript' "-script=$(Join-Path $PSScriptRoot 'create-project-assets.py')" -unattended -nop4 -nosplash -RenderOffscreen
    if ($LASTEXITCODE -ne 0) { throw "Museum asset creation failed ($LASTEXITCODE)" }
}
Write-Host "MUSEUM_BOOTSTRAP_OK $file"
