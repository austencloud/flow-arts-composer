---
status: backlog
value: 3
effort: M
remaining: 'Wave 1 shipped (gamma-loops, misc-permutations, type2-loops). Waves 2-4 have no pool files: prop-reversal-loops, full-reversal-loops, eight-letter-words, sixteen-count, coordinated-triple.'
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: in-progress
---

# Guide Example Pools — full rollout (2026-07-16)

**Triage evidence (2026-10-07):** Four Level 1 pool JSON files exist under `src/routes/(public)/guide/level-1/_data/example-pools/`, matching the recorded Wave 1 pilot. The later named pools remain unbuilt according to the spec and need current source confirmation before scheduling.

> **DRIFT WARNING — 2026-08-02.** Verified 2026-08-02. Wave 1 shipped — exactly four pool files exist (permutations pilot + gamma-loops, misc-permutations, type2-loops). Waves 2-4 are genuinely unbuilt: no pool file for prop-reversal-loops, full-reversal-loops, eight-letter-words, sixteen-count, or coordinated-triple. The spec is accurate; the detector reads neighbouring guide/landing traffic as progress.
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state.


**Status:** Wave 1 implemented; Waves 2–4 remain open. Pilot approved (Austen, 2026-07-16: "I really like how this turned
out" on the permutations page). This spec is the anticipated detail phase the
design spec deferred ("Build shape (to spec in detail after pilot approval)").
It answers two questions: (1) where else in the entire guide does the pool
pattern apply, at slot granularity, and (2) what the one consistent build
approach is for all of them.

Parent spec: `2026-07-16-guide-example-pools-design.md` (direction, voice,
SEO/page-weight policy, entry lifecycle). This spec does not re-litigate any
of that; it inventories and standardizes.

---

## 1. Opportunity audit — the whole guide, slot level (2026-07-16)

Three parallel readers swept every content surface: the 9 refreshable level-1
pages, the 12 "pinned" level-1 pages, and level-2 + codex + hub.

### 1a. Poolable: 22 remaining slots, all level-1

Every poolable slot is a `card: true` pictographGroup on a refreshable page.
19 are standard single-slot pools across 6 pages; 3 form the words-page
coordinated triple (own phase, per parent spec ledger).

| Page | Slot (current print example) | Classification taught | Generation recipe (MCP `generate_sequence`) | Quirks / flags |
|---|---|---|---|---|
| misc-permutations | DJII | Mirrored LOOP (Type 1) | `loopType: "mirrored"` | per-slot prose precedes card |
| misc-permutations | BBLF | Swapped & Rotated LOOP | `loopType: "rotated_swapped"` | only a bare label ties to the card today; pool entry 0 needs drafted prose |
| misc-permutations | KIEC | Swapped & Mirrored LOOP | `loopType: "mirrored_swapped"` | per-slot prose FOLLOWS the card; absorb into entry 0 on migration |
| type2-loops | BΣTX | Rotated LOOP via Type 2 letters (α↔γ travel) | `loopType: "rotated"` + Type 2 letter-set constraint (probe P2) | trio shares one prose block; slots differ by travel pattern |
| type2-loops | EΔUZ | same (β↔γ travel) | same | |
| type2-loops | OYHΘ | same (γ↔β travel) | same | |
| gamma-loops | SOTR | Rotated LOOP via γ→γ letters | `loopType: "rotated"` + gamma letter-set constraint (probe P2) | authored strips share a hardcoded Γ start box; adapter already handles per-entry starts |
| gamma-loops | VPUQ | same | same | |
| gamma-loops | MVNU | same | same | |
| prop-reversal-loops | EΣQY | Rotated LOOP containing prop-reversals | `loopType: "rotated"` + `constraintPreset: "reversal"`, then FILTER: keep only candidates whose baked marks show prop-reversals (probe P3) | |
| prop-reversal-loops | TWKΘ | same | same | |
| prop-reversal-loops | BΔMX | same + "R through a static step" teaching point | same; prefer candidates where a hand stops then resumes (static step between marked reversals) | curation flag C1 below |
| full-reversal-loops | CCKE (×2) | word containing a full-reversal (+ prop-reversals) | `constraintPreset: "reversal"` + loopType, FILTER for full-reversal marks (probe P3) | |
| full-reversal-loops | FLII (×2) | same | same | |
| full-reversal-loops | DAK (×4) | same, 3-letter word ×4 | same with `length` sized for ×4 repetition | longest strip on the page (start + 12), flowCols 6 |
| eight-letter-words | IIΩXKEΣY (×2) | Rotated LOOP from an 8-letter word (16 counts) | `length: 16, loopType: "rotated"` | strips are start + 16; labels today are bare parentheticals |
| eight-letter-words | CΣNZIΘUW (×2) | Mirrored + Swapped LOOP, 8-letter word | `length: 16, loopType: "mirrored_swapped"` | |
| sixteen-count | GΘOZ (×4) | Rotated + Swapped LOOP, quartered (90° per repetition) | `length: 16, loopType: "rotated_swapped", period: "quartered"` | |
| sixteen-count | EΔQY (×4) | Rotated + Mirrored + Swapped LOOP | NO direct enum value exists (gap G1): generate `rotated_swapped` quartered candidates, classify with `detect_loop_pattern`, keep ones that also mirror | |
| words | AABB ×3 orientations | same word, three starting thumb-orientation triples | one word + `blueStartOrientation`/`redStartOrientation` variants | COORDINATED TRIPLE: all three slots swap together; needs the group-cycle mechanism (section 5) |

### 1b. Confirmed pinned — no opportunities (re-audited at slot level)

All 31 card slots on the "pinned" pages stay pinned. The page-level
classification survives slot scrutiny:

- **examples-abc / examples-acac / examples-cccc:** every slot's prose is
  about THAT slot's specific reversal placement or geometry ("reversals after
  steps 3 & 7", "we must body turn on step 5", "impossible to execute ACAC
  without a prop-reversal"). The example is the lesson.
- **lt1-abc-ghi (6), lt1-gamma-words (7):** exhaustive self-combinations of
  the exact letters being introduced (AAAA...IIII; MPMP...VVVV). Nothing
  arbitrary; the set is complete by construction.
- **lt1-dj-ek-fl (3), lt1-mp-nq-or-stuv (3):** DJ/EK/FL and MP/NQ/OR are the
  only pairings of the just-taught compound letters. The mnemonic PHRASES
  ("Disco Jam") are arbitrary, but they are text, not sequences; out of scope.
- **lt2-wxyz (2):** WΣYΘ and XΔZΩ are the exhaustive pro/anti
  continuous-motion words of the Type 2 set.
- **reversals, negative-space, lt3-dash-letters strips:** letterless (or
  vehicle-letter) concept-isolation demos, not word examples; not cards.
- **lt456-phi-psi-lambda:** galleries only, no cards.

### 1c. Level-2: not applicable now; one seam to respect

Level-2 (turns, double-turns) renders 21 `SequenceShowcase` instances, but
every one is a canonical named motion ("Prospin with a turn"), print-artboard
faithful, passed through the `strip` snippet override, which by design
disables pool cycling (`SequenceShowcase.svelte`: `strip` present → `pool`
ignored). These are pinned by construction: each showcase IS the concept.

Seam for the future: if level-2 ever grows arbitrary-example sections (e.g.
"words with turns"), pools apply, and the showcase then needs a decision on
pool + strip-override coexistence. Do not build that speculatively.

### 1d. Codex + hub: not applicable

Codex (base, poster, parity, level-2 turn codex) is single-pictograph grid
cells; the guide hub is navigation and marketing copy. No sequences, nothing
to pool.

---

## 2. The consistent build shape

The pilot's shape generalizes with three small pieces of work. One pattern
everywhere; no per-page forks.

### 2a. Pool data: one JSON per page

`src/routes/(public)/guide/level-1/_data/example-pools/<page>.pool.json`,
same schema as `permutations.pool.json`:

- top level: `createdAt`, `page`, `note`, `generationDefaults`, `slots`
- `slots` keyed by a slot id chosen per page (e.g. `mirrored`, `bblf`,
  `type2-alpha-gamma`); each slot: `defaultEntry` (describes entry 0, which
  lives in the content file) + `candidates[]`
- candidate: `word`, `loopType`, optional `period`, optional NEW `label`
  (explicit display label; needed because compound classifications like
  "Swapped & Mirrored" should not be derived), `prose`, `verified[]`,
  `steps[]` (verbatim MCP step data, `step` keys, never `beat`; the MCP wire
  still emits `beat` until the nomenclature server phase lands, so capture
  maps the key)
- master copies live with the spec
  (`docs/superpowers/specs/<date>-guide-example-pools-<page>-data.json`);
  the page pool JSON is the verbatim curated copy, exactly like the pilot

### 2b. Adapter: generalize `pool-adapter.ts` from hardcoded to factory

Today the adapter imports `permutations.pool.json` directly and exports three
named slot arrays. Change to:

- `buildPools(pool: RawPool): { pools: Record<string, PoolEntry[]>; flagged: FlaggedEntry[] }`
  — pure function over any page's JSON
- keep the init-time `assertPositionInverseIsUnique()` exactly as is (runs
  once per module load)
- keep the flagged-entry policy (a bad candidate is excluded and recorded,
  never breaks the page)
- `loopLabel()` gains: use the candidate's explicit `label` when present;
  fall back to the current derivation (Mirrored / Rotated 180° / Rotated 90°
  / Swapped) otherwise
- `GridMode.DIAMOND` stays the default; read `generationDefaults.gridMode`
  if a future pool ever generates box (none of the 22 slots do)
- per page, a thin module: `import json from "./<page>.pool.json"` +
  `export const pools = buildPools(json)`. The permutations exports keep
  their names as a compatibility wrapper over the factory.

### 2c. Content wiring: the permutations pattern, verbatim

Per pooled card in `<page>.content.ts`:

1. Build the authored print strip ONCE; it serves as both the card's `items`
   and pool entry 0's `items`.
2. Entry 0 = `{ word, loopLabel, proseHtml, items }` inline in the content
   file; entries 1..N spread from the adapter.
3. The slot's example-specific prose moves INTO entry 0 (it crossfades with
   the pool prose); page-level prose that describes the whole section or a
   trio of cards stays as flow prose.

