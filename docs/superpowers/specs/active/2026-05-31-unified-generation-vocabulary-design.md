---
status: active
value: 2
effort: M
remaining: "Verify Unified Generation Vocabulary — Generate Panel · Deck Composer · Sequence Actions against the current Unified Generation Vocabulary — Generate Panel · Deck Composer · Sequence Actions runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Phases 1-2 shipped past spec; Phase 0''s actual goal (collapse 3 reversal + 2 turn representations) and Phases 3-4 unstarted'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Unified Generation Vocabulary — Generate Panel · Deck Composer · Sequence Actions

> **DRIFT WARNING — 2026-08-02.** Phases 1-2 shipped past spec; Phase 0's actual goal (collapse 3 reversal + 2 turn representations) and Phases 3-4 unstarted
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-31
**Status:** Design — pending review
**Related:** `2026-04-20-sequence-engine-unification-design.md`, `2026-05-30-deck-releaser-draft-persistence-dedup-design.md`, `2026-05-31-deck-recipe-stamp-reuse-design.md`

## Problem

Three surfaces in the app drive sequence generation, each with its own controls, its own
data model, and its own vocabulary for the same underlying concepts:

1. **Generate panel** (`create/generate`) — Style rows (Props / Hands / Dashes =
   Smooth/Mixed/Choppy), Rhythm, Start Pos. Builds **one** sequence from constraints via
   beam search (`SequenceBuilder.build()`).
2. **Deck composer** (`choreo-card/deck-releaser`) — step-length weighting sliders, Turn
   Density slider, Clean/Sprinkle/Spicy preset, turn-pattern chips. Draws **many** from a
   pre-enumerated LOOP pool stored in Firestore, then stamps deterministic transforms.
3. **Sequence actions** (`create/shared/sequence-actions`) — per-step Turn Pattern,
   Reversal/Rotation-Direction Pattern, and Duration Pattern editors applied to an
   existing sequence.

The same concept appears under three different names and three different data models:

| Concept | Generate | Deck | Sequence-actions | Apply path |
|---|---|---|---|---|
| Prop reversals | `constraintPreset` (3-axis Smooth/Mixed/Choppy) | `ResolvedReversalPattern` (P/R/B/- string) | `RotationDirectionPattern` (per-step CW/CCW/none) | **two different apply fns** |
| Turns | `turnIntensity` (scalar max) | `TurnPatternPreset` (`"1\|1-0\|0"`) | `TurnPattern` (per-step entries) | shared `turn-pattern-manager.applyPattern()` |
| Duration | `durationTemplateId` | — (none) | `DurationPattern` | shared `duration-pattern-manager.applyPattern()` |

Reversals and turns each carry **three parallel representations**; duration is the lone
unified concept (one model, one apply fn, two consumers). This is the textbook
derived-state-drift anti-pattern (React "you probably don't need derived state"): copying
one concept into N stores guarantees they diverge.

A second limitation: the deck composer has **no loop-type control at all** (zero
`loopType` references in `deck-releaser/`). It draws whatever was enumerated into Firestore
— effectively only rotated LOOPs. The generator already defines the full set in
`circular-models.ts` (`ROTATED, MIRRORED, FLIPPED, SWAPPED, INVERTED` + compounds). Loop
type is just another generation parameter the deck never exposed.

## Decision

**Make generation the single source of truth, and unify the control vocabulary across all
three surfaces.** Three sub-decisions:

### 1. The enumerated pool is a derived cache, not a source of truth

The LOOP base-seed enumerator (`scripts/enumerate-deck.cjs`) is a **deterministic** DFS over
the pictograph CSV graph; running it yields the same set every time. The Firestore pool is
therefore a *memoization* of a pure function, not an independent system.

Adopt the derived-data model (Kleppmann, *Making Sense of Stream Processing* Ch.5;
Bazel/Nix/Turborepo content-addressed build caches):

- **Durable truth = `(recipe, seed, generatorVersion)`.** Nothing else needs to persist.
- **Cache key = `hash(canonicalRecipe ⊕ seed ⊕ generatorLogicVersion)`.** A generator rule
  change bumps `generatorLogicVersion` → every key changes → stale entries auto-miss. Drift
  becomes structurally impossible rather than a manual-flush discipline (this is the cure
  for "the pool drifts from the engine on rule change").
