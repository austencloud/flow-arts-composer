# Local Composer Pixel Streaming tools

These scripts run only on Austen's Windows workstation. Epic's UE 5.8 signalling library is pinned in this directory's `package-lock.json`. The launcher copies its script and pinned package files to `%LOCALAPPDATA%/FlowArtsComposer/ComposerViewer/Signalling/`, then installs dependencies and runs from that stable location. A running service remains manageable after its source worktree is removed.

| Connection | Address |
| --- | --- |
| UE Pixel Streaming 2 streamer | `ws://127.0.0.1:18888` |
| Browser player, direct local test | `ws://127.0.0.1:18889` |
| Composer browser over Vite HTTPS | `wss://<same-host>/unreal-stream` |

The Vite WebSocket upgrade handler accepts loopback browser connections with local origins only. It leaves Vite's HTTPS/2 setting intact. The signalling sockets bind only to IPv4 loopback; this setup has no remote player, TURN server, or cloud service. One player may subscribe at a time.

From this directory in PowerShell:

```powershell
./signalling-control.ps1 Start
./signalling-control.ps1 Status
./stage-runtime.ps1
./native-control.ps1 Start
./native-control.ps1 Status
./native-control.ps1 Stop
./signalling-control.ps1 Stop
```

`verify-upgrade.mjs` checks HTTPS/2 negotiation, a local player handshake, and rejected foreign-origin and non-loopback WebSocket upgrades. Set `COMPOSER_TEST_CERT_ROOT` to a checkout with the existing `.cert/dev-cert.pem` and `.cert/dev-key.pem` if the task worktree has no development certificate.

`signalling-control.ps1 Start` installs its pinned local npm dependencies on first use or when the lockfile changes. It owns only its recorded process. Logs and process records are in `%LOCALAPPDATA%/FlowArtsComposer/ComposerViewer/`.

`stage-runtime.ps1` copies the viewer source and shared `FlowArtsRuntime` plugin into `%LOCALAPPDATA%/FlowArtsComposer/ComposerViewer/Host/`, plus `Content/FlowFest` and `Content/Data` from `E:/FlowFestEmbodiment58/Project`. This includes the verified `ch01_P_staff_A.json`, `ch01_P_fan_A.json`, and `props.json`. The asset source is never modified. Staging refreshes only those task runtime directories; it does not copy generated assets into Git. `-SkipAssets` can check source/plugin staging, but that runtime cannot render the performer.

`native-control.ps1 Start -Stage` restages before launch. Without `-Stage`, it stages when the runtime project or required catalog and first performer motion files are absent. The hidden launch uses the installed UE 5.8 editor with `-game -RenderOffScreen -PixelStreamingConnectionURL=ws://127.0.0.1:18888 -PixelStreamingID=ComposerViewer`. UE writes its normal logs under the staged project's `Saved/Logs`. If source modules need compilation, build this staged project with UE 5.8 before starting the game. Coordinate the single local Unreal build/render slot first.

Vite normally reloads changed configuration when integration updates `vite.config.ts` on the primary checkout. The scripts do not start, restart, or change the primary server on port 5173. A separate task preview, if needed, must run from the actual task worktree on a free port within the project server budget.

Epic references: [infrastructure UE5.8 branch](https://github.com/EpicGames/PixelStreamingInfrastructure/tree/UE5.8), [signalling server API](https://github.com/EpicGames/PixelStreamingInfrastructure/blob/UE5.8/Signalling/src/SignallingServer.ts).
