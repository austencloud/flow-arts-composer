# Camera and tracking resource lifecycle — Train/Practice

Assignment: investigate and fix demonstrated resource lifecycle defects in the
Train/Practice camera and hand-tracking sessions. Cloud checkout, no laptop, no
real camera.

## Result

Two defects found, reproduced with failing tests against the real lifecycle
code, and fixed. Two further defects were found by code trace in
`TrainModePanel.svelte`; they are **reported, not changed**, because proving
them needs a mounted Svelte runtime and a camera, neither of which this session
can exercise honestly.

| SHA                                        | What                                            |
| ------------------------------------------ | ----------------------------------------------- |
| `c4be16199e390e8bdab766051a0042c7827b8d30` | base (`origin/main` at session start)           |
| `49d3f8e3`                                 | fix 1 — camera stream released on close/restart |
| `8dce14cb`                                 | fix 2 — tracking session cancelled during load  |
| this commit                                | this report (branch head)                       |

Branch: `claude/camera-resource-lifecycle-sdoeg6`.

## Owned files

Changed:

- `src/lib/shared/train/services/camera-manager.ts`
- `src/lib/shared/train/components/CameraPreview.svelte`
- `src/lib/features/train/services/media-pipe-detector.ts`
- `src/lib/features/train/services/hand-landmarker.ts`

Added (tests):

- `src/lib/shared/train/services/camera-manager.test.ts`
- `src/lib/features/train/services/media-pipe-detector.test.ts`
- `src/lib/features/train/services/hand-landmarker.test.ts`

Nothing else was touched. No instruction file, no `main`, no deploy, no live
data.

## Defect 1 — a camera stream that arrives after the close is never released

`CameraManager.start()` assigned whatever `getUserMedia` eventually resolved,
with no check that anyone still wanted it. Three orderings leaked:

1. **Close during the permission prompt.** `stop()` runs while the request is
   in flight, finds `_stream === null`, and stops nothing. The request then
   resolves, the tracks are stored in a manager nobody holds anymore, and the
   camera light stays on until the page reloads. Reachable from every consumer
   that stops on teardown: `CameraPreview` (Practice), `VideoRecordPanel` and
   `PerformancePreview` (both on the `getCameraManager()` singleton), and
   `ScanCardSheet`. `VideoRecordPanel` also stops `cameraStream` in `onDestroy`,
   but that variable is only assigned after the await, so on this ordering it is
   still `null` when the teardown runs.
2. **Rapid restart.** Two overlapping `start()` calls both see a null
   `_stream`, so neither stops the other; the second assignment overwrites the
   first and the first stream's tracks are never stopped — two live camera
   streams, one unreachable.
3. **Close during `video.play()`.** The stop stopped the tracks, then the
   continuation set `_isActive = true` anyway, so `isActive` reported a live
   camera over a released one. `ScanCardSheet.tick()` gates its scan loop on
   exactly that flag.

### Fix

Each attempt takes a ticket (`_startTicket`); `stop()` and every newer
`start()` invalidate it. An attempt that comes back on an invalidated ticket
stops the tracks it was handed and rejects with an `AbortError`-named error
(exported as `CAMERA_START_CANCELLED`), which `CameraPreview` treats as "we
cancelled this one" rather than a camera failure, so a closing panel shows no
error text.

### Evidence

`npx vitest run --config tests/config/vitest.config.ts src/lib/shared/train/services/camera-manager.test.ts`

Before `49d3f8e3` (fake tracks + deferred `getUserMedia`, real `CameraManager`):

```
× releases a stream that arrives after the camera was stopped
× releases the stream of a start that a newer start superseded
× does not report an active camera when the stop arrives during playback
✓ can start again after the user denies permission
✓ releases the previous stream when switching cameras
Tests  3 failed | 2 passed (5)
```

Each failure is `expected true to be false` — a fake track still `live`, or
`isActive` true over a released stream. After the fix: `Tests 5 passed (5)`.

The denial-recovery and switch-camera cases passed before and after; they are
there to keep the ticket logic from breaking retry after `NotAllowedError` or
the stop/start inside `switchCamera()`.

## Defect 2 — a tracking session that ends during the MediaPipe load keeps running

