# Unreal inside the Composer 3D viewer

Date: 2026-10-15. Status: first local viewer slice implemented; native and browser acceptance checks are in progress. Full viewer parity remains the roadmap below.

Austen wants the existing Composer 3D viewer experience with Unreal rendering: the same controls, performer editing, prop picker, camera behavior, saved scenes, and visual identity. Flow Fest and Museum already share native performer infrastructure. The next layer should consume that work and retain Composer's actual Svelte controls.

## How it fits together

```text
Composer: existing viewer shell, rails, inspectors and editor state
    | commands                             ^ results and snapshots
    v                                      |
Pixel Streaming frontend + bidirectional application bridge
    |                                      ^
    v                                      |
Unreal viewer host: native scene, camera, picking and performers
    |
    +-- Shared FlowArtsRuntime avatars, props and animation clock
    +-- Shared prepared performance library and exact sequence transfer
    +-- Existing catalog, capture, conversion and provenance tools
```

Unreal runs as a native application on a GPU. Pixel Streaming delivers its rendered video to a browser viewport and carries input and application messages. Composer can keep its DOM controls surrounding that viewport. Unreal does not execute the Svelte or Three.js render components.

The first integration target is a local Unreal process connected to Composer. This avoids a cloud rendering service for local use, while still requiring local GPU capacity, video encoding and a signalling connection. Remote access is a separate hosting decision. Measure interaction latency, image quality and resource usage before presenting either route as equivalent to the current viewer.

