# Recording Session Integrity

Opus batch 2026-09-12. Scope: `src/lib/shared/video-record` and
recording-specific tests only.

- Base SHA: `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`)
- Recorder reproduction: `c2b4b362`. Recorder fix:
  `5d6e36340230034e322beae3bec06a1f9e108fce`.
- Panel acquisition reproduction: `51e390a8`. Panel acquisition fix:
  `f50841d7`.
- Cross-consumer reproduction: `71646363`. Cross-consumer correction:
  `e19878a5`.
- Cancel-during-finalize and self-end reproduction: `838113d7`. Fix:
  `c1305fb1`.
- Cache-window cancellation reproduction: `a28ec6a7`. Fix: `56a987a4`.
- Teardown-ownership reproduction and TS2558 fix: `f65a696d`. Fix:
  `d67cabd3`, the final code SHA.
- Branch: `claude/fix-recording-lifecycle-tum13f`. Its head is the commit that
  last edited this report.
- Read, never edited, for contract alignment:
  `claude/camera-resource-lifecycle-sdoeg6`, at `39f0271b` and then at
  `7700457c`.

Defect numbers are identifiers, matching the commit messages, not a reading
order. Defects 1, 2, 5, 6 and 7 are in `video-recorder.ts` and are covered by
the first before-and-after table. Defects 3, 4 and 8 are in
`VideoRecordPanel.svelte` and have their own. Defects 4, 5, 6, 7 and 8 were
found by review inside earlier fixes on this branch rather than in the code it
started from: 4 inside the fix for 3, 5 and 6 inside the fix for 1, 7 inside
the fix for 5, and 8 inside the fix for 4.

## Owned files

| File                                                                     | Change                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| `src/lib/shared/video-record/services/video-recorder.ts`                 | Stop lifecycle and pause accounting fixes |
| `src/lib/shared/video-record/components/VideoRecordPanel.svelte`         | Camera acquisition lifecycle guard        |
| `tests/unit/video-record/video-recorder-lifecycle.test.ts`               | New. 11 lifecycle tests                   |
| `tests/unit/video-record/fake-media-recorder.ts`                         | New. Controllable MediaRecorder fake      |
| `src/lib/shared/video-record/components/VideoRecordPanel.svelte.test.ts` | New. 7 browser component tests            |
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

## Defect 5: a cancelled take was still saved

Found by the recording review of `639ea6312d`, in the defect-1 fix rather than
in the original code. `cancelRecording` cleared the progress interval and
deleted the map entry, which is everything the old synchronous stop path
needed. `finalizeRecording` holds the state object directly, so a cancel that
lands while it is awaiting the stop event changes nothing for it: the delete
removes a map entry it no longer reads.

Measured before the fix, cancelling between the stop request and the recorder's
flush: the finalization went on to build the blob, call `URL.createObjectURL`,
write the take to IndexedDB, and return `success: true`. Every one of those is
wrong for a discarded take. The object URL is never revoked, because the panel
only revokes URLs it was handed and it threw this recording away; the discarded
video sits in the cache; and a panel that cancelled on `onDestroy` gets a
successful result it would have rendered as a finished video.

Fix: cancellation is ownership state on the recording. `cancelRecording` sets
`state.cancelled` before anything else, and `finalizeRecording` checks it after
the await, returning `{ success: false, error: "Recording cancelled" }` without
creating a URL or touching storage.

## Defect 7: the cancellation window closed too early

Found by the re-review of `0d7504b4`, in the defect-5 fix. Marking cancellation
on the state only helps for as long as a canceller can find the state.
`finalizeRecording` deleted its map entry as soon as the stop event landed,
which is one await short of the end: `cacheRecording` is still ahead of it, and
an IndexedDB write is not instant. A panel torn down in that window called
`cancelRecording`, which found no recording, logged `No recording found with ID`
and returned.

