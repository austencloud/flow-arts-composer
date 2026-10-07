---
status: backlog
value: 3
effort: M
remaining: Pilot (permutations) shipped; pools for the remaining guide pages still unbuilt.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: in-progress
---

# Guide Example Pools — curated refreshable examples (2026-07-16)

**Decision (Austen, 2026-07-16):** the Level-1 guide's print-era examples were
frozen at 1–3 per concept because of printing constraints, not pedagogy. For
pages whose examples are ARBITRARY instances of a general pattern, replace the
frozen set with a **curated pool**: N pre-generated, pre-verified examples per
showcase slot, each with explanation prose written FOR that specific example.
The reader cycles the pool ("show another example"). No live generation in the
guide — live "make your own" belongs to a composer handoff, not inline.

**Voice:** prose is drafted by Claude (Fable), grounded in the generated step
data + MCP verification, then curated/edited by Austen. Austen: *"I would trust
you to write this because you're Fable... go ahead and draft them."* This
amends the per-file "Austen's words — never AI-written" comment for POOL
entries only; original print prose stays his verbatim.

**SEO / page weight (Austen: "I'd love to maximize SEO but page weight is a
problem... prerendering the current default example fully probably makes
sense"):** per slot, the DEFAULT pool entry prerenders fully (strip cells +
aria-labels + prose, exactly like today). Non-default entries ship as baked
JSON rendered client-side on cycle, with their describePictograph descriptions
+ prose kept crawlable in the prerendered HTML (sr-only / non-visual block —
text is what crawlers rank; duplicate SVG strips are weight without ranking
value).

## Page classification (audited 2026-07-16)

**Pinned — the example IS the point; never pooled:** examples-abc,
examples-acac, examples-cccc, lt1-abc-ghi, lt1-dj-ek-fl, lt1-gamma-words,
lt1-mp-nq-or-stuv, lt2-wxyz, lt3-dash-letters, lt456-phi-psi-lambda,
reversals (its 2–3 step demos isolate exactly one reversal type each).

**Refreshable — arbitrary instance of a general pattern (9 pages):**
permutations, misc-permutations, type2-loops, gamma-loops,
prop-reversal-loops, full-reversal-loops, eight-letter-words, sixteen-count,
words (confirm on read). Each has a constraint signature (e.g. "rotated LOOP
through Type 2 letters", "word containing prop reversals") = the generation
spec for its pool.

## Pool entry lifecycle

1. Generate candidates via MCP `generate_sequence` (loopType/constraints per
   slot signature, level 1, smooth). Save the returned step JSON to the pilot
   data file in the same turn. Known engine quirk (2026-07-16): the random
   start draw can pick a start whose natural end position fails the loop
   closure ("Position pair X → Y not valid for Z LOOP") — and for some words
   it fails the SAME way every attempt. Fix: probe `validate_loop_options`
   for a closure-valid pair, then force `startPosition` + `endPosition`.
2. Mechanical verification: loop structure from the returned step data
   (rotation slice positions, direction inversions, role swaps); reversal
   marks derived by `bakeReversals`, never hand-claimed in prose without a
   matching mark in the data.
3. Claude drafts prose (guide voice: one concept sentence + one
   example-specific sentence; NEVER the word "turns" for loop rotation —
   "rotated 180°/90°", per tka-domain rule).
4. Austen curates: keep / cut / edit prose.
5. Kept entries bake into the pool file; the slot's original print example
   remains the default entry.

## Build shape (to spec in detail after pilot approval)

- Pool data: MCP sequence JSON → adapter StepData strips via a build script
  (replaces per-page hand-authored `st()` blocks for pooled slots only).
  **Nomenclature bridge (2026-07-16 beat→step rename):** the MCP
  `generate_sequence` response still keys each step as `beat`
  (`mcp-server/src/tools/sequence-tools.ts` — frozen until the mcp-server phase
  of `2026-07-16-beat-to-step-nomenclature-design.md` lands). The pilot data
  file here has already been renamed to `step` keys, so the future build script
  MUST map the MCP `beat` key → `step` when it ingests raw MCP output, until the
  server emits `step`. Do not assume the wire key matches the on-disk pool key.
- `SequenceShowcase` gains a cycle affordance. Constraints: crossfade rules
  (strips are heavy/variable-height — no naive `{#key}` remount;
  no-layout-shift: reserve max strip height across the pool), button-styled
  control, 44px target.

## Ledger

- [x] Direction approved (curated pool, prerender-default, Fable-drafted prose)
- [x] Page classification
- [x] Pilot candidate generation — permutations page (Mirrored/Rotated/Swapped),
      two rounds, 12 shortlisted (4 per slot), prose drafted + verified per step
- [x] Engine loop-closure failure dispatched for root-cause + fix spec (Opus
      side agent, 2026-07-16) — repro: CΣVX rotated, ΔZΩX / UYFΘ- swapped fail
      deterministically without forced start/end positions
- [x] Pilot slate PERSISTED — `2026-07-16-guide-example-pools-pilot-data.json`
      (regenerated 2026-07-16 after the first session's step data was lost with
      its context; prose re-verified step-by-step against the new instances —
      GΘSZ and CΣVX prose colors swapped to match). Standing rule from the
      incident: pool candidates are saved to disk AT GENERATION TIME, never
      held only in conversation context.
- [x] Pilot format APPROVED (Austen, 2026-07-16: "I really like how this
      turned out"). Detailed keep/cut/edit pass per candidate still open.
- [x] Pool file format + adapter shipped with the pilot
      (`permutations.pool.json` + `pool-adapter.ts`)
- [x] SequenceShowcase cycle affordance shipped with the pilot
- [x] Full-guide slot-level audit + rollout plan →
      `2026-07-16-guide-example-pools-rollout.md` (22 remaining slots, all
      level-1; waves 1-4, capability probes, adapter generalization)
- [ ] Remaining pages' pools: execute per the rollout spec's wave plan
- [x] words.content.ts classification confirmed (2026-07-16): REFRESHABLE, but a
      special shape — its three card blocks are one arbitrary word ("We'll use
      the word AABB as an example") in three starting orientations, so a pool
      entry is a COORDINATED TRIPLE (one word × three orientation variants via
      the MCP blueStartOrientation/redStartOrientation overrides) that swaps all
      three strips + prose together. Defer to its own phase after the
      single-slot pattern ships; do not shoehorn into the per-slot pool.
- [ ] Commit (Austen's call, scoped pathspec)

## Related

- `docs/superpowers/specs/2026-07-16-sequence-showcase-design.md` (the display
  surface these pools feed)
- `.claude/rules/sequence-generation.md`, `.claude/rules/tka-domain.md`
- Memory: `feedback_guide_showcase_unique_eyes`
