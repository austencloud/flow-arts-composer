# Audio clock lifecycle: metronome scheduling and resource defects

Date: 2026-09-13. Domain: `src/lib/shared/audio` and its metronome consumers.
Branch: `claude/audio-clock-lifecycle-h5xvwh`.

|                |                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- |
| Base SHA       | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`, unchanged during the task) |
| Final code SHA | `bc311b6d` — the branch tip is this report's commit on top of it                      |
| Fix commits    | `ef137902` (stop/restart lifecycle), `bc311b6d` (suspended context on the tick path)  |

## Owned files

| File                                                          | Change                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/audio/metronome.ts`                           | Modified — scheduler lifecycle, lookahead cancellation, node release, beat-index capture, context resume |
| `tests/unit/shared/audio/metronome.test.ts`                   | New — 12 cases against a deterministic fake AudioContext                                                 |
| `docs/reports/opus-batch-2026-09-12/audio-clock-lifecycle.md` | New — this report                                                                                        |

No consumer file was modified. `src/lib/shared/audio/services/sound-player.ts`,
`get-sound-player.ts`, the sequence-viewer playback controller and the record
feature were read only.

## Defects fixed

### 1. The lookahead outlived stop and restart (`ef137902`)

The metronome queues clicks onto the audio clock 100ms ahead of the transport,
which is what keeps the beat grid free of `setTimeout` jitter. Every part of
the class that had to reason about "already committed but not yet heard" got it
wrong.

| Symptom                                             | Cause                                                                                                                                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A restart leaves a second scheduler running forever | `start()` never cancelled the running loop. Both closures mutate the shared `nextClickTime`, so they interleave onto one corrupted grid, and `this.timerID` only ever held the newest loop's handle — `stop()` could not reach the older one. |
| Clicks keep sounding after stop                     | `stop()` cleared only the polling timer. Clicks already handed to the audio thread were still scheduled.                                                                                                                                      |
| Beat callbacks keep firing after stop               | Each beat's `setTimeout` was untracked and uncancelled.                                                                                                                                                                                       |
| The beat callback reports the wrong beat            | `setTimeout(() => onStep(stepIndex), …)` closed over the mutable loop variable, so it read `stepIndex` after the loop had already incremented it. Beat 0 arrived as 1.                                                                        |
| Silence, and a 25ms timer spinning forever          | `start()` never resumed a suspended context. A suspended context's `currentTime` is frozen, so the grid never advances.                                                                                                                       |
| One live oscillator/gain pair accumulates per beat  | Nothing released finished nodes.                                                                                                                                                                                                              |

Fixes: `start()` calls `stop()` first and then `resume()`; `stop()` cancels
queued beat callbacks and re-stops queued oscillators at "now" (an oscillator
whose stop time precedes its start time never sounds), while a click already
sounding is left to finish its 50ms fade so cancelling cannot pop; the
scheduler captures the beat index it is scheduling; finished nodes are
disconnected as the scheduler passes them, and on the `tick()` path by the
following tick.

### 2. A suspended context is never re-unlocked on the practice tick path (`bc311b6d`)

The practice cockpit unlocks audio on the Start tap
(`playback-controller.svelte.ts:317` `ensureMetronome()`) and then drives beats
itself through `tick()`. Nothing on that path unlocks again. If the browser
suspends the context afterwards, `currentTime` freezes and every later tick
queues a click onto a clock that never advances: the metronome is silent for
the rest of the session unless the user toggles it off and on or restarts
practice.

`tick()` now resumes a suspended context. The click is still queued rather than
dropped, because the first count-in tick fires while the opening `resume()` is
still settling — dropping it would silence the downbeat of every practice run.

## Proof

### Deterministic unit tests (mocked audio graph)

