---
status: active
value: null
effort: null
work_state: blocked
remaining: Get Austen's decision to promote mandala Explore visibility past DEV, then verify the public route.
depends_on: 'external: Austen promotion decision for mandala Explore visibility'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Phase 5A Implementation Plan — Mandala Publication Adapter

**Queue evidence, 2026-10-07:** The implementation ledger is checked except the Austen decision to promote Explore visibility past DEV. Keep this gate open.

**Date:** 2026-08-25
**Parent charter:** `../2026-08-21-browse-explore-you-public-contributions-design.md`
**Governing child spec:** `../2026-08-21-versioned-visual-artifact-publication-design.md`
**Base state:** Phase 3 public tunnel vertical slice, commit `2cfa65b41e`.

Charter scope for this phase: _"Implement the mandala revision builder, schema,
digest, preview generator, migration, and moderation flow. Give mandalas a
deterministic public preview instead of copying no poster. Add Mandalas to
Explore only after its contract, moderation, and calibrated supply gate pass."_

## Capability ownership (primitive-discovery report)

Search terms used: `publishTunnel`, `artifactPublicationRequests`,
`artifactType`, `mandala-collection`, `mandala revision`, `poster`,
`exportMandalaPNG`, `renderMandalaToCanvas`, `listPublicArtifacts`,
`visualType`, `SegmentedControl`.

- **Extending** `shared/artifact-revisions`. Phase 3 left the publication batch,
  idempotency, and withdrawal inside `tunnel-publication-service.ts`. Mandala is
  the second use, which is the ownership decision point in `never-hand-roll.md`,
  so that behavior moved to
  `shared/artifact-revisions/services/artifact-publication-service.ts` and the
  tunnel service became a thin adapter over it. Two adapters, one publisher.
- **Reusing** the public boundary unchanged. `firestore.rules` was written
  type-generic in Phase 3 (`artifactType in ['tunnel', 'mandala', 'scene']`) and
  `public-artifact-loader.ts` is payload-agnostic. Neither needed an edit; the
  rules suite now proves that instead of assuming it.
- **Reusing** the admin moderation feed. `ArtifactPublicationQueuePanel` already
  renders whatever is live and labels it by type, so the mandala appears there
  with no change.
- **Extending** `mandala-export.ts` with `renderMandalaPosterDataUrl`, sharing
  its existing `calculateMandalaGeometry` + `renderMandalaToCanvas` path
  (factored out as a private `drawMandala`). No parallel mandala renderer.
- **Extending** `ExploreVisualsPanel.svelte` to be visual-type aware rather than
  adding a second Explore panel. It renders one titled shelf per artifact type on
  a single wall — no type picker; see "The type picker is gone" below.
- **Creating** the mandala adapter files — private revision, public revision,
  repository, publication service, publication controls, detail preview — as the
  mandala feature's owned payload builders, which is exactly the adapter
  boundary the child spec defines.

## Design decisions

### The poster is derived at publish time, not baked into the digest

A tunnel's poster is authored at save time and rides _inside_ the digest: it is
part of what the owner saved. A mandala's image is a pure function of its
payload — the guest detail view redraws it from `steps`. Baking a rasterized
poster into the mandala digest would make two identical mandalas
content-address differently across browsers, because canvas rasterization is not
byte-stable across implementations. That breaks the "same content, same revision
id" invariant the whole publication boundary rests on.

So `MandalaPublicPayload` carries **no poster**. `publishArtifact` takes an
optional `posterDataUrl` thunk, called lazily and only when this revision has no
poster in Storage yet; the mandala adapter supplies one that renders a 512px
WebP from the payload's own geometry, stepping quality 0.85 → 0.70 → 0.55 until
it fits the 200KB Storage rule. The result lives only in Storage, referenced by
the envelope's `posterUrl`.

Consequence, visible in the shipped surface: the Explore **list** shows the
derived poster (cheap, cacheable, unfurlable) and the Explore **detail** shows
the live `SequenceMandala` render with its real undulation. Not a resized
thumbnail — the actual artwork.

### The public payload drops `sourceSequenceId`

Same rule Phase 3 applied to tunnels: an unpublished library identifier never
enters a guest projection. `sourceWord` survives because it is a label and is
already simplified. Provenance back to the exact private revision lives in the
ledger's `sourceRevision`, which only the owner and admins can read.

