# Generate tab: "the inverted options give weird results"

Feedback `n3H02keo8KuXX5mJng4E`. Investigation and fix for the Generate tab's
inverted LOOP options.

- **Base SHA:** `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`)
- **Branch:** `claude/fix-inverted-options-generate-tab-4rp6km`
- **Final SHA:** `20668ea4`
- **Commits:** `163f7fa5` (app: expand-inversion interval), `20668ea4`
  (engine: overlay seed re-roll)

---

## 1. What "the inverted options" actually are

Two separate things carry that name in the Generate tab, and both were checked.

**The eight LOOP combos containing INVERTED.** `inverted`,
`mirrored_inverted`, `rotated_inverted`, `swapped_inverted`,
`mirrored_inverted_rotated`, `mirrored_swapped_inverted`,
`rotated_swapped_inverted`, `mirrored_rotated_inverted_swapped`
(`IMPLEMENTED_COMBOS`, `src/lib/shared/create/services/loop-type-utils.ts`).

**The two rhythm controls on the Inverted card**
(`LoopRhythmConfigurator.svelte`, shown when INVERTED is selected):

| Control | Options | Field |
| --- | --- | --- |
| Invert when | At halfway / Every quarter | `inversionInterval: 2 \| 4` |
| Build the sequence | Adds length / On top | `inversionMode: "expand" \| "overlay"` |

The second pair is where both defects were. They are a 2×2, and only one cell
of the four worked reliably before this branch.

### Intended TKA semantics

Verified against canonical data rather than assumed. INVERTED is the pro↔anti
motion-type flip with the hand path unchanged; because pro and anti differ only
in whether prop rotation matches the hand-path direction, keeping the locations
means the prop rotation direction must flip too
(`FusedExecutor.transformMotion`, `overlay-inversion.ts`).

`expand` appends an inverted pass (sequence gets longer); `overlay` flips
alternating blocks of the finished sequence in place (length unchanged,
`packages/sequence-engine/src/loop/execution/overlay-inversion.ts`).

---

## 2. What was *not* broken (measured, no change made)

### 2.1 `INVERTED_LETTER_MAP` is exactly right

Derived the ground-truth inversion for every letter directly from
`static/data/pictographs/{Diamond,Box}PictographDataframe.csv`: for each of the
1152 rows, flip both hands' `motionType` (pro↔anti) and `rotationDirection`
(cw↔ccw), keep the locations, and look up the resulting motion pair.

All 47 letters agree with `INVERTED_LETTER_MAP` in
`src/lib/shared/create/domain/strict-loop-position-maps.ts`, with zero rows
having no inverse. A↔B, C↔C, S↔T, U↔V, W↔X, W-↔X-, Σ↔Δ, Θ↔Ω, Φ↔Φ, α↔α, … —
every mapping confirmed by data, none by memory.

### 2.2 Structure, continuity and labelling of generated inverted LOOPs

Audited generated sequences for: `startPosition == previous endPosition`;
per-hand `startLocation == previous endLocation`; per-hand
`startOrientation == previous endOrientation`; positional closure; orientation
closure; every step's motion pair existing in the canonical dataset; and the
labelled letter matching what the engine's own `findLetterByMotions` derives
from that step's motions (float resolved through prefloat data, as
`LetterLookup` does).

| Sweep | Result |
| --- | --- |
| 8 inverted combos × 60 builds, level 1, len 8 | 0 violations |
| 8 inverted combos × 40 builds, levels 2 and 3, len 8 and 16 | 0 violations |
| Letter labels, 8 inverted + 7 non-inverted combos, levels 1–3 | 0 mislabelled of 9 727 steps, 0 unresolvable |

Start/end continuity, hand and prop direction, and step validity are sound for
the inverted family. The earlier "NOT A VALID PICTOGRAPH" hits in a first pass
were a harness limitation (float motions have no CSV row); they appeared
identically for non-inverted control types and disappeared once the lookup went
through prefloat data.

### 2.3 Turns

The inverted pass carries the source step's `turns` unchanged on both hands
(`FusedExecutor` spreads `...matchingMotion`). Nothing in the canon says
inversion should alter turn counts, and no measured violation followed from it.
No change made.

---

## 3. Defect 1 — "Every quarter" + "Adds length" (app layer)

### Root cause

Inversion is an involution: applying pro↔anti twice restores the original
motions. An *expand* inversion therefore has no genuine period-4 orbit. Asked
for at period 4 the fused stage emits `[S, inv(S), S, inv(S)]`.

