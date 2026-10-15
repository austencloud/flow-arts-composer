# Moonlight Client Setup (new machine → 4090 host)

**Repository status (2026-10-14):** The machine addresses, software and commands below record the 2026-08-02 setup. Host availability and current machine configuration were not inspected from this worktree.

Runbook for turning a fresh Windows machine into a Moonlight thin client for the
4090 workstation. Written to be executed top to bottom by an agent on the new
machine. Every command is PowerShell and copy-pasteable.

This captures the working configuration from the laptop client, verified
2026-08-02. The host side is already built and is not touched by this document.

**Host swap 2026-08-03: the host now runs Apollo, not Sunshine.** Apollo is a
Sunshine fork, so everything below still applies: same ports, same dashboard on
47990, same pairing flow, and the host binary is even still named
`Sunshine.exe` (under `C:\Program Files\Apollo`, service name `ApolloService`).
What Apollo adds is a virtual display per client via its bundled SudoVDA
driver: each paired device gets its own display on the host instead of
mirroring the main one, so client machines act as extended monitors of the
host desktop. Clients paired against the old Sunshine install must pair again.

## Roles

| Role       | What it runs                                       | Set up by                    |
| ---------- | -------------------------------------------------- | ---------------------------- |
| **Host**   | Apollo + Tailscale. The 4090 workstation.          | Already done. Do not modify. |
| **Client** | Tailscale + Moonlight. The machine you are on now. | This document.               |

The client never installs Apollo. Streaming is one-directional: client watches
and controls the host.

## Why there are no IP addresses in this file

This repository is public. Machine names, tailnet addresses, and the Windows
account name are not written here. Every one of them is discovered at runtime in
Step 2, because a machine on the tailnet can enumerate its own peers. Hardcoded
addresses would also rot the first time a node is re-created.

**Never commit these to this repo:** the Moonlight client certificate or private
key, the Sunshine dashboard credentials, the Windows account password, tailnet
addresses, or tailnet DNS names.

---

## Step 0: Prerequisites

- Windows 10/11, administrator access.
- The Tailscale account that owns the tailnet (same account as the host).
- Physical or remote access to the host for one moment during pairing, or a
  working remote console into it. Pairing needs a PIN typed into the host's
  Sunshine dashboard. Step 4 makes that possible from the client.
- A GPU with hardware HEVC decode. Any GPU from the last decade qualifies. AV1
  decode is a bonus, used by the LAN profile.

## Step 1: Install Tailscale and Moonlight

```powershell
winget install --exact --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
winget install --exact --id MoonlightGameStreamingProject.Moonlight --accept-package-agreements --accept-source-agreements
```

Verified versions on the working laptop client: Tailscale `1.98.9`, Moonlight
`6.1.0`. Newer is fine.

Join the tailnet, and pin a stable node name so the Windows computer name cannot
drift it later:

```powershell
tailscale up
tailscale set --hostname=<short-name-for-this-machine>
```

`tailscale up` opens a browser for authentication. Sign in with the same account
as the host.

Confirm this machine is on the tailnet:

```powershell
tailscale status
```

## Step 2: Discover the host

Do not guess the address. Find the peer that answers on Sunshine's port. Port
`47989` is Sunshine's stream control port and is the reliable fingerprint.

```powershell
$peers = (tailscale status --json | ConvertFrom-Json).Peer.PSObject.Properties.Value
$host4090 = $peers | Where-Object {
  $_.Online -and (Test-NetConnection -ComputerName $_.TailscaleIPs[0] -Port 47989 -WarningAction SilentlyContinue).TcpTestSucceeded
} | Select-Object -First 1

$HostIP = $host4090.TailscaleIPs[0]
"Host: $($host4090.HostName) at $HostIP"
```

Keep `$HostIP` for the rest of this session. If more than one peer answers, the
host is the one with the 4090; check `$peers | Select HostName, TailscaleIPs`.

Confirm the full port set is reachable:

```powershell
foreach ($p in 47984, 47989, 47990, 48010, 3389) {
  $r = Test-NetConnection -ComputerName $HostIP -Port $p -WarningAction SilentlyContinue
  "{0,-6} {1}" -f $p, $r.TcpTestSucceeded
}
```

All five should be `True`. What they are:

| Port  | Purpose                                           |
| ----- | ------------------------------------------------- |
| 47984 | Sunshine HTTPS control                            |
| 47989 | Sunshine HTTP control, the port Moonlight targets |
| 47990 | Sunshine web dashboard (pairing PIN entry)        |
| 48010 | Sunshine RTSP                                     |
| 3389  | RDP, the recovery path if streaming breaks        |

