---
status: backlog
value: 2
effort: L
remaining: Current source has the withCheat verdict type but no depth-feasibility solver or solveStepDepth producer; implement the Phase 3 solver and scanner path.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: ready
---

# Wall-Plane Depth-First Joint Feasibility Solver — Design (Phase 3)

**Date:** 2026-07-13
**Status:** Approved (brainstormed with Austen 2026-07-13). **Targeted for Fable 5 execution at xhigh effort** — see Fable Handoff.
**Builds on:** `docs/superpowers/specs/2026-07-13-wall-plane-feasibility-design.md` (Phases 0–2) and its plan `docs/superpowers/plans/2026-07-13-wall-plane-feasibility.md`. This spec supersedes that plan's Tasks 8/9/11 (the concavity-only detection wiring), which were paused.

## Why This Exists (the finding that reshaped Phase 3)

Phases 0–2 shipped a petal path model, an offline swept-tube feasibility scanner, dual-wheel fallback, and a minimum-depth concavity solver. Building the concavity solver produced a hard empirical result (commit `acb57580f7`, memory `reference_concavity_needs_depth_coupling`):

**In-plane concavity alone does not clear wall-plane arm collisions.** As `concaveDepth k` → 1 the swept path is pulled toward the grid center, which in the collision model is toward the torso, so `prop-through-torso` penetration *rises*. Across 13+ synthetic ANTI configurations, none collided at k=0 and cleared at k=1.

The physical reason matches what Austen described from practice: the real deep-concave cheat also pulls the staff **off the wall plane** in depth (nearer to or behind the body, under the shoulder / through the armpit gap), so it passes the other arm on the depth axis, not the in-plane radius. Concavity (in-plane radius) and depth (z-offset) are **coupled, not separable**. Phases 2 and 3 were specced as independent; they are one mechanism. Depth is the primary lever; concavity is aesthetic polish and a minor tiebreak.

## Feasibility Verified (investigation 2026-07-13)

An offline depth solver is validatable **today** with no change to the collision model. Evidence (all `file:line` in `src/lib`):

- **`StanceSimulator` is fully 3D.** `Skeleton` joints are all `Vector3` (`features/lab/tabs/collision-lab/services/stance-simulator.ts:82-95`). `restPoseFromHeight` builds shoulders/spine/hips in 3D (`:973-980`). `applyStance` rotates `local.z` under pitch/yaw (`:367-389`).
- **The torso primitive has a real depth half-axis.** `ellipsoidSegmentDepth` (`:839-859`) is an oriented ellipsoid with three independent half-axes: `torsoHalfWidth = 0.078·h`, `torsoHalfDepth = 0.053·h`, `torsoHalfHeight = 0.067·h` (`:988-990`; at h=1.8m ≈ 0.14 / 0.095 / 0.12 m). Separation is projected onto `_torsoForward` (the z basis) via direction cosines (`:853,856`).
- **All collision tests use true 3D distance** — `pointToSegmentDistance` / `segmentToSegmentDistance` (`:885-940`) include dx, dy, **dz**. Nothing collapses to the wall plane.
- **Arm IK is 3D.** `solveArmIK` (`:402-503`) solves two-bone IK from shoulder → target with a 3D pole-vector elbow placement (`:458-496`). Changing a hand target's z moves the elbow and hand in 3D and changes every downstream distance.
- **Wall-plane props currently sit at a single depth plane (z=0).** `plane-transforms.ts:126` — `case Plane.WALL: return new Vector3(-cos_a*radius, -sin_a*radius, 0)`. `swept-volume-builder.ts:38-41` — grip z = `worldPosition.z + STAGE.AVATAR_GRID_OFFSET` = a single constant for all wall staffs. So a per-hand z-offset is the *first* thing that separates the two staffs in depth — genuinely new, non-redundant information the sim already consumes.

**Conclusion:** the solver can offset each hand's z, feed the targets to `StanceSimulator.evaluate` / `evaluateSweep`, and get correct, different collision results with zero changes to the collision math. The only net-new work is on the display side (below).

## Scope

**In scope:**
1. Depth-first joint feasibility solver over per-hand z-offset (primary) and concavity k (tiebreak).
2. Renderer depth support so a z-offset wall-plane hand renders naturally: `ElbowPoleComputer.computeWallPole` depth term + an audit of wall-plane `z=0` assumptions.
3. Wiring the solver's output into the existing metadata verdict (`"withCheat"` now carries `depthOffset`) and into the viewer's sequence→`MotionConfig3D` conversion.
4. The paused Phase-1/2 wiring (scan script `--solve`, viewer fallback policy) folded in on top of the depth solver, since the depth solver is what makes `"withCheat"` real.

