<#
.SYNOPSIS
  Registers, or with -Uninstall removes, the scheduled task that shows a
  Windows notification when the Flow Arts Knowledge MCP stops working.

.DESCRIPTION
  Runs for your account; no admin needed. At logon and every 15 minutes the
  task runs scripts\watch-mcp-service.mjs from the main checkout through a
  headless console, so no window appears. The watcher only reads: it never
  starts, stops, or reconfigures FlowArtsKnowledgeMCP. It keeps its state and
  log in %LOCALAPPDATA%\FlowArtsKnowledgeMCP.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-watch-task.ps1
  powershell -ExecutionPolicy Bypass -File .\install-watch-task.ps1 -Uninstall
#>
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'Flow Arts Knowledge MCP watch'
$DataDir = Join-Path $env:LOCALAPPDATA 'FlowArtsKnowledgeMCP'

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed the '$TaskName' task. Its state and log stay in $DataDir."
    } else {
        Write-Host "No '$TaskName' task is registered."
    }
    return
}

# A worktree is removed once its branch merges, so the task must run the main
# checkout's copy of the watcher.
$porcelain = git -C $PSScriptRoot worktree list --porcelain 2>$null
$mainCheckout = if ($LASTEXITCODE -eq 0 -and $porcelain) {
    [IO.Path]::GetFullPath((($porcelain | Select-Object -First 1) -replace '^worktree ', ''))
} else {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$watcher = Join-Path $mainCheckout 'scripts\watch-mcp-service.mjs'
if (-not (Test-Path -LiteralPath $watcher -PathType Leaf)) {
    throw "The main checkout has no watcher yet: $watcher. Merge it to main first."
}
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    $node = (Get-Command node.exe).Source
}
$conhost = Join-Path $env:WINDIR 'System32\conhost.exe'

$action = New-ScheduledTaskAction -Execute $conhost `
    -Argument "--headless `"$node`" `"$watcher`"" -WorkingDirectory $mainCheckout
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$atLogon.Delay = 'PT2M'
$every15Minutes = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action `
    -Trigger $atLogon, $every15Minutes -Settings $settings -Force `
    -Description 'Shows a notification when the Flow Arts Knowledge MCP connector stops working. Read-only; see mcp-server\deploy\README.md.' |
    Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered '$TaskName' to run at logon and every 15 minutes:"
Write-Host "  $watcher"
Write-Host "It is running once now. Log: $DataDir\watch.log"