- **Invariant / acceptance test:** wipe the entire pool, regenerate from recipes → output
  is byte-identical. If that test fails, the pool holds non-derivable state and is secretly
  a second source of truth.
- **Lazy fill + memoize.** Generate on first request, cache, serve thereafter. A *missing*
  cache entry ("not yet generated") is explicitly distinct from a *known-empty* enumeration
  result (the Noria ⊥ marker) so the UI never loops re-enumerating or shows a false count.
- The existing Firestore pool survives **demoted to the cache tier** for the large step
  counts where live enumeration is too slow; small step counts enumerate live.

### 2. One normalized parameter vocabulary; three UIs are projections of it

(VST3 normalized parameter model; JUCE `AudioProcessorValueTreeState`; NN/g progressive
disclosure.)

- One normalized **parameter tree** is the truth. Axes: `loopType`, prop-continuity,
  hand-path, turns, duration, grid, orientation, start-pos, deck-size.
- The three surfaces are **progressive-disclosure tiers** over that one model, not three
  features:
  - **Coarse panel** (macro) — one segmented control per axis (Smooth/Mixed/Choppy,
    turn-intensity). The Generate-panel surface.
  - **Presets** — named *points* in the parameter space (Clean/Sprinkle/Spicy, Hold/Pulse/
    Trade). Selecting a preset writes its vector into the truth.
  - **Per-step editor** — identity projection; reads/writes raw per-step values. The
    sequence-actions surface.
- **Single write path** (`setParam(axis, value)` / `setSteps(...)`). No tier mutates the
  model directly; none "wins" because none holds authority (VST3's structural answer to
  "which view wins").
- Coarse / preset labels are **computed on render** from the truth, never stored.
- **Descending a tier is lossless** (preset/macro → full step vector); **ascending is lossy
  and must be explicit** — collapsing varied per-step edits back to one macro segment is a
  named, reversible "apply", never an automatic round-trip (the Vital "Apply Matrix"
  lesson). When steps disagree, the macro re-projects to "Mixed / Custom".

### 3. Explicit seed + Reroll (not derived seed)

A deck's recipe = **dials + seed**. The dials shape the *character* (loop type, size, turn
intensity…); the seed picks *which specific draw* of that character. A **Reroll** button
spins a new seed with the dials fixed → a fresh draw in the same style.

- Rejected: derived seed (`seed = hash(params)`), where identical dials always yield the
  identical deck. It gives free global dedup but forbids reroll, which is core to the
  "feels like generating" goal.
- Reproducibility is preserved — the seed is stored in the recipe, so any deck regenerates
  exactly.
- Dedup is preserved — the "already shipped" ledger keys on each card's **content
  fingerprint**, so overlapping rerolls are still caught (see §Draw algorithm).

## Architecture (research-grounded)

### Recipe model

```
Recipe {
  schemaVersion: number        // shape of THIS object — migrate-on-read, step-wise
  generatorVersion: string     // generation logic pin — NEVER silently re-resolved
  recipeId: string             // identity; fork = new id, copy params
  seed: string                 // explicit; Reroll mints a new one
  params: { …normalized axes… }
}
```

- **schemaVersion** → migrate-on-read to one latest in-memory model; kept separate from app
  version (standard config-versioning practice).
