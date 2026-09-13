# Camera and tracking resource lifecycle — Train/Practice

Assignment: investigate and fix demonstrated resource lifecycle defects in the
Train/Practice camera and hand-tracking sessions. Cloud checkout, no laptop, no
real camera.

## Result

Two defects found, reproduced with failing tests against the real lifecycle
code, and fixed. Two review rounds then added corrections — the
initialize-to-start window, the playback-failure leak, the cancellation identity,
the `PerformancePreview` consumer guard, and handle/stream-scoped teardown so a
panel closing late cannot stop a camera another surface owns — each with its own
before/after evidence (see **Review round**). The resulting teardown and
cancellation surface is written out under **CameraManager teardown and
cancellation contract** for the consumers this branch does not own.

Two findings in `TrainModePanel.svelte` remain **reported, not changed**; proving
them needs the practice surface mounted with a camera.

| SHA                                        | What                                               |
| ------------------------------------------ | -------------------------------------------------- |
| `c4be16199e390e8bdab766051a0042c7827b8d30` | base (`origin/main` at session start)              |
| `49d3f8e3`                                 | fix 1 — camera stream released on close/restart    |
| `8dce14cb`                                 | fix 2 — tracking session cancelled during load     |
| `facdbbda`                                 | first report revision                              |
| `39f0271b`                                 | review round: acquisition fence, playback cleanup, |
|                                            | cancellation identity, PerformancePreview guard    |
| this commit (branch head)                  | cross-branch round: handle/stream-scoped teardown  |
|                                            | so no stale panel stops a shared camera            |

Branch: `claude/camera-resource-lifecycle-sdoeg6`.

## Owned files

Changed:

- `src/lib/shared/train/services/camera-manager.ts`
- `src/lib/shared/train/components/CameraPreview.svelte`
- `src/lib/features/train/services/media-pipe-detector.ts`
- `src/lib/features/train/services/hand-landmarker.ts`
- `src/lib/shared/export-panel/components/single-media/PerformancePreview.svelte`
  (narrow lifecycle guard only, authorized in the review round after the export
  batch was integrated)

Added (tests):

- `src/lib/shared/train/services/camera-manager.test.ts`
- `src/lib/features/train/services/media-pipe-detector.test.ts`
- `src/lib/features/train/services/hand-landmarker.test.ts`
- `src/lib/shared/export-panel/components/single-media/PerformancePreview.svelte.test.ts`
  plus its `PerformancePreviewLifecycleHarness.svelte`

`VideoRecordPanel.svelte` has the same consumer-side hole and is **not** touched
here — it belongs to the recording-session-integrity agent; the exact change it
needs is written out under **Hand-off**. Nothing else was touched. No instruction
file, no `main`, no deploy, no live data.

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
stops the tracks it was handed and rejects with a cancellation error, which
`CameraPreview` treats as "we cancelled this one" rather than a camera failure,
so a closing panel shows no error text. (The first round spelled that error as a
native `AbortError`; the review round replaced it with a distinct
`CameraAcquisitionCancelled` — see item 3 under **Review round**.)

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

## CameraManager teardown and cancellation contract

Stable surface for every consumer, including the ones this branch does not own.
`src/lib/shared/train/services/camera-manager.ts` is the only owner of it.

### Acquiring

```ts
const acquisition = await camera.initialize(config); // CameraAcquisition handle
const stream = await camera.start(acquisition);
```

