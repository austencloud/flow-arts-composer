# Composer Presentation Promotion Plan

**Status:** Shipped 2026-08-27 in `8ec8a09c5` (_feat(composer): promote reviewed
presentation_). Header corrected 2026-09-13 during spec reconciliation; it still
read "Approved for implementation" after the promotion had landed.

**Approved:** 2026-08-27

**Reconciliation evidence (2026-09-13):** `8ec8a09c5` deleted
`src/routes/(public)/composer/mockup/+page.svelte` (922 lines) and `+page.ts`,
rewrote `src/routes/(public)/composer/+page.svelte`, dropped the review-route
alias from `SiteHeader.svelte` and the exception from `src/routes/+layout.svelte`,
and updated `feature-truth-matrix.md`, `presentation-guardrails.md`,
`tests/unit/landing-route-morph.test.ts`, `tests/unit/seo-funnel-analytics.test.ts`
and `tests/unit/seo-head-contract.test.ts`. No `composer/mockup` reference
remains anywhere under `src/`.

**Scope:** Promote the reviewed Composer presentation from `/composer/mockup`
to the public `/composer` route.

## Outcome

`/composer` becomes the four-beat product story already reviewed at the
temporary route: opening, making, changing, and keeping. The temporary route is
removed after its production metadata, analytics, and route-shell contracts
have been reconciled.

This is a promotion of an existing presentation, not another Composer surface.
The page continues to compose the production sequence player, Construct picker
and StepGrid arrival, generator, tunnel, isolated 3D viewer, and gallery shelf.

## Production contracts to preserve

- The canonical URL remains `https://tkaflowarts.com/composer`.
- The Composer-specific Open Graph image, `SoftwareApplication` JSON-LD, and
  breadcrumb JSON-LD remain on the public route.
- Structured feature claims agree with `feature-truth-matrix.md`; incomplete
  practice-mode and unavailable feature claims are not carried forward.
- The opening `/create` action records the Composer conversion event. Plain
  Browse, Gallery, and Library links remain covered by normal navigation
  analytics rather than receiving duplicate custom events.
- Making, changing, and keeping reuse their one-shot viewport activators for
  section-view analytics. No second observer is introduced.
- The route remains prerendered and retains the existing marketing chrome,
  route morph, lazy boundaries, reduced-motion behavior, and 3D capability gate.

## Route cleanup

- Remove `src/routes/(public)/composer/mockup/`.
- Remove the review-route exception from the root marketing-route set.
- Remove the review-route path alias from `SiteHeader`; `/composer` already owns
  the normal active-navigation and Back behavior.
- Update the presentation guardrails, feature-truth ledger, and Construct
  presentation note to describe the public route.
- Keep historical handoffs intact as records of the review process.

## Verification

1. Run focused Composer state, route-morph, SEO, analytics, public-link, and
   release-surface contracts with the repository Vitest configuration.
2. Run formatting, style checks, `svelte-check`, and a production build or
   equivalent prerender proof.
3. Serve the task worktree on an agent-owned port. Verify `/composer` and its
   production head at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
   2560×1440, and 3840×2160, plus 200% browser zoom.
4. Exercise a manual Construct change, a generated sequence, Tunnel, 3D,
   reduced motion, and the unsupported-3D path. Confirm no horizontal overflow,
   console errors, or route-local persistence writes.
5. Confirm `/composer/mockup` no longer renders and that every changed public
   claim passes the final AI-writing scan.

## Integration boundary

All implementation work happens in `codex/composer-presentation-promotion`.
The primary checkout has unrelated in-flight changes, including comment-only
edits in the reviewed presentation dependencies. Do not absorb, reset, or stage
them. Integrate only when the primary paths owned by this promotion are clear.
