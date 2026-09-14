# Moonlight Hub - a one-click card for jumping straight into a stream.
#
# A pinned taskbar shortcut opens a card at the cursor, you press a number, the
# stream starts. No Moonlight host list to navigate, no picking the right app
# tile, no remembering which of d1's two Apollo instances is which.
#
# Visually this is Agent Hub's card: same 18px corner radius, same #16171B on a
# hairline white border, same 24 padding and drop shadow, same 430-wide column
# of 104-tall tiles with a 19px title, an 11px subtitle and the shortcut number
# underneath. Deliberate - two hubs on the same taskbar should look like one
# tool. If Agent Hub's card is restyled, restyle this to match.
#
# The host address is DISCOVERED, never hardcoded - this repo is public and the
# Moonlight runbook forbids committing tailnet addresses. First run probes the
# tailnet for a peer listening on the Apollo port and caches the answer; later
# runs reuse the cache and only re-probe if it has gone stale.

[CmdletBinding()]
param(
  [switch]$ListModes
)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing

$ErrorActionPreference = "Stop"

# --- Per-machine settings --------------------------------------------------
# Apollo serves each client its own instance on d1, and ports are +1000 per
# instance: instance 1 (serving d2) is 47989, instance 2 (serving the laptop) is
# 48989. Which panel each instance mirrors is its own output_name pin.
#
# Per-machine values live in an optional override file rather than in a second
# copy of this script:
#
#   %LOCALAPPDATA%\MoonlightHub\hub.json
#   { "port": 47989, "mirrorMonitor": "right", "title": "Stream d1", "modeProfile": "classic" }
#
# The connection defaults target the laptop's Apollo instance. The mode profile
# defaults to classic, so d2 keeps its three actions unless explicitly changed.
$StateDir = Join-Path $env:LOCALAPPDATA "MoonlightHub"
if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }

$HostPort      = 48989
$MirrorMonitor = "left"
$CardTitle     = "Stream d1"
$ModeProfile   = "classic"

$overrideFile = Join-Path $StateDir "hub.json"
if (Test-Path $overrideFile) {
  try {
    $o = Get-Content $overrideFile -Raw | ConvertFrom-Json
    if ($o.port)          { $HostPort      = [int]$o.port }
    if ($o.mirrorMonitor) { $MirrorMonitor = $o.mirrorMonitor }
    if ($o.title)         { $CardTitle     = $o.title }
    if ($o.modeProfile -in @("classic", "desktop-only")) {
      $ModeProfile = [string]$o.modeProfile
    }
  } catch { }   # a malformed override must never stop the launcher
}

# Which panel the Mirror tile shows is NOT something the hub controls - it is
# whatever that Apollo instance has pinned in Configuration > Audio/Video >
# Display Device Id. The override above only keeps the LABEL honest.
#
# Pinned 2026-08-04: instance 2 (laptop) to d1's LEFT panel
# {b0fed915-1f17-51e0-9d9d-ae92b8a22a46} (\\.\DISPLAY2, origin x -3840);
# instance 1 (d2) to the RIGHT panel {cef0d528-f01d-5611-878f-8e487d13aa58}
# (\\.\DISPLAY1, origin x 0, primary).
#
# output_name is read ONLY at service start, so changing it without restarting
# the instance silently keeps the old display - which looks exactly like the
# setting being ignored. Verify from the capture geometry in the log rather than
# by recognizing windows: the left panel reports "Offset: 0x0" and the right one
# "Offset: 3840x0", because the virtual desktop origin is -3840.

# The laptop's current Apollo lifecycle is attached to Desktop, so its local
# profile presents that one proven path. The classic profile remains the
# default for d2 and preserves its existing Virtual Display actions.
if ($ModeProfile -eq "desktop-only") {
  $Modes = @(
    [pscustomobject]@{
      Key      = "1"
      Shortcut = "Enter  /  1"
      Title    = "Connect"
      Blurb    = "Mirrored desktop · 1920×1200"
      Color    = "#FF0D9488"
      App      = "Desktop"
      Args     = "--resolution 1920x1200 --fps 60 --bitrate 40000 --video-codec HEVC"
    }
  )
} else {
  # "Virtual Display" is Apollo's app that CREATES a screen. The quotes matter:
  # passing its name without them makes Moonlight look for an app named Virtual.
  $Modes = @(
    [pscustomobject]@{
      Key      = "1"
      Shortcut = "1"
      Title    = "Extended"
      Blurb    = "New screen, 1:1"
      Color    = "#FF4F46E5"
      App      = "Virtual Display"
      Args     = "--resolution 1920x1200 --fps 60 --bitrate 40000 --video-codec HEVC"
    },
    [pscustomobject]@{
      Key      = "2"
      Shortcut = "2"
      Title    = "Mirror"
      Blurb    = "d1 $MirrorMonitor panel"
      Color    = "#FF0D9488"
      App      = "Desktop"
      Args     = "--resolution 1920x1200 --fps 60 --bitrate 40000 --video-codec HEVC"
    },
    [pscustomobject]@{
      Key      = "3"
      Shortcut = "3"
      Title    = "Away"
      Blurb    = "Low bandwidth"
      Color    = "#FF475569"
      App      = "Virtual Display"
      Args     = "--resolution 1920x1080 --fps 60 --bitrate 5000 --video-codec HEVC"
    }
  )
}

