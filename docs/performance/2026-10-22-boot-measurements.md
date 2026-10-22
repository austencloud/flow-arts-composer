# Boot measurements: /create/generate and /browse/you

October 22, 2026. Austen reported waiting "an insane amount of time" on the
startup screen of `/create/generate` (2026-09-11) and "way too long" on
`/browse/you` (2026-09-24), both on his phone against production. This ledger
records where that time goes on current `main` (`ac74d2c241`, published as
GitHub main `88b04de7c5`) and what the chunk-grouping fix on
`claude/boot-performance-pass-2cb619` (`2651c1c699`) changed.

## Summary

- Since the Vite 8 / Rolldown migration on 2026-10-10 (`a97b743f05`), the
  root layout's static graph has been about 4.4 MB of JavaScript on every
  page, more than three times the 1.32 MB measured after the
  [2026-10-07 vendor split](2026-10-07-vendor-chunk-split.md). Three.js,
  the backgrounds package, scene-3d, the video editor and mediabunny were all
  on that path. `verify:boot-chunks` passed anyway because it checks chunks by
  name and the code had moved into chunks with other names.
- Cause: the build hands every chunk name to one Rolldown group, and a group
  pulls in its modules' dependencies. A dependency went to whichever name
  reached it first. The small `scene-stage-coordinate-frame` boundary took
  Three, the backgrounds, scene-3d and Vite's preload helper (1.44 MB). Every
  module with a dynamic import loads that helper, so every page loaded Three.
  `vendor` took the Svelte runtime and the video editor (2.2 MB).
- Fix: one group per chunk name, ranked so leaves capture first. The app
  shell's static graph went from 4.59 MB to 2.05 MB raw (1.26 MB to 577 KB
  gzip). Two more boundaries keep Three and the video editor out of the main
  application's own graph.
- On a throttled phone profile over HTTP/2, hydration now starts 4 s earlier
  on both routes and the app reports `ready` 2.2 to 2.7 s earlier. Both routes
  still need about 22 s to become ready on that profile. The startup screen
  still leaves through its 15 s safety net before the app is ready, so the
  complaint is reduced, not solved. The next lever is the main application's
  own static graph (5.1 MB raw, 1.55 MB gzip), described under "Next".

## Field data (PostHog, last 14 days, host tkaflowarts.com)

PostHog's `$web_vitals` events carry LCP, INP and CLS. FCP is not captured in
this project's configuration. Sample sizes are small and include the team's
own visits. In an app shell that shows a startup screen, LCP usually measures
the startup screen, not the moment the page is usable.

| Route              | Device  | LCP n | LCP p50 | LCP p75 | INP n | INP p50 | INP p75 | CLS p50 | CLS p75 |
| ------------------ | ------- | ----: | ------: | ------: | ----: | ------: | ------: | ------: | ------: |
| /create/generate   | Mobile  |     8 |   1,441 |   2,473 |     5 |     560 |   1,112 |       - |       - |
| /create/generate   | Desktop |     3 |   3,528 |   3,992 |     5 |     160 |     168 |   0.159 |   0.268 |
| /create            | Mobile  |    18 |   3,344 |   6,509 |    10 |      64 |      86 |   0.000 |   0.000 |
| /create            | Desktop |     8 |   3,036 |   3,714 |     1 |      96 |      96 |   0.189 |   0.291 |
| /browse/you/\*     | Desktop |     2 |   2,106 |   2,189 |     9 |     432 |     440 |   0.348 |   0.589 |
| /browse/explore/\* | Mobile  |     7 |   1,916 |   3,642 |    11 |     232 |     408 |   0.007 |   0.104 |
| /                  | Desktop |     7 |     852 |     934 |     3 |      80 |     128 |   0.000 |   0.000 |

Times are milliseconds. Unfiltered queries also returned runs from agents'
local servers (`localhost:4177`, `127.0.0.1:5192`) with LCP up to 62 s; those
are excluded here. The project captures no custom boot timing event, so the
startup screen's duration is not in field data.

### Gallery thumbnails

`thumbnail_session_summary` on production, `/browse/explore/sequences`, mobile:

