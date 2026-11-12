#requires -Version 7.0
#requires -RunAsAdministrator

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsSystem) {
    throw 'The protected backup task must run as LocalSystem.'
}

$installRoot = 'C:\ProgramData\AustenBackup'
$modulePath = Join-Path $installRoot 'Scripts\AustenBackup.Common.psm1'
Import-Module -Name $modulePath -Force

$computerName = $env:COMPUTERNAME
$localBackupContainer = 'F:\Automated Backups'
$localBackupRoot = Join-Path $localBackupContainer $computerName
$manifestRoot = Join-Path $localBackupRoot 'Manifests'
$repoPath = 'E:\tka-platform'
$runId = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logRoot = Join-Path $installRoot 'Logs'
$stateRoot = Join-Path $installRoot 'State'
$logPath = Join-Path $logRoot "backup-$runId.log"
$markerPath = Join-Path $stateRoot "snapshot-stage-$runId.json"
$vshadowVarsPath = Join-Path $stateRoot 'VShadowVars.cmd'
$vshadowPath = Join-Path $installRoot 'Bin\vshadow.exe'
$snapshotRunnerPath = Join-Path $installRoot 'Scripts\Run-AustenBackupSnapshotStage.cmd'
$copyResults = [System.Collections.Generic.List[object]]::new()
$result = [ordered]@{
    RunId = $runId
    StartedAt = (Get-Date).ToString('o')
    CompletedAt = $null
    PrepStage = $null
    SnapshotStage = $null
    CopyResults = @()
    CloudManifestFiles = $null
    ArchivedBundles = $null
    Passed = $false
    ErrorType = $null
    ErrorMessage = $null
}

function Assert-NoReparsePoint {
    param([Parameter(Mandatory)][string]$Path)

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Protected path is a reparse point: $Path"
    }
}

