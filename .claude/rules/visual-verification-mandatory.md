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
  for a cross-viewport defect. Inspect all seven viewport tiers.
- If a string, asset, or async state can change geometry, classify it by the
  resulting geometry rather than by file type.

Required full-pass CSS viewports:

| Tier            | Viewport  |
| --------------- | --------- |
| iPhone SE       | 375×667   |
| short landscape | 960×412   |
| tablet portrait | 820×1180  |
| laptop          | 1440×900  |
| 4K at 200%      | 1920×1080 |
| 4K at 150%      | 2560×1440 |
| 4K at 100%      | 3840×2160 |

Skip a tier only when the surface cannot appear there; name the reason in the
verification evidence. New layouts also need a 200% browser-zoom reflow check.

## Browser Loop

1. For a redesign, inspect the pre-change surface and identify behavior and
   interaction owners that must survive.
2. Start or reuse the dedicated browser through
   `pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`.
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
