# Sequence landing: a first frame in under a second

Date: 2026-10-23. Author: Fable (design and review); built by an Opus runner tonight on branch `codex/lever-scout-a-1023`. Status: PROPOSED, prototype behind a query flag. Austen decides the look in the morning.

## The problem

`/sequence/[id]` is where every share link, embed, `tka.run` card scan and `/c/CODE` collection link ends. It is the first page a stranger sees. It is also the slowest page in the product.

Real-user LCP from PostHog `$web_vitals`, 60 days to 2026-10-23 (small samples; direction, not measurement):

| Device | Route | n | LCP p50 | LCP p75 |
| --- | --- | --- | --- | --- |
| Mobile | `/sequence/*` | 8 | 12.3 s | 14.3 s |
| Desktop | `/sequence/*` | 26 | 6.2 s | 11.5 s |
| Tablet | `/sequence/*` | 7 | 5.4 s | 7.1 s |
| Mobile | `/create` | 157 | 2.2 s | 3.9 s |
| Mobile | `/` | 23 | 0.6 s | 1.6 s |

Why, from the code:

- `src/routes/sequence/[id]/+page.svelte` renders the viewer only in the browser: `{#if browser}{#await loadSequenceViewerPage()}`. Until the viewer module graph arrives ("~70 chained chunks plus seconds of evaluation", `load-sequence-viewer-page.ts`), the page shows a loading capsule inside a `100dvh` box.
- The server already knows the word, creator, step count, letters and a trusted thumbnail URL for catalog and public records (`+page.server.ts`, `published-meta.ts`), and the word, creator, step count and thumbnail for inline-encoded ids. It renders a crawlable details block from them, but only when `seo.indexable` (curated deck cards), and it places that block *below* the full-viewport loading box, so a person never sees it.
- A card scan lands on `/q/[code]`, whose server load already hydrates the full sequence and prop config, then the client waits for the same viewer module and `goto`s to `/sequence/[id]`. Two navigations per scan; the second one skips the Firestore lookup, so the extra cost is the client route change, not the server.

The honest statement of the defect: for most of a phone visit the page shows a bar, while the server knew the word and had an image of the sequence at request time.

## What a first frame must be

The hard question is honesty. A server-rendered frame that does not match what the viewer then draws shifts the layout or lies about the sequence. So:

**Invariant 1, truthful content.** Everything in the first frame comes from the same record the viewer will load: the word, the creator, the step count, and the sequence's own stored thumbnail (the image Browse cards show for it). Nothing is drawn from guesses. If the server resolved nothing, the frame is the loading capsule as today.

**Invariant 2, same box.** The first frame occupies the box the viewer's stage will occupy: full viewport height, content centred, image capped to the stage width. When the viewer mounts it replaces the frame inside that box. Target: CLS contribution from the swap under 0.05 at 375x667 and 1280x800.

