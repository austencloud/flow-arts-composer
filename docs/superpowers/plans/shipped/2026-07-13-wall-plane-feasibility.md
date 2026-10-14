# Wall-Plane Feasibility System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Petal-count-aware concave paths with a depth parameter, offline wall-plane feasibility scanning with dual-wheel fallback, and a minimum-depth concavity solver — per spec `docs/superpowers/specs/2026-07-13-wall-plane-feasibility-design.md`.

**Architecture:** Offline scan writes a three-state verdict (`true | "withCheat" | false`) plus per-step concavity overrides into sequence metadata; the viewer reads the verdict and applies plane mode / path params; the render engine stays dumb. The scan reuses `StanceSimulator.evaluateSweep` (collision test) and `buildSweptVolume` (which samples through `calculatePropState`, so depth-cheated paths flow into the collision test automatically).

**Tech Stack:** TypeScript, Svelte 5, Three.js math (Vector3/Quaternion only — no scene graph in scan code), vitest, tsx for scripts.

> **STATUS 2026-07-13:** Tasks 1,2,3,5,6,7,10 SHIPPED (branch `feat/wall-plane-feasibility`). Task 4 (visual gate) pending Austen. **Tasks 8, 9, 11 PAUSED.**
>
> **Finding from Task 10:** in-plane concavity alone does NOT clear collisions — pulling `concaveDepth k`→1 moves the staff toward grid center = toward the torso, so `prop-through-torso` depth rises. 13+ synthetic ANTI configs: none collided at k=0 and cleared at k=1. The real cheat is COUPLED to per-hand depth (z-offset off the wall plane, under the shoulder). Concavity (in-plane radius) and depth are not separable as the original phasing assumed. Decision (Austen): pause 8/9/11 and re-spec Phase 3 as a JOINT solver over `(k, zBlue, zRed)` before wiring detection. New spec supersedes Tasks 8-11 here. See `reference_concavity_needs_depth_coupling` in memory.

**Ledger discipline (fable-routing):** mark each step `- [x]` as completed, `- [~] reason` if deferred. Executors: re-read this plan at the start of each task; commit with explicit pathspec (`git commit -m "..." -- <files>`); prove completion with test/grep output.

**Known trap:** `scripts/scan-collision-lab.ts` imports stale pre-extraction paths (`.../services/implementations/StanceSimulator`, `src/lib/shared/3d/domain/enums/Plane`) that no longer exist. Do NOT copy its imports. Live paths are `src/lib/features/lab/tabs/collision-lab/services/stance-simulator.ts` (class `StanceSimulator`, `restPoseFromHeight`), `.../services/types.ts` (`SimPropTarget`, `SimResult`), and `Plane` from `@austencloud/scene-3d`.

---

## Phase 0 — Petal path model

### Task 1: Petal geometry module (pure math)

**Files:**
- Create: `src/lib/shared/3d/services/petal-path.ts`
- Test: `tests/unit/3d/petal-path.test.ts`

