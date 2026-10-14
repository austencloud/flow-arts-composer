# Halved Pictograph Pipeline — Phase 1: Halfway-Orientation Algebra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `calculateOrientationAt(motion, t)` — the correct orientation of a prop at any fraction `t` along a motion — as the keystone for halving pictographs, and fix the two twinned interradial/center orientation bugs it depends on.

**Architecture:** A halfway orientation is a *physical* fact (where the staff actually is at `t`), so the keystone samples the production animation engine (`interpolatePropAngles`) for the staff angle and inverts it through an angle↔orientation bijection over the 8-point radial cycle. Correctness at `t=1` is pinned by a dataset-wide invariant against the shipped `calculateEndOrientation`. Two prerequisite bugs (cardinal-only angle map; blanket-lowercased orientation normalization) are fixed first so the bijection and the oracle are trustworthy for interradial (L6) starts.

**Tech Stack:** TypeScript, Svelte 5 repo, Vitest (node env), `$lib` path alias. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md` (§5, §3.1).

**Scope of this plan:** Phase 1 only. Radial orientations (cardinal + interradial). Center-family (L4 "spun") orientation halving returns `null` (deferred to the physical-pose fallback) — but the Task 1 casing fix repairs center handling in the *discrete* algebra regardless. Phases 2–3 (half-motion arrow identity, render integration, guide rewire) get their own plans once this lands.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/shared/render/core/calculations/orientation.ts` | Discrete orientation algebra | **Modify** — canonical-casing normalization (Task 1) |
| `src/lib/shared/render/core/__tests__/orientation.test.ts` | Discrete algebra tests | **Modify** — flip 2 `it.fails`, replace the "documents buggy behavior" test (Task 1) |
| `src/lib/shared/render/core/calculations/orientation-angle.ts` | **Pure** angle↔orientation bijection (8-point radial), forward + inverse | **Create** (Task 2) |
| `src/lib/shared/render/core/__tests__/orientation-angle.test.ts` | Bijection tests | **Create** (Task 2) |
| `src/lib/shared/animation-engine/services/angle-calculator.ts` | Engine angle math | **Modify** — `mapOrientationToAngle` uses the 8-point map (Task 3) |
| `src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts` | Engine map test | **Create** (Task 3) |
| `src/lib/shared/animation-engine/services/orientation-at.ts` | `calculateOrientationAt(motion, t)` — engine sampling + inverse | **Create** (Task 4) |
| `src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts` | Keystone tests: `t=1` invariant, halfway cases, off-lattice, decidability | **Create** (Task 4) |

Boundaries: the bijection (Task 2) is **pure** and depends on nothing but the cycle constants and math — it can be reasoned about and tested in isolation. The engine-sampling wrapper (Task 4) is the only unit that touches the animation engine. Task 3 makes the engine itself correct for interradial endpoints so Task 4's `t=1` invariant can pass.

---

## Task 1: Fix interradial/center orientation normalization in `calculateEndOrientation`

`calculateEndOrientation` lowercases the start orientation (`orientation.ts:260`) but the cycle constants and `switchOrientation` are keyed camelCase, so `clockIn`/`centerN`/etc. miss every lookup and are returned unchanged. `orientation.test.ts` already has two `it.fails` guards waiting for this fix.

**Files:**
- Modify: `src/lib/shared/render/core/calculations/orientation.ts`
- Test: `src/lib/shared/render/core/__tests__/orientation.test.ts`

- [ ] **Step 1: Turn the two `it.fails` guards into real (currently-failing) tests**

In `src/lib/shared/render/core/__tests__/orientation.test.ts`, change the two `it.fails(...)` at the interradial/center block to `it(...)`:

```ts
  it("pro 1 turn from clockIn SHOULD reverse to counterOut", () => {
    expect(
      calculateEndOrientation({
        motionType: "pro",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
        startOrientation: "clockIn",
      })
    ).toBe("counterOut");
  });

  it("static 1 turn from centerN SHOULD reverse to centerS", () => {
    expect(
      calculateEndOrientation({
        motionType: "static",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "c",
        endLocation: "c",
        startOrientation: "centerN",
      })
    ).toBe("centerS");
  });
```

