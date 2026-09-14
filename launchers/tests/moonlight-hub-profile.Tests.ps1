[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$launcherPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\moonlight-hub.ps1'))
$failures = [Collections.Generic.List[string]]::new()
$passes = 0

function Assert-Equal {
  param(
    [Parameter(Mandatory)]
    [object] $Actual,

    [Parameter(Mandatory)]
    [object] $Expected,

    [Parameter(Mandatory)]
    [string] $Message
  )

  if ($Actual -ne $Expected) {
    $script:failures.Add("$Message Expected '$Expected', received '$Actual'.")
    return
  }

  $script:passes++
}

function Assert-True {
  param(
    [Parameter(Mandatory)]
    [bool] $Condition,

    [Parameter(Mandatory)]
    [string] $Message
  )

  if (-not $Condition) {
    $script:failures.Add($Message)
    return
  }

  $script:passes++
}

function Get-LauncherModes {
  param(
    [hashtable] $Override
  )

  $testRoot = Join-Path ([IO.Path]::GetTempPath()) "moonlight-hub-profile-$([guid]::NewGuid())"
  $localAppData = Join-Path $testRoot 'LocalAppData'
  $stateDirectory = Join-Path $localAppData 'MoonlightHub'
  New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

  if ($null -ne $Override) {
    $Override |
      ConvertTo-Json -Depth 4 |
      Set-Content -LiteralPath (Join-Path $stateDirectory 'hub.json') -Encoding utf8
  }

  try {
    $process = [Diagnostics.Process]::new()
    $process.StartInfo.FileName = 'powershell.exe'
    $process.StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`" -ListModes"
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.EnvironmentVariables['LOCALAPPDATA'] = $localAppData
    [void] $process.Start()

    if (-not $process.WaitForExit(3000)) {
      $process.Kill()
      [void] $process.WaitForExit(2000)
      $process.Dispose()
      throw 'Launcher mode query timed out. The launcher must handle -ListModes without opening its modal card.'
    }

    $process.WaitForExit()
    $output = $process.StandardOutput.ReadToEnd()
    $errors = $process.StandardError.ReadToEnd()
    if ($process.ExitCode -ne 0) {
      throw "Launcher mode query failed:`n$output$errors"
    }
    $process.Dispose()

    $parsedModes = $output | ConvertFrom-Json
    foreach ($mode in $parsedModes) {
      Write-Output $mode
    }
  }
  finally {
    if (Test-Path -LiteralPath $testRoot) {
      Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
  }
}

try {
  $classicModes = @(Get-LauncherModes)
  Assert-Equal $classicModes.Count 3 'The default profile must preserve all three d2 modes.'
  Assert-Equal ($classicModes.Title -join ',') 'Extended,Mirror,Away' 'The classic profile must preserve its existing actions.'

  $desktopModes = @(Get-LauncherModes -Override @{ modeProfile = 'desktop-only' })
  Assert-Equal $desktopModes.Count 1 'The desktop-only profile must expose one action.'
  Assert-Equal $desktopModes[0].Title 'Connect' 'The desktop-only action must be named Connect.'
  Assert-Equal $desktopModes[0].App 'Desktop' 'The desktop-only action must use Apollo Desktop lifecycle hooks.'
  Assert-Equal $desktopModes[0].Key '1' 'The desktop-only action must keep a direct number shortcut.'
  Assert-True ($desktopModes[0].Args -match '--resolution 1920x1200') 'The desktop-only action must preserve the laptop display resolution.'
  Assert-True ($desktopModes[0].Args -match '--bitrate 40000') 'The desktop-only action must preserve the proven stream bitrate.'

  $invalidModes = @(Get-LauncherModes -Override @{ modeProfile = 'unknown-profile' })
  Assert-Equal $invalidModes.Count 3 'An unknown local profile must fall back to the classic modes.'
}
catch {
  $failures.Add($_.Exception.Message)
}

if ($failures.Count -gt 0) {
  foreach ($failure in $failures) {
    Write-Error $failure
  }
  exit 1
}

Write-Output "Moonlight Hub profile tests passed: $passes assertions."
