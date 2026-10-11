# Guide shell: one chrome owner, one sidebar owner

Date: 2026-10-11. Author: Fable (design). Implementer: Opus.
Commit this file into the task worktree as
`docs/superpowers/specs/2026-10-11-guide-shell-rail-and-chrome.md`.

## What Austen saw and what is actually wrong

Screenshot: `/guide/level-1/the-grid` at ~1500 CSS px. The sidebar covers the
footer's left column (TKA wordmark, tagline, "Open Flow Arts Composer", legal
line), so only the EXPLORE / LEARN chip rows show, and the sidebar is a
hand-rolled rail instead of the shared one.

Verified in the browser on local main (1500x900):

- The guide footer IS the shared `SiteFooter` (`variant="full"`, 20 LinkChips),
  identical to `/tricks`. The home page shows `variant="compact"` (brand +
  legal only), which is why it "looks like a different footer".
- `.guide-sidebar` is `position: fixed; z-index: 10; height: calc(100vh - 64px)`
  below 1680px (guide.css:83). `.guide-content` clears it with
  `margin-left: 13.75rem`, but the footer is rendered outside `.guide-layout`
  (GuideShell) at full width with `.inner` left = 55px, so the fixed rail paints
  over the footer's brand column. That is the overlap. At >=1680px the rail
  becomes sticky-in-flow and the overlap disappears, which is why nobody caught
  it at 4K.
- Deep guide pages (`/guide/level-1/*`, `/guide/level-2/*`, `/guide/ratios`,
  `/guide/motion-paths`) are excluded from `MarketingChrome`
  (src/routes/+layout.svelte `MARKETING_EXACT` keeps only the `/guide` hub).
  `GuideShell` therefore mounts its own `SiteHeader` + `SiteFooter` and runs its
  own theme call (`applyThemeForBackground(COSMIC)` in onMount). That is the
  "one system here, another system there": two hosts own the same chrome and
  only one of them (MarketingChrome) owns the footer variant / surface rules.
- `GuideSidebar.svelte` + the `.guide-sidebar` CSS is a second sidebar
  implementation. `@austencloud/sidebar` 1.0.1 (E:/shared-packages/packages/
  sidebar, published on npm, consumed by
  `src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte`) is the
  owner of the hover-expand overlay rail Austen is asking for: 64px icon rail
  that content reserves, floats out to 220px on hover (no reflow), pin locks it
  open (push layout), `--sidebar-reserved-width` contract.

## Decisions (do not re-litigate)

