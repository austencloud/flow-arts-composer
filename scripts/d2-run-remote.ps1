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

# Reuse a clean worktree for this commit (its node_modules is already installed).
$base = Join-Path $root "run-$($Sha.Substring(0, 10))"
$wt = $base
for ($n = 2; (Test-Path $wt) -and (git -C $wt status --porcelain --untracked-files=no); $n++) { $wt = "$base-$n" }
if (-not (Test-Path $wt)) {
  git -C $primary worktree add --detach --quiet $wt $Sha
  if ($LASTEXITCODE -ne 0) { throw "git worktree add failed for $Sha" }
}
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

# This helper deletes nothing. Old run-* worktrees are mostly hard links into the
# pnpm store; report the count so cleanup can be a separate, deliberate step.
$runs = @(Get-ChildItem $root -Directory -Filter 'run-*').Count
if ($runs -gt $keep) { "[d2-run] note: $runs scratch worktrees in $root" }
