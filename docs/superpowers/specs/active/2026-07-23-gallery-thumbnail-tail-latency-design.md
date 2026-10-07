---
status: active
value: 5
effort: M
remaining: "Implementation recheck passed 13 focused files and 69 tests on 2026-07-29. Remaining in order: approved signed-in fan warm and static sync; approved browser capture of the injected timeout and stubbed payload; target iPhone and desktop benchmark gates; release; production timeout-count and warm-cache p95 follow-up."
depends_on: "external: requires signed-in admin warm, explicit browser control, target iPhone and desktop benchmarks, then a released production cohort"
plan_path: ""
tags: ["browse", "thumbnails", "performance", "telemetry", "cache"]
last_triaged: 2026-10-07
work_state: verification
---

# Gallery Thumbnail Timeout Attribution and Cache Coverage: Design Spec

## Incident

At 2:55:55 AM CDT on 2026-07-23, Cheech encountered `Render timeout` on
`/browse/gallery`. The queue deadline is 15 seconds. The daily telemetry record
for the same signature carried a count of 21 across users, so this was not a
single-device curiosity.

A separate working-tree correction contains the exception mechanics:

- the render is aborted when the queue deadline wins;
- the deadline timer is cleared when the render wins;
- pending-promise cleanup no longer creates an ignored rejected child promise.

That work prevents a handled thumbnail failure from becoming a global unhandled
rejection. It does not explain or reduce the render that consumed 15 seconds.
This spec owns that remaining problem.

## What Cheech encountered

The full path is:

```text
PropAwareThumbnail
  -> ThumbnailRenderOrchestrator
       -> memory URL cache
       -> bundled static manifest
       -> IndexedDB thumbnail cache
       -> cloud URL cache and Firebase Storage lookup
       -> ThumbnailRenderQueue
            -> load full sequence data when metadata has no steps
            -> detect LOOP and derive a start position
            -> create a QR bitmap when requested
            -> CompositionDispatcher
                 -> worker when a proven and seeded pool is available
                 -> otherwise ImageComposer on the main thread
            -> encode the image blob
       -> local, memory, and cloud writes
```

The 15-second deadline begins after queue wait and covers the renderer work from
full-sequence loading through composition. The exception proves that a request
missed every readable thumbnail tier and did not finish that renderer work
before the deadline.

It does not identify:

- the sequence ID;
- the prop cache key;
- whether QR generation was requested;
- the last completed renderer stage;
- the current and total composition step;
- whether time was spent loading data, drawing, or encoding;
- whether the document was under main-thread pressure from sibling renders.

Those missing fields are why increasing the deadline or enabling workers now
would be guesswork.

## Additional findings

### Prop change is a strong scenario lead, not a proven cause

Cheech changed both displayed props from staff to fan roughly three hours before
the final gallery timeout. Prop type is part of the thumbnail cache key, so the
change selects a different cache class.

The checked-in static manifest was regenerated after the incident at
`2026-07-23T18:15:40.357Z`. Its current dark gallery coverage is:

| Prop  | No QR |  QR | Total |
| ----- | ----: | --: | ----: |
| staff |    23 |  55 |    78 |
| fan   |     1 |  31 |    32 |

There are no light gallery entries for either prop. The orchestrator can still
reach a matching legacy top-level fan filename by sequence name, but those keys
omit the current gallery variant and sequence ID. They cannot prove coverage
for every current gallery identity.

The admin toolbar's quick warm scope is also hard-coded to staff. The full
admin page can warm fan, but the default and Reset action select staff alone.

This makes a fan full miss more likely, especially for a non-QR request. The
telemetry did not record the timed-out key, so the field incident cannot be
attributed to fan with certainty.

### The component hides its own error state

`ThumbnailRenderOrchestrator.getThumbnail()` handles a non-cancellation failure
by:

1. reporting `{ state: "error", error }` through `onStatusChange`;
2. returning `{ url: null, error, fromCache: false }`.