Epic documents [custom web players](https://dev.epicgames.com/documentation/en-us/unreal-engine/pixel-streaming-web-interface-for-unreal-engine) and [application messages and streaming events](https://dev.epicgames.com/documentation/en-us/unreal-engine/interacting-with-the-pixel-streaming-system-in-unreal-engine). The installed UE 5.8 baseline includes Pixel Streaming 2; its presence does not mean either game has an enabled or verified streaming connection. Select compatible frontend and signalling versions during implementation.

## First local viewer slice

Open `/test/unreal-viewer` in the local Composer app. The route reuses `Viewer3DFullscreen`, `SceneControlWorkspace`, the performer prop picker, camera presets, `SceneChromeButton`, and `SpeedControlBar`. Its canvas slot contains Epic's UE 5.8 Pixel Streaming frontend. The ordinary browser viewer keeps its existing canvas.

`unreal/ComposerViewer` is a small native host that instantiates the existing shared `FlowArtsRuntime` avatar and prop components. Its first supported cast is one `ch01` performer, with prepared staff and fan practice loops, position/facing, camera navigation, playback rate, and reconnect reconciliation. The bridge contract is [bridge-v1.md](../../unreal/ComposerViewer/bridge-v1.md); local staging and launch instructions are in the [Tools README](../../unreal/ComposerViewer/Tools/README.md).

This version does not accept arbitrary Composer scores. Staff uses Flow Fest's verified sealed pilot; fan is a labeled prepared practice output. Neither is presented as a substitute for a user's score. The exact-score library remains the shared Museum/Flow Fest integration path. Additional avatars, environments, effects, effort, plane changes, saved scenes, and full cast editing still need native support. Unsupported changes must not remain falsely selected in the web state.

Signalling and staged native assets live under `%LOCALAPPDATA%/FlowArtsComposer/ComposerViewer`, outside Git and outside the task worktree. The streamer and player sockets bind to loopback only. A scoped Vite WebSocket upgrade handler preserves HTTPS/2 and rejects remote connections and foreign origins. The native GPU process must remain running to render the viewer.

## Shared ownership

The existing [shared native foundation](../../unreal/Shared/README.md) remains authoritative for formats, coordinate conversion, provenance and asset mounts.

| Capability | Existing owner or source | Viewer integration responsibility |
| --- | --- | --- |
| Viewer controls and visual styling | Composer `src/lib/shared/3d/components`; `SceneControlWorkspace`, `SceneControlRail`, `SceneControlInspector`, `SceneChromeButton`, `PerformerSpine`, `MobileSceneControls` | Reuse those components and their layout. Add a renderer connection behind the shell. |
| Performer and scene editor state | `src/lib/shared/3d/state/viewer-3d-state.svelte.ts`; existing persistence and undo | Connect commands, native results and restoration without introducing a second editor store. |
| Character and prop identities | Deployed `@austencloud/scene-3d` character definitions; Composer's `scene-prop-catalog.ts`; shared native catalog tools | Use canonical IDs and readiness information. Do not create another roster or picker. |
| Sequence semantics | `@tka/sequence-engine` and Composer playback | Retain exact snapshots and existing semantics. No new native sequence generator. |
| Capture, conversion and cross-rig motion repairs | Flow Fest agent; `unreal/Shared/Tools` and the existing Flow Fest capture/conversion tools | Consume verified outputs. Do not launch a competing capture campaign. |
| Native skeletal and prop playback | `unreal/Shared/FlowArtsRuntime` | Instantiate the same avatar, prop, animation and synchronization components. |
| Prepared performance library and transport | Museum agent's shared-performance-library work, implementation `08f9c92dfc` | Consume its exact-sequence transfer, library and playback APIs. Coordinate runtime fixes with the owner. |
| Pixel Streaming connection, viewer host, editor command bridge | Composer/Unreal viewer integration | Own the connection lifecycle, native scene editing adapter, capability handshake and Composer viewport adapter. |
| Game worlds, progression and player traversal | Each game's agent | Games consume shared performance capabilities while retaining their own worlds and interaction rules. |

`@austencloud/scene-3d`, camera and environment packages contain reusable definitions and browser implementations. The rail primitives themselves currently live in Composer. Preserve these actual ownership boundaries; relocating packages is not a prerequisite for connecting Unreal.

## State and message contract

1. Composer owns authored editor state, selection, saved looks and undo. Unreal owns rendered actors, collision/picking, the live native camera and its animation clock. A reported native change updates Composer through the existing state actions.
2. Commands use stable performer IDs and canonical character, prop, environment and sequence identities. Reordering or removing performers must not redirect an outstanding command to a different actor.
3. The bridge versions its own messages, correlates commands with results, and rejects commands from an obsolete session or scene revision. This does not replace existing motion or sequence-transfer schemas.
4. On connection, Unreal reports loaded assets and supported operations. Restore the current Composer snapshot only after readiness is known. Reject or mark unsupported selections explicitly; never display a successful change while rendering a substitute.
5. Native selection and placement return stable performer IDs and authoritative transforms. Use the established coordinate conversion and verify it in both directions. Native updates must not echo commands indefinitely or add duplicate undo entries.
6. One camera controls the native view. Composer's focus and preset buttons send requests; Unreal returns camera position, target, FOV, navigation mode and completed gesture state. The existing Three.js camera controller cannot drive the native camera directly.
7. Each performer uses the shared native body's playback clock for matching props and blending. UI scrub, pause, restart and tempo changes use the shared performance transport. Do not run an independent browser animation timer against streamed video.
8. Sequence transfer preserves the exact payload and fingerprint accepted by the shared library. An unprepared or edited score reports that preparation is required. A family A/B routine is never an implicit substitute for the requested sequence.
9. Reconnect, resize and saved-scene restoration have one explicit reconciliation path. A second viewer must not overwrite another viewer's persistence slot or session state.
10. DOM controls consume their own pointer and keyboard input. Forward interaction within the streamed viewport to native picking/navigation, with correct viewport coordinates and cancellation when focus or connection changes.

Museum's shared contracts are named `tka-performance-transfer-v1` and `tka-performance-library-v1`. Its `FFlowArtsPerformanceLibrary` and `FFlowArtsPerformanceSession` APIs, plus additive avatar transport methods, landed in `08f9c92dfc`. The viewer consumes these methods; runtime fixes remain coordinated with Museum. Its native F6 panel is a game consumer of the same transport. Museum traced its pause smoke failure to observation before avatar and prop ticks; corrected real playback and shared regression checks pass without changing the production pause API. The Composer viewer still requires its own browser transport check.

## Capability and parity acceptance

This table describes required evidence, not current completion.

| Area | Reused starting point | Evidence required from the Unreal viewer |
| --- | --- | --- |
| Viewer shell | Existing rail, inspector, buttons, compact sheets and layout rules | Actual Unreal video visible within the current shell; desktop and compact layouts; no duplicate native rail. |
| Performer management | Existing selection, performer hub and native avatar catalog | Add/remove, single/multi-selection, character changes, naming and clear unavailable-asset feedback. |
| Placement and formation | Existing positions, facing and formation editor state | Native picking and dragging; round-trip transforms; focus/frame-cast after changes; undo/redo. |
| Props | Existing picker, family/build/finish/grip identities and native equipment | Selected handed geometry and finish appear on the correct performer, with shared synchronized motion. |
| Camera | Existing preset/focus/navigation UI and saved camera data | Orbit/pan/zoom, presets, focus, fly/walk where supported, correct input ownership, saved-camera restoration. |
| Playback | Composer sequence identity and shared native performance session | Exact prepared sequence, performer assignments, pause/resume, seek, restart, loop and rate; unsupported score rejection. |
| Environments | Existing Composer scene IDs and selector | Native implementation of each offered scene; matching atmosphere and deliberate visual review. Browser environment components do not establish native parity. |
| Effort, planes, grids and effects | Existing performer panels and settings | Every offered option either changes the native result correctly or is clearly unavailable. Native counterparts require explicit implementation and verification. |
| Saved looks and recovery | Existing serialization and saved-scene model | Restore the same cast, props, positions, environment and camera; reconnect without stale commands or duplicate actors. |
| Responsiveness and quality | Existing responsive control layout | Measured input-to-image latency, encoding quality, resize behavior, GPU load and reliable disconnection/recovery behavior. |

## Delivery order

1. Land the owners' verified shared runtime and performance-library changes. Record the exact dependency commits and supported assets.
2. Demonstrate one real native performer streamed into Composer beneath the existing shell. Complete a command/result round trip, a camera command, selection and prepared practice playback. Accepting an exact user score follows through the shared library. This is the connection milestone, not full viewer parity.
3. Complete cast editing, native picking/placement, prop changes, shared transport and persisted camera/scene restoration. Verify against Composer's existing behavior.
4. Implement the remaining native scene, effort, grid, plane and effects capabilities. Review visuals and measure performance before claiming the full viewer matches the web feature set.

Keep the browser renderer available while the native capability set grows. Full completion means the parity checks above pass; a streamed game window alone does not meet Austen's request.

## Coordination record

The coordinating chat contacted **Flow Fest Sim** and **Port Museum Game to Unreal** with Austen's authorization on 2026-10-15. Flow Fest confirmed that it has no competing standalone viewer/control plan and identified its motion/capture ownership. Museum's active work owns shared library/transport and exact Composer sequence handoff; the viewer direction was sent to that chat. This document records the viewer boundary without claiming Museum has completed or acknowledged every proposed integration detail.

Exchange scoped commits and verification evidence before changing shared APIs. Preserve existing `UFlowFest*` names, `flow-fest-*` schemas and `/Game/FlowFest/...` asset mounts. One agent owns a shared file at a time. Coordinate the single local Unreal build/import/render slot; use d2 for heavy work it supports. Neither this agreement nor local implementation authorizes deployment, a paid streaming service or remote exposure.
