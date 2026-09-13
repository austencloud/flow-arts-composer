# Recording Session Integrity

Opus batch 2026-09-12. Scope: `src/lib/shared/video-record` and
recording-specific tests only.

- Base SHA: `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`)
- Recorder reproduction: `c2b4b362`. Recorder fix:
  `5d6e36340230034e322beae3bec06a1f9e108fce`.
- Panel reproduction: `51e390a8`. Panel fix:
  `f50841d7`, the final code SHA.
- Branch: `claude/fix-recording-lifecycle-tum13f`. Its head is the commit that
  last edited this report.

## Owned files

| File                                                                     | Change                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| `src/lib/shared/video-record/services/video-recorder.ts`                 | Stop lifecycle and pause accounting fixes |
| `src/lib/shared/video-record/components/VideoRecordPanel.svelte`         | Camera acquisition lifecycle guard        |
| `tests/unit/video-record/video-recorder-lifecycle.test.ts`               | New. 7 lifecycle tests                    |
| `tests/unit/video-record/fake-media-recorder.ts`                         | New. Controllable MediaRecorder fake      |
| `src/lib/shared/video-record/components/VideoRecordPanel.svelte.test.ts` | New. 3 browser component tests            |
| `docs/reports/opus-batch-2026-09-12/recording-session-integrity.md`      | This report                               |

Nothing under `camera-manager`, `CameraPreview`, MediaPipe, `video-export`, or
`export-panel` was touched. `recording-persister.ts`, the other three
`video-record/components/*.svelte` files, and
`state/video-record-settings.svelte.ts` are unchanged.

## Method

The tests drive the real `VideoRecorder` class (not a mock of it) against a
controllable `MediaRecorder` fake that models the part of the spec the
lifecycle actually depends on: `stop()` flips `state` to `"inactive"`
synchronously, then queues the final `dataavailable` followed by `stop`.
Nothing is delivered until the test calls `flush()`, so a test can act inside
the window where the recorder is already inactive but its last chunk has not
arrived. Each recorder instance labels its chunks `s1-chunk1`, `s2-chunk1` and
so on, so a blob assembled from the wrong session is visible in the assertion
rather than inferred from a byte count. `Date.now` is stubbed with a
controllable clock; timers stay real so `fake-indexeddb` works normally. No
real camera, microphone, or `getUserMedia` call is involved.

## Defect 1: stop did not wait for the recorder

`stopRecording` attached `onstop` and `onerror` at stop time and treated
`mediaRecorder.state === "inactive"` as proof the recording was complete.

Three measured consequences.

**Lost tail chunk.** A recorder that ends on its own, which is what happens
when the camera track is dropped or the tab is suspended, is inactive while its
final `dataavailable` is still queued. The old code took the inactive branch and
built the blob from the chunks that had arrived so far. Measured before the fix:
the saved blob contained `s1-chunk1` and not `s1-chunk2`, the chunk the recorder
went on to deliver. The loss is silent. The file plays, it is just short.

**Stranded first caller.** A second `stopRecording` call for the same id
overwrote the first caller's `onstop` handler, so the first promise never
settled, and the second caller resolved immediately off the inactive branch with
a blob missing the last chunk. Measured before the fix: the first call did not
settle within a 2000 ms guard. Reachable by double-tapping stop, and by a stop
press landing on the `maxDuration` auto stop, which calls `stopRecording`
itself from the progress interval.

**Leaked entry on failure.** When the recorder raised an error the promise
rejected and the `this.activeRecordings.delete(recordingId)` line below it never
ran, so the dead recording stayed in the map. Measured before the fix:
`getRecordingState(id)` returned `"stopped"` instead of `"idle"` after the
failure.

Fix: `onstop` and `onerror` are wired at start time into a single `stopped`
promise stored on the recording state; `finalizeRecording` waits for that
promise instead of for the inactive flag; `stopRecording` stores and returns one
in-flight finalization so every caller joins it; the map delete happens in a
`finally`.

## Defect 2: paused wall-clock time counted as recorded time

`pausedDuration` only accrues on resume, so `getCurrentDuration` counted a pause
that was still open as recorded time.

**Inflated saved duration.** Record 1 s, pause, wait 5 s, stop. Measured before
the fix: `result.duration` was `6`. That value is what
`VideoRecordCoordinator` writes to the Firestore recording document and what the
panel's duration badge shows on playback.

**Auto stop on a paused recording.** Because progress kept climbing while
paused, `currentDuration >= maxDuration` could become true with nothing being
captured. Measured before the fix with `maxDuration: 2`: progress updates
carrying `state: "paused"` reported `61.5` s.

Fix: `durationOf(state)` subtracts the still-open pause as well as
`pausedDuration`, and is floored at zero.

## Before and after

Same test file against both trees, `vitest run --config
tests/config/vitest.config.ts tests/unit/video-record/video-recorder-lifecycle.test.ts`.