`PropAwareThumbnail.svelte` then unconditionally handles the resolved result as
complete:

```ts
thumbnailUrl = result.url;
status = { state: "complete", url: result.url ?? "" };
```

That overwrites the error callback. The component has an existing inline
`.error-placeholder`, but the timeout path changes back to a normal empty
placeholder before it can remain visible.

### Existing metrics stop inside the browser

`ThumbnailMetricsCollector` already records:

- cache outcome;
- total time to URL;
- queue wait;
- render time;
- failure and cancellation rates;
- queue high-water mark;
- p50, p95, and p99 distributions.

It stores at most 1,000 requests and exposes summaries to the benchmark route
and DevTools. It does not retain request context or named renderer stages, and
it does not send a summary to production analytics.

### A gallery-first session does not initialize the worker pool

`get-thumbnail-render-queue.ts` constructs the gallery queue before any worker
probe and intentionally chooses the conservative main-thread concurrency of
three. Browse has no path that probes and seeds the worker pool, so
`CompositionDispatcher.canUseWorker()` remains false in a normal gallery-first
session. A separate feature used earlier in the page lifetime can change that
global capability state, which is another reason the request trace records
worker eligibility.

Calling the probe alone is not a valid fix. The composition worker needs a
decoded asset bundle. The existing card-pool prewarm builds that bundle by
warming the supplied full sequences on the main thread before seeding every
worker. Browse begins from metadata and may show a changing public set. A naive
single-thumbnail prewarm could do the expensive work twice and increase the
first-card delay.

The shipped worker-pool spec explicitly left Browse out of scope. This spec
keeps that boundary until stage data and a Browse-specific seed benchmark show
a net win.

## Evidence ledger

| Finding                                                | Confidence                      | Basis                                                                 |
| ------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| A queued renderer exceeded 15 seconds                  | Proven                          | The queue emitted `Render timeout`                                    |
| The request missed readable thumbnail tiers            | Proven                          | The renderer is reached only after those tiers                        |
| The timeout was being surfaced globally                | Proven and separately contained | Ignored promise cleanup preserved rejection                           |
| The inline error UI was overwritten                    | Proven                          | Callback sets error, resolved-result branch immediately sets complete |
| Browse used the main-thread path at queue construction | Proven                          | No Browse probe, `canUseWorker()` is false until probed               |
| Current fan static coverage is lower than staff        | Proven                          | Current manifest counts                                               |
| Cheech's fan selection caused this exact timeout       | Plausible, unproven             | Timing and cache-key correlation, missing timed-out key               |
| Composition is the dominant slow stage                 | Unknown                         | No stage trace in the field event                                     |

## Required outcome

1. A timed-out thumbnail remains an inline error placeholder while the card
   itself stays usable.
2. Every timeout and unexpected non-cancellation render failure captured in
   production identifies the public sequence, cache class, queue conditions,
   and last renderer stage.
3. Production records one bounded thumbnail-session summary rather than an
   event for every cache hit.
4. Fan dark QR and non-QR coverage is warmed through the existing renderer and
   synchronized into the static bundle.
5. The benchmark exercises the real metadata-to-thumbnail path and reports
   stage distributions under the same concurrency as Browse.
6. The implementation is not declared latency-complete until the benchmark
   meets the gates in this spec or a measured dominant stage is corrected and
   the benchmark is rerun.

## Design 1: Preserve the failure state

Change the resolved-result branch in `PropAwareThumbnail.svelte`:

- if `result.url` is non-null, set the URL and complete state;
- if `result.url` is null and `result.error` exists, keep or restore
  `{ state: "error", error: result.error }`;
- continue ignoring results for an obsolete cache-key hash;
- keep cancellation out of the user-visible error path.

Do not add an ErrorModal or toast for each thumbnail. Thumbnail failure is
proven and visible, but it does not block opening the sequence card. A modal per
card would interrupt browsing and could stack during a cold gallery load. The
existing inline placeholder is the earned feedback boundary.

