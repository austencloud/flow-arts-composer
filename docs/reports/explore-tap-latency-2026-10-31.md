# Explore tap latency (2026-10-31)

Why a tap on an Explore card can leave the screen unchanged for seconds, and
what to fix. Evidence: PostHog `$dead_click` on
`div.prop-thumbnail[data-variant="gallery"]` (Firefox 157, Windows, 2026-10-28;
three more on 2026-10-25) and INP 816 ms on `/browse/explore/sequences`.

## Finding

The first open of a session behaves as designed: the drawer slides at once and
the viewer mounts behind it. Every later open does not. `LazyMount` in
`SequenceViewerDrawerHost.svelte` keeps the loaded viewer component mounted
(its `keepAlive` defaults to true), so once the viewer chunk has loaded, the
`active` gate (`viewerMountAllowed`, which waits for the slide to start) no
longer controls anything. When the tap sets `overlay.sequence`, the kept
`SequenceViewerDrawerContent` sees a non-null `sequence` and a new
`sessionKey`, and its `{#if sequence}{#key sessionKey}` block builds the whole
viewer (orchestrator, shell, panels, live card, effect thumbnails) in the same
Svelte flush as the open. That flush is a microtask of the click, so the
drawer cannot paint until the whole viewer is built.

## Measured

Dev server from this worktree, headless Chrome through `puppeteer-core`,
1366x860, CPU throttled 6x, Explore grid ("Show all"). Times are from the
click's Event Timing `startTime`; the `viewer-open:*` User Timing measures come
from the new telemetry. Dev builds of Svelte are several times slower than
production, so read the numbers relatively.

| Open                               | Click handler | Tap to drawer | Tap to viewer |
| ---------------------------------- | ------------- | ------------- | ------------- |
| First open, 900 ms hover           | 177 ms        | 218 ms        | 2.1 s         |
| First open, 60 ms hover (2nd run)  | 47 ms         | 83 ms         | 1.3 s         |
| Later open, 60 ms hover            | 9.1 s         | 9.6 s         | 14.9 s        |
| Later open, 220 ms hover           | 5.3 s         | 5.8 s         | 10.8 s        |
| Later open, 900 ms hover           | 4.9 s         | 5.3 s         | 10.3 s        |
| Later open, 900 ms hover (2nd run) | 5.4 s         | 5.9 s         | 7.5 s         |
| Later open, 60 ms hover (2nd run)  | 148 ms        | 196 ms        | 4.7 s         |

Four of five later opens reproduced the block. The hover length does not
matter, so the hover preview is not the cause. The one later open that did not
block (last row) is unexplained; that run did not check that the previous
viewer had fully closed before the tap.

Long Animation Frame entries name the click listener
(`handle_event_propagation`) as 4.9 to 9.1 s of a single 6.3 to 11.2 s frame,
followed by a 0.5 to 1.6 s `ResizeObserver` callback and a 0.35 s
`pane-keep-alive.svelte.ts` frame callback in the same frame.

Top self time inside the click task (later open, 220 ms hover, 5.33 s task):

1. 573 ms: Svelte `bind:clientWidth/clientHeight` first read
   (`bind_element_size`), a forced layout per bound element as the viewer
   mounts.
2. 440 ms: `getBoundingClientRect`, most of it from
   `src/lib/shared/sequence-viewer/components/reparent-to-inspector.ts`
   (`update`, about 315 ms).
3. 325 ms: `drawImage`, from the effects panel thumbnails
   (`src/lib/shared/animation-engine/components/effects-panel/thumbnails/TrailThumbnail.svelte`,
   also `PortraitTile.svelte` `paintInto` in the 60 ms run).
4. 472 ms: Svelte reactive bookkeeping (`schedule_possible_effect_self_invalidation`,
   `mark_reactions`) across the newly built viewer graph.
5. 176 ms: `updateContainedDimensions` in
   `src/lib/shared/choreo-card/state/choreo-card-sizing-state.svelte.ts`.

By component, inclusive: `LiveCardPictograph.svelte` / `PictographRenderer.svelte`
about 0.5 to 0.6 s, `SequenceViewerOrchestrator.svelte` /
`SequenceViewerShell.svelte` 0.45 to 1.75 s.

## Static order of work, click to drawer frame

1. `ChoreoCardThumbnail.svelte:170` `handlePrimaryAction`: guards only (long
   press, selection, modifier keys), then `onPrimaryAction`. `pointerdown`
   returns at once for a mouse. No view-transition claim, morph or hover
   teardown runs on click; the name claim is a mount effect (~line 707), and a
   hover preview keeps playing.
