#requires -Version 5.1
#requires -RunAsAdministrator

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This installer must run elevated.'
}

$sourceRoot = $PSScriptRoot
$installRoot = 'C:\ProgramData\AustenBackup'
$installScriptRoot = Join-Path $installRoot 'Scripts'
$installBinRoot = Join-Path $installRoot 'Bin'
$installLogRoot = Join-Path $installRoot 'Logs'
$installStateRoot = Join-Path $installRoot 'State'
$backupContainer = 'F:\Automated Backups'
$localBackupRoot = Join-Path $backupContainer $env:COMPUTERNAME
$userAccount = "$env:COMPUTERNAME\Austen"
$userSid = ([System.Security.Principal.NTAccount]::new($userAccount)).Translate(
    [System.Security.Principal.SecurityIdentifier]
)
$expectedUserSid = 'S-1-5-21-581050501-1899459718-457958220-1002'
if ($userSid.Value -ne $expectedUserSid) {
    throw "The Austen account SID does not match this machine's reviewed backup configuration: $($userSid.Value)"
}
$administratorsSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
$systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$pwshPath = 'C:\Program Files\PowerShell\7\pwsh.exe'
$mainTaskName = 'Austen Daily Backup'
$prepTaskName = 'Austen Backup Cloud and Git Prep'
$verificationTaskName = 'Austen Weekly Backup Verification'
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$removedTasks = New-Object System.Collections.Generic.List[string]
$removedFiles = New-Object System.Collections.Generic.List[string]

function Set-ProtectedDirectoryRoot {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        [System.IO.Directory]::CreateDirectory($Path) | Out-Null
    }

    & "$env:SystemRoot\System32\icacls.exe" $Path /setowner 'BUILTIN\Administrators' /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to set the owner on $Path."
    }

    $security = New-Object System.Security.AccessControl.DirectorySecurity
    $security.SetOwner($administratorsSid)
    $security.SetAccessRuleProtection($true, $false)

    $inheritance = (
        [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
        [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    )
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow

    $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
        $systemSid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        $inheritance,
        $propagation,
        $allow
    )))
    $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
        $administratorsSid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        $inheritance,
        $propagation,
        $allow
    )))
    $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
        $userSid,
        [System.Security.AccessControl.FileSystemRights]::ReadAndExecute,
        $inheritance,
        $propagation,
        $allow
    )))

    Set-Acl -LiteralPath $Path -AclObject $security
}

function Reset-ProtectedChildren {
    param([Parameter(Mandatory)][string]$Path)

    $hasChildren = $null -ne (Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop | Select-Object -First 1)
    if (-not $hasChildren) {
        return
    }

    & "$env:SystemRoot\System32\icacls.exe" "$Path\*" /reset /T /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to reset child ACLs below $Path."
    }

    & "$env:SystemRoot\System32\icacls.exe" $Path /setowner 'BUILTIN\Administrators' /T /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to set child owners below $Path."
    }
}

function Assert-ReadOnlyUserAcl {
    param([Parameter(Mandatory)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $ownerSid = ([System.Security.Principal.NTAccount]::new($acl.Owner)).Translate(
        [System.Security.Principal.SecurityIdentifier]
    )
    if ($ownerSid.Value -notin @($administratorsSid.Value, $systemSid.Value)) {
        throw "Protected path owner is not Administrators or SYSTEM: $Path"
    }
    if (-not $acl.AreAccessRulesProtected) {
        throw "Protected path still inherits permissions: $Path"
    }

    $userRules = @(
        $acl.Access | Where-Object {
            $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $userSid.Value
        }
    )
    $expectedUserRights = [int64](
        [System.Security.AccessControl.FileSystemRights]::ReadAndExecute -bor
        [System.Security.AccessControl.FileSystemRights]::Synchronize
    )
    if ($userRules.Count -ne 1 -or
        $userRules[0].AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
        [int64]$userRules[0].FileSystemRights -ne $expectedUserRights) {
        throw "Austen does not have exactly one read-and-execute ACE on $Path."
    }
}

function Assert-NoUntrustedDirectoryWrite {
    param([Parameter(Mandatory)][string]$Path)

    $trustedSids = @($administratorsSid.Value, $systemSid.Value)
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
    $directories = @(
        Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        Get-ChildItem -LiteralPath $Path -Directory -Recurse -Force -ErrorAction Stop
    )

    foreach ($directory in $directories) {
        if ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Protected directory tree contains a reparse point: $($directory.FullName)"
        }

        $acl = Get-Acl -LiteralPath $directory.FullName -ErrorAction Stop
        $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
        if ($ownerSid -notin $trustedSids) {
            throw "Protected directory has an untrusted owner: $($directory.FullName) owner=$ownerSid"
        }

        $rules = $acl.GetAccessRules(
            $true,
            $true,
            [System.Security.Principal.SecurityIdentifier]
        )
        foreach ($rule in $rules) {
            if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
                $rule.IdentityReference.Value -in $trustedSids) {
                continue
            }

            $ruleMask = [int64]$rule.FileSystemRights -band 0xFFFFFFFFL
            if (($ruleMask -band $writeMask) -ne 0) {
                throw "Protected directory grants write, delete, or ACL control to $($rule.IdentityReference.Value): $($directory.FullName)"
            }
        }
    }

    $directories.Count
}

