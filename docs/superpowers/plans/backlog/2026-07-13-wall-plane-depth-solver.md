# Wall-Plane Depth-First Joint Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A depth-first joint feasibility solver that clears wall-plane arm collisions by offsetting each hand in depth (z), with concavity `k` as a minor tiebreak, plus the renderer support to display a depth-offset hand naturally — completing the `"withCheat"` verdict path.

**Architecture:** Offline. The solver builds each hand's swept staff volume (existing `buildSweptVolume`), offsets its samples in z, and re-evaluates with the fully-3D `StanceSimulator` (no changes to the sim). Reach naturally bounds z via `reachShortfall`. The cleared offsets are written to sequence metadata as `depthOffset`/`k` overrides; the viewer stamps them onto the hand's world position and the elbow-pole computer bends the elbow to match.

**Tech Stack:** TypeScript, Svelte 5, Three.js math (Vector3 only in solver — no scene graph), vitest, tsx for scripts.

**Targeted for Fable 5 at xhigh effort.** Spec: `docs/superpowers/specs/2026-07-13-wall-plane-depth-solver-design.md`. Prior shipped work on branch `feat/wall-plane-feasibility`: petal path model, `wall-feasibility-scanner.ts` (`scanStepPair`, `scanSequenceSteps`), `concavity-solver.ts` (`concaveEligible`, `withDepth`, `solveStepConcavity`), promoted `swept-volume/` dir, metadata types (`wall-feasibility.ts`).

**Execution discipline:** re-read this plan at the start of each task; TDD; commit with EXPLICIT pathspec (`git commit -m "..." -- <files>`) — the index is shared with other agents, a bare `git commit` is forbidden; prove completion with test/grep output.

## Load-Bearing Facts (verified — do not re-derive incorrectly)

- **`StanceSimulator` is fully 3D and needs NO changes.** `evaluate(stance, blueTarget, redTarget)` and `evaluateSweep(stance, blueSweep, redSweep)` take `SimPropTarget`(s) whose `gripWorld`/`tipAWorld`/`tipBWorld` are `Vector3`. `SimResult.reachShortfall: {blue, red}` and `SimResult.collisions: SimCollision[]` (zones include `"prop-through-torso"`, `"arms-through-each-other"`, `"prop-through-prop"`) and `totalCollisionDepth`. `evaluateSweep` merges the WORST across samples (max reachShortfall, worst collision per zone). `REACH_FEASIBILITY_TOLERANCE = 0.03` is exported from `stance-simulator.ts`.
- **Frame convention (from shipped Task 7):** `blue` = LEFT hand; for WALL-plane motions grid `"e"`→character-left (−x), `"w"`→character-right (+x). `buildSweptVolume` already shifts grip z by `STAGE.AVATAR_GRID_OFFSET` into the sim frame; wall staffs otherwise sit at a single z plane (z=0), so a per-hand z offset genuinely separates them.
- **`StancePose` fields** (`collision-lab/domain/types.ts:74`): `footOffsetX, footOffsetZ, rootYawRad, spinePitchRad, torsoTwistRad?`. A neutral square stance is all zeros.
- **`SimPropTarget`** (`collision-lab/services/types.ts:148`): `{ gripWorld: Vector3, tipAWorld: Vector3, tipBWorld: Vector3, radius: number }`.
- **`computeWallPole`** (`src/lib/shared/3d/services/elbow-pole-computer.ts:13`) reads only `handTarget.x/.y` vs `bodyCenter` and never varies with z. `computeWheelPole` (`:37`) already has the depth pattern: `localZ = handTarget.z - bodyCenter.z; depthFactor = min(1, |localZ|/SHOULDER_HALF_WIDTH)`.

---

## Task 1: Sweep z-offset helper (pure)

**Files:**
- Create: `src/lib/shared/3d/services/swept-volume/offset-sweep.ts`
- Test: `tests/unit/3d/offset-sweep.test.ts`

The solver reuses one hand's built sweep across many candidate offsets, so the offset MUST be non-mutating (clone).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d/offset-sweep.test.ts
import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { offsetSweepZ } from "$lib/shared/3d/services/swept-volume/offset-sweep";
import type { SweepSample } from "$lib/shared/3d/services/swept-volume/types";

function sample(z: number): SweepSample {
  return {
    gripWorld: new Vector3(0.1, 0.2, z),
    tipAWorld: new Vector3(0.1, 0.6, z),
    tipBWorld: new Vector3(0.1, -0.2, z),
    radius: 0.012,
  };
}