Prose-ownership rule for migration (this rollout's one voice question):
several pages have NO per-slot authored prose today (type2-loops, gamma-loops,
full-reversal-loops share one block per trio; BBLF and the 8-letter slots have
bare labels). For those, entry 0 needs NEW prose describing the print example.
That prose is Fable-drafted + Austen-curated exactly like pool prose (the
parent spec's voice amendment covers it; nothing of Austen's verbatim print
text is overwritten because none exists for those slots). Where per-slot prose
DOES exist (DJII, KIEC, BΔMX), it moves into entry 0 verbatim.

### 2d. Showcase: no component work for the 19 standard slots

`SequenceShowcase`'s `pool` prop, ghost-sizer prose, cycle button, and sr-only
crawl block already handle everything the standard slots need, including
per-entry loop labels and 16-step strips (the strip row scrolls; max-height
reservation across the pool is already the component's job). The only
component work in this rollout is the words-page group cycle (section 5).

---

## 3. Generation workflow per page (the lifecycle, operationalized)

Prereq: **MCP server restart** so it loads the fixed sequence-engine build
(loop-closure start-draw fix, commit c9c7f735eb). Until then the
closure-failure workaround (probe `validate_loop_options`, force
startPosition/endPosition) remains the documented fallback; after restart it
should become unnecessary. Verify the fix took by regenerating one known repro
(ΔZΩX swapped) without forced positions before starting any wave.

Per slot, per the parent spec's lifecycle, with these rollout additions:

1. **Generate 4 candidates per slot** (pilot size), `constraintPreset:
   "smooth"` unless the slot's recipe says otherwise, `level: 1`, diamond.
2. **Persist at generation time** to the spec-side data JSON in the same
   turn. Standing rule from the pilot incident; no step data ever lives only
   in conversation context.
3. **Mechanical verification** before prose: every claim that will appear in
   `verified[]` is checked against the captured step data (rotation
   directions per half, statics, position slices); reversal claims must
   correspond to marks `bakeReversals` derives, never hand-claimed.
4. **Prose** (Fable voice, guide register): one concept sentence + one
   example-specific sentence. Hard bans: em dashes (U+2014) anywhere;
   "turns" for loop rotation (say rotated 180°/90°); color claims must match
   the captured instance (the pilot's GΘSZ/CΣVX lesson: regeneration is
   stochastic, re-verify colors every time).
5. **Austen curates** with animation + prose + strip together on the live
   page (same flow as the pilot: cycle UI on localhost).
6. **Bake**: cuts applied to the spec-side JSON first, then copied verbatim
   to the page pool JSON.

### Phase 0 capability probes (run once, before wave 1, after restart)

- **P1 — compound loopTypes:** generate one `rotated_swapped` and one
  `mirrored_swapped` candidate and confirm `detect_loop_pattern` agrees with
  the requested classification.
- **P2 — letter-set constraint:** confirm the cheapest way to hold a
  generation to a letter family (Type 2 set for type2-loops, γ→γ set for
  gamma-loops): try natural-language `constraints` first
  (`parse_constraints` to preview), fall back to `mustNotContainLetters`
  listing the excluded families. Record the working recipe in the wave-1
  data JSON's `generationDefaults`.
- **P3 — reversal targeting:** confirm `constraintPreset: "reversal"`
  produces prop-reversal marks at level 1 under a loopType, and at what hit
  rate; if low, generate more candidates and filter on baked marks.
- **G1 — triple compound:** `loopType` enum has no plain
  mirrored+rotated+swapped. For the EΔQY slot: generate `rotated_swapped`
  quartered candidates and keep those `detect_loop_pattern` classifies with
  the mirror property too. If the hit rate is ~zero, that slot ships with
  pool size 2-3 or waits for an engine enum addition; do not fake the label.

---

## 4. Wave plan

Batched by engine confidence, so early waves also de-risk later ones. Each
wave = generate → persist → verify → prose → Austen curates → bake → tests.
A wave is one session's scope; waves are independent after Phase 0.

- **Wave 1 — plain + compound rotated (9 slots):** type2-loops, gamma-loops,
  misc-permutations. Exercises P1/P2 outputs. All short strips (start + 8).
- **Wave 2 — reversal-bearing (6 slots):** prop-reversal-loops,
  full-reversal-loops. Exercises P3 filtering; candidates need the
  reversal-mark screen, so budget more generations per keep.
- **Wave 3 — long strips (4 slots):** eight-letter-words, sixteen-count.
  `length: 16` recipes, quartered periods, and the G1 fallback. Pool JSON
  roughly doubles per candidate here (16 steps); still KB-scale, no
  page-weight concern beyond the parent spec's prerender-default policy.
- **Wave 4 — words AABB coordinated triple (3 slots, one pool):** needs the
  group-cycle mechanism below; spec'd here, built in its own phase per the
  parent ledger.

## 5. Wave 4 sketch: the coordinated triple (words page)

Shape: one pool of WORDS (each candidate = one word), where cycling swaps all
three showcases together to the same candidate word in its three orientation
variants (in|in, out|out, in|out via `blueStartOrientation`/
`redStartOrientation` overrides).

- Data: `words.pool.json` with ONE slot (`orientation-triple`); each
  candidate carries `variants: [{ orientations: "in|in", steps: [...] }, ...]`
  (three step arrays per candidate word) plus one shared prose block.
- Component: a `poolGroup` coordination seam. Smallest honest mechanism:
  the three showcases on the page receive the same `PoolEntry[][]` and a
  shared cycle index owned by the page section (one button, not three). This
  is NOT the standard per-showcase pool prop; design its exact seam when the
  wave starts, against the then-current SequenceShowcase. Do not pre-build.
- The words page also lacks reversal render flags and uses `stepLabels`;
  variants must keep `layout: "strip"` + labels. The adapter's strip builder
  already produces bare strips; the content file keeps its render flags.

## 6. Tests (extend the pilot's suite per page)

`tests/unit/guide-example-pool-adapter.test.ts` generalizes to iterate every
`*.pool.json` in the example-pools dir:

- adapter builds every candidate with zero flagged entries
- position pairs round-trip; start box derives from step 0
- reversal marks in `verified[]`-adjacent prose claims exist in baked data
  where the slot's page renders reversals
- NEW: prose hygiene guard for every pool entry: no U+2014, no standalone
  word "turn(s)" applied to loop rotation (regex on `prose` fields), words
  display via the simplifier where a pool surfaces titles
- the existing sequence-showcase/guide tests keep covering the component

## 7. Curation flags carried into the waves

- **C1 (prop-reversal-loops, BΔMX):** the authored after-prose says the right
  hand "stops on steps 2 and 4 before resuming" while the authored data's R
  marks sit on steps 3/5/7 (marks appear where motion RESUMES, one step after
  each stop). The two statements describe the same phenomenon from different
  ends, but the pairing is easy to misread. When pooling this page, entry-0
  prose should state the stop-step/mark-step relationship explicitly, and
  Austen confirms the wording.
- **C2 (eight-letter-words, CΣNZIΘUW):** authored comment notes the word uses
  U (not V) for a construction reason. Pool candidates for that slot have no
  such constraint; nothing carries over.

## 8a. Phase 0 results (2026-07-17)

- **Server location found:** the Flow Arts Knowledge MCP server is a claude.ai
  connector whose process does NOT run on the C: machine (no process, no
  service, no scheduled task, no `Temp\tka-mcp` folder here; generated images
  land in a Windows SYSTEM profile temp on the host that runs it). Restarting
  Claude Code does not restart it. The closure fix (c9c7f735eb) is compiled
  into `packages/sequence-engine/dist` on this checkout and the mcp-server
  node_modules symlink resolves to it, but the RUNNING server still serves
  pre-fix code. Action (Austen, on the host machine): pull the branch, run
  `pnpm build` in packages/sequence-engine, restart the server process.
- **P1 compound loopTypes: PASS.** `rotated_swapped` and `mirrored_swapped`
  both generate and self-classify correctly (engine response header).
- **P2 letter-set control:** natural-language constraints do NOT parse letter
  types (confidence 0). `mustContainLetters` is a POST-HOC filter in loop mode
  (errors "Required letters not present" instead of steering). Working recipe:
  `mustNotContainLetters` (reliable exclusion steering) + start-position
  steering + verify-per-candidate. `startPosition` can be overridden by loop
  closure (a forced alpha5 start came back beta1) — treat it as a hint.
- **P3 reversal preset: PASS.** `constraintPreset: "reversal"` under a
  loopType produces dense prop-direction flips at level 1.
- **Bonus finding:** generation images open in the server host's invisible
  SYSTEM session, so bulk generation does not spam anyone's desktop.

## 8b. Ledger

- [x] Slot-level audit of the entire guide (level-1 all 33 pages, level-2,
      codex, hub) — 2026-07-16, three parallel readers
- [x] Engine capability mapping from the `generate_sequence` schema
      (compound loopTypes, quartered, length-with-loopType, reversal preset,
      letter constraints) + gap G1 identified
- [ ] Engine closure fix live on the MCP host (Austen: pull + build
      sequence-engine + restart the server process on the machine that runs
      the connector; see 8a). Wave 1 proceeded WITHOUT it via the
      validate/force-positions fallback, which turned out unnecessary (all
      wave-1 draws closed on their own).
- [x] Phase 0 probes P1/P2/P3 (see 8a); G1 deferred to wave 3 as planned
- [x] Adapter factory generalization + test sweep generalization — commit
      f80beb4e1a, 50/50 tests, prose-hygiene sweeps auto-cover future pools
- [x] Wave 1 GENERATED + verified + prose-drafted (2026-07-17):
      `2026-07-17-guide-example-pools-wave1-data.json` — misc-permutations
      12 candidates, type2-loops 12, gamma-loops 7 (small word space, see
      note). Awaiting Austen curation, then page wiring.
- [ ] Wave 1 page wiring: pool JSONs + content-file `pool:` attachment +
      entry-0 prose for the slots that have none (misc-permutations BBLF,
      all type2/gamma slots) — after curation
- [ ] Wave 2: prop-reversal-loops, full-reversal-loops (6 slots)
- [ ] Wave 3: eight-letter-words, sixteen-count (4 slots)
- [ ] Wave 4: words coordinated triple (design the group-cycle seam first)
- [ ] Per wave: Austen curation pass on localhost before baking

## Related

- Parent: `2026-07-16-guide-example-pools-design.md` (lifecycle, voice, SEO)
- Pilot data: `2026-07-16-guide-example-pools-pilot-data.json`
- Engine fix: `2026-07-16-loop-closure-start-draw-fix-design.md` (c9c7f735eb)
- Nomenclature bridge: `2026-07-16-beat-to-step-nomenclature-design.md` (MCP
  wire key is still `beat`; capture maps to `step`)
- Rules: `sequence-generation.md`, `tka-domain.md`, `no-layout-shift.md`,
  `crossfade-primitive.md`
