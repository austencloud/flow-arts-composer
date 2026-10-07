---
status: active
value: 3
effort: L
remaining: "Compare app, create-module, MCP, and sequence-engine derivers with the proposed collapse before implementation; no present completion evidence is recorded."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Deriver Collapse — Design

> Collapse every orientation / motion-type deriver to ONE canonical copy in
> `packages/render-core`, the intended shared home that the app and both MCP
> servers already import. Three sub-jobs (A lift, B correctness-fix, C superset
> absorption), all in scope.

**Date:** 2026-05-30
**Status:** Design — awaiting review
**Related:** `docs/superpowers/specs/2026-05-30-canonical-minimal-codec-design.md` (the codec that consumes these derivers), `.claude/rules/verify-at-canonical-source.md`, `.claude/rules/mcp-ground-truth.md`

---

## 1. Problem

The orientation algebra and motion-type classification logic exist in **four**
divergent copies. Drift was hand-maintained; there is no sync script. The canonical
codec work (2026-05-30) added two derivers (`deriveMotionType`,
`deriveHandOrbitalDirection`) to only one copy, widening the drift.

### 1.1 Verified divergence map (ground-truthed this session, not from stale notes)

| # | File | `calculateEndOrientation` algorithm | Derivers present? | Verdict |
|---|---|---|---|---|
| 1 | `packages/render-core/src/calculations/orientation.ts` | **Canonical**: `RADIAL_CW_CYCLE` 8-point cycle, center compass cycle, fractional + whole + float | **No** | The home. Missing only derivers. |
| 2 | `src/lib/shared/render/core/calculations/orientation.ts` (app deep-import copy) | Canonical (byte-identical algo) | **Yes** (`deriveMotionType`, `deriveHandOrbitalDirection` — added by codec Task 1) | Superset. The codec deep-imports this. |
| 3 | `packages/sequence-engine/src/core/orientation/OrientationCalculator.ts` | Canonical (byte-identical modulo comments + inline-vs-named `OrientationInput`) | No | **Already correct.** Dedupe only — NOT behavioral. |
| 4 | `mcp-server/src/core/orientation-calculator.ts` | **OLD / WRONG**: `calculateWholeTurnOrientation` + `calculateHalfTurnOrientation`. No `RADIAL_CW_CYCLE`, no center handling, no interradial fractional. | No | The only behavioral correctness target. |
| 5 | `src/lib/features/assemble-lab/state/assemble-state.svelte.ts` (`calculateEndOrientation`, ~line 498) | **Trig**: continuous angle math (`turnCount * PI`), pro/anti from arc-sign, plus a `RADIAL_TO_CENTER` hash translation. Different signature, no `motionType` input. "Mirrors SvgPropAnimator." | n/a | Separate algorithm. Reconcile then collapse. |