The model: within one step (one grid-quadrant transit), an anti-spin path makes `petalsPerStep = 1 + turns` radius dips ("petals"), where 1 TKA turn = 180° extra rotation. Over a 4-step cycle: 0 turns → 4 petals, continuous half turns → 6, 1 turn per step → 8 (Austen's canonical counts). Valley points (radius returns to grid radius) sit at progress `i / petalsPerStep`; dips reach maximum at petal midpoints. Depth `k ∈ [0,1]`: `k = 0` dips to the current chord-reflection mid-radius (`2·cos(π/4) − 1 ≈ 0.4142` for a 90° quadrant step), `k = 1` dips to the center (radius 0).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d/petal-path.test.ts
import { describe, it, expect } from "vitest";
import {
  petalsPerStep,
  concaveRadiusProfile,
  BASE_DIP_RADIUS,
} from "$lib/shared/3d/services/petal-path";

describe("petalsPerStep", () => {
  it("maps turns to petal count (1 turn = 180° extra)", () => {
    expect(petalsPerStep(0)).toBe(1); // 4 petals per 4-step cycle
    expect(petalsPerStep(0.5)).toBe(1.5); // 6 per cycle
    expect(petalsPerStep(1)).toBe(2); // 8 per cycle
    expect(petalsPerStep(2)).toBe(3);
  });
});

describe("concaveRadiusProfile", () => {
  it("returns grid radius (1.0) at every petal boundary", () => {
    // 1 turn → petals at [0, 0.5, 1]
    expect(concaveRadiusProfile(0, 1, 0)).toBeCloseTo(1, 6);
    expect(concaveRadiusProfile(0.5, 1, 0)).toBeCloseTo(1, 6);
    expect(concaveRadiusProfile(1, 1, 0)).toBeCloseTo(1, 6);
  });

  it("k=0 dips to the legacy reflection radius at petal midpoints", () => {
    // 0 turns, mid-step: matches current interpolateConcavePosition mid-radius
    expect(concaveRadiusProfile(0.5, 0, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
    // 1 turn: two petals, dips at 0.25 and 0.75
    expect(concaveRadiusProfile(0.25, 1, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
    expect(concaveRadiusProfile(0.75, 1, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
  });

  it("k=1 dips to the center (radius 0) at petal midpoints", () => {
    expect(concaveRadiusProfile(0.5, 0, 1)).toBeCloseTo(0, 6);
    expect(concaveRadiusProfile(0.25, 1, 1)).toBeCloseTo(0, 6);
  });

  it("depth interpolates linearly between legacy and center", () => {
    const half = concaveRadiusProfile(0.5, 0, 0.5);
    expect(half).toBeCloseTo(BASE_DIP_RADIUS / 2, 6);
  });

  it("is monotonically deeper in k at any fixed progress", () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(concaveRadiusProfile(p, 1, 0.8)).toBeLessThanOrEqual(
        concaveRadiusProfile(p, 1, 0.2) + 1e-9
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/3d/petal-path.test.ts`
Expected: FAIL — module `petal-path` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/3d/services/petal-path.ts
/**
 * Petal geometry for concave (anti-spin) hand paths.
 *
 * Within one step an anti-spin path dips toward the center once per petal.
 * petalsPerStep = 1 + turns (1 TKA turn = 180° extra rotation), so a 4-step
 * cycle yields 4 petals at 0 turns, 6 at continuous half turns, 8 at 1 turn.
 * Valleys (radius back at grid radius) sit at progress i/petalsPerStep; dips
 * peak at petal midpoints.
 *
 * Depth k ∈ [0,1]: k=0 reproduces the legacy chord-reflection dip radius,
 * k=1 pulls the dip all the way to the center (the practical upper limit —
 * the hand traces at the center point).
 */

/** Legacy chord-reflection radius at the midpoint of a 90° quadrant step. */
export const BASE_DIP_RADIUS = 2 * Math.cos(Math.PI / 4) - 1; // ≈ 0.4142

export function petalsPerStep(turns: number): number {
  return 1 + Math.max(0, turns);
}

/**
 * Radius multiplier (0..1 of grid radius) for a concave path at `progress`
 * within a step, for a motion with `turns`, at depth `k`.
 */
export function concaveRadiusProfile(
  progress: number,
  turns: number,
  k: number
): number {
  const m = petalsPerStep(turns);
  // 0 at valleys (progress = i/m), 1 at petal midpoints.
  const dipPhase = Math.abs(Math.sin(Math.PI * m * progress));
  const dipFloor = BASE_DIP_RADIUS * (1 - clamp01(k));
  // radius glides from 1 (valley) down to dipFloor (petal midpoint).
  return 1 - dipPhase * (1 - dipFloor);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/3d/petal-path.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/services/petal-path.ts tests/unit/3d/petal-path.test.ts
git commit -m "feat(3d): petal geometry module — turn-aware concave radius profile with depth k" -- src/lib/shared/3d/services/petal-path.ts tests/unit/3d/petal-path.test.ts
```

### Task 2: Wire petal model into the 3D interpolator

**Files:**
- Modify: `src/lib/shared/3d/domain/models/motion-data-3d.ts` (add `concaveDepth` field)
- Modify: `src/lib/shared/3d/services/prop-state-interpolator.ts:79-109` (replace `interpolateConcavePosition`)
- Test: `tests/unit/3d/prop-state-interpolator-concave.test.ts`

- [ ] **Step 1: Add the config field**

In `motion-data-3d.ts`, after `pathShape?: "arc" | "linear" | "concave";` (line 42) add:

```ts
  /**
   * Concavity depth for concave paths, 0..1. 0 = natural shallow dip
   * (legacy reflection depth), 1 = dip traces the center. Absent = 0.
   * Written by the wall-plane feasibility solver as a per-step override.
   */
  concaveDepth?: number;
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/3d/prop-state-interpolator-concave.test.ts
import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { calculatePropState } from "$lib/shared/3d/services/prop-state-interpolator";
import { GRID_RADIUS_3D } from "$lib/shared/3d/domain/constants/plane-transforms";
import { BASE_DIP_RADIUS } from "$lib/shared/3d/services/petal-path";
import type { MotionConfig3D } from "$lib/shared/3d/domain/models/motion-data-3d";

function antiConfig(turns: number, concaveDepth?: number): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: "n" as GridLocation,
    endLocation: "e" as GridLocation,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    pathShape: "concave",
    concaveDepth,
  };
}

function radius(config: MotionConfig3D, progress: number): number {
  const s = calculatePropState(config, progress);
  return s.worldPosition.length() / GRID_RADIUS_3D;
}

describe("concave interpolation (petal model)", () => {
  it("starts and ends on the grid radius", () => {
    const c = antiConfig(0);
    expect(radius(c, 0)).toBeCloseTo(1, 4);
    expect(radius(c, 1)).toBeCloseTo(1, 4);
  });

  it("0 turns, k absent: mid-step dips to legacy reflection radius", () => {
    expect(radius(antiConfig(0), 0.5)).toBeCloseTo(BASE_DIP_RADIUS, 3);
  });

  it("1 turn: valley at mid-step (radius back at 1), dips at quarter points", () => {
    const c = antiConfig(1);
    expect(radius(c, 0.5)).toBeCloseTo(1, 3);
    expect(radius(c, 0.25)).toBeCloseTo(BASE_DIP_RADIUS, 3);
    expect(radius(c, 0.75)).toBeCloseTo(BASE_DIP_RADIUS, 3);
  });

  it("concaveDepth=1 pulls dips to the center", () => {
    expect(radius(antiConfig(0, 1), 0.5)).toBeCloseTo(0, 3);
    expect(radius(antiConfig(1, 1), 0.25)).toBeCloseTo(0, 3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/3d/prop-state-interpolator-concave.test.ts`
Expected: FAIL — the 1-turn case dips at mid-step (legacy reflection has one dip regardless of turns) and `concaveDepth` is ignored.

- [ ] **Step 4: Replace `interpolateConcavePosition`**

In `prop-state-interpolator.ts`, add the import and replace the function body (lines 79-109):

```ts
import { concaveRadiusProfile } from "./petal-path";

function interpolateConcavePosition(
  config: MotionConfig3D,
  startAngle: number,
  endAngle: number,
  progress: number
): { worldPosition: Vector3; centerPathAngle: number } {
  // Angle rides the arc; the petal model modulates radius only. The old
  // chord-reflection produced one mid-step dip regardless of turns — the
  // petal profile dips once per petal (petalsPerStep = 1 + turns).
  const centerPathAngle = lerpAngle(startAngle, endAngle, progress);
  const turns = typeof config.turns === "number" ? config.turns : 0;
  const radius = concaveRadiusProfile(progress, turns, config.concaveDepth ?? 0);

  const worldPosition = planeAngleToWorldPosition(
    config.plane,
    centerPathAngle,
    radius * GRID_RADIUS_3D
  );

  return { worldPosition, centerPathAngle };
}
```

Note the deliberate behavior change vs legacy: the old reflection also bent `centerPathAngle`; the petal model keeps the arc angle and dips radius. Endpoint positions and mid-dip radius match legacy for the 0-turn case (asserted in tests); the in-between shape differs slightly and is the intended fix.

- [ ] **Step 5: Run tests — new file plus existing 3D interpolator suites**

Run: `npx vitest run tests/unit/3d/`
Expected: new file PASS. If an existing test pinned exact legacy concave coordinates, update its expectations to the petal model (state this in the commit body).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/3d/domain/models/motion-data-3d.ts src/lib/shared/3d/services/prop-state-interpolator.ts tests/unit/3d/prop-state-interpolator-concave.test.ts
git commit -m "feat(3d): petal-model concave interpolation with concaveDepth parameter" -- src/lib/shared/3d/domain/models/motion-data-3d.ts src/lib/shared/3d/services/prop-state-interpolator.ts tests/unit/3d/prop-state-interpolator-concave.test.ts
```

### Task 3: Sync the 2D twins

**Files:**
- Modify: `src/lib/shared/animation-engine/services/prop-interpolator.ts` (its concave branch, ~lines 26-198)
- Modify: `src/lib/features/hand-paths/hand-path-builder/services/hand-path-animator.ts` (`interpolateConcavePoint`, ~lines 59-206)
- Test: `tests/unit/animation-engine/prop-interpolator-concave.test.ts`

- [ ] **Step 1: Read both files' concave functions first.** They carry the same `2*straight − circle` reflection as the 3D site did. Each computes an (x, y) point from start/end angles and progress.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/animation-engine/prop-interpolator-concave.test.ts
// Adjust the import to the actual exported symbol found in Step 1 — the
// concave interpolation entry in prop-interpolator.ts. The assertions below
// are the contract; the harness around them adapts to the real signature.
import { describe, it, expect } from "vitest";
import { concaveRadiusProfile, BASE_DIP_RADIUS } from "$lib/shared/3d/services/petal-path";

describe("2D concave parity with petal model", () => {
  it("petal profile is the shared source of truth", () => {
    // Guard test: the 2D interpolator must import concaveRadiusProfile
    // rather than reimplementing reflection. Assert via behavior:
    // radius at mid-step, 0 turns, k=0 equals BASE_DIP_RADIUS.
    expect(concaveRadiusProfile(0.5, 0, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
  });
});
```

Then add behavior assertions against the real 2D function once its signature is known: same four cases as Task 2 (endpoints on radius, 0-turn mid dip, 1-turn valley at mid, k=1 to center). If the 2D interpolator has no turns/depth inputs yet, thread them through the same way `pathShape` already flows (per-step motion data field).

- [ ] **Step 3: Port both call sites to `concaveRadiusProfile`** — delete the local reflection math, import from `$lib/shared/3d/services/petal-path` (pure module, no Three dependency issue for 2D consumers; it imports nothing from three).

- [ ] **Step 4: Run the 2D suites**

Run: `npx vitest run tests/unit/animation-engine/ tests/unit/hand-paths/ 2>/dev/null || npx vitest run tests/unit/`
Expected: PASS. Update any pinned legacy-concave coordinates as in Task 2.

- [ ] **Step 5: Grep-proof no reflection math remains**

Run: `grep -rn "2 \* straight\|2\*straight" src/lib/`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/animation-engine/services/prop-interpolator.ts src/lib/features/hand-paths/hand-path-builder/services/hand-path-animator.ts tests/unit/animation-engine/prop-interpolator-concave.test.ts
git commit -m "feat(animation): 2D concave interpolation on shared petal model" -- src/lib/shared/animation-engine/services/prop-interpolator.ts src/lib/features/hand-paths/hand-path-builder/services/hand-path-animator.ts tests/unit/animation-engine/prop-interpolator-concave.test.ts
```

### Task 4: Visual verification checkpoint (Austen)

**Files:** none (verification gate)

- [ ] **Step 1:** Full check once: `npm run check > "$TMPDIR/check.log" 2>&1; grep -ciE "error" "$TMPDIR/check.log"` — expect 0 new errors.
- [ ] **Step 2:** Ask Austen to open the hand-path lab / 3D viewer on an anti sequence with 0, 0.5, and 1 turns and confirm the smoosh is gone and petal counts read 4/6/8 per cycle. This is a user gate — per verification-protocol, do not claim visual success without his confirmation. Capture his real-sequence examples as fixture sequence JSONs under `tests/fixtures/wall-feasibility/` for later tasks.

---

## Phase 1 — Feasibility scan + dual-wheel fallback

### Task 5: Promote swept-volume geometry to shared services

**Files:**
- Create: `src/lib/shared/3d/services/swept-volume/swept-tube.ts` (moved)
- Create: `src/lib/shared/3d/services/swept-volume/swept-volume-builder.ts` (moved)
- Create: `src/lib/shared/3d/services/swept-volume/types.ts`
- Modify: `src/lib/features/stage/locomotion/dodge/swept-tube.ts`, `.../swept-volume-builder.ts`, `.../dodge-types.ts` (become re-exports)
- Test: existing `swept-tube.test.ts` / `swept-volume-builder.test.ts` keep passing

- [ ] **Step 1:** Create `types.ts` holding `SweepSample`/`SweptVolume` (copy from `dodge-types.ts`, keeping the `SimPropTarget` alias import from collision-lab types). Move `swept-tube.ts` and `swept-volume-builder.ts` bodies verbatim into the new directory; fix their relative imports to the new `./types`.
- [ ] **Step 2:** Replace the three dodge files' moved contents with re-exports, e.g. `export * from "$lib/shared/3d/services/swept-volume/swept-tube";` (keep `DodgeSide`/`DodgeKnob`/`BodyPlacement`/`DodgePlan` in `dodge-types.ts` — only `SweepSample`/`SweptVolume` move).
- [ ] **Step 3:** Run: `npx vitest run src/lib/features/stage/locomotion/dodge/` — expected PASS unchanged.
- [ ] **Step 4:** Commit

```bash
git add src/lib/shared/3d/services/swept-volume/ src/lib/features/stage/locomotion/dodge/swept-tube.ts src/lib/features/stage/locomotion/dodge/swept-volume-builder.ts src/lib/features/stage/locomotion/dodge/dodge-types.ts
git commit -m "refactor(3d): promote swept-volume geometry from dodge lab to shared services" -- src/lib/shared/3d/services/swept-volume/ src/lib/features/stage/locomotion/dodge/swept-tube.ts src/lib/features/stage/locomotion/dodge/swept-volume-builder.ts src/lib/features/stage/locomotion/dodge/dodge-types.ts
```

### Task 6: Verdict types in sequence metadata

**Files:**
- Modify: `src/lib/shared/foundation/domain/models/sequence-data.ts` (metadata conventions doc + types)
- Create: `src/lib/shared/3d/domain/models/wall-feasibility.ts`

- [ ] **Step 1: Define the types**

```ts
// src/lib/shared/3d/domain/models/wall-feasibility.ts
/**
 * Wall-plane feasibility verdict, written offline by the feasibility
 * scanner (scripts/scan-wall-feasibility.ts) into sequence metadata.
 * The viewer reads it to choose plane mode and path params. Absent =
 * unscanned: current behavior, no claims.
 */
export type WallFeasibilityVerdict = true | "withCheat" | false;

/** Per-step, per-hand path overrides. Phase 2 writes k; Phase 3 adds depthOffset. */
export interface WallPlaneStepOverride {
  /** Concavity depth 0..1 for this step's concave path. */
  k?: number;
  /** Phase 3: per-hand z-offset toward (−) / away from (+) the body, meters. */
  depthOffset?: number;
}

export interface WallFeasibilityMetadata {
  wallFeasible: WallFeasibilityVerdict;
  /** Keyed by step index, then hand. Only present for "withCheat". */
  wallPlaneOverrides?: Record<
    number,
    { blue?: WallPlaneStepOverride; red?: WallPlaneStepOverride }
  >;
  /** Scanner version for invalidation when thresholds/model change. */
  scanVersion: number;
}
```

- [ ] **Step 2:** In `sequence-data.ts`, extend the documented metadata convention (where `metadata.pathShape` is documented) with an optional `wallFeasibility?: WallFeasibilityMetadata` entry, importing the type.
- [ ] **Step 3:** Run `npm run check:fast` — expect clean.
- [ ] **Step 4:** Commit

```bash
git add src/lib/shared/3d/domain/models/wall-feasibility.ts src/lib/shared/foundation/domain/models/sequence-data.ts
git commit -m "feat(3d): wall-plane feasibility verdict types in sequence metadata" -- src/lib/shared/3d/domain/models/wall-feasibility.ts src/lib/shared/foundation/domain/models/sequence-data.ts
```

### Task 7: Sequence feasibility scanner (core service)

**Files:**
- Create: `src/lib/shared/3d/services/wall-feasibility-scanner.ts`
- Test: `tests/unit/3d/wall-feasibility-scanner.test.ts`

The scan per step: build blue+red swept volumes via `buildSweptVolume` (WALL plane configs), evaluate them against a fixed square stance with `StanceSimulator.evaluateSweep`, flag the step if any collision depth exceeds zero.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d/wall-feasibility-scanner.test.ts
import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  scanStepPair,
  scanSequenceSteps,
} from "$lib/shared/3d/services/wall-feasibility-scanner";
import type { MotionConfig3D } from "$lib/shared/3d/domain/models/motion-data-3d";

function motion(
  overrides: Partial<MotionConfig3D>
): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: "n" as GridLocation,
    endLocation: "e" as GridLocation,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    ...overrides,
  };
}

describe("scanStepPair", () => {
  it("far-apart static holds are clean", () => {
    const blue = motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const red = motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const result = scanStepPair(blue, red);
    expect(result.clean).toBe(true);
    expect(result.collisions).toHaveLength(0);
  });

  it("crossing dashes through center collide", () => {
    const blue = motion({ motionType: MotionType.DASH, startLocation: "w" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const red = motion({ motionType: MotionType.DASH, startLocation: "e" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const result = scanStepPair(blue, red);
    expect(result.clean).toBe(false);
    expect(result.collisions.length).toBeGreaterThan(0);
  });
});

describe("scanSequenceSteps", () => {
  it("verdict true when all steps clean, false when any flagged", () => {
    const cleanStep = {
      blue: motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
      red: motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
    };
    const dirtyStep = {
      blue: motion({ motionType: MotionType.DASH, startLocation: "w" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
      red: motion({ motionType: MotionType.DASH, startLocation: "e" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
    };
    expect(scanSequenceSteps([cleanStep]).wallFeasible).toBe(true);
    const flagged = scanSequenceSteps([cleanStep, dirtyStep]);
    expect(flagged.wallFeasible).toBe(false);
    expect(flagged.flaggedSteps).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/3d/wall-feasibility-scanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the scanner**

```ts
// src/lib/shared/3d/services/wall-feasibility-scanner.ts
/**
 * Offline wall-plane feasibility scan. Builds swept volumes for both hands
 * of each step (through calculatePropState — the renderer's own math, so
 * concaveDepth cheats are honored automatically) and evaluates them against
 * a fixed square-to-audience stance with the Collision Lab's StanceSimulator.
 *
 * Offline-only by design (scripts + solver). Not called during playback.
 */
import {
  StanceSimulator,
  restPoseFromHeight,
} from "$lib/features/lab/tabs/collision-lab/services/stance-simulator";
import type { SimCollision } from "$lib/features/lab/tabs/collision-lab/services/types";
import { buildSweptVolume } from "./swept-volume/swept-volume-builder";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";

/** Bump when thresholds, stance, or the petal model change shape. */
export const SCAN_VERSION = 1;

const DEFAULT_HEIGHT_M = 1.7;
/** Square to the audience: no foot offset, no yaw, upright spine. */
const SQUARE_STANCE = {
  footOffsetX: 0,
  footOffsetZ: 0,
  rootYawRad: 0,
  torsoTwistRad: 0,
  spinePitchRad: 0,
};

export interface StepMotionPair {
  blue: MotionConfig3D;
  red: MotionConfig3D;
}

export interface StepScanResult {
  clean: boolean;
  collisions: SimCollision[];
  worstDepth: number;
}

export interface SequenceScanResult {
  wallFeasible: boolean;
  flaggedSteps: number[];
  stepResults: StepScanResult[];
}

export function scanStepPair(
  blue: MotionConfig3D,
  red: MotionConfig3D,
  heightM = DEFAULT_HEIGHT_M
): StepScanResult {
  const sim = new StanceSimulator(restPoseFromHeight(heightM));
  const blueSweep = buildSweptVolume(blue).samples;
  const redSweep = buildSweptVolume(red).samples;
  const result = sim.evaluateSweep(SQUARE_STANCE, blueSweep, redSweep);
  return {
    clean: result.collisions.length === 0,
    collisions: result.collisions,
    worstDepth: result.totalCollisionDepth,
  };
}

export function scanSequenceSteps(
  steps: StepMotionPair[],
  heightM = DEFAULT_HEIGHT_M
): SequenceScanResult {
  const stepResults = steps.map((s) => scanStepPair(s.blue, s.red, heightM));
  const flaggedSteps = stepResults
    .map((r, i) => (r.clean ? -1 : i))
    .filter((i) => i >= 0);
  return { wallFeasible: flaggedSteps.length === 0, flaggedSteps, stepResults };
}
```

Signature check before running: confirm `StanceSimulator`'s constructor and `evaluateSweep` stance argument shape against `stance-simulator.ts:114-142,226-232` (a `StancePose` type — adapt `SQUARE_STANCE` to its actual field names; the intent is the neutral square stance). If the simulator's per-hand plane frame needs the `STAGE.AVATAR_GRID_OFFSET` shift, `buildSweptVolume` already applies it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/3d/wall-feasibility-scanner.test.ts`
Expected: PASS. If the crossing-dash case does not collide, drop the sample count assumption and debug with `worstDepth` printed — the two tubes pass through the center simultaneously, so `prop-through-prop` must fire; check the stance frame alignment first.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/services/wall-feasibility-scanner.ts tests/unit/3d/wall-feasibility-scanner.test.ts
git commit -m "feat(3d): wall-plane feasibility scanner over swept volumes + stance simulator" -- src/lib/shared/3d/services/wall-feasibility-scanner.ts tests/unit/3d/wall-feasibility-scanner.test.ts
```

### Task 8: Scan script + fixtures

**Files:**
- Create: `scripts/scan-wall-feasibility.ts`
- Use: fixture sequences from Task 4 in `tests/fixtures/wall-feasibility/`

- [ ] **Step 1: Write the script.** Follow `scan-collision-lab.ts`'s arg/report pattern but with LIVE import paths (see Known trap). Input: one or more sequence JSON files (the app's sequence-data shape) or a directory. For each: map steps to `StepMotionPair[]` (blue/red `MotionConfig3D` with `plane: Plane.WALL`), call `scanSequenceSteps`, print per-sequence verdict + flagged steps, and with `--write` merge `{ wallFeasibility: { wallFeasible, scanVersion: SCAN_VERSION } }` into each file's `metadata`. The step→MotionConfig3D mapping mirrors how the 3D viewer converts sequence steps for playback — locate that conversion (grep `MotionConfig3D` consumers under `src/lib/shared/3d/state/`) and reuse/extract it rather than re-deriving fields.
- [ ] **Step 2:** Run: `npx tsx scripts/scan-wall-feasibility.ts tests/fixtures/wall-feasibility/ --verbose` — expect verdicts printed for every fixture; compare against Austen's labels (fixture files carry a `label` field: `possible | impossible | cheatable`).
- [ ] **Step 3:** Report the agreement table (scan verdict vs label) in the task summary. Mismatches are tuning input, not automatic failures — record them.
- [ ] **Step 4: Commit**

```bash
git add scripts/scan-wall-feasibility.ts tests/fixtures/wall-feasibility/
git commit -m "feat(scripts): wall-plane feasibility scan script with fixture agreement report" -- scripts/scan-wall-feasibility.ts tests/fixtures/wall-feasibility/
```

### Task 9: Viewer fallback policy

**Files:**
- Modify: `src/lib/shared/3d/state/avatar-instance-state.svelte.ts` (sequence-load path)
- Test: `tests/unit/3d/wall-feasibility-policy.test.ts`

- [ ] **Step 1: Extract the policy as a pure function** (testable without Svelte):

```ts
// add to src/lib/shared/3d/services/wall-feasibility-scanner.ts
import { PlaneMode } from "@austencloud/scene-3d";
import type { WallFeasibilityMetadata } from "../domain/models/wall-feasibility";

export interface PlanePolicy {
  planeMode: PlaneMode;
  /** Show the unobtrusive "shown in wheel plane" notice. */
  showWheelNotice: boolean;
}

export function resolvePlanePolicy(
  meta: WallFeasibilityMetadata | undefined
): PlanePolicy {
  if (meta && meta.wallFeasible === false) {
    return { planeMode: PlaneMode.DUAL_WHEEL, showWheelNotice: true };
  }
  // true, "withCheat", or unscanned: wall plane. "withCheat" additionally
  // applies per-step overrides at the MotionConfig3D conversion seam.
  return { planeMode: PlaneMode.WALL, showWheelNotice: false };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/3d/wall-feasibility-policy.test.ts
import { describe, it, expect } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import { resolvePlanePolicy } from "$lib/shared/3d/services/wall-feasibility-scanner";

describe("resolvePlanePolicy", () => {
  it("unscanned → wall plane, no notice", () => {
    expect(resolvePlanePolicy(undefined)).toEqual({
      planeMode: PlaneMode.WALL,
      showWheelNotice: false,
    });
  });
  it("feasible and withCheat → wall plane", () => {
    expect(resolvePlanePolicy({ wallFeasible: true, scanVersion: 1 }).planeMode).toBe(PlaneMode.WALL);
    expect(resolvePlanePolicy({ wallFeasible: "withCheat", scanVersion: 1 }).planeMode).toBe(PlaneMode.WALL);
  });
  it("infeasible → dual wheel + notice", () => {
    const p = resolvePlanePolicy({ wallFeasible: false, scanVersion: 1 });
    expect(p.planeMode).toBe(PlaneMode.DUAL_WHEEL);
    expect(p.showWheelNotice).toBe(true);
  });
});
```

Run to fail, implement (Step 1 code), run to pass: `npx vitest run tests/unit/3d/wall-feasibility-policy.test.ts`

- [ ] **Step 3: Wire into `avatar-instance-state.svelte.ts`.** At the sequence-load site (where a new sequence's motions are converted — near `reconvertWithConfig()` line ~644 / the sequence setter), read `sequence.metadata?.wallFeasibility`, call `resolvePlanePolicy`, and apply via the existing `setPlaneMode()` (line ~491). Rules: apply ONLY on sequence change, never override a user's manual plane selection made after load (track a `userPinnedPlane` flag set by the existing UI setters and cleared on sequence change). Notice UI: reuse the viewer's existing toast/notice primitive — grep `notice\|toast` under `src/lib/shared/sequence-viewer/` and use what exists; text: "Shown in wheel plane — this sequence can't be done facing the audience." No new notice component (never-hand-roll).
- [ ] **Step 4:** Run: `npx vitest run tests/unit/3d/` and `npm run check:fast` — expect clean.
- [ ] **Step 5:** Ask Austen to load a fixture-flagged sequence in the viewer and confirm auto dual-wheel + notice + manual override still works. User gate.
- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/3d/services/wall-feasibility-scanner.ts src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/wall-feasibility-policy.test.ts
git commit -m "feat(3d): auto dual-wheel fallback policy from wall-feasibility verdict" -- src/lib/shared/3d/services/wall-feasibility-scanner.ts src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/wall-feasibility-policy.test.ts
```

---

## Phase 2 — Concavity solver

### Task 10: Minimum-depth solver

**Files:**
- Create: `src/lib/shared/3d/services/concavity-solver.ts`
- Test: `tests/unit/3d/concavity-solver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d/concavity-solver.test.ts
import { describe, it, expect } from "vitest";
import { solveStepConcavity } from "$lib/shared/3d/services/concavity-solver";
import { scanStepPair } from "$lib/shared/3d/services/wall-feasibility-scanner";
// reuse the motion() helper from wall-feasibility-scanner.test.ts (copy it here;
// executors: identical helper, do not import across test files)

describe("solveStepConcavity", () => {
  it("returns null k for already-clean steps", () => {
    /* clean static pair as in scanner test */
    // expect result.cleared === true, result.k === null
  });

  it("solved k clears the collision test when re-scanned", () => {
    // Construct a step where blue is ANTI (concave-eligible) crossing red's
    // territory; expect cleared === true and k > 0, then assert
    // scanStepPair(withK(blue, result.k), red).clean === true
  });

  it("pro-rotation conflicts are not solvable — bails with cleared=false", () => {
    // Crossing DASH/DASH pair (no concave-eligible hand): expect
    // cleared === false, k === null
  });

  it("solved k is minimal: k − step below fails", () => {
    // For the solvable case: scanStepPair with k − 0.1 (floored at 0) is not clean
  });
});
```

Executors: fill the motion constructions from the scanner test's helper; the four assertions above are the contract. Run to FAIL (module missing).

- [ ] **Step 2: Write the solver**

```ts
// src/lib/shared/3d/services/concavity-solver.ts
/**
 * Minimum-depth concavity solver (Option B). For a flagged step, binary-search
 * the smallest concaveDepth k that clears the wall-plane collision test.
 * Deep pull only when needed; natural look preserved. Only concave-eligible
 * hands (ANTI motions, or explicit pathShape "concave") participate — pro
 * conflicts bail to the dual-wheel fallback.
 */
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { scanStepPair } from "./wall-feasibility-scanner";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";

const K_TOLERANCE = 0.02;
const MAX_ITERATIONS = 8; // bisection: resolves k to < 1/256

export interface ConcavitySolveResult {
  cleared: boolean;
  /** Minimum clearing depth, null when no cheat was needed or possible. */
  k: number | null;
  /** Which hands received the depth. */
  hands: Array<"blue" | "red">;
}

function concaveEligible(m: MotionConfig3D): boolean {
  return m.motionType === MotionType.ANTI || m.pathShape === "concave";
}

function withDepth(m: MotionConfig3D, k: number): MotionConfig3D {
  return concaveEligible(m) ? { ...m, pathShape: "concave", concaveDepth: k } : m;
}

export function solveStepConcavity(
  blue: MotionConfig3D,
  red: MotionConfig3D
): ConcavitySolveResult {
  if (scanStepPair(blue, red).clean) {
    return { cleared: true, k: null, hands: [] };
  }

  const hands: Array<"blue" | "red"> = [];
  if (concaveEligible(blue)) hands.push("blue");
  if (concaveEligible(red)) hands.push("red");
  if (hands.length === 0) return { cleared: false, k: null, hands: [] };

  // Feasibility probe at max depth first — if k=1 doesn't clear, bail.
  if (!scanStepPair(withDepth(blue, 1), withDepth(red, 1)).clean) {
    return { cleared: false, k: null, hands };
  }

  // Bisect the smallest clearing k.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > K_TOLERANCE; i++) {
    const mid = (lo + hi) / 2;
    if (scanStepPair(withDepth(blue, mid), withDepth(red, mid)).clean) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { cleared: true, k: hi, hands };
}
```

Note the assumption bisection relies on: clearance is monotonic in k (deeper = closer to center = further from the other arm's territory). The scanner test's monotonicity is asserted in Task 1 at the radius level; if a real fixture ever violates clearance monotonicity, fall back to a linear sweep (documented here, implemented only if a fixture demands it).

- [ ] **Step 3:** Run: `npx vitest run tests/unit/3d/concavity-solver.test.ts` — expect PASS.
- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/3d/services/concavity-solver.ts tests/unit/3d/concavity-solver.test.ts
git commit -m "feat(3d): minimum-depth concavity solver for flagged wall-plane steps" -- src/lib/shared/3d/services/concavity-solver.ts tests/unit/3d/concavity-solver.test.ts
```

### Task 11: Solver → metadata → renderer plumbing

**Files:**
- Modify: `scripts/scan-wall-feasibility.ts` (add `--solve`)
- Modify: `src/lib/shared/3d/state/avatar-instance-state.svelte.ts` (apply overrides at MotionConfig3D conversion)
- Test: extend `tests/unit/3d/wall-feasibility-policy.test.ts`

- [ ] **Step 1:** In the scan script, with `--solve`: for each flagged step run `solveStepConcavity`; all cleared → verdict `"withCheat"` and write `wallPlaneOverrides[stepIndex][hand] = { k }` for each solved hand; any step uncleared → verdict `false` (overrides omitted). Re-run fixture agreement report — `cheatable`-labeled fixtures should now land `"withCheat"`.
- [ ] **Step 2:** At the viewer's sequence→`MotionConfig3D` conversion seam (same site found in Task 8 Step 1), when verdict is `"withCheat"`, stamp `concaveDepth` (and `pathShape: "concave"`) from `wallPlaneOverrides` onto the matching step/hand configs. Version skew rule from the spec: if `scanVersion !== SCAN_VERSION`, ignore overrides, honor plane verdict only.
- [ ] **Step 3:** Extend the policy test: `"withCheat"` keeps wall plane (already covered) and a conversion-level unit test asserting a step's config receives `concaveDepth` from metadata (test the extracted conversion helper directly).
- [ ] **Step 4:** Full gate: `npm run check > "$TMPDIR/check2.log" 2>&1; grep -ciE "error" "$TMPDIR/check2.log"` → 0; `npx vitest run tests/unit/3d/` → PASS.
- [ ] **Step 5:** Ask Austen: load a `"withCheat"` fixture, confirm wall plane retained and the deep-concave cheat visibly sneaks the staff under the shoulder line. User gate.
- [ ] **Step 6: Commit**

```bash
git add scripts/scan-wall-feasibility.ts src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/wall-feasibility-policy.test.ts
git commit -m "feat(3d): withCheat verdict — solver overrides flow metadata → renderer" -- scripts/scan-wall-feasibility.ts src/lib/shared/3d/state/avatar-instance-state.svelte.ts tests/unit/3d/wall-feasibility-policy.test.ts
```

---

## Phase 3 — Per-hand depth layering (DESIGN ONLY — no tasks)

Not implemented in this plan. The data shape is already locked (Task 6: `WallPlaneStepOverride.depthOffset`), so adding it later is additive: solver space becomes `(k, zBlue, zRed)`, minimal-total-deformation objective; prereqs are body reference points on the rig and new `ElbowPoleComputer` cases per the archived negative-space doc. Do not start this without a fresh plan.

---

## Sequence-label ground truth (runs alongside Phase 1-2)

Fixture files in `tests/fixtures/wall-feasibility/*.json` carry Austen's labels (`possible | impossible | cheatable`). The scan script's agreement report is the tuning loop: thresholds (`stance-simulator.ts` constants) and `BASE_DIP_RADIUS`/profile shape are tuned until labels agree. Never tune by editing a fixture's label.

## Execution notes

- Fable-routing: dispatch Sonnet executors per task; Fable reviews between tasks.
- Tasks 1-3 sequential (shared petal module). Task 5 independent — may run parallel with 1-3 in a worktree. Tasks 6-9 sequential after 4+5. Tasks 10-11 after 9.
- Every "ask Austen" step is a hard gate per verification-protocol — no visual claims without his confirmation or a screenshot.