Measured before the fix, cancelling after the recorder had fully flushed and
while the cache write was open: the finalization persisted the discarded take,
minted the object URL, and returned `success: true`. The same three wrong
outcomes as defect 5, through the one gap its fix left open.

Fix: the entry stays in `activeRecordings` for the whole finalization and is
removed in a `finally`, so `cancelRecording` can reach a recording that is
mid-write. After the cache write the finalization rechecks, and if the cancel
landed there it clears the row it just wrote before returning the cancelled
result. The object URL is minted after that last check with nothing awaited
between the two, so the URL window is closed by construction rather than by
another rollback.

`clearCachedRecording` also now resolves on its transaction rather than on the
call. It is the rollback path and it was reporting completion before the delete
committed. This one is reasoning about the IndexedDB contract, not a measured
fix: reverted on its own, the test still passes, because fake-indexeddb orders
the read-back after the write either way.

## Defect 6: a self-ended recorder was charged for the wait

Same review. Duration was sampled when stop was requested. A recorder that ends
on its own — dropped camera track, suspended tab — finishes long before anyone
presses stop, and nothing was recorded in between.

Measured before the fix, recorder ending at 5 s and stop pressed at 20 s:
`result.duration` was `20`. That is the number `VideoRecordCoordinator` writes
to the Firestore recording document for a five-second video.

The progress timer kept running across that gap too. Measured: four progress
updates where two were due, each reporting a duration still climbing, which is
also a `maxDuration` auto-stop waiting to fire on a recorder that already
stopped.

Fix: the terminal handlers record `endedAt` and clear the progress timer, and
`durationOf` measures to `endedAt` when the recorder has ended. Resolving a
single `now` for the whole calculation fixes an open pause at that moment as
well, which previously kept widening after the recorder was gone.

## Before and after

Same test file against each tree, `vitest run --config
tests/config/vitest.config.ts tests/unit/video-record/video-recorder-lifecycle.test.ts`.

| Test                                                                 | At base | At `639ea6312d` | At `0d7504b4` | Now  |
| -------------------------------------------------------------------- | ------- | --------------- | ------------- | ---- |
| keeps the final chunk when the recorder ended on its own             | fail    | pass            | pass          | pass |
| resolves when the recorder already finished and delivered chunks     | pass    | pass            | pass          | pass |
| resolves every caller when stop is requested twice in a row          | fail    | pass            | pass          | pass |
| never carries chunks from a finished session into the next one       | pass    | pass            | pass          | pass |
| releases the recording when the recorder fails during stop           | fail    | pass            | pass          | pass |
| keeps nothing from a recording cancelled while the stop was flushing | n/a     | fail            | pass          | pass |
| rolls back a recording cancelled while the cache write was open      | n/a     | n/a             | fail          | pass |
| excludes paused wall-clock time from the reported duration           | fail    | pass            | pass          | pass |
| keeps progress frozen while paused instead of auto-stopping          | fail    | pass            | pass          | pass |
| does not charge the recording for the wait before the stop press     | n/a     | fail            | pass          | pass |
| stops reporting progress once the recorder has ended on its own      | n/a     | fail            | pass          | pass |

Defects 1 and 2: 5 failed, 2 passed, then 7 passed. Defects 5 and 6: 3 failed,
7 passed, then 10 passed. Defect 7: 1 failed, 10 passed, then 11 passed, stable
over three consecutive runs. Each row marked `n/a` was written only once a
review named the case, and each was confirmed failing against the tree in the
column to its right before its fix went in.

Two pass in every column and are deliberate guards rather than reproductions.
The "already finished" case checks that waiting for the stop event does not hang
when the event has already fired, which is the edge the removed inactive branch
used to cover. The cross-session case checks that the handler rewiring did not
let one session's chunks reach another session's blob.

## The test files were not being type-checked

