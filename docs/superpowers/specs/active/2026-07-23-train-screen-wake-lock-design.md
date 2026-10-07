---
status: active
value: 4
effort: S
remaining: "Automated recheck passed all 16 wake-lock tests on 2026-07-29. The connected target runs iOS 26.5.2, and local plus production response policy permits the API. Remaining: start an elevated pymobiledevice3 tunneld bridge, then verify Practice and Train acquisition, background/restore reacquisition, post-stop release, and real Auto-Lock in Safari plus the Home Screen app."
depends_on: "external: target iPhone verification requires an elevated pymobiledevice3 tunneld bridge and hands-on session control"
plan_path: ""
tags: ["practice", "train", "viewer", "mobile", "wake-lock", "device"]
last_triaged: 2026-10-07
work_state: blocked
---

# Practice Screen Wake Lock: Design Spec

## Field report

Cheech reported that a regular Train session allowed the phone to dim and lock
while the sequence was running. This is a direct training interruption: the
performer is using their hands and cannot keep tapping the display.

This is not a platform-wide absence. The Mandala meditation session already
requests a screen wake lock. The initial implementation covered the standalone
Train lifecycle but missed the released sequence-viewer Practice lifecycle.
Because the viewer is the product's primary practice home, both practice
surfaces need the same activity-scoped behavior.

## Current path and evidence

The active Train path is:

```text
TrainModePanel
  -> createTrainState()
  -> handleStartCountdown()
  -> trainState.startPerformance()
  -> trainState.isPerforming
  -> requestAnimationFrame beat loop
  -> REVIEW or resetToSetup()
```

Before this change, `src/lib/features/train/components/TrainModePanel.svelte`
started and stopped the beat loop from `trainState.isPerforming`, but never
asked the browser to keep the display awake.

The released viewer Practice path is:

```text
SequenceViewerShell
  -> playback.enterPracticeMode()
  -> playback.handlePracticeStart()
  -> 3·2·1 count-in
  -> tempo-practice run
  -> playback.handlePracticeStop() or exitPracticeMode()
```

`src/lib/shared/sequence-viewer/components/playback-controller.svelte.ts` owns
that complete lifecycle, including count-in, pause, automatic completion, Stop,
exit, and viewer disposal.

Before this change, the only wake-lock implementation in the repository was
private to
`src/lib/features/mandala/tabs/meditate/state/meditation-session.svelte.ts`.
It:

- requests `navigator.wakeLock.request("screen")` when meditation starts;
- stores the returned `WakeLockSentinel`;
- listens for an automatic release;
- releases the sentinel on stop and dispose;
- degrades quietly when the API is unavailable or the request is denied.

That implementation proves the browser API and the desired failure policy are
already accepted in this app. It is not importable from Train, and copying it
would create two subtly different release and visibility rules.

## Outcome

While a viewer Practice run or Train performance is active, the app requests a
screen wake lock. It releases the lock as soon as the run ends or its owner is
destroyed. If the browser releases the lock while the document is hidden, the
owner requests a new sentinel when the document becomes visible and the same
session is still active.

Unsupported browsers, low-power rejection, and user-forced release must never
prevent a practice or meditation session from starting or ending.

## Reuse decision

Extend the existing meditation behavior by extracting it into one shared,
activity-scoped manager. Do not add a package, a hidden video loop, or a second
Train-only implementation.

Internal searches for `wakeLock`, `wake lock`, `screen lock`, and
`visibilitychange` found the meditation implementation but no shared
controller. The native Screen Wake Lock API is the current browser mechanism,
so an external dependency would add a fallback trick without improving the
supported path.

### Shared owner

Create:

`src/lib/shared/device/services/screen-wake-lock-manager.ts`

The name describes the behavior and follows the project rule against a
`Service` suffix.

Suggested contract:

```ts
export interface ScreenWakeLockManager {
  setActive(active: boolean): void;
  dispose(): void;
}

export function createScreenWakeLockManager(
  dependencies?: ScreenWakeLockDependencies
): ScreenWakeLockManager;
```

The optional dependencies provide the document and wake-lock request function
for unit tests. Production callers use browser globals.