Sunshine also uses UDP `47998-48010` for the actual video and audio. UDP is not
TCP-probeable; a successful stream in Step 7 is the proof.

If the ports fail, the host is asleep or Tailscale is down on it. Stop and fix
that before continuing.

## Step 3: Confirm the network path is direct

```powershell
tailscale ping <host-node-name>
tailscale netcheck
```

A direct path prints a real IP and port. A result that stays on `via DERP(...)`
is a relay: encrypted and functional, but the wrong path for sustained video. On
a relay, expect stutter, and prefer RDP or a VS Code tunnel for text work until
the direct path establishes.

The home LAN gives 2-14ms. Note whichever number you get; it is the baseline for
judging the stream later.

## Step 4: Route the Sunshine dashboard through localhost

Sunshine's dashboard rejects a PIN submitted from a non-localhost origin with a
CSRF error. Browsing directly to the host's address on `47990` therefore cannot
complete pairing. A local port proxy fixes it permanently by making the dashboard
appear to originate from `localhost`.

Run as administrator:

```powershell
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=47990 connectaddress=$HostIP connectport=47990
netsh interface portproxy show all
```

The dashboard is now `https://localhost:47990` from this machine, on any network,
as long as the tailnet is up. It survives reboots.

The certificate is self-signed, so the browser warns. That is expected. Use a
real browser, not an embedded webview: the dashboard uses HTTP Basic auth and
webviews tend to render a raw `401` instead of a login prompt.

## Step 5: Pair with the host

Pairing exchanges certificates. This machine generates its own keypair on first
run. **Do not copy the certificate or key from another client.** Each device is a
distinct identity, and a copied key would be a shared secret sitting in two
places.

The pairing request expires after a few minutes and the process exits. Arm it
immediately before typing the PIN, not ahead of time.

1. Open `https://localhost:47990` in a browser and log in. Go to the **PIN** tab.
2. In a terminal on this machine, start pairing:

   ```powershell
   & "C:\Program Files\Moonlight Game Streaming\Moonlight.exe" pair $HostIP
   ```

   Moonlight displays a four-digit PIN.

3. Type that PIN into the dashboard's PIN tab, give the device a clear name, and
   submit.

Confirm pairing landed. A `srvcert` value under the host entry means paired:

```powershell
Get-ItemProperty "HKCU:\Software\Moonlight Game Streaming Project\Moonlight\hosts\1" |
  Select-Object hostname, manualaddress, @{n='paired';e={[bool]$_.srvcert}}
Get-ChildItem "HKCU:\Software\Moonlight Game Streaming Project\Moonlight\hosts\1\apps" |
  ForEach-Object { (Get-ItemProperty $_.PSPath).name }
```

Expect the host's name, and the app list `Desktop` and `Steam Big Picture`.

Pairing multiple devices to one host is supported and has no documented limit.
Adding this machine does not disturb the laptop's existing pairing.

## Step 6: Apply the verified client settings

Moonlight stores settings in the registry, not an INI file:
`HKCU\Software\Moonlight Game Streaming Project\Moonlight` (Qt QSettings native
format). Automation that watches Moonlight state must poll the registry.

**Close Moonlight before running this.** It writes its settings on exit and will
overwrite your changes.

