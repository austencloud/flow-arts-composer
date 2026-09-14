# Create and Construct startup audit

The first integration attempt was blocked by an unrelated pending Git merge.
Its owner subsequently completed it. The continued implementation and production
measurements are recorded in [the second pass](2026-09-08-startup-pass-2.md).
These local changes have not been deployed.

September 8, 2026. Initial audit checkout: `cca82c61e7`. Implementation follows
Austen's approval to trace and fix startup. Fix commit: `f2bfb6b3e1`.

The repeated loading screens follow real, separate dependency stages. The app
announces readiness before the selected feature has finished initializing. Some
waiting is also deliberate: the startup splash holds its completion message for
1,400 ms, then fades over 400 ms. These timers can overlap useful background work;
their sum is not a measured performance improvement.

The findings below describe the original loading chain. This pass adds stage
instrumentation and implements the fixes listed under **Changes delivered**.
Browser measurements use dedicated guest contexts. No personal authenticated
session was used, no production deployment occurred, and no customer data changed.

## Evidence and limits

- Code paths were inspected from HTML startup through the application shell,
  module loading, Create initialization, Construct data and pictograph preparation.
- An HTTP GET of `https://tkaflowarts.com/create` returned 200 with 54,974 bytes of
  HTML. The production HTML contains the same 1,400 ms hold and 15,000 ms dismissal
  timer. This confirms deployed markup, not the timing of an actual browser run.
- The existing localhost server answered `/create` on IPv6 port 5173. Its process
  was left alone.
- Chrome tracing and injected observations covered deployed guest startup and
  local desktop/mobile Construct. Runtime results and limitations follow below.
  These samples do not establish population percentiles.

## Where the loading screens come from

| Stage                                  | What is actually complete                             | What can still be pending                                                 |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| HTML splash / mandala                  | Download progress estimate and shell checkpoints      | Authentication restoration, feature code, feature state, pictographs      |
| AppShellLoader                         | MainApplication's JavaScript import                   | MainApplication initialization and active feature import                  |
| “Loading Create…”                      | ModuleRenderer awaits CreateModule import             | Create initializer import, services, tab state, restored sequence/session |
| Create initialization placeholder      | Create services and persistence are being initialized | Construct options, prepared drawing assets, stable layout                 |
| Construct placeholders / blank content | Data or prepared options may exist                    | Layout settling, carousel bounds, grid SVG insertion, browser paint       |

The outer gate lives in `src/app.html`. `MainApplication.svelte` sends 100%
immediately on mount when a boot snapshot exists, or after its own settings and
workspace initialization otherwise. Neither branch waits for Construct.
`ModuleSkeleton.svelte` selects a second mandala with “Loading Create…”.

## Original findings and remaining work

### 1. Readiness and completion reporting are misleading

`MainApplication.svelte` calls `__tkaLoadProgress(100, "Ready")` before child
feature readiness. `src/app.html` adds the 1,400 ms hold and 400 ms opacity
transition. It also force-dismisses at 15 seconds even if boot has not completed.
The percentage is an estimated byte budget followed by fixed checkpoints, not
measured completion of all work.

Previously, `ModuleRenderer.svelte` also called `signalReady(moduleName)` when the
module import resolved, before mounting its component. The profiler's three-second
summary timeout then caused later readiness signals to be discarded. This pass
corrects those measurement errors: import completion is named `chunk-ready`, and
late readiness remains in the export. The console table is labeled a snapshot.

Implemented: removed the completion-message hold and success copy. Module import
and Create initialization now use the existing thin-bar loading presentation.
The shell becomes usable immediately while the splash fades. The existing
15-second escape remains; it does not prove feature readiness.

### 2. Create waits for more than the active Construct tab

`CreateModuleInitializer.initialize()` awaits the orchestrator and then a
`Promise.all` containing Construct, Generator, Assemble and default start-position
initialization. CreateModule separately awaits initializer code, restored sequence
state, autosave session resolution and recovered session metadata.

The parallel tab work is not four additive waits; the slowest promise determines
that group's completion. Its individual timings are now recorded. Next: use those
measurements to decide whether inactive tab initialization and session metadata can
move behind active-tab usability while preserving restoration and autosave identity.
`ApplicationInitializer.initialize()` itself only sets a flag, and the shell's
`loadSettings()` reads local storage. Their async names alone are not evidence of
expensive cloud operations.