`initialize()` returns a handle for that one handshake (callers that ignore it
still work; `start()` then falls back to the instance's current acquisition).
A newer `initialize()` becomes the current acquisition, which is how one shared
instance serves several panels in turn.

### Releasing — pick by what you own

| Situation                                          | Call                         | Effect                                                                                              |
| -------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| You own the camera now and want it off             | `stop()`                     | **Instance-wide.** Releases whatever this instance holds and cancels an unstarted handshake.        |
| You are closing and may be stale (shared instance) | `abandonAcquisition(handle)` | Releases only if your handshake is still the current one; otherwise a no-op.                        |
| You hold a stream you no longer want               | `releaseStream(stream)`      | Always stops that stream's tracks; clears instance state only while it is still the current stream. |

So a panel on `getCameraManager()` must **not** call `stop()` in a teardown that
can run after another surface has opened the camera: `stop()` would switch theirs
off. Use the handle, or the stream you were handed. A panel with its own
`new CameraManager()` (`CameraPreview`, `ScanCardSheet`) has no one to collide
with and `stop()` stays correct there.

### Intentional cancellation, distinct from device failure

- Class `CameraAcquisitionCancelled`, `name === "CameraAcquisitionCancelled"`,
  `code === CAMERA_ACQUISITION_CANCELLED` (exported const).
- Test it with `isCameraAcquisitionCancelled(error)` — it matches on the `code`
  as well as `instanceof`, so it holds across bundle boundaries. Never match on
  `error.name === "AbortError"`: `getUserMedia` and `video.play()` raise native
  `AbortError`s for real hardware and playback failures, and those must stay
  visible to the user.
- Thrown **only** for cancellation we caused: by `initialize()` when the
  handshake was cancelled or taken over, and by `start()` when the handshake was
  cancelled/taken over before the request, or invalidated while `getUserMedia`
  or `play()` was pending.
- Guarantee when it is thrown: nothing from that attempt is left open, and no
  newer consumer's stream or handshake was touched.
- Consumer rule: return quietly, show nothing, and do **not** follow it with
  `stop()` — the manager has already cleaned up that attempt. Every other error
  from `start()` is a real failure carrying a user-readable message.

## Review round

Four corrections, each with a failing-first run against the reviewed revision
(`facdbbda`) and a passing run afterwards. The before runs were produced by
restoring the reviewed file in place and re-running the same suite; for the
camera suite the cancellation check was swapped for the reviewed code's identity
(a native `AbortError` name) so the whole file could execute.

### 1. The initialize-to-start window

Consumers acquire the camera in two awaits — `await initialize()` then
`await start()` — and the panel can unmount between them. The ticket from the
first round only covered a request already in flight, so a teardown landing in
that gap opened a **new** camera afterwards, with the teardown already finished
and nothing left to close it. `PerformancePreview` and `VideoRecordPanel` both
have that shape, and they share one instance through `getCameraManager()`.

The manager now treats `initialize()` → `start()` as one acquisition. A `stop()`
inside it cancels the acquisition: `initialize()` rejects (so the caller never
walks into its `start()`), and a `start()` requested afterwards refuses without
calling `getUserMedia`. The next `initialize()` re-arms the instance, which is
what keeps the shared singleton usable for the next panel. A `stop()` after the
camera went live is an ordinary release and still leaves a later `start()` free
to work, so pause/resume and `switchCamera()` keep working — two tests pin that
down so the fence cannot grow into a refusal of normal restarts.

Before (reviewed revision, same suite):

```
× refuses the start queued behind an initialize the owner abandoned
  → expected "vi.fn()" to not be called at all, but actually been called 1 times
× refuses a start requested after the owner released the camera
  → expected "vi.fn()" to not be called at all, but actually been called 1 times
✓ re-arms the shared manager for the next panel that initializes
✓ still allows a start after the camera was released while live
```

Those two `getUserMedia` calls are the leak: a camera opened after teardown.

### 2. A playback failure left the tracks live

`getUserMedia` hands over a live stream before `video.play()` is awaited. A
`play()` rejection — autoplay policy, or the native `AbortError` raised when the
element is torn down mid-load — threw straight past the assignment, so the
manager held a live stream, reported `isActive === false`, and the consumer
showed an error over a camera that was still on. Any failure after the handover
now releases the stream it was handed, checked against the stream it actually
assigned so a newer start's stream is never stolen.

Before: `× releases the camera when playback fails to start → expected true to be false`
(the fake track was still `live`).

### 3. Cancellation identity

The first round reused the platform's `AbortError` name for "we cancelled this".
`getUserMedia` and `play()` both raise native `AbortError`s for real failures, so
`CameraPreview` was swallowing those too — a genuinely broken camera would have
sat on "initializing" with no message. There is now a
`CameraAcquisitionCancelled` class with a `CAMERA_ACQUISITION_CANCELLED` code and
an `isCameraAcquisitionCancelled()` guard (code-based, so it survives bundle
boundaries); consumers test that instead of a name.

Before: `× reports a native AbortError from the device as a camera failure →
expected true to be false` — the device's `AbortError` was classified as our own
cancellation.

### 4. PerformancePreview consumer guard

Authorized in this round (export batch already integrated; `VideoRecordPanel`
deliberately left alone). `initializeCamera()` now checks a `destroyed` flag after
each await, stops a stream that arrives after the close, and ignores a
cancellation error instead of writing it into `error`.

Proved in the browser against the real component:

```
npx vitest run --config <components config> \
  src/lib/shared/export-panel/components/single-media/PerformancePreview.svelte.test.ts
```

| test                                                        | before                                           | after |
| ----------------------------------------------------------- | ------------------------------------------------ | ----- |
| does not open the camera when the panel closes during setup | × start called 1 time after the panel closed     | ✓     |
| releases a stream that arrives after the panel closed       | × track still `live` ('live' instead of 'ended') | ✓     |

The component mounts through a small harness that supplies the export panel
state it reads from context and can unmount the preview mid-flight.

### 5. Cross-branch round: no stale instance-wide stop

Raised by the recording agent: a consumer's `destroyed` teardown must not call
`stop()` on the shared instance after its own start was already cancelled and
cleaned up — it would switch off a newer consumer's camera. Correct, and the
first version of the `PerformancePreview` guard did exactly that (`stop()` in the
destroyed branch, and an unconditional `stop()` in `onDestroy`).

The manager now offers the two targeted calls in the contract above, and
`PerformancePreview` uses only those: `abandonAcquisition(handle)` when it closes
mid-handshake, `releaseStream(stream)` for a stream it holds or receives late,
and no `stop()` anywhere.

Component suite, before (the reviewed revision's guard) and after:

| test                                                                  | before                                  | after |
| --------------------------------------------------------------------- | --------------------------------------- | ----- |
| does not open the camera when the panel closes during setup           | × instance-wide `stop()` called 1 time  | ✓     |
| releases a stream that arrives after the panel closed                 | × instance-wide `stop()` called 2 times | ✓     |
| releases its own stream on close without stopping the shared instance | × instance-wide `stop()` called 1 time  | ✓     |

Manager suite, four new two-consumer cases (one instance, two panels in turn):

- a stale panel's `releaseStream()` leaves the newer panel's camera live;
- a stale panel's `abandonAcquisition()` leaves it live too;
- a `start()` whose handshake a newer panel took over refuses, with
  `getUserMedia` never called;
- `abandonAcquisition()` from the current owner does release the camera.

Plus one test that pins the boundary deliberately — `stop()` **does** release the
current panel's camera, which is precisely why a possibly-stale teardown must use
the targeted calls instead. There is no before/after for these four: the methods
did not exist in the reviewed revision, so the failing-first evidence for this
item is the component table above.

### 6. HandLandmarker fencing — already fixed, now proved for remount

The reviewed revision already had the generation/disposal fencing (`8dce14cb`):
concurrent callers share one load, and a load that lands after `dispose()` closes
its own landmarker. The remount case the review names — unmount and re-enter
Train while the model is downloading, so two loads are genuinely in flight — is
now pinned by its own test:

```
keeps one landmarker when Train remounts while the model is loading
  at c4be1619 (pre-fix): × expected [ …, … ] to have a length of 1 but got 2
  at HEAD:              ✓
```

Two landmarkers were built and **both stayed open** before the fix; now the
abandoned one closes itself and exactly one survives for the live panel.

## Hand-off: VideoRecordPanel (recording-session-integrity agent)

`src/lib/shared/video-record/components/VideoRecordPanel.svelte` needs the same
narrow guard, and it shares the instance through `getCameraManager()`, so every
teardown call has to be scoped to its own handshake — no instance-wide `stop()`
on a path that can run late. Precise change, nothing else:

1. Add `let destroyed = false;` beside the other camera locals, and set it first
   in the existing `onDestroy`.
2. Keep the handle: `const acquisition = await cameraService.initialize({...});`
   then `if (destroyed) { cameraService.abandonAcquisition(acquisition); return; }`
3. `const stream = await cameraService.start(acquisition);` then
   `if (destroyed) { cameraService.releaseStream(stream); return; }` — the
   existing `onDestroy` stops `cameraStream`, but on this ordering `cameraStream`
   is still `null` when teardown runs, which is the leak.
4. In `onDestroy`, replace `cameraService.stop()` +
   `cameraStream.getTracks()...` with
   `if (cameraService && cameraStream) cameraService.releaseStream(cameraStream);`
   — same outcome for this panel, and it cannot take another surface's camera
   with it.
5. In the `catch`, return early for `isCameraAcquisitionCancelled(err)` (imported
   from `$lib/shared/train/services/camera-manager`) instead of writing it into
   `cameraError`.

The manager-level fence already stops a camera from being opened after that
panel's teardown, so this guard is about the panel's own error state, the stream
it receives, and not disturbing whoever owns the camera next.

## Verification run

Project config (jsdom, the environment CI uses), all owned suites plus the one
pre-existing suite that touches this code:

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/train/services/camera-manager.test.ts \
  src/lib/features/train/services/media-pipe-detector.test.ts \
  src/lib/features/train/services/hand-landmarker.test.ts \
  tests/unit/camera-permission-boundary.test.ts
→ Test Files 4 passed (4), Tests 27 passed (27)
```

Component suite (chromium, `tests/config/vitest.components.config.ts`):
`PerformancePreview.svelte.test.ts` → 3 passed. In this container the run needed
a Playwright `executablePath` override (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`):
the pinned Playwright expects a headless-shell build the image does not carry.
That override lived in a throwaway config and is **not** committed — CI and the
laptop run the file with the project config unchanged.

Types and lint:

- `npm run build:packages` (needed first in a fresh checkout; `@tka/domain` and
  `@vtg/domain` are unbuilt otherwise) then `npm run check:tsc` — zero
  diagnostics in any changed or added file. The gate still reports pre-existing
  project-wide errors that do not name these files.
- `npm run check:fast` — 582 errors / 44 warnings project-wide, **none** in
  `src/lib/shared/train/**`, `src/lib/features/train/services/**` or
  `src/lib/shared/export-panel/components/single-media/**` (filtered by path).
  That total is the checkout's baseline — identical before and after this round,
  so this branch adds none — not a diff measurement.
- `npx eslint` on every changed/added `.ts` file — clean. `.svelte` files are
  outside this repo's eslint scope (ignore pattern).

## Evidence classes

- **Measured:** every test result above, the type and lint runs. The device
  boundary is mocked throughout: fake `MediaStreamTrack`s, a deferred
  `getUserMedia` and `enumerateDevices`, a rejectable `play()`, a stubbed
  MediaPipe, a hand-driven animation-frame queue. The code under test is the real
  `CameraManager`, `MediaPipeDetector`, `HandLandmarker` and — in the browser
  suite — the real `PerformancePreview` component.
- **Not measured:** no real camera, no GPU delegate. Nothing here proves device
  behaviour — in particular, "the camera light goes out" is the documented
  consequence of stopping every track, not something this session observed.
  Real-device verification is still outstanding.
- **Inferred (code trace):** the two `TrainModePanel` findings below, the
  `VideoRecordPanel` hand-off, and the claim that each leak ordering is reachable
  from the listed consumers.

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

- No real camera and no device validation; nothing above may be read as
  real-device proof. Headless chromium ran the `PerformancePreview` suite, with
  the camera manager stubbed — that is a real Svelte runtime, not a real device.
- The "camera light stays on" consequence is inferred from the
  `MediaStreamTrack.stop()` contract plus the observed track state in the tests.
- `npm run check:fast`'s 582-error total is identical before and after this
  branch's changes in this checkout; it was not compared against a separate clean
  `main` run, so the claim is "this branch adds none", not a baseline audit.
- Findings A, B and C are code-trace results with no runtime reproduction, as is
  the `VideoRecordPanel` hand-off.
- Not claimed: any user-facing or device gate, visual verification, or
  `wt:finish` integration (cloud session, no primary checkout).
- The component suite needed a local Playwright `executablePath` override here;
  that override is not committed, so nothing about the project's test
  configuration changed.
