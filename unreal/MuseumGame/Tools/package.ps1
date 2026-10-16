param(
    [string]$ArchiveDirectory = '',
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$CompilerVersion = '',
    [string]$CaptureDirectory = '',
    [ValidateRange(1, 16)][int]$MaxParallelActions = 4,
    [ValidateRange(1, 16)][int]$MaxShaderWorkers = 2
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $CaptureDirectory) { $CaptureDirectory = Join-Path $project 'Saved\PerformanceCaptures' }
$file = Join-Path $project 'MuseumGame.uproject'
$map = Join-Path $project 'Content\MuseumGame\Maps\Museum.umap'
$data = Join-Path $project 'Content\Data\museum.json'
$uat = Join-Path $EngineRoot 'Engine\Build\BatchFiles\RunUAT.bat'
foreach ($path in @($file, $map, $data, $uat)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing prerequisite: $path" }
}
$sharedEffects = Join-Path $project '..\Shared\FlowArtsRuntime\Content\Effects'
foreach ($relativePath in @(
    'Materials\M_WorldScore.uasset',
    'Materials\M_NiagaraFlame.uasset',
    'Materials\M_NiagaraEmber.uasset',
    'Materials\M_NiagaraTrail.uasset',
    'NS_PropFire.uasset'
)) {
    $asset = Join-Path $sharedEffects $relativePath
    if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) {
        throw "Missing required shared effect/score asset: $asset"
    }
}
if (-not $ArchiveDirectory) { $ArchiveDirectory = Join-Path $project 'Builds' }
& node (Join-Path $PSScriptRoot 'verify-playback-data.mjs') --project $project --captures $CaptureDirectory --stage imported
if ($LASTEXITCODE -ne 0) { throw "Museum imported playback verification failed ($LASTEXITCODE)" }
$bundleTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-bundle.mjs'
& node $bundleTool verify --project $project
if ($LASTEXITCODE -ne 0) { throw "Museum performance bundle verification failed ($LASTEXITCODE)" }
$libraryTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-library.mjs'
& node $libraryTool build --project $project
if ($LASTEXITCODE -ne 0) { throw "Museum performance library export failed ($LASTEXITCODE)" }
$pictographTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-pictographs.mjs'
$hasPictographs = Test-Path -LiteralPath (Join-Path $project 'Content\Data\performance-pictographs.json')
if ($hasPictographs) {
    & node $pictographTool verify --project $project
    if ($LASTEXITCODE -ne 0) { throw "Museum performance pictograph verification failed ($LASTEXITCODE)" }
}
$ubt = "-WaitMutex -MaxParallelActions=$MaxParallelActions -NoUBA"
if ($CompilerVersion) { $ubt += " -CompilerVersion=$CompilerVersion" }
# Cook commandlets use the absolute unused-thread setting, independently of UBT.
$unusedShaderThreads = [Math]::Max(0, [Environment]::ProcessorCount - $MaxShaderWorkers)
$cookerOptions = "-ini:Engine:[DevOptions.Shaders]:NumUnusedShaderCompilingThreads=$unusedShaderThreads"
& $uat BuildCookRun "-project=$file" -noP4 -platform=Win64 -clientconfig=Development -build -skipbuildeditor -cook -stage -package -archive -pak "-archivedirectory=$ArchiveDirectory" "-ubtargs=$ubt" "-AdditionalCookerOptions=$cookerOptions"
if ($LASTEXITCODE -ne 0) { throw "Museum package failed ($LASTEXITCODE)" }
$exe = Join-Path $ArchiveDirectory 'Windows\MuseumGame.exe'
$staged = Join-Path $ArchiveDirectory 'Windows\MuseumGame\Content\Data\museum.json'
if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $staged)) {
    throw "Packaged executable or staged museum data missing in $ArchiveDirectory"
}
$json = Get-Content -LiteralPath $staged -Raw | ConvertFrom-Json
if ($json.version -ne 1 -or $json.rooms.Count -lt 20 -or $json.exhibits.Count -lt 40) {
    throw 'Staged museum data is incomplete'
}
& node (Join-Path $PSScriptRoot 'verify-playback-data.mjs') --project $project --stage packaged --packaged-data (Split-Path -Parent $staged)
if ($LASTEXITCODE -ne 0) { throw "Museum packaged playback verification failed ($LASTEXITCODE)" }
& node $bundleTool verify --project $project --packaged-data (Split-Path -Parent $staged)
if ($LASTEXITCODE -ne 0) { throw "Museum packaged performance bundle verification failed ($LASTEXITCODE)" }
& node $libraryTool verify --project $project --packaged-data (Split-Path -Parent $staged)
if ($LASTEXITCODE -ne 0) { throw "Museum packaged performance library verification failed ($LASTEXITCODE)" }
if ($hasPictographs) {
    & node $pictographTool verify --project $project --packaged-data (Split-Path -Parent $staged)
    if ($LASTEXITCODE -ne 0) { throw "Museum packaged pictograph verification failed ($LASTEXITCODE)" }
}
Write-Host "MUSEUM_PACKAGE_OK $exe"