```powershell
$k = "HKCU:\Software\Moonlight Game Streaming Project\Moonlight"

# Video defaults for the in-app launcher
Set-ItemProperty $k width 1920 -Type DWord
Set-ItemProperty $k height 1200 -Type DWord
Set-ItemProperty $k fps 60 -Type DWord
Set-ItemProperty $k bitrate 23000 -Type DWord
Set-ItemProperty $k unlockbitrate "false" -Type String
Set-ItemProperty $k vsync "true" -Type String
Set-ItemProperty $k framepacing "false" -Type String
Set-ItemProperty $k hdr "false" -Type String
Set-ItemProperty $k yuv444 "false" -Type String
Set-ItemProperty $k videocfg 0 -Type DWord      # auto codec
Set-ItemProperty $k videodec 0 -Type DWord      # auto hardware decode
Set-ItemProperty $k windowmode 0 -Type DWord    # fullscreen
Set-ItemProperty $k packetsize 0 -Type DWord    # auto MTU

# Input and session behavior
Set-ItemProperty $k mouseacceleration "false" -Type String
Set-ItemProperty $k abstouchmode "true" -Type String
Set-ItemProperty $k multicontroller "true" -Type String
Set-ItemProperty $k gamepadmouse "true" -Type String
Set-ItemProperty $k swapmousebuttons "false" -Type String
Set-ItemProperty $k swapfacebuttons "false" -Type String
Set-ItemProperty $k reversescroll "false" -Type String
Set-ItemProperty $k backgroundgamepad "false" -Type String
Set-ItemProperty $k capturesyskeys 0 -Type DWord
Set-ItemProperty $k keepawake "true" -Type String
Set-ItemProperty $k quitAppAfter "true" -Type String   # see the note below
Set-ItemProperty $k muteonfocusloss "false" -Type String

# Host and diagnostics
Set-ItemProperty $k hostaudio "false" -Type String
Set-ItemProperty $k audiocfg 0 -Type DWord      # stereo
Set-ItemProperty $k gameopts "true" -Type String
Set-ItemProperty $k mdns "true" -Type String
Set-ItemProperty $k connwarnings "true" -Type String
Set-ItemProperty $k detectnetblocking "true" -Type String
Set-ItemProperty $k showperfoverlay "false" -Type String
Set-ItemProperty $k richpresence "true" -Type String
```

The settings that matter and why:

| Setting                 | Value       | Reason                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hostaudio`             | `false`     | Audio plays on the client only. `true` also plays it out of the host's speakers.                                                                                                                                                                                                                                                                                                            |
| `keepawake`             | `true`      | Client does not sleep mid-stream.                                                                                                                                                                                                                                                                                                                                                           |
| `quitAppAfter`          | `true`      | **Reversed for Apollo on 2026-08-04.** Apollo pauses a session on disconnect and deliberately holds its virtual display open for resume, so a client that only disconnects strands a phantom monitor on the host. The laptop did that to d2 twice, once mid-work. This does not tear down the host's Windows session; it terminates the streamed _app_, which is what releases the display. |
| `mouseacceleration`     | `false`     | Raw input, 1:1 pointer.                                                                                                                                                                                                                                                                                                                                                                     |
| `capturesyskeys`        | `0`         | Alt+Tab and Win stay local unless fullscreen. Set `1` to send them to the host in fullscreen.                                                                                                                                                                                                                                                                                               |
| `videocfg` / `videodec` | `0`         | Auto-negotiate codec and hardware decoder. Only pin these when diagnosing.                                                                                                                                                                                                                                                                                                                  |
| `unlockbitrate`         | `false`     | Keeps the slider inside sane limits.                                                                                                                                                                                                                                                                                                                                                        |
| `width` / `height`      | `1920x1200` | Laptop panel. **Change to this machine's native resolution.**                                                                                                                                                                                                                                                                                                                               |

Adjust `width`, `height`, and `bitrate` to this machine's display and link. These
are the in-app defaults only; the launchers in Step 7 override them per profile.

## Step 7: Create the stream launchers

Two profiles, matching the laptop. Write both to the Desktop, substituting the
real host address for `<HostIP>`.

**LAN / same building, 4K60 AV1 at 40 Mbps:**

```bat
@echo off
rem Home/LAN profile. Requires a 4K display and AV1 decode on this client.
start "" "C:\Program Files\Moonlight Game Streaming\Moonlight.exe" stream <HostIP> Desktop --resolution 3840x2160 --fps 60 --bitrate 40000 --video-codec AV1 --frame-pacing --display-mode fullscreen
```

**Remote / away, 1080p60 HEVC at 5 Mbps:**

```bat
@echo off
rem Away profile. Conservative. Raise bitrate only after Step 3 shows a direct path.
start "" "C:\Program Files\Moonlight Game Streaming\Moonlight.exe" stream <HostIP> Desktop --resolution 1920x1080 --fps 60 --bitrate 5000 --video-codec HEVC --frame-pacing --display-mode fullscreen
```

If this client cannot decode AV1 in hardware, change the LAN profile to `HEVC`.
Check with `dxdiag` or the GPU vendor's spec sheet. Software AV1 decode at 4K60
will not keep up.

Generate them:

```powershell
$desktop = [Environment]::GetFolderPath('Desktop')
$ml = "C:\Program Files\Moonlight Game Streaming\Moonlight.exe"

@"
@echo off
start "" "$ml" stream $HostIP Desktop --resolution 3840x2160 --fps 60 --bitrate 40000 --video-codec AV1 --frame-pacing --display-mode fullscreen
"@ | Set-Content "$desktop\Stream 4090 (LAN 4K).cmd" -Encoding ascii