function Get-TaskComObject {
    param([Parameter(Mandatory)][string]$TaskName)

    $service = New-Object -ComObject Schedule.Service
    $service.Connect()
    $folder = $service.GetFolder('\')
    $folder.GetTask($TaskName)
}

function Grant-TaskReadExecute {
    param([Parameter(Mandatory)][string]$TaskName)

    $stage = 'open task'
    try {
        $task = Get-TaskComObject -TaskName $TaskName
        $stage = 'read original security descriptor'
        $originalSddl = [string]$task.GetSecurityDescriptor([int]7)
        $stage = 'parse original security descriptor'
        $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($originalSddl)
        $oldDacl = $raw.DiscretionaryAcl
        $newDacl = [System.Security.AccessControl.RawAcl]::new(
            [byte]$oldDacl.Revision,
            [int]($oldDacl.Count + 1)
        )
        $explicitDenyAces = New-Object System.Collections.Generic.List[System.Security.AccessControl.GenericAce]
        $explicitAllowAces = New-Object System.Collections.Generic.List[System.Security.AccessControl.GenericAce]
        $inheritedAces = New-Object System.Collections.Generic.List[System.Security.AccessControl.GenericAce]

        foreach ($ace in $oldDacl) {
            $knownAce = $ace -as [System.Security.AccessControl.KnownAce]
            if ($null -ne $knownAce -and $knownAce.SecurityIdentifier.Value -eq $userSid.Value) {
                continue
            }

            $isInherited = (
                [int]$ace.AceFlags -band
                [int][System.Security.AccessControl.AceFlags]::Inherited
            ) -ne 0
            if ($isInherited) {
                $inheritedAces.Add($ace)
                continue
            }

            $qualifiedAce = $ace -as [System.Security.AccessControl.QualifiedAce]
            if ($null -ne $qualifiedAce -and
                $qualifiedAce.AceQualifier -in @(
                    [System.Security.AccessControl.AceQualifier]::AccessDenied,
                    [System.Security.AccessControl.AceQualifier]::SystemAudit
                )) {
                $explicitDenyAces.Add($ace)
            } else {
                $explicitAllowAces.Add($ace)
            }
        }

        foreach ($ace in $explicitDenyAces) {
            $newDacl.InsertAce($newDacl.Count, $ace)
        }
        foreach ($ace in $explicitAllowAces) {
            $newDacl.InsertAce($newDacl.Count, $ace)
        }

        $userAce = [System.Security.AccessControl.CommonAce]::new(
            [System.Security.AccessControl.AceFlags]::None,
            [System.Security.AccessControl.AceQualifier]::AccessAllowed,
            [int]0x001200A9,
            [System.Security.Principal.SecurityIdentifier]$userSid,
            [bool]$false,
            [byte[]]$null
        )
        $newDacl.InsertAce($newDacl.Count, $userAce)

        foreach ($ace in $inheritedAces) {
            $newDacl.InsertAce($newDacl.Count, $ace)
        }

        $raw.DiscretionaryAcl = $newDacl
        $stage = 'serialize updated DACL'
        $newSddl = $raw.GetSddlForm(
            [System.Security.AccessControl.AccessControlSections]::Access
        )

        # TASK_DONT_ADD_PRINCIPAL_ACE keeps Task Scheduler from broadening the DACL.
        $stage = 'apply updated DACL'
        $task.SetSecurityDescriptor([string]$newSddl, [int]0x10)

        $stage = 'verify updated DACL'
        $appliedSddl = [string]$task.GetSecurityDescriptor([int]7)
        $applied = [System.Security.AccessControl.RawSecurityDescriptor]::new($appliedSddl)
        if ($applied.Owner.Value -notin @($administratorsSid.Value, $systemSid.Value)) {
            throw "Task owner is not Administrators or SYSTEM after ACL update: $TaskName"
        }

        $userAces = @(
            $applied.DiscretionaryAcl | Where-Object {
                $known = $_ -as [System.Security.AccessControl.KnownAce]
                $null -ne $known -and $known.SecurityIdentifier.Value -eq $userSid.Value
            }
        )
        if ($userAces.Count -ne 1 -or $userAces[0].AccessMask -ne 0x001200A9) {
            throw "Task ACL does not contain exactly one Austen FRFX ACE: $TaskName"
        }

        [pscustomobject]@{
            TaskName = $TaskName
            OriginalSddl = $originalSddl
            AppliedSddl = $appliedSddl
            AustenSid = $userSid.Value
            AustenMask = '0x001200A9'
        }
    } catch {
        throw "Task ACL update failed during '$stage': $($_.Exception.Message)"
    }
}

$sourceFiles = @(
    'AustenBackup.Common.psm1',
    'Invoke-AustenBackup.ps1',
    'Invoke-AustenBackupSnapshotStage.ps1',
    'Invoke-AustenBackupPrep.ps1',
    'Invoke-AustenBackupVerification.ps1',
    'Run-AustenBackupSnapshotStage.cmd',
    'Start-AustenBackup.ps1',
    'README.md'
)

foreach ($name in $sourceFiles) {
    $path = Join-Path $sourceRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Installer source is missing: $path"
    }
}
if (-not (Test-Path -LiteralPath $pwshPath -PathType Leaf)) {
    throw "PowerShell 7 is unavailable: $pwshPath"
}