`MediaPipeDetector.startRealTimeDetection()` awaited `initialize()` (WASM bundle
plus ~float16 hand model from a CDN — seconds on a cold cache) and then started
its frame loop unconditionally. A `stopDetection()` issued inside that window
was simply lost: `_isDetecting` and `_animationFrameId` were both set _after_
the stop, so the loop it started could no longer be cancelled by the stop that
had already happened. It then ran MediaPipe inference every frame against a
video whose camera was already released. Worse, if a newer session had started
in the meantime, the abandoned one overwrote `_videoElement` and
`_frameCallback` and fed its frames to the dead session's callback — stale
detections updating a newer session.

One layer down, `HandLandmarker` had the matching holes:

- `initialize()` had no in-flight dedup, only an `_isInitialized` check, so two
  callers racing for the first detection each built a MediaPipe landmarker. The
  second assignment overwrote the first; the first's WASM runtime and GPU
  delegate were never `close()`d.
- `dispose()` during the download nulled nothing useful (the instance did not
  exist yet) and the load then assigned its landmarker anyway and set
  `_isInitialized = true`. The owner believed it had released the landmarker
  while a live one sat in the singleton, and because the wrapper now looked
  initialized, the next `initialize()` returned early and silently reused it.

### Fix

- `MediaPipeDetector`: sessions carry an id bumped by every stop and every
  start. The previous session is stopped up front (before the await, so a
  restart cannot keep emitting from the old video), and a load that finishes
  for an id nobody holds returns without starting a loop.
- `HandLandmarker`: concurrent callers share one load promise; a load that
  lands after its generation expired closes its own landmarker and leaves the
  wrapper uninitialized, so the next Train visit builds a fresh one. A failed
  load still clears the slot and can be retried.

### Evidence

`npx vitest run --config tests/config/vitest.config.ts src/lib/features/train/services/media-pipe-detector.test.ts`

Before `8dce14cb` (fake landmarker with a deferred load, fake stabilizer, fake
video, hand-driven `requestAnimationFrame` queue):

```
× never starts a frame loop for a session stopped while the model was loading
× does not let a stopped session take the detector back from a newer one
✓ stops the frame loop and drops the video when detection stops
✓ releases the landmarker and the loop on dispose
Tests  2 failed | 2 passed (4)
```

The first failed on `isDetecting` still true after the stop; the second on the
abandoned session's callback receiving **3** frames that belonged to the live
session. After the fix: `Tests 4 passed (4)`.

`npx vitest run --config tests/config/vitest.config.ts src/lib/features/train/services/hand-landmarker.test.ts`

Before the fix:

```
× builds one landmarker when two callers race for the first detection
× closes a landmarker that finishes loading after dispose
× can load again after dispose interrupted the first load
✓ can retry after a failed load
Tests  3 failed | 1 passed (4)
```

- "closes a landmarker that finishes loading after dispose" failed on
  `close` called 0 times — the late landmarker was kept.
- "can load again after dispose interrupted the first load" failed with 1
  landmarker built instead of 2 — the stale one was silently reused.
- "two callers race" failed because the second caller drove a second real
  MediaPipe load (the stub only covers one `import()`; see the harness note
  below), which is the duplicate-load defect showing itself through the
  harness rather than through a clean count assertion. After the fix only one
  load happens and the assertion is the count.

After the fix: `Tests 4 passed (4)`.

Harness note, recorded in the test file so nobody "simplifies" it away: under
Vitest 4 a hoisted `vi.mock` factory for an external dependency only serves the
**first** dynamic `import()` — a later one gets the real `vision_bundle.mjs`,
which dies in jsdom on `appendChild`. The test registers the stub with
`vi.doMock` in `beforeEach` and warms the subject's import once.

## Verification run

All three files together, project config (jsdom, the environment CI uses):

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/train/services/camera-manager.test.ts \
  src/lib/features/train/services/media-pipe-detector.test.ts \
  src/lib/features/train/services/hand-landmarker.test.ts
