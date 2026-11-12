#requires -Version 7.0

[CmdletBinding()]
param(
    # Return once the protected task has started, without waiting for its result.
    [switch]$NoWait
)

$ErrorActionPreference = 'Stop'

$prepScript = 'C:\ProgramData\AustenBackup\Scripts\Invoke-AustenBackupPrep.ps1'
$pwshPath = 'C:\Program Files\PowerShell\7\pwsh.exe'
$windowsPowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskName = 'Austen Daily Backup'
$logRoot = 'C:\ProgramData\AustenBackup\Logs'
$prepLogRoot = 'C:\Users\Austen\Documents\PC Maintenance\Logs'

# The user task is stopped after 3 hours. Successful runs take 20 to 40 minutes.
$verdictTimeout = New-TimeSpan -Hours 2 -Minutes 30
$staleAfter = New-TimeSpan -Hours 36

# The protected task runs as SYSTEM and cannot reach the desktop, so this
# script is the only part of the backup that can tell Austen about a failed
# night. Before it did, eleven nights in a row failed unnoticed (2026-10-29 to
# 2026-11-09). The toast uses the reminder scenario so it stays on screen until
# dismissed, and one tag so a newer alert replaces the older one.
function Show-BackupAlert {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$Body
    )

    try {
        $escapedTitle = [System.Security.SecurityElement]::Escape($Title)
        $escapedBody = [System.Security.SecurityElement]::Escape($Body)
        $xml = "<toast scenario=`"reminder`"><visual><binding template=`"ToastGeneric`"><text>$escapedTitle</text><text>$escapedBody</text></binding></visual><actions><action content=`"Dismiss`" arguments=`"dismiss`" activationType=`"system`"/></actions></toast>"
        $xmlBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($xml))
        $toastScript = @(
            "`$ErrorActionPreference = 'Stop'"
            "`$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]"
            "`$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]"
            "`$document = [Windows.Data.Xml.Dom.XmlDocument]::new()"
            "`$document.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$xmlBase64')))"
            "`$toast = [Windows.UI.Notifications.ToastNotification]::new(`$document)"
            "`$toast.Tag = 'status'"
            "`$toast.Group = 'austen-backup'"
            "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show(`$toast)"
        ) -join "`n"
        $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($toastScript))
        & $windowsPowerShellPath -NoProfile -NonInteractive -EncodedCommand $encoded *> $null
    } catch {
        # A toast that cannot be shown must not hide the backup result.
        Write-Warning "Could not show the backup alert: $($_.Exception.Message)"
    }
    Write-Output "ALERT $Title - $Body"
}

function Get-LastSuccessfulBackupLog {
    Get-ChildItem -LiteralPath $logRoot -File -Filter 'backup-*.log' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Where-Object { Select-String -LiteralPath $_.FullName -Pattern ' BACKUP COMPLETE\s*$' -CaseSensitive -Quiet } |
        Select-Object -First 1
}

# Returns $null while the run is still going. Matching is case-sensitive on
# purpose: VShadow prints "Backup failed." in its own output.
function Get-BackupVerdict {
    param([Parameter(Mandatory)][string]$LogPath)

    if (Select-String -LiteralPath $LogPath -Pattern ' BACKUP COMPLETE\s*$' -CaseSensitive -Quiet) {
        return [pscustomobject]@{ Passed = $true; Reason = $null }
    }

    $failed = Select-String -LiteralPath $LogPath -Pattern ' BACKUP FAILED .*message=(.*)$' -CaseSensitive |
        Select-Object -First 1
    if ($null -eq $failed) {
        return $null
    }

    # The main log's own message is generic ("the protected C: copy stage
    # failed"), so prefer the stage's message or VShadow's error line.
    $detail = Select-String `
        -LiteralPath $LogPath `
        -Pattern @(' SNAPSHOT STAGE FAILED .*message=(.*)$', 'VSHADOW ERROR: (.*)$') `
        -CaseSensitive |
        Where-Object { $_.Line -notmatch "Command line '.*' failed!" } |
        Select-Object -First 1
    $reason = if ($null -ne $detail) { $detail.Matches[0].Groups[1].Value } else { $failed.Matches[0].Groups[1].Value }
    [pscustomobject]@{ Passed = $false; Reason = $reason.Trim() }
}

function Format-LastGood {
    $lastGood = Get-LastSuccessfulBackupLog
    if ($null -eq $lastGood) {
        return 'No successful backup is on record.'
    }
    "Last good backup: $($lastGood.LastWriteTime.ToString('ddd MMM d, h:mm tt'))."
}

$startedAt = Get-Date

$lastGood = Get-LastSuccessfulBackupLog
if ($null -eq $lastGood -or ($startedAt - $lastGood.LastWriteTime) -gt $staleAfter) {
    Show-BackupAlert `
        -Title 'Nightly backup is behind' `
        -Body "$(Format-LastGood) Tonight's run is starting now."
}

& $pwshPath `
    -NoLogo `
    -NoProfile `
    -NonInteractive `
    -ExecutionPolicy Bypass `
    -File $prepScript
$prepExitCode = $LASTEXITCODE

if ($prepExitCode -ne 0) {
    Show-BackupAlert `
        -Title 'Nightly backup did not start' `
        -Body "The cloud and Git preparation step failed (exit $prepExitCode). $(Format-LastGood) Details: $prepLogRoot"
    throw "Cloud and Git backup preparation failed with exit code $prepExitCode. The protected backup was not started."
}

$taskStartedAt = Get-Date
& "$env:SystemRoot\System32\schtasks.exe" /Run /TN $taskName
if ($LASTEXITCODE -ne 0) {
    Show-BackupAlert `
        -Title 'Nightly backup did not start' `
        -Body "Task Scheduler could not start $taskName. $(Format-LastGood)"
    throw "Task Scheduler could not start $taskName."
}

Write-Output "Started $taskName after cloud and Git preparation completed."
if ($NoWait) {
    return
}

$deadline = $taskStartedAt + $verdictTimeout
$runLog = $null
$verdict = $null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 30
    if ($null -eq $runLog) {
        $runLog = Get-ChildItem -LiteralPath $logRoot -File -Filter 'backup-*.log' -ErrorAction SilentlyContinue |
            Where-Object { $_.CreationTime -ge $taskStartedAt.AddSeconds(-5) } |
            Sort-Object CreationTime |
            Select-Object -First 1
        if ($null -eq $runLog) {
            continue
        }
    }
    $verdict = Get-BackupVerdict -LogPath $runLog.FullName
    if ($null -ne $verdict) {
        break
    }
}

if ($null -eq $verdict) {
    $where = if ($null -ne $runLog) { $runLog.FullName } else { $logRoot }
    Show-BackupAlert `
        -Title 'Nightly backup did not finish' `
        -Body "No result after $([int]$verdictTimeout.TotalMinutes) minutes. $(Format-LastGood) Details: $where"
    exit 1
}

if (-not $verdict.Passed) {
    Show-BackupAlert `
        -Title 'Nightly backup failed' `
        -Body "$($verdict.Reason) $(Format-LastGood) Details: $($runLog.FullName)"
    exit 1
}

Write-Output "Backup complete: $($runLog.FullName)"
