# Export Reliability — Video/GIF Export Lifecycle

**Scope:** `src/lib/shared/video-export`, `src/lib/shared/export-panel`, and the
export-orchestration tests that belong to them.
**Base SHA:** `c4be1619` (`origin/main`, "Merge pull request #48 …hand-tunnel-toy")
**Branch:** `claude/fix-export-lifecycle-issues-y7c45a`
**Date:** 2026-09-13

Excluded by brief and untouched here: auth gating, the generic fire renderer, the
shared dialog redesign, download-UI feature work, and feedback `hYkGDtTK`
(cancel during 3D startup — that path lives in `shared/3d/services/offline-3d-exporter.ts`
and `RenderContextFactory`, neither of which this branch modifies).

---

## Summary

One reproduced cluster of lifecycle defects, all in
`export-panel/services/export-orchestrator.ts`, all rooted in the same wrong
assumption: **that an export is over when the user presses Cancel.**

It is not. The video orchestrator's capture loop only observes `shouldCancel` on
its next iteration, and `BackgroundVideoEncoder.cancel()` rejects a pending
`finish()` a turn later. The cancelled attempt therefore outlives the click, and
`ExportOrchestrator` had no notion of _which_ attempt anything belonged to.

Four observable defects fell out of that, plus one hygiene issue, fixed in
commit `12bb216b`. Review of that commit found two more — a host cancel path that
bypassed the service entirely, leaving defect 1 reachable, and a hole the fix
itself introduced — corrected in the follow-up and written up under
[Corrections after review of `08796d0b`](#corrections-after-review-of-08796d0b).

Twelve assertions guard the result: six fail on the code they were written
against, five guard behaviour that was already correct, and one documents the
service boundary the host must respect.

---

## Fixed (reproduced, test-first)

### 1. A cancelled animation export was reported as a failure

`export()` returned `{ success: false, error: "Export cancelled" }` for a user
cancel of an animation export. In `SequenceDrawerHost.performExport` that lands
in the `else { throw new Error(result.error) }` branch, so the user got an **error
toast and an error haptic for the button they just pressed** — on top of the
"Export cancelled" info toast `handleCancelExport` already fires.

Only the mobile native-share path reported cancellation correctly
(`{ success: true, canceled: true }` when `shareBlobNatively` resolves
`status: "canceled"`), so the `ExportResult.canceled` field already existed and
the host already handled it.

Covered by: _reports a cancelled animation export as cancelled, not as a failure_.

The fix keys the result to the run, not to the error's message, so a genuine
failure that happens to carry a cancellation-shaped message from an
un-cancelled run still reads as a failure (_keeps a cancel scoped to the run it
was aimed at_).

### 2. A retry could start on top of a still-running cancelled export

`cancelExport()` cleared `this.exporting` synchronously. The next `export()`
therefore passed the "already in progress" guard while the cancelled attempt was
still inside `VideoExportOrchestrator.executeExport` — still capturing frames,
still holding the encoder worker and the offscreen WebGL engine.

That is worse than a duplicate: `VideoExportOrchestrator.executeExport` sets
`this.shouldCancel = false` at the top of every run, so starting run 2 **clears
the cancel flag run 1 is waiting on**. Run 1 resumes from its
`await waitForAnimationFrame()`, no longer sees `shouldCancel`, and keeps pushing
frames into the encoder run 2 just initialised. Run 1's `finally` then disposes
run 2's offscreen renderer, restores playback state, and nulls
`backgroundEncoder.onProgress`.

A new run now waits for a cancelled run's promise to settle before claiming the
pipeline. On the ordinary path (no run, or a run that is merely busy) nothing is
awaited, so the mobile static path still reaches `navigator.share()` inside the
tap's transient activation.

Covered by: _does not hand the pipeline to a new run until the cancelled one has
unwound_.

### 3. A superseded run's completion cleared the newer run's in-progress flag

Once run 2 had started, run 1's `finally { this.exporting = false }` ran
unconditionally. `isExporting()` then reported idle **during** run 2, and the
"Export already in progress" guard let a third run through.

`endRun` now releases the flag only if the settling run still holds it.

Covered by: _never lets a superseded run's completion clear the newer run's flag_
(asserts `isExporting()` is still true after the cancelled run settles, and that a
third `export()` is refused).

### 4. A dead run's progress repainted the live run's takeover

The progress callback handed to the video orchestrator forwarded unconditionally.
A cancelled or superseded attempt keeps emitting while it unwinds, so its frame
counter could drag the retry's progress ring backwards, and its `stage: "error"`
emission could raise a dead run's error over a live one.

Progress is now dropped unless the emitting run both owns the pipeline and has
not been cancelled.

Covered by: _drops progress emitted by a superseded run_ (asserts drops both
immediately after cancel and after a retry has taken over).

### 5. Hygiene: unhandled rejection from the static-share warm-up

`exportStatic` re-warmed the mobile share cache with a bare
`void this.prepareStaticShare(sequence)`. If the image render fails, that is an
unhandled promise rejection reported as an app-level error even though the tap
already surfaced its own message. It now logs, matching the pattern
`SequenceDrawerHost` already uses for the same call.

Not separately tested — there is no stable observable difference in jsdom.

---

## Corrections after review of `08796d0b`

Two gaps the first pass missed, both raised in review and fixed here.

### 6. Closing the panel mid-export still raised a failure

`SequenceDrawerHost.handleClose` cancelled the **video** orchestrator directly
rather than going through `ExportOrchestrator.cancelExport()`:

```js
if (videoExportOrchestrator?.isExporting()) {
  videoExportOrchestrator.cancelExport(); // bypasses the run marking
  exportProgress = null;
}
```

So `run.canceled` stayed false and defect 1 was still fully reachable — closing
the export panel during an export produced the error toast and error haptic that
the Cancel button no longer did. Fixing the service alone left the bug in place
through the other door.

`handleClose` now routes through `exportOrchestrator.cancelExport()` (falling
back to the direct call only if the export orchestrator is somehow absent),
which is the same door `handleCancelExport` already used. This is the single
authorised host change on this branch; nothing else in that file was touched.

`cancelExport()` also now documents that it is the only supported way to stop an
export, and a test — _cannot attribute a cancel that bypassed it_ — pins the
boundary: a bypassing cancel resolves as a failure, and there is no signal that
would let the service recognise it after the fact (the video orchestrator looks
identical here and after a genuine encoder failure). That test passes both
before and after; it documents why the host must route through the service
rather than reproducing a defect.

**Coverage limitation, stated plainly:** the host fix itself has no automated
test. `SequenceDrawerHost` is a coordinator with a very large dependency graph
(DI container, navigation, sequence services), so mounting it in the browser
component project is not justified under `component-test-discipline.md`, and a
source-text scan for the forbidden call would be a test that mirrors
implementation. The fix is verified by inspection and by `check:fast` showing no
new diagnostics. The durable guard is the doc comment at the call site people
read.

### 7. A cancel aimed at a queued retry was dropped

The run-serialisation added in `12bb216b` parks a retry in
`while (this.activeRun?.canceled) await this.activeRun.settled` — before it owns
an `ExportRun`. A `cancelExport()` during that window had nothing to mark, so
the queued attempt woke up and launched a full export the user had already
called off.

Reachability is currently gated by the host (`performExport`'s own `isExporting`
flag means the only consumer cannot queue a retry), so this was a latent
contract hole rather than a live defect — but it was introduced by the previous
commit, so it is fixed rather than documented away.

`cancelExport()` now bumps a `cancelEpoch`; a queued attempt captures the epoch
before waiting and, on waking, returns `{ success: true, canceled: true }` if it
moved. Marking a run cannot express this — there is no run yet — which is why
the counter exists alongside the per-run flag.

Covered by: _honours a cancel aimed at an attempt that is still queued_. On the
pre-correction service that test does not merely assert the wrong value: the
queued attempt starts a real run nobody settles and the test hangs to the 30 s
timeout, which is the defect exactly.

---

## Design notes on the fix

- **Run identity, not a message match.** `ExportRun` carries `canceled` and a
  `settled` promise. Cancel marks the run; the result, the flag and the progress
  gate all consult the run that produced them.
- **`isExporting()` semantics changed** — it now stays true while a cancelled run
  unwinds (previously it flipped false at the click). Verified safe:
  `SequenceDrawerHost` is the only holder of an `ExportOrchestrator` and never
  calls `isExporting()` on it (it calls `videoExportOrchestrator.isExporting()`,
  which is a different object and unchanged).
- **Deliberately not changed:** a cancel that arrives _after_ the encode finished
  (during the 1.5 s `VIDEO_EXPORT_SUCCESS_DELAY_MS` success hold) still resolves
  as success. `downloadBlob` has already run by then, so the file is on disk;
  reporting "cancelled" would be the dishonest answer.
- **Residual risk:** if a run never settles, a queued retry now waits instead of
  starting a competing run. A never-settling run is already a visible hang (the
  takeover stays up), and the previous behaviour — two capture loops on one
  encoder — is strictly worse, so the wait is unbounded by choice rather than a
  timeout that would reintroduce the overlap.

---

## Investigated, no finding

These were examined against the brief's priority list and are reported as clean
so the next pass does not re-derive them.

| Area                                                  | Finding                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cancel during setup** (export-panel path)           | No window. `export() → exportAnimation() → executeExport()` runs synchronously to the encoder's first `await`, and `_isExporting` is set before it. The user cannot interleave a cancel. (The 3D/film path is different and is `hYkGDtTK`'s.)                                                                                                                                                |
| **Cancel during encoding**                            | `BackgroundVideoEncoder.cancel()` calls `rejectPending(new Error("Export cancelled"))` and terminates the worker, so a pending `finish()` rejects rather than hanging. Covered by defect 1's fix, which now maps that rejection to `canceled`.                                                                                                                                               |
| **Repeated cancel**                                   | Already idempotent: the second `cancelExport()` finds `videoOrchestrator.isExporting()` false. Kept as a regression guard (_is idempotent under repeated cancel…_), and extended so a cancel aimed at an already-finished run cannot colour the next one.                                                                                                                                    |
| **Retry after failure**                               | Already worked; guarded now.                                                                                                                                                                                                                                                                                                                                                                 |
| **WebGL/canvas disposal per export**                  | `RenderContextFactory.createOffscreenContext`'s `dispose()` captures the canvases before `engine.dispose()`, calls `WEBGL_lose_context.loseContext()` on each, and removes the container. `VideoExportOrchestrator` assigns `offscreen` _before_ `await offscreen.initialize()`, so its `finally` disposes even when initialize rejects. Clean.                                              |
| **`OffscreenExportRenderer` frame timing**            | The fixed 60 fps accumulator in `renderAt` is self-consistent: `beatAt` clamps to `[0,1]`, the loop-wrap guard (`prevBeat - beatPos > 0.5`) prevents the backward sweep at a seamless seam, and the `!stepped` branch (export fps > 60, or the first/stationary frame) intentionally paints once at the exact target and zeroes the accumulator. No drift or lost/duplicated sub-step found. |
| **Object URLs in `PerformancePreview.svelte`**        | No leak reachable from the UI: the `stopped` state offers only `discardRecording`, which revokes before clearing, `handleFileSelect`/`clearUploadedFile` revoke the previous URL, and `onDestroy` revokes both. (Minor: `recordingId` is not cleared after a successful `stopRecording`, so `onDestroy` cancels an already-stopped recording. No observable effect found; not changed.)      |
| **`CanvasFrameCapturer` / `VideoFrame` ownership**    | Both consumers (`offline-3d-exporter`, `post-studio-exporter`) hand the frame straight to `addFrameCaptured`, which closes it when the worker is gone. No path captures a `VideoFrame` and drops it.                                                                                                                                                                                         |
| **`camera-keyframe-interpolator`**                    | Pure; endpoint clamping, binary search and the shortest-arc slerp are correct. Already covered by `camera-keyframe.test.ts`.                                                                                                                                                                                                                                                                 |
| **`toExportTakeoverPhase` / `ExportTakeover.svelte`** | Error-first precedence, `canCancel` gating, Escape handling and the `beforeunload` guard all behave; existing unit + browser-component tests cover them.                                                                                                                                                                                                                                     |
| **Film render presets**                               | Unchanged — `FILM_RENDER_PRESETS`, the resolution cost table and the estimate formatter are all as shipped.                                                                                                                                                                                                                                                                                  |