| Test                                                             | Before | After |
| ---------------------------------------------------------------- | ------ | ----- |
| keeps the final chunk when the recorder ended on its own         | fail   | pass  |
| resolves when the recorder already finished and delivered chunks | pass   | pass  |
| resolves every caller when stop is requested twice in a row      | fail   | pass  |
| never carries chunks from a finished session into the next one   | pass   | pass  |
| releases the recording when the recorder fails during stop       | fail   | pass  |
| excludes paused wall-clock time from the reported duration       | fail   | pass  |
| keeps progress frozen while paused instead of auto-stopping      | fail   | pass  |

Before: 5 failed, 2 passed. After: 7 passed.

The two that passed in both directions are deliberate guards rather than
reproductions. The "already finished" case checks that waiting for the stop
event does not hang when the event has already fired, which is the edge the
removed inactive branch used to cover. The cross-session case checks that the
handler rewiring did not let one session's chunks reach another session's blob.

## Other verification

| Check                                                                                   | Result                       |
| --------------------------------------------------------------------------------------- | ---------------------------- |
| `tsc --noEmit --strict` on `video-recorder.ts` (self-contained, imports only `./types`) | clean                        |
| `eslint src/lib/shared/video-record/services/video-recorder.ts`                         | clean                        |
| `prettier --check` on `video-recorder.ts` and both new unit-test files                  | clean                        |
| `vitest run tests/unit/shared src/lib/shared/video-record tests/unit/video-record`      | 13 files, 81 tests, all pass |

`tests/unit/shared/firestore/firestore-crud.test.ts` and
`firestore-get-detailed.test.ts` initially failed to resolve `@tka/tka-types`.
That is a fresh-checkout condition, not a regression: the workspace package had
no `dist` yet. After `npm run build:packages` both pass. Neither file, nor
anything in the recording path, imports code this change touches.

The two consumers of the service, `VideoRecordPanel.svelte` and
`export-panel/components/single-media/PerformancePreview.svelte`, call
`startRecording`, `stopRecording`, `pauseRecording`, `resumeRecording`,
`cancelRecording`, `isRecording`, and `getRecordingState`. All signatures and
return shapes are unchanged, so neither component needed an edit. No browser
pass was run: the diff changes no rendered geometry, and this environment has no
camera to grant.

## Defect 3: the camera could open after the panel was destroyed

Raised by the camera review, which owns `camera-manager`, `CameraPreview`, and
MediaPipe. The consumer, `VideoRecordPanel`, is in this scope. The path still
existed at `f50841d7`'s parent and is now reproduced and fixed caller-side.

`initializeCamera` awaited `cameraService.initialize()`, which awaits
`enumerateDevices`, and then called `cameraService.start()` unconditionally,
which awaits `getUserMedia`. That second await is not a short one: an unanswered
permission prompt holds it open for as long as the user ignores it. A panel
destroyed anywhere inside that window ran `onDestroy` first, where
`cameraService.stop()` found no stream and `cameraStream` was still null, so
both teardown steps were no-ops. The camera then opened with nothing left to
close it, and the capture indicator stayed lit.

Measured against the pre-fix tree:

- destroyed while `initialize()` was pending: `start()` was still called, so the
  panel asked for the camera after it was gone
- destroyed while `start()` was pending: the `MediaStream` that arrived
  afterwards still had `readyState === "live"` tracks

Fix, entirely in the consumer: a `destroyed` flag set at the top of `onDestroy`
and checked after each await, plus a `releaseCamera` helper that stops the
manager and ends the tracks of a stream that arrives too late. `onDestroy` now
routes through the same helper instead of repeating the stop-then-stop-tracks
pair. The `catch` branch releases as well, because `CameraManager.start()`
assigns its `_stream` before awaiting `play()`, so a failure after teardown can
still have left a device open.

Nothing was changed in `camera-manager`. The guard is written against its
public contract (`initialize`, `start`, `stop`), so it composes with whatever
the camera agent changes inside the manager. The manager still has no
cancellation token of its own, which is that agent's call, not this one's.

### Before and after

`vitest run --config tests/config/vitest.components.config.ts
src/lib/shared/video-record/components/VideoRecordPanel.svelte.test.ts`

| Test                                                              | Before | After |
| ----------------------------------------------------------------- | ------ | ----- |
| does not open the camera when destroyed while enumerating devices | fail   | pass  |
| ends a stream that arrives after the panel is destroyed           | fail   | pass  |
| still opens the camera for a panel that stays mounted             | pass   | pass  |

Before: 2 failed, 1 passed. After: 3 passed. The third is the control: it would
catch a guard that simply stopped acquiring cameras.

The tests stand in a contract-faithful fake for the camera manager rather than
the real one, so they do not break when the camera agent changes it, and so
they assert what this consumer owes the contract. The stream they hand back is
a real `MediaStream` from `canvas.captureStream()`, so teardown is read off the
tracks' own `readyState` rather than off a spy, and no camera permission is
involved.

### Environment note

