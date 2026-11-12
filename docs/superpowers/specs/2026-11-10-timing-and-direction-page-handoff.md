# Timing and Direction Page — Handoff (2026-11-10)

From the "Hand Motions" session to Grid Point Arrows, which Austen made the
permanent learning assistant on 2026-11-10 (guide, interactive lessons, and
the learning pages around them).

## Mission

`/timing-and-direction` is the one public page for the six hand-motion modes:
Split, Together and Quarter timing, each with the same or opposite direction.
A visitor picks a mode, watches it move, reads what it is, and sees sequences
that use it. The page replaced six separate mode pages (2026-10-31). Austen
roasted it on 2026-11-08 and asked for a rebuild, which shipped to local main.
After seeing it he said "I like the page. It's good." The visitor funnel ledger
is `docs/reports/visitor-funnel-2026-10-23.md`, and the memory note is
`project_visitor_funnel.md`.

## Done — verified

- **One page for all six modes**, with old `?mode=` addresses redirecting at
  request time: `81b24064d4`, `aaeb53947e`, `3a32846b75`, `ba9fa92b30`
  (2026-10-31). These are in the live 11-08 snapshot.
- **Rebuild after the roast** (`1d9ee5bd09`): one picker grid with names and no
  codes. The basics panel stays in sync with the grid. The big duplicate
  preview is gone, the player sits under the grid, Turns and Transform sit
  behind an "Adjust" button, and the page no longer loads the wrong mode.
  It is on local main, not pushed.
- **Six modes in one row on wide screens** (`aa0d44095f`, 2026-11-08, merged
  via `wt:finish --route /timing-and-direction`). From 760×600 up, "Same
  direction" spans the left three tiles and "Opposite direction" the right
  three, with each tile's timing label above it. Phones and short landscape
  keep the 2×3 grid. Evidence:
  - DOM measurements on 5173: at 1440×900 the grid is 1179×154 and each tile
    187×104, with the library ending at y=884. At 768×1024 it ends at 1008.
    375×812 has no horizontal scroll, and 812×375 uses 2×3 in its 288px
    column.
  - Clicking a tile syncs the title, URL and basics, with no console errors.
  - The ssr-guards and state tests passed 6/6, and Prettier is clean.
  - The wt:finish gate passed, with tsc reporting 0 errors in src/ and tests/.
  - Austen has not looked at the one-row version yet.

## Believed done — unverified

- Austen hasn't looked at the one-row layout. Ask him once he has seen it.
- On a cold load of `?mode=quarter-time-opposite-direction`, the prerendered
  default (Together/Same) shows as pressed until hydration. After that,
  `afterNavigate` selects the right tile. This predates the rebuild. It is not
  measured on a slow phone.

## In flight

- No uncommitted work from this session. The `td-handoff` worktree only holds
  this doc.
- **`codex/guide-composer-door`** in `E:/worktrees/tka-platform/guide-door`
  (19 commits ahead of main; tip `79c95f6529`) adds an "Open in Composer" door
  at the end of guide topics, and the guide viewer takeover and morph. Its
  only uncommitted change is
  `M docs/reports/visitor-funnel-2026-10-23.md`, which I believe is the ledger
  note for this branch. Check its diff before committing. Austen's look is
  owed, and the German keys need filling before `wt:finish`.
- `codex/guide-screen-counter` in `E:/worktrees/tka-platform/guide-screen-counter`
  (`fabcb45ad3`) is not mine. Ask whoever owns it before touching it.

## Loose ends (ranked)

1. **Get Austen's look at the one-row picker** on
   https://localhost:5173/timing-and-direction?mode=quarter-time-opposite-direction#mode-sequences.
2. **Fix the guide's link copy.** "Open the {mode} guide" used to open a
   separate page; it now opens a section of the one T&D page. The links come
   from `src/lib/shared/guide-topics/dual-shifts-topic.ts` and
   `src/lib/features/learn/components/interactive/motions/TimingDirectionConceptExperience.svelte`
   (and `src/routes/(public)/tricks/_data/trick-names.ts`). Commits
   `e73dbc8af1` and `6db73fe1cc` already renamed the Dual-Shift one, so check
   what is left.
3. **Finish the guide-door branch:** Austen's look, then the German keys, then
   merge main in, then `npm run wt:finish -- codex/guide-composer-door --route <guide route>`.
4. **Push.** Nothing is pushed. A ship means all of local main, via
   `node scripts/push-public.mjs`, and only after Austen says yes.

## Decisions already made

- 2026-11-08: Austen chose one picker grid, names instead of codes, no big
  preview, the player under the grid, and Adjust hiding Turns and Transform
  ("Yes, rebuild it").
- 2026-11-08: Austen asked for the six modes to spread across the header in one
  row split into two sections, instead of a 3×2 grid with empty space around
  it. Phones keep 2×3 because six tiles at 375px would be about 50px each.
- Standing rules:
  - No short codes in human labels (`feedback_codes_stay_in_urls.md`).
  - Every layout change animates.
  - Visual questions get lettered mocks.
  - Guide words never scale with the window.

## Gotchas

- `--grid-h`, `--head-h` and `--fit-h` are declared on `.mode-page`, which is
  also the container. A container query can't restyle the container itself, so
  `TimingDirectionModeExplorer.svelte` switches `--grid-h` with the same media
  query as the grid (`(min-width: 760px) and (min-height: 600px)`). Change one
  breakpoint and you must change the other.
- In `TimingDirectionModeGrid.svelte`, the narrow rules `.direction-label.d0`
  and `.d1` (0,2,0) beat a bare `.direction-label` in the wide block. Wide
  rules must name `.d0` and `.d1` as well.
- Svelte trims leading whitespace in element content, so the label uses
  `{" direction"}`. A literal " direction" renders as "Samedirection".
- `wt:finish` refuses a branch that doesn't contain current local main. Merge
  main into the branch first. Run it from pwsh in `E:/tka-platform`.
- In the in-app browser, Austen's own tab is "seed". Don't touch it. Use your
  own tab and reset `resize_window` to desktop afterwards.