Do not add a nested Retry button inside the thumbnail. Gallery cards are already
interactive, and a button inside the card would create competing targets. The
existing cache invalidation and remount paths remain available to admin and
future recovery work.

## Design 2: Give the deadline a type

Replace string-only timeout identification with an exported error type:

```ts
export class ThumbnailRenderTimeoutError extends Error {
  readonly code = "THUMBNAIL_RENDER_TIMEOUT";

  constructor(readonly timeoutMs: number) {
    super(`Thumbnail render exceeded ${timeoutMs}ms`);
  }
}
```

The queue still owns the safety deadline and abort. The orchestrator can now
classify a timeout without matching `"Render timeout"` text.

Cancellation remains a separate outcome and must not increment render failure
metrics or enter exception tracking.

Do not increase the 15-second deadline. A longer blank card is not a performance
fix, and it allows stalled work to occupy a queue slot for longer.

## Design 3: Stage-level request trace

Extend the existing collector instead of creating a second profiler.

### Context captured at request start

Store:

- request ID;
- thumbnail cache-key hash;
- public sequence ID when present;
- variant;
- effective prop key;
- QR requested;
- light or dark mode;
- `usesDefaults`;
- initial step count;
- queue depth and active count at enqueue;
- whether a worker was eligible at composition start.

Do not capture sequence steps, notes, creator text, attachment data, or user
profile fields. A public sequence ID is enough to load the same record later.

### Named stages

The orchestrator marks cache and queue stages. Add a small stage callback from
`ThumbnailRenderer` for its interior work. Both paths write to the same
collector and record entry time and elapsed time for:

```ts
type ThumbnailStage =
  | "static_manifest"
  | "local_cache"
  | "cloud_lookup"
  | "queue_wait"
  | "sequence_load"
  | "loop_and_start"
  | "qr_bitmap"
  | "composition"
  | "finalize";
```

The existing composition progress callback continues to own
`preparing | rendering | finalizing` and current/total progress. The trace stores
the latest progress snapshot alongside the named outer stage.

`performance.now()` remains the clock. The collector already uses it, and it is
monotonic. User Timing marks may be mirrored on the benchmark route for browser
performance tools, but production must clear any marks it creates and avoid an
unbounded performance timeline.

### Failure record

When a non-cancellation failure occurs, complete the metrics request with:

- error code;
- total elapsed time;
- queue wait;
- current stage;
- elapsed time in that stage;
- completed stage durations;
- latest composition progress;
- the bounded request context above.

The failure record must be completed exactly once even if both the sentinel
release and timeout cleanup paths run.

## Design 4: Production analytics without event flood

Create:

`src/lib/shared/analytics/thumbnail-analytics.ts`

This typed wrapper reuses `captureException()` and `captureEvent()` from the
existing PostHog owner.

### Failure capture

For every timeout and unexpected non-cancellation renderer failure:

- call `captureException(error, properties)` with the bounded trace;
- distinguish `timeout` and `render_failed`;
- include no raw sequence or message content.

This restores the stack trace the investigation needs while adding the context
the current global signature lacked.

An orphaned sequence is a data gap, not an application exception. Count it by
public sequence ID in the bounded summary and keep the current debug-level
logging. Do not send it through exception tracking.

### Page-lifetime summary

Emit one `thumbnail_session_summary` on `pagehide`, using
`sendBeacon`, with:

- request and render counts;
- outcomes by cache layer;
- p50, p95, p99 time to URL;
- p50, p95, p99 queue wait and render time;
- failure and cancellation rates;
- queue high-water mark;
- grouped counts by variant and prop;
- number of timeouts;
- longest observed stage and duration.

The summary is one event for the page lifetime. Do not emit one analytics event
for every successful thumbnail or every performance mark.

Keep the current DevTools and benchmark summary APIs. Production reporting is an
additional sink, not a replacement.

## Design 5: Close the known fan coverage gap

Use `gallery-thumbnail-warmer.ts`, the admin generate page, and the existing
manifest and sync scripts. Do not add another renderer or a server-side canvas
port.

