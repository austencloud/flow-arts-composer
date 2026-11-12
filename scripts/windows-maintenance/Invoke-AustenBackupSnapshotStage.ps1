#requires -Version 7.0

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsSystem) {
    throw 'The snapshot copy stage must run as LocalSystem.'
}

$installRoot = 'C:\ProgramData\AustenBackup'
$modulePath = Join-Path $installRoot 'Scripts\AustenBackup.Common.psm1'
Import-Module -Name $modulePath -Force

$runId = [string]$env:AUSTEN_BACKUP_RUN_ID
if ($runId -notmatch '^\d{4}-\d{2}-\d{2}_\d{6}$') {
    throw 'The backup run identifier is missing or invalid.'
}

$expectedLogPath = Join-Path $installRoot "Logs\backup-$runId.log"
$logPath = [string]$env:AUSTEN_BACKUP_LOG_FILE
if (-not $logPath.Equals($expectedLogPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The snapshot stage received an unexpected log path.'
}

$shadowRoot = ([string]$env:SHADOW_DEVICE_1).TrimEnd('\')
if ($shadowRoot -notmatch '^\\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy\d+$') {
    throw 'VShadow did not provide a valid C: shadow device path.'
}

$shadowId = [string]$env:SHADOW_ID_1
$parsedShadowId = [guid]::Empty
if (-not [guid]::TryParse($shadowId, [ref]$parsedShadowId)) {
    throw 'VShadow did not provide a valid shadow copy identifier.'
}

$computerName = $env:COMPUTERNAME
$localBackupRoot = "F:\Automated Backups\$computerName"
$manifestRoot = Join-Path $localBackupRoot 'Manifests'
$markerPath = Join-Path $installRoot "State\snapshot-stage-$runId.json"
$shadowMountPath = Join-Path $installRoot "State\ShadowMount-$runId"
$copyResults = [System.Collections.Generic.List[object]]::new()
$shadowMountCreated = $false

function Add-CopyResult {
    param([Parameter(Mandatory)][object]$Result)
    $copyResults.Add($Result)
}

function Get-ShadowPath {
    param([Parameter(Mandatory)][string]$LivePath)
    ConvertTo-AustenShadowPath -LivePath $LivePath -ShadowRoot $shadowMountPath
}

function ConvertTo-CanonicalShadowDevice {
    param([Parameter(Mandatory)][string]$Value)

    $canonical = $Value.TrimEnd('\') -replace '^(?:\\\\\?\\|\\\?\?\\)', ''
    if ($canonical -notmatch '^GLOBALROOT\\Device\\HarddiskVolumeShadowCopy\d+$') {
        throw "Invalid shadow device representation: $Value"
    }
    $canonical
}

function Get-ShadowMountProbeFile {
    # The probe works best on a file that changes often on the live volume:
    # if the mount ever resolved to live C: instead of the snapshot, the two
    # reads would differ. Agent transcripts are written all day, but either
    # agent can sit unused for weeks, and Codex now stores its sessions as
    # .jsonl.zst. Requiring one Codex .jsonl failed every night from
    # 2026-11-04. Take the newest transcript from either agent, and fall back
    # to the registry hive, which every profile snapshot contains.
    $candidateRoots = @(
        @{ LivePath = 'C:\Users\Austen\.claude\projects'; Filter = '*.jsonl'; Depth = 1 },
        @{ LivePath = 'C:\Users\Austen\.codex\sessions'; Filter = '*'; Depth = 3 },
        @{ LivePath = 'C:\Users\Austen\.codex\archived_sessions'; Filter = '*'; Depth = 0 }
    )
    $candidates = foreach ($candidateRoot in $candidateRoots) {
        $rawRoot = ConvertTo-AustenShadowPath -LivePath $candidateRoot.LivePath -ShadowRoot $shadowRoot
        if ([System.IO.Directory]::Exists($rawRoot)) {
            Get-ChildItem `
                -LiteralPath $rawRoot `
                -File `
                -Filter $candidateRoot.Filter `
                -Recurse `
                -Depth $candidateRoot.Depth `
                -Force `
                -ErrorAction Stop
        }
    }
    $probe = $candidates |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($null -eq $probe) {
        $hivePath = ConvertTo-AustenShadowPath -LivePath 'C:\Users\Austen\NTUSER.DAT' -ShadowRoot $shadowRoot
        $probe = Get-Item -LiteralPath $hivePath -Force -ErrorAction Stop
    }
    $probe
}

function Assert-ShadowMountMatchesDevice {
    $probe = Get-ShadowMountProbeFile
    $rawPrefix = "$shadowRoot\"
    if (-not $probe.FullName.StartsWith($rawPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The shadow mount probe is outside the raw VSS device: $($probe.FullName)"
    }

    $relativePath = $probe.FullName.Substring($rawPrefix.Length)
    $mountedProbePath = Join-Path $shadowMountPath $relativePath
    $samples = for ($attempt = 1; $attempt -le 2; $attempt++) {
        $rawItem = Get-Item -LiteralPath $probe.FullName -Force -ErrorAction Stop
        $mountedItem = Get-Item -LiteralPath $mountedProbePath -Force -ErrorAction Stop
        [pscustomobject]@{
            Attempt = $attempt
            RawLength = $rawItem.Length
            MountedLength = $mountedItem.Length
            RawSHA256 = (Get-FileHash -LiteralPath $probe.FullName -Algorithm SHA256).Hash
            MountedSHA256 = (Get-FileHash -LiteralPath $mountedProbePath -Algorithm SHA256).Hash
        }
        if ($attempt -eq 1) {
            Start-Sleep -Milliseconds 750
        }
    }

    foreach ($sample in $samples) {
        if ($sample.RawLength -ne $sample.MountedLength -or
            $sample.RawSHA256 -ne $sample.MountedSHA256) {
            throw "The local shadow mount does not match the raw VSS device for $relativePath."
        }
    }
    if ($samples[0].RawLength -ne $samples[1].RawLength -or
        $samples[0].RawSHA256 -ne $samples[1].RawSHA256) {
        throw "The raw VSS device changed during the integrity probe for $relativePath."
    }

    Write-AustenBackupLog `
        -LogPath $logPath `
        -Message "SHADOW MOUNT VERIFIED probe=$relativePath bytes=$($samples[0].RawLength) sha256=$($samples[0].RawSHA256)" |
        Out-Null
}

try {
    Write-AustenBackupLog -LogPath $logPath -Message "SNAPSHOT STAGE START shadow=$parsedShadowId" | Out-Null

    if (Test-Path -LiteralPath $shadowMountPath) {
        throw "The protected shadow mount path already exists: $shadowMountPath"
    }

    & "$env:SystemRoot\System32\cmd.exe" /d /c mklink /d $shadowMountPath "$shadowRoot\" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to create the protected shadow mount. mklink exit code: $LASTEXITCODE"
    }
    $shadowMountCreated = $true

    $shadowMountItem = Get-Item -LiteralPath $shadowMountPath -Force -ErrorAction Stop
    if (-not ($shadowMountItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "The protected shadow mount is not a reparse point: $shadowMountPath"
    }
    $mountedTarget = ConvertTo-CanonicalShadowDevice -Value ([string]$shadowMountItem.Target)
    $expectedTarget = ConvertTo-CanonicalShadowDevice -Value $shadowRoot
    if (-not $mountedTarget.Equals($expectedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The protected shadow mount target is unexpected: $mountedTarget"
    }
    Assert-ShadowMountMatchesDevice

    foreach ($requiredPath in @($localBackupRoot, $manifestRoot)) {
        [System.IO.Directory]::CreateDirectory($requiredPath) | Out-Null
    }

    $personalFolders = @('Desktop', 'Documents', 'Videos', 'Saved Games')
    foreach ($folder in $personalFolders) {
        $liveSource = Join-Path 'C:\Users\Austen' $folder
        $shadowSource = Get-ShadowPath -LivePath $liveSource
        $destination = Join-Path $localBackupRoot "C\User\Austen\$folder"

        Add-CopyResult (Invoke-AustenRobocopy `
            -Source $shadowSource `
            -DisplaySource $liveSource `
            -Destination $destination `
            -LogPath $logPath `
            -Optional)
    }

    $profileExclusions = @(
        'C:\Users\Austen\AppData',
        'C:\Users\Austen\CrossDevice',
        'C:\Users\Austen\Desktop',
        'C:\Users\Austen\Documents',
        'C:\Users\Austen\Videos',
        'C:\Users\Austen\Saved Games',
        'C:\Users\Austen\.cache',
        'C:\Users\Austen\.anaconda',
        'C:\Users\Austen\.bun',
        'C:\Users\Austen\.cargo',
        'C:\Users\Austen\.conda',
        'C:\Users\Austen\.gradle',
        'C:\Users\Austen\.jdk',
        'C:\Users\Austen\.ollama',
        'C:\Users\Austen\.rustup',
        'C:\Users\Austen\.thumbnails',
        'C:\Users\Austen\.vscode-server',
        'C:\Users\Austen\ffmpeg',
        'C:\Users\Austen\jdks',
        'C:\Users\Austen\miniconda3',
        'C:\Users\Austen\My Drive',
        'C:\Users\Austen\npm-cache',
        'C:\Users\Austen\platform-tools',
        'C:\Users\Austen\Qwen3-TTS-Openai-Fastapi',
        'C:\Users\Austen\scoop',
        'C:\Users\Austen\tka-android-build',
        'node_modules',
        '.svelte-kit',
        '.wrangler',
        'build',
        'coverage',
        'dist',
        'target'
    )

    $shadowProfileExclusions = @(
        $profileExclusions | ForEach-Object {
            if ($_.StartsWith('C:\', [System.StringComparison]::OrdinalIgnoreCase)) {
                Get-ShadowPath -LivePath $_
            } else {
                $_
            }
        }
    )

    $shadowProfile = Get-ShadowPath -LivePath 'C:\Users\Austen'
    $profileDestination = Join-Path $localBackupRoot 'C\User\Austen'
    Add-CopyResult (Invoke-AustenRobocopy `
        -Source $shadowProfile `
        -DisplaySource 'C:\Users\Austen' `
        -Destination $profileDestination `
        -LogPath $logPath `
        -ExcludeDirectories $shadowProfileExclusions)

    $agentStateMappings = @(
        @{ Source = 'C:\Users\Austen\AppData\Local\AgentHub'; Destination = 'C\User\Austen\AppData\Local\AgentHub' },
        @{ Source = 'C:\Users\Austen\AppData\Local\Claude'; Destination = 'C\User\Austen\AppData\Local\Claude' },
        @{ Source = 'C:\Users\Austen\AppData\Local\OpenAI'; Destination = 'C\User\Austen\AppData\Local\OpenAI' },
        @{ Source = 'C:\Users\Austen\AppData\Local\Packages\Claude_pzs8sxrjxfjjc'; Destination = 'C\User\Austen\AppData\Local\Packages\Claude_pzs8sxrjxfjjc' },
        @{ Source = 'C:\Users\Austen\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0'; Destination = 'C\User\Austen\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0' },
        @{ Source = 'C:\Users\Austen\AppData\Local\com.tkaflowarts.composer.desktop'; Destination = 'C\User\Austen\AppData\Local\com.tkaflowarts.composer.desktop' },
        @{ Source = 'C:\Users\Austen\AppData\Local\TKA\codex-tka\bin'; Destination = 'C\User\Austen\AppData\Local\TKA\codex-tka\bin' },
        @{ Source = 'C:\Users\Austen\AppData\Local\TKA\claude-rename'; Destination = 'C\User\Austen\AppData\Local\TKA\claude-rename' },
        @{ Source = 'C:\Users\Austen\AppData\Local\TKA\logs'; Destination = 'C\User\Austen\AppData\Local\TKA\logs' },
        @{ Source = 'C:\Users\Austen\AppData\Local\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState'; Destination = 'C\User\Austen\AppData\Local\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState' },
        @{ Source = 'C:\Users\Austen\AppData\Roaming\Claude'; Destination = 'C\User\Austen\AppData\Roaming\Claude' },
        @{ Source = 'C:\Users\Austen\AppData\Roaming\Claude Code'; Destination = 'C\User\Austen\AppData\Roaming\Claude Code' },
        @{ Source = 'C:\Users\Austen\AppData\Roaming\Code\User'; Destination = 'C\User\Austen\AppData\Roaming\Code\User' },
        @{ Source = 'C:\Users\Austen\AppData\Roaming\com.tkaflowarts.composer.desktop'; Destination = 'C\User\Austen\AppData\Roaming\com.tkaflowarts.composer.desktop' }
    )

    foreach ($mapping in $agentStateMappings) {
        Add-CopyResult (Invoke-AustenRobocopy `
            -Source (Get-ShadowPath -LivePath $mapping.Source) `
            -DisplaySource $mapping.Source `
            -Destination (Join-Path $localBackupRoot $mapping.Destination) `
            -LogPath $logPath `
            -Optional)
    }

    $hiveFiles = @(
        Get-ChildItem -LiteralPath $shadowProfile -File -Force -ErrorAction Stop |
            Where-Object { $_.Name -ieq 'NTUSER.DAT' -or $_.Name -like 'ntuser.dat.LOG*' }
    )

    if (@($hiveFiles | Where-Object { $_.Name -ieq 'NTUSER.DAT' }).Count -ne 1) {
        throw 'The C: snapshot does not contain exactly one NTUSER.DAT file.'
    }

    $hiveChecks = foreach ($sourceFile in $hiveFiles) {
        $destinationFile = Join-Path $profileDestination $sourceFile.Name

        # Registry hive contents can change without a size or timestamp change
        # that Robocopy considers actionable. Always refresh these files from
        # the immutable snapshot before performing a byte-level verification.
        Copy-Item `
            -LiteralPath $sourceFile.FullName `
            -Destination $destinationFile `
            -Force `
            -ErrorAction Stop

        $sourceFingerprint = Get-AustenBackupFileFingerprint -Path $sourceFile.FullName
        $destinationFingerprint = Get-AustenBackupFileFingerprint -Path $destinationFile
        $passed = $sourceFingerprint.Length -eq $destinationFingerprint.Length -and
            $sourceFingerprint.SHA256 -eq $destinationFingerprint.SHA256
        if (-not $passed) {
            throw "The profile hive verification failed for $($sourceFile.Name)."
        }

        Write-AustenBackupLog `
            -LogPath $logPath `
            -Message "HIVE VERIFIED name=$($sourceFile.Name) bytes=$($sourceFingerprint.Length) sha256=$($sourceFingerprint.SHA256)" |
            Out-Null

        [pscustomobject]@{
            Name = $sourceFile.Name
            Length = $sourceFingerprint.Length
            SHA256 = $sourceFingerprint.SHA256
            Passed = $passed
        }
    }

    $result = [ordered]@{
        RunId = $runId
        Timestamp = (Get-Date).ToString('o')
        ShadowId = $parsedShadowId.ToString('B')
        ShadowDevice = $shadowRoot
        CopyResults = @($copyResults)
        HiveChecks = @($hiveChecks)
        Passed = $true
    }

    $json = $result | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($markerPath, $json, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText(
        (Join-Path $manifestRoot "profile-snapshot-$runId.json"),
        $json,
        [System.Text.UTF8Encoding]::new($false)
    )

    $mountForCleanup = Get-Item -LiteralPath $shadowMountPath -Force -ErrorAction Stop
    if (-not ($mountForCleanup.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "Refusing to remove a non-reparse shadow mount path: $shadowMountPath"
    }
    Remove-Item -LiteralPath $shadowMountPath -Force
    if (Test-Path -LiteralPath $shadowMountPath) {
        throw "The protected shadow mount was not removed: $shadowMountPath"
    }
    $shadowMountCreated = $false

    Write-AustenBackupLog -LogPath $logPath -Message "SNAPSHOT STAGE COMPLETE shadow=$parsedShadowId mountRemoved=true" | Out-Null
    exit 0
} catch {
    $stageError = $_
    if ($shadowMountCreated -and (Test-Path -LiteralPath $shadowMountPath)) {
        try {
            $mountForCleanup = Get-Item -LiteralPath $shadowMountPath -Force -ErrorAction Stop
            if (-not ($mountForCleanup.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
                throw "Refusing to remove a non-reparse shadow mount path: $shadowMountPath"
            }
            Remove-Item -LiteralPath $shadowMountPath -Force
            if (Test-Path -LiteralPath $shadowMountPath) {
                throw "The protected shadow mount was not removed: $shadowMountPath"
            }
            $shadowMountCreated = $false
        } catch {
            Write-AustenBackupLog -LogPath $logPath -Message "SHADOW MOUNT CLEANUP FAILED path=$shadowMountPath message=$($_.Exception.Message)" | Out-Null
        }
    }

    $failure = [ordered]@{
        RunId = $runId
        Timestamp = (Get-Date).ToString('o')
        ShadowId = $parsedShadowId.ToString('B')
        ErrorType = $stageError.Exception.GetType().FullName
        ErrorMessage = $stageError.Exception.Message
        Passed = $false
    }
    [System.IO.File]::WriteAllText(
        $markerPath,
        ($failure | ConvertTo-Json -Depth 5),
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-AustenBackupLog -LogPath $logPath -Message "SNAPSHOT STAGE FAILED type=$($failure.ErrorType) message=$($failure.ErrorMessage)" | Out-Null
    exit 1
}