---

## Observed but not changed (outside this brief's fix budget or scope)

1. **Failed `engine.initialize()` leaks an offscreen container.**
   `RenderContextFactory.createOffscreenContext` (owner: `animation-engine`) only
   cleans up on the `getRenderContext() === null` branch. If
   `await engine.initialize(container, {})` throws, the `<div data-offscreen-render>`
   and the partially-built engine's GL context are left behind, and
   `OffscreenExportRenderer.handle` is still null so its `dispose()` is a no-op.
   Repeated retries after an init failure would accumulate contexts. Not fixed:
   the file is outside this brief's ownership.

2. **`totalFramesEstimate` can disagree with the captured frame count.**
   In `features/compose/services/video-export-orchestrator.ts` the worker's
   allocation estimate uses `steps.reduce(...)` while the capture loop uses
   `steps.reduce(...) || panelState.totalSteps`. They differ only when a sequence
   has steps whose durations sum to zero. The two also read `panelState.speed`
   and `isSeamlesslyLoopable` at different points, several awaits apart. No
   product path found that reaches either, and the file is unowned here.

3. **No progress UI during encoder initialisation.**
   `AnimationExportView` renders its progress block only when
   `isExporting && exportProgress`, and the first `onProgress` emission comes
   after `BackgroundVideoEncoder.initialize()` resolves — up to its 30 s ready
   timeout. The panel shows nothing in between. Fixing this means either a new
   pending state in the view (download-UI work, excluded) or emitting a
   stage the export is not actually in; neither was invented here.