Proven at the executor level, not inferred: 25 real generated seeds run through
`executeSymmetricSpec` with `{inverted: {period: 2}}` and
`{inverted: {period: 4}}` — the period-4 output was a **literal byte-identical
doubling** of the period-2 output in **25/25** samples.

`reduceToMinimalLoop` then strips that doubling back, and the extra outer pass
wraps the rest of the combo so `LOOPDetector` sees only the inversion.

`buildLoopSpec` wrote `rhythm.inversionInterval` straight into the wire spec, so
picking "Every quarter" with "Adds length" handed the engine that period.

### Observed failure (Diamond, `SequenceBuilder` via the app's own seed math)

Requested length 16, level 1, 12 builds each:

| Combo | Result before |
| --- | --- |
| `mirrored_inverted` | 0/12 — `identity mismatch (expected inverted+reflection, detected inverted)` |
| `swapped_inverted` | 0/12 — `identity mismatch (expected inverted+swapped, detected inverted)` |
| `mirrored_swapped_inverted` | 0/12 — `identity mismatch (expected inverted+reflection+swapped, detected inverted)` |
| `rotated_swapped_inverted` | 0/12 — `identity mismatch (expected inverted+rotated+swapped, detected inverted)` |
| `mirrored_inverted_rotated` | rejected — expansion 16, seed 1 |
| `mirrored_rotated_inverted_swapped` | rejected — expansion 16, seed 1 |
| `inverted`, `rotated_inverted` | built, but the reduced result is the halved inversion — the option did nothing |

At length 8 all six failing combos were rejected earlier still, by the
orchestrator's `Seed too short for an inversion combo` guard, because the
interval-4 spec quadrupled the seed divisor (2 → 8, or 4 → 16).

So: every combo except two hard-failed, and the two that survived ignored the
setting. That is the reported "weird results".

### Fix

`effectiveInversionInterval()` in
`src/lib/shared/create/services/loop-type-utils.ts` — the file that already
documents itself as *"THE single source of truth"* for exactly this class of
length-invariance guard, and already coerces quartered→halved for non-rotation
types on the same reasoning. It returns the requested interval for `overlay` and
2 for `expand`.

Applied in `buildLoopSpec` (so the wire spec, `expanderMultiplier`,
`gateRhythm`, the guest gate and the word-math text all agree) and echoed
through `resolveLoopConfig().loopRhythm` (so the LOOP card cannot display a
rhythm the generator will not use).

`LoopRhythmConfigurator.svelte` now shows the effective interval and disables
the "Every quarter" segment while the mode is "Adds length", so the control
cannot promise a rhythm that will not happen. The caption for expand mode is a
single honest string instead of a live-unreachable branch; it is shorter than
the existing ghost sizer, so no layout shift is introduced.

Overlay inversion keeps its period-4 rhythm — it partitions the finished
sequence into `period` blocks and flips the odd ones in place, so blocks 0 and 2
carry different content and the pattern is real, not a repeat.

---

## 4. Defect 2 — "Every quarter" + "On top" (engine layer)

### Root cause

An overlay stage partitions the expanded (pre-orientation-closure) sequence into
`period` equal blocks and throws when the step count is not divisible by that
period. `SequenceBuilder.build`'s exact-length re-roll shrinks the seed by
whatever expansion orientation closure turned out to need — and then keeps the
shrunken seed in `workingOptions` for every later attempt. Once it landed on a
seed shorter than the overlay period, all forty attempts threw the same error
and the user got nothing:

```
Unable to generate a valid inverted LOOP after 40 attempts
(last failure: Overlay inversion requires the step count (2) to be divisible by the period (4).)
```

This became more reachable after Defect 1's fix, since "Every quarter" is now
offered only with "On top".

### Measured, 100 builds per configuration, Diamond dataset

| Configuration | Built before | Built after | Overlay throws before |
| --- | --- | --- | --- |
| `inverted`, len 8, level 3 | 14/100 | **100/100** | 86 |
| `inverted`, len 12, level 3 | 4/100 | **91/100** | 96 |
| `inverted`, len 16, level 3 | 100/100 | 100/100 | 0 |
| `swapped_inverted`, len 8, level 3 | 36/100 | **100/100** | 64 |
| `rotated_swapped_inverted`, len 8, level 3 | 34/100 | **100/100** | 66 |
| `mirrored_swapped_inverted`, len 8, level 3 | 29/100 | **100/100** | 71 |