- [ ] **Step 2: Replace the "documents buggy behavior" test with a canonical-casing test**

That test (currently asserting `.toBe("clockin")`) pins the bug being removed. Replace the whole `it("documents the current (buggy) behavior: ...")` block with:

```ts
  it("normalizes mixed-case interradial input to the canonical orientation", () => {
    // Any casing of a canonical orientation must resolve to the camelCase form.
    expect(
      calculateEndOrientation({
        motionType: "pro",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
        startOrientation: "CLOCKIN",
      })
    ).toBe("counterOut");
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/shared/render/core/__tests__/orientation.test.ts`
Expected: FAIL — the two un-failed tests now report actual `clockin`/`centern` (unchanged) instead of `counterOut`/`centerS`; the new mixed-case test fails too.

- [ ] **Step 4: Add a canonical-orientation normalizer and use it in `calculateEndOrientation` + `calculateOrientations`**

In `src/lib/shared/render/core/calculations/orientation.ts`, add after the `RADIAL_CW_CYCLE` / `CENTER_CW_CYCLE` declarations (around line 163):

```ts
const ORIENTATION_BY_LOWER: Record<string, Orientation> = (() => {
  const map: Record<string, Orientation> = {};
  for (const o of [...RADIAL_CW_CYCLE, ...CENTER_CW_CYCLE]) {
    map[(o as string).toLowerCase()] = o;
  }
  return map;
})();

/**
 * Normalize any-case orientation input to its canonical camelCase form.
 * Blanket .toLowerCase() breaks interradial (clockIn) / center (centerN)
 * orientations because switchOrientation + the cycles are keyed camelCase.
 */
export function canonicalOrientation(raw: string | undefined): Orientation {
  if (!raw) return "in";
  return ORIENTATION_BY_LOWER[raw.toLowerCase()] ?? "in";
}
```

Then replace line 260:

```ts
  const startOri = (startOrientation?.toLowerCase() as Orientation) || "in";
```

with:

```ts
  const startOri = canonicalOrientation(startOrientation);
```

And in `calculateOrientations` replace line 292:

```ts
  const startOrientation = (input.startOrientation?.toLowerCase() as Orientation) || "in";
```

with:

```ts
  const startOrientation = canonicalOrientation(input.startOrientation);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/shared/render/core/__tests__/orientation.test.ts`
Expected: PASS — all tests green, including the previously-`it.fails` interradial/center cases and the new mixed-case test. Confirm the existing case-insensitive cardinal tests still pass (regression check).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/render/core/calculations/orientation.ts src/lib/shared/render/core/__tests__/orientation.test.ts
git commit -m "fix(orientation): canonical-case normalization so interradial/center starts propagate correctly" -- src/lib/shared/render/core/calculations/orientation.ts src/lib/shared/render/core/__tests__/orientation.test.ts
```

---

## Task 2: Angle↔orientation bijection (pure)

The 8-point radial cycle maps to staff angles by `staffAngle = centerPathAngle + PI − k·(PI/4)`, where `k` is the index in `RADIAL_CW_CYCLE`. The inverse recovers `k` and returns `null` when the angle is off the 45° lattice.

**Files:**
- Create: `src/lib/shared/render/core/calculations/orientation-angle.ts`
- Test: `src/lib/shared/render/core/__tests__/orientation-angle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/render/core/__tests__/orientation-angle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  orientationToStaffAngle,
  staffAngleToOrientation,
  RADIAL_CYCLE,
} from "$lib/shared/render/core/calculations/orientation-angle";
import type { Orientation } from "$lib/shared/render/core/types";

const PI = Math.PI;
const QUARTER = PI / 4;