**Correction vs prior session notes:** earlier notes claimed both sequence-engine
(#3) and mcp-server (#4) ran the old algorithm. Verified false — #3 is already
canonical (comment drift only). **The behavioral fix is one file: #4.**

### 1.2 Partial motion-type classifiers (create module)

Two byte-identical partial copies, signature `(motion: MotionData, newRotationDirection: RotationDirection): MotionType`:

- `src/lib/features/create/shared/services/rotation-direction-pattern-manager.ts:353` (`deriveMotionType`), `:338` (`deriveHandOrbitalDirection`), `:327` (`CW_PAIRS`/`CCW_PAIRS`)
- `src/lib/features/create/shared/services/step-operations/rotation-direction-handler.ts:400` / `:375` / `:360`

Both are **partial**: they only reclassify when the stored `motionType` is already
PRO/ANTI, and otherwise return the stored value (a fallback the full canonical
`deriveMotionType` does not need). Each carries its own `CW_PAIRS`/`CCW_PAIRS` table.

---

## 2. Goal & Architecture

**One** copy of the orientation algebra + both derivers, in `packages/render-core`.
Everything else re-exports it.

```
packages/render-core/src/calculations/orientation.ts   ← ONLY copy: algo + derivers + hash translation
        ▲ @tka/render-core (file: dep, already wired into app + both MCP servers)
        │
  ┌─────┼──────────────────┬─────────────────────┬──────────────────────┐
  app deep-import         sequence-engine        mcp-server            assemble-lab
  ($lib/.../orientation    OrientationCalculator  orientation-calculator (adapter →
   re-exports render-core; (retained copy,        (re-export)            canonical)
   derivers move up)        snapshot-guarded)
```

Feasibility verified: `mcp-server/package.json` declares `"@tka/render-core":
"file:../packages/render-core"` and already imports from it
(`core/enums.ts`, `core/standalone-renderer.ts`). Packages must not import app
`$lib`; this design never asks them to — flow is always app → package.

---

## 3. Sub-job A — Lift derivers; collapse app + create-module copies

### A1. Lift derivers into render-core
Move `deriveHandOrbitalDirection` and `deriveMotionType` (the FULL five-value
classifier, no stored fallback) from copy #2 into copy #1
(`packages/render-core/src/calculations/orientation.ts`). Export both from
`packages/render-core/src/index.ts` alongside the existing `calculateEndOrientation`
export. They reuse the canonical `getHandpathDirection` already in that file —
no new pair tables.

Canonical signatures (already validated by the codec's corpus parity test):

```ts
export function deriveHandOrbitalDirection(
  startLocation: string,
  endLocation: string
): "cw" | "ccw" | null;

export function deriveMotionType(
  startLocation: string,
  endLocation: string,
  rotationDirection: string, // accepts "cw"/"ccw"/"noRotation" OR codec "c"/"u"/"x"
  turns: number | "fl"
): "pro" | "anti" | "float" | "dash" | "static";
```

### A2. App copy → re-export
Replace the body of `src/lib/shared/render/core/calculations/orientation.ts` with a
re-export of `@tka/render-core` (algo there is already canonical-identical, and the
derivers now live there too). The codec's import path
(`$lib/shared/render/core/calculations/orientation`) is unchanged — it just resolves
to the re-export. Deletes the duplicated algo body + the two derivers from the app.

### A3. Collapse the two create-module partial classifiers
Replace both partial `deriveMotionType` copies with a single thin adapter that
preserves their PRO/ANTI-only-with-stored-fallback semantics on top of the canonical
deriver:

```ts
// shared helper (new), e.g. src/lib/features/create/shared/services/motion-type-from-rotation.ts
import { deriveMotionType as canonicalDeriveMotionType } from "$lib/shared/render/core/calculations/orientation";
import { MotionType, RotationDirection, type MotionData } from "...";

/** Reclassify PRO/ANTI by new rotation direction; leave non-shifts unchanged. */
export function motionTypeFromRotation(
  motion: MotionData,
  newRotationDirection: RotationDirection
): MotionType {
  if (motion.motionType !== MotionType.PRO && motion.motionType !== MotionType.ANTI) {
    return motion.motionType; // preserve create-module fallback contract
  }
  return canonicalDeriveMotionType(
    motion.startLocation,
    motion.endLocation,
    newRotationDirection,
    motion.turns
  ) as MotionType;
}
```

Both call sites import this helper; delete both local `deriveMotionType`,
`deriveHandOrbitalDirection`, `CW_PAIRS`, `CCW_PAIRS`. Behavior is preserved (the
fallback guard is retained), so A3 is a non-behavioral dedupe verified by existing
create-module tests + a targeted unit test asserting the helper matches the old
output on the PRO/ANTI shift cases.

---

## 4. Sub-job B — mcp-server correctness-fix; sequence-engine dedupe

### B1. mcp-server (behavioral)
Delete the old `calculateEndOrientation` / `calculateOrientations` /
`calculateHalfTurnOrientation` from `mcp-server/src/core/orientation-calculator.ts`.
Re-export from `@tka/render-core`:

```ts
export { calculateEndOrientation, calculateOrientations } from "@tka/render-core";
export type { Orientation, OrientationInput } from "@tka/render-core";
```

Four consumers — `adapters/NodeDataProvider.ts:16`, `core/orientation-propagation.ts:8`
& `:143`, `shared/server-context.ts:13` — use `calculateOrientations` /
`calculateEndOrientation` with the same `OrientationInput` shape, so no call-site
change. This **changes mcp-server output** for quarter-turns, turns ≥ 4, interradial
(L6) start orientations, and center/hash orientations — the old algorithm was wrong
on all of these. That is the fix.

### B2. sequence-engine (intentionally retained, guarded)
`packages/sequence-engine` depends only on `@tka/tka-types` (workspace) and its
orientation file states "Inlined from @tka/render-core **to remove that dependency**"
— the render-core dep was deliberately decoupled. Do **not** re-add it. Instead, leave
sequence-engine's already-canonical copy in place and pin it to the golden-corpus
snapshot (Section 6) so any future drift fails CI. sequence-engine output does not
change. This is the one intentional copy; everywhere else re-exports.

### B3. Correctness proof — golden-corpus oracle
Canonical output IS the oracle (locked decision: B is correctness-by-construction, no
reachability analysis). Test:

1. Enumerate the corpus: every distinct `(startLocation, endLocation)` motion present
   in both `static/data/pictographs/DiamondPictographDataframe.csv` and
   `BoxPictographDataframe.csv`, crossed with: all 8 radial start-orientations + 8
   center start-orientations, `turns ∈ {0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4}`,
   `rotationDirection ∈ {cw, ccw}`, plus float (`turns = "fl"`).
2. Compute canonical `calculateEndOrientation` for each; serialize to a committed
   snapshot fixture (`tests/unit/codec/fixtures/orientation-golden-corpus.json`).
3. Assert canonical == snapshot (pins the oracle against future regressions).
4. Separately, run the OLD mcp algorithm over the same corpus and **log** (do not
   assert) the diff count + sample diffs, as documentation of what B fixed. This log
   is informational; failures here are expected and ignored.

---

## 5. Sub-job C — assemble-lab: canonical absorbs hash translation (superset), then full collapse

### C1. Domain grounding (MCP-verified 2026-05-30)
`get_domain_topic` (Center-Relative Orientation System) confirms:
- All orientations are measured prop→center. Center-point orientation uses **compass**
  directions (`centerN … centerNW`); perimeter orientation uses radial/nonradial/
  interradial.
- Hashing perimeter↔center preserves the prop's **absolute spatial direction**; the
  radial↔compass relabel is pure geometry. Spot-check: NORTH + `in` (toward center =
  points south) → `centerS`, matching assemble-lab's `RADIAL_TO_CENTER[NORTH].in`.
- Hash turn rule = dash rule (even turns = switch, odd = same). Canonical
  `switchOrientation` already carries the center compass pairs (`centerN↔centerS`, …).

So the `RADIAL_TO_CENTER` translation is domain-correct, not an app invention, and is
the behavior canonical currently **lacks** for hash (canonical applies the dash-switch
rule in radial space and returns a radial orientation for hashIn — wrong space).

### C2. Canonical absorbs the translation (the real fix)
Add to `packages/render-core/src/calculations/orientation.ts`:
- `RADIAL_TO_CENTER` (per-perimeter-location radial→compass map) + its derived inverse
  `CENTER_TO_RADIAL`, ported from assemble-lab and validated against
  `DIAMOND_PROP_ANGLES`/`BOX_PROP_ANGLES`.
- In `calculateEndOrientation`, before the existing branches, detect hash by location:
  - **hashIn** (`endLocation === center`, start ≠ center): translate `startOrientation`
    radial→compass via `RADIAL_TO_CENTER[startLocation]`, then apply dash whole-turn
    rule (`switchOrientation` is already correct in compass space).
  - **hashOut** (`startLocation === center`): translate compass→radial via
    `CENTER_TO_RADIAL[endLocation]`, then apply dash whole-turn rule.
  - Fractional hash turns: extend to the existing center fractional path
    (`calculateCenterFractionalTurnOrientation` already walks `CENTER_CW_CYCLE`) so hash
    is correct at quarter-turn granularity too (a strict superset of assemble-lab,
    which only floors to whole turns for hash).

This makes canonical correct for **every** case — the one algorithm the app, both MCP
servers, and assemble-lab all share.

### C3. Prove-equivalent → replace
1. Build a cross-check test: for the full input space (all locs × all start-oris ×
   turns × rotDirs), compare assemble-lab's trig `calculateEndOrientation` against a
   canonical **adapter**:
   ```ts
   function endOrientationAdapter(startOri, startLoc, endLoc, rotDir, turnCount) {
     const motionType = deriveMotionType(startLoc, endLoc, rotDir, turnCount);
     return calculateEndOrientation({ motionType, turns: turnCount, rotationDirection: rotDir,
                                      startLocation: startLoc, endLocation: endLoc,
                                      startOrientation: startOri });
   }
   ```
2. Classify results:
   - **perimeter↔perimeter (pro/anti/dash/static):** expected equivalent → the adapter
     replaces the trig algo for these.
   - **hash / center-start:** after C2, expected equivalent (canonical now does the
     translation). For whole-turn hash, canonical == old assemble-lab; for fractional
     hash, canonical is a superset (old assemble-lab floored). The test asserts
     whole-turn agreement and records fractional-hash as a documented superset gain.
   - **Any residual disagreement:** canonical is the oracle (locked decision) — log the
     trig discrepancy, canonical wins.
3. Replace assemble-lab's `calculateEndOrientation` with the adapter. Delete its
   `RADIAL_TO_CENTER`/`CENTER_TO_RADIAL`, the trig helpers (`oriToStaffAngle`,
   `staffAngleToOrientation`, `isOpposite`, etc.) **only if** they have no other caller
   in the file (grep first; some may be shared with SvgPropAnimator-adjacent code).
   `SvgPropAnimator` itself is out of scope for this collapse (it is a render-time
   animator, not a deriver) and is noted as future follow-up.

---

## 6. Anti-drift guard (replaces the dead hand-sync)

A single CI parity test (`tests/unit/codec/deriver-parity.test.ts`, extend the
existing one) asserts that every re-export resolves to the render-core symbol:
- `@tka/render-core`'s `calculateEndOrientation` === app deep-import's ===
  mcp-server's (function identity where re-exported; output-equality on the golden
  corpus where a copy is intentionally retained, e.g. sequence-engine if it stays
  self-contained).
- The golden-corpus snapshot (Section 4) is the shared oracle all copies are checked
  against. Any future divergence fails CI.

---

## 7. Out of scope
- `SvgPropAnimator` render-time staff-angle math (animator, not a deriver).
- The codec format itself (already shipped 2026-05-30).
- Any change to `MotionType` (5 values) or `HandPath` (6 values incl. hashIn/hashOut)
  enums.

---

## 8. Risk & verification summary

| Sub-job | Behavioral? | Proof |
|---|---|---|
| A1/A2 lift + app re-export | No (algo already identical) | Existing codec corpus parity (58 tests) stays green |
| A3 create classifier dedupe | No (fallback preserved) | Targeted unit test: helper == old output on PRO/ANTI shifts; create tests green |
| B1 mcp-server | **Yes (correctness-fix)** | Golden-corpus oracle snapshot; old-algo diff logged as documentation |
| B2 sequence-engine | No | Dedupe; parity snapshot |
| C2 canonical hash absorption | **Yes (superset gain)** | MCP-grounded; cross-check test; golden corpus extended with hash + center cases |
| C3 assemble-lab collapse | Equivalent (perimeter) / superset (hash) | Prove-equivalent cross-check before replace |

All gates: `npm run check` (one full pass pre-commit), full codec + new tests green,
no dead refs to deleted symbols, `npm run build` rc=0.