### Admin defaults

Change the toolbar quick scope and the generate page's initial scope from
staff-only to:

```ts
props: [PropType.STAFF, PropType.FAN];
modes: ["dark"];
qr: [false, true];
```

Rename the page's `Staff only` action to `Staff + fan` and give it the same
scope. The full page keeps all-prop control. The quick path now covers both the
longstanding default and the prop class involved in this field report.

### Required warm and sync

The implementation owner performs a signed-in admin warm for fan, dark, QR off
and on across:

- public gallery metadata;
- extra canonical pool sequences already supplied to the warmer.

After the warm:

1. regenerate the cloud manifest;
2. synchronize cloud thumbnails into `static/thumbnails`;
3. confirm the current-key files exist under `gallery/fan`;
4. include the updated static manifest and files in the implementation scope.

QR combinations that cannot obtain a deterministic short code remain counted as
failed or skipped by the existing warmer. They must be listed in the run
result, not silently treated as covered.

### Coverage proof

Extend `scripts/sync-static-thumbnails.cjs` to print and store a grouped coverage
summary in `manifest.json`:

```text
variant -> prop -> mode -> qr/no-qr -> count
```

The runtime loader may continue reading only `keys`. The extra summary makes
release proof deterministic and exposes a future prop-class regression without
an ad hoc counting command.

## Design 6: Reproduce the real slow path

Extend the existing `/test/thumbnail-benchmark` route. Do not create a second
benchmark page.

Add query parameters and matching controls for:

- `prop=staff|fan|...`;
- `qr=true|false`;
- `data=full|metadata`;
- `skipCache=true|false`;
- `concurrency=1|3`;
- an optional public sequence ID filter.

Use `SegmentedControl` for exactly-one choices and `FilterChipBase` in toggle
mode for independent booleans. Since this route is being edited, replace its
existing `clearCache` checkbox with the same toggle primitive. Do not add raw
checkboxes or local chip buttons.

The current benchmark loads every full sequence before timing and therefore
removes `sequence_load` from the measured renderer. `data=metadata` must pass
the original gallery metadata into the orchestrator so the benchmark covers
the same lazy full-document load as production.

`concurrency=3` launches enough requests together to reproduce Browse's queue
pressure. The queue remains the authority on actual active concurrency.

Record:

- the existing cache and latency summary;
- stage distributions;
- every failed public sequence ID and error code;
- the five longest requests;
- supported Long Animation Frame summaries when the browser exposes that API.

Feature-detect Long Animation Frames. Do not make a browser without that API
fail the benchmark, and do not upload raw script attribution from the test
route.

## Measured optimization gate

Instrumentation is not the final latency claim. After the first full benchmark,
act on the measured dominant stage:

| Evidence                                                         | Required next action                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Full misses disappear after fan warm and cached p95 meets budget | Keep the current renderer; cache coverage was the field correction                                                              |
| `sequence_load` owns the slow tail                               | Trace the public loader and use its existing request/cache path to remove duplicate or serial reads before changing composition |
| `qr_bitmap` owns the slow tail                                   | Trace short-code and QR generation, then cache or prewarm through the existing QR owners                                        |
| `composition` owns the slow tail on the main thread              | Benchmark a Browse-specific worker seed plan against main-thread total cost before wiring the probe                             |
| `finalize` owns the slow tail                                    | Measure blob encoding and cache writes separately; preserve image parity while correcting the slow operation                    |
| One public sequence is the outlier                               | Reproduce that ID, repair its data or renderer edge case, and keep a regression fixture                                         |

Any branch that requires a new subsystem receives its own reviewed design before
implementation. The current change can close only when the selected correction
is implemented and the same benchmark is rerun.

## Performance gates

Use the same target iPhone class as the field report and a desktop reference
device.

### Warm gallery

- fan dark thumbnail time-to-URL p95 is at most 1 second on a normal connection;
- zero warmed fan requests enter the renderer;
- zero `Render timeout` exceptions occur.