→ Test Files 3 passed (3), Tests 13 passed (13)
```

Regression check on the one pre-existing suite that touches this code:

```
npx vitest run --config tests/config/vitest.config.ts tests/unit/camera-permission-boundary.test.ts
→ Tests 2 passed (2)
```

Types and lint:

- `npm run build:packages` (needed first in a fresh checkout; `@tka/domain` and
  `@vtg/domain` are unbuilt otherwise) then `npm run check:tsc` — zero
  diagnostics in any changed or added file. The gate still reports pre-existing
  project-wide errors that do not name these files.
- `npm run check:fast` — 582 errors / 44 warnings project-wide, **none** in
  `src/lib/shared/train/**` or `src/lib/features/train/services/**` (filtered
  by path). That total is the checkout's baseline, not a diff measurement.
- `npx eslint` on all six changed/added `.ts` files — clean. `.svelte` files are
  outside this repo's eslint scope (ignore pattern).

## Evidence classes

- **Measured:** every test result above, the type and lint runs. All of it is
  mocked at the device boundary: fake `MediaStreamTrack`s, a deferred
  `getUserMedia`, a stubbed MediaPipe, a hand-driven animation-frame queue. The
  code under test is the real `CameraManager`, `MediaPipeDetector` and
  `HandLandmarker`.
- **Not measured:** no real camera, no GPU delegate, no browser. Nothing here
  proves device behaviour — in particular, "the camera light goes out" is the
  documented consequence of stopping every track, not something this session
  observed. Real-device and browser verification is still outstanding.
- **Inferred (code trace):** the two `TrainModePanel` findings below, and the
  claim that each leak ordering is reachable from the listed consumers.

## Findings reported, not fixed

Both live in `src/lib/features/train/components/TrainModePanel.svelte`, are
small to fix, and are left alone because the failure and the fix can only be
shown with a mounted component plus a camera. They are the reason defect 2's
window is worth closing even though the current gate usually hides it.

### A. Tracking never starts when the camera wins the race against MediaPipe

`CameraPreview.initCamera()` calls `onFrame?.(videoElement)` exactly once, right
after the stream starts (`src/lib/shared/train/components/CameraPreview.svelte`).
`TrainModePanel.handleFrame()` stores the element and then returns early while
`isDetectionReady` is false, and `isDetectionReady` only flips after
`initDetection()`'s `await detectionService.initialize()` resolves. Nothing calls
`handleFrame` again, and the only other `startRealTimeDetection()` call site (the
grid-mode effect) requires `trainState.isDetectionActive` to already be true.

So whenever the camera becomes ready before the MediaPipe model finishes
downloading — the expected order on a cold cache — hand tracking never starts
for that visit. The user sees a live feed and a grid overlay with no detection,
and no error. Recovering needs a camera error plus the retry button, or a
remount.

Suggested shape (needs runtime verification): replace the one-shot imperative
start with an effect that owns "tracking should be running for this video at
this grid mode", keyed on the video element, `isDetectionReady`,
`trainState.isCameraReady` and `practiceState.gridMode`, stopping detection in
its cleanup. That also subsumes finding B.

### B. A grid-mode change can stop tracking permanently

The restart effect reads `trainState.isDetectionActive` as its gate, writes it
to `false`, and schedules the restart on a 50 ms `setTimeout` whose cleanup
cancels the timer whenever the effect re-runs.

- **Certain from the code:** two grid-mode changes inside 50 ms — first run
  schedules the restart and clears the active flag; the second run's cleanup
  cancels the pending restart and the run itself returns early because the flag
  is now false. Tracking stays stopped, and every later grid-mode change
  returns early for the same reason, so it stays stopped for the rest of the
  visit.
- **Suspected, not confirmed:** the same outcome for a _single_ change, if
  Svelte re-runs the effect because of the `setDetectionActive(false)` write it
  performs itself (`isDetectionActive` is `$state` read through a getter in
  `train-state.svelte.ts`, so it is a tracked dependency). If Svelte schedules
  that re-run, its cleanup cancels the 50 ms timer before it fires. I did not
  confirm Svelte 5's self-invalidation behaviour at runtime, so this half is an
  inference.

Either way the fix is the same effect consolidation as in finding A: do not use
the flag the effect writes as the effect's own gate, and do not hang the restart
on a timer that the next invalidation silently cancels.

### C. Gap, not a defect: no device-change or track-end handling

`CameraManager` enumerates devices once in `initialize()` and never listens to
`navigator.mediaDevices.devicechange` or to a track's `ended` event. Unplugging
a webcam mid-session leaves `isActive` true and the detector looping over a dead
video until the user navigates away. Closing this is a behaviour addition (it
needs a consumer-visible state and copy), not a leak fix, so it is out of this
assignment's scope.

## Limitations

- No real camera, no browser, no device validation; nothing above may be read as
  real-device proof.
- The "camera light stays on" consequence is inferred from the
  `MediaStreamTrack.stop()` contract plus the observed track state in the tests.
- `npm run check:fast`'s 582-error baseline was not compared against a clean
  `main` run; the claim made here is only that no error names a file this branch
  touches.
- Findings A, B and C are code-trace results with no runtime reproduction.
- Not claimed: any user-facing or device gate, visual verification, or
  `wt:finish` integration (cloud session, no primary checkout).
