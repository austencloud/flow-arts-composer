# Unreal inside the Composer 3D viewer

Updated: 2026-10-20 UTC. Status: the shared Composer scene viewer has a Web/Unreal switch in an isolated local preview. Measured streaming quality and full viewer parity remain open.

Austen wants the existing Composer 3D viewer experience with Unreal rendering: the same controls, performer editing, prop picker, camera behavior, saved scenes, and visual identity. Flow Fest and Museum already share native performer infrastructure. The next layer should consume that work and retain Composer's actual Svelte controls.

## Composer renderer switch

`Viewer3DCanvas` now selects Web or Unreal beneath the existing scene rail. The Stage scene and public sequence viewer consume this same component. Performer IDs, selections, positions, props, camera state and the sequence transport remain in Composer's shared state when the renderer changes.

The Unreal path captures the selected sequence with the existing production motion generator and transfers it through the shared runtime motion contract. Composer capture uses the live Web viewer's hand orbit and stance inputs. Standalone native capture retains its measured reach fitting. Capture signatures include the settings that affect motion, and a bounded page cache reuses completed captures.

This preview supports the native studio with up to eight performers and uniform none, fire or LED effects. Trails, advanced effects, mixed props or effects between hands, and Web environments require the Web renderer. The rail reports unsupported selections. Preparing a new sequence or prop can take time before native playback begins.

The task branch is `codex/composer-renderer-switch`. Its shared runtime dependency, `0684f238d9`, is not on local `main`, so delivery uses the task worktree's compiled preview on port 4188. The test route's earlier acceptance records below describe the original single-performer slice. They do not establish full parity for this integration.

### Corrective review, 2026-10-19 UTC

Austen rejected the first Composer preview's sideways body lean, mannequin presentation and camera consistency. The earlier Web/Unreal pose comparison is superseded: matching the same faulty pose did not validate the movement. The strict contact solver moved the hips about 39 cm sideways while holding the feet in place, then added spine roll. It also ignored the intended stance quarter-turn. Corrective verification must cover grounded posture and retained hand contact on both human and mannequin rigs.

Camera acceptance must compare the actual gestures, preset distances and saved framing. The review found different drag normalization, middle-button behavior and native camera bounds. Web snapshots also omitted the projection zoom used by Ctrl+wheel and trackpad pinch; snapshots now retain effective field of view. The recording workflow forced a Web canvas while leaving Unreal selected in the rail. Recording and export now select Web explicitly and make Unreal unavailable for that workflow.

The first replacement demonstration used a canonical `InfiniteSequenceGenerator` 16-count smooth LOOP, validated with `isEffectPreviewLoop` before and after URL encoding. The original short sequence remains a regression case. The full 16-count native capture at `aa8918e6d5d58bca26fea2de19bb53a8f05ea2f4` failed at frame 144, score 4.8: the left palm was 5.554 cm from its grip. The error's "pair relaxation 0" field reports authored grip relaxation, not measured pair translation. The native runtime owner reproduced that left-palm failure with an initial scheduler delta of 0.1 second; a 1/30-second initial delta cleared the left-palm failure. Subsequent asset-backed checks still found a 1.149 cm right-palm gap at frame 144 and crossed-arm reach failures at frames 251–253 (maximum left gap 9.86 cm, right gap 6.20 cm, measured pair translation 0). Bounded yaw experiments found feasible individual poses but failed the full 480-frame continuity gate and were not shipped.

A simpler canonical beginner LOOP, `ΔYΩX` repeated over 16 counts with zero turns and rotated/quartered continuity, also failed the unchanged 2 mm contact guard: maximum left gap 6.952 cm at frame 347 and right gap 0.437 cm at frame 355. Feet stayed planted and the hips reached the existing 8 cm lateral cap. Both generated examples are rejected as native demonstrations. Syntactic LOOP validity and a plausible still image do not establish physical reach or acceptable animation. General sequence acceptance remains open.

Capture-clock commit `861e5dd2c66321ff1c221a0a3c84ff40e664511a` drives Threlte's public ordered stages with explicit capture deltas after rig loading. This prevents asynchronous loading time from becoming the first animation step and preserves monotonic time across captures. The scheduler and original H regression checks passed (six files, 19 tests). This timing correction does not resolve the full-loop reach failures above.

Fresh browser capture at `861e5dd2c6` completed with two Marcus humans. Playback, pause and seeking at 53% and 85% worked; a Web/Unreal round trip retained frame-cast framing. The crossed-arm silhouette still differed between renderers, so this is camera and transport evidence, not acceptance of pose parity. The Flow Fest owner is investigating native grip-socket offsets and forearm routing in the shared runtime.

