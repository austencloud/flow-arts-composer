param(
    [string]$AssetProject = 'E:\FlowFestEmbodiment58\Project',
    [string]$RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'FlowArtsComposer\ComposerViewer\Host'),
    [switch]$SkipAssets
)

$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $PSCommandPath
$viewerSource = (Resolve-Path -LiteralPath (Join-Path $toolDir '..')).Path
$sharedSource = (Resolve-Path -LiteralPath (Join-Path $toolDir '..\..\Shared\FlowArtsRuntime')).Path
$uproject = Join-Path $viewerSource 'ComposerViewer.uproject'
if (-not (Test-Path -LiteralPath $uproject)) { throw "Missing native project: $uproject" }

$runtimeFull = [IO.Path]::GetFullPath($RuntimeRoot).TrimEnd('\')
$expectedBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FlowArtsComposer\ComposerViewer')).TrimEnd('\')
if (-not $runtimeFull.StartsWith($expectedBase + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "RuntimeRoot must be inside $expectedBase"
}
$projectTarget = Join-Path $runtimeFull 'Project'
$pluginTarget = Join-Path $runtimeFull 'Shared\FlowArtsRuntime'
New-Item -ItemType Directory -Path $projectTarget, $pluginTarget -Force | Out-Null

function Copy-Tree([string]$source, [string]$target) {
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "Missing source directory: $source" }
    $targetFull = [IO.Path]::GetFullPath($target)
    if (-not $targetFull.StartsWith($runtimeFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to copy outside task runtime: $targetFull"
    }
    & robocopy.exe $source $target /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $source -> $target" }
}

Copy-Item -LiteralPath $uproject -Destination (Join-Path $projectTarget 'ComposerViewer.uproject') -Force
foreach ($folder in @('Config', 'Source')) {
    Copy-Tree (Join-Path $viewerSource $folder) (Join-Path $projectTarget $folder)
}
Copy-Tree $sharedSource $pluginTarget

if (-not $SkipAssets) {
    $assetFull = (Resolve-Path -LiteralPath $AssetProject).Path
    foreach ($folder in @('FlowFest', 'Data')) {
        Copy-Tree (Join-Path $assetFull "Content\$folder") (Join-Path $projectTarget "Content\$folder")
    }
}

Write-Output "Staged native host: $(Join-Path $projectTarget 'ComposerViewer.uproject')"
Write-Output "Shared plugin: $pluginTarget"
if ($SkipAssets) { Write-Output 'Assets skipped; this staging is not render-ready.' }
else { Write-Output "Asset source: $AssetProject\Content\{FlowFest,Data}" }
