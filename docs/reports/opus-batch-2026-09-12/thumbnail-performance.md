# Gallery Thumbnail Latency and Cache Lifecycle — Read-Only Audit

**Date:** 2026-09-13
**Branch:** `claude/thumbnail-latency-audit-1bmwwq`
**Base SHA:** `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`, "Merge pull request #48 from austencloud/claude/hand-tunnel-toy")
**Branch commits:** `7f7b8de0` + `960879e5` (audit evidence and first draft),
`39572fd4` (the two implemented fixes, §8), `9808c689` (review corrections to this
report and to the evidence suite)
**Scope:** read-only audit of the gallery thumbnail path. New tests under
`tests/unit/opus-thumbnail-audit/` and this report are the only files this task
owns. **No production file was modified.** `StepStrip`, the carousel, and
playback cadence were not touched or inspected for change.

Reference spec:
`docs/superpowers/specs/active/2026-07-23-gallery-thumbnail-tail-latency-design.md`.

---

## 1. Executive summary

The spec's open question was _which renderer stage owns the slow tail_. The
measured answer is that **on the web build no renderer stage owns it — queue
wait does, because the two pre-rendered tiers are both unavailable during a cold
gallery load.**

1. **Tier 1 (bundled static thumbnails) does not exist in the deployed web
   app.** `scripts/trim-deploy-assets.js:50-67` deletes `thumbnails/` from the
   Cloudflare Pages output on every `npm run build`. The directory is also
   gitignored (`.gitignore:181-183`) and no CI job generates it, so nothing the
   spec's "warm fan and sync into `static/thumbnails`" step produces can reach
   tkaflowarts.com. The desktop build restores it deliberately
   (`scripts/bundle-desktop-thumbnails.cjs`, wired from
   `scripts/tauri-build-frontend.cjs`) and that script's own header describes
   the exact failure this spec is investigating: _"Without the static tier, a
   fresh desktop install cold-misses every thumbnail (cloud probes 404, the
   render queue stampedes into 15s timeouts)."_ Web never got that fix.
2. **Tier 3/4 (cloud) is unreachable for the first several seconds of a
   gallery-first session.** `loadManifest()` is registered through a
   **no-timeout** `requestIdleCallback` (`src/routes/+layout.svelte:678-693`,
   `729-730`), and the file's own neighbouring comment (`:594-597`) records that
   a no-timeout idle callback during boot "can be deferred 8-27s". Until it
   lands, `knownExists` is empty, and the orchestrator asks the cloud tier with
   `{ probeUnknown: false }` (`thumbnail-render-orchestrator.ts:509-515`), so an
   object that **does** exist in the bucket is reported as absent with no
   network request at all.
3. **Everything therefore falls to the 3-slot render queue**, whose tail is
   purely structural: measured p95 time-to-URL for a 40-card cold pass is
   **13.0x one render cost**, and `queue_wait` is the longest recorded stage.
   Any per-card cost above ~1.15 s puts the last cards of a 40-card pass past
   15 s of waiting — which is the shape of the field incident.

Four lifecycle findings sit on top of that: a returning card could be stranded on
the loading placeholder (§4.5, **fixed on this branch**), two distinct images
shared one cache key (§4.8, the reachable `cardMode` half **fixed on this
branch**; the `showMandala` half is latent), the IndexedDB tier writes on every
read and does O(n²) work per gallery pass (§4.6), and the memory tier's
replacement path has no revoke (§4.7 — **latent**, no shipped caller reaches it).
§8 records what was implemented and what stays evidence-only.

**The single cheapest high-impact change is not in the render path at all: give
`loadManifest()` a bounded idle timeout (or hoist it out of `runDeferred`) and
let the orchestrator probe unknown keys while the manifest is still in
flight.** That converts renders into a cache hit rather than making renders
faster.

---

## 2. Methodology

| Aspect             | What was done                                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules under test | Real `ThumbnailRenderOrchestrator`, `ThumbnailRenderQueue`, `ThumbnailMetricsCollector`, `ThumbnailRenderer`, `ThumbnailLocalCache`, `thumbnail-key-deriver`, and (for §4.2) the real `cloud-thumbnail-cache`.                                                               |
| Stubbed seams      | `CompositionDispatcher.compose` (a fixed delay, plus the real entry abort guard it implements at `composition-dispatcher.ts:339`), `PublicSequencesLoader.loadFullSequenceData` (a gate the test opens), IndexedDB via `fake-indexeddb`, Firebase auth/storage, and `fetch`. |
| Clock              | Vitest fake timers driving `Date`, `setTimeout` and `performance`; the metrics collector is constructed with `Date.now` for both of its injectable clocks. Every latency number is exact, not sampled.                                                                       |
| Render cost        | `RENDER_COST_MS = 800` is a **parameter, not a measurement**. Results are reported as multiples of it so they hold on any device.                                                                                                                                            |
| Concurrency        | 3 — the production Browse value (`get-thumbnail-render-queue.ts:14-17`: workers are never probed on a Browse-first session, so the conservative limit is what a gallery gets).                                                                                               |
| Not measured       | Real device latency, real WebP encode cost, real Firestore round-trips, production telemetry. Anything resting on those is labelled **inferred** or **unverified** below.                                                                                                    |

Claim labels used throughout: **measured** (a number this suite produces),
**code-proven** (follows from cited source with a passing repro test),
**inferred** (reasoned from cited code or a repo-recorded measurement), and
**unverified** (needs a device, a signed-in session, or production data).

---

## 3. Environment gap vs. production defect

The prior local review saw `/thumbnails/manifest.json` missing and one 15 s
render timeout on an "AABB" card. Separating the two:

- **Environment, expected:** `static/thumbnails/` is gitignored
  (`.gitignore:181-183`) and produced by `npm run thumbnails:sync`, a manual
  release step. A fresh checkout and any dev server will always 404 that
  manifest. The orchestrator handles it correctly — it caches the failure for
  5 s (`thumbnail-render-orchestrator.ts:174-205`) and falls through.
- **Production defect, new:** the same absence is permanent on the deployed web
  build, because `trim-deploy-assets.js` removes the directory from the output
  (§4.1). So the local observation is not a false alarm; it is the _dev
  instance_ of a condition that also holds in production for a different
  reason.
- **The one timeout is not evidence of a regression** on its own. A local dev
  first render is uncached, main-thread, and competing with Vite; the audit
  treats it only as consistent with §4.4.

Also inferred (**unverified**): in production the request for
`/thumbnails/manifest.json` most likely returns **200 with `index.html`** (the
SPA fallback — the concern `bundle-desktop-thumbnails.cjs` explicitly guards
against for desktop), so `response.json()` throws and the 5 s retry repeats for
the life of the page. Worth one `curl` against tkaflowarts.com to confirm; it
changes the fix's shape (route rule vs. tier removal) but not its priority.

---

## 4. Findings

Ranked by impact on the reported symptom.

### 4.1 The static thumbnail tier is deleted from every web deploy — CRITICAL

**Evidence (code-proven):**

- `scripts/trim-deploy-assets.js:50-52` — `DIRS_TO_REMOVE = ["screenshots", "thumbnails", ...]`, applied at `:130` to `.svelte-kit/cloudflare`.
- `package.json` `build` ends with `node scripts/trim-deploy-assets.js`, so every Pages deploy is trimmed.
- `.gitignore:181-183` — `static/thumbnails/` is never committed; `git log --diff-filter=A -- 'static/thumbnails/**'` returns nothing.
- No workflow in `.github/workflows/` runs `thumbnails:sync`; the script exists only as a manual `package.json` entry (`:53`).
- `scripts/bundle-desktop-thumbnails.cjs:1-17` — restores the current-revision slice for Tauri only, and states the consequence of its absence verbatim (cold-miss everything, cloud 404s, "the render queue stampedes into 15s timeouts"). Called from `scripts/tauri-build-frontend.cjs:8-11`.

**Impact.** Step 1 of the four-tier pipeline
(`thumbnail-render-orchestrator.ts:451-477`) can never hit on web. Every
`usesDefaults` card pays a failed manifest fetch and then depends entirely on
the cloud tier. The spec's Design 5 — warm fan, regenerate the manifest,
_"synchronize cloud thumbnails into `static/thumbnails`"_, ship the bundle —
delivers **zero** production benefit on web as currently built. The same
script's own numbers give the scale: ~11 MB for the live-revision slice,
~180 MB of stale revisions in the working copy.

**Bounded fix options (pick one; all small):**

1. Ship the current-revision slice on web the way desktop already does: run the
   existing `bundle-desktop-thumbnails.cjs` logic (rename it) after the trim
   step for the web build too, and drop `"thumbnails"` from `DIRS_TO_REMOVE`.
   ~11 MB and ~110 files is well inside Cloudflare Pages' limits; the file-count
   risk is the stale-revision tree, which that script already filters out.
2. If the trim must stay, delete the static tier from the orchestrator instead
   of leaving a permanently-404ing step, and move the coverage story entirely to
   the cloud manifest — then Design 5 must be rewritten accordingly.

Option 1 is the smaller diff and restores a genuinely instant tier. Either way
the spec's "static coverage" gates need to state which build they apply to.

### 4.2 The cloud tier is dark for the first seconds of a gallery-first load — CRITICAL

**Evidence (code-proven, repro:
`tests/unit/opus-thumbnail-audit/cloud-manifest-ordering.test.ts`):**

- `src/routes/+layout.svelte:678-693` — `loadManifest()` lives inside
  `runDeferred`; `:729-730` hands `runDeferred` to `requestIdleCallback` **with
  no `timeout` option**, after `await`ing Firestore and auth init.
- `src/routes/+layout.svelte:594-597` — the repo's own recorded measurement for
  the sibling browse prefetch: _"during startup the main thread is saturated, so
  a no-timeout idle callback can be deferred 8-27s. 2s caps how late the gallery
  warm starts."_ That callback got a `{ timeout: 2000 }`; the thumbnail manifest
  did not.
- `thumbnail-render-orchestrator.ts:509-515` — the cloud step passes
  `{ probeUnknown: false }`.
- `cloud-thumbnail-cache.ts:352-361` — manifest/own-upload keys are free;
  everything else returns `null` **without a request** when probing is off.

The repro runs the real cloud module with a bucket that _does_ contain the
object: before `loadManifest()` resolves the orchestrator renders locally and
never touches the network for that key; after it resolves, the identical request
is a cloud hit with zero renders. The manifest's arrival time is the only
variable.

**Impact.** On a cold `/browse/gallery` entry every visible card is decided
during exactly the window the layout comment says can last 8-27 s. Those cards
render locally at concurrency 3 (§4.4) and then _upload files that already
exist_ (`upload()` does a `probeUnknown: false` existence check at
`cloud-thumbnail-cache.ts:490`, which has the same blind spot). The renders
themselves saturate the main thread, which is what keeps the idle callback from
running — a self-reinforcing loop.

**Bounded fix:**

1. `requestIdleCallback(runDeferred, { timeout: 2000 })` — one argument, matches
   the existing precedent 130 lines above. Better: hoist `loadManifest()` out of
   `runDeferred` and start it eagerly when the route is `/browse/*`.
