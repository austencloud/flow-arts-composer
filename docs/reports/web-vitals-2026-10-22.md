# Real-user web vitals, 2026-10-22

Source: PostHog `$web_vitals` events, 2026-09-23 to 2026-10-22, read with
`npx tsx scripts/triage-web-vitals.ts` (read-only). 433 events in the window;
277 remain after the shared admin/dev/agent filter (`pulseProdFilter`). The
crawler rule (`isLikelyCrawlerSession`) matched no session that sent vitals.

Percentiles are nearest-rank over page loads. LCP is grouped by the hard
navigation URL, INP and CLS by the URL where they were reported. Samples are
small: only six route/device groups reach 10 samples, so treat every number
below as a direction, not a measurement.

## Ranked (at least 10 samples; mobile first, then p75 LCP)

| Device  | Route            | LCP ms p50 / p75 / p95 (n)   | INP ms p50 / p75 / p95 (n) | CLS p75 (n) |
| ------- | ---------------- | ---------------------------- | -------------------------- | ----------- |
| Mobile  | /create          | 2249 / **5208** / 7395 (35)  | 56 / 80 / 232 (12)         | 0.000 (1)   |
| Mobile  | /                | 756 / 1986 / 3848 (14)       | -                          | 0.008 (1)   |
| Mobile  | /create/generate | 1397 / 1956 / 4024 (12)      | 288 / 1112 / 1112 (3)      | 0.001 (4)   |
| Desktop | /sequence/[id]   | 2832 / **6136** / 19876 (14) | 160 / 320 / 824 (6)        | 0.022 (6)   |
| Desktop | /create          | 2620 / **4312** / 10620 (22) | 112 / 184 / 184 (3)        | 0.189 (5)   |
| Desktop | /                | 839 / 944 / 1860 (16)        | 80 / 176 / 296 (5)         | 0.001 (10)  |

Below the threshold but worth watching: Desktop `/browse/explore/[...]` INP p75
3384 ms (n=3) and CLS 0.505 (n=3); Mobile `/create/construct` CLS 0.477 (n=3).

**No LCP element or INP target is recorded.** The events carry `entries` as
empty objects and no `attribution`, because the client does not set
`capture_performance.web_vitals_attribution` (posthog-js reads that option in
`lib/src/extensions/web-vitals/index.js` and then loads the attribution build).
The elements below come from local lab runs and the code, not from users.

## Worst three

### 1. Mobile /create: p75 LCP 5.2 s (35 loads)

Element (lab): the server-rendered boot capsule label (`span.boot-capsule-label`,
"Opening Flow Arts Composer") paints first; the next and final LCP candidate
is the front door heading `h1` "How do you want to create?" rendered by
`src/lib/features/create/shared/components/CreateFrontDoor.svelte`.

Hypothesis (inferred, not observed on users' phones): the boot capsule is
small (about 3,600 px²), so as soon as the front door heading paints it
becomes the LCP. That heading needs the whole client app to boot: the
production `/create` HTML (fetched 2026-10-22) lists 52 `modulepreload`
chunks, 18 of them ahead of the root layout node, and `CreateModule.svelte` mounts the front door only after
its async initialisation. On a mid-range phone on a cold cache, p75 LCP is
therefore "time until the app has booted and the front door has rendered",
not a slow image. A local dev-server run at 375x667 with 4x CPU put the
heading at 26.9 s, but the dev server serves unbundled modules, so that
number says nothing about production.

### 2. Desktop /sequence/[id]: p75 LCP 6.1 s (14 loads)

Element (inferred): whatever the client-only viewer paints first. The route
SSRs only the head (and the details card for curated, indexable decks);
`src/routes/sequence/[id]/+page.svelte` imports `SequenceViewerPage.svelte`
dynamically inside `{#if browser}`.

Hypothesis (inferred): the slowest samples (19.9 s, 4.5 s, 4.2 s) all carry
`render=3d`, so they wait for the 3D viewer and its assets. 3D scenes are out
of scope for tonight's fix. The 2D case still pays for the dynamic import of
the viewer chunk before anything larger than the loading bar paints.

### 3. Desktop /create: p75 LCP 4.3 s (22 loads), CLS p75 0.189 (5 loads)

Element: same as item 1 (`CreateFrontDoor.svelte` heading).

Hypothesis (inferred): the LCP cause is the same app-boot path as on
mobile. The CLS has a different source: the five samples are too few to name
the shifting element, and attribution is off. One confirmed contributor,
fixed tonight, was the shared `IndeterminateBar` (below); its shifts are
small (about 0.0003 each) and cannot explain 0.19 alone. The rest probably
comes from the workspace replacing the loading branch in `CreateModule.svelte`.

## Fix made tonight

`src/lib/shared/components/loading/IndeterminateBar.svelte` animated its
sliding fill with `left`. Chrome recorded every frame of that animation as a
layout shift, and the animation re-ran layout on the main thread while the
app booted. It now slides with `transform: translateX()`, on the same path:
the fill measured -149 px to 373 px on a 375 px track, the same as the old
`left: -40%` to `100%`. Reduced motion still shows the static full-width bar.

Lab check, `/create` on a task dev server, 375x667 mobile emulation, 4x CPU:

| Run    | Layout-shift entries    | CLS sum         | Shift source                       |
| ------ | ----------------------- | --------------- | ---------------------------------- |
| Before | 53 in 13 s (96 in 27 s) | 0.0142 (0.0238) | `.fill` of `IndeterminateBar` only |
| After  | 0 in 19 s               | 0               | none                               |

This is a small CLS gain and less main-thread layout during boot. It does not
move LCP, which needs one of the decisions in the run report.