The independent review of `5fc424aa` found a `gate<void>()` call against a
non-generic `gate()` helper in the recorder test: `TS2558`, two call sites.
Vitest strips types without checking them, so eleven tests passed on code that
does not compile.

The reason it survived is structural, and worth recording. `tsconfig.json`
overrides the SvelteKit config's `include` with `src/**` only, so nothing in the
repository type-checks `tests/` at all — `npm run check`, `check:fast` and
`check:tsc` all skip it. The earlier "narrow type proof" on this branch ran
`tsc` over `video-recorder.ts` alone, which is exactly the file that was fine.
A component test under `src/` like `VideoRecordPanel.svelte.test.ts` _is_
covered; anything under `tests/` is not.

The type proof used from now on covers the tests as well, via a scratchpad
config, since a second root `tsconfig.*` is shared surface this scope does not
own:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "incremental": false,
    "types": ["vite/client", "vitest/globals"],
    "paths": {
      "$lib": ["./src/lib"],
      "$lib/*": ["./src/lib/*"],
      "$app/environment": ["./tests/setup/stubs/app-environment.ts"],
      "$app/navigation": ["./tests/setup/stubs/app-navigation.ts"],
      "$app/state": ["./tests/setup/stubs/app-state.ts"],
      "$app/stores": ["./tests/setup/stubs/app-stores.ts"],
      "$env/dynamic/public": ["./tests/setup/stubs/env-dynamic-public.ts"],
      "$env/static/public": ["./tests/setup/stubs/env-static-public.ts"]
    }
  },
  "include": [
    "tests/unit/video-record/**/*.ts",
    "src/lib/shared/video-record/**/*.ts"
  ]
}
```

Written to the project root as a throwaway file and run with `npx tsc -p`. It
reproduces the reported error verbatim —
`video-recorder-lifecycle.test.ts(259,31): error TS2558: Expected 0 type
arguments, but got 1` — and exits clean once the type arguments are removed. The
`paths` block is there because the config's own `include` drops the SvelteKit
ambient declarations, so `$app/*` and `$env/*` are pointed at the same stubs the
vitest config uses.

## Other verification

| Check                                                                                   | Result                       |
| --------------------------------------------------------------------------------------- | ---------------------------- |
| `tsc -p` narrow config above, over the recording tests and service                      | clean                        |
| `tsc --noEmit --strict` on `video-recorder.ts` (self-contained, imports only `./types`) | clean                        |
| `eslint src/lib/shared/video-record/services/video-recorder.ts`                         | clean                        |
| `prettier --check` on every changed file except the pre-existing panel wrapping         | clean                        |
| `npm run check:fast`                                                                    | no `video-record` diagnostic |
| `vitest run tests/unit/shared src/lib/shared/video-record tests/unit/video-record`      | 13 files, 85 tests, all pass |

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
and checked after each await, releasing the stream when it arrives too late.

Nothing was changed in `camera-manager`.

## Defect 4: a cancelled attempt stopped the shared camera

Found by the cross-branch review of `639ea6312d`, and a defect in the defect-3
fix rather than in the original code. That fix routed every cleanup path
through one `releaseCamera` helper whose first act was `cameraService.stop()`,
including the `catch` branch, which ran with no stream of its own.

`getCameraManager()` is a module-level singleton, and `PerformancePreview`
reaches the same instance. `stop()` on it is global. With the ticketed manager
on `claude/camera-resource-lifecycle-sdoeg6`, an invalidated `start()` rejects
only after the manager has already released whatever that attempt opened, so by
the time the destroyed panel's `catch` ran it owned nothing, and its global stop
landed on whichever consumer had acquired the camera since. A live panel loses
its camera and cannot tell why.

Measured against `639ea6312d`, with a second consumer acquiring the singleton
between teardown and the stale attempt settling:

- stale `start()` rejects: the new consumer's tracks went to
  `readyState === "ended"`
- stale `start()` resolves late: the new consumer's tracks ended alongside the
  stale one's

Fix: cleanup by ownership. `releaseOwnStream` ends the tracks of the stream this
panel was actually handed and touches nothing else. The one global stop left is
in `onDestroy`, where the panel still owns the attempt at that instant and where
`stop()` is also the manager's cancel signal for the handshake.

### Alignment with the cancellation contract

The camera agent is replacing the generic `AbortError` with a named
`CameraAcquisitionCancelled` plus an `isCameraAcquisitionCancelled` predicate,
so that silencing cancellation does not also silence a real
`getUserMedia`/`play()` abort. This guard decides from its own teardown and
never from the error's identity, so it is correct against the current manager
and the ticketed one, and it needed no import that does not yet exist on `main`.

One alignment gap remains, for the camera agent to settle rather than for this
branch to guess. A panel that is still mounted when a newer consumer's `start()`
invalidates its ticket currently paints the cancellation message as a camera
error with a retry button, where `CameraPreview` and `PerformancePreview` return
silently and leave their spinner up. Once `isCameraAcquisitionCancelled` is on
`main` this becomes one line in the `catch`. Adding it now would mean copying
their sentinel string into this file, which is the duplicate their predicate
exists to prevent.

## Defect 8: teardown itself still stopped the shared camera

Found by the independent review of `5fc424aa`, and the sharpest version of
defect 4. Defect 4 removed the global `stop()` from the paths that run _after_
the panel's attempt was cancelled, and kept the one in `onDestroy` on the
argument that the panel still owned the attempt at that instant. The review's
correction: it does not. Another surface reaching the same singleton can take
the camera over at any point, including before this panel closes, and a
late-callback guard says nothing about teardown itself, because teardown is the
moment of the damage.

Measured before the fix, with the other consumer acquiring first and the panel
closing second:

- panel mid-handshake when the other consumer acquired: the other consumer's
  tracks went to `readyState === "ended"` on the panel's close
- panel holding a stream the other consumer took over: same, on top of its own
  already-dead tracks

The two defect-4 tests did not catch this because both unmount the panel before
the other consumer acquires.

Fix: the panel never calls `stop()`. Teardown releases only the stream this
panel was handed. An acquisition still in flight is covered by the `destroyed`
checks in `initializeCamera`, which release the stream as it arrives, so nothing
is left running either way — confirmed against the real manager below, since
dropping the call also drops the ticketed manager's cancel signal.

### The scoped calls this wants, and cannot make yet

`claude/camera-resource-lifecycle-sdoeg6` at `7700457c` adds exactly the
ownership primitives this panel needs: `initialize()` returns a
`CameraAcquisition` handle, `start(handle)` refuses a handshake that was
cancelled or taken over, `abandonAcquisition(handle)` gives up only that
handshake and no-ops once another consumer owns the instance, and
`releaseStream(stream)` stops the tracks it is handed while clearing the
manager's own state only if that is still the stream it handed out. `stop()`
keeps its instance-wide meaning for panels that own their own manager.

None of those exist on `origin/main`, so this branch cannot call them and
compile. The integration dependency is recorded at the call site in
`VideoRecordPanel.svelte` rather than in prose only. Once the camera branch
lands, the panel should capture the handle from `initialize()`, pass it to
`start(handle)`, and replace the teardown with `abandonAcquisition(handle)` when
no stream arrived and `releaseStream(stream)` when one did. That buys two things
track-level release cannot: the handshake is cancelled immediately instead of
the camera opening and closing a moment later, and the manager's own `_stream`
and `_isActive` stop going stale.

### Before and after

`vitest run --config tests/config/vitest.components.config.ts
src/lib/shared/video-record/components/VideoRecordPanel.svelte.test.ts`

| Test                                                                 | At `f50841d7`'s parent | At `639ea6312d` | At `5fc424aa` | Now  |
| -------------------------------------------------------------------- | ---------------------- | --------------- | ------------- | ---- |
| does not open the camera when destroyed while enumerating devices    | fail                   | pass            | pass          | pass |
| ends a stream that arrives after the panel is destroyed              | fail                   | pass            | pass          | pass |
| leaves a newer consumer's camera alone when this start is rejected   | not written            | fail            | pass          | pass |
| leaves a newer consumer's camera alone when this stream arrives late | not written            | fail            | pass          | pass |
| leaves alone a camera another consumer opened before teardown        | not written            | not written     | fail          | pass |
| leaves alone a camera another consumer took over from this panel     | not written            | not written     | fail          | pass |
| still opens the camera for a panel that stays mounted                | pass                   | pass            | pass          | pass |

Defect 3: 2 failed, 1 passed, then 3 passed. Defect 4: 2 failed, 3 passed, then
5 passed. Defect 8: 2 failed, 5 passed, then 7 passed. The last row is the
control throughout: it would catch a guard that simply stopped acquiring
cameras.

The tests stand in a contract-faithful fake for the camera manager rather than
the real one, so they do not break when the camera agent changes it, and so
they assert what this consumer owes the contract. The fake models the singleton
the way the real manager behaves: one instance across consumers, each `start()`
taking a ticket, a start that settles after a newer one took over never becoming
the held stream, and a newer `start()` releasing whatever was held first. That
is what makes a stray global stop visible, as somebody else's tracks ending. The
streams it hands back are real `MediaStream`s from `canvas.captureStream()`, so
teardown is read off the tracks' own `readyState` rather than off a spy, and no
camera permission is involved.

### Cross-branch integration check

Because the fake could in principle flatter the guard, each correction was also
run against the real manager, on a local throwaway merge of this branch with
`claude/camera-resource-lifecycle-sdoeg6` (never pushed, branch deleted after,
no unrelated ancestry carried onto this branch). A scratch test mounted
`VideoRecordPanel` with no mock of `get-camera-manager` and stubbed
`navigator.mediaDevices` so `getUserMedia` could be held open.

For defect 4, against the ticketed manager at `39f0271b`:

- pre-correction panel: the next consumer's tracks ended, the assertion "the
  next consumer's camera survived the stale attempt" failed
- corrected panel: the abandoned stream ended, the next consumer's tracks stayed
  `live`, and `manager.isActive` stayed true

For defect 8, against the handle-based manager at `7700457c`, with the other
consumer acquiring before the panel closes:

- pre-correction panel: "teardown did not touch the other consumer's camera"
  failed
- corrected panel: the other consumer's tracks stayed `live` and `isActive`
  stayed true, the panel's own abandoned request was still released when it
  landed, and a panel closing mid-acquisition with nobody replacing it still
  left nothing running. That last case is the one that could have regressed,
  since dropping the `stop()` also drops that manager's cancel signal; it passes
  both before and after, because the panel's own late guard closes the stream.

On that merged tree both agents' suites pass unchanged: `camera-manager.test.ts`
plus this branch's recorder tests, 27 tests, and the `PerformancePreview` and
`VideoRecordPanel` component suites, 10 tests.

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

Measured, by assertion against the real service: every row in both
before/after tables, and each numeric value quoted above. For defects 5, 6 and
7 that includes the absence as well as the presence — `URL.createObjectURL` not
called, `getCachedRecording` returning null, the progress array not growing.
Defect 7's rollback is measured against a real write: the test lets the actual
IndexedDB put through before cancelling, so the read-back can only come up
empty if the finalization noticed and deleted it.

Reasoned but not measured: `clearCachedRecording` resolving on its transaction
instead of on the call. Reverting that line alone leaves the test passing,
because fake-indexeddb orders the read-back after the write regardless. It is
kept because the rollback path should not report completion before its delete
commits, and it is called out here rather than counted as evidence.

Inferred, from reading the code and its callers, not observed at runtime: that
a recorder ends on its own because of a dropped camera track specifically, and
that the inflated durations of defects 2 and 6 reach the Firestore document
through `VideoRecordCoordinator`. The failure mechanisms are reproduced; the
real-world triggers for them are not.

For defects 3 and 4, measured: every failing state and every fix, in a real
Chromium through the browser component harness, with real `MediaStreamTrack`
teardown. Defect 4 was additionally measured against the real ticketed
`CameraManager` on a local merge with
`claude/camera-resource-lifecycle-sdoeg6`, both before and after the
correction.

Mocked in the committed tests: the camera manager itself, deliberately, since
another agent owns it. Read from that agent's branch rather than observed:
that `initialize()` rejects with `CameraAcquisitionCancelled` when a stop lands
during `enumerateDevices`, and that `start()` stops the tracks of an
invalidated ticket before rejecting. The integration check exercised both, so
the guard's behaviour against them is measured even though their
implementation is not this scope's to verify.

No real camera was opened anywhere in this work. `getUserMedia` was called only
as a stub returning `canvas.captureStream()`.

## Risks

`finalizeRecording` now depends on the recorder firing `stop`, with no timeout.
The previous code had an escape hatch, the inactive branch, but that branch is
exactly the defect: it resolved early with an incomplete blob. Because the
handlers are now attached before `start()`, no `stop` or `error` event can be
missed for a recorder this service created. A browser that goes inactive and
fires neither would leave the promise pending. The panel would stay on the
recording controls with no toast. This was not observed, and no such browser is
known.

Duration is now frozen at whichever comes first, the stop request or the
recorder's own terminal event, rather than at the end of the flush. That is the
intended reading, but it makes saved durations slightly shorter than before on
a recorder that takes time to flush.

A cancelled finalization resolves with `success: false` rather than rejecting,
so a caller that only checks `result.success` — which is what both panels do —
silently does nothing, as it should for a discarded take. A caller that wanted
to distinguish cancellation from "Recording not found" has to read `error`.
Both strings are internal; neither is shown to the user today.

Defect 7 keeps the recording in `activeRecordings` for the whole finalization,
so between the stop event and the end of the cache write `getRecordingState`
reports `"stopped"` where it used to report `"idle"`, and `isRecording` is false
throughout either way. Nothing in the app reads that window — both panels track
their own state and neither polls after pressing stop — and `"stopped"` is the
more truthful answer for a recording that is still being written. A second
`stopRecording` in that window now joins the same finalization instead of being
told the recording does not exist, which is the behaviour the defect-1 fix
intended all along.

`markEnded` clears the progress timer on the recorder's terminal event, so a
panel whose recorder ends on its own now gets no further progress callbacks at
all. It keeps showing pause, stop, and cancel for a recording that has already
finished, which is the same stuck state as follow-up 1 below, reached by a
different route. It is not new to this change — the callback carries no
completion signal — and it is no longer papered over by a duration that kept
climbing.

The panel no longer calls `cameraService.stop()` anywhere, which also gives up
the only cancel signal the ticketed manager currently exposes to it. A panel
closing mid-handshake therefore lets its acquisition finish and releases the
stream as it arrives, so the camera is open for a moment longer than a cancel
would have allowed. Measured against the real manager on the throwaway merge:
nothing is left running either way. `abandonAcquisition(handle)` closes that
gap properly, and is follow-up 5.

`releaseOwnStream` never tells the manager that the stream it may still be
holding is dead. While this panel is the current holder, that leaves `_stream`
pointing at ended tracks and `_isActive` true until the next `start()`, which
releases it anyway. The device is freed regardless, and that is the trade for
never touching another panel's camera; `releaseStream(stream)` in the same
follow-up removes the trade.

## Follow-ups, not fixed here

1. **A recording can finish without the panel finding out.** Two routes to the
   same stuck screen. When `maxDuration` is reached, the progress interval calls
   `stopRecording` and discards the resolved `RecordingResult`. When the
   recorder ends on its own, defect 6 now correctly stops the progress timer,
   and `RecordingProgress` carries no way to say "finished" in either case. The
   panel keeps showing pause, stop, and cancel for a recording that is over, and
   a later stop press gets `"Recording not found"`. Fixing it means deciding
   what the panel should do at the cap and on a dropped camera, which is a
   product choice, and widening `RecordingProgress` or adding a completion
   callback. Out of scope for a defect fix. The stuck state is read from the
   code; the underlying lifecycle of both routes is measured.

2. **Cached blob URLs are not revoked on clear.** `getCachedRecording` records
   its URL in `cachedBlobUrls` and revokes the previous one for the same id, but
   `clearCachedRecording` and `clearAllCachedRecordings` delete the IndexedDB
   rows without revoking anything in that map. Each cleared recording keeps one
   object URL alive for the life of the document. Defect 7's rollback does not
   hit this: it clears a row nothing has read back yet, so there is no entry in
   `cachedBlobUrls` to revoke. Read from the code, not measured.
   `clearAllCachedRecordings` also still resolves before its transaction
   commits, the shape defect 7 corrected in its sibling. Nothing calls it today.

3. **MIME fallback can throw instead of falling back.** `startRecording` checks
   `isTypeSupported` for the preferred type and for `video/webm`, then uses
   `video/mp4` unchecked. If none of the three is supported the `MediaRecorder`
   constructor throws `NotSupportedError` and the panel shows a generic start
   failure. Constructing without an explicit `mimeType` would let the browser
   pick its own default, but that changes the output container, which is a
   product choice this brief excludes. Read from the code, not reproduced.

4. **`PerformancePreview` carries the defect-4 shape.** It is in `export-panel`
   and the camera agent has already guarded it on
   `claude/camera-resource-lifecycle-sdoeg6`, so it was not touched here. Its
   late-stream branch still runs `cameraService.stop()` before stopping its own
   tracks, which is the same global stop on the same singleton that defect 4
   removed from this panel. It is narrower there, since that branch only runs
   when a stream was actually delivered, but the victim would be the same. For
   the camera or export owner. Read from that branch, not reproduced.

5. **Adopt the camera branch's scoped calls in this panel.** Blocked only on
   `claude/camera-resource-lifecycle-sdoeg6` reaching `main`, and written out at
   the call site in `VideoRecordPanel.svelte`: capture the `CameraAcquisition`
   handle from `initialize()`, pass it to `start(handle)`, and replace the
   teardown with `abandonAcquisition(handle)` or `releaseStream(stream)`. Same
   merge brings `isCameraAcquisitionCancelled`, which is the one line that stops
   a still-mounted superseded panel painting the cancellation text as a camera
   error. See defect 8 and the alignment note under defect 4. Verified to work
   against that branch on a throwaway merge; not adoptable here because none of
   the symbols exist on `main`.

6. **Manager-side cancellation, already in flight elsewhere.** On `main` the
   manager has none: `stop()` clears `_stream` and `_isActive`, but an in-flight
   `start()` that resolves afterwards sets them again, so it comes back to life
   after being stopped. `claude/camera-resource-lifecycle-sdoeg6` fixes exactly
   that with per-start tickets and acquisition handles, and this branch's guard
   is written to be correct against both. Nothing left for this scope; noted so
   the two branches are not read as duplicating each other.

7. **Nothing type-checks `tests/`.** `tsconfig.json` narrows the SvelteKit
   config's `include` to `src/**`, so `npm run check`, `check:fast` and
   `check:tsc` all skip the test suite, and a test that does not compile still
   passes under vitest. That is how the `TS2558` above survived a review round.
   Widening the include, or adding a committed test-only tsconfig to the check
   scripts, is a repository-wide call and a shared-surface change this scope
   does not own. Measured: the narrow config in the section above reproduces the
   error the root config cannot see.