### 3. Cold motion loading can repeat and does unnecessary candidate work

`CsvLoader.loadCsvData()` caches completed results but lacks a pending shared
promise. `MotionQueryHandler.ensureInitialized()` similarly checks an initialized
flag without coalescing concurrent initialization. Concurrent cold callers can
therefore repeat fetch/parse work. The static loader requests four datasets,
including optional Skewed and Trigrid. Optional request retries can still delay the
enclosing `Promise.all` even when Construct needs only the default dataset.

`getNextOptionsForSequence()` reconstructs every row in the selected grid dataset
before identifying connected candidates. `OptionLoader` then filters the results
again by start position. CSV failure retries include 200/400 ms backoff before the
IndexedDB fallback is attempted.

Implemented: coalesced initialization with clear-on-rejection promises. Remaining:
index parsed rows by the necessary starting locations and construct only relevant candidates. Verify
option parity before combining the two filters, since they may enforce different
invariants. Record whether optional data is absent rather than treating it as a
complete dataset. Consider cache-first offline behavior separately from freshness.

### 4. Layout settling adds another gate after data preparation

`OptionPickerContent.svelte` hides its layout branches until `sizingStable` becomes
true. It polls for ancestor transitions and stable measurements, with a 1,500 ms
settle timeout. The mobile swipe layout also waits for usable bounds.
`PictographGrid.svelte` hides start choices for a fixed 200 ms stabilization period,
then fades them in. Start-position state also starts loading immediately, followed
by preference restoration that can independently request more loads and regenerate
advanced variations while simple mode is active.

Next: restore preferences before one canonical initial load; generate advanced
variations on demand. Preserve a stable skeleton or the previous frame while
settling. Start data preparation alongside the workspace transition and use the
existing geometry owner or transition completion signal where possible. Removing
settling without checking target positions could reintroduce moving click targets.

### 5. Prepared pictographs are not proof of visible, usable choices

`OptionPicker.isReady` means services have been wired. Its data-ready state and
`preparedOptions` precede the layout gate and GridSvg's asynchronous SVG load.
The direct option renderer does not aggregate a visible-card readiness callback.
PictographContainer has a separate readiness callback for start choices, but that
also must be interpreted alongside their hidden stabilization/fade.

Next: define task readiness as handlers available, active data restored, layout
committed, and the first visible choices painted or in an explicit usable error
state. Aggregate only visible choices. Use a browser trace/filmstrip to verify this
endpoint. Neither a prepared-data mark nor a requestAnimationFrame callback alone
proves that the browser has presented a complete frame to the user.

### 6. Deferred work may still compete with startup

The composition root schedules deferred registrations with a two-second idle
timeout. The layout separately schedules gallery/creator warming with a two-second
timeout and other work at idle. Deferred registrations import video/export and
feedback dependencies. An idle callback or its timeout does not establish that the
active feature is ready. Production preloads the active module; development
deliberately skips that preload and serves individual source modules.

Implemented: removed idle prefetch for GeneratePanel, StepEditorCoordinator and
SequenceDrawerHost. They load when opened and remain cached for later use. Also
removed MandalaLoader from the default loading import graph. A subsequent
production trace confirmed speculative `publicSequences` and `users` queries
while opening Construct. The layout now permits that network warming only for a
Browse entry on an unconstrained connection. Local cache warming and mutation
subscriptions are retained; Browse's own loader and CreatorsPanel still fetch on
demand. The workspace's live transition staging remains unchanged.

## Changes delivered

- `src/app.html`: removes the mandatory 1,400 ms success-message hold. Starts the
  existing 400 ms exit fade and releases pointer input at shell handoff. Completion
  text no longer claims that the feature is ready. Removal ignores bubbled child
  transition events.
- `ModuleSkeleton.svelte`: uses the canonical shell skeleton for Create. The
  former second mandala mounted a live renderer which generated three sequences
  on a cold mount, then scheduled additional idle work.