@"
@echo off
start "" "$ml" stream $HostIP Desktop --resolution 1920x1080 --fps 60 --bitrate 5000 --video-codec HEVC --frame-pacing --display-mode fullscreen
"@ | Set-Content "$desktop\Stream 4090 (Away 1080p).cmd" -Encoding ascii
```

## Step 8: Verify the stream

Run the appropriate launcher with the performance overlay on:

```powershell
& "C:\Program Files\Moonlight Game Streaming\Moonlight.exe" stream $HostIP Desktop `
  --resolution 1920x1080 --fps 60 --bitrate 5000 --video-codec HEVC `
  --frame-pacing --performance-overlay
```

Read the overlay and record the numbers. The laptop's verified on-LAN baseline:

| Metric                  | Laptop baseline         |
| ----------------------- | ----------------------- |
| Host processing latency | 2.1 ms                  |
| Network latency         | 3 ms                    |
| Decode time             | 0.76 ms (hardware HEVC) |
| Render time             | 0.59 ms                 |
| Dropped frames          | 0.00%                   |

Decode time above a few milliseconds means software decoding. Fix the codec
choice rather than lowering the bitrate.

Setup is done when a stream runs, input works, and dropped frames stay near zero.

---

## Two clients at once (Apollo virtual displays)

Apollo supports concurrent clients, and unlike plain Sunshine it does not
mirror. Each client device gets its own **virtual display**, created on connect
by the bundled SudoVDA driver and torn down on disconnect. The virtual display
shows up to Windows as a real extra monitor on the host, sized to the client's
requested resolution.

What that gives you:

- **Extended desktop across machines.** Each satellite machine running
  Moonlight fullscreen becomes one more monitor of the host desktop. Windows
  dragged toward it land on it. This is the office-as-one-desktop setup.
- **Per-client resolution.** The virtual display matches whatever resolution
  the client requests in its stream profile. A 4K client gets a 4K display, a
  1080p client gets 1080p.
- **Still one Windows session.** One cursor, one login. Fine for one person
  using several screens; a second person cannot independently use one of them.
- **Each session encodes separately.** Two 4K60 streams is roughly twice the
  encode load and twice the upstream bandwidth. The 4090 handles the encoding;
  the uplink is the likelier limit when off-LAN.

Per-device display behavior (virtual display vs mirror of the physical one) is
configured in the Apollo dashboard under the paired device's settings. The
default for a new pairing is a virtual display.

For best results the Apollo maintainers ship a companion Moonlight fork,
[Artemis](https://github.com/ClassicOldSong/moonlight-android) (Android) with
desktop builds under the Apollo org. Standard Moonlight works fine; Artemis
adds nicer resolution and display negotiation.

## Mirroring ONE specific physical monitor

Streaming Apollo's `Desktop` app captures a physical panel rather than making a
new one. Which panel is the instance-wide `output_name` setting, exposed in the
dashboard as **Configuration > Audio/Video > Display Device Id**. Unset, Apollo
captures the primary display.

There is no per-client and no per-app version of this. A paired client carries
only `always_use_virtual_display` and `display_mode` (see `/api/clients/list`),
and per-app `output` in `apps.json` is
[documented as ignored, falling back to primary](https://github.com/LizardByte/Sunshine/issues/4585).
So one Apollo instance mirrors exactly one monitor, which is a second reason
the two-instance layout on the host is useful: instance 1 can own one panel and
instance 2 the other.

**`output_name` is read only when the service starts.** Changing it and
reconnecting keeps the old display, which is indistinguishable from the setting
being ignored. Restart the instance's service after every change. This cost an
hour on 2026-08-04: the correct device id was set on the first try and appeared
to do nothing.

Identifying left from right is the other trap, because identical panels share a
`friendly_name`. Use position, not names. The service log's display enumeration
carries `info.origin_point.x`, and the panel with the smallest x is the
leftmost. Windows puts the primary at x 0, so a left-hand secondary is
_negative_.

Verify from the capture geometry the log prints at stream start, not by
eyeballing which windows are on screen:

```
Capture size       : 3840x2160
Offset             : 0x0        <- leftmost panel
Virtual Desktop    : 7680x2160
```

`Offset` is measured from the virtual desktop's origin, not from Windows'
coordinates. With panels at x -3840 and x 0, the LEFT one reports `0x0` and the
RIGHT one `3840x0`.

`launchers/pin-apollo-display.ps1` does the whole thing from the host:
`-Instance 2 -Side left` picks by position, writes `output_name`, backs up the
config, and restarts the service.

### Driving the dashboard API from a client

The dashboard rejects non-localhost origins, so API calls need the same
localhost port proxy that Step 4 sets up for pairing. Through it:

```
POST /api/login    {"username": "...", "password": "..."}   -> session cookie
GET  /api/config                                            -> only non-default keys
POST /api/config   {full set of non-default keys}           -> replaces them all
POST /api/restart  (needs Content-Type: application/json)
```

Two sharp edges. `POST /api/config` replaces the whole set, so read the current
config first and post it back with your addition, or you will silently drop
`port` and `sunshine_name`. And `/api/restart` returns 400 without the
`Content-Type` header, then the config you just saved never loads.

## Gotchas

- **Moonlight settings live in the registry**, not an INI. Moonlight overwrites
  them on exit, so close it before scripted edits.
- **Pairing PINs expire in minutes** and the `pair` process exits. Arm it
  just-in-time.
- **The Sunshine dashboard rejects a remote-origin PIN** with a CSRF error. Step
  4's port proxy is the fix, and it is required for pairing without physically
  sitting at the host.
- **Do not copy the client certificate or private key** from another machine.
  Pair fresh.
- **`quitAppAfter` must be `true` against Apollo.** This reverses the original
  Sunshine-era advice, which read `true` as tearing down the host's Windows
  session. It does not. It terminates the streamed _app_, and on Apollo that is
  the only thing that releases a virtual display: Apollo pauses on disconnect
  and holds the display open for resume, so a client that merely disconnects
  strands a phantom monitor on the host until something terminates the app.
- **The registry setting does not cover CLI-launched streams.** Verified
  2026-08-04: with `quitAppAfter` true and no flag, a graceful window close
  still logged only `Session pausing`. Pass **`--quit-after`** on the
  `moonlight stream` command line and the sequence completes -
  `CLIENT DISCONNECTED` then `Session pausing` then
  `Virtual Display removed successfully`, in 86ms. `launchers/moonlight-hub.ps1`
  passes it on every mode.
- **A paused session is resumed, not replaced.** Asking for a different app
  while one is paused silently resumes the paused one instead - a request for
  `Virtual Display` came back as `Session resuming for app [Desktop]`. Clear it
  with `moonlight quit <host>:<port>`, which answers `<cancel>1</cancel>` and
  returns the host to `SUNSHINE_SERVER_FREE`.
- **RDP can leave the host console locked.** If Sunshine shows a lock screen or
  black screen after an RDP session, that is the cause. Unlock the host console
  before treating Sunshine as broken.
- **A DERP relay path is not a streaming failure**, but it is the wrong path for
  video. Diagnose the direct path instead of raising the bitrate.
- **Host upstream bandwidth is shared.** Large uploads on the host destroy
  interactive latency. The host uses a throttled profile during remote work.

## Optional: the non-streaming paths

Streaming is not always the right tool. Two lighter paths to the same host:

**VS Code Remote Tunnel.** Development without streaming a GUI. Install VS Code,
sign in with the same GitHub account as the host's tunnel, then
**Remote Tunnels: Connect to Tunnel** and pick the host. Terminals, builds, and
extensions run on the host; this machine is only the editor. Better than video
for text work, especially on a relay path.

**RDP.** The recovery path when Sunshine is unavailable, and the only one that
reaches the host before user login. Save an `.rdp` alongside the launchers:

```
full address:s:<HostIP>
username:s:<HOSTNAME>\<user>
prompt for credentials:i:1
screen mode id:i:2
use multimon:i:0
desktopwidth:i:1920
desktopheight:i:1080
session bpp:i:32
compression:i:1
audiomode:i:0
redirectclipboard:i:1
networkautodetect:i:1
bandwidthautodetect:i:1
authentication level:i:2
enablecredsspsupport:i:1
```

`authentication level:i:2` plus `enablecredsspsupport:i:1` is Network Level
Authentication, which the host requires.

## Related

- `docs/superpowers/handoffs/2026-07-19-remote-4090-workstation-laptop-handoff.md`
  is the host build record and the open-items ledger.
- Tailscale connection types: <https://tailscale.com/kb/1257/connection-types>
- Apollo (the host): <https://github.com/ClassicOldSong/Apollo>
- Sunshine docs (Apollo is a fork; most of it applies): <https://docs.lizardbyte.dev/projects/sunshine/latest/>
- Moonlight: <https://moonlight-stream.org/>
