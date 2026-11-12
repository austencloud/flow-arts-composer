<#
  launch-chrome-debug.ps1

  Starts or reuses one shared, persistent Chrome with remote debugging on port
  9222. The chrome-devtools MCP server attaches to it (configured with
  --browserUrl=http://127.0.0.1:9222) instead of spawning an isolated
  automation instance.

  Why this exists:
    - The MCP-launched Chrome carries --enable-automation, which shows the
      "Chrome is being controlled by automated test software" banner AND makes
      Google / Firebase sign-in refuse credentials. Attaching to a Chrome we
      launch ourselves (WITHOUT that flag) is a normal browser — sign-in works,
      cookies persist, no banner.
    - This profile is dedicated + persistent: sign in once and stay signed in
      across sessions. It runs alongside your everyday Chrome (separate
      --user-data-dir), and current Chrome REQUIRES a non-default user-data-dir
      to expose the debug port anyway.
    - The browser uses a non-default internal profile directory. Chrome includes
      that profile in its Windows taskbar identity, so the shared agent browser
      gets its own profile-badged icon instead of looking like Austen's Chrome.
    - The visible window uses normal Windows display scaling. Exact test
      viewports belong to the MCP emulate tool, not Chrome launch flags.
    - Chrome restores the window size and position last saved in this profile.
      The launcher does not maximize, resize, or reposition the window.
    - A named mutex serializes concurrent launcher calls. Multiple agents attach
      to the same browser process and open task-owned tabs in its existing
      window instead of racing to start duplicate instances.

  Usage:
    pwsh scripts/launch-chrome-debug.ps1            # opens https://localhost:5173
    pwsh scripts/launch-chrome-debug.ps1 -Url https://tkaflowarts.com

  Then start or restart Codex or Claude Code. The chrome-devtools tools drive
  this window, logged in as you.
#>
param(
  [int]$Port = 9222,
  [string]$UserDataDir = "$env:USERPROFILE\.claude\chrome-profile",
  [string]$ProfileDirectory = "Profile 1",
  [string]$Url = "https://localhost:5173"
)

# Marks this browser so production analytics leaves it out: no PostHog
# capture, no visit alert. See src/lib/shared/analytics/agent-browser.ts.
function Set-AgentBrowserMark {
  & node (Join-Path $PSScriptRoot "mark-agent-browser.mjs") $Port
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not set the agent-browser analytics mark; production visits from this browser will count as visitors."
  }
}

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
  Write-Error "Chrome not found at $chrome"
  exit 1
}

New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null
$UserDataDir = (Resolve-Path -LiteralPath $UserDataDir).Path

# Serialize startup across terminals. The endpoint check must happen after the
# mutex is held so two agents cannot both observe a closed port and launch.
$mutex = [System.Threading.Mutex]::new($false, "Local\TKA.ChromeDebug.$Port")
$lockTaken = $false

try {
  try {
    $lockTaken = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
  } catch [System.Threading.AbandonedMutexException] {
    $lockTaken = $true
  }

  if (-not $lockTaken) {
    Write-Error "Timed out waiting for another launcher to finish starting debug Chrome on port $Port."
    exit 3
  }

  # Already serving the debug port? Validate it and exit without spawning or
  # activating another window.
  $existingResponse = $null
  try {
    $existingResponse = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/json/version"
  } catch { }

  if ($null -ne $existingResponse) {
    try {
      $listener = Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $Port -ErrorAction Stop |
        Select-Object -First 1
      $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
    } catch {
      Write-Error "Chrome answered on port $Port, but its process could not be validated: $($_.Exception.Message)"
      exit 2
    }

    $commandLine = $listenerProcess.CommandLine
    $profilePattern = '--user-data-dir="?' + [regex]::Escape($UserDataDir) + '"?(?:\s|$)'
    $profileDirectoryPattern = '--profile-directory="?' + [regex]::Escape($ProfileDirectory) + '"?(?:\s|$)'

    if ($listenerProcess.Name -ne 'chrome.exe') {
      Write-Error "Port $Port is owned by $($listenerProcess.Name), not the dedicated debug Chrome."
      exit 2
    }
    if ($commandLine -match '--force-device-scale-factor|--enable-automation|--headless|--ignore-certificate-errors') {
      Write-Error "Chrome on port $Port was launched with an automation, certificate-bypass, or display-scale flag. Close that instance and run this launcher again."
      exit 2
    }
    if ($commandLine -notmatch $profilePattern) {
      Write-Error "Chrome on port $Port uses a different profile. Expected $UserDataDir."
      exit 2
    }
    if ($commandLine -notmatch $profileDirectoryPattern) {
      Write-Error "Chrome on port $Port uses a different internal profile. Expected $ProfileDirectory."
      exit 2
    }

    Write-Host "Shared debug Chrome already running on port $Port." -ForegroundColor Green
    Write-Host $existingResponse.Content
    Set-AgentBrowserMark
    exit 0
  }

  # Deliberately omit automation, headless, display-scale, window-size, and
  # maximize flags. Chrome restores the profile's last manual window placement.
  Start-Process -FilePath $chrome -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=`"$UserDataDir`"",
    "--profile-directory=`"$ProfileDirectory`"",
    "--no-first-run",
    "--no-default-browser-check",
    $Url
  )

  # Keep the mutex until the endpoint is ready. Waiting launchers will then
  # attach to this process rather than starting another one.
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/json/version"
      Write-Host "Shared debug Chrome ready on port $Port (profile: $UserDataDir\$ProfileDirectory)" -ForegroundColor Green
      Write-Host $response.Content
      Set-AgentBrowserMark
      exit 0
    } catch { }
  }

  Write-Warning "Launched Chrome but port $Port did not respond in time. Check that no other Chrome is using this profile."
  exit 1
} finally {
  if ($lockTaken) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