This is an instance factory, not a module singleton. Viewer Practice, Train,
and Meditation own separate activity lifecycles, and one consumer releasing a
singleton must not cancel another consumer's lock.

The module and factory must remain safe during server rendering. They do not
read `window`, `document`, or `navigator` at import time. Browser ownership is
resolved lazily when activation begins, and the unsupported path includes an
environment where those globals do not exist.

## Lifecycle design

The manager owns these non-reactive values:

- `desiredActive`: whether the owning activity still needs the screen awake;
- `sentinel`: the currently held `WakeLockSentinel`, if any;
- `requestInFlight`: one shared request promise;
- `generation`: a monotonically increasing token used to reject stale request
  completions;
- `disposed`: a terminal flag.

### Activate

`setActive(true)` records intent synchronously and requests a lock only when:

- the manager is not disposed;
- the document is visible;
- the API exists;
- no live sentinel exists;
- no request is already in flight.

The caller does not await this method. The activity must not hold its state
transition open while the operating system decides whether to grant a lock.

### Pending-request race

A request may resolve after the owning activity has already stopped. Capture
the generation at request start. When it resolves:

- keep the sentinel only if the manager is still active, visible, undisposed,
  and on the same generation;
- otherwise release the newly returned sentinel immediately.

This prevents a late promise from keeping the screen awake after the session
has returned to setup or Review.

### Browser release

The sentinel's `release` event clears that exact sentinel reference. If
`desiredActive` is still true and the document is visible, the manager requests
a new sentinel. A released sentinel is never reused.

### Visibility

Register one `visibilitychange` listener per manager instance.

- Hidden: invalidate the current request generation and release any held
  sentinel. Browsers may also release it automatically.
- Visible: if `desiredActive` is still true, request a fresh sentinel.

The visible branch is explicit. It must not depend on every browser dispatching
the sentinel's `release` event in the same order.

### Deactivate and dispose

`setActive(false)`:

- clears desired intent;
- advances the generation;
- removes the sentinel release listener;
- releases the sentinel;
- leaves no reacquire path active.

`dispose()` performs the same cleanup and removes the document visibility
listener. Repeated deactivate and dispose calls are no-ops.

## Train integration

`TrainModePanel.svelte` creates one manager next to `trainState`.

1. `handleStartCountdown()` calls `setActive(true)` from the same user action
   that starts performance, then calls `trainState.startPerformance()`.
2. The existing `trainState.isPerforming` effect calls `setActive(false)` when
   the state leaves performance. This covers Review, reset, failed starts, and
   future non-click transitions.
3. `onDestroy` calls `dispose()`.

The beat timer remains the owner of timing. The wake-lock manager does not
pause, resume, or alter Train state.

## Viewer Practice integration

`playback-controller.svelte.ts` creates one manager next to the tempo-practice
orchestrator.

1. `handlePracticeStart()` calls `setActive(true)` from the Start tap before the
   timer-driven count-in begins.
2. The lock remains active if playback is paused during the same practice run.
3. Stop, automatic completion, practice exit, and cleanup call
   `setActive(false)`.
4. `dispose()` calls `dispose()`.

Entering Practice setup does not request a lock. Ordinary viewer playback
outside Practice also remains unchanged.

## Meditation migration

`createMeditationSession()` creates the shared manager and removes its private
sentinel, request, release, and visibility reacquire code.

- `start()` calls `setActive(true)`.
- `stopInternal()` calls `setActive(false)`.
- `dispose()` calls `dispose()`.

Meditation keeps its existing visibility-aware breathing clock. Only wake-lock
ownership moves.

Migrating Meditation in the same change is required. Leaving its private copy
would make the extraction decorative and allow the two policies to drift.

## Failure policy

No modal, toast, or blocking error is added.

Wake-lock denial is a device policy outcome, not a failed practice operation.
The activity remains usable, and repeated error UI would provide no useful
recovery action. Development logging may use one debug-level entry, but denial
must not enter the global exception stream.

## Acceptance criteria