Zero overlay-divisibility throws across all 700 builds after the fix. The
residual 9/100 at length 12 is the ordinary
`orientation closure requires a 3x seed expansion` feasibility limit, not this
defect.

### Fix

`seedSupportsOverlayStages()` in
`packages/sequence-engine/src/generation/builder/SequenceBuilder.ts`: the
re-roll rejects a candidate seed that cannot carry the spec's overlay periods
and re-rolls instead, because orientation closure varies with the seed. A spec
with no overlay stage returns `true` unconditionally, so every pre-existing
request keeps its exact behaviour — the 52 pre-existing engine test files still
pass unchanged.

This is a narrow guard inside the exact-length re-roll. No executor was changed,
removed or unified.

---

## 5. Post-fix verification sweep

Full app-path sweep (`resolveLoopConfig` → wire spec → `expanderMultiplier` →
seed → `SequenceBuilder`) over all 8 inverted combos × all 4 rhythm cells ×
lengths 8/16/32 × levels 1 and 3, with the full structural audit from §2.2 on
every result: **no build errors, no length mismatches, no structural
violations.**

---

## 6. Residual limitations (reproduced, deliberately not changed)

These are real and reproducible, but they are generation-feasibility limits
rather than demonstrated incorrectness, so per the brief they are reported
rather than patched on a guess.

1. **`rotated_swapped_inverted` at length 4 fails 25/25.** Seed 2, halved,
   level 1. Failures split between `identity mismatch` and
   `orientation closure requires a 2x seed expansion`. Inversion-specific:
   `rotated_swapped` at the same 2-step seed builds 25/25. Length 8 (seed 4)
   builds 24/25. The Length card's minimum for this combo is 4, so the UI does
   offer the failing length. A principled fix belongs in
   `minimum-length-calculator.ts`'s `basePatternMinimum`, but the correct value
   there is a domain call, not something to infer from one combo's empirical
   threshold.

2. **Four-component combos at length 4** (`mirrored_inverted_rotated`,
   `mirrored_rotated_inverted_swapped`) reduce to a 1-step seed and are already
   rejected by the orchestrator's `Seed too short for an inversion combo`
   message. Not inversion-specific: `mirrored_rotated` (no inversion) at the
   same 1-step seed also fails 25/25.

3. **`inverted` alone with "On top" produces no detectable inversion
   structure.** With overlay and no other component the expansion multiplier is
   1, so the seed *is* the whole sequence and the two halves are unrelated
   content; the overlay then flips one half in place. The result is a valid
   closed loop (positions and orientations close — measured), but it is
   structurally indistinguishable from an ordinary sequence, and
   `getLOOPValidationFailure` deliberately skips identity validation for overlay
   specs. Whether a sequence like that should still be labelled `inverted` is a
   product question about overlay semantics, which the brief explicitly puts
   out of scope.

4. **Float motions do not invert.** At level 3 a `fl` turn makes
   `motionType: "float"`, which `invertMotionType` leaves alone, and
   `prefloatMotionType` is copied unchanged — so a float step's inverted
   counterpart is byte-identical and keeps the same letter (Δ→Δ where the letter
   map says Δ→Σ). Physically defensible (a float has no pro/anti to flip) and
   the result stays internally consistent — the label always matches the
   motions — so no change was made. Flagged as an open question for the domain
   owner.

---

## 7. Files owned by this task

| File | Change |
| --- | --- |
| `src/lib/shared/create/services/loop-type-utils.ts` | `effectiveInversionInterval`; applied in `buildLoopSpec` and `resolveLoopConfig` |
| `src/lib/features/create/generate/components/cards/LoopRhythmConfigurator.svelte` | Shows the effective interval; disables "Every quarter" in expand mode |
| `src/lib/features/create/generate/components/cards/loop-expanded-overlay-model.ts` | Caption uses the effective interval |
| `packages/sequence-engine/src/generation/builder/SequenceBuilder.ts` | `seedSupportsOverlayStages` guard in the exact-length re-roll |
| `tests/unit/loop/inverted-expand-interval.test.ts` | New — 29 assertions, Defect 1 |
| `packages/sequence-engine/tests/generation/overlay-seed-reroll.test.ts` | New — 3 assertions, Defect 2 |
| `tests/unit/services/loop-type-utils.test.ts` | Split one assertion so the engine's ×16 stage arithmetic is still covered on a raw wire, plus a new assertion for the coercion |
| `src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts` | The quartered-icon case now uses overlay (where period 4 is real) and gains a sibling asserting expand shows halved |