2. `BrowseGrid.svelte:261` → `BrowseModule.svelte:741` →
   `browse-event-handler.ts:90` `handleViewDetail`: reads filters for the
   initial viewer mode, then `openSequenceViewer`.
3. `sequence-viewer-navigator.ts`: `getCached` is a `Map` lookup that returns a
   hover-prefetched, hydrated copy when the card was hovered for 150 ms
   (`ChoreoCardThumbnail.svelte:463`). No decode here.
4. `cellPreWarmer.preWarmSequence(seq, "user-blocking")`
   (`cell-pre-warmer.ts:47`): returns at once for an unhydrated gallery card
   (no steps). For a hydrated 16-beat sequence it synchronously builds 17 cell
   tasks (one JSON cache key each), then starts all 17 in parallel; each
   awaits an IndexedDB `has()` before any work, and misses go through
   `pictographPreparer.prepareSingle` on the main thread and render in the
   worker pool. "user-blocking" only means parallel instead of sequential; it
   renders nothing synchronously in the tap. It did not appear in the top self
   time of any run.
5. `openSequenceOverlay` (`sequence-viewer-overlay-state.svelte.ts:64`): sets
   about 20 `$state` fields, starts a lazy import for the Overture snapshot,
   pushes a shallow `goto` (SvelteKit `pushState`, `scroll_state` about 26 to
   110 ms in the profiles), and starts `mintAndSyncShortCode` without awaiting
   it (polls auth every 50 ms, returns for guests; for signed-in users it
   writes a short code to Firestore later). Nothing here blocks on Firestore,
   IndexedDB or the renderer.
6. Svelte flush (microtask of the click): the host's open effect sets
   `drawerOpen` and starts timing. On a first open `LazyMount` stays inactive
   until the slide starts and then imports `SequenceViewerDrawerContent.svelte`
   (the viewer chunk; Explore does not prefetch it, only Create's View button
   calls `prefetchSequenceViewerWhenIdle`). On later opens the kept
   `SequenceViewerDrawerContent` builds the full viewer here, which is the
   measured block.

## Recommended fix

Give the host's viewer `LazyMount` `keepAlive={false}`. After a close
`overlay.sequence` is null and the content already renders nothing, so the
only change is that the empty wrapper is destroyed too; the next open then
waits for `viewerMountAllowed` like the first open does. The module stays
cached, so the remount costs no download. The Create prewarm path keeps
working because `active` already includes `viewerDormant` and `adopted`.

Risk: low to medium. It touches the open/close choreography that recent fixes
tuned (dormant prewarm, wake at slide start). Check with
`SequenceViewerDrawerHost.svelte.test.ts`, a Create View open (prewarmed), and
two consecutive Explore opens, reading `viewer_open_timing`. A larger,
separate gain would be making the viewer's own first build cheaper (the size
bindings, the inspector reparenting reads and the effect thumbnails drawn
before they are visible), since that cost still lands between drawer and
reveal.

## Telemetry added

`viewer_open_timing` with `drawer_visible_ms`, `viewer_revealed_ms` (null when
the viewer closed first), `viewer_source`, `sequence_id`, and the route id in
`page` (the property every viewer event uses for the route). Opens that do not
come through `openSequenceViewer` (QR, restored URLs) are not timed. The same
spans appear as `viewer-open:drawer-visible` and `viewer-open:viewer-revealed`
User Timing measures. The start is `performance.now()` in the navigator, so the
event leaves out input delay before the click handler runs (16 to 33 ms in
these runs).

## Fix applied

The host's viewer `LazyMount` now has `keepAlive={false}`; nothing else
changed. Same setup as above, one page: a first open, then two later opens,
each after checking that the drawer had closed and `?v=` had left the URL.

| Open                     | Click handler (before → after) | Tap to drawer (before → after) | Tap to viewer (before → after) |
| ------------------------ | ------------------------------ | ------------------------------ | ------------------------------ |
| First open, 900 ms hover | 177 ms → 187 ms                | 218 ms → 223 ms                | 2.1 s → 2.9 s                  |
| Later open, 60 ms hover  | 9.1 s → 117 ms                 | 9.6 s → 171 ms                 | 14.9 s → 12.8 s                |
| Later open, 900 ms hover | 4.9 s → 94 ms                  | 5.3 s → 135 ms                 | 10.3 s → 7.1 s                 |

Later opens now match the first: the drawer appears in under 0.2 s. The
viewer's own build still runs after the drawer appears (7 to 13 s here, in a
dev build at 6x), which is the separate cost named in the recommendation.

Create's View button, after the page had built the hidden viewer: the drawer
and viewer appeared together, 1.4 s from the open call before the fix and
1.1 s after, with the viewer showing at once (no fade wait) both times.