if ($ListModes) {
  ConvertTo-Json -InputObject @($Modes) -Depth 4
  return
}

$Moonlight = "C:\Program Files\Moonlight Game Streaming\Moonlight.exe"
$HostCache = Join-Path $StateDir "host.txt"
$LastFile  = Join-Path $StateDir "last.txt"

# --- Finding the host ------------------------------------------------------

function Test-ApolloPort([string]$Address) {
  # Test-NetConnection is far too slow for a launcher (seconds per closed port).
  # A raw socket with a short timeout keeps the card feeling instant.
  if (-not $Address) { return $false }
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($Address, $HostPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(600, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Resolve-StreamHost {
  if (Test-Path $HostCache) {
    $cached = (Get-Content $HostCache -Raw).Trim()
    if (Test-ApolloPort $cached) { return $cached }
  }
  try {
    $peers = (tailscale status --json | ConvertFrom-Json).Peer.PSObject.Properties.Value
  } catch {
    return $null
  }
  foreach ($peer in $peers) {
    if (-not $peer.Online) { continue }
    foreach ($ip in $peer.TailscaleIPs) {
      if ($ip -notmatch ':' -and (Test-ApolloPort $ip)) {
        Set-Content -Path $HostCache -Value $ip -Encoding ascii
        return $ip
      }
    }
  }
  return $null
}

function Start-Stream($Mode, [string]$Address) {
  Set-Content -Path $LastFile -Value $Mode.Key -Encoding ascii
  # --quit-after is load-bearing, not tidiness. Apollo deliberately PAUSES a
  # session on disconnect and holds its virtual display open for resume, so a
  # client that only disconnects strands a phantom monitor on d1 until something
  # terminates the app. The laptop did that to d2 twice on 2026-08-04, once
  # while Austen was working, and it read as "my display settings are stuck".
  #
  # Moonlight's quitAppAfter registry setting does NOT cover CLI-launched
  # streams - verified: with it true and this flag absent, the host still logged
  # only "Session pausing". With the flag, the sequence completes:
  # CLIENT DISCONNECTED -> Session pausing -> Virtual Display removed, in 86ms.
  $line = 'stream {0}:{1} "{2}" {3} --frame-pacing --quit-after --display-mode fullscreen' -f `
    $Address, $HostPort, $Mode.App, $Mode.Args
  Start-Process -FilePath $Moonlight -ArgumentList $line
}

# --- The card --------------------------------------------------------------

function Brush([string]$hex) {
  return New-Object System.Windows.Media.SolidColorBrush(
    [System.Windows.Media.ColorConverter]::ConvertFromString($hex))
}

function Text-Block($content, $size, $weight, $brush, $opacity, $topMargin) {
  $t = New-Object System.Windows.Controls.TextBlock
  $t.Text = $content
  $t.FontFamily = New-Object System.Windows.Media.FontFamily("Segoe UI")
  $t.FontSize = $size
  $t.FontWeight = $weight
  $t.Foreground = $brush
  $t.Opacity = $opacity
  $t.HorizontalAlignment = "Center"
  $t.Margin = New-Object System.Windows.Thickness(0, $topMargin, 0, 0)
  return $t
}

$lastKey = ""
if (Test-Path $LastFile) { $lastKey = (Get-Content $LastFile -Raw).Trim() }
if (-not ($Modes | Where-Object { $_.Key -eq $lastKey } | Select-Object -First 1)) {
  $lastKey = $Modes[0].Key
}

$window                  = New-Object System.Windows.Window
$window.Title            = $CardTitle
$window.WindowStyle      = "None"
$window.AllowsTransparency = $true
$window.Background       = [System.Windows.Media.Brushes]::Transparent
$window.Topmost          = $true
$window.ShowInTaskbar    = $false
$window.SizeToContent    = "WidthAndHeight"
$window.WindowStartupLocation = "Manual"
$window.Opacity          = 0

$card               = New-Object System.Windows.Controls.Border
$card.CornerRadius  = New-Object System.Windows.CornerRadius(18)
$card.Background    = Brush "#FF16171B"
$card.BorderBrush   = Brush "#40FFFFFF"
$card.BorderThickness = New-Object System.Windows.Thickness(1)
$card.Padding       = New-Object System.Windows.Thickness(24)
$shadow             = New-Object System.Windows.Media.Effects.DropShadowEffect
$shadow.BlurRadius  = 16
$shadow.ShadowDepth = 5
$shadow.Opacity     = 0.5
$shadow.Color       = [System.Windows.Media.Colors]::Black
$card.Effect        = $shadow
$window.Content     = $card

$col = New-Object System.Windows.Controls.StackPanel
$col.Width = 430
$card.Child = $col

# Header: Moonlight's own icon beside the title, the way Agent Hub shows a
# project icon. Purely decorative, so a failure to load must not stop the card.
$head = New-Object System.Windows.Controls.StackPanel
$head.Orientation = "Horizontal"
$head.HorizontalAlignment = "Center"
$head.Margin = New-Object System.Windows.Thickness(0, 0, 0, 4)
try {
  if (Test-Path $Moonlight) {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Moonlight)
    $stream = New-Object System.IO.MemoryStream
    $icon.ToBitmap().Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $stream.Position = 0
    $bmp = New-Object System.Windows.Media.Imaging.BitmapImage
    $bmp.BeginInit(); $bmp.StreamSource = $stream; $bmp.CacheOption = "OnLoad"; $bmp.EndInit()
    $img = New-Object System.Windows.Controls.Image
    $img.Source = $bmp; $img.Width = 34; $img.Height = 34
    $img.Margin = New-Object System.Windows.Thickness(0, 0, 12, 0)
    $head.Children.Add($img) | Out-Null
  }
} catch { }
$title = Text-Block $CardTitle 20 ([System.Windows.FontWeights]::SemiBold) (Brush "#FFF3F3F6") 1.0 0
$title.VerticalAlignment = "Center"
$head.Children.Add($title) | Out-Null
$col.Children.Add($head) | Out-Null

$status = Text-Block "finding d1..." 12 ([System.Windows.FontWeights]::Normal) (Brush "#FF8B8B95") 1.0 0
$status.Margin = New-Object System.Windows.Thickness(0, 0, 0, 18)
$col.Children.Add($status) | Out-Null

# Tiles across, star-sized with fixed gutters, same as Agent Hub's chooser grid.
$grid = New-Object System.Windows.Controls.Grid
for ($i = 0; $i -lt $Modes.Count; $i++) {
  $c = New-Object System.Windows.Controls.ColumnDefinition
  $c.Width = New-Object System.Windows.GridLength(1, "Star")
  $grid.ColumnDefinitions.Add($c)
  if ($i -lt $Modes.Count - 1) {
    $gap = New-Object System.Windows.Controls.ColumnDefinition
    $gap.Width = New-Object System.Windows.GridLength(12)
    $grid.ColumnDefinitions.Add($gap)
  }
}
$col.Children.Add($grid) | Out-Null

$streamHost = $null
$tiles = @()

function Invoke-Mode($Mode) {
  if (-not $script:streamHost) { return }
  $window.Hide()
  Start-Stream $Mode $script:streamHost
  $window.Close()
}

$colIndex = 0
foreach ($mode in $Modes) {
  $tile = New-Object System.Windows.Controls.Border
  $tile.CornerRadius = New-Object System.Windows.CornerRadius(14)
  $tile.Background = Brush $mode.Color
  $tile.Height = 104
  $tile.Cursor = [System.Windows.Input.Cursors]::Hand
  $tile.Opacity = 0.45          # dimmed until the host resolves
  [System.Windows.Controls.Grid]::SetColumn($tile, $colIndex)

  # The last-used tile wears a white ring, matching Agent Hub's highlight.
  if ($mode.Key -eq $lastKey) {
    $tile.BorderBrush = Brush "#FFFFFFFF"
    $tile.BorderThickness = New-Object System.Windows.Thickness(2)
  }

  $sp = New-Object System.Windows.Controls.StackPanel
  $sp.VerticalAlignment = "Center"
  $sp.Children.Add((Text-Block $mode.Title 19 ([System.Windows.FontWeights]::SemiBold) ([System.Windows.Media.Brushes]::White) 1.0 0)) | Out-Null
  $sp.Children.Add((Text-Block $mode.Blurb 11 ([System.Windows.FontWeights]::Normal) ([System.Windows.Media.Brushes]::White) 0.85 3)) | Out-Null
  $sp.Children.Add((Text-Block $mode.Shortcut 11 ([System.Windows.FontWeights]::Normal) ([System.Windows.Media.Brushes]::White) 0.6 7)) | Out-Null
  $tile.Child = $sp

  $tile.Tag = $mode
  $tile.Add_MouseLeftButtonUp({ Invoke-Mode $this.Tag }.GetNewClosure())
  $tile.Add_MouseEnter({ if ($this.Opacity -ge 1.0) { $this.Opacity = 0.86 } }.GetNewClosure())
  $tile.Add_MouseLeave({ if ($this.Opacity -gt 0.5) { $this.Opacity = 1.0 } }.GetNewClosure())

  $grid.Children.Add($tile) | Out-Null
  $tiles += $tile
  $colIndex += 2
}

$hintText = if ($ModeProfile -eq "desktop-only") {
  "Enter  connect        Esc  cancel"
} else {
  "Enter  last used        Esc  cancel"
}
$hint = Text-Block $hintText 11 ([System.Windows.FontWeights]::Normal) (Brush "#FF6C6C74") 1.0 18
$col.Children.Add($hint) | Out-Null

# --- Behavior --------------------------------------------------------------

$window.Add_KeyDown({
  if ($_.Key -eq "Escape") { $window.Close(); return }
  if ($_.Key -eq "Return") {
    $m = $Modes | Where-Object { $_.Key -eq $lastKey } | Select-Object -First 1
    if (-not $m) { $m = $Modes[0] }
    Invoke-Mode $m
    return
  }
  # Number-row keys arrive as D1/D2/D3, numpad as NumPad1.
  $ch = $_.Key.ToString() -replace "^(D|NumPad)", ""
  $pressed = $Modes | Where-Object { $_.Key -eq $ch } | Select-Object -First 1
  if ($pressed) { Invoke-Mode $pressed }
})

$window.Add_Deactivated({ $window.Close() })

$window.Add_SourceInitialized({
  # Place at the cursor. Cursor position is in device pixels and WPF lays out in
  # DIPs, so it has to go through the window's own device transform or the card
  # lands in the wrong place on a scaled display.
  $cursor = [System.Windows.Forms.Cursor]::Position
  $src = [System.Windows.PresentationSource]::FromVisual($window)
  $pt = $src.CompositionTarget.TransformFromDevice.Transform(
          (New-Object System.Windows.Point($cursor.X, $cursor.Y)))
  $area = [System.Windows.Forms.Screen]::FromPoint($cursor).WorkingArea
  $tl = $src.CompositionTarget.TransformFromDevice.Transform(
          (New-Object System.Windows.Point($area.Left, $area.Top)))
  $br = $src.CompositionTarget.TransformFromDevice.Transform(
          (New-Object System.Windows.Point($area.Right, $area.Bottom)))
  $window.UpdateLayout()
  $w = 478.0   # 430 column + 24 padding each side
  $h = 300.0
  $window.Left = [Math]::Max($tl.X, [Math]::Min($pt.X, $br.X - $w - 8))
  $window.Top  = [Math]::Max($tl.Y, [Math]::Min($pt.Y, $br.Y - $h - 8))
})

$window.Add_ContentRendered({
  $window.Activate()
  # Fade in, matching Agent Hub's card. Animate rather than snap so the two
  # hubs feel like the same tool.
  $fade = New-Object System.Windows.Media.Animation.DoubleAnimation(
            0, 1, (New-Object System.Windows.Duration([TimeSpan]::FromMilliseconds(120))))
  $fade.EasingFunction = New-Object System.Windows.Media.Animation.CubicEase
  $window.BeginAnimation([System.Windows.Window]::OpacityProperty, $fade)

  $script:streamHost = Resolve-StreamHost
  if ($script:streamHost) {
    $status.Text = "d1 at $script:streamHost"
    foreach ($t in $tiles) { $t.Opacity = 1.0 }
  } else {
    $status.Foreground = Brush "#FFF87171"
    $status.Text = "d1 not reachable. Is it awake and on the tailnet?"
  }
})

[void]$window.ShowDialog()