A second posture check found the original lateral correction incomplete. Although X movement was bounded, three elbow-bend adjustments could still retreat the pelvis along Z while the feet remained planted. The asset-backed side-hold test measured 31.287 cm backward movement on XBot and 26.737 cm on Marcus. The corrective constraint now bounds automatic Z movement to 8 cm from the neutral planted stance at each pelvis correction; explicitly authored contact poses retain their offsets. The same side-hold tests retain the 2 mm hand and foot tolerances. The loaded-idle H regression now checks both hands through the score, rather than only its first left-hand sample.

Viewer-mode commit `984f56c5ec2af136e840422bb8bf49e7d18c19e6` separates normal 3D viewing from recording. Reloading a link containing `pane=animation-3d`, or selecting 3D from Side by Side, opens the stage without arming export. Explicit Record a take still enters recording. The focused URL/mode tests passed (21 tests in two files).

The corrective run also isolated a character-loading race. Marcus (`ch01`) failed the first captured frame with a 0.1802414748 m left-palm gap. A numerical reproduction produced the same palm and grip coordinates when strict contact initialized before the locomotion clips loaded. Loading the idle pose before the first strict frame kept the required common hand translation within the existing 16 cm limit and passed the unchanged 2 mm contact check. Capture readiness must include motion initialization, not only the model-loaded callback.

The compiled preview at `aa8918e6d5d58bca26fea2de19bb53a8f05ea2f4` passed the original H regression with two Marcus (`ch01`) humans. Direct inspection at 38% and 85% showed the former 18.024 cm hand detachment gone; the 16 cm translation and 2 mm contact guards were unchanged. Frame-cast change `d018` centered the cast. Camera checks preserved framing across native orbit to Web, Web right-pan to Native, and native middle-button dolly to Web. Inverse right-pan restored the prior framing. Front and three-quarter presets remained consistent. A controlled Web Ctrl+wheel step of -120 followed by native +120 returned to the same framing. These checks cover those specific gestures and views, not touch input or every camera gesture.

Native policy commit `319e4f81c9` makes Composer-owned runtime motion explicitly preserve the captured pose. The shared game API keeps its existing clearance policy by default. The editor policy skips native foot, hand, activity, stance and clearance corrections after sampling, retains calibrated palm offsets for prop following, and clears prepared/correction state when the policy changes. It does not publish a physical-clearance certificate. The UE 5.8 build passed. The actual ch01 fixture test compares every sampled bone within 0.001 cm and 0.001 degrees, injects an 8 cm foot correction that must be ignored, then verifies the default-policy restart moves the foot by more than 4 cm. That regression passed, as did all 19 imported-motion fixtures, retarget, hierarchy interpolation and the Composer bridge command test. Live pose comparison is still required after restarting the native host.

A controlled ch01 `AAAA` full-loop test isolated the fixed hand orbit as a reach constraint: the unchanged viewer radius of 52 cm produced maximum palm gaps of 7.61 cm and 2.98 cm. The existing measured fit reduced both errors below 0.000003 cm with planted feet, but did so by shrinking the radius to 17.48 cm. That fit is rejected for the viewer: clean contact alone does not justify changing the movement's physical size so dramatically. The source of the conservative palm bounds and a suitable shared orbit remain under investigation.

The replacement demonstration is canonical `GGGG`: together/same pro motion, zero turns, through south, west, north, east and back to south. A production ch01 rig passes the entire 120-frame capture at the normal 52 cm hand orbit after capture warmup. Maximum palm errors are below 0.000003 cm, feet drift below 0.000004 cm, and automatic pelvis X/Z translation stays within 8 cm. The encoded score is `d1:y8wMDq4pzi_OrzCwglBAXnlqMogHomrKU_PygTwIVZOXn5oI5EGomtTEYpAchAIA`.

The original H history probe found a smaller, separate issue: fresh seeking versus canonical capture changes the left elbow by 12.119 mm and right elbow by 4.430 mm at 85%, while hips, head, feet and targets match. Repeating canonical warmup recovers the captured pose exactly. This does not explain the larger earlier visual discrepancy. A shared raw-pose cache now lets Web replay the same captured bones and props used by Unreal after switching back; settings changes invalidate the clip, and the live solver state is restored before its next tick. Production x-bot, y-bot and ch01 matrix tests pass, as does an off-sample regression for native quaternion interpolation and the loop seam. The browser comparison remains the acceptance gate.