**Out of scope (unchanged from the parent spec, permanently):** body turns and full negative-space technique; pro-rotation conflicts (not concave/depth-eligible in the way antis are — they route to dual-wheel fallback). Mocap ingestion.

## Component Design

### 1. Depth-first joint solver — `src/lib/shared/3d/services/depth-feasibility-solver.ts`

Replaces `concavity-solver.ts` as the producer of the `"withCheat"` verdict. (Keep `concavity-solver.ts` — its `concaveEligible`/`withDepth` helpers and bisection are reusable; the depth solver may import them or the file may be refactored into the new one. Decide at plan time; do not duplicate the eligibility predicate.)

Signature intent:

```ts
export interface DepthSolveResult {
  cleared: boolean;
  /** Per-hand z-offset in meters, sign convention = StanceSimulator world z. null = untouched. */
  zBlue: number | null;
  zRed: number | null;
  /** Concavity tiebreak depth actually applied, per hand. null = Phase-0 default. */
  kBlue: number | null;
  kRed: number | null;
  /** Diagnostics for the fixture-agreement report. */
  worstDepthAtSolution: number;
}

export function solveStepDepth(blue: MotionConfig3D, red: MotionConfig3D): DepthSolveResult;
```

Algorithm (depth-first, k as tiebreak):

1. **Already clean?** `scanStepPair(blue, red).clean` → return `cleared: true`, all offsets null.
2. **Depth search.** Search `(zBlue, zRed)` to clear the arm-arm / prop-prop conflict:
   - Each hand's z-offset is bounded ONLY by reach. `StanceSimulator` already reports `reachShortfall` per hand in `SimResult`; a candidate offset that produces any positive `reachShortfall` is rejected (out of reach). No fixed comfort cap (Austen: "let reach be the only limit").
   - Explore BOTH pairings (Austen: "either — depends on the pattern"): opposite-sign pass (one hand +z, one −z) and single-hand pull (one hand offset, other at 0). No hard constraint forcing one; the search covers both regions.
   - Structure: coordinate descent from (0,0), coarse grid over the reachable z band, then bisection refine on the promising axis/quadrant. Reuse the bisection discipline from `concavity-solver.ts` (`K_TOLERANCE`, `MAX_ITERATIONS`). Keep total `scanStepPair` evaluations bounded and logged — this runs offline but must not blow up per sequence.
3. **Depth cleared → freeze.** Take the minimal-|z| clearing solution (objective below). Return it; k stays at Phase-0 default (null).
4. **Residual conflict after max reachable depth → k tiebreak.** If depth alone cannot fully clear but gets close, allow a small `k` on the concave-eligible hand(s) ONLY if it further reduces total collision depth AND does not increase `prop-through-torso` depth. Reject any k that trades arm clearance for torso penetration.
5. **Still not clear → bail.** `cleared: false` → sequence verdict `false` → dual-wheel fallback.

Objective (minimize visible deviation, in priority order): minimize `|zBlue| + |zRed|`, then minimize applied k, then prefer single-hand over two-hand offset when both clear equally (fewer moving parts reads as more natural). Ties broken deterministically (no `Math.random`).

Monotonicity caveat: unlike the pure-k case, clearance is NOT guaranteed monotonic in z (pulling too far can re-introduce torso or reach problems). So this is a bounded search over a reachable region, not a single bisection. Document the search bound and evaluation count.

### 2. Renderer depth support

- **`ElbowPoleComputer.computeWallPole`** (`src/lib/shared/3d/.../elbow-pole-computer.ts:13-35`) currently reads only `handTarget.x`/`.y` vs `bodyCenter` and hardcodes `pole.z`. Add `localZ = handTarget.z − bodyCenter.z` and let it bias the pole the way `computeWheelPole` (`:37-76`) already does with its `depthFactor` (`:48`). Goal: a hand pulled in depth bends the elbow naturally instead of keeping a wall-plane-tuned bend.
- **z=0 assumption audit.** `plane-transforms.ts` `Plane.WALL` case hardcodes z=0; anywhere `AVATAR_GRID_OFFSET` is added assuming a single wall depth; grid plane / staff placement in the renderer. A nonzero-z wall hand must render correctly and not trip a hardcoded plane. The solver emits z-offsets as per-step per-hand `depthOffset`; the viewer's conversion seam applies them to the hand's world position before IK. Enumerate the audit sites at plan time.

### 3. Verdict + metadata (shape already locked)

Metadata types exist from Phase-1 Task 6 (`src/lib/shared/3d/domain/models/wall-feasibility.ts`): `WallPlaneStepOverride { k?, depthOffset? }` keyed by step index then hand. The depth solver writes `depthOffset` (primary) and optionally `k`. `"withCheat"` = any step has a nonzero override that clears. Bump `SCAN_VERSION`. Version-skew rule holds: viewer ignores overrides whose `scanVersion !== SCAN_VERSION`, honoring only the plane verdict.

