param(
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$BlenderExe = 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe',
    [string]$CompilerVersion = '',
    [string]$SharedProject = '',
    [string]$CaptureDirectory = '',
    [switch]$SkipExport,
    [switch]$SkipBuild,
    [switch]$SkipAssets
)

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $project '..\..')).Path
if (-not $SharedProject) { $SharedProject = Join-Path $repo 'unreal\FlowFest' }
if (-not $CaptureDirectory) { $CaptureDirectory = Join-Path $project 'Saved\PerformanceCaptures' }
$file = Join-Path $project 'MuseumGame.uproject'
$performanceManifest = Join-Path $project 'Content\Data\museum-performances.json'
$sharedCharacterStage = Join-Path $SharedProject 'Tools\staged\Characters'
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
foreach ($path in @((Join-Path $project 'Content\Data\museum.json'), $performanceManifest)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Museum export is missing: $path" }
}
if (-not $SkipBuild) {
    $args = @('MuseumGameEditor', 'Win64', 'Development', "-Project=$file", '-WaitMutex', '-NoHotReloadFromIDE', '-MaxParallelActions=4', '-NoUBA')
    if ($CompilerVersion) { $args += "-CompilerVersion=$CompilerVersion" }
    & $build @args
    if ($LASTEXITCODE -ne 0) { throw "Museum C++ editor build failed ($LASTEXITCODE)" }
}
if (-not $SkipAssets) {
    if (-not (Test-Path -LiteralPath $BlenderExe)) { throw "Missing Blender: $BlenderExe" }
    foreach ($path in @((Join-Path $SharedProject 'FlowFest.uproject'), $CaptureDirectory, $sharedCharacterStage)) {
        if (-not (Test-Path -LiteralPath $path)) { throw "Missing shared animation prerequisite: $path" }
    }
    $SharedProject = (Resolve-Path -LiteralPath $SharedProject).Path
    $CaptureDirectory = (Resolve-Path -LiteralPath $CaptureDirectory).Path
    $sharedCharacterStage = (Resolve-Path -LiteralPath $sharedCharacterStage).Path
    & node (Join-Path $PSScriptRoot 'adopt-shared-assets.mjs') $SharedProject
    if ($LASTEXITCODE -ne 0) { throw "Shared asset adoption failed ($LASTEXITCODE)" }
    & node (Join-Path $repo 'unreal\FlowFest\Tools\prepare-prop-motion.mjs') $CaptureDirectory --project $project --performance-manifest $performanceManifest
    if ($LASTEXITCODE -ne 0) { throw "Museum prop motion preparation failed ($LASTEXITCODE)" }
    & node (Join-Path $repo 'unreal\FlowFest\Tools\prepare-characters.mjs') --captures $CaptureDirectory --project $project --performance-manifest $performanceManifest --base-staged $sharedCharacterStage
    if ($LASTEXITCODE -ne 0) { throw "Museum character performance preparation failed ($LASTEXITCODE)" }
    & node (Join-Path $PSScriptRoot 'verify-playback-data.mjs') --project $project --captures $CaptureDirectory --stage pre-import
    if ($LASTEXITCODE -ne 0) { throw "Museum prepared playback verification failed ($LASTEXITCODE)" }
    $characterManifest = Join-Path $project 'Saved\Performers\characters.json'
    & node (Join-Path $repo 'unreal\Shared\Tools\character-catalog.mjs') --source-root $repo --output $characterManifest
    if ($LASTEXITCODE -ne 0) { throw "Native character catalog generation failed ($LASTEXITCODE)" }
    & $BlenderExe -b --factory-startup --python-exit-code 1 -noaudio --python (Join-Path $PSScriptRoot 'convert-shells.py')
    if ($LASTEXITCODE -ne 0) { throw "Museum shell conversion failed ($LASTEXITCODE)" }
    $performerLog = Join-Path $project 'Saved\performers-convert.log'
    & $BlenderExe -b -noaudio --python (Join-Path $PSScriptRoot 'convert-performers.py') 2>&1 | Tee-Object -FilePath $performerLog
    if ($LASTEXITCODE -ne 0 -or -not (Select-String -Path $performerLog -Pattern '^MUSEUM_PERFORMERS_CONVERTED 16$' -Quiet)) {
        throw "Museum performer conversion failed; see $performerLog"
    }
    $nativePerformanceLog = Join-Path $project 'Saved\museum-native-performances-convert.log'
    & $BlenderExe -b -noaudio --python (Join-Path $repo 'unreal\FlowFest\Tools\convert-characters.py') -- --project $project --profiles-only --id x-bot 2>&1 | Tee-Object -FilePath $nativePerformanceLog
    if ($LASTEXITCODE -ne 0) { throw "Museum native performance conversion failed; see $nativePerformanceLog" }
    & $editor $file '-run=pythonscript' "-script=$(Join-Path $PSScriptRoot 'create-project-assets.py')" -unattended -nop4 -nosplash -RenderOffscreen
    if ($LASTEXITCODE -ne 0) { throw "Museum asset creation failed ($LASTEXITCODE)" }
    $importLog = Join-Path $project 'Saved\performers-import.log'
    & $editor $file '-run=pythonscript' "-script=$(Join-Path $PSScriptRoot 'import-performers.py')" -unattended -nop4 -nosplash -RenderOffscreen 2>&1 | Tee-Object -FilePath $importLog
    $engineLog = Join-Path $project 'Saved\Logs\MuseumGame.log'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $engineLog) -or
        -not (Select-String -Path $engineLog -Pattern 'MUSEUM_PERFORMERS_OK 16' -Quiet)) {
        throw "Museum performer import failed; see $importLog and $engineLog"
    }
    $nativeImportLog = Join-Path $project 'Saved\museum-native-performances-import.log'
    $nativeLogDirectory = Join-Path $project 'Saved\Logs'
    New-Item -ItemType Directory -Path $nativeLogDirectory -Force | Out-Null
    $nativeEngineLog = Join-Path $nativeLogDirectory "MuseumNativePerformanceImport-$([Guid]::NewGuid().ToString('N')).log"
    $importEnvironment = @{
        MUSEUM_PERFORMANCE_MANIFEST = $performanceManifest
        FLOWFEST_STAGED = (Join-Path $project 'Tools\staged\Characters')
        FLOWFEST_FORCE = '1'
        FLOWFEST_CAPTURE_ONLY = $null
        FLOWFEST_LOCOMOTION_ONLY = $null
        FLOWFEST_FAMILY_ONLY = $null
        FLOWFEST_CAPTURE_ID = $null
        FLOWFEST_ALLOW_PARTIAL = $null
    }
    $previousEnvironment = @{}
    try {
        foreach ($name in $importEnvironment.Keys) {
            $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $importEnvironment[$name], 'Process')
        }
        & $editor $file '-run=pythonscript' "-script=$(Join-Path $repo 'unreal\FlowFest\Tools\import-characters.py')" "-abslog=$nativeEngineLog" -unattended -nop4 -nosplash -RenderOffscreen 2>&1 | Tee-Object -FilePath $nativeImportLog
        if ($LASTEXITCODE -ne 0 -or
            -not (Test-Path -LiteralPath $nativeEngineLog) -or
            -not (Select-String -LiteralPath $nativeEngineLog -Pattern 'FLOWFEST_CHARACTERS_IMPORTED 1\s*$' -Quiet)) {
            throw "Museum native performance import failed; see $nativeEngineLog and $nativeImportLog"
        }
    } finally {
        foreach ($name in $previousEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
        }
    }
    & node (Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-bundle.mjs') seal --project $project --captures $CaptureDirectory --converter (Join-Path $repo 'unreal\FlowFest\Tools\convert-characters.py') --importer (Join-Path $repo 'unreal\FlowFest\Tools\import-characters.py')
    if ($LASTEXITCODE -ne 0) { throw "Museum performance bundle sealing failed ($LASTEXITCODE)" }
    & node (Join-Path $PSScriptRoot 'verify-playback-data.mjs') --project $project --captures $CaptureDirectory --stage imported
    if ($LASTEXITCODE -ne 0) { throw "Museum imported playback verification failed ($LASTEXITCODE)" }
}
Write-Host "MUSEUM_BOOTSTRAP_OK $file"