| Session (UTC)    | Requests | Timeouts over 15 s | Time to URL p95 | Queue wait p95 |
| ---------------- | -------: | -----------------: | --------------: | -------------: |
| 2026-10-21 19:06 |      279 |                  4 |        4,965 ms |      40,551 ms |
| 2026-10-22 05:01 |    1,021 |                  0 |        1,495 ms |         460 ms |
| 2026-10-22 05:04 |       13 |                  0 |          789 ms |           0 ms |

Four "Thumbnail render exceeded 15000ms" exceptions were captured on
2026-10-21, none on production since. The gallery prefetch fix (`4af26e0235`,
`50076894a1`, `d82e9584cb`) reached production with the 09:52 UTC publish.
Both 2026-10-22 sessions came before that publish, so there is no field
evidence yet about the fix. Queue wait, not rendering, was the longest stage in
every slow session.

## Build measurements

Production builds made in this worktree with `npm run build` (`ANALYZE=true`,
`DIAG_CHUNKS=1`). Static graphs use the
[boot closure report](2026-09-13-boot-closure.mjs), with SvelteKit 3's
generated directory (`.svelte-kit/generated/build/client-optimized`). Gzip is
a level-9 estimate per file.

| Static graph                     | Baseline raw | Fixed raw | Baseline gzip | Fixed gzip |
| -------------------------------- | -----------: | --------: | ------------: | ---------: |
| Root layout only                 |    4,415,020 | 1,872,762 |     1,223,658 |    537,706 |
| App shell (`/create`, `/browse`) |    4,588,322 | 2,045,066 |     1,262,713 |    576,955 |
| Home `/`                         |    4,760,672 | 2,217,468 |     1,315,887 |    630,108 |
| `MainApplication` (lazy)         |    7,164,995 | 5,146,737 |     2,091,760 |  1,554,966 |

Chunks that moved, raw bytes:

| Chunk                          |  Baseline |     Fixed | Notes                                             |
| ------------------------------ | --------: | --------: | ------------------------------------------------- |
| `vendor`                       | 2,198,526 | 1,015,696 | held the Svelte runtime and the video editor      |
| `scene-stage-coordinate-frame` | 1,443,436 |       701 | held Three, backgrounds, scene-3d, preload helper |
| `vendor-three`                 |   562,971 | 1,574,768 | now holds Three                                   |
| `vendor-backgrounds`           |    11,441 |   437,214 | now holds the backgrounds                         |
| `vendor-svelte`                |    23,146 |    97,380 | now holds the Svelte runtime                      |
| `vendor-sveltekit`             |   (empty) |     1,604 | now holds the preload helper                      |
| `vendor-video-editor`          |         - |   403,314 | editor UI, renderer and encoder                   |
| `vendor-video-core`            |         - |    96,338 | the editor's project model                        |
| `scene-prop-hand-palette`      |         - |     1,295 | the hand colors MainApplication sets              |

`verify:boot-chunks` passed the baseline. With the new size checks it rejects
the baseline three ways: a 4,784,871-byte startup graph, an 11 KB
`vendor-backgrounds`, and no video-editor chunk. The fixed build passes with
2,241,736 bytes, and `verify:public-firebase` passes all 55 public pages for
both builds. Chunk-cycle diagnostics report zero cycles in both.

## Browser measurements

Method: the [boot-screen probe](2026-10-22-boot-screen-probe.mjs) in fresh
Chromium contexts at 412 x 915 with mobile emulation, DevTools Slow 4G
(1.6 Mbit/s down, 750 Kbit/s up, 150 ms latency) and a 4x CPU slowdown. Each
build was served by `wrangler pages dev` behind the
[HTTP/2 + gzip front end](2026-10-22-h2-gzip-proxy.mjs). PostHog, Sentry and
anonymous sign-up were blocked. Firebase was reachable, so the visitor is a
guest on the real boot path. Medians of three runs; milliseconds from
navigation start.

Milestones come from the startup screen's own record (`window.__tkaBootBar`):
`hydrated` is when the root layout mounts, `ready` is when the app's services
report ready. "Screen gone" is when `#app-loading` left the DOM. "Content" is
the first frame after that with no loading indicator in `main`.

