---
status: active
value: null
effort: null
work_state: unverified
remaining: Inspect the flow-arts software history route at specified viewports and verify parser/submission behavior.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Flow Arts Software History Redesign

**Date:** 2026-08-31
**Status:** Approved in session
**Route:** `/roots/software`
**Branch:** `codex/software-history-redesign`

## Outcome

Turn the existing software-lineage article into a chronological public exhibit
that reads clearly at phone, tablet, laptop, and native 4K widths. The redesign
must preserve the page's researched copy and outbound credits while fixing the
production 404, documentary-image cropping, unbounded media scaling, missing
document landmarks, and unsafe public-write boundary.

## Audit evidence

The pre-change viewport sweep found no horizontal overflow, but the composition
did not scale coherently:

- At 375×667, the four LAB screenshots were forced into 148px columns.
- At 1440×900, the first gallery stayed 416px wide inside a 1,277px shell.
- At 3840×2160, prose stayed around 704px while web screenshots expanded to
  2,552px. A 1,734px source rendered at 147% of its natural width.
- Page height grew to about 13,100px at 4K because media enlarged with the page
  shell instead of recomposing beside the copy.
- Ten of eleven documentary images were forced through an aspect ratio that did
  not match the source and were cropped with `object-fit: cover`.
- The document had no `main` landmark, no chronological index, and no in-page
  navigation beyond the submission anchor.
- The production server load deliberately returned 404 outside development.
- The three submission controls had no durable identifiers, and direct public
  Firestore writes had no server-side abuse limit.

## Ownership map

| Concern                                    | Decision                              | Owner                                                  |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| Public cosmic chrome                       | Keep                                  | `MarketingChrome.svelte`                               |
| Editorial type and reading measures        | Keep                                  | `public-editorial.css`                                 |
| Page chronology and responsive composition | Replace route-local layout            | `HistoryEra.svelte` + route page                       |
| Documentary gallery behavior               | Create route-local presentation owner | `SoftwareGallery.svelte`                               |
| Mobile gallery scrolling                   | Reuse native scroll-snap pattern      | `SoftwareGallery.svelte`                               |
| Resource links and CTA language            | Keep                                  | Shared editorial classes                               |
| Form persistence                           | Extend                                | `software-submissions.ts` through a server API         |
| Form state transition                      | Replace reserved blank slot           | Shared `Crossfade.svelte` with animated height         |
| Request abuse boundary                     | Reuse                                 | `withRateLimit` + Cloudflare native rate-limit binding |
| Firestore write                            | Move behind server boundary           | `getAdminDb()` in `/api/software-submissions`          |

The gallery is a route-specific composition, not a new shared carousel
capability. It uses the same native horizontal scroll, visible next-card cue,
scroll snapping, and themed scrollbar pattern already used by the public
Composer games strip.

## Information architecture

The page becomes one article with a hero, an era index, a continuous timeline,
a contribution section, and a current-product CTA.

Timeline order:

1. Printed foundations: Lorq Nichols' paper pattern systems.
2. Pocket reference: the VTG app.
3. Dedicated simulators: the LAB family.
4. Browser tools: VisualSpinner3D.
5. Editable web workspace: SpiroAnim.
6. Current ecosystem: AR Flow Arts and Flow Arts Meet Up.
7. Current chapter: where The Kinetic Alphabet and Composer fit.

Each entry exposes a sequence number, a period/status label, a descriptive
heading, copy, source links, and documentary media. The index uses button-like
anchors and names the eras rather than repeating product titles.

## Responsive composition

### Phone and short landscape

- Hero, index, and timeline stack.
- The era index and multi-image galleries become horizontally scrollable rails.
- Gallery cards show a partial next item so horizontal movement is discoverable.
- Phone screenshots render one-up at an inspectable width instead of two-up.
- Natural image ratios remain intact.

### Tablet and laptop

- The index becomes a deliberate grid with no orphan row.
- Entries use copy above media until enough width exists for a real two-column
  composition.
- Phone galleries use two columns where four columns would make UI illegible.

### Desktop and 4K

- Each timeline entry uses a bounded copy column beside a bounded media stage.
- Wide screenshots cap below their natural width and never expand to the shell.
- Phone galleries cap each device frame and use deliberate two- or four-column
  arrangements according to the media container, not the viewport alone.
- Extra canvas becomes balanced columns and gutters, not enlarged type or media.

## Media rules

- Every image carries its real intrinsic width and height.
- `height: auto` preserves source geometry; documentary screenshots never use
  `object-fit: cover`.
- Wide media caps at 1,100px. Phone media caps at an inspectable device width.
- Lazy loading and intrinsic dimensions preserve layout stability.
- Captions remain visible and identify the source or application.

## Submission boundary

The client posts same-origin JSON to `/api/software-submissions`. The endpoint:

- accepts only `name`, `url`, `notes`, and an empty honeypot field;
- trims and validates lengths, and accepts only HTTP(S) URLs;
- rejects cross-origin browser requests;
- applies a four-requests-per-minute native Cloudflare limit by IP;
- writes `createdAt` and `source` on the server with Admin Firestore;
- returns a generic retryable error without leaking implementation details.

Firestore client creation becomes denied. Admin reads remain available, and the
existing Firestore trigger still receives the same collection/document shape.

## Motion and accessibility

- The article is wrapped in `main` and `article` landmarks.
- Timeline navigation has an explicit accessible label.
- Native rails are named lists and keyboard-scrollable focus targets.
- Form controls have `id`, `name`, autocomplete policy, and durable error
  description wiring.
- The form-to-confirmation geometry change uses the canonical `Crossfade` with
  animated height and inherited reduced-motion behavior.
- No new raw transition durations or easing curves are introduced.

## Verification

- Focused Svelte/TypeScript checks for every changed source file.
- Parser unit tests for valid input, unexpected fields, invalid URLs, limits,
  and honeypot handling.
- Firestore emulator proof that clients cannot create submission documents and
  admins retain read access.
- Production build proves `/roots/software` is generated and no longer gated by
  `dev`.
- Browser sweep at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
  2560×1440, and 3840×2160, plus 200% zoom.
- Runtime measurements confirm no horizontal overflow, one main landmark,
  media never exceeds its source-aware cap, and essential text remains at least
  14px.
- Keyboard pass covers era anchors, horizontal gallery rails, form errors,
  submission pending state, and confirmation.

## Scope guardrails

- Do not rewrite researched claims or add unverified dates.
- Do not redesign the shared marketing header, footer, or cosmic background.
- Keep page-specific layout inside route-local components. Change
  `public-editorial.css` only if a defect belongs to every editorial consumer.
- Do not add a modal lightbox, custom carousel controller, or local motion
  framework.
