> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-03-fable-loop-detection-audit-fixes-design.md`.

# LOOP Detection Audit — Handoff

**Date:** 2026-07-03
**Status:** one bug found + fixed + tested (not committed). Broader audit run, findings below. Fixes for the rest are deliberately **not** done — they need real judgment. That's the next agent's job.
**For:** whoever picks this up next (Fable 5). This is scaffolding, not a verdict. Trust the harness, re-verify the reasoning, decide the architecture yourself.

---

## 1. What happened / why this exists

A user pasted a 16-beat sequence labeled `loop: mirrored`. It was actually **mirrored + inverted**. Root cause: the functional detector detected the `inverted` component off a **rotation-direction flip**, but mirror+invert *preserves* rotation direction (mirror flips it, invert flips it back — they cancel). So inversion went undetected.

That one bug is **fixed** (see §6). Running a broader round-trip audit off the same insight surfaced a family of related misdetections across the detectors. This doc hands off the tooling + evidence so the real work — deciding what to fix, and how — can be done well.

---

## 2. Ground-truth transform signatures (the reference you shouldn't re-derive)

From `src/lib/features/create/shared/domain/transforms/transform-functions.ts` and the executors under `packages/sequence-engine/src/loop/execution/` + `src/lib/features/create/generate/circular/services/`:

| Transform | location | motionType (pro/anti) | rotationDirection | hand identity |
|---|---|---|---|---|
| **Rotated** | rotate | unchanged | **unchanged** | same |
| **Mirrored** | mirror (E↔W) | unchanged | **flip** | same |
| **Flipped** | flip (N↔S) | unchanged | **flip** | same |
| **Swapped** | from other hand | from other hand | from other hand | **exchanged** |
| **Inverted** | unchanged | **flip** | **flip** | same |
| **Rewound** | reverse (start↔end) | (reverse-dependent) | **flip** | same |

**The diagnostic principle:** a detector must recover each component using a signal that is **invariant to the other components present**. Consequences:
- `rotationDirection` is a **bad** signal for any component — it's flipped by mirror/flip/invert/rewound, so it **cancels** in composites (this was the original bug) and false-positives on singles.
- **positions** are moved by mirror/flip/rotate/swap → a component detected via an absolute position/location match breaks when a *different* component also moves that position.
- **motionType** (pro↔anti) is touched **only** by invert — but **swap exchanges the hands**, so a per-hand motionType comparison is cross-wired under swap. This is the deep one (see finding A).

---

## 3. The tool (this is the scaffolding)

`packages/sequence-engine/tests/loop/detection/round-trip-audit.test.ts`

Run:
```
npx vitest run --root packages/sequence-engine tests/loop/detection/round-trip-audit.test.ts
```

What it does: for each `LOOPType`, drives the **real** generator (`executeLOOPSpec` + `loopSpecFromLegacy`) to produce a full circular loop from a hand-built partial, runs **both** engine detectors, and compares recovered components to the type's decomposition. Soft-collects every mismatch and prints one table. It **never** modifies a detector.

**Load-bearing fixture caveats (read the file header):**
- Uses **non-axis diagonal** positions on purpose. On the axis orbit `{α1,α3,α5,α7}` a vertical mirror **coincides** with a 180° rotation, so axis fixtures make a pure mirror *also* look rotated (artifact).
- Fuse types use a **non-rotating** diagonal oscillation (α2↔α4); a partial that sweeps a full 360° **injects a real rotation** and confounds the audit.
- Hands carry **opposite** motion types (blue=pro/red=anti) so swap is observable and mirror/flip actually move positions.
- Partials are ≥4 beats so the functional `floor(halfLength·0.75)` threshold is a real `3`, not the degenerate `0` you get from a 1-beat partial.

**Trust boundary:** the loops are canonical (executor-generated), but the **partials are hand-built**, and a bad partial injects artifacts (the audit agent's first pass hit this). Treat the `+swapped`/`+rotated` *crosstalk* findings with more skepticism than the `(none)` *structural* findings. To de-risk: regenerate ground truth from **real** loops via MCP `generate_loop_sequence` or the app generator, not hand-built partials.

---

## 4. Detector inventory (5 implementations — audit covers 2)

| # | Detector | Path | Signal style | Audited by harness? |
|---|---|---|---|---|
| 1 | functional `detectLOOPFromSteps` | `packages/sequence-engine/src/loop/detection/LOOPDetector.ts` | simplest — position + location + (now) motionType. **MCP `detect_loop_pattern` + `scripts/import-sequence.cjs`.** | ✅ |
| 2 | class `loopDetectorClass.detectLOOPType` | same file | richer — motionType swap, position mirror/rotate, compound patterns | ✅ |
| 3 | app class `LOOPDetector.detectLOOPType` | `src/lib/shared/create/services/loop-detector.ts` | **near-identical copy of #2.** Used by `sequence-hydrator.ts` (stamps `loopType`) | ❌ (findings from #2 likely transfer) |
| 4 | loop-labeler pipeline | `src/lib/features/loop-labeler/services/**` (comparison/reflection-comparer, rotation-comparer, swap-invert-comparer + detection/run-unanimity-checks) | **most sophisticated** — rotation-direction-aware *per transform*, explicit composite targets, unanimity across all pairs | ❌ (needs its own harness — see open Qs) |
| 5 | `.cjs` labelers | `scripts/auto-label-loops.cjs`, `scripts/validate-loop-detection.cjs` | motionType-based (`invertMotionType(...) === ...`) | ❌ |

`#1` was the reported bug's source. `#4` is the likely gold standard (it's the one that already models per-transform rotation-direction behavior) but is **unverified** — extending the harness to it is the highest-value next step.

---

## 5. Empirical findings (from the round-trip harness — treat as leads, not gospel)

Recovery table, clean non-axis fixtures. Only 4 PASS cells total.

| LOOPType | detector | expected | actual | result |
|---|---|---|---|---|
| rotated | functional | rotated | rotated+swapped | FAIL |
| rotated | class | rotated | rotated | **PASS** |
| mirrored | functional | mirrored | (none) | FAIL |
| mirrored | class | mirrored | (none) | FAIL |
| flipped | functional | flipped | (none) | FAIL |
| flipped | class | flipped | (none) | FAIL |
| swapped | functional | swapped | inverted | FAIL |
| swapped | class | swapped | swapped | **PASS** |
| inverted | functional | inverted | inverted | **PASS** |
| inverted | class | inverted | inverted+swapped | FAIL |
| swapped_inverted | both | inverted+swapped | (none) | FAIL |
| rotated_inverted | functional | inverted+rotated | inverted+rotated+swapped | FAIL |
| rotated_inverted | class | inverted+rotated | inverted+rotated+swapped | FAIL |
| mirrored_swapped | functional | mirrored+swapped | inverted | FAIL |
| mirrored_swapped | class | mirrored+swapped | swapped (−mirrored) | FAIL |
| mirrored_inverted | functional | inverted+mirrored | inverted (−mirrored) | FAIL |
| mirrored_inverted | class | inverted+mirrored | inverted+swapped (−mirrored) | FAIL |
| rotated_swapped | functional | rotated+swapped | inverted+rotated+swapped | FAIL |
| rotated_swapped | class | rotated+swapped | rotated+swapped | **PASS** |
| mirrored_rotated | both | mirrored+rotated | (none) | FAIL |
| mirrored_inverted_rotated | functional | inv+mir+rot | inverted | FAIL |
| mirrored_inverted_rotated | class | inv+mir+rot | inverted+rotated+swapped | FAIL |
| mirrored_swapped_inverted | both | inv+mir+swap | (none) | FAIL |
| mirrored_rotated_swapped | functional | mir+rot+swap | inverted | FAIL |
| mirrored_rotated_swapped | class | mir+rot+swap | rotated+swapped | FAIL |
| mirrored_rotated_inverted_swapped | both | all four | (none) | FAIL |
| rewound | both | rewound | (none) | FAIL |

### Root causes (audit agent's tiering, lightly edited)

**Tier 1 — solid (cross-detector or code confirmed):**
- **A. Swap and invert are aliased on the motionType signal (opposite-typed hands).** Functional collapses swap→"inverted"; class inflates invert→"swapped+inverted". Characterization proof: with **same-type** hands (pro/pro) the alias vanishes (`swapped` becomes invisible to both; `inverted` is clean for class). The signal that separates them is *hand identity / letters*, which both detectors ignore here.
- **B. swap∘invert cancels on motionType → both report `(none)`.** Swap exchanges the hands' types, invert flips each back → per-hand motionType is unchanged between halves. `swapped_inverted`, `mirrored_swapped_inverted`, `mirrored_rotated_inverted_swapped` all vanish.
- **C. No FLIPPED detection path exists (structural).** `detectLOOPFromSteps` never checks flip; class's `deriveLoopTypeFromComponents` has a FLIPPED branch but nothing ever adds `LOOPComponent.FLIPPED`.
- **D. No REWOUND detection path exists (structural).** Neither checks time-reversal.
- **E. Functional rotation crosstalk.** The functional swap/invert checks run on *every* loop and misfire on rotated loops with opposite-typed hands (`rotated → rotated+swapped`, etc.). Class rotation is robust.

**Tier 2 — nuanced (generator/detector contract mismatch, phase-dependent):**
- **F. Mirror detection is phase-fragile.** Both check an **absolute index-wise** mirror `VMIRROR(endPos[i]) === endPos[i+half]`. The executor emits *continuous* loops, so that only holds when the half lands on a mirror-fixed position. Contrast: `MIRRORED axis-orbit → FUNC=[mirrored]`, `MIRRORED diagonal-orbit → FUNC=[-]`. Whether this is a detector bug or a generator/detector semantics mismatch is a **judgment call** — hence Tier 2.

---

## 6. What's already done (verified)

- **Fix:** `packages/sequence-engine/src/loop/detection/LOOPDetector.ts` → `checkInvertedPattern` rewritten from rotation-direction flip to **motionType pro↔anti flip** (genuine-flip-and-no-contradiction). Kills both the false-negative (mirror+invert) and the false-positive (pure mirror reporting inverted).
- **Regression test:** `packages/sequence-engine/tests/loop/detection/mirrored-inverted-detection.test.ts` — the real reported sequence (MCP-verified letters Ψ Σ- Y Φ K Θ U X- / Ψ Δ- Z Φ J Ω V W-). Functional now emits `mirrored+inverted`; class stays `MIRRORED_INVERTED`.
- **Audit harness:** §3.
- Full `packages/sequence-engine` suite: **226 tests pass**; `tsc -b` build clean.
- **NOT committed.** Working-tree only.

---

## 7. Open questions / decisions for the next agent (deliberately unresolved)

These are the judgment calls. I'm not making them.

1. **Which detectors even matter?** There are 5 near-duplicate implementations. Is the answer to *fix* the simple ones, or to make MCP/import/hydration **delegate to one canonical detector** (probably the loop-labeler, #4)? Consolidation may beat five parallel fixes. This is an architecture decision.
2. **Is the loop-labeler (#4) actually correct?** It's the sophisticated, rotation-aware one and is *unaudited*. Highest-value next step: **extend the harness to #4** (and #3, #5). If #4 is already right, the fix is "route everything through it," not "patch the others."
3. **Swap vs invert disambiguation (finding A/B).** Both key off motionType, which swap and invert both perturb. The separating signals are **hand identity** (swap exchanges hands; invert doesn't) and **letters** (`INVERTED_LETTER_MAP` vs hand-swap geometry). What's the right invariant to compare? This is the core design question.
4. **Mirror phase-fragility (finding F).** What are the *intended* detection semantics — absolute index-wise mirror, or continuous/orientation-aware? The generator emits continuous loops; the detector assumes index alignment. Which side is "right"?
5. **Flipped + Rewound (C/D):** no detection path at all. Intentional scope cut, or a genuine gap to fill?
6. **Prioritize by reality.** Which loop types actually get generated / stored / surfaced to users? A misdetection on a type nobody makes is lower priority than one on a common type. Check the deck enumerator / catalog / real corpus before spending effort.
7. **Fixture trust.** Re-confirm the Tier-1 crosstalk findings against **real** generated loops (MCP `generate_loop_sequence` / app generator), not hand-built partials, before treating any single-cell result as ground truth.

---

## 8. Suggested (not mandated) sequence

1. Extend `round-trip-audit.test.ts` to cover detectors #3, #4, #5.
2. Re-ground fixtures on real generator output to kill artifact risk.
3. Decide #1/#2 (consolidate vs patch) → then implement per that decision, TDD off the harness.
4. Commit the §6 fix + tests (currently uncommitted) once the direction is set, or fold it into the larger change.

---

## Files

- Fix: `packages/sequence-engine/src/loop/detection/LOOPDetector.ts` (`checkInvertedPattern`)
- Regression test: `packages/sequence-engine/tests/loop/detection/mirrored-inverted-detection.test.ts`
- Audit harness: `packages/sequence-engine/tests/loop/detection/round-trip-audit.test.ts`
- Signature source: `src/lib/features/create/shared/domain/transforms/transform-functions.ts`
- Detectors: see §4 table.