function Assert-NoReparsePointsInTree {
    param([Parameter(Mandatory)][string]$Path)

    Assert-NoReparsePoint -Path $Path
    $firstReparsePoint = Get-ChildItem `
        -LiteralPath $Path `
        -Recurse `
        -Force `
        -Attributes ReparsePoint `
        -ErrorAction Stop |
        Select-Object -First 1

    if ($null -ne $firstReparsePoint) {
        throw "Protected backup output contains a reparse point: $($firstReparsePoint.FullName)"
    }
}

function Remove-StaleShadowMounts {
    $staleMounts = @(
        Get-ChildItem -LiteralPath $stateRoot -Directory -Force -ErrorAction Stop |
            Where-Object { $_.Name -like 'ShadowMount-*' }
    )

    foreach ($mount in $staleMounts) {
        if ($mount.Name -notmatch '^ShadowMount-\d{4}-\d{2}-\d{2}_\d{6}$' -or
            -not ($mount.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw "Unexpected object occupies a protected shadow mount path: $($mount.FullName)"
        }

        $target = ([string]$mount.Target).TrimEnd('\')
        $validTargetPattern = '^(?:(?:\\\\\?\\)|(?:\\\?\?\\))?GLOBALROOT\\Device\\HarddiskVolumeShadowCopy\d+$'
        if ($target -notmatch $validTargetPattern) {
            throw "A protected shadow mount has an unexpected target: $($mount.FullName) -> $target"
        }

        Remove-Item -LiteralPath $mount.FullName -Force
        if (Test-Path -LiteralPath $mount.FullName) {
            throw "Unable to remove stale shadow mount: $($mount.FullName)"
        }
        Write-AustenBackupLog -LogPath $logPath -Message "STALE SHADOW MOUNT REMOVED path=$($mount.FullName)" | Out-Null
    }
}

function Assert-ReadOnlyForNonAdministrators {
    param([Parameter(Mandatory)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $trustedSids = @('S-1-5-18', 'S-1-5-32-544')
    $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value

    if ($trustedSids -notcontains $ownerSid) {
        throw "Protected path has an unexpected owner: $Path owner=$($acl.Owner)"
    }

    if (-not $acl.AreAccessRulesProtected) {
        throw "Protected path still inherits permissions: $Path"
    }

    $writeMask = [int64](
        [System.Security.AccessControl.FileSystemRights]::WriteData -bor
        [System.Security.AccessControl.FileSystemRights]::CreateDirectories -bor
        [System.Security.AccessControl.FileSystemRights]::AppendData -bor
        [System.Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
        [System.Security.AccessControl.FileSystemRights]::WriteAttributes -bor
        [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
        [System.Security.AccessControl.FileSystemRights]::Delete -bor
        [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [System.Security.AccessControl.FileSystemRights]::TakeOwnership
    )

    $rules = $acl.GetAccessRules(
        $true,
        $true,
        [System.Security.Principal.SecurityIdentifier]
    )
    foreach ($rule in $rules) {
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
            continue
        }

        $ruleSid = $rule.IdentityReference.Value
        if ($trustedSids -contains $ruleSid) {
            continue
        }

        $ruleMask = [int64]$rule.FileSystemRights -band 0xFFFFFFFFL
        if (($ruleMask -band $writeMask) -ne 0) {
            throw "Protected path grants write, delete, or ACL control to $($rule.IdentityReference): $Path"
        }
    }
}

function Write-ResultFiles {
    $result.CopyResults = @($copyResults)
    $result.CompletedAt = (Get-Date).ToString('o')
    $json = $result | ConvertTo-Json -Depth 10

    [System.IO.Directory]::CreateDirectory($manifestRoot) | Out-Null
    [System.IO.File]::WriteAllText(
        (Join-Path $manifestRoot "backup-result-$runId.json"),
        $json,
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $manifestRoot 'latest-backup-result.json'),
        $json,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Add-CopyResult {
    param([Parameter(Mandatory)][object]$CopyResult)
    $copyResults.Add($CopyResult)
}

# Each night's prep stages a ~7 GB Git bundle, and the append-only D: copy keeps
# every one on F:. Keep the newest $KeepNewest plus the newest of each month, and
# delete only the bundle file: the run's patch and untracked-file copies stay.
# Austen approved this rule on 2026-11-11.
function Remove-OldArchivedBundles {
    param(
        [Parameter(Mandatory)][string]$WorkingStateRoot,
        [int]$KeepNewest = 7
    )

    $summary = [ordered]@{ Kept = 0; Removed = 0; BytesRemoved = 0 }
    if (-not (Test-Path -LiteralPath $WorkingStateRoot -PathType Container)) {
        return $summary
    }

    $bundles = @(
        Get-ChildItem -LiteralPath $WorkingStateRoot -Directory -ErrorAction Stop |
            Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' } |
            Sort-Object Name -Descending |
            ForEach-Object {
                $bundle = Join-Path $_.FullName 'tka-platform.bundle'
                if (Test-Path -LiteralPath $bundle -PathType Leaf) {
                    [pscustomobject]@{ Run = $_.Name; Month = $_.Name.Substring(0, 7); Item = Get-Item -LiteralPath $bundle -Force }
                }
            }
    )

    $monthsKept = @{}
    for ($i = 0; $i -lt $bundles.Count; $i++) {
        $entry = $bundles[$i]
        $keep = $i -lt $KeepNewest -or -not $monthsKept.ContainsKey($entry.Month)
        $monthsKept[$entry.Month] = $true
        if ($keep) {
            $summary.Kept++
            continue
        }
        if ($entry.Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "An archived bundle is a reparse point: $($entry.Item.FullName)"
        }
        $bytes = $entry.Item.Length
        Remove-Item -LiteralPath $entry.Item.FullName -Force
        $summary.Removed++
        $summary.BytesRemoved += $bytes
        Write-AustenBackupLog -LogPath $logPath -Message "ARCHIVED BUNDLE REMOVED run=$($entry.Run) bytes=$bytes" | Out-Null
    }
    return $summary
}

$mutex = $null
$ownsMutex = $false

try {
    [System.IO.Directory]::CreateDirectory($logRoot) | Out-Null
    [System.IO.Directory]::CreateDirectory($stateRoot) | Out-Null
    [System.IO.Directory]::CreateDirectory($manifestRoot) | Out-Null

    $createdNew = $false
    $mutex = [System.Threading.Mutex]::new($true, 'Global\AustenProtectedBackup', [ref]$createdNew)
    if (-not $createdNew) {
        throw 'Another protected backup is already running.'
    }
    $ownsMutex = $true

    Write-AustenBackupLog -LogPath $logPath -Message 'BACKUP START' | Out-Null

    foreach ($requiredPath in @(
        'D:\',
        'E:\',
        'F:\',
        $installRoot,
        $vshadowPath,
        $snapshotRunnerPath,
        $localBackupContainer,
        $localBackupRoot
    )) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Required backup path is unavailable: $requiredPath"
        }
    }

    Assert-ReadOnlyForNonAdministrators -Path $installRoot
    Assert-ReadOnlyForNonAdministrators -Path $localBackupContainer
    Assert-ReadOnlyForNonAdministrators -Path $localBackupRoot
    Remove-StaleShadowMounts
    Assert-NoReparsePointsInTree -Path $installRoot
    Assert-NoReparsePointsInTree -Path $localBackupRoot

    foreach ($staleStatePath in @($markerPath, $vshadowVarsPath)) {
        if (Test-Path -LiteralPath $staleStatePath) {
            Remove-Item -LiteralPath $staleStatePath -Force
        }
    }

    $env:AUSTEN_BACKUP_RUN_ID = $runId
    $env:AUSTEN_BACKUP_LOG_FILE = $logPath

    Write-AustenBackupLog -LogPath $logPath -Message 'VSS START volume=C:' | Out-Null
    $vshadowArguments = @(
        "-script=$vshadowVarsPath",
        "-exec=$snapshotRunnerPath",
        'C:'
    )

    & $vshadowPath @vshadowArguments 2>&1 |
        ForEach-Object {
            Write-AustenBackupLog -LogPath $logPath -Message "VSHADOW $_" | Out-Null
        }
    $vshadowExitCode = $LASTEXITCODE

    if ($null -eq $vshadowExitCode -or $vshadowExitCode -ne 0) {
        throw "VShadow or the protected C: copy stage failed with exit code $vshadowExitCode."
    }

    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        throw 'The protected C: copy stage did not write its result marker.'
    }

    $snapshotResult = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if (-not $snapshotResult.Passed) {
        throw "The protected C: copy stage reported failure: $($snapshotResult.ErrorMessage)"
    }
    $result.SnapshotStage = $snapshotResult

    $shadowId = [string]$snapshotResult.ShadowId
    try {
        $remainingShadow = Get-CimInstance `
            -Namespace root/cimv2 `
            -ClassName Win32_ShadowCopy `
            -Filter "ID='$shadowId'" `
            -ErrorAction Stop
    } catch {
        throw "Unable to verify VSS cleanup for ${shadowId}: $($_.Exception.Message)"
    }
    if ($null -ne $remainingShadow) {
        throw "The nonpersistent C: shadow copy still exists after VShadow exited: $shadowId"
    }

    Write-AustenBackupLog -LogPath $logPath -Message "VSS COMPLETE shadow=$shadowId" | Out-Null
    Remove-Item -LiteralPath $markerPath -Force
    if (Test-Path -LiteralPath $vshadowVarsPath) {
        Remove-Item -LiteralPath $vshadowVarsPath -Force
    }

    $driveDExclusions = @(
        'D:\$RECYCLE.BIN',
        'D:\System Volume Information',
        'D:\.tmp.drivedownload',
        'D:\.tmp.driveupload',
        'D:\PICTURES2\iCloud Photos'
    )

    Add-CopyResult (Invoke-AustenRobocopy `
        -Source 'D:\' `
        -Destination (Join-Path $localBackupRoot 'D') `
        -LogPath $logPath `
        -ExcludeDirectories $driveDExclusions)

    $protectedPrepResultPath = Join-Path $localBackupRoot "D\_DOCUMENTS\Computer Backup\$computerName\latest-backup-prep.json"
    if (-not (Test-Path -LiteralPath $protectedPrepResultPath -PathType Leaf)) {
        throw 'The protected D: copy is missing the latest cloud and Git preparation result.'
    }

    $protectedPrepResultItem = Get-Item -LiteralPath $protectedPrepResultPath -Force -ErrorAction Stop
    if (($protectedPrepResultItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
        ($protectedPrepResultItem.Attributes -band [System.IO.FileAttributes]::Offline)) {
        throw "The protected preparation result is not a regular local file: $protectedPrepResultPath"
    }

    $prepResult = Get-Content -LiteralPath $protectedPrepResultPath -Raw -ErrorAction Stop | ConvertFrom-Json
    if (-not [bool]$prepResult.Passed) {
        throw "The latest cloud and Git preparation failed: $($prepResult.ErrorMessage)"
    }

    $prepCompletedAt = [datetimeoffset]::Parse(
        [string]$prepResult.CompletedAt,
        [System.Globalization.CultureInfo]::InvariantCulture
    )
    $prepAge = [datetimeoffset]::Now - $prepCompletedAt
    if ($prepAge.TotalMinutes -lt -5 -or $prepAge.TotalHours -gt 12) {
        throw "The latest cloud and Git preparation is not recent enough: $prepCompletedAt"
    }
    $result.PrepStage = [ordered]@{
        RunId = $prepResult.RunId
        CompletedAt = $prepResult.CompletedAt
        ICloudManifestFiles = $prepResult.ICloudManifestFiles
        CrossDeviceManifestFiles = $prepResult.CrossDeviceManifestFiles
        Passed = $true
    }

    # Only after tonight's D: copy and prep result are confirmed, so the newest
    # bundle is already on F: before any older one goes.
    $result.ArchivedBundles = Remove-OldArchivedBundles `
        -WorkingStateRoot (Join-Path $localBackupRoot "D\_DOCUMENTS\Computer Backup\$computerName\Development\TKA Working State")

    $protectedCloudManifestRoot = Join-Path $localBackupRoot "D\_DOCUMENTS\Computer Backup\$computerName\Manifests"
    $cloudManifestCounts = [ordered]@{}
    foreach ($manifestName in @('icloud-photos-placeholders.csv', 'cross-device-placeholders.csv')) {
        $protectedSource = Join-Path $protectedCloudManifestRoot $manifestName
        if (-not (Test-Path -LiteralPath $protectedSource -PathType Leaf)) {
            throw "The protected D: copy is missing provider manifest $manifestName."
        }

        $protectedSourceItem = Get-Item -LiteralPath $protectedSource -Force -ErrorAction Stop
        if (($protectedSourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            ($protectedSourceItem.Attributes -band [System.IO.FileAttributes]::Offline)) {
            throw "A provider manifest is not a regular local file: $protectedSource"
        }

        $manifestRows = @(Import-Csv -LiteralPath $protectedSource -ErrorAction Stop)
        if ($manifestRows.Count -eq 0) {
            throw "A provider manifest is empty: $protectedSource"
        }

        Copy-Item -LiteralPath $protectedSource -Destination (Join-Path $manifestRoot $manifestName) -Force
        $cloudManifestCounts[$manifestName] = $manifestRows.Count
    }
    $result.CloudManifestFiles = $cloudManifestCounts
    Write-AustenBackupLog `
        -LogPath $logPath `
        -Message "PROVIDER MANIFESTS PROTECTED icloud=$($cloudManifestCounts['icloud-photos-placeholders.csv']) crossdevice=$($cloudManifestCounts['cross-device-placeholders.csv'])" |
        Out-Null

    Add-CopyResult (Invoke-AustenRobocopy `
        -Source 'E:\launchers' `
        -Destination (Join-Path $localBackupRoot 'E\launchers') `
        -LogPath $logPath `
        -Optional)

    $repoExclusions = @(
        'node_modules',
        '.svelte-kit',
        '.claude-tmp',
        '.wrangler',
        '.perf-traces',
        '.ios-builds',
        '.tmp',
        '.fast-check',
        '.screenshots',
        '.gradle',
        '.turbo',
        '.vite',
        'build',
        'dist',
        'coverage',
        'target',
        'DerivedData'
    )

    Add-CopyResult (Invoke-AustenRobocopy `
        -Source $repoPath `
        -Destination (Join-Path $localBackupRoot 'E\tka-platform') `
        -LogPath $logPath `
        -ExcludeDirectories $repoExclusions `
        -AllowSourceDrift)

    $result.Passed = $true
    Write-AustenBackupLog -LogPath $logPath -Message 'BACKUP COMPLETE' | Out-Null
    Write-ResultFiles
    Copy-Item -LiteralPath $logPath -Destination (Join-Path $localBackupRoot 'latest-backup.log') -Force
    exit 0
} catch {
    $result.Passed = $false
    $result.ErrorType = $_.Exception.GetType().FullName
    $result.ErrorMessage = $_.Exception.Message
    Write-AustenBackupLog -LogPath $logPath -Message "BACKUP FAILED type=$($result.ErrorType) message=$($result.ErrorMessage)" | Out-Null

    try {
        if (Test-Path -LiteralPath $localBackupRoot -PathType Container) {
            Write-ResultFiles
            Copy-Item -LiteralPath $logPath -Destination (Join-Path $localBackupRoot 'latest-backup.log') -Force
        }
    } catch {
        Write-AustenBackupLog -LogPath $logPath -Message "FAILURE RECORD WARNING message=$($_.Exception.Message)" | Out-Null
    }

    exit 1
} finally {
    Remove-Item Env:AUSTEN_BACKUP_RUN_ID -ErrorAction SilentlyContinue
    Remove-Item Env:AUSTEN_BACKUP_LOG_FILE -ErrorAction SilentlyContinue

    if ($ownsMutex -and $null -ne $mutex) {
        $mutex.ReleaseMutex()
    }
    if ($null -ne $mutex) {
        $mutex.Dispose()
    }
}
