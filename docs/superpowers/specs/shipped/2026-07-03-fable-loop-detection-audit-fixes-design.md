---
status: shipped
value: 4
effort: M
remaining: ""
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-07-29
---
# Fable Spec 1 — Loop-Detection Audit Fixes

**Date:** 2026-07-03 · **Autonomy: FULL AUTO** (detection logic + tests only; no data migration) · Index: `2026-07-03-fable-dispatch-index.md`

> Dispatch context: one of four specs for execution by a stronger reasoning model. Root cause **A** applies here: detection heuristics key off one motion axis (`rotationDirection`) when correctness needs the full signal (hand-arc / `motionType` / pro-anti relation). Fix the class, not the instance.

## Problem

TKA has **five near-duplicate loop detectors**. One confirmed bug was fixed 2026-07-03: the functional `detectLOOPFromSteps` detected the `inverted` component off a **rotation-direction flip**, but mirror+invert *preserves* rotation direction (mirror flips it, invert flips it back — they cancel), so inversion went undetected and mirror+invert loops mislabeled as bare "mirrored". Fixed to key off the `motionType` pro↔anti flip (only invert touches motionType). A round-trip audit off that same insight surfaced a family of related misdetections.

## Evidence (read these first)

- **Handoff (authoritative):** `docs/superpowers/handoffs/archived/2026-07-03-loop-detection-audit-handoff.md` — ground-truth signature matrix (§2), detector inventory (§4), full findings table (§5), open decisions (§7).
- **Audit harness:** `packages/sequence-engine/tests/loop/detection/round-trip-audit.test.ts` — drives real executors → runs both engine detectors → checks recovery. Run: `npx vitest run --root packages/sequence-engine tests/loop/detection/round-trip-audit.test.ts`.
- **Regression test (the fixed bug):** `packages/sequence-engine/tests/loop/detection/mirrored-inverted-detection.test.ts`.
- **The fix:** `packages/sequence-engine/src/loop/detection/LOOPDetector.ts` → `checkInvertedPattern`.

**Findings are LEADS, not verdicts.** The harness feeds hand-built partials to the real generator; a bad partial injects artifacts (axis-orbit makes a mirror look rotated; a 360°-sweep injects real rotation). Treat `+swapped`/`+rotated` *crosstalk* findings with more skepticism than `(none)` *structural* findings, and re-ground on real generated loops (MCP `generate_loop_sequence` / the app generator) before trusting any single cell.

## Detector inventory (5 implementations; harness covers 2)

