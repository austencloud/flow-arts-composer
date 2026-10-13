# Composer handoff: carry the visitor across the reload

Date: 2026-10-13. Author: Fable (design). Implementer: Opus.
Commit this file into the task worktree as
`docs/superpowers/specs/2026-10-13-composer-handoff.md`.

## Austen's decision (do not re-litigate)

Three things, one task: (1) a cross-document view transition from the public
site into the app, (2) prefetch of the app's code on intent, (3) a rebuilt
boot screen that reads as a continuation of the site, not a splash. Carrying
the hero's sequence into Create is NOT in scope; a separate decision.

## What exists (verified in code)

- The Composer CTAs are `<a href="/create" data-sveltekit-reload>` in
  `SiteHeader.svelte` (two: nav item + button; sign-in too), `SiteFooter.svelte`,
  `src/routes/(public)/composer/_components/ComposerExperience.svelte:613`, and
  launchpad tiles. The reload is required: public pages boot landing-lite
  (no Firebase/DI, `window.__tkaIsLanding` in app.html ~160) and the
  Firebase-free CI guard must keep passing. Do not turn these into soft
  navigations.
- The boot screen is `#app-loading` in `src/app.html` (markup ~1244, styles
  ~1136-1230, inline boot script ~1300-1560): fixed, `--gradient-cosmic`,
  `pwa/icons/icon-192x192.png` on its white tile with `logo-breathe`, a bar
  driven by a PerformanceObserver over `/_app/` bytes calibrated from
  `localStorage tka-load-bytes`, one status line crossfaded with a minimum
  gap, a German string table, a 15 s safety net, `loaded` class = 400 ms fade
  then `remove()`. Milestones come from `__tkaLoadProgress(percent, message)`
  calls: `+layout.svelte:505` (72 "Starting up..."), `AppShellLoader.svelte:43`
  (84, i18n `app_loading_services`), `MainApplication.svelte` 449/475/486/504
  (88/92/95/100). `after-boot-screen.ts` (Create method previews) waits on the
  `loaded` class, `display:none`, or removal: keep that contract.
- Home hero: `HomeHero.svelte` renders `SequenceHeroDemo.svelte` whose root
  is `.hero-demo` with `.demo-stage` inside. `LaunchpadTile.svelte` already
  uses `view-transition-name` for same-document morphs
  (`named-route-morph-state.svelte.ts`); `app.css:1296` names `tab-content`.
  Do not break either.

## Changes

1. **Cross-document view transition.** Opt both documents in with
   `@view-transition { navigation: auto; }` in a stylesheet both the public
   pages and the app load (the app.html inline `<style>` is the one place
   guaranteed on both sides; put it there with a comment). Reloads (F5) are
   excluded by the platform; soft SvelteKit navigations are untouched.
   - Default: root crossfade, about 350 ms; `prefers-reduced-motion` means
     none.
   - Morph: on the OLD document, in a `pageswap` listener, when the
     destination is `/create` (check `event.activation.entry.url`) and a
     `.hero-demo` (home) or the Composer landing's demo stage is on screen,
     set `view-transition-name: composer-stage` on that element. On the NEW
     document (`pagereveal`), when `event.viewTransition` exists and the
     navigation came from a public page, give the boot screen's centrepiece
     (item 3) the same name. Names are set only in those listeners so no
     other cross-document navigation inherits a stale name. Keep the fixed
     header out of the morph (it just crossfades).
   - Safari and Chrome support this; Firefox falls back to today's blank
     swap. Verify the fallback once by disabling the rule in the browser,
     not by guessing.
2. **Prefetch on intent.** On `pointerenter`, `focus` and `touchstart` of
   every Composer CTA listed above, call SvelteKit's `preloadCode("/create")`
   once per page (it fetches the route's modules into the HTTP cache; after
   the reload they are hits). Put the one helper in
   `src/lib/shared/landing/services/` and reuse it from each CTA; do not copy
   the listener four times. Add `<link rel="modulepreload">` ONLY if
   `preloadCode` demonstrably misses the app entry chunk (measure with the
   network list: count `/_app/immutable/` requests on the reload before and
   after). Report the before/after request count and the bar duration on a
   cold-cache first visit at 1440.