A subsequent live inspection reproduced Austen's camera lag in the legacy Web renderer with two paused Marcus performers: 3.86 frames per second over 8.3 seconds, median frame interval 183.3 ms and 95th percentile 716.6 ms. The CPU profile identified repeated finger clearance and two-bone IK while the pose was unchanged. The machine was also under full CPU load from concurrent work. The baseline profile is retained in the task preview's `.svelte-kit/acceptance/web-camera-before.cpuprofile`. At that inspection, selecting Unreal reached its connection screen without receiving video.

The rebuilt preview subsequently verified paused Web camera orbit at 60.00 FPS over 15.18 seconds (911 frame intervals, median 16.7 ms, p95 16.8 ms, maximum 17.0 ms), with two Marcus performers at 1280×720 and DPR 1.5. The paused-pose gate skips unchanged IK while retaining updates for seeking, settings, character readiness and performer movement. Switching to Unreal produced an advancing 1090×604 video stream with both performers at the same paused score. Settled screenshots `shared-pose-unreal.png` and `shared-pose-web.png` retain the cast's size and camera orientation; an initial smaller native image occurred while stream resolution settled. These records live in the preview's `.svelte-kit/acceptance/`. They establish the renderer switch and paused camera response, not sustained 60 FPS during animation. Unprofiled captured Web playback subsequently measured 45.14 FPS over 16.97 seconds (p95 33.5 ms) with the Unreal process stopped; playback optimization remains under verification.

The final compiled preview includes capture-request memoization and limits captured-pose matrix updates to the performer subtree. A fresh-load paused orbit measured 59.18 FPS over 17.25 seconds (1,021 intervals, median 16.7 ms, p95 16.8 ms, maximum 116.7 ms). Uncached live playback still failed: 1.54 FPS over 78.80 seconds, with p95 1,750.1 ms and delayed browser input. The target-tab profile `web-final-live.cpuprofile` attributes 4.70 seconds to `fingerTriangleClearance`, 1.20 seconds to matrix multiplication and 1.44 seconds to garbage collection. The existing equivalent-grip cache rarely matched the changing hand-local shaft geometry. Paused optimization therefore does not establish live playback acceptance; consistent 60 FPS remains unresolved.

That failing run also coincided with substantial host pressure: approximately 11 GB of 127 GB physical RAM remained free, with 725–2,103 pages/sec, hundreds of Node processes and an active Unreal Editor belonging to another task. These observations confound timing comparisons but do not erase the identified live-solver cost. No other task's processes were stopped. The final preview is left paused and responsive. Its build and focused pose, cache, effects and camera tests pass; the broader type check retains pre-existing/transitive errors. Frame rates here measure browser animation-frame cadence, not GPU presentation or end-to-end input latency.

The camera review also found that native touch pinch used the full finger separation where Web uses the midpoint-to-finger distance, doubling native sensitivity. Native pinch now halves that input and applies dolly before two-finger pan, matching Web's order. Middle-button dolly retains its existing scale. Five focused camera-input tests pass; live touch parity remains unverified.

### Moving Web playback correction, 2026-10-20 UTC

Web playback now prepares the existing shared runtime capture before starting motion, then replays the captured bones and props. The page cache shares identical captures across performers and renderer changes. Sequence, character, grip and prop changes invalidate the relevant capture. This removes repeated strict hand and finger solving from ordinary playback; preparing an uncached selection can still take time.

Acceptance exposed two further defects. Effects meshes were counted as props, preventing the player from binding while the transport advanced. The shared `PerformerRig` now names its left and right prop branches explicitly. Separately, independently interpolating the bone hierarchy and prop transforms separated palms from grips between source frames, especially across the loop. Playback now translates the interpolated prop to the calibrated played palm without changing its rotation or running another IK solve. Effects consume the corrected prop transform.

The actual Marcus H fixture retains the existing 2 mm contact guard at source frames, interior half frames and the loop seam. The focused player/contact tests pass, including restoring detached prop models and binding replacements after loading. The live acceptance must demonstrate changing rendered bone and prop transforms; an advancing transport and animation-frame cadence alone are insufficient. The earlier timing-only 60 FPS measurement at `e240708c4d` is invalid because it did not establish that captured playback had started.

The final compiled preview at `f9ee1b7f40` passed the combined moving-playback and camera-orbit check on the original H regression at 80 BPM: two Marcus performers, physical 34-inch Fire Staff props, 1360×1204 viewport and DPR 1.5. Across 16.001 seconds it recorded 960 frame intervals at 59.996 FPS, median 16.7 ms, p95 16.8 ms and maximum 16.9 ms, with 913 pointer-move events. All four rendered prop pivots moved through the scene (maximum displacement from their initial positions 0.936–0.985 m), while their positions in the corresponding played hand-bone spaces varied by less than 0.00004 mm. Each prop changed on 479 sampled frames: the existing motion clock updates at approximately 30 Hz while camera rendering continues at display cadence. A separate 6.51-second camera check observed 382 changing camera matrices, with a maximum update interval of 33.4 ms. These are browser animation-frame and scene-transform measurements, not GPU presentation or end-to-end input latency.

