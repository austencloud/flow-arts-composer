---
status: active
value: null
effort: null
remaining: "Record the pending 6x CPU trace and compare it with the constrained-network performance target."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Landing Constrained-Network Performance

**Date:** 2026-08-09  
**Status:** Implemented and visually verified; final 6× CPU trace pending  
**Surface:** `https://tkaflowarts.com/`

## Outcome

The homepage must remain useful on a low-end phone over a genuinely poor
connection. A visitor must be able to read what TKA is, open Composer, and use
the page's navigation before decorative or observational features spend their
bandwidth and CPU budget.

The landing page is already server-rendered and prerendered. This work keeps
that complete HTML shell and changes the order in which enhancements arrive.

## Measured Baseline

Production was traced in Chrome DevTools at 375 × 667, Slow 3G, and 6× CPU
slowdown with the cache bypassed.

- LCP: 7,105 ms
- LCP element: the text `The Kinetic Alphabet`
- TTFB: 80 ms
- LCP render delay: 7,025 ms
- CLS: 0.07
- Longest network dependency chain: 13,823 ms

The delay is client-side. The initial document declares 42 stylesheets, while
hydration immediately starts PostHog/session replay and later starts the hero
generator, Firebase-backed animation data access, launchpad media, and the live
background. The production page transfers about 2.58 MB compressed across 250
resources after hydration.

## Loading Contract

### Critical on every connection

- Complete server-rendered headline and subline
- Header, primary CTA, `What is TKA?`, and launchpad destination links
- Stable reserved hero and launchpad geometry
- System/Georgia heading fallback with stable reserved metrics
- The CSS-only cosmic background
- Ordinary HTML links that work before hydration

### Normal connection, after first useful paint

- Baked hero sequence playback
- Generated continuation for the hero act
- Decorative launchpad media, one tile per idle turn
- Animated cosmic background
- PostHog and Web Vitals, scheduled during idle time
- Font Awesome decoration, scheduled during idle time
- Self-hosted Playfair and Fraunces brand fonts

### Constrained connection or Save-Data

The following must not load before an explicit request for the related feature:

- Live animation player and notation rail
- Hero generation engine and its CSV data
- Firebase/Firestore sequence repository
- Decorative launchpad media
- Animated background renderer
- PostHog, session replay, and Web Vitals
- Font Awesome decoration

The hero reserves the same footprint and exposes a `Play live preview` button.
Choosing that control is explicit consent to load the live player. Text links
and primary navigation remain ordinary HTML links and do not depend on it.
The constrained document also holds module preloads and hydration until after
the first useful frame. The complete SSR surface remains navigable while those
enhancements arrive.

## Bundle and Preload Policy

SvelteKit records CSS for dynamically imported Svelte components on the route
node and preloads it during SSR by default. On `/`, the server preload policy
must exclude styles owned only by lazy animation and launchpad-media components.
Those styles remain in Vite's dynamic-import dependency map and load with their
component when activated.

PostHog and its private dependency family must live outside the general vendor
chunk. A dynamic analytics import must not force unrelated packages into the
landing route.

The homepage must not request duplicate Google-hosted Playfair CSS. The existing
self-hosted Playfair face is the canonical heading font.

## Performance Budgets

The primary acceptance test is a cold Chrome DevTools trace at 375 × 667, Slow
3G, and 6× CPU slowdown.

- LCP target: at most 4,000 ms
- CLS target: at most 0.10
- No PostHog, Firestore, generator CSV, animation-engine, launchpad-media, live
  background, or Font Awesome font request before interaction on a constrained
  connection
- Initial SSR stylesheet preloads: no lazy component stylesheet owners
- Headline, CTA, and navigation usable without waiting for the live preview

Fast connections must keep the current composition and eventually mount all
enhancements. The constrained path may replace animation with an opt-in control,
but must not collapse the reserved stage or move the CTA.

## Implementation Scope

- `src/hooks.server.ts` and a pure landing preload-policy module
- `src/app.html` landing-only icon-font scheduling
- `scripts/inline-landing-critical-css.cjs` first-screen CSS inlining and
  connection-aware module/hydration gating
- `src/routes/+layout.svelte` landing analytics scheduling
- `src/routes/+page.svelte` duplicate font removal
- `src/lib/shared/analytics/landing-events.ts`
- `src/lib/shared/landing/components/MarketingChrome.svelte`
- `src/lib/shared/landing/components/HomeHero.svelte`
- `src/lib/shared/landing/components/SequenceHeroDemo.svelte`
- `src/lib/shared/landing/components/launchpad/LaunchpadGrid.svelte`
- `src/lib/shared/landing/data/hero-act.svelte.ts`
- `src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte`
- `vite.config.ts`
- focused unit and contract tests

## Verification

1. Run focused unit tests with `tests/config/vitest.config.ts`.
2. Run the repository type check and production build after the memory/process
   gate.
3. Inspect the emitted root route manifest and prerendered HTML for stylesheet
   and module preload counts.
4. Run a cold local Slow 3G + 6× CPU trace and compare LCP, CLS, request owners,
   and the dependency chain with the production baseline.
5. Verify interaction activation and capture the required responsive viewport
   sweep at 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, and
   375×667.

## Verification Record

- Focused contracts: 64/64 passing
- `svelte-check`: 0 errors, 0 warnings
- Production build: passing, 9,653 client modules transformed
- Final root document: 89,213 bytes raw; 15,168 bytes Brotli
- Root delivery: 5 first-screen CSS blocks, 3 post-load CSS blocks, 0 static
  module-preload links, and 1 connection-aware module gate
- Last DevTools Slow 3G + 6× CPU sample: first paint/FCP 4,748 ms, down 2,357 ms
  (33%) from the 7,105 ms baseline LCP; 16,270 document-transfer bytes
- Final constrained sample: SSR preview control present; 0 Firebase, PostHog,
  canvas, or video activity
- In-app browser, server-throttled Slow 3G at 375×667: 1,152 ms LCP/FCP,
  0.005 CLS, 826.8 ms response start, 1,199 ms response end, 1,209.4 ms
  DOMContentLoaded, and 1,211.4 ms load end
- The constrained document transferred 16,209 bytes, kept the headline and
  Composer CTA visible, had zero horizontal overflow, and requested none of
  the forbidden analytics, Firebase, video, or animation-engine owners
- No module, stylesheet, font, image, or media request started before LCP
- Explicit preview activation passed: the opt-in button disappeared and the
  live canvas count changed from 0 to 2
- Responsive sweep passed with zero horizontal overflow at 1920×1080,
  2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, and 375×667

The final DevTools trace transport disconnected while stopping the recording,
after the navigation timings and request-owner checks had been read. The last
complete predecessor trace measured 5,721 ms LCP and 0 CLS before the final
critical-CSS split and hard post-load hydration gate. The in-app browser
completed the cold network trace and viewport sweep, but its API does not expose
Chrome's 6× CPU slowdown. A fresh DevTools session must capture that last CPU-
throttled LCP/CLS sample before this spec is archived.

## Risks and Controls

- **Deferred CSS flashes when a lazy component mounts.** The existing reserved
  placeholders remain styled by critical route CSS. Lazy component CSS loads in
  the same Vite preload promise as its component before mount.
- **Analytics loses constrained-connection sessions.** This is deliberate. The
  product must not make itself slower in order to record that it was slow.
- **Font substitution changes editorial metrics.** Playfair remains local for
  the brand heading. Marketing body copy uses the existing system fallback, so
  no late font swap can shift the page.
- **Manual chunk cycles cause runtime TDZ failures.** Run the existing
  `DIAG_CHUNKS=1` build guard and require zero cycles.
