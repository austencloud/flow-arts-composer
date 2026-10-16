param(
    [string]$ArchiveDirectory = '',
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$CompilerVersion = '',
    [string]$CaptureDirectory = ''
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
if (-not $ArchiveDirectory) { $ArchiveDirectory = Join-Path $project 'Builds' }
& node (Join-Path $PSScriptRoot 'verify-playback-data.mjs') --project $project --captures $CaptureDirectory --stage imported
if ($LASTEXITCODE -ne 0) { throw "Museum imported playback verification failed ($LASTEXITCODE)" }
$bundleTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-bundle.mjs'
& node $bundleTool verify --project $project
if ($LASTEXITCODE -ne 0) { throw "Museum performance bundle verification failed ($LASTEXITCODE)" }
$ubt = '-WaitMutex -MaxParallelActions=4 -NoUBA'
if ($CompilerVersion) { $ubt += " -CompilerVersion=$CompilerVersion" }
& $uat BuildCookRun "-project=$file" -noP4 -platform=Win64 -clientconfig=Development -build -skipbuildeditor -cook -stage -package -archive -pak "-archivedirectory=$ArchiveDirectory" "-ubtargs=$ubt"
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
Write-Host "MUSEUM_PACKAGE_OK $exe"
