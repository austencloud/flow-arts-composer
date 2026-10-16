param(
    [string]$ArchiveDirectory = '',
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$CompilerVersion = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectFile = Join-Path $projectRoot 'FlowFest.uproject'
$map = Join-Path $projectRoot 'Content\FlowFest\Maps\Festival.umap'
$site = Join-Path $projectRoot 'Content\Data\site.json'
$uat = Join-Path $EngineRoot 'Engine\Build\BatchFiles\RunUAT.bat'
if (-not $ArchiveDirectory) { $ArchiveDirectory = Join-Path $projectRoot 'Builds' }
foreach ($required in @($projectFile, $map, $site, $uat)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing prerequisite: $required. Run bootstrap.ps1 successfully before packaging." }
}
& node (Join-Path $PSScriptRoot 'validate-runtime-data.mjs') (Join-Path $projectRoot 'Content\Data')
if ($LASTEXITCODE -ne 0) { throw 'Native runtime data failed validation before packaging.' }
$bundleTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-bundle.mjs'
& node $bundleTool verify --project $projectRoot
if ($LASTEXITCODE -ne 0) { throw "Performance bundle verification failed ($LASTEXITCODE)" }
$libraryTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-library.mjs'
& node $libraryTool build --project $projectRoot
if ($LASTEXITCODE -ne 0) { throw "Performance library export failed ($LASTEXITCODE)" }
$pictographTool = Join-Path $PSScriptRoot '..\..\Shared\Tools\performance-pictographs.mjs'
$hasPictographs = Test-Path -LiteralPath (Join-Path $projectRoot 'Content\Data\performance-pictographs.json')
if ($hasPictographs) {
    & node $pictographTool verify --project $projectRoot
    if ($LASTEXITCODE -ne 0) { throw "Performance pictograph verification failed ($LASTEXITCODE)" }
}
if (-not (Test-Path -LiteralPath $ArchiveDirectory)) { New-Item -ItemType Directory -Path $ArchiveDirectory -Force | Out-Null }
$archivePath = (Resolve-Path -LiteralPath $ArchiveDirectory).Path

$ubtArgs = '-MaxParallelActions=4 -NoUBA'
if ($CompilerVersion) { $ubtArgs += " -CompilerVersion=$CompilerVersion" }
$uatArgs = @(
    'BuildCookRun', "-project=$projectFile", '-noP4', '-platform=Win64',
    '-clientconfig=Development', '-build', '-skipbuildeditor', '-cook',
    '-stage', '-package', '-archive', '-pak', "-archivedirectory=$archivePath",
    "-ubtargs=$ubtArgs"
)
& $uat @uatArgs
if ($LASTEXITCODE -ne 0) { throw "Unreal packaging failed ($LASTEXITCODE)" }

$packageRoot = Join-Path $archivePath 'Windows'
$gameExe = Join-Path $packageRoot 'FlowFest.exe'
$paks = Join-Path $packageRoot 'FlowFest\Content\Paks'
if (-not (Test-Path -LiteralPath $gameExe) -or -not (Test-Path -LiteralPath $paks)) {
    throw "UAT completed, but expected cooked package is incomplete: $packageRoot"
}

# Data is staged as NonUFS; a successful cook does not prove these files made it into the archive.
$dataDir = Join-Path $packageRoot 'FlowFest\Content\Data'
& node $bundleTool verify --project $projectRoot --packaged-data $dataDir
if ($LASTEXITCODE -ne 0) { throw "Packaged performance bundle verification failed ($LASTEXITCODE)" }
& node $libraryTool verify --project $projectRoot --packaged-data $dataDir
if ($LASTEXITCODE -ne 0) { throw "Packaged performance library verification failed ($LASTEXITCODE)" }
if ($hasPictographs) {
    & node $pictographTool verify --project $projectRoot --packaged-data $dataDir
    if ($LASTEXITCODE -ne 0) { throw "Packaged pictograph verification failed ($LASTEXITCODE)" }
}
$stagedSite = Join-Path $dataDir 'site.json'
if (-not (Test-Path -LiteralPath $stagedSite -PathType Leaf)) {
    throw "UAT completed, but staged site JSON is missing: $stagedSite"
}
try {
    $siteData = Get-Content -LiteralPath $stagedSite -Raw | ConvertFrom-Json
} catch {
    throw "Staged site JSON is invalid: $stagedSite ($($_.Exception.Message))"
}
$terrain = $siteData.terrain
$width = $terrain.width
$height = $terrain.height
if ($siteData.version -ne 1 -or $null -eq $terrain -or
    ($width -isnot [int] -and $width -isnot [long]) -or
    ($height -isnot [int] -and $height -isnot [long]) -or
    $width -lt 2 -or $height -lt 2 -or $width -gt 4097 -or $height -gt 4097) {
    throw "Staged site JSON has an invalid version or terrain dimensions: $stagedSite"
}
foreach ($field in @('heightFile', 'imageryFile', 'canopyFile', 'manifestFile')) {
    $name = $terrain.$field
    if ($name -isnot [string] -or $name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
        throw "Staged site JSON has an invalid terrain.$field filename: $stagedSite"
    }
    $stagedFile = Join-Path $dataDir $name
    if (-not (Test-Path -LiteralPath $stagedFile -PathType Leaf) -or (Get-Item -LiteralPath $stagedFile).Length -eq 0) {
        throw "UAT completed, but staged terrain.$field is missing or empty: $stagedFile"
    }
}
$stagedHeights = Join-Path $dataDir $terrain.heightFile
$expectedHeightBytes = [long]$width * [long]$height * 4
$actualHeightBytes = (Get-Item -LiteralPath $stagedHeights).Length
if ($actualHeightBytes -ne $expectedHeightBytes) {
    throw "Staged height file has $actualHeightBytes bytes; expected $expectedHeightBytes ($width x $height float32): $stagedHeights"
}
$characters = Get-Content -LiteralPath (Join-Path $dataDir 'characters.json') -Raw | ConvertFrom-Json
$props = Get-Content -LiteralPath (Join-Path $dataDir 'props.json') -Raw | ConvertFrom-Json
if (@($characters.characters).Count -ne 16 -or @($props.props).Count -ne 41 -or @($props.props | ForEach-Object { $_.variants }).Count -ne 71) {
    throw 'Staged native catalogs are incomplete; expected 16 characters and 41 props / 71 variants.'
}
& node (Join-Path $PSScriptRoot 'validate-runtime-data.mjs') $dataDir
if ($LASTEXITCODE -ne 0) { throw 'Packaged native runtime data failed validation.' }
if (@($siteData.grass).Count -lt 20000 -or @($siteData.groundLife).Count -lt 20) {
    throw 'Staged living ecology data is incomplete.'
}
foreach ($document in @('README.md', 'CREDITS.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $document) -Destination (Join-Path $packageRoot $document) -Force
}
Write-Host "Flow Fest packaged files ready: $packageRoot"
