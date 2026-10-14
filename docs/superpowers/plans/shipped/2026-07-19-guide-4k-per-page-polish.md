# Guide 4K Per-Page Polish Plan

**Date:** 2026-07-19
**Context:** The lockstep scaling system shipped (spec
`2026-07-19-guide-4k-lockstep-design.md`, commit ff1d5ad8a5). A full 39-page
audit at emulated 3840x2160 followed. Austen's directive: every page gets a
careful eye, one by one; pages that are lovely get left alone.
**Verification budget note:** machine RAM is tight. Executors make file edits
only - NO vite servers, NO svelte-check, NO builds (per
feedback_no_heavy_checks_in_subagents). Browser verification happens batched at
the end from the main session via the already-running chrome-devtools MCP.

## Shared fixes (each unlocks multiple pages)

### A. Sheet upscale — the codex fix [AGENT-1]
`src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte:79`
caps fit-to-width at `Math.min(1, wrap/816)`. At 4K the 816px print sheet
floats tiny in the dark canvas (codex, codex-2, and the sheet toggle on every
topic page).
- Remove the 1 cap; clamp to `Math.min(wrap.clientWidth / 816, 1.9)`.
- Reserve the scaled footprint: bind the sheet-wrap (or a spacer) height to
  `1056 * scale` px so upscaling does not overlap the topic-nav below
  (transform does not affect layout; today the reserved box is the unscaled
  1056px).
- `/guide/codex/+page.svelte` stacks CodexSheet artboards the same way -
  apply the same scale-to-fit treatment there (it currently has no scaling at
  all; sheets render at fixed size, centered).

### B. pic-card letterbox fix [AGENT-1]
`src/routes/(public)/guide/level-1/_components/FlowFrame.svelte` `.pic-card`
renders wider than its square pictograph in flow-grids, leaving gray side
bands inside cards (visible: hm-type56 statics, lt2-wxyz, lt3-dash-letters,
lt456 pair cards). Give the card `aspect-ratio: 1` (or size it to the square
content) so the frame hugs the pictograph.

### C. flow width caps ride the ramp [AGENT-1]
In FlowFrame.svelte, at `@media (min-width: 1680px)`:
- `.flow-grid` max-width 30rem -> 40rem (4-cell grids currently 720px in a
  1488px frame)
- `.flow-grid-figure` max-width 18rem -> 24rem (the-grid's diamond/box/8pt
  squares)
- `.flow-figure` max-width 15rem -> 20rem
Keep base (sub-1680) values untouched.

### D. Pictograph hydration speed [INVESTIGATE - separate session]
permutations + reversals sit with empty cells ~4-6s before SVGs paint
(verified: 18/18 painted after 6s wait). Likely the motion-data/dataframe
import chain. Investigate lazy-chunk preloading on route entry. Layout is
fine; this is the thing a visitor would call broken.

### E. Definition litany grid [NEEDS AUSTEN'S EYE]
hand-motions renders six one-line term definitions (Dual-Shift, Shift,
Cross-Shift, Dash, Dual-Dash, Static) as a tall single column with heavy air.
Proposal: a definition-grid block (2-3 columns at >=1680px) in the
guide-content block pipeline. Touches content structure
(`_data/guide-content.ts` + FlowFrame block kinds) - do not build without
visual sign-off on a mock first.

## Per-page verdicts (39 pages)

Legend: LOVELY = leave alone. Letters reference shared fixes above.

| # | Page | Verdict / work |
|---|---|---|
| 1 | /guide (hub) | LOVELY |
| 2 | the-grid | C (bigger grid squares). OPTIONAL: 3-up row for diamond/box/8pt at wide - discuss |
| 3 | hand-positions | C only |
| 4 | hand-motions | E (litany), else lovely |
| 5 | hm-type1 | LOVELY |
| 6 | hm-gamma | LOVELY |
| 7 | hm-type2 | LOVELY |
| 8 | hm-type34 | LOVELY |
| 9 | hm-type56 | B (letterbox statics) |
| 10 | staff-positions | LOVELY |
| 11 | staff-motions | LOVELY (cells slow to paint - D applies) |
| 12 | negative-space | LOVELY |
| 13 | base-letters | LOVELY |
| 14 | codex | A |
| 15 | codex-2 | A |
| 16 | lt1-abc-ghi | LOVELY |
| 17 | lt1-dj-ek-fl | LOVELY |
| 18 | lt1-mp-nq-or-stuv | LOVELY |
| 19 | lt1-gamma-words | OPTIONAL: 2-up packing of the 5 identical stanzas at >=2200px - discuss with E |
| 20 | lt2-wxyz | B |
| 21 | lt3-dash-letters | B |
| 22 | lt456-phi-psi-lambda | B |
| 23 | words | LOVELY |
| 24 | permutations (LOOPs) | D |
| 25 | reversals | D |
| 26 | examples-abc | LOVELY |
| 27 | examples-cccc | LOVELY |
| 28 | examples-acac | LOVELY |
| 29 | misc-permutations | sibling of 24; D inherits |
| 30 | gamma-loops | sibling; inherits shared fixes |
| 31 | type2-loops | sibling; inherits |
| 32 | sixteen-count | sibling; inherits |
| 33 | eight-letter-words | sibling; inherits |
| 34 | prop-reversal-loops | sibling; inherits |
| 35 | full-reversal-loops | sibling; inherits |
| 36 | level-2 landing | LOVELY (rebuilt this session) |
| 37 | level-2/turns | LOVELY at 4K. Separate known issue: ~32px mobile overflow from showcase-wrap at 390px (pre-existing, phone-scope) |
| 38 | level-2/double-turns | sibling of 37 |
| 39 | /guide/codex (standalone) | A. (codex/parity + codex/poster are dev tools - out of scope) |

## Execution order

1. [x] AGENT-1: fixes A + B + C (commit 15986ae7dd + corrections commit).
       Corrections found in review/verification: (a) fix B's real cause is
       guide.css's size-class width/height on .pictograph-wrapper beating the
       component's width:100% - aspect-ratio on .pic-card alone leaves the
       bands; the wrapper must fill the card. (b) sheet fit must measure the
       content box, not clientWidth (padding overflow + shift-while-clamped
       sliver). (c) codex standalone needed max-width:100% + clamped shift or
       narrow viewports keep a phantom h-scroll. (d) NEW BUG: fit lived in
       onMount, so flow pages toggled to "Page" never fitted (sheetWrap binds
       after mount) - moved to an $effect keyed on the bind.
2. [x] Batched browser verification at 3840 + 1366 done (2026-07-19, live DOM
       measurements): all checklist items pass except "70-90% of content
       track", which is unreachable by construction - the plan's own 1.9x
       crisp cap yields 816*1.9=1550px, ~58% of the 4K content track. Cap wins;
       revisit only if Austen wants a higher cap.
3. [ ] D investigation (fresh session)
4. [ ] E + optionals (2, 19) after Austen's visual sign-off
5. [ ] Mobile overflow on 37 (separate phone-scope pass)

## Verification checklist for step 2

- Codex sheet fills ~70-90% of the content track at 3840, no overlap with
  the nav below, crisp at 1.9x
- No gray bands inside pic-cards on hm-type56 / lt2-wxyz
- the-grid squares ~576px at 3840; still 288px at 1366 (unchanged below 1680)
- 1366 renders byte-identical to pre-change on a LOVELY page (words)
