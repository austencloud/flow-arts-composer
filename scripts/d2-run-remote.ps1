# Runs on d2 (copied there by d2-run.ps1). Prepares a scratch worktree for one
# commit and starts the job detached, so it outlives the SSH session.

param(
  [Parameter(Mandatory)][string]$Sha,
  [Parameter(Mandatory)][string]$JobDir
)

$ErrorActionPreference = 'Stop'
$primary = 'E:\tka-platform'
$root = 'E:\worktrees\tka-platform'
$keep = 5

function Test-Link([string]$path) {
  (Test-Path $path) -and ((Get-Item $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)
}

# A job that hits ENOSPC dies half-installed, so below 25 GB free this clears old
# scratch worktrees first (d2-prune.ps1 skips any a job or process is using).
$freeGB = (Get-Volume E).SizeRemaining / 1GB
$prune = 'C:/Users/Austen/d2-tools/d2-prune.ps1'
if ($freeGB -lt 25 -and (Test-Path $prune)) {
  "[d2-run] E: has {0:N1} GB free; pruning old scratch worktrees first" -f $freeGB
  pwsh -NoProfile -File $prune -MinFreeGB 40
}

# Reuse a clean worktree for this commit (its node_modules is already installed).
$base = Join-Path $root "run-$($Sha.Substring(0, 10))"
$wt = $base
for ($n = 2; (Test-Path $wt) -and (git -C $wt status --porcelain --untracked-files=no); $n++) { $wt = "$base-$n" }
if (-not (Test-Path $wt)) {
  git -C $primary worktree add --detach --quiet $wt $Sha
  if ($LASTEXITCODE -ne 0) { throw "git worktree add failed for $Sha" }
}
# Marks the worktree as just used, so the prune leaves it alone until meta.txt exists.
(Get-Item $wt).LastWriteTime = Get-Date
if ((git -C $wt rev-parse HEAD).Trim() -ne $Sha) { throw "$wt is not at $Sha" }
# A node_modules link into the primary would let pnpm rewrite the primary's links.
if (Test-Link (Join-Path $wt 'node_modules')) { throw "$wt\node_modules is a link; refusing to install through it" }

foreach ($f in '.env', 'serviceAccountKey.json', '.cert') {
  $src = Join-Path $primary $f
  if ((Test-Path $src) -and -not (Test-Path (Join-Path $wt $f))) { Copy-Item $src $wt -Recurse }
}

$log = Join-Path $JobDir 'log.txt'
$exit = Join-Path $JobDir 'exit.txt'
$runner = @"
`$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location '$wt'
`$code = 0
foreach (`$step in 'pnpm install --frozen-lockfile', 'pnpm run build:packages', (Get-Content '$JobDir\command.txt' -Raw)) {
  "== `$step"
  `$global:LASTEXITCODE = 0
  try { Invoke-Expression `$step; `$code = [int]`$LASTEXITCODE; if (-not `$? -and `$code -eq 0) { `$code = 1 } }
  catch { `$_ | Out-String; `$code = 1 }
  if (`$code -ne 0) { break }
}
"== exit `$code"
Set-Content '$exit' `$code
"@
Set-Content (Join-Path $JobDir 'run.ps1') $runner -Encoding utf8

$cmd = "cmd.exe /d /c pwsh -NoProfile -File `"$JobDir\run.ps1`" > `"$log`" 2>&1"
$r = Invoke-CimMethod Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = $wt }
if ($r.ReturnValue -ne 0) { throw "Win32_Process Create failed ($($r.ReturnValue))" }
Set-Content (Join-Path $JobDir 'meta.txt') "sha=$Sha`nworktree=$wt`npid=$($r.ProcessId)`nstarted=$(Get-Date -Format o)"
"[d2-run] started pid $($r.ProcessId) in $wt"

# Apart from the low-space call above, this helper deletes nothing. The d2
# scheduled task "d2 scratch prune" (scripts/d2-prune.ps1) clears old run-*
# worktrees every hour.
$runs = @(Get-ChildItem $root -Directory -Filter 'run-*').Count
if ($runs -gt $keep) { "[d2-run] note: $runs scratch worktrees in $root" }