- **generatorVersion** → pinned per recipe. Opening a recipe whose version < current does
  **not** silently re-resolve (the No Man's Sky "Origins refreshed the universe" trap):
  either reproduce under the pinned logic or prompt "made with v3 — reproduce as-is, or
  upgrade to v4 (output will change)?".
- The recipe is **stamped onto every produced deck** (frozen full copy, fxhash/Art Blocks
  model) *and* separately reusable/forkable — extends the recipe-stamp shipped in
  `2026-05-31-deck-recipe-stamp-reuse-design.md` by adding `seed` + `generatorVersion`.

### Seeding

- `master = sfc32(cyrb128(canonicalJSON(recipe)))`. Canonical JSON (RFC 8785 / sorted keys)
  so logically-identical recipes hash identically. **`sfc32`**, not `mulberry32` (which
  skips ~1/3 of 32-bit values). Never `Math.random` (unseedable).
- **Per-item sub-stream seeding:** `childSeed(k) = cyrb128(master + ":" + k)`, fresh stream
  per deck slot. Adding/removing one card leaves every other card bit-identical, and each
  card's content fingerprint is a pure function of `(recipe, k)`. This is load-bearing for
  incremental edits and dedup.

### Draw algorithm (tiny-to-huge population, draw N uniques)

(Knuth TAOCP §3.4.2 / MacIver lazy Fisher-Yates; Vitter reservoir; coupon-collector math.)

1. **Ceiling, in closed form.** Generation produces cards **fresh** — it never draws from a
   fixed bin. The only finite quantity is the count of distinct **base LOOP seeds** that
   close for a `(loopType, stepCount, level)`; a deck *card* is a base seed fanned across the
   variation axes (orientation × grid × turns × reversals), so the real population is
   `P = baseSeeds × variationMultiplier` — deep. Compute `P` via a path-count DP over the
   generation graph — O(states), never enumerate to count. The guard
   `n = min(requested, P − |ledger|)` is therefore a **rare edge** (only when a request
   exceeds the *entire* variation space), surfaced as "that's the whole space," not a cap.
   A genuinely impossible config (zero closing seeds at that step/type) is guidance
   ("no rotated LOOPs close at 10 steps — try 8 or 12"), never a dead "0".
2. **Draw `n` uniques** via lazy/sparse Fisher-Yates over ranks `[0, P)` + an **un-rank**
   function (`rank → artifact` by walking the generator). O(n), independent of whether `P`
   is 10 or 12,612 — never materializes the population.
3. **Cross-batch dedup** via an **exact `Set<contentFingerprint>`** persisted per series.
   Exact set is correct at ≤ ~10⁵ items; Bloom filters are actively wrong at this scale
   (negative memory savings + false positives would shrink an already-tiny space). Reuses
   the existing `getAllReleasedSequenceIds()` ledger concept.
4. **Rejection sampling** only as a micro-optimization when `n < ~10%` of `P`; above that
   the coupon-collector tail makes it slow, so the shuffle path is the default.

## Phase decomposition

This is a multi-subsystem effort; each phase gets its own plan → implementation cycle.
Phase 0 is detailed here; later phases are sketched and will be brainstormed/specced when
reached.

### Phase 0 — Vocabulary + models (foundation; pays the debt)

- Define the one normalized parameter vocabulary (the axis set + value domains + display
  transforms).
- Collapse the **3 reversal representations → 1** and the **2 turn representations → 1**,
  following the duration model (already unified). Single apply path per concept.
- Extend the recipe model with `seed`, `generatorVersion`, `schemaVersion`, and
  canonical-JSON hashing + `sfc32` seeding + per-item sub-streams.
- **Benchmark task:** un-rank-and-draw-52 vs. full-enumerate-then-sample, per loop type and
  step count, to set the cache-thinness threshold (which step counts enumerate live vs.
  hit the Firestore cache tier).
- Acceptance: wipe-and-rebuild byte-identical test passes; one apply fn per concept; old
  recipes migrate-on-read.

### Phase 1 — Shared axis-control surface

The "bubbly button" panel: SegmentedControl rows + preset chips + per-step drill-in, with
progressive disclosure and a single write path. Consumed by all three surfaces. Built on
existing primitives (`SegmentedControl`, `FilterChipBase`) per `chip-primitives` rule.

**Deck-generator control tiering (decided 2026-05-31):**

- **Top — bento tiles** (deck-defining, frequent): Word (all-variations-of-a-word mode) ·
  Deck Size · Length (step count) · Level · Grid (Diamond/Box) · **Turn Intensity**
  (revealed at Level ≥ 2) · Orientation · Loop type · Period (Quartered/Halved) ·
  **Props · Hands · Dashes** (each a 3-position Smooth→Mixed→Choppy stepper tile) ·
  **Generate** (action). The Customize entry tile is **removed** — once turns moved to their
  own card, Customize held only the three style axes, so they were promoted to first-class
  stepper tiles.
- **Deep drill-in:** per-step reversal editor (reached from the Props/Hands tiles; future).
- **Responsive:** 3 tiles per row by default, expanding to 4 per row on wide (≥ 1700px / 4K)
  displays.
- **Orientation tile folds in Start Position** — tapping it opens orientation
  (Radial/Nonradial/Split) **and** start mode (All/Classic/Specific); "Specific" reveals the
  position grid (deep tier).
- **Decisions:** Turns use the **generator model** — a single **Max Turn Intensity card**
  (the real `TurnIntensityCard`) that appears as a top tile only at Level ≥ 2, exactly like
  the Generate panel. The deck-specific Clean/Sprinkle/Spicy "turn variation" and named turn
  patterns (Hold/Pulse/Trade) are **dropped** — they are draw-frequency concepts the
  generator doesn't model; max-intensity handles everything. **Rhythm/Duration is omitted
  from deck generation** (sequence-playback timing, not card data). No Recipe tile on the grid
  for now; recipe reuse stays in the released-decks panel. Loop type uses the canonical
  `LOOPType` model + the real `LOOPExpandedOverlay` component-combo selector.

### Phase 2 — Deck generates from recipe (headline)

Wire the deck composer to generation: closed-form ceiling + lazy Fisher-Yates draw +
sub-stream seeding + exact-Set dedup; pool demoted to content-addressed lazy-fill cache.
**Loop type becomes a deck axis** — all loop-deck types fall out for free. Reroll button.
Removes step-length weighting and the redundant Turn Density slider (Clean/Sprinkle/Spicy
already writes `turnFrequency`).

### Phase 3 — Generate panel adopts the shared surface

Swap raw `<button class="option-btn">` Style rows → `SegmentedControl` (fixes the current
`chip-primitives` violation). Gain turn presets + per-step drill-in. Remove Duration from
the panel (per user direction) / reconcile into the shared duration model.

### Phase 4 — Sequence-actions adopts the shared surface

Reskin the per-step Turn / Reversal / Duration editors onto the unified vocabulary and
control surface. Now all three surfaces are projections of one model.

## Rejected alternatives

- **Full engine merge (deck generates instead of curating, pool deleted).** Pure-generate
  with no cache loses the closed-form ceiling guard's free perf and forces probabilistic
  dedup. Resolved by reframing the pool as a *derived cache*, not deleting it.
- **Keep draw-from-pool, only restyle controls.** Lowest risk but preserves the
  rotated-only limitation and the "feels like a sample, not a generation" quality the user
  wants gone; and leaves loop type unreachable.
- **Derived seed (dials determine everything).** Forbids reroll. Rejected per §Decision 3.
- **Hybrid as a first-class design (two parallel source-of-truth paths).** Over-engineered;
  the cache reframing gives one conceptual model (generate, memoized) instead.

## Risks

- **Lossy macro collapse.** Ascending from per-step edits to a coarse macro segment is
  inherently lossy. Mitigation: never auto-collapse; show "Custom / Mixed"; "apply/bake" is
  an explicit, reversible action.
- **generatorVersion drift.** A generation logic change must bump the version (in the cache
  key and recipe pin) or saved recipes silently change output. Mitigation: derive the
  version from generator source structure at startup; prompt-don't-resolve on version
  mismatch.
- **Live enumeration latency at large step counts.** Mitigation: the Phase 0 benchmark sets
  the live-vs-cache threshold; un-ranking avoids materializing the population for the draw.

## References

Kleppmann, *Making Sense of Stream Processing* Ch.5 (derived data / self-updating caches).
Bazel/Nix/Turborepo content-addressed caching. Noria (OSDI '18) partial-state ⊥ marker.
VST3 parameter model; JUCE APVTS; NN/g progressive disclosure; React derived-state
anti-pattern; Vital "Apply Matrix" lossy-collapse. Knuth TAOCP §3.4.2 / MacIver lazy
Fisher-Yates; Vitter reservoir sampling; coupon-collector. bryc PRNGs (sfc32);
RFC 8785 canonical JSON; PCG/SplitMix sub-stream seeding; fxhash / Art Blocks seed-stamp;
No Man's Sky / Minecraft regen-from-seed + version drift.
