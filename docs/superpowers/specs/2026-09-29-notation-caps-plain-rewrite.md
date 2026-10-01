# /notation/caps plain rewrite

Date: 2026-09-29. Supersedes the page design in the 2026-07-20 redesign, the
2026-08-01 exhibit redesign and the 2026-08-02 4K density correction.

## Why

Austen withdrew the page from production on 2026-09-29 (commit 9c19cca056)
because it read as vibecoded. He named all four problems:

- generated-sounding copy
- too many widgets (live hero, curve atlas, construction player, assembly figure)
- card and section chrome (kickers, per-section accent colors, boxed panels)
- too long, with the focus spread across eight sections

The page still has three jobs, in Austen's words: canonize what a CAP is,
record where the idea came from, and establish why CAPs are different from
LOOPs.

## Page, top to bottom

One plain reading column in the existing public editorial styles. No hero
banner, no section kickers, no per-section `--accent`, no cards, badges or
colored stripes. Links are LinkChips (no-text-links rule).

1. **Title and one sentence.** H1 "CAPs: Continuous Assembly Patterns" and a
   one-sentence lede saying what the page covers.
2. **What a CAP is.** Damien's definition in plain words: one prop traces a
   cyclic path assembled from two or more elementary patterns and returns to
   its start. Beside it, `CapsAssembly` (the two-color draw-on with Replay;
   already shared with the history archive). Under it, one short paragraph on
   how this CAP is built, replacing the four-bullet breakdown (extension half,
   antispin half, the join, the cycle closing).
3. **Where it came from.** Three short paragraphs, names inline, source chips
   inline:
   - Burning Man 2007: Alien Jon's account of the OMCC group (Noel, Greg,
     Jordan, Zan) pulling apart poi patterns; Damien there with his own
     explorations.
   - Home of Poi 2009: the "What are CAPs?" thread; Alien Jon credits Damien
     with the term; Damien (Zaltymbunk / French_Saltimbanque) sets out the
     O/M/E model, notation and worked examples.
   - 2011 to 2017: Drex documents the definition and C-CAPs, Nick Woolsey
     teaches Capped Antispin Patterns on PlayPoi, Drex's eight-step lesson
     credits Charlie's 9-Square Theory.
4. **CAPs and LOOPs.** Two short paragraphs: a CAP builds one prop's path from
   elementary curves; a LOOP is a word of Kinetic Alphabet letters, each
   letter recording both hands, that returns to its start. Beside them, a
   side-by-side: `YutaCapLiveDemo` (one prop tracing the CAP) and
   `SequenceHeroDemo` with `NOTATION_LOOP_TEASER_SEQUENCE` (the Rotated LOOP
   the LOOPs page uses). The /notation/loops page is also gated, so the chip
   points to the Level 1 guide's LOOPs page (`/guide/level-1/permutations`).
   The old guide called LOOPs "CAPs" (guide-manifest.ts comments); the draft
   may say so in one sentence, flagged for Austen to confirm.
5. **Sources.** One row of chips: the Home of Poi thread, The Math of CAPs
   (DrexFactor), the Tech Poi Blog, C-CAP, PlayPoi, eight-step and 9-Square
   lessons from the current video list. The Robert Ferréol / mathcurve.com
   credit stays as one line only if the page still shows a curve derived from
   his illustrations; with the atlas gone it is dropped.

Keep the Article and BreadcrumbList JSON-LD, with the description rewritten to
match the page (no "mathematics" or "reconstructed curves" once the atlas is
gone).

## Copy

Claude drafts everything from the current page's facts and the linked
sources, adding no new claims. Austen marks it up before the gate lifts. The
cirque-aflame writing rules apply: no em dashes, no superlatives, no stock
transitions, plain sentences of varied length.

## Deleted

- `CapsHub.svelte`, `CurveAtlas.svelte`, `FocusedConstruction.svelte`,
  `construction/*` (Stage, Rail, Transport, Provenance), the video grid and
  `MODERN_MEDIA`, and the page's per-section CSS for them.
- The `?tune` rig inside `YutaCapLiveDemo` (its values are already hardcoded
  as the shipped defaults).

Kept: `CapsAssembly.svelte`, `yuta-cap-sequence.ts`, `YutaCapLiveDemo.svelte`.
`@caps/domain` loses its last page consumer; the package and its test stay
for now and are flagged as a follow-up, not removed in this change.

## Gate and tests

- The production gate (`+page.server.ts`), the sitemap omission and the
  missing nav entry all stay. Lifting the gate is a separate change after
  Austen approves the copy.
- `withdrawn-public-pages-contract` keeps passing; its preserve check for
  "Continuous Assembly Patterns" still holds.
- Add a small source-shape test that the page imports none of the deleted
  components and has no `section-kicker` or inline `--accent` styles.

## Verification

Dev server from the worktree on a free port (never 5173). Headless Chrome at
1440x900 and 375x812: no text links, no horizontal overflow, both animations
render, chips readable. Screenshots critiqued before showing Austen, then a
link for his copy pass.
