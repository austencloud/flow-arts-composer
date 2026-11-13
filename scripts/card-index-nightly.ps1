# Rebuilds the cloud card index (thumbnails/manifest.json in Firebase Storage)
# so gallery cards saved by any device are served from the cloud. The app only
# looks up cards the index lists; a hand-rebuilt index went stale from Sep 2 to
# Nov 12, 2026 and the cloud served nothing for weeks.
#
# Runs nightly on d1 as the scheduled task "TKA card index rebuild". It must run
# from the primary checkout: serviceAccountKey.json lives only there.
#
#   pwsh scripts/card-index-nightly.ps1            # rebuild once now
#   pwsh scripts/card-index-nightly.ps1 -Install   # register the nightly task
#
# Log: %LOCALAPPDATA%\tka\card-index-rebuild.log
param([switch]$Install)

$repo = Split-Path -Parent $PSScriptRoot

if ($Install) {
  $ErrorActionPreference = 'Stop'
  $script = Join-Path $repo 'scripts/card-index-nightly.ps1'
  $a = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -WindowStyle Hidden -File `"$script`""
  $t = New-ScheduledTaskTrigger -Daily -At 3:15am
  $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'TKA card index rebuild' -Action $a -Trigger $t -Settings $s -Force | Out-Null
  Write-Output "Registered 'TKA card index rebuild' daily at 3:15 AM."
  return
}

$ErrorActionPreference = 'Continue'
$log = Join-Path $env:LOCALAPPDATA 'tka\card-index-rebuild.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
"--- $(Get-Date -Format o)" | Add-Content $log
# origin/main is what the live site runs; the generator keeps its renderer's
# cards listed alongside local main's.
git -C $repo fetch --quiet origin main 2>&1 | Add-Content $log
node (Join-Path $repo 'scripts/generate-thumbnail-manifest.cjs') 2>&1 | Add-Content $log
"exit $LASTEXITCODE" | Add-Content $log
exit $LASTEXITCODE