- `LoadingGate.svelte`: imports MandalaLoader only for an explicit mandala variant.
  Normal bar/card/skeleton loading no longer pulls it in statically.
- Create's unopened Generate, step editor and sequence drawer no longer prefetch
  their large, overlapping dependency trees during initial Construct loading.
  Source-graph size is not shipped bundle size and these closures are not additive.
- `CsvLoader`: one pending request is shared across instances; completed caches,
  offline fallback and retries are retained. Two concurrent cold callers now make
  four asset fetches in the regression test instead of eight.
- `MotionQueryHandler`: concurrent queries share initialization and parsing. A
  failed attempt clears the pending state so the next request can recover.
- `+layout.svelte`: suppresses public-gallery and creator network prefetch when
  entering another workspace, including Construct. The profiler records the
  decision as `browse:prefetch-policy`. Local cache maintenance stays active.
- `build-for-effect.ts`: repairs the pre-existing type-gate failure by accepting
  persisted `flat-grip` fan data at the compatibility boundary. Fire behavior is
  preserved, and new output remains typed against the current prop catalog.

## Instrumentation delivered

The existing `shared/analytics/boot-profiler.ts` remains the owner. Searches covered
boot/startup profiling, marks, readiness callbacks, loading gates and the canonical
capabilities index. This extends the existing capability rather than adding a
second profiler or analytics destination.

Enable `?profile=1` on a fresh load. In a browser console or the dedicated browser
tool, `window.__tkaBootProfile.report()` returns a JSON-serializable snapshot.
Existing `localStorage.bootProfile = "1"` also enables detailed profiling on reload.
No report is automatically uploaded or persisted. Resource URLs and error messages
are omitted; trace tools remain necessary for request identity and CPU stacks.

| Evidence                                                     | Meaning                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `boot:splash:*`                                              | Checkpoints, shell handoff, fade start, timeout dismissal, DOM removal                                    |
| `imports`                                                    | Import issue through evaluation, including production preloads; overlapping durations must not be summed  |
| `module:*:chunk-ready`                                       | Feature code arrived, without a usability claim                                                           |
| `shell:ready-announced`                                      | Whether the shell used a snapshot or completed initialization                                             |
| `create:*` spans                                             | Activation, initializer import, orchestrator, individual tab initialization, sequence/session restoration |
| `csv:*` spans                                                | Load/cache source, static fetch/read, parsing                                                             |
| `construct:option-query`, `construct:option-filter`          | Candidate query/filter duration and counts                                                                |
| `construct:prepare`, `construct:options-prepared`            | Batch preparation and first completed prepared result                                                     |
| `construct:layout-settle`, `construct:layout-committed`      | Actual measured-layout commit, with timeout/cancellation detail                                           |
| `construct:start-grid-*`, `construct:start-pictograph-ready` | Start-grid stabilization/reveal and first child readiness callback                                        |
| `pictograph:grid-svg`                                        | Grid asset loading, including errors; not browser paint                                                   |

Detailed spans are opt-in and retain up to 1,000 attempts, with a dropped-attempt
counter. Each attempt has its own ID, so concurrency and retries remain visible.
An unfinished attempt has no end/outcome. Reset prevents an old callback from
completing a new run. Milestones retain their first occurrence for the document;
later navigation attempts are represented by spans rather than new boot milestones.
The export also includes available navigation/paint timings, up to 1,000 observed
long tasks and 2,000 resource entries, and existing Web Vitals. Browser buffers,
cross-origin timing restrictions and observer support can limit completeness.
Zero transfer size alone is not proof of a cache hit.

## Runtime baseline

Chrome ran in dedicated guest contexts with normal CPU/network settings. The
standardized local runs used 1280×900 desktop and 390×844 mobile viewports, DPR 1.
The local browser had warm HTTP/module caches and no controlling service worker.
Other tasks were active on the machine and occasionally changed primary-checkout
code through HMR. Only the initial navigation window is used below.

| Baseline run    | Module container | Splash removed | First unobscured start choice |
| --------------- | ---------------: | -------------: | ----------------------------: |
| Local desktop 1 |         2,266 ms |       3,468 ms |                      4,975 ms |
| Local desktop 2 |         2,417 ms |       3,578 ms |                      5,821 ms |
| Local desktop 3 |         3,394 ms |       4,066 ms |                      6,365 ms |
| Local mobile    |         2,519 ms |       3,681 ms |                      5,862 ms |

