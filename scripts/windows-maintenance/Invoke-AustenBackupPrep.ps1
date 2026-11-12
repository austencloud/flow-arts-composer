#requires -Version 7.0

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
if ($identity.IsSystem -or $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Cloud and Git backup preparation must run in Austen's normal unelevated session."
}

$expectedAccount = "$env:COMPUTERNAME\Austen"
if (-not $identity.Name.Equals($expectedAccount, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Cloud and Git backup preparation must run as $expectedAccount."
}

$installRoot = 'C:\ProgramData\AustenBackup'
$modulePath = Join-Path $installRoot 'Scripts\AustenBackup.Common.psm1'
Import-Module -Name $modulePath -Force

$maintenanceRoot = 'C:\Users\Austen\Documents\PC Maintenance'
$logRoot = Join-Path $maintenanceRoot 'Logs'
$cloudStageRoot = "D:\_DOCUMENTS\Computer Backup\$env:COMPUTERNAME"
$repoPath = 'E:\tka-platform'
$gitPath = 'C:\Program Files\Git\cmd\git.exe'
$gitSafePath = $repoPath.Replace('\', '/')
$runId = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logPath = Join-Path $logRoot "backup-prep-$runId.log"
$workingStateRoot = Join-Path $cloudStageRoot 'Development\TKA Working State'
$workingStateDestination = Join-Path $workingStateRoot $runId
$resultPath = Join-Path $workingStateDestination 'prep-result.json'
$latestResultPath = Join-Path $cloudStageRoot 'latest-backup-prep.json'
# The protected nightly run copies D: into this folder on F: and never deletes
# there, so a bundle found here with the same length and write time is safe.
$archivedWorkingStateRoot = "F:\Automated Backups\$env:COMPUTERNAME\D\_DOCUMENTS\Computer Backup\$env:COMPUTERNAME\Development\TKA Working State"
# Room the next bundle needs on D: beyond its expected size.
$bundleHeadroomBytes = 2GB
$copyResults = [System.Collections.Generic.List[object]]::new()
$result = [ordered]@{
    RunId = $runId
    StartedAt = (Get-Date).ToString('o')
    CompletedAt = $null
    Account = $identity.Name
    CopyResults = @()
    HeadBefore = $null
    HeadAfter = $null
    UntrackedFiles = 0
    SkippedReparseFiles = @()
    BundleBytes = $null
    StagedBundlesRemoved = 0
    StagedBundleBytesRemoved = 0
    ICloudManifestFiles = $null
    CrossDeviceManifestFiles = $null
    Passed = $false
    ErrorType = $null
    ErrorMessage = $null
}

function Invoke-SafeGit {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$CaptureOutput
    )

    $gitArguments = @(
        '-c', "safe.directory=$gitSafePath",
        '-c', 'core.fsmonitor=false',
        '-C', $repoPath
    ) + $Arguments

    if ($CaptureOutput) {
        $output = & $gitPath @gitArguments 2>&1
    } else {
        & $gitPath @gitArguments
        $output = @()
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }

    @($output)
}

function Save-GitOutput {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Destination
    )

    $output = Invoke-SafeGit -Arguments $Arguments -CaptureOutput
    [System.IO.File]::WriteAllLines(
        $Destination,
        [string[]]$output,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Write-PrepResult {
    $result.CopyResults = @($copyResults)
    $result.CompletedAt = (Get-Date).ToString('o')
    $json = $result | ConvertTo-Json -Depth 8

    [System.IO.Directory]::CreateDirectory($workingStateDestination) | Out-Null
    [System.IO.File]::WriteAllText($resultPath, $json, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($latestResultPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Write-ProviderManifest {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Provider-backed source is unavailable: $Source"
    }

    $rows = @(
        Get-ChildItem -LiteralPath $Source -File -Recurse -Force -ErrorAction Stop |
            ForEach-Object {
                [pscustomobject]@{
                    RelativePath = $_.FullName.Substring($Source.Length).TrimStart('\')
                    Length = $_.Length
                    LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
                    Attributes = $_.Attributes.ToString()
                }
            }
    )
    if ($rows.Count -eq 0) {
        throw "Provider-backed source contains no files: $Source"
    }

    $rows | Export-Csv -LiteralPath $Destination -NoTypeInformation -Encoding utf8
    $rows.Count
}

# Each night's bundle is a full copy of the repository history, about 7 GB.
# They used to stay on D: forever; on 2026-11-10 D: was down to 1 GB free and
# the bundle step failed, so the protected backup never started. A staged
# bundle is removed only once F: holds a copy with the same length and write
# time (robocopy keeps both), and the newest staged bundle always stays.
function Remove-ArchivedStagedBundles {
    $removed = 0
    $removedBytes = [long]0
    $runFolders = @(
        Get-ChildItem -LiteralPath $workingStateRoot -Directory -ErrorAction Stop |
            Where-Object { $_.Name -ne $runId } |
            Sort-Object Name -Descending
    )
    $newestWithBundle = $runFolders |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'tka-platform.bundle') -PathType Leaf } |
        Select-Object -First 1

    foreach ($folder in $runFolders) {
        if ($null -ne $newestWithBundle -and $folder.Name -eq $newestWithBundle.Name) {
            continue
        }
        $stagedPath = Join-Path $folder.FullName 'tka-platform.bundle'
        if (-not (Test-Path -LiteralPath $stagedPath -PathType Leaf)) {
            continue
        }
        $archivedPath = Join-Path $archivedWorkingStateRoot "$($folder.Name)\tka-platform.bundle"
        if (-not (Test-Path -LiteralPath $archivedPath -PathType Leaf)) {
            continue
        }

        $staged = Get-Item -LiteralPath $stagedPath -Force
        $archived = Get-Item -LiteralPath $archivedPath -Force
        if ($staged.Length -ne $archived.Length -or $staged.LastWriteTimeUtc -ne $archived.LastWriteTimeUtc) {
            Write-AustenBackupLog -LogPath $logPath -Message "STAGED BUNDLE KEPT run=$($folder.Name) reason=archive copy differs" | Out-Null
            continue
        }

        Remove-Item -LiteralPath $stagedPath -Force
        $removed++
        $removedBytes += $staged.Length
        Write-AustenBackupLog -LogPath $logPath -Message "STAGED BUNDLE REMOVED run=$($folder.Name) bytes=$($staged.Length) archived=$archivedPath" | Out-Null
    }

    $result.StagedBundlesRemoved = $removed
    $result.StagedBundleBytesRemoved = $removedBytes
}

function Assert-BundleSpace {
    $lastBundle = Get-ChildItem -LiteralPath $workingStateRoot -Recurse -File -Filter 'tka-platform.bundle' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    $expectedBytes = if ($null -ne $lastBundle) { $lastBundle.Length } else { 8GB }
    $freeBytes = (Get-PSDrive -Name D).Free
    if ($freeBytes -lt ($expectedBytes + $bundleHeadroomBytes)) {
        throw ("D: has {0:N1} GB free; the Git bundle needs about {1:N1} GB. Free space on D: (staged bundles already on F: were removed)." -f ($freeBytes / 1GB), (($expectedBytes + $bundleHeadroomBytes) / 1GB))
    }
}

$mutex = $null
$ownsMutex = $false

try {
    foreach ($requiredPath in @('D:\', 'E:\', $repoPath, $gitPath, $modulePath)) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Required preparation path is unavailable: $requiredPath"
        }
    }

    [System.IO.Directory]::CreateDirectory($logRoot) | Out-Null
    [System.IO.Directory]::CreateDirectory($workingStateDestination) | Out-Null

    $createdNew = $false
    $mutex = [System.Threading.Mutex]::new($true, 'Local\AustenBackupPrep', [ref]$createdNew)
    if (-not $createdNew) {
        throw 'Another cloud and Git backup preparation is already running.'
    }
    $ownsMutex = $true

    Write-AustenBackupLog -LogPath $logPath -Message 'PREP START' | Out-Null

    foreach ($folder in @('Desktop', 'Documents', 'Videos', 'Saved Games')) {
        $source = Join-Path 'C:\Users\Austen' $folder
        $destination = Join-Path $cloudStageRoot "C\User\Austen\$folder"
        $copyResults.Add((Invoke-AustenRobocopy `
            -Source $source `
            -Destination $destination `
            -LogPath $logPath `
            -Optional `
            -SkipVerification))
    }

    $manifestStageRoot = Join-Path $cloudStageRoot 'Manifests'
    [System.IO.Directory]::CreateDirectory($manifestStageRoot) | Out-Null
    $result.ICloudManifestFiles = Write-ProviderManifest `
        -Source 'D:\PICTURES2\iCloud Photos' `
        -Destination (Join-Path $manifestStageRoot 'icloud-photos-placeholders.csv')
    $result.CrossDeviceManifestFiles = Write-ProviderManifest `
        -Source 'C:\Users\Austen\CrossDevice' `
        -Destination (Join-Path $manifestStageRoot 'cross-device-placeholders.csv')
    Write-AustenBackupLog `
        -LogPath $logPath `
        -Message "PROVIDER MANIFESTS icloud=$($result.ICloudManifestFiles) crossdevice=$($result.CrossDeviceManifestFiles)" |
        Out-Null

    $result.HeadBefore = (Invoke-SafeGit -Arguments @('rev-parse', 'HEAD') -CaptureOutput)[0]
    Save-GitOutput -Arguments @('status', '--porcelain=v2', '--branch') -Destination (Join-Path $workingStateDestination 'status.txt')
    Save-GitOutput -Arguments @('diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD') -Destination (Join-Path $workingStateDestination 'working-tree.patch')
    Save-GitOutput -Arguments @('rev-parse', 'HEAD') -Destination (Join-Path $workingStateDestination 'head.txt')
    Save-GitOutput -Arguments @('remote', '-v') -Destination (Join-Path $workingStateDestination 'remotes.txt')

    $untrackedRoot = Join-Path $workingStateDestination 'untracked'
    $repoFullPath = [System.IO.Path]::GetFullPath($repoPath).TrimEnd('\') + '\'
    $untrackedFiles = Invoke-SafeGit -Arguments @('ls-files', '--others', '--exclude-standard') -CaptureOutput
    $skippedReparseFiles = [System.Collections.Generic.List[string]]::new()
    $copiedUntrackedFiles = 0

    foreach ($relativePath in $untrackedFiles) {
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            continue
        }

        $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $repoPath $relativePath))
        if (-not $sourcePath.StartsWith($repoFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Git returned an untracked path outside the repository: $relativePath"
        }
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            continue
        }

        $sourceItem = Get-Item -LiteralPath $sourcePath -Force
        if ($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            $skippedReparseFiles.Add($relativePath)
            continue
        }

        $destinationPath = Join-Path $untrackedRoot $relativePath
        [System.IO.Directory]::CreateDirectory((Split-Path -Parent $destinationPath)) | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
        $copiedUntrackedFiles++
    }

    $result.UntrackedFiles = $copiedUntrackedFiles
    $result.SkippedReparseFiles = @($skippedReparseFiles)

    Remove-ArchivedStagedBundles
    Assert-BundleSpace

    $bundlePath = Join-Path $workingStateDestination 'tka-platform.bundle'
    Invoke-SafeGit -Arguments @('bundle', 'create', $bundlePath, '--all') | Out-Null
    Save-GitOutput -Arguments @('bundle', 'verify', $bundlePath) -Destination (Join-Path $workingStateDestination 'bundle-verification.txt')
    $result.BundleBytes = (Get-Item -LiteralPath $bundlePath).Length

    $result.HeadAfter = (Invoke-SafeGit -Arguments @('rev-parse', 'HEAD') -CaptureOutput)[0]
    if ($result.HeadBefore -ne $result.HeadAfter) {
        throw "Repository HEAD changed during backup preparation: $($result.HeadBefore) -> $($result.HeadAfter)"
    }

    $result.Passed = $true
    Write-PrepResult
    Write-AustenBackupLog -LogPath $logPath -Message "PREP COMPLETE snapshot=$workingStateDestination" | Out-Null
    exit 0
} catch {
    $result.ErrorType = $_.Exception.GetType().FullName
    $result.ErrorMessage = $_.Exception.Message
    Write-AustenBackupLog -LogPath $logPath -Message "PREP FAILED type=$($result.ErrorType) message=$($result.ErrorMessage)" | Out-Null

    try {
        Write-PrepResult
    } catch {
        Write-AustenBackupLog -LogPath $logPath -Message "PREP RESULT WARNING message=$($_.Exception.Message)" | Out-Null
    }

    exit 1
} finally {
    if ($ownsMutex -and $null -ne $mutex) {
        $mutex.ReleaseMutex()
    }
    if ($null -ne $mutex) {
        $mutex.Dispose()
    }
}