describe("orientationToStaffAngle (8-point forward map)", () => {
  // At centerPathAngle 0: out=0, in=PI, clock=PI/2, counter=3PI/2 (i.e. -PI/2),
  // and the interradials sit halfway between, 45deg apart.
  const cases: Array<[Orientation, number]> = [
    ["out", 0],
    ["clockOut", QUARTER],
    ["clock", PI / 2],
    ["clockIn", (3 * PI) / 4],
    ["in", PI],
    ["counterIn", (5 * PI) / 4],
    ["counter", (3 * PI) / 2],
    ["counterOut", (7 * PI) / 4],
  ];
  for (const [ori, expected] of cases) {
    it(`${ori} -> ${expected.toFixed(4)} at centerPathAngle 0`, () => {
      expect(orientationToStaffAngle(ori, 0)).toBeCloseTo(expected, 6);
    });
  }

  it("is offset by centerPathAngle (relative, not absolute)", () => {
    expect(orientationToStaffAngle("out", PI / 2)).toBeCloseTo(PI / 2, 6);
    expect(orientationToStaffAngle("in", PI / 2)).toBeCloseTo((3 * PI) / 2, 6);
  });
});

describe("staffAngleToOrientation (inverse)", () => {
  it("round-trips every radial orientation at several centerPathAngles", () => {
    for (const centerPathAngle of [0, PI / 2, PI, 1.234]) {
      for (const ori of RADIAL_CYCLE) {
        const angle = orientationToStaffAngle(ori, centerPathAngle);
        expect(staffAngleToOrientation(angle, centerPathAngle)).toBe(ori);
      }
    }
  });

  it("returns null for an off-lattice (22.5deg) angle", () => {
    // Halfway between out (0) and clockOut (PI/4) = PI/8 — no legal orientation.
    expect(staffAngleToOrientation(PI / 8, 0)).toBeNull();
  });

  it("tolerates small floating-point noise (within epsilon)", () => {
    expect(staffAngleToOrientation(PI / 2 + 1e-9, 0)).toBe("clock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/render/core/__tests__/orientation-angle.test.ts`
Expected: FAIL — "Cannot find module .../orientation-angle".

- [ ] **Step 3: Write the implementation**

Create `src/lib/shared/render/core/calculations/orientation-angle.ts`:

```ts
import type { Orientation } from "../types.js";

const PI = Math.PI;
const TWO_PI = 2 * PI;
const QUARTER = PI / 4;

/** The 8-point radial cycle, CW, each step = 45deg. Index 0 = "in". */
export const RADIAL_CYCLE: Orientation[] = [
  "in", "clockIn", "clock", "clockOut",
  "out", "counterOut", "counter", "counterIn",
];

function normalizePositive(angle: number): number {
  const n = angle % TWO_PI;
  return n < 0 ? n + TWO_PI : n;
}

/**
 * The absolute staff angle for a radial orientation, given the hand's
 * center-path angle. Convention (matches the animation engine):
 *   out   = centerPathAngle
 *   in    = centerPathAngle + PI
 *   clock = centerPathAngle + PI/2
 * and each +1 step in RADIAL_CYCLE is -PI/4 from the previous, so
 *   staffAngle = centerPathAngle + PI - k*(PI/4).
 */
export function orientationToStaffAngle(
  ori: Orientation,
  centerPathAngle: number
): number {
  const k = RADIAL_CYCLE.indexOf(ori);
  if (k === -1) return normalizePositive(centerPathAngle); // non-radial: caller guards
  return normalizePositive(centerPathAngle + PI - k * QUARTER);
}

/**
 * Inverse: the radial orientation at a given absolute staff angle, or null when
 * the angle is off the 45deg lattice (no legal orientation — e.g. a 22.5deg
 * halfway point). epsilon guards floating-point noise from the engine.
 */
export function staffAngleToOrientation(
  staffAngle: number,
  centerPathAngle: number,
  epsilonSteps = 1e-6
): Orientation | null {
  const offset = normalizePositive(staffAngle - centerPathAngle);
  const kFloat = (PI - offset) / QUARTER;
  const kRounded = Math.round(kFloat);
  if (Math.abs(kFloat - kRounded) > epsilonSteps) return null;
  const idx = ((kRounded % 8) + 8) % 8;
  return RADIAL_CYCLE[idx]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/render/core/__tests__/orientation-angle.test.ts`
Expected: PASS — all forward, round-trip, off-lattice, and epsilon cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/render/core/calculations/orientation-angle.ts src/lib/shared/render/core/__tests__/orientation-angle.test.ts
git commit -m "feat(orientation): pure angle<->orientation bijection over the 8-point radial cycle" -- src/lib/shared/render/core/calculations/orientation-angle.ts src/lib/shared/render/core/__tests__/orientation-angle.test.ts
```

---

## Task 3: Engine `mapOrientationToAngle` uses the 8-point map

`angle-calculator.ts:46-64` handles only in/out/clock/counter; any interradial silently returns the `counter` branch. Route it through the Task 2 forward map so the engine sets correct endpoint staff angles for interradial orientations (required for Task 4's `t=1` invariant to hold on L6 starts).

**Files:**
- Modify: `src/lib/shared/animation-engine/services/angle-calculator.ts`
- Test: `src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapOrientationToAngle } from "$lib/shared/animation-engine/services/angle-calculator";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const PI = Math.PI;

describe("mapOrientationToAngle — cardinal (unchanged) + interradial (fixed)", () => {
  it("keeps the four cardinals at their canonical relative angles", () => {
    expect(mapOrientationToAngle(Orientation.OUT, 0)).toBeCloseTo(0, 6);
    expect(mapOrientationToAngle(Orientation.IN, 0)).toBeCloseTo(PI, 6);
    expect(mapOrientationToAngle(Orientation.CLOCK, 0)).toBeCloseTo(PI / 2, 6);
    expect(mapOrientationToAngle(Orientation.COUNTER, 0)).toBeCloseTo((3 * PI) / 2, 6);
  });

  it("places interradials 45deg between their neighbours (was wrongly counter before)", () => {
    expect(mapOrientationToAngle(Orientation.CLOCK_OUT, 0)).toBeCloseTo(PI / 4, 6);
    expect(mapOrientationToAngle(Orientation.CLOCK_IN, 0)).toBeCloseTo((3 * PI) / 4, 6);
    expect(mapOrientationToAngle(Orientation.COUNTER_IN, 0)).toBeCloseTo((5 * PI) / 4, 6);
    expect(mapOrientationToAngle(Orientation.COUNTER_OUT, 0)).toBeCloseTo((7 * PI) / 4, 6);
  });
});
```

Note: confirm the enum member names for interradials (`CLOCK_OUT`/`CLOCK_IN`/`COUNTER_IN`/`COUNTER_OUT`) by reading `src/lib/shared/pictograph/shared/domain/enums/pictograph-enums.ts:102-125` before running; adjust the identifiers to match the actual members if they differ.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts`
Expected: FAIL — the interradial cases return `3PI/2` (the `counter` fallthrough) instead of the 45deg-offset angles.

- [ ] **Step 3: Rewrite `mapOrientationToAngle` to use the bijection**

In `src/lib/shared/animation-engine/services/angle-calculator.ts`, add to the imports near the top:

```ts
import {
  orientationToStaffAngle,
  RADIAL_CYCLE,
} from "$lib/shared/render/core/calculations/orientation-angle";
```

Replace the body of `mapOrientationToAngle` (lines 46-64) with:

```ts
export function mapOrientationToAngle(
  ori: Orientation,
  centerPathAngle: number
): number {
  // Radial (cardinal + interradial): use the canonical 8-point map.
  if (RADIAL_CYCLE.includes(ori as unknown as (typeof RADIAL_CYCLE)[number])) {
    return orientationToStaffAngle(
      ori as unknown as (typeof RADIAL_CYCLE)[number],
      centerPathAngle
    );
  }
  // Non-radial (center/"spun") orientations are unchanged by this pass; keep the
  // prior cardinal behavior as a safe fallback (OUT-relative).
  return normalizeAnglePositive(centerPathAngle);
}
```

`RADIAL_CYCLE` values are the lowercase/camelCase orientation strings; the `Orientation` enum values are those same strings, so the `includes` check matches. Verify by reading the enum: if `Orientation.OUT === "out"` etc., the cast is sound.

- [ ] **Step 4: Run the new test AND the animation-engine suite to verify no regression**

Run: `npx vitest run src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts`
Expected: PASS — cardinals unchanged, interradials now correct.

Run: `npx vitest run src/lib/shared/animation-engine`
Expected: PASS — existing engine tests still green (the cardinal outputs are byte-identical to before; only interradials changed, which nothing correct was relying on).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/animation-engine/services/angle-calculator.ts src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts
git commit -m "fix(engine): mapOrientationToAngle handles interradial orientations via the 8-point map" -- src/lib/shared/animation-engine/services/angle-calculator.ts src/lib/shared/animation-engine/services/__tests__/angle-calculator.test.ts
```

---

## Task 4: `calculateOrientationAt(motion, t)` — the keystone

Sample the engine at `t`, invert the staff angle through the bijection. Radial only; center-family starts return `null` (deferred). Gate correctness with the `t=1` dataset invariant.

**Files:**
- Create: `src/lib/shared/animation-engine/services/orientation-at.ts`
- Test: `src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/shared/animation-engine/services/orientation-at.ts` (built by mirroring `poseAt` in `src/routes/(public)/guide/level-2/_data/halfway-pose.ts:55-90`, which is the proven engine-sampling pattern):

```ts
import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
import { staffAngleToOrientation } from "$lib/shared/render/core/calculations/orientation-angle";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  MotionColor,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode, type GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export type OrientationAtInput = {
  motionType: MotionType;
  rotationDirection: RotationDirection;
  startLocation: GridLocation;
  endLocation: GridLocation;
  startOrientation: Orientation;
  endOrientation: Orientation;
  turns?: number;
};

function isCenterOrientation(ori: string): boolean {
  return ori.startsWith("center");
}

function pathShapeFor(type: MotionType): "arc" | "linear" {
  return type === MotionType.DASH ? "linear" : "arc";
}

/**
 * The prop's orientation at fraction t in [0,1] along a motion, or null when the
 * physical staff angle lands off the 45deg lattice (no legal orientation exists
 * at that t — e.g. halving an L6 quarter-turn) or the motion is a center/"spun"
 * orientation (deferred, Phase 1 scope). At t=1 this equals calculateEndOrientation.
 */
export function calculateOrientationAt(
  m: OrientationAtInput,
  t: number,
  color: MotionColor = MotionColor.RED
): Orientation | null {
  if (isCenterOrientation(m.startOrientation)) return null; // center-family deferred

  const motion = createMotionData({
    motionType: m.motionType,
    rotationDirection: m.rotationDirection,
    startLocation: m.startLocation,
    endLocation: m.endLocation,
    startOrientation: m.startOrientation,
    endOrientation: m.endOrientation,
    turns: m.turns ?? 0,
    color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
    pathShape: pathShapeFor(m.motionType),
  });
  const step = {
    id: "orientation-at",
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { [color === MotionColor.BLUE ? "blue" : "red"]: motion },
  } as unknown as StepData;

  const result = interpolatePropAngles(step, t);
  const angles = color === MotionColor.BLUE ? result.blueAngles : result.redAngles;
  if (!angles) return null;

  return staffAngleToOrientation(angles.staffRotationAngle, angles.centerPathAngle);
}
```

- [ ] **Step 2: Write the `t=1` invariant test (the killer test)**

Create `src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateOrientationAt } from "$lib/shared/animation-engine/services/orientation-at";
import { calculateEndOrientation } from "$lib/shared/render/core/calculations/orientation";
import { getAllLetterVariants } from "../../../../../tests/helpers/real-pictograph-loader";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  MotionType,
  MotionColor,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

// A spread across motion families: Type 1 (pro/anti), Type 4 (dash), Type 6 (static).
const LETTERS = [Letter.A, Letter.B, Letter.G, Letter.J, Letter.PHI, Letter.ALPHA];
const TURN_VALUES = [0, 0.5, 1, 1.5, 2, 2.5, 3];

describe("calculateOrientationAt(·, 1) === calculateEndOrientation (dataset invariant)", () => {
  it("matches the shipped algebra at t=1 for real motions across turn values", async () => {
    const mismatches: string[] = [];
    for (const letter of LETTERS) {
      const variants = await getAllLetterVariants(letter);
      for (const picto of variants) {
        for (const hand of [picto.blueMotionData, picto.redMotionData]) {
          if (!hand) continue;
          if ((hand.startOrientation as string).startsWith("center")) continue; // deferred
          for (const turns of TURN_VALUES) {
            const input = {
              motionType: hand.motionType as MotionType,
              rotationDirection: hand.rotationDirection as RotationDirection,
              startLocation: hand.startLocation,
              endLocation: hand.endLocation,
              startOrientation: hand.startOrientation as Orientation,
              endOrientation: calculateEndOrientation({
                motionType: hand.motionType,
                turns,
                rotationDirection: hand.rotationDirection,
                startLocation: hand.startLocation,
                endLocation: hand.endLocation,
                startOrientation: hand.startOrientation,
              }),
              turns,
            };
            const expected = input.endOrientation;
            const actual = calculateOrientationAt(input, 1, MotionColor.RED);
            if (actual !== expected) {
              mismatches.push(
                `${letter} ${hand.motionType} ${hand.startLocation}->${hand.endLocation} ` +
                  `turns=${turns} start=${hand.startOrientation}: engine@1=${actual} algebra=${expected}`
              );
            }
          }
        }
      }
    }
    expect(mismatches, `\n${mismatches.slice(0, 20).join("\n")}`).toEqual([]);
  }, 30000);
});
```

Note on property names: verify the `PictographData` motion accessors (`blueMotionData`/`redMotionData` vs `blueMotion`/`redMotion`) by reading `src/lib/shared/pictograph/shared/domain/models/PictographData.ts` before running; adjust to the real property names. Verify `Letter.PHI`/`Letter.ALPHA` member names against `src/lib/shared/foundation/domain/models/letter.ts`.

- [ ] **Step 3: Run the invariant to see whether the engine and the discrete algebra agree**

Run: `npx vitest run src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts -t "dataset invariant"`
Expected outcome is one of two, both informative:
- **PASS** — the engine and the discrete algebra agree at every endpoint across turns. The keystone's foundation is proven; proceed.
- **FAIL with a mismatch list** — the animation engine's endpoint staff angle diverges from the canonical `calculateEndOrientation` for some (family, turns) combination. This is a real, previously-hidden divergence between two independently-built subsystems, not a test bug. **Do not paper over it.** Capture the mismatch list, then determine which subsystem is wrong against MCP canon (`get_domain_topic("orientation-algebra")` — "half turns = 90° from start"): if the engine's fractional-turn accrual disagrees with canon, fix the engine's endpoint math; if the discrete algebra is wrong, fix that. Re-run until the invariant is green. Record the resolution in the plan's notes before continuing.

- [ ] **Step 4: Add halfway, off-lattice, and decidability tests**

Append to `orientation-at.test.ts`:

```ts
describe("calculateOrientationAt — halfway physical correctness", () => {
  it("halves a 0-turn anti shift to a 90deg (cardinal) orientation", () => {
    // anti base reverses in->out over the arc; at the midpoint it is 90deg = clock or counter.
    const out = calculateOrientationAt(
      {
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: "n",
        endLocation: "e",
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        turns: 0,
      },
      0.5
    );
    expect([Orientation.CLOCK, Orientation.COUNTER]).toContain(out);
  });

  it("halves a 0-turn pro shift back to the start orientation (base preserved)", () => {
    const out = calculateOrientationAt(
      {
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: "w",
        endLocation: "n",
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        turns: 0,
      },
      0.5
    );
    expect(out).toBe(Orientation.IN);
  });
});

describe("calculateOrientationAt — decidability boundary (spec §2)", () => {
  const base = {
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: "n" as const,
    endLocation: "e" as const,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
  };

  it("halving is on-lattice for half-integer turns (non-null)", () => {
    for (const turns of [0, 0.5, 1, 1.5, 2]) {
      expect(calculateOrientationAt({ ...base, turns }, 0.5)).not.toBeNull();
    }
  });

  it("halving an L6 quarter-turn is off-lattice (null)", () => {
    for (const turns of [0.25, 0.75]) {
      expect(calculateOrientationAt({ ...base, turns }, 0.5)).toBeNull();
    }
  });
});
```

- [ ] **Step 5: Run the full keystone suite**

Run: `npx vitest run src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts`
Expected: PASS — invariant + halfway + decidability all green. If the halfway pro case returns something other than `in`, the engine's base-preserve for pro is not holding at the midpoint — investigate the engine's `interpolatePropAngles` for pro before adjusting the test (the test encodes the domain truth, not the other way around).

- [ ] **Step 6: Cross-check one halfway value against the guide artboard (manual verification)**

The Level-2 `TwoTurnsShiftsPage` anti-halves strip renders the same engine call via `poseAt(m, 0.5).deg`. Pick one anti-halves frame, read its `poseAt` degrees, and confirm `orientationToStaffAngle(calculateOrientationAt(sameMotion, 0.5), centerPathAngle)` (in degrees) matches that drawn staff angle within a degree. Record the checked frame + values in the plan notes. (This is the "drawn staff is ground truth" check from spec §5.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/animation-engine/services/orientation-at.ts src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts
git commit -m "feat(orientation): calculateOrientationAt keystone — engine-grounded halfway orientation + dataset invariant" -- src/lib/shared/animation-engine/services/orientation-at.ts src/lib/shared/animation-engine/services/__tests__/orientation-at.test.ts
```

---

## Task 5: Phase-1 gate — full check + spec ledger

- [ ] **Step 1: Run the full type + test gate once**

Run: `npm run check > /tmp/check-p1.log 2>&1; npx vitest run src/lib/shared/render/core src/lib/shared/animation-engine`
Expected: 0 type errors introduced by this phase (grep the log: `grep -niE "orientation|angle-calculator" /tmp/check-p1.log`); all Phase-1 tests green. Fix anything red before proceeding.

- [ ] **Step 2: Mark Phase 1 ledger complete in the spec**

In `docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md`, tick the Phase 1 boxes in §11 (`calculateOrientationAt`, dataset invariant, halfway/off-lattice cases, guide-artboard cross-check). Note the invariant's outcome (clean pass, or the divergence + how it was reconciled).

- [ ] **Step 3: Commit the ledger update**

```bash
git add docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md
git commit -m "docs(spec): mark halved-pictograph Phase 1 ledger complete" -- docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md
```

---

## Self-Review

**Spec coverage (Phase 1 slice of §5):**
- `calculateOrientationAt(motion, t)` → Task 4. ✓
- Engine-grounded algorithm (sample `interpolatePropAngles`, invert via bijection) → Task 4 Step 1. ✓
- Angle↔orientation bijection (8-point, forward + inverse, off-lattice null) → Task 2. ✓
- Prerequisite bug 1 (`mapOrientationToAngle` cardinal-only) → Task 3. ✓
- Prerequisite bug 2 (`calculateEndOrientation` lowercasing) → Task 1. ✓
- `t=1` dataset invariant (the killer test) → Task 4 Step 2-3. ✓
- Off-lattice guard (`null`) → Task 2 (inverse) + Task 4 decidability test. ✓
- Decidability rule re-verified empirically → Task 4 Step 4. ✓
- Guide-artboard cross-check → Task 4 Step 6. ✓
- Center-family deferral stated → Task 4 Step 1 (returns null) + plan Scope. ✓

**Placeholder scan:** No TBD/TODO. Two explicit "verify the real member/property names before running" notes (enum interradial members in Task 3; `PictographData` accessors + `Letter` members in Task 4) — these are correct instructions to reconcile against real files at execution time, not placeholders for missing logic. The code they guard is complete.

**Type consistency:** `staffAngleToOrientation(staffAngle, centerPathAngle, epsilonSteps?)` and `orientationToStaffAngle(ori, centerPathAngle)` and `RADIAL_CYCLE` are defined in Task 2 and consumed identically in Tasks 3-4. `calculateOrientationAt(m, t, color?)` signature is stable across Task 4 tests. `canonicalOrientation` defined and used in Task 1. `OrientationAtInput` fields match `createMotionData`'s expected inputs (mirrored from `poseAt`).

**Known execution risk (flagged, not a gap):** the `t=1` invariant may fail on first run if the animation engine's fractional-turn endpoint accrual diverges from canonical `calculateEndOrientation`. That is an anticipated, valuable finding with a defined response in Task 4 Step 3 — reconcile against MCP canon, do not weaken the test. If it fails, Phase 1 is not "done" until the divergence is resolved; that resolution may itself be the highest-value bug fix this phase produces.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-halved-pictograph-phase-1-orientation-algebra.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