| Route                 | Build      |   FCP | Hydrated |  Ready | Screen gone | Content |
| --------------------- | ---------- | ----: | -------: | -----: | ----------: | ------: |
| /create/generate      | Production | 3,624 |   15,472 | 28,070 |      19,049 |  28,636 |
| /create/generate      | Baseline   | 2,400 |   11,717 | 24,468 |      17,822 |  24,683 |
| /create/generate      | Fixed      | 1,616 |    7,459 | 21,754 |      17,295 |  22,038 |
| /browse/you/sequences | Production | 2,760 |   14,791 | 29,609 |      18,176 |  30,856 |
| /browse/you/sequences | Baseline   | 2,332 |   11,671 | 25,560 |      17,754 |  26,464 |
| /browse/you/sequences | Fixed      | 1,664 |    7,688 | 23,407 |      17,089 |  24,283 |

Production rows are the live site measured the same way. They are slower than
the local baseline because real network round trips add to the emulated
latency. The baseline and fixed rows are the same build setup and differ only
in `vite.config.ts`. The first fixed `/create/generate` set was discarded and
rerun: one run never painted within 45 s and one painted at 10 s, while the
Browse runs that followed on the same server were normal. The rerun's three
values are in the table.

JavaScript started before `ready` on `/create/generate` fell from 3,199,012 to
2,562,343 encoded bytes. Three (428 KB gzip) and the media export chunk
(405 KB gzip) no longer download before `ready`. The 3D Studio still loads
Three on `/stage`, and Create, Browse, `/stage`, `/post` and `/` rendered with
no page errors on the fixed build.

### Where the remaining time goes

The trace of a fixed `/create/generate` boot on the same profile:

- 0 to 5 s: the root graph (scripts at 4.9 s, shell at 5.9 s).
- 5 to 7.5 s: hydration.
- 7.5 to 16.5 s: `MainApplication` and the DI container load. About 290
  chunks, 5.1 MB raw. Firebase (209 KB gzip), backgrounds (122 KB), fabric
  (86 KB) and PostHog (70 KB) are in that static graph.
- About 17 s: the startup screen's 15 s safety net (timed from its own
  script) dismisses it, and the shell's loading state shows until `ready`.
- 16.5 to 22 s: workspace restore, settings, and Create's `module-view` hold.

On an HTTP/1.1 server with six connections, the same build spends most of the
7 to 25 s window waiting for connections: about 560 JavaScript files load
before `ready`. Production serves HTTP/2, so this ledger's comparison uses
HTTP/2. Through the HTTP/1.1 gzip proxy the fixed build moved `scripts` from
8.9 to 5.0 s, but `ready` did not change.

## What was not measured

- Lighthouse. Free memory stayed near the 4 GB floor while sibling sessions
  built, so the probe above replaced it. It records the same first-paint and
  long-task data.
- A signed-in boot. Austen's own account loads his library and settings; the
  probe is a guest.
- The native app and a real phone. The throttled profile approximates a
  mid-range phone on a slow network, not his device.
- Field data after the fix. It has not shipped.

## Next

1. The main application's static graph: `app-state.svelte.ts`,
   `settings-state.svelte.ts` and `MainApplication` import the backgrounds
   package for its `BackgroundType` enum, which loads the whole renderer.
   `pictograph-preparer` imports fabric. Both run before `ready`.
2. `SequenceViewerShell` and `sequence-modal-exporter` statically import the
   video editor, which Create downloads (127 KB gzip) before `ready`.
3. The startup screen's 15 s safety net fires before `ready` on this profile,
   so users see a second loading state. Reaching `ready` sooner is the fix;
   lengthening the safety net is not.

## Probe side effect

Before anonymous sign-up was blocked, about 15 Browse runs (local builds and
production share the production Firebase project) each created one anonymous
Firebase account through `ensureGuestIdentity("gallery_mount")`, as any first
visit does. The probe now blocks that request.

## Reproduce

```bash
npm run build
npm run verify:boot-chunks
npx wrangler pages dev .svelte-kit/cloudflare --port 4186 --ip 127.0.0.1
KEY=key.pem CERT=cert.pem UPSTREAM=http://127.0.0.1:4186 PORT=4188 node docs/performance/2026-10-22-h2-gzip-proxy.mjs
BASE=https://127.0.0.1:4188 REPEATS=3 WINDOW_MS=45000 node docs/performance/2026-10-22-boot-screen-probe.mjs fixed out.json
```

To compare against another build, copy its `.svelte-kit/cloudflare`,
`.svelte-kit/cloudflare-tmp` and `.svelte-kit/output/server` into a folder
under `.svelte-kit/` (so server externals resolve from `node_modules`) and
serve that folder's `cloudflare` directory.