`npm run test:components` could not launch as configured here: playwright
1.61.1 looks for chromium build 1228 and this container ships 1194, which the
environment says not to re-download. The run above used a scratchpad config
that extends `tests/config/vitest.components.config.ts` and only overrides the
provider's `executablePath` to `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
Nothing else differs, and no config file in the repository was changed. The
harness itself was confirmed working first by running an existing suite,
`SegmentedControl.svelte.test.ts`, 10 tests, all passing.

`svelte-fast-check` (`npm run check:fast`) reports no diagnostic in any
`video-record` file. The project-wide run does report pre-existing errors
elsewhere (Google Maps typings, a missing `PUBLIC_GOOGLE_MAPS_API_KEY` export),
none of them in this scope.

`prettier --check` flags `VideoRecordPanel.svelte`, and flagged it identically
before this change: two pre-existing lines, an import and a `<mod.default>` tag,
are wrapped wider than prettier wants. Reformatting them would put unrelated
lines in this commit, so they were left alone. Every line this change adds is
already prettier-clean.

## Claim types

Measured, by assertion against the real service: every row in the before/after
table, and each numeric value quoted above.

Inferred, from reading the code and its callers, not observed at runtime: that
the lost tail chunk is caused by a dropped camera track specifically, and that
the inflated duration reaches the Firestore document through
`VideoRecordCoordinator`. The failure mechanism is reproduced; the real-world
trigger for it is not.

For defect 3, measured: both failing states and the fix, in a real Chromium
through the browser component harness, with real `MediaStreamTrack` teardown.
Mocked: the camera manager itself, deliberately, since another agent owns it.
Inferred, from reading `camera-manager.ts` at
`6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` and not observed: that
`initialize()` really does await `enumerateDevices`, that `start()` assigns
`_stream` before awaiting `play()`, and that `stop()` on a manager with no
stream yet is a no-op. No real camera or `getUserMedia` call was made anywhere
in this work.

## Risks

`finalizeRecording` now depends on the recorder firing `stop`, with no timeout.
The previous code had an escape hatch, the inactive branch, but that branch is
exactly the defect: it resolved early with an incomplete blob. Because the
handlers are now attached before `start()`, no `stop` or `error` event can be
missed for a recorder this service created. A browser that goes inactive and
fires neither would leave the promise pending. The panel would stay on the
recording controls with no toast. This was not observed, and no such browser is
known.

Duration is now frozen when stop is requested rather than when the recorder
finishes flushing. That is the intended reading, but it makes saved durations
slightly shorter than before on a recorder that takes time to flush.

`releaseCamera` calls `cameraService.stop()`, and the camera manager is a
module-level singleton shared with `CameraPreview` and `PerformancePreview`. A
late release therefore stops whatever that singleton currently holds, which
could belong to another consumer that mounted in between. The previous
`onDestroy` already called `cameraService.stop()` unconditionally, so this is
the existing coupling reaching one step further, not a new one. Making
acquisition per-consumer belongs to the camera manager's owner.

## Follow-ups, not fixed here

1. **The auto stop drops its result.** When `maxDuration` is reached the
   progress interval calls `stopRecording` and discards the resolved
   `RecordingResult`. `VideoRecordPanel` learns nothing, so it keeps showing
   pause, stop, and cancel for a recording that has already ended, and a later
   stop press gets `"Recording not found"`. Fixing it means deciding what the
   panel should do at the cap, which is a product choice, and probably widening
   `RecordingProgress` or adding a completion callback. Out of scope for a
   defect fix. Read from the code, not reproduced in a browser.

2. **Cached blob URLs are not revoked on clear.** `getCachedRecording` records
   its URL in `cachedBlobUrls` and revokes the previous one for the same id, but
   `clearCachedRecording` and `clearAllCachedRecordings` delete the IndexedDB
   rows without revoking anything in that map. Each cleared recording keeps one
   object URL alive for the life of the document. Read from the code, not
   measured.

3. **MIME fallback can throw instead of falling back.** `startRecording` checks
   `isTypeSupported` for the preferred type and for `video/webm`, then uses
   `video/mp4` unchecked. If none of the three is supported the `MediaRecorder`
   constructor throws `NotSupportedError` and the panel shows a generic start
   failure. Constructing without an explicit `mimeType` would let the browser
   pick its own default, but that changes the output container, which is a
   product choice this brief excludes. Read from the code, not reproduced.

4. **`PerformancePreview` has the same acquisition race.** It is in
   `export-panel`, owned by the export agent, so it was not touched. Its
   `initializeCamera` has the same shape: await `initialize()`, then call
   `start()` with no check that the component is still alive. The same
   caller-side guard would close it. Read from the code, not reproduced.

5. **The camera manager has no cancellation of its own.** `CameraManager.stop()`
   clears `_stream` and `_isActive`, but an in-flight `start()` that resolves
   afterwards assigns `_stream` and sets `_isActive = true` again, so the
   manager can come back to life after being stopped. Every consumer guard is
   working around that. It belongs to the camera agent. Read from
   `camera-manager.ts`, not reproduced.