$existingMainTask = Get-ScheduledTask -TaskName $mainTaskName -ErrorAction SilentlyContinue
if ($null -ne $existingMainTask -and [string]$existingMainTask.State -eq 'Running') {
    throw "$mainTaskName is still running. Wait for it to finish before installing."
}
if ($null -ne $existingMainTask) {
    Disable-ScheduledTask -TaskName $mainTaskName | Out-Null
}

if (-not (Test-Path -LiteralPath 'F:\' -PathType Container)) {
    throw 'The F: backup volume is unavailable.'
}
foreach ($path in @($backupContainer, $localBackupRoot)) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        [System.IO.Directory]::CreateDirectory($path) | Out-Null
    }

    $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "A protected backup root is a reparse point: $path"
    }
}

if (Test-Path -LiteralPath $installRoot) {
    $installRootItem = Get-Item -LiteralPath $installRoot -Force -ErrorAction Stop
    if ($installRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "The protected installation root is a reparse point: $installRoot"
    }
}

$existingReparsePoint = Get-ChildItem `
    -LiteralPath $localBackupRoot `
    -Recurse `
    -Force `
    -Attributes ReparsePoint `
    -ErrorAction Stop |
    Select-Object -First 1
if ($null -ne $existingReparsePoint) {
    throw "The backup tree contains a reparse point and will not be secured automatically: $($existingReparsePoint.FullName)"
}

foreach ($path in @($installRoot, $installScriptRoot, $installBinRoot, $installLogRoot, $installStateRoot)) {
    [System.IO.Directory]::CreateDirectory($path) | Out-Null
}
Set-ProtectedDirectoryRoot -Path $installRoot

foreach ($name in $sourceFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $installScriptRoot $name) -Force
}

$vshadowCandidates = @(
    Get-ChildItem -LiteralPath 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory -ErrorAction Stop |
        ForEach-Object { Join-Path $_.FullName 'x64\vshadow.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
)
if ($vshadowCandidates.Count -eq 0) {
    throw 'No x64 VShadow executable was found in the installed Windows SDK.'
}

$vshadowSource = $vshadowCandidates |
    Sort-Object { [version](Split-Path (Split-Path $_ -Parent) -Parent | Split-Path -Leaf) } -Descending |
    Select-Object -First 1
$vshadowSignature = Get-AuthenticodeSignature -LiteralPath $vshadowSource
if ($vshadowSignature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
    $vshadowSignature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation') {
    throw "The installed VShadow executable does not have a valid Microsoft signature: $vshadowSource"
}

$installedVshadow = Join-Path $installBinRoot 'vshadow.exe'
Copy-Item -LiteralPath $vshadowSource -Destination $installedVshadow -Force
$installedVshadowSignature = Get-AuthenticodeSignature -LiteralPath $installedVshadow
if ($installedVshadowSignature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
    $installedVshadowSignature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation') {
    throw 'The protected VShadow copy failed signature verification.'
}

Reset-ProtectedChildren -Path $installRoot
Set-ProtectedDirectoryRoot -Path $installRoot
Assert-ReadOnlyUserAcl -Path $installRoot

$backupAclAlreadyProtected = $false
try {
    Assert-ReadOnlyUserAcl -Path $backupContainer
    Assert-ReadOnlyUserAcl -Path $localBackupRoot
    $auditedBackupDirectories = Assert-NoUntrustedDirectoryWrite -Path $localBackupRoot
    $backupAclAlreadyProtected = $true
} catch {
    $backupAclAlreadyProtected = $false
}

if (-not $backupAclAlreadyProtected) {
    Set-ProtectedDirectoryRoot -Path $backupContainer
    Reset-ProtectedChildren -Path $backupContainer
    Set-ProtectedDirectoryRoot -Path $backupContainer
    Set-ProtectedDirectoryRoot -Path $localBackupRoot
    Assert-ReadOnlyUserAcl -Path $backupContainer
    Assert-ReadOnlyUserAcl -Path $localBackupRoot
    $auditedBackupDirectories = Assert-NoUntrustedDirectoryWrite -Path $localBackupRoot
}

$protectedScriptPaths = @(
    Get-ChildItem -LiteralPath $installScriptRoot -File -ErrorAction Stop |
        Where-Object { $_.Extension -in @('.ps1', '.psm1') }
)
foreach ($script in $protectedScriptPaths) {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -ne 0) {
        throw "PowerShell parser errors were found in $($script.FullName)."
    }
}

$systemPrincipal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest
# Interactive, not S4U: an S4U logon hands an administrator the full token even
# at RunLevel Limited, so the prep and verification scripts refused to run every
# night ("must run in Austen's normal unelevated session"). Found 2026-10-25.
$userPrincipal = New-ScheduledTaskPrincipal `
    -UserId $userAccount `
    -LogonType Interactive `
    -RunLevel Limited

$mainSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 20)
$userSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$mainAction = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\ProgramData\AustenBackup\Scripts\Invoke-AustenBackup.ps1"'
Register-ScheduledTask `
    -TaskName $mainTaskName `
    -Action $mainAction `
    -Settings $mainSettings `
    -Principal $systemPrincipal `
    -Description 'On-demand protected stage for the daily backup. Uses a temporary C: snapshot for locked profile files.' `
    -Force | Out-Null

$prepAction = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\ProgramData\AustenBackup\Scripts\Start-AustenBackup.ps1"'
$prepTrigger = New-ScheduledTaskTrigger -Daily -At '1:30 AM'
Register-ScheduledTask `
    -TaskName $prepTaskName `
    -Action $prepAction `
    -Trigger $prepTrigger `
    -Settings $userSettings `
    -Principal $userPrincipal `
    -Description 'Stages cloud and Git data as Austen, then starts the fixed protected backup task.' `
    -Force | Out-Null

$verificationAction = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\ProgramData\AustenBackup\Scripts\Invoke-AustenBackupVerification.ps1"'
$verificationTrigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek Sunday -At '4:00 AM'
Register-ScheduledTask `
    -TaskName $verificationTaskName `
    -Action $verificationAction `
    -Trigger $verificationTrigger `
    -Settings $userSettings `
    -Principal $userPrincipal `
    -Description 'Checks backup manifests, profile hive hashes, selected high-value files, and cloud mirror metadata as Austen.' `
    -Force | Out-Null

