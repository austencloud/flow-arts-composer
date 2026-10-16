# Runs on d2 as the scheduled task "d2 scratch prune" (every hour), installed
# from this file by `pwsh scripts/d2-prune.ps1 -Install` on d1. It is also run
# by d2-run-remote.ps1 when E: is nearly full, and can be run by hand on d2.
#
# Each d2-run.ps1 job leaves a scratch worktree of 5 to 8 GB on d2's 600 GB E:
# drive. The drive filled on 2026-10-15 and again on 2026-10-16 (ENOSPC during
# pnpm install). Rules, in order:
#   1. Never touch a worktree something is using: a job whose process is still
#      alive, any process (vite, wrangler, pnpm, a delete already under way)
#      whose command line names the worktree, or one used in the last
#      -MinAgeMinutes. "Used" is the newest of the folder's change time and the
#      start and finish of every job that ran in it.
#   2. Keep the newest -Keep worktrees and one per commit; remove the rest.
#      A worktree holding files git does not track (a job's output) stays for
#      12 hours, then goes like the others.
#   3. If E: is still under -MinFreeGB, remove more, oldest first, down to
#      -PressureKeep worktrees, skipping only what rule 1 protects (the age
#      floor drops to -PressureAgeMinutes).
# It removes finished run-* scratch worktrees only. d2-run-remote.ps1 stays
# free of cleanup so a run is never held up, except that it calls this script
# when E: is below 25 GB, because a job that hits ENOSPC dies half-installed.

param(
  [int]$Keep = 5,
  [int]$PressureKeep = 2,
  [int]$MinFreeGB = 80,
  [int]$MinAgeMinutes = 120,
  [int]$PressureAgeMinutes = 20,
  [int]$Parallel = 4,
  [switch]$DryRun,
  [switch]$Install
)

if ($Install) {
  $ErrorActionPreference = 'Stop'
  $tools = 'C:/Users/Austen/d2-tools'
  & ssh -o BatchMode=yes austen@d2 "pwsh -NoProfile -Command New-Item -ItemType Directory -Force '$tools' | Out-Null"
  & scp -q -o BatchMode=yes $PSCommandPath "austen@d2:$tools/d2-prune.ps1"
  if ($LASTEXITCODE -ne 0) { throw 'copy to d2 failed' }
  $register = @"
`$a = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument '-NoProfile -WindowStyle Hidden -File $tools/d2-prune.ps1'
`$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Hours 1)
`$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
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
$toolsDir = 'C:\Users\Austen\d2-tools'
$log = "$toolsDir\d2-prune.log"
$lock = "$toolsDir\d2-prune.lock"

function FreeGB { (Get-Volume E).SizeRemaining / 1GB }
function Norm([string]$p) { ($p -replace '/', '\').TrimEnd('\').ToLowerInvariant() }

# One prune at a time: the scheduled task, a run's emergency call and a hand run
# must not delete the same folders together.
if (-not $DryRun) {
  if (Test-Path $lock) {
    $other = [int](Get-Content $lock -ErrorAction SilentlyContinue | Select-Object -First 1)
    # A recycled pid does not count: the holder must be a prune script.
    $holder = if ($other) { Get-CimInstance Win32_Process -Filter "ProcessId=$other" -ErrorAction SilentlyContinue }
    if ($holder -and $holder.CommandLine -match 'd2-prune') { "another prune is running (pid $other)"; return }
  }
  if (Test-Path $toolsDir) { Set-Content $lock $PID }
}

$free0 = FreeGB
$now = Get-Date

# What is alive right now: one process listing, matched against folder names.
$procs = @(Get-CimInstance Win32_Process)
$cmdlines = @($procs | ForEach-Object { if ($_.CommandLine) { Norm $_.CommandLine } })
$creation = @{}
foreach ($p in $procs) { $creation[[int]$p.ProcessId] = $p.CreationDate }

# Job records: the worktree each job ran in, its newest timestamp, and whether
# its process is still alive (a job that crashed never wrote exit.txt).
$lastJob = @{}
$running = @{}
foreach ($d in Get-ChildItem $jobs -Directory -ErrorAction SilentlyContinue) {
  $meta = "$($d.FullName)\meta.txt"
  if (-not (Test-Path $meta)) { continue }
  $kv = @{}
  Get-Content $meta | ForEach-Object { $i = $_.IndexOf('='); if ($i -gt 0) { $kv[$_.Substring(0, $i)] = $_.Substring($i + 1) } }
  if (-not $kv.worktree) { continue }
  $w = Norm $kv.worktree
  $stamp = [datetime]::MinValue
  if ($kv.started) { try { $stamp = [datetime]::Parse($kv.started) } catch {} }
  $exitFile = "$($d.FullName)\exit.txt"
  if (Test-Path $exitFile) { $stamp = (Get-Item $exitFile).LastWriteTime }
  elseif ($kv.pid) {
    $p = [int]$kv.pid
    $born = $creation[$p]
    # A recycled pid starts after the job did; that is not the job.
    if ($born -and $born -le $stamp.AddMinutes(2)) { $running[$w] = "job $($d.Name) running" }
  }
  if (-not $lastJob.ContainsKey($w) -or $stamp -gt $lastJob[$w]) { $lastJob[$w] = $stamp }
}

$all = @(Get-ChildItem $root -Directory -Filter 'run-*' | ForEach-Object {
  $n = Norm $_.FullName
  $used = $_.LastWriteTime
  if ($lastJob.ContainsKey($n) -and $lastJob[$n] -gt $used) { $used = $lastJob[$n] }
  $why = $null
  if ($running.ContainsKey($n)) { $why = $running[$n] }
  else {
    $rx = [regex]::Escape($n) + '(?![\w.\-])'
    if ($cmdlines | Where-Object { $_ -match $rx } | Select-Object -First 1) { $why = 'a process names it: dev server, install or delete under way' }
  }
  [pscustomobject]@{ Name = $_.Name; Path = $_.FullName; Used = $used; Protected = $why; Sha = ($_.Name -replace '^run-([0-9a-f]+)(-\d+)?$', '$1') }
} | Sort-Object Used -Descending)

$kept = [System.Collections.Generic.List[string]]::new()
$plan = [System.Collections.Generic.List[object]]::new()
$seenSha = @{}
$rank = 0
foreach ($w in $all) {
  $rank++
  $firstOfSha = -not $seenSha.ContainsKey($w.Sha)
  $seenSha[$w.Sha] = $true
  if ($w.Protected) { $kept.Add("$($w.Name) ($($w.Protected))"); continue }
  $ageMin = ($now - $w.Used).TotalMinutes
  if ($ageMin -lt $MinAgeMinutes -and -not ($ageMin -ge $PressureAgeMinutes -and $free0 -lt $MinFreeGB)) { $kept.Add("$($w.Name) (used $([int]$ageMin) min ago)"); continue }
  # The normal pass takes what is outside the newest -Keep or repeats a commit;
  # the pressure pass below may take the rest.
  $normal = (($rank -gt $Keep) -or (-not $firstOfSha)) -and $ageMin -ge $MinAgeMinutes
  $plan.Add([pscustomobject]@{ W = $w; Normal = $normal; Rank = $rank; AgeMin = $ageMin })
}

# Untracked files may be a job's output; they hold a worktree for 12 hours.
function Test-Loose($w) {
  $loose = git -C $w.Path status --porcelain 2>$null |
    Where-Object { $_ -notmatch '^\?\? node_modules' -and $_ -notmatch '^ ?D' }
  [bool]$loose
}

function Remove-One($c) {
  # rmdir /s removes junctions without following them into their targets.
  cmd /c rmdir /s /q "`"$($c.W.Path)`"" 2>$null
  -not (Test-Path $c.W.Path)
}