**Invariant 3, no false controls.** The frame may show a Play glyph as part of the image, but nothing in the frame claims to be interactive before the viewer exists. A tap on the frame does nothing and breaks nothing. (The viewer's own controls appear when it mounts.)

**Invariant 4, no new reads.** The frame uses data the server load already fetches. It adds no Firestore read, no new timeout and no change to the `/q` fast path that skips the lookup.

**Invariant 5, SEO block unchanged in meaning.** The crawlable details block for curated decks keeps the same facts (word, deck, creator, steps, letters) and its test (`__tests__/sequence-card-details-block.test.ts`) keeps passing; it may move into the frame rather than sit below the fold.

## Design

### Tier 1 (tonight): the record frame

When `data.meta` carries a word or a trusted thumbnail, the route's pending branch renders a `SequenceFirstFrame` component instead of the bare capsule:

- the thumbnail as an `<img>` with explicit `width`/`height` attributes from a fixed aspect box (so the box reserves space before the image loads), `fetchpriority="high"`, `decoding="async"`, no `loading="lazy"`;
- the word as the heading (`h1`), creator and step count as a quiet line beneath;
- for curated decks, the deck name and the letters line (the existing crawlable facts), so the SEO block's content now lives inside the viewport;
- the loading capsule stays, smaller, under the facts, so progress is still visible;
- the same `.sequence-route-loading` box (`100dvh`, `overflow: hidden`) around it.

The frame renders on the server (it sits outside the `{#if browser}` guard, inside the `{#await}` pending branch, which SvelteKit SSRs). On the client the pending branch shows the same markup until the viewer resolves, then the `{:then}` branch replaces it inside the same box.

Flag: `?frame=1` turns the frame on; without it the page behaves exactly as today. The flag is read on the server from `url.searchParams` and passed in `data`, so the SSR and the client agree. The default flips only after Austen's decision.

### Tier 2 (designed, not built tonight): the first-beat pictograph

For records with no thumbnail, or as the image for all records, render the start position pictograph server-side with `@austencloud/tka-pictograph` (`renderPictographSvg`, `packages/tka-pictograph/src/render.ts`) from the public record's steps and prop types, and inline the SVG. Open questions this needs: an art source that works inside a Cloudflare Worker (`urlArtSource` fetching the prop and arrow SVGs, cached), the viewer's prop and colour preferences (the SSR frame cannot know a signed-in visitor's props; the stored thumbnail has the same limitation and is already accepted on Browse cards), and the Worker CPU budget. Measure the Worker time before enabling.

### Tier 3 (designed, not built tonight): one navigation for a scan

`/q/[code]` already has the hydrated sequence server-side. Render the viewer at `/q` and rewrite the URL to `/sequence/[id]` with `history.replaceState` after mount, instead of `goto`. Scan attribution marks (`markScan`, `scan-perf.ts`) and the `readScanSequenceCode` fast path keep their meaning; the `/sequence` route must still remount on id change (`{#key routeId}`). This removes one client route change per scan; the measured diagnosis tonight says how much that is worth.

## Proof

Diagnosis (production, read-only, agent-owned headless Chrome):

1. `https://tkaflowarts.com/sequence/A3G5` at 375x667, 4x CPU throttle, cold cache: a table of time to first HTML, time to viewer chunk complete, time to sequence data, LCP and its element, number of chunks before LCP. Three runs, report the median.
2. `https://tkaflowarts.com/q/A3G5` (if the code resolves at `/q`; otherwise any `tka.run` code reachable from a public deck page) the same way, plus time of the `goto` to `/sequence`.
3. Desktop 1280x800 without throttle for item 1, one run.

Prototype (local dev server from this worktree, port 5300 to 5399, never 5173):

4. `/sequence/A3G5` and `/sequence/A3G5?frame=1` at 375x667, 4x CPU: LCP, LCP element, CLS, and a screenshot of each at 1 s and at viewer-ready. Target: with the flag, LCP element is the thumbnail or the heading and LCP under 2.5 s on the dev server at 4x; CLS under 0.05. Without the flag, numbers as today.
5. A public (non-curated) id with a thumbnail and an inline-encoded id, both with `?frame=1`: the frame renders; nothing else changes.
6. Tests: `src/routes/sequence/[id]/__tests__/sequence-card-details-block.test.ts` and `page-server-load.test.ts` pass; one new test proves the pending branch renders the word and image for a public record with the flag and renders the bare capsule without it.

Deliverable for the morning: two preview URLs side by side, old and new, plus the diagnosis table.

## Decisions for Austen (recommended first; the recommended option is tonight's working assumption)

1. **First frame content.** (a) The record frame: word, creator, steps, the sequence's stored thumbnail, capsule below [working assumption]. (b) Thumbnail only, no text. (c) Keep the bar.
2. **Image source when a thumbnail exists.** (a) The stored thumbnail, same image as Browse [working assumption]. (b) A server-rendered first-beat pictograph for everyone (Tier 2). (c) Both: pictograph when no thumbnail.
3. **Default.** (a) Turn the frame on by default after his look, drop the flag. (b) Keep the flag for a week and compare vitals. (c) Not yet.
4. **Scan handoff (Tier 3).** (a) One navigation, URL rewritten after mount. (b) Keep the redirect.
5. **Web vitals report (overnight decision 23).** (a) Split 2D and 3D viewer loads and set `web_vitals_attribution`, so the morning after shipping shows which element won. (b) Wait.

## Risk

Files: `src/routes/sequence/[id]/+page.svelte`, a new `SequenceFirstFrame.svelte` beside it, `+page.server.ts` (flag only), `sequence-seo.ts` untouched, `__tests__/*`. Nothing in `src/lib/private/`. No in-flight branch touches the sequence route tonight. The Scan Health Check workflow covers the `tka.run` chain and must stay green. SEO: the crawlable facts move into the frame; the test guarding them is the proof they survive.