$taskSecurity = Grant-TaskReadExecute -TaskName $mainTaskName
$task = Get-TaskComObject -TaskName $mainTaskName
if ([string]$task.Xml -match '\$\(Arg(?:[0-9]|[12][0-9]|3[0-2])\)') {
    throw 'The protected task XML contains a caller-supplied argument placeholder.'
}

foreach ($obsoleteTaskName in @(
    'Austen Resume PC Health Conversation',
    'Austen One-Time Maintenance Reboot',
    'Austen One-Time Defender Full Scan',
    'Austen Post-Reboot Health Check'
)) {
    if (Get-ScheduledTask -TaskName $obsoleteTaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $obsoleteTaskName -Confirm:$false
        $removedTasks.Add($obsoleteTaskName)
    }
}

$documentsScriptRoot = 'C:\Users\Austen\Documents\PC Maintenance\Scripts'
[System.IO.Directory]::CreateDirectory($documentsScriptRoot) | Out-Null
Copy-Item `
    -LiteralPath (Join-Path $sourceRoot 'Start-AustenBackup.ps1') `
    -Destination (Join-Path $documentsScriptRoot 'Start-AustenBackup.ps1') `
    -Force

foreach ($obsoleteFile in @(
    (Join-Path $documentsScriptRoot 'Resume-PCHealthConversation.bat'),
    (Join-Path $documentsScriptRoot 'Schedule-PCHealthConversationResume.ps1')
)) {
    if (Test-Path -LiteralPath $obsoleteFile -PathType Leaf) {
        Remove-Item -LiteralPath $obsoleteFile -Force
        $removedFiles.Add($obsoleteFile)
    }
}

$installedFiles = @(
    Get-ChildItem -LiteralPath $installRoot -File -Recurse -Force |
        ForEach-Object {
            [pscustomobject]@{
                Path = $_.FullName
                Length = $_.Length
                SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            }
        }
)

$mainScheduledTask = Get-ScheduledTask -TaskName $mainTaskName
$mainTaskInfo = Get-ScheduledTaskInfo -TaskName $mainTaskName
$mainNextRunTime = if ($null -ne $mainTaskInfo.NextRunTime) {
    $mainTaskInfo.NextRunTime.ToString('o')
} else {
    $null
}
$installResult = [ordered]@{
    Timestamp = (Get-Date).ToString('o')
    InstallRoot = $installRoot
    BackupRoot = $localBackupRoot
    User = $userAccount
    UserSid = $userSid.Value
    VShadowSource = $vshadowSource
    VShadowSHA256 = (Get-FileHash -LiteralPath $installedVshadow -Algorithm SHA256).Hash
    TaskSecurity = $taskSecurity
    MainTask = [ordered]@{
        Name = $mainTaskName
        State = [string]$mainScheduledTask.State
        NextRunTime = $mainNextRunTime
        Principal = $mainScheduledTask.Principal.UserId
        Execute = $mainScheduledTask.Actions[0].Execute
        Arguments = $mainScheduledTask.Actions[0].Arguments
    }
    PrepTask = $prepTaskName
    VerificationTask = $verificationTaskName
    RemovedTasks = @($removedTasks)
    RemovedFiles = @($removedFiles)
    InstalledFiles = $installedFiles
    AuditedBackupDirectories = $auditedBackupDirectories
    BackupAclReset = -not $backupAclAlreadyProtected
    Passed = $true
}

$installResultPath = Join-Path $installStateRoot "install-$timestamp.json"
$latestInstallResultPath = Join-Path $installStateRoot 'latest-install.json'
$installJson = $installResult | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($installResultPath, $installJson, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($latestInstallResultPath, $installJson, (New-Object System.Text.UTF8Encoding($false)))
Reset-ProtectedChildren -Path $installRoot
Set-ProtectedDirectoryRoot -Path $installRoot
Assert-ReadOnlyUserAcl -Path $installRoot
$null = Assert-NoUntrustedDirectoryWrite -Path $installRoot

$installJson