The rail changed both performers from Double Staff to Fire Staff, prepared that selection and resumed captured playback with attached grips. The final player/contact checks passed 13 tests; prop-discovery and related checks passed 16 tests across five files. The final product-preview build passed, and the inspected browser reported no warnings or errors. Live measurements and the delivery process record are saved under the task worktree's `.svelte-kit/acceptance/web-moving-orbit-final.json` and `delivery-context.json`. The preview remains on port 4188, playing in the front camera view. Initial preparation for an uncached selection can still take time; this acceptance covers the tested H scene, not every sequence's physical reach.

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

Signalling and staged native assets live under `%USERPROFILE%/.flow-arts-composer/ComposerViewer`, outside Git and outside the task worktree. The streamer and player sockets bind to loopback only. A scoped Vite WebSocket upgrade handler preserves HTTPS/2 and rejects remote connections and foreign origins. The native GPU process must remain running to render the viewer.

## Local acceptance record

On 2026-10-15, the primary Composer route displayed real UE 5.8 video at 1430 × 900 with the existing DOM rails surrounding it. The Pixel Streaming data channel returned correlated `hello` and `camera` replies from the native host, including the loaded `ch01` staff performer and shared playback state. A follow-up build succeeded in 117.6 seconds. The next run showed the full performer with brighter front lighting and no Lumen distance-field warning. Twenty UI commands received twenty native replies and verified placement, camera controls, staff-to-fan switching, pause, rates 0.5 and 1.5, restart and reconnect.

A further native build succeeded in 133.87 seconds. In the final live control run on 2026-10-16 UTC, 23 actual UI commands received 23 native replies: 22 succeeded and one rejected an unsupported Sword prop as expected. The web picker restored Double Staff after that rejection; Fan then succeeded. `hello` loaded the `ch01` staff performer. Pausing held phase at 0.256032794713974 while Shift+Right moved the performer from x=0 to x=0.1, Ctrl+Z returned it to x=0, and Ctrl+Shift+Z restored x=0.1. The paused phase remained unchanged through those edits. The explicit Play control resumed playback. Focus set the native camera position to (0.1, 2.1577132573, 4.15009078175) and target to (0.1, 1.2, 0). Reconnect retained the fan, x=0.1, playing state and rate 1.

At a 375 × 667 portrait viewport, the stream settled at 366 × 668 and its video advanced. At a 1440 × 900 desktop viewport, video reached 1430 × 900. The latest native screenshot fills the viewport, so the earlier suspected 16:9 scene bars are not established. The native handshake reported `CameraActor_0`, `targetMatches=1`, component and cached camera constraints both 0, and viewports of 1280 × 720 then 1430 × 900. The evidence is recorded outside Git in `%LOCALAPPDATA%/FlowArtsComposer/ComposerViewer/Host/controls-final-evidence.json` and `viewer-desktop.png`.

At 05:46–05:47 UTC on 2026-10-16, a further live check at 375 × 667 showed the caption above the full performer, with the focused body and floor in frame. Selecting unsupported Sword returned an error, retained Staff, and displayed the taller message above the body. The real screenshots are stored outside Git beside the other host evidence as `viewer-portrait-final.png` and `viewer-portrait-error.png`.

These checks establish command replies and observed playback after resize, not input-to-image latency or long-run reliability. One PixelCapture GPU fence timeout appeared at 05:09:01 UTC; the stream subsequently advanced, resized and accepted controls. During earlier control testing, the primary development server stopped serving modules and its watchdog restarted the stack. The Unreal process slot was returned to Flow Fest after the earlier run; native render sessions and builds remain coordinated with that owner.

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

Museum's shared contracts are named `tka-performance-transfer-v1` and `tka-performance-library-v1`. Its `FFlowArtsPerformanceLibrary` and `FFlowArtsPerformanceSession` APIs, plus additive avatar transport methods, landed in `08f9c92dfc`. The viewer consumes these methods; runtime fixes remain coordinated with Museum. Its native F6 panel is a game consumer of the same transport. Museum traced its pause smoke failure to observation before avatar and prop ticks; corrected real playback and shared regression checks pass without changing the production pause API. Composer's limited native control slice now has a live browser transport check. Exact user-score playback and full viewer parity still require their own acceptance work.

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