### Forced-render benchmark

For at least 50 metadata-only fan sequences at concurrency three:

- zero timeout failures;
- render p95 is below 12 seconds, leaving headroom under the 15-second circuit
  breaker;
- every failure includes a public sequence ID, error code, and last stage;
- the results identify whether the worker was eligible.

Run an all-public-sequence pass before closing the implementation. If the device
cannot meet the 12-second p95, apply the measured-stage correction and rerun.
Do not relax the gate by raising the deadline.

## Tests

### Queue

Retain focused tests proving:

- the deadline aborts active work;
- a successful render clears its deadline;
- rejected work does not create an ignored child rejection;
- the queue slot is reclaimed once;
- timeout uses `ThumbnailRenderTimeoutError`;
- queued and active cancellation settle with `AbortError`;
- one cancelled subscriber does not abort a same-key render still needed by
  another card;
- cancelled IDs can be retried without stale promise cleanup deleting the retry;
- cancellation remains distinct from the timeout circuit breaker.

### Metrics and analytics

Add unit tests proving:

- stage transitions produce correct durations with a fake clock;
- request context contains the allowed fields only;
- a timeout records the last stage and progress;
- cancellation does not capture an exception;
- a page-lifetime summary is emitted once;
- the 1,000-request storage bound remains in force;
- lifetime counts and distributions continue past the 1,000-request detail cap;
- reset does not mix one benchmark iteration into the next.

### Orchestrator and component

Cover:

- a renderer timeout returns `url: null` with the typed error;
- the current key remains in error state after that resolved result;
- a stale key cannot overwrite a newer thumbnail;
- a later successful request returns to complete state.

If injecting the orchestrator into the Svelte component would require unrelated
wiring, keep the branch small and verify the visible state through the existing
test route. Do not extract a one-line CSS or state helper solely to make a test
possible.

### Static coverage

Test the coverage grouping against a small manifest fixture containing staff,
fan, QR, non-QR, dark, and light keys.

## Verification record required for completion

The completion note includes:

- focused unit-test output;
- Svelte and TypeScript check output;
- fan warmer totals: rendered, cached, skipped, and failed;
- new static coverage summary;
- benchmark JSON for the target iPhone and desktop reference;
- one screenshot showing the inline error placeholder under an injected timeout;
- one captured development telemetry payload with sequence ID, prop, stage, and
  progress, with analytics network delivery stubbed;
- a production follow-up query showing whether timeout count and warm-cache p95
  changed after release.

Browser interaction requires the normal explicit permission at implementation
time. The spec itself does not authorize control of an open browser.

## Reuse and file plan

### Extend

- `src/lib/shared/browse/components/PropAwareThumbnail.svelte`
- `src/lib/shared/browse/services/thumbnail-render-queue.ts`
- `src/lib/shared/browse/services/thumbnail-render-orchestrator.ts`
- `src/lib/shared/browse/services/thumbnail-renderer.ts`
- `src/lib/shared/browse/services/thumbnail-metrics-collector.ts`
- `src/lib/shared/browse/get-thumbnail-metrics-collector.ts`
- `src/lib/shared/debug/components/AdminToolbar.svelte`
- `src/lib/shared/render/services/composition-dispatcher.ts`
- `src/routes/admin/generate-thumbnails/+page.svelte`
- `src/routes/test/thumbnail-benchmark/+page.svelte`
- `scripts/sync-static-thumbnails.cjs`
- `package.json` and `pnpm-lock.yaml` for the bounded timing sketch

### Create

- `src/lib/shared/analytics/thumbnail-analytics.ts`
- focused tests under `tests/unit/browse/`

The analytics module is the one justified new production file. No thumbnail
analytics owner currently exists, while direct PostHog calls inside the queue,
renderer, and component would scatter one event contract across three layers.

### Leave unchanged until evidence supports it

- `composition.worker.ts`
- `card-pool-prewarm.ts`
- image layout and visual defaults
- the 15-second deadline