The shipped `/create` front door in a fresh guest context showed its module
container at 4,803 ms and removed the splash at 7,059 ms. Chrome's trace reported
LCP 5,190 ms, with 305 ms TTFB and 4,886 ms render delay. That run did **not** show
the active Construct picker until a method was selected, so it is not a
navigation-to-Construct-ready measurement. A subsequent deployed warm reload of
`/create/construct` reached the first unobscured start choice at 3,759 ms and
removed the splash at 4,189 ms. Those runs used the browser's original large
desktop viewport and are contextual evidence, not the standardized comparison.

The production trace contained main-thread tasks of 482 ms and 411 ms around the
splash exit and subsequent work. Long-lived Firestore requests extended the
network tree past 50 seconds; this is background connection lifetime, not time to
usable content. Production served bundled assets; the local baseline requested
roughly 3,300 development resources and 77.8 MB of encoded bodies in its first
10-second request-start window. This is not a production download-size claim.

The accompanying observer script records the first start card with an SVG,
nonzero size, visible ancestor opacity and an unobscured hit target. This is a
repeatable DOM proxy, not a browser paint guarantee. Browser clicks and screenshots
are required alongside it. The observer runs for at most 45 seconds and remains
an opt-in diagnostic artifact; it is not shipped into normal startup.

Chrome trace summary/insights were inspected, but the tool refused the requested
local raw-trace save paths. A raw trace/filmstrip is therefore not archived here.
The JSON evidence retains sanitized numeric observations without request URLs,
account identifiers or sequence contents. No p50/p95 claim is made from this sample.

## Runtime results after the initial fixes

These runs include the splash, loading-component, panel-prefetch and CSV fixes.
They precede the final Browse-network gate. They use the same viewport settings
as the local baseline, with warmed development transforms and a fresh task server.

| Changed run     | Module container | Splash removed | First unobscured start choice |
| --------------- | ---------------: | -------------: | ----------------------------: |
| Local desktop 1 |         2,123 ms |       2,067 ms |                      4,623 ms |
| Local desktop 2 |         2,364 ms |       2,226 ms |                      4,984 ms |
| Local desktop 3 |         1,965 ms |       1,939 ms |                      4,456 ms |
| Local mobile    |         2,222 ms |       2,173 ms |                      4,570 ms |

The changed development runs reached choices in 4.46–4.98 seconds versus
4.98–6.37 seconds in the baseline repeat set. The mobile samples were 4.57 versus
5.86 seconds. This is a small sequential lab comparison on a shared machine;
different server transform caches and concurrent main changes limit attribution.
It is not a production percentage or a population percentile.

A locally served production build reached choices at 2,849 ms with LCP 2,512 ms
and splash removal at 2,525 ms. Local asset transport differs from the deployed
site, so the deployed 3,759 ms warm sample is not an equivalent baseline. The
production Create initializer took 8.5 ms, inactive tab initialization took under
3 ms each, initializer import took 52 ms, sequence restoration 71 ms and session
resolution 34 ms. These measurements lower the priority of redesigning tab state
initialization. The fixed start-grid wait measured 210 ms.

First start-position selection produced 36 options after 890 ms on desktop and
849 ms on mobile. The earlier mobile selection sample was 895 ms. Desktop spans
showed 175 ms CSV loading, 46 ms parsing, 254 ms pictograph preparation and 281 ms
layout settling; preparation and settling overlap. Mobile layout settling took
399 ms, with 106 ms preparation and 34 ms CSV loading. Neither settle timed out.
The candidate filter was below 1 ms. Preserve option parity and moving-target
protection before attempting further candidate or layout changes.

The first production trace also showed later 582 ms and 449 ms main-thread tasks
and a combined Firebase transfer report of 44.4 MB. Request inspection confirmed
both required arrow-placement queries and speculative gallery/creator queries;
that byte total must not be attributed entirely to Browse. This evidence prompted
the final network-prefetch restriction.

