# Startup performance — Opus batch report

Cloud session, 2026-09-13. Scope: measurable cold startup cost on home, Create
and Browse, limited to app bootstrap / navigation import boundaries and narrow
lazy-loading changes. Nothing in auth, library, export, fire, generation
algorithms or the thumbnail engine was touched.

|                       |                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------- |
| Base SHA              | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`)                          |
| Branch                | `claude/startup-performance-1h87b8`                                                 |
| Implementation commit | `1d7410f9` — the whole code change; this report and the evidence are the branch tip |

Full evidence, methodology and limitations:
[`docs/performance/2026-09-13-startup-boot-graph.md`](../../performance/2026-09-13-startup-boot-graph.md).

## What was wrong

Two static import edges from the root layout put **3,491,339 raw bytes /
989,565 gzip** of packages unrelated to any of the three destinations into the
boot graph of every route — 90% of what those routes had to fetch, parse and
evaluate before they could hydrate.

1. **The whole shared `vendor` chunk** (3,280,762 raw / 917,779 gzip: zod,
   bits-ui, date-fns, every background renderer, mediabunny,
   `h264-mp4-encoder`, gifenc, `page-flip`, `qr-code-styling`, the Google Maps
   loader, `@capacitor/push-notifications`, …) reached the root layout through
   **one binding**: `getBackgroundController`, imported by the ~300-byte
   `background-hold.svelte.ts`. That module falls under Rollup's
   `experimentalMinChunkSize: 20_000` floor, so the bundler merged it into the
   root layout's own chunk. Rollup weighs the merged chunk's own bytes, not the
   transitive chunks the merge newly reaches.

   This also silently disabled two existing guards: `MarketingChrome` uses a
   type-only `BackgroundType` import and defers `BackgroundHost` behind two
   animation frames, and skips the canvas entirely on a constrained connection.
   Both were dead, because the package was already in the preload set.

2. **The fflate/web-vitals chunk** (210,577 raw / 71,786 gzip), because
   `url-parameter-policy` — called from the root layout's `afterNavigate` —
   read five string constants from `viewer-url-state-codec`, whose `s`-blob
   compression reaches `fflate`.

## What changed

Both fixes are import-boundary changes. No dynamic import was added to the
hydration path, no side effect moved, SSR is unchanged, and no product contract
changed.

- `BackgroundHost.svelte` — the only owner of the controller singleton — now
  publishes it to `background-hold.svelte.ts` via
  `registerBackgroundFreezeTarget`, instead of the hold module importing
  `@austencloud/backgrounds`. A hold taken before the host mounts is remembered
  and applied at registration, which reproduces the package's own behaviour
  (`setBackground()` defers and `startAnimation()` no-ops while `frozen`).
- `VIEWER_STATE_PARAM_NAMES` moves to a dependency-free
  `viewer-url-state-params.ts`; the codec re-exports it, so no caller changed.

## Results

Static boot closure (deterministic, from the client manifest; `raw` is parsed
and evaluated JS, `gzip` is transfer — different costs, not additive):

| Route group                | before raw | after raw | before gzip | after gzip |
| -------------------------- | ---------: | --------: | ----------: | ---------: |
| `/` (home)                 |  4,493,335 |   831,891 |   1,298,087 |    254,848 |
| `/create`, `/browse` shell |  4,384,210 |   653,823 |   1,260,291 |    201,000 |

−81.5% raw / −80.4% gzip on home; −85.1% / −84.0% on the app shell. The largest
chunk left in either boot closure is 210,577 raw; before, one chunk was 3.28 MB.

Runtime, production build behind a gzip proxy, DevTools Slow 4G + 4× CPU,
five repeats per cell, medians (`hydrated` = the `tka:hydrated` mark, the root
layout's `onMount`):

| Route     | hydrated before | hydrated after |    Δ |
| --------- | --------------: | -------------: | ---: |
| `/`       |        9,180 ms |       3,754 ms | −59% |
| `/create` |        9,194 ms |       3,689 ms | −60% |
| `/browse` |        9,197 ms |       3,696 ms | −60% |

All fifteen baseline runs fell in 9,118–9,271 ms; all fifteen changed runs in
3,669–3,783 ms. On unthrottled loopback the change is worth single-digit
percentages against comparable noise, as expected: there the 3.28 MB arrives in
milliseconds and only parse cost remains.

Transfer vs parse: the gzip column is what the wire carries, the raw column is
what the main thread must parse and evaluate. Session-total bytes are largely
unchanged — `vendor` still loads on every route, later and off the hydration
path. The exception is a constrained connection, where the previously-dead
guards now genuinely prevent the download.

## Owned files

| File                                                                     | Change                                        |
| ------------------------------------------------------------------------ | --------------------------------------------- |
| `src/lib/shared/background/shared/state/background-hold.svelte.ts`       | registration seam replaces the package import |
| `src/lib/shared/background/shared/components/BackgroundHost.svelte`      | publishes the controller (2 lines + comment)  |
| `src/lib/shared/sequence-viewer/services/viewer-url-state-params.ts`     | new, dependency-free param names              |
| `src/lib/shared/sequence-viewer/services/viewer-url-state-codec.ts`      | imports + re-exports the names                |
| `src/lib/shared/navigation/services/url-parameter-policy.ts`             | reads the names from the params module        |
| `tests/unit/boot-import-boundary.test.ts`                                | new boundary guard (11 assertions)            |
| `tests/unit/background-hold.test.ts`                                     | registry seam + two new ordering cases        |
| `docs/performance/2026-09-13-startup-boot-graph.md`                      | evidence document                             |
| `docs/performance/2026-09-13-startup-evidence.json`                      | both runs, every repeat                       |
| `docs/performance/2026-09-13-boot-closure.mjs`                           | manifest closure probe                        |
| `docs/performance/2026-09-13-boot-graph-probe.mjs`                       | runtime probe                                 |
| `docs/performance/2026-09-13-gzip-preview-proxy.mjs`                     | transfer-honest preview proxy                 |
| `docs/superpowers/specs/backlog/2026-09-13-vendor-chunk-split-design.md` | follow-up spec                                |
| `docs/reports/opus-batch-2026-09-12/startup-performance.md`              | this report                                   |

## Commands and results

| Command                                                                                                                                    | Result                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                                                            | **0 errors, 0 warnings**                                                                                                                                                                                                                                                                                                                       |
| `npm run build:fast` (baseline and changed)                                                                                                | client + server bundles and adapter output complete both times; both exited non-zero on a post-adapter prerender step with `ECONNRESET` from the container's blocked Firestore egress, identically, and `scripts/inline-landing-critical-css.cjs` was re-run by hand for both. Earlier runs of the same command on the same checkout exited 0. |
| `vitest run` — 5 files, 33 tests (`boot-import-boundary`, `background-hold`, both `url-parameter-policy` suites, `viewer-url-state-codec`) | all pass                                                                                                                                                                                                                                                                                                                                       |
| Same boundary test against the pre-change tree                                                                                             | **2 assertions fail** — `fflate` reachable from the root layout, `background-hold` importing `@austencloud/backgrounds`                                                                                                                                                                                                                        |
| Live freeze path, production build, `/create`                                                                                              | canvas animates (1,780 / 4,096 sampled pixels change per second), page-hidden hold stops it (**0**), show resumes it (1,785)                                                                                                                                                                                                                   |

The boundary test's "`@austencloud/backgrounds` not reachable from the root
layout" assertion passes on both trees. That is the point, and it is stated in
the test: the edge never existed in source, only in the merged chunk, so the
`background-hold` assertion is what actually guards it.

## Unresolved limitations

- **Create and Browse were not measured to task-ready.** Firestore is blocked
  by this container's egress proxy, so module activation stalls behind auth
  (`module-chunk:create:start` at ~6.6–7.5 s in both builds). Time to first
  usable Construct option — the metric the 2026-09-08 passes used — was not
  reproduced. Shell hydration, FCP and the boot graph were measured directly.
- Five repeats on one shared cloud container. No p50/p95 or field claim.
  Slow 4G is a DevTools emulation, not a phone on a real radio.
- Transfer figures are gzip; Cloudflare serves Brotli, which will be smaller.
  The deployed transfer size was not measured.
- The homepage's marketing canvas does not mount in this container on either
  build (`tka:background:first-frame` absent from `/` before and after), so
  that path is verified only by the app shell's own BackgroundHost, where it
  does mount. Pre-existing environment behaviour, not a regression.
- `vendor` is still one 3.3 MB chunk. Splitting it is a build-config change
  with real chunk-cycle risk (the 2026-06-16 TDZ outage), specified rather than
  attempted: `docs/superpowers/specs/backlog/2026-09-13-vendor-chunk-split-design.md`.
  Making `MainApplication`'s own `BackgroundHost` import lazy would save nothing
  until that split lands — its 644-module static graph already reaches zod,
  bits-ui, fabric, dexie and `qr-code-styling`.
- Nothing was deployed, no production data was touched, no `main` push, no
  package publication. The upstream `@austencloud/scene-3d` tree-shaking
  backlog item was read as context only; publishing was not authorized and was
  not attempted.