`CompositionDispatcher` was extended only at its existing blob-encoding seams so
`finalize` measures real main-thread and worker-result encoding. Worker
selection, pool initialization, composition behavior, and image defaults remain
unchanged.

The old feature-local queue at
`src/lib/features/browse/sequences/display/services/thumbnail-render-queue.ts`
has no live imports. Its deletion is a separate dead-code cleanup and is not
required to correct this incident.

## Implementation record: 2026-07-23

The in-repository implementation is complete:

- timeout, abort, and cancellation paths settle once and keep cancellation out
  of exception telemetry;
- same-key deduplication gives each caller its own abort boundary and keeps the
  shared render alive until its last subscriber leaves;
- obsolete key callbacks cannot overwrite current thumbnail state;
- failed resolved renders preserve the inline error placeholder;
- stage timing reaches the real blob-encoding seam on main-thread and worker
  result paths;
- the production analytics boundary emits bounded failure context and one
  `sendBeacon` page-lifetime summary;
- detailed request traces remain capped at 1,000, while bounded DDSketch
  accumulators preserve page-lifetime counts and latency distributions;
- QR-inconsistent warm results count as failures and expose failed combinations
  with the public sequence ID, prop, mode, and QR class;
- the toolbar and admin reset scope both select staff plus fan, dark mode, and
  QR off plus on;
- manifest generation reports variant, prop, mode, and QR coverage;
- the benchmark exposes cache, data-shape, concurrency, sequence, and Long
  Animation Frame controls without requiring the API on unsupported browsers.

Verification completed in this checkout:

- focused regression: 12 files and 61 tests passed;
- project check: 0 errors and 4 pre-existing CSS warnings in unrelated files;
- post-review targeted Svelte and TypeScript check: 0 errors and 0 warnings;
- targeted production TypeScript ESLint: 0 errors;
- scoped `git diff --check`: clean.

Queue revalidation on 2026-07-29 passed 13 focused files and 69 tests. The
project check completed with 0 errors and 5 existing warnings.

This spec remains active because the following evidence requires signed-in
cloud state, explicit browser-control permission, physical target devices, or a
released production cohort:

- signed-in fan warm totals and exact failed combinations;
- regenerated static bundle and post-warm fan coverage;
- iPhone and desktop benchmark JSON against the performance gates;
- injected-timeout screenshot and stubbed analytics payload capture;
- post-release timeout-count and warm-cache p95 query.

## Related repository work

- `docs/superpowers/specs/active/2026-07-02-gallery-thumbnail-warm-pass-design.md`
  defines and justifies the existing client-side warmer.
- `docs/superpowers/specs/shipped/2026-05-31-worker-pool-prewarm-wiring-design.md`
  documents why the current worker seed path was built for card preview and left
  Browse out of scope.

## Platform research

- [MDN: User Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/User_timing)
  describes application-defined, high-resolution marks and measures that
  integrate with browser performance tools.
- [MDN: Performance data](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Performance_data)
  recommends collecting application performance metrics and sending bounded
  results to analytics for bottleneck analysis.
- [MDN: Long Animation Frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing)
  explains feature detection, bounded collection, and why frame-level blocking
  is more useful than a raw long-task count for visible responsiveness.
- [MDN: `OffscreenCanvasRenderingContext2D`](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvasRenderingContext2D)
  confirms 2D canvas work can run in a worker.
- [WebKit bug 253431](https://bugs.webkit.org/show_bug.cgi?id=253431) records the
  history of partial OffscreenCanvas support. The repository's real worker
  probe remains necessary; name-based feature detection is not enough.
- [Datadog DDSketch](https://github.com/DataDog/sketches-js) provides a
  zero-dependency TypeScript implementation with relative-error quantiles suited
  to long-tailed latency streams. The collector uses its collapsing-lowest
  bounded store, while retaining exact counts, means, minima, maxima, and
  population variance.
- [DDSketch paper](https://arxiv.org/abs/1908.10693) describes the sketch's
  relative-error guarantees and mergeable streaming design.
