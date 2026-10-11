# Runs a heavy check (full vitest suite, full build, verify:* gates) on d2, the
# office desktop, so it stops competing with agents on d1.
#
#   pwsh scripts/d2-run.ps1 "pnpm vitest run"
#   pwsh scripts/d2-run.ps1 -Ref 26299bc380 -Name ship -Command "pnpm run build && pnpm run verify:offline"
#   pwsh scripts/d2-run.ps1 -NoWait -Name suite -Command "pnpm vitest run"   # returns the job id
#   pwsh scripts/d2-run.ps1 -Job suite-26299bc380-171502                    # status + log tail
#
# The commit is pushed to d2 as refs/heads/d2-run/<sha>, checked out in a
# scratch worktree E:\worktrees\tka-platform\run-<sha>, installed from the
# lockfile, given the primary's .env/.cert, and the command runs there detached
# (a dropped SSH connection doesn't kill it). Exit code is the command's.
# Only committed content runs: commit first. Setup and permission rule: .claude/rules/resource-budget.md.

param(
  [Parameter(Position = 0)][string]$Command,
  [string]$Ref = 'HEAD',
  [string]$Name = 'check',
  [switch]$NoWait,
  [string]$Job,
  [int]$PollSeconds = 20,
  [int]$TailLines = 60
)

$ErrorActionPreference = 'Stop'
$ssh = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-l', 'austen', 'd2')
$jobsRoot = 'C:/Users/Austen/d2-jobs'

function Invoke-D2([string]$remote) {
  $out = & ssh @ssh $remote
  if ($LASTEXITCODE -ne 0) { throw "ssh to d2 failed ($LASTEXITCODE): $remote" }
  $out
}

function Show-Status([string]$id) {
  $dir = "$jobsRoot/$id"
  Invoke-D2 "if (Test-Path '$dir/exit.txt') { 'EXIT ' + (Get-Content '$dir/exit.txt' -Raw).Trim() } elseif (Test-Path '$dir') { 'RUNNING' } else { 'MISSING' }"
}

function Wait-D2Job([string]$id) {
  $dir = "$jobsRoot/$id"
  $started = Get-Date
  while ($true) {
    $state = "$(Show-Status $id)".Trim()
    if ($state -like 'EXIT *') { break }
    if ($state -eq 'MISSING') { throw "No job $id on d2." }
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
    $last = "$(Invoke-D2 "Get-Content '$dir/log.txt' -Tail 1 -ErrorAction SilentlyContinue")".Trim()
    if ($last.Length -gt 140) { $last = $last.Substring(0, 140) }
    Write-Host "[d2-run] $id running ${mins}m :: $last"
    Start-Sleep -Seconds $PollSeconds
  }
  Write-Host "----- d2 log tail ($id) -----"
  Invoke-D2 "Get-Content '$dir/log.txt' -Tail $TailLines" | Write-Host
  $code = [int]($state -replace 'EXIT ', '')
  Write-Host "[d2-run] $id exit $code (full log: d2 $dir/log.txt)"
  exit $code
}

if ($Job) {
  if ($NoWait) { Show-Status $Job; Invoke-D2 "Get-Content '$jobsRoot/$Job/log.txt' -Tail $TailLines -ErrorAction SilentlyContinue" ; exit 0 }
  Wait-D2Job $Job
}

if (-not $Command) { throw 'Pass -Command "<what to run on d2>" or -Job <id>.' }
if ($Name -notmatch '^[A-Za-z0-9._-]+$') { throw "-Name may only use letters, digits, . _ -" }

$sha = (git rev-parse --verify "$Ref^{commit}").Trim()
$id = "$Name-$($sha.Substring(0, 10))-$(Get-Date -Format HHmmss)"
Write-Host "[d2-run] pushing $sha to d2"
git push --quiet d2 "${sha}:refs/heads/d2-run/$($sha.Substring(0, 10))" 2>&1 | Where-Object { $_ -notmatch 'locksverify|Verified \d+ skills' } | Write-Host
if ($LASTEXITCODE -ne 0) { throw 'git push to d2 failed.' }

# The command travels as a file, so quoting inside it never has to survive SSH.
$local = Join-Path ([IO.Path]::GetTempPath()) "d2-run-$id"
New-Item -ItemType Directory -Force $local | Out-Null
Set-Content (Join-Path $local 'command.txt') $Command -Encoding ascii -NoNewline
Copy-Item (Join-Path $PSScriptRoot 'd2-run-remote.ps1') $local
Invoke-D2 "New-Item -ItemType Directory -Force '$jobsRoot/$id' | Out-Null" | Out-Null
& scp -q -o BatchMode=yes (Join-Path $local 'command.txt') (Join-Path $local 'd2-run-remote.ps1') "austen@d2:$jobsRoot/$id/"
if ($LASTEXITCODE -ne 0) { throw 'scp to d2 failed.' }
Remove-Item $local -Recurse -Force

Invoke-D2 "pwsh -NoProfile -File '$jobsRoot/$id/d2-run-remote.ps1' -Sha $sha -JobDir '$jobsRoot/$id'" | Write-Host
if ($NoWait) { Write-Host "[d2-run] started $id. Check with: pwsh scripts/d2-run.ps1 -Job $id"; exit 0 }
Wait-D2Job $id