3. **Boot screen rebuild** (all inside app.html so it paints before any JS):
   - Surface: the same cosmic gradient the public pages use, so the
     crossfade is surface-to-surface. Respect the app theme: read whatever
     the app persists for light/dark (find the settings key in
     `settings-state.svelte.ts`; fall back to `prefers-color-scheme`) in the
     inline script and set the light surface when the app will open light.
   - Centrepiece: replace the white icon tile with inline SVG: the TKA
     wordmark as used by SiteHeader (same font treatment; inline the glyph
     paths, or use the webfont only if it is already preloaded for app
     routes, see `app.html:981`) above a diamond grid outline (the four grid
     points and hairline axes, no props). About 96 px tall on phones, 128 px
     on desktop. Keep `logo-breathe`. This element carries `composer-stage`
     on arrival.
   - Bar: keep the byte-calibrated logic untouched. Thinner (3 px), brand
     gradient `#6f8cff` to `#8b6cff`, track at 8 % white, width
     `clamp(200px, 40vw, 360px)`.
   - Copy: delete the six phase strings from the screen. The status line
     shows "Opening Flow Arts Composer" from first paint; after 4 s without
     reaching 100 it crossfades to "Almost there"; the 15 s safety dismiss is
     unchanged. The `__tkaLoadProgress` calls keep their `message` argument
     for the boot profiler and debug log, but the screen no longer renders
     it. German: translate the two strings in the existing inline table; the
     `__tkaBootLocales` list stays. Remove the i18n keys
     `app_loading_services` and `create_ui_resolving_services` only if
     nothing else renders them (`CreateModule.svelte:486` renders the second
     into `initProgress`; check where that shows and leave it if it is a
     visible state inside Create).
   - A11y: `role="progressbar"` and `aria-valuenow` stay; the status line
     gets `aria-live="polite"`.
   - Reduced motion: no breathe, no crossfade, instant dismiss.
4. **Leave alone:** the landing-mode hide (`__tkaIsLanding`), the retro-route
   skip, the 15 s safety net, `after-boot-screen.ts`, the launchpad
   same-document morphs, the Firebase-free public bootstrap.

## Gates and evidence

- `npm run check:fast` in the worktree; Vitest on `tests/unit/landing-*`,
  `tests/unit/homepage-*`, `tests/unit/seo-head-contract.test.ts`, and any
  test that reads `app.html` (`grep -rl "app.html" tests`). The public
  Firebase-free guard must still pass; find it in package.json scripts and
  run it.
- Browser (built-in pane, `mcp__Claude_Browser__*`; load
  `anthropic-skills:built-in-browser` first) on a task-owned Vite server on a
  free non-5173 port rooted in the worktree. The pane reports a 3g
  connection, so the live sky canvas does not load there; that is known.
  - `/` then click the header Composer button at 1440x900 and 390x844:
    record `pagereveal` firing (a console log in the listener is fine during
    verification, remove it after), screenshot the boot screen mid-boot (a
    300 ms `setTimeout` capture right after `pagereveal` is acceptable), and
    the app once open.
  - `/composer` then its CTA, same checks.
  - Boot screen in light theme (set the persisted setting, reload `/create`).
  - Reduced motion: `matchMedia` cannot be forced in the pane; assert the CSS
    rule exists and the JS path checks it.
  - Probe: no element outside the pageswap/pagereveal path carries
    `view-transition-name: composer-stage` after the app opens; the launchpad
    tile morph on `/` to `/learn/concepts` still runs.
- Then from the primary checkout, in PowerShell (Git Bash mangles
  `--route /`): `npm run wt:finish -- codex/composer-handoff --route /`,
  following `.claude/rules/worktree-workflow.md` exactly.

## Hazards

- Worktree: `git worktree add E:/worktrees/tka-platform/composer-handoff -b
codex/composer-handoff main` from `E:/tka-platform`; create the
  `node_modules` junction with PowerShell `New-Item -ItemType Junction` (cmd
  `mklink` misparses under Git Bash); NEVER `pnpm install` inside it. Never
  touch port 5173. Explicit-pathspec commits only. Stop the task server
  before finishing. No push, no deploy.
- app.html is shared by every route. Wrap any script you add so a landing
  page (`__tkaIsLanding`) and the retro routes behave exactly as before;
  re-run the home page probe for `#app-loading` display none.
