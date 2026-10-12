# One footer, one seat

Date: 2026-10-12. Author: Fable (design). Implementer: Opus.
Commit this file into the task worktree as
`docs/superpowers/specs/2026-10-12-footer-unify.md`.

## Austen's decision (do not re-litigate)

Option A: every page inside MarketingChrome shows ONE footer, the current
`full` composition (brand column + Explore/Learn LinkChip rows + legal
bottom). The footer never paints its own seat. History shows the footer on
desktop like every other page. App instruments stay chrome-free.

## What is wrong today (verified in code)

- `src/lib/shared/landing/components/MarketingChrome.svelte` picks four
  footer states per route: `compact` for `/`, `/composer`, `/history`,
  `/timing-and-direction`; `sitemap` for `/about`; `full` otherwise; and
  `immersive` hides it on History above 760px. Visitors see three different
  footers for reasons they cannot see.
- `src/lib/shared/landing/components/SiteFooter.svelte` paints its own seat:
  `margin-top: 4.5rem`, a 1px hairline, and a dark gradient scrim. On any
  page whose content is an opaque panel (guide hub, the lessons hub at
  `/learn/concepts`) that reads as a separate slab with a band of sky above
  it. The `surfaced` class already removes all three when a page hands over
  its surface; that path is the correct behaviour and should be the only one.
- `src/lib/shared/landing/domain/page-surface.ts` hands the guide canvas to
  the footer for `/guide/*` but deliberately not for the `/guide` hub, so
  the hub shows the seam worst (image Austen sent: canvas ends, sky strip,
  footer).

## Changes

1. **SiteFooter: one composition.** Delete the `variant` prop and the
   `compact` / `sitemap` branches, markup and CSS (`.compact`, `.sitemap`,
   `.compact-main`, their `.inner`, `.brand`, `.bottom`, responsive blocks).
   The remaining markup is today's `full` branch. Update the header comment.
   `MarketingChrome` is the only consumer (`grep -rn "<SiteFooter" src`
   confirms); drop `variant=` there and the `footerVariant` derivation.
2. **SiteFooter: no self-painted seat.** Remove `margin-top`, `border-top`
   and the gradient `background` from `.site-footer`; the `.surfaced` rule
   becomes the default and goes away. `background` stays bound to the
   `surface` prop (transparent when unset, so sky pages show the star field
   through the footer exactly as the content above does). Keep `.bottom`'s
   inner hairline as the only separator. Spacing between page content and
   the footer comes from the footer's own `.inner` padding-top (today 48px;
   raise toward ~64px if the sky pages look cramped once the 4.5rem margin
   is gone, but keep ONE value for every page). Do not add a new per-page
   spacing prop.
3. **History shows its footer.** Delete the `immersive` prop, the
   `footerImmersive` derivation and the `.immersive` media rule. Check
   `/history` at 1440 and 1920: the room is viewport-sized, so the footer
   simply follows it on scroll. If the archive's own bottom (the "About this
   archive" band) has spacing that was tuned assuming no footer, adjust only
   that spacing; do not restyle the archive.
4. **Guide hub joins the surface handoff.** In `page-surface.ts`, return
   `GUIDE_CANVAS` for `path === "/guide"` as well as `/guide/`. Update the
   comment. Check the home -> guide shared-element morph still runs
   (`isNamedRouteMorphActive` in MarketingChrome; grep for the morph owner
   under `src/lib/shared/landing`). `pageOwnsSurface` unmounts
   `LiveBackground`; if that unmount visibly breaks the morph into the hub,
   keep the background mounted for the hub only (a narrow exception in
   MarketingChrome with a comment) and still pass the surface to the footer.
   Report which you did.
5. **Leave alone:** the timing lesson exclusion (`isTimingLesson`), the
   `MARKETING_EXCLUDE*` lists, SiteHeader, LinkChip styling, the footer's
   link set, and the `no-text-links.md` pill rule. Instruments
   (`/shape-engine`, `/create`, `/notation/qft`, print sheets) stay with no
   chrome; that is the one remaining split and it is intentional.
6. **About page:** with the sitemap variant gone, `/about` gets the brand
   column too. Open it and check the page's own closing section. If it ends
   with a block that duplicates the footer's brand + "Open Flow Arts
   Composer" CTA immediately above the footer, remove that closing block
   from the About page (smallest cut, note it in the report). If there is no
   duplicate, change nothing there.
7. **Home page:** gets the full footer. No home-page changes beyond what
   the shared footer brings. Confirm the home tiles + footer do not produce
   two "Open Flow Arts Composer" buttons stacked within one viewport at
   1440; if they do, report it, do not restyle.

## Gates and evidence

- `npm run check:fast` in the worktree; any `*.test.ts` under
  `src/lib/shared/landing/**` and `src/routes/(public)/**` that touches the
  footer, chrome or page-surface (there were none at brief time; run the
  landing folder's tests anyway).
- Visual, in the built-in browser (`mcp__Claude_Browser__*`; load the
  `anthropic-skills:built-in-browser` skill first) against a task-owned Vite
  server on a free non-5173 port rooted in the worktree: `/`, `/history`,
  `/about`, `/learn/concepts`, `/guide`, `/guide/level-1/the-grid`,
  `/tricks`, `/composer` at 1440x900 and 390x844, each scrolled to the
  footer. Assert with a JS probe on every route: exactly one `footer.site-footer`,
  computed `margin-top` 0, `border-top-width` 0, the brand column present,
  and on `/guide`, `/guide/level-1/*`, `/history` the footer's computed
  background equals the page surface. Screenshot `/guide` and
  `/learn/concepts` at the content/footer boundary before and after to show
  the seam is gone.
- Then from the primary checkout: `npm run wt:finish -- codex/footer-unify
--route /guide` (follow `.claude/rules/worktree-workflow.md` exactly).

## Hazards

- Worktree: `git worktree add E:/worktrees/tka-platform/footer-unify -b
codex/footer-unify` from `E:/tka-platform` on current `main`; follow the
  project's per-worktree setup (node_modules junction) and NEVER run `pnpm
install` inside it. Never touch port 5173. Commit with explicit
  pathspecs only. Stop the task Vite server before finishing.
- Do not push, publish, or deploy. Local main only.
