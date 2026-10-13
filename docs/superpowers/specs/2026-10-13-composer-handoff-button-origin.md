# Composer handoff, round 2: the pressed button becomes the boot capsule

Date: 2026-10-13. Author: Fable (design). Implementer: Opus.
Commit this file into the task worktree as
`docs/superpowers/specs/2026-10-13-composer-handoff-button-origin.md`.
Supersedes the morph and centrepiece parts of
`docs/superpowers/specs/2026-10-13-composer-handoff.md`; its prefetch, boot
bar logic, theme surface, copy, safety net and hazards all stand.

## Austen's decision (do not re-litigate)

Round 1 morphed the home hero (left of screen) into an invented TKA wordmark
over a diamond grid. He rejected both: he was looking at the button he
pressed, not the hero, and the grid meant nothing. Approved direction, his
words "that sounds nice, go for it":

- The element the visitor actually pressed is the only thing that moves. It
  lifts, travels to the centre of the screen and lands as the boot capsule.
  The page it came from recedes behind it (fade plus a slight scale-down).
  The header goes with the page.
- The capsule is the same pill: same brand gradient, same radius, label
  "Opening Flow Arts Composer" (tense change; the crossfade of the two
  snapshots makes "Open" become "Opening"). The real byte-calibrated
  progress fills the pill itself from the left. "Almost there" after 4 s
  stays. No wordmark, no grid, no separate bar, nothing else on the screen.
- Works from every Composer link: header desktop `.cta`, header
  `.compact-cta`, footer `.composer-cta`, footer sign-in (`/create?sheet=auth`),
  Composer landing `.primary-action.open-app`. Never a sibling, never the hero.
- Instrumented, so quality is measured rather than eyeballed (section 4).
- Firefox keeps the plain swap. Reduced motion keeps today's behaviour:
  `skipTransition()` on both sides and `navigation: none`.

## 1. What exists (read these before editing)

- `src/app.html` ~160-265: the handoff script (`KEY = "tka-composer-handoff"`,
  `NAME = "composer-stage"`, click-capture `lastHref`, `pageswap` names the
  on-screen `.hero-demo`, `pagereveal` names `#boot-mark`). ~1220-1250: the
  `@view-transition { navigation: auto; types: tka-page }` block and the
  `composer-stage` timing rules. ~1277: `<link rel="expect" href="#boot-mark"
blocking="render">`. ~1284-1510: boot screen styles (`#app-loading`, light
  surface, `#boot-mark`, `.loading-bar-track`, `.loading-bar-fill`,
  `#app-loading p`, reduced motion). ~1529-1575: boot markup (`#app-loading`
  role=progressbar, the `#boot-mark` SVG, `.loading-bar-track >
#loading-bar-fill`, `p#loading-text[aria-live]`). ~1580 onward: the boot
  script (`__tkaFinished`, byte observer, `__tkaLoadProgress`, the two
  strings and the German table, 4 s "Almost there", 15 s safety net, `loaded`
  class then `remove()`).
- The CTAs: `src/lib/shared/landing/components/SiteHeader.svelte` ~494 (`.cta`)
  and ~512 (`.compact-cta` with three label spans), `SiteFooter.svelte` ~119
  (`.composer-cta`) and ~166 (sign-in), `src/routes/(public)/composer/_components/ComposerExperience.svelte`
  ~611 (`.primary-action.open-app`). All are `<a href="/create"
data-sveltekit-reload use:composerIntent>`. Keep them full reloads; the
  Firebase-free public guard depends on it.
- Tests: `tests/unit/landing-composer-handoff.test.ts` (JSDOM runs the
  handoff script and the loading script; rewrite its morph cases for the new
  contract), plus `grep -rl "boot-mark\|composer-stage\|app.html" tests` for
  anything else that names the old centrepiece.
- `after-boot-screen.ts` (Create method previews) waits on the `loaded`
  class, `display:none`, or removal of `#app-loading`. Keep that contract.

## 2. The old document (`pageswap`)

- Capture the activated link element, not just its href: in the capturing
  click listener store `lastLink = event.target.closest("a[href]")`. Keyboard
  Enter on a focused link fires click too, so it is covered.
- Morph condition: a view transition exists, `__tkaIsLanding`, not reduced
  motion, destination pathname is `/create` (from `event.activation.entry.url`,
  falling back to `lastLink.href`), AND `lastLink` exists with that same
  pathname and is on screen. If any of these fail, fall back to the plain
  root crossfade and write mode `fade`. Drop the `.hero-demo` lookup entirely.