2. In the orchestrator's cloud step, allow the probe while the manifest is still
   pending: `probeUnknown: !isManifestLoaded()`. `getUrl` already throttles
   probes to 5 concurrent by Y-position priority and negative-caches 404s for
   24 h (`cloud-thumbnail-cache.ts:132-179, 235-261`), so this is bounded, and it
   is the mechanism that already exists to keep the tier alive "when the manifest
   lags" — it is simply switched off on the gallery path.
3. Cheapest correctness guard: `await loadManifest()` (idempotent, deduped) in
   the cloud step before concluding a miss.

### 4.3 One display toggle removes all shared caching for the whole gallery — HIGH

**Evidence (measured, repro:
`tests/unit/opus-thumbnail-audit/shared-class-coverage.test.ts`):** the static
and cloud steps are both gated on `key.usesDefaults`
(`thumbnail-render-orchestrator.ts:452`, `:496`), and `checkInputUsesDefaults`
(`thumbnail-key-deriver.ts:205-286`) fails on any non-canonical composition or
visibility value. The test enumerates 14 values a user or an embedding surface
can produce today; every one collapses the class. Measured on a 40-card gallery
whose default class is fully warmed:

| Scenario                          | renders | static hits | manifest fetched | cloud asked |
| --------------------------------- | ------- | ----------- | ---------------- | ----------- |
| default settings (control)        | 0       | 40          | once             | no          |
| `showMandala: false` (one toggle) | **40**  | 0           | **never**        | **never**   |

`showMandala` is a real user-facing toggle
(`ExportImagePanel.svelte:558` `aria-pressed`, persisted in
`image-composition-state.svelte.ts:756`) and `buildGalleryVisibility` feeds it
straight into every gallery card's key
(`gallery-render-input.ts:160-180`). The same holds for the per-length
"Left Column" start layout, grid dots, hand points, non-radial points, a custom
hand palette, and hand-path mode.

**Impact.** A user who flips one display preference gets a permanently
all-local gallery: no static, no cloud read, and no upload either (so their
renders never help anyone, including themselves on another device). This is the
same starvation class as the June 2026 `showMandala` incident the deriver's
comments describe, reached through a supported setting rather than a bug.

**Bounded fix.** Do for these flags what was already done for QR
(`thumbnail-key-deriver.ts:269-274`): they are not personal data, they are
_shared-cacheable variants_. Move `showMandala` (and, if the warm budget allows,
`startPositionLayout: "column"`) out of the disqualifier list and into the
shared key + storage path as explicit suffixes, then warm both values. Keep
`primaryPropColors` and `customNotesText` personal. This multiplies warm cost by
the number of admitted variants, so it is a product decision: admit the two
toggles users actually flip, not all fourteen.

### 4.4 The tail is queue wait, not composition — HIGH (answers the spec's open question)

**Evidence (measured, repro:
`tests/unit/opus-thumbnail-audit/gallery-latency-model.test.ts`); 40 cards,
concurrency 3, per-render cost R = 800 ms:**

| Metric                 | Measured                | As multiples of R |
| ---------------------- | ----------------------- | ----------------- |
| time-to-URL p50        | 5 598 ms                | 7.0 R             |
| time-to-URL p95        | 10 407 ms               | 13.0 R            |
| time-to-URL max        | 11 200 ms               | 14.0 R            |
| queue wait p50         | 4 771 ms                | 6.0 R             |
| queue wait p95         | 9 607 ms                | 12.0 R            |
| queue wait max         | 10 400 ms               | 13.0 R            |
| render time p95        | 804 ms                  | 1.0 R             |
| queue high-water mark  | 39                      | —                 |
| longest recorded stage | `queue_wait`, 11 200 ms | —                 |

Warm control (static manifest holds all 40 keys): 0 renders, 0 ms time-to-URL
max, no queue-wait samples.

**Impact.** 92 % of the p95 is waiting, not working. Consequences for the spec:

- The spec's forced-render gate ("render p95 below 12 s, leaving headroom under
  the 15-second circuit breaker") measures the wrong quantity for the field
  symptom. The 15 s deadline is an **inactivity** deadline on one task
  (`thumbnail-render-queue.ts:47-50, 275-292`), but the user-visible wait is
  `13 x R` for the last card. Any R above ~1.15 s means the last cards of a
  40-card pass have waited longer than the breaker's whole budget before their
  own work even starts.
- "Composition is the dominant slow stage" cannot be confirmed or denied by this
  suite (no real composition cost here), but it is the wrong lever to reach
  first: at concurrency 3, halving R halves the tail, while turning a cold pass
  into a warm pass (§4.1-4.3) removes it.
- Raising concurrency is **not** a safe substitute (**inferred**): composition
  runs on the main thread in a Browse-first session
  (`get-thumbnail-render-queue.ts:14-17`, no `probeWorkerSupport()` call on any
  Browse path), so more slots mainly means more contention.

### 4.5 Fast scroll stranded a returning card's thumbnail — HIGH — **FIXED on this branch**

**Evidence (code-proven; evidence repro:
`tests/unit/opus-thumbnail-audit/scroll-cancellation-lifecycle.test.ts`,
regression coverage with the fix:
`tests/unit/browse/thumbnail-queue-task-identity.test.ts`):**

