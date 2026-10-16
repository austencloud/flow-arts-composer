# Runs on d2 as the scheduled task "d2 scratch prune" (every 2 hours), installed
# from this file by `pwsh scripts/d2-prune.ps1 -Install` on d1.
# Each d2-run.ps1 job leaves a scratch worktree of about 5 GB on d2's 600 GB E:
# drive, which filled on 2026-10-15. This keeps the newest few and removes the
# rest. It never removes one a job is running in, one used in the last two
# hours, or one holding files git does not track (a job's output may be there).
# d2-run-remote.ps1 itself deletes nothing, so a run is never held up by cleanup.

param([int]$Keep = 5, [switch]$DryRun, [switch]$Install)

if ($Install) {
  $ErrorActionPreference = 'Stop'
  $tools = 'C:/Users/Austen/d2-tools'
  & ssh -o BatchMode=yes austen@d2 "pwsh -NoProfile -Command New-Item -ItemType Directory -Force '$tools' | Out-Null"
  & scp -q -o BatchMode=yes $PSCommandPath "austen@d2:$tools/d2-prune.ps1"
  if ($LASTEXITCODE -ne 0) { throw 'copy to d2 failed' }
  $register = @"
`$a = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument '-NoProfile -WindowStyle Hidden -File $tools/d2-prune.ps1'
`$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(2) -RepetitionInterval (New-TimeSpan -Hours 2)
`$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'd2 scratch prune' -Action `$a -Trigger `$t -Settings `$s -Force | Out-Null
'installed'
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($register))
  & ssh -o BatchMode=yes austen@d2 "pwsh -NoProfile -EncodedCommand $encoded"
  return
}

$ErrorActionPreference = 'Continue'
$primary = 'E:\tka-platform'
$root = 'E:\worktrees\tka-platform'
$jobs = 'C:\Users\Austen\d2-jobs'
$log = 'C:\Users\Austen\d2-tools\d2-prune.log'

$busy = @(Get-ChildItem $jobs -Directory -ErrorAction SilentlyContinue |
  Where-Object { (Test-Path "$($_.FullName)\meta.txt") -and -not (Test-Path "$($_.FullName)\exit.txt") -and
                 $_.LastWriteTime -gt (Get-Date).AddDays(-1) } |
  ForEach-Object { (Get-Content "$($_.FullName)\meta.txt" | Where-Object { $_ -like 'worktree=*' }) -replace '^worktree=', '' })
$free0 = (Get-Volume E).SizeRemaining
$removed = 0
$kept = @()
Get-ChildItem $root -Directory -Filter 'run-*' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | ForEach-Object {
  $wt = $_.FullName
  if ($busy -contains $wt) { $kept += "$($_.Name) (job running)"; return }
  if ($_.LastWriteTime -gt (Get-Date).AddHours(-2)) { $kept += "$($_.Name) (used in the last 2 hours)"; return }
  $loose = git -C $wt status --porcelain 2>$null | Where-Object { $_ -notmatch '^\?\? node_modules' }
  if ($loose) { $kept += "$($_.Name) (files git does not track: $(@($loose).Count))"; return }
  if ($DryRun) { $removed++; return }
  # rmdir /s removes junctions without following them into their targets.
  cmd /c rmdir /s /q "`"$wt`"" 2>$null
  if (Test-Path $wt) { $kept += "$($_.Name) (could not remove)" } else { $removed++ }
}
if (-not $DryRun) { git -C $primary worktree prune }
$line = "{0:s} removed {1}; freed {2:N1} GB; E: free {3:N1} GB; kept {4}" -f (Get-Date), $removed,
  (((Get-Volume E).SizeRemaining - $free0) / 1GB), ((Get-Volume E).SizeRemaining / 1GB), $kept.Count
$line
$kept | ForEach-Object { "  kept $_" }
if (-not $DryRun -and (Test-Path (Split-Path $log))) { Add-Content $log $line }