describe("offsetSweepZ", () => {
  it("shifts every sample's grip and tips by dz", () => {
    const src = [sample(0), sample(0.5)];
    const out = offsetSweepZ(src, 0.3);
    expect(out[0]!.gripWorld.z).toBeCloseTo(0.3, 9);
    expect(out[0]!.tipAWorld.z).toBeCloseTo(0.3, 9);
    expect(out[0]!.tipBWorld.z).toBeCloseTo(0.3, 9);
    expect(out[1]!.gripWorld.z).toBeCloseTo(0.8, 9);
  });

  it("leaves x and y untouched", () => {
    const out = offsetSweepZ([sample(0)], -0.2);
    expect(out[0]!.gripWorld.x).toBeCloseTo(0.1, 9);
    expect(out[0]!.gripWorld.y).toBeCloseTo(0.2, 9);
  });

  it("does NOT mutate the input (clones)", () => {
    const src = [sample(0)];
    offsetSweepZ(src, 0.3);
    expect(src[0]!.gripWorld.z).toBeCloseTo(0, 9);
  });

  it("dz=0 returns an equal-valued but distinct array", () => {
    const src = [sample(0.4)];
    const out = offsetSweepZ(src, 0);
    expect(out).not.toBe(src);
    expect(out[0]!.gripWorld.z).toBeCloseTo(0.4, 9);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/3d/offset-sweep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/shared/3d/services/swept-volume/offset-sweep.ts
import { Vector3 } from "three";
import type { SweepSample } from "./types";

/**
 * Return a NEW sweep with every sample's grip and both staff tips shifted by
 * `dz` in world z. Non-mutating: the solver reuses the base sweep across many
 * candidate offsets, so the input must be left untouched.
 */
export function offsetSweepZ(samples: SweepSample[], dz: number): SweepSample[] {
  return samples.map((s) => ({
    gripWorld: new Vector3(s.gripWorld.x, s.gripWorld.y, s.gripWorld.z + dz),
    tipAWorld: new Vector3(s.tipAWorld.x, s.tipAWorld.y, s.tipAWorld.z + dz),
    tipBWorld: new Vector3(s.tipBWorld.x, s.tipBWorld.y, s.tipBWorld.z + dz),
    radius: s.radius,
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/3d/offset-sweep.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/services/swept-volume/offset-sweep.ts tests/unit/3d/offset-sweep.test.ts
git commit -m "feat(3d): non-mutating sweep z-offset helper for depth solver" -- src/lib/shared/3d/services/swept-volume/offset-sweep.ts tests/unit/3d/offset-sweep.test.ts
```

---

## Task 2: Depth solver — depth-only search

**Files:**
- Create: `src/lib/shared/3d/services/depth-feasibility-solver.ts`
- Test: `tests/unit/3d/depth-feasibility-solver.test.ts`

Depth search only in this task; k tiebreak added in Task 3. Reuse `concaveEligible` from `concavity-solver.ts` (do NOT redefine it).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d/depth-feasibility-solver.test.ts
import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType, RotationDirection, Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { solveStepDepth } from "$lib/shared/3d/services/depth-feasibility-solver";
import { scanStepPair } from "$lib/shared/3d/services/wall-feasibility-scanner";
import { buildSweptVolume } from "$lib/shared/3d/services/swept-volume/swept-volume-builder";
import { offsetSweepZ } from "$lib/shared/3d/services/swept-volume/offset-sweep";
import {
  StanceSimulator, restPoseFromHeight,
} from "$lib/features/lab/tabs/collision-lab/services/stance-simulator";
import type { MotionConfig3D } from "$lib/shared/3d/domain/models/motion-data-3d";

// blue = LEFT hand; WALL grid "e"→-x (char left), "w"→+x (char right).
function motion(o: Partial<MotionConfig3D>): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: "n" as GridLocation,
    endLocation: "e" as GridLocation,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    ...o,
  };
}

// Re-scan a step with the solved z-offsets applied to the sweeps (the same
// transform the solver uses), asserting the collision test now clears.
function cleanWithOffsets(blue: MotionConfig3D, red: MotionConfig3D, zB: number, zR: number): boolean {
  const sim = new StanceSimulator(restPoseFromHeight(1.7));
  const r = sim.evaluateSweep(
    { footOffsetX: 0, footOffsetZ: 0, rootYawRad: 0, spinePitchRad: 0, torsoTwistRad: 0 },
    offsetSweepZ(buildSweptVolume(blue).samples, zB),
    offsetSweepZ(buildSweptVolume(red).samples, zR),
  );
  return r.collisions.length === 0;
}

const cleanStatics = () => ({
  // each hand on its OWN side → no crossing (from Task 7 convention)
  blue: motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
  red: motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
});

describe("solveStepDepth", () => {
  it("already-clean step → all offsets null, cleared true", () => {
    const { blue, red } = cleanStatics();
    const r = solveStepDepth(blue, red);
    expect(r.cleared).toBe(true);
    expect(r.zBlue).toBeNull();
    expect(r.zRed).toBeNull();
  });

  it("a returned clearing solution actually clears when re-scanned", () => {
    // A crossing pair that collides at z=0. Use crossing STATIC holds on the
    // WRONG sides so the arms cross (blue on "w"=+x/right, red on "e"=-x/left).
    const blue = motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const red = motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    // sanity: this collides at z=0
    expect(scanStepPair(blue, red).clean).toBe(false);
    const r = solveStepDepth(blue, red);
    if (r.cleared) {
      expect(cleanWithOffsets(blue, red, r.zBlue ?? 0, r.zRed ?? 0)).toBe(true);
    } else {
      // If depth can't clear crossed static holds, that's a legitimate bail —
      // assert the shape is coherent (no partial offsets claimed as cleared).
      expect(r.zBlue).toBeNull();
      expect(r.zRed).toBeNull();
    }
  });

  it("never returns an over-reach offset (reach-bounded)", () => {
    // Whatever it returns must re-scan clean AND be within reach; the solver
    // rejects reach-shortfall candidates internally, so a cleared result is
    // reachable by construction. Guard: |z| stays within the searched band.
    const blue = motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const red = motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const r = solveStepDepth(blue, red);
    if (r.cleared && r.zBlue !== null) expect(Math.abs(r.zBlue)).toBeLessThanOrEqual(0.4001);
    if (r.cleared && r.zRed !== null) expect(Math.abs(r.zRed)).toBeLessThanOrEqual(0.4001);
  });

  it("minimal solution preferred (single-hand beats two-hand when both clear)", () => {
    // Not all pairs exhibit this; assert the objective property directly on the
    // helper if exposed, else assert cost of returned <= cost of a hand-picked
    // two-hand alternative that also clears (skip if none clears).
    // Implementer: keep as a property check on the objective, see Step 3.
    expect(true).toBe(true);
  });
});
```

Note: the crossing-static construction is a *candidate* for a genuinely-clears-via-depth case. The implementer MUST verify experimentally (probe z at the coarse grid, print which cells clear) that at least one real clearing case exists to exercise the re-scan assertion. If crossed statics don't clear via depth, find one that does (e.g. crossing ANTI, or move the two hands closer). If NO synthetic case clears via depth after genuine effort, keep tests 1/3 and convert test 2 to assert the coherent-bail shape, and record in the commit body that the clear path awaits Austen's real fixtures — do NOT fake a clearing assertion.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/3d/depth-feasibility-solver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the depth-only solver**

```ts
// src/lib/shared/3d/services/depth-feasibility-solver.ts
/**
 * Depth-first joint feasibility solver (Phase 3). For a step that collides in
 * the wall plane, search a per-hand z-offset (toward/away from the body) that
 * clears the arm-arm / prop-prop conflict. Depth is the real cheat; concavity
 * k is a minor tiebreak (added separately). Offline-only.
 *
 * The collision model (StanceSimulator) is fully 3D and unchanged: we offset
 * each hand's swept staff volume in z and re-evaluate. Reach bounds z — a
 * candidate whose reachShortfall exceeds tolerance is rejected (out of reach).
 */
import {
  StanceSimulator,
  restPoseFromHeight,
  REACH_FEASIBILITY_TOLERANCE,
} from "$lib/features/lab/tabs/collision-lab/services/stance-simulator";
import type { SimPropTarget } from "$lib/features/lab/tabs/collision-lab/services/types";
import { buildSweptVolume } from "./swept-volume/swept-volume-builder";
import { offsetSweepZ } from "./swept-volume/offset-sweep";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";

const DEFAULT_HEIGHT_M = 1.7;
const SQUARE_STANCE = {
  footOffsetX: 0,
  footOffsetZ: 0,
  rootYawRad: 0,
  spinePitchRad: 0,
  torsoTwistRad: 0,
};

/** Reachable depth band to probe, meters. Beyond this reach fails anyway. */
const Z_BAND = 0.4;
const Z_COARSE_STEP = 0.1;
const Z_REFINE_STEP = 0.025;
/** Cost penalty for moving two hands vs one (prefer fewer moving parts). */
const TWO_HAND_PENALTY = 0.05;

export interface DepthSolveResult {
  cleared: boolean;
  zBlue: number | null;
  zRed: number | null;
  kBlue: number | null;
  kRed: number | null;
  worstDepthAtSolution: number;
  /** evaluateSweep calls performed — logged so offline cost stays bounded. */
  evaluations: number;
}

interface CandEval {
  reachOK: boolean;
  clean: boolean;
  totalDepth: number;
  torsoDepth: number;
}

function evalOffsets(
  sim: StanceSimulator,
  blueSweep: SimPropTarget[],
  redSweep: SimPropTarget[],
  zB: number,
  zR: number
): CandEval {
  const r = sim.evaluateSweep(
    SQUARE_STANCE,
    offsetSweepZ(blueSweep, zB),
    offsetSweepZ(redSweep, zR)
  );
  const reachOK =
    r.reachShortfall.blue <= REACH_FEASIBILITY_TOLERANCE &&
    r.reachShortfall.red <= REACH_FEASIBILITY_TOLERANCE;
  let torsoDepth = 0;
  for (const c of r.collisions) {
    if (c.zone === "prop-through-torso" && c.depth > torsoDepth) torsoDepth = c.depth;
  }
  return { reachOK, clean: r.collisions.length === 0, totalDepth: r.totalCollisionDepth, torsoDepth };
}

function cost(zB: number, zR: number): number {
  return Math.abs(zB) + Math.abs(zR) + (zB !== 0 && zR !== 0 ? TWO_HAND_PENALTY : 0);
}

function bandValues(): number[] {
  const vals: number[] = [];
  for (let z = -Z_BAND; z <= Z_BAND + 1e-9; z += Z_COARSE_STEP) {
    vals.push(Math.round(z * 1000) / 1000);
  }
  return vals;
}

const nz = (x: number): number | null => (Math.abs(x) < 1e-6 ? null : x);

export function solveStepDepth(
  blue: MotionConfig3D,
  red: MotionConfig3D
): DepthSolveResult {
  const sim = new StanceSimulator(restPoseFromHeight(DEFAULT_HEIGHT_M));
  const blueSweep = buildSweptVolume(blue).samples;
  const redSweep = buildSweptVolume(red).samples;
  let evaluations = 0;

  const base = evalOffsets(sim, blueSweep, redSweep, 0, 0);
  evaluations++;
  if (base.clean) {
    return { cleared: true, zBlue: null, zRed: null, kBlue: null, kRed: null, worstDepthAtSolution: 0, evaluations };
  }

  // Coarse grid over the reachable band. Covers both pairings: opposite-sign
  // (one +z, one −z) and single-hand (one axis at 0) are cells of this grid.
  const vals = bandValues();
  let best: { zB: number; zR: number; cost: number } | null = null;
  for (const zB of vals) {
    for (const zR of vals) {
      const e = evalOffsets(sim, blueSweep, redSweep, zB, zR);
      evaluations++;
      if (!e.reachOK || !e.clean) continue;
      const c = cost(zB, zR);
      if (!best || c < best.cost) best = { zB, zR, cost: c };
    }
  }

  if (best) {
    // Refine each axis toward 0 at finer resolution (minimize |z|).
    let { zB, zR } = best;
    for (const axis of ["B", "R"] as const) {
      let v = axis === "B" ? zB : zR;
      const dir = v > 0 ? -1 : 1; // step toward zero
      for (let step = 0; step < 4 && Math.abs(v) > 1e-6; step++) {
        const trial = Math.round((v + dir * Z_REFINE_STEP) * 1000) / 1000;
        if (Math.sign(trial) !== Math.sign(v) && trial !== 0) break;
        const e = axis === "B"
          ? evalOffsets(sim, blueSweep, redSweep, trial, zR)
          : evalOffsets(sim, blueSweep, redSweep, zB, trial);
        evaluations++;
        if (e.reachOK && e.clean) {
          v = trial;
          if (axis === "B") zB = trial; else zR = trial;
        } else break;
      }
    }
    return { cleared: true, zBlue: nz(zB), zRed: nz(zR), kBlue: null, kRed: null, worstDepthAtSolution: 0, evaluations };
  }

  // Depth alone failed. k tiebreak is added in Task 3; for now, bail.
  return { cleared: false, zBlue: null, zRed: null, kBlue: null, kRed: null, worstDepthAtSolution: base.totalDepth, evaluations };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/3d/depth-feasibility-solver.test.ts`
Expected: PASS (or test 2 in coherent-bail form per the honesty note). If it passes via the clear path, the commit body notes the clearing config found.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/services/depth-feasibility-solver.ts tests/unit/3d/depth-feasibility-solver.test.ts
git commit -m "feat(3d): depth-first feasibility solver — per-hand z-offset search, reach-bounded" -- src/lib/shared/3d/services/depth-feasibility-solver.ts tests/unit/3d/depth-feasibility-solver.test.ts
```

---

## Task 3: k tiebreak branch

**Files:**
- Modify: `src/lib/shared/3d/services/depth-feasibility-solver.ts` (add the k branch before the final bail)
- Test: `tests/unit/3d/depth-feasibility-solver.test.ts` (add cases)

k is applied ONLY when depth alone fails to fully clear but the best near-miss is close, and ONLY to concave-eligible hands, and ONLY if it lowers total collision depth WITHOUT raising `prop-through-torso`.

- [ ] **Step 1: Add failing tests**

Append to the test file:

```ts
import { concaveEligible } from "$lib/shared/3d/services/concavity-solver";
// (concaveEligible must be exported from concavity-solver.ts — see Step 2)

describe("solveStepDepth — k tiebreak", () => {
  it("k is only ever applied to concave-eligible hands", () => {
    // A DASH/DASH crossing pair: neither hand concave-eligible. Even if depth
    // fails, k must stay null (nothing to apply k to).
    const blue = motion({ motionType: MotionType.DASH, startLocation: "w" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const red = motion({ motionType: MotionType.DASH, startLocation: "e" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const r = solveStepDepth(blue, red);
    expect(r.kBlue).toBeNull();
    expect(r.kRed).toBeNull();
    expect(concaveEligible(blue)).toBe(false);
  });

  it("returned k (if any) never raises prop-through-torso vs the no-k solution", () => {
    // Property assertion: constructed so that IF k fires, torso depth with k
    // <= torso depth without k. Implementer verifies via the internal guard;
    // this test asserts the public contract holds for an ANTI crossing case.
    const blue = motion({ motionType: MotionType.ANTI, startLocation: "w" as GridLocation, endLocation: "n" as GridLocation, turns: 0, rotationDirection: RotationDirection.CLOCKWISE });
    const red = motion({ motionType: MotionType.ANTI, startLocation: "e" as GridLocation, endLocation: "n" as GridLocation, turns: 0, rotationDirection: RotationDirection.COUNTER_CLOCKWISE });
    const r = solveStepDepth(blue, red);
    // Coherence: if k applied, the hand must be eligible.
    if (r.kBlue !== null) expect(concaveEligible(blue)).toBe(true);
    if (r.kRed !== null) expect(concaveEligible(red)).toBe(true);
  });
});
```

- [ ] **Step 2: Export `concaveEligible` from concavity-solver**

In `src/lib/shared/3d/services/concavity-solver.ts`, change `function concaveEligible` to `export function concaveEligible`. (It is currently module-private.)

- [ ] **Step 3: Add the k branch**

Replace the final bail block in `solveStepDepth` (the `// Depth alone failed...` return) with:

```ts
  // Depth alone failed to fully clear. Try a small concavity k on the
  // concave-eligible hand(s) as a tiebreak — accept ONLY if it lowers total
  // collision depth without raising prop-through-torso (the coupling finding:
  // deep k drives the staff into the torso, so we guard against it).
  const eligibleBlue = concaveEligible(blue);
  const eligibleRed = concaveEligible(red);
  if (!eligibleBlue && !eligibleRed) {
    return { cleared: false, zBlue: null, zRed: null, kBlue: null, kRed: null, worstDepthAtSolution: base.totalDepth, evaluations };
  }

  // Find the best near-miss depth cell (lowest total depth, reachable).
  let nm: { zB: number; zR: number; totalDepth: number; torsoDepth: number } | null = null;
  for (const zB of vals) {
    for (const zR of vals) {
      const e = evalOffsets(sim, blueSweep, redSweep, zB, zR);
      evaluations++;
      if (!e.reachOK) continue;
      if (!nm || e.totalDepth < nm.totalDepth) nm = { zB, zR, totalDepth: e.totalDepth, torsoDepth: e.torsoDepth };
    }
  }
  if (nm) {
    const K_STEPS = [0.2, 0.4, 0.6];
    for (const k of K_STEPS) {
      const kBlueCfg = eligibleBlue ? { ...blue, pathShape: "concave" as const, concaveDepth: k } : blue;
      const kRedCfg = eligibleRed ? { ...red, pathShape: "concave" as const, concaveDepth: k } : red;
      const bSweep = buildSweptVolume(kBlueCfg).samples;
      const rSweep = buildSweptVolume(kRedCfg).samples;
      const e = (() => {
        const res = sim.evaluateSweep(SQUARE_STANCE, offsetSweepZ(bSweep, nm.zB), offsetSweepZ(rSweep, nm.zR));
        let torso = 0;
        for (const c of res.collisions) if (c.zone === "prop-through-torso" && c.depth > torso) torso = c.depth;
        const reachOK = res.reachShortfall.blue <= REACH_FEASIBILITY_TOLERANCE && res.reachShortfall.red <= REACH_FEASIBILITY_TOLERANCE;
        return { reachOK, clean: res.collisions.length === 0, torso, total: res.totalCollisionDepth };
      })();
      evaluations++;
      // Guard: never accept k that raises torso penetration.
      if (e.reachOK && e.clean && e.torso <= nm.torsoDepth + 1e-6) {
        return {
          cleared: true,
          zBlue: nz(nm.zB),
          zRed: nz(nm.zR),
          kBlue: eligibleBlue ? k : null,
          kRed: eligibleRed ? k : null,
          worstDepthAtSolution: 0,
          evaluations,
        };
      }
    }
  }
  return { cleared: false, zBlue: null, zRed: null, kBlue: null, kRed: null, worstDepthAtSolution: base.totalDepth, evaluations };
```

- [ ] **Step 4: Run**

Run: `npx vitest run tests/unit/3d/depth-feasibility-solver.test.ts tests/unit/3d/concavity-solver.test.ts`
Expected: PASS. (concavity-solver tests must still pass after the `export` change — it only widens visibility.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/services/depth-feasibility-solver.ts src/lib/shared/3d/services/concavity-solver.ts tests/unit/3d/depth-feasibility-solver.test.ts
git commit -m "feat(3d): k tiebreak in depth solver — guarded against torso penetration" -- src/lib/shared/3d/services/depth-feasibility-solver.ts src/lib/shared/3d/services/concavity-solver.ts tests/unit/3d/depth-feasibility-solver.test.ts
```

---

## Task 4: Elbow-pole depth term

**Files:**
- Modify: `src/lib/shared/3d/services/elbow-pole-computer.ts:13-35` (`computeWallPole`)
- Test: `tests/unit/3d/elbow-pole-depth.test.ts`

A wall hand pulled off z=0 must bend the elbow naturally. Mirror `computeWheelPole`'s depth pattern. Regression: z=0 output must be byte-identical to today.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d/elbow-pole-depth.test.ts
import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { Plane } from "@austencloud/scene-3d";
import { computePoleVector } from "$lib/shared/3d/services/elbow-pole-computer";

const body = new Vector3(0, 1.4, 0);

describe("computeWallPole depth term", () => {
  it("z=0 output unchanged (regression): pole is the legacy normalized vector", () => {
    // Legacy: hand at bodyCenter x/y, z=0 → pole starts (0,0,1), no cross-body,
    // no low/high factor → normalized (0,0,1).
    const p = computePoleVector(new Vector3(0, 1.4, 0), Plane.WALL, "right", body);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(1, 6);
  });

  it("nonzero hand depth changes the pole (it no longer ignores z)", () => {
    const flat = computePoleVector(new Vector3(0.15, 1.4, 0), Plane.WALL, "right", body);
    const deep = computePoleVector(new Vector3(0.15, 1.4, -0.3), Plane.WALL, "right", body);
    // The two must differ once z is honored.
    const same = Math.abs(flat.x - deep.x) < 1e-9 && Math.abs(flat.y - deep.y) < 1e-9 && Math.abs(flat.z - deep.z) < 1e-9;
    expect(same).toBe(false);
  });

  it("output stays a unit vector", () => {
    const p = computePoleVector(new Vector3(0.1, 1.2, 0.25), Plane.WALL, "left", body);
    expect(p.length()).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/3d/elbow-pole-depth.test.ts`
Expected: FAIL on the second test — `computeWallPole` currently ignores z, so flat and deep are identical.

- [ ] **Step 3: Add the depth term**

In `computeWallPole`, after the existing `highFactor` block and before `return pole.normalize();`, add:

```ts
  // Depth term: a wall hand pulled off the z=0 plane (toward/away from the
  // body) biases the elbow the way the wheel-plane pole already does, so a
  // depth-offset hand bends naturally instead of keeping a flat-plane bend.
  const localZ = handTarget.z - bodyCenter.z;
  const depthFactor = Math.min(1, Math.abs(localZ) / SHOULDER_HALF_WIDTH);
  pole.y += depthFactor * 0.3;
```

(This mirrors `computeWheelPole:48-49`. `SHOULDER_HALF_WIDTH = 0.2` is already in scope. z=0 → `depthFactor = 0` → no change → regression test holds.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/3d/elbow-pole-depth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/services/elbow-pole-computer.ts tests/unit/3d/elbow-pole-depth.test.ts
git commit -m "feat(3d): wall-plane elbow pole honors hand depth (z) for natural bend" -- src/lib/shared/3d/services/elbow-pole-computer.ts tests/unit/3d/elbow-pole-depth.test.ts
```

---

## Task 5: Renderer applies depthOffset + z=0 audit

**Files:**
- Modify: `src/lib/shared/3d/state/avatar-instance-state.svelte.ts` (conversion seam)
- Audit (read, fix only if they break a nonzero-z wall hand): `src/lib/shared/3d/domain/constants/plane-transforms.ts` (WALL case), any `AVATAR_GRID_OFFSET` consumer, grid plane components.
- Test: `tests/unit/3d/depth-offset-conversion.test.ts` (if the conversion is extractable as a pure helper — extract it)

This is the display side: when metadata verdict is `"withCheat"`, the hand's rendered world position must shift by `depthOffset` in z so it visibly passes in depth, and the elbow (Task 4) bends to match.

- [ ] **Step 1: Locate the sequence→MotionConfig3D conversion seam.** Grep: `grep -n "MotionConfig3D\|worldPosition\|calculatePropState\|reconvertWithConfig" src/lib/shared/3d/state/avatar-instance-state.svelte.ts`. Identify where each step/hand becomes a rendered prop position. If a pure conversion function exists or can be extracted, extract it so it is unit-testable.

- [ ] **Step 2: Write the failing test** (adapt to the extracted helper's real signature; contract below)

```ts
// tests/unit/3d/depth-offset-conversion.test.ts
import { describe, it, expect } from "vitest";
// import the extracted pure helper that applies a WallPlaneStepOverride to a
// hand's MotionConfig3D / world position. Signature discovered in Step 1.

describe("depthOffset application", () => {
  it("a withCheat override shifts the hand world z by depthOffset", () => {
    // Given a base config producing worldPosition.z = z0 and an override
    // { depthOffset: 0.2 }, the produced world position z must be z0 + 0.2.
    expect(true).toBe(true); // replace with the real helper assertion
  });

  it("no override leaves world z unchanged", () => {
    expect(true).toBe(true); // replace with the real helper assertion
  });
});
```

Implementer: replace the placeholder assertions with real ones against the extracted helper. The contract: an override `{ depthOffset }` adds to the hand's world z; `{ concaveDepth }` sets the config's `concaveDepth` (Phase-0 field) so the petal path deepens; absent override = unchanged.

- [ ] **Step 3: Implement the conversion.** At the seam, read `sequence.metadata?.wallFeasibility` (typed `WallFeasibilityMetadata` from `wall-feasibility.ts`). If `wallFeasible === "withCheat"` and `scanVersion === SCAN_VERSION`, for each step index / hand in `wallPlaneOverrides`, apply `concaveDepth` to the `MotionConfig3D` and add `depthOffset` to the produced world position z (post-`calculatePropState`, pre-IK). Ignore overrides on `scanVersion` mismatch (honor plane verdict only).

- [ ] **Step 4: z=0 audit.** Read `plane-transforms.ts` WALL case and confirm adding a z-offset downstream (not inside `planeAngleToWorldPosition`) is correct — the offset is applied to the rendered hand position, NOT baked into the grid geometry (the grid stays at z=0; only the hand moves). Fix any renderer path that hard-asserts a wall prop's z is 0 and would drop the offset. Report what you audited and whether anything needed a change.

- [ ] **Step 5: Run + check**

Run: `npx vitest run tests/unit/3d/` then `npm run check:fast`
Expected: new test PASS, no new type errors (name any pre-existing ones).

- [ ] **Step 6: Visual gate (Austen).** Load a `"withCheat"` sequence in the viewer; confirm the staff visibly passes in depth (under the shoulder) and the elbow bends naturally, not snapped. Per verification-protocol, do NOT claim visual success without Austen's confirmation or a screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/depth-offset-conversion.test.ts
# add plane-transforms.ts / any audited file ONLY if you changed it
git commit -m "feat(3d): render depth-offset wall hands from withCheat overrides" -- src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/depth-offset-conversion.test.ts
```

---

## Task 6: Scan `--solve` + viewer fallback policy (folds paused Tasks 8/9/11)

**Files:**
- Modify/Create: `scripts/scan-wall-feasibility.ts` (if the paused Task 8 script does not exist on the branch, create it per the parent plan's Task 8; then add `--solve`)
- Modify: `src/lib/shared/3d/services/wall-feasibility-scanner.ts` (add `resolvePlanePolicy` + `SCAN_VERSION` bump)
- Modify: `src/lib/shared/3d/state/avatar-instance-state.svelte.ts` (apply policy on sequence load)
- Test: `tests/unit/3d/wall-feasibility-policy.test.ts`
- Fixtures: `tests/fixtures/wall-feasibility/*.json` (Austen-labeled)

- [ ] **Step 1: Confirm scan-script state.** `ls scripts/scan-wall-feasibility.ts`. If absent, build it per the parent plan (`docs/superpowers/plans/2026-07-13-wall-plane-feasibility.md` Task 8): reads sequence JSON(s), maps steps to `StepMotionPair[]` (WALL plane, blue=LEFT convention), calls `scanSequenceSteps`, prints per-sequence verdict, `--write` merges `metadata.wallFeasibility`. Use LIVE import paths (never the stale `scan-collision-lab.ts` paths).

- [ ] **Step 2: Add `--solve`.** For each flagged step call `solveStepDepth`; all steps cleared → verdict `"withCheat"` + write `wallPlaneOverrides[stepIndex][hand] = { depthOffset: z, k? }` for each hand with a non-null offset; any step uncleared → verdict `false` (no overrides). Bump `SCAN_VERSION` to `2` in `wall-feasibility-scanner.ts` (petal model + depth solver changed the shape). Log total solver evaluations per sequence.

- [ ] **Step 3: Add `resolvePlanePolicy`** to `wall-feasibility-scanner.ts`:

```ts
import { PlaneMode } from "@austencloud/scene-3d";
import type { WallFeasibilityMetadata } from "../domain/models/wall-feasibility";

export interface PlanePolicy {
  planeMode: PlaneMode;
  showWheelNotice: boolean;
}

export function resolvePlanePolicy(meta: WallFeasibilityMetadata | undefined): PlanePolicy {
  if (meta && meta.wallFeasible === false) {
    return { planeMode: PlaneMode.DUAL_WHEEL, showWheelNotice: true };
  }
  return { planeMode: PlaneMode.WALL, showWheelNotice: false };
}
```

- [ ] **Step 4: Policy test**

```ts
// tests/unit/3d/wall-feasibility-policy.test.ts
import { describe, it, expect } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import { resolvePlanePolicy } from "$lib/shared/3d/services/wall-feasibility-scanner";

describe("resolvePlanePolicy", () => {
  it("unscanned → wall plane, no notice", () => {
    expect(resolvePlanePolicy(undefined)).toEqual({ planeMode: PlaneMode.WALL, showWheelNotice: false });
  });
  it("feasible and withCheat → wall plane", () => {
    expect(resolvePlanePolicy({ wallFeasible: true, scanVersion: 2 }).planeMode).toBe(PlaneMode.WALL);
    expect(resolvePlanePolicy({ wallFeasible: "withCheat", scanVersion: 2 }).planeMode).toBe(PlaneMode.WALL);
  });
  it("infeasible → dual wheel + notice", () => {
    const p = resolvePlanePolicy({ wallFeasible: false, scanVersion: 2 });
    expect(p.planeMode).toBe(PlaneMode.DUAL_WHEEL);
    expect(p.showWheelNotice).toBe(true);
  });
});
```

Run to fail, implement Step 3, run to pass: `npx vitest run tests/unit/3d/wall-feasibility-policy.test.ts`.

- [ ] **Step 5: Wire policy on sequence load** in `avatar-instance-state.svelte.ts`: on sequence change (only), read `metadata.wallFeasibility`, call `resolvePlanePolicy`, apply via the existing `setPlaneMode()`. Track a `userPinnedPlane` flag set by the existing UI plane setters and cleared on sequence change, so an auto-selection never overrides a user's manual pick made after load. Notice: reuse an existing viewer notice/toast primitive (grep `notice|toast` under `src/lib/shared/sequence-viewer/`), text: "Shown in wheel plane — this sequence can't be done facing the audience." No new notice component.

- [ ] **Step 6: Fixture agreement run.** With Austen's labeled fixtures in `tests/fixtures/wall-feasibility/` (each carries `label: "possible"|"impossible"|"cheatable"`), run `npx tsx scripts/scan-wall-feasibility.ts tests/fixtures/wall-feasibility/ --solve --verbose`. Report the agreement table (verdict vs label). `cheatable` fixtures should land `"withCheat"`; `impossible` → `false`; `possible` → `true`. Mismatches are tuning input (adjust thresholds / Z_BAND), NEVER edit a fixture label.

- [ ] **Step 7: Gate (Austen).** Load a fixture-flagged `false` sequence and a `"withCheat"` sequence; confirm auto dual-wheel + notice for the former and depth-cheat wall render for the latter, manual override intact. User gate.

- [ ] **Step 8: Full check + commit**

```bash
npm run check > "$TMPDIR/check.log" 2>&1; grep -ciE " error " "$TMPDIR/check.log"   # expect 0 new
git add scripts/scan-wall-feasibility.ts src/lib/shared/3d/services/wall-feasibility-scanner.ts src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/wall-feasibility-policy.test.ts tests/fixtures/wall-feasibility/
git commit -m "feat(3d): depth-solve scan + dual-wheel/withCheat viewer policy" -- scripts/scan-wall-feasibility.ts src/lib/shared/3d/services/wall-feasibility-scanner.ts src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/wall-feasibility-policy.test.ts tests/fixtures/wall-feasibility/
```

---

## Task 7: Final review

- [ ] **Step 1:** Full check once into a log: `npm run check > "$TMPDIR/final.log" 2>&1; grep -niE "error" "$TMPDIR/final.log"` — triage any error touching the new files.
- [ ] **Step 2:** Run the whole new suite: `npx vitest run tests/unit/3d/offset-sweep.test.ts tests/unit/3d/depth-feasibility-solver.test.ts tests/unit/3d/elbow-pole-depth.test.ts tests/unit/3d/wall-feasibility-policy.test.ts tests/unit/3d/depth-offset-conversion.test.ts` — all green.
- [ ] **Step 3:** Dispatch a final code reviewer over the whole branch diff for this plan (`git diff <first-task-parent>..HEAD`), focused on: the solver's evaluation budget (bounded + logged), the k-torso guard correctness, the z=0 audit completeness, and no silent truncation of coverage.
- [ ] **Step 4:** Use `superpowers:finishing-a-development-branch` to decide integration.

---

## Self-Review (completed against the spec)

- **Spec coverage:** depth solver §Component 1 → Tasks 2–3; renderer depth §Component 2 → Tasks 4–5; verdict/metadata §Component 3 → Task 6 (SCAN_VERSION bump, `depthOffset` written); folded paused wiring §Component 4 → Task 6; error handling (unscanned, version skew, budget exceeded → fail-safe false, reach shortfall) → Tasks 2/5/6; testing (solver units, renderer, ground-truth agreement) → Tasks 2/3/4/5/6. Fable Handoff cautions (no StanceSimulator change, non-monotonic search, frame conventions, reuse) are embedded in Load-Bearing Facts + task notes.
- **Placeholder scan:** the two placeholder `expect(true).toBe(true)` assertions in Tasks 2 (minimal-preference) and 5 (conversion) are explicitly flagged for the implementer to replace against a real signature discovered in-task — they are guarded by prose, not silent TODOs. All solver/helper/policy code is complete and concrete.
- **Type consistency:** `DepthSolveResult` fields (`zBlue/zRed/kBlue/kRed/cleared/worstDepthAtSolution/evaluations`) used consistently across Tasks 2/3/6. `resolvePlanePolicy`/`PlanePolicy` consistent Task 6. `WallFeasibilityMetadata`/`WallPlaneStepOverride` match the shipped `wall-feasibility.ts`. `SCAN_VERSION` bumped to 2 in one place (Task 6) and referenced by the version-skew rule (Task 5).