- Starting a viewer Practice run requests one screen wake lock before count-in.
- Practice setup and ordinary viewer playback do not hold a wake lock.
- Pausing playback during an active Practice run keeps the wake lock.
- Stop, automatic completion, practice exit, and viewer disposal release it.
- Starting a Train performance requests one screen wake lock.
- Setup and sequence browsing do not hold a wake lock.
- Entering Review, returning to Setup, or leaving Train releases the held lock.
- Hiding and restoring the app during an active performance acquires a new
  sentinel when visible.
- Hiding and restoring after the performance ends does not reacquire.
- A request that resolves after the session ends releases its sentinel
  immediately.
- Unsupported or denied APIs leave Train fully usable and produce no unhandled
  rejection.
- Importing and constructing the manager during server rendering does not touch
  browser globals or throw.
- Meditation retains its current keep-awake behavior through the shared
  manager.

## Verification

### Revalidation, 2026-07-29

- The focused Vitest run passed both files and all 16 tests:
  `tests/unit/device/screen-wake-lock-manager.test.ts` and
  `tests/unit/sequence-viewer/viewer-practice-wake-lock.test.ts`.
- The local app returns a `Permissions-Policy` header that does not disable
  `screen-wake-lock`. The public site omits that directive, so its default
  same-origin allowlist applies.
- The paired target iPhone reports iOS 26.5.2. Its framebuffer bridge could not
  start because this Windows session is not elevated and no privileged
  `pymobiledevice3` tunnel task is installed.
- Device proof still needs hands-on session control. Do not infer real
  Auto-Lock behavior from the fake-sentinel tests.

### Automated

`tests/unit/device/screen-wake-lock-manager.test.ts` uses fakes for `Document`,
the request function, and `WakeLockSentinel`.

Cover:

1. unsupported API;
2. activate acquires once;
3. repeated activate is idempotent;
4. deactivate releases once;
5. automatic release reacquires while active;
6. hidden then visible reacquires while active;
7. hidden then visible does not reacquire after deactivate;
8. deactivate during a pending request releases the late sentinel;
9. dispose removes listeners and blocks future requests;
10. rejected requests settle without an unhandled promise;
11. construction without browser globals is a safe no-op.

`tests/unit/sequence-viewer/viewer-practice-wake-lock.test.ts` covers viewer
Start, Stop, and disposal ownership. Run both focused files and the project's
TypeScript/Svelte check after the implementation.

### Device proof

Use an iPhone with a short Auto-Lock interval.

1. Open any sequence in the released viewer, enter Practice, and start a run
   longer than that interval. Leave the screen untouched. The display remains
   on through count-in and playback.
2. Stop the run and leave Practice setup untouched. The device is allowed to
   dim and lock again.
3. During another run, background and restore the app. The display remains
   awake after return.
4. In the development build, repeat with a Train performance. End the
   performance and confirm the Review screen can dim and lock again.
5. Repeat in Safari and the installed app or Home Screen build used by the
   field report.

An Android Chrome pass confirms the shared browser path, but it does not replace
the iPhone proof.

## Expected file changes

- Create
  `src/lib/shared/device/services/screen-wake-lock-manager.ts`.
- Create
  `tests/unit/device/screen-wake-lock-manager.test.ts`.
- Edit
  `src/lib/features/train/components/TrainModePanel.svelte`.
- Edit
  `src/lib/features/mandala/tabs/meditate/state/meditation-session.svelte.ts`.
- Edit
  `src/lib/shared/sequence-viewer/components/playback-controller.svelte.ts`.
- Create
  `tests/unit/sequence-viewer/viewer-practice-wake-lock.test.ts`.

No dependency, global state, viewport policy, or practice timing file changes.

## Browser research

- [MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
  documents active-document restrictions, automatic release, and fresh
  requests after `visibilitychange`.
- [W3C: Screen Wake Lock API](https://www.w3.org/TR/screen-wake-lock/)
  defines the sentinel lifecycle and keeps final control with the user agent
  and device owner.
- [WebKit: Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
  confirms Screen Wake Lock support in iOS and iPadOS Home Screen Web Apps
  beginning with 18.4.