1. `ThumbnailRenderer.render()` (`thumbnail-renderer.ts:89-194`) never checks
   its `signal` between stages. The first and only observation point is inside
   `CompositionDispatcher.compose()` (`composition-dispatcher.ts:339`). So an
   aborted render still completes `sequence_load` (a Firestore read) and LOOP
   detection — measured: `detectLOOPType` runs _after_ the abort, and the render
   promise does not settle until the abandoned read resolves. **Still open** (the
   renderer is outside this task's ownership).
2. Because it does not settle, `ThumbnailRenderQueue` still counts the slot as
   active. Measured: three cancelled renders hold `getStats().active === 3` and
   a card that is _currently visible_ does not start until the three abandoned
   document reads land. **Still open**, and largely a consequence of (1): the
   slot legitimately belongs to running work.
3. `cancelCoreTask` dropped the dedup entry **only** for a queued task; for an
   active task it just aborted the controller. A card that scrolled back before
   the abandoned render settled therefore deduplicated onto it and inherited its
   outcome: an `AbortError` on a request whose own signal was never aborted, or —
   when the abandoned read stalled — that render's full 15 s inactivity deadline.
   **Fixed**, see below.

`PropAwareThumbnail.svelte:416-423` treats a cancellation as "not mine": no URL,
no error placeholder. `currentKeyHash` still equals the key (`:347-349`), so the
`$effect` does not re-request. The card then stays on the shimmering loading
placeholder **until one of: its cache key changes (a prop, theme, settings or
sequence change); a `thumbnailCacheCleared` event while it is visible; an
explicit `forceRerender()`; or the virtual grid unmounts and remounts it** —
`SectionedVirtualGrid` renders only the visible window plus `overscan: 4` rows
(`:369`), so scrolling several rows away and back does recycle the component and
clear the state. The stuck window is the one where the card stays mounted, which
is exactly the window a short scroll-out-and-back produces.

**Impact.** Stuck grey cards after flinging through the gallery, until one of the
recovery events above. Point 2 also inflates the tail for every visible card
queued behind an abandoned render, and can attribute a 15 s timeout to a card
the user is looking at when the stalled read belongs to one they scrolled past.

**Fix applied (owned by this task): per-task identity in
`ThumbnailRenderQueue`.**

Dropping `pendingPromises` at cancel time is necessary but **not sufficient on
its own**: the queue's slot, controller and consumer bookkeeping were all keyed
by thumbnail ID (`activeIds`, `activeControllers`, `consumerCounts`), so two
live tasks under one ID would share them and the older task's `finally` cleanup
(`activeCount--`, `activeControllers.delete(task.id)`) would erase the retry's
state — trading a stranded card for a lost slot and an uncancellable render. The
implemented change therefore:

- gives every task a monotonic `token`, and keys `activeTasks` (slot +
  controller) and `consumerCounts` by that token, so cleanup can only ever
  remove the state it installed. `activeCount`/`activeIds` are derived from
  `activeTasks`, keeping `QueueStats` shape-compatible;
- releases the ID (`forgetPendingTask`) when a task is cancelled — active or
  queued — so a returning card starts a fresh render instead of adopting a dying
  one, while the cancelled task keeps its slot until its own work settles;
- makes `cancel(id)` act on every task registered under that ID (queued plus a
  released-but-unsettled active one) and idempotent, and extends `cancelAll()`
  with the same release semantics.

Prompt settlement (point 1) remains the complementary fix and is **not** a
substitute: `await loadFullSequenceData(...)` cannot be interrupted, so the
window always exists — token identity is what makes the retry safe inside it.

**Still recommended, not in this task's scope:**

1. `thumbnail-renderer.ts` — `if (signal?.aborted) throw new DOMException("Aborted", "AbortError")`
   after `ensureFullSequenceData`, after `loop_and_start`, and after the QR
   bitmap. Three lines; releases the queue slot promptly and removes the wasted
   main-thread LOOP detection.
2. `PropAwareThumbnail.svelte` — when a _current_ request ends in cancellation
   while the card is still visible and still wants that key, clear
   `currentKeyHash` so the effect can re-request. Belt-and-braces once (1) lands.
3. Passing the request's `AbortSignal` into `loadFullSequenceData` is the
   complete form of (1), but it changes `PublicSequencesLoader`'s public shape
   and belongs in its own change.

### 4.6 The IndexedDB tier writes on every read and rescans the store on every write — MEDIUM

**Evidence (measured, repro:
`tests/unit/opus-thumbnail-audit/local-cache-io-amplification.test.ts`, real
`ThumbnailLocalCache` on `fake-indexeddb`):**

- `get()` opens a **readwrite** transaction and `put()`s the whole record — blob
  included — on every hit, only to refresh an LRU timestamp
  (`thumbnail-local-cache.ts:122, 131-134`). Measured: 40 warm hits → 40
  readwrite transactions and 40 blob rewrites. A miss writes nothing (control).
- `set()` fires `prune()` (`:164`), which calls `getStats()` (`:279`), which
  walks the entire store with a **value** cursor (`:245`). Measured cursor steps
  for a cold pass, exactly n(n+1)/2:

  | writes | cursor steps | n(n+1)/2 |
  | ------ | ------------ | -------- |
  | 10     | 55           | 55       |
  | 30     | 465          | 465      |
  | 60     | 1 830        | 1 830    |
  | 120    | 7 260        | 7 260    |

  The store never exceeds the 100 MB budget in these runs, so **none of that
  scanning evicts anything** — it is pure overhead per write.

**Impact (inferred from spec behaviour, not measured on a device):** IndexedDB
serializes readwrite transactions with overlapping scope, so the reads and the
scans queue behind each other on one object store. `get()` abandons a read after
500 ms and reports a **miss**, not an error (`:29, 107-115`), and a miss becomes
a full local render — which writes a blob, which triggers another full-store
scan. On a phone with a warm-but-contended cache this promotes hits into
renders, which is a plausible second mechanism behind the field timeout.
Quantifying it needs a real device.

**Bounded fix:**

1. Read in a `readonly` transaction. Refresh the LRU timestamp separately —
   either a tiny `{key, timestamp}` record in a second store, or skip the touch
   when the stored timestamp is less than an hour old. Removes every write from
   the read path.
2. Keep a running `sizeBytes` total (updated on set/delete, seeded once) so
   `prune()` can decide in O(1) and only scan when it will actually evict; or
   throttle `prune()` to every Nth write. Either removes the O(n²).
3. Optional: an explicit `size` index so a future scan can use
   `openKeyCursor()` instead of deserializing records.

### 4.7 The memory tier does not revoke the blob URL it replaces — LOW, **latent**

**Evidence (measured, repro:
`tests/unit/opus-thumbnail-audit/memory-url-cache-lifecycle.test.ts`):**
`MemoryUrlCache.set()` (`thumbnail-render-orchestrator.ts:108-123`) deletes a
displaced entry without revoking it; it revokes only on LRU eviction, in
`delete()`, and in `clear()`.

**Reachability: latent — no shipped caller performs that replacement.** This
report's first draft called it a leak "on every re-render", which was wrong.
There are exactly three production paths that re-render an already-cached hash,
and all three remove the entry first:

| Path                                                     | Protection                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handleImageError` (`PropAwareThumbnail.svelte:298-335`) | `repairThumbnailCaches` → synchronous `evictHash(hash)` (`thumbnail-repair.ts:20`), which revokes, before `skipCacheOnNextRequest` is set                         |
| `forceRerender` (`:506-533`)                             | same repair owner, same synchronous eviction                                                                                                                      |
| `handleCacheCleared` (`:241-255`)                        | only ever dispatched by `AdminToolbar.svelte:214`, five lines after that component calls `invalidateAllCaches()` (`:209`), which clears and revokes the whole map |

Those three protections are now pinned as controls in the repro file, alongside
one test that exercises the class-level gap directly (a `skipCache` render over a
live entry — a sequence nothing ships today). So the finding is: **the invariant
lives in three call sites instead of in the cache**, and the next caller that
re-renders a cached hash without evicting first leaks silently.

Separately, and unchanged: the memory tier's cap is **500 entries with no byte
budget** (`:94`), and a live `blob:` URL keeps its `Blob` alive for the
document's lifetime. Order-of-magnitude retention, **inferred** from the repo's
own ~11 MB figure for the live static slice
(`bundle-desktop-thumbnails.cjs:12-15`) against the 110 current dark-gallery keys
in the spec's manifest table (≈100 KB per thumbnail): roughly 50 MB held at
steady state on a fully browsed gallery. Not measured on a device.

**Bounded fix.** Four lines in `MemoryUrlCache.set()`: when replacing an existing
hash whose stored URL differs and starts with `blob:`, revoke it — moving the
invariant into the owner. Optionally add a byte budget beside the entry cap.
`renderedGenerations` (`:294`) also grows without bound and is never pruned when
the URL cache evicts; harmless today (short strings), worth clearing together.
Not implemented here: the reachability is unproven, and this task's authorization
excludes it.

### 4.8 Two distinct images shared one cache key — MEDIUM (correctness)

**Evidence (code-proven; evidence repro:
`tests/unit/opus-thumbnail-audit/cache-key-collisions.test.ts`, regression
coverage with the fix:
`tests/unit/browse/thumbnail-cardmode-cache-identity.test.ts`):**

- **`cardMode` — reachable in the personal tiers; latent for the cloud. FIXED on
  this branch.** It was absent from `checkInputUsesDefaults` and from both hash
  branches, so the 5:7 playing-card raster and the standard raster shared one
  hash. Reachable today through the card designer:
  `CardPreviewStack.svelte:154-156` passes `cardMode={!printMode}` while
  `ChoreoCard.svelte:105` resolves **both** states to `lightMode: true`, so the
  two layouts derive the same key in the memory + IndexedDB tiers (the printMode
  branch only avoids the render when a pre-rendered front already exists, so the
  frequency is low). The **cloud** half was latent: every shipped `cardMode`
  caller also sets `customNotesText`, which already forced
  `usesDefaults: false`, so no shared object was ever written under a colliding
  key.
- **`showMandala` — latent.** The deriver's canonical default is `true`
  (`thumbnail-key-deriver.ts:249-257`), the renderer's fallback for the same
  field is `?? false` (`thumbnail-renderer.ts:365`), and the shared hash branch
  omits the field, so `showMandala: true` and `showMandala: undefined` produce
  the same hash and cloud path while the composer draws mandalas in only one
  (`card-front-assembler.ts:373` is a truthiness check). **No shipped caller
  reaches it:** every producer of a visibility object sets the field explicitly —
  `ChoreoCard.svelte:126`, `buildGalleryVisibility`'s no-visibility branch
  (`gallery-render-input.ts:173-180`), and `gallery-thumbnail-warmer.ts:207`.
  The first draft of this report cited ChoreoCard as a reachable omission; that
  was wrong.

**Fix applied (owned by this task): `cardMode` in the cache identity.**

- `checkInputUsesDefaults` now disqualifies `cardMode`, so a card-layout render
  can never be classified shareable and can never be uploaded to, or served
  from, the static/cloud tiers that hold one layout per variant.
- `buildFullHashInput` includes `cardMode` **only when it is true**, mirroring
  the existing `primaryPropColors` treatment. That is what makes the change
  free: a cardMode render gets a new identity and **every existing key stays
  byte-identical**, pinned by a regression test against the hashes `main`
  produced (`-382kas`, `30dl4f`, `-iwx7i2`).

**No `THUMBNAIL_RENDERER_VERSION` bump is required**, and the first draft's claim
that one was is withdrawn. A global bump exists to invalidate _shared_ rasters,
and no shared object was ever written under a colliding cardMode key (see
above); the shared hash branch is untouched by this change, so bumping would
cold-start the entire correctly-warmed static and cloud population for nothing.
The only stale entries are personal IndexedDB/memory records for the old
colliding key, which are simply no longer addressed and age out through the
existing LRU/100 MB prune.

**Remaining, not implemented:** normalize `showMandala` so the invariant leaves
the callers — either make `buildGalleryVisibility`'s explicit-field guarantee
unconditional (it currently only applies to the no-`visibility` branch), or align
the renderer's fallback with the deriver's canonical default (`?? true`). Neither
changes any hash, so neither needs a version bump.

### 4.9 `sequence_load` is the one stage with no time bound on web and mobile — MEDIUM

**Evidence (code-proven):** `PublicSequencesLoader.loadFullSequenceDataStrict`
bounds the source-document read **only** on desktop and only when a renderable
cached copy exists (`public-sequences-loader.ts:296-303`,
`DESKTOP_SOURCE_READ_TIMEOUT_MS = 2500` at `:37`). On web and Capacitor the
`getDoc` is awaited with no timeout, and an online client with a fully hydrated
local index still waits for the network (`:296-297` returns the local copy only
when `!networkStatusState.isOnline`). The loader takes no `AbortSignal`, so
nothing upstream can cancel it (§4.5).

**Impact (inferred).** For a metadata-only gallery card this is the first stage
of the render, inside the queue slot, with only the 15 s inactivity deadline as
a bound — and `reportActivity()` is not called during the await, so the deadline
genuinely applies. On a flaky phone connection this is the most likely single
stage to consume the whole 15 s, which matches the field report better than
composition does. The spec's stage trace would confirm it directly in
production.

**Bounded fix.** Apply the existing `withTimeout` + local-copy fallback on every
platform, not just desktop, when a renderable cached copy exists. The helper and
the fallback already exist in the file; the change is the condition.

### 4.10 The QR preview machinery has no production caller — LOW (dead complexity)

**Evidence (code-proven):** `qrPolicy` appears in `src/` only in
`thumbnail-render-orchestrator.ts` itself (`:66, 360, 364, 381, 535`) and in
tests. No component or service passes it, so `getThumbnail`'s
preview-then-upgrade path, the second `backgroundQueue`, `waitForPreviewQueue`,
and `onPreview` are unreachable in production. The queue's `exclusive` lane is
likewise unreachable from the gallery grid, because grid cards force
`allowQR: false` (`PropAwareThumbnail.svelte:199` →
`gallery-render-input.ts:131`); it can only be entered by wordcard surfaces.

**Impact.** No user-visible defect, but the cost/benefit claims the spec makes
for the exclusive lane and the preview upgrade are untested in production, and
`waitForPreviewQueue` polls every 100 ms while refreshing the inactivity
deadline (`thumbnail-render-orchestrator.ts:741-769`) — an unbounded wait that
no timeout can interrupt, if it were ever wired up behind a busy main queue.

**Bounded fix.** Either wire it (pass `qrPolicy: "background"` from the surface
it was designed for) or delete it in a dead-code pass. Decide before adding more
paths that depend on it.

---

## 5. Checked and found healthy (negative results)

Recording these so the next audit does not re-derive them:

- **Key hash strength.** `computeHash` is a 32-bit string hash, which looked
  risky. Measured over production-shaped populations: **zero** collisions at
  2 000, 10 000 and 40 000 keys (expected value at 10 000 is ~0.012). Not a
  problem at gallery scale; the 10 000-key census is pinned as a tripwire.
- **Timeout and cancellation accounting.** The existing suite's guarantees hold:
  the deadline is inactivity-based and refreshed by real progress, a successful
  render clears it, a slot is reclaimed exactly once, cancellation stays out of
  exception capture and out of `renderFailures`, and a shared render survives
  one consumer leaving. Verified by re-running `tests/unit/browse/` green.
- **Main-thread composition is cooperatively cancellable.** `ImageComposer`
  checks the signal and yields per beat (`image-composer.ts:383-385`), so the
  _composition_ stage does honour an abort — the problem in §4.5 is strictly
  pre-composition.
- **Warmer/live key parity.** `gallery-thumbnail-warmer.ts:198-213` renders
  through `buildGalleryRenderInput` with `showMandala: true` and an explicit
  per-combo QR flag, so it lands on the same class a default-settings signed-in
  card asks for. §4.3 and §4.8 are about _other_ classes, not warmer drift.
- **Static manifest failure handling.** Coalesced, cached, and retried on a 5 s
  cooldown without poisoning a successful empty manifest.
- **`showLoopGlyph`, `showGrid`, `handPointVisibility`, `showNonRadialPoints`,
  `showTKA`, `showReversals`** all have renderer fallbacks that agree with the
  deriver's canonical defaults; `showMandala` is the only field where they
  disagree.
- **Composition settings load synchronously** from localStorage in the manager's
  constructor (`image-composition-state.svelte.ts:164-166, 403`), so there is no
  default→loaded key churn from that source on a cold gallery.

---

## 6. Open questions (need a device, a session, or production data)

1. **Does `/thumbnails/manifest.json` 404 or return `index.html` in
   production?** One `curl` settles it and decides whether §4.1's fix needs a
   route rule.
2. **Real per-card render cost R on the target iPhone and a desktop
   reference.** §4.4 is a multiplier; R turns it into seconds. The existing
   `/test/thumbnail-benchmark` route already reports it.
3. **Whether `settingsService.syncFromFirebase()` can change `leftPropType` /
   `rightPropType` after the gallery has mounted** (`settings-state.svelte.ts:214-245`).
   If the Firestore value differs from the localStorage mirror, every visible
   card's key changes and the whole pass re-renders. **Unverified** — needs a
   signed-in session with drifted settings.
4. **Real IndexedDB contention cost** for §4.6 on a phone; the growth curve here
   is from an in-memory shim.
5. **Production distribution of non-default classes** (§4.3): how many users
   have flipped one of the fourteen toggles? The existing
   `thumbnail_session_summary` already carries `byVariantAndProp` and
   `byLayer`; a `usesDefaults` count would answer it directly.

---

## 7. Recommended order of work

| #   | Change                                                                   | Finding | Size | Status                                                        |
| --- | ------------------------------------------------------------------------ | ------- | ---- | ------------------------------------------------------------- |
| —   | Per-task identity in the queue; release the ID on cancel                 | 4.5     | S    | **Done on this branch** (§8)                                  |
| —   | `cardMode` in the personal hash; disqualified from the shared class      | 4.8     | XS   | **Done on this branch** (§8)                                  |
| 1   | Bound the idle manifest load; probe unknown keys while it is pending     | 4.2     | XS   | Turns cold renders into cache hits with two small edits       |
| 2   | Restore the static tier on web (or delete the tier and rewrite Design 5) | 4.1     | S-M  | Reinstates the only instant tier; unblocks the warm/sync work |
| 3   | Stage-level signal checks in `ThumbnailRenderer`                         | 4.5     | XS   | Frees queue slots and stops wasted post-cancel work           |
| 4   | `readonly` reads + O(1) prune decision in the local cache                | 4.6     | S    | Removes write amplification and the O(n²) scan                |
| 5   | Bound the source read on all platforms                                   | 4.9     | XS   | Removes the last unbounded stage                              |
| 6   | Normalize `showMandala` so the invariant leaves the callers              | 4.8     | XS   | Closes the remaining latent key collision; no version bump    |
| 7   | Revoke the displaced blob URL in `MemoryUrlCache.set()`                  | 4.7     | XS   | Moves a latent invariant into its owner                       |
| 8   | Re-benchmark, then decide about workers/concurrency                      | 4.4     | M    | Only meaningful once 1-2 have removed the cold-pass renders   |
| 9   | Wire or delete the `qrPolicy` preview path                               | 4.10    | S    | Stop carrying untested complexity                             |

Items 1, 3, 5, 6 and 7 are each a handful of lines in files that already own the
behaviour. Item 2 is a build-pipeline decision. Item 8 is where the spec's
"measured optimization gate" actually belongs, and it should be re-run _after_
the cache tiers work, or it will keep measuring a cold pass that should not have
happened. Items 6 and 7 are ordered after the live-latency work deliberately:
both are latent hazards, not current defects.

---

## 8. Implementation on this branch

Everything in §3–§7 is **evidence**: a read-only audit with repro tests under
`tests/unit/opus-thumbnail-audit/`. Two findings were then authorized for
implementation, and only those two production files changed. Their regression
tests live **with the fix**, in `tests/unit/browse/`, not in the audit suite.

### 8.1 `src/lib/shared/browse/services/thumbnail-render-queue.ts` (§4.5)

Per-task identity, then release-on-cancel:

- every task carries a monotonic `token`; `activeTasks` (slot + controller) and
  `consumerCounts` are keyed by it, so a task's cleanup can only remove the state
  it installed. `getStats()` derives `active`/`activeIds` from `activeTasks`, so
  the public `QueueStats` shape is unchanged;
- `cancelTask()` drops the dedup entry for the cancelled task — active or queued —
  so a returning card starts a fresh render, while the cancelled task keeps its
  slot until its own work settles;
- `cancel(id)` now acts on every task registered under that ID and is idempotent;
  `cancelAll()` uses the same release semantics.

Why not the simpler change: dropping `pendingPromises` alone would let two live
tasks share ID-keyed bookkeeping, so the older task's `finally`
(`activeCount--`, `activeControllers.delete(task.id)`) would erase the retry's
slot and controller. Prompt settlement in the renderer shortens the window but
cannot remove it — `await loadFullSequenceData(...)` is not interruptible — so
token identity is the load-bearing part.

### 8.2 `src/lib/shared/browse/services/thumbnail-key-deriver.ts` (§4.8)

- `checkInputUsesDefaults` disqualifies `cardMode`, keeping the 5:7 card layout
  out of the shared static/cloud class;
- `buildFullHashInput` includes `cardMode` only when true (the existing
  `primaryPropColors` shape), so a card render gains an identity while **every
  existing key stays byte-identical**. No `THUMBNAIL_RENDERER_VERSION` bump — see
  §4.8 for why one would be actively harmful here.

### 8.3 Evidence that the tests fail before and pass after

Run on the same working tree, with only the two production files stashed:

```bash
git stash push -- src/lib/shared/browse/services/thumbnail-render-queue.ts \
                  src/lib/shared/browse/services/thumbnail-key-deriver.ts
npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/browse/thumbnail-queue-task-identity.test.ts \
  tests/unit/browse/thumbnail-cardmode-cache-identity.test.ts
# 6 failed | 2 passed (8)
#   × gives the 5:7 card layout a different hash from the standard layout
#   × keeps a cardMode render out of the shared static/cloud class
#   × releases the ID so a retry renders instead of adopting the dying task
#   × keeps the retry's slot, controller and consumer count ...
#   × does not make the retry wait out the abandoned task's inactivity deadline
#   × CONTROL: one consumer leaving does not cancel a render another card needs
#     (collateral: it passes in isolation pre-fix; the two 15s/30s hangs above
#      starve it when the file runs as a whole)
#   ✓ leaves every existing key byte-identical   <- must pass in BOTH states
#   ✓ CONTROL: two consumers of one live task still share a single render
git stash pop

npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/browse/thumbnail-queue-task-identity.test.ts \
  tests/unit/browse/thumbnail-cardmode-cache-identity.test.ts
# 9 passed (9)   (6 queue/orchestrator + 3 key identity)
```

### 8.4 Corrections applied to the first draft of this report

Recorded because the first version overstated three things:

| Claim in the first draft                                             | Correction                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "the memory tier leaks a blob URL on every re-render"                | Wrong. All three production re-render paths evict (and revoke) first — two via `repairThumbnailCaches` → `evictHash`, one behind `invalidateAllCaches()`. Downgraded to a latent class-level gap (§4.7); the test that "proved" it did two artificial `skipCache` renders per key and has been replaced with one direct exercise of the class plus controls that pin the three protections. |
| "`ChoreoCard` passes a visibility object without `showMandala`"      | Wrong: `ChoreoCard.svelte:126` sets it explicitly. No shipped caller omits it, so the `showMandala` collision is latent, not reachable (§4.8).                                                                                                                                                                                                                                              |
| "bump `THUMBNAIL_RENDERER_VERSION` with the `cardMode` change"       | Withdrawn. Nothing shared was ever written under a colliding key and the shared hash branch is untouched, so a bump would cold-start the whole warmed population for nothing (§4.8).                                                                                                                                                                                                        |
| "the card stays stranded for the rest of the session"                | Overstated. Recovery happens on a key change, a cache-cleared event while visible, `forceRerender()`, or a virtual-grid remount (`SectionedVirtualGrid` keeps only the visible window plus `overscan: 4`) — §4.5.                                                                                                                                                                           |
| "drop `pendingPromises` when an active task is cancelled" as the fix | Insufficient and unsafe on its own; it needed per-task identity first (§8.1).                                                                                                                                                                                                                                                                                                               |

---

## 9. Deliverables, commands, and results

### Files this task owns

Production (implementation, §8):

```
src/lib/shared/browse/services/thumbnail-render-queue.ts
src/lib/shared/browse/services/thumbnail-key-deriver.ts
```

Regression tests for those fixes:

```
tests/unit/browse/thumbnail-queue-task-identity.test.ts        (6 tests)
tests/unit/browse/thumbnail-cardmode-cache-identity.test.ts    (3 tests)
```

Audit evidence (read-only repros) and this report:

```
tests/unit/opus-thumbnail-audit/cache-key-collisions.test.ts          (4 tests)
tests/unit/opus-thumbnail-audit/cloud-manifest-ordering.test.ts       (3 tests)
tests/unit/opus-thumbnail-audit/gallery-latency-model.test.ts         (3 tests)
tests/unit/opus-thumbnail-audit/local-cache-io-amplification.test.ts  (5 tests)
tests/unit/opus-thumbnail-audit/memory-url-cache-lifecycle.test.ts    (5 tests)
tests/unit/opus-thumbnail-audit/scroll-cancellation-lifecycle.test.ts (2 tests)
tests/unit/opus-thumbnail-audit/shared-class-coverage.test.ts         (4 tests)
docs/reports/opus-batch-2026-09-12/thumbnail-performance.md
```

Naming in the evidence suite: `DEFECT:` is an assertion that pins current
behaviour and says what it should become; `LATENT:` pins a class-level hazard no
shipped caller reaches; `CONTROL:` pins behaviour that must not change. The two
findings fixed in §8 no longer appear as `DEFECT:` assertions there — their
(inverted) coverage moved to `tests/unit/browse/`, so nothing in this branch
asserts behaviour the branch itself corrects.

### Commands run

```bash
pnpm install                                   # exit 0
npm run build:packages                         # exit 0 (required: @tka/tka-types)

# fail-before / pass-after for the two fixes: see §8.3 (6 failed -> 9 passed)

npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/browse tests/unit/opus-thumbnail-audit src/lib/shared/browse \
  tests/unit/thumbnail-cache-keys.test.ts tests/unit/thumbnail-local-cache.test.ts \
  tests/unit/gallery-render-input.test.ts tests/unit/offline-cache-orchestrator.test.ts
# 63 files, 313 tests, all passed (19.6s) — every existing queue, orchestrator,
# metrics, renderer, warmer, preview, manifest-retry and cache-key suite stays
# green with the two production changes in place

npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/primary-prop-colors.test.ts \
  src/lib/shared/render/services/__tests__/image-composer-palette-prepare.test.ts \
  src/lib/shared/render/services/buugeng-chirality-raster.test.ts
# 3 files, 14 tests, all passed — the remaining suites that touch deriveKey

npm run check:tsc
# exit 1 — one PRE-EXISTING owned error, unrelated to this task:
#   src/lib/features/community/get-geocoding-service.ts(4,10): TS2305
#   Module '"$env/static/public"' has no exported member 'PUBLIC_GOOGLE_MAPS_API_KEY'
#   (this container has no .env; neither changed production file nor any new
#    test produced a diagnostic)

npx prettier --check <owned files>
# clean, except thumbnail-key-deriver.ts, which does not conform on main either
# (verified against `git show HEAD:` of the same file). Its formatting is left
# untouched; prettier reproduces both added hunks byte-for-byte, so the added
# lines themselves conform.

npx eslint src/lib/shared/browse/services/thumbnail-render-queue.ts \
           src/lib/shared/browse/services/thumbnail-key-deriver.ts
# 0 problems (tests/ is in eslint.config.js:11-28's global ignores)
```

### Limitations

- No browser pass. Neither production change alters a rendered surface: the key
  change gives the card layout its own identity (the same image, a different
  cache slot) and the queue change is invisible scheduling. Every runtime claim
  in this report is either a passing test against real modules or an explicitly
  labelled inference.
- No device benchmark, no signed-in warm pass, no production telemetry query —
  all three are listed in §6 with what they would settle.
- The latency numbers in §4.4 are exact for the stated workload and parameter,
  and are deliberately reported as multiples of one render cost. They are not a
  claim about any real device.
- `fake-indexeddb` is an in-memory shim: §4.6's operation counts are exact, its
  wall-clock implications are inferred from the IndexedDB transaction model.
- §4.1, §4.2, §4.3, §4.6, §4.7, §4.9 and §4.10 remain **evidence only** — no
  production code was changed for them, by scope.
