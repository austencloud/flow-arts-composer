Set-StrictMode -Version Latest

function Write-AustenBackupLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LogPath,

        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Message
    )

    $logDirectory = Split-Path -Parent $LogPath
    [System.IO.Directory]::CreateDirectory($logDirectory) | Out-Null

    $line = '{0:o} {1}' -f (Get-Date), $Message
    [System.IO.File]::AppendAllText(
        $LogPath,
        "$line`r`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    $line
}

function Get-AustenBackupFileFingerprint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $shareMode = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $stream = [System.IO.File]::Open(
        $Path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        $shareMode
    )
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $sha256.ComputeHash($stream)
        } finally {
            $sha256.Dispose()
        }

        [pscustomobject]@{
            Length = $stream.Length
            SHA256 = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '')
        }
    } finally {
        $stream.Dispose()
    }
}

function Assert-AustenRobocopyContentEquivalent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Source,

        [Parameter(Mandatory)]
        [string]$Destination,

        [Parameter(Mandatory)]
        [string]$DisplaySource,

        [Parameter(Mandatory)]
        [string]$LogPath,

        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [AllowEmptyString()]
        [string[]]$RobocopyOutput
    )

    $sourceRoot = [System.IO.Path]::GetFullPath($Source).TrimEnd('\')
    $sourcePrefix = "$sourceRoot\"
    $differencePattern = '^\s*(?<Status>New File|New Dir|Newer|Older|Changed|Tweaked|Modified)\s+(?:\d+)\s+(?<Path>[A-Za-z]:\\.+?)\s*$'
    $differences = @(
        foreach ($line in $RobocopyOutput) {
            if ($line -match $differencePattern) {
                [pscustomobject]@{
                    Status = $Matches.Status
                    Path = $Matches.Path
                }
            }
        }
    )

    if ($differences.Count -eq 0) {
        throw "Robocopy reported source differences for $DisplaySource, but no difference records could be parsed."
    }

    $verifiedFileCount = 0
    $verifiedDirectoryCount = 0
    $verifiedBytes = [long]0
    foreach ($difference in $differences) {
        $reportedPath = [System.IO.Path]::GetFullPath($difference.Path).TrimEnd('\')
        if ($reportedPath.Equals($sourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relativePath = ''
        } elseif ($reportedPath.StartsWith($sourcePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relativePath = $reportedPath.Substring($sourcePrefix.Length)
        } else {
            throw "Robocopy reported a path outside the expected source root: $($difference.Path)"
        }

        $destinationPath = if ([string]::IsNullOrEmpty($relativePath)) {
            $Destination
        } else {
            Join-Path $Destination $relativePath
        }

        if (Test-Path -LiteralPath $reportedPath -PathType Container) {
            if (-not (Test-Path -LiteralPath $destinationPath -PathType Container)) {
                throw "The backup is missing source directory: $relativePath"
            }
            $verifiedDirectoryCount++
            continue
        }

        if (-not (Test-Path -LiteralPath $reportedPath -PathType Leaf)) {
            throw "Robocopy reported a source item that cannot be verified: $relativePath"
        }
        if (-not (Test-Path -LiteralPath $destinationPath -PathType Leaf)) {
            throw "The backup is missing source file: $relativePath"
        }

        $sourceFingerprint = Get-AustenBackupFileFingerprint -Path $reportedPath
        $destinationFingerprint = Get-AustenBackupFileFingerprint -Path $destinationPath
        if ($sourceFingerprint.Length -ne $destinationFingerprint.Length -or
            $sourceFingerprint.SHA256 -ne $destinationFingerprint.SHA256) {
            throw "The backup content differs for source file: $relativePath"
        }

        $verifiedFileCount++
        $verifiedBytes += $sourceFingerprint.Length
    }

    Write-AustenBackupLog `
        -LogPath $LogPath `
        -Message "VERIFY CONTENT_EQUIVALENT source=$DisplaySource files=$verifiedFileCount directories=$verifiedDirectoryCount bytes=$verifiedBytes" |
        Out-Null

    [pscustomobject]@{
        FileCount = $verifiedFileCount
        DirectoryCount = $verifiedDirectoryCount
        Bytes = $verifiedBytes
    }
}

function Invoke-AustenRobocopy {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Source,

        [Parameter(Mandatory)]
        [string]$Destination,

        [Parameter(Mandatory)]
        [string]$LogPath,

        [string]$DisplaySource = $Source,

        [string[]]$ExcludeDirectories = @(),

        [switch]$Optional,

        [switch]$AllowSourceDrift,

        [switch]$SkipVerification
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        if ($Optional) {
            Write-AustenBackupLog -LogPath $LogPath -Message "COPY SKIP missing source=$DisplaySource" | Out-Null
            return [pscustomobject]@{
                Source = $DisplaySource
                Destination = $Destination
                Skipped = $true
                CopyExitCode = $null
                VerificationExitCode = $null
                VerificationPassed = $null
                VerificationAttempts = 0
                ReconciliationExitCode = $null
                ContentEquivalentExceptions = 0
            }
        }

        throw "Required backup source does not exist: $DisplaySource"
    }

    $sourceItem = Get-Item -LiteralPath $Source -Force -ErrorAction Stop
    if ($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Backup source root is a reparse point: $DisplaySource"
    }

    [System.IO.Directory]::CreateDirectory($Destination) | Out-Null

    $baseArguments = @(
        $Source,
        $Destination,
        '/E',
        '/COPY:DAT',
        '/DCOPY:DAT',
        '/XJ',
        # /XJ skips junctions and symbolic links but not AF_UNIX socket files, which
        # are reparse points too (Docker's engine.sock under the Claude app). One in
        # the archive makes the next run's reparse-point guard fail. Found 2026-10-26.
        '/XF',
        '*.sock',
        '/XA:O',
        '/NP',
        '/NFL',
        '/NDL'
    )

    if ($ExcludeDirectories.Count -gt 0) {
        $baseArguments += '/XD'
        $baseArguments += $ExcludeDirectories
    }

    $copyArguments = @($baseArguments) + @(
        '/R:2',
        '/W:3',
        '/MT:16',
        "/LOG+:$LogPath"
    )

    Write-AustenBackupLog -LogPath $LogPath -Message "COPY START source=$DisplaySource destination=$Destination" | Out-Null
    & "$env:SystemRoot\System32\robocopy.exe" @copyArguments | Out-Null
    $copyExitCode = $LASTEXITCODE

    if ($null -eq $copyExitCode -or $copyExitCode -ge 8) {
        throw "Robocopy failed with exit code $copyExitCode for $DisplaySource"
    }

    Write-AustenBackupLog -LogPath $LogPath -Message "COPY OK exit=$copyExitCode source=$DisplaySource" | Out-Null

    $verificationExitCode = $null
    $verificationPassed = $null
    $verificationAttempts = 0
    $reconciliationExitCode = $null
    $contentEquivalentExceptions = 0

    if (-not $SkipVerification) {
        $verificationBaseArguments = @(
            $baseArguments | Where-Object { $_ -ne '/NFL' }
        )
        $verifyArguments = @($verificationBaseArguments) + @(
            '/L',
            '/XX',
            '/BYTES',
            '/FP',
            '/NJH',
            '/NJS',
            '/TEE',
            '/R:0',
            '/W:0',
            "/LOG+:$LogPath"
        )

        Write-AustenBackupLog -LogPath $LogPath -Message "VERIFY START source=$DisplaySource destination=$Destination" | Out-Null
        $verificationOutput = @(& "$env:SystemRoot\System32\robocopy.exe" @verifyArguments)
        $verificationExitCode = $LASTEXITCODE
        $verificationAttempts++

        if ($null -eq $verificationExitCode) {
            throw "Robocopy verification did not return an exit code for $DisplaySource"
        }

        # In list-only mode, bit 1 means a source file is missing or different at
        # the destination. Bit 2 means destination-only extras, which this
        # append-only backup intentionally permits. Source drift may explain bit
        # 1 for the live repository, but it must never hide mismatch or failure
        # bits.
        $hardFailureMask = 4 -bor 8 -bor 16
        if (($verificationExitCode -band $hardFailureMask) -ne 0) {
            throw "Robocopy verification reported a mismatch or failure for $DisplaySource (exit $verificationExitCode)."
        }

        $verificationPassed = ($verificationExitCode -band 1) -eq 0
        if (-not $verificationPassed -and -not $AllowSourceDrift) {
            Write-AustenBackupLog -LogPath $LogPath -Message "RECONCILE START source=$DisplaySource" | Out-Null
            & "$env:SystemRoot\System32\robocopy.exe" @copyArguments | Out-Null
            $reconciliationExitCode = $LASTEXITCODE
            if ($null -eq $reconciliationExitCode -or $reconciliationExitCode -ge 8) {
                throw "Robocopy reconciliation failed with exit code $reconciliationExitCode for $DisplaySource"
            }

            Write-AustenBackupLog -LogPath $LogPath -Message "RECONCILE OK exit=$reconciliationExitCode source=$DisplaySource" | Out-Null
            Write-AustenBackupLog -LogPath $LogPath -Message "VERIFY RETRY source=$DisplaySource destination=$Destination" | Out-Null
            $verificationOutput = @(& "$env:SystemRoot\System32\robocopy.exe" @verifyArguments)
            $verificationExitCode = $LASTEXITCODE
            $verificationAttempts++

            if ($null -eq $verificationExitCode) {
                throw "Robocopy verification retry did not return an exit code for $DisplaySource"
            }
            if (($verificationExitCode -band $hardFailureMask) -ne 0) {
                throw "Robocopy verification retry reported a mismatch or failure for $DisplaySource (exit $verificationExitCode)."
            }
            $verificationPassed = ($verificationExitCode -band 1) -eq 0
        }

        if (-not $verificationPassed -and -not $AllowSourceDrift) {
            $contentVerification = Assert-AustenRobocopyContentEquivalent `
                -Source $Source `
                -Destination $Destination `
                -DisplaySource $DisplaySource `
                -LogPath $LogPath `
                -RobocopyOutput $verificationOutput
            $contentEquivalentExceptions = $contentVerification.FileCount + $contentVerification.DirectoryCount
            $verificationPassed = $true
        }

        $status = if ($verificationPassed) { 'OK' } else { 'SOURCE_DRIFT' }
        Write-AustenBackupLog -LogPath $LogPath -Message "VERIFY $status exit=$verificationExitCode source=$DisplaySource" | Out-Null
    }

    [pscustomobject]@{
        Source = $DisplaySource
        Destination = $Destination
        Skipped = $false
        CopyExitCode = $copyExitCode
        VerificationExitCode = $verificationExitCode
        VerificationPassed = $verificationPassed
        VerificationAttempts = $verificationAttempts
        ReconciliationExitCode = $reconciliationExitCode
        ContentEquivalentExceptions = $contentEquivalentExceptions
    }
}

function ConvertTo-AustenShadowPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LivePath,

        [Parameter(Mandatory)]
        [string]$ShadowRoot
    )

    $normalizedRoot = $ShadowRoot.TrimEnd('\')
    if ($LivePath.Equals('C:\', [System.StringComparison]::OrdinalIgnoreCase)) {
        return "$normalizedRoot\"
    }

    if (-not $LivePath.StartsWith('C:\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Only absolute C: paths can be mapped to the C: shadow copy: $LivePath"
    }

    "$normalizedRoot\$($LivePath.Substring(3))"
}

Export-ModuleMember -Function @(
    'Write-AustenBackupLog',
    'Get-AustenBackupFileFingerprint',
    'Invoke-AustenRobocopy',
    'ConvertTo-AustenShadowPath'
)