`tests/unit/shared/audio/metronome.test.ts` injects a fake `AudioContext` whose
audio clock and the vitest fake timer clock advance in lockstep, 25ms per
scheduler poll, so every scheduling decision is exact rather than approximate.
These are timing-graph invariants: the fake records what the metronome asked
the audio thread for, and proves nothing about what a listener would hear.

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shared/audio/metronome.test.ts`

Before (base implementation, 12 cases): **7 failed, 3 passed** — the two
`tick()` cases did not exist yet.

| Failing case                                                    | Observed before                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| replaces the running scheduler instead of stacking a second one | 2 scheduler timers pending, expected 1                              |
| stops scheduling for good after stop(), across a restart        | 4 clicks scheduled, expected 2                                      |
| cancels clicks already queued in the lookahead window on stop() | pending click's stop time 0.55s, expected ≤ 0.45s (the stop moment) |
| does not fire beat callbacks queued before stop()               | callback fired 2 times, expected 1                                  |
| unlocks a suspended context when started                        | 0 `resume()` calls                                                  |
| releases finished click nodes while running                     | no finished node disconnected                                       |
| keeps beat callbacks running while muted                        | beats reported `[1, 2, 3]`, expected `[0, 1, 2]`                    |

After: **12 passed**. Isolating defect 2 (fix 1 applied, `tick()` reverted):
only "recovers a context the browser suspended mid-session" fails, with 0
`resume()` calls where 1 is expected.

Three cases guard the contracts the brief required preserving and passed both
before and after: accent every fourth beat at 1200Hz/0.3 gain versus
800Hz/0.2 gain, one click per beat at the BPM given, and `dispose()` closing
the context. Mute semantics are unchanged except for the beat-index correction.

### Real Web Audio in headless Chromium (measured, not mocked)

Chromium 1194 via Playwright, `--autoplay-policy=no-user-gesture-required`.
Probe scripts are session scratch files, not committed.

Engine premises behind the fixes, measured with a real `OfflineAudioContext`
and a real `AudioContext`:

| Measurement                                                                 | Result                  |
| --------------------------------------------------------------------------- | ----------------------- |
| Oscillator started at 0.5s, stopped at 0.55s — rendered peak in 0.50–0.56s  | 0.19999868              |
| Same oscillator re-stopped at 0.2s (what `stop()` now does) — rendered peak | 0.0                     |
| `currentTime` advance over 200ms wall clock while running                   | 0.2003s                 |
| `currentTime` advance over 300ms wall clock while suspended                 | 0.0000s                 |
| State after `suspend()` / after `resume()`                                  | `suspended` / `running` |

The real `Metronome` class, bundled from the base commit and from the working
tree, run in the page against a real `AudioContext` with real timers and
`AudioContext.prototype.createOscillator` instrumented:

| Scenario                                                                 | Before                                                                 | After                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------- |
| `start(60)`, 300ms, `start(120)` without stopping, 1s, `stop()`, 800ms   | 3 clicks at stop → **4 after** (the orphaned 60bpm loop kept clicking) | 4 clicks at stop → 4 after              |
| `start(120)`, 950ms, `stop()` — clicks cancelled before their start time | **0**                                                                  | 1                                       |
| `start(120, onStep)`, 950ms, `stop()`, 600ms                             | first beat reported as **1**; 2 beats at stop → **3 after**            | first beat 0; 2 beats at stop → 2 after |
| `start(120)`, 1s, `stop()`, 600ms (single run)                           | 3 → 3                                                                  | 3 → 3                                   |

This is real-engine behaviour of the scheduler, still not a perceptual claim:
no audio device was present and nothing was listened to.

### Other checks

- `npx tsc --noEmit --strict` on `metronome.ts` (no imports; standalone DOM lib): clean.
- `npx prettier --check` on both owned files: clean. `npx eslint` on `metronome.ts`: clean (the test path is eslint-ignored by project config).
- Regression sweep of the nearest consumer suites: `tests/unit/sequence-viewer/` plus `tests/unit/shared/audio/` — 34 files, 268 tests, all passing. Six of those files initially failed to _load_ with `Failed to resolve entry for package "@tka/tka-types"`; that is the unbuilt workspace packages in a fresh cloud checkout, not the diff. After `npm run build:packages`, with no code change in between, all 34 load and pass.

## Reachability, stated plainly

`Metronome.start()` — the scheduler path — has **no reachable caller today**.
Its only consumer is `src/lib/features/create/record/components/RecordPanel.svelte`,
which nothing imports (`VideoRecordPanel` in `shared/video-record` is a
different, live component). Defect 1 therefore hardens the shared owner's
contract and protects the next consumer; it does not fix a symptom a user is
hitting now.

The live consumer is the practice cockpit, which uses `resume()`, `tick()`,
`stop()` and `dispose()`. Defect 2, the `tick()` node release, and the
`resume()` rejection guard are on that live path.

## Risks

- `start()` now calls `stop()` first. Any future caller relying on a second
  `start()` layering onto the first would change behaviour — that behaviour was
  the defect, and no current caller does it.
- `stop()` cancels a click queued in the 100ms lookahead. If a caller ever
  stops and restarts within one lookahead window expecting seamless
  continuation, the click on the seam is now dropped rather than double-played.
  The restart schedules its own grid from the current time.
- `tick()` may call `resume()` outside a user gesture. On a context already
  unlocked once this succeeds; on one never unlocked the promise rejects and is
  caught and logged, which is the pre-existing degradation path.
- Beat callbacks now report the index they were scheduled for rather than one
  ahead. No consumer reads the value today (`RecordPanel` passes an empty
  callback), so nothing depends on the old off-by-one.
- Not verified in the real application UI: the practice cockpit was not driven
  in a browser. This is a cloud checkout with no dev server, and port 5173 is
  Austen's. The class-level Chromium probe above is the substitute.

## Audit findings left unfixed (read-only)

1. **`SoundPlayer.initialize()` can build two AudioContexts.** `initialized` is
   set only after all decoding finishes, so two concurrent `initialize()` calls
   both construct a context and the first is leaked (`services/sound-player.ts:33`).
   The singleton has one consumer today (`TraceFeedback.svelte`, once per
   round), so a real overlap is unlikely; the guard is still wrong. A
   `Promise`-memoised initialize would fix it.
2. **Every `SoundPlayer` sound 404s.** `SOUND_FILES` points at
   `/sounds/pop.mp3`, `chime`, `whoosh`, `fanfare`, `error`; `static/sounds/`
   contains only `candidates/` and `options/`. All five fetches fail, the
   buffer map stays empty, and `play()` is a permanent silent no-op — while an
   AudioContext is still constructed and never closed. Picking the shipping
   file out of `static/sounds/candidates/<name>/` is a product choice, so it is
   not mine to make.
3. **`SoundPlayer.dispose()` calls `close()` without catching.** A rejection
   (already-closed context) surfaces as an unhandled rejection, unlike the
   `resume()` path beside it, which is guarded.
4. **Record tab: a tempo change while playing does nothing.**
   `RecordPanel.handleSpeedChange` calls `pause()` then `setBpm()` then
   `play()` synchronously. Svelte 5 effects are batched, so the playback effect
   never observes `isPlaying === false`; `startPlayback()`'s
   `playbackIntervalId !== null` guard returns early and both the visual
   interval and the metronome keep the old BPM. Unfixed because the component
   is unreachable — fixing dead code would be speculative.
5. **Output alignment ignores output latency.** The beat callback fires when
   the click is _scheduled to render_, not when it reaches the speaker;
   `AudioContext.outputLatency` is not compensated anywhere. Worth doing only
   with a real device to measure against, and only if a consumer starts using
   the beat index for visual sync.

## Followups

- Decide the fate of `src/lib/features/create/record/` — the only `start()`
  consumer is unreachable. Either wire it up (and fix finding 4) or remove it.
- Memoise `SoundPlayer.initialize()` and ship the five sound files, or delete
  the player. It currently costs an AudioContext to play nothing.
- If the practice cockpit ever needs beat-accurate visual sync, revisit
  finding 5 with a real audio device.