### 4. Fold in the paused wiring

The depth solver is what makes `"withCheat"` fire, so the paused Phase-1/2 tasks land here on top of it:
- Scan script `--solve` (`scripts/scan-wall-feasibility.ts`) calls `solveStepDepth` per flagged step; all cleared → `"withCheat"` + write `depthOffset`/`k` overrides; any uncleared → `false`.
- Viewer fallback policy (`resolvePlanePolicy`, `avatar-instance-state.svelte.ts`): `false` → dual-wheel + notice; `true`/`"withCheat"` → wall plane, and `"withCheat"` stamps `depthOffset`+`concaveDepth` onto the step/hand `MotionConfig3D` at the conversion seam.
- The scan script still needs the sequence-step → `MotionConfig3D` conversion seam (grep `MotionConfig3D` consumers in `src/lib/shared/3d/state/`) and the blue=LEFT-hand / grid "e"→−x, "w"→+x frame convention established in Phase-1 Task 7.

## Data Flow

```
sequence → scan (per step): buildSweptVolume(blue), buildSweptVolume(red)
         → StanceSimulator.evaluateSweep(squareStance, blueSweep, redSweep)
         → flagged? solveStepDepth → (zBlue,zRed,kBlue,kRed) or bail
         → metadata.wallFeasibility { wallFeasible, wallPlaneOverrides, scanVersion }
viewer load → resolvePlanePolicy(meta)
         → false: PlaneMode.DUAL_WHEEL + notice
         → withCheat: WALL, stamp depthOffset+concaveDepth onto MotionConfig3D
         → renderer applies z-offset to hand world pos; computeWallPole bends elbow via localZ
```

## Error Handling

- Unscanned sequence (no metadata): current behavior, wall plane, no claims.
- `scanVersion` mismatch: honor plane verdict, ignore overrides.
- Solver evaluation budget exceeded for a step: treat as uncleared → `false` (fail safe to fallback, never silently ship a colliding wall render). Log it.
- Reach shortfall on every candidate: uncleared → `false`.

## Testing

- **Solver units** (`tests/unit/3d/depth-feasibility-solver.test.ts`): (a) already-clean step → all offsets null; (b) a real crossing-ANTI that collides at z=0 clears via depth, and re-scanning with the returned offsets is `clean`; (c) reach rejects over-pull (a target beyond arm length is never returned); (d) both pairings reachable in principle (construct one opposite-sign case, one single-hand case); (e) k tiebreak never increases `prop-through-torso` depth; (f) pro/dash-only crossing → bail `cleared:false`. Build the colliding-then-clearing fixture experimentally (probe z at 0 vs reachable max) — do NOT assert a cheat that can't be produced; if none is synthesizable, skip with reason and rely on Austen's real fixtures.
- **Renderer**: elbow-pole depth term — unit test that `computeWallPole` output varies with `handTarget.z` (regression: z=0 matches today's output). Visual gate with Austen: a `"withCheat"` sequence shows the staff passing in depth under the shoulder, elbow natural.
- **Ground truth**: Austen's labeled fixtures (`tests/fixtures/wall-feasibility/`, `possible|impossible|cheatable`). `cheatable` fixtures must now land `"withCheat"` via depth. Agreement report from the scan script is the tuning loop; tune thresholds, never the fixture labels.

## Fable Handoff

This is a complex, judgment-heavy build (a bounded non-monotonic 3D search, a rig IK change, and a renderer audit). Austen's directive: **spec it fully, hand to Fable 5 at xhigh effort.** Notes for the Fable executor:
- The collision model is depth-ready; do NOT modify `StanceSimulator`. The solver only feeds it different z targets.
- The hardest correctness risk is the search: z-clearance is non-monotonic and the reachable region is bounded by IK, not a fixed cap. Budget evaluations, log the count, fail safe to fallback.
- Frame conventions are load-bearing and already established: blue = LEFT hand; WALL grid "e"→−x, "w"→+x; grip z shift by `STAGE.AVATAR_GRID_OFFSET`. Re-derive from Phase-1 Task 7's test before writing the mapping.
- Reuse, don't rebuild: `scanStepPair`, `buildSweptVolume`, `concaveEligible`, the metadata types, `resolvePlanePolicy` scaffolding.
- Verify every "cheat works" claim against a re-scan (`scanStepPair` with the returned offsets must be `clean`) and, for display, against Austen's eyes — no visual claim without his confirmation (verification-protocol).

## Terminology

"Turns" in this spec means PROP turns (the staff's rotation, which drives petal count `1 + turns`) — a legitimate use per `.claude/rules/tka-domain.md`. Never used here for LOOP rotation slices.
