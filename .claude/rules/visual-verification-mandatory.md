---
paths:
  - "src/**/*.{svelte,css,ts}"
---

# Visual Verification Contract

Use this contract when a diff changes what a rendered surface looks like. Tests
and type checks do not prove composition.

For new surfaces, substantial restyles, or aesthetic reviews, also follow
`docs/architecture/visual-review.md` through the `ui-bust` skill. Keep aesthetic
readiness separate from geometry, accessibility, and functional evidence.
The full viewport pass alone cannot approve a visual direction.

## Scope

- No browser pass: comments, types, non-visual logic, ordinary copy changes, or
  an equivalent token swap whose geometry cannot change.
- Focused pass: a local appearance fix that cannot affect responsive structure.
  Inspect the affected viewport tiers and every changed state.
- Full pass: a new surface, responsive recomposition, shared primitive geometry,
  layout/grid/flex/breakpoint change, added or removed element, or a claimed fix
  for a cross-viewport defect. Inspect every size on the device list.
- If a string, asset, or async state can change geometry, classify it by the
  resulting geometry rather than by file type.

The required full-pass sizes are the device list in
`docs/architecture/layout-law.md`. That page holds the only list.
`npm run layout:sweep` opens the routes in `scripts/layout/sweep-routes.json`
at every size, measures them against the law, and makes the all-sizes sheet
for each route. It does not replace looking at the changed screen.

Skip a tier only when the surface cannot appear there; name the reason in the
verification evidence.
The Fold unfolded tier is the Galaxy Z Fold 6 inner screen held upright with
the browser bar showing: wider than a phone, shorter than a tablet. It is
the only tier between 520 and 960 px wide with under 800 px of height, so a
layout that fits phones and tablets can still overflow there (the guide's
card pages did on 2026-11-03). New layouts also need a 200% browser-zoom reflow check.

## Browser Loop

1. For a redesign, inspect the pre-change surface and identify behavior and
   interaction owners that must survive.
2. Start or reuse the dedicated browser through
   `pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`.
   It sets the `tka_agent_browser` cookie, so production PostHog and visit
   alerts skip this browser (`src/lib/shared/analytics/agent-browser.ts`).
3. Open one task-owned background tab in the default browser context. Pass its
   page ID to every scoped call.
4. Use per-page viewport emulation. Do not resize the operating-system window or
   pass `--force-device-scale-factor`.
5. Measure relevant geometry and computed styles, then capture WebP screenshots
   at quality 70. Numbers prove arithmetic; images prove composition.
6. Exercise both endpoints and at least one real transition for dynamic UI.
   Inspect loading, empty, error, long-content, and reduced-motion states when
   the change can reach them.
7. Fix observed defects and repeat only the affected frames. Clear emulation and
   close only the task-owned tab when finished.

Localhost verification in the dedicated agent browser is part of approved UI
implementation. Acting in Austen's personal browser session or mutating external
data still requires explicit authorization.

## Review Questions

- Do controls size to their content instead of stretching without purpose?
- Is the composition balanced at wide and narrow tiers, without dead space,
  stranded rows, clipping, horizontal overflow, or hidden essential context?
- Are type, icons, contrast, focus, and touch targets legible and operable?
- Does async content reserve geometry? Does intentional structural change use the
  shared motion owner and remain understandable with reduced motion?
- Does the surface consume the design system and preserve the surrounding
  product's interaction model?

## Stop Condition

Stop when every affected tier and state has been observed, measurements support
the geometry claims, screenshots show no relevant defect, and targeted runtime
checks pass. This completes the applicable rendering checks, not aesthetic
acceptance. Complete the separate aesthetic review when in scope. Do not add
frames or repeat unchanged passes without new evidence.

Visual judgment stays with the agent that can inspect the rendered surface; do
not replace it with a delegated prose review or a request for Austen to supply a
screenshot.
