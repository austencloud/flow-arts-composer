param(
    [Parameter(Mandatory = $true)][string]$Rig,
    [string]$D2ConvertRoot = 'E:/FlowFestLivingConvert',
    [string]$LocalConvertRoot,
    [switch]$FbxOnly
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$staged = Join-Path $PSScriptRoot 'staged/Characters'
$manifestPath = Join-Path $staged 'imports.json'
$catalogPath = Join-Path $project 'Content/Data/characters.json'
$key = $Rig.Replace('-', '_')
$rigPath = Join-Path $staged $key
$remote = "austen@d2:$D2ConvertRoot/rigs/$Rig/unreal/FlowFest/Tools/staged/Characters"
$remoteManifest = Join-Path $project "Saved/v3-$Rig-converted-imports.json"
$scp = 'C:/Windows/System32/OpenSSH/scp.exe'

New-Item -ItemType Directory -Path $rigPath, (Split-Path -Parent $remoteManifest) -Force | Out-Null
$localStaged = if ($LocalConvertRoot) {
    Join-Path $LocalConvertRoot "rigs/$Rig/unreal/FlowFest/Tools/staged/Characters"
}
if ($LocalConvertRoot) {
    Copy-Item -LiteralPath (Join-Path $localStaged 'imports.json') -Destination $remoteManifest -Force
} else {
    & $scp -q -o BatchMode=yes "$remote/imports.json" $remoteManifest
    if ($LASTEXITCODE -ne 0) { throw "Could not transfer $Rig conversion manifest" }
}
if ($FbxOnly) {
    $remoteFiles = if ($LocalConvertRoot) {
        Get-ChildItem -LiteralPath (Join-Path $localStaged $key) -Filter 'A_Flow_P_*.fbx' -File |
            Select-Object -ExpandProperty Name
    } else {
        & 'C:/Windows/System32/OpenSSH/ssh.exe' d2 "Get-ChildItem -LiteralPath '$D2ConvertRoot/rigs/$Rig/unreal/FlowFest/Tools/staged/Characters/$key' -Filter 'A_Flow_P_*.fbx' -File | Select-Object -ExpandProperty Name"
    }
    if ((-not $LocalConvertRoot -and $LASTEXITCODE -ne 0) -or @($remoteFiles).Count -ne 82) {
        throw "Expected 82 converted $Rig family FBXs"
    }
    $missing = @($remoteFiles | Where-Object {
        $localPath = Join-Path $rigPath $_
        $LocalConvertRoot -or -not (Test-Path -LiteralPath $localPath) -or
            (Get-Item -LiteralPath $localPath).Length -lt 1024
    })
    if ($missing.Count -gt 0) {
        if ($LocalConvertRoot) {
            Copy-Item -Path (Join-Path $localStaged "$key/A_Flow_P_*.fbx") -Destination $rigPath -Force
        } else {
            # One SFTP session is materially faster than 82 individual connections.
            & $scp -q -o BatchMode=yes "$remote/$key/A_Flow_P_*.fbx" "$rigPath/"
            if ($LASTEXITCODE -ne 0) { throw "Could not transfer $Rig family FBXs" }
        }
    }
    if ($LocalConvertRoot) {
        foreach ($file in $remoteFiles) {
            $source = Join-Path (Join-Path $localStaged $key) $file
            $target = Join-Path $rigPath $file
            if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne
                (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) {
                throw "Staged FBX differs from conversion source: $Rig/$file"
            }
        }
    }
} else {
    if ($LocalConvertRoot) { throw 'Local conversion staging supports -FbxOnly' }
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        & $scp -q -o BatchMode=yes -r "$remote/$key/." "$rigPath/"
        if ($LASTEXITCODE -eq 0) { break }
        if ($attempt -eq 3) { throw "Could not transfer $Rig GLBs/FBXs after $attempt attempts" }
        Start-Sleep -Seconds 5
    }
}

$converted = Get-Content $remoteManifest -Raw | ConvertFrom-Json
$local = Get-Content $manifestPath -Raw | ConvertFrom-Json
$catalog = Get-Content $catalogPath -Raw | ConvertFrom-Json
$entry = @($converted.characters | Where-Object id -eq $Rig)
$localEntry = @($local.characters | Where-Object id -eq $Rig)
$catalogEntry = @($catalog.characters | Where-Object id -eq $Rig)
if ($entry.Count -ne 1 -or $localEntry.Count -ne 1 -or $catalogEntry.Count -ne 1) {
    throw "Expected exactly one $Rig entry in all three catalogs"
}
$profiles = @($entry[0].captures.PSObject.Properties.Name | Where-Object { $_ -match '^P_[a-z0-9_]+_[AB]$' })
if ($profiles.Count -ne 82 -or @($profiles | Select-Object -Unique).Count -ne 82) {
    throw "$Rig conversion manifest has $($profiles.Count)/82 family profiles"
}
foreach ($profile in $profiles) {
    foreach ($file in $(if ($FbxOnly) { @("A_Flow_$profile.fbx") } else { @("capture_$profile.glb", "A_Flow_$profile.fbx") })) {
        $path = Join-Path $rigPath $file
        if (-not (Test-Path -LiteralPath $path) -or (Get-Item -LiteralPath $path).Length -lt 1024) {
            throw "Missing converted $Rig/$file"
        }
    }
}

foreach ($profile in @($localEntry[0].captures.PSObject.Properties.Name | Where-Object { $_ -like 'P_*' })) {
    $localEntry[0].captures.PSObject.Properties.Remove($profile)
}
foreach ($name in @($localEntry[0].animations.PSObject.Properties.Name | Where-Object { $_ -like 'Flow_P_*' })) {
    $localEntry[0].animations.PSObject.Properties.Remove($name)
    $catalogEntry[0].animations.PSObject.Properties.Remove($name)
}
foreach ($profile in $profiles) {
    $name = "Flow_$profile"
    $localEntry[0].captures | Add-Member -NotePropertyName $profile -NotePropertyValue (Join-Path $rigPath "capture_$profile.glb")
    $animation = $entry[0].animations.$name
    if (-not $animation) { throw "No animation asset mapping for $Rig/$profile" }
    $localEntry[0].animations | Add-Member -NotePropertyName $name -NotePropertyValue $animation
    $catalogEntry[0].animations | Add-Member -NotePropertyName $name -NotePropertyValue $animation
}
$local | ConvertTo-Json -Depth 40 | Set-Content $manifestPath -Encoding utf8
$catalog | ConvertTo-Json -Depth 40 | Set-Content $catalogPath -Encoding utf8
Write-Output "FLOWFEST_V3_RIG_STAGED $Rig 82"