1. **Deep guide routes join MarketingChrome.** Add `/guide` to
   `MARKETING_SUBTREES` (remove the `/guide` exact entry). GuideShell stops
   mounting SiteHeader/SiteFooter and stops calling the theme calculator; the
   `ownsStandaloneChrome` branch, the `.guide-footer-bleed` wrapper and the
   `html:has(.guide-layout):not(:has(.mkt-shell))` header/footer width rule in
   guide.css go away. The `/guide` hub already runs GuideShell inside
   MarketingChrome, so this is the existing precedent, not a new pattern.
   - `pageSurface(path)` returns the guide canvas colour
     (`oklch(0.13 0.015 270)`, today's `.guide-layout` background) for every
     `/guide` path except the hub, so the footer continues the book canvas
     exactly as it does for `/history`'s ink. Export the colour from one place
     and use it in guide.css too (a CSS custom property set on `.guide-layout`
     is fine, with the TS constant as the single source).
   - MarketingChrome: when `pageSurface(path)` is set, do NOT load
     `LiveBackground` (the animated cosmic canvas is invisible under an opaque
     page and only burns GPU on long reading pages). Keep the static fallback.
     Unmount it if the reader navigates from a star-field page into the guide.
   - MarketingChrome `contentKey`: map every `/guide/*` path to `"/guide"` the
     way `/timing-and-direction` already does, so topic-to-topic navigation does
     not crossfade and remount the whole shell (sidebar scroll/peek state would
     reset on every click otherwise).
   - Footer variant stays `"full"` for guide routes (default branch). Keep
     LinkChips; the footer is already the shared owner and `no-text-links.md`
     requires pills. Do not restyle the footer in this task.
   - The `book`, `print`, `handbook`, `cover-lab` routes use `+page@(public)`
     and must stay chrome-free: exclude them in `MARKETING_EXCLUDE` (or a
     `/guide/**/print|book|handbook|cover-lab` test). Check `/guide/codex/poster`
     and `/guide/codex/parity` too and decide per page from what they render.
   - The level-1/level-2 `<svelte:head>` font links and
     `setActiveSectionContext` wiring stay where they are.

2. **The guide TOC moves onto `@austencloud/sidebar`.** Extend the package
   (owner), do not fork it. The guide needs four things the package lacks:
   - **Real links.** Guide pages are prerendered SEO entry points; the TOC's
     ~70 `<a href>` rows are crawlable internal links and must stay anchors.
     Add `href?: string` (+ `download?: boolean`) to `Section` and
     `ModuleDefinition`; `SectionButton`/`ModuleButton` render `<a>` with
     `aria-current="page"` when `href` is set, `<button>` otherwise. The
     click still fires `onSectionChange`/`onModuleChange` so hosts can close
     overlays; SvelteKit's router intercepts the anchor. A module WITH sections
     and an `href` behaves: rail tap -> navigate; expanded tap -> peek toggle
     (unchanged package rule). `DesktopNavigationSidebar.svelte` already notes
     the missing "plain link cell" for Shop; it may adopt `href` for `linkHref`
     but that is optional, not required here.
   - **Label-only rows.** Make `Section.icon` optional. A section without an
     icon renders as a text row in the expanded tree and is skipped in the rail
     (rail shows module icons only). Topic rows have no icons.
   - **Indent depth.** `Section.depth?: 0 | 1` -> extra `padding-inline-start`
     for the sub-topic rows (today's `li.sub`).
   - **Top inset.** The nav is `position: fixed; top: 0`. Add
     `top: var(--sidebar-top, 0)` (and `bottom: 0` stays) so a host with a fixed
     header can sit the rail under it. Host sets
     `--sidebar-top: var(--marketing-header-h, 64px)` and
     `--z-sidebar: 150` (SiteHeader is z 200, its menus 210).
   Version it as `@austencloud/sidebar` 1.1.0: changeset, bump, `pnpm build`
   in `E:/shared-packages/packages/sidebar`. **Do NOT `npm publish`.** The npm
   publish is a public release and waits for Austen's explicit go. Instead run
   `pnpm pack` there and copy the tarball to
   `E:/tka-platform/vendor/austencloud-sidebar-1.1.0.tgz`; the app depends on
   it as `"@austencloud/sidebar": "file:vendor/austencloud-sidebar-1.1.0.tgz"`
   (same precedent as `@austencloud/phone-sign-in`). After Austen publishes,
   the dependency flips back to `^1.1.0` in a one-line follow-up. Commit only
   `packages/sidebar/**` and the changeset file in shared-packages;
   `packages/backgrounds` has another task's dirty files, leave them alone.
   Document the new props in the package README table.

3. **Guide host = thin wrapper, one data source.** Replace
   `GuideSidebar.svelte`'s render tree with:
   - `guide/_data/guide-toc.ts` (new): builds `ModuleDefinition[]` from the
     manifests GuideSidebar already reads (`bodyPagesByGroup`, `seoForSlug`,
     `LEVEL2_SECTION_ANCHORS`, `LEVEL2_ANCHOR_ROUTE_SLUG`). Modules: Level 1
     (groups 1.0/1.1/1.2 = `SectionGroup`s via `groupId`, sections = topics with
     `href`, `depth`), Level 2 (groups 2.0/2.1, sections with
     `/guide/level-2/<slug>#<id>`), Ratios, Motion paths, Codex (no sections,
     `href`), Downloads (three `download` sections). Icons: Font Awesome
     strings, same as the app's modules. Labels through `tDynamic` as today.
   - `GuideRail.svelte` (new, desktop >=1024px only): renders the package
     `Sidebar` with `modules`, `currentModule` (derived from pathname),
     `currentSection` (level-1: slug; level-2: `activeSectionId` from the
     scroll spy; else ""), `pinStorageKey="guide-rail"`, `homeHref="/guide"`,
     a `brand` snippet override showing a contents glyph + "Guide" (the
     SiteHeader already carries the TKA wordmark; do not show it twice), no
     `account`/`footer` slots. Hover-expand default, pin available.
   - Content offset: `.guide-content { margin-inline-start:
     var(--guide-rail-reserved, 64px) }` fed by `onReservedWidthChange`; delete
     the `13.75rem` margin, the fixed `.guide-sidebar` block, and the whole
     >=1680px sticky/centring block in guide.css. The content grid's own `1fr`
     gutters centre the prose in the remaining width at every tier; keep the
     wider breakout tracks at >=1680px if they still read well, otherwise
     simplify.
   - Phones/tablets (<1024px): keep GuideShell's floating "Contents" pill and
     full-height drawer (it already handles tuck-on-scroll and `holdPillAway`),
     but the drawer renders the SAME `ModuleDefinition[]` through a small
     label-list component, not a second hand-authored tree. The app does the
     same split (desktop package rail vs. mobile primary nav from one module
     list). Delete `GuideSidebar.svelte` once nothing imports it.
   - Keep: `revealCurrent` behaviour (current row scrolled into view on route
     change) and the per-route auto-fold (current level open, other folded).
     The package's `expandedModules` + `SectionsList` group persistence cover
     most of it; wire the current module open on route change.
   - 15 `guide_nav_*` / `guide_runtime_*` i18n keys are in use; keep the ones
     still rendered, delete orphans via the `translate` skill check.

## Required gates and evidence

- Package: its own `pnpm check` / tests in `packages/sidebar`; the app's
  `DesktopNavigationSidebar` must render unchanged (open `/create` on the
  preview and check the rail, hover, pin).
- App: `npm run check:fast`, the guide tests under
  `src/routes/(public)/guide/**/*.test.ts`, then the `wt:finish --route
  /guide/level-1/the-grid` gate from the primary checkout.
- Visual: this is a layout/structure change -> full seven-tier pass per
  `.claude/rules/visual-verification-mandatory.md` on `/guide/level-1/the-grid`
  (rail collapsed, hover-expanded, pinned, footer no longer covered at 1440 and
  1920), `/guide/level-2/turns` (scroll-spy highlights the section),
  `/guide` hub, `/guide/motion-paths` (pill hold still works on phone), and
  `/tricks` + `/` to prove MarketingChrome pages are untouched. Confirm in the
  DOM that every TOC row is an `<a href>` in the prerendered HTML
  (`curl` the route from the preview and count anchors inside the nav).
- Reduced motion and keyboard: the package handles both; spot-check focus
  reaches the rail links under the fixed header.

## Hazards (read before touching package.json)

- Never run `pnpm install` inside the task worktree: its `node_modules` is a
  junction into `E:/tka-platform/node_modules` and pnpm rewrites the primary's
  links (memory: pnpm-install-in-linked-worktree-breaks-primary). Recipe for
  the dependency bump: after packing the tarball into `vendor/`, from
  `E:/tka-platform` (primary, on main) edit `package.json` to the `file:`
  spec, run `pnpm install --offline` (fall back to a plain `pnpm install` only
  if offline cannot resolve the tarball), verify
  `node_modules/@austencloud/sidebar/package.json` says 1.1.0, and commit ONLY
  `package.json pnpm-lock.yaml vendor/austencloud-sidebar-1.1.0.tgz` on main
  with an explicit pathspec. Then merge
  main into the task branch so `wt:finish` sees no primary overlap. Say so in
  the report; it is the one primary-checkout edit this task is allowed.
- Never start, stop or restart port 5173. Use a free port for the worktree
  preview per `.claude/rules/never-start-the-dev-server.md`.
- `wt:finish` follows junctions; follow `.claude/rules/worktree-workflow.md`
  exactly, do not remove the worktree by hand.
- Chrome DevTools MCP failed to connect this session; the in-app browser
  (`mcp__Claude_Browser__*`) can open `https://localhost:<port>` pages and is
  the verification surface. Load the `anthropic-skills:built-in-browser` skill
  before first use.