The private mandala revision digest keeps `source`, `sourceWord`, and
`sourceSequenceId`, so a mandala with lineage content-addresses differently in
private and public space. The unit suite asserts that divergence directly.

### Legacy mandalas baseline instead of failing

47 mandalas predate revisions. `load()` baselines any entry missing revision
metadata and re-saves it, exactly as the tunnel repository does. `publishMandala`
additionally baselines **in memory** via `sourceRevisionFor()`, so publishing a
stale in-flight entry cannot fail. The digest is a pure function of the payload,
so the in-memory stamp agrees with whatever the repository later writes.

### Curated defaults never show sharing controls

`MandalaModule` renders both persisted entries and curated defaults through one
render-shaped selection. The publication controls key off a `selectedCollected`
derived from the persisted collection, so a default resolves to `null` and no
sharing UI appears. Publication content-addresses a _saved_ payload, and a
default has nothing to address.

### The type picker is gone; shelves replaced it

The first cut put a Tunnels | Mandalas segmented control above a fixed-column
grid. With three published artifacts that meant a two-option picker floating over
a mostly empty canvas, and clicking either side showed one or two cards stranded
in the top-left corner. Austen's read was that it matched no pattern in the app.

It doesn't. The gallery's language is a titled shelf per group with the artwork
itself carrying the page — `GalleryLanding` and Explore > Sequences both do this.
`ExploreVisualsPanel` now renders one shelf per type (heading, count pill,
artwork on a plinth) stacked on one centered wall, so every published visual is
visible at once with no picker and no click. A named-type deep link
(`/browse/explore/visuals/mandalas`) still resolves — it narrows to that shelf and
the artwork takes the canvas rather than sitting in the middle of it as a
thumbnail.

Composition rules that make it hold at every width, all in the panel's own CSS:

- Artwork size ramps continuously (`clamp(22rem, 25vw, 60rem)`), so a 4K canvas
  gets bigger pieces instead of more thin columns. No step tier.
- `repeat(auto-fit, minmax(min(100%, --art-card-min), 1fr))` — the repetition
  count is computed against the **max** track size when that max is definite, so
  the previous `minmax(min, 60rem)` collapsed a 1936px wall to a single column.
  The cap moved to the wall (`max-width: card-max × --wall-cols + gaps`).
- When two shelves sit side by side the band binds to the artwork it holds and
  centers, so free `fr` tracks can't push shelves to opposite edges of a 4K canvas.
- Posters are bright strokes on black, so the plinth uses `mix-blend-mode: screen`
  rather than letting a black square read as a hole.

### Scenes are not in this phase

Only types with a shipped publication adapter (`PublishedVisualType`) get a
shelf. Scenes (5B) stay unscheduled pending 3D Studio schema stability, per the
charter.

## Ledger

- [x] `CollectedMandala` carries revision metadata (`currentRevisionId`,
      `currentContentDigest`, `currentRevisionCreatedAt`,
      `revisionDigestAlgorithm`, `revisionDigestVersion`) plus schema
- [x] `mandala-revision.ts` — private revision payload, digest, prepare/reuse,
      `currentMandalaRevisionRef`
- [x] `mandala-public-revision.ts` — sanitized public payload + content address
- [x] `mandala-collection-repository.ts` — batched work doc + immutable
      revision, load-time baselining, digest/metadata agreement check
- [x] `mandala-collection-state` routed through the new repository
- [x] `renderMandalaPosterDataUrl` in `mandala-export.ts` (512px WebP, ≤200KB)
- [x] Generic `artifact-publication-service.ts` extracted; tunnel service reduced
      to an adapter with identical public API and behavior
- [x] `mandala-publication-service.ts` — publish / withdraw / status
- [x] `firestore.rules` — private `users/{uid}/mandala-collection/{id}/revisions`
      subcollection: content-addressed, immutable, admin-delete-only
- [x] `MandalaPublicationControls.svelte` in the mandala detail rail
- [x] `ExploreVisualsPanel` visual-type aware — one titled shelf per type on a
      single centered wall, no type picker (see "The type picker is gone")
- [x] `MandalaDetailPreview.svelte` — live redraw, WCAG 2.2.2 pause control,
      reduced motion honored
- [x] Unit suite (16 tests) — digest determinism, private/public divergence,
      reuse-on-unchanged, sanitizer key set