Two existing assertions were changed. Both had asserted the behaviour proven
defective here (that an expand inversion reaches period 4 / shows a quartered
glyph). Neither was weakened: the ×16 stage arithmetic is still asserted
directly against a hand-written wire spec, and the card test gained a case
rather than losing one.

---

## 8. Commands and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | ok |
| `npm run build:packages` | ok |
| `npx vitest run` (in `packages/sequence-engine`), baseline | 52 files, 449 tests passed |
| `npx vitest run` (in `packages/sequence-engine`), after | 53 files, 452 tests passed |
| `npx vitest run --config tests/config/vitest.config.ts tests/unit/loop/inverted-expand-interval.test.ts`, **pre-fix** | **19 of 29 failed**, including 6 of 8 end-to-end combo builds |
| same, post-fix | 29 passed |
| `npx vitest run tests/generation/overlay-seed-reroll.test.ts`, **pre-fix** | **3 of 3 failed** with `Overlay inversion requires the step count (2) to be divisible by the period (4).` |
| same, post-fix | 3 passed |
| `npx vitest run --config tests/config/vitest.config.ts tests/unit/services/loop-type-utils.test.ts tests/unit/loop src/lib/features/create/generate` | 34 files, 251 tests passed |
| `npx vitest run --config tests/config/vitest.config.ts` (full app unit suite) | 1973 files, 16006 passed, 106 skipped, 0 failed (715 s) |

Both fixes were verified fail-before / pass-after by stashing only the source
change and re-running the same test file.

---

## 9. Visual verification (focused pass)

`visual-verification-mandatory.md` classes this as a focused pass: a local
appearance change (one segment disabled, one caption string) that cannot affect
responsive structure. There is no dev server in this session, so the
configurator was mounted directly in the project's own browser test harness
(real Chromium via the components Vitest project, pointed at
`/opt/pw-browsers/chromium` because this container ships headless-shell build
1194 and Playwright 1.61 wants 1228). All four `inversionMode` × interval states
at 375×667 and 1440×900.

| State | Quarter segment | Selection pill | `aria-checked` |
| --- | --- | --- | --- |
| expand / 4 | `disabled`, opacity 0.45 | "At halfway" | halfway |
| expand / 2 | `disabled`, opacity 0.45 | "At halfway" | halfway |
| overlay / 4 | enabled, opacity 1 | "Every quarter" | quarter |
| overlay / 2 | enabled, opacity 1 | "At halfway" | halfway |

- The two expand screenshots are byte-identical at each viewport, so a config
  persisted with interval 4 is indistinguishable from interval 2 — the control
  cannot show a rhythm the generator will not use.
- Caption geometry is identical in all four states at both viewports
  (caption 32.8 px, ghost sizer 16.8 px, live line 16.8 px): **no layout shift**
  from the caption change; the existing ghost sizer still governs the height.
- Segment hit box 186.5×44.0 px at 375 wide and 719.0×44.0 at 1440 — the 44 px
  touch-target floor holds.
- The disabled treatment is `SegmentedControl`'s own `.segment:disabled`, not a
  local style.

Screenshots were captured to the scratchpad, not committed; the throwaway test
file used to drive them was removed and is not part of the diff.

## 10. Unverified / not run in this session

- **Only the two focused tiers** (375×667, 1440×900) were inspected. That
  matches the focused-pass rule for a change that adds and removes no elements,
  but the full seven-tier matrix was not run.
- **The configurator was rendered in isolation**, not inside the real LOOP
  overlay on a live route. Its own heading labels are white-on-transparent in
  the bare harness, so they wash out in the screenshots; in the product they sit
  on the overlay's dark panel. Interaction inside the real overlay (switching
  "Build the sequence" to "On top" and watching the quarter segment become
  available) was not exercised end to end.
- **Two pre-existing component-test failures** in
  `LOOPExpandedOverlay.svelte.test.ts` ("applies and closes a Single LOOP that
  has no settings", "keeps Combo transactional") time out in this container
  waiting on the *Swapped* picker button. Verified as pre-existing: they fail
  identically with the three changed source files checked out at the base SHA.
  Not investigated further — they are outside this task's domain.
- **Box grid** was spot-checked through the shared code path, but the 100-build
  rate tables are Diamond only.
- The Firestore feedback item itself was not read — no emulator or credentials
  in this environment. The investigation worked from the quoted text.