$targets = [System.Collections.Generic.List[object]]::new()
foreach ($c in ($plan | Where-Object Normal | Sort-Object { $_.W.Used })) {
  if ($c.AgeMin -lt 720 -and (Test-Loose $c.W)) { $kept.Add("$($c.W.Name) (files git does not track, under 12 h old)"); continue }
  $targets.Add($c)
}

$removed = 0
if ($DryRun) { $removed = $targets.Count }
elseif ($targets.Count) {
  $done = $targets | ForEach-Object -ThrottleLimit $Parallel -Parallel {
    cmd /c rmdir /s /q "`"$($_.W.Path)`"" 2>$null
    if (Test-Path $_.W.Path) { "FAIL:$($_.W.Name)" } else { $_.W.Name }
  }
  foreach ($d in $done) { if ($d -like 'FAIL:*') { $kept.Add("$($d.Substring(5)) (could not remove)") } else { $removed++ } }
}
$takenNames = @($targets | ForEach-Object { $_.W.Name })

# Pressure: still short of room, so take more, oldest first, down to -PressureKeep.
$pressureRemoved = 0
if (-not $DryRun -and (FreeGB) -lt $MinFreeGB) {
  $left = @($plan | Where-Object { $takenNames -notcontains $_.W.Name -and -not $_.Normal -and $_.Rank -gt $PressureKeep -and $_.AgeMin -ge $PressureAgeMinutes } |
    Sort-Object { $_.W.Used })
  foreach ($c in $left) {
    if ((FreeGB) -ge $MinFreeGB) { break }
    if (Remove-One $c) { $pressureRemoved++ } else { $kept.Add("$($c.W.Name) (could not remove)") }
  }
}
if ($DryRun -and $free0 -lt $MinFreeGB) { $kept.Add("(dry run: E: is under $MinFreeGB GB, a real run would also remove more, oldest first)") }

if (-not $DryRun) { git -C $primary worktree prune }
if ($DryRun) {
  $line = "DRY RUN would remove {0}; E: free {1:N1} GB; kept {2}; {3} worktrees there" -f $removed, $free0, $kept.Count, $all.Count
} else {
  $line = "{0:s} removed {1}{2}; E: free {3:N1} -> {4:N1} GB; kept {5}; {6} worktrees were there" -f (Get-Date), $removed,
    $(if ($pressureRemoved) { " (+$pressureRemoved under disk pressure)" } else { '' }), $free0, (FreeGB), $kept.Count, $all.Count
}
$line
$kept | ForEach-Object { "  kept $_" }
if (-not $DryRun) {
  if (Test-Path $toolsDir) { Add-Content $log $line; Set-Content $log (Get-Content $log -Tail 500) }
  Remove-Item $lock -ErrorAction SilentlyContinue
}