4. **Cancel during encoding briefly shows "Capturing".**
   `handleCancelExport` nulls `exportProgress` while `isExporting` is still true,
   and `toExportTakeoverPhase(null, true)` defaults to `capturing`. The ring reads
   "Capturing 0%" for the unwind window before going idle. Communicating
   "cancelling" would need a new signal from hosts outside these directories.

---

## Commands run

| Command                                                                                                                                                                                | Result                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                       | ok (`node_modules` was absent in this container)                                                                                                                                                                                                                      |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/export-panel/services/__tests__/export-orchestrator.lifecycle.test.ts` **against base `export-orchestrator.ts`** | **5 failed / 5 passed** — the four defects above plus the cancel-idempotence assertion                                                                                                                                                                                |
| same command **after `12bb216b`**                                                                                                                                                      | **10 passed**                                                                                                                                                                                                                                                         |
| same command, review additions, **against `08796d0b`'s `export-orchestrator.ts`**                                                                                                      | **1 failed / 11 passed** — _honours a cancel aimed at an attempt that is still queued_ hangs to the 30 s timeout, because the queued attempt starts a run nobody settles                                                                                              |
| same command **after the correction**                                                                                                                                                  | **12 passed**                                                                                                                                                                                                                                                         |
| `npx vitest run … src/lib/shared/video-export src/lib/shared/export-panel`                                                                                                             | **7 files, 47 tests passed** (the 5 pre-existing suites in these directories plus the new one)                                                                                                                                                                        |
| `npm run check:fast`                                                                                                                                                                   | 645 errors / 44 warnings project-wide, unchanged from before this branch; **zero diagnostics on any changed file** (`export-panel`, `video-export`, `SequenceDrawerHost`)                                                                                             |
| `npx eslint <changed files>`                                                                                                                                                           | clean (`SequenceDrawerHost.svelte` matches an eslint ignore pattern)                                                                                                                                                                                                  |
| `npx prettier --check <changed files>`                                                                                                                                                 | new test file clean. `export-orchestrator.ts` and `SequenceDrawerHost.svelte` still fail `--check`, as both did **before** this branch (each verified against its `HEAD` copy); reformatting either wholesale would bury the behavioural diff under an unrelated one. |

Not run, and why: full `npm run check` / `npm run build` (this change crosses no
project-wide type or build boundary, and `check:fast` already covers the changed
files), and any browser pass (nothing rendered changed — the diff is one service
file, one five-line branch inside an existing handler, and one test file).

---

## Files owned by this branch

- `src/lib/shared/export-panel/services/export-orchestrator.ts` (modified)
- `src/lib/shared/export-panel/services/__tests__/export-orchestrator.lifecycle.test.ts` (new)
- `src/lib/features/create/shared/components/coordinators/SequenceDrawerHost.svelte`
  (modified — the single authorised host change, `handleClose`'s cancel call site
  only; see correction 6)
- `docs/reports/opus-batch-2026-09-12/export-reliability.md` (this file)

Nothing else was touched; no other agent's work was reverted or edited.