- [x] Rules suite extended to 31 tests — mandala publish/read/withdraw, unknown
      artifact type denied, private revisions subcollection
- [x] `npm run check` — 0 errors, 0 warnings
- [x] `firestore.rules` deployed to `the-kinetic-alphabet`
- [x] Live verification: publish → Explore list → detail → withdraw → republish →
      admin feed, across 7 viewports
- [ ] Promotion of `exploreVisualsVisible()` past DEV — **Austen's decision**,
      deliberately untouched (charter Phase 0B supply gate)

## Verification evidence

| Check                            | Result                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `vitest` mandala revision suite  | 16/16 pass                                                                                                         |
| `npm run test:rules:artifacts`   | 31/31 pass (25 before this phase)                                                                                  |
| `npm run check`                  | 0 errors, 0 warnings                                                                                               |
| Rules deploy                     | released `firestore.rules` to `cloud.firestore`                                                                    |
| Publish round trip               | mandala ΩORZ live, poster served from Firebase Storage, 0 console errors                                            |
| Withdraw → republish             | status chip Public → Private → Public, clean both ways                                                             |
| Admin `/admin/publications`      | 3 live: 1 Mandala + 2 Tunnels, typed correctly                                                                     |
| Phase 3 regression               | Tunnels tab still lists both published tunnels; tunnel detail still mounts its canvas                              |
| Viewports                        | 1920 (4 col), 2560 (5), 3840 (5), 1440 (3), 820 (2), 960×412, 375 (1). No horizontal overflow at any width.        |

## The 4K pass, no longer out of scope

An earlier revision of this plan recorded the 4K dead space as a Browse-wide
app-shell problem and deferred it. That was the wrong call — the panel shipped
looking like output, and deferring the fix meant shipping it that way. It is
fixed here, in three places rather than one panel:

- `ExploreVisualsPanel` — the composition described above.
- `BrowseModule` — the Explore switcher (Sequences | Collections | Visuals) lost
  `size="sm"`, which was rendering 32px targets and 12px labels below the 44px
  touch floor. Its eyebrow, heading, and box width now ramp with the canvas,
  bounded so three short labels never stretch into a progress bar.
- `CommunityCollectionsPanel` — one click away and carrying the identical island
  defect: a fixed `880px` list frozen at 1080p proportions, `auto-fill` against a
  240px floor emitting more/thinner tiles as the canvas grew, and a short list
  dead-ending in the top third. Band ramps, grid floor ramps, `safe center` seats
  the list.

`cqi` units were part of the original cause: with no query container declared they
resolve against the small viewport, so `clamp(18px, 2.1cqi, 26px)` hit its cap
around 1240px and froze. The ramping values here use `vw`.

Measured after (CSS px, page zoom compensated):

| Viewport | Result |
| --- | --- |
| 3840×2160 | band 2976 of a 4192 shell, cards 952/952/960, one row, no vertical overflow |
| 2560×1440 | composed, fills the band |
| 1920×1080 | band 1536, cards 476/476/480, h2 30.88px, title 20.48px, byline 15.68px |
| 1440×900 | three across, composed |
| 820×1180 | shelves stack, Tunnels two across, Mandala centered |
| 960×412 | whole card fits (272 tall in a 340 shell) after the short-landscape plinth cap |
| 375×667 | single column, legible, no horizontal overflow |
| `/visuals/mandalas` | solo view: card 670×743, "All visuals" pill, no overflow |
| Explore switcher @1920 | 384px wide, 44px targets, 14px labels |
| Collections @1920 | band 883, 3 × 268 columns, grid vertically centered |

## Rollback

The mandala side is additive. To back it out: revert the mandala feature files
and the `ExploreVisualsPanel` / `MandalaDetailPreview` pair, then drop the
`mandala-collection/{id}/revisions` block from `firestore.rules`. The generic
`artifact-publication-service.ts` extraction is behavior-preserving for tunnels
and can stay — the tunnel adapter's public API is unchanged (`publishTunnel`,
`withdrawTunnelPublication`, `getTunnelPublicationStatus`, `PublishTunnelResult`,
`TunnelPublicationStatus`, `PublicationOwner`). Already published mandalas remain
readable; `removed` is terminal and no rules change is needed to leave them
alone.