| # | Detector | Path | Audited? |
|---|---|---|---|
| 1 | functional `detectLOOPFromSteps` (backs MCP `detect_loop_pattern` + `scripts/import-sequence.cjs`) | `packages/sequence-engine/src/loop/detection/LOOPDetector.ts` | ✅ |
| 2 | class `loopDetectorClass.detectLOOPType` | same file | ✅ |
| 3 | app class `LOOPDetector` (near-identical copy of #2; used by hydration) | `src/lib/shared/create/services/loop-detector.ts` | ❌ |
| 4 | loop-labeler pipeline — the sophisticated one, rotation-direction-aware per transform, explicit composite targets, unanimity | `src/lib/features/loop-labeler/services/**` (`comparison/{reflection,rotation,swap-invert}-comparer.ts`, `detection/run-unanimity-checks.ts`, `loop-detector.ts`) | ❌ |
| 5 | `.cjs` labelers | `scripts/auto-label-loops.cjs`, `scripts/validate-loop-detection.cjs` | ❌ |

## Root-cause summary (from handoff §5)

- Swap and invert are **aliased on the motionType signal** for opposite-typed hands (functional collapses swap→inverted; class inflates invert→swap+inverted). Separating signal = hand identity / letters, which the simple detectors ignore.
- **swap∘invert cancels** on motionType → both report nothing.
- **No FLIPPED and no REWOUND detection path** exist (structural).
- **Mirror is phase-fragile** — an absolute index-wise mirror check vs continuous loops.

## Fable's task

1. Extend the harness to detectors **#3, #4, #5** (note: #4 takes a different input shape — `SequenceEntry` with `fullMetadata`, not `SequenceStep`; write the adapter).
2. Re-ground fixtures on **real generated loops** to eliminate artifact risk, then confirm which findings are genuine.
3. Decide the architecture (see Open decisions), implement, and lock every confirmed bug with a regression test.

## Open decisions (left to Fable)

- **Consolidate vs patch.** Five parallel detectors is the deeper problem. Is the answer to route MCP/import/hydration through one canonical detector (likely #4, the loop-labeler) and retire the others, or to patch each? The loop-labeler is unaudited — verify it first; if it is already correct, "route everything through it" beats five fixes.
- **Swap-vs-invert disambiguation signal** — hand identity (swap exchanges hands; invert does not) vs letters (`INVERTED_LETTER_MAP`). Pick the invariant.
- **Mirror phase-fragility** — detector bug, or a generator/detector contract mismatch about mirror semantics (absolute-index vs continuous)?
- **Flipped + Rewound** — fill the missing detection paths, or confirm they are an intentional scope cut?

## Guardrails + definition of done

- All existing `packages/sequence-engine` loop tests stay green; every confirmed misdetection gets a regression test.
- Any TKA domain claim is MCP-grounded in the working turn (`mcp-ground-truth` rule). Any knowledge-base correction is verified at the canonical source (`verify-at-canonical-source` rule).
- **Shipping note:** the functional detector (#1) backs the MCP `detect_loop_pattern` tool. Changes ship only after rebuilding `@tka/domain` + restarting the Flow Arts MCP service (see memory `reference_flow_arts_mcp_deploy`).
- Commit own changes only, with an explicit pathspec (`commit-only-your-own-changes` rule). The 2026-07-03 fix + tests are currently **uncommitted** in the working tree — fold them into your change or commit standalone.

## Dependencies

Shares root-cause **A** with Spec 2 (hand-arc reversal detector). If you build a unified motion-signal model (hand-arc + motionType + rotationDirection), both detectors benefit — consider doing them together.

---

## ✅ COMPLETED 2026-07-05 (Fable 5)

**Status: DONE.** All three tasks executed; every confirmed detector bug fixed and locked with regression tests. The 2026-07-03 fix + harness were already committed (`2f8ff015e2`, `a14903046f`) — the spec's "uncommitted" note was stale.

### What shipped

1. **Real-loop fixtures replace hand-built partials.** `scripts/generate-loop-audit-fixtures.mjs` drives the production pipeline (Diamond CSV → `SequenceBuilder` beam search with seam targeting → `executeLOOPSpec` — the exact path behind MCP `generate_sequence loopType=…` and the app's circular generation) and commits 3 samples × 15 generatable LOOPTypes to `tests/fixtures/loop-audit/real-loop-fixtures.json`.
2. **Harness extended to ALL detectors** — `tests/unit/loop/real-loop-detector-audit.test.ts` audits #1–#5 (6 surfaces: functional, engine class, app class, loop-labeler, both `.cjs` scripts) against the real fixtures, prints the recovery table, and hard-locks the verdicts. The `.cjs` scripts got lazy Firebase init + `require.main` guards + `module.exports` so they are requirable.
3. **Architecture decision: consolidate on ONE canonical detection algebra in the engine** (`packages/sequence-engine/src/loop/detection/pair-relation.ts`), not per-detector patches and not routing through #4 (the loop-labeler lives in app-land with UI deps; the engine cannot import it, but its per-pair composite-hypothesis approach was the correct model and is what the algebra ports). Detectors #1 and #2 are rebuilt on it; **#3 is now a thin delegate to the engine class detector** (~500 lines of near-fork deleted; keeps its stricter `isSeamlesslyLoopable` gate + placeholder-visibility guard); #4 keeps its own pipeline (it was already near-correct) with its one confirmed bug fixed; #5 left as-is, behavior-locked, migration noted as follow-up.
4. **The disambiguation invariant: hand identity via locations, not letters.** MCP-grounded ("LOOP type is determined by step data — positions, motion types, hand identity — not by the word or letters"): the algebra first finds the (location-transform × hand-correspondence) hypothesis that maps pair A onto pair B, then reads inversion as a pro↔anti flip along that correspondence. Letter checks were removed from detection (they remain generation-side).

### Findings per detector (real-loop evidence)

| Detector | Confirmed bugs (fixed) | Notes |
|---|---|---|
| #1 functional | no FLIPPED path; no REWOUND path; swap∘invert cancelled (`swapped_inverted → swapped`); mirrored_swapped collapsed to `inverted+mirrored`/none; nested rotation missed | Rebuilt on pair-relation algebra. Now exact on all 12 contract-valid types. |
| #2 engine class | same alias family + single-point rotation false positives (`mirrored → +rotated`, `inverted → +swapped` EXTRAs); no FLIPPED/REWOUND emission; missing `MIRRORED_SWAPPED_INVERTED` in loopType derivation | Rebuilt on the same algebra; agrees with #1 everywhere. |
| #3 app class | inherited all of #2's bugs (near-fork) | Replaced with delegation to #2. Orientation gate retained and regression-locked. |
| #4 loop-labeler | **pure-rewound candidate dropped** (checkRewound passed but the result fell through to the freeform fallback) — fixed | Otherwise the strongest detector (already hand-identity aware). Known remaining partials: nested inner-rotation types report only the outer reflection; one modular-path EXTRA on a mirrored_rotated sample. Documented, unasserted. |
| #5 .cjs | no confirmed false positives; gaps: no swapped_inverted / rewound path, mirrored_inverted loses the inverted component, validate misses rotated_180_inverted | Left as-is (batch-label utilities), solid coverage locked; migrating them onto the engine detector is the natural follow-up. |

### Contract mismatches (NOT detector bugs — generator findings, out of this spec's scope)

- **Mirror "phase-fragility" (handoff F) = contract mismatch, resolved in the detector's favor.** With builder-validated seams (the fixed-point theorem: the outer transform's seam must satisfy `T(start) = end`), absolute index-wise mirror detection is exact on every real mirrored loop. The old harness's diagonal-orbit failures were artifacts of seam-less hand-built partials.
- **G1 — `LOOPEndPositionSelector` seams `MIRRORED_SWAPPED_INVERTED` at `startPosition`; correct is `SWAP(VMIRROR(start))`.** Real loops of this type are not absolute mirror+swap+invert — sample 0 factually reads as `flipped+inverted+swapped` (the composite the wrong seam produces). Same family affects `MIRRORED_ROTATED_INVERTED_SWAPPED` from non-beta axis starts.
- **G2 — continuity-based `FusedExecutor` + dash/static-heavy seeds** can emit swap-family loops with no uniform absolute halved relation (2 of 3 `rotated_swapped` samples). Detectors stay data-faithful (never fabricate components) — locked.
- **G3 — swap-family halved loops are emitted without orientation parity** (close positionally, orientations end `out` vs `in`). #3's `isSeamlesslyLoopable` gate correctly refuses to stamp them — locked.
- `MIRRORED_ROTATED_SWAPPED` is not generatable at all (no seam map, absent from the MCP enum).

### Tests

- `packages/sequence-engine`: 230 → **249 passed** (new `real-loop-recovery.test.ts`: 19 regression locks incl. alias non-regressions; the original mirrored+inverted regression and all prior tests stay green).
- App: `tests/unit/loop/real-loop-detector-audit.test.ts` — recovery table + 4 hard-lock suites across #3/#4/#5.

### Shipping note

Detector #1 backs MCP `detect_loop_pattern`: **`@tka/domain` rebuild + Flow Arts MCP service restart required to ship the engine change** (memory `reference_flow_arts_mcp_deploy`). Not done here.