- Name the link `composer-cta` (rename `NAME`; the old name must not survive
  anywhere, tests included). Add the type `tka-handoff` to
  `event.viewTransition.types` so CSS can scope the recede to this one case.
- Write to sessionStorage (same `KEY`) a small JSON instead of a bare string:
  `{ mode: "morph" | "fade", at: Date.now(), source: { x, y, w, h,
vw, vh } }` with the link's viewport rect. Keep `clearName()` on both
  listeners and on back/forward-cache reveal exactly as today.

## 3. The new document

### Markup (inside `#app-loading`, replacing the SVG and bar)

```html
<div id="boot-capsule" class="boot-capsule">
  <div class="boot-capsule-fill" id="loading-bar-fill"></div>
  <span class="boot-capsule-label" id="loading-text" aria-live="polite"></span>
</div>
```

Keep the ids `loading-bar-fill` and `loading-text` so the byte logic, the
string table, the 4 s step and the tests keep their hooks; `#loading-text`
changes from `<p>` to `<span>` and the selector `#app-loading p` moves to
`.boot-capsule-label`. `role="progressbar"` and `aria-valuenow` stay on
`#app-loading`. Change `<link rel="expect" href="#boot-mark">` to
`#boot-capsule`.

### Style

- `.boot-capsule`: `position: relative; overflow: hidden; display: inline-flex;
align-items: center; justify-content: center; width: max-content;
min-width: 240px; max-width: min(360px, 88vw); height: 48px; padding: 0
24px; border-radius: 999px;` track background `rgba(255,255,255,0.10)`,
  `box-shadow: 0 0 0 1px rgba(255,255,255,0.16), 0 18px 40px rgba(0,0,0,0.35)`
  (the "lifted" sense), `white-space: nowrap`. Mirror the header `.cta`
  pill's font treatment (read it in SiteHeader; system font stack is fine,
  the morph crossfade absorbs small font differences). Replace `logo-breathe`
  with nothing: the fill moving is the life of the screen. Reduced motion:
  no transitions, as now.
- `.boot-capsule-fill`: `position: absolute; inset: 0; right: auto; width: 5%;
background: linear-gradient(90deg, #6f8cff, #8b6cff); transition: width 500ms
cubic-bezier(0.4,0,0.2,1)`. The script already drives its `width`.
- `.boot-capsule-label`: `position: relative; z-index: 1; color: #fff;
font-size: 14px; font-weight: 600; letter-spacing: 0.01em; transition:
opacity 200ms` (the script's crossfade to "Almost there" uses this).
- Light surface (`#app-loading[data-surface="light"]`): keep the label white
  and tint the track `rgba(79,107,239,0.45)` so white stays legible over the
  unfilled part. Check contrast of white on both track and fill at 14 px 600
  in both surfaces and report the ratios.

### `pagereveal`

Read the JSON; if `mode === "morph"`, a view transition exists, not reduced
motion, and `#app-loading` is not `display:none`: name `#boot-capsule`
`composer-cta`, add type `tka-handoff`, clear the name on `finished` as now.
Also run the instrumentation in section 4 for both `morph` and `fade`.

### Transition CSS (replace the `composer-stage` rules)

```css
html:active-view-transition-type(tka-handoff)::view-transition-old(root) {
  animation: tka-recede 350ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
html:active-view-transition-type(tka-handoff)::view-transition-new(root) {
  animation: tka-arrive 350ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes tka-recede {
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}
@keyframes tka-arrive {
  from {
    opacity: 0;
  }
}
::view-transition-group(composer-cta) {
  animation-duration: 420ms;
  animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
}
::view-transition-old(composer-cta),
::view-transition-new(composer-cta) {
  animation-duration: 260ms;
  /* Both pills are opaque: a normal crossfade avoids plus-lighter bloom. */
  mix-blend-mode: normal;
}
```

Keep the group's auto-generated geometry animation (it is what carries the
pill from the button's box to the capsule's box); never override its
keyframes. Tune the durations if the slow-motion frames (section 4) show the
pill arriving before the page has receded or vice versa; the pill should
land as the new page finishes fading in. The generic `tka-page` 350 ms root
rule stays for other cross-document navigations.

Slow-motion knob for verification only: all four durations above read
`calc(<ms> * var(--tka-handoff-slow, 1))`, and the pagereveal/pageswap
listeners set `document.documentElement.style.setProperty("--tka-handoff-slow",
v)` when `localStorage["tka-handoff-slow"]` holds a number. No UI, no
logging, harmless in production.

## 4. Instrumentation (ships; it is tiny and silent)

In `pagereveal`, for every arrival with a handoff record:

