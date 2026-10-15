param(
    [Parameter(Mandatory = $true)][string]$Rig,
    [string]$CaptureRoot = 'E:/FlowFestLivingCaptures-v3',
    [string]$ConvertRoot = 'E:/FlowFestLivingConvert',
    [string]$BaseScratch = 'E:/worktrees/tka-platform/run-02211e90e7',
    [string]$SourceRoot = 'E:/tka-platform'
)

$ErrorActionPreference = 'Stop'
$rigKey = $Rig.Replace('-', '_')
$jobRoot = Join-Path $ConvertRoot "rigs/$Rig"
$captureSnapshot = Join-Path $jobRoot 'captures'
$tools = Join-Path $jobRoot 'unreal/FlowFest/Tools'
$staged = Join-Path $tools 'staged/Characters'
$output = Join-Path $ConvertRoot "converted-v3/$Rig"
$blender = Join-Path $ConvertRoot 'blender-5.0.1-windows-x64/blender.exe'
$sourceTools = Join-Path $BaseScratch 'unreal/FlowFest/Tools'

foreach ($required in @($CaptureRoot, $BaseScratch, $SourceRoot, $blender,
        (Join-Path $sourceTools 'staged/Characters/imports.json'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing $required" }
}
$manifest = Get-Content (Join-Path $CaptureRoot 'family-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.captureRevision -ne 'clock-isolated-body-v3') {
    throw "Expected v3 body captures; found $($manifest.captureRevision)"
}
$selected = @($manifest.artifacts | Where-Object { $_.character -eq $Rig -and $_.role -match '^family-[a-z0-9_]+-[AB]$' })
if ($selected.Count -ne 82 -or @($selected.role | Select-Object -Unique).Count -ne 82 -or
    @($selected.role | ForEach-Object { $_ -replace '-[AB]$', '' } | Select-Object -Unique).Count -ne 41) {
    throw "$Rig is not READY: expected 41 paired A/B families, found $($selected.Count) entries"
}
foreach ($entry in $selected) {
    if ($entry.frames -ne 480 -or $entry.filename -ne "${Rig}_$($entry.role).json" -or
        -not (Test-Path -LiteralPath (Join-Path $CaptureRoot $entry.filename))) {
        throw "Invalid or missing v3 capture $($entry.filename)"
    }
}

New-Item -ItemType Directory -Path $captureSnapshot, $staged, $output,
    (Join-Path $jobRoot 'unreal/FlowFest/Content/Data') -Force | Out-Null
foreach ($entry in $selected) {
    $target = Join-Path $captureSnapshot $entry.filename
    if (-not (Test-Path -LiteralPath $target)) {
        New-Item -ItemType HardLink -Path $target -Value (Join-Path $CaptureRoot $entry.filename) | Out-Null
    }
}
$manifest.artifacts = $selected
$manifest | ConvertTo-Json -Depth 40 -Compress |
    Set-Content (Join-Path $captureSnapshot 'family-manifest.json') -Encoding utf8

Copy-Item -LiteralPath (Join-Path $sourceTools 'prepare-characters.mjs') -Destination $tools -Force
Copy-Item -LiteralPath (Join-Path $sourceTools 'convert-characters.py') -Destination $tools -Force
$baseline = Get-Content (Join-Path $sourceTools 'staged/Characters/imports.json') -Raw | ConvertFrom-Json
foreach ($character in $baseline.characters) {
    foreach ($profile in @($character.captures.PSObject.Properties.Name | Where-Object { $_ -like 'P_*' })) {
        $character.captures.PSObject.Properties.Remove($profile)
    }
    foreach ($name in @($character.animations.PSObject.Properties.Name | Where-Object { $_ -like 'Flow_P_*' })) {
        $character.animations.PSObject.Properties.Remove($name)
    }
    if (-not (Test-Path -LiteralPath $character.decoded)) {
        throw "Missing shared decoded rig $($character.decoded)"
    }
}
$baseline | ConvertTo-Json -Depth 40 | Set-Content (Join-Path $staged 'imports.json') -Encoding utf8

Push-Location $jobRoot
try {
    & node (Join-Path $tools 'prepare-characters.mjs') $SourceRoot --captures $captureSnapshot --family-only --capture-id $Rig
    if ($LASTEXITCODE -ne 0) { throw "prepare-characters failed: $LASTEXITCODE" }
    & $blender --background --python (Join-Path $tools 'convert-characters.py') -- --id $Rig --family-only
    if ($LASTEXITCODE -ne 0) { throw "Blender conversion failed: $LASTEXITCODE" }
} finally {
    Pop-Location
}

$converted = Get-ChildItem (Join-Path $staged $rigKey) -Filter 'A_Flow_P_*.fbx' -File
if ($converted.Count -ne 82) { throw "$Rig converted $($converted.Count)/82 FBXs" }
foreach ($file in $converted) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $output $file.Name) -Force
}
Write-Output "FLOWFEST_V3_RIG_CONVERTED $Rig 82"
Write-Output "FLOWFEST_V3_RIG_OUTPUT $output"
