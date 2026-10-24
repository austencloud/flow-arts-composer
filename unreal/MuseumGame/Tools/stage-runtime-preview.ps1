param(
    [Parameter(Mandatory)][string]$MuseumProject,
    [Parameter(Mandatory)][string]$SharedProject,
    [Parameter(Mandatory)][string]$Destination
)

$ErrorActionPreference = 'Stop'
$sourceProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path -LiteralPath (Join-Path $sourceProject '..\..')).Path
$museum = (Resolve-Path -LiteralPath $MuseumProject).Path
$producer = (Resolve-Path -LiteralPath $SharedProject).Path
$target = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $target) { throw "Use a new destination so existing builds are preserved: $target" }
foreach ($prerequisite in @(
    (Join-Path $museum 'Content\Data\museum.json'),
    (Join-Path $producer 'Content\Data\runtime-rigs.json'),
    (Join-Path $producer '..\Shared\FlowArtsRuntime\Content\Effects\NS_PropFire.uasset')
)) {
    if (-not (Test-Path -LiteralPath $prerequisite -PathType Leaf)) { throw "Missing preview prerequisite: $prerequisite" }
}
$project = Join-Path $target 'Project'
$shared = Join-Path $target 'Shared'
New-Item -ItemType Directory -Path $project, $shared -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $museum 'Content') -Destination $project -Recurse
foreach ($relative in @('Config', 'Source', 'Tools', 'MuseumGame.uproject')) {
    Copy-Item -LiteralPath (Join-Path $sourceProject $relative) -Destination $project -Recurse
}
$plugin = Join-Path $shared 'FlowArtsRuntime'
New-Item -ItemType Directory -Path $plugin -Force | Out-Null
foreach ($relative in @('Source', 'FlowArtsRuntime.uplugin')) {
    Copy-Item -LiteralPath (Join-Path $repo "unreal\Shared\FlowArtsRuntime\$relative") -Destination $plugin -Recurse
}
Copy-Item -LiteralPath (Join-Path $producer '..\Shared\FlowArtsRuntime\Content') -Destination $plugin -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'unreal\Shared\Tools') -Destination $shared -Recurse
& node (Join-Path $project 'Tools\adopt-shared-assets.mjs') $producer
if ($LASTEXITCODE -ne 0) { throw 'Shared asset adoption failed. Incomplete preview is retained for diagnosis.' }
$commit = (& git -C $repo rev-parse HEAD).Trim()
$dirty = @(& git -C $repo status --porcelain -- unreal/MuseumGame unreal/Shared/FlowArtsRuntime unreal/Shared/Tools)
@{
    schema = 'museum-runtime-preview-stage-v1'
    sourceCommit = $commit
    sourceDirty = ($dirty.Count -gt 0)
    sourceWorkspace = $repo
    museumAssetSource = $museum
    sharedAssetSource = $producer
    stagedAtUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'STAGING.json') -Encoding utf8
Write-Output "MUSEUM_RUNTIME_STAGE_OK $project"