Layout still needs attention: that trace reported CLS 0.13, mainly a sidebar and
content-wrapper shift around 2.3 seconds. The diagnostic observer itself caused
forced layouts (144 ms reported across its observation calls), so its overhead
must be distinguished from application work. No zero-shift or zero-stall claim is
made for this pass.

Direct browser checks verified desktop/mobile start pictographs and options,
adding a move, the on-demand step editor, an eight-step Generate result, restored
Construct draft state, and the export drawer via its animation-sheet deep link.
No console errors appeared in those checks. Generate was activated by keyboard
after the browser tool could not stabilize its animated pointer target.

## Reproducing the runtime pass

### Final Browse-network gate verification

The final production build (`4eeaea16d0`, including the Browse gate and current
main changes) was opened in another fresh guest context. Its profiler recorded
`browse:prefetch-policy.network = false`. Before leaving Construct, Chrome request
body inspection covered 13 Firestore POSTs: query targets were the four required
arrow/prop-placement collections, with **no `publicSequences` or `users` queries**.
This checks actual issued requests, rather than merely the policy flag.

Selecting Browse then loaded 1,524 sequences. Opening its full grid displayed
rendered cards (117 loaded images observed). Construct start selection still
produced 36 options. The final local production sample reached start choices at
3,095 ms, with splash removal at 3,012 ms. It had no long task above 151 ms in the
captured initial window. This run used the numeric observer without a full Chrome
trace and includes intervening main changes; it is not a controlled comparison
with the earlier traced sample.

Browse's production preview logged 404s for `/api/console-log`, a development
logging endpoint absent from the production server. Gallery data and images
loaded successfully. This is recorded separately from application failures.

Both production builds and the full Svelte check passed. Task preview processes
were stopped after verification; port 5173 was left running throughout.

### Capture procedure

Capture each run from navigation until the first usable Construct choices, plus a
short window after that to expose competing background work. Preserve a raw Chrome
trace/filmstrip and profiler JSON with a run label, build revision, cache setup,
viewport, CPU/network settings and whether a service worker controlled the page.
Do not include tokens, private URLs or account/sequence contents in shared reports.

Compare these cases rather than pooling unlike loads:

1. Production, fresh guest context, empty Construct start choices.
2. Production, warm reload in that same context.
3. Local development, first module load and warm reload, reported separately.
4. With approved account access: restored draft with options, warm authenticated
   reload, and direct sequence link. Record tutorial/auth prompts as separate states.
5. Desktop and mobile viewport; normal connection and controlled slower network/CPU.
6. HTTP-cache cold versus application-storage cold, and service-worker-controlled
   versus uncontrolled. A hard reload alone does not clear all these caches.

Start with a small repeat set to locate stable bottlenecks. Use enough repeated
samples before publishing p50/p95; a single trace supports attribution, not a
population percentile. Collect baseline and changed runs under the same conditions.

Accept improvements only when they reduce navigation-to-task-ready or remove a
false completion transition without breaking restored state, option parity, retry
behavior, hit targets or layout stability. Measure first response to selecting an
option as well as the initial screen, so deferring work does not merely move the
same stall onto the first click.

## Verification

The focused suites pass: 53 tests across the profiler, Web Vitals, module loading,
CSV/query initialization, splash handoff, gallery prefetch, network policy and
existing fan/effect behavior. They
cover concurrent spans and loads, failure recovery, cancellation/reset, bounded
collection, detached snapshots, opt-in behavior, immediate splash handoff and
legacy fan compatibility. The splash test executes the actual inline HTML script.

`npm run check` completed with **zero errors and zero warnings**. The earlier
TS2367 blocker is resolved. `npm run build:fast` completed successfully, including
the Cloudflare adapter and landing CSS post-processing. Existing build warnings
include unused CSS/imports, Rollup annotation warnings and Cloudflare's route-rule
limit; there was no build failure. This command does not upload or deploy.

The resulting client manifest confirms separate dynamic entries for MandalaLoader,
GeneratePanel, StepEditorCoordinator and SequenceDrawerHost. Traversing static
`imports` from CreateModule (167 chunks), MainApplication (138) and LoadingGate (6)
reaches neither MandalaLoader nor GeneratePanel. These counts overlap and do not
describe total startup requests once other dynamic imports run.
