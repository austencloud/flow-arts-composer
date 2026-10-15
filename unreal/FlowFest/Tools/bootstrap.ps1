param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$BlenderExe = 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe',
    [string]$CompilerVersion = '',
    [string]$CaptureDirectory = '',
    [switch]$SkipAssetGeneration,
    [switch]$SkipBuild,
    [switch]$SkipImport
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot = (Resolve-Path (Join-Path $projectRoot '..\..')).Path
$sourceRootPath = (Resolve-Path -LiteralPath $SourceRoot).Path
$projectFile = Join-Path $projectRoot 'FlowFest.uproject'
$engineBuild = Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat'
$editorCmd = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$pythonExe = Join-Path $EngineRoot 'Engine\Binaries\ThirdParty\Python3\Win64\python.exe'
$sourceModules = Join-Path $sourceRootPath 'node_modules'
$localModules = Join-Path $repoRoot 'node_modules'

foreach ($required in @($projectFile, $engineBuild, $editorCmd, $sourceModules)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing required path: $required" }
}
if (-not (Test-Path -LiteralPath $localModules)) {
    # ESM resolves dependencies from the script's worktree, not the calling cwd.
    New-Item -ItemType Junction -Path $localModules -Target $sourceModules | Out-Null
}
$tsx = Join-Path $localModules '.bin\tsx.cmd'
if (-not (Test-Path -LiteralPath $tsx)) { throw "tsx is missing from $sourceModules" }

if (-not $SkipAssetGeneration) {
    if (-not $CaptureDirectory) { $CaptureDirectory = Join-Path $projectRoot 'Saved\PerformanceCaptures' }
    if (-not (Test-Path -LiteralPath $CaptureDirectory)) {
        throw 'Production performance captures are required. Run Tools/capture-performances.mjs against the native export harness first, then pass -CaptureDirectory. See README.md.'
    }
    if (-not (Test-Path -LiteralPath $BlenderExe)) { throw "Blender executable missing: $BlenderExe" }
    & $tsx (Join-Path $PSScriptRoot 'export-site.ts') --source-root $sourceRootPath
    if ($LASTEXITCODE -ne 0) { throw "Site export failed ($LASTEXITCODE)" }
    & node (Join-Path $PSScriptRoot 'prepare-assets.mjs') $sourceRootPath
    if ($LASTEXITCODE -ne 0) { throw "Asset preparation failed ($LASTEXITCODE)" }
    & $pythonExe (Join-Path $PSScriptRoot 'prepare-audio.py')
    if ($LASTEXITCODE -ne 0) { throw "Ambient sound preparation failed ($LASTEXITCODE)" }
    & $BlenderExe --factory-startup --background --threads 2 --python (Join-Path $PSScriptRoot 'author-assets.py')
    if ($LASTEXITCODE -ne 0) { throw "Blender asset authoring failed ($LASTEXITCODE)" }
    & node (Join-Path $PSScriptRoot 'prepare-characters.mjs') $sourceRootPath --captures $CaptureDirectory
    if ($LASTEXITCODE -ne 0) { throw "Character preparation failed ($LASTEXITCODE)" }
    & $BlenderExe --factory-startup --background --threads 2 --python (Join-Path $PSScriptRoot 'convert-characters.py')
    if ($LASTEXITCODE -ne 0) { throw "Character conversion failed ($LASTEXITCODE)" }
    & node (Join-Path $PSScriptRoot 'prepare-prop-motion.mjs') $CaptureDirectory
    if ($LASTEXITCODE -ne 0) { throw "Prop motion preparation failed ($LASTEXITCODE)" }
    & node (Join-Path $PSScriptRoot 'prepare-props.mjs') $sourceRootPath
    if ($LASTEXITCODE -ne 0) { throw "Prop preparation failed ($LASTEXITCODE)" }
    & $BlenderExe --factory-startup --background --threads 2 --python (Join-Path $PSScriptRoot 'convert-props.py')
    if ($LASTEXITCODE -ne 0) { throw "Prop conversion failed ($LASTEXITCODE)" }
    & $BlenderExe --factory-startup --background --threads 2 --python (Join-Path $PSScriptRoot 'convert-euc.py')
    if ($LASTEXITCODE -ne 0) { throw "EUC conversion failed ($LASTEXITCODE)" }

}

if (-not $SkipBuild) {
    $buildArgs = @('FlowFestEditor', 'Win64', 'Development', "-Project=$projectFile", '-WaitMutex', '-NoHotReloadFromIDE', '-MaxParallelActions=4', '-NoUBA')
    if ($CompilerVersion) { $buildArgs += "-CompilerVersion=$CompilerVersion" }
    & $engineBuild @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "Unreal C++ build failed ($LASTEXITCODE)" }
}

if (-not $SkipImport) {
    $importScript = Join-Path $PSScriptRoot 'import-assets.py'
    if (-not (Test-Path -LiteralPath $importScript)) { throw "Import script missing: $importScript" }
    & $editorCmd $projectFile '-run=pythonscript' "-script=$importScript" -unattended -nop4 -nosplash -RenderOffscreen
    if ($LASTEXITCODE -ne 0) { throw "Unreal asset import failed ($LASTEXITCODE)" }
    $fireScript = Join-Path $PSScriptRoot 'create-fire-material.py'
    & $editorCmd $projectFile '-run=pythonscript' "-script=$fireScript" -unattended -nop4 -nosplash -RenderOffscreen
    if ($LASTEXITCODE -ne 0) { throw "Unreal fire material generation failed ($LASTEXITCODE)" }
    foreach ($script in @('import-characters.py', 'import-props.py', 'import-euc.py', 'import-audio.py')) {
        & $editorCmd $projectFile '-run=pythonscript' "-script=$(Join-Path $PSScriptRoot $script)" -unattended -nop4 -nosplash -RenderOffscreen
        if ($LASTEXITCODE -ne 0) { throw "Unreal $script failed ($LASTEXITCODE)" }
    }

}

Write-Host "Flow Fest native bootstrap completed: $projectFile"