- `performance.mark("tka:handoff:reveal")`; on `viewTransition.ready`
  `performance.mark("tka:handoff:ready")`; on `finished`
  `performance.mark("tka:handoff:finished")` and
  `performance.measure("tka:handoff", "tka:handoff:reveal", "tka:handoff:finished")`.
- Expose `window.__tkaHandoff = { mode, swapToRevealMs: Date.now() - at,
source, target }` where `target` is `#boot-capsule`'s rect at reveal
  (`vw`/`vh` included so the probe can compare across viewports). Fill
  `readyMs`/`finishedMs` from the marks when they land. Nothing is logged.

Verification (Chrome DevTools MCP, a headed Chrome; the hidden built-in pane
cannot run cross-document transitions). Task-owned Vite server rooted in the
worktree on a free non-5173 port; a `wrangler pages dev` build for the
cold-cache numbers as round 1 did. For each of: home header `.cta` at
1440x900, home `.compact-cta` at 390x844, `/composer` `.open-app` at 1440,
footer `.composer-cta` at 1440 (scroll to it first):

1. Click, wait for the app, read `window.__tkaHandoff` and
   `performance.getEntriesByName("tka:handoff")`. Report mode, swap-to-reveal
   ms, ready and finished ms, source and target rects. Expect mode `morph`,
   `finished` within about 380 to 520 ms of reveal at 1x, and source equal
   to the pressed element's rect (confirm against `getBoundingClientRect` of
   that element before the click).
2. With `localStorage["tka-handoff-slow"] = 8` set on the public page, click
   again and take six screenshots across the stretched transition. Assemble
   a single frame strip (`scratchpad/handoff-shots/strip-<case>.png`; stitch
   with any available tool, ImageMagick or a tiny node script with the
   repo's image deps) so Austen can see the pill travelling from the button
   to centre and the page receding. The mid frames must show the pill
   between source and target, not a crossfade in place.
3. Run a DevTools performance trace around one 1x click at 1440 and report
   long frames or long tasks during the transition window from the insight
   output. If a long task overlaps the transition, say so and what it was.
4. Probe after the app opens: no element in either document carries
   `view-transition-name: composer-cta`; the launchpad same-document morph on
   `/` to `/learn/concepts` still runs; `/` still hides `#app-loading`
   (`display: none`) in landing mode; a direct load of `/create` (no handoff
   record) shows the capsule with no transition and `__tkaHandoff` absent.
5. Light surface shot once (force `data-surface="light"` as round 1 did).
6. Reduced motion: assert the CSS and both JS paths, as in round 1.

Remove nothing from the instrumentation after verifying; it is the contract.

## 5. Gates

- Vitest: `tests/unit/landing-composer-handoff.test.ts` rewritten for
  `composer-cta`, the JSON record, the capsule target, the instrumentation
  (`__tkaHandoff` present on a morph arrival, absent on a direct load), and
  the two strings; `tests/unit/startup-splash-handoff.test.ts`,
  `tests/unit/german-catalog-contract.test.ts`, `tests/unit/landing-*`,
  `tests/unit/homepage-*`, `tests/unit/seo-head-contract.test.ts`, and the
  public Firebase-free guard (`verify:public-firebase` in package.json).
- `npm run check:fast` in the worktree.
- Prettier on committed content via `git show <sha>:path | npx prettier
--stdin-filepath path --check` from the primary (worktree CRLF false
  positives).
- Then from `E:/tka-platform` in PowerShell (Git Bash mangles `--route /`):
  `npm run wt:finish -- codex/handoff-button-origin --route /`, following
  `.claude/rules/worktree-workflow.md`. No push, no deploy.

## 6. Hazards (unchanged from round 1)

- Worktree: `git worktree add E:/worktrees/tka-platform/handoff-button -b
codex/handoff-button-origin main` from `E:/tka-platform`; make the
  `node_modules` junction with PowerShell `New-Item -ItemType Junction` (cmd
  `mklink` misparses under Git Bash); NEVER `pnpm install` inside it. Never
  touch port 5173. Explicit-pathspec commits only (`git commit -m ... --
paths`). Stop task servers before finishing. No push, no deploy.
- `app.html` is shared by every route: landing mode and the retro routes must
  behave exactly as before.
- Do not reintroduce any centrepiece, logo, or grid. The screen is the
  gradient surface and the capsule, nothing else.

## 7. Report back

Short: commits, gate summary lines, the instrumentation table from section 4
(four cases), the frame strips' paths, light shot path, deviations from this
spec with reasons, and the merge result. Do not restate the brief.
