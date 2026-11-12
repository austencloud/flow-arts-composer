# Guide Load Speed and Loader — Handoff (2026-11-10)

## Mission

Austen reported two things about the Level 1 hand-motions run
(`/guide/level-1/hm-type1` and its siblings). First (2026-11-02), the layout
shifted while the page loaded. Second (2026-11-10), the page loaded slowly and
showed nothing while it did: "we have this gorgeous mandala loading screen in
the app, but nothing here". This session fixed the shift, made the fitting
step faster, and added a mandala loader to every Guide page that uses
`GuideScreens`. It also rewrote one AI-sounding line he flagged. Everything
is merged to local `main` and not pushed.

## Done — verified

1. **Load jump fixed (2026-11-02).**
   - What changed: the run's first paint no longer shows at the designed size
     and then jumps to the fitted size, and the site chrome's content fade no
     longer replays when hydration lands.
   - Commits: `6ca2ef4b08` (GuideScreens: `.steady.body-head .first` stays
     hidden, and its outro fades from its real opacity) and `bbae5df7cd`
     (MarketingChrome: `in:opaqueFade|global` only after `contentKey`
     changes, through the `navigated` flag).
   - Evidence: `tests/unit/landing-route-morph.test.ts` was updated and passed
     in the wt:finish gate. On 5173 at 1920x1080 the chips held still, the
     screen faded in once at its fitted size, and `/guide` → `/about` still
     fades.
2. **Copy bust (2026-11-10).** Merged as `e340a92894` (commits `6db73fe1cc`
   and `e73dbc8af1`).
   - In `messages/en.json`:
     - `guide_topic_dual_shifts_modes_line` now reads "Hand paths for the six
       modes."
     - `guide_topic_dual_shifts_all_modes_link` now reads "The Timing and
       Direction guide".
   - Evidence: wt:finish gate passed.
3. **Mandala loader and faster fit (2026-11-10).** Commit `303b9eea97`,
   merged as `a39a92914c`.
   - **`GuideLoadingMandala.svelte`** (new, in
     `src/routes/(public)/guide/_components/fit/`):
     - Draws the Overture pool's `zans:original` scene as SSR SVG, using
       smoothed Bezier paths.
     - Colours are `color-mix` of indigo and red with `currentColor`, so it
       reads on dark and white pages.
     - Animation: a dash trace loop, plus a 36 s turn on its own compositor
       layer, so it keeps moving while the main thread is busy.
     - Fades in after 350 ms. Reduced motion shows a static figure that
       breathes.
   - **`GuideScreens.svelte`:**
     - Shows the loader while `waiting = !handedOver && !firstShows`, with an
       `out:opaqueFade`.
     - `<noscript>` hides it.
   - **`GuideFitBox.svelte`:**
     - The search always runs through `fitScaleFromSeedAsync`, seeded first
       from the kept seed, then from the module-level `lastFit`, then from
       `--fit 1`.
     - It stores each landed scale.
   - **`fit-seeds.ts`** with **`fit-seeds.test.ts`** (both new):
     - Keeps scales in localStorage key `guide-fit-seeds`, keyed
       `<pathname>|<contentKey>|<w>x<h>`, holding the 80 newest.
   - Evidence:
     - `npx vitest run "src/routes/(public)/guide/_components/fit"`: 4 files,
       24 tests passed.
     - wt:finish gate (check, check:tsc, spec checks, related tests) passed.
     - Measured with a `--fit` MutationObserver on the task preview and on
       5173. A cold load took 4 probes (1 → 1.407 → 1.569 → 1.612 → 1.611)
       instead of the live site's 10 (1345 → 2238 ms). A reload took 1 probe.
     - Opacity timeline: the loader reached 0.85 by ~1.1 s and faded
       3122 → 3244 ms while the screen faded in 3122 → 3200 ms.
     - Screenshots under 20x CPU throttle showed the loader on
       `hm-type1?screen=2` and on `/guide/level-1/hand-placements`.
     - No console errors.

## Believed done — unverified

- Not checked:
  - a real phone (only desktop viewports);
  - Safari or Firefox: the drop-shadow filter on SVG paths and `pathLength`
    dash animation;
  - a light-themed guide sheet (every page checked was dark).
- Not visually checked on a non-body-head, non-steady guide page (for example
  a Level 2 topic). The code path is the same `waiting` condition.

## In flight

Nothing. The `guide-load-fast` and `run-copy-bust` worktrees were removed by
wt:finish. This handoff's own worktree (`load-handoff`) is removed when it is
merged.

## Loose ends (ranked)

1. **Austen's look.** He has not seen the loader or the copy change yet. The
   delivered link was https://localhost:5173/guide/level-1/hm-type1. He was
   offered the next step below and has not answered.
2. **Split the English catalogue.**
   - The cost: `messages/en.json` (634 KB raw, ~160 KB gzip) ships whole in
     the main client chunk on every page (live chunk `CB5egrcT.js`,
     156 KB compressed).
   - Where it is imported: `src/lib/shared/i18n/i18n.svelte.ts:18` (static
     import) and `i18n-types.ts:6` (types only).
   - This is the biggest remaining cut to code start-up (~1.3 s to mount on
     live desktop, worse on phones).
   - Approach: split by namespace, or load lazily like the regional files at
     `i18n.svelte.ts:383`. It is a cross-app change and needs its own design
     pass.
3. **The other nine locales** still carry the old Dual-Shift line and link
   wording.
4. **The 1.5 s pre-paint long frame** seen in a cold live trace (no script
   attributed, likely style and layout: the page has ~5125 CSS rules). Not
   investigated.

## Decisions already made

- 2026-11-02: a body-head run page's first paint stays hidden. The screen
  fades in once, at its fitted size, under a header that shows at once.
- 2026-11-10: Austen said the old Dual-Shift line ("The six modes of timing
  and direction, shown as hand paths.") was obviously AI-written, so it was
  not his verbatim wording, even though an earlier note recorded it as his
  pick. "Break it down" was left untouched.
- Loader rules from standing feedback:
  - anything waiting on the app keeps visible motion, never freezes, and uses
    no easing that reaches zero speed (the turn is linear and keeps going
    through the trace's hold);
  - Guide words never scale.

## Gotchas

- A first fit now lands inside the seeded search's 97 % fill band, so figures
  can be up to ~3 % smaller than the old bisection's exact edge. This is
  intentional and is the same search page changes already used.
- The 5173 dev server mounts in 4 s or more because modules are unbundled.
  Measure load on the live site or a production build, not on dev.
- In a task preview, Vite's first load reloads once ("optimized dependencies
  changed"), which kills in-page probes. Measure again after it.
- With the DevTools MCP, `emulate` with only `cpuThrottlingRate` can drop the
  viewport emulation. Pass `viewport` again.
- Prettier rewraps GuideScreens' one-line `<h1 class="title">…</h1>`. Keep it
  on one line: the wrapped version adds whitespace inside the heading.
- Loader paths were generated from `static/boot/overture-pool.json`:
  Ramer–Douglas–Peucker simplification at tolerance 1.0, Catmull-Rom to cubic
  Beziers, one decimal. If the pool changes, the loader does not follow
  automatically.
